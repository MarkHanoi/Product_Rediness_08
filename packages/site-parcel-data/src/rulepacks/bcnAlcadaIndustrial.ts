// L-590 — PGM **Art. 350.2.c**, the *alçada màxima i nombre límit de plantes* table for Barcelona
// clau **`22a`** (*Zona Industrial*, PGM Secció 8a).
//
// READ FROM THE PRIMARY SOURCE, NOT FROM A MIRROR
// -----------------------------------------------
// `docs/04-reference/spain/barcelona-catalonia/PGM-NNUU-metropolitana.pdf`, **PDF page 116**
// (printed page 115), right-hand column. The values below were extracted glyph-by-glyph with
// coordinates (pypdf `visitor_text`, grouped by `y`, split at the column gutter `x ≈ 235`) and
// re-read in content-stream order to confirm the paragraph numbering. `extract_text()` alone
// interleaves the two columns and is what made three earlier sourcing rounds report this table as
// unobtainable (L-590).
//
// ⚠⚠ **THREE BANDS, AND THE TOP ONE IS OPEN-ENDED. DO NOT ADD A FOURTH.**
// ----------------------------------------------------------------------
// Every OTHER Barcelona street-width height table has four-or-more bands with a 15 m step:
//   • Art. 327 (13a) — six bands, 8 / 12 / 15 / 20 / 30, heights on a 3,05 m ladder;
//   • Art. 328 (13b) — four bands, 8 / 11 / 15,        heights on a 3,05 m ladder.
// **Art. 350.2.c has three**, its steps are 8 and 11 only, and its heights are ROUND NUMBERS
// (9 / 13 / 17 m) that sit on NO 3,05 m ladder at all. The pattern-match — "it must have a 15 m
// band, and the heights must be x,x5" — is exactly the failure this comment exists to block, and
// it is the L-526 failure class: a plausible extrapolation published under a real citation.
// The verbatim rows, as printed:
//
//     Ample de vial (m)      Alçada màxima (m)     Nombre límit de plantes
//     De menys de 8 m.               9                   PB + 1 P
//     De 8 a menys d’11             13                   PB + 2 P
//     De 11 en endavant             17                   PB + 3 P
//
// *De 11 en endavant* = "from 11 onwards" — **no upper bound is stated**, so the top band's
// `maxWidth_m` is `Infinity` and **no band-edge guard applies above 11 m**: there is no edge up
// there to straddle. Inventing one would be inventing a fourth band by the back door.
//
// ⚠⚠ WHICH PARAGRAPH OF ART. 350 THIS TABLE BELONGS TO — AND WHY THAT GATES THE ANSWER
// -------------------------------------------------------------------------------------
// Art. 350 has TWO regimes and they govern DIFFERENT PARCELS:
//
//   • **Art. 350.1** — *"Les condicions d’edificació a la zona industrial que compti amb Pla
//     Parcial definitivament aprovat s’han de regir per les disposicions dels plànols i ordenances
//     de l’esmentat pla parcial amb les limitacions següents…"* ⇒ for 22a land covered by a
//     definitively-approved Pla Parcial the HEIGHT comes from **that plan's own plànols and
//     ordenances**. The PGM imposes only two ceilings there (FAR 2 m²st/m²s; occupation 90 % for
//     *alineacions a vial* sectors, 70 % for *edificació aïllada* sectors). **This table does not
//     apply to that land.**
//
//   • **Art. 350.2** — *"Per a la zona industrial que estigui mancada de Pla Parcial regiran les
//     condicions següents: a … f"*. **The table is 350.2.c.** It governs 22a land that LACKS a
//     Pla Parcial.
//
// ⇒ The table's applicability turns on an affirmative fact — *does a definitively-approved Pla
// Parcial cover this parcel?* — and **PRYZM holds no data source that answers it.** Neither the
// Catastro parcel nor the MUC `CODI_QUAL_MUC` / `DESC_QUAL_AJUNT` carries it. So the resolver
// below REQUIRES the fact as an explicit input and REFUSES when it is `unknown`.
//
// That refusal is not timidity, it is the same asymmetry Arts. 327/328 already apply at a band
// edge: an absent height costs a flat study volume; a wrong one costs a wrong building. And the
// absent-evidence trap is a documented repeat offender in this codebase — "failure and empty are
// the SAME VALUE" — so "no Pla Parcial was found" must not silently become "no Pla Parcial
// exists".
//
// NO MUNICIPAL OVERRIDE FOR ART. 350 — CHECKED, AND THE CHECK IS THE FINDING
// --------------------------------------------------------------------------
// The MMAMB re-edition footnotes every article Barcelona rewrote with *"Veure modificació per al
// Municipi de Barcelona a la pàg. N"*. All 512 pages were scanned for that string: pages 106, 108,
// 109, 110, 111, 112, 114 and 117 carry one — **page 116, which holds Arts. 348–351, carries
// none.** Art. 350 is therefore base PGM text for Barcelona.
//
// ⚠ The ONE Barcelona instrument that touches 22a is the **MPGM per a la renovació de les àrees
// industrials del Poblenou, districte d’activitats 22@** (Subcomissió d’Urbanisme de Barcelona,
// 27-07-2000, DOGC 3239), at pp. 154–160 of the same PDF. It does NOT rewrite Art. 350: it defines
// **22@ as a formally distinct subzone** (*"La zona d’activitats 22@ es defineix formalment com a
// una subzona de la zona industrial 22a i es regula pel que disposen les NU del PGM per a la zona
// 22a, llevat d’allò que expressament s’estableix en els articles següents"*) and confirms the
// base *"clau 22a … manté l’edificabilitat de 2 m²/m²"*. **22@ is therefore NOT covered by this
// module** — it carries its own clau and its own articles, and answering for it here would be
// citing Art. 350 for land the 22@ articles govern.
//
// PURE + deterministic (C58 §1.1): no I/O, no THREE, no DOM, no clock, no RNG.
// Strategic context: C58 §1.1/§1.2/§1.4/§1.7a/§1.11, ADR-0270, ADR-0271, L-526, L-583, L-590.

