// C58 §1.5 / L-608 — the Madrid (INE 28079) jurisdiction test (bbox).
//
// PURE + tiny: a WGS84 point-in-municipal-bbox test used to route a plot to the Madrid
// explicit-area path vs the estimated default (C58 §1.5 — jurisdiction selection lives in
// adapters/data, never in the engine). Mirrors `denmarkBbox.ts` / `barcelonaBbox.ts`.
//
// ⚠ A bbox is a COARSE proximity gate, NEVER an authorisation (the same caveat
// `barcelonaBbox.ts` carries): it loosely bounds the municipal term of Madrid so a plot
// far outside short-circuits without a pointless proxy round-trip. The real answer — which
// Norma Zonal governs, whether a buildable footprint is published for the manzana — is
// established at the parcel step by the provider + the engine, not here.

/** Loose bounding box for the municipal term of Madrid (centre ≈ 40.4168 N, 3.7038 W). */
export const MADRID_BBOX = {
    minLat: 40.31,
    maxLat: 40.65,
    minLon: -3.9,
    maxLon: -3.51,
} as const;

/** True when a WGS84 point falls within the loose Madrid bounding box. */
export function isInMadrid(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= MADRID_BBOX.minLat &&
        lat <= MADRID_BBOX.maxLat &&
        lon >= MADRID_BBOX.minLon &&
        lon <= MADRID_BBOX.maxLon
    );
}
