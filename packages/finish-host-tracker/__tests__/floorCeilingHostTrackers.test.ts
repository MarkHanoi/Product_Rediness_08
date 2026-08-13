/**
 * FloorHostDependencyTracker / CeilingHostDependencyTracker — LIVE WIRING.
 * The founder's question (GR-12), finish edition: *move a wall — does the floor
 * finish follow?* Measured NO on 2026-08-13 (move-propagation.json A5/A6: the
 * references were correct and read by nothing). These tests prove the new
 * trackers close it, through the REAL stores, the REAL event fan-out, the REAL
 * resolver global, and sketches minted by the REAL producer.
 *
 * REAL, never re-implemented here (C74 §3.4):
 *   · FloorStore / CeilingStore  (@pryzm/core-app-model) — the real stores, the
 *     real `bim-floor-*` / `bim-ceiling-*` CustomEvent fan-out with the
 *     canonical `{ id }` payload the defect class is about.
 *   · WallFaceResolver via the adapter, reading the real `window.wallStore`.
 *   · buildRoomFinishBoundarySketch — the production reference producer.
 * NOT real: the wall store is a probe double (the production WallStore is an L2
 * package this one does not depend on); it implements exactly the two surfaces
 * the code under test uses — `subscribe(cb)` incl. the §STEP7 prevState third
 * argument, and `getById(id)` — and it is the SUBJECT of the move, never the
 * source of the answer.
 *
 * §FINISH-TRACKER-EVENT-SHAPE / WATCHED-RED: the "created AFTER wiring" tests
 * below reach the tracker ONLY through the store's `{ id }` event payload. They
 * were watched FAIL against a deliberately broken guard (`detail?.floor` — the
 * exact pre-798f2cfd slab-tracker shape) before the correct guard was trusted;
 * the transcript is in the lane report. A tracker that guards on a field the
 * store never sends turns every one of them red.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { FloorStore, CeilingStore, type FloorData, type CeilingData } from '@pryzm/core-app-model/stores';
import { buildRoomFinishBoundarySketch } from '../../command-registry/src/rooms/roomBoundarySketch';
import { WallFaceResolver } from '../../geometry-slab/src/WallFaceResolver';
import { SketchLoopIntersector } from '../../geometry-slab/src/SketchLoopIntersector';
import { FloorHostDependencyTracker, floorHostReferenceEdges } from '../src/FloorHostDependencyTracker';
import { CeilingHostDependencyTracker, ceilingHostReferenceEdges } from '../src/CeilingHostDependencyTracker';
import type {
    FinishBoundaryCommandLike,
    FinishBoundaryWritePayload,
    FinishCommandManagerRef,
} from '../src/FinishHostDependencyTracker';
import { signedAreaXZ } from '../src/reprojectFinishBoundary';
import type { XZ } from '../src/FinishSegmentAdapter';

// ── probe wall store ─────────────────────────────────────────────────────────

type ProbeWall = { id: string; baseLine: { x: number; y: number; z: number }[]; thickness: number };
type WallEvent = 'add' | 'update' | 'remove';
type Listener = (e: WallEvent, w: ProbeWall, prev?: ProbeWall) => void;

class ProbeWallStore {
    private walls = new Map<string, ProbeWall>();
    private listeners: Listener[] = [];
    seed(w: ProbeWall): void { this.walls.set(w.id, w); }
    getById(id: string): ProbeWall | undefined { return this.walls.get(id); }
    subscribe(cb: Listener): () => void {
        this.listeners.push(cb);
        return () => { this.listeners = this.listeners.filter((l) => l !== cb); };
    }
    /** THE ACT: mutate the centreline, then emit the §STEP7-shaped 'update'. */
    move(id: string, dx: number, dz: number, opts?: { withPrevState?: boolean }): void {
        const w = this.walls.get(id);
        if (!w) throw new Error(`probe wall "${id}" not seeded`);
        const prev: ProbeWall = { ...w, baseLine: w.baseLine.map((p) => ({ ...p })) };
        w.baseLine = w.baseLine.map((p) => ({ x: p.x + dx, y: p.y, z: p.z + dz }));
        const withPrev = opts?.withPrevState !== false;
        for (const l of this.listeners) l('update', w, withPrev ? prev : undefined);
    }
    remove(id: string): void {
        const w = this.walls.get(id);
        if (!w) return;
        this.walls.delete(id);
        for (const l of this.listeners) l('remove', w);
    }
}

