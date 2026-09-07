// §SITE-SCOPE (L-645; C12 §13; ADR-0382) — the scope VALUE: resolution, shape conversion, the
// polygon in three frames, and the ONE-POLYGON containment rule.
//
// What these pin, in the order the render needs them: a stored scope resolves totally (never
// "no scope"); a clamp keeps a rectangle's aspect; a shape toggle never loses what was inside; the
// circle's n-gon honours its sagitta bound at every radius; the polygon is positively wound and
// lands in the true frame and in WGS84 through the ONE projection; and the containment predicate
// answers with the POLYGON, so a point the exact circle would accept but the n-gon would not is
// OUTSIDE — the same answer the globe clip, the geometric clip and the instance filter all give.

import { describe, it, expect } from 'vitest';
import { latLonToSceneXZ } from '../../site/boundaryProjection';
import {
    SCOPE_CIRCLE_MAX_SAGITTA_M,
    SCOPE_CIRCLE_MAX_SEGMENTS,
    SCOPE_CIRCLE_MIN_SEGMENTS,
    clampSiteScope,
    convertScopeShape,
    createScopeContainment,
    metresToDegLat,
    metresToDegLon,
    minimumScopeContainingRing,
    resolveSiteScope,
    scopeAreaM2,
    scopeBboxLatLon,
    scopeContainsRingXZ,
    scopeFetchHalfDeg,
    scopeInnerRadiusM,
    scopeOuterRadiusM,
    scopePolygonLatLon,
    scopePolygonSegments,
    scopePolygonTrueXZ,
    scopePolygonXZ,
    SITE_SCOPE_SLAB_DEPTH_MAX_M,
    SITE_SCOPE_SLAB_DEPTH_MIN_M,
    siteScopeSlabDepthM,
    type SiteScope,
    type SiteScopeRange,
} from '../siteScope';

/** The extent lane's measured product range (`contextExtentBudget.ts`), passed in, not imported. */
const RANGE: SiteScopeRange = { minRadiusM: 150, maxRadiusM: 1781, fallback: { shape: 'circle', radiusM: 1781 } };
/** Barcelona — the founder's test city; cos(41.39°) = 0.750, which is what makes the lon/lat
 *  arithmetic below non-trivial. */
const BCN = { lat: 41.39, lon: 2.17 };

const signedAreaXZ = (ring: ReadonlyArray<{ x: number; z: number }>): number => {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!, q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return a / 2;
};

describe('resolveSiteScope — total, never "no scope"', () => {
    it('null → the range fallback, source default', () => {
        const r = resolveSiteScope(null, RANGE);
        expect(r.source).toBe('default');
        expect(r.scope).toEqual({ shape: 'circle', radiusM: 1781 });
    });

    it('an authored value inside the range is used verbatim (same reference)', () => {
        const stored: SiteScope = { shape: 'rectangle', halfWidthM: 700, halfDepthM: 500 };
        const r = resolveSiteScope(stored, RANGE);
        expect(r.source).toBe('authored');
        expect(r.scope).toBe(stored);
    });

    it('a value past the ceiling is CLAMPED onto it — a rectangle keeps its aspect — and says so', () => {
        const r = resolveSiteScope({ shape: 'rectangle', halfWidthM: 3000, halfDepthM: 1500 }, RANGE);
        expect(r.source).toBe('clamped');
        expect(r.clampedFromRadiusM).toBeCloseTo(Math.hypot(3000, 1500), 6);
        expect(scopeOuterRadiusM(r.scope)).toBeCloseTo(1781, 6);
        if (r.scope.shape !== 'rectangle') throw new Error('shape changed');
        expect(r.scope.halfWidthM / r.scope.halfDepthM).toBeCloseTo(2, 9);
        expect(r.note).toMatch(/clamped to 1781 m/);
    });

    it('a value below the floor is lifted onto it', () => {
        const r = resolveSiteScope({ shape: 'circle', radiusM: 20 }, RANGE);
        expect(r.source).toBe('clamped');
        expect(r.scope).toEqual({ shape: 'circle', radiusM: 150 });
    });

    it('a stale runtime object that is not a scope falls back with a note, never throws', () => {
        const r = resolveSiteScope({ shape: 'circle', radiusM: NaN } as unknown as SiteScope, RANGE);
        expect(r.source).toBe('invalid');
        expect(r.scope).toEqual(RANGE.fallback);
        expect(r.note).toMatch(/did not parse/);
    });

    it('the fallback itself is clamped, so a mis-set range cannot leak an out-of-range default', () => {
        const r = resolveSiteScope(null, { ...RANGE, fallback: { shape: 'circle', radiusM: 9000 } });
        expect(r.scope).toEqual({ shape: 'circle', radiusM: 1781 });
    });

    it('clampSiteScope returns the same reference when nothing changes', () => {
        const s: SiteScope = { shape: 'circle', radiusM: 900 };
        expect(clampSiteScope(s, RANGE)).toBe(s);
    });
});

