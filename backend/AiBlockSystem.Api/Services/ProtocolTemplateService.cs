using System.Text.Json;
using AiBlockSystem.Api.Data;
using AiBlockSystem.Api.Dtos;
using AiBlockSystem.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace AiBlockSystem.Api.Services;

public class ProtocolTemplateService
{
    private readonly AppDbContext _db;

    public ProtocolTemplateService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<List<AiProtocolTemplateDto>> GetActiveTemplatesForEngineAsync(string? network = null)
    {
        var query = _db.ProtocolTemplates.Where(t => t.IsActive);
        if (!string.IsNullOrWhiteSpace(network))
        {
            query = query.Where(t => t.Network == network);
        }

        var templates = await query.ToListAsync();
        return templates
            .Select(t => new AiProtocolTemplateDto
            {
                Name = t.Name,
                Network = t.Network,
                ExpectedContracts = Deserialize(t.ExpectedContracts),
                ExpectedFunctions = Deserialize(t.ExpectedFunctions),
                ExpectedRoutingPath = Deserialize(t.ExpectedRoutingPath),
            })
            .ToList();
    }

    public Task<List<ProtocolTemplate>> GetAllAsync() => _db.ProtocolTemplates.ToListAsync();

    public async Task<ProtocolTemplate> CreateAsync(
        string name,
        string network,
        string? description,
        List<string> expectedContracts,
        List<string> expectedFunctions,
        List<string> expectedRoutingPath
    )
    {
        var template = new ProtocolTemplate
        {
            Name = name,
            Network = network,
            Description = description,
            ExpectedContracts = JsonSerializer.Serialize(expectedContracts),
            ExpectedFunctions = JsonSerializer.Serialize(expectedFunctions),
            ExpectedRoutingPath = JsonSerializer.Serialize(expectedRoutingPath),
        };
        _db.ProtocolTemplates.Add(template);
        await _db.SaveChangesAsync();
        return template;
    }

    private static List<string> Deserialize(string json) =>
        JsonSerializer.Deserialize<List<string>>(json) ?? new List<string>();
}