function seedRoom(store: ProbeWallStore): void {
    const w = (id: string, x0: number, z0: number, x1: number, z1: number): ProbeWall => ({
        id,
        baseLine: [{ x: x0, y: 0, z: z0 }, { x: x1, y: 0, z: z1 }],
        thickness: 0.2,
    });
    store.seed(w('w-south', 0, 0, 6, 0));
    store.seed(w('w-east', 6, 0, 6, 4));
    store.seed(w('w-north', 6, 4, 0, 4));
    store.seed(w('w-west', 0, 4, 0, 0));
    store.seed(w('w-detached', 0, 10, 6, 10));
}

const RING: XZ[] = [
    { x: 0.1, z: 0.1 },
    { x: 5.9, z: 0.1 },
    { x: 5.9, z: 3.9 },
    { x: 0.1, z: 3.9 },
];

let walls: ProbeWallStore;

function producedSketch() {
    return buildRoomFinishBoundarySketch(RING, 'room-1', {
        getRoomById: () => ({ boundingWallIds: ['w-south', 'w-east', 'w-north', 'w-west'] }),
        getWallById: (id) => {
            const w = walls.getById(id);
            return w
                ? { id: w.id, baseLine: w.baseLine.map((p) => ({ x: p.x, z: p.z })), thickness: w.thickness }
                : undefined;
        },
    });
}

/** A schema-valid floor finish carrying the PRODUCER's sketch. */
function finishFloor(id: string): FloorData {
    const s = producedSketch();
    return {
        id,
        type: 'floor',
        levelId: 'L0',
        label: `Floor-${id}`,
        floorNumber: `F.${id}`,
        boundary: { polygon: RING.map((p) => ({ ...p })), baseOffset: 0.015, thickness: 0.015, detectionMethod: 'from-room' },
        sketch: { outerLoop: s.outerLoop },
        finishSpec: { exposedScreed: false },
        serviceHoles: [],
        coveredRoomIds: [],
        boundingWallIds: s.boundingWallIds,
        hostRoomId: 'room-1',
        visible: true,
        properties: {},
        metadata: { createdAt: Date.now(), modifiedAt: Date.now(), createdBy: 'test', version: 1 },
    } as unknown as FloorData;
}

/** A schema-valid ceiling carrying the PRODUCER's sketch (validateCeilingData throws). */
function finishCeiling(id: string): CeilingData {
    const s = producedSketch();
    return {
        id,
        type: 'ceiling',
        levelId: 'L0',
        label: `Ceiling-${id}`,
        ceilingNumber: `C.${id}`,
        boundary: { polygon: RING.map((p) => ({ ...p })), height: 2.5, thickness: 0.05, baseOffset: 0, detectionMethod: 'from-room' },
        sketch: { outerLoop: s.outerLoop },
        finishSpec: { exposedStructure: false },
        holeElements: [],
        coveredRoomIds: [],
        boundingWallIds: s.boundingWallIds,
        hostRoomId: 'room-1',
        visible: true,
        properties: {},
        ifcData: { guid: `guid-${id}`, ifcClass: 'IfcCovering', predefinedType: 'CEILING' },
        metadata: { createdAt: Date.now(), modifiedAt: Date.now(), createdBy: 'test', version: 1 },
    } as unknown as CeilingData;
}

