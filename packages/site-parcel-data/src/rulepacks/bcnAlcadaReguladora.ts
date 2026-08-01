// L-525a — PGM Art. 327.2, the *alçada reguladora màxima* table for Barcelona clau 13a.
//
// WHY THIS EXISTS
// ---------------
// A 13a zone publishes NO per-parcel maximum height. Like the *profunditat edificable* (ADR-0271),
// the height is a CONSTRUCTION: the ordinance gives a table keyed by the **amplada de vial** (the
// width of the street the façade fronts), and the height falls out of which band the street sits
// in. So the pack correctly ships `maxHeight_m: null` and something must derive the number.
//
// Until now nothing did, and the consequence was worse than a missing value: the Cesium massing
// path fell back to a HARDCODED 9 m (`envelope.maxHeightM > 0 ? … : 9`) and extruded it in the
// same purple study volume as a real one. A fabricated ~PB+2 rendered indistinguishably from a
// surveyed height, on a street whose real answer is ~PB+5 — the L-459 defect class (a fabricated
// context height rendering like a measured one), reached through the envelope instead of the
// context. That is L-525a.
//
// THE TABLE IS A CONFIRMED LEGAL FACT
// -----------------------------------
// Sourced in `L-526-LEGAL-FINDINGS.md` (primary-source research, 2026-07-21) as PGM NNUU
// Art. 327.2, the height clause for Subzona I = clau 13a. Height for 13a is cited via
// Arts. 238 + 240 + 327 (per an official Barcelona *Certificat Urbanístic*).
//
// ⛔ §L-660 — THIS HEADER MADE TWO FALSE STATEMENTS ABOUT THE SOURCE. BOTH ARE CORRECTED HERE.
// ---------------------------------------------------------------------------------------------
//
// **FALSE STATEMENT 1 — "a consolidated PGM text that … carries none on this article."**
// (Corrected 2026-07-31 by §AMB-PGM-SCOPE; re-verified independently by §L-660 from the raster.)
// The consolidated text meant is the MMAMB *Normativa Urbanística Metropolitana* compendium,
// `../PGM-NNUU-metropolitana.pdf`. Its Art. 327 heading carries **footnote 49**, printed verbatim
// at PDF p.108:
//
//     49.  Veure modificació per al Municipi de Badalona a la pàg. 137
//          Veure modificació per al Municipi de Barcelona a la pàg. 276
//
// **TWO modifications, one of them Barcelona's own.** Art. 328 (13b) carries the parallel footnote
// 50 → Badalona p.137, **Barcelona p.277**. The source does not carry none; it carries Barcelona's,
// and it always did. See `BCN_ART327_MPGM_2007` for the transcription, the citation, and why three
// verification rounds read the page as blank.
//
// ⚠ AND THIS SOURCE COULD NOT HAVE CERTIFIED AN ABSENCE EVEN IF THE FOOTNOTE WERE EMPTY. It says of
// itself (PDF p.3) «no hi figuren totes les modificacions dels textos citats, només aquelles que
// s'han considerat més rellevants» and «no es tracta d'una publicació oficial sinó merament
// divulgativa», consolidated only to **31-12-2009**. Record `not-located-in-source`, never
// `does-not-exist` (`claus/EXTRACTION-PROTOCOL.md` Step 4, rewritten by this same finding).
//
// **FALSE STATEMENT 2 — "22,40 m was never a rival *alçada reguladora*". IT IS EXACTLY THAT, AND
// L-528 IS RE-OPENED.** 22,40 m is the **PB+5 row of the modified Art. 327.2a table** (PDF p.277).
// The Art. 21 cornice-increment identification was reverse-engineered to close a gap — 20,75 + 1,65
// = 22,40, and 1,65 ≤ Art. 21's 2,25 m ceiling — but *any* figure ≤ 23,00 m fits that ceiling, so
// the arithmetic confirmed nothing. `L-583-LEGAL-PARAMETERS-SOURCED.md` §3 said so itself: *"the
// listed allowances do not obviously sum to the 1,65 m gap, so the composition of 22,40 m is
// unverified"*. Worse, L-583 §3 and this file offered **two different, incompatible** explanations
// of the same number — L-583 said the **OME** rooftop allowances (badalots, railings), this file
// said the **2002 Eixample ordinance** Art. 21 — and BOTH were recorded as RESOLVED. When two
// records disagree and both say "resolved", neither is (EXTRACTION-PROTOCOL Step 9).
//
// ⚠ WHAT IS AND IS NOT WITHDRAWN. Art. 21 of the 2002 Eixample ordinance is a real instrument and
// `EIXAMPLE_CORNICE_INCREMENT_MAX_M` still records a real, conditional allowance. What is withdrawn
// is the **identification of the circulating 22,40 m figure with it**, and with it the claim that
// L-528 is closed.
//
// ⚠ THE CORROBORATION WE ALREADY HELD POINTS THE SAME WAY. `L-526-LEGAL-FINDINGS.md` recorded that
// an **official Ajuntament de Barcelona *Certificat Urbanístic*** for a 20 m street gives
// **22,40 m (PB+5)** *"via Arts. 238/240/327"* — citing **Art. 327 itself**, not the OME and not the
// Eixample ordinance — against 20,75 m taken from a **Santa Coloma de Gramenet** transcription of
// the base table. A Barcelona certificate agreeing to the centimetre with the Barcelona-specific
// modification of the very article it cites is the simplest reading of both facts. For three rounds
// it was read instead as an anomaly requiring a second instrument to explain.
//
// ⇒ THE TABLE BELOW IS THE **BASE / METROPOLITAN** Art. 327 TABLE (3,05 m ladder). If the 2007
//   modification is in force, it is the SUPERSEDED one for Barcelona — while remaining the correct
//   metropolitan reading for AMB municipalities that did not rewrite Art. 327 (L'Hospitalet,
//   Cornellà, Sant Boi all have no Art. 327 footnote entry).
//
// ⚠ NOTHING NUMERIC WAS CHANGED. Confirming the 2007 modification's force is a dated legal act
//   (L-449) and it needs the BINDING DOGC 4893 text, which we do not hold. Raised, cited and left
//   for the founder: `docs/…/08019-barcelona/L-660-ART-327-328-MPGM-2007-FOUNDER-DECISION.md`,
//   `docs/…/es-ct/AMB-PGM-SCOPE-MAP.md` §5, and `BCN_ART327_MPGM_2007` below.
//
// ⚠⚠ AND THE INPUT IS THE DANGEROUS PART — READ BEFORE FEEDING THIS A MEASURED WIDTH
// ---------------------------------------------------------------------------------
// Art. 327 keys on the **ample oficial del carrer** — the officially-declared street width from
// the planning street database — NOT a width measured off a map. Barcelona publishes no
// machine-readable official-width layer: a probe of the city's open-data CKAN (2026-07-21) found
// four `vial` datasets, the only relevant one being `mapa-base-de-vialitat`, a **WMS raster** of
// façade/pavement contours with no queryable width attribute; `amplada`/`secció`/`alineació`
// return nothing. So a GIS-measured frontage-to-frontage gap is the only available input, and it
// is NOT the legal quantity.
//
// That substitution is normally a small error. It is NOT small here, because the bands are
// STEPS: our flagship parcel (CL Pau Claris 155) has a nominal official width of exactly
// **20.00 m**, which is a band EDGE. Measured 19.99 m ⇒ PB+4 ⇒ 17.70 m. Measured 20.00 m ⇒ PB+5
// ⇒ 20.75 m. A 1 cm difference in measurement noise moves the answer a full storey (3.05 m).
//
// So this module REFUSES near a boundary rather than let measurement noise pick a storey band.
// A refusal costs an absent height (the caller shows no constructed height and says why); a guess
// costs a confidently-wrong building. That asymmetry is the same one C57 §1.5 and ADR-0271 apply
// to the block ring, and it is the whole reason this is not a one-line lookup.
//
// PURE + deterministic (C58 §1.1/§1.9): no I/O, no THREE, no DOM, no clock. Strategic context:
// C58 §1.2/§1.4 (confidence tiers + estimated values), C23 (provenance), ADR-0270 (the alignment
// rule whose `maxHeight` this fills), L-525a, L-526, L-528.

