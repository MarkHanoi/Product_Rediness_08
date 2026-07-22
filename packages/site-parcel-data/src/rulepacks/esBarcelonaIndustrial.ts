// L-590 — Barcelona (INE 08019) rule pack for clau **`22a`**, *Zona Industrial* (PGM Secció 8a,
// Arts. 348–351).
//
// PRIMARY SOURCE, READ DIRECTLY
// -----------------------------
// `docs/04-reference/spain/barcelona-catalonia/PGM-NNUU-metropolitana.pdf` — the MMAMB re-edition
// of the *Normativa Urbanística Metropolitana* (1976 NNUU · 1988 Text Refós · later updates).
// **Art. 350 is on PDF page 116 (printed page 115).** Every figure below was extracted with glyph
// coordinates and cross-checked against the PDF's content-stream reading order, which is what
// establishes the paragraph numbering — the thing `extract_text()` destroys.
//
// ⚠⚠⚠ **THIS PACK IS AUTHORED, TESTED, CITED — AND DELIBERATELY *NOT* REGISTERED IN
// `registry.ts`.** That is the headline finding of L-590 and it is argued in full in
// `BCN_22A_ENVELOPE_BLOCKER` below. In one line: **Art. 350's envelope is two-tier and our
// `GeometricRule` / `BuildableEnvelope` model is single-prism**, so registering this pack would
// hand every 22a parcel an envelope covering **100 %** of its plot while the very same card
// published a **90 %** occupation cap taken from the same article. A refusal costs an absent
// envelope; that would cost a self-contradicting one.
//
// ═══ ART. 350 HAS TWO REGIMES, AND THEY GOVERN DIFFERENT PARCELS ══════════════════════════════
//
// **Art. 350.1** — *"Les condicions d’edificació a la zona industrial que compti amb **Pla Parcial
// definitivament aprovat** s’han de regir per les disposicions dels plànols i ordenances de
// l’esmentat pla parcial **amb les limitacions següents**:"*
//     1r. *segons alineacions a vial* sectors — FAR ≤ **2 m² sostre/m² sòl**, occupation **90 %**.
//     2n. *edificació aïllada* sectors       — FAR ≤ **2 m² sostre/m² sòl**, occupation **70 %**,
//         and a minimum parcel may not be shared between different natural/legal persons.
//   ⇒ Under 350.1 the PGM states **only those two ceilings**. Height, storeys, minimum parcel and
//     the concentric band all come from the Pla Parcial itself — a document PRYZM does not hold.
//
// **Art. 350.2** — *"Per a la zona industrial que estigui **mancada de Pla Parcial** regiran les
// condicions següents:"* a–f, transcribed field by field below. **This is the regime this pack
// encodes**, and it is the regime the Art. 350.2.c height table belongs to.
//
// ⚠ **WE CANNOT TELL WHICH REGIME A GIVEN PARCEL IS IN.** Neither the Catastro parcel nor the MUC
// (`CODI_QUAL_MUC` / `DESC_QUAL_AJUNT`) carries "is a definitively-approved Pla Parcial in force
// here?". The distinction therefore SURVIVES INTO THE CODE rather than being quietly resolved:
// `resolveAlcadaIndustrial` takes a three-valued `PlaParcialRegime` and refuses on `unknown`, and
// this pack's `zones[0].code` scope note says which regime its scalars belong to.
//
// ⚠ THE GOOD NEWS, AND IT IS A REAL FINDING: **the FAR and the occupation do not depend on the
// answer** for *alineacions a vial* land. 350.1.1r and 350.2.a state the SAME pair — 2 m²st/m²s
// and 90 %. Art. 349 makes *segons alineacions (de vial)* the ordering type of this zone. So the
// two numbers this pack ships are stable across the regime question; only the HEIGHT is gated.
// (The 70 % of 350.1.2n applies to *edificació aïllada* sectors, which Art. 349.2 says a PERI or
// Estudi de Detall may create. It is recorded below as a NON-APPLIED constant so nobody reaches
// for it, and so nobody re-discovers it and mistakes it for the 70 % of 350.2.b, which is a
// completely different rule about the block.)
//
// ═══ NO BARCELONA MUNICIPAL OVERRIDE FOR ART. 350 — CHECKED ═══════════════════════════════════
//
// The MMAMB edition footnotes every locally-rewritten article with *"Veure modificació per al
// Municipi de Barcelona a la pàg. N"*. All 512 pages were scanned for that string. Pages 106, 108,
// 109, 110, 111, 112, 114 and 117 carry one; **page 116 — Arts. 348, 349, 350, 351 — carries
// none.** Art. 350 is base PGM text for Barcelona. Recording the *absence* is the point: "we
// looked for a municipal override and there is none" is a different, stronger statement than "we
// found no override".
//
// ⚠ THE ONE BARCELONA INSTRUMENT THAT TOUCHES 22a, and why it is NOT an override of Art. 350: the
// **MPGM per a la renovació de les àrees industrials del Poblenou, districte d’activitats 22@**
// (Subcomissió d’Urbanisme de Barcelona 27-07-2000, DOGC 3239 of 05-10-2000), pp. 154–160 of the
// same PDF. Its Art. 5 says *"La zona d’activitats **22@** es defineix formalment com a una
// **subzona** de la zona industrial 22a i es regula pel que disposen les NU del PGM per a la zona
// 22a, **llevat d’allò que expressament s’estableix en els articles següents**"*, and its
// prescription (a) confirms *"La zona industrial, clau 22a, establerta pel Pla general metropolità
// **manté l’edificabilitat de 2 m²/m²**"*. ⇒ It creates a **formally distinct clau (`22@`)** with
// its own articles; it leaves clau 22a governed by Art. 350 unchanged, and it independently
// corroborates the FAR this pack ships. **`22@` IS NOT REGISTERED TO THIS PACK** — answering for
// it here would cite Art. 350 for land the 22@ articles govern.
//
// (Also noted and deliberately NOT encoded: a Barcelona ordinance at p. 469 fixes a 2 m boundary
// FENCE height in zones 13b/22a/20a. A fence is not a building envelope.)
//
// ═══ CONFIDENCE ═══════════════════════════════════════════════════════════════════════════════
// `defaultConfidence: 'estimated-ruleset'`, exactly as 13a and 13b ship. ⚠ **Nothing here is
// `certified`, and the reason is specific to this document**: our PDF is the MMAMB *re-edition* of
// the 1988 Text Refós, manually re-typeset, with documented transcription errors elsewhere in the
// volume (Arts. 251.3a, 330, 331). It is a PRIMARY source and a far better one than the municipal
// mirrors 13b's height table rests on — but a re-typeset primary source is not an authenticated
// one, and `BCN_22A_ORDINANCE_REF` says so in the citation string itself.
//
// PURE + deterministic (C58 §1.1). Strategic context: C58 §1.1/§1.2/§1.4/§1.7a/§1.11, ADR-0270,
// ADR-0271, L-526, L-583, L-584, L-590.

