using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Numerics;
using AiBlockSystem.Api.Dtos;
using Microsoft.Extensions.Options;
using Nethereum.ABI.FunctionEncoding.Attributes;
using Nethereum.Contracts;
using Nethereum.Hex.HexConvertors.Extensions;
using Nethereum.Util;
using Nethereum.Web3;
using Nethereum.Web3.Accounts;

namespace AiBlockSystem.Api.Services;

public class RiskGatedOptions
{
    /// Auto-filled from contracts/deployments/localhost.json when present.
    public string SettlementContractAddress { get; set; } = string.Empty;
    public string TokenAddress { get; set; } = string.Empty;
    public string ChainName { get; set; } = "Hardhat (local)";
}

// ---------------------------------------------------------------------------
// Risk engine client - calls the FastAPI risk oracle (POST /v1/risk/score)
// ---------------------------------------------------------------------------

public interface IRiskEngineClient
{
    Task<RiskAssessment> ScoreAsync(RiskScoreRequest request, string bearerToken, CancellationToken ct);
}

public class RiskEngineUnavailableException(string message, Exception? inner = null) : Exception(message, inner);

public class RiskEngineClient : IRiskEngineClient
{
    private readonly HttpClient _http;

    public RiskEngineClient(HttpClient http, IOptions<AiEngineOptions> options)
    {
        _http = http;
        _http.BaseAddress = new Uri(options.Value.BaseUrl);
        _http.Timeout = TimeSpan.FromSeconds(30);
    }

    public async Task<RiskAssessment> ScoreAsync(RiskScoreRequest request, string bearerToken, CancellationToken ct)
    {
        using var message = new HttpRequestMessage(HttpMethod.Post, "/v1/risk/score")
        {
            Content = JsonContent.Create(request),
        };
        // The engine validates the same JWT the user authenticated with.
        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearerToken);

        HttpResponseMessage response;
        try
        {
            response = await _http.SendAsync(message, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            throw new RiskEngineUnavailableException("AI risk engine is unreachable.", ex);
        }

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            throw new RiskEngineUnavailableException($"AI risk engine returned {(int)response.StatusCode}: {body}");
        }

        return await response.Content.ReadFromJsonAsync<RiskAssessment>(cancellationToken: ct)
            ?? throw new RiskEngineUnavailableException("AI risk engine returned an empty response.");
    }
}

// ---------------------------------------------------------------------------
// Settlement service - submits settle() to RiskGatedSettlement
// ---------------------------------------------------------------------------

[Function("settle")]
public class SettleFunction : FunctionMessage
{
    [Parameter("address", "token", 1)] public string Token { get; set; } = string.Empty;
    [Parameter("address", "to", 2)] public string To { get; set; } = string.Empty;
    [Parameter("uint256", "amount", 3)] public BigInteger Amount { get; set; }
    [Parameter("bytes32", "transferId", 4)] public byte[] TransferId { get; set; } = Array.Empty<byte>();
    [Parameter("uint8", "riskScore", 5)] public byte RiskScore { get; set; }
    [Parameter("uint256", "expiry", 6)] public BigInteger Expiry { get; set; }
    [Parameter("bytes", "oracleSig", 7)] public byte[] OracleSig { get; set; } = Array.Empty<byte>();
}

[Event("Blocked")]
public class BlockedEventDto : IEventDTO
{
    [Parameter("bytes32", "transferId", 1, true)] public byte[] TransferId { get; set; } = Array.Empty<byte>();
    [Parameter("address", "from", 2, false)] public string From { get; set; } = string.Empty;
    [Parameter("uint8", "score", 3, false)] public byte Score { get; set; }
}

public record SettlementResult(string TxHash, bool BlockedOnChain);

public interface ISettlementService
{
    /// The wallet that pays settlements (msg.sender of settle()); it is
    /// also the `sender` the AI attestation must be bound to.
    string PayerAddress { get; }
    string SettlementContract { get; }
    string TokenAddress { get; }
    Task<SettlementResult> SubmitAsync(string receiver, long amountUnits, string transferIdHex, RiskAssessment assessment, CancellationToken ct);
    Task<long> GetGasPriceWeiAsync();
}

public class SettlementService : ISettlementService
{
    private readonly Web3 _web3;
    private readonly RiskGatedOptions _options;

    public SettlementService(IOptions<BlockchainOptions> chain, IOptions<RiskGatedOptions> options)
    {
        _options = options.Value;
        var account = new Account(chain.Value.VerifierPrivateKey);
        PayerAddress = account.Address;
        _web3 = new Web3(account, chain.Value.RpcUrl);
    }

    public string PayerAddress { get; }
    public string SettlementContract => _options.SettlementContractAddress;
    public string TokenAddress => _options.TokenAddress;

    public async Task<long> GetGasPriceWeiAsync()
    {
        var price = await _web3.Eth.GasPrice.SendRequestAsync();
        return (long)price.Value;
    }

    public async Task<SettlementResult> SubmitAsync(
        string receiver, long amountUnits, string transferIdHex, RiskAssessment assessment, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(SettlementContract) || string.IsNullOrWhiteSpace(TokenAddress))
        {
            throw new InvalidOperationException(
                "RiskGatedSettlement / token address not configured. Run `npm run deploy:local` in contracts/.");
        }
        if (!AddressUtil.Current.AreAddressesTheSame(assessment.SettlementContract, SettlementContract))
        {
            throw new InvalidOperationException(
                $"Risk engine signed for contract {assessment.SettlementContract} but the backend settles on {SettlementContract}. Restart the AI engine after redeploying.");
        }

        var function = new SettleFunction
        {
            Token = TokenAddress,
            To = receiver,
            Amount = amountUnits,
            TransferId = transferIdHex.HexToByteArray(),
            RiskScore = (byte)assessment.RiskScore,
            Expiry = assessment.Expiry,
            OracleSig = assessment.Signature.HexToByteArray(),
        };

        var handler = _web3.Eth.GetContractTransactionHandler<SettleFunction>();
        var receipt = await handler.SendRequestAndWaitForReceiptAsync(SettlementContract, function, ct);
        if (receipt.Status?.Value != 1)
        {
            throw new InvalidOperationException($"settle() reverted: {receipt.TransactionHash}");
        }

        var blocked = receipt.DecodeAllEvents<BlockedEventDto>().Count > 0;
        return new SettlementResult(receipt.TransactionHash, blocked);
    }
}
