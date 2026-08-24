namespace AiBlockSystem.Api.Dtos;

public class CreateTransactionRequest
{
    public string TransactionHash { get; set; } = string.Empty;
    public string Network { get; set; } = string.Empty;
    public string FromAddress { get; set; } = string.Empty;
    public string ToAddress { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public decimal GasUsed { get; set; }
    public decimal GasPrice { get; set; }
    public long Nonce { get; set; }
    public DateTime? Timestamp { get; set; }
    public string? ContractAddress { get; set; }
    public string? FunctionName { get; set; }
    public string? Description { get; set; }
    public string? RawData { get; set; }
}

public class UpdateTransactionRequest : CreateTransactionRequest
{
}

public class TransactionResponse
{
    public int Id { get; set; }
    public string TransactionHash { get; set; } = string.Empty;
    public string Network { get; set; } = string.Empty;
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
    public string Status { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public int UserId { get; set; }

    public double? FinalRiskScore { get; set; }
    public string? RiskLevel { get; set; }

    public int? NocDocumentId { get; set; }
    public string? RecipientAddress { get; set; }
    public string? RecipientLabel { get; set; }
    public string SettlementStatus { get; set; } = string.Empty;
    public string? SettlementTxHash { get; set; }
    public string? SettlementError { get; set; }

    public string? ApprovedByName { get; set; }
    public DateTime? ApprovedAt { get; set; }
}
