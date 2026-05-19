// @pryzm/ai-host — Generate3Options workflow (S52 D1, D3, D4).
//
// Spec source:
//   • `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md` §S52
//     lines 422-462 — fan-out 3 parallel relay calls, refund on
//     post-call overshoot, enqueue 3 separate options as pending
//     actions so the user picks one (or none).
//   • SPEC-28 §3 — per-call ceiling $0.18; descriptor estimate $0.15.
//   • [strategic ADR-014] — generative workflows DO mutate state on
//     approval (the option's `proposedCommands` flow through to the
//     command bus on user approve).
//
// PIPELINE per spec lines 427-462:
//
//   1. AiPlane.submit() runs `costMeter.preCheckBudget(0.15)` → if
//      rejected, plane enqueues a parent rejected action and the
//      impl never runs (S49 wiring).
//   2. Impl reads `region: PlanRegion` from `ctx.input`.
//   3. Builds three style-tagged prompts + `Promise.all` fan-out.
//   4. Sums actual costs. If sum > $0.18 (post-call hard cap) →
//      `costMeter.refund(projectId, totalCost)` + return rejected
//      summary in parent preview.
//   5. For each option, side-effect-enqueues a SEPARATE
//      `AiPendingAction` via `approvalQueue.enqueue(...)` —
//      `proposedCommands` from the option, `preview.kind = 'image'`,
//      status `'pending'`. Approving exactly ONE option sends its
//      commands through the command bus; rejecting all three is the
//      no-op default.
//   6. Returns a `WorkflowRunResult` with `actualCostUsd` =
//      `totalCostUsd` so the plane records the actual against the
//      meter and synthesises the parent action with the
//      `Generate3Result` summary preview.
//
// Per-item enqueue happens INSIDE the impl (matching the PlanCritique
// pattern) because the plane's `submit()` only ever produces ONE
// parent action per workflow run.

import type {
  AiApprovalQueueLike,
  AiPendingAction,
  CommandPayloadRef,
  WorkflowDescriptor,
  WorkflowExecutionContext,
  WorkflowImpl,
  WorkflowRunResult,
} from '../types.js';
import type { RelayPorter } from '../AnthropicRelay.js';
import {
  GENERATE_3_OPTIONS_COST_USD_ESTIMATE,
  GENERATE_3_OPTIONS_HARD_CEILING_USD,
  OPTION_STYLES,
  OPTION_STYLE_LABELS,
  type Generate3Result,
  type GenerateOption,
  type OptionStyle,
  type PlanRegion,
} from './Generate3OptionsTypes.js';

/** Minimal cost-meter contract the impl needs. The full `CostMeter`
 *  from `@pryzm/ai-cost` satisfies this duck-typed interface — the
 *  ai-host package keeps the dep out of its public type surface so
 *  the editor cold-start chunk stays small. */
export interface CostMeterRefundLike {
  refund(projectId: string, costUsd: number): Promise<number>;
}

/** WorkflowDescriptor registered with the AiPlane. Estimate $0.15
 *  per phase doc line 414 (three $0.05 fan-out calls + orchestration
 *  headroom); sits under the SPEC-28 §3 $0.18 ceiling enforced by
 *  `WorkflowRegistry.register`. */
export const generate3OptionsDescriptor: WorkflowDescriptor = {
  id: 'generate-3-options',
  title: 'Generate three options',
  // 'generative' kind — turns AI from advisor into co-author per
  // spec line 414. Approval flows commands to the command bus.
  kind: 'generative',
  estimatedCostUsd: GENERATE_3_OPTIONS_COST_USD_ESTIMATE,
  surface: 'ai.generate.3-options',
  description:
    'Fans out three parallel LLM calls (Minimal / Efficient / Generous) for a user-selected plan region; each option lands in the approval queue as a separate pending action — the user picks one (or none) to commit.',
};

/** Default model id used by the relay request — Haiku 4.5 for
 *  fast fan-out per the server log line `[server] Anthropic model
 *  id: claude-haiku-4-5-20251014`. */
export const GENERATE_3_OPTIONS_MODEL = 'claude-haiku-4-5-20251014';

/** Token cap for each option response — keep small since each
 *  option only emits a JSON command list. */
export const GENERATE_3_OPTIONS_MAX_TOKENS = 1200;

/** System prompt — architect-domain shaped + JSON-only output.
 *  Each style-call gets the SAME system prompt; the user prompt
 *  carries the style hint. */
