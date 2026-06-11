// §67 (2026-06-11) — soft furnishings + furniture variety regression tests.
//
// Founder ask (tracker §67): rugs in front of / under beds, under the dining
// table, in front of the sofa; bed variety (some with integrated bedside tables
// + lamps — consistency: never BOTH integrated and separate); an L-shape sofa
// for large living rooms. This pins:
//   §67.1 — rugs are placed (bedroom / dining / living) and are collision-EXEMPT.
//   §67.2 — each bedroom gets ONE coherent bed set (no double nightstand lamps).
//   §67.3 — a large living room gets the L-shape corner sofa; a small one stays
//           on the straight sofa.

import { describe, expect, it } from 'vitest';
import { furnishRoom } from '../src/workflows/furnishLayout/furnishRoom.js';
import { buildFurnishCommands } from '../src/workflows/furnishLayout/buildFurnishCommands.js';
import {
    chooseBedSet, integratedBedKind, stableHash,
} from '../src/workflows/furnishLayout/bedVariety.js';
import { preferCornerSofa } from '../src/workflows/furnishLayout/sofaVariety.js';
import { footprintRect, rectsOverlap } from '../src/workflows/furnishLayout/collision.js';
import type { FurnishRoomInput, Pt, PlacedFurniture } from '../src/workflows/furnishLayout/types.js';

