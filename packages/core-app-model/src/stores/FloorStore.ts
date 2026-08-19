/**
 * FloorStore — Single source of truth for all FloorData records.
 *
 * Contract: docs/01_ELEMENTS/08_Floors_Contract/01-FLOOR-DATA-MODEL-CONTRACT.md §3
 *
 * Rules:
 * - All records are deep-frozen after storage.
 * - getById() returns deep clones — callers may freely mutate returned objects.
 * - Emits both DOM events ('bim-floor-*') for EngineBootstrap and storeEventBus.
 * - Does NOT call bimManager or elementRegistry — that is the command layer's job.
 * - Does NOT auto-mutate on level removal — that is handled externally.
 */

import { FloorData, FloorServiceHole } from './FloorTypes';
import { validateFloorData } from './FloorDataSchema';
import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)
import { ensureCCW, computeArea } from './FloorPolygonUtils';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

function freezeFloorData(floor: FloorData): FloorData {
  if (floor.boundary) {
    if (floor.boundary.polygon) {
      floor.boundary.polygon.forEach(p => Object.freeze(p));
      Object.freeze(floor.boundary.polygon);
    }
    Object.freeze(floor.boundary);
  }
  if (floor.layers) {
    floor.layers.forEach(l => Object.freeze(l));
    Object.freeze(floor.layers);
  }
  if (floor.serviceHoles) {
    floor.serviceHoles.forEach(h => Object.freeze(h));
    Object.freeze(floor.serviceHoles);
  }
  if (floor.coveredRoomIds) Object.freeze(floor.coveredRoomIds);
  if (floor.boundingWallIds) Object.freeze(floor.boundingWallIds);
  if (floor.finishSpec) Object.freeze(floor.finishSpec);
  if (floor.slope) Object.freeze(floor.slope);
  if (floor.underfloorHeating) Object.freeze(floor.underfloorHeating);
  if (floor.properties) Object.freeze(floor.properties);
  if (floor.ifcData) Object.freeze(floor.ifcData);
  if (floor.metadata) Object.freeze(floor.metadata);
  return Object.freeze(floor) as FloorData;
}

// §STEP7 (C72 §3.1, gap PR-03): 'update' emissions carry the frozen
// PRE-MUTATION floor as an optional third argument, captured before the merge —
// never re-read after the write (C72 §3.5). Absent on 'add'/'remove'.
type FloorStoreListener = (event: 'add' | 'update' | 'remove', floor: FloorData, prevState?: FloorData) => void;

export class FloorStore {
  private _floors = new Map<string, FloorData>();
  private _serviceHoleIndex = new Map<string, string>(); // holeId → floorId
  private _listeners: FloorStoreListener[] = [];
  private _floorCounter = 0;

  // ── Write API ─────────────────────────────────────────────────────────────

  add(floor: FloorData): void {
    const clone = structuredClone(floor) as FloorData;

    // Auto-assign label and floor number if missing
    if (!clone.label) {
      this._floorCounter++;
      clone.label = `Floor-${String(this._floorCounter).padStart(2, '0')}`;
    }
    if (!clone.floorNumber) {
      clone.floorNumber = `F.${String(this._floorCounter).padStart(2, '0')}`;
    }

    // Enforce CCW winding
    clone.boundary.polygon = ensureCCW(clone.boundary.polygon);

    // Layer thickness coherence
    if (clone.layers && clone.layers.length > 0) {
      const layerSum = clone.layers.reduce((s, l) => s + l.thickness, 0);
      const delta = Math.abs(layerSum - clone.boundary.thickness);
      if (delta > 0.0001) {
        console.warn(
          `[FloorStore] Floor "${clone.id}" layer thickness sum (${layerSum.toFixed(4)}) ` +
          `differs from boundary.thickness (${clone.boundary.thickness.toFixed(4)}). Auto-correcting.`
        );
        clone.boundary.thickness = layerSum;
      }
    }

    // Ensure defaults
    if (!clone.finishSpec) {
      clone.finishSpec = {
        finishColor: '#D4C4A8',
        finishPattern: 'none',
        exposedScreed: false,
      };
    }
    if (!clone.serviceHoles) clone.serviceHoles = [];
    if (!clone.coveredRoomIds) clone.coveredRoomIds = [];
    if (!clone.boundingWallIds) clone.boundingWallIds = [];
    if (clone.visible === undefined) clone.visible = true;
    if (!clone.properties) clone.properties = {};
    if (!clone.metadata) {
      clone.metadata = {
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        createdBy: 'system',
        version: 1,
      };
    }

    // Runtime validation (in dev mode — catches schema violations early)
    try {
      validateFloorData(clone);
    } catch (err) {
      console.warn('[FloorStore] Floor data validation warning:', err);
    }

    // Re-populate service hole index
    for (const hole of clone.serviceHoles) {
      this._serviceHoleIndex.set(hole.id, clone.id);
      this._serviceHoleIndex.set(hole.elementId, clone.id);
    }

    freezeFloorData(clone);
    this._floors.set(clone.id, clone);

    _bus.emit('bim-floor-added', { id: clone.id }); // F.events.17
    storeEventBus.emit({ elementId: clone.id, elementType: 'floor', operation: 'create', timestamp: Date.now() });
    this._emit('add', clone);
  }

