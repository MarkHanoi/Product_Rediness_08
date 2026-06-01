# §11  Click-trail wireups — every user gesture mapped end-to-end

> Part of [PRYZM2-WIREUP-PLAN-S72](./00-INDEX.md). Source slice of [PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md](../00-PLAN.md) lines 713–1163.

---

## §11 Click-trail wireups — every user gesture mapped end-to-end

This section is the answer to *"have you planned every single detail?"*. Each subsection traces a concrete user gesture from the white panel that captures it, through every layer of the new runtime, to the pixel that appears on screen. Each trail is verified against the current code (file + line refs are real; "today" describes 2026-04-29 main).

### §11.1 First load — landing page paints

**Today** (`src/main.ts:486` → `PlatformRouter.start(engineInit)` → `PlatformShell` mounts `LandingPage`):
1. Browser hits `/`. `src/main.ts` boot runs `PlatformRouter.start(engineInit)` where `engineInit` is a closure that lazy-loads `EngineBootstrap`.
2. `PlatformShell` mounts `<div id="platform-root">` and shows the white landing.
3. No engine code loaded yet (correct — landing is engine-free).

**After (Phase A)**:
1. `src/main.ts:boot()` calls `await composeRuntime({ container: document.getElementById('container')!, persistence, sync, ai, audit, rendererMode })`.
2. `composeRuntime()` synchronously builds the data half (`bootstrapWithEverything`) and *kicks off* the render half (`Renderer.init()` is async — non-blocking). Persistence client + sync client + AI client + plugin host are constructed (no network calls yet).
3. `PlatformRouter.start(runtime)` mounts the same `PlatformShell(runtime)` and shows the white landing.
4. The renderer canvas is in `#container` from t=0 ms but invisible (no project open → no scene).
5. **Time-to-landing budget: identical to today** (composeRuntime() resolves in ≤ 50 ms — only data half is sync; renderer init runs in parallel with landing paint).

**Files touched in Phase A**: `src/main.ts` (rewrite), `src/ui/platform/PlatformRouter.ts` (signature change `start(runtime)`), `src/ui/platform/PlatformShell.ts` (constructor takes `runtime`). **No new bridge code. No `(window as any)` reads added.**

---

### §11.2 Click "Log in" → AuthModal → success → ProjectHub paints with projects

**Today** (`src/ui/platform/AuthModal.ts` → POST `/api/login` → token in `localStorage['bim-platform-token']` → `ProjectHub.loadProjects()` reads localStorage `bim-projects-index`):
1. AuthModal posts credentials, server returns JWT, store it in localStorage.
2. `PlatformRouter.showHub()` constructs `ProjectHub`.
3. `ProjectHub.loadProjects()` calls `projectRepository.listProjects()` → reads `bim-projects-index` from localStorage. (The legacy code also fires `apiFetch('/api/projects')` in the background to merge server projects, but the local copy is the source of truth for the initial paint.)

**After (Phase C)**:
1. AuthModal flow unchanged. Token still in `localStorage['bim-platform-token']` (auth is orthogonal — `runtime.persistence.client` reads the token via `getAuthToken()` on every request — already wired in `ProjectListClient`).
2. `PlatformRouter.showHub()` constructs `new ProjectHub(runtime)` — constructor receives the runtime.
3. `ProjectHub.loadProjects()` becomes:
   ```ts
   await this.runtime.persistence.projectListStore.refresh();           // GET /api/v1/projects via ProjectListClient
   this.unsub = this.runtime.persistence.projectListStore.subscribe(s => this.render(s));
   ```
4. `ProjectListStore` is a typed `Store<ProjectListState>` — already in `packages/stores/src/ProjectListStore.ts`. Subscribers get live updates when the SyncClient receives a `projectList.thumbnailUpdate` broadcast.
5. **Localstorage `bim-projects-index` is read once by the migrator** (Phase C) and any local-only projects are POSTed to the server, then the key is deleted.

**Files touched in Phase C**: `src/ui/platform/ProjectHub.ts` (rewire 5 methods: `loadProjects`, `createProject`, `deleteProject`, `renameProject`, `openProject`). Delete `src/ui/platform/ProjectRepository.ts`.

---

### §11.3 Click "+ New project" → name modal → submit → editor opens with the new project

