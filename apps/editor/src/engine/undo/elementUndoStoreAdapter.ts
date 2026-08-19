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
// ⚠ CORRECTED 2026-08-18 — "`update(id, partial)`" IS FALSE FOR FOUR OF THE
// TWENTY-ONE STORES THIS ADAPTER IS HANDED, AND THIS PARAGRAPH IS WHY ADR-0331
// §D3 WAS DECIDED ON A WRONG PREMISE. `SlabStore.update(id: string, nextState:
// SlabData)` (`SlabStore.ts:259-273`) is `structuredClone(nextState)` → `freeze`
// → `set(id, next)`: a WHOLE-RECORD REPLACE. Handing it the one-key partial the
// field arm below builds leaves the slab as `{ <field>: value }` — no id, no
// polygon, no position, no levelId, no ifcData — frozen, with ZERO diagnostics.
//
// §L-977 CLOSED 2026-08-18 — ALL TWENTY-ONE MEASURED, NOT ASSUMED. The surface
// audit above ("all expose update(id, partial)") is a claim about a SIGNATURE;
// only the SEMANTICS decide whether a partial is safe, and they were never read.
// Measured: FOUR stores REPLACE — `slab`, `column`, `furniture`, `plumbing`. The
// other seventeen merge, and several of THEM branch on which keys are present
// (`WallStore` clears `_sourceBaseLine`, drops `openings` and Zod-validates the
// ARGUMENT), so the obvious fix — always spread the record in — trades a
// slab-shaped data loss for a wall-shaped behaviour change. The write shape is
// therefore chosen from a per-store DECLARATION carrying its file:line evidence
// (`./legacyStoreUpdateSemantics.ts`), re-derived from the REAL stores by
// `apps/editor/__tests__/LegacyStoreUpdateSemantics.measured.test.ts`. The
// original evidence for the slab arm:
// `apps/editor/__tests__/D3ForwardPatchThroughAdapter.probe.test.ts` ARM 4, which
// executes a real `slab.setThickness` patch against the real store. The reason
// this survived three years of green tests is that this suite's siblings assert
// against hand-written Maps whose `update` merges: a fake built from this header
// cannot falsify this header. The mutator SURFACE was verified; the mutator
// SEMANTICS were not, and only the semantics decide whether a partial is safe.
//
// PATCH SHAPE (verified): every `Create<Element>Handler` does
// `produceCommand(ctx.stores.<x>, d => d[id] = element)` over a `Record<id,T>`, so
// patches are store-relative:
//   • undo of create  → inverse `{ op:'remove', path:[id] }`
//   • redo of create  → forward `{ op:'add',    path:[id], value: element }`
//   • field edits      → `{ op:'replace', path:[id, field, …], value }`
//
// ⚠ THIS IS TRUE, AND IT IS NOT EVIDENCE THAT A PATCH CAN BE APPLIED. It is a
// claim about the PATH only. `path[1]` names an L1 field; whether the LEGACY
// record carries a field of that name is a separate question this adapter never
// asks on the depth-2 arm (`_resolveFieldValue` returns `{ok:true}` immediately
// when `path.length === 2`, without reading the record). The rename this file
// documents below for curtain wall (bayWidth→gridXSpacing) is not exotic — L1
// `roof.pitch` (radians) versus legacy `RoofData.slope` (rise/run) is the same
// shape, and `pitch` appears ZERO times in `packages/geometry-roof/src`. Measured:
// same probe, ARM 3 — the write lands, one mutation fires, no diagnostic is
// emitted, and the field the builder actually reads never moves. The whole-element
// arm is protected from this by `_undoRestoreSnapshots`; the field arm is not, and
// a FORWARD-only application (ADR-0331 §D3) never has a snapshot at all.
//
// SCOPE: this covers the standard top-level element stores. HOSTED elements
// (door/window — undo must also remove the wall opening) and LEVELS (Path-A
// commandManager) are intentionally NOT adapted by the call sites; left raw they
// fall through to the B3 `commandManager.undo()` fallback. See ADR-051.

import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import {
  resolveLegacyStoreUpdateDeclaration,
  type LegacyStoreUpdateDeclaration,
} from './legacyStoreUpdateSemantics.js';

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
  /** §L-1087 — THE level authority, used to resolve the two storey elevations a
   *  height-dependent family needs in order to REVERSE a storey move. */
  getLevelById?(levelId: string): { elevation?: number } | undefined;
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

