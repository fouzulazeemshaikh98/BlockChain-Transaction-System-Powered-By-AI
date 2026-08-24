namespace AiBlockSystem.Api.Models;

public class TransactionAnalysis
{
    public int Id { get; set; }

    public int TransactionId { get; set; }
    public Transaction? Transaction { get; set; }

    public double SemanticScore { get; set; }
    public double TemplateScore { get; set; }
    public double ForensicScore { get; set; }
    public double BehavioralScore { get; set; }
    public double FinalRiskScore { get; set; }
    public string RiskLevel { get; set; } = string.Empty; // VERIFIED|LOW|MEDIUM|HIGH|CRITICAL
    public string Recommendation { get; set; } = string.Empty;

    public string? MatchedTemplateName { get; set; }
    public double? TemplateSimilarityScore { get; set; }
    public bool? TemplateIsMatch { get; set; }
    public string TemplateDeviationsJson { get; set; } = "[]";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Anomaly> Anomalies { get; set; } = new List<Anomaly>();
}
