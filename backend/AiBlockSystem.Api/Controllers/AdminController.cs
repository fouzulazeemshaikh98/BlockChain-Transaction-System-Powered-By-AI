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
[Route("api/admin")]
[Authorize(Roles = "Admin")]
public class AdminController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly RiskThresholdService _thresholds;
    private readonly AuthService _auth;

    public AdminController(AppDbContext db, RiskThresholdService thresholds, AuthService auth)
    {
        _db = db;
        _thresholds = thresholds;
        _auth = auth;
    }

    private int CurrentUserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet("overview")]
    public async Task<ActionResult<AdminOverviewResponse>> Overview()
    {
        var logs = _db.AIAnalysisLogs;
        return Ok(new AdminOverviewResponse
        {
            TotalUsers = await _db.Users.CountAsync(),
            ActiveUsers = await _db.Users.CountAsync(u => u.IsActive),
            AdminCount = await _db.Users.CountAsync(u => u.Role == UserRole.Admin),
            TotalAiCalls = await logs.CountAsync(),
            FailedAiCalls = await logs.CountAsync(l => l.Status == "Error"),
        });
    }

    // ---- Users ----

    [HttpGet("users")]
    public async Task<ActionResult<List<AdminUserResponse>>> ListUsers()
    {
        var users = await _db.Users.OrderBy(u => u.Id).ToListAsync();
        return Ok(users.Select(ToUserResponse).ToList());
    }

    [HttpPut("users/{id:int}/status")]
    public async Task<ActionResult<AdminUserResponse>> SetUserStatus(int id, UpdateUserStatusRequest request)
    {
        var user = await _db.Users.FindAsync(id);
        if (user is null) return NotFound();

        if (id == CurrentUserId && !request.IsActive)
        {
            return BadRequest("You can't deactivate your own account.");
        }

        user.IsActive = request.IsActive;
        await _db.SaveChangesAsync();
        return Ok(ToUserResponse(user));
    }

    [HttpPost("users")]
    public async Task<ActionResult<AdminUserResponse>> CreateUser(CreateAdminUserRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.FullName) || string.IsNullOrWhiteSpace(request.Email))
        {
            return BadRequest("Full name and email are required.");
        }
        if (request.Password.Length < 6)
        {
            return BadRequest("Password must be at least 6 characters.");
        }
        if (!System.Text.RegularExpressions.Regex.IsMatch(request.Pin, "^[0-9]{4,6}$"))
        {
            return BadRequest("PIN must be 4-6 digits.");
        }
        if (!Enum.TryParse<UserRole>(request.Role, ignoreCase: true, out var role))
        {
            return BadRequest("Role must be 'Analyst' or 'Admin'.");
        }
        if (await _auth.EmailExistsAsync(request.Email))
        {
            return BadRequest("An account with this email already exists.");
        }

        // Admin-created accounts are pre-verified - the Admin is vouching
        // for the account directly, so the usual self-registration email
        // verification step doesn't apply.
        var user = await _auth.CreateUserAsync(
            request.FullName, request.Email, request.Password, role, request.Pin, preVerified: true
        );
        return Ok(ToUserResponse(user));
    }

    [HttpDelete("users/{id:int}")]
    public async Task<ActionResult> DeleteUser(int id)
    {
        if (id == CurrentUserId)
        {
            return BadRequest("You can't delete your own account.");
        }

        var user = await _db.Users.FindAsync(id);
        if (user is null) return NotFound();

        var transactionCount = await _db.Transactions.CountAsync(t => t.UserId == id);
        var nocCount = await _db.NocDocuments.CountAsync(n => n.UserId == id);
        var watchlistCount = await _db.WatchlistEntries.CountAsync(w => w.AddedByUserId == id);

        if (transactionCount > 0 || nocCount > 0 || watchlistCount > 0)
        {
            var parts = new List<string>();
            if (transactionCount > 0) parts.Add($"{transactionCount} transaction(s)");
            if (nocCount > 0) parts.Add($"{nocCount} NOC document(s)");
            if (watchlistCount > 0) parts.Add($"{watchlistCount} watchlist entry/entries");

            return BadRequest(
                $"Can't delete: this user has {string.Join(", ", parts)} on file. Deactivate the account instead "
                + "to preserve that history."
            );
        }

        _db.Users.Remove(user);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPut("users/{id:int}/role")]
    public async Task<ActionResult<AdminUserResponse>> SetUserRole(int id, UpdateUserRoleRequest request)
    {
        if (!Enum.TryParse<UserRole>(request.Role, ignoreCase: true, out var role))
        {
            return BadRequest("Role must be 'Analyst' or 'Admin'.");
        }

        var user = await _db.Users.FindAsync(id);
        if (user is null) return NotFound();

        if (id == CurrentUserId && role != UserRole.Admin)
        {
            return BadRequest("You can't demote your own account.");
        }

        user.Role = role;
        await _db.SaveChangesAsync();
        return Ok(ToUserResponse(user));
    }

    /// Admin-only PIN reset - e.g. when a user forgets their transfer PIN.
    /// No self-reset guard needed (unlike deactivate/demote): resetting
    /// your own PIN can't lock you out, since you're the one setting the
    /// new value.
    [HttpPut("users/{id:int}/pin")]
    public async Task<ActionResult> SetUserPin(int id, UpdateUserPinRequest request)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(request.Pin, "^[0-9]{4,6}$"))
        {
            return BadRequest("PIN must be 4-6 digits.");
        }

        var user = await _db.Users.FindAsync(id);
        if (user is null) return NotFound();

        user.PinHash = _auth.HashPin(user, request.Pin);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ---- Credential vault ----

    /// Demo/seed account credentials, gated behind re-entering the caller's
    /// own login password - not just "you're already an Admin", a fresh
    /// proof of identity right before revealing them, same spirit as a
    /// bank re-asking for a password before showing a full card number.
    /// The credentials themselves are static seed data (see Program.cs's
    /// first-run seeding), not a DB-backed secret store - a real secrets
    /// manager would be overkill for two hardcoded demo logins.
    [HttpPost("vault/demo-credentials")]
    public async Task<ActionResult<RevealCredentialsResponse>> RevealDemoCredentials(RevealCredentialsRequest request)
    {
        var me = await _db.Users.FindAsync(CurrentUserId);
        if (me is null) return Unauthorized();

        var verified = await _auth.ValidateCredentialsAsync(me.Email, request.Password);
        if (verified is null) return Unauthorized("Incorrect password.");

        return Ok(new RevealCredentialsResponse
        {
            Accounts = new()
            {
                new() { Email = "admin@aiblocksystem.local", Password = "admin123", Role = "Admin" },
                new() { Email = "analyst@aiblocksystem.local", Password = "analyst123", Role = "Analyst" },
            },
            TransferPin = "1234",
        });
    }

    private static AdminUserResponse ToUserResponse(User u) => new()
    {
        Id = u.Id,
        FullName = u.FullName,
        Email = u.Email,
        Role = u.Role.ToString(),
        IsActive = u.IsActive,
        CreatedAt = u.CreatedAt,
    };

    // ---- AI analysis logs ----

    [HttpGet("logs")]
    public async Task<ActionResult<AdminLogPageResponse>> ListLogs(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 25, [FromQuery] string? status = null
    )
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var query = _db.AIAnalysisLogs.Include(l => l.Transaction).AsQueryable();
        if (!string.IsNullOrWhiteSpace(status))
        {
            query = query.Where(l => l.Status == status);
        }

        var totalCount = await query.CountAsync();
        var items = await query
            .OrderByDescending(l => l.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(l => new AdminLogResponse
            {
                Id = l.Id,
                TransactionId = l.TransactionId,
                TransactionHash = l.Transaction != null ? l.Transaction.TransactionHash : null,
                ModuleName = l.ModuleName,
                Status = l.Status,
                ProcessingTimeMs = l.ProcessingTimeMs,
                CreatedAt = l.CreatedAt,
                RequestPayload = l.RequestPayload,
                ResponsePayload = l.ResponsePayload,
            })
            .ToListAsync();

        return Ok(new AdminLogPageResponse { Items = items, TotalCount = totalCount, Page = page, PageSize = pageSize });
    }

    // ---- Login activity (security audit trail) ----

    [HttpGet("login-attempts")]
    public async Task<ActionResult<AdminLoginAttemptPageResponse>> ListLoginAttempts(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 25
    )
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var query = _db.LoginAttempts.AsQueryable();
        var totalCount = await query.CountAsync();
        var items = await query
            .OrderByDescending(a => a.AttemptedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new AdminLoginAttemptResponse
            {
                Id = a.Id,
                Email = a.Email,
                Success = a.Success,
                FailureReason = a.FailureReason,
                IpAddress = a.IpAddress,
                Device = a.Device,
                Context = a.Context,
                Location = a.Location,
                Latitude = a.Latitude,
                Longitude = a.Longitude,
                AttemptedAt = a.AttemptedAt,
            })
            .ToListAsync();

        return Ok(new AdminLoginAttemptPageResponse { Items = items, TotalCount = totalCount, Page = page, PageSize = pageSize });
    }

    // ---- Risk threshold settings ----

    [HttpGet("settings")]
    public async Task<ActionResult<RiskThresholdsResponse>> GetSettings()
    {
        var t = await _thresholds.GetAsync();
        return Ok(new RiskThresholdsResponse { Verified = t.Verified, Low = t.Low, Medium = t.Medium, High = t.High });
    }

    [HttpPut("settings")]
    public async Task<ActionResult<RiskThresholdsResponse>> UpdateSettings(UpdateRiskThresholdsRequest request)
    {
        if (!(0 < request.Verified && request.Verified < request.Low
              && request.Low < request.Medium && request.Medium < request.High && request.High <= 100))
        {
            return BadRequest("Thresholds must satisfy 0 < verified < low < medium < high <= 100.");
        }

        await UpsertSettingAsync(RiskThresholdService.VerifiedKey, request.Verified);
        await UpsertSettingAsync(RiskThresholdService.LowKey, request.Low);
        await UpsertSettingAsync(RiskThresholdService.MediumKey, request.Medium);
        await UpsertSettingAsync(RiskThresholdService.HighKey, request.High);
        await _db.SaveChangesAsync();

        return Ok(new RiskThresholdsResponse
        {
            Verified = request.Verified,
            Low = request.Low,
            Medium = request.Medium,
            High = request.High,
        });
    }

    // ---- Sanctions/watchlist ----

    [HttpGet("watchlist")]
    public async Task<ActionResult<List<WatchlistEntryResponse>>> ListWatchlist()
    {
        var entries = await _db.WatchlistEntries
            .Include(w => w.AddedByUser)
            .OrderByDescending(w => w.CreatedAt)
            .ToListAsync();
        return Ok(entries.Select(ToWatchlistResponse).ToList());
    }

    [HttpPost("watchlist")]
    public async Task<ActionResult<WatchlistEntryResponse>> AddWatchlistEntry(CreateWatchlistEntryRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Address) || string.IsNullOrWhiteSpace(request.Label))
        {
            return BadRequest("Address and label are required.");
        }

        var address = request.Address.Trim();
        if (await _db.WatchlistEntries.AnyAsync(w => w.Address == address))
        {
            return BadRequest("This address is already on the watchlist.");
        }

        var entry = new WatchlistEntry
        {
            Address = address,
            Label = request.Label.Trim(),
            Reason = request.Reason,
            AddedByUserId = CurrentUserId,
        };
        _db.WatchlistEntries.Add(entry);
        await _db.SaveChangesAsync();

        entry.AddedByUser = await _db.Users.FindAsync(CurrentUserId);
        return Ok(ToWatchlistResponse(entry));
    }

    [HttpPut("watchlist/{id:int}")]
    public async Task<ActionResult<WatchlistEntryResponse>> UpdateWatchlistEntry(int id, UpdateWatchlistEntryRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Label))
        {
            return BadRequest("Label is required.");
        }

        var entry = await _db.WatchlistEntries.Include(w => w.AddedByUser).FirstOrDefaultAsync(w => w.Id == id);
        if (entry is null) return NotFound();

        // Address is intentionally not editable here - it's the entry's
        // identity; changing it would silently move which real-world
        // address is sanctioned. Remove and re-add instead if it's wrong.
        entry.Label = request.Label.Trim();
        entry.Reason = request.Reason;
        await _db.SaveChangesAsync();

        return Ok(ToWatchlistResponse(entry));
    }

    [HttpDelete("watchlist/{id:int}")]
    public async Task<ActionResult> RemoveWatchlistEntry(int id)
    {
        var entry = await _db.WatchlistEntries.FindAsync(id);
        if (entry is null) return NotFound();

        _db.WatchlistEntries.Remove(entry);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static WatchlistEntryResponse ToWatchlistResponse(WatchlistEntry w) => new()
    {
        Id = w.Id,
        Address = w.Address,
        Label = w.Label,
        Reason = w.Reason,
        AddedByName = w.AddedByUser?.FullName ?? "Unknown",
        CreatedAt = w.CreatedAt,
    };

    // ---- Recipient (wallet) accounts ----

    [HttpGet("wallets")]
    public async Task<ActionResult<List<WalletAccountResponse>>> ListWalletAccounts()
    {
        var wallets = await _db.WalletAccounts.OrderBy(w => w.Label).ToListAsync();
        return Ok(wallets.Select(ToWalletResponse).ToList());
    }

    [HttpPost("wallets")]
    public async Task<ActionResult<WalletAccountResponse>> CreateWalletAccount(CreateWalletAccountRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Label) || string.IsNullOrWhiteSpace(request.AccountNumber)
            || string.IsNullOrWhiteSpace(request.Address))
        {
            return BadRequest("Label, account number, and address are required.");
        }

        var accountNumber = request.AccountNumber.Trim();
        var address = request.Address.Trim();
        if (await _db.WalletAccounts.AnyAsync(w => w.AccountNumber == accountNumber))
        {
            return BadRequest("An account with this account number already exists.");
        }
        if (await _db.WalletAccounts.AnyAsync(w => w.Address == address))
        {
            return BadRequest("An account with this address already exists.");
        }

        var wallet = new WalletAccount
        {
            Label = request.Label.Trim(),
            AccountNumber = accountNumber,
            Address = address,
            City = request.City.Trim(),
            Country = request.Country.Trim(),
        };
        _db.WalletAccounts.Add(wallet);
        await _db.SaveChangesAsync();
        return Ok(ToWalletResponse(wallet));
    }

    [HttpPut("wallets/{id:int}")]
    public async Task<ActionResult<WalletAccountResponse>> UpdateWalletAccount(int id, UpdateWalletAccountRequest request)
    {
        var wallet = await _db.WalletAccounts.FindAsync(id);
        if (wallet is null) return NotFound();

        var accountNumber = request.AccountNumber.Trim();
        var address = request.Address.Trim();
        if (await _db.WalletAccounts.AnyAsync(w => w.Id != id && w.AccountNumber == accountNumber))
        {
            return BadRequest("Another account already uses this account number.");
        }
        if (await _db.WalletAccounts.AnyAsync(w => w.Id != id && w.Address == address))
        {
            return BadRequest("Another account already uses this address.");
        }

        wallet.Label = request.Label.Trim();
        wallet.AccountNumber = accountNumber;
        wallet.Address = address;
        wallet.City = request.City.Trim();
        wallet.Country = request.Country.Trim();
        wallet.IsActive = request.IsActive;
        await _db.SaveChangesAsync();

        return Ok(ToWalletResponse(wallet));
    }

    [HttpDelete("wallets/{id:int}")]
    public async Task<ActionResult> DeleteWalletAccount(int id)
    {
        var wallet = await _db.WalletAccounts.FindAsync(id);
        if (wallet is null) return NotFound();

        // Safe to hard-delete unconditionally: Transaction.RecipientAddress/
        // RecipientLabel are plain string snapshots taken at transfer time,
        // not a foreign key into this table, so nothing can be orphaned.
        _db.WalletAccounts.Remove(wallet);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static WalletAccountResponse ToWalletResponse(WalletAccount w) => new()
    {
        Id = w.Id,
        Label = w.Label,
        AccountNumber = w.AccountNumber,
        Address = w.Address,
        City = w.City,
        Country = w.Country,
        IsActive = w.IsActive,
        CreatedAt = w.CreatedAt,
    };

    private async Task UpsertSettingAsync(string key, double value)
    {
        var row = await _db.SystemSettings.FirstOrDefaultAsync(s => s.Key == key);
        var stringValue = value.ToString(System.Globalization.CultureInfo.InvariantCulture);
        if (row is null)
        {
            _db.SystemSettings.Add(new SystemSetting
            {
                Key = key,
                Value = stringValue,
                Description = RiskThresholdService.Defaults[key].Description,
            });
        }
        else
        {
            row.Value = stringValue;
        }
    }
}
