// A.1 (Phase A · Sprint 1) — @pryzm/typology-pipeline public surface.
//
// The L3 multi-typology generative pipeline.  Imported by:
//   - composeRuntime() — wires the singleton registry + router into the
//     editor runtime
//   - apps/editor/src/ui/onboarding/RACChatbot.tsx — dispatches packs
//   - per-typology packs (apartment / house / small-office in Phase A;
//     22 more later phases) — they register themselves at boot
//
// Strategic context — see:
//   - docs/03-execution/plans/typology-expansion-roadmap.md §4-§6
//   - docs/03-execution/plans/master-execution-tracker.md A.1
//   - docs/02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md (DRAFT — A.20)

// ── core types ──────────────────────────────────────────────────────────
export type {
    PipelineStage,
    PipelineInput,
    PipelineResult,
    PipelineBrief,
    PipelineMetadata,
    SiteContextSnapshot,
    ClimateSummary,
    UserRole,
    GeneratedPlan,
    EmittedCommand,
    CognitionEvaluation,
    StageOutcome,
    StageContext,
    StageHandler,
    BriefStage,
    SiteStage,
    ConstraintsStage,
    GenerativeStage,
    ValidatorsStage,
    CognitionStage,
    BimEmitStage,
    TypologyStageBundle,
    RegisteredTypologyPack,
    ValidatedBrief,
    ResolvedSiteContext,
    ResolvedConstraints,
} from './types.js';
export { PIPELINE_STAGES } from './types.js';

// ── registry ────────────────────────────────────────────────────────────
export {
    createTypologyRegistry,
    type TypologyRegistry,
    type RegistryChangeListener,
} from './TypologyRegistry.js';

// ── router ──────────────────────────────────────────────────────────────
export {
    createPipelineRouter,
    type PipelineRouter,
    type PipelineRouterOptions,
} from './PipelineRouter.js';

// ── default stage handlers (each pack overrides selectively) ────────────
export {
    defaultBriefStage,
    defaultSiteStage,
    defaultConstraintsStage,
    defaultValidatorsStage,
    defaultCognitionStage,
    defaultBimEmitStage,
} from './stages/defaults.js';

// ── stage helpers (used by per-typology pack stage authors) ─────────────
export { sanitiseBriefMetadata } from './stages/briefCapture.js';
export {
    computeParcelArea,
    computeParcelBbox,
} from './stages/siteContext.js';
export { joinProgramRulesWithRegulatory } from './stages/constraintResolution.js';
export { selectEngine } from './stages/generative.js';
export {
    runValidators,
    type SpatialValidator,
    type ValidationReport,
} from './stages/validators.js';
export {
    evaluateCognition,
    type CognitionEvaluator,
} from './stages/cognition.js';
export {
    concatCommandGroups,
    isEmittedCommand,
} from './stages/bimEmission.js';
