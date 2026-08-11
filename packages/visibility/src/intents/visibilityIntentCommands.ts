// Visibility-intent command handlers — W3-1 (authored) / W3-2 (relocated).
//
// WHY THIS LIVES IN L1 AND NOT IN `plugins/visibility-intent`
// ─────────────────────────────────────────────────────────────────────────────
// W3-1 wrote these five handler bodies inside the L6 plugin, because that is
// where the (dead) `console.debug` stubs were. W3-2 moved them here unchanged.
// Two reasons, and the first is the real one:
//
//   1. P7 — "visibility intent is a domain concept, not UI". Deciding that
//      `hide.selection` means "union these ids into the view's wave-9 hide set,
//      but ONLY if there is an active view" is a domain rule. The plugin's job
//      is the rail button, the H keybinding and the descriptor: the surface a
//      user touches. It is not the meaning of the gesture.
//   2. The composition root must register these handlers (see `composeRuntime`),
//      and `runtime-composer` is L3. Importing them from an L6 plugin is an
//      UPWARD import — `tools/ga-gate/check-layer-boundaries.ts` counted it as
//      one (102 → 103) and it was right to. Moving the code down is the fix;
//      raising the baseline would not have been.
//
// The plugin cannot simply re-export from here either: `@pryzm/visibility` is in
// the BLOCKED list of `check-l7-boundary.ts`, so an L6 → L1 value import trades
// one gate regression for another. There is exactly one copy of this logic and it
// is this file.
//
// WHAT THE HANDLERS REPLACED
// ─────────────────────────────────────────────────────────────────────────────
// `buildVisibilityIntentHandlerSet()` previously took NO ARGUMENTS and had ZERO
// importers repo-wide — the handlers were not merely unwired, they were
// UNWIREABLE. Each body was a single `console.debug` and an implicit return, so
// "Hide Selection" (keybinding H) resolved to a console line. The plugin's own
// header claimed the handlers wrapped `runtime.visibility.setOverride`; no such
// method has ever existed. The state the renderer consults —
// `activeView.hiddenElementIds` (wave-9) and `activeView.temporaryIsolation`
// (wave-8) — was never written by anything in production.
//
// The factory now THROWS when constructed without a write surface. A handler set
// with nowhere to write silently discards every user gesture, and that failure
// mode is precisely what this factory refuses to reproduce.
//
// PURE (L1): no DOM, no THREE, no transport, no I/O. The handlers call the
// injected port and nothing else.

/**
 * The five command types this set handles. Kept as a named union so a caller
 * can exhaustively switch without stringly-typing the names a second time.
 */
export interface VisibilityIntentCommand {
  kind:
    | 'visibility.hide.selection'
    | 'visibility.isolate.selection'
    | 'visibility.reveal.all'
    | 'visibility.set.transparency'
    | 'visibility.edge.toggle';
  payload: Record<string, unknown>;
}

/** A single command-type → behaviour binding. Host-agnostic on purpose: the
 *  composition root adapts these onto `CommandHandler`, and the tests drive them
 *  directly, without either side needing the other's types. */
export interface VisibilityIntentHandler {
  readonly commandType: string;
  handle(payload: unknown): void;
}

/**
 * The write surface these handlers require. Structurally satisfied by
 * `ViewVisibilityIntentStore` (its sibling in this directory).
 *
 * Declared as a narrow port rather than typed as the concrete store so the
 * handlers depend on the five methods they actually call, and a test can supply
 * a recording double without subclassing a store.
 */
export interface VisibilityIntentPort {
  hide(viewId: string, elementIds: readonly string[]): void;
  isolate(viewId: string, elementIds: readonly string[]): void;
  revealAll(viewId: string): void;
  setTransparency(viewId: string, elementIds: readonly string[], opacity: number): void;
  setEdgesEnabled(viewId: string, enabled: boolean): void;
}

export interface VisibilityIntentHandlerDeps {
  readonly store: VisibilityIntentPort;
  /** The view the gesture applies to. A function, not a value, because the
   *  active view changes over a session while the handler set is registered once.
   *  Returning null/'' means "no active view" — the handler no-ops loudly rather
   *  than silently writing intent onto the wrong view. */
  readonly activeViewId: () => string | null;
}

