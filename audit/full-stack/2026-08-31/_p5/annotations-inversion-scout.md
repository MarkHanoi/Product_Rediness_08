# LANE 7B2-SCOUT — the F-P5-04 upward-import inversion plan (READ-ONLY)

**Date**: 2026-08-31 · **HEAD at measurement**: `05cb61e0` · Lane changed ZERO production files.
**Subject**: F-P5-04 — 54 of the repo's 102 upward imports target two L6 plugins consumed as
contract layers: `plugins/annotations` (**45**) and — the second plugin F-P5-04 names —
`plugins/structural` (**9**). Source: `audit/full-stack/2026-08-31/_p5/manual.json` F-P5-04
(attribution by `attribute.mjs` over the gate's violations list).
**Evidence base read first**: `audit/full-stack/2026-08-31/legacy-work/no-registration-families-measurement.md`
(L2b) — confirms the annotation consumer mechanics this plan repoints (canvas-pass pipeline reads
the SUBSYSTEM `annotationStore` from `PlanViewCanvas.ts:4,636`; `annotation:*` events are outside
`GEOMETRY_ELEMENT_TYPES`; §ANN-ONE-STORE sink).
**Hard rules honored**: no ceiling raised, no gate disabled, no gate-debt entry, no rival built,
no new bridges (every move relocates an existing symbol; the one new *file* is a split of existing
state, not a parallel mechanism), nothing committed.

Gate mechanics that shape this plan (read from `tools/ga-gate/check-layer-boundaries.ts`):
- Violations are counted **per import statement** (IMPORT_RE match), tests/`__tests__`/`.d.ts` excluded.
- `import type {…} from` and **type-position `import('x')`** count the same as value imports —
  typifying an import does NOT shrink the number; the statement must be removed or repointed.
- Comments are stripped (§COMMENT-BLIND) — `packages/schemas/src/index.ts:223` mentions
  `@pryzm/plugin-annotations` in a comment only; it is correctly NOT in the 45.
- The sdk-bypass arm (`plugins/**` importing a workspace package that is neither `plugin-sdk` nor
  another plugin) is a SEPARATE shrink-only ratchet (171/182). Every plugin-side repoint below goes
  through `@pryzm/plugin-sdk` so that arm moves DOWN, never up.
- `RESTRICTED_MODULES`: `@thatopen/components` is allowed only from `plugins/ifc-import/` —
  relevant to `OBCAnnotationAdapter.ts` (see §3.1e: we split rather than move it).

---

## §1 — Measured import inventory (per file, per symbol, per class)

Commands used (each <5s):
`grep -rn "@pryzm/plugin-annotations" packages/ --include=*.ts --include=*.tsx | grep -v node_modules`
and the same for `@pryzm/plugin-structural`. Line numbers from this tree at `05cb61e0`.

### 1a. `@pryzm/plugin-annotations` ← packages/** — 45 gate-counted statements, 21 src files, 7 packages

| # | importer file : line | symbols | class |
|---|---|---|---|
| 1 | `packages/command-registry/src/annotations/AnnotateViewCommand.ts:18` | `makeAnnotationElement` RUNTIME · `AnnotationSemantics` TYPE · `AnnotationType` TYPE | mixed |
| 2 | `…/AnnotateViewCommand.ts:19` | `makePointRef`, `makeRef` | RUNTIME |
| 3 | `…/CreateAnnotationCommand.ts:1` | re-export `CreateAnnotationCommand` | RUNTIME |
| 4–5 | `…/CreateCalloutDetailCommand.ts:1,2` | re-export `CreateCalloutDetailCommand` RUNTIME · `CreateCalloutDetailParams` TYPE | mixed |
| 6–7 | `…/CreateElevationMarkCommand.ts:1,2` | `CreateElevationMarkCommand` RUNTIME · `CreateElevationMarkParams` TYPE | mixed |
| 8 | `…/CreateManyAnnotationsCommand.ts:15` | re-export `CreateManyAnnotationsCommand` | RUNTIME |
| 9–10 | `…/CreateSectionMarkCommand.ts:1,2` | `CreateSectionMarkCommand` RUNTIME · `CreateSectionMarkParams` TYPE | mixed |
| 11 | `…/DeleteAnnotationCommand.ts:1` | re-export `DeleteAnnotationCommand` | RUNTIME |
| 12–13 | `…/LockAnnotationCommand.ts:1,2` | `LockAnnotationCommand` RUNTIME · `LockAnnotationOptions` TYPE | mixed |
| 14 | `…/UpdateAnnotationCommand.ts:1` | re-export `UpdateAnnotationCommand` | RUNTIME |
| 15 | `…/UpdateConstraintCommand.ts:1` | re-export `UpdateConstraintCommand` | RUNTIME |
| 16 | `packages/command-registry/src/project/ClearProjectCommand.ts:37` | `annotationStore` (singleton, `.clear()` path) | RUNTIME |
| 17–22 | `packages/command-registry/src/types.ts:565,566,567,580,586,592` | `import('@pryzm/plugin-annotations').AnnotationStore` / `AnnotationVisibilityStore` / `ConstraintStore` / `ConstraintSolver` / `ResolverStores` / `AnnotationDependencyGraph` | TYPE-ONLY (6 statements — the gate's dynamic-import arm counts each) |
| 23 | `packages/core-app-model/src/views/PlanViewAnnotationRenderer.ts:22` | `annotationStore` | RUNTIME |
| 24 | `…/PlanViewAnnotationRenderer.ts:23–28` | `AnnotationElement` TYPE · `AnnotationStyle` TYPE · `DEFAULT_ANNOTATION_STYLE` RUNTIME · `DimensionElement` TYPE | mixed |
| 25 | `…/PlanViewAnnotationRenderer.ts:29` | `formatDimension` | RUNTIME |
| 26 | `packages/core-app-model/src/views/PlanViewCanvas.ts:4` | `annotationStore` (the L2b canvas-pass read, `:636`) | RUNTIME |
| 27 | `packages/file-format/src/export/sheets/AnnotationDxfBridge.ts:3` | `annotationStore` RUNTIME · `AnnotationStore` TYPE | mixed |
| 28 | `…/AnnotationDxfBridge.ts:4` | `AnnotationElement` | TYPE |
| 29 | `…/SVGCompositeRenderer.ts:27` | `AnnotationElement` (`import type`) | TYPE-ONLY |
| 30 | `…/ViewportSvgComposer.ts:55` | `annotationStore` | RUNTIME |
| 31 | `…/ViewportSvgComposer.ts:56` | `AnnotationElement` (`import type`) | TYPE-ONLY |
| 32 | `packages/geometry-roof/src/RoofSlopeSymbolBuilder.ts:40` | `makeAnnotationElement` | RUNTIME |
| 33 | `…/RoofSlopeSymbolBuilder.ts:41` | `makePointRef` | RUNTIME |
| 34 | `packages/input-host/src/ToolManager.ts:19–34` | 14 tool classes: `LinearDimensionAnnotationTool, TextNoteTool, ElementTagTool, AngularDimensionAnnotationTool, SpotElevationAnnotationTool, KeynoteTool, RadiusDimensionTool, DiameterDimensionTool, SlopeDimensionTool, DoorTagTool, WindowTagTool, LevelTagTool, GridBubbleTool, RevisionCloudTool` | **TYPE-ONLY in fact** — verified: zero `new X` / `instanceof X` in the file; classes appear only as nullable field types and `set*Tool(tool: X)` parameter types; the ONLY member ever called is `.activate()` (14 call sites, e.g. `:716,:728,:740`). Instances are constructed at L7 (`initTools.ts`, F-P5-05) and injected. |
| 35 | `packages/persistence-client/src/loader/ProjectLoader.ts:68` | `annotationStore` | RUNTIME |
| 36–37 | `…/ProjectLoader.ts:1427,1430` | `constraintStore` (dynamic import, `.deserialize()`/`.clear()`) | RUNTIME |
| 38 | `…/ProjectLoader.ts:1439` | `annotationVisibilityStore` (dynamic, `.fromJSON()`) | RUNTIME |
| 39 | `…/ProjectLoader.ts:1452` | `obcAnnotationAdapter` (dynamic, `.deserialize()`) | RUNTIME |
| 40 | `…/ProjectSerializer.ts:78` | `annotationStore` | RUNTIME |
| 41 | `…/ProjectSerializer.ts:80` | `constraintStore` | RUNTIME |
| 42 | `…/ProjectSerializer.ts:81` | `annotationVisibilityStore` | RUNTIME |
| 43 | `…/ProjectSerializer.ts:82` | `obcAnnotationAdapter` (`.serialize()`) | RUNTIME |
| 44 | `packages/room-topology/src/RoomTagAutoPopulator.ts:25` | `makeAnnotationElement` | RUNTIME |
| 45 | `…/RoomTagAutoPopulator.ts:26` | `makePointRef` | RUNTIME |

Not counted by the gate but must repoint in the same lanes (tests):
`packages/command-registry/__tests__/GridDeleteSweepsBubbleAnnotations.test.ts:46`
(`AnnotationStore`, `makeAnnotationElement`), `packages/core-app-model/src/views/__tests__/tagPaperScale.test.ts:26`
and `tagProjection.test.ts:18` (`annotationStore`, `makeAnnotationElement`, `makePointRef`).

### 1b. `@pryzm/plugin-structural` ← packages/** — 9 statements, 6 files, 3 packages

| # | importer file : line | symbols | class |
|---|---|---|---|
| 1 | `packages/geometry-beam/src/BeamFragmentBuilder.ts:33` | `SteelProfileLibrary` | RUNTIME |
| 2 | `…/BeamFragmentBuilder.ts:34` | `createBeamLOD` | RUNTIME |
| 3 | `packages/geometry-column/src/ColumnFragmentBuilder.ts:48` | `SteelProfileLibrary` | RUNTIME |
| 4 | `…/ColumnFragmentBuilder.ts:49` | `createColumnLOD` | RUNTIME |
| 5 | `packages/geometry-column/src/ColumnPlanSymbolBuilder.ts:41` | `SteelProfileLibrary` | RUNTIME |
| 6 | `packages/geometry-column/src/ColumnTool.ts:19` | `SteelProfileLibrary` | RUNTIME |
| 7 | `…/ColumnTool.ts:20` | `generateColumnISection` | RUNTIME |
| 8 | `packages/geometry-column/src/ColumnValidator.ts:2` | `SteelProfileLibrary` | RUNTIME |
| 9 | `packages/input-host/src/BeamTool.ts:13` | `SteelProfileLibrary` (`.defaultUB()/.defaultUC()/.get()/.UB/.UC` at `:37,207,243,246,291,292,310,333`) | RUNTIME |

Both inventories reconcile EXACTLY with F-P5-04's per-package attribution
(cr 22 · pc 9 · ff 5 · cam 4 · roof 2 · room-topology 2 · input-host 1 = 45; col 6 · beam 2 · ih 1 = 9).

---

## §2 — Definition sites and dependency closure

### 2a. Annotation symbols — all in a closed 9-file cluster + one split

| symbol(s) | defined at | file's own deps |
|---|---|---|
| `makeStableKey, makeRef, makePointRef, makeWallFaceRef, resolveReferenceToPoint, StableReference, ResolverStores, SubElementType` | `plugins/annotations/src/subsystem/AnnotationReference.ts` (`makeRef:70`, `makePointRef:85`, `ResolverStores:140`) | `@pryzm/renderer-three/three` (RUNTIME `new THREE.Vector3` etc.) — L1, downward from L2 |
| `AnnotationType:20, AnnotationStyle:60, DEFAULT_ANNOTATION_STYLE:71, AnnotationSemantics:107, AnnotationElement:138, DimensionElement:216, makeAnnotationElement:311` (+ `AnnotationGeometry2D, DimPoint2D, LinearDimSegment`, §ANN-TYPE category tables) | `…/subsystem/AnnotationTypes.ts` | `./AnnotationReference` only |
| `validateAnnotationParameters` | `…/subsystem/AnnotationParametersSchema.ts` | `zod` + `./AnnotationTypes` |
| `AnnotationStore` (class `:86`), `annotationStore` (singleton `:440`) | `…/subsystem/AnnotationStore.ts` | `storeEventBus`, `projectScopeRegistry` from `@pryzm/core-app-model` (:26, :442) + Types + ParametersSchema |
| `AnnotationVisibilityStore:24`, `annotationVisibilityStore:150` | `…/subsystem/AnnotationVisibilityStore.ts` | Types + `projectScopeRegistry` (`@pryzm/core-app-model:152`) |
| `ConstraintStore:54`, `constraintStore:214`, `ConstraintRecord`, `ConstraintOperator` | `…/subsystem/ConstraintStore.ts` | Reference + Types + `projectScopeRegistry` (:216) |
| `ConstraintSolver:84`, `constraintSolver` | `…/subsystem/ConstraintSolver.ts` | Reference + ConstraintStore |
| `AnnotationDependencyGraph:34` | `…/subsystem/AnnotationDependencyGraph.ts` | `storeEventBus, StoreChangeEvent` (`@pryzm/core-app-model:27`) + Store + Types + Reference |
| `formatDimension:18`, `DimensionUnit` | `…/subsystem/DimensionFormatter.ts` | **zero imports** (pure). NOT a duplicate of `packages/geometry-kernel/src/dimensions/evaluator.ts:409 formatDimension(valueMm, UnitFormat)` — different signature (`distanceMetres, unit-string, prefix/suffix/override`), different unit model; both legitimately exist. |
| `obcAnnotationAdapter` (used by persistence ONLY via `.serialize()`/`.deserialize()`) | `plugins/annotations/src/OBCAnnotationAdapter.ts:208`; `serialize():20` / `deserialize():24` operate on a private `Map<string,string>` `_uuidToAnnotationId` — **pure id-map, no OBC touch**. The rest of the class subscribes to `OBC.LinearAnnotations/AngleAnnotations/SlopeAnnotations` (`@thatopen/components`, RESTRICTED to `plugins/ifc-import/`) and imports the command classes. | split target — see §3.1e |
| 9 command classes (`CreateAnnotationCommand`, `CreateManyAnnotationsCommand`, `CreateCalloutDetailCommand`, `CreateElevationMarkCommand`, `CreateSectionMarkCommand`, `DeleteAnnotationCommand`, `LockAnnotationCommand` + `LockAnnotationOptions:19`, `UpdateAnnotationCommand`, `UpdateConstraintCommand`) | `plugins/annotations/src/commands/*.ts` | `../legacy-command-protocol` (self-contained copy; its own header says the canonical protocol lives elsewhere) + subsystem Types/ConstraintStore types + `viewDefinitionStore`/`viewIntentInstanceStore`/`ViewSpatialContext` from `@pryzm/core-app-model` (Callout/Elevation/SectionMark) + `pointInPolygonXZ` from `@pryzm/plugin-sdk` (real definition: `@pryzm/geometry-kernel`, per plugin-sdk `src/index.ts:355–372` §C73-PIP-CANONICAL) |
| 14 tool classes | `plugins/annotations/src/tools/*.ts` | heavy plugin-internal + UI deps — **they do not move** (see §3.1d) |

The 9 subsystem files form a dependency-closed set: nothing in it imports anything above
`@pryzm/core-app-model` (L2), `@pryzm/renderer-three` (L1), `zod`. That is what makes the
inversion mechanical.

### 2b. Structural symbols — two files, one dependency edge between them

| symbol | defined at | deps |
|---|---|---|
| `SteelProfileLibrary` (const catalogue `:97`), `SteelProfile`, `SectionSeries` | `plugins/structural/src/SteelProfileLibrary.ts` | **zero imports** — its own header: "pure data module, no THREE.js, no store access" |
| `generateColumnISection:129`, `createColumnLOD:237`, `createBeamLOD:259` (+ `generateBeamISection`, `LODLevel`, geo cache) | `plugins/structural/src/ISectionGenerator.ts` | `@pryzm/renderer-three/three` (RUNTIME — returns `THREE.BufferGeometry`/`THREE.LOD`) + `./SteelProfileLibrary` |

Measured: NOTHING else inside `plugins/structural/src` uses either file except `index.ts`
re-exports — the committer/tool/handlers never import them. The two files are pure cargo.

---

## §3 — Inversion design

Principle: every symbol moves to the LOWEST existing package that (a) already contains its
dependency closure and (b) is already a dependency of every importer. No new workspace package is
needed anywhere — every candidate slot is existing.

### 3.1 Annotations

**a) The 9-file subsystem cluster → `packages/core-app-model` (L2), new dir `src/annotations/`.**
Why core-app-model and not the alternatives:
- The cluster already imports core-app-model (`storeEventBus`, `projectScopeRegistry`,
  `StoreChangeEvent`) — any OTHER home keeps a core-app-model edge AND adds a new package
  between; core-app-model is the unique home where those edges become internal.
- `core-app-model ↔ plugin-annotations` is today a package-level CYCLE (core-app-model imports
  the plugin's store in `PlanViewCanvas.ts:4` / `PlanViewAnnotationRenderer.ts:22-29`, and the
  plugin's subsystem imports core-app-model). The move COLLAPSES the cycle instead of relocating it.
- Every one of the 7 importer packages already imports core-app-model in code
  (command-registry 196 files, file-format 32, persistence-client 7, geometry-roof 11,
  room-topology 40, input-host 20, core-app-model itself) — every repoint is an
  existing-dependency edge, downward (L4/L3→L2) or lateral (L2→L2, which the gate's table allows,
  as the 196 existing command-registry→core-app-model files prove).
- Rejected homes, each for a named reason:
  `packages/schemas` (L0) — P5 hard gate: zero THREE, and `AnnotationReference` constructs
  `THREE.Vector3` at runtime; the stores also carry event-bus wiring (I/O-adjacent), which
  `check-domain-purity` would trip on.
  `packages/drawing-primitives` (L2) — its file headers declare "ZERO `three` imports" as a
  charter (Node-loadable Canvas2D committer); AnnotationReference breaks it.
  `packages/constraint-solver` (L2) — different domain (wall/room geometric constraint engine);
  it also imports core-app-model itself, so co-locating gains nothing and muddies two solvers.
  `packages/auto-dimension` (L2) — charter is "PURE … No THREE/DOM/I/O"; same disqualifier.
  `packages/stores` (L3) — already exports a RIVAL `AnnotationStore` (Zustand slice); landing the
  subsystem class beside it manufactures the exact two-stores-one-name confusion §ANN-ONE-STORE
  exists to prevent, and L3 is ABOVE two of the importers' layer (geometry-roof/room-topology at L2
  → L3 would mint new upward imports).
  New package — nothing above disqualifies core-app-model, so the "no new package" preference wins.
- Intra-package rule for the moved files (SCC memory `scc-no-barrel-access-at-module-load`):
  rewrite their `@pryzm/core-app-model` imports as RELATIVE deep imports (e.g.
  `../stores/...`/wherever `storeEventBus` and `projectScopeRegistry` live), never the package's
  own barrel — a self-barrel import at module load is the white-screen SCC shape.

**b) The 9 command classes → `packages/command-registry/src/annotations/` (L2), replacing the
re-export shims at the SAME file paths.** The shim files (`CreateAnnotationCommand.ts` etc.)
already sit there — the class bodies move into them, so every existing `@pryzm/command-registry`
consumer keeps its import path. Protocol: adopt `../types` — verified compatible:
`CommandType` in `packages/command-registry/src/types.ts` already defines ALL EIGHT annotation
values (`CREATE_ANNOTATION:332`, `DELETE_ANNOTATION:333`, `UPDATE_ANNOTATION:334`,
`LOCK_ANNOTATION:336`, `UPDATE_CONSTRAINT:338`, `CREATE_SECTION_MARK:351`,
`CREATE_ELEVATION_MARK:352`, `CREATE_CALLOUT_DETAIL:354`; `CreateManyAnnotationsCommand` reuses
`CREATE_ANNOTATION` — verified at its `:49`), and the `Command` interface (`types.ts:654`) differs
from the plugin's `legacy-command-protocol` only in `type: CommandType` vs `type: string` — the
enum literals are string-identical by that file's own declared design. `pointInPolygonXZ`
repoints from `@pryzm/plugin-sdk` (which would be a NEW upward L2→L5 import — forbidden) to its
real definition `@pryzm/geometry-kernel` (existing dep, 5 files already).
`plugins/annotations/src/legacy-command-protocol.ts` then loses its last mover-side consumer and
stays behind only as a compat re-export for external users of `CommandType` etc.

