// L-613 — the PURE footprint-pick, split out of `FootprintParcelProvider.ts` so it is unit-testable
// WITHOUT dragging in the context-buildings network graph (contextBuildings → contextTiles → pmtiles).
// Only a TYPE import from contextBuildings (erased at runtime), so this module has no heavy deps.
//
// §L-640 Phase 1 — footprint-fallback parcels attach metrics + confidence with confidence.match
// HARD-CODED to 'low' by construction: an OSM footprint is never a legal parcel, so it can never
// be labelled 'high' or 'medium' regardless of geometry quality. This is enforced via
// computeParcelConfidence(kind:'footprint-fallback') which unconditionally yields 'low'.

import type { LatLon } from '../boundaryProjection.js';
import type { ParcelFeature } from './ParcelProvider.js';
import type { ContextBuildingFeature } from '../../geospatial/contextBuildings.js';
import { computeParcelMetrics, computeParcelConfidence } from './parcelConfidence.js';

/** Ray-casting point-in-polygon on a GeoJSON [lon,lat] outer ring. */
export function ringContainsLonLat(coords: number[][], lon: number, lat: number): boolean {
    let inside = false;
    for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
        const xi = coords[i]?.[0] ?? 0, yi = coords[i]?.[1] ?? 0;
        const xj = coords[j]?.[0] ?? 0, yj = coords[j]?.[1] ?? 0;
        const intersect = (yi > lat) !== (yj > lat) &&
            lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

/** Approx planar area (m²) of a small [lon,lat] ring via local equirectangular. */
export function ringAreaM2LonLat(coords: number[][]): number {
    if (coords.length < 3) return 0;
    const R = 6_378_137, d2r = Math.PI / 180;
    const lat0 = (coords[0]?.[1] ?? 0) * d2r;
    const cos0 = Math.cos(lat0);
    const xz = coords.map((c) => ({ x: (c[0] ?? 0) * d2r * R * cos0, z: (c[1] ?? 0) * d2r * R }));
    let a = 0;
    for (let i = 0; i < xz.length; i++) {
        const p = xz[i]!, q = xz[(i + 1) % xz.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
}

/** Convert a GeoJSON [lon,lat] outer ring to a LatLon[] ring. */
function toLatLonRing(coords: number[][]): LatLon[] {
    const ring: LatLon[] = [];
    for (const c of coords) {
        const lon = Number(c[0]), lat = Number(c[1]);
        if (Number.isFinite(lat) && Number.isFinite(lon)) ring.push({ lat, lon });
    }
    return ring;
}

/**
 * From a list of OSM building footprints, return the one whose outer ring CONTAINS the click, as a
 * `ParcelFeature` labelled `footprint (OSM)` — or null when nothing contains the point (an honest
 * "no footprint here"). NEVER a cadastral reference: the `refcat` is the OSM id, so the card can
 * never imply legality (C58 §1.4).
 *
 * §L-640 Phase 1: every footprint result carries metrics + confidence with confidence.match = 'low'
 * by construction. A footprint is never a legal parcel, so 'high'/'medium' are structurally
 * impossible — this is enforced via computeParcelConfidence(kind:'footprint-fallback').
 */
export function pickFootprintAtPoint(
    features: readonly ContextBuildingFeature[],
    lon: number,
    lat: number,
): ParcelFeature | null {
    for (const f of features) {
        const outer = f?.geometry?.coordinates?.[0];
        if (!Array.isArray(outer) || outer.length < 3) continue;
        if (!ringContainsLonLat(outer, lon, lat)) continue;
        const ring = toLatLonRing(outer);
        if (ring.length < 3) continue;
        const osmId = f.properties?.osmId;

        // §L-640: pure geometry diagnostics + confidence. kind:'footprint-fallback' guarantees
        // match:'low' unconditionally — no numeric threshold, no categorical override possible.
        const metrics = computeParcelMetrics(ring);
        const confidence = computeParcelConfidence({
            ring,
            kind: 'footprint-fallback',
            areaOfficialM2: null,          // OSM footprints have no registry-declared area
            areaSigM2: metrics.areaSigM2,
            pointToParcelM: null,          // click-inside already confirmed above; not applicable
            candidateMarginM: null,        // single footprint; no candidate ranking
        });

        return {
            ring,
            refcat: typeof osmId === 'number' && Number.isFinite(osmId) ? `OSM ${osmId}` : 'OSM footprint',
            areaM2: ringAreaM2LonLat(outer),
            address: null,
            source: 'footprint (OSM)',
            metrics,
            confidence,
        };
    }
    return null;
}
