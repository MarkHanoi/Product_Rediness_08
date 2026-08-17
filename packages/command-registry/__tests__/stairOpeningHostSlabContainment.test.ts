// ─── §FIX-STAIR-VOID-WRONG-SLAB (L-949) ──────────────────────────────────────
//
// FOUNDER-REPORTED DEFECT, measured:
//   "stair creation — I was expecting the slab to have a void, but it doesn't …
//    I see a rectangle for cutting the slab, but it doesn't really cut."
//
// The void WAS created — into the WRONG SLAB. The founder's log:
//   [CreateStairCommand] Auto-opening opening-stair-… created on slab
//                        slab-dup-cmd-dup-fp-…-0-0
//   [SlabFragmentBuilder] opening holes slabId="slab-dup-…-0-0" count=2
// …while the slabs the founder clicks are two OTHER ids. The CSG ran; it cut a
// slab nobody was looking at. Hence a rectangle outline where the opening should
// be, and solid slab where the stair passes through.
//
// ROOT CAUSE — `StairSlabOpeningReconciler.resolveHostSlab` picked the candidate
// whose `position` was NEAREST the stair footprint centroid. It never asked
// whether the stair footprint is INSIDE the slab. Nearest-centre is only correct
// for convex, well-separated slabs; the founder's building is L-SHAPED, so a
// slab's centroid can lie OUTSIDE its own footprint (in the notch of the L), and
// a smaller/duplicated slab's centre is then nearer than the centre of the slab
// the stair actually stands on.
//
// ── WHERE THE ASSERTIONS HAVE TEETH ─────────────────────────────────────────
// Every assertion goes through a REAL command (`CreateStairCommand`,
// `CreateSlabCommand`, `MoveStairCommand`) — never a hand-called helper — and
// reads `openingStore.getByHostId(slabId)`, the exact collection
// `SlabFragmentBuilder.createSlabMeshWithEdges` triangulates into the rendered
// void. Each case ALSO asserts its own RED precondition (`nearestByCentre(...)`
// returns the wrong slab), so the fixture cannot silently stop being a control.
//
// Contracts: C15 (hosted elements — an opening is hosted BY a slab, and the host
// relationship must be determined, not guessed), C11 (element creation pipeline).

import { describe, it, expect } from 'vitest';
import { CreateStairCommand, type CreateStairInput } from '../src/stair/CreateStairCommand';
import { CreateSlabCommand } from '../src/slabs/CreateSlabCommand';
import { MoveStairCommand } from '../src/stair/MoveStairCommand';
import { stairAutoOpeningId } from '../src/stair/stairOpeningId';
import { computeStairFootprintRect } from '@pryzm/geometry-stair';
import { pointInPolygonXZ } from '@pryzm/geometry-kernel';
import type { CommandContext } from '../src/types';

// ── The fixture geometry, in world XZ metres ────────────────────────────────
//
//  z=20  ┌────┐
//        │    │
//        │ L  │        ← left arm: x∈[0,8],  z∈[8,20]
//  z=8   ├────┴───────┐
//        │            │  ← bottom strip: x∈[0,20], z∈[0,8]
//  z=0   └────────────┘
//        x=0  8      20
//
// The NOTCH is x∈[8,20], z∈[8,20] — inside the bounding box, OUTSIDE the slab.
const L_OUTLINE: Array<{ x: number; z: number }> = [
    { x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 8 },
    { x: 8, z: 8 }, { x: 8, z: 20 }, { x: 0, z: 20 },
];
/** The L's vertex centroid — 56/6 ≈ 9.333 on both axes, i.e. INSIDE THE NOTCH. */
const L_CENTROID = { x: 56 / 6, y: 0, z: 56 / 6 };

/** A duplicated patch overlapping the L's left arm — the decoy the old code chose. */
const DUP_OUTLINE: Array<{ x: number; z: number }> = [
    { x: 0, z: 12.5 }, { x: 3, z: 12.5 }, { x: 3, z: 15.5 }, { x: 0, z: 15.5 },
];
const DUP_CENTRE = { x: 1.5, y: 0, z: 14 };

const L_SLAB_ID = 'slab-L-shaped';
const DUP_SLAB_ID = 'slab-dup-cmd-dup-fp-0-0'; // shaped like the founder's log id

