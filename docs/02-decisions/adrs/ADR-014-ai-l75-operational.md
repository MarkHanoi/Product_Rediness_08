# ADR-014 — AI L7.5 Operational Semantics

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `CONFLICT-ANALYSIS.md §6.4` |
| Required by | Sprint S30 (Phase 2A close — AI host hardened before public AI workflows) |
| Owner | Architecture lead |
| Spec dependency | `specs/SPEC-07-AI-LAYER.md` |

---

## Context

`08-VISION` and `09-AS-IS §L7.5` establish AI as a first-class architectural layer shipping from day 1, but do not specify:

- Approval queue interaction with CRDT ordering (race conditions when concurrent edits invalidate a pending proposal).
- Prompt and model-version pinning for reproducibility / audit.
- Per-actor / per-project / per-plugin cost guardrails.
- Headless AI access for `@pryzm/headless` (cannot embed LLM keys).
- Boundaries-lint rule: may L7.5 import L4 directly, or only via L2?

Without these, the L7.5 surface is conceptually correct but operationally undefined.

---

## Decision

Adopt SPEC-07 in full:

1. **Approval queue + CRDT** (SPEC-07 §4): proposals acquire `ai-batch` soft locks (SPEC-03 §4.6); concurrent edits supersede pending proposals; commits are atomic single-Y.Doc-transaction batches.

2. **Pinning** (SPEC-07 §5): every committed AI event records `plugin_id`, `plugin_version`, `model@version`, `prompt_sha`, `temperature`. Old proposals retain pinned identifiers even after model deprecation.

3. **Cost guardrails** (SPEC-07 §6): per-actor, per-plugin, per-project budgets; warning at 80%, hard stop at 100%.

4. **Headless** (SPEC-07 §7): `@pryzm/headless` invokes plugins via PRYZM-hosted AI proxy with PRYZM API key; auto-approval limited to read-only surfaces (Inspector, Critic). Generator/Modifier require human approval unless enterprise feature `ai_headless_autoapproval` is enabled per project.

5. **Boundaries lint** (SPEC-07 §9): L7.5 may import L0–L4 (read), L2 (commands), L3 (awareness), L6 (UI surface). L7.5 may NOT import L5 (renderer) or L7 (presentation directly). UI is provided by the plugin host as sandboxed iframe / panel.

---

## Consequences

**Positive:**
- Reproducible AI: same project state + same prompt SHA + same model + temperature 0 produces same proposal (within model determinism).
- Bounded cost: no runaway billing.
- Headless integration without secret leakage.
- Lint-enforceable layer boundary.

**Negative:**
- Approval queue UX adds friction (intentional — it's the trust gate).
- Model deprecation requires a fallback in every plugin manifest.
- Per-tenant cost accounting requires a billing-side join with usage data.

---

## Alternatives considered

### A1 — Auto-apply AI commands, surface a "Revert AI changes" button
Rejected: violates trust. The point of D2 (AI as first-class) is *responsible* AI integration, not auto-pilot.

### A2 — Single global cost budget per organisation
Rejected: large organisations need per-project quotas to prevent one team draining the budget.

### A3 — Embed LLM keys in headless package
Rejected: keys would leak; PRYZM proxy is the correct gate.

### A4 — Allow L7.5 to import L7 for richer UI
Rejected: defeats sandboxing; AI plugin must not be able to inject DOM directly.

---

## Phase rollout
- S04 — AI host scaffolded; manifest schema validated; sandboxing live.
- S08 — first first-party AI plugin (Inspector kind only).
- S20 — approval queue UI lives.
- S30 — Generator/Modifier go live; cost guardrails enforced.
- S48 (M24 beta) — multi-user AI: AI proposals interact with concurrent edits per §1.
- S64 (M33) — public AI API at `api.pryzm.com/v1/ai/`.
- S72 (M36 GA) — three first-party plugins shipped; one marketplace partner.
