// L-591 / ADR-0271 — Barcelona (INE 08019) rule pack for clau **`12`**,
// *Zona de Nucli Antic — **Subzona I**, substitució de l'edificació antiga* (PGM).
//
// ⚠⚠⚠ FIRST, THE SCOPE QUESTION — DOES CLAU 12 EXIST INSIDE BARCELONA AT ALL?
// ============================================================================
// PGM **Art. 315.2** (p. 104) reads, verbatim:
//
//   *"A la zona de nucli antic es distingeix una subzona I, en substitució de l'edificació antiga
//    (12), **d'aplicació a tots els nuclis antics diferents del de Barcelona**, i una subzona II,
//    de conservació del centre històric (12b), **referida preferentment a aquell**."*
//
// Read quickly, that says "clau 12 is for everywhere except Barcelona" — and an earlier research
// pass read it exactly that way and recommended deleting clau 12 from the roadmap. **That reading
// is wrong, and it would have removed roughly a tenth of the city.** Four independent reasons,
// strongest last:
//
//   1. **"El nucli antic de Barcelona" is a PLACE, not a municipality.** Art. 315.1 scopes the
//      zone to *"els nuclis urbans antics de les **poblacions** compreses a l'àmbit territorial de
//      l'Entitat Municipal Metropolitana"* — plural nuclei. Barcelona the municipality absorbed
//      **Gràcia, Sants, Sarrià, Sant Andreu, Horta** and others between 1897 and 1921. Each keeps
//      its own *nucli antic*, and each of those is literally *"un nucli antic diferent del de
//      Barcelona"* — the one meant by "el de Barcelona" being **Ciutat Vella**, the walled city.
//   2. **The 12b half of the same sentence is deliberately soft.** *"Referida **preferentment** a
//      aquell"* — *preferentially*, not exclusively. A drafter writing an exclusivity rule does
//      not hedge one half of it.
//   3. **The live zoning query.** 26 clau-`12` sample points are spread across the municipality
//      (centroid 41.4008, 2.1639, reaching lat 41.436 — Nou Barris / Horta), against 5 clau-`12b`
//      points tightly clustered on Ciutat Vella (41.3796, 2.1686). The PGM *plànols* are the
//      operative instrument, and they assign clau 12 inside 08019.
//   4. **⚠ THE PRIMARY-TEXT KILL SHOT, and it is decisive on its own.** Page 184 of the NNUU
//      volume opens a section headed *"(d'aplicació **exclusiva al municipi de Barcelona**)"*
//      (Subcomissió d'Urbanisme de Barcelona, 20-10-2004, DOGC 4277 of 10-12-2004) whose FIRST
//      article is **Art. 317 — *Estàndards en operacions de reforma interior*, Zona de Nucli Antic
//      (12)**, and it regulates *"la subzona I, de substitució de l'edificació antiga"* by name.
//      **Barcelona legislated a Barcelona-exclusive rule for subzona I.** A municipality does not
//      enact an exclusive ordinance for a subzone that does not occur on its territory.
//      The 2007 modification of Art. 320 (p. 274) does the same thing again, three years later.
//
// ⇒ **CONCURRED: clau 12 governs land inside Barcelona, and this pack is warranted.** The narrow
// reading of Art. 315.2 mistakes a statement about *which nucli antic* for a statement about
// *which municipality*.
//
// WHAT GOVERNS WHAT — THE CITATION MAP, BECAUSE GETTING THE ARTICLE WRONG IS THE WORST OUTPUT
// ===========================================================================================
//   ┌─ ORDERING TYPE  ─ **Art. 319**: *"Correspon al d'edificació segons alineacions de vial
//   │  vigents."* This is what makes a setback triple the wrong SHAPE here, and what routes the
//   │  zone into the Art. 242 common provisions.
//   │
//   ├─ DEPTH  (*profunditat edificable*) ─ **Art. 320.2a**, an ALGORITHM, not a number:
//   │  *"A la subzona I, de substitució de l'edificació antiga, la profunditat edificable
//   │   resultarà d'una ocupació, a l'alçada reguladora, del **seixanta per cent (60 per 100)** de
//   │   la superfície de l'illa."*  ⇒ interior free share = **40 %**.
//   │  ⚠ **AND THE GENERAL ARTICLE INDEPENDENTLY AGREES.** Art. 242.2 states the same construction
//   │  and scopes its ratio by name: *"…sigui equivalent, com a mínim, a la **zona de nucli antic
//   │  subzona I**, al **40 per 100** de la superfície total; i, a les de densificació urbana, al
//   │  30 per 100…"*. Two articles, written independently, agreeing that this zone keeps 40 % of
//   │  its block free. That is the strongest corroboration in this pack.
//   │  Cap **30 m** (Art. 242.2, *"en cap cas"*); floor **11 m** (Art. 242.5 + 242.6) — see §FLOOR.
//   │
//   ├─ HEIGHT (*alçada reguladora màxima*) ─ **Art. 320.3a**, ⚠ **NOT Art. 317**. The table is a
//   │  per-street CONSTRUCTION and lives in `bcnAlcadaNucliAntic.ts`; hence `maxHeight_m: null`
//   │  here. Read that module's header — the base-text table is MISSING from this volume and the
//   │  shipped one comes from the Barcelona-specific DOGC 4893 (2007) modification.
//   │
//   ├─ EDIFICABILITAT ─ **Art. 316.2**: *"A la subzona I, de substitució de l'edificació antiga, es
//   │  defineix un índex d'edificabilitat **net**, entre alineacions vigents, d'**1,40 m² sostre/m²
//   │  sòl**."*  ⇒ **CONFIRMED from the primary text.** See §FAR — this is the one field where
//   │  clau 12 differs in KIND from 13a/13b, which have no per-parcel index at all.
//   │
//   └─ DWELLING COUNT ─ **Art. 318**, in its **Barcelona-exclusive** form (p. 184). Recorded, not
//      applied — see `BCN_ART318_DWELLING_MODULE_M2`.
//
// §FLOOR — ⚠ **11 m, AND THE SIBLING PACKS SAY 12. THE PRIMARY TEXT SAYS 11.**
// ---------------------------------------------------------------------------
// `esBarcelonaEnsanche.ts` and `esBarcelonaSemiintensiva.ts` both ship `minDepth_m: 12`, citing an
// L-526 verdict *"where the construction yields < 12 m, 12 m is taken"*. The volume now in the
// repo states **11 m**, twice, in the article those packs cite:
//
//   • **Art. 242.5** — *"Quan un cop complertes les condicions de l'apartat 2 resultin, en alguna
//     alineació, edificacions amb una profunditat edificable inferior a **11 m.**, s'haurà de
//     prendre aquesta dimensió com a profunditat edificable…"*
//   • **Art. 242.6** — *"Per a aquelles illes en aquesta situació que superin la dimensió de 30 m.,
//     la profunditat edificable ha de ser **11 m.**"*
//
// (`packages/schemas/src/site/GeometricRule.ts` also documents the Art. 242 floor as 11 m, so the
// schema and the two packs already disagree with each other.)
//
// ⚠ THE DIRECTION IS THE FORBIDDEN ONE: a HIGHER floor yields a DEEPER building, so 12 m
// **over-states** the envelope wherever the floor binds — C58 §1.4. This pack therefore ships
// **11**, cited. **It does not edit the sibling packs** (they are owned by concurrent work), but
// the discrepancy is reported as a defect, not left as a silent divergence.
//
// §NULLS — EVERY NULL IS A FINDING WITH A REASON. None is "to be filled later".
// -----------------------------------------------------------------------------
//   • **`maxHeight_m` / `maxFloors` — NULL because the height is a per-street CONSTRUCTION.**
//     Art. 320.3a keys them on the *amplada de vial*. A scalar here would publish one street's
//     answer for the whole zone. Resolver: `bcnAlcadaNucliAntic.ts`, dispatched via
//     `bcnAlcadaByZone.ts` so a clau-12 parcel can never be handed Art. 327's or Art. 328's
//     numbers under their citations.
//
//   • **`maxCoverage` — NULL, AND THIS ONE IS A TRAP.** Art. 320.2a's *60 per 100* is an occupation
//     **of the ILLA** — the whole block — measured at the *alçada reguladora*. `maxCoverage` in the
//     contract is a **parcel** ground-coverage ratio. They are different denominators, so writing
//     `0.60` here would state a per-parcel entitlement the ordinance never granted: on a parcel
//     that is a small part of a deep block the two answers diverge enormously. The 60 % is
//     consumed where it belongs — as `interiorFreeRatio: 0.40` inside the block construction
//     (C58 §1.11.2: a block-granularity figure must not be presented as a parcel figure).
//
//   • **Setbacks — NULL, not zero (C58 §1.7a).** Art. 319 puts the façade ON the street line;
//     there is no honest front/side/rear triple. `null` makes the containment check SKIP the edge,
//     whereas `0` would assert "the ordinance requires zero clearance here".
//
// WHAT IS DELIBERATELY NOT MODELLED
// ---------------------------------
//   • **The block interior is NOT buildable at ground floor here.** Art. 320.2a: *"L'espai lliure
//     interior d'illa no serà edificable en planta baixa. Es permetrà la construcció de soterranis
//     per a aparcaments…"*. ⚠ This is a REAL divergence from 13a/13b, where Art. 242.8b lets parts
//     of the interior be built at ground level. Our envelope models neither, so the omission costs
//     nothing today — but a future ground-floor-courtyard feature must NOT apply it to clau 12.
//   • **Cossos sortints / tribunes.** Art. 320.5a **prohibits** them in subzona I (bar shallow
//     balconies, cornices ≤ 45 cm, and — only on vies > 12 m — projections up to 1/20 of the street
//     width). ⚠ Note the sign: for 13a the unmodelled tribunes mean we UNDER-state, and the 13a
//     pack flags it as a live risk. Here the ordinance forbids them, so ignoring them does not
//     under-state clau 12. Do not carry 13a's caveat across.
//   • **Minimum façade** (Art. 320.4a): 6,50 m; 4,80 m for *habitatges unifamiliars*; reducible to
//     4,50 m on existing parcels boxed in by lateral construction of at least PB+1. A parcel
//     ADMISSIBILITY rule, not an envelope rule, and we do not gate on it.
//
// CONFIDENCE. `defaultConfidence: 'estimated-ruleset'`; the `block-constructed` tier is stamped by
// `ZoningRulesEngine` (§L-572) when a depth is really solved from a dissolved cadastral block — a
// property of the DETERMINATION, not of this pack. ⚠ **Nothing here is `certified`.** Our source is
// the MMAMB re-edition of the 1976 NNUU / 1988 *text refós*, manually re-typeset, with documented
// transcription errors (Arts. 251.3a, 330, 331) and — established while building this pack — an
// outright MISSING table on p. 106. A re-typeset reproduction of a DOGC page is strong evidence
// and it is not the DOGC.
//
// Strategic context: C58 §1.1/§1.2/§1.4/§1.7a/§1.11, ADR-0270, ADR-0271, L-526, L-590, L-591.

