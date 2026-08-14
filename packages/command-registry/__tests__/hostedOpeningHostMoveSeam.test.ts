// §HOSTED-OPENING-HOST-MOVE — Phase C row: do hosted openings (doors/windows)
// SURVIVE a host-wall move / extend / shrink, in the GENERAL case?
//
// WHY THIS FILE EXISTS
// ----------------------------------------------------------------------------
// Lane W closed wall-move propagation end-to-end (L-871..L-875): a moved wall
// now re-welds its joined neighbours, and neighbours EXTEND along their own
// axis. Two of its tests touch hosted openings — `hostedOpeningUndoIdentity`
// (create/undo/redo identity) and `wallShrinkOpeningRefit` (the DIRECT
// user-driven shrink of the host, via UpdateWallBaselineCommand). Neither asks
// the general question this file asks:
//
//   When a host wall is moved, EXTENDED or SHRUNK **by the reweld cascade** —
//   i.e. by a command the user never aimed at that wall — does its hosted
//   opening keep a correct, in-bounds position, keep its host, and survive undo
//   with identity intact (C70 C-INV-3)?
//
// The cascade path is a DIFFERENT command from the one `wallShrinkOpeningRefit`
// covers: `CascadeWallBaselineCommand`, not `UpdateWallBaselineCommand`. Every
// assertion below is contract-mapped:
//
//   C15 §2  — a hosted element has NO independent world coordinate: its world
//             position is `baseLine[0] + offset × wallDir`. Therefore ANY change
//             to `baseLine[0]` moves the opening in the world unless `offset` is
//             compensated. This is the mechanism the §Z-3 rows measure.
//   C15 §5  — `0 ≤ offset` and `offset + width ≤ wallLength`, ALWAYS. §Z-4.
//   C15 §6  — `openings[].elementId` and `childrenIds` stay in lock-step.
//   C11 §5.4— the fix for a violation belongs at the ONE chokepoint every
//             structural cascade passes through, never in a tool.
//   C70 C-INV-3 — a move mints no new semantic identity; undo restores it.
//
// REAL, imported from production (never re-implemented): WallStore +
// WallMoveReweldService (geometry-wall), SlabStore + SlabWallConnectivityService
// + traceRegionSketchAtPoint (geometry-slab), CommandManager +
// UpdateWallBaselineCommand + CreateWallOpeningCommand + CascadeWallBaselineCommand
// (command-registry), doorStore / windowStore, semanticGraphManager.
// The harness shape is deliberately the one Lane W's `wallMoveReweldSeam.test.ts`
// established — same stores, same wiring order, same joinedTo seeding through
// the production graph API — so a divergence here is a divergence in the
// SUBJECT (the openings), not in the fixture.
//
// NOT real, stated so nothing is overclaimed: `bimManager` is a level-authority
// stub, and no meshes are built. The subject is the OPENING RECORD and its
// derived world position, not the void triangulation.

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

// ── harness (Lane W's shape, verbatim in structure) ──────────────────────────

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
    bimManager: ReturnType<typeof makeBimManager>;
    dispose(): void;
}