**Today** (`src/ui/platform/ProjectHub.ts:1281`):
1. Click "+ New project" → modal with name input + project-type dropdown.
2. Submit handler:
   ```ts
   const projectId = crypto.randomUUID();
   projectRepository.saveProject({ id: projectId, name, ... });    // localStorage write
   this.openProject(projectId, name, { isNewProject: true });      // open immediately
   apiFetch('/api/projects', { method:'POST', body: JSON.stringify({name, id: projectId}) })
     .then(...)                                                     // fire-and-forget server registration
     .catch(...)                                                    // logs warning if offline
   ```
3. `openProject()` sets `(window as any).__pendingProjectId = id` and routes to the kill-switch.

**After (Phase C)**:
1. Same white modal — pixel identical.
2. Submit handler:
   ```ts
   try {
     const summary = await this.runtime.persistence.client.create(name);   // POST /api/v1/projects
     // ProjectListStore auto-updates from the response; the hub re-renders via the subscription from §11.2.
     await this.openProject(summary.id, summary.name, { isNewProject: true });
   } catch (err) {
     this.runtime.toasts.error(`Could not create project: ${err.message}`);  // white AppToast — visible!
   }
   ```
3. The legacy `(window as any).__pendingProjectId` smell is gone — the project id flows through typed args.
4. **Errors surface to the white toast system** — fixes I1 ("I cannot see logs when project creation fails").

**Files touched in Phase C**: `src/ui/platform/ProjectHub.ts` (the create handler — ~40 LOC change). The `apiFetch('/api/projects')` legacy server route is kept for one sprint as a 410 Gone shim, then deleted.

---

### §11.4 Click "Open" on a project card → editor mounts in place (the white toolbar paints over the canvas)

**Today** (`src/ui/platform/ProjectHub.ts:1311` → `PlatformRouter.launchWorkspace` → `location.assign('/?pryzm2=1&project=<id>')`):
1. Card click → `this.callbacks.onOpenProject(id, name, opts)`.
2. PlatformRouter.launchWorkspace() does `location.assign('/?pryzm2=1&project=<id>')`. **Page reload**.
3. After reload, `src/main.ts:55–386` kill-switch tears down `#platform-root`, `#dck-workspace`, `#progress`.
4. Mounts `apps/editor/src/main.ts:mountEditor()` → fullscreen dark `#pryzm2-canvas` (`background:#1a1f2e`).
5. Calls `bootstrapRenderEverything()` → wires renderer + 4 committers.
6. Dark minimum-chrome toolbar paints over the canvas.

**After (Phase A + D)**:
1. Card click → `PlatformRouter.launchWorkspace(id, name)`. **No location.assign. No reload.**
2. Implementation:
   ```ts
   async launchWorkspace(projectId: string, projectName: string): Promise<void> {
     this.shell.show('loading', { text: 'Opening project…' });
     try {
       await this.runtime.persistence.openProject(projectId);
       // openProject() does:
       //   1. GET /api/v1/projects/:id/events       (event log)
       //   2. await runtime.persistence.eventLog.replay(events)
       //      → each event dispatches through runtime.bus → patches → stores → committers
       //   3. runtime.scene.scheduler.markDirty('camera')
       //      → first frame paints with the loaded geometry
       this.shell.show('workspace', { projectId, projectName });
       // shell.show('workspace') keeps the existing #container (where the renderer
       // already lives), mounts the white toolbar above it, the white left/right
       // rails alongside, and the white inspector. SAME CANVAS — the renderer
       // never detached.
     } catch (err) {
       this.shell.show('hub');
       this.runtime.toasts.error(`Could not open project: ${err.message}`);
     }
   }
   ```
3. The renderer was already initialised at boot in §11.1 step 4 — it just had no scene to draw. Now it has stores populated by event-log replay; the committer host paints the geometry; first frame ≤ 800 ms (perf gate).
4. **No flash, no navigation, no theme change** — the white project hub fades to the white workspace; behind both, the same canvas was always there.

**Files touched**: `src/ui/platform/PlatformRouter.ts` (launchWorkspace — delete the `location.assign`, replace with the body above). `src/ui/platform/PlatformShell.ts` (`show('workspace')` mounts the existing rails — already exists; just receives `runtime` now).

---

### §11.5 In editor → right rail → Architecture → click "Wall" → draw a wall (the user's exact gesture)

