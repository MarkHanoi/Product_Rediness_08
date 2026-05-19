# PRYZM Revit Add-in v0.1

**Phase 3-B Sprint S57** — Revit → PRYZM bridge (`SPEC-REVIT-BRIDGE §2.5.5`).

C# .NET Framework 4.8 add-in for **Revit 2024**. Exports the active Revit
document via Revit's built-in IFC4 exporter and uploads the result to the
PRYZM API for automatic import.

> This project is part of the PRYZM monorepo for source-control purposes
> only — it is **not** an npm workspace member. Build it with the .NET SDK
> on a Windows machine with Revit 2024 installed.

## Build

```powershell
cd revit-addin
dotnet build PRYZM.Revit.Bridge.csproj -c Release
```

The build produces `PRYZM.Revit.Bridge.dll`. Drop the DLL plus the
provided `PRYZM.Revit.Bridge.addin` manifest into:

```
%AppData%\Autodesk\Revit\Addins\2024\
```

Then restart Revit. The "Export to PRYZM" command appears under the
**Add-Ins** ribbon tab.

## Authentication

The add-in reads the user's PRYZM API token from the Windows Credential
Manager under target name `PRYZM.Revit.Bridge`. To set it:

```powershell
cmdkey /generic:PRYZM.Revit.Bridge /user:pryzm /pass:<your-api-token>
```

The token is requested through the **Add-Ins → PRYZM → Set Token…**
command on first run.

## GlobalId preservation

Revit's IFC exporter writes `IfcGuid.ConvertToIfcGuid(element.UniqueId)` as
the `GloballyUniqueId` of every exported entity. PRYZM stores this on
`element.ifcData.guid` and returns it on export. The add-in re-imports by
matching `GlobalId → Revit element.UniqueId` and updating the element
in-place, closing the round-trip.

## Files

| File | Purpose |
|------|---------|
| `PRYZM.Revit.Bridge.csproj` | .NET 4.8 project file (Revit 2024 API refs) |
| `PRYZM.Revit.Bridge.addin` | Revit add-in manifest |
| `Commands/ExportToPRYZMCommand.cs` | Main `IExternalCommand` |
| `Commands/SetTokenCommand.cs` | One-time API token configuration |
| `Exporters/ElementExporter.cs` | GlobalId helper |
| `Exporters/IfcExporter.cs` | Wraps `Document.Export` with PRYZM defaults |
| `UI/ExportDialog.xaml(.cs)` | Project-selection dialog |
| `Properties/AssemblyInfo.cs` | Standard .NET assembly metadata |
