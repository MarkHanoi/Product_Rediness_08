# PRYZM — Senior Architect Audit Report

> **Date**: 2026-05-03 · **Auditor**: Exhaustive automated code-evidence audit (all findings cite specific files)
> **Scope**: Full codebase — `src/` (391,598 LOC), `packages/` (82,627 LOC), `plugins/` (58,424 LOC), `apps/` (39,147 LOC), `server/` (~8,000 LOC JS)
> **Format**: 18 sections, each scored 1–10. `FAIL` = must fix before production. `WARN` = fix within 2 sprints. `PASS` = meets or exceeds bar.

---

## 1. RENDERING PIPELINE

**STATUS: WARN**

**FINDINGS:**

**Renderer**: Three.js `WebGLRenderer` is the primary production renderer (467 direct `import * as THREE` or `from 'three'` sites across `src/`, `packages/`, `apps/`). A **WebGPU migration is actively in progress** via `src/engine/subsystems/rendering/pipeline/RenderPipelineManager.ts`, which implements a TSL (Three.js Shading Language) pipeline in four phases (Phase 2: WebGPU no post-FX; Phase 3: SSGI/SSGINode + Denoise; Phase 4: TRAA colour filter + Outlines). The file explicitly documents "Graceful degradation: when the renderer is WebGL, the manager is a no-op." `@webgpu/types ^0.1.69` is in `devDependencies`, confirming the migration target. **No progressive enhancement fallback is currently wired** — the WebGPU path activates only after "Phase 5 (OBC decoupling)" which has not landed.

**BVH**: `three-mesh-bvh ^0.9.9` is present in `package.json`. `src/engine/subsystems/core/rendering/FrustumCullingService.ts` references it. The offline path-tracer (`three-gpu-pathtracer ^0.0.20` + `src/engine/subsystems/core/rendering/PathTracingUtils.ts`, `ViewportPathTracer.ts`, `PhotorealisticRenderer.ts`) mandates BVH for energy-conserving materials. `packages/geometry-kernel/src/runners/browser-worker-runner.ts` runs geometry kernel off-thread. **However**, `packages/renderer-three/` — the intended single THREE owner — is currently a stub. The 467 direct THREE importers are the largest P2 (single-THREE-owner) violation in the codebase.

**Instanced rendering**: `src/engine/subsystems/core/rendering/InstancedElementRenderer.ts` and `InstanceGroup.ts` implement `THREE.InstancedMesh` for repeated geometry. `CurtainPanelFactory.ts` also uses it. Coverage appears to extend to structural members; door/window repetition coverage not confirmed fully.

**LOD**: No `THREE.LOD`, `draco`, or distance-based mesh simplification found. No tile-switching or streaming level-of-detail. This is a gap for large models (500k+ elements).

**Render loop decoupling**: `packages/frame-scheduler/` is the single `requestAnimationFrame` owner (Wave D.7 arc — 1 rAF owner ✅). The render loop is fully decoupled from React/DOM re-renders. `src/engine/subsystems/core/rendering/UnifiedFrameLoop.ts` and `FrameCoordinator.ts` coordinate frame timing.

**Render graph / pass ordering**: Two explicit pipelines documented in `RenderingPipelineCoordinator.ts`:
- **Pipeline 1 (Real-time)**: `THREE.WebGLRenderer` + `PostproductionRenderer` (SSAO, outlines) + HDRI IBL + PBR material enforcement + shadow quality upgrade + reflection probes + clearcoat/SSS + procedural sky.
- **Pipeline 2 (Offline)**: `three-gpu-pathtracer` path-tracer + HDRI + full BVH + up to 4K/8K output.
- **WebGPU pipeline (in-progress)**: `ScenePass` (MRT: output, diffuseColor, normal, velocity) → Zone pass → `SSGINode` → `DenoiseNode` → `TRAANode` → background blend.
- MRT confirmed via `RenderPipelineManager.ts` and `ScenePass.ts`. Depth pre-pass not explicitly found — OBC-managed renderer handles this internally.

**Transparency**: Not separately confirmed. OBC's `PostproductionRenderer` handles compositing; no explicit alpha-sort queue found in first-party code.

**Picking**: `packages/picking/` package exists (used in `composeRuntime()` slot). `src/engine/subsystems/tools/SelectionManager.ts` (2,141 LOC) coordinates picking. Offscreen ID buffer not confirmed — raycasting is the primary mechanism. No GPU picking buffer (e.g. `WebGLRenderTarget` ID texture) found.

**Shader management**: Managed by Three.js/OBC internally. No first-party pre-warming script found. `ClearcoatMaterialUpgrader.ts` upgrades materials at scene load time. `RenderMaterialLibrary.ts` manages the material pool.

**Post-processing implemented**:
- SSAO (via OBC `PostproductionRenderer`)
- SSGI (`SSGIService.ts`, `SSGIPass.ts`)
- Enhanced bloom (`EnhancedBloomService.ts` — `three/examples/jsm/postprocessing/EffectComposer` + `UnrealBloomPass`)
- Edge outlines (`OutlinePass.ts`)
- TRAA (temporal anti-aliasing, WebGPU pipeline)
- Section cuts (view range classifier + poche fill)
- Path-tracing (offline, `ViewportPathTracer.ts`)
- Real sun simulation (`RealSunService.ts`)
- HDRI environment (`HDRIEnvironmentManager.ts`)

**SCORE: 7/10** — Dual pipeline (real-time + path-tracer) is genuinely impressive. WebGPU migration is under way with correct architecture. **Wave A15 ✅**: ~~467 direct THREE importers~~ → 0 violations — `packages/renderer-three/src/three-re-export.ts` is now the sole `three` importer; `check-three-imports.ts` gate hard-fails at 0. **Wave A18 ✅**: LOD 3-tier system implemented (`LODManager.ts` — < 100m / 100–500m / ≥ 500m). Remaining gaps: no progressive WebGPU fallback wired (mobile/iOS); `EnhancedBloomService.ts` still runs own rAF loop internally (P3 violation — deferred). **Wave 36 U-2 ✅ (2026-05-04): GPU pick probe (`WebGLRenderTarget` ID texture) wired to hover + click paths in `SelectionManager.ts`** — GPU picking buffer gap CLOSED.

---

## 2. IFC & OPEN BIM DATA MODEL

**STATUS: WARN**

**FINDINGS:**

**IFC Parser**: `web-ifc ^0.0.77` (IFC.js foundation, WASM-powered) combined with `@thatopen/components ^3.4.2` + `@thatopen/components-front ^3.4.2` + `@thatopen/fragments ^3.4.3`. ThatOpen's component stack wraps `web-ifc` and provides the `FragmentReader.ts` integration (`src/engine/subsystems/export/ifc/FragmentReader.ts`). This is the industry-standard open-source stack for browser-based IFC.

**Threading**: `DrawingPipelineWorker.ts` runs drawing pipeline stages 1–6 off the main thread. `packages/geometry-kernel/src/runners/browser-worker-runner.ts` exposes geometry kernel operations to a worker context. However, IFC file parsing itself (`IfcImporter.ts`) is not confirmed to run in a dedicated worker — `web-ifc` parsing is typically main-thread unless explicitly worker-routed, and no `new Worker('...ifc...')` call was found in the import pipeline.

**IFC Schema versions**: IFC2X3 and IFC4 are explicitly supported in export (`IfcExporter.ts`: `schema?: 'IFC2X3' | 'IFC4'`) and confirmed in the UI (`RevitWizardPanel.ts`, `PricingPage.ts`, `ResourcesPage.ts`). IFC4X3 is declared as a type in `src/ui/ProjectBrowser/types.ts` (`schema: 'IFC2X3' | 'IFC4' | 'IFC4X3'`) but the exporter only implements `'IFC2X3' | 'IFC4'` — **IFC4X3 is type-declared but not implemented**.

**Element store architecture**: Flat typed stores per element family (`WallStore.ts`, `DoorStore.ts`, `SlabStore.ts`, etc. — one Zustand store per family). This is a pragmatic ECS-adjacent design — not deep OOP hierarchies, not a pure ECS (no component arrays, no archetypal layout). Property access is typed and direct; no reflection layer.

**Property sets (Psets)**: `IfcPropertyWriter.ts` writes Psets on export. `ifc-inspector` plugin with `packages/plugin-sdk/hosts/stores.ts` allows Pset browsing. No first-party Pset query language — `ai/QueryEngine.ts` (1,617 LOC) provides natural-language queries over model data.

**Spatial index**: `src/engine/subsystems/core/SpatialIndex.ts` (now `src/engine/subsystems/core/SpatialIndex.ts` post-Wave 10 migration). `packages/spatial-index/` is a stub. No BVH-accelerated broad-phase element query confirmed in the first-party spatial code (distinct from the rendering BVH in `three-mesh-bvh`).

**Lazy hydration**: `src/engine/subsystems/core/persistence/SnapshotStreaming.ts` exists, suggesting streaming/partial loading design. Full lazy hydration (loading geometry only for visible elements) is not confirmed end-to-end.

**Federated models**: `BCFToolbar`, `CDEBrowserPanel`, `CDETransmittalPanel` (confirmed in test files), and `ClashDetectionPanel` exist in the UI. However, no multi-discipline federated model loading (loading separate architectural + structural + MEP IFC files simultaneously) was confirmed in the engine code. `ClashDetectionPanel.spec.ts` exists as a binding test but the real implementation may be stub-level.

**Model merge strategy**: Not found. The `cross` plugin (26/26 tests) handles cross-element relationships, but multi-model federation is absent.

**SCORE: 7/10** — web-ifc + @thatopen is the right foundation. IFC2X3/IFC4 export is real and tested (16/16 tests green). **Wave A17 ✅**: ~~IFC parsing main-thread~~ → `IFCParseWorker.ts` + `IFCImportHandler.ts` — IFC parsing fully off main-thread via WorkerPool; ~~IFC4X3 type-only~~ → `IFC4X3Exporter.ts` implemented (Wave A17). **Wave A20 ✅**: `plugins/ifc-import/` plugin promoted from stub with full `PluginManifest` descriptor. Remaining gaps: no federated model support, `packages/spatial-index/` BVH implementation remains in transitional `src/` zone, no buildingSMART sample file validation in CI.

---

## 3. GEOSPATIAL & GEOREFERENCING

**STATUS: WARN**

**FINDINGS:**

**Coordinate system**: WGS84 georeferencing via `src/engine/subsystems/commands/geospatial/SetGeoreferenceCommand.ts`. `packages/core-app-model/src/navigation/GeospatialAdapter.ts` implements `localToWGS84(localX, localZ, georeference)` and `wgs84ToLocal()` using simple spherical approximation (not a full projected CRS transform library like proj4js). **Double-precision coordinate handling not confirmed** — Three.js uses 32-bit float position buffers by default, which will produce jitter at large-scale coordinates (sites > 10 km from origin).

**IFC georeferencing**: `IfcMapConversion` is referenced in `src/engine/EngineContext.ts`. `src/engine/subsystems/commands/geospatial/SetGeoreferenceCommand.ts` manages georeference state. `IfcProjectedCRS` support not confirmed.

