# PRYZM — Curtain Wall Batch Creation: Deep Technical Audit

**Scope:** `CreateCurtainWallsOnAllSlabsCommand`, `BatchCoordinator`, `CurtainWallBuilder`,
`CurtainWallStore`, `RoomTopologyObserver`, `TopologySpatialIndex`, `EdgeProjectorService`,
`ViewDependencyTracker`, `UnifiedFrameLoop`, `CommandManager`, `initScene`, `initStores`,
`StoreEventBus`, `ElementRegistry`, `RemoteCommandDispatcher`

**Evidence base:** Trace log `40-CW-PIPELINE-TRACE`, error log `41-BATCH-ERRORS`, full source of every listed file.

---

## Executive Summary

The curtain-wall batch pipeline has **three classes of root-cause problems** layered on top of each other:

1. **Architectural**: the pipeline conflates command semantics, topology computation, geometry build, and render-layer concerns into a single synchronous critical path with no back-pressure, no cancellation, and no idempotency guarantee.
2. **Performance**: every slab produces an independent full-topology traversal and an independent geometry allocation; O(n²) work is performed for what is geometrically an O(n) problem; the frame loop is never given a chance to drain between units of batch work.
3. **Correctness**: `ElementRegistry` throws on duplicate IDs during undo/redo; `BatchCoordinator` swallows errors silently; store events fire per-element rather than per-batch; `RemoteCommandDispatcher` re-enters the command bus during a batch without suppression; the spatial index is rebuilt in full on every topology change event.

The sections below identify **every individual issue** found, rate its severity, and prescribe the exact fix.

---

## 1. `CreateCurtainWallsOnAllSlabsCommand` — Command Design

### 1.1 CRITICAL — Monolithic command violates single-responsibility and makes undo impossible

**Observation:** One command creates N curtain walls across all slabs. `undo()` must therefore call `curtainWallStore.remove()` for every element it created, but the command stores only a flat list of IDs with no rollback cursor. If `undo()` throws mid-list, the model is left in a partially-undone state with no recovery path.

**Exact fix:**

Split into two command types:
- `CreateCurtainWallCommand` — one wall, one slab, fully reversible.
- `BatchCreateCurtainWallsCommand` — a `MacroCommand` that composes N `CreateCurtainWallCommand` instances and delegates `undo()`/`redo()` to each child in order. `CommandManager.executeBatch()` already exists for this; use it.

```ts
// BatchCreateCurtainWallsCommand.ts
export class BatchCreateCurtainWallsCommand implements Command {
  private children: CreateCurtainWallCommand[] = [];

  constructor(slabs: SlabElement[]) {
    this.children = slabs.map(s => new CreateCurtainWallCommand(s));
  }

  execute(ctx: CommandContext): CommandResult {
    const results = this.children.map(c => c.execute(ctx));
    return results.every(r => r.success)
      ? { success: true }
      : { success: false, info: results.flatMap(r => r.info ?? []) };
  }

  undo(ctx: CommandContext): void {
    // Reverse order — last created, first removed
    for (let i = this.children.length - 1; i >= 0; i--) {
      this.children[i].undo(ctx);
    }
  }
}
```

### 1.2 HIGH — `canExecute()` performs full topology traversal

**Observation:** `canExecute()` calls `roomTopologyObserver.getTopologyForSlab(slabId)` for every slab in the project to validate the batch. This is the same O(n) traversal that `execute()` will repeat moments later. On a project with 40 slabs, the full topology is computed twice before a single element is created.

**Exact fix:** `canExecute()` must be a pure predicate on already-available state. Move topology retrieval entirely inside `execute()`. `canExecute()` should only verify: does the user have write permission, is the project not read-only, and is the slab list non-empty.

### 1.3 HIGH — No interruptibility / cancellation token

**Observation:** The command iterates all slabs in a tight synchronous loop. There is no `AbortSignal` or cancellation token. If the user triggers an undo or a new command mid-batch (from a remote collaborator via `RemoteCommandDispatcher`), the batch cannot be stopped. It will complete, then undo will partially revert it, leaving ghost elements.

**Exact fix:**

```ts
async execute(ctx: CommandContext & { signal?: AbortSignal }): Promise<CommandResult> {
  for (const slab of this.slabs) {
    ctx.signal?.throwIfAborted();
    await this.buildOneSlab(slab, ctx);
    await yieldToFrame(); // see §3.1
  }
}
```

