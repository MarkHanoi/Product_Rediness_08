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

    it("living-room archetype wires curtains (rod + 2 panels) as 'curtains' group, anchored on window wall", () => {
        // §bedroom-mirror (2026-06-11) — the BEDROOM curtain_panel was swapped for a
        // wall_mirror (reflective mirror); only the LIVING-ROOM keeps curtain panels.
        const arch = archetypeFor('living-room')!;
        const rod = arch.items.find(i => i.kind === 'curtain_rod');
        const panel = arch.items.find(i => i.kind === 'curtain_panel');
        expect(rod, 'living-room missing rod').toBeDefined();
        expect(panel, 'living-room missing panel').toBeDefined();
        expect(rod!.group).toBe('curtains');
        expect(panel!.group).toBe('curtains');
        expect(rod!.anchor).toBe('wall-window');
        expect(panel!.count).toBe(2);  // two panels per rod
    });

    it("bedroom archetype keeps the curtain_rod but its window-wall PANEL is a wall_mirror (founder swap)", () => {
        const arch = archetypeFor('bedroom')!;
        expect(arch.items.find(i => i.kind === 'curtain_rod'), 'bedroom missing rod').toBeDefined();
        // No curtain_panel in the bedroom anymore — replaced by a mirror.
        expect(arch.items.find(i => i.kind === 'curtain_panel')).toBeUndefined();
        // The swapped-in mirror lives in the 'curtains' group, count 2.
        const mirror = arch.items.find(i => i.kind === 'wall_mirror' && i.group === 'curtains');
        expect(mirror, 'bedroom missing window-wall wall_mirror').toBeDefined();
        expect(mirror!.count).toBe(2);
    });

    it('programRules.living carries curtain_rod + curtain_panel; bedroom + master carry curtain_rod + wall_mirror', () => {
        expect(ROOM_RULES.living.optionalFurniture).toContain('curtain_rod');
        expect(ROOM_RULES.living.optionalFurniture).toContain('curtain_panel');
        // §bedroom-mirror — bedroom + master swapped curtain_panel → wall_mirror.
        for (const ruleKey of ['bedroom', 'master'] as const) {
            const rule = ROOM_RULES[ruleKey];
            expect(rule.optionalFurniture).toContain('curtain_rod');
            expect(rule.optionalFurniture).toContain('wall_mirror');
            expect(rule.optionalFurniture).not.toContain('curtain_panel');
        }
    });
});
