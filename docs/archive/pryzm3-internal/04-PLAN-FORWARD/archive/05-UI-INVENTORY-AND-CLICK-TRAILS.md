# 05 — UI Inventory and Click Trails

> **Position**: After `04-END-TO-END-FLOWS-AND-COVERAGE.md`. Distilled from `reference/wireup-2026/chunks/09-ui-inventory-A-D.md`, `chunks/10-ui-inventory-E-H.md`, `chunks/11-ui-inventory-I-L-and-coverage.md`, and the click-trails block in `chunks/08-cycle-3-cdn-collapse.md §11`.
>
> **Why this is plan-forward, not reference**: the 220 files under `src/ui/` are the **non-negotiable preserve set** (Vision §6, Discipline Rule 7). Every file in this inventory must keep its current pixels through Phase G. The 14 click-trails are the **gesture corpus** — every gesture must resolve to a typed `runtime.*` call by the end of Wave 7 (per `04-END-TO-END-FLOWS-AND-COVERAGE.md §3`).
>
> **Live count**: `find src/ui -name '*.ts' -o -name '*.tsx' | wc -l` — currently **220** (parametric per `15-PACKAGE-POPULATION-GAP.md §13` ≥ 220 floor; per `chunks/26 §26.0` floor file).
> **⚠ TRACKER RULE**: Editing this file → update `../00-PROCESS-TRACKER.md` same commit (§3 wave ledger row, §4 next-actions, §2 booleans as applicable).

---

## §1 — UI inventory by category (12 categories, A–L)

The 220 files split into 12 categories. Each category lists file count, primary purpose, and the wave that wires its consumers to `runtime.*`.

### Category A — App shell + platform (12 files)

`src/main.ts`, `src/browser-entry.tsx`, `src/browser.css`, `src/familyCreatorPlaceholder.ts`, `PlatformRouter.ts`, App-Shell skeleton.

**Wires via**: `composeRuntime()` boot — Wave 4 D.4.0.

### Category B — Project hub + auth (8 files)

`ProjectHub/`, `AuthModal/`, `OnboardingFlow/`, `WelcomePanel.tsx`.

**Wires via**: `runtime.auth.*`, `runtime.persistence.client.listProjects` — Wave 5 F.6.1–F.6.2.

### Category C — Top bar + global chrome (14 files)

`TopBar/`, `BreadcrumbNav.tsx`, `ProjectTitleEditor.tsx`, `UserAvatarMenu.tsx`, `NotificationBell.tsx`, `SearchPalette.tsx`.

**Wires via**: `runtime.shortcuts`, `runtime.toast`, `runtime.search` — Wave 5 F.6.3–F.6.4.

### Category D — Left rail (tool palette) (24 files)

`LeftRail/`, `ToolButton.tsx`, per-family launchers (12), `ToolGroupCollapse.tsx`, gizmos & drag handles.

**Wires via**: `runtime.tools.activate(<id>)` — **Wave 6 F.1.1–F.1.12** (one sub-phase per family).

### Category E — Right rail + Property Inspector (38 files)

`PropertyInspector.ts` (1,807 LOC — top-3 file in `src/ui/`), `RoomPropertySection.ts` (1,142 LOC), `WallLayerSection.ts`, `ViewPropertiesPanel.ts` (1,616 LOC), per-family inspector panels (12), shared widgets (Slider, ColorSwatch, NumberStepper, ToggleGroup, etc.).

**Wires via**: `runtime.bus.executeCommand({ type:'<family>.set-*', ... })` — Wave 6 F.2.1–F.2.12 (per family); `runtime.stores.elements.subscribe` for read.

### Category F — Bottom bar + status (9 files)

`BottomBar/`, `LayerSwitcher.tsx`, `LevelSelector.tsx`, `SnapModeIndicator.tsx`, `UnitDisplay.tsx`, `ZoomControl.tsx`.

**Wires via**: `runtime.stores.viewState`, `runtime.scene.snap` — Wave 5 F.5.