// ── §HOSTED-OPENING-UNDO (OI-054 (b), 2026-05-24) ─────────────────────────────
// Doors/windows are HOSTED: placing one (`wall.opening.create`, affectedStores=['wall'])
// writes the opening into the host wall's `openings` array (the ring-buffer patch),
// while the §P2.3 bridge SEPARATELY adds a doorStore/windowStore record (the door
// leaf/frame mesh + plan swing-arc) as an event side-effect that is NOT in the patch.
// So a naive `wallStore.update(wallId, {openings})` on undo closes the hole but leaves
// the door element behind. The canonical two-part removal (CreateWallOpeningCommand.undo)
// is `wallStore.removeOpening(wallId, openingId)` (closes the hole + drops the WallStore-
// internal door) + `doorStore.remove(elementId)` (removes the leaf mesh + swing arc).
// This reconciler diffs the wall's current openings against the target the undo/redo
// patch sets and drives those exact APIs, snapshotting the removed hosted record so a
// subsequent redo restores it faithfully (mirrors the whole-element snapshot pattern).

interface OpeningLike { readonly id: string; readonly elementId?: string; readonly type?: string }
interface HostedStoreLike {
  add?(rec: unknown): void;
  remove?(id: string): unknown;
  getById?(id: string): unknown;
  get?(id: string): unknown;
  has?(id: string): boolean;
}
interface WallOpeningStoreLike extends LegacyElementStoreLike {
  removeOpening?(wallId: string, openingId: string): unknown;
  addOpening?(wallId: string, opening: unknown): unknown;
}

/** Captured hosted door/window records, keyed by elementId, so redo restores the
 *  exact record removed on undo (avoids re-resolving systemType finishes). */
const _hostedRestoreSnapshots = new Map<string, { type: string; record: unknown }>();

function _hostedStore(type: string | undefined): HostedStoreLike | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as Record<string, unknown>;
  return (type === 'window' ? w.windowStore : w.doorStore) as HostedStoreLike | undefined;
}
function _hostedGet(store: HostedStoreLike | undefined, id: string): unknown {
  if (!store) return undefined;
  return typeof store.getById === 'function' ? store.getById(id)
    : typeof store.get === 'function' ? store.get(id) : undefined;
}

/** True if this store is the host-wall store (exposes the opening mutators). */
function _isWallOpeningStore(store: LegacyElementStoreLike): store is WallOpeningStoreLike {
  const s = store as WallOpeningStoreLike;
  return typeof s.removeOpening === 'function' && typeof s.addOpening === 'function';
}

/**
 * Reconcile a host wall's openings to `target` using the hosted-aware APIs:
 * removed openings → `removeOpening` + drop (and snapshot) the door/window record;
 * added openings → `addOpening` + restore the door/window record from the snapshot.
 */
function _reconcileWallOpenings(store: WallOpeningStoreLike, wallId: string, target: readonly OpeningLike[]): void {
  const wall = _getValue(store, wallId) as { openings?: OpeningLike[] } | null | undefined;
  if (wall == null) { console.warn('[elementUndoStoreAdapter] reconcileWallOpenings — wall not found:', wallId); return; }
  const current = wall.openings ?? [];
  const targetIds = new Set(target.map(o => o.id));
  const currentIds = new Set(current.map(o => o.id));

  // Removed openings = undo of a placement → remove hole + hosted element.
  for (const o of current) {
    if (targetIds.has(o.id)) continue;
    if (o.elementId) {
      const hs = _hostedStore(o.type);
      const rec = _hostedGet(hs, o.elementId);
      if (rec != null) _hostedRestoreSnapshots.set(o.elementId, { type: o.type ?? 'door', record: rec });
      try { hs?.remove?.(o.elementId); } catch (err) { console.error('[elementUndoStoreAdapter] hosted remove failed:', err); }
      try { elementRegistry.unregister(o.elementId); } catch { /* best-effort §3.5 */ }
    }
    try { store.removeOpening?.(wallId, o.id); } catch (err) { console.error('[elementUndoStoreAdapter] removeOpening failed:', err); }
  }

  // Added openings = redo of a placement → re-cut hole + restore hosted element.
  for (const o of target) {
    if (currentIds.has(o.id)) continue;
    try { store.addOpening?.(wallId, o); } catch (err) { console.error('[elementUndoStoreAdapter] addOpening failed:', err); }
    if (o.elementId) {
      const hs = _hostedStore(o.type);
      const stashed = _hostedRestoreSnapshots.get(o.elementId);
      if (stashed != null && hs?.has?.(o.elementId) !== true && typeof hs?.add === 'function') {
        try { hs.add(stashed.record); _hostedRestoreSnapshots.delete(o.elementId); } catch (err) { console.error('[elementUndoStoreAdapter] hosted restore failed:', err); }
      }
    }
  }
}

