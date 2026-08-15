// §L-925-NO-FATAL — the two halves that are NOT "the weld now works":
//
//   1. UNDO/REDO across a past-endpoint weld. The door's offset must round-trip
//      EXACTLY. §L-925-DIRECTION-STABLE re-seats which physical end of the
//      partner is `baseLine[0]`, and `Opening.offset` is measured from
//      `baseLine[0]` (C15 §2) — so if anything in the restore path measured from
//      the wrong end, this is where a 4.000 m error would appear. C70 C-INV-3: a
//      move mints no new identity and undo restores the one that was there.
//
//   2. The residual REFUSALS. A weld that cannot be done legally must refuse
//      with both numbers and REACH A PERSON — never throw, never half-apply, and
//      never (the §MEASURED-FATAL-REVERSAL finding) return a negative verdict to
//      a caller that does not read it.
//
// The geometry is the founder's: a 6×4 perimeter loop with a region-traced slab
// and a door, and w-west dragged perpendicular past w-south's far end at x=6.

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
    type SlabWeldRefusal,
} from '@pryzm/geometry-slab';
import { ProjectContext, semanticGraphManager } from '@pryzm/core-app-model';
import { doorStore } from '@pryzm/geometry-door';
import { windowStore } from '@pryzm/geometry-window';

import { CommandManager } from '../src/CommandManagerImpl';
import type { CommandContext } from '../src/types';
import { UpdateWallBaselineCommand } from '../src/walls/UpdateWallBaselineCommand';
import { CreateWallOpeningCommand } from '../src/walls/CreateWallOpeningCommand';

const LEVEL = 'L0';
let seq = 0;

function wallRecord(id: string, s: [number, number], e: [number, number]): WallData {
    return {
        id, type: 'wall', levelId: LEVEL, properties: {}, childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 3, thickness: 0.2, baseOffset: 0, openings: [],
        metadata: { createdAt: ++seq, modifiedAt: seq, createdBy: 'test', version: 1 },
    } as unknown as WallData;
}

function makeLevelProvider() {
    const level = { id: LEVEL, name: 'Ground', elevation: 0, height: 3, childrenIds: [] as string[] };
    return {
        getLevelById: (id: string) => (id === LEVEL ? { ...level } : undefined),
        getLevels: () => [{ ...level }],
    };
}

interface World {
    wallStore: WallStore;
    slabStore: SlabStore;
    cm: CommandManager;
    refusals: SlabWeldRefusal[];
    dispose(): void;
}

function makeWorld(opts: { withSink: boolean }): World {
    const wallStore = new WallStore(
        new ProjectContext(),
        makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
    );
    const slabStore = new SlabStore();
    const cm = new CommandManager({
        stores: { wallStore, slabStore },
        bimManager: {
            getLevels: () => [{ id: LEVEL, name: 'Ground', elevation: 0, height: 3, childrenIds: [] }],
            getLevelById: (id: string) =>
                (id === LEVEL
                    ? { id: LEVEL, name: 'Ground', elevation: 0, height: 3, childrenIds: [] }
                    : undefined),
            registerElement: () => { /* no registry in this harness */ },
            unregisterElement: () => { /* no registry in this harness */ },
        },
    } as unknown as CommandContext);

    Object.assign(window, { wallStore });

    const refusals: SlabWeldRefusal[] = [];
    const svc = new SlabWallConnectivityService(
        slabStore,
        wallStore as unknown as ConstructorParameters<typeof SlabWallConnectivityService>[1],
        () => false,
        cm,
        opts.withSink ? (r) => { refusals.push(r); } : null,
    );
    svc.bootstrap();

    return {
        wallStore, slabStore, cm, refusals,
        dispose() {
            svc.dispose();
            Object.assign(window, { wallStore: undefined });
        },
    };
}

