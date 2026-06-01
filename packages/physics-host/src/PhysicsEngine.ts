/**
 * MIGRATION NOTE (S92-WIRE, 2026-05-01):
 *   Moved from `src/physics/PhysicsEngine.ts` → `src/engine/subsystems/physics/PhysicsEngine.ts`
 *   Reason: Intra-src consolidation: L6.5 physics engine → engine subsystems
 *   Per `02-ARCHITECTURE.md §8` convergence boolean row 1 (`legacy_src_folders == 1`).
 *   Package promotion deferred to Wave 11 (`15-PACKAGE-POPULATION-GAP.md §3`).
 */
// D.4.3 POINTER HEADER ────────────────────────────────────────────────────────
//
// The typed CONTRACT + OTel span for this module now lives at:
//   `packages/physics-host/src/bootstrap.ts` — `bootstrapPhysics()` /
//   `bootstrapPhysicsIdle()`, span `pryzm.bootstrap.physics`.
//
// The FRAME-SUBSCRIPTION adapter (replaces rAF — P3) now lives at:
//   `packages/physics-host/src/Stepper.ts` — `PhysicsStepper`.
//
// This file (the 356 LOC RAF-batched room-physics queue) is the BODY that
// D.4.3's typed contract wraps.  Its relocation into L3 is gated on L7
// dep factoring: `ConstraintEngine`, `SemanticGraph`, `DecisionRecordStore`,
// `PhysicsPanel`, and `PhysicsOverlayRenderer` cannot move into
// `@pryzm/physics-host` without inverting the layer rule.  Relocation is
// Wave 4 work.  See `docs/archive/pryzm3-internal/04-PLAN-FORWARD/03-WAVE-2-3-D4-EXECUTION.md §2`.
//
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Physics — PhysicsEngine Service (NEW FILE)
 * Phase:             Phase H — H-1 (Multi-Physics Foundation)
 * Files Modified:    src/physics/PhysicsEngine.ts (new)
 * Classification:    A
 *
 * Contract:
 *   docs/00_PRZYM/PRYZM_WORLD_MODEL_MASTER_PLAN_2026.md § H-1
 *
 * Architecture notes:
 *   - Reads stores via `window.roomStore` / `windowStore` (same pattern // TODO(TASK-08)
 *     as WorldModelAdapter — safe for the client layer).
 *   - RAF-batched queue: rooms are enqueued on `pryzm-physics-enqueue` or via
 *     `enqueueRoom(id)`. Up to 5 rooms are processed per animation frame.
 *   - Results cached in `physicsResultCache` and emitted as
 *     `pryzm-physics-updated` CustomEvents on window.
 *   - Writes `measuredAt` relationships to `semanticGraphManager`.
 *   - Never throws outside catch blocks. All sections degrade gracefully.
 *   - No third-party physics libraries — all maths is plain TypeScript.
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();
import type {
    ThermalResult, ThermalClass,
    AcousticResult, AcousticClass,
    DaylightResult, DaylightClass,
    RoomPhysicsResult,
    PhysicsResultCache,
} from './PhysicsTypes.js';

// ── NRC (Normal Incidence Sound Absorption Coefficient) lookup ────────────────

/** Keyword → NRC value. Matched against RoomFinishSpec.materialName (lowercase). */
const NRC_KEYWORDS: Array<[string, number]> = [
    ['acoustic tile',  0.70],
    ['acoustic panel', 0.70],
    ['carpet',         0.35],
    ['timber',         0.15],
    ['wood',           0.15],
    ['plasterboard',   0.05],
    ['plaster',        0.03],
    ['glass',          0.05],
    ['concrete',       0.02],
    ['brick',          0.03],
    ['stone',          0.02],
    ['vinyl',          0.03],
    ['tile',           0.02],
    ['metal',          0.02],
];

function nrcFromName(name: string | undefined): number {
    if (!name) return 0.05; // generic default
    const lc = name.toLowerCase();
    for (const [kw, nrc] of NRC_KEYWORDS) {
        if (lc.includes(kw)) return nrc;
    }
    return 0.05;
}

// ── Default glazing ratios by occupancy type ──────────────────────────────────

const DEFAULT_GLAZING_RATIO: Record<string, number> = {
    'bedroom':              0.12,
    'living-room':          0.25,
    'kitchen':              0.15,
    'bathroom':             0.05,
    'dining-room':          0.20,
    'open-office':          0.35,
    'private-office':       0.30,
    'meeting-room':         0.25,
    'patient-room':         0.20,
    'operating-theatre':    0.05,
    'waiting-room':         0.25,
    'consultation-room':    0.20,
    'classroom':            0.30,
    'lecture-hall':         0.25,
    'retail-floor':         0.35,
    'corridor':             0.08,
    'toilet':               0.03,
    'wc':                   0.03,
    'plant-room':           0.02,
    'server-room':          0.01,
    'storage-residential':  0.05,
    'stockroom':            0.05,
    'garage':               0.05,
};

function defaultGlazingRatio(occupancyType: string): number {
    return DEFAULT_GLAZING_RATIO[occupancyType] ?? 0.15;
}