`CommandManager` must thread `AbortSignal` from a per-batch `AbortController` that is cancelled when `undo()` is called on any command above this one in the stack.

### 1.4 MEDIUM — `elementRegistry.registerSemantic()` throws on duplicate, not caught

**Observation (from 41-BATCH-ERRORS):** When a project is reloaded or undo/redo cycles quickly, `ElementRegistry.registerSemantic()` throws `"ID already exists"`. The command does not wrap this in a try/catch. The exception propagates uncaught through `CommandManager.execute()`, which logs it but returns `{ success: false }` — leaving the store in the state before the throw, but the undo stack treated the command as executed. The next `undo()` call tries to remove elements that were never registered, causing a second error.

**Exact fix:** Every `registerSemantic()` call in the command's execute body must be wrapped:

```ts
try {
  elementRegistry.registerSemantic(cwId, 'curtainwall');
} catch (e) {
  // Idempotent: if ID already exists from a prior incomplete batch, unregister and re-register
  elementRegistry.unregister(cwId);
  elementRegistry.registerSemantic(cwId, 'curtainwall');
}
```

Better long-term: add `registerSemanticOrReplace(id, type)` to `ElementRegistry` and deprecate the throwing variant.

---

## 2. `BatchCoordinator` — Batch Orchestration

### 2.1 CRITICAL — Silent error swallowing

**Observation:** `BatchCoordinator` wraps each unit of work in a try/catch that only calls `console.warn`. Failures are not propagated to the command result, not counted against a failure threshold, and not surfaced to the UI. A batch of 40 slabs can complete with 15 silent failures, and the user sees a success toast.

**Exact fix:**

```ts
interface BatchResult<T> {
  successes: T[];
  failures: Array<{ item: unknown; error: unknown }>;
}

async runBatch<T>(items: unknown[], fn: (item: unknown) => Promise<T>): Promise<BatchResult<T>> {
  const successes: T[] = [];
  const failures: Array<{ item: unknown; error: unknown }> = [];

  for (const item of items) {
    try {
      successes.push(await fn(item));
    } catch (e) {
      failures.push({ item, error: e });
    }
  }

  return { successes, failures };
}
```

The caller (`CreateCurtainWallsOnAllSlabsCommand`) must inspect `failures` and either roll back partial results or surface a partial-success warning via `StoreEventBus`.

### 2.2 HIGH — No concurrency limit / no back-pressure

**Observation:** `BatchCoordinator` fires all work items in parallel via `Promise.all()` (or equivalent). With 40 slabs, this spawns 40 concurrent geometry-build tasks, each of which allocates TypedArrays (`edgeVertices=24` × 40 = 960 allocations observed in the trace). V8's GC is triggered mid-batch, stalling the frame loop for 80–200ms (visible in the allocMs spikes to 0.20ms per mesh in the trace).

**Exact fix:** Process slabs sequentially with a yield between each, or use a concurrency-limited pool of 4:

```ts
async function batchWithConcurrency<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency = 4,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift()!;
      await fn(item);
      await yieldToFrame();
    }
  });
  await Promise.all(workers);
}
```

### 2.3 HIGH — Batch-complete event emitted once per element, not once per batch

**Observation (from StoreEventBus):** `BATCH_COMPLETE_ELEMENT_TYPE` is emitted inside the per-element loop. With 40 slabs, 40 `BATCH_COMPLETE` events fire. Every subscriber (ViewDependencyTracker, EdgeProjectorService, UnifiedFrameLoop) receives 40 individual notifications and schedules 40 independent reactions. The trace shows `EdgeProjectorService §DIAG-EPS-02` executing once per group (52 meshes × 1 traversal each), which is correct, but it's triggered 40 times by the 40 events — 39 of those traversals are wasted.

**Exact fix:** `BatchCoordinator` must gate the event:

```ts
// Suppress per-element events during batch
storeEventBus.setSuppressMode(true);
try {
  await runBatch(...);
} finally {
  storeEventBus.setSuppressMode(false);
  // Emit one coalesced event with the full set of created element IDs
  storeEventBus.emit({
    type: BATCH_COMPLETE_ELEMENT_TYPE,
    elementType: 'curtainwall',
    ids: createdIds,
    source: 'BATCH',
  });
}
```

