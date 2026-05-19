# `@pryzm/engine` — Public API Surface Audit

> **Sprint F-2.1 · 2026-05-15 · rev 104**
> Roadmap: `docs/03_PRYZM3/04-PLAN-FORWARD/51-POST-EXTRACTION-ROADMAP.md §Phase F-2`

---

## Purpose

This document records the Sprint F-2.1 audit of `apps/editor/src/engine/` to identify
which symbols constitute the **public API surface** — the types and functions that
consumers (UI panels, plugins, headless harness) import from the engine layer.

The interfaces defined in `packages/engine/src/` are the canonical contracts.
Concrete implementations remain in `apps/editor/src/engine/` until Sprints F-2.2–F-2.5
extract them.

---

## Engine directory inventory (`apps/editor/src/engine/`)

| File | LOC (approx) | Public exports | Sprint |
|---|---:|---|---|
| `engineLauncher.ts` | 370 | `bootstrap()` | F-2.1 |
| `EngineContext.ts` | 55 | `EngineContext` interface | F-2.2 |
| `BimService.ts` | 230 | `BimService` class | F-2.2 |
| `ViewController.ts` | 1,100+ | `ViewController`, `ViewType` | F-2.3 |
| `CommandRegistry.ts` | 40 | `CommandRegistry` object | F-2.2 |
| `initScene.ts` | 900+ | `SceneResult`, `initScene()` | F-2.2 |
| `initTools.ts` | 250 | `ToolsParams`, `ToolsResult`, `initTools()` | F-2.2 |
| `initUI.ts` | 1,700+ | `UIParams`, `initUI()` | F-2.4 |
| `initBuilders.ts` | — | internal (no public consumers outside engine) | F-2.2 |
| `initBusHandlers.ts` | — | internal | F-2.2 |
| `initBatchLifecycle.ts` | — | internal | F-2.2 |
| `initAnnotationTools.ts` | — | internal | F-2.2 |
| `initCollaboration.ts` | — | internal | F-2.2 |
| `initDataPlatform.ts` | — | internal | F-2.2 |
| `initFurnitureInteraction.ts` | — | internal | F-2.2 |
| `initPersistence.ts` | — | internal | F-2.2 |
| `initStores.ts` | — | internal | F-2.2 |
| `initTransformControllers.ts` | — | internal | F-2.2 |
| `initViewpointsPanel.ts` | — | internal | F-2.4 |
| `initViewSetup.ts` | — | internal | F-2.3 |
| `initWallLevelSubscribers.ts` | — | internal | F-2.2 |
| `registerTransformDragHandler.ts` | — | internal | F-2.2 |
| `RemoteCommandDispatcher.ts` | — | internal | F-2.2 |
| `UnderlayPersistence.ts` | — | internal | F-2.2 |
| `WallPerfBench.ts` | — | internal | F-2.2 |
| `WallRebuildCoordinator.ts` | — | internal | F-2.2 |
| `views/` | — | `PlanViewService`, `SectionViewService` | F-2.3 |
| `inspect/` | — | `InspectModeCoordinator` | F-2.4 |
| `persistence/` | — | storage adapters | F-2.2 |
| `preview/` | — | `PreviewManager` | F-2.4 |

---

## Contracts defined (F-2.1 + F-2.2)

