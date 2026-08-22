// §L-4101 — THE RING-BUFFER LEG OF THE UNDO IS NOW LATCHED. The regression half
// of `WA1MoveTransactionAtomicity.measure.test.ts` (L-1110), which MEASURED this
// break and deliberately asserted nothing about fixing it.
//
// ── THE FOUNDER'S REPORT, 2026-08-21, verbatim ───────────────────────────────
//   "I moved the walls — the BIM 3.0 process worked and moved the slab and
//    adjacent walls too. But then I used the new undo dropdown, clicked two
//    steps back, and the adjacent walls did NOT move."
//
// ── THE MECHANISM, and it is NOT the one three readings of the log predicted ──
// It is not that `CascadeWallBaselineCommand.undo()` recomputes (it does not — it
// calls `wallStore.restoreSnapshot()` on values captured in `execute()` Phase 1).
// It is not that the partner MESHES failed to rebuild (the store itself is wrong;
// this file reads the baselines back out of it).
//
// It is that the RING-BUFFER leg of `performUndo()` — the leg it tries FIRST —
// runs with `commandManager.isReverting() === false`, because `_reverting` is
// incremented ONLY inside `CommandManager.undo()`/`redo()`. A ring-buffer inverse
// patch reaches the store as a plain `store.update(id, { baseLine })` (the field
// branch of `apps/editor/src/engine/undo/elementUndoStoreAdapter.ts`), which is
// byte-indistinguishable from a fresh user drag. `WallMoveReweldService` and
// `SlabWallConnectivityService` both gate on that flag, so both treated the UNDO
// as a MOVE and dispatched a **new forward cascade** — minting history entries
// while the undo was still running, and wiping the redo stack.
//
// The history-dropdown jump is the AMPLIFIER, not a second bug: `undoThrough(n)`
// is `n+1` sequential `performUndo()` calls, so step 1 mints a cascade and step 2
// undoes THAT cascade — whose captured "before" is the partner's DISPLACED pose.
// Both steps report success. The founder's HUD printed `requested 2, completed 2`
// and his log popped `UNDO: CASCADE_WALL_BASELINE (history remaining: 1)` — the
// cascade step 1 had just minted, with the ORIGINAL gesture's entry still standing
// underneath it, never reached.
//
// ── WHAT THIS FILE ASSERTS, and why each arm exists ──────────────────────────
// ARM 1 pins the DEFECT as it stands with no latch (the L-1110 measurement, now
//   asserted rather than printed) so this file cannot go green by the fixture
//   drifting away from the bug.
// ARM 2 is the FIX: the identical write, inside `beginExternalRevert()` /
//   `endExternalRevert()`, mints nothing and preserves redo.
// ARM 3 is the FOUNDER-LEVEL assertion: two undo steps, in the order
//   `performUndo` actually takes them, land on the pre-move pose EXACTLY —
//   partners included. This is the line that would have caught the report.
// ARM 4 pins the latch is depth-counted and floors at 0, because a latch stuck
//   RAISED silences every structural cascade for the rest of the session, which
//   is a worse defect than the one being closed.
//
// REAL, imported from production (never re-implemented) — the same set
// `WA1MoveTransactionAtomicity.measure.test.ts` established, and this file
// deliberately reuses that harness shape rather than inventing a second one
// (C84 EI-4a):
//   WallStore + WallMoveReweldService (geometry-wall), SlabStore +
//   SlabWallConnectivityService + traceRegionSketchAtPoint (geometry-slab),
//   CommandManager + UpdateWallBaselineCommand + CascadeWallBaselineCommand
//   (this package), semanticGraphManager (core-app-model), RoomStore.
//
// NOT real, stated so nothing is overclaimed:
//   - bimManager is a level-authority stub (levels are not the subject).
//   - joinedTo edges are seeded through the SAME graph API the production writer
//     (`WallRebuildCoordinator._flush`) calls — ADR-0321 §CONNECT-3.
//   - THE RING BUFFER ITSELF IS NOT INSTANTIATED; `apps/editor`'s applicator is
//     not reachable from this package. What is reproduced is the EXACT store
//     write it performs for a `[wallId,'baseLine']` inverse op, and the exact
//     latch call `performUndoRedo._withPausedObservers` now wraps it in. The
//     apps/editor half — that `_withPausedObservers` really raises the latch
//     around `applyRingBufferSide` — is pinned separately in
//     `apps/editor/__tests__/performUndoRedo.test.ts` §L-4101.
//   - No meshes are built. The subject is the BASELINES IN THE STORE, which is
//     precisely what distinguishes this root cause from a rebuild-dispatch one.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { WallStore, WallMoveReweldService } from '@pryzm/geometry-wall';
import type { WallData } from '@pryzm/geometry-wall';
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

