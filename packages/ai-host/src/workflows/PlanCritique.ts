// @pryzm/ai-host — PlanCritique workflow (S51 D1, D3, D4, D6).
//
// Spec source:
//   • `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md` §S51
//     lines 322-403 (the critique workflow definition + spec sample).
//   • SPEC-28 §3 — per-call cost ceiling ($0.18, descriptor estimate $0.05).
//   • SPEC-07 §3 — visibility-state schema.
//   • [strategic ADR-014] — diagnostic workflows do NOT mutate state;
//     critique items surface as zero-command proposals (spec line 379).
//
// SHAPE — three exports:
//   • `planCritiqueDescriptor` — the WorkflowDescriptor registered
//     with the AiPlane. Cost estimate is $0.05 per phase doc line 343.
//   • `createPlanCritiqueImpl({relay, approvalQueue})` — factory
//     returning the `WorkflowImpl` the plane invokes. The factory
//     pattern mirrors `createCvHandler` from S50 so dependencies are
//     injected (testable without env hooks).
//   • `buildCritiquePrompt` + `parseCritiqueItems` — pure helpers
//     exported for unit testability.
//
// PIPELINE per spec lines 348-376:
//
//   1. AiPlane.submit() runs `costMeter.preCheckBudget(0.05)` → if
//      rejected, plane enqueues a parent rejected action and the
//      impl never runs (S49 wiring).
//   2. Impl reads snapshot + visibility from `ctx.input`.
//   3. Builds the prompt + calls the relay.
//   4. Parses critique items from the response text.
//   5. For each parsed item, enqueues a SEPARATE pending action
//      via `approvalQueue.enqueue(...)` — `proposedCommands: []`,
//      `preview.kind = 'json'`, status `'pending'`.
//   6. Returns a `WorkflowRunResult` with `actualCostUsd` from the
//      relay so the plane records the actual against the meter.
//
// The plane will then enqueue ONE more parent action (the workflow's
// `WorkflowRunResult` wrapper) with `proposedCommands: []` and a
// preview JSON summarising the run. The approval-queue UI groups the
// parent + per-item actions by `runId` (handled in the queue store —
// out of scope for this file).

import type {
  AiApprovalQueueLike,
  AiPendingAction,
  WorkflowDescriptor,
  WorkflowExecutionContext,
  WorkflowImpl,
  WorkflowRunResult,
} from '../types.js';
import type { RelayPorter } from '../AnthropicRelay.js';
import {
  PLAN_CRITIQUE_COST_USD_ESTIMATE,
  PLAN_CRITIQUE_MAX_ITEMS,
  type CritiqueItem,
  type CritiqueResult,
  type CritiqueSeverity,
  type PlanViewSnapshot,
  type SnapshotElement,
  type VisibilityState,
} from './PlanCritiqueTypes.js';

/** WorkflowDescriptor registered with the AiPlane. The plane's
 *  WorkflowRegistry validates `estimatedCostUsd <= $0.18` per
 *  SPEC-28 §3; this descriptor's estimate of $0.05 sits comfortably
 *  under that ceiling. */
export const planCritiqueDescriptor: WorkflowDescriptor = {
  id: 'plan-critique',
  title: 'Critique this plan',
  // 'rules' kind because critique is diagnostic — shares the
  //  zero-mutation-on-approval contract with rule-engine outputs.
  kind: 'rules',
  estimatedCostUsd: PLAN_CRITIQUE_COST_USD_ESTIMATE,
  surface: 'ai.plan.critique',
  description:
    'Examines visible plan elements + visibility state and surfaces design-issue critiques (door clearance, corridor width, visibility flags) as zero-command proposals in the approval queue.',
};

/** Default model id used by the relay request. The CF Worker relay
 *  override-routes Anthropic models per `[server] Anthropic model
 *  id` log line; the mock relay echoes whatever id is supplied. */
export const PLAN_CRITIQUE_MODEL = 'claude-haiku-4-5-20251014';

/** Token cap for the critique response — 20 items × ~50 tokens each
 *  + JSON wrapper overhead. */
export const PLAN_CRITIQUE_MAX_TOKENS = 1500;

/** System prompt — architect-domain-shaped. The exit-criteria target
 *  is "≥ 3 items per plan average" on 10 beta plans (phase doc line
 *  401), so the prompt asks the model to err on the side of MORE
 *  items at lower confidence rather than fewer high-confidence items. */
