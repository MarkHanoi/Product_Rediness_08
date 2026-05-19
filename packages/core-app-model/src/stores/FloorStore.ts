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

type FloorStoreListener = (event: 'add' | 'update' | 'remove', floor: FloorData) => void;

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
    this._emit('update', merged);

    return structuredClone(merged) as FloorData;
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

  private _emit(event: 'add' | 'update' | 'remove', floor: FloorData): void {
    for (const listener of this._listeners) {
      try { listener(event, floor); } catch (e) {
        console.error('[FloorStore] Listener error:', e);
      }
    }
  }
}
