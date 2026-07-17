# Commercial Office-Tower Generation — Audit (L-376)

> **Scope.** The founder ran the commercial-tower use case
> (`pryzmGenerateOfficeBuilding({ stories: 40, radiusM: 22 })`, Madrid LAT 40.42) on the live
> build `main-CFCz7Acz.js` and asked to "check for errors, bugs, performance gaps". The build
> came up correctly on `webgl-fallback` (renderer pre-warm eliminated the 2.4 s LONGTASK — GOOD).
> This audit covers the office-tower generation path + the boot/runtime log signals.
>
> **Reported:** 2026-07-17 · **Status:** OPEN — UNASSIGNED · **Base ID:** L-376
> **Method:** every claim grounded in `file:line`. Cross-references L-375a–e / L-369 / L-372 /
> L-367 / OBJECT-STORAGE-GLB are noted, **not** re-diagnosed. Nothing here is marked Fixed.

---

## 1. Executive summary

The office tower is architecturally the **same executor family** as the proven residential/house
builders (`OfficeBuildingExecutor` deliberately mirrors `ResidentialBuildingExecutor`), so it
inherits their correctness — and their perf debts, **amplified ~40×** because an office tower is
40 storeys / ~2000+ elements versus a 6-storey resi.

**Top 3 errors / robustness gaps**

1. **Unsaved-local-version pileup (~30) in ProjectHub** — local-only projects with local versions
   that never flush to the server accumulate in IndexedDB with no eviction cap (storage-growth /
   sync gap, not data loss). *Distinct — persistence/sync, not office-specific, but the office is a
   heavy per-project blob so it dominates the pile.* → **L-376a** (P2).
2. **`[BimManager] Cannot delete the default Ground level.` warn + full stack on the happy clear
   path** — the L0 guard fires (correctly) on every `ClearProjectCommand`, but as a `console.warn`
   with a stack trace, reading as a false alarm on the normal project-switch/load path. → **L-376b**
   (P3, benign guard, noisy).
3. **THREE deprecation warnings** — `PCFSoftShadowMap` is silently downgraded by THREE to
   `PCFShadowMap`, so the shadow quality the `ShadowQualityUpgrader` intends is not what renders;
   plus `THREE.Clock` deprecation. Tech-debt, ties L-372. → **L-376c** (P3).

**Top 3 performance gaps** (ranked by real impact)

1. **40-storey amplification of the per-element (unbatched) dispatch (L-375d).** The office core
   emits **~78 `CreateStairCommand` + ~40–80 `CreateVerticalCirculationCommand` per-element and
   *outside any `runBatch`***, plus 40 per-storey `CreateSlabCommand`, ~38 per-storey
   `CreateFloorCommand`, and per-segment glazed-enclosure `CreateCurtainWallCommand`. Every one
   goes through `CommandManagerImpl.execute` → a `structuredClone` snapshot whose cost grows with
   the accumulating store size (**O(N·M)**), so at ~2000 elements this is the dominant main-thread
   cost of the generate. → **L-376d** (P1, *office amplification of L-375d*).
2. **Console-log flood during generation is not gated on the bulk-path flag.**
   `CommandManagerImpl.execute` logs `EXECUTE:` + `snapshot …` **per command** (unconditionally),
   and `CreateStairCommand.canExecute` logs **2 lines per call** — ~156 lines for the 78 stairs
   alone, thousands across the whole build. Violates C10 §7.1 log-gating. → **L-376e** (P2, *ties
   L-375b*).