import {
    // The guard machinery is REUSED, never re-implemented (L-583 §4 / L-586). 0.5 m is the
    // measured-for-declared substitution allowance and widens to the measurement's own spread.
    effectiveBandEdgeGuard_m,
    type AlcadaBand,
    type AlcadaResolution,
} from './bcnAlcadaReguladora.js';

/**
 * Does a definitively-approved *Pla Parcial* cover this 22a parcel?
 *
 * ⚠ THREE-VALUED ON PURPOSE. A boolean would collapse *"we established there is none"* into
 * *"we did not look"*, and this table applies in the first case and not in the second.
 *
 *   • `none`     — established that NO definitively-approved Pla Parcial covers the parcel ⇒
 *                  **Art. 350.2 governs**, and this table answers.
 *   • `approved` — established that one DOES ⇒ **Art. 350.1 governs**; the height comes from that
 *                  plan's own plànols/ordenances, which PRYZM does not hold. Refuse.
 *   • `unknown`  — not established. The default, and today the ONLY value any production caller
 *                  can honestly supply. Refuse.
 */
export type PlaParcialRegime = 'none' | 'approved' | 'unknown';

/**
 * ⚠ **THE ONE PARAMETER OF THIS MODULE THAT NO SOURCE STATES** — same shape as the Art. 328 flag,
 * and stated here rather than resolved silently.
 *
 * Art. 350.2.c is printed as *"De menys de 8 m."*, *"De 8 a menys d’11"*, *"De 11 en endavant"*.
 *
 * ⚠ NOTE THIS IS BETTER SOURCED THAN Art. 328's EQUIVALENT: the middle row's Catalan literally
 * says *"from 8 to LESS THAN 11"* and the first says *"less than 8"*, which fixes 8,00 m in the
 * MIDDLE band and 11,00 m in the TOP band by the ordinance's own words. The half-open
 * `[min, max)` reading is therefore **stated for the 8 m and 11 m edges**, not adopted — the only
 * thing left unstated is the general convention, which this reading matches anyway.
 */
export const BCN_ART350_EDGE_CONVENTION = {
    /** `true` ⇒ `[min, max)`, lower-inclusive / upper-exclusive. */
    lowerInclusive: true,
    /**
     * ⚠ TRUE, and this is the difference from `BCN_ART328_EDGE_CONVENTION`. *"De menys de 8"* /
     * *"De 8 a menys d’11"* / *"De 11 en endavant"* states the boundary rule in words.
     */
    statedByOrdinance: true,
    why:
        'Art. 350.2.c prints its bands as "De menys de 8 m." / "De 8 a menys d’11" / "De 11 en ' +
        'endavant". "menys de 8" excludes 8,00 from the first band and "de 8 a menys d’11" ' +
        'includes it in the second; "de 11 en endavant" includes 11,00 in the third. The ' +
        'half-open [min, max) reading is STATED here, unlike Art. 328 where it is adopted. ' +
        'Primary source: PGM-NNUU-metropolitana.pdf p. 116 (L-590).',
} as const;

/**
 * PGM **Art. 350.2.c** — clau `22a`, *zona industrial mancada de Pla Parcial*.
 *
 * ⚠ THREE bands. ⚠ The top band is OPEN-ENDED (`maxWidth_m: Infinity`) because the ordinance says
 * *"De 11 en endavant"* and states no further step. ⚠ The heights are round integers and belong to
 * no 3,05 m ladder — see the module header on why that is the finding and not a transcription slip.
 */
export const BCN_ALCADA_INDUSTRIAL_TABLE: ReadonlyArray<AlcadaBand> = Object.freeze([
    { minWidth_m: 0, maxWidth_m: 8, height_m: 9, floorsAboveGround: 1 },
    { minWidth_m: 8, maxWidth_m: 11, height_m: 13, floorsAboveGround: 2 },
    { minWidth_m: 11, maxWidth_m: Infinity, height_m: 17, floorsAboveGround: 3 },
]);

