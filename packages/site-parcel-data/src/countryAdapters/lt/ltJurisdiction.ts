// E6-LT — LITHUANIA (LT) · the routing predicate + bbox, mirroring the EE exemplar
// (`countryAdapters/ee/eeJurisdiction.ts`): a coarse WGS84 rectangle that only decides WHICH
// national cadastre to try. The service's own `absent` is the real "no parcel here" answer —
// this box never asserts coverage.
//
// ⛔ OVERLAP AUDIT — CORRECTED 2026-09-01 (L-12871). This block used to end: "Latvia and Poland
// are unregistered, so no manual precedence is needed for LT today." That sentence was true when
// it was written and FALSE the moment Poland landed in the same wave, and the reassurance is what
// made the defect invisible. It is deleted rather than amended.
//
// MEASURED, over all 25 routing boxes in this package (300 pairs → 42 interior overlaps,
// 23 of them national × national):
//   • LITHUANIA_BBOX ∩ POLAND_BBOX = lat[53.85, 54.84] × lon[20.9, 24.15]. Suwałki
//     (54.1017, 22.9308) and Sejny (54.1069, 23.3489) are POLISH and satisfy `isInLithuania`;
//     Marijampolė (54.5589, 23.3542) is LITHUANIAN and satisfies `isInPoland`.
//     LITHUANIA_BBOX (15.9 deg²) is the SMALLER box, so smallest-box specificity hands both
//     Polish towns to Lithuania.
//   • LITHUANIA_BBOX ∩ SWEDEN_BBOX = lat[55.3, 56.5] × lon[20.9, 24.2] (Klaipėda is inside both).
//
// ⭐ PRECEDENCE IS NO LONGER THIS FILE'S PROBLEM, AND IT IS NO LONGER A COMMENT. The answer is
// `jurisdiction/nationalJurisdictionResolver.ts`, which uses this predicate ONLY as a candidate
// pre-filter and then decides on real boundary geometry, naming its basis or refusing.
// ⛔ Do not route on `isInLithuania` alone.
//
// ⚠ THIS MODULE DOES NOT REGISTER ITSELF. `parcelProviders/registry.ts` is a SHARED file and
// this lane may not edit it (barrel protocol); the registration line is queued for the
// orchestrator in audit/europe-site-intel/2026-08-31/impl/barrel-additions-lt.txt.

interface Bbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/**
 * Lithuania — mainland plus the Curonian Spit (west edge ≈ 20.94°E at Nida/Klaipėda),
 * east ≈ 26.84°E (Šalčininkai/Ignalina), south ≈ 53.89°N, north ≈ 56.45°N (Latvian border).
 * A coarse rectangle; it deliberately includes a sliver of neighbouring territory rather than
 * clipping real Lithuanian land.
 */
export const LITHUANIA_BBOX: Bbox = { minLat: 53.85, maxLat: 56.5, minLon: 20.9, maxLon: 26.9 };

/** True when a WGS84 point should route to the Lithuanian national services. Pure; never throws. */
export function isInLithuania(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= LITHUANIA_BBOX.minLat &&
        lat <= LITHUANIA_BBOX.maxLat &&
        lon >= LITHUANIA_BBOX.minLon &&
        lon <= LITHUANIA_BBOX.maxLon
    );
}
