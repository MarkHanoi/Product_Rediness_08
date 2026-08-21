/**
 * §CATCHER-CANNOT-WASH-THE-VIEWPORT (L-1940) — the catcher's LIVE footprint.
 *
 * WHY THIS SUITE EXISTS. `THREE.ShadowMaterial` on three r183's node renderer (both
 * the 'webgpu' and the 'webgl-fallback' backend) composites as
 * `alpha = opacity x (1 - shadowMask)` (`ShadowMaskModel.finish()`), and the mask is a
 * depth-texture compare. Every way that compare can fail — an unwritten map, a map
 * allocated by a rival renderer, a mismatched compare function — yields 0, which is
 * bit-identical to "fully shadowed". A 4 km plane renders that failure as a
 * viewport-wide 32 % black wash over a background stack that measures pure white.
 *
 * This suite does NOT assert which failure fires (nothing here can run a GPU). It pins
 * the CONTAINMENT: the painted surface follows the casters and can only ever shrink
 * from the constructed size, so the worst case is bounded to the ground the model
 * stands on instead of the whole viewport.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '../src/three-re-export';
import { GroundShadowCatcher } from '../src/GroundShadowCatcher';

describe('GroundShadowCatcher §CATCHER-CANNOT-WASH-THE-VIEWPORT (L-1940)', () => {
    let catcher: GroundShadowCatcher;

    beforeEach(() => {
        catcher = new GroundShadowCatcher();
    });

    it('starts at the constructed 4 km footprint, centred on the origin', () => {
        const fp = catcher.footprint;
        expect(fp.baseSize).toBe(4000);
        expect(fp.size).toBe(4000);
        expect(fp.centreX).toBe(0);
        expect(fp.centreZ).toBe(0);
        expect(catcher.mesh.scale.x).toBeCloseTo(1, 6);
        expect(catcher.mesh.scale.z).toBeCloseTo(1, 6);
    });

    it('setFootprint moves AND shrinks the plane — position and scale both follow', () => {
        catcher.setFootprint(120, -45, 80);

        const fp = catcher.footprint;
        expect(fp.centreX).toBe(120);
        expect(fp.centreZ).toBe(-45);
        expect(fp.size).toBe(80);

        // The mesh is a scaled instance of the constructed plane — never a rebuild.
        expect(catcher.mesh.scale.x).toBeCloseTo(80 / 4000, 9);
        expect(catcher.mesh.scale.z).toBeCloseTo(80 / 4000, 9);
        expect(catcher.mesh.scale.y).toBe(1);
        expect(catcher.mesh.position.x).toBe(120);
        expect(catcher.mesh.position.z).toBe(-45);
    });

    it('the effective world extent shrinks by 50x — the painted surface really is bounded', () => {
        // The measurement that matters: transform the plane's own corner by the live
        // matrix. Asserting `scale` alone would pass even if the geometry were 4 km.
        const corner = new THREE.Vector3(2000, 0, 2000); // local corner of the base plane
        catcher.setFootprint(0, 0, 80);
        catcher.mesh.updateMatrix();
        corner.applyMatrix4(catcher.mesh.matrix);
        expect(Math.abs(corner.x)).toBeCloseTo(40, 6);
        expect(Math.abs(corner.z)).toBeCloseTo(40, 6);
    });

    it('SHRINK-ONLY — a size larger than the constructed plane is clamped, never grown', () => {
        catcher.setFootprint(0, 0, 999_999);
        expect(catcher.footprint.size).toBe(4000);
        expect(catcher.mesh.scale.x).toBeCloseTo(1, 9);
    });

    it('rejects non-finite input rather than seating the plane at NaN', () => {
        catcher.setFootprint(10, 10, 50);
        catcher.setFootprint(Number.NaN, 0, 50);
        catcher.setFootprint(0, 0, Number.POSITIVE_INFINITY);
        const fp = catcher.footprint;
        expect(fp.centreX).toBe(10);
        expect(fp.centreZ).toBe(10);
        expect(fp.size).toBe(50);
        expect(Number.isFinite(catcher.mesh.position.x)).toBe(true);
    });

    it('setElevation keeps the XZ footprint (it used to hard-reset the plane to the origin)', () => {
        catcher.setFootprint(30, -30, 64);
        catcher.setElevation(12);

        expect(catcher.mesh.position.x).toBe(30);
        expect(catcher.mesh.position.z).toBe(-30);
        // Still seated a hair BELOW the datum so a real slab wins the depth test.
        expect(catcher.mesh.position.y).toBeCloseTo(12 - 0.01, 9);
        expect(catcher.footprint.size).toBe(64);
    });

    it('is a pure transform write — no geometry rebuild, matrixAutoUpdate stays off', () => {
        const geometryBefore = catcher.mesh.geometry;
        const materialBefore = catcher.mesh.material;
        catcher.setFootprint(5, 5, 30);
        catcher.setElevation(3);
        expect(catcher.mesh.geometry).toBe(geometryBefore);
        expect(catcher.mesh.material).toBe(materialBefore);
        expect(catcher.mesh.matrixAutoUpdate).toBe(false);
    });
});
