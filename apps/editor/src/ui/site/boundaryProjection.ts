// A.8.c (core) — drawn lat/lon ring → site-local XZ parcel boundary (HEADLESS).
//
// The polygon-draw tool collects vertices as WGS84 lat/lon (Cesium picks). The
// C19 `ParcelBoundary` polygon is in scene-XZ metres relative to the Site origin.
// This pure module does that conversion + the edge classification, with NO
// Cesium / THREE / DOM import so the math is unit-testable.
//
// PROJECTION METHOD — local equirectangular (small-area tangent-plane approx)
// --------------------------------------------------------------------------
// The proper conversion is `LTPENURebase.projectToScene` (proj4 UTM, C12/C19
// §1.3). That requires a proj4 instance + the project CRS string wired into the
// editor — not readily available at this draw surface yet (the rebase wiring is
// the documented A.8.a/§1.3 follow-up, see siteDispatch.ts dispatchSiteLocation).
//
// For PARCEL-SCALE geometry (tens of metres) a local equirectangular projection
// about the site-origin latitude is accurate to < 0.1 %:
//
//     x (East,  metres)  =  (lon − lon0) · (π/180) · R · cos(lat0)
//     z (−North, metres) = −(lat − lat0) · (π/180) · R
//
//   where R = 6_378_137 m (WGS84 equatorial radius) and (lat0, lon0) is the Site
//   origin. The −North → +Z sign matches LTPENURebase's axis convention
//   (`scene.z = −North`), so a boundary authored here lands in the SAME frame as
//   the rest of the C19 site substrate.
//
// CAVEAT (browser-verify): this ignores ellipsoidal flattening + the UTM
// conformal correction. The error is sub-millimetre at parcel scale but grows
// with distance from the origin — fine for a single lot, NOT for a multi-km site.
// When `LTPENURebase` is wired at this surface, swap `latLonToSceneXZ` for
// `rebase.projectToScene(lat, lon, 0)` (drop y) and delete this approximation.

import type { ParcelEdgeClassification } from '@pryzm/schemas';

/** WGS84 equatorial radius (metres). */
const EARTH_RADIUS_M = 6_378_137;
const DEG2RAD = Math.PI / 180;

export interface LatLon {
    readonly lat: number;
    readonly lon: number;
}

export interface XZPoint {
    readonly x: number;
    readonly z: number;
}

/**
 * Project a single WGS84 lat/lon to site-local scene XZ metres, using a local
 * equirectangular projection about `(originLat, originLon)`. See module header
 * for the formula + caveats.
 */
export function latLonToSceneXZ(
    point: LatLon,
    originLat: number,
    originLon: number,
): XZPoint {
    const cosLat0 = Math.cos(originLat * DEG2RAD);
    const x = (point.lon - originLon) * DEG2RAD * EARTH_RADIUS_M * cosLat0;
    const z = -((point.lat - originLat) * DEG2RAD * EARTH_RADIUS_M);
    return { x, z };
}

/**
 * Inverse of {@link latLonToSceneXZ} — recover a WGS84 lat/lon from site-local scene XZ metres
 * about the SAME `(originLat, originLon)`. Exact algebraic inverse of the local equirectangular
 * projection above (§L-521: needed to query the REAL zoning at a DRAWN parcel's actual centroid,
 * not the site anchor). The XZ must be in the TRUE-north frame (undo any project-north θ first).
 */
export function sceneXZToLatLon(
    p: XZPoint,
    originLat: number,
    originLon: number,
): LatLon {
    const cosLat0 = Math.cos(originLat * DEG2RAD);
    const lat = originLat - p.z / (DEG2RAD * EARTH_RADIUS_M);
    const lon = originLon + p.x / (DEG2RAD * EARTH_RADIUS_M * cosLat0);
    return { lat, lon };
}

