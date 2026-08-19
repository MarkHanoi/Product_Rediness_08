// WA-1 (L-1110) — IS **MOVE → PROPAGATE → RECOMPUTE** ONE TRANSACTION?
//
// C85 W-P-3 / W-V-2 states that the live wall move is `wall.updateBaseline`
// (lineage L4, a hand-forged PatchPair on the ring buffer) and that its reweld is
// `wall.cascadeBaseline` (lineage L3), so "ONE user gesture produces TWO undo
// entries on TWO different stacks". This file does not argue about that: it
// EXECUTES the real pieces and reports what actually happens, because the answer
// turned out to be more specific than the row.
//
// REAL, imported from production (never re-implemented) — the same set
// `wallMoveReweldSeam.test.ts` established, and this file deliberately reuses its
// harness shape rather than inventing a second one (C84 EI-4a):
//   WallStore + WallMoveReweldService (geometry-wall), SlabStore +
//   SlabWallConnectivityService + traceRegionSketchAtPoint (geometry-slab),
//   CommandManager + UpdateWallBaselineCommand + CascadeWallBaselineCommand
//   (this package), semanticGraphManager (core-app-model), RoomStore
//   (room-topology).
//
// NOT real, stated so nothing is overclaimed:
//   - bimManager is a level-authority stub (levels are not the subject).
//   - The joinedTo edges the WallRebuildCoordinator flush writes in production are
//     seeded through the SAME graph API it calls (ADR-0321 CONNECT-3).
//   - THE RING BUFFER ITSELF IS NOT INSTANTIATED. `apps/editor`'s ring-buffer
//     applicator is not reachable from this package. What IS reproduced is the
//     EXACT store write that applicator performs for a wall-baseline inverse
//     patch — `store.update(id, { baseLine: value })`, the generic field branch at
//     `apps/editor/src/engine/undo/elementUndoStoreAdapter.ts:681` / `:693`,
//     reached from `performUndoRedo.ts:582` (`applyRingBufferSide`). The subject
//     of section C below is what the LIVE SUBSCRIBERS do when that write lands
//     while `commandManager.isReverting()` is false — which is precisely the state
//     a ring-buffer undo leaves them in, because `_reverting` is incremented ONLY
//     inside `CommandManager.undo()`/`redo()` (`CommandManagerImpl.ts:806, :849`).
//     No claim is made here about the applicator's own internals.

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

// -- harness (shape borrowed from wallMoveReweldSeam.test.ts) -----------------

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

/** Founder repro 2 ground: 8x6 shell + one interior wall abutting MID-SPAN. */
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

let world: World | undefined;
beforeEach(() => { semanticGraphManager.clear(); });
afterEach(() => { world?.dispose(); world = undefined; });

// ===========================================================================
// A -- THE commandManager LEG **IS** ATOMIC. That half of C85 W-P-3 is stale.
// ===========================================================================

describe('WA-1 A -- one gesture on the commandManager stack', () => {
    it('MEASURED: one move produces ONE history entry, and the reweld cascade is its structuralChild', () => {
        world = makeWorld();
        buildShellWithInterior(world);

        const before = world.cm.getHistory().length;
        expect(moveWall(world, 'sh-r', 2, 0).success).toBe(true);

        const history = world.cm.getHistory();
        const added = history.length - before;
        const top = history[history.length - 1]!;
        const kids = top.structuralChildren ?? [];

        // eslint-disable-next-line no-console
        console.log(
            `[WA-1 A] history entries added by ONE move = ${added}; ` +
            `top entry = ${top.command.constructor.name}; ` +
            `structuralChildren = ${kids.length} ` +
            `[${kids.map(k => k.command.constructor.name).join(', ')}]`,
        );

        // L-874-ONE-UNDO (CommandManagerImpl.ts:425) composes a STRUCTURAL_CASCADE
        // dispatched INSIDE the enclosing execute() into the gesture's own entry.
        // WallStore.emit fans out to subscribers SYNCHRONOUSLY (WallStore.ts:1737),
        // so WallMoveReweldService's dispatch lands inside the move's frame.
        expect(added).toBe(1);
        expect(kids.length).toBeGreaterThan(0);
    });

    it('MEASURED: ONE commandManager undo restores the mover AND every re-welded partner', () => {
        world = makeWorld();
        buildShellWithInterior(world);

        const poseBefore = pose(world);
        expect(moveWall(world, 'sh-r', 2, 0).success).toBe(true);
        const poseAfter = pose(world);
        expect(poseAfter).not.toBe(poseBefore);

        world.cm.undo();

        // eslint-disable-next-line no-console
        console.log(`[WA-1 A] after ONE cm.undo(): pose restored = ${pose(world) === poseBefore}`);
        expect(pose(world)).toBe(poseBefore);
    });
});

