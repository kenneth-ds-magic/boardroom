using System.Text.RegularExpressions;

namespace BoardRoom.Api.Services;

public record DeviceClientInfo(string DeviceType, string Browser, string OperatingSystem);

public static class UserAgentParser
{
    public static DeviceClientInfo Parse(string? userAgent)
    {
        if (string.IsNullOrWhiteSpace(userAgent))
        {
            return new DeviceClientInfo("Desktop", "Unknown Browser", "Unknown OS");
        }

        var ua = userAgent.Trim();

        // 1. Operating System
        string os = "Unknown OS";
        if (ua.Contains("Macintosh", StringComparison.OrdinalIgnoreCase) || ua.Contains("Mac OS X", StringComparison.OrdinalIgnoreCase))
            os = "macOS";
        else if (ua.Contains("Windows", StringComparison.OrdinalIgnoreCase))
            os = "Windows";
        else if (ua.Contains("iPhone", StringComparison.OrdinalIgnoreCase) || ua.Contains("iPad", StringComparison.OrdinalIgnoreCase) || ua.Contains("iPod", StringComparison.OrdinalIgnoreCase))
            os = "iOS";
        else if (ua.Contains("Android", StringComparison.OrdinalIgnoreCase))
            os = "Android";
        else if (ua.Contains("Linux", StringComparison.OrdinalIgnoreCase))
            os = "Linux";
        else if (ua.Contains("CrOS", StringComparison.OrdinalIgnoreCase))
            os = "ChromeOS";

        // 2. Device Type
        string deviceType = "Desktop";
        if (ua.Contains("iPad", StringComparison.OrdinalIgnoreCase) || ua.Contains("Tablet", StringComparison.OrdinalIgnoreCase) || (ua.Contains("Android", StringComparison.OrdinalIgnoreCase) && !ua.Contains("Mobile", StringComparison.OrdinalIgnoreCase)))
            deviceType = "Tablet";
        else if (ua.Contains("Mobile", StringComparison.OrdinalIgnoreCase) || ua.Contains("iPhone", StringComparison.OrdinalIgnoreCase) || ua.Contains("Android", StringComparison.OrdinalIgnoreCase))
            deviceType = "Mobile";

        // 3. Browser
        string browser = "Browser";
        if (ua.Contains("Edg/", StringComparison.OrdinalIgnoreCase))
        {
            var match = Regex.Match(ua, @"Edg\/([0-9]+)");
            browser = match.Success ? $"Edge {match.Groups[1].Value}" : "Edge";
        }
        else if (ua.Contains("OPR/", StringComparison.OrdinalIgnoreCase) || ua.Contains("Opera", StringComparison.OrdinalIgnoreCase))
        {
            var match = Regex.Match(ua, @"OPR\/([0-9]+)");
            browser = match.Success ? $"Opera {match.Groups[1].Value}" : "Opera";
        }
        else if (ua.Contains("Chrome/", StringComparison.OrdinalIgnoreCase) && !ua.Contains("Chromium", StringComparison.OrdinalIgnoreCase))
        {
            var match = Regex.Match(ua, @"Chrome\/([0-9]+)");
            browser = match.Success ? $"Chrome {match.Groups[1].Value}" : "Chrome";
        }
        else if (ua.Contains("Firefox/", StringComparison.OrdinalIgnoreCase))
        {
            var match = Regex.Match(ua, @"Firefox\/([0-9]+)");
            browser = match.Success ? $"Firefox {match.Groups[1].Value}" : "Firefox";
        }
        else if (ua.Contains("Safari/", StringComparison.OrdinalIgnoreCase) && !ua.Contains("Chrome", StringComparison.OrdinalIgnoreCase))
        {
            var match = Regex.Match(ua, @"Version\/([0-9]+)");
            browser = match.Success ? $"Safari {match.Groups[1].Value}" : "Safari";
        }

        return new DeviceClientInfo(deviceType, browser, os);
    }
}
