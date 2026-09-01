// E7-LU — LUXEMBOURG (LU) · the routing predicate + bbox.
//
// Shape copied from `ee/eeJurisdiction.ts` (the declared exemplar) — copied, never imported
// across country directories (E7-FAMILY §6 A).
//
// ⛔ DATED OVERLAP AUDIT, 2026-09-01 — AND IT IS THE REASON THIS BOX IS **NOT REGISTERED**.
// Measured against every box in `parcelProviders/countryBbox.ts` + the regional provider boxes
// `registry.ts` imports (read 2026-09-01):
//
//   FRANCE_BBOX  41.3–51.2 N / −5.3–8.3 E   → LUXEMBOURG_BBOX lies **ENTIRELY INSIDE IT**.
//   GERMANY_BBOX 47.2–55.1 N / 5.8–15.1 E   → overlaps LU across 5.80–6.53 E, the whole
//                                             eastern two-thirds of the country (Trier side).
//   WALLONIA/BE boxes                       → share LU's western and northern approaches.
//   NRW_BBOX     50.3–52.6 N                → NO overlap (LU maxLat 50.19 < 50.3).
//   NETHERLANDS_BBOX 50.7–53.7 N            → NO overlap (LU maxLat 50.19 < 50.7).
//
// The smallest-box specificity resolver WOULD pick LU over FR/DE on area (LU ≈ 0.60 deg² vs
// FR ≈ 133 deg², DE ≈ 74 deg²) — but **L-12871 is OPEN**: three country bboxes already overlap
// (LT/PL/DE) and each adapter "documented the problem away" instead of establishing precedence.
// This lane does NOT add a fourth documented-away overlap and does NOT register a parcel
// provider. The registration line and this audit are queued for the orchestrator in
// `audit/europe-site-intel/2026-08-31/impl/barrel-additions-lu.txt`; registration waits for
// precedence DATA, not for another comment (E7-FAMILY §6 D).

interface Bbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/**
 * Luxembourg, whole state (Troisvierges north ≈ 50.18°N; Schengen south ≈ 49.45°N;
 * Rodange west ≈ 5.73°E; Echternach east ≈ 6.53°E). Coarse rectangle — a proximity gate
 * that only decides WHICH national source to try; the source's own `absent` is the real
 * "nothing here" answer.
 *
 * ⚠ CROSS-CHECK, not a guess: the national PAG GeoPackage's own `gpkg_contents` envelope for
 * `PAG_PAG_FOND_DE_PLAN` (653,315 parcels, read 2026-09-01) is LUREF/EPSG:2169
 * 48,930.2–106,113.8 E / 57,015.3–138,756.9 N, which is the whole state — so this box is
 * bounded by the served data, not by a map reading.
 */
export const LUXEMBOURG_BBOX: Bbox = { minLat: 49.44, maxLat: 50.19, minLon: 5.72, maxLon: 6.54 };

/** True when a WGS84 point should route to the Luxembourg national sources. Pure; never throws. */
export function isInLuxembourg(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= LUXEMBOURG_BBOX.minLat &&
        lat <= LUXEMBOURG_BBOX.maxLat &&
        lon >= LUXEMBOURG_BBOX.minLon &&
        lon <= LUXEMBOURG_BBOX.maxLon
    );
}

/** The CRS every LU PAG geometry is served in — LUREF / Luxembourg TM. Never reprojected here. */
export const LU_NATIVE_CRS = 'EPSG:2169';
