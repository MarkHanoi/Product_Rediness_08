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
// ✅ THE 20.75-vs-22.40 QUESTION IS RESOLVED (L-528 → L-583 §3), AND OUR NUMBER WAS RIGHT.
// The whole table was independently corroborated band-for-band (all six) against a consolidated
// PGM text that flags its own local rewrites and carries none on this article. And 22.40 m was
// never a rival *alçada reguladora*: it is the ***alçada reguladora incrementada*** of Art. 21 of
// Barcelona's own Ordenança de Rehabilitació i Millora de l'Eixample (22-11-2002) — a cornice
// increment of up to 2.25 m over the ARM. See `EIXAMPLE_CORNICE_INCREMENT_MAX_M`.
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
 * §L-528 RESOLVED (L-583 §3) — ⚠ **22,40 m WAS NEVER A COMPETING *ALÇADA REGULADORA*.**
 *
 * This constant used to be `PB5_UNCERTIFIED_ALTERNATIVE_M = 22.4`, described as "the competing PB+5
 * figure … resolving it is audit item L-528". That framing was wrong in a way that mattered: it
 * presented 22,40 m as a **rival answer to the same question**, which made our own correct 20,75 m
 * look uncertain. **It is a different quantity, from a different instrument.**
 *
 * WHAT 22,40 m ACTUALLY IS. Barcelona's **Ordenança de Rehabilitació i Millora de l'Eixample**
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
           */
          readonly reason: 'band-edge' | 'bad-input';
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
