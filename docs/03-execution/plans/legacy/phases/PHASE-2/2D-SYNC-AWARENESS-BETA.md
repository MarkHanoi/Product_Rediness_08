# Phase 2D — Sync, Awareness, Beta Launch
## Q4 of Phase 2 · Months 22–24 · Sprints S43–S48

> **Authority note (added 2026-04-27).** This sub-phase doc is subordinate to the SPEC and ADR series. Conflict precedence: `docs/03-execution/specs/SPEC-*` → `docs/02-decisions/adrs/ADR-*` (cited as `[strategic ADR-NNN]`) → `10-MASTER-IMPLEMENTATION-PLAN-36M.md` → `CRITICAL-REVIEW-2026-04-27.md` → `05-IMPLEMENTATION-PLAN.md` → this phase doc. Sprint-scoped ADRs in `docs/02-decisions/adrs/NNNN-slug.md` are cited as `[ADR NNNN-slug]` and govern *implementation choices inside* a sprint, not strategy.
>
> **Strategic anchor**: `08-VISION.md` → `10-MASTER-IMPLEMENTATION-PLAN-36M.md` §5 → `phases/PHASE-2-MIGRATION-MULTIUSER-M13-M24.md` §5 → this file.
>
> **Coalescing-window invariant**: every reference to bake/event coalescing in this doc means **250 ms** per `[strategic ADR-010]`. Any doc still saying 500 ms is stale.

---

## Executive Summary

**Sub-phase goal**: turn on production-grade real-time multi-user. By M24 morning, 25 invited beta users open shared projects across two browser tabs, edits propagate within 250 ms p95, soft locks prevent same-element data loss, AI host is lazy-loaded with an approval-queue UI, and the storage substrate has been **cut over** from Replit-PG to Supabase with the 14-day rollback window successfully elapsed.

**Why 2D is the highest-impact-failure phase of Phase 2**: same-element concurrent edit producing data loss on a beta project is the single worst outcome on the whole 36-month plan. Phase 1 proved the foundation worked; Phase 2A/2B/2C extended it; Phase 2D bets the architecture in front of real users. `[strategic ADR-002]` (CRDT + event log bridge per SPEC-03 §3) was the framing decision; the Yjs spike pre-S01 was its first mitigation; the chaos-test harness in S43, the 14-day Supabase burn-in per SPEC-27 §3.1, and the soft-lock contract per `[strategic ADR-019]` are the second, third and fourth.

**The four hardest problems in 2D**:

1. **CRDT ↔ event-log bridge correctness** (S43) — the bidirectional bridge between command-bus events and Yjs map operations must be **byte-deterministic** and **causally consistent**. Per SPEC-03 §3 the event log remains the durable source of truth; Yjs is the convergence transport. The chaos-test harness must demonstrate convergence under 100 random edits across N tabs in < 5 s.
2. **Production cutover Replit-PG → Supabase** (S43–S45) — per SPEC-27 §3 with the 14-day rollback window. Health checks fail-fast if `SUPABASE_URL` missing per SPEC-15 §4. Zero-data-loss is the contract, not an aspiration.
3. **Soft-lock semantics** (S45) — per `[strategic ADR-019]` + SPEC-24 §1.3. TTL default 30 s, server-side lease tracking in Postgres `soft_locks` table, conflict-rejection path with friendly error UI. Must compose correctly with Yjs awareness (the lock holder is broadcast as awareness state, not as a separate channel).
4. **Permission matrix in every gateway route** (S43) — per `[strategic ADR-011]` + ADR-028 Part F. `authz.can(actor, action, resource)` is a single-source check before any state-mutating handler.

**Cut-list discipline**: every sprint in 2D respects `[strategic ADR-018]` (capacity cut list). T1.7 + T1.8 are added per the gap review and are checkpointed at S47 retro. If a Tier-1 cut is required to land M24 cleanly, it is a documented decision, not a slip.

---

## §0 Reading Conventions

**ADR citation format**: `[strategic ADR-NNN]` for the strategic series at `docs/02-decisions/adrs/ADR-NNN-*.md`; `[ADR NNNN-slug]` for sprint-scoped ADRs at `docs/02-decisions/adrs/NNNN-slug.md`. **Bare `ADR-NNN` references are forbidden** in this doc.

**SPEC citation format**: `SPEC-NN §X.Y` is the canonical form. Every binding line in §3 (Sprint detail) must trace to a SPEC, an ADR, or a phase-level decision.

**The CRDT–event-log bridge invariant**: every command in 2D commits a **patch + event** atomically. The event is appended to the durable log; the patch is applied to in-memory stores; the resulting Yjs op is broadcast last. If the broadcast fails, peers reconverge on next reconnect from the log — no peer-side compensation.

**Storage map invariant**: every table referenced in 2D is registered in SPEC-24 §4. The `pnpm spec:audit-storage` gate at S48 fails the build if a production code path creates a table not in the map.

---

## §1 Track Allocation for 2D

### Track A — Sync server, persistence, AI host (Agent A)

| Item | Sprint |
|---|---|
| `apps/sync-server` Yjs protocol extension (`y-websocket`-style) | S43 |
| Production cutover Replit-PG → Supabase (per SPEC-27 §3) | S43 |
| `authz.can` middleware in every gateway route (per `[strategic ADR-011]`) | S43 |
| `apps/bake-worker` debounce window pinned at 250 ms per `[strategic ADR-010]` | S43 |
| Backup verification job (nightly restore-into-fresh + checksum) per SPEC-24 §3.4 | S44 |
| `project_command_log` table delete + Replit PG production data delete | S45 |
| Soft-lock server state in Postgres `soft_locks` table per `[strategic ADR-019]` | S45 |
| `packages/ai-host/AiHost.ts` lazy bootstrap (per `[strategic ADR-014]`) | S47 |
| `apps/ai-worker/` BullMQ skeleton | S47 |
| Production OTel dashboards + crash reporting (Sentry-equivalent) | S48 |

