using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AiBlockSystem.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPinEmailVerificationAccountNumber : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AccountNumber",
                table: "Users",
                type: "nvarchar(450)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "EmailVerificationCode",
                table: "Users",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "EmailVerificationCodeExpiresAt",
                table: "Users",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "EmailVerified",
                table: "Users",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "PinHash",
                table: "Users",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            // Every pre-existing row just got AccountNumber = '' from the
            // defaultValue above - a unique index over that would fail with
            // more than one existing user. Derive a unique placeholder from
            // Id before the index goes on; Program.cs's startup backfill
            // replaces these with real generated account numbers afterwards
            // (this is purely to let the index creation below succeed).
            migrationBuilder.Sql(
                "UPDATE Users SET AccountNumber = CONCAT('9', RIGHT('00000000000' + CAST(Id AS VARCHAR(11)), 11)) WHERE AccountNumber = ''"
            );

            migrationBuilder.CreateIndex(
                name: "IX_Users_AccountNumber",
                table: "Users",
                column: "AccountNumber",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Users_AccountNumber",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "AccountNumber",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "EmailVerificationCode",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "EmailVerificationCodeExpiresAt",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "EmailVerified",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "PinHash",
                table: "Users");
        }
    }
}
