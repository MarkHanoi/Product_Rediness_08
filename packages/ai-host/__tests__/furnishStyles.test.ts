// A.21.D19 — furnishing STYLE system tests.
// Contract (docs/03-execution/specs/SPEC-FURNISHING-STYLES.md):
//   - four canonical styles (Nordic · Mediterranean · Minimalist · Classic),
//   - each yields DISTINCT materials + colours per furniture category,
//   - legacy A.21.D4 chips resolve as aliases, defaults are sane,
//   - floorFinish extends in lock-step.

import { describe, expect, it } from 'vitest';
import {
    styleFinishFor,
    styleAccentsFor,
    normaliseStyle,
    CANONICAL_STYLES,
    type CanonicalStyle,
} from '../src/workflows/furnishLayout/styleFinish.js';
// floorFinish.ts only imports a TYPE (FloorPattern) — a relative import keeps the
// heavy command-registry barrel (THREE etc.) out of this unit test, and avoids the
// package's '.'-only exports map (which blocks subpath specifiers).
import {
    floorFinishFor,
    normaliseFloorStyle,
} from '../../command-registry/src/floors/floorFinish.js';

const STYLES = CANONICAL_STYLES;

describe('A.21.D19 — furnishing styles', () => {
    it('exposes the four canonical styles', () => {
        expect([...STYLES].sort()).toEqual(
            ['classic', 'mediterranean', 'minimalist', 'nordic'],
        );
    });

    it('each style yields a DISTINCT colour for the same category (upholstery on a sofa)', () => {
        const colours = STYLES.map((s) => styleFinishFor(s, 'sofa').color);
        expect(new Set(colours).size).toBe(STYLES.length);
    });

    it('each style yields a DISTINCT colour for case-goods (wardrobe)', () => {
        const colours = STYLES.map((s) => styleFinishFor(s, 'wardrobe').color);
        expect(new Set(colours).size).toBe(STYLES.length);
    });

    it('each style yields a DISTINCT colour for tables (dining_table)', () => {
        const colours = STYLES.map((s) => styleFinishFor(s, 'dining_table').color);
        expect(new Set(colours).size).toBe(STYLES.length);
    });

    it('category → material mapping is correct per style', () => {
        for (const s of STYLES) {
            expect(styleFinishFor(s, 'sofa').material).toBe('fabric');     // upholstery
            expect(styleFinishFor(s, 'wardrobe').material).toBe('wood');   // case-goods
        }
        // Minimalist tables are glass; the others wood.
        expect(styleFinishFor('minimalist', 'dining_table').material).toBe('glass');
        expect(styleFinishFor('nordic', 'dining_table').material).toBe('wood');
        expect(styleFinishFor('classic', 'dining_table').material).toBe('wood');
        expect(styleFinishFor('mediterranean', 'dining_table').material).toBe('wood');
    });

    it('palettes are architecturally grounded (spot checks)', () => {
        // Nordic = pale ash wood.
        expect(styleFinishFor('nordic', 'wardrobe').color).toBe('#E2D6BE');
        // Classic = deep burgundy upholstery + brass metal.
        expect(styleFinishFor('classic', 'sofa').color).toBe('#6E2230');
        expect(styleFinishFor('classic', 'bookshelf_glass').color).toBe('#5A3A22'); // dark walnut case-good
        // Mediterranean = terracotta neutral.
        expect(styleFinishFor('mediterranean', 'fridge').color).toBe('#C97B4A');
        // Minimalist = mid-grey upholstery.
        expect(styleFinishFor('minimalist', 'sofa').color).toBe('#C9C9C9');
    });

    it('every style colour is a valid 6-digit hex', () => {
        const cats = ['sofa', 'wardrobe', 'dining_table', 'fridge'];
        for (const s of STYLES) {
            for (const k of cats) {
                expect(styleFinishFor(s, k).color).toMatch(/^#[0-9A-Fa-f]{6}$/);
            }
        }
    });

    it('styleAccentsFor returns distinct floor + wall hints per style', () => {
        const floors = STYLES.map((s) => styleAccentsFor(s).floorColor);
        const walls = STYLES.map((s) => styleAccentsFor(s).wallAccent);
        expect(new Set(floors).size).toBe(STYLES.length);
        expect(new Set(walls).size).toBe(STYLES.length);
    });

    describe('back-compat aliases', () => {
        const cases: Array<[string, CanonicalStyle]> = [
            ['modern', 'minimalist'],
            ['minimal', 'minimalist'],
            ['warm', 'mediterranean'],
            ['classic', 'classic'],
            ['nordic', 'nordic'],
            ['Scandinavian', 'nordic'],
            ['Traditional', 'classic'],
            ['CONTEMPORARY', 'minimalist'],
        ];
        for (const [input, expected] of cases) {
            it(`'${input}' → ${expected}`, () => {
                expect(normaliseStyle(input)).toBe(expected);
            });
        }

        it('unknown / absent → nordic (default)', () => {
            expect(normaliseStyle('nonsense')).toBe('nordic');
            expect(normaliseStyle(undefined)).toBe('nordic');
            expect(normaliseStyle(null)).toBe('nordic');
            expect(normaliseStyle(42)).toBe('nordic');
        });

        it('aliases yield the SAME finish as their canonical target', () => {
            expect(styleFinishFor('warm', 'sofa')).toEqual(
                styleFinishFor('mediterranean', 'sofa'),
            );
            expect(styleFinishFor('modern', 'wardrobe')).toEqual(
                styleFinishFor('minimalist', 'wardrobe'),
            );
        });
    });
});

describe('A.21.D19 — floorFinish styles (command-registry, lock-step)', () => {
    const STYLES = ['nordic', 'mediterranean', 'minimalist', 'classic'] as const;

    it('timber rooms yield a distinct finish colour per style', () => {
        const cols = STYLES.map((s) => floorFinishFor('living-room', s)?.finishColor);
        expect(cols.every(Boolean)).toBe(true);
        expect(new Set(cols).size).toBe(STYLES.length);
    });

    it('wet rooms yield a distinct finish per style', () => {
        const cols = STYLES.map((s) => floorFinishFor('bathroom', s)?.finishColor);
        expect(new Set(cols).size).toBe(STYLES.length);
    });

    it('dry/service rooms yield a finish per style', () => {
        for (const s of STYLES) {
            expect(floorFinishFor('kitchen', s)).not.toBeNull();
        }
    });

    it('architecturally grounded floor spot checks', () => {
        // Classic = dark walnut herringbone in living rooms.
        expect(floorFinishFor('living-room', 'classic')?.finishPattern).toBe('plank-herringbone');
        // Minimalist kitchens = polished concrete (seamless).
        expect(floorFinishFor('kitchen', 'minimalist')?.finishPattern).toBe('seamless');
        // Mediterranean baths = terracotta.
        expect(floorFinishFor('bathroom', 'mediterranean')?.materialName).toMatch(/Terracotta/);
    });

    it('normaliseFloorStyle resolves aliases + defaults to nordic', () => {
        expect(normaliseFloorStyle('modern')).toBe('minimalist');
        expect(normaliseFloorStyle('minimal')).toBe('minimalist');
        expect(normaliseFloorStyle('warm')).toBe('mediterranean');
        expect(normaliseFloorStyle('scandinavian')).toBe('nordic');
        expect(normaliseFloorStyle('classic')).toBe('classic');
        expect(normaliseFloorStyle(undefined)).toBe('nordic');
        expect(normaliseFloorStyle('???')).toBe('nordic');
    });

    it('unmapped room type → null (engine default)', () => {
        expect(floorFinishFor('plant-room', 'nordic')).toBeNull();
        expect(floorFinishFor(undefined, 'nordic')).toBeNull();
    });
});
