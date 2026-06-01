# SPEC-28 — AI Cost Model & Budget Enforcement

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Architecture lead + Product |
| Closes | `GAP-REVIEW-2026-04-27.md §21.7 (SPEC-07 budgets empty), §29 #17` |
| Phases | 2D (proposal queue lit), 3A (full L7.5 promotion), 3D (cost enforcement at GA) |
| Replaces / extends | SPEC-07 §5 (cost guardrails table — concrete numbers live here) |

> SPEC-07 declared "per-actor / per-plugin / per-project budgets" without numbers. This SPEC fills the table — what the budgets are in dollars, how they tier with the plan, what enforcement happens when a budget is hit, and how cost is observed.

---

## §1 Cost units

PRYZM 2 normalises AI cost to **PRYZM Tokens (PTok)**, a unit derived from token count + model class:

| Model class | $ per 1k input PTok | $ per 1k output PTok |
|---|---|---|
| Anthropic Claude Sonnet (default) | $3.00 | $15.00 |
| Anthropic Claude Haiku (fast/cheap) | $0.25 | $1.25 |
| Anthropic Claude Opus (premium, manual select) | $15.00 | $75.00 |
| OpenAI GPT-4o (fallback) | $2.50 | $10.00 |
| Embeddings (text-embedding-3-large) | $0.13 / 1k tokens | n/a |
| Vision (image-input premium) | +$0.005 / image | n/a |

Numbers reflect public list pricing as of 2026-04. Reviewed quarterly.

---

## §2 Plan tiers (D2 budgets)

| Plan | Monthly project budget (USD) | Daily user budget (USD) | Per-call hard cap (USD) | Models |
|---|---|---|---|---|
| **Free** | $0.50 | $0.10 | $0.05 | Haiku only |
| **Personal** ($19/mo) | $5.00 | $1.00 | $0.25 | Haiku + Sonnet |
| **Team** ($49/mo per user) | $25.00 / project | $3.00 | $1.00 | Haiku + Sonnet |
| **Enterprise** | configurable | configurable | configurable (default $5) | All + Opus + custom-fine-tunes |
| **Self-host (BYO key)** | unlimited (BYO) | unlimited (BYO) | $25 default safety cap (configurable) | BYO models |

The plan tier multiplier is the primary lever; project-level overrides exist for enterprise.

---

## §3 Cost surfaces

| Surface | Typical PTok per call | Typical $ per call |
|---|---|---|
| `/api/ai/voice/parse` | 200 in + 50 out (Haiku) | $0.0001 |
| `/api/ai/ambient/analyse` | 800 in + 200 out (Haiku) | $0.0005 |
| `/api/ai/rooms/suggest-finishes` | 4k in + 1k out (Sonnet) | $0.027 |
| `/api/ai/rooms/generate-programme` | 8k in + 2k out (Sonnet) | $0.054 |
| `/api/ai/rooms/analyse-adjacency` | 4k in + 500 out (Sonnet) | $0.020 |
| AI plan-view critique (Phase 3A) | 12k in + 2k out (Sonnet) | $0.066 |
| AI generate-3-options (Phase 3A) | 20k in + 8k out (Sonnet) | $0.180 |
| PDF-to-BIM extraction (Phase 3+) | 50k in + 10k out (Sonnet + Vision) | $0.55 + image fees |
| AI batch (overnight) | varies | varies |

These are budget defaults; actual costs vary with project size + prompt evolution.

---

## §4 Budget enforcement — three levels

### §4.1 Soft warning (90% of any budget)
- Banner in UI: "You've used 90% of your AI budget for this month."
- Telemetry event `pryzm.ai.budget.warn` emitted.
- No call rejected.

### §4.2 Hard stop (100% of project or daily-user budget)
- New AI calls return `429 BUDGET_EXHAUSTED` with details.
- UI shows the budget breakdown + upgrade affordance.
- Telemetry event `pryzm.ai.budget.stop` emitted; on-call alert fires if >5% of paying users hit hard stop in any 24h window (signal of mispriced tier).

### §4.3 Cap on single call
- Pre-call estimate: token count input + max-output × model price.
- If estimate > per-call hard cap, call rejected pre-flight (no spend).
- This protects against runaway prompts.

---

## §5 Cost telemetry

### §5.1 Schema (`Supabase ai_usage`)
```sql
CREATE TABLE ai_usage (
  id            UUID PRIMARY KEY,
  project_id    ULID NOT NULL,
  actor_id      ULID NOT NULL,
  actor_kind    TEXT NOT NULL,         -- 'user' | 'ai' | 'plugin'
  surface       TEXT NOT NULL,         -- '/api/ai/...'
  model         TEXT NOT NULL,
  prompt_sha    TEXT NOT NULL,         -- per SPEC-07
  input_tokens  INT NOT NULL,
  output_tokens INT NOT NULL,
  cost_usd      NUMERIC(10,6) NOT NULL,
  duration_ms   INT NOT NULL,
  status        TEXT NOT NULL,         -- 'ok' | 'budget_stop' | 'cap' | 'error'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_usage_project_month ON ai_usage (project_id, date_trunc('month', created_at));
```

