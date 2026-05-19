// SheetsTool — sheet editor activation tool (S37 / ADR-0031).
//
// Wave 12 recipe completion: sheets plugin tool.ts (previously missing).
//
// The sheets "tool" is a panel/editor activation action: when the user
// clicks the Sheets button in the toolbar the tool dispatches a command
// to open the sheet editor and optionally activate a specific sheet.

/** Loose CommandBus shape — avoids a direct @pryzm/command-bus import. */
export interface SheetsCommandBus {
  executeCommand<T>(type: string, payload: T): Promise<unknown>;
}

export interface SheetsToolOptions {
  readonly commandBus: SheetsCommandBus;
  readonly onError?: (err: unknown) => void;
}

/**
 * Activation tool for the sheet editor.
 *
 * The host calls createSheet() when the user clicks "+ New Sheet";
 * calls activateSheet() when the user selects a sheet from the sheet list.
 */
export class SheetsTool {
  private readonly commandBus: SheetsCommandBus;
  private readonly onError: (err: unknown) => void;
  private disposed = false;

  constructor(opts: SheetsToolOptions) {
    this.commandBus = opts.commandBus;
    this.onError = opts.onError ?? ((err) => {
      // eslint-disable-next-line no-console
      console.error('[SheetsTool] error:', err);
    });
  }

  /** Create a new sheet. */
  createSheet(sheetNumber: string, title: string, paperSize?: string): void {
    if (this.disposed) return;
    this.commandBus
      .executeCommand('sheet.create', {
        sheetNumber,
        title,
        paperSize: paperSize ?? 'A1',
      })
      .catch(this.onError);
  }

  /** Activate an existing sheet by id. */
  activateSheet(sheetId: string): void {
    if (this.disposed) return;
    this.commandBus
      .executeCommand('sheet.activate', { sheetId })
      .catch(this.onError);
  }

  dispose(): void {
    this.disposed = true;
  }
}
