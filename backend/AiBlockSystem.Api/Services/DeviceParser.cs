namespace AiBlockSystem.Api.Services;

/// Lightweight User-Agent -> "Browser on OS" summary for the login audit
/// log. Deliberately not a full UA-parsing library (no new dependency) -
/// just enough substring matching to be readable in a log sheet, checked
/// in the order that avoids the common false-positive traps (Edge/Chrome
/// both contain "Safari", Chrome-based browsers all contain "Chrome").
public static class DeviceParser
{
    public static string Summarize(string? userAgent)
    {
        if (string.IsNullOrWhiteSpace(userAgent)) return "Unknown device";

        var ua = userAgent;
        var os = DetectOs(ua);
        var browser = DetectBrowser(ua);
        return $"{browser} on {os}";
    }

    private static string DetectOs(string ua)
    {
        if (ua.Contains("Windows")) return "Windows";
        if (ua.Contains("iPhone") || ua.Contains("iPad")) return "iOS";
        if (ua.Contains("Mac OS")) return "macOS";
        if (ua.Contains("Android")) return "Android";
        if (ua.Contains("Linux")) return "Linux";
        return "Unknown OS";
    }

    private static string DetectBrowser(string ua)
    {
        if (ua.Contains("Edg/")) return "Edge";
        if (ua.Contains("OPR/") || ua.Contains("Opera")) return "Opera";
        if (ua.Contains("Firefox")) return "Firefox";
        if (ua.Contains("Chrome")) return "Chrome";
        if (ua.Contains("Safari")) return "Safari";
        if (ua.Contains("curl") || ua.Contains("Postman") || ua.Contains("insomnia")) return "API client";
        return "Unknown browser";
    }
}
