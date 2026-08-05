// §CTX-RING-SANITIZE (L-663, 2026-08-05) — defensive repair of a context-building footprint ring
// BEFORE it reaches Cesium's `PolygonHierarchy` / `PolygonGeometry`.
//
// WHY THIS EXISTS
// ---------------
// Founder-reported defect (Córdoba, Calle de la Previsión, 2026-08-05): a neighbouring context
// building the founder personally knows to be a simple solid block renders in the 3D "Site" pane
// with a visible TRIANGULAR VOID cut into the extruded volume.
//
// Context-building rings reach the renderer from TWO sources (`contextBuildings.ts`'s
// `overpassToCollection` — live Overpass — and `contextTiles.ts`'s `tilesToCollection` — the baked
// PMTiles path, which is what actually serves Spain/Córdoba per `tools/context-bake/bake.mjs`
// `ALL_REGIONS[0]` "spain", L-607). NEITHER source validates or repairs the ring: raw lon/lat
// vertices — straight from an Overpass `out geom` response, or straight off an MVT-decoded,
// integer-quantised-then-dequantised tile feature — are handed directly to
// `apps/editor/src/ui/geospatial/CesiumViewport.ts`'s `new Cesium.PolygonHierarchy(positions)`.
//
// Cesium's polygon fill/extrusion triangulates with a bundled `earcut` (confirmed at
// `node_modules/.pnpm/cesium@1.143.0/.../Build/CesiumUnminified/index.js`, `PolygonPipeline.triangulate`
// → `earcut(...)`). `earcut` assumes a SIMPLE polygon (non-self-intersecting, no consecutive
// duplicate or exactly-collinear points beyond what its own `filterPoints` removes) and gives NO
// correctness guarantee otherwise — see its own README ("If you have a valid polygon, and earcut
// still produces a wrong result, please submit an issue"; degenerate/near-zero-area input is a
// documented gap, not a supported case). MVT tile quantisation (coordinates are integer-snapped to
// a 4096-unit tile grid, then dequantised back to lon/lat) is a well-known source of EXACTLY this
// kind of near-duplicate / near-collinear vertex noise: two source vertices that were genuinely
// distinct can round to numerically adjacent points after the quantise/dequantise round-trip, and a
// vertex that was a real corner can end up sitting only a hair off the line between its neighbours.
// `earcut`'s `filterPoints` only strips EXACT duplicates / EXACT zero-area collinearity
// (`area(prev, p, next) === 0`), not near-zero float noise — so a ring with this defect can silently
// mis-triangulate, dropping a sliver near the offending vertex. Because the "ear" being lost is a
// triangle, the visible artefact is a TRIANGULAR notch — exactly the reported symptom.
//
// This module is a narrow, PURE, always-safe repair pass: dedupe near-duplicate consecutive points
// and remove near-collinear interior vertices, using a metric epsilon (not a bare lon/lat epsilon,
// so it behaves consistently at any latitude). It NEVER runs if doing so would collapse the ring
// below a valid simple polygon (3 distinct vertices + closure) — in that case it returns the
// ORIGINAL ring unchanged, so a ring this module cannot safely improve is never made worse.
//
// ⚠ THIS DOES NOT REPAIR a genuinely self-intersecting (bowtie) ring or a multipolygon-with-hole
// misread as simple — both remain open questions this investigation could not confirm or rule out
// for this specific building without live network access to the exact OSM way. See
// `docs/04-reference/CONTEXT-BUILDING-TRIANGULAR-VOID-INVESTIGATION-2026-08-05.md`.

/** Metres per degree of latitude — good enough for an epsilon comparison at any latitude. */
const METRES_PER_DEG_LAT = 111_320;

/** Squared metric distance between two lon/lat points (equirectangular approx — fine at building scale). */
function distSqMetres(a: readonly number[], b: readonly number[]): number {
    const latMid = ((a[1] ?? 0) + (b[1] ?? 0)) / 2;
    const lonScale = Math.cos((latMid * Math.PI) / 180) * METRES_PER_DEG_LAT;
    const dx = ((a[0] ?? 0) - (b[0] ?? 0)) * lonScale;
    const dy = ((a[1] ?? 0) - (b[1] ?? 0)) * METRES_PER_DEG_LAT;
    return dx * dx + dy * dy;
}

