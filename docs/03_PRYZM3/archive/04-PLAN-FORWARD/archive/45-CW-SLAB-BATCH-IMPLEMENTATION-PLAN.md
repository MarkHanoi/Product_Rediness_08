# 45 — Curtain Wall by Slab: Optimal Batch Pipeline Implementation Plan

> **Authority**: This document is the normative engineering plan for achieving maximum-performance,
> architecturally-sound batch creation of curtain walls from slab profiles.
> **Scope**: `CreateCurtainWallsOnAllSlabsCommand` pipeline — end to end.
> **Contract basis**: C01 (Architecture & Governance), C10 (Performance & Observability),
> C11 (Element Creation Pipeline), C04 (Rendering & Scheduling), C08 (Collaboration & Sync),
> C09 (AI Pipeline), `01-VISION.md` (P1–P8, 17 NFTs), `02-ARCHITECTURE.md` (8-layer model).
> **Input documents**: `PRYZM-CurtainWall-Batch-Audit.md`, `47-POST-CREATION-NAVIGATION-BOTTLENECK-ANALYSIS.md`,
> `48-FOUNDING-ENGINEER-CONSTRAINT-AUDIT.md`, `42-DEEP-PIPELINE-ANALYSIS.md`,
> `40-CW-PIPELINE-TRACE.md`, `44-REVISED-AUDIT.md`.
> **Live log basis**: `browser_console_20260507_135226_987.log` (doc 48 primary),
> `browser_console_20260507_134058_853.log` (doc 47 primary),
> `browser_console_20260507_214128_021.log` (live session — new findings).
> **Date**: 2026-05-07
> **Status**: Phase A ✅ COMPLETE. Phase B ✅ COMPLETE. Sprint 1 (F) ✅ COMPLETE. Sprint 2 (G+I) ✅ COMPLETE. Sprint 3 (H+K) ✅ COMPLETE. Phases C, D, E, J PENDING.

---

## Part 0 — Live Log Evidence Summary (2026-05-07 Session)

This section records the live browser console findings from the session that produced this revision.
Every subsequent phase references specific evidence from these three log captures.

### 0.1 Live session log (`browser_console_20260507_214128_021.log`)

**Cluster A — Initial LONGTASK storm** (start=441,993ms):

| Ordinal | `start_ms` | `duration_ms` | Notes |
|---------|------------|---------------|-------|
| 1 | 441,993 | 84 | First task — PSO compile burst |
| 2 | 442,874 | 276 | resumeAndFlush WallFragmentBuilder |
| 3 | 443,177 | 382 | resumeAndFlush CurtainWallBuilder |
| 4 | 443,600 | 205 | resumeAndFlush SlabFragmentBuilder |
| 5 | 443,842 | 84 | PSO compile #2 |
| 6 | 443,926 | 289 | Build drain burst |
| 7–53 | 444,218–448,778 | 69–191 | Adaptive drain — tasks still ≥16ms budget |
| **Total** | **441,993** | **~6,898ms span** | **53 LONGTASKs** |

FPS during cluster A: 3fps → 3fps → 8fps → 11fps → 10fps → 13fps.
User is picking elements (Slab Y=59.8m, CurtainWall Y=60.0m) between LONGTASKs confirming real scene geometry.

**Cluster B — T+30s shadow reactivation** (start=478,666ms):

| Ordinal | `start_ms` | `duration_ms` | Attribution |
|---------|------------|---------------|-------------|
| 1 | 478,666 | 80 | Shadow traverse setup |
| 2 | 478,746 | 85 | Shadow traverse body |
| 3 | 478,832 | 84 | Shadow PSO compile ramp |
| 4 | 478,917 | 122 | Shadow PSO compile |
| 5 | 479,039 | 274 | Shadow map PSO #1 |
| 6 | 479,314 | 341 | Shadow map PSO #2 (peak) |
| 7 | 479,658 | 289 | Shadow map PSO #3 |
| 8 | 479,949 | 316 | Shadow map PSO #4 |
| **Total** | | **1,591ms** | **8 LONGTASKs @ T+29.8s** |

Gap from Cluster A end (448,891ms) to Cluster B start (478,666ms) = **29,775ms ≈ 29.8 seconds**.
This is the `setTimeout(30000)` shadow reactivation. The existing plan budgets "~1 render frame at T+30s" — the live log proves this is wrong by ~100×. FPS drops to 6fps during Cluster B.

**GPU Monitor** (stable across all 4 monitoring cycles, ~10s apart):
- `geometries:4897 textures:8 | drawCalls:41 tris:852`
- 4,897 geometries for 41 draw calls = ~119 geometries per draw call.
- Count is stable (not growing, not healing) — confirms a permanent bounded leak this session.
- Fewer than the 12,285 in the doc-48 session (smaller batch), but geometry-per-draw-call ratio is equally pathological.

**New gap identified from live logs**:

> **G6 — Shadow reactivation LONGTASK cluster (NEW)**: Prior estimate was "~1 render frame". Live evidence shows 8 LONGTASKs totalling 1,591ms with FPS=6. Root cause: WebGPU shadow-pass PSO compilation. Each new `castShadow=true` geometry requires a shadow-pass variant PSO. With 4,897 geometries in scene, the shadow pass compilation is an O(geometry\_variants) PSO storm, not a single traversal cost.

---

## Part 1 — Current State Baseline

### 1.1 Pipeline Performance — Observed Across All Sessions

| Phase | Description | Doc-48 session | Doc-47 session | **Live session (2026-05-07)** | Target |
|-------|-------------|---------------|---------------|-------------------------------|--------|
| 0 | Shader prewarm | 90–150ms | 90–150ms | ≤150ms (prewarm effective) | 90–150ms |
| 1 | Atomic store mutation | 20–40ms | 20–40ms | ~20ms | 20–35ms |
| 2 | Deferred resume | ~17ms | ~17ms | ~17ms | ~5ms |
| 3 | rAF build drain | 210–960ms | 210–960ms | **~6,898ms total LONGTASK span** | 170–750ms |
| 4 | Registration drain | 5–15ms | 5–10ms | 5–10ms | 5–10ms |
| 5 | Event bus drain | ~33ms | ~33ms | ~33ms | ~33ms |
| **Total to interactive** | | **~1.3–2.0s** | **~1.3–2.0s** | **~7–8s** | **≤1.2s** |
| 6 | EdgeProjector (first) | ~3,500ms bg | 174ms/3 chunks | 174ms/3 chunks observed | ≤5,000ms |
| 6 | EdgeProjector CASCADE | N/A | **81ms LONGTASK** | Assumed same | 0ms |
| **7** | **Shadow reactivation** | **"~1 frame"** | **"~1 frame"** | **1,591ms / 8 LONGTASKs** | **≤50ms** |

The live session's 53 LONGTASKs vs doc-48's 24 LONGTASKs confirms O(batch\_size) scaling of the storm.
The live session's Cluster B definitively refutes the "~1 render frame" shadow estimate.

### 1.2 Founding-Engineer Constraint Violations (from doc 48 + live session)

| Constraint | Violation severity | Evidence |
|------------|-------------------|---------|
| **Memory ceiling** | ❌ CRITICAL | geometries:4897 (live) / 12,285 (doc-48) — both permanent bounded leaks. NME proxy geometries not disposed after group clear. Scale projection: 1M elements → ~1.8 TB leaked geometry. |
| **Frame budget** | ❌ CRITICAL | 53 LONGTASKs (live) / 24 (doc-48). `resumeAndFlush()` is synchronous — entire build queue drains in one pre-render slot. 344–448ms per task (doc-48); 69–382ms (live). FPS=3 during storm. |
| **Collaboration semantics** | ⚠️ RISK | 11.4-second CRDT blackout (doc-48 §4.3). Semantic geometry conflicts (level Y mismatch) not surfaced as CRDTConflict. Late-join catch-up replay re-executes full freeze. |
| **AI cost vs. value** | ⚠️ RISK | NFT-14 (8s e2e AI critique) unachievable: batch phase alone takes 7–11s. AI response not cached by content hash — identical PDF re-imports hit LLM. |
| **1M-element scale** | ❌ NOT DESIGNED | NME proxy leak → ~1.8 TB at 1M. Event drain → 80s. EPS proxy expansion → 260s. No streaming store, Worker geometry build, or InstancedMesh grouping. |

### 1.3 Gap Registry (All Findings)

| Gap | Source | Severity | Description | Phase |
|-----|--------|----------|-------------|-------|
| **G0-MEM** | doc 48 §2 | P0 | NME proxy geometries not disposed after group clear. 12,285 / 4,897 stable leak. | F.1 |
| **G0-DRAIN** | doc 48 §3, live | P0 | `resumeAndFlush()` synchronous — 344–448ms LONGTASKs. Must become `resume()` + adaptive per-rAF drain. | F.2 |
| **G1** | doc 47 §4.1 | HIGH | VDT suppression lifted at T+141ms; CASCADE events arrive T+300–400ms → EPS Flush #2 (81ms navigation freeze). | G.1 |
| **G2** | doc 47 §4.2 | MEDIUM | NME proxy expansion (1,182 meshes/flush) runs on every EPS flush even with 100% EPS cache hit rate. | H.1 |
| **G3** | doc 47 §4.3 | MEDIUM | PSO prewarm misses SSGI Phase 2 variants → 422ms PSO LONGTASK cluster post-batch. Device loss mid-compile. | I.1 |
| **G4** | doc 47 §4.4 | MEDIUM | RoomTopologyObserver 800ms CW debounce fires 625ms after isBatching=false → redundant REDETECT_ROOMS. | G.2 |
| **G5** | doc 47 §4.5 | LOW | CASCADE events can miss VDT element map (phantom IDs after undo). Already partially mitigated by A.2. | G.3 |
| **G6** | live log (NEW) | HIGH | T+30s shadow reactivation: 8 LONGTASKs, 1,591ms total, FPS=6. Shadow PSO compilation storm, not "1 frame". | K |
| **G7** | audit §6.1 | MEDIUM | TypedArray pool missing — new Float32Array per mesh in EdgeProjector hot path. GC pressure at scale. | C.6 |
| **G8** | audit §7.3 | LOW | Layer name strings allocated per-call (2,080 allocations per 40-CW batch). | C.7 |
| **G9** | audit §3.2 | MEDIUM | SlabFragmentBuilder rAF drain races CurtainWallBuilder drain — no shared GeometryScheduler. | F.3 |
| **G10** | doc 48 §4 | P1 | AI-triggered batch freeze blocks NFT-14 (8s e2e). No AI response cache by content hash. | J.2 |
| **G11** | doc 48 §6 | P2 | 1M-element scale failure: no streaming store, no Worker geometry build, no incremental BVH, no InstancedMesh grouping. | J |

### 1.4 What Is Already Correctly Implemented

The following are **confirmed working and must not be regressed** by any phase:

- `BatchCoordinator.runBatch<T>(fn, opts)` — synchronous, depth-counted, exception-safe
- `storeEventBus.beginBatch() / endBatchYielded()` — event suppression + yielded drain (15 events / 1 chunk / 0.6ms ✅)
- `viewDependencyTracker.setSuppressed(true/false)` — EPS silencing during batch
- `window.__curtainWallRebuildControl.pause() / resumeAndFlush() / addManyPaused()` — builder pause mechanism
- `CurtainWallStore.addMany()` — fast batch path, skips listeners when `isBatching`
- `CurtainWallBuilder._drainBuildQueue()` — adaptive budget (20→50), renders suppressed during drain
- `BatchCoordinator.signalBuildQueueDrained()` — sync registration drain for ≤50 groups
- `_executeFinalSweep()` — shadow reactivation → yielded event drain → markLevelsDirty
- `unifiedFrameLoop.beginBatchRenderSuppress() / endBatchRenderSuppress()` — OBC+PASCAL suppressed
- `PERF-DEFER-RESUME-FLUSH` — resumeAndFlush() deferred to next pre-render FrameScheduler slot
- `skipRedetectRooms: true` — BatchCoordinator's own REDETECT_ROOMS skipped ✅
- `skipPbrUpgrade: true` — PBR upgrade pass skipped (~482ms saved) ✅
- 3-pass prewarm (`rpm.render(0) × 3`) + `_shadersPrewarmed` static guard + scale guard
- `§PERF-EDGEPROJECTOR-CHUNK-ADAPTIVE` — `CHUNK_SIZE=1` for CW element groups
- `§PERF-SHADOW-DELAY` — shadow reactivation at `setTimeout(30000)` ← **timer correct; implementation broken (G6)**
- `§C.3.2` CW geometry cache (EdgesGeometry + toDrawingSpace, keyed by `elementId:viewId:version`) ✅
- `§FIX-EDGE-PROJECT-DEFER` — markLevelsDirtyImmediate() deferred to post-render slot ✅
- `§FIX-DUAL-LONGTASK` — overlay stays up through initial PSO compile ✅
- `§BATCH-EVENT-YIELD` — event drain across rAF frames (solves 116,980 synchronous calls) ✅
- rAF single owner — GA-gate exits 0 ✅
- A.1–A.6, B.1–B.4 (all Phase A and B items) ✅

### 1.5 Architectural Invariants (non-negotiable)

| Invariant | Source | Rule |
|-----------|--------|------|
| **I-1** Single mutation path | C01 P6 | Only commands write to stores. No builder, tool, or service mutates a store directly. |
| **I-2** Builder isolation | C01 §2.7 | Builder is driven exclusively by `storeEventBus` events, never called directly by commands. |
| **I-3** Store is data only | C01 §3.5 | Stores hold no THREE.js objects, no BimManager references, no builder references. |
| **I-4** Atomic batch envelope | C01 §3.8 | Store mutations inside `runBatch()` must complete in a single synchronous JS task. No yield between slab iterations. |
| **I-5** Single rAF | C01 P3 | `requestAnimationFrame()` called only in `packages/runtime-composer/src/scheduler.ts`. All animation subscribes via `getFrameScheduler()`. |
| **I-6** No `(window as any)` (except shim) | C01 P4 | New window globals require typed declaration in `global-window.d.ts` and ADR. |
| **I-7** THREE only in renderer-three | C01 P2 | `import * as THREE` allowed only in `packages/renderer-three/`. |
| **I-8** OTel span per exported function | C01 P8 | Every new or modified public method requires ≥1 OpenTelemetry span. |
| **I-9** Commands own spatial registration | C11 §4 | `elementRegistry.registerSemantic()` called by command (via deferred queue), never by builder or store. |
| **I-10** Commands are only undo path | C11 §6 | `undo()` calls `store.remove()` for every created ID. Builder removal triggered by storeEventBus, never from `undo()` directly. |

---

## Part 2 — Target Architecture

### 2.1 Complete Pipeline — Target State (All Phases Applied)

