// @vitest-environment happy-dom
//
// ─── §STAIR-PIERCES-EVERY-HORIZONTAL-HOST (L-1431) ───────────────────────────
//
// FOUNDER, PRODUCTION: "STAIR CREATION — FIRST THE STAIR CREATES AN OPENING ON
// THE SLAB — BUT NOT ON THE FLOOR FINISH — THIS NEEDS TO BE AUTOMATIC."
//
// ⛔ THESE TESTS DO NOT ASSERT THAT A FUNCTION WAS CALLED. They create a stair
// through a level that carries BOTH a structural slab and a floor finish, and
// then read the two REAL stores:
//
//   • `openingStore.getByHostId(slabId)` — the exact collection
//     `SlabFragmentBuilder` triangulates into the slab void; and
//   • `floorStore.getById(floorId).serviceHoles` — the exact array
//     `FloorPanelBuilder._buildShapeWithHoles` feeds to `THREE.Shape.holes`.
//
// `FloorStore` and `CeilingStore` are the PRODUCTION classes, not doubles: the
// whole defect was that a real store's real `addServiceHole` had zero callers, so
// a double built from its header could not have falsified anything.
//
// A DOM is required only because those stores emit `bim-floor-*` DOM events on
// write. Nothing under test reads the DOM.

import { describe, it, expect } from 'vitest';
import { CreateStairCommand, type CreateStairInput } from '../src/stair/CreateStairCommand';
import { DeleteStairCommand } from '../src/stair/DeleteStairCommand';
import { stairAutoOpeningId } from '../src/stair/stairOpeningId';
import { stairHostPierceId, stairPiercedLevelIds } from '../src/stair/StairHorizontalHostPiercing';
import { FloorStore } from '@pryzm/core-app-model/stores';
import { CeilingStore } from '@pryzm/core-app-model/stores';
import type { CommandContext } from '../src/types';

const SLAB_L1 = 'slab-L1';
const FLOOR_L1 = 'floor-finish-L1';
const CEILING_L1 = 'ceiling-L1';

/** A 20 x 20 m deck centred on the origin — every stair below stands inside it. */
const DECK: { x: number; z: number }[] = [
    { x: -10, z: -10 }, { x: 10, z: -10 }, { x: 10, z: 10 }, { x: -10, z: 10 },
];

const LEVELS = [
    { id: 'L0', elevation: 0, name: 'Ground' },
    { id: 'L1', elevation: 3.0, name: 'Level 1' },
    { id: 'L2', elevation: 6.0, name: 'Level 2' },
];

function makeOpeningStore() {
    const map = new Map<string, any>();
    return {
        add: (o: any) => { map.set(o.id, structuredClone(o)); },
        remove: (id: string) => { map.delete(id); },
        getById: (id: string) => { const o = map.get(id); return o ? structuredClone(o) : undefined; },
        getByHostId: (hostId: string) =>
            Array.from(map.values()).filter(o => o.hostId === hostId).map(o => structuredClone(o)),
        getAll: () => Array.from(map.values()).map(o => structuredClone(o)),
    };
}

function makeSlabStore(levelIds: string[]) {
    const rebuilds: string[] = [];
    const slabs = new Map<string, any>();
    for (const levelId of levelIds) {
        const id = levelId === 'L1' ? SLAB_L1 : `slab-${levelId}`;
        slabs.set(id, {
            id, levelId,
            position: { x: 0, y: 0, z: 0 },
            polygon: DECK.map(p => ({ x: p.x, y: p.z })), // slab polygon is {x, y=worldZ}
            holes: [],
        });
    }
    return {
        add: (s: any) => { slabs.set(s.id, s); },
        getAll: () => Array.from(slabs.values()),
        getById: (id: string) => slabs.get(id),
        remove: (id: string) => { slabs.delete(id); },
        triggerRebuild: (id: string) => { rebuilds.push(id); },
        rebuilds,
    };
}

