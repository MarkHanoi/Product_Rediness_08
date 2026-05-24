// §ADR-051 per-type undo rollout (OI-054 B1+B2) — undo+redo for ALL geometry
// element types, not just walls.
//
// WHY THIS EXISTS
// ----------------
// The ring-buffer undo applicator (`applyRingBufferSide`, @pryzm/command-bus)
// calls `store.applyPatch(patches)`. The element entries in the Ctrl+Z store maps
// (initUI._buildRingBufferStoreMap, BimService._buildStoreMap, NavigationAreaLayout,
// DockingLayout) point at the LIVE legacy `window.<x>Store` — the stores that drive
// the 3D mesh + plan projection via their builders — but those stores expose
// `add`/`remove`/`update`/`getById`, NOT `applyPatch`. So Ctrl+Z threw
// `store.applyPatch is not a function`, was swallowed (C03 §4.7 B3), and nothing
// reverted. This adapter gives any such store an `applyPatch` surface implemented
// via its own mutators (which DO drive the mesh), so an inverse patch reverts both
// data and geometry, and a forward patch (redo) re-adds them.
//
// SURFACE ANALYSIS (verified 2026-05-24 across Slab/Room/CurtainWall/Roof/Stair/
// Furniture/Column/Beam/Handrail/Floor/Ceiling/Grid/Wall stores): all expose
// `add(element)` + `remove(id)` (CurtainWall also `delete(id)`) + an existence
// check (`getById(id)` or `get(id)`) + `update(id, partial)`. The adapter is
// duck-typed over that union and NEVER throws (C03 §4.6 U-4 — the outer applicator
// also wraps per-store, but we guard internally so one bad op can't abort the rest).
//
// PATCH SHAPE (verified): every `Create<Element>Handler` does
// `produceCommand(ctx.stores.<x>, d => d[id] = element)` over a `Record<id,T>`, so
// patches are store-relative:
//   • undo of create  → inverse `{ op:'remove', path:[id] }`
//   • redo of create  → forward `{ op:'add',    path:[id], value: element }`
//   • field edits      → `{ op:'replace', path:[id, field, …], value }`
//
// SCOPE: this covers the standard top-level element stores. HOSTED elements
// (door/window — undo must also remove the wall opening) and LEVELS (Path-A
// commandManager) are intentionally NOT adapted by the call sites; left raw they
// fall through to the B3 `commandManager.undo()` fallback. See ADR-051.

/** Duck-typed union of the legacy element-store mutator surface. */
export interface LegacyElementStoreLike {
  add?(element: unknown): void;
  remove?(id: string): unknown;
  delete?(id: string): unknown;
  update?(id: string, updates: Record<string, unknown>): unknown;
  getById?(id: string): unknown;
  get?(id: string): unknown;
}

/** A single Immer-reconstructed patch op (RFC-6902 subset). */
export interface UndoPatchOp {
  readonly op: 'add' | 'replace' | 'remove';
  readonly path: ReadonlyArray<string | number>;
  readonly value?: unknown;
}

/** The `applyPatch` surface `applyRingBufferSide` expects from a store-map entry.
 *  Param is `readonly unknown[]` so the adapter is assignable to the existing
 *  store-map value type `{ applyPatch: (p: unknown[]) => void }` without a cast. */
export interface PatchApplicableAdapter {
  applyPatch(patches: readonly unknown[]): void;
}

function _exists(store: LegacyElementStoreLike, id: string): boolean {
  const getter = typeof store.getById === 'function' ? store.getById
    : typeof store.get === 'function' ? store.get
    : undefined;
  return getter ? getter.call(store, id) != null : false;
}

function _remove(store: LegacyElementStoreLike, id: string): void {
  if (typeof store.remove === 'function') { store.remove(id); return; }
  if (typeof store.delete === 'function') { store.delete(id); return; }
}

/**
 * Wrap a live legacy element store so undo/redo inverse/forward patches drive the
 * mesh through `add`/`remove`/`update`. Symmetric — handles both directions.
 */
export function elementUndoStoreAdapter(store: LegacyElementStoreLike): PatchApplicableAdapter {
  return {
    applyPatch(patches: readonly unknown[]): void {
      // §ADR-051-DIAG (2026-05-24) — temporary diagnostic so a live Ctrl+Z log
      // pinpoints exactly what the adapter did. Remove once undo is confirmed live.
      console.log('[elementUndoStoreAdapter] applyPatch — ops:', patches.length,
        'surface:', { add: typeof store.add, remove: typeof store.remove, delete: typeof store.delete, getById: typeof store.getById, get: typeof store.get, update: typeof store.update });
      for (const raw of patches) {
        const p = raw as UndoPatchOp;
        try {
          const id = p.path.length > 0 ? String(p.path[0]) : '';
          if (id.length === 0) { console.warn('[elementUndoStoreAdapter] skip — empty id, path=', p.path); continue; }
          const exists = _exists(store, id);

          if (p.path.length === 1) {
            // Whole-element op — the create/undo/redo case.
            if (p.op === 'remove') {
              if (exists) { _remove(store, id); console.log('[elementUndoStoreAdapter] UNDO removed', id); }   // undo of a create
              else console.warn('[elementUndoStoreAdapter] skip remove — not found in store:', id);
            } else if (p.op === 'add') {
              if (!exists && p.value != null && typeof store.add === 'function') {
                store.add(p.value); console.log('[elementUndoStoreAdapter] REDO added', id);                   // redo of a create
              } else console.warn('[elementUndoStoreAdapter] skip add — exists?', exists, 'hasAdd?', typeof store.add === 'function');
            } else if (p.op === 'replace') {
              if (p.value == null) continue;
              if (exists && typeof store.update === 'function') store.update(id, p.value as Record<string, unknown>);
              else if (!exists && typeof store.add === 'function') store.add(p.value);
            }
          } else {
            // Field-level op: path = [id, field, …]. Best-effort single-field update
            // (deep sub-paths collapse to the top field — sufficient for create/undo;
            // deep field undo is the ADR-051 single-store-unification follow-up).
            if (!exists || typeof store.update !== 'function') continue;
            const field = p.path[1];
            if (field == null) continue;
            store.update(id, { [String(field)]: p.value });
          }
        } catch (err) {
          console.error('[elementUndoStoreAdapter] op failed (skipped):', p, err);
        }
      }
    },
  };
}

/**
 * Wrap every entry of a raw `{ storeKey → liveStore }` map with
 * {@link elementUndoStoreAdapter}. Undefined/absent stores become `undefined`
 * (applyRingBufferSide skips them → B3 honest fallback). Used by the Ctrl+Z store
 * maps to adapt all element types uniformly (ADR-051).
 */
export function adaptElementStoreMap(
  raw: Readonly<Record<string, unknown>>,
): Record<string, PatchApplicableAdapter | undefined> {
  const out: Record<string, PatchApplicableAdapter | undefined> = {};
  for (const [key, store] of Object.entries(raw)) {
    out[key] = store ? elementUndoStoreAdapter(store as LegacyElementStoreLike) : undefined;
  }
  return out;
}

/** @deprecated Back-compat alias — use {@link elementUndoStoreAdapter}. */
export const wallUndoStoreAdapter = elementUndoStoreAdapter;
