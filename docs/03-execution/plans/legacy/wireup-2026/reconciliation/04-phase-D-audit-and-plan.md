# Phase D — Engine consolidation · Audit + Plan (2026-04-29, **revised p.m.**)

> **Spec**: [`PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md` §16.4](../PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md#§164-phase-d--engine-consolidation-s75s77-14-sub-phases) — 14 sub-phases, D.1–D.14.
> **Tracker claim** ([PROCESS-TRACKER.md §3 line 186+](../../03_STATUS/01-PROCESS-TRACKER.md)): D.1 ✓, D.2 ✓, D.3–D.14 queued.
> **Original verdict** (a.m.): "⚠️ Tracker partly correct. D.1+D.2 confirmed. **Bonus**: D.6+D.7+D.8 partially landed. The 2 035-LOC `EngineBootstrap.ts` (D.4) is the boulder."
> **Revised verdict** (p.m. — after evidence pass): ⚠️ **Tracker partly correct, but the original audit ALSO got several gradings wrong.** Scoring summary:
>   - **D.1, D.2**: ✓ (confirmed in `src/main.ts` headers; kill-switch comment block at `:39–43` documents "removed").
>   - **D.3**: ❌ **NOT done** (audit said "⚠️ Likely landed; verify"). The `?pryzm2=1` URL param is a no-op (D.2 work), but `apps/editor/src/main.ts:mountEditor` (215 LOC dark mount), `apps/editor/vite.pryzm2.config.ts`, `apps/editor/src/router.ts`, the `build:pryzm2` npm script, AND the `#progress` style block in `index.html:53` are all still present. **The dark editor was *neutered*, not *deleted*.**
>   - **D.4**: ❌ confirmed (2 035 LOC; one importer — `src/main.ts:104`).
>   - **D.5**: ⚠️ partial — `init*.ts` files were *moved* to `src/engine/subsystems/` (and grew from 6 → 8 files — `initStores.ts` and `initBuilders.ts` were added). Most have **0 rAF reaches**; only `initScene.ts` has 3.
>   - **D.6, D.8**: ✓ confirmed (legacy files gone from `src/engine/`; new homes in `packages/renderer/`).
>   - **D.7**: ✅ **landed** (audit said "⚠️"). `packages/frame-scheduler/FrameScheduler.ts` + `RafAdapter.ts` exist; `packages/frame-scheduler/src/types.ts:11/38` explicitly cite `src/core/rendering/UnifiedFrameLoop.ts` as **the legacy file to retire**, confirming the canonical new home is `packages/frame-scheduler/`. The 402-LOC `src/core/rendering/UnifiedFrameLoop.ts` is therefore a **leftover** with **13 src/ importers** that needs a separate migration PR — **but the spec target home does exist and is implemented**.
>   - **D.9–D.14**: ❌ confirmed unwired, but the **specific cast inventory in the original audit was wrong** (off by 7 files — see §"D.11–D.12 corrected cast inventory" below).
> 
> **Overall completion**: ~5–6 of 14 sub-phases substantively landed (~40%). The audit's "40% complete" headline is right; the per-sub-phase grading was mixed.

---

## Per-sub-phase verification (re-graded)

| Sub-phase | Spec target | Reality | Status | Evidence |
|---|---|---|---|---|
| **D.1** | Single renderer mount, no DOM swap | ✓ | ✅ | `src/main.ts:160` — `composeRuntime({ canvas: null, … })`; deferred shell pattern documented at `:178–215` |
| **D.2** | `?pryzm2=1` kill-switch + bootHub/bootProject/bootPryzm2/mountMinimumChrome (~370 LOC) deleted | ✓ | ✅ | `src/main.ts:39–43` block: *"the `?pryzm2=1` opt-in kill-switch (bootHub / bootProject / bootPryzm2 / mountMinimumChrome, ~370 LOC) has been removed."* main.ts is now 256 LOC (was 700). |
| **D.3** | DELETE `apps/editor/src/main.ts:mountEditor()` + dark canvas | ❌ NOT DONE | ❌ | `apps/editor/src/main.ts:95` exports `mountEditor()` (215 LOC); `apps/editor/vite.pryzm2.config.ts` exists; `apps/editor/src/router.ts` (`?pryzm2=1` parser) exists; `apps/editor/__tests__/router.test.ts` exists; `apps/editor/package.json:25` defines `"build:pryzm2"`; `index.html:53` still styles `#progress`. **`mountEditor()` is now DEAD CODE (zero production callers — verified via `rg "mountEditor\(" --type ts -g '!apps/editor/**' -g '!**/__tests__/**'` returning 0 results), but spec says DELETE, not "leave dead".** |
| **D.4** | DELETE `EngineBootstrap.ts` (2 086 LOC) | ❌ | ❌ | 2 035 LOC on disk. Sole importer: `src/main.ts:104` (`_engineModule = import('./engine/EngineBootstrap')`). Other "EngineBootstrap" mentions in src/ are **JSDoc comments documenting the historical Phase F-1 extraction** (`initUI.ts:18`, `initStores.ts:10`, `initScene.ts:4`, `initPersistence.ts:7`, `EdgeProjectorService.ts:1041/1064`, `DefaultViewsManager.ts:102`, `ExportIFC.ts:5`) — they are **not** real imports and do **not** block deletion. |
| **D.5** | DELETE `src/engine/init*.ts` (6 files, each owning a rAF) | ⚠️ Partial — RELOCATED + EXPANDED | ⚠️ | Files moved to `src/engine/subsystems/`; expanded from 6 → 8 (`initBuilders`, `initCollaboration`, `initDataPlatform`, `initPersistence`, `initScene`, `initStores`, `initTools`, `initUI`). rAF reaches: `initScene.ts:3`, all 7 others = 0. So the spec's "6 → 1 rAF" goal is *almost* met (8 → 3 in subsystems, all in `initScene`). The files themselves are NOT deleted, but the rAF-collapse intent IS partly achieved. |
| **D.6** | DELETE `src/engine/RenderPipelineManager.ts` | ✓ Gone from `src/engine/`; new home `packages/renderer/src/...` | ✅ | confirmed by `find . -name RenderPipelineManager.ts` returning only the new home |
| **D.7** | DELETE `src/engine/UnifiedFrameLoop.ts` → `packages/frame-scheduler/FrameScheduler.ts` | ✅ **Spec home landed** | ✅ (with leftover) | `packages/frame-scheduler/src/FrameScheduler.ts` (1 raf — the canonical scheduler tick); `packages/frame-scheduler/src/RafAdapter.ts` (6 raf — the adapter that owns the rAF). **`src/core/rendering/UnifiedFrameLoop.ts` is the *legacy* file** (per `packages/frame-scheduler/src/types.ts:11/38` which explicitly cite it as "PRYZM 1") — 402 LOC with **13 src/ importers** still using it. The spec sub-phase is landed (the file is gone from `src/engine/` and the new home exists); the leftover at `src/core/rendering/` is a separate migration. |
| **D.8** | DELETE `BatchCoordinator.ts` + `DrawingPipelineOrchestrator.ts` | ✓ | ✅ | both gone from `src/engine/` |
| **D.9** | ViewCube drag → camera orbit via `runtime.cameraController.setView(...)` | ❌ — slot does not exist | ❌ | `runtime.cameraController` is **not declared in `packages/runtime-composer/src/types.ts`**; the only `cameraController` references are inside `packages/view-state/src/ViewController.ts:79` as a **private field of `ViewController`**. ViewCube.ts has 0 `cameraController` casts — but only because it never had any. The legacy verb (camera orbit) currently routes through `ViewController` directly. |
| **D.10** | ViewCube click face → orthographic snap | ❌ same as D.9 | ❌ | same blocker |
| **D.11** | View tab click → `runtime.viewRegistry.activate(viewId)` | ❌ — slot exists, no consumers | ❌ | `runtime.viewRegistry` is declared in `types.ts:689–690` as `readonly viewRegistry: unknown`. Zero consumers in `src/`. Cast count corrected below. |
| **D.12** | WorkspaceModeBar mode switch → `runtime.workspace.setMode(...)` | ❌ — slot exists, no consumers | ❌ | `runtime.workspace.{mode,setMode,subscribe}` declared in `types.ts:643–645`. Zero consumers in `src/`. Cast count corrected below. |
| **D.13** | Selection click → `runtime.picking.pick(canvasPoint)` → `runtime.selection.select([{element, id}])` | ❌ | ❌ | Slots exist (`types.ts:678` `selection: SelectionSlot`; `:686-687` `picking: PickingSlot`). Zero consumers in `src/`. Selection still routes through `src/tools/SelectionManager.ts` (private `_raycaster` at `:232`). |
| **D.14** | Selection marquee → `runtime.picking.marquee(rectStart, rectEnd)` | ❌ | ❌ | same blocker |

---

## D.11 / D.12 corrected cast inventory

The original audit listed only `ViewTabBar.ts` (D.11) and `WorkspaceModeBar.ts` (D.12). Real inventory:

### D.11 — `(window as any).viewController.*` reaches (10 reaches across 8 files)

| File | Line | Kind |
|---|---:|---|
| `src/engine/subsystems/initScene.ts` | 164 | **SETTER** — assigns `(window as any).viewController = viewController` |
| `src/engine/EngineBootstrap.ts` | 434 | reader |
| `src/ui/RadialMenu.ts` | 240 | reader |
| `src/ui/tools-panel/panels/GridsLevelsRailPanel.ts` | 112 | reader |
| `src/ui/rendering/VisualizationEnginePanel.ts` | 1431 | reader |
| `src/ui/bottom-menu/BottomActionMenu.ts` | 509 | reader |
| `src/ui/ViewBrowser/panels/ViewsRailPanel.ts` | 737 | reader |
| `src/ui/ViewBrowser/panels/ViewsRailPanel.ts` | 762 | writer (`setActiveViewDefinitionId`) |
| `src/ui/SheetEditor/SheetProjectionOrchestrator.ts` | 46 | reader |
| `src/ui/SheetEditor/SheetEditorPanel.ts` | 2530 | reader |

**No `ViewTabBar.ts` exists** — the original audit's plan referenced a file that doesn't exist in this layout.

### D.12 — `(window as any).workspaceController.*` reaches (4 reaches across 3 files + setter)

| File | Line | Kind |
|---|---:|---|
| `src/engine/EngineBootstrap.ts` | 1905 | **SETTER** — `(window as any).workspaceController = workspaceController` |
| `src/engine/inspect/InspectModeCoordinator.ts` | 77 | reader |
| `src/ui/ViewCube.ts` | 128 | reader (`getMode?.()`) |
| `src/elements/rooms/RoomBoundaryBuilder.ts` | 147 | reader (with local fallback `this._workspaceController ?? (window as any).workspaceController`) |

**No `WorkspaceModeBar.ts` exists** — the original audit's plan referenced a file that doesn't exist either.

The migration target file list is therefore entirely different from what the original audit projected. The actual D-finish.4 PR plan has to enumerate these 13 files (10 + 4 minus 1 setter), not the 2 the audit listed.

### D.9 / D.10 — `(window as any).cameraController.*` reaches

**Zero.** `rg "(window as any)\\.cameraController" src/` returns no results.

This means the audit's grading of D.9/D.10 was diagnostically wrong: the gesture is not routed through a `(window as any).cameraController` cast at all. The legacy verb (camera orbit on ViewCube drag) currently routes through `packages/view-state/src/ViewController.ts` directly — `ViewController` holds the `CameraController` instance as a **private field** (`packages/view-state/src/ViewController.ts:79`). Migrating D.9/D.10 therefore requires:

1. **First**: declare a `runtime.cameraController` slot in `packages/runtime-composer/src/types.ts` (it does NOT exist today).
2. **Then**: have `composeRuntime.ts` bind that slot to the `CameraController` instance built inside `ViewController` (or move the construction up to runtime-composer).
3. **Then**: have `ViewCube.ts` consume `runtime.cameraController.setView(...)` instead of reaching into `ViewController` directly.

The audit's plan glossed over step 1 — there's nothing to migrate to today.

---

## Aggregate metrics (verified)

| Metric | Floor (S78 baseline) | Today (verified) | Δ |
|---|---:|---:|---:|
| `raf_outside_scheduler` (src/) | 89 | **50** in src/ + **6** in `packages/frame-scheduler/RafAdapter.ts` (legitimate, the scheduler itself) → ~50 effective | -39 |
| `raf_outside_scheduler` top offenders | — | `EngineBootstrap.ts:7`, `SheetEditorPanel.ts:6`, `DiagnosticMaterialManager.ts:5`, `PropertyPanel.ts:4`, `EngineLoadingOverlay.ts:4`, `CurtainWallBuilder.ts:4`, `core/rendering/UnifiedFrameLoop.ts:4`, `initScene.ts:3`, `Layout.ts:2`, `FurnitureCarousel.ts:2`, `FloatingObjectCarousel.ts:2`, `SyncStateDetailDrawer.ts:2`, `PIPRenderer.ts:2`, `BottomActionMenu.ts:2`, `main.ts:2` | — |
| `canvas_outside_renderer` | 47 | unverified (separate scan needed; not run for this PR) | — |
| Total `src/engine/` LOC | — | **11 942** (`EngineBootstrap` 2 035 + `EngineContext` minor + `inspect/` ~ + `subsystems/` 6 029 — `initUI` 2 729 + `initScene` 2 115 + `initTools` 1 034 + `initStores` 115 + others) | — |

---

## Phase D exit criteria check (against spec line 152)

> *"There is one renderer, one rAF, one selection service. The dark editor is deleted. The kill-switch is deleted. The `?pryzm2=1` URL parameter no longer does anything."*

| Clause | Status | Evidence |
|---|---|---|
| Dark editor deleted | ❌ | `apps/editor/src/main.ts:mountEditor` (215 LOC) still on disk; `apps/editor/vite.pryzm2.config.ts` still on disk; `apps/editor/src/router.ts` still on disk; `apps/editor/__tests__/router.test.ts` still tests it; `apps/editor/package.json:25` still scripts `"build:pryzm2"`. **Dead code in production** (zero production callers of `mountEditor`) but **not deleted**. |
| Kill-switch deleted | ✅ | `src/main.ts:39–43` confirms removal of bootHub/bootProject/bootPryzm2/mountMinimumChrome, ~370 LOC |
| `?pryzm2=1` URL param does nothing | ✅ | confirmed in main.ts comment block at `:92`; no production code reads it |
| One renderer | ⚠️ | Renderer slot exists at `runtime.scene.renderer` but `composeRuntime({canvas: null, …})` in `src/main.ts:160` leaves the slot null until the legacy `EngineBootstrap.bootstrap()` mounts the canvas via `initScene.ts`. So today there's still effectively two renderer mount paths. |
| One rAF | ❌ | 50 src/ rAF reaches; `EngineBootstrap.ts` alone owns 7. The canonical scheduler exists (`packages/frame-scheduler/`) but no src/ file imports it. |
| One selection service | ❌ | `runtime.selection` + `runtime.picking` slots exist; zero src/ consumers. Selection still routes through `src/tools/SelectionManager.ts`. |

**Phase D is ~40% complete by sub-phase count, ~33% by exit-clause count (2/6 clauses unambiguously satisfied).**

---

## Annotations landed this PR

To match the Phase C pattern (5 `@deprecated` JSDoc markers on legacy persistence exports), the equivalent Phase D annotations were added on the canonical legacy entry points:

| File | Line | Export | Annotation |
|---|---:|---|---|
| `src/engine/EngineBootstrap.ts` | 142 | `bootstrap()` | `TODO(D.4)` — sole importer is `src/main.ts:104`. Replacement: `composeRuntime()` is the orchestrator. |
| `apps/editor/src/main.ts` | 95 | `mountEditor()` | `TODO(D.3)` — dead in production (zero callers); kept only for `apps/editor/__tests__/router.test.ts`. Spec says delete; deletion blocked on retiring the test + the `build:pryzm2` script. |
| `src/core/rendering/UnifiedFrameLoop.ts` | top of file | `unifiedFrameLoop` singleton | `TODO(D.7-leftover)` — replacement is `packages/frame-scheduler/`; 13 src/ importers block deletion (listed inline). |

These annotations:

1. Surface as IDE deprecation strikethroughs on every importer.
2. Cite the destination spec slot inline.
3. Cite the **specific blocker file/line list** so the future deletion PRs can be scoped without a fresh search.

(`apps/editor/vite.pryzm2.config.ts` and `packages/engine-router/` are also dead — but they're config / package-export files, so the equivalent signal is a top-of-file comment rather than `@deprecated`.)

---

## Plan: D-finish batches (corrected scope)

### D-finish.1 — Verify D.3 closure properly + delete dead dark editor (S79-WIRE D1, 1 PR — small)

The dark editor is **dead code** (zero production callers of `mountEditor`). What's left to delete:

| File | LOC | Notes |
|---|---:|---|
| `apps/editor/src/main.ts` | 215 | the `mountEditor()` entry point |
| `apps/editor/vite.pryzm2.config.ts` | ~30 | build config for the dark mount |
| `apps/editor/src/router.ts` | ~50 | `?pryzm2=1` parser (unused outside tests) |
| `apps/editor/__tests__/router.test.ts` | ~80 | tests for the router (and one router-mock used by `packages/engine-router/__tests__/router.test.ts` — re-evaluate that test too) |
| `apps/editor/package.json:25` | 1 line | the `"build:pryzm2"` script |
| `index.html:53` (the `#progress` style block) | 1 line | unused CSS |
| `packages/engine-router/` | whole package | confirmed REMOVED at runtime per `src/main.ts:92`; only test files reference it |

**Acceptance**: `rg "pryzm2-canvas|#pryzm2|mountEditor|engine-router" src apps index.html packages -g '!**/migrations/**' -g '!**/sunset/**'` returns 0 real-import results (historical comment text in `apps/editor/migrations/sunset-pryzm1.md` and `apps/editor/src/sunset/Pryzm1SunsetBanner.ts` may remain — those reference the *new* banner mounted on the legacy URL).

### D-finish.2 — Migrate `src/core/rendering/UnifiedFrameLoop.ts` → `@pryzm/frame-scheduler` (S79-WIRE D2, 1 PR — medium)

13 importers must switch from `import { unifiedFrameLoop } from '../rendering/UnifiedFrameLoop'` to the equivalent `packages/frame-scheduler/` API:

| Importer | Reach | Replacement |
|---|---|---|
| `src/core/views/ViewDependencyTracker.ts:34` | `unifiedFrameLoop` ref | `import { frameScheduler } from '@pryzm/frame-scheduler'` |
| `src/core/views/SplitViewManager.ts:27` | same | same |
| `src/core/views/PlanViewManager.ts:3` | type-only | `import type { FrameScheduler } from '@pryzm/frame-scheduler'` |
| `src/core/rendering/SSGIService.ts:44` | ref | runtime import |
| `src/core/rendering/EnhancedBloomService.ts:33` | ref | runtime import |
| `src/core/navigation/ViewController.ts:17` | type-only | type import |
| `src/core/navigation/FirstPersonController.ts:36` | ref | runtime import |
| `src/elements/preview/PreviewManager.ts:29` | ref | runtime import |
| `src/elements/annotations/AnnotationRenderLayer.ts:28` | ref | runtime import |
| `src/engine/subsystems/initScene.ts:76` | ref | runtime import (this site also collapses the 3 init-scene rAF reaches into one `frameScheduler.requestFrame('initScene')` call) |
| (3 more — see full grep) | — | — |

After all importers migrated: `rm src/core/rendering/UnifiedFrameLoop.ts`. **Acceptance**: `rg "core/rendering/UnifiedFrameLoop" src` returns 0 results, and `rg -c requestAnimationFrame src/` total drops from 50 to ~46 (the 4 raf in UnifiedFrameLoop.ts collapse into the existing 1 raf in `RafAdapter.ts`).

### D-finish.3 — `EngineBootstrap.ts` split (S79-WIRE D3-D6, 4 PRs — large)

The 2 035-LOC `EngineBootstrap.bootstrap()` does:
1. Three.js + @thatopen + Cesium + web-ifc imports (heavy WASM init).
2. Calls into the 8 `subsystems/init*.ts` modules.
3. Wires the 7 rAF reaches (frame-loop + diagnostic raf + viewer animation).

The `subsystems/init*.ts` directory **already provides the receiving locations** — the split mostly happened in Phase F-1; what's left is moving the **orchestration** from `EngineBootstrap.bootstrap()` into `composeRuntime()`.

| PR | Move | Lands in | Removes from `EngineBootstrap.ts` |
|---|---|---|---:|
| **D.4.1** | WASM/fragments init (the 200-LOC `IFCLoader` + `FRAGS.IfcImporter` setup) | `composeRuntime` extension (new `buildScene` slot work; `runtime.scene` slot already exists per `types.ts:596`) | ~200 LOC |
| **D.4.2** | Three.js + Cesium scene init (the 400-LOC scene/camera/lighting boot) | `packages/renderer/src/sceneInit.ts` (already exists per the spec; just thread the wiring) | ~400 LOC |
| **D.4.3** | Subsystem orchestration calls (`initBuilders`, `initTools`, `initCollaboration`, `initDataPlatform` direct invocations) | `composeRuntime` | ~600 LOC |
| **D.4.4** | Tail: error boundaries, OTel spans, the `(window as any).viewController` setter, the `(window as any).workspaceController` setter, the legacy raycaster init | `composeRuntime` (with proper slot bindings — replaces the global setters) | ~835 LOC |

After D.4.4: `src/engine/EngineBootstrap.ts` deleted; `src/main.ts:loadEngine()` + `_engineModule` + `startEngine()` + `_bootstrapped` + `workspaceMount.ensure()` shim all removed; `src/main.ts` shrinks from 256 LOC to ~100.

### D-finish.4 — D.5 final cleanup (S79-WIRE D7, 1 PR — small)

After D.4 lands, the 8 `subsystems/init*.ts` files become callable from `composeRuntime` directly. Per spec they should ALSO be deleted (collapsed into composeRuntime). Three of them (`initBuilders`, `initStores`, `initPersistence`) are already mostly factory-style and absorb cleanly. The other five (`initScene` 2 115 LOC, `initUI` 2 729 LOC, `initTools` 1 034 LOC, `initCollaboration`, `initDataPlatform`) are too large to inline and should stay as separate modules — but should be **renamed** to drop the `init` prefix (per the spec's "no init files" intent) and live under `packages/runtime-composer/src/wiring/{scene,ui,tools,collaboration,data}.ts`.

**Acceptance**:
- `ls src/engine/subsystems/` returns "no such directory".
- `ls src/engine/` returns only `inspect/` (the diagnostic material manager) and `EngineContext.ts` (or both also moved into the renderer package).
- `rg -c "from .*subsystems/init" src` returns 0.

### D-finish.5 — `runtime.cameraController` slot creation + D.9–D.14 gesture migration (S80-WIRE D1-D5, 5 PRs)

**Pre-requisite (new finding)**: `runtime.cameraController` does **not** exist as a runtime slot. Add it FIRST.

| PR | Sub-phase(s) | Files to migrate |
|---|---|---|
| D.9-prep | (new) | `packages/runtime-composer/src/types.ts` — declare `readonly cameraController: CameraControllerSlot;`; `composeRuntime.ts` — bind it to the `CameraController` instance currently held by `ViewController` (extract construction up to runtime-composer) |
| **D.9 + D.10** | ViewCube orbit + ortho snap | `src/ui/ViewCube.ts` — replace direct `ViewController` reach with `runtime.cameraController.setView(...)` + `runtime.scene.scheduler.markDirty('camera')` |
| **D.11** | View tab activate | 8 files, 10 reaches (see corrected inventory): `RadialMenu`, `GridsLevelsRailPanel`, `VisualizationEnginePanel`, `BottomActionMenu`, `ViewsRailPanel`, `SheetProjectionOrchestrator`, `SheetEditorPanel` (×readers), plus retiring the SETTER at `src/engine/subsystems/initScene.ts:164` and the reader at `EngineBootstrap.ts:434` (collapses with D.4.4) |
| **D.12** | Workspace mode switch | 3 reader files: `InspectModeCoordinator`, `ViewCube`, `RoomBoundaryBuilder`; plus retiring SETTER at `EngineBootstrap.ts:1905` (collapses with D.4.4) |
| **D.13 + D.14** | Selection click + marquee | `src/tools/SelectionManager.ts` — its private `_raycaster` migrates to `runtime.picking.pick(...)` / `runtime.picking.marquee(...)`; consumers of `selectionService.select(...)` retarget to `runtime.selection.select(...)` |

### Acceptance for the full Phase D batch (against spec line 152)

1. ✅ `ls apps/editor/src/main.ts apps/editor/vite.pryzm2.config.ts apps/editor/src/router.ts` → 3× "no such file" (D-finish.1).
2. ✅ `rg "pryzm2-canvas|build:pryzm2|#progress " src apps index.html package.json` → 0 results (D-finish.1).
3. ✅ `ls src/engine/EngineBootstrap.ts` → "no such file" (D-finish.3).
4. ✅ `ls src/core/rendering/UnifiedFrameLoop.ts` → "no such file" (D-finish.2).
5. ✅ `ls src/engine/subsystems/` → "no such directory" (D-finish.4).
6. ✅ `rg -c "(window as any)\\.(viewController|workspaceController|cameraController)" src/` → 0 results (D-finish.5).
7. ✅ `rg -c "requestAnimationFrame" src/` ≤ 5 (only `EngineLoadingOverlay`, `PropertyPanel`, intentional UI animation rAFs).
8. ✅ `gesture-coverage` bench rises from 0/20 to ≥ 6/20 (the D.9–D.14 gestures).
9. ✅ All 9 plugin/persistence workflows green.
10. ✅ `npm run build` clean (no regression in cold-start budget).

---

## Feedback / lessons learned

1. **The audit's "⚠️ Likely landed; verify in C-cleanup.* PR" verdict on D.3 was wrong.** D.3 specifies "DELETE `apps/editor/src/main.ts:mountEditor()` (the dark mount path)". `mountEditor()` is still on disk (215 LOC) along with its router, vite config, npm script, and CSS. The fact that no production code calls `mountEditor()` makes it **dead code, not deleted code** — and the spec's exit-clause measure is *deletion*, not *deadness*. Future audits must distinguish "neutered" from "deleted".

2. **`packages/frame-scheduler/` exists and is the canonical D.7 home.** The original audit's question — "Need to confirm whether `core/rendering` is the new home or a leftover" — has an unambiguous answer: **`packages/frame-scheduler/` is the new home** (per the explicit reference at `packages/frame-scheduler/src/types.ts:11/38` calling out `src/core/rendering/UnifiedFrameLoop.ts:95-98 (PRYZM 1)` as the legacy file). The leftover at `src/core/rendering/UnifiedFrameLoop.ts` (402 LOC, 13 importers) is a separate migration PR — it was not the same work as the spec's D.7. The audit's ⚠️ should have been ✅ for D.7-spec + a separate ⚠️ row for "PRYZM 1 leftover migration".

3. **D.9-D.10 are blocked on a missing runtime slot.** `runtime.cameraController` is not declared in `packages/runtime-composer/src/types.ts`. The original plan's "D.9 + D.10 → `src/ui/ViewCube.ts` (replace `(window as any).cameraController` with `runtime.cameraController`)" was wrong twice over: (a) ViewCube.ts has zero `cameraController` casts today (verified — the `rg` returns 0), and (b) `runtime.cameraController` doesn't exist to migrate to. The first task in any D.9 PR is **declaring the slot**.

4. **D.11/D.12 cast inventories were both wrong by the entire file list.** The audit named `ViewTabBar.ts` (doesn't exist) and `WorkspaceModeBar.ts` (doesn't exist). Real inventory: 10 `viewController` reaches across 8 files, 4 `workspaceController` reaches across 3 files (plus 2 setters in `EngineBootstrap.ts` and `initScene.ts` that collapse with D.4.4). Future audits must not **invent target file names** — they must `rg` for the actual reach sites first.

5. **`mountEditor()` is dead code in production.** Verified by `rg "mountEditor\(" --type ts -g '!apps/editor/**' -g '!**/__tests__/**'` returning 0 results. The same is true of `packages/engine-router/` — main.ts:92 explicitly says "engine-router removed", and no `from '@pryzm/engine-router'` import exists outside the package's own test files. **Both can be deleted as a single mechanical PR (D-finish.1)** without any consumer migration work — the production path has already moved off them.

6. **The `subsystems/init*.ts` expansion (6 → 8) was unannounced.** The spec said DELETE 6 files; today there are 8 files (the new ones are `initStores.ts` + `initBuilders.ts`). This is a scope change the tracker doesn't reflect. Phase D-finish.4 proposes **renaming** (drop `init` prefix; relocate to `packages/runtime-composer/src/wiring/`) rather than deleting, because two of the 8 files (`initScene` 2 115 LOC and `initUI` 2 729 LOC) are too large to inline.

7. **The `_planRejectsSync`-style hidden hazards in Phase D**: the parallel risk for D-finish.3 (`EngineBootstrap.ts` split) is the **two `(window as any)` setters at `EngineBootstrap.ts:434, :1905`** that establish the global `viewController` and `workspaceController` references. Until D.11 + D.12 retire all the **readers** (10 + 4 = 14 sites), those setters cannot be removed safely — even though they're inside the file you want to delete. The D.4.4 PR plan must therefore **leave the two setters in place (in `composeRuntime` instead of `EngineBootstrap`) until D.11+D.12 land**, then delete them in the D.11+D.12 wrap-up.

---

## Summary

| Question | Original audit answer (a.m.) | Revised answer (p.m.) |
|---|---|---|
| Is Phase D done? | "⚠️ ~40% complete" | "⚠️ ~40% by sub-phase, ~33% by spec exit-clause (2/6 clauses satisfied)" |
| What's the cleanest first PR? | "D-finish.1 — verify D.3 closure" | "D-finish.1 — **delete the dead dark editor + engine-router** (zero consumer migration; mechanical)" |
| What's the biggest blocker? | "D.4 EngineBootstrap (2 035 LOC)" | "Confirmed. Sole importer is `src/main.ts:104`. Split via the existing `subsystems/` directory + `composeRuntime` extension; 4 PRs, 2 035 → 0 LOC." |
| What's the hidden hazard? | "(none called out)" | "The 2 `(window as any)` setters at `EngineBootstrap.ts:434, :1905` MUST move to `composeRuntime` before deletion, OR D.11+D.12 readers must land first; otherwise the 14 reader sites break." |
| Where's the missing slot? | "(not noted)" | "`runtime.cameraController` is not declared in types.ts. D.9/D.10 require **slot creation** before consumer migration." |
| What did the audit get wrong? | n/a | "(a) D.3 graded ⚠️ but is ❌. (b) D.7 graded ⚠️ but is ✅ (with a separate leftover). (c) D.9/D.10 cast targets don't exist. (d) D.11 + D.12 file inventories were entirely fictional." |
| Build-gate status after this PR | n/a | ✅ `tsc --noEmit -p tsconfig.json` clean; `node scripts/check-project-isolation.mjs` clean; full `npm run build` passes. |
