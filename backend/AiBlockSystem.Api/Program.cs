using System.Text;
using System.Text.Json;
using AiBlockSystem.Api.Data;
using AiBlockSystem.Api.Dtos;
using AiBlockSystem.Api.Models;
using AiBlockSystem.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Convenience: if `contracts/scripts/deploy.ts` has already run against the
// local Hardhat network, pick up the deployed TransactionGateway address
// automatically instead of requiring a manual appsettings edit.
var deploymentsFile = Path.Combine(
    builder.Environment.ContentRootPath, "..", "..", "contracts", "deployments", "localhost.json"
);
if (File.Exists(deploymentsFile))
{
    try
    {
        using var stream = File.OpenRead(deploymentsFile);
        var deployment = JsonSerializer.Deserialize<JsonElement>(stream);
        if (deployment.TryGetProperty("transactionGateway", out var addressElement))
        {
            builder.Configuration["Blockchain:GatewayContractAddress"] = addressElement.GetString();
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Warning: could not read deployments/localhost.json: {ex.Message}");
    }
}

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection"))
);

builder.Services.Configure<AiEngineOptions>(builder.Configuration.GetSection("AiEngine"));
builder.Services.Configure<BlockchainOptions>(builder.Configuration.GetSection("Blockchain"));
builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection("Jwt"));

builder.Services.AddHttpClient<FastApiClientService>();
builder.Services.AddHttpClient<GeoLocationService>();
builder.Services.AddSingleton<BlockchainService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<ProtocolTemplateService>();
builder.Services.AddScoped<ReportService>();
builder.Services.AddScoped<AnalysisOrchestrationService>();
builder.Services.AddScoped<RiskThresholdService>();

var jwtSection = builder.Configuration.GetSection("Jwt");
var jwtKey = jwtSection["Key"] ?? throw new InvalidOperationException("Jwt:Key is not configured.");

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // Without this, the handler's legacy inbound claim mapping remaps
        // the short "sub" claim to the same ClaimTypes.NameIdentifier URI we
        // already use explicitly for the numeric user id - producing two
        // colliding claims (email vs id) under one type, with whichever one
        // enumerates first silently winning at FindFirstValue() call sites.
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtSection["Issuer"],
            ValidAudience = jwtSection["Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
        };
    });
builder.Services.AddAuthorization();

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? new[] { "http://localhost:5173" };

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod()
    );
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();

    var authService = scope.ServiceProvider.GetRequiredService<AuthService>();

    if (!db.Users.Any())
    {
        await authService.CreateUserAsync(
            "System Admin", "admin@aiblocksystem.local", "admin123", UserRole.Admin, "1234", preVerified: true
        );
        await authService.CreateUserAsync(
            "Demo Analyst", "analyst@aiblocksystem.local", "analyst123", UserRole.Analyst, "1234", preVerified: true
        );
        Console.WriteLine(
            "Seeded demo accounts: admin@aiblocksystem.local/admin123 (Admin), "
            + "analyst@aiblocksystem.local/analyst123 (Analyst), transfer PIN 1234 for both. "
            + "Change these before any real deployment."
        );
    }

    // Grandfather clause: any user row created before the PIN/email-
    // verification feature existed has an empty PinHash and needs a
    // default PIN + verified status so they aren't locked out - a fresh
    // checkout has none of these, so this is a no-op there.
    var legacyUsers = await db.Users.Where(u => u.PinHash == "").ToListAsync();
    if (legacyUsers.Count > 0)
    {
        foreach (var legacyUser in legacyUsers)
        {
            legacyUser.PinHash = authService.HashPin(legacyUser, "1234");
            legacyUser.EmailVerified = true;
            if (string.IsNullOrEmpty(legacyUser.AccountNumber))
            {
                legacyUser.AccountNumber = await authService.GenerateAccountNumberForBackfillAsync();
            }
        }
        await db.SaveChangesAsync();
        Console.WriteLine(
            $"Backfilled {legacyUsers.Count} pre-existing account(s) with default PIN 1234 and verified email."
        );
    }

    if (!db.ProtocolTemplates.Any())
    {
        var templates = scope.ServiceProvider.GetRequiredService<ProtocolTemplateService>();
        await templates.CreateAsync(
            "ERC20 Transfer", "Ethereum", "Standard token transfer.",
            expectedContracts: new(), expectedFunctions: new() { "transfer(address,uint256)" }, expectedRoutingPath: new()
        );
        await templates.CreateAsync(
            "ERC20 Approve", "Ethereum", "Grants a spending allowance to a third party.",
            expectedContracts: new(), expectedFunctions: new() { "approve(address,uint256)" }, expectedRoutingPath: new()
        );
        await templates.CreateAsync(
            "Uniswap Swap", "Ethereum", "Token swap via a Uniswap-style router.",
            expectedContracts: new(), expectedFunctions: new() { "approve", "swapExactTokensForTokens" }, expectedRoutingPath: new()
        );
        await templates.CreateAsync(
            "Arbitrum Bridge", "Arbitrum", "L1-to-L2 bridging deposit.",
            expectedContracts: new(), expectedFunctions: new() { "depositEth", "outboundTransfer" }, expectedRoutingPath: new()
        );
        Console.WriteLine("Seeded 4 built-in protocol templates.");
    }

    var riskThresholds = scope.ServiceProvider.GetRequiredService<RiskThresholdService>();
    await riskThresholds.SeedDefaultsAsync();

    if (!db.WalletAccounts.Any())
    {
        db.WalletAccounts.AddRange(
            new WalletAccount { Label = "Karachi Branch", Address = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", AccountNumber = "100200300401", City = "Karachi", Country = "Pakistan" },
            new WalletAccount { Label = "Dubai Branch", Address = "0x90F79bf6EB2c4f870365E785982E1f101E93b906", AccountNumber = "100200300402", City = "Dubai", Country = "United Arab Emirates" },
            new WalletAccount { Label = "London Branch", Address = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", AccountNumber = "100200300403", City = "London", Country = "United Kingdom" },
            new WalletAccount { Label = "Doha Branch", Address = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", AccountNumber = "100200300404", City = "Doha", Country = "Qatar" }
        );
        await db.SaveChangesAsync();
        Console.WriteLine("Seeded 4 demo recipient branch accounts (now Admin-manageable under Recipient Accounts).");
    }
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
