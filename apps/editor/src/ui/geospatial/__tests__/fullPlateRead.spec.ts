// §FULL-PLATE-READ (L-13123) — CULL TO THE PLATE **BEFORE** THE CAP, NOT AFTER.
//
// Founder, 2026-09-07, on a Barcelona rectangle plate of 2 519 × 2 519 m: *"wE STILL DONT HAVE
// BUILDINGS IN ALL THE PLATE - CHECK! AND FIX IT"*, with arrows at the empty corners.
//
// ⭐ THE GEOMETRY, WHICH IS THE WHOLE FINDING AND IS ARITHMETIC RATHER THAN TASTE.
// The buildings read is a SQUARE box of half-extent `r` (the plate's CIRCUMSCRIBING radius) — so a
// RECTANGULAR plate, which is the square INSCRIBED in that disc, has area 2r² inside a read box of
// area 4r². **Half of every rectangular read is off the plate by construction.** The whole-scene cap
// was then spent on that whole box, NEAREST-FIRST, and only afterwards was the scope clip applied.
// Nearest-first over a box keeps a DISC: πR² ≈ f · 4r² where f = cap / candidates. The plate's own
// CORNERS sit at exactly r, so they survive only while
//
//                       f ≥ π/4 = 0.785
//
// and below that the plate empties from its corners inward — precisely where the founder's arrows
// point. His own log, at the DEFAULT scope: 14 000 / 15 781 = 0.887. It holds, by 13 %. But
// `CTX_TOTAL_MAX_BUILDINGS_CEILING` clamps the budget from ~2 607 m upward while the read box keeps
// growing as r², so at 3 562 m f = 0.475 → R = 0.78 r and the corners are gone.
//
// These tests pin the MECHANISM on a synthetic uniform field, because the mechanism is what
// generalises: a real city's density decides WHERE the break-even lands, not WHETHER it exists.

import { describe, it, expect } from 'vitest';
import {
    ringCentroidLonLat,
    selectFarRingFootprints,
    type ContextBuildingFeature,
} from '../contextBuildings';
import {
    createScopeContainment,
    dilateSiteScope,
    latLonToTrueXZ,
    scopeOuterRadiusM,
    SCOPE_READ_STRADDLE_SLACK_M,
    type SiteScope,
} from '../siteScope';

const ORIGIN = { lat: 41.39, lon: 2.19 };            // Poblenou, the founder's site
const M_PER_DEG_LAT = 111_320;
const COS = Math.cos((ORIGIN.lat * Math.PI) / 180);

/** A square footprint of `sideM` centred `eastM`/`northM` from the origin. */
function footprint(id: number, eastM: number, northM: number, sideM = 20): ContextBuildingFeature {
    const dLat = (h: number): number => h / M_PER_DEG_LAT;
    const dLon = (h: number): number => h / (M_PER_DEG_LAT * COS);
    const lat = ORIGIN.lat + dLat(northM);
    const lon = ORIGIN.lon + dLon(eastM);
    const h = sideM / 2;
    const ring: number[][] = [
        [lon - dLon(h), lat - dLat(h)],
        [lon + dLon(h), lat - dLat(h)],
        [lon + dLon(h), lat + dLat(h)],
        [lon - dLon(h), lat + dLat(h)],
        [lon - dLon(h), lat - dLat(h)],
    ];
    return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { heightM: 12, osmId: id },
    };
}

/** A uniform lattice of footprints filling the READ BOX: half-extent `rM` in both axes. */
function readBox(rM: number, stepM: number): ContextBuildingFeature[] {
    const out: ContextBuildingFeature[] = [];
    let id = 1;
    for (let e = -rM + stepM / 2; e < rM; e += stepM) {
        for (let n = -rM + stepM / 2; n < rM; n += stepM) out.push(footprint(id++, e, n));
    }
    return out;
}

/** The plate-admission predicate the viewport builds: the scope DILATED by the straddle slack. */
function admission(scope: SiteScope, slackM = SCOPE_READ_STRADDLE_SLACK_M): (lon: number, lat: number) => boolean {
    const containment = createScopeContainment(dilateSiteScope(scope, slackM), 0, { frame: 'true' });
    return (lon, lat) => {
        const p = latLonToTrueXZ({ lat, lon }, ORIGIN);
        return containment.contains(p.x, p.z);
    };
}

