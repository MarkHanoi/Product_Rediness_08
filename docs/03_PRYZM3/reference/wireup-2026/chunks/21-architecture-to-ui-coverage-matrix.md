# §21  Architecture → UI Coverage Matrix (REVERSE map)

> Part of [PRYZM2-WIREUP-PLAN-S72](./00-INDEX.md). New deliverable — not in the source monolith.
>
> §12 maps **UI file → architecture path** (forward). §16 maps **UI gesture → sub-phase ID** (per-PR).
> This file maps **every architecture leg → consuming UI surface(s)** (reverse). If an entry below has no UI consumer column populated, that architecture leg is **orphaned** and the operator should challenge whether it should ship.

---

## §21.0  How to read

For each architecture artefact (one row per package, plugin, app worker), this file lists:

- **Architecture leg** — directory in `packages/`, `plugins/`, or `apps/`.
- **`runtime.<leg>` reach** — how the white UI gets at it through `composeRuntime()`.
- **Primary UI consumer(s)** — concrete file(s) under `src/ui/` that call it.
- **Click trail §** — the gesture chain in [`08-click-trails.md`](./08-click-trails.md) that exercises it end-to-end.
- **Sub-phase ID** — the PR(s) in [`14`–`19`](./14-subphases-A-D.md) that lands the wire.
- **Bench** — the gate in [`12-ui-perf-benches.md`](./12-ui-perf-benches.md) (or `apps/bench/` headless suite for non-UI work).
- **Status** — `wired` (already consumed today, sub-phase is a typed-handle rewrap) · `pending` (target is the new wireup) · `internal` (no direct UI consumer; consumed by another package) · `worker` (out-of-process; UI talks via `runtime.<leg>` API, not directly).

A row whose Status is `internal` is fine if it appears in the dependency graph of a row with a UI consumer. If an `internal` row has no upstream consumer either, it is dead code.

---

## §21.1  `packages/` — 44 packages

### Tier 1 — Core runtime (consumed by every UI surface via `runtime`)

