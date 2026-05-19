# 41 — IFC Import Pipeline: Reimplementation Plan

> **Stamp**: 2026-05-07 · **Status**: CANONICAL PLAN  
> **Authority**: `docs/audits/IFC-IMPORT-PIPELINE-AUDIT-2026-05-07.md` (22 findings, 4 P0 bugs).  
> **Goal**: Match and exceed Qonic-class import smoothness — first geometry visible in < 1.5 s, zero LONGTASKs after T+3 s, 60 fps throughout, instant storey navigation — while closing every audit finding, restoring P6/P8 compliance, and completing the plugin architecture wire-up.  
> **Scope**: IFC import pipeline, post-import navigation, server storage, observability, plugin completion.  
> **Format**: 7 phases → 34 sub-phases. Each sub-phase has acceptance criteria, affected files, and an exit gate.

---

## §0 — Performance Baseline & Targets

### §0.1 — Qonic-class UX standard

Qonic ("The Fastest BIM Platform in AEC") delivers the following characteristics that define the target bar:

| UX moment | Qonic experience | PRYZM target |
|---|---|---|
| First geometry visible | < 1 s from file open | **< 1.5 s** |
| Structural shell interactive (walls, slabs, columns) | < 2 s | **< 3 s** |
| Full model interactive (all elements, GPU pick ready) | < 5 s (50 MB file) | **< 8 s** (NFT-9 target maintained) |
| Storey switch (clip plane change) | Instant — single frame | **< 16 ms** (1 frame @ 60 fps) |
| Element selection response | < 1 frame | **< 16 ms** |
| Ongoing FPS during import | ≥ 60 fps | **≥ 60 fps** (zero LONGTASKs > 50 ms after T+3 s) |
| Memory peak (50 MB IFC, 1 session) | N/A public data | **< 800 MB peak** |
| Model restore after sign-in | < 3 s | **< 3 s** (binary stream, not base64) |

### §0.2 — Current baseline (from live audit session)

| Metric | Current | Gap |
|---|---|---|
| First geometry visible | ~4 s (T+2 s parse + T+2 s GPU) | −2.5 s needed |
| Full interactive | ~16 s (GPU pick enabled at T+16 s) | −8 s needed |
| Storey switch | N/A — plan views never created (BUG-03) | Broken |
| LONGTASK cascade | 1,867 ms + 15 LONGTASKs of 50–99 ms over 15 s | Eliminate all |
| FPS floor during import | 30 fps | +30 fps needed |
| Memory peak | Unmeasured (WASM leak + no geometry eviction) | Requires measurement + cap |
| Model restore | Base64 JSON response (~51 MB) + re-parse | Requires binary stream |

### §0.3 — Key architectural insight

The Qonic-class speed comes from three structural decisions PRYZM does not yet make:

1. **All WASM work off the main thread** — the main thread never stalls during IFC parse or geometry extraction. It only receives pre-built typed arrays ready for GPU upload.
2. **Chunked geometry creation with rAF-budgeted yields** — geometry is created in batches of ≤ 150 meshes per frame, keeping each frame under 8 ms of CPU geometry work and the renderer at ≥ 60 fps throughout.
3. **Structural priority queue** — walls, slabs, columns, and beams are processed first. The structural shell is visible and interactive within 3 s; MEP, furniture, and proxies stream in behind it invisibly.

All three changes happen in Phase 2 (off-thread pipeline) and Phase 3 (chunked streaming). The remaining phases handle correctness, architecture compliance, navigation, and storage.

---

## §1 — Phase Overview

| Phase | Name | Sprint | Duration | Closes |
|---|---|---|---|---|
| **IFC-P1** | Critical Bug Fixes | IFC-F01 | 3 days | BUG-01, BUG-02, BUG-03, BUG-04, R09, R10, R11, R12 |
| **IFC-P2** | Off-Thread Geometry Pipeline | IFC-F02 | 5 days | PERF-01, ARCH-03 partial, NFT-4 structural fix |
| **IFC-P3** | Chunked Streaming & Priority Queue | IFC-F03 | 4 days | PERF-01 complete, GPU instancing, LOD priority |
| **IFC-P4** | CommandBus Integration & Undo | IFC-F04 | 5 days | ARCH-01/P6, MEM-02 complete, CRDT delta |
| **IFC-P5** | Navigation Excellence | IFC-F05 | 5 days | BUG-03 root fix, storey isolation, plan views, section |
| **IFC-P6** | Plugin Completion | IFC-F06 | 4 days | BUG-04 root fix, ARCH-06, plugin wire-up |
| **IFC-P7** | Storage, Round-Trip & Observability | IFC-F07 | 4 days | ARCH-05/C05§2.2, SEC-01–03, OTel complete, NFT-9 bench |

**Total: 30 engineering days** across 7 phases. Phases 1–3 unblock Qonic-level import speed. Phases 4–7 restore architectural soundness and close all contract violations.

---

## §2 — Phase IFC-P1: Critical Bug Fixes

**Duration**: 3 days  
**Goal**: Eliminate the four P0 bugs. No new features — pure correctness.

### IFC-P1.1 — Fix WASM memory leak in IFCParseWorker (BUG-01)

**File**: `plugins/ifc-import/src/workers/IFCParseWorker.ts`

The `api.OpenModel()` call has no paired `api.CloseModel()`. Each parse permanently leaks a model's worth of WASM heap (~150 MB for a 38 MB IFC file).

**Change**: Wrap the parse in a `try/finally` that always calls `api.CloseModel(modelId)` before posting the result:

```
self.onmessage = async (event) => {
  // ... init ...
  const modelId = api.OpenModel(new Uint8Array(buffer), {...});
  try {
    // ... extract elementCount ...
    self.postMessage({ type: 'result', modelId, elementCount });
  } finally {
    api.CloseModel(modelId);   ← ADD THIS
  }
}
```

**Note**: After Phase 2 lands, `IFCParseWorker` is superseded by `IFCGeometryWorker`. This fix is still required now because the Worker is the documented architecture path that the bench suite exercises.

**Acceptance criteria**:
- `api.CloseModel()` is called in all code paths (success, error, exception)
- `apps/bench/src/benches/ifc-import-tier1.bench.ts` still passes
- Heap profile shows flat memory across 3 sequential parse cycles in the Worker

**Exit gate**: Unit test in `plugins/ifc-import/__tests__/IFCParseWorker.test.ts` asserting `closeModel` called after each `parse` message.

---

### IFC-P1.2 — Eliminate LONGTASK in IfcLevelImporter (BUG-02)

**File**: `src/engine/subsystems/import/ifc/IfcLevelImporter.ts`

The synchronous `for...of` loop over storeys blocks the main thread for 1,867 ms. The `getFrameScheduler()` is already imported in `initUI.ts`. Apply the same frame-yield pattern used successfully in Sprint A39 for the `_executeFinalSweep()` LONGTASK fix.

**Change**: Replace the synchronous loop with a frame-yielded async generator:

```ts
// Before (blocks for all N storeys):
for (const storey of storeys) {
  const levelResult = execute(new AddLevelCommand({...}));
  _ensurePlanView(storey.id, storey.name, execute);
}

// After (yields between each storey):
for (const storey of storeys) {
  await getFrameScheduler().scheduleOnce(() => {});  // yield to browser
  const levelResult = execute(new AddLevelCommand({...}));
  _ensurePlanView(storey.id, storey.name, execute);
}
```

For the typical 5-storey model this converts the 1,867 ms LONGTASK into 5 × ~8 ms tasks spread across 5 frames. For a 50-storey skyscraper model, the same pattern keeps each frame under 16 ms.

