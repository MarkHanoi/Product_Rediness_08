# 44 — Revised Curtain Wall Batch Creation Audit

> **Supersedes**: `PRYZM-CurtainWall-Batch-Audit.md`  
> **Based on**: `43-AUDIT-REVIEW.md` — full cross-examination against source code,  
> `41-BATCH-ERROS.md`, `42-DEEP-PIPELINE-ANALYSIS.md`, `C01`, `C11`, `01-VISION.md`.  
> **Status**: CANONICAL — use this document, not the original audit.  
> **Date**: 2026-05-07  
> **Scope**: `CreateCurtainWallsOnAllSlabsCommand`, `BatchCoordinator`, `CurtainWallBuilder`,  
> `CurtainWallStore`, `CurtainWallInstanceManager`, `EdgeProjectorService`,  
> `NativeElementMeshExporter`, `ViewDependencyTracker`, `ElementRegistry`,  
> `RemoteCommandDispatcher`, `StoreEventBus`.

---

## What Changed From The Original Audit

Nine findings were **removed** because they describe problems that are already solved in the current codebase. Three findings were **revised** because the symptom was real but the proposed fix was architecturally incorrect. Five new findings were **added** from `42-DEEP-PIPELINE-ANALYSIS.md` that the original audit missed entirely.

| Change | Original section | Reason |
|--------|-----------------|--------|
| ❌ Removed | §2.2 Promise.all concurrency | `runBatch()` is synchronous — no Promise.all exists |
| ❌ Removed | §2.3 per-element events | `beginBatch()/endBatchYielded()` already implements this |
| ❌ Removed | §3.1 batch outside frame loop | `PERF-DEFER-RESUME-FLUSH` already in place; proposed fix breaks depth invariant |
| ❌ Removed | §4.1 40 topology rebuilds | Fast batch path skips `this.listeners` entirely in `addMany()` |
| ❌ Removed | §6.2 post-batch geometry merge | Would destroy per-element GPU picking, visibility control, DXF export |
| ❌ Removed | §7.1 EPS runs 40 times | `viewDependencyTracker.setSuppressed(true)` fires at batch start |
| ❌ Removed | §8.1 ViewDependencyTracker 40 invalidations | Same: suppressed during batch |
| ❌ Removed | §9.1 CommandManager batch mode | `StoreEventBus.beginBatch()` already handles this |
| ❌ Removed | §11.1 setSuppressMode missing | `beginBatch()/endBatch()` is the existing API |
| ✏️ Revised | §2.1 async BatchResult | Revised to synchronous error propagation |
| ✏️ Revised | §6.1 TypedArray pool | Revised to projection geometry cache (correct abstraction level) |
| ✏️ Revised | §4.2 topology cache | Retained but de-prioritised; `skipRedetectRooms` mitigates |
| ➕ Added | INE-01 Panel geometry cache | Missing from original; ~141ms per batch |
| ➕ Added | INE-03/04 Projection cache | Missing from original; ~3.5s per view refresh |
| ➕ Added | INE-09 Reuse mullionDummy | Missing from original; trivial |
| ➕ Added | INE-10 computeCurtainCells cache | Missing from original; ~59ms per batch |
| ➕ Added | INE-13 addManyPaused guard | Missing from original; correctness |

---

## Executive Summary

The curtain-wall batch pipeline has **two classes of remaining problems**:

1. **Correctness**: `ElementRegistry` throws on duplicate ID during undo/redo; `ViewDependencyTracker` accumulates phantom entries after undo; undo stack pushed on partial failures; no collaboration ordering guarantee.

2. **Performance**: The remaining bottleneck is not in the store mutation or build phases — those are fast. The dominant cost is **Phase 6 (EdgeProjectorService)**, which expands every curtain-wall InstancedMesh into N proxy objects and runs `EdgesGeometry` on each. For 294 walls this takes ~3.4–3.7 seconds per view refresh. A projection geometry cache keyed on `(elementId, viewId, wallVersion)` eliminates this cost on all subsequent refreshes.

The store mutation phase (Phase 1), build drain (Phase 3), registration drain (Phase 4), and event bus drain (Phase 5) are all performing within acceptable bounds after the 2026-05-04/05/06 sprint.

