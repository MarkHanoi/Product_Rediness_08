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

import { elementRegistry } from '@pryzm/core-app-model/element-registry';

// §OI-054 SPATIAL-CLEANUP (2026-05-24) — when the unified undo path
// (performUndoRedo.ts) reverts a CREATE via the ring buffer, it shadow-drops the
// dual-dispatch twin `CreateXCommand` from commandManager (so there's no phantom
// Ctrl+Z). That command's `undo()` used to ALSO unregister the element from
// `bimManager` (level.childrenIds) + `elementRegistry` (semantic id→type). Since
// it no longer runs, the adapter MUST do that cleanup itself — otherwise every
// undo/redo cycle leaks a spatial + semantic registration (the exact accumulation
// CreateWallCommand.undo's comment warns about), and a stale `level.childrenIds`
// entry trips §G3-STALE-EVENT + makes NativeElementMeshExporter export a ghost id.
// Both are best-effort (absent in headless/test) and MUST NOT throw (C03 §4.6 U-4).

interface BimManagerLike {
  registerElement?(id: string, levelId: string): void;
  unregisterElement?(id: string): void;
}
function _bim(): BimManagerLike | undefined {
  if (typeof window === 'undefined') return undefined;   // headless / unit-test env
  return (window as { bimManager?: BimManagerLike }).bimManager;
}

interface VdtLike { registerElement?(id: string, levelId: string): void }
function _vdt(): VdtLike | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as { __viewDependencyTracker?: VdtLike }).__viewDependencyTracker;
}

/** Redo of a create re-adds the element via the store, which SYNCHRONOUSLY fires
 *  child-element store events (curtain-wall panels). The ViewDependencyTracker
 *  attributes those children to their parent (§CW-PANEL-PARENT) only if the parent
 *  is already registered — so register it BEFORE the add (mirrors the §G3-STALE-FIX
 *  for create). On create the §P*.x bridge does this; on redo the bridge does NOT
 *  fire (we add directly), so the adapter must. */
function _onElementWillAdd(id: string, value: unknown): void {
  const v = value as { levelId?: string } | null | undefined;
  if (!v?.levelId) return;
  try { _vdt()?.registerElement?.(id, v.levelId); } catch (err) { console.warn('[elementUndoStoreAdapter] vdt.registerElement failed:', err); }
}

/** Undo of a create removed the element from its store — also drop its spatial +
 *  semantic registrations so they don't leak across undo/redo cycles. */
function _onElementRemoved(id: string): void {
  try { _bim()?.unregisterElement?.(id); } catch (err) { console.warn('[elementUndoStoreAdapter] bimManager.unregisterElement failed:', err); }
  try { elementRegistry.unregister(id); } catch (err) { console.warn('[elementUndoStoreAdapter] elementRegistry.unregister failed:', err); }
}

/** Redo of a create re-added the element — re-register spatial + semantic so the
 *  re-created element is a first-class citizen again (selection, plan export). */
function _onElementAdded(id: string, value: unknown): void {
  const v = value as { levelId?: string; type?: string } | null | undefined;
  try { if (v?.levelId) _bim()?.registerElement?.(id, v.levelId); } catch (err) { console.warn('[elementUndoStoreAdapter] bimManager.registerElement failed:', err); }
  // registerSemanticOrReplace is the redo-safe variant (plain registerSemantic
  // throws on a duplicate id — the historical #1 redo crash). The cast keeps the
  // adapter free of an explicit StoreType import; an element's `type` string is
  // the registry's storeType for every element family.
  try {
    if (v?.type) elementRegistry.registerSemanticOrReplace(id, v.type as Parameters<typeof elementRegistry.registerSemanticOrReplace>[1]);
  } catch (err) { console.warn('[elementUndoStoreAdapter] elementRegistry.registerSemanticOrReplace failed:', err); }
}

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

