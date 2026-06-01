# C02 — Composition Root & Boot

> **Stamp**: 2026-05-02 · **Status**: CANONICAL  
> **Scope**: `composeRuntime()`, the `PryzmRuntime` interface, the three boot stages, and runtime disposal.  
> **Key principles**: P1 (single composition root), P3 (single rAF), P4 (no `window as any`).  
> **Owner package**: `packages/runtime-composer/` (L3, 3,912 LOC).

---

## §1 — The Composition Root Contract

There is exactly **one** `composeRuntime()` function in the entire codebase. It lives in `packages/runtime-composer/src/composeRuntime.ts`. No other file MAY construct a `PryzmRuntime`.

### §1.1 — Input type

```ts
export interface ComposeRuntimeInput {
  readonly persistence:  PersistenceClient;   // required
  readonly sync?:        SyncClient;          // optional — omit in headless
  readonly renderer?:    RendererHandle;      // optional — omit in headless
  readonly registries?:  PluginRegistries;    // optional — omit in tests
}
```

### §1.2 — Output type (the `PryzmRuntime` handle)

```ts
export interface PryzmRuntime {
  readonly events:           EventBus;
  readonly commandBus:       CommandBus;
  readonly commandRegistry:  CommandRegistry;
  readonly viewRegistry:     ViewRegistry;
  readonly workspace:        WorkspaceController;
  readonly cameraController: CameraController;
  readonly scheduler:        FrameScheduler;
  readonly persistence:      PersistenceClient;
  readonly sync?:            SyncClient;
  readonly renderer?:        RendererHandle;
  readonly materialPool?:    MaterialPool;
  readonly visibility:       VisibilityRuntime;
  readonly physics:          PhysicsHost;
  readonly input:            InputHost;
  readonly disposables:      DisposableSet;
  dispose(): void;
}
```

**14 typed slots. No `unknown`. No `any`. No `(window as ...)` reads.** Any slot that is `unknown` is a bug tracked in `03-CURRENT-STATE.md §1`.

### §1.3 — Invariants

- `composeRuntime()` MUST be called exactly once per application session.
- It MUST return a fully initialised `PryzmRuntime` synchronously, or throw.
- It MUST register all plugin contributions passed via `registries` before returning.
- It MUST NOT read from `window` directly; typed globals live in `src/types/global-window.d.ts`.
- After `dispose()` is called, all subscriptions MUST be torn down and the handle MUST NOT be used again.

---

## §2 — The Three Boot Stages

The production startup flow is divided into three immutable architectural stages. **Stage 0 and Stage 2 are permanent features; only Stage 1 reshapes through Phase D/E.**

### Stage 0 — App-Shell First Paint (< 100 ms)

- Delivered by inline `<style>` + `<script>` in `index.html`.
- Paints navbar + hero skeleton before any module script runs.
- The inline `<script>` MUST: check `localStorage` for auth state, hide the skeleton for signed-in users, and populate `window.__pryzmPendingActions` to replay pre-boot CTA clicks.
- **No JS module resolution occurs during Stage 0.** This stage MUST survive any engine refactor.
- Measured by NFT 1: cold-boot to first paint < 2.5 s on M1 / Chrome.

### Stage 1 — Runtime Composition + Shell Mount

- Entry point: `src/main.ts` → `bootPlatform()`.
- MUST call `composeRuntime({...})` and obtain a `PryzmRuntime`.
- MUST call `platformRouter.start({ runtime })` to mount the landing page or project hub.
- After Phase D complete: all 14 runtime slots are typed; no `WorkspaceMountBridge`; no `(window as any)`; no separate Phase B deferred wiring.
- `PlatformRouter` MUST remove the Stage 0 skeleton in both signed-in and signed-out branches.

### Stage 2 — Engine Init (lazy; only on project-open)

- Triggered by `runtime.persistence.openProject(id)`.
- Brings up `packages/renderer-three/` and the full viewport pipeline.
- **MUST NOT execute before the user opens a project** (§01 §1.1 deferred boot contract).
- `src/engine/EngineBootstrap.ts` is **permanently deleted** (S87-WIRE, 2026-05-01 ✅). The `pryzm/no-engine-bootstrap-shim` ESLint rule guards against regression.

---

## §3 — Runtime Hand-off Rules

- The runtime handle MUST flow through function arguments or React context. It MUST NOT be stored on `window` (except the transitional `window.__pryzm2RuntimeComposed` which is removed at Wave 4 exit).
- Plugins receive the runtime through their host proxy (see C07). They MUST NOT receive the full `PryzmRuntime`; they get only the curated `PluginHost` subset.
- Any module that needs a runtime slot MUST receive it as a constructor or factory argument, not by importing from a global singleton.

---

## §3.1 — F.events Bootstrap Invariant (migration-phase bridge)

