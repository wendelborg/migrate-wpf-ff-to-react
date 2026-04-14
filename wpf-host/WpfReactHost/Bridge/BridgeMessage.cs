using System.Collections.Generic;
using Newtonsoft.Json;

namespace WpfReactHost.Bridge
{
    /// <summary>
    /// Mirror of the TypeScript BridgeMessage discriminated union.
    ///
    /// The React side sends JSON like:
    ///   { "type": "NAVIGATE", "payload": { "route": "ContentPageB", "params": { "orderId": 789 } } }
    ///
    /// This class deserializes the envelope. The payload is kept as a loose
    /// dictionary so we don't need a C# type per message — the "type" field
    /// tells us how to interpret it.
    /// </summary>
    public class BridgeMessage
    {
        [JsonProperty("type")]
        public string Type { get; set; }

        [JsonProperty("payload")]
        public Dictionary<string, object> Payload { get; set; }

        public BridgeMessage()
        {
            Type = string.Empty;
            Payload = new Dictionary<string, object>();
        }

        /// <summary>Serialize this message to JSON for posting into a WebView.</summary>
        public string ToJson()
        {
            return JsonConvert.SerializeObject(this);
        }

        /// <summary>Deserialize a JSON string received from a WebView.</summary>
        public static BridgeMessage FromJson(string json)
        {
            return JsonConvert.DeserializeObject<BridgeMessage>(json)
                   ?? new BridgeMessage();
        }
    }
}
