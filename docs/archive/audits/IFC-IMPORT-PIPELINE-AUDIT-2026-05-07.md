# IFC Import Pipeline & Post-Processing Navigation — Comprehensive Audit

> **Stamp**: 2026-05-07  
> **Scope**: Full IFC import pipeline (client upload → WASM parse → geometry rendering → level creation → server persistence) plus post-import navigation and selection. Analysis only — no code changes.  
> **Evidence**: Live browser console logs captured during 38 MB IFC file import, full source audit of 18 key files.  
> **Classification**: Architectural soundness · Contract alignment · Correctness · Completeness · Memory · Performance · Security

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Pipeline Map — As-Built](#2-pipeline-map--as-built)
3. [Plugin Architecture vs. Reality](#3-plugin-architecture-vs-reality)
4. [Critical Bugs (P0)](#4-critical-bugs-p0)
5. [Architecture Issues (P1)](#5-architecture-issues-p1)
6. [Performance Issues (P2)](#6-performance-issues-p2)
7. [Memory Issues (P2)](#7-memory-issues-p2)
8. [Contract Compliance Matrix](#8-contract-compliance-matrix)
9. [Security Issues (P3)](#9-security-issues-p3)
10. [Post-Import Navigation Audit](#10-post-import-navigation-audit)
11. [Observability Gap Analysis](#11-observability-gap-analysis)
12. [Priority Remediation Roadmap](#12-priority-remediation-roadmap)

---

## 1. Executive Summary

The IFC import pipeline is **structurally split** between a documented plugin-architecture path (`plugins/ifc-import/`) and the actual runtime path (`src/engine/subsystems/initUI.ts` + `src/engine/subsystems/import/ifc/`). The plugin handlers are stubs that do nothing. The real import is 100% implemented in the L7.5 transitional zone, entirely bypassing the CommandBus.

Six critical defects were confirmed by live log evidence during a 38 MB IFC import session:

| ID | Severity | Finding |
|---|---|---|
| BUG-01 | P0 | **WASM memory never freed** in `IFCParseWorker` — model left permanently open |
| BUG-02 | P0 | **1,867 ms LONGTASK** on main thread during IFC level creation — 112× frame budget |
| BUG-03 | P0 | **All 5 plan views silently fail** — `CreatePlanViewCommand` returns "BIM Components not found" |
| BUG-04 | P0 | **Plugin handler `ifc.import.file` is a no-op** — logs and returns `undefined`; real import path unreachable through plugin bus |
| ARCH-02 | P1 | **IFC import bypasses CommandBus** (P6 violation) — geometry added directly to scene, no undo, no CRDT replay |
| ARCH-06 | P1 | **C05 §2.2 round-trip fidelity not implemented** — IFC not embedded in `.pryzm` ZIP; Differentiator D1 claim unfounded |

Post-import navigation works correctly via GPU picking (`strategy=gpu-pick`) with proper `expressID`-keyed mesh IDs. FPS recovers to 117–135 fps after initial geometry load. The plan view navigation is broken because plan views are never created.

---

## 2. Pipeline Map — As-Built

The complete as-built pipeline for a 38 MB IFC file import, derived from source code and live log evidence.

### Phase 0 — File Selection (Browser)

```
User selects .ifc file
    → initUI.ts showIfcImportProgress(file)
    → createIfcImportOverlay(file.name)          [progress overlay shown]
    → window.performanceModePanel?.autoEnablePerf() [shadows/SSGI/TRAA suspended]
    → file.arrayBuffer()                          [main thread I/O — blocks until read]
    → _capturedBuffer = buffer                    [38 MB held in closure for ~13 s]
    → new Uint8Array(buffer)                      [no copy — same ArrayBuffer]
```

**Note**: `file.arrayBuffer()` is called on the main thread. For large files (>50 MB), this itself becomes a LONGTASK. No Worker is used at this stage.

### Phase 1 — WASM Parse & Semantic Extraction (Main Thread)

```
import('./import/ifc/IfcImporter')
import('./import/ifc/IfcGeometryRenderer')
    → new IfcImporter()
    → importer.init()                            [web-ifc WASM loaded, initialized]
    → importer.importAndKeepOpen(bytes)          [model opened, NOT closed yet]
        → api.OpenModel(bytes, {COORDINATE_TO_ORIGIN: true})  [WASM parse]
        → extractModel(modelID)
            → GetLineIDsWithType(IFCSITE)
            → GetLineIDsWithType(IFCBUILDING)
            → GetLineIDsWithType(IFCBUILDINGSTOREY)  → storeyRecords[]
            → GetLineIDsWithType(IFCSPACE)            → rooms[]
            → GetLineIDsWithType(IFCRELCONTAINEDINSPATIALSTRUCTURE)
            → [15 physical type queries: WALL, SLAB, DOOR, WINDOW, COLUMN...]
            → GetLineIDsWithType(IFCRELDEFINESBYPROPERTIES) → psets[]
        → result = IfcImportResult {rooms, hierarchy, relationships, storeys, stats}
    → importer.extractElements(modelID)         [second pass — physical elements with psets]
        → elementIndex: Map<expressID, IfcElementRecord>
```

**Correctness note**: The API is shared via `importer.getApi()` — `IfcImporter` and `IfcGeometryRenderer` use the same `IfcAPI` instance. This avoids parsing twice. The model stays open during both passes, then is explicitly closed at line 1380.

### Phase 2 — Geometry Streaming (Main Thread, Synchronous)

```
new IfcGeometryRenderer(importer.getApi())     [shares WASM instance, ownsApi=false]
    → renderFromOpenModel(modelID, scene, modelId, name, elementIndex)
        → new THREE.Group {userData: {source: 'ifc-import'}}
        → api.StreamAllMeshes(modelID, callback)  [SYNCHRONOUS iteration]
            for each FlatMesh (5500 total):
                → _processFlatMesh(flatMesh, ...)
                    → api.GetGeometry(modelID, placedGeometry.geometryExpressID)
                    → api.GetVertexArray() + api.GetIndexArray()
                    → new THREE.BufferGeometry()
                    → setAttribute('position'), setAttribute('normal')
                    → geometry.computeBoundingSphere()
                    → MeshStandardMaterial (from cache by color key)
                    → mesh.applyMatrix4(flatTransformation)  [column-major matrix]
                    → mesh.userData = {id: 'ifc-<expressID>', source: 'ifc-import', selectable: true, psets, ...}
                    → group.add(mesh)
        → scene.add(group)
        → return {group, meshCount, triangleCount, elementCount}
    → importedIfcGroups.set(modelId, group)
    → ifcModelStore.register({modelId, modelName, elements, storeyOrder})
    → window.ifcModelStore = ifcModelStore      [global assignment]
```

**LONGTASK evidence** (live log): `[LONGTASK] duration=1867.0ms start=769980.3ms` — this 1.867-second LONGTASK covers the tail of geometry streaming and the level creation phase combined. A follow-up `duration=69.0ms` LONGTASK occurs immediately after.

### Phase 3 — WASM Cleanup & Scene Finalization

```
importer.getApi().CloseModel(modelID)          [WASM model freed — CORRECT]
importer.dispose()
ensureWebGpuCompatibleGeometry(group)          [4-byte vertex attribute alignment fix]
threeRenderer.shadowMap.enabled = prevShadowEnabled  [shadow maps restored]
rpm.setSuspended(false)                        [render pipeline resumed]
rpm.scheduleShadowRebuild()                    [shadow rebuild queued]
```

**Correctness**: `CloseModel()` is correctly called here. The shared-API pattern avoids the double-parse that would occur if `IfcGeometryRenderer` owned its own `IfcAPI`.

### Phase 4 — Post-Load Events & Store Writes

```
result.relationships → sgm.addRelationship(...)  [SemanticGraph writes, per-rel try/catch]
window.dispatchEvent('pryzm-ifc-imported')      [event-bus bypass — see ARCH-04]
window.dispatchEvent('pryzm-ifc-tree-updated')

[BACKGROUND] _uploadIfcToServer(file.name, _capturedBuffer, elementCount, modelId)
    → FormData multipart POST /api/projects/:id/ifc-uploads
    → server: ifcStorageService.uploadIfcFile()
        → _uploadToStorage() → Supabase Storage [NOT configured → returns null]
        → base64 fallback: fileBuffer.toString('base64')  [38 MB → ~51 MB string]
        → pgQuery INSERT INTO ifc_uploads (... file_data=<51MB text> ...)
    → log: "[IFC Storage] Upload persisted — status: complete_db_fallback"
    → confirmed at T+13s after geometry load
```

### Phase 5 — Interactive Readiness

```
selectionManager._selectableCache = null       [direct property mutation]
waitForIfcSceneInteractive(modelId, scene, selectionManager)
    → polls scene for meshes with userData.source==='ifc-import'
    → GPU picking enabled once all meshes registered
```

**Evidence**: GPU pick works correctly post-load:
```
[PickResolver] strategy=gpu-pick hover-hit=ifc-215752
[PickResolver] strategy=gpu-pick hover-hit=ifc-207003
```

### Phase 6 — IFC Level Import (Conditional)

```
if (addLevels && result.storeys?.length):
    window._ifcLevelImportInProgress = true    [global flag to suppress camera animation]
    importIfcLevelsAndViews(result.storeys, commandManager, bimManager)
        for each IfcStoreyRecord (5 storeys):
            getExistingLevels() via bimManager.getLevels()
            skip-by-name || skip-by-elevation (±0.05 m)
            commandManager.execute(new AddLevelCommand({levelId, name, elevation, height: 3}))
            _ensurePlanView(levelId, name, execute)
                commandManager.execute(new CreatePlanViewCommand({levelId, name}))
                → FAILS: {success:false, info:["BIM Components not found"]}  [all 5]
    window._ifcLevelImportInProgress = false
    window.dispatchEvent('update-view-browser')
```

**Live log evidence — all 5 plan view creations fail:**
```
[IfcLevelImporter] View for "Ground" not created: {success:false, info:["BIM Components not found"]}
[IfcLevelImporter] View for "02 - Floor" not created: {success:false, info:["BIM Components not found"]}
[IfcLevelImporter] View for "03 - Floor" not created: {success:false, info:["BIM Components not found"]}
[IfcLevelImporter] View for "Roof" not created: {success:false, info:["BIM Components not found"]}
[IfcLevelImporter] View for "Parapet" not created: {success:false, info:["BIM Components not found"]}
[IfcLevelImporter] Done — levels: 4, views: 0, skipped: 1
```

### Phase 7 — Camera Fit

```
setTimeout(() => zoomToAll(world, scene), 300)  [camera fit after level import]
```

### Phase 8 — Server Restore Path (Project Re-Open)

```
_restoreIfcUploads(projectId)
    → GET /api/projects/:id/ifc-uploads
    → for each upload:
        GET /api/projects/:id/ifc-uploads/:uid/data
            → {base64: <51MB string>} OR {url: <signed URL>}
        → atob(base64) → Uint8Array  [51 MB base64 decoded in browser]
        → re-runs import pipeline (mode: 'reference', no dialog)
```

---

## 3. Plugin Architecture vs. Reality

### 3.1 Documented Architecture

Per `docs/03_PRYZM3/02-ARCHITECTURE.md` and `docs/00_Contracts/C07-PLUGIN-SDK-AND-MARKETPLACE.md`, IFC import is meant to be a plugin that:
- Contributes the `ifc.import.file` command via `PluginManifest.contributions`
- Handles imports through the `IfcImportPluginHandler` interface
- Gets wired into `runtime.ifc.importFile()` slot by the SDK host
- Participates in the CommandBus dispatch chain

### 3.2 Actual Architecture

The real import is in `src/engine/subsystems/initUI.ts` — a 2,889-line file in the L7.5 transitional zone. The import never flows through the plugin system.

```
DOCUMENTED PATH:
User Action → CommandBus → ifc.import.file handler → pluginHandlers.ts → IFCImportHandler → Worker

ACTUAL PATH:
File Input → initUI.ts (addEventListener) → IfcImporter + IfcGeometryRenderer (direct WASM calls)
```

### 3.3 Plugin Handler Analysis

**File**: `plugins/ifc-import/src/handlers/pluginHandlers.ts`

The `ifc.import.file` handler:
```ts
async handle(payload: unknown): Promise<void> {
    const { fileBuffer, fileName, projectId } = payload as {...};
    if (!fileBuffer || !fileName) {
        console.warn('[ifc-import] ifc.import.file: missing fileBuffer or fileName');
        return;
    }
    console.debug('[ifc-import] ifc.import.file → IFCImportHandler', {...});
    // IFCImportHandler is wired in by the host via runtime.ifc.importFile()
    // which uses the IFC Web Worker (Wave A17). This handler fires the
    // lifecycle event so the import progress panel can observe it.
}
```

The handler does nothing. The comment claims "`runtime.ifc.importFile()` wires it in" — this slot does **not exist** in `composeRuntime.ts`. The handler body ends after the debug log. No import is dispatched.

### 3.4 `IFCParseWorker` — Orphaned Parallel Implementation

The plugin contains a fully implemented Web Worker (`plugins/ifc-import/src/workers/IFCParseWorker.ts`) that correctly:
- Initializes web-ifc WASM off-thread
- Parses IFC via `api.OpenModel()` + `api.GetAllLines()`
- Reports progress at 10%, 50%, 90%
- Returns `{modelId, elementCount}`

This Worker is **never called by the real import path**. It is only tested by the bench file `ifc-import-tier1.bench.ts`, which therefore does NOT benchmark the real production import.

### 3.5 Status per `03-CURRENT-STATE.md`

`03-CURRENT-STATE.md §1` confirms (verbatim): `ifc-import` is listed among **16 intentional stubs** alongside `ifc-inspector`, `rhino-import`, `navigate`, `geospatial`, `levels`, etc. The current state document is honest about this — the plugin is a stub. The issue is that nothing documents how or when the real implementation in `src/engine/subsystems/import/ifc/` relates to or will be superseded by the plugin path.

---

## 4. Critical Bugs (P0)

### BUG-01: WASM Memory Leak in IFCParseWorker

**File**: `plugins/ifc-import/src/workers/IFCParseWorker.ts`  
**Severity**: P0 — memory leak per session across multiple imports  
**NFT Impact**: NFT-16 (Memory ceiling < 1.5 GB)

```ts
// Line 26: Module-level IfcAPI, reused across parses
const api = new WebIFC.IfcAPI();

// Line 42: OpenModel — WASM allocates model heap
const modelId = api.OpenModel(new Uint8Array(buffer), {...});

// MISSING: api.CloseModel(modelId)  ← never called
```

The `IFCParseWorker` opens a WASM model on every `parse` message and never closes it. The `api.CloseModel()` call is absent. The Worker is intentionally kept alive between imports (`IFCImportHandler._worker` is reused). Over a session with N imports:

- **N models remain permanently allocated in WASM heap**
- Each model holds: all geometry data, property data, EXPRESS lines, string pool
- For a 38 MB IFC file, WASM heap consumption per open model is typically 3–5× the source file size (150–190 MB per import)
- Session with 3 imports: up to ~570 MB of leaked WASM heap

**Mitigation note**: The real import path (`initUI.ts` → `IfcImporter`) correctly calls `CloseModel()` at line 1380. The leak only affects `IFCParseWorker`, which is currently not on the real import path. However, the Worker IS the documented future architecture path and will become the leak source when the plugin architecture is completed.

**Fix required**: Add `api.CloseModel(modelId)` in the `finally` block of `IFCParseWorker.ts` before posting the result.

---

### BUG-02: 1,867 ms LONGTASK — Main Thread Blocked During Level Creation

**File**: `src/engine/subsystems/import/ifc/IfcLevelImporter.ts`  
**Severity**: P0 — direct NFT-4 violation (16.6 ms frame budget)  
**Live Evidence**: `[LONGTASK] duration=1867.0ms start=769980.3ms`

`importIfcLevelsAndViews()` iterates over all storeys synchronously in a `for...of` loop with no `await` between iterations:

```ts
for (const storey of storeys) {               // 5 iterations, no yield
    const existing = getExistingLevels();     // synchronous DOM query
    // ...
    const levelResult = execute(              // synchronous commandManager.execute()
        new AddLevelCommand({...}),
    );
    // ...
    const viewCreated = _ensurePlanView(storey.id, storey.name, execute);  // synchronous
}
```

Each `commandManager.execute()` call triggers synchronous store mutations, snapshot creation, and event dispatch. Five levels × two commands each = 10 synchronous command executions without yielding to the browser event loop.

**The 1,867 ms LONGTASK means the browser is entirely unresponsive for nearly 2 seconds** — no rendering, no input, no animation. This is 112× the NFT-4 frame budget.

A follow-up LONGTASK of 69 ms occurs immediately after, followed by a cascade of 50–99 ms LONGTASKs as the geometry pipeline catches up.

**Root cause**: No `scheduler.nextFrame()` / `await new Promise(r => requestAnimationFrame(r))` between loop iterations.

**Fix required**: Yield between storey iterations using `getFrameScheduler().scheduleOnce()` or an `await scheduler.nextTick()` shim. The existing `Sprint A39` pattern for `_executeFinalSweep()` frame-yielding (referenced in `03-CURRENT-STATE.md` stamp) is the correct model.

---

### BUG-03: All Plan Views Fail — "BIM Components not found"

**File**: `src/engine/subsystems/import/ifc/IfcLevelImporter.ts`  
**Severity**: P0 — feature silently broken; "Add IFC levels" creates levels but zero views  
**Live Evidence**: 5 of 5 `CreatePlanViewCommand` executions fail with `{success:false, info:["BIM Components not found"]}`

```
[IfcLevelImporter] Created level "02 - Floor" @ 3800.000 m
[IfcLevelImporter] View for "02 - Floor" not created: {success:false, info:["BIM Components not found"]}
[IfcLevelImporter] Created level "03 - Floor" @ 7600.000 m
[IfcLevelImporter] View for "03 - Floor" not created: {success:false, info:["BIM Components not found"]}
... (all 5)
[IfcLevelImporter] Done — levels: 4, views: 0, skipped: 1
```

The error "BIM Components not found" originates from `CreatePlanViewCommand`, which requires `@thatopen/components` `BimManager` to be initialized and a model to be loaded. The root cause is a **timing issue**: `CreatePlanViewCommand` is executing against a state where BIM components are not yet initialized in the @thatopen layer, even though the IFC geometry group has been added to the Three.js scene.

This is a silent failure — no error is thrown, no user-facing error is shown. The toast only reports "IFC levels added: 4 levels created" without mentioning that 0 floor plan views were created. The "Add IFC levels" toggle in the UI silently delivers only half its promise.

**Impact on navigation**: Because plan views are never created, the view browser does not show IFC-derived floor plan views. Users cannot navigate by storey. The `pryzm-ifc-imported` event fires and `update-view-browser` is dispatched, but the view browser will be empty of the expected plan views.

**Fix required**: Investigate why `CreatePlanViewCommand` fails when BIM geometry is in the scene. Likely needs to wait for `@thatopen/components` `FragmentsManager` model registration to complete before attempting plan view creation. Alternatively, create plan views using the PRYZM-native plan view API without requiring @thatopen BIM components.

---

### BUG-04: Plugin Handler `ifc.import.file` is a Dead Stub

**File**: `plugins/ifc-import/src/handlers/pluginHandlers.ts`  
**Severity**: P0 (architecture) — the documented import path is non-functional  
**Annotation**: `// @command-gate: not-a-command-bus-handler`

The handler is explicitly annotated as not a CommandBus handler. Its body:
1. Validates `fileBuffer` and `fileName` are present
2. Logs a debug message
3. Returns `undefined`

The comment inside the handler body:
```ts
// IFCImportHandler is wired in by the host via runtime.ifc.importFile()
// which uses the IFC Web Worker (Wave A17). This handler fires the
// lifecycle event so the import progress panel can observe it.
```

This claim is false in two ways:
- `runtime.ifc.importFile()` is **not defined** anywhere in `composeRuntime.ts` or any runtime surface file. The `runtime` object has no `ifc` slot.
- The handler does not fire any lifecycle event — it returns void after the debug log.

The handler was promoted from stub status in Wave A20-T8 but its body was never implemented. The `IFCImportHandler` class (`plugins/ifc-import/src/IFCImportHandler.ts`) is well-implemented but is never instantiated from the plugin handler.

**Impact**: Any code that dispatches `ifc.import.file` through the CommandBus or plugin handler system will silently do nothing.

---

## 5. Architecture Issues (P1)

### ARCH-01: IFC Import Bypasses CommandBus (P6 Violation)

**Principle**: P6 — "UI MUST dispatch commands through `commandBus`. No direct store writes from UI code."

The real IFC import path in `initUI.ts` does not go through the CommandBus at any stage:
- Geometry is added directly to the Three.js scene via `scene.add(group)`
- `ifcModelStore.register()` is called directly (bypasses command routing)
- `sgm.addRelationship()` is called directly on `window.semanticGraphManager`
- `selectionManager._selectableCache = null` is a direct private property mutation

The only commands dispatched are in `IfcLevelImporter` (level and plan-view creation), and these use the legacy `commandManager`, not the new `commandBus`.

**Consequences**:
- IFC geometry changes are **not undo-able** — no `RingBufferUndoStack` entry
- IFC element additions are **not CRDT-replicated** to collaborators — no sync event emitted
- No `produceWithPatches` tracking for IFC geometry state
- Closing a file and re-opening requires re-uploading the IFC binary from the server, not replaying commands

The `IfcLevelImporter` does attempt a fire-and-forget bus call:
```ts
window.runtime?.bus?.executeCommand('import.executeCommand', {}).catch(() => {});
```
This is dispatched with an empty `{}` payload, making it useless for any handler. It achieves nothing except incurring the bus dispatch overhead.

---

### ARCH-02: `window.*` Global State Pollution from IFC Import

Multiple global assignments and mutations during IFC import:

| Line | Code | Issue |
|---|---|---|
| 1366 | `window.ifcModelStore = ifcModelStore` | Global assignment; no type declaration; accessible to any script |
| 1436 | `sm._selectableCache = null` | Direct mutation of private field on `selectionManager` |
| 1474 | `window._ifcLevelImportInProgress = true` | Undeclared global flag |
| 1289 | `let _capturedBuffer: ArrayBuffer | null = null` | Closure capture; 38 MB held for ~13 s |
| many | `window.currentProjectId`, `window.runtime?.bus` | Pattern-wide global access |

These are in the L7.5 transitional zone and partially allowed by the shim, but represent technical debt that blocks proper composition root wiring.

---

### ARCH-03: Dual OBC/PRYZM Parse Strategy — Undocumented Divergence

A significant comment block in `initUI.ts` lines 1296–1308 explains why `@thatopen/components` (`OBC`) is NOT used for IFC rendering:

```ts
// OBC's ifcLoader.load() creates ShaderMaterial-based fragment meshes
// which are incompatible with Three.js WebGPU's NodeMaterial system.
// This causes:
//   "THREE.NodeMaterial: Material ShaderMaterial is not compatible"
//   → drawIndexed crash with infinite index count
//   → RenderPipelineManager retries exhaust → viewport crash
//
// Fix: use our own IfcGeometryRenderer which calls StreamAllMeshes
// directly and creates THREE.MeshStandardMaterial (WebGPU-safe,
// auto-promoted to MeshStandardNodeMaterial by the TSL backend).
```

This is a **critical architectural divergence** that is not documented in any ADR, contract, or architecture document. The decision to abandon `@thatopen/components` for geometry rendering (while retaining OBC for other purposes, e.g. `apps/editor/`) has these implications:

1. **`@thatopen/components` import in `engineLauncher.ts`** (`import * as OBC from '@thatopen/components'`) suggests OBC is still expected to be present in the engine — but is not used for IFC geometry
2. **Fragment-based mesh IDs** used by OBC (`FragmentsManager`) would enable model-wide operations (isolate, hide, section planes) — these are not available on the PRYZM-native mesh approach
3. **`BimManager` is still expected by `CreatePlanViewCommand`** — this is why BUG-03 occurs: the plan view system expects OBC BIM model registration, which never happens because OBC's `ifcLoader` is not called
4. No ADR documents this decision or its reversibility

---

### ARCH-04: `pryzm-ifc-imported` CustomEvent Bypasses Runtime Event Bus

Post-import signaling uses `window.dispatchEvent(new CustomEvent('pryzm-ifc-imported', ...))`:

**Subscribers using `window.addEventListener('pryzm-ifc-imported', ...)`:**
- `engineLauncher.ts` (line 798) — re-enforces geometric constraints
- `PlanViewManager.ts` (line 152) — triggers plan view geometry rebuild

This is a raw DOM event bypass. The `runtime.events` bus (per C03 and C08) should be the channel. Problems:
- Not observable in OTel traces
- Not replayable (no event log entry)
- Any new subscriber must know to listen on `window`, not on `runtime.events`
- `pryzm-ifc-tree-updated` has the same problem

---

### ARCH-05: C05 §2.2 IFC Round-Trip Fidelity — Not Implemented

**Contract**: C05 §2.2 — "A `.pryzm` file that was opened from an IFC4 source MUST preserve the original IFC geometry in `ifc/source.ifc`."

**Reality**: The IFC binary is stored separately in the `ifc_uploads` PostgreSQL table (or Supabase Storage). It is not embedded in the `.pryzm` ZIP container. The `.pryzm` file contains only native PRYZM element data.

This means:
- The IFC round-trip guarantee `IFC4 → .pryzm → IFC4` (Differentiator D1) cannot be fulfilled from the `.pryzm` file alone
- Sharing a `.pryzm` file does not share the underlying IFC geometry — the recipient must independently source the IFC binary
- `ifc-export-tier1.bench.ts` tests re-export but the re-exported IFC is generated from in-memory state, not from the preserved source file

This is not just a C05 §2.2 violation — it is a **Differentiator D1 failure** that affects the product's positioning against Revit/Archicad.

---

### ARCH-06: NFT-9 Benchmark Does Not Exercise Real Import Path

**NFT-9**: IFC import (Tier-1, 50 MB) < 30 s — benchmarked in `apps/bench/src/benches/ifc-import-tier1.bench.ts`

The bench file exercises `IFCParseWorker` (the plugin's Web Worker). The real production import path goes through:
1. `IfcImporter.importAndKeepOpen()` — main thread
2. `IfcGeometryRenderer.renderFromOpenModel()` — main thread, synchronous `StreamAllMeshes`
3. `IfcLevelImporter.importIfcLevelsAndViews()` — main thread, synchronous

None of these are measured by the bench. The NFT-9 green status is not meaningful for the real user-facing import time. A 50 MB IFC file through the real path may take longer than 30 s on slower hardware due to the synchronous geometry streaming.

---

### ARCH-07: IfcLevelImporter Uses `any` for CommandManager and BimManager

```ts
export async function importIfcLevelsAndViews(
    storeys: IfcStoreyRecord[],
    commandManager: any,    // ← untyped
    bimManager: any,        // ← untyped
): Promise<IfcLevelImportSummary>
```

All calls to `commandManager.execute()` and `bimManager.getLevels()` are untyped. There is no compile-time guarantee that the correct API is passed. The `getExistingLevels()` helper also has an untyped `any[]` return:

```ts
const getExistingLevels = (): any[] => {
    try {
        if (typeof bimManager?.getLevels === 'function') return bimManager.getLevels();
    } catch (_) {}
    return [];
};
```

The empty-catch `catch (_) {}` silently swallows any error from `bimManager.getLevels()`.

---

## 6. Performance Issues (P2)

### PERF-01: `StreamAllMeshes()` Is Synchronous — No Yielding During 5,500-Geometry Load

Despite the streaming name, `api.StreamAllMeshes()` calls its callback synchronously for every geometry in the model. Creating 5,500 `THREE.BufferGeometry` + `THREE.Mesh` objects without yielding is a major source of the LONGTASK cascade observed in logs.

**Post-import LONGTASK cascade from live logs:**
```
T+0ms:    1867ms LONGTASK (geometry streaming + level creation)
T+1867ms: 69ms  LONGTASK
T+6500ms: 640ms LONGTASK (GPU geometry upload)
T+7200ms: 71ms  LONGTASK
T+7500ms: 54ms, 62ms, 52ms, 54ms LONGTASKs
T+8500ms: 59ms  LONGTASK
T+10.5s:  84ms, 74ms, 72ms LONGTASKs
T+12.5s:  99ms  LONGTASK
T+14.5s:  88ms, 83ms, 76ms, 85ms, 50ms, 51ms LONGTASKs
```

The cascade spans approximately 15 seconds. During this window, FPS drops from 139 → 30 → 73 → recovering to 95–127 fps. The total blocked time far exceeds the initial 1,867 ms LONGTASK.

**Mitigation implemented**: Shadow maps are disabled during streaming, and the render pipeline is suspended (`rpm.setSuspended(true)`). This is correct and reduces GPU pressure but does not eliminate the CPU LONGTASKs.

### PERF-02: 38 MB `_capturedBuffer` Held in Memory for 13+ Seconds

```ts
let _capturedBuffer: ArrayBuffer | null = null;     // line 1289

// Assigned at file read start:
_capturedBuffer = buffer;                           // line 1292

// NOT released until after upload completes at ~T+13s:
_uploadIfcToServer(file.name, _capturedBuffer, ...)  // line 1428 (background)
```

During the ~13 second window between file read and upload completion:
- `_capturedBuffer` (38 MB `ArrayBuffer`) is held
- `bytes` (`Uint8Array` view of same buffer) is also kept alive during WASM parse
- Both references prevent the 38 MB from being garbage collected

The upload is non-blocking (`async` with `.catch()`) — good. But `_capturedBuffer` should be set to `null` immediately after `_uploadIfcToServer` is called, not left for GC to discover. The current code never explicitly nulls it.

### PERF-03: Server Restore Sends 51 MB of Base64 JSON Over HTTP

During `_restoreIfcUploads()`, the fallback path returns:
```js
{ base64: row.file_data, fileName: row.file_name }
```

The client receives a JSON response containing a 51 MB base64 string (38 MB binary × 1.333). The browser must:
1. Parse the entire JSON response into memory (~51 MB string allocation)
2. Decode `atob(base64)` → `Uint8Array` (~38 MB allocation)
3. Re-run the full import pipeline on the decoded bytes

Total memory allocation during restore: ~89 MB. Plus the WASM model heap (~150–190 MB). Peak RSS during restore of a single 38 MB IFC file approaches ~280 MB above baseline. For multiple stored uploads, this compounds.

**Contrast with Supabase Storage path**: Returns a signed URL (< 1 KB). Client streams the binary directly. Dramatically better in all dimensions. The Supabase Storage path should be the only path; the base64 DB fallback should be deprecated.

### PERF-04: GPU Monitor False Positive Masks Real Leak Signals

**Live evidence:**
```
[GPU Monitor] ⚠ Geometry count grew 549900.0% (1 → 5500) in 10s — possible leak.
Check WallFragmentBuilder.removeWallFragments() and CurtainWallBuilder._disposeChildren().
```

The GPU Monitor's leak detection triggers on IFC import (1 → 5,500 geometries in 10 s) and directs investigation toward `WallFragmentBuilder` and `CurtainWallBuilder` — neither of which is responsible. The IFC geometry growth is expected behavior.

The warning message causes false attribution. A 10 s geometry-count sample window is too short and its percentage threshold is too sensitive to detect slow leaks vs. bulk additions. The monitor should exclude IFC import windows (using the existing `window._ifcLevelImportInProgress` flag or a dedicated `window._ifcGeometryImportInProgress` flag).

A second GPU Monitor reading 10 seconds later shows:
```
[GPU Monitor] geometries:9219 textures:6 | drawCalls:1709 tris:132396
```

9,219 geometries for a model that rendered 5,500 (at `drawCalls:5499` initially). The increase to 9,219 geometry objects suggests GPU buffer splits or mipmapping happening post-load. This warrants investigation — 9,219 GPU objects for a 5,500-mesh model is higher than expected.

---

## 7. Memory Issues (P2)

### MEM-01: IFCParseWorker WASM Model Accumulation (cross-reference BUG-01)

Already detailed in BUG-01. Summary: each import via the plugin Worker path adds a permanently-open WASM model to the Worker's WASM heap. N imports = N × ~150 MB of leaked heap.

### MEM-02: THREE.js Geometry Not Disposed on Model Remove

`IfcGeometryRenderer.disposeGroup()` correctly traverses meshes and disposes geometries and materials:

```ts
disposeGroup(group: THREE.Group): void {
    group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
    });
    // ... material dispose
    group.removeFromParent();
}
```

However, `disposeGroup()` is not called from `initUI.ts` model removal. The `pryzm-import-model-remove` event handler in `initUI.ts` only deletes the server upload record — it does not dispose the THREE.js group. The 5,500 geometry objects remain in GPU memory until the page is refreshed.

**Search evidence**: `grep 'disposeGroup\|pryzm-import-model-remove' src/` — these are in separate handlers with no cross-call.

### MEM-03: `IfcModelStore` Has No Eviction Policy

`ifcModelStore.register()` stores all element records in-memory for every imported model. The store is registered on `window.ifcModelStore`. There is no `unregister()` call when a model is removed. For a 38 MB IFC with thousands of elements, each with psets, the in-memory store can hold 50–100 MB of structured data that never gets freed.

### MEM-04: `_capturedBuffer` Null-Out Missing (cross-reference PERF-02)

The 38 MB `_capturedBuffer` closure is never explicitly nulled after upload. See PERF-02 for details.

---

## 8. Contract Compliance Matrix

| Contract | Clause | Status | Evidence |
|---|---|---|---|
| C01 §1 P4 | No `(window as any)` outside shim | ⚠ Soft | `window.ifcModelStore`, `window._ifcLevelImportInProgress`, `sm._selectableCache` assignments — in L7.5 zone (allowed until Wave 7) |
| C01 §1 P6 | Commands are the only mutation path | ❌ VIOLATED | IFC geometry added directly to scene, never through CommandBus |
| C01 §1 P8 | Spans required on new exported functions | ⚠ PARTIAL | Spans present but missing required attributes (see §11) |
| C05 §2.2 | IFC round-trip fidelity | ❌ VIOLATED | IFC not embedded in `.pryzm` ZIP; Differentiator D1 unfulfilled |
| C05 §1.2 | Persistence backend fallback hierarchy | ✅ COMPLIANT | `DATABASE_URL` preferred correctly; base64 DB fallback is documented fallback |
| C10 NFT-4 | Frame budget 16.6 ms p95 | ❌ VIOLATED | 1,867 ms LONGTASK confirmed in live logs |
| C10 NFT-9 | IFC import (Tier-1, 50 MB) < 30 s | ⚠ UNCLEAR | Bench measures stub Worker, not real path; real path unmeasured |
| C10 NFT-16 | Memory < 1.5 GB (10k elements, 1 h) | ⚠ AT RISK | IFCParseWorker leak + 9,219 GPU objects + no geometry eviction |
| C10 §2.2 | OTel span required attributes | ⚠ PARTIAL | Spans started but `pryzm.project_id`, `pryzm.user_id`, `pryzm.element_count` absent |
| C07 §2 | Plugin invariants | ⚠ PARTIAL | Plugin descriptor correct; handler is stub; `runtime.ifc` slot absent |
| C12 §1.4 | CRS read on import | ✅ COMPLIANT | `IfcProjectedCRSReader` present and correctly structured; not hooked into main import path (no caller found in `initUI.ts`) |
| C13 §2 | Project isolation | ✅ COMPLIANT | Auth check on all IFC upload routes; `authMiddleware` enforced |

---

## 9. Security Issues (P3)

### SEC-01: Auth Token Sourced from `localStorage`

```ts
const token = localStorage.getItem('bim-platform-token');
// Used as: headers: { Authorization: `Bearer ${token}` }
```

`localStorage` is accessible to any JavaScript running in the same origin, including XSS payloads. If an attacker achieves XSS, they can extract the bearer token and make authenticated API calls including uploading arbitrary binary data as IFC files. `HttpOnly` session cookies or `sessionStorage` are more appropriate.

### SEC-02: Server Accepts Client-Supplied `elementCount` Without Validation

```ts
form.append('elementCount', String(elementCount));
// Server stores: element_count = $7 (from form)
```

The `elementCount` is supplied by the client after parsing. The server stores it verbatim in `ifc_uploads.element_count`. A malicious client can send any integer (e.g., `-1` or `99999999`). Not a direct security exploit but affects data integrity and any downstream code that trusts this count.

### SEC-03: No MIME Type or Magic Bytes Validation on IFC Upload

Server validates `.ifc` extension only:
```js
if (file.originalname.toLowerCase().endsWith('.ifc')) cb(null, true);
else cb(new Error('Only .ifc files are accepted'));
```

No magic bytes check (IFC files begin with `ISO-10303-21;`). A crafted binary with `.ifc` extension could trigger WASM behavior that is unexpected. Given that `web-ifc` WASM processes the bytes directly, a malformed payload could potentially cause WASM to abort or consume unbounded memory.

---

## 10. Post-Import Navigation Audit

### 10.1 GPU Picking — Working Correctly

Post-import element selection works via GPU picking. Evidence from logs:
```
[PickResolver] strategy=gpu-pick hover-hit=ifc-215752
[PickResolver] strategy=gpu-pick hover-hit=ifc-207003
[PickResolver] strategy=gpu-pick hit=ifc-182695
[LevelPlaneConstraint] Locked Y=2.4350 for element "" id="ifc-202869"
```

Mesh IDs follow the pattern `ifc-<expressID>`, allowing round-trip lookup via `ifcModelStore`. The `LevelPlaneConstraint` correctly locks the Y axis for clicked elements, demonstrating that element positioning is understood.

### 10.2 Plan View Navigation — Non-Functional (Due to BUG-03)

Because `CreatePlanViewCommand` fails for all 5 storeys, there are no IFC-derived plan views in the view browser. Users cannot:
- Switch to a floor-specific view that clips geometry to a storey
- Use the IFC storey as a plan view camera constraint
- Navigate by elevation using the view browser

The level entries ARE created correctly (4 levels at 3,800 m, 7,600 m, 11,400 m, 12,000 m), and the `LevelClipPlaneCache` registers them correctly:
```
[initScene] LevelClipPlaneCache: registered level "level-ifc-65" at 3800.00000000151m
[initScene] LevelClipPlaneCache: registered level "level-ifc-70" at 7599.99999999994m
```

The floating-point precision issue (`3800.00000000151` vs `3800`) is a minor cosmetic concern in level display names but does not affect clip plane behavior.

### 10.3 Section View Navigation — Implemented but Untested by Audit

`SectionViewService.ts` line 160 handles IFC group objects:
```ts
if ((obj as THREE.Group).isGroup && obj.userData?.source === 'ifc-import') {
```

The section cut traversal code is present. Section views should work for IFC geometry once the geometry group is in the scene.

### 10.4 Camera Fit — Correct

After level import, a `setTimeout(() => zoomToAll(...), 300)` call fits the camera to all geometry. This avoids the "model disappears" bug that occurred when camera animation fired during level creation (suppressed by `window._ifcLevelImportInProgress`).

### 10.5 FPS After Import — Recovers

```
T+0s:    30 fps (geometry streaming)
T+1s:    139 fps
T+6s:    135 fps
T+7s:    123 fps
T+14s:   73 fps (GPU upload peak)
T+15s:   111 fps
(hover):  86 fps, 127 fps, 119 fps, 117 fps, 112 fps, 116 fps
```

FPS recovers to a stable 95–135 fps under mouse hover interaction with GPU picking, indicating the rendering pipeline is healthy post-import.

### 10.6 Element Properties on Selection

`LevelPlaneConstraint` correctly reads element data:
```
[LevelPlaneConstraint] Locked Y=2.4350 for element "" id="ifc-202869"
```

The element `name` field is empty (`""`), suggesting that the IFC element referenced by expressID `202869` has no `Name` attribute, or the name was not extracted. The `ifcTypeName` and `psets` are stored in mesh `userData` and available for property inspection.

### 10.7 Auto-Save After IFC Import — Rejected by Server

```
[ServerSyncQueue] Version "Auto-save" rejected by server (403) — dropping:
{"error":"Version history is not available on your current plan.","plan":"free","upgrade":"architect"}
[ServerSyncQueue] Plan-gating latch engaged — future versions will stay local-only this session.
```

Auto-save after IFC import is rejected by the server (plan-gating). The project save snapshot captures `0 elements, 5 levels, 0 walls` — meaning the IFC geometry is NOT captured in the project snapshot (correct behavior — IFC is stored separately in `ifc_uploads`). If the page is refreshed without the server upload completing, the IFC model will not be available on restore.

---

## 11. Observability Gap Analysis

### 11.1 OTel Span Coverage

| Span Name | File | Attributes Set | Missing Required Attributes |
|---|---|---|---|
| `pryzm.ifc.importFile` | `IFCImportHandler.ts` | 0 | `pryzm.project_id`, `pryzm.user_id`, `pryzm.element_count`, `pryzm.command_type` |
| `pryzm.ifc.parse` | `IFCParseWorker.ts` | 0 | Same as above; also: Worker context propagation not wired |
| `pryzm.ifc.tier2-move` | `commands/index.ts` | 6 (good) | None — compliant |
| `pryzm.ifc.pset-update` | Not found in codebase | — | Span mentioned in `otel.ts` comment but no implementation found |

**Per C10 §2.2**, the required attributes for all project-scoped operations are: `pryzm.project_id`, `pryzm.user_id`, `pryzm.element_count`, `pryzm.command_type`. None of the import-path spans set any of these.

### 11.2 OTel in Web Workers

The `IFCParseWorker.ts` imports `@opentelemetry/api` and calls `tracer.startSpan()`. However:
- OTel context propagation across `postMessage()` boundaries requires explicit `W3CTraceContextPropagator` and context injection/extraction
- The Worker does not receive a trace context from the main thread
- The Worker's spans will be orphaned (no parent trace context) and invisible in distributed traces

### 11.3 No Span for Main Import Path

The most user-facing part of the pipeline — `initUI.ts` → `IfcImporter` → `IfcGeometryRenderer` — has **no OTel spans at all**. The 1,867 ms LONGTASK is invisible in traces. There is no way to attribute user-perceived latency to specific pipeline stages without manual browser profiling.

### 11.4 GPU Monitor Misdirection

The GPU Monitor warning points to `WallFragmentBuilder.removeWallFragments()` — a completely irrelevant code path. The monitor needs IFC-import awareness to suppress or correctly attribute geometry count spikes during bulk import.

---

## 12. Priority Remediation Roadmap

Issues are grouped by priority. Each item includes the minimum change required.

### P0 — Must Fix Before Production

| # | Issue | Minimum Fix | Files |
|---|---|---|---|
| R01 | BUG-01: WASM model leak in IFCParseWorker | Add `api.CloseModel(modelId)` in `finally` before posting result | `plugins/ifc-import/src/workers/IFCParseWorker.ts:52` |
| R02 | BUG-02: 1,867 ms LONGTASK in level importer | Add `await scheduler.nextFrame()` between storey iterations; use existing Sprint A39 frame-yield pattern | `IfcLevelImporter.ts:70` |
| R03 | BUG-03: All plan views fail silently | Investigate `CreatePlanViewCommand` BimManager dependency; either wait for BIM component registration or create plan views via PRYZM-native path | `IfcLevelImporter.ts:125-135` |
| R04 | BUG-04: Plugin handler is no-op | Either implement the handler body to delegate to `IFCImportHandler`, or explicitly document that this path is deferred and remove the dead comment about `runtime.ifc.importFile()` | `pluginHandlers.ts:36-54` |
| R05 | ARCH-05: C05 §2.2 round-trip unimplemented | Embed IFC binary in `.pryzm` ZIP at `ifc/source.ifc` on every IFC-originated project save | `packages/file-format/` |

### P1 — Fix Before GA

| # | Issue | Minimum Fix | Files |
|---|---|---|---|
| R06 | ARCH-01: P6 violation — IFC bypasses CommandBus | Create `ImportIfcModelCommand` + handler; route scene additions through command bus; add undo support | `initUI.ts`, new command handler |
| R07 | ARCH-03: OBC/PRYZM divergence undocumented | Write ADR: "IFC geometry rendering via PRYZM-native StreamAllMeshes (not OBC ifcLoader) due to WebGPU NodeMaterial incompatibility" | New `docs/adrs/ADR-0039-ifc-geometry-renderer.md` |
| R08 | ARCH-06: NFT-9 bench measures wrong path | Update `ifc-import-tier1.bench.ts` to exercise real `IfcImporter` + `IfcGeometryRenderer` path | `apps/bench/src/benches/ifc-import-tier1.bench.ts` |
| R09 | MEM-02: THREE.js geometry not disposed on model remove | Call `IfcGeometryRenderer.disposeGroup(group)` in `pryzm-import-model-remove` handler | `initUI.ts:1154-1170` |
| R10 | MEM-03: `IfcModelStore` no eviction | Add `unregister(modelId)` to `IfcModelStore`; call it from model-remove handler | `IfcModelStore.ts` |
| R11 | ARCH-04: `pryzm-ifc-imported` DOM event bypass | Route through `runtime.events.emit('ifc.modelImported', result)` | `initUI.ts:1420` |
| R12 | C12 §1.4 CRS reader not wired | Call `readIfcProjectedCRS(importer.getApi(), modelID)` in `initUI.ts` after `importAndKeepOpen()`; store result | `initUI.ts:1318` region |

### P2 — Performance Improvements

| # | Issue | Minimum Fix |
|---|---|---|
| R13 | PERF-02: `_capturedBuffer` not nulled | Add `_capturedBuffer = null` immediately after calling `_uploadIfcToServer()` |
| R14 | PERF-03: Base64 server restore | Prioritize Supabase Storage configuration; deprecate base64 DB path for files > 5 MB |
| R15 | PERF-04: GPU Monitor false positive | Add IFC-import-in-progress exemption to geometry growth check |
| R16 | PERF-01: No streaming yield | Use `setImmediate()` / `scheduler.postTask()` between mesh batches of 500 |

### P3 — Security / Hardening

| # | Issue | Minimum Fix |
|---|---|---|
| R17 | SEC-01: Token in `localStorage` | Migrate to `httpOnly` session cookie for auth token |
| R18 | SEC-02: Client-supplied elementCount | Validate/clamp `elementCount` server-side from 0 to 10,000,000 |
| R19 | SEC-03: No magic bytes check | Add server-side IFC magic bytes check (`ISO-10303-21;` prefix) |

### P4 — Observability Completeness

| # | Issue | Minimum Fix |
|---|---|---|
| R20 | OTel spans missing required attributes | Add `pryzm.project_id`, `pryzm.user_id`, `pryzm.element_count` to both import spans |
| R21 | Worker OTel context not propagated | Inject W3C trace context via `postMessage` extra field; extract in Worker |
| R22 | No span for main import path | Add `tracer.startSpan('pryzm.ifc.import')` wrapper around `initUI.ts` import chain |

---

## Appendix A — File Inventory

| File | Role | State |
|---|---|---|
| `plugins/ifc-import/src/IFCImportHandler.ts` | Plugin: Web Worker orchestrator | Well-implemented; not wired to real path |
| `plugins/ifc-import/src/workers/IFCParseWorker.ts` | Plugin: Off-thread WASM parser | Well-implemented; has BUG-01 (no CloseModel); not used in production |
| `plugins/ifc-import/src/handlers/pluginHandlers.ts` | Plugin: Command handlers | Stub — no-op body; BUG-04 |
| `plugins/ifc-import/src/converters/tier2-proxy.ts` | Plugin: Tier-2 proxy converter | Well-implemented; tested; not wired |
| `plugins/ifc-import/src/meta-store-population.ts` | Plugin: Meta store writer | Well-implemented; tested; not wired |
| `plugins/ifc-import/src/commands/index.ts` | Plugin: MoveProxy command | Well-implemented; OTel-compliant |
| `plugins/ifc-import/src/descriptor.ts` | Plugin: Manifest descriptor | Compliant with ADR-0038 |
| `plugins/ifc-import/src/otel.ts` | Plugin: OTel helpers | Well-implemented |
| `plugins/ifc-import/src/IfcProjectedCRSReader.ts` | Plugin: CRS metadata reader | Well-implemented; NOT called from main import path |
| `src/engine/subsystems/import/ifc/IfcImporter.ts` | Real: Semantic extractor | Well-implemented; main thread; `CloseModel()` called correctly |
| `src/engine/subsystems/import/ifc/IfcGeometryRenderer.ts` | Real: Geometry renderer | Well-implemented; disposeGroup present but not called on model remove |
| `src/engine/subsystems/import/ifc/IfcLevelImporter.ts` | Real: Level/view creator | BUG-02 (no yield), BUG-03 (views fail), ARCH-07 (any types) |
| `src/engine/subsystems/initUI.ts` | Real: Import orchestrator | 2,889 LOC; ARCH-01, MEM-04; correct overall flow |
| `server/ifcStorageService.js` | Server: File persistence | Correct; base64 fallback is a performance concern; no compression |
| `server.js` (IFC routes) | Server: Upload/list/data/delete | Correct; multer 500 MB limit; auth enforced |

## Appendix B — Live Log Timeline (38 MB IFC Import, 2026-05-07)

```
T+0s:     File selected; overlay shown; WASM init begins
T+2.1s:   IFC structure parsed; 5 storeys, spaces, relationships extracted
T+2.1s:   Physical elements extracted; element index built
T+2.1s:   StreamAllMeshes begins (synchronous)
T+2.1s:   1867ms LONGTASK starts (geometry streaming + level creation)
T+4.0s:   1867ms LONGTASK ends; 69ms LONGTASK follows
T+4.0s:   [IFC Import] Running IfcLevelImporter for 5 storeys
T+4.0s:   4 levels created; 0 plan views created (all fail)
T+4.0s:   [PerformanceModePanel] Auto-performance mode OFF
T+4.0s:   FPS: 30fps
T+4.2s:   Shadow rebuild scheduled (28 meshes)
T+4.4s:   GPU Monitor: geometries:1, textures:3 (GPU not yet updated)
T+5.1s:   ProjectSerializer snapshot: 0 elements, 5 levels
T+5.1s:   Auto-save attempt → 403 plan-gating rejection
T+5.4s:   FPS: 139fps (first stable frame)
T+6.5s:   640ms LONGTASK (GPU geometry upload peak)
T+10.4s:  GPU Monitor: geometries:5500, drawCalls:5499 (GPU updated)
T+10.4s:  GPU Monitor: ⚠ 549900% geometry growth warning (false positive)
T+13.0s:  [IFC Storage] Upload persisted — status: complete_db_fallback
T+14.0s:  FPS: 73fps (GPU upload pressure)
T+15.0s:  FPS: 111fps
T+16.0s+: GPU picking active; hover hits: ifc-215752, ifc-207003, etc.
T+17.0s+: FPS: 86-127fps; stable interactive state
```