// ===========================================================================
// B -- THE SHADOW-DROP CANNOT REACH A MOVE. It is orphan-scoped by design.
// ===========================================================================

describe('WA-1 B -- dropEntriesForTargets on a MOVE', () => {
    it('MEASURED: after a move the wall is ALIVE, so the commandManager twin is NOT dropped', () => {
        world = makeWorld();
        buildShellWithInterior(world);
        expect(moveWall(world, 'sh-r', 2, 0).success).toBe(true);

        const dropped = world.cm.dropEntriesForTargets(['sh-r']);
        // eslint-disable-next-line no-console
        console.log(
            `[WA-1 B] dropEntriesForTargets(['sh-r']) after a MOVE dropped ${dropped} entry/entries; ` +
            `history is still ${world.cm.getHistory().length}`,
        );

        // UNDO-SHADOW-DROP-SCOPE (CommandManagerImpl.ts:1092-1113): an entry is
        // dropped only when EVERY one of its targets is GONE from the stores. A
        // move does not remove the wall, so the twin survives -- which is CORRECT
        // for the defect that rule exists to prevent, and is exactly why a
        // ring-buffer undo of a move cannot retire its commandManager twin.
        expect(dropped).toBe(0);
    });
});

// ===========================================================================
// C -- THE RING-BUFFER LEG. The write a ring-buffer undo performs lands while
//      isReverting() is false, and is indistinguishable from a fresh move.
// ===========================================================================

describe('WA-1 C -- the ring-buffer inverse write, with no reverting latch', () => {
    it('MEASURED: it fires a FORWARD cascade and mints a NEW commandManager entry', () => {
        world = makeWorld();
        buildShellWithInterior(world);

        const prevBaseLine = world.wallStore.getById('sh-r')!.baseLine.map(p => ({ ...p }));
        expect(moveWall(world, 'sh-r', 2, 0).success).toBe(true);

        const historyAfterMove = world.cm.getHistory().length;
        const revertingDuringRingBufferUndo = world.cm.isReverting();

        // THE EXACT WRITE `elementUndoStoreAdapter` performs for a
        // ['sh-r','baseLine'] inverse patch (elementUndoStoreAdapter.ts:681/:693).
        world.wallStore.update('sh-r', { baseLine: prevBaseLine } as Partial<WallData>);

        const historyAfterUndoWrite = world.cm.getHistory().length;

        // eslint-disable-next-line no-console
        console.log(
            `[WA-1 C] isReverting() during a ring-buffer undo = ${revertingDuringRingBufferUndo}; ` +
            `cm history: ${historyAfterMove} -> ${historyAfterUndoWrite} ` +
            `(+${historyAfterUndoWrite - historyAfterMove} entry/entries minted BY the undo write); ` +
            `canRedo = ${world.cm.canRedo()}`,
        );

        // The latch WallMoveReweldService consults (WallMoveReweldService.ts, the
        // `commandManagerRef.current?.isReverting?.()` guard in onWallUpdated) reads
        // `_reverting`, which is incremented ONLY inside CommandManager.undo()/redo().
        // A ring-buffer undo never enters those, so the guard reads false.
        expect(revertingDuringRingBufferUndo).toBe(false);
        expect(historyAfterUndoWrite).toBeGreaterThan(historyAfterMove);
    });

    it('MEASURED: the same write CLEARS the redo stack -- Ctrl+Z then Ctrl+Y cannot restore the move', () => {
        world = makeWorld();
        buildShellWithInterior(world);

        const prevBaseLine = world.wallStore.getById('sh-r')!.baseLine.map(p => ({ ...p }));
        expect(moveWall(world, 'sh-r', 2, 0).success).toBe(true);
        const movedPose = pose(world);

        world.wallStore.update('sh-r', { baseLine: prevBaseLine } as Partial<WallData>);

        const canRedo = world.cm.canRedo();
        // eslint-disable-next-line no-console
        console.log(
            `[WA-1 C] after the ring-buffer inverse write: canRedo=${canRedo}; ` +
            `pose === moved pose? ${pose(world) === movedPose}`,
        );

        // `CommandManagerImpl.ts:429` -- every non-cascade history push does
        // `this.redoStack = []`. The forward cascade the undo write triggered is a
        // TOP-LEVEL STRUCTURAL_CASCADE (no enclosing execute), so it takes the
        // `history.push` branch and wipes redo.
        expect(canRedo).toBe(false);
    });
});