  update(
    floorId: string,
    updates: Partial<FloorData>,
    preserveMetadata = false
  ): FloorData | undefined {
    const existing = this._floors.get(floorId);
    if (!existing) return undefined;

    // levelId is immutable after creation
    if (updates.levelId && updates.levelId !== existing.levelId) {
      console.warn(`[FloorStore] Attempt to change levelId on floor "${floorId}" — ignored.`);
      delete (updates as any).levelId;
    }

    const merged = structuredClone(existing) as FloorData;
    Object.assign(merged, updates);

    // Preserve nested boundary correctly
    if (updates.boundary) {
      merged.boundary = { ...structuredClone(existing.boundary), ...updates.boundary };
      merged.boundary.polygon = ensureCCW(merged.boundary.polygon);
    }

    if (!preserveMetadata) {
      merged.metadata = {
        ...merged.metadata,
        modifiedAt: Date.now(),
        version: (merged.metadata.version ?? 0) + 1,
      };
    }

    // Layer coherence check
    if (merged.layers && merged.layers.length > 0) {
      const layerSum = merged.layers.reduce((s, l) => s + l.thickness, 0);
      if (Math.abs(layerSum - merged.boundary.thickness) > 0.0001) {
        merged.boundary.thickness = layerSum;
      }
    }

    // Rebuild service hole index for any changed holes
    const oldHoles = existing.serviceHoles || [];
    for (const h of oldHoles) {
      this._serviceHoleIndex.delete(h.id);
      this._serviceHoleIndex.delete(h.elementId);
    }
    for (const h of (merged.serviceHoles || [])) {
      this._serviceHoleIndex.set(h.id, merged.id);
      this._serviceHoleIndex.set(h.elementId, merged.id);
    }

    freezeFloorData(merged);
    this._floors.set(floorId, merged);

    _bus.emit('bim-floor-updated', { id: merged.id }); // F.events.17
    storeEventBus.emit({ elementId: merged.id, elementType: 'floor', operation: 'update', timestamp: Date.now() });
    // §STEP7: `existing` is the frozen pre-mutation record, captured before the merge.
    this._emit('update', merged, existing);

    return structuredClone(merged) as FloorData;
  }

