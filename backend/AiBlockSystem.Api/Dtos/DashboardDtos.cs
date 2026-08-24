namespace AiBlockSystem.Api.Dtos;

public class DashboardSummaryResponse
{
    public int TotalTransactions { get; set; }
    public int VerifiedTransactions { get; set; }
    public int HighRiskTransactions { get; set; } // HIGH or CRITICAL
    public double AverageRiskScore { get; set; }
    public List<TransactionResponse> RecentTransactions { get; set; } = new();
}

public class DashboardTrendPoint
{
    public DateOnly Date { get; set; }
    public int TransactionCount { get; set; }
    public double? AverageRiskScore { get; set; }
}
