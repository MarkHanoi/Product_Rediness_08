# PRYZM FULL SYSTEM AUDIT
### Architecture, performance and scalability review against a 1,000-concurrent-user target
**Date:** 2026-08-09 · **Scope:** whole repository, both halves (`server.js` BFF + layered TS client) · **Method:** execution-path tracing from code, not from docs

---

## Executive Summary

PRYZM's **client architecture is genuinely good** and better than most codebases of this size. The
8-layer rule is real and CI-enforced, P2 (single THREE owner) and P3 (single rAF) survive a
grep-level audit with only the sanctioned adapter and a deliberate `.bad.ts` fixture, the
`CommandBus` is a single clean dispatch path with spans, patch envelopes and undo routing, and
`Store<T>` is a well-designed Map + Immer-patch + batched-`DirtyDiff` base. There are 1,838 test
files and 68 named benches. This is not a system that "works by accident."

**The production deployment is a different system entirely, and it is not close to 1,000 users.**

The verdict is decided before any code smell is considered, by three facts that are each
independently disqualifying:

1. **The whole product runs on one Fly machine: `shared-cpu-1x`, 1 CPU, 512 MB RAM,
   `min_machines_running = 1`.** `fly.toml`'s own comment states the concurrency limits are
   "Tuned for ~50 concurrent live editors." 1,000 is 20× that, on a box that cannot be
   horizontally scaled (see #2). There is no autoscaling policy and no second machine.
2. **Collaboration cannot survive horizontal scaling, because there is no Socket.io adapter.**
   `redis` appears nowhere in the dependency tree. Rooms live in one process's memory. Add a
   second machine and two users in the same project silently stop seeing each other — a
   *correctness* failure, not a slowdown. Scaling out is therefore not merely untried; it is
   currently unsafe.
3. **Persistence is whole-document JSONB snapshots, not deltas.** The code's own measurement:
   *793 elements → ~16.6 MB serialize, twice per autosave fire*, on a 2.5 s debounce. Each save
   is a `JSON.stringify` on the client main thread, a ≤50 MB HTTP body, and a JSONB insert into
   an unbounded `project_versions` table behind a `FOR UPDATE` row lock — through a **pool of 10
   connections**. 100 concurrently-editing users of that size would demand roughly 660 MB/s of
   sustained JSONB write throughput. This does not degrade gracefully; it collapses.

Beyond capacity, the audit found a class of defect that matters more than performance:
**several major subsystems are authored but not wired**, and in each case the unwired state is
indistinguishable from the wired one at the UI.

- **Real-time collaboration is owner-only.** `canUserAccessProject()` (`server/projectAccess.js`)
  resolves access **purely by `owner_id`** and never reads `project_members`. Every non-owner is
  rejected at `join-project`. The `project_members` table, `projectMembers.js`, `permissions.js`
  roles, and the entire presence/cursor/remote-command surface exist — but in production the only
  person who can join a project room is the person who owns it. Multi-user collaboration, the
  headline capability, is currently **two tabs of the same account**.
- **The Yjs CRDT sync-server is written, tested (`apps/sync-server`, `packages/sync-client`,
  chaos harness included) and not deployed.** `engineLauncher.ts` says so in a comment: *"we do
  not have a deployed sync-server yet."* The flag is off and `VITE_SYNC_URL` is unset. What
  actually ships is a Socket.io command relay plus last-writer-wins full-snapshot saves.
- **On a database error, writes silently degrade to a volatile in-memory Map** and return
  success (`projectStore.js` `§SERVER-PG-DEGRADE`, create and delete paths). A user's project is
  created, appears in the list, and evaporates on the next deploy — with a 200 response
  throughout. This is the repo's own `§CONTEXT-DATA-HONESTY` failure mode, committed
  deliberately as a dev-productivity aid and still enabled in production.

**Verdict: 🔴 NOT READY** for 1,000 concurrent users. The gap is roughly 20–50× in capacity and
includes at least three architectural changes (stateful→stateless sessions, delta persistence,
scale-out-safe collaboration) that cannot be tuned into existence. A credible path exists and is
laid out in the roadmap; the realistic effort is **10–16 engineer-weeks** before a load test at
1,000 users is worth running.

Honest counterweight: the ceiling that is actually reachable today, with a handful of low-risk
fixes (indexes, pool sizing, a bigger VM), is on the order of **100–200 concurrent users**
provided documents stay small and genuine multi-user editing stays off. That is a real product,
just not the one the target describes.

**Two of the three disqualifying facts, and the owner-only collaboration defect, were already in
`ISSUE-LOG.md` before this audit began** (L-770, L-336, L-391 — see *Reconciliation* at the end).
They are re-confirmed here rather than rediscovered. The finding that matters is therefore not
"these problems exist" but that **L-336 has been open and labelled an architectural launch-blocker
since 2026-07-16, and L-770 carries a disposition of "acceptable for a closed beta" that the
1,000-user target retires.** The gap is a prioritisation decision, not a knowledge one.

---

## Architecture Overview

### The two halves

```
┌──────────────────────────── BROWSER ─────────────────────────────┐
│  L7.5 src/ (transitional)   L7 plugins/*(46)   L6 plugin-sdk     │
│  L5 apps/editor             L4 renderer / persistence-client /   │
│                                scene-committer                   │
│  L3 runtime-composer, stores, view-state, file-format,           │
│     sync-client, frame-scheduler                                 │
│  L2 geometry-kernel (manifold WASM), ai-host, constraint-solver  │
│  L1 command-bus, picking, snapping, renderer-three, spatial-index│
│  L0 schemas (pure Zod)                                           │
└───────────────┬──────────────────────────┬───────────────────────┘
                │ HTTPS /api/v1            │ WebSocket (Socket.io)
┌───────────────▼──────────────────────────▼───────────────────────┐
│  ONE Fly machine · fra · shared-cpu-1x · 1 CPU · 512 MB          │
│  server.js (6,418 lines) + 46 server/ modules                    │
│  Express BFF · Socket.io (in-process rooms) · tsx at runtime     │
└───────────────┬──────────────────────────────────────────────────┘
                │ pg Pool { max: 10 }
        ┌───────▼────────┐   ┌──────────────┐   ┌─────────────────┐
        │ Supabase PG    │   │ CF Worker    │   │ R2 / Supabase   │
        │ eu-central-1   │   │ (AI proxy)   │   │ Storage         │
        └────────────────┘   └──────────────┘   └─────────────────┘

NOT DEPLOYED: apps/sync-server (Yjs CRDT), apps/api-gateway, apps/ai-worker,
              apps/bake-worker, apps/export-worker
```

### The intended data flow (and it is real, on the client)

```
User action  →  Tool (input-host)
             →  commandBus.executeCommand(type, payload)      ← single entry point
             →  handler.canExecute()  [pure gate]
             →  handler.execute()     → { forward, inverse } Immer patches
             →  PatchEmitter.emit(EventRecord)
             →  UndoStack.push + RingBufferUndoStack.push
             →  attachStores → Store.applyPatch → DirtyDiff (batched per tick)
             →  scene-committer commitBatch  →  renderer-three
             →  FrameScheduler (single rAF)  →  paint
```

### Where the flow is inconsistent

| # | Inconsistency | Evidence |
|---|---|---|
| 1 | **A second, parallel mutation path still exists.** `commandManager.execute()` remains at ~236 grep-level sites. The CI ratchet (`scripts/check/ci-check-no-commandmanager.mjs`) enforces zero only in `packages/` and `plugins/` — **`apps/` is explicitly excluded** — so the legacy path is permanently legal in the largest consumer. | gate header, §"apps/ is L5; excluded from this gate's scan paths" |
| 2 | **Persistence bypasses the command flow entirely.** Nothing in the diagram reaches the server. Saving is a *separate*, out-of-band full-document serialize driven by DOM `window` events (`MUTATION_EVENTS`), not by the patch stream the bus already produces. The system computes perfect deltas and then throws them away. | `SaveOrchestrator.ts:216-227` |
| 3 | **Two frame loops, one of them vendor-owned and uncontrollable.** P3 holds for PRYZM code, but `@thatopen/components` runs its own `requestAnimationFrame` loop started by `components.init()`. `BimWorld.ts` wraps it defensively rather than owning it. | `BimWorld.ts:219-289`, `FrameCoordinator.ts:10` ("PRYZM runs two concurrent requestAnimationFrame loops") |
| 4 | **The CRDT branch of the flow is a stub in production.** `bus.setCrdtApplier()` exists and is called, but the Y.Doc it feeds is never synced to a server. | `engineLauncher.ts:854-891` |

---

## Critical Findings

The ten findings that decide the verdict, before the per-area detail.

**⟳ = pre-existing OPEN row in `ISSUE-LOG.md`, re-confirmed by this audit — not a new discovery.**
Four of the ten were already logged. That is a credit to the previous assessments, and it changes
the recommendation: the problem is not that these are unknown, it is that **the two most severe
(L-770, L-336) have been open since 2026-07-16 and 2026-08-08 while carrying an "acceptable for a
closed beta" disposition that the 1,000-user target retires.**

| ID | Sev | Title |
|---|---|---|
| **L-770** ⟳ | P0 | Single 512 MB / 1-shared-CPU machine **and** no Socket.io adapter — no scale-out path that preserves correctness |
| **L-336** ⟳ | P0 | Collaboration is owner-only: `project_members` never consulted by the access gate |
| **L-391** ⟳ | P0 | Yjs CRDT sync-server written, tested, undeployed; production collab is LWW |
| **L-786** | P0 | Full-document JSONB snapshot persistence (~16.6 MB / 793 elements / 2.5 s) |
| **L-787** | P0 | PG pool `max: 10` for the entire application |
| **L-789** | P0 | DB write errors degrade to a volatile in-memory Map and report success |
| **L-788** | P1 | `project_versions` missing the `(project_id, created_at DESC)` composite index |
| **L-790** | P1 | Rate limiting is per-IP and in-memory — wrong key, unshareable store |
| **L-442** ⟳ | P1 | Production transpiles ~100 TS packages at boot via `tsx`; no precompiled server |
| **L-794** | P1 | 319 `scene.traverse()` full-scene scans vs 15 `SceneRegistry` consumers |

---

## Command Audit

**Verdict: the strongest subsystem in the codebase — with one structural hole.**

### What is right

`packages/command-bus/src/CommandBus.ts` is a genuinely well-built dispatcher:

- One entry point (`executeCommand`), one OTel span per dispatch (P8 satisfied).
- `canExecute()` is a **pure gate** and a rejection never touches the undo stack (`:268-274`).
- **Store-presence is verified synchronously** and the `(window as any)` fallback is explicitly
  outlawed with a pointer to ADR-002 (`:216-235`). This is the right shape.
- A dev-time **undo-routing guard** (`§U-B6`, `:283-317`) catches handlers that mutate stores they
  did not declare — a defect class most codebases never detect at all.
- Consistent naming: 40 `<type>.create` / `<type>.batch.create` command strings.

### What is wrong

**C-1 (P1) — Two command systems, and the gate that was supposed to kill one exempts the place it
lives.** `commandManager.execute()` persists at ~236 sites. The ratchet reached its "zero
tolerance" target only by scoping itself to `packages/` and `plugins/`. `apps/editor` — 17 direct
sites plus the `initBusHandlers.ts` bridge, the plan-tool handlers, `performUndoRedo.ts` — is out
of scope by construction. Result: **undo has to reconcile two stacks in chronological order**
(`§UNDO-CROSS-STACK-ORDER`, `CommandBus.ts:397-400`) and the bus carries a permanent
`isEmptyPatchRecord` special case (`:371`) purely to stop legacy bridge handlers from poisoning
the ring-buffer cursor. Every future undo bug will start here.

**C-2 (P2) — Duplicate command namespace.** `curtain-wall.*` and `curtainwall.*` both exist and
are both live: `commands.ts:979` registers `curtain-wall.batch.create` while `:1017` registers
`curtainwall.batch.update`, and `CommandEventBridge.ts:320-340` handles `curtainwall.create` but
emits `curtain-wall.created`. One typo away from a silently-dropped command.

**C-3 (P2) — Batch coverage is partial.** 40 create commands; ~13 have a `.batch.create` sibling.
Missing: `annotation`, `dimension`, `room`, `roof`, `opening`, `handrail`, `plumbing`, `lighting`,
`grid`, `pool`, `structural`, `floor`, `view`. Generators that emit rooms or annotations en masse
therefore pay N× (ULID + span + EventRecord + two undo pushes + CRDT applier call). See
*Batching Opportunities*.

**C-4 (P3) — No dispatch-level batch API.** `executeCommand` is inherently per-command; batching
is by convention (a `.batch.create` payload) rather than by mechanism. A
`executeCommands(list): Promise<EventRecord[]>` that opens one span, one Immer draft and one
undo entry would let *every* command batch without each type re-implementing it.

**Recommended standard pattern** (already 80 % true — codify it):

> A handler is pure: `canExecute` reads, `execute` returns patches. It never touches
> infrastructure, never awaits I/O, never writes a store directly, and declares **every** store it
> mutates. Anything asynchronous or infrastructural is a *service* invoked before dispatch, and the
> command carries the result. Batch variants are mandatory for any type a generator can emit.

---

## Store Audit

**Verdict: sound core, sprawling perimeter.**

`packages/stores/src/Store.ts` is the right abstraction: a `Map<Id, T>`, mutation exclusively via
`applyPatch(immerPatches)`, and **one `DirtyDiff` per call rather than one event per element** —
"the L1→L5 fan-out is one call regardless of the number of mutated entities" (`:19-22`). That
single decision is what keeps batch generation viable.

### Findings

**S-1 (P2) — 38 stores is a lot, and several are not stores.** `ApartmentParameterPropagator`,
`RetentionScheduler`, `CameraPositionService`, `attachStores`, `seedCoreFamilies` and four
`*-commands/` directories live in `packages/stores/src/`. The package has become the default home
for "shared client state-ish things." That blurs the layer boundary L3 is supposed to define.

**S-2 (P1) — Three undo/state layers must be reconciled at runtime.** `performUndoRedo.ts` exists
solely to order the `RingBufferUndoStack`, the legacy `UndoStack` and the `CommandManager` stack
against each other by `Date.now()`. Timestamp-ordered reconciliation across independent stacks is
correct only until two entries share a millisecond.

**S-3 (P2) — `_inMemoryProjects` is a fourth, server-side store** with its own v0/v1 shape
adapters (`_toV0Project`, `imProjectsMapAdapter`). It exists because two route generations
disagreed; `§STORE-UNIFY` merged the two maps but kept the translation layer.

**S-4 (P3) — Derived state is stored, not derived.** `projects.version_count` is maintained by
three different mechanisms: `+1` increment (`touchProject`), full recount inside the transaction
(`createVersionTransactional` step 5), and direct assignment (`duplicateProject`). Any one of
them being missed leaves the hub showing a wrong count.

### Source of truth — declare this explicitly (it is currently implicit)

| Data | Source of truth | Currently |
|---|---|---|
| Element geometry + properties | `ElementStore` (client) | ✅ correct |
| Level assignment | `LevelStore` | ✅ correct |
| Selection | `SelectionStore` | ✅ correct |
| Camera | `CameraPositionService` | ⚠️ also mirrored in OBC controls |
| Undo history | `RingBufferUndoStack` | ❌ split three ways (S-2) |
| **Persisted document** | `project_versions.snapshot` (latest row) | ❌ **also** `_inMemoryProjects` on degrade (L-789) |
| Project membership | `project_members` | ❌ **never read** by the access gate (L-336 ⟳) |
| Visibility intent | `packages/visibility` | ✅ correct (P7 honoured) |

---

## WASM Audit

**Verdict: clean boundary, wrong thread, no batch API.**

`packages/geometry-kernel/src/csg/KernelCSG.ts` is careful work:

- Lazily `import('manifold-3d')` behind a memoised promise (`:56-69`) — consumers that never CSG
  do not pay the ~600 KB blob.
- Native handles released eagerly in `finally` on **both** the operand and result paths
  (`:121-132`) — no leak.
- Zero-copy in: `Float32Array`/`Uint32Array` handed straight to `Mesh`. Only one avoidable copy,
  the `Uint16Array → Uint32Array` widen at `:150`.
- The `numProp === 3` fast path avoids the de-interleave loop entirely (`:170-174`).

### Findings

**W-1 (P1) — Wall CSG is N sequential boundary crossings, on the main thread.**
`produceWallWithVoids` loops `for (const box of openingBoxes) { result = await
produceBoolean('subtract', result, box) }` (`wallVoids.ts:66-71`). A wall with 4 openings =
4 lift → subtract → getMesh → copy-out round trips, each materialising a full intermediate
triangle soup that is immediately discarded. Manifold supports batching a difference against a
composed subtrahend; **union the opening boxes once, then one subtract** — 4 crossings become 2,
and the intermediates disappear.

**W-2 (P1) — Geometry production is not on a worker in the shipping path.** Worker pools exist
(`frame-scheduler/WorkerPool.ts`, `geometry-kernel/runners/browser-worker-entry.ts`,
`GeometryWorkerPool.ts`, `CompressWorkerPool.ts`, `SolarWorkerPool.ts`) but
`singleVolumeWallProducer.ts` sits in `apps/editor/src/engine/`, i.e. main thread. A 200-wall
regeneration blocks input.

**W-3 (P2) — Repeated conversions in the ThatOpen/`web-ifc` path.** IFC export touches `web-ifc`
across 8 writer modules plus `geometry-kernel/dimensions` and `view-resolution`; each is its own
WASM instance lifecycle. No shared instance registry.

**W-4 — Not a server concern.** All WASM is client-side. **1,000 concurrent users cost the server
exactly zero WASM.** This is the one axis where the architecture already scales perfectly, and it
should be stated plainly rather than optimised speculatively.

---

## Database Audit

**Verdict: the binding constraint. Correct-but-small.**

### Schema and indexes

The schema is sane (24 tables, FKs, `ON DELETE CASCADE` on versions) and migrations are
idempotent `CREATE TABLE IF NOT EXISTS` / `ALTER … IF NOT EXISTS` applied on boot. Indexes are
present on the obvious FKs. But:

**D-1 (P1, L-788) — The hottest query in the product has no supporting index.**
`project_versions` is indexed on `(project_id)` alone (`dbMigrate.js:79`). Three separate hot
paths run:

```sql
SELECT … FROM project_versions WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1
```

— `listProjects` (LATERAL, per project row, ×50), `getProjectStatus`, and
`getLatestVersionSnapshot` (**the project-open path**). With only `(project_id)`, Postgres reads
every version row for the project and sorts. On a project with 20 versions × 16 MB snapshots that
is a heap scan over ~320 MB of TOASTed JSONB to find one row. Fix:

```sql
CREATE INDEX CONCURRENTLY idx_pv_project_created ON project_versions(project_id, created_at DESC);
```
One line. Turns the open path into an index-only descent. **Highest value-per-character change in
the audit.**

**D-2 (P2) — `projects` list query sorts unindexed.** `WHERE owner_id = $1 ORDER BY updated_at
DESC LIMIT 50` against `idx_projects_owner_id`. Wants `(owner_id, updated_at DESC)`.

**D-3 (P2) — `listProjects` LATERAL is an N+1 in disguise.** The `LEFT JOIN LATERAL … LIMIT 1`
executes once **per project row** — up to 50 index-descents per hub load. Correct and readable;
50× amplified by every hub open. At 1,000 users each opening the hub once a minute: 50,000
subqueries/min. With D-1 fixed this is survivable; without it, it is not.

### Connections, transactions, concurrency

**D-4 (P0, L-787) — `max: 10`** (`pgClient.js:87`). Ten. For the entire application: every hub
load, project open, autosave, thumbnail PATCH, command-log insert, AI usage write and health
probe. At 1,000 users the pool is the whole system's throughput. Requests do not fail fast; they
queue behind `connectionTimeoutMillis: 10000` and then 500.

**D-5 (P1) — Version save holds a row lock across a multi-megabyte insert.**
`createVersionTransactional` takes `SELECT … FOR UPDATE` on the `projects` row (step 1), then
inside that lock performs `COUNT(*)` on versions (step 3), the JSONB insert (step 4), **and another
full `COUNT(*)`** (step 5). Two users editing one project serialise entirely; each waits for the
other's 16 MB write. Under `statement_timeout = 60s` (direct connections only — **skipped on the
Supabase transaction pooler**, `pgClient.js:101`) a stuck save on the pooler has no timeout at all.

