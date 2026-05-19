using System.IO;
using Autodesk.Revit.DB;

namespace PRYZM.Revit.Bridge.Exporters
{
    /// <summary>
    /// Wraps Document.Export with PRYZM-friendly IFC4 defaults:
    ///   - IFC4 schema (matches @pryzm/plugin-ifc-export)
    ///   - SpaceBoundaryLevel = 2 (room/space relationships preserved)
    ///   - ExportInternalRevitPropertySets = true (Revit-specific psets retained)
    ///   - ExportIFCCommonPropertySets = true (Pset_*Common families)
    ///   - Export2DElements = false (Tier 1/2 are 3D only)
    /// </summary>
    public static class IfcExporter
    {
        public static void ExportDocument(Document doc, string ifcPath)
        {
            var options = new IFCExportOptions
            {
                FileVersion = IFCVersion.IFC4,
                SpaceBoundaryLevel = 2,
                ExportInternalRevitPropertySets = true,
                ExportIFCCommonPropertySets = true,
                Export2DElements = false,
            };

            using (var transaction = new Transaction(doc, "Export to IFC"))
            {
                transaction.Start();
                doc.Export(
                    Path.GetDirectoryName(ifcPath),
                    Path.GetFileNameWithoutExtension(ifcPath),
                    options
                );
                transaction.Commit();
            }
        }
    }
}
