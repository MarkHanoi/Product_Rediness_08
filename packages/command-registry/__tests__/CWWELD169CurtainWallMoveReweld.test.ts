// §CWWELD169 (L-12800..) — the founder's curtain-wall room-loss regression,
// EXECUTED at the seam (C72 §3.4: a fixture that hand-builds the state proves
// nothing — every mutation below goes through the REAL commands on the REAL
// stores), mirroring `wallMoveReweldSeam.test.ts`'s L-872 structure exactly.
//
// THE DEFECT THIS REPRODUCES, verbatim from the founder's production console:
//
//   §DIAG-ROOM-LOOP BREAK level='L0' — 2 junction(s) the repair passes did NOT
//   close
//   guest=curtainwall_…ZNGFYCD_s0 on host=curtainwall_…GR4K8F body — endpoint
//   282mm from centreline EXCEEDS hostSnap 200mm
//   §ROOM-LOSS-CENSUS — 2 room(s) dropped by re-detection, 1 carrying authored
//   data … REMOVED and NOT restorable by undo (C94 §TOBE.1.2).
//
// WHY THIS IS THE MID-SPAN (T-JUNCTION / "dependent stem") SHAPE, NOT A
// CORNER: `RoomDetectionEngine`'s own loop-break audit explicitly excludes
// near-endpoint cases (`t<=0.01 || t>=0.99 continue`, RoomDetectionEngine.ts
// :709/:1753) — only a guest endpoint landing MID-SPAN on a host's BODY can
// ever produce the "guest=… on host=… body" sentence the founder saw. A pure
// CORNER gap under 300mm would additionally be silently rescued by
// `_snapNearbyCorners`'s endpoint-clustering pass (RoomDetectionEngine.ts
// :405, threshold 0.30) before the T-junction pass ever runs — so a corner
// fixture could not reproduce this defect at 282mm. The fixture below moves a
// curtain wall far enough (2 m) that BOTH the corner-clustering rescue and the
// T-junction hostSnap rescue are exceeded, so every junction this move
// touches is provably broken pre-fix.
//
// REAL, imported from production (never re-implemented): CurtainWallStore
// (geometry-curtain-wall), CurtainWallMoveReweldService + the pure engine
// (geometry-curtain-wall), CommandManager (this package), UpdateCurtainWallCommand
// / CascadeCurtainWallBaselineCommand / ReDetectRoomsCommand (this package),
// RoomStore + RoomDetectionEngine (room-topology, via ReDetectRoomsCommand).
// NOT real: bimManager is a level-authority stub; no meshes are built.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { CurtainWallStore, CurtainWallMoveReweldService } from '@pryzm/geometry-curtain-wall';
import type { CurtainWallData } from '@pryzm/geometry-curtain-wall';
import { ProjectContext, UiPreferences } from '@pryzm/core-app-model';
import { RoomStore } from '@pryzm/room-topology';
import type { WallStore } from '@pryzm/geometry-wall';

import { CommandManager } from '../src/CommandManagerImpl';
import type { CommandContext } from '../src/types';
import { UpdateCurtainWallCommand } from '../src/curtainwall/UpdateCurtainWallCommand';
import { ReDetectRoomsCommand } from '../src/rooms/ReDetectRoomsCommand';
import {
    CascadeCurtainWallBaselineCommand,
    isCascadeCurtainWallBaselineApplying,
} from '../src/curtainwall/CascadeCurtainWallBaselineCommand';

const LEVEL = 'L0';

// ── harness ──────────────────────────────────────────────────────────────────

function makeBimManager() {
    const level = { id: LEVEL, name: 'Ground', elevation: 0, height: 3, childrenIds: [] as string[] };
    return {
        getLevels: () => [level],
        getLevelById: (id: string) => (id === LEVEL ? level : undefined),
        registerElement: () => {},
        unregisterElement: () => {},
    };
}

function cwRecord(id: string, s: [number, number], e: [number, number], mullionSize = 0.08): CurtainWallData {
    return {
        id, type: 'curtain-wall', levelId: LEVEL, properties: {},
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 3, baseOffset: 0,
        gridXSpacing: 1.5, gridYSpacing: 3,
        mullionSize, panelThickness: 0.02,
    } as CurtainWallData;
}