import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
} from '@pryzm/schemas';

/**
 * The governing citation carried on every value in this pack.
 *
 * ⚠ It names the PARAGRAPH, not just the article. Art. 350.1 and Art. 350.2 state different rules
 * for different parcels, so "Art. 350" alone would be a citation that cannot be checked — the
 * precision failure L-526 turned on.
 */
export const BCN_22A_ORDINANCE_REF =
    'PGM-1976 NNUU, clau 22a (Zona Industrial, Secció 8a, Arts. 348–351). ' +
    'Ordering type: Art. 349 — edificació segons alineacions (de vial). ' +
    'Edificabilitat 2 m² sostre/m² sòl and ocupació màxima de parcel·la 90 %: Art. 350.2.a ' +
    '(identical to Art. 350.1.1r, so the pair does not depend on whether a Pla Parcial governs). ' +
    'Alçada màxima i nombre límit de plantes: Art. 350.2.c (street-width table, THREE bands — 9 m ' +
    'PB+1 / 13 m PB+2 / 17 m PB+3 — with an OPEN-ENDED top band; NOT Art. 327, which is clau 13a, ' +
    'and NOT Art. 328, which is clau 13b). Franja concèntrica del 70 % de l’illa above the ground ' +
    'floor: Art. 350.2.b. Parcel·la mínima 300 m² i façana ≥ 10 m: Art. 350.2.d. Alçada a ' +
    'l’interior de l’illa 5 m, una única planta indivisible, amidats des de la rasant: ' +
    'Art. 350.2.e. Cossos sortints: Art. 350.2.f. ' +
    '⚠ Arts. 350.2.a–f govern only industrial land MANCADA DE PLA PARCIAL; land with a ' +
    'definitively-approved Pla Parcial is governed by Art. 350.1, under which the height comes ' +
    'from that plan’s own plànols and ordenances and only the FAR/occupation ceilings are the ' +
    'PGM’s. PRYZM holds no source establishing which regime a parcel is in. ' +
    'Source: MMAMB re-edition of the Normativa Urbanística Metropolitana (1976 NNUU / 1988 Text ' +
    'Refós), p. 116, committed at docs/04-reference/spain/barcelona-catalonia/' +
    'PGM-NNUU-metropolitana.pdf. ⚠ A manually re-typeset re-edition with transcription errors ' +
    'documented elsewhere in the volume (Arts. 251.3a, 330, 331) — primary, but NOT authenticated, ' +
    'hence estimated-ruleset and never certified. No "Veure modificació per al Municipi de ' +
    'Barcelona" footnote appears on p. 116: Art. 350 is base PGM text for Barcelona (verified ' +
    'against all 512 pages). L-590.';

