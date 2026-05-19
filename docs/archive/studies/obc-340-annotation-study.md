# PRYZM × That Open Engine 3.4.0 — Annotation & Export Study

> **Study-only document. No source files were modified.**
> Authored: 2026-04-12  
> Scope: `@thatopen/components` 3.4.0 (currently installed: 3.3.3)

---

## 1. Executive Summary

- **PRYZM has a solid, contract-compliant annotation foundation** — six tool types, full command pipeline, constraint system, dependency graph, and a Canvas 2D render layer — but it is entirely decoupled from the sheet/export pipeline; annotations never appear in the SheetEditor, SVG, PNG, or print outputs.
- **OBC 3.4.0 ships a production TechnicalDrawings subsystem** with six annotation systems (linear, angle, leader, block, slope, callout), an `onCommit` event model, BVH-accelerated raycasting, drawing layers, and a DxfManager — all operating in THREE.js layer 1 in 3D world space.
- **The paradigm mismatch is the core architectural challenge**: PRYZM annotates in screen-space Canvas 2D; OBC annotates in world-space THREE.js geometry. Bridging requires an adapter layer, not a rewrite.
- **OBC DXF export is a low-risk additive win** — it can be slotted into `src/export/sheets/SheetExportService.ts` with minimal disruption to existing paths.
- **Upgrading from 3.3.3 → 3.4.0 carries a hard dependency risk**: OBC 3.4.0 requires `web-ifc ≥ 0.0.77`; PRYZM currently pins `web-ifc 0.0.74`. Fragment format compatibility must be verified before the upgrade.

---

## 2. PRYZM Annotation System — Current State

### 2.1 Data Model (`src/elements/annotations/`)

| File | What it stores / does | Missing / Limited |
|---|---|---|
| `AnnotationTypes.ts` | `AnnotationElement` DTO — fully serialisable plain object with `type`, `ownerViewId`, `references[]`, `geometry2D`, `style`, `parameters`, `semantics`, `isDriving`. Type discriminant covers 7 types. | No radius-dim, elevation-marker, section-marker, grid bubble, north arrow, scale bar, matchline, revision cloud types. `parameters` is `Record<string,any>` — no type-narrowed sub-schemas per type. |
| `AnnotationStore.ts` | Singleton `Map<id, AnnotationElement>`, frozen objects, full CRUD, per-field snapshot, `onChange` event bus, `storeEventBus` integration. Mirrors Revit's `OwnerViewId` semantics. | No index by `type` without a full scan. No cross-view query. No persistence layer; data lost on page reload unless a project-save cycle persists it. |
| `AnnotationReference.ts` | `StableReference` system — elementType + subElement + stableKey encoding that survives geometry rebuilds. Covers wall (6 face types), slab, column, beam, grid, level, point refs. | `ResolverStores` uses `any` for individual store types. No IFC entity reference type; cannot reference imported IFC elements by expressID. |
| `AnnotationDependencyGraph.ts` | Reactive reverse-index (elementId → annotationIds). `StoreEventBus` driven, microtask batching, dirty-flag propagation, refreshes cached positions. | Brute-force index rebuild on every store `add/update/remove` — O(N) where N = all annotations. Acceptable for current scale; could become a bottleneck at 10k+ annotations. |
| `AnnotationVisibilityStore.ts` | Per-view, per-category `Set<hidden>`. Toggle, show, hide, copyFromView, serialize/deserialize. | No per-element override (only category-level). No integration with ViewTemplate system yet. |
| `ConstraintStore.ts` / `ConstraintSolver.ts` | Derives `ConstraintRecord` from locked `linear-dim` annotations. Operator (`==`, `>=`, etc.), distance enforcement, violation/satisfied state. Notifies render layer for colour overlays. | Constraint solver only handles `linear-dim`. No angular, radius, or multi-dimension group constraints. |

### 2.2 Rendering (`AnnotationRenderLayer.ts`)

- HTML `<canvas>` absolutely positioned over the THREE.js renderer canvas, `pointer-events: none`.
- Projects world → NDC via `camera.project()`, NDC → pixel coords.
- Registered with `UnifiedFrameLoop` at `'overlay'` priority; dirty-flag gated.
- Renders: linear-dim (with string chain support, constraint colour overlays, selected-element highlight), angular-dim, text-note, tag (with leader), detail-line, spot-elevation, keynote (bubble + leader).
- Hit-testing: rebuilds `_dimHitSegments[]` every frame; `getAnnotationAtPoint()` uses segment distance < 8px threshold.
- **Limitation**: Canvas 2D overlay renders only in the live 3D viewport. There is no path to render annotations into the SheetEditor canvas, ViewportPreviewRenderer, or any export format. The two worlds (annotation + sheet) are completely disconnected.

### 2.3 Tools (`src/elements/annotations/tools/`)

Six Revit-grade tools, all read-only from stores, dispatch `CreateAnnotationCommand` via `CommandManager`:

