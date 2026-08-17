// L-871 / L-872 / L-873 / L-874 — the founder's wall-move regressions, EXECUTED
// at the seam (C72 §3.4: a fixture that hand-builds the state proves nothing —
// every mutation below goes through the REAL commands on the REAL stores).
//
// THE FOUR ROWS THIS FILE PINS (docs/04-reference/ISSUE-LOG.md):
//  L-871 — "after I created a door, the walls meant to extend misbehaved."
//          VERDICT DELIVERED HERE: corner-joined slab-loop welds still work
//          after ADD_OPENING (H1 stale-graph / H2 room-replacement / H3
//          neighbour-shift are REFUTED at this seam); what ADD_OPENING really
//          did was fire a PHANTOM CASCADE_WALL_BASELINE (byte-identical
//          writes) because the slab service could not tell a non-move update
//          from a move. Now suppressed (§L-871 IDENTITY-SUPPRESSION); the
//          walls that genuinely "did not follow" were T-abutting interiors —
//          that is L-872's mechanism, not the door's.
//  L-872 — interior wall abutting MID-SPAN (T-junction) never extends when
//          its host perimeter moves; the room loop opens; REDETECT_ROOMS
//          destroys a room. Root cause: the ONLY extend mechanism was keyed
//          on slab-loop membership (SlabWallConnectivityService.registerSlab);
//          computeMoveReweld existed for exactly this and had ZERO callers.
//          Fix: WallMoveReweldService (§MOVE-REWELD-DISPATCH).
//  L-873 — moving a wall outward "beyond" its neighbour: the joint must
//          follow — the neighbour EXTENDS ALONG ITS OWN AXIS to the new line
//          intersection, never skews. Same mechanism as L-872, second symptom
//          (measured pre-fix by WallMoveJunctionReweld.measure.test.ts).
//  L-874 — undo after a move+cascade restored NOTHING (2–3 identical
//          screenshots). Root cause: undo replays fired store events the
//          cascade services treated as fresh user moves — every Ctrl+Z was
//          immediately compensated by a new FORWARD cascade (which also
//          cleared the redo stack). Fix: CommandManager.isReverting() latch +
//          both services consult it (and the §L-871 cascade-applying latch).
//
// REAL, imported from production (never re-implemented):
//   WallStore (geometry-wall), SlabStore + SlabWallConnectivityService +
//   traceRegionSketchAtPoint (geometry-slab), WallMoveReweldService +
//   computeMoveReweld (geometry-wall), CommandManager (this package),
//   UpdateWallBaselineCommand / CreateWallOpeningCommand /
//   ReDetectRoomsCommand / CascadeWallBaselineCommand (this package),
//   semanticGraphManager (core-app-model), RoomStore + RoomDetectionEngine
//   (room-topology, via ReDetectRoomsCommand).
// NOT real, stated so nothing is overclaimed: bimManager is a level-authority
//   stub (levels are not the subject); the WallRebuildCoordinator flush is an
//   apps/editor construct, so the joinedTo edges its writer would produce are
//   seeded through the SAME graph API it calls in production
//   (semanticGraphManager.replaceJoinedToForLevelWalls — ADR-0321 §CONNECT-3).
//   No meshes are built: the subject is the BASELINES and the ROOM SET.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { WallStore } from '@pryzm/geometry-wall';
import type { WallData } from '@pryzm/geometry-wall';
import { WallMoveReweldService } from '@pryzm/geometry-wall';
// §C83-10.2.2 — the plan form, which reports the junctions it refuses to close
// by moving an incumbent instead of dropping them silently.
import { computeMoveReweldPlan } from '@pryzm/geometry-wall';
import {
    SlabStore,
    SlabWallConnectivityService,
    traceRegionSketchAtPoint,
    type RegionWallLike,
    type SlabData,
    type SlabSketch,
} from '@pryzm/geometry-slab';
import { ProjectContext, semanticGraphManager } from '@pryzm/core-app-model';
import { RoomStore } from '@pryzm/room-topology';
import { doorStore } from '@pryzm/geometry-door';
import { windowStore } from '@pryzm/geometry-window';

import { CommandManager } from '../src/CommandManagerImpl';
import type { CommandContext } from '../src/types';
import { CommandType } from '../src/types';
import { UpdateWallBaselineCommand } from '../src/walls/UpdateWallBaselineCommand';
import { CreateWallOpeningCommand } from '../src/walls/CreateWallOpeningCommand';
import { ReDetectRoomsCommand } from '../src/rooms/ReDetectRoomsCommand';
import {
    CascadeWallBaselineCommand,
    isCascadeWallBaselineApplying,
} from '../src/walls/CascadeWallBaselineCommand';

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

/** Minimal, schema-valid region slab (the c79MovePropagation fixture shape). */
function regionSlab(id: string, sketch: SlabSketch, ring: { x: number; y: number }[]): SlabData {
    return {
        id, type: 'slab', levelId: LEVEL, thickness: 0.2,
        position: { x: 0, y: 0, z: 0 }, polygon: ring, sketch,
        ifcData: { guid: `guid-${id}`, ifcClass: 'IfcSlab' },
    } as unknown as SlabData;
}

interface World {
    wallStore: WallStore;
    slabStore: SlabStore;
    roomStore: RoomStore;
    cm: CommandManager;
    slabService: SlabWallConnectivityService;
    reweldService?: WallMoveReweldService;
    dispose(): void;
}