/** One row of the Art. 327.2 table. */
export interface AlcadaBand {
    /** Inclusive lower bound of the *amplada de vial* band, metres. */
    readonly minWidth_m: number;
    /** EXCLUSIVE upper bound, metres. `Infinity` on the top band. */
    readonly maxWidth_m: number;
    /** *Alçada reguladora màxima*, metres. */
    readonly height_m: number;
    /** Storeys above ground floor — PB+N. */
    readonly floorsAboveGround: number;
}

/**
 * PGM Art. 327.2 — clau 13a (Subzona I). Verbatim band structure; see the header for the source
 * and for the one uncertified figure.
 *
 * ⚠ **THIS IS THE BASE / METROPOLITAN LADDER.** For Barcelona specifically it may be superseded —
 * see `BCN_ART327_MPGM_2007`. It is deliberately still the shipped table.
 */
export const BCN_ALCADA_REGULADORA_TABLE: ReadonlyArray<AlcadaBand> = Object.freeze([
    { minWidth_m: 0, maxWidth_m: 8, height_m: 8.55, floorsAboveGround: 1 },
    { minWidth_m: 8, maxWidth_m: 12, height_m: 11.6, floorsAboveGround: 2 },
    { minWidth_m: 12, maxWidth_m: 15, height_m: 14.65, floorsAboveGround: 3 },
    { minWidth_m: 15, maxWidth_m: 20, height_m: 17.7, floorsAboveGround: 4 },
    { minWidth_m: 20, maxWidth_m: 30, height_m: 20.75, floorsAboveGround: 5 },
    { minWidth_m: 30, maxWidth_m: Infinity, height_m: 23.8, floorsAboveGround: 6 },
]);

