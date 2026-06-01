# C14 — Legacy Elimination & PRYZM3 Architecture Enforcement

> **Stamp**: 2026-05-16 · **Status**: CANONICAL  
> **Authority**: Supersedes all pre-PRYZM3 architectural norms documented in `docs/02-decisions/contracts/archive/superseded-pryzm1-pryzm2/`. Cross-references `docs/01-strategy/architecture.md` as the normative source of truth.  
> **Scope**: `packages/`, `plugins/`, `scripts/`, and `tools/ga-gate/` — every file in those three directories. `apps/editor/src/` legacy patterns are governed by C03 §4.3 (undo dual-path) and C06 §4.3 (gizmo drag-end); those are not repeated here.  
> **Audit baseline**: Deep scan executed 2026-05-16; counts refreshed 2026-06-01 covering all `.ts` / `.tsx` files in `packages/` (**79 packages**), `plugins/` (**47 plugins**), `scripts/` (~50 scripts), `tools/ga-gate/` (**21 gates**).

---

## §1 — Purpose

PRYZM3 defines a target architecture. The codebase entered a **strangler-fig migration** in May 2026 (Sprints D through AO) and has not yet fully converged. During migration, legacy patterns coexist with the target architecture. Left unmanaged they accumulate rather than shrink.

This contract serves three functions:

1. **Catalogues** every distinct legacy-pattern type found in `packages/`, `plugins/`, and `scripts/` as of the audit baseline.
2. **Classifies** each package and plugin as: `COMPLIANT`, `TRANSITIONAL-ZONE`, or `LEGACY-ZONE`, with the conditions required to graduate to the next class.
3. **Mandates** the PRYZM3 patterns that new code MUST use — and prohibits the legacy patterns that new code MUST NOT introduce — regardless of migration phase.

The rule of thumb: **existing legacy code is technical debt with a migration milestone; new code written after 2026-05-16 that introduces a legacy pattern is a contract violation**.

---

## §2 — The PRYZM3 Architecture Requirements

The following requirements are derived from `docs/01-strategy/engineering-vision.md`, `02-ARCHITECTURE.md`, and the C01–C13 contract suite. They apply to all packages, plugins, and scripts.

### §2.1 — Command dispatch (P6)

```
MUST use:    runtime.commandBus.dispatch({ type: 'element.xxx', payload: ... })
             OR  runtime.bus.executeCommand('element.xxx', payload)

MUST NOT:    commandManager.execute(new XxxCommand(...))
             cmdMgr.execute(...)
             window.commandManager.execute(...)
             const cm = window.commandManager; cm.execute(...)
             commandManager: any  (typed parameter accepting legacy manager)
```

All element mutations are commands. Commands flow through `CommandBus`. There is no acceptable second mutation path in new code.

### §2.2 — Store access (P6)

```
MUST use:    HandlerContext.stores.xStore  (in handler context)
             runtime.stores.xStore         (from runtime handle)
             context.runtime.stores.*      (from plugin activation context)

MUST NOT:    window.wallStore
             window.slabStore
             window.xStore  (any store name)
             (window as any).xStore
```

Handlers access stores through `HandlerContext`. Plugins and tools access them through `PluginActivationContext`. No package or plugin may read from `window.xStore` in new code.

### §2.3 — Service access (P4)

```
MUST use:    runtime.scene.renderer        (for the renderer)
             runtime.tools                 (for tool management)
             runtime.picking               (for selection)
             runtime.sync                  (for CRDT sync)
             context.runtime.*             (from plugin)

MUST NOT:    window.bimManager
             window.commandManager
             window.presentationEngine
             window.selectionManager
             window.xBuilder  (any builder name)
             (window as any).<anything>
```

### §2.4 — Event bus (P6, P8)

```
MUST use:    runtime.events.emit(kind, payload)   (structured events)
             commandBus.dispatch(...)              (mutation events)
             storeEventBus.beginBatch() / endBatch()  ONLY in @pryzm/core-app-model
                                                    batch coordination (transitional)

MUST NOT:    window.dispatchEvent(new CustomEvent(...))
             document.dispatchEvent(new CustomEvent(...))
             window.addEventListener('custom-event-name', ...)  as the sole consumer
```

Custom DOM events bypass the type system, the OTel span contract (C10 §4), and the CRDT sync pipeline (C08). The `storeEventBus` is a transitional exception limited to `@pryzm/core-app-model/batch/BatchCoordinator.ts` until Phase G3-T2 (Yjs per-level routing replaces it).

### §2.5 — Undo/redo (C03 §4.2)

```
MUST use:    Immer produceWithPatches → forward/inverse JSON-Patch pair
             → RingBufferUndoStack.push({ forward, inverse, affectedStores })

MUST NOT:    structuredClone(store.getAll())  as a pre-command snapshot
             command.undo()  restoring a structuredClone snapshot (new commands)
             Any undo mechanism that does not produce affectedStores metadata
```

`structuredClone`-based snapshotting is the PRYZM1/2 undo pattern. It is $O(N \times S)$ in element count and store count. All new commands MUST use `produceWithPatches`.

### §2.6 — Layer boundary (C01 §2)

