// F1.3 (2026-05-30) — tv + tv_unit (media wall) contract-complete tests
// on the ai-host side.

import { describe, expect, it } from 'vitest';
import { archetypeFor } from '../src/workflows/furnishLayout/archetypes.js';
import { footprintOf, FURNITURE_KINDS } from '../src/workflows/furnishLayout/footprints.js';
import { ROOM_RULES } from '../src/workflows/apartmentLayout/rules/programRules.js';

describe('F1.3 — tv + tv_unit (S1 media wall) on the ai-host side', () => {
    it('FurnitureKind union admits tv + tv_unit', () => {
        expect(FURNITURE_KINDS).toContain('tv');
        expect(FURNITURE_KINDS).toContain('tv_unit');
    });

    it('tv footprint is wall-mounted (baseOffset > 1.0 m, thin depth)', () => {
        const tv = footprintOf('tv');
        expect(tv.baseOffset).toBeGreaterThan(1.0);
        expect(tv.l).toBeLessThan(0.15);             // thin panel
        expect(tv.w).toBeGreaterThan(1.0);
        expect(tv.h).toBeGreaterThan(0.5);
        expect(tv.h).toBeLessThan(1.0);
    });

    it('tv_unit footprint is low + wide + on the floor', () => {
        const u = footprintOf('tv_unit');
        expect(u.baseOffset).toBe(0);
        expect(u.w).toBeGreaterThan(1.2);            // wide cabinet
        expect(u.h).toBeLessThan(0.7);               // low (≈ 0.5 m)
        expect(u.clearFront).toBeGreaterThanOrEqual(0.5);
    });

    it('living-room archetype wires tv + tv_unit as a media group, opposite the door', () => {
        const arch = archetypeFor('living-room')!;
        const unit = arch.items.find(i => i.kind === 'tv_unit');
        const tv = arch.items.find(i => i.kind === 'tv');
        expect(unit).toBeDefined();
        expect(tv).toBeDefined();
        expect(unit!.group).toBe('media');
        expect(tv!.group).toBe('media');
        expect(unit!.anchor).toBe('wall-opposite-door');
        expect(unit!.excludeWindowWall).toBe(true);
        // The tv yields to the unit's wall by `anchor: 'beside'` + same group.
        expect(tv!.anchor).toBe('beside');
    });

    it('programRules.living lists tv + tv_unit + furnitureSpec carries the media-wall pair', () => {
        const living = ROOM_RULES.living;
        expect(living.optionalFurniture).toContain('tv');
        expect(living.optionalFurniture).toContain('tv_unit');
        const unitSpec = living.furnitureSpec.find(s => s.kind === 'tv_unit');
        const tvSpec = living.furnitureSpec.find(s => s.kind === 'tv');
        expect(unitSpec).toBeDefined();
        expect(tvSpec).toBeDefined();
        expect(unitSpec!.group).toBe('media');
        expect(tvSpec!.group).toBe('media');
        expect(unitSpec!.placementRule).toBe('opposite_door');
        expect(unitSpec!.excludeWindowWall).toBe(true);
    });
});
