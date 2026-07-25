// SWITZERLAND / canton Zürich — the CITY-of-Zürich jurisdiction test (bbox). C58 §1.5.
//
// PURE + tiny: a WGS84 point-in-municipal-bbox test used to route a plot to the finer-grained
// Stadt Zürich BZO zone-ID path (`resolveZurichBzoZone`) in preference to the national Grundnutzung
// path (`resolveChZone`). Mirrors `madridBbox.ts` / `switzerlandBbox.ts` exactly.
//
// ⚠ A bbox is a COARSE proximity gate, NEVER an authorisation (the same caveat every sibling bbox
// carries). It loosely bounds the municipal term of the CITY of Zürich (BFS-Nr 261 — the reference
// commune, the Swiss analogue of Barcelona) so a plot elsewhere in the canton/country short-circuits
// to the national path without a pointless city-WFS round-trip. The real answer — which BZO zone
// governs — is established at the parcel step by `resolveZurichBzoZone`, not here.
//
// Extent: the City of Zürich municipal envelope (probe reference point 47.377, 8.540 — Zürich HB),
// loosely bounded lat 47.31–47.44 / lon 8.44–8.63. Kept deliberately loose (the WFS is authoritative
// on containment); a point just outside simply falls to the national Grundnutzung path, never a guess.

/** Loose bounding box for the municipal term of the City of Zürich (BFS-Nr 261). */
export const ZURICH_CITY_BBOX = {
    minLat: 47.31,
    maxLat: 47.44,
    minLon: 8.44,
    maxLon: 8.63,
} as const;

/** True when a WGS84 point falls within the loose City-of-Zürich bounding box. Never throws. */
export function isInZurichCity(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= ZURICH_CITY_BBOX.minLat &&
        lat <= ZURICH_CITY_BBOX.maxLat &&
        lon >= ZURICH_CITY_BBOX.minLon &&
        lon <= ZURICH_CITY_BBOX.maxLon
    );
}