interface World {
    curtainWallStore: CurtainWallStore;
    roomStore: RoomStore;
    cm: CommandManager;
    reweldService?: CurtainWallMoveReweldService;
    dispose(): void;
}

/** Builds the production wiring against REAL stores. `withReweld:false`
 *  reproduces the PRE-FIX state (no CurtainWallMoveReweldService at all —
 *  §CWWELD169's measured starting point). */
function makeWorld(opts: { withReweld: boolean }): World {
    const bimManager = makeBimManager();
    const curtainWallStore = new CurtainWallStore();
    const roomStore = new RoomStore(new ProjectContext() as never, bimManager as never);
    // RoomDetectionEngine's wallStore param is required (not optional) even
    // when a level has no walls at all — an empty stub mirrors
    // `curtainWallRoomBounding.test.ts`'s `wallStub`.
    const wallStore = { getByLevel: () => [] } as unknown as WallStore;

    const ctx = {
        stores: { curtainWallStore, roomStore, wallStore },
        bimManager,
    } as unknown as CommandContext;
    const cm = new CommandManager(ctx);

    let reweldService: CurtainWallMoveReweldService | undefined;
    if (opts.withReweld) {
        reweldService = new CurtainWallMoveReweldService(curtainWallStore, {
            commandManagerRef: { current: cm },
            makeCascadeCommand: (input) => new CascadeCurtainWallBaselineCommand(input),
            isCascadeApplying: isCascadeCurtainWallBaselineApplying,
        });
    }

    return {
        curtainWallStore, roomStore, cm, reweldService,
        dispose() { reweldService?.dispose(); },
    };
}

/** Commit a whole-curtain-wall translation through the REAL move command
 *  (`wall.updateCurtainWall`'s executor) — mirrors `moveWall` in
 *  `wallMoveReweldSeam.test.ts`. */
function moveCurtainWall(world: World, id: string, dx: number, dz: number) {
    const cw = world.curtainWallStore.getById(id)!;
    return world.cm.execute(new UpdateCurtainWallCommand({
        id,
        updates: {
            baseLine: [
                { x: cw.baseLine[0].x + dx, y: cw.baseLine[0].y, z: cw.baseLine[0].z + dz },
                { x: cw.baseLine[1].x + dx, y: cw.baseLine[1].y, z: cw.baseLine[1].z + dz },
            ],
        },
    }));
}

const bl2 = (world: World, id: string): [number, number][] => {
    const b = world.curtainWallStore.getById(id)!.baseLine;
    return [[b[0].x, b[0].z], [b[1].x, b[1].z]];
};

const near = (a: [number, number], b: [number, number], eps = 1e-6): boolean =>
    Math.hypot(a[0] - b[0], a[1] - b[1]) < eps;

function redetect(world: World): string[] {
    const res = world.cm.execute(new ReDetectRoomsCommand(LEVEL, 0, 3));
    expect(res.success).toBe(true);
    return world.roomStore.getByLevel(LEVEL).map(r => r.id).sort();
}

/** The founder's shape: an 8x6 curtain-wall shell (4 CW sides) split into TWO
 *  rooms by an interior curtain-wall partition landing MID-SPAN on the east
 *  and west sides — the T-junction shape the DIAG audit's own exclusion
 *  (`t<=0.01||t>=0.99`) proves his log line must have been. */
function buildShellWithCurtainPartition(world: World): void {
    world.curtainWallStore.add(cwRecord('cw-b', [0, 0], [8, 0]));
    world.curtainWallStore.add(cwRecord('cw-r', [8, 0], [8, 6]));
    world.curtainWallStore.add(cwRecord('cw-t', [8, 6], [0, 6]));
    world.curtainWallStore.add(cwRecord('cw-l', [0, 6], [0, 0]));
    // Mid-span on BOTH cw-l (x=0, z=3 -> t=0.5) and cw-r (x=8, z=3 -> t=0.5).
    world.curtainWallStore.add(cwRecord('cw-ip', [0, 3], [8, 3]));
}

// ── lifecycle ────────────────────────────────────────────────────────────────

let world: World | undefined;

beforeEach(() => {
    UiPreferences.set('roomBoundingCurtainWalls', true);
});

afterEach(() => {
    world?.dispose();
    world = undefined;
});

