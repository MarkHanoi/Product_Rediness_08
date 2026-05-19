# §0–§2  Objective, retraction & audit

> Part of [PRYZM2-WIREUP-PLAN-S72](./00-INDEX.md). Source slice of [PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md](../00-PLAN.md) lines 18–169.

---

# PRYZM2-ENTERPRISE-WIREUP-PLAN-S72 — The white UI, the real engine, no patches

> *"The 36-month rebuild was an architecture rebuild. The UI is not on the migration boundary. Every PRYZM 1 pixel — landing page, project hub, main editor scenes — must remain visually and behaviourally identical. PRYZM 2's job is to be the engine those pixels are talking to."*
>
> *"No patches. Real architecture and orchestration. This needs to be the best browser BIM app."*

---

## §0 Critical review of the v1 draft

The first version of this plan (committed earlier today) proposed a `@pryzm/legacy-bridge` package as the only allowed coupling between `src/ui/` and the new architecture. **That proposal was a patch and has been retracted.** The reasons:

| Smell in v1 | What it actually was |
|---|---|
| `legacyProjectRepo.ts` mimicking `ProjectRepository.list / create / delete` | A second translation layer over `ProjectListClient`. Two interfaces for the same concept. The legacy `ProjectMeta` ↔ `ProjectSummary` round-trip would drift. |
| `legacyEngineFactory.createEngineRuntime()` returning a shape `EngineBootstrap` consumers expect | A 200-LOC delegation shim that becomes immortal. Future PRYZM-2-only callsites would have to either learn the legacy shape or invent a third surface. |
| Typed accessors on the bridge that "replace" `(window as any).wallStore` | Still an indirection. The right move is `runtime.stores.wall` directly, not `bridge.runtime.wallStore`. |
| `legacyEventBus` re-exporting `command-bus` | A second source of truth for events. The lint rule (E8 in v1) is the only thing keeping the two from drifting — i.e. process discipline replacing architectural correctness. |
| Codemod sites in `src/ui/` that read from the bridge | Still 769 mechanical replacements. Same effort, worse outcome (because the bridge stays). |

The v1 plan also under-scoped the work. It claimed 6 weeks because the bridge let `src/elements/` and `src/commands/` and `src/ai/` survive untouched. That is the patch — those zones are exactly what the new packages (`@pryzm/plugin-<family>`, `@pryzm/ai-host`) replace, and dual-tracking them produces a permanent fork.

**This v2 plan replaces v1 in full.** No bridge package. The new architecture is the runtime. The legacy zones are deleted. The white UI binds to the real APIs.

The honest cost is bigger — **~5 sprint-months** with two engineers, **~10 with one** — but the codebase at the end has one engine, one persistence stack, one event bus, one set of stores, one renderer, one plugin host. Anything less is a fork that will be paid for forever.

---

## §1 Operator intent — unchanged from v1

> *"Keep the PRYZM 1 UI exactly as it is — landing page, project hub, project page, main editor scenes, all the white panels, all the icons, all the keyboard flows. Wire the new architecture (`packages/`, `plugins/`, `apps/editor/src/bootstrap.*.ts`, `apps/bake-worker/`, `apps/sync-server/`) **behind** the same UI. No bridge. No second hub. No second canvas. No `(window as any)`. No flag. The 36 months of work was about how geometry is built, persisted, baked, streamed and synced — not about what the screen looks like."*

This intent is consistent with `08-VISION.md` §7 NG7 and `06-PRYZM-IDENTITY-AND-RECOUNT.md` §1, and is the binding constraint for every decision below.

---

## §2 Audit — the real numbers

### §2.1 The two hubs and the two editors (today, 2026-04-29)

| Surface | Owner file | Status | Action |
|---|---|---|---|
| **PRYZM 1 white landing** | `src/ui/platform/LandingPage.ts` (~1,500 LOC) | KEEP — pixel-frozen | Visual-diff CI gate forever |
| **PRYZM 1 white project hub** | `src/ui/platform/ProjectHub.ts` (~2,800 LOC) | KEEP — pixel-frozen, **rewire data layer** | Subscribes to `runtime.persistence.projectListStore`; dispatches via `runtime.persistence.client` |
| **PRYZM 1 white editor chrome** | `src/ui/*` (78 panel modules, 30,977 LOC in `src/styles/`) | KEEP — pixel-frozen, **rewire every callsite** | Constructor injection of `runtime`; ~769 `(window as any)` casts replaced |
| **PRYZM 2 dark hub** | `apps/editor/src/projects/ProjectHub.ts` + `NewProjectDialog.ts` + `ProjectCard.ts` (~610 LOC) | DELETE | Phase G |
| **PRYZM 2 dark editor chrome** | `apps/editor/src/main.ts` minimum-chrome toolbar + canvas styling (~150 LOC inside `mountEditor`) | DELETE the chrome; KEEP `mountEditor()` | Phase G |
| **Kill-switch + flag** | `src/main.ts:55–386` (`?pryzm2=1` + `?pryzm1=1`) + `packages/engine-router/` | DELETE | Phase A end |