/**
 * §L-660 — **THE BARCELONA MODIFICATION OF Arts. 327 AND 328. TRANSCRIBED, CITED, AND NOT APPLIED.**
 *
 * WHAT THIS IS FOR. It is the founder's decision packet expressed as data, so that the L-449 gate
 * is exercised against a transcription that can be diffed, tested and re-read — not against prose
 * in a commit message. `applied` is **false** and nothing in this module reads these bands. Wiring
 * them is a separate, signed change; see the impact analysis at
 * `docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/L-660-ART-327-328-MPGM-2007-FOUNDER-DECISION.md`.
 *
 * THE INSTRUMENT, verbatim from PDF p.274 (printed p.273) of `../PGM-NNUU-metropolitana.pdf`:
 *
 *   «Modificació de les Normes urbanístiques del Pla General Metropolità per a la modificació de
 *    les alçades reguladores en el tipus d'ordenació segons alineació de vial, al terme muncipal de
 *    Barcelona. Aprovada definitivament per la Subcomissió d'Urbanisme del Municipi de Barcelona,
 *    en la sessió de 2 de març de 2007. (DOGC núm. 4893 de 29/05/2007).»
 *
 *   («muncipal» is the compendium's own typo, kept.)
 *
 * ITS OWN READING KEY, same page: «Modificació de l'articulat: articulat proposat. **En negreta,
 * text afegit o modificat.**» In the reproduced Art. 327 the *Alçada màxima* column is set in bold
 * and the *Nombre màxim de plantes* column is not — i.e. the instrument changes the METRES and
 * leaves the STOREY COUNTS alone. That is visible in the numbers below and it is the single most
 * consequential structural fact about this modification (see `BCN_ART327_MPGM_2007_BAND_DELTA`).
 *
 * SCOPE, as far as the source states it — read positionally across PDF pp. 274–278, which is the
 * whole instrument (p.279 opens a different one):
 *   • **Art. 239** — Alçada (disposicions comunes, *alineació de vial*)             PDF p.274–275
 *   • **Art. 320.3a** — Nucli antic, clau **12**: 7,90 / 11,25 / 14,60 / 17,95 m    PDF p.276
 *   • **Art. 327.2a** — clau **13a**, the six bands below                           PDF p.277
 *   • **Art. 328.2a** — clau **13b**, four bands (`BCN_ART328_MPGM_2007_BANDS`)     PDF p.278
 *   It names **no sector, no *àmbit*, no *front edificatori***, and no plànol: the title's only
 *   territorial qualifier is «al terme muncipal de Barcelona». On the face of the source this is a
 *   **citywide** rewrite of the articles it lists, for the *alineació de vial* ordering type.
 *
 * ⚠⚠ WHAT WE COULD NOT VERIFY — AND IT IS EXACTLY WHAT THE SIGNATURE IS FOR
 *   1. **The binding text.** This is the MMAMB compendium's *transcription*, and the compendium
 *      declares itself «merament divulgativa». The binding text is DOGC núm. 4893 (29-05-2007) and
 *      the live RPUC/NUMAMB consolidation. **We hold neither.** Live retrieval was attempted
 *      2026-07-31 and failed: `www.amb.cat` NUMAMB returns 403 behind an anti-bot challenge (the
 *      same wall L-583 §7 hit) and the AMB geoportal `08019_*` normative pages 404.
 *   2. **Any LATER modification.** The compendium is consolidated only to 31-12-2009 and filters
 *      for "most relevant". Within it, Barcelona's last recorded instrument is #17 (Art. 264,
 *      22-07-2009, DOGC 5509) and nothing after 2007 touches Arts. 327/328 — but that is
 *      `not-located-in-source`, **never** `does-not-exist`, and it says nothing about 2010–2026.
 *
 * WHY THREE ROUNDS READ p.277 AS BLANK. The annex pages embed subset fonts with no ToUnicode,
 * glyph-shifted (+29 / −29 families). `extract_text()` returns the prose with every **digit
 * dropped**, so the article surfaces without its table — *nothing*, not garbage, which is
 * indistinguishable from "the modification does not exist". Recovered by rendering the page
 * (`page.get_pixmap(dpi=170)`) and reading the raster. Both the +29 decode and the raster were used
 * and agree.
 */
