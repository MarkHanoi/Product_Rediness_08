// L-949 — "duplicate ground level to first floor: the slab, floor finishes and
// ceiling don't move along. But walls they do."
//
// FOUNDER-REPORTED, and the report contains its own root cause. Walls follow a
// move on the duplicated level because `joinedTo` is RE-DERIVED FROM GEOMETRY by
// the junction resolver after the walls land. A slab's / a finish's binding to
// its bounding walls is an AUTHORED HOST REFERENCE (`sketch.outerLoop.edges[i]
// .hostId`), and nothing re-derives it. So there are TWO defects, and this file
// asserts BOTH, because closing only the first is worse than closing neither:
//
//   §1  `DuplicateFloorPlanCommand` reads FOUR stores — wall, slab, column,
//       furniture. It never reads `floorStore` or `ceilingStore`, so floor
//       finishes and ceilings are NEVER CREATED on the target level. They are
//       not failing to follow; they do not exist.
//
//   §2  The command does NO reference remapping at all. Even the slab it DOES
//       copy crosses over as a bare polygon with `sketch` dropped — so
//       `SlabDependencyTracker`'s graph (`hostId → slabId`) has no entry for it
//       and it can never follow anything. Ship §1 alone and the founder gets
//       floors on L1 that sit inert and fail on the first wall move: a defect
//       that now LOOKS fixed.
//
//   §3  The mirror hazard, and the reason a remap must REMAP rather than copy:
//       a carried-over `hostId` still naming a SOURCE-level wall would make an
//       L1 finish follow an L0 wall. `FinishHostDependencyTracker` keys purely
//       on `hostId` and consults no level (FinishHostDependencyTracker.ts:237).
//       Cross-level contamination is the failure mode a naive fix introduces.
//
// PROVE IT AT THE LAYER THAT DECIDES (§COMMITTED-≠-REACHABLE): every arm drives
// the REAL `DuplicateFloorPlanCommand` through the REAL `CommandManager`, then a
// REAL `UpdateWallBaselineCommand`, with the THREE PRODUCTION TRACKERS wired the
// way `apps/editor/src/engine/initTools.ts:855-900` wires them. Nothing is a
// hand-built graph and no re-derivation is re-implemented here.
//
// REAL, imported from production: WallStore (geometry-wall); SlabStore,
// SlabDependencyTracker, WallFaceResolver, SketchLoopIntersector, SlabFragmentBuilder
// (geometry-slab); FloorStore + CeilingStore (core-app-model); CommandManager,
// DuplicateFloorPlanCommand, CreateSlabCommand, CreateFloorCommand,
// CreateCeilingCommand, UpdateWallBaselineCommand, UpdateFloorBoundaryCommand,
// UpdateCeilingBoundaryCommand (this package); FloorHostDependencyTracker +
// CeilingHostDependencyTracker (finish-host-tracker).
// NOT real, stated rather than hidden: `bimManager` is a level-authority stub and
// `roomStore` is a two-method read stub (rooms are not this lane's subject) — both
// are read-only inputs, never the thing under test. No meshes are built; the
// subject is the STORED record.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { WallStore } from '@pryzm/geometry-wall';
import type { WallData } from '@pryzm/geometry-wall';
import { ProjectContext } from '@pryzm/core-app-model';
import { FloorStore, CeilingStore, type FloorData, type CeilingData } from '@pryzm/core-app-model/stores';
import {
    SlabStore,
    SlabDependencyTracker,
    WallFaceResolver,
    SketchLoopIntersector,
    type SlabData,
    type SlabSketch,
} from '@pryzm/geometry-slab';

import { CommandManager } from '../src/CommandManagerImpl';
import type { CommandContext } from '../src/types';
import { DuplicateFloorPlanCommand } from '../src/levels/DuplicateFloorPlanCommand';
import { CreateSlabCommand } from '../src/slabs/CreateSlabCommand';
import { CreateFloorCommand } from '../src/floors/CreateFloorCommand';
import { CreateCeilingCommand } from '../src/ceilings/CreateCeilingCommand';
import { UpdateWallBaselineCommand } from '../src/walls/UpdateWallBaselineCommand';
import { UpdateFloorBoundaryCommand } from '../src/floors/UpdateFloorBoundaryCommand';
import { UpdateCeilingBoundaryCommand } from '../src/ceilings/UpdateCeilingBoundaryCommand';

