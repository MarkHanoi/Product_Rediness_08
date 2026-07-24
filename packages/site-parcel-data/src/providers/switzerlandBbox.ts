// SWITZERLAND (national) — the jurisdiction test (bbox). C58 §1.5.
//
// PURE + tiny: a WGS84 point-in-national-bbox test used to route a plot to the Swiss
// zone-ID path vs the estimated default (C58 §1.5 — jurisdiction selection lives in
// adapters/data, never in the engine). Mirrors `denmarkBbox.ts` / `madridBbox.ts`.
//
// ⚠ A bbox is a COARSE proximity gate, NEVER an authorisation (the same caveat
// `barcelonaBbox.ts` / `madridBbox.ts` carry). It loosely bounds the Swiss Confederation
// (plus a sliver of Liechtenstein — the national Nutzungsplanung WFS also serves FL) so a
// plot far outside short-circuits without a pointless proxy round-trip. The real answer —
// which zone governs — is established at the parcel step by `resolveChZone`, not here.
//
// Extent derived from the swisstopo swissBUILDINGS3D 3.0 STAC bbox `[5.22,45.32,11.26,48.24]`
// (CH + FL; SWITZERLAND-DATA-RECON-SPIKE.md §3.2), tightened to the mainland term.

/** Loose national bounding box for the Swiss Confederation (+ Liechtenstein). */
export const SWITZERLAND_BBOX = {
    minLat: 45.75,
    maxLat: 47.85,
    minLon: 5.9,
    maxLon: 10.55,
} as const;

/** True when a WGS84 point falls within the loose Switzerland bounding box. Never throws. */
export function isInSwitzerland(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= SWITZERLAND_BBOX.minLat &&
        lat <= SWITZERLAND_BBOX.maxLat &&
        lon >= SWITZERLAND_BBOX.minLon &&
        lon <= SWITZERLAND_BBOX.maxLon
    );
}
