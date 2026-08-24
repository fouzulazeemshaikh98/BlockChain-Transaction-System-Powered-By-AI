namespace AiBlockSystem.Api.Models;

public class Anomaly
{
    public int Id { get; set; }

    public int TransactionAnalysisId { get; set; }
    public TransactionAnalysis? TransactionAnalysis { get; set; }

    public string Type { get; set; } = string.Empty;
    public string Severity { get; set; } = string.Empty; // Low|Medium|High|Critical
    public double Confidence { get; set; }
    public string Description { get; set; } = string.Empty;
    public string Evidence { get; set; } = string.Empty;
}