| Package | `runtime.<leg>` reach | Primary UI consumer | Click trail | Sub-phase | Bench | Status |
|---|---|---|---|---|---|---|
| `command-bus` | `runtime.bus` | every drawing tool, every inspector edit, every modal submit | §11.5 (wall draw commit), §11.6 (thickness change) | A.1, B.*, E.*, F.*  | `cmd-execute-latency.bench.ts` (existing) + every `bench/ui/*-edit.bench.ts` | pending |
| `frame-scheduler` | `runtime.scene.scheduler` | every overlay, every drawing HUD, ViewCube | §11.5, §11.10 | A.1, D.5, D.7 | `idle-cpu.bench.ts` + `bench/ui/idle-cpu-workspace.bench.ts` | pending |
| `renderer` | `runtime.scene.renderer` | RenderPanel, RealSunControl, all rendering controls | §11.5 (paint), §11.10 | A.1, D.6, F.10.* | `render-pass-cost.bench.ts` + `bench/ui/render-quality-toggle.bench.ts` | pending |
| `scene-committer` | (internal — receives commits from every plugin's `committer.ts`) | n/a (UI never imports) | §11.5 (every commit) | A.1, D.* | `bench/ui/wall-draw-frame.bench.ts` indirectly | internal |
| `stores` | `runtime.stores.<key>` | SpatialTree, every PropertyPanel widget, every schedule cell | §11.6 (read-after-write), §11.10 (view filter) | A.1, B.*, E.*, F.2.* | `bench/ui/inspector-mount.bench.ts` | pending |
| `schemas` | (internal — every command/event references a schema) | n/a | (every) | A.* | `tests/schemas/*` (existing) | internal |
| `geometry-kernel` | (internal — never reaches UI directly per Vision P1) | n/a (forbidden by `eslint-plugin-boundaries`) | §11.5 (geometry produced) | A.1 | kernel headless benches | internal |
| `picking` | `runtime.picking` | SelectionOverlay, SpatialTree highlight on hover | §11.6 (click selects), §11.5 (snap during draw) | A.1, D.13–D.14 | `bench/ui/selection-overlay.bench.ts`, `bench/ui/snap-indicator.bench.ts` | pending |
| `view-state` | `runtime.viewRegistry` | ViewTabBar, ViewBrowser/panels/ViewsRailPanel.ts, WorkspaceModeBar | §11.10 | A.1, D.11–D.12, F.6.10–F.6.15 | `bench/ui/view-tab-switch.bench.ts` | pending |
| `visibility` | `runtime.visibilityIntent` + `runtime.intent` | VisibilityIntentPanel, OverridePanel, intent/* (6 files) | §11.10 (filters apply) | F.8.01–F.8.13 | `bench/ui/vi-toggle.bench.ts` | pending |
| `frame-scheduler` already listed | — | — | — | — | — | — |

### Tier 2 — Persistence + sync (consumed by Save HUD, presence cursors, history)

| Package | `runtime.<leg>` reach | Primary UI consumer | Click trail | Sub-phase | Bench | Status |
|---|---|---|---|---|---|---|
| `persistence-client` | `runtime.persistence.client` + `runtime.persistence.eventLog` | SaveOrchestrator (deleted Phase C), SaveUndoRedoHUD, ProjectHub list | §11.4 (open), §11.8 (save), §11.7 (undo) | C.1–C.7 | `save-edit.bench.ts` + `bench/ui/save-undo-hud.bench.ts` | pending |
| `sync-client` | `runtime.sync.client` + `runtime.sync.presence` | SaveUndoRedoHUD pill, presence overlay (overlays/), ServerSyncQueue (deleted Phase C) | §11.9 (multi-user) | A.1, C.10–C.13 | `sync-roundtrip.bench.ts` + `bench/ui/presence-cursor.bench.ts` | pending |
| `file-format` | (internal — used by persistence-client) | n/a | §11.4 | C.* | `tests/file-format/*` | internal |
| `storage-driver` | (internal — used by persistence-client + bake-worker) | n/a | §11.8 | C.* | persistence benches | internal |
| `protocol` | (internal — wire schema for sync-server + api-gateway) | n/a | §11.9 | C.10 | protocol contract tests | internal |
| `legacy-shim` | (internal — Phase C migrator from PRYZM 1 localStorage) | ProjectRepository delete | §11.4 (one-time migration on first open) | C.5 | `tests/persistence/legacy-shim.test.ts` | internal |

### Tier 3 — AI host stack (consumed by `src/ui/ai/*` + intent UI)

| Package | `runtime.<leg>` reach | Primary UI consumer | Click trail | Sub-phase | Bench | Status |
|---|---|---|---|---|---|---|
| `ai-host` | `runtime.ai` (root) | AIPanel, AICreatePanel, ValidatePanel | §11.12 | F.7.01–F.7.16 | `bench/ui/ai-first-token.bench.ts` | pending |
| `ai-cost` | `runtime.ai.cost` | AIPanel cost pill | §11.12 | F.7.03 | (UI overhead < 200 ms) | pending |
| `ai-spend` | (internal — used by api-gateway for billing) | OwnerSettingsPanel (org spend dashboard) | §11.14 indirect | C.9 | `tests/ai-spend/*` | internal |

### Tier 4 — Plugin / formula / expression (consumed by toolbar contributions + Data Workbench)

| Package | `runtime.<leg>` reach | Primary UI consumer | Click trail | Sub-phase | Bench | Status |
|---|---|---|---|---|---|---|
| `plugin-sdk` | (internal — types only) | n/a (every plugin imports it) | §11.13 | F.* | `tests/plugin-sdk/*` | internal |
| `formula-library` | `runtime.dataWorkbench.formulas` | NLQueryPanel, AnalyticsPanel, DataSheetPanel, PropertyPanel formula cells | §11.10 (schedule formula) | F.9.* | `bench/ui/dw-nl-query.bench.ts` | pending |
| `expr-eval` | (internal — used by formula-library) | n/a | (above) | F.9.* | shared | internal |
| `family-loader` | (internal — pulled by plugin-host per-family) | n/a | §11.13 (plugin install) | F.12.01–F.12.05 | `bench/ui/plugin-contribution-add.bench.ts` | internal |
| `family-runtime` | (internal — provides per-family parametric eval) | n/a | §11.5 (wall family params) | E.* | `tests/family-runtime/*` | internal |
| `family-instance` | (internal — per-instance state) | n/a | §11.6 | E.* | shared | internal |
| `engine-router` | (internal — routes commits to scene-committer) | n/a | (every commit) | A.1 | `tests/engine-router/*` | internal |
| `render-runtime` | (internal — render queue/jobs primitives) | RenderQueuePanel | §11.5 | F.10.07–F.10.08 | `bench/ui/render-gallery-paint.bench.ts` | pending |
| `drawing-primitives` | (internal — used by every plugin's tool) | n/a | §11.5 | E.*, F.1.* | `bench/ui/<family>-draw.bench.ts` | internal |
| `constraint-solver` | (internal — used by stair, curtain-wall, dimension drivers) | n/a | §11.5 | E.5, E.9 | `tests/constraint-solver/*` | internal |
| `pdf-to-bim` | (internal — used by ai-worker) | FloorPlanImportPanel calls via `runtime.ai.floorPlan.import()` | §11.12 (PDF → walls) | F.7.10–F.7.14 | `cv-pipeline.bench.ts` | internal |
| `ui` | (internal — UI primitives package, kept for shared components) | several `src/ui/` files | (every) | B.* | n/a | internal |
| `types-builtin` | (internal — shared type registry) | n/a | (every) | A.* | n/a | internal |
| `perf-budgets` | (internal — bench baseline machinery) | n/a (used by `apps/bench`) | n/a | H.6 | n/a | internal |

### Tier 5 — API/auth/security (consumed by ProjectHub, AuthModal, OwnerSettingsPanel)

| Package | `runtime.<leg>` reach | Primary UI consumer | Click trail | Sub-phase | Bench | Status |
|---|---|---|---|---|---|---|
| `api-spec` | (internal — Zod schemas for api-gateway requests) | every persistence-client call | (every) | C.* | contract tests | internal |
| `api-rbac` | (internal — used by api-gateway) | n/a directly; surfaces as 403s | §11.14 | C.9 | RBAC tests | internal |
| `oauth2-pkce` | (internal — used by AuthModal flow) | platform/AuthModal.ts | §11.2 | C.2–C.3 | `bench/ui/auth-modal-open.bench.ts` | pending |
| `rate-limit` | (internal — api-gateway middleware) | surfaces as 429 in any call | §11.13 (plugin install) | C.* | rate-limit tests | internal |
| `webhooks` | (internal — used by api-gateway for outbound) | OwnerSettingsPanel (webhook config UI) | §11.14 indirect | C.9 | webhook tests | internal |
| `email-transport` | (internal — used by api-gateway) | invite flow in ProjectMemberPanel | §11.4 (invite) | C.6.* | n/a | internal |
| `beta-signup` | `runtime.persistence.client.beta` | platform/LandingPage signup form (CTA) | §11.1 → §11.2 | C.2 | `bench/ui/landing-paint.bench.ts` | pending |
| `feature-flags` | `runtime.featureFlags` | OwnerFeatureFlags.ts, EngineLoadingOverlay (flag-gated panels) | §11.4 (flag-gated UI) | C.9 | feature-flag tests | pending |
| `admin-overrides` | (internal — used by api-gateway for op overrides) | OwnerSettingsPanel admin override section | §11.14 indirect | C.9 | n/a | internal |
| `crash-reporter` | `runtime.crashReporter` | ViewportCrashGuard (`primitives/`), SceneCrashFallback (`fallbacks/`) | §11.5 (on crash) | A.4 | `tests/crash-reporter/*` | pending |
| `wcag-audit` | (internal — accessibility audit harness for components) | n/a (used by `apps/bench/visual-diff/`) | n/a | H.7 | a11y tests | internal |

---

## §21.2  `plugins/` — 38 plugins

### Element family plugins (12)

Each family plugin owns: `tool.ts` (drawing tool), `committer.ts` (scene → THREE), `inspector/Panel.ts` (PropertyPanel form), `modal/Create.ts` (creation modal), `menu/context-element.ts` (right-click), `contributions.ts` (toolbar discipline registration).

| Plugin | Toolbar contribution (F.1) | Inspector (F.2) | Creation modal (F.3) | Context menu (F.4.03) | Migration sub-phase (E.*) | UI consumer surfaces |
|---|---|---|---|---|---|---|
| `wall` | F.1.01 | F.2.01 | F.3.01 | F.4.03 | E.1 | CreateRailPanel · ElementCreationModal · WallModePicker · WallDrawingHUD · WallTypeSelectorWidget · WallLayersEditor |
| `curtain-wall` | F.1.02 | F.2.05 | F.3.05 | F.4.03 | E.5 | CreateRailPanel · CurtainWallModePicker · CurtainWallDrawingHUD · CurtainGridEditor · CurtainPanelEditor · CurtainSubElementPanel |
| `door` | F.1.03 | F.2.03 | F.3.03 | F.4.03 | E.3 | CreateRailPanel · DoorModePicker · DoorTypeSelectorWidget |
| `window` | F.1.04 | F.2.04 | F.3.04 | F.4.03 | E.4 | CreateRailPanel · WindowModePicker · WindowTypeSelectorWidget |
| `slab` | F.1.05 | F.2.02 | F.3.02 | F.4.03 | E.2 | CreateRailPanel · SlabModePicker · SlabTypeSelectorWidget · SlabDimensionsEditor · SlabLayersEditor · SlabLayerSection |
| `floor` | F.1.06 | F.2.06 | F.3.06 | F.4.03 | E.6 | CreateRailPanel · FloorModePicker · FloorDrawingHUD · FloorTypeSelectorWidget |
| `ceiling` | F.1.07 | F.2.07 | F.3.07 | F.4.03 | E.7 | CreateRailPanel · CeilingModePicker · CeilingDrawingHUD · CeilingTypeSelectorWidget |
| `roof` | F.1.08 | F.2.08 | F.3.08 | F.4.03 | E.8 | CreateRailPanel · RoofPropertySheet |
| `stair` | F.1.09 | F.2.09 | F.3.09 | F.4.03 | E.9 | CreateRailPanel · StairLevelRequiredPanel · StairSetupPanel · StairTypeSelectorWidget |
| `handrail` | F.1.10 | (shared with stair) | F.3.10 | F.4.03 | E.10 | CreateRailPanel · HandrailModePicker |
| `column` | F.1.11 | F.2.10 | F.3.11 | F.4.03 | E.11 | CreateRailPanel · ColumnModePicker · ColumnTypeSelectorWidget |
| `beam` | F.1.12 | F.2.11 | F.3.12 | F.4.03 | E.12 | CreateRailPanel · BeamModePicker · BeamTypeSelectorWidget |

(`plumbing` is migrated as a 13th family in F.2.12; `structural` is a cross-family aggregator — see below.)

### Document, view, and annotation plugins

| Plugin | `runtime.<leg>` reach | UI consumer | Click trail | Sub-phase | Bench |
|---|---|---|---|---|---|
| `view` | `runtime.viewRegistry` (composes view-state package) | views/ViewTabBar.ts, views/ViewHeaderButtons.ts, views/ViewTemplateManagerPanel.ts, ViewBrowser/panels/ViewsRailPanel.ts, ViewPropertiesPanel.ts | §11.10 | F.6.10–F.6.15 | `bench/ui/view-tab-switch.bench.ts`, `bench/ui/view-list-paint.bench.ts` |
| `plan-view` | `runtime.viewRegistry.kinds.plan` | activated by view tab → ViewPropertiesPanel sets bounds | §11.10 | F.6.10 | `bench/ui/view-tab-switch.bench.ts` |
| `section-view` | `runtime.viewRegistry.kinds.section` | viewport section box; activated as view kind | §11.10 | F.6.10 | shared with above |
| `sheets` | `runtime.stores.sheet`, `runtime.bus` (sheet.* commands) | SheetEditor/SheetEditorPanel.ts (#2 worst file → decomposed into `plugins/sheets/SheetEditorHost`), SheetProjectionOrchestrator.ts | §11.10 (sheet kind), §11.11 (export PDF feeds it) | F.5.29–F.5.32, F.2.17 (sheet inspector) | `bench/ui/sheet-editor-mount.bench.ts`, `bench/ui/sheet-edit.bench.ts` |
| `schedules` | `runtime.stores.schedule` | SchedulePanel/SchedulePanel.ts, ViewBrowser/panels/SchedulesRailPanel.ts | §11.10 (schedule kind) | F.5.24–F.5.28, F.6.16–F.6.18 | `bench/ui/schedule-mount.bench.ts`, `bench/ui/schedule-edit.bench.ts`, `bench/ui/schedule-list-paint.bench.ts` |
| `annotations` | `runtime.tools` (text/tag/section-mark/detail-mark/revcloud) | tools-panel/panels/AnnotationRailPanel.ts, AnnotationInputPanel.ts | §11.5 derivative (annotation tool) | F.1.15–F.1.24, F.2.13, F.11.09 | `bench/ui/annotation-input.bench.ts` |
| `dimensions` | `runtime.tools` (linear/aligned/angular/radial) | tools-panel/panels/AnnotationRailPanel.ts (dimension subset), inspector for dim edit | §11.5 derivative | F.1.16–F.1.19, F.2.14 | `bench/ui/dimension-preview.bench.ts` |
| `selection` | `runtime.selection` | SelectionOverlay.ts, ContextualEditBar.ts, SpatialTree.ts highlight | §11.6 | A.1, D.13–D.14 | `bench/ui/selection-overlay.bench.ts`, `bench/ui/inspector-multi-select.bench.ts` |
| `grid` | `runtime.tools.grid` | GridDrawingHUD.ts, GridModePicker.ts, grids/GridManagerPanel.ts, tools-panel/panels/GridsLevelsRailPanel.ts | §11.5 derivative | E.13, F.1.36–F.1.42 | `bench/ui/grids-tool.bench.ts` |
| `cross` | (cross-family operations: copy/array/group/mirror/move/rotate) | radial menu items, contextual edit bar buttons | §11.6 (radial) | F.4.03, F.4.06 | `bench/ui/radial-menu-open.bench.ts` |

### Domain plugins

| Plugin | `runtime.<leg>` reach | UI consumer | Click trail | Sub-phase | Bench |
|---|---|---|---|---|---|
| `furniture` | `runtime.plugins.get('furniture').catalog` | furniture-carousel/* (7 files) | §11.5 derivative (drag/drop) | F.5.16–F.5.20 | `bench/ui/carousel-scroll.bench.ts`, `bench/ui/carousel-drag.bench.ts` |
| `rooms` | `runtime.stores.room` (or `runtime.plugins.get('rooms')`) | rooms/RoomGraphPanel.ts, rooms/EvacuationSimulatorPanel.ts, property-inspector/RoomPropertySection.ts, property-inspector/RoomPathfinderPanel.ts | §11.5 derivative | F.5.23, F.2.15 | `bench/ui/rooms-paint.bench.ts` |
| `lighting` | `runtime.scene.renderer.lighting` (sun + artificial) | rendering/RealSunControl.ts, rendering/RenderPanel.ts | §11.10 derivative | F.10.04 | `bench/ui/sun-drag.bench.ts` |
| `plumbing` | `runtime.tools.plumbing` | (no dedicated rail today; uses cross + PlumbingTypeSelectorWidget) | §11.5 derivative | F.2.12 | per-family draw bench |
| `structural` | (aggregator — uses beam + column + slab + wall) | (no dedicated UI; surfaces in MEP/STR view kinds) | §11.10 derivative | E.11–E.12 | shared family benches |
| `multiplayer` | `runtime.sync.presence` | presence cursor overlay (overlays/) | §11.9 | C.13 | `bench/ui/presence-cursor.bench.ts` |
| `toy-cube` | (test plugin — example for plugin-sdk) | n/a | n/a | F.12.01 (marketplace dogfood) | `bench/ui/plugin-contribution-add.bench.ts` |

### IFC + interop plugins

| Plugin | `runtime.<leg>` reach | UI consumer | Click trail | Sub-phase | Bench |
|---|---|---|---|---|---|
| `ifc-import` | `runtime.ifc.import` | import-manager/ImportManagerPanel.ts, drag-drop on viewport | §11.11 | F.12.06–F.12.08 | `apps/bench/.../ifc-import-tier2` workflow |
| `ifc-export` | `runtime.ifc.export` | tools-panel/panels/ExportRailPanel.ts (Export → IFC) | §11.11 derivative (export) | F.1.27, F.12.11 | `ifc-export-tier1` workflow |
| `ifc-inspector` | `runtime.ifc.inspector` | (PSet editor surface — to be hosted as right-rail panel content) | §11.11 derivative | F.12.09–F.12.10 | `ifc-inspector-pset-editor` workflow |
| `bcf` | `runtime.bcf` | (BCF panel — currently embedded in ProjectBrowser; F.12 surfaces it as standalone) | §11.13 derivative (BCF) | F.12.12–F.12.15 | `bcf-round-trip` workflow |
| `rhino-import` | `runtime.rhino.import` | import-manager/ImportManagerPanel.ts (drag .3dm) | §11.11 derivative | F.12.18 | `rhino-import-3dm` workflow |

(DXF import + export and PDF underlay are handled by `plugins/annotations` + persistence-client + pdf-to-bim package — sub-phases F.1.26, F.12.16–F.12.17, F.12.19.)

### AI plugins (5 — backed by `apps/ai-worker`)

| Plugin | `runtime.<leg>` reach | UI consumer | Click trail | Sub-phase | Bench |
|---|---|---|---|---|---|
| `ai-floorplan` | `runtime.ai.floorPlan` | ai/FloorPlanImportPanel.ts, ai/FloorPlanFullPlanViewer.ts, ai/FloorPlanDebugOverlay.ts | §11.12 derivative (PDF → plan) | F.7.10–F.7.14 | `bench/ui/floorplan-import-progress.bench.ts` |
| `ai-generative` | `runtime.ai.generative` | ai/AICreatePanel.ts, generative/BriefInputPanel.ts, generative/VariantBrowserPanel.ts | §11.12 | F.7.07 | `bench/ui/ai-generate.bench.ts` |
| `ai-query` | `runtime.dataWorkbench.nl` (NL → store query) | dataworkbench/NLQueryPanel.ts | §11.10 derivative | F.9.03–F.9.04 | `bench/ui/dw-nl-query.bench.ts` |
| `ai-rules` | `runtime.ai.rules` | ai/ValidatePanel.ts | §11.12 derivative (validate) | F.7.08–F.7.09 | `bench/ui/ai-validate.bench.ts` |
| `ai-voice` | `runtime.ai.voice` | canvas/VoiceCommandIndicator.ts, canvas/IntentPrompt.ts, canvas/ConsequencePreviewOverlay.ts | §11.12 derivative (voice) | F.7.15–F.7.16 | (no bench — informational latency) |

---

## §21.3  `apps/` — 12 apps

| App | Type | `runtime.<leg>` reach | UI consumer | Click trail | Sub-phase | Bench |
|---|---|---|---|---|---|---|
| `editor` | composition root host | the body of `composeRuntime()` (data half lives in `apps/editor/src/bootstrap.everything.ts`) | every UI surface (transitively) | §11.4 | A.1, D.3, G.8 | `bench/ui/workspace-mount.bench.ts` |
| `bench` | bench harness | n/a — used by CI, not by users | n/a | n/a | H.6, H.7 | (this app *is* the gate) |
| `cli` | dev/admin CLI | n/a — out of editor | n/a | n/a | n/a | n/a |
| `component-editor` | separate authoring pane | `runtime.componentEditor.open(id)` | (opened from inspector "Edit family" link) | §11.6 derivative | F.12.20 | `family-editor-quality-gates` workflow |
| `headless` | `@pryzm/headless` package container | n/a (server use) | n/a | n/a (D7 differentiator preserved) | n/a |
| `docs-site` | static docs | n/a | n/a | n/a | n/a |
| `sync-server` | worker | `runtime.sync.client` connects to it via `protocol` package | SaveUndoRedoHUD reflects sync status | §11.9 | A.1, C.10–C.13 | `sync-roundtrip.bench.ts` |
| `ai-worker` | worker | `runtime.ai.*` proxies to it | every `src/ui/ai/*` | §11.12 | F.7.* | `cv-pipeline.bench.ts`, `bench/ui/ai-first-token.bench.ts` |
| `bake-worker` | worker | `runtime.persistence.bake` proxies; bakes via storage-driver chunks | (transparent — UI only sees `'baked'` state on save pill) | §11.8 | A.1 | `bake-incremental.bench.ts` |
| `api-gateway` | worker | `runtime.persistence.client` is the HTTP/WS client to it | every persistence-touching surface | §11.4 | C.* | api integration tests |
| `marketplace-api` | worker | `runtime.plugins.marketplace.list/install` proxies to it | (marketplace panel — Phase F surfaces standalone panel; today inside ProjectBrowser) | §11.13 | F.12.01–F.12.05 | `bench/ui/plugin-contribution-add.bench.ts` |
| `marketplace-web` | adjunct site | n/a in editor | n/a | n/a | n/a |

---

## §21.4  Orphan check

For each row above with `Status = pending`, the operator can verify by running [`23-verification-scripts.md`](./23-verification-scripts.md) §1 ("Orphan detector"). The script asserts:

1. Every package/plugin/app row in this matrix maps to either:
   - a UI consumer file under `src/ui/` that imports from it (directly or via `runtime.<leg>`), **or**
   - an `internal` row whose dependents are themselves UI-consumed.
2. Every file under `src/ui/` that is listed in [`09`–`11`](./09-ui-inventory-A-D.md) appears in the UI-consumer column of at least one row above.
3. Every sub-phase ID in [`14`–`19`](./14-subphases-A-D.md) appears in the Sub-phase column of at least one row above.

If any of those three assertions fails, the GA gate (Phase H.10) does not open.

---

## §21.5  What this matrix proves (and what it does not)

**Proves**: every architecture artefact the operator paid for has a known UI consumer (or is `internal` to a chain that does), every UI surface has a typed runtime leg to bind to, every wireup has a sub-phase ID and a bench.

**Does not prove**: that the wireup is *actually correct at runtime*. That proof is delivered by the UI bench suite ([`12`](./12-ui-perf-benches.md)) + the visual-diff CI ([§13.4](./12-ui-perf-benches.md#134-visual-diff-ci-alongside)) + the H.8–H.10 catch-all sweep ([`19`](./19-subphases-G-H-catchall.md)).

The two together — this matrix (static) + the bench suite (dynamic) — are the operator's contract that the 36-month rebuild lands behind the white UI with no orphans and no regressions.
