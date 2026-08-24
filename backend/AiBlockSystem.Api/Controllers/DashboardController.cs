using System.Security.Claims;
using AiBlockSystem.Api.Data;
using AiBlockSystem.Api.Dtos;
using AiBlockSystem.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AiBlockSystem.Api.Controllers;

[ApiController]
[Route("api/dashboard")]
[Authorize(Roles = "Admin,Analyst")]
public class DashboardController : ControllerBase
{
    private readonly AppDbContext _db;

    public DashboardController(AppDbContext db)
    {
        _db = db;
    }

    private int CurrentUserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private bool IsAdmin => User.IsInRole("Admin");

    [HttpGet("summary")]
    public async Task<ActionResult<DashboardSummaryResponse>> Summary()
    {
        var query = _db.Transactions.Include(t => t.Analysis).AsQueryable();
        if (!IsAdmin)
        {
            query = query.Where(t => t.UserId == CurrentUserId);
        }

        var transactions = await query.OrderByDescending(t => t.CreatedAt).ToListAsync();
        var withAnalysis = transactions.Where(t => t.Analysis is not null).ToList();

        return Ok(
            new DashboardSummaryResponse
            {
                TotalTransactions = transactions.Count,
                VerifiedTransactions = transactions.Count(t => t.Status == Models.TransactionStatus.Verified),
                HighRiskTransactions = withAnalysis.Count(t => t.Analysis!.RiskLevel is "HIGH" or "CRITICAL"),
                AverageRiskScore = withAnalysis.Count == 0 ? 0 : Math.Round(withAnalysis.Average(t => t.Analysis!.FinalRiskScore), 1),
                RecentTransactions = transactions.Take(10).Select(ReportService.ToTransactionResponse).ToList(),
            }
        );
    }

    [HttpGet("trend")]
    public async Task<ActionResult<List<DashboardTrendPoint>>> Trend([FromQuery] int days = 30)
    {
        days = Math.Clamp(days, 1, 90);
        var since = DateTime.UtcNow.Date.AddDays(-(days - 1));

        var query = _db.Transactions.Include(t => t.Analysis).Where(t => t.CreatedAt >= since).AsQueryable();
        if (!IsAdmin)
        {
            query = query.Where(t => t.UserId == CurrentUserId);
        }

        var transactions = await query.ToListAsync();
        var byDay = transactions.GroupBy(t => DateOnly.FromDateTime(t.CreatedAt)).ToDictionary(g => g.Key, g => g.ToList());

        var points = new List<DashboardTrendPoint>();
        for (var i = 0; i < days; i++)
        {
            var date = DateOnly.FromDateTime(since.AddDays(i));
            var dayTransactions = byDay.TryGetValue(date, out var list) ? list : new List<Models.Transaction>();
            var scored = dayTransactions.Where(t => t.Analysis is not null).ToList();

            points.Add(new DashboardTrendPoint
            {
                Date = date,
                TransactionCount = dayTransactions.Count,
                AverageRiskScore = scored.Count == 0 ? null : Math.Round(scored.Average(t => t.Analysis!.FinalRiskScore), 1),
            });
        }

        return Ok(points);
    }
}
