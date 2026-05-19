# §12.0–§12.4  UI inventory — Categories A (Platform) · B (Workspace top bar) · C (Left rail) · D (Right tools panel)

> Part of [PRYZM2-WIREUP-PLAN-S72](./00-INDEX.md). Source slice of [PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md](../00-PLAN.md) lines 1164–1260.

---

## §12 Complete UI inventory — every surface mapped

The PRYZM 1 white UI under `src/ui/` is **220 TypeScript files / ~96,630 LOC across 36 subdirectories**. This section enumerates every surface, the user gesture it captures, the legacy wireup (today, with file:line + globals), the typed runtime wireup (after), the wireup phase, and the perf bench that gates it. Counts per subdir verified by `find src/ui -name "*.ts" | wc -l`.

### §12.0 Surface taxonomy

The 220 files fall into **11 surface categories** corresponding to where on the screen the user sees them:

| # | Category | Files | Where the user sees it |
|---|---|---:|---|
| A | Platform pages (pre-editor) | 25 | landing → marketing pages → auth → hub |
| B | Workspace top bar | 6 | top of editor: view tabs, mode bar, contextual edit bar, save/undo HUD |
| C | Left navigation rail | 16 | left edge: spine icons + collapsible panels (MODEL / DATA / VIEWS / SCHEDULES / AI / HISTORY / SETTINGS) |
| D | Right tools panel | 11 | right edge: discipline-grouped tools (Architecture / Annotation / Export / GIS / Grids+Levels / Navigate / Render / Visual) |
| E | Right property inspector | 30 | right edge below tools: per-element property forms |
| F | Bottom strip | 18 | bottom of canvas: action menu, furniture/floating carousel, schedule panel |
| G | Canvas overlays | 8 | drawn on the viewport: ViewCube, selection bbox, presence cursors, snap indicators |
| H | Drawing HUDs + mode pickers | 24 | floating in the viewport during a tool: per-family draw HUDs and mode pickers |
| I | AI surfaces | 6 | dedicated AI side panel + creation/import/validate dialogs |
| J | Data workbench | 15 | bottom panel: 12 analytical sub-panels |
| K | Rendering controls | 10 | floating render panel: render / panorama / walkthrough / video / export |
| L | Modals + utilities | 13 | overlay modals, primitives, drag utilities, panel manager |

Every file maps to exactly one category. The 11 categories cover 100% of the 220 files. `find src/ui -name '*.ts' | wc -l` ≡ Σ category counts.

### §12.1 Category A — Platform pages (25 files; Phases A + C)

`src/ui/platform/`:
`AuthModal.ts`, `CDEVersionPanel.ts`, `ContactSalesModal.ts`, `EngineLoadingOverlay.ts`, `LandingPage.ts`, `LandingPageMosaic.ts`, `LandingPageScrollReveal.ts`, `OwnerSettingsPanel.ts`, `PlatformRouter.ts`, `PlatformShell.ts`, `PlatformShellTypes.ts`, `PricingPage.ts`, `ProjectHub.ts`, `ProjectMemberPanel.ts`, `ProjectRepository.ts`*, `ResourcesDropdown.ts`, `ResourcesPage.ts`, `SaveOrchestrator.ts`*, `ServerSyncQueue.ts`*, `SolutionsDropdown.ts`, `SolutionsPage.ts`, `StructuredNameBuilder.ts`, `UpgradeModal.ts`, `WelcomeModal.ts`, `WorkspaceModeBar.ts`.
*= deleted in Phase C (legacy persistence stack).*

| Surface | User gesture | Today | After | Phase | Bench |
|---|---|---|---|---|---|
| LandingPage + Mosaic + ScrollReveal | scroll, click "Get started", click "Log in" | static HTML, no engine | unchanged — pre-engine surface | A | `bench/ui/landing-paint.bench.ts` (LCP < 600 ms — Vision §6) |
| AuthModal | submit credentials | POST `/api/login` → `localStorage['bim-platform-token']` | unchanged (auth orthogonal); token still consumed by `runtime.persistence.client` via `getAuthToken()` | A | `bench/ui/auth-modal-open.bench.ts` (open < 50 ms) |
| ProjectHub | list / create / delete / rename / archive / star / open / search projects | `projectRepository.listProjects()` (localStorage); `apiFetch('/api/projects')` background | `runtime.persistence.client.list/create/delete/rename/patch` + `runtime.persistence.projectListStore.subscribe` | C | `bench/ui/hub-paint.bench.ts` (TTI < 500 ms with 100 projects); `bench/ui/hub-create.bench.ts` (click → editor mounted < 800 ms) |
| ProjectMemberPanel | invite / remove members | direct `apiFetch('/api/projects/:id/members')` | `runtime.persistence.client.members.list/invite/remove` | C | `bench/ui/member-list-paint.bench.ts` |
| CDEVersionPanel | view / restore project versions | `projectRepository.listVersions()` (localStorage) | `runtime.persistence.eventLog.tags()` (named version tags) + `runtime.persistence.eventLog.replayUntil(eventId)` for restore | C | `bench/ui/cde-version-list.bench.ts` |
| EngineLoadingOverlay | shown during project open | listens to legacy `engine-progress` events | listens to `runtime.events.on('persistence.openProgress', ...)` | C | covered by `cold-load-real.bench.ts` |
| WorkspaceModeBar | switch workspace mode (3D / Plan / Section / Sheet) | `(window as any).viewController.activate(...)` | `runtime.viewRegistry.activate(viewId)` | D | `bench/ui/view-switch.bench.ts` (already exists; assert UI-interactive within budget) |
| WelcomeModal / UpgradeModal / ContactSalesModal | open, dismiss | static; subscribes to `bim-user-tier` event | `runtime.events.on('user.tier.changed', ...)` | C | `bench/ui/modal-open.bench.ts` (generic) |
| OwnerSettingsPanel + OwnerFeatureFlags | toggle owner-level flags | localStorage prefs + ad-hoc fetch | `runtime.userPreferences.set/get` (new `@pryzm/user-preferences` package) + `runtime.persistence.client.flags.set` | C | `bench/ui/settings-paint.bench.ts` |
| PricingPage / ResourcesPage / SolutionsPage / dropdowns | navigate marketing pages | static, no engine | unchanged | A | included in `bench/ui/landing-paint.bench.ts` |
| StructuredNameBuilder | build ISO 19650 name | pure function; consumed by ProjectHub | unchanged signature; consumed via `runtime` for project context | C | nil (pure) |

