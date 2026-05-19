# C09 — AI & Visibility Intent

> **Stamp**: 2026-05-02 · **Status**: CANONICAL  
> **Scope**: `packages/ai-host/` (L2), `packages/visibility/` (L1), AI plan critique, AI 3-options generation, cost governance, and the visibility intent system.  
> **Key principles**: P7 (visibility intent ≠ UI state).  
> **References**: [SPEC-46] AI plan critique, [SPEC-47] AI 3-options generation, [SPEC-07] AI as a first-class layer.

---

## §1 — AI as a First-Class Layer (Differentiator D5)

AI in PRYZM is not a bolt-on feature. It is a first-class L2 domain package (`packages/ai-host/`) that:
- Reads from stores (via subscriptions, never direct writes).
- Expresses intent through the command bus (dispatches commands with `source: 'ai'`).
- Operates within the same CQRS flow as every other mutation path.
- Has its costs tracked per-project in `ai_usage` rows.

AI MUST NOT call `window.*`, mutate stores directly, or bypass the command bus.

---

## §2 — AI Host (L2)

`packages/ai-host/` orchestrates AI workflows. It owns:

- The Anthropic model client (relay via `CF_WORKER_URL` or direct `ANTHROPIC_API_KEY`).
- The prompt templates for plan critique, 3-options generation, and query workflows.
- The cost accounting integration (`packages/ai-cost/`).
- The AI workflow state machine (idle → running → complete / failed).

### §2.1 — Model identity

The active model id is `ANTHROPIC_MODEL_ID` (env var; default: `claude-haiku-4-5`). All server-side AI calls MUST use this constant. It MUST NOT be hardcoded at call sites.

### §2.2 — AI upstream routing

```
Browser → /api/anthropic/v1/messages (Express + authMiddleware + aiLimiter)
  → CF_WORKER_URL (if set)  — preferred; holds the Anthropic key as a Cloudflare secret
  → api.anthropic.com        — fallback when CF_WORKER_URL is not set and ANTHROPIC_API_KEY is set
  → 503 error                — if neither is configured
```

The browser MUST NOT call `api.anthropic.com` directly. All AI requests flow through the Express `/api/anthropic/*` proxy, which enforces auth, rate limits, and quota.

### §2.3 — AI quota enforcement

`enforceAIQuota(userId, tokens)` in `server/planStore.js` MUST be called before any AI call. If the user has exceeded their plan quota, the call MUST be rejected with HTTP 429 and a user-visible quota message. Quota counters reset monthly.

---

## §3 — AI Workflows

### §3.1 — Plan Critique (SPEC-46)

- Input: the current `ElementStore` snapshot (serialised via `packages/file-format/`).
- Output: an array of `CritiqueItem { severity, element_ids, message, suggestion }`.
- Latency SLA: < 8 s end-to-end (NFT 14).
- Results MUST be surfaced as a read-only panel (no automatic mutations).

### §3.2 — 3-Options Generation (SPEC-47)

- Input: a natural-language prompt + the current floor plan geometry.
- Output: three distinct `PryzmProject` snapshots (not full projects — floor plan elements only).
- The user selects one option; selection dispatches a `source: 'ai'` command to replace the current layout.
- Generated layouts MUST be validated against `packages/schemas/` before dispatch.

### §3.3 — AI Query

- Input: a natural-language question about the current model.
- Output: a text answer with optional element IDs highlighted.
- MUST NOT mutate any store.

---

## §4 — Visibility Intent System (P7)

### §4.1 — Core principle

**ALL visibility is derived from intent, not per-view configuration.** A Visibility Intent is a declarative template that governs the graphical representation of every element type across every view state. Views consume intents; they do not define style.

### §4.2 — Ownership

`packages/visibility/` (L1) owns the intent model. It is a **domain concept**, not a UI concern. Plugins and AI MUST express visibility changes as intent deltas dispatched via the command bus — never by setting UI state directly.

**CI gate**: `packages/visibility/__tests__/intent-not-ui.test.ts` (hard-fail, P7).

### §4.3 — Rendering equation

```
FinalElementAppearance =
    VisibilityIntentRules        — master template (intent)
  + ViewGeometryLens             — cut plane, beyond, hidden, projection
  + ElementStateRules            — selected, hovered, isolated
  + LocalViewOverrides           — per-view ad-hoc overrides (lowest precedence)
```

Each layer is evaluated in strict precedence order. Local overrides win over intent rules but MUST NOT mutate the master intent.

### §4.4 — Intent lifecycle

1. A plugin or AI workflow creates an `IntentProposal` and dispatches `ApplyVisibilityIntentCommand`.
2. The command handler in `packages/visibility/` validates the proposal, merges it into `VisibilityStore`.
3. The scene committer picks up the delta and updates the THREE material parameters.
4. The change is recorded in the command log (undo-able).

### §4.5 — Visibility intent vs. view templates

Visibility intents replace Revit-style view templates. A view MUST NOT have its own stored material overrides. Override state is always computed from the intent + view lens + element state.

---

## §5 — AI Cost Governance

`packages/ai-cost/` (L1) tracks per-call token usage and aggregates cost by project and workflow type. It:
- Records every AI call to `ai_usage` rows.
- Exposes `/api/ai/spend/summary` for the admin dashboard.
- MUST enforce `enforceAIQuota` before each call (§2.3).
- MAY block calls that would exceed a per-project monthly budget ceiling (configurable by the project owner).
