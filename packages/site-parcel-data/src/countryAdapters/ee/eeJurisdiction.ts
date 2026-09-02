// E1d — ESTONIA (EE) · the routing predicate + bbox for the parcel-provider registry
// (the L-613 framework routes on WGS84 point-in-bbox + smallest-box specificity).
//
// ⛔ OVERLAP AUDIT — CORRECTED 2026-09-01 (L-12871). This block used to end: "no registered box
// overlaps EE's interior (Latvia is unregistered). Area ≈ 14.3 deg² — the specificity resolver
// needs no manual precedence for EE." Both halves are false, and the reassurance is what hid it.
// Deleted, not amended.
//
// MEASURED (all 25 routing boxes, 300 pairs):
//   • NORWAY_BBOX {57.8–71.4, 4.4–31.3} COVERS ESTONIA_BBOX ENTIRELY — Tallinn is inside the
//     Norwegian routing box, and NO is already a LIVE registered cadastral row (`geonorge-no`).
//     "No registered box overlaps EE's interior" was wrong on the day it was written.
//   • SWEDEN_BBOX ∩ ESTONIA_BBOX = lat[57.5, 59.7] × lon[21.7, 24.2] (Kuressaare is inside both).
//   • FINLAND_BBOX touches only at the 59.7°N edge — that part of the old audit stands.
//
// ⭐ Area does not decide sovereignty. Precedence is `jurisdiction/nationalJurisdictionResolver.ts`,
// which uses this predicate ONLY as a candidate pre-filter and then decides on real boundary
// geometry, naming its basis or refusing. ⛔ Do not route on `isInEstonia` alone.

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
