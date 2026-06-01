# §4  The phased delivery — 8 phases, ~20 sprints

> Part of [PRYZM2-WIREUP-PLAN-S72](./00-INDEX.md). Source slice of [PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md](../00-PLAN.md) lines 393–587.
>
> ⚠️ **Per-PR authority lives in §16 (chunks 14–19), not in this §4 overview.** Where the deliverable list below disagrees with §16's sub-phase tables, **§16 wins** (per the 00-INDEX "Single source of truth" rule). Specifically, this overview assigns Phase A more scope (kill-switch deletion, 20+ singleton list, `apps/editor/src/main.ts` rewrite) than §16.1 actually allocates. **The §16.1 split is authoritative**: kill-switch removal is **Phase D.1** (S75); the dark `apps/editor/main.ts` mountEditor body is **Phase G.8** (S82); Phase A itself is the 7 small sub-phases A.1–A.7 (composer scaffold + typed contract + lint baseline). The "deliverables" lists below are the **coarse Phase A goal** as originally drafted; the per-PR breakdown chunks 14–19 reflect the ratified per-sprint cadence.

---

## §4 The phased delivery — 8 phases, ~20 sprints

Sprints are 2 weeks each. Two engineers in parallel from Phase B onward (Phase A is single-engineer).

### Phase A — Composition root (S72, 1 sprint, 1 engineer)

**Deliverables:**
- New package `packages/runtime-composer/`.
- `composeRuntime(opts)` that constructs `RenderEverythingRuntime` via `bootstrapRenderEverything()` and assembles all platform-side singletons (`SelectionStore`, `HoverStore`, `ProjectContextStore`, `VisibilityController`, `DrawingPrimitivesService`, `ConstraintSolver`, `PickingController`, `ToolHost`, `EventLog`, `ProjectListClient`, `ProjectListStore`, `SyncClient`, `PresenceController`, `AiHostClient`, `BakeCoordinator`, `PluginHost`, `IfcImporter/Exporter/Inspector`, `RhinoImporter`, `PdfToBimService`, `BcfViewpointsService`, `ComparisonEngine`, `DataWorkbench`).
- `PryzmRuntime` typed handle (the contract).
- `src/main.ts` rewritten to `boot() → composeRuntime() → PlatformRouter.start(runtime)`.
- `?pryzm2=1` kill-switch DELETED; `?pryzm1=1` opt-in DELETED; `packages/engine-router/` DELETED.
- `apps/editor/src/main.ts` `mountEditor()` signature changed to accept the PRYZM 1 `#container` and inherit its layout (no fixed-position dark canvas).

