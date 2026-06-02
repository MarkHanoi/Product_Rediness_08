// A.1 (Phase A · Sprint 1) — Public types for the L3 TypologyPipeline.
//
// The 7-stage pipeline lives in `PipelineRouter.dispatch(input)` and
// produces a `PipelineResult` discriminated union. Every typology pack
// follows the same shape; the AI / deterministic engine each pack ships
// is invoked at Stage 4.
//
// Strategic context: docs/03-execution/plans/typology-expansion-roadmap.md §4-§6.

import type {
    TypologyId,
    TypologyManifest,
    CognitionLayer,
    PlanTier,
} from '@pryzm/schemas';

// ─────────────────────────────────────────────────────────────────────────────
// Stage identifiers — the 7 canonical pipeline stages.
//
// Per typology-expansion-roadmap §6 (Canonical pipeline shape):
//   S1 brief        → capture user brief from chatbot / form
//   S2 site         → resolve site context (parcel + climate + zoning)
//   S3 constraints  → resolve typology-specific constraints (program rules)
//   S4 generative   → AI workflow OR deterministic engine (pack's choice)
//   S5 validators   → typology-specific spatial validators
//   S6 cognition    → run L1-L7 cognition layer evaluators the pack declared
//   S7 bim-emit     → emit Command[] for the editor's commandBus
// ─────────────────────────────────────────────────────────────────────────────
export type PipelineStage =
    | 'brief'
    | 'site'
    | 'constraints'
    | 'generative'
    | 'validators'
    | 'cognition'
    | 'bim-emit';

