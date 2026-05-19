// @pryzm/plugin-sdk — Views proxy contract (S62 D3).
//
// Plugins inspect the active view (and view list) through `views.*`.
// View activation events (per ADR-0030 view.activated) propagate to
// subscribers.  All access is read-only; mutating views requires
// `commandBus.dispatch({ kind: 'view.set-active', ... })`.

/** The five view kinds shipped at v1. */
export type ViewKind = '3d' | 'plan' | 'section' | 'sheet' | 'schedule';

/** Lightweight reference to a view; full props live in the editor. */
export interface ViewRef {
  readonly id: string;
  readonly kind: ViewKind;
  readonly label: string;
  /** ULID of the level the view is anchored to (null for sheet/schedule). */
  readonly levelId: string | null;
}

/**
 * Permission-gated read access to view state.
 * Permission: `read:project` required for every method.
 */
export interface ViewsProxy {
  /** Returns the currently-active view, or `null` if no view is open. */
  getActiveView(): Promise<ViewRef | null>;

  /** Returns the full list of views in the project. */
  getViews(): Promise<readonly ViewRef[]>;

  /** Subscribe to view-activation events.  Handler runs after activation. */
  subscribe(handler: (event: { activeView: ViewRef | null }) => void): { unsubscribe(): void };
}