function makeStairStore() {
    const map = new Map<string, any>();
    return {
        add: (s: any) => { map.set(s.id, structuredClone(s)); },
        getById: (id: string) => map.get(id),
        get: (id: string) => map.get(id),
        remove: (id: string) => { map.delete(id); },
        restoreSnapshot: (s: any) => { map.set(s.id, s); },
        getStairConnectingLevels: () => undefined,
        getAll: () => Array.from(map.values()),
    };
}

function seedFloor(floorStore: FloorStore, id: string, levelId: string): void {
    floorStore.add({
        id,
        levelId,
        label: 'Finish',
        floorNumber: 'F-1',
        boundary: {
            polygon: DECK.map(p => ({ ...p })),
            baseOffset: 0,
            thickness: 0.05,
            detectionMethod: 'manual-polygon',
        },
        finishSpec: { finishColor: '#D4C4A8', finishPattern: 'none', exposedScreed: false },
        serviceHoles: [],
        coveredRoomIds: [],
        boundingWallIds: [],
        visible: true,
        properties: {},
        metadata: { createdAt: Date.now(), modifiedAt: Date.now(), createdBy: 'test', version: 1 },
    } as any);
}

function seedCeiling(ceilingStore: CeilingStore, id: string, levelId: string): void {
    ceilingStore.add({
        id,
        type: 'ceiling',
        levelId,
        label: 'Ceiling',
        ceilingNumber: 'C-1',
        boundary: {
            polygon: DECK.map(p => ({ ...p })),
            height: 2.6,
            baseOffset: 2.6,
            thickness: 0.02,
            detectionMethod: 'manual-polygon',
        },
        finishSpec: { finishColor: '#FFFFFF', finishPattern: 'none', exposedStructure: false },
        holeElements: [],
        coveredRoomIds: [],
        boundingWallIds: [],
        visible: true,
        properties: {},
        metadata: { createdAt: Date.now(), modifiedAt: Date.now(), createdBy: 'test', version: 1 },
    } as any);
}

interface Harness {
    ctx: CommandContext;
    openingStore: ReturnType<typeof makeOpeningStore>;
    slabStore: ReturnType<typeof makeSlabStore>;
    floorStore: FloorStore;
    ceilingStore: CeilingStore;
}

function makeHarness(opts: {
    slabLevels?: string[];
    floorLevels?: string[];
    ceilingLevels?: string[];
} = {}): Harness {
    const openingStore = makeOpeningStore();
    const slabStore = makeSlabStore(opts.slabLevels ?? ['L1']);
    const stairStore = makeStairStore();
    const floorStore = new FloorStore();
    const ceilingStore = new CeilingStore();

    for (const levelId of opts.floorLevels ?? ['L1']) {
        seedFloor(floorStore, levelId === 'L1' ? FLOOR_L1 : `floor-${levelId}`, levelId);
    }
    for (const levelId of opts.ceilingLevels ?? []) {
        seedCeiling(ceilingStore, levelId === 'L1' ? CEILING_L1 : `ceiling-${levelId}`, levelId);
    }

    const wallStore = {
        getById: () => undefined,
        getWindow: () => undefined,
        getDoor: () => undefined,
        getLevels: () => LEVELS,
    };
    const bimManager = {
        registerElement: () => {},
        unregisterElement: () => {},
        getLevelById: (id: string) => LEVELS.find(l => l.id === id),
    };
    const ctx = {
        stores: { stairStore, slabStore, openingStore, floorStore, ceilingStore, wallStore },
        bimManager,
        projectContext: { activeLevelId: 'L0' },
    } as unknown as CommandContext;

    return { ctx, openingStore, slabStore, floorStore, ceilingStore };
}

function stairInput(id: string, topLevelId = 'L1'): CreateStairInput {
    // 3.0 m per storey at 150 mm risers -> 20 risers per storey.
    const storeys = LEVELS.findIndex(l => l.id === topLevelId);
    return {
        id,
        baseLevelId: 'L0',
        topLevelId,
        shape: 'I',
        riserHeight: 0.15,
        treadDepth: 0.28,
        width: 1.0,
        startPosition: { x: 0, y: 0, z: 0 },
        flights: [{ direction: { x: 1, y: 0, z: 0 }, riserCount: 20 * storeys }],
        landings: [],
    } as CreateStairInput;
}