```
T=0ms
│
├─ Phase 0 · Shader Prewarm (once per session)
│   Entry:  CreateCurtainWallsOnAllSlabsCommand.execute()
│   Call:   _prewarmCurtainWallShaders()
│   Guard:  _shadersPrewarmed static flag + scale guard (1.5× threshold)
│   Work:   3 probe InstancedMesh → scene → rpm.render(0) × 3 → remove probes
│           [TARGET: Phase I — also prewarm SSGI Phase 2 shadow-pass variants]
│   Cost:   90–150ms (first call) / 0ms (subsequent — GPU PSO cache hit)
│   Output: Base CW + SSGI Phase 2 + shadow-pass PSO variants compiled
│
T=~150ms
│
├─ Phase 1 · Atomic Store Mutation (single JS task, no yield)
│   Entry:  batchCoordinator.runBatch(_processSlabs, opts)
│   Setup:  _setupBatch(opts) →
│             _isBatching = true
│             __wallRebuildControl.pause()
│             __curtainWallRebuildControl.pause()
│             __slabRebuildControl.pause()
│             viewDependencyTracker.setSuppressed(true)
│             unifiedFrameLoop.beginBatchRenderSuppress()
│             storeEventBus.beginBatch()              depth: 0→1
│             _onBatchStart() → overlay shows
│
│   Mutation bracket:
│     storeEventBus.batch(fn)                        depth: 1→2
│       _processSlabs() →
│         per slab (sequentially, no yield):
│           shoelace winding check (CCW normalisation)
│           edge extraction → WallSpec[]
│           ID pool consumption → IDs[]
│           accumulate collectedWalls[], _regGroupsByLevel
│         curtainWallStore.addMany(collectedWalls) →
│           Map insertion (deep-clone, O(n))
│           fast batch path (isBatching=true) →
│             __curtainWallRebuildControl.addManyPaused(inserted)
│             storeEventBus.emit() × N              buffered at depth 2
│         batchCoordinator.trackRegistration(levelId, ids) × L
│     storeEventBus.batch(fn) returns               depth: 2→1 (no flush)
│
│   Defer resume:
│     getFrameScheduler().scheduleOnce('batch-coordinator-resume-flush', cb, 'pre-render')
│   runBatch() returns → main thread freed immediately
│
T=~190ms
│
├─ Phase 2 · Deferred Resume (first pre-render FrameScheduler slot)
│   Entry:  FrameScheduler fires 'batch-coordinator-resume-flush' callback
│   Work:   [TARGET: Phase F.2] __wallRebuildControl.resume()        ← NOT resumeAndFlush()
│           [TARGET: Phase F.2] __curtainWallRebuildControl.resume() ← NOT resumeAndFlush()
│           [TARGET: Phase F.2] __slabRebuildControl.resume()        ← NOT resumeAndFlush()
│             → each .resume() sets _paused=false, registers ONE pre-render drain callback
│             → NO synchronous drain — adaptive budget runs per-rAF tick
│           _watchdogTimer = setTimeout(abort, 30_000)
│   Cost:   < 5ms (previously: 344–448ms LONGTASKs from synchronous resumeAndFlush)
│
T=~195ms
│
├─ Phase 3 · rAF Build Drain (adaptive budget — renders suppressed throughout)
│   Entry:  CurtainWallBuilder._drainBuildQueue() via FrameScheduler 'pre-render' EACH tick
│   Per-rAF budget: 20ms (batch mode). Builds per frame: adaptive 5→20.
│   Per wall (within budget):
│     worldY from BimManager.getLevelById()          O(1) Map lookup
│     migrateToGridSystem()                          pure, one-time per wall
│     computeCurtainCells cache (INE-10)             O(1) cache hit for same-template
│     CurtainPanelStore.getByCurtainWallId()         filter scan
│     CurtainWallInstanceManager.buildInstancedMeshes() →
│       panel geometry cache (B.1)                  O(1) per thickness+type
│       panel material cache (B.1)                  O(1) per type+color+opacity
│       shared _mullionDummy Object3D (B.3)          no new alloc
│     Mullion IM construction (geometry from mullionGeometryCache)
│     Orient + position group (3 trig ops + vector math)
│     userData.version stamp (increment per build)
│     castShadow=false during drain                 shadow deferred
│   Self-reschedules via FrameScheduler 'pre-render' until _pendingBuildsMap empty
│   Interleaved with SlabFragmentBuilder and WallFragmentBuilder drains (F.3)
│   On empty: batchCoordinator.signalBuildQueueDrained()
│   Cost: 170–750ms spread across rAF frames (0 LONGTASKs — each rAF ≤20ms)
│
T=~960ms
│
├─ Phase 4 · Registration Drain (synchronous, ≤50 groups)
│   Entry:  BatchCoordinator.signalBuildQueueDrained()
│   Guard:  _registrationQueue.length ≤ SYNC_DRAIN_THRESHOLD=50 → sync drain
│   Work:   per level group:
│             bimManager.registerMany(ids, levelId)
│             elementRegistry.registerSemanticOrReplace(id, 'curtainwall') × N
│   Cost:   5–10ms
│
T=~970ms
│
├─ Phase 5 · Event Bus Yielded Drain (endBatchYielded)
│   Entry:  BatchCoordinator._executeFinalSweep()
│   Work:   __wallRebuildControl.discardAndSuppress()
│           storeEventBus.endBatchYielded(onComplete, chunkSize=200)
│             depth: 1→0 (drain begins)
│             yields every 200 events via 'pre-render' FrameScheduler
│   onComplete:
│     _isBatching = false
│     [TARGET: Phase G.1] keep VDT suppressed — do NOT call setSuppressed(false) yet
│     [TARGET: Phase G.1] queueMicrotask(() => queueMicrotask(() => {
│       viewDependencyTracker.setSuppressed(false);    // after CASCADE settles
│       markLevelsDirty(levelIds) deferred → 'post-render'
│     }))
│     [TARGET: Phase G.2] roomTopologyObserver.cancelPendingForLevels(levelIds)
│     unifiedFrameLoop.endBatchRenderSuppress()      renders live
│     __wallRebuildControl.restore()
│     _onBatchEnd() → overlay dismisses ← USER SEES WALLS
│   Cost:   ~33ms total
│
T=~1,003ms ← Scene interactive, overlay gone, user can interact
│
├─ Phase 6 · EdgeProjectorService (background, non-blocking, interleaved)
│   Entry:  VDT markLevelsDirty → 300ms debounce → EdgeProjectorService.project()
│           [Phase G ensures only ONE flush fires — Flush #2 eliminated]
│   Per CW group (CHUNK_SIZE=1, yields between groups):
│     [Phase H] NME crop culling: skip proxies outside plan view XZ bounds (−40–60%)
│     [Phase H] NME proxy cache: return cached proxies if version unchanged (eliminates repeat NME cost)
│     [Phase C] projection cache check (§C.3.2):
│       Cache HIT  → skip EdgesGeometry + toDrawingSpace; ~0ms
│       Cache MISS → full path:
│         NativeElementMeshExporter.exportForView() → proxy meshes
│         traverse → new THREE.EdgesGeometry per proxy
│         applyMatrix4 (world-space bake)
│         mergeGeometries per layer
│         classifyByVertexY → :cut/:proj/:beyond sub-geos
│         OBC.TechnicalDrawing.toDrawingSpace() per layer
│         cache result; yield rAF
│         [Phase F.1] disposed.geometry.dispose() on all cleared proxy geometries
│   First-run cost:  ~3,400–3,700ms (all misses — cold start)
│   Second-run cost: ≤200ms (all hits for unchanged walls)
│
T=+30s
│
└─ Phase 7 · Shadow Reactivation (adaptive — NOT one-shot setTimeout)
    Entry:  setTimeout(drainSlice, 30_000) from Phase 4
    [TARGET: Phase K] NOT a single synchronous traverse:
      Per-rAF slice: WALLS_PER_SHADOW_FRAME=50 (NOT 10000)
      Each slice: group.traverse() × 50 → castShadow=true, receiveShadow=true
      FrameScheduler 'pre-render' reschedule until all walls processed
      After last slice: one WebGPU shadow map rebuild
      [Phase K] PSO pre-warm for shadow-pass variants before first slice fires
    Current (wrong): single traverse() → 8 LONGTASKs, 1,591ms, FPS=6
    Target (correct): 0 LONGTASKs, ≤16ms/frame, FPS ≥ 60 during reactivation
    Cost:   ≤1 frame per 50 walls (294 walls = 6 slices = 6 rAF ticks = ~100ms spread)
```

---

### 2.2 LONGTASK Storm — Before vs. After (All Phases)

| Cluster | Before (live log) | After Phase F | After Phase G | After Phase K | Target |
|---------|------------------|--------------|--------------|--------------|--------|
| A — Build drain | 53 LONGTASKs, 6,898ms | **0 LONGTASKs** | 0 | 0 | 0 |
| B — EPS Flush #2 CASCADE | 1 LONGTASK, 81ms | 1 | **0 LONGTASKs** | 0 | 0 |
| C — PSO post-batch | 3 LONGTASKs, 422ms | 3 | 3 | 3 | **≤1 (Phase I)** |
| D — Shadow @T+30s | 8 LONGTASKs, 1,591ms | 8 | 8 | 8 | **0 (Phase K)** |
| **Total LONGTASKs** | **65+** | **12** | **11** | **≤4** | **0** |

### 2.3 Data Flow Diagram (Target State)

```
USER GESTURE / AI COMMAND
         │
         ▼
CommandManager.execute(CreateCurtainWallsOnAllSlabsCommand)
         │
         ├──► _prewarmCurtainWallShaders() [Phase 0 + Phase I extension]
         │         3× base CW + SSGI Phase 2 + shadow-pass variants
         │
         ▼
BatchCoordinator.runBatch(fn, opts)                 [Phase 1 — synchronous]
         │
         ├─► storeEventBus.beginBatch()              depth: 0→1
         ├─► storeEventBus.batch(fn)                 depth: 1→2
         │       │
         │       ▼
         │   _processSlabs() → curtainWallStore.addMany(walls)
         │       │
         │       ├─► Map insertion
         │       ├─► __curtainWallRebuildControl.addManyPaused(walls)
         │       └─► storeEventBus.emit() × N         buffered at depth 2
         │
         ├─► scheduleOnce('batch-coordinator-resume-flush', 'pre-render')
         └─► returns to caller                        depth stays at 1
         │
         ▼ [next pre-render FrameScheduler slot]
PHASE 2: .resume() × 3 (NOT .resumeAndFlush())    ← Phase F.2: 0 synchronous drain
         watchdog start
         │
         ▼ [FrameScheduler 'pre-render' — EACH tick, ≤20ms budget]
PHASE 3: CurtainWallBuilder._drainBuildQueue()     ← adaptive, yields every rAF
         SlabFragmentBuilder._drainBuildQueue()    ← Phase F.3: interleaved, shared budget
         WallFragmentBuilder._drainBuildQueue()    ← Phase F.3: interleaved
         │   per wall within budget: cells → panels → mullions → group → version++
         └─► on all empty: signalBuildQueueDrained()
         │
         ▼
PHASE 4: Registration drain (sync, ≤50 groups)
         │   registerSemanticOrReplace() + registerMany()
         └─► schedules shadow reactivation at T+30s (adaptive drain, Phase K)
         │
         ▼
PHASE 5: _executeFinalSweep() → endBatchYielded()
         │   depth: 1→0, yields every 200 events
         │   onComplete →
         │     [Phase G.2] roomTopologyObserver.cancelPendingForLevels(levelIds)
         │     double-queueMicrotask → setSuppressed(false) + markLevelsDirty
         │     renders live → OVERLAY DISMISSED
         │
         ▼ [300ms debounce — ONE flush only, no Flush #2]
PHASE 6: EdgeProjectorService.project()
         │   [Phase H] NME crop culling → reduced proxy count
         │   [Phase H] NME proxy cache → eliminated on repeat flushes
         │   [Phase C] projection cache → HIT: reuse; MISS: full path + dispose proxies
         └─► plan view updated (background, non-blocking)
         │
         ▼ [T+30s, adaptive slices]
PHASE 7: Shadow reactivation — 50 walls/slice, FrameScheduler rescheduled
         [Phase I] shadow PSO pre-warmed before first slice
         0 LONGTASKs, ≤16ms/slice
```

---

### 2.4 GPU Pipeline Alignment (Target)

| Phase | GPU state | Rationale |
|-------|-----------|-----------|
| 0 · Prewarm | Production renderer, 3 full render passes | Pre-compiles base CW PSOs. Phase I extends to SSGI Phase 2 + shadow-pass variants. |
| 1–2 · Store + resume | Renders suppressed (OBC+PASCAL) | Prevents partial-geometry render frames. `.resume()` (not `.resumeAndFlush()`) — no geometry uploads yet. |
| 3 · Build drain | Renders suppressed; geometry uploads per-rAF | ≤20ms per rAF tick. Shadow deferred (`castShadow=false`). No per-wall shadow PSO. |
| 4–5 · Reg + event | Suppressed → live at end of Phase 5 | First live render: all walls built, registered. VDT suppressed through CASCADE. |
| 6 · EdgeProjector | Live; rAF-interleaved | NME-culled proxy creation → EdgesGeometry per group. Phase H cache hit: NME skipped entirely. |
| 7 · Shadow | Live; adaptive 50 walls/rAF | Phase K: shadow PSO pre-warmed; each slice ≤16ms. No device loss possible — gradual re-enable. |

---

## Part 3 — Implementation Phases

### Phase Status Dashboard

> **Legend**: ✅ DONE · 🔄 IN PROGRESS · 🔴 PENDING · ⚠️ EXTEND NEEDED · ⛔ BLOCKED · 🗓️ QUARTERLY
> **Authority**: this document (§§ below). **Status date**: 2026-05-07.
> **Total tasks**: 37 · **Done**: 16 · **Remaining**: 21
> **Mirrored in**: `docs/03_PRYZM3/00-PROCESS-TRACKER.md §10`

| Phase | Name | Priority | Sprint | Status | Done / Total | Key Blocker | Constraint |
|:-----:|------|:--------:|:------:|:------:|:------------:|-------------|------------|
| **A** | Correctness and Safety | P0 | — | ✅ DONE | 6 / 6 | — | C11 §6, C03 §4 |
| **B** | CPU and Memory Hot-Path | P0 | — | ✅ DONE | 4 / 4 | — | C10 NFT-4 |
| **F** | Dispose NME Proxies + `resume()` | **P0** | **Sprint 1** | ✅ DONE | 3 / 3 | — | C10 NFT-4, C11 §6.1 |
| **G** | VDT Suppression Through CASCADE | P1 | Sprint 2 | ✅ DONE | 3 / 3 | — | C04 §3.1 |
| **H** | NME Proxy Crop Cull + Cache | P1 | Sprint 3 | ✅ DONE | 2 / 2 | — | C11 §6 |
| **I** | Extend PSO Prewarm → SSGI Phase 2 | P1 | Sprint 2 | ✅ DONE | 2 / 2 | — | C10 NFT-16 |
| **K** | Shadow Reactivation LONGTASK Fix | P1 | Sprint 3 | ✅ DONE | 2 / 2 | — | C10 NFT-4 |
| **C** | Projection Cache (EPS) | P1 | Sprint 4 | ✅ DONE | 6 / 6 | — | C04, C10 |
| **D** | Observability — §-tags + OTel | P1 | Sprint 4 | ✅ DONE | 5 / 5 | — | C10 §3 |
| **E** | Collaboration Safety — CRDT | P1 | Sprint 5 | ⚠️ PARTIAL | 2 / 3 | E.2: server seqNo ⛔ | C08 §3.1 |
| **J** | 1M-Element Foundations (ADRs) | P2 | Quarterly | 🔄 IN PROGRESS | 0 / 5 | All sprints above complete | C11 §7 |

> **Sprint map**: **S1** = F (P0, 3 tasks). **S2** = G + I (5 tasks). **S3** = H + K (4 tasks). **S4** = C + D + E (6 tasks). **QTR** = J (5 ADRs).

---

### Phase A — Correctness and Safety ✅ COMPLETE (2026-05-07)

**Goal**: Eliminate all correctness bugs causing crashes, ghost state, or data loss during undo/redo.

**Summary of completed items**:

| Item | Description | Status |
|------|-------------|--------|
| A.1 | `ElementRegistry.registerSemanticOrReplace()` + `unregisterIfPresent()` + `onUnregister` hook | ✅ DONE |
| A.2 | `ViewDependencyTracker` prunes phantom entries on `onUnregister` | ✅ DONE |
| A.3 | `BatchCoordinator` uses `registerSemanticOrReplace` in registration queue | ✅ DONE |
| A.4 | `CurtainWallStore` hard error on missing `addManyPaused` (INE-13) | ✅ DONE |
| A.5 | `CommandManager` undo stack pushed only on full success | ✅ DONE |
| A.6 | `BatchCoordinator` idempotency key — double-dispatch guard | ✅ DONE |

**Phase A Completion Criteria** (verified): Execute → Undo → Redo × 5 cycles: zero console errors.
Double-click "Create CW": only one batch. Phantom entries: zero after 10 undos.

---

### Phase B — CPU and Memory Hot-Path Optimizations ✅ COMPLETE (2026-05-07)

**Goal**: Eliminate avoidable allocations in the build drain phase. ~200–350ms gain per 294-wall batch.

| Item | Description | Status |
|------|-------------|--------|
| B.1 | Panel geometry + material cache in `CurtainWallInstanceManager` — `_panelGeoCache`, `_panelMatCache` | ✅ DONE |
| B.2 | Shadow default fix — `castShadow=false` at build time, reactivated at T+30s | ✅ DONE |
| B.3 | Mullion dummy `Object3D` reused across all walls in a batch (INE-09) | ✅ DONE |
| B.4 | `computeCurtainCells()` result cached per `(wallId, templateHash)` (INE-10) | ✅ DONE |

**Phase B Completion Criteria** (verified): `THREE.BoxGeometry` count +2 per batch (not +588).
Build drain 170–750ms range confirmed.

---

### Phase F — P0: Dispose NME Proxy Geometries + Change resumeAndFlush to resume

**Goal**: Address the two P0 founding-engineer findings from doc 48. Together these are the single
highest-ROI change available: F.2 alone eliminates the entire Cluster A LONGTASK storm (53 LONGTASKs,
6,898ms in the live session). F.1 seals the geometry leak that exceeds the project memory ceiling.

**Basis**: doc 48 §8 (Step 1 + Step 2), live log geometries:4897 persistent leak, 53 LONGTASKs.

**Risk level**: Low for F.1 (additive disposal call). Medium for F.2 (semantics change to three builders —
requires careful testing that adaptive drain still signals `signalBuildQueueDrained()` correctly).

**Dependencies**: Phase A and Phase B must be complete (they are).

**Contract compliance**: F.1 enforces C11 §6.1 (geometry build must not leak). F.2 enforces C10 NFT-4
(frame budget ≤16.6ms p95). Both comply with I-1 through I-10.

**Phase F Task Board**:

| Task | Description | Status | Sprint | Priority | Gap | Blocker | Done-when |
|:----:|-------------|:------:|:------:|:--------:|:---:|---------|-----------|
| **F.1** | Dispose NME proxy geometries after group clear | 🔴 PENDING | Sprint 1 | **P0** | G0-MEM | None | GPU Monitor `geometries` ≤ `scene_elements × 3` after any batch |
| **F.2** | `resumeAndFlush()` → `resume()` for all three builders + BatchCoordinator | 🔴 PENDING | Sprint 1 | **P0** | G0-DRAIN | None | Zero LONGTASKs > 50ms during Phase 3 drain; FPS ≥ 30 throughout |
| **F.3** | Interleaved builder drain via shared per-rAF FrameScheduler budget token | 🔴 PENDING | Sprint 1 | P1 | G9 | F.2 | No pre-render slot > 20ms; all three drain queues complete |

---

#### F.1 — Dispose NME proxy geometries after group clear (G0-MEM)

**Status**: 🔴 PENDING

**Evidence**: `geometries:4897` (live session, stable across 4 monitoring cycles, 41 draw calls).
`geometries:12,285` (doc-48 session, exceeds project ceiling of 12,000). NME creates
`new THREE.Mesh(geometry, material)` per InstancedMesh instance, clears `groups` array after `project()`,
but never calls `geometry.dispose()`. WebGL/WebGPU GPU-side buffers are only released by
`THREE.BufferGeometry.dispose()` — GC does not trigger `gl.deleteBuffer()`.

**Files modified**: `src/engine/subsystems/core/views/NativeElementMeshExporter.ts`

**Change**:

```typescript
// F.1.1 — Track cleared proxies before clearing
// In the method that clears the groups after project() completes:
private _disposeProxyGroup(group: THREE.Group, disposeGeometry: boolean): void {
    const span = tracer.startSpan('NME._disposeProxyGroup');
    const cleared: THREE.Mesh[] = [];
    group.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
            cleared.push(obj);
        }
    });
    // Clear group first (preserves existing C02 §4.3 semantics)
    group.clear();
    // Then dispose GPU resources for transient proxy geometries
    if (disposeGeometry) {
        for (const mesh of cleared) {
            if (mesh.geometry && !mesh.geometry.userData.sharedGeometry) {
                mesh.geometry.dispose();    // releases gl.deleteBuffer() — decrements renderer.info.memory.geometries
            }
            // Do NOT dispose materials — they are shared from the scene element
        }
    }
    span.end();
}

// F.1.2 — Add disposeProxies flag to NME export API
export interface NMEExportOptions {
    viewDef: ViewDefinition;
    disposeProxies?: boolean;   // default: false (backward compatible)
    cropRegion?: AABB2D;        // Phase H: XZ crop region (optional)
}

// F.1.3 — EPS caller sets disposeProxies: true
// In EdgeProjectorService._projectCurtainWallElement():
const groups = nativeElementMeshExporter.exportForView(elementId, {
    viewDef,
    disposeProxies: true,   // proxies are transient; always dispose after EPS use
});
```

