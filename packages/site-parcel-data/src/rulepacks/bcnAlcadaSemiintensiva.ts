// L-583 §4 — PGM **Art. 328**, the *alçada reguladora màxima* table for Barcelona clau **13b**
// (*Densificació Urbana **Semi**intensiva*, Subzona II).
//
// WHY THIS IS A SEPARATE FILE FROM `bcnAlcadaReguladora.ts`
// --------------------------------------------------------
// `bcnAlcadaReguladora.ts` is **Art. 327**, and Art. 327 is Subzona I (`13a`) ONLY. The two
// articles are the same CONSTRUCTION — height and storeys fall out of the *amplada de vial* band
// — and they are DIFFERENT NUMBERS. L-583 §4 measured the difference: 13b's ladder steps by
// 3,05 m (the generic PGM floor-to-floor) where the shipped 13a table steps by 3,05 m from a
// different base, and 13b tops out at PB+4 against 13a's PB+6. **The 13b table is not derivable
// from the 13a table by any transformation** (L-552 §3.2), so it is transcribed independently and
// kept in its own module, where a future edit to one cannot silently move the other.
//
// (Mechanical note for the reconciliation: `bcnAlcadaReguladora.ts` is being edited concurrently
// for the Art. 327 / layer-5 work. This module only IMPORTS from it — the shared band TYPE, the
// shared resolution TYPE and the band-edge guard — and changes nothing there.)
//
// THE TABLE, AND EXACTLY HOW WELL SOURCED IT IS
// ---------------------------------------------
// `L-583-LEGAL-PARAMETERS-SOURCED.md` §4, confidence **`corroborated`**:
//   • the band BOUNDARIES (<8, 8–11, 11–15, ≥15) appear independently in a second municipality's
//     published page;
//   • the VALUES come from the Santa Coloma de Gramenet consolidated *refós*, a document that
//     flags its own local rewrites (*"Nou redactat"*) and carries **no rewrite flag on this
//     article**, i.e. presents it as unmodified base PGM text.
// ⚠ **It is NOT Barcelona's own (08019) copy.** L-583 §1 records the municipality-code trap
// recurring live (08015 = Badalona, and two municipal mirrors of "the same" article stating
// different numbers). So this ships at `corroborated`, the citation names the source, and nothing
// here is `certified`. Barcelona's own consolidation is still behind a 403 / robots-disallowed
// page (L-583 §7).
//
// ⛔⛔ §L-660 — **AND THE "NO REWRITE FLAG" ABOVE IS NOW KNOWN TO BE A STATEMENT ABOUT THE WRONG
// DOCUMENT.** Santa Coloma's refós carries no rewrite flag on Art. 328 *because Santa Coloma did not
// rewrite Art. 328*. **Barcelona did.** The MMAMB metropolitan compendium
// (`docs/…/08019-barcelona/PGM-NNUU-metropolitana.pdf`) prints **footnote 50** against base
// Art. 328 at PDF p.109:
//
//     50.  Veure modificació per al Municipi de Badalona a la pàg. 137
//          Veure modificació per al Municipi de Barcelona a la pàg. 277
//
// Printed p.277 = **PDF p.278**, inside the same instrument that rewrites Art. 327 — «Modificació de
// les Normes urbanístiques del PGM per a la modificació de les alçades reguladores en el tipus
// d'ordenació segons alineació de vial, al terme muncipal de Barcelona», Subcomissió d'Urbanisme del
// Municipi de Barcelona, **02-03-2007**, **DOGC núm. 4893 de 29/05/2007** — which restates
// Art. 328.2a as **8,25 / 12,00 / 15,40 / 18,80 m**, PB+1…PB+4, against the base
// **7,55 / 10,60 / 13,65 / 16,70 m** transcribed below.
//
// **Band boundaries (<8, 8–11, 11–15, ≥15) and storey counts are IDENTICAL in both**, so — exactly
// as for 13a — **no 13b parcel would change band or storey count**; only the metre value moves,
// by +0,70 / +1,40 / +1,75 / +2,10 m.
//
// ⚠ THE MODIFICATION ALSO CHANGES SOMETHING THAT IS NOT IN THIS TABLE. Base Art. 328.2a reads
// «L'alçada màxima total, inclòs el forjat, ha de ser de 2,75 m. per planta pis, excepte a les
// edificacions amb façana a carrer de més de 15 m., a les quals serà obligada l'alçada mínima de
// 3,05 m.»; the modification replaces it, **in bold (= added/modified per the instrument's own
// reading key)**, with «L'alçada total mínima, inclosos forjat i paviment, serà de tres metres cinc
// centímetres (3,05 m).» A future signed application must carry that too, not just the six numbers.
//
// ⛔ **NOTHING BELOW IS CHANGED.** The transcription lives, unwired, in `bcnAlcadaReguladora.ts` as
// `BCN_ART328_MPGM_2007_BANDS`; the decision packet is
// `docs/…/08019-barcelona/L-660-ART-327-328-MPGM-2007-FOUNDER-DECISION.md`. Applying it is an
// L-449 signature against the **binding DOGC 4893 text, which we do not hold** — the compendium
// consulted declares itself «merament divulgativa» and is consolidated only to 31-12-2009.
// Record this as `not-located-in-source` for anything later, never `does-not-exist`.
//
// ⚠⚠ THE BAND-EDGE CONVENTION IS **ADOPTED, NOT SOURCED** — READ `BCN_ART328_EDGE_CONVENTION`
// ----------------------------------------------------------------------------------------------
// The sourced material presents the bands as ranges ("8 – 11", "11 – 15"). **No retrieved text
// states whether a street of exactly 8,00 / 11,00 / 15,00 m falls in the lower or the upper
// band.** That is stated here rather than resolved silently. See the constant below for the
// convention this module adopts and for why it almost never decides an answer in practice.
//
// WHAT IS DELIBERATELY ABSENT: THE CORNICE INCREMENT
// --------------------------------------------------
// `resolveAlcadaReguladora` (13a) returns `corniceIncrementMax_m` — the Art. 21 *alçada reguladora
// incrementada* of Barcelona's **Ordenança de Rehabilitació i Millora de l'Eixample** (2002).
// That ordinance is **the Eixample's**, and `13b` is not the Eixample (the founder's own 13b test
// parcel is in Poblenou). Carrying the increment across would be applying one zone's municipal
// ordinance to another zone's land — a citation to a document that does not govern it. This
// resolver therefore returns `corniceIncrementMax_m: null`, and that null is a FINDING.
//
// PURE + deterministic (C58 §1.1): no I/O, no THREE, no DOM, no clock, no RNG.
// Strategic context: C58 §1.1/§1.2/§1.4/§1.11, ADR-0271, L-552, L-583 §4.