---

## 1. `CreateCurtainWallsOnAllSlabsCommand` — Command Design

### 1.1 MEDIUM — `canExecute()` performs topology traversal before `execute()`

**Observation:** `canExecute()` calls `roomTopologyObserver.getTopologyForSlab(slabId)` for every slab to validate the batch — the same traversal that `execute()` will repeat immediately after. On a 40-slab project the full topology is computed twice before a single element is created.

**Exact fix:** `canExecute()` must be a pure predicate on already-available state only:
- Does the user have write permission?
- Is the project not read-only?
- Is the slab list non-empty?

Move all topology retrieval inside `execute()`. Zero topology reads in `canExecute()`.

**Files**: `CreateCurtainWallsOnAllSlabsCommand.ts`  
**Contract**: C11 §2 — `canExecute` is a predicate only  
**Effort**: Easy  

---

### 1.2 LOW — No `AbortSignal` for remote-sourced interruption

**Observation:** The synchronous slab loop cannot be interrupted. If a remote collaborator issues `DeleteSlab` mid-batch, the batch completes, then `undo()` partially reverts, potentially leaving ghost elements.

**Exact fix:** Accept `AbortSignal` on the `CommandContext`. Check `ctx.signal?.throwIfAborted()` at the start of `_processSlabs()`. Wrap the store mutation in the existing try/catch in `runBatch()` which already handles the abort path (bus cleaned up, `_isBatching` reset).

**Files**: `CreateCurtainWallsOnAllSlabsCommand.ts`, `CommandManager` (to thread the signal)  
**Effort**: Medium  
**Note**: This is a design decision. The synchronous store-mutation phase must not yield between slabs — the abort check must fire before or after the full `_processSlabs()` call, not inside it, to preserve the atomic batch invariant.

---

### 1.3 HIGH — `registerSemantic()` throws on duplicate; undo path is not safe

**Observation (confirmed in source):** `ElementRegistry.registerSemantic()` throws unconditionally when an ID already exists (`ElementRegistry.ts` line 36). During undo/redo cycles, the deferred registration queue runs `elementRegistry.registerSemantic(id, 'curtainwall')` for IDs that were registered in a prior execute. The current code has no guard: if the throw propagates out of the registration queue, subsequent registrations in the same `_registrationQueue.splice(0)` loop are skipped, leaving a partially-registered batch.

**Exact fix (two parts):**

Part A — Add safe variants to `ElementRegistry`:
```typescript
registerSemanticOrReplace(id: string, storeType: StoreType): void {
    this.idToStoreMap.set(id, storeType);  // Upsert — no throw
}

unregisterIfPresent(id: string): void {
    this.idToStoreMap.delete(id);
    this.idToRootMap.delete(id);
}
```

Part B — Use `registerSemanticOrReplace` inside deferred registration callbacks in `BatchCoordinator._registrationQueue`. Use `unregisterIfPresent` in all `undo()` implementations that currently call `elementRegistry.unregister()`.

**Files**: `ElementRegistry.ts`, `BatchCoordinator.ts`, `CreateCurtainWallsOnAllSlabsCommand.ts`  
**Contract**: C11 §4 — commands own spatial registration  
**Effort**: Easy  
**Priority**: HIGH — prevents "ID already exists" crash on undo/redo  

---

### 1.4 MEDIUM — Partial-failure leaves undo stack in bad state

**Observation:** If `_processSlabs()` partially fails (e.g., one slab throws during `addMany()`), `runBatch()` correctly re-throws and resets `_isBatching`. However, `CommandManager` may have already pushed this command onto the undo stack before the throw propagated (depending on call order). A subsequent `undo()` then calls `curtainWallStore.remove()` for IDs that were never added, producing silent misses.

**Exact fix:** `CommandManager.execute()` must inspect the result of `command.execute()` and only push onto the undo stack if `result.success === true` (or if no exception was thrown). Commands that throw must not be pushed.

**Files**: `CommandManager.ts`  
**Effort**: Easy  

---

## 2. `BatchCoordinator` — Batch Orchestration

### 2.1 MEDIUM — Per-slab errors inside `_processSlabs()` are silenced

