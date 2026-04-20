using System.Collections.Generic;
using System.Windows;
using WpfReactHost.Hosting;

namespace WpfReactHost
{
    public partial class MainWindow : Window
    {
        private readonly WindowManager _windowManager = new WindowManager();

        public MainWindow()
        {
            InitializeComponent();
        }

        private void OpenPageA_Click(object sender, RoutedEventArgs e)
        {
            int customerId;
            if (!int.TryParse(CustomerIdBox.Text, out customerId))
            {
                customerId = 0;
            }

            var props = new Dictionary<string, object>
            {
                { "customerId", customerId }
            };

            _windowManager.Navigate("ContentPageA", props);
            StatusText.Text = string.Format("Opened ContentPageA (customerId={0})", customerId);
        }

        private void OpenPageB_Click(object sender, RoutedEventArgs e)
        {
            int orderId;
            if (!int.TryParse(OrderIdBox.Text, out orderId))
            {
                orderId = 0;
            }

            var props = new Dictionary<string, object>
            {
                { "orderId", orderId },
                { "readonly", ReadonlyCheck.IsChecked == true }
            };

            _windowManager.Navigate("ContentPageB", props);
            StatusText.Text = string.Format("Opened ContentPageB (orderId={0})", orderId);
        }

        private void OpenGroupableTable_Click(object sender, RoutedEventArgs e)
        {
            _windowManager.Navigate("GroupableTable", new Dictionary<string, object>());
            StatusText.Text = "Opened GroupableTable";
        }
    }
}