export const PIPELINE_STAGES: readonly PipelineStage[] = [
    'brief',
    'site',
    'constraints',
    'generative',
    'validators',
    'cognition',
    'bim-emit',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// User role + brief — the RAC chatbot's structured output.
//
// Per product-vision §5 Step 2: the chatbot asks role + typology + brief.
// `UserRole` is a coarse classification; finer role nuance (project type,
// firm size, etc.) is per-typology and lives in `brief.metadata`.
// ─────────────────────────────────────────────────────────────────────────────
export type UserRole =
    | 'architect'
    | 'engineer'
    | 'developer'
    | 'contractor'
    | 'owner'
    | 'student'
    | 'unknown';

/**
 * The brief captured at Stage 1.  Shape is intentionally permissive
 * (`Record<string, unknown>` metadata) — each typology pack defines its
 * own brief schema and validates it at Stage 1.  The pipeline layer just
 * routes it; it does not introspect.
 */
export interface PipelineBrief {
    readonly typologyId: TypologyId;
    readonly role: UserRole;
    /** Free-form metadata captured by the chatbot.  Typology-specific. */
    readonly metadata: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Site context input — minimal handle to the L3 SiteStore snapshot.
//
// The pipeline does NOT own site state — that's `@pryzm/stores` SiteStore
// (per C19).  The router takes a frozen snapshot at dispatch time and
// passes it to every stage that needs it.  Stages MUST NOT mutate it.
// ─────────────────────────────────────────────────────────────────────────────
export interface SiteContextSnapshot {
    /** Project-local site id (C19 §2.2). */
    readonly siteId: string;
    /** Lat/lon centroid for climate fetch (per C12). */
    readonly centroid: { readonly lat: number; readonly lon: number };
    /** Closed-polygon parcel boundary in scene-XZ metres (C19 §1.4).
     *  Empty array = parcel not yet authored (Stage 2 will fail-soft). */
    readonly parcelBoundary: ReadonlyArray<{
        readonly x: number;
        readonly z: number;
    }>;
    /** Climate-summary snapshot (per C21).  `null` if not yet ingested. */
    readonly climate: ClimateSummary | null;
    /** Site address (PII per C22). */
    readonly address: string | null;
}

export interface ClimateSummary {
    readonly source: 'epw' | 'noaa' | 'mock';
    /** Heating + cooling design days, sun-path summary, wind rose. Pack
     *  consumers (Stages 4-6) read whatever fields they declare. */
    readonly profile: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline input — the single argument to `PipelineRouter.dispatch()`.
// ─────────────────────────────────────────────────────────────────────────────
export interface PipelineInput {
    readonly brief: PipelineBrief;
    readonly site: SiteContextSnapshot;
    /** Plan tier of the calling user (per C39).  Used by Stage 3 to gate
     *  pack feature availability (eg an enterprise-only pack rejects on
     *  `tier === 'solo'`). */
    readonly userTier: PlanTier;
    /** When true, the generative stage prefers the deterministic engine
     *  even if the pack ships an AI workflow.  Used by the offline-mode
     *  surface + the demo path. */
    readonly preferDeterministic?: boolean;
    /** Optional dispatch correlation id — propagated to spans + result
     *  metadata.  Useful for the inspect / replay UI. */
    readonly correlationId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline output — discriminated union per stage outcome.
//
// Every stage either succeeds (`ok: true` carrying its produced artifact)
// or fails-soft (`ok: false` carrying a typed reason).  The router stops
// at the first soft-failure and returns the partial chain — this is the
// canonical "graceful degradation" shape per typology-expansion §6.4.
// ─────────────────────────────────────────────────────────────────────────────
export type StageOutcome<TArtifact> =
    | { readonly ok: true; readonly artifact: TArtifact }
    | { readonly ok: false; readonly reason: string; readonly stage: PipelineStage };

/** Stage 4 produces a sequence of intermediate "plan" objects each pack
 *  defines on its own — the router treats them as opaque. */
export interface GeneratedPlan {
    readonly engine: 'ai-workflow' | 'deterministic';
    readonly payload: unknown;
}

/** Stage 7 emits an opaque list of commands the editor's commandBus
 *  consumes.  The pipeline layer does NOT depend on @pryzm/command-bus
 *  (which is L1) — it returns a serialised shape that L5 dispatch code
 *  unboxes. */
export interface EmittedCommand {
    readonly type: string;
    readonly payload: unknown;
}

export interface CognitionEvaluation {
    readonly layer: CognitionLayer;
    readonly score: number;        // 0-1
    readonly violations: readonly string[];
}

/**
 * The final pipeline result.  When `ok: true`, every stage succeeded and
 * `commands[]` is ready for dispatch.  When `ok: false`, `failedAt` names
 * the stage that bailed and `partial` holds whatever was produced by the
 * stages that ran (useful for the inspect-debug UI).
 */
export type PipelineResult =
    | {
          readonly ok: true;
          readonly correlationId: string;
          readonly typologyId: TypologyId;
          readonly commands: readonly EmittedCommand[];
          readonly cognition: readonly CognitionEvaluation[];
          readonly metadata: PipelineMetadata;
      }
    | {
          readonly ok: false;
          readonly correlationId: string;
          readonly typologyId: TypologyId;
          readonly failedAt: PipelineStage;
          readonly reason: string;
          readonly partial: PipelineMetadata;
      };

export interface PipelineMetadata {
    readonly stagesRun: readonly PipelineStage[];
    readonly engine: 'ai-workflow' | 'deterministic' | 'none';
    /** Wall-clock milliseconds per stage, useful for the dev panel. */
    readonly stageTimings: Partial<Record<PipelineStage, number>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage handler shape — every stage exports a function of this shape.
//
// Stages are pure: input → output.  They MAY return Promises (the
// generative stage often does — `await aiWorkflow.run()`).  The router
// awaits each in sequence.
// ─────────────────────────────────────────────────────────────────────────────
export interface StageContext {
    readonly manifest: TypologyManifest;
    readonly input: PipelineInput;
    /** Span name for OpenTelemetry — every stage emits ≥ 1 span per P8. */
    readonly spanName: string;
}

export type StageHandler<TInput, TOutput> = (
    input: TInput,
    ctx: StageContext,
) => Promise<StageOutcome<TOutput>> | StageOutcome<TOutput>;

// Per-stage handler-argument types — used by `PipelineRouter` when wiring
// the chain.  Each stage's output is the next stage's input.
export type BriefStage = StageHandler<PipelineBrief, ValidatedBrief>;
export type SiteStage = StageHandler<
    { brief: ValidatedBrief; site: SiteContextSnapshot },
    ResolvedSiteContext
>;
export type ConstraintsStage = StageHandler<
    { brief: ValidatedBrief; site: ResolvedSiteContext },
    ResolvedConstraints
>;
export type GenerativeStage = StageHandler<
    { brief: ValidatedBrief; site: ResolvedSiteContext; constraints: ResolvedConstraints },
    GeneratedPlan
>;
export type ValidatorsStage = StageHandler<
    { plan: GeneratedPlan; constraints: ResolvedConstraints },
    GeneratedPlan
>;
export type CognitionStage = StageHandler<
    { plan: GeneratedPlan; site: ResolvedSiteContext },
    readonly CognitionEvaluation[]
>;
export type BimEmitStage = StageHandler<
    { plan: GeneratedPlan },
    readonly EmittedCommand[]
>;

// Intermediate types ─ stages refine the brief / site / constraints as
// they pass it down the chain.  Treated as opaque by the router; each
// typology pack's stage authors define its concrete shape.

export interface ValidatedBrief {
    readonly raw: PipelineBrief;
    readonly normalised: Record<string, unknown>;
}

export interface ResolvedSiteContext {
    readonly snapshot: SiteContextSnapshot;
    /** Derived facts: orientation, gross site area, etc. Pack-specific. */
    readonly derived: Record<string, unknown>;
}

export interface ResolvedConstraints {
    /** The program-rules JSON the pack ships, joined with site-derived
     *  regulatory overlays (setbacks · FAR · zoning). */
    readonly programRules: Record<string, unknown>;
    /** Regulatory constraints derived from site (per C19 §1.6 + C21). */
    readonly regulatory: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage bundle — the per-typology pack provides one of these.
//
// `PipelineRouter` is generic on this bundle; each typology pack registers
// its own implementation via `TypologyRegistry.register()`.  Stage handlers
// can be omitted and the router supplies a no-op default (Stage 1+2+7 ALL
// have sensible defaults; Stage 4 is the only mandatory one).
// ─────────────────────────────────────────────────────────────────────────────
export interface TypologyStageBundle {
    readonly brief?: BriefStage;
    readonly site?: SiteStage;
    readonly constraints?: ConstraintsStage;
    readonly generative: GenerativeStage;     // MANDATORY
    readonly validators?: ValidatorsStage;
    readonly cognition?: CognitionStage;
    readonly bimEmit?: BimEmitStage;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registered pack — the registry's value type.
// ─────────────────────────────────────────────────────────────────────────────
export interface RegisteredTypologyPack {
    readonly manifest: TypologyManifest;
    readonly stages: TypologyStageBundle;
}
