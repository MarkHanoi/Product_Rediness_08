// Apartment Layout Generator — AiPlane workflow (SPEC §4, step A4-wire).
//
// Wraps the A4-core orchestrator (generate.ts) in the AiPlane WorkflowDescriptor
// + WorkflowImpl factory (mirrors Generate3Options). Unlike Generate3Options
// (per-option approval-queue actions), the apartment layout uses AIStore +
// a custom 'apartment.layout-options-ready' event feeding the §11 modal — so the
// impl persists the scored options + emits, and returns a parent json preview.
//
// All side effects (relay, shell read, AIStore write, event emit) are INJECTED so
// the impl is testable without the live engine; the real bindings are wired at
// A4-register (MockAnthropicRelay until the CF relay lands — SPEC-47 §7).
//
// Phase A is READ-ONLY: the impl emits NO commands (SPEC step 11). Mutation
// happens only in the separate `apartment.layout-execute` handler (§12, A6).

import type {
    WorkflowDescriptor,
    WorkflowExecutionContext,
    WorkflowImpl,
    WorkflowRunResult,
} from '../../types.js';
import type { RelayPorter } from '../../AnthropicRelay.js';
import type { ApartmentGenerateLayoutPayload, ScoredLayoutOption } from './types.js';
import type { ShellAnalysis } from './shellAnalysis.js';
import { generateLayoutOptions, type GenerateLayoutResult } from './generate.js';

/** Estimated cost (USD) — ≤ SPEC-28 §3 ceiling (0.18); the registry rejects above. */
export const APARTMENT_LAYOUT_COST_USD_ESTIMATE = 0.12;

export const apartmentLayoutDescriptor: WorkflowDescriptor = {
    id: 'apartment-layout-generate',
    title: 'Generate apartment layout',
    kind: 'generative',
    estimatedCostUsd: APARTMENT_LAYOUT_COST_USD_ESTIMATE,
    surface: 'ai.apartment.layout-generate',
    description:
        'Given an apartment shell (perimeter walls + entrance door + windows), generates N ranked, ' +
        'validated, scored interior layout options. Read-only: options land in AIStore + a modal; ' +
        'the user picks one to commit via apartment.layout-execute (one undoable batch).',
};

/** Dependencies the impl needs — all injected (testable; bound at A4-register). */
export interface ApartmentLayoutDeps {
    readonly relay: RelayPorter;
    /** A3 wrapper — reads shell geometry + builds the analysis from the stores. */
    readonly shellReader: (payload: ApartmentGenerateLayoutPayload) => ShellAnalysis;
    /** Persists scored options to AIStore['pendingLayoutOptions'] (keyed by runId). */
    readonly setPendingLayouts: (runId: string, options: readonly ScoredLayoutOption[]) => void;
    /** Emits 'apartment.layout-options-ready' (runtime.events; P4). */
    readonly emit?: (event: string, payload: unknown) => void;
    readonly model?: string;
    readonly maxRetries?: number;
}

/** The parent json preview returned to the AiPlane. */
export interface ApartmentLayoutWorkflowResult extends WorkflowRunResult {
    readonly preview: { kind: 'json'; data: GenerateLayoutResult };
}

/** Factory returning the WorkflowImpl the AiPlane invokes (mirrors createGenerate3OptionsImpl). */
export function createApartmentLayoutImpl(deps: ApartmentLayoutDeps): WorkflowImpl {
    return async function apartmentLayoutImpl(ctx: WorkflowExecutionContext): Promise<ApartmentLayoutWorkflowResult> {
        const payload = (ctx.input ?? null) as ApartmentGenerateLayoutPayload | null;
        if (!payload || !payload.levelId || !Array.isArray(payload.shellWallIds) || payload.shellWallIds.length === 0) {
            return {
                proposedCommands: [],
                actualCostUsd: 0,
                preview: {
                    kind: 'json',
                    data: { options: [], status: 'rejected', attempts: 0, reason: 'requires { levelId, shellWallIds, program, constraints, options } in input' },
                },
            };
        }

        const shell = deps.shellReader(payload);
        const result = await generateLayoutOptions(
            {
                shell,
                program: payload.program,
                constraints: payload.constraints,
                weights: payload.options.scoringWeights,
                count: payload.options.count,
            },
            deps.relay,
            // Build opts conditionally — passing `model: undefined` violates
            // exactOptionalPropertyTypes against generateLayoutOptions' opts.
            { maxRetries: deps.maxRetries ?? 3, ...(deps.model !== undefined ? { model: deps.model } : {}) },
        );

        // SPEC steps 12-13: persist + emit (only when we have options). No mutation (step 11).
        if (result.status === 'ok') {
            deps.setPendingLayouts(ctx.runId, result.options);
            deps.emit?.('apartment.layout-options-ready', { runId: ctx.runId, options: result.options });
        }

        return {
            proposedCommands: [],          // read-only Phase A
            actualCostUsd: 0,              // mock relay; real cost summed via the cost meter at A4-register
            preview: { kind: 'json', data: result },
        };
    };
}