describe('radii, area, shape conversion', () => {
    it('outer / inner / area for both shapes', () => {
        expect(scopeOuterRadiusM({ shape: 'circle', radiusM: 900 })).toBe(900);
        expect(scopeInnerRadiusM({ shape: 'circle', radiusM: 900 })).toBe(900);
        expect(scopeAreaM2({ shape: 'circle', radiusM: 900 })).toBeCloseTo(Math.PI * 810_000, 6);
        const rect: SiteScope = { shape: 'rectangle', halfWidthM: 600, halfDepthM: 450 };
        expect(scopeOuterRadiusM(rect)).toBe(750);
        expect(scopeInnerRadiusM(rect)).toBe(450);
        expect(scopeAreaM2(rect)).toBe(4 * 600 * 450);
    });

    it('convertScopeShape never loses what was inside (both directions), same ref when unchanged', () => {
        const circle: SiteScope = { shape: 'circle', radiusM: 900 };
        const rect = convertScopeShape(circle, 'rectangle');
        expect(rect).toEqual({ shape: 'rectangle', halfWidthM: 900, halfDepthM: 900 });
        // Every vertex of the disc's polygon is inside the square.
        const inRect = createScopeContainment(rect, 0, { frame: 'project' });
        for (const p of scopePolygonXZ(circle)) expect(inRect.contains(p.x, p.z)).toBe(true);

        const wide: SiteScope = { shape: 'rectangle', halfWidthM: 700, halfDepthM: 300 };
        const disc = convertScopeShape(wide, 'circle');
        // Half-diagonal / cos(π/n): the bare half-diagonal would put the corners ON the circle and
        // therefore OUTSIDE the inscribed n-gon the scope actually is (the one-polygon rule).
        if (disc.shape !== 'circle') throw new Error('shape');
        expect(disc.radiusM).toBeGreaterThan(Math.hypot(700, 300));
        expect(disc.radiusM).toBeLessThan(Math.hypot(700, 300) * 1.001);
        const inDisc = createScopeContainment(disc, 0, { frame: 'project' });
        for (const p of scopePolygonXZ(wide)) expect(inDisc.contains(p.x, p.z)).toBe(true);
        const bare = createScopeContainment({ shape: 'circle', radiusM: Math.hypot(700, 300) }, 0, { frame: 'project' });
        expect(scopePolygonXZ(wide).some((p) => !bare.contains(p.x, p.z))).toBe(true);

        expect(convertScopeShape(circle, 'circle')).toBe(circle);
    });
});

describe('scopePolygonSegments — the sagitta bound decides n, not taste', () => {
    it.each([150, 900, 1781, 5000, 10_000])('r = %s m: sagitta ≤ 0.25 m, multiple of 4, within [32, 256]', (r) => {
        const n = scopePolygonSegments({ shape: 'circle', radiusM: r });
        expect(n % 4).toBe(0);
        expect(n).toBeGreaterThanOrEqual(SCOPE_CIRCLE_MIN_SEGMENTS);
        expect(n).toBeLessThanOrEqual(SCOPE_CIRCLE_MAX_SEGMENTS);
        const sagitta = r * (1 - Math.cos(Math.PI / n));
        // The clamp at 256 is allowed to exceed the bound only past the radius where 256 stops sufficing.
        if (n < SCOPE_CIRCLE_MAX_SEGMENTS) expect(sagitta).toBeLessThanOrEqual(SCOPE_CIRCLE_MAX_SAGITTA_M + 1e-9);
    });

    it('a rectangle has 4', () => {
        expect(scopePolygonSegments({ shape: 'rectangle', halfWidthM: 1, halfDepthM: 1 })).toBe(4);
    });

    it('n grows with r (a 1781 m disc is rounder than a 150 m one)', () => {
        expect(scopePolygonSegments({ shape: 'circle', radiusM: 1781 }))
            .toBeGreaterThan(scopePolygonSegments({ shape: 'circle', radiusM: 150 }));
    });
});