| Tool | Interaction | Notes |
|---|---|---|
| `LinearDimensionAnnotationTool` | State machine: PICK_WALL_A → PICK_WALL_B → DEFINE_OFFSET. String/chain dims. WallFaceDetector snapping. | Most complex tool; hover quad highlight; face-type switcher. DI keyboard shortcut (Revit-style). |
| `AngularDimensionAnnotationTool` | 3 clicks: vertex → A → B | Computes angle in degrees; stores in `parameters.angleDegrees`. |
| `TextNoteTool` | Click + textarea prompt | Simple free-text. |
| `ElementTagTool` | Click element → evaluates label expression | `${type}`, `${mark}`, `${parameter:X}`. |
| `SpotElevationAnnotationTool` | Single click on surface | Reads Y-coordinate. |
| `KeynoteTool` | Click element → key + description prompt | Hexagon bubble rendering. |

### 2.4 Commands (`src/commands/annotations/`)

All six commands are fully undoable, serialisable, command-routed, store-only (no THREE.js mutations):

| Command | Function |
|---|---|
| `CreateAnnotationCommand` | Adds to `AnnotationStore`; undo removes. |
| `UpdateAnnotationCommand` | Partial patch; captures inverse snapshot. |
| `DeleteAnnotationCommand` | Captures full snapshot for undo. |
| `LockAnnotationCommand` | Sets `isLocked`, `constraintOperator`, `constraintValueMetres`; undo restores prior parameters. |
| `UpdateConstraintCommand` | Re-seeds ConstraintStore from all locked dims; runs solver. Undoable. |
| `AnnotateViewCommand` | AI macro-command (Claude); fires individual `CreateAnnotationCommands`; not itself on undo stack. |

### 2.5 Sheet / Export System (`src/core/views/`, `src/export/sheets/`)

| File | What it stores / does | Missing / Limited |
|---|---|---|
| `SheetStore.ts` | `SheetDefinition` map — viewports[], revisions[], dataPanels[], annotationLayers[], outputConfigs[], layoutRules[], paperSize, compositionIntent. Full CRUD. | `annotationLayers` is a type stub (`AnnotationLayer[]`); no rendering bridge to `AnnotationStore`. |
| `TitleBlockStore.ts` | Read-only library: A0, A1, A3 templates with field coordinates and revision zone. | Hard-coded templates; no user-defined template authoring yet. |
| `ViewDefinitionStore.ts` | Rich `ViewDefinition` with spatial, temporal, output, range, crop, underlay, semantic, projection, lighting contexts. | No direct link from a `ViewDefinition` to its `AnnotationElement`s in `AnnotationStore`. |
| `SheetExportService.ts` | Print (browser dialog), PNG (Canvas 2D composite of preview thumbnails), SVG (viewport outlines only). | **No PDF export.** **No DXF export.** SVG viewports are placeholders, not rendered model content. PNG composites preview thumbnails — resolution-limited. No annotation geometry in any export. |
| `SheetEditorPanel.ts` | Full-screen overlay; drag/drop viewports; SC-1 through SC-8 (grid, snap, layout presets, data panels, export dialog, composition intent, presence, comments). | Viewport previews are static thumbnails rendered by `ViewportPreviewRenderer`. No live annotation overlay in sheet canvas. |

### 2.6 Key TODOs / Stubs Identified

- `AnnotationLayer` type in `DataPanelTypes.ts` — referenced in `SheetStore` but not rendered.
- `ViewOutputSettings` in `ViewDefinitionTypes.ts` — includes `dxf` and `pdf` fields that are never populated.
- `SheetExportService.exportToPng()` documents "Cross-origin canvas issue" fallback with a grey placeholder — viewport previews from WebGL canvas often fail the `toBlob()` taint check.
- `DimensionManager.ts` (legacy, `src/elements/dimensions/`) — still present alongside the newer `AnnotationRenderLayer`; creates THREE.js objects in the scene directly; should be considered for deprecation.

---

## 3. OBC 3.4.0 — What It Offers

### 3.1 `TechnicalDrawings` Component

```
components.get(OBC.TechnicalDrawings)
  .create(world)          → TechnicalDrawing
  .use(SystemClass)       → global AnnotationSystem<T> singleton
  .list                   → DataMap<uuid, TechnicalDrawing>
  .systems                → DataMap<Function, AnnotationSystem<any>>
```

A `TechnicalDrawing` is a **THREE.Group** that lives in world space (layer 1). Everything inside moves together. Key members:

| Member | Type | Purpose |
|---|---|---|
| `three` | `THREE.Group` | Root container in world space |
| `layers` | `DrawingLayers` | Named layers with color + visibility |
| `annotations` | `DrawingAnnotations extends DataMap` | Flat map: uuid → `{system, data, three: THREE.Group}` |
| `viewports` | `DrawingViewports` | Orthographic framing windows |
| `addProjectionLines(lines, layerName)` | method | BVH-indexed raycast-able line segments |
| `raycast(ray)` | method | Returns `{line: {start,end}}` or null |
| `orientTo(normal)` | method | Sets projection direction + text orientation |
| `far` | number | Capture volume depth for EdgeProjector |
| `activeLayer` | string | Layer new annotations go to |

