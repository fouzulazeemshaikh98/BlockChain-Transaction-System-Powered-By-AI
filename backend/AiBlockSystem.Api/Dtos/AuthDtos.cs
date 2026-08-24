namespace AiBlockSystem.Api.Dtos;

public class LoginRequest
{
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class LoginResponse
{
    public string Token { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
}

public class RegisterRequest
{
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string ConfirmPassword { get; set; } = string.Empty;
    public string Pin { get; set; } = string.Empty;
    public string ConfirmPin { get; set; } = string.Empty;
}

public class RegisterResponse
{
    public string Email { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;

    /// Simulated "email" - no SMTP is configured in this project, so the
    /// verification code is returned directly here instead of being sent.
    public string DevVerificationCode { get; set; } = string.Empty;
}

public class VerifyEmailRequest
{
    public string Email { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
}

public class ResendVerificationRequest
{
    public string Email { get; set; } = string.Empty;
}

/// A supervisor-override check: does NOT authenticate the caller as this
/// account, it only confirms that {Email, Pin} belongs to a real, active
/// Admin - used to dismiss the DevTools-restriction overlay without
/// switching the current browser session's identity.
public class VerifyAdminPinRequest
{
    public string Email { get; set; } = string.Empty;
    public string Pin { get; set; } = string.Empty;
}

public class ProfileResponse
{
    public int Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string AccountNumber { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}