### Track B — Sync client, multiplayer UI, lock UI, beta surface (Agent B)

| Item | Sprint |
|---|---|
| `packages/sync-client/SyncClient.ts` (Yjs document, transport, reconnect) | S43 |
| `packages/sync-client/event-bridge.ts` (command-bus ↔ Yjs ops) | S43 |
| `packages/sync-client/causal-test/` chaos harness | S43 |
| `packages/sync-client/awareness.ts` (PRYZM-specific awareness fields) | S44 |
| `plugins/multiplayer/cursor.ts` + `peer-list.ts` + `peer-view-chip.ts` | S44 |
| `packages/sync-client/locks.ts` (acquire/release/extend) | S45 |
| `plugins/multiplayer/lock-ui.ts` (badges + friendly error UI) | S45 |
| `plugins/visibility-intent/waves/{w01..w05}.ts` literal preservation | S46 |
| `packages/stores/AiApprovalQueueStore.ts` + UI hook | S47 |
| `plugins/ai-floorplan/` empty plugin shell | S47 |
| Beta sign-up page on `pryzm.com/beta` + 25 invitations | S48 |
| 3-min beta demo screencast + announcement copy | S48 |

### Joint Deliverables

| Item | Sprint |
|---|---|
| Sprint-scoped `[ADR 0019-sync-server-linearisation]` (refresh) | S43 D1 |
| Sprint-scoped `[ADR 0025-multi-view-sync]` re-cite from S36 | S44 D1 |
| Cut-list checkpoint per `[strategic ADR-018]` T1.7 + T1.8 | S47 D9 |
| 2D demo recording (8-min screencast) | S48 D7 |
| `apps/bench/reports/M24-beta.md` | S48 D6 |

---

## §2 Sprint-by-Sprint Detail

---

### S43 — Sync Client (Yjs) + Protocol + Production Cutover
**Weeks 85–86 (Month 22)**

---

#### Context and Why This Matters

S43 is the single most consequential sprint in Phase 2. Three irreversible things happen in 10 working days:

1. **Yjs goes live as the convergence transport** between editor instances. The command-bus event becomes the unit of replication; the event log remains the durable source of truth (per SPEC-03 §3).
2. **Storage cuts over from Replit-PG to Supabase** per SPEC-27 §3 with a 14-day rollback window. Both stores run in parallel during the window; the source of truth for *new writes* moves to Supabase on D5; reads continue to fall back to Replit-PG until the window elapses.
3. **`authz.can` is enforced in every gateway route** per `[strategic ADR-011]` + ADR-028 Part F. Before this sprint, multi-user routes assumed authenticated = authorized. After this sprint, every state-mutating handler resolves a permission tuple.

The chaos-test harness is the gate that lets us sleep at night through Phase 3.

---

#### Implementation Detail — `SyncClient.ts`

```typescript
// packages/sync-client/SyncClient.ts

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { CommandBus, EventLog } from '@pryzm/runtime';

export interface SyncClientOptions {
  projectId: ProjectId;
  url: string;          // wss://sync.pryzm.com/projects/<id>
  authToken: string;
  commandBus: CommandBus;
  eventLog: EventLog;   // durable source of truth (SPEC-03 §3)
}

export class SyncClient {
  private doc = new Y.Doc();
  private provider: WebsocketProvider;
  private bridge: EventBridge;

  constructor(opts: SyncClientOptions) {
    this.provider = new WebsocketProvider(opts.url, opts.projectId, this.doc, {
      params: { token: opts.authToken },
      // exponential backoff on reconnect; offline-buffer all unsynced events
      resyncInterval: 5_000,
    });
    this.bridge = new EventBridge(this.doc, opts.commandBus, opts.eventLog);
  }

  // The bridge is bidirectional:
  //  - local command commit → event in log → Y.Map op broadcast
  //  - inbound Y.Map op → patch applied to stores → no log re-append
  //
  // On reconnect after offline period, peer pulls missing events from
  // the durable log (REST endpoint), NOT from Yjs replay. Yjs replay is
  // best-effort transport only; the log is authoritative per SPEC-03 §3.
}
```

**Why a Yjs map, not a Yjs array**: events carry their own monotonic IDs from the durable log; we use the map keyed by event-ID so out-of-order delivery is convergent without ordering tricks. Per `[ADR 0019-sync-server-linearisation]` the server linearises at the log layer, not the Yjs layer.

---

#### Implementation Detail — `event-bridge.ts`

```typescript
// packages/sync-client/event-bridge.ts

export class EventBridge {
  constructor(
    private doc: Y.Doc,
    private commandBus: CommandBus,
    private eventLog: EventLog,
  ) {
    // Forward direction: local command → Y.Map op
    commandBus.onCommitted((event) => {
      const events = doc.getMap('events');
      events.set(event.id, event.payload);
    });

    // Reverse direction: inbound Y.Map op → patch
    doc.getMap('events').observe((evt) => {
      for (const key of evt.keysChanged) {
        if (this.eventLog.has(key)) continue; // already applied
        const payload = doc.getMap('events').get(key);
        this.eventLog.appendInbound(key, payload);
        this.commandBus.applyPatchOnly(payload); // NO re-broadcast
      }
    });
  }
}
```

