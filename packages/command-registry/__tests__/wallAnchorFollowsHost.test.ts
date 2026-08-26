/**
 * §GRAPH115 / ADR-0374 — a wall-anchored fixture FOLLOWS its host, as ONE undo.
 *
 * The founder's case, verbatim intent: "create a toilet against a wall and then
 * MOVE that wall — the toilet must move with it, exactly as walls↔slabs and floor
 * finishes already adapt today."
 *
 * SEAM TEST (C72 §3.4): the propagation is driven through the REAL mutation entry
 * point — a command executed by the real `CommandManager` writes the real
 * `WallStore` / `CurtainWallStore`, which emit the §STEP7 `prevState` to the real
 * `WallAnchorDependencyTracker`, which dispatches the real
 * `ReseatWallAnchoredElementsCommand` into the real `PlumbingStore`. No fixture
 * supplies the value under test.
 *
 * DIFFERENTIATING, each against a named wrong implementation:
 *   · "the field exists but nothing reads it"      → the pre-§GRAPH115 matrix cell;
 *   · "translate by the delta"                     → fails the ROTATION case;
 *   · "teleport whatever is anchored"              → fails the DIVERGED case;
 *   · "dispatch outside the frame"                 → fails the ONE-undo assertion;
 *   · "delete the fixture with its wall"           → fails the host-delete case;
 *   · "re-derive on the reverse pass"              → fails the undo byte-equality.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WallStore } from '@pryzm/geometry-wall';
import type { WallData } from '@pryzm/geometry-wall';
import { ProjectContext } from '@pryzm/core-app-model';
import { PlumbingStore } from '@pryzm/geometry-plumbing';
import type { PlumbingFixtureData } from '@pryzm/geometry-plumbing';
import { CurtainWallStore } from '@pryzm/geometry-curtain-wall';
import type { CurtainWallData } from '@pryzm/geometry-curtain-wall';

import { CommandManager } from '../src/CommandManagerImpl';
import type { Command, CommandContext, CommandResult } from '../src/types';
import { UpdateWallBaselineCommand } from '../src/walls/UpdateWallBaselineCommand';
import { UpdateCurtainWallCommand } from '../src/curtainwall/UpdateCurtainWallCommand';
import { CreatePlumbingFixtureCommand } from '../src/plumbing/CreatePlumbingFixtureCommand';
import { MovePlumbingCommand } from '../src/plumbing/MovePlumbingCommand';
import {
    mintWallAnchor,
    reseatFromWallAnchor,
    wallAnchorAgreement,
    normalizeAnchorAngle,
} from '../src/attachments/WallAnchor';
import { WallAnchorDependencyTracker } from '../src/attachments/WallAnchorDependencyTracker';

const LEVEL = 'L0';

function makeLevelProvider() {
    const level = { id: LEVEL, name: 'Ground', elevation: 0, height: 3, childrenIds: [] as string[] };
    return {
        getLevelById: (id: string) => (id === LEVEL ? { ...level } : undefined),
        getLevels: () => [{ ...level }],
    };
}

function makeBimManager() {
    const level = { id: LEVEL, name: 'Ground', elevation: 0, height: 3, childrenIds: [] as string[] };
    return {
        getLevels: () => [level],
        getLevelById: (id: string) => (id === LEVEL ? level : undefined),
        registerElement: () => {},
        unregisterElement: () => {},
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

function curtainWallRecord(id: string, s: [number, number], e: [number, number]): CurtainWallData {
    return {
        id, type: 'curtainwall', levelId: LEVEL, properties: {}, childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 3, baseOffset: 0, gridXSpacing: 1.5, gridYSpacing: 1.5, mullionSize: 0.08, panelThickness: 0.03,
    } as unknown as CurtainWallData;
}

/** A gesture wrapper so a store write nests the tracker's cascade inside a frame (the real delete path's shape). */
function gesture(name: string, body: () => void, revert: () => void): Command {
    return {
        id: name, type: name as never, timestamp: 0, targetIds: [name], affectedStores: ['wall'],
        canExecute: () => ({ ok: true }),
        execute: (): CommandResult => { body(); return { success: true, affectedElementIds: [name] }; },
        undo: (): CommandResult => { revert(); return { success: true, affectedElementIds: [name] }; },
        serialize: () => ({ type: name as never, payload: {}, targetIds: [name], timestamp: 0, version: 1 }),
    } as unknown as Command;
}

interface World {
    wallStore: WallStore;
    curtainWallStore: CurtainWallStore;
    plumbingStore: PlumbingStore;
    cm: CommandManager;
    tracker: WallAnchorDependencyTracker;
    dispose(): void;
}

