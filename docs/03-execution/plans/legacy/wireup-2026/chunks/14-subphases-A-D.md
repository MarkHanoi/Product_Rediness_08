# §16.0–§16.4  Sub-phase plan — Phases A · B · C · D

> Part of [PRYZM2-WIREUP-PLAN-S72](./00-INDEX.md). Source slice of [PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md](../00-PLAN.md) lines 1660–1806.

> **Additions since this chunk was sliced** (per [Chunk 26 §26.4](./26-plan-self-corrections.md#§264--amendment-d--32-new-sub-phases-are-orphaned-from-their-phase-chunks) banner approach — Option (b)):
> - **Phase B** adds **B.6, B.7, B.8, B.9, B.10** — see [Chunk 24 §24.5](./24-pryzm1-src-coverage-audit.md#§245--new-sub-phases-summary-what-to-add-to-§16) (per-folder coverage closure: `commands` widening, `core` legacy injection, `services` constructor wiring, `ai` host adapter, `ai-host` plugin façade).
> - **Phase C** adds **C.14** — see [Chunk 24 §24.5](./24-pryzm1-src-coverage-audit.md#§245--new-sub-phases-summary-what-to-add-to-§16) (`src/persistence/` move into `packages/persistence-client/`).
> - **Phase C exit gate** is now `C.exit.1–C.exit.4` (was: "persistence rewire complete"). See [Chunk 26 §26.6](./26-plan-self-corrections.md#§266--amendment-f--phase-a-entry-gate-was-opened-on-red-ci-phase-d-entry-gate-must-not-be) for the four conditions and [§26.13](./26-plan-self-corrections.md#§2613--updated-phase-c-exit--phase-d-entry-gate) for the formal restatement.
> - **Phase C back-half** adds **Z.0–Z.20** (21 retro-fit sub-phases) landing the verification harness, parametric baselines, banner PR, re-slice retirement, and ADR/sprint-ID cleanups in S77 D1–D9. Persistence rewire (C.1–C.14) lands in S76–S77 D10; Z.* fills D11–D15. See [Chunk 26 §26.1](./26-plan-self-corrections.md#§261--amendment-a--phase-z-pre-flight-verification-harness--retro-fit-as-z-in-late-phase-c).
> - **All sprint IDs in this chunk are `-WIRE` aliases** per [Chunk 25 §25.7](./25-architecture-docs-cross-alignment.md) (e.g. `S73` here means `S73-WIRE`, distinct from the post-GA roadmap's `S73-PG4`). [Chunk 26 §26.9](./26-plan-self-corrections.md#§269--amendment-i--sprint-id-lint-enforcement-missing) lands the commit-msg hook (H.5.1) that prevents bare reintroduction.
> - **Status as of this audit**: Phase A **complete**, Phase B **complete**, Phase C **in progress** (C.1–C.13 merging through S76; C.14 + Z.* scheduled for S77).

---

## §16 Phase + sub-phase plan — every UI/UX click interaction mapped

This section is the granular execution plan. **Every clickable element, every drag, every key, every right-click context-menu item, every modal submit, every dropdown change in the white UI is its own numbered sub-phase**, owns its own PR, lands its own bench, and is merged independently. Sub-phases are sized so each is one engineer-day at most. This guarantees no two interactions land in the same PR — so legacy code cannot ride along under the umbrella of "Phase F is done".

### §16.0 Conventions

- **Sub-phase ID**: `<Phase>.<Group>.<Item>` (e.g. `F.1.04` = Phase F, group 1 = `toolbar.discipline` contributions, item 4 = the Door tool).
- **One sub-phase = one PR = one bench**. PR title format: `[<sub-phase-id>] <Gesture description>`.
- **Acceptance per sub-phase**:
  1. Gesture demo passes (Playwright test runs the click and asserts new wireup is hit, not the legacy one).
  2. The corresponding bench in §13 is added to `apps/bench/baseline.json` (warn-only pre-GA).
  3. The legacy code path that USED to handle this gesture is **deleted in the same PR** (or, if it's shared with another not-yet-migrated gesture, is annotated with a `// REMOVED-IN: <sub-phase-id>` comment so the deletion is tracked).
  4. CI lint count of `(window as any)` drops by at least the count of cast sites the gesture touched.
- **Sprint mapping** (S73–S87, 15 sprints across 30 weeks):
  - Phase A: S73 (composition root)
  - Phase B: S73–S75 (constructor widening, parallel with C)
  - Phase C: S74–S76 (persistence rewire)
  - Phase D: S75–S77 (engine consolidation)
  - Phase E: S76–S80 (per-family element migration)
  - Phase F: S78–S84 (plugin contributions — the bulk of UI gesture migrations)
  - Phase G: S82–S86 (mass deletions, runs as sub-PRs alongside F)
  - Phase H: S85–S87 (lock-in: lint flips, bench hard-fail flips, visual-diff CI)

### §16.1 Phase A — Composition root (S73, 7 sub-phases)

The runtime handle, the lint floor, and the boot rewrite. **No visible UI change.** The user sees the same landing/hub/editor; only the boot path changes.

| Sub-phase | Gesture / Surface | Today | After | Sprint | Bench |
|---|---|---|---|---|---|
| **A.1** | App boot (cold load → landing painted) | `src/main.ts` runs `loadEngine()` lazy + `PlatformRouter.start(engineInit)`; ?pryzm2 kill-switch tears down platform DOM and mounts dark `apps/editor` | `src/main.ts` runs `await composeRuntime({...})` → returns `runtime`; `PlatformRouter.start(runtime)` mounts platform shell with the renderer canvas already in `#container` | S73 | `bench/ui/landing-paint.bench.ts` (LCP < 600 ms) |
| **A.2** | n/a (foundational) | n/a | New package `packages/runtime-composer/` with `composeRuntime()` factory; consumes `bootstrap.everything.ts`, persistence-client, sync-client, ai-host, plugin-host | S73 | `bench/runtime-compose.bench.ts` (synthesise full runtime in headless < 50 ms) |
| **A.3** | n/a (foundational) | (string keys on window) | Typed `PryzmRuntime` interface with 14 named slots (`scene`, `stores`, `bus`, `selection`, `tools`, `picking`, `viewRegistry`, `persistence`, `sync`, `ai`, `plugins`, `events`, `toasts`, `userPreferences`) | S73 | TypeScript-only — strict-mode build gate |
| **A.4** | n/a | `PlatformRouter.start(engineInit: () => Promise<...>)` | `PlatformRouter.start(runtime: PryzmRuntime)` — typed signature change; downstream callers updated | S73 | `bench/ui/workspace-mount.bench.ts` adapted to new signature |
| **A.5** | n/a | `PlatformShell` reads `(window as any).platformShellState` | `PlatformShell(runtime)` constructor; threads runtime into all child mounts in this file only | S73 | included in workspace-mount bench |
| **A.6** | toast.show (any toast) | `import { showToast } from './AppToast'` (singleton with module-level state) | `runtime.toasts.show(...)` (typed wrapper around the same singleton — same DOM, no behavioural change) | S73 | `bench/ui/toast-show.bench.ts` (< 16 ms) |
| **A.7** | n/a (lint rule) | no rule | `eslint-plugin-pryzm/no-window-as-any` lands in WARN mode — every `(window as any)` printed in CI but does not block; baseline file `eslint-baseline-window-as-any.json` captured | S73 | per-sprint count assertion |

**Phase A done when**: `composeRuntime()` returns; landing paints; ProjectHub renders unchanged; editor still opens via the legacy `?pryzm2=1` route (kill-switch still alive — Phase D removes it). **The runtime exists but is not yet consumed by the panels.**

### §16.2 Phase B — Constructor widening (S73–S75, ~38 sub-phases)

Threading `runtime` into every panel constructor. **No behavioural change**. Each sub-phase widens one or more sibling panels and adds a `runtime` field with `// TODO(<sub-phase-id>): replace legacy reads in <gesture> sub-phase` annotations on every retained `(window as any)` read inside that file.

| Sub-phase | Files widened | Sprint | Bench (regression only — must stay green) |
|---|---|---|---|
| **B.1** | New `packages/ui-base/Panel.ts` base class with `runtime` field, `mount/render/unmount/dispose` lifecycle, OTel `pryzm.ui.<panel>.{mount,render,unmount}` spans | S73 | `bench/ui/panel-base-overhead.bench.ts` (mount overhead < 0.5 ms) |
| **B.2** | `src/ui/Layout.ts` (the orchestrator; threads `runtime` to every child) | S73 | `bench/ui/workspace-mount.bench.ts` |
| **B.3** | `src/ui/LeftNavRail.ts` | S73 | `bench/ui/lnr-toggle.bench.ts` |
| **B.4** | `src/ui/PanelManager.ts` + `src/ui/makeDraggable.ts` | S73 | nil |
| **B.5** | `src/ui/PropertyInspector.ts` (orchestrator only — per-family widgets in F.6.x) | S74 | `bench/ui/inspector-mount.bench.ts` |
| **B.6** | `src/ui/property-inspector/*` (4 files) | S74 | included in B.5 bench |
| **B.7** | `src/ui/views/ViewTabBar.ts` + `ViewHeaderButtons.ts` | S74 | `bench/ui/view-tab-switch.bench.ts` |
| **B.8** | `src/ui/ContextualEditBar.ts` | S74 | `bench/ui/contextual-edit-bar.bench.ts` |
| **B.9** | `src/ui/SaveUndoRedoHUD.ts` | S74 | `bench/ui/save-undo-hud.bench.ts` |
| **B.10** | `src/ui/SelectionOverlay.ts` | S74 | `bench/ui/selection-overlay.bench.ts` |
| **B.11** | `src/ui/ViewCube.ts` | S74 | `bench/ui/view-cube-orbit.bench.ts` |
| **B.12** | `src/ui/AppToast.ts` (already in A.6) + `src/ui/ConfirmDialog.ts` + `src/ui/ElementCreationModal.ts` | S74 | `bench/ui/modal-open.bench.ts` |
| **B.13** | `src/ui/RadialMenu.ts` + `src/ui/ShortcutCheatSheet.ts` + `src/ui/UiPreferences.ts` | S74 | `bench/ui/radial-menu-open.bench.ts` |
| **B.14** | `src/ui/SpatialTree.ts` | S75 | `bench/ui/spatial-tree-paint.bench.ts` |
| **B.15** | `src/ui/levels/*` (2) + `src/ui/grids/*` (1) | S75 | included in spatial tree bench |
| **B.16** | `src/ui/imported-models/*` + `src/ui/import-manager/*` + `src/ui/import/*` | S75 | nil |
| **B.17** | `src/ui/ProjectBrowser/*` + `src/ui/ViewBrowser/*` + `src/ui/ViewBrowser/panels/*` | S75 | `bench/ui/view-list-paint.bench.ts` |
| **B.18** | `src/ui/data/*` + `src/ui/data/buckets/*` | S75 | `bench/ui/data-tree-paint.bench.ts` |
| **B.19** | `src/ui/dataworkbench/DataWorkbench.ts` (orchestrator only) | S75 | `bench/ui/dw-mount.bench.ts` |
| **B.20–B.30** | `src/ui/dataworkbench/*` panels (one sub-phase per panel: Analytics / Compliance / DataSheet / DesignHistory / HierarchyTree / NLQuery / Physics / PortfolioQuery / Programme / RelationshipExplorer / SpatialQuery / TemplateEditor / SyncStateDetailDrawer) | S75 | one bench per panel |
| **B.31** | `src/ui/ai/AIPanel.ts` (orchestrator only — first-token call in F.7.1) | S74 | `bench/ui/ai-panel-mount.bench.ts` |
| **B.32** | `src/ui/ai/AICreatePanel.ts` + `ValidatePanel.ts` + `FloorPlanImportPanel.ts` + `FloorPlanFullPlanViewer.ts` + `FloorPlanDebugOverlay.ts` | S74 | included in ai-panel-mount |
| **B.33** | `src/ui/intent/*` (6 files) | S75 | `bench/ui/intent-pill.bench.ts` |
| **B.34** | `src/ui/generative/*` (2) | S75 | nil |
| **B.35** | `src/ui/rendering/*` (10 files — orchestrators only; per-control rewire in F.10.x) | S75 | `bench/ui/render-quality-toggle.bench.ts` |
| **B.36** | `src/ui/SchedulePanel/*` + `src/ui/SheetEditor/*` (orchestrators only) | S75 | `bench/ui/schedule-mount.bench.ts` |
| **B.37** | `src/ui/furniture-carousel/*` + `src/ui/wardrobe/*` + `src/ui/kitchen/*` + `src/ui/rooms/*` (orchestrators only) | S75 | `bench/ui/carousel-scroll.bench.ts` |
| **B.38** | `src/ui/bottom-menu/BottomActionMenu.ts` (orchestrator; per-button rewire in F.5.x) | S75 | `bench/ui/bottom-shortcut.bench.ts` |
| **B.39** | `src/ui/canvas/*` (4) + `src/ui/overlays/*` (2) | S75 | `bench/ui/snap-indicator.bench.ts` |
| **B.40** | `src/ui/inspect/*` + `src/ui/interop/*` + `src/ui/geospatial/*` + `src/ui/fallbacks/*` + `src/ui/primitives/*` + `src/ui/icons/*` | S75 | nil |

**Phase B done when**: every panel under `src/ui/` has a `runtime: PryzmRuntime` field threaded by its parent. Cast-site count is unchanged but every retained cast carries a `// TODO(<sub-phase-id>):` annotation pointing to the gesture's destruction sub-phase. **The runtime is plumbed; gesture wires still go to legacy.**

### §16.3 Phase C — Persistence rewire (S74–S76, 18 sub-phases)

Each gesture in the platform pages and the save/undo HUD becomes one PR. The legacy `ProjectRepository` / `SaveOrchestrator` / `ServerSyncQueue` are deleted incrementally as their last consumer migrates.

| Sub-phase | Gesture (exact click) | Today | After | Sprint | Bench |
|---|---|---|---|---|---|
| **C.1.01** | Hub paints with project list | `projectRepository.listProjects()` (localStorage) + background `apiFetch('/api/projects')` | `await runtime.persistence.client.list()` + `runtime.persistence.projectListStore.subscribe(render)` | S74 | `bench/ui/hub-paint.bench.ts` (TTI < 500 ms with 100 projects) |
| **C.1.02** | Hub: search field keystroke filters list | local in-memory filter on JSON projects | local in-memory filter on `projectListStore.state.projects[]` | S74 | `bench/ui/hub-search-filter.bench.ts` (< 16 ms per keypress) |
| **C.1.03** | Hub: sort dropdown change (recent / name / size) | local sort | local sort against store snapshot | S74 | included in hub-search-filter |
| **C.1.04** | Hub: archive/active tab toggle | filters by `meta.isArchived` from localStorage | filters by `summary.isArchived` from store | S74 | included |
| **C.2.01** | Hub: click "+ New project" button → modal opens | static modal mount | unchanged modal mount; ready for C.2.02 | S74 | `bench/ui/creation-modal-open.bench.ts` |
| **C.2.02** | Hub: "+ New project" modal submit | `projectRepository.saveProject({...})` (localStorage write) + fire-and-forget `apiFetch('/api/projects', {method:'POST'})` | `await runtime.persistence.client.create(name)` → returns `ProjectSummary`; on error: `runtime.toasts.error(...)` | S74 | `bench/ui/hub-create.bench.ts` (click → editor mounted < 800 ms) |
| **C.3.01** | Hub: click "Open" on a project card | `this.callbacks.onOpenProject(id)` → `PlatformRouter.launchWorkspace(id)` → `location.assign('/?pryzm2=1&project=<id>')` (page reload) | `await runtime.persistence.openProject(id)` + `PlatformShell.show('workspace')` (no reload) | S74 | `bench/ui/hub-open-project.bench.ts` (click → first interactive frame, no reload, M-medium fixture < 800 ms) |
| **C.3.02** | Hub: keyboard shortcut Enter on focused card → open | same as click | same wire as C.3.01 | S74 | included |
| **C.4.01** | Hub: right-click card → context menu shows | static menu | reads `runtime.plugins.contributions('menu.context.project')` (so plugins can add items later) | S74 | `bench/ui/hub-context-menu.bench.ts` |
| **C.4.02** | Context menu → click "Rename" → inline rename | `projectRepository.saveProject({...meta, name: newName})` | `await runtime.persistence.client.rename(id, newName)` | S74 | `bench/ui/hub-rename.bench.ts` |
| **C.4.03** | Context menu → click "Delete" → confirm modal → confirm | `projectRepository.deleteProject(id)` | `await runtime.persistence.client.delete(id)` | S74 | `bench/ui/hub-delete.bench.ts` |
| **C.4.04** | Context menu → click "Archive" / "Unarchive" | local meta toggle | `await runtime.persistence.client.patch(id, {isArchived: bool})` | S74 | `bench/ui/hub-archive.bench.ts` |
| **C.4.05** | Context menu → click "Star" / "Unstar" | local meta toggle | `await runtime.persistence.client.patch(id, {isStarred: bool})` | S74 | included in hub-archive bench |
| **C.4.06** | Context menu → click "Duplicate" | `projectRepository.saveProject({...meta, id: newId})` | `await runtime.persistence.client.duplicate(id, newName)` | S74 | `bench/ui/hub-duplicate.bench.ts` |
| **C.4.07** | Context menu → click "Export .pryzm" | not implemented | `await runtime.persistence.exporter.toPryzm(id)` → triggers browser download | S75 | `bench/ui/hub-export-pryzm.bench.ts` (10K-element project < 5 s) |
| **C.4.08** | Hub: drag-and-drop `.pryzm` ZIP onto hub → import | not implemented | `await runtime.persistence.importer.fromPryzm(file)` → returns new `summary` | S75 | `bench/ui/hub-import-pryzm.bench.ts` |
| **C.5.01** | Workspace open → loading overlay shows progress | listens to legacy `engine-progress` events | listens to `runtime.events.on('persistence.openProgress', ({percent, label}) => ...)` | S74 | included in hub-open-project bench |
| **C.6.01** | Save status pill state transition (idle→pending→synced) | `SaveOrchestrator.onSaveStatusChange((s) => pill.set(s))` | `runtime.events.on('persistence.status', s => pill.set(s))` (states: idle / pending / syncing / synced / error) | S74 | `bench/ui/save-undo-hud.bench.ts` (state change < 50 ms after command) |
| **C.6.02** | Undo button click + Cmd+Z hotkey | `commandManager.undo()` (legacy stack) | `runtime.undoStack.undo()` (Immer reverse-apply) | S75 | `bench/ui/undo.bench.ts` (Cmd+Z → first frame < 16 ms) |
| **C.6.03** | Redo button click + Cmd+Shift+Z hotkey | `commandManager.redo()` | `runtime.undoStack.redo()` | S75 | included in undo bench |
| **C.6.04** | Cmd+S → "Save as named version" prompt | `projectRepository.saveVersion(...)` | `runtime.persistence.eventLog.tag('user-version', {label})` | S75 | `bench/ui/save-as-version.bench.ts` |
| **C.7.01** | CDEVersionPanel: list named versions | `projectRepository.listVersions(id)` | `runtime.persistence.eventLog.tags(id)` | S75 | `bench/ui/cde-version-list.bench.ts` |
| **C.7.02** | CDEVersionPanel: click "Restore" on a version | `projectRepository.restoreVersion(id, versionId)` (replaces snapshot) | `await runtime.persistence.eventLog.replayUntil(id, eventId)` (rewinds event log) | S75 | `bench/ui/cde-version-restore.bench.ts` |
| **C.7.03** | CDEVersionPanel: click "Compare with current" → diff view | not implemented | `runtime.persistence.eventLog.diff(eventA, eventB)` → renders patch summary | S76 | `bench/ui/cde-version-diff.bench.ts` |
| **C.8.01** | ProjectMemberPanel: list members | `apiFetch('/api/projects/:id/members')` | `await runtime.persistence.client.members.list(id)` | S75 | `bench/ui/member-list-paint.bench.ts` |
| **C.8.02** | ProjectMemberPanel: invite member submit | `apiFetch('/api/projects/:id/members', {method:'POST'})` | `await runtime.persistence.client.members.invite(id, email, role)` | S75 | `bench/ui/member-invite.bench.ts` |
| **C.8.03** | ProjectMemberPanel: remove member click → confirm | `apiFetch('.../:userId', {method:'DELETE'})` | `await runtime.persistence.client.members.remove(id, userId)` | S75 | included |
| **C.8.04** | ProjectMemberPanel: change role dropdown | direct PATCH | `await runtime.persistence.client.members.setRole(id, userId, role)` | S75 | included |
| **C.9.01** | OwnerSettingsPanel: feature-flag toggle | localStorage flag | `runtime.userPreferences.flags.set(key, value)` (fanout via WS to all of user's tabs) | S76 | `bench/ui/settings-paint.bench.ts` |
| **C.9.02** | UiPreferences: theme / locale / units / autosave-interval | localStorage prefs | `runtime.userPreferences.set(key, value)` | S76 | included |
| **C.10.01** | Auth: login submit | `apiFetch('/api/login')` → `localStorage['bim-platform-token']` | unchanged (auth orthogonal); token consumed by `runtime.persistence.client.getAuthToken()` (no behavioural change) | S74 | `bench/ui/auth-modal-open.bench.ts` |
| **C.10.02** | Auth: signup submit | unchanged path | unchanged | S74 | included |
| **C.10.03** | Auth: forgot password submit | unchanged | unchanged | S74 | included |
| **C.10.04** | Auth: logout button (top-right user menu) | clears localStorage + `location.reload()` | `await runtime.persistence.signOut()` (clears token + closes WS + clears session) → returns to landing | S74 | `bench/ui/auth-logout.bench.ts` |
| **C.11.01** | DELETE `src/ui/platform/ProjectRepository.ts` | last consumer migrated by C.7.x | file deleted | S76 | lint count: -1 file |
| **C.11.02** | DELETE `src/ui/platform/SaveOrchestrator.ts` | last consumer migrated by C.6.x | file deleted | S76 | lint count: -1 file |
| **C.11.03** | DELETE `src/ui/platform/ServerSyncQueue.ts` | last consumer migrated by C.6.x + C.4.x | file deleted | S76 | lint count: -1 file |

**Phase C done when**: every persistence-touching gesture in the platform pages, hub, version panel, member panel, settings, and save HUD goes through `runtime.persistence.*`. The 3 legacy persistence files are deleted. localStorage `bim-projects-index` is gone.

### §16.4 Phase D — Engine consolidation (S75–S77, 14 sub-phases)

Removes the dark editor / `?pryzm2=1` kill-switch / dual-renderer split. The renderer is the one in `packages/renderer/`, mounted in `#container` from boot, owned by `runtime.scene.renderer`.

| Sub-phase | Gesture / Surface | Today | After | Sprint | Bench |
|---|---|---|---|---|---|
| **D.1** | Workspace open: which renderer mounts | `?pryzm2=1` → mounts dark `apps/editor` canvas; otherwise legacy renderer | always mounts `runtime.scene.renderer` (which is `packages/renderer/`); the canvas is in `#container` from boot; `#pryzm2-canvas` deleted; `#progress` deleted | S75 | `bench/ui/workspace-mount.bench.ts` (no DOM swap, no flash) |
| **D.2** | DELETE `src/main.ts` `?pryzm2=1` kill-switch (the 386-line tear-down) | conditional teardown of `#platform-root`, `#dck-workspace`, `#progress` | replaced by `composeRuntime()` + `PlatformShell.show('workspace')` | S75 | included in D.1 |
| **D.3** | DELETE `apps/editor/src/main.ts:mountEditor()` (the dark mount path) | dark mount with hard-coded background `#1a1f2e` | `apps/editor/src/bootstrap.everything.ts` is reused as the data half by `composeRuntime`; `mountEditor()` and the dark canvas are deleted | S76 | included |
| **D.4** | DELETE `src/engine/EngineBootstrap.ts` (2,086 LOC, #8 worst file in 09 §3) | legacy engine boot orchestrator | `composeRuntime()` is the orchestrator; this file deleted | S77 | lint count: -1 file, ~250 cast sites |
| **D.5** | DELETE `src/engine/init*.ts` (6 files, all owners of own `requestAnimationFrame`) | each had its own rAF | replaced by `runtime.scene.scheduler.requestFrame(reason)`; rAF count drops 6 → 1 | S76 | `bench/idle-cpu.bench.ts` (unchanged budget; verify no regression) |
| **D.6** | DELETE `src/engine/RenderPipelineManager.ts` (~680 LOC, #17 worst file) | legacy post-FX + bloom + TRAA + SSGI driver | replaced by `packages/renderer/RenderPipelineManager.ts` driven by `runtime.scene.scheduler` dirty flags | S76 | `bench/render-pass-cost.bench.ts` |
| **D.7** | DELETE `src/engine/UnifiedFrameLoop.ts` (402 LOC, #18 worst file) | legacy frame loop | replaced by `packages/frame-scheduler/FrameScheduler.ts` (same API surface, single rAF) | S75 | `bench/idle-cpu.bench.ts` |
| **D.8** | DELETE `src/engine/BatchCoordinator.ts` + `DrawingPipelineOrchestrator.ts` | legacy batch/draw coordinators | absorbed into FrameScheduler + per-plugin `committer.ts` | S76 | included |
| **D.9** | ViewCube drag → camera orbit | `(window as any).cameraController.setView(...)` | `runtime.cameraController.setView(...)` + `runtime.scene.scheduler.markDirty('camera')` | S76 | `bench/ui/view-cube-orbit.bench.ts` (60 fps p95 drag) |
| **D.10** | ViewCube click face → orthographic snap | same as D.9 | same path | S76 | included |
| **D.11** | View tab click → camera + visibility filters swap | `(window as any).viewController.activate(viewId)` | `runtime.viewRegistry.activate(viewId)` | S76 | `bench/ui/view-tab-switch.bench.ts` |
| **D.12** | WorkspaceModeBar mode switch (3D / Plan / Section / Sheet) | `(window as any).workspaceController.setMode(...)` | `runtime.workspace.setMode(mode)` (which composes `runtime.viewRegistry.activate()` + the appropriate panel mounts) | S76 | `bench/ui/view-switch.bench.ts` |
| **D.13** | Selection: click in viewport → element selected → highlight + edit bar | `BimManager.raycaster` → `selectionService.select(id)` → `bim-selection-changed` event | `runtime.picking.pick(canvasPoint)` → `runtime.selection.select([{element, id}])` → fires `runtime.events.emit('selection.changed', ...)` | S76 | `bench/ui/selection-overlay.bench.ts` |
| **D.14** | Selection: drag marquee → multi-select | legacy marquee in `BimManager` | `runtime.picking.marquee(rectStart, rectEnd)` → `runtime.selection.select(hits)` | S76 | `bench/ui/inspector-multi-select.bench.ts` |

**Phase D done when**: there is one renderer, one rAF, one selection service. The dark editor is deleted. The kill-switch is deleted. The `?pryzm2=1` URL parameter no longer does anything.