export const PLAN_CRITIQUE_SYSTEM_PROMPT = [
  'You are an architectural review assistant.',
  'Examine the supplied plan-view snapshot and visibility state, and surface design issues as a JSON array of critique items.',
  '',
  'Each item has the shape:',
  '{',
  '  "id": string,',
  '  "severity": "info" | "warning" | "error",',
  '  "category": string,',
  '  "message": string,',
  '  "locationRef": { "kind": "element", "elementId": string } | { "kind": "point", "x": number, "y": number },',
  '  "confidence": number  // 0..1',
  '}',
  '',
  'Categories you SHOULD use when applicable:',
  '  - "door-clearance"     — door swing arcs intersecting other elements.',
  '  - "corridor-width"     — circulation paths narrower than 1200 mm.',
  '  - "egress"             — reachability / dead-end issues.',
  '  - "visibility"         — elements hidden by visibility flags that probably should be visible.',
  '  - "structural"         — wall / column alignment issues.',
  '',
  'Surface every plausible issue, even at lower confidence — the user reviews each one.',
  'Cap your response at 20 items.',
  'Respond with ONLY the JSON array — no preamble, no markdown fences.',
].join('\n');

/** Build the user prompt for one critique call. Pure — exported so
 *  the test can pin the prompt shape against the spec example
 *  (phase doc line 357). */
export function buildCritiquePrompt(
  snapshot: PlanViewSnapshot,
  visibility: VisibilityState,
): string {
  const summarisedElements = snapshot.elements.map(summariseElement);
  return JSON.stringify(
    {
      viewId: snapshot.viewId,
      viewportBounds: snapshot.viewportBounds,
      pixelSize: snapshot.pixelSize,
      capturedAt: snapshot.capturedAt,
      visibility: { intent: visibility.intent, tags: visibility.tags },
      elements: summarisedElements,
      request: 'Critique this plan and return a JSON array of issues.',
    },
    null,
    0,
  );
}

function summariseElement(el: SnapshotElement): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: el.id,
    kind: el.kind,
    bbox: el.bbox,
  };
  if (el.label !== undefined) out.label = el.label;
  if (el.centroid !== undefined) out.centroid = el.centroid;
  if (el.attrs !== undefined) out.attrs = el.attrs;
  return out;
}

/** Parse a relay-text response into critique items. LOUD-FAIL-SOFT
 *  per SPEC-28 §10: malformed JSON returns `[]` instead of throwing;
 *  individual malformed items inside a valid array are dropped with
 *  a `console.warn` so the operator can audit the model. */
export function parseCritiqueItems(text: string): CritiqueItem[] {
  if (typeof text !== 'string' || text.length === 0) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    if (typeof console !== 'undefined') {
      console.warn('[ai-host/PlanCritique] relay returned non-JSON text — dropping critique payload.');
    }
    return [];
  }
  if (!Array.isArray(parsed)) {
    if (typeof console !== 'undefined') {
      console.warn('[ai-host/PlanCritique] relay returned non-array JSON — dropping critique payload.');
    }
    return [];
  }
  const out: CritiqueItem[] = [];
  for (const raw of parsed) {
    const item = coerceItem(raw);
    if (item) out.push(item);
    if (out.length >= PLAN_CRITIQUE_MAX_ITEMS) break;
  }
  return out;
}

function coerceItem(raw: unknown): CritiqueItem | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id.length === 0) return null;
  if (!isSeverity(r.severity)) return null;
  if (typeof r.category !== 'string' || r.category.length === 0) return null;
  if (typeof r.message !== 'string' || r.message.length === 0) return null;
  if (typeof r.confidence !== 'number' || r.confidence < 0 || r.confidence > 1) return null;
  const loc = coerceLocation(r.locationRef);
  if (!loc) return null;
  return {
    id: r.id,
    severity: r.severity,
    category: r.category,
    message: r.message,
    locationRef: loc,
    confidence: r.confidence,
  };
}

function isSeverity(v: unknown): v is CritiqueSeverity {
  return v === 'info' || v === 'warning' || v === 'error';
}

function coerceLocation(raw: unknown): CritiqueItem['locationRef'] | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.kind === 'element' && typeof r.elementId === 'string' && r.elementId.length > 0) {
    return { kind: 'element', elementId: r.elementId };
  }
  if (r.kind === 'point' && typeof r.x === 'number' && typeof r.y === 'number') {
    return { kind: 'point', x: r.x, y: r.y };
  }
  return null;
}