function makeOpeningStore() {
    const map = new Map<string, any>();
    return {
        add: (o: any) => { map.set(o.id, structuredClone(o)); },
        remove: (id: string) => { map.delete(id); },
        getById: (id: string) => { const o = map.get(id); return o ? structuredClone(o) : undefined; },
        getByHostId: (hostId: string) =>
            Array.from(map.values()).filter(o => o.hostId === hostId).map(o => structuredClone(o)),
        getAll: () => Array.from(map.values()).map(o => structuredClone(o)),
        update: (id: string, updates: any) => {
            const cur = map.get(id);
            if (!cur) return undefined;
            const merged = { ...cur, ...updates };
            map.set(id, merged);
            return merged;
        },
    };
}

function makeSlabStore() {
    const rebuilds: string[] = [];
    const slabs = new Map<string, any>();
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
        add: (s: any) => { map.set(s.id, s); },
        get: (id: string) => map.get(id),
        getById: (id: string) => map.get(id),
        update: (id: string, updates: any) => {
            const cur = map.get(id);
            if (!cur) return undefined;
            const merged = { ...cur, ...updates };
            if (updates.properties && cur.properties) {
                merged.properties = { ...cur.properties, ...updates.properties };
            }
            map.set(id, merged);
            return merged;
        },
        remove: (id: string) => { map.delete(id); },
        restoreSnapshot: (s: any) => { map.set(s.id, s); },
        getStairConnectingLevels: () => undefined,
        getAll: () => Array.from(map.values()),
    };
}

function makeCtx() {
    const openingStore = makeOpeningStore();
    const slabStore = makeSlabStore();
    const stairStore = makeStairStore();
    const wallStore = {
        getById: () => undefined,
        getWindow: () => undefined,
        getDoor: () => undefined,
        getLevels: () => [
            { id: 'L0', elevation: 0, name: 'Ground' },
            { id: 'L1', elevation: 3.0, name: 'Level 1' },
        ],
    };
    const bimManager = {
        registerElement: () => {},
        unregisterElement: () => {},
        getLevelById: (id: string) => ({ id, elevation: id === 'L1' ? 3.0 : 0 }),
    };
    const ctx = {
        stores: { stairStore, slabStore, openingStore, wallStore },
        bimManager,
        projectContext: { activeLevelId: 'L0' },
    } as unknown as CommandContext;
    return { ctx, openingStore, slabStore, stairStore };
}

/**
 * A slab record whose WORLD outline is `worldRing`, stored the way SlabData
 * stores it: `polygon` is `{x, y}` with `y` carrying worldZ, expressed RELATIVE
 * to `position` (`SlabFragmentBuilder` adds `position` back when it computes the
 * world pivot). Building the fixture this way exercises the position offset
 * instead of assuming the production `position === (0,0,0)`.
 */
function slabRecord(
    id: string,
    worldRing: Array<{ x: number; z: number }>,
    position: { x: number; y: number; z: number },
) {
    return {
        id,
        levelId: 'L1',
        position,
        polygon: worldRing.map(p => ({ x: p.x - position.x, y: p.z - position.z })),
        holes: [],
    };
}

function slabPayload(
    id: string,
    worldRing: Array<{ x: number; z: number }>,
    position: { x: number; y: number; z: number },
) {
    return {
        id,
        ifcGuid: `guid-${id}`,
        width: 20, depth: 20, thickness: 0.25,
        position,
        levelId: 'L1',
        polygon: worldRing.map(p => ({ x: p.x - position.x, y: p.z - position.z })),
    };
}

function stairInput(id: string, x: number, z: number): CreateStairInput {
    return {
        id,
        baseLevelId: 'L0',
        topLevelId: 'L1',
        shape: 'I',
        riserHeight: 0.15,
        treadDepth: 0.28,
        width: 1.0,
        startPosition: { x, y: 0, z },
        flights: [{ direction: { x: 1, y: 0, z: 0 }, riserCount: 20 }],
        landings: [],
    } as CreateStairInput;
}