**Additional hardening**: The `commandManager: any` and `bimManager: any` parameters should be typed in the same sub-phase (see IFC-P1.7). Use `import type { CommandManager }` from the appropriate package.

**Acceptance criteria**:
- No LONGTASK > 50 ms during level import for any IFC file with ≤ 100 storeys
- `[IfcLevelImporter] Done` log appears within 1 rAF cycle per storey
- `apps/bench/src/benches/ifc-import-tier1.bench.ts` total time does not regress

**Exit gate**: `tools/ga-gate/` bench verifier for frame-budget compliance during level import.

---

### IFC-P1.3 — Fix CreatePlanViewCommand — "BIM Components not found" (BUG-03)

**Files**: `src/engine/subsystems/import/ifc/IfcLevelImporter.ts`, `src/engine/commands/levels/CreatePlanViewCommand.ts`

Root cause: `CreatePlanViewCommand` internally checks for `@thatopen/components BimManager` model registration. Since the PRYZM-native `IfcGeometryRenderer` bypasses OBC's `ifcLoader`, OBC's `FragmentsManager` never registers the model, so BIM components are "not found".

**Solution A (preferred)**: Make `CreatePlanViewCommand` work without an OBC BIM model. A plan view at a given `levelId` is a PRYZM-native concept — it requires a `LevelStore` entry (which exists after `AddLevelCommand`) and a clip plane elevation, not an OBC registration. Audit `CreatePlanViewCommand.execute()` and remove or guard the OBC check:

```ts
// Inside CreatePlanViewCommand.execute():
// BEFORE: if (!bimComponents || !bimComponents.hasModel()) return failure("BIM Components not found");
// AFTER:  const level = levelStore.getById(levelId);
//         if (!level) return failure(`Level ${levelId} not found in LevelStore`);
//         // Create plan view from level elevation only — no OBC required
```

**Solution B (fallback)**: Register the IFC geometry group with OBC's `FragmentsManager` via `fragmentsManager.groups.set(modelId, group)` after `renderFromOpenModel()` completes in `initUI.ts`. This is less clean but avoids touching `CreatePlanViewCommand`.

The implementation MUST prefer Solution A — removing the OBC dependency from `CreatePlanViewCommand` is architecturally correct per the divergence documented in ARCH-03.

**Acceptance criteria**:
- Live import of the test IFC file shows `[IfcLevelImporter] Done — levels: 4, views: 4, skipped: 1`
- 5 floor plan view entries appear in the view browser after import
- Clicking a floor plan view clips the viewport to that storey elevation
- `apps/bench/src/benches/plan-view-redraw.bench.ts` remains green (< 100 ms)

**Exit gate**: Live log evidence `views: N` equals `levelsCreated: N` for N ≥ 1.

---

### IFC-P1.4 — Document or Implement Plugin Handler Body (BUG-04)

**File**: `plugins/ifc-import/src/handlers/pluginHandlers.ts`

The `ifc.import.file` handler currently does nothing. Before Phase 6 wires the full plugin path, this sub-phase must do one of two things:

**Option A (honest stub)**: Remove the misleading comment about `runtime.ifc.importFile()` (which does not exist) and replace with an accurate placeholder:

```ts
// [DEFERRED — IFC-P6] This handler will be wired to IFCImportHandler (Web Worker)
// in Phase IFC-P6 when runtime.ifc slot is added to composeRuntime().
// Until then, the real import runs via initUI.ts showIfcImportProgress().
console.warn('[ifc-import] ifc.import.file: plugin path not yet wired — use UI drop zone');
```

**Option B (minimal wire)**: In the same sub-phase as IFC-P1, instantiate `IFCImportHandler` and delegate:

```ts
async handle(payload: unknown): Promise<void> {
  // Delegate to the already-correct IFCImportHandler
  const { IFCImportHandler } = await import('../IFCImportHandler.js');
  const handler = new IFCImportHandler();
  await handler.parseFile(new File([fileBuffer!], fileName!));
  handler.dispose();
}
```

Option A is the right choice for now — it removes false documentation. Option B is the right choice when IFC-P6 begins.

**Acceptance criteria**:
- No misleading comment about `runtime.ifc.importFile()` in handler body
- Handler is clearly marked with its deferred phase (IFC-P6)
- `plugins/ifc-import/__tests__/` tests pass

---

### IFC-P1.5 — Dispose IFC Group on Model Remove (R09, MEM-02)

**File**: `src/engine/subsystems/initUI.ts`

The `pryzm-import-model-remove` event handler currently only deletes the server upload record. Add `IfcGeometryRenderer.disposeGroup()` call:

```ts
window.addEventListener('pryzm-import-model-remove', (e: Event) => {
  const { modelId } = (e as CustomEvent).detail ?? {};
  const group = importedIfcGroups.get(modelId);
  if (group) {
    const { IfcGeometryRenderer } = /* lazy import */;
    IfcGeometryRenderer.prototype.disposeGroup.call(null, group); // or: new renderer().disposeGroup(group)
    importedIfcGroups.delete(modelId);
  }
  // ... existing server delete logic ...
});
```

Also add `ifcModelStore.unregister(modelId)` — which requires adding `unregister()` to `IfcModelStore` (MEM-03 fix).

**Acceptance criteria**:
- After model remove, GPU Monitor shows geometry count returns to pre-import baseline
- `ifcModelStore` size decreases by the removed model's element count
- No orphaned Three.js geometry objects in scene

---

### IFC-P1.6 — Route pryzm-ifc-imported Through runtime.events (ARCH-04, R11)

**File**: `src/engine/subsystems/initUI.ts`

Replace raw DOM event dispatch with the event bus:

```ts
// Before:
window.dispatchEvent(new CustomEvent('pryzm-ifc-imported', { detail: result }));

// After:
window.runtime?.events?.emit('ifc.modelImported', result);
// Keep DOM event as a backward-compatible shim during migration:
window.dispatchEvent(new CustomEvent('pryzm-ifc-imported', { detail: result }));
```

Update all listeners (`engineLauncher.ts:798`, `PlanViewManager.ts:152`) to prefer `runtime.events.on('ifc.modelImported', ...)` with DOM fallback.

**Acceptance criteria**:
- `ifc.modelImported` event visible in OTel event log
- Existing listeners continue to work via backward-compatible DOM shim

---

### IFC-P1.7 — Wire CRS Reader Into Main Import Path (R12, C12 §1.4)

**File**: `src/engine/subsystems/initUI.ts`

`IfcProjectedCRSReader` is fully implemented but never called from the main import path. Add the call after `importAndKeepOpen()`:

```ts
const { result, modelID } = await importer.importAndKeepOpen(bytes);

// C12 §1.4 — read CRS metadata for geospatial adapter
const { readIfcProjectedCRS } = await import('./import/ifc/IfcProjectedCRSReader');
const crsRecord = readIfcProjectedCRS(importer.getApi(), modelID);
if (crsRecord && window.runtime?.geospatial) {
  window.runtime.geospatial.setProjectedCRS(crsRecord);
}
```

**Acceptance criteria**:
- IFC files with `IfcProjectedCRS` entities populate `runtime.geospatial` CRS on import
- Files without geospatial metadata produce `null` and do not throw

---

## §3 — Phase IFC-P2: Off-Thread Geometry Pipeline

**Duration**: 5 days  
**Goal**: Move ALL web-ifc WASM work (parse, semantic extraction, geometry building) off the main thread. The main thread receives only pre-built typed arrays ready for Three.js `BufferGeometry` construction. This is the single most impactful change for achieving Qonic-class import speed.

### §3.1 — Architecture

