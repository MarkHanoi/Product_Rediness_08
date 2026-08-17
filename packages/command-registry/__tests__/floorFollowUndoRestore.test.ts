// L-943 — "undo invented 63 m² of floor."
//
// MEASURED IN PRODUCTION across ONE wall-move gesture and its Ctrl+Z:
//
//   MOVE: §C79-5.2 conflicted: floor "162a95a2" NOT re-projected —
//         re-derived ring self-intersects (75.171 m² → 12.080 m²)
//   UNDO: §C79-5.2 resized:    floor "162a95a2" follows wall — 75.171 → 138.262 m²
//
// The floor REFUSED to re-project on the forward pass — so there was nothing to
// reverse — and the reverse pass applied a "follows wall" resize anyway.
//
// THE MECHANISM, stated so a reader can tell this fix from a suppression:
// `FinishHostDependencyTracker` is a LISTENER on the wall store's 'update'
// event, and `UpdateFloorBoundaryCommand` declared its 'reproject' mode
// `nonUndoable` on the explicit premise (its own class doc) that *"undoing the
// WALL move fires the wall store's 'update' again and the tracker re-projects
// back"*. That premise is FALSE, in two independent ways:
//
//   1. Re-projection is not an involution. It measures the authored inset of the
//      finish edge's CURRENT geometry against `prevState`'s centreline. On the
//      reverse pass `prevState` is the MOVED wall, so an edge that never moved
//      gets its inset measured across the whole move distance and re-applied to
//      the restored centreline. The ring balloons.
//   2. When the forward pass REFUSED ('conflicted'), no write ever happened —
//      yet the reverse pass still writes. A gesture that changed nothing is
//      undone into a change. That is a NON-REVERSIBLE GESTURE, and C71's rule
//      is that undo RESTORES, it does not RECONSTRUCT.
//
// THE ASSERTION SUBJECT IS THE STORED BOUNDARY, never the reported m² — a
// reported number is the tracker's own account of itself. Every case below
// deep-compares the FloorStore record before the move against the record after
// the undo.
//
// REAL, imported from production (never re-implemented — C74 §3.4):
//   WallStore (geometry-wall) — including the §STEP7 prevState third argument;
//   FloorStore (core-app-model); CommandManager (this package) — the REAL
//   isReverting() latch driven by a REAL undo(); UpdateWallBaselineCommand +
//   UpdateFloorBoundaryCommand (this package); FloorHostDependencyTracker +
//   reprojectFinishBoundary (finish-host-tracker); WallFaceResolver +
//   SketchLoopIntersector (geometry-slab); buildRoomFinishBoundarySketch — the
//   production sketch producer.
// NOT real, stated rather than hidden: bimManager is a level-authority stub
//   (levels are not the subject) and no meshes are built — the subject is the
//   STORED FloorData record.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { WallStore } from '@pryzm/geometry-wall';
import type { WallData } from '@pryzm/geometry-wall';
import { ProjectContext } from '@pryzm/core-app-model';
import { FloorStore, type FloorData } from '@pryzm/core-app-model/stores';
import { WallFaceResolver, SketchLoopIntersector } from '@pryzm/geometry-slab';

import { CommandManager } from '../src/CommandManagerImpl';
import type { CommandContext } from '../src/types';
import { UpdateWallBaselineCommand } from '../src/walls/UpdateWallBaselineCommand';
import { UpdateFloorBoundaryCommand } from '../src/floors/UpdateFloorBoundaryCommand';
import { buildRoomFinishBoundarySketch } from '../src/rooms/roomBoundarySketch';

import { FloorHostDependencyTracker } from '../../finish-host-tracker/src/FloorHostDependencyTracker';
import type { FinishBoundaryWritePayload } from '../../finish-host-tracker/src/FinishHostDependencyTracker';
import { signedAreaXZ } from '../../finish-host-tracker/src/reprojectFinishBoundary';

const LEVEL = 'L0';

// ── harness ──────────────────────────────────────────────────────────────────

function makeLevelProvider() {
    const level = { id: LEVEL, name: 'Ground', elevation: 0, height: 3, childrenIds: [] as string[] };
    return {
        getLevelById: (id: string) => (id === LEVEL ? { ...level } : undefined),
        getLevels: () => [{ ...level }],
    };
}

function makeBimManager() {
    const level = { id: LEVEL, name: 'Ground', elevation: 0, height: 3, childrenIds: [] as string[] };
    return {
        getLevels: () => [level],
        getLevelById: (id: string) => (id === LEVEL ? level : undefined),
        registerElement: () => undefined,
        unregisterElement: () => undefined,
    };
}

let seq = 0;
function wallRecord(id: string, s: [number, number], e: [number, number], thickness = 0.2): WallData {
    return {
        id, type: 'wall', levelId: LEVEL, properties: {}, childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 3, thickness, baseOffset: 0, openings: [],
        metadata: { createdAt: ++seq, modifiedAt: seq, createdBy: 'test', version: 1 },
    } as unknown as WallData;
}