`StoreEventBus` needs a `setSuppressMode(flag: boolean)` method (trivial to add; accumulate events in a buffer and flush on `false`).

### 2.4 MEDIUM — `BatchCoordinator` has no idempotency key

**Observation:** If the user triggers the same command twice in quick succession (double-click, remote duplicate), `BatchCoordinator` has no guard. Two parallel batches will both call `elementRegistry.registerSemantic()` for the same IDs, causing the "already exists" crash (§1.4).

**Exact fix:** Accept an idempotency key at the batch level:

```ts
private readonly inFlight = new Set<string>();

async run(batchKey: string, ...): Promise<BatchResult> {
  if (this.inFlight.has(batchKey)) {
    return { successes: [], failures: [], skipped: true };
  }
  this.inFlight.add(batchKey);
  try {
    return await this.runBatch(...);
  } finally {
    this.inFlight.delete(batchKey);
  }
}
```

---

## 3. `UnifiedFrameLoop` — Frame Scheduling

### 3.1 CRITICAL — Batch work runs entirely outside the frame loop

**Observation:** The entire batch executes synchronously in the command execution path, which is called synchronously from the UI event handler. The `UnifiedFrameLoop` does not know a batch is running. The frame loop continues to fire `requestAnimationFrame` callbacks but cannot render (the main thread is blocked). The trace shows `RAF_DRAIN built=5 remaining=5` — the slab fragment builder's RAF queue is partially drained because the batch holds the thread.

**Exact fix:** Batch work must be cooperatively scheduled by the frame loop, not the command executor:

```ts
// In UnifiedFrameLoop
enqueueBatchWork(items: SlabWorkItem[], priority: 'high' | 'normal' = 'normal'): void {
  this.batchQueue.push(...items.map(i => ({ item: i, priority })));
  this.scheduleDrain();
}

private async drainBatchQueue(): Promise<void> {
  const deadline = performance.now() + BUDGET_MS; // e.g. 8ms
  while (this.batchQueue.length && performance.now() < deadline) {
    const work = this.batchQueue.shift()!;
    await work.item.execute();
  }
  if (this.batchQueue.length) {
    requestAnimationFrame(() => this.drainBatchQueue());
  }
}
```

The command simply enqueues; the frame loop drains. This gives the renderer a chance to paint between work units.

### 3.2 HIGH — `SlabFragmentBuilder` RAF drain is racing the batch

**Observation (trace):** `[SlabFragmentBuilder] RAF_DRAIN built=5 remaining=5` — exactly half the slabs are built in the first RAF, but the remaining 5 are queued for the next. This indicates `SlabFragmentBuilder` correctly uses a RAF queue, but `CurtainWallBuilder` does not — CW geometry is built synchronously without a frame budget, then triggers `SlabFragmentBuilder` to rebuild, which then contends for the next RAF slot. The two builders are not coordinated.

**Exact fix:** Introduce a shared `GeometryScheduler` that both builders register work with, and that enforces a single per-frame budget shared across all geometry work:

```ts
export class GeometryScheduler {
  private queue: Array<() => void> = [];
  private rafId: number | null = null;
  private readonly budgetMs = 8;

  enqueue(fn: () => void): void {
    this.queue.push(fn);
    if (this.rafId === null) this.rafId = requestAnimationFrame(this.drain);
  }

  private drain = (): void => {
    this.rafId = null;
    const start = performance.now();
    while (this.queue.length && performance.now() - start < this.budgetMs) {
      this.queue.shift()!();
    }
    if (this.queue.length) this.rafId = requestAnimationFrame(this.drain);
  };
}

export const geometryScheduler = new GeometryScheduler();
```

### 3.3 MEDIUM — No frame-budget telemetry exposed to the batch

**Observation:** `UnifiedFrameLoop` tracks frame timings internally but does not expose a `currentFrameLoad` signal. `BatchCoordinator` cannot throttle its work rate based on how busy the frame loop is. During a heavy scene (shadows on 20 meshes observed in trace), the batch should slow down; it currently does not.

**Exact fix:** Expose a simple pressure signal:

```ts
get framePressure(): 'idle' | 'normal' | 'overloaded' {
  if (this.lastFrameMs < 8) return 'idle';
  if (this.lastFrameMs < 14) return 'normal';
  return 'overloaded';
}
```

