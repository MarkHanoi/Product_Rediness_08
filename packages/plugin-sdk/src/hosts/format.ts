// @pryzm/plugin-sdk — Format proxy contract (S62 D3).
//
// File-format plugins extend the editor's import/export pipeline.  A
// format plugin registers an importer (e.g. `.dxf` → element commands)
// and/or an exporter (e.g. project → `.dxf` bytes).  The handlers run
// inside the plugin's iframe sandbox; the host marshals bytes via
// transferable ArrayBuffer.
//
// Format contributions are NOT in the locked 5-kind contribution set
// (tool/panel/command/element-type/view-template).  Instead a format
// plugin REGISTERS its handlers at runtime via the `format` proxy from
// inside `onActivate`.  This keeps the descriptor schema stable while
// allowing the runtime surface to grow.
//
// Permission required: `register:command` (the plugin author opted into
// adding a "Import .dxf" entry in the File menu, which is a command).

/**
 * Importer handler — receives raw bytes + filename, returns an array of
 * commands to dispatch.  The host wraps the dispatch in a transaction so
 * a failed import never leaves a half-imported project.
 */
export type ImporterHandler = (
  input: { bytes: ArrayBuffer; filename: string },
) => Promise<{
  ok: true;
  commands: readonly { kind: string; payload: unknown }[];
} | {
  ok: false;
  error: { code: string; message: string };
}>;

/**
 * Exporter handler — receives a project snapshot, returns bytes to write
 * to the user-chosen path.  Snapshot is delivered as a serialised JSON
 * string (the SDK does not expose the in-memory project graph to keep
 * the public surface narrow; advanced formats can subscribe to stores
 * for incremental access).
 */
export type ExporterHandler = (
  input: { projectJson: string; viewId: string | null },
) => Promise<{
  ok: true;
  bytes: ArrayBuffer;
  suggestedFilename: string;
  mimeType: string;
} | {
  ok: false;
  error: { code: string; message: string };
}>;

/** Returned by `registerImporter`; calling `dispose()` removes the entry. */
export interface FormatImporterRegistration {
  readonly extension: string;     // e.g. '.dxf'
  readonly menuLabel: string;     // e.g. 'Import DXF'
  dispose(): void;
}

/** Returned by `registerExporter`; calling `dispose()` removes the entry. */
export interface FormatExporterRegistration {
  readonly extension: string;     // e.g. '.dxf'
  readonly menuLabel: string;     // e.g. 'Export as DXF'
  dispose(): void;
}

/**
 * Permission required: `register:command` for both register methods.
 */
export interface FormatProxy {
  registerImporter(opts: {
    extension: string;
    menuLabel: string;
    handler: ImporterHandler;
  }): FormatImporterRegistration;

  registerExporter(opts: {
    extension: string;
    menuLabel: string;
    handler: ExporterHandler;
  }): FormatExporterRegistration;
}
