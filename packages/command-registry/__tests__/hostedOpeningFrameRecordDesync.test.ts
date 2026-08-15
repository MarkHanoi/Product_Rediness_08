// §MEASURED-DESYNC (L-916) — the founder's "the hole stays, the frame walks away".
//
// THE REPORT (deploy 9e780581, verbatim)
// ----------------------------------------------------------------------------
//   "the wall moves and a window (or door) hosted on the connected wall that
//    needs to join the wall that moved — the opening remains in the correct
//    place — but the window / door frame element itself moves (error)"
//
// Their console shows `CascadeWallBaselineCommand §HOSTED-OPENING-HOST-MOVE
// re-seated window … offset 4.113 → 6.375 m (cause 'slab-connectivity')` on a
// wall they never dragged.
//
// WHY THIS FILE EXISTS, next to hostedOpeningHostMoveSeam.test.ts
// ----------------------------------------------------------------------------
// That file asks the RIGHT question of the WRONG HALF of the model. Every one of
// its assertions reads `wallStore.getById(wallId).openings[]` — the record that
// drives the CSG VOID — and it reads the hosted element's store only for
// `doorStore.has(id)`, i.e. existence, never POSITION. So the whole §Z family
// passes while the two records hold different numbers.
//
// A hosted opening is described TWICE, and both descriptions carry an `offset`:
//
//   RECORD A — `WallData.openings[]` (+ `WallStore.windows` / `.doors`, which
//              `updateOpening` writes through). Drives the VOID: the wall
//              fragment/CSG builders subtract from this. It is the record that
//              PERSISTS (register MT-06).
//   RECORD B — `@pryzm/geometry-window`'s `windowStore` / `@pryzm/geometry-door`'s
//              `doorStore`. Drives the FRAME MESH: `WindowBuilder` /
//              `DoorBuilder` subscribe to THESE stores and position their
//              geometry group from `record.offset` along the host baseline.
//
// `MoveWindowCommand.execute` writes BOTH, and says so in a comment —
// "Sync the new WindowStore so WindowBuilder repositions its geometry group."
// `CascadeWallBaselineCommand` (and `UpdateWallBaselineCommand`'s shrink refit)
// write only RECORD A. `WindowDependencyTracker` then observes the wall
// geometry change and calls `windowStore.touch(id)`, so the frame IS rebuilt —
// from the STALE offset, against the NEW baseline. Void correct, frame walked.
// That is the founder's screenshot exactly: a clean void with nothing in it.
//
// CONTRACT MAPPING
//   C15 §2 — a hosted element has no independent world coordinate; its world
//            position is `baseLine[0] + f(offset) × wallDir`. TWO records both
//            claiming that offset must agree or the element is in two places.
//   C15 §6 — host relationships stay in lock-step across a structural edit.
//   C11 §5.4 — the fix belongs at the ONE chokepoint the cascade passes through.
//   C70 C-INV-3 — a move mints no new identity; ONE undo restores what was there.
//
// REAL, imported from production: WallStore + WallMoveReweldService, SlabStore +
// SlabWallConnectivityService + traceRegionSketchAtPoint, CommandManager +
// UpdateWallBaselineCommand + CreateWallOpeningCommand +
// CascadeWallBaselineCommand, doorStore, windowStore, semanticGraphManager.
// NOT real: `bimManager` is a level-authority stub and no meshes are built —
// the subject is the RECORD PAIR, not the triangulation. The harness is
// hostedOpeningHostMoveSeam's, structurally verbatim, so a divergence here is a
// divergence in the SUBJECT.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { WallStore, WallMoveReweldService } from '@pryzm/geometry-wall';
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
import {
    CascadeWallBaselineCommand,
    isCascadeWallBaselineApplying,
} from '../src/walls/CascadeWallBaselineCommand';

const LEVEL = 'L0';

// ── harness (hostedOpeningHostMoveSeam's shape) ──────────────────────────────

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

