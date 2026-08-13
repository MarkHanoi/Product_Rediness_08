/**
 * §FINISH-FOLLOWS-WALL — EDITOR-SIDE WIRING REACHABILITY (GR-12 · C79 §5).
 *
 * WHY THIS SPEC EXISTS, in the editor and not the package: on 2026-08-13
 * `check-move-propagation` arms A5/A6 went GREEN while
 * `require.resolve('@pryzm/finish-host-tracker')` from `apps/editor` threw
 * MODULE_NOT_FOUND — the tracker package existed and was wired into NOTHING,
 * so the founder saw finishes NOT follow a moved wall while the gate said they
 * do. This spec asserts the three facts the gate could not see, from the
 * editor's own resolution context:
 *
 *   1. `@pryzm/finish-host-tracker` RESOLVES from apps/editor (the exact
 *      import initTools.ts now performs — this file sits in the same tree and
 *      resolves through the same apps/editor/node_modules link).
 *   2. `UpdateFloorBoundaryCommand` / `UpdateCeilingBoundaryCommand` are
 *      exported from the `@pryzm/command-registry` BARREL — they existed as
 *      files reachable from no export before this wiring landed.
 *   3. The EXACT construction shape initTools.ts uses — real trackers, the one
 *      real WallFaceResolver + SketchLoopIntersector, the REAL boundary
 *      commands via the same payload→command factory mapping — makes a wall
 *      move re-project a real FloorStore/CeilingStore boundary, exactly ONCE
 *      per move (§FINISH-TRACKER-REENTRANT-SET, f5f312de).
 *
 * The wall store is the package suite's probe double (the SUBJECT of the move,
 * never the source of the answer); everything downstream of the wall event is
 * the production class. Fixtures mirror the package suite's proven room
 * (6 × 4 m, walls 0.2 m, finish ring inset 0.1 m → 22.04 m²; north wall +2 m
 * → 33.64 m²) so the two suites can be cross-read.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// FACT 1 — these specifiers resolving from apps/editor IS part of the assertion.
import {
    FloorHostDependencyTracker,
    CeilingHostDependencyTracker,
    signedAreaXZ,
    type FinishBoundaryWritePayload,
    type FinishCommandManagerRef,
    type XZ,
} from '@pryzm/finish-host-tracker';
// FACT 2 — the barrel, not a deep path: initTools.ts imports these from the barrel.
import {
    UpdateFloorBoundaryCommand,
    UpdateCeilingBoundaryCommand,
    buildRoomFinishBoundarySketch,
} from '@pryzm/command-registry';
import { WallFaceResolver, SketchLoopIntersector } from '@pryzm/geometry-slab';
import { FloorStore, CeilingStore, type FloorData, type CeilingData } from '@pryzm/core-app-model/stores';

// ── probe wall store (the package suite's double, verbatim shape) ────────────

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
    move(id: string, dx: number, dz: number): void {
        const w = this.walls.get(id);
        if (!w) throw new Error(`probe wall "${id}" not seeded`);
        const prev: ProbeWall = { ...w, baseLine: w.baseLine.map((p) => ({ ...p })) };
        w.baseLine = w.baseLine.map((p) => ({ x: p.x + dx, y: p.y, z: p.z + dz }));
        for (const l of this.listeners) l('update', w, prev);
    }
    remove(id: string): void {
        const w = this.walls.get(id);
        if (!w) return;
        this.walls.delete(id);
        for (const l of this.listeners) l('remove', w);
    }
}

const RING: XZ[] = [
    { x: 0.1, z: 0.1 },
    { x: 5.9, z: 0.1 },
    { x: 5.9, z: 3.9 },
    { x: 0.1, z: 3.9 },
];

let walls: ProbeWallStore;

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
}

function producedSketch() {
    return buildRoomFinishBoundarySketch(RING, 'room-1', {
        getRoomById: () => ({ boundingWallIds: ['w-south', 'w-east', 'w-north', 'w-west'] }),
        getWallById: (id: string) => {
            const w = walls.getById(id);
            return w
                ? { id: w.id, baseLine: w.baseLine.map((p) => ({ x: p.x, z: p.z })), thickness: w.thickness }
                : undefined;
        },
    });
}

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

const areaOf = (polygon: ReadonlyArray<XZ>): number => Math.abs(signedAreaXZ(polygon));

// ── the initTools.ts wiring shape, replicated with the REAL commands ─────────
// (initTools.ts:~840 — same geometry pair, same commandManagerRef late-binding
// shape, same payload→command factory mapping with only the id key renamed.)

const finishGeometryServices = { resolver: WallFaceResolver, intersector: SketchLoopIntersector };

function makeCmRef(context: unknown): FinishCommandManagerRef & { executions: number } {
    const ref = {
        executions: 0,
        current: {
            getContext: () => context,
            execute: (cmd: unknown) => {
                ref.executions += 1;
                return (cmd as { execute(ctx: unknown): unknown }).execute(context);
            },
        },
    };
    return ref;
}

beforeEach(() => {
    walls = new ProbeWallStore();
    seedRoom(walls);
    // WallFaceResolver reads window.wallStore (its documented TASK-08 seam) —
    // in the editor initBuilders/initTools assign it; here the probe does.
    (window as unknown as { wallStore: unknown }).wallStore = walls;
    vi.spyOn(console, 'warn');
});

afterEach(() => {
    delete (window as unknown as { wallStore?: unknown }).wallStore;
    vi.restoreAllMocks();
});

describe('§FINISH-FOLLOWS-WALL editor wiring — the initTools construction shape, real commands, real stores', () => {
    it('a moved wall re-projects a real floor boundary ONCE, through UpdateFloorBoundaryCommand', () => {
        const floorStore = new FloorStore();
        const context = { stores: { floorStore } };
        const cmRef = makeCmRef(context);

        const tracker = new FloorHostDependencyTracker(
            floorStore, walls, finishGeometryServices, cmRef,
            (payload: FinishBoundaryWritePayload) => new UpdateFloorBoundaryCommand({
                floorId: payload.elementId,
                mode: payload.mode,
                polygon: payload.polygon,
                outerLoopEdges: payload.outerLoopEdges,
                cause: payload.cause,
            }),
        );
        floorStore.add(finishFloor('fl-wired'));

        expect(areaOf(floorStore.getById('fl-wired')!.boundary.polygon)).toBeCloseTo(22.04, 6);
        walls.move('w-north', 0, 2);

        const stored = floorStore.getById('fl-wired')!;
        expect(areaOf(stored.boundary.polygon)).toBeCloseTo(33.64, 6);
        expect(Math.max(...stored.boundary.polygon.map((p) => p.z))).toBeCloseTo(5.9, 6);
        // §FINISH-TRACKER-REENTRANT-SET (f5f312de) — exactly ONE command per move.
        expect(cmRef.executions).toBe(1);
        // Command path, never the audible direct-write fallback.
        expect(vi.mocked(console.warn).mock.calls.filter((c) => String(c[0]).includes('NOT be undoable'))).toHaveLength(0);
        tracker.dispose();
    });

    it('a removed wall degrades the floor sketch through the UNDOABLE command; geometry stays (C79 §4.1/§4.2)', () => {
        const floorStore = new FloorStore();
        const context = { stores: { floorStore } };
        const cmRef = makeCmRef(context);
        const tracker = new FloorHostDependencyTracker(
            floorStore, walls, finishGeometryServices, cmRef,
            (payload: FinishBoundaryWritePayload) => new UpdateFloorBoundaryCommand({
                floorId: payload.elementId,
                mode: payload.mode,
                polygon: payload.polygon,
                outerLoopEdges: payload.outerLoopEdges,
                cause: payload.cause,
            }),
        );
        floorStore.add(finishFloor('fl-degrade'));

        walls.remove('w-north');

        const stored = floorStore.getById('fl-degrade')!;
        expect(areaOf(stored.boundary.polygon)).toBeCloseTo(22.04, 6);
        const edges = stored.sketch!.outerLoop.edges;
        expect(edges.filter((e) => e.type === 'hostReference')).toHaveLength(3);
        expect(edges[2]!.type).toBe('freeLine');
        expect(cmRef.executions).toBe(1);
        tracker.dispose();
    });

    it('a moved wall re-projects a real ceiling boundary ONCE, through UpdateCeilingBoundaryCommand', () => {
        const ceilingStore = new CeilingStore();
        const context = { stores: { ceilingStore } };
        const cmRef = makeCmRef(context);

        const tracker = new CeilingHostDependencyTracker(
            ceilingStore, walls, finishGeometryServices, cmRef,
            (payload: FinishBoundaryWritePayload) => new UpdateCeilingBoundaryCommand({
                ceilingId: payload.elementId,
                mode: payload.mode,
                polygon: payload.polygon,
                outerLoopEdges: payload.outerLoopEdges,
                cause: payload.cause,
            }),
        );
        ceilingStore.add(finishCeiling('cl-wired'));

        walls.move('w-north', 0, 2);

        expect(areaOf(ceilingStore.getById('cl-wired')!.boundary.polygon)).toBeCloseTo(33.64, 6);
        expect(cmRef.executions).toBe(1);
        tracker.dispose();
    });
});
