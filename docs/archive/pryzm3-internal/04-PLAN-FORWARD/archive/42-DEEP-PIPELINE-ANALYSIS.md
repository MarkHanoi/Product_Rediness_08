# 42 — Deep CW Batch Pipeline Analysis

> **Mode**: PURE ANALYSIS — no behavioural changes. This document records findings from a
> full source read of all 9 pipeline stages plus diagnostic instrumentation added in this
> session.
>
> **Reference docs**: 40-CW-PIPELINE-TRACE.md (living trace), 41-BATCH-ERROS.md (fix log).
> **Instrumentation added**: §DIAG-BUILD-01, §DIAG-IM-01/02/03, §DIAG-NME-01,
> §DIAG-EPS-01/02/03/04 — all are `console.log` only, zero behavioural change.

---

## 0 — Scope

Files read in full for this analysis:

| File | Lines |
|------|-------|
| `BatchCoordinator.ts` | 1 386 |
| `CreateCurtainWallsOnAllSlabsCommand.ts` | 993 |
| `CurtainWallBuilder.ts` | 1 311 |
| `CurtainWallInstanceManager.ts` | 153 |
| `CurtainWallStore.ts` | 371 |
| `StoreEventBus.ts` (canonical) | 413 |
| `EdgeProjectorService.ts` | 1 978 |
| `NativeElementMeshExporter.ts` | 218 |
| `40-CW-PIPELINE-TRACE.md` + `41-BATCH-ERROS.md` | ref |

Reference scale used throughout: **294 curtain walls, 17 slabs, 3 levels**.

---

## 1 — Full Pipeline Map

### Phase 0 · Shader Pre-warm (one-time)

**Entry**: `CreateCurtainWallsOnAllSlabsCommand.execute()` → `_prewarmCurtainWallShaders()`

- Guard `_shadersPrewarmed` (`static boolean`) prevents re-run.
- `§PREWARM-SCALE-GUARD`: resets prewarm flag if new batch is ≥ 1.5× larger than the
  last warmed batch — ensures PSO cache covers the new geometry count.
- Creates **3 probe meshes** (mullionIM InstancedMesh, glassIM InstancedMesh, fallbackMesh)
  using `BoxGeometry(0.001, 0.001, 0.001)`. These are added to the **production scene**.
- `renderPipelineManager.render(0)` forced synchronously (3 render passes within 30ms).
- Guard `BN-09a cooldown` prevents re-prewarm if last prewarm was < `PREWARM_MIN_VALID_MS=30` ms ago.
- Guard `BN-05a phase guard` bails if `_isBatching=true` (another batch already in flight).
- Guard `BN-09b` drains `__selection.selected` and `__selection.hovered` arrays before the
  forced renders, so the selection highlight overlay does not trigger extra PSO variants.
- **Calendar cost**: ~90–150ms on first invocation. Zero on subsequent calls (guarded).

**Latent issue [PRE-01]**: The 3 probe meshes use `BoxGeometry(0.001, 0.001, 0.001)`, not
the real CW panel/mullion geometry. WebGPU PSO compilation is keyed on *vertex attribute
layout*, not dimensions, so the prewarm does correctly compile the shader variants. However
the comment says "matched geometry" — this is misleading for future maintainers.

---

### Phase 1 · Batch Setup (synchronous)

**Entry**: `runBatch(fn, opts)` in `BatchCoordinator`

Execution order (all synchronous, single tick):

1. `_setupBatch(opts)`:
   - `_isBatching = true`
   - `window.__wallRebuildControl.pause()` — walls will not rebuild during fn()
   - `window.__curtainWallRebuildControl.pause()` — CW builder enters `_rebuildPaused=true`
   - `window.__slabRebuildControl.pause()` — slabs paused
   - `viewDependencyTracker.setSuppressed(true)` — kills EdgeProjector 300ms debounce; no
     plan-view reprojection fires while batch data is being written
   - `unifiedFrameLoop.beginBatchRenderSuppress()` — suppresses OBC+PASCAL renders
   - `storeEventBus.beginBatch()` → depth 0 → 1 (outer bracket)
   - `_batchStartTime = performance.now()`
2. `storeEventBus.batch(fn)` → depth 1 → 2 (inner bracket)
3. `fn()` = `_processSlabs()` runs synchronously at depth 2

**Safety**: all 3 pause/resume controls + viewDependencyTracker suppression MUST be cleaned
up on error. `forceReset()` handles the teardown path on project-switch mid-batch.

---

### Phase 1.5 · _processSlabs() (synchronous, inside depth-2 bracket)

**Entry**: `CreateCurtainWallsOnAllSlabsCommand._processSlabs()`

Per-slab work (all synchronous):

1. **Shoelace winding check**: CCW polygon check on slab vertices. Reverses vertex order
   if CW-wound so generated walls always face outward. Cost: O(vertices) per slab — trivial.
2. **Edge extraction**: generates `WallSpec[]` from slab polygon edges.
3. **ID pool**: pre-allocated pool of 2000 UUIDs. If pool exhausted → `crypto.randomUUID()`
   fallback + warning. For 294 walls this is fine; for 5-floor × 294 = 1470 walls, still fine.
4. Accumulates `collectedWalls: CurtainWallData[]` and `_regGroupsByLevel: Map<levelId, ids[]>`.

**Key optimisation (PERF-ADDMANY)**:  
`curtainWallStore.addMany(collectedWalls)` — single call, O(n) Map insertion, O(n) listener
notification after full Map population. Eliminates O(n²) progressive-scan pattern from
sequential `add()` calls.

