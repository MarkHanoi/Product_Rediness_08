// C58 §1.5 / ADR-0271 — the Barcelona (metropolitan) jurisdiction test (bbox).
//
// PURE + tiny: a WGS84 point-in-metropolitan-bbox test used to pick the Barcelona
// ensanche path (MUC clau + Catastro block → `ES_BARCELONA_ENSANCHE_PACK`) vs the
// estimated default (C58 §1.5 — jurisdiction selection lives in adapters/data, never
// in the engine). Mirrors `isInDenmark`: a loose gate that short-circuits a plot
// outside the metro area before any proxy round-trip. It is deliberately COARSE — the
// real applicability decision is made downstream by the MUC clau lookup (a 13b or a
// non-Eixample parcel inside this box still falls back to estimated), so this box only
// needs to keep the whole of Barcelona + its metropolitan neighbours in.
//
// ⚠ This is a proximity gate, NOT a claim of jurisdiction. It never authorises a
// number on its own — the clau lookup + the block source do that.

/** Loose bounding box for Barcelona and its metropolitan area (AMB). */
export const BARCELONA_BBOX = {
    minLat: 41.2,
    maxLat: 41.6,
    minLon: 1.9,
    maxLon: 2.4,
} as const;

/** True when a WGS84 point falls within the loose Barcelona metropolitan bounding box. */
export function isInBarcelona(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= BARCELONA_BBOX.minLat &&
        lat <= BARCELONA_BBOX.maxLat &&
        lon >= BARCELONA_BBOX.minLon &&
        lon <= BARCELONA_BBOX.maxLon
    );
}