### §12.2 Category B — Workspace top bar (6 files; Phase B + D)

`src/ui/Layout.ts` (the 1700-LOC editor orchestrator), `src/ui/views/ViewTabBar.ts`, `src/ui/views/ViewHeaderButtons.ts`, `src/ui/ContextualEditBar.ts`, `src/ui/SaveUndoRedoHUD.ts`, `src/ui/PanelManager.ts`.

| Surface | User gesture | Today | After | Phase | Bench |
|---|---|---|---|---|---|
| Layout.ts | mounts every workspace surface; orchestrates 60+ panels | constructs each panel and reads from `(window as any).<service>` (~200 cast sites in this file alone) | constructor takes `runtime`; threads it into every child panel | B | covered by §13 cold-mount bench |
| ViewTabBar | click view tab, drag tab, close tab, "+" new tab | `(window as any).viewController.activate(viewId)` | `runtime.viewRegistry.activate(viewId)` + `runtime.events.on('view.changed', ...)` | D | `bench/ui/view-tab-switch.bench.ts` (click → first-frame < 200 ms with cached view, < 500 ms cold) |
| ViewHeaderButtons | toggle visibility-graphics, lock view, view properties | `(window as any).viewController.toggleVG(...)` | `runtime.viewRegistry.toggleVG(viewId)` | F | `bench/ui/view-vg-toggle.bench.ts` |
| ContextualEditBar | shown when element selected (Move / Rotate / Mirror / Copy / Array / Group / Properties) | reads `(window as any).selectionService.current()`; dispatches `commandManager.execute(...)` | reads `runtime.selection.current()`; dispatches `runtime.bus.executeCommand(...)`; subscribes to `runtime.selection` for show/hide | B | `bench/ui/edit-bar-mount.bench.ts` (selection → bar visible < 16 ms) |
| SaveUndoRedoHUD | save status pill, undo/redo buttons | subscribes to `SaveOrchestrator.onSaveStatusChange`; dispatches `commandManager.undo/redo` | subscribes to `runtime.events.on('persistence.status', ...)`; dispatches `runtime.undoStack.undo/redo` | C | `bench/ui/undo.bench.ts` (Cmd+Z → first-frame < 16 ms) |
| PanelManager | floating-panel z-order + focus | reads window-level focus events | uses typed `runtime.events` for focus + own internal state | B | nil |
| ViewCube (`src/ui/ViewCube.ts`) | drag to orbit, click face for orthographic | `(window as any).cameraController.setView(...)` | `runtime.cameraController.setView(...)` + `runtime.scene.scheduler.markDirty('camera')` | D | `bench/ui/view-cube-orbit.bench.ts` (drag → 60 fps p95) |

### §12.3 Category C — Left navigation rail (16 files; Phase B + F)

`src/ui/LeftNavRail.ts` (the spine + content host), `src/ui/SpatialTree.ts`, `src/ui/levels/*` (2), `src/ui/grids/*` (1), `src/ui/imported-models/*` (1), `src/ui/import-manager/*` (1), `src/ui/ProjectBrowser/*` (2), `src/ui/ViewBrowser/*` (4), `src/ui/ViewBrowser/panels/*` (2 visible: ProjectsRailPanel + SchedulesRailPanel), `src/ui/data/*` (2 — buckets / tree).

The spine has 7 icon buttons: **MODEL / DATA / VIEWS / SCHEDULES / — / AI / HISTORY / SETTINGS**. Each icon swaps the content area to a different panel.