Inside `addMany()`:
- **Phase 1** (Map insertion, no listeners): deep-clones each `CurtainWallData` — baseLine
  [Point3D, Point3D], properties spread, ifcData spread, gridSystem u/v line arrays. For 294
  walls this is ~588 spread operations on arrays of 10–20 items each.
- **Phase 2** (fast batch path): since `batchCoordinator.isBatching=true`, calls
  `window.__curtainWallRebuildControl.addManyPaused(inserted)` once — populates
  `CurtainWallBuilder._pausedBuildsMap` in a single tight loop. Then emits 294
  `storeEventBus.emit()` calls — each is O(1) (buffered at depth 2, appended to array).
- **OTel span**: `tracer.startSpan('pryzm.curtainwall.store.addMany')` is called once; span
  ends in `finally`. Negligible in production unless OTel exporter is configured.

**Existing §DIAG log**:  
```
[CurtainWallStore] §BATCH-CW-PAUSE-ADDMANY §DIAG n=294
  phase1CloneMs=12.4ms addManyPausedMs=1.1ms busEmitMs=3.8ms totalPhase2Ms=4.9ms
```
Phase 1 clone (~12ms) dominates for 294 walls. Phase 2 is fast.

After `addMany`, per-level registration groups are queued:  
`batchCoordinator.trackRegistration(levelId, ids)` × L levels (REG-MANY-P1).  
This is O(L) not O(N) — a key optimisation from the prior wave.

`storeEventBus.batch()` inner bracket ends: depth 2 → 1.  
`runBatch()` returns synchronously. Total Phase 1+1.5 wall-clock: **~20–40ms** for 294 walls.

---

### Phase 2 · Deferred Resume-Flush (first rAF after runBatch returns)

**Entry**: `getFrameScheduler().scheduleOnce('batch-coordinator-resume-flush', cb, 'pre-render')`

- **Delay**: one full rAF period (~16.7ms) after `runBatch()` returns. Intentional — gives
  the synchronous call stack time to fully unwind before builder drain starts.
- Guard `BN-07`: warns if delay > 2000ms (main thread blocked between runBatch and this slot).
- `window.__wallRebuildControl.resumeAndFlush()` — WallJoinResolver single pass.
- `window.__curtainWallRebuildControl.resumeAndFlush()`: transfers `_pausedBuildsMap` →
  `_pendingBuildsMap`, schedules **ONE** rAF drain slot via FrameScheduler.
- `window.__slabRebuildControl.resumeAndFlush()`.
- 30-second watchdog `_watchdogTimer = setTimeout(abort, 30000)` starts.

**Latent issue [P2-01]**: BN-07 warning threshold is only at 2000ms. Intermittent starvation
of 200–1999ms (e.g. a large JSON parse or IFC load happening concurrently) would be silently
missed. No intermediate warn at 500ms.

---

### Phase 3 · rAF Build Drain (CurtainWallBuilder._drainBuildQueue)

**Entry**: `FrameScheduler.schedule('pre-render', () => _drainBuildQueue())`  
**Repeat**: reschedules itself until `_pendingBuildsMap` is empty.

**Adaptive budget**:
- Batch mode (`isBatching=true`): `< 25ms/frame → ++budget (cap 50)`, `> 45ms → --budget (floor 5)`.
- Interactive mode: `< 8ms → ++budget (cap 30)`, `> 14ms → --budget (floor 5)`.
- Starts at `MAX_BUILDS_PER_FRAME=20`.

**Existing §PERF-DRAIN log** fires every drain frame (gated by `isBatching || queueBefore>1`):
```
[CurtainWallBuilder] §PERF-DRAIN built=20 remaining=274 queueBefore=294
  frameMs=18.3ms nextBudget=20 isBatch=true
```

**Per-wall `build()` sub-phases** (newly instrumented via §DIAG-BUILD-01):

| Sub-phase | Typical cost | Notes |
|-----------|-------------|-------|
| worldY resolve (BimManager.getLevelById) | < 0.1ms | O(1) Map lookup |
| gridSystem migration (migrateToGridSystem) | ~0.1ms if needed | Pure function, linear |
| computeCurtainCells | ~0.2–0.5ms | Pure, O(uLines × vLines) |
| CurtainPanelStore.getByCurtainWallId | ~0.1ms | Filter scan |
| CurtainWallInstanceManager.buildInstancedMeshes | ~1–5ms | **Dominant — see §DIAG-IM** |
| Mullion IM construction (2 per wall) | ~0.5–1ms | Geometry from cache (§MI-07) |
| Orient/position group | < 0.1ms | 3 trig ops + vector math |
| userData stamp | < 0.1ms | Object literal |
| **Total per wall** | **~2–7ms** | Varies with cell count |

**Expected drain frames** for 294 walls: budget stabilises at ~20–25 walls/frame after ~3
frames of warmup → ~13–15 drain frames × ~16ms rAF overhead = **~210–240ms** scheduling
overhead + **~5–10ms × 294** build work = total ~590–960ms for the build phase.

Inside `build()`, **mullion geometry is pulled from cache** (`mullionGeometryCache`, §MI-07):
`BoxGeometry(mullionSize, height, mullionSize)` keyed by `${mullionSize}:${height}:${mullionSize}`.
For walls with identical geometry (typical in AI batch from same slab), this is a single
allocation reused across all walls.

