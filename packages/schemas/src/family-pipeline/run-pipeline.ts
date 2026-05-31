// P0.5 Stage-pipeline (Family Platform) — pure single-call orchestrator
// that chains every Family-Generation Stage (1 → 2 → 3 → 4 → 5) into ONE
// function call.
//
// Per APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4:
//
//   unknown JSON
//     ─[Stage 1 ingestFromJson]→            FamilyDefinition
//     ─[Stage 2 decomposeFamily]→           ParametricFamily
//     ─[Stage 3 synthesiseGeometry]→        GeneratedGeometry
//     ─[Stage 4 synthesiseSchemas]→         GeneratedSchemas
//     ─[Stage 5 assembleRegisteredFamily]→  RegisteredFamily
//
// PURE: each stage transformer is pure modulo its own `new Date().toISOString()`
// stamp — all four downstream stamps are pin-able through the corresponding
// per-stage options (`opts.ingest.fromRequestOpts.ingestedAt`,
// `opts.decompose.decomposedAt`, `opts.synthesiseGeometry.synthesisedAt`,
// `opts.synthesiseSchemas.synthesisedAt`).  Pin all four → fully deterministic.
//
// Behaviour:
//   - On Stage-1 INGESTION FAILURE, the IngestionFailure surface is returned
//     VERBATIM (no further stages run).  Callers narrow on `.ok`.
//   - On full SUCCESS, the assembled `RegisteredFamily` is returned along
//     with EVERY intermediate stage output (definition / parametric /
//     geometry / schemas) for debug + observability + cache-key extraction.
//
// L0-pure: TypeScript-only.  Cross-imports stay within `packages/schemas/src/`
// (all six prior family-* sub-substrates).  No THREE, no DOM, no `@pryzm/*`
// outside the `@pryzm/schemas` package.
//
// References:
//   - APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4
//     (the 5-stage Family Generation Pipeline)

import {
    ingestFromJson,
    type IngestFromJsonOptions,
    type IngestionFailure,
} from '../family-definition/index.js';
import type { FamilyDefinition } from '../family-definition/index.js';
import {
    decomposeFamily,
    type FromDefinitionOptions,
} from '../family-parametric/index.js';
import type { ParametricFamily } from '../family-parametric/index.js';
import {
    synthesiseGeometry,
    type SynthesiseGeometryOptions,
} from '../family-geometry/index.js';
import type { GeneratedGeometry } from '../family-geometry/index.js';
import {
    synthesiseSchemas,
    type SynthesiseSchemasOptions,
} from '../family-schemas/index.js';
import type { GeneratedSchemas } from '../family-schemas/index.js';
import {
    assembleRegisteredFamily,
    type AssembleRegisteredFamilyOptions,
} from '../family-registry/index.js';
import type { RegisteredFamily } from '../family-registry/index.js';

/**
 * Combined options for {@link runFamilyPipeline}.  Each property forwards
 * verbatim to the corresponding stage transformer's options bag — pin
 * timestamps + override per-stage knobs without touching the chain itself.
 */
export interface RunFamilyPipelineOptions {
    /** Forwarded to {@link ingestFromJson} (Stage 1). */
    readonly ingest?: IngestFromJsonOptions;
    /** Forwarded to {@link decomposeFamily} (Stage 2). */
    readonly decompose?: FromDefinitionOptions;
    /** Forwarded to {@link synthesiseGeometry} (Stage 3). */
    readonly synthesiseGeometry?: SynthesiseGeometryOptions;
    /** Forwarded to {@link synthesiseSchemas} (Stage 4). */
    readonly synthesiseSchemas?: SynthesiseSchemasOptions;
    /** Forwarded to {@link assembleRegisteredFamily} (Stage 5). */
    readonly assemble?: AssembleRegisteredFamilyOptions;
}

/**
 * Intermediate stage outputs preserved on a successful pipeline run.  Every
 * stage's full output is surfaced so consumers can extract cache keys
 * (`parametricHash` / `geometryHash` / `schemasHash` / `canonicalHash`),
 * round-trip through the per-stage schema, or attach observability spans
 * without re-running the pipeline.
 */