/**
 * §SEAM-2 INCREMENT 2 (L-604 / C12 §1.5) — THE ONE origin authority for a GIS site, shared by
 * BOTH the parcel-ring projection (WRITE, at commit) and the 3D-Site ENU frame (READ, at render).
 *
 * THE RESIDUAL SHIFT THIS CLOSES. After the θ write≠read fix (commit 4a0e9f68) the parcel bearing
 * is correct, but a TRANSLATION shift remained *intermittently*. Root cause: the ring was projected
 * about the geocoded STORE LOCATION while the render built its ENU frame about the LTP-ENU origin
 * (`getCurrentSiteOrigin`) — TWO competing origin authorities (C12 §1.5, L-604). They start equal
 * (both set together by `setLtpOriginIfSafe`), but `setLtpOriginIfSafe` FREEZES the LTP origin once
 * a boundary is committed (C19 §1.3 boundary-shift guard) while the store location keeps moving on
 * any later geocode. So after "geocode → commit → re-geocode → Redraw → re-select" the ring was
 * projected about the NEW store location while the frame stayed at the FROZEN LTP origin, sliding
 * the parcel by dist(store, LTP) — the founder's "sometimes shifted" Barcelona parcel select.
 *
 * THE FIX IS THIS SINGLE PRECEDENCE, read identically by write and read: the LTP-ENU origin FIRST
 * (the frame every authored coordinate is baked in — it IS the scene origin, C12 §1.5), then the
 * geocoded store location, then the last geocode frame. Because both sides call this, the ring and
 * the ENU frame can never again be built about different origins. θ-INDEPENDENT — it resolves only
 * the translation origin (lat/lon), never the bearing; and identical to the old behaviour before any
 * boundary exists, where the LTP origin and the store location are set together and coincide.
 *
 * Pure (no I/O / Cesium / THREE / DOM), like the rest of this module — the caller reads the three
 * candidate sources and this decides between them, so the decision is unit-testable in isolation.
 * A 0/0 lat/lon is the `ensureSite` Null-Island placeholder and is treated as "unset".
 */
export function resolveSiteFrameOrigin(
    ltpOrigin: { lat: number; lon: number } | null | undefined,
    storeLocation: { latitude: number; longitude: number } | null | undefined,
    geocodeFrame: { lat: number; lon: number } | null | undefined,
): { lat: number; lon: number } | null {
    if (ltpOrigin && (ltpOrigin.lat !== 0 || ltpOrigin.lon !== 0)) {
        return { lat: ltpOrigin.lat, lon: ltpOrigin.lon };
    }
    if (storeLocation && (storeLocation.latitude !== 0 || storeLocation.longitude !== 0)) {
        return { lat: storeLocation.latitude, lon: storeLocation.longitude };
    }
    if (geocodeFrame && (geocodeFrame.lat !== 0 || geocodeFrame.lon !== 0)) {
        return { lat: geocodeFrame.lat, lon: geocodeFrame.lon };
    }
    return null;
}

/**
 * §L-635 (C57 §1.3 / §4, C19 §1.3, C12 §1.5) — the projection origin a parcel-boundary COMMIT
 * must use. The always-on project-origin datum (the blue sphere, `initProjectOrigin.ts`) is pinned
 * at world (0,0,0) by design (C13 / ADR-0115 project isolation); it is NOT moved to encode a lat/lon.
 * So for that datum to sit ON the committed parcel boundary, the ring MUST be projected about a point
 * that lies ON the boundary — its FIRST VERTEX — which then lands at scene (0,0). This is also the
 * historical behaviour: the pre-regression commit fell back to the first drawn vertex whenever no
 * site location was set, and the founder confirms the datum "always" sat on the boundary.
 *
 * THE REGRESSION THIS CLOSES. The commit paths projected about `fromSite ?? firstVertex`, i.e. they
 * PREFERRED a previously-geocoded / stale site anchor over the parcel's own location, and set the
 * LTP-ENU origin only AFTER projecting (and only when no anchor existed). Selecting or drawing a
 * parcel away from the initial geocode (the normal explore-then-pick flow, wired for many cadastres
 * in commit 03321663) therefore projected the ring dist(anchor, parcel) — up to hundreds of km — from
 * world origin, leaving the datum sphere off the plot. C57 §1.3 / §4 REQUIRE `dispatchSiteLocation`
 * to set the origin to the parcel's own location BEFORE the ring projects; this returns that origin.
 *
 * Pure (no I/O / THREE / DOM), unit-testable in isolation. Returns null for an empty ring.
 */