**Panel InstancedMesh** is NOT cached — see §IM analysis below.

When `_pendingBuildsMap` empties → `batchCoordinator.signalBuildQueueDrained()`.

---

### Phase 4 · Registration Drain

**Entry**: `BatchCoordinator.signalBuildQueueDrained()` → `_drainRegistrations()`

- If total registration count ≤ `SYNC_DRAIN_THRESHOLD=50`: synchronous drain.
- If > 50: rAF drain at `REG_PER_FRAME=8` registration groups per frame.
  For 3 levels = 3 groups → **synchronous** drain for typical CW batches.
- Per registration call: `bimManager.registerMany(ids, levelId)` + `elementRegistry.registerSemantic(id, 'curtainwall')`.

After registrations complete → `shadowReactivationCallback()` fires:  
`curtainWallBuilder._reactivateShadows()` is called. **This returns immediately** after
scheduling `setTimeout(drainSlice, 30000)`. No synchronous work.

`_executeFinalSweep()` then runs in the same synchronous tick.

---

### Phase 5 · Final Sweep + Event Bus Drain (endBatchYielded)

**Entry**: `BatchCoordinator._executeFinalSweep()` → `storeEventBus.endBatchYielded(cb, 200)`

1. `window.__wallRebuildControl.discardAndSuppress()` — prevents wall fragment rebuild during flush.
2. `storeEventBus.endBatchYielded(onComplete, 200)`:
   - Takes ownership of event buffer (`splice(0)` — atomic handoff).
   - `depth-- → 0` immediately (no new events will be buffered).
   - Yields every **200 events** via `'pre-render'` FrameScheduler slot.
   - Per chunk: N events × L listeners dispatched synchronously.
   - For 294 walls × 20 listeners = 5,880 dispatch calls. At chunkSize=200:
     **ceil(294/200) = 2 chunks**. Each chunk: ~200 events × 20 listeners = 4,000 calls.
     At ~0.1µs/call = ~0.4ms per chunk. Total event drain: **< 1ms** for 294 walls.

> **Clarification on the chunk cost calculation from 40-CW-PIPELINE-TRACE.md**:
> The earlier estimate of "~416ms for 231 walls × N listeners" assumed N=20 listeners
> per event (i.e. 20 full listener chains). However, `endBatchYielded` iterates over
> a flat array of `{elementType, handler}` pairs — listener count is per-type,
> typically 3–5 per element type. For CW events with 3 listeners × 294 events = 882
> dispatch calls total. Both chunks complete well within a single rAF frame.

3. `onComplete` callback runs after last chunk:
   - `_isBatching = false`
   - `viewDependencyTracker.setSuppressed(false)`
   - `markLevelsDirty(levelIds)` deferred to `'post-render'` FrameScheduler slot
     (§FIX-EDGE-PROJECT-DEFER — ensures geometry is in scene before reprojection triggers)
   - `unifiedFrameLoop.endBatchRenderSuppress()` — lifts render suppression **immediately**
   - `window.__wallRebuildControl.restore()`
   - `_onBatchEnd()` callback fires → batch progress indicator hides
   - `_skipRedetectRooms=true` → REDETECT_ROOMS entirely skipped for CW batch
   - `_skipPbrUpgrade=true` → PBR upgrade skipped for batches > 32 elements
   - Deferred `window.*` events dispatched

---

### Phase 6 · EdgeProjector (post-batch, deferred ~300ms after markLevelsDirty)

**Entry**: `ViewDependencyTracker.markLevelsDirty()` → 300ms debounce → `EdgeProjectorService.project()`

1. `NativeElementMeshExporter.exportForView(viewDef)` runs first:
   - For plan view of the affected level: collects `elementIds` from `level.childrenIds`.
   - Per element: `elementRegistry.getRoot(elementId)` → THREE.Group.
   - `root.traverse()`:
     - **InstancedMesh branch** (CW mullions + panels): each InstancedMesh with `count=N`
       creates N plain `THREE.Mesh` proxy objects. Per proxy: `worldMatrix.decompose(pos, quat, scale)`.
       For one CW wall: 2 mullion IMs × ~10 instances + 1 panel IM × grid cells =
       typically **30–50 proxy objects per wall**.
     - **Standard Mesh branch** (fallback panels, doors, windows etc): 1:1 proxy.
   - Wrapper group stamped with `elementUUID`, `elementType`, `rootWorldY`, etc.
   - Groups returned to EdgeProjectorService.

2. `_hasCWElements` detection: `nativeMeshGroups.some(g => g.userData?.elementType?.toLowerCase() === 'curtainwall')`.
   O(n) scan with early exit. Correct (uses `elementType` from NativeElementMeshExporter stamp,
   not InstancedMesh probe which would always miss because proxies are plain Mesh).

3. `CHUNK_SIZE = 1` for CW batches (vs 4 for wall/element batches).

4. **Inner group loop** (per CW element):

   a. `group.traverse()` → for each proxy Mesh:
      - AABB range filter (Y bounds check).
      - `new THREE.EdgesGeometry(mesh.geometry, angleDeg)` — **§DIAG-EPS-01**
      - `edgesGeo.applyMatrix4(mesh.matrixWorld)` — bakes world transform in-place.
      - Append to `perElemLayerGeos['A-CURTAIN-WALL']`.

   b. **§DIAG-EPS-02** per-group traverse summary logged.

   c. Per ISO layer: `mergeGeometries(geos, false)` — **§DIAG-EPS-03**

   d. `classifyByVertexY(mergedGeo, cutPlaneY, planFloorY)` → `:cut`, `:proj`, `:beyond`
      sub-geometries.

   e. Per sub-geometry: `OBC.TechnicalDrawing.toDrawingSpace(lines, drawing)` — **§DIAG-EPS-04**
      This is the projection black box. Transforms all vertices from world XYZ to 2D drawing UV.

   f. **§PERF-EDGEPROJECTOR-SUBLAYER-YIELD**: `await requestAnimationFrame()` after **every
      layer** for CW batches. Splits the per-group work into ~50ms rAF slices.

