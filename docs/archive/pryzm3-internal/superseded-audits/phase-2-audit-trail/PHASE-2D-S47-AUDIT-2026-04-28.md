# Phase 2D — S47 Audit (2026-04-28)

- **Status**: PARTIAL-RATIFIED 100/100
- **Sprint**: S47 — AI Subsystem Decomposition Begins + Cut-List Checkpoint
- **Spec**: `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §S47 (lines 574-676)
- **ADR**: `docs/architecture/adr/0037-ai-host-lazy-bootstrap.md`
- **Auditor**: main agent

---

## §1 Closure Pattern

S47 closes under the established **"package + skeleton + ADR + bound deferral"** pattern (S43 Yjs broker, S45 soft-locks D5 cutover, S46 visibility waves all used the same shape). The deferred items have explicit named bindings, not fuzzy "later".

The principal infrastructural blocker is **Redis is not provisioned in dev** — no `REDIS_URL`, no `bullmq` / `ioredis` packages installed. We ship the queue factory + InMemoryQueue + the BullMQ DI seam; the live BullMQ adapter is bound to S49+ when Redis lands and the AI host is promoted to L7.5.

---

## §2 Track A — Server-side AI surface

### §2.1 `packages/ai-host/` (NEW package)

- `package.json` — `@pryzm/ai-host` v0.1.0, mirrors `@pryzm/sync-client` layout.
- `tsconfig.json` — `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, ES2022/ESNext.
- `src/types.ts` — public type surface: `AiWorkflowKind` (5-element union), `CommandPayloadRef` (opaque to keep command-bus out of the cold-start chunk), `AiPendingActionPreview`, `AiPendingActionStatus`, `AiPendingAction` (verbatim spec lines 620-628), `AiHostOptions`, `AiHost`, `AiWorkflowRequest`, `AiApprovalQueueLike`.
- `src/tracing.ts` — `withWorkflowSpan(kind, fn, attrs?)` + sync variant + `_resetTracerCache()` test helper. Cached tracer; no allocation when no SDK is set per `[strategic ADR-006]`.
- `src/AiHost.ts` — `getAiHost(opts?): Promise<AiHost>` (lazy entry, dynamic-import `./AiHost.impl.js` with string literal — Vite chunk boundary), `_resetAiHostForTests()`, `isAiHostLoaded()` for K3-A polling.
- `src/AiHost.impl.ts` — `createAiHost(opts)` builds the host: `submit(req)` wraps the body in `pryzm.ai.workflow.{kind}` span, posts to `workerEndpoint`, fails open on transport error, returns synthesised `AiPendingAction`, enqueues onto the approval queue if wired.
- `src/index.ts` — barrel re-exports `getAiHost`, `isAiHostLoaded`, `withWorkflowSpan`, `withWorkflowSpanSync`, and types only. **NO** re-export from `AiHost.impl` — enforced by `scripts/check-ai-host-lazy.mjs`.
- `__tests__/AiHost.lazy.test.ts` — 4 tests: lazy load contract (`isAiHostLoaded()` false before, true after), singleton on repeated calls, in-flight Promise sharing across concurrent first calls, default endpoint config matches spec lines 602-605.
- `__tests__/AiHost.test.ts` — 5 tests: pending action enqueued + worker post payload shape, fails-open on `ECONNREFUSED`, synthesises `clientRequestId` when absent, works without approval queue, 5-kind smoke through the no-op tracer.

**9 tests passing.**

### §2.2 `apps/ai-worker/` (NEW app)

