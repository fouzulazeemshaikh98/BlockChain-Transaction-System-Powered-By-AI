using System.Text.Json;
using AiBlockSystem.Api.Data;
using AiBlockSystem.Api.Dtos;
using AiBlockSystem.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AiBlockSystem.Api.Controllers;

[ApiController]
[Route("api/templates")]
[Authorize(Roles = "Admin,Analyst")]
public class TemplatesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ProtocolTemplateService _templates;

    public TemplatesController(AppDbContext db, ProtocolTemplateService templates)
    {
        _db = db;
        _templates = templates;
    }

    [HttpGet]
    public async Task<ActionResult<List<ProtocolTemplateResponse>>> List()
    {
        var templates = await _templates.GetAllAsync();
        return Ok(templates.Select(ToResponse).ToList());
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ProtocolTemplateResponse>> Get(int id)
    {
        var template = await _db.ProtocolTemplates.FindAsync(id);
        return template is null ? NotFound() : Ok(ToResponse(template));
    }

    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<ProtocolTemplateResponse>> Create(CreateProtocolTemplateRequest request)
    {
        var template = await _templates.CreateAsync(
            request.Name,
            request.Network,
            request.Description,
            request.ExpectedContracts,
            request.ExpectedFunctions,
            request.ExpectedRoutingPath
        );
        return Ok(ToResponse(template));
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<ProtocolTemplateResponse>> Update(int id, CreateProtocolTemplateRequest request)
    {
        var template = await _db.ProtocolTemplates.FindAsync(id);
        if (template is null) return NotFound();

        template.Name = request.Name;
        template.Network = request.Network;
        template.Description = request.Description;
        template.ExpectedContracts = JsonSerializer.Serialize(request.ExpectedContracts);
        template.ExpectedFunctions = JsonSerializer.Serialize(request.ExpectedFunctions);
        template.ExpectedRoutingPath = JsonSerializer.Serialize(request.ExpectedRoutingPath);

        await _db.SaveChangesAsync();
        return Ok(ToResponse(template));
    }

    [HttpDelete("{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult> Delete(int id)
    {
        var template = await _db.ProtocolTemplates.FindAsync(id);
        if (template is null) return NotFound();

        _db.ProtocolTemplates.Remove(template);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static ProtocolTemplateResponse ToResponse(Models.ProtocolTemplate t) =>
        new()
        {
            Id = t.Id,
            Name = t.Name,
            Network = t.Network,
            Description = t.Description,
            ExpectedContracts = JsonSerializer.Deserialize<List<string>>(t.ExpectedContracts) ?? new(),
            ExpectedFunctions = JsonSerializer.Deserialize<List<string>>(t.ExpectedFunctions) ?? new(),
            ExpectedRoutingPath = JsonSerializer.Deserialize<List<string>>(t.ExpectedRoutingPath) ?? new(),
            IsActive = t.IsActive,
            CreatedAt = t.CreatedAt,
        };
}