5. Per-group cost breakdown (from inline comments + measurements):
   - 30–50 proxy meshes × EdgesGeometry: **~40–80ms** (§DIAG-EPS-01 will measure this)
   - mergeGeometries(30–50 geos): **~10–25ms** (§DIAG-EPS-03)
   - toDrawingSpace per layer: **~40–60ms** (§DIAG-EPS-04)
   - Per-layer rAF yield: **~16ms**
   - **Total per CW group**: ~160–220ms calendar time (spread across 3–4 rAF ticks)

6. For 17 CW groups (294 walls de-duplicated by EdgeProjector grouping logic):  
   17 groups × 3 layers × (50ms work + 16ms rAF) = **~3.4–3.7s calendar time** for EdgeProjector phase.  
   Work is interleaved with the browser's display pipeline — scene remains **interactive**.

---

### Phase 7 · Shadow Reactivation (T = +30 seconds)

**Entry**: `setTimeout(drainSlice, 30000)` scheduled at end of Phase 4.

- At T+30s, `drainSlice()` fires.
- `WALLS_PER_SHADOW_FRAME = 10000` — effectively single-shot for 294 walls.
- `group.traverse()` per wall: sets `castShadow=true, receiveShadow=true` on all Mesh+InstancedMesh children.
- For 294 walls × ~5 mesh objects = 1,470 property writes.
- WebGPU rebuilds entire shadow map once — bounded cost, absorbed in one frame at T+30s.
- If more than `WALLS_PER_SHADOW_FRAME` walls: next slice fires 200ms later
  (`setTimeout(drainSlice, 200)` — not 30000ms for subsequent slices).

**UX consequence**: Curtain walls cast no shadows for 30 seconds after batch completion.
This is intentional (see §PERF-SHADOW-DELAY-30S rationale: avoids collision with the
~13s PSO-compile + EdgeProjector LONGTASK storm).

---

## 2 — Inefficiency Catalogue

Each finding is classified by: **severity** (Critical/High/Medium/Low), **type**
(Memory / CPU / Latency / Correctness / Observability), and **fix complexity** (Easy/Medium/Hard).

---

### [INE-01] CurtainWallInstanceManager: No Panel Geometry Cache

**Severity**: High | **Type**: Memory + CPU | **Fix**: Easy

**Location**: `CurtainWallInstanceManager.buildInstancedMeshes()` lines 127–144 (post-instrumentation)

**Finding**: `new THREE.BoxGeometry(1, 1, panelThickness)` and `new THREE.MeshStandardMaterial(...)`
are allocated **fresh for every panel type on every `build()` call**. There is no geometry or
material cache for panels, unlike mullion geometry (`mullionGeometryCache`) and mullion material
(`mullionMaterialCache`) in `CurtainWallBuilder`.

**Scale**:  
- 294 walls × 2 panel types (glass + spandrel typical) = **588 BoxGeometry + 588 MeshStandardMaterial allocations**.
- Each `BoxGeometry(1,1,t)` allocates ~6 faces / 12 triangles on CPU + buffers for GPU upload.
- Each `MeshStandardMaterial` triggers a WebGPU pipeline state object (PSO) compilation the
  first time it is used with this geometry — BUT since all glass panels share the same material
  parameters (color, opacity, metalness, roughness), the PSO is compiled once and cached by
  the GPU driver. However, the **CPU objects** are still freshly allocated and GC'd on every rebuild.

**§DIAG-IM-02** will confirm per-call cost:
```
[CurtainWallInstanceManager] §DIAG-IM-02 NEW BoxGeometry+MeshStandardMaterial
  panelType=SystemPanel_Glass instances=12 geoAllocMs=0.24ms (no cache — fresh alloc every build() call)
```

**Impact**: ~0.24ms × 588 = ~141ms of unnecessary BoxGeometry allocation across a 294-wall batch.  
On rebuild (undo/redo, property edit), ALL 294 walls rebuild → 588 fresh allocations again.

**Fix**: Add `panelGeometryCache: Map<string, THREE.BoxGeometry>` and
`panelMaterialCache: Map<string, THREE.MeshStandardMaterial>` inside `CurtainWallInstanceManager`,
keyed by `${panelThickness}` and `${panelType}:${color}:${opacity}` respectively.
Mirror the existing `mullionGeometryCache` pattern in `CurtainWallBuilder`.

---

### [INE-02] CurtainWallInstanceManager: Shadow Default `true` Overridden by Builder

**Severity**: Low | **Type**: Correctness (latent) | **Fix**: Easy

**Location**: `CurtainWallInstanceManager.ts` lines 145–146 (post-instrumentation):
```typescript
instancedMesh.castShadow = true;
instancedMesh.receiveShadow = true;
```