**Map integration**: `cesium ^1.140.0` + `vite-plugin-cesium ^1.2.23`. `plugins/geospatial` plugin (`GISRailPanel.ts`) provides the UI surface. The Cesium globe is integrated for site context and globe placement. However, the `geospatial` plugin is marked as a stub in `03-CURRENT-STATE.md`.

**Real-world basemap/terrain**: Cesium provides globe + terrain. The upgrade modal (`UpgradeModal.ts`) advertises "Place your BIM model on the real globe using CesiumJS — georeferenced WGS84 positioning and GLB export to Earth."

**GIS data import**: Not confirmed. No GeoJSON parser, Shapefile importer, CityGML, or LandXML found in first-party code.

**3D Tiles**: No `Cesium3DTileset` or `3dtiles` usage found. Cesium's 3D Tiles streaming not wired.

**Point clouds**: No LAS/LAZ/E57 parser found.

**Terrain**: Cesium's terrain service (Cesium World Terrain) would be available through the Cesium integration, but no explicit terrain configuration found in first-party code.

**SCORE: 5/10** — Cesium is the right choice, and the basic WGS84 georeference command exists. **Wave A17 ✅**: ~~float32 jitter risk~~ → `LTPENURebase.ts` double-precision LTP-ENU rebasing implemented; `packages/geospatial/src/ltp-enu.ts`. **Wave A20 ✅**: ~~geospatial plugin is a stub~~ → `plugins/geospatial/` promoted with full `PluginManifest` descriptor: CRS picker, LTP-ENU coordinate display, terrain toggle. Remaining gaps: GIS import formats absent (GeoJSON/SHP), 3D Tiles streaming not wired, no point cloud support, Cesium globe integration is cosmetic (no real CDE tile fetch). One of the weaker areas for large-site or urban projects.

---

## 4. THREADING & COMPUTE PERFORMANCE

**STATUS: WARN**

**FINDINGS:**

**Web Workers**: Confirmed usage:
- `src/engine/subsystems/core/drawing/DrawingPipelineWorker.ts` — drawing pipeline stages 1–6 (geometry projection, view range filtering, poche polygon stitching, HLR, style resolution) run entirely off-thread. Contractually bans DOM, THREE renderer, `Math.random()`, GPU readback, and BRep/CSG.
- `packages/geometry-kernel/src/runners/browser-worker-runner.ts` + `browser-worker-entry.ts` — geometry kernel operations in a worker context.
- `packages/constraint-solver/src/worker.ts` — constraint solver runs in a dedicated worker.
- `packages/frame-scheduler/src/WorkerPool.ts` — worker pool with job queue (not ad-hoc creation).

**SharedArrayBuffer + Atomics**: Not confirmed in first-party code. `COOP/COEP` headers are set on static-file routes (mentioned in `securityHeaders.js`) which is the prerequisite for `SharedArrayBuffer`. The infrastructure is there but zero-copy geometry transfer via SAB + Atomics is not implemented.

**WASM modules**: Three WASM payloads:
- `web-ifc ^0.0.77` — IFC parsing and property set extraction (WASM).
- `manifold-3d ^3.4.1` — CSG (Boolean union/difference/intersection) via the Manifold library (`packages/geometry-kernel/src/csg/`). This is a high-quality choice — Manifold is fast and robust.
- `rhino3dm ^8.17.0` — Rhino 3DM file reading via WASM.

**Worker pool**: `packages/frame-scheduler/src/WorkerPool.ts` (confirmed via test `worker-pool.test.ts`). Not ad-hoc worker creation.

**GPU compute**: No WebGPU compute shaders found. `@webgpu/types` is present but only for rendering (no compute pipelines for clash detection, raycasting, or analysis). This is a future gap once WebGPU rendering is stable.

**Geometry triangulation**: CSG/Manifold is WASM-accelerated. Three.js geometry generation (for element families like walls, slabs) is on the main thread — the builder pattern (`WallFragmentBuilder.ts` at 2,256 LOC) runs synchronously when commands are executed. For heavy scenes this can cause frame drops.

**Main thread budget**: The `src/engine/subsystems/initUI.ts` (2,773 LOC) and `initScene.ts` (2,249 LOC) are large synchronous initialization files. `engineLauncher.ts` (2,130 LOC) performs much of the Stage 2 wiring. Performance probes are gated to dev + `?perf=1` (longtask observer + per-second FPS log). No confirmed frame-time budget enforcement (e.g., 8ms per frame budget with cooperative scheduling).

**Instrumentation**: `performance.mark`/`performance.measure` usage found in `src/engine/subsystems/core/views/EdgeProjectorService.ts` (1,867 LOC) and `PlanViewCanvas.ts` (2,150 LOC). 482 files import `@opentelemetry/api` — spans are pervasive. `apps/bench/` has 17 NFT bench files covering cold-boot, project load, tool latency, frame budget, etc.

**Strategy for 500k+ elements / 1M+ triangles**: No explicit streaming, LOD, or spatial paging strategy confirmed. The `SnapshotStreaming.ts` file suggests awareness of the problem, but the geometry builders run synchronously and THREE's instanced renderer relies on the model being fully loaded.

**Memory management**: Explicit `geometry.dispose()` and `material.dispose()` calls are scattered throughout tool and builder files (`BeamFragmentBuilder.ts`: "MUST NOT call `.dispose()`" on shared geometry — correct pattern). `GeometryCacheStore.ts` manages geometry cache. Not confirmed whether a systematic LRU eviction policy exists.

**SCORE: 7/10** — Worker pool + three confirmed WASM payloads + drawing pipeline fully off-thread is solid infrastructure. **Wave A17 ✅**: IFC parsing now off main-thread (`IFCParseWorker.ts`). **Wave A18 ✅**: ~~no LOD/streaming~~ → `LODManager.ts` 3-tier LOD system implemented. Remaining gaps: no SharedArrayBuffer geometry transfer (postMessage copy), no GPU compute shaders, main-thread geometry builders for element families (frame-budget risk at scale for > 100k elements).

---

## 5. PERSISTENCE & DATA LAYER

**STATUS: WARN**

**FINDINGS:**

**Local persistence strategy**: `localStorage` for user preferences (`packages/runtime-composer/src/UserPreferences.ts`). `GeometryCacheStore.ts` in `src/engine/subsystems/core/persistence/` caches geometry. **No IndexedDB, OPFS, or SQLite WASM** found — the app has no offline-capable local model store. All project data is server-round-trip on every open.

**Server-side storage**: PostgreSQL + Supabase. Project snapshots are stored as JSONB in `project_versions.snapshot` (full model serialization). `ifcStorageService.js` stores IFC binary blobs with a `file_data` column and a `storage_path` for the Supabase Storage bucket (`ifc-uploads`). `renderService.js` stores render gallery metadata. `storage-driver` package (`packages/storage-driver/`) abstracts object storage with InMemory/MinIO/R2 adapters (ADR-003) for worker-produced content-addressed geometry chunks.

**Byte-range / streaming**: `SnapshotStreaming.ts` exists in `src/engine/subsystems/core/persistence/`, indicating the design intent. `ProjectLoader.ts` (1,526 LOC) is the main loading coordinator. No confirmed `Range` header usage on the HTTP layer for partial chunk streaming.

**Model versioning**: Full snapshot-per-version in `project_versions` table. ISO 19650 CDE state machine (`versionStateMachine.js`) manages WIP → SHARED → PUBLISHED → ARCHIVED transitions. `version_audit_log` table for audit trail. `idempotency_key` in `project_versions` prevents duplicate versions on network retry.

**Delta/patch format**: `packages/command-bus/src/PatchEmitter.ts` emits Immer JSON patches. `packages/persistence-client/src/RuntimeEventLog.ts` is an append-only command event log. This is event-sourcing at the command level — each command is logged, enabling replay and incremental sync. **Full model snapshots are also stored** (JSONB), so the delta model is layered on top of snapshots rather than replacing them.

**Offline support**: No service worker, no PWA manifest, no IndexedDB. The app **cannot function offline**. This is a significant gap for field/site use.

**Cache invalidation**: `GeometryCacheStore.ts` for geometry caching. No CDN-level cache invalidation strategy confirmed (no ETag or `Cache-Control: immutable` for content-addressed chunks confirmed at the HTTP layer).

**Export pipeline formats**:
- IFC2X3 + IFC4 (fully implemented, 16/16 tests ✅)
- GLB (`GLBExporter.ts` + `@gltf-transform/functions ^4.3.0` for optimization)
- PDF (`jspdf ^4.2.1` + `pdf-lib ^1.17.1` + `svg2pdf.js ^2.7.0` + `PdfExportService.ts`)
- DXF (`dxf ^5.3.1` + `DxfExportService.ts`)
- SVG (`SVGCompositeRenderer.ts`)
- Excel schedules (`exceljs ^4.4.0`)
- JSON (schedule export via API v1)

**SCORE: 7/10** — Event-sourcing command log + ISO 19650 version state machine + multi-format export is strong. **Wave A17 ✅**: ~~no offline support~~ → `IndexedDBStore.ts` + `IndexedDbBackend.ts` + `OfflineBanner.ts` — offline-first local cache via IndexedDB; pending mutations queued + replayed on reconnect. **Wave A20 ✅**: PWA service worker adds background sync (`pryzm-mutations-queue`) for offline mutation replay. Remaining gaps: JSONB full-snapshot storage doesn't scale past ~50 MB models (no incremental patch storage), no confirmed byte-range streaming for partial model load.

---

## 6. STATE MANAGEMENT

**STATUS: PASS**

**FINDINGS:**

**Library**: Zustand (confirmed by store pattern — each store is a typed Zustand store via the `Store.ts` base factory in `packages/stores/`). `immer ^10.2.0` powers the `PatchEmitter` for JSON patch generation and Immer-based command production (`produceCommand.ts`).

**Scene state vs. BIM document state**: Cleanly separated. BIM document state lives in typed element stores (`WallStore`, `DoorStore`, etc.) and package-level stores (`packages/stores/`). Scene/camera/visibility state lives in `ActiveViewStore`, `packages/view-state/`, `packages/visibility/`, `packages/frame-scheduler/`. Selection state is in `packages/stores/src/SelectionStore.ts`. Transient UI state (hover, drag) is local to tool handlers (`WallTool.ts`, `DoorTool.ts`, etc.) and never reaches the persistent stores.

**Subscription granularity**: Each store is domain-scoped. `PlanViewCanvas.ts` subscribes to specific stores rather than a monolithic state tree. However, with 467 direct THREE importers, some rendering updates may be driven by store subscriptions in ways that cause broad scene reprocessing — not fully audited.

**Undo/redo**: Command pattern + event log. `packages/runtime-undo-stack/` wraps `packages/command-bus/src/UndoStack.ts`. `LegacyCommandManagerAdapter` bridges the old global `commandManager` during migration. Max history depth not found in source — no explicit cap confirmed.

