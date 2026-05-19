# SPEC-47 — Generate-3-Options Workflow

**Status**: Active (S52 D1 — landed).
**Cross-refs**: SPEC-28 (Cost Meter), SPEC-46 (Plan Critique Workflow), [strategic ADR-014] (AI plane at L7.5), `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md` §S52 (lines 407-462).

## §1 — Goals

The Generate-3-Options workflow is the first **generative** L7.5 surface. It is the moment AI moves from advisor (PlanCritique) to **co-author**. The user selects a region of a plan view and asks for three architectural arrangements; the workflow fans out three parallel LLM calls — one for each style axis (Minimal / Efficient / Generous) — and surfaces each as a separate pending action in the approval queue. The user picks one (or none) to commit through the command bus.

This spec pins the cost model (with refund-on-overshoot), the per-option enqueue contract, the JSON-only response schema, and the OTel telemetry namespace. The workflow descriptor + impl ship in `@pryzm/ai-host/workflows/Generate3Options.{ts,Types.ts}`.

## §2 — Cost model

| Field | Value | Source |
|---|---|---|
| `descriptor.estimatedCostUsd` | $0.15 | three $0.05 fan-out calls + orchestration headroom |
| Per-call ceiling (registry-enforced) | $0.18 | SPEC-28 §3 |
| Per-fan-out call budget (soft) | $0.05 | spec line 433 |
| Post-call hard ceiling | $0.18 | spec line 444 |
| Default model | `claude-haiku-4-5-20251014` | matches the live server log |
| Default `max_tokens` per option | 1200 | option payloads only carry summary + commands |

**Refund-on-overshoot.** If the sum of the three fan-out call costs exceeds the post-call hard ceiling ($0.18), the workflow calls `costMeter.refund(projectId, totalCostUsd)` (S52 addition to `@pryzm/ai-cost`). The per-project monthly accumulator is decremented by `min(totalCostUsd, monthlyUSD)` so the running total never goes negative; a separate monotonic counter `pryzm.ai.cost.refund.usd` is emitted with `pryzm.ai.refund=true` so the AI Spend dashboard (S55) can compute net spend = gross − refunds without breaking OTel's monotonic-counter contract.

The parent action is rejected with `{status: 'rejected', reason: 'Fan-out cost $X.XX exceeded per-call ceiling $0.18 — refunded.', refundedUsd}` and **zero per-option actions** are enqueued. The user keeps their budget intact.

## §3 — Option-commands schema

Each fan-out call emits a JSON object of the shape:

```json
{
  "summary": "string, max 80 chars",
  "commands": [
    { "command": "string", "payload": object }
  ]
}
```

`parseOption(text, style, costUsd)` is **loud-fail-soft**:

- Non-JSON text → `null` (option dropped, telemetry tags `pryzm.ai.option.parseError=true`).
- Valid JSON object with malformed `commands` → option with `commands: []`.
- `commands` array length is capped at 20 entries (matches the system-prompt cap).

The `command` strings are dispatched verbatim through the editor's command bus when the user approves the per-option action. The command bus is the validation boundary — invalid command names trigger normal command-bus failure handling (loud, not silent).

## §4 — Approval-queue contract

Per spec lines 453-462, **one workflow run produces N+1 actions**:

- **N = 1 parent action**: id `${runId}`, `proposedCommands: []`, `preview.kind: 'json'` carrying the `Generate3Result` summary (`status: 'ok' | 'rejected'`, `totalCostUsd`, `options[]` or `reason` + `refundedUsd`). The plane's `submit()` returns this action.
- **N = 0..3 per-option actions**: id `${runId}-opt-${seq}`, `proposedCommands: <option commands>`, `preview.kind: 'image'` carrying the rendered thumbnail URL. Enqueued by the impl directly via `approvalQueue.enqueue(...)`. The user picks one, none, or all three to commit independently.

Approving an option fires its commands through the command bus. Rejecting all three is the no-op default (the parent action serves as the audit row — its status remains `pending` until manually dismissed).

## §5 — Telemetry

All Generate-3-Options spans use the `pryzm.ai.workflow` namespace, attribute `pryzm.ai.workflow.id=generate-3-options`. Per-fan-out calls emit:

| Metric | Type | Notes |
|---|---|---|
| `pryzm.ai.cost.usd` | counter | gross spend, INCLUDES the overshoot |
| `pryzm.ai.cost.refund.usd` | counter | refunded spend; net spend = gross − refunds |
| `pryzm.ai.cost.usd.per_call` | histogram | per-fan-out call cost |
| `pryzm.ai.option.parseError` | counter (attribute) | malformed JSON drops |
| `pryzm.ai.option.style` | attribute | per-option span carries `'minimal' | 'efficient' | 'generous'` |

The parent span carries the total fan-out cost in `actualCostUsd` (or `0` on refund); the plane's `recordCall` writes one `ai_usage` row per spec SPEC-28 §5.1.

## §6 — Cross-refs

- **SPEC-28** — cost meter, per-call ceiling, monthly budget. Refund method is the S52 addition; see CostMeter.refund().
- **SPEC-46** — Plan Critique Workflow. Same factory pattern; PlanCritique is `kind: 'rules'` (zero-command), Generate-3-Options is `kind: 'generative'` (commands flow through bus on approval).
- **[strategic ADR-014]** — generative workflows DO mutate state on approval. Generate-3-Options is the first generative workflow; the contract is exercised end-to-end.
- **PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md §S52** — landing sprint.
- **PHASE-3A-Q1-M25-M27-VI-AI-ELEMENT-CREATOR.md** — companion track ships the constraint solver (SPEC-48) used by the sketcher's downstream construction-geometry tools.

## §7 — Deferred items

- **CF Worker relay adapter**: the `RelayPorter` contract (SPEC-46 §3) is live since S51, the CF Worker URL is reachable, but the adapter binding ships at S53 (build/ops concern). Until then `MockAnthropicRelay` returns deterministic JSON for fan-out calls — adequate for the pipeline's per-option enqueue + refund tests.
- **Real bake-worker thumbnail render**: ships at S52 D2; until then the `defaultRenderPreview` returns a `data:` placeholder URL so the approval-queue UI always has something to render.
