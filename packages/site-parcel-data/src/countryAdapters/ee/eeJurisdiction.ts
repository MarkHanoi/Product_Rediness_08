// E1d — ESTONIA (EE) · the routing predicate + bbox for the parcel-provider registry
// (the L-613 framework routes on WGS84 point-in-bbox + smallest-box specificity).
//
// Overlap audit (registry rule — check before registering): ESTONIA_BBOX touches
// FINLAND_BBOX only at the 59.7°N shared edge (Tallinn 59.44°N is well inside EE; Helsinki
// 60.17°N is inside FI); no registered box overlaps EE's interior (Latvia is unregistered).
// Area ≈ 14.3 deg² — the specificity resolver needs no manual precedence for EE.

interface Bbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/**
 * Estonia (mainland + islands: Saaremaa/Hiiumaa west edge ≈ 21.75°E; Narva east ≈ 28.21°E;
 * Valga south ≈ 57.51°N; Baltic-coast north ≈ 59.7°N). Coarse rectangle — a proximity gate
 * that only decides WHICH cadastre to try; the WFS's own `absent` is the real
 * "no parcel here" answer.
 */
export const ESTONIA_BBOX: Bbox = { minLat: 57.5, maxLat: 59.7, minLon: 21.7, maxLon: 28.25 };

/** True when a WGS84 point should route to the Estonian national services. Pure; never throws. */
export function isInEstonia(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= ESTONIA_BBOX.minLat &&
        lat <= ESTONIA_BBOX.maxLat &&
        lon >= ESTONIA_BBOX.minLon &&
        lon <= ESTONIA_BBOX.maxLon
    );
}
