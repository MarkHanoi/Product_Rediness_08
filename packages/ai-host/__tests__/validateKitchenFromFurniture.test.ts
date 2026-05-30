// D2.3 integration helper tests.

import { describe, expect, it } from 'vitest';
import { validateKitchenFromFurniture } from '../src/workflows/apartmentLayout/dimensions/validateKitchenFromFurniture.js';
import { footprintOf } from '../src/workflows/furnishLayout/footprints.js';
import type { PlacedFurniture, FurnitureKind } from '../src/workflows/furnishLayout/types.js';

const place = (kind: FurnitureKind, x: number, z: number, rot = 0): PlacedFurniture => ({
    kind, position: { x, y: 0, z }, rotationY: rot,
    footprint: footprintOf(kind), hostedSpaceId: 'k',
});

describe('D2.3 integration — validateKitchenFromFurniture', () => {
    it('null when no kitchen furniture is placed', () => {
        const result = validateKitchenFromFurniture('k1', [
            place('sofa', 0, 0),
            place('dining_table', 5, 5),
        ]);
        expect(result).toBeNull();
    });

    it('L-shape (two runs) yields a validation result', () => {
        // Two runs at the L corner — sink + stove + midpoint fridge.
        const result = validateKitchenFromFurniture('k1', [
            place('kitchen_straight', 0, 0),
            place('kitchen_straight', 2, 2),
        ]);
        expect(result).not.toBeNull();
        // The midpoint heuristic gives a triangle with very short legs,
        // probably HARD-rejecting on legMin — the validator's job, not ours.
        expect(typeof result!.admissible).toBe('boolean');
    });

    it('run + island yields a triangle from run + island + opposite-end fridge', () => {
        const result = validateKitchenFromFurniture('k1', [
            place('kitchen_straight', 0, 0),
            place('kitchen_island', 2.5, 1.5),
        ]);
        expect(result).not.toBeNull();
        // Legs depend on positions; the test only asserts the helper produces
        // a non-null validation result the engine can act on.
        expect(typeof result!.admissible).toBe('boolean');
    });

    it('single run alone produces a degenerate-triangle validation (sumMin HARD)', () => {
        const result = validateKitchenFromFurniture('k1', [
            place('kitchen_straight', 0, 0),
        ]);
        expect(result).not.toBeNull();
        // Three positions along the same line → degenerate triangle →
        // sum of legs ≈ 1.5 m → below the 3.6 m hard min.
        expect(result!.admissible).toBe(false);
        expect(result!.hardFindings.some(f => f.metric === 'sumMin' || f.metric.startsWith('legMin'))).toBe(true);
    });

    // §D2.3-DFLE (2026-05-30) — the helper is now wired into the D-FLE
    // post-furnish validator (`validateFurnishedRoom`). Kitchen rooms get
    // triangle warnings surfaced via the room's `warnings` array.
    it('integrates with D-FLE post-furnish validator on kitchen rooms', async () => {
        const { validateFurnishedRoom } = await import('../src/workflows/furnishLayout/validate.js');
        const polygon = [
            { x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 },
        ];
        // Kitchen room with a SINGLE kitchen_straight — degenerate triangle.
        const result = validateFurnishedRoom(
            {
                roomId: 'k1', levelId: 'L0', occupancy: 'kitchen',
                polygon, centroid: { x: 2, z: 1.5 }, areaM2: 12,
                walls: [], doors: [], windows: [], levelElevation: 0,
            },
            [place('kitchen_straight', 2, 1.5)],
        );
        // The degenerate triangle produces HARD triangle warnings.
        expect(result.warnings.some(w => w.startsWith('kitchen-triangle (HARD)'))).toBe(true);
        expect(result.ok).toBe(false);
    });

    it('non-kitchen rooms do NOT receive triangle warnings even with kitchen-like furniture', async () => {
        const { validateFurnishedRoom } = await import('../src/workflows/furnishLayout/validate.js');
        const polygon = [
            { x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 4 }, { x: 0, z: 4 },
        ];
        const result = validateFurnishedRoom(
            {
                roomId: 'b1', levelId: 'L0', occupancy: 'living-room',     // NOT kitchen
                polygon, centroid: { x: 2.5, z: 2 }, areaM2: 20,
                walls: [], doors: [], windows: [], levelElevation: 0,
            },
            [place('sofa', 2.5, 2)],
        );
        expect(result.warnings.some(w => w.startsWith('kitchen-triangle'))).toBe(false);
    });
});