### 3.2 Annotation Systems (all in `src/drawings/TechnicalDrawings/src/`)

Exported: `LinearAnnotations`, `AngleAnnotations`, `LeaderAnnotations`, `BlockAnnotations`, `SlopeAnnotations`, `CalloutAnnotations`.

All share the `AnnotationSystem<T extends DrawingSystemDescriptor>` base:

```ts
abstract class AnnotationSystem<TSystem> {
  styles: DataMap<string, TSystem["style"]>  // named style presets
  onCommit: Event<CommittedItem[]>            // fired when annotation is placed
  onDelete: Event<DeletedItem[]>             // fired when annotation is removed
  machineState: { kind: string }             // current state machine state
  sendMachineEvent(event: TypedEvent): void  // drive the state machine
}
```

#### 3.2a `LinearAnnotations`

- State machine: `awaitingFirstPoint → positioningOffset → (committed)`
- Events accepted: `SELECT_LINE { line, drawing }`, `MOUSE_MOVE { point }`, `CLICK { point, drawing }`, `ESCAPE`
- Commit payload: `{ item: { uuid, style }, group: THREE.Group }` where `item` has `pointA`, `pointB`, `offset`
- Text rendering: **consumer-side** — `onCommit.add()` receives the measurement data; consumer creates `THREE.Mesh` with `Font.generateShapes()` and attaches to `group`

#### 3.2b Available systems (confirmed from source index)

| System | Likely geometry produced |
|---|---|
| `LinearAnnotations` | Witness lines + dimension line with arrowheads in THREE.js |
| `AngleAnnotations` | Arc + two rays in THREE.js |
| `LeaderAnnotations` | Polyline leader with text attachment point |
| `BlockAnnotations` | Rectangular annotation blocks (like drawing frames) |
| `SlopeAnnotations` | Slope/gradient indicator |
| `CalloutAnnotations` | Callout bubble with leader |

### 3.3 Text Rendering Model

OBC makes text **entirely consumer-side**. The pattern from `example.ts`:
1. Load a TTF font via `TTFLoader`
2. Subscribe to `dims.onCommit`
3. For each committed item, call `font.generateShapes(text, size)` → `ShapeGeometry` → `Mesh`
4. Attach the mesh to `group` (which is already a child of `drawing.three`)
5. The mesh is on THREE.js layer 1 so it renders with the drawing

No DOM, no CSS, no canvas 2D — pure THREE.js geometry. The `components-front` package ships a `DrawingEditor` that handles all text label production in a production-ready way.

### 3.4 DXF Export API

```ts
const dxfExporter = components.get(OBC.DxfManager).exporter;
const dxfString = dxfExporter.export([{ drawing, viewports: [{}] }]);
// Trigger download:
const blob = new Blob([dxfString], { type: 'application/dxf' });
```

- Exports all annotation systems automatically
- Includes layer structure from `DrawingLayers`
- Text labels are embedded as DXF text entities
- Viewport framing is included
- No known layer naming convention conflicts with existing PRYZM code (no existing DXF layers)

### 3.5 EdgeProjector (for wall outline projection)

Found at `src/fragments/EdgeProjector` inside the OBC package (different path than the docs URL suggests). Referenced inside `TechnicalDrawing.ts`:

```ts
import { EdgeProjector } from "../../../fragments/EdgeProjector";
```

Used via `drawing.addProjectionFromItems(modelIdMap)` to auto-generate flattened wall outlines (BVH-indexed `LineSegments`) from a loaded `FragmentsModel`. OBC currently ships pre-computed projections in the tutorial; the `addProjectionFromItems` method is the integration point for live model geometry.

### 3.6 What OBC Does NOT Provide (PRYZM Must Build)

- **Elevation marker** — no built-in type
- **Section marker / cut symbol** — no built-in type
- **Grid bubble** — no built-in type
- **Level tag** — no built-in type
- **Room tag with area** — no built-in type (would need custom `AnnotationSystem`)
- **Door / window tag** — no built-in type
- **Structural member tag** — no built-in type
- **Revision cloud** — no built-in type
- **North arrow** — no built-in type (is a block/symbol, not a dimension)
- **Scale bar** — no built-in type
- **Matchline** — no built-in type
- **Screen-space Canvas 2D rendering** — OBC is purely THREE.js; no HTML canvas overlay equivalent
- **StableReference / AnnotationDependencyGraph** — OBC annotations snap to projected geometry segments, not to live BIM element references; if the model changes, OBC annotations don't auto-update
- **Constraint solver** — OBC has no driving dimension / constraint enforcement
- **AI annotation** — no AI integration layer
- **OwnerViewId scoping** — OBC annotations belong to a `TechnicalDrawing`, not a PRYZM view

