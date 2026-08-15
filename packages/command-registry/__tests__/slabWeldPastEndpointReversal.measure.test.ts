// §MEASURED-FATAL-REVERSAL — ISSUE-LOG L-925, the MEASUREMENT, taken BEFORE the fix.
//
// WHAT THE FOUNDER REPORTED (deploy 9abee8f9)
// ----------------------------------------------------------------------------
//   "Whenever I move a wall WITHOUT passing the previous wall boundary it's fine
//    — everything adapted. If I SURPASS the segment of the wall connected to the
//    moving wall — the wall moves, the slab adapts properly, but NONE of the
//    connected walls behaved as expected."
//
// Their console carries the mechanism:
//
//   [CommandManager] FATAL ERROR DURING EXECUTION BaselineReversalError:
//     [WallStore.update] §WALL-DEEP-2026 B2 — refusing to reverse baseLine
//     direction on wall …DJE64 which hosts 1 opening(s). …
//       at CASCADE_WALL_BASELINE.execute … at _dispatchCascade … at onWallUpdated
//
// WHY THIS FILE EXISTS, AND WHY IT LANDS ALONE
// ----------------------------------------------------------------------------
// The guard is CORRECT — a silent reversal re-measures every hosted opening from
// the wrong endpoint (C15 §2), which is L-916 one keystroke later. The DEFECT is
// the caller: `SlabWallConnectivityService._dispatchCascade` implements NEITHER
// of the two continuations the guard's own message prints. It throws from inside
// a store subscriber, mid-gesture, with the moved wall already committed.
//
// ⚠ ONE CORRECTION THE MEASUREMENT FORCED, recorded because guessing it wrong
// would have mis-aimed the fix. The throw does NOT escape to the top of the
// stack: `CommandManager.execute` has a generic catch that logs
// `FATAL ERROR DURING EXECUTION` and rolls the CASCADE back. So what the founder
// actually gets is not a crash dialog — it is worse and quieter:
//
//   · the user's own `UPDATE_WALL_BASELINE` returns `{ success: true }`,
//   · the cascade returns `{ success: false }` **to a caller that never looks**,
//   · the wall stands where it was dragged and NOT ONE partner followed,
//   · and the only trace is a console line no user reads.
//
// That is a HALF-EXECUTED GESTURE (the §MEASURED-HALF-EXECUTED family, L-921) and
// it is why "wrap it in try/catch" is not the fix on its own: the refusal is
// ALREADY being swallowed. The fix must make the weld LEGAL where the geometry
// is legal, and make the residual refusal REACH A PERSON.
//
// This file pins the defect as it stands, so the fix that follows is measured
// against a recorded state rather than against a memory of one. It asserts what
// IS, not what SHOULD BE: every expectation below is expected to CHANGE when the
// fix lands, and the ones that must NOT change are marked CONTROL.
//
// Two rows, and the second is the more important one:
//
//   §MEASURED-FATAL-REVERSAL — move PAST the partner's far endpoint. The throw
//     propagates out of the user's own `cm.execute()`, and the end state of the
//     model is recorded in full: moved-wall position, partner baselines, door
//     offset, room/loop closure.
//
//   §CONTROL-WITHIN-EXTENT — the same gesture, stopping SHORT of the partner's
//     far endpoint. The founder explicitly likes this behaviour. Its numbers are
//     pinned to the millimetre so the fix cannot buy the past-endpoint case by
//     spending the case that already works.
//
// REAL, imported from production, never re-implemented: WallStore (geometry-wall),
// SlabStore + SlabWallConnectivityService + traceRegionSketchAtPoint
// (geometry-slab), CommandManager + UpdateWallBaselineCommand +
// CreateWallOpeningCommand + CascadeWallBaselineCommand (command-registry).
// Harness shape is `hostedOpeningHostMoveSeam.test.ts`'s, deliberately — a
// divergence here is then a divergence in the SUBJECT, not in the fixture.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { WallStore } from '@pryzm/geometry-wall';
import type { WallData, Opening } from '@pryzm/geometry-wall';
import {
    SlabStore,
    SlabWallConnectivityService,
    traceRegionSketchAtPoint,
    type RegionWallLike,
    type SlabData,
    type SlabSketch,
} from '@pryzm/geometry-slab';
import { ProjectContext, semanticGraphManager } from '@pryzm/core-app-model';
import { doorStore } from '@pryzm/geometry-door';
import { windowStore } from '@pryzm/geometry-window';

