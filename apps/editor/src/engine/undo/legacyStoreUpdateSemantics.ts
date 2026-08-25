// §L-977 — MERGE-VS-REPLACE, DECLARED PER STORE, MEASURED NOT ASSUMED.
//
// ─── WHAT THIS FILE IS FOR ────────────────────────────────────────────────────
// `elementUndoStoreAdapter`'s field arm turns a depth-2 undo/redo patch
// (`{op:'replace', path:[id, field], value}`) into a call on the LIVE legacy
// store's own `update()`. For three years it wrote a ONE-KEY PARTIAL and the
// adapter's header asserted, from a SURFACE audit, that every store took
// `update(id, partial)`.
//
// That is false. `SlabStore.update(id, nextState: SlabData)`
// (`packages/geometry-slab/src/SlabStore.ts:259-273`) is
// `structuredClone(nextState)` → `freeze` → `set(id, next)`: a WHOLE-RECORD
// REPLACE. Handed a one-key partial it leaves the slab as `{ <field>: value }` —
// no id, no polygon, no position, no levelId, no ifcData — frozen, still under
// its own key, with ZERO diagnostics, while `performUndo` reports the store as
// applied. That is reachable TODAY by moving a slab and pressing Ctrl+Z
// (L-977; pinned by `apps/editor/__tests__/SlabUndoDestroysLegacyRecord.test.ts`).
//
// ─── WHY A DECLARATION AND NOT A BLANKET SPREAD ───────────────────────────────
// The obvious fix — always spread the current record into the write — is CORRECT
// for a replace store and WRONG for several merge stores, because a merge store's
// `update()` branches on WHICH KEYS ARE PRESENT in the argument:
//
//   • `WallStore._updateImpl` (`packages/geometry-wall/src/WallStore.ts:764`)
//     clears `_sourceBaseLine` on `'baseLine' in safeUpdates && !('_sourceBaseLine'
//     in safeUpdates)`, warns-and-drops on `safeUpdates.openings !== undefined`
//     (`:788`), and Zod-validates the ARGUMENT (`:769`) — a full-record write
//     changes all three behaviours and can throw.
//   • `RoomStore.update` (`packages/room-topology/src/RoomStore.ts:296-317`)
//     THROWS on `'id' in updates` / `'type' in updates` / `'levelId' in updates`
//     when the value differs, then Zod-validates the remainder.
//   • `GridStore.update` (`packages/core-app-model/src/stores/GridStore.ts:79-92`)
//     refuses whichever GEOMETRY keys are present when the grid is pinned.
//   • `CeilingStore.update` (`.../CeilingStore.ts:181-203`) and `FloorStore.update`
//     (`.../FloorStore.ts:141-153`) branch on `levelId` / `holeElements` /
//     `boundary` PRESENCE.
//
// So "spread everything" trades a slab-shaped data loss for a wall-shaped
// behaviour change. The write has to be correct for what each store ACTUALLY
// does — hence one declaration per store family, each carrying its file:line
// evidence, and a suite that re-derives every declaration from the REAL store
// rather than trusting this table (§THE-FAKE-CANNOT-FALSIFY-THE-HEADER: the
// reason the original defect survived is that `elementUndoStoreAdapter.test.ts`
// asserts against hand-written Maps that merge and validate nothing — a fake
// built from the header cannot falsify the header).
//
// ─── HOW TO KEEP THIS TRUE ────────────────────────────────────────────────────
// `apps/editor/__tests__/LegacyStoreUpdateSemantics.measured.test.ts` constructs
// the REAL store, seeds a REAL record, calls the REAL `update()` with a one-key
// partial and asks the record whether it survived. A declaration that disagrees
// with its store FAILS there. Do not edit a row here without re-running it.

/** What `update(id, arg)` does with the keys the caller did NOT supply. */
export type LegacyUpdateSemantics =
  /** Keys absent from `arg` keep their current value (`{...existing, ...arg}`). */
  | 'merge'
  /** `arg` becomes the WHOLE record; absent keys are ANNIHILATED. */
  | 'replace'
  /** Not measured — the adapter must not assume either. See `note`. */
  | 'unmeasured';