```
MUST use:    import { X } from '@pryzm/package-name'  (named packages only)

MUST NOT:    import { X } from '../../other-package/src/File'  (relative cross-package)
             import { X } from '../../../apps/editor/src/...'  (app layer from package)
             import { X } from 'three'  (outside renderer-three, geometry-*, input-host)
```

Packages are isolated units. Cross-package coupling via relative paths violates the extraction invariant that enables independent versioning and tree-shaking.

---

## §3 — Prohibited Patterns Catalogue

The following patterns were found in `packages/`, `plugins/`, or `scripts/` during the 2026-05-16 audit. Each is tagged with a **Migration Phase** that assigns when it must be eliminated.

### LP-01 — `window.xStore` access from packages and plugins

**Found in:** `@pryzm/ai-host` (AIReadModel.ts ×16, AIService.ts ×7, QueryEngine.ts ×8, RuleEngine.ts ×3, VoiceSpatialInterface.ts ×3, WallRegionExtractor.ts ×2, FloorPlanBatchExecutor.ts ×2), `@pryzm/core-app-model` (AutoRemediateCommand.ts, PlanElementDragController.ts, VoiceSpatialInterface.ts), `@pryzm/room-topology` (RoomContentsService.ts ×14, RoomTagAutoPopulator.ts ×5, RoomBoundaryBuilder.ts ×4), `@pryzm/input-host` (BeamTool.ts ×11, WallEndpointController.ts ×5, SelectionManager.ts ×4), `@pryzm/constraint-solver` (ConstraintEngine.ts ×11), `@pryzm/geometry-curtain-wall` (CurtainWallBuilder.ts, CurtainWallTool.ts), `@pryzm/geometry-wall` (WallFragmentBuilder.ts, WallTypes.ts), `@pryzm/speculative-engine`, `@pryzm/physics-host`, `@pryzm/runtime-composer` (ProjectLifecycleController.ts, types.ts), `@pryzm/geometry-slab` (SlabPickWallsController.ts), `@pryzm/spatial-index`, `plugins/annotations` (all 12 annotation commands, all annotation tools).

**Why it exists:** Pre-PRYZM3 stores were registered as `window` globals by `initBuilders.ts` at engine startup. Packages that predated the `HandlerContext` / `PluginActivationContext` injection pattern read directly from `window`.

**Target pattern:**

```ts
// BEFORE (legacy)
const wallStore = window.wallStore;

// AFTER (PRYZM3)
// In a handler: ctx.stores.wallStore
// In a plugin:  context.runtime.stores.wallStore
// In ai-host:   inject via AIReadModel constructor parameter (not window)
```

**Migration phase:** Phase E (per-store slot wiring, E.wall.S through E.furniture.S). `@pryzm/ai-host` migration blocked on Phase D.4 runtime injection into AIReadModel constructor.

---

### LP-02 — `window.commandManager` / `cmdMgr.execute()` from packages

**Found in:** `@pryzm/ai-host` (FloorPlanBatchExecutor.ts ×4, VoiceSpatialInterface.ts ×3, AmbientIntelligence.ts ×2, RoomAIAssistant.ts ×3, QueryEngine.ts ×1), `@pryzm/core-app-model` (AutoRemediateCommand.ts ×2, PlanElementDragController.ts ×2, VoiceSpatialInterface.ts mirror), `@pryzm/command-registry` (AnnotateViewCommand.ts, global-bridge.ts — intentional typed bridge), `plugins/annotations` (OBCAnnotationAdapter.ts ×2, LevelDatumLineBuilder.ts, SectionGridLineBuilder.ts).

**Self-flagged violation:** `@pryzm/ai-host/src/WallRegionExtractor.ts` line 55 carries the comment `// CONTRACT VIOLATION: direct window.wallStore access.` — the violation was known and intentionally deferred.

**Why it exists:** `commandManager` was registered as a window global by `initTools.ts`. Before `runtime.commandBus` existed, the only mutation path was `window.commandManager.execute()`.

**Target pattern:**

```ts
// BEFORE (legacy)
const cm = window.commandManager;
if (!cm) return;
cm.execute(new UpdateWallBaselineCommand({ ... }), { source: 'HUMAN_DIRECT' });

// AFTER (PRYZM3)
runtime.commandBus.dispatch({
  type: 'wall.updateBaseline',
  payload: { wallId, newBaseLine, prevBaseLine },
  source: 'user',
});
```

**Exception:** `packages/command-registry/src/global-bridge.ts` is the **one permitted bridge site** for the PRYZM1/2 → PRYZM3 transition. It centralises `window.commandManager` access into a single typed function rather than scattering `(window as any)` casts. The bridge MUST be deleted when Phase E.5.x migration is complete.

**Migration phase:** Phase E.5.x (flip all 143+ `cmdMgr.execute()` sites in `apps/editor/src/` to `commandBus.dispatch()`; after that, flip package/plugin sites that use the bridge).

---

### LP-03 — `commandManager: any` typed parameter (type erosion)

**Found in:** `@pryzm/command-registry` (BeamCommandPlan.ts, StairCommandPlan.ts), `@pryzm/core-app-model` (BatchCoordinator.ts, FloorTypes.ts), `@pryzm/file-format` (IfcConversionContext.ts + 8 IFC converter files: IfcBeamToNativeConverter, IfcColumnToNativeConverter, IfcCurtainWallToNativeConverter, IfcFurnitureToNativeConverter, IfcOpeningHostResolver, IfcOpeningToNativeConverter, IfcRailingToNativeConverter, IfcRoofToNativeConverter), `@pryzm/ai-host` (RoomAIAssistant.ts).