The current model has the main thread doing everything sequentially:

```
Main thread: file.arrayBuffer() → api.Init() → api.OpenModel() → extractModel() → StreamAllMeshes() → new BufferGeometry()
```

The target model separates concerns across a dedicated Worker:

```
Main thread:  file.arrayBuffer() → Worker.postMessage(buffer, [buffer])
                                                                       ↓
IFCGeometryWorker:                               api.Init() → api.OpenModel() → extractModel()
                                                           → StreamAllMeshes() → buildTypedArrayBatch()
                                                           → postMessage(batch, [batch.positions, batch.normals, batch.indices])
                                                                       ↓
Main thread:  receive batch → new BufferGeometry() → setAttribute(position) → scene.add(mesh)
```

The critical insight: **`StreamAllMeshes` is synchronous inside the Worker** (off-thread, so it does not block the browser). The Worker streams batches back to the main thread as `Transferable` `Float32Array` objects (zero-copy). The main thread only does the lightweight Three.js object construction.

### IFC-P2.1 — Create IFCGeometryWorker

**New file**: `src/engine/subsystems/import/ifc/workers/IFCGeometryWorker.ts`

This Worker replaces the combined `IfcImporter` + `IfcGeometryRenderer` main-thread pipeline. It handles:

1. **Initialization**: `api.Init()` + `api.SetWasmPath('/wasm/', true)` — done once, cached
2. **Parse**: `api.OpenModel(bytes)` → extract semantic data (storeys, rooms, hierarchy, psets)
3. **Geometry extraction**: `api.StreamAllMeshes()` → build typed array batches

**Message protocol**:

```ts
// Incoming (main → worker):
type WorkerRequest =
  | { type: 'parse'; buffer: ArrayBuffer; options?: IfcParseOptions }
  | { type: 'dispose' }

// Outgoing (worker → main):
type WorkerResponse =
  | { type: 'semantic'; result: IfcImportResult }                    // Phase A: semantic data
  | { type: 'geometry-batch'; batch: GeometryBatch; priority: number } // Phase B: geometry chunks
  | { type: 'geometry-done'; stats: GeometryStats }                  // Phase C: all geometry sent
  | { type: 'error'; message: string; stack?: string }
  | { type: 'progress'; percent: number; stage: string }

interface GeometryBatch {
  positions:  Float32Array;   // vertex positions (x,y,z per vertex)
  normals:    Float32Array;   // vertex normals   (nx,ny,nz per vertex)
  indices:    Uint32Array;    // triangle indices
  color:      [r: number, g: number, b: number, a: number];
  transform:  Float32Array;   // 16-float column-major matrix
  expressID:  number;
  elementType: string;
  storeyName: string;
  psets:      Record<string, Record<string, unknown>>;
}
```

All `Float32Array` and `Uint32Array` objects are sent as `Transferable` objects — zero-copy transfer from Worker heap to main thread heap.

**Priority tiers** for batch ordering:
- Priority 1 (structural shell): `IFCWALL`, `IFCWALLSTANDARDCASE`, `IFCSLAB`, `IFCCOLUMN`, `IFCBEAM`, `IFCROOF`
- Priority 2 (openings): `IFCDOOR`, `IFCWINDOW`, `IFCSTAIR`, `IFCRAILING`
- Priority 3 (MEP + furniture): all remaining types

The Worker emits Priority-1 batches first, then Priority-2, then Priority-3. The main thread can show a usable structural model within seconds while Priority-3 streams in behind.

**Acceptance criteria**:
- Worker produces identical geometry to current `IfcGeometryRenderer.renderFromOpenModel()` (pixel-level comparison in bench)
- Worker transfers typed arrays as Transferable (no `structuredClone` overhead)
- Worker calls `api.CloseModel()` after all geometry is streamed

---

### IFC-P2.2 — Create IFCGeometryRenderer v2 (Main Thread Consumer)

**Modified file**: `src/engine/subsystems/import/ifc/IfcGeometryRenderer.ts`

Add a new `renderFromWorkerBatch()` method alongside the existing `renderFromOpenModel()` (kept for backward compatibility during migration):

```ts
renderFromWorkerBatch(
  batch: GeometryBatch,
  group: THREE.Group,
  materialCache: Map<string, THREE.MeshStandardMaterial>,
): void {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(batch.positions, 3));
  geometry.setAttribute('normal',   new THREE.BufferAttribute(batch.normals,   3));
  geometry.setIndex(new THREE.BufferAttribute(batch.indices, 1));
  // geometry.computeBoundingSphere() — deferred to idle time (see IFC-P3.1)

  const [r, g, b, a] = batch.color;
  const colorKey = `${r.toFixed(3)}:${g.toFixed(3)}:${b.toFixed(3)}:${a.toFixed(3)}`;
  let material = materialCache.get(colorKey);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color: new THREE.Color(r,g,b), opacity: Math.max(0.18, a), transparent: a < 0.99, roughness: 0.62, metalness: 0.04, side: THREE.DoubleSide });
    materialCache.set(colorKey, material);
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.applyMatrix4(new THREE.Matrix4().fromArray(batch.transform));
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData = { id: `ifc-${batch.expressID}`, expressID: batch.expressID, source: 'ifc-import', selectable: true, type: batch.elementType, storeyName: batch.storeyName, psets: batch.psets };
  group.add(mesh);
}
```

**Acceptance criteria**:
- `renderFromWorkerBatch()` creates identical mesh userData to existing path
- No web-ifc API calls on the main thread

---

### IFC-P2.3 — Rewire initUI.ts Import Flow to Use IFCGeometryWorker

**Modified file**: `src/engine/subsystems/initUI.ts`

Replace the current sequential main-thread pipeline with a Worker-driven pipeline:

```ts
// Phase A: send file to worker, get semantic data immediately
const worker = new IFCGeometryWorkerPool().acquire();
worker.postMessage({ type: 'parse', buffer }, [buffer]);  // transfer buffer — zero copy

// Phase B: receive semantic data (fast — no geometry yet)
worker.onmessage = (event) => {
  if (event.data.type === 'semantic') {
    const result = event.data.result;
    // Update progress overlay, start IfcLevelImporter setup
    // User sees storey list, room count, element count immediately
  }
  if (event.data.type === 'geometry-batch') {
    // Enqueue batch for chunked processing in Phase IFC-P3
    geometryQueue.enqueue(event.data.batch, event.data.priority);
  }
  if (event.data.type === 'geometry-done') {
    // All geometry transferred — worker can now CloseModel
    worker.postMessage({ type: 'dispose' });
  }
};
```

**Acceptance criteria**:
- `file.arrayBuffer()` result is transferred to Worker (not copied) via `postMessage([buffer])`
- Zero web-ifc API calls on the main thread after this phase
- `[IFC Import] Semantic data received` log appears within 1.5 s of file open
- Main thread LONGTASK during parse phase: 0 ms (Worker does all WASM work)

---

### IFC-P2.4 — IFCGeometryWorker Pool (Singleton)

**New file**: `src/engine/subsystems/import/ifc/workers/IFCGeometryWorkerPool.ts`

The Worker is expensive to initialize (WASM ~500 ms cold start). Keep one persistent Worker alive between imports:

```ts
export class IFCGeometryWorkerPool {
  private static _instance: Worker | null = null;

  acquire(): Worker {
    if (!IFCGeometryWorkerPool._instance) {
      IFCGeometryWorkerPool._instance = new Worker(
        new URL('./IFCGeometryWorker.ts', import.meta.url),
        { type: 'module' }
      );
    }
    return IFCGeometryWorkerPool._instance;
  }

  dispose(): void {
    IFCGeometryWorkerPool._instance?.terminate();
    IFCGeometryWorkerPool._instance = null;
  }
}
```