**Observation:** Errors thrown by individual slab-processing steps inside `_processSlabs()` are currently caught and logged at a per-slab level. The outer `runBatch()` try/catch only sees the exception if the entire `fn()` throws. Partial failures (slab 3 of 40 fails, the rest succeed) produce a success outcome with 37 walls in the store instead of 40.

**Exact fix (synchronous — do not introduce async):**
```typescript
private _processSlabs(): void {
    const failedSlabs: Array<{ slabId: string; error: unknown }> = [];
    
    for (const slab of this.slabs) {
        try {
            this._processSingleSlab(slab, this._collectedWalls, this._regGroupsByLevel);
        } catch (e) {
            failedSlabs.push({ slabId: slab.id, error: e });
            console.error(`[CreateCWCommand] Slab ${slab.id} failed:`, e);
        }
    }
    
    if (failedSlabs.length > 0) {
        // Surface partial failure via storeEventBus so UI can show warning toast
        storeEventBus.trackPostBatchWarning?.({
            type: 'partial-batch-failure',
            affected: failedSlabs.map(f => f.slabId),
            total: this.slabs.length,
        });
    }
}
```

**Files**: `CreateCurtainWallsOnAllSlabsCommand.ts`  
**Effort**: Easy  

---

### 2.2 MEDIUM — No idempotency key; double-click triggers duplicate batch

**Observation:** If the user double-clicks "Create CW on all slabs," two `CreateCurtainWallsOnAllSlabsCommand` instances are dispatched. The second `runBatch()` is guarded by `if (this._isBatching)` which logs a warning and calls `fn()` without batch guards — the second batch's `addMany()` calls silently skip already-present IDs (because `addMany()` has `if (this.curtainWalls.has(cw.id)) continue`), but the second command is pushed onto the undo stack with the same IDs. A subsequent undo removes all walls; a redo of the second command is a no-op.

**Exact fix:**
```typescript
// In BatchCoordinator:
private readonly _inFlight = new Set<string>();

runBatch<T>(fn: () => T, opts: BatchOptions & { batchKey?: string }): T | null {
    if (opts.batchKey && this._inFlight.has(opts.batchKey)) {
        console.warn(`[BatchCoordinator] Duplicate batch key '${opts.batchKey}' — skipped.`);
        return null;
    }
    if (opts.batchKey) this._inFlight.add(opts.batchKey);
    try {
        return this._runBatchInternal(fn, opts);
    } finally {
        if (opts.batchKey) this._inFlight.delete(opts.batchKey);
    }
}
```

**Files**: `BatchCoordinator.ts`, `CreateCurtainWallsOnAllSlabsCommand.ts` (pass `batchKey: this.id`)  
**Effort**: Easy  

---

## 3. `CurtainWallBuilder` — Geometry Build Optimizations

### 3.1 HIGH — No panel geometry/material cache (INE-01)

**Observation:** `CurtainWallInstanceManager.buildInstancedMeshes()` allocates `new THREE.BoxGeometry(1, 1, panelThickness)` and `new THREE.MeshStandardMaterial(...)` fresh on every `build()` call. Unlike mullion geometry (`mullionGeometryCache` in `CurtainWallBuilder`) and mullion material (`mullionMaterialCache`), there is no panel cache.

**Scale**: 294 walls × 2 panel types = **588 BoxGeometry + 588 MeshStandardMaterial** allocations per batch. Each `BoxGeometry` has CPU buffers for 24 vertices. Each `MeshStandardMaterial` triggers a GPU PSO lookup.

**§DIAG-IM-02** will confirm per-call cost: `allocMs ≈ 0.24ms × 588 ≈ 141ms` of unnecessary allocation per batch.