// ════════════════════════════════════════════════════════════════════════════
// §CWWELD169 — the founder's room-loss regression
// ════════════════════════════════════════════════════════════════════════════

describe('§CWWELD169 — curtain-wall CW↔CW move re-weld (the founder\'s 282mm room loss)', () => {
    it('RED — DEFECT PIN (no CurtainWallMoveReweldService): moving a curtain wall leaves every '
        + 'CW↔CW junction it touched open, and re-detection drops a room', () => {
        world = makeWorld({ withReweld: false }); // measured starting point: zero curtain-wall coverage
        buildShellWithCurtainPartition(world);

        const before = redetect(world);
        expect(before.length).toBe(2); // the partition seals two rooms

        // Founder gesture: move the east curtain wall outward by 2 m — far
        // enough that neither `_snapNearbyCorners` (0.30 m) nor the T-junction
        // hostSnap floor (0.20 m) can mask the break (see the module header).
        const res = moveCurtainWall(world, 'cw-r', 2, 0);
        expect(res.success).toBe(true);

        // Nothing followed: the two corners AND the T-stem are all left exactly
        // where they stood before the move — this engine did not exist yet.
        expect(near(bl2(world, 'cw-b')[1], [8, 0])).toBe(true);
        expect(near(bl2(world, 'cw-t')[0], [8, 6])).toBe(true);
        expect(near(bl2(world, 'cw-ip')[1], [8, 3])).toBe(true);

        // And re-detection drops at least one room — the founder's measured
        // consequence (`§ROOM-LOSS-CENSUS … REMOVED and NOT restorable by undo`).
        const after = redetect(world);
        expect(after.length).toBeLessThan(2);
    });

    it('GREEN — WITH CurtainWallMoveReweldService: every CW↔CW junction the move touched follows, '
        + 'in ONE undo entry, and both rooms survive with their identities intact', () => {
        world = makeWorld({ withReweld: true });
        buildShellWithCurtainPartition(world);

        const before = redetect(world);
        expect(before.length).toBe(2);

        const historyBefore = world.cm.getHistory().length;
        const res = moveCurtainWall(world, 'cw-r', 2, 0);
        expect(res.success).toBe(true);

        // ── The two MUTUAL CORNERS followed, pivoting at their OWN far ends ──
        expect(near(bl2(world, 'cw-b')[1], [10, 0])).toBe(true);
        expect(near(bl2(world, 'cw-b')[0], [0, 0])).toBe(true);   // far end untouched
        expect(near(bl2(world, 'cw-t')[0], [10, 6])).toBe(true);
        expect(near(bl2(world, 'cw-t')[1], [0, 6])).toBe(true);   // far end untouched

        // ── The DEPENDENT STEM followed — the founder's exact measured shape:
        //    a curtain wall terminating MID-SPAN on another curtain wall's
        //    body, re-seated at the SAME station on the host's new line, its
        //    far end (on cw-l, untouched by this move) exactly fixed. ──
        expect(near(bl2(world, 'cw-ip')[1], [10, 3])).toBe(true); // followed cw-r
        expect(near(bl2(world, 'cw-ip')[0], [0, 3])).toBe(true);  // far end fixed (on cw-l)

        // ── C16 §8.6 — ONE gesture, ONE undo entry: the subject move plus the
        //    three dependent re-seats are all ONE history entry, not four. ──
        expect(world.cm.getHistory().length).toBe(historyBefore + 1);

        // ── THE FOUNDER-LEVEL ASSERTION: both rooms survive, same identities. ──
        const after = redetect(world);
        expect(after.length).toBe(2);
        expect(after).toEqual(before);
    });

    it('ONE undo restores every re-seated curtain wall to its pre-move baseline', () => {
        world = makeWorld({ withReweld: true });
        buildShellWithCurtainPartition(world);
        redetect(world);

        const snapshot = new Map<string, string>();
        for (const cw of world.curtainWallStore.getAll()) {
            snapshot.set(cw.id, JSON.stringify(cw.baseLine));
        }

        expect(moveCurtainWall(world, 'cw-r', 2, 0).success).toBe(true);
        expect(world.cm.canUndo()).toBe(true);

        world.cm.undo();
        for (const [id, blJson] of snapshot) {
            expect(JSON.stringify(world.curtainWallStore.getById(id)!.baseLine)).toBe(blJson);
        }
    });
});