Pre-warm the Worker on app startup (during idle time after project load) so WASM is initialized before the first IFC import is attempted.

**Acceptance criteria**:
- Second and subsequent imports skip WASM init (~500 ms savings per import after first)
- Worker is terminated on app unload (no zombie workers)
- Pool handles one import at a time; queues concurrent requests

---

## §4 — Phase IFC-P3: Chunked Streaming & Priority Queue

**Duration**: 4 days  
**Goal**: Convert the synchronous geometry flood into a smooth, frame-budgeted stream that keeps the renderer at ≥ 60 fps throughout import.

### §4.1 — Architecture

After Phase 2, the Worker sends `geometry-batch` messages to the main thread. Without chunked processing, the main thread could still receive 5,500 batches faster than the renderer can process them, creating a queue that causes LONGTASKs during drain.

The solution is a **priority queue + frame-budgeted drain loop**:

```
IFCGeometryWorker  →  geometry-batch messages  →  PriorityGeometryQueue
                                                            ↓
                                              FrameScheduler.scheduleOnce()
                                                            ↓
                                           drain ≤ 150 batches per frame (< 8 ms)
                                                            ↓
                                           Three.js BufferGeometry + scene.add()
                                                            ↓
                                                    GPU upload (next render)
```

### IFC-P3.1 — Priority Geometry Queue

**New file**: `src/engine/subsystems/import/ifc/PriorityGeometryQueue.ts`

```ts
export class PriorityGeometryQueue {
  private readonly _queues: [GeometryBatch[], GeometryBatch[], GeometryBatch[]] = [[], [], []];
  private _draining = false;

  enqueue(batch: GeometryBatch, priority: 1 | 2 | 3): void {
    this._queues[priority - 1].push(batch);
    if (!this._draining) this._scheduleDrain();
  }

  private _scheduleDrain(): void {
    this._draining = true;
    getFrameScheduler().scheduleOnce(() => this._drainFrame());
  }

  private _drainFrame(): void {
    const BUDGET_MS = 8;       // half a 60fps frame for geometry work
    const BATCH_SIZE = 150;    // max meshes per drain
    const start = performance.now();
    let processed = 0;

    for (let p = 0; p < 3; p++) {
      while (this._queues[p].length > 0 && processed < BATCH_SIZE) {
        if (performance.now() - start > BUDGET_MS) {
          // Over budget — defer rest to next frame
          getFrameScheduler().scheduleOnce(() => this._drainFrame());
          return;
        }
        const batch = this._queues[p].shift()!;
        this._processBatch(batch);
        processed++;
      }
    }

    const anyRemaining = this._queues.some(q => q.length > 0);
    if (anyRemaining) {
      getFrameScheduler().scheduleOnce(() => this._drainFrame());
    } else {
      this._draining = false;
      this._onComplete?.();
    }
  }
}
```

**Key properties**:
- Never processes more than 8 ms of geometry in a single frame
- Always drains Priority-1 (structural) before Priority-2, Priority-2 before Priority-3
- Yields between every drain cycle, guaranteeing the renderer gets a frame between batches
- The `BATCH_SIZE = 150` limit prevents time overruns from unexpectedly large geometries

**Acceptance criteria**:
- No LONGTASK > 50 ms at any point after T+3 s (structural shell visible)
- FPS stays ≥ 60 fps throughout drain (measured with Chrome DevTools Performance panel)
- Priority-1 elements visible in viewport before Priority-3 elements start loading

---

### IFC-P3.2 — Progress Arc: Structural Shell → Full Model

The progress overlay (already implemented) should reflect the two-stage visible progress:

| Stage | %  | Message | Visible to user |
|---|---|---|---|
| WASM init (Worker) | 0–5% | "Starting IFC engine…" | Spinner |
| Semantic parse | 5–20% | "Reading levels, rooms, elements…" | Spinner |
| Structural shell | 20–60% | "Loading structure (N walls, N slabs)…" | **Geometry visible** |
| Secondary elements | 60–85% | "Loading openings and finishes…" | More geometry |
| MEP + furniture | 85–98% | "Loading MEP and furniture…" | Full model |
| Interactive | 98–100% | "Making model interactive…" | GPU pick |

Users see geometry within 1.5–3 s and can begin navigation of the structural shell while the rest streams in. This matches the Qonic UX.

---

### IFC-P3.3 — Deferred BoundingSphere Computation

`geometry.computeBoundingSphere()` is called once per mesh in the current implementation. For 5,500 meshes, this adds ~100–200 ms of CPU time during the drain. Defer it to idle time:

```ts
// During drain — skip computeBoundingSphere()
geometry.boundingSphere = null;   // mark as needing computation

// After drain completes — compute in requestIdleCallback batches
requestIdleCallback(() => {
  for (const geometry of pendingBoundingSpheres) {
    geometry.computeBoundingSphere();
  }
}, { timeout: 2000 });
```

**Note**: `requestIdleCallback` must be called via the existing `getFrameScheduler()` abstraction, not directly, per P3.

**Acceptance criteria**:
- Bounding sphere computation does not appear in the critical-path performance trace
- Camera `zoomToAll()` still works correctly after deferred computation completes

---

### IFC-P3.4 — Material Instancing (GPU Draw Call Reduction)

For a typical IFC model with N unique colors and M elements, the current approach creates one `THREE.Mesh` per element. A 5,500-element model with ~200 unique color combinations currently produces 5,500 draw calls (confirmed: `drawCalls:5499` in live logs).

Group meshes by `(color + opacity)` key into `THREE.InstancedMesh`:

```ts
// Group all batches by color key during drain
const instanceGroups = new Map<string, GeometryBatch[]>();
for (const batch of allBatches) {
  const key = batchColorKey(batch);
  (instanceGroups.get(key) ?? instanceGroups.set(key, []).get(key)!).push(batch);
}

// Create one InstancedMesh per color group
for (const [key, batches] of instanceGroups) {
  const instanced = new THREE.InstancedMesh(sharedGeometry, material, batches.length);
  batches.forEach((b, i) => instanced.setMatrixAt(i, new THREE.Matrix4().fromArray(b.transform)));
  scene.add(instanced);
}
```

**Expected result**: 5,499 draw calls → ~50–200 draw calls for a typical IFC model (25–100× reduction). This directly improves FPS during and after import.

**Caveat**: Instanced meshes cannot have per-instance `userData` for selection. The selection system must maintain a separate `expressID → instanceIndex` lookup map. This is compatible with the existing GPU-pick approach which already uses `expressID` as the mesh ID.

**Acceptance criteria**:
- `drawCalls` after full model load: < 500 (down from 5,499)
- GPU pick still resolves to correct `expressID` on click
- Element highlight works per-instance via `instanced.setColorAt()`

---

### IFC-P3.5 — Shared Geometry Detection for Repeated Elements

Many IFC models contain hundreds of identical windows, doors, or structural members with the same geometry but different placements. Detect geometry identity by SHA-256 of vertex data (already implemented in `tier2-proxy.ts::computeGeometryHash()`):

```ts
const hash = computeGeometryHash(() => batch.positions);
if (geometryCache.has(hash)) {
  // Reuse cached BufferGeometry — just create a new Matrix4 for placement
} else {
  geometryCache.set(hash, createBufferGeometry(batch));
}
```

**Expected result**: A model with 200 identical window frames reuses 1 `BufferGeometry` instead of creating 200. Significant memory savings on models with repetitive elements.