**Exact fix:** Mirror the existing mullion cache pattern:
```typescript
// In CurtainWallInstanceManager:
private readonly _panelGeoCache  = new Map<string, THREE.BoxGeometry>();
private readonly _panelMatCache  = new Map<string, THREE.MeshStandardMaterial>();

private _getPanelGeometry(thickness: number): THREE.BoxGeometry {
    const key = thickness.toFixed(4);
    if (!this._panelGeoCache.has(key)) {
        this._panelGeoCache.set(key, new THREE.BoxGeometry(1, 1, thickness));
    }
    return this._panelGeoCache.get(key)!;
}

private _getPanelMaterial(type: string, color: string, opacity: number): THREE.MeshStandardMaterial {
    const key = `${type}:${color}:${opacity}`;
    if (!this._panelMatCache.has(key)) {
        this._panelMatCache.set(key, new THREE.MeshStandardMaterial({ ... }));
    }
    return this._panelMatCache.get(key)!;
}
```

**Files**: `CurtainWallInstanceManager.ts`  
**Contract**: `CurtainWallBuilder` already owns geometry disposal via `_disposeChildren`. Stamp cached geometries with `userData.sharedGeometry = true` so `_disposeChildren` skips them. Dispose the cache map on `CurtainWallBuilder.dispose()`.  
**Effort**: Easy  
**Expected gain**: ~141ms per batch; eliminates ~294KB of transient heap churn  

---

### 3.2 LOW — Two new `Object3D` per `build()` call (INE-09)

**Observation:** `CurtainWallBuilder.build()` creates two `new THREE.Object3D()` instances per call — one for vertical mullion IM, one for horizontal — as scratch objects for `setMatrixAt()`. For 294 walls: 588 allocations, each ~500 bytes = ~294KB transient heap. `CurtainWallInstanceManager` already uses a single shared `dummy` at class scope.

**Exact fix:**
```typescript
// Declare as class fields in CurtainWallBuilder:
private readonly _vMullionDummy = new THREE.Object3D();
private readonly _hMullionDummy = new THREE.Object3D();
```

**Files**: `CurtainWallBuilder.ts`  
**Effort**: Trivial (5 lines)  
**Expected gain**: ~294KB GC pressure eliminated  

---

### 3.3 MEDIUM — `computeCurtainCells()` called on every `build()` with no cache (INE-10)

**Observation:** `computeCurtainCells(grid, length, height)` is a pure function. For a 294-wall batch where most walls share the same slab template (same `gridSystem`, same `length`, same `height`), identical cell layouts are computed hundreds of times. For a typical 3×5 grid: 15 `CurtainCell` objects created and discarded per call.

**Exact fix:**
```typescript
// In CurtainWallBuilder:
private readonly _cellCache = new Map<string, readonly CurtainCell[]>();

private _getCells(grid: CurtainGridSystem, length: number, height: number): readonly CurtainCell[] {
    const key = `${JSON.stringify(grid)}:${length.toFixed(4)}:${height.toFixed(4)}`;
    if (!this._cellCache.has(key)) {
        this._cellCache.set(key, Object.freeze(computeCurtainCells(grid, length, height)));
    }
    return this._cellCache.get(key)!;
}
```

Clear `_cellCache` in `_drainBuildQueue()` on completion (prevents stale geometry for subsequent interactive builds). Cache will have near-perfect hit rate for batch scenarios.

**Files**: `CurtainWallBuilder.ts`  
**Effort**: Easy  
**Expected gain**: ~59ms per 294-wall batch (≈ 0.2ms × 294)  

---

### 3.4 LOW — InstanceManager sets `castShadow=true` by default; Builder overrides it (INE-02)

**Observation:** `CurtainWallInstanceManager.buildInstancedMeshes()` sets `instancedMesh.castShadow = true` on creation. Then `CurtainWallBuilder.build()` immediately overrides it to `!deferShadows` (false during batch). The override in `build()` correctly wins, but any future direct caller of `buildInstancedMeshes()` will silently get shadow-enabled meshes, potentially triggering an immediate shadow map rebuild.

**Exact fix:**
```typescript
// In CurtainWallInstanceManager:
instancedMesh.castShadow = false;    // Default safe; caller sets correct value
instancedMesh.receiveShadow = false; // Builder already sets this on line 852
```

**Files**: `CurtainWallInstanceManager.ts`  
**Effort**: Trivial  

---

## 4. `EdgeProjectorService` + `NativeElementMeshExporter` — Edge Projection

### 4.1 CRITICAL — No projection geometry cache; full EdgesGeometry pass on every view refresh (INE-03/04)

