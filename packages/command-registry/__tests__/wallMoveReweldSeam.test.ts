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
        expect(near(bl2(world, 'ip')[1], [8, 3])).toBe(true);

        // And REDETECT_ROOMS destroys a room — "Detected 1 room(s)" (was 2).
        const after = redetect(world);
        expect(after.length).toBe(1);
    });

    // ⚠ SUPERSEDED BY CONTRACT, 2026-08-15 — read this before "fixing" it back.
    //
    // This test used to assert `ip[1] → [10,3]`: the T-abutting interior wall
    // FOLLOWING the moved perimeter. That was the L-872 fix, and C83 §10.2.2
    // (minted 2026-08-15) makes it a violation:
    //
    //   *"A re-weld MUST NOT close a joint by moving a non-subject wall's
    //    baseline."*
    //
    // `ip` is not the gesture's subject — `sh-r` is. `ip` was already correctly
    // joined, which under §10.1 makes it AUTHORITATIVE. L-922 is the same
    // mechanism at production scale: an interior wall was moved and this engine
    // shifted the PERIMETER's baseline start ~2.19 m, re-seating three hosted
    // doors by that delta and clamping one to offset 0.000.
    //
    // The founder's own words are the reason: *"The perimeter wall joints NEVER
    // should be changed after creation… the 3rd wall needs to ADAPT and connect
    // with the FACE of the wall originally there."*
    //
    // So the assertion is INVERTED, and the consequence is not hidden: the loop
    // DOES open and the rooms DO collapse. That is honest — closing it would
    // require lengthening an incumbent, which is now forbidden. The gesture
    // therefore has to refuse at the GESTURE seam (C83 §10.3 / C78 U-INV-8),
    // which is the gate's job and is asserted in
    // `apps/editor/__tests__/wallMoveAcceptHalfExecuted.test.ts`. What this
    // seam owes is the §10.4 assertion: the incumbent did not move.
    it('§C83-10.2.2: the T-abutting interior wall is an INCUMBENT and is left BYTE-IDENTICAL', () => {
        world = makeWorld({ withReweld: true });
        buildShellWithInterior(world);

        const before = redetect(world);
        expect(before.length).toBe(2);

        // §10.4 — capture the incumbent BEFORE the gesture.
        const ipBefore = JSON.stringify(world.wallStore.getById('ip')!.baseLine);

        const res = moveWall(world, 'sh-r', 2, 0);
        expect(res.success).toBe(true);

        // Slab-loop corner welds are a DIFFERENT service and are unchanged here
        // (SlabWallConnectivityService carries the same §10.2.2 hole — recorded,
        // not fixed in this lane).
        expect(near(bl2(world, 'sh-b')[1], [10, 0])).toBe(true);
        expect(near(bl2(world, 'sh-t')[0], [10, 6])).toBe(true);

        // §C83 §10.4 — THE INCUMBENT-UNCHANGED ASSERTION. Byte-identical, which
        // is the half that was silently failing everywhere: every prior fix
        // asserted on the newcomer and nothing asserted the incumbents stayed
        // still, which is why this defect family survived fix after fix.
        expect(JSON.stringify(world.wallStore.getById('ip')!.baseLine)).toBe(ipBefore);
        expect(near(bl2(world, 'ip')[1], [8, 3])).toBe(true);   // NOT [10,3]
        expect(near(bl2(world, 'ip')[0], [0, 3])).toBe(true);
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
    it('§C83-10.2.2: a joint that needs the neighbour LENGTHENED is refused, and the neighbours are BYTE-IDENTICAL', () => {
        world = makeWorld({ withReweld: true });
        buildLoop(world, false); // joinedTo graph is the ONLY connectivity source

        // §10.4 — capture the incumbents BEFORE the gesture.
        const eastBefore = JSON.stringify(world.wallStore.getById('w-east')!.baseLine);
        const westBefore = JSON.stringify(world.wallStore.getById('w-west')!.baseLine);

        expect(moveWall(world, 'w-north', 0, 2).success).toBe(true);

        // §C83 §10.4 — THE INCUMBENT-UNCHANGED ASSERTION.
        expect(JSON.stringify(world.wallStore.getById('w-east')!.baseLine)).toBe(eastBefore);
        expect(JSON.stringify(world.wallStore.getById('w-west')!.baseLine)).toBe(westBefore);

        // Stated positively too, so a reader sees WHERE they stayed: at their
        // original far ends, NOT stretched to the new intersection at z = 6.
        expect(near(bl2(world, 'w-east')[1], [6, 4])).toBe(true);
        expect(near(bl2(world, 'w-west')[0], [0, 4])).toBe(true);
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
        // §C83-10.2.2 — this used to demand >= 1 structural child, i.e. that a
        // cascade re-baselined SOMEONE ELSE. Post-§10.2.2 a junction re-weld
        // that would move an incumbent is refused, so a gesture may legitimately
        // carry ZERO children. What must NOT change is the number of UNDO
        // entries: whatever the gesture did, one Ctrl+Z still undoes all of it,
        // which is what the rest of this test executes.
        expect(history[0]!.structuralChildren?.length ?? 0).toBeGreaterThanOrEqual(0);

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
        // §C83-10.2.2 — the redo replays the SUBJECT and only the subject. The
        // incumbent `ip` stays at [8,3] on the way forward exactly as it stayed
        // there on the way out; a redo that re-ran a mutating cascade against an
        // incumbent would re-open L-922 one keystroke later.
        expect(near(bl2(world, 'ip')[1], [8, 3])).toBe(true);
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

        // The partition moved…
        expect(near(bl2(world, 'p-mid')[0], [0, 5])).toBe(true);
        expect(near(bl2(world, 'p-mid')[1], [6, 5])).toBe(true);
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
