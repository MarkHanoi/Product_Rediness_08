# SPEC-46 — Plan Critique Workflow

**Status**: Accepted (S51, 2026-04-28)
**Companions**: SPEC-28 (AI cost telemetry), SPEC-07 (visibility-state contract), [strategic ADR-014] (L7.5 AI host)
**Phase doc**: `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md` §S51 (lines 322-403)

---

## §0 Numbering note

This SPEC is the per-workflow companion to SPEC-28 §3 (the AI plane's cost-and-budget contract). It picks up SPEC-46 because:

| # | File | Status |
|---|---|---|
| SPEC-44 | (reserved — visibility-intent finalisation, Phase 3A) | reserved |
| **SPEC-45** | `SPEC-45-PDF-TO-BIM-PIPELINE.md` | published S50 |
| **SPEC-46** | `SPEC-46-PLAN-CRITIQUE-WORKFLOW.md` | **this document** |

The phase doc itself does not pre-number per-workflow SPECs; this document publishes as SPEC-46 to keep the contract searchable by anyone reading SPEC-28 § 3 cross-references.

---

## §1 Goals

The plan-critique workflow is the AI plane's **first user-visible workflow**. It surfaces the AI-as-design-partner moat: a user clicks "Critique this plan", the AI examines the plan, and the approval queue fills with diagnostic items the user can review one by one.

**In scope (S51):**
- One workflow descriptor (`plan-critique`) registered with `AiPlane.workflowRegistry`.
- One `WorkflowImpl` (`createPlanCritiqueImpl`) that snapshots the plan, calls the relay, parses critique items, and enqueues one zero-command pending action per item.
- Mock relay (`MockAnthropicRelay`) so dev + tests run without the CF Worker.

**Out of scope (deferred):**
- Generate-3-options "fix" workflow — S52 D1-D3 per phase doc §S52 lines 407-450.
- Voice command surface for "critique this plan" — S52 D4-D6.
- Cost-guardrail AI Spend dashboard — S52 D9 verification.
- Real CF Worker relay binding — S52 D3 (the porter is in code today; the adapter is gated on `ANTHROPIC_RELAY_URL`).
- Critique-item severity-aware UI grouping — S53 alongside the public AI API.

---

## §2 Prompt schema

The system prompt (`PLAN_CRITIQUE_SYSTEM_PROMPT` in `packages/ai-host/src/workflows/PlanCritique.ts`) instructs the LLM to:

1. Examine the supplied snapshot + visibility state.
2. Surface every plausible issue (the exit-criteria target is "≥ 3 items per plan average").
3. Emit a **JSON array only** — no markdown fences, no preamble.
4. Cap the response at `PLAN_CRITIQUE_MAX_ITEMS = 20`.

The user prompt is a JSON-serialised `PlanViewSnapshot` + `VisibilityState` (built by `buildCritiquePrompt`). The editor captures the snapshot client-side and ships it through `AiPlane.submit({ workflow: 'plan-critique', input: { snapshot, visibility } })`. The plane never reaches back into the L7 scene graph.

**Why a JSON array only**: the parser (`parseCritiqueItems`) is a loud-fail-soft per SPEC-28 §10 — anything not parseable as a JSON array of well-formed items is dropped with a `console.warn`. No partial-result heroics.

---

## §3 Critique-item schema

```ts
type CritiqueItem = {
  id: string;
  severity: 'info' | 'warning' | 'error';
  category: string;            // 'door-clearance' | 'corridor-width' | 'egress' | 'visibility' | 'structural' | (free-form)
  message: string;
  locationRef:
    | { kind: 'element'; elementId: string }
    | { kind: 'point'; x: number; y: number };
  confidence: number;          // [0, 1]
};
```

`locationRef` powers the "show in plan" jump action (phase doc line 389) — the editor's approval-queue card binds it to a viewport-pan/zoom command.

Categories are **free-form** so plugins (Phase 3B) can introduce their own (e.g. `'fire-egress'`, `'acoustics'`) without a SPEC-46 amendment. The prompt seeds five canonical categories the model SHOULD use when applicable.

---

## §4 Approval-queue contract

For one workflow run, the queue receives `1 + N` actions in this order:

1. **N per-item actions** — each carries one critique item in `preview.kind = 'json'`. `proposedCommands: []`. `estimatedCostUsd: 0`. Status `'pending'`. ID format: `{runId}-item-{base36-seq}`.
2. **1 parent action** — carries the `CritiqueResult` summary in `preview.kind = 'json'`. `proposedCommands: []`. `estimatedCostUsd: <relay actual>`. Status `'pending'`. ID format: `{runId}-pending`.

The approval-queue UI groups the parent + per-item actions by sharing a `runId` prefix. Approving the parent is a no-op (this is a diagnostic workflow — phase doc line 379); approving a per-item action calls the editor's "show in plan" jumper with that item's `locationRef`.

**Rejection path**: if `costMeter.preCheckBudget` rejects the run, the plane enqueues only the parent action with `status: 'rejected'`. The impl never runs and zero per-item actions are produced.

---

## §5 Cost model

| Surface | Value | Source |
|---|---|---|
| Descriptor `estimatedCostUsd` | $0.05 | phase doc line 343 |
| Per-call ceiling (registry) | $0.18 | SPEC-28 §3 |
| Per-call exit criterion (measured) | ≤ $0.06 | phase doc line 402 |
| Mock relay quoted cost | $0.0042 | `AnthropicRelay.ts` (deterministic) |

The plane records the actual cost from `RelayResponse.costUsd` (the relay derives it from the model + token counts via SPEC-28 §3.2 pricing). The mock quote is intentionally well under the descriptor estimate so cost-meter tests can assert exact numbers.

---

## §6 Telemetry

The AiBus emits these events with `otelPrefix = 'pryzm.ai'` (per S49):

- `pryzm.ai.workflow.start` — `attributes.workflow = 'plan-critique'`.
- `pryzm.ai.workflow.propose` — `attributes.actionId`, `attributes.latencyMs`, `attributes.costUsd`.
- `pryzm.ai.workflow.reject` — `attributes.reason`, `attributes.estimatedCostUsd`.
- `pryzm.ai.workflow.error` — `attributes.error`.

Per-call cost is recorded into `pryzm.ai.cost.usd` (counter) + `pryzm.ai.cost.usd.per_call` (histogram) by `CostMeter.recordCall` after every successful run. The descriptor's `surface` attribute (`'ai.plan.critique'`) tags each row in the `ai_usage` table.

---

## §7 Cross-references

- **SPEC-28** §3 — per-call ceiling + monthly budget enforcement.
- **SPEC-28** §5.1 — `ai_usage` table schema.
- **SPEC-07** §3 — visibility-state contract (`VisibilityState` shape).
- **[strategic ADR-014]** — AI plane runs at L7.5 outside the renderer's idle budget.
- **PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE** §S51 — sprint scope + exit criteria.
- **SPEC-45** §6 — approval-queue gating (PDF-to-BIM uses the same queue contract).
- **packages/ai-host/src/workflows/PlanCritique.ts** — implementation.
- **packages/ai-host/src/AnthropicRelay.ts** — relay porter contract.
