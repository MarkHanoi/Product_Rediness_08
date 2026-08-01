// C58 §1.5 — the València (INE 46250) jurisdiction test (bbox).
//
// PURE + tiny: a WGS84 point-in-municipal-bbox test used to route a plot to the València
// refusal path (C58 §1.5 — jurisdiction selection lives in adapters/data, never in the
// engine). Mirrors `murciaBbox.ts` / `madridBbox.ts` / `cordobaBbox.ts` / `barcelonaBbox.ts`.
//
// ⚠ A bbox is a COARSE proximity gate, NEVER an authorisation (the same caveat every sibling
// module carries). The real answer — which ordinance governs, and whether a buildable envelope
// can be computed at all — is established at the parcel step. For València the answer today is
// a cited refusal for EVERY parcel (`esValenciaEnvelope.ts`).
//
// ⚠⚠ AND IT IS NOT THE MUNICIPALITY TEST OF RECORD. València's term is wrapped by the dense
// l'Horta ring — Mislata, Paterna, Burjassot, Alboraia, Tavernes Blanques, Xirivella, Quart de
// Poblet, Sedaví, Alfafar, Benetússer — every one of which falls INSIDE this box while being a
// DIFFERENT municipality with a DIFFERENT general plan. The box also spans the Albufera
// panhandle down to El Perellonet, which drags in more of the Ribera.
//
// The AUTHORITATIVE municipality answer comes from Catastro itself: the OVC reverse-geocode
// returns `<cp>` (province) + `<cm>` (municipality within the province), which compose to the
// INE code. MEASURED live 2026-08-01 at lon −0,3670 / lat 39,4640 (CL ALMIRANTE CADARSO 33):
// `<cp>46</cp><cm>250</cm>` → **46250**, via the EXISTING `composeIneCode()` in `murciaBbox.ts`,
// unmodified. Route from that where it is available; use this box only as the cheap pre-filter
// that avoids a pointless round trip.
//
// ⚠⚠⚠ WHY ROUTING MUST COME FROM THE DATA AND NEVER FROM A NAME. "Valencia" is:
//   • a CITY of ~1,6 M in Carabobo, **Venezuela**;
//   • **Valencia de Alcántara**, Cáceres, Spain — at latitude 39,41 °N, which is INSIDE this
//     box's latitude band and is excluded only by longitude. A latitude-only or name-only test
//     would route a Cáceres parcel to the València PGOU;
//   • a municipality in Bukidnon, **the Philippines**;
//   • **the PROVINCE and the AUTONOMOUS COMMUNITY** — `46` is the province of València and the
//     Comunitat Valenciana has 266 municipalities. `es-vc` is not `46250`.
// A competitor screening report on a Murcia parcel (reviewed 2026-07-31) applied the PORTUGUESE
// tax model to a Spanish property and shipped. A NAME IS NOT A JURISDICTION.
//
// PROVENANCE OF THE NUMBERS: the extent of the municipal term of València, rounded OUTWARD to
// whole hundredths so the gate can only ever be too generous, never too tight. A too-generous
// coarse gate costs one wasted round trip; a too-tight one silently drops a real València
// parcel. ⚠ These bounds are an EXTENT, not a boundary — see the l'Horta caveat above.

/**
 * Loose bounding box for the municipal term of València (centre ≈ 39,4699 N, 0,3763 W).
 *
 * The southern bound reaches the Albufera / El Perellonet panhandle, which is why the box is
 * much taller than the built-up city.
 */
export const VALENCIA_BBOX = {
    minLat: 39.25,
    maxLat: 39.57,
    minLon: -0.46,
    maxLon: -0.26,
} as const;

/** True when a WGS84 point falls within the loose València bounding box. */
export function isInValencia(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= VALENCIA_BBOX.minLat &&
        lat <= VALENCIA_BBOX.maxLat &&
        lon >= VALENCIA_BBOX.minLon &&
        lon <= VALENCIA_BBOX.maxLon
    );
}

/**
 * The INE code for the municipality of València — the authoritative routing key.
 *
 * ⚠ Composed live from Catastro as `<cp>46</cp>` + `<cm>250</cm>`. Note that `<cm>` is already
 * three digits here (unlike Murcia's `<cm>30</cm>`, which needs zero-padding to `030`), which is
 * exactly why `composeIneCode()` pads rather than concatenating raw — see its own doc comment.
 */
export const VALENCIA_INE_CODE = '46250';

/**
 * ⚠ NOT re-exported and NOT re-implemented: `composeIneCode()` lives in `murciaBbox.ts` and is
 * NATIONAL, not Murcian. It is named here only so a reader looking for València's INE
 * composition finds the one implementation instead of writing a second.
 *
 * A duplicated composer is how `3030` (concatenating `<cp>30</cp><cm>30</cm>` raw) gets shipped
 * for one city and `46250` for another.
 */
export const VALENCIA_INE_COMPOSER = 'composeIneCode (providers/murciaBbox.ts)' as const;