/** Metres from the origin to a feature's centroid. */
function distM(f: ContextBuildingFeature): number {
    const [clon, clat] = ringCentroidLonLat(f);
    const p = latLonToTrueXZ({ lat: clat, lon: clon }, ORIGIN);
    return Math.hypot(p.x, p.z);
}

/** The near bbox that both selectors partition against — small, so the far tier carries the plate. */
const NEAR_HALF_M = 120;
const NEAR_BBOX: [number, number, number, number] = [
    ORIGIN.lon - NEAR_HALF_M / (M_PER_DEG_LAT * COS),
    ORIGIN.lat - NEAR_HALF_M / M_PER_DEG_LAT,
    ORIGIN.lon + NEAR_HALF_M / (M_PER_DEG_LAT * COS),
    ORIGIN.lat + NEAR_HALF_M / M_PER_DEG_LAT,
];

describe('§FULL-PLATE-READ — the plate cull runs before the cap', () => {
    // A rectangle plate inscribed in an 1 800 m disc: 2 546 × 2 546 m, corners at 1 800 m — the
    // founder's own plate, to within 1 %.
    const R = 1800;
    const PLATE: SiteScope = { shape: 'rectangle', halfWidthM: R / Math.SQRT2, halfDepthM: R / Math.SQRT2 };
    const FIELD = readBox(R, 60);          // the read box: 3 600 × 3 600 m of uniform fabric
    const onPlate = admission(PLATE);

    /** Exactly the set `selectFarRingFootprints` considers: outside the near bbox, on the plate. */
    const outsideNear = (f: ContextBuildingFeature): boolean => {
        const [clon, clat] = ringCentroidLonLat(f);
        return !(clon >= NEAR_BBOX[0] && clon <= NEAR_BBOX[2] && clat >= NEAR_BBOX[1] && clat <= NEAR_BBOX[3]);
    };
    const onPlateCandidates = FIELD.filter(
        (f) => outsideNear(f) && onPlate(...(ringCentroidLonLat(f) as [number, number])),
    ).length;

    /** How many of `kept` lie in the OUTER corner band of the plate (the founder's arrows). */
    const cornersKept = (kept: readonly ContextBuildingFeature[]): number =>
        kept.filter((f) => onPlate(...(ringCentroidLonLat(f) as [number, number])) && distM(f) > 0.85 * R).length;

    const cornersAvailable = FIELD.filter(
        (f) => onPlate(...(ringCentroidLonLat(f) as [number, number])) && distM(f) > 0.85 * R,
    ).length;

    it('the synthetic field reproduces the founder’s ratio: a rectangle reads ~2× what it draws', () => {
        const on = FIELD.filter((f) => onPlate(...(ringCentroidLonLat(f) as [number, number]))).length;
        // Read box 4r², plate 2r² — so the bare ratio is 0.50, and the straddle slack adds the rim
        // band on top of it. Bounded on both sides: below 0.45 the box would not be the superset the
        // reader assumes, above 0.72 the slack would have stopped being a building's width.
        expect(on / FIELD.length).toBeGreaterThan(0.45);
        expect(on / FIELD.length).toBeLessThan(0.72);
        // ⭐ AND THE RATIO IS THE DEFECT: a cap sized for the PLATE is 0.6 of the BOX, well under the
        // π/4 = 0.785 a nearest-first disc needs to reach the plate's corners.
        expect(onPlateCandidates / FIELD.length).toBeLessThan(Math.PI / 4);
        expect(cornersAvailable).toBeGreaterThan(20);   // there ARE corner buildings to lose.
    });

    it('⛔ THE REGRESSION: capping the READ BOX empties the plate’s corners', () => {
        // ⭐ THE CAP IS EXACTLY WHAT THE PLATE NEEDS — not a punitive number, the RIGHT one. Spent on
        // the read box instead of the plate, it still cannot reach the corners.
        const cap = onPlateCandidates;
        const kept = selectFarRingFootprints({
            farFeatures: FIELD, centerLat: ORIGIN.lat, centerLon: ORIGIN.lon,
            nearBbox: NEAR_BBOX, nearOsmIds: new Set(), cap,
        });
        expect(kept.length).toBe(cap);
        // Nearest-first over the BOX keeps a DISC: πR'² ≈ f·(2R)² with f < π/4 ⇒ R' < R.
        const reach = Math.max(...kept.map(distM));
        expect(reach).toBeLessThan(R);                       // it does not even reach the corners
        // …and most of the corner band is simply gone.
        expect(cornersKept(kept)).toBeLessThan(cornersAvailable * 0.5);
    });

    it('⭐ THE FIX: the same cap, culled to the plate first, keeps EVERY corner', () => {
        const cap = onPlateCandidates;
        const kept = selectFarRingFootprints({
            farFeatures: FIELD, centerLat: ORIGIN.lat, centerLon: ORIGIN.lon,
            nearBbox: NEAR_BBOX, nearOsmIds: new Set(), cap, onPlate,
        });
        // The on-plate candidates now fit inside the SAME cap, so nothing on the plate is dropped.
        expect(kept.length).toBeLessThanOrEqual(cap);
        expect(cornersKept(kept)).toBe(cornersAvailable);
        // Every kept footprint is one the plate will actually carry.
        for (const f of kept) expect(onPlate(...(ringCentroidLonLat(f) as [number, number]))).toBe(true);
    });

    it('the cull is CONSERVATIVE at the rim: a straddler is admitted, not deleted', () => {
        // A footprint whose centre sits 40 m OUTSIDE the plate edge — the `251 cut` case in the
        // founder's own clip line. It must reach the clip, which sections it; deleting it here
        // would replace a clean vertical cut face with a missing building.
        const half = R / Math.SQRT2;
        const straddler = footprint(999_001, half + 40, 0, 90);
        const kept = selectFarRingFootprints({
            farFeatures: [...FIELD, straddler], centerLat: ORIGIN.lat, centerLon: ORIGIN.lon,
            nearBbox: NEAR_BBOX, nearOsmIds: new Set(), cap: 0, onPlate,
        });
        expect(kept.some((f) => f.properties.osmId === 999_001)).toBe(true);
        // …but one a whole slack beyond it is not: the slack is a building's size, not a second plate.
        const faraway = footprint(999_002, half + SCOPE_READ_STRADDLE_SLACK_M + 60, 0, 20);
        const kept2 = selectFarRingFootprints({
            farFeatures: [faraway], centerLat: ORIGIN.lat, centerLon: ORIGIN.lon,
            nearBbox: NEAR_BBOX, nearOsmIds: new Set(), cap: 0, onPlate,
        });
        expect(kept2).toEqual([]);
    });

    it('omitting the predicate changes NOTHING — the six default-neighbourhood callers are untouched', () => {
        const args = {
            farFeatures: FIELD, centerLat: ORIGIN.lat, centerLon: ORIGIN.lon,
            nearBbox: NEAR_BBOX, nearOsmIds: new Set<number>(), cap: 500,
        };
        const before = selectFarRingFootprints(args).map((f) => f.properties.osmId);
        const after = selectFarRingFootprints({ ...args, onPlate: undefined }).map((f) => f.properties.osmId);
        expect(after).toEqual(before);
    });
});

