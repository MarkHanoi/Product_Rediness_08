# PERF — Project-Open / Project-Create / Batch-AI-Generation Slowness (2026-06-03)

**Scope:** PRYZM's #1 daily-use complaint — "too slow — project creation, batch apartment AI
generator." This is a **different axis** from the door-move/view-switch analysis
([`PERF-REALTIME-EDIT-AND-VIEW-SWITCH-2026-06-03.md`](./PERF-REALTIME-EDIT-AND-VIEW-SWITCH-2026-06-03.md)
+ [ADR-057](../../02-decisions/adrs/ADR-057-realtime-geometry-and-view-interactivity.md)): this
is the **boot / project-open critical path** and the **batch-generation commit path**, not
realtime editing.

**Companion specs/contracts:** governed by
[`SPEC-PROJECT-OPEN-CREATE-PIPELINE.md`](../specs/SPEC-PROJECT-OPEN-CREATE-PIPELINE.md) (the
O1–O10 stage breakdown), `C02-COMPOSITION-ROOT-AND-BOOT`, `C13-PROJECT-LIFECYCLE-AND-ISOLATION`,
`C10-PERFORMANCE-AND-OBSERVABILITY`. This doc closes the open OI-053 sub-items **(c)** and **(d)**
with a concrete root cause + fix plan and adds the batch-generation axis the spec did not cover.

**Headline finding:** The engine bootstrap is **correctly one-time** per tab (`_bootstrapped`
guard) and the empty-project **data load is genuinely ~0 ms** (`PHASE_TIMINGS` all-zero). The
**768 ms LONGTASK on every project open is the WebGPU TSL render pipeline being torn down and
rebuilt per project switch** — `onProjectSwitch` disposes the outline GPU instances, then
`onProjectLoaded` re-runs `activateOutlines()` → `createOutlinePasses()` (fresh GPU targets) →
`_buildPhase3Pipeline()` (SSGI + Denoise + outline node graph re-authored, old `RenderPipeline`
disposed, WebGPU shaders recompiled). None of that depends on project content, so it is pure
**redundant per-open work that should be done once.** The batch generator's slowness is a separate
compound: a **two-phase wall-then-doors split gated by a ~150 ms-cadence poll loop**, plus **each
door's `CreateWallOpeningCommand` triggering a whole-level wall rebuild** (the ADR-057 hole-rebuild
cost, now multiplied by door count), plus **two `REDETECT_ROOMS` sweeps** and a deferred room-name
pass.

---

## §1 — Evidence (live console log, 2026-06-03, fresh EMPTY project)

| Fact | Value | Reading |
|---|---|---|
| FPS during open | `1fps` → `8fps` → `22fps` then recovers | Main thread is saturated for ~1 s during open. |
| Largest LONGTASK | **768 ms** (start ≈ 23372 ms) | One dominant blocking task on the open path. |
| Other LONGTASKs | 297, 217, 174, 166, 149, 136 ms + many 50–100 ms | A cluster, not a single cause — but 768 ms dominates. |
| `ProjectLoader` `PHASE_TIMINGS` | total ≈ **458 ms with ALL sub-phases 0.0 ms** for an empty project (0 walls / 0 levels) | **Data load is NOT the cost.** The 458 ms wall-clock is wait/scheduling around near-zero data work; the geometry-hydration phases are genuinely empty. The cost is elsewhere on the open path. |
| Render pipeline | `RenderPipelineManager` walks phase2→3→4, `SSGI activated (SSGINode + DenoiseNode)`, `three/tsl loaded`, `Outlines activated` — **on each project switch** | The TSL pipeline is being rebuilt per open, not reused. |
| `§I2 pipeline.usedTimes is not a number (got undefined) — patching to 0 before dispose` | `RenderPipelineManager.ts:1212`, fired **multiple times per open** | A `RenderPipeline` is being **disposed + recreated** during a routine open. |
| `onProjectSwitch` + `onProjectLoaded` | both re-activate outlines / clear refs; `initScene` "re-runs a lot" | Per-open re-activation path confirmed. |
| Batch generator | `pryzmGenerateApartmentLayout` → `ApartmentLayoutExecutor` → `wall.batch.create` + per-door `CreateWallOpeningCommand` + room redetect; `§POLL-TELEMETRY` wall-poll loop | Multi-phase commit with a poll gate (below). |

---

## §2 — Project-open critical-path trace (cited)