**Why it exists:** When the IFC importer and AI executor were written, only `CommandManager` existed. They accepted it as an opaque `any` to avoid the circular dependency of importing the concrete class.

**Target pattern:**

```ts
// BEFORE (legacy)
constructor(private commandManager: any, private issues: IfcConversionIssue[]) {}

// AFTER (PRYZM3)
constructor(private bus: CommandBus, private issues: IfcConversionIssue[]) {}
// Then: this.bus.dispatch({ type: 'element.create', payload: ... })
```

**Migration phase:** Phase E.5.x for IFC converters (blocked on `CommandBus` being wire-accessible to `@pryzm/file-format`); Phase F.ai for AI host.

---

### LP-04 — `structuredClone` for undo snapshot (pre-Immer pattern)

**Found in:** `@pryzm/command-registry` (165 instances — CommandManager.ts primary, plus per-command snapshot in UpdateBeamCommand, AddAssetCatalogEntryCommand, DeleteAssetCatalogEntryCommand, UpdateAssetCatalogEntryCommand, CreateCeilingCommand, and many others), `plugins/annotations` (DeleteAnnotationCommand.ts, UpdateAnnotationCommand.ts).

**Why it exists:** PRYZM1/2 undo was snapshot-based: before `execute()`, the command cloned the entire affected store state. On `undo()`, the clone was written back. This is `O(N)` per command per store.

**Target pattern:**

```ts
// BEFORE (legacy)
execute(ctx) {
  this.previousState = structuredClone(ctx.stores.beamStore.getById(this.id));
  ctx.stores.beamStore.update(this.id, this.updates);
}
undo(ctx) {
  ctx.stores.beamStore.update(this.id, this.previousState);
}

// AFTER (PRYZM3)
// In handler registered via runtime.bus.registerHandler('beam.update', handler):
function handler(cmd, ctx) {
  const [nextState, patches, inversePatches] = produceWithPatches(
    ctx.stores.beamStore.getAll(), draft => { draft[cmd.payload.id] = { ...draft[cmd.payload.id], ...cmd.payload.updates }; }
  );
  ctx.stores.beamStore.applyPatch(patches);
  ctx.undoStack.push({ forward: patches, inverse: inversePatches, affectedStores: ['beamStore'] });
}
```

**Exception:** `structuredClone` for non-undo purposes (deep-copying proposal objects, cloning config structures) is not prohibited by this pattern.

**Migration phase:** Phase E (per-element-type command migration). Commands migrated to `commandBus.dispatch()` MUST NOT use `structuredClone` for undo.

---

### LP-05 — `window.dispatchEvent(new CustomEvent(...))` from packages/plugins (bypass event bus)

**Found in (packages):** `@pryzm/ai-host` (QueryEngine.ts ×16, FloorPlanBatchExecutor.ts ×3, VoiceSpatialInterface.ts ×2, AmbientIntelligence.ts ×1, AIElementFactory.ts ×1), `@pryzm/file-format` (IfcLevelImporter.ts, DxfToBimTracer.ts, IfcModelStore.ts ×2, deleteIfcElement.ts ×3, IfcConversionReportStore.ts), `@pryzm/geometry-door` (DoorBuilder.ts ×3 via `document.dispatchEvent`), `@pryzm/geometry-column` (ColumnStore.ts), `@pryzm/geometry-curtain-wall` (CurtainWallBuilder.ts ×2), `@pryzm/constraint-solver` (ConstraintEngine.ts), `@pryzm/input-host` (FloorPlanUnderlayTool.ts ×11, SelectionManager.ts ×9, UnderlayReferenceRotateTool.ts ×8, UnderlayReferenceScaleTool.ts ×7, OperationToolBase.ts ×4), `@pryzm/core-app-model` (CeilingStore.ts ×6, AssetCatalogStore.ts ×5, RequirementStore.ts ×4), `@pryzm/geometry-stair` (StairStore.ts ×4), `@pryzm/geometry-slab` (SlabStore.ts, RoofStore.ts), `@pryzm/command-registry` (TagElementCommand.ts ×2).

**Found in (plugins):** `plugins/annotations` (DimensionPropertiesPanel.ts, ~15 annotation tool files each dispatching `annotation.create`).

**Total count:** 447 `CustomEvent` / `window.dispatchEvent` calls in packages and plugins combined.

**Why it exists:** Pre-PRYZM3 had no structured event bus. UI panels listened to `window.addEventListener('bim-selection-changed', ...)`. Geometry packages dispatched DOM events to notify the UI layer without importing it (a reasonable intent, wrong mechanism).

**Target pattern:**

```ts
// BEFORE (legacy)
window.dispatchEvent(new CustomEvent('bim-selection-changed', { detail: { id } }));

// AFTER (PRYZM3)
runtime.events.emit('selection.changed', { elementId: id, source: 'user' });
// Or for AI proposals:
runtime.events.emit('ai.proposalAdded', { proposal });
// Or for IFC import progress:
runtime.events.emit('ifc.levelImported', { levelId });
```