describe('scopePolygonXZ — project frame, open, positively wound', () => {
    it('circle: n vertices on the circle, vertex 0 on +X, positive signed area', () => {
        const s: SiteScope = { shape: 'circle', radiusM: 900 };
        const ring = scopePolygonXZ(s);
        expect(ring.length).toBe(scopePolygonSegments(s));
        expect(ring[0]).toEqual({ x: 900, z: 0 });
        for (const p of ring) expect(Math.hypot(p.x, p.z)).toBeCloseTo(900, 9);
        expect(signedAreaXZ(ring)).toBeGreaterThan(0);
        // The n-gon's area approaches the disc's from below.
        expect(signedAreaXZ(ring)).toBeLessThan(Math.PI * 900 * 900);
        expect(signedAreaXZ(ring) / (Math.PI * 900 * 900)).toBeGreaterThan(0.999);
    });

    it('rectangle: the four corners, positive signed area', () => {
        const ring = scopePolygonXZ({ shape: 'rectangle', halfWidthM: 600, halfDepthM: 450 });
        expect(ring).toEqual([{ x: -600, z: -450 }, { x: 600, z: -450 }, { x: 600, z: 450 }, { x: -600, z: 450 }]);
        expect(signedAreaXZ(ring)).toBe(4 * 600 * 450);
    });
});

describe('scopePolygonTrueXZ — θ applied once, at the frame boundary', () => {
    it('θ = 0 is the identity', () => {
        const s: SiteScope = { shape: 'rectangle', halfWidthM: 600, halfDepthM: 450 };
        expect(scopePolygonTrueXZ(s, 0)).toEqual(scopePolygonXZ(s));
    });

    it('θ ≠ 0 is a proper rotation about the origin: lengths kept, area sign kept, corner where the frame says', () => {
        const s: SiteScope = { shape: 'rectangle', halfWidthM: 600, halfDepthM: 450 };
        const theta = -44.87 * Math.PI / 180; // the founder's measured Barcelona θ (C12 §9 clause 8)
        const ring = scopePolygonTrueXZ(s, theta);
        for (let i = 0; i < 4; i++) expect(Math.hypot(ring[i]!.x, ring[i]!.z)).toBeCloseTo(750, 9);
        expect(signedAreaXZ(ring)).toBeCloseTo(4 * 600 * 450, 6);
        // `projectVectorToTrueNorth`: east' = e cosθ + n sinθ, north' = −e sinθ + n cosθ; true XZ is
        // (east', −north'). Corner (−600, −450) in project XZ is (e, n) = (−600, +450).
        const e = -600, n = 450;
        expect(ring[0]!.x).toBeCloseTo(e * Math.cos(theta) + n * Math.sin(theta), 9);
        expect(ring[0]!.z).toBeCloseTo(-(-e * Math.sin(theta) + n * Math.cos(theta)), 9);
    });
});

describe('scopePolygonLatLon — ONE projection, exact inverse', () => {
    it('every WGS84 vertex projects back onto its true-XZ vertex to 1e-6 m', () => {
        const s: SiteScope = { shape: 'circle', radiusM: 1781 };
        const xz = scopePolygonTrueXZ(s, 0.3);
        const ll = scopePolygonLatLon(s, BCN, 0.3);
        expect(ll.length).toBe(xz.length);
        for (let i = 0; i < xz.length; i++) {
            const back = latLonToSceneXZ(ll[i]!, BCN.lat, BCN.lon);
            expect(Math.hypot(back.x - xz[i]!.x, back.z - xz[i]!.z)).toBeLessThan(1e-6);
        }
    });
});