export interface LegacyStoreUpdateDeclaration {
  readonly semantics: LegacyUpdateSemantics;
  /** Concrete class + package the `window.<x>Store` global actually holds. */
  readonly store: string;
  /** `path:line` of the decisive lines in that class's `update()`. */
  readonly evidence: string;
  /** Anything a caller must know before choosing a write shape. */
  readonly note?: string;
  /**
   * §L-977 SIBLING (b) — L1 patch field names MEASURED to be absent from this
   * legacy record's shape, mapped to the legacy name that carries the same
   * meaning. A depth-2 patch naming one of these is REFUSED, loudly: the write
   * would land on a phantom key while the field the builder reads never moves,
   * and — for `roof.pitch` — the two names do not even share a unit.
   *
   * This is deliberately a REFUSAL and not a translation. Translating is the
   * per-family L1→legacy shape translator SPEC S7.2a makes a PREREQUISITE of
   * ADR-0331 §D3; inventing it here, one field at a time, is how a translator
   * ends up existing in thirteen half-versions. A refusal is a correct answer.
   */
  readonly divergentL1Fields?: Readonly<Record<string, string>>;
}

/**
 * Normalise a bus `affectedStores` key to its family.
 *
 * `buildUndoStoreMap()` maps several spellings onto one store — `wall`/`walls`,
 * `curtainwall`/`curtain-wall`/`curtainWall`/`curtainWalls` — and every spelling
 * must resolve to the SAME declaration or an alias silently loses the fix. Lower
 * case, drop non-alphanumerics, drop one trailing plural `s`. No singular family
 * name in the map ends in `s`, so the last step cannot collide (asserted in the
 * coverage suite).
 */
export function normaliseStoreKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/s$/, '');
}

/**
 * MEASURED 2026-08-18 (L-977). Every key `buildUndoStoreMap()`
 * (`apps/editor/src/engine/undo/performUndoRedo.ts:308`) can produce, normalised
 * by {@link normaliseStoreKey}.
 *
 * FOUR of the twenty-one are REPLACE stores — slab, column, furniture, plumbing —
 * not the one the adapter header knew about. Two of the four (column, plumbing)
 * were never even suspected.
 */