/**
 * Build the visibility-intent handler set.
 *
 * Each handler writes user intent into the injected store; the wave chain turns
 * that intent into resolved visibility. Nothing here evaluates visibility itself.
 */
export function buildVisibilityIntentHandlerSet(
  deps: VisibilityIntentHandlerDeps,
): VisibilityIntentHandler[] {
  if (!deps || !deps.store || typeof deps.activeViewId !== 'function') {
    throw new TypeError(
      '[visibility-intent] buildVisibilityIntentHandlerSet requires { store, activeViewId }. '
      + 'Handlers with no write surface silently discard the user gesture — that failure '
      + 'mode is what this factory now refuses to reproduce.',
    );
  }

  /** Resolve the target view, or null when there is none. Warns rather than
   *  throwing: a missing active view is a real runtime state (nothing open),
   *  not a programming error, and must not take the command bus down. */
  const targetView = (command: string): string | null => {
    const viewId = deps.activeViewId();
    if (!viewId) {
      console.warn(`[visibility-intent] ${command}: no active view — intent discarded`);
      return null;
    }
    return viewId;
  };

  /** Normalise an element-id payload. An explicitly empty array is preserved —
   *  for `isolate` it is a meaningful gesture (see w08 / bug #8901), so it must
   *  not be conflated with a malformed payload. `null` means MALFORMED; `[]`
   *  means "the user named no elements". Those are different values and the
   *  handlers below treat them differently. */
  const idsOf = (payload: unknown): readonly string[] | null => {
    const { elementIds } = (payload ?? {}) as { elementIds?: unknown };
    if (!Array.isArray(elementIds)) return null;
    return elementIds.map(String);
  };

  return [
    {
      commandType: 'visibility.hide.selection',
      handle(payload: unknown): void {
        const viewId = targetView('hide.selection');
        if (viewId === null) return;
        const ids = idsOf(payload);
        if (ids === null) {
          console.warn('[visibility-intent] hide.selection: payload.elementIds missing');
          return;
        }
        // Hiding nothing is a no-op, not an "unhide everything".
        if (ids.length === 0) return;
        deps.store.hide(viewId, ids);
      },
    },
    {
      commandType: 'visibility.isolate.selection',
      handle(payload: unknown): void {
        const viewId = targetView('isolate.selection');
        if (viewId === null) return;
        const ids = idsOf(payload);
        if (ids === null) {
          console.warn('[visibility-intent] isolate.selection: payload.elementIds missing');
          return;
        }
        // NOTE: an empty array is passed through deliberately — "isolate nothing"
        // hides everything and is how a user clears a stuck isolation (w08).
        deps.store.isolate(viewId, ids);
      },
    },
    {
      commandType: 'visibility.reveal.all',
      handle(_payload: unknown): void {
        const viewId = targetView('reveal.all');
        if (viewId === null) return;
        deps.store.revealAll(viewId);
      },
    },
    {
      commandType: 'visibility.set.transparency',
      handle(payload: unknown): void {
        const viewId = targetView('set.transparency');
        if (viewId === null) return;
        const ids = idsOf(payload);
        const { opacity } = (payload ?? {}) as { opacity?: unknown };
        if (ids === null || typeof opacity !== 'number' || Number.isNaN(opacity)) {
          console.warn('[visibility-intent] set.transparency: bad payload', { opacity });
          return;
        }
        if (ids.length === 0) return;
        deps.store.setTransparency(viewId, ids, opacity);
      },
    },
    {
      commandType: 'visibility.edge.toggle',
      handle(payload: unknown): void {
        const viewId = targetView('edge.toggle');
        if (viewId === null) return;
        const { enabled } = (payload ?? {}) as { enabled?: unknown };
        if (typeof enabled !== 'boolean') {
          console.warn('[visibility-intent] edge.toggle: payload.enabled must be boolean');
          return;
        }
        deps.store.setEdgesEnabled(viewId, enabled);
      },
    },
  ];
}
