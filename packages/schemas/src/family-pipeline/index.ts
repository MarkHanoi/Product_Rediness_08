// P0.5 Stage-pipeline (Family Platform) — public surface for the L0
// Family-Generation Pipeline orchestrator.
//
// The single-call wrapper that chains every Family-Generation Stage
// (1 → 2 → 3 → 4 → 5) into one function, so a raw JSON input becomes a
// fully-typed `RegisteredFamily` (plus every intermediate stage output)
// in ONE call.
//
// Pairs with:
//   - `family-request/`     the INGESTION input  (FamilyRequest — slice A)
//   - `family-definition/`  the Stage-1 canonical form (FamilyDefinition)
//   - `family-parametric/`  the Stage-2 decomposition output (ParametricFamily)
//   - `family-geometry/`    the Stage-3 geometry synthesis output (GeneratedGeometry)
//   - `family-schemas/`     the Stage-4 data-model synthesis output (GeneratedSchemas)
//   - `family-registry/`    the Stage-5 registered output (RegisteredFamily)
//
// Pipeline flow per APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4:
//
//   unknown JSON
//     ─[Stage 1]→ FamilyDefinition   ─[Stage 2]→ ParametricFamily
//     ─[Stage 3]→ GeneratedGeometry  ─[Stage 4]→ GeneratedSchemas
//     ─[Stage 5]→ RegisteredFamily

export {
    runFamilyPipeline,
    isPipelineSuccess,
} from './run-pipeline.js';
export type {
    RunFamilyPipelineOptions,
    RunFamilyPipelineStages,
    RunFamilyPipelineSuccess,
    RunFamilyPipelineOutcome,
} from './run-pipeline.js';