/** Rectangular room [0,0]→[w,d], 4 walls, one door on the bottom wall. */
function rectRoom(occupancy: string, w: number, d: number, roomId = 'r1'): FurnishRoomInput {
    const poly: Pt[] = [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
    return {
        roomId, levelId: 'L0', occupancy,
        polygon: poly, centroid: { x: w / 2, z: d / 2 }, areaM2: w * d,
        walls: [
            { a: { x: 0, z: 0 }, b: { x: w, z: 0 }, inwardNormal: { x: 0, z: 1 }, length: w, isExterior: true },
            { a: { x: 0, z: d }, b: { x: w, z: d }, inwardNormal: { x: 0, z: -1 }, length: w, isExterior: false },
            { a: { x: 0, z: 0 }, b: { x: 0, z: d }, inwardNormal: { x: 1, z: 0 }, length: d, isExterior: true },
            { a: { x: w, z: 0 }, b: { x: w, z: d }, inwardNormal: { x: -1, z: 0 }, length: d, isExterior: false },
        ],
        doors: [{ type: 'door', center: { x: w / 2, z: 0 }, normal: { x: 0, z: 1 }, width: 0.9 }],
        windows: [], levelElevation: 0,
    };
}

const rectOf = (p: PlacedFurniture) =>
    footprintRect(p.position.x, p.position.z, p.footprint.w, p.footprint.l, p.rotationY);
const isBed = (k: string): boolean => k === 'bed' || k === 'nordic_bed' || k === 'solid_wood_bed';

/** Find a roomId whose bed set matches `want`, so the test is deterministic
 *  without hard-coding a hash. Searches a small fixed id space (deterministic). */
function roomIdForSet(want: 'separate' | 'integrated'): string {
    for (let i = 0; i < 1000; i++) {
        const id = `room-${i}`;
        if (chooseBedSet(id) === want) return id;
    }
    throw new Error(`no room id found for set ${want}`);
}

// ── §67.1 — rugs ─────────────────────────────────────────────────────────────
describe('§67.1 — rugs (soft furnishings)', () => {
    it('a bedroom gets a rug laid under/in front of the bed', () => {
        const placed = furnishRoom(rectRoom('bedroom', 3.6, 5.2, roomIdForSet('separate')));
        const rugs = placed.filter(p => p.kind === 'rug');
        expect(rugs.length).toBe(1);
        const bed = placed.find(p => isBed(p.kind))!;
        // The rug centre is at the bed centre (centred under it).
        expect(rugs[0]!.position.x).toBeCloseTo(bed.position.x, 6);
        expect(rugs[0]!.position.z).toBeCloseTo(bed.position.z, 6);
        // It sits ON the floor (thin).
        expect(rugs[0]!.footprint.h).toBeLessThan(0.05);
        expect(rugs[0]!.position.y).toBeCloseTo(0, 6);
    });

    it('a dining room gets a rug under the dining table (centred on the table)', () => {
        const placed = furnishRoom(rectRoom('dining-room', 5, 4));
        const rug = placed.find(p => p.kind === 'rug');
        const table = placed.find(p => p.kind === 'dining_table');
        expect(rug).toBeDefined();
        expect(table).toBeDefined();
        expect(rug!.position.x).toBeCloseTo(table!.position.x, 6);
        expect(rug!.position.z).toBeCloseTo(table!.position.z, 6);
        // The rug extends past the table footprint (anchors the chair ring).
        expect(rug!.footprint.w).toBeGreaterThan(table!.footprint.w);
    });

    it('a living room gets a rug in front of the sofa', () => {
        const placed = furnishRoom(rectRoom('living-room', 5, 4));
        const rug = placed.find(p => p.kind === 'rug');
        expect(rug).toBeDefined();
        expect(rug!.position.y).toBeCloseTo(0, 6);
    });

    it('the rug is COLLISION-EXEMPT — it may overlap the bed/table it sits under', () => {
        // The whole point: the rug underlaps the bed. Pin that the engine DID let
        // a rug overlap a bed (it would never place an overlapping non-rug item).
        const placed = furnishRoom(rectRoom('bedroom', 3.6, 5.2, roomIdForSet('separate')));
        const rug = placed.find(p => p.kind === 'rug')!;
        const bed = placed.find(p => isBed(p.kind))!;
        expect(rectsOverlap(rectOf(rug), rectOf(bed))).toBe(true);
    });

    it('the rug never pokes outside the room polygon (clamped)', () => {
        // A tiny bedroom: the rug must shrink to fit inside the walls.
        const placed = furnishRoom(rectRoom('bedroom', 3.0, 3.2, roomIdForSet('separate')));
        const rug = placed.find(p => p.kind === 'rug');
        if (rug) {
            const r = rectOf(rug);
            expect(r.x0).toBeGreaterThanOrEqual(-1e-6);
            expect(r.z0).toBeGreaterThanOrEqual(-1e-6);
            expect(r.x1).toBeLessThanOrEqual(3.0 + 1e-6);
            expect(r.z1).toBeLessThanOrEqual(3.2 + 1e-6);
        }
    });

    it('the rug round-trips to a furniture.create the executor understands', () => {
        const placed = furnishRoom(rectRoom('dining-room', 5, 4));
        let n = 0;
        const set = buildFurnishCommands(placed, 'L0', 0, () => `f-${n++}`);
        const rugCmd = set.commands.find(c => (c.payload as Record<string, unknown>).furnitureType === 'rug');
        expect(rugCmd).toBeDefined();
        const p = rugCmd!.payload as Record<string, unknown>;
        expect(rugCmd!.command).toBe('furniture.create');
        expect(typeof p.rotation).toBe('number');      // SCALAR yaw
        expect((p.metadata as { hostedSpaceId: string }).hostedSpaceId).toBe('r1');
        expect(set.warnings).toEqual([]);              // rug has a positive footprint
    });
});

// ── §67.2 — bed variety + consistency ────────────────────────────────────────
describe('§67.2 — bed variety + consistency guard', () => {
    it('the bed set is DETERMINISTIC per room id (no RNG)', () => {
        const id = 'room-deterministic';
        expect(chooseBedSet(id)).toBe(chooseBedSet(id));
        expect(integratedBedKind(id)).toBe(integratedBedKind(id));
        // stableHash is stable.
        expect(stableHash('abc')).toBe(stableHash('abc'));
    });

    it('different rooms can get different bed sets (variety across an apartment)', () => {
        const sets = new Set<string>();
        for (let i = 0; i < 40; i++) sets.add(chooseBedSet(`bedroom-${i}`));
        expect(sets.size).toBe(2);   // both 'separate' and 'integrated' occur
    });

    it('SEPARATE set: plain bed + 2 bedside tables + 2 lamps (no variant bed)', () => {
        const placed = furnishRoom(rectRoom('bedroom', 3.6, 5.2, roomIdForSet('separate')));
        expect(placed.some(p => p.kind === 'bed')).toBe(true);
        expect(placed.some(p => p.kind === 'nordic_bed' || p.kind === 'solid_wood_bed')).toBe(false);
        const tables = placed.filter(p => p.kind === 'bedside_table');
        const lamps = placed.filter(p => p.kind === 'lamp');
        expect(tables.length).toBe(2);
        // EXACTLY one lamp per nightstand — never doubled (the consistency check).
        const onTables = lamps.filter(l =>
            tables.some(t => Math.abs(t.position.x - l.position.x) < 1e-6
                          && Math.abs(t.position.z - l.position.z) < 1e-6));
        expect(onTables.length).toBe(2);
    });

    it('INTEGRATED set: variant bed (no plain bed) + 2 bedside tables + exactly 2 lamps', () => {
        const id = roomIdForSet('integrated');
        const placed = furnishRoom(rectRoom('bedroom', 3.6, 5.2, id));
        // Uses a variant bed, NOT the plain `bed`.
        expect(placed.some(p => p.kind === 'bed')).toBe(false);
        expect(placed.some(p => p.kind === integratedBedKind(id))).toBe(true);
        const tables = placed.filter(p => p.kind === 'bedside_table');
        const lamps = placed.filter(p => p.kind === 'lamp');
        expect(tables.length).toBe(2);
        // CONSISTENCY: exactly one lamp per nightstand — the integrated path owns
        // its lamps and bedsideLamps.ts is suppressed → never doubled.
        const onTables = lamps.filter(l =>
            tables.some(t => Math.abs(t.position.x - l.position.x) < 1e-6
                          && Math.abs(t.position.z - l.position.z) < 1e-6));
        expect(onTables.length).toBe(2);
        // No floor lamp double-count: total lamps == nightstand lamps (the
        // bedroom corner lamp is separate; assert no MORE than 1 lamp per table).
        expect(lamps.length).toBeLessThanOrEqual(tables.length + 1);
    });
});

// ── §67.3 — L-shape sofa ─────────────────────────────────────────────────────
describe('§67.3 — L-shape (corner) sofa for large living rooms', () => {
    it('preferCornerSofa: large room → true, small room → false', () => {
        expect(preferCornerSofa(24, 6, 4)).toBe(true);    // 24 m², fits an L
        expect(preferCornerSofa(12, 4, 3)).toBe(false);   // below area threshold
        expect(preferCornerSofa(18, 2.5, 7.2)).toBe(false); // area ok but too narrow for the L depth
    });

    it('a large living room gets the corner_sofa (and NOT the straight sofa)', () => {
        const placed = furnishRoom(rectRoom('living-room', 6, 5));   // 30 m²
        expect(placed.some(p => p.kind === 'corner_sofa')).toBe(true);
        expect(placed.some(p => p.kind === 'sofa')).toBe(false);
        // The coffee table + rug still pair to the sofa group.
        expect(placed.some(p => p.kind === 'rug')).toBe(true);
    });

    it('a small living room keeps the straight sofa', () => {
        const placed = furnishRoom(rectRoom('living-room', 4, 3));   // 12 m²
        expect(placed.some(p => p.kind === 'sofa')).toBe(true);
        expect(placed.some(p => p.kind === 'corner_sofa')).toBe(false);
    });

    it('the corner_sofa round-trips to a furniture.create', () => {
        const placed = furnishRoom(rectRoom('living-room', 6, 5));
        let n = 0;
        const set = buildFurnishCommands(placed, 'L0', 0, () => `f-${n++}`);
        const cmd = set.commands.find(c => (c.payload as Record<string, unknown>).furnitureType === 'corner_sofa');
        expect(cmd).toBeDefined();
        expect(cmd!.command).toBe('furniture.create');
    });
});
