// L-583 §9 / ADR-0271 — Barcelona (INE 08019) rule pack for clau **`13b`**,
// *Densificació Urbana **Semi**intensiva* (PGM Subzona II).
//
// ⚠ READ THE CITATION CHAIN BEFORE TOUCHING ANY VALUE HERE. Getting the ARTICLE wrong is the most
// damaging thing this file can do — L-526 is the precedent: a confidently-published wrong article
// passed review and was read as authoritative. Two articles govern this zone and they govern
// DIFFERENT fields:
//
//   ┌─ DEPTH  (*profunditat edificable*) ─ PGM **Art. 242**, reached **via Art. 326**.
//   │  ⚠ **NOT Art. 328. Art. 328 contains no depth rule at all** — *profunditat edificable* does
//   │  not appear anywhere in Arts. 321–328 (L-583 §4.1). Citing 328 for the depth would be a
//   │  fabricated attribution.
//   │  WHY 242 APPLIES WITHOUT A CROSS-REFERENCE (L-583 §9, and this is a STRUCTURAL argument, not
//   │  a category inference): Art. 242 does not live in any zone's article block. It sits in
//   │  Títol IV Cap. 2n Secció 2a — the **common provisions of the *segons alineacions de vial*
//   │  ordering type** — beside Art. 240 (height measurement) and Art. 244 (setbacks). **Art. 326**
//   │  orders the subzones of *densificació urbana* (plural — both subzones, no carve-out for
//   │  *semiintensiva*) under that ordering type, and **Art. 236** names buildable depth as one of
//   │  its parameters. So `13b` inherits Art. 242 for exactly the reason it inherits Arts. 240 and
//   │  244, which nobody disputes and which no article states individually either.
//   │  THE RATIO: Art. 242.2 verbatim scopes 40 % to *"la zona de nucli antic **subzona I**"* — a
//   │  subzone named explicitly — and 30 % to *"les de **densificació urbana**"* — the category,
//   │  unqualified. Where the drafter meant to restrict a share to one subzone they said so, in
//   │  the same sentence, and did not do so here. ⇒ **0.30 applies to 13b.**
//   │
//   └─ HEIGHT (*alçada reguladora màxima*) ─ PGM **Art. 328**, the Subzona II street-width table.
//      That table is NOT in this file: it lives in `bcnAlcadaSemiintensiva.ts`, because like 13a's
//      height it is a CONSTRUCTION from the *amplada de vial* and cannot be a per-zone scalar.
//      Hence `maxHeight_m: null` / `maxFloors: null` below — see §NULLS.
//
// §NULLS — EVERY NULL IN THIS PACK IS A FINDING WITH A REASON. None is "to be filled later".
//
//   • **`maxHeight_m` / `maxFloors` — NULL because the height is a per-street CONSTRUCTION**, not
//     a zone constant. Art. 328 keys them on the *amplada de vial*; the resolver + table are in
//     `bcnAlcadaSemiintensiva.ts` and the L5 dispatcher attaches the constructed value with its
//     own derivation row. Writing a scalar here would publish one street's answer for the whole
//     zone. (Same shape as 13a, DIFFERENT numbers — 13b tops out at PB+4, 13a at PB+6.)
//
//   • **`plotRatioFAR` — NULL, and this is the most tempting field in the file.** A single tidy
//     figure circulates for Subzona II: **1,80 m²st/m²s**. It is procedurally gated — it applies
//     *"for operations in this zone through **plans especials de reforma interior or estudis de
//     detall**"* (Art. 322.2/.3 in shape, identical to 13a's 2,20 / 1,20 pair). Applying it
//     per-parcel would over-constrain **every** 13b plot in the city with a real number that
//     answers a different question — the C58 §1.11 category error. L-552 §4.1 flags that the
//     temptation is STRONGER here than for 13a precisely because 1,80 is one clean number rather
//     than a pair. It is recorded below as `BCN_13B_PERI_FAR_NOT_APPLICABLE` so nobody has to
//     re-discover it, and it is NOT in the pack.
//
//   • **`maxCoverage` — NULL.** No retrieved Art. 321–328 text states a ground-occupation ratio
//     for Subzona II. In an *alineacions de vial* zone the occupation is a CONSEQUENCE of the
//     depth construction, not an independent parameter, so an absent coverage is what the
//     ordinance's own shape predicts. We assert nothing.
//
//   • **Setbacks — NULL, not zero (C58 §1.7a).** The façade sits ON the street line; there is no
//     honest front/side/rear triple. `null` makes the containment check SKIP the edge, whereas
//     `0` would assert "the ordinance requires zero clearance here", which we have not
//     established.
//
// ⚠⚠ A DWELLING-COUNT CAP — AND THE FIGURE WE FIRST RECORDED FOR IT WAS THE WRONG RULE (L-590).
//
// We had Art. 323 as "250 habitatges per hectare" (L-552 §4.2). **Barcelona's own Art. 323 says
// something structurally different**, and the primary text is now in the repo
// (`docs/04-reference/spain/barcelona-catalonia/PGM-NNUU-metropolitana.pdf`, p. 185), in a section
// headed *"(d'aplicació **exclusiva** al municipi de Barcelona)"*, approved by the Subcomissió
// d'Urbanisme de Barcelona on 20-10-2004, DOGC 4277 of 10-12-2004:
//
//   *"Les edificacions que s'aixequin a la subzona I, intensiva i a la subzona II, semiintensiva,
//    no podran depassar per parcel·la un nombre d'habitatges igual al que resulti, per excés, de
//    dividir la superfície construïda pel mòdul de 80 m²."*
//
// ⇒ **max dwellings per parcel = ceil(superfície construïda ÷ 80 m²)** — a per-parcel count derived
// from BUILT AREA, not a density per hectare. ⚠ A different SHAPE of rule, not a different number,
// which is the L-526 failure class: the two disagree about what the input even is.
//
// `superfície construïda` is defined by Art. 323.2 as the area between the building's exterior
// enclosures, **including** *celoberts* and ventilation courts, **excluding** *cossos sortints* and
// any ground-floor area exceeding the *fondària* of the upper storeys.
//
// ⇒ **AND THIS ONE IS COMPUTABLE.** Unlike a per-hectare density it needs no site plan — our own
// envelope yields a floor area. It is therefore recorded as a RULE, not as an unusable note; the
// consumer converts envelope GFA into a dwelling ceiling and must say that it did so.
//
// CONFIDENCE. `defaultConfidence: 'estimated-ruleset'`, exactly as 13a ships. The
// **`block-constructed`** tier is stamped by `ZoningRulesEngine` (§L-572) when the depth is really
// solved from a dissolved cadastral block — a property of the DETERMINATION, not of this pack.
// ⚠ Nothing here is `certified`: Barcelona's own (08019) consolidated copy of Arts. 242/326/328
// remains unretrieved (AMB 403s to scripts, the city's book page is robots-disallowed — L-583 §7),
// so the depth chain is `corroborated`-upgraded-by-structural-placement (L-583 §9.5) and the
// height table is `corroborated` (L-583 §4). Both name their source in `BCN_13B_ORDINANCE_REF`.
//
// Strategic context: C58 §1.1/§1.2/§1.4/§1.11, ADR-0270, ADR-0271, L-552, L-583.

