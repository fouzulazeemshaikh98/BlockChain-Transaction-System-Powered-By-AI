namespace AiBlockSystem.Api.Models;

/// A sanctioned/blocked blockchain address. A match on a transaction's
/// FromAddress or ToAddress is a hard compliance override, not a scored
/// risk factor - see AnalysisOrchestrationService.AnalyzeAsync.
public class WatchlistEntry
{
    public int Id { get; set; }
    public string Address { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string? Reason { get; set; }

    public int AddedByUserId { get; set; }
    public User? AddedByUser { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