/**
 * ⚠⚠ **WHY THIS PACK IS NOT IN `registry.ts` — the documented "we need a rule kind we do not
 * have".**
 *
 * TWO INDEPENDENT BLOCKERS. Either alone forbids registration; both are stated because fixing one
 * does not unblock the zone.
 *
 * ── BLOCKER 1 · THE ENVELOPE IS TWO-TIER AND OUR MODEL IS A SINGLE PRISM ──────────────────────
 *
 * Art. 350.2 describes a **podium + tower**, not a prism:
 *
 *   • **350.2.a** — the building may occupy up to **90 % of the PARCEL**.
 *   • **350.2.b** — *"l’edificació **per damunt de la planta baixa** haurà de situar-se dins de la
 *     franja concèntrica a les alineacions de l’illa de superfície igual al **70 per 100**
 *     d’aquesta"* — above the ground floor the mass must sit inside a band concentric with the
 *     BLOCK's alignments whose AREA equals 70 % of the block.
 *   • **350.2.c** (closing sentence) — *"L’edificació a l’alçada reguladora fixada a l’anterior
 *     quadre només podrà alçar-se dins de la franja del 70 per 100 esmentat al precedent apartat
 *     b)."* The table's height applies ONLY inside that band.
 *   • **350.2.e** — inside the block, height is fixed at **5 m**, one indivisible storey.
 *
 * ⇒ The legal solid is: a **parcel-scoped podium** (≤ 90 % of the parcel, and 5 m where it lies in
 * the block interior) **plus a block-scoped tower** (inside the 70 % concentric band, up to
 * 9/13/17 m). Two footprints, two heights, one building.
 *
 * `BuildableEnvelope` carries **one** `insetPolygon`, **one** `maxHeight_m` and **one**
 * `maxVolumeM3`. `GeometricRule` has four kinds — `setback`, `alignment`,
 * `block-derived-alignment`, `explicit-area` — and **none of them produces a coverage-driven
 * footprint or a per-storey footprint change.** So there is no honest value for `geometricRule`
 * here, and `null` is what this pack carries.
 *
 * ⚠ AND `null` IS NOT SAFE ON THE ENGINE PATH, WHICH IS THE ACTUAL REASON FOR NON-REGISTRATION.
 * `geometricRule: null` means "legacy per-edge inset from `setbacks`", and this zone's setbacks
 * are correctly `null` (an alignment zone has no honest front/side/rear triple — C58 §1.7a). An
 * all-null inset erodes nothing, so `computeBuildableEnvelope` would return `status: 'ok'` with
 * the **whole parcel** as the buildable footprint — a 100 % envelope on a card that simultaneously
 * prints `maxCoverage 90 %` from Art. 350.2.a. Not merely imprecise: **self-contradicting, and
 * over-stating buildable area**, which is the exact failure ADR-0270 was written to end.
 *
 * ⚠ THE NEAR-MISS THAT MUST NOT BE TAKEN. Art. 350.2.b's 70 % band is *structurally* the same
 * construction as Art. 242.2's — a band concentric with the block leaving 30 % free — so
 * `block-derived-alignment` with `interiorFreeRatio: 0.3` looks like a drop-in. It is not:
 *   (a) `BlockDerivedAlignmentRuleSchema` REQUIRES `minDepth_m` and `maxDepth_m`, both strictly
 *       positive. **Art. 350 states neither.** Supplying Art. 242's 12 m / 30 m would impose the
 *       Eixample article's clamps on industrial land under a citation to Art. 350 — L-526,
 *       verbatim. Any other pair would be synthesised (C58 §1.7a: never invent a value).
 *   (b) It would silently DROP the podium — the ground floor at 90 % of the parcel, plus the 5 m
 *       block-interior storey. On industrial fabric the podium is frequently the entire building,
 *       so the result would understate the envelope on most of the zone while looking computed.
 *   (c) 350.2.b states an EQUALITY (*"de superfície igual al 70 per 100"*); Art. 242.2 states a
 *       minimum (*"com a mínim el 30 per 100"*). The solver clamps against bounds that exist only
 *       in the article that is not being cited.
 *
 * ── BLOCKER 2 · WE CANNOT ESTABLISH WHICH REGIME OF ART. 350 GOVERNS A PARCEL ─────────────────
 *
 * See the module header. Art. 350.2 applies only to 22a land *mancada de Pla Parcial*, and no
 * source PRYZM consumes answers that question. The height therefore refuses today
 * (`resolveAlcadaIndustrial` ⇒ `pla-parcial-unknown`) whatever else is fixed.
 *
 * ── WHAT UNBLOCKS IT ─────────────────────────────────────────────────────────────────────────
 *   1. A new `GeometricRule` kind expressing a **tiered occupation** envelope (parcel-coverage
 *      podium + block-band tower), a `BuildableEnvelope` able to carry more than one tier, and the
 *      solver branch for both. That is a schema + engine + geometry change, larger than a pack.
 *   2. A Pla-Parcial coverage layer for Barcelona's industrial land, or a founder ruling that 22a
 *      inside the municipality is `'none'` by default — a legal determination, not an engineering
 *      one, and therefore not ours to make silently.
 *
 * Until then clau 22a keeps its **coverage-gap refusal** (`esBarcelonaZoneClassification.ts`),
 * whose copy already says the true thing: PRYZM can read this zone's numbers but cannot yet turn
 * them into an envelope.
 */