**Acceptance criteria**:
- `GPU Monitor geometries:N` is ≤ (unique geometry count + 10%) for any IFC model
- Cache hit rate logged in OTel span as `pryzm.ifc.geometry_cache_hits`

---

## §5 — Phase IFC-P4: CommandBus Integration & Undo

**Duration**: 5 days  
**Goal**: Bring IFC import into full P6 compliance. Every scene mutation flows through CommandBus. IFC imports become undoable, CRDT-replayable, and OTel-traced.

### IFC-P4.1 — Design: IFCSceneStore (L3)

IFC geometry state is currently held only in `window.ifcModelStore` and the Three.js scene graph. A new `IFCSceneStore` at L3 (`packages/stores/src/IFCSceneStore.ts`) owns the canonical IFC scene state:

```ts
interface IFCSceneState {
  models: Map<string, IFCModelRecord>;
}

interface IFCModelRecord {
  modelId: string;
  fileName: string;
  elementCount: number;
  storeys: IfcStoreyRecord[];
  uploadId?: string;         // server-side upload record ID
  crsRecord?: IfcProjectedCRSRecord;
  importedAt: number;        // epoch ms
}
```

`IFCSceneStore` does NOT hold geometry data (Three.js objects are scene-side). It holds the declarative record of which IFC models are currently loaded. This is the CRDT-syncable payload.

---

### IFC-P4.2 — ImportIfcModelCommand

**New files**:
- `packages/command-bus/src/commands/ImportIfcModelCommand.ts` (command type)
- `plugins/ifc-import/src/handlers/ImportIfcModelHandler.ts` (command handler)

```ts
// Command
export interface ImportIfcModelPayload {
  fileBuffer:    ArrayBuffer;
  fileName:      string;
  projectId:     string;
  importMode:    'reference' | 'native';
  addLevels:     boolean;
  modelId:       string;      // pre-generated by caller
}

// Handler affectedStores = ['IFCSceneStore', 'LevelStore', 'PlanViewStore']
// Handler responsibilities:
//   1. Dispatch to IFCGeometryWorker (Phase 2 pipeline)
//   2. On geometry-done: commit IFCModelRecord to IFCSceneStore
//   3. If addLevels: dispatch AddLevelCommand + CreatePlanViewCommand per storey
//   4. Emit runtime.events.emit('ifc.modelImported', result)
//   5. Trigger background server upload
```

**Critical design rule**: The handler owns the full import lifecycle. `initUI.ts` drops to a thin dispatcher that prepares the payload and fires the command. The 2,889-line `initUI.ts` IFC block shrinks to ~50 lines.

**Acceptance criteria**:
- `commandBus.executeCommand('import.ifcModel', payload)` is the single entry point
- Import appears in `RingBufferUndoStack` as a reversible command
- `RemoveIfcModelCommand` (inverse) disposes geometry and removes `IFCSceneStore` record
- `affectedStores` declared correctly; `check-otel-spans.ts` gate passes

---

### IFC-P4.3 — CRDT Delta for IFC Model References

IFC geometry cannot be CRDT-synced (it is too large for Yjs documents). What CAN be synced is the `IFCModelRecord` — the declaration that a given `uploadId` is currently loaded in the project.

When a collaborator's CRDT sync delivers an `IFCModelRecord` for a model not yet in the local scene, the runtime:
1. Fetches the IFC binary from the server (`/api/projects/:id/ifc-uploads/:uploadId/data`)
2. Re-runs the import pipeline (reference mode, no dialog)
3. Commits the `IFCModelRecord` to local `IFCSceneStore`

This is exactly what `_restoreIfcUploads()` already does on project open — it just needs to be wired to the CRDT sync layer rather than the project-open event.

**Acceptance criteria**:
- Opening a project that another collaborator has loaded an IFC into automatically downloads and renders the IFC
- No duplicate downloads if the model is already in the scene

---

### IFC-P4.4 — IFC Import Undo

`RemoveIfcModelCommand` is the inverse of `ImportIfcModelCommand`:

```ts
// RemoveIfcModelCommand
// affectedStores = ['IFCSceneStore', 'LevelStore', 'PlanViewStore']
// execute():
//   1. Dispose Three.js group (IFC-P1.5 dispose method)
//   2. Unregister from IFCSceneStore
//   3. Remove IFC-derived levels from LevelStore
//   4. Remove IFC-derived plan views from PlanViewStore
//   5. Delete server upload (background)
//   6. Emit 'ifc.modelRemoved' event
```

**Acceptance criteria**:
- `Ctrl+Z` after IFC import removes the model and all derived levels/views
- `Ctrl+Y` after undo re-imports the model from cached Worker state
- Undo entry visible in history panel

---

## §6 — Phase IFC-P5: Navigation Excellence

**Duration**: 5 days  
**Goal**: Deliver Qonic-class storey navigation — instant storey isolation via clip planes, smooth floor plan views, ghost-mode for context, and element selection that responds in < 16 ms.

### IFC-P5.1 — Fix CreatePlanViewCommand Root Cause (Architectural)

This is the architectural completion of IFC-P1.3. After IFC-P1.3 removes the OBC guard, this sub-phase ensures the plan view system correctly handles IFC-imported geometry.

A PRYZM plan view for an IFC storey requires:
1. **Clip plane** at storey elevation and elevation + height
2. **Orthographic camera** positioned at storey centroid
3. **Edge projection** via `EdgeProjectorService` — already handles `userData.source === 'ifc-import'` groups (confirmed at line 1835)
4. **Element listing** — IFC elements at this storey from `IfcModelStore.getElementsByStorey()`

**New**: `IFCPlanViewProvider` (`src/engine/subsystems/views/IFCPlanViewProvider.ts`) that implements the PRYZM-native plan view contract for IFC geometry:

```ts
export class IFCPlanViewProvider {
  createForStorey(levelId: string, storey: IfcStoreyRecord): PlanView {
    return {
      id: `ifc-plan-${levelId}`,
      name: `${storey.name} — Floor Plan`,
      levelId,
      clipMin: storey.elevation - 0.1,
      clipMax: storey.elevation + storey.height - 0.1,
      camera: 'orthographic',
      elementSource: 'ifc',
    };
  }
}
```

**Acceptance criteria**:
- All IFC storey levels get plan views created on import
- Switching to an IFC plan view clips the viewport to that storey within 16 ms
- Floor plan renders correctly via `EdgeProjectorService`

---

### IFC-P5.2 — Clip-Plane Storey Isolation

The clip plane approach is the correct architecture for storey isolation (used by Revit, Archicad, Qonic). Unlike geometry hiding (toggling mesh visibility), clip planes:
- Execute on the GPU in the vertex shader — zero CPU cost
- Transition instantly (single frame)
- Do not require mesh visibility state management

**Implementation**:

```ts
// IFCStoreyIsolator
export function isolateStorey(
  levelId: string,
  mode: 'full' | 'ghost',
  scene: THREE.Scene,
  renderer: THREE.WebGPURenderer,
): void {
  const level = levelStore.getById(levelId);
  const clipMin = level.elevation;
  const clipMax = level.elevation + level.height;

  // Set global clip planes on the renderer
  renderer.clippingPlanes = [
    new THREE.Plane(new THREE.Vector3(0, -1, 0), clipMax),  // clip above
    new THREE.Plane(new THREE.Vector3(0,  1, 0), -clipMin), // clip below
  ];

  if (mode === 'ghost') {
    // Other-storey geometry rendered at 15% opacity (context)
    // This-storey geometry at 100% opacity
    // Achieved via material opacity modulation — not clip planes
  }
}
```

