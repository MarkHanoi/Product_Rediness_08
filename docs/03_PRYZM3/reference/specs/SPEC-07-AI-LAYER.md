# SPEC-07 — AI Layer (L7.5)

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Architecture lead |
| Closes | `CRITICAL-REVIEW-2026-04-27.md §B7` |
| Phases | 1A (host scaffold), 1A close (first plugin), 1D (approval queue), 2D (inline AI in collab), 3A (full L7.5 surface), 3C (public AI API, marketplace) |
| Required ADRs | ADR-014 (AI L7.5 operational semantics) |

> AI is the moat. This spec defines the L7.5 surface — how plugins read state, how they propose mutations, the approval queue, prompt/version pinning for reproducibility, cost guardrails, and headless AI access. The "Phase-4 gated" model from Contract 04 is dead (see CONFLICT-ANALYSIS §3.6).

---

## §1 What L7.5 is

A first-class architectural layer between L7 (Presentation) and L6 (Plugin Host). It exists for one reason: AI plugins need privileged read access to the entire event log and projection space, and they need a structured write path (the approval queue) that no other plugin gets.

```
L7   Presentation
L7.5 AI Operations    ←  this spec
L6   Plugin Host
L5   Frame Scheduler & Renderer
L4   Geometry Kernel
L3   Sync
L2   Command Bus
L1   Domain Stores
L0   Persistence
```

L7.5 imports allowed: L0 (read), L1 (read), L2 (commands via approval queue only), L3 (read awareness), L4 (read), L6 (UI surface). L7.5 may NOT touch THREE, the renderer, or the DOM directly.

---

## §2 The four AI surface kinds

| Kind | Reads | Writes | Examples |
|---|---|---|---|
| **Inspector** | event log, projections | nothing | "Why does this wall look weird?", "What's the U-value?", "Which rooms are below code area?" |
| **Generator** | event log, projections, inspirations | proposes commands via approval queue | "Generate a 4-bedroom layout from this plot", "Suggest stair configurations". |
| **Modifier** | event log, projections, selection | proposes commands via approval queue | "Make this wall structural", "Convert these to fire-rated". |
| **Critic** | event log, projections | annotations only (proposed); no L1 mutations | "These doors fail egress code", "Room A2 below daylight minimum". |

Inspector + Critic are read-only. Generator + Modifier go through the approval queue (§4).

---

## §3 Plugin model

### §3.1 Manifest
```json
{
  "id": "ai-floorplan-generator",
  "kind": "ai",
  "surface": ["generator","critic"],
  "version": "1.2.0",
  "permissions": {
    "read": ["events","projections","selection","awareness"],
    "write": ["proposals"],
    "models": ["claude-sonnet-4.5","gpt-5.0"]
  },
  "model_pinning": {
    "primary": "anthropic/claude-sonnet-4.5@2026-03-01",
    "fallback": "openai/gpt-5.0@2026-04-15"
  },
  "cost_budget_usd_per_run": 0.50,
  "min_pryzm_version": "2.0.0"
}
```

### §3.2 Lifecycle
- Loaded by L6 plugin host at boot or on-demand.
- Sandbox: Web Worker (browser) or Node Worker (server-side AI worker).
- Cannot import THREE, DOM, fetch, network — only the L7.5 SDK.
- Network access is mediated by the AI worker (`apps/ai-worker/`) which holds the actual API keys.

### §3.3 Entry points
```ts
export interface AIPlugin {
  inspect?(ctx: InspectContext): Promise<InspectResult>;
  generate?(ctx: GenerateContext): Promise<Proposal>;
  modify?(ctx: ModifyContext): Promise<Proposal>;
  critique?(ctx: CritiqueContext): Promise<Annotation[]>;
}
```

A `Proposal` is a list of PRYZM events the plugin would like to commit, plus rationale, plus expected diff.

---

## §4 The approval queue (closes B7 gap "approval queue + CRDT interaction")

### §4.1 Why
Auto-applying AI-generated commands violates trust. Every Generator/Modifier proposal queues for human approval before commit.

