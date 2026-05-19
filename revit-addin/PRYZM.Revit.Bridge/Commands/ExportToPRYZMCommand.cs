using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using PRYZM.Revit.Bridge.Exporters;
using PRYZM.Revit.Bridge.UI;

namespace PRYZM.Revit.Bridge.Commands
{
    /// <summary>
    /// Phase 3-B Sprint S57 — `Add-Ins → PRYZM → Export to PRYZM`.
    /// Per PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md §3.4.
    ///
    /// Pipeline:
    ///   1. Use Revit's built-in IFC4 exporter to write a temp .ifc file.
    ///   2. Read bytes; delete temp file.
    ///   3. Show project-selection dialog.
    ///   4. POST multipart/form-data to PRYZM API /v1/projects/{id}/import.
    ///   5. Surface success / failure via TaskDialog.
    ///
    /// GlobalId round-trip:
    ///   Revit's IFC exporter writes IfcGuid.ConvertToIfcGuid(element.UniqueId)
    ///   as the GloballyUniqueId. PRYZM preserves this on every imported
    ///   element so a subsequent re-export round-trips identifiers
    ///   element-by-element.
    /// </summary>
    [Transaction(TransactionMode.ReadOnly)]
    [Regeneration(RegenerationOption.Manual)]
    public class ExportToPRYZMCommand : IExternalCommand
    {
        private static readonly HttpClient HttpClient = new HttpClient();

        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            var uiDoc = commandData.Application.ActiveUIDocument;
            if (uiDoc?.Document == null)
            {
                message = "No active Revit document.";
                return Result.Failed;
            }

            var doc = uiDoc.Document;
            string ifcPath = Path.Combine(Path.GetTempPath(), $"pryzm-export-{Guid.NewGuid():N}.ifc");

            try
            {
                IfcExporter.ExportDocument(doc, ifcPath);

                byte[] ifcBytes = File.ReadAllBytes(ifcPath);

                var dialog = new ExportDialog();
                if (dialog.ShowDialog() != true)
                {
                    return Result.Cancelled;
                }

                UploadToPRYZM(dialog.SelectedProjectId, ifcBytes, dialog.PRYZMToken)
                    .GetAwaiter()
                    .GetResult();

                TaskDialog.Show(
                    "PRYZM Export",
                    $"Successfully exported to PRYZM project {dialog.SelectedProjectId}.{Environment.NewLine}" +
                    "Open your browser to review the import."
                );
                return Result.Succeeded;
            }
            catch (Exception ex)
            {
                message = ex.Message;
                TaskDialog.Show("PRYZM Export Error", ex.Message);
                return Result.Failed;
            }
            finally
            {
                try
                {
                    if (File.Exists(ifcPath)) File.Delete(ifcPath);
                }
                catch
                {
                    // best-effort; OS will clean Temp eventually
                }
            }
        }

        private static async Task UploadToPRYZM(string projectId, byte[] ifcData, string token)
        {
            using (var content = new MultipartFormDataContent())
            {
                var fileContent = new ByteArrayContent(ifcData);
                fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/x-step");
                content.Add(fileContent, "file", "export.ifc");
                content.Add(
                    new StringContent("{\"autoImport\": true}", Encoding.UTF8, "application/json"),
                    "options"
                );

                var request = new HttpRequestMessage(
                    HttpMethod.Post,
                    $"https://api.pryzm.app/v1/projects/{projectId}/import"
                )
                {
                    Content = content,
                };
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await HttpClient.SendAsync(request);
                if (!response.IsSuccessStatusCode)
                {
                    string errorBody = await response.Content.ReadAsStringAsync();
                    throw new Exception($"PRYZM API error {response.StatusCode}: {errorBody}");
                }
            }
        }
    }
}