**D-6 (P1) — Unbatched per-command log insert plus a probabilistic range DELETE.** Every relayed
command does one `INSERT INTO project_command_log` (`server.js:800-819`), and **2 % of inserts
fire a `DELETE … WHERE project_id = $1 AND created_at < NOW() - INTERVAL '24 hours'`**
(`:826-844`) — a range delete on the hot table, from the request path, with no `LIMIT`, competing
with the inserts for locks. At 1,000 users this is a self-inflicted lock storm. Move retention to
a scheduled job or `pg_partman` partition drop.

**D-7 (P2) — No read/write separation, no query caching, no prepared statements.** Every read hits
primary. Supabase supports read replicas.

**D-8 (P1) — Two client libraries race for the same tables.** The command-log path prefers the
Supabase REST client and falls back to `pgQuery` (`server.js:790-820`); `projectStore` uses `pg`
exclusively; `projectMembers.js` uses Supabase REST exclusively. Three access styles, different
error semantics, different connection accounting.

### "What if 1,000 users do this simultaneously?"

| Operation | Per-call cost | ×1,000 | Outcome |
|---|---|---|---|
| Hub load (`listProjects`) | 1 query + ≤50 LATERAL descents | 50k subqueries | Queues on pool(10) |
| Project open (`getLatestVersionSnapshot`) | Heap scan of all versions (D-1) + ~16 MB TOAST read + 16 MB JSON→HTTP | ~16 GB egress | **Fails** |
| Autosave (10 % active) | 16 MB body → JSONB insert under row lock | ~660 MB/s writes | **Fails** |
| Command relay | 1 INSERT (+2 % range DELETE) | ~20 DELETEs/s on hot table | Lock contention |
| Thumbnail PATCH | 1 UPDATE + `updated_at = NOW()` | Row-level hot spot per project | Tolerable |

