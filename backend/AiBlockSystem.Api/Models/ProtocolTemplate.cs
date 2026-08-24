namespace AiBlockSystem.Api.Models;

public class ProtocolTemplate
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Network { get; set; } = string.Empty;
    public string? Description { get; set; }

    // Stored as JSON arrays (nvarchar(max)) to keep the schema simple -
    // these are read/written as string[] via the service layer.
    public string ExpectedContracts { get; set; } = "[]";
    public string ExpectedFunctions { get; set; } = "[]";
    public string ExpectedRoutingPath { get; set; } = "[]";
    public string ExpectedParameters { get; set; } = "{}";

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