**Transient state isolation**: Confirmed — tool handlers maintain local state (preview meshes, partial geometry) that is explicitly disposed on tool exit. `LinearDimensionAnnotationTool.ts` (1,488 LOC) shows the pattern: `_faceHighlight.geometry.dispose()` on cleanup.

**Serialization**: `packages/runtime-composer/src/UserPreferences.ts` serializes preferences to localStorage. Full model state is serialized via `ProjectSerializer.ts` to JSONB. The Immer JSON patches from `PatchEmitter.ts` are structurally serializable.

**Derived selectors**: Not confirmed. No `reselect` or Zustand `computed` middleware found. Derived values (room areas, schedule totals) appear to be computed on demand in the relevant service classes rather than memoized via selectors.

**SCORE: 7/10** — Architecture is correct: typed Zustand stores, strict command-bus mutation path (P6), clean separation of scene and document state. Gaps: no confirmed derived selector memoization, max undo depth not enforced, the legacy `commandManager` adapter is still live for 30 toolbars not yet wired to the runtime command bus.

---

## 7. REAL-TIME COLLABORATION

**STATUS: PASS**

**FINDINGS:**

**Protocol**: Socket.io `^4.8.3` (WebSocket with HTTP long-poll fallback). `apps/sync-server/` linearises `CommandEvents` per project with monotonic, gap-free sequence numbers via an in-memory mutex or Postgres advisory lock.

**CRDT/OT**: Custom LWW (Last-Writer-Wins) command log — not Yjs or Automerge (despite `lib0` appearing in `pnpm-lock.yaml`, it is a transitive dep of other libs, not a first-party Yjs integration). `packages/sync-client/src/event-bridge.ts` bridges sync events to the command bus. The command log in `packages/persistence-client/src/RuntimeEventLog.ts` is append-only and drives both sync and undo. This is effectively operational transformation at the command level, not structural CRDT — adequate for element-level granularity but may produce conflicts on simultaneous concurrent edits to the same element's geometry.

**Granularity**: Element-level and property-level. Each command targets a specific element ID + property. The sync server broadcasts the full command event to all subscribers; each client replays it through the command bus.

**Conflict resolution**: ~~LWW semantics~~ → **✅ CLOSED Wave A19 (2026-05-03)**: `YjsDocAdapter.ts` + `CRDTConflictResolver.ts` + `ConflictResolutionDialog.ts` + `PresenceService.ts` + `SyncPresenceClient.ts` all live. Yjs CRDT fully replaces LWW. Concurrent wall edits now merge without corruption. (Audit finding as of original scan: "LWW is still the live strategy — Yjs Phase 2D has not landed" — superseded.)

**Presence**: `packages/sync-client/src/awareness.ts` — cursor positions, user identity, active tool broadcast. `PlatformCollabPill.ts` in the UI renders presence indicators.

**BCF**: `plugins/bcf/` — 57/57 tests ✅. BCF issue creation, viewpoint capture, comment thread, markup export. BCF REST API compliance level not confirmed (BCF 2.1 vs 3.0).

**Auth-gated**: `server/projectAccess.js` — `canUserAccessProject()` is called on Socket.io `join` (confirmed by H7-FIX reference in `03-CURRENT-STATE.md`). JWT verified on WS handshake.

**Offline/reconnect**: Socket.io handles automatic reconnection with exponential backoff. On reconnect, the client re-fetches the latest snapshot + replays missed commands from the event log (confirmed by `SyncStateEngine.ts` in `src/engine/subsystems/core/sync/`). Clean resync confirmed by 9/9 workflow tests.

**Audit log**: `project_command_log` table in the database schema. Every command is persisted server-side.

**SCORE: 8/10** — Socket.io + command log + element-level granularity + presence + BCF is a strong foundation. **Wave A19 ✅**: ~~LWW-only conflict resolution~~ → `YjsDocAdapter.ts` (Yjs CRDT adapter on y-websocket); `CRDTConflictResolver.ts` (CRDT merge with CONFLICTED state machine); `ConflictResolutionDialog.ts` (user-facing resolution UI); `ConflictDisclosureBanner.ts`; `PresenceService.ts` (server-authoritative displayName); crdt-merge bench `< 80ms p95 ✅`. Phase 2D COMPLETE. Remaining gaps: no operational transform fallback for very high-frequency edits (> 1000 ops/sec), no offline-merge scenario for multi-day disconnected edit (post-GA).

---

## 8. AUTOMATION PIPELINES

**STATUS: WARN**

**FINDINGS:**

**CI/CD**: No GitHub Actions workflow YAML files found (`.github/` contains only `ISSUE_TEMPLATE/` and `workflows/` directory appears empty of YAML). **Replit Deployments is the CI/CD mechanism.** Turborepo (`turbo.json`) defines `build`, `test:ci`, `lint` tasks with caching. The 5 GA gate scripts in `tools/ga-gate/` are the CI hard-fail guards, but they are not wired to automated branch protection or pre-merge checks — they run as workflow tasks, not as PR-blocking gates.

**Automated model processing**: `apps/bake-worker/` — receives command event batches, runs geometry producers in `worker_threads`, writes content-addressed chunks to the storage driver (ADR-005, 250ms coalescing window, ADR-010). This is the server-side geometry bake pipeline. No automated IFC validation on upload confirmed.

**Background jobs**:
- `apps/bake-worker/` — geometry bake (running ✅)
- `apps/ai-worker/` — BullMQ-style AI job queue (in-memory dev, Redis-backed prod)
- `apps/export-worker/` — async PDF/IFC/DXF export off main HTTP thread (scaffold only — "Phase F prereq.0")

**Job queue system**: `apps/ai-worker/package.json` documents "BullMQ-style queue + handler registry behind a `createQueue({env})` factory." In-memory in dev, `BullMqQueue` adapter loaded via dynamic import gated on `REDIS_URL` in prod. No confirmed Redis setup in the Replit environment (no `REDIS_URL` in env).

**Observable/cancellable jobs**: `GET /v1/ai/jobs/:jobId/status` in `server/aiPublicApiRoutes.js` provides job status polling for AI jobs. No cancellation endpoint confirmed.

**Webhooks**: `server/webhookService.js` + `packages/webhooks/` — outbound webhook delivery for model lifecycle events. `POST /api/v1/projects/:id/webhooks` to register. Event types not fully enumerated in audited code.

**Event-driven model lifecycle**: Command log + bake-worker constitutes an event-driven pipeline for model changes. No explicit event types for "uploaded", "processed", "published" beyond the ISO 19650 CDE state transitions.

**Scheduled jobs**: No cron jobs, scheduled workers, or nightly batch processes found.

**IFC validation pipeline**: No buildingSMART ruleset, bSDD, or IDS validation on import confirmed. `auditIfc.ts` in `src/engine/subsystems/export/ifc/` performs post-export audit. `StairComplianceReporter.ts` and `RuleEngine.ts` do building regulation checks but these are design-time, not import-time.

**SCORE: 7/10** — Background workers for geometry bake + AI + export are architecturally sound. **Wave A14 ✅**: ~~no automated CI pipeline~~ → `.github/workflows/ci.yml` with PR-blocking: `turbo run test:ci lint`, E2E (Playwright), WCAG audit jobs, all 5 GA gate scripts (`check-cast-count.ts`, `check-raf-count.ts`, `check-l7-boundary.ts`, `check-engine-bootstrap-loc.ts`, `check-motion-gate-coverage.ts`). **Wave A18 ✅**: `bench-visual-diff/src/index.ts` (159 LOC); 11 E2E tests in CI. Remaining gaps: export-worker still a scaffold (no chunked streaming), no Redis for prod job queue (in-memory only), no scheduled jobs for IFC import validation pipeline.

---

## 9. PLUGIN SYSTEM & EXTENSIBILITY

**STATUS: PASS**

**FINDINGS:**

**Plugin system**: Yes — **47 plugins** under `plugins/` (corrected 2026-05-04 rev 23: +`plugins/family-editor/` stub added Wave A20), all conforming to the canonical recipe (`store.ts`, `handlers/`, `tool.ts`, `intent.ts`, `contributions.ts`). Wave 12 confirmed all 30 non-stub plugins are recipe-complete.

**Plugin loading**: iframe sandbox (`packages/plugin-sdk/src/sandbox/iframe-sandbox.ts`). Each plugin is loaded in its own browsing context with a restrictive CSP. Ed25519 signature verification (`packages/plugin-sdk/src/signing.ts`) — plugins must be signed by the author key embedded in their manifest before the sandbox opens.

**Stable public API**: `packages/plugin-sdk/` **v1.0.0** ✅ (Wave A20 2026-05-04 — K3-C gate CLOSED). Six host proxies expose safe bridges from the plugin sandbox to platform internals: `hosts/command-bus.ts`, `hosts/stores.ts`, `hosts/views.ts`, `hosts/selection.ts`, `hosts/ai.ts`, `hosts/format.ts`. The boundary is enforced by `no-direct-pryzm-in-plugins` ESLint ERROR rule — 0 violations ✅ (Wave 12). K3-C gate scripts verify: **47 plugins** signed, 22/22 proxy+lifecycle+sandbox checks, 26/26 locked API symbols with 0 breaking changes. npm-publish ready (manual step — OI-011).

**Plugin capabilities**: Can add toolbar items (via `contributions.ts` `kind:` entries), panels (via `viewRegistry`), property renderers (via stores host), custom geometry (via command-bus host). Custom geometry at the THREE scene level is not directly accessible from plugin sandbox (correct — security boundary).

**Versioned + dependency-declared**: Each plugin `package.json` declares `version` and `peerDependencies` on `@pryzm/plugin-sdk`.

**Plugin isolation**: Iframe sandbox — separate browsing context per plugin, `postMessage` bridge. Plugins **cannot** access the main thread's JavaScript heap directly. `sandbox/escape-tests.ts` verifies the sandbox cannot be escaped.

**Marketplace**: **Wave A20 ✅ 2026-05-04** — Plugin marketplace server-layer is live: `/marketplace/api/plugins` (GET list + GET `/:id` + POST `/submit`) routes in `server.js`; `marketplace_plugins` PostgreSQL table created in `server/dbMigrate.js`; `MarketplaceFacet.ts` in `packages/runtime-composer/src/facets/` provides `runtime.marketplace.install(pluginId)` — downloads, verifies Ed25519 signature, stores in IndexedDB, activates sandbox; 5 reference plugins seeded (BCF, Wall, IFC Inspector, Family Editor, Schedules); `apps/marketplace/` scaffold + README. External infra remaining: DNS `marketplace.pryzm.app` + TLS (Wave A20 DEFERRED — external infra). `server/familyMarketplaceRoutes.js` still live for `.pryzm-family` artefacts.

**Hot-reload**: `packages/plugin-sdk/src/dev/cli.ts` — `pryzm dev` CLI with hot reload and manifest validation for plugin development.

**Developer SDK**: `packages/plugin-sdk/` **v1.0.0** (Wave A20 ✅ 2026-05-04) — `publishConfig.name=@pryzm/sdk`; CHANGELOG.md written; K3-C gate CLOSED (all 3 audit scripts pass). **npm-publish ready**; manual step remaining: `pnpm --filter @pryzm/sdk publish --access public` (npm auth token — external). No public documentation site beyond `apps/docs-site/` (Astro Starlight scaffold).

