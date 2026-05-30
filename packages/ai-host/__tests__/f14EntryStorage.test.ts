// F1.4 (2026-05-30) — Entry storage (S2 activity system) contract-complete tests.

import { describe, expect, it } from 'vitest';
import { archetypeFor } from '../src/workflows/furnishLayout/archetypes.js';
import { footprintOf, FURNITURE_KINDS } from '../src/workflows/furnishLayout/footprints.js';
import { ROOM_RULES } from '../src/workflows/apartmentLayout/rules/programRules.js';

const NEW_KINDS = ['shoe_cabinet', 'coat_rack', 'console_table', 'entry_bench'] as const;

describe('F1.4 — entry storage (S2) on the ai-host side', () => {
    it('FurnitureKind union admits all four entry storage primitives', () => {
        for (const k of NEW_KINDS) expect(FURNITURE_KINDS).toContain(k);
    });

    it('footprints are sized for the hall envelope (< 1.5 m wide, < 0.5 m deep)', () => {
        for (const k of NEW_KINDS) {
            const f = footprintOf(k);
            expect(f.w).toBeLessThanOrEqual(1.5);
            expect(f.l).toBeLessThanOrEqual(0.5);
            expect(f.h).toBeGreaterThan(0);
        }
    });

    it("entrance-lobby archetype wires the S2 system (4 new items + legacy entrance_table)", () => {
        const arch = archetypeFor('entrance-lobby')!;
        const kinds = arch.items.map(i => i.kind);
        for (const k of NEW_KINDS) expect(kinds).toContain(k);
        // Group membership: shoe_cabinet + console_table + entry_bench share 'entry'.
        for (const k of ['shoe_cabinet', 'console_table', 'entry_bench'] as const) {
            const item = arch.items.find(i => i.kind === k);
            expect(item!.group).toBe('entry');
        }
        // coat_rack has no group (free-standing corner piece).
        const coat = arch.items.find(i => i.kind === 'coat_rack');
        expect(coat!.group).toBeUndefined();
    });

    it('programRules.hall optionalFurniture lists all four + furnitureSpec carries them', () => {
        const hall = ROOM_RULES.hall;
        for (const k of NEW_KINDS) {
            expect(hall.optionalFurniture).toContain(k);
            const spec = hall.furnitureSpec.find(s => s.kind === k);
            expect(spec, `spec for ${k} missing`).toBeDefined();
        }
    });

    it('console_table prefers the wall opposite the front door (lobby landing zone)', () => {
        const arch = archetypeFor('entrance-lobby')!;
        const console_ = arch.items.find(i => i.kind === 'console_table');
        expect(console_!.anchor).toBe('wall-opposite-door');
        expect(console_!.excludeDoorSwing).toBe(true);
    });
});
