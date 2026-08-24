using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AiBlockSystem.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddLoginAttemptContextAndLocation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Every pre-existing row in this table really was a login
            // attempt (the column didn't exist until now), so backfill
            // with "Login" rather than an empty string.
            migrationBuilder.AddColumn<string>(
                name: "Context",
                table: "LoginAttempts",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "Login");

            migrationBuilder.AddColumn<string>(
                name: "Location",
                table: "LoginAttempts",
                type: "nvarchar(max)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Context",
                table: "LoginAttempts");

            migrationBuilder.DropColumn(
                name: "Location",
                table: "LoginAttempts");
        }
    }
}
