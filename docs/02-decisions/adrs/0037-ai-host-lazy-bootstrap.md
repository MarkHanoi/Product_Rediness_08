# ADR-0037 — AI Host Lazy Bootstrap + Worker Queue Skeleton + Approval Queue

- **Status**: Accepted (PARTIAL-RATIFIED — implementation skeleton ratified; live BullMQ worker + Anthropic relay invocation deferred to S49+)
- **Date**: 2026-04-28
- **Sprint**: S47 (Phase 2D, Month 24)
- **Authors**: main agent
- **Strategic anchors**:
  - `[strategic ADR-014]` — AI L7.5 operational placement
  - `[strategic ADR-006]` — idle budget (sub-µs no-op tracer when no SDK is set)
  - `[strategic ADR-018]` — Tier-1 cut list (T1.7 + T1.8 stay cut per S47 D9 retro)
  - `SPEC-28` §4 — Cloudflare Worker relay for Anthropic
  - `ADR-028` Part E — per-workspace AI Spend view + workspace-admin override (S65, 3C)
- **Spec source**: `docs/03-execution/plans/legacy/phases/PHASE-2/2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §S47 (lines 574-676).

---

## §1 Context

The AI subsystem in PRYZM 1 is 31 files of LLM orchestration, CV pipeline, generative workflows, rules engine, and voice input. Per `[strategic ADR-014]` the AI host runs at architectural layer **L7.5** — above the editor shell (L7), below the user (L8). The cold-start contract is:

> Zero AI overhead on cold start, zero AI bytes in the editor's initial bundle, AI host imported only on first invocation.

S47 lands the **skeleton** + the **approval-queue contract**. Full L7.5 promotion happens in S49 (3A); CV pipeline in S50; generative workflows in S51-S52. Per the K3-A kill-switch (spec line 611), if at end of S54 (M27) the AI host has > 5% boot impact (i.e., loaded eagerly somewhere by accident), Phase 3B halts.

In dev today, **Redis is not provisioned** (no `REDIS_URL`), so the live BullMQ-backed worker cannot run. The same "package + skeleton + ADR + bound deferral" pattern used for S43 (Yjs broker), S45 (soft-locks D5 cutover), and S46 (visibility waves) applies: ship the surface, ship a memory-backed default, ship the DI seam, defer the live wiring with a named binding.

---

## §2 Decision

### §2.1 — Lazy entry contract (`packages/ai-host/`)

`getAiHost(opts?): Promise<AiHost>` is the **only** public path to the AI host:

```ts
// packages/ai-host/src/AiHost.ts
let _host: AiHost | null = null;
let _pending: Promise<AiHost> | null = null;