import {
    // §L-586 — 0.5 m is a FLOOR (the measured-for-declared substitution allowance), not the whole
    // error. A measurement's own ray spread can exceed it and straddle a band edge the constant
    // clears. Shared with Art. 327 so the two articles cannot drift apart on the same question.
    effectiveBandEdgeGuard_m,
    type AlcadaBand,
    type AlcadaResolution,
} from './bcnAlcadaReguladora.js';

/**
 * ⚠ **THE ONE PARAMETER OF THIS MODULE THAT NO SOURCE STATES.**
 *
 * The Art. 328 bands are published as ranges (`< 8`, `8 – 11`, `11 – 15`, `≥ 15`). Whether a
 * street of *exactly* 8,00 m is PB+1 or PB+2 is **not stated in any text we retrieved**, and this
 * flag exists so that fact is discoverable from the code rather than only from a document.
 *
 * THE CONVENTION ADOPTED: **half-open, lower-inclusive** — `[min, max)`. Two reasons, neither of
 * them a preference:
 *   1. It is the ONLY reading under which the bands partition the width axis. Treating both edges
 *      as inclusive makes 8,00 m simultaneously PB+1 and PB+2; treating both as exclusive leaves
 *      it undefined. A table that must classify every street admits exactly one of the four
 *      readings.
 *   2. It is the reading already shipped for Art. 327 (`bcnAlcadaReguladora.ts`), which sits in
 *      the same section of the same document and is built the same way. Adopting a *different*
 *      convention for the neighbouring article would be a claim about a difference between them
 *      that no source supports — and would make 13a and 13b disagree about what "8 m" means.
 *
 * ⚠ WHAT IT DOES **NOT** LICENSE. This is a convention, not a legal finding, so it must never be
 * presented as one. In practice it decides an answer only for a **trusted official** width sitting
 * exactly on an edge: a MEASURED width anywhere near an edge is already refused by
 * `BAND_EDGE_GUARD_M` (see below), precisely because there the noise, not the measurement, would
 * be choosing the storey band.
 */