function makeWorld(opts: { withReweld: boolean; withSlabService?: boolean }): World {
    const bimManager = makeBimManager();
    const wallStore = new WallStore(
        new ProjectContext(),
        makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
    );
    const slabStore = new SlabStore();

    const ctx = {
        stores: { wallStore, slabStore },
        bimManager,
    } as unknown as CommandContext;
    const cm = new CommandManager(ctx);

    Object.assign(window, { wallStore });   // WallFaceResolver reads this global

    let slabService: SlabWallConnectivityService | undefined;
    if (opts.withSlabService !== false) {
        slabService = new SlabWallConnectivityService(
            slabStore,
            wallStore as unknown as ConstructorParameters<typeof SlabWallConnectivityService>[1],
            () => false,
            cm,
        );
        slabService.bootstrap();
    }

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
        wallStore, slabStore, cm, bimManager,
        dispose() {
            reweldService?.dispose();
            slabService?.dispose();
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

const near = (a: [number, number], b: [number, number], eps = 1e-6): boolean =>
    Math.hypot(a[0] - b[0], a[1] - b[1]) < eps;

const wallLength = (world: World, id: string): number => {
    const b = world.wallStore.getById(id)!.baseLine;
    return Math.hypot(b[1].x - b[0].x, b[1].z - b[0].z);
};

const openingsOf = (world: World, wallId: string): Opening[] =>
    (world.wallStore.getById(wallId)!.openings ?? []) as Opening[];

const openingOf = (world: World, wallId: string, elementId: string): Opening | undefined =>
    openingsOf(world, wallId).find(o => o.elementId === elementId);

/**
 * C15 §2, evaluated exactly as `WallFragmentBuilder` evaluates it:
 * `worldCentre = baseLine[0] + (offset + width/2) × wallDir`.
 * This is what the USER sees — the number the store holds (`offset`) is only
 * half the answer, which is precisely why an offset that "did not change" can
 * still be a defect.
 */
function openingWorldCentre(world: World, wallId: string, elementId: string): [number, number] {
    const w = world.wallStore.getById(wallId)!;
    const op = openingOf(world, wallId, elementId)!;
    const dx = w.baseLine[1].x - w.baseLine[0].x;
    const dz = w.baseLine[1].z - w.baseLine[0].z;
    const len = Math.hypot(dx, dz);
    const d = op.offset + op.width / 2;
    return [w.baseLine[0].x + (dx / len) * d, w.baseLine[0].z + (dz / len) * d];
}

/** Place a door through the REAL creation command; return its minted elementId. */
function addDoor(
    world: World,
    wallId: string,
    opts: { offset: number; width?: number; height?: number },
): string {
    const before = new Set(openingsOf(world, wallId).map(o => o.elementId));
    const res = world.cm.execute(new CreateWallOpeningCommand({
        wallId,
        openingData: {
            type: 'door',
            offset: opts.offset,
            width: opts.width ?? 0.9,
            height: opts.height ?? 2.1,
            sillHeight: 0,
            doorType: 'single',
        },
    }));
    expect(res.success).toBe(true);
    const created = openingsOf(world, wallId).find(o => !before.has(o.elementId))!;
    expect(created).toBeDefined();
    return created.elementId as string;
}

/** C15 §5 — the invariant that must hold on EVERY wall at ALL times. */
function assertAllOpeningsInBounds(world: World): void {
    for (const w of world.wallStore.getAll()) {
        const len = Math.hypot(
            w.baseLine[1].x - w.baseLine[0].x,
            w.baseLine[1].z - w.baseLine[0].z,
        );
        for (const o of (w.openings ?? []) as Opening[]) {
            expect(
                o.offset,
                `wall ${w.id} opening ${o.elementId}: offset ${o.offset} < 0`,
            ).toBeGreaterThanOrEqual(-1e-9);
            expect(
                o.offset + o.width,
                `wall ${w.id} (len ${len.toFixed(3)} m) opening ${o.elementId} ` +
                `spans [${o.offset.toFixed(3)}, ${(o.offset + o.width).toFixed(3)}] — ` +
                `C15 §5 requires offset + width <= wallLength`,
            ).toBeLessThanOrEqual(len + 1e-9);
        }
    }
}

/** C15 §6 — openings[].elementId and childrenIds stay in lock-step, and no
 *  opening is silently dropped or duplicated anywhere in the model. */
function assertNoDropOrDuplicate(world: World, expectedElementIds: string[]): void {
    const seen: string[] = [];
    for (const w of world.wallStore.getAll()) {
        for (const o of (w.openings ?? []) as Opening[]) {
            seen.push(o.elementId as string);
            expect(
                w.childrenIds,
                `C15 §6: wall ${w.id} hosts opening ${o.elementId} but childrenIds does not name it`,
            ).toContain(o.elementId);
        }
    }
    expect(seen.slice().sort()).toEqual(expectedElementIds.slice().sort());
    expect(new Set(seen).size, 'an opening appears on more than one wall').toBe(seen.length);
}

// ── the founder's ground: a 6×4 perimeter loop ───────────────────────────────
//
// Endpoint ORDER matters to this row and to nothing the user can see:
//   w-south [0,0]→[6,0]   w-east [6,0]→[6,4]
//   w-north [6,4]→[0,4]   w-west [0,4]→[0,0]
// Moving w-north outward welds w-east at its baseLine[**1**] and w-west at its
// baseLine[**0**]. C15 §2 measures `offset` from baseLine[0] — so the two walls
// are NOT symmetric under the same gesture, and that asymmetry is the subject.

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
// §Z-1 — the host wall itself is MOVED perpendicular (the direct gesture)
// ════════════════════════════════════════════════════════════════════════════

describe('§Z-1 — host wall moved perpendicular: the opening rides along', () => {
    it('offset, host, identity and in-bounds all hold; the world position translates by exactly the move delta', () => {
        world = makeWorld({ withReweld: true });
        buildLoop(world, true);
        const door = addDoor(world, 'w-south', { offset: 2.0 });

        const worldBefore = openingWorldCentre(world, 'w-south', door);
        expect(worldBefore).toEqual([2.45, 0]);

        expect(moveWall(world, 'w-south', 0, -1).success).toBe(true);

        // Host relationship intact (C15 §6) …
        expect(openingOf(world, 'w-south', door)).toBeDefined();
        expect(doorStore.has(door)).toBe(true);
        expect(doorStore.getById(door)!.wallId).toBe('w-south');
        // … offset unchanged (C15 §2: the wall translated, so offset must not move) …
        expect(openingOf(world, 'w-south', door)!.offset).toBeCloseTo(2.0, 9);
        // … and the derived world position moved by EXACTLY the gesture delta.
        const worldAfter = openingWorldCentre(world, 'w-south', door);
        expect(near(worldAfter, [worldBefore[0], worldBefore[1] - 1])).toBe(true);

        assertAllOpeningsInBounds(world);
        assertNoDropOrDuplicate(world, [door]);
    });

    it('ONE undo restores the baseline AND the opening, byte-equal, with the same identity (C70 C-INV-3)', () => {
        world = makeWorld({ withReweld: true });
        buildLoop(world, true);
        const door = addDoor(world, 'w-south', { offset: 2.0 });

        const snapshot = new Map<string, string>();
        for (const w of world.wallStore.getAll()) snapshot.set(w.id, JSON.stringify(w.baseLine));
        const openingBefore = JSON.stringify(openingOf(world, 'w-south', door));

        expect(moveWall(world, 'w-south', 0, -1).success).toBe(true);
        world.cm.undo();

        for (const [id, blJson] of snapshot) {
            expect(JSON.stringify(world.wallStore.getById(id)!.baseLine), `wall ${id}`).toBe(blJson);
        }
        expect(JSON.stringify(openingOf(world, 'w-south', door))).toBe(openingBefore);
        expect(doorStore.has(door)).toBe(true);
        assertNoDropOrDuplicate(world, [door]);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §Z-2 — the host is EXTENDED by a neighbour's reweld, at its FAR endpoint [1]
// ════════════════════════════════════════════════════════════════════════════

describe('§Z-2 — host EXTENDED at baseLine[1] by a reweld the user never aimed at it', () => {
    it('the opening does not move in the world: the wall grew at the end AWAY from baseLine[0]', () => {
        world = makeWorld({ withReweld: true });
        buildLoop(world, false);
        // w-east is [6,0]→[6,4]; the w-north joint is its baseLine[**1**].
        const door = addDoor(world, 'w-east', { offset: 1.0 });
        const worldBefore = openingWorldCentre(world, 'w-east', door);
        expect(worldBefore).toEqual([6, 1.45]);

        // The user drags w-north outward. w-east is EXTENDED 4 m → 6 m.
        expect(moveWall(world, 'w-north', 0, 2).success).toBe(true);
        expect(near(bl2(world, 'w-east')[1], [6, 6])).toBe(true);
        expect(wallLength(world, 'w-east')).toBeCloseTo(6, 9);

        // The user never touched the door, and the wall grew at the far end:
        // its world position MUST be unchanged.
        expect(near(openingWorldCentre(world, 'w-east', door), worldBefore)).toBe(true);
        expect(openingOf(world, 'w-east', door)!.offset).toBeCloseTo(1.0, 9);
        assertAllOpeningsInBounds(world);
        assertNoDropOrDuplicate(world, [door]);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §Z-3 — the host is EXTENDED by a reweld at its START endpoint [0]
//        THE SAME GESTURE, THE OPPOSITE WALL. C15 §2 measures offset FROM
//        baseLine[0]; when baseLine[0] is the welded end, an uncompensated
//        offset drags the opening across the room.
// ════════════════════════════════════════════════════════════════════════════

describe('§Z-3 — host EXTENDED at baseLine[0]: the opening must NOT slide', () => {
    it('DEFECT PROBE: a door in the west wall keeps its world position when the north wall is dragged outward', () => {
        world = makeWorld({ withReweld: true });
        buildLoop(world, false);
        // w-west is [0,4]→[0,0]; the w-north joint is its baseLine[**0**].
        const door = addDoor(world, 'w-west', { offset: 1.0 });
        const worldBefore = openingWorldCentre(world, 'w-west', door);
        expect(worldBefore).toEqual([0, 2.55]);   // 4 − 1.45, measured from (0,4)

        // EXACTLY the §Z-2 gesture. w-west is EXTENDED 4 m → 6 m at baseLine[0].
        expect(moveWall(world, 'w-north', 0, 2).success).toBe(true);
        expect(near(bl2(world, 'w-west')[0], [0, 6])).toBe(true);
        expect(near(bl2(world, 'w-west')[1], [0, 0])).toBe(true);
        expect(wallLength(world, 'w-west')).toBeCloseTo(6, 9);

        // C15 §2 / §CLAMP-COSHARE-WELD doctrine: only the WELDED END of the
        // wall changed, so nothing that sits away from it may move. The door is
        // 2.55 m from the SOUTH corner, which did not move at all.
        expect(
            openingWorldCentre(world, 'w-west', door),
            'the door slid along its host because offset is measured from the endpoint that moved',
        ).toEqual(worldBefore);

        assertAllOpeningsInBounds(world);
        assertNoDropOrDuplicate(world, [door]);
    });

    it('DEFECT PROBE (symmetry): the SAME gesture must treat the east and west doors alike', () => {
        world = makeWorld({ withReweld: true });
        buildLoop(world, false);
        const eastDoor = addDoor(world, 'w-east', { offset: 1.0 });   // welded at [1]
        const westDoor = addDoor(world, 'w-west', { offset: 1.0 });   // welded at [0]

        // Both doors sit 1.45 m from the SOUTH corners — the corners the
        // gesture leaves untouched.
        const eastBefore = openingWorldCentre(world, 'w-east', eastDoor);
        const westBefore = openingWorldCentre(world, 'w-west', westDoor);
        expect(Math.abs(eastBefore[1])).toBeCloseTo(1.45, 9);
        expect(Math.abs(westBefore[1])).toBeCloseTo(2.55, 9);

        expect(moveWall(world, 'w-north', 0, 2).success).toBe(true);

        const eastMoved = Math.hypot(
            openingWorldCentre(world, 'w-east', eastDoor)[0] - eastBefore[0],
            openingWorldCentre(world, 'w-east', eastDoor)[1] - eastBefore[1],
        );
        const westMoved = Math.hypot(
            openingWorldCentre(world, 'w-west', westDoor)[0] - westBefore[0],
            openingWorldCentre(world, 'w-west', westDoor)[1] - westBefore[1],
        );
        // Whatever the policy is, it cannot depend on stored endpoint ORDER —
        // the user cannot see it and did not choose it.
        expect(westMoved, `east door moved ${eastMoved} m, west door moved ${westMoved} m`)
            .toBeCloseTo(eastMoved, 9);
        assertNoDropOrDuplicate(world, [eastDoor, westDoor]);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §Z-4 — the host is SHRUNK by a reweld: C15 §5 must still hold
//        `wallShrinkOpeningRefit` proved the gate on the DIRECT command
//        (UpdateWallBaselineCommand). The cascade is a DIFFERENT command.
// ════════════════════════════════════════════════════════════════════════════

describe('§Z-4 — host SHRUNK by a reweld: the opening never hangs off the end', () => {
    it('DEFECT PROBE: a door near the welded end stays inside its host when the host is shortened by a cascade', () => {
        world = makeWorld({ withReweld: true });
        buildLoop(world, false);
        // w-east is [6,0]→[6,4] (4 m). A 0.9 m door at offset 3.0 needs 3.9 m —
        // it fits today, and it sits right against the welded end.
        const door = addDoor(world, 'w-east', { offset: 3.0 });
        expect(openingOf(world, 'w-east', door)!.offset).toBeCloseTo(3.0, 9);

        // The user drags w-north INWARD by 2 m. w-east is shortened 4 m → 2 m
        // by CascadeWallBaselineCommand — a command that never asks
        // `planOpeningRefit`.
        expect(moveWall(world, 'w-north', 0, -2).success).toBe(true);
        expect(wallLength(world, 'w-east')).toBeCloseTo(2, 9);

        // C15 §5 — offset + width <= wallLength. ALWAYS.
        assertAllOpeningsInBounds(world);
        // The policy `planOpeningRefit` already establishes for this exact
        // situation (position is recoverable ⇒ CLAMP; authored size is not ⇒
        // REFUSE) puts a 0.9 m door on a 2 m wall at offset 1.1.
        expect(openingOf(world, 'w-east', door)!.width).toBeCloseTo(0.9, 9);
        assertNoDropOrDuplicate(world, [door]);
    });

    it('DEFECT PROBE: undo after a cascade shrink restores the AUTHORED offset, not the clamped one', () => {
        world = makeWorld({ withReweld: true });
        buildLoop(world, false);
        const door = addDoor(world, 'w-east', { offset: 3.0 });
        const openingBefore = JSON.stringify(openingOf(world, 'w-east', door));
        const blBefore = JSON.stringify(world.wallStore.getById('w-east')!.baseLine);

        expect(moveWall(world, 'w-north', 0, -2).success).toBe(true);
        world.cm.undo();

        expect(JSON.stringify(world.wallStore.getById('w-east')!.baseLine)).toBe(blBefore);
        // `CascadeWallBaselineCommand.undo` uses `restoreSnapshot`, which does
        // NOT carry `openings` — so any relocation it performs must be recorded
        // and reversed explicitly, exactly as UpdateWallBaselineCommand does
        // (§FIX-WALL-SHRINK-REFIT `relocated`).
        expect(JSON.stringify(openingOf(world, 'w-east', door))).toBe(openingBefore);
        expect(doorStore.has(door)).toBe(true);
        assertNoDropOrDuplicate(world, [door]);
    });

    it('DEFECT PROBE: a shrink that no opening can survive is REFUSED, never applied silently', () => {
        world = makeWorld({ withReweld: true });
        buildLoop(world, false);
        // A 0.9 m door on w-east. Drag w-north inward 3.5 m: w-east would be
        // 0.5 m — the door cannot exist at ANY offset. `planOpeningRefit`'s
        // policy is REFUSE (never narrow an authored door).
        const door = addDoor(world, 'w-east', { offset: 1.0 });

        moveWall(world, 'w-north', 0, -3.5);

        // Whatever the outcome, the door keeps its AUTHORED width and stays in
        // bounds — the one state the contract forbids is a 0.9 m door recorded
        // on a 0.5 m wall.
        expect(openingOf(world, 'w-east', door)!.width).toBeCloseTo(0.9, 9);
        assertAllOpeningsInBounds(world);
        assertNoDropOrDuplicate(world, [door]);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §Z-5 — the opening sits AT the moved endpoint (worst case for both arms)
// ════════════════════════════════════════════════════════════════════════════

describe('§Z-5 — an opening hard against the welded endpoint', () => {
    it('DEFECT PROBE: extend + shrink round-trip leaves the opening exactly where it started', () => {
        world = makeWorld({ withReweld: true });
        buildLoop(world, false);
        // Hard against w-west's baseLine[0] — the endpoint the weld moves.
        const door = addDoor(world, 'w-west', { offset: 0.0 });
        const worldBefore = openingWorldCentre(world, 'w-west', door);
        const openingBefore = JSON.stringify(openingOf(world, 'w-west', door));

        expect(moveWall(world, 'w-north', 0, 2).success).toBe(true);   // extend
        assertAllOpeningsInBounds(world);
        expect(moveWall(world, 'w-north', 0, -2).success).toBe(true);  // back

        // Round-trip: the wall is back to 4 m, so the opening must be back too.
        expect(wallLength(world, 'w-west')).toBeCloseTo(4, 9);
        expect(JSON.stringify(openingOf(world, 'w-west', door))).toBe(openingBefore);
        expect(near(openingWorldCentre(world, 'w-west', door), worldBefore)).toBe(true);
        assertNoDropOrDuplicate(world, [door]);
    });
});