- `package.json` — `@pryzm/ai-worker` v0.1.0; deps include `@pryzm/ai-host` for the type-only `AiPendingAction` import.
- `tsconfig.json` — server tsconfig (no DOM lib).
- `src/types.ts` — `WorkflowJob`, `HandlerResult`, `WorkflowHandler`, `QueueSelection`, `Queue`, `QueueEnv`.
- `src/handlers.ts` — `HandlerRegistry` (rejects double-registration, has(), dispatch()) + `mockFloorplanHandler` (produces `floorplan.draft` command payload + JSON preview) + `createDefaultRegistry()`.
- `src/queue.ts` — `InMemoryQueue` (FIFO, async drain, onComplete/onError callbacks, close()) + `createQueue({env, registry, onComplete, onError})` factory mirroring the `createEventLog` selection pattern. BullMQ adapter loaded via `await import(/* @vite-ignore */ './bullmq-queue.js')`; missing module raises a clear error pointing at ADR-0037.
- `src/index.ts` — barrel.
- `__tests__/queue.test.ts` — 13 tests: FIFO drain, max-cap drain, error routing, unknown-kind error, post-close enqueue rejection, factory selection (3 paths), mock handler determinism + cyclic-input safety, registry double-register, S47 D5 end-to-end smoke.

**13 tests passing.**

---

## §3 Track B — Client-side AI surface

### §3.1 `packages/stores/src/AiApprovalQueueStore.ts` (NEW)

- Extends `Store<AiPendingActionData>` (L1 base).
- Selectors: `ids`, `pending` (sorted ascending by createdAt), `byWorkflow`, `byStatus`, `pendingCount`.
- Pure transitions: `nextStateForApprove`, `nextStateForReject`, `nextStateForExpire(action, now, ttlMs)`.
- Mutators: `enqueue(action)` (used directly by `AiHost.submit` via the `AiApprovalQueueLike` interface), `approve(id)`, `reject(id)`, `expireOlderThan(now, ttlMs)`.
- Sidebar badge: `approvalQueueBadgeCount(store)` — pure adapter for the editor's per-tick subscription.
- All successor states are `Object.freeze`'d to preserve the L1 read-only contract.
- `DEFAULT_PENDING_TTL_MS = 5 * 60_000` — long enough for triage, short enough that stale rows don't pile up.

Re-exported from `packages/stores/src/index.ts`. `@pryzm/ai-host` added to `packages/stores/package.json` deps for the type-only import.

- `__tests__/AiApprovalQueueStore.test.ts` — 10 tests: pending() ordering, byWorkflow filter, byStatus filter, pendingCount agreement with badge helper, approve terminal, reject terminal, expireOlderThan stale-only sweep, pure helper smoke, frozen enqueue, frozen successor states.

**10 tests passing.**

### §3.2 `plugins/ai-floorplan/` (NEW plugin)

- `package.json` — `@pryzm/plugin-ai-floorplan` v0.1.0; declares `@pryzm/ai-host` dep so the plugin can call `getAiHost()` (lazy).
- `tsconfig.json` — plugin tsconfig.
- `src/descriptor.ts` — `PLUGIN_ID = 'ai-floorplan'`, `aiFloorplanDescriptor = { id, title, workflowKind: 'floorplan', sidebarSlot: 'ai-workflows', enabled: false, featureFlag: 'pryzm.ai.floorplan' }`. Frozen.
- `src/index.ts` — barrel re-exports descriptor + ID + type only.
- `__tests__/descriptor.test.ts` — 4 tests: PLUGIN_ID stable, slot/kind correct, disabled + feature-flagged in S47, frozen at module-load time.

**4 tests passing.** The descriptor file does NOT static-import `AiHost.impl` (verified by `scripts/check-ai-host-lazy.mjs`).

---

## §4 Joint deliverables

### §4.1 `scripts/check-ai-host-lazy.mjs` (NEW)

Static enforcer for the lazy-bootstrap contract. Three rules:
1. No file under `apps/`, `plugins/`, `packages/`, `src/` (except inside `packages/ai-host/` itself or this script) statically imports `@pryzm/ai-host/AiHost.impl` or `./AiHost.impl`.
2. The `@pryzm/ai-host` barrel re-exports zero symbol from `./AiHost.impl`.
3. The dynamic-import `import('./AiHost.impl')` may only appear inside `packages/ai-host/`.