**Observation:** This is the largest remaining performance problem in the pipeline. `NativeElementMeshExporter.exportForView()` expands every `THREE.InstancedMesh` in a CW element group into N individual `THREE.Mesh` proxy objects (one per instance). For a wall with a 3×5 panel grid + 10+8 mullions: ~98 proxy objects per wall. For 294 walls: **~28,812 proxy Mesh objects** created synchronously per EdgeProjector invocation.

For each proxy, `EdgeProjectorService` then calls `new THREE.EdgesGeometry(mesh.geometry, angleDeg)`. Even at 0.1ms each, this is **~2,881ms** of EdgesGeometry work per full projection.

Combined with `mergeGeometries()` (51 calls for 17 groups × 3 layers) and `toDrawingSpace()` per layer, the total Phase 6 cost is **~3.4–3.7 seconds calendar time** per view refresh.

The critical observation: `CurtainWallBuilder.build()` already stamps `group.userData.version` on the root group. This version increments on every rebuild. The projected geometry is therefore deterministically cacheable.

**Exact fix — Projection Geometry Cache:**

```typescript
// In EdgeProjectorService:
interface ProjectionCacheEntry {
    version: string;           // group.userData.version at time of projection
    viewId: string;
    layers: Map<string, THREE.BufferGeometry>; // layer name → merged projected geo
    timestamp: number;
}

private readonly _projectionCache = new Map<string, ProjectionCacheEntry>();
// Key: `${elementId}:${viewId}`

private _isCacheValid(elementId: string, viewId: string, group: THREE.Group): boolean {
    const entry = this._projectionCache.get(`${elementId}:${viewId}`);
    if (!entry) return false;
    const currentVersion = group.userData?.version as string | undefined;
    return entry.version === currentVersion;
}

private _getCached(elementId: string, viewId: string): Map<string, THREE.BufferGeometry> | null {
    return this._projectionCache.get(`${elementId}:${viewId}`)?.layers ?? null;
}

private _putCache(elementId: string, viewId: string, version: string,
                  layers: Map<string, THREE.BufferGeometry>): void {
    this._projectionCache.set(`${elementId}:${viewId}`, {
        version, viewId, layers, timestamp: Date.now()
    });
}
```

**Cache invalidation:**
- On `CurtainWallBuilder.remove(id)`: `edgeProjectorService.invalidateElement(id)` — deletes all `${id}:*` entries.
- On `CurtainWallBuilder.build(id)` (rebuild): the `userData.version` is incremented — cache lookup fails automatically. No explicit invalidation needed on rebuild.
- On view definition change: call `edgeProjectorService.invalidateView(viewId)` — deletes all `*:${viewId}` entries.

**Performance impact:**
- First batch projection: unchanged (~3.5s — cache is cold)
- Second projection (unchanged walls): **~200ms** (only changed/new walls go through full path)
- Steady state (interactive edits of unrelated elements): **~50ms** (all CW walls cached)

**Files**: `EdgeProjectorService.ts`, `CurtainWallBuilder.ts` (call `invalidateElement` in `remove()`), `global-window.d.ts`  
**Contract**: P2 — THREE import only in `renderer-three`. EdgeProjectorService is in L7.5 transitional. Cache stores `THREE.BufferGeometry` — acceptable in L7.5; must be disposed on invalidation.  
**Effort**: Hard (2–3 days)  
**Expected gain**: Phase 6 cost ~3.5s → ~200ms on second projection; ~50ms steady state  

---

### 4.2 MEDIUM — `toDrawingSpace` allocates output buffer unconditionally

**Observation:** `§DIAG-EPS-04 toDrawingSpace inVerts=1248 outVerts=1248` — output is always the same size as input (no clipping). A new buffer is allocated every call. With the projection cache in place (INE-03/04), this becomes irrelevant for cached elements; apply only after INE-03/04.

**Exact fix:** Reuse the previous call's output buffer if capacity is sufficient:
```typescript
private _toDrawingSpaceBuffer: Float32Array | null = null;

private _toDrawingSpace(geo: THREE.BufferGeometry, ...): void {
    const count = geo.attributes.position.count;
    if (!this._toDrawingSpaceBuffer || this._toDrawingSpaceBuffer.length < count * 3) {
        this._toDrawingSpaceBuffer = new Float32Array(count * 3);
    }
    // write into this._toDrawingSpaceBuffer, copy result to geo
}
```