**Exception:** `ColumnStore.ts` line 124 dispatches `bim-subscriber-error` as a debug/error event — this is an internal diagnostic; acceptable until Phase F cleanup. The CurtainWallBuilder `CustomEvent` fallback (lines 534, 543, 614) is documented as "no runtime.events available at geometry tier" — acceptable transitional.

**Migration phase:** Phase F for geometry-layer dispatches (needs `runtime.events` injectable at geometry tier). Phase E.5.x for tool-tier dispatches (SelectionManager, FloorPlanUnderlayTool). Phase F.ai for ai-host dispatches (QueryEngine AI proposals need structured events).

---

### LP-06 — `StoreEventBus` usage outside `@pryzm/core-app-model`

**Found in:** `@pryzm/command-registry` (CreateCurtainWallsOnAllSlabsCommand.ts — accesses `storeEventBus._batchDepth` as `any` for debugging).

**Permitted users of StoreEventBus:** Only `@pryzm/core-app-model/src/batch/BatchCoordinator.ts`, `DependencyResolver.ts`, `BimKernel.ts`, `IFCPsetAdapter.ts`, `SemanticIndex.ts`, `TemporalGraph.ts`, `ElementCodeStore.ts` (the core-app-model internal bus consumers). All other packages MUST NOT import or access `storeEventBus`.

**Why it exists:** The curtain wall command accessed `_batchDepth` as a diagnostic to detect double-batch conditions. This is a package boundary violation — `command-registry` must not depend on the internals of `core-app-model/StoreEventBus`.

**Target pattern:** Expose a `batchCoordinator.isBatching` boolean check (already exists) instead of reading `_batchDepth` directly.

**Migration phase:** Phase E (next curtain wall command sprint).

---

### LP-07 — Cross-package relative imports (layer boundary violation)

**Found in:** `@pryzm/room-topology/src/RoomTopologyObserver.ts` → `import { CurtainWallBuilder } from '../../geometry-curtain-wall/src/CurtainWallBuilder'` (relative path crossing the package boundary).

**Why it exists:** `room-topology` was extracted before `geometry-curtain-wall` had a stable public barrel. The relative import was expedient.

**Target pattern:**

```ts
// BEFORE
import { CurtainWallBuilder } from '../../geometry-curtain-wall/src/CurtainWallBuilder';

// AFTER
import { CurtainWallBuilder } from '@pryzm/geometry-curtain-wall';
```

**Migration phase:** Sprint BP (next geometry-curtain-wall extraction sprint — add `CurtainWallBuilder` to the barrel, then fix the import).

---

### LP-08 — `window.bimManager` access from packages/plugins

**Found in:** `@pryzm/ai-host` (AIElementFactory.ts ×1, QueryEngine.ts ×3), `plugins/annotations` (LevelDatumLineBuilder.ts ×1, SectionGridLineBuilder.ts ×1).

**Why it exists:** `BimManager` predates `runtime.scene`. Level enumeration, element registration, and world access all went through `window.bimManager` before the `runtime` handle existed.

**Target pattern:**

```ts
// BEFORE
const levels = window.bimManager?.getLevels?.() ?? [];

// AFTER
const levels = runtime.scene.levels.getAll();
```

**Migration phase:** Phase D.4 (BimManager → runtime.scene decomposition). Annotation tools: Phase E.annotations (same sprint as annotation command migration).

---

### LP-09 — `@pryzm/legacy-shim` package (zombie package)

**Status:** Package `packages/legacy-shim/` is deprecated. `package.json` description reads: `"PRYZM 2 — fixture-only package used by pryzm/no-raf lint integration test. Nothing in here ships."` The deprecation tag recommends DROP in Wave 12.

**Action:** DROP. Zero importers confirmed. No code path ships this package. Delete in the next sprint that touches the `packages/` root.

**Migration phase:** Wave 12 (Wave 11 close + cleanup sprint).

---

### LP-10 — Untyped `commandManager: any` in IFC conversion pipeline

This is a sub-category of LP-03, isolated here because `@pryzm/file-format` is L3 (state + composition) and passing `commandManager: any` means the IFC import pipeline has no static contract with the mutation system. The risk is that `file-format` could silently break when `CommandManager` is retired.

**Files:** `IfcConversionContext.ts`, `executeHumanDirect()` utility, and 8 converter classes.

**Target:** Replace `executeHumanDirect(commandManager, cmd)` with `commandBus.dispatch({ type: 'element.create', payload: ... })` using a properly typed `CommandBus` reference injected into `IfcConversionContext`.

**Migration phase:** Phase E.ifc (IFC import command migration sprint, immediately after Phase E.5.x generic migration opens the `commandBus` wire).

---

## §4 — Per-Package Classification

### 4A — COMPLIANT packages (zero legacy patterns)

These packages were written from the beginning against the PRYZM3 architecture. They MUST NOT regress.

