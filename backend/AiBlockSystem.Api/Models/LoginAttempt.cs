namespace AiBlockSystem.Api.Models;

/// One row per POST /api/auth/login call *and* per PIN check on a
/// money-moving action (create transfer, settle, approve, NOC verify),
/// success or failure - a single security audit trail of who tried to
/// authenticate or authorize, from where, on what device, and when.
/// Recorded for the attempted email even when it doesn't match a real
/// account, since a flood of attempts against a nonexistent email is
/// itself a signal worth seeing.
public class LoginAttempt
{
    public int Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public bool Success { get; set; }
    public string? FailureReason { get; set; }
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
    public string Device { get; set; } = string.Empty; // parsed "Browser on OS" summary

    /// What was being attempted - "Login", "VerifyNoc", "CreateTransfer",
    /// "Settle", or "Approve". Lets one table/admin view cover both login
    /// attempts and PIN attempts on every money-moving action.
    public string Context { get; set; } = "Login";

    /// Best-effort city/country resolved from IpAddress (GeoLocationService)
    /// - only ever populated for *failed* attempts, so successful, everyday
    /// PIN checks never pay for an extra network round-trip.
    public string? Location { get; set; }

    /// Coordinates for the same IP-based lookup, so the admin UI can link
    /// straight to Google Maps instead of just showing city/country text.
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }

    public DateTime AttemptedAt { get; set; } = DateTime.UtcNow;
}