describe('createScopeContainment — THE ONE-POLYGON RULE', () => {
    it('circle: a point the exact circle accepts but the n-gon does not is OUTSIDE', () => {
        const s: SiteScope = { shape: 'circle', radiusM: 900 };
        const c = createScopeContainment(s, 0);
        const n = c.polygon.length;
        const inscribed = 900 * Math.cos(Math.PI / n);
        // Along the vertex-0 direction: just inside the circumscribed radius → inside.
        expect(c.contains(899.9, 0)).toBe(true);
        // Along the first EDGE's midpoint direction, between the inscribed and circumscribed radii:
        // inside the analytic circle, outside the polygon everything else was cut to.
        const mid = Math.PI / n;
        const r = (inscribed + 900) / 2;
        expect(r).toBeLessThan(900);
        expect(c.contains(r * Math.cos(mid), r * Math.sin(mid))).toBe(false);
        // And strictly inside the inscribed circle → inside via the fast path.
        expect(c.contains((inscribed - 0.01) * Math.cos(mid), (inscribed - 0.01) * Math.sin(mid))).toBe(true);
        // Past the circle → outside via the fast path.
        expect(c.contains(900.01, 0)).toBe(false);
    });

    it('rectangle at θ = 0: exact half-extent test, inclusive on the edge', () => {
        const c = createScopeContainment({ shape: 'rectangle', halfWidthM: 600, halfDepthM: 450 }, 0);
        expect(c.contains(600, 450)).toBe(true);
        expect(c.contains(600.001, 0)).toBe(false);
        expect(c.contains(0, -450.001)).toBe(false);
        expect(c.bbox).toEqual({ minX: -600, maxX: 600, minZ: -450, maxZ: 450 });
    });

    it('rectangle at θ = 45°: the corner of the axis-aligned box is now outside, the rotated corner inside', () => {
        const s: SiteScope = { shape: 'rectangle', halfWidthM: 600, halfDepthM: 600 };
        const c = createScopeContainment(s, Math.PI / 4);
        // A square rotated 45° is a diamond of "radius" 600·√2 ≈ 848.5 along the axes.
        expect(c.contains(840, 0)).toBe(true);
        expect(c.contains(0, 840)).toBe(true);
        expect(c.contains(590, 590)).toBe(false); // the un-rotated corner is now past the diamond's edge
        expect(c.contains(300, 300)).toBe(true);
    });

    it('frame: "project" ignores θ — for authored scene geometry', () => {
        const s: SiteScope = { shape: 'rectangle', halfWidthM: 600, halfDepthM: 600 };
        const c = createScopeContainment(s, Math.PI / 4, { frame: 'project' });
        expect(c.thetaRad).toBe(0);
        expect(c.contains(590, 590)).toBe(true);
    });
});

describe('the parcel is never outside the slab', () => {
    const parcel = [{ x: -20, z: -15 }, { x: 25, z: -15 }, { x: 25, z: 18 }, { x: -20, z: 18 }];

    it('scopeContainsRingXZ is exact for a convex scope', () => {
        expect(scopeContainsRingXZ({ shape: 'circle', radiusM: 150 }, parcel)).toBe(true);
        expect(scopeContainsRingXZ({ shape: 'circle', radiusM: 30 }, parcel)).toBe(false);
        expect(scopeContainsRingXZ({ shape: 'circle', radiusM: 150 }, [])).toBe(false);
    });

    it('minimumScopeContainingRing gives the slider floor for either shape', () => {
        expect(minimumScopeContainingRing(parcel, 10, 'circle')).toEqual({ shape: 'circle', radiusM: Math.hypot(25, 18) + 10 });
        expect(minimumScopeContainingRing(parcel, 10, 'rectangle')).toEqual({ shape: 'rectangle', halfWidthM: 35, halfDepthM: 28 });
        expect(minimumScopeContainingRing([], 10, 'circle')).toBeNull();
        const floor = minimumScopeContainingRing(parcel, 10, 'circle')!;
        expect(scopeContainsRingXZ(floor, parcel)).toBe(true);
    });
});