| Package | Verified clean |
|---|---|
| `@pryzm/schemas` (L0) | ✅ Zero window, zero commandManager, zero DOM |
| `@pryzm/command-bus` (L1) | ✅ Defines the bus, explicitly documents P6 |
| `@pryzm/runtime-undo-stack` (L1) | ✅ Pure ring-buffer, no window access |
| `@pryzm/frame-scheduler` (L1) | ✅ Single rAF owner |
| `@pryzm/picking` (L1) | ✅ GPU readback, no window globals |
| `@pryzm/visibility` (L1) | ✅ Intent model only |
| `@pryzm/ai-cost` (L1) | ✅ Budget math only |
| `@pryzm/drawing-primitives` (L1½) | ✅ Value objects only |
| `@pryzm/protocol` (L1½) | ✅ Wire types only |
| `@pryzm/sync-client` (L1) | ✅ Yjs sync only |
| `@pryzm/snapping` (L1) | ✅ Geometry math only |
| `@pryzm/geospatial` (L2) | ✅ proj4js + LTP-ENU, no window |
| `@pryzm/plugin-sdk` (L6) | ✅ Curated re-export facade |
| `@pryzm/headless` (L5) | ✅ Server-side API surface |
| `@pryzm/wcag-audit` | ✅ Pure DOM inspection |
| `@pryzm/expr-eval` | ✅ Formula eval only |
| `@pryzm/formula-library` | ✅ Math library |
| `@pryzm/perf-budgets` | ✅ NFT definitions |

**Regression guard:** The `check-cast-count.ts` gate (ratchet = 0) plus the `check-three-imports.ts` gate protect compliant packages from window-cast regression. The per-package compile gate (`check-per-package-compile.ts`) guards import-boundary compliance.

---

### 4B — TRANSITIONAL-ZONE packages (legacy patterns present, migration milestones assigned)

These packages contain documented legacy patterns. New code within them MUST follow PRYZM3 patterns. Existing legacy code is technical debt with a phase assignment.

| Package | Primary legacy pattern(s) | LP tags | Migration phase | Owner sprint |
|---|---|---|---|---|
| `@pryzm/ai-host` | window.xStore reads (44 sites), window.commandManager (10 sites), window.dispatchEvent (20+ sites), commandManager:any | LP-01, LP-02, LP-03, LP-05 | Phase D.4 (runtime injection into AIReadModel), Phase F.ai (CustomEvent → runtime.events) | Sprint BQ |
| `@pryzm/command-registry` | structuredClone undo (165 sites), commandManager:any in Plans, global-bridge.ts, StoreEventBus debug access | LP-02, LP-03, LP-04, LP-06 | Phase E (per-command Immer migration); global-bridge deleted at E.5.x close | Sprint E-batch |
| `@pryzm/core-app-model` | window.commandManager (5 sites), window.xStore (92 sites), CustomEvent (65 sites), StoreEventBus (active batch coordination) | LP-01, LP-02, LP-05 | Phase G3-T2 (StoreEventBus → Yjs per-level), Phase D.4 (service access) | Sprint G3 |
| `@pryzm/file-format` | commandManager:any in 9 IFC converters, window.dispatchEvent (8 sites) | LP-03, LP-05, LP-10 | Phase E.ifc (CommandBus injection into IfcConversionContext) | Sprint E.ifc |
| `@pryzm/input-host` | window.dispatchEvent (44 sites in tool overlays), window.xStore reads | LP-01, LP-05 | Phase E.5.x (tool events → runtime.events) | Sprint E.tools |
| `@pryzm/room-topology` | window.xStore reads, cross-package relative import | LP-01, LP-07 | Sprint BP (barrel + import fix), Phase E.18-R.S (roomStore slot) | Sprint BP |
| `@pryzm/constraint-solver` | window.dispatchEvent (11 sites), window.xStore reads | LP-01, LP-05 | Phase E.constraint (runtime.events injection) | Sprint E.constraint |
| `@pryzm/geometry-door` | document.dispatchEvent (3 sites) | LP-05 | Phase F.door (runtime.events at geometry tier) | Sprint F.door |
| `@pryzm/geometry-column` | window.dispatchEvent (1 site), window.xStore reads (transitional) | LP-01, LP-05 | Phase E.column.S | Sprint E.column |
| `@pryzm/geometry-curtain-wall` | window.dispatchEvent (2 sites — documented fallback) | LP-05 | Phase F.geometry (runtime.events injectable at L2) | Sprint F.geometry |
| `@pryzm/geometry-wall` | window.xStore reads in WallTypes, WallFragmentBuilder | LP-01 | Phase E.wall.S | Sprint E.wall |
| `@pryzm/geometry-slab` | window.dispatchEvent, window.xStore reads | LP-01, LP-05 | Phase E.slab.S | Sprint E.slab |
| `@pryzm/geometry-stair` | window.dispatchEvent (4 sites in StairStore) | LP-05 | Phase E.stair.S | Sprint E.stair |
| `@pryzm/spatial-index` | window.xStore reads in RoomTypeInferenceEngine | LP-01 | Phase E.18-R.S | Sprint E.rooms |
| `@pryzm/speculative-engine` | window.xStore reads | LP-01 | Phase E.5.x (speculative engine runtime injection) | Sprint E.spec |
| `@pryzm/physics-host` | window.xStore reads | LP-01 | Phase E.physics | Sprint E.physics |
| `@pryzm/runtime-composer` | window.xStore reads in ProjectLifecycleController | LP-01 | Phase D.4 (runtime slot for lifecycle) | Sprint D.4 |
| `@pryzm/renderer-three` | None — already COMPLIANT | — | — | — |
| `@pryzm/geometry-beam` | window.xStore reads (minor, BeamStore) | LP-01 | Phase E.beam.S | Sprint E.beam |
| `@pryzm/geometry-roof` | window.dispatchEvent (4 sites in RoofStore) | LP-05 | Phase E.roof.S | Sprint E.roof |