Call chain (from `SPEC-PROJECT-OPEN-CREATE-PIPELINE.md §1` + verified):

```
ProjectHub.openProject (apps/editor/src/ui/platform/ProjectHub.ts:1399)
  └─ callbacks.onOpenProject → PlatformRouter → runtime.persistence.openProject
       └─ buildPersistence.ts:205 openProject()
            1. resolve summary (refresh if store empty)            :211-222
            2. attachedBootstrap.ensure()  → startEngine (main.ts) :230-232   ← ONE-TIME (guarded)
            3. tier.streamLoad(id)         → /latest-version       :239        ← null for new project
            4. attachedSurface.setProjectContext(...)              :247-260   ← fires the switch/loaded events
       └─ ProjectLoader.load(snapshot)  → Create*Command replay + re-projection
```

### 2.1 Engine bootstrap is correctly one-time (NOT the cost)

`startEngine()` is guarded by the module-level `_bootstrapped` flag (`src/main.ts:170-191`): it is
set `true` only **after** `mod.bootstrap()` resolves, so the heavy `initScene` / `initBuilders` /
`initTools` / `initStores` / `initDataPlatform` / `initUI` chain (SPEC stages O2/O4–O9) runs **once
per tab (cold boot)**, not per open. `O-INV-1` in the spec is satisfied. **This means the
per-open 768 ms is NOT engine startup work being re-entered** — bootstrap does not re-run on the
second/third open. The console showing `startEngine` / `initBuilders` etc. is the *first* cold boot;
subsequent opens skip it. So the recurring per-open LONGTASK must come from work that *does* re-fire
on every `setProjectContext` — i.e. the project-switch / project-loaded event handlers.

### 2.2 What DOES re-run per open: the project-switch + project-loaded handlers

`setProjectContext` ultimately emits `pryzm-project-switch` then (after hydrate) `pryzm-project-loaded`.
Both have **many** subscribers that re-fire on every open. The expensive one is the render pipeline
(§3). Others that re-run per open and contribute to the LONGTASK cluster:

- `initScene.ts:1772-1837` — `pryzm-project-switch`: `renderPipelineManager.onProjectSwitch()`,
  `viewController.clearCameraStateStore()`, `edgeProjectorService.clearCwProjectionCache()`, mounts
  a freeze-frame overlay.
- `initScene.ts:1851-1860` — `pryzm-project-loaded`: `renderPipelineManager.onProjectLoaded()` (the
  big one, §3).
- `ConstraintEngine.ts:111` — `pryzm-project-loaded` → `_scheduleRun()` (debounced 600 ms; suppressed
  during batches — `ConstraintEngine.ts:248-256`). Its 17-rule build (~230 ms) is already idle-deferred
  (`:113-123`), so it is off the open critical path. Benign.
- 20+ other `pryzm-project-loaded` listeners (DataWorkbench panels, `initDataPlatform`, `initUI`,
  `initCollaboration`, `UnderlayPersistence`, `FrustumCullingService`) — each individually cheap
  (panel re-renders / cache binds) but collectively the source of the 50–100 ms LONGTASK tail.

**`PHASE_TIMINGS` all-zero confirms the data-replay (`ProjectLoader` → `Create*Command`) is not the
cost for an empty project** — the cost is the render-pipeline rebuild + the event-handler fan-out.

---

## §3 — Root cause of the 768 ms LONGTASK: the render pipeline is rebuilt per project switch

**The TSL render pipeline (SSGINode + DenoiseNode + outline node graph + final composite) is GPU
state that does not depend on project content, yet it is disposed and re-authored on every project
open.** Trace:

1. **On `pryzm-project-switch`** → `RenderPipelineManager.onProjectSwitch()`
   (`RenderPipelineManager.ts:763-775`): clears `_selectedObjects` / `_hoveredObjects`, calls
   `_disposeOutlineInstances()` (`:767`) which disposes the selected + hover outline GPU instances
   (`:1232-1238`), and sets `_outlinesActive = false`. The pipeline rebuild is **intentionally
   deferred** to `onProjectLoaded` (`:770-774`) to avoid a blank frame mid-load — correct for
   correctness, but it means the rebuild still happens, just later.

2. **On `pryzm-project-loaded`** → `RenderPipelineManager.onProjectLoaded()`
   (`RenderPipelineManager.ts:797-813`): after a 300 ms debounce, calls **`activateOutlines()`**.