**c) `types.ts:565-592` (6 statements)** — repoint the six `import('@pryzm/plugin-annotations').X`
type references to `import('@pryzm/core-app-model').X` after (a). Pure text substitution.

**d) `ToolManager.ts` — do NOT move the 14 tool classes; delete the import via a structural
type.** Measured: ToolManager never constructs or `instanceof`-checks them and calls exactly one
method, `.activate()` (optionally with no args). Fix: declare in `packages/input-host/src/types.ts`
(which already owns `ITool`/`ToolLifecycle`) a minimal
`interface InjectedAnnotationTool { activate(options?: Record<string, unknown>): void | Promise<void> }`
and type the 14 fields + 14 setters with it; delete the `@pryzm/plugin-annotations` import
statement. L7 `initTools.ts` keeps constructing concrete plugin classes and passing them in —
structurally compatible, zero runtime change. This is not a new bridge: the injection seam
(`set*Tool`) ALREADY exists; only its parameter type changes from nominal to structural.
(Moving 14 THREE/UI-heavy tools down was rejected: their dep closure spans plugin stores, panels,
persistAnnotation, WallFaceDetector — a 30+-file cascade for 1 statement that a type fixes.)

**e) `obcAnnotationAdapter` — SPLIT, don't move.** Persistence uses only `serialize()`/
`deserialize()`, which read/write a private `Map<string,string>` and never touch OBC. Moving the
whole adapter would relocate a `@thatopen/components` importer into `packages/core-app-model` —
`RESTRICTED_MODULES` allows that module only from `plugins/ifc-import/`, so the banned-3p count
stays but core-app-model becomes a restricted-import holder (wrong direction for an L2 domain
package, and fails the arm's allowlist just as the plugin does). Instead: extract the id-map as
`ObcAnnotationIdMap` (class + `obcAnnotationIdMap` singleton with `set/get/clear/serialize/deserialize`)
into `packages/core-app-model/src/annotations/ObcAnnotationIdMap.ts`; the plugin's
`OBCAnnotationAdapter` keeps ALL OBC subscription machinery and delegates its map operations to the
singleton (imported via `@pryzm/plugin-sdk` — see (f)); `ProjectLoader:1452` / `ProjectSerializer:82`
repoint to `obcAnnotationIdMap`. Existing state relocated, one owner, no rival, no new mechanism.

**f) The plugin keeps its ENTIRE public surface via shims routed through `@pryzm/plugin-sdk`.**
34 non-test files under `apps/**` + other `plugins/**` import `@pryzm/plugin-annotations`, and 45
files INSIDE the plugin import `./subsystem/*` relatively. Each moved file leaves a same-path shim
(`plugins/annotations/src/subsystem/AnnotationStore.ts` → `export { AnnotationStore, annotationStore } from '@pryzm/plugin-sdk'`),
so all 45 internal imports and the barrel keep working untouched, and NONE of the 34 external
importers changes. plugin→plugin-sdk is the blessed edge (sdk-bypass-neutral); plugin-sdk (L5) adds
downward re-exports from core-app-model (existing dep) — the exact §C73-PIP-CANONICAL precedent
written in plugin-sdk's own source ("surfaced through the SDK facade so a plugin never needs a
direct kernel import"). Two name collisions in the SDK, both verified: `AnnotationStore`
(plugin-sdk `src/index.ts:199`, the @pryzm/stores Zustand slice) and `formatDimension` (`:359`,
geometry-kernel's). Export the moved ones aliased — suggest `AnnotationSubsystemStore` and
`formatAnnotationDimension` — and let the plugin's shim files re-alias back to the original names,
so no consumer anywhere sees a rename. Commands: SDK also re-exports the 9 command classes from
`@pryzm/command-registry` (new SDK dep, L5→L2 downward), and the plugin barrel re-exports them from
the SDK — external consumers measured: 3 statements (2× `CreateAnnotationCommand`,
1× `DeleteAnnotationCommand`, all in `apps/editor`) keep working unchanged.

**What stays in `plugins/annotations`** (correctly L6): handlers/ (bus handlers +
`canonicalAnnotationSink`), tools/ (all 21), panels, `plan-view-adapter.ts`, `store.ts` (the Immer
DTO ledger — plugin-side by design), `intent.ts`, `errors.ts`, `annotation-styles.ts`,
`AnnotationManager/AnnotationRenderLayer`, OBC subscription half of the adapter, plantools/,
`AnnotationSystemTypeStore`, `TagPropertyResolver`, `ViewLinkResolver`, `WallDimensionRenderer`,
`purgeOrphanGridAnnotations`, `seedDemoAnnotations` — none is imported by any `packages/**` file
(measured: the 45-statement inventory in §1a is exhaustive).

### 3.2 Structural

**a) `SteelProfileLibrary.ts` → `packages/geometry-kernel` (L2), e.g. `src/structural/SteelProfileLibrary.ts`.**
Zero-dep pure data; geometry-kernel already owns the structural geometry domain
(`src/producers/structural.ts`, `producers/_shared/linear-structural.ts`, `StructuralProfile`) and
is THREE-free — this file keeps it so. Importers: geometry-column already deps geometry-kernel;
geometry-beam and input-host add it (downward/lateral, gate-neutral).
Rejected: `packages/schemas` — it is "pure Zod schemas" by charter and this is a catalogue+helpers
module, not a schema; geometry-kernel is the measured domain owner.

