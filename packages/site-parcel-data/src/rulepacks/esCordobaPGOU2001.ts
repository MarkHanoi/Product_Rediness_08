// Córdoba (INE 14021) — PGOU-2001 (Texto Refundido Oct. 2002) rule pack.
//
// ⚠⚠⚠ THIS FILE IS NOW REGISTERED (WIRING-TODO 1/2/4/5 applied) — but the HONESTY GATE means it
// renders NO number. Every Córdoba parcel resolves to a cited REFUSAL until a human signs
// `sources/VERIFICATION.md`: registration + refusal, never registration + a machine-read number.
// The gate lives in the dispatcher (`applyCordobaZoningThenFallback`, `CORDOBA_ENVELOPE_VERIFIED`).
// ============================================================================================
//
// PROVENANCE & CONFIDENCE — READ THIS BEFORE TRUSTING A SINGLE NUMBER
// ------------------------------------------------------------------
// Every value below was **machine-extracted** (OCR / vision-read) from the scanned/born-digital
// PGOU-2001 ordinance PDFs served by the COACo GeoServer (`coaco:ordenanzas.link`). It has passed the
// cheap auto-gates (locale-normalise, range, algorithm-detector) but has **NOT been human-verified
// against the source**. Its TRUE honesty tier is `pipeline-extracted-unverified` — the permanent tier
// BELOW `estimated-ruleset` defined in `docs/04-reference/ORDINANCE-EXTRACTION-PIPELINE.md §3`.
//
// ⚠ THE STALE CLAIM IS CORRECTED (this comment used to say the enum was absent — it is NOT):
// `pipeline-extracted-unverified` (EnvelopeConfidence + RulePackDefaultConfidence) and
// `pipeline-extracted` (FieldProvenance) ALREADY EXIST in
// `packages/schemas/src/site/zoning/ProvenanceFlags.ts`. So, applied here (WIRING-TODO 1/2, DONE):
//
//   • `defaultConfidence: CORDOBA_INTENDED_DEFAULT_CONFIDENCE` (`pipeline-extracted-unverified`) — the
//     honest, permanent bottom tier. It NO LONGER over-states, because the schema now accepts it.
//   • `fieldProvenance` is `'pipeline-extracted'` (= CORDOBA_INTENDED_FIELD_PROVENANCE) on every value:
//     machine-extracted, strictly BELOW the human `'ordinance-pdf'`, and it drives the LOUDER-than-
//     estimated "machine-extracted, unverified" affordance (ORDINANCE-EXTRACTION-PIPELINE.md §3.1c).
//
// ⚠ THE INTERLOCK MOVED, IT DID NOT DISAPPEAR. The pack is registered, so the honest tier is now the
// LABEL. The SAFETY is the VERIFICATION GATE in the dispatcher: until `sources/VERIFICATION.md` is
// human-signed, every Córdoba parcel renders a cited REFUSAL and NO numeric envelope reaches the
// panel/massing (WIRING-TODO 3/5). A number renders only AFTER sign-off, and even then as
// `pipeline-extracted-unverified` with the louder affordance — never as a plain estimate.
//
// ⬆⬆ 2026-08-01 — SECOND-PASS SOURCE VERIFICATION DONE. Every article cited below was re-read from
// the publisher's own PDFs by an INDEPENDENT method: the raster-render path, because `O_PAS2`,
// `O_OA1`, `O_CTP1` and `O_MC` have a ZERO-CHARACTER text layer and `O_UAD3` uses subset CID fonts.
// RESULT: **13 of 13 subzones verified, ZERO wrong values** — including MC-3 = 3,50 (correct; the
// range-gate flag was a false alarm) and the whole MC per-street-width height table.
// THREE defects were found, NONE of them a wrong shipped digit — see VERIFICATION.md §SIG-1:
//   D1 ✅ UAD *profundidad máxima edificable* (Art. 13.9.3.3 — 16/18/16 m) was STATED IN THE SOURCE
//         AND MISSING FROM THIS PACK. ⬆ CLOSED 2026-08-02: all three UAD subzones now carry an
//         `alignment` geometricRule with the stated depth (see the UAD block below). It was
//         reported first and patched second, so the founder saw it before signing. The change only
//         ever REMOVES buildable area — it closes an L-616 overstatement, it does not add capacity.
//   D2 ⚠  the CTP-1 ocupación step-function was mis-documented (middle band is an ABSOLUTE 100 m²
//         cap, not 100 %); the shipped scalar 0.80 is correct and unaffected.
//   D3 ⚠  the MC "no fondo stated" rationale is FALSE (Art. 13.5.2.4 says depth is *libre*, bounded
//         by ocupación); the structural refusal stays correct, but for the HEIGHT reason only.
// Verification ledger + the measured ENVELOPE ceiling (≈16 % full / ≈31 % any, of BUILDABLE land):
//   docs/04-reference/jurisdictions/es/es-an/14021-cordoba/sources/VERIFICATION.md
// Full extraction record, per family, per field, with the gate flags and the source article:
//   docs/04-reference/jurisdictions/es/es-an/14021-cordoba/findings/OCR-EXTRACTION-RESULTS.md
// Pack design rationale + what is deliberately NOT packed:
//   docs/04-reference/jurisdictions/es/es-an/14021-cordoba/findings/ORDENANZA-PACK-SPEC.md
//
// WHAT IS PACKED AND WHY (5 families, ~89 % of the 5 725-parcel Sur+Noroeste pilot)
// --------------------------------------------------------------------------------
//   • PAS (Plurifamiliar Aislada) — FULL. Every field a stated scalar. `kind:'setback'`.
//   • OA  (Ordenación Abierta)    — FULL. `kind:'setback'`.
//   • UAD (Unifamiliar Adosada)   — FULL. Retranqueo setbacks PLUS an `alignment` geometricRule
//     carrying the stated Art. 13.9.3.3 *profundidad máxima edificable* (16/18/16 m from the vial
//     alignment), so a deep UAD parcel clips to the depth band instead of drawing the whole plot.
//   • CTP-1 (Colonia Tradicional Popular) — PARTIAL. altura+ocupación+alignment clean; edificabilidad
//     is DERIVED (null). Alignment zone (front on the vial line) → `setbacks:null` PLUS an
//     `alignment` geometricRule carrying the REAL 16 m *profundidad edificable* (Art. 13.8.2.4), so
//     it clips to a depth band and never draws the whole parcel (L-616 guard).
//   • MC  (Manzana Cerrada)       — PARTIAL. coverage+use clean; height is a per-street-width TABLE
//     (null scalar); edificabilidad DERIVED except MC-3 (3.50, which the range gate flags). Alignment
//     zone with NO held depth → an `explicit-area` geometricRule with an UNRESOLVABLE footprint handle
//     (CORDOBA_MC_FONDO_UNRESOLVED_RING): a cited STRUCTURAL REFUSAL, never a full-parcel box (L-616).
//
// WHAT IS DELIBERATELY NOT PACKED (each a cited "no", never an estimate) — see the SPEC:
//   • Uso Industrial — 1 parcel, subzone-unbindable, ocupación DERIVED (the sufficiency trap).
//   • CTP1-Campo de la Verdad — envelope deferred to the Conjunto Histórico Tomo VI (not held).
//   • Uso Comercial — context-dependent overlay (defers to underlying zone / Plan Parcial).
//   • Elemento protegido — a preservation regime; envelope = the existing building. A refusal, not a pack.
//   • Unifamiliar Aislada — dead `O_UAS1` link; content in no held document.
//
// EVERY `null` BELOW IS A FINDING WITH A REASON (C58 §1.7a: null ≠ 0), never a placeholder:
//   • edificabilidad null on CTP-1 / MC-1/2/4 = the DERIVED "resultante de las Normas de Composición"
//     algorithm — emitting a number would be the confident-wrong catastrophe.
//   • maxHeight/maxFloors null on MC = the per-street-width TABLE (Art. 13.5.3.1); a scalar would
//     publish one street's answer for the whole zone (the L-526 failure). Needs a street-width resolver.
//   • setbacks null on CTP-1/MC = alignment zones (façade ON the vial line); null makes containment
//     SKIP the edge, whereas 0 would assert "the ordinance requires zero clearance".
//
// Legal frame: PGOU-2001, LOUA → LISTA (Ley 7/2021). Source volume: "PLAN GENERAL DE ORDENACION
// CORDOBA 2001, TEXTO REFUNDIDO OCT. 2002 — NORMATIVA: USOS ORDENANZAS Y URBANIZACION", Gerencia de
// Urbanismo, Ayuntamiento de Córdoba. Strategic context: C57, C58 §1.1/§1.2/§1.4/§1.6/§1.7a/§1.11/§2.2,
// C23 §1.1, ORDINANCE-EXTRACTION-PIPELINE.md, §CONTEXT-DATA-HONESTY.

