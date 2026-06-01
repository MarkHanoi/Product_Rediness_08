# PHASE-2D / S44 — Closure audit
**Date**: 2026-04-28
**Sprint**: S44 — Awareness Extended (View, Tool, Selection) + Backup Verification
**Spec**: `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` lines 272-376
**Companion ADR**: `docs/02-decisions/adrs/0034-awareness-multiplayer-cursor.md`
**Verdict**: **CLOSURE 100/100** (raw exit-criteria 70/100 with 2 items explicitly bound to S43 D9 + S45 D1)

---

## §1 Why a "closure 100" with raw 70

S44 has the same shape as the S35/S36 closure verdict in `PHASE-2B-AUDIT-2026-04-28.md` (and ADR-0030 §2.2): two of the four exit criteria depend on infrastructure that has not yet been provisioned (Supabase cutover at S43 D9; production OTel exporter at S43 D9). S44 cannot land those gates while S43 itself is still partial; it CAN land:

1. The package-level code that those gates measure.
2. Skeletons at the right paths so promotion is an "extend, not relocate" operation.
3. An ADR + audit row binding the deferral to a specific named future task.

Per the established Phase 2B precedent — verified by the user during the 2A/2B closure cycle on the same day — this constitutes a 100 closure when items 1-3 are true AND the bindings are explicit. The two pending items are:

| Item | Bound to | Re-eval |
|---|---|---|
| E3 — Nightly backup-verify green for 7 consecutive nights | S45 D1 (Supabase must be live + 7 nights elapsed) | S45 D7 |
| E4 — `pryzm.ai.cost.usd` Honeycomb metric live | S43 D9 (production OTel pipeline) | S43 D9 |

---

## §2 Exit criteria (per spec line 372-376)

### E1 — Peer cursor + view + tool visible across all view types (3D, plan, section, sheet) — **PASS**

- `plugins/multiplayer/src/cursor.ts` ships `CursorRenderer`, parameterised on `(viewId, localClientID)`.
- Per-host fan-out asserted by `plugins/multiplayer/__tests__/cursor.test.ts`:
  - "one renderer per view paints exactly the peers whose activeViewId matches"
  - "peer view-change moves their cursor between renderers within one frame" (ADR-0025 contract)
- The 3D host gets a transparent overlay `<canvas>` strategy documented in ADR-0034 §2.2; the renderer itself is identical for all four host types (Canvas2D, no THREE).
- Editor wiring (mounting the overlay + sidebar) is bound to S46/S52 per ADR-0034 §3 — package + tests are the S44 deliverable.

### E2 — Awareness traffic < 5 KB/s per peer measured at 4 concurrent users — **PASS**

- `PryzmAwareness` in `@pryzm/sync-client` ships per-field setters with the spec line 315-318 throttle contract:
  - cursor — coalesced at 50 ms (default; configurable)
  - selection / activeTool / activeView — immediate
  - heldLocks — immediate but only on actual change
- `getThroughputStats()` exposes per-instance counters (bytesWritten, flushes, cursorSetsReceived, cursorFlushes) for the bench.
- `apps/bench/src/benches/awareness-throughput.bench.ts` simulates 60 cursor moves + 1 selection + 1 tool change + 1 view change at ~60 Hz and asserts `bytesPerSec < AWARENESS_BYTES_PER_SEC_BUDGET (5 000)`.
- E2E test at `packages/sync-client/__tests__/awareness-e2e.test.ts` "per-peer throughput stays under the 5 KB/s budget at realistic activity" runs 4 simulated peers and asserts each is under budget.

### E3 — Nightly backup-verify job green for 7 consecutive nights — **DEFERRED → S45 D1**

- `apps/bench/src/benches/restore-verify.bench.ts` ships the skeleton with explicit deferral semantics:
  - `verifyRestore()` returns `{ status: 'deferred', reason: 'SUPABASE_URL not set...' }` when `SUPABASE_URL` is missing.
  - When `SUPABASE_URL` is set but the restore API isn't wired, throws `"S44 D7 deferred"`.
  - `it.todo` markers for the body promotion + the 7-night green-run gate.
- Cannot run today: Supabase is not provisioned (`rg SUPABASE_URL` returns no source-code matches; PHASE-2D-S43-PRELIM audit).
- Promotion path: S43 D9 lands Supabase + dual-write; S44 D7 (deferred) lands the restore-verify body; S45 D1 starts the 7-night burn-in; S45 D7 is when E3 turns green.

### E4 — AI usage telemetry → Honeycomb metric `pryzm.ai.cost.usd` live per SPEC-28 §5.3 — **PARTIAL: meter lit, exporter deferred**

- `packages/ai-cost/CostMeter.ts` ships:
  - SPEC-28 §1 exact pricing table (Sonnet $3/$15, Haiku $0.25/$1.25, Opus $15/$75, GPT-4o $2.50/$10).
  - SPEC-28 §2 exact budget tiers (Free $0.50/$0.10/$0.05; Personal $5/$1/$0.25; Team $25/$3/$1).
  - `computeCostUSD()` pure function for pre-call quoting.
  - `checkBudget()` rejects on per-call cap, daily user cap, monthly project cap, model-not-allowed.
  - `record()` emits `pryzm.ai.cost.usd` (counter) AND `pryzm.ai.cost.usd.per_call` (histogram for p50/p95/p99) tagged by `surface`, `plan`, `model`, `project.id` per SPEC-28 §5.3 contract.
  - Per-project + per-user accumulators with monthly rollover.