### §2.2 The `(window as any)` cast inventory

`rg "window as any" src/ui/ src/engine/` produces:

- **769 sites** in `src/ui/` across ~50 files.
- **~250 sites** in `src/engine/subsystems/init*.ts` (these are the *writes* — engine init publishes globals so `src/ui/` can read them).
- **~40 distinct global keys**: `bimManager, bimWorld, projectContext, navManager, viewController, propertyPanelInspector, schedulePanel, transformControls, commandManager, wallStore, slabStore, doorStore, windowStore, columnStore, beamStore, ceilingStore, curtainWallStore, floorStore, roofStore, wallSystemTypeStore, slabSystemTypeStore, ceilingSystemTypeStore, floorSystemTypeStore, kitchenRunInspector, dataWorkbench, edgeProjectorService, comparisonEngine, inspectModeCoordinator, renderPipelineManager, slabWallConnectivityService, viewPropertiesPanel, workspaceController, zoomToAll, unselectAll, updateInspector, updateViewsTable, OBC, obcViewpoints, _ifcLevelImportInProgress, __instancedElementRenderer, __planSymbolCache, __wallRebuildControl, wallFragmentBuilder, slabBuilder, slabTool, …`.

These globals are the API surface PRYZM 1 was built on. The new architecture has typed equivalents for **every single one of them**:

| Legacy global (read by `src/ui/`) | PRYZM 2 typed equivalent on `runtime` |
|---|---|
| `wallStore`, `slabStore`, `doorStore`, …  (12 element families) | `runtime.stores.wall`, `runtime.stores.slab`, `runtime.stores.door`, … |
| `wallSystemTypeStore`, `slabSystemTypeStore`, …  (catalogue stores) | `runtime.systemTypes.wall`, `runtime.systemTypes.slab`, … (from `runtime.auxiliaries`) |
| `commandManager.execute(cmd)` | `runtime.bus.executeCommand(type, payload)` |
| `projectContext` (active project + level + selection scratch) | `runtime.projectContext` (new typed store, Phase B) |
| `bimManager`, `bimWorld` (THREE scene + world helpers) | `runtime.scene.host` (CommitterHost) + `runtime.scene.renderer.scene` |
| `transformControls` | `runtime.tools.transform` (Phase E gizmo wrapper around `@pryzm/picking`) |
| `viewController`, `navManager`, `viewPropertiesPanel` | `runtime.viewRegistry` + `runtime.cameraController` |
| `renderPipelineManager` | `runtime.scene.renderer` (the new `Renderer` from `@pryzm/renderer`) |
| `wallFragmentBuilder`, `slabBuilder`, `ceilingBuilder`, etc. | DELETED. The new committers (`WallCommitter`, `SlabCommitter`, …) own this responsibility and they are reached only via `runtime.scene.host` — UI never names them. |
| `edgeProjectorService` | `runtime.drawingPrimitives.edges` (from `@pryzm/drawing-primitives`) |
| `slabWallConnectivityService` | `runtime.constraint.slabWall` (from `@pryzm/constraint-solver`) |
| `inspectModeCoordinator`, `LevelExplodeController` | `runtime.visibility.modes` (from `@pryzm/visibility`) |
| `dataWorkbench` (templates, hierarchy, formula) | `runtime.dataWorkbench` (composes `@pryzm/formula-library` + `@pryzm/expr-eval` + the hierarchy/template stores from the data plugin) |
| `kitchenRunInspector`, `furnitureStore` | Per-plugin: `runtime.plugins.get('kitchen')`, `runtime.plugins.get('furniture')` (Phase F) |
| `comparisonEngine` | `runtime.comparison` (from a new `@pryzm/comparison` package, Phase F) |
| `obcViewpoints` | `runtime.bcf.viewpoints` (from `plugins/bcf`) |
| `_ifcLevelImportInProgress`, `OBC` (the namespace itself) | DELETED. IFC import lives in `plugins/ifc-import`; UI calls `runtime.ifc.import.start(file)` and subscribes to its progress events. |

**The mapping is total.** There is no surface for which the new architecture lacks a typed home. The work is constructor-thread + call-site rewrite — not adapter-build.

### §2.3 The persistence + sync triple stack — three layers, one job