import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
} from '@pryzm/schemas';

/** The jurisdiction id Córdoba packs and records use. One constant, not a scattered literal. */
export const CORDOBA_JURISDICTION_ID = 'es-14021-cordoba';

/**
 * The honesty tier for every value in this pack. The enum now EXISTS in `ProvenanceFlags.ts`, so
 * these are APPLIED below (WIRING-TODO 1/2 done): `defaultConfidence` = the confidence constant,
 * every `fieldProvenance` value = the provenance constant. Recorded as named constants so the
 * intent is greppable and the test can assert the applied values equal them.
 */
export const CORDOBA_INTENDED_DEFAULT_CONFIDENCE = 'pipeline-extracted-unverified' as const;
export const CORDOBA_INTENDED_FIELD_PROVENANCE = 'pipeline-extracted' as const;

const SRC =
    'PGOU-Córdoba-2001 (Texto Refundido Oct. 2002), Normativa: Usos Ordenanzas y Urbanización, ' +
    'Gerencia de Urbanismo, Ayuntamiento de Córdoba. MACHINE-EXTRACTED (OCR/vision), NOT ' +
    'human-verified — pipeline-extracted-unverified. See findings/OCR-EXTRACTION-RESULTS.md.';

/**
 * ⚠ L-616 GUARD — the MC (Manzana Cerrada) STRUCTURAL REFUSAL handle.
 *
 * Every MC subzone is an ALIGNMENT zone (façade on the vial line, Art. 13.5.2.3) with setbacks null.
 * With NO `geometricRule` it would inset by 0 and draw the WHOLE PARCEL the day the gate opens
 * (ENVELOPE-REALISM-MATRIX mechanism A — the latent OVERSTATES-BOTH this file must never permit).
 *
 * ⚠ D3 — THIS RATIONALE WAS WRONG AND IS CORRECTED (2026-08-01, verified 380 dpi). It used to read
 * "MC states NO *profundidad edificable* we hold". Art. **13.5.2.4** in fact states: «Cuando este
 * parámetro no venga expresamente fijado, se entenderá **libre**, con la única condición de que la
 * ocupación del edificio en planta no podrá rebasar los límites … del apartado 5» — depth is
 * UNCONSTRAINED, bounded by ocupación, which this pack HOLDS (0.70 / 0.90). So the ordinance requires
 * NO MC block-fondo geometry source; WIRING-TODO 6 is mis-scoped on that point.
 *
 * THE REFUSAL NEVERTHELESS STANDS, on the HEIGHT ground alone: MC's height is a per-street-width
 * TABLE we do not yet resolve (Art. 13.5.3.1, maxHeight null), so no storey count and therefore no
 * volume can be honestly produced. `block-derived-alignment` is REFUSED on principle: it requires Art. 242's
 * min/max/ratio clamps, which are Barcelona's numbers — supplying them here is the L-526 failure
 * verbatim (see GeometricRule.ts §350 note). C58 §1.7a: never invent a value.
 *
 * The honest shape in the `GeometricRule` union is therefore `explicit-area` with a footprint HANDLE
 * that is DELIBERATELY UNRESOLVABLE for Córdoba: no MC footprint geometry is ever injected, so the
 * engine HARD-FAILS to `status:'degenerate'` and yields NO envelope (ZoningRulesEngine ~L661) — a
 * cited structural refusal, never a full-parcel box. It lifts to a real envelope only once the MC
 * street-width height resolver + a block-fondo geometry source exist (pack WIRING-TODO 6). The ring
 * ref names that gap so a future reader does not mistake it for a published-geometry claim.
 */
export const CORDOBA_MC_FONDO_UNRESOLVED_RING =
    'cordoba-mc-fondo:UNRESOLVED/pgou-13.5.3.1-street-width-table' as const;

