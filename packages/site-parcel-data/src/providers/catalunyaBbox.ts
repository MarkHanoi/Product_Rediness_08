// §CATALUNYA-EXTENT (L-658) — the REGIONAL routing gate for Catalonia.
//
// WHY A REGIONAL GATE EXISTS AT ALL
// ---------------------------------
// Catalonia is 947 municipalities. Exactly 27 of them are inside the PGM-1976's declared reach
// (NNUU Art. 1.1 scopes it to the pre-2011 *Entitat Municipal Metropolitana*, Decret llei 5/1974
// art. 2.1 — NOT today's 36-municipality AMB, see `esAmbPgmScope.ts` §AMB_PGM_SCOPE_CAVEATS). The
// other ~920 are each governed by their OWN planning instrument — a POUM, a PGOU, Normes
// Subsidiàries or, where a plan was annulled, Generalitat-approved Normes de Planejament
// Urbanístic. There is no shared ordinance to transcribe, so a *shared envelope* is unreachable.
//
// A shared ANSWER is not. Every one of those 947 municipalities is served by the same
// Catalonia-wide public planning GIS (the MUC), and — measured, see `esCatalunya.ts` — it answers
// for ALL 947. So a Catalan click can always be told which municipality it is in, what the land's
// harmonised planning qualification is, and (for 935 of 947) which instrument governs it. That is
// a cited refusal instead of silence, everywhere in Catalonia. This box is what routes to it.
//
// ⚠ A bbox is a COARSE proximity gate, NEVER an authorisation — the standing caveat every
// `*Bbox.ts` in this directory carries. The real answer is established at the parcel step, and for
// Catalonia there is a SECOND, EXACT gate that runs there: `isCatalanIneCode()` below, applied to
// the INE code Catastro itself returns. A rectangle decides whether to ASK; the INE code decides
// whether PRYZM may CITE Catalan law. See §CATALUNYA-SPILL.
//
// PROVENANCE OF THE NUMBERS — not hand-drawn, and not from a map.
// ---------------------------------------------------------------
// These are the Generalitat's OWN declared WGS84 extent for `MUC:MUCVW_MUCS_TM`, the MUC's
// *terme municipal* layer — the 947 Catalan municipal boundary polygons — read verbatim from
// `https://sig.gencat.cat/ows/MUC/wfs?service=WFS&version=2.0.0&request=GetCapabilities` on
// 2026-07-31:
//
//     <ows:WGS84BoundingBox>
//       <ows:LowerCorner>0.0648625156759304 40.514895988459564</ows:LowerCorner>
//       <ows:UpperCorner>3.3355094632058075 42.88423624702984</ows:UpperCorner>
//     </ows:WGS84BoundingBox>
//
// rounded OUTWARD to whole hundredths of a degree, so the gate can only ever be too generous and
// never too tight. A too-generous coarse gate costs one wasted round trip; a too-tight one
// silently drops real Catalan land, which is the failure that cannot be seen.

/**
 * §CATALUNYA-SPILL — WHAT THIS RECTANGLE OVER-CLAIMS, STATED RATHER THAN DISCOVERED LATER.
 *
 * `registry.ts` §EXTENT-SPILLS-A-BORDER already records that a rectangle cannot follow a border,
 * and Catalonia's is no exception: this box also covers parts of **Aragó** (Franja de Ponent,
 * INE 22xxx/44xxx/50xxx), the northern **Comunitat Valenciana** (12xxx), **Andorra**, and French
 * **Pyrénées-Orientales / Ariège**. Under the §JURISDICTION-SPECIFICITY ladder a `'regional'`
 * claim would answer all of them with a Catalan citation.
 *
 * ⚠ AND UNLIKE THE NL/DK/CH SPILLS, THIS ONE IS CLOSED — not by a finer rectangle, but by moving
 * the decisive test off geometry entirely. Spain's INE municipality code is `province(2) ||
 * municipality(3)`, and Catalonia is exactly the four provinces 08 / 17 / 25 / 43. Catastro
 * returns that code for every Spanish parcel (`composeIneCode` in `murciaBbox.ts`), so at the
 * parcel step PRYZM knows EXACTLY whether it is in Catalonia. `catalunyaNoRulePackRefusal()`
 * REFUSES TO PRODUCE a Catalan refusal for a non-Catalan INE code rather than mis-cite — the
 * check is in the citation path, which is the only place a wrong jurisdiction can actually harm
 * anyone. Foreign (AD/FR) land has no INE code at all and therefore never passes it.
 *
 * ⇒ The rectangle may over-claim on the coverage globe (C60 §2, which states its own resolution);
 * the CITATION cannot. Those are different promises and only the second is a legal claim.
 */
export const CATALUNYA_BBOX = {
    minLat: 40.51,
    maxLat: 42.89,
    minLon: 0.06,
    maxLon: 3.34,
} as const;

/** True when a WGS84 point falls within the loose Catalonia bounding box. */
export function isInCatalunya(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= CATALUNYA_BBOX.minLat &&
        lat <= CATALUNYA_BBOX.maxLat &&
        lon >= CATALUNYA_BBOX.minLon &&
        lon <= CATALUNYA_BBOX.maxLon
    );
}

/**
 * The four Spanish INE province codes that compose Catalonia: Barcelona (08), Girona (17),
 * Lleida (25) and Tarragona (43).
 *
 * ⚠ THIS IS THE EXACT GATE, and it is exact because the INE code is *province(2) ||
 * municipality(3)* by construction — the province prefix is not a heuristic, it is the first two
 * digits of the identifier. Contrast the bbox above, which is a proximity gate and says so.
 */
export const CATALAN_INE_PROVINCE_PREFIXES: readonly string[] = Object.freeze([
    '08',
    '17',
    '25',
    '43',
]);

/**
 * Is this 5-digit Spanish INE municipality code a CATALAN municipality?
 *
 * Returns `false` for null/undefined/malformed input — never `true` on a guess. An unparseable
 * code is not evidence of Catalonia, and the whole point of this function is to be the check that
 * stops a Catalan citation landing on Aragonese, Valencian, Andorran or French land
 * (§CATALUNYA-SPILL).
 */
export function isCatalanIneCode(ineCode: string | null | undefined): boolean {
    if (typeof ineCode !== 'string') return false;
    const t = ineCode.trim();
    if (!/^\d{5}$/.test(t)) return false;
    return CATALAN_INE_PROVINCE_PREFIXES.includes(t.slice(0, 2));
}