**Today** (`src/ui/tools-panel/panels/CreateRailPanel.ts:727`):
1. The right rail is owned by `ToolsPanelController` (mounted in `Layout.ts:24`).
2. `CreateRailPanel._buildSections()` returns hard-coded section objects:
   ```ts
   { id: 'architecture', label: 'Architecture', icon: PryzmIcons.wall,
     tools: [
       { label: 'Wall', shortcut: 'Alt+W', icon: PryzmIcons.wall,
         action: () => service.activateWallTool(WallDrawingMode.POLYLINE_ORTHO) },
       { label: 'Curtain Wall', ... action: () => toolManager.activateCurtainWall('SINGLE') },
       { label: 'Door', ... action: () => toolManager.activateDoor('single') },
       ...
     ]
   }
   ```
3. `service.activateWallTool()` is `BimService.activateWallTool` (`src/core/BimService.ts:81`) — instantiates `WallTool` (`src/elements/walls/WallTool.ts`), wires its pointer listeners to `BimWorld`'s raycaster, mounts `WallDrawingHUD`.
4. User clicks in viewport → wall tool collects path points via raycaster hits.
5. ESC or right-click commits → `commandManager.execute(new CreateWallCommand(payload))` (`src/commands/walls/CreateWallCommand.ts`).
6. CreateWallCommand mutates `wallStore` (legacy), fires `wall-created` event.
7. `wallFragmentBuilder` listens → builds THREE fragment → adds to scene.
8. Scene paints via the legacy postproduction pipeline.

**After (Phase E + F)** — the user gesture is identical, every layer is the new architecture:

**1. The right rail itself is data-driven from contributions.**

CreateRailPanel `_buildSections()` is REWRITTEN to enumerate plugin contributions per discipline. Each plugin owns its toolbar entry. New file `plugins/wall/src/contributions.ts`:

```ts
import type { Contribution } from '@pryzm/plugin-host/types';
import { PryzmIcons } from '@pryzm/icons';

export const wallToolbarContribution: Contribution<'toolbar.discipline'> = {
  id:           'wall.tool',
  hostKind:     'toolbar.discipline',
  hostPlacement: { discipline: 'architecture', order: 100 },
  label:        'Wall',
  shortcut:     'Alt+W',
  icon:         PryzmIcons.wall,
  activate(runtime) {
    runtime.tools.activate('wall', { mode: 'polyline-ortho' });
  },
};
```

Same for `curtain-wall`, `door`, `window`, `slab`, `floor`, `ceiling`. The "Architecture" discipline is just a `hostPlacement.discipline` value; no panel-side enumeration.

CreateRailPanel becomes:
```ts
private _buildSections(): DisciplineSection[] {
  const all = this.runtime.plugins.contributions('toolbar.discipline');
  const grouped = groupBy(all, c => c.hostPlacement.discipline);
  return DISCIPLINES.map(d => ({
    id: d.id, label: d.label, icon: d.icon,
    tools: (grouped[d.id] ?? [])
      .sort((a, b) => a.hostPlacement.order - b.hostPlacement.order)
      .map(c => ({
        label: c.label, shortcut: c.shortcut, icon: c.icon,
        action: () => c.activate(this.runtime),
      })),
  }));
}
```

The white rail looks identical. **It's now extensible by plugin install** — a marketplace plugin's tool just shows up in the right discipline by registering a contribution.

**2. `runtime.tools.activate('wall', {mode: 'polyline-ortho'})` is the new ToolHost.**

ToolHost is a small typed package (`packages/tool-host`, new in Phase E) that owns the active-tool state machine. It:
- Looks up the wall tool in `runtime.plugins.tool('wall')` (registered by `plugins/wall/src/tool.ts` — already exists).
- Calls `tool.onActivate({mode: 'polyline-ortho'})`.
- Wires `runtime.picking` to the tool's pointer handlers.
- Mounts the `WallDrawingHUD` overlay (the existing white HUD from `src/ui/WallDrawingHUD.ts`, but constructor takes `runtime`).
- Replaces `BimService.activateWallTool` and the `(window as any).wallTool` global.

**3. `runtime.picking` owns canvas raycasting.**

