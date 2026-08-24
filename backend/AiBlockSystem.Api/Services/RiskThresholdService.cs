using AiBlockSystem.Api.Data;
using AiBlockSystem.Api.Dtos;
using AiBlockSystem.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace AiBlockSystem.Api.Services;

/// The VERIFIED/LOW/MEDIUM/HIGH score ceilings, persisted as SystemSetting
/// rows so an Admin can tune them without a redeploy. Read by both the
/// admin settings UI and AnalysisOrchestrationService (which forwards them
/// to the AI engine's /api/analyze/risk call).
public class RiskThresholdService
{
    public const string VerifiedKey = "RiskThreshold.Verified";
    public const string LowKey = "RiskThreshold.Low";
    public const string MediumKey = "RiskThreshold.Medium";
    public const string HighKey = "RiskThreshold.High";

    public static readonly Dictionary<string, (double Default, string Description)> Defaults = new()
    {
        [VerifiedKey] = (20, "Max score (0-100) for the VERIFIED risk level."),
        [LowKey] = (40, "Max score (0-100) for the LOW risk level."),
        [MediumKey] = (60, "Max score (0-100) for the MEDIUM risk level."),
        [HighKey] = (80, "Max score (0-100) for the HIGH risk level. Anything above this is CRITICAL."),
    };

    private readonly AppDbContext _db;

    public RiskThresholdService(AppDbContext db)
    {
        _db = db;
    }

    public async Task SeedDefaultsAsync()
    {
        foreach (var (key, (value, description)) in Defaults)
        {
            if (!await _db.SystemSettings.AnyAsync(s => s.Key == key))
            {
                _db.SystemSettings.Add(new SystemSetting
                {
                    Key = key,
                    Value = value.ToString(System.Globalization.CultureInfo.InvariantCulture),
                    Description = description,
                });
            }
        }
        await _db.SaveChangesAsync();
    }

    public async Task<AiRiskThresholds> GetAsync()
    {
        var rows = await _db.SystemSettings
            .Where(s => Defaults.Keys.Contains(s.Key))
            .ToListAsync();

        double Get(string key) =>
            rows.FirstOrDefault(r => r.Key == key) is { } row && double.TryParse(row.Value, out var v)
                ? v
                : Defaults[key].Default;

        return new AiRiskThresholds
        {
            Verified = Get(VerifiedKey),
            Low = Get(LowKey),
            Medium = Get(MediumKey),
            High = Get(HighKey),
        };
    }
}
