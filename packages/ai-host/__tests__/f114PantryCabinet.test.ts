// F1.14 (2026-05-30) — pantry_cabinet contract-complete tests.

import { describe, expect, it } from 'vitest';
import { archetypeFor } from '../src/workflows/furnishLayout/archetypes.js';
import { footprintOf, FURNITURE_KINDS } from '../src/workflows/furnishLayout/footprints.js';
import { ROOM_RULES } from '../src/workflows/apartmentLayout/rules/programRules.js';

describe('F1.14 — pantry_cabinet on the ai-host side', () => {
    it('FurnitureKind union admits pantry_cabinet', () => {
        expect(FURNITURE_KINDS).toContain('pantry_cabinet');
    });

    it('footprint is tall + narrow with generous front clearance', () => {
        const f = footprintOf('pantry_cabinet');
        expect(f.w).toBeLessThanOrEqual(0.8);     // narrow
        expect(f.l).toBeLessThanOrEqual(0.5);     // shallow body
        expect(f.h).toBeGreaterThan(1.8);          // tall
        expect(f.clearFront).toBeGreaterThanOrEqual(0.8); // double-door + reach
    });

    it('kitchen archetype lists pantry_cabinet on a longest-wall anchor', () => {
        const arch = archetypeFor('kitchen')!;
        const item = arch.items.find(i => i.kind === 'pantry_cabinet');
        expect(item).toBeDefined();
        expect(item!.anchor).toBe('wall-longest');
        expect(item!.excludeWindowWall).toBe(true);
        expect(item!.required).toBe(false);
    });

    it('programRules.kitchen carries pantry_cabinet', () => {
        const k = ROOM_RULES.kitchen;
        expect(k.optionalFurniture).toContain('pantry_cabinet');
        const spec = k.furnitureSpec.find(s => s.kind === 'pantry_cabinet');
        expect(spec).toBeDefined();
        expect(spec!.placementRule).toBe('longest_wall');
        expect(spec!.excludeWindowWall).toBe(true);
    });
});