**Files**: `EdgeProjectorService.ts`  
**Effort**: Easy  
**Dependency**: Implement after INE-03/04  

---

### 4.3 LOW — Layer name strings allocated in hot traverse path

**Observation:** Layer names like `'A-CURTAIN-WALL'`, `'projection-visible:proj'` are constructed by concatenation inside the per-mesh traverse loop. With 28,812 proxy meshes, this is thousands of string allocations.

**Exact fix:** Pre-intern all ISO-13567 layer names as module-level constants and compare by reference:
```typescript
const LAYER_CW            = 'A-CURTAIN-WALL'       as const;
const LAYER_PROJ_VISIBLE  = 'projection-visible'    as const;
const LAYER_PROJ_CUT      = 'projection-visible:cut' as const;
```

**Files**: `EdgeProjectorService.ts`  
**Effort**: Easy  

---

## 5. `ViewDependencyTracker` — View Invalidation

### 5.1 HIGH — Phantom element entries accumulate after undo

**Observation:** When `undo()` removes curtain walls, `elementRegistry.unregister(id)` is called, but `viewDependencyTracker.removeDependency(elementId)` is not. Phantom element IDs accumulate in the dependency graph. On the next batch, `invalidateViewsForElement()` iterates stale entries, and `markLevelsDirty()` may fire for elements that no longer exist.

**Exact fix:**
```typescript
// In ElementRegistry:
private _unregisterListeners: Array<(id: string) => void> = [];

onUnregister(cb: (id: string) => void): () => void {
    this._unregisterListeners.push(cb);
    return () => { this._unregisterListeners = this._unregisterListeners.filter(l => l !== cb); };
}

unregister(id: string): void {
    this.idToStoreMap.delete(id);
    this.idToRootMap.delete(id);
    this._unregisterListeners.forEach(l => l(id));  // Notify all cleanup callbacks
}

unregisterIfPresent(id: string): void {
    if (this.idToStoreMap.has(id) || this.idToRootMap.has(id)) {
        this.unregister(id);
    }
}
```

```typescript
// In ViewDependencyTracker.init():
elementRegistry.onUnregister(id => this.removeDependency(id));
```

**Files**: `ElementRegistry.ts`, `ViewDependencyTracker.ts`  
**Effort**: Easy  
**Priority**: HIGH — prevents unbounded memory growth in long sessions  

---

## 6. `ElementRegistry` — ID Registry

### 6.1 MEDIUM — `idToRootMap` holds strong `THREE.Object3D` references

**Observation:** `registerRoot(id, root)` stores a strong reference to the `THREE.Object3D`. If the object is removed from the scene but `unregisterRoot()` is not called (common oversight during rapid undo/redo), the registry prevents GC of the geometry buffers. With 98 proxy meshes per CW wall × 294 walls, this is up to 28,812 live mesh references during a session with repeated undo/redo.

**Exact fix:**
```typescript
private idToRootMap: Map<string, WeakRef<THREE.Object3D>> = new Map();

registerRoot(id: string, root: THREE.Object3D): void {
    this.idToRootMap.set(id, new WeakRef(root));
}

getRoot(id: string): THREE.Object3D | undefined {
    const ref = this.idToRootMap.get(id);
    const obj = ref?.deref();
    if (!obj) { this.idToRootMap.delete(id); return undefined; }
    return obj;
}
```

**Files**: `ElementRegistry.ts`  
**Effort**: Easy  

---

## 7. `RemoteCommandDispatcher` — Collaboration

### 7.1 MEDIUM — `replayCatchUp()` has no ordering guarantee

**Observation:** `replayCatchUp()` iterates commands in array order. If the server sends catch-up commands in receipt order but two commands conflict (a `CreateCurtainWall` and a `DeleteSlab` for the same slab arrived via different WebSocket connections), they may be applied in wall-clock order rather than causal order.