import { FloorHostDependencyTracker } from '../../finish-host-tracker/src/FloorHostDependencyTracker';
import { CeilingHostDependencyTracker } from '../../finish-host-tracker/src/CeilingHostDependencyTracker';
import type { FinishBoundaryWritePayload } from '../../finish-host-tracker/src/FinishHostDependencyTracker';

const SRC = 'L0';
const TGT = 'L1';
const ROOM = 'room-1';

// ── the storey ───────────────────────────────────────────────────────────────
// A 6 × 4 room walked CW in XZ. Edge i of CENTRELINE is walls[i].
const WALLS: ReadonlyArray<[string, [number, number], [number, number]]> = [
    ['w-south', [0, 0], [6, 0]],
    ['w-east', [6, 0], [6, 4]],
    ['w-north', [6, 4], [0, 4]],
    ['w-west', [0, 4], [0, 0]],
];
/** The room ring, on the wall CENTRELINES. */
const CENTRELINE = [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }];

const LEVELS = [
    { id: SRC, name: 'Ground', elevation: 0, height: 3, childrenIds: [] as string[] },
    { id: TGT, name: 'First', elevation: 3, height: 3, childrenIds: [] as string[] },
];

// ── harness ──────────────────────────────────────────────────────────────────

function makeBimManager() {
    return {
        getLevels: () => LEVELS,
        getLevelById: (id: string) => LEVELS.find(l => l.id === id),
        registerElement: () => undefined,
        unregisterElement: () => undefined,
    };
}

let seq = 0;
function wallRecord(id: string, s: [number, number], e: [number, number], levelId: string): WallData {
    const y = LEVELS.find(l => l.id === levelId)!.elevation;
    return {
        id, type: 'wall', levelId, properties: {}, childrenIds: [],
        baseLine: [{ x: s[0], y, z: s[1] }, { x: e[0], y, z: e[1] }],
        height: 3, thickness: 0.2, baseOffset: 0, openings: [],
        metadata: { createdAt: ++seq, modifiedAt: seq, createdBy: 'test', version: 1 },
    } as unknown as WallData;
}

/** The slab's authored sketch: edge i references walls[i]'s CENTRELINE at offset 0 —
 *  the shape `SlabRegionTracer` / `pickWallsSketch` produce in production. */
function slabSketchOn(wallIds: readonly string[]): SlabSketch {
    return {
        outerLoop: {
            edges: CENTRELINE.map((p, i) => {
                const q = CENTRELINE[(i + 1) % CENTRELINE.length]!;
                return {
                    type: 'hostReference' as const,
                    hostId: wallIds[i]!,
                    hostType: 'wall' as const,
                    reference: 'centerLine' as const,
                    offset: 0,
                    fallback: { start: { x: p.x, y: p.z }, end: { x: q.x, y: q.z } },
                };
            }),
        },
    };
}

interface World {
    wallStore: WallStore;
    slabStore: SlabStore;
    floorStore: FloorStore;
    ceilingStore: CeilingStore;
    cm: CommandManager;
    ctx: CommandContext;
    dispose(): void;
}

