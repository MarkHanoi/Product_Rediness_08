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
// Full extraction record, per family, per field, with the gate flags and the source article:
//   docs/04-reference/jurisdictions/es/es-an/14021-cordoba/findings/OCR-EXTRACTION-RESULTS.md
// Pack design rationale + what is deliberately NOT packed:
//   docs/04-reference/jurisdictions/es/es-an/14021-cordoba/findings/ORDENANZA-PACK-SPEC.md
//
// WHAT IS PACKED AND WHY (5 families, ~89 % of the 5 725-parcel Sur+Noroeste pilot)
// --------------------------------------------------------------------------------
//   • PAS (Plurifamiliar Aislada) — FULL. Every field a stated scalar. `kind:'setback'`.
//   • OA  (Ordenación Abierta)    — FULL. `kind:'setback'`.
//   • UAD (Unifamiliar Adosada)   — FULL. `kind:'setback'`, lateral = party-wall.
//   • CTP-1 (Colonia Tradicional Popular) — PARTIAL. altura+ocupación+alignment clean; edificabilidad
//     is DERIVED (null). Alignment zone (front on the vial line) → `setbacks:null`, `geometricRule:null`.
//   • MC  (Manzana Cerrada)       — PARTIAL. coverage+use clean; height is a per-street-width TABLE
//     (null scalar); edificabilidad DERIVED except MC-3 (3.50, which the range gate flags). Alignment.
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
            // ── Unifamiliar Adosada (UAD) — FULL, Art. 13.9 (recovered from O_UAD3) ──────────
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
                fieldProvenance: {
                    maxHeight: 'pipeline-extracted', maxFloors: 'pipeline-extracted', maxFAR: 'pipeline-extracted',
                    maxCoverage: 'pipeline-extracted', 'setback.front': 'pipeline-extracted',
                    'setback.side': 'pipeline-extracted', 'setback.rear': 'pipeline-extracted', permittedUse: 'pipeline-extracted',
                },
                ordinanceRef:
                    'PGOU Art. 13.9.2.3 (FAR 1,0), 13.9.2.2 (ocup. 60 %), 13.9.3.5 (PB+1, 7 m), ' +
                    '13.9.3.2 (retranqueo fachada 4 m), lateral medianera (adosada, 0), 13.9.3.4 (fondo 5 m). ' + SRC,
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
                fieldProvenance: {
                    maxHeight: 'pipeline-extracted', maxFloors: 'pipeline-extracted', maxFAR: 'pipeline-extracted',
                    maxCoverage: 'pipeline-extracted', 'setback.front': 'pipeline-extracted',
                    'setback.side': 'pipeline-extracted', 'setback.rear': 'pipeline-extracted', permittedUse: 'pipeline-extracted',
                },
                ordinanceRef:
                    'PGOU Art. 13.9.2.3 (FAR 0,7), 13.9.2.2 (ocup. 40 %), 13.9.3.5 (PB+1, 7 m), ' +
                    '13.9.3.2 (retranqueo fachada 5 m), lateral medianera (adosada, 0), 13.9.3.4 (fondo 6 m). ' + SRC,
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
                fieldProvenance: {
                    maxHeight: 'pipeline-extracted', maxFloors: 'pipeline-extracted', maxFAR: 'pipeline-extracted',
                    maxCoverage: 'pipeline-extracted', 'setback.front': 'pipeline-extracted',
                    'setback.side': 'pipeline-extracted', 'setback.rear': 'pipeline-extracted', permittedUse: 'pipeline-extracted',
                },
                ordinanceRef:
                    'PGOU Art. 13.9.2.3 (FAR 1,0), 13.9.2.2 (ocup. 60 %), 13.9.3.5 (PB+1, 7 m), ' +
                    '13.9.3.2 (alineación a vial, front 0), lateral medianera (adosada, 0), 13.9.3.4 (fondo 5 m). ' + SRC,
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
                // Art. 13.8.2.5 — STEP-FUNCTION of parcel size (≤125 m² → 100 %, >125 m² → 80 %). 0.80
                // is the large-parcel value; it UNDER-states small parcels (safe). A future engine hook
                // could apply the step from `sup_pc_m2`; a scalar is the conservative approximation.
                maxCoverage: 0.8,
                setbacks: { front_m: null, side_m: null, rear_m: null }, // alignment: façade on vial line
                fieldProvenance: {
                    maxHeight: 'pipeline-extracted', maxFloors: 'pipeline-extracted', maxCoverage: 'pipeline-extracted',
                    permittedUse: 'pipeline-extracted',
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
                fieldProvenance: { maxCoverage: 'pipeline-extracted', permittedUse: 'pipeline-extracted' },
                ordinanceRef:
                    'PGOU Art. 13.5.2.5 (ocup. PB 100 % / PA 70 %), 13.5.2.3 (alineación a vial), 13.5.4 ' +
                    '(uso resid. plurifam.). ⚠ altura Art. 13.5.3.1 = per-street-width TABLE → null; ' +
                    'edificabilidad 13.5.2.2 DERIVED → null. ' + SRC,
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
                fieldProvenance: { maxCoverage: 'pipeline-extracted', permittedUse: 'pipeline-extracted' },
                ordinanceRef:
                    'PGOU Art. 13.5.2.5 (ocup. PB 100 % / PA 70 %), 13.5.2.3 (alineación a vial). ⚠ altura ' +
                    '13.5.3.1 TABLE (≤10 m→PB+2; >10→PB+3) → null; edificabilidad 13.5.2.2 DERIVED → null. ' + SRC,
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
                fieldProvenance: { maxFAR: 'pipeline-extracted', maxCoverage: 'pipeline-extracted', permittedUse: 'pipeline-extracted' },
                ordinanceRef:
                    'PGOU Art. 13.5.2.2 (FAR 3,50 — ⚠ OUT OF RANGE [0.2,3.0], human-verify), 13.5.2.5 ' +
                    '(ocup. PB 100 % / PA 70 %), 13.5.2.3 (alineación a vial). ⚠ altura 13.5.3.1 TABLE → null. ' + SRC,
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
                fieldProvenance: { maxCoverage: 'pipeline-extracted', permittedUse: 'pipeline-extracted' },
                ordinanceRef:
                    'PGOU Art. 13.5.2.5.2 (ocup. PB 100 % / PA 90 %), 13.5.2.3 (alineación a vial). ⚠ altura ' +
                    '13.5.3.1 TABLE (MC-2/MC-4 band) → null; edificabilidad 13.5.2.2 DERIVED → null. ' + SRC,
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
// 3. ⛔ OPEN — THE HUMAN GATE. HUMAN VERIFICATION of every value in §2 of OCR-EXTRACTION-RESULTS.md
//    against the source crop (Spanish-planning-literate reviewer) before any parcel renders a number —
//    recorded in `sources/VERIFICATION.md` and, per no-silent-graduation, in a C23 AIArtefact with
//    humanApproval. UNTIL THIS IS SIGNED, `CORDOBA_ENVELOPE_VERIFIED` stays false in the dispatcher and
//    every Córdoba parcel renders a cited REFUSAL, never a machine-read number.
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
// 6. ⛔ OPEN. Author the CTP-1 ocupación step-function hook (from `sup_pc_m2`) and the MC per-street-width
//    height resolver (the Córdoba analogue of `bcnAlcadaNucliAntic.ts`) to lift MC/CTP from partial to full.