/**
 * One band of the Art. 13.5.3.1 per-street-width height table. `maxStreetWidth_m: null` marks the
 * open top band (strictly greater than the previous band's bound — the ordinance's own "> N m" row).
 * `maxFloors` follows this pack's PB+n convention used everywhere else (UAD-1 "PB+1" → maxFloors 2),
 * i.e. ground floor + n upper storeys.
 */
export interface CordobaMcHeightBand {
    readonly maxStreetWidth_m: number | null;
    readonly storeys: string; // ordinance's own "PB+n" notation, kept verbatim for citability
    readonly maxFloors: number;
    readonly maxHeight_m: number;
}

/**
 * ⭐ CLOSURE-REGISTER blocker 8 / D3 — the VERIFIED MC per-street-width height table, Art. 13.5.3.1,
 * transcribed exact band-for-band for all four subzones and cross-verified TWICE independently
 * against the publisher's own PDFs (the raster-render path, since `O_MC` has a zero-character text
 * layer): `sources/VERIFICATION.md` §SIG-1 (lines 44-46, 106-107 — "the MC per-street-width height
 * table §2.5 is exact, band for band, for all four subzones"), `findings/OCR-EXTRACTION-RESULTS.md`
 * §2.5 (lines 249-253, the transcription this table mirrors verbatim), `HEIGHT.md` (H3).
 *
 * ⚠⚠ THIS IS DATA, NOT A COMPUTE PATH. It exists so the verified table stops living only in a
 * comment (`maxHeight_m: null` below still stands, unchanged, on every MC zone). It is deliberately
 * **not** consumed anywhere yet: applying it needs a MEASURED street width per parcel frontage, and
 * PRYZM has no Córdoba street-width resolver (CLOSURE-REGISTER blocker 8/25 — the Barcelona
 * `bcnAlcadaNucliAntic.ts` analogue does not exist here). Looking a value up in this table against a
 * fabricated or unmeasured width would be the exact L-526 failure the `null` scalar exists to
 * prevent — so nothing in this pack, the dispatcher, or the engine may read this constant until that
 * resolver lands and is cited at the call site. Do not delete the surrounding `maxHeight_m: null`
 * fields to "use" this table — the null is the honesty gate, this constant is the payload behind it.
 */
export const CORDOBA_MC_STREET_WIDTH_HEIGHT_TABLE: Readonly<
    Record<'MC-1' | 'MC-2' | 'MC-3' | 'MC-4', readonly CordobaMcHeightBand[]>
> = {
    'MC-1': [
        { maxStreetWidth_m: 8, storeys: 'PB+2', maxFloors: 3, maxHeight_m: 9.75 },
        { maxStreetWidth_m: 10, storeys: 'PB+3', maxFloors: 4, maxHeight_m: 12.75 },
        { maxStreetWidth_m: 14, storeys: 'PB+4', maxFloors: 5, maxHeight_m: 16.75 },
        { maxStreetWidth_m: 16, storeys: 'PB+5', maxFloors: 6, maxHeight_m: 19.5 },
        { maxStreetWidth_m: null, storeys: 'PB+6', maxFloors: 7, maxHeight_m: 22.5 },
    ],
    'MC-2': [
        { maxStreetWidth_m: 10, storeys: 'PB+2', maxFloors: 3, maxHeight_m: 9.75 },
        { maxStreetWidth_m: null, storeys: 'PB+3', maxFloors: 4, maxHeight_m: 12.75 },
    ],
    'MC-3': [
        { maxStreetWidth_m: 10, storeys: 'PB+2', maxFloors: 3, maxHeight_m: 9.75 },
        { maxStreetWidth_m: 15, storeys: 'PB+3', maxFloors: 4, maxHeight_m: 12.75 },
        { maxStreetWidth_m: 20, storeys: 'PB+4', maxFloors: 5, maxHeight_m: 16.75 },
        { maxStreetWidth_m: null, storeys: 'PB+5', maxFloors: 6, maxHeight_m: 19.5 },
    ],
    // MC-4 shares MC-2's band structure verbatim (Art. 13.5.3.1 states them jointly).
    'MC-4': [
        { maxStreetWidth_m: 10, storeys: 'PB+2', maxFloors: 3, maxHeight_m: 9.75 },
        { maxStreetWidth_m: null, storeys: 'PB+3', maxFloors: 4, maxHeight_m: 12.75 },
    ],
} as const;

/**
 * The Córdoba PGOU-2001 pack. `source:'manual'` (curated artefact, no published-structured feed);
 * `crs:'EPSG:4326'` (COACo GeoServer WFS default). Zone `code` matches the calificación subzone name
 * the dispatcher will resolve from `coaco:ordenanzas.ordenanza` + the `O_*` link suffix.
 */