function _getValue(store: LegacyElementStoreLike, id: string): unknown {
  const getter = typeof store.getById === 'function' ? store.getById
    : typeof store.get === 'function' ? store.get
    : undefined;
  return getter ? getter.call(store, id) : undefined;
}

function _exists(store: LegacyElementStoreLike, id: string): boolean {
  return _getValue(store, id) != null;
}

function _remove(store: LegacyElementStoreLike, id: string): void {
  if (typeof store.remove === 'function') { store.remove(id); return; }
  if (typeof store.delete === 'function') { store.delete(id); return; }
}

// §OI-054 REDO-SHAPE-FIX (2026-05-24) — redo MUST restore the EXACT legacy object
// that undo removed, NOT the L1-shaped forward-patch value. WHY: complex elements
// are built in the legacy store by a §P*.x bridge that RENAMES L1 fields to legacy
// fields (curtain wall: bayWidth→gridXSpacing, bayHeight→gridYSpacing,
// mullionThickness→mullionSize — initTools.ts §P3.1-CW). The ring buffer's forward
// patch carries the raw L1 value (bayWidth/bayHeight, panels:[]); re-adding THAT on
// redo skips the rename → migrateToGridSystem reads undefined → 0 panels → "redo did
// nothing". Capturing the legacy object on remove and re-adding IT round-trips for
// EVERY element type (walls included — their shapes already align, so this is a
// no-op improvement for them). Keyed by element id; consumed (deleted) on restore.
const _undoRestoreSnapshots = new Map<string, unknown>();

/** Test-only: clear the redo-restore snapshot stash between cases (it is module
 *  state shared across adapter instances). Harmless in production. */
export function __resetUndoRestoreSnapshots(): void {
  _undoRestoreSnapshots.clear();
}

/**
 * Wrap a live legacy element store so undo/redo inverse/forward patches drive the
 * mesh through `add`/`remove`/`update`. Symmetric — handles both directions.
 */
export function elementUndoStoreAdapter(store: LegacyElementStoreLike): PatchApplicableAdapter {
  return {
    applyPatch(patches: readonly unknown[]): void {
      for (const raw of patches) {
        const p = raw as UndoPatchOp;
        try {
          const id = p.path.length > 0 ? String(p.path[0]) : '';
          if (id.length === 0) { console.warn('[elementUndoStoreAdapter] skip — empty id, path=', p.path); continue; }
          const exists = _exists(store, id);

          if (p.path.length === 1) {
            // Whole-element op — the create/undo/redo case.
            if (p.op === 'remove') {
              if (exists) {
                const snapshot = _getValue(store, id);       // capture the LEGACY object BEFORE remove (has bridge-mapped fields)
                _remove(store, id);
                if (snapshot != null) _undoRestoreSnapshots.set(id, snapshot);  // for a faithful redo
                _onElementRemoved(id);                       // undo of a create
              } else console.warn('[elementUndoStoreAdapter] skip remove — not found in store:', id);
            } else if (p.op === 'add') {
              // Prefer the snapshot captured at undo time over the L1 forward-patch
              // value — the snapshot is the legacy-shaped object the bridge built, so
              // redo regenerates downstream geometry (e.g. curtain-wall panels) exactly.
              const restore = _undoRestoreSnapshots.get(id) ?? p.value;
              if (!exists && restore != null && typeof store.add === 'function') {
                _onElementWillAdd(id, restore);                                                       // VDT-register parent BEFORE add (panel-storm fix)
                store.add(restore); _undoRestoreSnapshots.delete(id); _onElementAdded(id, restore);   // redo of a create
              } else console.warn('[elementUndoStoreAdapter] skip add — exists?', exists, 'hasAdd?', typeof store.add === 'function');
            } else if (p.op === 'replace') {
              if (p.value == null) continue;
              if (exists && typeof store.update === 'function') store.update(id, p.value as Record<string, unknown>);
              else if (!exists && typeof store.add === 'function') { _onElementWillAdd(id, p.value); store.add(p.value); _onElementAdded(id, p.value); }
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
