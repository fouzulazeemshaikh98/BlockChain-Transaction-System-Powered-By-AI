namespace AiBlockSystem.Api.Dtos;

public class AdminUserResponse
{
    public int Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class UpdateUserStatusRequest
{
    public bool IsActive { get; set; }
}

public class UpdateUserRoleRequest
{
    public string Role { get; set; } = string.Empty; // "Analyst" | "Admin"
}

public class UpdateUserPinRequest
{
    public string Pin { get; set; } = string.Empty;
}

public class RevealCredentialsRequest
{
    public string Password { get; set; } = string.Empty;
}

public class DemoCredentialResponse
{
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
}

public class RevealCredentialsResponse
{
    public List<DemoCredentialResponse> Accounts { get; set; } = new();
    public string TransferPin { get; set; } = string.Empty;
}

public class CreateAdminUserRequest
{
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string Pin { get; set; } = string.Empty;
    public string Role { get; set; } = "Analyst"; // "Analyst" | "Admin"
}

public class AdminLogResponse
{
    public int Id { get; set; }
    public int TransactionId { get; set; }
    public string? TransactionHash { get; set; }
    public string ModuleName { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public long ProcessingTimeMs { get; set; }
    public DateTime CreatedAt { get; set; }
    public string RequestPayload { get; set; } = string.Empty;
    public string ResponsePayload { get; set; } = string.Empty;
}

public class AdminLogPageResponse
{
    public List<AdminLogResponse> Items { get; set; } = new();
    public int TotalCount { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
}

public class RiskThresholdsResponse
{
    public double Verified { get; set; }
    public double Low { get; set; }
    public double Medium { get; set; }
    public double High { get; set; }
}

public class UpdateRiskThresholdsRequest
{
    public double Verified { get; set; }
    public double Low { get; set; }
    public double Medium { get; set; }
    public double High { get; set; }
}

public class AdminLoginAttemptResponse
{
    public int Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public bool Success { get; set; }
    public string? FailureReason { get; set; }
    public string? IpAddress { get; set; }
    public string Device { get; set; } = string.Empty;
    public string Context { get; set; } = "Login";
    public string? Location { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public DateTime AttemptedAt { get; set; }
}

public class AdminLoginAttemptPageResponse
{
    public List<AdminLoginAttemptResponse> Items { get; set; } = new();
    public int TotalCount { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
}

public class AdminOverviewResponse
{
    public int TotalUsers { get; set; }
    public int ActiveUsers { get; set; }
    public int AdminCount { get; set; }
    public int TotalAiCalls { get; set; }
    public int FailedAiCalls { get; set; }
}

public class WatchlistEntryResponse
{
    public int Id { get; set; }
    public string Address { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string? Reason { get; set; }
    public string AddedByName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

public class CreateWatchlistEntryRequest
{
    public string Address { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string? Reason { get; set; }
}

public class UpdateWatchlistEntryRequest
{
    public string Label { get; set; } = string.Empty;
    public string? Reason { get; set; }
}

public class WalletAccountResponse
{
    public int Id { get; set; }
    public string Label { get; set; } = string.Empty;
    public string AccountNumber { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public string City { get; set; } = string.Empty;
    public string Country { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class CreateWalletAccountRequest
{
    public string Label { get; set; } = string.Empty;
    public string AccountNumber { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public string City { get; set; } = string.Empty;
    public string Country { get; set; } = string.Empty;
}

public class UpdateWalletAccountRequest
{
    public string Label { get; set; } = string.Empty;
    public string AccountNumber { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public string City { get; set; } = string.Empty;
    public string Country { get; set; } = string.Empty;
    public bool IsActive { get; set; }
}
