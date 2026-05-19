using System.Windows;

namespace PRYZM.Revit.Bridge.UI
{
    public partial class ExportDialog : Window
    {
        public string SelectedProjectId { get; private set; }
        public string PRYZMToken { get; private set; }

        public ExportDialog()
        {
            InitializeComponent();
            PRYZMToken = CredentialStore.LoadToken("PRYZM.Revit.Bridge");
            PopulateProjects();
        }

        private void PopulateProjects()
        {
            // v0.1: combo placeholder — v0.2 (S58) calls /v1/projects to list.
            ProjectComboBox.Items.Add("default-project");
            ProjectComboBox.SelectedIndex = 0;
        }

        private void OnCancel(object sender, RoutedEventArgs e)
        {
            DialogResult = false;
        }

        private void OnExport(object sender, RoutedEventArgs e)
        {
            SelectedProjectId = ProjectComboBox.SelectedItem?.ToString() ?? "default-project";
            DialogResult = true;
        }
    }
}