---

## Camera Audit

**Verdict: no evidence of a hot-path problem; one ownership ambiguity.**

- `CameraPositionService` is 116 lines and explicitly P3-clean.
- Motion is event-driven: OBC's `camera.controls` fires `update`/`rest`, which wake PRYZM's
  frame-scheduler via `beginMotion` (`BimWorld.ts:227-229`). The scheduler parks when idle — the
  right design. `BackgroundHeartbeat` handles the `document.hidden` rAF pause.
- Interaction tools coalesce with `cancelAnimationFrame` + re-request semantics
  (`UnderlayReferenceRotateTool.ts:444`, `UnderlayReferenceScaleTool.ts:526`).

**CAM-1 (P2) — Camera state has two owners.** `CameraPositionService` (the store) and
`camera-controls` (OBC-owned, ticked by the vendor rAF loop). Nothing reconciles them; the
`§WEBGL2-VIEW-UNSTICK` guard exists precisely because the vendor loop can die and take the camera
with it. The guard is good defensive work but it is treating a symptom of not owning the loop.

**CAM-2 (P3) — 535 `project`/`unproject`/`worldToScreen` sites** and per-call `new THREE.Vector3`
allocation in interaction code (`SelectionManager.ts`: 31 constructions,
`SelectionBoundsRegistry.ts`: 31). Not per-frame, so not urgent — but the standard fix (module-
scoped scratch vectors) is cheap and these are pointer-move-adjacent.

---

## Element Creation Audit

**Verdict: one good pipeline, several bypasses.**

The intended path exists and is close to the shape the brief proposes:

```
Tool / AI / importer
  → runtimeBus.executeCommand('<type>.create' | '<type>.batch.create', spec)
  → handler.canExecute()                     [validation]
  → handler.execute() via produceCommand()   [defaults, id, domain object, patches]
  → Store.applyPatch → ONE DirtyDiff         [batched state update]
  → scene-committer commitBatch              [render once]
```

`produceCommand` centralising the Immer draft is the reason batch creation is one state update
rather than N — this is the correct architecture and it should be stated as the standard.

### Where creation escapes it

| Process | Current path | Duplicate logic | Standardisation opportunity | Recommended |
|---|---|---|---|---|
| Wall tool (`WallTool.ts`) | bus `wall.create` | — | ✅ already canonical | keep |
| Wall batch from slab | `CreateWallsFromSlabCommand` → bus `wall.batch.create` | slab-edge → baseline duplicated with `CreateWallsOnAllSlabsCommand` | extract shared `slabEdgesToBaselines()` | keep, dedupe |
| Curtain wall from slab | `CreateCurtainWallsFromSlabCommand` | **near-clone of the wall version**, 2 files, ~1,100 lines in one | one parametrised `createLinearElementsFromSlab(kind)` | refactor |
| AI apartment layout | `ai-host/workflows/apartmentLayout/emitGeometry.ts` → `FloorPlanCommandBatcher` | own batching layer above the bus's batching | fold into `.batch.create` | consolidate |
| IFC import | `IfcWallToNativeConverter` → ? | separate defaults/ID scheme | route through the same create commands | converge |
| Plan-view tools | `plantools/*PlanToolHandler.ts` → **`commandManager.execute()`** | legacy path (C-1) | migrate to bus | migrate |
| Annotations | 5 distinct `Create*Command` files, 22 `commandManager.execute()` sites | highest legacy concentration in the repo | migrate + add `annotation.batch.create` | migrate |

**EC-1 (P1)** — `plugins/annotations` is the single largest legacy-path holdout (22 sites) and has
no batch create. Annotating a drawing set is exactly the N-element operation that needs both.

**EC-2 (P2)** — IFC import and the interactive tools do not share a defaults resolver, so an
imported wall and a drawn wall can differ in metadata the user never sees.

---

## Builder Audit

Builders in `packages/geometry-*` are, correctly, **pure descriptor producers**:
`WallFragmentBuilder`, `descriptorToBufferGeometry`, `CurtainWallBuilder`, the `produce*` family.
They return `BufferGeometryDescriptor` and perform no I/O, no store writes and no scene mutation —
`assertValidDescriptor` even enforces the output contract. This is the right separation and the
68 `produce-*.bench.ts` benches show it is treated as a measured surface.