**The non-broadcast applyPatchOnly path** is the critical primitive. If an inbound event triggered another local broadcast we would loop the network. The patch-only path bypasses the broadcast hook.

---

#### Implementation Detail — Chaos test harness

```typescript
// packages/sync-client/causal-test/chaos.test.ts

it('100 random edits across 4 tabs converge in < 5s', async () => {
  const tabs = await spawnTabs(4, 'chaos-fixture-001.pryzm');
  const generator = new RandomEditGenerator({ seed: 0xC0FFEE });

  for (let i = 0; i < 100; i++) {
    const tab = tabs[i % 4];
    const edit = generator.next();
    await tab.commit(edit); // no inter-tab wait — purposely concurrent
  }

  const start = performance.now();
  await waitForConvergence(tabs, { timeoutMs: 5_000 });
  const elapsed = performance.now() - start;

  expect(elapsed).toBeLessThan(5_000);
  expect(snapshotsEqual(tabs)).toBe(true);
});
```

**Convergence definition**: `snapshotsEqual` deep-compares the in-memory store snapshots of every tab; equality is achieved when every tab has applied every event. The harness runs in CI **and** as a pre-S48 gate.

---

#### Implementation Detail — Production cutover (SPEC-27 §3)

```text
D1   Provision Supabase project + RLS policies + connection-string secret.
D2   Dual-write: every write goes to BOTH Replit-PG and Supabase. Reads
     still served by Replit-PG. `pnpm spec:audit-storage` green.
D3   Read-your-writes consistency check job: nightly verify every Supabase
     row has the matching Replit-PG row.
D4   Switch primary read path to Supabase (feature flag
     `storage.primary=supabase`). Replit-PG reads only on Supabase miss
     (transitional fallback).
D5   `SUPABASE_URL` becomes a hard requirement at boot per SPEC-15 §4.
     Production health-check fails fast if missing.
D6   Day-1 of 14-day burn-in. project_command_log NOT yet deleted.
```

The 14-day window is calendar time; deletion of `project_command_log` and Replit-PG production data is at S45 D5.

---

#### `[strategic ADR-018]` capacity-cut checkpoint

T1.7 and T1.8 are **added** to the cut list per the gap review:

- **T1.7**: defer Yjs sync-server multi-region replication to Phase 3D (S67). Single-region (Reserved VM, EU-West) is the M24 contract.
- **T1.8**: defer awareness compaction beyond throttle to Phase 3A (S52). M24 ships the 5 KB/s/peer cap on raw broadcast.

If both cuts hold, M24 lands clean. If either is reverted, the cost is two sprints.

---

#### Daily Plan

- **D1**: Yjs document setup + WebSocket transport + Supabase provisioning + cutover D1 work.
- **D2**: event bridge forward direction + dual-write enabled.
- **D3**: event bridge reverse direction + read-your-writes job.
- **D4**: reconnect + offline buffer + Supabase primary read path.
- **D5**: chaos test harness scaffolding + `SUPABASE_URL` hard-required.
- **D6**: 100-edit convergence test + perf bench (`apps/bench/sync-latency.ts`).
- **D7**: `authz.can` rollout to every gateway route + per-route audit.
- **D8**: bake-worker debounce pinned at 250 ms per `[strategic ADR-010]` + lint.
- **D9**: demo + cutover D5 milestone (primary write path on Supabase).
- **D10**: buffer.

---

#### Exit Criteria for S43

- Two tabs converge after 100 random edits in < 5 s.
- Sync latency < 250 ms p95 for single-edit propagation across two tabs.
- Chaos-test invariants assert in CI.
- Supabase is primary write path; Replit-PG dual-write continues until S45 D5.
- `authz.can` enforced on every gateway route; audit log has zero unprotected handlers.
- `pnpm spec:audit-storage` green.

---

### S44 — Awareness Extended (View, Tool, Selection) + Backup Verification
**Weeks 87–88 (Month 22)**

---

#### Context and Why This Matters

Awareness is what turns CRDT collaboration from "two people editing a file" into "a shared workspace". When user A is in plan view at Level 1 placing a wall, user B in 3D should see the cursor, the active tool, and a chip on the peer list saying "Plan view — Level 1 — Wall tool". This is the `D1` differentiator turning on visibly: no other named competitor delivers awareness in BIM at this granularity.

Backup verification (SPEC-24 §3.4) goes live this sprint because the Supabase 14-day burn-in window includes the contractual obligation to demonstrate that point-in-time-recovery (PITR) → fresh checksum match works **before** the rollback window closes.

---

#### Implementation Detail — `awareness.ts`

```typescript
// packages/sync-client/awareness.ts

export interface PryzmAwarenessState {
  userId: UserId;
  displayName: string;
  cursor: { x: number; y: number; viewId: string } | null;
  activeViewId: string;
  activeTool: ToolId | null;
  selection: ElementId[];
  heldLocks: ElementId[];   // mirror of soft-lock state for visibility
  lastActivity: number;
}

export class PryzmAwareness {
  constructor(private provider: WebsocketProvider, private user: User) {
    provider.awareness.setLocalState({
      userId: user.id,
      displayName: user.displayName,
      cursor: null,
      activeViewId: 'main-3d',
      activeTool: null,
      selection: [],
      heldLocks: [],
      lastActivity: Date.now(),
    });
  }

  // Throttled to ≤ 5 KB/s per peer per ADR-018 T1.8 budget.
  // Cursor updates are coalesced at 50 ms; selection updates immediate;
  // tool changes immediate; heldLocks updated only on lock state change.
}
```

