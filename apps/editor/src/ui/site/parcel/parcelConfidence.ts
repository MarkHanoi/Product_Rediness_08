// §L-640 Phase 1 — pure parcel geometry diagnostics + honesty-gated cadastral confidence.
//
// PURE (no THREE / Cesium / DOM / network) — every provider adapter calls these to attach
// `metrics` + `confidence` to its ParcelFeature. Two hard rules, both from the founder's sign-off:
//
//   1. NEVER fabricate. Everything here is derived from the ring + the raw signals the source
//      actually returned. No field is invented.
//   2. The tiered `match` label is built ONLY from categorical FACTS (kind, areaSource,
//      geometryComplete, click-inside). NO calibrated numeric cutoff enters `match` — that would
//      violate the C58 §16 explainability this feature exists to serve. Raw numeric fields
//      (pointToParcelM, candidateMarginM, areaDeltaPct) are shipped for transparency + future
//      calibration, but are explicitly WITHHELD from the label until we have a measured
//      distribution across N parcels (a stated Phase-1 limitation, C57 §2 amendment).
//
// The ONLY constant is a 1 m tolerance on the click-inside test, justified purely as
// coordinate/projection float-noise, NOT as a behavioural threshold.

import type { LatLon } from '../boundaryProjection.js';
import type {
    ParcelConfidence, ParcelGeometryMetrics, ParcelAreaSource,
} from './ParcelProvider.js';

const R = 6_378_137;
const D2R = Math.PI / 180;
/** Coordinate/projection float-noise tolerance for the click-inside test (metres). NOT a tuned cutoff. */
const INSIDE_TOLERANCE_M = 1;

/** A ring is geometry-complete when it has ≥3 vertices and a non-degenerate area. */
export function isGeometryComplete(ring: ReadonlyArray<LatLon>, areaSigM2: number): boolean {
    return ring.length >= 3 && Number.isFinite(areaSigM2) && areaSigM2 > 0;
}

/** Pure geometry diagnostics from a WGS84 ring (local-equirectangular about ring[0]). */
export function computeParcelMetrics(ring: ReadonlyArray<LatLon>): ParcelGeometryMetrics {
    const n = ring.length;
    if (n === 0) {
        return {
            areaSigM2: 0, perimeterM: 0, centroid: { lat: 0, lon: 0 },
            bbox: { west: 0, south: 0, east: 0, north: 0 }, vertexCount: 0, compactness: 0,
        };
    }
    const lat0 = ring[0]!.lat, lon0 = ring[0]!.lon;
    const cos0 = Math.cos(lat0 * D2R) || 1e-9;
    // planar (metres) relative to ring[0]
    const xz = ring.map((p) => ({ x: (p.lon - lon0) * D2R * R * cos0, z: (p.lat - lat0) * D2R * R }));

    let west = ring[0]!.lon, east = ring[0]!.lon, south = ring[0]!.lat, north = ring[0]!.lat;
    for (const p of ring) {
        if (p.lon < west) west = p.lon; if (p.lon > east) east = p.lon;
        if (p.lat < south) south = p.lat; if (p.lat > north) north = p.lat;
    }

    let a2 = 0, perim = 0, cxA = 0, czA = 0;
    for (let i = 0; i < n; i++) {
        const p = xz[i]!, q = xz[(i + 1) % n]!;
        const cross = p.x * q.z - q.x * p.z;
        a2 += cross;
        cxA += (p.x + q.x) * cross;
        czA += (p.z + q.z) * cross;
        perim += Math.hypot(q.x - p.x, q.z - p.z);
    }
    const areaSigM2 = Math.abs(a2 / 2);
    // Area-weighted polygon centroid (planar), unprojected back to WGS84. Falls back to
    // the vertex mean for a degenerate (zero-area) ring.
    let cLat: number, cLon: number;
    if (Math.abs(a2) > 1e-9) {
        const cx = cxA / (3 * a2), cz = czA / (3 * a2);
        cLon = lon0 + cx / (D2R * R * cos0);
        cLat = lat0 + cz / (D2R * R);
    } else {
        cLon = ring.reduce((s, p) => s + p.lon, 0) / n;
        cLat = ring.reduce((s, p) => s + p.lat, 0) / n;
    }
    const compactness = perim > 0 ? (4 * Math.PI * areaSigM2) / (perim * perim) : 0;
    return {
        areaSigM2, perimeterM: perim, centroid: { lat: cLat, lon: cLon },
        bbox: { west, south, east, north }, vertexCount: n,
        compactness: Math.min(1, Math.max(0, compactness)),
    };
}

/** Ray-casting point-in-ring test (WGS84 lon/lat, planar-good at parcel scale). */
export function pointInRing(lat: number, lon: number, ring: ReadonlyArray<LatLon>): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i]!, b = ring[j]!;
        const intersect = (a.lat > lat) !== (b.lat > lat) &&
            lon < ((b.lon - a.lon) * (lat - a.lat)) / ((b.lat - a.lat) || 1e-12) + a.lon;
        if (intersect) inside = !inside;
    }
    return inside;
}

export interface ParcelConfidenceInput {
    readonly ring: ReadonlyArray<LatLon>;
    readonly kind: 'cadastral' | 'footprint-fallback';
    /** Registry-declared area from the source (INSPIRE areaValue), or null if unpublished. */
    readonly areaOfficialM2: number | null;
    /** Shoelace area from the ring (from computeParcelMetrics). */
    readonly areaSigM2: number;
    /** Query-point→parcel distance (Spain OVC `_Distancia`), or null for point-in-polygon providers. */
    readonly pointToParcelM: number | null;
    /** Nearest vs 2nd-nearest candidate gap, or null. */
    readonly candidateMarginM: number | null;
}

/**
 * Derive the honesty-gated confidence. The tier is built ONLY from categorical facts:
 *   • low  ⇔ footprint-fallback OR geometry not complete   (not a legal parcel / broken geom)
 *   • high ⇔ cadastral AND geometryComplete AND official area published AND click landed inside
 *            (or no click point, e.g. draw / ref-query)
 *   • medium ⇔ everything else (a real cadastral polygon missing one corroborator)
 * No metres-cutoff enters this — pointToParcelM ≤ INSIDE_TOLERANCE_M is a coordinate-noise
 * "inside vs outside" fact, not a calibrated distance tier.
 */
export function computeParcelConfidence(input: ParcelConfidenceInput): ParcelConfidence {
    const { ring, kind, areaOfficialM2, areaSigM2, pointToParcelM, candidateMarginM } = input;
    const geometryComplete = isGeometryComplete(ring, areaSigM2);
    const areaSource: ParcelAreaSource = areaOfficialM2 != null ? 'registry-declared' : 'derived-from-ring';
    const areaDeltaPct = (areaOfficialM2 != null && areaOfficialM2 > 0)
        ? Math.abs(areaOfficialM2 - areaSigM2) / areaOfficialM2 * 100
        : null;
    // Click-inside fact: unavailable (null) does NOT penalise (draw / ref-query); else within tolerance.
    const clickInsideOk = pointToParcelM == null || pointToParcelM <= INSIDE_TOLERANCE_M;

    let match: ParcelConfidence['match'];
    if (kind === 'footprint-fallback' || !geometryComplete) {
        match = 'low';
    } else if (areaSource === 'registry-declared' && clickInsideOk) {
        match = 'high';
    } else {
        match = 'medium';
    }

    return { match, areaSource, areaOfficialM2, areaSigM2, areaDeltaPct, pointToParcelM, candidateMarginM, geometryComplete };
}