**Stub plugin promotions**: **Wave A20 ✅** — 5 of 16 stubs promoted to real implementations with full `PluginManifest` descriptors (`pryzmPlugin: '1.0'` envelope per ADR-0038): `plugins/navigate/` (camera bookmarks, nav rail), `plugins/visibility-intent/` (hide/isolate/reveal), `plugins/geospatial/` (CRS picker, LTP-ENU, terrain), `plugins/ifc-import/` (IFC 4.3 file import), `plugins/ai-floorplan/` (AI workflow panel). 11 stubs remain for future phases.

**Security model**: Plugins can access: model data via stores host (read-only projections), camera via views host, command dispatch via command-bus host, AI via ai host, file format via format host. Plugins **cannot** directly access: THREE scene graph, localStorage/sessionStorage, arbitrary network (CSP restricts fetch origins), DOM outside their iframe.

**SCORE: 9/10** — The plugin architecture is genuinely next-gen: iframe sandbox + Ed25519 signing + stable SDK boundary + ESLint-enforced layer isolation + v1.0.0 SDK ready + marketplace server API live is the correct production model. Remaining for 10/10: npm publication of `@pryzm/sdk` (manual), live DNS for `marketplace.pryzm.app` (external infra), remaining 11 stub promotions.

---

## 10. SDK & PUBLIC API

**STATUS: WARN**

**FINDINGS:**

**Published SDK**: **Wave A20 ✅ 2026-05-04 — Code ready, npm publish pending (external infra).** `packages/plugin-sdk/` **v1.0.0** — `publishConfig.name=@pryzm/sdk`; CHANGELOG.md written; K3-C gate CLOSED. `check-pryzm3-exists.ts` boolean #7 → TRUE. Manual step remaining: `pnpm --filter @pryzm/sdk publish --access public`. `packages/headless/` **v0.1.0** — `composeHeadlessRuntime` alias implemented (`packages/headless/src/index.ts`); vitest tests written (`packages/headless/__tests__/headless.test.ts`). Boolean #8 → TRUE per `check-pryzm3-exists.ts`. Manual publish step remaining.

**SDK surface**: `packages/plugin-sdk/` provides the plugin authoring surface (L6 facade: 6 host proxies, iframe sandbox, Ed25519 signing, `pryzm dev` CLI). `packages/headless/` is the DOM-free runtime entry — `composeHeadlessRuntime()` wraps `composeRuntime({ canvas: null })` for Node.js/test/server use.

**Iframe embed mode**: **Wave A20 ✅** — `GET /embed?projectId=X&token=Y` route in `server.js` returns a minimal frameable HTML shell. `X-Frame-Options: SAMEORIGIN` relaxed for authenticated embeds. C07 §6 clause added. Verified: HTTP 200 ✅.

**bSDD property lookup**: **Wave A20 ✅** — `packages/plugin-sdk/src/bsdd.ts` — `BsddPropertyLookup` + `getBsddLookup()` typed client for the buildingSMART Data Dictionary API (`https://identifier.buildingsmart.org/uri/buildingsmart/ifc-4.3`). LRU-cached (200 entries/session). Exported from `@pryzm/plugin-sdk` main barrel. Requires `network:fetch` permission when called from a plugin.

**Marketplace API**: **Wave A20 ✅** — `GET /marketplace/api/plugins` (paginated catalog), `GET /marketplace/api/plugins/:id` (detail), `POST /marketplace/api/plugins/submit` (Ed25519-signed bundle). `marketplace_plugins` PostgreSQL table. 5 reference plugins seeded. `MarketplaceFacet.ts` at L3 provides `runtime.marketplace.install/uninstall/list`.

**REST API**: Phase E-1 through E-4 endpoints in `server/api/v1/routes.js`:
- `GET /api/v1/projects/:id/model` — full ProjectSnapshot JSON
- `GET /api/v1/projects/:id/rooms` — all rooms
- `GET /api/v1/projects/:id/rooms/:roomId` — single room + graph
- `GET /api/v1/projects/:id/graph` — full SemanticGraph
- `GET /api/v1/projects/:id/compliance` — compliance results
- `GET /api/v1/projects/:id/programme` — programme brief vs model
- `GET /api/v1/projects/:id/hierarchy` — spatial hierarchy
- `GET /api/v1/projects/:id/schedules/:type` — schedules (JSON/CSV)
- `GET /api/v1/projects/:id/ifc` — IFC export metadata
- `GET /api/v1/portfolio` — cross-project analytics
- `POST/GET/DELETE /api/v1/projects/:id/webhooks` — webhook CRUD
- `POST/GET /api/v1/templates/registry` — template registry
- AI routes: `GET /v1/ai/jobs/:jobId/status`

**GraphQL / tRPC**: Not found anywhere in the codebase.

**OpenAPI spec**: `packages/api-spec/` with `src/index.ts` and tests (`openapi-smoke.test.ts`, `openapi-spec.test.ts`). Generated by `scripts/gen-openapi.mjs`.

**Webhooks**: ✅ Confirmed — `server/webhookService.js` + webhook CRUD endpoints.

**Authentication**: JWT (Bearer token for REST API). `server/authStore.js` mints the token. `oauthService.js` for Google/Microsoft OAuth2. `packages/oauth2-pkce/` for future public API auth via PKCE.

**Rate limiting**: Three-tier rate limiting in `server/rateLimiter.js` — global limiter (all `/api/*`), `apiLimiter` (v1 routes, 60 req/min), `aiLimiter` (AI routes, 10 req/min). `packages/rate-limit/` for client-side limiting.

**SCORE: 7/10** — **Wave A20 ✅**: SDK v1.0.0 npm-publish ready; `composeHeadlessRuntime` implemented + tested; iframe embed route live; bSDD property lookup in SDK; marketplace API (list + submit + detail) live with 5 reference plugins. Remaining for 10/10: npm publication (manual), GraphQL/tRPC (no sprint allocated), public SDK documentation site beyond Astro scaffold. Strong RBAC (`packages/api-rbac/`) and webhook delivery remain genuine strengths.

---

## 11. UI/UX ARCHITECTURE

**STATUS: PASS**

**FINDINGS:**

**Component library**: Hybrid — `@thatopen/ui ^3.4.0` + `@thatopen/ui-obc ^3.4.0` for BIM-specific components (property panels, spatial tree, IFC inspector), custom HTML/CSS/TypeScript panels for PRYZM-specific UI (the 436 files in `src/ui/`), Tailwind CSS for utility styling, `chart.js ^4.5.1` for schedule charts. **React 19 is installed but UI panels are implemented as vanilla TypeScript classes**, not React components — they construct DOM directly. This is a deliberate choice consistent with the @thatopen stack's Web Component approach.

**3D canvas vs. 2D UI layering**: `src/ui/canvas/` + `AnnotationRenderLayer.ts` handle the 2D canvas overlay. CSS z-index layering is managed by `src/engine/subsystems/styles/` (44 files, 30,991 LOC — the stylesheet injection system). `pointer-events: none` on overlaid canvases is the standard approach and likely implemented in the styles layer.

**Tool modes as state machine**: Confirmed — `src/engine/subsystems/tools/SelectionManager.ts` (2,141 LOC) + individual tool handlers (`WallTool.ts`, `DoorTool.ts`, etc.). Each tool implements activate/deactivate lifecycle. `PlatformRouter.ts` and `WorkspaceModeController.ts` coordinate mode transitions at the platform level.

**Command palette / keyboard shortcuts**: `src/ui/ShortcutCheatSheet.ts` provides the cheat-sheet UI. Keyboard shortcut bindings are present in individual tool files. No unified command palette (cmd+K style) confirmed.

**Property inspector**: `src/ui/property-inspector/` + `src/ui/property-panel/` + `src/ui/ViewPropertiesPanelBuilders.ts` + `src/ui/ViewPropertiesPanel.ts`. Reflects selected element parameters. `PropertyInspector.spec.ts` and `PropertyPanel.spec.ts` are binding tests.

**Model tree / spatial hierarchy**: `src/ui/SpatialTree.ts` — the spatial hierarchy navigator. `src/ui/ViewBrowser/panels/UnifiedBrowserPanel.ts` with `ProjectTreeSection.ts`, `ElementsSummarySection.ts`, `ProjectVisibilitySection.ts`.

**2D/3D synced views**: `src/engine/subsystems/core/views/SplitViewManager.ts` (1,590 LOC) + `PlanViewManager.ts` + `SectionViewService.ts`. The plan view and 3D view are synchronized via shared stores (`ActiveViewStore`).

**Measurement tool**: `src/engine/subsystems/annotations/tools/LinearDimensionAnnotationTool.ts` (1,488 LOC), `AngularDimensionAnnotationTool.ts`, `DiameterDimensionTool.ts`, `RadiusDimensionTool.ts`. Area measurement via `rooms` plugin. Volume not confirmed.

**Section plane UI**: `SectionViewService.ts` + `SectionToolbar.ts` + `SectionPlanToolHandler.ts`. Section plugin with 21/21 tests ✅.

**Markup / redline annotation**: `RevisionCloudPanel.ts`, `AnnotationRenderLayer.ts` (2,628 LOC), full annotation toolbar. 35/35 annotation plugin tests ✅.

**Responsive for tablet**: **Wave A20 ✅ 2026-05-04** — Tablet layout implemented in `src/ui/styles/layout.css`: 768–1024px breakpoint with `@media (max-width: 1024px) and (min-width: 768px)` — collapsed left rail, floating toolbar, touch-optimised panel widths. Mobile breakpoint `@media (max-width: 767px)` also added. Basic mobile detection in `engineLauncher.ts` (`const isMobile = window.innerWidth < 768 || 'ontouchstart' in window`) remains as the JS-side complement.

**Loading states / progress bars / error boundaries**: `src/ui/fallbacks/` for error boundaries. `packages/crash-reporter/` for client-side crash capture. Loading states are in individual panel constructors.

**Dark/light theme**: `src/engine/subsystems/rendering/pipeline/BackgroundUniform.ts` and `RenderPipelineManager.ts` support `'dark' | 'light'` theme for the 3D background. `src/engine/subsystems/core/SceneTheme.ts` manages scene-level theming.

**Onboarding / empty state**: `src/ui/ViewBrowser/ExistingProjectsPanel.ts` + project browser as the hub. Specific empty-state / onboarding flow not confirmed.

**SCORE: 7/10** — A comprehensive BIM UI surface with the right tools, panels, and views. React is installed but not used for the editor panels (a tech-debt risk — new developers expect React, the actual patterns are vanilla TypeScript class construction). No unified command palette, minimal responsive design, no confirmed onboarding flow.

---

## 12. ACCESSIBILITY

**STATUS: FAIL**

**FINDINGS:**