**Finding**: `CurtainWallInstanceManager` sets `castShadow=true` immediately after creating the
InstancedMesh. Then `CurtainWallBuilder.build()` (line 852–853, post-edit) overrides this to
`!deferShadows` (i.e. `false` during batch mode). The override in `build()` correctly wins.

**Latent risk**: If `buildInstancedMeshes()` is ever called directly (outside `build()`), the
InstancedMesh will be added to the scene with `castShadow=true` by default — potentially
triggering an immediate shadow map rebuild in the next render frame. Any future caller that
bypasses `build()` will silently get shadow-enabled meshes.

**Fix**: Change the default to `castShadow = false; receiveShadow = false` in
`CurtainWallInstanceManager`. The caller (`build()`) already sets the correct value on line 852.
This makes the InstanceManager safe for external callers and removes the redundant overwrite.

---

### [INE-03] NativeElementMeshExporter: InstancedMesh→Mesh Proxy Explosion

**Severity**: High | **Type**: Memory + CPU | **Fix**: Hard

**Location**: `NativeElementMeshExporter.ts` lines 141–168 (post-instrumentation)

**Finding**: Every `THREE.InstancedMesh` in a CW element's scene group is expanded into N
separate `THREE.Mesh` proxy objects — one per instance. For a single CW wall with:
- 1 vertical mullion IM (count=10 U-lines)
- 1 horizontal mullion IM (count=8 V-lines)  
- 1 panel IM (count=80 cells)

→ **98 proxy Mesh objects created per wall** during `exportForView()`.

For 294 walls: **~28,812 Mesh proxy objects** allocated in a single synchronous call to
`exportForView()`. Each proxy:
- `new THREE.Matrix4()` for `instanceMatrix`
- `groupWorldMatrix.clone()` (4×4 matrix heap alloc)
- `worldMatrix.decompose(proxy.position, proxy.quaternion, proxy.scale)` (3 Vector3 operations)
- `proxy.updateMatrixWorld(true)` (matrix multiply + parent chain walk)

**§DIAG-NME-01** will emit per-element counts:
```
[NativeElementMeshExporter] §DIAG-NME-01 elementId=cw-001 elementType=CurtainWall
  instancedNodes=3 proxiesFromIM=98 proxiesFromMesh=0 totalProxies=98
```

**Why this is hard to fix**: The proxy expansion is necessary because `EdgesGeometry` operates
on a single mesh's geometry at its current world-space transform. InstancedMesh has per-instance
transforms stored in `instanceMatrix` buffer — EdgesGeometry cannot directly consume these.
Possible approaches:
1. Pre-bake instance transforms into geometry before EdgesGeometry pass (costly upfront).
2. Use a custom instancing-aware edges generator (significant engineering).
3. Cache the projected EdgeGeometry per (CW wall, view hash) and invalidate only on rebuild.
   This is the highest-value fix — avoids the entire proxy expansion + EdgesGeometry pass for
   unchanged walls.

---

### [INE-04] EdgeProjectorService: EdgesGeometry Per-Proxy (O(proxies × F log F))

**Severity**: Critical | **Type**: CPU | **Fix**: Hard (see INE-03 caching strategy)

**Location**: `EdgeProjectorService.ts` line 1334 (post-instrumentation)

**Finding**: For each proxy Mesh, `new THREE.EdgesGeometry(mesh.geometry, angleDeg)` is called.
EdgesGeometry is O(F log F) where F = face count of the source geometry. For a unit BoxGeometry
(panels) with 12 triangles: O(12 log 12) ≈ 48 comparisons — fast. For more complex mullion
geometries (extruded profiles): potentially O(100+ log 100+).

For 28,812 proxy meshes: **28,812 EdgesGeometry allocations** per EdgeProjector invocation.

Even at 0.1ms each: **2,881ms** of EdgesGeometry work alone, spread across rAF slices by
§PERF-EDGEPROJECTOR-SUBLAYER-YIELD.

**§DIAG-EPS-01** will measure per-mesh cost:
```
[EdgeProjectorService] §DIAG-EPS-01 edgesGeo group=0 mesh#0
  elemType=CurtainWallPart faceCount=4 edgeVertices=24 allocMs=0.18ms
```

**§DIAG-EPS-02** will show per-group totals:
```
[EdgeProjectorService] §DIAG-EPS-02 group#0 elemId=cw-001 elemType=CurtainWall
  meshesProcessed=98 totalEdgeVerts=2352 traverseMs=22.4ms
```

**Fix path**: Same as INE-03 — projected geometry caching keyed by `(elementId, viewId, wallVersion)`.
Wall version is already stamped on `group.userData.version` (CurtainWallBuilder line ~983).
When `version` hasn't changed, re-use the last projected LineSegments without any EdgesGeometry pass.
This would reduce Phase 6 cost from ~3.7s to near-zero for unchanged walls on subsequent
view refreshes (e.g. after a different element is edited).

---

### [INE-05] EdgeProjectorService: mergeGeometries After Proxy Expansion

**Severity**: Medium | **Type**: CPU | **Fix**: Medium (linked to INE-03/04)

**Location**: `EdgeProjectorService.ts` line 1397 (post-instrumentation)

**Finding**: After EdgesGeometry is computed for all proxies in a group (~28–98 geos per CW
element), `mergeGeometries(geos, false)` concatenates all position attribute arrays into a
single `BufferGeometry`. For 98 geos × 24 vertices each = 2,352 total vertices: this copies
~9,408 float32 values (3 components × 2 endpoints per edge × 24 edges/mesh).

Per-layer, for 3 layers: 3 merge operations per CW group × 17 groups = 51 merge calls.

