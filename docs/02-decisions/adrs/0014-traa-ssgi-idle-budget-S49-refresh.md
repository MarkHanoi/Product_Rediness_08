# ADR 0014 (refresh, sprint-scoped) — TRAA + SSGI Idle Budget for the AI Plane

| Field | Value |
|---|---|
| Status | **Accepted (sprint-scoped refresh)** — 2026-04-28 |
| Sprint | S49 (Phase 3A) |
| Refreshes | `docs/02-decisions/adrs/0014-traa-ssgi-idle-budget.md` (original 2025-12) |
| Cross-refs | `[strategic ADR-014]` (AI L7.5 operational); `[strategic ADR-018]` (capacity-cut Tier-1 checkpoint) |
| Owner | Architecture lead |

---

## Why a refresh?

S49 promotes the lazy AI host from S47 to a **first-class L7.5 plane**
(`packages/ai-host/src/AiPlane.ts`). The plane has its own message bus
(`AiBus`) which dispatches events synchronously. The original 0014 ADR
budgeted the renderer's idle frames (TRAA + SSGI accumulation) at
≤ 4 ms per frame; the AI plane was at the time a stub and did not
register against the budget.

This refresh confirms the contract still holds with the AI plane lit:

1. The AI plane runs entirely **outside** the renderer's `requestAnimationFrame`
   loop. `AiBus.emit` is synchronous but is invoked from worker
   message handlers, fetch callbacks, and approval-queue UI events —
   never from the per-frame render hook.
2. The cost meter writes (`recordCall`) are async + I/O bound. They
   happen after the AI worker returns, on the network stack — outside
   the idle frame budget.
3. OTel span creation in `AiBus` uses the cached tracer pattern from
   `tracing.ts`; allocation footprint per emit is one short-lived
   span object. Measured at S49 D8 in `apps/bench/src/benches/ai-cost.bench.ts`
   — preCheckBudget + recordCall together stay < 0.5 ms / call,
   well below the 4 ms idle frame budget.

## Decision

The TRAA + SSGI idle budget remains **4 ms / frame** for the renderer.
The AI plane is **not** charged against the renderer's idle frame
budget because it runs on a separate execution context (worker
messages, network responses, UI input). Tracing for AI plane events
uses the dedicated OTel prefix `pryzm.ai.*` so the renderer's
`pryzm.render.*` SLOs remain isolated.

## Consequences

**Positive:**
- The renderer's idle CPU SLO survives the L7.5 promotion.
- A single dashboard panel can split AI cost (`pryzm.ai.cost.usd`)
  from render frame time (`pryzm.render.frame.ms`) without
  cross-talk.
- The capacity-cut Tier-1 checkpoint (`[strategic ADR-018]` T1.7)
  passes — AI promotion does not blow past idle budget.

**Negative:**
- If a future AI workflow ever needs to emit on the AI bus from the
  per-frame render hook (unlikely — the only known case would be a
  speculative critic), this refresh must be revisited.

## References

- `docs/03-execution/plans/legacy/phases/PHASE-3/3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md` §S49
- `docs/03-execution/specs/SPEC-07-AI-LAYER.md` §3
- `docs/03-execution/specs/SPEC-28-AI-COST-MODEL.md` §5
- `docs/02-decisions/adrs/ADR-014-ai-l75-operational.md`
- `docs/02-decisions/adrs/ADR-018-capacity-cut-list.md` Tier-1 checkpoint
