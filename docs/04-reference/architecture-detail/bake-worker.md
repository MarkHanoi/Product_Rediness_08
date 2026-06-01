# Bake Worker — ops runbook

> Status: **v0 — shipped in S21 (Q4 M10–M12)**.
> Spec: `docs/03_PRYZM3/reference/phases/PHASE-1/1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md` lines 615–885.
> Strategic ADRs implemented: `[ADR-003] storage driver isolation`, `[ADR-005] worker-pool sizing`, `[ADR-010] 250 ms bake debounce`.

The **bake worker** receives event batches from the sync server, replays them
in a headless geometry session, and emits content-addressed `.glb` chunks to
the storage driver.  It runs as a stand-alone Node process (`apps/bake-worker/`)
and is the first deployment of `@pryzm/headless` in a server-side context.

---

## 1.  Process model

```
┌─────────────────────────┐        ┌────────────────────┐
│  Sync server (S22 D2)   │  POST  │   Bake worker      │
│  /enqueue-event-batch   │ ─────► │  POST /enqueue     │
└─────────────────────────┘        │                    │
                                   │  CoalesceWindow    │ ◄── 250 ms debounce
                                   │     (per-level)    │     [ADR-010]
                                   │         ↓          │
                                   │  BakeQueue         │ ◄── BullMQ (S22 D2)
                                   │     (in-memory)    │     in-memory by default
                                   │         ↓          │
                                   │  RebakeChunkJob    │
                                   │  • new session     │
                                   │  • replay events   │
                                   │  • produceWall…    │
                                   │  • ChunkWriter     │
                                   │  • storage.put()   │ ◄── ADR-003 driver
                                   │  • signed URL      │
                                   └────────────────────┘
```

### Worker-pool sizing — `[strategic ADR-005]`
- Default: `os.cpus().length - 1` (clamped to `≥ 1`).  One core is reserved
  for the BullMQ main loop / Express request handlers.
- Override: `defaultConcurrency()` exported from
  `apps/bake-worker/src/queue/createQueue.ts`; constructor accepts
  `{ concurrency }` for tests + benches.

---

## 2.  Endpoints

| Method | Path        | Purpose                                                     |
|--------|-------------|-------------------------------------------------------------|
| POST   | `/enqueue`  | Accepts `{ projectId, levelId, events[] }`.  Coalesces.     |
| GET    | `/health`   | Liveness + concurrency snapshot + queue + coalescer counts. |
| GET    | `/cost`     | Cost-meter summary (per-event USD + Class A/B totals).      |
| GET    | `/stats`    | Combined queue + coalescer + storage + cost snapshot.       |

Default port: `BAKE_PORT` env var, fallback `4001`.

`POST /enqueue` returns immediately after the events are accepted into the
coalescer — it does NOT wait for the bake to finish.  The editor learns about
new chunks via the manifest broadcast channel (S22 D3).

---

## 3.  Queue topology

The queue interface (`apps/bake-worker/src/queue/types.ts`) is a strict subset
of BullMQ.  Two implementations satisfy it today:

| Selection | When                                              |
|-----------|---------------------------------------------------|
| `memory`  | Default; no Redis dependency.  Used in dev, CI,   |
|           | the Replit container, and the bench harness.      |
| `bullmq`  | Production opt-in (S22 D2 — wired against `bullmq`|
|           | + `ioredis` once `REDIS_URL` is set).             |

Today (S21), `REDIS_URL` is honoured by the factory and falls through to the
in-memory queue with a clear warning log.  S22 D2 lands the BullMQ adapter
and removes the warning.

```text
┌─────────────────────────────┬──────────────────────────────────┐
│ env                         │ queue selection                  │
├─────────────────────────────┼──────────────────────────────────┤
│ no REDIS_URL                │ InMemoryBakeQueue                │
│ BAKE_QUEUE=memory           │ InMemoryBakeQueue (forced)       │
│ REDIS_URL set, S21          │ InMemoryBakeQueue (warn-fallback)│
│ REDIS_URL set, S22+         │ BullMQBakeQueue                  │
└─────────────────────────────┴──────────────────────────────────┘
```

---

## 4.  Storage driver — `[strategic ADR-003]`

The bake worker imports `@pryzm/storage-driver` only — it never references
`@aws-sdk/client-s3`, R2 SDKs, or any cloud-specific surface directly.  This
keeps the bake-worker app drop-in replaceable across:

* `InMemoryStorageDriver` — default; backs all dev/test/bench runs.
* `R2StorageDriver`       — opt-in via `R2_ACCOUNT_ID`; lazily resolves the
  `@aws-sdk/client-s3` runtime peer dep (install at deploy time).
* Future drivers (MinIO, S3, GCS) — a single `createStorageDriver()` env
  switch covers them; bake worker does not change.

