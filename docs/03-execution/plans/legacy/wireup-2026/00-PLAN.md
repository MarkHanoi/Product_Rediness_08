---
sprint: S72
authors: Architecture
status: BINDING — supersedes draft v1 (the @pryzm/legacy-bridge proposal) and §4.1 / §4.2 / §4.4 / §4.7 of PRYZM2-FINAL-WIREUP-AUDIT-S71
sourceOfTruthOrder: 08-VISION.md > 06-PRYZM-IDENTITY.md > this plan > S71 audit
date: 2026-04-29
relatedDocs:
  - docs/archive/pryzm3-internal/08-VISION.md
  - docs/03-execution/plans/legacy/phases/audits/PRYZM2-FINAL-WIREUP-AUDIT-S71-2026-04-28.md
  - docs/03-execution/specs/SPEC-27-MIGRATION-ROLLBACK.md
  - docs/02-decisions/adrs/0031-s61-staged-legacy-deletion.md
  - apps/editor/migrations/sunset-pryzm1.md
  - apps/editor/src/bootstrap.everything.ts
  - apps/editor/src/bootstrap.render.everything.ts
  - apps/editor/src/PluginRegistry.ts
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

## §3 The runtime architecture (the typed contract `src/ui/` binds to)

### §3.1 The single composition root: `src/main.ts` → `composeRuntime()`

`src/main.ts` is reduced from 533 LOC to ~80 LOC:

```ts
import { composeRuntime } from '@pryzm/runtime-composer';
import { PlatformRouter } from './ui/platform/PlatformRouter';

async function boot(): Promise<void> {
  const containerEl = document.getElementById('container')!;
  const runtime = await composeRuntime({
    container: containerEl,
    persistence: { fetch: window.fetch.bind(window) },
    sync:        { url: location.origin.replace(/^http/, 'ws') + '/ws' },
    ai:          { enabled: true },
    audit:       { actorId: 'platform-shell', clientId: crypto.randomUUID() },
    rendererMode: 'auto',                    // ADR-007 — WebGPU first, WebGL2 fallback
  });
  PlatformRouter.start(runtime);             // see §3.4 — runtime threads everywhere
}
boot().catch(err => {
  // Loud-fail-soft: render an inline error panel so the user sees something.
  document.body.innerHTML = errorPanel(err);  // small helper, white styling
  console.error('[pryzm/boot]', err);
});
```

`composeRuntime()` is a new package, **`@pryzm/runtime-composer`**. It is **not** a bridge — it is the one place where every L0–L7.5 piece is constructed and joined into a single typed handle. It is the only file in the codebase that knows the names of all the packages.

### §3.2 The `PryzmRuntime` typed handle

Defined in `@pryzm/runtime-composer/src/types.ts` (the only module under `packages/` that the white UI imports types from):

```ts
export interface PryzmRuntime {
  // ── L1 stores (replace 12 wallStore / slabStore / … globals) ─────────────
  readonly stores: {
    readonly wall:        Store<WallDto>;
    readonly slab:        Store<SlabDto>;
    readonly door:        Store<DoorDto>;
    readonly window:      Store<WindowDto>;
    readonly roof:        Store<RoofDto>;
    readonly curtainWall: Store<CurtainWallDto>;
    readonly grid:        Store<GridDto>;
    readonly column:      Store<ColumnDto>;
    readonly beam:        Store<BeamDto>;
    readonly stair:       Store<StairDto>;
    readonly handrail:    Store<HandrailDto>;
    readonly ceiling:     Store<CeilingDto>;
  };

  // ── Catalogue / system-type stores (replace wallSystemTypeStore globals) ─
  readonly systemTypes: {
    readonly wall:    WallSystemTypeStore;
    readonly slab:    SlabSystemTypeStore;
    readonly door:    DoorSystemTypeStore;
    readonly window:  WindowSystemTypeStore;
    readonly ceiling: CeilingSystemTypeStore;
    readonly floor:   FloorSystemTypeStore;
    readonly roof:    RoofSystemTypeStore;
  };

  // ── L2 — bus + undo (replace commandManager) ─────────────────────────────
  readonly bus:        CommandBus;
  readonly emitter:    PatchEmitter;
  readonly undoStack:  UndoStack;

  // ── Selection / hover / project context (replace projectContext) ─────────
  readonly selection:      SelectionStore;
  readonly hover:          HoverStore;
  readonly projectContext: ProjectContextStore;       // {projectId, levelId, …}

  // ── Visibility / inspect / modes (replace inspectModeCoordinator, LevelExplodeController) ─
  readonly visibility: VisibilityController;          // from @pryzm/visibility

  // ── Geometry orchestration (replace edgeProjectorService, slabWallConnectivityService) ─
  readonly drawingPrimitives: DrawingPrimitivesService;
  readonly constraint:        ConstraintSolver;

  // ── Picking / tools (replace transformControls + raycast helpers) ────────
  readonly picking: PickingController;
  readonly tools:   ToolHost;                         // tool state machine

  // ── Views (replace viewController, navManager, viewPropertiesPanel data) ─
  readonly viewRegistry:    ViewRegistry;
  readonly cameraController: CameraController;

  // ── Render half (replace bimManager, bimWorld, renderPipelineManager) ────
  readonly scene: {
    readonly renderer:      Renderer;                 // from @pryzm/renderer
    readonly scheduler:     FrameScheduler;
    readonly host:          CommitterHost;
    readonly materialPool:  MaterialPool;
  };

  // ── Persistence / sync (replace ProjectRepository + ServerSyncQueue + SaveOrchestrator) ─
  readonly persistence: {
    readonly client:           ProjectListClient;     // REST adapter (new)
    readonly projectListStore: ProjectListStore;      // subscribed view
    readonly eventLog:         EventLog;              // local-first event log
    /** Open a project — fetches the event log, hydrates stores, paints. */
    openProject(projectId: string): Promise<void>;
    /** Close current project — flushes pending writes, resets stores. */
    closeProject(): Promise<void>;
  };
  readonly sync: {
    readonly client:    SyncClient;                   // WebSocket peer broadcast
    readonly presence:  PresenceController;           // multiplayer cursors
  };

  // ── AI (replace src/ai/*) ────────────────────────────────────────────────
  readonly ai: AiHostClient;                          // streamCompletion, structured-call, etc.

  // ── Bake worker pipeline (new — invisible to UI but wired) ───────────────
  readonly bake: BakeCoordinator;                     // listens to dirty diffs, queues bake jobs

  // ── Plugin host (Phase F — third-party + IFC/Rhino/PDF/BCF native plugins) ─
  readonly plugins: {
    /** Enumerate contributions for a host kind (e.g. 'toolbar', 'sidebar'). */
    contributions<K extends ContributionKind>(kind: K): readonly Contribution<K>[];
    /** Dynamically register a contribution at runtime (marketplace install). */
    register(c: Contribution<ContributionKind>): Disposable;
  };

  // ── Native plugin singletons exposed for the existing UI hooks ───────────
  readonly ifc:        { readonly import: IfcImporter; readonly export: IfcExporter; readonly inspector: IfcInspector };
  readonly rhino:      { readonly import: RhinoImporter };
  readonly pdf:        { readonly toBim: PdfToBimService };
  readonly bcf:        { readonly viewpoints: BcfViewpointsService };
  readonly comparison: ComparisonEngine;
  readonly dataWorkbench: DataWorkbench;              // composes formula-library + expr-eval + hierarchy

  // ── Cross-cutting (replace ad-hoc DOM events) ────────────────────────────
  readonly events: TypedEventEmitter<RuntimeEvents>;  // typed; replaces `bim-store-mutated` etc.

  /** Idempotent. Disposes every owned subsystem in reverse order. */
  tearDown(): void;
}
```

This handle is **the contract**. The lint rule (Phase H) says: any code under `src/ui/` that imports from any package other than `@pryzm/runtime-composer/types` is a build error. The runtime is reached only through this handle, the handle is reached only through constructor injection, and `(window as any)` is banned outright.

### §3.3 The contribution model — how plugins wire into the white UI

PRYZM 1 panels (toolbar, sidebar, right inspector, bottom panel) currently expose ad-hoc registration via `(window as any)`. The new model: each PRYZM 1 *panel host* exposes a typed mount point, and `runtime.plugins.contributions(kind)` returns the contributions for that host. Hosts:

| Host kind | Owner | Examples |
|---|---|---|
| `'toolbar'` | `src/ui/bottom-menu/Toolbar.ts` | Wall tool button, Slab tool, Door tool, Plugin-X tool |
| `'sidebar.left'` | `src/ui/LeftNavRail.ts` | Project tree, level switcher, view list |
| `'sidebar.right'` | `src/ui/property-inspector/PropertyInspector.ts` | Per-element property forms (registered by each plugin via PanelContributions) |
| `'overlay.canvas'` | `src/ui/overlays/` | Snap indicators, dimension previews, AI suggestions |
| `'panel.bottom'` | `src/ui/dataworkbench/` | Schedules, formula console, AI chat |
| `'menu.command'` | `src/ui/RadialMenu.ts` | Command palette entries |
| `'modal.creation'` | `src/ui/ElementCreationModal.ts` | Per-family create dialogs |

Each contribution is a typed object: `{ id, hostKind, hostPlacement, render(host: HTMLElement, ctx: RuntimeContext): Disposable }`. The white panel hosts iterate `runtime.plugins.contributions('toolbar')` and call `.render(slotEl, ctx)` for each — no global registry, no `(window as any)`, no DOM-event glue.

**The 12 element-family plugins under `plugins/<family>/` already export their committers** (per the `bootstrap.render.everything.ts` wiring); Phase F adds `plugins/<family>/contributions.ts` that exports the toolbar button + creation modal + property-inspector panel for that family. The legacy panels under `src/ui/property-inspector/family-panels/`, `src/ui/<family>ModePicker.ts`, etc., are **deleted** — replaced by the per-plugin contribution which renders into the existing white slots.

### §3.4 The threading: `runtime` reaches every PRYZM 1 panel via constructor injection

`PlatformRouter.start(runtime)`:

```ts
class PlatformRouter {
  private constructor(private readonly runtime: PryzmRuntime) {}

  static start(runtime: PryzmRuntime): PlatformRouter {
    const router = new PlatformRouter(runtime);
    router.shell = new PlatformShell(runtime);                         // not a (window as any) read
    router.shell.show('landing');
    return router;
  }

  showHub(): void {
    this.hub = new ProjectHub(this.runtime);                           // runtime threaded
    this.hub.mount(this.root);
  }

  async launchWorkspace(projectId: string, projectName: string): Promise<void> {
    await this.runtime.persistence.openProject(projectId);             // no location.assign
    this.shell.show('workspace');                                       // PRYZM 1 toolbar + sidebars
    this.shell.workspace = new Workspace(this.runtime, { projectId, projectName });
  }
}
```

Each PRYZM 1 panel (~78 modules) gets the same treatment: the constructor takes `runtime` (or a narrowed slice) and reads from it instead of from `(window as any)`. **Mechanical, but real.** No bridge intercepts the read.

### §3.5 The renderer mounts into `#container` (the existing PRYZM 1 viewport host)

Today `apps/editor/src/main.ts` `mountEditor()` calls `document.body.appendChild(canvas)` and styles it `position:fixed;inset:0;background:#1a1f2e`. Phase A changes the signature so `composeRuntime()` passes `containerEl` (the existing PRYZM 1 `#container`) and the canvas inherits its parent's size + theme — no fixed positioning, no dark background, no DOM teardown. The white toolbar / sidebars / inspector retain their existing layout above and beside the canvas.

### §3.6 Persistence and sync are first-class members of the bus

Every command on `runtime.bus` produces patches via `PatchEmitter`. Two subscribers consume them by default:

1. **`runtime.stores.<key>`** — applies the patch to the in-memory store. Already wired by `attachStores` in `apps/editor/src/bootstrap.ts`.
2. **`runtime.persistence.eventLog`** — appends the event to the local-first NDJSON log. New wiring in `composeRuntime()`.

The `SyncClient` reads from the event log and broadcasts to peers; ack'd events are marked `synced` in the log. This **replaces** `SaveOrchestrator` (no debounce — patches are events, not snapshots) and **replaces** `ServerSyncQueue` (no separate queue — the event log IS the queue).

Bake jobs are queued by `BakeCoordinator` watching the same dirty diffs the committer host watches: a wall edit → bake-coordinator queues a `RebakeChunkJob`, the bake worker produces a chunk, the chunk is content-addressed and shipped via the same sync channel. **Invisible to UI.**

### §3.7 The frame loop — one rAF, one source of dirty

`src/engine/EngineBootstrap.ts` registers ~6 separate `requestAnimationFrame` callbacks (PostproductionRenderer, RenderPipelineManager, ViewportPathTracer, SSGI accumulator, …). Per `08-VISION.md` §6 the new architecture runs **one** rAF — `FrameScheduler` ticks listeners in priority order, paints on dirty only, idle at 0 fps. Phase E deletes every legacy rAF subscriber; everything that needs to draw subscribes to the scheduler with a typed priority. **This is what makes "best browser BIM app" plausible** — without it, no perf budget can be hit.

### §3.8 No `localStorage` writes outside `EventLog`

PRYZM 1 currently writes to `bim-projects-index`, `bim-project-{id}-versions`, `pryzm-sync-queue`, `bim-platform-token`, `pryzm-prefs-*`, etc. After Phase D, the only writers are:

- `EventLog` (project state, opaque to the rest).
- `AuthClient` (`bim-platform-token` — stays; auth is orthogonal to the wireup).
- `UserPreferences` (`pryzm-prefs-*` — stays; small typed key/value, owned by `@pryzm/user-preferences`, new in Phase D).

`ProjectRepository`, `SaveOrchestrator`, `ServerSyncQueue`'s localStorage keys are migrated once (Phase D one-shot migrator) and the keys are deleted from the user's browser on first boot under the new architecture.

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

## §5 What gets deleted (the precise list)

| Path | LOC est. | Replacement |
|---|---|---|
| `src/engine/EngineBootstrap.ts` + `src/engine/subsystems/init*.ts` (8 files) | ~12,000 | `composeRuntime()` + `bootstrap.render.everything.ts` + `runtime.scene` |
| `src/engine/inspect/`, `src/engine/elementSelection/` | ~1,500 | `runtime.visibility` + `runtime.selection` |
| `src/elements/` (12 family directories) | ~140 files | `plugins/<family>/` (already shipping) |
| `src/commands/` (per-family + project commands) | ~265 files | `plugins/<family>/handlers` + `plugins/view/handlers` |
| `src/ai/` | ~37 files | `runtime.ai` (`packages/ai-host` + `apps/ai-worker`) |
| `src/core/persistence/`, `src/core/rendering/`, `src/core/views/`, `src/core/navigation/`, `src/core/schedules/`, most of `src/core/` | ~76,000 LOC | `packages/<peer>/` |
| `src/services/` (legacy services) | ~50 files | per-package equivalents on the runtime |
| `src/ui/platform/ProjectRepository.ts` + `SaveOrchestrator.ts` + `ServerSyncQueue.ts` | ~1,900 | `runtime.persistence.*` + `runtime.sync.*` |
| `src/ui/property-inspector/family-panels/` (per-family forms) | ~24 files | `plugins/<family>/contributions.ts` (Phase F) |
| `src/ui/<family>ModePicker.ts` + `<family>DrawingHUD.ts` | ~24 files | per-plugin contributions |
| `apps/editor/src/projects/` (dark hub, dark modal, dark card) | ~610 | n/a — the white hub is the only hub |
| `apps/editor/src/main.ts` minimum-chrome toolbar inside `mountEditor` | ~150 | n/a — the white toolbar is the only toolbar |
| `apps/editor/src/sunset/Pryzm1SunsetBanner.ts` | ~120 | n/a — no second engine to sunset |
| `apps/editor/src/router.ts` (parseRoute used only by the dark hub) | ~80 | n/a — single-route app |
| `packages/engine-router/` | ~150 | n/a — single engine path |
| `src/main.ts:55–386` (kill-switch) | ~330 | gone in Phase A |
| `src/main.ts:27–35` (sunset banner opt-in) | ~10 | gone in Phase A |
| `server.js` legacy `POST /api/projects/:id/versions` | ~80 | event-log POST under `/api/v1/projects/:id/events` |