**Acceptance:**
- `/` boots the white landing page (no flag, no kill-switch).
- `composeRuntime()` returns a fully-typed `PryzmRuntime` in < 1 s on a cold cache.
- The white toolbar + sidebars + inspector still render (they don't yet *do* anything new — they still read from `(window as any)` until Phase B replaces those reads).
- `rg "pryzm2=1\|pryzm1=1\|location.assign" src/` returns empty.

### Phase B — Constructor-thread the runtime through every PRYZM 1 panel (S73–S75, 3 sprints, 2 engineers)

**Deliverables:**
- Every `src/ui/**/*.ts` panel constructor signature widened to `(host, runtime, ...existingArgs)`.
- Every `(window as any).<key>` read in `src/ui/` rewritten to `runtime.<typed.path>`.
- The 5 platform engine-init files in `src/engine/subsystems/init*.ts` STOP publishing globals (the writes side of the cast pattern). They become dead code at end of Phase B; deleted in Phase G.
- New `eslint-plugin-pryzm/no-window-as-any` rule (banned in `src/ui/`).
- New `eslint-plugin-pryzm/no-runtime-package-import` rule (`src/ui/` may import only `@pryzm/runtime-composer/types`).

**Order of attack (panel clusters per sprint to keep PRs reviewable):**
- S73 — Property-inspector cluster (`src/ui/property-inspector/`, `src/ui/PropertyInspector.ts` — 88 casts in one file; ~25 files total).
- S74 — Toolbar + sidebar + selection-overlay cluster (`src/ui/bottom-menu/`, `src/ui/LeftNavRail.ts`, `src/ui/SelectionOverlay.ts`, `src/ui/RadialMenu.ts`, ~20 files).
- S75 — Per-family modepickers + drawing HUDs (`src/ui/<family>ModePicker.ts`, `src/ui/<family>DrawingHUD.ts`, ~24 files).
- Spillover S76 D1–D5 buffer for the long-tail (`src/ui/dataworkbench/`, `src/ui/wardrobe/`, `src/ui/ai/`, etc. — these get deeper rewires in Phase F so only the cast surface is touched here).

**Acceptance:**
- `rg "window as any" src/ui/` returns 0.
- The lint rules ship green.
- Visual-diff CI gate (Phase H baseline must already exist) passes — no pixel drift.
- Editor still functions identically (commands, selection, hover, modes — all working on the new runtime).

### Phase C — Replace persistence, sync, save (S76, 1 sprint, 2 engineers)

**Deliverables:**
- `src/ui/platform/ProjectHub.ts` rewired:
  - `loadProjects()` → `runtime.persistence.projectListStore.subscribe(...)` for live updates + initial fetch via `runtime.persistence.client.list()`.
  - `createProject()` → `runtime.persistence.client.create({ name })` + the projectListStore auto-updates.
  - `deleteProject()` → `runtime.persistence.client.delete(id)`.
  - `renameProject()` → `runtime.persistence.client.rename(id, name)`.
  - `openProject()` → calls back into `PlatformRouter.launchWorkspace()` which calls `runtime.persistence.openProject()`.
- `src/ui/platform/PlatformShell.ts` save flow rewired:
  - The DOM-event-driven debounce in `SaveOrchestrator` is replaced by the bus's `PatchEmitter` → `EventLog.append` wiring (set up in Phase A inside `composeRuntime()`).
  - The toolbar save-status pill subscribes to `runtime.events.on('persistence.status', …)`.
- One-shot localStorage migrator (`@pryzm/runtime-composer/migrate-localstorage.ts`):
  - Reads `bim-projects-index` + every `bim-project-{id}-versions` key.
  - For each project not already on the server, POST it via `ProjectListClient` and replay each version as an event-log batch.
  - On success, deletes the legacy keys.
  - Idempotent (a `pryzm-migration-v1-complete` flag prevents repeat runs).
- DELETE `src/ui/platform/ProjectRepository.ts`, `SaveOrchestrator.ts`, `ServerSyncQueue.ts`. The `apiFetch` import in those files is the only thing keeping them; remove and they go cold.
- DELETE the legacy POST `/api/projects/:id/versions` server route (in `server.js`) — replaced by the v1 event-log POST. Keep a 410 Gone stub for one sprint with a "client too old" error message.

**Acceptance:**
- Create / list / delete / rename / open / save all round-trip through the new persistence stack on the white UI.
- A second tab opened on the same project paints presence cursors + reflects edits in real-time (sync-client peer broadcast).
- Network-throttled save still works (event log is local-first; backfill on reconnect).
- Localstorage migrator runs once and deletes the legacy keys.
- W3 (auth bridge) from S71 §4.3 has shipped before this phase ends — it is a hard prerequisite.

### Phase D — Replace the legacy engine bootstrap with the runtime (S77–S78, 2 sprints, 2 engineers)

**Deliverables:**
- `src/engine/EngineBootstrap.ts` is **deleted** entirely (not shimmed). Its responsibilities are now owned by:
  - `composeRuntime()` — the wiring.
  - `runtime.scene.renderer` — the THREE.js + WebGPU/WebGL2 surface (replaces `createBimWorld`, `BimManager`, `RenderPipelineManager`, `PostproductionRenderer`, `EnhancedBloomService`, `SSGIService`, `RenderPerformanceService`, `ViewportPathTracer`, `RenderHealthIndicator`, `ViewportCrashGuard`).
  - `runtime.scene.scheduler` — the rAF authority (replaces every `requestAnimationFrame` in `src/engine/`).
  - `runtime.cameraController` + `runtime.viewRegistry` — view + camera (replaces `ViewNavigationManager`, `ViewController`, `GroundFloorPlanController`).
  - `runtime.visibility` — modes (replaces `LevelExplodeController`, `InspectModeCoordinator`, `WallEdgeVisibilityService`, `GridToggleService`).
  - `runtime.tools.transform` — gizmo (replaces `TransformControls` + `WallTransformController` + `WallEndpointController` + `LevelPlaneConstraint` + `HostedElementDragController`).
- `src/engine/subsystems/init*.ts` (8 files, the legacy init split) DELETED.
- `src/engine/inspect/`, `src/engine/elementSelection/`, etc. — DELETED. Their callers in `src/ui/` now use `runtime.visibility`, `runtime.selection`, etc.
- New `apps/editor/src/main.ts` `mountEditor()` API removed (its job is folded into `composeRuntime()`); `apps/editor/src/main.ts` becomes a thin re-export of the composer for backward-compat with bench/E2E and gets deleted in Phase G.

**Acceptance:**
- `rg "import.*from.*src/engine/" src/` returns 0.
- The white editor canvas paints geometry from the new committer pipeline. Visual-diff against the PRYZM 1 baseline ≤ 2 px on the 30-case scene set in `apps/bench/visual-diff/`.
- First-frame budget < 800 ms on the M-medium fixture (`08` §6.2 perf NFT).
- Idle at 0 fps; 120 fps on scrub (`08` §6.3 perf NFT).

### Phase E — Replace legacy element + command zones (S79–S81, 3 sprints, 2 engineers)

**Deliverables (per element family — wall, slab, door, window, roof, curtain-wall, grid, column, beam, stair, handrail, ceiling):**
- `src/elements/<family>/` DELETED. `WallStore`, `WallFragmentBuilder`, `WallData`, `WallBaseline`, `WallOpeningRenderData`, etc. are owned by `@pryzm/plugin-wall` (already shipping).
- `src/commands/<family>/` DELETED. `CreateWallCommand`, `UpdateWallCommand`, etc. are replaced by handlers under `@pryzm/plugin-wall/handlers` (already shipping; reached via `runtime.bus`).
- Per-family `plugins/<family>/contributions.ts` added — exports the toolbar button + creation modal + property-inspector panel + drawing HUD that the legacy `src/ui/<family>ModePicker.ts` used to provide. The legacy modepicker file is DELETED; the contribution renders into the same white toolbar slot.
- The `src/ui/property-inspector/family-panels/<family>Panel.ts` panels are DELETED; the per-plugin contribution renders the same white form into the same right-sidebar slot.

**Acceptance:**
- `rg "import.*from.*src/elements/" src/` returns 0.
- `rg "import.*from.*src/commands/" src/` returns 0.
- All 12 element families create / edit / delete / select / measure / property-edit identically to PRYZM 1 (visual + interaction parity tests in `apps/bench/parity/<family>.spec.ts`, new in this phase).
- The schedule panel, the formula console, and the data workbench all read from the new stores via `runtime.dataWorkbench` (Phase F finishes the data-workbench wiring; this phase only ensures the read-path works).

### Phase F — Wire the cross-cutting capabilities (S82–S83, 2 sprints, 2 engineers)

**Plugin host (`runtime.plugins`):**
- `apps/editor/src/PluginRegistry.ts` becomes `packages/plugin-host/src/HostRegistry.ts` (moved out of the editor app, into a peer package — the runtime composer constructs it).
- The 12 element plugins, the IFC import/export/inspector trio, the Rhino importer, the BCF service, the PDF-to-BIM service, the AI plugins (`plugins/ai-floorplan`, `ai-generative`, `ai-query`, `ai-rules`, `ai-voice`), and the multiplayer plugin all register their `Contribution`s here.
- Marketplace install (Phase 3C M31–M33 deliverable) lands a contribution at runtime; the white toolbar repaints to include the new button.

**AI (`runtime.ai`):**
- `src/ai/` DELETED. The legacy `AIPanel`, `AIChat`, `AISidebar` panels under `src/ui/ai/` are rewritten to call `runtime.ai.streamCompletion(prompt, ctx)` and `runtime.ai.structuredCall(schema, prompt)`.
- The AI cost meter (`packages/ai-cost`) is wired into `runtime.ai`; the white cost pill in the toolbar subscribes to it.
- The AI back-pressure curve (S71 §4.6 W6) lands here, attaching the worker queue depth to `runtime.events`.

**IFC / Rhino / PDF / BCF (`runtime.ifc`, `runtime.rhino`, `runtime.pdf`, `runtime.bcf`):**
- Already-existing plugins (`plugins/ifc-import`, `plugins/ifc-export`, `plugins/ifc-inspector`, `plugins/rhino-import`, `plugins/bcf`, `packages/pdf-to-bim`) are wrapped in singleton facades exposed on the runtime.
- The white import-manager UI (`src/ui/import-manager/`, `src/ui/import/`) calls `runtime.ifc.import.start(file)` and subscribes to its progress events. The legacy `apiFetch('/api/ifc/upload')` call sites are deleted; uploads go through the new IFC service which knows the v1 routes.
- The IFC inspector white panel (`src/ui/inspect/`) reads from `runtime.ifc.inspector` (replaces `(window as any).obcViewpoints`).
- The legacy `src/services/SlabWallConnectivityService.ts` is DELETED (replaced by `runtime.constraint.slabWall`).

**Comparison engine + data workbench:**
- `runtime.comparison` from a new `@pryzm/comparison` package (extracts `src/services/comparison/` if any, otherwise greenfield from `08` §3 spec).
- `runtime.dataWorkbench` composes `formula-library` (extended 12 → 24 per S71 §4.6 W6) + `expr-eval` + the hierarchy/template/element-code stores.

**Acceptance:**
- `rg "import.*from.*src/ai/" src/` returns 0.
- `rg "import.*from.*src/services/" src/` returns 0.
- Every white panel that *does* something now does it through `runtime.<typed.path>`. The white panels are pixel-identical and behaviour-identical to PRYZM 1.

### Phase G — Delete the legacy zones, the dark hub, the dark canvas (S84, 1 sprint, 2 engineers)

**Deliverables — physical deletion:**
- `src/engine/` (12 files, ~12K LOC).
- `src/elements/` (~140 files).
- `src/commands/` (~265 files).
- `src/ai/` (~37 files).
- `src/services/` (legacy services — only those not surfaced on the runtime).
- `src/core/persistence/`, `src/core/rendering/`, `src/core/views/`, `src/core/navigation/`, `src/core/schedules/` — most of `src/core/` (~228 files, ~76K LOC). Whatever remnants survive Phase B–F (e.g. small typed helpers consumed by `src/ui/`) are moved to `packages/legacy-shim` (already exists, `private:true`) and the `src/ui/` imports are rewritten one PR at a time during the buffer days. The goal is `src/core/` empty by S84 D-final.
- `apps/editor/src/projects/` (the dark hub).
- `apps/editor/src/main.ts` mountEditor (folded into `runtime-composer` in Phase D; the file is now an empty stub — delete).
- `apps/editor/src/sunset/` (the sunset banner — no second engine to sunset).
- `apps/editor/migrations/sunset-pryzm1.md` amended per §3.3 of the v1 plan.

**Bundle re-baseline:**
- `apps/bench/scripts/check-bundle-size.mjs` re-runs against the post-deletion bundle. The expected contraction is ~150K LOC of TypeScript and ~40 npm dep removals (notably `@thatopen/*`, `cesium`, the legacy WebGL pipeline glue). The new bundle ships only what the new architecture consumes.
- Bundle size NFT gate (S71 §4.8 W8) goes green automatically.

**Acceptance:**
- `find src/ -name "*.ts" | xargs wc -l` returns ≤ 35K LOC (was ~135K before this plan).
- The remaining `src/` is exclusively `src/ui/` (the white panels) + `src/main.ts` (the boot file) + `src/api/` (auth bridge + a few server-talking helpers) + `src/styles/` (the white CSS).
- The bundle ships zero bytes from `apps/editor/src/projects/` (CI gate).

### Phase H — Hardening + GA gates (S85–S87, 3 sprints, 2 engineers)

**Visual-diff CI:**
- `apps/bench/visual-diff/` baseline updated with snapshots of every PRYZM 1 panel state (landing, hub, hub with 0/1/many projects, project page editor with each element family selected, each modepicker active, each modal open). Snapshots taken from a clean PRYZM-1-pre-S72 build BEFORE Phase A starts.
- Per-PR job runs the full set on Chromium + Firefox + WebKit; > 2 px SSIM diff or > 0.05 % pixel-diff fails the build.

**Performance gates (the "best browser BIM app" floor):**
- `apps/bench/perf/` runs the `08` §6 NFT suite on the CI runner.
  - First-frame ≤ 800 ms (M-medium fixture).
  - Idle 0 fps (`requestAnimationFrame` count == 0 in 5 s of no input).
  - Scrub 120 fps (orbit + pan + zoom synthesised).
  - Project-open 50 K elements ≤ 2 s P95 over a 100-run set.
  - Memory ≤ 1.5 GB heap on the L-large fixture.
- Each gate is a hard CI fail at GA. Pre-GA they are *informational* with a budget creep alert.

**Lint rules — the contract enforced by a robot:**
- `eslint-plugin-pryzm/no-window-as-any` (Phase B).
- `eslint-plugin-pryzm/no-runtime-package-import` — `src/ui/` may import only `@pryzm/runtime-composer/types` and other `src/ui/` files. Any other `@pryzm/*` import or any `apps/editor/*`, `packages/*` deep-import is a build error.
- `eslint-plugin-pryzm/no-second-ui` — bans `import` of `apps/editor/src/projects/`, the literal `#1a1f2e` colour outside `apps/marketplace-web/`, and `document.getElementById('platform-root')?.remove()`.
- `eslint-plugin-pryzm/no-second-canvas` — `document.createElement('canvas')` allowed only in two allow-listed files: `packages/renderer/Renderer.ts` and `packages/runtime-composer/composeRuntime.ts`.
- `eslint-plugin-pryzm/single-raf` — `requestAnimationFrame` allowed only in `packages/frame-scheduler/`.
- `eslint-plugin-pryzm/single-localstorage-writer` — `localStorage.setItem` allowed only in `packages/persistence-client/EventLog.ts`, `src/api/auth.ts`, and `packages/user-preferences/`.

**Cross-browser, cross-device parity:**
- `apps/bench/parity/` runs the full element-family scenario suite on Chromium / Firefox / WebKit (desktop) + WebKit-iOS (mobile). WebGPU path tested where available, WebGL2 path always.

**Documentation update (Phase H D-last):**
- `08-VISION.md` §7 — add NG9 (no second UI surface).
- `09-AS-IS-VS-TO-BE.md` §3 — `src/ui/` marked `STATUS: KEEP`.
- `10-MASTER-IMPLEMENTATION-PLAN-36M.md` §10 — striked panel migration; this plan referenced as the binding wireup.
- `06-PRYZM-IDENTITY-AND-RECOUNT.md` §2.4 — D11 UI continuity.
- `README.md` — points at this document.
- `apps/editor/migrations/sunset-pryzm1.md` — `src/styles/` row deleted; note added that UI is preserved.

**GA gate (the moment the rebuild ships):**
- All visual-diff snapshots green.
- All perf gates green.
- All lint rules green.
- All test workflows green (including `pryzm-vi-parity`, `pryzm-persistence`, `audit-log-middleware` from S71 W5-c).
- One full week of internal dogfooding with no regressions filed.

---

