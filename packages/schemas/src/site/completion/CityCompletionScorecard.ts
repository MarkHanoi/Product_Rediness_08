// C63 (DRAFT — ADR-0281) — the 7-axis CITY-COMPLETION SCORECARD schema.
//
// WHY THIS EXISTS
// ---------------
// "How complete is city X, across every replication layer?" must be answered by a REPRODUCIBLE
// FUNCTION of inspectable state (registry rows, baked-tile probes, height-source `impl` flags,
// terrain `layer.json`), never a hand-typed number (C63 §1.1 — the core invariant). This module is
// the wire shape that function emits: seven fixed axes (C63 §3), each a specialised C62
// `DomainConfidence` instance, plus a renormalised overall (C63 §1.5) and the honesty scalar
// (`honestyOk`, C63 §3.1).
//
// THE HONESTY SPINE (§CONTEXT-DATA-HONESTY, C63 §1.2)
// ---------------------------------------------------
// An axis that has NOT been computed is `score: null` PLUS a typed C62 `UnknownReason`
// ("not-assessed"), never `0` and never blank. `not-assessed ≠ 0 %`: 0 asserts "measured, nothing
// there"; null asserts "not measured". The `AxisScore` refine below makes that structural — a
// `null` score without a typed reason is a schema error, so the fabrication the honesty rule forbids
// cannot be expressed.
//
// LAYERING — L0-pure (P5): Zod only. Zero I/O, zero THREE, zero DOM (C63 §1.8). The scorecard
// *function* that READS registry/tile/dossier state is the impure tool
// (`tools/city-completion/computeScorecard.mjs`), never this file. Per P5 an L0 schema takes no
// OpenTelemetry span (a span is I/O and would break purity); the one helper here
// (`renormalizedOverall`) is a pure, deterministic reducer — consistent with C62's pure
// `authorityOutranks` precedent in this same package.
//
// Contract: docs/02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md
// Spec:     docs/03-execution/specs/SPEC-CITY-COMPLETION-SCORECARD.md
// Composes: ./metadata/DataConfidence.ts (C62 — UnknownReason / ValidationState / SourceProvenance).

import { z } from 'zod';
import {
    UnknownReasonSchema,
    ValidationStateSchema,
    SourceProvenanceSchema,
} from '../metadata/DataConfidence.js';

// ─────────────────────────────────────────────────────────────────────────────
// The SEVEN axes — fixed, identical in every city (C63 §1.3, the "same ruler" invariant). A city
// MUST NOT redefine an axis, add an eighth, or drop one.
//   - `parcel`      — cadastre geometry quality (C63 §3 Axis 1; C57 confidence).
//   - `legislation` — ordinance/rule sourcing depth + the L-449 VERIFICATION gate (Axis 2).
//   - `dataSources` — authoritative feeds wired (Axis 3; the cheapest — state already inspectable).
//   - `envelope`    — buildable-envelope solver coverage (Axis 4; C58).
//   - `terrain`     — baked quantized-mesh present + verified (Axis 5).
//   - `heightsLod`  — measured vs estimated building heights (Axis 6).
//   - `context`     — the 9-layer feature checklist present + non-empty (Axis 7).
// ─────────────────────────────────────────────────────────────────────────────
export const AXIS_IDS = [
    'parcel',
    'legislation',
    'dataSources',
    'envelope',
    'terrain',
    'heightsLod',
    'context',
] as const;
export const AxisIdSchema = z.enum(AXIS_IDS);
export type AxisId = z.infer<typeof AxisIdSchema>;

/**
 * One axis's computed value — a C62 `DomainConfidence` specialised for the scorecard (C63 §1.4).
 * Carries the shared honesty axes plus the two derivation fields that make it non-forgeable:
 *   - `score`           — 0..1, or `null` when not-assessed. **Never default an unknown to 0.**
 *   - `unknownReason`   — REQUIRED when `score === null` (the refine below enforces C63 §1.2).
 *   - `validationState` — who checked it (C62; who-checked ≠ how-complete, C63 §1.6). Default
 *                         `not-checked`. `legislation`/`envelope` reach `human-reviewed` ONLY with a
 *                         signed `sources/VERIFICATION.md`; `terrain` reaches `cross-validated` only
 *                         on an independent-decoder round-trip pass.
 *   - `provenance`      — which state was read (the "explain-why", C63 §1.4).
 *   - `derivation`      — human-readable "computed from N=… sample / registry rows / bake ids …".
 *   - `generatedBy`     — the §6 provenance stamp (`scorecard@<v> <ISO>`); the CI gate re-runs the
 *                         function and diffs, so a hand-edited number (no/stale stamp) fails.
 */
