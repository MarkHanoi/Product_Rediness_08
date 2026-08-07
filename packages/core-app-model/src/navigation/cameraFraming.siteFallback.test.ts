/**
 * §CAM-FRAME-SITE-WHEN-NO-MODEL (L-748) — framing precedence: MODEL → SITE → constant.
 *
 * FOUNDER (2026-08-07, live 75fc111d): *"THE 3D VIEW STILL IS NOT DOING THE CORRECT ZOOM
 * AT START UP (WHICH BEFORE WAS WORKING). I NEED TO CLICK HOME — THEN I HAVE THE 3D
 * BOUNDARY CORRECT."*
 *
 * Their log, with every guard behaving exactly as designed:
 *
 *   restoreSlot("perspective") → MISS
 *   ViewCameraStateStore.restore("3D") → MISS (0 states cached, keys: [])
 *   computing default framing → §CAM-BIM-SCALE-BOUNDS REJECT → setLookAt(target=0,0,0, dist=50.0)
 *   …later: zoomToFit — no BIM-scale geometry to frame; camera unchanged.
 *
 * ⚠ THE INTERESTING PART: nothing here is malfunctioning. Both caches legitimately miss on
 * a fresh project. The bounds are legitimately rejected (globe-scale contamination, L-744).
 * `zoomToFit` legitimately refuses, because the user has committed a 246 m² parcel boundary
 * but drawn no walls. Correct components, wrong COMPOSITION: the precedence was
 * `model → constant`, so with no model the camera landed on a hard-coded 50 m about the
 * ORIGIN — and the parcel centroid sits ~12.9 m away, so the site is not what you see.
 *
 * A committed boundary IS the site (ADR-0300 ranks it as the best evidence of extent), so
 * the precedence needs a SITE rung between the two.
 *
 * ## Two things these tests deliberately pin as NOT the answer
 *
 * 1. **Home is not the authority.** `captureDefaultView()` only snapshots the live camera
 *    ~1.2 s after project load. It knows nothing about the site; it framed correctly here
 *    because an earlier flow left a good pose behind, and in another session the same line
 *    captured an ECEF pose (L-746). Home working tells us a correct framing EXISTED, not
 *    where to obtain one.
 * 2. **`resolveSiteFramingExtent` is not the source either.** It is the shared authority
 *    for the GEO extent (WGS84 degrees + camera altitude) that the 2D MapLibre and 3D
 *    Cesium panes frame from — the right authority for those, the wrong coordinate space
 *    for this camera. The parcel ring is already in scene-XZ metres, the same frame as
 *    walls. One authority per COORDINATE SPACE, not one authority for every camera.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { boundsFromSiteRing, computeFitPose, type GroundPointXZ } from './cameraFraming.js';

/**
 * The founder's parcel: 246 m², 13 vertices, centroid ~12.9 m from the origin.
 * Approximated as a 13-gon of the right area at the right offset.
 */
function foundersParcelRing(): GroundPointXZ[] {
    const cx = 9.1, cz = 9.1;              // centroid ≈ 12.9 m from origin
    const r = Math.sqrt(246 / Math.PI);    // ≈ 8.85 m — a 246 m² lot
    return Array.from({ length: 13 }, (_, i) => {
        const a = (i / 13) * Math.PI * 2;
        return { x: cx + r * Math.cos(a), z: cz + r * Math.sin(a) };
    });
}

describe('boundsFromSiteRing — a committed boundary IS the site', () => {
    it("frames the founder's parcel where it actually is, not at the origin", () => {
        const box = boundsFromSiteRing(foundersParcelRing())!;
        expect(box).not.toBeNull();

        const centre = box.getCenter(new THREE.Vector3());
        // TOOTH: the old precedence targeted (0,0,0). The parcel centroid is ~12.9 m away —
        // on a small city lot that is the difference between seeing your plot and seeing
        // the ground beside it.
        expect(Math.hypot(centre.x, centre.z)).toBeGreaterThan(10);
        expect(Math.hypot(centre.x, centre.z)).toBeLessThan(16);
    });

    it('produces a site-scale fit, not the 50 m constant', () => {
        const pose = computeFitPose(boundsFromSiteRing(foundersParcelRing())!, {
            fovDeg: 60, aspect: 1.6,
        })!;
        expect(pose.distance).toBeGreaterThan(5);
        expect(pose.distance).toBeLessThan(120);
        // The camera looks at the PARCEL, not the origin.
        expect(Math.hypot(pose.target.x, pose.target.z)).toBeGreaterThan(10);
    });

    it('the ring is in the SAME frame as walls, so no geodesy is involved', () => {
        // Parcel.boundary.polygon is Pt{x,z} in scene-XZ metres (C12 LTP-ENU) — the very
        // same space walls occupy. A degrees→metres round trip through the geo extent
        // would be a lossy detour to a number we already hold exactly.
        const ring: GroundPointXZ[] = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 8 }, { x: 0, z: 8 }];
        const box = boundsFromSiteRing(ring)!;
        expect(box.min.x).toBe(0);
        expect(box.max.x).toBe(10);
        expect(box.min.z).toBe(0);
        expect(box.max.z).toBe(8);
        expect(box.min.y).toBe(0);   // no invented height
        expect(box.max.y).toBe(0);
    });
});

describe('boundsFromSiteRing — refuses rather than invents', () => {
    it('returns null for no ring, so the caller keeps its honest constant', () => {
        expect(boundsFromSiteRing(null)).toBeNull();
        expect(boundsFromSiteRing(undefined)).toBeNull();
        expect(boundsFromSiteRing([])).toBeNull();
    });

    it('returns null for a degenerate ring (fewer than 3 vertices)', () => {
        expect(boundsFromSiteRing([{ x: 0, z: 0 }, { x: 5, z: 5 }])).toBeNull();
    });

    it('returns null for non-finite vertices', () => {
        expect(boundsFromSiteRing([{ x: 0, z: 0 }, { x: NaN, z: 1 }, { x: 2, z: 2 }])).toBeNull();
    });

    it('returns null for a globe-scale ring — a site is site-scale or it is not a site', () => {
        // Defence in depth: the ring reaches us from a store, and an ECEF-contaminated
        // parcel must not become the thing we frame.
        const ring: GroundPointXZ[] = [
            { x: -2465677, z: -12121197 },
            { x: 2465677, z: 12121197 },
            { x: 0, z: 12121197 },
        ];
        expect(boundsFromSiteRing(ring)).toBeNull();
    });

    it('an EMPTY project (no model, no site) must stay on the constant', () => {
        // Explicitly pinned: we must NOT frame an empty scene as though it were authored.
        // Null here is what makes the caller fall through to its 50 m default.
        expect(boundsFromSiteRing([])).toBeNull();
    });
});
