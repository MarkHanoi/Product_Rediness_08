// ViewVisibilityIntentStore — W3-1 revival (P7 / C01 §1 P7).
//
// WHY THIS EXISTS
// ─────────────────────────────────────────────────────────────────────────────
// `packages/visibility` shipped the full 11-wave EVALUATOR (`evaluateViewVisibility`)
// and `composeRuntime` exposes it as `runtime.visibility.evaluate` — but the slot is
// `{ evaluate }` and NOTHING ELSE. There has never been a place to WRITE a visibility
// intent to. `VisibilitySlot`'s own doc-comment concedes this:
//
//     "Phase 3A completion (post-Wave-20) will add a stateful `subscribe` surface
//      once the per-view visibility intent store lands."
//
// That store never landed. The consequence was that `plugins/visibility-intent`'s five
// handlers had literally nowhere to put a hide — `buildVisibilityIntentHandlerSet()`
// took no arguments — so all five degenerated into `console.debug` and returned.
// A pure evaluator with no writable state is a function nobody can call meaningfully:
// waves 8 and 9 read `activeView.temporaryIsolation` / `activeView.hiddenElementIds`,
// and no production code ever populated either field.
//
// THIS FILE IS THE MISSING WRITE SIDE. It is the authoritative, per-view record of
// user visibility intent. `applyToView()` is the bridge that makes waves 8/9 see it,
// which is what makes an assertion on `evaluate(...).get(id).visible` a real
// verification of intent rather than a check that a handler returned truthy.
//
// SEMANTICS — deliberately matched to the waves that consume them, not invented:
//   • `hide()`      → wave-9 `hiddenElementIds`. PER-VIEW and PERSISTED. An element
//                     hidden in plan A stays visible in plan B (w09 header).
//   • `isolate()`   → wave-8 `temporaryIsolation`. PER-VIEW and PER-SESSION; w08's
//                     header is explicit that isolation does NOT persist into saved
//                     view-state. `serialize()` therefore OMITS it — see below.
//   • `revealAll()` → clears BOTH. This matches the "Reveal All Hidden" gesture in
//                     the plugin descriptor, which users expect to also drop a stuck
//                     isolation.
//
// `isolate([])` with `active: true` is NOT the same as no isolation — w08's header
// preserves PRYZM 1 bug #8901: "isolate nothing" hides everything and is how a user
// dismisses a stuck isolation. Emptiness and absence are different values here, so
// `temporaryIsolation` is `null` when never set and `{active:true, elementIds:∅}`
// when the user isolated an empty set. Do not collapse these.
//
// LAYER / PURITY (L1): imports only `./` sibling types and `@opentelemetry/api`
// (the same dependency `waves/index.ts` already carries). No DOM, no THREE, no I/O,
// no transport. The store holds state but performs no side effects.
//
// WIRING STATUS — READ THIS BEFORE ASSUMING P7 HOLDS (updated 2026-08-11, W3-2/B3):
// The paragraph here used to read "NOT YET WIRED … not constructed by
// `composeRuntime`". That is now stale and has been corrected in place rather than
// left to mislead. What is TRUE today, claim by claim:
//
//   ✅ CONSTRUCTED — `composeRuntime` creates exactly one per runtime and exposes it
//      as `runtime.visibility.intent`; `tearDown` disposes it.
//   ✅ WRITTEN — all five bus commands (`visibility.hide.selection`, …) are
//      registered on the production CommandBus and write here.
//   ✅ READ — `runtime.visibility.resolve()` merges intent into the wave chain, and
//      `runtime.visibility.applyToScene()` projects it onto scene nodes.
//      `apps/editor/src/ui/SpatialTree.ts` is the first UI consumer.
//   ❌ NOT PERSISTED — `serialize()`/`deserialize()` work and are tested, but NOTHING
//      CALLS THEM. There is no visibility field in the saved document format, so a
//      hide still does not survive save/load. Adding one is a file-format change.
//   ❌ NOT UNDOABLE — the handlers declare `affectedStores: []` (see
//      `adaptVisibilityIntentHandlers`), so no patches are produced and Ctrl+Z does
//      not reach a hide.
//   ❌ NOT REPLICATED — no CRDT binding. A collaborator does not see your hide.
//
// The last three are open work, not oversights, and are recorded as such. Do not
// upgrade this comment without upgrading the code it describes.

import { trace } from '@opentelemetry/api';
import type { TemporaryIsolationState, VisibilityView } from '../waves/types.js';

const tracer = trace.getTracer('@pryzm/visibility');

/** Immutable per-view snapshot of user visibility intent. */
export interface ViewVisibilityIntent {
  /** Wave-9 explicit "Hide in View" list. Persisted. */
  readonly hiddenElementIds: ReadonlySet<string>;
  /** Wave-8 ad-hoc isolation. `null` = never isolated (distinct from an
   *  active isolation over an empty set, which hides everything). Session-only. */
  readonly temporaryIsolation: TemporaryIsolationState | null;
  /** Per-element transparency, 0..1. Consumed by the renderer, not by the
   *  wave chain (transparency is not a visibility short-circuit). Persisted. */
  readonly transparency: ReadonlyMap<string, number>;
  /** Edge-display toggle for the view. Persisted. */
  readonly edgesEnabled: boolean;
}