> **Added**: 2026-05-17, REGRESSION-DIAGNOSIS.md §6. Governs the F.events migration series (F.events.2c / 2d / 4 / 8 / 9 / 13 / 15 / 16).

During the F.events migration phase, a large number of call sites subscribe and emit via `window.runtime?.events` and dispatch commands via `window.runtime?.bus`. These sites use the typed `Window` augmentation declared in `apps/editor/src/types/globals.d.ts` (lines 150-165).

**Invariant**: `bootstrap()` in `apps/editor/src/engine/engineLauncher.ts` MUST publish the composed `PryzmRuntime` to the typed `window.runtime` slot **before** any F.events-migrated module makes its first `window.runtime?.events?.on/emit()` or `window.runtime?.bus?.executeCommand()` call. Specifically:

1. The assignment `if (runtime) window.runtime = runtime as typeof window.runtime;` MUST be the first statement in `bootstrap()` after parameter validation.
2. It MUST precede the construction of `PropertyPanelAdapter` and all `initXxx()` calls.
3. `flushRuntimeEventListeners()` (from `runtimeEventBridge.ts`) MUST be called after this assignment so deferred pre-boot subscriptions can drain into the live bus.

**Violation consequence**: Any `window.runtime?.X` call site silently no-ops via optional chaining — no error, no warning, no event, no command. This was the root cause of regressions R1–R5 (see `REGRESSION-DIAGNOSIS.md`).

**Migration exit**: This invariant is temporary. When the F.events migration is complete and all sites use injected `runtime.events.on/emit()` (local parameter, never `window.runtime`), the `window.runtime` window slot and this invariant are removed.

---

## §3.2 — F-1.2 Plan-Tool Element Creation Dual-Write Invariant

> **Added**: 2026-05-17, REGRESSION-DIAGNOSIS.md §R1-B. Governs all plan-view element creation tools during the F-1.2 migration window.

During the F-1.2 migration, `commandManager` is the **rendering-authoritative** path for element creation. The `runtime.bus` path writes to the PRYZM3 plugin Immer stores (fire-and-forget). These are two separate store instances — the legacy `WallStore` (subscribed to by `WallRebuildCoordinator`) and the PRYZM3 bus store do **not** sync automatically until the scene-committer (`@pryzm/scene-committer`, L2) is wired for each element type.

**Invariant**: Every plan-view tool handler that creates a BIM element MUST follow the **dual-write** pattern:

1. **Bus write** (fire-and-forget): `window.runtime?.bus?.executeCommand('<type>.create', { id, ... })` — updates the PRYZM3 plugin store.
2. **CommandManager write** (authoritative for rendering): `getCommandManagerBridge()?.execute(new CreateXxxCommand(id, { ... }), window.commandContext)` — updates the legacy store → triggers rebuild coordinators → builds the 3D mesh.

**Reference implementation**: `apps/editor/src/engine/preview/PreviewManager.ts` lines 317–335 (`[F-1.2] Bus dual-write` comment).

**Bus payload requirements**: Bus create payloads MUST match the handler's declared interface. For `wall.create` this is `CreateWallPayload` (`{id, baseLine: [{x,z},{x,z}], height, ...}`), NOT the legacy `{wallId, start, end}` shape.

**Files applying this invariant** (as of 2026-05-17):
- `WallPlanToolHandler._commitWall()` — wall creation + payload format fix
- `CurtainWallPlanToolHandler._commitCurtainWall()` — straight + arc-segment paths
- `StairPlanToolHandler._commitStair()` — uses existing `cm` local reference
- `CopyPlanToolHandler._copyWall()` / `_copyCurtainWall()` — copy path; also corrects bus command name `curtainwall.create` → `curtain-wall.create`

**Violation consequence**: The element appears in the PRYZM3 plugin store (bus path) but the legacy rebuild coordinator is never triggered — no 3D mesh is built, the element is invisible in the 3D scene and absent from the legacy store.

**Migration exit**: Once `@pryzm/scene-committer` is wired for each element type, the `commandManager.execute(...)` dual-write can be removed from each plan tool handler. The bus write alone becomes authoritative.

---

## §3.3 — F-1.2 Wall Baseline Update Dual-Write Invariant

> **Added**: 2026-05-17, REGRESSION-DIAGNOSIS.md §R2 / §R2-B. Governs all wall-baseline mutation paths during the F-1.2 migration window.

**The opening-void problem**: Wall mesh geometry is built by `WallFragmentBuilder` in world space at build time. Each opening void is baked into the geometry vertex buffer at:
```
voidWorldPos = baseLine[0] + opening.offset × wallDir
```
This position is fixed at the time of the last `WallRebuildCoordinator` pass. When a wall moves, `WallRebuildCoordinator` MUST run again with the new `baseLine` so that the void is baked at the correct new world position. `WallRebuildCoordinator` subscribes to `WallStore.update()` / `bim-wall-updated` — the **legacy WallStore** only, not the PRYZM3 bus plugin store.