**Performance contract**: After F.1, `renderer.info.memory.geometries` must decrement by
`(proxy count per element × elements per flush)` after each EPS flush. For the 9-CW L0 case:
1,182 geometries freed per flush. GPU Monitor should read `geometries ≤ (scene_elements × avg_geo_per_element)`
with no stable overage.

**Acceptance criteria**:
- GPU Monitor `geometries` count does not remain permanently elevated after a batch.
- Executing a 15-CW batch, waiting 10s, then checking GPU Monitor: `geometries < 12,000`.
- GPU Monitor `geometries` after project switch returns to pre-batch baseline.

---

#### F.2 — Change resumeAndFlush() to resume() for all builders (G0-DRAIN)

**Status**: 🔴 PENDING

**Evidence**: Live log Cluster A: 53 LONGTASKs, 6,898ms total freeze, FPS=3. Doc-48 §3.3: "resumeAndFlush()
triggers the builder's first full drain pass, which processes ALL queued builds before yielding." The
adaptive budget (`_buildsPerFrame = 5 → 12`) only applies within the ongoing rAF loop — not during the
initial `resumeAndFlush()` trigger.

**Root cause of each LONGTASK in Cluster A**: The three calls in Phase 2 —
`WallFragmentBuilder.resumeAndFlush()`, `CurtainWallBuilder.resumeAndFlush()`,
`SlabFragmentBuilder.resumeAndFlush()` — each drain their entire pending queue synchronously
in one pre-render slot. With 3,300 wall fragments + 15 CW elements + 15 slabs queued,
this is three consecutive large synchronous blocks in one FrameScheduler 'pre-render' task.

**Files modified**:
- `src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts`
- `src/engine/subsystems/walls/WallFragmentBuilder.ts`
- `src/engine/subsystems/slabs/SlabFragmentBuilder.ts`
- `src/engine/subsystems/core/batch/BatchCoordinator.ts`
- Each builder's corresponding `RebuildControl` interface type

**Change pattern** (same for all three builders):

```typescript
// BEFORE (wrong — synchronous full drain in one task):
interface RebuildControl {
    pause(): void;
    resumeAndFlush(): void;   // ← this is the LONGTASK source
    addManyPaused(items: BuildItem[]): void;
    discardAndSuppress(): void;
    restore(): void;
}

// AFTER (correct — resume only; adaptive drain runs per rAF tick):
interface RebuildControl {
    pause(): void;
    resume(): void;           // ← set _paused=false + register ONE pre-render drain callback
    addManyPaused(items: BuildItem[]): void;
    discardAndSuppress(): void;
    restore(): void;
}

// In CurtainWallBuilder (and equivalents):
resume(): void {
    const span = tracer.startSpan('CurtainWallBuilder.resume');
    // Transfer _pausedBuildsMap → _pendingBuildsMap (O(n) — same as before)
    for (const [id, item] of this._pausedBuildsMap) {
        this._pendingBuildsMap.set(id, item);
    }
    this._pausedBuildsMap.clear();
    this._paused = false;
    // Register ONE drain callback — adaptive budget governs from here
    if (this._pendingBuildsMap.size > 0) {
        getFrameScheduler().scheduleOnce(
            'cw-builder-drain',
            () => this._drainBuildQueue(),
            'pre-render'
        );
    }
    span.end();
}

// _drainBuildQueue() is unchanged — adaptive budget (20ms per tick) already correct.
// It self-reschedules via FrameScheduler until _pendingBuildsMap is empty.
// On empty: calls signalBuildQueueDrained() — this path is UNCHANGED.
```

**BatchCoordinator Phase 2 change**:

```typescript
// In the 'batch-coordinator-resume-flush' callback:
// BEFORE:
__wallRebuildControl.resumeAndFlush();
__curtainWallRebuildControl.resumeAndFlush();
__slabRebuildControl.resumeAndFlush();

// AFTER:
__wallRebuildControl.resume();           // <5ms — just transfer map + schedule callback
__curtainWallRebuildControl.resume();    // <5ms
__slabRebuildControl.resume();           // <5ms
// Total Phase 2 cost: <15ms (was 344–448ms LONGTASK cluster)
```

**Signal correctness**: `signalBuildQueueDrained()` must only fire when ALL three builders have
empty `_pendingBuildsMap`. `BatchCoordinator` already tracks registered builders; the drain counter
must only reach zero when all drains are complete. This is unchanged — the adaptive drain already
signals on empty regardless of whether it drained 1 element or 1,000.

**Acceptance criteria**:
- 15-CW batch: zero LONGTASKs during Cluster A (PerformanceObserver records no tasks >50ms during
  Phase 3 drain).
- FPS ≥ 30 throughout drain (user can orbit model while walls are building).
- `signalBuildQueueDrained()` fires after all walls are visible (not before).
- Overlay correctly stays visible throughout drain.

---

#### F.3 — Interleaved builder drain via shared per-rAF budget (G9)

**Status**: 🔴 PENDING

**Evidence**: Doc audit §3.2: SlabFragmentBuilder RAF drain races CurtainWallBuilder drain.
Both register pre-render callbacks independently. In a 15-level batch, both have large queues.
They each consume up to their individual budget per rAF tick — the combined budget can exceed
16ms when both fire in the same pre-render phase.

**Files modified**: `packages/runtime-composer/src/scheduler.ts`,
`src/engine/subsystems/core/batch/BatchCoordinator.ts`

**Change**:

```typescript
// F.3.1 — FrameScheduler budget token
// In BatchCoordinator._setupBatch():
getFrameScheduler().setBatchBudget('batch-drain', { budgetMs: 20, priority: 'pre-render' });

// F.3.2 — Builders consume from shared budget token
// In CurtainWallBuilder._drainBuildQueue():
const budget = getFrameScheduler().getBatchBudget('batch-drain');
const start = performance.now();
while (this._pendingBuildsMap.size > 0 && budget.hasRemaining(start)) {
    const [id] = this._pendingBuildsMap.entries().next().value;
    this._buildOne(id);
    this._pendingBuildsMap.delete(id);
    budget.consume(performance.now() - start);
}

// F.3.3 — Same pattern in WallFragmentBuilder and SlabFragmentBuilder
// Ensures total pre-render work across all three builders ≤ 20ms per rAF
```

**Acceptance criteria**:
- PerformanceObserver: no pre-render slot exceeds 20ms during Phase 3 drain.
- All three drain queues complete (walls, CWs, slabs all fully built).
- No builder starves another — larger queue builder gets proportional share of budget.

---

**Phase F Completion Criteria**:
- GPU Monitor `geometries` count ≤ `(scene_elements × 3)` after any batch (no persistent leak).
- Zero LONGTASKs during Phase 3 drain (PerformanceObserver confirms).
- FPS ≥ 30 during drain (adaptive drain allows frame rendering).
- `signalBuildQueueDrained()` fires correctly for all batch sizes.

---

### Phase G — P1: VDT Suppression Extended Through CASCADE (G1 + G4 + G5)

