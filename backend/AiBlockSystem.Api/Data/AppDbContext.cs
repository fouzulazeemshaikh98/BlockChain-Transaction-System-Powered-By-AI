using AiBlockSystem.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace AiBlockSystem.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    /// For provider-specific subclasses (PostgresAppDbContext) that keep
    /// their own migrations set.
    protected AppDbContext(DbContextOptions options) : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<Transaction> Transactions => Set<Transaction>();
    public DbSet<TransactionAnalysis> TransactionAnalyses => Set<TransactionAnalysis>();
    public DbSet<Anomaly> Anomalies => Set<Anomaly>();
    public DbSet<ProtocolTemplate> ProtocolTemplates => Set<ProtocolTemplate>();
    public DbSet<AIAnalysisLog> AIAnalysisLogs => Set<AIAnalysisLog>();
    public DbSet<SystemSetting> SystemSettings => Set<SystemSetting>();
    public DbSet<NocDocument> NocDocuments => Set<NocDocument>();
    public DbSet<WatchlistEntry> WatchlistEntries => Set<WatchlistEntry>();
    public DbSet<WalletAccount> WalletAccounts => Set<WalletAccount>();
    public DbSet<LoginAttempt> LoginAttempts => Set<LoginAttempt>();

    // Risk-gated settlement flow (POST /api/transfers)
    public DbSet<TransferRecord> Transfers => Set<TransferRecord>();
    public DbSet<RiskReport> RiskReports => Set<RiskReport>();
    public DbSet<ModuleScore> ModuleScores => Set<ModuleScore>();
    public DbSet<TemplateMatchResult> TemplateMatchResults => Set<TemplateMatchResult>();
    public DbSet<SettlementRecord> SettlementRecords => Set<SettlementRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>().HasIndex(u => u.Email).IsUnique();
        modelBuilder.Entity<User>().HasIndex(u => u.AccountNumber).IsUnique();

        modelBuilder.Entity<Transaction>()
            .HasOne(t => t.User)
            .WithMany()
            .HasForeignKey(t => t.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Transaction>().Property(t => t.Amount).HasPrecision(28, 8);
        modelBuilder.Entity<Transaction>().Property(t => t.GasUsed).HasPrecision(28, 8);
        modelBuilder.Entity<Transaction>().Property(t => t.GasPrice).HasPrecision(28, 8);

        modelBuilder.Entity<TransactionAnalysis>()
            .HasOne(a => a.Transaction)
            .WithOne(t => t.Analysis)
            .HasForeignKey<TransactionAnalysis>(a => a.TransactionId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Anomaly>()
            .HasOne(a => a.TransactionAnalysis)
            .WithMany(ta => ta.Anomalies)
            .HasForeignKey(a => a.TransactionAnalysisId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<AIAnalysisLog>()
            .HasOne(l => l.Transaction)
            .WithMany()
            .HasForeignKey(l => l.TransactionId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<SystemSetting>().HasIndex(s => s.Key).IsUnique();

        modelBuilder.Entity<NocDocument>()
            .HasOne(n => n.User)
            .WithMany()
            .HasForeignKey(n => n.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<NocDocument>().Property(n => n.AuthorizedAmount).HasPrecision(18, 2);

        modelBuilder.Entity<Transaction>()
            .HasOne(t => t.NocDocument)
            .WithMany()
            .HasForeignKey(t => t.NocDocumentId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<WatchlistEntry>().HasIndex(w => w.Address).IsUnique();
        modelBuilder.Entity<WatchlistEntry>()
            .HasOne(w => w.AddedByUser)
            .WithMany()
            .HasForeignKey(w => w.AddedByUserId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Transaction>()
            .HasOne(t => t.ApprovedByUser)
            .WithMany()
            .HasForeignKey(t => t.ApprovedByUserId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<WalletAccount>().HasIndex(w => w.AccountNumber).IsUnique();
        modelBuilder.Entity<WalletAccount>().HasIndex(w => w.Address).IsUnique();

        modelBuilder.Entity<TransferRecord>().HasIndex(t => t.TransferId).IsUnique();
        modelBuilder.Entity<TransferRecord>().Property(t => t.TransferId).HasMaxLength(66);
        modelBuilder.Entity<TransferRecord>().Property(t => t.Amount).HasPrecision(18, 8);
        modelBuilder.Entity<TransferRecord>()
            .HasOne(t => t.User)
            .WithMany()
            .HasForeignKey(t => t.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<RiskReport>()
            .HasOne(r => r.TransferRecord)
            .WithOne(t => t.RiskReport)
            .HasForeignKey<RiskReport>(r => r.TransferRecordId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<RiskReport>().Property(r => r.FusedScore).HasPrecision(5, 2);

        modelBuilder.Entity<ModuleScore>()
            .HasOne(m => m.RiskReport)
            .WithMany(r => r.ModuleScores)
            .HasForeignKey(m => m.RiskReportId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<ModuleScore>().Property(m => m.Score).HasPrecision(5, 2);

        modelBuilder.Entity<TemplateMatchResult>()
            .HasOne(m => m.TransferRecord)
            .WithMany(t => t.TemplateMatches)
            .HasForeignKey(m => m.TransferRecordId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<TemplateMatchResult>()
            .HasOne(m => m.ProtocolTemplate)
            .WithMany()
            .HasForeignKey(m => m.ProtocolTemplateId)
            .OnDelete(DeleteBehavior.SetNull);
        modelBuilder.Entity<TemplateMatchResult>().Property(m => m.SimilarityScore).HasPrecision(5, 2);

        modelBuilder.Entity<SettlementRecord>()
            .HasOne(s => s.TransferRecord)
            .WithOne(t => t.Settlement)
            .HasForeignKey<SettlementRecord>(s => s.TransferRecordId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
