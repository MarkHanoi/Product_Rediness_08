// F1.5 (2026-05-30) — Bathroom vanity primitives contract-complete tests
// (furniture-side; mirror_light queued separately in geometry-lighting).

import { describe, expect, it } from 'vitest';
import { archetypeFor } from '../src/workflows/furnishLayout/archetypes.js';
import { footprintOf, FURNITURE_KINDS } from '../src/workflows/furnishLayout/footprints.js';
import { ROOM_RULES } from '../src/workflows/apartmentLayout/rules/programRules.js';

const NEW_KINDS = ['vanity_unit', 'bathroom_mirror', 'towel_rail'] as const;

describe('F1.5 — bathroom vanity (S4) on the ai-host side', () => {
    it('FurnitureKind union admits vanity_unit + bathroom_mirror + towel_rail', () => {
        for (const k of NEW_KINDS) expect(FURNITURE_KINDS).toContain(k);
    });

    it('vanity_unit footprint is a floor cabinet', () => {
        const v = footprintOf('vanity_unit');
        expect(v.baseOffset).toBe(0);
        expect(v.w).toBeGreaterThan(0.7);
        expect(v.w).toBeLessThanOrEqual(1.4);
        expect(v.h).toBeGreaterThan(0.7);     // standard vanity height range
        expect(v.h).toBeLessThanOrEqual(0.95);
    });

    it('bathroom_mirror is wall-mounted above vanity height (baseOffset ≈ 1.10 m)', () => {
        const m = footprintOf('bathroom_mirror');
        expect(m.baseOffset).toBeGreaterThan(1.0);
        expect(m.l).toBeLessThan(0.1);        // thin panel
    });

    it('towel_rail is wall-mounted at mid-height (baseOffset ≈ 0.4 m)', () => {
        const t = footprintOf('towel_rail');
        expect(t.baseOffset).toBeGreaterThan(0.2);
        expect(t.baseOffset).toBeLessThan(0.6);
        expect(t.h).toBeGreaterThan(0.6);     // tall enough for a folded towel
    });

    it('bathroom archetype wires vanity_unit + bathroom_mirror as paired group', () => {
        const arch = archetypeFor('bathroom')!;
        const v = arch.items.find(i => i.kind === 'vanity_unit');
        const m = arch.items.find(i => i.kind === 'bathroom_mirror');
        expect(v).toBeDefined();
        expect(m).toBeDefined();
        expect(v!.group).toBe('vanity');
        expect(m!.group).toBe('vanity');
        expect(v!.anchor).toBe('wall-opposite-door');
        expect(m!.anchor).toBe('beside');
    });

    it('programRules.bathroom carries all three vanity items', () => {
        const bath = ROOM_RULES.bathroom;
        for (const k of NEW_KINDS) {
            expect(bath.optionalFurniture).toContain(k);
            const spec = bath.furnitureSpec.find(s => s.kind === k);
            expect(spec, `bathroom spec for ${k} missing`).toBeDefined();
        }
    });
});