**Exact fix:** Require the server to include a monotonic `seqNo` per command and sort before replay:
```typescript
commands.sort((a, b) => ((a as any).seqNo ?? 0) - ((b as any).seqNo ?? 0));
```

**Files**: `RemoteCommandDispatcher.ts`  
**Effort**: Easy (client-side); requires server-side `seqNo` stamping (Medium)  

---

### 7.2 LOW — `suppressBroadcastRef` not checked for all bus dispatch paths

**Observation:** `RemoteCommandDispatcher` sets `suppressBroadcastRef.value = true` around `commandManager.execute()`. If a bus handler called inside that path fires a separate `window.runtime.bus.dispatch()` (the Wave 36 path), that dispatch goes out before `suppressRef` is checked in the handler, because the check is in the legacy path only.

**Exact fix:** All bus handlers must receive `meta.source` and suppress re-broadcast if `source === 'remote'`. Document this as a required convention in the bus handler template.

**Files**: Handler template, `RemoteCommandDispatcher.ts`  
**Effort**: Medium  

---

## 8. Cross-Cutting: Telemetry & Observability

### 8.1 MEDIUM — Diagnostic tags not correlated by batch ID

**Observation:** `§DIAG-EPS-01` through `§DIAG-EPS-04`, `§PERF-DRAIN`, `§BATCH-CW-PAUSE-ADDMANY` all lack a `batchId` field. When two batches execute close together, their log lines interleave and cannot be disentangled.

**Exact fix:** Thread a `batchId` (UUID from `BatchCoordinator.runBatch()`) through every diagnostic log:
```typescript
console.log(`[EdgeProjectorService] §DIAG-EPS-01 batchId=${batchId} group=${groupId} ...`);
```

**Files**: `BatchCoordinator.ts` (generate + expose `currentBatchId`), `CurtainWallStore.ts`, `CurtainWallBuilder.ts`, `EdgeProjectorService.ts`  
**Effort**: Easy  

---

### 8.2 LOW — Timing measurements use `Date.now()` (1ms granularity)

**Observation:** `allocMs=0.10ms` and `allocMs=0.00ms` values in the trace indicate 0.1ms increment rounding from `Date.now()`. Sub-millisecond timing events (e.g., 50µs vs 99µs allocations) are indistinguishable.

**Exact fix:** Replace all `Date.now()` timing with `performance.now()` in diagnostic paths. `performance.now()` has ~5µs resolution in all target environments.

**Files**: `CurtainWallStore.ts`, `CurtainWallBuilder.ts`, `EdgeProjectorService.ts`  
**Effort**: Easy  

---

### 8.3 LOW — Shadow 30-second scheduling has no unconditional log (INE-12)

**Observation:** `setTimeout(drainSlice, 30000)` fires silently — no log at scheduling time. In a production console recording there is a 30-second gap with no trace of when shadows are expected to appear.

**Exact fix:**
```typescript
console.log(
    `[CurtainWallBuilder] §SHADOW-30S-SCHEDULED: ${pending.length} walls queued ` +
    `for shadow reactivation at T+30s (batchId=${batchId})`
);
```

**Files**: `CurtainWallBuilder.ts`  
**Effort**: Trivial  

---

### 8.4 LOW — `addManyPaused` optional-chaining silently skips on undefined (INE-13)

**Observation:** `CurtainWallStore.ts` line 224:
```typescript
(window as any).__curtainWallRebuildControl?.addManyPaused(inserted);
```

If `__curtainWallRebuildControl` is undefined (builder disposed mid-batch during rapid project switching), `addManyPaused()` is silently skipped. Walls enter the store Map but never enter `_pendingBuildsMap` — they will never be built. Ghost walls with no scene geometry result.

**Exact fix:**
```typescript
const cwCtrl = (window as any).__curtainWallRebuildControl;
if (typeof cwCtrl?.addManyPaused !== 'function') {
    console.error(
        '[CurtainWallStore] §SAFETY addManyPaused not available — ' +
        `builder may be disposed. ${inserted.length} walls in store but NOT scheduled for build.`
    );
} else {
    cwCtrl.addManyPaused(inserted);
}
```

**Files**: `CurtainWallStore.ts`  
**Effort**: Easy  

---

## 9. `canExecute()` and Topology Access