export const BCN_22A_ENVELOPE_BLOCKER = {
    /** Registered in `registry.ts`? NO — see this constant's doc comment. */
    registered: false,
    /** The `GeometricRule` kind Art. 350.2 would need and that the union does not contain. */
    missingRuleKind: 'tiered-occupation (parcel-coverage podium + block-band tower)',
    reasons: Object.freeze([
        'Art. 350.2.a/.b/.c/.e describe a two-tier solid (≤90 % of the PARCEL at ground floor, ' +
            'plus 5 m in the block interior; above the ground floor only inside a band concentric ' +
            'with the BLOCK whose area equals 70 % of it, up to the Art. 350.2.c height). ' +
            'GeometricRule has no coverage-driven or per-storey footprint kind, and ' +
            'BuildableEnvelope carries a single prism.',
        'geometricRule: null would make computeBuildableEnvelope return the WHOLE PARCEL as the ' +
            'buildable footprint (the setbacks are correctly null for an alignment zone), i.e. a ' +
            '100 % envelope beside a published 90 % occupation cap from the same article.',
        'block-derived-alignment is a near-miss, not a fit: it requires minDepth_m/maxDepth_m that ' +
            'Art. 350 does not state, and it would drop the ground-floor podium entirely.',
        'Art. 350.2 governs only 22a land mancada de Pla Parcial, and PRYZM holds no source ' +
            'establishing whether a definitively-approved Pla Parcial covers a given parcel.',
    ]),
} as const;

/**
 * PGM **Art. 350.2.d** — *"la superfície mínima ha de ser de 300 m² i la longitud de façana igual
 * o superior a 10 m."*
 *
 * ⚠ NOT ENVELOPE FIELDS. `ZoningRule` has no slot for a minimum parcel or a minimum frontage, and
 * inventing one would be a schema change made by a data file. They are exported as constants so a
 * consumer can state "this parcel is below the zone's minimum" — a **buildability** fact about the
 * plot, never a shrink applied to a volume.
 */