**Invariant**: Every call site that mutates a wall's `baseLine` MUST follow the **dual-write** pattern:

```ts
// (1) CommandManager — AUTHORITATIVE for WallRebuildCoordinator.
//     Synchronous. Updates legacy WallStore → fires bim-wall-updated →
//     WallRebuildCoordinator rebuilds wall mesh with opening voids at new baseLine.
//     Also adds the command to the undo stack so Ctrl+Z works.
getCommandManagerBridge()?.execute(
    new UpdateWallBaselineCommand({ wallId, newBaseLine, prevBaseLine }),
    window.commandContext,
);
// (2) Bus — PRYZM3 plugin-store parity, fire-and-forget.
//     MUST include _skipBridge: true to prevent UpdateWallBaselineHandler from
//     issuing a second cm.execute() (duplicate undo-stack entry + redundant rebuild).
window.runtime?.bus?.executeCommand('wall.updateBaseline', {
    wallId, newBaseLine, prevBaseLine, _skipBridge: true,
});
```

For the **cascade path** (moved wall carries corner-joined neighbour endpoints), use `CascadeWallBaselineCommand` directly (one undo-stack entry for the whole batch), then `wall.cascadeBaseline` bus call with `_skipBridge: true`. See `MovePlanToolHandler._moveWall()` cascade branch.

**`_skipBridge` mechanism**: `UpdateWallBaselinePayload._skipBridge?: boolean` and `CascadeWallBaselinePayload._skipBridge?: boolean` are honoured by `UpdateWallBaselineHandler` and `CascadeWallBaselineHandler` — if set, the handler returns `{ forward: [], inverse: [] }` immediately without calling `getCommandManagerBridge().execute()`. External callers (AI pipeline, collaborative CRDT sync, IFC importer) that arrive ONLY through the bus do **not** set `_skipBridge`; the bridge runs normally for them.

**Violation consequence**: The wall moves visually (Three.js transform), but the legacy WallStore is not updated → `WallRebuildCoordinator` does not run → opening voids remain baked at the original world-space baseLine → doors and windows appear to move (Three.js scene groups follow) but the void cut in the wall mesh does not → on the next rebuild (triggered by any event), the wall snaps back to its pre-move position because `WallStore.getById().baseLine` was never updated.

**Files applying this invariant** (as of 2026-05-17):
- `apps/editor/src/engine/registerTransformDragHandler.ts` — 3D gizmo wall drag-end
- `apps/editor/src/engine/views/plantools/MovePlanToolHandler.ts` — plan-view single-wall + cascade paths
- `apps/editor/src/engine/views/plantools/AlignPlanToolHandler.ts` — plan-view align path

**Bus handler guard files**:
- `plugins/wall/src/handlers/UpdateWallBaseline.ts` — `_skipBridge` guard
- `plugins/wall/src/handlers/CascadeWallBaseline.ts` — `_skipBridge` guard

**Authoritative contract for hosted elements**: See `docs/02-decisions/contracts/C15-HOSTED-ELEMENT-CONTRACT.md`.

**Migration exit**: When the PRYZM3 plugin Immer store for walls is wired to `WallRebuildCoordinator` (i.e., when the plugin store drives mesh rebuilds directly), the `commandManager.execute(...)` call can be removed from mutation sites. The bus write alone becomes authoritative.

---

## §3.4 — F-1.3 Level Addition Dual-Write Invariant

> **Added**: 2026-05-17, REGRESSION-DIAGNOSIS.md §R7. Governs all `level.add` call sites during the F-1.3 migration window.

### Background — why bus-only fails for level.add

`AddLevelCommand.execute()` is **synchronous** and writes to `bimManager`, `wallStore`, `slabStore`, and `columnStore` in the same JS call-stack frame. Any call site that fires `level.add` through the async bus and then **immediately** tests `bimManager.getLevels()` (e.g. the `StairLevelRequiredPanel.onRetry` callback → `_ensureTwoLevelsForStair`) will read **stale data** because the Promise has not resolved yet.

Additionally, if `window.runtime` is null at call time OR if `getCommandManagerBridge()` returns null inside the bus handler, the level is **silently lost** with no error visible to the user or developer.

### The R7 failure chain (for reference)

1. User clicks stair tool → `BimService.activateStairPathTool()` → `_ensureTwoLevelsForStair()`.
2. Project has 1 level → `StairLevelRequiredPanel.show()`.
3. User clicks **Add Level**.
4. (Broken) Only bus fired (async) → `onRetry()` called synchronously.
5. `_ensureTwoLevelsForStair()` runs again → `bimManager.getLevels()` = 1 (Promise not yet resolved) → panel re-appears.
6. Level never created; stair tool never activates.