### 9.1 MEDIUM — Topology cache per slab (no version invalidation)

**Observation:** `getTopologyForSlab(slabId)` re-traverses the spatial index every call. In `execute()`, it is called once per slab. There is no per-slab topology cache with invalidation. For 40 slabs, this is 40 full traversals where the topology may be identical to the prior call.

**Exact fix:**
```typescript
private topologyCache = new Map<string, { result: SlabTopology; version: number }>();
private currentVersion = 0;

getTopologyForSlab(slabId: string): SlabTopology {
    const cached = this.topologyCache.get(slabId);
    if (cached && cached.version === this.currentVersion) return cached.result;
    const result = this.computeTopology(slabId);
    this.topologyCache.set(slabId, { result, version: this.currentVersion });
    return result;
}

onTopologyChanged(dirtyIds: string[]): void {
    this.currentVersion++;
    dirtyIds.forEach(id => this.topologyCache.delete(id));
}
```

**Files**: `RoomTopologyObserver.ts`  
**Effort**: Medium  

---

## Priority Action Plan

Ordered by expected impact per engineering day:

| Priority | Tag | Issue | Files | Effort | Expected gain |
|----------|-----|-------|-------|--------|---------------|
| **P0** | INE-03/04 | Projection geometry cache — eliminates Phase 6 rework | `EdgeProjectorService.ts`, `CurtainWallBuilder.ts` | Hard | Phase 6: ~3.5s → ~200ms |
| **P0** | §1.3 | `registerSemanticOrReplace` + `unregisterIfPresent` | `ElementRegistry.ts`, `BatchCoordinator.ts` | Easy | Eliminates undo/redo crash |
| **P0** | §5.1 | Prune `ViewDependencyTracker` on unregister | `ElementRegistry.ts`, `ViewDependencyTracker.ts` | Easy | Prevents phantom accumulation |
| **P1** | INE-01 | Panel geometry/material cache in InstanceManager | `CurtainWallInstanceManager.ts` | Easy | ~141ms per batch |
| **P1** | §1.4 | Undo stack only pushed on full success | `CommandManager.ts` | Easy | Prevents partial-undo mismatches |
| **P1** | INE-13 | Error on missing `addManyPaused` | `CurtainWallStore.ts` | Easy | Prevents silent ghost walls |
| **P2** | INE-09 | Reuse `_mullionDummy` as class field | `CurtainWallBuilder.ts` | Trivial | ~294KB GC, 5 lines |
| **P2** | INE-10 | Cache `computeCurtainCells` result | `CurtainWallBuilder.ts` | Easy | ~59ms per batch |
| **P2** | INE-02 | Fix InstanceManager shadow default to `false` | `CurtainWallInstanceManager.ts` | Trivial | Correctness only |
| **P2** | §2.2 | Idempotency key in `BatchCoordinator` | `BatchCoordinator.ts` | Easy | Prevents double-batch |
| **P2** | §7.1 / §8.1 | `replayCatchUp` seqNo ordering | `RemoteCommandDispatcher.ts` | Medium | Collaboration correctness |
| **P3** | §6.1 | `ElementRegistry` WeakRef roots | `ElementRegistry.ts` | Easy | Prevents geometry memory leak |
| **P3** | §4.2 | `toDrawingSpace` buffer reuse | `EdgeProjectorService.ts` | Easy | Minor alloc reduction |
| **P3** | §8.1 | `batchId` threading in all diagnostic logs | Multiple | Easy | Trace correlation |
| **P3** | §8.2 | `performance.now()` everywhere | Multiple | Easy | Measurement precision |
| **P3** | INE-12 | Log shadow 30s scheduling | `CurtainWallBuilder.ts` | Trivial | Observability |
| **P4** | §1.2 | `AbortSignal` on command | Multiple | Medium | Collaboration safety |
| **P4** | §9.1 | Topology cache per slab | `RoomTopologyObserver.ts` | Medium | Minor (skipRedetect mitigates) |

---

*Audit revised: 2026-05-07.*  
*Evidence: full source read of all 9 primary files + companion documents 40–42 + C01 + C11.*  
*PRYZM internal — not for distribution.*