interface World {
    wallStore: WallStore;
    slabStore: SlabStore;
    cm: CommandManager;
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

const openingsOf = (world: World, wallId: string): Opening[] =>
    (world.wallStore.getById(wallId)!.openings ?? []) as Opening[];

const openingOf = (world: World, wallId: string, elementId: string): Opening | undefined =>
    openingsOf(world, wallId).find(o => o.elementId === elementId);

const wallLength = (world: World, id: string): number => {
    const b = world.wallStore.getById(id)!.baseLine;
    return Math.hypot(b[1].x - b[0].x, b[1].z - b[0].z);
};

/** Place a hosted opening through the REAL creation command; return its elementId. */
function addOpening(
    world: World,
    wallId: string,
    kind: 'door' | 'window',
    opts: { offset: number; width?: number },
): string {
    const before = new Set(openingsOf(world, wallId).map(o => o.elementId));
    const res = world.cm.execute(new CreateWallOpeningCommand({
        wallId,
        openingData: kind === 'window'
            ? { type: 'window', offset: opts.offset, width: opts.width ?? 1.2, height: 1.4, sillHeight: 0.9, windowType: 'single' }
            : { type: 'door',   offset: opts.offset, width: opts.width ?? 0.9, height: 2.1, sillHeight: 0,   doorType: 'single' },
    }));
    expect(res.success).toBe(true);
    const created = openingsOf(world, wallId).find(o => !before.has(o.elementId))!;
    expect(created).toBeDefined();
    return created.elementId as string;
}

/**
 * THE TWO OFFSETS, side by side. `void` is RECORD A (the wall's own
 * `openings[]`, what the CSG subtracts); `frame` is RECORD B (the hosted
 * element store `WindowBuilder`/`DoorBuilder` positions its mesh from).
 * They are written from the same number by every correct writer
 * (`MoveWindowCommand`, `SetWindowOffsetCommand`, `WallStore.updateOpening`
 * → `updateWindow`), so they are directly comparable — no convention
 * conversion, and none is invented here.
 */
function offsets(world: World, wallId: string, elementId: string, kind: 'door' | 'window') {
    const voidOffset = openingOf(world, wallId, elementId)?.offset;
    const rec = kind === 'window' ? windowStore.getById(elementId) : doorStore.getById(elementId);
    return { void: voidOffset, frame: rec?.offset, hasRecord: !!rec };
}

function report(label: string, o: { void?: number; frame?: number }) {
    // §MEASURE — the log records the ACTUAL numbers, per this repo's standing
    // "measure before you fix" rule (see commit 59bc6f71, L-912).
    const d = (o.void !== undefined && o.frame !== undefined)
        ? (o.frame - o.void).toFixed(6)
        : 'n/a';
    console.log(
        `[§MEASURED-DESYNC] ${label}: VOID offset=${o.void?.toFixed(6) ?? 'undefined'} m  ` +
        `FRAME offset=${o.frame?.toFixed(6) ?? 'undefined'} m  Δ(frame−void)=${d} m`,
    );
}

// ── the founder's ground: a 6×4 perimeter loop ───────────────────────────────
// w-south [0,0]→[6,0]  w-east [6,0]→[6,4]  w-north [6,4]→[0,4]  w-west [0,4]→[0,0]
// Dragging w-north re-welds w-east at its baseLine[1] and w-west at its
// baseLine[0]. Offsets are measured FROM baseLine[0], so only the w-west arm
// forces a compensating re-seat — which is precisely the founder's arm.

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
// §D-1 — CONTROL. The two records agree at rest, and after the ONE gesture
//        that is already known to write both (MoveWindowCommand's seam).
//        Without this row a failure below could be "they never agreed".
// ════════════════════════════════════════════════════════════════════════════

describe('§D-1 — control: the two records agree the moment the opening is created', () => {
    it('a freshly created window has the SAME offset in the wall record and the frame record', () => {
        world = makeWorld();
        buildLoop(world, false);
        const win = addOpening(world, 'w-west', 'window', { offset: 1.0 });

        const o = offsets(world, 'w-west', win, 'window');
        report('§D-1 window at rest', o);
        expect(o.hasRecord, 'the frame record must exist — else §D-2 measures nothing').toBe(true);
        expect(o.frame).toBeCloseTo(o.void!, 9);
    });

    it('a freshly created door has the SAME offset in the wall record and the frame record', () => {
        world = makeWorld();
        buildLoop(world, false);
        const door = addOpening(world, 'w-west', 'door', { offset: 1.0 });

        const o = offsets(world, 'w-west', door, 'door');
        report('§D-1 door at rest', o);
        expect(o.hasRecord).toBe(true);
        expect(o.frame).toBeCloseTo(o.void!, 9);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §D-2 — THE FOUNDER'S GESTURE. Drag w-north; w-west is re-welded at its
//        baseLine[0] by CascadeWallBaselineCommand, which re-seats the opening
//        to hold its world position. Does the FRAME record follow?
// ════════════════════════════════════════════════════════════════════════════

describe('§D-2 — cascade re-seat: the VOID record and the FRAME record must not diverge', () => {
    it('§MEASURED-DESYNC — a window on the connected wall: both offsets after the neighbour drag', () => {
        world = makeWorld();
        buildLoop(world, false);
        const win = addOpening(world, 'w-west', 'window', { offset: 1.0 });

        const before = offsets(world, 'w-west', win, 'window');
        report('§D-2 window BEFORE drag', before);
        expect(before.void).toBeCloseTo(1.0, 9);
        expect(before.frame).toBeCloseTo(1.0, 9);

        // The user drags w-north outward 2 m. w-west grows 4 m → 6 m AT baseLine[0],
        // so the cascade must add 2 m to the offset to hold the world position.
        expect(moveWall(world, 'w-north', 0, 2).success).toBe(true);
        expect(wallLength(world, 'w-west')).toBeCloseTo(6, 9);

        const after = offsets(world, 'w-west', win, 'window');
        report('§D-2 window AFTER drag', after);

        // The VOID record did its job: re-seated to hold world position.
        expect(after.void, 'the cascade re-seated the wall-side opening').toBeCloseTo(3.0, 9);

        // THE ASSERTION THE SEAM SUITE NEVER MADE. One gesture, one element,
        // one position — the two records that describe it must agree (C15 §2).
        //
        // ✅ §MEASURED-DESYNC PIN FLIPPED (§L-916-FRAME-RECORD-SYNC).
        // WAS pinned at the defect: VOID 3.000000 m, FRAME 1.000000 m, Δ = −2 m.
        // The frame record never moved, so `WindowBuilder` rebuilt it at offset
        // 1.0 on a baseline whose [0] end had travelled 2 m — the frame landed
        // 2 m from its own hole. NOW both records carry the same number.
        expect(
            after.frame,
            `the wall records the void at ${after.void} m; the frame record ` +
            `(windowStore — what WindowBuilder positions the mesh from) says ` +
            `${after.frame} m. One element, one position, two records: they must agree.`,
        ).toBeCloseTo(after.void!, 9);
        expect(after.frame).toBeCloseTo(3.0, 9);
    });

    it('§MEASURED-DESYNC — a door on the connected wall: same gesture, same seam', () => {
        world = makeWorld();
        buildLoop(world, false);
        const door = addOpening(world, 'w-west', 'door', { offset: 1.0 });

        expect(moveWall(world, 'w-north', 0, 2).success).toBe(true);
        expect(wallLength(world, 'w-west')).toBeCloseTo(6, 9);

        const after = offsets(world, 'w-west', door, 'door');
        report('§D-2 door AFTER drag', after);
        expect(after.void).toBeCloseTo(3.0, 9);
        // ✅ §MEASURED-DESYNC PIN FLIPPED. WAS VOID 3.000000 / FRAME 1.000000.
        // Doors were never a separate defect — the SAME `updateOpening` call
        // serves both kinds — so the door arm confirms the seam is generic, and
        // the single shared helper closes both at once.
        expect(
            after.frame,
            `(door): void at ${after.void} m, frame record at ${after.frame} m.`,
        ).toBeCloseTo(after.void!, 9);
        expect(after.frame).toBeCloseTo(3.0, 9);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §D-3 — the SHRINK arm, through the DIRECT command. UpdateWallBaselineCommand's
//        §FIX-WALL-SHRINK-REFIT re-clamps openings through the same
//        `wallStore.updateOpening` call, so it has the same blind spot.
// ════════════════════════════════════════════════════════════════════════════

describe('§D-3 — direct shrink refit: the same two records, the other command', () => {
    it('§MEASURED-DESYNC — clamping a window back inside a shortened host updates both records', () => {
        world = makeWorld();
        buildLoop(world, false);
        // w-south is [0,0]→[6,0]. A 1.2 m window at offset 4.5 needs 5.7 m.
        const win = addOpening(world, 'w-south', 'window', { offset: 4.5 });

        // Shorten w-south directly to 5 m — the window must be pulled inside.
        const res = world.cm.execute(new UpdateWallBaselineCommand({
            wallId: 'w-south',
            newBaseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
        }));
        expect(res.success).toBe(true);

        const after = offsets(world, 'w-south', win, 'window');
        report('§D-3 window AFTER direct shrink', after);
        expect(after.void! + 1.2).toBeLessThanOrEqual(wallLength(world, 'w-south') + 1e-9);
        // ✅ §MEASURED-DESYNC PIN FLIPPED. WAS VOID 3.800000 m (clamped inside
        // the 5 m wall) against FRAME 4.500000 m — the authored offset, left
        // 0.700 m PAST THE END of the very wall the record names as its host.
        // This arm is why the fix is a shared helper and not a patch to the
        // cascade: `UpdateWallBaselineCommand`'s §FIX-WALL-SHRINK-REFIT re-clamps
        // through the same one-record call, so a cascade-only fix left it open.
        expect(
            after.frame,
            `(shrink refit): void at ${after.void} m, frame record at ${after.frame} m.`,
        ).toBeCloseTo(after.void!, 9);
        expect(after.frame).toBeCloseTo(3.8, 9);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §D-4 — ATOMIC UNDO (C70 C-INV-3). One Ctrl+Z must restore BOTH records.
//        A fix that syncs only the forward path trades a forward desync for an
//        undo desync, which is the same defect one keystroke later.
//
// ⚠ HISTORY, KEPT: these two rows PASSED on the unfixed code, and they passed
// for a WORTHLESS reason — the frame record never moved in the first place, so
// "restoring" it was a no-op (VOID 1 → 3 → 1; FRAME 1 → 1 → 1). They were
// written as a TRAP for the fix, not as evidence the undo path was sound: the
// moment §D-2 was closed forward-only, they would go RED. §L-916-FRAME-RECORD-SYNC
// therefore routes BOTH undo() paths through the same helper as execute(), and
// these rows now measure something real — FRAME 1 → 3 → 1.
// ════════════════════════════════════════════════════════════════════════════

describe('§D-4 — one undo restores BOTH records', () => {
    it('§MEASURED-DESYNC — after undo the void offset and the frame offset are both back at the authored value', () => {
        world = makeWorld();
        buildLoop(world, false);
        const win = addOpening(world, 'w-west', 'window', { offset: 1.0 });
        const authored = offsets(world, 'w-west', win, 'window');

        expect(moveWall(world, 'w-north', 0, 2).success).toBe(true);

        // The row is only worth anything if the frame record ACTUALLY MOVED
        // first — otherwise "restored" is indistinguishable from "never touched",
        // which is exactly how this row passed on the unfixed code.
        const mid = offsets(world, 'w-west', win, 'window');
        report('§D-4 window BEFORE undo (must have moved)', mid);
        expect(mid.frame, 'nothing to restore — the forward path did not move the frame')
            .toBeCloseTo(3.0, 9);

        world.cm.undo();

        expect(wallLength(world, 'w-west')).toBeCloseTo(4, 9);
        const after = offsets(world, 'w-west', win, 'window');
        report('§D-4 window AFTER undo', after);
        expect(after.void, 'undo restored the wall-side opening').toBeCloseTo(authored.void!, 9);
        expect(
            after.frame,
            `§MEASURED-DESYNC (undo): void back at ${after.void} m but frame record at ${after.frame} m.`,
        ).toBeCloseTo(authored.frame!, 9);
    });

    it('§MEASURED-DESYNC — the same for a door, and the identity is unchanged (C70 C-INV-3)', () => {
        world = makeWorld();
        buildLoop(world, false);
        const door = addOpening(world, 'w-west', 'door', { offset: 1.0 });
        const authored = offsets(world, 'w-west', door, 'door');

        expect(moveWall(world, 'w-north', 0, 2).success).toBe(true);
        world.cm.undo();

        const after = offsets(world, 'w-west', door, 'door');
        report('§D-4 door AFTER undo', after);
        expect(doorStore.has(door), 'a move mints no new identity').toBe(true);
        expect(after.void).toBeCloseTo(authored.void!, 9);
        expect(after.frame).toBeCloseTo(authored.frame!, 9);
    });
});