/**
 * PGM **Art. 350.2.e** — *"Alçada de l’edificació a l’interior de l’illa: es fixa en 5 m
 * (corresponents a una única planta indivisible), amidats des de la rasant del carrer a la part
 * inferior de l’element d’estructura de la coberta."*
 *
 * ⚠ NOT AN ALTERNATIVE TO THE TABLE ABOVE — a **different part of the building**. The table gives
 * the height of the mass standing in the 70 % concentric band (Art. 350.2.b); this gives the height
 * of the mass in the block INTERIOR, capped at one indivisible storey. A single-prism envelope has
 * nowhere to put the second figure, which is one of the two reasons this zone has no
 * `geometricRule` (see `esBarcelonaIndustrial.ts` → `BCN_22A_ENVELOPE_BLOCKER`).
 *
 * ⚠ AND IT IS MEASURED FROM THE ***RASANT*** (the street's finished grade), not from a flat datum
 * — the L-584 defect, unresolved platform-wide. Recorded here so this figure is not read as a
 * height above an arbitrary plane.
 */
export const BCN_ART350_BLOCK_INTERIOR_HEIGHT_M = 5;

/**
 * Resolve the *alçada màxima* for a clau `22a` parcel from an *amplada de vial*.
 *
 * PURE, deterministic, never throws. Returns `ok: false` rather than a number whenever the input
 * cannot legitimately decide the answer — the same asymmetry Arts. 327 and 328 apply.
 *
 * TWO GATES, IN ORDER:
 *   1. **The regime gate.** Art. 350.2.c governs only 22a land *mancada de Pla Parcial*. Anything
 *      but `planParcialRegime: 'none'` refuses — see `PlaParcialRegime`.
 *   2. **The band-edge guard**, REUSED from Art. 327 (`effectiveBandEdgeGuard_m`), never
 *      re-implemented. This table's narrowest band is 3 m wide (8–11), exactly like Art. 328's, so
 *      the 0.5 m allowance still cannot swallow a band whole.
 *      ⚠ It matters MORE here than for 13a/13b, not less: an Art. 350.2.c band crossing moves the
 *      answer **4 m** (9 → 13 → 17), against 3,05 m in the residential tables.
 *      ⚠ **No guard fires above 11 m.** The top band has no upper edge, so `bandFor(w + guard)`
 *      and `bandFor(w - guard)` agree for every `w > 11.5` — the guard logic must not invent an
 *      edge where the ordinance states none, and this is where that is enforced.
 *
 * @param amplada_m  the street width in metres. **Pass the OFFICIAL width when you have one.**
 * @param opts.planParcialRegime  see `PlaParcialRegime`. Defaults to `'unknown'` ⇒ refuse. There is
 *   no permissive default: assuming `'none'` because we found no Pla Parcial would turn "we did not
 *   look" into an ordinance fact.
 * @param opts.trustedOfficialWidth  TRUE only when `amplada_m` came from the planning street
 *   database (the *ample oficial*), never from measuring geometry.
 * @param opts.measurementSpread_m  `StreetWidthMeasurement.spread_m`. Widens the guard; never
 *   narrows it (§L-586).
 */
export function resolveAlcadaIndustrial(
    amplada_m: number,
    opts: {
        readonly planParcialRegime?: PlaParcialRegime;
        readonly trustedOfficialWidth?: boolean;
        readonly measurementSpread_m?: number | null;
    } = {},
): AlcadaResolution {
    // GATE 1 — the regime. Checked BEFORE the width so a caller that cannot establish the regime
    // gets the regime's reason, not a width complaint: the two are different problems and
    // collapsing them would hide the one that is actually blocking coverage of this zone.
    const regime: PlaParcialRegime = opts.planParcialRegime ?? 'unknown';
    if (regime === 'approved') {
        return { ok: false, reason: 'pla-parcial-governs', straddles: [] };
    }
    if (regime !== 'none') {
        return { ok: false, reason: 'pla-parcial-unknown', straddles: [] };
    }

    if (typeof amplada_m !== 'number' || !Number.isFinite(amplada_m) || amplada_m <= 0) {
        return { ok: false, reason: 'bad-input', straddles: [] };
    }

    const bandFor = (w: number): AlcadaBand =>
        BCN_ALCADA_INDUSTRIAL_TABLE.find((b) => w >= b.minWidth_m && w < b.maxWidth_m) ??
        BCN_ALCADA_INDUSTRIAL_TABLE[BCN_ALCADA_INDUSTRIAL_TABLE.length - 1]!;

    if (!opts.trustedOfficialWidth) {
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
        // NULL, and deliberately. The Art. 21 cornice increment belongs to Barcelona's *Ordenança
        // de Rehabilitació i Millora de l'Eixample* (2002). An industrial parcel is not the
        // Eixample; carrying the allowance across would cite a document that does not govern this
        // land — the same reasoning that keeps it off 13b.
        corniceIncrementMax_m: null,
    };
}