---

## 4. Gap Analysis Table

| Annotation Type | PRYZM Today | OBC 3.4.0 Offers | Gap / Work Needed |
|---|---|---|---|
| **Linear dimension** (wall-to-wall, element width) | ✅ Full — wall-face snapping, string chains, units (mm/cm/m), constraint locking, DI shortcut, Canvas 2D render | ✅ `LinearAnnotations` — state machine, BVH snap, THREE.js render, DXF export, consumer-side text | **Paradigm mismatch**: OBC lives in 3D layer-1; PRYZM lives in Canvas 2D. Adapter needed for DXF path. No conflict for existing interactive use. |
| **Angular dimension** | ✅ `angular-dim` type — 3-click tool, Canvas 2D arc render | ✅ `AngleAnnotations` — state machine, THREE.js arc | Same paradigm mismatch as linear. OBC adds DXF export path. |
| **Radius / diameter dimension** | ❌ Not in AnnotationType | ❌ Not in OBC built-ins | PRYZM must add type + tool + render + OBC custom system or Canvas 2D. **Full build.** |
| **Elevation marker** | ⚠️ `spot-elevation` — captures Y coord, Canvas 2D render with arrow | ❌ Not in OBC built-ins | PRYZM has a working Canvas 2D version. OBC does not help. No DXF path for spot-elevation. |
| **Section marker / cut line** | ❌ Not in AnnotationType | ❌ Not in OBC built-ins | Full build needed. Requires view linkage (section → 3D camera cut). |
| **Text note** (free-floating) | ✅ `text-note` — click + textarea, Canvas 2D text | ⚠️ `BlockAnnotations` closest; or consumer adds text mesh to any group | DXF text export gap. PRYZM text-note cannot be DXF'd via OBC today. Adapter needed. |
| **Callout bubble** (with leader) | ⚠️ `keynote` — hexagon bubble + leader, Canvas 2D | ✅ `CalloutAnnotations` + `LeaderAnnotations` | OBC offers richer geometry + DXF. Mapping `keynote` → OBC callout is the bridge. |
| **Grid bubble** | ❌ Not in AnnotationType | ❌ Not in OBC built-ins | Full build. Grid data exists in `gridStore`. Canvas 2D or THREE.js label. |
| **Level tag** | ❌ Not in AnnotationType | ❌ Not in OBC built-ins | Full build. Level data in `bimManager.getLevels()`. |
| **Room tag** (with area) | ❌ Not in AnnotationType | ❌ Not in OBC built-ins | Full build. No room/space entity in PRYZM today; would need room store first. |
| **Door / window tag** | ⚠️ `tag` — `ElementTagTool` with any element, `${type}` label, leader, Canvas 2D | ❌ Not in OBC built-ins | PRYZM covers interactive case. DXF export missing. No specialized door/window symbol. |
| **Structural member tag** | ⚠️ `tag` — generic element tag covers beam/column | ❌ Not in OBC built-ins | Same as door/window tag. No standard symbol geometry. |
| **Revision cloud** | ❌ Not in AnnotationType | ❌ Not in OBC built-ins | Full build. Complex polyline geometry (arc segments). |
| **North arrow** | ❌ Not in AnnotationType | ❌ Not in OBC built-ins | Full build. Static 2D symbol; could be Canvas 2D or SVG. |
| **Scale bar** | ❌ Not in AnnotationType | ❌ Not in OBC built-ins | Full build. Simple graphics; needs viewport scale from `SheetViewport.scale`. |
| **Matchline** | ❌ Not in AnnotationType | ❌ Not in OBC built-ins | Full build. Line + text label + view linkage. |

**Summary**: PRYZM has strong coverage for the common interactive annotation types (6/16 fully covered, 4/16 partially covered). OBC adds DXF export and richer THREE.js geometry but does not eliminate PRYZM's build work for the missing 10 annotation types.

---

## 5. Integration Architecture Assessment

### 5a. Can OBC TechnicalDrawings be driven by PRYZM's CommandManager without bypassing it?

**PARTIAL.**

OBC fires `onCommit` events when a user completes an annotation via `sendMachineEvent()`. The correct PRYZM integration is:

```
User input → Tool sends OBC machine event →
OBC onCommit fires → Adapter converts OBC data to AnnotationElement DTO →
Adapter dispatches CreateAnnotationCommand → CommandManager.execute() → AnnotationStore.add()
```

The adapter must:
1. Subscribe to `dims.onCommit` **before** any user interaction.
2. Extract the plain measurement data (`pointA`, `pointB`, `offset`, `style`) from the commit payload.
3. Build a PRYZM `AnnotationElement` with a `StableReference` snapped to the nearest BIM element (or a `point` ref if no element is found).
4. Dispatch `new CreateAnnotationCommand(element)` through `commandManager`.

