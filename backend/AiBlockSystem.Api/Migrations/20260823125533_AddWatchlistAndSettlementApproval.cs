using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AiBlockSystem.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddWatchlistAndSettlementApproval : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "ApprovedAt",
                table: "Transactions",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ApprovedByUserId",
                table: "Transactions",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "WatchlistEntries",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Address = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    Label = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    AddedByUserId = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WatchlistEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WatchlistEntries_Users_AddedByUserId",
                        column: x => x.AddedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Transactions_ApprovedByUserId",
                table: "Transactions",
                column: "ApprovedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_WatchlistEntries_AddedByUserId",
                table: "WatchlistEntries",
                column: "AddedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_WatchlistEntries_Address",
                table: "WatchlistEntries",
                column: "Address",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Transactions_Users_ApprovedByUserId",
                table: "Transactions",
                column: "ApprovedByUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Transactions_Users_ApprovedByUserId",
                table: "Transactions");

            migrationBuilder.DropTable(
                name: "WatchlistEntries");

            migrationBuilder.DropIndex(
                name: "IX_Transactions_ApprovedByUserId",
                table: "Transactions");

            migrationBuilder.DropColumn(
                name: "ApprovedAt",
                table: "Transactions");

            migrationBuilder.DropColumn(
                name: "ApprovedByUserId",
                table: "Transactions");
        }
    }
}