**3D canvas keyboard navigation**: `engineLauncher.ts` detects mobile via `'ontouchstart' in window` but no keyboard-navigable 3D viewport found. No `tabIndex` on the THREE canvas element, no keyboard orbit/pan/zoom confirmed. The ViewCube (`src/ui/ViewCube.ts`) provides preset view buttons but keyboard access to those buttons is not confirmed.

**ARIA labels**: Minimal. The `@thatopen/ui` components likely carry some ARIA attributes from the Web Component spec, but first-party panels (84+ vanilla TypeScript classes constructing DOM directly) show no consistent `aria-label`, `role`, or `aria-describedby` usage in the audited files.

**Focus management**: No focus trap or focus restoration on panel open/close confirmed. `src/ui/tools-panel/` and `src/ui/ViewBrowser/` manage panel visibility but focus management is not audited.

**Non-3D fallback**: `src/ui/SpatialTree.ts` and `packages/stores/` provide a data layer that could power a list view, but no confirmed non-3D list fallback for screen reader users.

**Color contrast**: `packages/wcag-audit/` exists with `audit.ts`, `critical-paths.ts`, `index.ts` — confirming awareness and tooling. Whether the color contrast in the actual UI meets WCAG AA (4.5:1 for normal text, 3:1 for large text) is not confirmed by the audit tooling being run as a CI gate.

**Screen reader**: The vanilla TypeScript DOM construction approach makes screen reader support unlikely without deliberate ARIA markup. No confirmed `aria-live` regions for dynamic panel updates.

**SCORE: 4/10** — `packages/wcag-audit/` shows intent. **Wave A18 ✅** made substantial progress: ~~no keyboard 3D navigation~~ → `KeyboardOrbitPlugin.ts` (W/S/A/D/Q/E + arrow keys + `[`/`]` for zoom + `F` for fit); ~~minimal ARIA markup~~ → 297 aria-labels added to `src/ui/` panels/toolbars; `FocusTrap.ts` modal focus management; `AriaLiveRegion.ts` for status announcements; `ScreenReaderListView.ts` virtual list; canvas `aria-label` + `role="application"` + `tabIndex=0`; `tools/scripts/wcag-audit.mjs` automated WCAG report. Still FAIL because: no external WCAG 2.1 AA audit (self-audit only), keyboard coverage of 3D tools is limited to orbit (not selection/placement), no confirmed screen reader passthrough for panel tree, no ARIA live regions on model load progress. Enterprise sales blocker remains until external audit (Equality Act 2010, EN 301 549) — post-GA.

---

## 13. BUILD & TOOLCHAIN

**STATUS: PASS**

**FINDINGS:**

**Bundler**: Vite `^7.3.2` + `@vitejs/plugin-react ^4.7.0`. Vite is the correct choice — faster HMR than Webpack, native ESM, excellent chunk splitting.

**WASM import strategy**: `web-ifc`, `manifold-3d`, and `rhino3dm` are loaded via dynamic `import()` (confirmed by `optimizeDeps.exclude: ['web-ifc', 'three']` in `vite.config.ts` and `DxfParser.ts`, `RhinoImporter.ts` dynamic import patterns). `vite-plugin-cesium ^1.2.23` handles Cesium asset copying.

**Web Workers bundled**: `DrawingPipelineWorker.ts` is a Worker entry via `new Worker(new URL('./DrawingPipelineWorker.ts', import.meta.url), { type: 'module' })` pattern. Vite bundles Worker entries as separate chunks automatically.

**Bundle size**: Manual chunk splits in `vite.config.ts`:
- `cesium` — CesiumJS (~3 MB gzipped)
- `web-ifc` — IFC WASM (~8 MB total)
- `thatopen` — @thatopen/components stack
- `three` — Three.js
- `pathtracer` — three-gpu-pathtracer
- `pdfjs` — PDF.js
- `dxf` — dxf parser
- `rhino3dm` — Rhino WASM
- `chart.js`

`scripts/verify-bundle-size.mjs` enforces the NFT 15 budget (< 4 MB gzipped core). Total pre-split JS will be very large (10+ MB) but HTTP/2 parallel loading + aggressive code splitting mitigates this. Actual measured numbers not available without running a build.

**Tree-shaking**: Three.js: `optimizeDeps.exclude: ['three']` prevents Vite from pre-bundling Three.js, relying on the library's own ESM tree-shakability. `@thatopen` packages are similarly excluded. However, with 467 direct THREE importers, the effective tree-shaking of THREE is poor — many unused Three.js classes will be bundled.

**TypeScript strict mode**: `tsconfig.base.json` — strict mode confirmed (inferred from `check-cast-count.ts` enforcing 0 non-shim `(window as any)` casts, which requires `noImplicitAny`).

**Monorepo**: pnpm workspaces + Turborepo. **58 packages + 13 apps + 47 plugins** + tools (corrected 2026-05-04 rev 23). Correct pattern for this scale.

**Environment configs**: `.env` and `.env.production` patterns (standard Vite). `pryzm-selfhost/.env.example` found. No `.env` file committed (correct). Environment variables managed via Replit Secrets.

**Source maps**: Not confirmed. Vite generates source maps in dev by default. Production source maps (`build.sourcemap`) not confirmed in `vite.config.ts` snippet.

**SCORE: 8/10** — Vite 7 + pnpm monorepo + Turborepo + manual chunk splits is the right stack. **Wave A15 ✅**: ~~tree-shaking of THREE.js is poor (467 importers)~~ → 0 direct THREE importers in application code; `packages/renderer-three/src/three-re-export.ts` is sole entry point; effective THREE tree-shaking now enabled. `pnpm run build` EXIT:0, chunk sizes within limits except 3 vendor chunks (three, thatopen, web-ifc — expected for BIM). Remaining gaps: no confirmed production source maps (`//# sourceMappingURL=` not verified in prod build), `EnhancedBloomService.ts` still pulls `three/examples/jsm/postprocessing/EffectComposer.js` (examples not tree-shaken; deferred).

---

## 14. TESTING STRATEGY

**STATUS: WARN**

**FINDINGS:**

**Test file count**: 591 test files (`.spec.ts` + `.test.ts`), not counting the 17 NFT bench files. Vitest `^4.1.5` throughout. `happy-dom ^15.11.7` for DOM simulation in Vitest.

**Workflow tests**: 9/9 workflows green ✅:
- `bcf-round-trip`: 57/57
- `family-editor-quality-gates`: 17/17
- `ifc-export-tier1`: 16/16
- `ifc-import-tier2`: 18/18
- `ifc-inspector-pset-editor`: 12/12
- `pryzm-persistence`: 144/144
- `pryzm-vi-parity`: 82/82
- `rhino-import-3dm`: 4/4

**Unit tests for geometry/math**: `packages/geometry-kernel/__tests__/produceBoolean.test.ts` — CSG Boolean. `packages/constraint-solver/__tests__/engine.test.ts` + `PlanegcsAdapter.test.ts` — constraint solver. `packages/command-bus/` tests. These are genuine unit tests with no DOM dependency.

**IFC parsing correctness**: `ifc-import-tier2` (18 tests) + `ifc-export-tier1` (16 tests) via dedicated workflows. These are integration tests with real IFC files.

**Visual regression**: `packages/bench-visual-diff/` is an **empty package** (0 source files — confirmed in `03-CURRENT-STATE.md`). No Percy, Chromatic, or screenshot diffing is implemented.

**Worker interaction tests**: `packages/frame-scheduler/__tests__/worker-pool.test.ts` — worker pool tests. `packages/constraint-solver/__tests__/` includes worker integration.

**E2E tests**: **Wave A18–A20 ✅** — 11 Playwright E2E tests in `tests/e2e/`: `cold-boot.spec.ts`, `ifc-open.spec.ts`, `wall-create.spec.ts`, `bcf-roundtrip.spec.ts`, `ifc-export.spec.ts`, `undo-redo.spec.ts`, `section-plane.spec.ts`, `property-inspector.spec.ts`, `keyboard-shortcuts.spec.ts`, `offline-mode.spec.ts`, `pwa-install.spec.ts` (test 11, Wave A20 — manifest valid, SW registered, installable). `playwright.config.ts` (Chrome/Firefox/WebKit). E2E + WCAG CI jobs in `.github/workflows/ci.yml`.

**Performance regression**: `apps/bench/src/benches/` — 17 bench files covering: `cold-boot`, `project-load`, `tool-latency`, `frame-budget`, `plan-view-redraw`, `sheet-view-redraw`, `crdt-merge`, `sync-conflict`, `ifc-import-tier1`, `ifc-export-tier1`, `bcf-roundtrip`, `family-load`, `schedule-rebuild`, `ai-critique`, `bundle-size`, `memory-ceiling`, `plugin-sandbox-overhead`. These are NFT harness tests, not live FPS/Lighthouse checks.

**Mutation / fuzz testing**: Not found.

**buildingSMART sample files**: Not confirmed. The IFC tests use project-specific IFC files.

**UI binding tests**: `src/ui/__tests__/binding/` (40 spec files) + `src/ui/toolbar/__tests__/` (28 spec files) — all 68 confirm panel/toolbar `runtime.*` subscription patterns without `(window as any)`. These are the Phase B/C recovery verification tests.

**Overall test coverage %**: Not reported. No Istanbul/c8 coverage config found.

**SCORE: 7/10** — **Wave A18–A20 ✅**: 11 Playwright E2E tests added (cold-boot → pwa-install, including Wave A20 PWA installability test); CI integration of E2E + WCAG jobs; `bench-visual-diff/src/index.ts` TypeScript API (159 LOC); `vitest.config.ts` coverage (v8). Strong integration test coverage for IFC, BCF, persistence, and VI parity. 17 NFT bench files is genuine NFT discipline. Remaining for 10/10: visual regression screenshots not yet diffing, no coverage reporting configured, no buildingSMART sample file validation, no mutation/fuzz testing on IFC parser.

---

## 15. SECURITY

**STATUS: WARN**

**FINDINGS:**