function makeWorld(): World {
    const bimManager = makeBimManager();
    const projectContext = new ProjectContext();
    const wallStore = new WallStore(
        projectContext,
        { getLevelById: bimManager.getLevelById, getLevels: bimManager.getLevels } as unknown as ConstructorParameters<typeof WallStore>[1],
    );
    const slabStore = new SlabStore();
    const floorStore = new FloorStore();
    const ceilingStore = new CeilingStore();

    // Rooms are NOT duplicated by any command in this repo — the room lives on the
    // SOURCE level only. That is precisely why the duplicate cannot re-derive the
    // finish sketch from `hostRoomId` and must carry it, remapped.
    const roomStore = {
        getById: (id: string) => (id === ROOM
            ? { id: ROOM, levelId: SRC, boundary: { polygon: CENTRELINE.map(p => ({ ...p })) }, boundingWallIds: WALLS.map(([w]) => w) }
            : undefined),
        getAll: () => [],
    };

    const ctx = {
        bimManager,
        projectContext,
        stores: {
            wallStore, slabStore, floorStore, ceilingStore, roomStore,
            columnStore: { getAll: () => [], get: () => undefined, remove: () => undefined },
            furnitureStore: { getAll: () => [], getById: () => undefined, remove: () => undefined },
        },
    } as unknown as CommandContext;

    const cm = new CommandManager(ctx);

    // WallFaceResolver reads this global in production (WallFaceResolver.ts:71).
    Object.assign(window, { wallStore });

    for (const [id, s, e] of WALLS) wallStore.add(wallRecord(id, s, e, SRC));

    // ── THE PRODUCTION WIRING, initTools.ts:855-900 in shape ─────────────────
    const cmRef = { current: cm as never };
    const finishGeometry = { resolver: WallFaceResolver, intersector: SketchLoopIntersector };
    const floorTracker = new FloorHostDependencyTracker(
        floorStore as never, wallStore as never, finishGeometry, cmRef,
        (p: FinishBoundaryWritePayload) => new UpdateFloorBoundaryCommand({
            floorId: p.elementId, mode: p.mode, polygon: p.polygon as never,
            outerLoopEdges: p.outerLoopEdges as never, cause: p.cause,
        }),
    );
    const ceilingTracker = new CeilingHostDependencyTracker(
        ceilingStore as never, wallStore as never, finishGeometry, cmRef,
        (p: FinishBoundaryWritePayload) => new UpdateCeilingBoundaryCommand({
            ceilingId: p.elementId, mode: p.mode, polygon: p.polygon as never,
            outerLoopEdges: p.outerLoopEdges as never, cause: p.cause,
        }),
    );
    const slabTracker = new SlabDependencyTracker(slabStore, wallStore as never, cmRef as never);

    // ── The SOURCE storey, built by the REAL create commands ─────────────────
    const slabCmd = new CreateSlabCommand({
        id: 'slab-src', ifcGuid: 'guid-slab-src',
        width: 6, depth: 4, thickness: 0.25,
        position: { x: 3, y: 0, z: 2 },
        levelId: SRC,
        polygon: CENTRELINE.map(p => ({ x: p.x, y: p.z })),
        sketch: slabSketchOn(WALLS.map(([w]) => w)),
    });
    slabCmd.execute(ctx);

    // `boundarySource` is deliberately OMITTED so the command INFERS a room-derived
    // ring and applies the L-240 inner-face inset — the production authoring path.
    new CreateFloorCommand({
        floorId: 'floor-src', ifcGuid: 'guid-floor-src',
        polygon: CENTRELINE.map(p => ({ x: p.x, z: p.z })) as never,
        levelId: SRC, hostRoomId: ROOM, hostSlabId: 'slab-src', label: 'Floor-src',
    }).execute(ctx);

    new CreateCeilingCommand({
        ceilingId: 'ceil-src', ifcGuid: 'guid-ceil-src',
        polygon: CENTRELINE.map(p => ({ x: p.x, z: p.z })) as never,
        height: 2.7, levelId: SRC, hostRoomId: ROOM, label: 'Ceiling-src',
    }).execute(ctx);

    // bootstrap AFTER the source storey exists, exactly as initTools does at wiring.
    floorTracker.bootstrap();
    ceilingTracker.bootstrap();
    slabTracker.bootstrap();

    return {
        wallStore, slabStore, floorStore, ceilingStore, cm, ctx,
        dispose() {
            floorTracker.dispose();
            ceilingTracker.dispose();
            slabTracker.dispose();
            Object.assign(window, { wallStore: undefined });
        },
    };
}

// ── measurement helpers — the STORED record, never a reported number ─────────

const areaXZ = (ring: ReadonlyArray<{ x: number; z: number }>): number => {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!, q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a / 2);
};
const areaXY = (ring: ReadonlyArray<{ x: number; y: number }>): number =>
    areaXZ(ring.map(p => ({ x: p.x, z: p.y })));

const floorsOn = (w: World, lvl: string): FloorData[] => w.floorStore.getAll().filter(f => f.levelId === lvl);
const ceilingsOn = (w: World, lvl: string): CeilingData[] => w.ceilingStore.getAll().filter(c => c.levelId === lvl);
const slabsOn = (w: World, lvl: string): SlabData[] => w.slabStore.getAll().filter(s => s.levelId === lvl);

/** Every wall id a record's authored host references name. `null` = no sketch at
 *  all — the relationship was never recorded (§NO-EMPTY-MEANS-UNKNOWN: a different
 *  fact from a recorded sketch that attributes to nothing). */
function hostIdsOf(rec: { sketch?: { outerLoop: { edges: ReadonlyArray<{ type: string; hostId?: string }> } } }): string[] | null {
    if (!rec.sketch) return null;
    return rec.sketch.outerLoop.edges.filter(e => e.type === 'hostReference').map(e => e.hostId!);
}

