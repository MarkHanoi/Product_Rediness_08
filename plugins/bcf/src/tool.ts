// BCFTool — panel activation tool for BCF (S59 / ADR-0007).
//
// Wave 12 recipe completion: bcf plugin tool.ts (previously missing).
//
// BCF is an IO plugin — its "tool" is a panel activation action, not a
// pointer-event state machine. The tool dispatches commands to open the
// BCF panel, trigger import/export dialogs, and navigate to viewpoints.

/** Loose CommandBus shape — avoids a direct @pryzm/command-bus import. */
export interface BCFCommandBus {
  executeCommand<T>(type: string, payload: T): Promise<unknown>;
}

export interface BCFToolOptions {
  readonly commandBus: BCFCommandBus;
  readonly onError?: (err: unknown) => void;
}

/**
 * Activation tool for the BCF panel.
 *
 * The host calls activatePanel() when the user clicks the BCF toolbar
 * button; calls triggerImport() when the user picks a BCF file; calls
 * triggerExport() to generate a download.
 */
export class BCFTool {
  private readonly commandBus: BCFCommandBus;
  private readonly onError: (err: unknown) => void;
  private disposed = false;

  constructor(opts: BCFToolOptions) {
    this.commandBus = opts.commandBus;
    this.onError = opts.onError ?? ((err) => {
      // eslint-disable-next-line no-console
      console.error('[BCFTool] error:', err);
    });
  }

  /** Import a BCF archive from raw bytes (e.g. FileReader result). */
  triggerImport(bytes: Uint8Array, projectId?: string): void {
    if (this.disposed) return;
    this.commandBus
      .executeCommand('bcf.import', { bytes, projectId })
      .catch(this.onError);
  }

  /** Export the current BCF archive. */
  triggerExport(filename?: string): void {
    if (this.disposed) return;
    this.commandBus
      .executeCommand('bcf.export', { filename })
      .catch(this.onError);
  }

  /** Navigate camera to a BCF viewpoint. */
  navigateToViewpoint(topicGuid: string, viewpointGuid: string): void {
    if (this.disposed) return;
    this.commandBus
      .executeCommand('bcf.viewpoint.navigate', { topicGuid, viewpointGuid })
      .catch(this.onError);
  }

  dispose(): void {
    this.disposed = true;
  }
}