import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
    type GeometricRule,
} from '@pryzm/schemas';

/**
 * The governing citation carried on every value in this pack.
 *
 * ⚠ The HEIGHT line names **Art. 320.3a**, never Art. 317. Art. 317 is the reforma-interior
 * standards article and states no height whatever — attributing one to it is the L-526 failure.
 */
export const BCN_12_ORDINANCE_REF =
    'PGM-1976 NNUU, clau 12 (Zona de Nucli Antic, Subzona I — substitució de l\'edificació ' +
    'antiga). Scope: Art. 315.2 — subzona I applies to the nuclis antics OTHER THAN "el de ' +
    'Barcelona" (= Ciutat Vella), which includes the absorbed towns inside the municipality ' +
    '(Gràcia, Sants, Sarrià, Sant Andreu, Horta); confirmed by Barcelona enacting ' +
    'Barcelona-exclusive Arts. 317/318 for subzona I (DOGC 4277, 10-12-2004). ' +
    'Tipus d\'ordenació: Art. 319 (segons alineacions de vial vigents). ' +
    'Profunditat edificable: Art. 320.2a — a CONSTRUCTION, "una ocupació, a l\'alçada reguladora, ' +
    'del seixanta per cent (60 per 100) de la superfície de l\'illa" (⇒ 40 % interior free), ' +
    'corroborated independently by Art. 242.2 which names "la zona de nucli antic subzona I, al ' +
    '40 per 100"; cap 30 m (Art. 242.2), floor 11 m (Art. 242.5 and 242.6). ' +
    'Alçada reguladora màxima: Art. 320.3a (street-width table). ⚠ NOT Art. 317, which states no ' +
    'height rule. The table shipped is the one modified FOR THE MUNICIPALITY OF BARCELONA by the ' +
    'Subcomissió d\'Urbanisme de Barcelona, 02-03-2007, DOGC 4893 of 29-05-2007 — reached from ' +
    'footnote 46 on Art. 320; the base 1988 quadre is MISSING from our copy of the volume. ' +
    'Edificabilitat: Art. 316.2 — índex d\'edificabilitat NET, entre alineacions vigents, of 1,40 ' +
    'm² sostre/m² sòl (the PERI-gated 0,84 of Art. 316.4 is NOT applied). ' +
    'Nombre màxim d\'habitatges per parcel·la: Art. 318 in its Barcelona-exclusive form — ' +
    'superfície construïda ÷ a 80 m² module — a PROGRAMME limit PRYZM records but does not model. ' +
    'Source: MMAMB re-edition of the Normativa Urbanística Metropolitana, committed at ' +
    'docs/04-reference/spain/barcelona-catalonia/PGM-NNUU-metropolitana.pdf. ⚠ That volume is a ' +
    'manually re-typeset reproduction of the 1988 text refós with documented transcription errors ' +
    '(Arts. 251.3a, 330, 331) and a missing table on p. 106 — confidence estimated-ruleset, ' +
    'never certified.';