/** Wire shape for `serialize()` / `deserialize()`. Sets emit as sorted arrays so
 *  output is byte-stable (same convention as `toJSON` in the package root). */
export interface ViewVisibilityIntentWire {
  readonly viewId: string;
  readonly hiddenElementIds: readonly string[];
  readonly transparency: readonly (readonly [string, number])[];
  readonly edgesEnabled: boolean;
}

type Listener = (viewId: string, state: ViewVisibilityIntent) => void;

function emptyIntent(): ViewVisibilityIntent {
  return Object.freeze({
    hiddenElementIds: new Set<string>(),
    temporaryIsolation: null,
    transparency: new Map<string, number>(),
    edgesEnabled: true,
  });
}

/**
 * Authoritative per-view visibility-intent state.
 *
 * One instance per runtime session. Mutators are total (never throw on unknown
 * view ids — a view with no recorded intent simply reads as the empty intent),
 * and every accepted mutation notifies subscribers with the fresh snapshot.
 */
export class ViewVisibilityIntentStore {
  private readonly _byView = new Map<string, ViewVisibilityIntent>();
  private readonly _listeners = new Set<Listener>();
  private _disposed = false;

  /**
   * Current intent for `viewId`. Returns the empty intent for a view that has
   * never been touched — absence reads as "no intent expressed", never as an
   * error, so callers do not need a null branch.
   */
  get(viewId: string): ViewVisibilityIntent {
    return this._byView.get(viewId) ?? emptyIntent();
  }

  /** True when this view carries any non-default intent. Cheap enough to call
   *  from a render path; used to drive "reset visibility" affordances. */
  hasIntent(viewId: string): boolean {
    const s = this._byView.get(viewId);
    if (!s) return false;
    return s.hiddenElementIds.size > 0
      || s.temporaryIsolation !== null
      || s.transparency.size > 0
      || s.edgesEnabled === false;
  }

  /**
   * Hide `elementIds` in `viewId` (wave-9). Additive: hiding is a set union, so
   * hiding B after A leaves both hidden.
   */
  hide(viewId: string, elementIds: readonly string[]): void {
    return tracer.startActiveSpan('pryzm.visibility.intent.hide', (span) => {
      try {
        span.setAttribute('pryzm.visibility.view_id', viewId);
        span.setAttribute('pryzm.visibility.element_count', elementIds.length);
        const prev = this.get(viewId);
        const next = new Set(prev.hiddenElementIds);
        for (const id of elementIds) next.add(id);
        this._commit(viewId, { ...prev, hiddenElementIds: next });
      } finally {
        span.end();
      }
    });
  }

  /**
   * Un-hide `elementIds` in `viewId`. The inverse of `hide` — set difference.
   * Ids that were not hidden are ignored (idempotent).
   */
  unhide(viewId: string, elementIds: readonly string[]): void {
    return tracer.startActiveSpan('pryzm.visibility.intent.unhide', (span) => {
      try {
        span.setAttribute('pryzm.visibility.view_id', viewId);
        span.setAttribute('pryzm.visibility.element_count', elementIds.length);
        const prev = this.get(viewId);
        const next = new Set(prev.hiddenElementIds);
        for (const id of elementIds) next.delete(id);
        this._commit(viewId, { ...prev, hiddenElementIds: next });
      } finally {
        span.end();
      }
    });
  }

  /**
   * Isolate `elementIds` in `viewId` (wave-8) — everything else hides.
   *
   * REPLACES rather than unions: isolating C after isolating A,B means the user
   * now wants to look at C, not at A,B,C. An empty `elementIds` is honoured as
   * an active isolation over nothing (hides everything) per w08 / bug #8901 —
   * it is NOT silently treated as "clear the isolation".
   */
  isolate(viewId: string, elementIds: readonly string[]): void {
    return tracer.startActiveSpan('pryzm.visibility.intent.isolate', (span) => {
      try {
        span.setAttribute('pryzm.visibility.view_id', viewId);
        span.setAttribute('pryzm.visibility.element_count', elementIds.length);
        const prev = this.get(viewId);
        this._commit(viewId, {
          ...prev,
          temporaryIsolation: { active: true, elementIds: new Set(elementIds) },
        });
      } finally {
        span.end();
      }
    });
  }

  /** Drop any isolation on `viewId`, leaving hides/transparency intact. */
  clearIsolation(viewId: string): void {
    return tracer.startActiveSpan('pryzm.visibility.intent.clear_isolation', (span) => {
      try {
        span.setAttribute('pryzm.visibility.view_id', viewId);
        const prev = this.get(viewId);
        this._commit(viewId, { ...prev, temporaryIsolation: null });
      } finally {
        span.end();
      }
    });
  }