// ── Habitable room occupancy types (for daylight compliance) ──────────────────

const HABITABLE_TYPES = new Set([
    'bedroom', 'living-room', 'kitchen', 'dining-room',
    'open-office', 'private-office', 'meeting-room', 'classroom',
    'patient-room', 'consultation-room', 'waiting-room', 'lecture-hall',
    'breakout', 'reception',
]);

// ── Solar gain factors by glazing ratio ───────────────────────────────────────

/** Base thermal load W/m² for an unglazed room (internal gains only). */
const THERMAL_BASE_WM2 = 10;
/** Peak solar flux W/m² through double-glazing on south façade. */
const SOLAR_PEAK_WM2   = 450;
/** Double-glazing solar heat gain coefficient (SHGC). */
const SHGC             = 0.62;
/** Default glazing g-value reduction for shading / orientation average. */
const ORIENTATION_FACTOR = 0.55;

function thermalClass(load: number): ThermalClass {
    if (load < 10)  return 'cold';
    if (load < 22)  return 'cool';
    if (load < 32)  return 'comfortable';
    if (load < 45)  return 'warm';
    return 'hot';
}

// ── Acoustic quality thresholds ───────────────────────────────────────────────

function acousticClass(rt60: number, occupancy: string): AcousticClass {
    const isHospital  = occupancy === 'patient-room' || occupancy === 'operating-theatre' || occupancy === 'consultation-room';
    const isSchool    = occupancy === 'classroom' || occupancy === 'lecture-hall';

    if (isHospital) {
        if (rt60 < 0.4)  return 'excellent';
        if (rt60 < 0.5)  return 'good';
        if (rt60 < 0.7)  return 'acceptable';
        if (rt60 < 1.0)  return 'poor';
        return 'reverberant';
    }
    if (isSchool) {
        if (rt60 < 0.5)  return 'excellent';
        if (rt60 < 0.8)  return 'good';
        if (rt60 < 1.0)  return 'acceptable';
        if (rt60 < 1.5)  return 'poor';
        return 'reverberant';
    }
    // General
    if (rt60 < 0.5)  return 'excellent';
    if (rt60 < 1.0)  return 'good';
    if (rt60 < 1.5)  return 'acceptable';
    if (rt60 < 2.5)  return 'poor';
    return 'reverberant';
}

// ── Daylight class ────────────────────────────────────────────────────────────

function daylightClass(df: number): DaylightClass {
    if (df >= 5)  return 'excellent';
    if (df >= 2)  return 'good';
    if (df >= 1)  return 'marginal';
    return 'poor';
}

// ── PhysicsEngine ─────────────────────────────────────────────────────────────

const BATCH_SIZE = 5;

export class PhysicsEngine {
    readonly cache: PhysicsResultCache = new Map();
    private _queue: Set<string>  = new Set();
    private _running = false;

    /** Start the RAF processing loop. Called by initDataPlatform. */
    init(): void {
        if (this._running) return;
        this._running = true;
        // D.7.5 batch #5: per-tick body driven by FrameScheduler (pre-render
        // priority — physics computation runs before the renderer reads room
        // state in the same frame). The rAF reschedule inside _loop() is now
        // owned by the scheduler. Disposer is intentionally discarded to
        // preserve the pre-existing fire-and-forget semantics — the original
        // implementation had no stop()/destroy() path either, so the loop
        // continues for the lifetime of the page (matches the legacy contract).
        // When a future stop()/destroy() is introduced, capture the disposer
        // into a private field and invoke it there.
        getFrameScheduler().addTickListener(
            'physics-engine-loop',
            () => this._loop(),
            'pre-render',
        );
        console.log('[PhysicsEngine] Initialised — FrameScheduler-batched queue active');
    }

    /** Enqueue a room for physics computation. Safe to call multiple times. */
    enqueueRoom(roomId: string): void {
        this._queue.add(roomId);
    }

    /** Enqueue all rooms in the current project. */
    enqueueAll(): void {
        const rs = window.roomStore; // TODO(TASK-08)
        if (!rs?.getAll) return;
        const rooms = rs.getAll() as any[];
        rooms.forEach(r => this._queue.add(r.id));
    }

    /** Compute physics for a single room synchronously and return result. */
    compute(roomId: string): RoomPhysicsResult | null {
        try {
            const rs   = window.roomStore; // TODO(TASK-08)
            const room = rs?.getById?.(roomId);
            if (!room) return null;
            const result = this._computeRoom(room);
            this.cache.set(roomId, result);
            this._writeSemanticEdge(roomId, result);
            return result;
        } catch (e) {
            console.error('[PhysicsEngine] compute() error:', e);
            return null;
        }
    }

    // ── Private ──────────────────────────────────────────────────────────────

    private _loop(): void {
        if (this._queue.size > 0) {
            const batch = [...this._queue].slice(0, BATCH_SIZE);
            batch.forEach(id => {
                this._queue.delete(id);
                const result = this.compute(id);
                if (result) {
                    _bus.emit('pryzm-physics-updated', { roomId: id, result }); // F.events.18
                }
            });
        }
        // D.7.5 batch #5: rAF reschedule removed — FrameScheduler re-invokes
        // this body every tick via the disposer registered in init().
    }