**b) `ISectionGenerator.ts` → `packages/geometry-column` (L2).** It is THREE-bearing (returns
`THREE.BufferGeometry`/`THREE.LOD`), so geometry-kernel's descriptor-only purity charter excludes
it. geometry-column is the dominant consumer (4 of 6 site-files; sole caller of
`generateColumnISection` and `createColumnLOD`) and already imports `@pryzm/renderer-three`.
`geometry-beam` imports `createBeamLOD` from geometry-column — a new LATERAL L2→L2 edge (allowed;
precedent: geometry-column→geometry-slab). Its internal import of SteelProfileLibrary repoints to
geometry-kernel. Rejected: splitting the file between column/beam (shared `_geoCache` +
I-shape builder would be duplicated — a rival); renderer-three (L1 is the THREE facade, not a
parts shop); a new `geometry-structural` package (two existing homes fit).

**c) `plugins/structural/src/index.ts`** keeps compat re-exports of both files via
`@pryzm/plugin-sdk` (SDK gains `SteelProfileLibrary` + generator re-exports; requires SDK →
geometry-column dep, downward). Measured: nothing else inside the plugin uses either file, so the
plugin's own code needs no other edit.

---

## §4 — Per-importer repoint list

After the moves land, one mechanical pass per importer (new specifiers in brackets):

