// §FURNISH-ACCENT-OVERLAP + §FURNISH-KITCHEN-TRIANGLE-CONFIG (2026-06-29) —
// regression tests for the two live §VALIDATE defects on furnished residential
// layouts:
//   1. lamps OVERLAPPING their host (bedside table) / a neighbouring floor piece
//      (dresser) — and the validator's overlap finding shipping instead of feeding
//      back into placement (reject→retry→drop).
//   2. over-tight kitchen work-triangle HARD warnings (0.95 m legs) that were a
//      VALIDATOR ARTIFACT — the parametric run's real appliances are ≥1.2 m apart;
//      the degenerate run-centre heuristic fabricated the short legs.

import { describe, expect, it } from 'vitest';
import { furnishRoom } from '../src/workflows/furnishLayout/furnishRoom.js';
import { resolveAccentOverlaps } from '../src/workflows/furnishLayout/accentResolve.js';
import { validateFurnishedRoom } from '../src/workflows/furnishLayout/validate.js';
import { planKitchenRun } from '../src/workflows/furnishLayout/kitchenLayout.js';
import { validateKitchenFromFurniture } from '../src/workflows/apartmentLayout/dimensions/validateKitchenFromFurniture.js';
import { footprintOf } from '../src/workflows/furnishLayout/footprints.js';
import type { FurnishRoomInput, Pt, PlacedFurniture, FurnitureKind } from '../src/workflows/furnishLayout/types.js';

