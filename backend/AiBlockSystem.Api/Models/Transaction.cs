namespace AiBlockSystem.Api.Models;

public enum TransactionStatus
{
    Pending,
    Analyzing,
    Verified,
    Flagged,
    Rejected,
}

public enum SettlementStatus
{
    NotAttempted,
    Executed,
    Failed,
    Blocked,
}

public class Transaction
{
    public int Id { get; set; }
    public string TransactionHash { get; set; } = string.Empty;
    public string Network { get; set; } = string.Empty; // Ethereum | Arbitrum | Optimism | Polygon
    public string FromAddress { get; set; } = string.Empty;
    public string ToAddress { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public decimal GasUsed { get; set; }
    public decimal GasPrice { get; set; }
    public long Nonce { get; set; }
    public DateTime Timestamp { get; set; }
    public string? ContractAddress { get; set; }
    public string? FunctionName { get; set; }
    public string? Description { get; set; }
    public string? RawData { get; set; } // raw JSON/HEX payload, used for entropy analysis
    public TransactionStatus Status { get; set; } = TransactionStatus.Pending;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public int UserId { get; set; }
    public User? User { get; set; }

    public TransactionAnalysis? Analysis { get; set; }

    /// Set when this transaction was initiated through the NOC-gated "Send
    /// Transfer" flow rather than submitted for standalone analysis.
    public int? NocDocumentId { get; set; }
    public NocDocument? NocDocument { get; set; }

    public string? RecipientAddress { get; set; }
    public string? RecipientLabel { get; set; }
    public string? SettlementTxHash { get; set; }
    public SettlementStatus SettlementStatus { get; set; } = SettlementStatus.NotAttempted;
    public string? SettlementError { get; set; }

    /// Maker-checker sign-off for MEDIUM-risk settlements - set via
    /// POST /api/transactions/{id}/approve, required by Settle() before a
    /// MEDIUM-risk transfer can move on-chain. VERIFIED/LOW never need
    /// this; HIGH/CRITICAL are blocked outright regardless of it.
    public int? ApprovedByUserId { get; set; }
    public User? ApprovedByUser { get; set; }
    public DateTime? ApprovedAt { get; set; }
}