/**
 * Build the production wiring, in the production ORDER (engineLauncher.ts:
 * slab connectivity first, move-reweld second), against the real stores.
 * `withReweld:false` reproduces the PRE-FIX production wiring for defect pins.
 */
function makeWorld(opts: { withReweld: boolean }): World {
    const bimManager = makeBimManager();
    const wallStore = new WallStore(
        new ProjectContext(),
        makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
    );
    const slabStore = new SlabStore();
    const roomStore = new RoomStore(new ProjectContext() as never, bimManager as never);

    const ctx = {
        stores: { wallStore, slabStore, roomStore },
        bimManager,
    } as unknown as CommandContext;
    const cm = new CommandManager(ctx);

    // WallFaceResolver reads this global in production (WallFaceResolver.ts:37).
    Object.assign(window, { wallStore });

    const slabService = new SlabWallConnectivityService(
        slabStore,
        wallStore as unknown as ConstructorParameters<typeof SlabWallConnectivityService>[1],
        () => false,
        cm,
    );
    slabService.bootstrap();

    let reweldService: WallMoveReweldService | undefined;
    if (opts.withReweld) {
        reweldService = new WallMoveReweldService(wallStore, {
            commandManagerRef: { current: cm },
            makeCascadeCommand: (input) => new CascadeWallBaselineCommand(input),
            getJoinedWalls: (wallId) => semanticGraphManager.getJoinedWalls(wallId),
            isCascadeApplying: isCascadeWallBaselineApplying,
        });
    }

    return {
        wallStore, slabStore, roomStore, cm, slabService, reweldService,
        dispose() {
            reweldService?.dispose();
            slabService.dispose();
            Object.assign(window, { wallStore: undefined });
        },
    };
}

const asRegionWalls = (ws: WallStore): RegionWallLike[] =>
    ws.getAll().map(w => ({
        id: w.id,
        baseLine: w.baseLine.map(p => ({ x: p.x, z: p.z })),
    }));

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

const near = (a: [number, number], b: [number, number], eps = 1e-6): boolean =>
    Math.hypot(a[0] - b[0], a[1] - b[1]) < eps;

/** Seed the joinedTo edges the WallRebuildCoordinator flush writes in prod
 *  (ADR-0321 §CONNECT-3) through the SAME graph API it calls. */
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

// ── scenario builders ────────────────────────────────────────────────────────

/** Founder repro 1/3 ground: a 6×4 perimeter loop, optionally with a
 *  region slab traced over it (hostReference edges — the pick/region path). */
