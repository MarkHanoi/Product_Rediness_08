// E6-LT — LITHUANIA (LT) · the routing predicate + bbox, mirroring the EE exemplar
// (`countryAdapters/ee/eeJurisdiction.ts`): a coarse WGS84 rectangle that only decides WHICH
// national cadastre to try. The service's own `absent` is the real "no parcel here" answer —
// this box never asserts coverage.
//
// Overlap audit (the registry rule — check before registering): no registered bbox in
// `packages/site-parcel-data/src/providers/*Bbox.ts` intersects Lithuania (grep 2026-09-01:
// DENMARK, MADRID, BARCELONA + the ES/SA municipal boxes, plus ESTONIA_BBOX whose minLat is
// 57.5 — Lithuania's maxLat is 56.5, so EE and LT do not touch). Latvia and Poland are
// unregistered, so no manual precedence is needed for LT today.
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
