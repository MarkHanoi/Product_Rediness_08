// F1.11 (2026-05-30) — curtain_rod + curtain_panel contract-complete tests.

import { describe, expect, it } from 'vitest';
import { archetypeFor } from '../src/workflows/furnishLayout/archetypes.js';
import { footprintOf, FURNITURE_KINDS } from '../src/workflows/furnishLayout/footprints.js';
import { ROOM_RULES } from '../src/workflows/apartmentLayout/rules/programRules.js';

const NEW_KINDS = ['curtain_rod', 'curtain_panel'] as const;

describe('F1.11 — curtain_rod + curtain_panel on the ai-host side', () => {
    it('FurnitureKind union admits both', () => {
        for (const k of NEW_KINDS) expect(FURNITURE_KINDS).toContain(k);
    });

    it('curtain_rod is ceiling-adjacent (baseOffset > 2.0 m)', () => {
        const r = footprintOf('curtain_rod');
        expect(r.baseOffset).toBeGreaterThan(2.0);
        expect(r.h).toBeLessThan(0.10);     // thin rod profile
    });

    it('curtain_panel is a tall floor-anchored fabric slab', () => {
        const p = footprintOf('curtain_panel');
        expect(p.baseOffset).toBe(0);
        expect(p.h).toBeGreaterThan(2.0);
        expect(p.l).toBeLessThan(0.1);      // thin slab depth
    });

    it("bedroom + living-room + master archetypes wire curtains as 'curtains' group, anchored on window wall", () => {
        for (const occ of ['bedroom', 'living-room'] as const) {
            const arch = archetypeFor(occ)!;
            const rod = arch.items.find(i => i.kind === 'curtain_rod');
            const panel = arch.items.find(i => i.kind === 'curtain_panel');
            expect(rod, `${occ} missing rod`).toBeDefined();
            expect(panel, `${occ} missing panel`).toBeDefined();
            expect(rod!.group).toBe('curtains');
            expect(panel!.group).toBe('curtains');
            expect(rod!.anchor).toBe('wall-window');
            expect(panel!.count).toBe(2);  // two panels per rod
        }
    });

    it('programRules.living + bedroom + master carry curtain_rod + curtain_panel', () => {
        for (const ruleKey of ['living', 'bedroom', 'master'] as const) {
            const rule = ROOM_RULES[ruleKey];
            expect(rule.optionalFurniture).toContain('curtain_rod');
            expect(rule.optionalFurniture).toContain('curtain_panel');
        }
    });
});