### §5.2 Aggregation views
- `v_ai_cost_per_project_month` — for billing UI.
- `v_ai_cost_per_user_day` — for daily-user budget.
- `v_ai_cost_per_workspace_quarter` — for sales / capacity planning.

### §5.3 Honeycomb metric
- `pryzm.ai.cost.usd` — sum, p95, by `surface` and `plan`.
- `pryzm.ai.budget.utilisation` — gauge in [0..1.2] per project_id.

### §5.4 Per-`.pryzm` archive
- `ai/usage.jsonl` (per SPEC-26 §2) carries the full cost trail for audit + offline cost analysis.

---

## §6 Pre-call budget check (the algorithm)

```
on /api/ai/* request from actor in project:
  1. fetch project tier + project_budget_used_this_month
  2. fetch actor daily_user_budget_used_today
  3. estimate_cost = estimate(prompt, model, max_output)
  4. if estimate_cost > per_call_cap[tier]: reject CAP
  5. if project_budget_used + estimate_cost > project_budget[tier]: reject BUDGET_PROJECT
  6. if user_budget_used + estimate_cost > daily_user_budget[tier]: reject BUDGET_USER
  7. accept; create row in ai_usage with status='pending'
  8. call model
  9. on response: update ai_usage with actuals
  10. on response: emit Honeycomb metric
```

Pre-call check (1–6) target latency: < 30 ms (Postgres single-row reads + cache).

---

## §7 Approval queue cost (per SPEC-07 §3)

When AI proposes (e.g. "rename 5 walls" or "rotate this room") and human approves:
- The cost of the **proposal generation** is counted at the time of generation (preview cost).
- If the human rejects, no further cost.
- If the human approves, **no additional cost** unless the approval re-runs the model (rare; flagged in SPEC-07 §3.5).
- Proposals expire after 7 days; expired proposals are archived to `ai/proposals/expired/` in next `.pryzm` save.

---

## §8 Cost optimisation levers (built-in)

| Lever | Default | Effect |
|---|---|---|
| Default model | Haiku for simple, Sonnet for complex (heuristic per surface) | reduces blended cost ~3–5× vs always-Sonnet |
| Prompt caching | Enabled (Anthropic prompt cache) | reduces input cost ~50% on repeat surfaces |
| Embedding-then-retrieve | Enabled for context > 50k tokens | reduces input cost ~70% on big-context calls |
| Output token cap | Enforced per surface | prevents runaway responses |
| Streaming | Enabled by default | better UX, no cost change |

---

## §9 Customer-facing UI

- **Project Settings → AI Budget** shows: monthly budget, used, projected, breakdown by surface, breakdown by user.
- **User Profile → AI Usage** shows: daily budget, used, last 30 days history.
- **Workspace Admin → AI Spend** shows: per-project spend, top users, top surfaces, alerts.
- **Hard-stop modal** is unmissable, with the upgrade path one click away.

---

## §10 Anti-patterns this SPEC forbids

- **No "BYO API key" path on the SaaS plans.** Free/Personal/Team use PRYZM-managed keys with budget enforcement. Self-host only for BYO.
- **No spend without a row in `ai_usage`.** A bug that bypasses the table → P0 incident.
- **No prompt that exceeds per-call cap silently.** Pre-call estimate is mandatory.
- **No "free tier with hidden budget."** Free tier budget is documented and enforced.

---

## §11 Phase rollout

| Sprint | Deliverable |
|---|---|
| S33 (Phase 2A) | `ai_usage` table + pre-call estimator + soft warning at 90%. |
| S38 | per-call cap enforced; daily-user budget enforced. |
| S43 (Phase 2D) | per-project budget enforced; UI surfaces shipped. |
| S49 (Phase 3A) | full L7.5 promotion; cost telemetry → Honeycomb live. |
| S55 (Phase 3B) | embedding-then-retrieve enabled by default for big-context surfaces. |
| S65 (Phase 3C) | Workspace Admin AI Spend view shipped. |
| S70 | self-host BYO-key safety cap enforced. |
| S72 (M36 GA) | all surfaces metered; cost dashboard public to admins. |

---

## §12 Cross-references
- ADR-014 AI L7.5 operational (the operational model).
- ADR-018 cut list — T3.1 reduces L7.5 to "critic-only" if velocity slips, which mostly preserves cost model.
- SPEC-07 AI Layer (approval queue, model pinning).
- SPEC-08 §4 plan-tier alignment.
- SPEC-10 observability (cost metric).
- SPEC-26 file format `ai/usage.jsonl`.
- Phase docs: PHASE-2A §3.5 AI scope; PHASE-3A §2 L7.5.