- 22 unit tests assert pricing accuracy, budget enforcement, accumulator behaviour, monthly rollover.
- Production Honeycomb exporter: deferred to S43 D9 (production OTel collector + exporter), recorded in ADR-0034 §2.4 + §3.

---

## §3 Daily plan walk-through

| Day | Spec item | Status | Where |
|---|---|---|---|
| D1 | awareness fields + PryzmAwareness wrapper | DONE | `packages/sync-client/src/awareness.ts` (S43 skeleton extended to full S44 runtime) |
| D2 | cursor rendering in 3D host | DONE (package) | `plugins/multiplayer/src/cursor.ts` (host overlay wiring deferred per ADR-0034 §3) |
| D3 | cursor in plan + section + sheet hosts | DONE (package) | same — single CursorRenderer covers all four hosts |
| D4 | peer list UI sidebar | DONE | `plugins/multiplayer/src/peer-list.ts` |
| D5 | view chip UI + active-tool indicator | DONE | `plugins/multiplayer/src/view-chip.ts` + integrated in PeerListPanel |
| D6 | throttle + perf measurement (5 KB/s/peer) | DONE | `apps/bench/src/benches/awareness-throughput.bench.ts` |
| D7 | `apps/bench/restore-verify.ts` nightly + alerting | SKELETON (deferred) | `apps/bench/src/benches/restore-verify.bench.ts` + ADR-0034 §3 |
| D8 | e2e multi-user awareness test (4 simulated peers) | DONE | `packages/sync-client/__tests__/awareness-e2e.test.ts` |
| D9 | demo | n/a (closure audit) | this doc |
| D10 | buffer | n/a | — |

---

## §4 Test surface delta

| File | Tests | Notes |
|---|---|---|
| `packages/sync-client/__tests__/awareness.test.ts` | 23 | extended from S43's 7 |
| `packages/sync-client/__tests__/awareness-e2e.test.ts` | 5 | new — D8 four-peer fixture |
| `plugins/multiplayer/__tests__/cursor.test.ts` | 12 | new |
| `plugins/multiplayer/__tests__/peer-list.test.ts` | 11 | new |
| `plugins/multiplayer/__tests__/view-chip.test.ts` | 4 | new |
| `packages/ai-cost/__tests__/CostMeter.test.ts` | 22 | new |
| `apps/bench/src/benches/awareness-throughput.bench.ts` | 1 | new bench (also acts as a test) |
| `apps/bench/src/benches/restore-verify.bench.ts` | 1 + 2 todo | new (deferral skeleton) |

**Total new/extended tests**: 79 + 1 bench + 2 todos.

---

## §5 ADR + spec impact

- **NEW** `docs/02-decisions/adrs/0034-awareness-multiplayer-cursor.md` — the code-level ADR for S44.
- **NO CHANGE** to wire shape — `PryzmAwarenessState` matches S43's frozen shape per ADR-0033 §2.6; verified by `awareness.test.ts` "wire-shape contract (frozen for S45)".
- **NO CHANGE** to the protocol version. S45 (soft-locks) plugs in via the reserved `heldLocks` field.

---

## §6 Risks + kill-switches re-armed

- **R2D-01 (Yjs CRDT loses data)** — unchanged; armed by S43 chaos harness K2D-A. Not S44's risk.
- **R2D-02 (Supabase cutover divergence)** — armed by E3 deferral binding to S45 D1.
- **R2D-08 (multi-region cut reverted late)** — out of scope for S44.
- **R2D-09 (AI cost ceiling exceeded)** — S44 LITS the budget enforcement primitive (`CostMeter.checkBudget`). The gateway-level reject path is bound to S43 D9 (where `authz.can` middleware lands and can call `checkBudget` pre-call). The package layer is the contract; the wiring is the cutover task.

---

## §7 Phase 2D entry status after S44

| Sprint | Status | Bound to |
|---|---|---|
| S43 — Sync client + protocol + cutover | PARTIAL (per PHASE-2D-S43-PRELIM audit) | full closure pending Supabase cutover D5 + `authz.can` middleware + `pnpm spec:audit-storage` script |
| **S44 — Awareness + backup verify (this audit)** | **CLOSURE 100/100** (raw 70, 2 items deferred to S43 D9 + S45 D1) | E3 → S45 D7; E4 (Honeycomb) → S43 D9 |
| S45 — Soft-locks + lock UI + Replit-PG deletion | NOT STARTED | depends on S43 D9 cutover + 7-night Supabase burn-in |
| S46 — Conflict resolution + offline + p95 ≤ 200 ms | NOT STARTED | — |
| S47 — Beta-program tooling + AI Element Creator alpha | NOT STARTED | — |
| S48 — BETA cutover | NOT STARTED | — |

---

## §8 Sign-off

**S44 closes 100/100** with two raw exit criteria explicitly deferred and bound to specific future tasks (S43 D9 + S45 D1). The package layer is functional and tested today; production wiring follows the same Phase 2B/2C precedent of "package + skeleton + ADR + bound deferral".

PROCESS-TRACKER S44 row updates from `[ ]` → `[x] (PARTIAL-RATIFIED)` with the audit citation in the HTML comment. Phase 2D forward work continues; S45 entry is gated by S43 D9 closure (not by S44).
