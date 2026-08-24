using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AiBlockSystem.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddNocDocumentAndSettlement : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "NocDocumentId",
                table: "Transactions",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RecipientAddress",
                table: "Transactions",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RecipientLabel",
                table: "Transactions",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SettlementError",
                table: "Transactions",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SettlementStatus",
                table: "Transactions",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "SettlementTxHash",
                table: "Transactions",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "NocDocuments",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    FileName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    StoredFilePath = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DocumentHash = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ApplicantName = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    OriginCity = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    OriginCountry = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    DestinationCity = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    DestinationCountry = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IssuingAuthority = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IssueDateRaw = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Verdict = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    AuthenticityScore = table.Column<double>(type: "float", nullable: false),
                    RiskScore = table.Column<double>(type: "float", nullable: false),
                    FlagsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NocDocuments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_NocDocuments_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Transactions_NocDocumentId",
                table: "Transactions",
                column: "NocDocumentId");

            migrationBuilder.CreateIndex(
                name: "IX_NocDocuments_UserId",
                table: "NocDocuments",
                column: "UserId");

            migrationBuilder.AddForeignKey(
                name: "FK_Transactions_NocDocuments_NocDocumentId",
                table: "Transactions",
                column: "NocDocumentId",
                principalTable: "NocDocuments",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Transactions_NocDocuments_NocDocumentId",
                table: "Transactions");

            migrationBuilder.DropTable(
                name: "NocDocuments");

            migrationBuilder.DropIndex(
                name: "IX_Transactions_NocDocumentId",
                table: "Transactions");

            migrationBuilder.DropColumn(
                name: "NocDocumentId",
                table: "Transactions");

            migrationBuilder.DropColumn(
                name: "RecipientAddress",
                table: "Transactions");

            migrationBuilder.DropColumn(
                name: "RecipientLabel",
                table: "Transactions");

            migrationBuilder.DropColumn(
                name: "SettlementError",
                table: "Transactions");

            migrationBuilder.DropColumn(
                name: "SettlementStatus",
                table: "Transactions");

            migrationBuilder.DropColumn(
                name: "SettlementTxHash",
                table: "Transactions");
        }
    }
}