/** Twice the signed area (metric) of the triangle (a,b,c) — 0 means exactly collinear. */
function crossMetres(a: readonly number[], b: readonly number[], c: readonly number[]): number {
    const latMid = ((a[1] ?? 0) + (c[1] ?? 0)) / 2;
    const lonScale = Math.cos((latMid * Math.PI) / 180) * METRES_PER_DEG_LAT;
    const ax = ((a[0] ?? 0) - (b[0] ?? 0)) * lonScale, ay = ((a[1] ?? 0) - (b[1] ?? 0)) * METRES_PER_DEG_LAT;
    const cx = ((c[0] ?? 0) - (b[0] ?? 0)) * lonScale, cy = ((c[1] ?? 0) - (b[1] ?? 0)) * METRES_PER_DEG_LAT;
    return ax * cy - ay * cx;
}

/** Consecutive vertices closer than this (metres) are treated as duplicates. Sub-centimetre: far
 *  below any real building-corner spacing, comfortably above float/quantisation noise. */
const DEDUPE_EPS_M = 0.01;
/** Twice-area (metres²) below which three consecutive vertices are treated as exactly collinear.
 *  Twice-area = edge-length × perpendicular deviation, so this catches e.g. a 1 cm bow on a 10 m
 *  edge (twice-area 0.1) or a 2 cm bow on a 25 m edge (1.0) — the quantise/dequantise noise scale —
 *  while a real shallow architectural corner (tens of cm deviation on a similar span, twice-area a
 *  few m² or more) stays comfortably above it and is kept. */
const COLLINEAR_EPS_M2 = 1.0;

/**
 * Repair a closed GeoJSON ring (first point === last point) by removing near-duplicate consecutive
 * vertices and near-collinear interior vertices, using a metric (not raw-degree) epsilon.
 *
 * PURE. NEVER throws. NEVER returns a ring with fewer than 4 points (3 distinct + closing point) —
 * if the repair would collapse below that floor, the ORIGINAL ring is returned unchanged, so a ring
 * this function cannot safely clean is never made invalid.
 */
export function sanitizeRing(ring: readonly (readonly number[])[]): number[][] {
    if (!ring || ring.length < 4) return ring ? ring.map((p) => [...p]) : [];

    // Work on the OPEN ring (drop the trailing closing duplicate; re-close at the end).
    const first = ring[0]!;
    const last = ring[ring.length - 1]!;
    const closed = first[0] === last[0] && first[1] === last[1];
    const open = closed ? ring.slice(0, ring.length - 1) : ring.slice();
    if (open.length < 3) return ring.map((p) => [...p]);

    // Pass 1 — dedupe near-duplicate consecutive points.
    const deduped: number[][] = [];
    for (const p of open) {
        const prev = deduped[deduped.length - 1];
        if (!prev || distSqMetres(prev, p) > DEDUPE_EPS_M * DEDUPE_EPS_M) deduped.push([p[0]!, p[1]!]);
    }
    // Check wrap-around duplicate (last vs first of the deduped set).
    if (deduped.length > 3) {
        const a = deduped[0]!, b = deduped[deduped.length - 1]!;
        if (distSqMetres(a, b) <= DEDUPE_EPS_M * DEDUPE_EPS_M) deduped.pop();
    }
    if (deduped.length < 3) return ring.map((p) => [...p]); // repair would collapse the ring — bail out safe.

    // Pass 2 — remove near-collinear interior vertices (one sweep; conservative — never removes a
    // vertex that would drop the ring below a triangle).
    const cleaned: number[][] = [];
    const n = deduped.length;
    for (let i = 0; i < n; i++) {
        const prev = deduped[(i - 1 + n) % n]!;
        const cur = deduped[i]!;
        const next = deduped[(i + 1) % n]!;
        const twiceArea = crossMetres(prev, cur, next);
        if (Math.abs(twiceArea) <= COLLINEAR_EPS_M2 && cleaned.length + (n - i - 1) > 2) {
            continue; // near-collinear — drop it, enough vertices remain to still close a polygon.
        }
        cleaned.push(cur);
    }
    if (cleaned.length < 3) return ring.map((p) => [...p]); // never worse than the input.

    const out = cleaned.map((p) => [p[0]!, p[1]!]);
    out.push([out[0]![0]!, out[0]![1]!]); // re-close.
    return out;
}
