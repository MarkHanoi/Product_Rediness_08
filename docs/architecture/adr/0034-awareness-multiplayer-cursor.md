# ADR-0034 — Awareness extended (cursor + view + tool + selection) and the multiplayer plugin

| Status | Accepted |
|---|---|
| Date | 2026-04-28 |
| Owners | Architecture lead |
| Sprint | S44 |
| Phase | 2D |
| Supersedes | — |
| Superseded by | — |
| Related | strategic ADR-002 (CRDT + event log), strategic ADR-018 (T1.8 awareness compaction cut), strategic ADR-019 (soft-locks), code-level ADR-0025 (multi-view-sync), code-level ADR-0033 (sync-client + event-bridge) |

## §1 Context

Strategic ADR-002 ("CRDT + event log bridge") establishes that PRYZM uses Yjs as a transport-only convergence layer; the durable source of truth remains the event log. Code-level ADR-0033 lands the `SyncClient` + `EventBridge` skeleton (S43) and freezes the `PryzmAwarenessState` wire shape so S45 (soft-locks) does not need a protocol-version bump.

S44 ships the visible side of awareness: peer cursors across all four canvas hosts (Scene3DHost, PlanViewCanvasHost, SectionViewCanvasHost, SheetEditorHost), the peer-list sidebar, the view+tool chip indicators, and the per-peer throttle that holds outbound traffic under the 5 KB/s/peer budget set by `[strategic ADR-018]` T1.8.

S44 also opens the AI cost-telemetry surface that SPEC-28 §5.3 requires (`pryzm.ai.cost.usd` Honeycomb metric). The pure code path lights up; the production exporter wiring is bound to S43 D9 cutover.

---

## §2 Decisions

### §2.1 PryzmAwareness owns coalescing, not the renderer

- The `PryzmAwareness` class in `@pryzm/sync-client` is the single throttle point for outbound presence traffic.
- Cursor sets are coalesced in a 50 ms window (spec §S44 line 317). Selection / activeTool / activeView writes are immediate. heldLocks writes are immediate but only when the list actually changes.
- Per-peer outbound bytes are tracked via `getThroughputStats()` so the bench (`apps/bench/src/benches/awareness-throughput.bench.ts`) can assert the < 5 KB/s budget without instrumenting the renderer.

**Why not throttle in the renderer**: the renderer should be free to draw at 60 Hz; the budget is an outbound-network concern. Coalescing at the writer keeps the wire small regardless of how often peers re-render.

### §2.2 Cursor rendering is plain Canvas2D — no THREE in the multiplayer plugin

- `plugins/multiplayer/` is THREE-free. Every canvas host already exposes a `CanvasRenderingContext2D` (plan/section/sheet hosts directly; the 3D host via a sibling overlay `<canvas>`).
- One `CursorRenderer` instance per canvas host, parameterised on `(viewId, localClientID)`. Per-frame `render(ctx, awareness)` paints exactly the peers whose `activeViewId === viewId`, skipping self.
- ADR-0025 ("multi-view-sync") contract: when a peer changes `activeViewId`, their cursor disappears from the old host within one frame and appears in the new host within one frame. This works without any explicit move plumbing — every host's `render()` call re-reads `awareness.getStates()` and the `activeViewId` filter does the routing.
- 3D host overlay strategy: the editor (S52+) attaches a transparent `<canvas>` over the THREE viewport at boot; the cursor coords for 3D are screen-space (clientX/clientY relative to the canvas). This keeps the THREE firewall intact.

### §2.3 PeerListPanel is vanilla DOM, not a framework component

- The editor is no-React (per the existing repo convention). The peer-list sidebar is a vanilla TS class that owns one `HTMLElement`, subscribes to awareness `'change'` events, and re-renders on update.
- For 25 beta users the O(N) re-render is fine. If peer count ever grows we promote to diff-based DOM updates.
- The view-chip helper (`renderViewChip`) is a pure factory function so the same chip can be used in the peer list and in (eventual) view-tab strips.

### §2.4 AI cost telemetry: pure layer in S44, exporter in S43 D9

- `packages/ai-cost/CostMeter.ts` ships the SPEC-28 §1 pricing table, the §2 budget table, the pre-call `checkBudget(input)` enforcement primitive, and the OTel meter emission (`pryzm.ai.cost.usd` per §5.3).
- The meter records into the global default `MeterProvider`. Tests can inject a custom `MeterProvider` to assert recording happens.
- Production export to Honeycomb is **deferred** to S43 D9 cutover — that is when the production OTel collector + Honeycomb exporter are provisioned. Until then `pryzm.ai.cost.usd` is recorded but only consumed by in-memory tests.

### §2.5 Backup verification: skeleton + deferral binding (S44 D7 → S45 D1)

- Spec §S44 D7 calls for `apps/bench/restore-verify.ts` nightly + alerting wiring; spec §S44 exit criterion E3 says "Nightly backup-verify job green for 7 consecutive nights."
- Both depend on Supabase being live, which is the S43 D9 milestone. S43 has not yet been closed (per `PHASE-2D-S43-PRELIM` audit).
- S44 ships the skeleton at `apps/bench/src/benches/restore-verify.bench.ts` with explicit deferral semantics: the test returns `status: 'deferred'` when `SUPABASE_URL` is unset (the case today). When Supabase lands at S43 D9, the test body fills in the restore + checksum logic. The 7-night green-run requirement is **bound to S45 D1** (one week after cutover) — recorded in PROCESS-TRACKER S44 row + the S44 audit.

