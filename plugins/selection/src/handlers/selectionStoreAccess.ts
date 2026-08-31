// selectionStoreAccess — §SEL-STORE-IDENTITY (W4d).
//
// @command-gate: not-a-command-bus-handler
//
// ⭐ WHY THE MARKER, AND WHY IT IS NOT A GATE WEAKENING (2026-08-31).
// check-otel-spans ZONE A is zero-tolerance over CommandBus handlers and classifies by
// DIRECTORY — anything under a `handlers/` folder. This file sits there and is NOT a handler:
//   grep -nE "readonly type|implements|CommandHandler|canExecute|execute\(" -> 0 hits
// It exports exactly two things, neither of which the bus can dispatch:
//   :71  export class SelectionStoreUnavailableError extends Error
//   :110 export function resolveSelectionStore(...)
// A withHandlerSpan wrapper here would instrument a RESOLVER as though it were a command, which
// makes the span count read higher while measuring something the invariant was never about.
// The marker is the gate's OWN documented mechanism for exactly this case, already carried by
// plugins/ifc-import/src/handlers/pluginHandlers.ts and plugins/rooms/src/handlers/legacyCommands.ts.
// It exempts ONE misclassified file; it does not move a ceiling, widen a baseline, or narrow a scope.
//
// ═══════════════════════════════════════════════════════════════════════════════
// WHAT WAS BROKEN, AS A MEASUREMENT.
// ═══════════════════════════════════════════════════════════════════════════════
//
// Every selection handler was written against `ctx.stores.selection` being the
// `SelectionStore` INSTANCE and called its methods (`.select` / `.deselect` /
// `.clear` / `.getState`). The production bus does not hand handlers store
// instances: `apps/editor/src/bootstrap.ts:94` builds it with
// `storesProvider: () => storesAsRecordView(stores)`, and `storesAsRecordView`
// (same file, :148-158) is `Object.fromEntries(store.getState())` — a
// `Record<id, dto>` with no methods at all.
//
// Measured at the real composition root
// (`composeRuntime({ bootstrapFn: bootstrapWithEverything })`), FOUR of the five
// verbs threw `… is not a function`, including `selection.clear`, which the
// DEFAULT POINTER TOOL dispatches on every activation
// (`apps/editor/src/PluginRegistry.ts:1223`, into a swallowing `.catch`).
//
// ═══════════════════════════════════════════════════════════════════════════════
// WHY THE FIX IS AN INJECTED HANDLE AND NOT `produceCommand`.
// ═══════════════════════════════════════════════════════════════════════════════
//
// Every OTHER plugin adapted to the record view by using `produceCommand(...)`
// and returning real `forward`/`inverse` patches, which `attachStores` then
// re-applies to the canonical `Store<T>`. Selection MAY NOT do that:
// `CommandBus.ts:576-578` computes
// `skipRingBuffer = suppressUndo || isEmptyPatchRecord`, and `suppressUndo` is a
// per-EXECUTE option (`CommandBus.ts:321`) that no selection call site passes. A
// non-empty patch pair would therefore push every click onto the ring buffer and
// make Ctrl+Z undo A SELECTION — exactly what ADR-0015 §"Consequences" forbids
// ("undoing a selection would be confusing UX").
//
// So the handlers keep their empty patch pair (undo-neutral, C20 §3) and are
// instead handed the store they were always written for.
//
// ⛔ NOT A RIVAL — THE INSTANCE IS ADOPTED, NEVER CONSTRUCTED. The store passed
// in by `apps/editor/src/PluginRegistry.ts`'s selection descriptor is the SAME
// object that descriptor returns from `buildStore()` and that
// `bootstrapWithEverything` registers as `stores.selection`. Minting a second
// `SelectionStore` here would fork state against the instance the provider
// fronts — the identical defect §BLSTORE-COMPOSED-PLUGIN-STORES closed for
// `boundaryLine`. `selectionVerbsReachTheComposedSelectionStore.test.ts` ARM C
// reads the write back through a DIFFERENT verb on the SAME provider precisely so
// that identity is asserted rather than assumed.
//
// ⛔ AND NOT A FOURTH SELECTION AUTHORITY. This build already has three live ones
// (`packages/input-host/SelectionManager`, `runtime.selection` from
// `composeRuntime.ts:328 buildSelectionStub`, `packages/core-app-model/SelectionBus`).
// Nothing here creates state, subscribes to a picker, or emits a selection event:
// it only lets the five ALREADY-REGISTERED verbs reach the store that was ALREADY
// built at the composition root. AUTHORED-but-not-REACHABLE ⇒ the fix is WIRE.
//
// The `ctx` fallback below is what keeps `plugins/selection/__tests__/**` — which
// hands the store instance through a hand-built `storesProvider` — passing
// unchanged, and is the only reason this is an additive change.

import type { SelectionStore } from '@pryzm/plugin-sdk';

/**
 * Thrown when a selection handler can reach NEITHER an injected store NOR a
 * store-shaped `ctx.stores.selection`.
 *
 * ⭐ WHY A NAMED ERROR RATHER THAN LETTING THE METHOD CALL BLOW UP: the old
 * failure surfaced as `ctx.stores.selection.select is not a function`, which
 * names a symptom and no cause, and it is caught by `.catch(console.error)` at
 * the one production call site. A caller that sees THIS message knows which
 * seam failed and which registration site owns it.
 */
export class SelectionStoreUnavailableError extends Error {
  constructor(verb: string, saw: unknown) {
    const shape =
      saw === undefined ? 'undefined'
      : saw === null ? 'null'
      : `${typeof saw} (ctor: ${(saw as { constructor?: { name?: string } })?.constructor?.name ?? '?'}, ` +
        `keys: ${Object.keys(saw as object).length})`;
    super(
      `[${verb}] §SEL-STORE-IDENTITY — no SelectionStore reachable. ` +
      `The handler was given neither an injected store (see the 'selection' descriptor in ` +
      `apps/editor/src/PluginRegistry.ts) nor a store-shaped ctx.stores.selection; it saw ${shape}. ` +
      `In production the bus hands handlers a Record<id,dto> view (bootstrap.ts storesAsRecordView), ` +
      `so the store MUST be injected at registration.`,
    );
    this.name = 'SelectionStoreUnavailableError';
  }
}

/** Duck-check: does this value expose the four members the handlers use? */
function isSelectionStore(v: unknown): v is SelectionStore {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o['select'] === 'function' &&
    typeof o['deselect'] === 'function' &&
    typeof o['clear'] === 'function' &&
    typeof o['getState'] === 'function'
  );
}

/**
 * Resolve the canonical `SelectionStore` for a handler.
 *
 * Order is deliberate: the INJECTED handle wins, because it is the instance the
 * composition root registered under `stores.selection` and is therefore the one
 * every other reader of that key sees. The `ctx.stores.selection` fallback exists
 * for buses whose `storesProvider` really does hand store instances (the plugin's
 * own suite, and the S16-era wiring these handlers were written against).
 */
export function resolveSelectionStore(
  injected: SelectionStore | null,
  stores: Readonly<Record<string, unknown>>,
  verb: string,
): SelectionStore {
  if (injected !== null) return injected;
  const candidate = stores['selection'];
  if (isSelectionStore(candidate)) return candidate;
  throw new SelectionStoreUnavailableError(verb, candidate);
}