/** Drive a whole-wall translation through the REAL move command + REAL history. */
function moveWall(w: World, id: string, dx: number, dz: number) {
    const wall = w.wallStore.getById(id)!;
    return w.cm.execute(new UpdateWallBaselineCommand({
        wallId: id,
        newBaseLine: [
            { x: wall.baseLine[0].x + dx, y: wall.baseLine[0].y, z: wall.baseLine[0].z + dz },
            { x: wall.baseLine[1].x + dx, y: wall.baseLine[1].y, z: wall.baseLine[1].z + dz },
        ],
    }));
}

/** THE gesture under test — the real command, through the real history. */
function duplicate(w: World) {
    return w.cm.execute(new DuplicateFloorPlanCommand({ sourceLevelId: SRC, targetLevelIds: [TGT] }));
}

/** The duplicated wall that occupies the SAME line as source `srcId`. Found by
 *  geometry because the duplicate mints its own ids — this is the TEST reading
 *  the result, never the fix's own bookkeeping vouching for itself. */
function twinWall(w: World, srcId: string): WallData {
    const src = w.wallStore.getById(srcId)!;
    const twin = w.wallStore.getByLevel(TGT).find(t =>
        Math.abs(t.baseLine[0].x - src.baseLine[0].x) < 1e-9 &&
        Math.abs(t.baseLine[0].z - src.baseLine[0].z) < 1e-9 &&
        Math.abs(t.baseLine[1].x - src.baseLine[1].x) < 1e-9 &&
        Math.abs(t.baseLine[1].z - src.baseLine[1].z) < 1e-9);
    if (!twin) throw new Error(`No duplicated twin of "${srcId}" on ${TGT}`);
    return twin;
}

let world: World;
const logs: string[] = [];
let realWarn: typeof console.warn;
let realLog: typeof console.log;

beforeEach(() => {
    realWarn = console.warn; realLog = console.log;
    logs.length = 0;
    console.warn = (...a: unknown[]) => { logs.push(a.map(String).join(' ')); };
    console.log = (...a: unknown[]) => { logs.push(a.map(String).join(' ')); };
    world = makeWorld();
});

afterEach(() => {
    world.dispose();
    console.warn = realWarn; console.log = realLog;
});

// ════════════════════════════════════════════════════════════════════════════
// §0 — the premise. If the SOURCE storey does not follow, every arm below is
//      measuring the wrong thing.
// ════════════════════════════════════════════════════════════════════════════