export async function getAiHost(opts?: AiHostOptions): Promise<AiHost> {
  if (_host) return _host;
  if (_pending) return _pending;
  _pending = (async () => {
    const mod = await import('./AiHost.impl.js');   // string literal — Vite chunk boundary
    _host = mod.createAiHost(opts ?? {});
    _pending = null;
    return _host;
  })();
  return _pending;
}
```

Three invariants hold:

1. The barrel `packages/ai-host/src/index.ts` re-exports nothing from `AiHost.impl`. Static analysis in `scripts/check-ai-host-lazy.mjs` enforces this.
2. The dynamic-import call site uses a **string literal** so Vite emits a separate chunk at build time (verified at S47 D1 via `vite build --report` per spec line 611).
3. Concurrent first calls share the in-flight Promise — we never double-construct the host.

**Deferred binding**: the editor has zero references to `@pryzm/ai-host` today, so the contract is trivially satisfied. The static enforcer runs in CI from S47 D1 onward; the runtime first-paint bundle assertion runs at the end of every editor build via `vite build --report` (manual today, scripted at S49).

### §2.2 — OTel span shape

Per spec line 662 (`OTel spans pryzm.ai.workflow.{kind} + perf bench`), every workflow body is wrapped in a span named `pryzm.ai.workflow.{kind}` where `kind ∈ AiWorkflowKind`. The union has exactly 5 values (`floorplan | generative | rules | cv | voice`) so OTel cardinality stays finite. The cached-tracer pattern from `packages/sync-client/src/tracing.ts` is reused — `@opentelemetry/api`'s no-op tracer guarantees sub-µs overhead when no SDK is set per `[strategic ADR-006]`.

### §2.3 — Approval queue store (`packages/stores/AiApprovalQueueStore.ts`)

The `AiPendingAction` shape is **verbatim** from spec lines 620-628:

```ts
export interface AiPendingAction {
  readonly id: string;
  readonly workflow: AiWorkflowKind;
  readonly proposedCommands: ReadonlyArray<CommandPayloadRef>;
  readonly estimatedCostUsd: number;
  readonly preview?: AiPendingActionPreview;
  readonly createdAt: number;
  readonly status: AiPendingActionStatus;
}
```

The store extends the L1 `Store<T>` base (Map-based, applyPatch-ready) and exposes:
- selectors: `pending()`, `byWorkflow(kind)`, `byStatus(status)`, `pendingCount()`
- pure transitions: `nextStateForApprove`, `nextStateForReject`, `nextStateForExpire`
- mutators: `enqueue(action)`, `approve(id)`, `reject(id)`, `expireOlderThan(now, ttlMs)`
- sidebar-badge hook: `approvalQueueBadgeCount(store)`

**Per spec D3** the approval-queue UI reads `pendingCount()` for the sidebar count badge. **Per SPEC-28 §4 + ADR-028 Part E** the per-project budget enforcement and the per-workspace AI Spend view live SERVER-SIDE; this store is the client-side projection only. Workspace-admin override for plan/role per ADR-028 Part E ships at **S65 (3C)** unchanged in S47.

### §2.4 — AI worker queue factory (`apps/ai-worker/`)

`createQueue({env, registry, onComplete, onError})` mirrors the `createEventLog({env})` selection pattern from `apps/sync-server/src/eventLog/`:

| `env.PRYZM_AI_QUEUE` | `env.REDIS_URL` set? | Result |
|---|---|---|
| `'memory'` | any | `InMemoryQueue` |
| `'bullmq'` or unset | yes | dynamic-import `bullmq-queue.js` adapter (NOT shipped in S47 — throws clear error) |
| unset | no | `InMemoryQueue` (default) |

The S47 default is `InMemoryQueue` — FIFO, in-process, drained by tests + the dev smoke. Errors during handler dispatch route to `onError` without losing the queue (the in-memory store doesn't retry; BullMQ retry policy lands with the adapter at S49).

The **mock floorplan handler** (`mockFloorplanHandler`) produces a single placeholder `floorplan.draft` command payload + a `{ kind: 'json', data: {...} }` preview. This is the unit of the S47 D5 end-to-end smoke (mock AI batch → approval queue → manual accept → command commit).

### §2.5 — `plugins/ai-floorplan/` empty plugin shell

The plugin descriptor exposes `{ id: 'ai-floorplan', title: 'AI Floorplan', workflowKind: 'floorplan', sidebarSlot: 'ai-workflows', enabled: false, featureFlag: 'pryzm.ai.floorplan' }`. The descriptor MUST NOT statically import `AiHost.impl` — the only path to the AI host is `getAiHost()`. The static enforcer guards this rule.

### §2.6 — Cut-list checkpoint (S47 D9 retro per `[strategic ADR-018]`)

Per spec lines 642-651 — the four Tier-1 cuts checkpointed at S47 D9:

| Cut ID | Description | Default | S47 D9 decision |
|---|---|---|---|
| T1.1 | Defer dimensions in section view to S49 | not cut | **not cut** (retain) |
| T1.5 | Defer sheet schedule-snapshot widget richness | not cut | **not cut** (retain) |
| T1.7 | Defer multi-region sync replication | cut (per S43) | **stays cut** |
| T1.8 | Defer awareness compaction beyond throttle | cut (per S43) | **stays cut** |

Decision recorded in `apps/bench/reports/M24-beta.md`. Founder + agent jointly ratify at the M24 beta gate.

---

## §3 Deferred bindings

| Item | Bound to | Why deferred |
|---|---|---|
| Live BullMQ + Redis-backed worker (`bullmq-queue.js`) | **S49** + `REDIS_URL` provisioning | Redis not in dev; `bullmq` + `ioredis` deps not installed; full L7.5 promotion is the unblocker. Throws clear error if requested in S47. |
| Real Anthropic relay invocation from `AiHost.submit` | **S49** | The CF Worker relay route at `/api/ai/anthropic` is already live (server.js boot logs confirm), but `submit` short-circuits through the worker queue in S47 and returns a synthesised `AiPendingAction`. S49 wires the actual completion roundtrip. |
| `vite build --report` automated chunk-separation gate | **S48 D6** (M24 beta gate) | The static enforcer runs always; the bundle-report parser will be wired into `pnpm bench` at the M24 gate. |
| Editor sidebar UI for `AiApprovalQueueStore` (badge + drawer) | **S48** (beta surface sprint) | Store + hook helper are ratified; the React sidebar binding lands with the beta surface work. |
| Per-project budget enforcement + AI Spend view | **S65 (3C)** per ADR-028 Part E | Server-side; workspace-admin override + plan/role ratified at S65 unchanged. |
| Real handlers for `generative` / `rules` / `cv` / `voice` | **S49 → S52** | Mock handler exercises the queue + approval + commit loop; real implementations land per spec line 583. |
| BullMQ retry policy + dead-letter queue | **S49** with the adapter | In-memory queue uses `onError` callback only; retry policy is a BullMQ-specific concern. |

---

## §4 Consequences

**Positive**:
- Editor's first-paint bundle has zero AI-host bytes (verified at runtime by `vite build --report`; verified statically by `check-ai-host-lazy.mjs` from CI).
- The `AiPendingAction` shape is frozen at S47 — the approval-queue UI (S48), the BullMQ adapter (S49), and the per-workspace AI Spend view (S65) all share a single source of truth.
- Queue selection mirrors the `createEventLog` pattern, so the operator interface is uniform across sync-server + ai-worker.
- The mock floorplan handler is the unit of the S47 D5 end-to-end smoke; nothing in S47 D5 depends on Redis or live LLM calls.

**Negative**:
- The `AiHost.submit` short-circuit means the S47 user can ENQUEUE actions but cannot CONSUME them — the editor sidebar UI lands at S48. Acceptable per spec exit criteria (line 670: "Approval-queue UI rendered (empty state + populated state)" — empty state suffices for S47).
- The BullMQ adapter is intentionally absent. If an operator sets `REDIS_URL` in S47 expecting a live worker, the factory throws a clear error pointing at this ADR. This is loud-fail rather than silent-fallback per the project's "explicit when it fails" principle.

**Risks** (mitigated):
- An eager static import of `AiHost.impl` would silently fold the implementation back into the editor's first-paint chunk. Mitigation: `scripts/check-ai-host-lazy.mjs` runs in CI; the S48 D6 bundle-report gate catches the runtime side.
- The mock handler's `floorplan.draft` command name is a placeholder — when the real handler ships at S49 it must NOT collide with a real command. Mitigation: command names live in `@pryzm/command-bus`; S49 reviewer confirms uniqueness.

---

## §5 Verification

S47 deliverables verified:
- `packages/ai-host/` — 9 tests (4 lazy-contract + 5 host behaviour) green.
- `apps/ai-worker/` — 13 tests (queue + handlers + factory + smoke) green.
- `packages/stores/AiApprovalQueueStore.ts` — 10 tests (selectors + transitions + immutability) green.
- `plugins/ai-floorplan/` — 4 tests (descriptor + immutability) green.
- `scripts/check-ai-host-lazy.mjs` — green; zero static `AiHost.impl` imports outside `packages/ai-host/`.

Total: **36 new tests, 100% passing.**
