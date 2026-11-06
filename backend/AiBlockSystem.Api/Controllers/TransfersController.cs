using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using AiBlockSystem.Api.Data;
using AiBlockSystem.Api.Dtos;
using AiBlockSystem.Api.Models;
using AiBlockSystem.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Nethereum.Util;
using Nethereum.Hex.HexConvertors.Extensions;

namespace AiBlockSystem.Api.Controllers;

/// Risk-gated settlement flow (report section 5.2.2 / Appendix C.3):
/// score with the FastAPI risk oracle -> persist the risk report ->
/// BLOCK => 422, APPROVE => submit the signed attestation to
/// RiskGatedSettlement on-chain => 202.
[ApiController]
[Route("api/transfers")]
[Authorize] // JWT bearer authentication
public class TransfersController : ControllerBase
{
    private const int TokenDecimals = 6;
    private static readonly long TokenScale = (long)Math.Pow(10, TokenDecimals);

    private readonly IRiskEngineClient _risk;          // calls the FastAPI risk engine
    private readonly ISettlementService _settlement;   // submits to the L2 contract
    private readonly AppDbContext _db;                 // SQL Server via EF Core
    private readonly AuthService _auth;
    private readonly RiskGatedOptions _options;
    private readonly ILogger<TransfersController> _logger;

    public TransfersController(
        IRiskEngineClient risk,
        ISettlementService settlement,
        AppDbContext db,
        AuthService auth,
        IOptions<RiskGatedOptions> options,
        ILogger<TransfersController> logger)
    {
        _risk = risk;
        _settlement = settlement;
        _db = db;
        _auth = auth;
        _options = options.Value;
        _logger = logger;
    }

