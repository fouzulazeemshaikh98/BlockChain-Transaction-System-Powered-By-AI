namespace AiBlockSystem.Api.Models;

public class NocDocument
{
    public int Id { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string StoredFilePath { get; set; } = string.Empty;
    public string DocumentHash { get; set; } = string.Empty;

    public string? ApplicantName { get; set; }
    public string? OriginCity { get; set; }
    public string? OriginCountry { get; set; }
    public string? DestinationCity { get; set; }
    public string? DestinationCountry { get; set; }
    public string? IssuingAuthority { get; set; }
    public string? IssueDateRaw { get; set; }

    /// The monthly transfer cap this NOC authorizes (must be stated on the
    /// document itself, $5,000-$1,000,000, enforced as a hard requirement
    /// by the AI engine - a null value here should never coexist with a
    /// "genuine" verdict).
    public decimal? AuthorizedAmount { get; set; }

    public string Verdict { get; set; } = string.Empty; // "genuine" | "suspicious" | "forged"
    public double AuthenticityScore { get; set; }
    public double RiskScore { get; set; }
    public string FlagsJson { get; set; } = "[]";

    public int UserId { get; set; }
    public User? User { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public bool IsGenuine => Verdict == "genuine";
}