export const BCN_ART350_MIN_PARCEL_M2 = 300;
/** PGM Art. 350.2.d — minimum façade length, metres. See `BCN_ART350_MIN_PARCEL_M2`. */
export const BCN_ART350_MIN_FACADE_M = 10;

/**
 * PGM **Art. 350.2.b** — the share of the BLOCK that must remain outside the above-ground-floor
 * band: the band's area equals 70 %, so 30 % is left.
 *
 * ⚠ **RECORDED, NOT USED BY ANY CODE PATH**, and it must stay that way until a rule kind exists
 * that can express the tier it belongs to. It is numerically equal to Art. 242.2's
 * `interiorFreeRatio` and that coincidence is a trap, not a shortcut — see
 * `BCN_22A_ENVELOPE_BLOCKER`, near-miss (a)/(b)/(c).
 */
export const BCN_ART350_2B_INTERIOR_FREE_RATIO = 0.3;

/**
 * PGM **Art. 350.1.2n** — occupation for *edificació aïllada* sectors inside a definitively
 * approved Pla Parcial: **70 %**.
 *
 * ⚠ **RECORDED, NOT SHIPPED, AND NOT THE SAME 70 % AS `BCN_ART350_2B_INTERIOR_FREE_RATIO`.** That
 * one is a share of the BLOCK left free above the ground floor; this one is a share of the PARCEL
 * a building may cover. Two different quantities, two different articles, the same digits — which
 * is exactly why both are named rather than left as bare literals. This pack declares the
 * Art. 350.2 regime, so 0.90 is the coverage it ships.
 */
export const BCN_ART350_1_AILLADA_COVERAGE = 0.7;

/**
 * PGM **Art. 350.2.f** — *cossos sortints*.
 *
 * *"el seu vol es limita al límit màxim d’una dècima part de l’amplada de vial sense que pugui
 * passar, en cap cas, de la mida absoluta d’un metre. En projecció horitzontal no podrà ocupar més
 * d’un terç de la longitud de façana."*
 *
 * ⚠ RECORDED, NOT APPLIED. A *cos sortint* ADDS volume outside the envelope under conditions the
 * envelope solver has no way to test, so folding it in would over-state; and it is not a
 * `ZoningRule` field. Exported so the figures are citable without being re-derived.
 */
export const BCN_ART350_COSSOS_SORTINTS = {
    /** Projection ≤ 1/10 of the *amplada de vial*… */
    maxProjectionFractionOfStreetWidth: 0.1,
    /** …and never more than 1 m in absolute terms. */
    maxProjection_m: 1,
    /** Horizontal projection ≤ 1/3 of the façade length. */
    maxFractionOfFacadeLength: 1 / 3,
} as const;

/**
 * The Barcelona *zona industrial* pack — clau `22a`, **Art. 350.2 regime** (land *mancada de Pla
 * Parcial*).
 *
 * ⚠ NOT REGISTERED. See `BCN_22A_ENVELOPE_BLOCKER`. It is authored, schema-validated and tested so
 * that the sourcing work is captured, citable and impossible to re-do by guesswork — and so that
 * the day a tiered-occupation rule kind lands, the numbers are already read from the primary text.
 */