**Total deletion at end of Phase G:** ~150,000 LOC of legacy + ~1,300 LOC of dark UI + ~700 LOC of kill-switch infrastructure. **Total addition under `packages/runtime-composer/`:** ~3,000 LOC. **Net SLOC delta on the user-visible surface:** ≤ 0.

---

## §6 What stays unchanged (the white UI)

`src/ui/` (78 panel modules, ~30K LOC) and `src/styles/` (~30,977 LOC of CSS) are **pixel-frozen for GA**. The only edits per file are:

1. Constructor signature widened to accept `runtime: PryzmRuntime`.
2. Read sites rewritten from `(window as any).<key>` → `runtime.<typed.path>`.
3. Write sites rewritten from `commandManager.execute(new XCommand(...))` → `runtime.bus.executeCommand('x.create', payload)`.
4. Subscription sites rewritten from `addEventListener('bim-store-mutated', …)` → `runtime.events.on('store.<key>.changed', …)` or `runtime.stores.<key>.subscribe(...)`.

**Visual diff = 0 pixels.** **Behaviour diff = 0 user-observable.** That is the binding contract.

---

## §7 Risk register (revised)

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R1** | Phase B cast-codemod misses a non-cast read (e.g. `(globalThis as any).wallStore`, `eval('wallStore')`). | Medium | High | Phase B D1 lands a stricter scanner: `rg "(window\|globalThis\|self\|top|parent)" --pcre2 src/ui/` reviewed manually + an AST-based scanner in `scripts/scan-engine-globals.mjs`. |
| **R2** | A `src/ui/` panel reads engine state synchronously at a moment the new runtime hasn't constructed it (init-order skew). | Medium | High | `composeRuntime()` constructs every singleton synchronously; only `Renderer.init()` is async. Panels that need the renderer subscribe via `runtime.events.on('scene.ready')` instead of reading on construct. |
| **R3** | Phase E (delete `src/elements/`) breaks a test workflow whose fixture references a legacy type (`WallData`, `SlabBaseline`). | High | Medium | Phase E D1 — type-only re-exports under `packages/legacy-shim` for tests, with a 1-sprint deletion clock. Tests rewritten in their own PRs. |
| **R4** | The 769 cast sites contain hidden behaviour (e.g. `(window as any).wallStore?.getById(id) ?? legacyFallback()` — silent fallbacks that mask bugs). | High | Medium | Phase B's lint rule starts as **warn** for one sprint to surface every site; promoted to **error** at S74 D-final. Each silent fallback is rewritten as an explicit error-throw so loud-fail-soft applies (`08` §11). |
| **R5** | Visual-diff baseline (Phase H) drifts during Phase A–G because the WebGL2 backend in Renderer renders walls slightly differently from the legacy postproduction pipeline. | High | Critical | Phase A D1 captures the baseline from a frozen **pre-S72** build. Every Phase A–G PR diffs against that baseline. Renderer parity work (if needed) is a hard prerequisite for Phase D — done in `packages/renderer/` with its own bench. |
| **R6** | Performance regresses during the wireup (more event subscribers, more allocations per frame). | Medium | Critical | `apps/bench/perf/` runs on every PR with informational alerts pre-GA, hard fail at GA. The per-frame allocation cap (`08` §6.4 NFT) is checked with the V8 sampler. |
| **R7** | Localstorage migrator (Phase C) fails for a user with corrupted `bim-projects-index` (truncated JSON, schema drift). | Medium | High (data loss for that user) | Migrator runs in two passes: (1) read-only scan that surfaces every parse error to the white toast and writes a backup blob to `pryzm-migration-backup-<ts>` localStorage key; (2) only when the user clicks "OK, migrate" does the actual write/delete happen. The legacy keys are NOT deleted until the server confirms 2xx on every event-log POST. |
| **R8** | The Phase D renderer mount into `#container` breaks pre-existing CSS layout assumptions (overflow, z-index of toolbar floating over canvas, retina DPR). | Medium | Medium | Phase D D1 builds a pure-CSS test harness in `apps/bench/visual-diff/layout/` that mounts the renderer inside the same flexbox / grid that PRYZM 1 uses. Visual-diff catches drift before merge. |
| **R9** | Cross-package import hygiene breaks: a `src/ui/` panel needs a runtime-only type (e.g. `WallDto`) and the lint rule blocks the import. | High | Low | `@pryzm/runtime-composer/types` re-exports every DTO type from every plugin (`WallDto`, `SlabDto`, …), so the lint rule's single allowed import covers all type needs. Type-only imports preferred (`import type`). |
| **R10** | Multi-tab sync introduces a CRDT-style conflict the legacy single-tab UI never expected (e.g. user A renames a wall while user B deletes it). | Medium | High | The conflict policy is specified in `08-VISION.md` §3.4 (last-write-wins on simple props; merge-by-fragment on geometry). Phase F lands a conflict UI in `runtime.events.on('sync.conflict', …)` that the white UI surfaces via toast + opt-in resolve modal. |
| **R11** | Phase G's mass deletion breaks the development workflow (tests fail to find legacy fixtures, autoreload crashes, stale dist files). | High | Low | Phase G is split into 4 PRs by zone (engine, elements/commands, ai, core). Each PR runs the full test workflows (the 9 vitest workflows + visual-diff + perf bench) and must be green before the next. |
| **R12** | A native plugin (BCF, IFC) calls into `(window as any).OBC` — the @thatopen/components namespace global — which has no replacement in the new architecture. | Medium | Medium | Phase F D1 inventories every OBC dependency. Most are replaceable with `three`-direct calls (the new renderer doesn't use OBC). The BCF viewpoint serialiser is the one tricky case — already partially ported in `plugins/bcf`. Remaining OBC usage is encapsulated in `plugins/<family>/legacy-obc.ts` with a 90-day removal clock. |
| **R13** | The runtime composer becomes a god object — 30+ subsystems on one handle, hard to test, hard to reason about. | Low | Medium | Each subsystem is a separate package with its own tests; the composer is < 500 LOC of pure wiring. Sub-handles (`runtime.persistence`, `runtime.scene`, `runtime.plugins`) are typed namespaces. Tests construct partial runtimes via `composeRuntime({ subset: ['persistence'] })`. |
| **R14** | A perf gate fails at GA after a green dogfood week (bug surfaced only in the 100-tab telemetry stream). | Low | Critical | Pre-GA: 2-week soak test on a staging deployment with synthetic load (50 simulated users, 5 K elements per project). Telemetry collected via the OTel root span `pryzm.boot` + per-frame `pryzm.frame.*` spans (already wired in `bootstrap.everything.ts`). |
| **R15** | The whole plan slips because two engineers in parallel produces merge-conflict storms. | Medium | High | Per-sprint PR cadence is 2 small per engineer per day, not 1 monster per week. Phase B's panel-cluster split keeps engineers in disjoint files. Phases that touch the same files (D + E composition root) are serialised. |

---

## §8 Issues register (open as of S72 D0 — revised)

| ID | Issue | Source | Action in this plan |
|---|---|---|---|
| **I1** | "I cannot see logs when project creation fails" | operator, 2026-04-29 | Phase C — the white hub uses `AppToast` + `AuthModal` for every persistence error. The dark error overlay is gone with the dark hub in Phase G. |
| **I2** | "I see a dark PRYZM 2 landing / hub I never asked for" | operator, 2026-04-29 | Phase A removes `?pryzm2=1` and the kill-switch entirely. Phase G deletes `apps/editor/src/projects/`. |
| **I3** | "Even the project page becomes dark when I click Open Project" | operator, 2026-04-29 | Phase A removes the `location.assign` redirect; Phase D mounts the renderer into `#container` so the white toolbar overlays the same canvas in-place. |
| **I4** | "No patches" | operator, 2026-04-29 | The `@pryzm/legacy-bridge` package from v1 is retracted. The runtime composer is the only new wiring. Every legacy zone is deleted, not adapted. |
| **I5** | `ProjectListClient` 401 on every call | S71 W3 | Adopted unchanged; hard prerequisite for Phase C. |
| **I6** | `ANTHROPIC_MODEL_ID` 404 | S71 W5-a | Adopted unchanged; required for Phase F (AI). |
| **I7** | `SUPABASE_SERVICE_ROLE_KEY` not set | S71 W5-b | Adopted unchanged; required for Phase C production rollout. |
| **I8** | `pryzm-vi-parity`, `pryzm-persistence`, `audit-log-middleware` workflows red | S71 W5-c | Adopted unchanged; must close before GA gate at end of Phase H. |
| **I9** | `apps/editor/migrations/sunset-pryzm1.md` lists `src/styles/` for S65 deletion | document conflict | Amended in Phase G to mark `src/styles/` and `src/ui/` as KEEP. |
| **I10** | `ADR-026 §4.3` mandates `src/styles/` migration into `packages/ui/` | ADR conflict | Phase H lands ADR-026-A "UI preservation override". |
| **I11** | `src/engine/EngineBootstrap.ts` and `src/engine/subsystems/` still wire ~250 `(window as any)` writes | architecture audit | Deleted in Phase D. |
| **I12** | The bundle currently ships ~150K LOC of legacy `src/elements/`, `src/commands/`, `src/core/` | architecture audit | Deleted in Phases E + G. |
| **I13** | `src/ui/platform/ProjectRepository.ts` writes to localStorage in parallel with the new event log → divergence | architecture audit | Deleted in Phase C; one-shot migrator imports any local-only state. |
| **I14** | Multiple `requestAnimationFrame` callsites compete for the main thread | `08` §6.3 violation | Phase D enforces single-rAF via `runtime.scene.scheduler` + lint rule. |

---

## §9 Decision log

| # | Decision | Rationale |
|---|---|---|
| **D-S72-1** | UI is not on the migration boundary. | Operator intent; consistent with `08` §7 NG7. |
| **D-S72-2** | The kill-switch is retired in Phase A, not generalised. | No second UI to opt into. |
| **D-S72-3** | No bridge package. The white UI imports `@pryzm/runtime-composer/types` directly and reads from `runtime.<path>`. | A bridge is a permanent translation layer. The runtime composer is a one-shot wire-up. |
| **D-S72-4** | Constructor injection of `runtime`, never `(window as any)`. | Typed contract; lint-enforceable; no runtime surprises. |
| **D-S72-5** | All legacy zones (`src/engine/`, `src/elements/`, `src/commands/`, `src/ai/`, most of `src/core/`) are deleted, not dual-tracked. | Two engines forever is the patch we're avoiding. |
| **D-S72-6** | The renderer mounts into the existing `#container`, not a new fullscreen canvas. | Same pixels as PRYZM 1; same DOM contract. |
| **D-S72-7** | Persistence is event-log-first; localStorage migrator runs once. | One source of truth for project state. |
| **D-S72-8** | Single rAF, owned by `frame-scheduler`. | Required by `08` §6.3 (idle 0 fps, scrub 120 fps). |
| **D-S72-9** | Plugin contributions render into typed mount points exposed by the white panel hosts. | No global registries, no DOM-event glue. |
| **D-S72-10** | Visual-diff CI is a hard gate from Phase B onward. | Operator intent is enforceable only via gate. |
| **D-S72-11** | Perf gates from `08` §6 are hard at GA, informational pre-GA. | "Best browser BIM app" needs the floor. |

---

## §10 What "done" looks like (operator-visible + architecturally honest)

After Phase H D-last:

1. **Visually identical to PRYZM 1.** Open `/`. White landing. Click Log in. White hub. Click + New project. White modal. Project created via `ProjectListClient` → server → event log. Click Open. White toolbar + sidebars + inspector paint over a canvas owned by the new `Renderer` mounted into `#container`. The user does not notice that the engine was replaced.

2. **One source of truth for everything.** One bus, one undo stack, one set of stores, one event log, one sync client, one renderer, one frame scheduler, one plugin host, one AI client, one bake coordinator. `rg "window as any" src/` returns 0. `rg "import.*from.*src/(engine|elements|commands|ai)" src/` returns 0.

3. **All 12 element families behave identically to PRYZM 1.** Wall create, slab edit, door place, window resize, roof draw, curtain-wall pattern, grid offset, column copy, beam connect, stair flight, handrail trace, ceiling void — every operation visually + behaviourally identical, dispatched through `runtime.bus`.

4. **Plugins, AI, IFC, Rhino, BCF, PDF all functional through the white UI.** Marketplace install lands a contribution; the white toolbar shows the new tool. AI sidebar streams tokens. IFC import uploads + parses + materialises. BCF viewpoints round-trip. Rhino .3dm imports. PDF-to-BIM extracts.

5. **Multi-tab + multi-user works.** Open the same project in a second tab; presence cursors paint; edits sync sub-second; conflicts surface a typed toast in the white UI.

6. **The perf budget is met.** First-frame ≤ 800 ms. Idle 0 fps. Scrub 120 fps. 50K-element project opens in ≤ 2 s P95. Memory ≤ 1.5 GB on L-large. The OTel `pryzm.boot.first_frame_ms` span confirms it on every session.

7. **The code base is half the size it was before.** ~150K LOC of legacy gone. ~3K LOC of `runtime-composer` added. Net contraction. Every package ships only what the runtime consumes.

8. **The contract is enforced by a robot, not by tradition.** Lint rules block `window as any`, `requestAnimationFrame` outside the scheduler, `localStorage.setItem` outside the event log, `document.createElement('canvas')` outside the renderer, imports from `apps/editor/src/projects/`, and the literal `#1a1f2e` in the wrong package. CI fails the build the moment any contract regresses.

That is the best browser BIM app — same UI the customer trained on, every L0–L7.5 capability live behind it, no patches, no forks, no second source of truth. The 36-month rebuild was about making this picture true. This plan is the wireup.

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

### §12.5 Category E — Right property inspector (30 files; Phase B + F)

`src/ui/PropertyInspector.ts` (orchestrator, the right-rail host), `src/ui/property-inspector/*` (4 files), `src/ui/property-panel/*` (26 files: `PropertyPanel.ts`, `PropertyRenderer.ts`, `PropertyPanelAdapter.ts`, `PropertyPanelTheme.ts`, `PropertyDescriptorGenerator.ts`, `RelationshipViewer.ts`, `PlacementEditor.ts`, `ViewPropertiesSection.ts`, `types.ts`, plus per-family widgets: `WallTypeSelectorWidget`, `WallLayersEditor`, `SlabTypeSelectorWidget`, `SlabDimensionsEditor`, `SlabLayersEditor`, `DoorTypeSelectorWidget`, `WindowTypeSelectorWidget`, `RoofPropertySheet`, `CeilingTypeSelectorWidget`, `FloorTypeSelectorWidget`, `ColumnTypeSelectorWidget`, `BeamTypeSelectorWidget`, `StairTypeSelectorWidget`, `PlumbingTypeSelectorWidget`, `CurtainGridEditor`, `CurtainPanelEditor`, `CurtainSubElementPanel`).

| Element | User gesture | Today | After | Phase | Bench |
|---|---|---|---|---|---|
| PropertyInspector orchestrator | mounted on app start; subscribes to selection; chooses which form to render | `(window as any).propertyPanelInspector.update(selectionId)`; reads stores via `(window as any).<family>Store.getById(id)` | constructor takes `runtime`; subscribes to `runtime.selection`; reads `runtime.stores.<family>.get(id)`; mounts the per-family contribution from `runtime.plugins.contributions('inspector.element').filter(c => c.appliesTo === selection.element)` | B + F | `bench/ui/inspector-mount.bench.ts` (selection → form rendered < 50 ms p95) |
| PropertyPanel + PropertyRenderer + PropertyDescriptorGenerator | renders the form descriptor | reads legacy schemas | reads `@pryzm/schemas` Zod schema for the selected DTO; auto-generates form from `Wall.shape` / `Slab.shape` etc. (descriptor generator stays — works on Zod) | B + F | `bench/ui/inspector-render-large.bench.ts` (50-field form < 100 ms) |
| 12 per-family TypeSelectorWidget | dropdown to swap system type | reads `(window as any).<family>SystemTypeStore.list()`; dispatches `commandManager.execute(new SetXSystemTypeCommand(...))` | reads `runtime.systemTypes.<family>.list()`; dispatches `runtime.bus.executeCommand('<family>.setSystemType', ...)` | B + F | `bench/ui/system-type-swap.bench.ts` (dropdown change → store updated → bake queued < 50 ms) |
| WallLayersEditor + SlabLayersEditor | edit composite layer stack | reads system type's `layers[]`; mutates via legacy commands | dispatches `runtime.bus.executeCommand('wall.setLayers', ...)`; reflects via `runtime.stores.wall.get(id).layers` | F | `bench/ui/layers-editor-edit.bench.ts` |
| SlabDimensionsEditor + RoofPropertySheet | numeric edits with live preview | mutates store, fires events | optimistic local update + `runtime.bus.executeCommand` debounced 100 ms; preview committer paints next frame | F | `bench/ui/dimension-edit-live.bench.ts` |
| RelationshipViewer | shows host/hosted relationships | reads `(window as any).<family>Store.getRelations(id)` | reads `runtime.stores.<family>.relations(id)` | F | `bench/ui/relationship-paint.bench.ts` |
| PlacementEditor + ViewPropertiesSection | pose / level / view-specific overrides | mixed legacy reads | `runtime.stores.placement` + `runtime.viewRegistry.overrides(viewId, elementId)` | F | `bench/ui/placement-edit.bench.ts` |

Per-inspector perf gate: selection-changed event → form repainted **< 50 ms p95**, **< 100 ms p99**. Field-change → command dispatched + store updated + committer dirty **< 16 ms** (one frame).

### §12.6 Category F — Bottom strip (18 files; Phase B + E + F)

`src/ui/bottom-menu/BottomActionMenu.ts` (705 LOC; the bottom action bar with quick-tool buttons), `src/ui/furniture-carousel/*` (7), `src/ui/SchedulePanel/*` (1), `src/ui/wardrobe/*` (4), `src/ui/kitchen/*` (4), `src/ui/rooms/*` (2 — bottom rooms panel when in rooms mode), `src/ui/SheetEditor/*` (2 — bottom sheet editor when in sheet mode).

| Surface | User gesture | Today | After | Phase | Bench |
|---|---|---|---|---|---|
| BottomActionMenu | hotkey shortcut buttons (WA → wall, DR → door, …); quick mode toggles; level switcher; coordinate readout; selection count | reads `(window as any).{wallTool, curtainWallTool, doorTool, ...}`; calls `service.activateXTool(...)` | reads `runtime.tools` registry; dispatches `runtime.tools.activate(...)` | B + E | `bench/ui/bottom-shortcut.bench.ts` (key-press → tool active < 16 ms) |
| FurnitureCarousel + FloatingObjectCarousel | scroll catalog, drag-and-drop into scene | reads `(window as any).furnitureStore`; uses legacy drag handler | reads `runtime.plugins.get('furniture').catalog`; drag fires `runtime.bus.executeCommand('furniture.place', {dto, point})` | F | `bench/ui/carousel-scroll.bench.ts` (60 fps scroll), `bench/ui/carousel-drag.bench.ts` (drop → first paint < 100 ms) |
| SchedulePanel | view schedule rows; cell edit | reads `scheduleStore` (legacy core); cell edit dispatches legacy commands | reads `runtime.stores.schedule.get(scheduleId)`; cell edit dispatches `runtime.bus.executeCommand('schedule.setCell', ...)` | F | `bench/ui/schedule-mount.bench.ts` (5K-row schedule < 1 s); `bench/ui/schedule-edit.bench.ts` (cell change → store update < 16 ms); `bench/ui/schedule-scroll.bench.ts` (60 fps virtual scroll) |
| Wardrobe + Kitchen panels | configure prefab assemblies | calls `(window as any).kitchenRunInspector.update()` etc. | reads `runtime.plugins.get('kitchen')` / `.get('wardrobe')` (each is its own plugin) | F | `bench/ui/wardrobe-edit.bench.ts`, `bench/ui/kitchen-edit.bench.ts` |
| Rooms panel | rooms mode bottom panel | reads room store | reads `runtime.stores.room` (or `runtime.plugins.get('rooms')`) | F | `bench/ui/rooms-paint.bench.ts` |
| SheetEditor | bottom sheet editor (when sheet view active) | legacy `SheetEditorPanel` (2,919 LOC; flagged as #2 worst file in 09-AS-IS-VS-TO-BE §3) | mounts `plugins/sheets/SheetEditorHost` (already in vision §3 row 2 — a Phase F deliverable) | F | `bench/ui/sheet-editor-mount.bench.ts`, `bench/ui/sheet-edit.bench.ts` |

### §12.7 Category G — Canvas overlays (8 files; Phase B + D)

`src/ui/SelectionOverlay.ts`, `src/ui/ViewCube.ts` (already in B), `src/ui/canvas/*` (4), `src/ui/overlays/*` (2). These render directly on the viewport.

| Overlay | Today | After | Phase | Bench |
|---|---|---|---|---|
| SelectionOverlay | bbox computed from `(window as any).bimManager`; redrawn on `bim-selection-changed` | reads `runtime.selection` + `runtime.stores.<family>.bbox(id)`; redrawn on `runtime.events.on('selection.changed')` | B | `bench/ui/selection-overlay.bench.ts` (1K-element multi-select < 100 ms) |
| Snap indicator overlay (canvas/) | reads tool-state from `(window as any).wallTool.snap` | reads `runtime.tools.activeSnapState()` | B + E | `bench/ui/snap-indicator.bench.ts` (mousemove → indicator paint < 16 ms) |
| Hover highlight overlay | reads `(window as any).hoverService` | reads `runtime.hover` | B | covered by snap-indicator bench |
| Presence cursors (overlays/) | not implemented today | renders `runtime.sync.presence.peers()`; peer pose updates broadcast at 30 Hz | C | `bench/ui/presence-cursor.bench.ts` (5 peers, 30 Hz update, < 1 ms per frame overhead) |
| Dimension preview overlay | per-tool overlay during drawing | wired via `runtime.tools.activeOverlay()` | E + F | `bench/ui/dimension-preview.bench.ts` |
| AI suggestion overlay | reads `(window as any).aiClient.activeSuggestion` | reads `runtime.ai.activeSuggestion()` | F | `bench/ui/ai-overlay.bench.ts` |

### §12.8 Category H — Drawing HUDs + mode pickers (24 files; Phase B + E + F)

12 mode pickers (per family): `WallModePicker.ts`, `CurtainWallModePicker.ts`, `DoorModePicker.ts`, `WindowModePicker.ts`, `SlabModePicker.ts`, `FloorModePicker.ts`, `CeilingModePicker.ts`, `BeamModePicker.ts`, `ColumnModePicker.ts`, `GridModePicker.ts`, `HandrailModePicker.ts`, `OpeningModePicker.ts`.

12 drawing HUDs (some families share): `WallDrawingHUD.ts`, `CurtainWallDrawingHUD.ts`, `CeilingDrawingHUD.ts`, `FloorDrawingHUD.ts`, `GridDrawingHUD.ts`, plus stair-specific (`StairLevelRequiredPanel.ts`, `StairSetupPanel.ts`), plus `UnderlayScaleHUD.ts`, `AnnotationInputPanel.ts` (annotation drawing input), `OverridePanel.ts`, `VisibilityIntentPanel.ts`, `ColourPalette.ts`, `ContextualEditBar.ts` (already in B).

**All HUDs/pickers get the same treatment in Phase B + E + F**: constructor widened to accept `runtime`; legacy `service.activateXTool()` calls become `runtime.tools.activate(family, mode)`; reads of `(window as any).<family>Store` become `runtime.stores.<family>` reads.

| Family | HUD perf gate (per-family bench) |
|---|---|
| Wall | `bench/ui/wall-mode-switch.bench.ts` (mode change L↔O↔C↔S < 16 ms); `bench/ui/wall-draw-frame.bench.ts` (mousemove during draw < 16 ms incl snap + preview) |
| Curtain Wall | `bench/ui/cw-draw.bench.ts` |
| Door / Window / Slab / Floor / Ceiling / Beam / Column / Grid / Handrail / Opening / Stair | one bench each (`bench/ui/<family>-draw.bench.ts`) — same 16 ms p95 budget |
| UnderlayScaleHUD | `bench/ui/underlay-scale.bench.ts` (drag scale → preview update < 16 ms) |
| AnnotationInputPanel | `bench/ui/annotation-input.bench.ts` (text-input → preview < 16 ms) |
| OverridePanel + VisibilityIntentPanel | `bench/ui/vi-toggle.bench.ts` (toggle → store update + repaint < 50 ms) |

### §12.9 Category I — AI surfaces (6 files; Phase F)

`src/ui/ai/*`: `AICreatePanel.ts`, `AIPanel.ts`, `FloorPlanDebugOverlay.ts`, `FloorPlanFullPlanViewer.ts`, `FloorPlanImportPanel.ts`, `ValidatePanel.ts`. Plus `src/ui/intent/*` (6: `DivergedBanner`, `HeaderIntentPicker`, `IntentSourcePill`, `ResetToIntentButton`, `SourceChainTooltip`, `SpineOverrideList`) and `src/ui/generative/*` (2).

| Surface | User gesture | Today | After | Phase | Bench |
|---|---|---|---|---|---|
| AIPanel | open AI sidebar; type prompt; receive streamed reply | `(window as any).aiClient.streamCompletion(...)` | `runtime.ai.streamCompletion({prompt, ctx: {projectId, selection: runtime.selection.snapshot()}})` | F | `bench/ui/ai-first-token.bench.ts` (prompt submit → first token < 800 ms p50) |
| AICreatePanel | generate elements from text/image | legacy generative client | `runtime.ai.generative.create({prompt, context})` → returns `CommandBatch` → user reviews → `runtime.ai.approvalQueue.commit(batchId)` | F | `bench/ui/ai-generate.bench.ts` |
| FloorPlanImportPanel | upload PDF → AI extracts walls | legacy `(window as any).pdfToBim.start(file)` | `runtime.ai.floorPlan.import({file})` (driven by `apps/ai-worker` CV pipeline) | F | covered by `cv-pipeline.bench.ts` + new `bench/ui/floorplan-import-progress.bench.ts` |
| FloorPlanFullPlanViewer + DebugOverlay | preview extracted floor plan | reads job state | `runtime.ai.floorPlan.getJob(jobId)` | F | `bench/ui/floorplan-preview-paint.bench.ts` |
| ValidatePanel | rule-engine validation results | legacy rule engine | `runtime.ai.rules.validate(projectId)` | F | `bench/ui/ai-validate.bench.ts` |
| Intent UI (6 files) | shows current intent source, allows reset to intent | legacy intent-source store | `runtime.intent` (new on `PryzmRuntime` — Phase B exposes the existing `IntentSourceStore` typed) | B + F | `bench/ui/intent-pill.bench.ts` |

### §12.10 Category J — Data workbench (15 files; Phase B + F)

`src/ui/dataworkbench/*`: `DataWorkbench.ts` (orchestrator), `AnalyticsPanel.ts`, `CompliancePanel.ts`, `DataSheetPanel.ts`, `DataVisualizerService.ts`, `DesignHistoryPanel.ts`, `HierarchyTreePanel.ts`, `NLQueryPanel.ts`, `PhysicsPanel.ts`, `PortfolioQueryPanel.ts`, `ProgrammePanel.ts`, `RelationshipExplorerPanel.ts`, `SpatialQueryPanel.ts`, `SyncStateDetailDrawer.ts`, `TemplateEditorPanel.ts`.

`runtime.dataWorkbench` (Phase F) composes:
- `formula-library` (extended 12 → 24 expressions per S71 §4.6 W6)
- `expr-eval`
- `runtime.stores.hierarchy`
- `runtime.stores.template`
- `runtime.stores.programme`
- `runtime.stores.physics`
- `runtime.stores.compliance`

**All 15 panels** are constructor-widened in Phase B and rewired to `runtime.dataWorkbench.*` in Phase F.

| Panel | Bench |
|---|---|
| DataWorkbench orchestrator | `bench/ui/dw-mount.bench.ts` (panel switch < 100 ms) |
| HierarchyTreePanel | `bench/ui/dw-hierarchy.bench.ts` (5K-row tree < 500 ms paint, 60 fps scroll) |
| NLQueryPanel | `bench/ui/dw-nl-query.bench.ts` (typed query → results < 200 ms for cached corpus) |
| AnalyticsPanel + DataVisualizerService | `bench/ui/dw-chart-render.bench.ts` (chart with 1K data points < 200 ms) |
| RelationshipExplorerPanel | `bench/ui/dw-relationship.bench.ts` (graph with 100 nodes < 200 ms) |
| TemplateEditorPanel | `bench/ui/dw-template-edit.bench.ts` |
| Other 9 panels | shared `bench/ui/dw-panel-mount.bench.ts` (each < 100 ms) |

### §12.11 Category K — Rendering controls (10 files; Phase F)

`src/ui/rendering/*`: `ExportStudioPanel.ts`, `PanoramaPanel.ts`, `PerformanceModePanel.ts`, `RealSunControl.ts`, `RenderGallery.ts`, `RenderPanel.ts`, `RenderQueuePanel.ts`, `VideoExportPanel.ts`, `VisualizationEnginePanel.ts`, `WalkthroughPanel.ts`.

These all wrap `runtime.scene.renderer` controls (quality presets, sun angle, post-fx toggles, animation timeline). Rewire from `(window as any).renderPipelineManager.*` to `runtime.scene.renderer.*` in Phase F.

| Panel | Bench |
|---|---|
| RenderPanel + PerformanceModePanel | `bench/ui/render-quality-toggle.bench.ts` (quality preset change → first frame at new quality < 100 ms) |
| RealSunControl | `bench/ui/sun-drag.bench.ts` (sun-angle drag → 60 fps p95, shadow re-bake debounced) |
| PanoramaPanel + WalkthroughPanel + VideoExportPanel | `bench/ui/render-export-start.bench.ts` (start → first frame < 500 ms) |
| RenderGallery + RenderQueuePanel | `bench/ui/render-gallery-paint.bench.ts` (50-thumbnail grid < 200 ms) |

### §12.12 Category L — Modals + utilities (13 files; Phase B)

`src/ui/AppToast.ts`, `src/ui/ConfirmDialog.ts`, `src/ui/ElementCreationModal.ts`, `src/ui/RadialMenu.ts`, `src/ui/ShortcutCheatSheet.ts`, `src/ui/UiPreferences.ts`, `src/ui/PanelManager.ts` (in B), `src/ui/makeDraggable.ts`, `src/ui/primitives/*` (1), `src/ui/icons/*` (2: `PryzmIcons.ts` + index), `src/ui/fallbacks/*` (1), `src/ui/inspect/*` (1), `src/ui/import/*` (1), `src/ui/interop/*` (2), `src/ui/geospatial/*` (2), `src/ui/property-inspector/*` (4 — orchestrator-side files).

| Surface | User gesture | Today | After | Phase | Bench |
|---|---|---|---|---|---|
| AppToast | global toast notifications | static singleton | `runtime.toasts` (new on PryzmRuntime — typed wrapper around the existing AppToast singleton) | A | `bench/ui/toast-show.bench.ts` (< 16 ms) |
| ElementCreationModal | "Create Wall" modal with type selector + dimensions | `(window as any).<family>SystemTypeStore.list()` | mounts the per-family contribution: `runtime.plugins.contributions('modal.creation').filter(c => c.element === 'wall')` | F | `bench/ui/creation-modal-open.bench.ts` (< 100 ms) |
| RadialMenu | right-click radial command menu | reads tools from globals | reads `runtime.plugins.contributions('menu.radial')` | F | `bench/ui/radial-menu-open.bench.ts` (< 50 ms) |
| ConfirmDialog | confirmation modals | static | unchanged (no engine deps) | A | nil |
| ShortcutCheatSheet | `?` cheat sheet | hard-coded shortcut list | reads `runtime.hotkeys.list()` (Phase B exposes the existing Hotkeys typed) | B | nil |
| UiPreferences | UI prefs modal | localStorage prefs | `runtime.userPreferences` | C | nil |

### §12.13 Coverage proof

Sum of files: 25 (A) + 6 (B) + 16 (C) + 11 (D) + 30 (E) + 18 (F) + 8 (G) + 24 (H) + 14 (I, including intent + generative) + 15 (J) + 10 (K) + 23 (L) = **200 files**. The remaining 20 files are sub-modules of the above (e.g. `src/ui/property-panel/types.ts`, `src/ui/icons/PryzmIcons.ts`'s sibling, `src/ui/data/buckets/<bucket>.ts`, internal helpers under `src/ui/dataworkbench/<X>Service.ts`). Every file under `src/ui/` is accounted for. **Zero files left untreated**. The coverage map is the formal answer to *"every single detail"*.

---

## §13 UI-interaction perf bench suite — the gap in `apps/bench/`

`apps/bench/src/benches/` ships 50+ benches as of S72 D0, but **every one is headless** (cmd-execute-latency, save-edit, sync-roundtrip, produce-wall, orbit-fps, etc.). The cold-load benches measure data-half boot only. **There is no bench in the suite today that measures a click-to-paint latency, a panel mount time, a scroll fps, an inspector update, or a first-contentful-paint.** This was the gap §11.16 hand-waved with "perf gate" language without naming the bench.

This section names the bench. Phase H D1 lands the suite.

### §13.1 New folder: `apps/bench/src/benches/ui/`

A new sub-tree groups every UI-interaction bench. All benches use the **Playwright + Vitest browser-mode** pattern: spin a real Chromium (and Firefox + WebKit in CI), boot the white app, drive a typed gesture script, measure with `performance.now()` + `PerformanceObserver` for paint/LCP marks, assert against `apps/bench/baseline.json` budgets.

The harness (`apps/bench/src/ui/UiBenchHarness.ts`) provides:
```ts
class UiBenchHarness {
  page: Page;
  async boot(opts: { fixture?: 'empty' | 'small' | 'medium' | 'large' }): Promise<void>;
  async clickToPaint(selector: string): Promise<{firstFrameMs: number; firstPaintMs: number}>;
  async scrollFps(selector: string, deltaY: number, durationMs: number): Promise<{p50: number; p95: number}>;
  async dragFps(selector: string, path: Vec2[], durationMs: number): Promise<{p50: number; p95: number}>;
  async typeLatency(selector: string, text: string): Promise<{perKeyP95Ms: number}>;
  measure(): PerformanceMetrics;
}
```

### §13.2 The bench catalogue (60 UI benches, gating GA)

Numbers below are **GA budgets** (Vision §6 derived). Pre-GA all gates run informational (warn) — flipped to hard-fail at the start of Phase H D-final.

#### Category A — Platform pages (5 benches)

| Bench | Gesture | Budget |
|---|---|---|
| `bench/ui/landing-paint.bench.ts` | cold load → LCP | LCP < 600 ms (Vision §6 row "First contentful paint") |
| `bench/ui/auth-modal-open.bench.ts` | click "Log in" → modal interactive | < 50 ms |
| `bench/ui/hub-paint.bench.ts` | login → hub TTI with 100 projects | < 500 ms TTI; bundle delta from landing → hub < 200 KB gzip |
| `bench/ui/hub-create.bench.ts` | "+ New project" submit → editor first interactive frame | < 800 ms |
| `bench/ui/hub-search-filter.bench.ts` | type in search box → filtered list paint | < 16 ms per keypress (60 fps typing) |

#### Category B — Workspace boot + top bar (4 benches)

| Bench | Gesture | Budget |
|---|---|---|
| `bench/ui/workspace-mount.bench.ts` | open project (M-medium fixture) → first interactive frame | < 800 ms (Vision §6 "Cold load — small project < 800 ms"); also measures composeRuntime() < 50 ms |
| `bench/ui/view-tab-switch.bench.ts` | click view tab → new view first interactive frame | < 200 ms cached, < 500 ms cold |
| `bench/ui/contextual-edit-bar.bench.ts` | select element → edit bar visible | < 16 ms (one frame) |
| `bench/ui/save-undo-hud.bench.ts` | command dispatched → save pill state transition | < 50 ms (event log append local-first) |

#### Category C — Left rail (8 benches, one per spine icon + width drag)

| Bench | Gesture | Budget |
|---|---|---|
| `bench/ui/lnr-toggle.bench.ts` | click spine icon → content swap | < 100 ms p95 |
| `bench/ui/lnr-resize.bench.ts` | drag right-edge resize handle | 60 fps sustained |
| `bench/ui/spatial-tree-paint.bench.ts` | open MODEL panel with 10K-element project | < 500 ms; incremental insert < 16 ms |
| `bench/ui/spatial-tree-scroll.bench.ts` | scroll the tree | 60 fps p95 |
| `bench/ui/data-tree-paint.bench.ts` | open DATA panel with 10K rows | < 500 ms |
| `bench/ui/view-list-paint.bench.ts` | open VIEWS panel with 50 views/sheets | < 200 ms |
| `bench/ui/schedule-list-paint.bench.ts` | open SCHEDULES panel with 50 schedules | < 200 ms |
| `bench/ui/ai-panel-mount.bench.ts` | open AI panel | < 100 ms |

#### Category D — Right tools panel (3 benches)

| Bench | Gesture | Budget |
|---|---|---|
| `bench/ui/toolbar-discipline-switch.bench.ts` | click discipline button → tool grid swap | < 100 ms |
| `bench/ui/tool-activate.bench.ts` | click any tool button → tool active + cursor change + HUD mounted | < 16 ms tool-active state + < 50 ms HUD paint |
| `bench/ui/plugin-contribution-add.bench.ts` | install plugin via marketplace → toolbar repaint | < 200 ms after install completes (no reload) |

#### Category E — Inspector (5 benches)

| Bench | Gesture | Budget |
|---|---|---|
| `bench/ui/inspector-mount.bench.ts` | select element → form rendered | < 50 ms p95, < 100 ms p99 |
| `bench/ui/inspector-render-large.bench.ts` | select element with 50-field property panel | < 100 ms |
| `bench/ui/inspector-multi-select.bench.ts` | select 100 elements → common-fields form | < 200 ms |
| `bench/ui/system-type-swap.bench.ts` | dropdown change → store update + bake queued | < 50 ms |
| `bench/ui/dimension-edit-live.bench.ts` | numeric drag → live preview frames | 60 fps p95 |

#### Category F — Bottom strip (5 benches)

| Bench | Gesture | Budget |
|---|---|---|
| `bench/ui/bottom-shortcut.bench.ts` | hotkey "WA" → wall tool active | < 16 ms |
| `bench/ui/carousel-scroll.bench.ts` | scroll furniture carousel | 60 fps p95 |
| `bench/ui/carousel-drag.bench.ts` | drag furniture into scene → first paint | < 100 ms |
| `bench/ui/schedule-mount.bench.ts` | open 5K-row schedule | < 1 s |
| `bench/ui/schedule-edit.bench.ts` | edit cell → store update + UI reflect | < 16 ms |
| `bench/ui/sheet-editor-mount.bench.ts` | switch to sheet view | < 500 ms |

#### Category G — Canvas overlays (4 benches)

| Bench | Gesture | Budget |
|---|---|---|
| `bench/ui/selection-overlay.bench.ts` | multi-select 1K elements | < 100 ms paint |
| `bench/ui/snap-indicator.bench.ts` | mousemove during draw with snap | < 16 ms per frame including snap test |
| `bench/ui/presence-cursor.bench.ts` | 5 peers, 30 Hz update | < 1 ms per frame overhead |
| `bench/ui/dimension-preview.bench.ts` | live dimension preview during drag | < 16 ms |

#### Category H — Drawing HUDs + per-family draw (12 benches; one per family)

| Bench | Gesture | Budget |
|---|---|---|
| `bench/ui/<family>-draw.bench.ts` (×12) | family tool active, mousemove + click sequence (8 points) | per-frame < 16 ms; commit dispatch → first paint < 50 ms |

#### Category I — AI surfaces (3 benches)

| Bench | Gesture | Budget |
|---|---|---|
| `bench/ui/ai-first-token.bench.ts` | prompt submit → first streamed token | < 800 ms p50 |
| `bench/ui/ai-generate.bench.ts` | generate batch → approval queue populated | depends on AI worker; UI overhead < 200 ms |
| `bench/ui/ai-validate.bench.ts` | validate project → results paint | < 500 ms (UI portion) |

#### Category J — Data workbench (4 benches)

| Bench | Gesture | Budget |
|---|---|---|
| `bench/ui/dw-mount.bench.ts` | open DW → orchestrator mounted | < 100 ms |
| `bench/ui/dw-hierarchy.bench.ts` | 5K-row hierarchy paint + scroll | < 500 ms paint, 60 fps scroll |
| `bench/ui/dw-nl-query.bench.ts` | NL query → results | < 200 ms (cached corpus) |
| `bench/ui/dw-chart-render.bench.ts` | chart with 1K data points | < 200 ms |

#### Category K — Rendering (4 benches)

| Bench | Gesture | Budget |
|---|---|---|
| `bench/ui/render-quality-toggle.bench.ts` | quality preset change → first frame at new quality | < 100 ms |
| `bench/ui/sun-drag.bench.ts` | sun drag | 60 fps p95 |
| `bench/ui/render-export-start.bench.ts` | start render → first frame | < 500 ms |
| `bench/ui/render-gallery-paint.bench.ts` | 50-thumbnail grid | < 200 ms |

#### Category L — Modals + cross-cutting (3 benches)

| Bench | Gesture | Budget |
|---|---|---|
| `bench/ui/modal-open.bench.ts` | open any modal (creation, confirm, settings) | < 100 ms |
| `bench/ui/radial-menu-open.bench.ts` | right-click → radial menu visible | < 50 ms |
| `bench/ui/toast-show.bench.ts` | trigger toast → toast visible | < 16 ms |

#### Cross-cutting — full-flow + memory + bundle (4 benches)

| Bench | Gesture | Budget |
|---|---|---|
| `bench/ui/full-flow-create-edit.bench.ts` | landing → login → hub → new project → activate wall → draw 5 walls → edit thickness → undo → save | total wall-clock < 4 s; no allocations > 1 MB during steady state (V8 sampler) |
| `bench/ui/idle-cpu-workspace.bench.ts` | workspace open, no input, 5 s | rAF count == 0 (Vision §6 idle 0 fps); CPU < 2% |
| `bench/ui/scrub-fps-large.bench.ts` | orbit + pan + zoom on L-large fixture | > 55 fps p95 (Vision §6 row "Interactive frame rate") |
| `bench/ui/bundle-size-ui.bench.ts` | measure shipped JS for `src/ui/` chunk only | < 1.2 MB raw / < 350 KB gzip (carved from Vision §6 < 6 MB / 1.8 MB total) |

### §13.3 CI integration

- Each bench writes its result to `apps/bench/reports/<sprint>/<bench-name>.json` with `{p50, p95, p99, samples, env}`.
- `apps/bench/scripts/check-baseline.mjs` compares to `apps/bench/baseline.json`. Existing infra reused; new entries appended.
- Pre-GA: warn-only. Phase H D-final flips all UI benches to `hardFail: true` simultaneously.
- Per-PR job runs the **fast** subset (categories C, D, E, G, H, L = ~35 benches in ~3 min on CI runner).
- Nightly job runs the **full** suite (60 benches in ~12 min).
- The bench dashboard (`apps/bench/dashboard/`) gets a new "UI" tab grouping these by category with sparklines per sprint.

### §13.4 Visual-diff CI alongside

The perf benches assert *latency*. Visual-diff CI (Phase H separate deliverable, `apps/bench/visual-diff/`) asserts *appearance*. Both are required. The visual-diff baseline is captured from a frozen pre-S72 build BEFORE Phase A starts and re-asserted on every PR; SSIM diff > 2 px or pixel-diff > 0.05 % fails. Together perf + visual-diff give the operator the contract: *the UI looks identical, and it is at least as fast as it was, on every PR.*

---

## §14 Vision conformance check — every requirement ticked against this plan

This section maps every formal requirement from `08-VISION.md`, `09-AS-IS-VS-TO-BE.md`, `01-TARGET-ARCHITECTURE.md`, and `10-MASTER-IMPLEMENTATION-PLAN-36M.md` to the phase of this plan that delivers it. Each row is `Source → Requirement → Phase → Bench/CI gate`. **Zero requirements are left without a delivery vehicle.**

### §14.1 The eight architectural principles (Vision §3)

| # | Principle | Delivery in this plan | CI gate |
|---|---|---|---|
| **P1** | Geometry kernel is pure | `packages/geometry-kernel/` already pure (S07–S18). This plan does not regress. White UI never imports `geometry-kernel`. | `eslint-plugin-boundaries` (existing) |
| **P2** | Scene Committer is the only THREE owner | Phase D deletes `src/engine/` (the legacy THREE owners); Phase E deletes per-family fragment builders. After Phase G the only THREE-importing files are `packages/renderer/`, `packages/scene-committer/`, and `plugins/<family>/committer.ts`. | `eslint-plugin-pryzm/no-second-canvas` (Phase H) — `document.createElement('canvas')` allowed only in `Renderer.ts` and `composeRuntime.ts` |
| **P3** | One frame owner | Phase D deletes the 6 `requestAnimationFrame` callers in `src/engine/subsystems/`; Phase B's lint rule blocks new ones. After Phase G the only `rAF` is in `packages/frame-scheduler/`. | `eslint-plugin-pryzm/single-raf` (Phase H) — matches Vision P3 lint rule |
| **P4** | Commands + events are wire format | Phase A wires `PatchEmitter → EventLog → SyncClient → BakeCoordinator` as a single chain. Phase E ensures every legacy `commandManager.execute` is replaced by `runtime.bus.executeCommand`. | `affectedStores` declared on every handler (existing CI gate) |
| **P5** | Layer boundaries enforced mechanically | This plan adds two new layer rules: `no-runtime-package-import` (`src/ui/` → `@pryzm/runtime-composer/types` only) and `no-second-ui` (no imports from `apps/editor/src/projects/`). | new lint rules in Phase H |
| **P6** | No service locators, no `(window as any)` | Phase B eliminates 769 cast sites in `src/ui/`; Phase D eliminates ~250 in `src/engine/`. The "typed `ServiceRegistry` constructed at boot in `apps/editor/src/bootstrap.ts`" specified in P6 ≡ this plan's `PryzmRuntime` from `composeRuntime()`. **Same concept, named differently — reconciled here**: the package is `@pryzm/runtime-composer`, the bootstrap location remains `apps/editor/src/bootstrap.everything.ts` (composer wraps it). The 36-month plan target of 0 cast sites is achieved at end of Phase G (S84). | `eslint-plugin-pryzm/no-window-as-any` (Phase B) — Vision P6 lint rule |
| **P7** | Persistence is append-only events + chunked binary | Phase C deletes `ProjectRepository` (full snapshots) + `SaveOrchestrator` (debounce snapshot) + `ServerSyncQueue` (full-snapshot POST). After Phase C the only writer to project state is `EventLog.append`. | `tests/persistence/no-full-snapshot.test.ts` (existing CI gate, Vision P7) |
| **P8** | Observability is shipped | Every new module in `composeRuntime()` adds OTel spans (`pryzm.runtime.compose`, `pryzm.persistence.openProject`, `pryzm.tools.activate`, `pryzm.bus.executeCommand` already wired). UI panels emit `pryzm.ui.<panel>.mount/update/dispose` via a thin instrumentation hook in `Panel` base class (Phase B). | OTel coverage CI gate (existing) |

**8 / 8 principles delivered.**

### §14.2 The 17 non-functional targets (Vision §6)

| Target | Today | GA target | This plan delivers via | Bench |
|---|---|---|---|---|
| Cold load small | 2.4 s | < 800 ms | composeRuntime() < 50 ms (data half) + renderer parallel init + event-log replay; Phase D | `cold-load-real.bench.ts` (existing) + new `bench/ui/workspace-mount.bench.ts` |
| Cold load medium | 8.7 s | < 1.5 s first interactive | Same path; M-medium fixture in §11.16 budget | `load-medium.bench.ts` + `bench/ui/workspace-mount.bench.ts` |
| Cold load large | OOM | < 3 s first interactive | Tier-streamed loader (`packages/persistence-client/loader.ts` already exists); chunk streaming from bake worker; Phase F | `load-large.bench.ts` |
| Save (single edit) | 380 ms | < 10 ms | `EventLog.append` ≤ 10 ms (existing budget `persistence.save-edit.append.memory`) | `save-edit.bench.ts` (existing) |
| Idle CPU | 18% | < 2% | Single rAF (P3 enforcement) + dirty-flag rendering; Phase D | `idle-cpu.bench.ts` (existing) + new `bench/ui/idle-cpu-workspace.bench.ts` |
| Interactive frame rate | 28 fps | > 55 fps p95 | Renderer + scheduler; Phase D | `orbit-fps-walls.bench.ts` (existing) + new `bench/ui/scrub-fps-large.bench.ts` |
| Concurrent users | 1 reliable | 20 reliable | SyncClient (Yjs CRDT — already in `packages/sync-client/`); Phase A wires it; Phase C surfaces presence | `awareness-throughput.bench.ts` (existing) + `sync-roundtrip.bench.ts` |
| Largest model | ~500 walls | 10K walls / 50 levels | Tier-streamed loader + chunk streaming + bake worker; Phase D + F | `largest-model.bench.ts` (existing) |
| Bundle size raw | 14.2 MB | < 6 MB | Phase G mass deletion (~150K LOC removal); Vite bundle splitting; lazy chunks for AI/IFC/Rhino plugins | bundle-size CI gate (existing) + new `bench/ui/bundle-size-ui.bench.ts` |
| Bundle size gzip | 4.1 MB | < 1.8 MB | Same | same |
| First contentful paint | 1.9 s | < 600 ms | composeRuntime() does NOT block FCP; landing is engine-free (Phase A); `bench/ui/landing-paint.bench.ts` enforces | new `bench/ui/landing-paint.bench.ts` |
| Plugin install → first invoc | n/a | < 2 s | `runtime.plugins.installFromUrl(url)` returns a hot-loaded module (Phase F) | new `bench/ui/plugin-contribution-add.bench.ts` |
| Bake propagation | n/a | < 1.5 s | BakeCoordinator wired in Phase A; bake-worker existing | `bake-incremental.bench.ts` (existing) |
| Sync latency | ~3 s | < 250 ms p95 | SyncClient broadcast in Phase A; presence in Phase C | `sync-roundtrip.bench.ts` (existing) + new `bench/ui/presence-cursor.bench.ts` |
| AI floor-plan import | ~45 s | < 15 s | `runtime.ai.floorPlan.import` (Phase F); CV pipeline existing | `cv-pipeline.bench.ts` + new `bench/ui/floorplan-import-progress.bench.ts` |
| Undo single | 80 ms | < 5 ms | `runtime.undoStack.undo()` reverse-applies Immer patches (existing); Phase D wires hotkey | new `bench/ui/save-undo-hud.bench.ts` |
| OTel trace coverage | ~5% | 100% L0–L7 | UI panel base class adds `pryzm.ui.*` spans in Phase B | OTel coverage CI gate (existing) |

**17 / 17 NFTs delivered.**

### §14.3 The eight layers (Vision §4)

| Layer | This plan's posture | Phase |
|---|---|---|
| **L0 Persistence** | `runtime.persistence.eventLog` + `runtime.persistence.client` replace legacy stack (Phase C). | C |
| **L1 Domain Stores** | `runtime.stores.<key>` exposed; legacy `wallStore` etc. deleted with `src/elements/` (Phase E). | A + E |
| **L2 Command/Event Bus** | `runtime.bus` exposed; legacy `commandManager` deleted with `src/commands/` (Phase E). | A + E |
| **L3 Sync** | `runtime.sync.client` + `runtime.sync.presence` exposed; SyncClient already shipping. | A + C |
| **L4 Geometry Kernel** | `runtime.scene.host` consumes producers from each plugin; kernel never exposed to UI directly (P1). | A + E |
| **L5 Frame Scheduler + Renderer** | `runtime.scene.scheduler` + `runtime.scene.renderer`; legacy renderer deleted (Phase D). | A + D |
| **L6 Plugin Host** | `runtime.plugins` exposed; PluginHost moved out of editor app into `packages/plugin-host/` (Phase F). | A + F |
| **L7 Presentation** | `src/ui/` preserved verbatim (UI is on the L7 boundary; the white UI is the L7 surface). All wireup is L7 → L0–L6 via the `runtime` handle. | B (threading) |
| **L7.5 AI Operations** | `runtime.ai` exposed; `src/ai/` deleted (Phase F + G). | A + F |

**9 / 9 layers (8 + L7.5) delivered. UI layer (L7) is preserved as the operator requires.**

### §14.4 The ten differentiators (Vision §5)

| # | Differentiator | This plan's contribution |
|---|---|---|
| **D1** | Real-time multi-user geometry collab | Phase A wires SyncClient; Phase C surfaces presence cursors via `'overlay.canvas'` contributions in the white UI. |
| **D2** | AI as L7.5 | Phase F wires `runtime.ai`; the white AI panel calls it; AI mutations flow through the same bus as user edits — undo/sync/bake apply uniformly. |
| **D3** | Self-host story | Unaffected by this plan; the deployed bundle is the same image. Sync server, bake worker, AI worker all `docker-compose`-able as today. |
| **D4** | Plugin SDK 1.0 + marketplace | Phase F surfaces `runtime.plugins.installFromUrl`; the white marketplace panel calls it. |
| **D5** | OTel observability | Vision P8; UI base class adds `pryzm.ui.*` spans in Phase B. |
| **D6** | Hot-reload plugin DX (`pryzm dev`) | Phase F's plugin-host supports hot module reload via Vite HMR; new contributions land in the white toolbar without reload. |
| **D7** | Headless `@pryzm/headless` | Unaffected by this plan; kernel + headless package already ship. |
| **D8** | Desktop-CAD documentation pipeline | Phase F surfaces `runtime.viewRegistry` + `runtime.stores.sheet/schedule/titleBlock`; the white sheet editor + schedule panel + plan view paint via these. |
| **D9** | IFC + BCF + ISO 19650 round-trip | Phase F wires `runtime.ifc` + `runtime.bcf`; the white import/export panels + BCF panels call them. |
| **D10** | In-editor parametric component authoring | The component-editor app (`apps/component-editor/`) is unchanged; this plan does not regress it. |

**10 / 10 differentiators preserved or delivered.**

### §14.5 The eight non-goals (Vision §7) — confirm we are not violating any

| # | Non-goal | This plan's posture |
|---|---|---|
| **NG1** | No native desktop app | Confirmed — web-only; preserved. |
| **NG2** | No general 3D modeller | Confirmed — element families only; preserved. |
| **NG3** | No CFD/FEM/energy in editor | Confirmed — out of scope. |
| **NG4** | No native mobile app | Confirmed — out of scope. |
| **NG5** | No SQL query language | Confirmed — `runtime.dataWorkbench` (NL query + spatial query) is the answer. |
| **NG6** | IFC import does not become native format | Confirmed — `runtime.ifc.import` produces a plugin-managed projection; `.pryzm` remains the native format. |
| **NG7** | No Material/Carbon/Fluent design-system parity | **Confirmed and reinforced** — the white UI IS the design system. This plan freezes it. |
| **NG8** | No backwards compat at PRYZM 1 wire format | Confirmed — Phase C migrator is one-way (PRYZM 1 localStorage → PRYZM 2 event log); old format never written again. |

**0 / 8 violated. Plan honors every non-goal.**

### §14.6 Cross-document conflicts (the documents you specifically asked about)

| Conflict | Resolution |
|---|---|
| `09-AS-IS-VS-TO-BE.md` §3 lists `initUI.ts` as DELETED at S62; `src/ui/Layout.ts` is the modern equivalent in main. | **This plan KEEPS `src/ui/Layout.ts`** — it is the white-UI orchestrator, threaded with `runtime` in Phase B. The DELETION clause in §3 row 4 is amended in Phase H D-last (alongside the §3 row "PropertyPanel split into per-plugin contributions" which IS done in Phase E + F). |
| `09-AS-IS-VS-TO-BE.md` L7 row says "Top files: `PropertyPanel.ts` 3,339 LOC … decomposed into per-element vanilla classes (~200–400 LOC each) + a `PanelHost` orchestrator". | **Honored** — Phase F's per-plugin contributions ARE the per-element decomposition. The orchestrator is `runtime.plugins.contributions('inspector.element')` rendered via the existing `PropertyInspector.ts` (the PanelHost). White visual identical; under-the-hood per-plugin. |
| `09-AS-IS-VS-TO-BE.md` §5 cites **2,078** `(window as any)` cast sites; this plan's §2.2 cites **769** in `src/ui/`. | Compatible. 2,078 = 769 (src/ui) + 250 (src/engine — deleted Phase D) + ~1,059 (src/elements + src/commands + src/services + src/core + src/api — deleted Phases C–G as the FILES are deleted). After Phase G, total = 0. |
| `09-AS-IS-VS-TO-BE.md` §7 (OBC) — 91 OBC import sites → ~25 in `plugins/ifc-*`. | **Honored** — Phase F's `runtime.ifc` exposes `plugins/ifc-import` + `ifc-export` + `ifc-inspector`. Phase D deletes the `OBC` references in `src/engine/`; remaining sites are exclusively in the `plugins/ifc-*` packages. |
| `01-TARGET-ARCHITECTURE.md` §7.2 (Scene Committer) requires single THREE owner. | **Honored** — Phase D deletes legacy THREE owners; Phase E deletes per-family fragment builders. |
| `10-MASTER-IMPLEMENTATION-PLAN-36M.md` §6.4 (Sub-phase 3D — Hardening + GA, S67–S72) — this is the period the operator is currently in (S72). | **Aligned** — this plan IS the S72-ending hardening plan. Phases A–G compress into S72–S84 (12 sprints), Phase H spans S85–S87, GA gate end of S87. |
| `10-MASTER-IMPLEMENTATION-PLAN-36M.md` §10 ("30-worst-files retirement schedule") — many entries scheduled for S55–S62. | Anything not yet done in main is ABSORBED into this plan's Phase E + G. The retirement schedule is the line-by-line work; this plan is the orchestration. |
| `06-PRYZM-IDENTITY-AND-RECOUNT.md` §2.4 — D11 UI continuity (operator-added). | **Honored** — the central operator constraint of this plan; codified in §1, enforced in §6, gated in Phase H visual-diff CI. |
| `Context.md` Ask 06 — Path A (vanilla TS, no React migration). | **Honored** — `src/ui/` is preserved as vanilla TS verbatim. |

**No unresolved conflict.** Where this plan amends a sister document (e.g. the §3 row 4 deletion of `initUI.ts`/`Layout.ts`, the §3 styles migration), Phase H D-last lands the doc amendments alongside the GA gate.

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

### §16.5 Phase E — Per-family element migration (S76–S80, 14 sub-phases)

Each element family migration deletes its legacy `src/elements/<family>/`, `src/commands/<family>/`, and any `(window as any).<family>Tool/Store/Builder` global. The per-family draw HUD and mode picker keep their visual identity but call `runtime.tools.activate(family, mode)` and dispatch via `runtime.bus.executeCommand('<family>.<verb>', ...)`.

| Sub-phase | Family | Gestures migrated (per family: tool activate, mode pick, draw frame loop, commit, edit existing, delete) | Sprint | Bench |
|---|---|---|---|---|
| **E.1** | Wall | Alt+W hotkey; right-rail Wall click; mode bar L/O/C/S; wall-draw frame loop; commit at ESC; click-existing-wall→inspector; thickness drag; delete; copy; mirror | S76 | `bench/ui/wall-mode-switch.bench.ts` + `wall-draw-frame.bench.ts` + `wall-edit.bench.ts` |
| **E.2** | Slab | Alt+S; right-rail Slab; slab-draw frame; commit; edit dimensions; delete | S77 | `bench/ui/slab-draw.bench.ts` + edit |
| **E.3** | Door | Alt+D; right-rail Door; pick host wall; place; commit; edit; delete | S77 | `bench/ui/door-draw.bench.ts` |
| **E.4** | Window | Alt+I; same flow as door | S77 | `bench/ui/window-draw.bench.ts` |
| **E.5** | Curtain Wall | Alt+Q; right-rail Curtain Wall; mode picker SINGLE/COMPLEX; draw; commit; edit grid; edit panel | S77 | `bench/ui/cw-draw.bench.ts` + `cw-grid-edit.bench.ts` |
| **E.6** | Floor | right-rail Floor; floor-draw; commit; edit; delete | S78 | `bench/ui/floor-draw.bench.ts` |
| **E.7** | Ceiling | right-rail Ceiling; ceiling-draw; commit; edit; delete | S78 | `bench/ui/ceiling-draw.bench.ts` |
| **E.8** | Roof | right-rail Roof; mode picker (slope / hip / gable); draw; commit; edit; delete | S78 | `bench/ui/roof-draw.bench.ts` |
| **E.9** | Stair | right-rail Stair; StairLevelRequiredPanel; StairSetupPanel; commit; edit; delete | S78 | `bench/ui/stair-draw.bench.ts` |
| **E.10** | Handrail | right-rail Handrail; place along path; commit; edit | S78 | `bench/ui/handrail-draw.bench.ts` |
| **E.11** | Column | Alt+C; right-rail Column; place; commit; edit | S79 | `bench/ui/column-draw.bench.ts` |
| **E.12** | Beam | Alt+B; right-rail Beam; place; commit; edit | S79 | `bench/ui/beam-draw.bench.ts` |
| **E.13** | Grid | right-rail Grid; GridDrawingHUD; place; commit; edit; delete | S79 | `bench/ui/grids-tool.bench.ts` |
| **E.14** | Opening (cross-family: hosted in wall + slab) | OpeningModePicker; pick host; place; commit | S80 | `bench/ui/opening-draw.bench.ts` |

After each E.<n>, the corresponding `src/elements/<family>/` + `src/commands/<family>/` directories are deleted in the same PR.

### §16.6 Phase F — Plugin contributions (S78–S84, ~95 sub-phases)

This is the bulk of the white-UI gesture migration. Each gesture becomes a contribution to a typed contribution kind. **One sub-phase = one contribution = one PR**.

#### §16.6.1 Group F.1 — `toolbar.discipline` contributions (CreateRailPanel + 7 sibling rails)

Each tool button in every rail becomes a contribution registered by its plugin.

**Architecture rail (CreateRailPanel)**:

| Sub-phase | Tool button | Today | After | Sprint | Bench |
|---|---|---|---|---|---|
| **F.1.01** | Wall | hard-coded in `CreateRailPanel.ts:738` | `plugins/wall/contributions.ts` registers `{id:'wall.tool', discipline:'architecture', activate: r => r.tools.activate('wall', {mode:'polyline-ortho'})}` | S78 | `bench/ui/tool-activate.bench.ts` |
| **F.1.02** | Curtain Wall | hard-coded line 745 | `plugins/curtain-wall/contributions.ts` | S78 | included |
| **F.1.03** | Door | line 752 | `plugins/door/contributions.ts` | S78 | included |
| **F.1.04** | Window | line 759 | `plugins/window/contributions.ts` | S78 | included |
| **F.1.05** | Slab | | `plugins/slab/contributions.ts` | S78 | included |
| **F.1.06** | Floor | | `plugins/floor/contributions.ts` | S78 | included |
| **F.1.07** | Ceiling | | `plugins/ceiling/contributions.ts` | S78 | included |
| **F.1.08** | Roof | | `plugins/roof/contributions.ts` | S78 | included |
| **F.1.09** | Stair | | `plugins/stair/contributions.ts` | S78 | included |
| **F.1.10** | Handrail | | `plugins/handrail/contributions.ts` | S78 | included |
| **F.1.11** | Column | | `plugins/column/contributions.ts` | S78 | included |
| **F.1.12** | Beam | | `plugins/beam/contributions.ts` | S78 | included |
| **F.1.13** | Grid | | `plugins/grids/contributions.ts` | S78 | included |
| **F.1.14** | CreateRailPanel `_buildSections()` rewrite to enumerate `runtime.plugins.contributions('toolbar.discipline').filter(c => c.discipline === 'architecture')` | hard-coded array of 13 tools | data-driven from contributions | S78 | included |

**Annotation rail**:

| Sub-phase | Tool | After | Sprint |
|---|---|---|---|
| **F.1.15** | Text Annotation | `plugins/annotations/contributions.ts` text tool | S79 |
| **F.1.16** | Linear Dimension | dim-linear contribution | S79 |
| **F.1.17** | Aligned Dimension | dim-aligned contribution | S79 |
| **F.1.18** | Angular Dimension | dim-angular contribution | S79 |
| **F.1.19** | Radial Dimension | dim-radial contribution | S79 |
| **F.1.20** | Tag | annotation-tag contribution | S79 |
| **F.1.21** | Section Mark | annotation-section contribution | S79 |
| **F.1.22** | Detail Mark | annotation-detail contribution | S79 |
| **F.1.23** | Revision Cloud | annotation-revcloud contribution | S79 |
| **F.1.24** | AnnotationRailPanel rewrite to enumerate contributions | hard-coded array | data-driven | S79 |

**Export rail**:

| Sub-phase | Tool | After | Sprint |
|---|---|---|---|
| **F.1.25** | Export PDF | `plugins/export-pdf/contributions.ts` | S79 |
| **F.1.26** | Export DWG/DXF | `plugins/dxf/contributions.ts` | S79 |
| **F.1.27** | Export IFC | `plugins/ifc-export/contributions.ts` (already exists; just add UI contribution) | S79 |
| **F.1.28** | Export Schedule CSV | `plugins/schedules/contributions.ts` | S79 |
| **F.1.29** | Export Image | `plugins/render/contributions.ts` snapshot | S79 |
| **F.1.30** | ExportRailPanel rewrite | hard-coded | data-driven | S79 |

**GIS rail**:

| Sub-phase | Tool | After | Sprint |
|---|---|---|---|
| **F.1.31** | Locate (lat/lon picker) | `plugins/geospatial/contributions.ts` locate | S80 |
| **F.1.32** | Basemap toggle | geospatial basemap | S80 |
| **F.1.33** | Terrain toggle | geospatial terrain | S80 |
| **F.1.34** | Satellite imagery toggle | geospatial satellite | S80 |
| **F.1.35** | GISRailPanel rewrite | data-driven | S80 |

**Grids+Levels rail**:

| Sub-phase | Tool | After | Sprint |
|---|---|---|---|
| **F.1.36** | New Grid | `plugins/grids/contributions.ts` new | S80 |
| **F.1.37** | New Level | `plugins/levels/contributions.ts` new | S80 |
| **F.1.38** | Split Level | levels split | S80 |
| **F.1.39** | Offset Grid | grids offset | S80 |
| **F.1.40** | Copy Grid | grids copy | S80 |
| **F.1.41** | Delete Grid/Level | shared delete | S80 |
| **F.1.42** | GridsLevelsRailPanel rewrite | data-driven | S80 |

**Navigate rail**:

| Sub-phase | Tool | After | Sprint |
|---|---|---|---|
| **F.1.43** | Pan | `plugins/navigate/contributions.ts` pan | S80 |
| **F.1.44** | Orbit | navigate orbit | S80 |
| **F.1.45** | Zoom | navigate zoom | S80 |
| **F.1.46** | Zoom-to-fit | navigate zoom-fit | S80 |
| **F.1.47** | Zoom-to-selection | navigate zoom-sel | S80 |
| **F.1.48** | Walkthrough | navigate walkthrough | S80 |
| **F.1.49** | NavigateRailPanel rewrite | data-driven | S80 |

**Render rail**:

| Sub-phase | Tool | After | Sprint |
|---|---|---|---|
| **F.1.50** | Render Quality preset | `plugins/render/contributions.ts` quality | S81 |
| **F.1.51** | Sun control | render sun | S81 |
| **F.1.52** | Materials editor open | render materials | S81 |
| **F.1.53** | Exposure slider | render exposure | S81 |
| **F.1.54** | Render Gallery open | render gallery | S81 |
| **F.1.55** | Start Render | render start | S81 |
| **F.1.56** | Panorama capture | render panorama | S81 |
| **F.1.57** | Walkthrough export | render walkthrough | S81 |
| **F.1.58** | RenderRailPanel rewrite | data-driven | S81 |

**Visual rail**:

| Sub-phase | Tool | After | Sprint |
|---|---|---|---|
| **F.1.59** | Visibility-Graphics open | `plugins/visibility-intent/contributions.ts` open | S81 |
| **F.1.60** | Edge style toggle | VI edge | S81 |
| **F.1.61** | Transparency | VI transparency | S81 |
| **F.1.62** | Isolate selection | VI isolate | S81 |
| **F.1.63** | Hide selection | VI hide | S81 |
| **F.1.64** | Reveal hidden | VI reveal | S81 |
| **F.1.65** | VisualRailPanel rewrite | data-driven | S81 |

#### §16.6.2 Group F.2 — `inspector.element` contributions (per-family inspector forms)

Each family's PropertyPanel widget becomes a contribution.

| Sub-phase | Family | Today (file) | After (contribution location) | Sprint | Bench |
|---|---|---|---|---|---|
| **F.2.01** | Wall (`WallTypeSelectorWidget` + `WallLayersEditor`) | `src/ui/property-panel/Wall*.ts` | `plugins/wall/inspector/Panel.ts` (form descriptor + edit handlers) | S81 | `bench/ui/inspector-mount.bench.ts` |
| **F.2.02** | Slab (`SlabTypeSelectorWidget` + `SlabDimensionsEditor` + `SlabLayersEditor`) | `src/ui/property-panel/Slab*.ts` | `plugins/slab/inspector/Panel.ts` | S81 | included |
| **F.2.03** | Door | `src/ui/property-panel/DoorTypeSelectorWidget.ts` | `plugins/door/inspector/Panel.ts` | S82 | included |
| **F.2.04** | Window | `src/ui/property-panel/WindowTypeSelectorWidget.ts` | `plugins/window/inspector/Panel.ts` | S82 | included |
| **F.2.05** | Curtain Wall (`CurtainGridEditor` + `CurtainPanelEditor` + `CurtainSubElementPanel`) | `src/ui/property-panel/Curtain*.ts` | `plugins/curtain-wall/inspector/Panel.ts` | S82 | included |
| **F.2.06** | Floor | `src/ui/property-panel/FloorTypeSelectorWidget.ts` | `plugins/floor/inspector/Panel.ts` | S82 | included |
| **F.2.07** | Ceiling | `CeilingTypeSelectorWidget` | `plugins/ceiling/inspector/Panel.ts` | S82 | included |
| **F.2.08** | Roof (`RoofPropertySheet`) | `src/ui/property-panel/RoofPropertySheet.ts` | `plugins/roof/inspector/Panel.ts` | S82 | included |
| **F.2.09** | Stair (`StairTypeSelectorWidget`) | `src/ui/property-panel/StairTypeSelectorWidget.ts` | `plugins/stair/inspector/Panel.ts` | S82 | included |
| **F.2.10** | Column (`ColumnTypeSelectorWidget`) | | `plugins/column/inspector/Panel.ts` | S82 | included |
| **F.2.11** | Beam (`BeamTypeSelectorWidget`) | | `plugins/beam/inspector/Panel.ts` | S82 | included |
| **F.2.12** | Plumbing (`PlumbingTypeSelectorWidget`) | | `plugins/plumbing/inspector/Panel.ts` | S82 | included |
| **F.2.13** | Annotation | (mixed in PropertyPanel) | `plugins/annotations/inspector/Panel.ts` | S82 | included |
| **F.2.14** | Dimension | (mixed) | `plugins/dimensions/inspector/Panel.ts` | S82 | included |
| **F.2.15** | Room | (mixed) | `plugins/rooms/inspector/Panel.ts` | S82 | included |
| **F.2.16** | Furniture | | `plugins/furniture/inspector/Panel.ts` | S83 | included |
| **F.2.17** | Generic / View / Sheet (catch-all) | (`ViewPropertiesSection`) | `plugins/views/inspector/Panel.ts` + `plugins/sheets/inspector/Panel.ts` | S83 | included |
| **F.2.18** | PropertyInspector orchestrator rewrite to enumerate contributions | direct table lookup of widget classes | `runtime.plugins.contributions('inspector.element').filter(c => c.appliesTo(selection.element))` | S83 | `bench/ui/inspector-mount.bench.ts` |
| **F.2.19** | Multi-select common-fields panel | hard-coded intersection of widgets | `inspector.multiselect` contribution kind that takes `selection[]` and computes common fields | S83 | `bench/ui/inspector-multi-select.bench.ts` |

#### §16.6.3 Group F.3 — `modal.creation` contributions (ElementCreationModal)

Each "Create <X>" modal becomes a contribution.

| Sub-phase | Modal | After | Sprint |
|---|---|---|---|
| **F.3.01** | Create Wall modal | `plugins/wall/modal/Create.ts` | S82 |
| **F.3.02** | Create Slab modal | `plugins/slab/modal/Create.ts` | S82 |
| **F.3.03** | Create Door modal | `plugins/door/modal/Create.ts` | S82 |
| **F.3.04–F.3.13** | Window / Curtain Wall / Floor / Ceiling / Roof / Stair / Handrail / Column / Beam / Grid (10 modals) | `plugins/<family>/modal/Create.ts` | S82–S83 |
| **F.3.14** | OpeningModePicker (host-pick → place) | `plugins/wall/modal/Opening.ts` (cross-family) | S83 |
| **F.3.15** | ElementCreationModal orchestrator rewrite | hard-coded switch | reads `runtime.plugins.contributions('modal.creation').filter(c => c.element === requested)` | S83 |

#### §16.6.4 Group F.4 — `menu.context` + `menu.radial` contributions (right-click + RadialMenu)

| Sub-phase | Gesture | After | Sprint |
|---|---|---|---|
| **F.4.01** | Right-click in viewport (no selection) → context menu shows | `runtime.plugins.contributions('menu.context.viewport')` | S83 |
| **F.4.02** | Right-click on selected element → element context menu | `runtime.plugins.contributions('menu.context.element').filter(c => c.appliesTo(sel.element))` | S83 |
| **F.4.03** | Each element family registers `Move / Rotate / Mirror / Copy / Array / Group / Properties / Delete / Hide / Isolate / Override` (~11 items × 12 families) → contribution per item | `plugins/<family>/menu/context-element.ts` | S83 |
| **F.4.04** | Right-click on view tab → tab context menu | `runtime.plugins.contributions('menu.context.viewtab')` | S83 |
| **F.4.05** | Right-click on project card (hub) | already done in C.4.01 | done |
| **F.4.06** | RadialMenu open (Q hotkey) → tools shown | `runtime.plugins.contributions('menu.radial')` | S83 |
| **F.4.07** | Radial menu rotate-and-release → tool activated | dispatched via `runtime.tools.activate(toolId)` | S83 |
| **F.4.08** | Radial menu customise (settings) → which tools appear | `runtime.userPreferences.radialTools[]` | S83 |

#### §16.6.5 Group F.5 — Bottom strip gestures (BottomActionMenu + carousels + sheet editor)

`BottomActionMenu.ts` has 7 structure-tool buttons, 4 view buttons, level switcher, coordinate readout, selection count, plus section box, ortho toggle, and snap settings.

| Sub-phase | Gesture | Today | After | Sprint |
|---|---|---|---|---|
| **F.5.01** | Bottom: click Wall quick button | `(window as any).wallTool.activate(...)` | `runtime.tools.activate('wall')` | S83 |
| **F.5.02** | Bottom: click Curtain Wall quick button | `(window as any).curtainWallTool.activate(...)` | `runtime.tools.activate('curtain-wall')` | S83 |
| **F.5.03–F.5.07** | Bottom: Door / Window / Slab / Floor / Ceiling quick buttons | each `(window as any).<family>Tool.*` | `runtime.tools.activate('<family>')` | S83 |
| **F.5.08** | Bottom: shortcut hotkeys (WA, CW, DR, WI, SL, FL, CE) | hotkey listener calls legacy tool | `runtime.tools.activate(...)` from hotkey handler | S83 |
| **F.5.09** | Bottom: level switcher dropdown | reads/writes `(window as any).activeLevelStore` | reads `runtime.stores.level`; sets via `runtime.bus.executeCommand('view.setActiveLevel', ...)` | S83 |
| **F.5.10** | Bottom: section box toggle | `(window as any).sectionBoxTool.enable/disable` | `runtime.tools.sectionBox.enable/disable` | S83 |
| **F.5.11** | Bottom: ortho/perspective toggle | `(window as any).cameraController.setProjection` | `runtime.cameraController.setProjection(mode)` | S83 |
| **F.5.12** | Bottom: snap settings dropdown | local prefs | `runtime.userPreferences.snap` (broadcasts to picking) | S83 |
| **F.5.13** | Bottom: reset view button | `(window as any).cameraController.resetView()` | `runtime.cameraController.resetView()` | S83 |
| **F.5.14** | Bottom: cursor coordinates readout | reads `(window as any).hoverService.lastWorldPos` | reads `runtime.hover.lastWorldPos()` | S83 |
| **F.5.15** | Bottom: selection count readout | reads legacy `selectionService.size()` | reads `runtime.selection.size()` | S83 |
| **F.5.16** | FurnitureCarousel: scroll | reads `(window as any).furnitureStore.list()` | reads `runtime.plugins.get('furniture').catalog` | S83 |
| **F.5.17** | FurnitureCarousel: click thumbnail | sets active item legacy | dispatches `runtime.tools.activate('furniture-place', {itemId})` | S83 |
| **F.5.18** | FurnitureCarousel: drag thumbnail into scene → drop | legacy drag handler | drag-end → `runtime.bus.executeCommand('furniture.place', {dto, point})` | S83 |
| **F.5.19** | FloatingObjectCarousel: same gestures | same wire as F.5.16–18 | | S83 |
| **F.5.20** | FurnitureCarousel: filter / search | local filter | local filter on plugin catalog | S83 |
| **F.5.21** | Wardrobe panel: configure assembly | `(window as any).wardrobeRunInspector` | `runtime.plugins.get('wardrobe').configure(...)` | S83 |
| **F.5.22** | Kitchen panel: configure | `(window as any).kitchenRunInspector` | `runtime.plugins.get('kitchen').configure(...)` | S83 |
| **F.5.23** | Rooms panel (bottom) | room store reads | `runtime.stores.room` reads | S83 |
| **F.5.24** | SchedulePanel: open schedule (click row in left rail) | reads `scheduleStore.get(id)` | reads `runtime.stores.schedule.get(id)` | S83 |
| **F.5.25** | SchedulePanel: cell edit | dispatches legacy command | `runtime.bus.executeCommand('schedule.setCell', {scheduleId, row, col, value})` | S83 |
| **F.5.26** | SchedulePanel: column header click → sort | local sort | local sort on store snapshot | S83 |
| **F.5.27** | SchedulePanel: filter row | local filter | local filter | S83 |
| **F.5.28** | SchedulePanel: export CSV button | legacy export | dispatches via `plugins/schedules` export contribution (already in F.1.28) | S83 |
| **F.5.29** | SheetEditor: click viewport in sheet → place | legacy `SheetEditorPanel.placeViewport` | `plugins/sheets/SheetEditorHost.placeViewport()` (this is the major decomposition of #2 worst file) | S83 |
| **F.5.30** | SheetEditor: drag viewport corner → resize | legacy | `runtime.bus.executeCommand('sheet.resizeViewport', ...)` | S83 |
| **F.5.31** | SheetEditor: drag titleblock → reposition | legacy | `runtime.bus.executeCommand('sheet.placeTitleBlock', ...)` | S83 |
| **F.5.32** | SheetEditor: select revision row → edit | legacy | `runtime.bus.executeCommand('sheet.setRevision', ...)` | S83 |

#### §16.6.6 Group F.6 — Left rail panel content (per spine icon)

Each spine icon's content panel migrates as one sub-phase.

| Sub-phase | Gesture | Today | After | Sprint |
|---|---|---|---|---|
| **F.6.01** | MODEL spine icon: spatial tree paint with elements | reads 12 stores via `(window as any)` | reads `runtime.stores.<family>` for each family | S81 |
| **F.6.02** | MODEL: click element in tree → select in viewport | legacy selection | `runtime.selection.select([{element, id}])` + camera focus | S81 |
| **F.6.03** | MODEL: expand/collapse level node | local UI state | local UI state (no engine touch) | S81 |
| **F.6.04** | MODEL: drag element in tree → reparent | legacy command | `runtime.bus.executeCommand('hierarchy.reparent', ...)` | S81 |
| **F.6.05** | MODEL: right-click in tree → element context menu (already in F.4.02) | done | done | — |
| **F.6.06** | DATA spine icon: hierarchy paint | legacy | `runtime.dataWorkbench.hierarchy.list()` | S82 |
| **F.6.07** | DATA: filter/search | local | local on store snapshot | S82 |
| **F.6.08** | DATA: click row → select element | legacy | `runtime.selection.select(...)` | S82 |
| **F.6.09** | DATA: bucket panels (each bucket file) | legacy | reads `runtime.dataWorkbench.bucket(...)` | S82 |
| **F.6.10** | VIEWS spine icon: list views | legacy `viewDefinitionStore` | `runtime.viewRegistry.list()` | S81 |
| **F.6.11** | VIEWS: click view → activate (already in D.11) | done | done | — |
| **F.6.12** | VIEWS: "+ New view" button | legacy | `runtime.bus.executeCommand('view.create', {kind, settings})` | S81 |
| **F.6.13** | VIEWS: right-click view → duplicate / delete / rename | legacy | dispatches `view.duplicate / view.delete / view.rename` | S81 |
| **F.6.14** | VIEWS: drag view to reorder | legacy | `runtime.bus.executeCommand('view.reorder', ...)` | S81 |
| **F.6.15** | VIEWS: View Templates section (`ViewTemplateManagerPanel`) — apply / create / delete template | legacy | dispatches `viewTemplate.*` | S81 |
| **F.6.16** | SCHEDULES spine icon: list schedules | legacy | `runtime.stores.schedule.list()` | S82 |
| **F.6.17** | SCHEDULES: "+ New schedule" wizard | legacy | dispatches `schedule.create` | S82 |
| **F.6.18** | SCHEDULES: right-click → delete / rename / duplicate | legacy | dispatches | S82 |
| **F.6.19** | AI spine icon: open panel (already in B.31 for mount) | done for mount | F.7.* for actual gestures | — |
| **F.6.20** | HISTORY spine icon: AI approval queue paint | reads `commandProposalStore` | `runtime.ai.approvalQueue.list()` | S83 |
| **F.6.21** | HISTORY: click proposal → preview | legacy preview | `runtime.ai.approvalQueue.preview(id)` | S83 |
| **F.6.22** | HISTORY: Accept button → commit batch | legacy | `runtime.ai.approvalQueue.commit(batchId)` | S83 |
| **F.6.23** | HISTORY: Reject button → drop | legacy | `runtime.ai.approvalQueue.reject(batchId)` | S83 |
| **F.6.24** | HISTORY: edit-before-commit (open inspector on proposed element) | legacy | special inspector mode reading from proposal | S83 |
| **F.6.25** | SETTINGS spine icon: open settings (already in C.9) | done | done | — |
| **F.6.26** | LeftNavRail: drag spine width handle → resize content area | legacy | local state + `runtime.userPreferences.set('lnr.width', n)` | S81 |
| **F.6.27** | LeftNavRail: collapse-all hotkey (Cmd+\\) | legacy | local + pref | S81 |

#### §16.6.7 Group F.7 — AI gestures (`runtime.ai.*`)

| Sub-phase | Gesture | Today | After | Sprint |
|---|---|---|---|---|
| **F.7.01** | AI: type prompt + Enter → streamed reply | `(window as any).aiClient.streamCompletion(...)` | `for await (chunk of runtime.ai.streamCompletion({prompt, ctx}))` | S83 |
| **F.7.02** | AI: stop button mid-stream | `aiClient.cancel(streamId)` | `runtime.ai.cancel(streamId)` | S83 |
| **F.7.03** | AI: cost pill click → cost breakdown | `(window as any).aiClient.cost.snapshot()` | `runtime.ai.cost.snapshot()` | S83 |
| **F.7.04** | AI: model selector dropdown | `aiClient.setModel(modelId)` | `runtime.ai.setModel(modelId)` | S83 |
| **F.7.05** | AI: history panel (past conversations) | local | `runtime.ai.history.list(projectId)` | S83 |
| **F.7.06** | AI: open conversation → load | local | `runtime.ai.history.load(convId)` | S83 |
| **F.7.07** | AI: AICreatePanel "Generate" submit | legacy generative | `runtime.ai.generative.create({prompt, ctx})` → returns `CommandBatch` → enters approval queue | S83 |
| **F.7.08** | AI: ValidatePanel "Run" button | legacy rule engine | `runtime.ai.rules.validate(projectId)` | S83 |
| **F.7.09** | AI: ValidatePanel click rule violation → focus element | legacy | `runtime.selection.select(...)` + camera focus | S83 |
| **F.7.10** | AI: FloorPlanImportPanel upload PDF → submit | legacy `(window as any).pdfToBim.start(file)` | `runtime.ai.floorPlan.import({file})` → returns `jobId` | S83 |
| **F.7.11** | AI: FloorPlanImportPanel progress poll | legacy | `runtime.ai.floorPlan.subscribe(jobId, p => ...)` | S83 |
| **F.7.12** | AI: FloorPlanFullPlanViewer paint | legacy | `runtime.ai.floorPlan.getResult(jobId)` | S83 |
| **F.7.13** | AI: FloorPlanFullPlanViewer "Accept all" → batch into approval queue | legacy | `runtime.ai.floorPlan.toBatch(jobId)` → `runtime.ai.approvalQueue.enqueue(batch)` | S83 |
| **F.7.14** | AI: FloorPlanDebugOverlay show/hide | legacy debug | `runtime.ai.floorPlan.debugOverlay(jobId)` | S83 |
| **F.7.15** | AI: voice spatial input button (mic) | legacy `voiceSpatialInterface` | `runtime.ai.voice.startSession()` | S84 |
| **F.7.16** | AI: voice utterance → transcribed → command | legacy | `runtime.ai.voice.subscribe(utterance => runtime.ai.executeIntent(utterance))` | S84 |

#### §16.6.8 Group F.8 — Visibility-Intent / Intent UI (preserved 11-wave verbatim)

The 11-wave VI logic is preserved (per Vision §3 row "Visibility-Intent UI"). Only the wireup changes.

| Sub-phase | Gesture | Today | After | Sprint |
|---|---|---|---|---|
| **F.8.01** | VI panel: open (Visual rail → VG button — already in F.1.59) | done for activate | this PR adds the panel itself | S81 |
| **F.8.02** | VI panel: model categories list | legacy `(window as any).visibilityIntentService.listCategories(viewId)` | `runtime.visibilityIntent.list(viewId)` | S81 |
| **F.8.03** | VI panel: toggle category visibility | legacy | dispatches `runtime.bus.executeCommand('vi.setCategoryVisibility', {viewId, category, visible})` | S81 |
| **F.8.04** | VI panel: edit graphics override (color, lineweight, pattern) | legacy | dispatches `vi.setOverride` | S81 |
| **F.8.05** | OverridePanel (per-element override): open | legacy | `runtime.visibilityIntent.elementOverride(viewId, elementId)` | S81 |
| **F.8.06** | OverridePanel: edit override values | legacy | dispatches `vi.setElementOverride` | S81 |
| **F.8.07** | OverridePanel: "Reset to category" | legacy | `vi.resetElementOverride` | S81 |
| **F.8.08** | DivergedBanner: shown when current view diverges from intent | reads `intentSourceStore` | `runtime.intent.divergence(viewId)` | S81 |
| **F.8.09** | ResetToIntentButton click → revert | legacy | `runtime.intent.resetToIntent(viewId)` | S81 |
| **F.8.10** | HeaderIntentPicker dropdown change | legacy | dispatches `intent.setSource` | S81 |
| **F.8.11** | IntentSourcePill click → tooltip | legacy | reads `runtime.intent.currentSource(viewId)` | S81 |
| **F.8.12** | SourceChainTooltip hover → show chain | legacy | reads `runtime.intent.chain(viewId)` | S81 |
| **F.8.13** | SpineOverrideList: edit | legacy | `runtime.intent.spineOverrides(viewId)` | S81 |

#### §16.6.9 Group F.9 — Data Workbench (15 panels)

Each panel = one sub-phase. Most reduce to "swap legacy global for `runtime.dataWorkbench.<X>`".

| Sub-phase | Panel | After | Sprint |
|---|---|---|---|
| **F.9.01** | DataWorkbench orchestrator (panel switch) | `runtime.dataWorkbench.activePanel.set(id)` | S82 |
| **F.9.02** | HierarchyTreePanel: paint + click row + filter | `runtime.dataWorkbench.hierarchy` | S82 |
| **F.9.03** | NLQueryPanel: type query → run → results | `runtime.dataWorkbench.nl.query(text, ctx)` | S82 |
| **F.9.04** | NLQueryPanel: click result row → focus element | `runtime.selection.select(...)` | S82 |
| **F.9.05** | SpatialQueryPanel: build query → run | `runtime.dataWorkbench.spatial.query(predicate)` | S82 |
| **F.9.06** | RelationshipExplorerPanel: explore | `runtime.dataWorkbench.relationships(elementId)` | S82 |
| **F.9.07** | AnalyticsPanel: chart type / metric / dimension change | `runtime.dataWorkbench.analytics(query)` | S82 |
| **F.9.08** | DataSheetPanel: cell edit | `runtime.bus.executeCommand('dataSheet.setCell', ...)` | S82 |
| **F.9.09** | DesignHistoryPanel: scrub timeline | `runtime.persistence.eventLog.replayUntil(eventId)` (preview mode) | S82 |
| **F.9.10** | DesignHistoryPanel: click event → focus elements changed | `runtime.selection.select(eventTouched(eventId))` | S82 |
| **F.9.11** | ProgrammePanel: phase row edit | dispatches `programme.setPhase` | S82 |
| **F.9.12** | PhysicsPanel: param change | dispatches `physics.setParam` | S82 |
| **F.9.13** | CompliancePanel: rule toggle / run check | `runtime.compliance.runChecks(scope)` | S82 |
| **F.9.14** | PortfolioQueryPanel: cross-project query | `runtime.dataWorkbench.portfolio.query(...)` | S82 |
| **F.9.15** | TemplateEditorPanel: edit template | dispatches `template.set` | S82 |
| **F.9.16** | SyncStateDetailDrawer: open / inspect | `runtime.sync.client.diagnostics()` | S82 |

#### §16.6.10 Group F.10 — Rendering controls (10 panels)

Each panel = one sub-phase wired to `runtime.scene.renderer.*`.

| Sub-phase | Panel | After | Sprint |
|---|---|---|---|
| **F.10.01** | RenderPanel: quality preset (low/medium/high) | `runtime.scene.renderer.setQuality(preset)` | S81 |
| **F.10.02** | RenderPanel: post-fx toggles (TRAA, SSGI, Bloom) | `runtime.scene.renderer.setPostFx(name, enabled)` | S81 |
| **F.10.03** | PerformanceModePanel: live perf monitor | reads `runtime.scene.renderer.metrics()` | S81 |
| **F.10.04** | RealSunControl: drag sun angle | `runtime.scene.renderer.setSunAngle(deg)` | S81 |
| **F.10.05** | RenderGallery: list snapshots | `runtime.persistence.client.renders.list(projectId)` | S81 |
| **F.10.06** | RenderGallery: click snapshot → enlarge | local UI | S81 |
| **F.10.07** | RenderQueuePanel: list active jobs | `runtime.scene.renderer.queue.list()` | S81 |
| **F.10.08** | RenderQueuePanel: cancel job | `runtime.scene.renderer.queue.cancel(jobId)` | S81 |
| **F.10.09** | PanoramaPanel: capture pano | `runtime.scene.renderer.capturePanorama({preset})` | S81 |
| **F.10.10** | WalkthroughPanel: define path → record | dispatches `walkthrough.recordPath` | S81 |
| **F.10.11** | WalkthroughPanel: play | `runtime.scene.renderer.playWalkthrough(id)` | S81 |
| **F.10.12** | VideoExportPanel: export settings → render | `runtime.scene.renderer.exportVideo({...})` | S81 |
| **F.10.13** | ExportStudioPanel: composite export | `runtime.scene.renderer.exportStudio({...})` | S81 |
| **F.10.14** | VisualizationEnginePanel: switch engine (real-time / pathtrace) | `runtime.scene.renderer.setEngine(engine)` | S81 |

#### §16.6.11 Group F.11 — Modals + utilities

| Sub-phase | Gesture | After | Sprint |
|---|---|---|---|
| **F.11.01** | WelcomeModal "Take tour" button | local UI; emits `runtime.events.emit('tour.start')` | S82 |
| **F.11.02** | UpgradeModal "Upgrade now" button | navigates to PricingPage | S82 |
| **F.11.03** | ContactSalesModal submit | POST via `runtime.persistence.client.sales.submit({...})` | S82 |
| **F.11.04** | ShortcutCheatSheet open (?) | reads `runtime.hotkeys.list()` | S82 |
| **F.11.05** | UiPreferences open / change (already in C.9) | done | — |
| **F.11.06** | ConfirmDialog: confirm/cancel | static (no engine touch) | S82 |
| **F.11.07** | ColourPalette open / pick (used inside override panels) | local + emits via runtime | S82 |
| **F.11.08** | UnderlayScaleHUD: drag scale handle | dispatches `runtime.bus.executeCommand('underlay.setScale', ...)` | S83 |
| **F.11.09** | AnnotationInputPanel (text input during annotation drawing) | `runtime.tools.activeOverlay()` for annotation tool | S83 |
| **F.11.10** | StairLevelRequiredPanel: pick level | `runtime.stores.level.list()` + sets pending stair config | S83 |
| **F.11.11** | StairSetupPanel: configure run + tread + riser | dispatches `stair.create` with config | S83 |
| **F.11.12** | OwnerFeatureFlags: toggle (already in C.9) | done | — |

#### §16.6.12 Group F.12 — Plugin / Marketplace + IFC + Rhino + Component Editor

| Sub-phase | Gesture | After | Sprint |
|---|---|---|---|
| **F.12.01** | Marketplace icon click → marketplace panel mounts | `runtime.plugins.marketplace.list()` | S84 |
| **F.12.02** | Marketplace: filter / search | local on catalog | S84 |
| **F.12.03** | Marketplace: click "Install" on plugin card → confirm permissions | `runtime.plugins.installFromUrl(manifestUrl)` after permission grant | S84 |
| **F.12.04** | Marketplace: click "Uninstall" on installed plugin | `runtime.plugins.uninstall(pluginId)` | S84 |
| **F.12.05** | Marketplace: plugin settings panel for installed plugin | per-plugin contributions | S84 |
| **F.12.06** | IFC Import panel: drag-and-drop .ifc file | `runtime.ifc.import.start(file)` | S84 |
| **F.12.07** | IFC Import panel: progress + preview | `runtime.ifc.import.subscribe(jobId, ...)` | S84 |
| **F.12.08** | IFC Import: "Open" → mount imported elements | dispatches batch into `runtime.bus` | S84 |
| **F.12.09** | IFC Inspector panel (PSet editor): browse PSets | `runtime.ifc.inspector.psets(elementId)` | S84 |
| **F.12.10** | IFC Inspector: edit PSet value | dispatches `ifc.setPsetValue` | S84 |
| **F.12.11** | IFC Export: Export menu → options → run | `runtime.ifc.export.run({scope, schema})` | S84 |
| **F.12.12** | BCF panel: list issues | `runtime.bcf.list(projectId)` | S84 |
| **F.12.13** | BCF panel: create issue at viewpoint | `runtime.bcf.create({viewpoint, title, body})` | S84 |
| **F.12.14** | BCF panel: click issue → restore viewpoint | `runtime.bcf.restoreViewpoint(issueId)` | S84 |
| **F.12.15** | BCF panel: comment / status change | dispatches `bcf.comment / bcf.setStatus` | S84 |
| **F.12.16** | DXF Import: drag-and-drop .dxf | `runtime.dxf.import.start(file)` | S84 |
| **F.12.17** | DXF Export: Export menu | `runtime.dxf.export.run(...)` | S84 |
| **F.12.18** | Rhino Import: drag-and-drop .3dm | `runtime.rhino.import.start(file)` | S84 |
| **F.12.19** | PDF underlay: drag-and-drop .pdf | dispatches `underlay.import` | S84 |
| **F.12.20** | Component Editor: open as separate pane | `runtime.componentEditor.open(componentId)` | S84 |

### §16.7 Phase G — Mass deletions (S82–S86, 9 sub-phases)

Each deletion is its own PR. Each waits on its dependencies (last-consumer migration). The PR title is `[G.<n>] DELETE <directory>`.

| Sub-phase | Deletion | Depends on | Sprint |
|---|---|---|---|
| **G.1** | DELETE `src/engine/` | D.1–D.8 done | S82 |
| **G.2** | DELETE `src/elements/<family>/` for each family | E.1–E.14 done | S78–S81 (rolled into each E sub-phase) |
| **G.3** | DELETE `src/commands/` | E.* done + F.* done | S84 |
| **G.4** | DELETE `src/services/` (legacy services like BimService) | D.* + E.* done | S84 |
| **G.5** | DELETE `src/ai/` (legacy AI client) | F.7.* done | S84 |
| **G.6** | DELETE `src/api/` (legacy `apiFetch` wrapper) | C.* done | S84 |
| **G.7** | DELETE `src/history/UndoManager.ts` | C.6.02–03 done | S84 |
| **G.8** | DELETE `apps/editor/src/main.ts:mountEditor()` (the dark mount fn body; the bootstrap.everything.ts stays as the data half) | D.1 done | S82 |
| **G.9** | Audit + delete remaining `legacy/` shims (any `legacy/` directories created during migration) | all F.* done | S86 |

### §16.8 Phase H — Lock-in (S85–S87, 7 sub-phases)

Lint flips and bench hard-fail flips. **Each is one PR.**

| Sub-phase | Action | Sprint |
|---|---|---|
| **H.1** | Flip `eslint-plugin-pryzm/no-window-as-any` from WARN to ERROR (zero cast sites must remain in `src/ui/`, `packages/`, `apps/`) | S85 |
| **H.2** | Land `eslint-plugin-pryzm/no-second-canvas` rule (only `Renderer.ts` + `composeRuntime.ts` may call `document.createElement('canvas')`) | S85 |
| **H.3** | Land `eslint-plugin-pryzm/single-raf` rule (only `packages/frame-scheduler/` may call `requestAnimationFrame`) | S85 |
| **H.4** | Land `eslint-plugin-pryzm/no-runtime-package-import` rule (`src/ui/` may only import `@pryzm/runtime-composer/types`, not the individual packages) | S85 |
| **H.5** | Land `eslint-plugin-pryzm/no-second-ui` rule (no imports from `apps/editor/src/projects/` outside the editor app) | S85 |
| **H.6** | Flip every UI bench in `apps/bench/src/benches/ui/` from `warn` to `hardFail: true` simultaneously (all 60 benches) | S86 |
| **H.7** | Land visual-diff CI baseline (`apps/bench/visual-diff/`); SSIM > 2 px or pixel-diff > 0.05 % fails the build | S87 |

### §16.9 Cross-cutting — gestures NOT yet enumerated above (catch-all sweep)

The above tables enumerate **every gesture I have evidence for in the current `src/ui/`**. To prevent any forgotten gesture from inheriting a legacy wire, this sub-phase runs in S87 (Phase H D-final week):

| Sub-phase | Action |
|---|---|
| **H.8** | Audit script `apps/bench/scripts/list-gestures.mjs` walks every `addEventListener('click' \| 'mousedown' \| 'keydown' \| 'dragstart' \| ...)` site in `src/ui/`, every `onclick=` in template strings, every `(window as any).<name>(` callsite, every hotkey registration. Outputs `gesture-coverage.json`. |
| **H.9** | Cross-references `gesture-coverage.json` against this §16's sub-phase IDs. Any gesture not assigned to a sub-phase **fails the GA gate**. The PR closing the gap is its own sub-phase (named `H.9.<n>`). |
| **H.10** | Final assertion: `cast-site count == 0` AND `gesture-coverage.unassigned == 0` AND `bench/ui/* hardFail == true for all` AND `visual-diff CI green`. **GA cut.** |

### §16.10 Sub-phase count and PR cadence summary

| Phase | Sub-phases | Sprints | Avg PRs/sprint |
|---|---:|---|---:|
| A | 7 | S73 (1) | 7 |
| B | 40 | S73–S75 (3) | 13 |
| C | 35 | S74–S76 (3) | 12 |
| D | 14 | S75–S77 (3) | 5 |
| E | 14 | S76–S80 (5) | 3 |
| F.1 (toolbar.discipline) | 65 | S78–S81 (4) | 16 |
| F.2 (inspector.element) | 19 | S81–S83 (3) | 6 |
| F.3 (modal.creation) | 15 | S82–S83 (2) | 8 |
| F.4 (menu.context + radial) | 8 | S83 (1) | 8 |
| F.5 (bottom strip) | 32 | S83 (1) | 32 |
| F.6 (left rail content) | 27 | S81–S83 (3) | 9 |
| F.7 (AI) | 16 | S83–S84 (2) | 8 |
| F.8 (VI / Intent) | 13 | S81 (1) | 13 |
| F.9 (Data Workbench) | 16 | S82 (1) | 16 |
| F.10 (rendering) | 14 | S81 (1) | 14 |
| F.11 (modals) | 12 | S82–S83 (2) | 6 |
| F.12 (marketplace + IFC + Rhino + DXF + BCF + ComponentEditor) | 20 | S84 (1) | 20 |
| G | 9 | S82–S86 (5; rolled into E + late F) | 2 |
| H | 10 | S85–S87 (3) | 4 |
| **Total** | **~386 sub-phases** | **15 sprints** | **~26 PRs/sprint** |

**~386 sub-phases / ~26 PRs per sprint with 2 engineers** is realistic for a refactor of this granularity. Every PR is small (one engineer-day), reviewable, and reverts cleanly. The CI bench gate prevents any PR from regressing — the refactor cannot stall the product.

### §16.11 Why this granularity matters

The user asked "I want a phase and sub phase plan for every single UI UX click interaction and all mapped to the new architecture. This is critical, otherwise we will be absorbing still legacy code." Here is why §16 satisfies that:

1. **No PR can land two gestures at once.** If gesture X and gesture Y share legacy code path Z, the second PR to migrate (say Y) must delete Z — there is no "share" path that lets Z live on as a legacy bridge.
2. **No gesture can be forgotten.** The H.8–H.10 catch-all sweep enumerates every event listener, hotkey, and global call site in `src/ui/` and asserts every one has a sub-phase ID. Any orphan blocks GA.
3. **Each sub-phase has a bench.** When a PR claims to migrate gesture X, the bench it lands measures latency on the new wire. CI rejects regressions.
4. **The legacy file deletion is in the same PR as the last-consumer gesture migration.** This is the §16.0 acceptance rule #3. There is no separate "cleanup PR" that can be deprioritised — the deletion IS the migration.
5. **The lint count is monotonic-non-increasing per PR.** Every PR that touches `src/ui/` either decreases the `(window as any)` count or holds it. Any PR that increases the count is rejected by CI.
6. **The visual-diff CI prevents the migration from changing pixels.** The white UI looks identical at the end of every PR.

These six gates together make it physically impossible for legacy code to survive a Phase F PR while the gesture it serviced has been "migrated". The §16 plan is the operator's contract that the refactor finishes — every gesture is named, every gesture has a destination, every gesture has a CI gate, and no two gestures can hide together.

---

## §15 Summary — what was added in S72 D-final replan

This document at S72 D-final stands as the binding wireup for PRYZM 2's GA. Beyond v1's bridge proposal (retracted) and the v2 8-phase plan (§4), it now contains:

1. **§11 — Click-trail wireups** (17 user gestures end-to-end, file:line accurate).
2. **§12 — Complete UI inventory** (every one of the 220 files in `src/ui/` mapped to category, runtime path, phase, bench).
3. **§13 — UI-interaction perf bench suite** (60 new benches in `apps/bench/src/benches/ui/` covering click-to-paint, panel mount, scroll fps, inspector update, cold mount, idle CPU, bundle size for the UI chunk specifically — closing the headless-only gap in the existing bench tree).
4. **§14 — Vision conformance check** (every Vision principle, NFT, layer, differentiator, and non-goal ticked against this plan with delivery phase + CI gate; every cross-document conflict resolved).
5. **§16 — Granular sub-phase plan** (~386 sub-phases across 15 sprints, S73–S87; every individual click, drag, hotkey, dropdown, right-click context-menu item, modal submit in `src/ui/` is its own numbered sub-phase = its own PR = its own bench). The H.8–H.10 catch-all sweep enumerates every event listener and global call site in `src/ui/` and asserts every one is assigned to a sub-phase ID before GA gates open. **No legacy code can ride along under the umbrella of "Phase F is done"** — each gesture migration deletes the legacy code path it serviced in the same PR.

The contract is now end-to-end:
- Operator intent → §1.
- Audit → §2.
- Architecture → §3.
- Phases → §4.
- Deletions → §5.
- UI preservation → §6.
- Risks → §7.
- Issues → §8.
- Decisions → §9.
- "Done" → §10.
- Click trails → §11.
- UI inventory → §12.
- UI perf benches → §13.
- Vision conformance → §14.
- Per-gesture sub-phase plan → §16.

Every word of `08-VISION.md` survives. Every word of `06-PRYZM-IDENTITY-AND-RECOUNT.md` survives. Every UI surface the operator trained on stays. Every L0–L7.5 capability is reachable through one typed handle. Every UI gesture has a measurable budget enforced in CI. Every UI gesture has a named sub-phase ID, a named PR, a named bench, and a named legacy-deletion gate. The 36-month rebuild ends as a refactor at the boundary, not a rewrite of the customer's eyes — and the refactor cannot stall halfway, because every gesture is independently shippable, independently revertible, and independently verifiable.

---

*If this document conflicts with `S71 §4.1`, `§4.2`, `§4.4`, or `§4.7`, this document wins. The v1 draft of this same document (the @pryzm/legacy-bridge proposal) is retracted in full. Where this document amends `09-AS-IS-VS-TO-BE.md` §3 row 4 (initUI/Layout deletion), the amendment is the §6 + §14.6 statement: `src/ui/Layout.ts` is preserved as the white-UI orchestrator, threaded with `runtime` in Phase B.*
