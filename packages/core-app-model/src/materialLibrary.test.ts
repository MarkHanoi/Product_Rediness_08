/**
 * Guard suite for STANDARD_MATERIAL_LIBRARY — the master material data set.
 *
 * Why this file exists (LANE-Y): the library had NO test of any kind. It is
 * plain data, so the failure mode is not a crash — it is a silently malformed
 * entry that renders as black, or a duplicate id that makes `find(m => m.id
 * === …)` return the wrong material forever. Both are invisible until someone
 * looks at a swatch and says "that's wrong".
 *
 * This suite deliberately asserts INVARIANTS OF THE WHOLE ARRAY rather than
 * spot-checking named entries, so it keeps holding as the library grows.
 */
import { describe, it, expect } from 'vitest';
import { STANDARD_MATERIAL_LIBRARY } from './materialLibrary.js';

describe('STANDARD_MATERIAL_LIBRARY — master data set integrity', () => {
    it('has no duplicate ids', () => {
        const seen = new Map<string, number>();
        for (const m of STANDARD_MATERIAL_LIBRARY) {
            seen.set(m.id, (seen.get(m.id) ?? 0) + 1);
        }
        const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
        expect(dupes).toEqual([]);
    });

    it('gives every entry a non-empty id and label', () => {
        const bad = STANDARD_MATERIAL_LIBRARY
            .filter(m => !m.id?.trim() || !m.label?.trim())
            .map(m => m.id || '(blank id)');
        expect(bad).toEqual([]);
    });

    it('gives every entry a resolvable colour', () => {
        // This control was WATCHED FAILING, and the first version of it did not
        // fire. The assumption was that THREE.Color falls back to BLACK on an
        // unparseable string; it does not. `setStyle` warns and leaves the
        // instance at its constructed default, which is pure WHITE (1,1,1).
        // A planted `new THREE.Color("not-a-colour")` therefore sailed past a
        // black-only check.
        //
        // Both sentinels are asserted here. Measured: no entry is authored pure
        // black (the piano-gloss one is #050505), so black is unambiguous.
        //
        // Pure WHITE has exactly ONE genuine author — `plastic-white` really is
        // #ffffff (materialLibrary.ts:422). It is therefore indistinguishable
        // from the fallback, and is allowlisted BY ID rather than by dropping
        // the white check, which would let every real unparseable string
        // through. Adding a second id here should be treated as a smell: check
        // the entry parses before allowlisting it.
        const AUTHORED_PURE_WHITE = new Set(['plastic-white']);
        const isSentinel = (v: number) => v === 0 || v === 1;
        const suspicious = STANDARD_MATERIAL_LIBRARY
            .filter(m => {
                const c = m.params.color as { r: number; g: number; b: number } | undefined;
                if (!c) return true;
                if (AUTHORED_PURE_WHITE.has(m.id)) return false;
                return isSentinel(c.r) && c.r === c.g && c.g === c.b;
            })
            .map(m => m.id);
        expect(suspicious).toEqual([]);
    });

    it('keeps roughness and metalness inside the physical 0..1 range', () => {
        const out = STANDARD_MATERIAL_LIBRARY
            .filter(m => {
                const { roughness, metalness } = m.params;
                const bad = (v: unknown) => typeof v !== 'number' || v < 0 || v > 1;
                return bad(roughness) || bad(metalness);
            })
            .map(m => m.id);
        expect(out).toEqual([]);
    });

    it('never declares opacity < 1 without transparent:true', () => {
        // A material with opacity 0.3 and transparent unset renders fully
        // OPAQUE in three.js — the value looks authored but does nothing.
        const silent = STANDARD_MATERIAL_LIBRARY
            .filter(m => typeof m.params.opacity === 'number'
                && m.params.opacity < 1
                && m.params.transparent !== true)
            .map(m => m.id);
        expect(silent).toEqual([]);
    });
});

describe('Landscape & Ground — the founder-requested landscape data set', () => {
    const landscape = STANDARD_MATERIAL_LIBRARY.filter(m => m.category === 'Landscape & Ground');

    it('carries planting, soil and solid-path families', () => {
        // The founder asked for three things by name: soil, several grass
        // types, and solid paths. Assert each family is actually represented
        // rather than asserting a total count, which would only measure that
        // someone added rows.
        const ids = landscape.map(m => m.id);
        const grass = ids.filter(id => id.includes('grass') || id === 'landscape-moss');
        const soil = ids.filter(id => id.includes('soil') || id.includes('topsoil') || id.includes('mulch') || id.includes('compost'));
        const paths = ids.filter(id => id.startsWith('ground-') || id.includes('gravel'));

        expect(grass.length).toBeGreaterThanOrEqual(5);
        expect(soil.length).toBeGreaterThanOrEqual(4);
        expect(paths.length).toBeGreaterThanOrEqual(6);
    });

    it('ships no texture-image references, so nothing can 404 in production', () => {
        // public/items is .dockerignore'd and the GLB catalogue is served from
        // R2; an inlined local texture path would 404 in prod exactly as the
        // furniture GLBs did. These materials are procedural PBR parameters
        // ONLY — this assertion is what keeps that true.
        const withTextures = landscape.filter(m => m.textures !== undefined).map(m => m.id);
        expect(withTextures).toEqual([]);
    });

    it('authors turf darker and less saturated than reflex green', () => {
        // Guards the realism intent: a later "make the grass greener" edit that
        // pushes turf to #00ff00 should fail here rather than ship.
        const turf = landscape.filter(m => m.id.includes('grass') && !m.id.includes('dry'));
        expect(turf.length).toBeGreaterThan(0);
        for (const m of turf) {
            const c = m.params.color as { r: number; g: number; b: number };
            expect(c.g).toBeLessThan(0.65);
        }
    });
});
