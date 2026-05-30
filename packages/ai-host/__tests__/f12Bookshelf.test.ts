// F1.2 (2026-05-30) — Bookshelf + bookshelf_glass contract-complete tests
// on the ai-host side.

import { describe, expect, it } from 'vitest';
import { archetypeFor } from '../src/workflows/furnishLayout/archetypes.js';
import { footprintOf, FURNITURE_KINDS } from '../src/workflows/furnishLayout/footprints.js';
import { ROOM_RULES } from '../src/workflows/apartmentLayout/rules/programRules.js';

describe('F1.2 — bookshelf + bookshelf_glass on the ai-host side', () => {
    it('FurnitureKind union admits bookshelf + bookshelf_glass', () => {
        expect(FURNITURE_KINDS).toContain('bookshelf');
        expect(FURNITURE_KINDS).toContain('bookshelf_glass');
    });

    it('footprints.ts has tall narrow entries (storage profile)', () => {
        for (const k of ['bookshelf', 'bookshelf_glass'] as const) {
            const f = footprintOf(k);
            expect(f.w).toBeGreaterThan(0.5);    // ≥ 0.5 m wide
            expect(f.w).toBeLessThanOrEqual(1.0);
            expect(f.l).toBeLessThanOrEqual(0.5); // shallow shelf depth
            expect(f.h).toBeGreaterThan(1.5);     // tall storage piece
            expect(f.h).toBeLessThanOrEqual(2.2);
            expect(f.clearFront).toBeGreaterThanOrEqual(0.5); // step-back to read
        }
    });

    it('private-office archetype lists open bookshelf (study companion)', () => {
        const arch = archetypeFor('private-office')!;
        const item = arch.items.find(i => i.kind === 'bookshelf');
        expect(item).toBeDefined();
        expect(item!.anchor).toBe('wall-longest');
        expect(item!.excludeWindowWall).toBe(true);
    });

    it('living-room archetype lists glass-front bookshelf (living-room storage)', () => {
        const arch = archetypeFor('living-room')!;
        const item = arch.items.find(i => i.kind === 'bookshelf_glass');
        expect(item).toBeDefined();
        expect(item!.anchor).toBe('wall-longest');
        expect(item!.excludeWindowWall).toBe(true);
    });

    it('programRules.study.optionalFurniture includes bookshelf + furnitureSpec entry', () => {
        const study = ROOM_RULES.study;
        expect(study.optionalFurniture).toContain('bookshelf');
        const spec = study.furnitureSpec.find(s => s.kind === 'bookshelf');
        expect(spec).toBeDefined();
        expect(spec!.placementRule).toBe('longest_wall');
        expect(spec!.excludeWindowWall).toBe(true);
    });

    it('programRules.living.optionalFurniture includes bookshelf_glass + furnitureSpec entry', () => {
        const living = ROOM_RULES.living;
        expect(living.optionalFurniture).toContain('bookshelf_glass');
        const spec = living.furnitureSpec.find(s => s.kind === 'bookshelf_glass');
        expect(spec).toBeDefined();
        expect(spec!.placementRule).toBe('longest_wall');
        expect(spec!.excludeWindowWall).toBe(true);
    });
});
