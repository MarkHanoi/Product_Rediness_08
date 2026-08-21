// §MATERIAL-MAPS-AND-TILING (L-1700) — the L0 half of C100's texture facet.
//
// What these tests establish, and deliberately no more:
//  1. the facet is ADDITIVE — every existing catalogue row still parses and none
//     of them acquire maps by accident;
//  2. the pair invariant (`maps` implies a usable `tiling`) is REAL, not a comment;
//  3. `materialMapsDefect` distinguishes "no maps" from "broken maps", which is
//     C100 §5's rule applied to the validator itself.
//
// ⛔ These prove NOTHING about rendering. The mesh-level proof lives in
// `packages/core-app-model/__tests__/materialTextureProjection.test.ts`.

import { describe, it, expect } from 'vitest';
import {
    MATERIAL_CATALOG,
    MATERIAL_MAP_CHANNELS,
    SRGB_MAP_CHANNELS,
    hasAnyMap,
    isUsableTiling,
    materialMapsDefect,
    type MaterialMaps,
    type MaterialTiling,
} from '../src/materials/index.js';

describe('§MATERIAL-MAPS-AND-TILING — the facet is additive', () => {
    it('every existing catalogue row is still well-formed on this axis', () => {
        const defects = MATERIAL_CATALOG.map((r) => materialMapsDefect(r)).filter(
            (d): d is string => d !== null,
        );
        expect(defects).toEqual([]);
    });

    it('the catalogue has at least the rows it had before the facet landed', () => {
        // Not a transcribed count (C100 §10.1) — a floor, so a lane that DELETES
        // rows while adding maps is caught, and a lane that adds rows is not.
        expect(MATERIAL_CATALOG.length).toBeGreaterThanOrEqual(205);
    });

    it('ids stay unique', () => {
        expect(new Set(MATERIAL_CATALOG.map((r) => r.id)).size).toBe(MATERIAL_CATALOG.length);
    });
});

describe('hasAnyMap — emptiness is not a map', () => {
    it('undefined and {} both read as "no maps"', () => {
        expect(hasAnyMap(undefined)).toBe(false);
        expect(hasAnyMap({})).toBe(false);
    });

    it('an empty-string channel is not a map', () => {
        expect(hasAnyMap({ color: '' })).toBe(false);
    });

    it.each(MATERIAL_MAP_CHANNELS)('a single %s channel counts', (channel) => {
        const maps = { [channel]: '/textures/x/y.ktx2' } as MaterialMaps;
        expect(hasAnyMap(maps)).toBe(true);
    });
});

describe('isUsableTiling — a scale that cannot divide is not a scale', () => {
    const bad: Array<[string, MaterialTiling | undefined]> = [
        ['absent', undefined],
        ['zero width', { realWorldSizeM: [0, 0.6] }],
        ['zero height', { realWorldSizeM: [0.6, 0] }],
        ['negative', { realWorldSizeM: [-0.6, 0.6] }],
        ['NaN', { realWorldSizeM: [Number.NaN, 0.6] }],
        ['Infinity', { realWorldSizeM: [Number.POSITIVE_INFINITY, 0.6] }],
    ];
    it.each(bad)('rejects %s', (_label, t) => {
        expect(isUsableTiling(t)).toBe(false);
    });

    it('accepts a 600 mm tile', () => {
        expect(isUsableTiling({ realWorldSizeM: [0.6, 0.6] })).toBe(true);
    });

    it('rotation is optional and does not affect usability', () => {
        expect(isUsableTiling({ realWorldSizeM: [1.2, 1.2], rotationDeg: 45 })).toBe(true);
    });
});

describe('materialMapsDefect — maps without a scale is THE defect', () => {
    it('a record with no maps and no tiling is clean', () => {
        expect(materialMapsDefect({ id: 'paint-matte-white' })).toBeNull();
    });

    it('a record with maps and NO tiling is a named defect', () => {
        const d = materialMapsDefect({
            id: 'oak-parquet-herringbone',
            maps: { color: '/textures/wood/oak-parquet/color.ktx2' },
        });
        expect(d).toContain('oak-parquet-herringbone');
        expect(d).toContain('tiling');
    });

    it('a record with maps and an UNUSABLE tiling is a named defect', () => {
        const d = materialMapsDefect({
            id: 'tile-600',
            maps: { color: '/textures/tile/color.ktx2' },
            tiling: { realWorldSizeM: [0, 0.6] },
        });
        expect(d).toContain('tile-600');
        expect(d).toContain('realWorldSizeM');
    });

    it('a record with maps AND a usable tiling is clean', () => {
        expect(
            materialMapsDefect({
                id: 'tile-600',
                maps: { color: '/textures/tile/color.ktx2', normal: '/textures/tile/normal.ktx2' },
                tiling: { realWorldSizeM: [0.6, 0.6] },
            }),
        ).toBeNull();
    });

    it('⭐ failure and emptiness are DIFFERENT values (C84 EI-1b)', () => {
        const empty = materialMapsDefect({ id: 'a' });
        const broken = materialMapsDefect({ id: 'a', maps: { color: '/t/c.ktx2' } });
        expect(empty).toBeNull();
        expect(broken).toEqual(expect.any(String));
        expect(empty).not.toEqual(broken);
    });
});

describe('colour-space classification is authored ONCE, at L0', () => {
    it('only `color` is sRGB; every other channel is linear data', () => {
        expect([...SRGB_MAP_CHANNELS]).toEqual(['color']);
        const linear = MATERIAL_MAP_CHANNELS.filter((c) => !SRGB_MAP_CHANNELS.includes(c));
        expect(linear).toEqual(['normal', 'roughness', 'metalness', 'ao', 'displacement']);
    });
});
