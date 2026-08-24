namespace AiBlockSystem.Api.Dtos;

// ---- DTOs exchanged with the FastAPI AI engine (PascalCase here, serialized
// as camelCase on the wire via FastApiClientService's JsonSerializerOptions -
// matches the Pydantic CamelModel base on the Python side). ----

public class AiRawTransaction
{
    public string TransactionHash { get; set; } = string.Empty;
    public string Network { get; set; } = string.Empty;
    public string FromAddress { get; set; } = string.Empty;
    public string ToAddress { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public decimal GasUsed { get; set; }
    public decimal GasPrice { get; set; }
    public long Nonce { get; set; }
    public string? Timestamp { get; set; }
    public string? ContractAddress { get; set; }
    public string? FunctionName { get; set; }
    public string? Description { get; set; }
    public string? RawData { get; set; }
}

public class AiNormalizedTransaction
{
    public string TransactionHash { get; set; } = string.Empty;
    public string Network { get; set; } = string.Empty;
    public string FromAddress { get; set; } = string.Empty;
    public string ToAddress { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public decimal GasUsed { get; set; }
    public decimal GasPrice { get; set; }
    public long Nonce { get; set; }
    public string Timestamp { get; set; } = string.Empty;
    public string? ContractAddress { get; set; }
    public string FunctionName { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string RawData { get; set; } = string.Empty;
}

public class AiSemanticRequest
{
    public AiNormalizedTransaction Transaction { get; set; } = new();
}

public class AiSemanticResponse
{
    public double SemanticScore { get; set; }
    public List<string> Issues { get; set; } = new();
    public string Explanation { get; set; } = string.Empty;
    public double Confidence { get; set; }
}

public class AiProtocolTemplateDto
{
    public string Name { get; set; } = string.Empty;
    public string Network { get; set; } = string.Empty;
    public List<string> ExpectedContracts { get; set; } = new();
    public List<string> ExpectedFunctions { get; set; } = new();
    public List<string> ExpectedRoutingPath { get; set; } = new();
}

public class AiTemplateRequest
{
    public AiNormalizedTransaction Transaction { get; set; } = new();
    public List<AiProtocolTemplateDto> ActiveTemplates { get; set; } = new();
}

public class AiTemplateResponse
{
    public string? TemplateName { get; set; }
    public double SimilarityScore { get; set; }
    public bool IsMatch { get; set; }
    public List<string> Deviations { get; set; } = new();
}

public class AiHistoryEntry
{
    public string TransactionHash { get; set; } = string.Empty;
    public long Nonce { get; set; }
    public decimal GasUsed { get; set; }
    public decimal GasPrice { get; set; }
    public string Timestamp { get; set; } = string.Empty;
    public string RawData { get; set; } = string.Empty;
    public string FunctionName { get; set; } = string.Empty;
    public string ToAddress { get; set; } = string.Empty;
    public decimal Amount { get; set; }
}

public class AiForensicsRequest
{
    public AiNormalizedTransaction Transaction { get; set; } = new();
    public List<AiHistoryEntry> RecentHistory { get; set; } = new();
}

public class AiAnomalyDto
{
    public string Type { get; set; } = string.Empty;
    public string Severity { get; set; } = string.Empty;
    public double Confidence { get; set; }
    public string Description { get; set; } = string.Empty;
    public string Evidence { get; set; } = string.Empty;
}

public class AiForensicsResponse
{
    public double ForensicScore { get; set; }
    public List<AiAnomalyDto> Anomalies { get; set; } = new();
}

public class AiModuleScores
{
    public double Semantic { get; set; }
    public double Template { get; set; }
    public double Forensics { get; set; }
    public double Behavioral { get; set; }
}

public class AiBehavioralFeatures
{
    public decimal Amount { get; set; }
    public decimal GasUsed { get; set; }
    public decimal GasPrice { get; set; }
}

public class AiRiskThresholds
{
    public double Verified { get; set; } = 20;
    public double Low { get; set; } = 40;
    public double Medium { get; set; } = 60;
    public double High { get; set; } = 80;
}

public class AiRiskRequest
{
    public AiModuleScores ModuleScores { get; set; } = new();
    public AiBehavioralFeatures CurrentFeatures { get; set; } = new();
    public List<AiBehavioralFeatures> HistoricalFeatures { get; set; } = new();
    public AiRiskThresholds? Thresholds { get; set; }
}

public class AiRiskResponse
{
    public double RiskScore { get; set; }
    public string RiskLevel { get; set; } = string.Empty;
    public string Recommendation { get; set; } = string.Empty;
    public AiModuleScores ModuleScores { get; set; } = new();
    public double BehavioralScore { get; set; }
}

// ---- DTOs exposed to the (future) frontend, assembled from the above ----

public class AnomalyResponse
{
    public string Type { get; set; } = string.Empty;
    public string Severity { get; set; } = string.Empty;
    public double Confidence { get; set; }
    public string Description { get; set; } = string.Empty;
    public string Evidence { get; set; } = string.Empty;
}

public class AnalysisResponse
{
    public int TransactionId { get; set; }
    public double SemanticScore { get; set; }
    public double TemplateScore { get; set; }
    public double ForensicScore { get; set; }
    public double BehavioralScore { get; set; }
    public double FinalRiskScore { get; set; }
    public string RiskLevel { get; set; } = string.Empty;
    public string Recommendation { get; set; } = string.Empty;
    public string? MatchedTemplateName { get; set; }
    public double? TemplateSimilarityScore { get; set; }
    public bool? TemplateIsMatch { get; set; }
    public List<string> TemplateDeviations { get; set; } = new();
    public List<AnomalyResponse> Anomalies { get; set; } = new();
    public DateTime CreatedAt { get; set; }
}

public class ReportResponse
{
    public TransactionResponse Transaction { get; set; } = new();
    public AnalysisResponse? Analysis { get; set; }
}