describe('§FULL-PLATE-READ — dilateSiteScope is an exact Minkowski growth, not a scale', () => {
    it('a circle grows by the distance; a rectangle grows on BOTH half-extents by the same distance', () => {
        expect(dilateSiteScope({ shape: 'circle', radiusM: 900 }, 150)).toEqual({ shape: 'circle', radiusM: 1050 });
        expect(dilateSiteScope({ shape: 'rectangle', halfWidthM: 900, halfDepthM: 300 }, 150)).toEqual({
            shape: 'rectangle', halfWidthM: 1050, halfDepthM: 450,
        });
    });

    it('⚠ NOT a scale: a long thin rectangle keeps its ADDED distance, it does not gain 17 % on its short side', () => {
        const thin: SiteScope = { shape: 'rectangle', halfWidthM: 3000, halfDepthM: 200 };
        const grown = dilateSiteScope(thin, 100);
        expect(grown).toEqual({ shape: 'rectangle', halfWidthM: 3100, halfDepthM: 300 });
        // `clampSiteScope` (the other grower in this module) would have multiplied BOTH by the same
        // ratio, which is the wrong sense of "near enough to the edge to matter".
        expect(scopeOuterRadiusM(grown)).not.toBeCloseTo(scopeOuterRadiusM(thin) * (3100 / 3000), 3);
    });

    it('a zero / negative / non-finite slack returns the SAME reference — no allocation, no drift', () => {
        const s: SiteScope = { shape: 'circle', radiusM: 900 };
        expect(dilateSiteScope(s, 0)).toBe(s);
        expect(dilateSiteScope(s, -5)).toBe(s);
        expect(dilateSiteScope(s, Number.NaN)).toBe(s);
    });
});