`packages/picking` (already exists) is a `PickingController` that:
- Owns the raycaster (replaces `BimWorld.raycaster`).
- Translates pointer events on the canvas into typed hit results: `{element: 'wall', id, point: Vec3, normal: Vec3, faceIndex}`.
- Subscribes the active tool to relevant hit kinds (the wall tool wants `'plane'` and `'wall'` hits; the door tool wants `'wall'` hits only).
- Replaces the 12 `(window as any).<family>Builder?.getRootById?.()` lookups in PRYZM 1's pick pipeline.

**4. User clicks → wall tool collects path points → on commit → `runtime.bus.executeCommand('wall.create', payload)`.**

The wall tool's commit path becomes (in `plugins/wall/src/tool.ts`):
```ts
async commit(): Promise<void> {
  const baseline = this.path.toBaseline();
  await this.runtime.bus.executeCommand('wall.create', {
    baseline,
    systemTypeId: this.activeSystemTypeId,
    levelId:      this.runtime.projectContext.activeLevelId,
    dimensions:   { height: this.activeHeight, thickness: this.activeThickness },
  });
}
```

**5. The bus dispatches to `CreateWallHandler` (already shipping in `plugins/wall/src/handlers/CreateWall.ts`).**

The handler:
- Validates the payload (Zod schema in `plugins/wall/src/store.ts`).
- Validates `systemTypeId` against `runtime.systemTypes.wall` (the auxiliary catalogue).
- Mints a ULID via `@pryzm/schemas/factory/createId`.
- Returns the produced state diff via `produceCommand()` (Immer-based).

**6. The bus emits patches via `PatchEmitter`.**

Patches fan out to **four subscribers** (wired in `composeRuntime`):
- `runtime.stores.wall.applyPatches(...)` — already wired by `attachStores`.
- `runtime.persistence.eventLog.append({type: 'wall.create', payload, hash, ts, actor})` — local-first.
- `runtime.sync.client.broadcast(event)` — peers receive the same event.
- `runtime.bake.markDirty('wall', wallId)` — bake worker queues a chunk rebake.

**7. WallStore patches → CommitterHost notified → `WallCommitter.onAdd(wallId, dto)` → THREE.Mesh.**

`WallCommitter` (already shipping in `@pryzm/plugin-wall/committer`) builds the THREE mesh from the DTO using the geometry kernel (no THREE inside the kernel — the committer is the THREE owner per kill-switch K1B-2). The mesh goes into `runtime.scene.host.registry`.

**8. SceneReconciler picks up the new mesh next tick → adds to `renderer.scene` → `frameScheduler.markDirty('scene')`.**

Already wired in `bootstrap.render.everything.ts:installSceneReconciler`.

**9. Renderer paints the next frame.**

The renderer is subscribed to the scheduler with priority `renderer.draw`. On the next dirty tick, `renderer.render(scene, camera)` runs. The wall is on screen.

**Latency budget**: click-to-pixel < 16 ms (one frame at 60 fps, single rAF). Verified by `apps/bench/perf/click-to-paint.spec.ts` (new in Phase H).

**Files affected for this trail**:
- `src/ui/tools-panel/panels/CreateRailPanel.ts` — rewire `_buildSections()` (Phase F).
- `src/ui/WallDrawingHUD.ts` — constructor takes `runtime` (Phase B).
- `src/ui/WallModePicker.ts` — constructor takes `runtime` (Phase B).
- `src/core/BimService.ts` — DELETED (Phase D); replaced by `runtime.tools`.
- `src/elements/walls/WallTool.ts` — DELETED (Phase E); replaced by `plugins/wall/src/tool.ts` (already exists).
- `src/commands/walls/CreateWallCommand.ts` — DELETED (Phase E); replaced by `plugins/wall/src/handlers/CreateWall.ts` (already exists).
- `src/elements/walls/WallStore.ts` + `WallFragmentBuilder.ts` — DELETED (Phase E); replaced by `plugins/wall/src/store.ts` + `plugins/wall/src/committer.ts` (already exist).
- NEW: `plugins/wall/src/contributions.ts` (Phase F).
- NEW: `packages/tool-host/` (Phase E).

**Same gesture, every layer real.**

---

### §11.6 Select an existing wall → property inspector opens → change thickness → wall re-paints

**Today**: viewport click → BimManager raycaster → `selectionService.select(elementId)` → `(window as any).propertyPanelInspector.update(id)` → reads `(window as any).wallStore.getById(id)` → renders form → onChange → `commandManager.execute(new UpdateWallDimensionsCommand(...))`.