function makeWorld(): World {
    const bimManager = makeBimManager();
    const wallStore = new WallStore(
        new ProjectContext(),
        makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
    );
    const curtainWallStore = new CurtainWallStore();
    const plumbingStore = new PlumbingStore();
    const ctx = { stores: { wallStore, curtainWallStore, plumbingStore }, bimManager } as unknown as CommandContext;
    const cm = new CommandManager(ctx);
    Object.assign(window, { wallStore });
    const tracker = new WallAnchorDependencyTracker(
        [{ kind: 'wall', store: wallStore }, { kind: 'curtainWall', store: curtainWallStore }],
        { current: cm },
        [{ family: 'plumbing', store: plumbingStore }],
    );
    return {
        wallStore, curtainWallStore, plumbingStore, cm, tracker,
        dispose() { tracker.dispose(); Object.assign(window, { wallStore: undefined }); },
    };
}

/** Place a toilet the way the plan tool does: origin on the wall's room-side face, yaw from the normal, anchor from the snap target. */
function placeToiletAgainst(world: World, host: WallData | CurtainWallData, kind: 'wall' | 'curtainWall', t: number, side: 1 | -1, id = 'wc-1'): PlumbingFixtureData {
    const a = host.baseLine[0], b = host.baseLine[1];
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    const dirX = dx / len, dirZ = dz / len;
    const nx = side * dirZ, nz = -side * dirX;           // room-side normal on `side`
    const half = kind === 'wall' ? (host as WallData).thickness / 2 : 0.04;
    const x = a.x + t * dirX + half * nx;
    const z = a.z + t * dirZ + half * nz;
    const yaw = Math.atan2(nx, nz);                       // §PLUMBFRAME
    const wallAnchor = mintWallAnchor({ x, z, yaw }, host, kind)!;
    world.cm.execute(new CreatePlumbingFixtureCommand({
        id, fixtureType: 'toilet', position: { x, y: 0, z }, rotation: { x: 0, y: yaw, z: 0 },
        levelId: LEVEL, baseOffset: 0, width: 0.4, length: 0.7, height: 0.8, wallAnchor,
    }));
    return world.plumbingStore.get(id)!;
}

const yawOf = (rec: PlumbingFixtureData): number => {
    const r = rec.rotation as unknown as { y?: number; _y?: number };
    return typeof r.y === 'number' ? r.y : (r._y ?? 0);
};

describe('WallAnchor — the pure frame maths (one implementation, C84 EI-9)', () => {
    it('mint → reseat against the SAME host is the identity, on both faces', () => {
        const host = wallRecord('W', [0, 0], [4, 0]);
        for (const side of [1, -1] as const) {
            const el = { x: 1.5, z: side * 0.1, yaw: Math.atan2(0, side) };
            const a = mintWallAnchor(el, host, 'wall')!;
            expect(a.t).toBeCloseTo(1.5, 9);
            expect(Math.abs(a.d)).toBeCloseTo(0.1, 9);
            const r = reseatFromWallAnchor(a, host);
            expect(r.state).toBe('ok');
            if (r.state === 'ok') {
                expect(r.x).toBeCloseTo(el.x, 9); expect(r.z).toBeCloseTo(el.z, 9);
                expect(normalizeAnchorAngle(r.yaw - el.yaw)).toBeCloseTo(0, 9);
            }
        }
    });
    it('a host ROTATED 90° carries the element AND its yaw (a delta-translate would not)', () => {
        const before = wallRecord('W', [0, 0], [4, 0]);
        const after = wallRecord('W', [0, 0], [0, 4]);   // rotated about baseLine[0]
        const a = mintWallAnchor({ x: 1, z: 0.1, yaw: 0 }, before, 'wall')!;
        const r = reseatFromWallAnchor(a, after);
        expect(r.state).toBe('ok');
        if (r.state === 'ok') {
            expect(r.x).toBeCloseTo(-0.1, 9); expect(r.z).toBeCloseTo(1, 9);   // t along +z, d to the left of +z is −x
            // §PLUMBFRAME yaw = atan2(dir.x, dir.z): +x is π/2, +z is 0 — the host turned by −π/2, so does the element.
            expect(normalizeAnchorAngle(r.yaw + Math.PI / 2)).toBeCloseTo(0, 9);
        }
    });
    it('a host SHORTENED past the anchor REFUSES with both numbers (C74)', () => {
        const a = mintWallAnchor({ x: 3.5, z: 0.1, yaw: 0 }, wallRecord('W', [0, 0], [4, 0]), 'wall')!;
        const r = reseatFromWallAnchor(a, wallRecord('W', [0, 0], [2, 0]));
        expect(r).toMatchObject({ state: 'refused', reason: 'OFF_HOST', t: 3.5, hostLength: 2 });
    });
    it('agreement: in place agrees; moved 5 cm or turned 10° DIVERGES with the measured numbers', () => {
        const host = wallRecord('W', [0, 0], [4, 0]);
        const a = mintWallAnchor({ x: 1, z: 0.1, yaw: 0 }, host, 'wall')!;
        expect(wallAnchorAgreement(a, host, { x: 1, z: 0.1, yaw: 0 })).toEqual({ agrees: true });
        const moved = wallAnchorAgreement(a, host, { x: 1.05, z: 0.1, yaw: 0 });
        expect(moved.agrees).toBe(false);
        if (!moved.agrees && moved.why === 'DIVERGED') expect(moved.distanceM).toBeCloseTo(0.05, 9);
        const turned = wallAnchorAgreement(a, host, { x: 1, z: 0.1, yaw: 10 * Math.PI / 180 });
        expect(turned.agrees).toBe(false);
    });
});

