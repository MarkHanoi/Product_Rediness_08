// SelectionBootstrap — D.4.4 typed contract for selection-half wiring.
//
// Anchored to:
//   * `docs/03_PRYZM3/02-ARCHITECTURE.md §3` (every bootstrap surface owns
//     a typed input/output contract, soft-fail semantics, and a tearDown).
//   * `docs/03_PRYZM3/04-PLAN-FORWARD/03-WAVE-2-3-D4-EXECUTION.md §2`
//     Day-6 — "Move lines 1141-1260 (selection bootstrap) into
//     SelectionBootstrap.ts." Per the Option A precedent: the body lives at
//     `src/engine/subsystems/initTools.ts` (the SelectionManager init that
//     Phase F-1 extracted); this file owns the TYPED CONTRACT that will
//     wrap it once L7 dep factoring enables full relocation (Wave 4).
//   * `docs/03_PRYZM3/01-VISION.md §2` P3 — this file produces no DOM
//     listeners; the selection-changed event wiring belongs to the engine
//     layer's SelectionManager, not to this L3 contract.
//
// Why this file is a wrapper today:
//   * `src/engine/subsystems/initTools.ts` (1,047 LOC) creates SelectionManager
//     alongside 20+ BIM tools and the CommandManager — all of which depend on
//     THREE, @thatopen/components, world, bimManager, and projectorContext.
//     Those L4-L7 dependencies cannot move into L3 wholesale without
//     inverting the layer rule.
//   * D.4.4 establishes the SELECTION ENTRY POINT in @pryzm/input-host: it
//     owns the typed slot shape so the caller (`composeRuntime.ts`) can
//     assign the result directly into `runtime.selection` with no adapter.
//
// PURE: no DOM, no THREE, no RAF calls, no Node globals.

/** Opaque ID for a selected element.  Matches the `string` IDs used by
 *  `runtime.selection.ids` and the store commit protocol. */
export type SelectionId = string;

/** The slot shape `bootstrapSelection()` / `bootstrapSelectionIdle()`
 *  produce.  Structurally isomorphic to `SelectionSlot` in
 *  `@pryzm/runtime-composer/types` so the caller can assign the result
 *  directly into the runtime slot with no adapter. */
export interface SelectionSlotShape {
  /** The currently selected element IDs.  Frozen on every update. */
  readonly ids: readonly SelectionId[];
  add(id: SelectionId): void;
  remove(id: SelectionId): void;
  clear(): void;
  set(next: readonly SelectionId[]): void;
  subscribe(listener: (ids: readonly SelectionId[]) => void): { dispose(): void };
}

/** The audit triple — mirrors `RuntimeAudit` from `@pryzm/runtime-composer`
 *  without taking a static dependency on it (L3 must not depend on L2). */
export interface SelectionBootstrapAudit {
  readonly actorId: string;
  readonly projectId: string;
  readonly clientId: string;
}

/** Input the caller hands to `bootstrapSelection()`. */
export interface SelectionBootstrapInput {
  readonly audit: SelectionBootstrapAudit;
  /** Lazy loader for the engine-layer selection init.  Injected so this
   *  L3 file takes no static dependency on SelectionManager / BimManager /
   *  @thatopen/components (all L4-L7); the caller uses dynamic `import()`. */
  readonly loadEngineSelection: () => Promise<EngineSelectionBootstrapFn>;
  /** Opaque params the engine-layer fn expects (in HEAD:
   *  `{ world, bimManager, events }`).  Typed `unknown` so this file
   *  does not bind to a specific engine-layer surface (L3-pure). */
  readonly engineParams: unknown;
}

/** Shape of the function the caller is expected to load.  Today this is
 *  part of `initTools` in `src/engine/subsystems/initTools.ts`; once
 *  D.4.4+ decomposes the engine-layer init into per-tool committers the
 *  caller may compose multiple loaders.  The L3 surface here is unchanged. */
export type EngineSelectionBootstrapFn = (params: unknown) => {
  /** The wired selection slot.  Structurally isomorphic to SelectionSlotShape. */
  selection: SelectionSlotShape;
  tearDown?: () => void;
};

export interface SelectionBootstrapResult {
  readonly selection: SelectionSlotShape;
  /** Captured error from soft-fail.  `null` on the happy path. */
  readonly selectionError: Error | null;
  readonly tearDown: () => void;
}

/** Synchronous "idle" path: no engine loader was supplied.  Returns a
 *  minimal null-shell SelectionSlotShape (no subscribers notified, no
 *  mutation committed).  No span — there is no boundary crossing to trace. */
export function bootstrapSelectionIdle(): SelectionBootstrapResult {
  return {
    selection: buildNullSelection(),
    selectionError: null,
    tearDown: NOOP_TEARDOWN,
  };
}

/** Async path: load the engine-layer selection init and soft-fail on
 *  any error.  The caller wraps this inside `bootstrapInput()` so there
 *  is no separate span here — the `pryzm.bootstrap.input` span from
 *  `bootstrap.ts` covers this boundary. */
export async function bootstrapSelection(
  input: SelectionBootstrapInput,
): Promise<SelectionBootstrapResult> {
  try {
    const bootstrapEngineSelection = await input.loadEngineSelection();
    const result = bootstrapEngineSelection(input.engineParams);
    return {
      selection: result.selection,
      selectionError: null,
      tearDown:
        typeof result.tearDown === 'function' ? result.tearDown : NOOP_TEARDOWN,
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return {
      selection: buildNullSelection(),
      selectionError: error,
      tearDown: NOOP_TEARDOWN,
    };
  }
}

/** Build a minimal null-shell SelectionSlotShape.  Subscribers are
 *  recorded but never invoked on the idle/soft-fail path. */
function buildNullSelection(): SelectionSlotShape {
  let ids: readonly SelectionId[] = Object.freeze([]);
  const subs = new Set<(ids: readonly SelectionId[]) => void>();
  const notify = (): void => {
    for (const s of subs) {
      try { s(ids); }
      catch { /* subscriber errors never propagate */ }
    }
  };
  return {
    get ids() { return ids; },
    add(id) { if (!ids.includes(id)) { ids = Object.freeze([...ids, id]); notify(); } },
    remove(id) { if (ids.includes(id)) { ids = Object.freeze(ids.filter(x => x !== id)); notify(); } },
    clear() { if (ids.length > 0) { ids = Object.freeze([]); notify(); } },
    set(next) { ids = Object.freeze([...next]); notify(); },
    subscribe(listener) {
      subs.add(listener);
      return { dispose: (): void => void subs.delete(listener) };
    },
  };
}

const NOOP_TEARDOWN = (): void => { /* idle / soft-fail */ };