  /**
   * "Reveal All Hidden" — clears the wave-9 hide list AND any wave-8 isolation
   * for `viewId`. Transparency and the edge toggle are graphics, not visibility,
   * and are deliberately preserved.
   */
  revealAll(viewId: string): void {
    return tracer.startActiveSpan('pryzm.visibility.intent.reveal_all', (span) => {
      try {
        span.setAttribute('pryzm.visibility.view_id', viewId);
        const prev = this.get(viewId);
        this._commit(viewId, {
          ...prev,
          hiddenElementIds: new Set<string>(),
          temporaryIsolation: null,
        });
      } finally {
        span.end();
      }
    });
  }

  /**
   * Set per-element transparency in `viewId`. `opacity` is clamped to 0..1.
   * An opacity of exactly 1 REMOVES the entry (fully opaque is the default, and
   * storing it would make `hasIntent` report a non-default view that isn't one).
   */
  setTransparency(viewId: string, elementIds: readonly string[], opacity: number): void {
    return tracer.startActiveSpan('pryzm.visibility.intent.set_transparency', (span) => {
      try {
        span.setAttribute('pryzm.visibility.view_id', viewId);
        span.setAttribute('pryzm.visibility.element_count', elementIds.length);
        span.setAttribute('pryzm.visibility.opacity', opacity);
        const clamped = Math.min(1, Math.max(0, opacity));
        const prev = this.get(viewId);
        const next = new Map(prev.transparency);
        for (const id of elementIds) {
          if (clamped >= 1) next.delete(id);
          else next.set(id, clamped);
        }
        this._commit(viewId, { ...prev, transparency: next });
      } finally {
        span.end();
      }
    });
  }

  /** Toggle edge display for `viewId`. */
  setEdgesEnabled(viewId: string, enabled: boolean): void {
    return tracer.startActiveSpan('pryzm.visibility.intent.set_edges', (span) => {
      try {
        span.setAttribute('pryzm.visibility.view_id', viewId);
        span.setAttribute('pryzm.visibility.edges_enabled', enabled);
        const prev = this.get(viewId);
        this._commit(viewId, { ...prev, edgesEnabled: enabled });
      } finally {
        span.end();
      }
    });
  }

  /**
   * Project the recorded intent for `view.id` onto `view`, producing the
   * `VisibilityView` the wave chain should actually be evaluated against.
   *
   * THIS IS THE BRIDGE. Without it the store is inert data: waves 8 and 9 read
   * `activeView.temporaryIsolation` / `activeView.hiddenElementIds`, so intent
   * only becomes observable visibility once it has been merged into the view.
   * Callers evaluate `evaluate(elements, store.applyToView(view))`.
   *
   * Pure — returns a new object, never mutates `view`.
   */
  applyToView(view: VisibilityView): VisibilityView {
    const intent = this.get(view.id);
    return {
      ...view,
      hiddenElementIds: intent.hiddenElementIds,
      temporaryIsolation: intent.temporaryIsolation,
    };
  }

  /** Subscribe to intent changes. Returns an idempotent unsubscribe. */
  subscribe(listener: Listener): () => void {
    if (this._disposed) return () => { /* no-op */ };
    this._listeners.add(listener);
    return () => { this._listeners.delete(listener); };
  }

  /**
   * Serialise persisted intent for every view that has any.
   *
   * `temporaryIsolation` is intentionally ABSENT from the wire shape: w08's
   * contract is that isolation is per-session and does not survive into saved
   * view-state. Persisting it would resurrect a stuck isolation on reload.
   */
  serialize(): ViewVisibilityIntentWire[] {
    const out: ViewVisibilityIntentWire[] = [];
    for (const [viewId, s] of this._byView) {
      if (s.hiddenElementIds.size === 0 && s.transparency.size === 0 && s.edgesEnabled) continue;
      out.push({
        viewId,
        hiddenElementIds: [...s.hiddenElementIds].sort(),
        transparency: [...s.transparency.entries()].sort((a, b) => a[0].localeCompare(b[0])),
        edgesEnabled: s.edgesEnabled,
      });
    }
    return out.sort((a, b) => a.viewId.localeCompare(b.viewId));
  }

  /** Replace all state from a `serialize()` payload. Isolation resets to null. */
  deserialize(wire: readonly ViewVisibilityIntentWire[]): void {
    this._byView.clear();
    for (const w of wire) {
      this._byView.set(w.viewId, Object.freeze({
        hiddenElementIds: new Set(w.hiddenElementIds),
        temporaryIsolation: null,
        transparency: new Map(w.transparency),
        edgesEnabled: w.edgesEnabled,
      }));
    }
  }

  /** Tear down: clear listeners + state. Idempotent. */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._listeners.clear();
    this._byView.clear();
  }

  private _commit(viewId: string, next: ViewVisibilityIntent): void {
    if (this._disposed) return;
    const frozen = Object.freeze(next);
    this._byView.set(viewId, frozen);
    for (const l of this._listeners) {
      try { l(viewId, frozen); }
      catch (err) { console.error('[ViewVisibilityIntentStore] listener threw:', err); }
    }
  }
}

/** Factory wrapper — mirrors `createIsolationStateStore` so a future
 *  `composeRuntime` call-site wires the store without a bare `new`. */
export function createViewVisibilityIntentStore(): ViewVisibilityIntentStore {
  return new ViewVisibilityIntentStore();
}
