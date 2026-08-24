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
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly AuthService _auth;
    private readonly AppDbContext _db;
    private readonly GeoLocationService _geo;

    public AuthController(AuthService auth, AppDbContext db, GeoLocationService geo)
    {
        _auth = auth;
        _db = db;
        _geo = geo;
    }

    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<ActionResult<RegisterResponse>> Register(RegisterRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.FullName) || string.IsNullOrWhiteSpace(request.Email))
        {
            return BadRequest("Full name and email are required.");
        }
        if (request.Password.Length < 6)
        {
            return BadRequest("Password must be at least 6 characters.");
        }
        if (request.Password != request.ConfirmPassword)
        {
            return BadRequest("Passwords do not match.");
        }
        if (!System.Text.RegularExpressions.Regex.IsMatch(request.Pin, "^[0-9]{4,6}$"))
        {
            return BadRequest("PIN must be 4-6 digits.");
        }
        if (request.Pin != request.ConfirmPin)
        {
            return BadRequest("PINs do not match.");
        }
        if (await _auth.EmailExistsAsync(request.Email))
        {
            return BadRequest("An account with this email already exists.");
        }

        // Public self-registration always creates an Analyst account; only an
        // existing Admin can promote a user, which is out of scope for this phase.
        var user = await _auth.CreateUserAsync(
            request.FullName, request.Email, request.Password, UserRole.Analyst, request.Pin
        );

        return Ok(
            new RegisterResponse
            {
                Email = user.Email,
                Message = $"A verification code was sent to {user.Email}.",
                DevVerificationCode = user.EmailVerificationCode!,
            }
        );
    }

    [HttpPost("verify-email")]
    [AllowAnonymous]
    public async Task<ActionResult<LoginResponse>> VerifyEmail(VerifyEmailRequest request)
    {
        var user = await _auth.VerifyEmailCodeAsync(request.Email, request.Code);
        if (user is null)
        {
            return BadRequest("That code is invalid or has expired.");
        }

        var (token, expiresAt) = _auth.IssueToken(user);
        return Ok(
            new LoginResponse
            {
                Token = token,
                FullName = user.FullName,
                Email = user.Email,
                Role = user.Role.ToString(),
                ExpiresAt = expiresAt,
            }
        );
    }

    [HttpPost("resend-verification")]
    [AllowAnonymous]
    public async Task<ActionResult<RegisterResponse>> ResendVerification(ResendVerificationRequest request)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == request.Email);
        if (user is null || user.EmailVerified)
        {
            return BadRequest("No pending verification for that email.");
        }

        var code = await _auth.RegenerateVerificationCodeAsync(user);
        return Ok(
            new RegisterResponse
            {
                Email = user.Email,
                Message = $"A new verification code was sent to {user.Email}.",
                DevVerificationCode = code,
            }
        );
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<LoginResponse>> Login(LoginRequest request)
    {
        var user = await _auth.ValidateCredentialsAsync(request.Email, request.Password);
        if (user is null)
        {
            await RecordLoginAttemptAsync(request.Email, success: false, "Invalid email or password.");
            return Unauthorized("Invalid email or password.");
        }
        if (!user.IsActive)
        {
            await RecordLoginAttemptAsync(request.Email, success: false, "Account deactivated.");
            return Unauthorized("This account has been deactivated. Contact an administrator.");
        }
        if (!user.EmailVerified)
        {
            await RecordLoginAttemptAsync(request.Email, success: false, "Email not verified.");
            return StatusCode(403, "EMAIL_NOT_VERIFIED: Please verify your email before logging in.");
        }

        await RecordLoginAttemptAsync(request.Email, success: true, failureReason: null);

        var (token, expiresAt) = _auth.IssueToken(user);
        return Ok(
            new LoginResponse
            {
                Token = token,
                FullName = user.FullName,
                Email = user.Email,
                Role = user.Role.ToString(),
                ExpiresAt = expiresAt,
            }
        );
    }

    /// Supervisor-override check for the frontend's DevTools-restriction
    /// overlay (components/DevToolsGuard.tsx) - confirms {Email, Pin}
    /// belongs to a real, active Admin without switching the caller's own
    /// session to that account. Any authenticated user can call this (it's
    /// exactly the scenario where a non-admin is the one locked out and
    /// needs an admin to clear it), but the email/PIN pair checked must
    /// itself resolve to an Admin - a correct PIN for a non-admin account
    /// does not unlock this. Failed attempts join the same security audit
    /// trail as every other PIN check in this app.
    [HttpPost("verify-admin-pin")]
    [Authorize]
    public async Task<ActionResult> VerifyAdminPin(VerifyAdminPinRequest request)
    {
        var admin = await _db.Users.FirstOrDefaultAsync(u => u.Email == request.Email);
        var ok = admin is not null && admin.IsActive && admin.Role == UserRole.Admin && _auth.VerifyPin(admin, request.Pin);

        if (!ok)
        {
            var userAgent = Request.Headers.UserAgent.ToString();
            var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
            var geo = await _geo.ResolveAsync(ip);
            _db.LoginAttempts.Add(
                new LoginAttempt
                {
                    Email = request.Email,
                    Success = false,
                    FailureReason = "Incorrect admin PIN or not an admin account.",
                    IpAddress = ip,
                    UserAgent = userAgent,
                    Device = DeviceParser.Summarize(userAgent),
                    Context = "DevToolsOverride",
                    Location = geo?.DisplayText,
                    Latitude = geo?.Latitude,
                    Longitude = geo?.Longitude,
                }
            );
            await _db.SaveChangesAsync();
            return Unauthorized("Incorrect admin PIN.");
        }

        return NoContent();
    }

    /// Security audit trail for every login call, success or failure -
    /// recorded even for emails that don't match a real account, since a
    /// flood of attempts against a nonexistent email is itself a signal.
    private async Task RecordLoginAttemptAsync(string email, bool success, string? failureReason)
    {
        var userAgent = Request.Headers.UserAgent.ToString();
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
        // Only resolved on failure - a successful login shouldn't pay for an
        // extra network round-trip on every request.
        var geo = success ? null : await _geo.ResolveAsync(ip);
        _db.LoginAttempts.Add(
            new LoginAttempt
            {
                Email = email,
                Success = success,
                FailureReason = failureReason,
                IpAddress = ip,
                UserAgent = userAgent,
                Device = DeviceParser.Summarize(userAgent),
                Context = "Login",
                Location = geo?.DisplayText,
                Latitude = geo?.Latitude,
                Longitude = geo?.Longitude,
            }
        );
        await _db.SaveChangesAsync();
    }

    [HttpGet("profile")]
    [Authorize]
    public async Task<ActionResult<ProfileResponse>> Profile()
    {
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var user = await _db.Users.FindAsync(userId);
        if (user is null) return NotFound();

        return Ok(
            new ProfileResponse
            {
                Id = user.Id,
                FullName = user.FullName,
                Email = user.Email,
                Role = user.Role.ToString(),
                AccountNumber = user.AccountNumber,
                CreatedAt = user.CreatedAt,
            }
        );
    }
}