describe('L-949 §0 — the source storey follows (the premise)', () => {
    it('all four families are authored with host references, and a source wall move moves slab + floor + ceiling', () => {
        expect(hostIdsOf(slabsOn(world, SRC)[0]!)).toEqual(['w-south', 'w-east', 'w-north', 'w-west']);
        expect(hostIdsOf(floorsOn(world, SRC)[0]!)).toHaveLength(4);
        expect(hostIdsOf(ceilingsOn(world, SRC)[0]!)).toHaveLength(4);

        const slabBefore = areaXY(slabsOn(world, SRC)[0]!.polygon!);
        const floorBefore = areaXZ(floorsOn(world, SRC)[0]!.boundary.polygon);
        const ceilBefore = areaXZ(ceilingsOn(world, SRC)[0]!.boundary.polygon);

        moveWall(world, 'w-north', 0, 2);

        expect(areaXY(slabsOn(world, SRC)[0]!.polygon!)).not.toBeCloseTo(slabBefore, 6);
        expect(areaXZ(floorsOn(world, SRC)[0]!.boundary.polygon)).not.toBeCloseTo(floorBefore, 6);
        expect(areaXZ(ceilingsOn(world, SRC)[0]!.boundary.polygon)).not.toBeCloseTo(ceilBefore, 6);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §1 — DEFECT ONE. The finishes are not in the duplication loop at all.
// ════════════════════════════════════════════════════════════════════════════

describe('L-949 §1 — duplication CREATES the floor finish and the ceiling', () => {
    it('duplicating L0 → L1 puts a slab, a floor finish AND a ceiling on L1', () => {
        expect(duplicate(world).success).toBe(true);

        expect(slabsOn(world, TGT)).toHaveLength(1);
        // THE DEFECT: `DuplicateFloorPlanCommand` reads wall/slab/column/furniture
        // and never floorStore/ceilingStore, so both of these read 0 pre-fix.
        expect(floorsOn(world, TGT)).toHaveLength(1);
        expect(ceilingsOn(world, TGT)).toHaveLength(1);
    });

    it('the duplicated finishes land at the TARGET storey elevation, not the source one', () => {
        duplicate(world);
        // §NO-EMPTY-MEANS-UNKNOWN — read the record, and fail loudly if it is absent
        // rather than letting an optional-chain turn "never created" into "fine".
        expect(floorsOn(world, TGT)[0]!.levelId).toBe(TGT);
        expect(ceilingsOn(world, TGT)[0]!.levelId).toBe(TGT);
        // Geometry is authored in the level's own frame; the storey Y comes from
        // levelId, so the plan ring must be IDENTICAL to the source's.
        expect(areaXZ(floorsOn(world, TGT)[0]!.boundary.polygon))
            .toBeCloseTo(areaXZ(floorsOn(world, SRC)[0]!.boundary.polygon), 9);
        expect(areaXZ(ceilingsOn(world, TGT)[0]!.boundary.polygon))
            .toBeCloseTo(areaXZ(ceilingsOn(world, SRC)[0]!.boundary.polygon), 9);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §2 — DEFECT TWO, AND THE ONE THAT MAKES §1 ALONE WORSE THAN NOTHING. The
//      duplicated elements must carry a WORKING host binding to the NEW level's
//      walls — proven by moving a wall ON THE DUPLICATED LEVEL.
// ════════════════════════════════════════════════════════════════════════════

// §2a is deliberately SEPARATE from §2b and asserts ONLY the slab — the one family
// duplication already copies. It is the arm that proves defect TWO exists on its
// own, independent of defect ONE: if the finishes were merely missing, this arm
// would pass. It does not. Keeping them fused would let a §1-only fix read as
// progress while the slab stayed inert.
describe('L-949 §2a — the COPIED slab crosses over with its binding INTACT (defect two, alone)', () => {
    it('the duplicated slab carries a sketch, and every host reference names a TARGET wall', () => {
        duplicate(world);

        const slab = slabsOn(world, TGT)[0];
        expect(slab, 'no slab was duplicated at all — this is defect ONE, not defect two').toBeDefined();

        const ids = hostIdsOf(slab!);
        // `null` = `sketch` was dropped on the way across. The slab is then in
        // NEITHER SlabDependencyTracker's graph NOR SlabWallConnectivityService's,
        // both of which key on `sketch.outerLoop.edges[].hostId` and return early
        // on `if (!slab.sketch) return;`.
        expect(ids, 'slab crossed over with `sketch` DROPPED — it is in no dependency graph and can never follow anything').not.toBeNull();
        expect(ids).toHaveLength(4);

        const targetWallIds = new Set(world.wallStore.getByLevel(TGT).map(w => w.id));
        for (const id of ids!) {
            expect(targetWallIds.has(id), `slab references "${id}", which is not a ${TGT} wall`).toBe(true);
        }
    });

    it('moving a duplicated wall re-projects the duplicated slab', () => {
        duplicate(world);
        const before = areaXY(slabsOn(world, TGT)[0]!.polygon!);

        moveWall(world, twinWall(world, 'w-north').id, 0, 2);

        expect(areaXY(slabsOn(world, TGT)[0]!.polygon!), 'slab did not follow its own level\'s wall')
            .not.toBeCloseTo(before, 6);
    });
});

describe('L-949 §2b — a wall move on the DUPLICATED level moves slab, floor AND ceiling', () => {
    it('every duplicated element references only TARGET-level walls', () => {
        duplicate(world);

        const targetWallIds = new Set(world.wallStore.getByLevel(TGT).map(w => w.id));
        expect(targetWallIds.size).toBe(4);

        for (const [kind, ids] of [
            ['slab', hostIdsOf(slabsOn(world, TGT)[0]!)],
            ['floor', hostIdsOf(floorsOn(world, TGT)[0]!)],
            ['ceiling', hostIdsOf(ceilingsOn(world, TGT)[0]!)],
        ] as const) {
            // `null` = no sketch was written at all. That is the pre-fix slab, and
            // it is a DIFFERENT failure from a sketch pointing at the wrong walls —
            // both are wrong, and the message must not collapse them.
            expect(ids, `${kind}: no sketch recorded — the relationship was never carried`).not.toBeNull();
            expect(ids, `${kind}: host references`).toHaveLength(4);
            for (const id of ids!) {
                expect(targetWallIds.has(id), `${kind} references "${id}", which is not a ${TGT} wall`).toBe(true);
            }
        }
    });

    it('moving a duplicated wall re-projects the duplicated slab, floor finish and ceiling', () => {
        duplicate(world);

        const slabBefore = areaXY(slabsOn(world, TGT)[0]!.polygon!);
        const floorBefore = areaXZ(floorsOn(world, TGT)[0]!.boundary.polygon);
        const ceilBefore = areaXZ(ceilingsOn(world, TGT)[0]!.boundary.polygon);

        moveWall(world, twinWall(world, 'w-north').id, 0, 2);

        expect(areaXY(slabsOn(world, TGT)[0]!.polygon!), 'slab did not follow').not.toBeCloseTo(slabBefore, 6);
        expect(areaXZ(floorsOn(world, TGT)[0]!.boundary.polygon), 'floor finish did not follow').not.toBeCloseTo(floorBefore, 6);
        expect(areaXZ(ceilingsOn(world, TGT)[0]!.boundary.polygon), 'ceiling did not follow').not.toBeCloseTo(ceilBefore, 6);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §3 — THE MIRROR HAZARD. The trackers key on `hostId` alone and consult no
//      level, so a carried-over (un-remapped) reference makes an L1 finish
//      follow an L0 wall. Both directions are asserted.
// ════════════════════════════════════════════════════════════════════════════

describe('L-949 §3 — the two storeys are independent after duplication', () => {
    it('moving a SOURCE wall leaves every duplicated element untouched', () => {
        duplicate(world);

        const slabBefore = areaXY(slabsOn(world, TGT)[0]!.polygon!);
        const floorBefore = areaXZ(floorsOn(world, TGT)[0]!.boundary.polygon);
        const ceilBefore = areaXZ(ceilingsOn(world, TGT)[0]!.boundary.polygon);

        moveWall(world, 'w-north', 0, 2);

        expect(areaXY(slabsOn(world, TGT)[0]!.polygon!)).toBeCloseTo(slabBefore, 9);
        expect(areaXZ(floorsOn(world, TGT)[0]!.boundary.polygon)).toBeCloseTo(floorBefore, 9);
        expect(areaXZ(ceilingsOn(world, TGT)[0]!.boundary.polygon)).toBeCloseTo(ceilBefore, 9);
    });

    it('moving a TARGET wall leaves every source element untouched', () => {
        duplicate(world);

        const slabBefore = areaXY(slabsOn(world, SRC)[0]!.polygon!);
        const floorBefore = areaXZ(floorsOn(world, SRC)[0]!.boundary.polygon);
        const ceilBefore = areaXZ(ceilingsOn(world, SRC)[0]!.boundary.polygon);

        moveWall(world, twinWall(world, 'w-north').id, 0, 2);

        expect(areaXY(slabsOn(world, SRC)[0]!.polygon!)).toBeCloseTo(slabBefore, 9);
        expect(areaXZ(floorsOn(world, SRC)[0]!.boundary.polygon)).toBeCloseTo(floorBefore, 9);
        expect(areaXZ(ceilingsOn(world, SRC)[0]!.boundary.polygon)).toBeCloseTo(ceilBefore, 9);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §4 — UNDO. Everything the duplicate created, it removes — including the two
//      families §1 adds. A duplicate that leaves orphan finishes behind is a new
//      defect wearing the fix's name.
// ════════════════════════════════════════════════════════════════════════════

describe('L-949 §4 — one Ctrl+Z removes everything the duplicate created', () => {
    it('undo leaves L1 empty of walls, slabs, floors and ceilings', () => {
        duplicate(world);
        expect(floorsOn(world, TGT).length + ceilingsOn(world, TGT).length).toBeGreaterThan(0);

        world.cm.undo();

        expect(world.wallStore.getByLevel(TGT)).toHaveLength(0);
        expect(slabsOn(world, TGT)).toHaveLength(0);
        expect(floorsOn(world, TGT)).toHaveLength(0);
        expect(ceilingsOn(world, TGT)).toHaveLength(0);
        // …and the source storey is untouched by the round trip.
        expect(floorsOn(world, SRC)).toHaveLength(1);
        expect(ceilingsOn(world, SRC)).toHaveLength(1);
        expect(slabsOn(world, SRC)).toHaveLength(1);
    });
});
