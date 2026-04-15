using System.Collections.Generic;
using System.Linq;
using System.Web;

namespace WpfReactHost.Hosting
{
    /// <summary>
    /// Maps a React page name plus a props dictionary to a URL path.
    ///
    /// This mirrors the buildPath() logic in react-app/src/bridge/webBridge.ts
    /// so that navigation from either side produces the same URL shape.
    /// </summary>
    public static class PageRouter
    {
        /// <summary>Map a logical page name to its URL base path.</summary>
        private static readonly Dictionary<string, string> PageRoutes =
            new Dictionary<string, string>
            {
                { "ContentPageA", "/content-a" },
                { "ContentPageB", "/content-b" },
            };

        /// <summary>Build a URL path (and optional query string) for the given page + props.</summary>
        public static string BuildPath(string pageName, Dictionary<string, object> props)
        {
            string basePath;
            if (!PageRoutes.TryGetValue(pageName, out basePath))
            {
                basePath = "/" + pageName;
            }

            if (props == null || props.Count == 0)
            {
                return basePath;
            }

            // orderId is a path segment for /content-b
            object orderIdValue;
            if (pageName == "ContentPageB" && props.TryGetValue("orderId", out orderIdValue))
            {
                var remaining = props
                    .Where(kv => kv.Key != "orderId")
                    .ToDictionary(kv => kv.Key, kv => kv.Value);
                return basePath + "/" + orderIdValue + BuildQueryString(remaining);
            }

            return basePath + BuildQueryString(props);
        }

        private static string BuildQueryString(Dictionary<string, object> props)
        {
            if (props == null || props.Count == 0) return string.Empty;

            var parts = new List<string>();
            foreach (var kv in props)
            {
                if (kv.Value == null) continue;
                parts.Add(HttpUtility.UrlEncode(kv.Key) + "=" +
                          HttpUtility.UrlEncode(kv.Value.ToString()));
            }
            return parts.Count == 0 ? string.Empty : "?" + string.Join("&", parts);
        }
    }
}
