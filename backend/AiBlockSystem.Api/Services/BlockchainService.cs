using System.Numerics;
using Microsoft.Extensions.Options;
using Nethereum.ABI.FunctionEncoding.Attributes;
using Nethereum.Contracts;
using Nethereum.Web3;
using Nethereum.Web3.Accounts;

namespace AiBlockSystem.Api.Services;

public class BlockchainOptions
{
    public string RpcUrl { get; set; } = "http://127.0.0.1:8545";
    public string VerifierPrivateKey { get; set; } = string.Empty;
    public string GatewayContractAddress { get; set; } = string.Empty;
    public int UsdcDecimals { get; set; } = 6;
}

[Function("executeTransfer", "uint256")]
public class ExecuteTransferFunction : FunctionMessage
{
    [Parameter("address", "recipient", 1)]
    public string Recipient { get; set; } = string.Empty;

    [Parameter("uint256", "amount", 2)]
    public BigInteger Amount { get; set; }

    [Parameter("string", "originCity", 3)]
    public string OriginCity { get; set; } = string.Empty;

    [Parameter("string", "destCity", 4)]
    public string DestCity { get; set; } = string.Empty;

    [Parameter("bytes32", "nocDocHash", 5)]
    public byte[] NocDocHash { get; set; } = Array.Empty<byte>();
}

public class BlockchainService
{
    private readonly BlockchainOptions _options;
    private readonly Web3 _web3;

    public BlockchainService(IOptions<BlockchainOptions> options)
    {
        _options = options.Value;
        var account = new Account(_options.VerifierPrivateKey);
        _web3 = new Web3(account, _options.RpcUrl);
    }

    /// Signs and sends executeTransfer on TransactionGateway. Only ever
    /// called by the backend after a "genuine" NOC verdict has been
    /// confirmed and persisted — the contract itself also enforces that
    /// only this verifier address can call it.
    public async Task<string> ExecuteTransferAsync(
        string recipientAddress,
        decimal amountUsdc,
        string originCity,
        string destCity,
        string documentHashHex
    )
    {
        if (string.IsNullOrWhiteSpace(_options.GatewayContractAddress))
        {
            throw new InvalidOperationException(
                "GatewayContractAddress is not configured. Deploy contracts and set Blockchain:GatewayContractAddress."
            );
        }

        var scale = BigInteger.Pow(10, _options.UsdcDecimals);
        var amountUnits = new BigInteger(amountUsdc) * scale
            + new BigInteger((amountUsdc - Math.Truncate(amountUsdc)) * (decimal)scale);

        var hashBytes = Convert.FromHexString(documentHashHex);

        var function = new ExecuteTransferFunction
        {
            Recipient = recipientAddress,
            Amount = amountUnits,
            OriginCity = originCity,
            DestCity = destCity,
            NocDocHash = hashBytes,
        };

        var handler = _web3.Eth.GetContractTransactionHandler<ExecuteTransferFunction>();
        var receipt = await handler.SendRequestAndWaitForReceiptAsync(
            _options.GatewayContractAddress,
            function
        );

        if (receipt.Status?.Value != 1)
        {
            throw new InvalidOperationException($"Transaction reverted: {receipt.TransactionHash}");
        }

        return receipt.TransactionHash;
    }
}