export const GENERATE_3_OPTIONS_SYSTEM_PROMPT = [
  'You are an architectural co-design assistant.',
  'A region of a floor plan has been selected. Propose ONE arrangement of elements that fits the requested style.',
  '',
  'Respond with a JSON object of the shape:',
  '{',
  '  "summary": string,                         // one sentence, max 80 chars',
  '  "commands": [                              // 1..20 entries',
  '    { "command": string, "payload": object } // dispatched verbatim through the command bus',
  '  ]',
  '}',
  '',
  'No preamble, no markdown fences. ONLY the JSON object.',
  'If you cannot generate a viable arrangement, respond with {"summary":"","commands":[]}.',
].join('\n');

/** Build the user prompt for ONE style call. Pure — exported so
 *  tests pin the prompt shape. */
export function buildOptionPrompt(
  region: PlanRegion,
  style: OptionStyle,
): string {
  const [minX, minY, maxX, maxY] = region.bounds;
  return JSON.stringify(
    {
      regionId: region.id,
      regionBoundsMm: { minX, minY, maxX, maxY },
      regionIntent: region.intent,
      visibleElementIds: region.visibleElementIds ?? [],
      requestedStyle: style,
      styleNotes: STYLE_GUIDANCE[style],
      request: `Propose a single ${style} arrangement of elements for this region.`,
    },
    null,
    0,
  );
}

const STYLE_GUIDANCE: Readonly<Record<OptionStyle, string>> = {
  minimal:
    'Use the fewest elements possible. Prefer multi-function pieces. Maximise unobstructed floor area.',
  efficient:
    'Optimise for everyday use. Hit ergonomic clearances exactly. Balance furniture density with circulation.',
  generous:
    'Use the full region. Add comfort + storage where the budget allows. Prefer wider clearances.',
};

/** Parse one option's relay-text response. LOUD-FAIL-SOFT per
 *  SPEC-28 §10: malformed JSON returns `null` (caller treats as
 *  empty option); a valid JSON object with a malformed commands
 *  array returns the option with `commands: []`. */