The OBC `THREE.Group` geometry produced during the commit must **not** enter the CommandManager or AnnotationStore — it is discarded after PRYZM re-renders the same annotation via its Canvas 2D layer.

**Risk**: OBC's state machine manages its own preview geometry (intermediate THREE.js objects during placement). These are compatible with PRYZM's rendering pipeline as long as they remain on layer 1 and are disposed after commit.

### 5b. Can OBC's annotation data be stored in AnnotationStore / DimensionStore as plain DTOs?

**YES, with adapter.**

OBC's `DrawingAnnotations` stores `AnnotationEntry = { system, data: unknown, three: THREE.Group }` — the `THREE.Group` is a direct contract violation of PRYZM's §01 §5 rule ("no THREE.js class instances in the store schema"). However, OBC's `item.data` (the measurement record) is a plain object: `{ uuid, style, pointA: THREE.Vector3, pointB: THREE.Vector3, offset: number }`.

The adapter's job: extract `pointA`, `pointB`, `offset` as `{ x, y, z }` plain objects and populate a `AnnotationElement` DTO. The `THREE.Group` reference is never forwarded to any PRYZM store.

`DimensionStore` (`DimensionTypes.ts`) is the legacy store; the adapter should target `AnnotationStore` exclusively.

### 5c. Can OBC Views replace PlanSymbolGenerator without breaking the existing plan view pipeline?

**NO (today) / PARTIAL (with significant work).**

`PlanSymbolGenerator` produces THREE.js Groups of flat 2D plan symbols (walls, slabs, doors, windows) placed on `PLAN_SYMBOL_LAYER = 3` in the scene. `PlanSymbolCache` manages their lifecycle and level-activation visibility.

OBC `TechnicalDrawing` + `EdgeProjector` is conceptually the same thing but:
- OBC generates `LineSegments` (projected edges) rather than filled cross-sections.
- OBC's drawing lives on layer 1, not layer 3.
- OBC's projection is computed from a loaded `FragmentsModel`, not from PRYZM's custom element stores (WallStore, SlabStore, etc.).

PRYZM's element geometry is natively authored (not loaded as IFC fragments), so `EdgeProjector.addProjectionFromItems()` cannot be used directly. A custom projection path using PRYZM's builders would be needed.

**Conclusion**: `PlanSymbolGenerator` is not replaceable by OBC out-of-the-box for PRYZM's natively-authored geometry. OBC `EdgeProjector` becomes relevant only when imported IFC models are annotated; it could coexist alongside `PlanSymbolGenerator`.

### 5d. Can OBC EdgeProjector replace PlanViewVisibilityCuller's projection logic?

**PARTIAL (for IFC models only).**

`PlanViewVisibilityCuller` (`src/core/views/PlanViewVisibilityCuller.ts`) culls and categorises fragment meshes by level for plan-view visibility. OBC `EdgeProjector` handles edge projection for loaded fragments, outputting `LineSegments` from the model geometry.

For **IFC-loaded content** (FragmentsModel), OBC EdgeProjector can replace the manual fragment-based projection and level-plane clipping in `PlanViewVisibilityCuller`. For **natively-authored elements** (walls, slabs, columns, etc. from PRYZM stores), `PlanViewVisibilityCuller` must remain as-is.

The two can coexist: OBC EdgeProjector for imported fragments, PRYZM PlanSymbolGenerator for native elements.

### 5e. Can OBC DXF export be added to `src/export/sheets/` as a new export path alongside existing PDF?

**YES. Low risk, additive.**

`SheetExportService.ts` already has `exportToPng()`, `exportToSvg()`, `exportToPrint()`. Adding `exportToDxf(sheetId)` follows the same pattern:

```ts
async exportToDxf(sheetId: string): Promise<void> {
  // 1. Find or create a TechnicalDrawing for each viewport in the sheet
  // 2. Populate projection lines from PlanSymbolCache
  // 3. Populate annotation geometry from AnnotationStore via OBC annotation systems
  // 4. dxfExporter.export([{ drawing, viewports: [{}] }])
  // 5. Trigger download
}
```

The challenge is step 3: PRYZM annotations are Canvas 2D; OBC DXF export works on OBC's THREE.js annotation geometry. A "DXF bridge" must re-express each `AnnotationElement` as an OBC annotation system item just before export, then discard the OBC objects. This is a one-way conversion (PRYZM → OBC → DXF string).

### 5f. Does OBC sheet composer conflict with SheetStore / TitleBlockStore, or extend them?

**NO CONFLICT. Additive extension.**

OBC `TechnicalDrawings` has no concept of sheets, title blocks, revision zones, or drawing registers — these are entirely PRYZM-owned concepts in `SheetStore` and `TitleBlockStore`. OBC drawings (`TechnicalDrawing`) map to PRYZM viewports (`SheetViewport`), not to sheets.