export const BCN_ART327_MPGM_2007 = {
    /** ⛔ FALSE. Nothing reads `bands`. Flipping this is a signed legal act, not a refactor. */
    applied: false,
    instrument:
        "Modificació de les Normes urbanístiques del Pla General Metropolità per a la modificació " +
        "de les alçades reguladores en el tipus d'ordenació segons alineació de vial, al terme " +
        'muncipal de Barcelona',
    approvedBy: "Subcomissió d'Urbanisme del Municipi de Barcelona",
    approvedOn: '2007-03-02',
    dogcNumber: 4893,
    dogcDate: '2007-05-29',
    /** The compendium page the transcription was read from (1-based PDF page; printed = PDF − 1). */
    sourcePdfPage: 277,
    /**
     * ⚠ The document actually read. NOT the binding text — see the block comment, limitation 1.
     * `evidence` is deliberately not `certified` and must not be promoted without the DOGC text.
     */
    source: 'MMAMB Normativa Urbanística Metropolitana compendium (non-official, consolidated to 31-12-2009)',
    evidence: 'located-in-non-official-compendium' as const,
    /** Art. 327.2a as restated. Bands and storey counts are UNCHANGED; only the metres move. */
    bands: Object.freeze([
        { minWidth_m: 0, maxWidth_m: 8, height_m: 9.0, floorsAboveGround: 1 },
        { minWidth_m: 8, maxWidth_m: 12, height_m: 12.35, floorsAboveGround: 2 },
        { minWidth_m: 12, maxWidth_m: 15, height_m: 15.7, floorsAboveGround: 3 },
        { minWidth_m: 15, maxWidth_m: 20, height_m: 19.05, floorsAboveGround: 4 },
        { minWidth_m: 20, maxWidth_m: 30, height_m: 22.4, floorsAboveGround: 5 },
        { minWidth_m: 30, maxWidth_m: Infinity, height_m: 25.75, floorsAboveGround: 6 },
    ]) as ReadonlyArray<AlcadaBand>,
    /**
     * §L-660 — **THE 3,05 / 3,35 RECONCILIATION, SETTLED BY THE TEXT ITSELF.**
     *
     * The modified Art. 327, immediately under its own table (PDF p.277), in plain roman type
     * (i.e. NOT flagged as added or modified):
     *
     *   «L'alçada mínima de les plantes, inclosos els forjats i el paviment, serà de **3,05 m**.»
     *
     * The BASE Art. 327.2a (PDF p.108) says the same thing: «L'alçada mínima de les plantes,
     * inclosos els forjats i el paviment, ha de ser de 3'05 m.» So **3,05 m is a storey MINIMUM and
     * it is unchanged by the modification.** What changed is the BAND STEP: the base ladder rises
     * 3,05 m per band (8,55 → 11,60 → … → 23,80), the modified ladder rises **3,35 m** per band
     * (9,00 → 12,35 → … → 25,75, exactly +3,35 five times).
     *
     * ⇒ `EXTRACTION-PROTOCOL.md` Step 4's rejection rationale — *"3,35 vs 3,05 m per floor"* — was
     * a **conflation of two different quantities that coexist in the same article**, not a conflict
     * between two sources. A wrong reason produced a right-looking refusal, and the refusal
     * outlived the reason. The modification does not permit taller storeys; it permits more
     * headroom above the same six storey counts.
     */
    storeyMinimum_m: 3.05,
    /** The band step of THIS ladder. Contrast `BCN_STOREY_MODULE_M` (3.05), the base ladder's. */
    bandStep_m: 3.35,
} as const;

/**
 * §L-660 — **Art. 328.2a as restated by the SAME 2007 instrument** (PDF p.278, printed p.277,
 * reached by base footnote 50). Clau **13b**. Transcribed, cited, **not applied** — the shipped 13b
 * table lives in `bcnAlcadaSemiintensiva.ts` and is untouched.
 *
 * Base (PDF p.109): 7,55 / 10,60 / 13,65 / 16,70 m. Modified: 8,25 / 12,00 / 15,40 / 18,80 m.
 * Band boundaries (<8, 8–11, 11–15, ≥15) and storey counts (PB+1…PB+4) are **unchanged**, exactly
 * as for Art. 327.
 *
 * ⚠ The instrument ALSO adds, in bold (= added text), «L'alçada total mínima, inclosos forjat i
 * paviment, serà de tres metres cinc centímetres (**3,05 m**)» — where the BASE Art. 328 read
 * «L'alçada màxima total, inclòs el forjat, ha de ser de 2,75 m. per planta pis, excepte a les
 * edificacions amb façana a carrer de més de 15 m., a les quals serà obligada l'alçada mínima de
 * 3,05 m.» That is a substantive change beyond the table and it is recorded here so a future
 * signed application does not transcribe only the numbers. It is **not** modelled.
 */
