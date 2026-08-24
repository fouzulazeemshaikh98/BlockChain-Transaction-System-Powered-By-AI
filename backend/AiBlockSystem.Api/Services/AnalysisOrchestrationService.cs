using System.Text.Json;
using AiBlockSystem.Api.Data;
using AiBlockSystem.Api.Dtos;
using AiBlockSystem.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace AiBlockSystem.Api.Services;

/// The 12-step pipeline: store -> preprocess -> semantic -> template
/// (against active DB templates) -> forensics (against this sender's recent
/// history) -> risk (weighted combination + behavioral scoring) -> persist
/// TransactionAnalysis + Anomaly rows -> return the assembled result.
public class AnalysisOrchestrationService
{
    private const int RecentHistoryLimit = 20;

    private readonly AppDbContext _db;
    private readonly FastApiClientService _aiClient;
    private readonly ProtocolTemplateService _templates;
    private readonly RiskThresholdService _thresholds;

    public AnalysisOrchestrationService(
        AppDbContext db, FastApiClientService aiClient, ProtocolTemplateService templates, RiskThresholdService thresholds
    )
    {
        _db = db;
        _aiClient = aiClient;
        _templates = templates;
        _thresholds = thresholds;
    }

    public async Task<AnalysisResponse> AnalyzeAsync(int transactionId)
    {
        var transaction = await _db.Transactions.FindAsync(transactionId)
            ?? throw new KeyNotFoundException($"Transaction {transactionId} not found.");

        transaction.Status = TransactionStatus.Analyzing;
        await _db.SaveChangesAsync();

        var watchlistHit = await FindWatchlistMatchAsync(transaction.FromAddress, transaction.ToAddress);
        if (watchlistHit is not null)
        {
            return await ApplyWatchlistOverrideAsync(transaction, watchlistHit);
        }

        var normalized = await _aiClient.PreprocessAsync(
            transactionId,
            new AiRawTransaction
            {
                TransactionHash = transaction.TransactionHash,
                Network = transaction.Network,
                FromAddress = transaction.FromAddress,
                ToAddress = transaction.ToAddress,
                Amount = transaction.Amount,
                GasUsed = transaction.GasUsed,
                GasPrice = transaction.GasPrice,
                Nonce = transaction.Nonce,
                Timestamp = transaction.Timestamp.ToString("O"),
                ContractAddress = transaction.ContractAddress,
                FunctionName = transaction.FunctionName,
                Description = transaction.Description,
                RawData = transaction.RawData,
            }
        );

        var semantic = await _aiClient.SemanticAsync(transactionId, normalized);

        var activeTemplates = await _templates.GetActiveTemplatesForEngineAsync(transaction.Network);
        var templateResult = await _aiClient.TemplateAsync(transactionId, normalized, activeTemplates);
        // Similarity is "higher = better"; the risk engine wants "higher = worse".
        var templateRiskScore = 100.0 - templateResult.SimilarityScore;

        var recentHistory = await GetRecentHistoryAsync(transaction);
        var forensics = await _aiClient.ForensicsAsync(transactionId, normalized, recentHistory);

        var risk = await _aiClient.RiskAsync(
            transactionId,
            new AiRiskRequest
            {
                ModuleScores = new AiModuleScores
                {
                    Semantic = semantic.SemanticScore,
                    Template = templateRiskScore,
                    Forensics = forensics.ForensicScore,
                    Behavioral = 0, // computed server-side by the risk engine itself
                },
                CurrentFeatures = new AiBehavioralFeatures
                {
                    Amount = transaction.Amount,
                    GasUsed = transaction.GasUsed,
                    GasPrice = transaction.GasPrice,
                },
                HistoricalFeatures = recentHistory
                    .Select(h => new AiBehavioralFeatures { Amount = h.Amount, GasUsed = h.GasUsed, GasPrice = h.GasPrice })
                    .ToList(),
                Thresholds = await _thresholds.GetAsync(),
            }
        );

        var analysis = await _db.TransactionAnalyses
            .Include(a => a.Anomalies)
            .FirstOrDefaultAsync(a => a.TransactionId == transactionId);

        if (analysis is null)
        {
            analysis = new TransactionAnalysis { TransactionId = transactionId };
            _db.TransactionAnalyses.Add(analysis);
        }
        else
        {
            _db.Anomalies.RemoveRange(analysis.Anomalies);
        }

        analysis.SemanticScore = semantic.SemanticScore;
        analysis.TemplateScore = templateRiskScore;
        analysis.ForensicScore = forensics.ForensicScore;
        analysis.BehavioralScore = risk.BehavioralScore;
        analysis.FinalRiskScore = risk.RiskScore;
        analysis.RiskLevel = risk.RiskLevel;
        analysis.Recommendation = risk.Recommendation;
        analysis.MatchedTemplateName = templateResult.TemplateName;
        analysis.TemplateSimilarityScore = templateResult.SimilarityScore;
        analysis.TemplateIsMatch = templateResult.IsMatch;
        analysis.TemplateDeviationsJson = JsonSerializer.Serialize(templateResult.Deviations);
        analysis.CreatedAt = DateTime.UtcNow;

        analysis.Anomalies = forensics.Anomalies
            .Select(a => new Anomaly
            {
                Type = a.Type,
                Severity = a.Severity,
                Confidence = a.Confidence,
                Description = a.Description,
                Evidence = a.Evidence,
            })
            .ToList();

        transaction.Status = risk.RiskLevel is "HIGH" or "CRITICAL"
            ? TransactionStatus.Flagged
            : TransactionStatus.Verified;

        await _db.SaveChangesAsync();

        return new AnalysisResponse
        {
            TransactionId = transactionId,
            SemanticScore = analysis.SemanticScore,
            TemplateScore = analysis.TemplateScore,
            ForensicScore = analysis.ForensicScore,
            BehavioralScore = analysis.BehavioralScore,
            FinalRiskScore = analysis.FinalRiskScore,
            RiskLevel = analysis.RiskLevel,
            Recommendation = analysis.Recommendation,
            MatchedTemplateName = analysis.MatchedTemplateName,
            TemplateSimilarityScore = analysis.TemplateSimilarityScore,
            TemplateIsMatch = analysis.TemplateIsMatch,
            TemplateDeviations = templateResult.Deviations,
            Anomalies = analysis.Anomalies
                .Select(a => new AnomalyResponse
                {
                    Type = a.Type,
                    Severity = a.Severity,
                    Confidence = a.Confidence,
                    Description = a.Description,
                    Evidence = a.Evidence,
                })
                .ToList(),
            CreatedAt = analysis.CreatedAt,
        };
    }