| importer | repoint |
|---|---|
| `command-registry/src/annotations/*.ts` (11 files) | become the real classes; internal imports → `../types`, [`@pryzm/core-app-model`] (AnnotationTypes/Reference symbols, viewDefinitionStore, viewIntentInstanceStore), [`@pryzm/geometry-kernel`] (`pointInPolygonXZ`) |
| `command-registry/src/project/ClearProjectCommand.ts:37` | [`@pryzm/core-app-model`] `annotationStore` |
| `command-registry/src/types.ts` ×6 | `import('@pryzm/core-app-model').…` |
| `command-registry/__tests__/GridDeleteSweepsBubbleAnnotations.test.ts:46` | [`@pryzm/core-app-model`] |
| `core-app-model/src/views/PlanViewAnnotationRenderer.ts:22-29` (3 stmts) | RELATIVE `../annotations/…` (never own barrel) |
| `core-app-model/src/views/PlanViewCanvas.ts:4` | RELATIVE `../annotations/AnnotationStore` |
| `core-app-model/src/views/__tests__/tagPaperScale.test.ts:26`, `tagProjection.test.ts:18` | RELATIVE |
| `file-format/src/export/sheets/AnnotationDxfBridge.ts:3,4` · `SVGCompositeRenderer.ts:27` · `ViewportSvgComposer.ts:55,56` | [`@pryzm/core-app-model`] |
| `geometry-roof/src/RoofSlopeSymbolBuilder.ts:40,41` | [`@pryzm/core-app-model`] |
| `room-topology/src/RoomTagAutoPopulator.ts:25,26` | [`@pryzm/core-app-model`] |
| `input-host/src/ToolManager.ts:19-34` | DELETE the import; add `InjectedAnnotationTool` to `input-host/src/types.ts`; retype 14 fields + 14 setters |
| `persistence-client/src/loader/ProjectLoader.ts:68,1427,1430,1439` | [`@pryzm/core-app-model`] (static + dynamic) |
| `…/ProjectLoader.ts:1452` · `ProjectSerializer.ts:82` | [`@pryzm/core-app-model`] `obcAnnotationIdMap` |
| `…/ProjectSerializer.ts:78,80,81` | [`@pryzm/core-app-model`] |
| `geometry-beam/src/BeamFragmentBuilder.ts:33,34` | [`@pryzm/geometry-kernel`] `SteelProfileLibrary` · [`@pryzm/geometry-column`] `createBeamLOD` |
| `geometry-column/src/ColumnFragmentBuilder.ts:48,49` · `ColumnPlanSymbolBuilder.ts:41` · `ColumnTool.ts:19,20` · `ColumnValidator.ts:2` | [`@pryzm/geometry-kernel`] for `SteelProfileLibrary`; generator imports become RELATIVE (`./ISectionGenerator`) |
| `input-host/src/BeamTool.ts:13` | [`@pryzm/geometry-kernel`] |
| plugin-side (annotations): 45 internal `./subsystem/*` importer files | UNCHANGED (per-file shims re-export via `@pryzm/plugin-sdk`) |
| plugin-side (structural): `index.ts` | re-export via `@pryzm/plugin-sdk` |