**B-1 (P2)** — `CurtainWallBuilder` and `WallFragmentBuilder` overlap on segment/mullion layout.
**B-2 (P2)** — `LayeredWallOpeningBuilder` (grid path) and the single-volume CSG path
(`singleVolumeWallProducer`) are **two complete implementations of "wall with a hole"**, selected
by wall type. Known and documented (`wall-opening-seam-two-paths`), still two code paths to keep
correct forever.
**B-3 (P3)** — `produceWallWithVoids` is written and explicitly *not wired* ("intentionally NOT
wired into WallFragmentBuilder … that is phase 3"). Authored-but-unwired again; harmless here
because it is stated, which is exactly the difference from L-336 ⟳.

**Rules to codify** (currently followed by convention, not by lint):

| Role | May | May not |
|---|---|---|
| **Builder** (`geometry-*`) | pure math → descriptor | I/O, store, THREE, scene, async |
| **Factory** (`produceCommand`) | defaults, ID, domain object, patches | I/O, scene |
| **Command** (`command-registry`) | validate, call factory, return patches | infrastructure, direct store writes |
| **Store** (`stores`) | hold state, apply patches, emit diff | business logic, I/O |
| **Service** (`ai-host`, `persistence-client`) | async, I/O, orchestration | be called from inside a handler's `execute()` |

---

## Alignment Audit

**Verdict: incremental where it counts, full-recompute where it does not.**

The good news: `packages/spatial-index` exists (BVH + facade orientation) and is consumed by the
places that need it — all four snapping providers, `SelectionManager`, the apartment/house layout
executors and `RoomWorldModelAdapter`. Snapping is **not** O(n) per pointer move. That is the
hardest alignment problem in a BIM editor and it is already solved.

**A-1 (P2) — Wall joins are cluster-wide, not incremental.** `WallJoinResolver` /
`JunctionResolverV2` resolve per cluster; moving one wall re-resolves its whole connected
component. Correct, and fine for a 30-wall floor; a 500-wall connected shell re-solves entirely
on every endpoint drag.

**A-2 (P2) — Room topology recompute is document-scoped.** `packages/room-topology` (7 legacy
`commandManager` sites) re-derives room boundaries rather than invalidating a dirty region. The
memory record of the post-generation sweep ("mid-sweep left rooms undetected",
`ProjectLoader.ts:2182`) is a symptom of a full-document pass that can be interrupted.

**A-3 (P3) — Layout engines are offline and deterministic** (D-TGL, D-FLE, D-CE), so they are
already "compute once, emit batch." No change needed.

The 10,000-element scenario the brief describes:

```
10,000 elements, move 5 walls
  snapping        → BVH query        → O(log n)   ✅ already incremental
  wall joins      → cluster resolve  → O(cluster) ⚠️ bounded by connectivity, not by 5
  room topology   → full re-derive   → O(n)       ❌ should be dirty-region
  scene commit    → DirtyDiff        → O(5)       ✅ already incremental
  persistence     → FULL 10k serialize → O(n)     ❌ the real cost (L-786)
```

Persistence, not alignment, is what makes moving 5 elements cost O(n).

---

## Rendering Audit

**R-1 (P1, L-794) — 319 `scene.traverse()` sites against 15 `SceneRegistry` consumers.** Every
traverse is a full walk of the THREE graph. Most are on discrete events (material upgrade,
lighting re-solve, view-range classify, frustum cull, panorama capture) rather than per frame, so
this is a *latency* problem, not a frame-rate one — but it means visibility toggles, level
switches, view-range changes and section-box edits all scale O(total scene objects) regardless of
how many objects actually changed. `SceneRegistry` is the intended answer and is 5 % adopted.

**R-2 (P1) — Instancing is defeated by per-element unique materials** (pre-existing finding,
`webgpu-heavy-scene-crash-and-instancing`). `InstancedMeshCoalescer` and `MaterialPool` exist; the
coalescer can only merge on (geometry × material × level).

**R-3 (P2) — Second rAF loop** (see Architecture #3). Two loops mean the frame budget is not
actually owned by the frame scheduler, and `idle-cpu.bench.ts` measures only PRYZM's half.

**Good:** `LODManager`, `FrustumCullingService`, `LevelScoped3DCullingService`, `SceneBoundsCache`,
`MaterialPool`, a per-frame perf trace gated behind a single boolean read
(`BimWorld.ts:253-271`) — the instrumentation discipline here is above average.

---

## Performance Audit

### CPU
- Full-document serialize twice per autosave (L-786) — the dominant client cost, by the code's own
  measurement.
- Main-thread CSG for wall openings (W-1, W-2).
- 319 O(n) scene walks (R-1).
- Boot: ~100 TS packages transpiled by `tsx` **on every server cold start** (L-442 ⟳).

### Memory
- **Client:** 16.6 MB snapshot + its JSON string held simultaneously in
  `_autosaveSerialization` (`PlatformSaveController.ts:60`) — deliberate (single-serialize cache)
  and correctly single-use, but it doubles peak during save.
- **Server (512 MB):** a 50 MB `express.json` body limit means **ten concurrent saves can exceed
  the entire machine's RAM** before Postgres is even reached. This is the most direct OOM path in
  the system.
- `express-rate-limit` MemoryStore grows with distinct IPs, unbounded within the window (L-790).
- `_inMemoryProjects` and `_userEmailCache` are unbounded process-lifetime Maps.
- `LRUElementMap` exists — good — but is one store among 38.

### I/O
- One INSERT per relayed command, plus a 2 % range DELETE from the request path (D-6).
- Per-connection `_resolveDisplayName()` lookup (`server.js:726`), uncached across sockets.
- No HTTP caching headers observed on snapshot reads; every project open re-transfers the full
  document.

### Rendering
- Covered above. Missing: virtualisation of the property panel / schedules for large element sets
  (the panel builds a descriptor per property per selected element with no windowing —
  `PropertyDescriptorGenerator.generateDescriptors` maps the whole schema every call).

---

## Batching Opportunities

Ranked by expected benefit at 1,000 users.

| # | Operation | Today | Batched | Benefit |
|---|---|---|---|---|
| 1 | **Persistence** | full snapshot / 2.5 s | **patch stream** (the bus already produces `forward`/`inverse`) | **~1000×** payload reduction; the single change that unblocks the target |
| 2 | **Command log** | 1 INSERT per command | buffer 100 ms → multi-row INSERT | ~20–50× fewer round trips |
| 3 | **Command-log retention** | 2 % probabilistic range DELETE inline | partition drop / nightly job | removes a lock-contention source entirely |
| 4 | **Cursor broadcast** | every `cursor-move` relayed | server-side coalesce to ~20 Hz per room | ~5× fewer frames in a 5-user room |
| 5 | **Wall CSG** | N sequential subtracts | union voids → 1 subtract | ~2× fewer WASM crossings, no intermediates |
| 6 | **Missing `.batch.create`** | 13 types N× dispatch | batch handler + one `produceCommand` | O(N)→O(1) state updates for generators |
| 7 | **Hub LATERAL** | 50 subqueries per load | one windowed `DISTINCT ON` | ~50× fewer index descents |
| 8 | **Presence/awareness** | per-event relay | Yjs awareness (already written, unwired) | free — the code exists |
| 9 | **Thumbnail PATCH** | separate request | fold into the save request | 1 fewer round trip per save |
| 10 | **Version-count recount** | `COUNT(*)` twice per save | trigger or increment | removes 2 seq-scans from the locked section |

---

## Concurrency Audit — the 1,000-user model

**Assumption:** 1,000 authenticated users; ~30 % actively editing, ~50 % viewing/navigating,
~20 % on the hub. Documents of 500–2,000 elements. Some projects with 2–5 concurrent editors.

| Bottleneck | Current behaviour | Why it breaks | At 1,000 users | Recommended | Expected gain |
|---|---|---|---|---|---|
| **Single machine** | 1 CPU / 512 MB, `min_machines_running=1` | Node is single-threaded; TLS + JSON parse + Socket.io on one core | CPU saturates at ~50–100 active sockets; every request queues | ≥4 vCPU, `cluster`/N machines, autoscale on CPU | 10–20× |
| **No Socket.io adapter** | rooms in process memory | second instance = disjoint rooms | **collab silently breaks** on scale-out | `@socket.io/redis-adapter` + Upstash/Fly Redis | unblocks all horizontal scaling |
| **PG pool 10** | shared by every route | queue → 10 s `connectionTimeoutMillis` → 500 | ~99 % of DB requests time out | `max: 25–50` per instance + Supavisor; measure | 3–5× (then DB-bound) |
| **Full-snapshot save** | 16.6 MB / 793 el / 2.5 s | 300 editors × 16.6 MB / 2.5 s ≈ **2 GB/s** | DB write-saturated; 50 MB bodies OOM the 512 MB box | patch-stream deltas + periodic compaction | **~1000×** |
| **`FOR UPDATE` on save** | serialises per project | lock held across a multi-MB insert | co-editors block each other for seconds | move the insert outside the lock; advisory lock on `project_id` | removes co-editor stalls |
| **Command-log DELETE** | 2 % of inserts, inline range delete | competes with inserts for locks | ~20 concurrent range deletes/s | partitioned table, drop old partitions | removes the storm |
| **Rate limit key = IP** | per-IP, in-memory | corporate NAT shares one IP; store is per-process | a 50-person firm shares 600 req/min → false 429s | key by `userId`, store in Redis | correctness + scale-out |
| **`tsx` at boot** | ~100 pkgs transpiled per cold start | slow, memory-spiky boot | autoscale-out is minutes, not seconds | precompile the server (esbuild/tsc) | boot seconds → sub-second |
| **In-memory degrade** | PG error → volatile Map, HTTP 200 | one DB blip converts durable writes to lies | silent, unbounded data loss under load | return 503; keep the fallback **dev-only** | correctness |
| **Health gate on `/live`** | DB-dead instance stays in rotation | deliberate (L-444), to avoid deploy lockout | at N instances, one bad instance poisons 1/N of traffic | keep `/live` for deploys, add `/ready` for **routing** | availability |
| **AI proxy** | 20 req / 15 min **per IP** | not per user, not per plan | shared-IP users starve each other | per-user + per-plan quota (`ai-cost`/`ai-spend` exist) | fairness |

### Race conditions found

- **RC-1** — `createVersionTransactional` is correctly serialised, but its optimistic
  `expectedVersionCount` check means **two legitimate co-editors reliably 412 each other**. The
  client has no merge; the loser's work is stranded. This is not a rare race — it is the normal
  outcome of two people editing one project today.
- **RC-2** — `touchProject` (`version_count + 1`) and `createVersionTransactional` (full recount)
  can interleave on the Supabase vs PG paths, producing a count that matches neither.
- **RC-3** — `_migrationsReady` / `_migrationsSettled` are per-process booleans. With N instances,
  each has its own view of whether migrations ran; two instances can run boot migrations
  concurrently with no advisory lock.
- **RC-4** — `PatchEmitter.emit` → `EventLogPersistor` → CRDT applier all fire synchronously
  inside the command span; an applier that throws is caught (good), but a *slow* one extends every
  dispatch.

### Not found (credit where due)
No SQL injection (parameterised throughout), no `Math.random()` IDs in the durable path
(48-bit `randomBytes`), no fail-open in the access check, no unbounded `LIMIT`-less user query,
tenant isolation asserted at every socket event (`§B2`), and graceful pool drain on SIGTERM.

---

## PRYZM Core vs PRYZM App

**The layer rule is real and enforced** — `eslint-plugin-boundaries` plus `check:isolation`,
`check:commandmanager`, `check:write-route-auth` and `tools/ga-gate/`. Very few teams achieve
this. But the boundary has two leaks:

**CA-1 — `apps/editor` is not an app; it is a second core.** It contains
`engine/persistence/ProjectLoader.ts` (2,300+ lines), `engine/undo/performUndoRedo.ts`,
`engine/singleVolumeWallProducer.ts`, `engine/CommandRegistry.ts`, `engine/initBuilders.ts`.
These are domain services living in the app layer, which is why the `commandManager` gate had to
exempt `apps/`. **Test:** could App be replaced without rewriting Core? Today, no — swapping the
editor shell would lose the loader, the undo reconciler and a geometry producer.

**CA-2 — `src/` (L7.5) still exists** as a transitional zone that is supposed to shrink to
`src/ui/` only. It has not been eliminated, and `index.html` still entry-points through it.

**CA-3 — The server is entirely outside the layer model.** `server.js` is 6,418 lines with 46
sibling modules, 20 of which are per-jurisdiction zoning proxies (`murciaPgouProxy`,
`chZurichBzoProxy`, `nlBestemmingsplanProxy`, …). Those are a *bounded context* — they share
nothing with project persistence and would be the natural first extraction into
`apps/api-gateway` (which already exists, unwired).

**Recommended boundary:**

```
CORE (reusable, headless-testable, no DOM)
  packages/schemas · geometry-kernel · geometry-* · command-bus · command-registry
  stores · spatial-index · snapping · room-topology · file-format · persistence-client
  + MOVE IN: ProjectLoader, performUndoRedo, singleVolumeWallProducer

APP (replaceable shell)
  apps/editor/src/ui · rendering wiring · tool registration · panels
  + apps/marketplace, apps/docs-site

SERVICES (independently scalable)
  api-gateway (REST + auth)         ← extract the 20 zoning proxies here first
  sync-server (Yjs; DEPLOY IT)
  ai-worker · bake-worker · export-worker
```

`apps/headless` and `apps/cli` already prove Core is *nearly* independently testable — finishing
CA-1 would make that true.

---

## Error Handling Audit

**Strong:** `withTransaction` always ROLLBACKs and always releases, even when ROLLBACK itself
throws (`pgClient.js:300-315`). Typed domain errors (`ProjectConflictError`, `VersionLimitError`,
`PreconditionFailedError`, `ProjectGoneError`). Retryable-vs-verified denial is distinguished at
the socket join (`§FIX-ACCESS-CHECK-TRANSIENT-RETRYABLE`) — a genuinely sophisticated distinction.
CRDT applier failure is explicitly non-fatal. The OBC frame-loop guard prevents one throwing
component from freezing the viewport permanently.

**EH-1 (P0, L-789) — The degrade path lies.** `createProject` and `deleteProject` catch *any* PG
error and fall back to the volatile in-memory Map, returning success. A transient pooler blip
during a deploy converts a durable create into a fiction. The comment acknowledges the FK-violation
case leaves the PG row alive so a "successful" delete reappears later. **A refusal and a success
must not be the same value** — this repo has paid for that three times (L-716, L-752, L-779) and
this is the same defect in the write path.

**EH-2 (P1) — Partial mutation on version save.** `createVersionTransactional` is atomic
server-side, but the *client* has no compensating action on 412/409/410 beyond dropping the
autosave. The user's in-memory document diverges from the persisted one with no visible signal
beyond a save-status chip.

**EH-3 (P2) — Error handling has three styles**: throw typed error (projectStore), return
`{ok:false}` (access check), and log-and-continue (command log, CRDT applier). Defensible per
call-site, but there is no written rule for which applies where.

---

## Testing Audit

**Substantial:** 1,838 test files, 873 in `packages/*/__tests__`, 14 Playwright e2e specs,
68 named benches including `largest-model`, `memory-ceiling`, `idle-cpu`, `frame-budget`,
`persistence-stress`, `crdt-merge`, `sync-conflict`, and a `_chaos/PeerHarness` for CRDT. This is
better instrumented than most production systems.

**The gap is precisely the thing being asked about.**

**T-1 (P0) — There is no server load test.** No `k6`, `artillery`, `autocannon` or equivalent
anywhere in the repo. Every bench measures **one client**. `sync-roundtrip.bench.ts` and
`awareness-throughput.bench.ts` measure a subsystem that is **not deployed**. There is no
measurement, at any concurrency, of the system that actually ships.

**T-2 (P1) — No test asserts the multi-user path.** Because `canUserAccessProject` is owner-only
(L-336 ⟳), a test with two distinct users joining one project would have failed. None exists.

**T-3 (P1) — Suites are split across ≥6 runners** (`test:server`, `test:pryzm1`, `test:ci`,
`test:root`, playwright, four `vitest.worktree.*.mjs`) with no single `npm test`. `test:root`
carries a comment recording that 23 files / 263 green tests were "invoked by NOTHING in CI" until
L-540. That is a structural risk: coverage that exists but is not run is coverage that does not
exist.

**T-4 (P2) — No concurrency/race tests** on `createVersionTransactional`, and no test for the
in-memory degrade path's data-loss behaviour.

**Recommended additions, in priority order:**
1. `k6` scenario: 1,000 VUs — hub load, project open, autosave, socket join, command relay. **Run
   it before anything else; it will falsify or confirm every number in this document.**
2. Two-user integration test: invite → member joins → both edit → both see each other. (Fails today.)
3. Concurrency test: 10 parallel `createVersionTransactional` on one project.
4. DB fault-injection: kill the pool mid-write, assert **503, not 200**.
5. A single `npm test` that runs every suite.

---

## Documentation Audit

**Unusual strength.** The C01–C15 contract suite, a documented conflict-resolution order, ADRs
with real supersession, and — most valuable of all — **inline `§TAG` comments that record the
incident that motivated each fix**, with dates and symptom descriptions. `pgClient.js`'s `§D7`
comment explaining the pooler `SET`↔`SELECT 1` collision is better postmortem writing than most
teams produce in a dedicated document. This audit was possible *because* of those comments.

**Gaps:**

| Missing | Why it matters |
|---|---|
| **Concurrency model** | No document states the target concurrency, the per-instance limits, or the scaling story. This audit had to derive it from `fly.toml` comments. |
| **Source-of-truth table** | Implicit; see *Store Audit*. Should be a contract section. |
| **Element lifecycle** | The pipeline is real but described nowhere end-to-end. |
| **Performance budgets as contract** | `perf-budgets` package exists; the budgets are not in a contract and not gated in CI. |
| **Error-handling policy** | Which of the three styles applies where (EH-3). |
| **Deployment topology** | `fly.toml` comments are the only record that this is a single machine. |

**Recommended structure:** add `C16-CONCURRENCY-AND-SCALE.md` (targets, per-instance limits,
scale-out plan, the source-of-truth table) and `C17-ELEMENT-LIFECYCLE.md` (the one canonical
creation pipeline). Keep the `§TAG` practice — it is the single best documentation habit here.

---

## Standardization Opportunities

| Area | Inconsistency | Standardise? |
|---|---|---|
| Command naming | `curtain-wall.*` vs `curtainwall.*` | **Yes** — kebab-case, add a CI check |
| Batch commands | 13 of 40 types have no batch variant | **Yes** — mandatory for generator-emittable types |
| DB access | `pg` / Supabase REST / mixed-with-fallback | **Yes** — one client; REST only where IPv4 forces it, documented |
| Error style | throw / `{ok:false}` / log-and-continue | **Yes** — write the rule |
| Rate-limit key | IP everywhere | **Yes** — userId for authenticated routes |
| Mutation path | bus vs `commandManager` | **Yes** — extend the gate to `apps/` with a ratchet |
| Store package | 38 stores + schedulers + propagators + command dirs | **Yes** — move non-stores out |
| Test invocation | ≥6 runners, no root `test` | **Yes** — one entry point |
| Line endings | mixed CRLF/LF in the worktree (hit during this session's commit) | **Yes** — add `* text=auto` to `.gitattributes` |
| `§TAG` comments | already consistent and excellent | **No** — keep as-is |

---

## Architectural Smells

- **God file:** `server.js`, 6,418 lines, owning auth + projects + AI proxy + Stripe + marketplace
  + Socket.io + 20 jurisdiction proxies.
- **God module:** `apps/editor/src/engine/` — a second core (CA-1).
- **Duplicate abstraction:** two wall-with-opening implementations (B-2); two collaboration
  architectures (Socket.io relay + unwired Yjs); two command systems (C-1); two rAF loops (R-3).
- **Authored-but-unwired:** `apps/sync-server`, `apps/api-gateway`, `apps/ai-worker`,
  `apps/bake-worker`, `apps/export-worker`, `project_members` in the access path,
  `produceWallWithVoids`. **Five of six deployable apps are not deployed.**
- **Hidden side effect:** a 2 % chance that any relayed command triggers a range DELETE (D-6).
- **Leaky abstraction:** `persistence-client` is a "single write gateway" (C05 §1.1) that the
  autosave path bypasses by serialising the whole document itself.
- **Global mutable state:** `_inMemoryProjects`, `_userEmailCache`, `_migrationsReady`,
  `_pool`, `_resolvedCache` — all module-level and all per-process, which is fine at N=1 and
  wrong at N>1 (RC-3).
- **Premature abstraction:** none found worth deleting. The abstractions here are mostly earned.
- **Over-engineering:** the jurisdiction proxy fleet (20 modules) is disproportionate to the
  deployed footprint, but it is the product's differentiator, so this is a *placement* problem
  (belongs in `api-gateway`), not an existence problem.

---

## 1,000 Concurrent User Analysis

### Capacity arithmetic

One `shared-cpu-1x` (1 vCPU, 512 MB) running Node, with `hard_limit = 250` requests at the proxy.

| Resource | Available | Needed at 1,000 users | Ratio |
|---|---|---|---|
| CPU | 1 shared vCPU | ~10–20 vCPU (TLS + JSON + socket fan-out) | **10–20× short** |
| RAM | 512 MB | 50 MB body limit × concurrent saves alone exceeds it | **OOM** |
| WebSocket connections | ~1 process, no adapter | 1,000 sockets + room fan-out | **needs N instances → breaks collab** |
| PG connections | 10 | ~100–200 | **10–20× short** |
| DB write throughput | Supabase small tier | ~660 MB/s (30 % editing, 16 MB snapshots) | **~100× short** |
| Proxy request slots | 250 hard | ~1,000+ | **4× short** |

The `fly.toml` comment is the ground truth: *"Tuned for ~50 concurrent live editors."*

### What actually happens as load ramps

- **~50 users:** works. This is the tested and designed-for point.
- **~150 users:** PG pool queueing begins; hub loads slow; occasional 10 s timeouts → 500s.
- **~300 users:** event loop saturates on JSON parse + socket fan-out; Fly health check
  (5 s timeout) starts failing; `auto_stop_machines` cannot help because there is nowhere to scale.
- **~500 users:** first 50 MB save body during a GC pause OOMs the 512 MB machine. Fly restarts
  it. Every socket drops. All 500 reconnect at once — **thundering herd** — each firing
  `join-project`, each doing an owner-check query against the same pool of 10. The reconnect
  storm prevents recovery.
- **~1,000 users:** the machine does not stay up long enough to serve them.

There is no configuration change that reaches 1,000. The single-machine ceiling and the
snapshot-persistence model are both architectural.

---

## Performance Scorecard

| Area | Score | Rationale |
|---|---|---|
| Architecture (client) | **8/10** | Layer rule real and CI-enforced; P1–P8 mostly honoured; two transitional zones remain |
| Architecture (server) | **3/10** | 6,418-line monolith, no layer model, 5 of 6 apps undeployed |
| Commands | **7/10** | Excellent bus; second legacy system exempted by the gate's own scope |
| Stores | **7/10** | Great base class; 38 stores, three undo layers, package sprawl |
| Database | **3/10** | Correct SQL, missing hot index, pool of 10, snapshot model, inline range deletes |
| WASM | **8/10** | Clean lazy boundary, no leaks, zero server cost; not batched, not on a worker |
| Camera | **7/10** | Event-driven and parked when idle; dual ownership with the vendor loop |
| Element creation | **6/10** | One good pipeline; annotations/plan-tools/IFC still bypass it |
| Builders | **8/10** | Genuinely pure, benched, contract-asserted; two overlapping wall paths |
| Alignment | **7/10** | Snapping already BVH-incremental; joins and room topology are not |
| Rendering | **6/10** | Good LOD/culling/pooling; 319 O(n) traversals; instancing defeated by materials |
| Memory | **4/10** | 50 MB bodies on a 512 MB box; unbounded server-side Maps; 2× snapshot peak |
| CPU | **4/10** | Single vCPU; `tsx` at boot; main-thread CSG and serialize |
| Concurrency | **2/10** | No adapter, pool 10, single process, co-editors 412 each other |
| Scalability | **2/10** | No horizontal path that preserves correctness |
| Testing | **6/10** | 1,838 files and 68 benches — but zero load tests and no multi-user test |
| Documentation | **8/10** | Contracts, ADRs, and outstanding inline incident comments; no concurrency doc |
| Maintainability | **7/10** | High discipline, strong CI gates; monolith and dual paths drag it down |

### **Overall: 5.3 / 10**

A high-quality client architecture bolted to a prototype-scale backend. The score is bimodal, not
uniformly mediocre — and that is good news, because the weak half is the replaceable half.

---

## Priority Matrix

Each finding below follows the requested template. Complexity is engineer-days; impact is stated
against the 1,000-user target.

---

### P0 — blocks production at the stated target

---

**ID:** L-770 ⟳ (open since 2026-08-08) · **Severity:** P0 · **Area:** Infrastructure
**Location:** `fly.toml` (`[[vm]]`, `[http_service]`); `server.js:675-679`
**Problem:** Two halves of one problem. (a) The entire product runs on **one `shared-cpu-1x`
machine — 1 vCPU, 512 MB** — with `min_machines_running = 1`, no autoscaling policy, and proxy
limits of 200/250 *requests* (a poor fit for long-lived WebSockets). (b) `new Server(httpServer,
{...})` is constructed **with no adapter**, so Socket.io rooms live in one process's memory.
**Why it matters:** Node is single-threaded — one vCPU serves all TLS, JSON parsing, Socket.io
fan-out and DB marshalling for every user. And (b) means the only remedy for (a) is currently
*unsafe*: with two instances, `socket.to('project:X').emit(...)` reaches only the peers on the
same machine, so users in the same project stop seeing each other **with no error**.
**Impact:** CPU saturation at roughly 50–100 active sockets; total outage above that; and no
scale-out path that preserves correctness.
**Evidence:** `fly.toml` — *"Tuned for ~50 concurrent live editors"*, `memory_mb = 512`,
`cpus = 1`, `hard_limit = 250`. `grep -i redis package.json` → no match; no `adapter:` option at
the `Server` constructor. `SPEC-15-DEPLOYMENT-TOPOLOGY.md:46` acknowledges the gap.
**Recommended solution:** `@socket.io/redis-adapter` + Fly Redis / Upstash **first** — moving
`_userEmailCache`, `_migrationsReady` and the rate-limit store to the same Redis in the same
change — then `performance-2x` (2 vCPU / 4 GB) as a stopgap, then N stateless instances with a
CPU-based autoscale policy.
**Complexity:** 3–5 d (adapter) + 2 d (resize) + 5 d (autoscale) · **Perf impact:** 10–20×, and
it unblocks everything else · **Risk:** Medium.
⚠ **Disposition change required.** L-770's current status is *"Acceptable for a closed beta; each
item becomes blocking at a different user count."* That is a correct call for a closed beta and
the **wrong** call for this target — 1,000 users is the user count at which every item on it is
blocking simultaneously.

---

**ID:** L-786 · **Severity:** P0 · **Area:** Persistence
**Location:** `SaveOrchestrator.ts:179-189`; `PlatformSaveController.ts:43-90`;
`projectStore.createVersionTransactional`
**Problem:** Every autosave serialises the **entire document** to JSON, ships it as an HTTP body up
to 50 MB, and inserts it as a new JSONB row. The code's own measurement: *793 elements → ~16.6 MB,
twice per fire*, on a 2.5 s debounce.
**Why it matters:** Save cost is O(document), not O(change). The command bus **already produces
exact forward/inverse patches** for every mutation and they are discarded.
**Impact:** At 30 % of 1,000 users editing 793-element documents: ~2 GB/s of JSONB writes. Also
the most direct OOM path on a 512 MB machine.
**Evidence:** the `§PERF-AUTOSAVE-DEBOUNCE` comment; `express.json({ limit: '50mb' })`
(`server.js:438`); `JSON.stringify(snapshot)` at `projectStore.js:839`.
**Recommended solution:** Append the bus's patch stream to `project_command_log` (or a new
`project_patches` table); compact to a full snapshot every N patches or on explicit save. Keep
snapshots for versioning, not for autosave.
**Complexity:** 15–20 d · **Perf impact:** **~1000×** payload reduction · **Risk:** High — this
is the deepest change in the plan, and it must ship behind a flag with snapshot fallback

---

**ID:** L-336 ⟳ · **Severity:** P0 · **Area:** Collaboration / Access control
**Location:** `server/projectAccess.js:82-139`; `server/projectStore.js` (`listProjects`,
`getProject`, `listVersions`)
**Problem:** `canUserAccessProject()` resolves access **entirely by `owner_id`** on all three of
its backends (Supabase, PG, in-memory). `project_members` is never queried. The project read
functions filter on `owner_id` too.
**Why it matters:** `join-project` is the only gate that admits a socket to a project room. A
non-owner is rejected, so cursors, presence, `remote-command`, sheet comments and every
collaboration feature are unreachable by anyone but the owner. `project_members`,
`projectMembers.js`, `permissions.js` roles and `pendingInvites.js` all exist and are all inert
on this path.
**Impact:** The product's headline capability — real-time multi-user BIM — does not function in
production. It works only as two tabs of one account. No test caught this because no test
exercises two users.
**Evidence:** `projectAccess.js:96-97,116-117,137` — three `owner_id !== userId → allowed:false`
branches, zero membership lookups; `grep project_members server/*.js server.js` → only
`projectMembers.js`, `permissions.js` and two comments.
**Recommended solution:** Add a membership lookup to `canUserAccessProject` and change the project
read queries to `owner_id = $1 OR EXISTS (SELECT 1 FROM project_members …)`. Index
`project_members(user_id, project_id)`. Then add the two-user integration test (T-2).
**Complexity:** 3–5 d · **Perf impact:** n/a (correctness) · **Risk:** Medium — it widens an
authorization boundary, so it needs the RBAC tests written first

---

**ID:** L-787 · **Severity:** P0 · **Area:** Database
**Location:** `server/pgClient.js:87`
**Problem:** `max: 10` for the entire application.
**Why it matters:** Every route shares ten connections. Overflow queues behind
`connectionTimeoutMillis: 10000`, then 500s.
**Impact:** At 1,000 users, effectively all DB requests time out.
**Evidence:** `new Pool({ …, max: 10, connectionTimeoutMillis: 10000 })`.
**Recommended solution:** Raise to 25–50 per instance and route through Supabase Supavisor in
transaction mode. Note the existing `§D7` caveat: session `SET` is skipped on the pooler, so
`statement_timeout` must move into the connection string
(`?options=-c%20statement_timeout%3D60s`) or the runaway-query protection is lost exactly where
it is most needed.
**Complexity:** 1 d (+1 d for the timeout move) · **Perf impact:** 3–5× · **Risk:** Low

---

**ID:** L-789 · **Severity:** P0 · **Area:** Persistence / Data integrity
**Location:** `server/projectStore.js:263-281` (create), `:506-528` (delete)
**Problem:** Any PG error during create or delete is caught and the operation is completed against
a **volatile in-memory Map**, returning success.
**Why it matters:** A transient pooler blip converts a durable write into a fiction the user cannot
detect. The delete path's own comment concedes that on FK violation (`23503`) the PG row survives
and the "deleted" project reappears later.
**Impact:** Silent, unbounded data loss — worse under load, because load is what produces the
transient errors.
**Evidence:** `§SERVER-PG-DEGRADE` blocks; `_inMemoryProjects.set(id, row); return row;` inside
`catch`.
**Recommended solution:** Gate the entire degrade path on `NODE_ENV !== 'production'`. In
production return 503 with a retryable code; the client's `ServerSyncQueue` already handles
retryable 503.
**Complexity:** 1 d · **Perf impact:** n/a (correctness) · **Risk:** Low — but it will make
existing failures **visible**, which is the point

---

### P1 — major architectural or performance problems

---

**ID:** L-788 · **Severity:** P1 · **Area:** Database
**Location:** `server/dbMigrate.js:79`
**Problem:** `project_versions` is indexed on `(project_id)` only, while the three hottest reads —
including project-open — are `WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1`.
**Impact:** Every project open heap-scans and sorts all of that project's version rows, each
carrying a TOASTed multi-megabyte JSONB column.
**Evidence:** `listProjects` LATERAL, `getProjectStatus` LATERAL, `getLatestVersionSnapshot`.
**Recommended solution:**
`CREATE INDEX CONCURRENTLY idx_pv_project_created ON project_versions(project_id, created_at DESC);`
plus `(owner_id, updated_at DESC)` on `projects` and `(user_id, project_id)` on `project_members`.
**Complexity:** 0.5 d · **Perf impact:** 10–100× on project open · **Risk:** Very low.
**Do this first — it is the best ratio in the document.**

---

**ID:** L-790 · **Severity:** P1 · **Area:** Infrastructure / Fairness
**Location:** `server/rateLimiter.js`
**Problem:** All three limiters key on **IP** and use `express-rate-limit`'s default in-memory
store.
**Impact:** (a) a 50-person firm behind one NAT shares 600 req/min and 429s itself; (b) the store
is per-process, so limits multiply by instance count on scale-out; (c) the Map grows with distinct
IPs on a 512 MB box; (d) the AI limiter's 20 req/15 min per IP means shared-IP users starve each
other's AI quota.
**Recommended solution:** Key authenticated routes by `userId`, keep IP only for unauthenticated
ones; move the store to Redis; move AI quota onto the existing `@pryzm/ai-cost` / `ai-spend`
per-plan accounting.
**Complexity:** 2–3 d · **Perf impact:** correctness + scale-out · **Risk:** Low

---

**ID:** L-442 ⟳ · **Severity:** P1 · **Area:** Infrastructure / Boot
**Location:** `Dockerfile:209` → `dist/index.cjs` → re-spawns `server.js` under `--import tsx`
**Problem:** The production container does not run precompiled JavaScript. ~100 workspace
TypeScript packages are transpiled **on every cold boot** before `httpServer.listen()`.
**Impact:** Slow, memory-spiky boots make autoscale-out take minutes instead of seconds — which
is exactly when a scaling event is needed. `fly.toml`'s own `§L-442` comment records this as a
recurring deploy failure and says plainly: *"This BUYS TIME; it is not the cure."*
**Recommended solution:** Precompile the server and its workspace deps (esbuild bundle or
`tsc --build`); ship plain `node`.
**Complexity:** 3–5 d · **Perf impact:** boot from seconds to sub-second · **Risk:** Medium
(build-pipeline change)

---

**ID:** L-794 · **Severity:** P1 · **Area:** Rendering
**Location:** 319 sites across `packages/core-app-model/src/{rendering,presentation,drawing}`
**Problem:** Full THREE-graph walks (`scene.traverse`) are the default idiom for finding objects.
`SceneRegistry` — the intended index — has 15 consumers.
**Impact:** Visibility toggles, level switches, view-range changes and material upgrades all cost
O(total scene objects) regardless of how much changed. At 10,000+ elements these become visible
interaction stalls.
**Recommended solution:** Make `SceneRegistry` authoritative (id → object, level → objects,
type → objects) and migrate the traversals, highest-frequency first
(`FrustumCullingService`, `ViewRangeFilterService`, `CropRegionFilterService`).
**Complexity:** 8–12 d (incremental, per call site) · **Perf impact:** O(n) → O(k) per interaction
· **Risk:** Low per site, high in aggregate — do it in tranches with the existing benches as the
gate

---

**ID:** L-791 · **Severity:** P1 · **Area:** Database / Concurrency
**Location:** `server.js:787-845`
**Problem:** One `INSERT` per relayed command, plus a **2 % probabilistic inline range `DELETE`**
on the same hot table from the request path.
**Impact:** At 1,000 users, roughly 20 concurrent unbounded range deletes per second competing
with inserts for locks.
**Recommended solution:** Buffer inserts (100 ms → multi-row `INSERT`); partition
`project_command_log` by day and drop partitions on a schedule.
**Complexity:** 3–4 d · **Perf impact:** 20–50× fewer round trips; removes a lock-contention
source · **Risk:** Low

---

**ID:** L-792 · **Severity:** P1 · **Area:** Concurrency / UX
**Location:** `projectStore.createVersionTransactional` (steps 1, 2c, 3, 5)
**Problem:** The `SELECT … FOR UPDATE` lock is held across two `COUNT(*)`s **and** the
multi-megabyte JSONB insert; and the `expectedVersionCount` precondition makes two legitimate
co-editors 412 each other by design.
**Impact:** Co-editors serialise on multi-second writes, then one of them loses. Combined with
L-336 ⟳ this is currently invisible — it becomes the top user-facing bug the moment membership is
wired.
**Recommended solution:** Move the insert outside the lock (use an advisory lock on `project_id`
for the count check only); replace `version_count` recounts with a trigger or increment; give the
client a real merge path (which is what the unwired CRDT layer is for).
**Complexity:** 5 d (locking) — full fix depends on L-786/L-391 ⟳ · **Perf impact:** removes
co-editor stalls · **Risk:** Medium

---

**ID:** L-793 · **Severity:** P1 · **Area:** Commands / Architecture
**Location:** ~236 `commandManager.execute()` sites; `scripts/check/ci-check-no-commandmanager.mjs`
**Problem:** Two mutation systems. The ratchet reached "zero tolerance" by excluding `apps/`,
where the largest concentration lives (plus 22 sites in `plugins/annotations`).
**Impact:** Undo must reconcile three stacks by timestamp (`performUndoRedo.ts`); the bus carries
permanent special-casing for legacy bridge handlers; P6 is only partially true.
**Recommended solution:** Extend the gate to `apps/` with a descending threshold (current count →
0), starting with `plugins/annotations` and the plan-tool handlers. Add `annotation.batch.create`
in the same pass.
**Complexity:** 10–15 d · **Perf impact:** indirect · **Risk:** Medium (undo behaviour)

---

**ID:** L-795 · **Severity:** P2 · **Area:** WASM / Rendering (client-side only — no server cost)
**Location:** `packages/geometry-kernel/src/producers/wallVoids.ts:66-71`;
`apps/editor/src/engine/singleVolumeWallProducer.ts`
**Problem:** N sequential `await produceBoolean('subtract', …)` — one WASM round trip and one
discarded intermediate mesh **per opening** — executed on the main thread.
**Recommended solution:** Union the opening boxes once, then a single subtract; move production
into the existing `geometry-kernel` browser worker.
**Complexity:** 4–6 d · **Perf impact:** ~2× fewer crossings; unblocks the main thread on bulk
regeneration · **Risk:** Low

---

**ID:** L-391 ⟳ (open since 2026-07-17) · **Severity:** P0 · **Area:** Collaboration
**Location:** `apps/sync-server/**`, `packages/sync-client/**`, `engineLauncher.ts:854-891`
**Problem:** A complete Yjs CRDT stack — server, client, per-level doc adapter, conflict resolver,
awareness, locks, chaos-test harness — exists, is tested, and is not deployed. The flag is off and
`VITE_SYNC_URL` is unset.
**Impact:** Production collaboration is last-writer-wins full-snapshot, i.e. the thing CRDT was
built to replace. This is also the natural home for the fix to L-786 and L-792.
**Recommended solution:** Deploy `apps/sync-server` as a separate Fly app with Redis-backed
persistence; enable the flag for a pilot cohort. Sequence it **after** L-336 ⟳ (membership) so there
is more than one user who can connect.
**Complexity:** 10–15 d · **Perf impact:** replaces snapshot saves with CRDT deltas · **Risk:**
Medium-High — but the chaos harness already exists, which materially de-risks it

---

### P2 — fix before or shortly after production

| ID | Area | Problem | Fix | Days |
|---|---|---|---|---|
| L-795 | Geometry | Wall CSG: N sequential WASM crossings, on the main thread | Union voids → 1 subtract; move to the kernel worker | 5 |
| L-796 | Commands | `curtain-wall.*` vs `curtainwall.*` duplicate namespace | Canonicalise + CI naming check | 1 |
| L-797 | Commands | 13 of 40 types lack `.batch.create` | Add batch handlers; consider `executeCommands()` | 5 |
| L-798 | DB | `listProjects` LATERAL runs ×50 per hub load | `DISTINCT ON` — **only if still hot after L-788** | 2 |
| L-799 | Architecture | Domain services in `apps/editor/src/engine/`; 20 zoning proxies in the monolith | Move to `packages/`; extract `apps/api-gateway` | 16 |
| L-800 | Testing | No load harness; no multi-user test; ≥6 runners, no root `npm test` | k6 at 1,000 VUs → two-user test → one entry point | 5 |
| L-801 | Documentation | No concurrency model, no source-of-truth table, no element-lifecycle doc, perf budgets ungated | `C16-CONCURRENCY-AND-SCALE.md`, `C17-ELEMENT-LIFECYCLE.md` | 4 |
| — | Rendering | Instancing defeated by per-element unique materials | Material dedup key in `MaterialPool` | 5 |
| — | Alignment | Room topology re-derives document-wide | Dirty-region invalidation | 8 |
| — | Builders | Two wall-with-opening implementations | Converge on single-volume CSG | 8 |
| — | Error handling | Three error styles, no written rule | Document + enforce | 2 |

*(Rows marked "—" are folded into `L-802` in the issue log rather than carrying their own IDs.)*

### P3 — improvement / cleanup — **all folded into `L-802`**

| Area | Problem | Days |
|---|---|---|
| Rendering | Second, vendor-owned rAF loop (OBC); camera state has two owners | 3 |
| Stores | Non-stores living in `packages/stores` (38 stores + schedulers + propagators) | 3 |
| Camera | `new THREE.Vector3` in interaction paths (62 sites in 2 files) | 2 |
| DB | `version_count` maintained three different ways | 2 |
| UI | Property panel has no virtualisation for large selections | 3 |
| Server | `_userEmailCache` / `_inMemoryProjects` unbounded | 1 |
| WASM | `Uint16Array → Uint32Array` widen per CSG lift | 0.5 |
| Repo hygiene | Mixed CRLF/LF; no `* text=auto` in `.gitattributes` | 0.5 |

**`L-803`** records the *non-defects* — the subsystems checked and found sound — so the next audit
does not re-derive them and so the strengths are not lost between assessments.

---

## Recommended Refactoring Plan

### Immediate fixes — week 1 (≈5 days, low risk, deploy incrementally)

These are worth doing **before** any further analysis, because several of them change what a load
test would measure.

1. **L-800 (k6 scenario)** — 1,000 VUs across hub load, project open, autosave, socket join,
   command relay. *(1 d)* — **this replaces every estimate in this document with a measurement,
   and should therefore go first, not last.**
2. **L-788** — add the three missing indexes. *(0.5 d, est. 10–100× on project open)*
3. **L-789** — gate the in-memory degrade to non-production; return 503. *(1 d)*
4. **L-787** — pool `max: 25`; move `statement_timeout` into the connection string. *(1 d)*
5. **L-770a** — resize to `performance-2x` (2 vCPU / 4 GB). *(0.5 d)*
6. **L-796** — canonicalise the curtain-wall namespace. *(1 d)*
7. **L-802(g)** — `* text=auto` in `.gitattributes`. *(0.5 d)*

**Expected after week 1:** roughly 100–200 concurrent users on small documents, with honest
failures instead of silent data loss.

### Short-term — weeks 2–6 (≈20 days)

8. **L-336 ⟳** — wire `project_members` into the access gate. Multi-user becomes possible. *(5 d)*
9. **L-770 ⟳** — Redis + Socket.io adapter; move rate-limit store, email cache and migration flag
   to Redis. *(5 d)*
10. **L-790** — re-key rate limits to `userId`. *(3 d)*
11. **L-791** — batch the command log; partition it. *(4 d)*
12. **L-442 ⟳** — precompile the server. *(3 d)*

**Expected after week 6:** correct multi-instance operation; ~300–500 concurrent users; genuine
(if lossy) collaboration.

### Long-term architecture — months 2–4

13. **L-786 + L-391 ⟳ together** — this is one project, not two. Deploy `apps/sync-server`, move
    autosave from full snapshots to the patch stream the bus already emits, keep snapshots for
    versioning and compaction. Ship behind a flag with snapshot fallback. *(25–35 d)*
14. **L-770b** — N stateless instances with CPU autoscaling, once 13 removes the write bottleneck.
    *(5 d)*
15. **L-793** — finish the command migration; extend the gate to `apps/`. *(15 d)*
16. **L-794** — `SceneRegistry` as the authoritative index. *(12 d)*
17. **L-799** — restore the Core/App boundary; extract the API gateway. *(16 d)*

**Expected at completion:** 1,000+ concurrent users, with headroom set by Supabase tier rather
than by architecture.

---

## Final Production Readiness Verdict

# 🔴 NOT READY

**For 1,000 concurrent users.** Not a judgement about code quality — the client architecture is
good, the CI discipline is real, and the inline incident documentation is exemplary. It is a
judgement about three specific, verifiable facts:

1. **One 1-vCPU / 512 MB machine**, whose own configuration file states it is tuned for ~50
   concurrent editors. 20× short, with no autoscaling.
2. **No Socket.io adapter**, which makes the only available scaling direction a *correctness*
   regression rather than a capacity improvement.
3. **Whole-document JSONB persistence** — ~16.6 MB per save per user, measured by the codebase
   itself — through a pool of ten connections, when the command bus already computes the exact
   deltas that would make this cheap.

Two further findings mean the target is not just unreachable but partly mis-specified:
**collaboration is owner-only** because `project_members` is never consulted by the access gate
(L-336 ⟳), and the **CRDT stack that would fix the persistence model is written, tested, and not
deployed** (L-391 ⟳). "1,000 concurrent users" today would describe 1,000 people editing 1,000
separate documents alone.

**What is achievable, and when:**

| Milestone | Effort | Realistic ceiling |
|---|---|---|
| Today | — | ~50 concurrent editors |
| Immediate fixes (week 1) | 5 d | ~100–200, small documents, honest failures |
| Short-term (week 6) | +20 d | ~300–500, correct multi-instance, real collaboration |
| Long-term (month 4) | +75 d | **1,000+**, bounded by DB tier not architecture |

**The single most important next action** is not on this list of fixes: it is to **run the load
test (T-1)**. Every capacity number in this document is derived from reading code and
configuration. That is enough to establish the verdict — the single-machine and no-adapter
findings are not sensitive to measurement — but the *ordering* of everything after week 1 should
be decided by a profile, not by this document. The repo's own `§CONTEXT-DATA-HONESTY` principle
applies to audits too: ship the probe before the fix.

---

---

## Reconciliation with `ISSUE-LOG.md`

This audit was run independently and then reconciled against the log. **Four of its ten critical
findings were already recorded**, which is worth stating plainly rather than presenting them as
discoveries:

| Already logged | Recorded by | Status | This audit adds |
|---|---|---|---|
| **L-770** | launch-readiness assessment, 2026-08-08 | OPEN, "acceptable for a closed beta" | The disposition is correct for a beta and wrong for this target. Also: the missing-adapter half must be fixed *before* the resize half, or scale-out is a correctness regression. |
| **L-336** | CATEGORY-READINESS-AUDIT, 2026-07-16 | OPEN, "architectural launch-blocker" | Re-confirmed at `projectAccess.js:96,116,137`. Adds the consequence chain: it is also why no test caught it, and why L-792's co-editor 412 is currently invisible. |
| **L-391** | category-readiness audit, 2026-07-17 | OPEN | Adds that this is the natural home for the L-786 fix — CRDT deployment and delta persistence are **one project, not two**. |
| **L-442** | deploy failure, 2026-07-20 | closed with a different root cause (L-444) | The `tsx`-at-boot cost was never removed, only deprioritised. It becomes blocking again the moment autoscaling is introduced, because boot time is scale-out latency. |

**Genuinely new in this audit: L-786 … L-803** (18 rows, several grouping multiple findings), of
which three are P0 — **L-786** (snapshot persistence), **L-787** (pool size), **L-789** (the
degrade path that reports success on a failed write) — and seven are P1. `L-802` groups the P3
cleanups; `L-803` records the non-defects so the next audit does not re-derive them.

New rows to be appended to `docs/04-reference/ISSUE-LOG.md`; the four ⟳ rows above need a
disposition update, not a new row.
