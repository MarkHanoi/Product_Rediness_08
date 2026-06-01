# §3  Runtime architecture — the typed contract src/ui/ binds to

> Part of [PRYZM2-WIREUP-PLAN-S72](./00-INDEX.md). Source slice of [PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md](../00-PLAN.md) lines 170–392.

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