The natural mapping:
- `SheetDefinition` (PRYZM) → one DXF output file
- `SheetViewport` (PRYZM) → one `{ drawing, viewports: [{}] }` entry in `dxfExporter.export()`
- `TitleBlockStore` fields → additional DXF block entities (TEXT entities in the TITLE_BLOCK layer)

`SheetStore` and `TitleBlockStore` require no modification.

### 5g. Does upgrading from @thatopen/components 3.3.3 → 3.4.0 require migration of existing fragments / web-ifc usage?

**PARTIAL — web-ifc version is a hard blocker.**

OBC 3.4.0's `package.json` declares:
```json
"peerDependencies": {
  "@thatopen/fragments": "~3.4.0",
  "web-ifc": ">=0.0.77"
}
```

PRYZM currently pins `web-ifc: "^0.0.74"`. This is a **hard version gap** — web-ifc 0.0.77 may have WASM API changes that affect IFC loading (`@thatopen/fragments` uses web-ifc internally for IFC parsing). Any IFC files cached or stored in Fragment format with 0.0.74 must be re-exported with 0.0.77 or the Fragment format may be incompatible.

**Required pre-upgrade steps**:
1. Test Fragment format compatibility between web-ifc 0.0.74 and 0.0.77 with the project's actual IFC files.
2. Update `@thatopen/fragments` from the currently installed version to `~3.4.0`.
3. Update `camera-controls` (currently `^3.1.2`) — already satisfies the `>=3.1.2` peer dep.
4. Update `three` if needed (OBC 3.4.0 tested against `0.182.0`; PRYZM uses `^0.183.2` — minor version ahead, should be compatible).

The `TechnicalDrawings` API itself (new in 3.4.0) requires no migration of existing fragment loading or `@thatopen/components` usage — it is purely additive.

---

## 6. Phased Implementation Plan

### Phase A: DXF Export Bridge (Maximum Value, Minimum Disruption)

**Goal**: Add DXF export of existing PRYZM annotations and plan view content. No change to the interactive annotation workflow.

**New files to create**:
- `src/export/sheets/DxfExportService.ts` — wraps `OBC.DxfManager`, builds a `TechnicalDrawing` per sheet viewport, populates annotation geometry from `AnnotationStore`, calls `dxfExporter.export()`.
- `src/export/sheets/AnnotationToDxfBridge.ts` — converts `AnnotationElement[]` to OBC annotation system items (one-way, ephemeral, disposed after export). Covers linear-dim, angular-dim, text-note, tag, spot-elevation.

**Existing files to extend**:
- `src/export/sheets/SheetExportService.ts` — add `exportToDxf(sheetId: string)` method.
- `src/ui/SheetEditor/SheetEditorPanel.ts` — add DXF option to the export dialog (already has `ExportFormat` type).
- `src/commands/views/ExportSheetCommand.ts` — add `'dxf'` to the `ExportFormat` union.

**New commands needed**: None — existing `ExportSheetCommand` handles routing.

**UI panels to extend**: `SheetEditorPanel` export dialog (minor addition to existing SC-6 export section).

**Package.json changes**: Upgrade `@thatopen/components` from `^3.3.3` → `^3.4.0`; upgrade `web-ifc` from `^0.0.74` → `^0.0.77`; align `@thatopen/fragments`.

**Estimated complexity**: **Medium** — the bridge logic (AnnotationElement → OBC geometry → DXF) is non-trivial but bounded. The web-ifc upgrade is the highest-risk task.

---

### Phase B: OBC-Backed Interactive Placement for 3D Drawings

**Goal**: For annotating IFC models viewed as TechnicalDrawings (e.g., imported floor plans), use OBC LinearAnnotations state machine for placement, with an adapter feeding PRYZM's CommandManager.

**New files to create**:
- `src/elements/annotations/adapters/OBCLinearDimAdapter.ts` — subscribes to `LinearAnnotations.onCommit`, converts to `AnnotationElement`, dispatches `CreateAnnotationCommand`.
- `src/elements/annotations/adapters/OBCAngleAdapter.ts` — same for `AngleAnnotations`.
- `src/elements/annotations/adapters/OBCCalloutAdapter.ts` — same for `CalloutAnnotations`.
- `src/elements/annotations/tools/TechnicalDrawingTool.ts` — activates a `TechnicalDrawing` for the current floor plan view, wires mouse events to OBC state machine, forwards raycasting to `drawing.raycast()`.

**Existing files to extend**:
- `src/elements/annotations/AnnotationManager.ts` — add `initTechnicalDrawingMode(world)` method; lazy-creates the OBC `TechnicalDrawings` component.
- `src/ui/tools-panel/panels/AnnotationRailPanel.ts` — add a "Technical Drawing Mode" toggle.

**New commands needed**:
- `CreateAnnotationFromOBCCommand` — thin wrapper around `CreateAnnotationCommand` that also records the OBC drawing UUID for DXF association.

**UI panels**: `AnnotationRailPanel` gets one new toggle button.

**Package.json changes**: Already bumped in Phase A.

