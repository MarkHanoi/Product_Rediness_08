// IFCExportTool — activation tool for IFC export dialog (S56 / PHASE-3B).
//
// Wave 12 recipe completion: ifc-export plugin tool.ts (previously missing).
//
// IFC export is an IO operation, not a canvas pointer tool. The "tool"
// dispatches an ifc.export command when the user triggers the export
// action from the file menu or toolbar.

/** Loose CommandBus shape — avoids a direct @pryzm/command-bus import. */
export interface IFCExportCommandBus {
  executeCommand<T>(type: string, payload: T): Promise<unknown>;
}

export interface IFCExportOptions {
  /** IFC schema version. Default: IFC4. */
  readonly schema?: 'IFC2X3' | 'IFC4' | 'IFC4X3';
  /** Filename hint for the browser download prompt. */
  readonly filename?: string;
  /** Project name embedded in the IfcProject entity. */
  readonly projectName?: string;
}

export interface IFCExportToolOptions {
  readonly commandBus: IFCExportCommandBus;
  readonly onError?: (err: unknown) => void;
  readonly onProgress?: (progress: number) => void;
}

/**
 * Activation tool for IFC export.
 *
 * The host calls triggerExport() when the user chooses Export → IFC
 * from the file menu. The command bus routes to the export orchestrator.
 */
export class IFCExportTool {
  private readonly commandBus: IFCExportCommandBus;
  private readonly onError: (err: unknown) => void;
  private disposed = false;

  constructor(opts: IFCExportToolOptions) {
    this.commandBus = opts.commandBus;
    this.onError = opts.onError ?? ((err) => {
      // eslint-disable-next-line no-console
      console.error('[IFCExportTool] error:', err);
    });
  }

  /**
   * Trigger an IFC export for the current project snapshot.
   *
   * The command bus handler (orchestrator.ts) calls exportProjectToIFC()
   * and puts the resulting bytes on the result stream.
   */
  triggerExport(opts: IFCExportOptions = {}): void {
    if (this.disposed) return;
    this.commandBus
      .executeCommand('ifc.export', {
        schema: opts.schema ?? 'IFC4',
        filename: opts.filename ?? 'export.ifc',
        projectName: opts.projectName,
      })
      .catch(this.onError);
  }

  dispose(): void {
    this.disposed = true;
  }
}