3. **`activateOutlines()`** (`RenderPipelineManager.ts:932-954`):
   - `await import('./OutlinePass')` then `createOutlinePasses(scene, camera, selected, hovered)`
     (`:938-945`) — **allocates fresh GPU render targets** for the selected + hover outline passes.
   - then `await this._rebuildPipelineWithCurrentState()` (`:949`).

4. **`_rebuildPipelineWithCurrentState()`** (`:1245-1250`) → **`_buildPhase3Pipeline(cachedAo, cachedGi)`**
   (`:1061`): re-authors the **entire Phase-3/4 TSL node graph** — ScenePass MRT, ZonePass,
   SSGINode, DenoiseNode, the outline composite, TRAA filter, background blend — and constructs a
   **new `RenderPipeline` (three/webgpu)**, which on a WebGPU backend triggers **shader (WGSL)
   compilation** of the recomposed graph.

5. **Disposing the OLD pipeline** runs through `_safeDisposeRenderPipeline()`
   (`RenderPipelineManager.ts:1199-1224`): the `§I2` log fires here (`:1212-1216`) because the
   outgoing `RenderPipeline.usedTimes` is `undefined` on a pipeline that was constructed but whose
   first frame had not yet rendered — it is null-guarded to `0` before `dispose()` to avoid a
   device-loss cascade. **Seeing `§I2` fire multiple times per open is the direct fingerprint of
   multiple dispose/recreate cycles on one open** (phase ramp + outline re-activation + any
   shadow/camera rebuild that lands in the same window).

**Why this is the 768 ms:** disposing and recreating a WebGPU render pipeline = freeing GPU
targets + re-authoring a multi-node TSL graph + recompiling shaders. That is exactly the kind of
single, synchronous, hundreds-of-ms main-thread task that shows up as one big LONGTASK, and it is
**100 % redundant across project switches** — the SSGI/Denoise/outline graph is identical for
project B as it was for project A. The only project-dependent inputs are the *contents* of the
`_selectedObjects` / `_hoveredObjects` arrays, which are passed **by reference** to OutlinePass and
are designed to be mutated via `setSelectedObjects()` / `setHoveredObjects()` **without** rebuilding
the pipeline (`:927-930`). So the per-open teardown defeats the very decoupling the manager already
provides.

**SPEC cross-ref:** this is exactly OI-053 sub-item **(d)** — "`RenderPipelineManager` phase-ramp
churn (`§I2 usedTimes` dispose/recreate during SSGI/outline activation)" — previously "Open (needs
profiler)". This analysis supplies the profiler answer: the churn is **driven by the per-open
`onProjectSwitch`→`onProjectLoaded` outline re-activation**, not by the cold-boot phase ramp alone.

### 3.1 Why `onProjectSwitch` disposes at all

The dispose exists for two real reasons: (a) the outline passes hold **stale `Object3D` references**
to the previous project's selected/hovered meshes, which must be cleared on isolation
(`C13`); (b) a historical bug where leaving outlines active across a switch left them permanently
disabled (`RenderPipelineManager.ts:754-760`). **Both are satisfiable by clearing the *arrays* and
re-pointing the outline passes — neither requires disposing the GPU targets or rebuilding the node
graph.** Clearing `_selectedObjects.length = 0` / `_hoveredObjects.length = 0` (already done at
`:765-766`) plus a `setSelectedObjects([])` / `setHoveredObjects([])` re-point is sufficient; the
full `createOutlinePasses` + `_buildPhase3Pipeline` is over-kill for an isolation reset.

---

## §4 — Batch apartment-AI-generation cost analysis

Path: `pryzmGenerateApartmentLayout` / `generateApartmentFromScratch` → `apartment.layout-execute`
→ `ApartmentLayoutExecutor._execute` (`ApartmentLayoutExecutor.ts:64`). The generate/scoring (D-TGL
/ token relay) is *upstream*; this section is the **commit path** that runs after an option is
chosen. The commit is deliberately **two-phase** and that structure is the dominant cost:

### 4.1 Phase 1 — walls (one batch, good)

`ApartmentLayoutExecutor.ts:157-179`: all interior partition walls go through **one**
`wall.batch.create` inside `batchCoordinator.runBatch(...)` with `skipRedetectRooms: false`. This is
the *correct* pattern (one `produceCommand`, chunked `endBatchYielded` drain — cf. the
batch-creation-perf memory note). The `BatchCoordinator` already coalesces the storeEventBus flood
(`BatchCoordinator.ts:53-63`: 5 859 events → chunked) and ConstraintEngine self-suppresses while
`isBatching` (`ConstraintEngine.ts:248-251`). **Phase 1 is not the structural problem.**