export const BCN_ART328_MPGM_2007_BANDS: ReadonlyArray<AlcadaBand> = Object.freeze([
    { minWidth_m: 0, maxWidth_m: 8, height_m: 8.25, floorsAboveGround: 1 },
    { minWidth_m: 8, maxWidth_m: 11, height_m: 12.0, floorsAboveGround: 2 },
    { minWidth_m: 11, maxWidth_m: 15, height_m: 15.4, floorsAboveGround: 3 },
    { minWidth_m: 15, maxWidth_m: Infinity, height_m: 18.8, floorsAboveGround: 4 },
]);

/**
 * §L-660 — the per-band impact, precomputed so the founder signs against numbers rather than
 * against a promise that someone will compute them later.
 *
 * ⚠⚠ **READ THE `floorsChange` COLUMN FIRST: IT IS ZERO EVERYWHERE, AND SO IS THE BAND STRUCTURE.**
 * The base and modified tables share **identical** width bands (<8, 8–12, 12–15, 15–20, 20–30, ≥30)
 * and **identical** storey counts (PB+1…PB+6). Therefore:
 *
 *   • **NO parcel changes band, and NO parcel changes storey count.** Not "few" — none, by
 *     construction. Every question about band-edge risk, official-vs-measured widths and the
 *     `BAND_EDGE_GUARD_M` refusal is **completely orthogonal** to this decision, and applying the
 *     modification would not move a single parcel across a band edge.
 *   • **EVERY 13a parcel that resolves to a height today gets a DIFFERENT metre value.** The
 *     affected population is 100 % of resolved 13a parcels, not a subset.
 *
 * That is the cleanest shape a legal correction can have: one uniform per-band delta, no
 * reclassification, no new refusals, no interaction with the width machinery.
 */
export const BCN_ART327_MPGM_2007_BAND_DELTA: ReadonlyArray<{
    readonly floorsAboveGround: number;
    readonly bandLabel: string;
    readonly base_m: number;
    readonly modified_m: number;
    readonly delta_m: number;
    readonly floorsChange: number;
}> = Object.freeze([
    { floorsAboveGround: 1, bandLabel: '< 8 m', base_m: 8.55, modified_m: 9.0, delta_m: 0.45, floorsChange: 0 },
    { floorsAboveGround: 2, bandLabel: '8–12 m', base_m: 11.6, modified_m: 12.35, delta_m: 0.75, floorsChange: 0 },
    { floorsAboveGround: 3, bandLabel: '12–15 m', base_m: 14.65, modified_m: 15.7, delta_m: 1.05, floorsChange: 0 },
    { floorsAboveGround: 4, bandLabel: '15–20 m', base_m: 17.7, modified_m: 19.05, delta_m: 1.35, floorsChange: 0 },
    { floorsAboveGround: 5, bandLabel: '20–30 m', base_m: 20.75, modified_m: 22.4, delta_m: 1.65, floorsChange: 0 },
    { floorsAboveGround: 6, bandLabel: '≥ 30 m', base_m: 23.8, modified_m: 25.75, delta_m: 1.95, floorsChange: 0 },
]);

