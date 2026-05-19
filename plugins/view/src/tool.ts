// ViewTool — view switching / panel activation tool (S17 / ADR-0016).
//
// Wave 12 recipe completion: view plugin tool.ts (previously missing).
//
// The view tool dispatches view.switch when the user clicks a view chip
// in the navigation panel. It is a stateless "activation" tool — no
// pointer-event state machine is needed because view switching is
// triggered by panel UI, not by canvas pointer events.

/** Loose CommandBus shape — avoids a direct @pryzm/command-bus import. */
export interface ViewCommandBus {
  executeCommand<T>(type: string, payload: T): Promise<unknown>;
}

export interface ViewSwitchPayload {
  readonly viewId: string;
}

export interface ViewToolOptions {
  readonly commandBus: ViewCommandBus;
  readonly onError?: (err: unknown) => void;
}

/**
 * Stateless tool that activates a named view via the command bus.
 * Typically wired to the view-chip navigation bar in the editor shell.
 */
export class ViewTool {
  private readonly commandBus: ViewCommandBus;
  private readonly onError: (err: unknown) => void;
  private disposed = false;

  constructor(opts: ViewToolOptions) {
    this.commandBus = opts.commandBus;
    this.onError = opts.onError ?? ((err) => {
      // eslint-disable-next-line no-console
      console.error('[ViewTool] error:', err);
    });
  }

  /** Activate the given view by id. */
  activateView(viewId: string): void {
    if (this.disposed) return;
    if (typeof viewId !== 'string' || viewId.length === 0) {
      this.onError(new Error('[ViewTool] viewId must be a non-empty string'));
      return;
    }
    const payload: ViewSwitchPayload = { viewId };
    this.commandBus.executeCommand('view.switch', payload).catch(this.onError);
  }

  dispose(): void {
    this.disposed = true;
  }
}