import { CommandManager } from '../src/CommandManagerImpl';
import type { CommandContext } from '../src/types';
import { UpdateWallBaselineCommand } from '../src/walls/UpdateWallBaselineCommand';
import {
    CascadeWallBaselineCommand,
    isCascadeWallBaselineApplying,
} from '../src/walls/CascadeWallBaselineCommand';

const LEVEL = 'L0';

// ── harness (shape borrowed from WA1MoveTransactionAtomicity.measure.test.ts) ─

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
    cm: CommandManager;
    dispose(): void;
}

function makeWorld(): World {
    const bimManager = makeBimManager();
    const wallStore = new WallStore(
        new ProjectContext(),
        makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
    );
    const slabStore = new SlabStore();
    const roomStore = new RoomStore(new ProjectContext() as never, bimManager as never);

    const ctx = { stores: { wallStore, slabStore, roomStore }, bimManager } as unknown as CommandContext;
    const cm = new CommandManager(ctx);

    Object.assign(window, { wallStore });

    // Production ORDER (engineLauncher.ts): slab connectivity first, reweld second.
    const slabService = new SlabWallConnectivityService(
        slabStore,
        wallStore as unknown as ConstructorParameters<typeof SlabWallConnectivityService>[1],
        () => false,
        cm,
    );
    slabService.bootstrap();

    const reweldService = new WallMoveReweldService(wallStore, {
        commandManagerRef: { current: cm },
        makeCascadeCommand: (input) => new CascadeWallBaselineCommand(input),
        getJoinedWalls: (wallId) => semanticGraphManager.getJoinedWalls(wallId),
        isCascadeApplying: isCascadeWallBaselineApplying,
    });

    return {
        wallStore, slabStore, cm,
        dispose() {
            reweldService.dispose();
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

/** Founder repro ground: 8×6 shell + one interior wall abutting MID-SPAN. */
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

const ALL = ['sh-b', 'sh-r', 'sh-t', 'sh-l', 'ip'] as const;
const pose = (world: World): string =>
    JSON.stringify(ALL.map(id => {
        const b = world.wallStore.getById(id)!.baseLine;
        return [id, [b[0].x, b[0].z], [b[1].x, b[1].z]];
    }));

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

/**
 * THE EXACT WRITE `elementUndoStoreAdapter` performs for a `[id,'baseLine']`
 * inverse op, reached from `performUndoRedo.ts` → `applyRingBufferSide`.
 * `latched` selects whether it runs inside the §L-4101 revert latch — i.e.
 * whether it is the code as it stood, or the code as it stands.
 */
function ringBufferInverseWrite(
    world: World, id: string, baseLine: readonly { x: number; y: number; z: number }[],
    latched: boolean,
): void {
    if (latched) world.cm.beginExternalRevert();
    try {
        world.wallStore.update(id, { baseLine } as Partial<WallData>);
    } finally {
        if (latched) world.cm.endExternalRevert();
    }
}

let world: World | undefined;
beforeEach(() => { semanticGraphManager.clear(); });
afterEach(() => { world?.dispose(); world = undefined; });

// ═══════════════════════════════════════════════════════════════════════════
// ARM 1 — THE DEFECT, ASSERTED. Without the latch, the undo mints a cascade.
// ═══════════════════════════════════════════════════════════════════════════

describe('§L-4101 ARM 1 — UNLATCHED (the state the founder hit)', () => {
    it('a ring-buffer inverse write MINTS forward cascade entries and WIPES the redo stack', () => {
        world = makeWorld();
        buildShellWithInterior(world);

        const prevBaseLine = world.wallStore.getById('sh-r')!.baseLine.map(p => ({ ...p }));
        expect(moveWall(world, 'sh-r', 2, 0).success).toBe(true);
        world.cm.undo();                       // put a real entry on the redo stack
        world.cm.redo();
        expect(world.cm.getHistory().length).toBe(1);

        const historyBefore = world.cm.getHistory().length;
        expect(world.cm.isReverting()).toBe(false);

        ringBufferInverseWrite(world, 'sh-r', prevBaseLine, /* latched */ false);

        // The undo write is indistinguishable from a drag, so the services
        // dispatched. This is L-1110 §C, asserted rather than printed.
        expect(world.cm.getHistory().length).toBeGreaterThan(historyBefore);
        expect(world.cm.canRedo()).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// ARM 2 — THE FIX. Same write, inside the latch: nothing minted, redo intact.
// ═══════════════════════════════════════════════════════════════════════════

describe('§L-4101 ARM 2 — LATCHED', () => {
    it('the identical write mints NOTHING and leaves the redo stack alone', () => {
        world = makeWorld();
        buildShellWithInterior(world);

        const prevBaseLine = world.wallStore.getById('sh-r')!.baseLine.map(p => ({ ...p }));
        expect(moveWall(world, 'sh-r', 2, 0).success).toBe(true);

        const historyBefore = world.cm.getHistory().length;

        ringBufferInverseWrite(world, 'sh-r', prevBaseLine, /* latched */ true);

        // ⭐ THE LINE THAT CLOSES THE TREADMILL. Not "fewer entries" — ZERO new
        // entries: the history's own cascade is the one that reverts the
        // partners, and a second answer computed against a half-reverted world
        // is exactly what put them back where the move had left them.
        expect(world.cm.getHistory().length).toBe(historyBefore);
        // …and the latch was lowered again, so the NEXT real gesture cascades.
        expect(world.cm.isReverting()).toBe(false);
    });

    it('the subject IS reverted by the write — the latch silences the CASCADE, not the store', () => {
        world = makeWorld();
        buildShellWithInterior(world);

        const prevBaseLine = world.wallStore.getById('sh-r')!.baseLine.map(p => ({ ...p }));
        expect(moveWall(world, 'sh-r', 2, 0).success).toBe(true);

        ringBufferInverseWrite(world, 'sh-r', prevBaseLine, /* latched */ true);

        const b = world.wallStore.getById('sh-r')!.baseLine;
        expect([b[0]!.x, b[0]!.z, b[1]!.x, b[1]!.z]).toEqual([8, 0, 8, 6]);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// ARM 3 — ⭐ THE FOUNDER-LEVEL ASSERTION. Two steps back, everything returns.
// ═══════════════════════════════════════════════════════════════════════════

describe('§L-4101 ARM 3 — the two-step dropdown jump, in performUndo order', () => {
    /**
     * `undoThrough(1)` is TWO sequential `performUndo()` calls, and `performUndo`
     * is RING-BUFFER FIRST. So the order reproduced here is the production one:
     *   step 1 → the ring-buffer inverse write (the subject's baseline)
     *   step 2 → `commandManager.undo()` (the gesture entry + its cascades)
     *
     * The measurement that settles the diagnosis is the LAST line: the partner
     * `ip`'s baseline is read back OUT OF THE STORE. If it is right here and the
     * screen is still wrong, the remaining defect is a mesh rebuild; if it is
     * wrong here, no rebuild could have saved it. Before the latch it read
     * `[0.1,3]→[9.9,3]` — displaced — while every step reported success.
     */
    it('lands on the pre-move pose EXACTLY, partners included', () => {
        world = makeWorld();
        buildShellWithInterior(world);

        const poseBefore = pose(world);
        const prevBaseLine = world.wallStore.getById('sh-r')!.baseLine.map(p => ({ ...p }));

        expect(moveWall(world, 'sh-r', 2, 0).success).toBe(true);
        expect(pose(world)).not.toBe(poseBefore);   // the move really happened

        ringBufferInverseWrite(world, 'sh-r', prevBaseLine, /* latched */ true);   // step 1
        world.cm.undo();                                                          // step 2

        expect(pose(world)).toBe(poseBefore);

        // Named separately, because "the adjacent walls did NOT move" is the
        // founder's whole sentence and a pose string is not readable in a diff.
        const ip = world.wallStore.getById('ip')!.baseLine;
        expect([ip[0]!.x, ip[0]!.z, ip[1]!.x, ip[1]!.z]).toEqual([0.1, 3, 7.9, 3]);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// ARM 4 — THE LATCH ITSELF. Depth-counted, and it cannot stick raised.
// ═══════════════════════════════════════════════════════════════════════════

describe('§L-4101 ARM 4 — the latch is depth-counted and floors at 0', () => {
    it('nests, and only the outermost end re-arms the services', () => {
        world = makeWorld();
        expect(world.cm.isReverting()).toBe(false);
        world.cm.beginExternalRevert();
        world.cm.beginExternalRevert();
        expect(world.cm.isReverting()).toBe(true);
        world.cm.endExternalRevert();
        expect(world.cm.isReverting()).toBe(true);    // still inside the outer one
        world.cm.endExternalRevert();
        expect(world.cm.isReverting()).toBe(false);
    });

    it('an UNBALANCED end cannot drive the counter negative and disarm the latch', () => {
        world = makeWorld();
        world.cm.endExternalRevert();
        world.cm.endExternalRevert();
        // If the counter had gone to −2, this begin would leave it at −1 and
        // `isReverting()` would read FALSE inside a revert — the original defect,
        // rebuilt by an arithmetic slip instead of a missing call.
        world.cm.beginExternalRevert();
        expect(world.cm.isReverting()).toBe(true);
        world.cm.endExternalRevert();
        expect(world.cm.isReverting()).toBe(false);
    });
});

// ==========================================================================
// ARM 5 — ⭐ IS THE FOUNDER'S 2026-08-22 MODEL RECOVERABLE? (ISSUE-LOG L-4706)
// ==========================================================================

describe('§L-4706 ARM 5 — the 55 m drag with ZERO re-weld entries, and one Ctrl+Z', () => {
    /**
     * Founder, 2026-08-22: he grabbed an existing wall believing he was drawing
     * one, and dragged it fifty-five metres. `[PlanDrag] Wall committed
     * Δ( -55.000 , -20.700 )`.
     *
     * ⭐ THE SHAPE THAT MADE THIS WORTH MEASURING RATHER THAN ASSERTING FROM THE
     * ARCHITECTURE: his re-weld produced **0 entries and 0 refusals** —
     *
     *   §MOVE-REWELD-EMPTY-PLAN — 5 partner(s) considered, 0 re-weld entries and
     *   0 refusals. NOT_WELDED_TO_SUBJECT_PREV_SEGMENT(51943/500 mm) ×5
     *
     * — because after 55 m every partner is 51 m from where the wall used to be,
     * against a 500 mm weld tolerance. A gesture with no cascade behind it is
     * precisely the shape that USED to leave partners stranded: the ring-buffer
     * leg minted a forward cascade of its own (L-4100) and the next step undid
     * THAT instead of the move.
     *
     * This arm answers the founder's practical question — *can I get my building
     * back?* — at the store, on that exact shape.
     */
    function buildFarWallAndPartition(w: World): void {
        // A partition the subject will be swept straight THROUGH, and a subject
        // parked 55 m away from it. No joinedTo edges are seeded: the graph
        // refuses, the service falls to the level scan, and every partner scores
        // NOT_WELDED — reproducing `0 entries, 0 refusals`.
        w.wallStore.add(wallRecord('w-part', [0, -5], [0, 5]));
        w.wallStore.add(wallRecord('w-sub', [-5, 55], [5, 55]));
    }

    const pose2 = (w: World): string =>
        JSON.stringify(['w-part', 'w-sub'].map(id => {
            const b = w.wallStore.getById(id)!.baseLine;
            return [id, [b[0]!.x, b[0]!.z], [b[1]!.x, b[1]!.z]];
        }));

    it('ONE undo step restores the whole gesture, and mints nothing on the way', () => {
        world = makeWorld();
        buildFarWallAndPartition(world);

        const poseBefore = pose2(world);
        const prevBaseLine = world.wallStore.getById('w-sub')!.baseLine.map(p => ({ ...p }));

        expect(moveWall(world, 'w-sub', 0, -55).success).toBe(true);
        expect(pose2(world)).not.toBe(poseBefore);          // the 55 m move really happened

        // The shape the founder hit: no cascade rode along, so there is exactly
        // ONE thing on the stack and exactly ONE thing to put back. Asserted
        // rather than assumed — if a cascade DOES appear here the fixture has
        // stopped reproducing his gesture and every line below is about
        // something else.
        const history = world.cm.getHistory();
        const top = history[history.length - 1]!;
        expect((top.structuralChildren ?? []).length).toBe(0);
        const historyAfterMove = history.length;

        // Ctrl+Z — the ring-buffer leg, latched (§L-4101).
        ringBufferInverseWrite(world, 'w-sub', prevBaseLine, /* latched */ true);

        // ⭐ THE ANSWER: the model is recoverable in one step.
        expect(pose2(world)).toBe(poseBefore);
        // …and the undo did not grow the stack it was consuming.
        expect(world.cm.getHistory().length).toBe(historyAfterMove);
        expect(world.cm.isReverting()).toBe(false);
    });

    it('UNLATCHED, the same recovery still lands — but only because the cascade was EMPTY', () => {
        // ⚠ RECORDED SO NOBODY CONCLUDES THE LATCH WAS UNNECESSARY HERE. On this
        // ONE shape the treadmill is harmless: the partners are 51 m away, so the
        // cascade the unlatched undo triggers has nothing to propose and mints
        // nothing. That is a property of THIS fixture, not of the undo — ARM 1
        // above is the same write on a WELDED fixture and it mints entries.
        // Stating the difference is the point: 'it happened to work' and 'it is
        // correct' are not the same value.
        world = makeWorld();
        buildFarWallAndPartition(world);

        const poseBefore = pose2(world);
        const prevBaseLine = world.wallStore.getById('w-sub')!.baseLine.map(p => ({ ...p }));
        expect(moveWall(world, 'w-sub', 0, -55).success).toBe(true);
        const historyAfterMove = world.cm.getHistory().length;

        ringBufferInverseWrite(world, 'w-sub', prevBaseLine, /* latched */ false);

        expect(pose2(world)).toBe(poseBefore);
        expect(world.cm.getHistory().length).toBe(historyAfterMove);
    });
});
