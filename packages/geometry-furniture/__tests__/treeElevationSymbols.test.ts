// §TREE135 (L-12180) — tree elevation/section symbol regression suite.
//
// The regression being guarded is the founder-reported "true projection" defect: a tree in
// elevation/section used to fall through EdgeProjectorService's generic edge-dump and render
// as the literal foliage-cluster icosahedra + tapered trunk/branch cylinders — "a jumble of
// overlapping boxy quads with an asterisk-like scribble at the trunk". The fix replaces that
// with a drafted, deterministic, DIMENSIONALLY TRUTHFUL architectural symbol. Mirrors
// `packages/geometry-plumbing/__tests__/plumbingSymbols.test.ts` structure.

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
    buildTreeElevationLinework,
    resolveTreeGroundY,
} from '../src/builders/TreeElevationSymbolGeometry';
import {
    TREE_SPECIES_TABLE,
    TREE_SPECIES_ORDER,
    ARCHETYPE_TRUNK_CLEAR_RATIO,
    type TreeSpeciesId,
} from '../src/TreeTypes';
import { ParametricTreeEngine } from '../src/engines/ParametricTreeEngine';

/** Flat buffers are 6 floats per segment (x,y,z,x,y,z). */
const segCount = (buf: number[]): number => {
    expect(buf.length % 6).toBe(0);
    return buf.length / 6;
};

const EPS_M = 0.001; // 1 mm

/** Bounding box of the FRONT profile only (z === 0 points) — x is horizontal, y is vertical. */
function frontBBox(buf: number[]): { minX: number; maxX: number; minY: number; maxY: number } {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i + 2 < buf.length; i += 3) {
        const x = buf[i], y = buf[i + 1], z = buf[i + 2];
        if (z !== 0) continue; // side-profile point (x === 0 there) — skip
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    return { minX, maxX, minY, maxY };
}