---

#### Implementation Detail — Multiplayer cursors

The cursor renderer plugs into every `CanvasHost` subclass: `Scene3DHost`, `PlanViewCanvasHost`, `SectionViewCanvasHost`, `SheetEditorHost`. Per `[ADR 0025-multi-view-sync]` the cursor is rendered in the view that the peer's `activeViewId` names; when a peer switches view, their cursor disappears from the old view and appears in the new one within one frame.

```typescript
// plugins/multiplayer/cursor.ts

scheduler.onFrame('multiplayer-cursors', () => {
  for (const [_, peer] of awareness.getStates()) {
    if (peer.activeViewId !== thisHost.viewId) continue;
    if (!peer.cursor) continue;
    drawCursor(ctx, peer.cursor.x, peer.cursor.y, peer.displayName, colorFor(peer.userId));
  }
}, 'interactive');
```

---

#### Implementation Detail — Backup verification (SPEC-24 §3.4)

```text
nightly cron:
  1. Pick a random Supabase backup from the previous 24 hours.
  2. Restore it into a fresh ephemeral Postgres instance.
  3. Run `pnpm bench restore-verify` — checksum every table against
     the live primary (filtering rows newer than the backup snapshot).
  4. Alert PagerDuty on any mismatch beyond the snapshot-time tolerance.
```

This is the gate that proves the rollback window is real, not theoretical.

---

#### Daily Plan

- **D1**: awareness fields + PryzmAwareness wrapper.
- **D2**: cursor rendering in 3D host.
- **D3**: cursor in plan + section + sheet hosts.
- **D4**: peer list UI sidebar.
- **D5**: view chip UI + active-tool indicator.
- **D6**: throttle + perf measurement (5 KB/s/peer cap).
- **D7**: `apps/bench/restore-verify.ts` nightly + alerting wiring.
- **D8**: e2e multi-user awareness test (4 simulated peers).
- **D9**: demo.
- **D10**: buffer.

---

#### Exit Criteria for S44

- Peer cursor + view + tool visible across all view types (3D, plan, section, sheet).
- Awareness traffic < 5 KB/s per peer measured at 4 concurrent users.
- Nightly backup-verify job green for 7 consecutive nights.
- AI usage telemetry → Honeycomb metric `pryzm.ai.cost.usd` live per SPEC-28 §5.3.

---

### S45 — Soft Locks + Lock UI + Replit-PG Production Data Deletion
**Weeks 89–90 (Month 23)**

---

#### Context and Why This Matters

The soft-lock contract per `[strategic ADR-019]` is the bridge between CRDT eventual consistency and BIM's "no two designers should be editing the same wall simultaneously" reality. Locks are advisory (peers respect them) but server-enforced via the `soft_locks` Postgres table per SPEC-24 §1.3 — a peer that violates the lock has its command rejected at the gateway.

S45 D5 also marks the **point of no return** on the cutover: `project_command_log` is deleted; Replit PG production data is deleted; the auto-fallback in `server.js` becomes dev-only (`NODE_ENV !== 'production'`).

---

#### Implementation Detail — `locks.ts`

```typescript
// packages/sync-client/locks.ts

export class LockManager {
  async acquire(elementId: ElementId, ttlMs = 30_000): Promise<LockHandle> {
    const res = await fetch(`/api/locks/${elementId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.authToken}` },
      body: JSON.stringify({ ttlMs }),
    });
    if (res.status === 409) {
      const conflict = await res.json();
      throw new LockConflictError(elementId, conflict.holder);
    }
    return new LockHandle(elementId, res.json().leaseId, () => this.release(elementId));
  }

  async extend(handle: LockHandle): Promise<void> {
    await fetch(`/api/locks/${handle.elementId}/extend`, {
      method: 'POST',
      body: JSON.stringify({ leaseId: handle.leaseId }),
    });
  }

  async release(elementId: ElementId): Promise<void> {
    await fetch(`/api/locks/${elementId}`, { method: 'DELETE' });
  }
}
```

**Server-side `soft_locks` table** (Postgres):

```sql
CREATE TABLE soft_locks (
  element_id    TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  holder_id     TEXT NOT NULL,
  lease_id      UUID NOT NULL,
  acquired_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  CONSTRAINT chk_future_expiry CHECK (expires_at > acquired_at)
);
CREATE INDEX soft_locks_expires_at_idx ON soft_locks (expires_at);
```

A scheduled job sweeps expired rows every 5 s; gateway rejection is `409 Conflict` with the holder's display name in the body.

---

#### Implementation Detail — Lock UI

```typescript
// plugins/multiplayer/lock-ui.ts

scheduler.onFrame('lock-badges', () => {
  for (const elementId of awareness.getAllHeldLocks()) {
    const holder = awareness.getHolder(elementId);
    if (holder?.userId === thisUser.id) continue; // don't badge own locks
    drawLockBadge(elementId, holder?.displayName ?? 'Someone');
  }
}, 'interactive');
```

The badge is a small padlock icon adjacent to the element bbox in 3D, plan, section, and sheet views — same renderer as the cursor in §S44, just a different glyph.

---

#### S45 D5 — The point-of-no-return