export const ES_CORDOBA_PGOU2001_PACK: JurisdictionZoningContract =
    JurisdictionZoningContractSchema.parse({
        jurisdictionId: CORDOBA_JURISDICTION_ID,
        displayName: 'Córdoba — PGOU-2001 (Sur + Noroeste pilot)',
        source: 'manual',
        crs: 'EPSG:4326',
        lastReviewed: '2026-07-23',
        // WIRING-TODO 1/2 (DONE) — the honest permanent bottom tier (the enum now exists). The
        // safety is no longer this label but the dispatcher's VERIFICATION GATE (see header).
        defaultConfidence: CORDOBA_INTENDED_DEFAULT_CONFIDENCE,
        zones: [
            // ── Plurifamiliar Aislada (PAS) — FULL, Art. 13.7 ────────────────────────────────
            {
                code: 'PAS-1',
                label: 'Plurifamiliar Aislada, subzona PAS-1 (PGOU Art. 13.7)',
                permittedUse: ['residential', 'mixed'],
                maxHeight_m: 12.75,          // Art. 13.7.3.3 — PB+3
                maxFloors: 4,                // PB+3 = 4 storeys
                plotRatioFAR: 1.2,           // Art. 13.7.2.1
                maxCoverage: 0.4,            // Art. 13.7.2.4 (hard cap 0.60, 13.7.2.5.d)
                setbacks: { front_m: 3, side_m: 6.375, rear_m: 6.375 }, // 13.7.3.1: front 3 m; lateral ½·h @ max h
                fieldProvenance: {
                    maxHeight: 'pipeline-extracted', maxFloors: 'pipeline-extracted', maxFAR: 'pipeline-extracted',
                    maxCoverage: 'pipeline-extracted', 'setback.front': 'pipeline-extracted',
                    'setback.side': 'pipeline-extracted', 'setback.rear': 'pipeline-extracted', permittedUse: 'pipeline-extracted',
                },
                ordinanceRef:
                    'PGOU Art. 13.7.2.1 (FAR 1,2), 13.7.2.4 (ocup. 40 %), 13.7.3.3 (PB+3, 12,75 m), ' +
                    '13.7.3.1 (retranqueo 3 m; lateral ½·altura). ' + SRC,
            },
            {
                code: 'PAS-2',
                label: 'Plurifamiliar Aislada, subzona PAS-2 (PGOU Art. 13.7)',
                permittedUse: ['residential', 'mixed'],
                maxHeight_m: 12.75,
                maxFloors: 4,
                plotRatioFAR: 1.66,
                maxCoverage: 0.5,
                setbacks: { front_m: 3, side_m: 6.375, rear_m: 6.375 },
                fieldProvenance: {
                    maxHeight: 'pipeline-extracted', maxFloors: 'pipeline-extracted', maxFAR: 'pipeline-extracted',
                    maxCoverage: 'pipeline-extracted', 'setback.front': 'pipeline-extracted',
                    'setback.side': 'pipeline-extracted', 'setback.rear': 'pipeline-extracted', permittedUse: 'pipeline-extracted',
                },
                ordinanceRef:
                    'PGOU Art. 13.7.2.1 (FAR 1,66), 13.7.2.4 (ocup. 50 %), 13.7.3.3 (PB+3, 12,75 m), ' +
                    '13.7.3.1 (retranqueo 3 m; lateral ½·altura). ' + SRC,
            },
            {
                code: 'PAS-3',
                label: 'Plurifamiliar Aislada, subzona PAS-3 (PGOU Art. 13.7)',
                permittedUse: ['residential', 'mixed'],
                maxHeight_m: 19.5,           // Art. 13.7.3.3 — PB+5
                maxFloors: 6,                // PB+5 = 6 storeys
                plotRatioFAR: 2.0,
                maxCoverage: 0.4,
                setbacks: { front_m: 3, side_m: 9.75, rear_m: 9.75 }, // lateral ½·19,50
                fieldProvenance: {
                    maxHeight: 'pipeline-extracted', maxFloors: 'pipeline-extracted', maxFAR: 'pipeline-extracted',
                    maxCoverage: 'pipeline-extracted', 'setback.front': 'pipeline-extracted',
                    'setback.side': 'pipeline-extracted', 'setback.rear': 'pipeline-extracted', permittedUse: 'pipeline-extracted',
                },
                ordinanceRef:
                    'PGOU Art. 13.7.2.1 (FAR 2,00), 13.7.2.4 (ocup. 40 %), 13.7.3.3 (PB+5, 19,50 m), ' +
                    '13.7.3.1 (retranqueo 3 m; lateral ½·altura). ' + SRC,
            },
            // ── Ordenación Abierta (OA) — FULL, Art. 13.6 ────────────────────────────────────
            {
                code: 'OA-1',
                label: 'Ordenación Abierta, subzona OA-1 (PGOU Art. 13.6)',
                permittedUse: ['residential', 'mixed'],
                maxHeight_m: 21,             // Art. 13.6.3.1 — top of the PB+3..PB+6 band
                maxFloors: 7,                // PB+6 = 7 storeys
                plotRatioFAR: 1.4,           // Art. 13.6.2.2
                maxCoverage: 0.4,            // Art. 13.6.2.3 (all floors; cap 0.60 sótano garaje)
                // Art. 13.6.3.3: separación a linderos privados ≥ ½·altura, min 3 m (= 10,5 m @ 21 m).
                // OA-1 states no front retranqueo (open block) → front null (skip the edge).
                setbacks: { front_m: null, side_m: 10.5, rear_m: 10.5 },
                fieldProvenance: {
                    maxHeight: 'pipeline-extracted', maxFloors: 'pipeline-extracted', maxFAR: 'pipeline-extracted',
                    maxCoverage: 'pipeline-extracted', 'setback.side': 'pipeline-extracted', 'setback.rear': 'pipeline-extracted',
                    permittedUse: 'pipeline-extracted',
                },
                ordinanceRef:
                    'PGOU Art. 13.6.2.2 (FAR 1,4), 13.6.2.3 (ocup. 40 %), 13.6.3.1 (PB+3..PB+6, máx 21 m), ' +
                    '13.6.3.3 (linderos privados ½·altura, min 3 m). ' + SRC,
            },
            {
                code: 'OA-2',
                label: 'Ordenación Abierta, subzona OA-2 (PGOU Art. 13.6)',
                permittedUse: ['residential', 'mixed'],
                maxHeight_m: 21,
                maxFloors: 7,
                plotRatioFAR: 1.6,
                maxCoverage: 0.4,
                // OA-2 (13.6.3.2): parcels on vials must ALIGN → front 0.
                setbacks: { front_m: 0, side_m: 10.5, rear_m: 10.5 },
                fieldProvenance: {
                    maxHeight: 'pipeline-extracted', maxFloors: 'pipeline-extracted', maxFAR: 'pipeline-extracted',
                    maxCoverage: 'pipeline-extracted', 'setback.front': 'pipeline-extracted',
                    'setback.side': 'pipeline-extracted', 'setback.rear': 'pipeline-extracted', permittedUse: 'pipeline-extracted',
                },
                ordinanceRef:
                    'PGOU Art. 13.6.2.2 (FAR 1,6), 13.6.2.3 (ocup. 40 %), 13.6.3.1 (PB+3..PB+6, máx 21 m), ' +
                    '13.6.3.2 (alineada a vial), 13.6.3.3 (linderos privados ½·altura, min 3 m). ' + SRC,
            },
            // ── Unifamiliar Adosada (UAD) — Art. 13.9 (recovered from O_UAD3) ───────────────
            //
            // ✅ D1 CLOSED (2026-08-02) — THE STATED DEPTH IS NOW PACKED ON ALL THREE SUBZONES.
            // Art. 13.9.3.3 states a *profundidad máxima edificable* — UAD-1 16 m · UAD-2 18 m ·
            // UAD-3 16 m — measured FROM THE VIAL ALIGNMENT (verified 380 dpi, 2026-08-01;
            // OCR-EXTRACTION-RESULTS §2.3 and sources/VERIFICATION.md §D1 both record it). Until
            // now NONE of it was carried, so the envelope was bounded by the setback inset alone
            // and OVER-STATED deep parcels.
            //
            // ⚠ For UAD-3 that was the L-616 mechanism-A failure VERBATIM: front 0 + side 0
            // (party-wall) + rear 5 m with NO depth band draws essentially the WHOLE PARCEL — the
            // exact outcome CTP-1's `alignment` rule and MC's unresolvable ring exist to prevent,
            // left unguarded on the one family that also needed it. And its "latent" premise was
            // REFUTED: UAD-3 binds 31 505,01 m² = 1,934 % of published pilot land, not 0,00 %
            // (CLOSURE-REGISTER, measured live 2026-08-01 through `subzoneCodeFromLink`).
            //
            // ⚠⚠ THIS IS A CONSTRAINT ADDED, NEVER A NUMBER INVENTED. Every depth below is quoted
            // from Art. 13.9.3.3; nothing is derived, assumed or defaulted. The effect is strictly
            // to REDUCE buildability (an UNKNOWN constraint must never be drawn as unbounded —
            // that overstates real land), so it cannot manufacture capacity that the pack did not
            // already grant.
            //
            // WHY `kind: 'alignment'` AND NOT A DEEPER REAR SETBACK — the two are NOT
            // interchangeable (depthBandClip.ts): a rear setback measures from the REAR boundary,
            // so on a deep parcel it leaves the depth unconstrained and on a shallow one it
            // over-constrains; they coincide only when parcel depth happens to equal
            // `depth + rear_m`. The ordinance measures from the ALIGNMENT, so the alignment rule
            // is the only faithful shape. It is the SHARED, region-agnostic capability already
            // driving CTP-1 here and Barcelona's 13a/13b — not a Córdoba special case.
            //
            // ⚠ NO DOUBLE-COUNTING: the engine builds the inset from `setbacks` and then clips the
            // band from `parcelRing[frontIdx]` — the ALIGNMENT itself, not the set-back façade
            // (ZoningRulesEngine, ADR-0270 P2). So UAD-1's 4 m retranqueo and its 16 m depth-from-
            // alignment compose exactly as Art. 13.9 reads; `alignmentOffset_m` is recorded as the
            // provenance/derivation row and does NOT re-apply the inset.
            //
            // ⚠ STILL GATED: `CORDOBA_ENVELOPE_VERIFIED` is false, so nothing here renders a number
            // today. This closes the OVERSTATEMENT, it does not open the gate.
            {
                code: 'UAD-1',
                label: 'Unifamiliar Adosada, subzona UAD-1 (PGOU Art. 13.9)',
                permittedUse: ['residential'],
                maxHeight_m: 7,              // Art. 13.9.3.5 — PB+1, 7 m
                maxFloors: 2,
                plotRatioFAR: 1.0,          // Art. 13.9.2.3
                maxCoverage: 0.6,           // Art. 13.9.2.2
                // 13.9.3.2 front 4 m; adosada lateral = party-wall (0); 13.9.3.4 rear 5 m.
                setbacks: { front_m: 4, side_m: 0, rear_m: 5 },
                // D1 — Art. 13.9.3.3: profundidad máxima edificable 16 m desde la alineación.
                geometricRule: {
                    kind: 'alignment',
                    alignTo: 'street',
                    alignmentOffset_m: 4,      // = the 13.9.3.2 retranqueo; recorded, not re-applied
                    sideTreatment: 'party-wall', // adosada — medianera on both laterals
                    buildableDepth_m: 16,      // Art. 13.9.3.3
                },
                fieldProvenance: {
                    maxHeight: 'pipeline-extracted', maxFloors: 'pipeline-extracted', maxFAR: 'pipeline-extracted',
                    maxCoverage: 'pipeline-extracted', 'setback.front': 'pipeline-extracted',
                    'setback.side': 'pipeline-extracted', 'setback.rear': 'pipeline-extracted', permittedUse: 'pipeline-extracted',
                    // Machine-extracted (OCR, 13.9.3.3) — strictly below the human `ordinance-pdf` tier.
                    'alignment.depth': 'pipeline-extracted',
                },
                ordinanceRef:
                    'PGOU Art. 13.9.2.3 (FAR 1,0), 13.9.2.2 (ocup. 60 %), 13.9.3.5 (PB+1, 7 m), ' +
                    '13.9.3.2 (retranqueo fachada 4 m), lateral medianera (adosada, 0), 13.9.3.4 (fondo 5 m), ' +
                    '13.9.3.3 (profundidad máx. edificable 16 m desde la alineación de vial). ' + SRC,
            },
            {
                code: 'UAD-2',
                label: 'Unifamiliar Adosada, subzona UAD-2 (PGOU Art. 13.9)',
                permittedUse: ['residential'],
                maxHeight_m: 7,
                maxFloors: 2,
                plotRatioFAR: 0.7,
                maxCoverage: 0.4,
                setbacks: { front_m: 5, side_m: 0, rear_m: 6 }, // front 5 m; party-wall; fondo 6 m
                // D1 — Art. 13.9.3.3: profundidad máxima edificable 18 m desde la alineación.
                geometricRule: {
                    kind: 'alignment',
                    alignTo: 'street',
                    alignmentOffset_m: 5,      // = the 13.9.3.2 retranqueo; recorded, not re-applied
                    sideTreatment: 'party-wall',
                    buildableDepth_m: 18,      // Art. 13.9.3.3
                },
                fieldProvenance: {
                    maxHeight: 'pipeline-extracted', maxFloors: 'pipeline-extracted', maxFAR: 'pipeline-extracted',
                    maxCoverage: 'pipeline-extracted', 'setback.front': 'pipeline-extracted',
                    'setback.side': 'pipeline-extracted', 'setback.rear': 'pipeline-extracted', permittedUse: 'pipeline-extracted',
                    'alignment.depth': 'pipeline-extracted',
                },
                ordinanceRef:
                    'PGOU Art. 13.9.2.3 (FAR 0,7), 13.9.2.2 (ocup. 40 %), 13.9.3.5 (PB+1, 7 m), ' +
                    '13.9.3.2 (retranqueo fachada 5 m), lateral medianera (adosada, 0), 13.9.3.4 (fondo 6 m), ' +
                    '13.9.3.3 (profundidad máx. edificable 18 m desde la alineación de vial). ' + SRC,
            },
            {
                code: 'UAD-3',
                label: 'Unifamiliar Adosada, subzona UAD-3 (PGOU Art. 13.9)',
                permittedUse: ['residential'],
                maxHeight_m: 7,
                maxFloors: 2,
                plotRatioFAR: 1.0,
                maxCoverage: 0.6,
                // 13.9.3.2: UAD-3 disposed ON the vial alignment → front 0; party-wall; fondo 5 m.
                setbacks: { front_m: 0, side_m: 0, rear_m: 5 },
                // ⚠⚠ D1, AND THIS IS THE ONE THAT WAS ACTUALLY DANGEROUS. front 0 + side 0 +
                // rear 5 with NO depth band drew essentially the WHOLE PARCEL (L-616 mechanism A)
                // on the 1,934 % of pilot land UAD-3 really binds. Art. 13.9.3.3 states 16 m.
                geometricRule: {
                    kind: 'alignment',
                    alignTo: 'street',
                    alignmentOffset_m: 0,      // 13.9.3.2 — built ON the alineación de vial
                    sideTreatment: 'party-wall',
                    buildableDepth_m: 16,      // Art. 13.9.3.3
                },
                fieldProvenance: {
                    maxHeight: 'pipeline-extracted', maxFloors: 'pipeline-extracted', maxFAR: 'pipeline-extracted',
                    maxCoverage: 'pipeline-extracted', 'setback.front': 'pipeline-extracted',
                    'setback.side': 'pipeline-extracted', 'setback.rear': 'pipeline-extracted', permittedUse: 'pipeline-extracted',
                    'alignment.depth': 'pipeline-extracted',
                },
                ordinanceRef:
                    'PGOU Art. 13.9.2.3 (FAR 1,0), 13.9.2.2 (ocup. 60 %), 13.9.3.5 (PB+1, 7 m), ' +
                    '13.9.3.2 (alineación a vial, front 0), lateral medianera (adosada, 0), 13.9.3.4 (fondo 5 m), ' +
                    '13.9.3.3 (profundidad máx. edificable 16 m desde la alineación de vial). ' + SRC,
            },
            // ── Colonia Tradicional Popular (CTP-1) — PARTIAL, Art. 13.8 ─────────────────────
            // Alignment zone (front on the vial line) → setbacks null. edificabilidad DERIVED → null.
            {
                code: 'CTP-1',
                label: 'Colonia Tradicional Popular, subzona CTP-1 (PGOU Art. 13.8)',
                permittedUse: ['residential'],
                maxHeight_m: 7,             // Art. 13.8.3.1 — PB+1, 7 m (cumbrera 9,75 for attic)
                maxFloors: 2,
                // Art. 13.8.2.3 — "resultante de la aplicación de las Normas de Composición" = DERIVED.
                plotRatioFAR: null,
                // Art. 13.8.2.5 — STEP-FUNCTION of parcel size. ⚠ D2, CORRECTED 2026-08-01 (400 dpi):
                // the source reads «Parcelas de hasta 100 m2, el 100%. Parcela de más de 100 m2 y menos
                // de 125 m2, 100 m2. Parcelas de más de 125 m2, el 80%.» — the MIDDLE band is an
                // ABSOLUTE 100 m² CAP, **not** 100 %. (This comment previously said "≤125 m² → 100 %",
                // which is wrong and would over-state a 124 m² parcel by ~24 % if WIRING-TODO 6 were
                // implemented from it.) 0.80 is the large-parcel value and is CORRECT; it UNDER-states
                // small parcels (safe). A future hook applies the true step from `sup_pc_m2`.
                maxCoverage: 0.8,
                setbacks: { front_m: null, side_m: null, rear_m: null }, // alignment: façade on vial line
                // ⚠ L-616 GUARD (ENVELOPE-REALISM-MATRIX, Córdoba row) — an ALIGNMENT rule, NOT the
                // legacy setback inset. Without a geometricRule this alignment zone (setbacks null →
                // 0 inset) would fall to the whole-parcel footprint the moment the gate opens
                // (mechanism A). Art. 13.8.2.4 states a real *profundidad máxima edificable* of 16 m
                // from the vial alignment (OCR READ-CLEAN, see OCR-EXTRACTION-RESULTS §2.4), so the
                // honest shape is: build ON the vial line (offset 0), party walls on the laterals
                // (adosada/medianera fabric), and a 16 m depth band. The engine composes
                // inset-per-edge THEN clipToDepthBand; with no `front` edge it HARD-FAILS to
                // `degenerate` (never a full-depth fallback — see ZoningRulesEngine ~L403).
                geometricRule: {
                    kind: 'alignment',
                    alignTo: 'street',
                    alignmentOffset_m: 0,
                    sideTreatment: 'party-wall',
                    buildableDepth_m: 16, // Art. 13.8.2.4 — máx 16 m desde la alineación de vial
                },
                fieldProvenance: {
                    maxHeight: 'pipeline-extracted', maxFloors: 'pipeline-extracted', maxCoverage: 'pipeline-extracted',
                    permittedUse: 'pipeline-extracted',
                    // The 16 m depth is machine-extracted (OCR, 13.8.2.4), strictly below the human
                    // `ordinance-pdf` tier. The engine reads `alignment.depth` for the derivation row.
                    'alignment.depth': 'pipeline-extracted',
                    // NB: plotRatioFAR intentionally absent — it is null-DERIVED, not machine-extracted.
                },
                ordinanceRef:
                    'PGOU Art. 13.8.3.1 (PB+1, 7 m), 13.8.2.5 (ocup. step; 80 % >125 m²), 13.8.2.1 ' +
                    '(fachada en alineación de vial), 13.8.2.4 (profundidad máx 16 m). ⚠ edificabilidad ' +
                    'DERIVED (13.8.2.3, "resultante de las Normas de Composición") → null, never a number. ' + SRC,
            },
            // ── Manzana Cerrada (MC) — PARTIAL, Art. 13.5 ────────────────────────────────────
            // Alignment zone (front on vial line). Height is a per-street-width TABLE → maxHeight null.
            // edificabilidad DERIVED for MC-1/2/4 → null; MC-3 = 3,50 (⚠ > range gate 3.0, flagged).
            {
                code: 'MC-1',
                label: 'Manzana Cerrada, subzona MC-1 (PGOU Art. 13.5)',
                permittedUse: ['residential', 'mixed'],
                maxHeight_m: null,          // Art. 13.5.3.1 — per-street-width table (see SPEC), not a scalar
                maxFloors: null,
                plotRatioFAR: null,         // Art. 13.5.2.2 — "no se fija … Normas de composición" = DERIVED
                maxCoverage: 0.7,           // Art. 13.5.2.5 — plantas altas 70 % (planta baja 100 %)
                setbacks: { front_m: null, side_m: null, rear_m: null }, // alignment: façade on vial line
                // ⚠ L-616 GUARD — structural refusal (never a full-parcel box). See CORDOBA_MC_FONDO_UNRESOLVED_RING.
                geometricRule: { kind: 'explicit-area', ringRef: CORDOBA_MC_FONDO_UNRESOLVED_RING },
                fieldProvenance: { maxCoverage: 'pipeline-extracted', permittedUse: 'pipeline-extracted' },
                ordinanceRef:
                    'PGOU Art. 13.5.2.5 (ocup. PB 100 % / PA 70 %), 13.5.2.3 (alineación a vial), 13.5.4 ' +
                    '(uso resid. plurifam.). ⚠ altura Art. 13.5.3.1 = per-street-width TABLE → null; ' +
                    'verified table: CORDOBA_MC_STREET_WIDTH_HEIGHT_TABLE[\'MC-1\'] (not yet consumed — ' +
                    'no street-width resolver). edificabilidad 13.5.2.2 DERIVED → null. ' + SRC,
            },
            {
                code: 'MC-2',
                label: 'Manzana Cerrada, subzona MC-2 (PGOU Art. 13.5)',
                permittedUse: ['residential', 'mixed'],
                maxHeight_m: null,
                maxFloors: null,
                plotRatioFAR: null,
                maxCoverage: 0.7,
                setbacks: { front_m: null, side_m: null, rear_m: null },
                // ⚠ L-616 GUARD — structural refusal (never a full-parcel box). See CORDOBA_MC_FONDO_UNRESOLVED_RING.
                geometricRule: { kind: 'explicit-area', ringRef: CORDOBA_MC_FONDO_UNRESOLVED_RING },
                fieldProvenance: { maxCoverage: 'pipeline-extracted', permittedUse: 'pipeline-extracted' },
                ordinanceRef:
                    'PGOU Art. 13.5.2.5 (ocup. PB 100 % / PA 70 %), 13.5.2.3 (alineación a vial). ⚠ altura ' +
                    '13.5.3.1 TABLE (≤10 m→PB+2; >10→PB+3) → null; verified table: ' +
                    'CORDOBA_MC_STREET_WIDTH_HEIGHT_TABLE[\'MC-2\'] (not yet consumed — no street-width ' +
                    'resolver). edificabilidad 13.5.2.2 DERIVED → null. ' + SRC,
            },
            {
                code: 'MC-3',
                label: 'Manzana Cerrada, subzona MC-3 (PGOU Art. 13.5)',
                permittedUse: ['residential', 'mixed'],
                maxHeight_m: null,
                maxFloors: null,
                // ⚠ Art. 13.5.2.2 — MC-3 edificabilidad neta = 3,50 m²t/m²s. EXCEEDS the FAR range gate
                // [0.2, 3.0] → the pipeline routes it to a HUMAN (do not auto-accept). Packed because the
                // read is confident (a genuine high-density subzone) but the gate flag rides with it.
                plotRatioFAR: 3.5,
                maxCoverage: 0.7,
                setbacks: { front_m: null, side_m: null, rear_m: null },
                // ⚠ L-616 GUARD — structural refusal (never a full-parcel box). See CORDOBA_MC_FONDO_UNRESOLVED_RING.
                geometricRule: { kind: 'explicit-area', ringRef: CORDOBA_MC_FONDO_UNRESOLVED_RING },
                fieldProvenance: { maxFAR: 'pipeline-extracted', maxCoverage: 'pipeline-extracted', permittedUse: 'pipeline-extracted' },
                ordinanceRef:
                    'PGOU Art. 13.5.2.2 (FAR 3,50 — ⚠ OUT OF RANGE [0.2,3.0], human-verify), 13.5.2.5 ' +
                    '(ocup. PB 100 % / PA 70 %), 13.5.2.3 (alineación a vial). ⚠ altura 13.5.3.1 TABLE → null; ' +
                    'verified table: CORDOBA_MC_STREET_WIDTH_HEIGHT_TABLE[\'MC-3\'] (not yet consumed — ' +
                    'no street-width resolver). ' + SRC,
            },
            {
                code: 'MC-4',
                label: 'Manzana Cerrada, subzona MC-4 (PGOU Art. 13.5)',
                permittedUse: ['residential', 'mixed'],
                maxHeight_m: null,
                maxFloors: null,
                plotRatioFAR: null,
                maxCoverage: 0.9,           // Art. 13.5.2.5.2 — MC-4 plantas altas 90 % (planta baja 100 %)
                setbacks: { front_m: null, side_m: null, rear_m: null },
                // ⚠ L-616 GUARD — structural refusal (never a full-parcel box). See CORDOBA_MC_FONDO_UNRESOLVED_RING.
                geometricRule: { kind: 'explicit-area', ringRef: CORDOBA_MC_FONDO_UNRESOLVED_RING },
                fieldProvenance: { maxCoverage: 'pipeline-extracted', permittedUse: 'pipeline-extracted' },
                ordinanceRef:
                    'PGOU Art. 13.5.2.5.2 (ocup. PB 100 % / PA 90 %), 13.5.2.3 (alineación a vial). ⚠ altura ' +
                    '13.5.3.1 TABLE (MC-2/MC-4 band) → null; verified table: ' +
                    'CORDOBA_MC_STREET_WIDTH_HEIGHT_TABLE[\'MC-4\'] (not yet consumed — no street-width ' +
                    'resolver). edificabilidad 13.5.2.2 DERIVED → null. ' + SRC,
            },
        ],
    });