const noCm: FinishCommandManagerRef = { current: undefined };

/** The ONE real resolver + ONE real intersector, injected exactly as the engine
 *  wiring injects them. */
const geometry = { resolver: WallFaceResolver, intersector: SketchLoopIntersector };

const areaOf = (polygon: ReadonlyArray<XZ>): number => Math.abs(signedAreaXZ(polygon));

beforeEach(() => {
    walls = new ProbeWallStore();
    seedRoom(walls);
    Object.assign(window, { wallStore: walls });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
    Object.assign(window, { wallStore: undefined });
    vi.restoreAllMocks();
});

// ════════════════════════════════════════════════════════════════════════════
// §1 — FLOOR: the wire is live from birth (the slab's cut wire, not repeated)
// ════════════════════════════════════════════════════════════════════════════

describe('§1 FLOOR — a floor created AFTER the tracker is wired FOLLOWS its wall', () => {
    it('event-path registration: store.add fires `{ id }`, the tracker registers, the wall moves, the STORED boundary follows', () => {
        const floorStore = new FloorStore();
        const tracker = new FloorHostDependencyTracker(floorStore, walls, geometry, noCm);

        // No bootstrap() — this floor reaches the tracker ONLY through the
        // canonical `{ id }` event payload. This is the exact path that was dead
        // in both slab trackers for months (§FIX-SLAB-TRACKER-EVENT-SHAPE).
        floorStore.add(finishFloor('fl-live'));
        walls.move('w-north', 0, 2);

        const stored = floorStore.getById('fl-live')!;
        expect(areaOf(stored.boundary.polygon)).toBeCloseTo(33.64, 6);
        expect(Math.max(...stored.boundary.polygon.map((p) => p.z))).toBeCloseTo(5.9, 6);

        // §4.3 — the sketch fallbacks were refreshed alongside the polygon, so a
        // LATER wall deletion degrades to the followed geometry, not the stale one.
        const northRef = floorHostReferenceEdges(stored)!.find((e) => e.hostId === 'w-north')!;
        expect(northRef.fallback!.start.z).toBeCloseTo(5.9, 6);

        // Unlike the slab (its still-open row: mesh 36 m² vs record 24 m²), the
        // RECORD is what followed here — FloorPanelBuilder reads boundary.polygon,
        // so drawn and recorded geometry stay ONE value.
        tracker.dispose();
    });

    it('bootstrap(): a floor that existed BEFORE wiring follows too (the reload case)', () => {
        const floorStore = new FloorStore();
        floorStore.add(finishFloor('fl-boot'));

        const tracker = new FloorHostDependencyTracker(floorStore, walls, geometry, noCm);
        tracker.bootstrap();
        walls.move('w-north', 0, 2);

        expect(areaOf(floorStore.getById('fl-boot')!.boundary.polygon)).toBeCloseTo(33.64, 6);
        tracker.dispose();
    });

    it('ROOT CAUSE pinned: FloorStore emits `{ id }` only — the field the broken guard class read is ABSENT', () => {
        const seen: unknown[] = [];
        const capture = (e: Event): void => { seen.push((e as CustomEvent).detail); };
        window.addEventListener('bim-floor-added', capture);
        window.addEventListener('bim-floor-updated', capture);
        window.addEventListener('bim-floor-removed', capture);

        const floorStore = new FloorStore();
        floorStore.add(finishFloor('fl-shape'));
        floorStore.update('fl-shape', { visible: false });
        floorStore.remove('fl-shape');

        window.removeEventListener('bim-floor-added', capture);
        window.removeEventListener('bim-floor-updated', capture);
        window.removeEventListener('bim-floor-removed', capture);

        expect(seen).toHaveLength(3);
        for (const detail of seen) {
            expect(detail).toEqual({ id: 'fl-shape' });
            expect((detail as Record<string, unknown>).floor).toBeUndefined();
            expect((detail as Record<string, unknown>).floorId).toBeUndefined();
        }
    });

    it('the LEGACY full-record payload shape is tolerated too (a future emitter cannot re-break this)', () => {
        // Seed the store while NO tracker is listening, so the only announcement
        // the tracker under test ever receives is the legacy `{ floor }` shape.
        const floorStore = new FloorStore();
        floorStore.add(finishFloor('fl-legacy'));

        const tracker2 = new FloorHostDependencyTracker(floorStore, walls, geometry, noCm);
        window.dispatchEvent(new CustomEvent('bim-floor-added', { detail: { floor: floorStore.getById('fl-legacy') } }));
        walls.move('w-north', 0, 2);

        expect(areaOf(floorStore.getById('fl-legacy')!.boundary.polygon)).toBeCloseTo(33.64, 6);
        tracker2.dispose();
    });

    it('no prevState on the wall event → honest undetermined refusal, boundary untouched (never a guess)', () => {
        const floorStore = new FloorStore();
        const tracker = new FloorHostDependencyTracker(floorStore, walls, geometry, noCm);
        floorStore.add(finishFloor('fl-noprev'));

        walls.move('w-north', 0, 2, { withPrevState: false });

        expect(areaOf(floorStore.getById('fl-noprev')!.boundary.polygon)).toBeCloseTo(22.04, 6);
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('STALE_DERIVED_STATE'));
        tracker.dispose();
    });

    it('moving an UNRELATED wall writes nothing (graph precision — the N2 control shape)', () => {
        const floorStore = new FloorStore();
        const tracker = new FloorHostDependencyTracker(floorStore, walls, geometry, noCm);
        floorStore.add(finishFloor('fl-n2'));
        const before = floorStore.getById('fl-n2')!.metadata.version;

        walls.move('w-detached', 0, 2);

        const after = floorStore.getById('fl-n2')!;
        expect(after.metadata.version).toBe(before);
        expect(areaOf(after.boundary.polygon)).toBeCloseTo(22.04, 6);
        tracker.dispose();
    });

    it('dispose(): a disposed tracker reacts to nothing', () => {
        const floorStore = new FloorStore();
        const tracker = new FloorHostDependencyTracker(floorStore, walls, geometry, noCm);
        floorStore.add(finishFloor('fl-disposed'));
        tracker.dispose();

        walls.move('w-north', 0, 2);
        expect(areaOf(floorStore.getById('fl-disposed')!.boundary.polygon)).toBeCloseTo(22.04, 6);
    });

    // ────────────────────────────────────────────────────────────────────────
    // §FINISH-TRACKER-REENTRANT-SET — the regression that made this whole FILE
    // unrunnable. This test is a COUNTER, not an assertion about geometry,
    // because the defect was invisible to every geometry assertion above: the
    // boundary it wrote was CORRECT, it just wrote it forever.
    //
    // Mechanism: onWallUpdated iterated the live `Set` of dependents. The write
    // re-enters the tracker (store.update → `bim-floor-updated` → our own
    // listener → registerRecord), and registerRecord delete-then-re-ADDS the
    // element into that same Set. Set.prototype.forEach re-visits an element
    // removed and re-inserted mid-iteration (ECMA-262 24.2.3.6), so one wall
    // move re-projected one floor without bound — 2033 MB, "Ineffective
    // mark-compacts near heap limit", ~300 s, zero tests completed.
    //
    // WATCHED RED: against `dependents.forEach(...)` this test does not fail,
    // it OOMs the worker — which is exactly why the counter is capped and
    // throws. A plain `expect(writes).toBe(1)` would never be reached.
    // ────────────────────────────────────────────────────────────────────────
    it('§REENTRANT-SET — one wall move writes the boundary exactly ONCE (the re-entrant write must not re-feed the iteration)', () => {
        const floorStore = new FloorStore();
        let writes = 0;
        const realUpdate = floorStore.update.bind(floorStore);
        (floorStore as unknown as { update: (...a: never[]) => unknown }).update = (...a: never[]) => {
            writes++;
            // Cap BELOW the heap limit: unbounded re-entry must surface as a
            // failed assertion, never as a dead CI worker.
            if (writes > 8) throw new Error(`re-entrant boundary write: ${writes} store.update calls for ONE wall move`);
            return (realUpdate as (...x: never[]) => unknown)(...a);
        };

        const tracker = new FloorHostDependencyTracker(floorStore, walls, geometry, noCm);
        floorStore.add(finishFloor('fl-reentrant'));
        walls.move('w-north', 0, 2);

        expect(writes).toBe(1);
        // …and the write it did make is still the RIGHT one — the fix bounds the
        // loop without changing the answer.
        expect(areaOf(floorStore.getById('fl-reentrant')!.boundary.polygon)).toBeCloseTo(33.64, 6);
        tracker.dispose();
    });

    it('§REENTRANT-SET — a wall carrying TWO dependent floors re-projects BOTH, exactly once each', () => {
        // The snapshot fix must not turn the runaway into the opposite defect:
        // `return` inside the old forEach skipped ONE element, but inside a
        // for-of it would abandon every REMAINING dependent. Two dependents on
        // one wall is the smallest case that can tell those apart.
        const floorStore = new FloorStore();
        const tracker = new FloorHostDependencyTracker(floorStore, walls, geometry, noCm);
        floorStore.add(finishFloor('fl-a'));
        floorStore.add(finishFloor('fl-b'));

        walls.move('w-north', 0, 2);

        expect(areaOf(floorStore.getById('fl-a')!.boundary.polygon)).toBeCloseTo(33.64, 6);
        expect(areaOf(floorStore.getById('fl-b')!.boundary.polygon)).toBeCloseTo(33.64, 6);
        expect(floorStore.getById('fl-a')!.metadata.version).toBe(2);
        expect(floorStore.getById('fl-b')!.metadata.version).toBe(2);
        tracker.dispose();
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §2 — FLOOR: wall REMOVAL degrades references (C79 §4), never the geometry
// ════════════════════════════════════════════════════════════════════════════

describe('§2 FLOOR — wall removal degrades host references to freeLine at last geometry', () => {
    it('removing w-north converts ONLY its edge; the boundary polygon does not move (C79 §4.1)', () => {
        const floorStore = new FloorStore();
        const tracker = new FloorHostDependencyTracker(floorStore, walls, geometry, noCm);
        floorStore.add(finishFloor('fl-degrade'));

        walls.remove('w-north');

        const stored = floorStore.getById('fl-degrade')!;
        expect(areaOf(stored.boundary.polygon)).toBeCloseTo(22.04, 6); // survives, unmoved
        const edges = stored.sketch!.outerLoop.edges;
        expect(edges.filter((e) => e.type === 'hostReference')).toHaveLength(3);
        const degraded = edges[2]!;
        expect(degraded.type).toBe('freeLine');
        if (degraded.type === 'freeLine') {
            // Degraded to the edge's own last geometry (the inset line, z=3.9) —
            // never to the centreline, never to nothing.
            expect(degraded.start.z).toBeCloseTo(3.9, 6);
            expect(degraded.end.z).toBeCloseTo(3.9, 6);
        }
        // Declared failure mode is audible: no command manager was wired here.
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('NOT be undoable'));
        tracker.dispose();
    });

    it('after degradation, moving the OTHER walls still re-projects the remaining references', () => {
        const floorStore = new FloorStore();
        const tracker = new FloorHostDependencyTracker(floorStore, walls, geometry, noCm);
        floorStore.add(finishFloor('fl-partial'));

        walls.remove('w-north');
        walls.move('w-south', 0, -1); // centreline z: 0 → -1; south edge 0.1 → -0.9

        const stored = floorStore.getById('fl-partial')!;
        expect(Math.min(...stored.boundary.polygon.map((p) => p.z))).toBeCloseTo(-0.9, 6);
        // North stayed where degradation left it.
        expect(Math.max(...stored.boundary.polygon.map((p) => p.z))).toBeCloseTo(3.9, 6);
        tracker.dispose();
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §3 — FLOOR: the write path is command-first when a command manager exists
// ════════════════════════════════════════════════════════════════════════════

describe('§3 FLOOR — command-first write path (P6; move-propagation slab-A2 rule)', () => {
    it('with a command manager + factory wired, the tracker writes ONLY through the command', () => {
        const floorStore = new FloorStore();
        const context = { stores: { floorStore } };
        const executed: FinishBoundaryWritePayload[] = [];

        const cmRef: FinishCommandManagerRef = {
            current: {
                getContext: () => context,
                execute: (cmd) => (cmd as FinishBoundaryCommandLike & { execute(ctx: unknown): unknown }).execute(context),
            },
        };
        // Factory returns a minimal command double that applies the same store
        // write the real UpdateFloorBoundaryCommand performs (the real class is
        // covered end-to-end in updateFinishBoundaryCommands.test.ts).
        const tracker = new FloorHostDependencyTracker(floorStore, walls, geometry, cmRef, (payload) => ({
            canExecute: () => ({ ok: true }),
            execute: () => {
                executed.push(payload);
                const rec = floorStore.getById(payload.elementId)!;
                floorStore.update(payload.elementId, {
                    ...(payload.polygon ? { boundary: { ...rec.boundary, polygon: payload.polygon } } : {}),
                    sketch: { ...(rec.sketch ?? {}), outerLoop: { edges: payload.outerLoopEdges } },
                } as Partial<FloorData>);
            },
        } as FinishBoundaryCommandLike));

        floorStore.add(finishFloor('fl-cmd'));
        walls.move('w-north', 0, 2);

        expect(executed).toHaveLength(1);
        expect(executed[0]!.mode).toBe('reproject');
        expect(executed[0]!.cause).toEqual({ wallId: 'w-north', kind: 'wall-moved' });
        expect(areaOf(floorStore.getById('fl-cmd')!.boundary.polygon)).toBeCloseTo(33.64, 6);

        walls.remove('w-south');
        expect(executed).toHaveLength(2);
        expect(executed[1]!.mode).toBe('degrade');
        expect(executed[1]!.polygon).toBeUndefined();
        expect(executed[1]!.cause).toEqual({ wallId: 'w-south', kind: 'wall-removed' });
        // No direct-write fallback warning fired on this path.
        expect(vi.mocked(console.warn).mock.calls.filter((c) => String(c[0]).includes('NOT be undoable'))).toHaveLength(0);
        tracker.dispose();
    });

    it('a refusing canExecute blocks the write and names the reason', () => {
        const floorStore = new FloorStore();
        const cmRef: FinishCommandManagerRef = {
            current: { getContext: () => ({}), execute: () => { throw new Error('must not execute'); } },
        };
        const tracker = new FloorHostDependencyTracker(floorStore, walls, geometry, cmRef, () => ({
            canExecute: () => ({ ok: false, reason: 'probe-refusal' }),
        }));

        floorStore.add(finishFloor('fl-refused'));
        walls.move('w-north', 0, 2);

        expect(areaOf(floorStore.getById('fl-refused')!.boundary.polygon)).toBeCloseTo(22.04, 6);
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('probe-refusal'));
        tracker.dispose();
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §4 — CEILING: the byte-identical twin follows through the same machinery
// ════════════════════════════════════════════════════════════════════════════

describe('§4 CEILING — the ceiling family follows and degrades identically (C79 §3.4/§7.4)', () => {
    it('a ceiling created AFTER wiring follows its wall through the { id } event path', () => {
        const ceilingStore = new CeilingStore();
        const tracker = new CeilingHostDependencyTracker(ceilingStore, walls, geometry, noCm);

        ceilingStore.add(finishCeiling('cl-live'));
        walls.move('w-north', 0, 2);

        const stored = ceilingStore.getById('cl-live')!;
        expect(areaOf(stored.boundary.polygon)).toBeCloseTo(33.64, 6);
        expect(Math.max(...stored.boundary.polygon.map((p) => p.z))).toBeCloseTo(5.9, 6);
        tracker.dispose();
    });

    it('removing a wall degrades the ceiling reference and leaves its geometry in place', () => {
        const ceilingStore = new CeilingStore();
        const tracker = new CeilingHostDependencyTracker(ceilingStore, walls, geometry, noCm);
        ceilingStore.add(finishCeiling('cl-degrade'));

        walls.remove('w-north');

        const stored = ceilingStore.getById('cl-degrade')!;
        expect(areaOf(stored.boundary.polygon)).toBeCloseTo(22.04, 6);
        const edges = stored.sketch!.outerLoop.edges;
        expect(edges.filter((e) => e.type === 'hostReference')).toHaveLength(3);
        expect(edges[2]!.type).toBe('freeLine');
        tracker.dispose();
    });

    it('§NO-EMPTY-MEANS-UNKNOWN — the typed readers distinguish "no sketch recorded" (null) from "recorded, zero wall attributions" ([])', () => {
        // No sketch at all → RELATIONSHIP_NOT_RECORDED → null, never [].
        const bare = finishFloor('fl-bare');
        delete (bare as { sketch?: unknown }).sketch;
        expect(floorHostReferenceEdges(bare)).toBeNull();

        // A RECORDED loop whose edges attribute to no wall → an honest empty.
        const freeOnly = finishFloor('fl-free');
        freeOnly.sketch = {
            outerLoop: {
                edges: RING.map((p, i) => ({
                    type: 'freeLine' as const,
                    start: { ...p },
                    end: { ...RING[(i + 1) % RING.length]! },
                })),
            },
        };
        expect(floorHostReferenceEdges(freeOnly)).toEqual([]);
        // The two facts are different VALUES at the caller — the C78 §1.4 rule.
        expect(floorHostReferenceEdges(bare)).not.toEqual(floorHostReferenceEdges(freeOnly));

        // The ceiling reader is the byte-identical twin (C79 §3.4) and makes the
        // same distinction.
        const bareCeiling = finishCeiling('cl-bare');
        delete (bareCeiling as { sketch?: unknown }).sketch;
        expect(ceilingHostReferenceEdges(bareCeiling)).toBeNull();
        expect(ceilingHostReferenceEdges(finishCeiling('cl-ref'))!.length).toBe(4);
    });

    it('ROOT CAUSE pinned for ceilings too: CeilingStore emits `{ id }` only', () => {
        const seen: unknown[] = [];
        const capture = (e: Event): void => { seen.push((e as CustomEvent).detail); };
        window.addEventListener('bim-ceiling-added', capture);
        window.addEventListener('bim-ceiling-updated', capture);
        window.addEventListener('bim-ceiling-removed', capture);

        const ceilingStore = new CeilingStore();
        ceilingStore.add(finishCeiling('cl-shape'));
        ceilingStore.update('cl-shape', { visible: false });
        ceilingStore.remove('cl-shape');

        window.removeEventListener('bim-ceiling-added', capture);
        window.removeEventListener('bim-ceiling-updated', capture);
        window.removeEventListener('bim-ceiling-removed', capture);

        expect(seen).toHaveLength(3);
        for (const detail of seen) {
            expect(detail).toEqual({ id: 'cl-shape' });
            expect((detail as Record<string, unknown>).ceiling).toBeUndefined();
            expect((detail as Record<string, unknown>).ceilingId).toBeUndefined();
        }
    });
});