export const LEGACY_STORE_UPDATE_SEMANTICS: Readonly<Record<string, LegacyStoreUpdateDeclaration>> = {
  // ── REPLACE ────────────────────────────────────────────────────────────────
  slab: {
    semantics: 'replace',
    store: 'SlabStore (@pryzm/geometry-slab)',
    evidence: 'packages/geometry-slab/src/SlabStore.ts:259-273',
    note: 'update(id, nextState: SlabData) → structuredClone(nextState) → freezeSlabData → set(id, next). '
        + 'Its own doc-comment says so: "Commands must construct and pass a complete replacement object — '
        + 'no partial patches." Guarded by `if (slab)`, so an absent id is a no-op, not a create.',
  },
  column: {
    semantics: 'replace',
    store: 'ColumnStore (@pryzm/geometry-column)',
    evidence: 'packages/geometry-column/src/ColumnStore.ts:215-243',
    note: 'update(id, nextState: Omit<ColumnData,"id"|"type">) → { ...nextState, id, type } → '
        + 'validateColumnData → structuredClone → freeze → set. Only id and type are re-attached; every '
        + 'other absent key is annihilated. It THROWS "cannot clear column.levelId" on a partial that '
        + 'omits levelId (:226-228), so the one-key write was at least noisy here — but the throw landed '
        + 'in the adapter\'s per-op catch as one console.error while the keypress reported success.',
  },
  furniture: {
    semantics: 'replace',
    store: 'FurnitureStore (@pryzm/geometry-furniture)',
    evidence: 'packages/geometry-furniture/src/FurnitureStore.ts:27-36',
    note: 'update(id, data: FurnitureData) → snapshot(data) → set(id, snap). Warns on an absent id '
        + '(:29) but never on a partial. It then emits `bim-furniture-updated` with `snap.id`, which '
        + 'a one-key partial makes `undefined`.',
  },
  plumbing: {
    semantics: 'replace',
    store: 'PlumbingStore (@pryzm/geometry-plumbing)',
    evidence: 'packages/geometry-plumbing/src/PlumbingStore.ts:27-31',
    note: 'update(id, data) → set(id, structuredClone(data)) with NO existence check at all — it will '
        + 'happily mint a record from a partial. The adapter\'s own `_exists` guard is the only thing '
        + 'standing between a stray patch and a phantom fixture.',
  },

  // ── MERGE ──────────────────────────────────────────────────────────────────
  wall: {
    semantics: 'merge',
    store: 'WallStore (@pryzm/geometry-wall)',
    evidence: 'packages/geometry-wall/src/WallStore.ts:695,710,798 ({ ...wall, ...safeUpdates })',
    note: 'PRESENCE-KEYED SIDE EFFECTS — this is the store that makes a blanket spread unsafe. '
        + ':764-766 clears `_sourceBaseLine` when `baseLine` is present WITHOUT it; :787-790 warns and '
        + 'DROPS `openings`; :856-859 DELETES hosted door/window child records when `childrenIds` is '
        + 'present; :771-779 Zod-validates the ARGUMENT, so a full-record write is checked against a '
        + 'partial-update schema; :782-784 throws on a levelId change; :736-752 throws on a baseLine '
        + 'reversal. A merge store MUST get a partial.',
  },
  room: {
    semantics: 'merge',
    store: 'RoomStore (@pryzm/room-topology)',
    evidence: 'packages/room-topology/src/RoomStore.ts:287-320',
    note: 'THROWS on `id` / `type` / `levelId` present-and-different (:296-304), then Zod-validates the '
        + 'stripped argument (:312). PRESENCE-KEYED: `boundary` re-winds the polygon CCW and recomputes '
        + '`computed` (:326-329). A full-record write would put the whole record through '
        + 'RoomDataUpdateSchema and force a metrics recompute on every field edit.',
  },
  roof: {
    semantics: 'merge',
    store: 'RoofStore (@pryzm/geometry-roof)',
    evidence: 'packages/geometry-roof/src/RoofStore.ts:104-118 (cloneRoofData + Object.assign)',
    note: 'Throws on a levelId change (:107-109); bumps metadata.version on every call.',
    // §L-977 SIBLING (b).
    divergentL1Fields: {
      pitch: 'slope',
    },
  },
  curtainwall: {
    semantics: 'merge',
    store: 'CurtainWallStore (@pryzm/geometry-curtain-wall)',
    evidence: 'packages/geometry-curtain-wall/src/CurtainWallStore.ts:365-370 ({ ...existing, ...updates })',
  },
  curtainpanel: {
    semantics: 'merge',
    store: 'CurtainPanelStore (@pryzm/geometry-curtain-wall)',
    evidence: 'packages/geometry-curtain-wall/src/CurtainPanelStore.ts:235-243 ({ ...existing, ...updates })',
    note: 'Warns on an absent id (:238). `set()` re-indexes `byCellKey` / `byWallId` keyed on whether '
        + '`curtainWallId` or `cellIndex` changed (:107-119), so a full-record write would touch two '
        + 'secondary indexes on every field edit.',
  },
  stair: {
    semantics: 'merge',
    store: 'StairStore (@pryzm/geometry-stair)',
    evidence: 'packages/geometry-stair/src/StairStore.ts:66-95 ({ ...stair, ...updates })',
    note: '`properties` is DEEP-merged when both sides have it (:71-73); metadata.version always bumps.',
  },
  stairrailing: {
    semantics: 'merge',
    store: 'StairRailingStore (@pryzm/geometry-stair)',
    evidence: 'packages/geometry-stair/src/StairRailingStore.ts:51-64 (structuredClone + Object.assign)',
    note: 'Its own `restoreSnapshot` comment (:66-74) states "update() is a MERGE, and a merge cannot '
        + 'UNSET a field" — the only store in this table that documents its own semantics.',
  },
  stairlanding: {
    semantics: 'merge',
    store: 'StairLandingStore (@pryzm/geometry-stair)',
    evidence: 'packages/geometry-stair/src/StairLandingStore.ts:51-69 ({ ...existing, ...updates })',
    note: '`id` and `ifcData` are locked to the existing record (:58-59). ⚠ REACHABILITY: production '
        + 'never assigns `window.stairLandingStore` (measured 2026-08-18 — `new StairLandingStore()` at '
        + '`initBuilders.ts:937` is threaded through params only), and L-980 established the family has '
        + 'no undo traffic at all: NO handler anywhere declares `affectedStores: [\'stairLanding\']`, and '
        + 'nothing ever calls `StairLandingStore.add()` in production — landings live as '
        + '`StairData.landings` inside the stair record and `CreateStairCommand.createdLandingIds` is '
        + 'declared `= []` and never pushed to. The `stairLanding` map entry was therefore REMOVED '
        + '(performUndoRedo.ts, L-980) rather than wired. This declaration is kept because the class is '
        + 'real and source-measured, so it is ready if landings ever become elements; it is NOT a claim '
        + 'that anything routes through it today.',
  },
  handrail: {
    semantics: 'merge',
    store: 'HandrailStore (@pryzm/core-app-model/stores)',
    evidence: 'packages/core-app-model/src/stores/HandrailStore.ts:56-66 (structuredClone + Object.assign)',
  },
  beam: {
    semantics: 'merge',
    store: 'BeamStore (@pryzm/core-app-model/stores)',
    evidence: 'packages/core-app-model/src/stores/BeamStore.ts:98-110 ({ ...beam, ...updates })',
  },
  floor: {
    semantics: 'merge',
    store: 'FloorStore (@pryzm/core-app-model/stores)',
    evidence: 'packages/core-app-model/src/stores/FloorStore.ts:132-161 (structuredClone + Object.assign)',
    note: 'PRESENCE-KEYED — `levelId` is warned-and-deleted (:141-144) and `boundary` triggers a nested '
        + 'merge plus a CCW re-wind (:150-153).',
  },
  ceiling: {
    semantics: 'merge',
    store: 'CeilingStore (@pryzm/core-app-model/stores)',
    evidence: 'packages/core-app-model/src/stores/CeilingStore.ts:169-203 (structuredClone + Object.assign)',
    note: 'PRESENCE-KEYED — `levelId` and `holeElements` are warned-and-deleted (:181-190); `boundary` '
        + 'triggers polygon validation that can ABORT the whole update by returning undefined (:196-201).',
  },
  grid: {
    semantics: 'merge',
    store: 'GridStore (@pryzm/core-app-model)',
    evidence: 'packages/core-app-model/src/stores/GridStore.ts:69-96 (structuredClone + Object.assign)',
    note: 'PRESENCE-KEYED — on a PINNED grid every geometry key present in the argument is refused and '
        + 'dropped (:79-92). A full-record write would trip that on every field at once.',
  },
  lighting: {
    semantics: 'merge',
    store: 'LightingStore (@pryzm/geometry-lighting)',
    evidence: 'packages/geometry-lighting/src/LightingStore.ts:24-30 ({ ...existing, ...patch, id })',
    note: '`id` is re-attached last, so it cannot be overwritten; the result is frozen.',
  },
  annotation: {
    semantics: 'merge',
    store: 'AnnotationStore (@pryzm/plugin-annotations)',
    evidence: 'plugins/annotations/src/subsystem/AnnotationStore.ts:134-159 ({ ...existing, ...partial })',
    note: 'Two-arity: `update(id, patch)` and `update({id, ...patch})` both work; the adapter uses the '
        + 'former. Stamps `updatedAt` on every call and warns on an absent id (:148).',
  },

  // ── UNMEASURED, WITH THE REASON ────────────────────────────────────────────
  // These two keys USED TO exist in `buildUndoStoreMap()` (added for
  // §FEAT-SWIMMING-POOL-ELEMENT, L-292 / ADR-0124) but NO production code ever
  // assigns `window.poolStore` / `window.waterStore` — measured 2026-08-18. So
  // `adaptElementStoreMap` stored `undefined` for both, `_covered()` read them as
  // NOT covered, and a pool undo would have fallen through to commandManager.
  // There is no store to measure, and claiming a semantics we did not measure is
  // the exact defect L-977 is.
  //
  // ⚠ L-980 (2026-08-18) went one level further and found the FAMILY unreachable,
  // not merely the global unassigned: `new PoolStore()` / `new WaterStore()`
  // appear zero times repo-wide, and `PluginRegistry.ts` declares no `pool` /
  // `water` `storeKey`, so `pool.create` throws at `CommandBus.buildContext`
  // before mutating anything. The map entries were therefore REMOVED and the gap
  // DECLARED in `UNMAPPED_BUS_STORE_KEYS`. These two rows stay `unmeasured` — the
  // right answer for a store that does not exist — so that if the plugin is ever
  // wired, the write shape must be MEASURED at that point rather than assumed.
  //
  // ⭐ §POOL95 (L-11350, 2026-08-25) — THE PLUGIN WAS WIRED, so the instruction the
  // paragraph above left behind has been carried out. `PluginRegistry` now builds
  // both stores, both storeKeys are declared, and `PoolPlanToolHandler` dispatches
  // `pool.create`; the family is REACHABLE and the L-980 verdict above is dated
  // history, not current fact.
  //
  // ⛔ BOTH ROWS STAY `unmeasured`, AND THAT IS THE MEASURED ANSWER, NOT A DODGE.
  // This table exists to describe what `update(id, arg)` does with keys the caller
  // did NOT supply. ⭐ THE POOL NEVER CALLS `update(id, arg)`. Its coverage is
  // `poolUndoAdapter` (§POOL95), which calls `Store.applyPatch(patches)` — the very
  // method the bus itself calls on execute — so the inverse is applied by the store
  // in exactly the shape it applied the forward, and the merge-vs-replace hazard
  // this table guards against cannot arise. Declaring 'merge' or 'replace' here
  // would assert a semantics for a code path the family does not take, which is
  // L-977 in the other direction.
  //
  // ⚠ `boundaryLine`, `lift` and `liftPart` are the SAME NEW CLASS — plugin stores
  // adapted by `applyPatch`, not by `update()` — and they have NO rows at all, so
  // `LegacyStoreUpdateSemantics.measured.test.ts` reds on those three. That is
  // pre-existing (L-11160 and §LIFT94) and is NOT this lane's to fix while the lift
  // lane is live; it is reported rather than raced. The durable fix is a row KIND
  // for `applyPatch`-adapted plugin stores, so the table stops being asked a
  // question about a method they never call.
  pool: {
    semantics: 'unmeasured',
    store: 'PoolStore (plugins/pool/src/store.ts) — built by PluginRegistry, reached as runtime.stores.pool',
    evidence: 'apps/editor/src/PluginRegistry.ts (`buildStore: () => new PoolStore()`, storeKey `pool`); apps/editor/__tests__/poolUndoAdapter.test.ts ARM A',
    note: 'NOT adapted by update(id, arg): poolUndoAdapter calls Store.applyPatch, the same method the bus calls on execute, so merge-vs-replace does not arise (§POOL95, L-11350).',
  },
  water: {
    semantics: 'unmeasured',
    store: 'WaterStore (plugins/pool/src/store.ts) — built by PluginRegistry, reached as runtime.stores.water',
    evidence: 'apps/editor/src/PluginRegistry.ts (`buildStore: () => new WaterStore()`, storeKey `water`); apps/editor/__tests__/poolUndoAdapter.test.ts ARM B',
    note: 'Same route as pool — waterUndoAdapter calls Store.applyPatch and then redraws through the registered WaterMeshBuilder sink (§POOL95, L-11350).',
  },
};

/**
 * The declaration for a bus store key, or `undefined` when the key was never
 * measured. `undefined` is NOT a licence to guess — see the adapter's
 * `§L-977 UNDECLARED` branch, which reports it on every op.
 */
export function resolveLegacyStoreUpdateDeclaration(
  storeKey: string | undefined,
): LegacyStoreUpdateDeclaration | undefined {
  if (storeKey == null || storeKey.length === 0) return undefined;
  const decl = LEGACY_STORE_UPDATE_SEMANTICS[normaliseStoreKey(storeKey)];
  return decl?.semantics === 'unmeasured' ? undefined : decl;
}