---

### 4C — LEGACY-ZONE packages (highest debt, most migration effort)

These packages carry the highest concentration of pre-PRYZM3 patterns. They require a dedicated migration sprint to reach TRANSITIONAL-ZONE.

| Package | Severity | Rationale |
|---|---|---|
| `@pryzm/ai-host` | ⚠️ HIGHEST | 44+ window global accesses, 20+ CustomEvent dispatches, self-flagged CONTRACT VIOLATION in WallRegionExtractor.ts. The entire AIReadModel is a window-store reader. |
| `@pryzm/command-registry` | ⚠️ HIGH | 165 structuredClone snapshots, commandManager:any in plan executors, one typed bridge site. The package IS the legacy mutation system. Retirement depends on Phase E.5.x completion. |
| `@pryzm/core-app-model` | ⚠️ HIGH | 92 window access sites, active StoreEventBus (not yet replaceable by Yjs until Phase G3-T2). BatchCoordinator accepts `commandManager: any`. |
| `@pryzm/legacy-shim` | ✅ DEPRECATED | Zero importers, DROP per Wave 12. |

---

## §5 — Per-Plugin Classification

The 47 plugins occupy L9 of the layered model. The L7/L9 boundary gate (`check-l7-boundary.ts`) enforces that plugins MUST NOT import `@pryzm/command-bus`, `@pryzm/runtime-composer`, or any lower-level internal package directly — they access the platform via `@pryzm/plugin-sdk` only.

### 5A — COMPLIANT plugins

These plugins use `PluginActivationContext` for all store access and `runtime.commandBus.dispatch()` for all mutations.

| Plugin | Key pattern verified |
|---|---|
| `plugins/wall` | `runtime.commandBus.dispatch()` — 3 dispatch sites |
| `plugins/rooms` | `runtime.commandBus.dispatch()` — 3 dispatch sites |
| `plugins/selection` | `runtime.commandBus.dispatch()` — 6 dispatch sites |
| `plugins/multiplayer` | `runtime.commandBus.dispatch()` — 5 dispatch sites |
| `plugins/sheets` | `runtime.commandBus.dispatch()` — 4 dispatch sites |
| `plugins/schedules` | `runtime.commandBus.dispatch()` — 3 dispatch sites |
| `plugins/plan-view` | `runtime.commandBus.dispatch()` — 3 dispatch sites |
| `plugins/bcf` | `runtime.commandBus.dispatch()` — 4 dispatch sites |
| `plugins/toy-cube` | Reference plugin — compliant |
| `plugins/navigate` | Compliant (0 L7 violations after OI-003 fix) |
| `plugins/visibility-intent` | Intent-only; no store writes |
| All other geometry plugins (ceiling, column, beam, curtain-wall, door, floor, furniture, grid, handrail, ifc-export, ifc-import, ifc-inspector, levels, lighting, plumbing, render, rhino-import, roof, section-view, slab, stair, structural, view, window) | Verified no window-global access |

### 5B — TRANSITIONAL-ZONE plugins

| Plugin | Primary legacy pattern(s) | LP tags | Migration phase |
|---|---|---|---|
| `plugins/annotations` | All 12 annotation commands use `window.annotationStore ?? null` fallback. OBCAnnotationAdapter uses `window.commandManager` directly. LevelDatumLineBuilder + SectionGridLineBuilder use `window.bimManager + window.commandManager`. Annotation tools read `window.doorStore`, `window.gridStore`, `window.wallStore`, `window.windowStore`, `window.viewDefinitionStore`. ViewLinkResolver uses `(window as any).sheetStore`. | LP-01, LP-02, LP-03, LP-08 | Phase E.annotations: migrate annotation commands to use `HandlerContext.stores.annotationStore` via a registered handler; register all annotation tools via `context.runtime.stores.*` injection at `activate()` time. |

### 5C — Plugin-NEW-code rule

Any new plugin written after 2026-05-16 MUST be COMPLIANT from day one. The template is `plugins/toy-cube/` — it activates via `PluginActivationContext`, dispatches via `context.runtime.commandBus.dispatch()`, reads stores via `context.runtime.stores.*`, and emits events via `context.runtime.events.emit()`. No exceptions.

---

## §6 — Scripts and GA Gate Enforcement

### 6A — Current GA gate inventory (15 gates)

The following 15 gates MUST all exit 0 before any merge (`tools/ga-gate/run-all.ts`):