Manifest changes (each requires the pnpm-lock sync — memory `agent-packagejson-breaks-frozen-lockfile`):
ADD `@pryzm/geometry-kernel` to geometry-beam + input-host; ADD `@pryzm/geometry-column` to
geometry-beam + plugin-sdk; ADD `@pryzm/command-registry` to plugin-sdk; ADD `@pryzm/core-app-model`
to persistence-client (**pre-existing gap** — 7 files already import it with no manifest entry, the
pnpm-partial-linking condition L-809 documents). DROP (post-verify) `@pryzm/plugin-annotations`
from core-app-model, command-registry, file-format, geometry-roof, input-host; DROP
`@pryzm/plugin-structural` from geometry-column, geometry-beam, input-host.

---

## §5 — File-disjoint fix lanes

Lanes are file-disjoint (no file appears in two lanes); ORDER MATTERS — A before B/C/D-annotations;
S1 before S2/S3. Every lane: root tsc foreground
(`NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json`, RC captured directly)
+ `npx tsx tools/ga-gate/check-layer-boundaries.ts` + the targeted suites named per lane.

- **LANE A — subsystem move + SDK + plugin shims** (the big one; everything here moves together
  because the 9 files are one dependency-closed cluster):
  `plugins/annotations/src/subsystem/{AnnotationReference,AnnotationTypes,AnnotationParametersSchema,AnnotationStore,AnnotationVisibilityStore,ConstraintStore,ConstraintSolver,AnnotationDependencyGraph,DimensionFormatter}.ts`
  (→ shims), `plugins/annotations/src/OBCAnnotationAdapter.ts` (id-map split),
  `packages/core-app-model/src/annotations/**` (new, incl. `ObcAnnotationIdMap.ts`),
  `packages/core-app-model/src/views/{PlanViewCanvas,PlanViewAnnotationRenderer}.ts`,
  `packages/core-app-model/src/views/__tests__/{tagPaperScale,tagProjection}.test.ts`,
  `packages/plugin-sdk/src/index.ts`, `packages/core-app-model/package.json`,
  `packages/plugin-sdk/package.json`, `packages/persistence-client/package.json`, lockfile.
  Also updates the two C101 citations (see §7.1). Verify: root tsc RC, layer gate,
  `pnpm --filter @pryzm/core-app-model test`, plugin-annotations suite.