### §2.6 PryzmAwareness construction signature: backward compatible

S43 shipped a positional `initialViewId` third argument. S44 needs `cursorCoalesceMs` and a clock injection for tests. The constructor accepts EITHER a string (legacy S43 callers) OR an options bag (new S44 callers). This avoids a churn-y migration of existing call sites.

---

## §3 Deferral matrix (S44 closure → S45/cutover bindings)

| Item | S44 status | Bound to | Re-eval |
|---|---|---|---|
| Cursor render in 3D host | Package-level cursor renderer + 4-view fan-out test | S52+ editor wires the overlay `<canvas>` | S52 D2 |
| Cursor render in plan / section / sheet hosts | CursorRenderer + tests | S46+ host integration in editor | S46 D3 |
| Peer-list sidebar UI | `PeerListPanel` + DOM tests | Editor sidebar mount in S52 | S52 D4 |
| View-chip + tool indicator | `renderViewChip` + tests | Same as peer-list | S52 D4 |
| 5 KB/s/peer throttle | `PryzmAwareness` + bench | — (gate is green at the package layer) | n/a |
| Backup verification — nightly | Skeleton at `restore-verify.bench.ts` | **S43 D9 (Supabase live)** | S45 D1 |
| Backup verification — 7 consecutive nights green | Pending | **S45 D1** | S45 D7 |
| AI usage telemetry — `pryzm.ai.cost.usd` meter | `CostMeter.record()` lights the meter | **S43 D9 (production OTel pipeline)** | S43 D9 |
| AI usage telemetry — Honeycomb dashboard | Pending | S43 D9 + S52 dashboard provisioning | S52 D5 |

---

## §4 Consequences

**Positive**
- The package layer is functional and tested today (no production wiring required for the 25-beta-user demo).
- The 5 KB/s/peer budget is enforced at the writer, not the network layer — robust against any future transport switch.
- Wire shape from ADR-0033 §2.6 remains frozen; soft-locks (S45) and AI surfaces (S52) plug in without a protocol bump.
- Production telemetry deferral is explicit and bound to a named future milestone (S43 D9), not a vague "TBD".

**Negative**
- The cursor + peer-list cannot be visually demoed inside the editor until the editor wires the overlay canvas + sidebar mount (S46/S52). Today the demo is unit + e2e tests against the package surface.
- The AI cost meter records to a no-op exporter until S43 D9; budget enforcement works (the in-memory accumulator is the source of truth) but the dashboards are not lit.
- The restore-verify gate cannot turn green until S45 D7 (7 consecutive nights after S45 D1).

---

## §5 Verification matrix

| Claim | Where it's verified |
|---|---|
| Cursor coalesce window is 50 ms | `packages/sync-client/__tests__/awareness.test.ts` "PryzmAwareness — cursor coalescing" |
| Selection / tool / view writes are immediate | same |
| 5 KB/s/peer budget at 4 concurrent users | `packages/sync-client/__tests__/awareness-e2e.test.ts` + `apps/bench/src/benches/awareness-throughput.bench.ts` |
| ADR-0025 multi-view fan-out (peer view-change moves cursor between hosts within one frame) | `plugins/multiplayer/__tests__/cursor.test.ts` "CursorRenderer — multi-view fan-out" |
| Wire-shape frozen at 8 fields | `packages/sync-client/__tests__/awareness.test.ts` "wire-shape contract (frozen for S45)" |
| SPEC-28 §1 pricing table exact match | `packages/ai-cost/__tests__/CostMeter.test.ts` "computeCostUSD — pure pricing" |
| SPEC-28 §2 budget tiers + per-call cap rejection | same file "CostMeter.checkBudget — pre-call enforcement" |
| `pryzm.ai.cost.usd` meter records on every `record()` | same file (records into the global default MeterProvider; tests assert via accumulator readback because the default provider is no-op) |
| Restore-verify deferral semantics | `apps/bench/src/benches/restore-verify.bench.ts` "verifyRestore returns deferred when SUPABASE_URL is missing" |
| Backup verification 7-night gate | `it.todo` bound to S45 D1 |

---

## Amendment 2026-04-28 (W-19 — `view-chip.ts` naming)

**Source**: W-19 of `PHASE-2-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md` §M-4.

The S46 plan named the per-peer view indicator file `peer-view-chip.ts`.
The shipped file is `view-chip.ts` (sibling of `cursor.ts`, `peer-list.ts`,
`lock-ui.ts`).  The `peer-` prefix was redundant — the entire
`plugins/multiplayer/src/` tree is by definition peer-scoped.  The shorter
name reads better at the import site:

```ts
import { mountViewChip } from '@pryzm/plugin-multiplayer/view-chip';
```

This amendment ratifies the rename; the file at `plugins/multiplayer/src/
view-chip.ts` is the canonical name.  No further action required.