describe('§STAIR-PIERCES-EVERY-HORIZONTAL-HOST — the void set is DERIVED', () => {

    it('a stair through a level carrying BOTH a slab and a floor finish cuts BOTH — the founder’s defect', () => {
        const h = makeHarness({ slabLevels: ['L1'], floorLevels: ['L1'] });
        const res = new CreateStairCommand(stairInput('stair-1')).execute(h.ctx);
        expect(res.success).toBe(true);

        // ── the slab void (this half already worked) ──────────────────────────
        const slabVoids = h.openingStore.getByHostId(SLAB_L1);
        expect(slabVoids.map((o: any) => o.id)).toContain(stairAutoOpeningId('stair-1'));

        // ── the FLOOR FINISH void (this half is the defect) ───────────────────
        // Read the array FloorPanelBuilder feeds to THREE.Shape.holes — not a spy.
        const floor = h.floorStore.getById(FLOOR_L1)!;
        const pierceId = stairHostPierceId('stair-1', 'floor', FLOOR_L1);
        const hole = floor.serviceHoles.find(x => x.id === pierceId);
        expect(hole, 'floor finish carries no stair void').toBeDefined();
        expect(hole!.shape).toBe('polygon');
        expect(hole!.polygon!.length).toBeGreaterThanOrEqual(3);

        // ── and the two voids describe the SAME footprint ─────────────────────
        // The slab profile is slab-LOCAL ({x, y=worldZ} minus slab.position, which
        // is the origin here); the floor profile is world XZ. Same rectangle, so
        // the two families cannot drift into cutting different holes.
        const slabProfile = slabVoids[0].profile as { x: number; y: number }[];
        const floorProfile = hole!.polygon!;
        expect(floorProfile.length).toBe(slabProfile.length);
        for (let i = 0; i < slabProfile.length; i++) {
            expect(floorProfile[i]!.x).toBeCloseTo(slabProfile[i]!.x, 9);
            expect(floorProfile[i]!.z).toBeCloseTo(slabProfile[i]!.y, 9);
        }
    });

    it('undo closes the floor-finish void in the SAME undo unit', () => {
        const h = makeHarness({ slabLevels: ['L1'], floorLevels: ['L1'] });
        const cmd = new CreateStairCommand(stairInput('stair-2'));
        cmd.execute(h.ctx);
        expect(h.floorStore.getById(FLOOR_L1)!.serviceHoles.length).toBe(1);

        cmd.undo(h.ctx);
        expect(h.floorStore.getById(FLOOR_L1)!.serviceHoles.length).toBe(0);
    });

    it('deleting the stair HEALS the floor-finish void, and undoing the delete re-cuts it (EI-5 symmetry)', () => {
        const h = makeHarness({ slabLevels: ['L1'], floorLevels: ['L1'] });
        new CreateStairCommand(stairInput('stair-3')).execute(h.ctx);
        expect(h.floorStore.getById(FLOOR_L1)!.serviceHoles.length).toBe(1);

        const del = new DeleteStairCommand({ stairId: 'stair-3' });
        del.execute(h.ctx);
        expect(h.floorStore.getById(FLOOR_L1)!.serviceHoles.length).toBe(0);

        del.undo(h.ctx);
        const holes = h.floorStore.getById(FLOOR_L1)!.serviceHoles;
        expect(holes.length).toBe(1);
        expect(holes[0]!.id).toBe(stairHostPierceId('stair-3', 'floor', FLOOR_L1));
    });

    it('a CEILING is pierced too — with no branch anywhere naming "ceiling"', () => {
        const h = makeHarness({ slabLevels: ['L1'], floorLevels: ['L1'], ceilingLevels: ['L1'] });
        new CreateStairCommand(stairInput('stair-4')).execute(h.ctx);

        const ceiling = h.ceilingStore.getById(CEILING_L1)!;
        expect(ceiling.holeElements.map(x => x.id))
            .toContain(stairHostPierceId('stair-4', 'ceiling', CEILING_L1));
    });

    it('⭐ THE LEVEL AXIS: a Ground→L2 stair pierces the INTERMEDIATE deck’s finish, not only the top one', () => {
        // The relayed RAC2 finding: `carveStairOpening` filters on `topLevelId`
        // alone, so every intermediate level stayed solid while
        // `LevelTraversalPolicy` returned ok:true with a warning. Reachable by
        // hand — the founder only has to pick a Top level two storeys up.
        const h = makeHarness({ slabLevels: ['L1', 'L2'], floorLevels: ['L1', 'L2'] });
        new CreateStairCommand(stairInput('stair-5', 'L2')).execute(h.ctx);

        const intermediate = h.floorStore.getById(FLOOR_L1)!;
        const top = h.floorStore.getById('floor-L2')!;

        expect(top.serviceHoles.length, 'top-level finish not pierced').toBe(1);
        expect(
            intermediate.serviceHoles.length,
            'INTERMEDIATE level finish left solid — the stair passes through it',
        ).toBe(1);
    });

    it('the base level’s own deck is NEVER pierced — the stair stands on it', () => {
        const h = makeHarness({ slabLevels: ['L1'], floorLevels: ['L0', 'L1'] });
        new CreateStairCommand(stairInput('stair-6')).execute(h.ctx);

        expect(h.floorStore.getById('floor-L0')!.serviceHoles.length).toBe(0);
        expect(h.floorStore.getById(FLOOR_L1)!.serviceHoles.length).toBe(1);
    });

    it('a host the stair does NOT stand over is left alone — containment, not "the nearest one"', () => {
        const h = makeHarness({ slabLevels: ['L1'], floorLevels: ['L1'] });
        // A second, disjoint finish on the same level, well away from the stair.
        h.floorStore.add({
            id: 'floor-far',
            levelId: 'L1',
            label: 'Far finish',
            floorNumber: 'F-2',
            boundary: {
                polygon: [{ x: 50, z: 50 }, { x: 60, z: 50 }, { x: 60, z: 60 }, { x: 50, z: 60 }],
                baseOffset: 0, thickness: 0.05, detectionMethod: 'manual-polygon',
            },
            finishSpec: { finishColor: '#D4C4A8', finishPattern: 'none', exposedScreed: false },
            serviceHoles: [], coveredRoomIds: [], boundingWallIds: [], visible: true, properties: {},
            metadata: { createdAt: Date.now(), modifiedAt: Date.now(), createdBy: 'test', version: 1 },
        } as any);

        new CreateStairCommand(stairInput('stair-7')).execute(h.ctx);

        expect(h.floorStore.getById(FLOOR_L1)!.serviceHoles.length).toBe(1);
        expect(h.floorStore.getById('floor-far')!.serviceHoles.length).toBe(0);
    });

    it('`autoCreateOpening: false` suppresses EVERY family, not only the slab', () => {
        const h = makeHarness({ slabLevels: ['L1'], floorLevels: ['L1'] });
        new CreateStairCommand({ ...stairInput('stair-8'), autoCreateOpening: false } as CreateStairInput)
            .execute(h.ctx);

        expect(h.openingStore.getAll().length).toBe(0);
        expect(h.floorStore.getById(FLOOR_L1)!.serviceHoles.length).toBe(0);
    });

    it('the derived level set is the elevation span, and falls back HONESTLY when it cannot be read', () => {
        const h = makeHarness();
        expect(stairPiercedLevelIds(h.ctx, { baseLevelId: 'L0', topLevelId: 'L2' }))
            .toEqual({ levelIds: ['L1', 'L2'], basis: 'derived-span' });

        // No baseLevelId -> the pre-L-1431 behaviour, and it SAYS it is a fallback
        // rather than reporting a derived span it did not derive.
        expect(stairPiercedLevelIds(h.ctx, { topLevelId: 'L1' }))
            .toEqual({ levelIds: ['L1'], basis: 'fallback-top-only' });
    });
});