**Estimated complexity**: **High** — the state machine adapter, raycasting integration, and ensuring OBC preview geometry doesn't persist in the scene after command dispatch are all non-trivial. OBC's preview geometry (live dimension line during placement) needs to be isolated from PRYZM's UnifiedFrameLoop.

---

### Phase C: Missing Annotation Types + Paper-Space Integration

**Goal**: Close the gap table — add radius/diameter, grid bubble, level tag, room tag, north arrow, scale bar, matchline, revision cloud. Also: render PRYZM annotations into sheet viewports.

**Subphase C1: Missing annotation types**

For each type, create:
- A new discriminant in `AnnotationType` (in `AnnotationTypes.ts`)
- A render case in `AnnotationRenderLayer._renderAnnotation()`
- A tool in `src/elements/annotations/tools/`
- Register in `AnnotationManager.init()`
- Register in `AnnotationRailPanel`

Priority order (by demand):
1. `radius-dim` / `diameter-dim` — needed for structural and MEP drawings
2. `elevation-marker` — distinct from `spot-elevation`; has section-call format
3. `grid-bubble` — uses existing `gridStore` data
4. `level-tag` — uses `bimManager.getLevels()`
5. `revision-cloud` — complex polyline; needed for ISO 19650 workflows
6. `north-arrow`, `scale-bar` — static symbols; simple Canvas 2D
7. `room-tag` — requires new `RoomStore` (out of scope for annotation work alone)
8. `matchline` — requires view linking capability

**Subphase C2: Paper-space annotation rendering**

- `ViewportPreviewRenderer` must be extended to composite the `AnnotationRenderLayer` canvas on top of its THREE.js offscreen render.
- Alternatively, implement a `PaperSpaceAnnotationRenderer` that translates `AnnotationElement[]` to SVG paths (for embedding in the SheetEditor canvas SVG layer).
- `SheetExportService.exportToSvg()` to include actual annotation geometry (currently just viewport placeholders).

**New commands needed**: One per new annotation type (following existing `CreateAnnotationCommand` pattern).

**Estimated complexity**: **High** — C1 is systematic but large. C2 (paper-space) is architecturally complex and may require a significant refactor of how `SheetEditorPanel` composites its viewport previews.

---

## 7. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **web-ifc 0.0.74 → 0.0.77 Fragment format break** — Stored fragments or cached WASM data incompatible with the new version; IFC re-loading fails silently or corrupts geometry. | **High** | **Critical** | Test the upgrade in isolation on a branch with all existing IFC sample files before merging. Check `@thatopen/fragments` CHANGELOG for format migration notes. If format changes, regenerate all fragment caches. |
| **OBC annotation geometry leaking into AnnotationStore** — Adapter forgets to discard `THREE.Group` from the OBC commit payload; a `THREE.Object3D` is stored in `AnnotationElement.parameters` (violates §01 §5). | **Medium** | **High** | Code-review rule: `AnnotationToDxfBridge` and `OBCLinearDimAdapter` must call `drawing.annotations.delete(uuid)` and dispose the commit group after extracting plain data. Add a store invariant check in `AnnotationStore.add()` that rejects entries with non-serialisable values (structuredClone test). |
| **OBC state machine vs PRYZM CommandManager undo/redo** — OBC does not know about PRYZM's undo stack; if a user places an OBC-brokered annotation and then undoes it, OBC's preview geometry or internal state may be inconsistent. | **Medium** | **Medium** | The adapter must not let OBC store the annotation data — only PRYZM's CommandManager owns it. OBC's THREE.js objects (preview lines etc.) must be disposed immediately after commit. `DeleteAnnotationCommand.undo()` only re-adds to `AnnotationStore`; OBC geometry is not involved, because PRYZM re-renders from the store via `AnnotationRenderLayer`. |
| **OBC text rendering (THREE.js Font meshes) vs PRYZM Canvas 2D** — If OBC annotation THREE.js geometry is left in the scene (e.g., preview not cleaned up), OBC's font mesh and PRYZM's Canvas 2D text will both render the same annotation — duplication. | **Medium** | **Medium** | Strict lifecycle rule: after `onCommit`, call `group.clear(); group.removeFromParent()` in the adapter. The AnnotationRenderLayer is the sole renderer for PRYZM annotations. |
| **WASM init order** — `TechnicalDrawings.create()` uses `EdgeProjector` which is in `src/fragments/EdgeProjector` — within the fragments subsystem. If `FragmentsManager.init()` hasn't completed when `TechnicalDrawings.create()` is called, the EdgeProjector may fail. | **Low** | **High** | Call `techDrawings.create(world)` only inside an `async` function that `await`s the fragments `init()` promise. PRYZM's deferred bootstrap pattern (`EngineBootstrap.ts`) already gates on WASM init. |
| **DXF layer naming clashes** — `dxfExporter` auto-names layers. If OBC uses a layer named `"0"` (the DXF default) and PRYZM maps its annotation categories to other names, the DXF default layer may absorb unintended content. | **Low** | **Low** | In `AnnotationToDxfBridge`, explicitly assign each annotation type to a named `DrawingLayer` before export (e.g., `drawing.layers.create("PRYZM-DIMENSIONS", ...)`). DXF consumers (AutoCAD, etc.) can then control per-layer visibility. |
| **Collaboration sync** — `CreateAnnotationCommand.serialize()` is fully implemented; socket.io broadcast is straightforward. However, OBC-brokered annotations (Phase B) carry an OBC drawing UUID; remote peers may not have the same `TechnicalDrawing` instance. | **Low** | **Medium** | Socket.io should only broadcast the PRYZM `AnnotationElement` DTO (from `CreateAnnotationCommand.serialize()`). The OBC drawing UUID must not be part of the serialized payload. Remote peers reconstruct annotation geometry from the DTO via `AnnotationRenderLayer`. |
| **AnnotationRenderLayer hit-testing at scale** — `_dimHitSegments[]` is rebuilt every frame and iterated linearly for every click. At >500 annotations, the O(N) scan per click may be noticeable. | **Low** | **Low** | Add a spatial index (e.g., R-tree or grid bucketing) to `getAnnotationAtPoint()` when count exceeds a threshold. Not urgent at current scale. |
| **SheetEditorPanel viewport preview taint** — `exportToPng()` reads from `<canvas>` elements that WebGL may have marked tainted (cross-origin). The current fallback is a grey placeholder. Phase C2 would worsen this if not addressed. | **Medium** | **Medium** | Use `preserveDrawingBuffer: true` on the THREE.js renderer; render to an OffscreenCanvas where possible; or render an explicit export snapshot rather than reading the live canvas. |
| **AnnotationRenderLayer vs PaperSpace coordinate system** — The Canvas 2D overlay uses screen pixels; SheetEditor uses mm (paper space). Bridging requires a scale transform (pixels ÷ DPR ÷ viewScale). | **Medium** | **Medium** | Design `PaperSpaceAnnotationRenderer` with an explicit `viewScale` parameter from `SheetViewport.scale`. All mm ↔ pixel conversions must go through a single utility (extend `mmToPx()` in `AnnotationRenderLayer.ts`). |

