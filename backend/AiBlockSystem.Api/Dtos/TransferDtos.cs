using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace AiBlockSystem.Api.Dtos;

/// Body of POST /api/transfers. Supply either ReceiverWalletId (one of the
/// Admin-managed recipient accounts) or a raw Receiver address.
public class TransferDto
{
    public int? ReceiverWalletId { get; set; }
    public string? Receiver { get; set; }

    [Range(typeof(decimal), "0.000001", "1000000000")]
    public decimal Amount { get; set; }

    [Required]
    public string Pin { get; set; } = string.Empty;

    // --- Optional overrides, mainly for testing attack scenarios --------
    /// Raw token calldata. Omitted = the backend builds the canonical
    /// ERC-20 transfer(receiver, amount) calldata itself.
    public string? Calldata { get; set; }
    public long? Nonce { get; set; }
    public long? GasPriceWei { get; set; }
    public long? GasLimit { get; set; }
    public long? ChainId { get; set; }
    /// Client ECDSA signature over the transfer payload (see
    /// ai-engine/services/transfer_checks.py:client_payload_digest).
    public string? Signature { get; set; }
}

public class TransferSummaryDto
{
    public int Id { get; set; }
    public string TransferId { get; set; } = string.Empty;
    public string Sender { get; set; } = string.Empty;
    public string Receiver { get; set; } = string.Empty;
    public string? ReceiverLabel { get; set; }
    public decimal Amount { get; set; }
    public string Chain { get; set; } = string.Empty;
    public int RiskScore { get; set; }
    public string Decision { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? L2TxHash { get; set; }
    public List<string> Findings { get; set; } = new();
    public DateTime CreatedUtc { get; set; }
}

public class TransferDetailDto : TransferSummaryDto
{
    public string Token { get; set; } = string.Empty;
    public long Nonce { get; set; }
    public string? Calldata { get; set; }
    public string? Error { get; set; }
    public List<ModuleScoreDto> ModuleScores { get; set; } = new();
    public string? MatchedTemplate { get; set; }
    public string? SettlementContract { get; set; }
    public DateTime? SettledAt { get; set; }
}

public class ModuleScoreDto
{
    public string ModuleName { get; set; } = string.Empty;
    public decimal Score { get; set; }
    public string? FlaggedReason { get; set; }
}

// ---- Wire format of the FastAPI /v1/risk/score endpoint (snake_case) ----

public class RiskScoreRequest
{
    [JsonPropertyName("transfer_id")] public string TransferId { get; set; } = string.Empty;
    [JsonPropertyName("sender")] public string Sender { get; set; } = string.Empty;
    [JsonPropertyName("token")] public string Token { get; set; } = string.Empty;
    [JsonPropertyName("receiver")] public string Receiver { get; set; } = string.Empty;
    [JsonPropertyName("amount")] public long Amount { get; set; }
    [JsonPropertyName("calldata")] public string Calldata { get; set; } = string.Empty;
    [JsonPropertyName("nonce")] public long Nonce { get; set; }
    [JsonPropertyName("gas_price")] public long GasPrice { get; set; }
    [JsonPropertyName("chain_id")] public long? ChainId { get; set; }
    [JsonPropertyName("gas_limit")] public long? GasLimit { get; set; }
    [JsonPropertyName("token_decimals")] public int TokenDecimals { get; set; } = 6;
    [JsonPropertyName("signature")] public string? Signature { get; set; }
    [JsonPropertyName("recent_amounts")] public List<long> RecentAmounts { get; set; } = new();
    [JsonPropertyName("tx_count_last_hour")] public int TxCountLastHour { get; set; }
    [JsonPropertyName("known_receiver")] public bool KnownReceiver { get; set; }
    [JsonPropertyName("recent_gas_prices")] public List<long> RecentGasPrices { get; set; } = new();
    [JsonPropertyName("allowed_functions")] public List<string> AllowedFunctions { get; set; } = new();
}

public class RiskModules
{
    [JsonPropertyName("behavioural")] public double Behavioural { get; set; }
    [JsonPropertyName("template")] public double Template { get; set; }
    [JsonPropertyName("micro")] public double Micro { get; set; }
    [JsonPropertyName("xgb_fraud_probability")] public double XgbFraudProbability { get; set; }
    [JsonPropertyName("isolation_anomaly")] public double IsolationAnomaly { get; set; }
    [JsonPropertyName("template_name")] public string? TemplateName { get; set; }
}

public class RiskAssessment
{
    [JsonPropertyName("risk_score")] public int RiskScore { get; set; }
    [JsonPropertyName("decision")] public string Decision { get; set; } = string.Empty;
    [JsonPropertyName("findings")] public List<string> Findings { get; set; } = new();
    [JsonPropertyName("expiry")] public long Expiry { get; set; }
    [JsonPropertyName("signature")] public string Signature { get; set; } = string.Empty;
    [JsonPropertyName("modules")] public RiskModules Modules { get; set; } = new();
    [JsonPropertyName("chain_id")] public long ChainId { get; set; }
    [JsonPropertyName("settlement_contract")] public string SettlementContract { get; set; } = string.Empty;
    [JsonPropertyName("oracle_address")] public string OracleAddress { get; set; } = string.Empty;
}