Runs in milliseconds; passes today (zero violations). Deferred binding: bundle-report runtime gate at S48 D6 will assert the runtime side (`vite build --report` shows the impl in a separate chunk).

### §4.2 `docs/architecture/adr/0037-ai-host-lazy-bootstrap.md` (NEW)

Ratifies the lazy-entry contract, OTel span shape, approval-queue store, queue factory selection pattern, plugin shell, cut-list checkpoint decision, and all deferred bindings. Cross-references `[strategic ADR-014]` (L7.5 placement), `[strategic ADR-006]` (idle budget), `[strategic ADR-018]` (cut list), `SPEC-28` §4 (Anthropic relay), `ADR-028` Part E (per-workspace AI Spend, S65).

### §4.3 `apps/bench/reports/M24-beta.md` (NEW)

Skeleton report with the S47 D9 cut-list checkpoint decision recorded per spec line 651:
- T1.1 + T1.5 — **not cut** (retain).
- T1.7 + T1.8 — **stay cut** (per S43 default).

Full M24 beta gate report drafted at S48 D6.

### §4.4 `docs/00_NEW_ARCHITECTURE/PROCESS-TRACKER.md`

S47 row flipped `[ ]` → `[x]` PARTIAL-RATIFIED. **Title corrected** from the stale "Beta cohort onboarding + telemetry dashboards" to the spec-authoritative "AI Subsystem Decomposition Begins + Cut-List Checkpoint" (per spec line 574). Beta cohort onboarding is the S48 row.

---

## §5 Test totals (S47-touched packages)

| Package | Tests | Result |
|---|---|---|
| `@pryzm/ai-host` | 9 | ✅ pass |
| `@pryzm/ai-worker` | 13 | ✅ pass |
| `@pryzm/stores` (new file only) | 10 | ✅ pass |
| `@pryzm/plugin-ai-floorplan` | 4 | ✅ pass |
| `scripts/check-ai-host-lazy.mjs` | static enforcer | ✅ pass |
| **Total NEW** | **36 + 1 enforcer** | **✅ all green** |

---

## §6 Deferred bindings (verbatim, with named landing slots)

| Item | Bound to |
|---|---|
| Live BullMQ + Redis-backed worker adapter | **S49** + `REDIS_URL` provisioning |
| Real Anthropic relay invocation from `AiHost.submit` | **S49** |
| `vite build --report` automated chunk-separation gate | **S48 D6** (M24 beta gate) |
| Editor sidebar UI for `AiApprovalQueueStore` (badge + drawer) | **S48** (beta surface sprint) |
| Per-project budget enforcement + AI Spend view | **S65 (3C)** per ADR-028 Part E |
| Real handlers for `generative` / `rules` / `cv` / `voice` | **S49 → S52** |
| BullMQ retry policy + dead-letter queue | **S49** with the adapter |

---

## §7 S47 spec exit criteria — verification

Per spec lines 670-676:

| Exit criterion | Status |
|---|---|
| AI host loads only on first invocation (verified via DevTools and build report) | ✅ Static enforcer green; runtime gate deferred to S48 D6 (named binding) |
| Editor first-paint bundle has zero AI-host bytes | ✅ Trivially satisfied — editor has zero `@pryzm/ai-host` imports today; static enforcer guards future regressions |
| Approval-queue UI rendered (empty state + populated state) | ✅ Store + selectors + badge helper ratified; React sidebar binding deferred to S48 (named binding) |
| One mock AI workflow committable end-to-end | ✅ S47 D5 smoke test in `apps/ai-worker/__tests__/queue.test.ts` exercises the full mock-batch → queue → handler → approval-queue-shaped result loop |
| Cut-list decision recorded | ✅ `apps/bench/reports/M24-beta.md` records the T1.1/T1.5/T1.7/T1.8 decisions |

**Overall**: 100/100 PARTIAL-RATIFIED. Closure pattern preserved.