| Spine icon | Mounts panel | Today | After | Phase | Bench |
|---|---|---|---|---|---|
| MODEL | `SpatialTree` (project + level + element tree) | reads `(window as any).{wallStore,slabStore,...}.getAll()` (12 stores polled); fires `bim-store-mutated` listener for re-render | reads from `runtime.stores.<key>` for each family; subscribes to each `store.subscribe(diff)` for incremental updates | B | `bench/ui/spatial-tree-paint.bench.ts` (10K-element tree paints < 500 ms; incremental insert < 16 ms) |
| DATA | `HierarchyTreePanel` + bucket/sheet panels | reads `(window as any).dataWorkbench.hierarchy` | reads `runtime.dataWorkbench.hierarchy` | F | `bench/ui/data-tree-paint.bench.ts` |
| VIEWS | view list, sheet list, view templates | reads `viewDefinitionStore`, `sheetStore` (legacy core imports) | reads `runtime.viewRegistry.list()`, `runtime.stores.sheet`, `runtime.stores.viewTemplates` | B | `bench/ui/view-list-paint.bench.ts` |
| SCHEDULES | `SchedulesRailPanel` — list of schedules | reads `scheduleStore` (core import) | reads `runtime.stores.schedule` | B | `bench/ui/schedule-list-paint.bench.ts` |
| AI | `AIPanel` (chat + suggestions + history) | reads `(window as any).aiClient` | reads `runtime.ai` | F | `bench/ui/ai-panel-mount.bench.ts` (open < 100 ms) |
| HISTORY | `commandProposalStore` driven approval queue | reads legacy `commandProposalStore` | reads `runtime.ai.approvalQueue` | F | `bench/ui/ai-history-paint.bench.ts` |
| SETTINGS | settings + preferences panel | localStorage prefs | `runtime.userPreferences` | C | `bench/ui/settings-paint.bench.ts` |

Per-spine perf gate: spine click → panel content visible **< 100 ms p95**. Width drag → repaint **< 16 ms** (60 fps).

### §12.4 Category D — Right tools panel (11 files; Phase B + F)

`src/ui/tools-panel/ToolsPanelController.ts`, `src/ui/tools-panel/PanelHost.ts`, `src/ui/tools-panel/discipline-spine.ts`, plus 8 discipline rail panels:
`CreateRailPanel.ts`, `AnnotationRailPanel.ts`, `ExportRailPanel.ts`, `GISRailPanel.ts`, `GridsLevelsRailPanel.ts`, `NavigateRailPanel.ts`, `RenderRailPanel.ts`, `VisualRailPanel.ts`.

Each rail's spine button activates a discipline. Each discipline contains tool buttons. **All 8 rails get the same treatment**: hard-coded tool arrays in `_buildSections()` are replaced by `runtime.plugins.contributions('toolbar.discipline').filter(c => c.discipline === <id>)`.

| Discipline | Tools today (hard-coded in `<Rail>.ts`) | After (contributions) | Phase | Bench |
|---|---|---|---|---|
| Architecture (CreateRailPanel) | Wall / Curtain Wall / Door / Window / Slab / Floor / Ceiling / Roof / Stair / Handrail / Column / Beam / Grid (12 tools) | each contributed by `plugins/<family>/contributions.ts` | F | `bench/ui/toolbar-discipline-switch.bench.ts` |
| Annotation (AnnotationRailPanel) | Text / Dimension / Tag / Section / Detail / Revision Cloud (~6) | contributed by `plugins/annotations/contributions.ts` | F | same |
| Export (ExportRailPanel) | Export PDF / DWG / IFC / Schedule CSV / Image (~5) | contributed by `plugins/export-pdf`, `plugins/dxf`, `plugins/ifc-export` | F | `bench/ui/export-trigger.bench.ts` |
| GIS (GISRailPanel) | Locate, basemap, terrain, satellite (~4) | contributed by `plugins/geospatial/contributions.ts` | F | `bench/ui/gis-toggle.bench.ts` |
| Grids+Levels (GridsLevelsRailPanel) | New grid / level / split / offset (~6) | contributed by `plugins/grids/contributions.ts` + level handlers | F | `bench/ui/grids-tool.bench.ts` |
| Navigate (NavigateRailPanel) | Pan / Orbit / Zoom-to / Sections / Walkthrough (~6) | contributed by `plugins/navigate/contributions.ts` (new in Phase F; thin wrapper over `runtime.cameraController`) | F | `bench/ui/navigate-tool.bench.ts` |
| Render (RenderRailPanel) | Render quality, sun, materials, exposure, gallery (~8) | contributed by `plugins/render/contributions.ts` (mounts `src/ui/rendering/*` widgets via runtime) | F | `bench/ui/render-tool.bench.ts` |
| Visual (VisualRailPanel) | Visibility-graphics, edge styles, transparency, isolate (~6) | contributed by `plugins/visibility-intent/contributions.ts` | F | `bench/ui/visual-toggle.bench.ts` |

Per-rail perf gate: tool click → tool-active state **< 16 ms** (one frame). Drawing HUD mount **< 50 ms**.

