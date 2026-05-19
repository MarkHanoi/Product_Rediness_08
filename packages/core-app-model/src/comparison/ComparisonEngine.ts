/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Side System (read-only analytical observer)
 * File:             src/core/comparison/ComparisonEngine.ts
 * Contract:         01-BIM-ENGINE-CORE-CONTRACT §3.8 (StoreEventBus consumer) // TODO(TASK-08)
 *
 * Subscribes to the StoreEventBus and computes a live DeltaMap by comparing // TODO(TASK-08)
 * RequirementStore data (what is Required) against RoomStore / element store
 * data (what is Actual).
 *
 * CONTRACT RULES (non-negotiable):
 *   - READ ONLY — never calls commandManager.execute(), never mutates any store
 *   - Subscribes to StoreEventBus via the singleton pattern (not polling) // TODO(TASK-08)
 *   - Emits 'pryzm-delta-updated' CustomEvent on window after every recalc
 *   - DeltaMap is a readonly view — consumers must not mutate it
 *
 * The DeltaMap is the single source of truth for:
 *   1. DiagnosticMaterialManager — colours in Inspect (F2) lens shaders
 *   2. AuditStack (F2 RHS panel) — comparison grid rows
 *   3. AuditBucket (F3 Bucket 2) — global deviation grid
 */

import { storeEventBus, StoreChangeEvent } from '../StoreEventBus'; // TODO(TASK-08)
import { requirementStore } from '../requirements/RequirementStore';
import { RoomRequirement } from '../requirements/RequirementTypes';

// ── DeltaEntry ────────────────────────────────────────────────────────────────

export type DeltaStatus   = 'PASS' | 'WARN' | 'FAIL' | 'CODE' | 'MISSING';
export type DeltaSeverity = 'green' | 'amber' | 'red';
export type DeltaCategory =
  | 'spatial'
  | 'openings'
  | 'finishes'
  | 'systems'
  | 'physics'
  | 'assets'
  | 'safety';

export interface DeltaEntry {
  roomId:   string;
  metric:   string;
  required: number | string;
  actual:   number | string;
  delta:    number | string;
  status:   DeltaStatus;
  severity: DeltaSeverity;
  category: DeltaCategory;
}

/** Key = roomId. Value = all delta entries for that room. */
export type DeltaMap = ReadonlyMap<string, readonly DeltaEntry[]>;

// ── Internal mutable alias ────────────────────────────────────────────────────
type MutableDeltaMap = Map<string, DeltaEntry[]>;

// ── ComparisonEngine ──────────────────────────────────────────────────────────

export class ComparisonEngine {
  private _deltaMap: MutableDeltaMap = new Map();
  private _unsubscribe: (() => void) | null = null;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  start(): void {
    if (this._unsubscribe) return; // already running

    this._unsubscribe = storeEventBus.subscribe((event: StoreChangeEvent) => {
      this._onStoreChange(event);
    });

    // Also listen for requirement DOM events (window-level)
    window.addEventListener('pryzm-requirement-changed', this._onRequirementChanged);

    // Initial full recalc
    this._recalcAll();

    console.log('[ComparisonEngine] Started — subscribed to StoreEventBus'); // TODO(TASK-08)
  }

  stop(): void {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    window.removeEventListener('pryzm-requirement-changed', this._onRequirementChanged);
    console.log('[ComparisonEngine] Stopped');
  }

  // ── Public read API ────────────────────────────────────────────────────────

  getDeltaMap(): DeltaMap {
    return this._deltaMap as DeltaMap;
  }

  getDeltaForRoom(roomId: string): readonly DeltaEntry[] {
    return this._deltaMap.get(roomId) ?? [];
  }

  getRoomHealthScore(roomId: string): number {
    const entries = this._deltaMap.get(roomId);
    if (!entries || entries.length === 0) return 100;
    const passing = entries.filter(e => e.status === 'PASS').length;
    return Math.round((passing / entries.length) * 100);
  }

  getGlobalHealthScore(): number {
    const allEntries = Array.from(this._deltaMap.values()).flat();
    if (allEntries.length === 0) return 100;
    const passing = allEntries.filter(e => e.status === 'PASS').length;
    return Math.round((passing / allEntries.length) * 100);
  }

  getFailingRoomIds(): string[] {
    const failing: string[] = [];
    this._deltaMap.forEach((entries, roomId) => {
      if (entries.some(e => e.severity === 'red')) {
        failing.push(roomId);
      }
    });
    return failing;
  }

  // ── Internal event handlers ────────────────────────────────────────────────

  private _onStoreChange = (event: StoreChangeEvent): void => {
    const affectedTypes = ['RoomRequirement', 'room', 'wall', 'slab', 'furniture', 'plumbing'];
    if (!affectedTypes.includes(event.elementType)) return;

    if (event.elementType === 'RoomRequirement') {
      // Recalc just the room linked to this requirement
      const req = requirementStore.get(event.elementId);
      if (req) {
        this._recalcRoom(req.roomId);
      } else {
        // Deleted requirement — roomId unknown, do full recalc
        this._recalcAll();
      }
    } else {
      // Geometry/element change — recalc all rooms that may be affected
      this._recalcAll();
    }

    this._emit();
  };