/** Rectangular room [0,0]→[w,d] with 4 walls + one door on the bottom wall. */
function rectRoom(occupancy: string, w: number, d: number, windows: FurnishRoomInput['windows'] = []): FurnishRoomInput {
    const poly: Pt[] = [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
    return {
        roomId: 'r1', levelId: 'L0', occupancy,
        polygon: poly, centroid: { x: w / 2, z: d / 2 }, areaM2: w * d,
        walls: [
            { a: { x: 0, z: 0 }, b: { x: w, z: 0 }, inwardNormal: { x: 0, z: 1 }, length: w, isExterior: true },
            { a: { x: 0, z: d }, b: { x: w, z: d }, inwardNormal: { x: 0, z: -1 }, length: w, isExterior: true },
            { a: { x: 0, z: 0 }, b: { x: 0, z: d }, inwardNormal: { x: 1, z: 0 }, length: d, isExterior: true },
            { a: { x: w, z: 0 }, b: { x: w, z: d }, inwardNormal: { x: -1, z: 0 }, length: d, isExterior: true },
        ],
        doors: [{ type: 'door', center: { x: w / 2, z: 0 }, normal: { x: 0, z: 1 }, width: 0.9 }],
        windows,
        levelElevation: 0,
    };
}

const place = (kind: FurnitureKind, x: number, z: number, rot = 0, fp = footprintOf(kind)): PlacedFurniture => ({
    kind, position: { x, y: 0, z }, rotationY: rot, footprint: fp, hostedSpaceId: 'r1',
});

// ── §FURNISH-ACCENT-OVERLAP ──────────────────────────────────────────────────
describe('§FURNISH-ACCENT-OVERLAP — lamps never ship overlapping their host or neighbours', () => {
    it('a furnished bedroom has NO lamp-overlap warnings (full pipeline)', () => {
        // Several bedrooms with different room-ids → different bed types (plain bed
        // → riding bedside lamps; Japanese → integrated lamps). None may ship a
        // lamp overlap warning after resolveAccentOverlaps.
        for (const roomId of ['rA', 'rB', 'rC', 'rD']) {
            const room = { ...rectRoom('bedroom', 3.6, 5.2), roomId };
            const placed = furnishRoom(room);
            const v = validateFurnishedRoom(room, placed);
            const lampOverlaps = v.warnings.filter(w => w.includes('OVERLAPS') && w.includes('lamp'));
            expect(lampOverlaps, `room ${roomId}: ${lampOverlaps.join(' | ')}`).toEqual([]);
        }
    });

    it('a lamp riding its host is height-separated (baseOffset = host top), not a clash', () => {
        // bedside_table (h 0.50) at the floor + a lamp centred on it. After resolution
        // the lamp footprint baseOffset sits at the table top → bands separated → the
        // validator does NOT report the host-clash.
        const table = place('bedside_table', 2, 4);
        const lampFp = { w: 0.15, l: 0.15, h: 0.22, baseOffset: 0, clearFront: 0, clearSides: 0 };
        const lamp = place('lamp', 2, 4, 0, lampFp);   // baseOffset 0 (the pre-fix bug)
        const [resolvedTable, resolvedLamp] = resolveAccentOverlaps([table, lamp]);
        expect(resolvedTable!.kind).toBe('bedside_table');
        expect(resolvedLamp!.kind).toBe('lamp');
        // lifted onto the table top
        expect(resolvedLamp!.footprint.baseOffset).toBeCloseTo(0.50, 6);
        const v = validateFurnishedRoom(rectRoom('bedroom', 5, 6), [resolvedTable!, resolvedLamp!]);
        expect(v.warnings.filter(w => w.includes('OVERLAPS'))).toEqual([]);
    });

    it('a lamp with NO host whose footprint overlaps a floor piece is DROPPED (not shipped)', () => {
        // A dresser (floor body) + a free-standing lamp whose CENTRE is just off the
        // dresser (no host contains it) but whose footprint still grazes the dresser.
        // With no host to slide onto, the lamp must be dropped rather than shipped.
        const dresser = place('dresser', 2, 4);                    // 1.20 × 0.50 → x∈[1.4,2.6], z∈[3.75,4.25]
        const lampFp = { w: 0.30, l: 0.30, h: 0.22, baseOffset: 0, clearFront: 0, clearSides: 0 };
        // centre at z=4.30 (just OUTSIDE the dresser's z-span 4.25) so no host contains
        // it, but the 0.30-deep footprint (z∈[4.15,4.45]) overlaps the dresser.
        const lamp = place('lamp', 2.0, 4.30, 0, lampFp);
        const resolved = resolveAccentOverlaps([dresser, lamp]);
        expect(resolved.some(p => p.kind === 'lamp')).toBe(false); // dropped
        expect(resolved.some(p => p.kind === 'dresser')).toBe(true);
        const v = validateFurnishedRoom(rectRoom('bedroom', 5, 6), resolved);
        expect(v.warnings.filter(w => w.includes('OVERLAPS'))).toEqual([]);
    });

    it('a lamp riding a host but poking a neighbour is NUDGED inboard onto the host (kept, clear)', () => {
        // host table at x=2; a wide dresser butts right beside it. The lamp sits at the
        // OUTBOARD edge of the table (toward the dresser). Resolution slides it inboard
        // toward the table centre until clear → kept, no overlap.
        const table = place('bedside_table', 2.0, 4.0);            // 0.45 wide → spans x∈[1.775,2.225]
        const dresser = place('dresser', 3.0, 4.0);                // 1.20 wide → spans x∈[2.4,3.6]
        // lamp at the table's outboard edge nearest the dresser, but still on the table
        const lampFp = { w: 0.15, l: 0.15, h: 0.22, baseOffset: 0, clearFront: 0, clearSides: 0 };
        const lamp = place('lamp', 2.18, 4.0, 0, lampFp);
        const resolved = resolveAccentOverlaps([table, dresser, lamp]);
        const keptLamp = resolved.find(p => p.kind === 'lamp');
        expect(keptLamp).toBeDefined();
        const v = validateFurnishedRoom(rectRoom('bedroom', 6, 6), resolved);
        expect(v.warnings.filter(w => w.includes('OVERLAPS'))).toEqual([]);
    });

    it('non-accent items pass through byte-identical', () => {
        const bed = place('bed', 2, 4);
        const wardrobe = place('wardrobe', 4, 1);
        const resolved = resolveAccentOverlaps([bed, wardrobe]);
        expect(resolved).toEqual([bed, wardrobe]);
    });
});

// ── §FURNISH-KITCHEN-TRIANGLE-CONFIG ─────────────────────────────────────────
describe('§FURNISH-KITCHEN-TRIANGLE-CONFIG — parametric run legs read from config ≥ 1.2 m', () => {
    it('a normal parametric kitchen run does NOT HARD-fail the work-triangle', () => {
        // The exact defect: a ~5 m kitchen whose parametric run was measured as a
        // degenerate 0.25·width triangle (≈0.95 m legs). Reading the config cells
        // gives the true ≥1.2 m spacing → no HARD findings.
        const run = planKitchenRun(rectRoom('kitchen', 5, 4), 'auto');
        expect(run.length).toBeGreaterThan(0);
        const tri = validateKitchenFromFurniture('k1', run);
        expect(tri).not.toBeNull();
        const hardLegs = tri!.hardFindings.filter(f => f.metric.startsWith('legMin'));
        expect(hardLegs, hardLegs.map(f => f.reason).join(' | ')).toEqual([]);
    });

    it('post-furnish kitchen validation has NO kitchen-triangle HARD warning on a normal kitchen', () => {
        const room = rectRoom('kitchen', 5, 4);
        const run = planKitchenRun(room, 'auto');
        const v = validateFurnishedRoom(room, run);
        const hard = v.warnings.filter(w => w.startsWith('kitchen-triangle (HARD)'));
        expect(hard, hard.join(' | ')).toEqual([]);
    });

    it('an L-shape parametric run reads its fridge off the secondary arm (legs ≥ 1.2 m)', () => {
        // A squarish kitchen → L; the fridge sits on the secondary arm one cell off
        // the corner, the sink + hob on the spine. All legs must clear the hard min.
        const run = planKitchenRun(rectRoom('kitchen', 4.2, 4.0), 'L');
        const tri = validateKitchenFromFurniture('k1', run);
        expect(tri).not.toBeNull();
        expect(tri!.hardFindings.filter(f => f.metric.startsWith('legMin'))).toEqual([]);
    });

    it('runs WITHOUT a kitchenConfig still use the legacy heuristic (back-compat)', () => {
        // A bare kitchen_straight (no config) keeps the degenerate single-run path.
        const bare = place('kitchen_straight', 2, 1.5);
        const tri = validateKitchenFromFurniture('k1', [bare]);
        expect(tri).not.toBeNull();
        // Still degenerate (sumMin) — unchanged behaviour for config-less runs.
        expect(tri!.admissible).toBe(false);
    });
});