/**
 * **Art. 320.2a as a rule, not a number** — and it is the SAME SHAPE as Art. 242.2, which is why
 * `solveBlockDerivedDepth` is consumed **unchanged** (ADR-0271). Nothing about the depth algorithm
 * is zone-specific; only its parameters are.
 *
 * ⚠ **THE RATIO IS 0.40, AND IT IS THE WHOLE DIFFERENCE FROM 13a/13b.** Art. 320.2a states a 60 %
 * block OCCUPATION at the *alçada reguladora*; the solver's parameter is the complementary
 * INTERIOR FREE share, so 1 − 0.60 = **0.40**. Art. 242.2 states the same 40 % directly, by
 * subzone name. Two articles, one answer. `13a`/`13b` are *densificació urbana* and take 0.30 —
 * the same sentence of Art. 242.2 that names 40 % for this zone names 30 % for theirs.
 *
 * ⚠ WRITTEN OUT HERE, NEVER IMPORTED FROM A SIBLING PACK. The three zones' parameters agree or
 * differ **by law**, not by construction. Sharing a constant would let a future correction in one
 * zone silently rewrite another's ordinance.
 */
export const BCN_NUCLI_ANTIC_RULE: GeometricRule = {
    kind: 'block-derived-alignment',
    // *Alineació a vial* — Art. 319 + Art. 320.1a: the façade sits ON the street line, obligatorily
    // along the whole parcel frontage.
    alignTo: 'street',
    alignmentOffset_m: 0,
    // *Mitgera* — Art. 320.1a's *parets mitgeres al descobert* clause presupposes party walls.
    sideTreatment: 'party-wall',
    // Art. 320.2a (60 % block occupation ⇒ 40 % free) — corroborated by Art. 242.2's explicit
    // "zona de nucli antic subzona I, al 40 per 100".
    interiorFreeRatio: 0.4,
    // §FLOOR (module header) — Art. 242.5 / 242.6 state **11 m**, not 12. The sibling packs ship 12
    // and that is an over-statement we report rather than replicate.
    minDepth_m: 11,
    // Art. 242.2 — "En cap cas la profunditat edificable no pot superar la de 30 m."
    maxDepth_m: 30,
};