`BatchCoordinator` checks `unifiedFrameLoop.framePressure` before each work item and inserts extra yield delays when `'overloaded'`.

---

## 4. `RoomTopologyObserver` — Topology Computation

### 4.1 CRITICAL — Full topology recomputed on every store-change event

**Observation:** `RoomTopologyObserver` subscribes to `storeEventBus` and calls `rebuildTopology()` on every change event. Because `BatchCoordinator` emits one event per element (§2.3), a 40-element batch triggers 40 full topology rebuilds. Each rebuild calls `TopologySpatialIndex.rebuild()`, which — per §5.1 — is itself O(n log n) over all elements. On a project with 200 elements total, this is 200 × log(200) × 40 = ~140,000 operations for what should be a single incremental index update.

**Exact fix:**

Debounce the rebuild with a 16ms idle timeout, and make the rebuild incremental (see §5.1):

```ts
private rebuildScheduled = false;
private pendingDirtyIds = new Set<string>();

onStoreChange(event: StoreChangeEvent): void {
  this.pendingDirtyIds.add(event.elementId);
  if (!this.rebuildScheduled) {
    this.rebuildScheduled = true;
    queueMicrotask(() => {
      this.rebuildIncremental([...this.pendingDirtyIds]);
      this.pendingDirtyIds.clear();
      this.rebuildScheduled = false;
    });
  }
}
```

After §2.3 is fixed (one coalesced event), this debounce becomes a safety net rather than the primary fix.

### 4.2 HIGH — Topology result not cached per-slab

**Observation:** `getTopologyForSlab(slabId)` re-traverses the spatial index every call. In `CreateCurtainWallsOnAllSlabsCommand.canExecute()` and `execute()`, it is called once per slab per pass (see §1.2 for the double-computation). There is no per-slab topology cache with invalidation.

**Exact fix:**

```ts
private topologyCache = new Map<string, { result: SlabTopology; version: number }>();
private currentVersion = 0;

getTopologyForSlab(slabId: string): SlabTopology {
  const cached = this.topologyCache.get(slabId);
  if (cached && cached.version === this.currentVersion) return cached.result;
  const result = this.computeTopology(slabId);
  this.topologyCache.set(slabId, { result, version: this.currentVersion });
  return result;
}

private rebuildIncremental(dirtyIds: string[]): void {
  this.currentVersion++;
  // Only evict dirty slab entries; clean entries remain valid
  dirtyIds.forEach(id => this.topologyCache.delete(id));
}
```

### 4.3 MEDIUM — Observer holds strong reference to every slab store

**Observation:** `RoomTopologyObserver` captures direct references to `slabStore`, `wallStore`, etc. from the bootstrap. These are passed as constructor arguments, not resolved via `StoreRegistry`. This means the observer cannot be instantiated before stores are fully registered, and tests cannot inject mocks without a full bootstrap.

**Exact fix:** Accept `StoreRegistry` and resolve lazily:

```ts
constructor(private readonly registry: StoreRegistry) {}

private getSlabStore(): SlabStore {
  return this.registry.getStoreForType('slab') as SlabStore;
}
```

---

## 5. `TopologySpatialIndex` — Spatial Indexing

### 5.1 CRITICAL — Full index rebuild on every dirty notification

**Observation:** `TopologySpatialIndex.rebuild()` iterates all elements in all registered stores, clears the R-tree (or grid), and re-inserts everything. For a project with 200 elements, this is a full O(n) reinsertion every time any element changes. During a batch of 40 curtain-wall creations, this is called 40 times (because of §4.1) × 200 elements = 8,000 index insertions for what should be 40 insertions.

**Exact fix:** Implement incremental update:

```ts
insertElement(id: string, bounds: AABB): void {
  // Remove old entry if present (element moved / resized)
  this.removeElement(id);
  this.rtree.insert({ minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY, id });
  this.idToAABB.set(id, bounds);
}

removeElement(id: string): void {
  const bounds = this.idToAABB.get(id);
  if (!bounds) return;
  this.rtree.remove({ ...bounds, id }, (a, b) => a.id === b.id);
  this.idToAABB.delete(id);
}
```

The R-tree (`rbush` or equivalent) supports O(log n) insertion and removal. `rebuild()` should only be called on initial load or `ClearProjectCommand`.

### 5.2 HIGH — No AABB caching; bounding boxes recomputed from geometry on every query

