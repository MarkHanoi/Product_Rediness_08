// A.1 (Phase A · Sprint 1) — The 7-stage PipelineRouter.
//
// `dispatch(input)` resolves the `TypologyId` in the registry, then
// chains the 7 stages: brief → site → constraints → generative →
// validators → cognition → BIM-emit.
//
// L3-pure: no I/O.  The router does not know whether the generative
// stage is an AI workflow or a deterministic engine — that's the pack's
// concern.  P8 (every public surface emits ≥1 OpenTelemetry span) is
// satisfied here: the router opens an outer span + a per-stage span.
//
// Strategic context: docs/03-execution/plans/typology-expansion-roadmap.md §6.

import { trace, SpanStatusCode, type Tracer } from '@opentelemetry/api';
import type { TypologyRegistry } from './TypologyRegistry.js';
import {
    defaultBriefStage,
    defaultSiteStage,
    defaultConstraintsStage,
    defaultValidatorsStage,
    defaultCognitionStage,
    defaultBimEmitStage,
} from './stages/defaults.js';
import type {
    PipelineInput,
    PipelineResult,
    PipelineStage,
    PipelineMetadata,
    StageContext,
    StageOutcome,
    GeneratedPlan,
    EmittedCommand,
    CognitionEvaluation,
    ResolvedSiteContext,
    ResolvedConstraints,
    ValidatedBrief,
} from './types.js';

const TRACER_NAME = '@pryzm/typology-pipeline';

export interface PipelineRouterOptions {
    /** Override the OpenTelemetry tracer for tests.  Defaults to the
     *  process-default tracer registered by `composeRuntime()`. */
    readonly tracer?: Tracer;
    /** Override `performance.now()` for deterministic stage-timing tests. */
    readonly now?: () => number;
    /** Override `crypto.randomUUID()` for deterministic correlation-id tests. */
    readonly newCorrelationId?: () => string;
}

export interface PipelineRouter {
    /**
     * Dispatch the input through the 7-stage pipeline.  Returns a
     * discriminated-union result — never throws for "pack failed" cases
     * (those are returned as `ok: false`).  Throws only for programmer
     * errors (typology not registered, malformed input).
     */
    dispatch(input: PipelineInput): Promise<PipelineResult>;
}