/**
 * **PGM Art. 316.2** — the *índex d'edificabilitat **net***, *entre alineacions vigents*, for
 * subzona I: **1,40 m² sostre / m² sòl**. ✅ **CONFIRMED against the primary text** (p. 105), which
 * is why it is the value of `plotRatioFAR` below rather than a recorded-but-unused constant.
 *
 * ⚠ WHY THIS IS ENCODED WHEN 13a's AND 13b's ARE NOT — the difference is real and it is legal, not
 * editorial. For *densificació urbana*, **Art. 322.1** says *"l'edificabilitat es defineix per
 * l'envolupant màxima de volum"* — there IS no per-parcel index, and the 2,20 / 1,80 / 1,20
 * figures that circulate are all gated to *plans especials de reforma interior* / *estudis de
 * detall*. **Art. 316.2 is different in kind**: it *defines* a net index for this subzone with no
 * procedural gate at all. Art. 316's PERI-gated figure is a SEPARATE one — 0,84 (Art. 316.4) —
 * whose existence is what shows 1,40 is not itself the gated number.
 *
 * ⚠ A SEMANTIC DIVERGENCE THE CONSUMER MUST KNOW ABOUT, stated here so it is not discovered later.
 * The ordinance's denominator is the **sòl between current alignments** (the net parcel).
 * `capacityComparison.ts` currently computes its ceiling as `permittedFootprint × maxFAR` — the
 * depth-clipped BUILDABLE FOOTPRINT, not the parcel. Since footprint ≤ parcel, that **under-states**
 * the permitted sostre. Under-statement is the safe direction (C58 §1.4), so it is recorded rather
 * than worked around here, and it is a consumer defect, not a pack error.
 */