/**
 * ⛔ §L-660 — **L-528 IS RE-OPENED. THE "RESOLVED" HEADING BELOW NO LONGER HOLDS.**
 *
 * This doc-comment used to open *"§L-528 RESOLVED (L-583 §3) — 22,40 m WAS NEVER A COMPETING
 * *ALÇADA REGULADORA*"*. **22,40 m is the PB+5 row of Art. 327.2a as modified for Barcelona by the
 * MPGM of 02-03-2007 (DOGC 4893, 29-05-2007)** — a competing *alçada reguladora* in precisely the
 * sense L-528 asked about. See `BCN_ART327_MPGM_2007` and the module header.
 *
 * ⚠ WHAT SURVIVES AND WHAT DOES NOT.
 *   • **SURVIVES:** the constant's VALUE and its rule. Art. 21 of the 2002 Eixample ordinance is a
 *     real instrument granting a real cornice increment of up to 2,25 m, it is conditional, and we
 *     verify none of its conditions — so it is still surfaced as an allowance and never as a height.
 *     Nothing about how this constant is used changes.
 *   • **DOES NOT SURVIVE:** the *identification* of the circulating 22,40 m figure with this
 *     allowance. That identification rested on `20,75 + 1,65 = 22,40` and `1,65 ≤ 2,25` — but any
 *     figure ≤ 23,00 m satisfies that, so it distinguished nothing. It also contradicted L-583 §3's
 *     own published explanation of the same number (the OME rooftop allowances), and BOTH were
 *     recorded as resolved.
 *   • The text below is kept **as the record of a withdrawn identification**, because deleting it
 *     would erase the reasoning a reader needs in order to not re-derive it.
 *
 * ORIGINAL TEXT FOLLOWS, RETAINED FOR THE RECORD:
 *
 * WHAT 22,40 m WAS SAID TO BE. Barcelona's **Ordenança de Rehabilitació i Millora de l'Eixample**
 * (Consell Plenari, 22-11-2002), **Art. 21**: a building may exceed the *alçada reguladora màxima*
 * by up to **2,25 m** to form a cornice line / harmonise floor heights with **adjacent buildings
 * predating 1932**, provided the increase adds **no storeys** and does not raise the ground floor.
 * The ordinance names the result with its own legal term — ***alçada reguladora incrementada*** —
 * and Art. 17 distinguishes construction above "the maximum regulated height **or** the increased
 * regulated height per Art. 21.2.3".
 *
 *   20,75 m (Art. 327 table, 20–30 m street, PB+5)  +  1,65 m  =  22,40 m   ⊂  the 2,25 m ceiling
 *
 * ⚠ **IT IS NOT BAND-SPECIFIC.** The old code gated this on `floorsAboveGround === 5`, which was an
 * artefact of the 22,40-vs-20,75 confusion, not a rule. Art. 21 is written against the ARM, whatever
 * band produced it.
 *
 * ⚠ **AND IT IS CONDITIONAL, SO IT IS NEVER APPLIED HERE.** It requires (a) the parcel to lie inside
 * the *Conjunt Especial de l'Eixample*, and (b) adjacent buildings predating 1932. **We verify
 * neither.** Reporting an increased height without checking its conditions would be exactly the
 * fabrication C58 §1.4 forbids. This is surfaced as an *available allowance the user should be aware
 * of*, never as a height we assert.
 *
 * Confidence: `published` — Barcelona's OWN municipal ordinance (not a mirror). See L-583 §3.
 */
export const EIXAMPLE_CORNICE_INCREMENT_MAX_M = 2.25;

/**
 * How close to a band edge (metres) counts as TOO CLOSE to decide from a measured width.
 *
 * 0.5 m. Rationale, not taste: the input is a frontage-to-frontage distance derived from cadastral
 * parcel geometry, whose own positional accuracy is decimetric at best, and it is standing in for
 * a legally-declared figure it is not guaranteed to equal. Half a metre is comfortably inside the
 * narrowest band (3 m) so it can never swallow one whole, and comfortably outside plausible
 * cadastral noise. It matters because the bands are steps: crossing one moves the answer 3.05 m.
 */
export const BAND_EDGE_GUARD_M = 0.5;

/**
 * §L-586 — **0.5 m IS A FLOOR, NOT THE WHOLE ERROR.**
 *
 * The constant above is a *substitution* allowance: it prices the gap between a GIS-measured
 * frontage gap and the legally-declared figure it stands in for. It says nothing about how noisy
 * this particular measurement was. `StreetWidthMeasurement` already carries that separately as
 * `spread_m` (max − min across the rays), and the module that produces it calls that value "THE
 * ERROR BAR — the caller must not treat `width_m` as tighter than this".
 *
 * The guard was ignoring it, and the hole is not theoretical. In the L-586 live sweep, PS Gràcia 66
 * measured **19.15 m with a spread of 0.87 m** — its own samples reach 20.02 m, i.e. ACROSS the
 * 20 m band edge — and it nonetheless shipped 17.70 m (PB+4) with the guard satisfied, because
 * 19.15 ± 0.5 stays inside the 15–20 band. That is precisely the outcome the guard exists to
 * prevent: the noise, not the measurement, choosing a storey.
 *
 * So the effective guard is `max(BAND_EDGE_GUARD_M, spread_m)`. It can only ever WIDEN — passing a
 * tight measurement never relaxes the 0.5 m substitution allowance, because that allowance is about
 * a different error entirely.
 */
export function effectiveBandEdgeGuard_m(measurementSpread_m?: number | null): number {
    return typeof measurementSpread_m === 'number' && Number.isFinite(measurementSpread_m) &&
        measurementSpread_m > BAND_EDGE_GUARD_M
        ? measurementSpread_m
        : BAND_EDGE_GUARD_M;
}