function buildLoop(world: World): void {
    world.wallStore.add(wallRecord('w-south', [0, 0], [6, 0]));
    world.wallStore.add(wallRecord('w-east', [6, 0], [6, 4]));
    world.wallStore.add(wallRecord('w-north', [6, 4], [0, 4]));
    world.wallStore.add(wallRecord('w-west', [0, 4], [0, 0]));
    const rw: RegionWallLike[] = world.wallStore.getAll()
        .map(w => ({ id: w.id, baseLine: w.baseLine.map(p => ({ x: p.x, z: p.z })) }));
    const traced = traceRegionSketchAtPoint(rw, 3, 2)!;
    expect(traced).not.toBeNull();
    world.slabStore.add({
        id: 'slab-loop', type: 'slab', levelId: LEVEL, thickness: 0.2,
        position: { x: 0, y: 0, z: 0 }, polygon: traced.ring, sketch: traced.sketch as SlabSketch,
        ifcData: { guid: 'g', ifcClass: 'IfcSlab' },
    } as unknown as SlabData);
    semanticGraphManager.replaceJoinedToForLevelWalls(
        ['w-south', 'w-east', 'w-north', 'w-west'],
        [
            { junctionType: 'L', junctionDegree: 2, wallIds: ['w-south', 'w-east'] },
            { junctionType: 'L', junctionDegree: 2, wallIds: ['w-east', 'w-north'] },
            { junctionType: 'L', junctionDegree: 2, wallIds: ['w-north', 'w-west'] },
            { junctionType: 'L', junctionDegree: 2, wallIds: ['w-west', 'w-south'] },
        ],
    );
}

function addDoor(world: World, wallId: string, offset: number): string {
    const before = new Set(
        ((world.wallStore.getById(wallId)!.openings ?? []) as Opening[]).map(o => o.elementId),
    );
    const res = world.cm.execute(new CreateWallOpeningCommand({
        wallId,
        openingData: {
            type: 'door', offset, width: 0.9, height: 2.1, sillHeight: 0, doorType: 'single',
        },
    }));
    expect(res.success).toBe(true);
    const created = ((world.wallStore.getById(wallId)!.openings ?? []) as Opening[])
        .find(o => !before.has(o.elementId))!;
    return created.elementId as string;
}

function moveWall(world: World, id: string, dx: number) {
    const w = world.wallStore.getById(id)!;
    return world.cm.execute(new UpdateWallBaselineCommand({
        wallId: id,
        newBaseLine: [
            { x: w.baseLine[0].x + dx, y: w.baseLine[0].y, z: w.baseLine[0].z },
            { x: w.baseLine[1].x + dx, y: w.baseLine[1].y, z: w.baseLine[1].z },
        ],
    }));
}

const bl2 = (world: World, id: string): [number, number][] => {
    const b = world.wallStore.getById(id)!.baseLine;
    return [[b[0].x, b[0].z], [b[1].x, b[1].z]];
};

const doorOf = (world: World, wallId: string): Opening | undefined =>
    ((world.wallStore.getById(wallId)!.openings ?? []) as Opening[])[0];

/**
 * The door's WORLD centre — C15 §2, evaluated exactly as `WallFragmentBuilder`
 * evaluates it. This is what the user sees, and it is the number that would
 * betray an offset measured from the wrong `baseLine[0]`.
 */
function doorWorldCentre(world: World, wallId: string): [number, number] {
    const w = world.wallStore.getById(wallId)!;
    const op = doorOf(world, wallId)!;
    const dx = w.baseLine[1].x - w.baseLine[0].x;
    const dz = w.baseLine[1].z - w.baseLine[0].z;
    const len = Math.hypot(dx, dz);
    const d = op.offset + op.width / 2;
    return [w.baseLine[0].x + (dx / len) * d, w.baseLine[0].z + (dz / len) * d];
}

let world: World | undefined;