### Category G — Center canvas + overlays (16 files)

`SceneCanvas.tsx`, `OrbitController.ts`, `SelectionRect.tsx`, `ContextMenuOverlay.tsx`, `MeasurementOverlay.tsx`, `SnapIndicatorOverlay.tsx`, `DebugOverlay.tsx`, `PhysicsOverlayRenderer.ts` (dev-only).

**Wires via**: `runtime.scene.*`, `runtime.input` — Wave 4 D.4.4 + Wave 6 F.1.

### Category H — Browsers (Project, Sheets, Views, Family, Catalog) (28 files)

`ProjectBrowser/`, `SheetsBrowser/`, `ViewBrowser/` (incl. `panels/SheetsRailPanel.ts`), `FamilyBrowser/`, `CatalogBrowser/`, drag-and-drop adapters.

**Wires via**: `runtime.persistence.client`, `runtime.stores.elements.byKind`, `runtime.bus.executeCommand({ type:'project.add', ... })` — Wave 5 F.3.

### Category I — Generative + AI panels (22 files)

`AIPanel/`, `AICreatePanel.tsx`, `BriefInputPanel.tsx`, `VariantBrowserPanel.tsx`, AI cost-pill, AI history log, RoomAIAssistant chrome.

**Wires via**: `runtime.ai.dispatch`, `runtime.ai.usage`, `runtime.entitlements` — **Wave 7 F.7**.

### Category J — Render + visualization panels (15 files)

`RenderPanel/`, `RealSunControl.tsx`, `RenderGalleryPanel.tsx`, lighting presets UI, environment toggles.

**Wires via**: `runtime.scene.renderer.presets`, `runtime.scene.renderer.queue` — Wave 7 F.10.

### Category K — Collaboration + multiplayer surfaces (11 files)

`PresenceCursorLayer.tsx`, `AwarenessSelectionLayer.tsx`, `CommentThreadPanel.tsx`, `BCFPanel/`, `SyncStatusIndicator.tsx`.

**Wires via**: `runtime.sync.client`, `runtime.sync.awareness`, `runtime.bcf.*` — Wave 7 F.9 + F.11.

### Category L — Settings + admin (23 files)

`OwnerSettingsPanel/`, `BillingPanel.tsx`, `IntegrationsPanel.tsx`, `MembersPanel.tsx`, `EntitlementsPanel.tsx`, `ImportManager/`, `ExportPanel/`, `GeospatialPanel.tsx`.

**Wires via**: `runtime.entitlements`, `runtime.persistence.client.members`, `runtime.{ifc,dxf,rhino}.import`, `runtime.export.*`, `runtime.geospatial` — Wave 7 F.10 + F.11.

---

## §2 — Inventory totals and parametric checks

| Dimension | Floor today | Direction | Verifier |
|---|---:|---|---|
| `src/ui/` `.ts/.tsx` files | **220** | stable through Wave 7; **may shrink** Wave 8+ as inspector mega-files decompose (per `02-WAVE-1-TRIPWIRES.md §13` top-files list) | `find src/ui -name '*.ts' -o -name '*.tsx' \| wc -l` |
| `(window as any)` reaches in `src/ui/` | **764** | monotonically falls to 0 by Phase G | tripwire (`02-WAVE-1-TRIPWIRES.md §1`) — broadened regex per `chunks/26 §26.2` |
| `commandManager.execute(` reaches in `src/ui/` | (subset of 391 dispatch surface) | falls to 0 by Wave 16 close | per-batch verifier in `15-PACKAGE-POPULATION-GAP.md §16` |
| Implicit submodule depth in any UI file | ≤ 20 | ≤ 20 (lint-enforced) | `pnpm ga-gate --check ui-implicit-submodules` |

---

## §3 — Click-trails: the 14 canonical gestures