```text
D5 morning checklist (must all be GREEN before deletion):
  [ ] 14-day Supabase burn-in elapsed clean.
  [ ] No P0/P1 bugs touching persistence in the last 14 days.
  [ ] `pnpm bench restore-verify` green for 14 consecutive nights.
  [ ] `pnpm spec:audit-storage` green.
  [ ] Read-your-writes consistency check job green for 14 consecutive nights.

D5 actions (irreversible):
  1. DROP TABLE project_command_log;     -- in Supabase
  2. Drop Replit-PG production database (snapshot kept for 30 days).
  3. server.js: gate Replit-PG fallback on `NODE_ENV !== 'production'`.
  4. Delete `src/snapping/`; lives in `packages/picking/` per `[ADR 0015-picking-strategy]`.
  5. Tag commit `phase2d-cutover-complete` for forensic trace.
```

If any checklist item is RED on D5 morning, deletion is deferred to S46 D1 and the rollback window is extended.

---

#### Daily Plan

- **D1**: lock acquire/release/extend client + server endpoints.
- **D2**: server-side `soft_locks` table + lease validation.
- **D3**: conflict rejection path + error UI (`LockConflictError`).
- **D4**: lock UI badges in all four hosts.
- **D5**: **point-of-no-return** — `project_command_log` deletion if checklist green.
- **D6**: TTL expiry sweeper + e2e multi-user lock test (3 users on same element).
- **D7**: `src/snapping/` deleted; `packages/picking/` cutover.
- **D8**: lint + typecheck.
- **D9**: demo (2 users on same wall — lock holder wins, peer sees friendly message).
- **D10**: buffer.

---

#### Exit Criteria for S45

- 2 users attempting same-element edit → lock holder wins, peer sees "User X is editing this wall" notification.
- Lock badges visible across all four view types.
- TTL expiry cleans up correctly (verified via 30 s wait test).
- `project_command_log` deleted; Replit-PG fallback dev-only.
- `src/snapping/` deleted; `packages/picking/` is the only snapping path.

---

### S46 — Visibility-Intent Migration Waves 1–5 + Backup Bench Live
**Weeks 91–92 (Month 23)**

---

#### Context and Why This Matters

The 11-wave Visibility-Intent system from PRYZM 1 is the most battle-tested UI subsystem in the legacy codebase. Per SPEC-30 §6 it gets **literal preservation, not redesign** — every wave migrates verbatim into `plugins/visibility-intent/waves/wNN.ts` with parity tests demonstrating < 1 px visual diff on the visibility test set.

Waves 6–11 are deferred to S49 (Phase 3A). The split-point at wave 5 is deliberate: waves 1–5 cover the "always-on" visibility primitives (level scope, category visibility, view-template inheritance, wall-end joins, opening culling); waves 6–11 cover the "user-discretion" primitives (filter overrides, temporary isolation, hide-element, view-state save/restore).

`apps/bench/restore-verify.ts` becomes a permanent gate — green for the next 14 nights at minimum.

---

#### Implementation Detail — Wave canonical pattern

```typescript
// plugins/visibility-intent/waves/w01-level-scope.ts

import type { VisibilityWaveContext, VisibilityResult } from '../types';

export function w01LevelScope(ctx: VisibilityWaveContext): VisibilityResult {
  const { activeView, element } = ctx;
  // PRYZM 1 verbatim: an element is visible in a view if its level
  // is in the view's visible-levels set OR the view is unlevel-scoped.
  if (activeView.unlevelScoped) return { visible: true };
  return { visible: activeView.visibleLevels.has(element.levelId) };
}
```

Each wave is a **pure function** of `(ctx) => result`. The `plugins/visibility-intent/store.ts` chains the 11 waves left-to-right; the first wave that returns `{ visible: false }` short-circuits.

---

#### Why "literal preservation" not "rewrite"

The 11-wave system encodes 7 years of edge-case bug fixes that no PR description survives. A rewrite from spec would re-introduce known bugs; a verbatim port carries those fixes. Per SPEC-30 §6 the migration produces parity tests **before** the wave is rewritten — the parity test is the ground truth, not the spec.

---

#### Daily Plan

- **D1**: wave 1 — canonical pattern, slow + careful, parity fixture authored first.
- **D2**: wave 2.
- **D3**: wave 3.
- **D4**: wave 4.
- **D5**: wave 5.
- **D6**: parity tests for all 5 waves green.
- **D7**: `apps/bench/restore-verify.ts` nightly + alerting per SPEC-24 §3.4.
- **D8**: lint + perf with all 5 waves enabled.
- **D9**: demo.
- **D10**: buffer.

---

#### Exit Criteria for S46

- Waves 1–5 parity-tested vs PRYZM 1; visual diff < 1 px on visibility test set.
- OTel spans `pryzm.visibility.wave.{n}` visible.
- `apps/bench/restore-verify.ts` green for 7 consecutive nights at sprint exit.
- Soft-locks table operational (lease validation working under chaos load).

---

### S47 — AI Subsystem Decomposition Begins + Cut-List Checkpoint
**Weeks 93–94 (Month 24)**

---

#### Context and Why This Matters

The AI subsystem in PRYZM 1 is 31 files of LLM orchestration, CV pipeline, generative workflows, rules engine, and voice input. Per `[strategic ADR-014]` (AI L7.5 operational placement) the AI host runs at architectural layer L7.5 — above the editor shell (L7), below the user (L8). It must be **lazy-loaded**: zero AI overhead on cold start, zero AI bytes in the editor's initial bundle, AI host imported only on first invocation.

S47 lands the skeleton + the approval-queue contract. Full L7.5 promotion happens in S49 (3A); CV pipeline in S50; generative workflows in S51–S52.

---

#### Implementation Detail — `AiHost.ts` lazy bootstrap