`src/ui/platform/ProjectRepository.ts` (~900 LOC) + `SaveOrchestrator.ts` (~400 LOC) + `ServerSyncQueue.ts` (~600 LOC) collectively:

1. Maintain a localStorage index `bim-projects-index` of project metadata.
2. Persist per-project versions to `bim-project-{id}-versions` (DEFLATE-compressed JSON snapshots, max 20 versions, soft-trim on quota).
3. Debounce store mutations (1 s) → snapshot → write to localStorage → enqueue POST to `/api/projects/:id/versions`.
4. Retry POSTs with exponential backoff, persist queue to `pryzm-sync-queue`, replay on reconnect.

The new architecture has the same job done by:

| Concern | Legacy file | New owner | Status |
|---|---|---|---|
| Project list metadata | `ProjectRepository.list/create/delete` (localStorage) | `ProjectListClient` (REST `/api/v1/projects`) + `ProjectListStore` (subscribed view) | Built |
| Versioning | `ProjectRepository.saveVersion / listVersions` (localStorage + DEFLATE) | `EventLog` (NDJSON event-log + content-addressed chunk store) | Built (`packages/persistence-client/src/EventLog.ts`) |
| Mutation → save trigger | `SaveOrchestrator` (DOM event debounce) | Bus `PatchEmitter` → `EventLog.append(event)` per command | Built (`packages/command-bus/PatchEmitter.ts`) |
| Server upload + retry | `ServerSyncQueue` (POST /api/projects/:id/versions, exp backoff) | `SyncClient` (WebSocket-first; HTTP fallback; per-event acks) | Built (`packages/sync-client/`) |
| Multi-tab + multi-user | none (legacy is single-tab) | `SyncClient` peer-broadcast with CRDT-flavour conflict policy from `08-VISION.md` §3 | Built |
| Offline queue persistence | `pryzm-sync-queue` localStorage key | `EventLog` is local-first; sync-client backfills on reconnect | Built |

**Delete the three legacy files.** Their replacements are first-class. The white hub UI subscribes to `ProjectListStore` and dispatches to `ProjectListClient`; the white editor's command bus is the new bus; saving and syncing are the bus's job, not a separate orchestrator.

### §2.4 The legacy element + command + AI zones

`src/elements/<family>/` (12 directories, ~140 files), `src/commands/<family>/` (~265 files), and `src/ai/*` (~37 files) collectively implement the same vocabulary as `plugins/<family>/` and `apps/ai-worker/` + `packages/ai-host/`. Per `apps/editor/migrations/sunset-pryzm1.md` §2 these zones are scheduled for S37 / S52 deletion (already past). They were not deleted because nothing forced it. Phase F of this plan forces it: the white UI imports from `runtime.bus` + `runtime.stores.<family>` + `runtime.plugins.<id>` + `runtime.ai`, not from `src/elements/` or `src/commands/` or `src/ai/`. After Phase F the zones are unreachable; Phase G deletes them.

### §2.5 The composition root today vs the composition root we need

Today (`src/main.ts`, simplified):

```
PlatformRouter.start(startEngine)
  → PlatformShell mounts (landing → auth → ProjectHub.white)
  → on Open Project:
      PlatformRouter.launchWorkspace(projectId)
        → location.assign('/?pryzm2=1&project=<id>')   // the bug
        → page reload
        → kill-switch in main.ts removes platform-root, dck-workspace, progress
        → bootProject(projectId) mounts apps/editor/src/main.ts mountEditor()
        → mountEditor renders #pryzm2-canvas (background:#1a1f2e)
        → bootstrapRenderEverything() builds runtime
        → minimum-chrome toolbar paints over the canvas
```

Target (Phase A):

```
src/main.ts:
  const runtime = await composeRuntime({ container: '#container' })
    // composeRuntime calls bootstrapRenderEverything() into the EXISTING
    // #container element that PRYZM 1 platform-shell sets aside. It also
    // assembles the platform-side runtime members (selection-store,
    // hover-store, picking, drawing-primitives, persistence, sync, ai,
    // bake, plugin-host, ifc, rhino, comparison, dataWorkbench).
    // No flags. No second canvas. No DOM teardown.
  PlatformRouter.start(runtime)
    // PlatformShell mounts the white landing → auth → ProjectHub.
    // Each panel constructor receives `runtime`. No window globals.
  on Open Project:
    runtime.persistence.openProject(projectId)
      → fetches event log from server
      → hydrates each store (wall, slab, …) via patches on the bus
      → committer host paints into the renderer
      → frame-scheduler marks dirty
      → first frame paints behind the white toolbar
```

One composition root. One canvas. One runtime. One bus. One persistence. One sync. One AI. One plugin host.

---

