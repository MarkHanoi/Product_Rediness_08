// F1.9 (2026-05-30) — buffet + sideboard contract-complete tests.

import { describe, expect, it } from 'vitest';
import { archetypeFor } from '../src/workflows/furnishLayout/archetypes.js';
import { footprintOf, FURNITURE_KINDS } from '../src/workflows/furnishLayout/footprints.js';
import { ROOM_RULES } from '../src/workflows/apartmentLayout/rules/programRules.js';

describe('F1.9 — buffet + sideboard on the ai-host side', () => {
    it('FurnitureKind union admits buffet + sideboard', () => {
        expect(FURNITURE_KINDS).toContain('buffet');
        expect(FURNITURE_KINDS).toContain('sideboard');
    });

    it('footprints have the dining-storage profile (wide, deep, on the floor)', () => {
        for (const k of ['buffet', 'sideboard'] as const) {
            const f = footprintOf(k);
            expect(f.baseOffset).toBe(0);
            expect(f.w).toBeGreaterThan(1.2);
            expect(f.l).toBeGreaterThan(0.3);
            expect(f.h).toBeGreaterThan(0.6);
            expect(f.clearFront).toBeGreaterThanOrEqual(0.5);
        }
    });

    it('sideboard is LOWER than the buffet (silhouette intent)', () => {
        const buffet = footprintOf('buffet');
        const sideboard = footprintOf('sideboard');
        expect(sideboard.h).toBeLessThan(buffet.h);
        // …and the sideboard is WIDER than the buffet.
        expect(sideboard.w).toBeGreaterThanOrEqual(buffet.w);
    });

    it('dining-room archetype lists both, anchored on the longest free wall', () => {
        const arch = archetypeFor('dining-room')!;
        for (const k of ['buffet', 'sideboard'] as const) {
            const item = arch.items.find(i => i.kind === k);
            expect(item).toBeDefined();
            expect(item!.anchor).toBe('wall-longest');
            expect(item!.excludeWindowWall).toBe(true);
        }
    });

    it('programRules.dining lists both + furnitureSpec entries', () => {
        const dining = ROOM_RULES.dining;
        for (const k of ['buffet', 'sideboard'] as const) {
            expect(dining.optionalFurniture).toContain(k);
            const spec = dining.furnitureSpec.find(s => s.kind === k);
            expect(spec).toBeDefined();
            expect(spec!.placementRule).toBe('longest_wall');
        }
    });
});