```typescript
// packages/ai-host/AiHost.ts

let _host: AiHost | null = null;

// Public API: every consumer calls getAiHost() and gets the lazily
// instantiated singleton. The first call triggers import; subsequent
// calls are O(1).
export async function getAiHost(): Promise<AiHost> {
  if (_host) return _host;
  // dynamic import — Vite tree-shakes this out of the editor's main bundle
  const { AiHost } = await import('./AiHost.impl');
  _host = new AiHost({
    workerEndpoint: '/api/ai-worker',
    approvalQueue: getApprovalQueueStore(),
    // CF Worker relay for Anthropic — see SPEC-28 §4
    anthropicRelay: '/api/ai/anthropic',
  });
  return _host;
}
```

**Verification (S47 D1)**: build the editor with `vite build --report` and confirm `packages/ai-host/AiHost.impl` is in a separate chunk that does not load on first paint. Per K3-A (kill-switch), if at end of S54 (M27) AI host has > 5% boot impact (i.e., loaded eagerly somewhere by accident), 3B halts.

---

#### Implementation Detail — `AiApprovalQueueStore`

```typescript
// packages/stores/AiApprovalQueueStore.ts

export interface AiPendingAction {
  id: string;
  workflow: 'floorplan' | 'generative' | 'rules' | 'cv' | 'voice';
  proposedCommands: CommandPayload[];
  estimatedCostUsd: number;
  preview?: { kind: 'image'; url: string } | { kind: 'json'; data: unknown };
  createdAt: number;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
}

export class AiApprovalQueueStore {
  // Per SPEC-28 §4 + ADR-028 Part E:
  //  - per-project budget enforced server-side
  //  - per-workspace AI Spend view shipped separately at S65 (3C)
  //  - workspace-admin override for plan/role per ADR-028 Part E (S65)
}
```

---

#### `[strategic ADR-018]` Tier-1 cut-list checkpoint

S47 D9 retro decides whether any of the following Tier-1 cuts are required to land M24 cleanly:

| Cut ID | Description | Default | If needed cost |
|---|---|---|---|
| T1.1 | Defer dimensions in section view to S49 | not cut | 0.5 sprint |
| T1.5 | Defer sheet schedule-snapshot widget richness | not cut | 0.5 sprint |
| T1.7 | Defer multi-region sync replication | **cut** (per S43) | 2 sprints |
| T1.8 | Defer awareness compaction beyond throttle | **cut** (per S43) | 1 sprint |

Founder + agent decide jointly. The decision is recorded in `apps/bench/reports/M24-beta.md`.

---

#### Daily Plan

- **D1**: ai-host skeleton + lazy bootstrap + bundle-size verification.
- **D2**: ai-worker BullMQ scaffolding + queue contract.
- **D3**: approval queue store + UI hook (sidebar entry + count badge).
- **D4**: `plugins/ai-floorplan/` empty plugin shell + descriptor.
- **D5**: end-to-end smoke (mock AI batch → approval queue → manual accept → command commit).
- **D6**: OTel spans `pryzm.ai.workflow.{kind}` + perf bench.
- **D7**: lint + typecheck.
- **D8**: demo.
- **D9**: cut-list checkpoint + retro + `M24-beta.md` draft starts.
- **D10**: buffer.

---

#### Exit Criteria for S47

- AI host loads only on first invocation (verified via DevTools and build report).
- Editor first-paint bundle has zero AI-host bytes.
- Approval-queue UI rendered (empty state + populated state).
- One mock AI workflow committable end-to-end.
- Cut-list decision recorded.

---

### S48 — M24 BETA GATE + Beta Launch
**Weeks 95–96 (Month 24)**

---

#### Context and Why This Matters

S48 is the M24 BETA GATE — the contract on which the next 12 months of Phase 3 depend. 25 invited beta users open shared projects on the new stack with multi-user collab, plan view + section view + sheets + schedules + PDF export functional, AI host lazy-loaded with approval queue, sync latency < 250 ms p95, crash-free session rate > 95%.

Per SPEC-15 §8 + `[strategic ADR-019]` + SPEC-24 §1.10, the M24 beta gate **also asserts** the following bench gates — the existing list is augmented per the Gap-Closure subphase:

- `pnpm bench restore-verify` green (Supabase PITR → fresh checksum match).
- `pnpm spec:audit-storage` green (no production code creates a table not in the map).
- `pnpm bench yjs-collab` shows ≤ 250 ms broadcast lag p95 at 50 concurrent users.
- AI cost dashboard reflects live `ai_usage` rows; pre-call cap rejection works.
- All references to `service_role` Supabase keys removed from production routes.

---

#### Beta Cohort Composition

The 25 invitees are curated to span:

- 8 × C1 (independent practitioners, single-machine workflows).
- 10 × C2 (small studios, 2–5 users sharing projects).
- 5 × C3 (large practice IT, evaluating self-host for a future deployment).
- 2 × academic / educator (teaching BIM, providing fixture variety).

This mix exercises the stack along every dimension the M36 GA matrix cares about.

---

#### Daily Plan

- **D1**: beta sign-up page on `pryzm.com/beta` + transactional email pipeline.
- **D2**: 25 invitations sent + Discord/Slack channel for beta cohort.
- **D3**: Sentry-equivalent crash reporting (self-hosted or OSS) wired to OTel trace IDs.
- **D4**: production OTel dashboards on Honeycomb / Tempo with beta-specific filters.
- **D5**: bug triage workflow (Linear/GitHub issue templates with per-bug OTel trace link).
- **D6**: M24 comprehensive bench run; report drafted at `apps/bench/reports/M24-beta.md`.
- **D7**: 3-min beta demo screencast recorded + edited + captioned.
- **D8**: announcement blog post copy + launch dry-run.
- **D9**: **LAUNCH** (Tuesday) — beta opens to invitees.
- **D10**: first 48-hour monitoring + retro.

