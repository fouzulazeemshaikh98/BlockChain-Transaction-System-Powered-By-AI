using System.Security.Claims;
using System.Text.Json;
using AiBlockSystem.Api.Data;
using AiBlockSystem.Api.Dtos;
using AiBlockSystem.Api.Models;
using AiBlockSystem.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AiBlockSystem.Api.Controllers;

[ApiController]
[Route("api/noc")]
[Authorize]
public class NocController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly FastApiClientService _aiClient;
    private readonly IWebHostEnvironment _env;
    private readonly AuthService _auth;
    private readonly GeoLocationService _geo;
    private readonly ILogger<NocController> _logger;

    public NocController(
        AppDbContext db,
        FastApiClientService aiClient,
        IWebHostEnvironment env,
        AuthService auth,
        GeoLocationService geo,
        ILogger<NocController> logger
    )
    {
        _db = db;
        _aiClient = aiClient;
        _env = env;
        _auth = auth;
        _geo = geo;
        _logger = logger;
    }

    private int CurrentUserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private bool IsAdmin => User.IsInRole("Admin");

    /// Same PIN gate as TransactionController's money-moving endpoints -
    /// verified server-side, not just hidden behind a UI modal. NOC upload
    /// is where a transfer's authorization originates, so it gets the same
    /// treatment as creating/settling/approving one, including logging a
    /// failed attempt to the same audit trail as a failed login.
    private async Task<bool> VerifyCallerPinAsync(string pin)
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
                    Context = "VerifyNoc",
                    Location = geo?.DisplayText,
                    Latitude = geo?.Latitude,
                    Longitude = geo?.Longitude,
                }
            );
            await _db.SaveChangesAsync();
        }
        return ok;
    }

    /// Sum of amounts actually settled on-chain this calendar month against
    /// the given NOC - the same definition used to gate /settle, so what's
    /// shown here always matches what's enforced there.
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

    [HttpPost("verify")]
    [RequestSizeLimit(20_000_000)]
    public async Task<ActionResult<NocVerificationResponse>> Verify(IFormFile file, [FromForm] string pin)
    {
        if (!await VerifyCallerPinAsync(pin))
        {
            return Unauthorized("Incorrect PIN.");
        }

        if (file.Length == 0)
        {
            return BadRequest("Uploaded file is empty.");
        }

        AiNocVerificationResult result;
        await using (var stream = file.OpenReadStream())
        {
            result = await _aiClient.VerifyNocAsync(stream, file.FileName, file.ContentType);
        }

        var uploadsDir = Path.Combine(_env.ContentRootPath, "uploads");
        Directory.CreateDirectory(uploadsDir);
        var storedFileName = $"{result.DocumentHash}{Path.GetExtension(file.FileName)}";
        var storedPath = Path.Combine(uploadsDir, storedFileName);
        if (!System.IO.File.Exists(storedPath))
        {
            await using var fileStream = new FileStream(storedPath, FileMode.Create);
            await using var readStream = file.OpenReadStream();
            await readStream.CopyToAsync(fileStream);
        }

        var doc = new NocDocument
        {
            FileName = file.FileName,
            StoredFilePath = storedPath,
            DocumentHash = result.DocumentHash,
            ApplicantName = result.Fields.ApplicantName,
            OriginCity = result.Fields.OriginCity,
            OriginCountry = result.Fields.OriginCountry,
            DestinationCity = result.Fields.DestinationCity,
            DestinationCountry = result.Fields.DestinationCountry,
            IssuingAuthority = result.Fields.IssuingAuthority,
            IssueDateRaw = result.Fields.IssueDate,
            AuthorizedAmount = result.Fields.AuthorizedAmount,
            Verdict = result.Verdict,
            AuthenticityScore = result.AuthenticityScore,
            RiskScore = result.RiskScore,
            FlagsJson = JsonSerializer.Serialize(result.Flags),
            UserId = CurrentUserId,
        };

        _db.NocDocuments.Add(doc);
        await _db.SaveChangesAsync();

        _logger.LogInformation(
            "NOC {DocId} verified with verdict={Verdict} authenticity={Authenticity} risk={Risk}",
            doc.Id,
            doc.Verdict,
            doc.AuthenticityScore,
            doc.RiskScore
        );

        var monthlyUsed = doc.IsGenuine ? await GetMonthlyExecutedTotalAsync(doc.Id) : 0m;

        return Ok(
            new NocVerificationResponse
            {
                NocDocumentId = doc.Id,
                Verdict = result.Verdict,
                AuthenticityScore = result.AuthenticityScore,
                RiskScore = result.RiskScore,
                TransferUnlocked = doc.IsGenuine,
                Fields = result.Fields,
                Stamp = result.Stamp,
                Flags = result.Flags,
                CnnForgedProbability = result.CnnForgedProbability,
                CnnHeatmap = result.CnnHeatmap,
                MonthlyUsed = monthlyUsed,
                MonthlyRemaining = doc.AuthorizedAmount.HasValue ? doc.AuthorizedAmount.Value - monthlyUsed : null,
            }
        );
    }

    [HttpGet]
    public async Task<ActionResult<List<NocDocumentSummary>>> List()
    {
        var query = _db.NocDocuments.AsQueryable();
        if (!IsAdmin)
        {
            query = query.Where(d => d.UserId == CurrentUserId);
        }

        var docs = await query.OrderByDescending(d => d.CreatedAt).ToListAsync();

        var now = DateTime.UtcNow;
        var monthlyUsage = await _db.Transactions
            .Where(t =>
                t.SettlementStatus == SettlementStatus.Executed
                && t.CreatedAt.Year == now.Year
                && t.CreatedAt.Month == now.Month
                && t.NocDocumentId != null
            )
            .GroupBy(t => t.NocDocumentId!.Value)
            .Select(g => new { NocDocumentId = g.Key, Total = g.Sum(t => t.Amount) })
            .ToDictionaryAsync(x => x.NocDocumentId, x => x.Total);

        var result = docs.Select(d =>
        {
            var used = monthlyUsage.GetValueOrDefault(d.Id, 0m);
            return new NocDocumentSummary
            {
                Id = d.Id,
                FileName = d.FileName,
                Verdict = d.Verdict,
                AuthenticityScore = d.AuthenticityScore,
                RiskScore = d.RiskScore,
                ApplicantName = d.ApplicantName,
                OriginCity = d.OriginCity,
                OriginCountry = d.OriginCountry,
                DestinationCity = d.DestinationCity,
                DestinationCountry = d.DestinationCountry,
                AuthorizedAmount = d.AuthorizedAmount,
                MonthlyUsed = used,
                MonthlyRemaining = d.AuthorizedAmount.HasValue ? d.AuthorizedAmount.Value - used : null,
                CreatedAt = d.CreatedAt,
            };
        }).ToList();

        return Ok(result);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult> Get(int id)
    {
        var doc = await _db.NocDocuments.FindAsync(id);
        if (doc is null) return NotFound();
        if (!IsAdmin && doc.UserId != CurrentUserId) return Forbid();

        var used = await GetMonthlyExecutedTotalAsync(doc.Id);

        return Ok(
            new
            {
                doc.Id,
                doc.FileName,
                doc.Verdict,
                doc.AuthenticityScore,
                doc.RiskScore,
                doc.ApplicantName,
                doc.OriginCity,
                doc.OriginCountry,
                doc.DestinationCity,
                doc.DestinationCountry,
                doc.IssuingAuthority,
                doc.IssueDateRaw,
                doc.AuthorizedAmount,
                MonthlyUsed = used,
                MonthlyRemaining = doc.AuthorizedAmount.HasValue ? doc.AuthorizedAmount.Value - used : (decimal?)null,
                doc.CreatedAt,
                Flags = JsonSerializer.Deserialize<List<AiNocForensicFlag>>(doc.FlagsJson),
                TransferUnlocked = doc.IsGenuine,
            }
        );
    }
}