export const AxisScoreSchema = z
    .object({
        axis: AxisIdSchema,
        score: z.number().min(0).max(1).nullable(),
        unknownReason: UnknownReasonSchema.optional(),
        validationState: ValidationStateSchema.default('not-checked'),
        provenance: z.array(SourceProvenanceSchema).optional(),
        derivation: z.string().min(1),
        generatedBy: z.string().min(1),
    })
    .refine((a) => a.score !== null || a.unknownReason !== undefined, {
        // C63 §1.2 — a not-assessed axis (null score) MUST carry a typed reason; a bare null (the
        // L-422/L-457 "failure vs empty are the same value" defect) is a schema error here.
        message: 'not-assessed axis (score:null) MUST carry a typed unknownReason (C63 §1.2)',
        path: ['unknownReason'],
    })
    .refine((a) => a.score !== null ? a.unknownReason === undefined : true, {
        // Symmetric guard: a PRESENT score must NOT also claim an unknown reason (contradiction).
        message: 'an assessed axis (numeric score) MUST NOT carry an unknownReason (C63 §1.2)',
        path: ['unknownReason'],
    });
export type AxisScore = z.infer<typeof AxisScoreSchema>;

/**
 * The renormalised overall (C63 §1.5 / §4). `overall = Σ(score·W) / Σ(W)` over the **assessed**
 * subset; an unassessed axis neither counts as 0 nor inflates the rest — it shrinks the denominator
 * and flags `partial`. `score` is `null` only when NO axis is assessed.
 */
export const OverallSchema = z.object({
    score: z.number().min(0).max(1).nullable(),
    partial: z.boolean(),
    assessedAxes: z.array(AxisIdSchema),
});
export type Overall = z.infer<typeof OverallSchema>;

/**
 * The full scorecard record — a composition of the seven axis values (C63 §1.4). Keyed explicitly by
 * all seven axes (not an open record) so the "same ruler" comparability invariant (§1.3) is
 * structural: a scorecard missing an axis, or carrying an eighth, does not parse.
 */
export const CityCompletionScorecardSchema = z.object({
    /** MUST equal the dossier folder identity `<code>-<slug>` / pack `jurisdictionId` (C63 §1.7). */
    jurisdictionId: z.string().min(1),
    axes: z.object({
        parcel: AxisScoreSchema,
        legislation: AxisScoreSchema,
        dataSources: AxisScoreSchema,
        envelope: AxisScoreSchema,
        terrain: AxisScoreSchema,
        heightsLod: AxisScoreSchema,
        context: AxisScoreSchema,
    }),
    overall: OverallSchema,
    /** §3.1 — flips `false` ONLY if the city renders a fabricated value (a number where state says unknown). */
    honestyOk: z.boolean().default(true),
    /** Which `CITY_COMPLETION_WEIGHTS` vector produced `overall` (re-weighting is one config edit). */
    weightsVersion: z.string().min(1),
});
export type CityCompletionScorecard = z.infer<typeof CityCompletionScorecardSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// THE WEIGHTING — RATIFIED (founder, 2026-07-30, audit L-649; C63 §4). Config, NOT hard-coded at
// the call site (C63 §1.5): re-weighting is this one edit. Front-loads the expensive, differentiating
// axes (legislation/envelope are the human-gated cost; context/terrain/heights "port free").
// Σ = 1.00 (asserted by the unit test).
// ─────────────────────────────────────────────────────────────────────────────
export const CITY_COMPLETION_WEIGHTS: Readonly<Record<AxisId, number>> = {
    legislation: 0.25,
    envelope: 0.2,
    parcel: 0.15,
    dataSources: 0.15,
    heightsLod: 0.1,
    terrain: 0.1,
    context: 0.05,
};

/** The stamp identifying which ratified `CITY_COMPLETION_WEIGHTS` vector an `overall` used. */
export const CITY_COMPLETION_WEIGHTS_VERSION = 'ratified-2026-07-30-L649';

/**
 * Pure, deterministic renormalised-overall reducer (C63 §1.5 / §4 / SPEC §4). Shared by the impure
 * tool and any consumer so the arithmetic has ONE home:
 *
 *   assessed = axes whose score is a number (not null / undefined)
 *   overall  = Σ_{a∈assessed} score[a]·W[a] / Σ_{a∈assessed} W[a]      (null if assessed = ∅)
 *   partial  = assessed ⊊ all-7
 *
 * No I/O, no side effects — safe in L0 (mirrors C62's pure `authorityOutranks`).
 */
export function renormalizedOverall(
    axes: Readonly<Record<AxisId, { readonly score: number | null }>>,
    weights: Readonly<Record<AxisId, number>> = CITY_COMPLETION_WEIGHTS,
): Overall {
    const assessedAxes = AXIS_IDS.filter(
        (a) => typeof axes[a]?.score === 'number' && axes[a].score !== null,
    );
    const wsum = assessedAxes.reduce((s, a) => s + weights[a], 0);
    const score =
        wsum === 0
            ? null
            : assessedAxes.reduce((s, a) => s + (axes[a].score as number) * weights[a], 0) / wsum;
    return { score, partial: assessedAxes.length < AXIS_IDS.length, assessedAxes };
}