---

#### M24 BETA GATE — Full Exit Criteria

##### Functional

- ~18 element families operational.
- Plan view + section view + sheets + 10 widgets + PDF export + schedules + 3 export formats functional.
- Multi-user real-time geometry collab via Yjs; awareness; soft locks.
- Visibility-Intent waves 1–5 parity-tested.
- AI host lazy-loaded with approval queue UI (full AI workflows in 3A).

##### Performance

- All M12 numbers still green (regression bench).
- Sync latency < 250 ms p95 for same-second multi-user edit propagation.
- 20 concurrent users on one project: no crashes, < 500 ms sync latency.
- 2-user same-element conflict: lock-respected, no data loss.
- Plan view: 60 fps interactive, 0 fps idle.
- PDF export: 5-sheet drawing set < 30 s.

##### Beta Cohort

- 50+ beta sign-ups, 25 active in first 2 weeks.
- < 5 critical bugs reported (P0/P1).
- Crash-free session rate > 95%.
- OTel coverage for every reported bug enables 1-click trace lookup.

##### Architecture

- 50% of `(window as any)` legacy sites deleted from `apps/editor` (target: 1,039 remaining).
- 50% of 264 commands consolidated into plugin handlers.
- All boundary lint rules still active and PR-blocking.
- `.pryzm` v1 stable; users can email files between machines + import them.

##### Persistence + storage

- `project_command_log` deleted; Supabase is sole production primary.
- Auto-fallback in `server.js` is dev-only.
- Backup-verify nightly green for ≥ 14 consecutive nights.
- `pnpm spec:audit-storage` green.

##### AI

- AI host lazy-loaded; first-paint bundle has zero AI-host bytes.
- AI per-project budget enforced; UI surfaces shipped per SPEC-28 §9.
- AI cost dashboard live (Honeycomb metric `pryzm.ai.cost.usd`).
- Pre-call cap rejection works.

##### Documentation

- `apps/bench/reports/M24-beta.md` published with all numbers.
- 3-min beta demo screencast public.
- Beta announcement blog post live.
- Sub-phase retros archived in `docs/03-execution/status/retros/S43–S48/`.

---

## §3 Phase 2D Risk Register

| ID | Risk | Likelihood | Impact | Mitigation | Touch sprint |
|---|---|---|---|---|---|
| R2D-01 | Yjs CRDT loses data on multi-user same-element edit | Medium | Critical | `[strategic ADR-002]` spike; chaos test harness in S43; halt + root-cause if any beta user reports loss | S43, S48 |
| R2D-02 | Cutover D5 reveals data divergence between Replit-PG and Supabase | Medium | Critical | Read-your-writes job runs nightly from D3; D5 deletion gated on 14 consecutive nights green | S43, S45 |
| R2D-03 | Soft-lock TTL races produce phantom locks | Medium | High | TTL sweeper every 5 s; lease-ID validation; e2e 3-user test in S45 | S45 |
| R2D-04 | Awareness traffic exceeds 5 KB/s/peer cap | Low | Medium | Throttle in S44; perf measurement at sprint exit; cut to compaction is T1.8 (default cut) | S44 |
| R2D-05 | AI host accidentally loaded eagerly — bundle bloat | Medium | High | Build-report verification in S47 D1; K3-A kill-switch in M27 | S47 |
| R2D-06 | Visibility-Intent regression in waves 1–5 | Medium | High | Literal preservation in S46; per-wave parity tests; < 1 px gate | S46 |
| R2D-07 | Beta cohort exposes show-stopper UX gap | Medium | High | M24 beta is private (25 invited); 4-week bug-fix sprint S49 reserved | S48 |
| R2D-08 | Cut-list T1.7 (multi-region) reverted late | Low | High | Decision locked S43 D9; reversal cost = 2 sprints; defaults to cut | S43, S47 |
| R2D-09 | Cost ceiling from AI exceeded in beta | Medium | Medium | Per-project budget enforced server-side from S43 D9; pre-call cap rejection | S43, S47 |
| R2D-10 | Founder burnout entering Phase 3 | High | High | 1-week mandatory rest after S48; S49 has 4-week buffer for bug-fix | M24 |

---

## §4 Phase 2D Kill-Switches

- **K2D-A** — If at end of S43 (M22) Yjs chaos test fails to converge after 100 random edits in < 5 s, halt 2D forward work. Do not invite beta users with broken sync.
- **K2D-B** — If at S45 D5 morning checklist any item is RED, defer `project_command_log` deletion to S46 D1; extend rollback window.
- **K2D-C** — If at S47 D1 build-report verification shows AI host bytes in the editor's first-paint bundle, halt forward S47 work; root-cause + fix; re-verify before D2.
- **K2D-D** — If during beta (S48) any user reports same-element edit data loss, halt all sprint work; root-cause in CRDT layer; do not resume Phase 3 until regression locked out by test.
- **K2D-E** — If at S48 (M24) sync latency exceeds 500 ms p95 with 20 concurrent users, halt beta widening; tune sync server before adding more users.

---

## §5 Gap-Closure Subphase — Phase 2D (binding; consolidated from `GAP-REVIEW-2026-04-27.md`)

This consolidates the Gap-Closure entries from the umbrella `PHASE-2-MIGRATION-MULTIUSER-M13-M24.md §Gap-Closure` so that `phases/PHASE-2D-*` is the single read for 2D execution.