| # | Gate script | What it enforces | Status |
|---|---|---|---|
| 1 | `check-cast-count.ts` | `(window as any)` cast ratchet = 0 | ✅ Passing |
| 2 | `check-raf-count.ts` | Single rAF owner (1 allowed) | ✅ Passing |
| 3 | `check-three-imports.ts` | `import * as THREE` only in renderer-three and geometry packages | ✅ Passing |
| 4 | `check-engine-bootstrap-loc.ts` | EngineBootstrap.ts deleted (0 LOC) | ✅ Passing |
| 5 | `check-l7-boundary.ts` | No direct `@pryzm/*` L1+ imports in plugins | ✅ Passing |
| 6 | `check-motion-gate-coverage.ts` | Camera motion gate coverage in views | ✅ Passing |
| 7 | `check-otel-spans.ts` | 184/184 handler OTel spans | ✅ Passing |
| 8 | `check-ctrl-z-wired.ts` | Ctrl+Z ring-buffer wired (C03 §4.3) | ✅ Passing |
| 9 | `check-project-isolation.ts` | Project isolation anchors (C13) | ✅ Passing |
| 10 | `check-no-commandmanager.ts` | `window.commandManager` literal = 0 | ✅ Passing ⚠️ see Gap G1 |
| 11 | `check-no-workspacemountbridge.ts` | WorkspaceMountBridge eliminated | ✅ Passing |
| 12 | `check-per-package-compile.ts` | All packages compile with `tsc --noEmit` | ✅ Passing |
| 13 | `check-scene-graph.ts` | No NME proxy-in-scene regression | ✅ Passing |
| 14 | `check-geometry-ceiling.ts` | `releaseGroups disposeProxies` ceiling | ✅ Passing |
| 15 | `check-apps-editor-ghost-dirs.ts` | No ghost directories in apps/editor | ✅ Passing |

### 6B — GA Gate Gaps (proposed new gates)

The following patterns are **not caught by any existing gate** and MUST have gates added to prevent regression.

| Gate ID | Pattern detected | Proposed script | Priority |
|---|---|---|---|
| **G-NEW-01** | Aliased `commandManager.execute()` — `const cmdMgr = window.commandManager; cmdMgr.execute(...)`. The existing `check-no-commandmanager.ts` only matches the literal string `window.commandManager`, not aliased references. | `check-cmdmgr-alias.ts` — grep `cmdMgr\.execute\b\|commandManager\.execute\b` in all `.ts` files excluding `CommandManager.ts` and `global-bridge.ts`; baseline the current count (143); ratchet downward on each E.5.x sprint. | **P0** — closes OI-042 |
| **G-NEW-02** | `window.xStore` access from `packages/` — packages should never read from `window` globals. | `check-window-store-in-packages.ts` — grep `window\.\w*Store\b` in `packages/**/*.ts` excluding `command-registry/global-bridge.ts` and `command-registry/CommandManager.ts` (the two permitted bridge sites); hard-fail at > baseline. | **P1** |
| **G-NEW-03** | `window.dispatchEvent(new CustomEvent(...))` from `packages/` — packages must use `runtime.events.emit()`. | `check-custom-event-packages.ts` — grep `window\.dispatchEvent.*CustomEvent\|document\.dispatchEvent` in `packages/**/*.ts`; baseline 447; ratchet downward. | **P1** |
| **G-NEW-04** | `commandManager: any` typed parameter in packages — erodes the type contract between the mutation system and its callers. | `check-commandmanager-any.ts` — grep `commandManager:\s*any\b` in `packages/**/*.ts` excluding `CommandManager.ts`; hard-fail on any new occurrence. | **P2** |
| **G-NEW-05** | `structuredClone` used in new commands — any new command file added after 2026-05-16 that uses `structuredClone` for undo snapshots is a contract violation. | `check-structuredclone-new-commands.ts` — compare `structuredClone` count in `packages/command-registry/src/` against a monotonically shrinking baseline; any increase is a hard-fail. | **P2** |

### 6C — Script inventory assessment

Scripts in `scripts/` and `tools/` are **not shipped code** but can introduce regressions if they reference stale paths or perform codemods incorrectly. Key findings:

| Script | Status | Risk |
|---|---|---|
| `scripts/wave10-fix-placeholder-stores.mjs` | Historical — do not re-run | Could reintroduce placeholder patterns if re-executed |
| `scripts/wave10-migrate-core.mjs` | Historical — do not re-run | Targeted a migration that is now complete |
| `scripts/codemod-restructure-2026-04-30.mjs` | Historical | Import paths it updated may have changed again |
| `scripts/retarget-todo-b.mjs` | **Active** — tags TODO(B) markers with `(window as any)` context | Produces valid TODO metadata; safe to re-run |
| `scripts/track-window-cast-count.mjs` | **Active** — used by CI to enforce cast ratchet | Must be updated when `window-dev-augment.d.ts` adds new slots |
| `scripts/write-prod-shim.mjs` | **Active** — generates prod-mode window shim | Must be kept in sync with `window-shim.ts` typed augmentation |
| `tools/ga-gate/check-no-commandmanager.ts` | **Active** ⚠️ aliasing loophole | **Needs update** per G-NEW-01 above |
| `scripts/check-pryzm3-exists.ts` | **Active** — checks convergence booleans | Update to also verify `cmdMgr.execute` count is shrinking |
| `packages/legacy-shim/` | **Deprecated** — DROP | Zero importers; delete in Wave 12 cleanup sprint |

---

## §7 — Migration Phase Summary

The following table maps each legacy-pattern category to the PRYZM3 migration phase that will eliminate it, in priority order.