export function parseOption(
  text: string,
  style: OptionStyle,
  costUsd: number,
): GenerateOption | null {
  if (typeof text !== 'string' || text.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    if (typeof console !== 'undefined') {
      console.warn(`[ai-host/Generate3Options] relay returned non-JSON for style '${style}' — dropping option.`);
    }
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const r = parsed as Record<string, unknown>;
  const summaryRaw = r.summary;
  const summary = typeof summaryRaw === 'string' ? summaryRaw : '';
  const commands = parseOptionCommands(r.commands);
  const opt: GenerateOption = {
    style,
    proposedCommands: commands,
    costUsd,
    ...(summary ? { summary } : {}),
  };
  return opt;
}

/** Parse a relay-text `commands` field into a CommandPayloadRef
 *  array. Loud-fail-soft per SPEC-28 §10. Exported for unit
 *  testability. */
export function parseOptionCommands(raw: unknown): readonly CommandPayloadRef[] {
  if (!Array.isArray(raw)) return [];
  const out: CommandPayloadRef[] = [];
  for (const cmd of raw) {
    if (cmd === null || typeof cmd !== 'object') continue;
    const c = cmd as Record<string, unknown>;
    if (typeof c.command !== 'string' || c.command.length === 0) continue;
    out.push({ command: c.command, payload: c.payload });
    if (out.length >= 20) break; // matches the system-prompt cap
  }
  return out;
}

/** Dependencies the impl needs at run time. */
export interface Generate3OptionsDeps {
  readonly relay: RelayPorter;
  readonly approvalQueue: AiApprovalQueueLike;
  readonly costMeter: CostMeterRefundLike;
  /** Optional hook so tests can introspect every per-option action
   *  enqueued by the impl. Default: noop. */
  readonly onOptionEnqueued?: (action: AiPendingAction, option: GenerateOption) => void;
  /** Optional thumbnail renderer — receives the parsed option and
   *  returns a preview URL string. The default returns a `data:`
   *  placeholder so the approval-queue UI always has *something* to
   *  render even when the bake worker hasn't shipped a render path
   *  yet. The real bake-worker render lands at S52 D2. */
  readonly renderPreview?: (option: GenerateOption, region: PlanRegion) => string | Promise<string>;
  /** Override for the model id (default `GENERATE_3_OPTIONS_MODEL`). */
  readonly model?: string;
  /** Clock injection — defaults to Date.now. */
  readonly now?: () => number;
}

/** Input the plane hands to the impl through `ctx.input`. */
export interface Generate3OptionsInput {
  readonly region: PlanRegion;
}

/** Returned by the impl as `WorkflowRunResult`. */
export interface Generate3OptionsWorkflowResult extends WorkflowRunResult {
  readonly actualCostUsd: number;
  readonly preview: { kind: 'json'; data: Generate3Result };
}

/** Default placeholder preview renderer. Returns a tiny inline data
 *  URL so the approval-queue UI never null-checks. */
function defaultRenderPreview(option: GenerateOption, region: PlanRegion): string {
  const label = `${OPTION_STYLE_LABELS[option.style]}/${region.id}`;
  // 1×1 transparent PNG placeholder — the bake-worker thumbnail
  // replaces this at S52 D2.
  return `data:text/plain;charset=utf-8,${encodeURIComponent(label)}`;
}

/** Factory returning the `WorkflowImpl` the AiPlane invokes. */
export function createGenerate3OptionsImpl(deps: Generate3OptionsDeps): WorkflowImpl {
  const now = deps.now ?? (() => Date.now());
  const model = deps.model ?? GENERATE_3_OPTIONS_MODEL;
  const renderPreview = deps.renderPreview ?? defaultRenderPreview;

  return async function generate3OptionsImpl(
    ctx: WorkflowExecutionContext,
  ): Promise<Generate3OptionsWorkflowResult> {
    const input = (ctx.input ?? null) as Generate3OptionsInput | null;
    if (!input || !input.region) {
      const result: Generate3Result = {
        status: 'rejected',
        reason: 'Generate3Options requires { region } in workflow input.',
      };
      return {
        proposedCommands: [],
        actualCostUsd: 0,
        preview: { kind: 'json', data: result },
      };
    }

    const region = input.region;

    // Fan-out per spec line 433 — three parallel relay calls. Catch
    // per-call failures so one slow / dropped style doesn't take
    // down the other two.
    const settled = await Promise.allSettled(
      OPTION_STYLES.map(async (style) => {
        const userPrompt = buildOptionPrompt(region, style);
        const resp = await deps.relay.complete({
          model,
          system: GENERATE_3_OPTIONS_SYSTEM_PROMPT,
          user: userPrompt,
          maxTokens: GENERATE_3_OPTIONS_MAX_TOKENS,
        });
        const opt = parseOption(resp.text, style, resp.costUsd);
        return { style, costUsd: resp.costUsd, option: opt };
      }),
    );

    let totalCostUsd = 0;
    const validOptions: GenerateOption[] = [];
    for (const r of settled) {
      if (r.status === 'fulfilled') {
        totalCostUsd += r.value.costUsd;
        if (r.value.option) validOptions.push(r.value.option);
      }
      // Rejected fan-out call — cost not incurred (fetch failed).
    }

    // Post-call hard cap per spec lines 444-447. If the fan-out
    // cost the user more than the per-call ceiling, refund and
    // reject. Loud rejection — the user keeps their budget intact.
    if (totalCostUsd > GENERATE_3_OPTIONS_HARD_CEILING_USD) {
      const refundedUsd = await deps.costMeter.refund(ctx.projectId, totalCostUsd);
      const result: Generate3Result = {
        status: 'rejected',
        reason: `Fan-out cost $${totalCostUsd.toFixed(4)} exceeded per-call ceiling $${GENERATE_3_OPTIONS_HARD_CEILING_USD.toFixed(2)} — refunded.`,
        refundedUsd,
      };
      return {
        proposedCommands: [],
        actualCostUsd: 0, // refunded — net cost was zero
        preview: { kind: 'json', data: result },
      };
    }

    // Per-option enqueue. Each option gets its OWN pending action
    // so the user has a three-way pick between them in the queue
    // UI per spec lines 453-460.
    //
    // `optionsWithPreviews` accumulates the preview-enriched option
    // objects for the parent summary.  A separate output array (rather
    // than mutating `validOptions` in-place) keeps the loop body
    // free of index arithmetic and makes the data-flow explicit.
    const optionsWithPreviews: GenerateOption[] = [];
    let seq = 0;
    for (const option of validOptions) {
      const previewUrl = await Promise.resolve(renderPreview(option, region));
      const optWithPreview: GenerateOption = { ...option, previewUrl };
      const action: AiPendingAction = {
        id: `${ctx.runId}-opt-${(++seq).toString(36)}`,
        runId: ctx.runId,
        workflow: generate3OptionsDescriptor.kind, // 'generative'
        proposedCommands: option.proposedCommands,
        estimatedCostUsd: option.costUsd,
        preview: { kind: 'image', url: previewUrl },
        createdAt: now(),
        status: 'pending',
      };
      optionsWithPreviews.push(optWithPreview);
      deps.approvalQueue.enqueue(action);
      deps.onOptionEnqueued?.(action, optWithPreview);
    }

    const result: Generate3Result = {
      status: 'ok',
      totalCostUsd,
      options: optionsWithPreviews,
    };

    return {
      proposedCommands: [], // parent action zero-command — picking happens at per-option approval
      actualCostUsd: totalCostUsd,
      preview: { kind: 'json', data: result },
    };
  };
}