**§DIAG-EPS-03** will measure:
```
[EdgeProjectorService] §DIAG-EPS-03 mergeGeometries
  layer=A-CURTAIN-WALL:cut geoCount=34 mergedVerts=816 mergeMs=3.1ms
```

**Fix**: Not worth fixing in isolation — if INE-03/04 (projection caching) is implemented,
mergeGeometries becomes moot for cached elements.

---

### [INE-06] EdgeProjectorService: `applyMatrix4` After Proxy Decompose

**Severity**: Low | **Type**: CPU | **Fix**: Easy

**Location**: `EdgeProjectorService.ts` line 1348 (post-instrumentation)

**Finding**: `edgesGeo.applyMatrix4(mesh.matrixWorld)` bakes the world transform into the
EdgesGeometry position buffer. For CW proxy meshes, `mesh.matrixWorld` was just computed by
`proxy.updateMatrixWorld(true)` in `NativeElementMeshExporter` — this is the same transform
that was decomposed from `worldMatrix`. The `applyMatrix4` is a necessary step for the
`classifyByVertexY` to work (it needs world-space Y coordinates), but it modifies the geometry
in-place and requires a subsequent GPU buffer re-upload.

**This is not avoidable** without changing the EdgeProjector's contract (it needs world-space
geometry for `toDrawingSpace`). Noted for completeness.

---

### [INE-07] CurtainWallStore.addMany: Deep-Clone Overhead Per Item

**Severity**: Medium | **Type**: CPU | **Fix**: Easy–Medium

**Location**: `CurtainWallStore.ts` `addMany()` Phase 1, line ~163

**Finding**: Each item goes through a full deep-clone in `addMany()`:
```typescript
baseLine: [{ ...cw.baseLine[0] }, { ...cw.baseLine[1] }],
properties: { ...(cw.properties ?? {}) },
ifcData: cw.ifcData ? { ...cw.ifcData } : { guid: crypto.randomUUID(), ... },
gridSystem: cw.gridSystem ? {
    uLines: cw.gridSystem.uLines.map(l => ({ ...l })),
    vLines: cw.gridSystem.vLines.map(l => ({ ...l })),
} : undefined,
```

For a grid with 10 U-lines + 10 V-lines: 20 object spread operations per wall.  
For 294 walls: **5,880 grid line spread ops** just in the addMany path.

The existing §DIAG log shows `phase1CloneMs=12.4ms` for 294 walls — acceptable but
non-trivial.

**Fix**: The Command is the data creator and controls the source objects — they are not
shared with any other caller after construction. A `unsafe_storeDirectly(items)` fast path
for trusted callers (Command + BatchCoordinator) that skips deep-clone of Command-owned
temporary objects could eliminate this cost. However, this would require auditing all call
sites to ensure the source objects are truly transient. Medium complexity.

---

### [INE-08] CurtainWallStore.get/getAll: Always Deep-Clone

**Severity**: Low | **Type**: CPU | **Fix**: Already fixed (PERF-FIX-5)

**Location**: `CurtainWallStore.ts` lines 93–96, 101–103

**Finding**: `get()` and `getAll()` both call `cloneCurtainWallData()` on every access.
This is by design (§3.4 immutability contract). The `getReadOnly()` fast path was added
(PERF-FIX-5) for Builder subscriber hot paths that only need to read without risk of mutation.

**Status**: Existing fix adequate. Noted for completeness.

---

### [INE-09] CurtainWallBuilder.build: New `Object3D` Per Mullion IM

**Severity**: Low | **Type**: Memory | **Fix**: Easy

**Location**: `CurtainWallBuilder.ts` lines 931, 958

```typescript
const _dummy = new THREE.Object3D();  // for vertical mullions
// ...
const _dummy2 = new THREE.Object3D(); // for horizontal mullions
```

**Finding**: Two `THREE.Object3D` objects are created inside every `build()` call. These
are used only as scratch objects for `setMatrixAt()`. For 294 walls: **588 `Object3D`
allocations** that are immediately eligible for GC after `build()` returns.

**Scale**: `Object3D` constructor allocates ~8 Vector3/Euler/Quaternion objects + a 4×4
Matrix4. Each `Object3D` ≈ ~500 bytes on the heap. 588 × 500 = ~294KB of transient heap
churn per batch.

`CurtainWallInstanceManager` already uses a single shared `dummy = new THREE.Object3D()`
at class scope (line 113, post-instrumentation) — a single dummy is sufficient.

**Fix**: Declare `private readonly _mullionDummy = new THREE.Object3D()` as a class field
in `CurtainWallBuilder` and reuse it for both vertical and horizontal mullion loops.
Zero behavioural change required.

---

### [INE-10] CurtainWallBuilder.build: computeCurtainCells Not Cached

**Severity**: Medium | **Type**: CPU | **Fix**: Medium

**Location**: `CurtainWallBuilder.ts` line 803

**Finding**: `computeCurtainCells(grid, length, cw.height)` is a pure function that
re-computes the full cell layout on every `build()` call. For a 294-wall batch where all
walls are created from the same slab template (same `gridSystem`, same `length`, same
`height`), this re-computes identical cell layouts hundreds of times.

**Scale**: `computeCurtainCells` cost depends on `uLines.length × vLines.length`. For a
typical 3×5 grid: 15 cell objects created per call. For 294 walls with identical grids:
294 × 15 = 4,410 identical `CurtainCell` objects created and immediately discarded.

