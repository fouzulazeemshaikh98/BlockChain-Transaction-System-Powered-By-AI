namespace AiBlockSystem.Api.Models;

public class AIAnalysisLog
{
    public int Id { get; set; }

    public int TransactionId { get; set; }
    public Transaction? Transaction { get; set; }

    public string ModuleName { get; set; } = string.Empty; // preprocess|semantic|template|forensics|risk
    public string RequestPayload { get; set; } = string.Empty;
    public string ResponsePayload { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty; // Success|Error
    public long ProcessingTimeMs { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
