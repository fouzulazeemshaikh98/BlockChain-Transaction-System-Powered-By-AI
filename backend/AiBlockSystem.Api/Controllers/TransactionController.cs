using System.Security.Claims;
using AiBlockSystem.Api.Data;
using AiBlockSystem.Api.Dtos;
using AiBlockSystem.Api.Models;
using AiBlockSystem.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AiBlockSystem.Api.Controllers;

[ApiController]
[Route("api/transactions")]
[Authorize]
public class TransactionController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AnalysisOrchestrationService _orchestration;
    private readonly BlockchainService _blockchain;
    private readonly AuthService _auth;
    private readonly GeoLocationService _geo;
    private readonly ILogger<TransactionController> _logger;

    private static readonly HashSet<string> BlockedSettlementRiskLevels = new() { "HIGH", "CRITICAL" };
    private const decimal MinTransferAmount = 10m;

    public TransactionController(
        AppDbContext db,
        AnalysisOrchestrationService orchestration,
        BlockchainService blockchain,
        AuthService auth,
        GeoLocationService geo,
        ILogger<TransactionController> logger
    )
    {
        _db = db;
        _orchestration = orchestration;
        _blockchain = blockchain;
        _auth = auth;
        _geo = geo;
        _logger = logger;
    }

    private int CurrentUserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private bool IsAdmin => User.IsInRole("Admin");

    /// Verifies the caller's transaction PIN server-side before any
    /// money-moving action proceeds - checked here, not just hidden behind
    /// a UI modal, matching this project's pattern of enforcing every gate
    /// on the backend (e.g. the NOC amount/risk-level hard-blocks). Also
    /// extends the login security audit trail to PIN attempts: a failed
    /// attempt is logged with IP/device/best-effort location the same way
    /// a failed login is, tagged with which action was being attempted.
    private async Task<bool> VerifyCallerPinAsync(string pin, string context)
    {
        var user = await _db.Users.FindAsync(CurrentUserId);
        var ok = user is not null && _auth.VerifyPin(user, pin);
        if (!ok)
        {
            var userAgent = Request.Headers.UserAgent.ToString();
            var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
            var geo = await _geo.ResolveAsync(ip);
            _db.LoginAttempts.Add(
                new LoginAttempt
                {
                    Email = user?.Email ?? $"user#{CurrentUserId}",
                    Success = false,
                    FailureReason = "Incorrect PIN.",
                    IpAddress = ip,
                    UserAgent = userAgent,
                    Device = DeviceParser.Summarize(userAgent),
                    Context = context,
                    Location = geo?.DisplayText,
                    Latitude = geo?.Latitude,
                    Longitude = geo?.Longitude,
                }
            );
            await _db.SaveChangesAsync();
        }
        return ok;
    }

    /// Sum of amounts already settled on-chain this calendar month against
    /// the given NOC. Used both when creating a transfer (early feedback)
    /// and, authoritatively, right before /settle actually touches the
    /// chain - a transfer created within the cap can still be blocked at
    /// settle time if other transfers against the same NOC settled first.
    private async Task<decimal> GetMonthlyExecutedTotalAsync(int nocDocumentId)
    {
        var now = DateTime.UtcNow;
        return await _db.Transactions
            .Where(t =>
                t.NocDocumentId == nocDocumentId
                && t.SettlementStatus == SettlementStatus.Executed
                && t.CreatedAt.Year == now.Year
                && t.CreatedAt.Month == now.Month
            )
            .SumAsync(t => (decimal?)t.Amount) ?? 0m;
    }

    [HttpPost]
    [Authorize(Roles = "Admin,Analyst")]
    public async Task<ActionResult<TransactionResponse>> Create(CreateTransactionRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.TransactionHash) || string.IsNullOrWhiteSpace(request.FromAddress))
        {
            return BadRequest("TransactionHash and FromAddress are required.");
        }

        var transaction = new Transaction
        {
            TransactionHash = request.TransactionHash,
            Network = request.Network,
            FromAddress = request.FromAddress,
            ToAddress = request.ToAddress,
            Amount = request.Amount,
            GasUsed = request.GasUsed,
            GasPrice = request.GasPrice,
            Nonce = request.Nonce,
            Timestamp = request.Timestamp ?? DateTime.UtcNow,
            ContractAddress = request.ContractAddress,
            FunctionName = request.FunctionName,
            Description = request.Description,
            RawData = request.RawData,
            Status = TransactionStatus.Pending,
            UserId = CurrentUserId,
        };

        _db.Transactions.Add(transaction);
        await _db.SaveChangesAsync();

        return Ok(ReportService.ToTransactionResponse(transaction));
    }

    /// Creates a transaction as part of the NOC-gated "Send Transfer" flow -
    /// requires the linked NocDocument to belong to the caller and have a
    /// "genuine" verdict. The transaction still needs /analyze run on it
    /// separately, and /settle still re-checks both conditions itself
    /// before touching the chain - this endpoint only gates creation.
    [HttpPost("transfer")]
    public async Task<ActionResult<TransactionResponse>> CreateTransfer(CreateTransferRequest request)
    {
        if (!await VerifyCallerPinAsync(request.Pin, "CreateTransfer"))
        {
            return Unauthorized("Incorrect PIN.");
        }

        var noc = await _db.NocDocuments.FindAsync(request.NocDocumentId);
        if (noc is null) return NotFound("NOC document not found.");
        if (!IsAdmin && noc.UserId != CurrentUserId) return Forbid();
        if (!noc.IsGenuine)
        {
            return StatusCode(403, $"NOC document verdict is '{noc.Verdict}', not 'genuine'. Transfer cannot be created.");
        }
        if (request.Amount < MinTransferAmount)
        {
            return BadRequest($"Amount is below the minimum transfer of ${MinTransferAmount:N0}.");
        }
        if (noc.AuthorizedAmount is null)
        {
            // Shouldn't happen - the AI engine forces a non-genuine verdict
            // whenever this is missing - but guard anyway since IsGenuine
            // is the only thing checked above.
            return StatusCode(403, "NOC has no authorized monthly amount on file.");
        }

        var monthlyUsed = await GetMonthlyExecutedTotalAsync(noc.Id);
        if (monthlyUsed + request.Amount > noc.AuthorizedAmount.Value)
        {
            return StatusCode(
                403,
                $"This transfer would exceed the NOC's authorized monthly amount of "
                + $"${noc.AuthorizedAmount:N0}. ${monthlyUsed:N0} already settled this month, "
                + $"${request.Amount:N0} requested (${monthlyUsed + request.Amount - noc.AuthorizedAmount.Value:N0} over)."
            );
        }

        var transaction = new Transaction
        {
            TransactionHash = request.TransactionHash,
            Network = request.Network,
            FromAddress = request.FromAddress,
            ToAddress = request.RecipientAddress,
            Amount = request.Amount,
            GasUsed = request.GasUsed,
            GasPrice = request.GasPrice,
            Nonce = request.Nonce,
            Timestamp = DateTime.UtcNow,
            ContractAddress = request.ContractAddress,
            FunctionName = request.FunctionName,
            Description = request.Description ?? $"Cross-border transfer: {noc.OriginCity} -> {noc.DestinationCity}",
            RawData = request.RawData,
            Status = TransactionStatus.Pending,
            UserId = CurrentUserId,
            NocDocumentId = noc.Id,
            RecipientAddress = request.RecipientAddress,
            RecipientLabel = request.RecipientLabel,
        };

        _db.Transactions.Add(transaction);
        await _db.SaveChangesAsync();

        return Ok(ReportService.ToTransactionResponse(transaction));
    }

    /// Admin sign-off required before a MEDIUM-risk transfer can settle -
    /// see the maker-checker check inside Settle(). Idempotent-ish: calling
    /// it again just re-stamps the approver/timestamp.
    [HttpPost("{id:int}/approve")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<TransactionResponse>> Approve(int id, ApproveRequest request)
    {
        if (!await VerifyCallerPinAsync(request.Pin, "Approve"))
        {
            return Unauthorized("Incorrect PIN.");
        }

        var transaction = await _db.Transactions
            .Include(t => t.Analysis)
            .Include(t => t.ApprovedByUser)
            .FirstOrDefaultAsync(t => t.Id == id);
        if (transaction is null) return NotFound();

        if (transaction.Analysis is null || transaction.Analysis.RiskLevel != "MEDIUM")
        {
            return BadRequest("Only MEDIUM-risk transfers require or accept this approval step.");
        }

        transaction.ApprovedByUserId = CurrentUserId;
        transaction.ApprovedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        transaction.ApprovedByUser = await _db.Users.FindAsync(CurrentUserId);
        return Ok(ReportService.ToTransactionResponse(transaction));
    }

    /// Executes the on-chain settlement, but only if BOTH the linked NOC
    /// document is genuine AND the completed risk analysis is not HIGH/
    /// CRITICAL. Never calls the contract otherwise - this is the "both
    /// must pass" gate.
    [HttpPost("{id:int}/settle")]
    public async Task<ActionResult<SettlementResponse>> Settle(int id, SettleRequest request)
    {
        if (!await VerifyCallerPinAsync(request.Pin, "Settle"))
        {
            return Unauthorized("Incorrect PIN.");
        }

        var transaction = await _db.Transactions
            .Include(t => t.Analysis)
            .Include(t => t.NocDocument)
            .Include(t => t.ApprovedByUser)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (transaction is null) return NotFound();
        if (!IsAdmin && transaction.UserId != CurrentUserId) return Forbid();

        if (transaction.NocDocument is null || !transaction.NocDocument.IsGenuine)
        {
            transaction.SettlementStatus = SettlementStatus.Blocked;
            transaction.SettlementError = "No linked NOC document with a 'genuine' verdict.";
            await _db.SaveChangesAsync();
            return StatusCode(403, ToSettlementResponse(transaction));
        }

        if (transaction.Analysis is null || BlockedSettlementRiskLevels.Contains(transaction.Analysis.RiskLevel))
        {
            transaction.SettlementStatus = SettlementStatus.Blocked;
            transaction.SettlementError = transaction.Analysis is null
                ? "Transaction has not been risk-analyzed yet."
                : $"Risk level is {transaction.Analysis.RiskLevel} - settlement requires VERIFIED, LOW, or MEDIUM.";
            await _db.SaveChangesAsync();
            return StatusCode(403, ToSettlementResponse(transaction));
        }

        // Maker-checker: MEDIUM-risk transfers need an Admin's sign-off
        // (POST /{id}/approve) before they can settle - VERIFIED/LOW never
        // need this, HIGH/CRITICAL are already hard-blocked above.
        if (transaction.Analysis.RiskLevel == "MEDIUM" && transaction.ApprovedByUserId is null)
        {
            transaction.SettlementStatus = SettlementStatus.Blocked;
            transaction.SettlementError = "MEDIUM-risk transfer requires Admin approval before it can settle.";
            await _db.SaveChangesAsync();
            return StatusCode(403, ToSettlementResponse(transaction));
        }

        if (string.IsNullOrWhiteSpace(transaction.RecipientAddress))
        {
            return BadRequest("Transaction has no recipient address to settle to.");
        }

        // Authoritative monthly-cap check - the point where money actually
        // moves, so this is re-validated here even though CreateTransfer
        // already checked it once (other transfers against the same NOC
        // may have settled in between).
        var monthlyUsed = await GetMonthlyExecutedTotalAsync(transaction.NocDocument.Id);
        var authorizedAmount = transaction.NocDocument.AuthorizedAmount;
        if (authorizedAmount is null || monthlyUsed + transaction.Amount > authorizedAmount.Value)
        {
            transaction.SettlementStatus = SettlementStatus.Blocked;
            transaction.SettlementError = authorizedAmount is null
                ? "NOC has no authorized monthly amount on file."
                : $"Settling ${transaction.Amount:N0} would exceed the NOC's authorized monthly amount of "
                    + $"${authorizedAmount:N0} (${monthlyUsed:N0} already settled this month).";
            await _db.SaveChangesAsync();
            return StatusCode(403, ToSettlementResponse(transaction));
        }

        try
        {
            var txHash = await _blockchain.ExecuteTransferAsync(
                transaction.RecipientAddress,
                transaction.Amount,
                transaction.NocDocument.OriginCity ?? "Unknown",
                transaction.NocDocument.DestinationCity ?? "Unknown",
                transaction.NocDocument.DocumentHash
            );

            transaction.SettlementStatus = SettlementStatus.Executed;
            transaction.SettlementTxHash = txHash;
            transaction.SettlementError = null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Settlement failed for transaction {TransactionId}", id);
            transaction.SettlementStatus = SettlementStatus.Failed;
            transaction.SettlementError = ex.Message;
        }

        await _db.SaveChangesAsync();
        return Ok(ToSettlementResponse(transaction));
    }

    private static SettlementResponse ToSettlementResponse(Transaction t) =>
        new()
        {
            TransactionId = t.Id,
            SettlementStatus = t.SettlementStatus.ToString(),
            SettlementTxHash = t.SettlementTxHash,
            SettlementError = t.SettlementError,
        };

    [HttpGet]
    [Authorize(Roles = "Admin,Analyst")]
    public async Task<ActionResult<List<TransactionResponse>>> List()
    {
        var query = _db.Transactions.Include(t => t.Analysis).Include(t => t.ApprovedByUser).AsQueryable();
        if (!IsAdmin)
        {
            query = query.Where(t => t.UserId == CurrentUserId);
        }

        var transactions = await query.OrderByDescending(t => t.CreatedAt).ToListAsync();
        return Ok(transactions.Select(ReportService.ToTransactionResponse).ToList());
    }

    [HttpGet("{id:int}")]
    [Authorize(Roles = "Admin,Analyst")]
    public async Task<ActionResult<TransactionResponse>> Get(int id)
    {
        var transaction = await _db.Transactions
            .Include(t => t.Analysis)
            .Include(t => t.ApprovedByUser)
            .FirstOrDefaultAsync(t => t.Id == id);
        if (transaction is null) return NotFound();
        if (!IsAdmin && transaction.UserId != CurrentUserId) return Forbid();

        return Ok(ReportService.ToTransactionResponse(transaction));
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = "Admin,Analyst")]
    public async Task<ActionResult<TransactionResponse>> Update(int id, UpdateTransactionRequest request)
    {
        var transaction = await _db.Transactions.FindAsync(id);
        if (transaction is null) return NotFound();
        if (!IsAdmin && transaction.UserId != CurrentUserId) return Forbid();

        transaction.TransactionHash = request.TransactionHash;
        transaction.Network = request.Network;
        transaction.FromAddress = request.FromAddress;
        transaction.ToAddress = request.ToAddress;
        transaction.Amount = request.Amount;
        transaction.GasUsed = request.GasUsed;
        transaction.GasPrice = request.GasPrice;
        transaction.Nonce = request.Nonce;
        transaction.Timestamp = request.Timestamp ?? transaction.Timestamp;
        transaction.ContractAddress = request.ContractAddress;
        transaction.FunctionName = request.FunctionName;
        transaction.Description = request.Description;
        transaction.RawData = request.RawData;

        await _db.SaveChangesAsync();
        return Ok(ReportService.ToTransactionResponse(transaction));
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = "Admin,Analyst")]
    public async Task<ActionResult> Delete(int id)
    {
        var transaction = await _db.Transactions.FindAsync(id);
        if (transaction is null) return NotFound();
        if (!IsAdmin && transaction.UserId != CurrentUserId) return Forbid();

        // Only successfully settled transactions can be deleted - pending,
        // blocked, or failed ones must stay on file so an in-flight or
        // rejected transfer can't quietly disappear from the record.
        if (transaction.SettlementStatus != SettlementStatus.Executed)
        {
            return BadRequest("Only successfully settled transactions can be deleted.");
        }

        _db.Transactions.Remove(transaction);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{id:int}/analyze")]
    public Task<ActionResult<AnalysisResponse>> Analyze(int id) => RunAnalysis(id);

    [HttpPost("{id:int}/reanalyze")]
    public Task<ActionResult<AnalysisResponse>> Reanalyze(int id) => RunAnalysis(id);

    private async Task<ActionResult<AnalysisResponse>> RunAnalysis(int id)
    {
        var transaction = await _db.Transactions.FindAsync(id);
        if (transaction is null) return NotFound();
        if (!IsAdmin && transaction.UserId != CurrentUserId) return Forbid();

        try
        {
            var result = await _orchestration.AnalyzeAsync(id);
            return Ok(result);
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
    }
}