**API keys in client code**: No first-party secrets found in client code. Anthropic API calls are proxied through the server (`/api/anthropic/v1/messages` — never called directly from the browser). `SUPABASE_ANON_KEY` is used client-side (this is by design — Supabase anon keys are intended to be public, protected by RLS). Stripe public key is client-side (correct Stripe pattern). `SESSION_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, Stripe secret keys are server-only.

**IFC file sanitization**: `multer` with `storage: multer.memoryStorage()` handles file uploads. 50MB hard cap confirmed in `dwgConversionService.js`. IFC files are parsed via `web-ifc` (WASM) — WASM memory isolation provides some sandboxing against malformed files. No explicit content-type validation (IFC MIME type check) or filename sanitization found.

**XSS via property display**: IFC property strings displayed in panels are a potential XSS vector. `@thatopen/ui` Web Components use Shadow DOM which provides some isolation, but first-party panels that construct DOM via `element.innerHTML = ` or template strings are at risk. No `DOMPurify` or sanitization library found in `package.json`. **This is a WARN** — IFC Pset values can contain arbitrary strings, and if rendered via innerHTML, an attacker can embed `<script>` in an IFC file.

**CORS**: `server/corsPolicy.js` — `getAllowedOrigins()` reads `ALLOWED_ORIGIN` env var. Socket.io CORS is configured separately. Correct pattern.

**WebSocket auth**: `server/projectAccess.js` called on Socket.io join (H7-FIX). JWT verified.

**Input validation on API endpoints**: Rate limiting enforced. Request bodies parsed by Express JSON middleware. No explicit schema validation (e.g., Zod validation of request bodies) confirmed for all endpoints — some endpoints may accept arbitrary payloads.

**File upload scanning**: No antivirus/malware scanning on uploaded IFC/DXF/DWG files. Size limit (50MB) is the only guard.

**CSP**: `server/securityHeaders.js` — CSP is `report-only` in dev, `enforce` in production. The CSP is noted as "start with a permissive policy and tighten iteratively" — meaning the current production CSP may be too permissive to block XSS.

**WASM from trusted sources**: All WASM modules (`web-ifc`, `manifold-3d`, `rhino3dm`) are npm packages from known publishers. No CDN-loaded WASM.

**Dependency audit**: `npm audit` not confirmed as part of CI. `packages/eslint-plugin-pryzm/` provides code-level security rules but no dependency vulnerability scanning.

**Auth**: bcrypt 12 rounds for password hashing (correct). JWT with 30-day expiry (long — consider shorter-lived tokens + refresh token pattern for enterprise security). `packages/api-rbac/` for REST API role-based access control.

**SCORE: 6/10** — Solid fundamentals: bcrypt, server-side AI proxy, CORS policy, 3-tier rate limiting, multer size caps, CSP enforcement in prod, Supabase RLS. Critical gaps: no IFC property string sanitization (XSS vector), CSP policy is "permissive" by design note, no dependency vulnerability scanning in CI, no antivirus on uploaded files, no explicit Zod validation on all API request bodies.

---

## 16. OBSERVABILITY & MONITORING

**STATUS: WARN**

**FINDINGS:**

**Error tracking**: No Sentry, Datadog, Highlight, or LogRocket confirmed. `packages/crash-reporter/` exists (client-side crash capture) but its sink destination is not confirmed — it may log to console or the server's `scan-logs.js`. No third-party error aggregation service is wired.

**Performance monitoring**: 482 files import `@opentelemetry/api` — OpenTelemetry spans are pervasive in the codebase (command bus, IFC import/export, sync client, visibility, geometry kernel, rendering pipeline). `packages/command-bus/src/otel.ts` wraps every command dispatch in a span. `packages/sync-client/src/tracing.ts` traces sync operations. However, no OTel Collector, Jaeger, Zipkin, Honeycomb, or Tempo endpoint is configured — the spans are being created but not exported anywhere in the observed code.

**3D-specific metrics**: `apps/bench/src/benches/frame-budget.bench.ts` — NFT frame budget test. `src/engine/subsystems/core/rendering/RenderPerformanceService.ts` — in-engine render metrics. `src/engine/subsystems/core/rendering/RenderingAuditData.ts` — render audit data. `PerformanceModePanel.ts` in the UI. No confirmed FPS counter exported to an external monitoring service.

**User session analytics**: No Google Analytics, Mixpanel, PostHog, Segment, or equivalent found.

**Background job failure alerts**: No PagerDuty, Slack webhook, or alerting on bake-worker/ai-worker failures.

**Structured logging**: `server/logSafe.js` — redacts sensitive fields before writing to stdout. This is structured logging intent, but JSON-structured log format not confirmed.

**Health check endpoint**: `GET /v1/ai/jobs/:jobId/status` exists for AI jobs. No `/health`, `/ping`, or `/status` endpoint found in `server.js` or API routes. **No health check endpoint means Replit's deployment health check cannot verify the app is alive.**

**SCORE: 4/10** — OTel instrumentation is impressively pervasive (482 files) but is generating spans into a void with no export target configured. No error aggregation service, no user analytics, no health check endpoint, no job failure alerting. The monitoring infrastructure is scaffolded but not connected.

---

## 17. STANDARDS & INTEROPERABILITY

**STATUS: WARN**

**FINDINGS:**

**buildingSMART compliance**: No IFC certification claimed or achieved. `web-ifc ^0.0.77` is not buildingSMART certified. The IFC export (`ifc-export-tier1` 16/16 tests) is tested against PRYZM's own test models, not against buildingSMART's official validation suite.

**bSDD**: `bSDD` not found in any first-party source file.

**COBie**: Not found. No COBie handover sheet generation.

**BCF REST API compliance**: `plugins/bcf` is functional (57/57 tests) but which BCF API version (2.1 or 3.0) is implemented is not confirmed. The BCF round-trip test suite uses PRYZM's own test cases, not the buildingSMART conformance test suite.

**CDE integrations**: `CDEBrowserPanel.spec.ts`, `CDEStatusPanel.spec.ts`, `CDETransmittalPanel.spec.ts` exist as binding tests. `server/versionStateMachine.js` implements ISO 19650 CDE state machine (WIP → SHARED → PUBLISHED → ARCHIVED). The ISO 19650 state machine is genuine; however, integration with external CDE platforms (Autodesk Construction Cloud, Procore, BIM 360, Asite) is not confirmed — the panels may be shells.

**MVD filtering**: Not found.

**IDS validation**: Not found.

**Classification systems**: `Uniclass` and `MasterFormat` are referenced in annotation type definitions (`AnnotationTypes.ts`: "Free-form structured data (e.g. IFC classification codes, Uniclass references)") and `KeynoteTool.ts` ("CSI MasterFormat, Uniclass, NRM, etc."). These are storage fields, not validated against the actual classification taxonomies.

**IFC schema compliance**: IFC2X3 + IFC4 export with correct semantic classifications (`IfcWall`, `IfcSlab`, `IfcDoor`, `IfcWindow`, `IfcBeam`, etc.). `IfcPropertyWriter.ts` for Psets. `IfcSpatialStructure.ts` for Site→Building→Floor hierarchy. These are implemented and tested. IFC4X3 is type-declared but not implemented.

**SCORE: 5/10** — The ISO 19650 CDE state machine and IFC2X3/IFC4 export are genuine. BCF is functional. But the absence of bSDD, COBie, IDS, MVD, IFC certification, and confirmed external CDE integrations limits the claim to "standards-aware" rather than "standards-compliant." This is a significant gap for enterprise/government procurement.

---

## 18. MOBILE & CROSS-PLATFORM

**STATUS: WARN** *(upgraded from FAIL — Wave A20 ✅ 2026-05-04: PWA manifest + SW + tablet layout implemented)*

**FINDINGS:**

**Mobile browser support**: Basic mobile detection in `engineLauncher.ts`: `const isMobile = window.innerWidth < 768 || 'ontouchstart' in window`. The app adapts some behavior on detection, but no mobile-optimized layout, reduced geometry budget, or touch-first controls are confirmed.

**WebGPU on mobile**: iOS Safari does not support WebGPU (as of 2026-05). The current WebGL fallback (primary renderer) would run on iOS Safari, but no graceful progressive enhancement code path is confirmed. The WebGPU migration (`RenderPipelineManager.ts`) must include mobile fallback.

**Touch gesture support**: `nosleep.js ^0.12.0` is in the lockfile (via Cesium), suggesting the Cesium globe integration has some mobile awareness. `'ontouchstart' in window` is detected in `engineLauncher.ts`. `camera-controls ^3.1.2` (dependency) supports touch gestures (pinch-zoom, rotate, pan) natively. Pinch-zoom in the 3D view is likely functional via camera-controls; plan view touch is not confirmed.

**PWA**: **Wave A20 ✅ 2026-05-04** — The app is now installable as a PWA:
- `public/manifest.json` — `name: PRYZM BIM`, `short_name: PRYZM`, icons (192px + 512px from `/icons/pryzm-pyramid-logo.png`), `start_url: /`, `display: standalone`, `theme_color: #1e3a5f`. HTTP 200 verified.
- `public/sw.js` — cache-first strategy for app shell assets; network-first for `/api/*` calls; background sync queue for pending mutations (`pryzm-mutations-queue`). HTTP 200 verified.
- `src/main.ts` — SW registration: `navigator.serviceWorker.register('/sw.js')` (prod-only; `?sw=1` override for dev). Update check on navigation: `reg.update()` on `visibilitychange`.
- `index.html` — `<link rel="manifest" href="/manifest.json">`, `<meta name="theme-color" content="#1e3a5f">`, Apple PWA meta tags.
- E2E test 12: `tests/e2e/pwa-install.spec.ts` — validates manifest valid + SW registered + installable (Playwright/Chromium).
- No `workbox` — service worker is hand-written (appropriate for a custom BIM app with complex caching rules).

**AR/XR**: No WebXR API usage found. No `navigator.xr` references. No AR site overlay capability.

**Context loss handling**: No `webglcontextlost` / `webglcontextrestored` event handling confirmed in first-party code. Context loss on mobile backgrounding would crash the renderer without recovery. (Deferred — post-GA.)

**Tablet layout**: **Wave A20 ✅** — `src/ui/styles/layout.css` — 768–1024px breakpoint (collapsed left rail, floating toolbar, touch-optimised panel widths) + mobile breakpoint (≤767px). Complements JS-side `isMobile` detection in `engineLauncher.ts`.

**SCORE: 6/10** — **Wave A20 substantially improved this section** (was 2/10). PWA manifest + service worker + SW registration + tablet layout are all implemented and verified. `camera-controls` provides touch orbiting. Remaining gaps: no WebXR/AR, no context loss handler, no confirmed iOS-specific testing, no graceful WebGPU → WebGL fallback on mobile. Field/site-ready for tablet browsing; native-app install now possible.

---

## OVERALL SUMMARY

### Critical Failures (FAIL) — Must fix before any production use:

| # | Section | Failure | One-line fix | Wave A20 Status |
|---|---|---|---|---|
| 1 | **Accessibility** | No keyboard navigation in 3D viewport, no ARIA on first-party panels, no focus management | Add `tabIndex`, ARIA roles, and focus trap to all panels; implement keyboard orbit in the ViewCube | 🟡 PARTIAL — Wave A18 added `KeyboardOrbitPlugin.ts`, 297 aria-labels, `FocusTrap.ts`, `AriaLiveRegion.ts`, `ScreenReaderListView.ts`. Full WCAG cert requires external audit. |

> **Note**: Mobile / Cross-platform was FAIL (2/10) at audit time. **Wave A20 ✅ upgraded to 6/10** — PWA manifest + SW + tablet layout implemented. No longer a critical failure; context loss + WebXR remain as lower-priority gaps.

### High-Priority Warnings (WARN) — Fix within next 2 sprints:

| # | Section | Warning | One-line fix | Wave A20 Status |
|---|---|---|---|---|
| 1 | **Rendering** | ~~467 direct THREE importers~~ violates P2 | ~~Complete Wave 7/8~~ | ✅ **CLOSED** — Wave A15: `packages/renderer-three/` sole `three` importer; `check-three-imports.ts` gate → 0 violations |
| 2 | **IFC / Data Model** | ~~IFC parsing likely main-thread; IFC4X3 type-only~~ | ~~Wrap in Web Worker; implement IFC4X3 exporter~~ | ✅ **CLOSED** — Wave A17: `IFCParseWorker.ts` + `IFCImportHandler.ts` + `IFC4X3Exporter.ts` |
| 3 | **Geospatial** | ~~float32 jitter; geospatial plugin is a stub~~ | ~~LTP-ENU rebasing; promote geospatial plugin~~ | ✅ **CLOSED** — Wave A17: `LTPENURebase.ts`; Wave A20: `geospatial` plugin promoted with full PluginManifest descriptor |
| 4 | **Persistence** | ~~No IndexedDB/OPFS offline store~~ | ~~Implement IndexedDB local cache~~ | ✅ **CLOSED** — Wave A17: `IndexedDBStore.ts` + `IndexedDbBackend.ts` + `OfflineBanner.ts`. Wave A20: PWA SW adds background sync. |
| 5 | **Collaboration** | ~~LWW conflict resolution; Yjs CRDT not landed~~ | ~~Implement Yjs Phase 2D~~ | ✅ **CLOSED** — Wave A19: `YjsDocAdapter.ts` + `CRDTConflictResolver.ts` + `ConflictResolutionDialog.ts` |
| 6 | **Automation / CI** | ~~No GitHub Actions PR-blocking gates~~ | ~~Wire ga-gate into GitHub Actions~~ | ✅ **CLOSED** — Wave A14: `.github/workflows/ci.yml` with E2E + WCAG jobs |
| 7 | **Security** | No IFC property string sanitization (XSS via IFC Pset values); CSP is "permissive" | Add DOMPurify to all innerHTML panel renders; tighten CSP | 🔴 OPEN — Post-GA |
| 8 | **Observability** | 482 OTel span files emit to no collector; no error tracking | Configure OTel OTLP export; wire Sentry | 🟡 PARTIAL — Wave A14: `server/telemetry.js` OTLP stub + `GET /health`. Full export target: Post-GA |
| 9 | **Testing** | ~~No E2E tests (no Playwright)~~; no visual regression; no coverage % | ~~Add 10 Playwright E2E tests~~ | 🟡 PARTIAL — Wave A18–A20 ✅: 11 E2E tests; `bench-visual-diff/src/index.ts` API (159 LOC). Screenshot diffing not wired. Coverage: Post-GA |
| 10 | **Standards** | ~~No bSDD~~ COBie, IDS, MVD; IFC not buildingSMART certified | ~~bSDD lookup~~ → COBie + IDS + MVD + IFC cert | 🟡 PARTIAL — Wave A20 ✅: `packages/plugin-sdk/src/bsdd.ts` bSDD client implemented. COBie/IDS/MVD/cert: Post-GA |
| 11 | **Rendering** | No LOD system for large models (> 500k elements) | Implement distance-based LOD | ✅ **CLOSED** — Wave A18: `LODManager.ts` 3-tier distance LOD (< 100m / 100–500m / ≥ 500m) |
| 12 | **SDK** | ~~plugin-sdk not npm-published~~; headless not published | ~~Run `pnpm publish`~~ | 🟡 PARTIAL — Wave A20 ✅: SDK v1.0.0 package ready + CHANGELOG + K3-C gate. Manual npm publish required (npm auth token — external infra). |
| 13 | **Threading** | Main-thread geometry builders for element families (frame-budget risk at scale) | Extract family builders to WorkerPool | 🔴 OPEN — Post-GA |

### Architectural Strengths — Worth preserving and building on:

1. **L0–L9 layer architecture with ESLint boundary enforcement** — `eslint-plugin-boundaries` + `no-direct-pryzm-in-plugins` hard-fail gate is the correct way to enforce layering at scale. The boundary is verifiably maintained (0 violations ✅).

2. **Single composition root (`composeRuntime()`)** — inversion of control means the runtime can be composed headlessly for testing, CLI tools, and server-side rendering. `packages/headless/` is the right Phase F next step.

3. **Single rAF owner (`packages/frame-scheduler/`)** — guarantees consistent frame timing, prevents animation jank, and enables deterministic performance benchmarking. The Wave D.7 arc that enforced this was worth every sub-phase.

4. **Dual render pipeline (real-time + path-tracer)** — `three-gpu-pathtracer` for offline photorealistic renders + real-time SSGI/SSAO/HDRI for interactive use is genuinely differentiating for a browser-based BIM tool.

5. **Plugin iframe sandbox + Ed25519 signing** — the security model for the plugin marketplace is correct and production-grade. Sandboxed execution with signed manifests is rare in browser BIM tools.

6. **IFC2X3 + IFC4 export with 16/16 passing tests** — real, tested, interoperable IFC export is the core open-standard commitment. The `ifc-export-tier1` workflow green light means this is not theoretical.

7. **ISO 19650 CDE state machine** — the `versionStateMachine.js` implementing WIP → SHARED → PUBLISHED → ARCHIVED transitions is rare in browser-native BIM tools and directly relevant to enterprise procurement.

8. **Command-bus event sourcing + command log** — append-only `RuntimeEventLog` backing both undo/redo and CRDT sync is the correct foundation for a collaborative BIM editor. Every state change is traceable.

9. **17 NFT bench files** — performance contracts expressed as automated bench tests (cold-boot, frame budget, IFC export, memory ceiling) is architectural discipline. Most BIM tools treat performance as a post-hoc concern.

10. **manifold-3d for CSG** — Manifold is the best-in-class open-source CSG library for the browser. Choosing it over Three.js's own CSG or other alternatives is a correct and forward-looking decision.

11. **pnpm monorepo + Turborepo** — at **58 packages + 13 apps + 47 plugins** (corrected 2026-05-04 rev 23), the monorepo structure is correctly scaled. Turborepo's task graph with caching is the right build orchestration.

12. **PWA manifest + service worker (Wave A20)** — hand-written `public/sw.js` with cache-first (app shell) + network-first (API) + background sync (mutations) is the correct pattern for a field/site BIM tool. No Workbox dependency; cache strategy is BIM-aware (WASM + large IFC files treated differently from HTML/JS app shell).

13. **bSDD property lookup (Wave A20)** — `packages/plugin-sdk/src/bsdd.ts` integrates buildingSMART Data Dictionary lookups at the L6 SDK layer (not L7 plugin layer), so any plugin can call `getBsddLookup()` without redundant HTTP infrastructure. LRU session cache prevents per-keystroke API calls.

---

### Maturity Rating:

**EARLY STAGE → approaching PRODUCTION READY**

PRYZM is a technically ambitious BIM browser with a well-engineered architectural skeleton (layer model, composition root, event sourcing, plugin sandbox, IFC round-trip). The core editing workflow — place walls, doors, windows, slabs; export IFC; collaborate in real-time; inspect properties — is demonstrably functional with 9/9 workflow tests green.

**Wave A20 update (2026-05-04)**: Several previously blocking dimensions have been substantially addressed — 11 Playwright E2E tests (was 0), PWA manifest + service worker (was FAIL → now WARN), tablet layout (was none → implemented), bSDD property lookup (now in SDK), Yjs real CRDT (was LWW-only), LOD 3-tier (was none), iframe embed mode (was absent). The FAIL count has dropped from 2 → 1 (only Accessibility remains at FAIL, partially addressed by Wave A18). Plugin SDK v1.0.0 is publish-ready with K3-C gate closed.

Remaining to reach "Production Ready" bar for enterprise procurement: (1) full WCAG 2.1 AA external audit, (2) IFC buildingSMART certification, (3) npm publication of `@pryzm/sdk` + `@pryzm/headless`, (4) DNS/TLS for `marketplace.pryzm.app`, (5) context loss handler, (6) DOMPurify on innerHTML renders (XSS risk), (7) OTel OTLP export target configured. Estimated 2–4 months of hardening for enterprise procurement readiness.

---

### Top 5 Highest-Leverage Improvements Ranked by Impact/Effort Ratio:

**1. ✅ CLOSED — Wire GA gate scripts into GitHub Actions PR blocking (Wave A14)**
`tools/ga-gate/` scripts + `.github/workflows/ci.yml` with E2E + WCAG jobs added Wave A14. Now hard-failing on CI for all P1–P4 architectural metrics.

**2. Add DOMPurify to all innerHTML panel renders + tighten CSP (Impact: HIGH / Effort: LOW)**
IFC Pset strings rendered via innerHTML are an XSS vector. `npm install dompurify @types/dompurify`, wrap all `element.innerHTML = value` sites with `DOMPurify.sanitize(value)`, tighten production CSP to a specific allow-list. 1–2 day security hardening task. **Post-GA.**

**3. Configure OTel OTLP export target (Impact: HIGH / Effort: LOW)**
482 files already instrument spans. `server/telemetry.js` OTLP stub is live (Wave A14) + `GET /health` ✅. Remaining: point at Honeycomb or Grafana Cloud (free tier). **Post-GA.**

**4. ✅ CLOSED — Playwright E2E tests (Wave A18–A20)**
11 E2E tests in `tests/e2e/` covering cold-boot → PWA install. `playwright.config.ts` (Chrome/Firefox/WebKit). CI integration in `.github/workflows/ci.yml`.

**5. ✅ CLOSED — THREE isolation (P2) (Wave A15)**
`packages/renderer-three/src/three-re-export.ts` is the sole `three` importer. `check-three-imports.ts` hard-fails at 0 violations. All ~490 import sites codemoded to `@pryzm/renderer-three/three`.

---

## FILE STRUCTURE SNAPSHOT

### Top-Level Directory Tree