/** The world-XZ centre of a stair's footprint — the quantity the reconciler probes. */
function footprintCentre(s: { shape: string; width: number; treadDepth: number; startPosition: any; flights: any; landings?: any }) {
    const rect = computeStairFootprintRect({
        shape: s.shape as any,
        width: s.width,
        treadDepth: s.treadDepth,
        startPosition: s.startPosition,
        flights: s.flights,
        landings: s.landings,
    })!;
    return {
        x: (rect[0].x + rect[1].x + rect[2].x + rect[3].x) / 4,
        z: (rect[0].z + rect[1].z + rect[2].z + rect[3].z) / 4,
    };
}

/** EXACTLY the rule the defect shipped: nearest slab `position` wins. */
function nearestByCentre(slabs: any[], c: { x: number; z: number }): string {
    let best = slabs[0], bestD2 = Infinity;
    for (const s of slabs) {
        const dx = s.position.x - c.x, dz = s.position.z - c.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; best = s; }
    }
    return best.id;
}

describe('§FIX-STAIR-VOID-WRONG-SLAB — the void is carved into the slab that CONTAINS the stair', () => {
    it('(0) the fixture is genuinely pathological: the L slab\'s centroid lies OUTSIDE its own footprint', () => {
        // This is WHY nearest-centre fails on the founder's model. If this ever
        // stops holding, every case below stops being a control.
        expect(pointInPolygonXZ(L_CENTROID.x, L_CENTROID.z, L_OUTLINE)).toBe(false);
        // …and the notch it falls into is inside the L's bounding box.
        expect(L_CENTROID.x).toBeGreaterThan(8);
        expect(L_CENTROID.z).toBeGreaterThan(8);
    });

    it('(a) DIRECTION A — stair created over existing slabs: the void goes to the CONTAINING slab, not the nearest centre', () => {
        const { ctx, openingStore, slabStore } = makeCtx();
        slabStore.add(slabRecord(L_SLAB_ID, L_OUTLINE, L_CENTROID));
        slabStore.add(slabRecord(DUP_SLAB_ID, DUP_OUTLINE, DUP_CENTRE));

        const input = stairInput('st-contain-a', 1.5, 10.5);
        const c = footprintCentre(input as any);

        // ── RED PRECONDITION ────────────────────────────────────────────────
        // The stair stands in the L's left arm…
        expect(pointInPolygonXZ(c.x, c.z, L_OUTLINE)).toBe(true);
        // …the duplicate does NOT contain it…
        expect(pointInPolygonXZ(c.x, c.z, DUP_OUTLINE)).toBe(false);
        // …yet the duplicate's centre is NEARER, so the shipped rule picks it.
        expect(nearestByCentre(slabStore.getAll(), c)).toBe(DUP_SLAB_ID);

        expect(new CreateStairCommand(input).execute(ctx).success).toBe(true);

        // The void must be in the slab the stair actually passes through.
        const onL = openingStore.getByHostId(L_SLAB_ID);
        expect(onL.length).toBe(1);
        expect(onL[0].id).toBe(stairAutoOpeningId('st-contain-a'));
        expect(openingStore.getByHostId(DUP_SLAB_ID)).toEqual([]);
        // …and the slab the renderer rebuilds is the containing one.
        expect(slabStore.rebuilds).toEqual([L_SLAB_ID]);
    });

    it('(b) DIRECTION B — slabs created over an existing stair: the same containing slab wins', () => {
        const { ctx, openingStore, slabStore } = makeCtx();

        const input = stairInput('st-contain-b', 1.5, 10.5);
        const c = footprintCentre(input as any);
        expect(new CreateStairCommand(input).execute(ctx).success).toBe(true);
        expect(openingStore.getAll().length).toBe(0); // no slab yet — correct

        // The DECOY arrives FIRST. It does not contain the stair, so nothing may
        // be carved into it — and because the carve is idempotent by id, carving
        // here would strand the void there forever (exactly the founder's log).
        expect(new CreateSlabCommand(slabPayload(DUP_SLAB_ID, DUP_OUTLINE, DUP_CENTRE)).execute(ctx).success).toBe(true);
        expect(openingStore.getAll()).toEqual([]);

        // …then the real, L-shaped slab.
        expect(new CreateSlabCommand(slabPayload(L_SLAB_ID, L_OUTLINE, L_CENTROID)).execute(ctx).success).toBe(true);

        // RED precondition against the final store state.
        expect(nearestByCentre(slabStore.getAll(), c)).toBe(DUP_SLAB_ID);

        const onL = openingStore.getByHostId(L_SLAB_ID);
        expect(onL.length).toBe(1);
        expect(onL[0].id).toBe(stairAutoOpeningId('st-contain-b'));
        expect(openingStore.getByHostId(DUP_SLAB_ID)).toEqual([]);
    });

    it('(c) THIRD SITE — a MOVED stair re-resolves by containment, not by centre', () => {
        const { ctx, openingStore, slabStore } = makeCtx();
        slabStore.add(slabRecord(L_SLAB_ID, L_OUTLINE, L_CENTROID));
        slabStore.add(slabRecord(DUP_SLAB_ID, DUP_OUTLINE, DUP_CENTRE));

        // Start in the L's BOTTOM strip, where nearest-centre happens to agree —
        // so the discriminator is the MOVE, not the initial carve.
        const input = stairInput('st-contain-c', 1.5, 4);
        const c0 = footprintCentre(input as any);
        expect(nearestByCentre(slabStore.getAll(), c0)).toBe(L_SLAB_ID);
        expect(new CreateStairCommand(input).execute(ctx).success).toBe(true);
        expect(openingStore.getByHostId(L_SLAB_ID).length).toBe(1);

        // Move it up into the left arm — still inside the L, now nearer the decoy.
        const moved = { ...input, startPosition: { x: 1.5, y: 0, z: 10.5 } };
        const c1 = footprintCentre(moved as any);
        expect(pointInPolygonXZ(c1.x, c1.z, L_OUTLINE)).toBe(true);
        expect(nearestByCentre(slabStore.getAll(), c1)).toBe(DUP_SLAB_ID); // RED precondition

        expect(new MoveStairCommand({ stairId: 'st-contain-c', delta: { x: 0, z: 6.5 } }).execute(ctx).success).toBe(true);

        // The void STAYS in the slab that contains the stair.
        const onL = openingStore.getByHostId(L_SLAB_ID);
        expect(onL.length).toBe(1);
        expect(onL[0].hostId).toBe(L_SLAB_ID);
        expect(openingStore.getByHostId(DUP_SLAB_ID)).toEqual([]);
    });

    it('(d) INSIDE NONE — the stair stands in the L\'s notch: an honest refusal, never a carve into the closest slab', () => {
        const { ctx, openingStore, slabStore } = makeCtx();
        slabStore.add(slabRecord(L_SLAB_ID, L_OUTLINE, L_CENTROID));
        slabStore.add(slabRecord(DUP_SLAB_ID, DUP_OUTLINE, DUP_CENTRE));

        // x∈[10,15.6], z∈[11.5,12.5] — squarely in the notch: no slab is under it.
        const input = stairInput('st-contain-d', 10, 12);
        const c = footprintCentre(input as any);
        expect(pointInPolygonXZ(c.x, c.z, L_OUTLINE)).toBe(false);
        expect(pointInPolygonXZ(c.x, c.z, DUP_OUTLINE)).toBe(false);

        slabStore.rebuilds.length = 0;
        expect(new CreateStairCommand(input).execute(ctx).success).toBe(true);

        // NOT a carve into the closest slab — that is today's defect.
        expect(openingStore.getAll()).toEqual([]);
        expect(slabStore.rebuilds).toEqual([]); // no pointless CSG pass either
    });

    it('(e) ESCAPE HATCH — a slab with NO resolvable outline still falls back to nearest-centre (unknown ≠ "does not contain")', () => {
        // Sketch-only / legacy slabs carry no `polygon`. Refusing there would turn
        // "we could not measure" into "we refuse" — a regression with a contract
        // citation attached. The legacy rule stays as the fallback.
        const { ctx, openingStore, slabStore } = makeCtx();
        slabStore.add({ id: 'slab-no-outline', levelId: 'L1', position: { x: 0, y: 0, z: 0 }, holes: [] });

        expect(new CreateStairCommand(stairInput('st-contain-e', 40, 40)).execute(ctx).success).toBe(true);
        const holes = openingStore.getByHostId('slab-no-outline');
        expect(holes.length).toBe(1);
        expect(holes[0].id).toBe(stairAutoOpeningId('st-contain-e'));
    });
});