Additionally, the `level.add` bus type in `MiscMutationCommands` declared only `{ name?, elevation? }` — missing `levelId` and `height`. The `initBusHandlers.ts` validator used `cmd.levelId` which TypeScript typed as `never`, and the `AddLevelHandler` in `plugins/stair` called `new AddLevelCommand(cmd as any)` with `levelId: undefined` → broken level.

### Invariant

Every call site that must create a level AND needs the result synchronously (e.g. before re-checking level count, before activating a tool) MUST follow the **dual-write** pattern:

```ts
// (1) CommandManager — AUTHORITATIVE. Synchronous write to bimManager + legacy stores.
//     bimManager.getLevels() reflects the new level immediately after this line.
commandManager.execute(new AddLevelCommand({
    levelId,           // required — use crypto.randomUUID()
    name,
    elevation,
    height,            // default 3.0 m
}));

// (2) Bus — PRYZM3 plugin-store parity, fire-and-forget.
//     _skipBridge: true prevents the bus handler (initBusHandlers.ts: level.add)
//     and the stair-plugin AddLevelHandler from issuing a second commandManager.execute()
//     for the same levelId, which would be rejected by AddLevelCommand.canExecute()
//     ("Level ID already exists").
window.runtime?.bus?.executeCommand('level.add', {
    levelId, name, elevation, height, _skipBridge: true,
})?.catch(console.error);
```

### _skipBridge mechanism for level.add

Both `initBusHandlers.ts` (`fn: (cmd) => { if ((cmd as any)._skipBridge) return; ... }`) and `plugins/stair/src/handlers/AddLevel.ts` (`if (cmd._skipBridge) return { ... }`) honour `_skipBridge`. External callers that arrive through the bus without a prior `commandManager.execute()` (AI pipeline, sync-server CRDT replay, IFC importer) do **not** set `_skipBridge`; the handler bridge runs normally for them.

### `level.add` bus type completeness

`MiscMutationCommands['level.add']` in `packages/command-bus/src/commands.ts` MUST declare all fields forwarded to `AddLevelCommand`:
```ts
'level.add': { levelId: string; name?: string; elevation?: number; height?: number; _skipBridge?: boolean };
```
Any addition to `AddLevelPayload` MUST be reflected here. The validate function in `initBusHandlers.ts` checks `!cmd.levelId` (required field guard) and will fail silently if `levelId` is not in the type.

**Files applying this invariant** (as of 2026-05-17):
- `apps/editor/src/ui/StairLevelRequiredPanel.ts` — "Add Level" button handler (`_ensureTwoLevelsForStair` prerequisite panel)
- `apps/editor/src/engine/views/PlanViewToolOverlay.ts` — `_handleCreateLevel()` (3D-view in-canvas level button)

**Files with `_skipBridge` guard**:
- `apps/editor/src/engine/initBusHandlers.ts` — `level.add` fn guard
- `plugins/stair/src/handlers/AddLevel.ts` — `AddLevelHandler` execute guard

**Files with bus-only `level.add` (no immediate re-check — bus alone is acceptable)**:
- `apps/editor/src/ui/tools-panel/panels/GridsLevelsRailPanel.ts` — user-initiated add from rail, no synchronous level-count check follows; no dual-write required here.

**Migration exit**: When `@pryzm/scene-committer` is wired for level creation and the PRYZM3 level store drives all downstream updates, the `commandManager.execute()` call can be removed. The bus write alone becomes authoritative.

---

## §4 — Disposal Contract

When the user closes a project (navigates away or calls `runtime.dispose()`):

1. `DisposableSet.disposeAll()` MUST be called, invoking every registered teardown in reverse registration order.
2. The renderer handle MUST release all WebGL resources.
3. The sync client MUST flush any pending writes and close its WebSocket.
4. The frame scheduler MUST stop the rAF loop.
5. After disposal, calling any method on the `PryzmRuntime` handle MUST throw `DisposedRuntimeError`.

---

## §5 — Headless Mode

`composeRuntime({ persistence })` with no `renderer` or `sync` produces a valid headless runtime. This is the execution context used by `apps/headless/` and by all unit tests that exercise domain logic.

Headless runtime MUST:
- Support all command dispatch and store mutations.
- NOT attempt to access any DOM or WebGL API.
- Pass `packages/runtime-composer/__tests__/headless-boot.test.ts`.

---

## §6 — What is NOT in this contract

- The plugin SDK host proxies → C07.
- The frame scheduler rAF contract → C04.
- How `composeRuntime` obtains a `PersistenceClient` → C05.
- How `PlatformRouter` routes between landing / hub / editor → C06.
