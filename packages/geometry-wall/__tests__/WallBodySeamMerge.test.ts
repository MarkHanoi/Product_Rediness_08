/**
 * §WALL-PLAIN-SEAM-MERGE-ATTR (2026-06-11) — REGRESSION test for §57.6.
 *
 * THE DEFECT: an interior partition wall that is T-joined / mitered onto the shell
 * (so its FIRST body segment is a MiterPrismBuilder prism — `position` + `normal`
 * only, NO `uv`) AND that also carries a door/window opening (so the surrounding
 * body parts are plain `BoxGeometry` — `position` + `normal` + `uv`) used to render
 * as SEPARATE fragments, with visible division seams beside the opening. The cause:
 * `WallFragmentBuilder._mergeWallBodySegments` fed both attribute sets to
 * `mergeGeometries`, which REQUIRES a uniform attribute set; the prior guard merely
 * DETECTED the mismatch and SKIPPED the merge → the wall stayed fragmented.
 *
 * THE FIX: before merging, every segment is reduced to the common minimal attribute
 * set (`position` + `normal`) by dropping `uv` from the box segments. The wall body
 * is shaded by world position, not by a uv map, so dropping the box uv is a visual
 * no-op — and the mixed segments now merge into ONE creased mesh (no seam, no
 * fragmentation).
 *
 * These tests assert the merge PRIMITIVE the fix depends on, reproducing exactly
 * the attribute-normalisation step `_mergeWallBodySegments` now performs:
 *   (a) mixed (uv vs no-uv) segments — the regression trigger — merge into ONE
 *       geometry once normalised (NOT null / NOT skipped);
 *   (b) the merged body preserves the full vertex count (no segment dropped);
 *   (c) `toCreasedNormals` runs on the merged result without error (the seamless
 *       single-surface output).
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { mergeGeometries, toCreasedNormals } from '@pryzm/renderer-three';

/** A box body segment (the door's before/sill/header/after quad) — HAS a uv. */
function boxSegment(): THREE.BufferGeometry {
    const g = new THREE.BoxGeometry(1, 2.4, 0.1);
    g.toNonIndexed();
    expect(g.getAttribute('uv')).toBeTruthy();
    return g.index ? g.toNonIndexed() : g;
}

/**
 * A miter-prism analog: the joined-end segment MiterPrismBuilder emits — only
 * `position` + `normal`, NO `uv`. We synthesise the same attribute SHAPE here so
 * the test does not depend on the prism's exact triangulation.
 */
function miterPrismSegment(): THREE.BufferGeometry {
    const g = new THREE.BoxGeometry(1, 2.4, 0.1);
    const ni = g.index ? g.toNonIndexed() : g;
    ni.deleteAttribute('uv');             // mirror MiterPrismBuilder (position+normal only)
    expect(ni.getAttribute('uv')).toBeUndefined();
    return ni;
}

/** Reproduce the fix's normalisation: keep ONLY position + normal on every geo. */
function normaliseToPositionNormal(geos: THREE.BufferGeometry[]): void {
    for (const g of geos) {
        for (const name of Object.keys(g.attributes)) {
            if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
        }
    }
}

const sig = (g: THREE.BufferGeometry): string => Object.keys(g.attributes).sort().join(',');

describe('§WALL-PLAIN-SEAM-MERGE-ATTR — mixed-attribute body merge (§57.6 regression)', () => {
    it('the OLD guard would have skipped: mixed uv / no-uv segments differ in signature', () => {
        const box = boxSegment();
        const prism = miterPrismSegment();
        // This inequality is exactly what the old §WALL-PLAIN-SEAM-MERGE-GUARD
        // detected and used to BAIL on — leaving the wall fragmented.
        expect(sig(box)).not.toBe(sig(prism));
    });

    it('after attribute normalisation the mixed segments merge into ONE geometry', () => {
        const box = boxSegment();
        const prism = miterPrismSegment();
        const geos = [prism, box]; // partition: mitered FIRST segment + a door box

        normaliseToPositionNormal(geos);
        // All segments now share the minimal set → uniform signature.
        expect(geos.every((g) => sig(g) === sig(geos[0]))).toBe(true);
        expect(sig(geos[0])).toBe('normal,position');

        const merged = mergeGeometries(geos, false);
        // The regression was `merged === null` (skip). It must now be a real merge.
        expect(merged).not.toBeNull();

        const expectedVerts =
            prism.getAttribute('position').count + box.getAttribute('position').count;
        expect(merged!.getAttribute('position').count).toBe(expectedVerts);
    });

    it('the merged body creases without error (seamless single surface)', () => {
        const geos = [miterPrismSegment(), boxSegment(), boxSegment()];
        normaliseToPositionNormal(geos);
        const merged = mergeGeometries(geos, false);
        expect(merged).not.toBeNull();
        const creased = toCreasedNormals(merged!, THREE.MathUtils.degToRad(30));
        expect(creased.getAttribute('position').count).toBeGreaterThan(0);
        expect(creased.getAttribute('normal')).toBeTruthy();
    });
});