export const BCN_ART316_EDIFICABILITAT_NETA = 1.4;

/**
 * ⚠ **RECORDED SO IT IS NEVER MIS-APPLIED — NOT USED BY ANY CODE PATH.**
 *
 * **Art. 316.4**: *"Els Plans Especials de Reforma Interior que incloguin la reordenació global
 * d'un sector, s'han de subjectar al límit de **0,84 m² sostre/m² sòl**."*
 *
 * A procedurally gated figure — it binds a PERI that re-orders a whole sector, not a parcel.
 * Applying it per-parcel would cut every clau-12 plot in the city by 40 % on the strength of a
 * number answering a different question (C58 §1.11), and it is the exact mirror of the 1,80 trap
 * recorded in the 13b pack. ⚠ It is also the LOWER of the two, so mistaking it for the per-parcel
 * index fails silently: the answer merely looks conservative.
 */
export const BCN_ART316_PERI_FAR_NOT_APPLICABLE = 0.84;

/**
 * **Art. 318, Barcelona-exclusive text** (p. 184; Subcomissió d'Urbanisme de Barcelona, 20-10-2004,
 * DOGC 4277 of 10-12-2004):
 *
 *   *"1. Les sol·licituds d'edificació a la subzona I, de substitució de l'edificació antiga,
 *    hauran de limitar el nombre d'habitatges per parcel·la al que, per excés, resulti de dividir
 *    la **superfície construïda** pel **mòdul de 80 m²**.
 *    2. …s'entén per superfície construïda la compresa entre els tancaments exteriors de l'edifici.
 *    S'inclouen els celoberts i patis de ventilació, i s'exclouen els cossos sortints i la
 *    superfície de planta baixa que ultrapassi la fondària de les plantes pis."*
 *
 * ⇒ **max dwellings per parcel = ceil(superfície construïda ÷ 80 m²)**.
 *
 * ⚠⚠ THE BARCELONA TEXT REPLACES A METROPOLITAN RULE OF A **DIFFERENT SHAPE**, which is the L-526
 * failure class (a different KIND of quantity, not a different number). The metropolitan Art. 318
 * (p. 105) caps *"dos-cents habitatges per hectàrea de sòl"* — a DENSITY. The Barcelona text is a
 * per-parcel count derived from BUILT AREA. For 08019 the Barcelona text wins; the 200 hab/ha
 * figure must never be used here.
 *
 * ⚠ It caps the PROGRAMME, never the envelope: it cannot shrink a buildable volume and a consumer
 * must not present it as if it did. But it IS computable from a floor area — unlike a per-hectare
 * density it needs no site plan — so a consumer holding an envelope can state a dwelling ceiling.
 * ⚠ An envelope GFA **approximates** *superfície construïda* and is not identical to it; any
 * consumer must say which one it used.
 *
 * (It is the same 80 m² module Barcelona's Art. 323 applies to 13a/13b — see the 13b pack. The
 * value is duplicated rather than shared: they agree by law, not by construction.)
 */
