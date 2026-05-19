# ADR-005 — Worker Pool Policy

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `05-IMPLEMENTATION-PLAN.md §17` row ADR-005 |
| Required by | Sprint S01 (Phase 1A — first bake worker spawned) |
| Owner | Architecture lead |
| Implementation | Browser: `packages/worker-pool-browser/`. Server: `apps/bake-worker/` + BullMQ. |
| Spec dependency | `SPEC-01-GEOMETRY-KERNEL.md` §8, `SPEC-02-PERSISTENCE.md` §5 |

---

## Context

PRYZM 2 has two distinct worker concerns:

1. **Browser** — geometry baking, edge projection, IFC/DXF parse, snapshot serialisation, plugin sandboxes (per ADR-009). Under-provisioned: kills frame-rate. Over-provisioned: thrashes the main thread context-switching.
2. **Server** — bake-on-server (large project open, headless `@pryzm/headless`, AI batch commits, IFC/DXF/PDF export, audit-log spillover). Must be durable (R2-backed) and observable (OTel spans + Tempo).

`08-VISION §3` mandates "Workers everywhere by default; main thread is render-only." `10-MASTER-IMPLEMENTATION-PLAN-36M.md` row ADR-005 mandates "Browser: Web Worker per task, max 4 concurrent. Server: BullMQ + Node `worker_threads`, R2-backed durable queue."

The corpus also presents an alternative ("Dynamic = `hardwareConcurrency - 1`, min 2 max 8") in `05-IMPLEMENTATION-PLAN.md §17`. The two are reconciled here.

---

## Decision

### Browser pool — `packages/worker-pool-browser/`

- **One pool of Web Workers per concern** (kernel, projection, sandbox, parser).
- **Capacity:** `min(4, max(2, navigator.hardwareConcurrency - 2))`.
  - Floor: 2 (so the pool can interleave a long bake with an interactive snap).
  - Ceiling: 4 (above this, context-switching costs erase the gain on consumer hardware; measured on M1, i7-12700, and a Pixelbook).
  - Reserves at least 2 cores for the main thread (render + audio + GC).
- **Scheduling:** priority queue. Priority levels: `interactive` (snap, picking) > `bake` (geometry chunks) > `background` (snapshot, parse).
- **Cancellation:** every job carries an `AbortSignal`. Stale interactive jobs are cancelled when a newer interactive job from the same view arrives.
- **Plugin sandbox workers** (per ADR-009) are **separate** from the kernel pool; their concurrency is per-plugin (heap-isolated) and not counted against the kernel ceiling.
- **First-paint priority:** during the first 1500 ms after project open, the pool prioritises chunks visible in the initial camera frustum.

### Server pool — `apps/bake-worker/` + BullMQ

- **Queue:** BullMQ, R2-backed durable (Redis for metadata; payloads spill to R2 above 64 KiB).
- **Workers:** Node `worker_threads`. One Node process per pod; each pod runs `min(8, max(2, os.cpus().length - 1))` worker threads.
- **Job kinds:** `bake.chunk`, `parse.ifc`, `parse.dwg`, `export.pdf`, `export.dxf`, `export.ifc`, `ai.batch.commit`, `audit.spillover`. Per-kind concurrency caps in BullMQ config.
- **Backpressure:** queue depth per project capped at 1000; above that, new jobs return `429` to the API and the client retries with backoff.
- **Idempotency:** every job carries an idempotency key (event ULID for bake jobs; export ID for export jobs); duplicates are deduplicated.
- **Observability:** every job emits OTel spans `worker.<kind>.start` + `worker.<kind>.end`; Tempo retains 7 days; failed jobs alert on >1% error rate over 5 min.

### Why the policies differ
- The browser is shared with rendering and the user; we pay for context switches in dropped frames. Hard cap at 4.
- The server is dedicated; we pay only in latency. Cap is `cpus - 1` per pod, scale horizontally.

---

## Consequences

**Positive:**
- Predictable browser frame budget on consumer hardware.
- Server scales horizontally without changing the worker code.
- Cancellation semantics prevent stale interactive work from blocking fresh input.
- One mental model per environment (browser pool / server queue).

**Negative:**
- Two distinct pool implementations to maintain.
- Cap of 4 in the browser leaves headroom on workstation-class machines; mitigated by an opt-in "high-performance mode" that lifts the cap to `hardwareConcurrency - 1` for power users (off by default; settings UI in S60).
- BullMQ adds Redis to the self-host stack (already present per ADR-012, so net-new is zero).

---

## Alternatives considered

### Single pool implementation across browser + server
- Rejected: Web Workers and `worker_threads` differ in transferable semantics, durable-queue support, and lifecycle. A unified abstraction would either be lowest-common-denominator (no transferables) or leak both APIs.

### Fixed-size browser pool of 4
- Considered. Simpler. Rejected because 2 cores is a real constraint on low-end Chromebooks; floor-of-2 keeps interactivity acceptable there.

### `hardwareConcurrency - 1` browser cap
- Rejected for the default. Becomes 7 on an i7; render frames suffer. Available as the opt-in high-performance mode.

### Server: per-process workers (no `worker_threads`)
- Rejected: cold start cost is too high for sub-second jobs (snap, micro-bake on the headless server).

### Cloudflare Queues instead of BullMQ
- Rejected for v1: ties scheduling to Cloudflare; D7 (self-host) cannot use it.

---

## Phase rollout
- S01 — `packages/worker-pool-browser/` skeleton; 2 worker minimum; kernel pool only.
- S04 — server BullMQ wired; bake-worker accepts first job.
- S08 — projection and sandbox pools added in browser; cancellation paths live.
- S22 (M12 alpha) — first-paint priority active; OTel spans in place.
- S43 — AI-batch jobs flow through the server queue (per SPEC-07).
- S48 (M24 beta) — backpressure 429 enforced; alerts on error rate live.
- S60 — opt-in browser high-performance mode shipped.
- S72 (M36 GA) — load-tested at 50 concurrent users per project; scale-out validated.