| env                          | Selected driver        |
|------------------------------|------------------------|
| no `R2_ACCOUNT_ID`           | `InMemoryStorageDriver`|
| `STORAGE_DRIVER=memory`      | `InMemoryStorageDriver`|
| `R2_ACCOUNT_ID` set          | `R2StorageDriver`      |

R2 driver requires (when in use):
* `R2_ACCOUNT_ID`
* `R2_ACCESS_KEY_ID`
* `R2_SECRET_ACCESS_KEY`
* `R2_BUCKET`
* Optional: `R2_PUBLIC_BASE_URL` (for signed URL prefixing)

---

## 5.  Coalescing — `[strategic ADR-010]`

* **Window**: 250 ms trailing-edge debounce per `(projectId, levelId)` key.
  See `apps/bake-worker/src/coalescing/CoalesceWindow.ts` and the
  implementation log in `bake-worker-impl-log.md`.
* **Hard cap**: 1500 ms — events that keep arriving for the same key force
  a flush after the cap regardless of the trailing edge.
* **Sort**: events are sorted by ULID before flushing — protects against
  network reorder between sync server → bake worker.
* **Exit gate** (S21 #2): "20 edits / 500 ms → ≤ 2 jobs" — covered by
  `apps/bake-worker/__tests__/CoalesceWindow.test.ts`.

### SIGTERM behaviour — exit gate #3
On SIGTERM the entry point:
1. Calls `coalescer.flushAll()` (every pending bucket flushes immediately).
2. Calls `queue.drain(5_000)` (waits up to 5 s for in-flight jobs).
3. Closes the queue and disposes the storage driver.
4. Closes the HTTP server.

If the drain timeout elapses, the worker logs a warning and exits anyway —
the next bake worker instance picks up the un-acked events from the durable
log (sync server is the source of truth).

---

## 6.  OTel spans — exit gate #4

Three spans, all under the `@pryzm/bake-worker` tracer name:

| Span name              | Purpose                                                  |
|------------------------|----------------------------------------------------------|
| `pryzm.bake.enqueue`   | Coalescer ingress — captures `projectId`, `eventCount`.  |
| `pryzm.bake.chunk`     | Per-job pipeline — captures `previousChunkHash`,         |
|                        | `eventCount`, `byteLength` of the produced chunk.        |
| `pryzm.bake.r2-upload` | Wraps the storage-driver `put()` call only.              |

A fourth span `pryzm.bake.shutdown` covers SIGTERM flushes for ops triage.

---

## 7.  Cost model — exit gates #5 + #10

`apps/bake-worker/src/cost/CostMeter.ts` maintains a per-job R2 cost ledger
seeded by the storage driver's `stats()` snapshot.  Every job emits a
`bake.event.cost` OTel event with these attributes:

```
pryzm.bake.cost.classBOps           // PUT / LIST count
pryzm.bake.cost.classAOps           // GET / HEAD count
pryzm.bake.cost.bytesUploaded
pryzm.bake.cost.bytesDownloaded
pryzm.bake.cost.opCostUsd           // delta in USD
pryzm.bake.projectId
pryzm.bake.levelId
pryzm.bake.jobId
```

Pricing (`R2_PRICING` const in the same file):
* Class B (write/list): **$0.36 / 1M ops**
* Class A (read):       **$0.36 / 10M ops**
* Storage:              **$0.015 / GB-month** (not billed per-event;
                         tracked from the manifest's `byteLength`)
* Egress:               **$0** (R2 has no egress charge)

100 jobs / hour ≈ 100 Class B ops / hour ≈ **$2.59 / month** in op fees
(compared to ≥ $30 / month savings vs S3 egress) — comfortably inside the
`[strategic ADR-018]` cut-list pricing envelope.

---

## 8.  Hydration codepath — `loadFromChunk`

`packages/persistence-client/src/chunks/HydrateFromChunk.ts` ships in S21
as the **diagnostic-grade** hydration surface.  The bake worker uses it
to compute incremental-bake deltas but does NOT use it to populate stores.

Full element-store hydration (Wall, Slab, Door, …) is deferred to **S23
D1** (the tier-streamed loader) — that sprint ships ONE shared codepath
consumed by:
1. The editor cold-load path (chunks → THREE meshes).
2. The bake worker's incremental path (chunks → re-bake input).

Until S23, the bake worker re-runs full event-batch replay on a fresh
session per job.  This satisfies the < 1.5 s exit gate for the
single-edit case.  See "Known limitations" below.

---

## 9.  Bench gate

`apps/bench/src/benches/bake-incremental.bench.ts`

* **Bench name**: `bake.incremental.single-wall-edit`
* **Samples**: 8 (+ 2 warmup)
* **Budget**: `warnMs: 1000`, `budgetMs: 1500`, `hardFail: true`
* **Baseline**: `apps/bench/baseline.json`

---

## 10.  Known limitations (v0)

1. **Full-replay per job.**  The bake worker rebuilds the wall store from
   the event batch on every job.  For the single-event case that's fine
   (< 50 ms locally).  For the K1D-2 production-scale check (5K-wall
   fixture < 30 s incremental rebake) we need real chunk → store
   hydration, which lives with the tier-streamed loader (S23 D1).  This
   is documented as deferred in the S21 sprint plan footnote.
2. **No level joins.**  The bake worker invokes `produceWall` with
   `NO_JOINS` — wall miters are flat caps in baked chunks.  The
   neighbour-resolution layer wires in S22 D2 alongside the LevelStore.
3. **All walls at floor 0.**  `worldY = 0` is hard-coded; level elevation
   lookup also lives with the LevelStore (S22 D2).  The K1D-2 fixture is
   single-level so this is benign.
4. **In-memory queue only.**  `REDIS_URL` is honoured by the factory but
   falls through to InMemoryBakeQueue with a warning until the BullMQ
   adapter ships in S22 D2.

These are not regressions — they are explicit S21 scope.  None of the v0
exit criteria depend on them.

---

## 11.  Boundary lint

`@pryzm/bake-worker` may import from:
* `@pryzm/storage-driver`     (driver isolation — ADR-003)
* `@pryzm/persistence-client` (ChunkWriter only)
* `@pryzm/command-bus`        (CommandBus + PatchEmitter)
* `@pryzm/geometry-kernel`    (produceWall + NO_JOINS)
* `@pryzm/plugin-wall`        (handlers + WallStore)
* `@pryzm/protocol`           (StoreId, Patch types)
* `@pryzm/schemas`            (Wall via plugin transitively)
* `@pryzm/stores`             (transitively via plugin-wall)
* `express`, `ulid`, `@opentelemetry/api`

It MUST NOT import `@aws-sdk/*`, `bullmq`, `ioredis` directly — those
runtime peer deps are loaded inside the `@pryzm/storage-driver` and
`apps/bake-worker/src/queue/createQueue.ts` factories respectively.

---

## 12. Production deployment (W-07 / S22 follow-up)

The `apps/bake-worker` module ships **two** storage drivers via the
factory in `@pryzm/storage-driver`:

| Driver               | Selected when                                   | Backing store           |
|----------------------|--------------------------------------------------|--------------------------|
| `InMemoryStorageDriver` | none of `R2_*` env vars are set (default)     | per-process `Map`        |
| `R2StorageDriver`       | all four `R2_*` env vars set + peer dep installed | Cloudflare R2 / MinIO   |

### Required env vars

```
R2_ACCOUNT_ID=<cloudflare account id>
R2_ACCESS_KEY_ID=<r2 access key>
R2_SECRET_ACCESS_KEY=<r2 secret>
R2_BUCKET_NAME=<bucket>
```

### Peer dependency

`@pryzm/storage-driver` declares `@aws-sdk/client-s3` as an **optional
peer dependency**.  The bake-worker repo does NOT install it by
default — that keeps unit/dev/test installs lean (~ 8 MB transitive
saved).

To enable the live R2 path on a deployment target:

```bash
pnpm --filter @pryzm/storage-driver add -D @aws-sdk/client-s3
```

Or, more commonly, install it as a top-level dep of the deploy image:

```bash
pnpm add @aws-sdk/client-s3
```

The driver's `put()` / `get()` lazy-imports `@aws-sdk/client-s3` on
first call.  Without it installed, both methods throw a deterministic
`StorageDriverError` whose message points at this section — production
operators see the install command immediately.

### Smoke-testing a deployment

`packages/storage-driver/__tests__/r2-driver-smoke.test.ts` contains a
`describe.skipIf(!HAS_LIVE_R2)` block that runs a `put → get` round-
trip when the four `R2_TEST_*` env vars (note the `_TEST_` prefix to
avoid leaking prod creds) are populated.  CI without those vars stays
green; the deploy pipeline can run

```bash
R2_TEST_ACCOUNT_ID=$R2_ACCOUNT_ID \
R2_TEST_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID \
R2_TEST_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY \
R2_TEST_BUCKET_NAME=$R2_BUCKET_NAME \
pnpm --filter @pryzm/storage-driver test
```

against the staging bucket immediately after a deploy.

### Bake-worker fallback rule

`apps/bake-worker/src/index.ts` calls `createStorageDriver({ env })`
once at boot.  When the env vars are absent (CI, dev, integration
tests) the factory returns an `InMemoryStorageDriver` and logs a
single `[bake-worker] storage=in-memory (no R2 env)` info line.  This
is the documented path for local development — chunks live for the
process lifetime and are GC'd at shutdown.
