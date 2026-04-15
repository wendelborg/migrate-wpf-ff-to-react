using System.Configuration;

namespace WpfReactHost
{
    /// <summary>
    /// Typed accessor for values in App.config's &lt;appSettings&gt; section.
    /// </summary>
    public static class AppSettings
    {
        /// <summary>
        /// Base URL of the React SPA, e.g. "http://localhost:5173" or
        /// "https://apps.contoso.com/myapp". Never ends with a slash.
        /// </summary>
        public static string ReactAppBaseUrl
        {
            get
            {
                string value = ConfigurationManager.AppSettings["ReactAppBaseUrl"];
                if (string.IsNullOrWhiteSpace(value))
                {
                    value = "http://localhost:5173";
                }
                return value.TrimEnd('/');
            }
        }
    }
}
