// C58 §1.5 — the Illes Balears (province INE 07) jurisdiction test (bbox), and the ONE place the
// MUIB municipal key is converted to and from the national INE code.
//
// ⚠ A bbox is a COARSE proximity gate, NEVER an authorisation (the caveat `barcelonaBbox.ts` and
// `murciaBbox.ts` both carry). The real answer — which zone governs, and whether a buildable
// envelope may be published at all — is established at the parcel step, and the publication
// question is `envelopeAuthorisation.ts`'s alone.
//
// PROVENANCE OF THE NUMBERS — NOT GUESSED AND NOT COPIED FROM A GAZETTEER. They are the extent of
// the MUIB `CLASSIFICACIO` layer itself (`GOIB_MUIB/MapServer/12`, `returnExtentOnly` in EPSG:4326,
// read live 2026-08-02):
//
//     xmin 1.127507  ymin 38.637107  xmax 4.332175  ymax 40.099572
//
// i.e. the box is the extent of the very dataset the provider queries, rounded OUTWARD to whole
// hundredths so the gate can only ever be too generous, never too tight. A too-generous coarse gate
// costs one wasted round trip; a too-tight one silently drops a real Balears parcel. Deriving it
// from the SOURCE rather than from an atlas is what makes "inside the box" and "the service has
// something to say here" the same claim.
//
// ⚠ THE BOX SPANS FOUR ISLANDS AND THEREFORE COVERS OPEN SEA. That is intentional and harmless: the
// spatial query at the point returns zero features over water, which the resolver reports as a
// genuine `no-zoning-here`, not as a failure.

/**
 * Loose bounding box for the autonomous community of the Illes Balears (Mallorca, Menorca, Eivissa,
 * Formentera). Derived from the MUIB CLASSIFICACIO extent — see the header.
 */
export const BALEARS_BBOX = {
    minLat: 38.63,
    maxLat: 40.1,
    minLon: 1.12,
    maxLon: 4.34,
} as const;

/** True when a WGS84 point falls within the loose Illes Balears bounding box. */
export function isInBalears(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= BALEARS_BBOX.minLat &&
        lat <= BALEARS_BBOX.maxLat &&
        lon >= BALEARS_BBOX.minLon &&
        lon <= BALEARS_BBOX.maxLon
    );
}

/** INE province code for the Illes Balears. The prefix MUIB strips from its own municipal key. */
export const BALEARS_INE_PROVINCE = '07' as const;

/**
 * ⭐ THE KEY THAT COST THE PROBE A DAY, ENCODED ONCE SO NOBODY PAYS FOR IT AGAIN.
 *
 * MUIB's `CODIMUNI` is the INE-5 municipality code **with the `07` province prefix STRIPPED** — a
 * bare three-digit string. Measured on the live service:
 *
 *     CODIMUNI = '07040'  →  0 features, on a CLEAN HTTP 200
 *     CODIMUNI = '040'    →  9,442 features
 *
 * ⛔ AND THE ZERO IS THE DANGEROUS HALF. A wrong municipal key does not error on this backend; it
 * returns an empty set indistinguishable from "this municipality publishes no zoning", which is the
 * §CONTEXT-DATA-HONESTY collapse (failure and absence sharing one VALUE) arriving through the query
 * string instead of through the response. Converting in ONE typed place is the only defence.
 *
 * ⛔ `CODIAJ` IS NOT A MUNICIPALITY CODE and must never be used as one. It is the MUNICIPAL ZONE
 * LABEL — the ajuntament's own name for the zone (`RE-NA`, `EU-1`, …) — and Palma alone publishes
 * 706 distinct values of it.
 *
 * Returns null rather than guessing when the input is not an INE code in province 07. An UNKNOWN
 * municipality must never be coerced into a default (L-616).
 */
export function balearsCodiMuniFromIne(ineCode: string | null | undefined): string | null {
    if (typeof ineCode !== 'string') return null;
    const t = ineCode.trim();
    if (!/^\d{5}$/.test(t)) return null;
    if (!t.startsWith(BALEARS_INE_PROVINCE)) return null;
    return t.slice(2);
}

/**
 * The inverse: MUIB `CODIMUNI` (3 digits) → the national INE-5 code, by re-attaching `07`.
 *
 * Returns null for anything that is not exactly three digits — notably for a `CODIAJ` value, which
 * is a zone label and would otherwise compose into a plausible-looking but fictional INE code.
 */
export function balearsIneFromCodiMuni(codiMuni: string | null | undefined): string | null {
    if (typeof codiMuni !== 'string') return null;
    const t = codiMuni.trim();
    if (!/^\d{3}$/.test(t)) return null;
    return `${BALEARS_INE_PROVINCE}${t}`;
}