/** Duck-typed union of the legacy element-store mutator surface. */
export interface LegacyElementStoreLike {
  add?(element: unknown): void;
  remove?(id: string): unknown;
  delete?(id: string): unknown;
  update?(id: string, updates: Record<string, unknown>): unknown;
  getById?(id: string): unknown;
  get?(id: string): unknown;
  /** §L-946 — the storey move. `update()` REFUSES a levelId change in both
   *  stores that have one, and BOTH refuse by THROWING (`WallStore.ts:781`
   *  "Wall levelId cannot be modified after creation"; `RoofStore.ts:109`
   *  "levelId is immutable after creation"), so a level change can only be
   *  reverted through this. The throw is why the pre-L-946 failure was
   *  invisible: it landed in the per-patch try/catch below as one console.error
   *  while the keypress reported success. */
  changeLevel?(
    id: string,
    newLevelId: string,
    /** §L-1087 — see `elementLevelChangedMirror.LevelChangeElevations`. Optional:
     *  the eight families whose builders re-derive `worldY` from
     *  `level.elevation` ignore it entirely. The four that seat at an ABSOLUTE Y
     *  REFUSE without it rather than reverting the storey and leaving the height
     *  behind — an undo that restores half of what the edit wrote is a C84 EI-7
     *  breach wearing the costume of a fix. */
    opts?: { newElevation?: number; previousElevation?: number },
  ): unknown;
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

// ── §EI-7b DEEP-PATCH (C84 §3, severity 2) ────────────────────────────────────
// A PATCH DEEPER THAN THIS ADAPTER CAN APPLY MUST NEVER BE FLATTENED INTO A
// TOP-LEVEL WRITE.
//
// THE DEFECT THIS CLOSES. The field arm below used to read `field = p.path[1]`
// and write `store.update(id, { [field]: p.value })` for a patch of ANY depth,
// under a comment calling it "best-effort". It was not an omission — it was a
// corrupting write. Immer's inverse for an array append is ONE length patch
// (`generateArrayPatches`: "one inverse patch for the length change"):
//
//     c.panels.push({…})            → inverse { op:'replace',
//                                               path:[cwId,'panels','length'],
//                                               value: <old length> }
//
// so `curtain-wall.addPanel` + Ctrl+Z executed `update(cwId, { panels: 3 })`
// and THE PANELS ARRAY BECAME A NUMBER — live, reachable, non-refusing, and
// shared by `SetCurtainWallPanelType` (`{panels:'glazed'}` from
// `[…,'panels',idx,'kind']`), `AddCurtainGridLine` and `RemoveCurtainGridLine`.
//
// THE RULE (C84 §1, quoting `packages/geometry-wall/src/WallRake.ts:50-62`):
// "A refusal is a correct answer; a silently-wrong wall is not." So the sub-path
// is APPLIED where the legacy record can carry it, and REFUSED LOUDLY — record
// untouched — where it cannot. Corrupting is strictly worse than refusing.
//
// WHY REFUSAL IS A REAL BRANCH AND NOT A FORMALITY: the legacy record is
// bridge-mapped and is NOT the L1 record the patch was minted against (see
// §OI-054 REDO-SHAPE-FIX above — bayWidth→gridXSpacing, and the legacy curtain
// wall may hold no `panels` array at all). A sub-path with no anchor in the
// legacy record cannot be applied to it, and inventing the anchor is exactly the
// class of write this section exists to stop.

/** What a top-level field must become after a patch — or why it cannot be known. */
type FieldResolution =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly reason: string };