export interface RunFamilyPipelineStages {
    readonly definition: FamilyDefinition;
    readonly parametric: ParametricFamily;
    readonly geometry:   GeneratedGeometry;
    readonly schemas:    GeneratedSchemas;
}

/**
 * Success branch — the assembled {@link RegisteredFamily} is on `.registered`
 * and every intermediate stage output is on `.stages` (frozen).
 */
export interface RunFamilyPipelineSuccess {
    readonly ok: true;
    readonly registered: RegisteredFamily;
    readonly stages: RunFamilyPipelineStages;
}

/**
 * Discriminated union — on Stage-1 ingestion failure the surface is identical
 * to {@link IngestionFailure} (verbatim Zod issues + a human-readable message).
 * Narrow via `.ok` or {@link isPipelineSuccess}.
 */
export type RunFamilyPipelineOutcome =
    | RunFamilyPipelineSuccess
    | IngestionFailure;

/**
 * Run the full Family Generation Pipeline on a raw JSON input.
 *
 * Chains the five pure L0 transformers in sequence:
 *
 *   1. {@link ingestFromJson}          unknown → FamilyDefinition
 *   2. {@link decomposeFamily}         FamilyDefinition → ParametricFamily
 *   3. {@link synthesiseGeometry}      ParametricFamily → GeneratedGeometry
 *   4. {@link synthesiseSchemas}       (parametric, geometry) → GeneratedSchemas
 *   5. {@link assembleRegisteredFamily}  (def, par, geo, sch) → RegisteredFamily
 *
 * On Stage-1 ingestion failure, the {@link IngestionFailure} surface is
 * returned verbatim (no further stages run) so callers can show validation
 * issues to the user.  On success, the full assembled {@link RegisteredFamily}
 * is returned ALONG WITH every intermediate stage output for debug /
 * observability / cache-key extraction.
 *
 * PURE: each transformer is pure modulo its own `new Date().toISOString()`
 * stamp.  Pin every stage's timestamp option to get deterministic output
 * suitable for golden-file fixtures.  The frozen wrapper does NOT freeze the
 * inner objects (they are already produced by pure transformers) — only the
 * top-level success record + its `stages` map.
 *
 * @example
 *   const outcome = runFamilyPipeline(rawJsonFromForm);
 *   if (isPipelineSuccess(outcome)) {
 *     await registry.register(outcome.registered);
 *   } else {
 *     ui.showIssues(outcome.issues);
 *   }
 */
export function runFamilyPipeline(
    raw: unknown,
    opts: RunFamilyPipelineOptions = {},
): RunFamilyPipelineOutcome {
    // Stage 1 — ingest.  On failure we return the IngestionFailure verbatim
    // (same `.ok`/`.issues`/`.message` shape callers already handle for
    // `ingestFromJson`).  No further stages run.
    const ingestion = ingestFromJson(raw, opts.ingest);
    if (!ingestion.ok) {
        return ingestion;
    }

    const definition = ingestion.definition;

    // Stage 2 — decompose.
    const parametric = decomposeFamily(definition, opts.decompose);

    // Stage 3 — synthesise geometry.
    const geometry = synthesiseGeometry(parametric, opts.synthesiseGeometry);

    // Stage 4 — synthesise schemas.
    const schemas = synthesiseSchemas(parametric, geometry, opts.synthesiseSchemas);

    // Stage 5 — assemble registered family.
    const registered = assembleRegisteredFamily(
        definition,
        parametric,
        geometry,
        schemas,
        opts.assemble,
    );

    const stages: RunFamilyPipelineStages = Object.freeze({
        definition,
        parametric,
        geometry,
        schemas,
    });

    return Object.freeze({
        ok: true as const,
        registered,
        stages,
    });
}

/**
 * Type-guard: narrows a {@link RunFamilyPipelineOutcome} to
 * {@link RunFamilyPipelineSuccess}.
 *
 * @example
 *   const o = runFamilyPipeline(raw);
 *   if (isPipelineSuccess(o)) {
 *     // o.registered + o.stages are typed here.
 *   }
 */
export function isPipelineSuccess(
    o: RunFamilyPipelineOutcome,
): o is RunFamilyPipelineSuccess {
    return o.ok === true;
}