```
/
├── index.html                    # Browser entry (Stage 0 boot)
├── browser.html                  # Secondary browser entry
├── server.js                     # Express server (3,417 LOC)
├── package.json / pnpm-lock.yaml / pnpm-workspace.yaml
├── vite.config.ts / vitest.config.ts / turbo.json
├── tsconfig.json / tsconfig.base.json
├── eslint.config.js / tailwind.config.js / postcss.config.js
│
├── src/                          # L7.5 transitional shell (391,598 LOC)
│   ├── engine/                   # 324 non-test .ts files
│   │   ├── engineLauncher.ts     # Stage 2 boot (2,130 LOC)
│   │   ├── EngineContext.ts
│   │   ├── inspect/              # InspectMode, LevelExplode, DiagnosticMaterial
│   │   └── subsystems/           # 36 subdirectories (ai, annotations, beams, ceilings,
│   │                             #   columns, commands, constraints, core, curtainwalls,
│   │                             #   doors, export, floors, furniture, handrails, import,
│   │                             #   legacy, lighting, monetization, openings, physics,
│   │                             #   physicsOverlay, plumbing, rendering, roofs,
│   │                             #   roomBoundingLines, rooms, services, slabs,
│   │                             #   spatial, stairs, styles, tools, topology,
│   │                             #   walls, windows)
│   └── ui/                       # 436 non-test .ts files
│       ├── toolbar/              # 30 toolbars
│       ├── ViewBrowser/          # Left rail panels
│       ├── tools-panel/          # Right rail panels
│       ├── SheetEditor/          # Sheet composition
│       ├── SchedulePanel/        # Quantity schedules
│       ├── rendering/            # Render UI panels
│       ├── ai/                   # AI panels
│       ├── property-inspector/   # Property inspector
│       ├── __tests__/binding/    # 40 panel binding tests
│       └── toolbar/__tests__/    # 28 toolbar binding tests
│
├── packages/                     # 56 canonical packages (82,627 LOC)
│   ├── schemas/                  # L0 — Zod domain schemas
│   ├── command-bus/              # L1 — typed command dispatch
│   ├── frame-scheduler/          # L1 — single rAF owner
│   ├── visibility/               # L1 — visibility intent (5 waves)
│   ├── sync-client/              # L1 — CRDT sync (LWW)
│   ├── stores/                   # L3 — Zustand stores
│   ├── runtime-composer/         # L6 — composeRuntime() (863 LOC core)
│   ├── plugin-sdk/               # L8 — plugin SDK v1.0.0 (Wave A20 ✅; npm-publish ready)
│   └── [49 more packages...]
│
├── plugins/                      # 47 plugins (58,424+ LOC — +family-editor/ stub Wave A20)
│   └── [wall, door, window, slab, beam, column, roof, curtain-wall,
│       stair, handrail, furniture, lighting, plumbing, floor, ceiling,
│       grid, levels, rooms, plan-view, section-view, view, sheets,
│       schedules, annotations, dimensions, bcf, ifc-export, ifc-import,
│       ifc-inspector, rhino-import, dxf, multiplayer, cross, selection,
│       ai-floorplan, ai-generative, ai-query, ai-rules, ai-voice,
│       render, geospatial, navigate, visibility-intent, export-pdf, toy-cube]
│
├── apps/                         # 13 applications (39,147 LOC)
│   ├── editor/                   # Main editor app
│   ├── sync-server/              # CRDT sync server
│   ├── bake-worker/              # Geometry bake worker
│   ├── ai-worker/                # AI job queue
│   ├── bench/                    # 17 NFT bench files
│   ├── component-editor/         # Family Creator SPA
│   ├── api-gateway/              # REST+WS public API
│   ├── marketplace-api/          # Plugin marketplace API
│   ├── marketplace-web/          # Marketplace SPA
│   ├── cli/                      # pryzm-cli
│   ├── docs-site/                # Astro Starlight docs
│   ├── export-worker/            # Async export (scaffold)
│   └── sync-server/
│
├── server/                       # Express backend (~32 files)
├── tools/                        # GA gate scripts + pryzm1-sunset
├── scripts/                      # Build automation (28 scripts)
├── revit-addin/                  # C# Revit bridge
├── pryzm-selfhost/               # Docker/Helm self-host
└── docs/archive/pryzm3-internal/               # Architecture documents
```

### Top 10 Largest Files by Line Count

| Rank | File | LOC | Risk |
|---:|---|---:|---|
| 1 | `src/engine/subsystems/initUI.ts` | **2,773** | ⚠ God file — UI wiring for entire editor |
| 2 | `src/engine/subsystems/annotations/AnnotationRenderLayer.ts` | **2,628** | ⚠ Complex render layer |
| 3 | `src/engine/subsystems/core/views/PlanViewAnnotationRenderer.ts` | **2,589** | ⚠ Plan-view annotation rendering |
| 4 | `src/engine/subsystems/walls/WallFragmentBuilder.ts` | **2,256** | ⚠ Wall geometry — complex but domain-justified |
| 5 | `src/engine/subsystems/initScene.ts` | **2,249** | ⚠ Scene wiring — should decompose |
| 6 | `src/engine/subsystems/core/views/PlanViewCanvas.ts` | **2,150** | ⚠ Plan canvas — complex interaction surface |
| 7 | `src/engine/subsystems/tools/SelectionManager.ts` | **2,141** | ⚠ God file — all selection logic centralized |
| 8 | `src/engine/engineLauncher.ts` | **2,130** | ⚠ Stage 2 boot — should shrink with Wave 20 |
| 9 | `src/engine/subsystems/core/navigation/ViewController.ts` | **1,939** | ⚠ View/camera management |
| 10 | `src/engine/subsystems/core/views/EdgeProjectorService.ts` | **1,867** | ⚠ Hidden-line removal — complexity justified |

**All files > 500 LOC** (partial list — >200 such files exist across the codebase):

`initUI.ts` (2,773), `AnnotationRenderLayer.ts` (2,628), `PlanViewAnnotationRenderer.ts` (2,589), `WallFragmentBuilder.ts` (2,256), `initScene.ts` (2,249), `PlanViewCanvas.ts` (2,150), `SelectionManager.ts` (2,141), `engineLauncher.ts` (2,130), `ViewController.ts` (1,939), `EdgeProjectorService.ts` (1,867), `SlabTool.ts` (1,808), `WallTool.ts` (1,710), `ChairBuilder.ts` (1,665), `QueryEngine.ts` (1,617), `SplitViewManager.ts` + `runtime-composer/types.ts` (1,590 each), `ProjectLoader.ts` (1,526), `LinearDimensionAnnotationTool.ts` (1,488), `sheetEditor.ts` (1,484) — and ~200 more in the 500–1,500 LOC band.

The god-file risk is concentrated in `src/engine/subsystems/` and resolves naturally as Wave 20 migrates subsystems to packages. The packages themselves are well-sized (geometry-kernel at 648 LOC, schemas at 79 LOC, command-bus at ~1,000 LOC total).

### package.json Dependencies

**Production dependencies** (56):

| Package | Version | Purpose |
|---|---|---|
| `@gltf-transform/functions` | ^4.3.0 | GLB optimization |
| `@msgpack/msgpack` | ^3.1.3 | Binary serialization for sync protocol |
| `@opentelemetry/api` | ^1.9.1 | OTel span API |
| `@pryzm/*` | workspace:* | Internal monorepo packages (16 refs) |
| `@supabase/supabase-js` | ^2.103.3 | Supabase client |
| `@thatopen/components` | ^3.4.2 | OBC BIM component framework |
| `@thatopen/components-front` | ^3.4.2 | OBC frontend components |
| `@thatopen/fragments` | ^3.4.3 | IFC fragment streaming |
| `@thatopen/ui` | ^3.4.0 | OBC UI Web Components |
| `@thatopen/ui-obc` | ^3.4.0 | OBC UI bindings |
| `@types/compression` | ^1.8.1 | Type defs |
| `@types/react` | ^19.2.14 | React types |
| `@types/react-dom` | ^19.2.3 | React DOM types |
| `@vitejs/plugin-react` | ^4.7.0 | Vite React plugin |
| `autoprefixer` | ^10.5.0 | PostCSS autoprefixer |
| `bcrypt` | ^6.0.0 | Password hashing |
| `camera-controls` | ^3.1.2 | THREE camera orbit controls |
| `cesium` | ^1.140.0 | Geospatial globe |
| `chart.js` | ^4.5.1 | Schedule charts |
| `compression` | ^1.8.1 | Express gzip |
| `cors` | ^2.8.6 | CORS middleware |
| `dxf` | ^5.3.1 | DXF parser/writer |
| `exceljs` | ^4.4.0 | Excel schedule export |
| `express` | ^4.22.1 | HTTP server |
| `express-rate-limit` | ^8.3.2 | Rate limiting |
| `fflate` | ^0.8.2 | Fast zip compression |
| `immer` | ^10.2.0 | Immutable state patches |
| `jsonwebtoken` | ^9.0.3 | JWT signing/verification |
| `jspdf` | ^4.2.1 | PDF generation |
| `manifold-3d` | ^3.4.1 | CSG (Boolean ops) WASM |
| `multer` | ^2.1.1 | Multipart file upload |
| `nanoid` | ^5.1.6 | Unique ID generation |
| `pdf-lib` | ^1.17.1 | PDF manipulation |
| `pdfjs-dist` | ^5.6.205 | PDF rendering for floor plan import |
| `pg` | ^8.20.0 | PostgreSQL client |
| `postcss` | ^8.5.10 | CSS processing |
| `react` | ^19.2.5 | React (installed; not used for editor panels) |
| `react-dom` | ^19.2.5 | React DOM |
| `rhino3dm` | ^8.17.0 | Rhino 3DM WASM |
| `socket.io` | ^4.8.3 | WebSocket collaboration |
| `stripe` | ^20.4.1 | Stripe payments |
| `svg2pdf.js` | ^2.7.0 | SVG to PDF |
| `tailwindcss` | ^3.4.19 | Utility CSS |
| `three` | ^0.183.2 | 3D rendering |
| `three-gpu-pathtracer` | ^0.0.20 | Offline path tracing |
| `three-mesh-bvh` | ^0.9.9 | BVH acceleration |
| `tsx` | ^4.21.0 | TypeScript ESM runner (server) |
| `uuid` | ^13.0.0 | UUID generation |
| `vite-plugin-cesium` | ^1.2.23 | Cesium Vite plugin |
| `web-ifc` | ^0.0.77 | IFC WASM parser |
| `zod` | ^4.3.6 | Schema validation |

**Dev dependencies** (11):

| Package | Version | Purpose |
|---|---|---|
| `@eslint/js` | ^9.39.4 | ESLint JS ruleset |
| `@types/node` | ^22.19.17 | Node.js types |
| `@types/three` | ^0.183.1 | Three.js types |
| `@typescript-eslint/parser` | ^8.59.0 | TS ESLint parser |
| `@typescript-eslint/utils` | ^8.59.0 | TS ESLint utilities |
| `@webgpu/types` | ^0.1.69 | WebGPU type definitions |
| `eslint` | ^9.39.4 | Linter |
| `eslint-plugin-boundaries` | ^5.4.0 | Layer boundary enforcement |
| `eslint-plugin-pryzm` | workspace:* | Custom PRYZM rules |
| `globals` | ^15.15.0 | ESLint global defs |
| `gzip-size` | ^7.0.0 | Bundle size measurement |
| `happy-dom` | ^15.11.7 | DOM for Vitest |
| `typescript` | ^5.9.3 | TypeScript compiler |
| `typescript-eslint` | ^8.59.0 | TS ESLint integration |
| `vite` | ^7.3.2 | Build tool |
| `vitest` | ^4.1.5 | Test runner |

### Config / Environment Files

| File | Notes |
|---|---|
| `.env` | Not committed (correct). Managed via Replit Secrets. |
| `.env.production` | Standard Vite convention (not confirmed present). |
| `pryzm-selfhost/.env.example` | Template for self-host operators. |
| `replit.nix` | Nix environment (Node 20, PostgreSQL 16, Python 3.11). |
| `.replit` | Replit workflow config. |
| `tsconfig.json` / `tsconfig.base.json` | TypeScript root + base config. |
| `vite.config.ts` | Vite build config (manual chunks, plugins). |
| `turbo.json` | Turborepo task pipeline. |
| `eslint.config.js` | ESLint flat config. |
| `eslint-baseline-window-as-any.json` | Cast count ratchet baseline. |
| `tailwind.config.js` / `postcss.config.js` | CSS toolchain. |
