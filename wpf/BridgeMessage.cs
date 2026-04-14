using System.Text.Json.Serialization;

namespace WpfReactHost;

/// <summary>
/// Mirror of the TypeScript BridgeMessage discriminated union.
/// Extend with new event types as pages are migrated.
/// </summary>
public class BridgeMessage
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = "";

    [JsonPropertyName("payload")]
    public Dictionary<string, object?> Payload { get; set; } = new();
}