**Ghost mode** (context-aware storey isolation, a Qonic differentiator):
- The active storey renders at 100% opacity, fully interactive
- Adjacent storeys render at 15% opacity, providing spatial context without clutter
- Upper storeys render at 10% opacity (roof context)
- Ghost mode toggles with a single keyboard shortcut

**Acceptance criteria**:
- Storey switch (click in view browser → viewport clipped): < 16 ms measured in DevTools
- Ghost mode correctly differentiates active storey from context
- No CPU work on storey switch (GPU-only clip planes)

---

### IFC-P5.3 — IFC Element Properties Panel

When an IFC element is selected via GPU pick, its `psets` are already in `mesh.userData.psets`. Surface these in a dedicated panel:

```
IFC Element Inspector Panel:
┌─────────────────────────────────┐
│ IfcWall  — Office South Wall    │
│ Express ID: 262551              │
├─────────────────────────────────┤
│ ▾ Pset_WallCommon               │
│   IsExternal: true              │
│   LoadBearing: true             │
│   FireRating: 90 min            │
├─────────────────────────────────┤
│ ▾ Pset_BuildingElement          │
│   Reference: TW-100             │
└─────────────────────────────────┘
```

This panel already exists in the `ifc-inspector` plugin skeleton. Wire it to the GPU-pick selection event.

**Acceptance criteria**:
- Clicking an IFC element opens the properties panel with all psets within 1 frame
- Panel is searchable by property name
- "Copy GlobalId" button available for BCF round-trip

---

### IFC-P5.4 — Storey Navigation Panel

Add a dedicated storey navigator in the left sidebar showing the IFC building hierarchy:

```
IFC Models
└── Office Building.ifc  (1,247 elements)
    ├── Ground Floor      (312 elements)  [eye icon]  [camera icon]
    ├── 02 - Floor        (298 elements)  [eye icon]  [camera icon]
    ├── 03 - Floor        (298 elements)  [eye icon]  [camera icon]
    ├── Roof              (219 elements)  [eye icon]  [camera icon]
    └── Parapet           (120 elements)  [eye icon]  [camera icon]
```

- **Eye icon**: Toggle storey visibility (show/hide)
- **Camera icon**: Jump to storey floor plan view (clip + camera)
- Element counts loaded from `IfcModelStore`

**Acceptance criteria**:
- Navigator panel appears immediately after import (populated from semantic data, before geometry finishes loading)
- Storey visibility toggle executes in < 16 ms (clip plane change)
- Camera jump to storey: camera animates to orthographic floor plan in < 300 ms

---

### IFC-P5.5 — Section Box Support for IFC Models

A section box (axis-aligned bounding box clip) is the second most-used navigation tool in BIM viewers after storey isolation. Implement via six clip planes:

```ts
export function setSectionBox(
  box: THREE.Box3,
  scene: THREE.Scene,
): void {
  renderer.clippingPlanes = [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), box.max.x),
    new THREE.Plane(new THREE.Vector3( 1, 0, 0),-box.min.x),
    new THREE.Plane(new THREE.Vector3( 0,-1, 0), box.max.y),
    new THREE.Plane(new THREE.Vector3( 0, 1, 0),-box.min.y),
    new THREE.Plane(new THREE.Vector3( 0, 0,-1), box.max.z),
    new THREE.Plane(new THREE.Vector3( 0, 0, 1),-box.min.z),
  ];
}
```

Section box gizmo: a translucent box with drag handles on each face.

**Acceptance criteria**:
- Section box appears on menu action or `Alt+S` shortcut
- All six planes update simultaneously (no per-plane flicker)
- Section box state survives storey switches

---

## §7 — Phase IFC-P6: Plugin Completion

**Duration**: 4 days  
**Goal**: Wire the `plugins/ifc-import/` plugin to the real import infrastructure. Complete the documented plugin architecture for IFC. Move IFC import out of `initUI.ts` entirely.

### IFC-P6.1 — Add `runtime.ifc` Slot to PryzmRuntime

**File**: `packages/runtime-composer/src/composeRuntime.ts`

Add a new `ifc` slot to `PryzmRuntime`:

```ts
export interface PryzmRuntime {
  // ... existing slots ...
  readonly ifc: IfcRuntime;
}

export interface IfcRuntime {
  importFile(file: File, options: IfcImportOptions): Promise<IFCImportResult>;
  removeModel(modelId: string): Promise<void>;
  listModels(): IFCModelRecord[];
  getModelStore(): IFCModelStorePublic;
}
```

`IfcRuntime` is implemented by a new `IfcRuntimeImpl` class in `packages/ifc-host/` (new L4 package, analogous to `ai-host`).

---

### IFC-P6.2 — Create packages/ifc-host/ (L4)

**New package**: `packages/ifc-host/`

This package owns the `IfcRuntimeImpl` — the production implementation of `runtime.ifc`. It:
1. Holds the `IFCGeometryWorkerPool` singleton
2. Dispatches `ImportIfcModelCommand` through the command bus
3. Exposes `importFile()` as the single public API for IFC import
4. Wires progress reporting to the UI via `runtime.events`

This moves all IFC import logic out of the L7.5 transitional zone (`src/`) and into L4, where it belongs architecturally.

**Layer compliance**:
- `ifc-host` imports: `packages/command-bus/` (L1), `packages/stores/` (L3), `packages/frame-scheduler/` (L1)
- No `src/` imports
- Plugins import via `@pryzm/plugin-sdk` facade only

---

### IFC-P6.3 — Wire Plugin Handler to runtime.ifc

**File**: `plugins/ifc-import/src/handlers/pluginHandlers.ts`

With `runtime.ifc` slot available (IFC-P6.1), implement the handler:

```ts
async handle(payload: unknown): Promise<void> {
  const { fileBuffer, fileName, projectId } = payload as { fileBuffer: ArrayBuffer; fileName: string; projectId: string };
  const file = new File([fileBuffer], fileName);
  await runtime.ifc.importFile(file, { mode: 'reference', addLevels: true, projectId });
}
```

**Acceptance criteria**:
- `commandBus.fire({ commandType: 'ifc.import.file', payload: { fileBuffer, fileName, projectId } })` triggers real import
- Plugin tests in `plugins/ifc-import/__tests__/` exercise the full handler path
- UI drop zone and plugin handler both use the same `runtime.ifc.importFile()` entry point

---

### IFC-P6.4 — Migrate initUI.ts IFC Block → runtime.ifc.importFile()

**File**: `src/engine/subsystems/initUI.ts`

The ~400-line IFC import block in `initUI.ts` (lines 1119–1510) is replaced with a 5-line call:

```ts
// In the file drop / import button handler:
const result = await runtime.ifc.importFile(file, {
  mode: importMode,
  addLevels,
  projectId: window.currentProjectId,
});
showImportSuccessToast(result);
```

This reduces `initUI.ts` by ~400 lines and moves the complexity into the correct architectural layer.

**Acceptance criteria**:
- `initUI.ts` IFC section is ≤ 20 lines after migration
- All existing import functionality preserved (reference mode, native mode, add levels, server upload, progress overlay, GPU pick)
- `initUI.ts` total LOC decreases by ≥ 380 lines

---

## §8 — Phase IFC-P7: Storage, Round-Trip & Observability

**Duration**: 4 days  
**Goal**: Close the C05 §2.2 round-trip violation, fix server storage, complete OTel coverage, and address security findings.

### IFC-P7.1 — Embed IFC in .pryzm ZIP (C05 §2.2, Differentiator D1)

**Files**: `packages/file-format/src/`, `packages/ifc-host/src/`