- **LANE B — command classes into command-registry** (after A):
  `packages/command-registry/src/annotations/*.ts` (11), `packages/command-registry/src/types.ts`,
  `packages/command-registry/src/project/ClearProjectCommand.ts`,
  `packages/command-registry/__tests__/GridDeleteSweepsBubbleAnnotations.test.ts`,
  `plugins/annotations/src/commands/*.ts` (→ shims or deletion behind barrel re-export),
  `plugins/annotations/src/index.ts`, `plugins/annotations/src/legacy-command-protocol.ts` (compat
  note), `packages/command-registry/package.json` (drop plugin-annotations). MUST add OTel spans to
  each moved command's `execute()` (§7.2). Verify: root tsc, layer gate,
  `check-otel-spans.ts` RC + zone readout, command-registry suite.
- **LANE C — consumer repoints, annotations** (after A; touches no LANE A/B file):
  `packages/file-format/src/export/sheets/{AnnotationDxfBridge,SVGCompositeRenderer,ViewportSvgComposer}.ts`,
  `packages/persistence-client/src/loader/{ProjectLoader,ProjectSerializer}.ts`,
  `packages/geometry-roof/src/RoofSlopeSymbolBuilder.ts`,
  `packages/room-topology/src/RoomTagAutoPopulator.ts`. Verify: root tsc, layer gate, file-format +
  persistence suites; persistence round-trip test for the id-map (obcAnnotationMap slice unchanged
  on disk — same serialize shape `{version:1, entries}`).
