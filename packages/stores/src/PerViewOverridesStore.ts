// PerViewOverridesStore — wraps Contract-44 G4-G8 per-view side-tables
// inside the Store<T> persistence contract (post-2B closeout / ADR-0030).
//
// History:
//   • S33 — `plugins/plan-view/src/style-resolver.ts` (G4, G6, G7) and
//           `plugins/plan-view/src/view-element-visibility.ts` (G5)
//           were plain in-memory classes — fast, tested in isolation,
//           but NOT round-trippable through the store / patch / wire /
//           reload pipeline that ADR-0019 + ADR-0018 specify.
//   • Post-2B audit (2026-04-27) flagged this: G4–G8 were unit-class
//     invariants only, no end-to-end persistence proof.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// One row per `viewId`; the row payload holds every per-view side-table:
//   * `styleOverrides` — `ViewStyleOverride[]` (the ROW shape consumed by
//                        `StyleResolver`, minus the redundant `viewId`
//                        field which would duplicate the Map key).
//   * `elementVisibility` — `Record<elementId, false>` (G5; only `false`
//                          rows are persisted, matching the in-memory
//                          contract — the absence of a row means
//                          "visible").
//   * `materialOverrides` — `Record<elementId, materialId>` (G7).
//   * `pocheOverrides`    — `Record<categoryName, hexColour>` (G8).
//
// PURE: no DOM, no THREE, no Node-only globals.
// L1 — extends `Store<T>`; mutations land via `applyPatch(immerPatches)`
// like every other store.
//
// SERIALISATION
// ─────────────────────────────────────────────────────────────────────────────
// Round-trips through:
//   1. `getState()` → JSON-encodable plain object
//   2. JSON.stringify / JSON.parse over the wire
//   3. `applyPatch([{ op: 'add', path: [viewId], value: row }])` to
//      restore on the receiving side
// The `toResolverInputs(viewId)` helper converts the persistent shape
// back into the in-memory shapes that StyleResolver / ViewElementVisibility
// already consume — bridging persistence ↔ in-memory in one place.

import { Store } from './Store.js';

/** A row in StyleResolver's table — same shape minus the `viewId`
 *  (which is the Map key in this store). */
export interface PersistedStyleOverride {
  /** undefined ⇒ applies to all elements in the view (per StyleResolver). */
  readonly elementId?: string;
  readonly materialId?: string;
  readonly lineWeightOverride?: number;
  readonly fillColorOverride?: string;
  readonly strokeColorOverride?: string;
  readonly visible?: boolean;
}

export interface PerViewOverridesData {
  /** Stable view id — duplicates the Map key for self-describing wire. */
  readonly viewId: string;
  readonly styleOverrides: readonly PersistedStyleOverride[];
  /** Default-true semantics: only `false` rows are persisted. */
  readonly elementVisibility: Readonly<Record<string, false>>;
  /** Per-element material id assignment (G7). */
  readonly materialOverrides: Readonly<Record<string, string>>;
  /** Per-category poche fill colour (CSS hex). */
  readonly pocheOverrides: Readonly<Record<string, string>>;
}

/** Shape consumed by `StyleResolver` (it adds the `viewId` per row).  This
 *  helper rehydrates the persistent rows into the resolver's wire shape. */
export interface ResolverInputs {
  readonly styleOverrides: ReadonlyArray<PersistedStyleOverride & { readonly viewId: string }>;
  /** Map<elementId, false> — same shape ViewElementVisibility internally
   *  uses; can be passed straight to `ViewElementVisibility.fromJSON`. */
  readonly elementVisibility: ReadonlyMap<string, false>;
  readonly materialOverrides: ReadonlyMap<string, string>;
  readonly pocheOverrides: ReadonlyMap<string, string>;
}

export class PerViewOverridesStore extends Store<PerViewOverridesData> {
  constructor() { super('per-view-overrides'); }

  /** Convenience: empty-row factory (e.g. for newly-created views). */
  static emptyRow(viewId: string): PerViewOverridesData {
    return Object.freeze({
      viewId,
      styleOverrides: Object.freeze([]) as readonly PersistedStyleOverride[],
      elementVisibility: Object.freeze({}),
      materialOverrides: Object.freeze({}),
      pocheOverrides: Object.freeze({}),
    });
  }

  /** Rehydrate a single view's overrides into the in-memory shapes that
   *  `StyleResolver` and `ViewElementVisibility` consume.  Returns
   *  empty-everything when the view has no row (default behaviour:
   *  every element visible, default styles, no overrides). */
  toResolverInputs(viewId: string): ResolverInputs {
    const row = this.state.get(viewId);
    if (!row) {
      return {
        styleOverrides: [],
        elementVisibility: new Map(),
        materialOverrides: new Map(),
        pocheOverrides: new Map(),
      };
    }
    const styleOverrides = row.styleOverrides.map((r) => Object.freeze({ ...r, viewId }));
    const elementVisibility = new Map<string, false>();
    for (const k of Object.keys(row.elementVisibility)) elementVisibility.set(k, false);
    const materialOverrides = new Map<string, string>();
    for (const [k, v] of Object.entries(row.materialOverrides)) materialOverrides.set(k, v);
    const pocheOverrides = new Map<string, string>();
    for (const [k, v] of Object.entries(row.pocheOverrides)) pocheOverrides.set(k, v);
    return { styleOverrides, elementVisibility, materialOverrides, pocheOverrides };
  }

  /** JSON-encodable snapshot of the entire store (wire-format).  Sorted
   *  by viewId for deterministic byte output. */
  toJSON(): readonly PerViewOverridesData[] {
    const rows = [...this.state.values()];
    rows.sort((a, b) => a.viewId.localeCompare(b.viewId));
    return rows;
  }
}
