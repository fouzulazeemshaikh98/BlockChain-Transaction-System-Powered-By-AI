using AiBlockSystem.Api.Data;
using AiBlockSystem.Api.Dtos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AiBlockSystem.Api.Controllers;

[ApiController]
[Route("api/wallets")]
[Authorize]
public class WalletsController : ControllerBase
{
    private readonly AppDbContext _db;

    public WalletsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<List<DemoWalletDto>>> List()
    {
        var wallets = await _db.WalletAccounts
            .Where(w => w.IsActive)
            .OrderBy(w => w.Label)
            .Select(w => new DemoWalletDto
            {
                Label = w.Label,
                Address = w.Address,
                AccountNumber = w.AccountNumber,
                City = w.City,
                Country = w.Country,
            })
            .ToListAsync();

        return Ok(wallets);
    }
}
