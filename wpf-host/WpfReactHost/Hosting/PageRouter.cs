using System.Collections.Generic;
using System.Web;

namespace WpfReactHost.Hosting
{
    /// <summary>
    /// Maps a React page name plus a props dictionary to a URL path.
    ///
    /// Page routes use React Router-style templates with <c>:param</c>
    /// placeholders. Props whose keys match a placeholder are consumed as
    /// path segments; any remaining props are emitted as a query string.
    ///
    /// This mirrors the buildPath() logic in react-app/src/bridge/webBridge.ts
    /// so that navigation from either side produces the same URL shape.
    /// </summary>
    public static class PageRouter
    {
        /// <summary>Map a logical page name to its route template.</summary>
        private static readonly Dictionary<string, string> PageRoutes =
            new Dictionary<string, string>
            {
                { "ContentPageA", "/content-a" },
                { "ContentPageB", "/content-b/:orderId" },
            };

        /// <summary>Build a URL path (and optional query string) for the given page + props.</summary>
        public static string BuildPath(string pageName, Dictionary<string, object> props)
        {
            string template;
            if (!PageRoutes.TryGetValue(pageName, out template))
            {
                template = "/" + pageName;
            }

            var remaining = props != null
                ? new Dictionary<string, object>(props)
                : new Dictionary<string, object>();

            // Walk the template segments, substituting :param placeholders
            // from props. Unmatched placeholders are dropped (optional segments).
            var segments = new List<string>();
            foreach (var segment in template.Split('/'))
            {
                if (segment.Length > 0 && segment[0] == ':')
                {
                    var key = segment.Substring(1);
                    object value;
                    if (remaining.TryGetValue(key, out value) && value != null)
                    {
                        segments.Add(HttpUtility.UrlEncode(value.ToString()));
                        remaining.Remove(key);
                    }
                }
                else
                {
                    segments.Add(segment);
                }
            }

            string path = string.Join("/", segments);
            if (string.IsNullOrEmpty(path)) path = "/";

            return path + BuildQueryString(remaining);
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