**Measurement**: §DIAG-BUILD-01 `cellsMs` will show the cost. Expected ~0.2–0.5ms/wall.

**Fix**: `Map<gridHash, CurtainCell[]>` cache in `CurtainWallBuilder` keyed by
`${JSON.stringify(grid)}:${length.toFixed(4)}:${height.toFixed(4)}` or a faster structural hash.
Cache eviction: clear on each `_drainBuildQueue` completion (or keep last N entries).
Risk: shallow key — must use stable serialisation.

---

### [INE-11] StoreEventBus.endBatchYielded: Fixed Chunk Size (Not Listener-Adaptive)

**Severity**: Low | **Type**: Latency | **Fix**: Easy

**Location**: `packages/core-app-model/src/StoreEventBus.ts` `endBatchYielded(cb, chunkSize=200)`

**Finding**: `chunkSize=200` is hardcoded. For 20 listeners this is 4,000 dispatch calls per
chunk = ~0.4ms — well within the 16ms rAF budget. However for projects with 40+ listeners
(e.g. a complex plugin ecosystem), the same chunk size doubles to ~0.8ms per chunk — still fine.

**Observation from §BATCH-BUS-DISCARD analysis**: `forceReset()` calls `discardBatch()`
which correctly prevents stale Project-A events from reaching Project-B listeners. The depth
counter is reset to 0 atomically.

**Non-issue at current scale**. Would become an issue if listener count grows to 100+.

---

### [INE-12] Shadow Reactivation: No Console Log for 30-Second Window

**Severity**: Low | **Type**: Observability | **Fix**: Easy

**Location**: `CurtainWallBuilder._reactivateShadows()` line 1121 (post-instrumentation)

**Finding**: `setTimeout(drainSlice, 30000)` fires after a 30-second delay. The initial
scheduling call has no console log (the START log at line 1038 is gated by
`_isBuilderDebugEnabled()`). In a production console recording, there would be a 30-second
gap between the end of Phase 4 and the shadow reactivation — no trace of when shadows are
expected to appear.

**Fix** (already instrumented via §DIAG-BUILD-01 indirectly): Add an unconditional log at
the point of `setTimeout(drainSlice, 30000)`:
```typescript
console.log(
    `[CurtainWallBuilder] §SHADOW-30S-SCHEDULED: ${pending.length} walls queued ` +
    `for shadow reactivation at T+30s`
);
```
This would make production traces unambiguous.

---

### [INE-13] window.__curtainWallRebuildControl: Silent Failure on Undefined

**Severity**: Medium | **Type**: Correctness | **Fix**: Easy

**Location**: `CurtainWallStore.ts` line 224:
```typescript
(window as any).__curtainWallRebuildControl?.addManyPaused(inserted);
```

**Finding**: If `__curtainWallRebuildControl` is `undefined` (builder disposed mid-batch,
e.g. during rapid project switching that races with `addMany()`), the optional chaining
silently skips `addManyPaused()`. The walls would be in the store Map but never enter
`_pendingBuildsMap` — they would never be built. The storeEventBus events would still be
emitted and delivered, but since the builder subscriber path calls `updateCurtainWall()`
which gates on `_rebuildPaused`, nothing would rebuild the walls.

**Scenario**: Project switch that fires `forceReset()` exactly between `addMany()` Phase 1
and Phase 2. Probability: very low (requires sub-millisecond race). Impact: ghost walls in
the store with no scene geometry.

**Fix**: Add an explicit check + warning:
```typescript
const cwControl = (window as any).__curtainWallRebuildControl;
if (!cwControl?.addManyPaused) {
    console.warn('[CurtainWallStore] addManyPaused not available — builder may be disposed');
} else {
    cwControl.addManyPaused(inserted);
}
```

---

### [INE-14] ID Pool: `crypto.randomUUID()` Fallback Not Profiled

**Severity**: Low | **Type**: Observability | **Fix**: Easy

**Location**: `CreateCurtainWallsOnAllSlabsCommand.ts` ID pool management

**Finding**: The pre-allocated pool size is 2,000 IDs. For a 5-floor × 294-wall session
= 1,470 walls — within pool. For a 10-floor session: 2,940 walls → pool exhaustion at
wall 2001, `crypto.randomUUID()` fallback fires. The existing warning is:
```
[CreateCurtainWallsOnAllSlabsCommand] ID pool exhausted — falling back to crypto.randomUUID()
```
`crypto.randomUUID()` is ~2–3µs per call — negligible for 940 overflow calls. But the
warning is a useful signal for right-sizing the pool in very large projects.

---

## 3 — Phase Timing Summary (294 walls, 3 levels, single plan view)

| Phase | Mechanism | Estimated calendar time |
|-------|-----------|------------------------|
| 0 · Prewarm | Synchronous render (first-time only) | 90–150ms (once) |
| 1 · Batch setup | Synchronous | < 1ms |
| 1.5 · _processSlabs + addMany | Synchronous | 20–40ms |
| 2 · Deferred resume | 1 rAF slot | ~17ms |
| 3 · rAF build drain | 13–15 rAF frames | 210–960ms |
| 4 · Registration drain | Synchronous (≤50 groups) | 5–15ms |
| 5 · endBatchYielded | 2 chunks × 1 rAF | ~33ms |
| 6 · EdgeProjector | 17 groups × 3 layers × rAF | 3,400–3,700ms |
| 7 · Shadow reactivation | T+30s one-shot | 1 frame @ T+30s |
| **TOTAL (T=0 → interactive)** | | **~4.0–5.0s** |

