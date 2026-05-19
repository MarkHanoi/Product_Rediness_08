// CrossTool — cascade rule management activation tool (ADR-012).
//
// Wave 12 recipe completion: cross plugin tool.ts (previously missing).
//
// The cross plugin "tool" is an administrative action: it registers all
// cascade rules with the command bus when the editor boots. The host
// calls activate() once at plugin activation time.

/** Loose CommandBus shape — avoids a direct @pryzm/command-bus import. */
export interface CrossCommandBus {
  executeCommand<T>(type: string, payload: T): Promise<unknown>;
}

export interface CrossToolOptions {
  readonly commandBus: CrossCommandBus;
  readonly onError?: (err: unknown) => void;
}

/**
 * Activation tool for cross-element cascade rule registration.
 *
 * The host calls activate() once at plugin boot to register all cascade
 * rules. Subsequent cascade commands fire automatically via the bus.
 */
export class CrossTool {
  private readonly commandBus: CrossCommandBus;
  private readonly onError: (err: unknown) => void;
  private disposed = false;
  private activated = false;

  constructor(opts: CrossToolOptions) {
    this.commandBus = opts.commandBus;
    this.onError = opts.onError ?? ((err) => {
      // eslint-disable-next-line no-console
      console.error('[CrossTool] error:', err);
    });
  }

  /**
   * Register all cascade rules with the command bus.
   * Idempotent — safe to call multiple times (force=false by default).
   */
  activate(force = false): void {
    if (this.disposed) return;
    if (this.activated && !force) return;
    this.activated = true;
    this.commandBus
      .executeCommand('cross.registerRules', { force })
      .catch(this.onError);
  }

  dispose(): void {
    this.disposed = true;
  }
}