/**
 * BARCELONA-GIS-AUDIT-SPIKE — the storey MODULE implied BY the Art. 327.2 table, for turning an
 * EXTERNALLY-SOURCED floor count (the AMB Refós `OV_Trames.PLANTES`) into an approximate height.
 *
 * WHY THIS IS HERE AND NOT A NEW NUMBER. The clau-18 volumetric path resolves a FLOOR COUNT from
 * the Refós (`B+7`, …), not a height in metres — the height still needs a floors→metres convention.
 * The Art. 327.2 table already encodes one: its six bands are a straight line
 * `height = base + module × floorsAboveGround`, with `module = (23.8 − 8.55)/(6 − 1) = 3.05` m and
 * `base = 8.55 − 3.05 = 5.5` m (check: `5.5 + 3.05×5 = 20.75` ✓, the PB+5 band). Reusing THAT slope
 * — rather than inventing a per-floor figure — is the point: the conversion inherits the table's own
 * storey module instead of a second, free-to-disagree constant.
 *
 * ⚠⚠ IT IS AN ESTIMATE, AND IT IS WHY THE clau-18 ENVELOPE IS `estimated-ruleset`, NEVER
 * `structured`. Two honest limits:
 *   1. The table is clau-13a's (Subzona I). Its storey module is a reasonable Barcelona residential
 *      convention, but it is not clau 18's OWN sourced floor-height — clau 18 has none (its height
 *      is the drawn volumetric ordering). So a metre height here is a convention applied to a
 *      sourced floor count, not a sourced height.
 *   2. The table's bands stop at PB+6 (`height_m` up to 23.8 m); clau-18 `OV_Trames` reaches B+32.
 *      For floor counts INSIDE the table we return the band's certified height verbatim; ABOVE it we
 *      EXTRAPOLATE on the same slope and say so (`basis: 'table-module-extrapolated'`).
 */
export const BCN_STOREY_MODULE_M = 3.05;
export const BCN_GROUND_FLOOR_DATUM_M = 5.5;

export type FloorsToHeightBasis = 'table-exact' | 'table-module-extrapolated';

export interface FloorsToHeight {
    /** *Alçada reguladora* estimate, metres. */
    readonly height_m: number;
    /**
     * `table-exact` — the floor count matched a real Art. 327.2 band; `height_m` is that band's
     * certified figure. `table-module-extrapolated` — above the table's PB+6, computed on the
     * table's own storey module. The caller MUST surface the latter as an estimate.
     */
    readonly basis: FloorsToHeightBasis;
}

/**
 * BARCELONA-GIS-AUDIT-SPIKE — convert a floor count (storeys ABOVE the ground floor, e.g. the `7` in
 * `B+7`) to an *alçada reguladora* estimate, reusing the Art. 327.2 table (see the module comment).
 *
 * Returns `null` for a non-positive / non-integer input rather than guessing. Within the table's
 * PB+1..PB+6 range the answer is the band's certified height; above it, an extrapolation on the
 * table's storey module, flagged so the caller tiers it as an estimate.
 *
 * ⚠ NOT a certified height — see the module comment's two honest limits. The clau-18 envelope that
 * consumes this is `estimated-ruleset` for exactly this reason.
 */
export function heightFromFloorsAboveGround(floorsAboveGround: number): FloorsToHeight | null {
    if (!Number.isInteger(floorsAboveGround) || floorsAboveGround < 1) return null;
    const band = BCN_ALCADA_REGULADORA_TABLE.find(
        (b) => b.floorsAboveGround === floorsAboveGround,
    );
    if (band) return { height_m: band.height_m, basis: 'table-exact' };
    // Above PB+6 — extrapolate on the table's own slope. ESTIMATE.
    return {
        height_m: BCN_GROUND_FLOOR_DATUM_M + BCN_STOREY_MODULE_M * floorsAboveGround,
        basis: 'table-module-extrapolated',
    };
}