Source: `chunks/08-cycle-3-cdn-collapse.md §11`. These 14 trails are the **gesture corpus** — every gesture is a sequence of `(surface → handler → runtime.<leg> → store mutation → render)`. Every trail must resolve **purely** through `runtime.*` (no `(window as any)`, no legacy global) by Wave 7 F.* close.

### CT-01 — Click "New Project" on hub
```
ProjectHub.NewProjectButton
  → onClick handler
  → runtime.persistence.client.createProject({ name })
  → runtime.stores.projects.append(p)
  → runtime.router.navigate(`/project/${p.id}`)
  → composeRuntime() re-mounts scene
```
Wave: 5 F.6.2.

### CT-02 — Click project card on hub
```
ProjectHub.ProjectCard
  → onClick → runtime.persistence.client.openProject(id)
  → runtime.persistence.tier.streamLoad(id) (chunked)
  → runtime.stores.hydrate(snapshot)
  → runtime.scene.committer.commit(snapshot)
  → runtime.scene.renderer.frame()
```
Wave: 5 F.6.2.

### CT-03 — Press `W` to activate Wall tool
```
global keydown
  → runtime.shortcuts.dispatch('wall.activate')
  → runtime.tools.activate('wall')
  → LeftRail.WallButton highlights (subscribe to runtime.tools.active$)
```
Wave: 5 F.6.3 (shortcut router) + 6 F.1.1 (tool registry).

### CT-04 — Click two points to place a wall
```
SceneCanvas pointerdown × 2
  → runtime.input.pointer (with snap from runtime.scene.snap)
  → wall-tool gizmo collects start + end
  → runtime.bus.executeCommand({ type:'wall.create', payload:{ start, end } })
  → wall plugin handler → runtime.stores.elements.append(wallElement)
  → runtime.scene.committer.commitDelta(...)
  → runtime.scene.renderer.frame()
```
Wave: 6 F.1.1 + 4 D.4.2.

### CT-05 — Select an element by clicking it
```
SceneCanvas pointerdown
  → runtime.input.pointer + runtime.scene.picker.pick(ray)
  → runtime.scene.selection.set([elementId])
  → PropertyInspector subscribes → re-renders for the element's family
  → contextual ribbon updates
```
Wave: 6 F.2 (selection-store ↔ inspector wiring).

### CT-06 — Edit a property in the Inspector
```
WallInspector.NameField input change
  → onBlur → runtime.bus.executeCommand({ type:'wall.set-name', payload:{ id, name } })
  → handler updates runtime.stores.elements
  → runtime.scene.committer.commitDelta(...)
  → renderer paints the (text-only) change
```
Wave: 6 F.2.1 (per family).

### CT-07 — Drag-orbit the camera
```
SceneCanvas pointerdown + pointermove
  → OrbitController consumes runtime.input.pointer
  → runtime.stores.viewState.setCamera(transform) per frame
  → runtime.scene.scheduler.tick() drives runtime.scene.renderer.frame()
```
Wave: 4 D.4.4 + 6 F.1 (no inspector involvement).

### CT-08 — Toggle visibility on a category
```
VisibilityGraphPanel.CategoryToggle click
  → runtime.bus.executeCommand({ type:'visibility.set-rule', payload:{ filter, hide:true } })
  → handler updates runtime.scene.visibility (visibility package)
  → runtime.scene.committer.commitDelta(...) (re-evaluates filters)
  → renderer paints
```
Wave: 7 F.8.

### CT-09 — Save with Cmd+S
```
global keydown (Cmd+S)
  → runtime.shortcuts.dispatch('save')
  → runtime.persistence.client.save(projectId)
  → runtime.persistence.tier.streamSave(snapshot)
  → runtime.toast.success('Saved')
```
Wave: 5 F.6.3 + F.6.4.

### CT-10 — Open AI panel and dispatch a generative brief
```
AIPanel.OpenButton click
  → AIPanel mounts, subscribes to runtime.ai.usage (cost-pill)
  → BriefInputPanel.SubmitButton click
  → runtime.ai.dispatch({ tool:'generative.layout', brief, constraints })
  → ai-host streams VariantBrowserPanel updates
  → user picks a variant → runtime.bus.executeCommand({ type:'ai.commit-variant', payload:{ variantId } })
  → wall/door/window create dispatches replay through runtime.bus
```
Wave: 7 F.7.

