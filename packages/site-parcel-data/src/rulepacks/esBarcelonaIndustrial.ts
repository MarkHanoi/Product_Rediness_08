// L-590 — Barcelona (INE 08019) rule pack for clau **`22a`**, *Zona Industrial* (PGM Secció 8a,
// Arts. 348–351).
//
// PRIMARY SOURCE, READ DIRECTLY
// -----------------------------
// `docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/PGM-NNUU-metropolitana.pdf` — the MMAMB re-edition
// of the *Normativa Urbanística Metropolitana* (1976 NNUU · 1988 Text Refós · later updates).
// **Art. 350 is on PDF page 116 (printed page 115).** Every figure below was extracted with glyph
// coordinates and cross-checked against the PDF's content-stream reading order, which is what
// establishes the paragraph numbering — the thing `extract_text()` destroys.
//
// ⚠⚠⚠ **THIS PACK IS AUTHORED, TESTED, CITED, SOLVED — AND STILL *NOT* REGISTERED IN
// `registry.ts`.** ⚠ **THE REASON CHANGED ON 2026-07-22; READ IT AGAIN EVEN IF YOU READ IT BEFORE.**
//
// L-590's headline finding was that **Art. 350's envelope is two-tier and our `GeometricRule` /
// `BuildableEnvelope` model was single-prism**, so registering the pack would have handed every
// 22a parcel an envelope covering **100 %** of its plot while the very same card published a
// **90 %** occupation cap from the same article. **§L-590b / ADR-0273 closed that.** The
// `tiered-occupation` rule kind exists, `BuildableEnvelope` carries `tiers`, this pack's
// `geometricRule` is no longer null, and the two-tier solve is verified end to end against a real
// block in `esBarcelonaIndustrialPack.test.ts`.
//
// ⚠ WHAT STILL BLOCKS REGISTRATION IS THE OTHER BLOCKER, WHICH NO AMOUNT OF ENGINEERING CLOSES:
// **we cannot establish which of Art. 350's two regimes governs a parcel** (see the section
// below), and — the part most easily missed — **that gates the FOOTPRINT, not only the height.**
// Only the FAR and the occupation are restated by Art. 350.1 and therefore regime-neutral;
// Art. 350.2.b's band is not. `BCN_22A_ENVELOPE_BLOCKER` carries the argument and a `.closed`
// list recording exactly what ADR-0273 answered.
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
// ⚠ THE GOOD NEWS, AND IT IS A REAL FINDING — **BUT IT WAS OVERSTATED ONCE AND IS NOW EXACT
// (§L-590c, re-read from p. 116 on 2026-07-22).** See `BCN_22A_REGIME_NEUTRAL_LIMITS`:
//   • **The FAR of 2 m²st/m²s is UNCONDITIONAL.** All THREE paragraphs state it — 350.1.1r,
//     350.1.2n and 350.2.a — so it survives the regime question AND the ordering-type question.
//   • **The 90 % occupation is CONDITIONAL.** 350.1.1r and 350.2.a state it for *alineacions a
//     vial* sectors; 350.1.**2n** states **70 %** for *edificació aïllada* sectors. Art. 349.1
//     makes *alineacions de vial* the ordering type only *"si no n'hi ha"* a Pla Parcial — with
//     one, the type is *"l'establert a l'indicat Pla Parcial"*. So a bare "90 %" would over-state
//     by 20 pp on an *aïllada* sector, and the condition travels with the number everywhere.
// Only the HEIGHT and the BAND are gated outright; the occupation is gated conditionally.
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
// PURE + deterministic (C58 §1.1). Strategic context: C58 §1.1/§1.2/§1.4/§1.7a/**§1.7b**/§1.11,
// **C58 KG-6**, ADR-0270, ADR-0271, **ADR-0273**, L-526, L-583, L-584, L-590, §L-590b.

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
    'Refós), p. 116, committed at docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/' +
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
    /** Registered in `registry.ts`? Still NO — but for ONE reason now, not two. */
    registered: false,
    /**
     * ⚠ **BLOCKER 1 IS CLOSED (§L-590b / ADR-0273).** The rule kind this constant named as missing
     * now EXISTS, is solved, and is what this pack's `geometricRule` carries.
     */
    missingRuleKind: null,
    /** The `GeometricRule` kind Art. 350.2 needed — shipped, and named here so the closure is
     *  traceable from the constant that demanded it. */
    ruleKind: 'tiered-occupation',
    /**
     * ⚠ THE ONE REASON LEFT, AND IT IS NOT AN ENGINEERING ONE.
     *
     * Art. 350.2.a–f govern only 22a land *mancada de Pla Parcial*. Land WITH a
     * definitively-approved Pla Parcial is governed by Art. 350.1, under which the PGM imposes
     * only the FAR and occupation ceilings and everything else — height, storeys, and any band —
     * comes from that plan's own plànols and ordenances. **PRYZM holds no source establishing
     * which regime covers a given parcel**: neither the Catastro parcel nor the MUC
     * (`CODI_QUAL_MUC` / `DESC_QUAL_AJUNT`) carries it.
     *
     * ⚠ AND THIS BLOCKS THE *FOOTPRINT*, NOT ONLY THE HEIGHT — which is the point most likely to
     * be missed by someone reading only `resolveAlcadaIndustrial`'s refusal. The FAR (2 m²st/m²s)
     * and the occupation (90 %) survive the regime question because Art. 350.1.1r states the same
     * pair, so this pack ships them either way. **Art. 350.2.b's band does not.** Registering the
     * pack today would apply a 70 %-of-block band, cited to Art. 350.2.b, to parcels Art. 350.1
     * may govern — a wrong citation on someone's land, which is L-526 exactly. The error would be
     * in the CONSERVATIVE direction (the band only ever restricts), and "conservative" has never
     * been the test here: an under-stated envelope on 17.5 % of the city is a real cost, and a
     * confident mis-citation is the specific harm this codebase keeps paying for.
     *
     * ⇒ Unblocking is a DATA or a LEGAL step, not an engineering one:
     *   (i) a Pla-Parcial coverage layer for Barcelona's industrial land, or
     *  (ii) a founder ruling that 22a inside the municipality is `'none'` by default.
     * Both are determinations about the law, and the pack's whole discipline is that those are
     * not made silently by an implementer.
     */
    reasons: Object.freeze([
        'Art. 350.2 governs only 22a land mancada de Pla Parcial, and PRYZM holds no source ' +
            'establishing whether a definitively-approved Pla Parcial covers a given parcel. ' +
            'This gates the FOOTPRINT (Art. 350.2.b’s band) as well as the height, because only ' +
            'the FAR and the occupation are restated by Art. 350.1 and therefore regime-neutral.',
        '§L-590c — and the occupation is regime-neutral only CONDITIONALLY: Art. 350.1.2n caps ' +
            'an *edificació aïllada* sector at 70 %, not 90 %, and Art. 349.1/349.2 make the ' +
            'ordering type itself a property of the Pla Parcial (or of a PERI / Estudi de ' +
            'Detall). So the regime question gates a SECOND number as well, and the 90 % ships ' +
            'only with that condition stated in the same sentence.',
    ]),
    /**
     * The blockers this constant used to carry and that are now CLOSED. Kept rather than deleted
     * so a reader of the git history — or of the test that guards this file — can see WHICH
     * argument was answered and by what, instead of finding a list that mysteriously shrank.
     */
    /**
     * §L-590c — **THE FOUNDER RULING, 2026-07-22.** Three options were put; this is the one taken,
     * and the two that were not, recorded so nobody re-litigates them from memory.
     *
     * *"C converts our largest owned gap into an honest answer this week and cannot be wrong. B is
     * the real fix and we don't yet know its price. A is the only one that buys the 15 points, and
     * it buys them by asserting a legal fact we haven't verified — on the one axis (height) where
     * we haven't established the error direction. If B turns out to be a dead end, A becomes
     * reasonable — but then it's a decision made with evidence that no coverage layer exists,
     * which is a much better footing than making it today."*
     *
     * ⚠ **OPTION A — defaulting `PlaParcialRegime` to `'none'` inside the municipality — IS ON
     * HOLD AND MUST NOT BE IMPLEMENTED.** `resolveAlcadaIndustrial` keeps refusing on `unknown`,
     * and no permissive default may be added anywhere. Track B has since returned evidence that
     * makes A look actively wrong on real land: Barcelona's own municipal planning WMS reports
     * the Zona Franca 22a polygon as governed by *"PP de ordenación del Polígono industrial del
     * Consorcio Zona Franca"* (`CODI_PLA S164`, definitively approved 16-02-1968) with its own
     * heights of **18,30 m / 24,40 m** — against the 9 / 13 / 17 m of Art. 350.2.c. Assuming
     * `'none'` there would have UNDER-stated the ceiling by roughly a third on real parcels.
     */
    founderRuling: Object.freeze({
        date: '2026-07-22',
        chosen: 'C now, B in parallel, hold A',
        optionAOnHold:
            'Assume no Pla Parcial by default inside the municipality. NOT implemented. ' +
            'resolveAlcadaIndustrial must keep refusing on `unknown`; no permissive default.',
    }),
    /**
     * §L-590c — what SHIPPED under Track C, so "22a refuses" is no longer the whole story.
     *
     * The clau no longer returns the generic *"PRYZM has not encoded this zone yet"* coverage gap
     * — that statement was false the moment this pack was authored. It now returns a NAMED
     * `regime-undetermined` refusal that states the regime-neutral half of Art. 350 under its own
     * citation and names the exact missing input for the rest.
     */
    shipped: Object.freeze([
        '§L-590c — the FAR (2 m² sostre/m² sòl) is published as an UNCONDITIONAL Art. 350 fact: ' +
            'Arts. 350.1.1r, 350.1.2n and 350.2.a all state it, so it survives both the regime ' +
            'question and the ordering-type question. See BCN_22A_REGIME_NEUTRAL_LIMITS.',
        '§L-590c — the 90 % occupation is published WITH its condition attached (Art. 350.1.2n ' +
            'caps *aïllada* sectors at 70 %), because a bare 90 % would over-state by 20 pp on ' +
            'any sector a Pla Parcial ordered as *edificació aïllada* — the direction C58 §1.4 ' +
            'forbids. The earlier framing of this finding called the pair flatly regime-neutral; ' +
            'only the FAR is.',
        '§L-590c — the refusal NAMES THE MISSING INPUT ("is a definitively-approved Pla Parcial ' +
            'in force here, and if so what ordering type does it assign this sector?") under a ' +
            'new fourth refusal code `regime-undetermined` (ADR-0276), rather than wearing ' +
            '`no-rule-pack` (false: the pack exists) or `source-data-unavailable` (false, and ' +
            'harmful: it is the TRANSIENT code and would invite an eternal retry).',
    ]),
    closed: Object.freeze([
        '§L-590b / ADR-0273 — the two-tier solid IS now expressible: GeometricRule gained the ' +
            '`tiered-occupation` kind and BuildableEnvelope gained `tiers`, with the legacy ' +
            'single-prism fields pinned to the principal tier so no consumer can over-state.',
        '§L-590b — `geometricRule` is no longer null, so the "whole parcel at the tall tier’s ' +
            'height" failure is unreachable: the engine now splits the parcel at the band ' +
            'boundary and caps the study volume with the Art. 350.2.a occupation figure.',
        '§L-590b — block-derived-alignment was correctly rejected and stays rejected. The new ' +
            'kind states NO depth bounds (Art. 350 states none) and models the band ratio as the ' +
            'EQUALITY the article states, not as Art. 242.2’s minimum.',
    ]),
} as const;