export type AlcadaResolution =
    | {
          readonly ok: true;
          readonly height_m: number;
          readonly floorsAboveGround: number;
          readonly band: AlcadaBand;
          /**
           * §L-583 — the Art. 21 cornice increment (m) that MAY be added on top of `height_m`
           * under Barcelona's Ordenança de l'Eixample, if its conditions hold.
           *
           * ⚠ **NOT APPLIED, and NOT a rival height.** `height_m` remains the *alçada reguladora
           * màxima*. This is a separate allowance whose preconditions (inside the Conjunt Especial
           * de l'Eixample; adjacent buildings predating 1932) we do NOT verify — so a consumer must
           * present it as "an increment of up to X m may apply", never as a height.
           */
          readonly corniceIncrementMax_m: number | null;
      }
    | {
          readonly ok: false;
          /**
           * `band-edge`   — the width sits within `BAND_EDGE_GUARD_M` of a band boundary, so a
           *                 measured value cannot choose the storey band. Needs the official width.
           * `bad-input`   — not a usable positive finite width.
           *
           * §L-590 — the two below are **APPLICABILITY** refusals, not measurement refusals: the
           * width was fine, the TABLE does not govern this parcel. They exist because PGM Art. 350
           * (clau 22a) splits into two regimes — 350.1 for industrial land WITH a definitively
           * approved *Pla Parcial* (whose own plànols/ordenances then give the height) and 350.2
           * for land WITHOUT one (whose height table we encode). Arts. 327/328 never emit them;
           * they are declared on the SHARED type rather than on a parallel one so every consumer
           * that already renders a refusal reason keeps working, with no second resolution shape
           * to drift apart from this one.
           *
           * `pla-parcial-governs`  — established that a Pla Parcial covers the parcel ⇒ Art. 350.1;
           *                          the height is in a document PRYZM does not hold.
           * `pla-parcial-unknown`  — NOT established either way. ⚠ Distinct from `governs` on
           *                          purpose: "we did not look" must never harden into "there is
           *                          none", which is the reading that would let Art. 350.2's table
           *                          answer for land it may not govern.
           */
          readonly reason:
              | 'band-edge'
              | 'bad-input'
              | 'pla-parcial-governs'
              | 'pla-parcial-unknown';
          /** The two candidate heights straddling the edge, for an honest "we cannot say" message. */
          readonly straddles: readonly number[];
      };

/**
 * Resolve the *alçada reguladora màxima* from an *amplada de vial*.
 *
 * PURE, deterministic, never throws. Returns `ok: false` rather than a number whenever the input
 * cannot legitimately decide the answer — see the header on why refusing beats guessing here.
 *
 * @param amplada_m  the street width in metres. **Pass the OFFICIAL width when you have one.**
 * @param opts.trustedOfficialWidth  set TRUE only when `amplada_m` came from the planning street
 *   database (the *ample oficial*), not from measuring geometry. An official width is exact by
 *   definition, so it may sit ON a band edge legitimately and the guard is skipped.
 * @param opts.measurementSpread_m  §L-586 — the measurement's OWN error bar
 *   (`StreetWidthMeasurement.spread_m`). Widens the guard when it exceeds `BAND_EDGE_GUARD_M`;
 *   never narrows it. Omit only when there is no measurement behind the width.
 */
export function resolveAlcadaReguladora(
    amplada_m: number,
    opts: {
        readonly trustedOfficialWidth?: boolean;
        readonly measurementSpread_m?: number | null;
    } = {},
): AlcadaResolution {
    if (typeof amplada_m !== 'number' || !Number.isFinite(amplada_m) || amplada_m <= 0) {
        return { ok: false, reason: 'bad-input', straddles: [] };
    }

    const bandFor = (w: number): AlcadaBand =>
        BCN_ALCADA_REGULADORA_TABLE.find((b) => w >= b.minWidth_m && w < b.maxWidth_m) ??
        BCN_ALCADA_REGULADORA_TABLE[BCN_ALCADA_REGULADORA_TABLE.length - 1]!;

    if (!opts.trustedOfficialWidth) {
        // Would nudging the measured width by the guard change the storey band? If so, the
        // measurement is not what decided the answer — the noise is — and we must not answer.
        // §L-586 — the guard is the substitution allowance OR this measurement's own error bar,
        // whichever is larger. See `effectiveBandEdgeGuard_m`.
        const guard = effectiveBandEdgeGuard_m(opts.measurementSpread_m);
        const low = bandFor(Math.max(0.000001, amplada_m - guard));
        const high = bandFor(amplada_m + guard);
        if (low.height_m !== high.height_m) {
            return {
                ok: false,
                reason: 'band-edge',
                straddles: [low.height_m, high.height_m],
            };
        }
    }

    const band = bandFor(amplada_m);
    return {
        ok: true,
        height_m: band.height_m,
        floorsAboveGround: band.floorsAboveGround,
        band,
        // §L-583 — available on ANY band (Art. 21 is written against the ARM, not a storey count).
        // The old `floorsAboveGround === 5` gate was an artefact of the 22,40-vs-20,75 confusion.
        corniceIncrementMax_m: EIXAMPLE_CORNICE_INCREMENT_MAX_M,
    };
}