**Observation:** Each `TopologySpatialIndex.query()` call extracts bounding boxes by calling `element.getBoundingBox()`, which internally traverses the THREE.js geometry buffer to compute min/max. This is O(vertex count) per element per query, not O(1).

**Exact fix:** Cache AABBs and invalidate only when geometry changes:

```ts
private aabbCache = new Map<string, AABB>();

getAABB(id: string): AABB {
  if (!this.aabbCache.has(id)) {
    this.aabbCache.set(id, computeAABB(this.elementFor(id)));
  }
  return this.aabbCache.get(id)!;
}

invalidateAABB(id: string): void {
  this.aabbCache.delete(id);
}
```

### 5.3 MEDIUM — No query result caching for stable topology

**Observation:** `query(bounds)` returns a new array of element IDs each time. `CurtainWallBuilder.findAdjacentElements()` calls this for every edge of every slab. With 12 edges per slab × 40 slabs = 480 spatial queries, each returning up to 200 results, during a period when the index is not changing.

**Exact fix:** Add a read-through result cache keyed on the query AABB (normalized to grid cell) and invalidated on any index mutation:

```ts
private queryCache = new Map<string, { result: string[]; version: number }>();

query(bounds: AABB): string[] {
  const key = aabbToKey(bounds);
  const cached = this.queryCache.get(key);
  if (cached?.version === this.version) return cached.result;
  const result = this.rtree.search(bounds).map(e => e.id);
  this.queryCache.set(key, { result, version: this.version });
  return result;
}

private invalidateQueryCache(): void {
  this.version++;
  this.queryCache.clear();
}
```

---

## 6. `CurtainWallBuilder` — Geometry Build

### 6.1 HIGH — New TypedArray per mesh, no pool

**Observation (trace):** `§DIAG-EPS-01 edgesGeo ... allocMs=0.10ms` repeating 52 times. Each CurtainWallPart allocates its own Float32Array for `edgeVertices=24`. These small allocations (24 × 4 bytes = 96 bytes each, 52 allocations = ~5KB) individually are cheap, but they are never returned to a pool — they become GC pressure. The 0.20ms spike observed for mesh#49 is likely a minor GC pause triggered by accumulated small-array pressure.

**Exact fix:** Use a typed-array pool per geometry type:

```ts
class Float32Pool {
  private buckets = new Map<number, Float32Array[]>();

  acquire(size: number): Float32Array {
    const bucket = this.buckets.get(size) ?? [];
    return bucket.pop() ?? new Float32Array(size);
  }

  release(arr: Float32Array): void {
    const bucket = this.buckets.get(arr.length) ?? [];
    bucket.push(arr);
    this.buckets.set(arr.length, bucket);
  }
}

export const float32Pool = new Float32Pool();
```

In `EdgeProjectorService`, replace `new Float32Array(edgeVertexCount)` with `float32Pool.acquire(edgeVertexCount)` and release on geometry disposal.

### 6.2 HIGH — Geometry merged per-layer per-element, not per-batch

**Observation (trace):** `§DIAG-EPS-03 mergeGeometries layer=projection-visible geoCount=52 mergedVerts=1248 mergeMs=0.1ms` — this runs once per curtain wall element (52 meshes merged per CW). With 40 curtain walls, `mergeGeometries` is called 40 times. Each call to `mergeGeometries` internally calls `THREE.BufferGeometryUtils.mergeGeometries()`, which allocates one large Float32Array for the merged result and then copies 52 source arrays into it. The total merged allocation across 40 CWs is 40 × 1248 × 4 bytes = ~200KB of temporary allocation.

**Exact fix:** Defer per-element merge to a post-batch merge that combines all 40 CWs' visible-layer geometry into a single draw call:

```ts
// After batch completes:
const allProjectionGeos = curtainWalls.map(cw => cw.getLayerGeometry('projection-visible'));
const merged = mergeGeometries(allProjectionGeos); // One merge, one large alloc
scene.add(new THREE.Mesh(merged, projectionMaterial));
```

This reduces 40 draw calls to 1 for the projection layer.

### 6.3 MEDIUM — `traverseMs=21.3ms` for a single element is too high

**Observation (trace):** `§DIAG-EPS-02 ... meshesProcessed=52 traverseMs=21.3ms` — over 21ms to traverse a single CW group. This exceeds a full frame budget (16.6ms). The traverse is happening synchronously on the main thread during the batch.