| Contract | Sprint | File | Consumers |
|---|---|---|---|
| `ViewType` | F-2.1 | `src/types/ViewType.ts` | `ViewController`, `initUI`, plugins via toolbar |
| `ViewMode` | F-2.1 | `src/types/ViewType.ts` | `ViewController`, `ViewPropertiesPanel`, plan/section view |
| `IViewController` | F-2.1 | `src/types/IViewController.ts` | `initUI`, `PropertyPanelAdapter`, plugins |
| `IViewSwitchListener` | F-2.1 | `src/types/IViewController.ts` | `PostProcessingManager`, `PlanViewVisibilityCuller` |
| `IBimService` | F-2.1 | `src/types/IBimService.ts` | toolbar buttons, headless test harness |
| `ISelectionManager` | F-2.1 | `src/types/ISelectionManager.ts` | `PropertyPanelAdapter`, plugins via `window.selectionManager` |
| `ISelectionBoundsRegistry` | F-2.1 | `src/types/ISelectionManager.ts` | plugins that register custom highlight builders |
| `EngineBootstrapFn` | F-2.1→F-2.2 | `src/types/EngineBootstrapFn.ts` | `src/main.ts` dynamic import, headless harness. F-2.2: `runtime` tightened `unknown` → `PryzmRuntime \| null` |
| `IEngineContext` | F-2.2 | `src/types/IEngineContext.ts` | subsystem initializers; heavy renderer fields typed `unknown` until F-2.4 |

---

## Sprint F-2.3 deliverables (2026-05-15)

`@pryzm/views` package created at `packages/views/` with three interface files:

| Contract | File | Implements |
|---|---|---|
| `ISectionViewService` | `src/types/ISectionViewService.ts` | `SectionViewService` ✅ |
| `SectionConfig` | same | re-export of concrete config shape |
| `Vector3Like` | same | structural match for `THREE.Vector3` |
| `IPlanViewManager` | `src/types/IPlanViewManager.ts` | `PlanViewManager` ✅ |
| `ISplitViewManager` | `src/types/ISplitViewManager.ts` | `SplitViewManager` ✅ |

Heavy renderer types (`PlanViewCanvas`, `EdgeProjectorService`, `UnifiedFrameLoop`) typed
`unknown` at F-2.3; will be narrowed to their concrete types in Sprint F-2.4.

---

## Sprint F-2.4 deliverables (2026-05-15)

`@pryzm/editor-ui` package created at `packages/editor-ui/` with four interface files:

| Contract | File | Implements |
|---|---|---|
| `IInspectModeCoordinator` | `src/types/IInspectModeCoordinator.ts` | `InspectModeCoordinator` (structural) |
| `IPreviewManager` | `src/types/IPreviewManager.ts` | `PreviewManager` (structural) |
| `ElementSchema` | `src/types/IPreviewManager.ts` | proposed-element descriptor |
| `IDataWorkbench` | `src/types/IDataWorkbench.ts` | `DataWorkbench` ✅ (`implements` clause added) |
| `WorkbenchMode` | `src/types/IDataWorkbench.ts` | string union re-export |
| `WorkbenchTabId` | `src/types/IDataWorkbench.ts` | string alias |
| `IInitUIParams` | `src/types/IInitUI.ts` | `initUI.ts` `UIParams` shape (dep-free version) |
| `InitUIFn` | `src/types/IInitUI.ts` | `initUI` async function type |

**`IEngineContext` narrowing (F-2.4):**
- `dataWorkbench: unknown` → `dataWorkbench: IDataWorkbench` — using the new `@pryzm/editor-ui` package.
- `@pryzm/editor-ui: workspace:*` added as a dependency of `@pryzm/engine`.
- All editor-ui contracts re-exported through the `@pryzm/engine` barrel so consumers have a single import point.

Heavy renderer types (`world`, `components`, `postproductionRenderer`, `pryzmRenderer`) remain
`unknown` at F-2.4; will be narrowed in Sprint F-2.5 when `@thatopen/components` and Three.js
are added as peer dependencies.

---

## Sprint F-2.6 deliverables (2026-05-15)

Per-package compile gate implemented and passing for all three contracts packages.
`implements` clauses added to all remaining concrete classes.

### Implements clauses (F-2.6 stamp)