  private _onRequirementChanged = (_e: Event): void => {
    this._recalcAll();
    this._emit();
  };

  // ── Core recalculation ─────────────────────────────────────────────────────

  private _recalcAll(): void {
    this._deltaMap.clear();
    const requirements = requirementStore.getAll();
    for (const req of requirements) {
      this._recalcRoom(req.roomId);
    }
  }

  private _recalcRoom(roomId: string): void {
    const requirements = requirementStore.getByRoomId(roomId);
    if (requirements.length === 0) {
      this._deltaMap.delete(roomId);
      return;
    }

    const entries: DeltaEntry[] = [];

    for (const req of requirements) {
      // Read actual values from the live model
      const actual = this._readActualValues(roomId, req);
      const roomEntries = this._computeDelta(req, actual);
      entries.push(...roomEntries);
    }

    this._deltaMap.set(roomId, entries);
  }

  // ── Actual value reader ────────────────────────────────────────────────────
  // Reads from live window globals (BimManager, RoomStore, ElementRegistry)
  // without importing them (avoids circular deps and stays read-only).

  private _readActualValues(roomId: string, _req: RoomRequirement): ActualValues {
    const defaults: ActualValues = {
      area_m2:          0,
      clearHeight_mm:   0,
      floorFinish:      'UNKNOWN',
      wallFinish:       'UNKNOWN',
      ceilingType:      'UNKNOWN',
      stc_db:           0,
      lux_task:         0,
      ach:              0,
      presentAssets:    [],
      powerSockets:     0,
      dataPorts:        0,
      plumbingFixtures: 0,
      maxEgressDist_m:  0,
      turningCircle_mm: 0,
      sprinklerCount:   0,
    };

    try {
      // Try to read from RoomStore (registered at window.roomStore)
      const roomStore = window.roomStore; // TODO(TASK-08)
      if (roomStore) {
        const room = roomStore.getById?.(roomId) ?? roomStore.get?.(roomId);
        if (room) {
          if (room.computed?.area !== undefined) {
            defaults.area_m2 = Number(room.computed.area.toFixed(2));
          }
          if (room.boundary?.height !== undefined) {
            defaults.clearHeight_mm = Math.round(room.boundary.height * 1000);
          }
          if (room.finishes?.floor?.materialName) {
            defaults.floorFinish = room.finishes.floor.materialName;
          }
          if (room.finishes?.walls?.materialName) {
            defaults.wallFinish = room.finishes.walls.materialName;
          }
          if (room.finishes?.ceiling?.materialName) {
            defaults.ceilingType = room.finishes.ceiling.materialName;
          }
          if (room.properties?.acousticRating !== undefined) {
            defaults.stc_db = room.properties.acousticRating;
          }
          if (room.properties?.lightingLux !== undefined) {
            defaults.lux_task = room.properties.lightingLux;
          }
        }
      }

      // Try to read furniture/plumbing counts from their stores
      const furnitureStore = window.furnitureStore; // TODO(TASK-08)
      if (furnitureStore) {
        const allFurniture = furnitureStore.getAll?.() ?? [];
        const roomFurniture = allFurniture.filter((f: any) => f.roomId === roomId || f.levelId === _req.levelId);
        defaults.presentAssets = roomFurniture.map((f: any) => f.furnitureType ?? f.id);
      }

      const plumbingStore = window.plumbingStore; // TODO(TASK-08)
      if (plumbingStore) {
        const allPlumbing = plumbingStore.getAll?.() ?? [];
        defaults.plumbingFixtures = allPlumbing.filter((p: any) => p.roomId === roomId).length;
      }

    } catch (err) {
      // Non-fatal — ComparisonEngine never throws, just returns defaults
      console.warn('[ComparisonEngine] Failed to read actual values for room', roomId, err);
    }

    return defaults;
  }

  // ── Delta computation ──────────────────────────────────────────────────────

