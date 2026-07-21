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
// ⚠ ONE FIGURE IS NOT YET CERTIFIED. For the PB+5 band, our research surfaced BOTH 20.75 m (the
// table) and 22.40 m (an official Barcelona certificate, via Arts. 238/240/327). That
// reconciliation is open — audit **L-528**, which needs the interactive MUC/RPUC *fitxa*, not a
// web search. We encode 20.75 m (the table value) and flag the ambiguity rather than silently
// picking one: see `PB5_UNCERTIFIED_ALTERNATIVE_M`.
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
 * The competing PB+5 figure from an official Barcelona *Certificat Urbanístic* (Arts. 238/240/327).
 * NOT applied — recorded so the open question is visible in code rather than only in a document.
 * Resolving it is audit item L-528.
 */
export const PB5_UNCERTIFIED_ALTERNATIVE_M = 22.4;

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

export type AlcadaResolution =
    | {
          readonly ok: true;
          readonly height_m: number;
          readonly floorsAboveGround: number;
          readonly band: AlcadaBand;
          /** True when the PB+5 20.75-vs-22.40 question (L-528) applies to THIS answer. */
          readonly uncertifiedAlternative_m: number | null;
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
 */
export function resolveAlcadaReguladora(
    amplada_m: number,
    opts: { readonly trustedOfficialWidth?: boolean } = {},
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
        const low = bandFor(Math.max(0.000001, amplada_m - BAND_EDGE_GUARD_M));
        const high = bandFor(amplada_m + BAND_EDGE_GUARD_M);
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
        uncertifiedAlternative_m:
            band.floorsAboveGround === 5 ? PB5_UNCERTIFIED_ALTERNATIVE_M : null,
    };
}
