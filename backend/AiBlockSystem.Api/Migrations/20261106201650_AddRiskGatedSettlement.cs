using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AiBlockSystem.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddRiskGatedSettlement : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Transfers",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TransferId = table.Column<string>(type: "nvarchar(66)", maxLength: 66, nullable: false),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    Sender = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Receiver = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ReceiverLabel = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Token = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,8)", precision: 18, scale: 8, nullable: false),
                    Chain = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Nonce = table.Column<long>(type: "bigint", nullable: false),
                    Calldata = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    RiskScore = table.Column<int>(type: "int", nullable: false),
                    Decision = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Findings = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    L2TxHash = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Error = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Transfers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Transfers_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "RiskReports",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TransferRecordId = table.Column<int>(type: "int", nullable: false),
                    FusedScore = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    Decision = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    GeneratedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RiskReports", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RiskReports_Transfers_TransferRecordId",
                        column: x => x.TransferRecordId,
                        principalTable: "Transfers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SettlementRecords",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TransferRecordId = table.Column<int>(type: "int", nullable: false),
                    ContractAddress = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SignatureHash = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TxHash = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SettledAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ChallengePeriodEnd = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SettlementRecords", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SettlementRecords_Transfers_TransferRecordId",
                        column: x => x.TransferRecordId,
                        principalTable: "Transfers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "TemplateMatchResults",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TransferRecordId = table.Column<int>(type: "int", nullable: false),
                    ProtocolTemplateId = table.Column<int>(type: "int", nullable: true),
                    MatchedFunction = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    SimilarityScore = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    Deviations = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TemplateMatchResults", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TemplateMatchResults_ProtocolTemplates_ProtocolTemplateId",
                        column: x => x.ProtocolTemplateId,
                        principalTable: "ProtocolTemplates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_TemplateMatchResults_Transfers_TransferRecordId",
                        column: x => x.TransferRecordId,
                        principalTable: "Transfers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ModuleScores",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    RiskReportId = table.Column<int>(type: "int", nullable: false),
                    ModuleName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Score = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    FlaggedReason = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ModuleScores", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ModuleScores_RiskReports_RiskReportId",
                        column: x => x.RiskReportId,
                        principalTable: "RiskReports",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ModuleScores_RiskReportId",
                table: "ModuleScores",
                column: "RiskReportId");

            migrationBuilder.CreateIndex(
                name: "IX_RiskReports_TransferRecordId",
                table: "RiskReports",
                column: "TransferRecordId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SettlementRecords_TransferRecordId",
                table: "SettlementRecords",
                column: "TransferRecordId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TemplateMatchResults_ProtocolTemplateId",
                table: "TemplateMatchResults",
                column: "ProtocolTemplateId");

            migrationBuilder.CreateIndex(
                name: "IX_TemplateMatchResults_TransferRecordId",
                table: "TemplateMatchResults",
                column: "TransferRecordId");

            migrationBuilder.CreateIndex(
                name: "IX_Transfers_TransferId",
                table: "Transfers",
                column: "TransferId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Transfers_UserId",
                table: "Transfers",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ModuleScores");

            migrationBuilder.DropTable(
                name: "SettlementRecords");

            migrationBuilder.DropTable(
                name: "TemplateMatchResults");

            migrationBuilder.DropTable(
                name: "RiskReports");

            migrationBuilder.DropTable(
                name: "Transfers");
        }
    }
}