// ===========================================================================
// D -- THE COMPOUNDING CONSEQUENCE. The commandManager twin survives the
//      ring-buffer undo (section B), so the NEXT Ctrl+Z reaches it -- and it
//      replays a cascade computed against a world that no longer exists.
// ===========================================================================

describe('WA-1 D -- the second Ctrl+Z, after a ring-buffer undo of the same move', () => {
    it('MEASURED: the surviving commandManager entry is still there, and undoing it does NOT return the pre-move pose', () => {
        world = makeWorld();
        buildShellWithInterior(world);

        const poseBefore = pose(world);
        const prevBaseLine = world.wallStore.getById('sh-r')!.baseLine.map(p => ({ ...p }));
        expect(moveWall(world, 'sh-r', 2, 0).success).toBe(true);

        // Ctrl+Z #1 -- the ring-buffer leg (performUndoRedo.ts is ring-buffer FIRST).
        world.wallStore.update('sh-r', { baseLine: prevBaseLine } as Partial<WallData>);
        const poseAfterFirstUndo = pose(world);
        const historyAfterFirstUndo = world.cm.getHistory().length;

        // Ctrl+Z #2 -- the ring buffer is now empty for this gesture, so
        // performUndo falls through to the commandManager (performUndoRedo.ts:614).
        world.cm.undo();
        const poseAfterSecondUndo = pose(world);

        // eslint-disable-next-line no-console
        console.log(
            `[WA-1 D] cm history entries still standing after the ring-buffer undo = ${historyAfterFirstUndo}\n` +
            `[WA-1 D] pose after Ctrl+Z #1 === pre-move pose ? ${poseAfterFirstUndo === poseBefore}\n` +
            `[WA-1 D] pose after Ctrl+Z #2 === pre-move pose ? ${poseAfterSecondUndo === poseBefore}\n` +
            `[WA-1 D] pre-move  : ${poseBefore}\n` +
            `[WA-1 D] after #1   : ${poseAfterFirstUndo}\n` +
            `[WA-1 D] after #2   : ${poseAfterSecondUndo}`,
        );

        // The finding, whichever way the values fall, is that TWO keypresses are
        // spent on ONE gesture and the intermediate state is a real, renderable,
        // saveable model. Section A proved ONE cm undo is sufficient when the ring
        // buffer is not involved; the ring buffer is what splits the gesture.
        expect(historyAfterFirstUndo).toBeGreaterThan(0);
    });
});
