using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using AiBlockSystem.Api.Data;
using AiBlockSystem.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace AiBlockSystem.Api.Services;

public class JwtOptions
{
    public string Key { get; set; } = string.Empty;
    public string Issuer { get; set; } = "AiBlockSystem";
    public string Audience { get; set; } = "AiBlockSystem";
    public int ExpiryMinutes { get; set; } = 480;
}

public class AuthService
{
    private readonly AppDbContext _db;
    private readonly JwtOptions _jwtOptions;
    private readonly PasswordHasher<User> _hasher = new();

    public AuthService(AppDbContext db, IOptions<JwtOptions> jwtOptions)
    {
        _db = db;
        _jwtOptions = jwtOptions.Value;
    }

    private static readonly TimeSpan VerificationCodeLifetime = TimeSpan.FromMinutes(15);

    public async Task<bool> EmailExistsAsync(string email) =>
        await _db.Users.AnyAsync(u => u.Email == email);

    public async Task<User?> ValidateCredentialsAsync(string email, string password)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == email);
        if (user is null || !user.IsActive) return null;

        var result = _hasher.VerifyHashedPassword(user, user.PasswordHash, password);
        return result == PasswordVerificationResult.Failed ? null : user;
    }

    /// Verifies a transaction PIN the same way a password is verified.
    /// Used to gate every money-moving action (create transfer, admin
    /// approval, settle) server-side, not just in the UI.
    public bool VerifyPin(User user, string pin)
    {
        if (string.IsNullOrEmpty(user.PinHash)) return false;
        var result = _hasher.VerifyHashedPassword(user, user.PinHash, pin);
        return result != PasswordVerificationResult.Failed;
    }

    public async Task<User> CreateUserAsync(
        string fullName, string email, string password, UserRole role, string pin, bool preVerified = false
    )
    {
        var user = new User { FullName = fullName, Email = email, Role = role };
        user.PasswordHash = _hasher.HashPassword(user, password);
        user.PinHash = _hasher.HashPassword(user, pin);
        user.AccountNumber = await GenerateAccountNumberAsync();

        if (preVerified)
        {
            user.EmailVerified = true;
        }
        else
        {
            user.EmailVerified = false;
            (user.EmailVerificationCode, user.EmailVerificationCodeExpiresAt) = GenerateVerificationCode();
        }

        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        return user;
    }

    /// Regenerates and persists a fresh verification code for an
    /// already-created, not-yet-verified user (used by both registration
    /// and the resend-verification endpoint).
    public async Task<string> RegenerateVerificationCodeAsync(User user)
    {
        (user.EmailVerificationCode, user.EmailVerificationCodeExpiresAt) = GenerateVerificationCode();
        await _db.SaveChangesAsync();
        return user.EmailVerificationCode!;
    }

    public async Task<User?> VerifyEmailCodeAsync(string email, string code)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == email);
        if (user is null || user.EmailVerified) return null;
        if (user.EmailVerificationCode != code) return null;
        if (user.EmailVerificationCodeExpiresAt is null || user.EmailVerificationCodeExpiresAt < DateTime.UtcNow)
        {
            return null;
        }

        user.EmailVerified = true;
        user.EmailVerificationCode = null;
        user.EmailVerificationCodeExpiresAt = null;
        await _db.SaveChangesAsync();
        return user;
    }

    private static (string code, DateTime expiresAt) GenerateVerificationCode()
    {
        var code = Random.Shared.Next(0, 1_000_000).ToString("D6");
        return (code, DateTime.UtcNow.Add(VerificationCodeLifetime));
    }

    private async Task<string> GenerateAccountNumberAsync()
    {
        string candidate;
        do
        {
            candidate = Random.Shared.NextInt64(100_000_000_000, 999_999_999_999).ToString();
        } while (await _db.Users.AnyAsync(u => u.AccountNumber == candidate));
        return candidate;
    }

    /// Exposed for Program.cs's startup backfill of pre-existing user rows
    /// that predate the account-number field.
    public Task<string> GenerateAccountNumberForBackfillAsync() => GenerateAccountNumberAsync();

    /// Exposed for Program.cs's startup backfill of pre-existing user rows
    /// that predate the PIN field - hashes the same way CreateUserAsync does.
    public string HashPin(User user, string pin) => _hasher.HashPassword(user, pin);

    public (string token, DateTime expiresAt) IssueToken(User user)
    {
        var expiresAt = DateTime.UtcNow.AddMinutes(_jwtOptions.ExpiryMinutes);
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Email),
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Name, user.FullName),
            new Claim(ClaimTypes.Role, user.Role.ToString()),
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtOptions.Key));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _jwtOptions.Issuer,
            audience: _jwtOptions.Audience,
            claims: claims,
            expires: expiresAt,
            signingCredentials: creds
        );

        return (new JwtSecurityTokenHandler().WriteToken(token), expiresAt);
    }
}