- **LANE D — input-host type inversion** (independent of A/B/C except types landing):
  `packages/input-host/src/ToolManager.ts`, `packages/input-host/src/types.ts`. Verify: root tsc,
  layer gate, editor toolbar/tool activation tests.
- **LANE S1 — structural moves**:
  `plugins/structural/src/{SteelProfileLibrary,ISectionGenerator}.ts` (→ removal),
  `plugins/structural/src/index.ts` (SDK-routed shims),
  `packages/geometry-kernel/src/structural/SteelProfileLibrary.ts` (new home),
  `packages/geometry-column/src/ISectionGenerator.ts` (new home),
  `packages/geometry-kernel/src/index.ts`, `packages/geometry-column/src/index.ts` (exports),
  manifests: geometry-beam, input-host, plugin-sdk (if not already in LANE A's edit), lockfile.
- **LANE S2 — structural consumer repoints** (after S1):
  `packages/geometry-column/src/{ColumnFragmentBuilder,ColumnPlanSymbolBuilder,ColumnTool,ColumnValidator}.ts`,
  `packages/geometry-beam/src/BeamFragmentBuilder.ts`, `packages/input-host/src/BeamTool.ts`.
  Verify: root tsc, layer gate, column/beam fragment-builder tests, visual smoke of steel sections.

(LANE A conflicts with the uncommitted sibling-lane tree state noted in the L2b doc — coordinate
via the orchestrator; agents commit scoped CODE, orchestrator owns docs, per
`multi-agent-shared-tree-collisions`.)

## §6 — Expected delta (the numbers the gate should print)

- **Upward imports (`check-layer-boundaries` violations arm): 102 → 48** — REMOVES all 45
  plugin-annotations statements + all 9 plugin-structural statements; CREATES ZERO new upward
  imports (verified per repoint: every new edge is downward — L4→L2, L3→L2, L5→L2 — or lateral
  L2→L2, which the allow-table permits as the 196 existing command-registry→core-app-model files
  prove; the one edge that WOULD have been upward, moved-commands→plugin-sdk for
  `pointInPolygonXZ`, is repointed to geometry-kernel instead). Strict shrink; after landing,
  ratchet the baseline 102 → measured value (lowering a shrink-only baseline is the sanctioned
  direction; raising anything is not proposed anywhere in this plan).
- **sdk-bypass arm: 171 → ~164** (goes DOWN, does not merely hold): the moved plugin files carried
  ~7 bypass statements out of `plugins/**` — `AnnotationStore.ts:26,:442`, `ConstraintStore:216`,
  `AnnotationVisibilityStore:152`, `AnnotationDependencyGraph:27` (→ @pryzm/core-app-model),
  `AnnotationReference:16` and `ISectionGenerator:20` (→ @pryzm/renderer-three/three). All shims
  route via plugin-sdk (bypass-neutral). Exact figure: read the gate after landing, not this line.
- **banned-3p arm: 124 flat** — the id-map split deliberately leaves the `@thatopen/components`
  import where it already is counted.
- **unclassified: 13 flat.** No package is created or renamed.
- **Layer-table edits: none.** No `eslint.config.js` layer rows move.

## §7 — Risks and obligations (each with its gate)

1. **C101-ELEMENT-ANNOTATION cites the moving files** (`:60` → `plugins/annotations/src/subsystem/AnnotationTypes.ts:138`;
   `:62` → `…/AnnotationStore.ts:74`, singleton `:395` — line refs already drifted vs this tree's
   `:86/:440`, so they were stale before this plan). `tools/ga-gate/check-contract-cited-paths.ts`
   holds unresolved citations at a pinned baseline (491): if the shim files remain at the old paths
   the citations still RESOLVE (path-level), but the honest move is LANE A updating C101 in place
   to the new `packages/core-app-model/src/annotations/…` paths — C84 + C101 are mandatory reads
   for any annotation-family PR regardless (CLAUDE.md governance). Also re-run
   `check-contract-index-equivalence.ts` untouched (no contract minted).
2. **check-otel-spans Zone B** covers command-registry; the 9 moving command classes have ZERO
   span instrumentation today (measured: `grep -rln startSpan|@opentelemetry plugins/annotations/src/commands/` → 0)
   and Zone B was last read RED (54/70 vs baseline 52, 2026-08-18 note in CLAUDE.md). Moving them
   in uninstrumented would push Zone B further over. Obligation on LANE B: add ≥1 span per moved
   command's `execute()` — the "fix the files, never extend the baseline" direction the P8 bullet
   mandates. Run the gate before AND after the lane; the before-reading is the lane's evidence that
   any pre-existing red is not its own.
3. **pnpm lockfile**: 6+ package.json edits (§4) — sync `pnpm-lock.yaml` in the same commit or Fly
   CI hard-fails on frozen-lockfile (memory `agent-packagejson-breaks-frozen-lockfile`).
4. **Self-barrel SCC** inside core-app-model: moved files must use relative deep imports for
   `storeEventBus`/`projectScopeRegistry` — importing their own package barrel at module load is
   the circular-barrel white-screen shape (`scc-no-barrel-access-at-module-load`).
5. **Protocol adoption compile risk** (LANE B): `type: string` → `type: CommandType` and the
   richer `CommandContext`. Enum values verified present and string-identical; the residual risk is
   member-shape drift caught by root tsc — the lane's RC capture is the verification, not this
   scout's reading.
6. **Singleton identity**: `annotationStore` etc. must have exactly ONE module instance after the
   move. The shim-re-export chain (plugin shim → SDK → core-app-model) preserves single-instance
   semantics under ESM; the hazard would be a lane keeping a COPY of a moved file instead of a shim
   — the falsifier is `grep -rn "new AnnotationStore()" plugins packages` → exactly 1 hit
   (+ the L3 Zustand rival, which is a different class and stays).
7. **`ProjectLoader` dynamic imports** (`:1427-1452`) move from lazy plugin chunks to
   core-app-model — bundle-shape change only; keep them dynamic to preserve load order.
8. **Tests that pin current paths**: the 3 test files in §1a repoint in-lane; run
   `npx vitest run` root config + the per-package suites in the lane lists.
9. **`git mv` vs copy**: use `git mv` so blame survives; the L2b doc's warning stands — line
   numbers in THIS plan were read at `05cb61e0` with uncommitted sibling-lane edits present and
   will drift.

## §8 — What this scout did NOT establish

- Runtime equivalence after the move (no code was moved; root tsc on the changed tree is each fix
  lane's foreground obligation — the command is in every lane's verify list).
- Whether `apps/editor`'s 34 plugin-barrel import sites include DEEP imports
  (`@pryzm/plugin-annotations/subsystem/...`) that a barrel shim would not cover — the grep matched
  the specifier string anywhere, and none of the 45 counted statements is deep, but the 34
  app/plugin files were not audited per-statement. LANE A should
  `grep -rn "plugin-annotations/" apps plugins` before finalizing shim shape.
- The exact post-landing sdk-bypass figure (§6 gives the mechanism and direction; the gate prints
  the number).
- Whether `AnnotationSystemTypeStore`/`TagPropertyResolver`/`ViewLinkResolver` should FOLLOW the
  subsystem down in a later pass — no packages/** consumer exists today, so they are out of scope
  for the 102-count, but C101 may want the whole §ANN-TYPE model co-located; flagged for the
  contract owner, not decided here.

---

## §9 — Baseline readings EXECUTED by this scout (foreground, this tree, 2026-08-31)

- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` → **RC=0** (root tsc
  is CLEAN at this tree — any fix-lane tsc failure is that lane's own).
- `npx tsx tools/ga-gate/check-layer-boundaries.ts` → **RC=0**,
  `✓ within baselines (violations 102/102, unclassified 13/13, sdk-bypass 171/182)` — the exact
  denominator §6 computes against, re-measured rather than transcribed from the audit JSON.