export const BCN_ART318_DWELLING_MODULE_M2 = 80;

/**
 * **Art. 317, Barcelona-exclusive text** (p. 184) — *Estàndards en operacions de reforma interior*
 * for the Zona de Nucli Antic (12):
 *
 *   • *a. Percentatge de sòl per a vials i estacionaments públics: **23,52 per 100***
 *   • *b. Percentatge de sòl per a espais verds locals i dotacions comunitàries: **16,48 per 100***
 *   • *c. Densitat neta màxima d'habitatges: **la que resulti de dividir el sostre màxim edificable
 *     pel mòdul de 80 m²***
 *
 * ⚠ **NOT APPLIED, AND IT MUST NOT BE.** These bind a **Pla de Reforma Interior** — a planning
 * instrument that re-orders a sector and cedes land. They are not parcel constraints and there is
 * no parcel input they could consume. Recorded because the brief asked for them and because a
 * future PERI-scale feature will need them cited.
 *
 * ⚠ THE INTERESTING PART: the two PERCENTAGES are IDENTICAL to the metropolitan Art. 317 (p. 105).
 * What the Barcelona text actually changed is only clause **c** — from *"120 habitatges/hectàrea"*
 * (a density) to *"sostre màxim edificable ÷ 80 m²"* (a built-area quotient). Anyone diffing the
 * two texts on the percentages alone would conclude nothing changed, and would then apply a
 * superseded density. That is why all four figures are recorded together.
 */
export const BCN_ART317_PERI_STANDARDS = Object.freeze({
    /** a. Sòl for vials + public parking, as a fraction of the PERI sector. */
    vialsAndParkingFraction: 0.2352,
    /** b. Sòl for local green space + community facilities, as a fraction of the PERI sector. */
    greenAndFacilitiesFraction: 0.1648,
    /** c. Densitat neta màxima = max buildable sostre ÷ this module (m²). */
    dwellingModule_m2: 80,
    /** ⚠ SUPERSEDED for 08019 by clause c above. The METROPOLITAN Art. 317.c figure (p. 105). */
    supersededMetropolitanDensity_habPerHa: 120,
} as const);