export function parcelFrameOrigin(ring: ReadonlyArray<LatLon>): LatLon | null {
    const first = ring[0];
    return first ? { lat: first.lat, lon: first.lon } : null;
}

/** Signed area (shoelace) of an XZ ring; >0 ⇒ counter-clockwise in XZ. */
function signedAreaXZ(ring: ReadonlyArray<XZPoint>): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return a / 2;
}

/**
 * §CLASSIFY-EDGES-RUN-GROUP (2026-08-06) — angular tolerance (degrees) for treating an edge as
 * "the same boundary run" as its already-classified neighbour when growing the front/rear group
 * below. A REAL cadastral ring routinely digitizes one physical street/rear boundary as several
 * consecutive near-collinear edges (a kerb-line nudge, a survey vertex a few cm off dead-straight)
 * — the founder's Córdoba `2947201UG4924N` parcel does exactly this: its street frontage and its
 * rear boundary are each split into TWO consecutive edges whose outward normals differ by well
 * under a degree from each other, while every genuine corner on that same ring turns ~90°. 30°
 * sits an order of magnitude below the smallest real corner turn observed and an order of magnitude
 * above the digitization noise this exists to absorb — conservative in both directions.
 */
const RUN_GROUP_COS_THRESHOLD = Math.cos((30 * Math.PI) / 180);

/**
 * Classify each polygon edge as front / side / rear / unclassified by a simple,
 * deterministic compass heuristic so the C19 §1.6 per-edge setback check has
 * data AND the §2.7 invariant (`edgeClassifications.length === polygon.length`)
 * holds by construction.
 *
 * Heuristic (first cut — refine in-browser):
 *   - The edge whose OUTWARD normal points most strongly toward −Z (scene
 *     "north"/toward the viewer, the conventional street side) → 'front'.
 *   - The opposite-most edge (+Z) → 'rear'.
 *   - All others → 'side'.
 * Edges where the heuristic is ambiguous fall back to 'unclassified'. There is
 * always exactly one classification per edge.
 *
 * §CLASSIFY-EDGES-RUN-GROUP (2026-08-06, real defect fixed) — ⚠ picking ONLY the single most-
 * extremal edge as front (and only the single most-extremal as rear) is wrong on a real cadastral
 * ring whenever that ring's actual street/rear boundary is digitized as MULTIPLE consecutive
 * near-collinear edges rather than one clean segment — routine for real parcels, not a hypothetical.
 * Confirmed on Córdoba OA-2 parcel `2947201UG4924N` (14-vertex real Catastro ring, PGOU Art. 13.6
 * setbacks `{front: 0, side: 10.5, rear: 10.5}`): the true frontage there is two consecutive edges
 * (their outward normals ~0.3° apart) and the true rear is likewise two consecutive edges — but the
 * single-extremal-edge version of this function tagged only ONE edge of each pair `'front'`/`'rear'`
 * and left its near-identical neighbour `'side'`, so that neighbour took the FULL 10.5 m side
 * setback instead of the ordinance's actual 0 m/10.5 m front/rear treatment. On this parcel that
 * turned a real, substantially larger buildable footprint into a near-degenerate sliver — not because
 * the ordinance's own 10.5 m setbacks are unworkable here, but because half of the front/rear
 * boundary was silently charged a setback that does not apply to it.
 *
 * THE FIX grows each extremal edge into its full contiguous RUN of near-collinear neighbours
 * (`RUN_GROUP_COS_THRESHOLD`) before assigning `'front'`/`'rear'` — a strict generalisation of the
 * old single-edge rule (a run degenerates to exactly one edge whenever every neighbour turns more
 * than the threshold, which is what a clean rectangular/quadrilateral parcel already does, so this
 * changes nothing for the common case). Growth stops at the first neighbour whose turn exceeds the
 * threshold, so a genuine corner (~90° on every real parcel measured) never merges two different
 * physical boundaries into one run. `'side'` remains the fallback for every other edge — this does
 * NOT add real frontage detection (still no notion of which edge actually touches a street; that
 * remains the documented A.8 / site-intelligence follow-up), it only prevents a single physical
 * boundary from being split across two different setback treatments.
 */