    /// A sanctions/watchlist hit is a hard compliance override, not a
    /// scored risk factor - same philosophy as the NOC authorized-amount
    /// check on the document-verification side. No module scoring needed:
    /// the AI engine is never even called.
    private async Task<WatchlistEntry?> FindWatchlistMatchAsync(string fromAddress, string toAddress)
    {
        var from = fromAddress.ToLowerInvariant();
        var to = toAddress.ToLowerInvariant();
        return await _db.WatchlistEntries
            .FirstOrDefaultAsync(w => w.Address.ToLower() == from || w.Address.ToLower() == to);
    }

    private async Task<AnalysisResponse> ApplyWatchlistOverrideAsync(Transaction transaction, WatchlistEntry hit)
    {
        var analysis = await _db.TransactionAnalyses
            .Include(a => a.Anomalies)
            .FirstOrDefaultAsync(a => a.TransactionId == transaction.Id);

        if (analysis is null)
        {
            analysis = new TransactionAnalysis { TransactionId = transaction.Id };
            _db.TransactionAnalyses.Add(analysis);
        }
        else
        {
            _db.Anomalies.RemoveRange(analysis.Anomalies);
        }

        var recommendation =
            $"Address {hit.Address} ({hit.Label}) is on the sanctions/watchlist"
            + (string.IsNullOrWhiteSpace(hit.Reason) ? "." : $": {hit.Reason}.")
            + " Settlement must be blocked pending compliance review.";

        analysis.SemanticScore = 100;
        analysis.TemplateScore = 100;
        analysis.ForensicScore = 100;
        analysis.BehavioralScore = 100;
        analysis.FinalRiskScore = 100;
        analysis.RiskLevel = "CRITICAL";
        analysis.Recommendation = recommendation;
        analysis.MatchedTemplateName = null;
        analysis.TemplateSimilarityScore = null;
        analysis.TemplateIsMatch = null;
        analysis.TemplateDeviationsJson = "[]";
        analysis.CreatedAt = DateTime.UtcNow;
        analysis.Anomalies = new List<Anomaly>
        {
            new()
            {
                Type = "WatchlistMatch",
                Severity = "Critical",
                Confidence = 1.0,
                Description = $"{(transaction.FromAddress.Equals(hit.Address, StringComparison.OrdinalIgnoreCase) ? "Sender" : "Recipient")} address matches a sanctions/watchlist entry: {hit.Label}.",
                Evidence = hit.Reason ?? hit.Address,
            },
        };

        transaction.Status = TransactionStatus.Flagged;
        await _db.SaveChangesAsync();

        return new AnalysisResponse
        {
            TransactionId = transaction.Id,
            SemanticScore = analysis.SemanticScore,
            TemplateScore = analysis.TemplateScore,
            ForensicScore = analysis.ForensicScore,
            BehavioralScore = analysis.BehavioralScore,
            FinalRiskScore = analysis.FinalRiskScore,
            RiskLevel = analysis.RiskLevel,
            Recommendation = analysis.Recommendation,
            MatchedTemplateName = null,
            TemplateSimilarityScore = null,
            TemplateIsMatch = null,
            TemplateDeviations = new List<string>(),
            Anomalies = analysis.Anomalies
                .Select(a => new AnomalyResponse
                {
                    Type = a.Type,
                    Severity = a.Severity,
                    Confidence = a.Confidence,
                    Description = a.Description,
                    Evidence = a.Evidence,
                })
                .ToList(),
            CreatedAt = analysis.CreatedAt,
        };
    }

    private async Task<List<AiHistoryEntry>> GetRecentHistoryAsync(Transaction current)
    {
        var history = await _db.Transactions
            .Where(t => t.FromAddress == current.FromAddress && t.Id != current.Id)
            .OrderByDescending(t => t.Timestamp)
            .Take(RecentHistoryLimit)
            .ToListAsync();

        return history
            .Select(t => new AiHistoryEntry
            {
                TransactionHash = t.TransactionHash,
                Nonce = t.Nonce,
                GasUsed = t.GasUsed,
                GasPrice = t.GasPrice,
                Timestamp = t.Timestamp.ToString("O"),
                RawData = t.RawData ?? "",
                FunctionName = t.FunctionName ?? "",
                ToAddress = t.ToAddress,
                Amount = t.Amount,
            })
            .ToList();
    }
}