import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
    type GeometricRule,
} from '@pryzm/schemas';

/**
 * The governing citation carried on every value in this pack.
 *
 * ⚠ The DEPTH line names **Art. 242 via Art. 326**, never Art. 328. See the header: Art. 328 has
 * no depth rule, and attributing one to it would be the L-526 failure repeated.
 */
export const BCN_13B_ORDINANCE_REF =
    'PGM-1976 NNUU, clau 13b (Densificació Urbana Semiintensiva, Subzona II) — ' +
    'profunditat edificable: Art. 242.2, applicable via Art. 326 (which orders the densificació ' +
    'urbana subzones under the *segons alineacions de vial* ordering type) and Art. 236 (which ' +
    'names buildable depth as a parameter of that ordering type). Art. 328 states NO depth rule. ' +
    'Alçada reguladora màxima: Art. 328 (street-width table; the Subzona II table, distinct from ' +
    'Art. 327 which governs Subzona I / clau 13a). Edificabilitat: no per-parcel FAR — the 1,80 ' +
    'm²st/m²s figure is gated to plans especials de reforma interior / estudis de detall. ' +
    'Density: Art. 323 caps 250 habitatges/ha — a programme limit PRYZM does not model. ' +
    'Source: consolidated PGM refós texts (municipal mirrors carrying no local-rewrite flag on ' +
    'these articles); Barcelona\'s own 08019 consolidation is NOT the copy read — confidence ' +
    'corroborated, never certified (L-552, L-583 §4 + §9).';

