// §COMUNIDAD-MADRID-EXTENT (L-681) — the REGIONAL routing gate for the Comunidad de Madrid.
//
// WHY A REGIONAL GATE EXISTS ALONGSIDE THE MUNICIPAL ONE
// ------------------------------------------------------
// `madridBbox.ts` gates the CAPITAL (INE 28079) and nothing else. The Comunidad de Madrid has
// **179 municipalities**, and the other 178 are served by a DIFFERENT publisher, a DIFFERENT
// corpus and a DIFFERENT failure mode: the regional `sitcm:VPLA_V_*` layers on
// `idem.comunidad.madrid`, which carry the ordinance parameters the capital's own service does not
// publish at all (measured: 24,718 municipal fields swept on `sigma.madrid.es`, `depth: 0`,
// `setback: 0`). Routing a Boadilla, Majadahonda or Moralzarzal click through the capital's
// registration would cite PGOUM-97 at land PGOUM-97 does not govern.
//
// ⚠ THE TWO MUST NOT BE MERGED. Under §JURISDICTION-SPECIFICITY the capital's `'municipal'` claim
// out-ranks this `'regional'` one automatically, so registering this box does not touch a single
// Madrid-capital parcel. That is the whole reason the ladder exists (`registry.ts`).
//
// ⚠ A bbox is a COARSE proximity gate, NEVER an authorisation — the standing caveat every
// `*Bbox.ts` in this directory carries. The real answer is established at the parcel step, and for
// Spain there is a SECOND, EXACT gate that runs there: `isComunidadMadridIneCode()` below, applied
// to the INE code Catastro itself returns. A rectangle decides whether to ASK; the INE code decides
// whether PRYZM may CITE Comunidad de Madrid law. See §COMUNIDAD-MADRID-SPILL.
//
// PROVENANCE OF THE NUMBERS — not hand-drawn, and not from a map.
// ---------------------------------------------------------------
// These are the publisher's OWN declared WGS84 extent for `sitcm:VPLA_V_ORDENANZA` — the ordinance
// layer this jurisdiction's entire answer is read from — taken verbatim from
// `https://idem.comunidad.madrid/geoserver3/wfs?service=WFS&version=2.0.0&request=GetCapabilities`
// on 2026-08-02:
//
//     <ows:WGS84BoundingBox>
//       <ows:LowerCorner>-4.515008308799457 40.01090981509997</ows:LowerCorner>
//       <ows:UpperCorner>-3.1006030276451457 41.15166310027831</ows:UpperCorner>
//     </ows:WGS84BoundingBox>
//
// rounded OUTWARD to whole hundredths of a degree, so the gate can only ever be too generous and
// never too tight — the same construction and the same reasoning as `catalunyaBbox.ts`. A
// too-generous coarse gate costs one wasted round trip; a too-tight one silently drops real land,
// which is the failure that cannot be seen.
//
// ⚠ P8 / OTel — NO SPANS HERE, MATCHING EVERY OTHER `*Bbox.ts` IN THIS DIRECTORY
// (`madridBbox.ts`, `catalunyaBbox.ts`, `murciaBbox.ts`, …). These are rectangle-containment
// predicates that `resolveJurisdictionClaim()` invokes ONCE PER REGISTRATION on every claim
// resolution; instrumenting them would emit a span per registration per click and report only
// "a rectangle was tested". The decisions worth tracing are one layer up, in `registry.ts`
// (`pryzm.zoning.resolveJurisdictionClaim`), which is already spanned and which names the winner.
//
// ⛔ NOT INVENTED, AND NOT AN ADMINISTRATIVE BOUNDARY EITHER. This is the extent of the DATASET,
// which is what the routing question is actually about ("might the ordinance layer answer here?").
// PRYZM holds no Comunidad de Madrid boundary polygon, and drawing one would be the fabrication
// this subsystem exists to refuse.