describe('fetch extent — the scope as the ONE source of halfDeg (F-1 RETRACTED)', () => {
    it('scopeFetchHalfDeg is the LATITUDE half-degree, because contextBboxAround widens longitude itself', () => {
        const s: SiteScope = { shape: 'circle', radiusM: 1781 };
        const cos = Math.cos(BCN.lat * Math.PI / 180);
        const metresPerDegLat = (Math.PI / 180) * 6_378_137;
        const halfDeg = scopeFetchHalfDeg(s);
        expect(halfDeg).toBeCloseTo(metresToDegLat(1781), 12);
        // The helper it feeds: `contextBboxAround(lat, lon, h)` = [lon − h/cos φ, lat − h, lon + h/cos φ, lat + h].
        // Re-derive its longitude arm here and check the box covers the disc on BOTH axes — which is
        // exactly what the withdrawn F-1 claimed it did not.
        const lonHalfDeg = halfDeg / Math.max(0.2, cos);
        expect(halfDeg * metresPerDegLat).toBeCloseTo(1781, 6);            // N–S: exact
        expect(lonHalfDeg * metresPerDegLat * cos).toBeCloseTo(1781, 6);   // E–W: exact, not 25 % short
        // And the value this function used to return would have DOUBLE-widened the read.
        const wrong = metresToDegLon(1781, BCN.lat);
        expect((wrong / cos) * metresPerDegLat * cos).toBeGreaterThan(1781 * 1.3);
    });

    it('scopeBboxLatLon contains every polygon vertex, for a rotated rectangle too', () => {
        const s: SiteScope = { shape: 'rectangle', halfWidthM: 900, halfDepthM: 300 };
        const box = scopeBboxLatLon(s, BCN);
        for (const p of scopePolygonLatLon(s, BCN, 0.7)) {
            expect(p.lat).toBeGreaterThanOrEqual(box.minLat);
            expect(p.lat).toBeLessThanOrEqual(box.maxLat);
            expect(p.lon).toBeGreaterThanOrEqual(box.minLon);
            expect(p.lon).toBeLessThanOrEqual(box.maxLon);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// §FULL-PLATE-DEPTH (L-13122) — the plate is a CUT SECTION, so its depth is read against its width
// ─────────────────────────────────────────────────────────────────────────────────────────
//
// The founder's 2026-09-07 screenshot: a 3 020 m circle rendering as "a thin, flat disc floating on
// white… no visible slab side or depth… a flat map decal, not a cut section of ground". The side
// primitive WAS built — the console's `SIDE + FLOOR BUILT` line was true — at a FIXED 60 m against a
// 6 040 m diameter: one percent. These pin the aspect ratio, not the metres, because the aspect is
// the fact a viewer sees and the metres are only how it is spelled.
describe('§FULL-PLATE-DEPTH — the slab depth is a fraction of the plate, not a constant', () => {
    /** depth ÷ DIAMETER — what shares the screen with the plate. */
    const aspect = (scope: SiteScope): number => siteScopeSlabDepthM(scope) / (2 * scopeOuterRadiusM(scope));

    it('⛔ THE REGRESSION: a fixed 60 m is 1 % of the founder\u2019s 3 020 m circle, and the fix is not', () => {
        const founders: SiteScope = { shape: 'circle', radiusM: 3020 };
        // The number that shipped, stated so the test carries the defect and not only the cure.
        expect(60 / (2 * 3020)).toBeLessThan(0.011);
        // What it resolves to now: 3020 × 0.12 = 362.4 m, i.e. 6 % of the 6 040 m diameter.
        expect(siteScopeSlabDepthM(founders)).toBeCloseTo(362.4, 6);
        expect(aspect(founders)).toBeCloseTo(0.06, 10);
    });

    it('holds the SAME aspect across the whole slider range once the floor is cleared', () => {
        // The floor binds below r = 500 m (60 / 0.12); above it the ratio is exactly 6 %.
        for (const r of [500, 900, 1781, 3020, 5035, 7071]) {
            expect(aspect({ shape: 'circle', radiusM: r })).toBeCloseTo(0.06, 10);
        }
    });

    it('never moves the SMALL end: at and below the 500 m hinge the depth is the old 60 m exactly', () => {
        for (const r of [150, 300, 499.9, 500]) {
            expect(siteScopeSlabDepthM({ shape: 'circle', radiusM: r })).toBe(
                r >= 500 ? 60 : SITE_SCOPE_SLAB_DEPTH_MIN_M,
            );
        }
        expect(SITE_SCOPE_SLAB_DEPTH_MIN_M).toBe(60);   // the constant that shipped, kept verbatim.
    });

    it('the MAX is a guard, not the operating point — the widest legal scope does not reach it', () => {
        const widest: SiteScope = { shape: 'circle', radiusM: 7071 };   // CTX_SCOPE_MAX_RADIUS_M
        expect(siteScopeSlabDepthM(widest)).toBeLessThan(SITE_SCOPE_SLAB_DEPTH_MAX_M);
        expect(siteScopeSlabDepthM({ shape: 'circle', radiusM: 1e6 })).toBe(SITE_SCOPE_SLAB_DEPTH_MAX_M);
    });

    it('a rectangle is as deep as the circle that circumscribes it — the shape toggle changes nothing', () => {
        const r = 3020;
        const square: SiteScope = { shape: 'rectangle', halfWidthM: r / Math.SQRT2, halfDepthM: r / Math.SQRT2 };
        expect(scopeOuterRadiusM(square)).toBeCloseTo(r, 6);
        expect(siteScopeSlabDepthM(square)).toBeCloseTo(siteScopeSlabDepthM({ shape: 'circle', radiusM: r }), 6);
    });

    it('⛔ NEVER NaN: a NaN minimumHeight makes WallGeometry build NOTHING, which is the same symptom', () => {
        // The one failure mode that would reproduce the defect this function exists to fix, so it is
        // pinned rather than trusted: a degenerate scope yields the floor, never a non-finite depth.
        for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
            const d = siteScopeSlabDepthM({ shape: 'circle', radiusM: bad });
            expect(Number.isFinite(d)).toBe(true);
            expect(d).toBeGreaterThanOrEqual(SITE_SCOPE_SLAB_DEPTH_MIN_M);
        }
    });
});
