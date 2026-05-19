// PlanViewTool — level activation + element interaction tool (S33 / PHASE-2B).
//
// Wave 12 recipe completion: plan-view plugin tool.ts (previously missing).
//
// The plan-view "tool" manages two interaction modes:
//   1. Level selection — user clicks a level chip to activate a level
//   2. Element interaction — pointer events on the canvas drive element
//      move/select commands (wired from drag.ts + selection.ts already
//      in plan-view/src/)
//
// This file exposes the level-activation sub-tool that the editor
// shell calls when the user switches levels from the level picker.

/** Loose CommandBus shape — avoids a direct @pryzm/command-bus import. */
export interface PlanViewCommandBus {
  executeCommand<T>(type: string, payload: T): Promise<unknown>;
}

export interface PlanViewToolOptions {
  readonly commandBus: PlanViewCommandBus;
  readonly onError?: (err: unknown) => void;
}

/**
 * PlanViewTool exposes level-activation and view-state commands.
 * Canvas pointer-event handling lives in drag.ts and selection.ts —
 * those modules are composed into the PlanViewCanvasHost at runtime.
 */
export class PlanViewTool {
  private readonly commandBus: PlanViewCommandBus;
  private readonly onError: (err: unknown) => void;
  private disposed = false;

  constructor(opts: PlanViewToolOptions) {
    this.commandBus = opts.commandBus;
    this.onError = opts.onError ?? ((err) => {
      // eslint-disable-next-line no-console
      console.error('[PlanViewTool] error:', err);
    });
  }

  /** Activate a level (makes it the current plan-view slice). */
  activateLevel(levelId: string): void {
    if (this.disposed) return;
    if (typeof levelId !== 'string' || levelId.length === 0) {
      this.onError(new Error('[PlanViewTool] levelId must be a non-empty string'));
      return;
    }
    this.commandBus
      .executeCommand('plan-view.level.activate', { levelId })
      .catch(this.onError);
  }

  /** Clear the plan-view selection. */
  clearSelection(): void {
    if (this.disposed) return;
    this.commandBus
      .executeCommand('plan-view.selection.clear', {})
      .catch(this.onError);
  }

  dispose(): void {
    this.disposed = true;
  }
}
