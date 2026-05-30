// F1.12 (2026-05-30) — dresser + vanity_table contract-complete tests.

import { describe, expect, it } from 'vitest';
import { archetypeFor } from '../src/workflows/furnishLayout/archetypes.js';
import { footprintOf, FURNITURE_KINDS } from '../src/workflows/furnishLayout/footprints.js';
import { ROOM_RULES } from '../src/workflows/apartmentLayout/rules/programRules.js';

describe('F1.12 — dresser + vanity_table on the ai-host side', () => {
    it('FurnitureKind union admits both', () => {
        expect(FURNITURE_KINDS).toContain('dresser');
        expect(FURNITURE_KINDS).toContain('vanity_table');
    });

    it('dresser footprint is a low wide chest', () => {
        const d = footprintOf('dresser');
        expect(d.w).toBeGreaterThan(1.0);
        expect(d.h).toBeLessThan(1.0);
        expect(d.clearFront).toBeGreaterThanOrEqual(0.7);
    });

    it('vanity_table footprint is a narrow small dressing table', () => {
        const v = footprintOf('vanity_table');
        expect(v.w).toBeLessThanOrEqual(1.0);
        expect(v.l).toBeLessThanOrEqual(0.55);
        expect(v.h).toBeLessThan(0.85);
        expect(v.clearFront).toBeGreaterThanOrEqual(0.7);
    });

    it('bedroom archetype lists dresser (longest wall) + vanity_table (window wall)', () => {
        const arch = archetypeFor('bedroom')!;
        const d = arch.items.find(i => i.kind === 'dresser');
        const v = arch.items.find(i => i.kind === 'vanity_table');
        expect(d).toBeDefined();
        expect(v).toBeDefined();
        expect(d!.anchor).toBe('wall-longest');
        expect(d!.excludeWindowWall).toBe(true);
        expect(v!.anchor).toBe('wall-window');   // dressing prefers natural light
    });

    it('programRules.master lists both + furnitureSpec entries', () => {
        const master = ROOM_RULES.master;
        expect(master.optionalFurniture).toContain('dresser');
        expect(master.optionalFurniture).toContain('vanity_table');
        const dSpec = master.furnitureSpec.find(s => s.kind === 'dresser');
        const vSpec = master.furnitureSpec.find(s => s.kind === 'vanity_table');
        expect(dSpec).toBeDefined();
        expect(vSpec).toBeDefined();
        expect(vSpec!.placementRule).toBe('window_wall');
    });
});