/** Plain data we may path-copy. Class instances / exotic objects are REFUSED
 *  rather than half-cloned — a partial clone of a live record is a corruption
 *  with extra steps. */
function _isPathCopyable(v: unknown): boolean {
  if (Array.isArray(v)) return true;
  if (typeof v !== 'object' || v === null) return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

function _shallowCopy(node: unknown): Record<string, unknown> | unknown[] {
  return Array.isArray(node) ? node.slice() : { ...(node as Record<string, unknown>) };
}

/**
 * Apply ONE RFC-6902 op at `segs` inside `node`, returning a path-copied clone
 * (only the nodes along the path are copied; siblings keep their identity).
 * Mirrors Immer's own `applyPatches` semantics for arrays — `add` splices in,
 * `remove` splices out, and a `length` leaf truncates — so an inverse patch this
 * adapter applies lands on the same value Immer's applicator would produce.
 */
function _applyAtPath(
  node: unknown,
  segs: ReadonlyArray<string | number>,
  op: UndoPatchOp['op'],
  value: unknown,
): FieldResolution {
  if (!_isPathCopyable(node)) {
    return { ok: false, reason: `sub-path anchor is ${node === undefined ? 'absent' : `a ${typeof node}`}, not a plain object/array` };
  }
  const seg = segs[0];
  if (seg == null) return { ok: false, reason: 'empty sub-path' };
  const key = String(seg);
  const copy = _shallowCopy(node);

  // ── Descend ────────────────────────────────────────────────────────────────
  if (segs.length > 1) {
    if (Array.isArray(copy)) {
      const i = Number(key);
      if (!Number.isInteger(i) || i < 0 || i >= copy.length) {
        return { ok: false, reason: `array index '${key}' is out of range (length ${copy.length})` };
      }
      const child = _applyAtPath(copy[i], segs.slice(1), op, value);
      if (!child.ok) return child;
      copy[i] = child.value;
    } else {
      const child = _applyAtPath((copy as Record<string, unknown>)[key], segs.slice(1), op, value);
      if (!child.ok) return child;
      (copy as Record<string, unknown>)[key] = child.value;
    }
    return { ok: true, value: copy };
  }

  // ── Leaf ───────────────────────────────────────────────────────────────────
  if (Array.isArray(copy)) {
    if (key === 'length') {
      // THE CURTAIN-WALL CASE. Immer's inverse for an array that GREW.
      if (op === 'remove') return { ok: false, reason: "cannot 'remove' an array length" };
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        return { ok: false, reason: `array length must be a non-negative integer, got ${JSON.stringify(value) ?? String(value)}` };
      }
      copy.length = value;
      return { ok: true, value: copy };
    }
    const i = Number(key);
    if (!Number.isInteger(i) || i < 0) return { ok: false, reason: `'${key}' is not an array index` };
    if (op === 'remove') {
      if (i >= copy.length) return { ok: false, reason: `cannot remove index ${i} (length ${copy.length})` };
      copy.splice(i, 1);
    } else if (op === 'add') {
      if (i > copy.length) return { ok: false, reason: `cannot insert at index ${i} (length ${copy.length})` };
      copy.splice(i, 0, value);
    } else {
      if (i > copy.length) return { ok: false, reason: `cannot replace index ${i} (length ${copy.length})` };
      copy[i] = value;
    }
    return { ok: true, value: copy };
  }
  if (op === 'remove') delete (copy as Record<string, unknown>)[key];
  else (copy as Record<string, unknown>)[key] = value;
  return { ok: true, value: copy };
}

/**
 * Resolve the value the record's TOP-LEVEL field `path[1]` must hold after `p`.
 * Depth 2 is the value itself; deeper is the sub-path applied inside the field's
 * CURRENT value read from the legacy store — which is why a record that does not
 * carry that field is a refusal rather than a write.
 */
function _resolveFieldValue(store: LegacyElementStoreLike, id: string, p: UndoPatchOp): FieldResolution {
  const fieldName = String(p.path[1]);
  if (p.path.length === 2) {
    return { ok: true, value: p.op === 'remove' ? undefined : p.value };
  }
  const rec = _getValue(store, id) as Record<string, unknown> | null | undefined;
  if (rec == null) return { ok: false, reason: `element '${id}' is not in this store` };
  const r = _applyAtPath(rec[fieldName], p.path.slice(2), p.op, p.value);
  return r.ok ? r : { ok: false, reason: `${fieldName}: ${r.reason}` };
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
  _hostedRestoreSnapshots.clear();
}

