// D-FLE F-Sprint-1 — foundations (footprints, collision, archetypes).
// Contract (SPEC-FURNITURE-LAYOUT-ENGINE §8 F2/F3/F6).

import { describe, expect, it } from 'vitest';
import { footprintOf, footprintArea, FURNITURE_KINDS } from '../src/workflows/furnishLayout/footprints.js';
import { archetypeFor, FURNISHABLE_OCCUPANCIES } from '../src/workflows/furnishLayout/archetypes.js';
import { rectsOverlap, pointInPolygon, rectInPolygon, footprintRect, overlapsAny } from '../src/workflows/furnishLayout/collision.js';
import type { Pt, Rect } from '../src/workflows/furnishLayout/types.js';

describe('footprints (F3)', () => {
    it('every catalogued kind has positive dimensions', () => {
        for (const k of FURNITURE_KINDS) {
            const f = footprintOf(k);
            expect(f.w).toBeGreaterThan(0);
            expect(f.l).toBeGreaterThan(0);
            expect(f.h).toBeGreaterThan(0);
            expect(f.clearFront).toBeGreaterThanOrEqual(0);
        }
    });
    it('footprintArea = w × l', () => {
        // §FURNITURE-SPEC (2026-05-28): bed revised to UK double 1.35 × 1.90 m
        // (architect's interactive plan database). Pinned by furnishRules.test.ts.
        expect(footprintArea('bed')).toBeCloseTo(1.35 * 1.90, 6);
    });
});

describe('archetypes (F2)', () => {
    it('every furnishable occupancy returns an archetype with valid footprints', () => {
        for (const occ of FURNISHABLE_OCCUPANCIES) {
            const a = archetypeFor(occ)!;
            expect(a.occupancy).toBe(occ);
            for (const item of a.items) expect(footprintOf(item.kind)).toBeDefined();   // every item kind has a footprint
        }
    });
    it('bedroom = bed (required) + 2 bedside tables + wardrobe, ordered bed-first', () => {
        const a = archetypeFor('bedroom')!;
        expect(a.items[0]!.kind).toBe('bed');
        expect(a.items[0]!.required).toBe(true);
        expect(a.items.find(i => i.kind === 'bedside_table')!.count).toBe(2);
        expect(a.items.some(i => i.kind === 'wardrobe')).toBe(true);
    });
    it('living-room leads with a sofa; kitchen has a cabinet run; dining has a table', () => {
        expect(archetypeFor('living-room')!.items[0]!.kind).toBe('sofa');
        expect(archetypeFor('kitchen')!.items.some(i => i.kind.startsWith('kitchen_'))).toBe(true);
        expect(archetypeFor('dining-room')!.items[0]!.kind).toBe('dining_table');
    });
    it('circulation rooms are unfurnished; unknown types → null', () => {
        expect(archetypeFor('corridor')!.items).toHaveLength(0);
        expect(archetypeFor('nonsense-type')).toBeNull();
    });

    // F3.x archetype follow-ons (2026-05-30) — hall mirror + lounge_chair
    // wired into entrance-lobby / bedroom / living-room respectively.
    it('entrance-lobby (hall) archetype carries wall_mirror as an optional entry-group item', () => {
        const items = archetypeFor('entrance-lobby')!.items;
        const mirror = items.find(i => i.kind === 'wall_mirror');
        expect(mirror).toBeDefined();
        expect(mirror!.required).toBe(false);
        expect(mirror!.group).toBe('entry');
    });

    it('bedroom archetype carries lounge_chair as an optional corner reading chair', () => {
        const items = archetypeFor('bedroom')!.items;
        const chair = items.find(i => i.kind === 'lounge_chair');
        expect(chair).toBeDefined();
        expect(chair!.required).toBe(false);
        expect(chair!.anchor).toBe('corner');
    });

    it('living-room archetype carries lounge_chair as an optional corner seat', () => {
        const items = archetypeFor('living-room')!.items;
        const chair = items.find(i => i.kind === 'lounge_chair');
        expect(chair).toBeDefined();
        expect(chair!.required).toBe(false);
        expect(chair!.anchor).toBe('corner');
    });
});

describe('collision (F6)', () => {
    const room: Pt[] = [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }];

    it('rectsOverlap is strict (touching edges do not overlap)', () => {
        const a: Rect = { x0: 0, z0: 0, x1: 2, z1: 2 };
        expect(rectsOverlap(a, { x0: 1, z0: 1, x1: 3, z1: 3 })).toBe(true);
        expect(rectsOverlap(a, { x0: 2, z0: 0, x1: 4, z1: 2 })).toBe(false);   // share an edge
    });
    it('pointInPolygon + rectInPolygon', () => {
        expect(pointInPolygon({ x: 3, z: 2 }, room)).toBe(true);
        expect(pointInPolygon({ x: 7, z: 2 }, room)).toBe(false);
        expect(rectInPolygon({ x0: 1, z0: 1, x1: 2, z1: 2 }, room)).toBe(true);
        expect(rectInPolygon({ x0: 5, z0: 1, x1: 7, z1: 2 }, room)).toBe(false); // pokes out
    });
    it('footprintRect orients by yaw quadrant (90° swaps w/l)', () => {
        const r0 = footprintRect(0, 0, 2, 1, 0);            // w along x
        expect(r0.x1 - r0.x0).toBeCloseTo(2, 6);
        expect(r0.z1 - r0.z0).toBeCloseTo(1, 6);
        const r90 = footprintRect(0, 0, 2, 1, Math.PI / 2); // swapped
        expect(r90.x1 - r90.x0).toBeCloseTo(1, 6);
        expect(r90.z1 - r90.z0).toBeCloseTo(2, 6);
    });
    it('overlapsAny detects collision against placed items', () => {
        const placed: Rect[] = [{ x0: 0, z0: 0, x1: 1, z1: 1 }];
        expect(overlapsAny({ x0: 0.5, z0: 0.5, x1: 1.5, z1: 1.5 }, placed)).toBe(true);
        expect(overlapsAny({ x0: 2, z0: 2, x1: 3, z1: 3 }, placed)).toBe(false);
    });
});