export function classifyEdges(
    polygon: ReadonlyArray<XZPoint>,
): ParcelEdgeClassification[] {
    const n = polygon.length;
    if (n < 3) return polygon.map(() => 'unclassified' as const);

    // Ensure CCW winding for a consistent outward-normal sign. If the ring is
    // CW (signed area < 0), the outward normal is on the other side; we account
    // for that with `sign`.
    const sign = signedAreaXZ(polygon) >= 0 ? 1 : -1;

    // Full outward unit normal (nx, nz) per edge — the run-grouping walk below needs the WHOLE
    // vector (adjacent-edge similarity), not just the Z component the front/rear pick itself uses.
    const normalX: number[] = new Array(n).fill(0);
    const normalZ: number[] = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
        const p = polygon[i]!;
        const q = polygon[(i + 1) % n]!;
        const ex = q.x - p.x;
        const ez = q.z - p.z;
        const len = Math.hypot(ex, ez) || 1;
        // Outward normal for CCW ring is (edge rotated −90°): (ez, −ex).
        // Multiply by `sign` so CW rings get the correct outward direction.
        normalX[i] = (ez / len) * sign;
        normalZ[i] = (-ex / len) * sign;
    }

    let frontIdx = 0;
    let rearIdx = 0;
    for (let i = 1; i < n; i++) {
        if (normalZ[i]! < normalZ[frontIdx]!) frontIdx = i; // most toward −Z
        if (normalZ[i]! > normalZ[rearIdx]!) rearIdx = i;   // most toward +Z
    }

    const adjacentDot = (i: number, j: number): number =>
        normalX[i]! * normalX[j]! + normalZ[i]! * normalZ[j]!;

    /** Grow `seed` into its full contiguous run of near-collinear neighbouring edges. */
    const growRun = (seed: number): Set<number> => {
        const run = new Set<number>([seed]);
        let cur = seed;
        for (let k = 0; k < n; k++) {
            const next = (cur + 1) % n;
            if (run.has(next) || adjacentDot(cur, next) < RUN_GROUP_COS_THRESHOLD) break;
            run.add(next);
            cur = next;
        }
        cur = seed;
        for (let k = 0; k < n; k++) {
            const prev = (cur - 1 + n) % n;
            if (run.has(prev) || adjacentDot(prev, cur) < RUN_GROUP_COS_THRESHOLD) break;
            run.add(prev);
            cur = prev;
        }
        return run;
    };

    const frontRun = growRun(frontIdx);
    const rearRun = rearIdx === frontIdx ? new Set<number>() : growRun(rearIdx);
    // Safety net (should not occur on any real simple polygon — front and rear grow from
    // near-opposite normals — but never let a false-positive merge hand the SAME edge to both
    // groups): front keeps it, rear yields.
    for (const i of frontRun) rearRun.delete(i);

    const out: ParcelEdgeClassification[] = new Array(n).fill('side');
    for (const i of frontRun) out[i] = 'front';
    for (const i of rearRun) out[i] = 'rear';
    return out;
}

export interface BuiltBoundary {
    readonly polygon: XZPoint[];
    readonly edgeClassifications: ParcelEdgeClassification[];
}

/**
 * Convert a drawn lat/lon ring into a C19 `ParcelBoundary` (XZ polygon + per-edge
 * classifications), projected about the Site origin. Drops a trailing vertex that
 * duplicates the first (Cesium close-loop) so no zero-length edge is emitted.
 *
 * Guarantees `edgeClassifications.length === polygon.length` (C19 §2.7).
 */
export function buildBoundaryFromLatLonRing(
    ring: ReadonlyArray<LatLon>,
    originLat: number,
    originLon: number,
): BuiltBoundary {
    const projected = ring.map((p) => latLonToSceneXZ(p, originLat, originLon));

    // Drop a closing duplicate (first ≈ last within 1 mm).
    if (projected.length >= 2) {
        const first = projected[0]!;
        const last = projected[projected.length - 1]!;
        if (Math.hypot(first.x - last.x, first.z - last.z) < 1e-3) {
            projected.pop();
        }
    }

    const edgeClassifications = classifyEdges(projected);
    return { polygon: projected, edgeClassifications };
}