    private int CurrentUserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private bool CanSeeAll => User.IsInRole("Admin") || User.IsInRole("Analyst");

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] TransferDto dto, CancellationToken ct)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == CurrentUserId, ct);
        if (user is null || !_auth.VerifyPin(user, dto.Pin))
        {
            return Unauthorized(new { message = "Invalid transfer PIN." });
        }

        // Resolve receiver
        string receiver;
        string? receiverLabel = null;
        if (dto.ReceiverWalletId is int walletId)
        {
            var wallet = await _db.WalletAccounts.FirstOrDefaultAsync(w => w.Id == walletId, ct);
            if (wallet is null) return BadRequest(new { message = "Unknown recipient account." });
            receiver = wallet.Address;
            receiverLabel = wallet.Label;
        }
        else if (!string.IsNullOrWhiteSpace(dto.Receiver) && AddressUtil.Current.IsValidEthereumAddressHexFormat(dto.Receiver))
        {
            receiver = AddressUtil.Current.ConvertToChecksumAddress(dto.Receiver);
            var lowered = receiver.ToLowerInvariant();
            receiverLabel = (await _db.WalletAccounts.FirstOrDefaultAsync(w => w.Address.ToLower() == lowered, ct))?.Label;
        }
        else
        {
            return BadRequest(new { message = "Provide receiverWalletId or a valid receiver address." });
        }

        var amountUnits = (long)decimal.Round(dto.Amount * TokenScale);
        var transferId = "0x" + RandomNumberGenerator.GetBytes(32).ToHex(); // unique 32-byte id
        var sender = _settlement.PayerAddress;
        var token = _settlement.TokenAddress;

        // Behavioural history for this user, from SQL Server
        var since = DateTime.UtcNow.AddHours(-1);
        var history = await _db.Transfers
            .Where(t => t.UserId == user.Id)
            .OrderByDescending(t => t.CreatedUtc)
            .Take(20)
            .Select(t => new { t.Amount, t.Receiver, t.CreatedUtc, t.Status })
            .ToListAsync(ct);
        // Nonces are per sending wallet (all settlements are paid by the
        // backend's wallet), not per user, so different users never collide.
        var nonce = dto.Nonce ?? (await _db.Transfers.Where(t => t.Sender == sender).MaxAsync(t => (long?)t.Nonce, ct) ?? -1) + 1;

        long gasPrice;
        try { gasPrice = dto.GasPriceWei ?? await _settlement.GetGasPriceWeiAsync(); }
        catch { gasPrice = dto.GasPriceWei ?? 1_000_000_000; }

        var allowedFunctions = (await _db.ProtocolTemplates.Where(t => t.IsActive).Select(t => t.ExpectedFunctions).ToListAsync(ct))
            .SelectMany(json => JsonSerializer.Deserialize<List<string>>(json) ?? new())
            .Where(f => f.Contains('('))
            .Distinct()
            .ToList();

        var request = new RiskScoreRequest
        {
            TransferId = transferId,
            Sender = sender,
            Token = token,
            Receiver = receiver,
            Amount = amountUnits,
            Calldata = dto.Calldata ?? Erc20TransferCalldata(receiver, amountUnits),
            Nonce = nonce,
            GasPrice = gasPrice,
            ChainId = dto.ChainId,
            GasLimit = dto.GasLimit,
            TokenDecimals = TokenDecimals,
            Signature = dto.Signature,
            RecentAmounts = history.Where(h => h.Status != TransferStatus.Blocked)
                .Select(h => (long)decimal.Round(h.Amount * TokenScale)).ToList(),
            TxCountLastHour = history.Count(h => h.CreatedUtc >= since),
            KnownReceiver = history.Any(h => h.Status == TransferStatus.Settled
                && string.Equals(h.Receiver, receiver, StringComparison.OrdinalIgnoreCase)),
            AllowedFunctions = allowedFunctions,
        };

        var bearer = Request.Headers.Authorization.ToString();
        bearer = bearer.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ? bearer[7..] : bearer;

        RiskAssessment assessment;
        try
        {
            assessment = await _risk.ScoreAsync(request, bearer, ct);
        }
        catch (RiskEngineUnavailableException ex)
        {
            _logger.LogWarning(ex, "Risk engine call failed for {TransferId}", transferId);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = ex.Message });
        }

        var record = new TransferRecord
        {
            TransferId = transferId,
            UserId = user.Id,
            Sender = sender,
            Receiver = receiver,
            ReceiverLabel = receiverLabel,
            Token = token,
            Amount = dto.Amount,
            Chain = _options.ChainName,
            Nonce = nonce,
            Calldata = request.Calldata,
            RiskScore = assessment.RiskScore,
            Decision = assessment.Decision,
            Findings = string.Join("; ", assessment.Findings),
            CreatedUtc = DateTime.UtcNow,
        };
        record.RiskReport = BuildRiskReport(assessment);
        record.TemplateMatches.Add(await BuildTemplateMatchAsync(assessment, ct));
        _db.Transfers.Add(record);

        if (assessment.Decision == "BLOCK")
        {
            record.Status = TransferStatus.Blocked;
            await _db.SaveChangesAsync(ct);
            return UnprocessableEntity(new { transferId, assessment.RiskScore, assessment.Findings });
        }

        record.Status = TransferStatus.Submitted;
        await _db.SaveChangesAsync(ct);

        try
        {
            var result = await _settlement.SubmitAsync(receiver, amountUnits, transferId, assessment, ct);
            record.L2TxHash = result.TxHash;
            if (result.BlockedOnChain)
            {
                // Contract re-checked the attested score and refused to move funds.
                record.Status = TransferStatus.Blocked;
                await _db.SaveChangesAsync(ct);
                return UnprocessableEntity(new { transferId, assessment.RiskScore, assessment.Findings, txHash = result.TxHash });
            }

            record.Status = TransferStatus.Settled;
            record.Settlement = new SettlementRecord
            {
                ContractAddress = _settlement.SettlementContract,
                SignatureHash = new Sha3Keccack().CalculateHash(assessment.Signature.HexToByteArray()).ToHex(true),
                TxHash = result.TxHash,
                SettledAt = DateTime.UtcNow,
                ChallengePeriodEnd = null,
            };
            await _db.SaveChangesAsync(ct);
            return Accepted(new { transferId, txHash = result.TxHash, assessment.RiskScore });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Settlement failed for {TransferId}", transferId);
            record.Status = TransferStatus.Failed;
            record.Error = ex.Message;
            await _db.SaveChangesAsync(CancellationToken.None);
            return StatusCode(StatusCodes.Status502BadGateway, new { transferId, message = "On-chain settlement failed.", detail = ex.Message });
        }
    }

    [HttpGet]
    public async Task<ActionResult<List<TransferSummaryDto>>> List([FromQuery] int take = 50, CancellationToken ct = default)
    {
        var query = _db.Transfers.AsNoTracking();
        if (!CanSeeAll) query = query.Where(t => t.UserId == CurrentUserId);
        var rows = await query.OrderByDescending(t => t.CreatedUtc).Take(Math.Clamp(take, 1, 200)).ToListAsync(ct);
        return rows.Select(ToSummary).ToList();
    }

    [HttpGet("{transferId}")]
    public async Task<ActionResult<TransferDetailDto>> Get(string transferId, CancellationToken ct)
    {
        var t = await _db.Transfers.AsNoTracking()
            .Include(x => x.RiskReport!).ThenInclude(r => r.ModuleScores)
            .Include(x => x.TemplateMatches).ThenInclude(m => m.ProtocolTemplate)
            .Include(x => x.Settlement)
            .FirstOrDefaultAsync(x => x.TransferId == transferId, ct);
        if (t is null || (!CanSeeAll && t.UserId != CurrentUserId)) return NotFound();

        var summary = ToSummary(t);
        var match = t.TemplateMatches.FirstOrDefault();
        return new TransferDetailDto
        {
            Id = summary.Id,
            TransferId = summary.TransferId,
            Sender = summary.Sender,
            Receiver = summary.Receiver,
            ReceiverLabel = summary.ReceiverLabel,
            Amount = summary.Amount,
            Chain = summary.Chain,
            RiskScore = summary.RiskScore,
            Decision = summary.Decision,
            Status = summary.Status,
            L2TxHash = summary.L2TxHash,
            Findings = summary.Findings,
            CreatedUtc = summary.CreatedUtc,
            Token = t.Token,
            Nonce = t.Nonce,
            Calldata = t.Calldata,
            Error = t.Error,
            ModuleScores = t.RiskReport?.ModuleScores
                .Select(m => new ModuleScoreDto { ModuleName = m.ModuleName, Score = m.Score, FlaggedReason = m.FlaggedReason })
                .ToList() ?? new(),
            MatchedTemplate = match?.ProtocolTemplate?.Name ?? match?.MatchedFunction,
            SettlementContract = t.Settlement?.ContractAddress,
            SettledAt = t.Settlement?.SettledAt,
        };
    }

    private static TransferSummaryDto ToSummary(TransferRecord t) => new()
    {
        Id = t.Id,
        TransferId = t.TransferId,
        Sender = t.Sender,
        Receiver = t.Receiver,
        ReceiverLabel = t.ReceiverLabel,
        Amount = t.Amount,
        Chain = t.Chain,
        RiskScore = t.RiskScore,
        Decision = t.Decision,
        Status = t.Status.ToString(),
        L2TxHash = t.L2TxHash,
        Findings = string.IsNullOrEmpty(t.Findings) ? new() : t.Findings.Split("; ").ToList(),
        CreatedUtc = t.CreatedUtc,
    };

    private static RiskReport BuildRiskReport(RiskAssessment a)
    {
        string? Reason(params string[] keywords) =>
            a.Findings.FirstOrDefault(f => keywords.Any(k => f.Contains(k, StringComparison.OrdinalIgnoreCase)));

        return new RiskReport
        {
            FusedScore = a.RiskScore,
            Decision = a.Decision,
            GeneratedAt = DateTime.UtcNow,
            ModuleScores =
            {
                new ModuleScore { ModuleName = "Behavioural", Score = Pct(a.Modules.Behavioural), FlaggedReason = Reason("Behavioural") },
                new ModuleScore { ModuleName = "Template", Score = Pct(a.Modules.Template), FlaggedReason = Reason("calldata", "selector", "template", "approve", "padding", "re-routing", "transferFrom") },
                new ModuleScore { ModuleName = "Micro-Level", Score = Pct(a.Modules.Micro), FlaggedReason = Reason("replay", "nonce", "chain id", "signature", "gas") },
            },
        };
    }

    private async Task<TemplateMatchResult> BuildTemplateMatchAsync(RiskAssessment a, CancellationToken ct)
    {
        int? templateId = null;
        if (a.Modules.TemplateName is { } fn)
        {
            var templates = await _db.ProtocolTemplates.Where(t => t.IsActive).ToListAsync(ct);
            templateId = templates.FirstOrDefault(t => t.ExpectedFunctions.Contains(fn, StringComparison.OrdinalIgnoreCase))?.Id;
        }
        return new TemplateMatchResult
        {
            ProtocolTemplateId = templateId,
            MatchedFunction = a.Modules.TemplateName,
            SimilarityScore = 100m - Pct(a.Modules.Template),
            Deviations = string.Join("; ", a.Findings.Where(f =>
                f.Contains("calldata", StringComparison.OrdinalIgnoreCase)
                || f.Contains("selector", StringComparison.OrdinalIgnoreCase)
                || f.Contains("re-routing", StringComparison.OrdinalIgnoreCase))),
        };
    }

    private static decimal Pct(double score) => Math.Round((decimal)score * 100m, 2);

    /// ABI-encoded ERC-20 transfer(address,uint256) calldata.
    private static string Erc20TransferCalldata(string receiver, long amountUnits) =>
        "0xa9059cbb"
        + receiver[2..].ToLowerInvariant().PadLeft(64, '0')
        + amountUnits.ToString("x").PadLeft(64, '0');
}