### CT-11 — Drag a furniture item from the carousel into the scene
```
FurnitureCarousel.Item dragstart
  → FurnitureDragDropHandler subscribes to runtime.input.pointer
  → drop on SceneCanvas
  → runtime.bus.executeCommand({ type:'furniture.create', payload:{ itemId, transform } })
  → plugins/furniture handler → runtime.stores.elements.append(...)
  → renderer paints
```
Wave: 6 F.1.12 + F.2.12.

### CT-12 — Switch level via bottom-bar level selector
```
BottomBar.LevelSelector change
  → runtime.stores.viewState.setActiveLevel(levelId)
  → runtime.scene.committer.commitDelta(...) (re-evaluates filters by level)
  → renderer paints
```
Wave: 5 F.5.

### CT-13 — Place a comment thread (multiplayer)
```
ContextMenuOverlay.CommentItem click
  → runtime.bus.executeCommand({ type:'comment.create', payload:{ at, text } })
  → comment handler writes via runtime.sync.client (replicated)
  → CommentThreadPanel subscribes to runtime.sync.client.threads
  → presence cursor surfaces show the new thread for other users
```
Wave: 7 F.9.

### CT-14 — Export the project to IFC
```
ExportPanel.IFCExportButton click
  → runtime.export.ifc(projectId, options)
  → bake-worker streams progress → ExportPanel progress bar
  → on complete → runtime.toast.success('Exported') with download link
```
Wave: 7 F.10.

---

## §4 — Coverage gate (Wave 7 exit, gesture-side)

Per `04-END-TO-END-FLOWS-AND-COVERAGE.md §3` and `chunks/26 §26.0`:

```bash
# Every UI file in §1 has been audited and its primary handler is ≤ 1 hop from runtime.*
pnpm tsx tools/ga-gate/check-ui-surface-coverage.ts

# Every click-trail in §3 is reachable in the live editor without (window as any)
pnpm tsx apps/bench/scripts/check-gesture-coverage.mjs

# (window as any) within src/ui/ has fallen to 0
pnpm tsx tools/ga-gate/check-cast-count.ts --scope src/ui/ --max 0
```

The third check is the **white-UI preservation contract** (`12-DISCIPLINE-AND-DOD.md` Rule 7): the cast-count is allowed to fall through any wave, but the inspector-mega-file decomposition (Wave 8+ S103-WIRE) must keep visual diff at 0 px per the per-chunk visual-diff bench (`apps/bench/scripts/visual-diff.mjs`).

---

## §5 — Pixel-freeze contract

Per Vision §6 and `12-DISCIPLINE-AND-DOD.md` Rule 7, the 220 files in §1 may receive only four kinds of edit:

1. **Import path rewrite** — change a `from '../../../engine/foo'` to `from '@pryzm/<package>'` or to `runtime.<leg>`. Zero behavior change.
2. **`(window as any).foo` → `runtime.<leg>`** rewrite — the cast-count tripwire is the lint that drives this.
3. **`commandManager.execute(...)` → `runtime.bus.executeCommand(...)`** rewrite — Wave 16 codemod.
4. **File split** (Wave 8+) — moving handlers/sections out of `PropertyInspector.ts`, `RoomPropertySection.ts`, `ViewPropertiesPanel.ts` into smaller files. The split must produce a 0-pixel visual diff against the per-chunk baseline; the baseline is captured by `Z.7` and re-asserted on every Wave 8+ PR that touches a top-files file.

Any other kind of edit to files in §1 is a **Rule 7 violation** and is blocked by `pnpm ga-gate --check ui-edit-discipline` (lint rule landed in Wave 7 F.* alongside the per-folder rAF/canvas drilldowns).