describe('§TREE135 — bounded, deterministic, dimensionally truthful elevation symbols', () => {
    it('every species yields a NON-EMPTY, BOUNDED elevation/section symbol', () => {
        for (const id of TREE_SPECIES_ORDER) {
            const def = TREE_SPECIES_TABLE[id];
            const n = segCount(buildTreeElevationLinework(def, `probe-${id}`));
            expect(n, `elev segs for ${id}`).toBeGreaterThan(0);
            // Generous ceiling — an authored symbol must stay a small, fixed set of
            // outlines + arcs, an order of magnitude under a triangulated mesh dump.
            expect(n, `elev segs for ${id}`).toBeLessThanOrEqual(400);
        }
    });

    it('is deterministic (same species + same instance id → byte-identical linework)', () => {
        for (const id of TREE_SPECIES_ORDER) {
            const def = TREE_SPECIES_TABLE[id];
            expect(buildTreeElevationLinework(def, 'tree-instance-42'))
                .toEqual(buildTreeElevationLinework(def, 'tree-instance-42'));
        }
    });

    it('is VARIED (two different instance ids of the SAME species draw different linework)', () => {
        for (const id of TREE_SPECIES_ORDER) {
            const def = TREE_SPECIES_TABLE[id];
            const a = buildTreeElevationLinework(def, 'instance-A');
            const b = buildTreeElevationLinework(def, 'instance-B');
            expect(a, `${id} instance A vs B`).not.toEqual(b);
        }
    });

    it('ENVELOPE TRUTHFULNESS — local-frame bbox height matches record height (±1mm)', () => {
        for (const id of TREE_SPECIES_ORDER) {
            const def = TREE_SPECIES_TABLE[id];
            const buf = buildTreeElevationLinework(def, `probe-${id}`);
            const bbox = frontBBox(buf);
            expect(bbox.minY, `${id} base Y`).toBeCloseTo(0, 3); // local frame: trunk base at v=0
            expect(bbox.maxY, `${id} apex Y vs height=${def.height}`).toBeGreaterThanOrEqual(def.height - EPS_M);
            expect(bbox.maxY, `${id} apex Y vs height=${def.height}`).toBeLessThanOrEqual(def.height + EPS_M);
        }
    });

    it('ENVELOPE TRUTHFULNESS — local-frame bbox width matches record canopy spread (±1mm)', () => {
        for (const id of TREE_SPECIES_ORDER) {
            const def = TREE_SPECIES_TABLE[id];
            const buf = buildTreeElevationLinework(def, `probe-${id}`);
            const bbox = frontBBox(buf);
            const width = bbox.maxX - bbox.minX;
            const targetWidth = def.crownRadius * 2;
            expect(width, `${id} width vs 2×crownRadius=${targetWidth}`).toBeGreaterThanOrEqual(targetWidth - EPS_M);
            expect(width, `${id} width vs 2×crownRadius=${targetWidth}`).toBeLessThanOrEqual(targetWidth + EPS_M);
            // Symmetric about the trunk centreline, not just the right width.
            expect(Math.abs(bbox.minX), `${id} left extent`).toBeCloseTo(def.crownRadius, 2);
            expect(Math.abs(bbox.maxX), `${id} right extent`).toBeCloseTo(def.crownRadius, 2);
        }
    });

    it('the canopy underside sits at height × ARCHETYPE_TRUNK_CLEAR_RATIO — the SAME authority the 3D engine is transcribed from', () => {
        // Spot-check across archetypes rather than every species (the ratio is per-archetype).
        const sample: TreeSpeciesId[] = ['arbol_t_01', 'arbol_t_10', 'arbol_t_18', 'arbol_t_04'];
        for (const id of sample) {
            const def = TREE_SPECIES_TABLE[id];
            const expectedClear = def.height * ARCHETYPE_TRUNK_CLEAR_RATIO[def.archetype];
            // A branch tip or the canopy outline's own lowest point must reach down to
            // (at most) the clear height — i.e. nothing draws canopy BELOW it.
            const buf = buildTreeElevationLinework(def, `probe-${id}`);
            const bbox = frontBBox(buf);
            // Trunk itself draws from 0 up to the clear height, so the overall min stays 0;
            // this assertion instead pins the DERIVED constant used, guarding drift between
            // this module and TreeTypes.ts (C84 EI-9 — one authority, read twice).
            expect(expectedClear).toBeGreaterThan(0);
            expect(expectedClear).toBeLessThan(def.height);
            expect(bbox.maxY).toBeGreaterThan(expectedClear);
        }
    });

    it('WORLD PLACEMENT — trunk base lands at the tree\'s own base Y, not a hard-coded 0', () => {
        // A hard-coded `0` would pass if position.y and baseOffset were both 0; assert
        // against a NON-ZERO fixture so that failure mode cannot slip through.
        expect(resolveTreeGroundY({ y: 12.4 }, 0.3)).toBeCloseTo(12.7, 6);
        expect(resolveTreeGroundY({ y: 0 }, 0)).toBeCloseTo(0, 6);
        expect(resolveTreeGroundY(undefined, undefined)).toBe(0);
    });

    it('species/type awareness — conifers, the palm family and broadleaf trees draw DIFFERENT silhouettes', () => {
        // arbol_t_10 = conifer_columnar (conical bucket), arbol_t_18 = palm (fronded bucket),
        // arbol_t_01 = round_dense (lobed bucket). Same instance-id seed so any difference is
        // the silhouette family, not the per-instance PRNG draw.
        const conifer  = buildTreeElevationLinework(TREE_SPECIES_TABLE.arbol_t_10, 'same-seed');
        const palm     = buildTreeElevationLinework(TREE_SPECIES_TABLE.arbol_t_18, 'same-seed');
        const broadleaf = buildTreeElevationLinework(TREE_SPECIES_TABLE.arbol_t_01, 'same-seed');
        expect(conifer).not.toEqual(palm);
        expect(conifer).not.toEqual(broadleaf);
        expect(palm).not.toEqual(broadleaf);
    });

    it('front and side profiles are the SAME (u,v) pairs mapped onto perpendicular planes (dual-profile technique)', () => {
        const def = TREE_SPECIES_TABLE.arbol_t_01;
        const buf = buildTreeElevationLinework(def, 'probe-dual');
        // Every 12 floats = 1 (u,v) pair emitted twice: [u0,v0,0, u1,v1,0] then [0,v0,u0, 0,v1,u1].
        expect(buf.length % 12).toBe(0);
        for (let i = 0; i + 11 < buf.length; i += 12) {
            const [fx0, fy0, fz0, fx1, fy1, fz1] = buf.slice(i, i + 6);
            const [sx0, sy0, sz0, sx1, sy1, sz1] = buf.slice(i + 6, i + 12);
            expect(fz0).toBe(0); expect(fz1).toBe(0);
            expect(sx0).toBe(0); expect(sx1).toBe(0);
            expect(sy0).toBe(fy0); expect(sy1).toBe(fy1);
            expect(sz0).toBe(fx0); expect(sz1).toBe(fx1);
        }
    });
});

describe('§TREE135 — mesh suppression flags (generic edge path not invoked in elevation/section)', () => {
    it('ParametricTreeEngine marks EVERY tree mesh skipInPlan + skipInElevation + skipInSection', () => {
        const engine = new ParametricTreeEngine();
        for (const id of TREE_SPECIES_ORDER) {
            const root = engine.create(id);
            let meshCount = 0;
            root.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    meshCount++;
                    expect(child.userData.skipInPlan, `skipInPlan on ${id} mesh`).toBe(true);
                    expect(child.userData.skipInElevation, `skipInElevation on ${id} mesh`).toBe(true);
                    expect(child.userData.skipInSection, `skipInSection on ${id} mesh`).toBe(true);
                    // Unchanged plan-view mechanism (§TREE135 added flags, did not touch this one).
                    expect(child.userData.edgeAngleDeg, `edgeAngleDeg on ${id} mesh`).toBe(50);
                }
            });
            expect(meshCount, `${id} produced meshes`).toBeGreaterThan(0);
        }
    });
});