/**
 * @deprecated ⚠ WRONG RULE for Barcelona. The METROPOLITAN Art. 318 (p. 105) caps
 * *"dos-cents habitatges per hectàrea de sòl"*; **Barcelona's own Art. 318 is a per-parcel count
 * from built area** (`BCN_ART318_DWELLING_MODULE_M2`). Kept only so a stale import fails loudly at
 * review rather than silently republishing a density that does not govern 08019.
 */
export const BCN_12_METROPOLITAN_DENSITY_HAB_PER_HA = 200;

/**
 * The Barcelona *nucli antic — subzona I* pack.
 *
 * `defaultConfidence: 'estimated-ruleset'` — the engine promotes a real block-solved determination
 * to `block-constructed` itself (§L-572). A pack cannot self-certify.
 */
export const ES_BARCELONA_NUCLI_ANTIC_PACK: JurisdictionZoningContract =
    JurisdictionZoningContractSchema.parse({
        jurisdictionId: 'es-08019-barcelona',
        displayName: 'Barcelona — Nucli Antic, Subzona I (PGM clau 12)',
        source: 'catastro-muc',
        crs: 'EPSG:4326',
        lastReviewed: '2026-07-22',
        defaultConfidence: 'estimated-ruleset',
        zones: [
            {
                code: '12',
                label: 'Nucli Antic — Subzona I, substitució de l’edificació antiga (clau 12)',
                permittedUse: ['residential', 'mixed'],
                // Every null below is argued in §NULLS in the header. None is a placeholder.
                maxHeight_m: null,  // Art. 320.3a — a per-street construction, not a zone scalar
                maxFloors: null,    // idem
                // ⚠ The ONE non-null numeric field, and the one thing clau 12 has that 13a/13b do
                // not: Art. 316.2 states a per-parcel NET index with no procedural gate.
                plotRatioFAR: BCN_ART316_EDIFICABILITAT_NETA,
                // NULL — Art. 320.2a's 60 % is an occupation of the ILLA, not of the parcel. See
                // §NULLS: writing it here would change the denominator and invent an entitlement.
                maxCoverage: null,
                setbacks: { front_m: null, side_m: null, rear_m: null }, // alignment zone: null ≠ 0
                geometricRule: BCN_NUCLI_ANTIC_RULE,
                fieldProvenance: {
                    // `ordinance-pdf`, never `published-structured`: these come from a re-typeset
                    // ordinance volume, which is what drives the amber "verify against the
                    // ordinance" affordance rather than a green chip.
                    'alignment.depth': 'ordinance-pdf',
                    'alignment.offset': 'ordinance-pdf',
                    'alignment.sideTreatment': 'ordinance-pdf',
                    maxFAR: 'ordinance-pdf',
                    permittedUse: 'ordinance-pdf',
                },
                ordinanceRef: BCN_12_ORDINANCE_REF,
            },
        ],
    });

/**
 * The zone codes this pack answers for.
 *
 * ⚠⚠ **ONE code. `12b` IS NOT REGISTERED HERE AND MUST NOT BE.** It is the same *zona* and a
 * different *subzona*, and its rules are a different KIND of rule end to end:
 *
 *   • **Height** (Art. 320.3a, subzona II): *"l'alçada en un tram de vial serà la **mitjana de les
 *     edificacions existents**, sense que entrin en el còmput les façanes dels solars no
 *     edificats"* — a measurement of the neighbours, not a street-width band.
 *   • **Depth** (Art. 320.2a, subzona II): *"la profunditat edificable serà, com a màxim, la de les
 *     edificacions contigües existents"*, and failing a pla especial, *"la corresponent a la
 *     majoria dels edificis antics existents entre dos carrers consecutius"* — a survey of the
 *     existing block, not a 60 % construction.
 *
 * Neither input exists in our pipeline. Registering `12b` against this pack would hand Ciutat Vella
 * a 40 %-block depth and a street-width height that its own subzone explicitly replaces. It stays
 * on the coverage-gap refusal until it has a pack of its own.
 */
export const BCN_NUCLI_ANTIC_ZONE_CODES = ['12'] as const;
