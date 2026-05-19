/**
 * @pryzm/plugin-navigate — handler factory (Wave A20-T8 promotion).
 *
 * Provides camera navigation command handlers.
 * Uses the BusLike pattern (same as BCF plugin) — L7 plugins MUST NOT
 * import the command-bus package (L1) directly; the host wires the real bus.
 *
 * CONTRACT (C07 §2 — plugin invariants):
 *  - Only reads/writes through the proxy surface
 *  - dispose() unregisters all contributions
 */

export interface NavigateCommand {
  kind:
    | 'navigate.bookmark.save'
    | 'navigate.bookmark.restore'
    | 'navigate.fly.to'
    | 'navigate.view.set';
  payload: Record<string, unknown>;
}

export interface NavigateHandlerContext {
  dispatch: (cmd: NavigateCommand) => void;
}

export interface NavigateHandler {
  readonly commandType: string;
  handle(payload: unknown, context: NavigateHandlerContext): void;
}

/**
 * Build the navigate plugin's handler set.
 *
 * Returns handlers for camera bookmark + navigation commands.
 * The host (PluginRegistry) wires these into the command bus.
 */
export function buildNavigateHandlerSet(): NavigateHandler[] {
  return [
    {
      commandType: 'navigate.bookmark.save',
      handle(payload: unknown, _ctx: NavigateHandlerContext): void {
        const { name, cameraState } = payload as {
          name?: string;
          cameraState?: Record<string, number>;
        };
        console.debug('[navigate] bookmark.save', { name, cameraState });
      },
    },
    {
      commandType: 'navigate.bookmark.restore',
      handle(payload: unknown, _ctx: NavigateHandlerContext): void {
        const { bookmarkId } = payload as { bookmarkId?: string };
        console.debug('[navigate] bookmark.restore', { bookmarkId });
      },
    },
    {
      commandType: 'navigate.fly.to',
      handle(payload: unknown, _ctx: NavigateHandlerContext): void {
        const { target, duration } = payload as {
          target?: Record<string, number>;
          duration?: number;
        };
        console.debug('[navigate] fly.to', { target, duration });
      },
    },
    {
      commandType: 'navigate.view.set',
      handle(payload: unknown, _ctx: NavigateHandlerContext): void {
        const { viewName } = payload as { viewName?: string };
        console.debug('[navigate] view.set', { viewName });
      },
    },
  ];
}