### 4.2 Phase 2 — the wall-poll gate (`§POLL-TELEMETRY`) — latency, not CPU

Because the bus is async and `wall.createOpening`'s `canExecute` **reads the wall store** which is
only populated when the Phase-1 batch *drains*, doors cannot share Phase 1's batch
(`ApartmentLayoutExecutor.ts:150-156`). So `_finishLayout` **polls the wall store at ~150 ms cadence**
until every host wall id exists (`:359-367`, `tick(40)` → up to ~6 s budget). On a normal build this
adds **one or more 150 ms quanta of pure wall-clock latency** between "walls placed" and "doors
placed" — the user sees walls appear, then a visible pause, then doors. It is mostly *waiting*, not
CPU, but it is user-perceptible dead time and it serialises the build.

### 4.3 Phase 2 — doors: each `CreateWallOpeningCommand` is a whole-level wall rebuild

`ApartmentLayoutExecutor.ts:313-336`: doors + shell windows + room-boundary lines are created inside
**one** `runBatch`, each via the **legacy synchronous `CreateWallOpeningCommand`**. Each opening
mutates its host wall's openings, which (per the ADR-057 analysis) triggers
`WallRebuildCoordinator._flush` — a **whole-level** pass: `WallJoinResolver.resolveLevel(levelWalls)`,
level-wide `refreshV2Cache`, per-wall `buildWall` (full dispose/recreate), `computeJunctionInfills`,
and a door/window re-anchor sweep
([ADR-057](../../02-decisions/adrs/ADR-057-realtime-geometry-and-view-interactivity.md);
`WallRebuildCoordinator.ts:289-466`). Wrapping them in `runBatch` coalesces the **room redetect** and
the store-event flood, but it does **not** coalesce the **geometry rebuilds** — `WallRebuildCoordinator`
schedules its own rAF flush per affected level. For an apartment with *D* doors on a level of *W*
walls, the opening creation drives geometry work that scales with **W per affected flush**, i.e. the
same O(walls-per-level) hole-rebuild cost ADR-057 identifies, now incurred during the batch. This is
the **CPU** half of the batch hitch.

### 4.4 Room redetect + constraint re-run + room-naming tail

- `skipRedetectRooms: false` on **both** Phase 1 and Phase 2 batches → **two `REDETECT_ROOMS`
  sweeps** over the level (`BatchCoordinator.ts:108`, `:210-214`). The first (after walls) is largely
  wasted because the openings/boundaries that actually split the open-plan zone land in Phase 2.
- After the Phase-2 batch settles, `ConstraintEngine._scheduleRun()` fires (debounced 600 ms,
  `ConstraintEngine.ts:253-256`) once `isBatching` clears — a full `validateAll` over all 17 rules.
- `_nameDetectedRooms` (`ApartmentLayoutExecutor.ts:381-476`) then subscribes to the room store with
  an 80 ms settle debounce and a **2.5 s hard-timeout fallback** (`:469-472`), and on fire issues a
  third `runBatch` of `room.rename` commands (`:457-462`, `skipRedetectRooms: true` — good). The
  2.5 s fallback is a worst-case tail when room events don't arrive promptly.

### 4.5 The render-pipeline rebuild compounds the batch too

The batch runs **while a project is open**, so the §3 per-open pipeline rebuild has already happened;
but every `REDETECT_ROOMS` / large geometry mutation that lands while SSGI is active can also schedule
a **shadow rebuild** (`scheduleShadowRebuild` → `_rebuildPipelineWithCurrentState`,
`RenderPipelineManager.ts:486-531`) — another dispose/recreate, another `§I2`. Fixing §3 (don't
dispose/rebuild the pipeline for content changes; mutate uniforms/targets in place) also reduces the
batch's GPU churn.

---

## §5 — Ranked fixes (quick wins first)

### Quick wins (no architecture change; low risk)

