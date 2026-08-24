namespace AiBlockSystem.Api.Models;

public enum UserRole
{
    Analyst,
    Admin,

    /// A deliberately narrow role: can send a transfer (NOC upload,
    /// transfer creation, settlement) and see the resulting transaction,
    /// but has no access to the Dashboard, Transactions/Reports browsing
    /// pages, Protocol Templates, or Admin - enforced both by hiding those
    /// nav links/routes on the frontend and by [Authorize(Roles=...)] on
    /// the backend endpoints that back them. Added at the end of the enum
    /// deliberately - EF Core stores this as a plain int, so inserting a
    /// value earlier would silently renumber Admin's stored value.
    User,
}

public class User
{
    public int Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public UserRole Role { get; set; } = UserRole.Analyst;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// Banking-style account identifier shown to the user, distinct from
    /// any blockchain wallet address - generated once at account creation.
    public string AccountNumber { get; set; } = string.Empty;

    /// Hashed the same way PasswordHash is; required to confirm any
    /// transaction-moving action (create transfer, admin approval, settle).
    public string PinHash { get; set; } = string.Empty;

    public bool EmailVerified { get; set; }
    public string? EmailVerificationCode { get; set; }
    public DateTime? EmailVerificationCodeExpiresAt { get; set; }
}