---

## 8. Recommendation: Start Here

### First PR Description

**Title**: `feat(export): DXF export for PRYZM sheets via OBC DxfManager`

**Branch**: `feat/sheet-dxf-export`

**Scope** (Phase A only — read-only annotation export, no interactive workflow changes):

1. **Upgrade** `@thatopen/components` from `3.3.3` → `3.4.0` and `web-ifc` from `0.0.74` → `0.0.77` in `package.json`. Run the full IFC loading test suite on the sample models to confirm no Fragment format regression before any code changes.

2. **Create** `src/export/sheets/AnnotationToDxfBridge.ts`:
   - Takes `AnnotationElement[]`, `OBC.Components`, and a `TechnicalDrawing`.
   - For each annotation, calls the appropriate OBC annotation system (`LinearAnnotations`, `AngleAnnotations`, `CalloutAnnotations`) to place the geometry into the drawing.
   - Returns the drawing (with annotations placed) for DXF export.
   - After `dxfExporter.export()` returns, calls `drawing.dispose()` — the drawing is ephemeral and exists only for the export operation.

3. **Create** `src/export/sheets/DxfExportService.ts`:
   - `exportToDxf(sheetId: string): Promise<void>`
   - Iterates `sheet.viewports`, builds one `TechnicalDrawing` per viewport.
   - Populates each drawing with `PlanSymbolCache`-derived projection lines (exported as LineSegments from the cache groups).
   - Calls `AnnotationToDxfBridge` for each viewport's annotations.
   - Calls `dxfExporter.export([...allViewportEntries])` → single DXF file per sheet.
   - Triggers a browser download.

4. **Extend** `src/export/sheets/SheetExportService.ts`: add `exportToDxf(sheetId)` that delegates to `DxfExportService`.

5. **Extend** `src/commands/views/ExportSheetCommand.ts`: add `'dxf'` to `ExportFormat`; add a routing case.

6. **Extend** `src/ui/SheetEditor/SheetEditorPanel.ts`: add a "DXF" button to the SC-6 export dialog section.

**What this PR deliberately does NOT do**:
- Does not change the interactive annotation workflow (LinearDimensionAnnotationTool, AnnotationManager, AnnotationRenderLayer).
- Does not modify AnnotationStore, AnnotationTypes, or any command.
- Does not introduce OBC state machines into the user-facing tool pipeline.

**Acceptance criteria**:
- Export a sheet with at least one linear-dim annotation and one text-note annotation to DXF.
- Open the DXF in LibreCAD or AutoCAD and verify dimension lines, text, and title block fields appear.
- Existing print / PNG / SVG export paths are unaffected.
- No Fragment loading regressions on the existing IFC test models.

---

*End of study. No source files were modified.*
