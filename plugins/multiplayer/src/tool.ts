// MultiplayerTool — presence panel activation tool (S44 / PHASE-2D).
//
// Wave 12 recipe completion: multiplayer plugin tool.ts (previously missing).
//
// The multiplayer "tool" manages awareness broadcast: when the user moves
// their mouse or switches views, it dispatches cursor-move and view-switch
// awareness commands. It also provides lock request/release.

/** Loose CommandBus shape — avoids a direct @pryzm/command-bus import. */
export interface MultiplayerCommandBus {
  executeCommand<T>(type: string, payload: T): Promise<unknown>;
}

export interface MultiplayerToolOptions {
  readonly canvas?: HTMLCanvasElement;
  readonly commandBus: MultiplayerCommandBus;
  readonly localClientID: number;
  /** Initial view the local user is in. */
  readonly viewId: string;
  readonly onError?: (err: unknown) => void;
}

/**
 * MultiplayerTool broadcasts local cursor position and view context to
 * peers via awareness commands, and manages soft-lock requests.
 */
export class MultiplayerTool {
  private readonly commandBus: MultiplayerCommandBus;
  private readonly localClientID: number;
  private currentViewId: string;
  private readonly onError: (err: unknown) => void;
  private disposed = false;
  private readonly ptrMoveHandler?: (e: PointerEvent) => void;

  constructor(opts: MultiplayerToolOptions) {
    this.commandBus = opts.commandBus;
    this.localClientID = opts.localClientID;
    this.currentViewId = opts.viewId;
    this.onError = opts.onError ?? ((err) => {
      // eslint-disable-next-line no-console
      console.error('[MultiplayerTool] error:', err);
    });

    if (opts.canvas) {
      this.ptrMoveHandler = this.onPointerMove.bind(this);
      opts.canvas.addEventListener('pointermove', this.ptrMoveHandler);
    }
  }

  /** Notify peers that the local user switched to a different view. */
  notifyViewSwitch(viewId: string): void {
    if (this.disposed) return;
    this.currentViewId = viewId;
    this.commandBus
      .executeCommand('multiplayer.view.switch', {
        clientID: this.localClientID,
        viewId,
      })
      .catch(this.onError);
  }

  /** Request a soft-lock on an element for exclusive editing. */
  requestLock(elementId: string): void {
    if (this.disposed) return;
    this.commandBus
      .executeCommand('multiplayer.lock.request', { elementId })
      .catch(this.onError);
  }

  /** Release a soft-lock on an element. */
  releaseLock(elementId: string): void {
    if (this.disposed) return;
    this.commandBus
      .executeCommand('multiplayer.lock.release', { elementId })
      .catch(this.onError);
  }

  dispose(): void {
    this.disposed = true;
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.disposed) return;
    this.commandBus
      .executeCommand('multiplayer.cursor.move', {
        clientID: this.localClientID,
        viewId: this.currentViewId,
        x: e.offsetX,
        y: e.offsetY,
      })
      .catch(this.onError);
  }
}
