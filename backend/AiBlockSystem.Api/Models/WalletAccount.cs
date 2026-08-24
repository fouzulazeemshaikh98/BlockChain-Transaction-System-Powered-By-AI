namespace AiBlockSystem.Api.Models;

/// A recipient branch account for the Send Transfer flow - replaces the
/// old static appsettings.json DemoWallets list with an Admin-managed,
/// DB-backed CRUD entity.
public class WalletAccount
{
    public int Id { get; set; }
    public string Label { get; set; } = string.Empty;
    public string AccountNumber { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public string City { get; set; } = string.Empty;
    public string Country { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