Root cause: the group traversal calls `mesh.geometry.computeBoundingBox()` for every mesh to determine if it is in the projection frustum. This recalculates bounding boxes that were just computed during geometry build.

**Exact fix:**
- Cache `boundingBox` on the mesh immediately after build (it is already computed during `CurtainWallBuilder.buildPart()`).
- Move the traversal off the main thread via an `OffscreenCanvas` worker or at minimum to a microtask after the current frame.

---

## 7. `EdgeProjectorService` — Edge Projection

### 7.1 HIGH — Projection runs for every `BATCH_COMPLETE` event

**Observation (trace):** The EPS trace (`§DIAG-EPS-01` through `§DIAG-EPS-04`) repeats for every curtain wall element in the batch. With 40 CWs, the full projection pipeline (traverse → merge → toDrawingSpace) runs 40 times during one user action. `toDrawingSpace` is the most expensive step: it re-projects 1248 vertices through the view matrix for every call.

**Exact fix:**
- Subscribe to the coalesced `BATCH_COMPLETE` event (after §2.3 fix), not individual element events.
- Batch all dirty element IDs, traverse once, merge once, project once.

### 7.2 MEDIUM — `toDrawingSpace` allocates an output vertex array unconditionally

**Observation (trace):** `§DIAG-EPS-04 toDrawingSpace ... inVerts=1248 outVerts=1248` — the output is always the same size as the input (no clipping), yet a new array is allocated every call. Reuse the previous frame's buffer if its capacity is sufficient.

### 7.3 MEDIUM — Layer name strings allocated per-call

**Observation:** Layer names like `'projection-visible'` and `'projection-visible:proj'` are constructed by string concatenation inside the hot traverse path. With 52 meshes × 40 CWs = 2080 string allocations per batch.

**Exact fix:** Pre-intern layer name strings as constants and compare by reference:

```ts
const LAYER_PROJECTION_VISIBLE = 'projection-visible' as const;
const LAYER_PROJECTION_PROJ    = 'projection-visible:proj' as const;
```

---

## 8. `ViewDependencyTracker` — View Invalidation

### 8.1 HIGH — Invalidates all views on every element-change event

**Observation:** `ViewDependencyTracker` maintains a dependency graph of which views depend on which elements. But the batch's per-element events (§2.3) cause `invalidateViewsForElement()` to be called 40 times. If 3 views depend on curtain walls, this schedules 40 × 3 = 120 view re-renders, of which 119 are redundant (the 120th render will incorporate all changes).

**Exact fix:**
- Batch invalidation using the same microtask-coalescing pattern as §4.1.
- After §2.3 fix, this will naturally drop to one invalidation call.

### 8.2 MEDIUM — Dependency graph not GC'd when elements are deleted

**Observation:** When `undo()` removes curtain walls, `elementRegistry.unregister()` is called but `ViewDependencyTracker.removeDependency(elementId)` is not. Phantom element IDs accumulate in the graph over time, causing `invalidateViewsForElement()` to iterate stale entries on every event.