/** Dependencies the impl needs at run time. The `approvalQueue` is
 *  the SAME queue handle the AiPlane is wired with — the impl uses
 *  it to push per-item actions, the plane uses it to push the parent
 *  workflow action.
 *
 *  Why does the impl talk to the queue directly? Because per spec
 *  line 367-373 each critique item is a SEPARATE `AiPendingAction` —
 *  the plane's submit() pipeline only ever produces ONE parent
 *  action per workflow run, so per-item enqueue is a side-effect of
 *  the impl. */
export interface PlanCritiqueDeps {
  readonly relay: RelayPorter;
  readonly approvalQueue: AiApprovalQueueLike;
  /** Optional hook so tests can introspect every per-item action
   *  enqueued by the impl. Default: noop. */
  readonly onItemEnqueued?: (action: AiPendingAction, item: CritiqueItem) => void;
  /** Override for the model id (default `PLAN_CRITIQUE_MODEL`). */
  readonly model?: string;
  /** Clock injection — defaults to Date.now. */
  readonly now?: () => number;
}

/** Input the plane hands to the impl through `ctx.input`. The
 *  editor is responsible for capturing the snapshot client-side and
 *  shipping it through `AiPlane.submit({ input: ... })`. */
export interface PlanCritiqueInput {
  readonly snapshot: PlanViewSnapshot;
  readonly visibility: VisibilityState;
}

/** Returned by the impl as `WorkflowRunResult`. The result also
 *  goes into the parent `AiPendingAction.preview` so the approval
 *  queue UI can render a one-line summary alongside the per-item
 *  cards. */
export interface PlanCritiqueWorkflowResult extends WorkflowRunResult {
  readonly actualCostUsd: number;
  readonly preview: { kind: 'json'; data: CritiqueResult };
}

/** Factory returning the `WorkflowImpl` the AiPlane invokes. */
export function createPlanCritiqueImpl(deps: PlanCritiqueDeps): WorkflowImpl {
  const now = deps.now ?? (() => Date.now());
  const model = deps.model ?? PLAN_CRITIQUE_MODEL;

  return async function planCritiqueImpl(
    ctx: WorkflowExecutionContext,
  ): Promise<PlanCritiqueWorkflowResult> {
    const input = (ctx.input ?? null) as PlanCritiqueInput | null;
    if (!input || !input.snapshot || !input.visibility) {
      const result: CritiqueResult = {
        status: 'rejected',
        reason: 'PlanCritique requires { snapshot, visibility } in workflow input.',
      };
      return {
        proposedCommands: [],
        actualCostUsd: 0,
        preview: { kind: 'json', data: result },
      };
    }

    const userPrompt = buildCritiquePrompt(input.snapshot, input.visibility);
    const relayResp = await deps.relay.complete({
      model,
      system: PLAN_CRITIQUE_SYSTEM_PROMPT,
      user: userPrompt,
      maxTokens: PLAN_CRITIQUE_MAX_TOKENS,
    });

    const items = parseCritiqueItems(relayResp.text);

    // Enqueue one zero-command proposal per item. Each carries the
    // critique JSON so the queue UI can render a card + a "show in
    // plan" jump action (handled by the approval-queue store).
    // `runId` is set on every child action so the queue UI can group
    // all per-item cards under the same parent run without parsing
    // the `id` string.
    let seq = 0;
    for (const item of items) {
      const action: AiPendingAction = {
        id: `${ctx.runId}-item-${(++seq).toString(36)}`,
        runId: ctx.runId,
        workflow: planCritiqueDescriptor.kind,
        proposedCommands: [], // diagnostic-only per spec line 379
        estimatedCostUsd: 0,  // per-item action carries no incremental cost
        preview: { kind: 'json', data: item },
        createdAt: now(),
        status: 'pending',
      };
      deps.approvalQueue.enqueue(action);
      deps.onItemEnqueued?.(action, item);
    }

    const result: CritiqueResult = {
      status: 'ok',
      itemCount: items.length,
      items,
    };

    return {
      proposedCommands: [], // parent action also zero-command
      actualCostUsd: relayResp.costUsd,
      preview: { kind: 'json', data: result },
    };
  };
}
