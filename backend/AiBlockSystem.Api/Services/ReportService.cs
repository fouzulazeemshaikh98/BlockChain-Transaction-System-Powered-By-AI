using System.Text.Json;
using AiBlockSystem.Api.Data;
using AiBlockSystem.Api.Dtos;
using AiBlockSystem.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace AiBlockSystem.Api.Services;

public class ReportService
{
    private readonly AppDbContext _db;

    public ReportService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<ReportResponse?> GetReportAsync(int transactionId)
    {
        var transaction = await _db.Transactions
            .Include(t => t.Analysis)
            .ThenInclude(a => a!.Anomalies)
            .Include(t => t.ApprovedByUser)
            .FirstOrDefaultAsync(t => t.Id == transactionId);

        if (transaction is null) return null;

        return new ReportResponse
        {
            Transaction = ToTransactionResponse(transaction),
            Analysis = transaction.Analysis is null ? null : ToAnalysisResponse(transaction.Analysis),
        };
    }

    public static TransactionResponse ToTransactionResponse(Transaction t) =>
        new()
        {
            Id = t.Id,
            TransactionHash = t.TransactionHash,
            Network = t.Network,
            FromAddress = t.FromAddress,
            ToAddress = t.ToAddress,
            Amount = t.Amount,
            GasUsed = t.GasUsed,
            GasPrice = t.GasPrice,
            Nonce = t.Nonce,
            Timestamp = t.Timestamp,
            ContractAddress = t.ContractAddress,
            FunctionName = t.FunctionName,
            Description = t.Description,
            Status = t.Status.ToString(),
            CreatedAt = t.CreatedAt,
            UserId = t.UserId,
            FinalRiskScore = t.Analysis?.FinalRiskScore,
            RiskLevel = t.Analysis?.RiskLevel,
            NocDocumentId = t.NocDocumentId,
            RecipientAddress = t.RecipientAddress,
            RecipientLabel = t.RecipientLabel,
            SettlementStatus = t.SettlementStatus.ToString(),
            SettlementTxHash = t.SettlementTxHash,
            SettlementError = t.SettlementError,
            ApprovedByName = t.ApprovedByUser?.FullName,
            ApprovedAt = t.ApprovedAt,
        };

    public static AnalysisResponse ToAnalysisResponse(TransactionAnalysis a) =>
        new()
        {
            TransactionId = a.TransactionId,
            SemanticScore = a.SemanticScore,
            TemplateScore = a.TemplateScore,
            ForensicScore = a.ForensicScore,
            BehavioralScore = a.BehavioralScore,
            FinalRiskScore = a.FinalRiskScore,
            RiskLevel = a.RiskLevel,
            Recommendation = a.Recommendation,
            MatchedTemplateName = a.MatchedTemplateName,
            TemplateSimilarityScore = a.TemplateSimilarityScore,
            TemplateIsMatch = a.TemplateIsMatch,
            TemplateDeviations = JsonSerializer.Deserialize<List<string>>(a.TemplateDeviationsJson) ?? new(),
            Anomalies = a.Anomalies
                .Select(an => new AnomalyResponse
                {
                    Type = an.Type,
                    Severity = an.Severity,
                    Confidence = an.Confidence,
                    Description = an.Description,
                    Evidence = an.Evidence,
                })
                .ToList(),
            CreatedAt = a.CreatedAt,
        };
}