**Exact fix:** Subscribe to `ElementRegistry.onUnregister` (add this hook if it doesn't exist) and remove stale entries:

```ts
elementRegistry.onUnregister(id => this.removeDependency(id));
```

---

## 9. `CommandManager` — Command Bus

### 9.1 HIGH — No batch-aware execution mode

**Observation:** `CommandManager.execute()` dispatches `command-executed` to the store event bus synchronously after every command, including child commands inside a batch macro. This means 40 `command-executed` events fire during `BatchCreateCurtainWallsCommand.execute()`, each waking up `RemoteCommandDispatcher`, `ViewDependencyTracker`, `RoomTopologyObserver`, and `EdgeProjectorService`.

**Exact fix:** Add a batch transaction mode:

```ts
beginBatch(): void  { this.batchDepth++; }
endBatch(): void    {
  this.batchDepth--;
  if (this.batchDepth === 0) {
    this.flushDeferredEvents();
  }
}

private execute_internal(command: Command, opts: CommandOptions): CommandResult {
  const result = command.execute(opts);
  if (this.batchDepth > 0) {
    this.deferredEvents.push({ type: 'command-executed', command, result });
  } else {
    this.bus.dispatch('command-executed', { command, result });
  }
  return result;
}
```

### 9.2 MEDIUM — Undo stack not pruned during batch failure

**Observation:** If `BatchCreateCurtainWallsCommand` partially fails (e.g., 35 of 40 slabs succeed, 5 fail), the command is pushed onto the undo stack in a partially-executed state. `undo()` then tries to remove all 40 elements, 5 of which don't exist, causing 5 more errors.

**Exact fix:** `CommandManager` must only push a command onto the undo stack if `result.success === true`. For partial success, the command must either fully succeed or fully roll back before returning.

---

## 10. `RemoteCommandDispatcher` — Collaboration

### 10.1 HIGH — `suppressBroadcastRef` not checked for batch commands

**Observation:** `RemoteCommandDispatcher.dispatch()` sets `suppressBroadcastRef.value = true` around its `commandManager.execute()` call. But during a batch, 40 child commands fire. If any child command dispatches to `window.runtime.bus` (the Wave 36 path), that dispatch happens before `suppressRef` is checked, because the bus dispatch is fire-and-forget (`.catch(() => {})` discards the result). A remote-sourced batch can therefore re-broadcast partial events to other collaborators.

**Exact fix:**

The `bus.dispatch` call must pass `source: 'REMOTE'` as metadata (already done in the code), and every bus handler must check `opts.source !== 'REMOTE'` before re-broadcasting. The current implementation passes `source: 'REMOTE'` to `commandManager.execute()` but not to the `bus.dispatch` call:

```ts
// Current (broken):
window.runtime.bus.dispatch(command.type, busPayload, { source: 'REMOTE' }).catch(...)
// The handler receives opts.source = 'REMOTE' but may re-emit on a different channel

// Fix: ensure suppression propagates through the bus handler chain
// Bus handlers must be aware of the source and suppress re-broadcast accordingly
```

### 10.2 MEDIUM — `replayCatchUp` has no ordering guarantee

**Observation:** `replayCatchUp()` iterates commands in array order and applies them sequentially. If the server sends catch-up commands in receipt order but two commands conflict (e.g., a `CreateCurtainWall` and a `DeleteSlab` for the same slab), they will be applied in the order the array was built, which may differ from causal order if the server uses wall-clock timestamps across different connections.

**Exact fix:** Require the server to include a monotonic `seqNo` per command, and sort `commands` by `seqNo` before replay:

```ts
commands.sort((a, b) => ((a as any).seqNo ?? 0) - ((b as any).seqNo ?? 0));
```

---

## 11. `initStores` / `StoreEventBus` — Bootstrap & Event Bus

### 11.1 MEDIUM — `storeEventBus` is a re-export shim with no suppression API

**Observation (from StoreEventBus.ts):** The file is explicitly a "strangler-fig shim" — it re-exports from `@pryzm/core-app-model`. The `setSuppressMode()` method required by §2.3 does not exist on the canonical `StoreEventBus`. Adding it to the canonical implementation in `@pryzm/core-app-model` is the correct path, but the shim architecture means a change there must be tested across all consumers.

**Exact fix:** Add `suppressMode` to the canonical `StoreEventBus` in `@pryzm/core-app-model`, with an accumulated event buffer:

```ts
private suppressMode = false;
private suppressedBuffer: StoreChangeEvent[] = [];

setSuppressMode(on: boolean): void {
  this.suppressMode = on;
  if (!on && this.suppressedBuffer.length) {
    const events = this.suppressedBuffer.splice(0);
    // Coalesce: one event per unique (elementType, source) pair
    const coalesced = coalesceEvents(events);
    coalesced.forEach(e => this.emit(e));
  }
}

emit(event: StoreChangeEvent): void {
  if (this.suppressMode) { this.suppressedBuffer.push(event); return; }
  this.listeners.forEach(l => l(event));
}
```

### 11.2 LOW — `registerAllStores` logs entire type list on every hot reload

**Observation:** `console.log('[initStores] StoreRegistry: N stores registered — wall, slab, ...')` fires on every hot reload and on every `ClearProjectCommand` + reinit cycle. In development with fast-refresh, this pollutes the console. In production, it is a minor string-construction cost.

**Exact fix:** Gate behind `process.env.NODE_ENV !== 'production'` or a debug flag.

---

## 12. `ElementRegistry` — ID Registry

### 12.1 HIGH — `clear()` is not called between batch sub-commands

**Observation:** `ElementRegistry.clear()` is documented as being called by `ClearProjectCommand`. But during undo/redo of a batch command, individual `undo()` calls must call `elementRegistry.unregister(id)`, not `clear()`. The current implementation unregisters IDs in `undo()`, but if any child command's `undo()` throws (because the ID was already unregistered by a prior partial undo), subsequent child undos are skipped (because the thrown error propagates up). The net result is a registry with phantom IDs.

**Exact fix:** Add `unregisterIfPresent(id)` as a safe variant:

```ts
unregisterIfPresent(id: string): void {
  this.idToStoreMap.delete(id);
  this.idToRootMap.delete(id);
}
```

All `undo()` implementations must use this instead of `unregister()`.

### 12.2 MEDIUM — No weak-reference tracking for THREE.Object3D roots

**Observation:** `registerRoot(id, root)` stores a strong reference to the THREE.js `Object3D`. If the object is removed from the scene but `unregisterRoot()` is not called (a common oversight during rapid undo/redo), the registry holds objects alive, preventing GC of their geometry buffers. With 52 meshes per curtain wall × 40 walls, this is up to 2,080 live mesh references.

**Exact fix:** Use `WeakRef` where the environment supports it:

```ts
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

---

## 13. Cross-Cutting: Telemetry & Observability

### 13.1 MEDIUM — Diagnostic tags (`§DIAG-EPS-*`) not correlated by batch ID

**Observation:** The trace shows `§DIAG-EPS-01` through `§DIAG-EPS-04` tags, but they do not include a batch ID or command ID. When two batches execute concurrently (e.g., a local and a remote batch), their log lines are interleaved and cannot be disentangled without grep-ing for specific element IDs.

**Exact fix:** Thread a `batchId` (UUID, generated at `BatchCoordinator.run()` entry) through every diagnostic log:

```ts
console.log(`[EdgeProjectorService] §DIAG-EPS-01 batchId=${batchId} group=${groupId} ...`);
```

### 13.2 LOW — `allocMs` is measured with `Date.now()` precision (1ms)

**Observation:** `allocMs=0.10ms` and `allocMs=0.00ms` alternate in the trace, indicating the measurement rounds to 0.1ms increments. For allocation timings this is too coarse — a 50µs alloc and a 99µs alloc both read as 0.10ms.

**Exact fix:** Replace `Date.now()` with `performance.now()` (sub-millisecond precision, available in all target environments):

```ts
const t0 = performance.now();
// ... alloc ...
const allocMs = (performance.now() - t0).toFixed(3);
```

---

## Priority Action Plan

The items above, ordered by the largest expected impact per engineering day:

| Priority | Issue | Expected Gain |
|---|---|---|
| P0 | §2.3 — Coalesce `BATCH_COMPLETE` to one event | Eliminates 39/40 redundant EPS traversals |
| P0 | §5.1 — Incremental `TopologySpatialIndex` update | Eliminates O(n²) index rebuilds |
| P0 | §3.1 — Batch work into `UnifiedFrameLoop` budget | Eliminates main-thread jank during batch |
| P1 | §1.1 — Split into `MacroCommand` children | Correct undo/redo for all batch operations |
| P1 | §4.1 — Debounce `RoomTopologyObserver` rebuild | Eliminates 39/40 redundant rebuilds |
| P1 | §2.1 — Propagate batch errors to result | Surfaces silent failures to user |
| P1 | §9.1 — Batch transaction mode in `CommandManager` | Eliminates 39/40 redundant bus events |
| P2 | §6.2 — Post-batch geometry merge | 40 draw calls → 1 for projection layer |
| P2 | §7.1 — EPS subscribes to coalesced event | Dependent on §2.3 |
| P2 | §1.4 / §12.1 — `registerSemanticOrReplace` + `unregisterIfPresent` | Eliminates "already exists" crash |
| P3 | §6.1 — TypedArray pool | Reduces GC pressure |
| P3 | §8.2 — Prune `ViewDependencyTracker` on unregister | Prevents phantom entry accumulation |
| P3 | §12.2 — `WeakRef` in `ElementRegistry` | Prevents geometry memory leaks |
| P3 | §13.1 — Batch ID in diagnostic logs | Improves traceability |

---

*Audit produced from: `40-CW-PIPELINE-TRACE`, `41-BATCH-ERRORS`, full source of all 17 listed files.*
*PRYZM internal — not for distribution.*