export const ES_BARCELONA_INDUSTRIAL_PACK: JurisdictionZoningContract =
    JurisdictionZoningContractSchema.parse({
        jurisdictionId: 'es-08019-barcelona',
        displayName: 'Barcelona — Zona Industrial (PGM clau 22a, Art. 350.2 regime)',
        source: 'catastro-muc',
        crs: 'EPSG:4326',
        lastReviewed: '2026-07-22',
        defaultConfidence: 'estimated-ruleset',
        zones: [
            {
                code: '22a',
                label: 'Zona Industrial (clau 22a)',
                // Art. 348 defines the zone as *sòl urbà destinat principalment a la ubicació
                // d'indústries i magatzems*. Art. 311 admits further uses in the industrial zone,
                // but that is a USE article, not this pack's subject, so nothing beyond the
                // article's own words is claimed here.
                permittedUse: ['industrial'],

                // ── Art. 350.2.c — a PER-STREET CONSTRUCTION, not a zone scalar. ──────────────
                // The table lives in `bcnAlcadaIndustrial.ts` and is reached through
                // `resolveBcnAlcadaForZone`, which is also what guarantees a 22a parcel is never
                // handed Art. 327's or Art. 328's ladder under their citation. Writing a scalar
                // here would publish one street's answer for the whole zone.
                maxHeight_m: null,
                maxFloors: null,

                // ── Art. 350.2.a — *"la intensitat d’edificació per parcel·la no podrà passar de
                // 2 m² sostre/m² sòl"*. ──────────────────────────────────────────────────────
                // ⚠ THIS ONE IS A REAL PER-PARCEL FAR, unlike 13a (which has none) and 13b (whose
                // 1,80 is gated to PERI/estudis de detall). The article says *per parcel·la* and
                // attaches no procedural gate. It is additionally corroborated by Barcelona's own
                // 22@ MPGM (2000), prescription (a): *"la zona industrial, clau 22a … manté
                // l’edificabilitat de 2 m²/m²"*.
                plotRatioFAR: 2,

                // ── Art. 350.2.a — *"l’ocupació màxima de la parcel·la ha de ser del 90 per
                // 100"*. ────────────────────────────────────────────────────────────────────────
                // ⚠ 0.90 is a fraction of the PARCEL. It is NOT the 70 % of Art. 350.2.b (a share
                // of the BLOCK, above the ground floor) and NOT the 70 % of Art. 350.1.2n (parcel
                // occupation for *aïllada* sectors under a Pla Parcial — see
                // `BCN_ART350_1_AILLADA_COVERAGE`). Three different 70/90 figures live in this one
                // article; conflating any two is the most likely wrong edit to this file.
                // ⚠ The engine RESOLVES and REPORTS this number but does not apply it to geometry
                // — which is half of why the pack is unregistered (`BCN_22A_ENVELOPE_BLOCKER`).
                maxCoverage: 0.9,

                // ── Setbacks — NULL, not zero (C58 §1.7a). ────────────────────────────────────
                // Art. 349 orders this zone *segons alineacions (de vial)*: the façade sits ON the
                // street line, and there is no honest front/side/rear triple. `null` makes the
                // containment check SKIP the edge; `0` would assert "the ordinance requires zero
                // clearance", a claim Art. 350 does not make.
                setbacks: { front_m: null, side_m: null, rear_m: null },

                // ── ⚠⚠ NULL, AND THE MOST IMPORTANT NULL IN THIS PACKAGE. ────────────────────
                // Art. 350.2's envelope is two-tier (podium at ≤90 % of the parcel + tower inside
                // the 70 % block band) and `GeometricRule` has no kind that expresses it. `null`
                // here does NOT mean "to be filled later" — it means the rule this zone needs does
                // not exist in the model yet. Read `BCN_22A_ENVELOPE_BLOCKER` before changing it,
                // and note that changing it to `block-derived-alignment` requires two bounds
                // Art. 350 never states.
                geometricRule: null,

                fieldProvenance: {
                    // `ordinance-pdf` — this IS the ordinance PDF, read directly. It is a better
                    // source than 13b's municipal mirrors and still not an authenticated one, so
                    // it drives the amber "verify against the ordinance" affordance, never a green
                    // chip. There is no provenance value for "primary but re-typeset", and
                    // inventing one is a schema change, not a pack decision.
                    maxFAR: 'ordinance-pdf',
                    maxCoverage: 'ordinance-pdf',
                    permittedUse: 'ordinance-pdf',
                },
                ordinanceRef: BCN_22A_ORDINANCE_REF,
            },
        ],
    });

/**
 * The zone codes this pack answers for.
 *
 * ⚠ **`22a` ONLY. `22@` IS NOT HERE**, and its absence is a finding rather than an omission: the
 * 2000 MPGM defines 22@ as a formally distinct subzone with its own articles (own uses, own
 * complementary edificabilitat coefficients, own transformation regime), *"llevat d’allò que
 * expressament s’estableix en els articles següents"*. Registering 22@ to this pack would cite
 * Art. 350 for land those articles govern — the L-526 failure, one clau over.
 *
 * ⚠ And no speculative variants (`22a/1`, `22`, …). The MUC returns what it returns; a code we
 * have not seen is a code we must not claim to answer for.
 */
export const BCN_INDUSTRIAL_ZONE_CODES = ['22a'] as const;
