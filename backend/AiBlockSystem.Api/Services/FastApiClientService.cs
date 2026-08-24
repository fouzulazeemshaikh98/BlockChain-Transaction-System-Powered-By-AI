using System.Diagnostics;
using System.Text;
using System.Text.Json;
using AiBlockSystem.Api.Data;
using AiBlockSystem.Api.Dtos;
using AiBlockSystem.Api.Models;
using Microsoft.Extensions.Options;

namespace AiBlockSystem.Api.Services;

public class AiEngineOptions
{
    public string BaseUrl { get; set; } = "http://localhost:8000";
}

/// Thin wrapper over the FastAPI AI engine's five /api/analyze/* endpoints.
/// Every call is logged to AIAnalysisLog (request/response JSON, status,
/// elapsed time) regardless of success or failure, satisfying the spec's
/// AI-analysis-log requirement without a separate logging layer.
public class FastApiClientService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private readonly HttpClient _httpClient;
    private readonly AppDbContext _db;

    public FastApiClientService(HttpClient httpClient, IOptions<AiEngineOptions> options, AppDbContext db)
    {
        _httpClient = httpClient;
        _httpClient.BaseAddress = new Uri(options.Value.BaseUrl);
        _db = db;
    }

    public Task<AiNormalizedTransaction> PreprocessAsync(int transactionId, AiRawTransaction raw) =>
        CallAsync<AiRawTransaction, AiNormalizedTransaction>(transactionId, "preprocess", "/api/analyze/preprocess", raw);

    public Task<AiSemanticResponse> SemanticAsync(int transactionId, AiNormalizedTransaction tx) =>
        CallAsync<AiSemanticRequest, AiSemanticResponse>(
            transactionId, "semantic", "/api/analyze/semantic", new AiSemanticRequest { Transaction = tx }
        );

    public Task<AiTemplateResponse> TemplateAsync(
        int transactionId, AiNormalizedTransaction tx, List<AiProtocolTemplateDto> activeTemplates
    ) =>
        CallAsync<AiTemplateRequest, AiTemplateResponse>(
            transactionId,
            "template",
            "/api/analyze/template",
            new AiTemplateRequest { Transaction = tx, ActiveTemplates = activeTemplates }
        );

    public Task<AiForensicsResponse> ForensicsAsync(
        int transactionId, AiNormalizedTransaction tx, List<AiHistoryEntry> recentHistory
    ) =>
        CallAsync<AiForensicsRequest, AiForensicsResponse>(
            transactionId,
            "forensics",
            "/api/analyze/forensics",
            new AiForensicsRequest { Transaction = tx, RecentHistory = recentHistory }
        );

    public Task<AiRiskResponse> RiskAsync(int transactionId, AiRiskRequest request) =>
        CallAsync<AiRiskRequest, AiRiskResponse>(transactionId, "risk", "/api/analyze/risk", request);

    /// NOC verification happens before any Transaction row exists (it gates
    /// whether one gets created at all in the "Send Transfer" flow), so this
    /// doesn't go through CallAsync's AIAnalysisLog write - that log is
    /// scoped to a TransactionId by schema.
    public async Task<AiNocVerificationResult> VerifyNocAsync(Stream fileStream, string fileName, string contentType)
    {
        using var content = new MultipartFormDataContent();
        using var streamContent = new StreamContent(fileStream);
        streamContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(
            string.IsNullOrEmpty(contentType) ? "application/octet-stream" : contentType
        );
        content.Add(streamContent, "file", fileName);

        var response = await _httpClient.PostAsync("/api/noc/verify", content);
        var responseJson = await response.Content.ReadAsStringAsync();
        response.EnsureSuccessStatusCode();

        var result = JsonSerializer.Deserialize<AiNocVerificationResult>(responseJson, JsonOptions);
        return result ?? throw new InvalidOperationException("AI engine returned an empty NOC verification response.");
    }

    private async Task<TResponse> CallAsync<TRequest, TResponse>(
        int transactionId, string moduleName, string path, TRequest request
    )
    {
        var stopwatch = Stopwatch.StartNew();
        var requestJson = JsonSerializer.Serialize(request, JsonOptions);
        var status = "Success";
        var responseJson = string.Empty;

        try
        {
            using var content = new StringContent(requestJson, Encoding.UTF8, "application/json");
            var httpResponse = await _httpClient.PostAsync(path, content);
            responseJson = await httpResponse.Content.ReadAsStringAsync();
            httpResponse.EnsureSuccessStatusCode();

            var result = JsonSerializer.Deserialize<TResponse>(responseJson, JsonOptions);
            return result ?? throw new InvalidOperationException($"AI engine returned an empty response for '{moduleName}'.");
        }
        catch (Exception ex)
        {
            status = "Error";
            if (string.IsNullOrEmpty(responseJson))
            {
                responseJson = ex.Message;
            }
            throw;
        }
        finally
        {
            stopwatch.Stop();
            _db.AIAnalysisLogs.Add(
                new AIAnalysisLog
                {
                    TransactionId = transactionId,
                    ModuleName = moduleName,
                    RequestPayload = requestJson,
                    ResponsePayload = responseJson,
                    Status = status,
                    ProcessingTimeMs = stopwatch.ElapsedMilliseconds,
                }
            );
            await _db.SaveChangesAsync();
        }
    }
}
