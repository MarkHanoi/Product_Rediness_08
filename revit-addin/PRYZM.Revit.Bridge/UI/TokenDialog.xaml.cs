using System.Windows;

namespace PRYZM.Revit.Bridge.UI
{
    public partial class TokenDialog : Window
    {
        public string Token { get; private set; }

        public TokenDialog()
        {
            InitializeComponent();
        }

        private void OnCancel(object sender, RoutedEventArgs e)
        {
            DialogResult = false;
        }

        private void OnSave(object sender, RoutedEventArgs e)
        {
            Token = TokenBox.Password;
            if (string.IsNullOrWhiteSpace(Token))
            {
                MessageBox.Show("Token cannot be empty.", "PRYZM", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }
            DialogResult = true;
        }
    }
}