**Q1 — Don't rebuild the render pipeline on project switch; re-point the outline arrays instead.**
★ highest leverage — directly kills the 768 ms.
In `onProjectSwitch` keep the array clears (`_selectedObjects.length = 0` / `_hoveredObjects.length = 0`)
and call `setSelectedObjects([])` / `setHoveredObjects([])` to drop stale `Object3D` refs, but
**skip** `_disposeOutlineInstances()` + the `onProjectLoaded` `activateOutlines()` re-activation when
the pipeline is **already built and outlines were already active** (i.e. on 2nd+ open in a tab).
Gate `onProjectLoaded`'s `activateOutlines()` on `!this._outlineNodes` (build once) — if the outline
passes already exist, the project switch only needs the array re-point, which is O(1) and needs **no
GPU dispose, no node-graph re-author, no shader recompile**.
- *Effort:* S–M (a guard in `onProjectSwitch` + `onProjectLoaded`; outline passes hold arrays by
  reference already, so re-point is supported by design — `RenderPipelineManager.ts:927-930`).
- *Impact:* High — removes the dominant per-open LONGTASK and the repeated `§I2` dispose churn.
- *Risk:* Low — isolation is preserved by clearing the arrays (the stale-ref concern); the
  "outlines left disabled" historical bug (`:754-760`) cannot recur because outlines stay *active*.

**Q2 — Suppress the redundant `§I2` dispose path on switch.**
Once Q1 lands, the only legitimate dispose/recreate is the **first** build + genuine
device-loss/context-restore (`initScene.ts:907`). Assert (and log once) that `_safeDisposeRenderPipeline`
is not called on a routine switch. This is mostly a *consequence* of Q1, listed separately so the
acceptance test ("zero `§I2` lines on 2nd open") is explicit.
- *Effort:* S.  *Impact:* Medium (removes the multi-fire churn + log spam).  *Risk:* Low.

**Q3 — Drop Phase 1's `REDETECT_ROOMS` in the apartment batch (set `skipRedetectRooms: true` on the
wall batch, keep it on the doors+boundaries batch).**
The walls-only sweep cannot produce the final room set (the splitting boundaries land in Phase 2), so
the first redetect is wasted work over the level.
- *Effort:* S (one flag in `ApartmentLayoutExecutor.ts:171`).  *Impact:* Medium (halves the redetect
  sweeps).  *Risk:* Low — Phase 2 still redetects; verify room count unchanged.

**Q4 — Tighten the wall-poll gate.**
Replace the fixed 150 ms `setTimeout` cadence (`ApartmentLayoutExecutor.ts:365`) with a
**store-subscription** signal (fire `go()` the instant the last needed wall id lands), keeping the
poll only as a fallback. Removes the up-to-150 ms dead quantum between walls and doors.
- *Effort:* S–M.  *Impact:* Medium (latency only).  *Risk:* Low (subscription + timeout fallback).

### Structural fixes (larger; schedule after quick wins)