/**
 * §L-590c / ADR-0276 — **WHAT ART. 350 STATES NO MATTER WHICH REGIME GOVERNS THE PARCEL.**
 *
 * This is the half of clau 22a that ships TODAY, through the `regime-undetermined` refusal
 * (`barcelonaRegimeUndeterminedRefusal` in `esBarcelonaZoneClassification.ts`). The other half —
 * the Art. 350.2.c height and the Art. 350.2.b band — stays refused, because it is the half the
 * regime question actually gates.
 *
 * ⚠ **RE-READ FROM THE PRIMARY TEXT ON 2026-07-22, AND THE READING CORRECTED ONE OF THE TWO
 * FIGURES.** All three paragraphs of Art. 350 were extracted glyph-by-glyph from p. 116 and
 * re-assembled in reading order:
 *
 *   • **Art. 350.1.1r** (Pla Parcial, sector ordered *segons alineacions a vial*) — *"la intensitat
 *     d'edificació per parcel·la no podrà passar de **2 m² sostre/m² sòl**, l'ocupació màxima de la
 *     parcel·la ha de ser del **90 per 100**."*
 *   • **Art. 350.1.2n** (Pla Parcial, sector ordered *edificació aïllada*) — *"la intensitat
 *     d'edificació per parcel·la no podrà passar de **2 m² sostre/m² sòl**, l'ocupació màxima de la
 *     parcel·la es limitarà al **70 per 100**…"*
 *   • **Art. 350.2.a** (*mancada de Pla Parcial*) — *"la intensitat d'edificació per parcel·la no
 *     podrà passar de **2 m² sostre/m² sòl** i l'ocupació màxima de la parcel·la ha de ser del
 *     **90 per 100**."*
 *
 * ⇒ **THE FAR IS STATED IDENTICALLY IN ALL THREE.** It survives both the regime question AND the
 * ordering-type question, and is therefore UNCONDITIONAL on this clau. That is the strongest
 * statement in this file.
 *
 * ⚠⚠ **THE OCCUPATION IS *NOT* UNCONDITIONAL, AND THE EARLIER FRAMING OF THIS FINDING SAID IT
 * WAS.** 90 % holds under Art. 350.2.a and under Art. 350.1.**1r**; under Art. 350.1.**2n** the cap
 * is **70 %**. Art. 349.1 makes *segons alineacions de vial* the ordering type only *"si no n'hi
 * ha"* a Pla Parcial — where one exists, the ordering type is *"l'establert a l'indicat Pla
 * Parcial"*, which may be *edificació aïllada*; and Art. 349.2 lets a PERI or Estudi de Detall
 * convert sectors to *aïllada*. So publishing a bare "90 %" would OVER-state occupation by 20
 * percentage points on any 22a sector a Pla Parcial ordered as *aïllada* — the one error direction
 * C58 §1.4 forbids outright. The condition therefore travels WITH the number, in the same
 * sentence, wherever it is shown. It is not a caveat that can be dropped for brevity.
 *
 * ⚠ AND NEITHER FIGURE MAY BE WRITTEN INTO A `BuildableEnvelope` NUMERIC FIELD. C58 §1.13.3: a
 * refused envelope nulls every number, because `storeyCap`, the generators and the massing path
 * read those and will extrude one. These are PROSE facts under a citation (C58 §1.13.7) — which is
 * also the only form that can carry the occupation's condition at all.
 */
