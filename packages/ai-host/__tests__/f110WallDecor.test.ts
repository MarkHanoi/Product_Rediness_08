// F1.10 (2026-05-30) — wall_art + wall_mirror contract-complete tests.

import { describe, expect, it } from 'vitest';
import { archetypeFor } from '../src/workflows/furnishLayout/archetypes.js';
import { footprintOf, FURNITURE_KINDS } from '../src/workflows/furnishLayout/footprints.js';
import { ROOM_RULES } from '../src/workflows/apartmentLayout/rules/programRules.js';

describe('F1.10 — wall_art + wall_mirror on the ai-host side', () => {
    it('FurnitureKind union admits both', () => {
        expect(FURNITURE_KINDS).toContain('wall_art');
        expect(FURNITURE_KINDS).toContain('wall_mirror');
    });

    it('both are wall-mounted at eye level (baseOffset ≈ 1.20 m)', () => {
        for (const k of ['wall_art', 'wall_mirror'] as const) {
            const f = footprintOf(k);
            expect(f.baseOffset).toBeGreaterThan(1.0);
            expect(f.baseOffset).toBeLessThan(1.5);
            expect(f.l).toBeLessThan(0.1);            // thin panel depth
            expect(f.clearFront).toBe(0);             // no floor blockage
        }
    });

    it("living-room archetype lists wall_art in the sofa group", () => {
        const arch = archetypeFor('living-room')!;
        const art = arch.items.find(i => i.kind === 'wall_art');
        expect(art).toBeDefined();
        expect(art!.group).toBe('sofa');
        expect(art!.excludeWindowWall).toBe(true);
    });

    it('bedroom archetype lists wall_mirror in the bed group', () => {
        const arch = archetypeFor('bedroom')!;
        const m = arch.items.find(i => i.kind === 'wall_mirror');
        expect(m).toBeDefined();
        expect(m!.group).toBe('bed');
    });

    it('programRules.living + programRules.master mirror the additions', () => {
        expect(ROOM_RULES.living.optionalFurniture).toContain('wall_art');
        expect(ROOM_RULES.master.optionalFurniture).toContain('wall_mirror');
    });
});