export const BCN_ART328_EDGE_CONVENTION = {
    /** `true` ⇒ `[min, max)`, lower-inclusive / upper-exclusive. */
    lowerInclusive: true,
    /** ⚠ FALSE. No retrieved Art. 328 text states the inclusive/exclusive rule. */
    statedByOrdinance: false,
    why:
        'Art. 328 is published as ranges (<8, 8–11, 11–15, ≥15) with no stated inclusive/exclusive ' +
        'rule. Half-open [min, max) is adopted because it is the only reading that partitions the ' +
        'width axis, and because it is the reading already applied to the neighbouring Art. 327 ' +
        'table — a different convention here would assert a difference between the two articles ' +
        'that no source supports. ADOPTED CONVENTION, NOT A LEGAL FINDING (L-583 §4).',
} as const;

/**
 * PGM **Art. 328** — clau `13b` (Subzona II, *semiintensiva*). Four bands, against Art. 327's six.
 *
 * ⚠ DO NOT "align" these numbers with the Art. 327 table. They are a different article's figures
 * and their divergence is the sourced finding (L-552 §3.2, L-583 §4).
 */
/**
 * PGM Art. 328.2a — clau 13b, **as modified for the terme municipal de Barcelona by the MPGM of
 * 02-03-2007, DOGC núm. 4893 (29-05-2007), expedient `2006/025790/B`.**
 * ✍ **APPLIED 2026-08-01 — founder signature SIG-2** (`…/08019-barcelona/sources/VERIFICATION.md`).
 * Binding annex retrieved and confirmed band-for-band, zero corrections; scope is the WHOLE
 * municipality («al terme municipal de Barcelona»), no transitional regime.
 * ⚠ Band boundaries and storey counts are UNCHANGED — only the metres move (+0,70 … +2,10 m).
 * The superseded base ladder is `BCN_ART328_BASE_METROPOLITAN_TABLE`.
 */
export const BCN_ALCADA_SEMIINTENSIVA_TABLE: ReadonlyArray<AlcadaBand> = Object.freeze([
    { minWidth_m: 0, maxWidth_m: 8, height_m: 8.25, floorsAboveGround: 1 },
    { minWidth_m: 8, maxWidth_m: 11, height_m: 12.0, floorsAboveGround: 2 },
    { minWidth_m: 11, maxWidth_m: 15, height_m: 15.4, floorsAboveGround: 3 },
    { minWidth_m: 15, maxWidth_m: Infinity, height_m: 18.8, floorsAboveGround: 4 },
]);

/**
 * The **SUPERSEDED** base/metropolitan Art. 328.2a ladder — retained for the audit diff and because
 * it governs AMB municipalities carrying no modification of this article. Barcelona's resolver does
 * not read it. See SIG-2.
 */