/** A 6 × 4 room: south z=0, east x=6, north z=4, west x=0 (walk is CW in XZ). */
const ROOM_WALLS: ReadonlyArray<[string, [number, number], [number, number]]> = [
    ['w-south', [0, 0], [6, 0]],
    ['w-east', [6, 0], [6, 4]],
    ['w-north', [6, 4], [0, 4]],
    ['w-west', [0, 4], [0, 0]],
];

/** The finish ring, inset 0.1 from every centreline (the 0.2-thick walls' faces). */
const RING = [
    { x: 0.1, z: 0.1 },
    { x: 5.9, z: 0.1 },
    { x: 5.9, z: 3.9 },
    { x: 0.1, z: 3.9 },
];

interface World {
    wallStore: WallStore;
    floorStore: FloorStore;
    cm: CommandManager;
    tracker: FloorHostDependencyTracker;
    dispose(): void;
}

function makeWorld(): World {
    const bimManager = makeBimManager();
    const wallStore = new WallStore(
        new ProjectContext(),
        makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
    );
    const floorStore = new FloorStore();

    const ctx = {
        stores: { wallStore, floorStore },
        bimManager,
    } as unknown as CommandContext;
    const cm = new CommandManager(ctx);

    // WallFaceResolver reads this global in production (WallFaceResolver.ts:37).
    Object.assign(window, { wallStore });

    for (const [id, s, e] of ROOM_WALLS) wallStore.add(wallRecord(id, s, e));

    // The PRODUCTION wiring from apps/editor/src/engine/initTools.ts:871-883,
    // verbatim in shape — same command factory, same geometry services.
    const tracker = new FloorHostDependencyTracker(
        floorStore as never,
        wallStore as never,
        { resolver: WallFaceResolver, intersector: SketchLoopIntersector },
        { current: cm as never },
        (payload: FinishBoundaryWritePayload) => new UpdateFloorBoundaryCommand({
            floorId: payload.elementId,
            mode: payload.mode,
            polygon: payload.polygon as never,
            outerLoopEdges: payload.outerLoopEdges as never,
            cause: payload.cause,
        }),
    );
    tracker.bootstrap();

    return {
        wallStore, floorStore, cm, tracker,
        dispose() {
            tracker.dispose();
            Object.assign(window, { wallStore: undefined });
        },
    };
}

