using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace AiBlockSystem.Api.Data;

/// Same model as AppDbContext, but bound to PostgreSQL with its own
/// migrations in Migrations/Postgres. Used when Database:Provider=Postgres
/// (the Render deployment); local development keeps SQL Server and the
/// original Migrations folder. Registered in DI as AppDbContext, so no
/// controller or service needs to know which provider is active.
public class PostgresAppDbContext : AppDbContext
{
    public PostgresAppDbContext(DbContextOptions<PostgresAppDbContext> options) : base(options)
    {
    }
}

/// Lets `dotnet ef migrations add ... --context PostgresAppDbContext` build
/// the context without a live database or the app's startup configuration.
public class PostgresAppDbContextFactory : IDesignTimeDbContextFactory<PostgresAppDbContext>
{
    public PostgresAppDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<PostgresAppDbContext>()
            .UseNpgsql("Host=localhost;Database=aiblock_design;Username=postgres;Password=postgres")
            .Options;
        return new PostgresAppDbContext(options);
    }
}

/// Design-time factory for the SQL Server context. Without it, `dotnet ef
/// --context AppDbContext` resolves to the Postgres factory above (its
/// context is a subclass of AppDbContext). Reads the same connection string
/// the app uses locally.
public class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var config = new Microsoft.Extensions.Configuration.ConfigurationBuilder()
            .SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile("appsettings.json", optional: true)
            .AddEnvironmentVariables()
            .Build();
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer(config.GetConnectionString("DefaultConnection"))
            .Options;
        return new AppDbContext(options);
    }
}