**After (Phases B + E + F)**:
1. Click → `runtime.picking.pick(canvasPoint)` → `{element: 'wall', id}`.
2. `runtime.selection.select([{element: 'wall', id}])`.
3. `PropertyInspector` (in `src/ui/PropertyInspector.ts`) is subscribed to `runtime.selection`. On change:
   - Looks up the per-family panel via `runtime.plugins.contributions('sidebar.right.inspector').filter(c => c.appliesTo('wall'))`.
   - Renders the wall plugin's panel into the right-rail slot. The panel reads `runtime.stores.wall.get(id)`.
4. User changes thickness → onChange → `runtime.bus.executeCommand('wall.setDimensions', {id, dimensions: {thickness}})`.
5. Same handler chain as §11.5 step 6 onwards. The wall re-paints next frame via the WallCommitter's `onUpdate(wallId, before, after)`.

**No `(window as any).propertyPanelInspector`. No `(window as any).wallStore`. Just `runtime.<typed.path>`.**

---

### §11.7 Undo / Redo (Cmd+Z, Cmd+Shift+Z)

**Today**: `UndoManager` in `src/history/UndoManager.ts` maintains a stack of `Command` objects with `do()` / `undo()` methods. Hotkeys call `undoManager.undo()` / `redo()`.

**After (Phase D)**: `runtime.undoStack` is the canonical undo (already exists in `EditorRuntime`). It receives an inverse Immer patch from every command via `PatchEmitter`. Hotkey handler in `src/ui/keyboard/Hotkeys.ts` (Phase B widening) calls `runtime.undoStack.undo()` / `redo()`. The bus replays the inverse patches to the affected stores; the committers re-paint.

**Multi-user safety**: the undo stack is per-actor (the actor id is in the audit defaults). When peer B's wall edit lands while peer A's undo cursor is mid-stack, peer A's stack splits — handled by the policy in `08-VISION.md` §3.4.

---

### §11.8 Save (auto-save, no button) — and the Save status pill

**Today**: SaveOrchestrator listens to `bim-store-mutated` DOM events with 1 s debounce → calls `getHash()` → diff against last-saved hash → if different, `onAutoSave('auto')` → ProjectRepository.saveVersion writes localStorage + ServerSyncQueue POSTs to `/api/projects/:id/versions`. Status pill subscribes to `onSaveStatusChange`.

**After (Phase C)**: There is **no debounce, no orchestrator, no separate save button work**. Every command produces patches → EventLog appends one event (the event IS the save) → SyncClient backfills to peers and the server. The save status pill subscribes to:
```ts
runtime.events.on('persistence.status', s => pill.set(s));
// emits: 'idle' | 'pending' | 'syncing' | 'synced' | 'error'
```
The pill text:
- `'idle'` → "Saved"
- `'pending'` → "Saving…" (event written locally, not yet acked by server)
- `'syncing'` → "Syncing…"
- `'synced'` → "Saved"
- `'error'` → "Offline — changes saved locally" (white toast on first occurrence)

The pill is **always green within 50 ms** of a command — local-first means the user is never blocked.

---

### §11.9 Multi-tab and multi-user sync

**Today**: not supported.

**After (Phase A + C)**: Tab B opens the same project → `runtime.persistence.openProject(id)` → fetches event log including the events tab A has authored → SyncClient subscribes to peer broadcasts → tab A's `wall.create` events arrive → `runtime.bus.replay(event)` → store updates → committer paints. Presence cursors via `runtime.sync.presence` paint into a `'overlay.canvas'` contribution slot (the white overlay layer in `src/ui/overlays/`). Conflict policy from `08` §3.4 — last-write-wins on simple props, merge-by-fragment on geometry.

---

### §11.10 Switch view (Plan / Section / 3D / Schedule)

**Today**: `(window as any).viewController.activate(viewId)` → ViewController swaps the camera + projection + visibility filters.

**After (Phase D)**: The view-list panel (in `src/ui/views/ViewBrowser/`) calls:
```ts
this.runtime.viewRegistry.activate(viewId);
```
`runtime.viewRegistry` is the existing `ViewRegistry` from `@pryzm/view-state` (already wired by the view plugin in `bootstrap.everything.ts`). Activating a view:
- Swaps `runtime.cameraController`'s pose.
- Updates `runtime.visibility` filters (which levels, which families are visible).
- Marks the scene dirty; renderer paints next frame.