  /**
   * §L-1032 — MOVE a floor finish to a different storey.
   *
   * ─── WHY THIS IS A NAMED OPERATION AND NOT `update(id, {levelId})` ────────
   * Because for THIS store `update(id, {levelId})` is a measured NO-OP.
   * `update()` above warns and DELETES the key before the merge:
   *
   *     if (updates.levelId && updates.levelId !== existing.levelId) {
   *       console.warn(`[FloorStore] Attempt to change levelId on floor "${floorId}" — ignored.`);
   *       delete (updates as any).levelId;
   *     }                                            // FloorStore.ts:141-144
   *
   * `apps/editor/src/engine/undo/legacyStoreUpdateSemantics.ts` records exactly
   * that — `floor: { semantics: 'merge', … note: 'PRESENCE-KEYED — levelId is
   * warned-and-deleted (:141-144)' }` — and it is re-derived from the real class
   * by `LegacyStoreUpdateSemantics.measured.test.ts`, not transcribed. A caller
   * doing `update(id, {levelId})` gets a successful `FloorData` back, a bumped
   * `version` and an 'update' fan-out, while the floor never moves: success
   * reported over a change that did not happen (C03 §4.6 U-4).
   *
   * ⚠ THE GUARD IN `update()` IS CORRECT AND MUST STAY. It exists so a GENERIC
   * patch — an undo field write, a property-panel merge, an IFC round trip, or
   * `restoreSnapshot()`, which routes a WHOLE record through `update()` (`:199`)
   * — cannot re-storey a floor by accident. This method does not weaken it; it
   * writes the map entry itself, which is what makes "move" an explicit, named,
   * auditable gesture rather than a side effect of some other edit.
   *
   * The second reason is the undo leg: `elementUndoStoreAdapter`'s §L-946 arm
   * tests `typeof store.changeLevel === 'function'` before routing a `levelId`
   * inverse patch. Without this method Ctrl+Z after a storey move falls through
   * to the generic `update()` — which, per the guard above, silently declines to
   * revert, leaving the plugin store on the old storey and the geometry record
   * on the new one. That is the two-copy divergence L-946 closed, re-opened by
   * Ctrl+Z and pointing the other way.
   *
   * Symmetric with `SlabStore.changeLevel`
   * (`packages/geometry-slab/src/SlabStore.ts:314`) and `RoofStore.changeLevel`
   * (`packages/geometry-roof/src/RoofStore.ts:153`).
   *
   * ─── WHY ONE 'update' AND NOT 'remove' + 'add' ───────────────────────────
   * `add()` auto-assigns `label` and `floorNumber` from `this._floorCounter`
   * (`:65-71`), so a remove+add round trip would RENUMBER the floor and hand it
   * a new label the schedules already reference. A move is not a delete. One
   * 'update' is everything the renderer needs: `FloorFragmentBuilder` re-derives
   * `FFL = level.elevation + boundary.baseOffset` on every update.
   *
   * ─── WHAT THIS DOES NOT DO ───────────────────────────────────────────────
   * Spatial-authority registration (bimManager `level.childrenIds`, the
   * view-dependency element→level map) is NOT updated here — identical to the
   * contract `SlabStore.changeLevel` and `RoofStore.changeLevel` both state in
   * their own doc comments. `apps/editor/src/engine/elementLevelChangedMirror.ts`
   * owns that half for EVERY family, so the ordering rule (move the record
   * FIRST, re-register SECOND, dirty BOTH storeys THIRD) lives in one place
   * rather than in thirteen stores.
   *
   * `hostSlabId` is NOT cleared here. A floor finish bound to a slab on the old
   * storey is now bound across storeys, which is a CONSTRAINT question
   * (`FloorSlabBindingHandler` owns the re-seat) and not a store one; silently
   * dropping the binding would destroy authored data to make a move look tidy.
   *
   * `_serviceHoleIndex` is untouched on purpose: it maps holeId → floorId, and
   * neither id changes when the storey does.
   *
   * Returns the moved record, or `undefined` when there is nothing to move —
   * failure and emptiness must not be the same value (§context-data-honesty).
   */
  changeLevel(floorId: string, newLevelId: string): FloorData | undefined {
    const existing = this._floors.get(floorId);
    if (!existing) return undefined;
    // An empty destination is REFUSED, never defaulted to the active level —
    // the §DIAG-WALL-LEVEL trap that files elements on the ground floor.
    if (!newLevelId) return undefined;
    // Already there: hand back a clone, matching this store's read convention
    // (`getById` clones — `:259-263`), and emit NOTHING. A no-op that fans out
    // would dirty two storeys for a move that did not happen.
    if (existing.levelId === newLevelId) return structuredClone(existing) as FloorData;

    const moved = structuredClone(existing) as FloorData;
    moved.levelId = newLevelId;
    // A floor parented to something ELSE than its storey keeps that parent.
    if (existing.parentId === existing.levelId) moved.parentId = newLevelId;
    // `FloorData extends CoreElement`, whose `spatialRelationship` MIRRORS
    // BimManager's `Level.childrenIds` contract (`CoreElement.ts:46-52`) and is
    // what IFC export reads for storey containment. Only rewritten when already
    // PRESENT: minting one would invent a containment the record never asserted.
    if (moved.spatialRelationship) {
      moved.spatialRelationship = { ...moved.spatialRelationship, levelId: newLevelId };
    }
    // Same metadata stamp `update()` applies (`:155-161`) — a storey move is a
    // real modification and must advance the audit trail like any other.
    moved.metadata = {
      ...moved.metadata,
      modifiedAt: Date.now(),
      version: (moved.metadata.version ?? 0) + 1,
    };

    freezeFloorData(moved);
    this._floors.set(floorId, moved);

    _bus.emit('bim-floor-updated', { id: moved.id }); // F.events.17
    storeEventBus.emit({ elementId: moved.id, elementType: 'floor', operation: 'update', timestamp: Date.now() });
    // §STEP7: `existing` is the frozen pre-mutation record, captured before the
    // clone, so diff-based subscribers can dirty the storey being VACATED.
    this._emit('update', moved, existing);

    return structuredClone(moved) as FloorData;
  }