function buildLoop(world: World, withSlab: boolean): void {
    world.wallStore.add(wallRecord('w-south', [0, 0], [6, 0]));
    world.wallStore.add(wallRecord('w-east', [6, 0], [6, 4]));
    world.wallStore.add(wallRecord('w-north', [6, 4], [0, 4]));
    world.wallStore.add(wallRecord('w-west', [0, 4], [0, 0]));
    if (withSlab) {
        const traced = traceRegionSketchAtPoint(asRegionWalls(world.wallStore), 3, 2)!;
        expect(traced).not.toBeNull();
        world.slabStore.add(regionSlab('slab-loop', traced.sketch, traced.ring));
    }
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

/** Founder repro 2 ground: 8×6 shell, slab traced over the shell FIRST
 *  (founder order), then ONE interior wall whose endpoints land MID-SPAN on
 *  sh-l and sh-r — T-junction abutments, NOT shared endpoints. */
function buildShellWithInterior(world: World): void {
    world.wallStore.add(wallRecord('sh-b', [0, 0], [8, 0]));
    world.wallStore.add(wallRecord('sh-r', [8, 0], [8, 6]));
    world.wallStore.add(wallRecord('sh-t', [8, 6], [0, 6]));
    world.wallStore.add(wallRecord('sh-l', [0, 6], [0, 0]));
    const traced = traceRegionSketchAtPoint(asRegionWalls(world.wallStore), 4, 3)!;
    expect(traced).not.toBeNull();
    world.slabStore.add(regionSlab('slab-shell', traced.sketch, traced.ring));

    world.wallStore.add(wallRecord('ip', [0, 3], [8, 3], 0.1));
    seedJoinedTo(
        ['sh-b', 'sh-r', 'sh-t', 'sh-l', 'ip'],
        [
            { type: 'L', wallIds: ['sh-b', 'sh-r'] },
            { type: 'L', wallIds: ['sh-r', 'sh-t'] },
            { type: 'L', wallIds: ['sh-t', 'sh-l'] },
            { type: 'L', wallIds: ['sh-l', 'sh-b'] },
            { type: 'T', wallIds: ['ip', 'sh-l'] },
            { type: 'T', wallIds: ['ip', 'sh-r'] },
        ],
    );
}

function redetect(world: World): string[] {
    const res = world.cm.execute(new ReDetectRoomsCommand(LEVEL, 0, 3));
    expect(res.success).toBe(true);
    return world.roomStore.getByLevel(LEVEL).map(r => r.id).sort();
}

// ── lifecycle ────────────────────────────────────────────────────────────────

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
// §L-872 — the T-junction interior wall (founder repro 2, PRIMARY / H0)
// ════════════════════════════════════════════════════════════════════════════

describe('L-872 — interior T-junction wall follows a perimeter move', () => {
    it('DEFECT PIN (pre-fix wiring): the interior wall never extends and the move kills a room', () => {
        world = makeWorld({ withReweld: false }); // production wiring BEFORE this fix
        buildShellWithInterior(world);

        const before = redetect(world);
        expect(before.length).toBe(2); // partition seals: two rooms

        // Founder gesture: move the right perimeter segment OUTWARD by 2 m
        // (> RoomDetectionEngine's 1.25 m dangling-end reach, so detection
        // cannot mask the broken loop).
        const res = moveWall(world, 'sh-r', 2, 0);
        expect(res.success).toBe(true);

        // Slab-loop corner neighbours DID follow (this always worked)…
        expect(near(bl2(world, 'sh-b')[1], [10, 0])).toBe(true);
        expect(near(bl2(world, 'sh-t')[0], [10, 6])).toBe(true);
        // …but the T-abutting interior wall received NO re-baseline (founder
        // console: "no re-baseline was ever issued for the interior wall").
        //
        // §FIX-WALL-CREATE-ON-HOST-FACE (L-929) — 7.9, NOT 8. `ip` is authored
        // from [0,3] to [8,3], i.e. both ends land INSIDE the 200 mm shell walls'
        // solids, on their centrelines. Since L-929 a body landing is AUTHORED AT
        // THE HOST FACE, so `ip` is stored spanning face-to-face: x ∈ [0.1, 7.9].
        // THE ASSERTION'S MEANING IS UNCHANGED — "the end did not move" — and the
        // value it must not have moved FROM is now the face. See the §L-929 note
        // on the §10.6 test below before changing any of these numbers.
        expect(near(bl2(world, 'ip')[1], [7.9, 3])).toBe(true);

        // And REDETECT_ROOMS destroys a room — "Detected 1 room(s)" (was 2).
        const after = redetect(world);
        expect(after.length).toBe(1);
    });

    // ⚠⚠ RE-RECONCILED 2026-08-15 (§L-926) — READ THIS BEFORE INVERTING IT AGAIN.
    //
    // THIS TEST HAS NOW BEEN WRITTEN BOTH WAYS, AND THE SECOND WAY SHIPPED A
    // REGRESSION. Its history, so the next agent does not complete the cycle:
    //
    //   L-872 fix    `ip[1] → [10,3]` — the T-abutting interior wall FOLLOWS the
    //                moved perimeter. Correct.
    //   `19ddf6bb`   inverted to "`ip` is an INCUMBENT, byte-identical", citing
    //                C83 §10.2.2 (*"A re-weld MUST NOT close a joint by moving a
    //                non-subject wall's baseline"*). The comment here even
    //                conceded the price — *"the loop DOES open and the rooms DO
    //                collapse. That is honest"* — and called it honest because
    //                the contract appeared to demand it.
    //   L-926        THE CONTRACT NEVER DEMANDED IT. §10.2.2 is about a CORNER
    //                incumbent. `ip`'s END TERMINATES ON `sh-r`'s BODY, three
    //                metres from either of `sh-r`'s endpoints — that is a
    //                DEPENDENT, and a dependent follows its host (§10.6). The
    //                founder, on the deployed build: *"they are already
    //                connected — they should simply follow along"*, and of the
    //                §OPENED-REGION offer that resulted, *"in this case it is
    //                NOT NECESSARY — the interior walls should simply EXTEND."*
    //
    // L-922's mechanism is the OPPOSITE assignment: there the wall carrying three
    // hosted doors was a perimeter whose ENDPOINT met the moved wall's ENDPOINT —
    // a corner incumbent. That case is still forbidden and is pinned in
    // `packages/geometry-wall/__tests__/L926StemFollowAuthorship.measure.test.ts`
    // as a byte-for-byte golden, alongside this one, so the two can never again
    // be traded for each other.
    //
    // A ROOM COUNT IS ASSERTED HERE and it is the point: "the loop opens and the
    // rooms collapse" was measurable all along, and nothing measured it.
    it('§C83-10.6: the T-abutting interior wall is a DEPENDENT — it follows, and the room survives', () => {
        world = makeWorld({ withReweld: true });
        buildShellWithInterior(world);

        const before = redetect(world);
        expect(before.length).toBe(2);

        const ipBefore = JSON.stringify(world.wallStore.getById('ip')!.baseLine);

        const res = moveWall(world, 'sh-r', 2, 0);
        expect(res.success).toBe(true);

        // Slab-loop corner welds are a DIFFERENT service and are unchanged here
        // (SlabWallConnectivityService carries the same §10.2.2 hole — recorded,
        // not fixed in this lane).
        expect(near(bl2(world, 'sh-b')[1], [10, 0])).toBe(true);
        expect(near(bl2(world, 'sh-t')[0], [10, 6])).toBe(true);

        // §C83 §10.6 — THE DEPENDENT FOLLOWED. Axially: the end that terminated
        // on `sh-r` moved with it, the far end did not move at all.
        //
        // ⚠ §FIX-WALL-CREATE-ON-HOST-FACE (L-929) MOVED THESE THREE NUMBERS, AND
        // MOVED NOTHING ELSE. READ THIS BEFORE "CORRECTING" THEM BACK.
        //
        // The RULING this test encodes is untouched: `ip`'s end terminates on
        // `sh-r`'s BODY, so it is a DEPENDENT and it FOLLOWS (§10.6) — as opposed
        // to a corner INCUMBENT, which stays put (§10.2.2). That verdict is what
        // `19ddf6bb` inverted and L-926 restored, and it still holds here.
        //
        // What changed is the DATUM the authored line uses. `ip` is drawn
        // [0,3]→[8,3]: both ends land inside the 200 mm shell walls' solids, on
        // their centrelines. L-919 computed a retreat onto the host FACE and
        // `WallRebuildCoordinator._flush` discarded it (measured, `097bcf1c`);
        // L-929 authors it at creation instead, where §FIX-WALL-JOIN-BASELINE-
        // IMMUTABLE defends it. So a 100 mm partition between two 200 mm walls is
        // now stored spanning FACE TO FACE rather than overlapping 100 mm into
        // each shell — which is what a partition actually is.
        //
        //   before L-929        after L-929
        //   ip = [0,3]→[8,3]    ip = [0.1,3]→[7.9,3]
        //   follows to [10,3]   follows to [9.9,3]   ← the moved host's FACE
        //
        // The dependent still follows the full 2 m, the far end is still fixed,
        // and the founder-level room assertion below is untouched and still
        // passes. Only the offset by one host half-thickness is new.
        expect(JSON.stringify(world.wallStore.getById('ip')!.baseLine)).not.toBe(ipBefore);
        expect(near(bl2(world, 'ip')[1], [9.9, 3])).toBe(true);  // followed
        expect(near(bl2(world, 'ip')[0], [0.1, 3])).toBe(true);  // far end fixed

        // THE FOUNDER-LEVEL ASSERTION: the partition still seals, so the room
        // that `19ddf6bb` destroyed is still here. 2 rooms in, 2 rooms out.
        expect(redetect(world).length).toBe(2);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §L-871 — the door regression (founder repro 1): executed verdict on H1–H3
// ════════════════════════════════════════════════════════════════════════════

describe('L-871 — ADD_OPENING and the corner-weld cascade', () => {
    it('the full founder sequence: move → door → move; corner welds still work and the door does not slide', () => {
        world = makeWorld({ withReweld: true });
        buildLoop(world, true);

        // 1) Pre-door move (founder: "perfect — all followed").
        expect(moveWall(world, 'w-north', 0, 2).success).toBe(true);
        expect(near(bl2(world, 'w-east')[1], [6, 6])).toBe(true);  // extended
        expect(near(bl2(world, 'w-west')[0], [0, 6])).toBe(true);  // extended

        // 2) The door. Pre-fix, ADD_OPENING's store emit made the slab service
        //    dispatch a PHANTOM CASCADE_WALL_BASELINE (byte-identical writes) —
        //    the founder's console line "CASCADE fired FROM the opening add".
        //    §L-871 IDENTITY-SUPPRESSION: a non-move must dispatch NOTHING.
        const baselinesBefore = JSON.stringify(
            ['w-south', 'w-east', 'w-north', 'w-west'].map(id => bl2(world!, id)),
        );
        const historyBefore = world.cm.getHistory().length;
        const doorRes = world.cm.execute(new CreateWallOpeningCommand({
            wallId: 'w-south',
            openingData: { type: 'door', offset: 2.0, width: 0.9, height: 2.1, sillHeight: 0, doorType: 'single' },
        }));
        expect(doorRes.success).toBe(true);
        const history = world.cm.getHistory();
        // EXACTLY one new entry (ADD_OPENING) — no phantom cascade:
        expect(history.length).toBe(historyBefore + 1);
        expect(history[history.length - 1]!.command.type).toBe(CommandType.ADD_OPENING);
        // H3 refuted, executed: the opening add changed NO baseline anywhere.
        expect(JSON.stringify(
            ['w-south', 'w-east', 'w-north', 'w-west'].map(id => bl2(world!, id)),
        )).toBe(baselinesBefore);

        // 3) Post-door move (founder: "the walls misbehaved"). H1/H2 refuted,
        //    executed: the corner-joined neighbours — INCLUDING the doored
        //    wall — still extend, from live geometry, at this seam.
        expect(moveWall(world, 'w-east', 1, 0).success).toBe(true);
        expect(near(bl2(world, 'w-south')[1], [7, 0])).toBe(true); // doored wall follows
        expect(near(bl2(world, 'w-north')[0], [7, 6])).toBe(true);
        // The door did not slide: host start endpoint and offset are intact,
        // so its world position is byte-identical.
        expect(near(bl2(world, 'w-south')[0], [0, 0])).toBe(true);
        const opening = world.wallStore.getById('w-south')!.openings![0]!;
        expect(opening.offset).toBeCloseTo(2.0, 9);

        // No REDETECT_ROOMS entry ever lands on the undo stack (nonUndoable).
        expect(world.cm.getHistory().some(h => h.command.type === CommandType.REDETECT_ROOMS)).toBe(false);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §L-873 — "the joint should follow": extend along the neighbour's own axis
// ════════════════════════════════════════════════════════════════════════════

describe('L-873 — joint follows a move beyond the neighbour\'s extent (no slab loop at all)', () => {
    it('DEFECT PIN (pre-fix wiring): outside a slab loop, NOTHING extends the neighbours', () => {
        world = makeWorld({ withReweld: false });
        buildLoop(world, false); // walls + joinedTo only — no slab anywhere
        expect(moveWall(world, 'w-north', 0, 2).success).toBe(true);
        // The joint kept the original point; the neighbours never followed:
        expect(near(bl2(world, 'w-east')[1], [6, 4])).toBe(true);
        expect(near(bl2(world, 'w-west')[0], [0, 4])).toBe(true);
    });

    // ⚠ SUPERSEDED BY CONTRACT, 2026-08-15 — C83 §10.2.2. See the §10.2.2 note
    // on the L-872 test above; this is the same reversal on the clearest case.
    //
    // The old assertion said the joint "must travel BEYOND w-east's current far
    // end (6,4) to the new line intersection (6,6)" — i.e. the incumbent is
    // LENGTHENED by 2 m to chase the subject. That is precisely what §10.2.2
    // forbids, and `computeMoveReweldPlan` now answers it with an explicit
    // `INCUMBENT_EXTENSION_REQUIRED` refusal rather than a silent stretch.
    //
    // Refusing is not the same as doing nothing quietly: the refusal is
    // reported to the user through the service's `onConsequence` sink, and the
    // gesture aborts at the gate (C83 §10.3).
    // ⚠⚠ RE-REVERSED BY CONTRACT, 2026-08-17 — C83 §10.6, FOUNDER-CONFIRMED.
    //
    // This assertion has now flipped TWICE, and the history is the point, so it
    // is kept rather than tidied away:
    //
    //   original          — the neighbour LENGTHENS to the new intersection (6,6)
    //   2026-08-15 §10.2.2 — reversed: neighbours BYTE-IDENTICAL, refusal reported
    //   2026-08-17 §10.6   — re-reversed FOR MUTUAL CORNERS ONLY
    //
    // ⭐ WHY THE FLIP-FLOP HAPPENED, so it does not happen a third time: §10.2.2
    // was written from L-922, where an INTERIOR wall's move dragged a PERIMETER
    // baseline 2.19 m and re-seated three hosted doors. That is a `T` junction at
    // degree 3. THIS fixture is `buildLoop` — a CLOSED PERIMETER, whose corners
    // are 2-wall `L` junctions. §10.2.2 was correct about L-922 and over-broad
    // about this, because at the time NOTHING COULD TELL THE TWO APART: the
    // discriminator was stored on the joinedTo edge and `getJoinedWalls` discarded
    // it (L-942). With it threaded, the two cases separate BY MEASUREMENT.
    //
    // The founder's rule, confirmed 2026-08-17, is unambiguous for this case:
    // *"The adjacent perimeter walls must automatically extend, shorten, rotate or
    // reposition as necessary to maintain a closed and valid perimeter."*
    // A closed perimeter that refuses to stay closed is not a safety property.
    //
    // §10.6.5 ASSERTION 1 — the follow, proven at the STORED layer.
    it('§C83-10.6: a MUTUAL corner FOLLOWS — the neighbour pivots, its FAR end untouched', () => {
        world = makeWorld({ withReweld: true });
        buildLoop(world, false); // joinedTo graph is the ONLY connectivity source

        // Capture the FAR ends. §10.6.2 condition 4 is that these do not move —
        // the partner PIVOTS at the shared corner, it does not translate. That is
        // the whole difference from L-922, which moved `baseLine[0]`, the datum
        // every hosted opening's offset is measured from.
        const eastFarBefore = JSON.stringify(world.wallStore.getById('w-east')!.baseLine[0]);
        const westFarBefore = JSON.stringify(world.wallStore.getById('w-west')!.baseLine[1]);

        expect(moveWall(world, 'w-north', 0, 2).success).toBe(true);

        // THE FOLLOW — the welded ends are seated at the analytic intersection of
        // each neighbour's own line with w-north's NEW line (z = 6). Asserted on
        // the STORE, not on a plan or a return value: a plan that is computed and
        // never applied is exactly the defect L-921 was.
        expect(near(bl2(world, 'w-east')[1], [6, 6])).toBe(true);
        expect(near(bl2(world, 'w-west')[0], [0, 6])).toBe(true);

        // THE PIVOT — far ends byte-identical, so direction is unchanged and the
        // neighbours lengthened along their OWN axes rather than being dragged.
        expect(JSON.stringify(world.wallStore.getById('w-east')!.baseLine[0])).toBe(eastFarBefore);
        expect(JSON.stringify(world.wallStore.getById('w-west')!.baseLine[1])).toBe(westFarBefore);

        // THE PERIMETER IS STILL CLOSED — the founder's actual requirement, and
        // the thing neither the old assertion nor its reversal ever checked.
        // Every corner coincident to within the weld tolerance, or the gesture
        // has produced exactly the "gaps and overlapping geometry" the spec
        // forbids.
        // ⚠ w-north runs EAST→WEST: measured [[6,6],[0,6]], so its [0] is the
        // EAST end and its [1] is the WEST end. Written from the measurement,
        // not from the reading-order assumption — that assumption is what made
        // the first draft of this assertion fail against correct geometry.
        expect(near(bl2(world, 'w-east')[1], bl2(world, 'w-north')[0])).toBe(true);
        expect(near(bl2(world, 'w-west')[0], bl2(world, 'w-north')[1])).toBe(true);
    });

    // ────────────────────────────────────────────────────────────────────────
    // §10.6.5 ASSERTION 2 — ⭐ THE L-922 CONTROL. §10.6.5 makes this MANDATORY
    // and says so in as many words: without it "the L-922 regression is
    // unguarded". It is the reason the mutual-corner carve-out is safe to
    // exist, and it must live in the SAME fixture family as the follow above so
    // that one gesture cannot be made to pass by weakening the other.
    //
    // L-922, verbatim: an INTERIOR wall was moved and the cascade shifted the
    // PERIMETER's baseline start ~2.19 m, proven by three hosted doors re-seated
    // by the same delta — one of them clamped to offset 0.000, which is §10.2.4's
    // named example of a clamp standing where a refusal belongs.
    //
    // The ONLY thing separating this from the test above is the stored
    // discriminator: interior↔perimeter reads T/degree-3, perimeter↔perimeter
    // reads L/degree-2. Same geometry family, same code path, opposite verdict.
    // If this test ever goes green by the perimeter MOVING, the carve-out has
    // widened past its contract and L-942's fix has become L-922's cause.
    // ────────────────────────────────────────────────────────────────────────
    // ⚠ THE FIRST DRAFT OF THIS CONTROL WAS THEATRE, and the reason is kept
    // because it is the easiest mistake to make here twice.
    //
    // It built a partition landing MID-SPAN on the perimeter and moved it. That
    // never reaches the mutual-corner branch at all — `classifyWeldAuthorship`
    // returns `stem` for a mid-span abutment, so `isMutualCorner` is never
    // consulted and the test passed identically with the discriminator check
    // REMOVED. Proven by negative control: with `isMutualCorner` forced to
    // `return true`, that draft stayed GREEN. A control that cannot fail is not
    // a control — it is a comment that costs CI time.
    //
    // ⭐ THE FIX IS TO VARY EXACTLY ONE THING. This fixture is byte-for-byte the
    // geometry of the §10.6 follow test above — same loop, same gesture, same
    // partners reaching the same corner branch. The ONLY difference is that the
    // junctions are stamped T/degree-3 instead of L/degree-2. So the assertion
    // isolates the discriminator and nothing else, which is precisely §10.6.2's
    // claim: *"the topology separates the two cases by MEASUREMENT, not by
    // naming, intent, or a wall-type flag."*
    it('§C83-10.6 CONTROL: same geometry, T/degree-3 instead of L/2 — the neighbours DO NOT follow', () => {
        world = makeWorld({ withReweld: true });
        world.wallStore.add(wallRecord('w-south', [0, 0], [6, 0]));
        world.wallStore.add(wallRecord('w-east', [6, 0], [6, 4]));
        world.wallStore.add(wallRecord('w-north', [6, 4], [0, 4]));
        world.wallStore.add(wallRecord('w-west', [0, 4], [0, 0]));

        seedJoinedTo(
            ['w-south', 'w-east', 'w-north', 'w-west'],
            [
                { type: 'L', wallIds: ['w-south', 'w-east'] },
                { type: 'L', wallIds: ['w-west', 'w-south'] },
                // ⭐ THE ONLY VARIABLE. These two are the junctions w-north's
                // move must re-weld; degree 3 means a third wall has a stake,
                // so neither is w-north's to close. L-922 was exactly this
                // reading answered the other way.
                { type: 'T', wallIds: ['w-east', 'w-north'] },
                { type: 'T', wallIds: ['w-north', 'w-west'] },
            ],
        );

        const eastBefore = JSON.stringify(world.wallStore.getById('w-east')!.baseLine);
        const westBefore = JSON.stringify(world.wallStore.getById('w-west')!.baseLine);

        moveWall(world, 'w-north', 0, 2);

        // §C83 §10.4 — byte-identical, not `near`. L-922 was a 2.19 m shift, but
        // a tolerance here would pass small drags, and small drags accumulate
        // across gestures into exactly that number.
        expect(JSON.stringify(world.wallStore.getById('w-east')!.baseLine)).toBe(eastBefore);
        expect(JSON.stringify(world.wallStore.getById('w-west')!.baseLine)).toBe(westBefore);
    });

    // §10.6.5 ASSERTION 3 — ABSENT METADATA TAKES THE PRE-§10.6 BRANCH.
    //
    // §10.6.3 #1 and C70 L-INV-1: a missing discriminator is "I could not
    // determine", never "L". The level-scan fallback resolves partners
    // geometrically and carries no junction records, so this is the state a
    // real project sits in whenever the joinedTo writer has not yet flushed.
    //
    // ⚠ THIS IS THE ARM THAT WOULD FAIL SILENTLY IF ABSENCE WERE READ AS
    // PERMISSION — the exact "empty means unknown" collision this whole
    // programme exists to abolish, pointed at wall authority.
    it('§C83-10.6.3 #1: with NO junction metadata, nothing follows — pre-§10.6 behaviour verbatim', () => {
        world = makeWorld({ withReweld: true });
        world.wallStore.add(wallRecord('w-south', [0, 0], [6, 0]));
        world.wallStore.add(wallRecord('w-east', [6, 0], [6, 4]));
        world.wallStore.add(wallRecord('w-north', [6, 4], [0, 4]));
        world.wallStore.add(wallRecord('w-west', [0, 4], [0, 0]));

        // The walls ARE joined — the graph is told so — but NO junctionType and
        // NO junctionDegree is stamped for any of them.
        semanticGraphManager.replaceJoinedToForLevelWalls(
            ['w-south', 'w-east', 'w-north', 'w-west'],
            [
                { wallIds: ['w-east', 'w-north'] },
                { wallIds: ['w-north', 'w-west'] },
            ] as unknown as Parameters<typeof semanticGraphManager.replaceJoinedToForLevelWalls>[1],
        );

        const eastBefore = JSON.stringify(world.wallStore.getById('w-east')!.baseLine);
        const westBefore = JSON.stringify(world.wallStore.getById('w-west')!.baseLine);

        moveWall(world, 'w-north', 0, 2);

        // Byte-identical: the SAME gesture that made them follow above must do
        // nothing here, because the discriminator is unreadable.
        expect(JSON.stringify(world.wallStore.getById('w-east')!.baseLine)).toBe(eastBefore);
        expect(JSON.stringify(world.wallStore.getById('w-west')!.baseLine)).toBe(westBefore);
    });

    it('§C83-10.2.2: the engine REPORTS the refusal rather than dropping the junction silently', () => {
        // A dropped junction with nobody told is L-921 wearing L-922's clothes.
        // The plan form carries the refusal, its partner, and the distance.
        const plan = computeMoveReweldPlan(
            {
                id: 'w-north',
                prevBaseLine: [{ x: 0, y: 0, z: 4 }, { x: 6, y: 0, z: 4 }],
                newBaseLine:  [{ x: 0, y: 0, z: 6 }, { x: 6, y: 0, z: 6 }],
            },
            [{ id: 'w-east', baseLine: [{ x: 6, y: 0, z: 0 }, { x: 6, y: 0, z: 4 }] }],
            { weldTol: 0.5 },
        );
        // NOTHING is proposed for the incumbent…
        expect(plan.entries.some(e => e.wallId === 'w-east')).toBe(false);
        // …and the refusal names it, with the gap in millimetres.
        expect(plan.refusals).toHaveLength(1);
        expect(plan.refusals[0]!.partnerId).toBe('w-east');
        expect(plan.refusals[0]!.reason).toBe('INCUMBENT_EXTENSION_REQUIRED');
        expect(plan.refusals[0]!.beyondMm).toBe(2000); // 2 m past w-east's end
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §L-874 — undo restores, and is never compensated by a forward cascade
// ════════════════════════════════════════════════════════════════════════════

describe('L-874 — ONE undo restores the entire pre-move state (founder acceptance)', () => {
    it('one gesture = ONE history entry; ONE undo restores every baseline byte-equal; ONE redo replays the gesture', () => {
        world = makeWorld({ withReweld: true });
        buildShellWithInterior(world);
        redetect(world);

        const snapshot = new Map<string, string>();
        for (const w of world.wallStore.getAll()) {
            snapshot.set(w.id, JSON.stringify(w.baseLine));
        }

        expect(moveWall(world, 'sh-r', 2, 0).success).toBe(true);

        // §L-874-ONE-UNDO — the move's structural cascades (slab corner welds,
        // junction re-weld) COMPOSE into the gesture's entry instead of costing
        // their own Ctrl+Z. Pre-fix: 2–3 entries per move, and each undo was
        // compensated by a fresh forward cascade (identical screenshots).
        // REDETECT_ROOMS (nonUndoable) never lands on the stack.
        const history = world.cm.getHistory();
        expect(history.length).toBe(1);
        expect(history[0]!.command.type).toBe(CommandType.UPDATE_WALL_BASELINE);
        // §L-926 — RESTORED to ">= 1". `19ddf6bb` weakened this to ">= 0" on the
        // reasoning that a re-weld which would move an incumbent is refused, so a
        // gesture may carry no children at all. True of a corner; false here —
        // this gesture has a DEPENDENT that must follow, so it must produce a
        // structural child. ">= 0" is an assertion about nothing, and it is what
        // let the child quietly disappear: the count it was guarding went to zero
        // in production and this line could not notice.
        expect(history[0]!.structuralChildren?.length ?? 0).toBeGreaterThanOrEqual(1);

        // FOUNDER ACCEPTANCE, executed: ONE undo → the ENTIRE pre-move state.
        world.cm.undo();
        expect(world.cm.canUndo()).toBe(false);
        for (const [id, blJson] of snapshot) {
            expect(JSON.stringify(world.wallStore.getById(id)!.baseLine)).toBe(blJson);
        }

        // ONE redo replays the whole gesture (children replay themselves;
        // services stay silent behind isReverting):
        world.cm.redo();
        expect(near(bl2(world, 'sh-r')[0], [10, 0])).toBe(true);
        // §L-926 — the redo replays the subject AND its dependents, as one
        // gesture. `ip` is back at [10,3], the same place the forward pass put
        // it: the stem follows on redo exactly as it followed on execute, and
        // the undo above already proved it returns byte-equal. (A CORNER
        // incumbent would still stay put on both passes — re-running a mutating
        // cascade against one is what would re-open L-922, and that case is
        // asserted in the §10.6 test above and in the geometry-wall goldens.)
        // §FIX-WALL-CREATE-ON-HOST-FACE (L-929) — 9.9, the moved host's FACE; see
        // the §10.6 test above. The undo/redo property this line guards (the stem
        // follows on redo exactly as it followed on execute) is unchanged, and the
        // byte-equal snapshot comparisons around it are datum-independent.
        expect(near(bl2(world, 'ip')[1], [9.9, 3])).toBe(true);
        expect(world.cm.getHistory().length).toBe(1);

        // …and undo works again after the redo (round-trip stability).
        world.cm.undo();
        for (const [id, blJson] of snapshot) {
            expect(JSON.stringify(world.wallStore.getById(id)!.baseLine)).toBe(blJson);
        }
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §L-873 (slide) — "kept the original point, moving the 2 wall point to connect"
// ════════════════════════════════════════════════════════════════════════════

describe('L-873 (slide) — a wall slid ALONG ITS OWN AXIS is never stretched back to the stale corner', () => {
    it('the slide commits verbatim; no cascade snaps anything to a corner the wall no longer occupies', () => {
        world = makeWorld({ withReweld: true });
        buildLoop(world, true); // slab present — the founder's ground

        // Slide w-south +3 m along its own line: its new segment (3,0)→(9,0)
        // no longer covers the old west corner (0,0). computeMoveReweld step 3
        // and the slab service's §L-873 gates must all REFUSE — the honest gap
        // is correct; the pre-fix behaviour stretched the moved wall back to
        // the stale corner ("kept the original point, moving the 2 wall point
        // to connect").
        const w = world.wallStore.getById('w-south')!;
        expect(world.cm.execute(new UpdateWallBaselineCommand({
            wallId: 'w-south',
            newBaseLine: [
                { x: w.baseLine[0].x + 3, y: w.baseLine[0].y, z: w.baseLine[0].z },
                { x: w.baseLine[1].x + 3, y: w.baseLine[1].y, z: w.baseLine[1].z },
            ],
        })).success).toBe(true);

        // The moved wall stays EXACTLY where the user put it:
        expect(near(bl2(world, 'w-south')[0], [3, 0])).toBe(true);
        expect(near(bl2(world, 'w-south')[1], [9, 0])).toBe(true);
        // Neighbours are untouched (nothing to re-form — refusal, not a guess):
        expect(near(bl2(world, 'w-west')[1], [0, 0])).toBe(true);
        expect(near(bl2(world, 'w-east')[0], [6, 0])).toBe(true);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §L-875 — two region slabs sharing long side walls: the shared wall is never
// yanked to a mid-span foot ("on top of that the slab breaks")
// ════════════════════════════════════════════════════════════════════════════

describe('L-875 — shared bounding walls survive a partition move across TWO region slabs', () => {
    it('moving the shared partition re-derives both regions; the full-height side walls keep their endpoints', () => {
        world = makeWorld({ withReweld: true });
        // 6×8 shell, ONE full-height wall per side, horizontal partition at
        // z=4 T-abutting both sides mid-span. TWO region slabs (lower/upper) —
        // both sketches reference the SAME side walls.
        world.wallStore.add(wallRecord('p-south', [0, 0], [6, 0]));
        world.wallStore.add(wallRecord('p-east', [6, 0], [6, 8]));
        world.wallStore.add(wallRecord('p-north', [6, 8], [0, 8]));
        world.wallStore.add(wallRecord('p-west', [0, 8], [0, 0]));
        world.wallStore.add(wallRecord('p-mid', [0, 4], [6, 4], 0.1));
        const regionWalls = asRegionWalls(world.wallStore);
        const lower = traceRegionSketchAtPoint(regionWalls, 3, 2)!;
        const upper = traceRegionSketchAtPoint(regionWalls, 3, 6)!;
        expect(lower).not.toBeNull();
        expect(upper).not.toBeNull();
        world.slabStore.add(regionSlab('slab-lower', lower.sketch, lower.ring));
        world.slabStore.add(regionSlab('slab-upper', upper.sketch, upper.ring));
        seedJoinedTo(
            ['p-south', 'p-east', 'p-north', 'p-west', 'p-mid'],
            [
                { type: 'L', wallIds: ['p-south', 'p-east'] },
                { type: 'L', wallIds: ['p-east', 'p-north'] },
                { type: 'L', wallIds: ['p-north', 'p-west'] },
                { type: 'L', wallIds: ['p-west', 'p-south'] },
                { type: 'T', wallIds: ['p-mid', 'p-west'] },
                { type: 'T', wallIds: ['p-mid', 'p-east'] },
            ],
        );
        const before = redetect(world);
        expect(before.length).toBe(2);

        // Move the shared partition +1 m. BOTH slab loops reference the side
        // walls; pre-fix, nearest-endpoint selection yanked a side wall's
        // ENDPOINT to the partition's mid-span foot (visibly truncating it out
        // of the other room) and last-wins dedupe discarded one loop's weld.
        expect(moveWall(world, 'p-mid', 0, 1).success).toBe(true);

        // The partition moved… (§FIX-WALL-CREATE-ON-HOST-FACE, L-929: `p-mid` is
        // authored [0,4]→[6,4], both ends inside the 200 mm side walls' solids, so
        // it is stored face-to-face at x ∈ [0.1, 5.9]. The SUBJECT of this test is
        // the z move — +1 m, asserted exactly — and the x offset is the new datum,
        // not a drift. See the §10.6 test's §L-929 note.)
        expect(near(bl2(world, 'p-mid')[0], [0.1, 5])).toBe(true);
        expect(near(bl2(world, 'p-mid')[1], [5.9, 5])).toBe(true);
        // …and the shared side walls are byte-untouched — no mid-span yank:
        expect(near(bl2(world, 'p-east')[0], [6, 0])).toBe(true);
        expect(near(bl2(world, 'p-east')[1], [6, 8])).toBe(true);
        expect(near(bl2(world, 'p-west')[0], [0, 8])).toBe(true);
        expect(near(bl2(world, 'p-west')[1], [0, 0])).toBe(true);

        // Both rooms survive with their identities (areas re-derive live).
        const after = redetect(world);
        expect(after.length).toBe(2);
        expect(after).toEqual(before);
    });
});