On every project save where an IFC model is loaded, write the IFC binary into the `.pryzm` ZIP container at `ifc/source.ifc`:

```ts
// In PryzmFileWriter.write():
const ifcModels = runtime.ifc.listModels();
for (const model of ifcModels) {
  const binary = await runtime.ifc.getModelBinary(model.modelId);
  zip.file(`ifc/${model.modelId}.ifc`, binary);
}
```

On project open:
```ts
// In PryzmFileReader.open():
const ifcEntries = zip.folder('ifc')?.files ?? {};
for (const [path, entry] of Object.entries(ifcEntries)) {
  const buffer = await entry.async('arraybuffer');
  await runtime.ifc.importFile(new File([buffer], path), { mode: 'reference', fromSavedProject: true });
}
```

This makes the `.pryzm` file self-contained — sharing it includes the IFC geometry. It closes Differentiator D1 properly.

**Size management**: IFC files in `.pryzm` are compressed via `zip.file(..., binary, { compression: 'DEFLATE', compressionOptions: { level: 3 } })`. A 38 MB IFC typically compresses to 8–12 MB (DEFLATE compression ratio ~3:1 for STEP text format). The `.pryzm` file size is manageable.

**Acceptance criteria**:
- `pryzm unzip project.pryzm | ls ifc/` shows `*.ifc` file present
- Opening a `.pryzm` file that contains an IFC auto-loads the geometry (no network call)
- `apps/bench/src/benches/ifc-import-tier1.bench.ts` round-trip test passes

---

### IFC-P7.2 — Mandatory Supabase Storage Path (PERF-03, SEC-01)

**File**: `server/ifcStorageService.js`

The base64 DB fallback path is a performance and scalability antipattern. Deprecate it:

```js
// New behavior:
if (!uploaded) {
  if (fileSize <= 1 * 1024 * 1024) {
    // Only keep base64 for tiny files (< 1 MB) — test fixtures, etc.
    fileData = fileBuffer.toString('base64');
    uploadStatus = 'complete_db_fallback';
  } else {
    // For production files, fail clearly rather than silently degrade
    uploadStatus = 'failed_no_storage';
    console.error(`[ifcStorageService] Supabase Storage not configured. Files > 1 MB require SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY environment variables.`);
  }
}
```

Add a startup check that warns operators:
```js
// In server.js startup:
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[IFC Storage] ⚠ Supabase Storage not configured. IFC uploads > 1 MB will fail. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.');
}
```

**Acceptance criteria**:
- Files > 1 MB produce a clear user-facing error when Supabase is not configured
- Files < 1 MB continue to work via DB fallback
- Production deployments with Supabase configured: all files use binary CDN path
- Model restore uses signed URL → binary stream (not base64 JSON)

---

### IFC-P7.3 — Null _capturedBuffer After Upload Dispatch (PERF-02, MEM-04)

**File**: `src/engine/subsystems/initUI.ts`

```ts
_uploadIfcToServer(file.name, _capturedBuffer, elementCount, modelId)
  .catch(err => console.warn('[IFC Storage] Background upload failed:', err));

// ADD THIS:
_capturedBuffer = null;   // allow GC — 38 MB freed immediately after upload starts
```

**Acceptance criteria**:
- Memory profile shows 38 MB buffer freed within 1 GC cycle after upload dispatch

---

### IFC-P7.4 — Complete OTel Span Chain (C10 §2.2, R20–R22)

**Target span tree**:

```
pryzm.ifc.import [project_id, user_id, file_name, file_size_bytes]
  ├─ pryzm.ifc.worker.parse [element_count, storey_count]
  ├─ pryzm.ifc.geometry.stream [mesh_count, triangle_count, batch_count]
  │    ├─ pryzm.ifc.geometry.drain [priority=1, batch_count, elapsed_ms]
  │    ├─ pryzm.ifc.geometry.drain [priority=2, ...]
  │    └─ pryzm.ifc.geometry.drain [priority=3, ...]
  ├─ pryzm.ifc.levels.import [levels_created, views_created, skipped]
  ├─ pryzm.ifc.storage.upload [upload_id, storage_backend, file_size_bytes]
  └─ pryzm.ifc.interactive [selectable_count, elapsed_total_ms]
```

**Worker context propagation**: The trace context must be propagated across the Worker boundary:
```ts
// Main thread → Worker:
const { context, propagator } = getOTelContext();
const headers: Record<string, string> = {};
propagator.inject(context, headers);
worker.postMessage({ type: 'parse', buffer, traceHeaders: headers }, [buffer]);

// Worker:
const context = propagator.extract(ROOT_CONTEXT, event.data.traceHeaders);
const span = tracer.startSpan('pryzm.ifc.worker.parse', undefined, context);
```

**Required span attributes** per C10 §2.2:
- All spans: `pryzm.project_id`, `pryzm.user_id`
- Geometry spans: `pryzm.element_count`, `pryzm.mesh_count`
- Command spans: `pryzm.command_type`
- All error conditions: `error: true`

**Acceptance criteria**:
- `scripts/ci-check-spans.ts` reports 0 violations for all ifc-import exported functions
- OTel trace shows complete parent–child span chain from file open to GPU pick ready
- Span durations match DevTools Performance panel timings (± 5%)

---

### IFC-P7.5 — Update NFT-9 Benchmark to Real Path (R08, ARCH-06)

**File**: `apps/bench/src/benches/ifc-import-tier1.bench.ts`

Replace the Worker-only benchmark with an end-to-end measurement of the real pipeline:

```ts
// BEFORE: tests IFCParseWorker only
bench('ifc-import-tier1', async () => {
  const handler = new IFCImportHandler();
  const result = await handler.parseFile(testFile);
  handler.dispose();
});

// AFTER: tests full pipeline from runtime.ifc.importFile() to GPU pick ready
bench('ifc-import-tier1', async () => {
  const result = await runtime.ifc.importFile(testFile50MB, {
    mode: 'reference',
    addLevels: true,
    projectId: 'bench-project',
  });
  expect(result.interactiveAt).toBeLessThan(30_000); // NFT-9: < 30s
  expect(result.firstGeometryAt).toBeLessThan(3_000); // New sub-NFT: structural shell < 3s
});
```

Add two new NFTs:

| # | NFT | Target | Bench |
|---|---|---|---|
| 20 | IFC first geometry (structural shell visible) | < 3 s (50 MB file) | `ifc-import-first-geometry.bench.ts` |
| 21 | IFC storey switch (clip plane) | < 16 ms | `ifc-storey-switch.bench.ts` |

**Acceptance criteria**:
- NFT-9 bench exercises the real `runtime.ifc.importFile()` path
- NFT-20 and NFT-21 added to C10 §1 table and `00-PROCESS-TRACKER.md`
- All three benches run in CI on every merge to main

---

### IFC-P7.6 — Security Hardening (SEC-01–03)

**SEC-01** — Auth token migration from `localStorage`:
- Phase 7 adds `httpOnly` cookie support to the auth middleware
- Client sends `credentials: 'include'` instead of `Authorization: Bearer` header
- `localStorage.getItem('bim-platform-token')` calls in `initUI.ts` updated to cookie-based auth

**SEC-02** — Server-side elementCount validation:
```js
// In POST /api/projects/:id/ifc-uploads handler:
const elementCount = Math.max(0, Math.min(parseInt(req.body.elementCount ?? '0', 10) || 0, 10_000_000));
```