  private _computeDelta(req: RoomRequirement, actual: ActualValues): DeltaEntry[] {
    const entries: DeltaEntry[] = [];
    const { parameters: p, roomId } = req;

    // ── Spatial ────────────────────────────────────────────────────────────

    entries.push(
      computeNumericDelta(
        roomId, 'Area (m²)', 'spatial',
        p.spatial.targetArea_m2,
        actual.area_m2,
        p.spatial.areaTolerance_pct / 100,
      )
    );

    entries.push(
      computeNumericDelta(
        roomId, 'Clear Height (mm)', 'spatial',
        p.spatial.clearHeight_mm,
        actual.clearHeight_mm,
        0.05, // 5% tolerance on height
      )
    );

    // ── Physics ────────────────────────────────────────────────────────────

    entries.push(
      computeNumericDelta(
        roomId, 'STC (dB)', 'physics',
        p.physics.stc_db,
        actual.stc_db,
        0, // no tolerance — exact match or FAIL
      )
    );

    entries.push(
      computeNumericDelta(
        roomId, 'Lux (Task)', 'physics',
        p.physics.lux_task,
        actual.lux_task,
        0.1, // 10% tolerance
      )
    );

    entries.push(
      computeNumericDelta(
        roomId, 'ACH', 'physics',
        p.physics.ach,
        actual.ach,
        0.1,
      )
    );

    // ── Finishes ───────────────────────────────────────────────────────────

    entries.push(
      computeStringDelta(roomId, 'Floor Finish', 'finishes', p.finishes.floorFinish, actual.floorFinish)
    );
    entries.push(
      computeStringDelta(roomId, 'Wall Finish', 'finishes', p.finishes.wallFinish, actual.wallFinish)
    );
    entries.push(
      computeStringDelta(roomId, 'Ceiling Type', 'finishes', p.finishes.ceilingType, actual.ceilingType)
    );

    // ── Assets ─────────────────────────────────────────────────────────────

    for (const requiredAsset of p.assets.requiredAssets) {
      const present = actual.presentAssets.some(a =>
        a.toLowerCase().includes(requiredAsset.toLowerCase())
      );
      entries.push({
        roomId,
        metric:   `Equipment: ${requiredAsset}`,
        required: requiredAsset,
        actual:   present ? requiredAsset : 'ABSENT',
        delta:    present ? 'MATCH' : 'MISSING',
        status:   present ? 'PASS' : 'FAIL',
        severity: present ? 'green' : 'red',
        category: 'assets',
      });
    }

    entries.push(
      computeNumericDelta(
        roomId, 'Power Sockets', 'assets',
        p.assets.powerSockets, actual.powerSockets, 0,
      )
    );

    entries.push(
      computeNumericDelta(
        roomId, 'Plumbing Fixtures', 'assets',
        p.assets.plumbingFixtures, actual.plumbingFixtures, 0,
      )
    );

    // ── Safety ─────────────────────────────────────────────────────────────

    entries.push(
      computeNumericDelta(
        roomId, 'Sprinkler Count', 'safety',
        p.safety.sprinklerCount, actual.sprinklerCount, 0,
      )
    );

    return entries;
  }

  // ── Emit ───────────────────────────────────────────────────────────────────

  private _emit(): void {
    // F.events.6 — migrated from DOM CustomEvent to runtime.events typed bus.
    // Uses (window as any) bridge because packages/ cannot import from apps/.
    (window as any).runtime?.events?.emit('pryzm-delta-updated', { deltaMap: this._deltaMap });
  }
}

// ── Utility computations ──────────────────────────────────────────────────────

function computeNumericDelta(
  roomId: string,
  metric: string,
  category: DeltaCategory,
  required: number,
  actual: number,
  toleranceFraction: number,
): DeltaEntry {
  if (actual === 0 && required > 0) {
    return {
      roomId, metric, category,
      required, actual,
      delta:    'MISSING',
      status:   'FAIL',
      severity: 'red',
    };
  }

  const delta = actual - required;
  const pct   = required !== 0 ? Math.abs(delta) / required : 0;

  let status:   DeltaStatus;
  let severity: DeltaSeverity;

  if (pct <= toleranceFraction) {
    status   = 'PASS';
    severity = 'green';
  } else if (pct <= toleranceFraction * 2) {
    status   = 'WARN';
    severity = 'amber';
  } else {
    status   = 'FAIL';
    severity = 'red';
  }

  return {
    roomId, metric, category,
    required,
    actual,
    delta: Number(delta.toFixed(2)),
    status,
    severity,
  };
}

function computeStringDelta(
  roomId: string,
  metric: string,
  category: DeltaCategory,
  required: string,
  actual: string,
): DeltaEntry {
  const match = actual.toLowerCase() === required.toLowerCase();
  return {
    roomId, metric, category,
    required,
    actual:   actual === 'UNKNOWN' ? 'Not specified' : actual,
    delta:    match ? 'MATCH' : 'MISMATCH',
    status:   match ? 'PASS' : actual === 'UNKNOWN' ? 'WARN' : 'FAIL',
    severity: match ? 'green' : actual === 'UNKNOWN' ? 'amber' : 'red',
  };
}

// ── ActualValues helper type ──────────────────────────────────────────────────

interface ActualValues {
  area_m2:          number;
  clearHeight_mm:   number;
  floorFinish:      string;
  wallFinish:       string;
  ceilingType:      string;
  stc_db:           number;
  lux_task:         number;
  ach:              number;
  presentAssets:    string[];
  powerSockets:     number;
  dataPorts:        number;
  plumbingFixtures: number;
  maxEgressDist_m:  number;
  turningCircle_mm: number;
  sprinklerCount:   number;
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const comparisonEngine = new ComparisonEngine();