### §4.2 Model
```ts
type Proposal = {
  id: ProposalId;
  pluginId: PluginId;
  actorId: ActorId;          // the user who triggered the plugin
  events: PryzmEvent[];      // what would be committed
  rationale: string;         // human-readable explanation
  expectedDiff: DiffSummary; // elements created/modified/deleted; bbox
  cost: { promptTokens, completionTokens, modelId, usdEstimated };
  pinnedModelVersion: string; // for reproducibility
  createdAt: ISO8601;
  status: 'pending' | 'approved' | 'rejected' | 'superseded' | 'expired';
  ttl: number;               // seconds; default 600
};
```

### §4.3 Lifecycle
1. Plugin returns a `Proposal`.
2. Stored in the L1 `proposalStore`; broadcast via Yjs awareness with `status: 'ai-thinking'` → `'ai-proposal-ready'`.
3. UI surfaces a notification + inspector panel showing rationale + diff preview.
4. User approves: the proposal's events are appended to the event log via the L2 command bus, with `actor_kind='ai'`, `parent_ulid` chain showing the plugin and prompt.
5. User rejects: proposal moves to `rejected`; plugin is informed; events are NOT committed.
6. TTL expires without action: proposal moves to `expired`.

### §4.4 CRDT interaction
- A proposal **acquires** `ai-batch` soft locks (SPEC-03 §4.6) on every affected element when surfaced.
- If any lock is currently held by another user, the proposal moves to `pending` but cannot commit; UI shows "waiting for X to release lock".
- If a concurrent edit changes the underlying element while the proposal is pending, the proposal is marked `superseded`. The plugin can choose to re-run with fresh state (the plugin's job, not the queue's).
- On approval, the events are committed in a single Y.Doc transaction; partial failure rolls back the whole batch.

### §4.5 Diff preview
- Rendered as ghost geometry in the active view + side-panel diff list.
- Always shows: (n) created, (m) modified, (k) deleted, bounding-box overlay.
- Click to step through; per-element preview.

---

## §5 Prompt + version pinning (closes B7 gap "AI determinism + reproducibility")

### §5.1 What gets pinned
- The model identifier including version date: `anthropic/claude-sonnet-4.5@2026-03-01`.
- The system prompt SHA: `prompts/floorplan-generator/system.v1.4.md` → `sha256:abc...`.
- The few-shot examples set.
- Temperature, top_p, top_k.
- The plugin version itself.

### §5.2 Where it's recorded
On every committed AI event, the metadata column carries:
```json
{
  "actor_kind": "ai",
  "ai_metadata": {
    "plugin_id": "ai-floorplan-generator",
    "plugin_version": "1.2.0",
    "model": "anthropic/claude-sonnet-4.5@2026-03-01",
    "prompt_sha": "sha256:abc...",
    "temperature": 0.2,
    "proposal_id": "01HXYZ..."
  }
}
```

### §5.3 Reproducibility
- Re-running the same plugin on the same project state with the same prompt SHA + same model version + temperature 0 should produce the same proposal (within model determinism).
- Useful for debugging, regression tests, audit ("show me what the AI did 3 months ago").

### §5.4 Model deprecation handling
- When a model is sunset by the provider, plugins must declare a fallback in the manifest.
- The AI worker surfaces a warning to the user before invoking the fallback.
- Old proposals retain their pinned model identifier even when that model is no longer callable.

---

## §6 Cost guardrails (closes B7 gap "no cost guardrails")

### §6.1 Per-actor budget
| Tier | $/day | $/month | Hard stop |
|---|---|---|---|
| Free | 0.10 | 1.00 | hard |
| Solo | 1.00 | 25.00 | warn |
| Team (per seat) | 5.00 | 100.00 | warn |
| Enterprise | configurable | configurable | configurable |

### §6.2 Per-plugin run budget
- Manifest `cost_budget_usd_per_run` is enforced by the AI worker.
- If a single run exceeds budget, the worker aborts and surfaces a structured error.