**SEC-03** — IFC magic bytes check:
```js
// In multer fileFilter:
if (file.originalname.toLowerCase().endsWith('.ifc')) {
  cb(null, true);
} else {
  cb(new Error('Only .ifc files are accepted'));
}
// In route handler, after file received:
const magic = req.file.buffer.slice(0, 11).toString('utf8');
if (!magic.startsWith('ISO-10303-21') && !magic.startsWith('FILE_DESCRIPTION')) {
  return res.status(400).json({ error: 'File does not appear to be a valid IFC STEP file.' });
}
```

**Acceptance criteria**:
- Auth token not in `localStorage` post-Phase-7
- Malformed IFC files (wrong magic bytes) rejected with HTTP 400
- `elementCount` validated server-side; no integer overflow possible

---

## §9 — GA Gate Additions

The following new GA gates are added by this plan and tracked in `00-PROCESS-TRACKER.md`:

| Gate | Condition | Added in |
|---|---|---|
| Zero LONGTASKs > 50 ms during IFC drain | `tools/ga-gate/check-ifc-longtasks.ts` | IFC-P3 |
| NFT-20 structural shell < 3 s | `ifc-import-first-geometry.bench.ts` | IFC-P7 |
| NFT-21 storey switch < 16 ms | `ifc-storey-switch.bench.ts` | IFC-P7 |
| Plan views created = levels created | `check-ifc-plan-views.ts` | IFC-P1 |
| WASM CloseModel always called | Unit test in IFCParseWorker.test.ts | IFC-P1 |
| IFC in .pryzm ZIP | `check-ifc-roundtrip.ts` | IFC-P7 |
| OTel span chain complete | Existing `check-otel-spans.ts` extended | IFC-P7 |
| `ifc-host` package L4 boundary | Existing `check-l7-boundary.ts` extended | IFC-P6 |

---

## §10 — Dependency Graph & Sequencing

```
IFC-P1 (bugs) ─────────────────────────────────────────────── UNBLOCKED
IFC-P2 (off-thread) ───────────────────────────────────────── UNBLOCKED (parallel with P1)
IFC-P3 (chunked) ──────── requires IFC-P2 complete
IFC-P4 (CommandBus) ──── requires IFC-P2 complete, IFC-P1.3 complete
IFC-P5 (navigation) ──── requires IFC-P1.3 complete
IFC-P6 (plugin) ─────── requires IFC-P4 complete (runtime.ifc slot)
IFC-P7 (storage) ──────── requires IFC-P4 complete (IFCSceneStore)
                          parallel with IFC-P5, IFC-P6
```

**Sprint schedule (2 engineers)**:

| Week | Engineer A | Engineer B |
|---|---|---|
| 1 | IFC-P1 (all 7 sub-phases) | IFC-P2.1 + IFC-P2.2 (Worker + Renderer v2) |
| 2 | IFC-P2.3 + IFC-P2.4 (initUI.ts rewire + Pool) | IFC-P3.1 + IFC-P3.2 (Priority queue + progress) |
| 3 | IFC-P3.3 + IFC-P3.4 + IFC-P3.5 (BVH + instancing + cache) | IFC-P4.1 + IFC-P4.2 (IFCSceneStore + command) |
| 4 | IFC-P4.3 + IFC-P4.4 (CRDT + undo) | IFC-P5.1 + IFC-P5.2 (plan views + clip planes) |
| 5 | IFC-P5.3 + IFC-P5.4 + IFC-P5.5 (panels + section box) | IFC-P6.1 + IFC-P6.2 (runtime.ifc + ifc-host pkg) |
| 6 | IFC-P6.3 + IFC-P6.4 (plugin wire + initUI.ts cleanup) | IFC-P7.1–7.3 (ZIP embed + storage + GC) |
| 7 (buffer) | IFC-P7.4–7.6 (OTel + NFTs + security) | NFT verification + performance profiling |

**Total: 7 weeks, 2 engineers.** Phase 1–3 deliver Qonic-level import speed by end of Week 3.

---

## §11 — Audit Finding Closure Matrix

Every finding from `docs/audits/IFC-IMPORT-PIPELINE-AUDIT-2026-05-07.md` is closed by this plan:

| Finding ID | Description | Closed by |
|---|---|---|
| BUG-01 | WASM leak in IFCParseWorker | IFC-P1.1 |
| BUG-02 | 1,867 ms LONGTASK | IFC-P1.2 |
| BUG-03 | Plan views fail "BIM Components not found" | IFC-P1.3 + IFC-P5.1 |
| BUG-04 | Plugin handler is no-op | IFC-P1.4 + IFC-P6.3 |
| ARCH-01/P6 | IFC bypasses CommandBus | IFC-P4.2 |
| ARCH-02 | `window.*` pollution | IFC-P6.4 (shrinks with migration) |
| ARCH-03 | OBC/PRYZM divergence undocumented | IFC-P6.2 (new ADR) |
| ARCH-04 | DOM event bypass | IFC-P1.6 |
| ARCH-05/C05§2.2 | Round-trip not implemented | IFC-P7.1 |
| ARCH-06 | NFT-9 bench wrong path | IFC-P7.5 |
| ARCH-07 | `any` types in IfcLevelImporter | IFC-P1.2 (typed as side-effect) |
| PERF-01 | StreamAllMeshes synchronous | IFC-P2 + IFC-P3 |
| PERF-02 | `_capturedBuffer` not nulled | IFC-P7.3 |
| PERF-03 | 51 MB base64 server restore | IFC-P7.2 |
| PERF-04 | GPU Monitor false positive | IFC-P1.5 (flag added) |
| MEM-01 | WASM leak (same as BUG-01) | IFC-P1.1 |
| MEM-02 | THREE.js geometry not disposed | IFC-P1.5 |
| MEM-03 | IfcModelStore no eviction | IFC-P1.5 |
| MEM-04 | `_capturedBuffer` GC blocked | IFC-P7.3 |
| SEC-01 | Token in localStorage | IFC-P7.6 |
| SEC-02 | Client-supplied elementCount | IFC-P7.6 |
| SEC-03 | No magic bytes check | IFC-P7.6 |
| CONTRACT-01 | C05§2.2 unimplemented | IFC-P7.1 |
| CONTRACT-02 | NFT-9 bench gap | IFC-P7.5 |
| CONTRACT-03 | OTel attributes missing | IFC-P7.4 |

**Total: 25 findings → 25 closures across 7 phases.**

---

## §12 — Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| SharedArrayBuffer requires cross-origin isolation (`COOP/COEP` headers) | High | High | Use `Transferable` typed arrays (not `SharedArrayBuffer`) for IFC-P2; no headers required |
| `web-ifc` WASM path (`/wasm/`) not served from Worker scope | Medium | High | Set `api.SetWasmPath()` with absolute URL in Worker init; test in isolation before integration |
| `InstancedMesh` per-instance selection breaks GPU pick | Medium | Medium | Maintain `expressID → instanceIndex` lookup map; update GPU pick resolver in IFC-P3.4 |
| C05§2.2 ZIP embed increases `.pryzm` file size significantly | Medium | Low | Use DEFLATE compression; 38 MB IFC → ~10 MB in ZIP; acceptable for cloud storage |
| OTel context propagation across Worker postMessage not supported in all browsers | Low | Low | Use W3C Trace Context headers as strings in postMessage payload; widely supported |
| `ifc-host` package L4 boundary adds new import path not yet in lint config | Medium | Low | Add `ifc-host` to `eslint-plugin-boundaries` config in same PR as package creation |
| Supabase Storage unavailability blocks IFC imports in Replit environment | High | Medium | Fall back to in-memory buffer (no DB storage) for files during active session; show operator warning at startup |

---

*Document complete. Next: begin IFC-P1 (critical bug fixes) — all 7 sub-phases are unblocked and can start immediately.*