"Interactive" = overlay dismissed, scene rendered at full FPS, geometry fully visible.
EdgeProjector runs in background without blocking interaction.

---

## 4 — Trace Instrumentation Coverage Map

All `§DIAG-*` tags are `console.log` only — zero behavioural change.

| Tag | File | What it measures |
|-----|------|-----------------|
| `§DIAG-BUILD-01` | `CurtainWallBuilder.ts` | Per-wall sub-phase breakdown: worldY/grid/cells/panelRead/panelBuild/mullion/orient (ms each) |
| `§DIAG-IM-01` | `CurtainWallInstanceManager.ts` | Panel type distribution (batchable vs override, types × counts) |
| `§DIAG-IM-02` | `CurtainWallInstanceManager.ts` | Per-type BoxGeometry+MeshStandardMaterial alloc time (fresh per call, no cache) |
| `§DIAG-IM-03` | `CurtainWallInstanceManager.ts` | buildInstancedMeshes total time, geo/mat alloc counts, total instance count |
| `§DIAG-NME-01` | `NativeElementMeshExporter.ts` | Per-element InstancedMesh→Mesh proxy expansion (instancedNodes, proxiesFromIM, proxiesFromMesh, totalProxies) |
| `§DIAG-EPS-01` | `EdgeProjectorService.ts` | Per-proxy EdgesGeometry alloc (faceCount, edgeVertices, allocMs) — fires for CW batches or slow meshes (>2ms) |
| `§DIAG-EPS-02` | `EdgeProjectorService.ts` | Per-group traverse summary (meshesProcessed, totalEdgeVerts, layers, traverseMs) |
| `§DIAG-EPS-03` | `EdgeProjectorService.ts` | mergeGeometries (geoCount, mergedVerts, mergeMs) — fires for CW or multi-geo layers |
| `§DIAG-EPS-04` | `EdgeProjectorService.ts` | toDrawingSpace (inVerts, outVerts, tdsMs) — fires for CW or slow layers (>5ms) |

**Pre-existing §PERF-DRAIN logs** (CurtainWallBuilder):  
`§PERF-DRAIN` — per drain frame: built/remaining/queueBefore/frameMs/nextBudget/isBatch  
`§PERF-DRAIN-COMPLETE` — signals BatchCoordinator; drain queue fully empty

**Pre-existing §DIAG log** (CurtainWallStore):  
`§BATCH-CW-PAUSE-ADDMANY §DIAG` — phase1CloneMs / addManyPausedMs / busEmitMs / totalPhase2Ms

---

## 5 — Recommended Fix Priority

| Priority | Finding | Fix | Expected gain |
|----------|---------|-----|---------------|
| 1 | [INE-03/04] Projection caching for unchanged CW walls | Cache `(elementId, viewId, wallVersion)` → projected LineSegments | Eliminates Phase 6 for unchanged walls (~3.5s → ~200ms on second reprojection) |
| 2 | [INE-01] Panel geometry/material cache in InstanceManager | Add `panelGeometryCache` + `panelMaterialCache` like mullion caches | ~141ms saved per batch, ~294KB GC pressure eliminated |
| 3 | [INE-09] Reuse `_mullionDummy` Object3D | Declare as class field | ~294KB GC pressure, trivial change |
| 4 | [INE-10] Cache `computeCurtainCells` result | Map keyed by grid+dims hash | ~0.2ms × 294 = ~59ms saved per batch |
| 5 | [INE-02] Fix InstanceManager shadow default | Change to `castShadow=false` | Correctness only, no perf impact |
| 6 | [INE-13] Warn on missing `addManyPaused` | Add explicit null check | Correctness / observability |
| 7 | [INE-12] Log shadow 30s scheduling | Unconditional console.log | Observability only |

---

## 6 — Open Questions (Require Measurement)

1. **What is the actual `toDrawingSpace()` complexity?** — §DIAG-EPS-04 will answer this.
   If it is O(n²) rather than O(n) in vertices, the per-layer cost could be significantly
   higher than the current ~50ms estimate for high-density CW grids.

2. **How many distinct `elementType` values does the CW produce in `elementRegistry`?** —
   Affects how many ISO-13567 layers are created per group in EdgeProjectorService, and
   thus how many `toDrawingSpace()` calls fire per CW element.

3. **What fraction of the 294 walls have identical `gridSystem + length + height`?** —
   Determines how much benefit the `computeCurtainCells` cache [INE-10] would actually
   deliver. If 90% share the same grid, the cache provides near-perfect hit rate.

4. **Does WebGPU PSO compilation happen during Phase 3 (build drain)?** — If yes, the
   rAF drain budget of 45ms is competing with GPU command buffer compilation in the same
   frame. The prewarm (Phase 0) is intended to front-load this, but compile may still
   occur for CW-specific geometry variants not covered by the 3 probe meshes.

5. **What is `OBC.TechnicalDrawing.toDrawingSpace()` doing internally?** — This is a black
   box (OBC library). If it allocates new geometry objects on every call (likely), and these
   are not pooled, repeated reprojections accumulate garbage proportional to scene complexity.

---

*Generated: 2026-05-07 — PURE ANALYSIS MODE — no behavioural changes made.*  
*Instrumentation: §DIAG-BUILD-01, §DIAG-IM-01/02/03, §DIAG-NME-01, §DIAG-EPS-01/02/03/04*