    private _computeRoom(room: any): RoomPhysicsResult {
        return {
            roomId:     room.id,
            computedAt: Date.now(),
            thermal:    this._thermal(room),
            acoustic:   this._acoustic(room),
            daylight:   this._daylight(room),
        };
    }

    // ── Thermal ──────────────────────────────────────────────────────────────

    private _thermal(room: any): ThermalResult {
        const glazRatio = this._resolvedGlazingRatio(room);
        const windowCount = this._windowCount(room.id);

        const solarGain = SOLAR_PEAK_WM2 * SHGC * ORIENTATION_FACTOR * glazRatio;
        const load      = THERMAL_BASE_WM2 + solarGain;

        return {
            thermalLoad_Wm2: Math.round(load * 10) / 10,
            thermalClass:    thermalClass(load),
            glazingRatio:    Math.round(glazRatio * 1000) / 1000,
            windowCount,
        };
    }

    // ── Acoustic ─────────────────────────────────────────────────────────────

    private _acoustic(room: any): AcousticResult {
        const volume    = room.volume    ?? (room.area ?? 1) * (room.boundary?.height ?? 2.7);
        const area      = room.area      ?? 1;
        const perimeter = room.perimeter ?? Math.sqrt(area) * 4;
        const height    = room.boundary?.height ?? 2.7;

        const finishes = room.finishes ?? {};
        const nrcFloor   = nrcFromName(finishes.floor?.materialName);
        const nrcCeiling = nrcFromName(finishes.ceiling?.materialName);
        const nrcWalls   = nrcFromName(finishes.walls?.materialName);

        const sFloor   = area;
        const sCeiling = area;
        const sWalls   = perimeter * height;

        const totalAbsorption = sFloor * nrcFloor + sCeiling * nrcCeiling + sWalls * nrcWalls;
        const rt60 = totalAbsorption > 0
            ? (0.161 * volume) / totalAbsorption
            : 99; // fully reflective — infinite RT

        return {
            rt60_s:              Math.round(rt60 * 100) / 100,
            acousticClass:       acousticClass(rt60, room.occupancyType ?? ''),
            volume_m3:           Math.round(volume * 100) / 100,
            totalAbsorption_m2:  Math.round(totalAbsorption * 100) / 100,
        };
    }

    // ── Daylight ─────────────────────────────────────────────────────────────

    private _daylight(room: any): DaylightResult {
        const floorArea    = room.area ?? 1;
        const glazingArea  = this._glazingArea(room);
        const transmission = 0.80; // standard double-glazing visible transmission

        const df = glazingArea > 0
            ? (glazingArea / floorArea) * transmission * 100
            : 0;

        return {
            daylightFactor_percent: Math.round(df * 10) / 10,
            daylightClass:          daylightClass(df),
            glazingArea_m2:         Math.round(glazingArea * 100) / 100,
            floorArea_m2:           Math.round(floorArea * 100) / 100,
        };
    }

    // ── Window helpers ────────────────────────────────────────────────────────

    private _windowCount(roomId: string): number {
        try {
            const ws = window.windowStore; // TODO(TASK-08)
            if (!ws?.getAll) return 0;
            const wins = (ws.getAll() as any[]).filter(w => w.roomId === roomId || w.spaceId === roomId);
            return wins.length;
        } catch { return 0; }
    }

    private _glazingArea(room: any): number {
        try {
            const ws = window.windowStore; // TODO(TASK-08)
            if (!ws?.getAll) {
                return room.area * defaultGlazingRatio(room.occupancyType ?? '');
            }
            const wins = (ws.getAll() as any[]).filter(w => w.roomId === room.id || w.spaceId === room.id);
            if (wins.length === 0) {
                return room.area * defaultGlazingRatio(room.occupancyType ?? '');
            }
            return wins.reduce((sum: number, w: any) => {
                const wArea = (w.width ?? 0.9) * (w.height ?? 1.2);
                return sum + wArea;
            }, 0);
        } catch {
            return room.area * defaultGlazingRatio(room.occupancyType ?? '');
        }
    }

    private _resolvedGlazingRatio(room: any): number {
        const glazingArea = this._glazingArea(room);
        return room.area > 0 ? glazingArea / room.area : defaultGlazingRatio(room.occupancyType ?? '');
    }

    // ── SemanticGraph edge ────────────────────────────────────────────────────

    private _writeSemanticEdge(roomId: string, result: RoomPhysicsResult): void {
        try {
            const sgm = window.semanticGraphManager;
            if (!sgm?.addRelationship) return;
            const nodeId = `physics-result-${roomId}`;
            sgm.addRelationship(roomId, nodeId, 'measuredAt', {
                computedAt:    result.computedAt,
                thermalLoad:   result.thermal?.thermalLoad_Wm2,
                rt60:          result.acoustic?.rt60_s,
                daylightFactor: result.daylight?.daylightFactor_percent,
            });
        } catch { /* non-critical */ }
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const physicsEngine = new PhysicsEngine();

// ── Habitable types export for use in constraint rules ────────────────────────

export { HABITABLE_TYPES };