### §6.3 Per-project budget
- Project owner sets `aiBudgetUsdPerMonth` on the project; default $50.
- All plugin runs against the project deduct from this budget.
- 80% threshold: warning to all editors. 100%: AI features paused for the project until next billing period or budget raise.

### §6.4 Accounting
- Recorded per event in the AI metadata.
- Surfaced in `/admin/billing` panel: cost by user, by plugin, by project.
- Per-call OTel spans (§8) include cost.

---

## §7 Headless AI access (closes B7 gap "headless AI cannot embed LLM keys")

### §7.1 Scenario
`@pryzm/headless` runs in user environments (CI, scripts). It cannot embed Anthropic / OpenAI keys.

### §7.2 Solution
- Headless makes plugin invocations via the **PRYZM-hosted AI proxy** (`api.pryzm.com/v1/ai/invoke`) using a PRYZM API key.
- The proxy authenticates the API key, checks the project's AI budget, invokes the appropriate AI worker, returns the proposal.
- Headless can choose to auto-approve the proposal (the proxy enforces that auto-approval is only allowed for plugins with `surface: ['inspector','critic']`; Generator/Modifier require human approval, even in headless).
- Auto-approval for Generator/Modifier requires a special enterprise feature `ai_headless_autoapproval` and must be opted into per project.

### §7.3 Self-hosted users
For on-prem deployments (D7 enterprise variant), the AI worker can be configured with the customer's own Anthropic/OpenAI keys; the proxy lives in the customer's VPC.

---

## §8 OpenTelemetry instrumentation
- `ai.plugin.invoke` — input `(pluginId, version, surface)`; output `(proposalId, eventCount, durationMs, costUsd)`.
- `ai.proposal.created` — output `(proposalId, eventCount, ttl)`.
- `ai.proposal.approved` — input `(proposalId, actorId)`; output `(eventsCommitted, durationMs)`.
- `ai.proposal.rejected` — input `(proposalId, reason)`.
- `ai.proposal.superseded` — input `(proposalId, conflictingActorId)`.
- `ai.lock.acquire` — input `(proposalId, elementCount)`; output `(acquired, blockedBy)`.
- `ai.cost.exceeded` — input `(scope, budget, actual)`.

---

## §9 Boundaries lint rule for L7.5

- L7.5 may import from L0–L4, L6, awareness reads from L3.
- L7.5 may NOT import from L5 (renderer) or L7 (presentation). UI surface for L7.5 is provided by the plugin host as a sandboxed iframe / panel.
- L7.5 plugins live under `plugins/ai-*/`; lint enforces the import surface.

---

## §10 What v1 (M36 GA) ships

- AI host + AI worker.
- Approval queue UI.
- 3 first-party AI plugins:
  - **AI-FloorPlan-Generator**: 4-bedroom layout from a plot.
  - **AI-Code-Critic**: room areas, egress paths, daylight.
  - **AI-Schedule-Helper**: schedule grouping and quantity rollups.
- Public AI API at `api.pryzm.com/v1/ai/`.
- Cost dashboard.
- One marketplace AI plugin slot reserved (third-party launch partner).

### §10.1 What v1 does NOT ship
- AI-driven structural analysis.
- AI-driven MEP routing.
- Voice / spatial-audio interface.
- Multi-modal photo-to-BIM (Phase 3+ depending on capacity).

---

## §11 Cross-references
- Layer placement: `08-VISION §4` (L7.5).
- Conflict mapping: `CONFLICT-ANALYSIS.md §3.6`.
- Phase deliverables: `phases/PHASE-1A` (host), `phases/PHASE-1D` (approval queue UI), `phases/PHASE-3-COMPLETION-GA-M25-M36.md` §2 (3A AI), §4 (3C public API).
- ADR: `adrs/ADR-014-ai-l75-operational.md`.
- Sync interaction: SPEC-03 §4.6 (ai-batch lock).
- Cost / security: SPEC-08 §6 (rate limiting + budgets).