import { CommandManager } from '../src/CommandManagerImpl';
import type { CommandContext } from '../src/types';
import { UpdateWallBaselineCommand } from '../src/walls/UpdateWallBaselineCommand';
import { CreateWallOpeningCommand } from '../src/walls/CreateWallOpeningCommand';

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
    const registered = new Set<string>();
    const level = { id: LEVEL, name: 'Ground', elevation: 0, height: 3, childrenIds: [] as string[] };
    return {
        registered,
        getLevels: () => [level],
        getLevelById: (id: string) => (id === LEVEL ? level : undefined),
        registerElement: (id: string) => { registered.add(id); },
        unregisterElement: (id: string) => { registered.delete(id); },
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

function regionSlab(id: string, sketch: SlabSketch, ring: { x: number; y: number }[]): SlabData {
    return {
        id, type: 'slab', levelId: LEVEL, thickness: 0.2,
        position: { x: 0, y: 0, z: 0 }, polygon: ring, sketch,
        ifcData: { guid: `guid-${id}`, ifcClass: 'IfcSlab' },
    } as unknown as SlabData;
}

/**
 * What the service's OWN dispatch seam saw. The service calls
 * `commandManager.execute(...)` and — this is the finding — never reads what
 * comes back. Recording it here is not instrumentation of the fix, it is the
 * measurement: it is the value that exists, is negative, and is discarded.
 */
interface CascadeObservation {
    cause: string;
    entries: Array<{ wallId: string; from: [number, number][]; to: [number, number][] }>;
    resultSuccess: boolean | null;
    resultError: string | null;
    threw: string | null;
}

interface World {
    wallStore: WallStore;
    slabStore: SlabStore;
    cm: CommandManager;
    cascades: CascadeObservation[];
    dispose(): void;
}

function makeWorld(): World {
    const wallStore = new WallStore(
        new ProjectContext(),
        makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
    );
    const slabStore = new SlabStore();

    const ctx = {
        stores: { wallStore, slabStore },
        bimManager: makeBimManager(),
    } as unknown as CommandContext;
    const cm = new CommandManager(ctx);

    Object.assign(window, { wallStore });   // WallFaceResolver reads this global

    // The recording facade sits exactly where the service's `CommandManagerRef`
    // sits — same shape, same two methods — so nothing about the production path
    // changes; the return value simply stops being invisible.
    const cascades: CascadeObservation[] = [];
    const pts = (b: readonly { x: number; z: number }[]): [number, number][] =>
        [[b[0].x, b[0].z], [b[1].x, b[1].z]];
    const recording = {
        execute: (command: never, metadata?: never) => {
            const cmd = command as unknown as {
                serialize?: () => { payload?: { cause?: string; entries?: unknown[] } };
            };
            const payload = cmd.serialize?.().payload;
            const obs: CascadeObservation = {
                cause: payload?.cause ?? '(none)',
                entries: ((payload?.entries ?? []) as Array<{
                    wallId: string; newBaseLine: { x: number; z: number }[];
                }>).map(e => ({
                    wallId: e.wallId,
                    from: pts(wallStore.getById(e.wallId)!.baseLine),
                    to: pts(e.newBaseLine),
                })),
                resultSuccess: null, resultError: null, threw: null,
            };
            cascades.push(obs);
            try {
                const r = cm.execute(command, metadata) as {
                    success?: boolean; error?: string;
                };
                obs.resultSuccess = r?.success ?? null;
                obs.resultError = r?.error ?? null;
                return r;
            } catch (err) {
                obs.threw = String(err);
                throw err;
            }
        },
        isReverting: () => cm.isReverting(),
    };

    const slabService = new SlabWallConnectivityService(
        slabStore,
        wallStore as unknown as ConstructorParameters<typeof SlabWallConnectivityService>[1],
        () => false,
        recording as unknown as ConstructorParameters<typeof SlabWallConnectivityService>[3],
    );
    slabService.bootstrap();

    return {
        wallStore, slabStore, cm, cascades,
        dispose() {
            slabService.dispose();
            Object.assign(window, { wallStore: undefined });
        },
    };
}

const asRegionWalls = (ws: WallStore): RegionWallLike[] =>
    ws.getAll().map(w => ({ id: w.id, baseLine: w.baseLine.map(p => ({ x: p.x, z: p.z })) }));

function seedJoinedTo(
    wallIds: string[],
    junctions: Array<{ type: 'L' | 'T'; wallIds: [string, string] }>,
): void {
    semanticGraphManager.replaceJoinedToForLevelWalls(
        wallIds,
        junctions.map(j => ({
            junctionType: j.type,
            junctionDegree: j.type === 'L' ? 2 : 3,
            wallIds: j.wallIds,
        })),
    );
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

const bl2 = (world: World, id: string): [number, number][] => {
    const b = world.wallStore.getById(id)!.baseLine;
    return [[b[0].x, b[0].z], [b[1].x, b[1].z]];
};

const dirXZ = (world: World, id: string): [number, number] => {
    const b = world.wallStore.getById(id)!.baseLine;
    return [b[1].x - b[0].x, b[1].z - b[0].z];
};

const lengthOf = (world: World, id: string): number => {
    const d = dirXZ(world, id);
    return Math.hypot(d[0], d[1]);
};

const openingsOf = (world: World, wallId: string): Opening[] =>
    (world.wallStore.getById(wallId)!.openings ?? []) as Opening[];

/** Place a door through the REAL creation command; return its minted elementId. */
function addDoor(world: World, wallId: string, offset: number, width = 0.9): string {
    const before = new Set(openingsOf(world, wallId).map(o => o.elementId));
    const res = world.cm.execute(new CreateWallOpeningCommand({
        wallId,
        openingData: {
            type: 'door', offset, width, height: 2.1, sillHeight: 0, doorType: 'single',
        },
    }));
    expect(res.success).toBe(true);
    const created = openingsOf(world, wallId).find(o => !before.has(o.elementId))!;
    expect(created).toBeDefined();
    return created.elementId as string;
}

const LOOP_ORDER = ['w-south', 'w-east', 'w-north', 'w-west'] as const;

/**
 * Which endpoint of wall i is welded to which endpoint of wall i+1, recorded
 * from the UNDISTURBED loop.
 *
 * A metric that just takes the NEAREST endpoint pair reads the wrong corner once
 * a wall travels far: at +7 m the moved w-west passes so close to w-north's
 * *other* end that "nearest" reports a 1.000 m gap for a corner that is actually
 * open by 7.000 m. So the corner is pinned by IDENTITY — the endpoint indices
 * that were coincident before the gesture — and those same indices are measured
 * afterwards. That question ("did THIS corner open?") is the one the founder is
 * asking, and it has one answer regardless of how far anything moved.
 */
type CornerMap = Array<[0 | 1, 0 | 1]>;

function authoredCorners(world: World): CornerMap {
    const map: CornerMap = [];
    for (let i = 0; i < LOOP_ORDER.length; i++) {
        const a = world.wallStore.getById(LOOP_ORDER[i])!.baseLine;
        const b = world.wallStore.getById(LOOP_ORDER[(i + 1) % LOOP_ORDER.length])!.baseLine;
        let best: [0 | 1, 0 | 1] = [1, 0];
        let d = Infinity;
        for (const ia of [0, 1] as const) {
            for (const ib of [0, 1] as const) {
                const dd = Math.hypot(a[ia].x - b[ib].x, a[ia].z - b[ib].z);
                if (dd < d) { d = dd; best = [ia, ib]; }
            }
        }
        map.push(best);
    }
    return map;
}

/** Gap in mm at each authored corner, in `LOOP_ORDER` sequence. */
function openCornersMm(world: World, corners: CornerMap): number[] {
    return corners.map(([ia, ib], i) => {
        const a = world.wallStore.getById(LOOP_ORDER[i])!.baseLine;
        const b = world.wallStore.getById(LOOP_ORDER[(i + 1) % LOOP_ORDER.length])!.baseLine;
        return Math.round(Math.hypot(a[ia].x - b[ib].x, a[ia].z - b[ib].z) * 1000);
    });
}

/**
 * The room, as an AREA — the shoelace over the four authored corners (each read
 * as the midpoint of its endpoint pair, so a small residual gap does not make
 * the polygon undefined). The cheapest honest reading of "is there still a room
 * here". m², rounded to mm².
 */
function enclosedAreaM2(world: World, corners: CornerMap): number {
    const pts = corners.map(([ia, ib], i) => {
        const a = world.wallStore.getById(LOOP_ORDER[i])!.baseLine;
        const b = world.wallStore.getById(LOOP_ORDER[(i + 1) % LOOP_ORDER.length])!.baseLine;
        return { x: (a[ia].x + b[ib].x) / 2, z: (a[ia].z + b[ib].z) / 2 };
    });
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        s += p.x * q.z - q.x * p.z;
    }
    return Math.round(Math.abs(s / 2) * 1e6) / 1e6;
}

// ── the founder's ground: a 6×4 perimeter loop, door on the south wall ───────
//
//   w-south [0,0]→[6,0]   w-east [6,0]→[6,4]
//   w-north [6,4]→[0,4]   w-west [0,4]→[0,0]
//
// w-west is the wall the founder drags, perpendicular to itself (+x). Its two
// slab-loop partners are w-south and w-north, and the corner it shares with each
// slides ALONG that partner's own axis — legal while it stays inside the
// partner's extent, a REVERSAL the moment it goes past the far end.
//
// The door sits on w-south, whose welded endpoint is baseLine[**0**] — the
// endpoint C15 §2 measures every offset from. That asymmetry is deliberate: it
// is the wall the founder's console names as hosting 1 opening.

function buildLoop(world: World): void {
    world.wallStore.add(wallRecord('w-south', [0, 0], [6, 0]));
    world.wallStore.add(wallRecord('w-east', [6, 0], [6, 4]));
    world.wallStore.add(wallRecord('w-north', [6, 4], [0, 4]));
    world.wallStore.add(wallRecord('w-west', [0, 4], [0, 0]));
    const traced = traceRegionSketchAtPoint(asRegionWalls(world.wallStore), 3, 2)!;
    expect(traced, 'the 6x4 loop must trace a region for the slab').not.toBeNull();
    world.slabStore.add(regionSlab('slab-loop', traced.sketch, traced.ring));
    seedJoinedTo(
        ['w-south', 'w-east', 'w-north', 'w-west'],
        [
            { type: 'L', wallIds: ['w-south', 'w-east'] },
            { type: 'L', wallIds: ['w-east', 'w-north'] },
            { type: 'L', wallIds: ['w-north', 'w-west'] },
            { type: 'L', wallIds: ['w-west', 'w-south'] },
        ],
    );
}

let world: World | undefined;

beforeEach(() => {
    semanticGraphManager.clear();
    for (const d of doorStore.getAll()) doorStore.remove(d.id);
    for (const w of windowStore.getAll()) windowStore.remove(w.id);
});

afterEach(() => {
    world?.dispose();
    world = undefined;
});

// ════════════════════════════════════════════════════════════════════════════
// §CONTROL-WITHIN-EXTENT — the case that WORKS, pinned so it cannot be spent
// ════════════════════════════════════════════════════════════════════════════

describe('§CONTROL-WITHIN-EXTENT — moving w-west +3 m, stopping short of w-south\'s far end', () => {
    it('completes; both partners follow at the new corner, direction and door offset intact', () => {
        world = makeWorld();
        buildLoop(world);
        addDoor(world, 'w-south', 2.0);
        const corners = authoredCorners(world);

        const res = moveWall(world, 'w-west', 3, 0);
        expect(res.success, 'the within-extent move must succeed').toBe(true);

        // The moved wall is where the user put it.
        expect(bl2(world, 'w-west')).toEqual([[3, 4], [3, 0]]);

        // Both partners followed: the shared corner slid ALONG their own axis and
        // their far endpoints did not move.
        expect(bl2(world, 'w-south')).toEqual([[3, 0], [6, 0]]);
        expect(bl2(world, 'w-north')).toEqual([[6, 4], [3, 4]]);

        // Direction preserved on both — nothing reversed.
        expect(dirXZ(world, 'w-south')[0]).toBeGreaterThan(0);
        expect(dirXZ(world, 'w-north')[0]).toBeLessThan(0);

        // Lengths: 6 → 3 on both partners.
        expect(lengthOf(world, 'w-south')).toBeCloseTo(3, 9);
        expect(lengthOf(world, 'w-north')).toBeCloseTo(3, 9);

        // The loop is still closed: every authored corner still coincident.
        expect(openCornersMm(world, corners)).toEqual([0, 0, 0, 0]);
        // …and it still encloses a room: 3 m × 4 m.
        expect(enclosedAreaM2(world, corners)).toBeCloseTo(12, 6);

        // The door: it stays hosted and in bounds (C15 §5).
        const door = openingsOf(world, 'w-south')[0];
        expect(door, 'the door must still be hosted on w-south').toBeDefined();
        expect(door.offset).toBeGreaterThanOrEqual(0);
        expect(door.offset + door.width).toBeLessThanOrEqual(lengthOf(world, 'w-south') + 1e-9);
        // PINNED AS MEASURED, and it is NOT ideal: the door was authored at
        // offset 2.0 from x=0 (world centre x=2.45). The origin moved to x=3, so
        // the rebased offset is negative and the store CLAMPS it to 0 — the door
        // ends up at world x=3.45, a 1.0 m silent teleport. That is C83 §10.2.4's
        // named "a clamp standing where a refusal belongs", it is PRE-EXISTING,
        // and it is deliberately NOT changed by L-925: the founder asked for this
        // gesture to keep working and this row exists to prove it still does.
        // Logged here so the next lane finds it already measured.
        expect(door.offset).toBeCloseTo(0, 6);

        // The cascade the service dispatched succeeded, and its own return value
        // says so — the value the service discards.
        expect(world.cascades.length).toBe(1);
        expect(world.cascades[0].cause).toBe('slab-connectivity');
        expect(world.cascades[0].resultSuccess).toBe(true);
        expect(world.cascades[0].threw).toBeNull();
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §MEASURED-FATAL-REVERSAL — the founder's defect, recorded as it stands
// ════════════════════════════════════════════════════════════════════════════

describe('§MEASURED-FATAL-REVERSAL — moving w-west +7 m, PAST w-south\'s far end at x=6', () => {
    it('records what the gesture does today: throw or refusal, and the model state it leaves', () => {
        world = makeWorld();
        buildLoop(world);
        addDoor(world, 'w-south', 2.0);
        const corners = authoredCorners(world);

        let thrownToUser: unknown = null;
        let result: unknown = null;
        try {
            result = moveWall(world, 'w-west', 7, 0);
        } catch (err) {
            thrownToUser = err;
        }

        // ── THE MEASUREMENT, as one artefact ─────────────────────────────────
        const cascade = world.cascades[0];
        const observed = {
            // What the GESTURE reported. This is what any caller can see.
            gestureThrew: thrownToUser !== null,
            gestureSuccess: thrownToUser ? null : (result as { success: boolean }).success,

            // What the CASCADE reported — the value `_dispatchCascade` throws away.
            cascadeCount: world.cascades.length,
            cascadeCause: cascade?.cause ?? null,
            cascadeEntries: cascade?.entries ?? null,
            cascadeSuccess: cascade?.resultSuccess ?? null,
            cascadeErrorIsB2:
                /§WALL-DEEP-2026 B2|refusing to reverse baseLine/.test(
                    cascade?.resultError ?? cascade?.threw ?? '',
                ),
            cascadeErrorNamesTheWall: /w-south/.test(cascade?.resultError ?? ''),

            // What the MODEL is left holding.
            wWest:  bl2(world, 'w-west'),
            wSouth: bl2(world, 'w-south'),
            wNorth: bl2(world, 'w-north'),
            wEast:  bl2(world, 'w-east'),
            southDirX: dirXZ(world, 'w-south')[0],
            northDirX: dirXZ(world, 'w-north')[0],
            southLen: Number(lengthOf(world, 'w-south').toFixed(6)),
            northLen: Number(lengthOf(world, 'w-north').toFixed(6)),
            doorOffset: openingsOf(world, 'w-south')[0]?.offset ?? null,
            doorCount: openingsOf(world, 'w-south').length,
            openCornersMm: openCornersMm(world, corners),
            enclosedAreaM2: enclosedAreaM2(world, corners),
        };

        // Recorded as a single artefact so the fix's diff shows exactly which
        // facts changed, and each load-bearing one is also asserted by name so a
        // careless `-u` cannot quietly re-baseline the defect into "correct".
        expect(observed).toMatchSnapshot();

        // ── THE FOUR FACTS THAT MAKE THIS A DEFECT ───────────────────────────
        // 1. The user's gesture claims to have succeeded.
        expect(observed.gestureSuccess, 'the move reports success to its caller').toBe(true);
        // 2. A cascade WAS computed, and BOTH partners were asked to reverse.
        expect(observed.cascadeCount).toBe(1);
        expect(observed.cascadeEntries!.map(e => e.wallId).sort())
            .toEqual(['w-north', 'w-south']);
        // 3. It was refused by the B2 guard, naming the wall that hosts the door.
        expect(observed.cascadeErrorIsB2, 'the refusal is §WALL-DEEP-2026 B2').toBe(true);
        expect(observed.cascadeSuccess).toBe(false);
        // 4. And NOTHING happened as a result: the wall stands where it was
        //    dragged, both partners are exactly where they started, and the room
        //    is open by 7.000 m at BOTH welded corners.
        expect(observed.wWest).toEqual([[7, 4], [7, 0]]);
        expect(observed.wSouth).toEqual([[0, 0], [6, 0]]);
        expect(observed.wNorth).toEqual([[6, 4], [0, 4]]);
        expect(observed.openCornersMm).toEqual([0, 0, 7000, 7000]);
    });
});