| Interface | Concrete class | Status |
|---|---|---|
| `IViewController` | `apps/editor/src/engine/ViewController.ts` | ✅ F-2.3 |
| `ISectionViewService` | `apps/editor/src/engine/views/SectionViewService.ts` | ✅ F-2.3 |
| `IPlanViewManager` | `apps/editor/src/engine/views/PlanViewManager.ts` | ✅ F-2.3 |
| `ISplitViewManager` | `apps/editor/src/engine/views/SplitViewManager.ts` | ✅ F-2.3 |
| `IBimService` | `apps/editor/src/engine/BimService.ts` | ✅ F-2.2 |
| `IDataWorkbench` | `apps/editor/src/ui/dataworkbench/DataWorkbench.ts` | ✅ F-2.4 |
| `ISelectionManager` | `packages/input-host/src/SelectionManager.ts` | ✅ F-2.6 |
| `IInspectModeCoordinator` | `apps/editor/src/engine/inspect/InspectModeCoordinator.ts` | ✅ F-2.6 |
| `IPreviewManager` | `apps/editor/src/engine/preview/PreviewManager.ts` | ✅ F-2.6 |

### Per-package typecheck gate

| Package | tsconfig.json | Status |
|---|---|---|
| `@pryzm/editor-ui` | `packages/editor-ui/tsconfig.json` | ✅ passes |
| `@pryzm/engine` | `packages/engine/tsconfig.json` | ✅ passes |
| `@pryzm/views` | `packages/views/tsconfig.json` | ✅ passes |

Validation script: `node scripts/check-package-types.mjs`
`packages/tsconfig.references.json` updated to reference `editor-ui`, `engine`, `views`.

---

## Extraction sequence (F-2.2 → F-2.5)

### Sprint F-2.2 — Extract `engine/commands/` → `@pryzm/commands`
- Move `CommandRegistry.ts`, `BimService.ts`, all `init*.ts` files except UI-init
- Move `initScene.ts`, `EngineContext.ts`
- Convert `apps/editor/src/engine/` to a thin re-export shim for backwards compat

### Sprint F-2.3 — Extract `engine/views/` → `@pryzm/views`
- Move `ViewController.ts`, `views/PlanViewService.ts`, `views/SectionViewService.ts`
- Implement `IViewController` on the moved `ViewController` class
- Implement `IViewSwitchListener` protocol in `PostProcessingManager`

### Sprint F-2.4 — Extract `src/ui/` → `@pryzm/editor-ui`
- Move `initUI.ts`, `inspect/`, `preview/`, `initViewpointsPanel.ts`
- Implement `IBimService` on the moved `BimService` class

### Sprint F-2.5 — Update all import paths; per-package compile gate
- Update all `@app/engine/...` + `apps/editor/src/engine/...` imports to `@pryzm/engine/...`
- `apps/editor/src/engine/` becomes empty; directory deleted
- Every package in `packages/engine/` sub-tree passes `tsc --noEmit` independently

---

## Dependencies (F-2.1 baseline — types-only, no runtime deps)

| From | To | Reason |
|---|---|---|
| `@pryzm/engine` | (none) | This package has NO runtime dependencies at F-2.1. All interfaces use `unknown` for library-typed parameters to stay dependency-free. |

Future sprints will add:
- `@pryzm/input-host` (for concrete `SelectionManager` bound to `ISelectionManager`)
- `@pryzm/runtime-composer` (for `PryzmRuntime` in `EngineBootstrapFn`)
- `@thatopen/components` (for `OBC.View` in `IViewController.activate()`)
- `three` (for `THREE.Object3D` in `ISelectionManager.applyHighlight()`)

---

## Open questions (carry forward to F-2.2)

1. **`EngineContext` visibility** — currently marked "engine-layer only; never imported by UI layer".
   F-2.2 must decide whether `EngineContext` becomes a public `@pryzm/engine` type or
   stays private (internal to the package, not re-exported from `index.ts`).

2. **`initUI.ts` split** — at 1,700+ LOC, `initUI.ts` is a god-file candidate.
   F-2.4 should split it into logical sub-modules before migration.

3. **`ViewController` / `BimService` global side-effects** — both write to `window.*`
   globals. F-2.2 must audit these writes and route them through `PryzmRuntime` slots
   or explicit DI before the files can move to a package.