/**
 * §COMUNIDAD-MADRID-SPILL — WHAT THIS RECTANGLE OVER-CLAIMS, STATED RATHER THAN DISCOVERED LATER.
 *
 * `registry.ts` §EXTENT-SPILLS-A-BORDER already records that a rectangle cannot follow a border,
 * and this one is no exception: the Comunidad de Madrid is a rough diamond, so its bounding box
 * also covers parts of **Toledo** (INE 45xxx), **Guadalajara** (19xxx), **Segovia** (40xxx),
 * **Ávila** (05xxx) and **Cuenca** (16xxx) — four of them in a different autonomous community with
 * a different planning law. Under the §JURISDICTION-SPECIFICITY ladder a `'regional'` claim would
 * answer all of them with a Comunidad de Madrid citation.
 *
 * ⚠ AND, EXACTLY AS IN CATALONIA, THE CITATION HALF IS CLOSED — not by a finer rectangle but by
 * moving the decisive test off geometry. Spain's INE municipality code is `province(2) ||
 * municipality(3)`, and the Comunidad de Madrid is UNIPROVINCIAL: province **28**, and only 28.
 * Catastro returns that code for every Spanish parcel, so at the parcel step PRYZM knows EXACTLY
 * whether it is in the Comunidad de Madrid. `comunidadMadridNoRulePackRefusal()` REFUSES TO PRODUCE
 * a Comunidad de Madrid refusal for a non-28 INE code rather than mis-cite.
 *
 * ⇒ The rectangle may over-claim on the coverage globe (C60 §2, which states its own resolution);
 * the CITATION cannot. Those are different promises and only the second is a legal claim.
 */
export const COMUNIDAD_MADRID_BBOX = {
    minLat: 40.01,
    maxLat: 41.16,
    minLon: -4.52,
    maxLon: -3.1,
} as const;

/** True when a WGS84 point falls within the loose Comunidad de Madrid bounding box. */
export function isInComunidadMadrid(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= COMUNIDAD_MADRID_BBOX.minLat &&
        lat <= COMUNIDAD_MADRID_BBOX.maxLat &&
        lon >= COMUNIDAD_MADRID_BBOX.minLon &&
        lon <= COMUNIDAD_MADRID_BBOX.maxLon
    );
}

/**
 * The single Spanish INE province code that composes the Comunidad de Madrid.
 *
 * ⚠ THIS IS THE EXACT GATE, and it is exact because the INE code is *province(2) ||
 * municipality(3)* by construction — the province prefix is not a heuristic, it is the first two
 * digits of the identifier. The community is uniprovincial, so the province and the community are
 * the same set; that is a fact about Spanish administrative geography, not an approximation.
 * Contrast the bbox above, which is a proximity gate and says so.
 */
export const COMUNIDAD_MADRID_INE_PROVINCE_PREFIX = '28' as const;

/**
 * Is this 5-digit Spanish INE municipality code a COMUNIDAD DE MADRID municipality?
 *
 * Returns `false` for null/undefined/malformed input — never `true` on a guess. An unparseable
 * code is not evidence of Madrid, and the whole point of this function is to be the check that
 * stops a Comunidad de Madrid citation landing on Toledan, Guadalajaran, Segovian, Abulense or
 * Conquense land (§COMUNIDAD-MADRID-SPILL).
 */
export function isComunidadMadridIneCode(ineCode: string | null | undefined): boolean {
    if (typeof ineCode !== 'string') return false;
    const t = ineCode.trim();
    if (!/^\d{5}$/.test(t)) return false;
    return t.slice(0, 2) === COMUNIDAD_MADRID_INE_PROVINCE_PREFIX;
}

/**
 * Is this the CAPITAL (INE 28079)?
 *
 * ⚠ EXPORTED SO THE DIVISION OF LABOUR IS STATED ONCE, NOT RE-DERIVED AT EACH CALL SITE. The
 * capital keeps its own `esMadridNZ1` / `esMadridPgoum97` path: different publisher
 * (`sigma.madrid.es`), different corpus (PGOUM-97), different failure mode. Merging the two
 * would put one citation on two bodies of law.
 */
export function isMadridCapitalIneCode(ineCode: string | null | undefined): boolean {
    return typeof ineCode === 'string' && ineCode.trim() === '28079';
}
