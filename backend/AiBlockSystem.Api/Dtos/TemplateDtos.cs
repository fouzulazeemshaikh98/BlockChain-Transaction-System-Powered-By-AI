namespace AiBlockSystem.Api.Dtos;

public class CreateProtocolTemplateRequest
{
    public string Name { get; set; } = string.Empty;
    public string Network { get; set; } = string.Empty;
    public string? Description { get; set; }
    public List<string> ExpectedContracts { get; set; } = new();
    public List<string> ExpectedFunctions { get; set; } = new();
    public List<string> ExpectedRoutingPath { get; set; } = new();
}

public class ProtocolTemplateResponse
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Network { get; set; } = string.Empty;
    public string? Description { get; set; }
    public List<string> ExpectedContracts { get; set; } = new();
    public List<string> ExpectedFunctions { get; set; } = new();
    public List<string> ExpectedRoutingPath { get; set; } = new();
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
}