**S1 — Incremental opening creation in the batch (adopt ADR-057 P1 on the create path).**
Make `CreateWallOpeningCommand` (and the `wall.createOpening` plugin) take the **openings-only,
single-wall** rebuild branch ADR-057 P1 defines — rebuild only the host wall, skip
`resolveLevel` / level `refreshV2Cache` / `computeJunctionInfills`. This collapses the §4.3
O(walls-per-level)×doors cost to O(doors). **This is the same fix ADR-057 P1 already proposes for
door-move; the apartment batch is a second, high-value caller.**
- *Effort:* M (shared with ADR-057 P1).  *Impact:* High (the batch CPU half).  *Risk:* Medium
  (correctness of the delta classification — covered by ADR-057's tests).

**S2 — Defer non-critical per-open subsystem re-binds (cold-boot deferral, OI-053c).**
Audit the 20+ `pryzm-project-loaded` listeners (DataWorkbench panels, Portfolio, AI panels) and
move non-visible-surface re-binds behind `requestIdleCallback` / first-interaction so they don't
contribute to the open-path LONGTASK tail. Many panels are not even mounted at open time.
- *Effort:* M.  *Impact:* Medium (the 50–100 ms tail).  *Risk:* Low–Medium (must not break panels
  that *are* visible on open).

**S3 — Single-batch wall+door commit (remove the two-phase split entirely).**
The two-phase split exists only because `wall.createOpening.canExecute` reads the store before the
wall batch drains. If opening creation accepted **pre-minted wall ids** (the walls are already
id-known at `buildLayoutCommands` time) and deferred its store read to execute-time, walls + openings
could share one `runBatch` → one drain, one redetect, no poll. Larger because it touches the
opening command's readiness contract.
- *Effort:* L.  *Impact:* High (eliminates Q4's latency + Q3's redundant sweep + the poll entirely).
  *Risk:* Medium–High (command-contract change; needs careful ordering tests).

**Recommended sequence:** Q1 (immediate, biggest win) → Q2 (its acceptance check) → Q3 + Q4
(batch quick wins) → S1 (shared with ADR-057 P1) → S2 → S3.

---

## §6 — Measurement plan (verify each fix)

Baseline harness (per `SPEC §6`): `npm run dev`, open console, open a project; record the LONGTASK
list (the existing `[FPS]` + LONGTASK observer already prints them), the `§I2` line count, and
`PHASE_TIMINGS`. Bench precedents exist: `apps/bench/src/benches/create-new-project.bench.ts` and the
view-switch bench.

| Fix | Metric | Pass condition |
|---|---|---|
| **Q1** | Largest open-path LONGTASK; count of `[RenderPipelineManager] Outlines activated` per open | On the **2nd** open in a tab: **no** 768 ms task; **zero** `Outlines activated` / `_buildPhase3Pipeline` (assert the pipeline object identity is unchanged across the switch). FPS does not drop below ~30. |
| **Q2** | Count of `§I2 pipeline.usedTimes` lines per open | **Zero** on 2nd+ open (non-context-loss). One allowed on cold boot. |
| **Q3** | `REDETECT_ROOMS` invocations per apartment build | Drops from 2 → 1; detected-room count identical to baseline (assert via the existing room-detection diagnostic log, `ApartmentLayoutExecutor.ts:348-353`). |
| **Q4** | `§POLL-TELEMETRY wall-poll-completed` `elapsed_ms` / `iters` | `iters` → 0–1 (fired on subscription, not a timed tick); `elapsed_ms` materially lower; `forced=false`. |
| **S1** | Per-build wall `buildWall` calls (instrument `WallRebuildCoordinator._flush`); total build wall-clock | `buildWall` count scales with **doors**, not walls×doors; total build time drops on dense levels. Join/miter regression suite green. |
| **S2** | Open-path LONGTASK tail (sum of 50–100 ms tasks) | Tail sum reduced; all visible-on-open panels still populate. |
| **S3** | Build phases: count of `runBatch` drains + redetect sweeps; walls→doors gap | One drain, one redetect, **no** poll; door build starts immediately after walls. Door/window/room counts identical to baseline. |

**Regression guards for every fix:** element creation + undo/redo (OI-054 unified path) still work;
plan/3D re-projection still fires; project isolation holds (no stale selection/hover outline from the
previous project — the explicit Q1 risk); join correctness unchanged (S1).

---

## Appendix — key files

- `apps/editor/src/ui/platform/ProjectHub.ts:1399` — `openProject` entry.
- `packages/runtime-composer/src/buildPersistence.ts:205-271` — `openProject` (resolve → boot →
  streamLoad → setProjectContext).
- `src/main.ts:170-191` — `_bootstrapped` one-time engine-boot guard (O-INV-1, satisfied).
- `apps/editor/src/engine/initScene.ts:1772-1860` — per-open `pryzm-project-switch` /
  `pryzm-project-loaded` handlers (the re-fire site).
- `packages/renderer-three/src/pipeline/RenderPipelineManager.ts`
  — `:763-775` `onProjectSwitch`, `:797-813` `onProjectLoaded`, `:932-954` `activateOutlines`,
  `:1061` `_buildPhase3Pipeline`, `:1199-1224` `_safeDisposeRenderPipeline` (`§I2` at `:1212`),
  `:1245-1250` `_rebuildPipelineWithCurrentState`.
- `apps/editor/src/ui/apartment-layout/ApartmentLayoutExecutor.ts`
  — `:157-179` wall batch, `:205-368` `_finishLayout` (poll gate `:359-367`, doors batch `:313-336`),
  `:381-476` `_nameDetectedRooms`.
- `packages/core-app-model/src/batch/BatchCoordinator.ts:53-63, 108, 210-214` — chunked drain +
  REDETECT_ROOMS sweep + `skipRedetectRooms`.
- `packages/constraint-solver/src/ConstraintEngine.ts:111, 248-256` — project-loaded auto-run,
  600 ms debounce, batch-suppression.
- `docs/03-execution/specs/SPEC-PROJECT-OPEN-CREATE-PIPELINE.md` — O1–O10 stages + OI-053 items
  (this doc closes (c) + (d)).
- `docs/02-decisions/adrs/ADR-057-realtime-geometry-and-view-interactivity.md` — the openings-only
  single-wall rebuild (S1 shares its P1).
