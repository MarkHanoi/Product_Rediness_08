// C58 §1.5 — the Paris (INSEE 75056, Ville de Paris) jurisdiction gate (bbox).
//
// PURE + tiny: a WGS84 point-in-municipal-bbox test used to route a plot to the Paris PLU
// bioclimatique path vs the estimated default (C58 §1.5 — jurisdiction selection lives in
// adapters/data, never in the engine). Mirrors `madridBbox.ts` / `barcelonaBbox.ts`.
//
// ⚠ A bbox is a COARSE proximity gate, NEVER an authorisation (the caveat every sibling bbox
// carries): it loosely bounds the municipal term of the Ville de Paris (the 20 arrondissements
// intra-muros, plus the Bois de Boulogne / Vincennes) so a plot far outside short-circuits
// without a pointless proxy round-trip. The real answer — which PLU zone governs, and whether a
// height plafond is published for it — is established at the parcel step by `resolveParisPluZone`,
// never here. Deliberately tight to the commune: neighbouring communes have their OWN PLU document
// (a different `idurba`), so routing them to the Paris pack would cite the wrong règlement.

/** Loose bounding box for the municipal term of the Ville de Paris (centre ≈ 48.8566 N, 2.3522 E). */
export const PARIS_BBOX = {
    minLat: 48.80,
    maxLat: 48.91,
    minLon: 2.22,
    maxLon: 2.47,
} as const;

/** True when a WGS84 point falls within the loose Ville-de-Paris bounding box. */
export function isInParis(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= PARIS_BBOX.minLat &&
        lat <= PARIS_BBOX.maxLat &&
        lon >= PARIS_BBOX.minLon &&
        lon <= PARIS_BBOX.maxLon
    );
}