For Schedule views (which open the bottom panel), the view plugin contributes a `'panel.bottom'` contribution that mounts the existing white `SchedulePanel` and binds it to `runtime.dataWorkbench.schedules.get(viewId)`.

---

### §11.11 Open IFC file (drag-and-drop or Import → IFC)

**Today**: `src/ui/import/IfcImportPanel.ts` uses `apiFetch('/api/ifc/upload')` + ad-hoc OBC import in the engine layer.

**After (Phase F)**:
1. Drag `.ifc` onto canvas → `runtime.events.emit('files.dropped', files)`.
2. The IFC plugin contributes a `'files.dropped'` handler:
   ```ts
   for (const f of files) if (f.name.endsWith('.ifc')) await runtime.ifc.import.start(f);
   ```
3. `runtime.ifc.import.start(file)` = the existing `plugins/ifc-import` package's import service (already shipping under `plugins/ifc-import/src/`). It:
   - Streams the file to `apps/api-gateway`'s `/api/v1/ifc/import` endpoint.
   - Server returns a job id; the import service polls progress.
   - On complete, the server posts events to the project's event log; `SyncClient` ingests them; stores populate; committers paint.
4. Progress is surfaced to the white `EngineLoadingOverlay` via `runtime.events.on('ifc.import.progress', ...)`.

**Same drag-and-drop UI. Real plugin underneath. No `(window as any).OBC`.**

---

### §11.12 Open AI sidebar → ask "create a 3-bedroom apartment"

**Today**: `src/ui/ai/AIPanel.ts` calls `(window as any).aiClient.streamCompletion(...)` (the legacy AI client in `src/ai/AiClient.ts` — POSTs to `apps/ai-worker` via REST).

**After (Phase F)**:
1. Click AI icon in left rail → `LeftNavRail` switches active panel to AI.
2. The AI panel (existing `src/ui/ai/AIPanel.ts`, constructor widened to take `runtime`) calls:
   ```ts
   for await (const chunk of this.runtime.ai.streamCompletion({prompt, ctx: {projectId, selection: this.runtime.selection.snapshot()}})) {
     this.appendToken(chunk);
   }
   ```
3. `runtime.ai` = `AiHostClient` from `@pryzm/ai-host` — owns: model registry, cost meter (`@pryzm/ai-cost`), back-pressure curve (`@pryzm/ai-spend` + worker queue depth), structured-call dispatcher.
4. For tool-calling responses (e.g. the AI proposes `wall.create` operations), the AI client routes them to `runtime.bus.executeCommand` directly. **AI changes flow through the same bus as user changes** — so undo, sync, bake all work uniformly on AI-authored edits.
5. Cost pill (existing white `AiCostPill` in `src/ui/ai/`) subscribes to `runtime.ai.cost.subscribe(...)`.

---

### §11.13 Install a plugin from the marketplace

**Today**: not implemented in the white UI.

**After (Phase F)**: Phase 3C M31–M33 deliverable:
1. User clicks Marketplace icon → existing white marketplace panel mounts.
2. Click Install on a plugin card → POST `/api/v1/marketplace/install/:id` (signed by user).
3. Server returns the plugin manifest URL.
4. `runtime.plugins.installFromUrl(url)` fetches + validates + dynamically imports the plugin module.
5. The plugin's `register(host)` function runs and contributes its `Contribution`s.
6. The white toolbar repaints — the new tool is now in its discipline. Same for sidebars, modals, command palette.

**No reload. No second UI. One runtime, mutable plugin set.**

---

### §11.14 Right-click project card → Rename / Delete / Archive / Star

**Today**: `ProjectHub` context menu calls `projectRepository.saveProject({...meta, name: newName})` etc. → localStorage.

**After (Phase C)**:
- Rename → `runtime.persistence.client.rename(id, newName)` → server → ProjectListStore auto-updates.
- Delete → confirm modal (existing white `ConfirmDialog`) → `runtime.persistence.client.delete(id)` → 204 → ProjectListStore removes the entry.
- Archive / Star → `runtime.persistence.client.patch(id, {isArchived | isStarred: true})` (the legacy `ProjectMeta` flags get a server column or a per-user prefs row in `@pryzm/user-preferences`).

