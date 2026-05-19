using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using PRYZM.Revit.Bridge.UI;

namespace PRYZM.Revit.Bridge.Commands
{
    /// <summary>
    /// Stores the user's PRYZM API token in the Windows Credential Manager
    /// under target name "PRYZM.Revit.Bridge". Read by ExportToPRYZMCommand.
    /// </summary>
    [Transaction(TransactionMode.ReadOnly)]
    [Regeneration(RegenerationOption.Manual)]
    public class SetTokenCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            var dialog = new TokenDialog();
            if (dialog.ShowDialog() != true)
            {
                return Result.Cancelled;
            }

            CredentialStore.SaveToken("PRYZM.Revit.Bridge", dialog.Token);
            TaskDialog.Show("PRYZM", "Token saved.");
            return Result.Succeeded;
        }
    }
}