beforeEach(() => {
    semanticGraphManager.clear();
    for (const d of doorStore.getAll()) doorStore.remove(d.id);
    for (const w of windowStore.getAll()) windowStore.remove(w.id);
    const g = globalThis as unknown as {
        __pryzmL925Refusals?: number; __pryzmL925Unsurfaced?: number;
    };
    g.__pryzmL925Refusals = 0;
    g.__pryzmL925Unsurfaced = 0;
});

afterEach(() => {
    world?.dispose();
    world = undefined;
});

// ════════════════════════════════════════════════════════════════════════════
// §L-925-UNDO — the door offset round-trips EXACTLY across the reversal case
// ════════════════════════════════════════════════════════════════════════════

describe('§L-925-UNDO — undo/redo across a past-endpoint weld', () => {
    it('restores every wall and the door offset EXACTLY, and redo re-applies it', () => {
        world = makeWorld({ withSink: true });
        buildLoop(world);
        addDoor(world, 'w-south', 2.0);

        const before = {
            south: bl2(world, 'w-south'),
            north: bl2(world, 'w-north'),
            west:  bl2(world, 'w-west'),
            offset: doorOf(world, 'w-south')!.offset,
            centre: doorWorldCentre(world, 'w-south'),
        };
        expect(before.offset).toBe(2);

        moveWall(world, 'w-west', 7);

        // The weld happened (this is §MEASURED-FATAL-REVERSAL's resolution).
        expect(bl2(world, 'w-south')).toEqual([[6, 0], [7, 0]]);
        expect(bl2(world, 'w-north')).toEqual([[7, 4], [6, 4]]);
        const afterOffset = doorOf(world, 'w-south')!.offset;

        // ── UNDO — MEASURED: it is ONE, and that is the C78 U-INV-9 result ───
        //
        // The move and the cascade it triggered are two `execute()` calls, so the
        // expectation going in was two undos. It is one: `CommandManager` takes a
        // whole-store SNAPSHOT per command (`snapshot commandType=
        // "UpdateWallBaselineCommand" scope=[wall]`), and the move's snapshot was
        // taken BEFORE the subscriber ran. Undoing the move therefore restores
        // the partners' pre-cascade baselines in the same step.
        //
        // So one gesture already IS one undo unit here (C78 U-INV-9), and the
        // count is asserted so a later lane that splits them has to say so.
        const historyBefore = world.cm.getHistory().length;
        world.cm.undo();
        expect(bl2(world, 'w-west'), 'ONE undo puts the moved wall back').toEqual(before.west);
        expect(bl2(world, 'w-south'), 'ONE undo puts the welded partner back').toEqual(before.south);
        expect(bl2(world, 'w-north'), 'ONE undo puts the welded partner back').toEqual(before.north);
        expect(world.cm.getHistory().length).toBe(historyBefore - 1);

        // THE ROW THAT MATTERS: byte-exact, not merely close. A door whose offset
        // came back as 2.0000000001 would still be a broken round-trip, and an
        // offset restored against the SWAPPED `baseLine[0]` would come back as
        // 4.000 — which is the specific error §L-925-DIRECTION-STABLE could have
        // introduced and did not.
        const restored = doorOf(world, 'w-south');
        expect(restored, 'the door is still hosted on w-south after undo').toBeDefined();
        expect(restored!.offset).toBe(before.offset);
        expect(doorWorldCentre(world, 'w-south')).toEqual(before.centre);

        // ── REDO ─────────────────────────────────────────────────────────────
        world.cm.redo();
        expect(bl2(world, 'w-west')).toEqual([[7, 4], [7, 0]]);
        expect(bl2(world, 'w-south'), 'redo replays the weld, not just the move')
            .toEqual([[6, 0], [7, 0]]);
        expect(bl2(world, 'w-north'), 'redo replays the weld, not just the move')
            .toEqual([[7, 4], [6, 4]]);
        expect(doorOf(world, 'w-south')!.offset).toBe(afterOffset);

        // …and back again, to prove the round trip is a cycle and not a one-shot.
        world.cm.undo();
        expect(bl2(world, 'w-south')).toEqual(before.south);
        expect(doorOf(world, 'w-south')!.offset).toBe(before.offset);

        // No refusal was raised on either leg — the weld is legal, so the
        // refusal path must stay silent. (Refusal ≠ emptiness, and neither is
        // "it worked": these are three distinct outcomes and only one fired.)
        expect(world.refusals).toHaveLength(0);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §L-925-NO-FATAL — the residual refusal REACHES A PERSON
// ════════════════════════════════════════════════════════════════════════════

describe('§L-925-NO-FATAL — a weld that collapses a partner refuses, out loud', () => {
    it('refuses the whole cascade, names both numbers, changes no partner, and throws nothing', () => {
        world = makeWorld({ withSink: true });
        buildLoop(world);
        addDoor(world, 'w-south', 2.0);

        const southBefore = bl2(world, 'w-south');
        const northBefore = bl2(world, 'w-north');
        const offsetBefore = doorOf(world, 'w-south')!.offset;

        // x = 6.05 puts the new corner 50 mm past w-south's far end at x = 6,
        // which would leave w-south a 50 mm stub — under the 100 mm floor.
        let threw: unknown = null;
        let res: { success: boolean } | undefined;
        try {
            res = moveWall(world, 'w-west', 6.05) as { success: boolean };
        } catch (err) {
            threw = err;
        }

        // NEVER a throw. That is the headline of this lane.
        expect(threw, 'a policy refusal may not reach the caller as an exception').toBeNull();
        expect(res!.success).toBe(true);

        // The refusal exists, is typed, and reached the injected sink.
        expect(world.refusals).toHaveLength(1);
        const r = world.refusals[0]!;
        expect(r.code).toBe('WELD_COLLAPSES_PARTNER');
        expect(r.movedWallId).toBe('w-west');
        expect(r.wallIds.length).toBeGreaterThan(0);
        // §REFUSAL-IDENTITY — the reason code survives inside the prose, so a
        // sink that takes only a string cannot lose it.
        expect(r.sentence).toContain('WELD_COLLAPSES_PARTNER');
        // Both numbers: what it would become, and the floor it breaks.
        expect(r.sentence).toMatch(/50 mm/);
        expect(r.sentence).toMatch(/100 mm/);

        // ATOMIC: not one partner moved. A partial weld would leave a topology
        // no user asked for.
        expect(bl2(world, 'w-south')).toEqual(southBefore);
        expect(bl2(world, 'w-north')).toEqual(northBefore);
        expect(doorOf(world, 'w-south')!.offset).toBe(offsetBefore);

        // The counters a later regression would move.
        const g = globalThis as unknown as {
            __pryzmL925Refusals?: number; __pryzmL925Unsurfaced?: number;
        };
        expect(g.__pryzmL925Refusals).toBe(1);
        expect(g.__pryzmL925Unsurfaced).toBe(0);
    });

    it('counts a refusal that reached NO sink as UNSURFACED rather than as handled', () => {
        // The `wallPlacementGate` doctrine: a gate that quietly stops surfacing
        // is indistinguishable from a gate that stopped firing. With no sink
        // injected the refusal is still RAISED and still atomic — but it is
        // counted as unsurfaced, which is a defect a test can assert on.
        world = makeWorld({ withSink: false });
        buildLoop(world);
        addDoor(world, 'w-south', 2.0);

        expect(() => moveWall(world!, 'w-west', 6.05)).not.toThrow();

        const g = globalThis as unknown as {
            __pryzmL925Refusals?: number; __pryzmL925Unsurfaced?: number;
        };
        expect(g.__pryzmL925Refusals).toBe(1);
        expect(g.__pryzmL925Unsurfaced).toBe(1);
        expect(world.refusals).toHaveLength(0);
    });
});