/**
 * Art. 242.2 as a rule, not a number — the SAME construction 13a uses, because it is the same
 * article. `solveBlockDerivedDepth` is consumed unchanged (ADR-0271); nothing about the depth
 * algorithm is zone-specific, only its parameters are, and for `13b` they are identical.
 *
 * ⚠ THE ONE PARAMETER THAT IS ZONE-DEPENDENT AND HAPPENS TO MATCH: `interiorFreeRatio`. Art. 242.2
 * states 40 % for *nucli antic subzona I* and 30 % for the *densificació urbana* zones. `13b` is a
 * densificació urbana subzone ⇒ 0.30. It is written out here rather than imported from the 13a
 * pack **on purpose**: they agree today by law, not by construction, and sharing the constant
 * would make a future divergence in one zone silently rewrite the other (L-583 §4.2 makes the
 * same point about the nucli antic 40 %).
 */
export const BCN_SEMIINTENSIVA_RULE: GeometricRule = {
    kind: 'block-derived-alignment',
    // *Alineació a vial* — the façade sits ON the street line (Art. 326, the ordering type).
    alignTo: 'street',
    alignmentOffset_m: 0,
    // *Mitgera* — build to both side boundaries, the party-wall configuration of the ordering type.
    sideTreatment: 'party-wall',
    interiorFreeRatio: 0.3, // Art. 242.2 — "≥30 % of the block as interior free space"
    // Art. 242 ordinance floor, 12 m (L-526 primary-source verdict: "where the construction yields
    // < 12 m, 12 m is taken"). Same article as 13a ⇒ same floor; this is not a copied 13a
    // parameter, it is the same sentence applying twice.
    // §L-594 — 11 m, NOT 12. ⚠ THIS WAS AN OVER-STATEMENT, CORRECTED AGAINST THE PRIMARY TEXT.
    //
    // The packs shipped `12` citing "Art. 242 — 12 m, verified". The primary text
    // (`docs/04-reference/spain/barcelona-catalonia/PGM-NNUU-metropolitana.pdf`, p. 81, Art. 242.4)
    // says otherwise, verbatim:
    //
    //   *"Quan un cop complertes les condicions de l'apartat 2 resultin, en alguna alineació,
    //    edificacions amb una profunditat edificable INFERIOR A 11 m., s'haurà de prendre aquesta
    //    dimensió com a profunditat edificable, sempre que sigui possible inscriure una
    //    circumferència de vuit metres de diàmetre."*
    //
    // ⚠ DIRECTION: `minDepth_m` is a FLOOR, so a HIGHER floor permits a DEEPER building wherever the
    // Art. 242.2 construction yields less. 12 therefore OVER-STATED buildable depth — the direction
    // C58 §1.4 forbids, and the third over-statement found in one day (after L-586's 65% inset and
    // L-591's median street width).
    //
    // ⚠ HOW IT GOT IN, because the mechanism matters more than the metre: two agents disagreed, and
    // the ASSERTIVE one was believed. One said "12, corrected by L-526"; the other said "11, and
    // GeometricRule's own docstring says 11". Neither was checked against the ordinance until the
    // conflict forced it. **When two sources disagree about a legal number, read the law — do not
    // pick the more confident sentence.**
    //
    // ⚠ NOT MODELLED: the floor is CONDITIONAL — it applies only *"sempre que sigui possible
    // inscriure una circumferència de vuit metres de diàmetre"*, and Art. 242.5 adds that where even
    // that fails and the total width between opposing alignments is under 30 m, the parcels must be
    // FULLY buildable. We apply the 11 m floor unconditionally, which is the conservative reading of
    // the first clause and ignores the second.
    minDepth_m: 11,
    maxDepth_m: 30, // Art. 242.2 — "en cap cas … no pot superar la de 30 metres"
};

/**
 * ⚠ RECORDED SO IT IS NEVER RE-DISCOVERED AND MIS-APPLIED — **NOT USED BY ANY CODE PATH.**
 *
 * The Subzona II *edificabilitat* coefficient that circulates for `13b`. It is real, and it is
 * gated to *plans especials de reforma interior* / *estudis de detall* actuacions — it is NOT a
 * per-parcel FAR. Putting it into `plotRatioFAR` would over-constrain every 13b plot in Barcelona
 * with a number that answers a different question (C58 §1.11). Hence `plotRatioFAR: null`.
 */