export function createPipelineRouter(
    registry: TypologyRegistry,
    options: PipelineRouterOptions = {},
): PipelineRouter {
    const tracer = options.tracer ?? trace.getTracer(TRACER_NAME);
    const now = options.now ?? (() => performance.now());
    const newCorrelationId =
        options.newCorrelationId ?? (() => crypto.randomUUID());

    async function dispatch(input: PipelineInput): Promise<PipelineResult> {
        const correlationId = input.correlationId ?? newCorrelationId();
        const pack = registry.get(input.brief.typologyId);
        if (!pack) {
            // Programmer error: caller passed an unregistered id.  This is
            // NOT a soft-failure — it's a wiring bug.
            throw new Error(
                `PipelineRouter: typology '${input.brief.typologyId}' is not registered. ` +
                    `Available: [${registry.listIds().join(', ') || '<empty>'}]`,
            );
        }

        // Plan-tier gate (per C39).  This is a SOFT-failure return — the
        // editor shows an "upgrade your plan" surface, not a thrown error.
        if (!isTierSufficient(input.userTier, pack.manifest.requiredPlanTier)) {
            return {
                ok: false,
                correlationId,
                typologyId: pack.manifest.id as PipelineInput['brief']['typologyId'],
                failedAt: 'brief',
                reason:
                    `Typology '${pack.manifest.id}' requires plan tier ` +
                    `'${pack.manifest.requiredPlanTier}'; user is on '${input.userTier}'.`,
                partial: {
                    stagesRun: [],
                    engine: 'none',
                    stageTimings: {},
                },
            };
        }

        const stages = pack.stages;
        const stagesRun: PipelineStage[] = [];
        const stageTimings: Partial<Record<PipelineStage, number>> = {};
        let engine: 'ai-workflow' | 'deterministic' | 'none' = 'none';

        // The outer span wraps the entire dispatch.  Inner per-stage spans
        // are opened by `runStage()` below.
        const outerSpan = tracer.startSpan('typology-pipeline.dispatch', {
            attributes: {
                'pryzm.typology.id': pack.manifest.id,
                'pryzm.typology.version': pack.manifest.version,
                'pryzm.correlation.id': correlationId,
                'pryzm.user.tier': input.userTier,
                'pryzm.user.role': input.brief.role,
            },
        });

        try {
            const ctx = (spanName: string): StageContext => ({
                manifest: pack.manifest,
                input,
                spanName,
            });

            // ── Stage 1: brief ─────────────────────────────────────────
            const briefOutcome = await runStage<typeof input.brief, ValidatedBrief>(
                'brief',
                stages.brief ?? defaultBriefStage,
                input.brief,
                ctx('typology-pipeline.stage.brief'),
                tracer,
                now,
                stagesRun,
                stageTimings,
            );
            if (!briefOutcome.ok) {
                return failResult(correlationId, pack.manifest.id, briefOutcome, {
                    stagesRun,
                    engine,
                    stageTimings,
                });
            }

            // ── Stage 2: site ──────────────────────────────────────────
            const siteOutcome = await runStage<
                { brief: ValidatedBrief; site: PipelineInput['site'] },
                ResolvedSiteContext
            >(
                'site',
                stages.site ?? defaultSiteStage,
                { brief: briefOutcome.artifact, site: input.site },
                ctx('typology-pipeline.stage.site'),
                tracer,
                now,
                stagesRun,
                stageTimings,
            );
            if (!siteOutcome.ok) {
                return failResult(correlationId, pack.manifest.id, siteOutcome, {
                    stagesRun,
                    engine,
                    stageTimings,
                });
            }

            // ── Stage 3: constraints ───────────────────────────────────
            const constraintsOutcome = await runStage<
                { brief: ValidatedBrief; site: ResolvedSiteContext },
                ResolvedConstraints
            >(
                'constraints',
                stages.constraints ?? defaultConstraintsStage,
                { brief: briefOutcome.artifact, site: siteOutcome.artifact },
                ctx('typology-pipeline.stage.constraints'),
                tracer,
                now,
                stagesRun,
                stageTimings,
            );
            if (!constraintsOutcome.ok) {
                return failResult(
                    correlationId,
                    pack.manifest.id,
                    constraintsOutcome,
                    { stagesRun, engine, stageTimings },
                );
            }

            // ── Stage 4: generative (MANDATORY) ────────────────────────
            const generativeOutcome = await runStage<
                {
                    brief: ValidatedBrief;
                    site: ResolvedSiteContext;
                    constraints: ResolvedConstraints;
                },
                GeneratedPlan
            >(
                'generative',
                stages.generative,
                {
                    brief: briefOutcome.artifact,
                    site: siteOutcome.artifact,
                    constraints: constraintsOutcome.artifact,
                },
                ctx('typology-pipeline.stage.generative'),
                tracer,
                now,
                stagesRun,
                stageTimings,
            );
            if (!generativeOutcome.ok) {
                return failResult(
                    correlationId,
                    pack.manifest.id,
                    generativeOutcome,
                    { stagesRun, engine, stageTimings },
                );
            }
            engine = generativeOutcome.artifact.engine;

            // ── Stage 5: validators ────────────────────────────────────
            const validatorsOutcome = await runStage<
                { plan: GeneratedPlan; constraints: ResolvedConstraints },
                GeneratedPlan
            >(
                'validators',
                stages.validators ?? defaultValidatorsStage,
                {
                    plan: generativeOutcome.artifact,
                    constraints: constraintsOutcome.artifact,
                },
                ctx('typology-pipeline.stage.validators'),
                tracer,
                now,
                stagesRun,
                stageTimings,
            );
            if (!validatorsOutcome.ok) {
                return failResult(
                    correlationId,
                    pack.manifest.id,
                    validatorsOutcome,
                    { stagesRun, engine, stageTimings },
                );
            }

            // ── Stage 6: cognition ─────────────────────────────────────
            const cognitionOutcome = await runStage<
                { plan: GeneratedPlan; site: ResolvedSiteContext },
                readonly CognitionEvaluation[]
            >(
                'cognition',
                stages.cognition ?? defaultCognitionStage,
                {
                    plan: validatorsOutcome.artifact,
                    site: siteOutcome.artifact,
                },
                ctx('typology-pipeline.stage.cognition'),
                tracer,
                now,
                stagesRun,
                stageTimings,
            );
            if (!cognitionOutcome.ok) {
                return failResult(
                    correlationId,
                    pack.manifest.id,
                    cognitionOutcome,
                    { stagesRun, engine, stageTimings },
                );
            }

            // ── Stage 7: BIM emit ──────────────────────────────────────
            const emitOutcome = await runStage<
                { plan: GeneratedPlan },
                readonly EmittedCommand[]
            >(
                'bim-emit',
                stages.bimEmit ?? defaultBimEmitStage,
                { plan: validatorsOutcome.artifact },
                ctx('typology-pipeline.stage.bim-emit'),
                tracer,
                now,
                stagesRun,
                stageTimings,
            );
            if (!emitOutcome.ok) {
                return failResult(correlationId, pack.manifest.id, emitOutcome, {
                    stagesRun,
                    engine,
                    stageTimings,
                });
            }

            outerSpan.setStatus({ code: SpanStatusCode.OK });
            return {
                ok: true,
                correlationId,
                typologyId: pack.manifest.id as PipelineInput['brief']['typologyId'],
                commands: emitOutcome.artifact,
                cognition: cognitionOutcome.artifact,
                metadata: { stagesRun, engine, stageTimings },
            };
        } catch (err) {
            // Programmer error (stage handler threw instead of returning
            // `ok: false`).  Record + rethrow so the harness surfaces it.
            outerSpan.recordException(err as Error);
            outerSpan.setStatus({
                code: SpanStatusCode.ERROR,
                message: String(err),
            });
            throw err;
        } finally {
            outerSpan.end();
        }
    }

    return { dispatch };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers.
// ─────────────────────────────────────────────────────────────────────────────

async function runStage<TIn, TOut>(
    stage: PipelineStage,
    handler: (
        input: TIn,
        ctx: StageContext,
    ) => Promise<StageOutcome<TOut>> | StageOutcome<TOut>,
    input: TIn,
    ctx: StageContext,
    tracer: Tracer,
    now: () => number,
    stagesRun: PipelineStage[],
    stageTimings: Partial<Record<PipelineStage, number>>,
): Promise<StageOutcome<TOut>> {
    const span = tracer.startSpan(ctx.spanName, {
        attributes: {
            'pryzm.typology.id': ctx.manifest.id,
            'pryzm.pipeline.stage': stage,
        },
    });
    const t0 = now();
    try {
        const outcome = await handler(input, ctx);
        stagesRun.push(stage);
        stageTimings[stage] = now() - t0;
        if (!outcome.ok) {
            span.setStatus({
                code: SpanStatusCode.ERROR,
                message: outcome.reason,
            });
        } else {
            span.setStatus({ code: SpanStatusCode.OK });
        }
        return outcome;
    } catch (err) {
        stageTimings[stage] = now() - t0;
        span.recordException(err as Error);
        span.setStatus({
            code: SpanStatusCode.ERROR,
            message: String(err),
        });
        throw err;
    } finally {
        span.end();
    }
}

function failResult(
    correlationId: string,
    typologyId: string,
    outcome: { readonly ok: false; readonly reason: string; readonly stage: PipelineStage },
    partial: PipelineMetadata,
): PipelineResult {
    return {
        ok: false,
        correlationId,
        typologyId: typologyId as PipelineInput['brief']['typologyId'],
        failedAt: outcome.stage,
        reason: outcome.reason,
        partial,
    };
}

// Tier ordering per C39: free-trial < solo < studio < mid-firm < enterprise.
// `developer` + `admin` are orthogonal (marketplace developer / PRYZM staff)
// and bypass the consumer-tier gate.
const TIER_RANK: Record<string, number> = {
    'free-trial': 0,
    solo: 1,
    studio: 2,
    'mid-firm': 3,
    enterprise: 4,
};
function isTierSufficient(userTier: string, requiredTier: string): boolean {
    if (userTier === 'developer' || userTier === 'admin') return true;
    const user = TIER_RANK[userTier];
    const required = TIER_RANK[requiredTier];
    if (user === undefined || required === undefined) return false;
    return user >= required;
}
