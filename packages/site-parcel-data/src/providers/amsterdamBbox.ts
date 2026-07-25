// C58 §1.5 / L-609 — the Amsterdam (CBS/BAG gemeente 0363) jurisdiction test (bbox).
//
// PURE + tiny: a WGS84 point-in-municipal-bbox test used to route a plot to the Amsterdam
// bestemmingsplan explicit-area path vs the estimated default (C58 §1.5 — jurisdiction selection
// lives in adapters/data, never in the engine). Mirrors `madridBbox.ts` / `barcelonaBbox.ts`.
//
// ⚠ A bbox is a COARSE proximity gate, NEVER an authorisation (the same caveat `madridBbox.ts`
// carries): it loosely bounds the municipal term of Amsterdam so a plot far outside short-circuits
// without a pointless proxy round-trip. The real answer — which bestemmingsplan governs, whether a
// bouwvlak + maatvoering is published for the parcel — is established at the parcel step by the
// provider + the engine, not here.

/** Loose bounding box for the municipal term of Amsterdam (centre ≈ 52.3676 N, 4.9041 E). */
export const AMSTERDAM_BBOX = {
    minLat: 52.27,
    maxLat: 52.44,
    minLon: 4.72,
    maxLon: 5.08,
} as const;

/** True when a WGS84 point falls within the loose Amsterdam bounding box. Never throws. */
export function isInAmsterdam(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= AMSTERDAM_BBOX.minLat &&
        lat <= AMSTERDAM_BBOX.maxLat &&
        lon >= AMSTERDAM_BBOX.minLon &&
        lon <= AMSTERDAM_BBOX.maxLon
    );
}