describe('§GRAPH115 — the toilet follows the wall, through the real stores and the real manager', () => {
    let world: World;
    beforeEach(() => { world = makeWorld(); });
    afterEach(() => { world.dispose(); });

    it('a translated wall carries its fixture; position AND anchor survive; ONE undo restores both (byte-equal)', () => {
        const wall = wallRecord('W1', [0, 0], [4, 0]);
        world.wallStore.add(wall);
        const placed = placeToiletAgainst(world, wall, 'wall', 1.5, 1);
        expect(placed.wallAnchor?.hostId).toBe('W1');
        const before = structuredClone(world.plumbingStore.get('wc-1')!);
        const historyBefore = world.cm.getHistory().length;

        // THE GESTURE — the real wall-move command (the plan tool's dispatch target).
        world.cm.execute(new UpdateWallBaselineCommand({
            wallId: 'W1',
            newBaseLine: [{ x: 0, y: 0, z: 2 }, { x: 4, y: 0, z: 2 }],
            prevBaseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
        } as never));

        const after = world.plumbingStore.get('wc-1')!;
        expect(after.position.x).toBeCloseTo(before.position.x, 6);
        expect(after.position.z).toBeCloseTo(before.position.z + 2, 6);   // followed 2 m in z
        expect(after.position.y).toBe(before.position.y);                  // the seating datum is untouched
        expect(yawOf(after)).toBeCloseTo(yawOf(before), 9);
        expect(after.wallAnchor).toEqual(before.wallAnchor);               // the relationship is preserved, not re-minted

        // ONE undo entry for the whole gesture (C16 §8.6 / §L-874), the reseat nested as its child.
        expect(world.cm.getHistory().length).toBe(historyBefore + 1);
        const entry = world.cm.getHistory()[world.cm.getHistory().length - 1]!;
        expect(entry.structuralChildren?.some((c) => c.command.type === 'RESEAT_WALL_ANCHORED')).toBe(true);

        world.cm.undo();
        const restored = world.plumbingStore.get('wc-1')!;
        expect(restored.position.x).toBeCloseTo(before.position.x, 9);
        expect(restored.position.z).toBeCloseTo(before.position.z, 9);
        expect(restored.wallAnchor).toEqual(before.wallAnchor);
        expect(world.wallStore.getById('W1')!.baseLine[0].z).toBe(0);

        world.cm.redo();
        expect(world.plumbingStore.get('wc-1')!.position.z).toBeCloseTo(before.position.z + 2, 6);
    });

    it('a ROTATED wall carries the fixture round the pivot and turns it — on the OTHER face too', () => {
        const wall = wallRecord('W2', [0, 0], [4, 0]);
        world.wallStore.add(wall);
        const placed = placeToiletAgainst(world, wall, 'wall', 1, -1);       // side −1
        const yaw0 = yawOf(placed);
        world.cm.execute(new UpdateWallBaselineCommand({
            wallId: 'W2',
            newBaseLine: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 4 }],
            prevBaseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
        } as never));
        const after = world.plumbingStore.get('wc-1')!;
        // t = 1 along the new +z direction; d = −(thickness/2)·(−1)… the face keeps its SIDE relative to the baseline.
        expect(after.position.z).toBeCloseTo(1, 6);
        expect(Math.abs(after.position.x)).toBeCloseTo(0.1, 6);
        expect(normalizeAnchorAngle(yawOf(after) - yaw0 + Math.PI / 2)).toBeCloseTo(0, 6); // host +x → +z is Δyaw −π/2
    });

    it('a fixture the user MOVED since anchoring is DETACHED, not teleported (never auto-edit authored geometry)', () => {
        const wall = wallRecord('W3', [0, 0], [4, 0]);
        world.wallStore.add(wall);
        placeToiletAgainst(world, wall, 'wall', 1, 1);
        // The user drags the toilet 0.5 m into the room (the real move command).
        world.cm.execute(new MovePlumbingCommand({ id: 'wc-1', to: { x: 1, y: 0, z: 0.6 } }));
        world.cm.execute(new UpdateWallBaselineCommand({
            wallId: 'W3',
            newBaseLine: [{ x: 0, y: 0, z: 3 }, { x: 4, y: 0, z: 3 }],
            prevBaseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
        } as never));
        const after = world.plumbingStore.get('wc-1')!;
        expect(after.position.z).toBeCloseTo(0.6, 9);         // NOT moved
        expect(after.wallAnchor).toBeUndefined();              // detached, audibly
        world.cm.undo();                                       // the wall move's ONE undo restores the anchor
        expect(world.plumbingStore.get('wc-1')!.wallAnchor?.hostId).toBe('W3');
    });

    it('a DELETED host keeps the fixture in place and detaches it, inside the delete gesture (ADR-0374 §2.5)', () => {
        const wall = wallRecord('W4', [0, 0], [4, 0]);
        world.wallStore.add(wall);
        const placed = placeToiletAgainst(world, wall, 'wall', 2, 1);
        const pos = { x: placed.position.x, z: placed.position.z };
        world.cm.execute(gesture('delete-W4',
            () => { world.wallStore.remove('W4'); },
            () => { world.wallStore.add(wallRecord('W4', [0, 0], [4, 0])); },
        ));
        const after = world.plumbingStore.get('wc-1')!;
        expect(after).toBeDefined();                            // not deleted with its host
        expect(after.position.x).toBeCloseTo(pos.x, 9);
        expect(after.position.z).toBeCloseTo(pos.z, 9);
        expect(after.wallAnchor).toBeUndefined();               // no dangling hostId (C78 §3.3)
        world.cm.undo();
        expect(world.plumbingStore.get('wc-1')!.wallAnchor?.hostId).toBe('W4');
    });

    it('a CURTAIN WALL is a host too: its real move command carries the anchored fixture (ADR-0374 §2.6)', () => {
        const cw = curtainWallRecord('CW1', [0, 0], [6, 0]);
        world.curtainWallStore.add(cw);
        const placed = placeToiletAgainst(world, cw, 'curtainWall', 2, 1, 'wc-cw');
        expect(placed.wallAnchor).toMatchObject({ hostId: 'CW1', hostKind: 'curtainWall' });
        world.cm.execute(new UpdateCurtainWallCommand({
            id: 'CW1',
            updates: { baseLine: [{ x: 0, y: 0, z: -1.5 }, { x: 6, y: 0, z: -1.5 }] } as never,
        }));
        const after = world.plumbingStore.get('wc-cw')!;
        expect(after.position.z).toBeCloseTo(placed.position.z - 1.5, 6);
        expect(world.cm.getHistory()[world.cm.getHistory().length - 1]!.structuralChildren?.length).toBe(1);
        world.cm.undo();
        expect(world.plumbingStore.get('wc-cw')!.position.z).toBeCloseTo(placed.position.z, 9);
    });

    it('a wall with NO anchored fixture moves without writing anything (measured no-op, not silence-as-coverage)', () => {
        world.wallStore.add(wallRecord('W5', [0, 0], [4, 0]));
        world.wallStore.add(wallRecord('W6', [10, 0], [14, 0]));
        const far = placeToiletAgainst(world, world.wallStore.getById('W6')!, 'wall', 1, 1);
        world.cm.execute(new UpdateWallBaselineCommand({
            wallId: 'W5',
            newBaseLine: [{ x: 0, y: 0, z: 1 }, { x: 4, y: 0, z: 1 }],
            prevBaseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
        } as never));
        const entry = world.cm.getHistory()[world.cm.getHistory().length - 1]!;
        expect(entry.structuralChildren?.some((c) => c.command.type === 'RESEAT_WALL_ANCHORED') ?? false).toBe(false);
        expect(world.plumbingStore.get('wc-1')!.position.z).toBeCloseTo(far.position.z, 9);
    });
});

describe('§GRAPH115 — THREE-typed records survive the reseat write', () => {
    it('a structuredClone-flattened Euler gets BOTH `y` and `_y` written', () => {
        const world = makeWorld();
        try {
            const wall = wallRecord('W7', [0, 0], [4, 0]);
            world.wallStore.add(wall);
            const rec = placeToiletAgainst(world, wall, 'wall', 1, 1);
            // PlumbingStore.add structuredClone'd it: the Euler is a plain {_x,_y,_z,_order}.
            expect((rec.rotation as unknown as { _y?: number })._y).toBeDefined();
            expect(rec.position).not.toBeInstanceOf(THREE.Vector3);
            world.cm.execute(new UpdateWallBaselineCommand({
                wallId: 'W7',
                newBaseLine: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 4 }],
                prevBaseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
            } as never));
            const r = world.plumbingStore.get('wc-1')!.rotation as unknown as { y?: number; _y?: number };
            expect(r._y).toBeDefined();
            expect(r.y).toBeCloseTo(r._y!, 12);
        } finally { world.dispose(); }
    });
});