---

### §11.15 The hot keys (Alt+W wall, Alt+D door, Esc cancel, Cmd+Z undo, Cmd+S save-as-version)

`src/ui/keyboard/Hotkeys.ts` (constructor widened to take `runtime` in Phase B) maps hotkeys to:
- Tool hotkeys → `runtime.tools.activate(toolId, mode?)` — same path as the toolbar click.
- `Esc` → `runtime.tools.cancel()` + `runtime.selection.clear()`.
- `Cmd+Z` / `Cmd+Shift+Z` → `runtime.undoStack.undo()` / `redo()`.
- `Cmd+S` → `runtime.persistence.eventLog.tag('user-version', { label: prompt(...) })` — tags the current event-log position as a named version. Replaces the legacy `bim-project-{id}-versions` snapshot.

---

### §11.16 First-paint perf budget — what these wireups guarantee at GA

For the M-medium fixture (`08-VISION.md` §6.2 — 12 K elements, 4 levels, 1 view):
- composeRuntime() + landing paint: ≤ 60 ms (sync only; no engine load).
- Click "+ New project" + create + open: ≤ 250 ms (one round-trip to server, optimistic local create allowed if offline).
- Click Open on a 12K-element existing project: ≤ 800 ms first interactive frame (event-log replay parallel with renderer init; chunked geometry streaming from bake worker).
- Wall click → pixel: ≤ 16 ms (one rAF tick).
- Idle tab: 0 fps (verified with `requestAnimationFrame` count over 5 s of no input — the scheduler does not tick if no listener marked dirty).
- 50 K-element scrub: 120 fps sustained (`08` §6.3).

These are perf gates in `apps/bench/perf/` — hard CI fail at GA.

---

### §11.17 Coverage check — is every gesture mapped?

The white UI exposes ~78 panel modules. Below is the coverage map (Phase that wires each cluster):

| Cluster | Files | Phase |
|---|---|---|
| Landing + auth + hub + project page | `LandingPage.ts`, `AuthModal.ts`, `ProjectHub.ts`, `PlatformShell.ts`, `PlatformRouter.ts` | A + C |
| Toolbar (left + right + bottom) | `LeftNavRail.ts`, `tools-panel/*`, `bottom-menu/BottomActionMenu.ts`, `RadialMenu.ts` | B + F |
| Property inspector | `PropertyInspector.ts`, `property-inspector/*` | B + F |
| Per-family modepickers + drawing HUDs | `<family>ModePicker.ts`, `<family>DrawingHUD.ts` (12 families) | B + E + F |
| Element creation modals | `ElementCreationModal.ts`, `OpeningModePicker.ts` | B + F |
| Views + sheets + sections | `views/*`, `SheetEditor/*`, `ViewBrowser/*` | B + D + F |
| Schedules + data workbench | `dataworkbench/*`, `SchedulePanel/*` | B + F |
| AI sidebar + cost meter + validate | `ai/*`, `intent/*`, `generative/*` | B + F |
| Annotations + dimensions + grids | `AnnotationInputPanel.ts`, `grids/*` | B + F |
| Imported models + IFC + Rhino + PDF | `import/*`, `import-manager/*`, `imported-models/*` | B + F |
| Furniture + kitchen + wardrobe + carousel | `furniture-carousel/*`, `kitchen/*`, `wardrobe/*` | B + F |
| Levels + section view + plan view | `levels/*`, `inspect/*`, `geospatial/*` | B + D + F |
| Toasts + modals + dialogs + overlays | `AppToast.ts`, `ConfirmDialog.ts`, `OverridePanel.ts`, `overlays/*` | B |
| Project browser + member panel + CDE versions | `ProjectBrowser/*`, `platform/CDEVersionPanel.ts`, `platform/ProjectMemberPanel.ts` | B + C |
| Settings + owner flags + welcome | `OwnerSettingsPanel.ts`, `OwnerFeatureFlags.ts`, `WelcomeModal.ts` | B + C |

**Every cluster has a phase.** The phase plan in §4 plus the click-trail wireups in §11.1–§11.16 plus the deletion list in §5 cover every line of `src/ui/`. There is no panel that "still uses the old engine" after Phase G — by construction, the old engine doesn't exist.

---