/**
 * Wrap a live legacy element store so undo/redo inverse/forward patches drive the
 * mesh through `add`/`remove`/`update`. Symmetric — handles both directions.
 *
 * @param storeKey  The bus `affectedStores` key this store is bound to in
 *   `buildUndoStoreMap()`. §L-977: it is how the field arm looks up whether this
 *   store's `update()` MERGES or REPLACES. Omitting it does not silently pick a
 *   shape — the field arm reports the omission on every op it writes (see
 *   `§L-977 UNDECLARED`). Optional only so the deprecated single-argument
 *   `wallUndoStoreAdapter` alias keeps compiling.
 */
export function elementUndoStoreAdapter(
  store: LegacyElementStoreLike,
  storeKey?: string,
): PatchApplicableAdapter {
  const declaration: LegacyStoreUpdateDeclaration | undefined =
    resolveLegacyStoreUpdateDeclaration(storeKey);
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
            // Field-level op: path = [id, field, …].
            const field = p.path[1];
            if (field == null) continue;
            const fieldName = String(field);
            // `childrenIds` on a host wall is managed by removeOpening/addOpening
            // — skip the generic update so it doesn't clobber what the reconciler set.
            if (fieldName === 'childrenIds' && _isWallOpeningStore(store)) continue;
            // §L-946 — REVERTING A STOREY MOVE.
            //
            // `levelId` is the one field the generic `store.update()` below cannot
            // carry: it is a spatial anchor, and both legacy stores that have one
            // refuse to change it through `update` — by THROWING, which is why the
            // failure was invisible: the throw landed in this loop's own try/catch
            // as one console.error while the keypress reported success. Before
            // L-946 that cost nothing, because nothing ever moved an element
            // between storeys through the bus in the first place. Now that the
            // forward direction works, an unrouted undo would revert the PLUGIN
            // store while the legacy record stayed on the new floor — the same
            // two-copy divergence L-946 closed, re-opened by Ctrl+Z, and pointing
            // the other way. Route it to the store's own move operation, which is
            // exactly what the forward mirror uses.
            //
            // The spatial half moves with it: `bimManager.registerElement` is
            // exclusive-containment, so re-registering IS the move, and the VDT
            // element→level map must follow or every later event on this element
            // dirties the storey it no longer sits on.
            if (fieldName === 'levelId' && p.path.length === 2 && typeof store.changeLevel === 'function') {
              const target = typeof p.value === 'string' ? p.value.trim() : '';
              // An empty target is refused rather than defaulted — `'' → 'L0'` is
              // the §DIAG-WALL-LEVEL trap that files elements on the ground floor.
              if (target.length === 0) {
                console.warn('[elementUndoStoreAdapter] §L-946 skip levelId revert — patch carries no target level for', id);
                continue;
              }
              // §L-1087 — THE INVERSE MUST CARRY THE HEIGHT BACK TOO (C84 EI-7:
              // undo restores EVERY store the edit wrote, and for four families
              // the height is part of what it wrote).
              //
              // Both numbers are resolved HERE, from the same level authority the
              // forward mirror uses, and are never read out of the patch: a patch
              // records `levelId`, and an elevation smuggled alongside it would be
              // a second copy of a number the level store owns — stale the moment
              // someone edits a storey's height. Resolving at both ends keeps one
              // answer to one question (C84 EI-9).
              //
              // `previous` here is the storey the element is on RIGHT NOW, i.e.
              // the one the forward move put it on; `target` is where it came
              // from. The delta is therefore the exact negation of the forward
              // delta, which is what makes the round trip land on the original Y.
              const _bimNow = _bim();
              const _elev = (lvl: string | null | undefined): number | undefined => {
                if (lvl == null || lvl.length === 0) return undefined;
                try {
                  const e = _bimNow?.getLevelById?.(lvl)?.elevation;
                  return typeof e === 'number' && Number.isFinite(e) ? e : undefined;
                } catch { return undefined; }
              };
              const _currentLevelId = (_getValue(store, id) as { levelId?: string } | undefined)?.levelId;
              store.changeLevel(id, target, {
                previousElevation: _elev(_currentLevelId),
                newElevation: _elev(target),
              });
              try { _bim()?.registerElement?.(id, target); } catch (err) { console.warn('[elementUndoStoreAdapter] §L-946 bimManager.registerElement failed:', err); }
              try { _vdt()?.registerElement?.(id, target); } catch (err) { console.warn('[elementUndoStoreAdapter] §L-946 vdt.registerElement failed:', err); }
              continue;
            }
            // §EI-7b — resolve what this field must BECOME. Depth 2 is the patch
            // value; deeper is the sub-path applied inside the field's current
            // value. A sub-path the legacy record cannot carry REFUSES here and
            // the record is left exactly as it was (C84 §3 EI-7b).
            const resolved = _resolveFieldValue(store, id, p);
            if (!resolved.ok) {
              console.error(
                `[elementUndoStoreAdapter] §EI-7b REFUSED — cannot apply a depth-${p.path.length} ` +
                `'${p.op}' patch at [${p.path.join('/')}]: ${resolved.reason}. ` +
                'The record was NOT modified (C84 §3 EI-7b — a refusal is a correct answer; ' +
                'a silently-wrong record is not).',
              );
              continue;
            }

            // §HOSTED-OPENING-UNDO (OI-054 (b)) — reverting a host wall's `openings`
            // is a TWO-PART operation (close the hole + remove the hosted door/window
            // mesh). The generic update() below is the wrong API for it (WallStore
            // warns + the door stays). Route the RESOLVED array to the hosted-aware
            // reconciler.
            //
            // §EI-7b TRAPDOOR: this used to read `Array.isArray(p.value) ? … : []`
            // on the RAW patch value at any depth, so a deep `openings` patch
            // (`[wallId,'openings','length']`, `[wallId,'openings',0,'width']`) — whose
            // value is a number, never an array — reconciled the wall to ZERO
            // openings and STRIPPED EVERY DOOR AND WINDOW FROM IT. `resolved.value`
            // is the full post-patch array, so the deep cases now reconcile
            // correctly; a value that is still not an array is REFUSED, never
            // read as "remove them all".
            if (fieldName === 'openings' && _isWallOpeningStore(store)) {
              if (!Array.isArray(resolved.value)) {
                console.error(
                  `[elementUndoStoreAdapter] §EI-7b REFUSED — 'openings' patch at [${p.path.join('/')}] ` +
                  `resolved to a ${typeof resolved.value}, not an array. Every opening on wall '${id}' ` +
                  'was left in place (an empty target would have stripped them all).',
                );
                continue;
              }
              _reconcileWallOpenings(store, id, resolved.value as OpeningLike[]);
              continue;
            }

            // ── §L-977 — THE FIELD WRITE. Three defects lived on the two lines
            // this block replaces; all three are closed here.
            //
            // (a) THE SILENT ABSENT-ID BRANCH. `if (!exists) continue` said
            //     nothing, while BOTH whole-element arms above warn on the
            //     identical id. A patch that reverts nothing must not look like a
            //     patch that reverted something — `performUndo` reports the store
            //     as applied either way, so the console is the only channel left.
            if (!exists) {
              console.warn(
                `[elementUndoStoreAdapter] §L-977 skip field patch — element '${id}' is not in the ` +
                `'${storeKey ?? '<unkeyed>'}' store, so the depth-${p.path.length} '${p.op}' at ` +
                `[${p.path.join('/')}] reverted NOTHING. (The whole-element arms warn on the same ` +
                'absent id; this branch used to be silent.)',
              );
              continue;
            }
            if (typeof store.update !== 'function') {
              console.warn(
                `[elementUndoStoreAdapter] §L-977 skip field patch — the '${storeKey ?? '<unkeyed>'}' ` +
                `store has no update() to route [${p.path.join('/')}] through.`,
              );
              continue;
            }

            // (b) AN L1 FIELD NAME THE LEGACY RECORD DOES NOT HAVE.
            //     `roof.setPitch` mints `[id,'pitch']` in RADIANS; the legacy roof
            //     record's geometry field is `slope`, in rise/run — `pitch`
            //     appears ZERO times in `packages/geometry-roof/src`. The old code
            //     wrote it anyway: one mutation, zero diagnostics, and the field
            //     the builder actually reads never moved. A unit mismatch written
            //     under a name the target does not have is silent corruption, so a
            //     MEASURED divergence is refused outright (C84 §1 — a refusal is a
            //     correct answer). Translating instead is the per-family
            //     L1→legacy translator SPEC S7.2a makes a PREREQUISITE of
            //     ADR-0331 §D3; it is not minted here one field at a time.
            const divergentTo = declaration?.divergentL1Fields?.[fieldName];
            if (divergentTo != null) {
              console.error(
                `[elementUndoStoreAdapter] §L-977 REFUSED — '${fieldName}' is an L1 field name that the ` +
                `legacy '${storeKey}' record does not carry; its counterpart is '${divergentTo}', and the ` +
                'two do not share a unit (roof: L1 `pitch` is RADIANS, legacy `slope` is rise/run). ' +
                `Writing it would land on a phantom key while '${divergentTo}' never moved. The record ` +
                'was NOT modified — this needs the per-family L1→legacy translator (SPEC S7.2a), not a ' +
                'guess at the conversion.',
              );
              continue;
            }
            // A name that is merely ABSENT — not a measured divergence — is still
            // applied (a legitimately-optional field is written for the first time
            // this way), but it no longer happens quietly.
            const currentRecord = _getValue(store, id) as Record<string, unknown> | null | undefined;
            if (currentRecord != null && !(fieldName in currentRecord)) {
              console.warn(
                `[elementUndoStoreAdapter] §L-977 field '${fieldName}' is not present on the legacy ` +
                `'${storeKey ?? '<unkeyed>'}' record '${id}' (it holds: ${Object.keys(currentRecord).join(', ')}). ` +
                'Applying anyway — an optional field may be written for the first time — but if this is ' +
                'an L1-vs-legacy NAME divergence the revert is landing on a phantom key. Declare it in ' +
                'legacyStoreUpdateSemantics.ts `divergentL1Fields` if so.',
              );
            }

            // (c) MERGE VS REPLACE. `store.update(id, { [field]: value })` is a
            //     WHOLE-RECORD REPLACE on the four stores whose `update` takes a
            //     next-state rather than a patch (slab, column, furniture,
            //     plumbing) — that is L-977: Ctrl+Z after a slab move left the
            //     record as `{holes: []}`. It is equally wrong to spread the whole
            //     record into a MERGE store: `WallStore.update` clears
            //     `_sourceBaseLine` on `'baseLine' in updates`, warns-and-drops
            //     `openings`, deletes hosted children on `childrenIds`, and
            //     Zod-validates the ARGUMENT. So the shape comes from the measured
            //     declaration, never from a guess.
            if (declaration == null) {
              console.error(
                `[elementUndoStoreAdapter] §L-977 UNDECLARED STORE '${storeKey ?? '<unkeyed>'}' — no ` +
                'measured merge-vs-replace declaration, so the write shape is unknown. Falling back to ' +
                `the historical one-key partial for [${p.path.join('/')}], which DESTROYS the record if ` +
                'this store replaces. Measure its update() and add a row to ' +
                'apps/editor/src/engine/undo/legacyStoreUpdateSemantics.ts.',
              );
              store.update(id, { [fieldName]: resolved.value });
            } else if (declaration.semantics === 'replace') {
              // The store's own contract (SlabStore.ts:255-258): "Commands must
              // construct and pass a complete replacement object — no partial
              // patches." Build it. A depth-2 'remove' DELETES the key rather than
              // writing `undefined`, so the replacement is the record the patch
              // describes and not a record with a hole in it.
              const nextState: Record<string, unknown> = { ...(currentRecord ?? {}) };
              if (p.op === 'remove' && p.path.length === 2) delete nextState[fieldName];
              else nextState[fieldName] = resolved.value;
              store.update(id, nextState);
            } else {
              store.update(id, { [fieldName]: resolved.value });
            }
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
    out[key] = store ? elementUndoStoreAdapter(store as LegacyElementStoreLike, key) : undefined;
  }
  return out;
}

/** @deprecated Back-compat alias — use {@link elementUndoStoreAdapter}. */
export const wallUndoStoreAdapter = elementUndoStoreAdapter;