| Phase | LP tags addressed | Key work | Unblocked by |
|---|---|---|---|
| **E.5.x** (command flip) | LP-02, LP-03, LP-04 (new commands) | Flip 143 `cmdMgr.execute()` sites in `apps/editor/src/` to `commandBus.dispatch()`; delete `global-bridge.ts`; update IFC converters | CommandBus wired in `engineLauncher.ts` (already done) |
| **E.wall.S through E.furniture.S** | LP-01 (store reads) | Wire `runtime.stores.*` slots for each element type; replace `window.xStore` in UI, tool, and geometry packages | Phase E.5.x (commandBus wired) |
| **E.annotations** | LP-01, LP-02, LP-08 | Migrate `plugins/annotations` commands and tools to `HandlerContext.stores` + `commandBus.dispatch()` | Phase E.5.x |
| **E.ifc** | LP-03, LP-10 | Inject `CommandBus` into `IfcConversionContext`; replace `commandManager:any` in 9 IFC converters | Phase E.5.x |
| **D.4** | LP-01, LP-08 | `window.bimManager` → `runtime.scene.*`; inject runtime into `AIReadModel` constructor | PRYZM3 runtime composed (already done) |
| **F.ai** | LP-05 (ai-host) | Replace `window.dispatchEvent(new CustomEvent('ai-proposal-added'))` with `runtime.events.emit('ai.proposalAdded')` in QueryEngine.ts | Phase E.5.x + structured AI events spec |
| **G3-T2** | LP-05 (StoreEventBus) | Replace `StoreEventBus` batch coordination with Yjs per-level `Y.Doc` boundary | Yjs per-level split (ADR-049 — already implemented) |
| **Wave 12** | LP-09 | Delete `packages/legacy-shim/` | Phase E close (no importers already confirmed) |

---

## §8 — Enforcement Summary for New Code

The following rules apply to **all new code** written after 2026-05-16, without exception. Legacy violations in existing code are tracked as technical debt with phase assignments above; they do not create carve-outs for new code.

```
NEW CODE IN packages/ MUST:
  ✅ Use runtime.commandBus.dispatch() for all element mutations
  ✅ Use HandlerContext.stores.xStore for all store reads inside handlers
  ✅ Use runtime.events.emit() for all inter-subsystem notifications
  ✅ Use only @pryzm/package-name imports (never relative cross-package paths)
  ✅ Use produceWithPatches + RingBufferUndoStack.push() for all new undo-able mutations
  ✅ Declare commandBus/runtime as typed parameter (never any)

NEW CODE IN packages/ MUST NOT:
  ❌ Access window.xStore (any store)
  ❌ Access window.commandManager or create cmdMgr aliases
  ❌ Access window.bimManager, window.xBuilder, window.presentationEngine
  ❌ Use (window as any) (gate hard-fail)
  ❌ Use window.dispatchEvent(new CustomEvent(...)) or document.dispatchEvent(...)
  ❌ Use structuredClone for undo snapshots
  ❌ Type commandManager parameters as any
  ❌ Import from relative paths that cross the package boundary
  ❌ Import storeEventBus outside @pryzm/core-app-model

NEW CODE IN plugins/ MUST:
  ✅ Use context.runtime.commandBus.dispatch() for mutations
  ✅ Use context.runtime.stores.* for store reads
  ✅ Use context.runtime.events.emit() for events
  ✅ Follow the toy-cube plugin as the canonical template

NEW CODE IN plugins/ MUST NOT:
  ❌ All the same prohibitions as packages/ above
  ❌ Import @pryzm/command-bus, @pryzm/runtime-composer, or any L1+ package directly
     (use @pryzm/plugin-sdk curated facade only — L7 boundary gate enforces this)

NEW CODE IN scripts/ AND tools/ga-gate/ MUST:
  ✅ Reference file paths using constants defined at the top of the script
  ✅ Produce exit code 0 on success, non-zero on failure (gates must be machine-readable)
  ✅ Document what they measure, the ratchet direction, and the baseline value
  ✅ Be added to tools/ga-gate/run-all.ts when they become a CI requirement

NEW SCRIPTS MUST NOT:
  ❌ Execute codemods without a dry-run flag and explicit confirmation
  ❌ Re-run historical migration scripts (wave10-*.mjs, codemod-restructure-*.mjs)
     against the current codebase without verifying that their preconditions still hold
```

---

## §9 — How to amend this contract

1. If a legacy pattern in §3 is eliminated from its last file, add a ✅ ELIMINATED stamp with the sprint reference to that pattern's entry. Do NOT remove the entry — the history matters.
2. If a new package or plugin is added, add a row to §4 or §5. All new additions MUST start as COMPLIANT.
3. If a new legacy pattern category is discovered, add it as LP-NN to §3 with all required fields (Found in, Why it exists, Target pattern, Migration phase).
4. When a proposed gate from §6B is implemented, move its row from the "proposed" table to the §6A inventory table and mark it ✅ Passing.
5. Do NOT create companion `*-AUDIT-YYYY-MM-DD.md` files. Edit this contract directly.

---

*Last full sweep: 2026-05-16 — Initial audit of 80 packages, 46 plugins, 27 scripts, 15 GA gates. 10 legacy pattern categories (LP-01 through LP-10) catalogued. 5 new gate gaps (G-NEW-01 through G-NEW-05) identified. Package and plugin classifications set.*

*Refresh: 2026-06-01 — Counts re-verified against repo: 79 packages, 47 plugins, ~50 scripts, 21 GA gates. The LP-01 through LP-10 pattern catalogue remains binding; specific package counts in §1 / §10 reflect the 2026-06-01 reality.*