export const BCN_ART328_BASE_METROPOLITAN_TABLE: ReadonlyArray<AlcadaBand> = Object.freeze([
    { minWidth_m: 0, maxWidth_m: 8, height_m: 7.55, floorsAboveGround: 1 },
    { minWidth_m: 8, maxWidth_m: 11, height_m: 10.6, floorsAboveGround: 2 },
    { minWidth_m: 11, maxWidth_m: 15, height_m: 13.65, floorsAboveGround: 3 },
    { minWidth_m: 15, maxWidth_m: Infinity, height_m: 16.7, floorsAboveGround: 4 },
]);

/**
 * Resolve the *alçada reguladora màxima* for a clau `13b` parcel from an *amplada de vial*.
 *
 * PURE, deterministic, never throws. Returns `ok: false` rather than a number whenever the input
 * cannot legitimately decide the answer — the same asymmetry Art. 327's resolver applies, and for
 * the same reason: an absent height costs a flat study volume; a wrong one costs a wrong building.
 *
 * The `BAND_EDGE_GUARD_M` (0.5 m) guard is REUSED rather than re-derived. Its stated rationale
 * transfers exactly: the input is a decimetric cadastral measurement standing in for a declared
 * figure, and 0.5 m is comfortably inside this table's narrowest band (3 m: 8–11 and 11–15) so it
 * can never swallow one whole. ⚠ It matters MORE here than for 13a, not less — an Art. 328 band
 * crossing moves the answer 3,05 m on a building that is only ever 2 to 5 storeys tall.
 *
 * @param amplada_m  the street width in metres. **Pass the OFFICIAL width when you have one.**
 * @param opts.trustedOfficialWidth  TRUE only when `amplada_m` came from the planning street
 *   database (the *ample oficial*), never from measuring geometry. An official width is exact by
 *   definition, so it may sit ON a band edge legitimately and the guard is skipped — at which
 *   point `BCN_ART328_EDGE_CONVENTION` (adopted, not sourced) is what decides.
 */
export function resolveAlcadaSemiintensiva(
    amplada_m: number,
    opts: {
        readonly trustedOfficialWidth?: boolean;
        /** §L-586 — `StreetWidthMeasurement.spread_m`. Widens the guard; never narrows it. */
        readonly measurementSpread_m?: number | null;
    } = {},
): AlcadaResolution {
    if (typeof amplada_m !== 'number' || !Number.isFinite(amplada_m) || amplada_m <= 0) {
        return { ok: false, reason: 'bad-input', straddles: [] };
    }

    const bandFor = (w: number): AlcadaBand =>
        BCN_ALCADA_SEMIINTENSIVA_TABLE.find((b) => w >= b.minWidth_m && w < b.maxWidth_m) ??
        BCN_ALCADA_SEMIINTENSIVA_TABLE[BCN_ALCADA_SEMIINTENSIVA_TABLE.length - 1]!;

    if (!opts.trustedOfficialWidth) {
        // Would nudging the measured width by the guard change the storey band? If so, the
        // measurement is not what decided the answer — the noise is — and we must not answer.
        const guard = effectiveBandEdgeGuard_m(opts.measurementSpread_m);
        const low = bandFor(Math.max(0.000001, amplada_m - guard));
        const high = bandFor(amplada_m + guard);
        if (low.height_m !== high.height_m) {
            return { ok: false, reason: 'band-edge', straddles: [low.height_m, high.height_m] };
        }
    }

    const band = bandFor(amplada_m);
    return {
        ok: true,
        height_m: band.height_m,
        floorsAboveGround: band.floorsAboveGround,
        band,
        // NULL, and deliberately: the Art. 21 cornice increment belongs to the Ordenança de
        // Rehabilitació i Millora de l'**Eixample**, which does not govern a 13b parcel. See the
        // module header — carrying 13a's allowance across would cite a document that does not
        // apply to this land.
        corniceIncrementMax_m: null,
    };
}
