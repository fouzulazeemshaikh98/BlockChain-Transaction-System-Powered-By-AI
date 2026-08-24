namespace AiBlockSystem.Api.Dtos;

// ---- Exchanged with the FastAPI /api/noc/verify endpoint ----

public class AiNocExtractedFields
{
    public string? ApplicantName { get; set; }
    public string? OriginCity { get; set; }
    public string? OriginCountry { get; set; }
    public string? DestinationCity { get; set; }
    public string? DestinationCountry { get; set; }
    public string? IssuingAuthority { get; set; }
    public string? IssueDate { get; set; }
    public decimal? AuthorizedAmount { get; set; }
    public string RawText { get; set; } = string.Empty;
}

public class AiNocStampAnalysis
{
    public bool StampDetected { get; set; }
    public int[]? BoundingBox { get; set; }
    public double? Circularity { get; set; }
    public string? ColorLabel { get; set; }
}

public class AiNocForensicFlag
{
    public string Code { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string Severity { get; set; } = string.Empty;
}

public class AiNocVerificationResult
{
    public string DocumentHash { get; set; } = string.Empty;
    public string Verdict { get; set; } = string.Empty;
    public double AuthenticityScore { get; set; }
    public double RiskScore { get; set; }
    public AiNocExtractedFields Fields { get; set; } = new();
    public AiNocStampAnalysis Stamp { get; set; } = new();
    public List<AiNocForensicFlag> Flags { get; set; } = new();
    public double? CnnForgedProbability { get; set; }
    public string? CnnHeatmap { get; set; }
}

// ---- Exposed to the frontend ----

public class NocVerificationResponse
{
    public int NocDocumentId { get; set; }
    public string Verdict { get; set; } = string.Empty;
    public double AuthenticityScore { get; set; }
    public double RiskScore { get; set; }
    public bool TransferUnlocked { get; set; }
    public AiNocExtractedFields Fields { get; set; } = new();
    public AiNocStampAnalysis Stamp { get; set; } = new();
    public List<AiNocForensicFlag> Flags { get; set; } = new();
    public double? CnnForgedProbability { get; set; }
    public string? CnnHeatmap { get; set; }
    public decimal MonthlyUsed { get; set; }
    public decimal? MonthlyRemaining { get; set; }
}

public class NocDocumentSummary
{
    public int Id { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string Verdict { get; set; } = string.Empty;
    public double AuthenticityScore { get; set; }
    public double RiskScore { get; set; }
    public string? ApplicantName { get; set; }
    public string? OriginCity { get; set; }
    public string? OriginCountry { get; set; }
    public string? DestinationCity { get; set; }
    public string? DestinationCountry { get; set; }
    public decimal? AuthorizedAmount { get; set; }
    public decimal MonthlyUsed { get; set; }
    public decimal? MonthlyRemaining { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class DemoWalletDto
{
    public string Label { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public string AccountNumber { get; set; } = string.Empty;
    public string City { get; set; } = string.Empty;
    public string Country { get; set; } = string.Empty;
}

public class CreateTransferRequest
{
    public int NocDocumentId { get; set; }
    public string TransactionHash { get; set; } = string.Empty;
    public string Network { get; set; } = string.Empty;
    public string FromAddress { get; set; } = string.Empty;
    public string RecipientAddress { get; set; } = string.Empty;
    public string RecipientLabel { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public decimal GasUsed { get; set; }
    public decimal GasPrice { get; set; }
    public long Nonce { get; set; }
    public string? ContractAddress { get; set; }
    public string? FunctionName { get; set; }
    public string? Description { get; set; }
    public string? RawData { get; set; }
    public string Pin { get; set; } = string.Empty;
}

public class SettleRequest
{
    public string Pin { get; set; } = string.Empty;
}

public class ApproveRequest
{
    public string Pin { get; set; } = string.Empty;
}

public class SettlementResponse
{
    public int TransactionId { get; set; }
    public string SettlementStatus { get; set; } = string.Empty;
    public string? SettlementTxHash { get; set; }
    public string? SettlementError { get; set; }
}
