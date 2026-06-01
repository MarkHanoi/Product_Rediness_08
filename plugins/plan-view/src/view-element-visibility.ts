// view-element-visibility — per-view element visibility map (G5).
//
// Spec: `phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md` §S33 G5 (line 626):
//   "ViewStore gets `elementVisibility: Map<viewId, Map<elementId, boolean>>`"
//
// Subordinate ADR: `docs/02-decisions/adrs/0025-plan-view-svp-parity-contract-44.md`.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// PRYZM 1 stored visibility flags on the elements themselves.  This made
// "hide in this view" globally destructive (Contract 44 G5).  PRYZM 2
// stores visibility per-view in a side-table keyed by view id, so:
//
//   • The same element can be visible in 3D and hidden in plan.
//   • `default-true semantics` — absent rows mean "visible".
//   • Setting `false` is the only way to hide; clearing the row restores
//     visibility (we never persist `true` rows; the `set(true)` call
//     deletes the row to keep the table small).
//
// SERIALISATION
// ─────────────────────────────────────────────────────────────────────────────
// `toJSON()` emits an array of `[viewId, [[elementId, false], …]]` tuples.
// `fromJSON(...)` round-trips it.  The wire format avoids object keys for
// view ids (those can contain non-identifier characters under brand types)
// and naturally preserves Map iteration order across implementations.
//
// PURE: no DOM, no THREE, no `window` — Node-safe.

/** Side-table of visibility overrides keyed by view id then element id. */
export class ViewElementVisibility {
  /**
   * Inner Map<elementId, false>.  We only ever store `false` rows —
   * `true` is the implicit default and would bloat the table for nothing.
   * The bare `false` literal is intentional (compile-time guard against
   * accidentally storing `true`).
   */
  private readonly table = new Map<string, Map<string, false>>();

  /** Default-true: returns `true` when no override is set for `(viewId, elementId)`. */
  isVisible(viewId: string, elementId: string): boolean {
    const inner = this.table.get(viewId);
    if (!inner) return true;
    return !inner.has(elementId);
  }

  /**
   * Set visibility for `(viewId, elementId)`.  Setting `true` deletes the
   * row (back to default); setting `false` adds it.  Returns `true` iff
   * the table changed (useful for dirty-tracking).
   */
  set(viewId: string, elementId: string, visible: boolean): boolean {
    if (visible) {
      const inner = this.table.get(viewId);
      if (!inner) return false;
      const removed = inner.delete(elementId);
      if (inner.size === 0) this.table.delete(viewId);
      return removed;
    }
    let inner = this.table.get(viewId);
    if (!inner) {
      inner = new Map();
      this.table.set(viewId, inner);
    }
    if (inner.has(elementId)) return false;
    inner.set(elementId, false);
    return true;
  }

  /** Drop every row for `viewId` (fast path for view-deletion). */
  clearView(viewId: string): boolean {
    return this.table.delete(viewId);
  }

  /** Number of `(view, element)` overrides — diagnostic / dirty-tracking. */
  get size(): number {
    let n = 0;
    for (const inner of this.table.values()) n += inner.size;
    return n;
  }

  /**
   * Iterate every `(viewId, elementId)` pair for which an override is set.
   * Order is insertion order per Map.
   */
  *entries(): IterableIterator<readonly [string, string]> {
    for (const [viewId, inner] of this.table) {
      for (const elementId of inner.keys()) {
        yield [viewId, elementId] as const;
      }
    }
  }

  // ── Serialisation ────────────────────────────────────────────────────────

  /** JSON wire shape: nested tuples (preserves order, brand-id-safe). */
  toJSON(): readonly [string, readonly [string, false][]][] {
    const out: [string, [string, false][]][] = [];
    for (const [viewId, inner] of this.table) {
      const entries: [string, false][] = [];
      for (const elementId of inner.keys()) entries.push([elementId, false]);
      out.push([viewId, entries]);
    }
    return out;
  }

  /** Round-trip the JSON wire shape produced by `toJSON()`. */
  static fromJSON(
    wire: ReadonlyArray<readonly [string, ReadonlyArray<readonly [string, false]>]>,
  ): ViewElementVisibility {
    const out = new ViewElementVisibility();
    for (const [viewId, rows] of wire) {
      for (const [elementId] of rows) {
        out.set(viewId, elementId, false);
      }
    }
    return out;
  }
}
