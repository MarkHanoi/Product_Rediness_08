// C58 §1.5 — the Murcia (INE 30030) jurisdiction test (bbox).
//
// PURE + tiny: a WGS84 point-in-municipal-bbox test used to route a plot to the Murcia
// refusal path (C58 §1.5 — jurisdiction selection lives in adapters/data, never in the
// engine). Mirrors `madridBbox.ts` / `cordobaBbox.ts` / `barcelonaBbox.ts`.
//
// ⚠ A bbox is a COARSE proximity gate, NEVER an authorisation (the same caveat
// `barcelonaBbox.ts` carries). The real answer — which ordinance governs, and whether a
// buildable envelope can be computed at all — is established at the parcel step.
//
// ⚠⚠ AND IT IS NOT THE MUNICIPALITY TEST OF RECORD. Murcia's municipal term is large and
// irregular (it contains 50-odd *pedanías*), so this box necessarily includes land in
// neighbouring municipalities. The AUTHORITATIVE municipality answer comes from Catastro
// itself: the OVC reverse-geocode returns `<cp>` (province) + `<cm>` (municipality within
// the province), which compose to the INE code — `30` + `030` = **30030**. Route from that
// where it is available; use this box only as the cheap pre-filter that avoids a pointless
// round trip.
//
// ⚠⚠⚠ WHY ROUTING MUST COME FROM THE DATA AND NEVER FROM A NAME OR A CALLER-SUPPLIED
// COUNTRY: a competitor screening report on a Murcia parcel (reviewed 2026-07-31) applied
// the PORTUGUESE tax model — IMT, Imposto do Selo, IVA 23 % — to a Spanish property, and
// shipped. Separately, "Murcia" is also an administrative town in Negros Occidental, the
// Philippines (OSM relation 11366415). A name is not a jurisdiction.
//
// PROVENANCE OF THE NUMBERS: the extent of OSM relation 340611 (`administrative`, the
// municipal term of Murcia), read 2026-07-31, rounded OUTWARD to whole hundredths so the
// gate can only ever be too generous, never too tight. A too-generous coarse gate costs one
// wasted round trip; a too-tight one silently drops a real Murcia parcel.

/** Loose bounding box for the municipal term of Murcia (centre ≈ 37.9922 N, 1.1307 W). */
export const MURCIA_BBOX = {
    minLat: 37.71,
    maxLat: 38.12,
    minLon: -1.39,
    maxLon: -0.85,
} as const;

/** True when a WGS84 point falls within the loose Murcia bounding box. */
export function isInMurcia(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= MURCIA_BBOX.minLat &&
        lat <= MURCIA_BBOX.maxLat &&
        lon >= MURCIA_BBOX.minLon &&
        lon <= MURCIA_BBOX.maxLon
    );
}

/** The INE code for the municipality of Murcia — the authoritative routing key. */
export const MURCIA_INE_CODE = '30030';

/**
 * Compose the 5-digit INE municipality code from the Catastro OVC reverse-geocode's
 * `<cp>` (province) and `<cm>` (municipality WITHIN that province).
 *
 * ⚠ `<cm>` is NOT the last three digits of the INE code in general — it is the index
 * within the province, and the INE code is `province(2) || municipality(3)`. Murcia
 * returns `<cp>30</cp><cm>30</cm>`, which composes to `30030`, NOT `3030`.
 *
 * Returns null rather than guessing when either part is absent or malformed. An UNKNOWN
 * municipality must never be coerced into a default (L-616).
 */
export function composeIneCode(
    provinceCode: string | null | undefined,
    municipalityCode: string | null | undefined,
): string | null {
    if (!provinceCode || !municipalityCode) return null;
    const p = provinceCode.trim().padStart(2, '0');
    const m = municipalityCode.trim().padStart(3, '0');
    if (!/^\d{2}$/.test(p) || !/^\d{3}$/.test(m)) return null;
    return `${p}${m}`;
}