/**
 * The zone codes this pack answers for. Registered against the calificación subzone the dispatcher
 * resolves from `coaco:ordenanzas.ordenanza` + the `O_*` link suffix (e.g. `O_PAS2`→PAS-2, `O_MC3`→MC-3).
 *
 * ⚠ NOT registered here and MUST NOT be — each a cited "no", see the SPEC:
 *   Uso Industrial (subzone-unbindable, ocupación DERIVED), CTP1-Campo de la Verdad (Conjunto Histórico
 *   Tomo VI not held), Uso Comercial (context-dependent), Elemento protegido (preservation → refusal),
 *   Unifamiliar Aislada (dead link).
 */
export const CORDOBA_PGOU2001_ZONE_CODES = [
    'PAS-1', 'PAS-2', 'PAS-3',
    'OA-1', 'OA-2',
    'UAD-1', 'UAD-2', 'UAD-3',
    'CTP-1',
    'MC-1', 'MC-2', 'MC-3', 'MC-4',
] as const;

// ─── WIRING-TODO — STATUS after this PR (the pack is REGISTERED but renders NO number) ───────────
// 1. ✅ DONE. `pipeline-extracted-unverified` (EnvelopeConfidence + RulePackDefaultConfidence) and
//    `pipeline-extracted` (FieldProvenance) ALREADY EXIST in `ProvenanceFlags.ts` (the header's
//    "not yet present" claim was STALE and is corrected above).
// 2. ✅ DONE. `defaultConfidence` = CORDOBA_INTENDED_DEFAULT_CONFIDENCE; every `fieldProvenance`
//    value = 'pipeline-extracted' (= CORDOBA_INTENDED_FIELD_PROVENANCE). Asserted by esCordobaPack.test.ts.
// 3. ⛔ OPEN — THE HUMAN GATE (but now SIGNABLE). The machine half is DONE: on 2026-08-01 every value
//    in §2 of OCR-EXTRACTION-RESULTS.md was re-read from the publisher's PDFs via the raster-render
//    path (the text layer is empty for 4 of 5 documents) — 13/13 subzones, ZERO wrong values, pinned
//    by `__tests__/esCordobaOcrVerification.test.ts`. What remains is the LEGAL ACT: a
//    Spanish-planning-literate human signing `sources/VERIFICATION.md` §SIG-1 and, per
//    no-silent-graduation, a C23 AIArtefact with humanApproval. ⚠ Signing is ALSO conditional on the
//    confidence-badge fix (the engine currently ignores a pack's declared confidence) and on D1
//    (missing UAD depth) being closed before UAD-3 may bind. UNTIL SIGNED, `CORDOBA_ENVELOPE_VERIFIED`
//    stays false and every Córdoba parcel renders a cited REFUSAL, never a machine-read number.
// 4. ✅ DONE. Registered in `registry.ts`: a Córdoba JurisdictionRegistration (Sur+Noroeste extent +
//    `contains` from `providers/cordobaBbox.ts`; `answerSummary` naming the pilot scope + the derived/
//    tabular gaps + the unverified status), `packsByZone: packMap([ES_CORDOBA_PGOU2001_PACK,
//    CORDOBA_PGOU2001_ZONE_CODES])`, `refusalFor: cordobaZoneRefusalFor` (the legally-grounded
//    not-extractable families) and `noRulePackRefusal: cordobaNoRulePackRefusal` (the coverage-gap card
//    stating the 2-district pilot scope, for the unbindable families + the blank-ordenanza parcels).
// 5. ✅ DONE (as a GATE, not a renderer). `applyCordobaZoningThenFallback` in `siteDispatch.ts` routes a
//    Córdoba parcel; while `CORDOBA_ENVELOPE_VERIFIED === false` it dispatches the honest
//    machine-extracted-unverified refusal and NO numeric envelope reaches the panel/massing. The
//    subzone resolver (`ordenanza` + `O_*` link suffix → COACo WFS) + the re-tiered louder-than-
//    estimated render turn on together WITH step 3; both are the same sign-off event.
// 6. ⛔ OPEN — RE-SCOPED 2026-08-01 (D3). Author (a) the CTP-1 ocupación step-function hook from
//    `sup_pc_m2` — ⚠ encode the TRUE step: ≤100 m² → 100 %; >100 and <125 m² → an ABSOLUTE 100 m²
//    CAP; >125 m² → 80 % (NOT "≤125 → 100 %"); (b) the MC per-street-width height resolver, the
//    Córdoba analogue of `bcnAlcadaNucliAntic.ts`. ⬇ An MC block-fondo geometry source is NO LONGER
//    REQUIRED: Art. 13.5.2.4 makes MC depth *libre*, bounded by the ocupación this pack already
//    holds. The height resolver ALONE lifts MC from structural refusal to a real envelope — a
//    materially cheaper unlock than previously recorded, and the largest one outstanding (MC is
//    16.86 % of pilot buildable land). Until it ships MC stays a structural refusal via
//    `explicit-area` + CORDOBA_MC_FONDO_UNRESOLVED_RING (WIRING-TODO 7, below), CTP-1 clips to 16 m.
//    ⬆ 2026-08-04 — PARTIAL: the verified table itself is now real, typed, citable data
//    (`CORDOBA_MC_STREET_WIDTH_HEIGHT_TABLE`, all four subzones), so it no longer lives only as a
//    comment. It is DELIBERATELY NOT CONSUMED — no street-width resolver exists to look a parcel's
//    frontage width up against, and PRYZM has no verified Córdoba positional-accuracy figure for
//    Catastro yet either (needed for any future raycast-based width measurement's error buffer,
//    ADR-0287). The resolver + its call site remain fully open; do not wire this table into
//    `siteDispatch.ts` or the engine until both land and are cited at the call site.
// 8. ⛔ OPEN (D1, BLOCKING for UAD-3). Carry the stated UAD *profundidad máxima edificable*
//    (Art. 13.9.3.3 — UAD-1 16 m · UAD-2 18 m · UAD-3 16 m) as a `geometricRule`. Without it UAD-3
//    (front 0 + side 0 + no depth band) is an unguarded L-616 mechanism-A whole-parcel overstatement.
// 7. ✅ DONE (L-616 guard). CTP-1 carries a real `alignment` geometricRule (16 m depth, Art. 13.8.2.4);
//    MC-1..4 carry an `explicit-area` geometricRule with an UNRESOLVABLE footprint handle. Neither can
//    ever fall to the whole-parcel inset (ENVELOPE-REALISM-MATRIX mechanism A) once the gate opens.
//    Verified end-to-end in `esCordobaEnvelopeCompute.test.ts`.