export const BCN_22A_REGIME_NEUTRAL_LIMITS = {
    /**
     * FAR, m² sostre / m² sòl. **Unconditional** — Arts. 350.1.1r, 350.1.2n and 350.2.a all state
     * it. Read live from the pack so the published figure and the encoded one cannot drift.
     */
    plotRatioFAR: 2,
    /** The paragraphs that state the FAR. All three of them; that is the point. */
    plotRatioFARArticles: '350.1.1r · 350.1.2n · 350.2.a',
    /** Parcel occupation, as a fraction. **CONDITIONAL** — see `maxCoverageCondition`. */
    maxCoverage: 0.9,
    /** The paragraphs that state 90 %. */
    maxCoverageArticles: '350.1.1r · 350.2.a',
    /**
     * ⚠ The condition that MUST be shown in the same sentence as the 90 %. Never drop it: without
     * it the figure over-states by 20 pp on an *aïllada* sector (Art. 350.1.2n ⇒ 70 %).
     */
    maxCoverageCondition:
        'where the sector is ordered *segons alineacions de vial* — which Art. 349.1 makes the ' +
        'default in the absence of a Pla Parcial. A Pla Parcial (or a PERI / Estudi de Detall ' +
        'under Art. 349.2) may instead order a sector as *edificació aïllada*, where ' +
        'Art. 350.1.2n caps occupation at 70 %.',
    /** The *aïllada* alternative, named so the 70 % is never re-discovered as a surprise. */
    maxCoverageAilladaAlternative: 0.7,
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

                // ── §L-590b / ADR-0273 — THE TWO-TIER RULE. Was the most important NULL in this
                // package; the kind it was waiting for now exists. ────────────────────────────
                //
                // Art. 350.2 divides the parcel at a line drawn on the BLOCK:
                //   • inside the band concentric with the block alignments whose area EQUALS 70 %
                //     of the block (Art. 350.2.b) → the Art. 350.2.c street-width height;
                //   • in the block interior beyond it (Art. 350.2.e) → 5 m, one indivisible storey.
                //
                // ⚠ IT IS STILL NOT `block-derived-alignment`, and must never be changed to it:
                // that kind REQUIRES `minDepth_m`/`maxDepth_m` Art. 350 never states, and its
                // `interiorFreeRatio` is Art. 242.2's MINIMUM where 350.2.b states an EQUALITY.
                // See `TieredOccupationRuleSchema` for the three-way rejection in full.
                //
                // ⚠ THE RATIO STATED HERE IS THE BAND'S OWN (0.70, *"superfície igual al 70 per
                // 100 d'aquesta"*), NOT its complement. `BCN_ART350_2B_INTERIOR_FREE_RATIO` (0.30)
                // remains the recorded complement and is numerically equal to Art. 242.2's
                // `interiorFreeRatio` — a coincidence that is a trap, which is exactly why this
                // field transcribes the article's own number rather than the derived one.
                geometricRule: {
                    kind: 'tiered-occupation',
                    // Art. 349 — *edificació segons alineacions (de vial)*: the façade sits ON the
                    // street line, so the offset is 0 and the laterals are party walls. `0` is
                    // correct here (unlike the setback triple, which is null) because *alineació a
                    // vial* IS the positive statement "build on the line" — the same call
                    // `esBarcelonaEnsanche.ts` makes for 13a under Art. 242.
                    alignTo: 'street',
                    alignmentOffset_m: 0,
                    sideTreatment: 'party-wall',
                    // Art. 350.2.b.
                    bandAreaRatioOfBlock: 0.7,
                    // Art. 350.2.e — 5 m, *"una única planta indivisible"*, measured from the
                    // rasant to the underside of the roof structure (L-584 applies: we extrude
                    // from a flat datum, which is a platform-wide defect, not this pack's).
                    interiorTierHeight_m: 5,
                    interiorTierFloors: 1,
                },

                fieldProvenance: {
                    // `ordinance-pdf` — this IS the ordinance PDF, read directly. It is a better
                    // source than 13b's municipal mirrors and still not an authenticated one, so
                    // it drives the amber "verify against the ordinance" affordance, never a green
                    // chip. There is no provenance value for "primary but re-typeset", and
                    // inventing one is a schema change, not a pack decision.
                    maxFAR: 'ordinance-pdf',
                    maxCoverage: 'ordinance-pdf',
                    permittedUse: 'ordinance-pdf',
                    // §L-590b — the tier rows (`tier.bandAreaRatio`, `tier.bandDepth`,
                    // `tier.interiorHeight`) read this. Without it they would badge
                    // `estimated`, i.e. the panel would present numbers read verbatim off p. 116
                    // of the ordinance as PRYZM's guesses. ⚠ It badges the RATIO and the 5 m,
                    // which ARE in the article — never the constructed DEPTH's accuracy, which is
                    // a property of our geometry and is reported separately (C58 §1.12).
                    geometricRule: 'ordinance-pdf',
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