| Sprint | Gap-closure deliverable | Closes |
|---|---|---|
| **S43** | Production cutover Replit-PG → Supabase per SPEC-27 §3 with the 14-day rollback window. Sync server Yjs running on Reserved VM per SPEC-15 §2.2. Production health-check fails fast if `SUPABASE_URL` missing per SPEC-15 §4. AI per-project budget enforced per SPEC-28 §4; UI surfaces shipped per SPEC-28 §9. `authz.can` in every gateway route per ADR-028 Part F. Instantiation hooks deleted from `src/lifecycle/`; replacements in per-family plugins per ADR-030 Part D. Bake-worker debounce window pinned at 250 ms per `[strategic ADR-010]`. | SPEC-15, SPEC-24, SPEC-27 §3, SPEC-28, ADR-028, `[strategic ADR-010]` |
| **S44** | Backup verification (nightly restore-into-fresh + checksum) lit per SPEC-24 §3.4. AI usage telemetry → Honeycomb metric `pryzm.ai.cost.usd` live per SPEC-28 §5.3. | SPEC-24, SPEC-28 §5.3 |
| **S45** | After 14-day verification clean: `project_command_log` deleted; Replit PG production data deleted; auto-fallback in `server.js` becomes dev-only (`NODE_ENV !== 'production'`). `src/snapping/` deleted; lives in `packages/picking/`. | SPEC-24 §1.3, SPEC-27 §4.3 |
| **S46** | `apps/bench/restore-verify.ts` nightly + alerting per SPEC-24 §3.4. Soft-locks (`Postgres soft_locks` table) lit per `[strategic ADR-019]` + SPEC-24 §1.3. | `[strategic ADR-019]`, SPEC-24 §1.3 |
| **S47** | Beta closes; Phase 2 retro; Phase 3 plan refreshed against any drift. Capacity-cut Tier checkpoint per `[strategic ADR-018]` — decide whether T1.x are needed. | `[strategic ADR-018]` |
| **S48** | Phase 2 GA-rehearsal bench: `pnpm bench all` green; backup-restore drill green; AI cost dashboard signed off; SOC2-evidence collection plan ratified. | `[strategic ADR-021]`, SPEC-24 §1.10 |

---

## §6 What Phase 2D Explicitly Did NOT Do

For honesty about scope and to set Phase 3 expectations:

- Visibility-Intent waves 6–11 still in PRYZM 1 (S49).
- Full AI workflows (CV pipeline, generative, rules, voice) still in PRYZM 1 (S49–S52).
- No public AI API yet (S53).
- No IFC, DXF, Rhino plugins yet (S55–S57).
- No component editor migration (deferred per `[strategic ADR-018]` T2.2 — v2 backlog).
- No BCF round-trip (Phase 3B).
- PropertyPanel + PropertyInspector still 5,500+ LOC each in legacy.
- No plugin SDK 1.0 publish; layer boundaries enforced but no external developer surface.
- No marketplace, no public REST/WS APIs yet.
- `@pryzm/headless` still internal; not on public npm.
- No self-host packaging.
- Browser matrix: Chromium-only confirmed; Firefox + Safari + Edge come in S70.
- Multi-region sync replication NOT delivered (cut per `[strategic ADR-018]` T1.7).

---

## §7 Phase 2D → Phase 3 Handoff Checklist

Items that must be true on M24 morning before starting S49:

- [ ] All M24 BETA GATE criteria signed off.
- [ ] `apps/bench/reports/M24-beta.md` reviewed and committed.
- [ ] Beta cohort feedback synthesised; top 10 issues prioritised for S49 buffer week.
- [ ] One full week of buffer (founder rest week — non-negotiable).
- [ ] Sprint S49 plan written; agent issues expanded.
- [ ] No P0/P1 bugs in beta; if any, fix-first before S49 starts.
- [ ] `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md` re-read; risk register updated with anything learned in 2D.
- [ ] Cut-list decision (T1.7, T1.8) recorded and not reverted.
- [ ] `project_command_log` deleted; auto-fallback dev-only — verified one last time.

---

*Last updated: 2026-04-27. Owner: Founder + Architecture lead. Conflicts? See Authority note at top. The most catastrophic failure mode in 2D is CRDT data loss; the most dangerous moment is S45 D5 (`project_command_log` deletion). Both have explicit kill-switches.*

---

## Amendment 2026-04-28 (W-19 — visibility-intent location)

**Source**: W-19 of `phases/audits/PHASE-2-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md` §M-5.

The Phase 2D spec referenced `plugins/visibility-intent/` as the home for the
visibility waves.  The shipped reality is `packages/visibility/src/waves/`.
Both readings are defensible:

* The spec wording predated the L4 vs L7 boundary tightening of S40.
* Visibility waves are pure functions over element graphs — they have no
  THREE imports, no DOM, no command-bus hooks.  By the L4-package criterion
  in `docs/03-execution/specs/SPEC-00-LAYERING.md`, they belong
  under `packages/`, not `plugins/`.

This amendment ratifies the as-built location.  `packages/visibility/`
contains all 11 waves (per ADR-0036 amendment 2026-04-28).  Plugins that
need to consume visibility verdicts (`plugins/view`, `plugins/plan-view`,
`plugins/sheets`, `plugins/rooms`) import from `@pryzm/visibility` directly.

No file moves are required.  Future spec revisions should reference
`packages/visibility/` and treat the original `plugins/visibility-intent/`
path as historical.
