/**
 * §FIX-SLAB-REGION-PREVIEW-MIRROR (L-32) — the "By Region" 3D preview mesh must
 * render where the region is, NOT mirrored through the project origin.
 *
 * Root cause it guards: the region ring is world XZ (Vector2.x=worldX,
 * Vector2.y=worldZ). SlabTool.showRegionPreview() builds a THREE.Shape in the
 * XY plane and lays it flat with `rotation.x = -π/2`, which maps the shape's
 * local +Y to world -Z. Feeding worldZ straight into the shape's Y therefore
 * NEGATES Z and mirrors the whole preview across the origin — even though the
 * commit path (createSlabFromPolygon) uses the ring as-is and lands correctly.
 * The fix pre-negates Z when building the shape (`Vector2(x, -y)`) so the -π/2
 * rotation cancels the sign and world Z is preserved.
 *
 * This test replicates the EXACT preview transform (shape build + -π/2 X
 * rotation + world-matrix bake) and asserts the resulting world-space centroid
 * equals the region centroid — not its Z-negation/mirror — for a region that is
 * OFFSET from the origin (so a sign flip is unmistakably wrong).
 *
 * THREE is imported through the P2-compliant `@pryzm/renderer-three/three`
 * facade — the same path SlabTool.ts uses — never bare 'three'.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

/**
 * Mirror of SlabTool.showRegionPreview()'s mesh construction. Given a region
 * ring in world XZ (Vector2.x=worldX, Vector2.y=worldZ) and a level elevation,
 * returns the preview mesh's vertices baked into WORLD space.
 */
function buildRegionPreviewWorldVertices(
    ring: THREE.Vector2[],
    elevation: number,
): THREE.Vector3[] {
    // §FIX-SLAB-REGION-PREVIEW-MIRROR: pre-negate Z so the -π/2 X rotation
    // (local +Y → world -Z) preserves world Z instead of mirroring it.
    const shape = new THREE.Shape(ring.map((p) => new THREE.Vector2(p.x, -p.y)));
    const geometry = new THREE.ShapeGeometry(shape);

    const mesh = new THREE.Mesh(geometry);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = elevation + 0.02;
    mesh.updateMatrixWorld(true);

    const pos = geometry.getAttribute('position');
    const out: THREE.Vector3[] = [];
    for (let i = 0; i < pos.count; i++) {
        const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
        v.applyMatrix4(mesh.matrixWorld);
        out.push(v);
    }
    return out;
}

/** Centroid of a set of points (per-axis mean, world XZ). */
function centroidXZ(pts: { x: number; y?: number; z?: number }[]): {
    x: number;
    z: number;
} {
    let sx = 0;
    let sz = 0;
    for (const p of pts) {
        sx += p.x;
        // ring Vector2 carries worldZ in .y; world Vector3 carries it in .z
        sz += (p as { z?: number }).z ?? (p as { y?: number }).y ?? 0;
    }
    return { x: sx / pts.length, z: sz / pts.length };
}

describe('§FIX-SLAB-REGION-PREVIEW-MIRROR — region → preview coordinate mapping', () => {
    // A rectangular region OFFSET from origin in +X and +Z. Centroid ≈ (12, 8).
    // If the preview negated Z, its centroid would land at z ≈ -8 (mirrored),
    // roughly 16 m away — the founder's L-32 ghost.
    const ring = [
        new THREE.Vector2(10, 6),
        new THREE.Vector2(14, 6),
        new THREE.Vector2(14, 10),
        new THREE.Vector2(10, 10),
    ];

    it('preview centroid equals the region centroid (NOT its Z-negation/mirror)', () => {
        const regionC = centroidXZ(ring); // { x: 12, z: 8 }
        const worldVerts = buildRegionPreviewWorldVertices(ring, 3);
        const previewC = centroidXZ(worldVerts);

        expect(previewC.x).toBeCloseTo(regionC.x, 6);
        expect(previewC.z).toBeCloseTo(regionC.z, 6);

        // Explicitly assert it is NOT the mirrored-through-origin position.
        expect(previewC.z).not.toBeCloseTo(-regionC.z, 3);
    });

    it('every preview vertex lands on the same world-Z side as the region (no mirror)', () => {
        const worldVerts = buildRegionPreviewWorldVertices(ring, 0);
        // All region Z are in [6,10] (strictly positive). A mirror would flip
        // them into [-10,-6]. Verify every preview vertex kept positive Z.
        for (const v of worldVerts) {
            expect(v.z).toBeGreaterThan(0);
        }
    });

    it('places the preview at the active-level elevation (Y = elevation + 0.02)', () => {
        const elevation = 5.5;
        const worldVerts = buildRegionPreviewWorldVertices(ring, elevation);
        for (const v of worldVerts) {
            expect(v.y).toBeCloseTo(elevation + 0.02, 6);
        }
    });
});
