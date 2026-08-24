using System.Security.Claims;
using AiBlockSystem.Api.Data;
using AiBlockSystem.Api.Dtos;
using AiBlockSystem.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AiBlockSystem.Api.Controllers;

[ApiController]
[Route("api/reports")]
[Authorize]
public class ReportsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ReportService _reports;

    public ReportsController(AppDbContext db, ReportService reports)
    {
        _db = db;
        _reports = reports;
    }

    private int CurrentUserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private bool IsAdmin => User.IsInRole("Admin");

    /// The "browse everyone's/my reports" list view - not needed by the
    /// restricted "User" role, which only ever looks at the single report
    /// for a transfer it just made (Get(), below, already ownership-scoped
    /// and left open to any authenticated role for exactly that reason).
    [HttpGet]
    [Authorize(Roles = "Admin,Analyst")]
    public async Task<ActionResult<List<TransactionResponse>>> List()
    {
        var query = _db.Transactions.Include(t => t.Analysis).Where(t => t.Analysis != null);
        var scoped = IsAdmin ? query : query.Where(t => t.UserId == CurrentUserId);

        var transactions = await scoped.OrderByDescending(t => t.CreatedAt).ToListAsync();
        return Ok(transactions.Select(ReportService.ToTransactionResponse).ToList());
    }

    [HttpGet("{transactionId:int}")]
    public async Task<ActionResult<ReportResponse>> Get(int transactionId)
    {
        var transaction = await _db.Transactions.FindAsync(transactionId);
        if (transaction is null) return NotFound();
        if (!IsAdmin && transaction.UserId != CurrentUserId) return Forbid();

        var report = await _reports.GetReportAsync(transactionId);
        return report is null ? NotFound() : Ok(report);
    }
}