  /**
   * Undo-safe restoration — uses preserveMetadata=true to avoid corrupting
   * the audit trail version counter and modifiedAt timestamp.
   */
  restoreSnapshot(snapshot: FloorData): void {
    if (this._floors.has(snapshot.id)) {
      this.update(snapshot.id, snapshot, true);
    } else {
      this.add(snapshot);
    }
  }

  /**
   * Contract 45 — wipe ALL floors. Notifies subscribers per-floor BEFORE
   * the map is cleared, so renderer / spatial index dispose resources
   * exactly as they would on a single user-initiated remove.
   */
  clear(): void {
    const ids = [...this._floors.keys()];
    for (const id of ids) {
      this.remove(id);
    }
    this._floors.clear();
    this._serviceHoleIndex.clear();
  }

  remove(floorId: string): FloorData | undefined {
    const floor = this._floors.get(floorId);
    if (!floor) return undefined;

    // Clean up service hole index
    for (const hole of floor.serviceHoles || []) {
      this._serviceHoleIndex.delete(hole.id);
      this._serviceHoleIndex.delete(hole.elementId);
    }

    this._floors.delete(floorId);
    const clone = structuredClone(floor) as FloorData;

    _bus.emit('bim-floor-removed', { id: floorId }); // F.events.17
    storeEventBus.emit({ elementId: floorId, elementType: 'floor', operation: 'delete', timestamp: Date.now() });
    this._emit('remove', clone);

    return clone;
  }

  // ── Service hole API ──────────────────────────────────────────────────────

  addServiceHole(floorId: string, hole: FloorServiceHole): FloorData | undefined {
    const floor = this._floors.get(floorId);
    if (!floor) return undefined;
    const clone = structuredClone(floor) as FloorData;
    clone.serviceHoles = [...clone.serviceHoles, { ...hole }];
    return this.update(floorId, clone);
  }

  removeServiceHole(floorId: string, holeId: string): FloorData | undefined {
    const floor = this._floors.get(floorId);
    if (!floor) return undefined;
    const clone = structuredClone(floor) as FloorData;
    clone.serviceHoles = clone.serviceHoles.filter(h => h.id !== holeId);
    return this.update(floorId, clone);
  }

  // ── Read API ──────────────────────────────────────────────────────────────

  getById(floorId: string): FloorData | undefined {
    const floor = this._floors.get(floorId);
    if (!floor) return undefined;
    return structuredClone(floor) as FloorData;
  }

  getAll(): FloorData[] {
    return Array.from(this._floors.values()).map(f => structuredClone(f) as FloorData);
  }

  getByLevel(levelId: string): FloorData[] {
    return this.getAll().filter(f => f.levelId === levelId);
  }

  getByHostSlab(slabId: string): FloorData[] {
    return this.getAll().filter(f => f.hostSlabId === slabId);
  }

  has(floorId: string): boolean {
    return this._floors.has(floorId);
  }

  computeArea(floorId: string): number {
    const floor = this._floors.get(floorId);
    if (!floor) return 0;
    return computeArea(floor.boundary.polygon);
  }

  /** Auto-generate next label (e.g. "Floor-03"). */
  generateNextLabel(): string {
    this._floorCounter++;
    return `Floor-${String(this._floorCounter).padStart(2, '0')}`;
  }

  // ── Subscription API ──────────────────────────────────────────────────────

  subscribe(listener: FloorStoreListener): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter(l => l !== listener);
    };
  }

  private _emit(event: 'add' | 'update' | 'remove', floor: FloorData, prevState?: FloorData): void {
    for (const listener of this._listeners) {
      try { listener(event, floor, prevState); } catch (e) {
        console.error('[FloorStore] Listener error:', e);
      }
    }
  }
}
