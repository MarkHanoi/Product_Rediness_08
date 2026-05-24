// §ADR-051 wall slice (OI-054 / C03 §4.7 B1+B2) — undo+redo for plan-view walls.
//
// WHY THIS EXISTS
// ----------------
// The ring-buffer undo applicator (`applyRingBufferSide`, @pryzm/command-bus)
// calls `store.applyPatch(patches)`. The wall entry in the Ctrl+Z store maps
// (`initUI._buildRingBufferStoreMap`, `BimService._buildStoreMap`) points at the
// LIVE legacy `window.wallStore` (`@pryzm/geometry-wall`) — the store that drives
// the 3D mesh via `WallFragmentBuilder` — but that store has `add/update/remove`,
// NOT `applyPatch`. So Ctrl+Z threw `store.applyPatch is not a function`, was
// swallowed (C03 §4.7 B3, now reported), and the wall never went away.
//
// This adapter gives the legacy store an `applyPatch` surface implemented via its
// own `add`/`remove`/`update` — which DO drive the mesh — so an inverse patch
// reverts BOTH data and geometry, and a forward patch (redo) re-adds them. It is
// the per-type bridge toward the ADR-051 end-state (one source-of-truth store +
// derived mesh); the legacy store remains the mesh source for now.
//
// PATCH SHAPE (verified): `CreateWallHandler.execute` does
// `produceCommand(ctx.stores.wall, d => d[id] = wall)` against a `Record<id,Wall>`,
// so the patches are store-relative:
//   • undo of create  → inverse `{ op:'remove', path:[wallId] }`
//   • redo of create  → forward `{ op:'add',    path:[wallId], value: wallData }`
//   • field edits      → `{ op:'replace', path:[wallId, field, …], value }`
// `applyRingBufferSide` passes these through `patchSideToImmer`, so `path` is an
// array of (string|number). The store key (`'wall'`) is NOT in the path.
//
// CONTRACT: like `applyRingBufferSide` (C03 §4.6 U-4) this MUST NOT throw — the
// outer applicator already wraps per-store calls in try/catch, but we also guard
// internally so one bad op cannot abort the rest.

/** Minimal duck-typed surface of the legacy `geometry-wall` WallStore. */
export interface LegacyWallStoreLike {
  add(wall: unknown): void;
  remove(id: string): unknown;
  update(id: string, updates: Record<string, unknown>): unknown;
  getById(id: string): unknown;
}

/** A single Immer-reconstructed patch op (RFC-6902 subset). */
export interface UndoPatchOp {
  readonly op: 'add' | 'replace' | 'remove';
  readonly path: ReadonlyArray<string | number>;
  readonly value?: unknown;
}

/** The `applyPatch` surface `applyRingBufferSide` expects from a store-map entry.
 *  Param is `readonly unknown[]` so the adapter is assignable to the existing
 *  store-map value type `{ applyPatch: (p: unknown[]) => void }` without a cast;
 *  each op is narrowed to {@link UndoPatchOp} internally. */
export interface PatchApplicableAdapter {
  applyPatch(patches: readonly unknown[]): void;
}

/**
 * Wrap a live legacy WallStore so undo/redo inverse/forward patches drive the
 * mesh through `add`/`remove`/`update`. Symmetric: handles both directions.
 *
 * @param store the live `window.wallStore` (legacy geometry-wall WallStore).
 */
export function wallUndoStoreAdapter(store: LegacyWallStoreLike): PatchApplicableAdapter {
  return {
    applyPatch(patches: readonly unknown[]): void {
      for (const raw of patches) {
        const p = raw as UndoPatchOp;
        try {
          const id = p.path.length > 0 ? String(p.path[0]) : '';
          if (id.length === 0) continue;
          const exists = store.getById(id) != null;

          if (p.path.length === 1) {
            // Whole-element op — the create/undo/redo case.
            if (p.op === 'remove') {
              // undo of a create (inverse), or undo of nothing if already gone.
              if (exists) store.remove(id);
            } else if (p.op === 'add') {
              // redo of a create (forward).
              if (!exists && p.value != null) store.add(p.value);
            } else if (p.op === 'replace') {
              // whole-element replace → upsert (drives a full rebuild).
              if (p.value == null) continue;
              if (exists) store.update(id, p.value as Record<string, unknown>);
              else store.add(p.value);
            }
          } else {
            // Field-level op: path = [wallId, field, …]. Best-effort single-field
            // update (deep sub-paths collapse to the top field — sufficient for the
            // create/undo path; deep field undo is the ADR-051 unification follow-up).
            if (!exists) continue;
            const field = p.path[1];
            if (field == null) continue;
            store.update(id, { [String(field)]: p.value });
          }
        } catch (err) {
          // U-4: never throw out of an undo/redo apply.
          console.error('[wallUndoStoreAdapter] op failed (skipped):', p, err);
        }
      }
    },
  };
}