3. **The office "generate" is not one undo unit.** Per C16 §8.6 / B-6 ("a batch is **not** an undo
   unit"), the hundreds of per-element `cm.execute` calls each push their own history entry, so
   reversing one office build takes **hundreds of Ctrl+Z presses** — directly contradicting the
   executor's own header comment ("ONE `batchCoordinator.runBatch` (one undo unit)"). → **L-376f**
   (P2/P3, *office amplification, C16 conformance*).

**Biggest architecture concern.** The office executor is faithful to the resi template, but the
resi template itself violates **C16 §8.6/B-6** and **C10 §7** for its per-element (non-`*.batch.`)
element kinds (stairs, lifts, slabs, floors, curtain-walls have no bus batch handler). At resi
scale that is tolerable; at 40 storeys it is the difference between a smooth generate and a jank/
freeze. The correct fix is **not** office-local — it is to give stairs/lifts/slabs/floors a
`*.batch.create` bus handler (C16 §8 canonical batch pattern) so *all* aggregate builders coalesce.
Fixing it only inside `OfficeBuildingExecutor` would fork the resi/office pipelines — forbidden by
the standing "reuse resi+house pipeline" mandate.

**Good news (verified OK — not issues).** The proactive WebGPU→WebGL heavy-scene swap **does** fire
for the office path — `beginBuildingGeneration('office-building', …)` at
`OfficeBuildingExecutor.ts:380` opens the §AUTO-WEBGL-HEAVY-PROACTIVE / ADR-0267 / L-367 lifecycle
before the first heavy structural sub-batch, and the same lifecycle applies the L-372 whole-
generation shadow suppression (`buildingGenerationLifecycle.ts:108–116`). The 880 perimeter glazing
windows are punched in **one** `CreateWallOpeningsBatchCommand`
(`OfficeBuildingExecutor.ts:667–690`) — correctly batched. Walls/room-lines/rooms all use their
`*.batch.create` / `Batch*Command` paths (compliant).

---

## 2. Errors / robustness table

| # | Finding | file:line | Sev | Impact | Fix direction |
|---|---------|-----------|-----|--------|---------------|
| L-376a | Unsaved local-only projects accumulate in IndexedDB; the sync loop keeps every local-only project whose `versionRepository.getVersions()` is non-empty and never flushes them to the server. ~30 kept per boot; no cap / eviction. | `apps/editor/src/ui/platform/ProjectHub.ts:218-234` (log at `:228`) | P2 | Unbounded IDB growth (a 40-storey office version blob is large). Eventual quota-exceeded → save/list failures. **Not** data loss (conservatively kept). Partly by-design for free-plan (comment `:215-217`). | Add a version-count/size cap + LRU eviction of orphaned local-only projects, and/or a background "flush local versions to server" reconcile pass. Gap in C05/C08 — no eviction policy exists. |
| L-376b | `removeLevel('L0')` early-returns with `console.warn(… + stack)`. `ClearProjectCommand` step 14 iterates **all** levels incl. `L0`, so the guard fires on every project clear/switch/load. | warn: `packages/core-app-model/src/BimKernel.ts:381-385`; caller: `packages/command-registry/src/project/ClearProjectCommand.ts:179-181` | P3 | Benign — guard works as intended (L0 must persist; `activeLevelId` reset to L0 at `ClearProjectCommand.ts:237`). But a stack-trace `warn` on the happy path reads as a real error and adds console noise on every switch. | Exclude `'L0'` from the `removeLevel` loop (`ClearProjectCommand.ts:179` — filter `l.id !== 'L0'`), so the guard never fires on the happy path; or downgrade the guard to `debug`. Correct-fix = filter at the caller (intent is explicit). |
| L-376c | `THREE.WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead` + `THREE.Clock: deprecated. Please use THREE.Timer`. Sources set `PCFSoftShadowMap`. | `packages/core-app-model/src/rendering/PhotorealisticRenderer.ts:101`; `packages/core-app-model/src/rendering/ShadowQualityUpgrader.ts:53/61/69/156/257` | P3 | THREE **silently downgrades** `PCFSoftShadowMap`→`PCFShadowMap`, so the soft-shadow quality `ShadowQualityUpgrader` intends is not what renders — a real (if small) quality regression, relevant to the L-372 shadow work. P2 note: both files legally import THREE via the `@pryzm/renderer-three/three` facade (`:22`/`:26`) — **not** a P2 violation; the renderer-three adapters already use the correct `PCFShadowMap` (`WebGPURendererAdapter.ts:156`, `WebGLRendererAdapter.ts:100`). `THREE.Clock` source not found in first-party `src/` (grep clean) — **UNVERIFIED — likely THREE-internal or a vendored lib (Cesium)**; run once with a `console.trace` shim to confirm. | Replace `PCFSoftShadowMap` with `PCFShadowMap` (or the VSM path) in `PhotorealisticRenderer` + `ShadowQualityUpgrader`; migrate `Clock`→`Timer` at the confirmed source. Tech-debt, batch with L-372. |
| L-376g | `[EngineBootstrap] O.8: collaboration/CRDT wiring deferred to idle (post-paint)`. | boot log (EngineBootstrap O.8) | P3 (note only) | Office generation is single-user local dispatch, so it works; but if the CRDT applier is never wired (**L-375a**), the office build does not replicate to peers. **Tie noted, not re-diagnosed** — see L-375a. | Resolve under L-375a. |

Furniture GLB 404s (`/items/Sofas/*/model.glb`) are **KNOWN** (tracker `OBJECT-STORAGE-GLB`, the
`.dockerignore` excludes the 185 MB catalog) — noted only, not re-logged.

---

## 3. Performance gaps (ranked)

### L-376d — 40-storey amplification of the per-element (unbatched) dispatch — **P1** · *ties L-375d*

**What.** `OfficeBuildingExecutor._buildCoreServices` emits vertical circulation **per element and
outside any `runBatch`**:

- **Stairs:** `for (let idx = 0; idx < topIndex; idx++) for (const stair of [main, fire]) _emitCoreStair(…)` →
  ~**78** individual `CreateStairCommand` (`OfficeBuildingExecutor.ts:992-1003`, emit at `:1105`).
- **Lifts:** `for (const idx of mintedIndices) for (const lift of core.lifts) cm.execute(new CreateVerticalCirculationCommand(…))` →
  ~**40–80** individual commands (`OfficeBuildingExecutor.ts:1007-1027`).
- **Slabs:** 40 per-storey `CreateSlabCommand` inside the structural `runBatch`
  (`OfficeBuildingExecutor.ts:387-396`) — *batched for room-redetect, but each still snapshots +
  logs + pushes undo* (runBatch is undo-neutral, see L-376f).
- **Floor finishes / storey plates / glazed enclosures:** per-room / per-storey / per-segment
  `CreateFloorCommand` and `CreateCurtainWallCommand` (`:1314-1338`, `:1375-1396`, `:1192-1209`).

**Why it costs.** Every `cm.execute` that is not `source:'PROJECT_LOAD'` runs
`createSnapshot(command)` — a `structuredClone` of the command's `affectedStores`
(`CommandManagerImpl.ts:120-127`, `:238-290`). `CreateStairCommand.affectedStores =
["stair","opening","slab"]` (`CreateStairCommand.ts:91`) and `CreateSlabCommand.affectedStores =
["slab","level"]` (`CreateSlabCommand.ts:31`) are *scoped* (good — not the legacy `ALL`), but those
stores **grow as generation proceeds**, so cloning them 78× (stairs) + 40× (slabs) is a cumulative
**O(N·M)** cost: the snapshot of the slab store on stair #78 clones all ~40 slabs, etc. At ~2000
elements this is the dominant main-thread cost of the office generate — exactly the L-375d finding,
scaled by 40.

**Office-specific vs resi-amplification.** *Amplification* of L-375d — the mechanism is identical
to resi; the tower's storey count and 78-stair core make it dominate. No new office-only root here.

**Fix.**
- *Fast-fix:* wrap the stair + lift loops in a single `batchCoordinator.runBatch(fn, { levelIds,
  totalElementCount, skipPbrUpgrade: true, skipRedetectRooms: true })` (they are currently outside
  any batch) so at least the render/redetect side is suppressed — but this does **not** remove the
  per-command snapshot or undo push.
- *Correct-fix (multi-layer):* give stairs / lifts / slabs / floors a `*.batch.create` **bus
  handler** (C16 §8 canonical batch — one `produceCommand` over the whole set → one PatchPair → one
  snapshot → one undo entry), matching `wall.batch.create` / `slab.batch.create`. This is the only
  fix that removes the O(N·M) snapshot at source, and it fixes resi + house + office at once. Touches
  L1 command-bus handler + L4 store batch add + the aggregate executors. **Do not fork office-only.**

### L-376e — generation log-flood not gated on the bulk-path flag — **P2** · *ties L-375b*

`CommandManagerImpl.execute` logs `[CommandManager] EXECUTE: <type>` (`:108`) and `[CommandManager]
snapshot commandType=… elapsed=…ms` (`:126`) **unconditionally per command**;
`CreateStairCommand.canExecute` logs `ctx.stores` + `levels` **per call** (`CreateStairCommand.ts:121,
:123`); `CreateStairCommand` logs per-created (`:385`). For the office that is ~2× per command +
156 stair-canExecute lines + 78 created lines = **thousands** of console lines during one generate.
C10 §7.1 requires hot per-element logs be **gated on the bulk-path flag**
`globalThis.__pryzmBuildingGenActive` — which the office build *does* set
(`buildingGenerationLifecycle.ts:94`), but these sites do not read it. **Ties L-375b** (stair
canExecute flood). Impact: DevTools serialization jank when the console is open; violates C10 §7.1.

**Fix.** Gate the four log sites on `!globalThis.__pryzmBuildingGenActive && !__pryzmProjectLoadActive`
(the C10 §7 pattern), keeping per-sub-batch **summary** lines. The `CommandManager` snapshot log
should also be gated (it is per-command).

### L-376f — office generate is not "one undo unit" — **P2/P3** · C16 §8.6

C16 §8.6 / B-6 is explicit: *"A batch is **not** an undo unit … an executor that dispatches N
`foo.create` commands inside a `runBatch` produces **N** undo entries."* `CommandManagerImpl.execute`
pushes to `this.history` for every non-load, non-remote command (`:150-152`). The office dispatches
hundreds of per-element `Create*Command`s (§L-376d), so one office build = **hundreds of undo
entries**. The executor header comment claims "ONE `batchCoordinator.runBatch` (one undo unit)"
(`OfficeBuildingExecutor.ts:6, :19-21`) — **false** per C16 §8.6. Impact: reversing a generate needs
hundreds of Ctrl+Z; and the pollution is the same undo stack the founder then uses for real edits.

**Fix.** Same correct-fix as L-376d — the `*.batch.create` bus handler collapses each element kind
to one undo entry. Until then, either (a) mark the generation's per-element commands `nonUndoable`
and wrap the whole generate in one coarse "Generate Office" undo checkpoint, or (b) route them
through batch commands. Also correct the misleading header comment.

---

## 4. Architecture / contract alignment

| Area | Contract / ADR / spec | Alignment finding |
|------|-----------------------|-------------------|
| Per-element command dispatch, "one undo unit" | **C16 §8.6 / B-6** (`C16-COMMAND-AUTHORING-PROTOCOL.md:175-190`), **C11 §5** | **CONFLICT** — office (and the resi template it mirrors) dispatch N per-element `Create*Command` for stairs/lifts/slabs/floors/curtain-walls, which have no `*.batch.create` bus handler. C16 §8.6 says this cannot be one undo unit. *Report — do not resolve.* Fix = new batch handlers (multi-layer). |
| Snapshot / undo mechanism | **C03** (`C03-SCHEMAS-COMMANDS-AND-STATE.md`); C01 §2.2/§3.4 (`structuredClone` legacy, cited `CommandManagerImpl.ts:235`) | Snapshot is scoped-by-`affectedStores` (compliant), but per-command at generation scale → O(N·M). No PROJECT_LOAD-style fast path for **generation** dispatch. Coverage gap — C03 has no "aggregate-generation dispatch" fast path. |
| Generation log-gating + single-redetect | **C10 §7** (`C10-PERFORMANCE-AND-OBSERVABILITY.md:154-175`) | **VIOLATION** — `CommandManager` EXECUTE/snapshot logs + `CreateStairCommand.canExecute` logs are not gated on `__pryzmBuildingGenActive` (C10 §7.1). The lifecycle sets the flag; the log sites ignore it. |
| Heavy-scene render swap | **ADR-0267** (auto-WebGL heavy-scene) / **L-367** | **COMPLIANT** — office fires it up-front (`OfficeBuildingExecutor.ts:375-380`). |
| Whole-generation shadow suppression | **C04** (`C04-RENDERING-AND-SCHEDULING.md`) / **L-372** | **COMPLIANT** — `buildingGenerationLifecycle.ts:96-116` suppresses via the single-owner latch (P2-safe). Separately, **L-376c** `PCFSoftShadowMap` downgrade sits in C04 rendering scope. |
| Hosted glazing openings | **C15** (`C15-HOSTED-ELEMENT-CONTRACT.md`) | **COMPLIANT** — 880 perimeter windows as one `CreateWallOpeningsBatchCommand`, hosted C15 openings, clamped to stored wall length (`OfficeBuildingExecutor.ts:647-720`). |
| Local version persistence / sync | **C05** (`C05-PERSISTENCE-AND-FILE-FORMAT.md`), **C08** (`C08-COLLABORATION-AND-SECURITY.md`) | **Coverage gap — none found** for local-only-version eviction/flush policy (L-376a). C08 CRDT-wiring tie = L-375a (L-376g). |
| Office typology aggregate | **C20** (`C20-BUILDING-AND-APARTMENT-AGGREGATES.md`), **ADR-0083/0092/0096**, **C50-TYPOLOGY-PIPELINE** | Executor conforms to the aggregate/typology shape; the debts above are pipeline-wide (C16/C10), not typology-specific. |

---

## 5. Prioritized backlog

1. **L-376d (P1)** — `*.batch.create` bus handlers for stair/lift/slab/floor (C16 §8) → removes the
   O(N·M) snapshot at source; fixes resi + house + office. *Highest impact.*
2. **L-376e (P2)** — gate `CommandManager` EXECUTE/snapshot + `CreateStairCommand.canExecute` logs on
   `__pryzmBuildingGenActive` (C10 §7.1). *Cheap, high signal-to-noise win; ties L-375b.*
3. **L-376a (P2)** — IDB local-only-version cap + eviction / server-flush reconcile (C05/C08).
4. **L-376f (P2/P3)** — one undo entry per generate (falls out of L-376d) + fix the misleading
   header comment.
5. **L-376b (P3)** — exclude `L0` from `ClearProjectCommand` level loop (kills the happy-path warn).
6. **L-376c (P3)** — `PCFSoftShadowMap`→`PCFShadowMap`, `Clock`→`Timer` (batch with L-372); confirm
   the `Clock` source first.
7. **L-376g (P3)** — track under L-375a (CRDT applier wiring).

---

*Companion to the L-375 residential-generation audit. This doc is standalone; the L-376x issue-log
rows, impl-plan blocks, and tracker row are handed to the orchestrator separately (this audit edits
no shared tracking doc).*