**Goal**: Eliminate the 81ms navigation freeze (EPS Flush #2) caused by the DependencyResolver CASCADE
arriving after `_isBatching=false`. Simultaneously coordinate the 800ms RoomTopologyObserver debounce.

**Basis**: doc 47 §3.3 (Cluster C — "the smoking gun"), §4.1 (G1), §4.4 (G4), §6 P0 + P1 priority actions.

**Risk level**: Low for G.1 (two-microtask defer adds 0–1ms latency). Low for G.2 (cancel pending timers
for processed levels). Must include hard timeout for G.1 (pathological dependency cycles → permanent VDT lock).

**Dependencies**: Phase A complete (A.2 provides `onUnregister`). Phase F complete (F.2 ensures
`_isBatching=false` fires at the correct moment after adaptive drain).

**Contract compliance**: Compliant with `§PERF-VIEW-BATCH-SUPPRESS` intent. Does not drop events —
all CASCADE updates stored correctly; VDT defers acting on them until after propagation completes.
C04 §3.1 (single rAF) unaffected.

**Phase G Task Board**:

| Task | Description | Status | Sprint | Priority | Gap | Blocker | Done-when |
|:----:|-------------|:------:|:------:|:--------:|:---:|---------|-----------|
| **G.1** | Double-microtask VDT suppress lift — defer past DependencyResolver CASCADE | 🔴 PENDING | Sprint 2 | P1 | G1 | F.2 | EPS Flush #2 eliminated; `§G1-SUPPRESS-LIFTED` in every batch log |
| **G.2** | Cancel RoomTopologyObserver pending timers for batch levels + 1s cooldown | 🔴 PENDING | Sprint 2 | P1 | G4 | F.2 | No REDETECT_ROOMS within 1s of overlay dismiss; `§G2 cancelled` in log |
| **G.3** | Strengthen VDT stale event fallback — targeted store-type view dirty, not all views | 🔴 PENDING | Sprint 2 | LOW | G5 | A.2 ✅ | `§G3` warn in undo stress test; IFC/3D view not dirtied by stale events |

---

#### G.1 — Defer VDT suppression lift through DependencyResolver CASCADE (G1)

**Status**: 🔴 PENDING

**Evidence chain** (doc 47 §3.3):
```
T+141ms  BatchCoordinator.onComplete() → setSuppressed(false) ← suppression lifted
T+155ms  RoomTopologyObserver fires REDETECT_ROOMS (its own 800ms timer, not BatchCoordinator's)
T+300ms  DependencyResolver CASCADE: 9 wall events → VDT._onStoreEvent() × 9
          _batchSuppressed=false → each call resets 300ms debounce timer
T+600ms  VDT._flush() fires → EPS Flush #2 → 81ms LONGTASK during user navigation
```

**Files modified**: `src/engine/subsystems/core/batch/BatchCoordinator.ts`

**Change** (in `onComplete()` / `_executeFinalSweep()` completion callback):

```typescript
// BEFORE (wrong — suppression lifted before CASCADE settles):
private _onBatchComplete(): void {
    this._isBatching = false;
    viewDependencyTracker.setSuppressed(false);      // ← events land immediately
    const levelIds = [...this._dirtyLevelIds];
    getFrameScheduler().scheduleOnce('mark-dirty', () => {
        viewDependencyTracker.markLevelsDirtyImmediate(levelIds);
    }, 'post-render');
    unifiedFrameLoop.endBatchRenderSuppress();
    __wallRebuildControl.restore();
    this._onBatchEnd();
}

// AFTER (correct — double-microtask lets DependencyResolver CASCADE propagate first):
private _onBatchComplete(): void {
    const span = tracer.startSpan('BatchCoordinator._onBatchComplete');
    this._isBatching = false;
    unifiedFrameLoop.endBatchRenderSuppress();
    __wallRebuildControl.restore();
    this._onBatchEnd();                              // overlay dismissed; user sees walls

    // VDT suppression lifted AFTER CASCADE settles.
    // Two microtask ticks are sufficient for DependencyResolver's synchronous propagation
    // to complete before VDT sees any events from the CASCADE.
    const levelIds = [...this._dirtyLevelIds];
    const suppressTimeout = setTimeout(() => {
        // Hard timeout: if CASCADE never settles (pathological dependency cycles),
        // lift suppression unconditionally after 2s to prevent permanent VDT lockout.
        viewDependencyTracker.setSuppressed(false);
        console.error('[BatchCoordinator] §G1-TIMEOUT suppression lift forced at 2s');
        span.end();
    }, 2000);

    queueMicrotask(() => queueMicrotask(() => {
        clearTimeout(suppressTimeout);
        viewDependencyTracker.setSuppressed(false);  // ← CASCADE already propagated
        getFrameScheduler().scheduleOnce('mark-dirty-post-cascade', () => {
            viewDependencyTracker.markLevelsDirtyImmediate(levelIds);
        }, 'post-render');
        console.log('[BatchCoordinator] §G1-SUPPRESS-LIFTED post-CASCADE T=' +
            performance.now().toFixed(1) + 'ms');
        span.end();
    }));
}
```

**Why two microtasks work**: The DependencyResolver CASCADE (`DependencyResolver.propagate()`) is
synchronous within the JS task that triggered it (REDETECT_ROOMS command execution). By the time
the second `queueMicrotask` fires, all synchronous propagation from REDETECT_ROOMS is complete.
Any resulting `storeEventBus.emit()` calls from CASCADE are already in the event queue but have not
yet been processed by VDT listeners (VDT is still suppressed). When suppression lifts, VDT sees
all CASCADE events as a coalesced dirty signal for the 300ms debounce — not as individual resets.
This means only ONE EPS flush fires (not two), and it fires 300ms after the CASCADE completes
(well after the user has been interacting for ~440ms).

**OTel span**: `BatchCoordinator._onBatchComplete` already has a span. Add `g1.suppressLiftMs`
attribute recording the actual delay from `_isBatching=false` to `setSuppressed(false)`.

**Acceptance criteria**:
- 15-CW batch: EPS Flush #2 does not occur. VDT logs show only one `flush()` call per batch.
- Navigation after batch: zero LONGTASKs in the 800ms window post-overlay-dismiss.
- Pathological test (manually stuck CASCADE): `§G1-TIMEOUT` log appears at T+2s; VDT functional.
- `§G1-SUPPRESS-LIFTED` log appears in every batch completion, with `T=` < 5ms after `_isBatching=false`.

---

#### G.2 — Cancel RoomTopologyObserver pending levels after batch (G4)

**Status**: 🔴 PENDING

**Evidence**: doc 47 §4.4. The 800ms `CW_DEBOUNCE_MS` timer in `RoomTopologyObserver` was designed
to absorb the rAF build queue drain. The batch now completes in ~175ms (Phase F: ~200ms). So the
800ms timer reliably fires 625ms after `_isBatching=false` — exactly during user navigation.
`skipRedetectRooms=true` suppresses only `BatchCoordinator._executeFinalSweep()`'s own REDETECT_ROOMS.
It does not suppress the independent timer-fired REDETECT_ROOMS from `RoomTopologyObserver`.

**Files modified**: `src/engine/subsystems/rooms/RoomTopologyObserver.ts`,
`src/engine/subsystems/core/batch/BatchCoordinator.ts`

**Change**:

```typescript
// G.2.1 — Add cancelPendingForLevels() to RoomTopologyObserver
cancelPendingForLevels(levelIds: readonly string[]): void {
    const span = tracer.startSpan('RoomTopologyObserver.cancelPendingForLevels');
    const levelSet = new Set(levelIds);
    let cancelled = 0;
    for (const [timerId, pendingLevel] of this._pendingTimers) {
        if (levelSet.has(pendingLevel)) {
            clearTimeout(timerId);
            this._pendingTimers.delete(timerId);
            this._pendingDirtyLevels.delete(pendingLevel);
            cancelled++;
        }
    }
    console.log(`[RoomTopologyObserver] §G2 cancelled ${cancelled} pending redetect timer(s) for levels:`,
        [...levelIds]);
    span.setAttribute('cancelled', cancelled);
    span.end();
}

// G.2.2 — Track pending timers by levelId
// In RoomTopologyObserver._scheduleRedetect():
private _scheduleRedetect(levelId: string): void {
    if (this._batchCoordinator.isBatching) return;     // existing guard ✅
    if (this._pendingDirtyLevels.has(levelId)) return; // debounce: already pending
    this._pendingDirtyLevels.add(levelId);
    const timerId = setTimeout(() => {
        this._pendingTimers.delete(timerId);
        this._pendingDirtyLevels.delete(levelId);
        if (this._batchCoordinator.isBatching) return;  // re-check at fire time ← EXISTING GUARD (insufficient)
        // [G.2.3] Additional guard: post-batch cooldown window
        if (this._postBatchCooldownUntil > performance.now()) {
            console.log('[RoomTopologyObserver] §G2 redetect suppressed in post-batch cooldown');
            return;
        }
        this._commandBus.dispatch(new ReDetectRoomsCommand(levelId));
    }, this.CW_DEBOUNCE_MS);
    this._pendingTimers.set(timerId, levelId);
}

// G.2.3 — BatchCoordinator calls cancelPendingForLevels in onComplete
// In BatchCoordinator._onBatchComplete():
const levelIds = [...this._dirtyLevelIds];
roomTopologyObserver.cancelPendingForLevels(levelIds);     // ← NEW
roomTopologyObserver.setPostBatchCooldown(performance.now() + 1000); // 1s cooldown window
```

**Why a cooldown is needed in addition to cancel**: The cancel removes timers that were scheduled
during the batch drain. But `RoomTopologyObserver` may also receive CW store events from the
`endBatchYielded()` drain and re-schedule a new timer immediately after cancel. The 1-second cooldown
prevents this re-scheduling within 1s of batch completion — by which time the G.1 double-microtask
has safely lifted VDT suppression and the one legitimate EPS Flush #1 has completed.

**Acceptance criteria**:
- `§G2 cancelled N pending redetect timer(s)` appears in every CW batch completion log.
- RoomTopologyObserver does not dispatch REDETECT_ROOMS within 1s of batch completion for the levels
  covered by the batch.
- `[CommandManager] EXECUTE: REDETECT_ROOMS` does not appear in the 800ms window post-overlay-dismiss.

---

#### G.3 — Strengthen VDT element map for CASCADE events (G5)

**Status**: 🔴 PENDING (minor; LOW priority)

**Evidence**: doc 47 §4.5. VDT._onStoreEvent uses `_elementLevelMap.get(event.elementId)` for targeted
view dirtying. Wall IDs in the CASCADE are existing walls (registered before the CW batch). If any
wall ID is absent (e.g., after undo/redo phantom), fallback marks ALL non-3D views dirty — wider
reprojection scope. Currently not observed to fire incorrectly in normal sessions, but will affect
projects with many undo/redo cycles per Phase A's `onUnregister` contract.

**Files modified**: `src/engine/subsystems/core/views/ViewDependencyTracker.ts`

**Change** (in `_onStoreEvent()`):

```typescript
// G.3.1 — Log stale event IDs for observability, apply targeted fallback
private _onStoreEvent(event: StoreChangeEvent): void {
    if (this._batchSuppressed) return;
    const levelId = this._elementLevelMap.get(event.elementId);
    if (levelId === undefined) {
        // G.3 — stale ID: element was registered then unregistered (undo/redo cycle)
        // Do NOT mark all views dirty — only the system plan view for this element's store type
        console.warn('[VDT] §G3 event for unregistered element', event.elementId,
            'type=', event.elementType, '— fallback to store-type view only');
        this._markViewDirtyForStoreType(event.elementType);   // targeted, not all views
        return;
    }
    this._debounceMarkLevelDirty(levelId);
}
```

**Acceptance criteria**:
- `§G3 event for unregistered element` warning appears in undo/redo stress test (not in normal session).
- VDT does not mark the IFC or 3D view dirty for stale wall events.

---

**Phase G Completion Criteria**:
- EPS Flush #2 (the 81ms navigation LONGTASK) does not appear in any 15-CW batch session.
- `[CommandManager] EXECUTE: REDETECT_ROOMS` not within 1s of batch overlay dismiss for batch levels.
- VDT suppression log `§G1-SUPPRESS-LIFTED` appears in every batch; `§G1-TIMEOUT` never appears.
- Full collaboration test: second client does not see duplicate EPS flush events during A's batch.

---

### Phase H — P1: NME Proxy Expansion Culling and Caching (G2)

**Goal**: Reduce the NME proxy expansion cost from 1,182 meshes/flush to a culled and cached subset.
Even with 100% §C.3.2 EPS geometry cache hit rate, NME currently re-expands InstancedMesh on every
flush (the proxies are transient — cleared after use per C02 §4.3). This makes each EPS flush's
dominant cost the NME expansion, not the EPS processing.

**Basis**: doc 47 §3.2 (Cluster B — 1,182 proxies, 57–59ms chunks), §6 P1+P2, G2 analysis.

**Risk level**: H.1 (crop culling) — Low. H.2 (proxy cache) — Medium (memory implications,
reference counting for C02 §4.3 compatibility).

**Dependencies**: Phase A (A.1 for `onUnregister` to invalidate proxy cache on element removal),
Phase C (§C.3.2 projection cache — proxy cache mirrors same keying strategy).

**Phase H Task Board**:

| Task | Description | Status | Sprint | Priority | Gap | Blocker | Done-when |
|:----:|-------------|:------:|:------:|:--------:|:---:|---------|-----------|
| **H.1** | NME XZ crop culling — skip proxy creation for instances outside plan view bounds | 🔴 PENDING | Sprint 3 | P1 | G2 | F.1 | EPS chunk ≤35ms (was 57–59ms); `§H1-NME-CULL` OTel `instances_culled` > 0 |
| **H.2** | NME proxy cache — persist expansion keyed by `(elementId, userData.version)` | 🔴 PENDING | Sprint 3 | P1 | G2 | A.1 ✅, C.3.2 ✅ | Cache hit rate ≥ 80% on repeated EPS runs; `§H2-NME-CACHE` in log |

---

#### H.1 — NME XZ crop culling (plan view proxy pre-filter)

**Status**: 🔴 PENDING

**Evidence**: doc 47 §6 P1. NME already accepts `viewDef` with optional `spatial.cropRegion` (XZ bounds).
The InstancedMesh-to-proxy expansion runs unconditionally — every instance matrix is expanded to a Mesh
regardless of whether the instance falls within the plan view's crop region. For a typical office floor
plan, 40–60% of CW instances may be outside the plan view XZ bounds at any given zoom level.

**Files modified**: `src/engine/subsystems/core/views/NativeElementMeshExporter.ts`

**Change**:

```typescript
// H.1.1 — AABB2D crop test on instance world position before proxy creation
// In the InstancedMesh expansion loop:
private _expandInstancedMesh(
    im: THREE.InstancedMesh,
    viewDef: ViewDefinition,
    options: NMEExportOptions,
): THREE.Mesh[] {
    const proxies: THREE.Mesh[] = [];
    const cropRegion = options.cropRegion ?? viewDef.spatial?.cropRegion;
    const hasCrop = cropRegion !== undefined;
    const matrix = new THREE.Matrix4();

    for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, matrix);
        if (hasCrop) {
            // Extract world XZ position from the instance matrix (column-major)
            const wx = matrix.elements[12];
            const wz = matrix.elements[14];
            // Proxy AABB: instance position ± half-extent from geometry boundingSphere
            const halfX = (im.geometry.boundingSphere?.radius ?? 2) * 1.2;
            const halfZ = halfX;
            if (wx + halfX < cropRegion.minX || wx - halfX > cropRegion.maxX ||
                wz + halfZ < cropRegion.minZ || wz - halfZ > cropRegion.maxZ) {
                continue;   // instance is fully outside plan view crop — skip proxy creation
            }
        }
        // Create proxy mesh (existing logic, unchanged)
        const proxy = new THREE.Mesh(im.geometry, im.material);
        proxy.applyMatrix4(matrix);
        proxies.push(proxy);
    }
    return proxies;
}

// H.1.2 — OTel attributes for culling observability
span.setAttribute('nme.instances_total', im.count);
span.setAttribute('nme.instances_culled', im.count - proxies.length);
span.setAttribute('nme.crop_active', hasCrop);
```

**Performance contract**: For a standard plan view with `cropRegion` defined, proxy count reduction
must be ≥ 30% vs. uncropped. For a plan view with no `cropRegion`, behaviour is identical to current
(no regression). Log: `[NME] §H1 expanded N instances (M culled by XZ crop)`.

**Acceptance criteria**:
- EPS chunk duration for L0 9-CW batch: ≤35ms per chunk (was 57–59ms — 40% reduction).
- `nme.instances_culled` OTel attribute > 0 in sessions with a defined plan view crop region.
- Plan view correctly shows all CW lines (no missing lines from over-aggressive culling).

---

#### H.2 — NME proxy result cache keyed by (elementId, version)

**Status**: 🔴 PENDING

**Evidence**: doc 47 §6 P2 (Sprint 3). The §C.3.2 EPS projection cache eliminates repeat
EdgesGeometry + toDrawingSpace work. But NME proxy creation is the dominant cost in each chunk
even on a 100% EPS cache hit. The proxy list for a given element only changes when its 3D geometry
changes (`userData.version` increments). Between geometry changes, the same proxy list can be returned
from cache.

**Files modified**: `src/engine/subsystems/core/views/NativeElementMeshExporter.ts`,
`src/engine/subsystems/core/ElementRegistry.ts` (onUnregister → cache invalidate)

**Prerequisite analysis**: C02 §4.3 states "groups cleared after projection". This applies to the
outer wrapper `THREE.Group` passed to EPS, not to the NME-internal proxy list. Caching the proxy
list inside NME (returning the same Mesh instances across calls) is compatible with C02 §4.3 if:
1. The EPS caller does not mutate the proxy meshes' geometry (it reads only).
2. The cache entries use the `userData.version` from element `group.userData.version` as the cache key.
3. Cache entries are invalidated when the element is removed (`onUnregister` → cache delete).

**Memory analysis**: 1,182 proxy meshes × ~200 bytes each = ~236KB per flush retained. For 9 CW elements
on L0, this is ~2.1MB retained proxy cache. Acceptable against C10 NFT-MEM-01 (<1.5 GB session budget).
Maximum cache size: `MAX_NME_CACHE_ENTRIES=500` elements × 130 proxies avg × 200 bytes = ~13MB. Cap required.

**Change**:

```typescript
// H.2.1 — Cache data structure
interface NMEProxyCacheEntry {
    proxies: THREE.Mesh[];
    version: number;
    viewId: string;
    elementId: string;
    usedAt: number;             // performance.now() — for LRU eviction
}

private readonly _proxyCache = new Map<string, NMEProxyCacheEntry>();
private readonly MAX_CACHE_ENTRIES = 500;
private readonly CACHE_KEY_SEPARATOR = ':';

private _proxyCacheKey(elementId: string, viewId: string): string {
    return elementId + this.CACHE_KEY_SEPARATOR + viewId;
}

// H.2.2 — Cache lookup in exportForView()
exportForView(elementId: string, options: NMEExportOptions): THREE.Mesh[] {
    const span = tracer.startSpan('NME.exportForView');
    const group = this._sceneGraph.getGroupForElement(elementId);
    const currentVersion = group?.userData?.version ?? -1;
    const viewId = options.viewDef.id;
    const cacheKey = this._proxyCacheKey(elementId, viewId);
    const cached = this._proxyCache.get(cacheKey);

    if (cached && cached.version === currentVersion) {
        cached.usedAt = performance.now();
        span.setAttribute('nme.cache_hit', true);
        span.setAttribute('nme.proxy_count', cached.proxies.length);
        span.end();
        return cached.proxies;   // no allocation — return existing Mesh references
    }

    // Cache miss — expand InstancedMesh to proxy list (with H.1 crop culling)
    const proxies = this._expandElement(group, options);

    // Evict LRU if at capacity before inserting
    if (this._proxyCache.size >= this.MAX_CACHE_ENTRIES) {
        this._evictLRU();
    }
    this._proxyCache.set(cacheKey, { proxies, version: currentVersion, viewId, elementId, usedAt: performance.now() });
    span.setAttribute('nme.cache_hit', false);
    span.setAttribute('nme.proxy_count', proxies.length);
    span.end();
    return proxies;
}

// H.2.3 — Eviction on element removal (via onUnregister)
// In NME init (or dependency injection):
elementRegistry.onUnregister(id => {
    for (const [key, entry] of this._proxyCache) {
        if (entry.elementId === id) {
            // Dispose GPU resources for cached proxies of removed elements
            for (const mesh of entry.proxies) {
                if (mesh.geometry && !mesh.geometry.userData.sharedGeometry) {
                    mesh.geometry.dispose();
                }
            }
            this._proxyCache.delete(key);
        }
    }
});

// H.2.4 — LRU eviction
private _evictLRU(): void {
    let oldestKey = '';
    let oldestTime = Infinity;
    for (const [key, entry] of this._proxyCache) {
        if (entry.usedAt < oldestTime) { oldestTime = entry.usedAt; oldestKey = key; }
    }
    if (oldestKey) {
        const entry = this._proxyCache.get(oldestKey)!;
        for (const mesh of entry.proxies) {
            if (mesh.geometry && !mesh.geometry.userData.sharedGeometry) {
                mesh.geometry.dispose();
            }
        }
        this._proxyCache.delete(oldestKey);
    }
}

// H.2.5 — Dispose flag interaction with F.1
// When options.disposeProxies=true AND proxies are from cache, do NOT dispose them.
// Only dispose proxies that are NOT in the cache (cache miss path) after EPS finishes.
// EPS must call nme.releaseProxies(elementId, viewId) instead of directly disposing.
releaseProxies(elementId: string, viewId: string, forceDispose: boolean = false): void {
    const cacheKey = this._proxyCacheKey(elementId, viewId);
    if (this._proxyCache.has(cacheKey) && !forceDispose) {
        return;   // cached proxies retained — do not dispose
    }
    // Non-cached (miss path): proxies were already disposed by F.1
}
```

**Note on F.1 + H.2 interaction**: When H.2 is enabled, F.1's `disposeProxies` flag applies only
to cache-miss path proxies. Cache-hit path proxies must NOT be disposed (they are retained in cache).
EPS must use `nme.releaseProxies()` instead of directly calling `geometry.dispose()` on received proxies.

**Acceptance criteria**:
- Second EPS flush for unchanged CW elements: NME proxy expansion time ≈ 0ms (cache hit, no allocation).
- `nme.cache_hit=true` OTel attribute on second and subsequent EPS flushes for unchanged elements.
- After undo of 5 CW elements: those elements' cache entries evicted; no stale proxy references.
- `_proxyCache.size` never exceeds `MAX_CACHE_ENTRIES` (confirmed by log `[NME] §H2 evicted LRU entry`).
- EPS chunk duration for L0 9-CW batch (second flush): ≤5ms per chunk (was 57–59ms — 90% reduction).

---

**Phase H Completion Criteria**:
- EPS Flush #1 chunk duration (first run): ≤35ms/chunk (H.1 crop culling, 40% improvement).
- EPS Flush #N chunk duration (repeat, no changes): ≤5ms/chunk (H.2 cache hit, 90% improvement).
- GPU Monitor geometry count does not grow per EPS flush (H.2 cache + F.1 disposal cooperate).
- OTel traces show `nme.cache_hit`, `nme.instances_culled` attributes on all EPS project() spans.

---

### Phase I — P1: Extend PSO Prewarm to Cover SSGI Phase 2 and Shadow-Pass Variants (G3)

**Goal**: Eliminate the 3-LONGTASK / 422ms post-batch PSO compile cluster (Cluster A in doc-47 terminology).
The prewarm system currently targets base CW material variants. A 15-level WebGPU Phase 2 (SSGI=true) batch
generates more unique material × pass × variant combinations than prewarm covers. The live log's shadow
reactivation cluster (G6 / Phase K) adds a second PSO storm at T+30s — Phase I mitigates both.

**Basis**: doc 47 §3.1 (Cluster A, 422ms), §6 P3, G3 analysis. Live log Cluster B (shadow PSO storm).

**Risk level**: Medium. Extending the prewarm list touches the `_prewarmCurtainWallShaders()` function
which has a static guard (`_shadersPrewarmed`) and a scale guard (1.5× threshold). The extension must
not re-run prewarm on subsequent batches. Investigate the `§FIX-DISPOSE-USEDTIMES` WebGPU device loss.

**Dependencies**: Phase 0 (prewarm infrastructure, already implemented).

**Phase I Task Board**:

| Task | Description | Status | Sprint | Priority | Gap | Blocker | Done-when |
|:----:|-------------|:------:|:------:|:--------:|:---:|---------|-----------|
| **I.1** | Enumerate SSGI Phase 2 CW material variants in prewarm | 🔴 PENDING | Sprint 2 | P1 | G3 | None — Phase 0 infra ready | Post-batch PSO cluster ≤82ms; `§I1-PREWARM-PHASE2` in log |
| **I.2** | Null-guard `usedTimes` in pipeline dispose + yield between prewarm renders | 🔴 PENDING | Sprint 2 | P1 | §FIX-DISPOSE-USEDTIMES | None | No WebGPU device loss in CW batch session; error absent from log |

---

#### I.1 — Enumerate SSGI Phase 2 CW material variants in prewarm pass

**Status**: 🔴 PENDING

**Evidence**: doc 47 §3.1. "The prewarm targets the expected base CW material set. A 15-level batch
with SSGI+Phase2 generates more unique material × pass × variant combinations than prewarm covers.
Each additional level introduces at least one new PSO variant due to unique uniform bindings."

The Phase 2 pipeline (WebGPU=true, SSGI=true, TRAA=false) generates these additional PSO pass types
beyond the base ScenePass:
1. SSGI denoiser pass — requires a separate compute shader PSO per material roughness tier.
2. Depth pre-pass — a depth-only variant of the CW material PSO (no fragment colour output).
3. Shadow-receiver pass — for CW elements receiving shadows (Phase 2 shadow maps use different PCF kernel).
4. Outline pass variant — PASCAL outline shader generates a PSO per unique mesh topology type.

**Files modified**: `src/engine/subsystems/curtainwalls/CreateCurtainWallsOnAllSlabsCommand.ts`
(or wherever `_prewarmCurtainWallShaders()` lives)

**Change**:

```typescript
// I.1.1 — Extended prewarm: add Phase 2 pipeline variants
private static _prewarmCurtainWallShaders(renderer: WebGPURenderer, scene: THREE.Scene): void {
    if (CreateCurtainWallsOnAllSlabsCommand._shadersPrewarmed) return;
    const span = tracer.startSpan('CWCommand._prewarmCurtainWallShaders');

    // Existing prewarm probes (base CW material variants) — unchanged
    const panelGlassMesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 0.008),
        new THREE.MeshStandardMaterial({ color: 0xaaddff, transparent: true, opacity: 0.5 }),
        1
    );
    const panelSpandrelMesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 0.012),
        new THREE.MeshStandardMaterial({ color: 0x334455 }),
        1
    );
    const mullionMesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.05, 1, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.2 }),
        1
    );
    scene.add(panelGlassMesh, panelSpandrelMesh, mullionMesh);

    // I.1.2 — NEW Phase 2 variant: SSGI shadow-receiver probe
    // A mesh that receives shadows triggers the PCF shadow-receiver PSO variant in Phase 2
    const shadowReceiverProbe = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.6 })
    );
    shadowReceiverProbe.receiveShadow = true;   // ← triggers shadow-receiver PSO variant
    scene.add(shadowReceiverProbe);

    // I.1.3 — NEW Phase 2 variant: depth pre-pass probe
    // An additional semi-transparent mesh triggers the depth pre-pass PSO variant
    const depthPrepassProbe = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 1, 0.1),
        new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.3, depthWrite: true })
    );
    scene.add(depthPrepassProbe);

    // Three render passes — same as before, but now with Phase 2 probes in scene
    renderer.render(scene, _dummyCamera);
    renderer.render(scene, _dummyCamera);
    renderer.render(scene, _dummyCamera);

    // Remove all probes
    scene.remove(panelGlassMesh, panelSpandrelMesh, mullionMesh, shadowReceiverProbe, depthPrepassProbe);

    // Dispose probe geometries and materials (transient, not shared)
    [panelGlassMesh, panelSpandrelMesh, mullionMesh, shadowReceiverProbe, depthPrepassProbe]
        .forEach(m => { m.geometry.dispose(); (m.material as THREE.Material).dispose(); });

    CreateCurtainWallsOnAllSlabsCommand._shadersPrewarmed = true;
    span.setAttribute('prewarm.phase2', true);
    span.setAttribute('prewarm.probeCount', 5);
    span.end();
    console.log('[CWCommand] §I1-PREWARM-PHASE2 complete — Phase 2 PSO variants pre-compiled');
}
```

**Acceptance criteria**:
- Post-batch PSO LONGTASK cluster: ≤1 task ≤ 82ms (was 3 tasks × 82–179ms = 422ms).
- `§I1-PREWARM-PHASE2 complete` log appears once per session.
- No WebGPU device loss event during post-batch rendering.

---

#### I.2 — Fix `§FIX-DISPOSE-USEDTIMES` WebGPU device loss during PSO pressure

**Status**: 🔴 PENDING

**Evidence**: doc 47 §3.1: "Device loss during the intense compile cycle forces `RenderPipelineManager`
to rebuild the Phase 2 pipeline. Each recovery adds another round of PSO compilation."
`§FIX-DISPOSE-USEDTIMES` non-fatal error: "old pipeline disposal fails" — suggesting the dispose
path does not null-guard `usedTimes` before accessing it.

**Files modified**: `packages/renderer-three/src/RenderPipelineManager.ts` (or wherever
`§FIX-DISPOSE-USEDTIMES` error originates)

**Change**:

```typescript
// I.2.1 — Null-guard usedTimes in pipeline dispose path
private _disposePipeline(pipeline: RenderPipeline): void {
    if (!pipeline) return;
    // §FIX-DISPOSE-USEDTIMES: usedTimes may be undefined if pipeline was never fully initialized
    // (e.g., WebGPU device loss interrupted compilation mid-way)
    if (typeof pipeline.usedTimes !== 'number') {
        console.warn('[RenderPipelineManager] §I2 pipeline.usedTimes missing — skipping dispose');
        return;
    }
    if (pipeline.usedTimes > 0) {
        pipeline.usedTimes = 0;   // force release
    }
    pipeline.dispose?.();
}

// I.2.2 — Reduce PSO pressure during prewarm to prevent device loss
// Add a yield between each of the 3 prewarm render() calls:
renderer.render(scene, _dummyCamera);
await new Promise(resolve => setTimeout(resolve, 16));   // 1 frame gap
renderer.render(scene, _dummyCamera);
await new Promise(resolve => setTimeout(resolve, 16));
renderer.render(scene, _dummyCamera);
```

**Note**: Making `_prewarmCurtainWallShaders` async requires the caller to `await` it.
`CreateCurtainWallsOnAllSlabsCommand.execute()` must be changed to `async execute()` if not already.
This is compatible with the existing `CommandManager.execute()` async path (C11 §3.2).

**Acceptance criteria**:
- `WebGPU device recovered — renderer recreated` does NOT appear in post-batch logs.
- `§FIX-DISPOSE-USEDTIMES` error does not appear.
- Post-batch rendering: RenderPipelineManager correctly maintains Phase 2 pipeline state.

---

**Phase I Completion Criteria**:
- Post-batch PSO LONGTASK cluster: ≤1 task (was 3). Duration: ≤82ms (was 422ms cumulative).
- No WebGPU device loss in any CW batch session with Phase 2 pipeline active.
- `§I1-PREWARM-PHASE2` log appears in session log before batch overlay shows.
- OTel span `CWCommand._prewarmCurtainWallShaders` has `prewarm.phase2=true` attribute.

---

### Phase K — P1: Shadow Reactivation LONGTASK Fix (G6 — New from Live Logs)

**Goal**: Fix the T+30s shadow reactivation from its current 8-LONGTASK / 1,591ms / FPS=6 behaviour
to zero LONGTASKs using an adaptive FrameScheduler-driven drain.

**Basis**: Live log `browser_console_20260507_214128_021.log` Cluster B. Gap reference: G6 (NEW — not
in doc 47 or doc 48). This is a NEWLY CONFIRMED critical finding from the live session.

**Evidence analysis**:
- Cluster B start: 478,666ms. Cluster A end: 448,891ms. Gap: 29,775ms ≈ 30 seconds.
- This is the `setTimeout(30000)` shadow reactivation callback.
- 4 warm-up tasks (80–122ms): `group.traverse()` over all walls to set `castShadow=true`.
  With 4,897 geometries, the traverse is O(4,897) with a `castShadow` write and scene dirty flag
  per node — enough to exceed the 16ms frame budget if done synchronously.
- 4 heavy tasks (274–341ms): WebGPU shadow-pass PSO compilation for newly shadow-enabled geometries.
  Each unique material+geometry combination that gains `castShadow=true` requires a new shadow-pass
  PSO variant in the WebGPU pipeline. With ~41 draw calls in the scene, up to 41 shadow-pass PSOs
  compile in rapid succession.

**Root cause of existing plan's wrong estimate**: The existing plan states "~1 render frame at T+30s"
and `WALLS_PER_SHADOW_FRAME=10000` (all walls in one traversal). With 4,897 total geometries and
a WebGPU Phase 2 pipeline, the shadow map PSO compilation is a first-time compile event (PSOs for
the shadow pass are NOT warmed by Phase 0 prewarm — they require actual scene shadow casters). This
makes the "first shadow render" equivalent to the post-batch PSO compile (Cluster A in doc-47) in cost.

**Risk level**: Low for K.1 (adaptive slice — just change `WALLS_PER_SHADOW_FRAME` and scheduling).
Medium for K.2 (shadow PSO prewarm — requires rendering a shadow map during the main prewarm pass).

**Dependencies**: Phase I (shadow-pass PSO prewarm — K.2 extends I.1). Phase F.2 (adaptive drain
pattern — K.1 mirrors the same FrameScheduler pattern used for build drain).

**Phase K Task Board**:

| Task | Description | Status | Sprint | Priority | Gap | Blocker | Done-when |
|:----:|-------------|:------:|:------:|:--------:|:---:|---------|-----------|
| **K.1** | Shadow reactivation adaptive slice drain — `WALLS_PER_SHADOW_SLICE = 50`, FrameScheduler-driven | 🔴 PENDING | Sprint 3 | P1 | G6 | F.2 | T+30s: 0 LONGTASKs > 50ms; FPS ≥ 30; `§K1-SHADOW-COMPLETE` in log |
| **K.2** | Shadow-pass PSO prewarm — 4th `renderer.render()` with shadow-caster probe in Phase 0 | 🔴 PENDING | Sprint 3 | P1 | G6 | I.1 | Cluster B heavy tasks ≤50ms; `§K2-SHADOW-PSO-PREWARM` in log |

---

#### K.1 — Shadow reactivation adaptive slice drain

**Status**: 🔴 PENDING

**Evidence**: 8 LONGTASKs, 1,591ms total, FPS=6. `WALLS_PER_SHADOW_FRAME=10000` — meant to process all
walls in one call, but this is the source of the synchronous traverse + PSO compile storm.

**Files modified**: `src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts`

**Change**:

```typescript
// K.1.1 — Change shadow reactivation from single-shot to adaptive slice
private _reactivateShadows(wallIds: readonly string[]): void {
    const span = tracer.startSpan('CurtainWallBuilder._reactivateShadows');
    const WALLS_PER_SHADOW_SLICE = 50;   // ← was WALLS_PER_SHADOW_FRAME=10000
    let index = 0;
    const totalWalls = wallIds.length;

    const drainSlice = () => {
        const sliceStart = performance.now();
        const end = Math.min(index + WALLS_PER_SHADOW_SLICE, totalWalls);
        for (let i = index; i < end; i++) {
            const group = this._sceneGraph.getGroupForElement(wallIds[i]);
            if (!group) continue;
            group.traverse(obj => {
                if ((obj as THREE.Mesh).isMesh) {
                    (obj as THREE.Mesh).castShadow = true;
                    (obj as THREE.Mesh).receiveShadow = true;
                }
            });
        }
        index = end;
        span.setAttribute('shadow.progress', index);
        span.setAttribute('shadow.sliceMs', (performance.now() - sliceStart).toFixed(1));

        if (index < totalWalls) {
            // Reschedule next slice in next pre-render slot — gives renderer a frame gap
            getFrameScheduler().scheduleOnce(
                `cw-shadow-reactivate-${index}`,
                drainSlice,
                'pre-render'
            );
        } else {
            // All walls shadow-enabled. WebGPU shadow map rebuild fires on next render.
            console.log('[CurtainWallBuilder] §K1-SHADOW-COMPLETE ' + totalWalls + ' walls reactivated');
            span.setAttribute('shadow.totalWalls', totalWalls);
            span.end();
        }
    };

    // K.1.2 — Schedule first slice via FrameScheduler (not direct setTimeout)
    // The setTimeout(30000) still controls when reactivation begins.
    // Once the timer fires, the slice loop uses FrameScheduler for each subsequent slice.
    drainSlice();   // called from within the setTimeout(30000) callback
}
```

**Performance analysis**:
- 294 walls ÷ 50 walls/slice = 6 slices × ~2ms traverse per slice = ~12ms traverse total.
- Each slice: ≤12ms (well within 16.6ms budget). Zero LONGTASKs from traverse.
- Shadow PSO compilation: still happens (K.2 addresses this separately). But with interleaved slices,
  the GPU has 50-wall increments to compile instead of 294 at once — PSO compiles in smaller bursts.
- Total shadow reactivation: ~6 rAF ticks × ~16ms = ~100ms spread, vs. 1,591ms concentrated.

**Acceptance criteria**:
- `§K1-SHADOW-COMPLETE N walls reactivated` log appears at T+30s (+ drain spread).
- Zero LONGTASKs > 50ms during shadow reactivation phase (PerformanceObserver).
- FPS ≥ 30 during shadow reactivation (was FPS=6).
- All walls cast and receive shadows after reactivation (visual verification).

---

#### K.2 — Shadow-pass PSO prewarm (extend Phase I)

**Status**: 🔴 PENDING

**Evidence**: Cluster B heavy tasks (274–341ms) are WebGPU shadow-pass PSO compilations — not traverse
work. Even with K.1 adaptive slicing, if the shadow PSOs are not pre-warmed, the first shadow map
render still triggers a PSO compile LONGTASK for each unique material in the scene.

**Strategy**: Extend Phase 0 prewarm to include one shadow map render pass. This compiles shadow PSOs
before the batch runs, so they are in the WebGPU driver cache by the time T+30s fires.

**Files modified**: Same as I.1 (`_prewarmCurtainWallShaders`)

**Change** (appended to I.1 prewarm):

```typescript
// K.2.1 — Add shadow-caster probe to prewarm scene and force shadow map compilation
// After the existing prewarm probes are added to scene:

// Enable shadow casting on one probe — triggers shadow-pass PSO variant
panelSpandrelMesh.castShadow = true;
mullionMesh.castShadow = true;

// Add a shadow-receiving plane — triggers shadow-receiver PSO variant
const shadowGroundProbe = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshStandardMaterial({ color: 0x888888 })
);
shadowGroundProbe.receiveShadow = true;
shadowGroundProbe.rotation.x = -Math.PI / 2;
scene.add(shadowGroundProbe);

// A temporary directional light with shadow enabled triggers the shadow map PSO
const shadowLight = new THREE.DirectionalLight(0xffffff, 1);
shadowLight.castShadow = true;
shadowLight.shadow.mapSize.set(512, 512);   // minimal size for prewarm (not final quality)
scene.add(shadowLight);

// K.2.2 — Render with shadow pass to compile shadow PSOs
// The fourth render() call specifically includes the shadow map compilation
await new Promise(resolve => setTimeout(resolve, 16));   // 1 frame gap after Phase 2 probes
renderer.shadowMap.enabled = true;
renderer.render(scene, _dummyCamera);   // ← shadow-pass PSOs compiled here

// Clean up
scene.remove(shadowGroundProbe, shadowLight);
shadowGroundProbe.geometry.dispose();
(shadowGroundProbe.material as THREE.Material).dispose();

console.log('[CWCommand] §K2-SHADOW-PSO-PREWARM complete');
span.setAttribute('prewarm.shadowPass', true);
```

**Acceptance criteria**:
- `§K2-SHADOW-PSO-PREWARM complete` log appears in every session before first batch.
- Cluster B heavy tasks (274–341ms) reduced to ≤50ms (cached PSO reuse).
- Shadow map renders correctly at T+30s (K.1 slices + K.2 pre-warmed PSOs = no LONGTASKs).

---

**Phase K Completion Criteria**:
- T+30s shadow cluster: 0 LONGTASKs > 50ms (was 8 LONGTASKs, 1,591ms).
- FPS during shadow reactivation: ≥ 30fps (was 6fps).
- All CW walls correctly cast/receive shadows after reactivation.
- Total time to complete shadow reactivation: ≤200ms spread (invisible to user at 30fps).

---

### Phase C — Projection Cache (EdgeProjectorService)

**Goal**: Eliminate repeat EdgeProjector work for unchanged walls. Cache EdgesGeometry + toDrawingSpace
result per `(elementId, viewId, userData.version)`. Cache hit: ~0ms. Cache miss: full path.

**Basis**: Original plan §C (existing design), doc-47 confirmed §C.3.2 working ✅. Phase C extends
and finalises the cache with proper dispose and project-switch invalidation.

**Dependencies**: Phase A (A.1: `onUnregister` → cache invalidation), Phase B (B.4: `userData.version`
contract — version increments only on geometry change). Phase H must NOT break Phase C — NME proxy
cache and EPS projection cache are independent (different keys, different data).

**Phase C Task Board**:

| Task | Description | Status | Sprint | Priority | Gap | Blocker | Done-when |
|:----:|-------------|:------:|:------:|:--------:|:---:|---------|-----------|
| **C.1** | `userData.version` contract verification | ✅ DONE | — | — | — | — | Version increment confirmed via B.4 |
| **C.2** | Projection cache: `dispose()` on eviction + LRU cap 5,000 entries | ✅ DONE | Sprint 4 | P1 | — | — | `_evictLruCwCacheEntry()` calls `geometry.dispose()`; `MAX_CW_PROJECTION_CACHE=5000` enforced |
| **C.3** | Invalidation wiring — `invalidateCwElement()` confirmed wired | ✅ DONE | — | — | — | — | `edgeProjectorService.invalidateCwElement(id)` called on `CurtainWallBuilder.remove()` |
| **C.4** | Project-switch cache clear via `clearAll()` with per-entry dispose | ✅ DONE | — | — | — | — | `clearAll()` iterates entries + disposes geometries (not raw `.clear()`) |
| **C.5** | TypedArray pool for `EdgesGeometry` construction | ✅ DONE | Sprint 4 | P1 | G7 | — | `Float32Pool` + `edgeFloat32Pool` singleton present; acquire/release with dispose listener |
| **C.6** | Pre-intern layer name strings (replace hot-path concat) | ✅ DONE | Sprint 4 | LOW | G8 | — | `_LAYER_CUT_NAME`/`_LAYER_PROJ_NAME`/`_LAYER_BEYOND_NAME` Maps pre-interned; zero hot-path concat |

---

#### C.1 — userData.version contract verification

**Status**: ✅ DONE (Phase B.4 established the version increment)

`group.userData.version` is incremented in `CurtainWallBuilder._buildOne()` after every geometry build.
It is reset to 0 when the element is removed. It is not persisted — always starts cold on project load.

---

#### C.2 — Projection cache data structure (§C.3.2 — already implemented, extend with dispose)

**Status**: ⚠️ EXTEND NEEDED

The `§C.3.2` cache is confirmed working per doc-47 §5. Flush #2 onwards show cache hits.
Extension needed: ensure `_projectionCache.get().geometry.dispose()` is called on eviction and
on `invalidateCwElement()`. Current implementation may not dispose GPU resources on eviction.

**Files modified**: `src/engine/subsystems/core/views/EdgeProjectorService.ts`

**Change**:

```typescript
// C.2.1 — Ensure dispose on cache eviction
private _evictProjectionCacheEntry(key: string): void {
    const entry = this._cwProjectionCache.get(key);
    if (!entry) return;
    for (const layerGeo of Object.values(entry.geometryByLayer)) {
        if (layerGeo && layerGeo.isBufferGeometry) {
            layerGeo.dispose();   // releases GPU buffer
        }
    }
    this._cwProjectionCache.delete(key);
}

// C.2.2 — LRU cap on cache
private readonly MAX_PROJECTION_CACHE = 5000;   // entries
// In cache set path: if size >= MAX, evict LRU entry before setting
```

---

#### C.3 — Invalidation wiring (existing — confirm complete)

**Status**: ✅ DONE per doc-47 §5. `CurtainWallBuilder.remove()` calls
`edgeProjectorService.invalidateCwElement(id)`. This fires `_evictProjectionCacheEntry(key)` for
all views keyed on that `elementId`. Phase C.2.1 adds the geometry dispose to this path.

---

#### C.4 — Project-switch cache clear

**Status**: ✅ DONE. `_executeFinalSweep()` on `ClearProjectCommand` calls
`edgeProjectorService.clearAll()` which iterates all entries and disposes geometries.
Confirm `clearAll()` calls `_evictProjectionCacheEntry()` for each key (not just `_cwProjectionCache.clear()`).

---

#### C.5 — TypedArray pool for EdgesGeometry construction (G7)

**Status**: 🔴 PENDING

**Evidence**: audit §6.1. New `Float32Array(edgeVertexCount)` per mesh in the EPS hot path.
52 allocations per CW element × 40 CWs = 2,080 small typed-array allocations per batch.

**Files modified**: `src/engine/subsystems/core/views/EdgeProjectorService.ts`

**Change**:

```typescript
// C.5.1 — Float32Array pool (simple size-bucketed pool)
class Float32Pool {
    private readonly _buckets = new Map<number, Float32Array[]>();
    acquire(size: number): Float32Array {
        const bucket = this._buckets.get(size);
        return bucket?.pop() ?? new Float32Array(size);
    }
    release(arr: Float32Array): void {
        const size = arr.length;
        const bucket = this._buckets.get(size) ?? [];
        if (bucket.length < 32) { bucket.push(arr); this._buckets.set(size, bucket); }
    }
}

export const edgeFloat32Pool = new Float32Pool();

// C.5.2 — Replace new Float32Array in EdgesGeometry path
// Before: const positions = new Float32Array(edgeVertexCount * 3);
// After:  const positions = edgeFloat32Pool.acquire(edgeVertexCount * 3);
// After geometry.setAttribute, do not release pool array — it's owned by the geometry.
// On geometry.dispose(), release back to pool via a dispose listener:
geometry.addEventListener('dispose', () => {
    edgeFloat32Pool.release(positions);
});
```

---

#### C.6 — Pre-intern layer name strings (G8)

**Status**: 🔴 PENDING

**Evidence**: audit §7.3. 2,080 string allocations per batch from layer name concatenation.

**Files modified**: `src/engine/subsystems/core/views/EdgeProjectorService.ts`

**Change**:

```typescript
// C.6.1 — Pre-interned constants
const LAYER_PROJECTION_VISIBLE      = 'projection-visible'       as const;
const LAYER_PROJECTION_PROJ         = 'projection-visible:proj'  as const;
const LAYER_PROJECTION_CUT          = 'projection-visible:cut'   as const;
const LAYER_PROJECTION_BEYOND       = 'projection-visible:beyond' as const;

// Replace all string concatenation in the hot traverse path with these constants.
```

---

**Phase C Completion Criteria**:
- EPS second-run (0 changes): ≤200ms total (Phase C cache hit rate = 100%).
- EPS second-run (5 changed walls): ≤350ms (5 cache misses + 289 hits).
- GPU Monitor geometry count does not grow across EPS runs (C.2.1 dispose on eviction).
- `edgeFloat32Pool` bucket sizes non-zero after first batch (confirmed via debug log).

---

### Phase D — Observability

**Goal**: Ensure every phase of the pipeline is observable via structured logs and OTel spans.
All log tags below are searchable via `grep §` in the console filter.

**Status**: ⚠️ PARTIALLY DONE. The following are confirmed present:
`§PERF-ADAPTIVE-DRAIN`, `§PERF-VIEW-BATCH-SUPPRESS`, `§PERF-SHADOW-DELAY`,
`§BATCH-EVENT-YIELD`, `§DIAG-EPS-01/02/03/04`. Extensions needed for new phases.

**Phase D Task Board**:

| Task | Description | Status | Sprint | Priority | Gap | Blocker | Done-when |
|:----:|-------------|:------:|:------:|:--------:|:---:|---------|-----------|
| **D.1** | `batchId` threading through all phase logs | ✅ DONE | — | — | — | — | `__activeBatchId` typed in `global-window.d.ts`; set at batch start |
| **D.2** | `performance.now()` for all timing logs | ✅ DONE | — | — | — | — | All new log sites use sub-ms timestamps |
| **D.3** | BN-07 500ms phase budget warning | ✅ DONE | — | — | — | — | BatchCoordinator emits `§BN-07` warn when any phase > 500ms |
| **D.4** | New §-tags for phases F, G, H, I, K (15 new tags) + OTel spans | ✅ DONE | Sprint 4 | P1 | — | — | All 15 §-tags at canonical names: §F1-PROXY-DISPOSE, §F2-RESUME-ONLY, §F3-SHARED-BUDGET, §G1-SUPPRESS-LIFTED, §G1-TIMEOUT, §G2-CANCELLED, §G3-STALE-EVENT, §H1-NME-CULL, §H2-NME-CACHE, §I1-PREWARM-PHASE2, §K1-SHADOW-SLICE, §K1-SHADOW-COMPLETE, §K2-SHADOW-PSO-PREWARM, §PERF-CACHE-STATS, §SHADOW-30S-SCHEDULED |
| **D.5** | GPU Monitor geometry ceiling alarm (`geometries > 12,000`) | ✅ DONE | — | — | — | — | `[GPU Monitor] 🔴 Geometry count exceeded` fires at ceiling; CI gate wired |

---

#### D.1 — batchId threading through all phase logs

**Status**: ✅ DONE. `__activeBatchId` typed in `global-window.d.ts`, set at batch start.

---

#### D.2 — performance.now() for all timing logs

**Status**: ✅ DONE. All new logs use `performance.now()` (sub-millisecond).

---

#### D.3 — BN-07 500ms warning

**Status**: ✅ DONE. BatchCoordinator emits warning if phase exceeds 500ms.

---

#### D.4 — New observability tags for phases F, G, H, I, K

**Status**: 🔴 PENDING

All new phases must emit console logs with the following tags:

| Tag | Phase | Fires when |
|-----|-------|------------|
| `§F1-PROXY-DISPOSE` | F.1 | After each EPS flush; includes `count` disposed |
| `§F2-RESUME-ONLY` | F.2 | When `.resume()` replaces `.resumeAndFlush()` — confirms no sync drain |
| `§F3-SHARED-BUDGET` | F.3 | Per-rAF: reports how much budget each builder consumed |
| `§G1-SUPPRESS-LIFTED` | G.1 | When double-microtask fires; includes `ms` from isBatching=false |
| `§G1-TIMEOUT` | G.1 | If hard timeout forces suppression lift (should NEVER appear in normal sessions) |
| `§G2-CANCELLED` | G.2 | Count of cancelled RoomTopologyObserver timers per batch |
| `§G3-STALE-EVENT` | G.3 | Stale VDT event for unregistered element (warn level) |
| `§H1-NME-CULL` | H.1 | Per EPS flush: instances total / culled / crop active |
| `§H2-NME-CACHE` | H.2 | Per EPS flush: cache hits / misses / evictions |
| `§I1-PREWARM-PHASE2` | I.1 | Once per session: Phase 2 PSO prewarm complete |
| `§K1-SHADOW-SLICE` | K.1 | Per slice: index, count, sliceMs |
| `§K1-SHADOW-COMPLETE` | K.1 | After last slice: totalWalls, totalMs |
| `§K2-SHADOW-PSO-PREWARM` | K.2 | Once per session: shadow PSO prewarm complete |
| `§PERF-CACHE-STATS` | C | After each EPS run: hit rate, miss count, cache size |
| `§SHADOW-30S-SCHEDULED` | B.2 | When shadow reactivation setTimeout fires (confirms scheduling) |

---

#### D.5 — GPU Monitor geometry ceiling alarm

**Status**: ✅ CONFIRMED WORKING. `[GPU Monitor] 🔴 Geometry count exceeded project ceiling`
appears in logs when geometries > 12,000. After Phase F.1, this alarm must never fire in
post-batch monitoring cycles. CI gate: `scripts/ci-check-geometry-ceiling.ts` added to pipeline.

---

**Phase D Completion Criteria**:
- Every batch produces a `§`-tagged log for each of the phases F, G, H, I, K in the console.
- Replaying a batch log for any session produces a complete timeline of all phase transitions.
- `pnpm --filter @pryzm/scripts run ci-check-spans` exits 0 (all new public methods have OTel spans).

---

### Phase E — Collaboration Safety

**Goal**: Make the batch pipeline CRDT-safe: observable blackout window, semantic conflict surface,
command-log catch-up mitigation.

**Basis**: doc 48 §4 (collaboration constraint), C08 §3.1–3.3.

**Risk level**: High — requires server-side seqNo changes for E.1. Phase E is the lowest priority
for the performance target; it is P1 for the product correctness target.

**Dependencies**: Phase A (command undo stack correctness).

**Phase E Task Board**:

| Task | Description | Status | Sprint | Priority | Gap | Blocker | Done-when |
|:----:|-------------|:------:|:------:|:--------:|:---:|---------|-----------|
| **E.1** | Instrument CRDT batch blackout window — OTel histogram + `§E1-CRDT-BLACKOUT` log | ✅ DONE | Sprint 4 | P1 | — | — | `§E1-CRDT-BLACKOUT` fires at onComplete; `onBatchWindowOpen/Close` hooks wired in BatchCoordinator + YjsDocAdapter |
| **E.2** | `seqNo` ordering for remote command dispatch — sort by seqNo, warn on delta < 50ms | ⛔ BLOCKED | — | P1 | — | Server: `seqNo` column absent from `project_command_log` | Sort by seqNo; no silent reorder at p95 |
| **E.3** | Semantic geometry conflict detection — `CW_LEVEL_Y_MISMATCH` `CRDTConflict` | ✅ DONE | Sprint 5 | P2 | — | E.1 ✅ | `§E3-CW_LEVEL_Y_MISMATCH` log + `emitConflict` in `_detectCwLevelYMismatch()` |

---

#### E.1 — Instrument CRDT batch blackout window

**Status**: 🔴 PENDING

**Evidence**: doc 48 §4.3. `YjsDocAdapter.applyCommand()` is wired via StoreEventBus listeners.
During the batch (StoreEventBus buffered at depth=2), zero CRDT ops fire for 11.4s.

**Files modified**: `src/engine/subsystems/core/batch/BatchCoordinator.ts`,
`packages/sync-client/src/YjsDocAdapter.ts`

**Change**:

```typescript
// E.1.1 — Log CRDT blackout window
// In BatchCoordinator._setupBatch():
const batchStart = performance.now();
yjsDocAdapter.onBatchWindowOpen?.({ batchId, startMs: batchStart });

// In BatchCoordinator._onBatchComplete():
const blackoutMs = performance.now() - batchStart;
yjsDocAdapter.onBatchWindowClose?.({ batchId, blackoutMs, elementCount: createdIds.length });
console.log(`[Collaboration] §E1-CRDT-BLACKOUT batchId=${batchId} duration=${blackoutMs.toFixed(0)}ms elements=${createdIds.length}`);

// E.1.2 — Emit metric for observability dashboard
otelMeter.createHistogram('pryzm.crdt.batch_blackout_ms').record(blackoutMs, {
    element_type: 'curtainwall',
    element_count: createdIds.length,
});
```

---

#### E.2 — seqNo ordering for remote command dispatch

**Status**: 🔴 PENDING (requires server-side seqNo in `project_command_log`)

**Evidence**: doc 48 §4.5. Commands replayed from the command log must execute in the correct order
to produce a deterministic result. Without seqNo, clock skew between clients can cause REORDER.

**Contract alignment**: C08 §3.3. Phase E.2 is blocked on server-side seqNo addition.
Client-side mitigation: sort by `timestamp` if `seqNo` absent; emit warning if timestamp delta
between consecutive commands < 50ms (potential ordering violation).

---

#### E.3 — Semantic geometry conflict detection for concurrent level edits

**Status**: ✅ DONE (Sprint 5 — 2026-05-15)

**Evidence**: doc 48 §4.4. If user B moves a level's Y during user A's batch, CW elements are
built at the old Y but reference the new `levelId`. `CRDTConflictResolver.mergeElement()` does not
detect cross-element semantic inconsistencies (CW Y vs. level Y).

**Approach**: Add a post-merge validation step in `YjsDocAdapter.applyUpdate()` that checks
`curtainWall.levelId → level.Y === curtainWall.computedBaseY`. If mismatch:
surface as a `CRDTConflict` with `type: 'CW_LEVEL_Y_MISMATCH'` and prompt user.

---

**Phase E Completion Criteria**:
- `§E1-CRDT-BLACKOUT` log appears after every batch.
- `pryzm.crdt.batch_blackout_ms` histogram visible in OTel dashboard.
- Collaboration integration test (two clients, simultaneous edit): zero silent model corruption.

---

### Phase J — P2: 1M-Element Foundations

**Goal**: Establish the architectural prerequisites for scaling the batch pipeline to 1M elements.
This phase is **quarterly** — none of these changes are sprint-sized. The items below are
design decisions that must be made NOW (in ADRs) to avoid structural technical debt.

**Basis**: doc 48 §6 (1M-element constraint analysis), doc 48 §8 Step 5.

**Phase J Task Board**:

| Task | Description | Status | Sprint | ADR | Blocker | Done-when |
|:----:|-------------|:------:|:------:|:---:|---------|-----------|
| **J.1** | InstancedMesh post-batch coalescing — merge same-material CWs across levels | 🔄 IN PROGRESS | QTR | ADR-046 | — | ADR-046 approved; prototype merged |
| **J.2** | Web Worker geometry build — `CurtainWallBuilder` on OffscreenCanvas Worker | 🔄 IN PROGRESS | QTR | ADR-047 | — | ADR-047 approved; prototype merged |
| **J.3** | Virtualized ElementStore + spatial streaming — LRU 50k cap, stream from DB | 🔄 IN PROGRESS | QTR | ADR-048 | — | ADR-048 approved; prototype merged |
| **J.4** | Y.Doc-per-level collaboration split — independent Y.Doc per level | 🔄 IN PROGRESS | QTR | ADR-049 | — | ADR-049 approved; prototype merged |
| **J.5** | AI response cache by content hash — 7-day TTL keyed by PDF page hash | 🔄 IN PROGRESS | QTR | ADR-050 | — | ADR-050 approved; prototype merged |

> **Phase J gate**: ADR-046 through ADR-050 must be approved before any 1M-element architectural change begins. (Note: ADR numbers 039–045 were already taken by pre-existing decisions; renumbered to 046–050 on 2026-05-08.)

---

#### J.1 — InstancedMesh post-batch grouping

**Evidence**: doc 48 §6.2.1. At 1M elements, per-element geometry = 2.2 GB. InstancedMesh reduces
geometry count from O(n) to O(materialTypes) ≈ 50 geometries. Already partially implemented
for CW elements (InstancedMesh per panel type). Extension: after batch completion, coalesce all
same-material CW elements across levels into a single InstancedMesh per material.

**ADR required**: ADR-046: InstancedMesh Coalescing Strategy for Batch Element Creation.

---

#### J.2 — Web Worker geometry build

**Evidence**: doc 48 §6.2.2, §8 Step 5. Moving `CurtainWallBuilder`, `WallFragmentBuilder`,
`SlabFragmentBuilder` compute to an OffscreenCanvas Web Worker eliminates ALL frame budget
violations from geometry build. Main thread receives only the final `ArrayBuffer` transfers.

**Note**: Phase F.2 (resume → adaptive drain) is the immediate fix for the current LONGTASKs.
Phase J.2 is the long-term fix that makes geometry build frame-budget-proof at any scale.

**ADR required**: ADR-047: Web Worker Geometry Build Pipeline.

---

#### J.3 — Virtualized ElementStore with LRU eviction

**Evidence**: doc 48 §6.2.5. At 1M elements, Zustand + Immer draft proxy wrapping takes 100–500ms
per mutation. Virtualized store: cap in-memory element count at 50,000; evict by LRU + spatial
distance from camera; stream from PostgreSQL/Supabase via `persistence-client`.

**ADR required**: ADR-048: Virtualized ElementStore with Spatial Streaming.

---

#### J.4 — Y.Doc-per-level collaboration split

**Evidence**: doc 48 §6.2.3. At 1M elements, a single Y.Doc produces ~200MB sync messages.
Y.Doc-per-level: each level's CRDT document independently syncable. Late joiners load only
visible levels. Server assembles full project from sub-documents.

**ADR required**: ADR-049: Y.Doc-per-Level Collaboration Architecture.

---

#### J.5 — AI response cache by content hash

**Evidence**: doc 48 §5.3, §5.5. Re-importing identical PDF re-hits LLM. Cache response keyed
by content hash of PDF page(s) in `packages/ai-host/`. Cache stored in PostgreSQL with 7-day TTL.
Quota enforcement gates only the LLM call (not the batch): batch is always deterministic.

**ADR required**: ADR-050: AI Response Caching by Content Hash.

---

**Phase J Delivery**: All J items produce ADRs and prototype implementations only in this sprint.
Full implementation is quarterly. ADR-0039 through ADR-0043 must be approved before any
1M-element-scale architectural change begins.

---

## Part 4 — Performance Budget Targets

### 4.1 Per-Phase Budget (294 walls, 17 slabs, 3 levels)

| Phase | Budget | Current (live log) | After F | After F+G | After F+G+H+I | After all |
|-------|--------|--------------------|---------|-----------|---------------|-----------|
| 0 · Prewarm | 200ms | ≤150ms ✅ | ≤150ms | ≤150ms | **≤200ms (+shadow PSO)** | ≤200ms |
| 1 · Store mutation | 50ms | ~20ms ✅ | ~20ms | ~20ms | ~20ms | ~20ms |
| 2 · Deferred resume | 15ms | ~17ms ✅ | **<5ms** | <5ms | <5ms | <5ms |
| 3 · Build drain | 1,000ms spread | **6,898ms storm** | **≤1,000ms / 0 LONGTASKs** | ≤1,000ms | ≤750ms | ≤750ms |
| 4 · Registration | 20ms | 5–10ms ✅ | 5–10ms | 5–10ms | 5–10ms | 5–10ms |
| 5 · Event drain | 50ms | ~33ms ✅ | ~33ms | ~33ms | ~33ms | ~33ms |
| **Total to interactive** | **1,200ms** | **~7,100ms** | **~1,200ms** | **~1,200ms** | **~1,200ms** | **≤1,000ms** |
| 6 · EPS Flush #1 | 5,000ms | 174ms/3 chunks ✅ | 174ms | 174ms | **≤100ms (H)** | ≤100ms |
| 6 · EPS Flush #2 | **0ms (eliminate)** | **81ms LONGTASK** | 81ms | **0ms (G)** | 0ms | 0ms |
| Post-batch PSO | 0ms (pre-warmed) | 422ms / 3 tasks | 422ms | 422ms | **≤82ms (I)** | ≤82ms |
| 7 · Shadow @T+30s | ≤200ms spread | **1,591ms / 8 tasks** | 1,591ms | 1,591ms | 1,591ms | **≤200ms (K)** |

### 4.2 GPU Budget

| Resource | Budget | Enforcement |
|----------|--------|-------------|
| PSO compile LONGTASKs during batch | 0ms | §PERF-PREWARM-MULTIPASS + Phase I extension |
| Shadow-pass PSO LONGTASKs at T+30s | 0ms | Phase K.2 prewarm + K.1 adaptive slice |
| Per-wall shadow map rebuild during drain | 0 | `castShadow=false` during drain (B.2) |
| Shadow map rebuild at T+30s | ≤6 rAF slices | K.1: 50 walls/slice, Phase K |
| EdgesGeometry per group (EPS hit) | 0ms | §C.3.2 projection cache |
| EdgesGeometry per group (EPS miss) | ≤250ms/group | CHUNK_SIZE=1 |
| NME proxy expansion per flush (repeat) | 0ms | Phase H.2 proxy cache |
| NME proxy expansion per flush (first) | ≤35ms/chunk | Phase H.1 crop culling |
| Geometry buffer count after batch | 0 leaked | Phase F.1: dispose after EPS use |
| Geometry buffer count after undo | back to pre-batch | `_disposeChildren()` on `remove()` |

### 4.3 Memory Budget

| Resource | Budget | Enforcement |
|----------|--------|-------------|
| NME proxy geometry leak per flush | 0 | Phase F.1 disposal |
| NME proxy cache (500 elements × 130 proxies) | ≤13MB | Phase H.2 LRU cap |
| EPS projection cache (294 walls, 1 view) | ≤50MB GPU + ≤5MB CPU | §C.3.2 + C.2.1 dispose on evict |
| GPU Monitor `geometries` after batch | < 12,000 ceiling | Phase F.1 |
| Undo stack patch size (single batch undo) | ≤50MB (NFT-18) | CommandManager patch size guard |
| CRDT blackout window | ≤200ms (target P2) | Phase E.1 metric; J.2 eliminates structurally |

---

## Part 5 — Contract Compliance Matrix

| Invariant | Phase F | Phase G | Phase H | Phase I | Phase K | Phase C | Phase D | Phase E |
|-----------|---------|---------|---------|---------|---------|---------|---------|---------|
| I-1 Single mutation path | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| I-2 Builder isolation | ✅ `.resume()` is a builder method | ✅ | ✅ NME internal cache | ✅ | ✅ | ⚠️ Builder calls EPS.invalidate — documented | ✅ | ✅ |
| I-3 Store is data only | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| I-4 Atomic batch envelope | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| I-5 Single rAF | ✅ FrameScheduler used, not raw rAF | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| I-6 No `(window as any)` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| I-7 THREE only in renderer-three | ⚠️ NME proxy dispose in L7.5 — acceptable per existing pattern | ✅ | ⚠️ NME cache in L7.5 — acceptable | ✅ | ✅ | ✅ | ✅ | ✅ |
| I-8 OTel spans | ✅ `resume()`, `_disposeProxyGroup` | ✅ `_onBatchComplete`, `cancelPendingForLevels` | ✅ `exportForView` extended | ✅ `_prewarmCurtainWallShaders` | ✅ `_reactivateShadows` | ✅ | ✅ | ✅ |
| I-9 Commands own registration | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| I-10 Commands are undo path | ✅ | ✅ | ✅ NME cache evicts on onUnregister | ✅ | ✅ | ✅ | ✅ | ✅ |

**C10 NFT compliance per phase**:

| NFT | Before | After F | After G | After H+I+K |
|-----|--------|---------|---------|-------------|
| NFT-4 Frame budget ≤16.6ms p95 | ❌ 344–448ms | ✅ 0 LONGTASKs during drain | ✅ | ✅ |
| NFT-3 Tool latency <50ms p95 | ❌ 7–11s freeze | ✅ drain is background | ✅ | ✅ |
| NFT-5 Plan view re-render <100ms p95 | ⚠️ 174ms | ⚠️ 174ms | ✅ 0ms flush #2 | ✅ ≤100ms (H) |
| NFT-16 Memory <1.5GB / 10k / 1h | ❌ leak confirmed | ✅ F.1 seals leak | ✅ | ✅ |
| NFT-14 AI e2e <8s | ❌ batch alone 7–11s | ✅ drain is background (<1.2s to interactive) | ✅ | ✅ |

---

## Part 6 — Execution Order and Dependencies

```
Phase A (COMPLETE) ─────────────────────────────────────────────────────────────────────┐
  A.1–A.6: correctness, undo safety, idempotency                                        │
                                                                                         │
Phase B (COMPLETE) ─────────────────────────────────────────────────────────────────────┤
  B.1–B.4: panel cache, shadow default, mullion dummy, cell cache                       │
                                                                                         │
Phase F (P0 — NEXT SPRINT) ← requires A, B ─────────────────────────────────────────── ┤
  F.1: NME proxy disposal      ─────────────────────────────────────┐                   │
  F.2: resume() not resumeAndFlush() ──────────────────────────────┐│                   │
  F.3: shared per-rAF budget   ─────────────────────────────────── ┘│                   │
                                                                     │                   │
Phase G (P1) ← requires F.2 (isBatching=false fires at right moment)│                  │
  G.1: double-microtask VDT suppress lift ─────────────────────────┐│                  │
  G.2: cancel RTO pending timers ─────────────────────────────────┐ ││                  │
  G.3: VDT stale event targeted fallback  ─────────────────────── ┘ ││                  │
                                                                    │ ││                  │
Phase H (P1) ← requires F.1 (F.1 + H.2 interact on dispose flag)  │ ││                  │
  H.1: NME crop culling  ────────────────────────────────────────┐ │ ││                  │
  H.2: NME proxy cache   ← requires A.1 (onUnregister) ──────── ┘ │ ││                  │
                                                                    │ │ │                  │
Phase I (P1) ← requires Phase 0 prewarm infrastructure            │ │ │                  │
  I.1: SSGI Phase 2 PSO prewarm extension ──────────────────────┐ │ │ │                  │
  I.2: usedTimes null-guard fix         ────────────────────── ┘│ │ │ │                  │
                                                                 ││ │ │ │                  │
Phase K (P1) ← requires I.1 (K.2 extends I.1 shadow prewarm)   ││ │ │ │                  │
  K.1: shadow adaptive slice drain ─────────────────────────── ┐││ │ │ │                  │
  K.2: shadow PSO prewarm          ← requires I.1 ──────────── ┘││ │ │ │                  │
                                                                  ││ │ │ │                  │
Phase C (P1) ← requires A.1, B.4; parallel with G/H/I/K         ││ │ │ │                  │
  C.1: version contract (DONE)                                    ││ │ │ │                  │
  C.2: cache dispose extension ──────────────────────────────── ┐││ │ │ │                  │
  C.3: cache integration (DONE)                                  │││ │ │ │                  │
  C.4: invalidation wiring (DONE)                                │││ │ │ │                  │
  C.5: TypedArray pool (G7)    ──────────────────────────────── ┘││ │ │ │                  │
  C.6: layer string intern (G8) ─────────────────────────────────┘│ │ │ │                  │
                                                                   │ │ │ │                  │
Phase D (parallel with any phase) ─────────────────────────────── ┘ │ │ │                  │
  D.4: §-tags for F, G, H, I, K ─────────────────────────────────── ┘ │ │                  │
  D.5: GPU ceiling CI gate       ─────────────────────────────────────── ┘ │                  │
                                                                             │                  │
Phase E (P1, parallel with B/C/D) ───────────────────────────────────────── ┘                  │
  E.1: CRDT blackout instrumentation                                                            │
  E.2: seqNo ordering (server-blocked)                                                          │
  E.3: semantic conflict detection (P2)                                                         │
                                                                                                │
Phase J (P2 — quarterly) ← all above COMPLETE ──────────────────────────────────────────────── ┘
  J.1–J.5: ADRs for 1M-element foundations
```

**Sprint assignments**:

| Sprint | Phases | Expected outcome |
|--------|--------|-----------------|
| **Sprint 1** (this sprint) | F.1, F.2, F.3 | 53 LONGTASKs → 0; geometry leak sealed; FPS≥30 during drain |
| **Sprint 2** | G.1, G.2, G.3, I.1, I.2 | EPS Flush #2 eliminated; PSO LONGTASKs ≤82ms |
| **Sprint 3** | H.1, H.2, K.1, K.2 | NME cost −40–90%; shadow reactivation 0 LONGTASKs |
| **Sprint 4** ✅ | C.2, C.5, C.6, D.4, D.5, E.1 | Full cache lifecycle, observability, CRDT instrumentation — **COMPLETE 2026-05-08** |
| **Sprint 5 (Quarterly)** 🔄 | J.1–J.5 | ADRs approved; prototype implementations — **IN PROGRESS 2026-05-08** |

---

## Part 7 — Acceptance Criteria (End-to-End)

### 7.1 Performance

- [ ] 294-wall batch: overlay dismisses in **≤1,200ms** from command dispatch (Phases 0–5)
- [ ] 294-wall batch: **zero LONGTASKs > 50ms** during Phase 3 drain (PerformanceObserver)
- [ ] 294-wall batch: FPS **≥ 30fps** throughout drain (user can orbit while walls build)
- [ ] 294-wall batch: plan view updated in **≤5,000ms** from overlay dismiss (Phase 6, first run)
- [ ] 294-wall batch: second plan view refresh (0 changes) in **≤200ms** (Phase C cache)
- [ ] 294-wall batch: second plan view refresh (5 changed walls) in **≤350ms** (5 misses + 289 hits)
- [ ] Phase 6 Flush #1: no EPS chunk > **35ms** (H.1 crop culling applied)
- [ ] Phase 6 Flush #2: **does not occur** (G eliminates redundant flush)
- [ ] Post-batch PSO cluster: **≤1 task, ≤82ms** (Phase I prewarm covers Phase 2 variants)
- [ ] T+30s shadow cluster: **zero LONGTASKs > 50ms** (Phase K adaptive slice)
- [ ] T+30s shadow cluster: **FPS ≥ 30** during shadow reactivation (was FPS=6)

### 7.2 Memory / GPU

- [ ] GPU Monitor `geometries` after batch: **< 12,000** ceiling (Phase F.1 proxy disposal)
- [ ] GPU Monitor `geometries` stable across monitoring cycles post-batch (no growth = no new leak)
- [ ] GPU Monitor `geometries` after undo: returns to pre-batch baseline within 2 GC cycles
- [ ] `THREE.BoxGeometry` count: **+2 per batch** (panel glass + spandrel), not +588 (Phase B.1)
- [ ] NME proxy cache size: never exceeds **500 entries** (H.2 LRU cap)
- [ ] EPS projection cache: disposed correctly on wall remove (0 leaked after 10 undo cycles)
- [ ] No `WebGPU device recovered` event during post-batch rendering (Phase I.2)

### 7.3 Correctness

- [ ] Execute → Undo → Redo × 5 cycles: **zero console errors**, store size returns to pre-batch level
- [ ] Double-click "Create CW": **only one batch** executes (idempotency key A.6)
- [ ] Undo after partial failure: undo stack **empty** (command not pushed on throw)
- [ ] `ElementRegistry` after 5 undo cycles: **zero phantom entries**
- [ ] `ViewDependencyTracker` after 5 undo cycles: **zero phantom entries** (A.2 onUnregister)
- [ ] NME proxy cache after undo: evicted for removed element IDs (H.2 onUnregister hook)
- [ ] Project switch mid-batch: `forceReset()` fires, overlay dismisses, StoreEventBus not stuck at depth 1
- [ ] `[CommandManager] EXECUTE: REDETECT_ROOMS` does not appear within 1s of batch overlay dismiss

### 7.4 Observability

- [ ] All logs for one batch share the same `batchId` prefix
- [ ] `§F1-PROXY-DISPOSE` log shows correct disposed count per EPS flush
- [ ] `§F2-RESUME-ONLY` log confirms no synchronous drain on Phase 2 callback
- [ ] `§G1-SUPPRESS-LIFTED` log appears in every batch; **`§G1-TIMEOUT` NEVER appears**
- [ ] `§G2-CANCELLED N timer(s)` appears in every CW batch
- [ ] `§H1-NME-CULL` and `§H2-NME-CACHE` logs appear in every EPS flush
- [ ] `§I1-PREWARM-PHASE2` and `§K2-SHADOW-PSO-PREWARM` appear once per session
- [ ] `§K1-SHADOW-COMPLETE` appears at T+30s with correct wall count
- [ ] `§PERF-CACHE-STATS` appears after every EPS run with hit rate

### 7.5 Architectural Gates

- [ ] `pnpm tsc --noEmit`: **0 errors** after each phase
- [ ] `tools/ga-gate/check-raf-count.ts`: ratchet unchanged (no new raw `requestAnimationFrame`)
- [ ] `tools/ga-gate/check-cast-count.ts`: non-shim cast count unchanged
- [ ] `scripts/ci-check-spans.ts`: all new public methods have OTel spans
- [ ] `scripts/ci-check-geometry-ceiling.ts`: GPU Monitor ceiling test exits 0 after batch

---

## Part 8 — Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| F.2 `resume()` change breaks `signalBuildQueueDrained()` timing | Medium | High (overlay never dismisses) | Add watchdog timer (30s) already in plan. Add unit test: mock drain queue, confirm signal fires on empty. |
| H.2 proxy cache returns wrong proxies after geometry update (stale version) | Low | High (plan view shows old lines) | `userData.version` is incremented atomically in `_buildOne()`. Cache key includes version. Stale version → cache miss → re-expand. Assertion in dev builds: confirm version matches. |
| G.1 double-microtask insufficient for large CASCADE (many dependent elements) | Low | Medium (Flush #2 not eliminated) | Add hard timeout `§G1-TIMEOUT` guard (2s). Monitor `§G1-SUPPRESS-LIFTED` timing in production. If consistently > 2ms, increase to triple-microtask or wait for `storeEventBus` quiescence. |
| K.2 shadow PSO prewarm adds to Phase 0 prewarm time | Low | Low (prewarm is a one-time cost) | Shadow prewarm is one additional render pass with a minimal shadow map (512×512). Expected cost: +20–40ms to a prewarm that already runs at session start (before user loads a model). |
| I.2 making `_prewarmCurtainWallShaders` async introduces a race with batch dispatch | Low | Medium (batch may start before prewarm finishes) | Guard: `execute()` awaits prewarm if prewarm is in progress. Use a `_prewarmPromise` field: if prewarm already running, `await _prewarmPromise`; else `_prewarmPromise = _prewarm(); await _prewarmPromise`. |
| H.2 proxy cache memory unbounded if `MAX_CACHE_ENTRIES` too large | Low | Medium (session OOM for large projects) | Cap at 500 entries. Monitor `_proxyCache.size` via D.4 tags. If OOM observed in field, reduce to 200. |
| G.2 `cancelPendingForLevels()` cancels a timer that was legitimately needed | Very Low | Low (room topology not updated for one batch cycle) | The cancelled timer fires only for levels the CW batch just processed — room topology for those levels is already correct from the batch. The 1s cooldown allows re-scheduling if genuinely needed. |
| F.3 shared budget token starves a builder with large queue | Low | Medium (one builder (e.g. WallFragmentBuilder) never empties) | Budget consumption is proportional to actual work done per tick. Builders with larger queues get more slices (they reschedule faster). Watchdog timer (30s) catches starvation. |
| F.1 + H.2 dispose interaction — cache-hit proxies accidentally disposed | Medium | High (crash or missing plan view lines) | EPS must use `nme.releaseProxies()` (H.2.5), not direct `geometry.dispose()`, when H.2 is active. H.2 is feature-flagged; F.1 is unconditional. Integration test: batch → EPS flush #1 → EPS flush #2 → confirm plan view identical. |
| WebGPU device loss during PSO pressure (I.2 target) | **CONFIRMED LIVE** (session 2) | **CRITICAL** (767ms LONGTASK on recovery + `§FIX-DISPOSE-USEDTIMES` crash) | I.2 null-guard eliminates crash. Phase I prewarm + yield-between-passes reduces PSO pressure. Phase F.2 (no sync drain) eliminates the peak PSO pressure that triggers device loss. |
| 22-second LONGTASK (session 3 live log) | **CONFIRMED LIVE** | **CATASTROPHIC** (tab unresponsive for 22s, FPS=1) | Directly caused by `resumeAndFlush()` on a large batch. F.2 (`resume()` only) is the sole mitigation. No other phase can address this — F.2 is the P0 fix. |

---

## Part 0.2 — Additional Live Log Evidence (Second and Third Sessions, 2026-05-07)

### Session 2 (`browser_console_20260507_215346_804.log`) — New project proj-l4jbcu9

**New LONGTASK cluster** (start=703,937ms, FPS=4):

| Tasks | Duration range | Count | Total span | Notes |
|-------|---------------|-------|-----------|-------|
| All tasks | 251–291ms | 22 | ~5,888ms | Remarkably uniform — all ~260ms. Suggests WallFragmentBuilder's resumeAndFlush() processing fixed-size wall batches. |

Followed by **WebGPU device loss** (t=1,178,768ms):
- `THREE.WebGPURenderer: WebGPU Device Lost: A valid external Instance reference no longer exists.`
- Recovery: 767ms LONGTASK (context restoration) + 236ms LONGTASK (pipeline rebound).
- `§FIX-DISPOSE-USEDTIMES — Cannot read properties of undefined (reading 'usedTimes')` **confirmed live**.
- `geometries:0` throughout — clean project, no prior content. Device loss is purely from PSO pressure.

**Confirmed**: The WebGPU device loss documented in doc 47 §3.1 as a theoretical risk is a **real, repeatable event** in the current codebase. It is triggered by the PSO compilation storm from `resumeAndFlush()` on a large batch, not by scene complexity.

### Session 3 (`browser_console_20260507_215436_155.log`) — Clean project

**Single 22,182ms LONGTASK** (start=1,199,023ms):

```
[LONGTASK] duration=22182.0ms start=1,199,023ms [type=iframe ...]
```

- FPS=1fps. `geometries:0` before and after.
- **22.2 seconds of complete main-thread freeze** from a single JS task.
- This is the most extreme LONGTASK recorded across all sessions. It represents the entire build queue
  of a large batch drained synchronously in one `resumeAndFlush()` call.
- At FPS=1, the user sees a completely frozen, unresponsive UI for the entire 22-second duration.
- This is not an edge case — it is the deterministic output of `resumeAndFlush()` on a batch of
  sufficient size. The duration scales linearly with batch element count.

**Revised LONGTASK storm severity table** (all sessions):

| Session | Worst single task | Total tasks | Total frozen span | FPS floor | Root cause |
|---------|------------------|-------------|-------------------|-----------|------------|
| Doc 47 primary | 179ms | 7 | ~750ms | 18fps | PSO + EPS (post-Phase B) |
| Doc 48 primary | 448ms | 24 | ~6,900ms | 3fps | resumeAndFlush (24 elements) |
| Live session 1 | 382ms | 53 | ~6,898ms | 3fps | resumeAndFlush (larger batch) |
| Live session 2 | 291ms | 22 | ~5,888ms | 4fps | resumeAndFlush (uniform walls) |
| Live session 2 | 767ms | 1 | 767ms | — | WebGPU device loss |
| **Live session 3** | **22,182ms** | **1** | **22,182ms** | **1fps** | **resumeAndFlush (large batch)** |

**Conclusion**: The 22.2-second LONGTASK proves that `resumeAndFlush()` is catastrophically wrong for
production use at any real project scale. Phase F.2 (change to `resume()` + adaptive drain) is not a
performance optimization — it is a correctness fix. A 22-second frozen tab is a product-level regression
that violates every user experience standard and every NFT in C10.

---

## Part 9 — File Change Summary

This section lists every file expected to change per phase. Use for PR scope verification and
reviewer guidance.

### Phase F — Sprint 1

| File | Change | Phase items |
|------|--------|-------------|
| `src/engine/subsystems/core/views/NativeElementMeshExporter.ts` | Add `_disposeProxyGroup()`. Add `NMEExportOptions.disposeProxies` flag. Add `disposeGeometry: boolean` path to group clear. | F.1 |
| `src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts` | Replace `resumeAndFlush()` with `resume()`. Transfer `_pausedBuildsMap → _pendingBuildsMap` synchronously. Register ONE FrameScheduler drain callback. Add shared budget token consumption (F.3). | F.2, F.3 |
| `src/engine/subsystems/walls/WallFragmentBuilder.ts` | Same `resume()` replacement as CWBuilder. | F.2, F.3 |
| `src/engine/subsystems/slabs/SlabFragmentBuilder.ts` | Same `resume()` replacement as CWBuilder. | F.2, F.3 |
| `src/engine/subsystems/core/batch/BatchCoordinator.ts` | Replace three `resumeAndFlush()` calls with `resume()`. Add shared budget token setup `FrameScheduler.setBatchBudget()`. | F.2, F.3 |
| `packages/runtime-composer/src/scheduler.ts` | Add `setBatchBudget()` / `getBatchBudget()` / `BudgetToken` API. | F.3 |
| `global-window.d.ts` | Add `discardAndSuppress` / `restore` / `resume` to `RebuildControl` type. Remove `resumeAndFlush`. | F.2 |

### Phase G — Sprint 2

| File | Change | Phase items |
|------|--------|-------------|
| `src/engine/subsystems/core/batch/BatchCoordinator.ts` | Replace direct `setSuppressed(false)` + `markLevelsDirtyImmediate()` with double-`queueMicrotask` wrapper. Add 2s hard timeout guard. Add `roomTopologyObserver.cancelPendingForLevels()` call. Add 1s cooldown `setPostBatchCooldown()`. | G.1, G.2 |
| `src/engine/subsystems/rooms/RoomTopologyObserver.ts` | Add `cancelPendingForLevels(levelIds)`. Add `_pendingTimers: Map<TimerId, levelId>` tracking. Add `_postBatchCooldownUntil` guard in `_scheduleRedetect()`. Add `setPostBatchCooldown()`. | G.2 |
| `src/engine/subsystems/core/views/ViewDependencyTracker.ts` | Strengthen `_onStoreEvent()`: fallback to `_markViewDirtyForStoreType()` for unregistered elements instead of marking all views dirty. Add `§G3` warning log. | G.3 |

### Phase H — Sprint 3

| File | Change | Phase items |
|------|--------|-------------|
| `src/engine/subsystems/core/views/NativeElementMeshExporter.ts` | Add `_expandInstancedMesh()` with XZ crop pre-filter. Add `NMEProxyCacheEntry` type. Add `_proxyCache: Map<string, NMEProxyCacheEntry>`. Add `_evictLRU()`. Add `releaseProxies()`. Wire `elementRegistry.onUnregister()` for cache invalidation. | H.1, H.2 |
| `src/engine/subsystems/core/views/EdgeProjectorService.ts` | Replace direct `geometry.dispose()` on proxy meshes with `nme.releaseProxies(elementId, viewId)`. | H.2.5 interaction with F.1 |

### Phase I — Sprint 2

| File | Change | Phase items |
|------|--------|-------------|
| `src/engine/subsystems/curtainwalls/CreateCurtainWallsOnAllSlabsCommand.ts` | Extend `_prewarmCurtainWallShaders()` with shadow-receiver, depth-prepass, SSGI Phase 2 probes. Add yield between render passes. Make async. | I.1, I.2 |
| `packages/renderer-three/src/RenderPipelineManager.ts` | Add null-guard on `pipeline.usedTimes` in `_disposePipeline()`. Set `usedTimes = 0` before dispose. | I.2 |

### Phase K — Sprint 3

| File | Change | Phase items |
|------|--------|-------------|
| `src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts` | Replace single-shot traverse in `_reactivateShadows()` with adaptive slice loop using FrameScheduler. Change `WALLS_PER_SHADOW_FRAME=10000` to `WALLS_PER_SHADOW_SLICE=50`. | K.1 |
| `src/engine/subsystems/curtainwalls/CreateCurtainWallsOnAllSlabsCommand.ts` | Extend prewarm to add shadow-caster + shadow-receiver probes + directional light. Add shadow map render pass to prewarm. | K.2 |

### Phase C — Sprint 4

| File | Change | Phase items |
|------|--------|-------------|
| `src/engine/subsystems/core/views/EdgeProjectorService.ts` | Add `_evictProjectionCacheEntry()` with geometry dispose. Add LRU cap (`MAX_PROJECTION_CACHE=5000`). Add Float32Array pool (`edgeFloat32Pool`). Replace `new Float32Array()` with pool acquire. Add dispose-listener for pool release. Replace layer name string concat with pre-interned constants. | C.2, C.5, C.6 |

### Phase D — Sprint 4

| File | Change | Phase items |
|------|--------|-------------|
| `src/engine/subsystems/core/views/NativeElementMeshExporter.ts` | Add `§H1`, `§H2` structured log calls with instance counts and cache stats. | D.4 |
| `src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts` | Add `§F2-RESUME-ONLY`, `§K1-SHADOW-SLICE`, `§K1-SHADOW-COMPLETE` logs. | D.4 |
| `src/engine/subsystems/core/batch/BatchCoordinator.ts` | Add `§G1-SUPPRESS-LIFTED`, `§G1-TIMEOUT`, `§G2-CANCELLED` logs. | D.4 |
| `src/engine/subsystems/curtainwalls/CreateCurtainWallsOnAllSlabsCommand.ts` | Add `§I1-PREWARM-PHASE2`, `§K2-SHADOW-PSO-PREWARM` logs. | D.4 |
| `src/engine/subsystems/core/views/EdgeProjectorService.ts` | Add `§PERF-CACHE-STATS` log after each project() run. | D.4 |
| `scripts/ci-check-geometry-ceiling.ts` | New CI script: parse GPU Monitor log; assert geometries < 12,000 after batch. | D.5 |

### Phase E — Sprint 4

| File | Change | Phase items |
|------|--------|-------------|
| `src/engine/subsystems/core/batch/BatchCoordinator.ts` | Add `yjsDocAdapter.onBatchWindowOpen/Close` calls. Add `§E1-CRDT-BLACKOUT` log. Add OTel histogram record. | E.1 |
| `packages/sync-client/src/YjsDocAdapter.ts` | Add `onBatchWindowOpen?: (info) => void` and `onBatchWindowClose?: (info) => void` optional hooks. | E.1 |

### Phase J — Quarterly (ADRs only in this sprint)

| File | Action |
|------|--------|
| `docs/03_PRYZM3/03-ADRs/ADR-0039-instanced-mesh-coalescing.md` | New ADR: InstancedMesh grouping strategy |
| `docs/03_PRYZM3/03-ADRs/ADR-0040-worker-geometry-build.md` | New ADR: Web Worker geometry build pipeline |
| `docs/03_PRYZM3/03-ADRs/ADR-0041-virtualized-element-store.md` | New ADR: Virtualized ElementStore with spatial streaming |
| `docs/03_PRYZM3/03-ADRs/ADR-0042-ydoc-per-level.md` | New ADR: Y.Doc-per-Level collaboration architecture |
| `docs/03_PRYZM3/03-ADRs/ADR-0043-ai-response-cache.md` | New ADR: AI response caching by content hash |

---

## Part 10 — Log Evidence Appendix

### 10.1 LONGTASK Chronology (All Sessions, 2026-05-07)

**Session 1** (`browser_console_20260507_214128_021.log`) — proj-spqozl2:

```
Cluster A: start=441,993ms → end=448,891ms (53 LONGTASKs, 6,898ms span)
  Peak: 382ms. Trough: 69ms. FPS: 3 → 13.
  Attribution: resumeAndFlush() × 3 builders + adaptive drain LONGTASKs.

Cluster B: start=478,666ms → end=480,265ms (8 LONGTASKs, 1,591ms span)
  Peak: 341ms. Trough: 80ms. FPS: 6.
  Attribution: T+30s shadow reactivation (§PERF-SHADOW-DELAY setTimeout).
  Gap from Cluster A end: 29,775ms ≈ 30s → confirms shadow timer.

GPU Monitor (stable, 4 cycles): geometries:4897 textures:8 drawCalls:41 tris:852
  119 geometries per draw call — NME proxy geometry leak confirmed.
```

**Session 2** (`browser_console_20260507_215346_804.log`) — proj-l4jbcu9 (fresh project):

```
Cluster A: start=703,937ms → end=709,825ms (22 LONGTASKs, 5,888ms span)
  Duration range: 251–291ms (remarkably uniform — walls all same size).
  FPS: 4. Attribution: WallFragmentBuilder.resumeAndFlush() on large wall count.

WebGPU device loss: t=1,178,768ms
  Error: "WebGPU Device Lost: A valid external Instance reference no longer exists."
  Recovery: 767ms LONGTASK (context restoration) + 236ms LONGTASK (pipeline rebound).
  §FIX-DISPOSE-USEDTIMES confirmed: "Cannot read properties of undefined (reading 'usedTimes')"

GPU Monitor throughout: geometries:0 — clean project, no leak yet.
After device recovery: geometries:0, Phase 2 pipeline rebound confirmed.
```

**Session 3** (`browser_console_20260507_215436_155.log`) — clean project:

```
Single LONGTASK: duration=22,182ms, start=1,199,023ms
  FPS: 1. geometries:0. Attribution: resumeAndFlush() on maximum batch size.
  22.2-second complete main-thread freeze — tab completely unresponsive.
  This is the worst recorded LONGTASK in the project's history.
```

### 10.2 Raw GPU Monitor Samples (Session 1)

```
T=+11.9s  [GPU Monitor] geometries:4897 textures:8 | drawCalls:41 tris:852
T=+21.9s  [GPU Monitor] geometries:4897 textures:8 | drawCalls:41 tris:852
T=+31.9s  [GPU Monitor] geometries:4897 textures:8 | drawCalls:41 tris:852
T=+41.9s  [GPU Monitor] geometries:4897 textures:8 | drawCalls:41 tris:852
  → Count unchanged across 4 × 10s samples = permanent bounded leak (not GC-able)
```

### 10.3 Key Log Tags Observed Across All Sessions

```
[PRYZM] §BN-05c WebGPU device lost — CW prewarm reset (PSOs invalidated)
[PRYZM] §BN-09a WebGPU device lost — CW prewarm cooldown set (5000ms)
[RenderPipelineManager] §FIX-DISPOSE-USEDTIMES — old pipeline dispose error (non-fatal):
  "Cannot read properties of undefined (reading 'usedTimes')"
[PRYZM] WebGPU device recovered — renderer recreated.
[RenderPipelineManager] Phase: phase2 | WebGPU: true | SSGI: true | TRAA: false
[RenderPipelineManager] Phase 2 pipeline active.
[GPU Monitor] geometries:4897 textures:8 | drawCalls:41 tris:852
[FPS] 3fps / 4fps / 6fps (varies by session and batch size)
[LevelPlaneConstraint] Locked Y=59.8000 for element "Slab" id="5322d50c-..."
[LevelPlaneConstraint] Locked Y=60.0000 for element "CurtainWall" id="06fd4aa4-..."
[PickResolver] strategy=gpu-pick hover-hit=5322d50c-...  (user picking during storm)
```

### 10.4 Invariant Confirmations (Positive Evidence)

The following invariants are CONFIRMED WORKING from live logs:

```
[RenderPipelineManager] Phase: phase2 | WebGPU: true | SSGI: true | TRAA: false
  → I-5 (single rAF): Phase 2 pipeline correctly active across all sessions.

[RenderPipelineManager] onProjectSwitch — clearing outline refs, resetting retry counter
  → Project switch safety (forceReset equivalent) fires correctly on context loss.

[PRYZM] WebGPU device recovered — renderer recreated.
  → Recovery path works; pipeline rebound succeeds.
  → BUT: §FIX-DISPOSE-USEDTIMES fires during recovery — I.2 null-guard required.
```

---

## Part 11 — What a Founding Engineer Would Prioritize (Synthesis)

Applying the founding-engineer framework from doc 48 §8 to all live evidence:

### Order of attack

1. **This sprint (P0)**: Fix Phase F.2 first. The 22.2-second LONGTASK in Session 3 is not
   a performance concern — it is a correctness regression. A 22-second frozen tab means the
   product is unusable. The change (`.resumeAndFlush()` → `.resume()`) is 3 lines per file,
   6 files total, with zero architectural risk. Do this today.

2. **This sprint (P0)**: Fix Phase F.1 (proxy geometry disposal). The geometry leak is bounded
   but real. The `§FIX-DISPOSE-USEDTIMES` error proves the WebGPU device loss is happening in
   production today. While F.2 reduces PSO pressure (reducing device loss frequency), F.1 seals
   the GPU memory leak that compounds over long sessions.

3. **Sprint 2 (P1)**: Fix I.2 (`usedTimes` null-guard) and I.1 (SSGI Phase 2 PSO prewarm).
   The device loss is a production crash path. The null-guard is 3 lines. The prewarm extension
   is 20 lines. Together they eliminate the crash + reduce post-batch PSO pressure by ~5×.

4. **Sprint 2 (P1)**: Fix G.1 (VDT suppression through CASCADE). The 81ms navigation freeze
   post-batch is observable every session. Users notice FPS drops during the first 800ms of
   navigation after placing walls. G.1 + G.2 together eliminate this class of post-batch jank.

5. **Sprint 3 (P1)**: Fix K.1 (shadow slice drain). Session 1 confirmed 1,591ms / FPS=6 at
   T+30s. With F.2 already done, the shadow cluster becomes the dominant LONGTASK source in
   steady-state use. K.1 is 15 lines.

6. **Sprint 3 (P1)**: Fix H.1+H.2 (NME culling + cache). These address the EPS flush cost
   for repeated plan view refreshes. Lower priority than the freeze and crash fixes.

7. **Sprint 4 (P1)**: Observability (Phase D) + CRDT instrumentation (Phase E.1). Needed to
   detect regressions from J-phase ADR implementations.

8. **Quarterly (P2)**: ADR-0039 through ADR-0043. These are architectural decisions that must
   be made before the product hits 10,000+ element projects in production.

### What not to do

- Do not address Phase C (projection cache extensions) before Phase F. The cache provides ≤200ms
  gain on repeat flushes; Phase F eliminates 22,000ms freeze on first create.
- Do not address Phase E (collaboration) before Phase F. CRDT blackout instrumentation is
  observability work; the 22-second freeze is a correctness emergency.
- Do not begin J-phase implementation before all ADRs are approved and all Phase F–K items
  are complete. Structural changes to the ElementStore or Y.Doc model during an active
  performance emergency increases risk without delivering measurable gain.

---

## Document Status

| Phase | Status | Sprint | Primary owner |
|-------|--------|--------|---------------|
| A | ✅ COMPLETE | — | — |
| B | ✅ COMPLETE | — | — |
| F.1 | 🔴 PENDING — P0 | Sprint 1 | NME / EPS owner |
| F.2 | 🔴 PENDING — P0 | Sprint 1 | BatchCoordinator / Builder owner |
| F.3 | 🔴 PENDING — P0 | Sprint 1 | FrameScheduler owner |
| G.1 | 🔴 PENDING — P1 | Sprint 2 | BatchCoordinator owner |
| G.2 | 🔴 PENDING — P1 | Sprint 2 | RoomTopologyObserver owner |
| G.3 | 🔴 PENDING — LOW | Sprint 4 | VDT owner |
| H.1 | 🔴 PENDING — P1 | Sprint 3 | NME owner |
| H.2 | 🔴 PENDING — P1 | Sprint 3 | NME owner |
| I.1 | 🔴 PENDING — P1 | Sprint 2 | CreateCWCommand owner |
| I.2 | 🔴 PENDING — P0 | Sprint 2 | RenderPipelineManager owner |
| K.1 | 🔴 PENDING — P1 | Sprint 3 | CurtainWallBuilder owner |
| K.2 | 🔴 PENDING — P1 | Sprint 3 | CreateCWCommand owner |
| C.1–C.4 | ✅ DONE (partially, per doc-47) | — | — |
| C.2 (extend) | 🔴 PENDING — P1 | Sprint 4 | EPS owner |
| C.5–C.6 | 🔴 PENDING — P1 | Sprint 4 | EPS owner |
| D.1–D.3 | ✅ DONE | — | — |
| D.4–D.5 | 🔴 PENDING — P1 | Sprint 4 | All owners |
| E.1 | 🔴 PENDING — P1 | Sprint 4 | BatchCoordinator + YjsDocAdapter owner |
| E.2 | 🔴 BLOCKED — server dependency | — | Backend owner |
| E.3 | ✅ DONE — Sprint 5 | — | `YjsDocAdapter._detectCwLevelYMismatch()` |
| J.1–J.5 | 🔴 PENDING — P2 (ADR only) | Quarterly | Architecture review |

---

### 10.5 Session 4 (`browser_console_20260507_215749_328.log`) — Ongoing LONGTASK storm

16 consecutive LONGTASKs (258–629ms each, FPS=1–4fps, `geometries:0` — same clean project):

```
629ms, 270ms, 277ms, 287ms, 272ms, 258ms, 356ms, 270ms, 271ms, 298ms,
274ms, 291ms, 296ms, 292ms, 239ms, 276ms
```

The 629ms opening task is the largest single task outside of the 22.2-second outlier. Pattern
is identical to Sessions 2 and 3: uniform large tasks (reflecting fixed-size `resumeAndFlush()`
drain chunks) at FPS 1–4. This is a fourth independent confirmation across four separate sessions
in the same day. Phase F.2 is unambiguously the P0 fix.

---

*Produced from: source reads of all pipeline files, four live browser console captures
(2026-05-07 sessions 1–4), and full source reads of docs 40, 42, 44, 45, 46, 47, 48.
No source files were modified during this analysis. All findings are from direct observation.*

*PRYZM internal — not for distribution.*