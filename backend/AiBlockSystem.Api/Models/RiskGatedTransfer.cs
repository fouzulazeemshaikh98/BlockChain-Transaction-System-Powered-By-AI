namespace AiBlockSystem.Api.Models;

/// Entities for the risk-gated settlement flow (POST /api/transfers), as laid
/// out in the report's ERD (section 4.3) and schema (section 4.5). They live
/// alongside the older Transaction/NOC tables, which are left untouched.

public enum TransferStatus
{
    Scoring,
    Blocked,
    Submitted,
    Settled,
    Failed,
}

public class TransferRecord
{
    public int Id { get; set; }

    /// 32-byte id (0x-prefixed hex) - bound into the AI attestation and used
    /// by the contract for replay protection.
    public string TransferId { get; set; } = string.Empty;

    public int UserId { get; set; }
    public User? User { get; set; }

    public string Sender { get; set; } = string.Empty;
    public string Receiver { get; set; } = string.Empty;
    public string? ReceiverLabel { get; set; }
    public string Token { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string Chain { get; set; } = string.Empty;
    public long Nonce { get; set; }
    public string? Calldata { get; set; }

    public int RiskScore { get; set; }
    public string Decision { get; set; } = string.Empty; // APPROVE | BLOCK
    public string Findings { get; set; } = string.Empty;
    public TransferStatus Status { get; set; } = TransferStatus.Scoring;
    public string? L2TxHash { get; set; }
    public string? Error { get; set; }
    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;

    public RiskReport? RiskReport { get; set; }
    public SettlementRecord? Settlement { get; set; }
    public List<TemplateMatchResult> TemplateMatches { get; set; } = new();
}

public class RiskReport
{
    public int Id { get; set; }
    public int TransferRecordId { get; set; }
    public TransferRecord? TransferRecord { get; set; }
    public decimal FusedScore { get; set; }
    public string Decision { get; set; } = string.Empty;
    public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;
    public List<ModuleScore> ModuleScores { get; set; } = new();
}

public class ModuleScore
{
    public int Id { get; set; }
    public int RiskReportId { get; set; }
    public RiskReport? RiskReport { get; set; }
    public string ModuleName { get; set; } = string.Empty; // Behavioural | Template | Micro-Level
    public decimal Score { get; set; } // 0-100
    public string? FlaggedReason { get; set; }
}

public class TemplateMatchResult
{
    public int Id { get; set; }
    public int TransferRecordId { get; set; }
    public TransferRecord? TransferRecord { get; set; }
    public int? ProtocolTemplateId { get; set; }
    public ProtocolTemplate? ProtocolTemplate { get; set; }
    public string? MatchedFunction { get; set; }
    public decimal SimilarityScore { get; set; } // 0-100, 100 = matches the template exactly
    public string Deviations { get; set; } = string.Empty;
}

public class SettlementRecord
{
    public int Id { get; set; }
    public int TransferRecordId { get; set; }
    public TransferRecord? TransferRecord { get; set; }
    public string ContractAddress { get; set; } = string.Empty;
    /// keccak256 of the oracle's attestation signature (the signature itself
    /// is single-use and bound to this transfer).
    public string SignatureHash { get; set; } = string.Empty;
    public string TxHash { get; set; } = string.Empty;
    public DateTime SettledAt { get; set; } = DateTime.UtcNow;
    /// Only meaningful for withdrawals from an Optimistic Rollup back to L1
    /// (~7 days); null for settlements that stay on L2 / on a local chain.
    public DateTime? ChallengePeriodEnd { get; set; }
}
