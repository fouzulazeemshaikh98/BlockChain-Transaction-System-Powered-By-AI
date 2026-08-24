using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace AiBlockSystem.Api.Services;

/// A resolved IP location - city/country for display, plus coordinates so
/// the admin UI can link straight to Google Maps. Coordinates are IP-based
/// (city-level accuracy from the geolocation provider), not device GPS -
/// see GeoLocationService's class docs for why that distinction matters.
public class GeoLocation
{
    public string? City { get; set; }
    public string? Country { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }

    public string? DisplayText
    {
        get
        {
            var parts = new[] { City, Country }.Where(p => !string.IsNullOrWhiteSpace(p));
            var joined = string.Join(", ", parts);
            return string.IsNullOrWhiteSpace(joined) ? null : joined;
        }
    }
}

/// Best-effort IP -> city/country/coordinates lookup for the security audit
/// trail (failed login/PIN attempts). Uses the free ip-api.com JSON
/// endpoint, no API key - deliberately only ever called on the failure
/// path (never on every successful PIN check), so normal money-moving
/// actions never pick up extra network latency. Any failure (timeout,
/// private/reserved IP, no network) degrades to a null location rather
/// than blocking the caller's response - this is audit-trail enrichment,
/// not something anything else depends on.
///
/// Deliberately IP-based, not device GPS: a login/PIN form is not a
/// context where prompting for (or silently capturing) a browser
/// geolocation permission on a *failed* auth attempt would be
/// appropriate - that's an invasive pattern regardless of the reason
/// behind the request. IP-based city-level location is the legitimate
/// version of "where did this attempt come from," and is what real
/// security-monitoring tools (GitHub, Google, banks) show for this exact
/// scenario - "new/unusual login location" - so that's what this builds,
/// enriched with a Google Maps link in the admin UI.
public class GeoLocationService
{
    private readonly HttpClient _httpClient;

    public GeoLocationService(HttpClient httpClient)
    {
        _httpClient = httpClient;
        _httpClient.Timeout = TimeSpan.FromSeconds(2);
    }

    public async Task<GeoLocation?> ResolveAsync(string? ipAddress)
    {
        if (string.IsNullOrWhiteSpace(ipAddress)) return null;
        if (ipAddress == "::1" || IsLoopbackOrPrivate(ipAddress))
        {
            return new GeoLocation { City = "Local/Private Network" };
        }

        try
        {
            var response = await _httpClient.GetFromJsonAsync<GeoResponse>(
                $"http://ip-api.com/json/{ipAddress}?fields=status,city,country,lat,lon"
            );
            if (response is null || response.Status != "success") return null;

            return new GeoLocation
            {
                City = response.City,
                Country = response.Country,
                Latitude = response.Lat,
                Longitude = response.Lon,
            };
        }
        catch
        {
            return null;
        }
    }

    private static bool IsLoopbackOrPrivate(string ip)
    {
        if (!IPAddress.TryParse(ip, out var addr)) return false;
        if (IPAddress.IsLoopback(addr)) return true;

        var bytes = addr.GetAddressBytes();
        if (bytes.Length != 4) return false; // only IPv4 private ranges handled here
        return bytes[0] == 10
            || (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31)
            || (bytes[0] == 192 && bytes[1] == 168);
    }

    private class GeoResponse
    {
        [JsonPropertyName("status")]
        public string? Status { get; set; }

        [JsonPropertyName("city")]
        public string? City { get; set; }

        [JsonPropertyName("country")]
        public string? Country { get; set; }

        [JsonPropertyName("lat")]
        public double? Lat { get; set; }

        [JsonPropertyName("lon")]
        public double? Lon { get; set; }
    }
}