/** A schema-valid floor finish carrying the PRODUCTION producer's sketch. */
function addFinishFloor(world: World, id: string): FloorData {
    const s = buildRoomFinishBoundarySketch(RING, 'room-1', {
        getRoomById: () => ({ boundingWallIds: ROOM_WALLS.map(([wid]) => wid) }),
        getWallById: (wid: string) => {
            const w = world.wallStore.getById(wid);
            return w
                ? { id: w.id, baseLine: w.baseLine.map((p) => ({ x: p.x, z: p.z })), thickness: w.thickness }
                : undefined;
        },
    } as never);
    const rec = {
        id,
        type: 'floor',
        levelId: LEVEL,
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
    world.floorStore.add(rec);
    return world.floorStore.getById(id)!;
}

/** Commit a whole-wall translation through the REAL move command. */
function moveWall(world: World, id: string, dx: number, dz: number) {
    const w = world.wallStore.getById(id)!;
    return world.cm.execute(new UpdateWallBaselineCommand({
        wallId: id,
        newBaseLine: [
            { x: w.baseLine[0].x + dx, y: w.baseLine[0].y, z: w.baseLine[0].z + dz },
            { x: w.baseLine[1].x + dx, y: w.baseLine[1].y, z: w.baseLine[1].z + dz },
        ],
    }));
}

/** THE SUBJECT. A stable, order-independent serialisation of the STORED record —
 *  never the tracker's reported m², which is its own account of itself. */
const snap = (f: FloorData): string => JSON.stringify(f);
/** The boundary alone — for the REDO arm only, where `metadata.modifiedAt`
 *  legitimately advances because a redo re-EXECUTES (a genuine new write, which
 *  the audit trail SHOULD record). Undo is the arm that must be byte-exact: it
 *  writes with preserveMetadata=true precisely so it cannot corrupt that trail. */
const geom = (f: FloorData): string => JSON.stringify({ boundary: f.boundary, sketch: f.sketch });
const areaOf = (f: FloorData): number => Math.abs(signedAreaXZ(f.boundary.polygon as never));

let world: World;
const warnings: string[] = [];
const logs: string[] = [];
let realWarn: typeof console.warn;
let realLog: typeof console.log;

beforeEach(() => {
    realWarn = console.warn;
    realLog = console.log;
    warnings.length = 0;
    logs.length = 0;
    console.warn = (...a: unknown[]) => { warnings.push(a.map(String).join(' ')); };
    console.log = (...a: unknown[]) => { logs.push(a.map(String).join(' ')); };
    world = makeWorld();
});

afterEach(() => {
    world.dispose();
    console.warn = realWarn;
    console.log = realLog;
});

// ════════════════════════════════════════════════════════════════════════════
// §1 — THE MEASURED DEFECT: a floor that REFUSED forward must be BYTE-IDENTICAL
//      after undo. It has nothing to reverse, so undo owes it nothing.
// ════════════════════════════════════════════════════════════════════════════

describe('L-943 §1 — a CONFLICTED forward pass leaves undo nothing to do', () => {
    it('w-north driven past w-south: forward refuses (conflicted), and the stored boundary is BYTE-IDENTICAL after undo', () => {
        const before = snap(addFinishFloor(world, 'fl-conflict'));
        const areaBefore = areaOf(world.floorStore.getById('fl-conflict')!);

        // Drive the north wall from z=4 to z=-1 — through and past the south
        // wall. The re-derived ring inverts its winding, which C79 §5.2.2 refuses
        // with BOTH numbers rather than clamping.
        moveWall(world, 'w-north', 0, -5);

        // ARM 1 — the forward pass genuinely REFUSED (this is the premise of the
        // whole test; if it ever stops refusing the test is measuring nothing).
        expect(warnings.join('\n')).toContain('§C79-5.2 conflicted');
        expect(snap(world.floorStore.getById('fl-conflict')!)).toBe(before);

        world.cm.undo();

        // ARM 2 — THE DEFECT. Pre-fix this reads a re-derived, ballooned ring:
        // the reverse pass measures the untouched edge's inset against the MOVED
        // centreline (z=-1) and re-applies it to the restored one (z=4).
        expect(logs.join('\n')).not.toContain('§C79-5.2 resized: floor "fl-conflict"');
        expect(areaOf(world.floorStore.getById('fl-conflict')!)).toBeCloseTo(areaBefore, 9);
        expect(snap(world.floorStore.getById('fl-conflict')!)).toBe(before);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §2 — THE OTHER HALF, and the reason the fix is not "make undo refuse too":
//      a floor that DID follow forward must be RESTORED, not left moved.
// ════════════════════════════════════════════════════════════════════════════

describe('L-943 §2 — a RESIZED forward pass is RESTORED (never reconstructed) by undo', () => {
    it('w-north moved +2 m: the floor follows, and undo puts the STORED record back byte-identical', () => {
        const before = snap(addFinishFloor(world, 'fl-resize'));
        const areaBefore = areaOf(world.floorStore.getById('fl-resize')!);
        expect(areaBefore).toBeCloseTo(22.04, 6);

        moveWall(world, 'w-north', 0, 2);

        // The forward follow is real and load-bearing — without it §2 would pass
        // for the wrong reason (nothing ever moved).
        expect(areaOf(world.floorStore.getById('fl-resize')!)).toBeCloseTo(33.64, 6);
        expect(snap(world.floorStore.getById('fl-resize')!)).not.toBe(before);

        world.cm.undo();

        expect(areaOf(world.floorStore.getById('fl-resize')!)).toBeCloseTo(areaBefore, 9);
        expect(snap(world.floorStore.getById('fl-resize')!)).toBe(before);
    });

    it('REDO replays the follow, and a SECOND undo restores again — the pair is latched, not recomputed', () => {
        const before = snap(addFinishFloor(world, 'fl-redo'));

        moveWall(world, 'w-north', 0, 2);
        const movedGeom = geom(world.floorStore.getById('fl-redo')!);

        world.cm.undo();
        expect(snap(world.floorStore.getById('fl-redo')!)).toBe(before);

        world.cm.redo();
        // The redo REPLAYS the recorded forward patch. Geometry is exact to the
        // bit — a recomputed value would drift here, as the pre-fix undo did.
        expect(geom(world.floorStore.getById('fl-redo')!)).toBe(movedGeom);

        // …and the second undo restores byte-exactly again, so the cycle does not
        // accumulate. Pre-fix, every move+undo cycle both drifted the ring's low
        // bits AND climbed metadata.version, because each pass was a fresh write.
        world.cm.undo();
        expect(snap(world.floorStore.getById('fl-redo')!)).toBe(before);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §3 — ONE GESTURE = ONE Ctrl+Z (C16 §8.6 / §L-874-ONE-UNDO). The reason the
//      'reproject' write was declared nonUndoable in the first place was that an
//      undoable one would cost the user a second Ctrl+Z. It must not.
// ════════════════════════════════════════════════════════════════════════════

describe('L-943 §3 — the follow write costs the user no extra undo', () => {
    it('ONE wall move → ONE history entry; the floor follow rides on it as a structural child', () => {
        addFinishFloor(world, 'fl-onegesture');
        const before = snap(world.floorStore.getById('fl-onegesture')!);
        const wallBefore = world.wallStore.getById('w-north')!.baseLine.map((p) => ({ x: p.x, z: p.z }));

        moveWall(world, 'w-north', 0, 2);

        // ONE Ctrl+Z restores BOTH the wall and the floor.
        world.cm.undo();

        expect(world.wallStore.getById('w-north')!.baseLine.map((p) => ({ x: p.x, z: p.z })))
            .toEqual(wallBefore);
        expect(snap(world.floorStore.getById('fl-onegesture')!)).toBe(before);

        // …and there is nothing left on the stack: a second Ctrl+Z is a no-op,
        // not a ghost entry.
        expect(world.cm.undo()).toBeNull();
    });
});