export const BCN_13B_PERI_FAR_NOT_APPLICABLE = 1.8;

/**
 * §L-590 — PGM **Art. 323**, Barcelona-exclusive text (DOGC 4277, 10-12-2004), p. 185 of the NNUU
 * PDF committed under `docs/04-reference/spain/barcelona-catalonia/`.
 *
 * **max dwellings per parcel = ceil(superfície construïda ÷ 80 m²)**, for BOTH subzona I (13a,
 * intensiva) and subzona II (13b, semiintensiva).
 *
 * ⚠ THIS REPLACES A WRONG FIGURE. We previously recorded Art. 323 as "250 habitatges/ha" — a
 * DENSITY, i.e. a different kind of quantity with a different input. Retained here as the
 * correction record so nobody reinstates it from the older note.
 *
 * ⚠ It caps the PROGRAMME, never the envelope: it cannot shrink a buildable volume, and a consumer
 * must not present it as if it did. But it IS computable from a floor area, so — unlike a
 * per-hectare density — a consumer holding an envelope can state a dwelling ceiling.
 *
 * ⚠ `superfície construïda` has a specific legal definition (Art. 323.2: between exterior
 * enclosures, INCLUDING celoberts and ventilation courts, EXCLUDING cossos sortints and
 * ground-floor area beyond the fondària of the upper storeys). **An envelope GFA APPROXIMATES it
 * and is not identical to it** — any consumer must say which one it used.
 */
export const BCN_ART323_DWELLING_MODULE_M2 = 80;

/**
 * @deprecated §L-590 — WRONG RULE for Barcelona. Art. 323 is a per-parcel dwelling count derived
 * from built area (see `BCN_ART323_DWELLING_MODULE_M2`), not a per-hectare density. Kept only so a
 * stale import fails loudly at review rather than silently re-publishing 250 hab/ha.
 */
export const BCN_13B_DENSITY_CAP_HAB_PER_HA = 250;

/**
 * The Barcelona *densificació urbana semiintensiva* pack.
 *
 * `defaultConfidence: 'estimated-ruleset'` — the engine promotes a real block-solved determination
 * to `block-constructed` itself (§L-572). A pack cannot self-certify.
 */
export const ES_BARCELONA_SEMIINTENSIVA_PACK: JurisdictionZoningContract =
    JurisdictionZoningContractSchema.parse({
        jurisdictionId: 'es-08019-barcelona',
        displayName: 'Barcelona — Densificació Urbana Semiintensiva (PGM clau 13b)',
        source: 'catastro-muc',
        crs: 'EPSG:4326',
        lastReviewed: '2026-07-22',
        defaultConfidence: 'estimated-ruleset',
        zones: [
            {
                code: '13b',
                label: 'Densificació Urbana Semiintensiva (clau 13b)',
                permittedUse: ['residential', 'mixed'],
                // Every null below is argued in §NULLS in the header. None is a placeholder.
                maxHeight_m: null,   // Art. 328 — a per-street construction, not a zone scalar
                maxFloors: null,     // idem
                plotRatioFAR: null,  // no per-parcel FAR; 1,80 is PERI/estudi-de-detall gated
                maxCoverage: null,   // no coverage rule stated for Subzona II
                setbacks: { front_m: null, side_m: null, rear_m: null }, // alignment zone: null ≠ 0
                geometricRule: BCN_SEMIINTENSIVA_RULE,
                fieldProvenance: {
                    // `ordinance-pdf`, never `published-structured`: these come from consolidated
                    // ordinance text (and not from Barcelona's own copy), which is what drives the
                    // amber "verify against the ordinance" affordance rather than a green chip.
                    'alignment.depth': 'ordinance-pdf',
                    'alignment.offset': 'ordinance-pdf',
                    'alignment.sideTreatment': 'ordinance-pdf',
                    permittedUse: 'ordinance-pdf',
                },
                ordinanceRef: BCN_13B_ORDINANCE_REF,
            },
        ],
    });

/**
 * The zone codes this pack answers for.
 *
 * ONE code, and no speculative aliases. 13a carries a second code (`13E`) because a named 2002
 * municipal ordinance says `13E` substitutes clau 13 in the Eixample; **no equivalent document is
 * known for 13b**, so inventing a variant here would register a clau the MUC may never return and
 * that no source connects to this zone.
 */
export const BCN_SEMIINTENSIVA_ZONE_CODES = ['13b'] as const;
