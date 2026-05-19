using Autodesk.Revit.DB;
using Autodesk.Revit.DB.IFC;

namespace PRYZM.Revit.Bridge.Exporters
{
    /// <summary>
    /// Revit elements exported via the built-in IFC exporter automatically
    /// use their IfcGuid as the GloballyUniqueId. PRYZM preserves this in
    /// element.ifcData.guid on every imported element, enabling round-trip
    /// matching.
    ///
    /// The mapping is:
    ///   GlobalId = IfcGuid.ToIfcGuid(element.UniqueId)
    /// PRYZM stores this and returns it on export. The add-in re-imports by
    /// matching GlobalId → Revit element and updating in-place.
    /// </summary>
    public static class ElementExporter
    {
        public static string GetIfcGuidForElement(Element element)
        {
            return IfcGuid.ToIfcGuid(element.UniqueId);
        }
    }
}
