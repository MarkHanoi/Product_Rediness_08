# PRYZM — 2D Documentation from 3D Models: Feasibility Study & Implementation Plan

> **Study-only document. No source files were modified.**
> Authored: 2026-04-12 · Revised: 2026-04-12 (v2 — camera architecture, EdgeProjector detail, keep/deprecate register)
> Scope: Full AEC documentation workflow — views, cameras, annotations, visibility, sheets, export
> OBC version: `@thatopen/components` 3.4.0 (currently installed: 3.3.3)
> PRYZM native elements + imported IFC/Fragment models both in scope
> Contract authority: 01-BIM-ENGINE-CORE-CONTRACT, 02-BIM-SPATIAL-PROJECTION-CONTRACT,
>                    03-BIM-SEMANTIC-MODEL-CONTRACT, 05-BIM-UI-ARCHITECTURE-CONTRACT

---

## 0. The Vision in One Sentence

> *A designer models walls, slabs, and structure in PRYZM's 3D scene, then opens a floor plan view, places every Revit-grade annotation on it, controls visibility graphics exactly as in Revit, drops the view on a sheet at 1:100 alongside a section and two elevations, and exports the sheet as PDF, DXF, or IFC — with full sync to the 3D model.*

This study maps every component of that vision to what PRYZM already has, what OBC 3.4.0 provides, what must be custom-built, in what order, and with complete contract alignment. It now includes full camera architecture for multi-viewport sheets, an exact mechanical description of how `EdgeProjector` works and how it integrates, and a precise register of what is kept, extended, or deprecated in the existing PRYZM codebase.

---

## 1. System Architecture Overview

The pipeline has five distinct layers, each with its own contract:

```
┌──────────────────────────────────────────────────────────┐
│  Layer 1 · 3D World (THREE.js scene)                      │
│  PRYZM native elements + Loaded IFC/Fragment models       │
└────────────────────┬─────────────────────────────────────┘
                     │  EdgeProjector (one-shot projection)
                     ▼
┌──────────────────────────────────────────────────────────┐
│  Layer 2 · View Engine                                    │
│  Floor plans / Elevations / Sections / RCP / Detail       │
│  Per-view camera (ortho, direction, near/far)             │
│  Multi-viewport camera pool for sheet composition         │
│  VG Governance (category visibility + graphic overrides)  │
└────────────────────┬─────────────────────────────────────┘
                     │  Annotation placement
                     ▼
┌──────────────────────────────────────────────────────────┐
│  Layer 3 · Annotation Engine                             │
│  Dimensions / Text / Tags / Symbols / Leaders / Callouts  │
│  Per-view, per-category, DependencyGraph-linked           │
│  OBC adapter for snap + DXF; PRYZM Canvas 2D for live    │
└────────────────────┬─────────────────────────────────────┘
                     │  Sheet composition
                     ▼
┌──────────────────────────────────────────────────────────┐
│  Layer 4 · Sheet / Paper Space                            │
│  SheetDefinition, SheetViewport (position + scale)        │
│  Per-viewport camera capture (not the live viewport)      │
│  TitleBlock, DataPanels, RevisionZone                     │
└────────────────────┬─────────────────────────────────────┘
                     │  Export
                     ▼
┌──────────────────────────────────────────────────────────┐
│  Layer 5 · Export Formats                                 │
│  Print (browser) / PDF (SVG composite) / DXF / IFC annot  │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Camera Architecture — Interactive Viewport vs. Multi-Viewport Sheets

This is the section most requiring clarification. There are **two completely separate camera concerns** and confusing them leads to the wrong architecture.

### 2.1 The Two Camera Concerns

**Concern A — The Live Interactive Viewport (one active camera at a time)**

The 3D viewport is the scene the user interacts with — they model walls, place doors, orbit in 3D. At any moment exactly one camera drives this viewport:
- In 3D mode: `THREE.PerspectiveCamera`
- In plan/section/elevation mode: `THREE.OrthographicCamera`

The current system (and the multi-camera plan in `docs/MULTI-CAMERA-SINGLE-PIPELINE-PLAN.md`) pre-allocates both a perspective and an orthographic camera at startup. Switching between 3D, plan, elevation, or section is a matter of repositioning and reorienting the ortho camera, not creating new camera objects. The render pipeline is notified via `notifyProjectionToggle()` to avoid shader recompilation.

**No new camera types are needed for the interactive viewport.** Plan, section, elevation, and RCP all use the same orthographic camera aimed in different directions:

| View Type | Camera Direction | Near Clip | Far Clip |
|---|---|---|---|
| Floor Plan | `(0, -1, 0)` — looking down | cut plane height | cut plane + view depth |
| RCP | `(0, +1, 0)` — looking up | ceiling height | ceiling height + 0.5m |
| Front Elevation | `(0, 0, -1)` — looking north | project depth | 0 |
| Back Elevation | `(0, 0, +1)` — looking south | 0 | project depth |
| Left Elevation | `(-1, 0, 0)` | 0 | project width |
| Right Elevation | `(1, 0, 0)` | project width | 0 |
| Section | any direction | section cut plane | section cut + depth |
| 3D / Walkthrough | perspective | per-scene | per-scene |

The `ViewDefinition.spatial.projectionDirection` field (to be added) encodes the direction. `ViewController` reads it and repositions the shared ortho camera when the view is activated.

**Concern B — Sheet Composition (multiple simultaneous views on one sheet)**

This is where it gets more complex. Consider a sheet with:
- Viewport 1 — Floor Plan Level 2 at 1:100
- Viewport 2 — Floor Plan Level 3 at 1:100
- Viewport 3 — Front Elevation at 1:50
- Viewport 4 — Section A-A at 1:50

This is exactly like Revit's sheet composer. These four viewports must be rendered **simultaneously** — not sequentially — for sheet preview and export. The single shared interactive camera cannot serve all four at once.

### 2.2 How Multi-Viewport Sheet Composition Works

The sheet composition pipeline does NOT reuse the live interactive camera. Instead:

**For documentation / export (the primary use case for multi-viewport sheets):**

Each viewport is serviced by `EdgeProjector`, which runs as a one-shot computation and outputs `LineSegments` geometry stored in a `TechnicalDrawing`. These `TechnicalDrawing` objects persist in memory, keyed by `viewDefinitionId`. They do not require a live camera — they are pre-computed geometry that the export pipeline reads.

```
ViewDefinition [Floor Plan L2]  → EdgeProjectorService.project() → TechnicalDrawing A (cached)
ViewDefinition [Floor Plan L3]  → EdgeProjectorService.project() → TechnicalDrawing B (cached)
ViewDefinition [Elevation Front] → EdgeProjectorService.project() → TechnicalDrawing C (cached)
ViewDefinition [Section A-A]    → EdgeProjectorService.project() → TechnicalDrawing D (cached)
                                                                          ↓
                                                           DxfExporter.export([A,B,C,D])
                                                           SVGCompositeRenderer.render([A,B,C,D])
```

**For sheet preview thumbnails (the SheetEditorPanel):**

Each viewport thumbnail is a small offline render. A dedicated `ViewportPreviewRenderer` captures each `TechnicalDrawing` to a canvas. Each capture uses a temporary `THREE.OrthographicCamera` scoped to that viewport's crop region and scale — these are short-lived camera objects created and disposed per thumbnail render, never part of the interactive pipeline.

This means:
- The live interactive scene has 2 cameras (one perspective, one ortho) — no change needed.
- Sheet composition uses pre-computed EdgeProjector `LineSegments` — no interactive camera needed.
- Thumbnail rendering uses temporary per-viewport cameras — created on demand, disposed after capture.

### 2.3 `MultiViewCameraManager` Role

`MultiViewCameraManager` (already present) manages the interactive camera pool and its slot-based activation for the live viewport. It is **not** responsible for sheet composition cameras. Its role remains: manage which view is active in the 3D viewport and restore camera position when switching back.

For sheet composition, a new `ViewportCameraPool` will be introduced — a pool of disposable `THREE.OrthographicCamera` objects, one created per active viewport render, released after the thumbnail is captured. This keeps sheet rendering isolated from the interactive pipeline (§02 §6 — tool/preview scene isolation applies equally to sheet cameras).

### 2.4 `ViewDefinition` Camera Configuration Fields

Each `ViewDefinition` must carry enough information for `EdgeProjectorService` to set up the projection independently of the interactive camera:

```typescript
// Addition to ViewDefinitionTypes.ts — spatial context extension
interface ViewSpatialContext {
  // Existing fields
  levelId?: string;
  cutPlaneElevation?: number;
  viewDepth?: number;

  // New fields for documentation pipeline
  projectionDirection?: { x: number; y: number; z: number }; // normalised
  viewRange?: { nearOffset: number; farOffset: number };      // relative to cut plane
  cropRegion?: { minX: number; minZ: number; maxX: number; maxZ: number }; // world-space XZ
}
```

`BimManager` remains the sole authority for level elevations (§02 §1.1). The `nearOffset` and `farOffset` in `viewRange` are offsets relative to the level elevation resolved from `BimManager`, never absolute Y positions.

---

## 3. Layer 1 — 3D Scene: Two Geometry Sources

PRYZM works with two distinct sources of 3D geometry. Every downstream layer must handle both:

### 3.1 PRYZM Native Elements

Elements authored inside PRYZM (walls, slabs, columns, beams, openings, stairs, roofs, MEP, furniture). Stored in typed element stores. THREE.js geometry is built by dedicated Builders and cached in `PlanSymbolCache`.

**Current projection approach**: `PlanSymbolGenerator` and `PlanSymbolCache` produce flat 2D plan symbols at the cut plane level. These are stylised vector symbols, not true edge projections. They work for plan views only.

**Target approach**: A `NativeElementMeshExporter` exposes the actual 3D builder mesh geometry as temporary passable groups for `EdgeProjector`. The existing Builder geometries are referenced (not re-computed) — only their mesh references are temporarily grouped. This bridge enables true edge projection (visible + hidden lines, silhouettes) for native elements in all view types.

### 3.2 IFC / Fragment Models

Models imported via OBC `FragmentsManager`. `EdgeProjector` handles these natively and completely — it was designed for this source.

### 3.3 Hybrid Scenario

A PRYZM project can contain both. The `EdgeProjectorService.project()` call accepts both sources in one pass:

```typescript
// EdgeProjectorService.project() — both sources merged
async project(viewDef: ViewDefinition): Promise<TechnicalDrawing> {
  const direction = viewDef.spatial.projectionDirection ?? { x: 0, y: -1, z: 0 };
  const { nearOffset, farOffset } = viewDef.spatial.viewRange ?? { nearOffset: 0.9, farOffset: 3 };
  const levelElev = bimManager.getLevelElevation(viewDef.spatial.levelId); // §02 §1.2

  const drawing = technicalDrawings.create(world);
  drawing.orientTo(new THREE.Vector3(direction.x, direction.y, direction.z));

  // Source A: IFC/Fragment models — EdgeProjector handles natively
  const ifcItems = fragmentsManager.list.filter(/* level bounds */);
  await edgeProjector.project(ifcItems, {
    direction,
    near: levelElev + nearOffset,
    far: levelElev + farOffset,
  });
  drawing.addProjectionLines(edgeProjector.edges.get('visible'), 'projection-visible');
  drawing.addProjectionLines(edgeProjector.edges.get('hidden'),  'projection-hidden');

  // Source B: PRYZM native elements — via NativeElementMeshExporter
  const nativeMeshes = nativeElementMeshExporter.exportForView(viewDef);
  await edgeProjector.project(nativeMeshes, { direction, near: ..., far: ... });
  drawing.addProjectionLines(edgeProjector.edges.get('visible'), 'projection-visible');
  drawing.addProjectionLines(edgeProjector.edges.get('hidden'),  'projection-hidden');

  return drawing;
}
```

---

## 4. How EdgeProjector Works — Exact Mechanism

Understanding the exact internal mechanism of `EdgeProjector` is essential for correct integration.

### 4.1 What EdgeProjector Does

`EdgeProjector` takes a set of 3D geometry (any THREE.js `Mesh` objects, including those from loaded `FragmentsModel` instances) and a projection direction, and outputs flat 2D `THREE.LineSegments` representing the visible and hidden edges of that geometry as seen from that direction.

This is the same mathematical operation that Revit uses to generate floor plans and elevations from 3D models — it is **not** a screenshot or raster capture. It computes silhouette edges, contour edges, and hard edges (angles above the threshold) analytically.

### 4.2 Internal Pipeline

```
Input: Mesh objects + projection direction + near/far clip
         │
         ▼
Step 1: BVH (Bounding Volume Hierarchy) construction
         three-mesh-bvh wraps every mesh for O(log n) ray queries
         │
         ▼
Step 2: Silhouette detection (WebWorker — non-blocking)
         Runs silhouetteAsync.worker.js
         Iterates every edge in the mesh topology
         An edge is a silhouette if its two adjacent faces have opposite dot products
         against the projection direction: dot(face1.normal, dir) ≥ 0 and dot(face2.normal, dir) < 0
         │
         ▼
Step 3: Hard edge detection
         An edge is "hard" if the angle between its two adjacent faces exceeds
         edgeProjector.generator.angleThreshold (default 50°)
         Hard edges appear visible regardless of silhouette status
         │
         ▼
Step 4: Visibility determination
         For each candidate edge: cast rays from projected position back into scene BVH
         If ray hits another mesh before reaching this edge → hidden edge
         If ray reaches this edge unobstructed → visible edge
         │
         ▼
Step 5: Near/far clipping
         Edges outside [near, far] range along the projection direction are discarded
         This is how floor slicing works: near = cut plane, far = cut plane + storey height
         │
         ▼
Step 6: Output
         edgeProjector.edges.get('visible') → THREE.LineSegments (world space)
         edgeProjector.edges.get('hidden')  → THREE.LineSegments (world space, dashed material)
         Both are flat in the projection plane (all points at the same depth coordinate)
```

### 4.3 The WebWorker Contract

`EdgeProjector` uses a WebWorker (`silhouetteAsync.worker.js`) for the silhouette computation. This is critical: **edge projection does not block the main thread**. The integration must be async:

```typescript
// Always await — EdgeProjector is async
const drawing = await edgeProjectorService.project(viewDef);

// Timing characteristics:
// Simple plan (< 50 elements):    ~20-50ms
// Complex plan (200+ elements):  ~100-200ms
// Full building section:          ~200-500ms
// These run in a WebWorker — UI remains responsive during computation
```

The `ViewDependencyTracker` must respect this: re-projections triggered by element store changes must be debounced (suggest 300ms) so that rapid edits (e.g., typing a wall length) do not cascade into 30 consecutive 200ms projection calls.

### 4.4 Output Format — LineSegments and TechnicalDrawing

`EdgeProjector` outputs `THREE.LineSegments` objects. A `LineSegments` is a flat array of vertex positions where every pair of vertices defines one line segment:

```
positions: [x0,y0,z0, x1,y1,z1,  x2,y2,z2, x3,y3,z3, ...]
             └─────────────────┘   └─────────────────┘
                  segment 0              segment 1
```

These are placed into a `TechnicalDrawing` via `drawing.addProjectionLines(lineSegments, layerName)`. The `TechnicalDrawing` indexes them in a BVH so that annotation snap (dimension tool clicking on a wall edge) uses `drawing.raycast(ray)` — an O(log n) spatial query against the projected line segments, not against the full 3D geometry.

### 4.5 How ViewSync (Dirty-Flag Re-projection) Works

When a wall is moved or a door is added:

```
ElementStore.set(wallId, updatedWall)           ← CommandManager.execute() §01
         │
         ▼
StoreEventBus.emit('wall', 'update', wallId)    ← §01 §7 store change notification
         │
         ▼
ViewDependencyTracker.markDirty(affectedViewIds) ← subscribes to StoreEventBus
  (determines which views contain the changed element via level/spatial overlap)
         │
         ▼
UnifiedFrameLoop (low priority queue)            ← §02 §5 spatial reactivity
  → debounced 300ms after last dirty mark
  → EdgeProjectorService.reproject(dirtyViewIds)
         │
         ▼
Per dirty view:
  drawing.layers.get('projection-visible').clear()
  drawing.layers.get('projection-hidden').clear()
  EdgeProjector.project(items, options)          ← WebWorker, async
  drawing.addProjectionLines(newEdges, layer)
         │
         ▼
TechnicalDrawing updated → thumbnail re-rendered → SheetEditorPanel refreshes
```

This is directly analogous to `AnnotationDependencyGraph` — a reactive dirty-flag system. The key invariant: **`BimManager` is consulted for level elevation at every re-projection**, never caching level Y positions (§02 §1.2).

### 4.6 EdgeProjector and PRYZM Native Elements — The Bridge

`EdgeProjector.project()` accepts any THREE.js `Mesh` objects. PRYZM's builders already produce THREE.js geometry. The `NativeElementMeshExporter` temporarily groups the builder's mesh output:

```typescript
// NativeElementMeshExporter.ts — contract-compliant reference (no store pollution)
export class NativeElementMeshExporter {
  exportForView(viewDef: ViewDefinition): THREE.Group[] {
    const levelId = viewDef.spatial.levelId;
    const elementIds = bimManager.getElementsOnLevel(levelId); // §02 §1.4
    const groups: THREE.Group[] = [];

    for (const id of elementIds) {
      const root = elementRegistry.getRoot(id); // §02 §2.1 O(1) lookup
      if (!root) continue;

      // Reference only — do NOT clone, do NOT mutate, do NOT store
      // This group is passed to EdgeProjector and released after projection completes
      const ref = new THREE.Group();
      root.traverse(child => {
        if (child instanceof THREE.Mesh) ref.add(child); // reference, not clone
      });
      groups.push(ref);
    }
    return groups;
    // Caller is responsible for disposal after EdgeProjector.project() resolves
  }
}
```

**Contract compliance**: The mesh references are never stored in any PRYZM store. They exist only for the duration of the `EdgeProjector.project()` async call and are released immediately after. This satisfies §01 §5 (no THREE.js in stores) and §02 §4.3 (no orphaned geometry).

### 4.7 EdgeProjector and the VG System

PRYZM's VG governance (category colors, visibility, halftone) must be reflected in the EdgeProjector output. The integration point is the `LineSegments` material applied per layer:

```typescript
// VGSceneApplicator extends to apply VG to projection line materials
const vgRecord = vgGovernanceStore.resolveForView(viewDefId);
const wallVg = vgRecord.categories['wall'];

// Set material on the projection layer for walls
const wallProjectionLayer = drawing.layers.get('A-WALL');
if (!wallVg.visible) {
  wallProjectionLayer.visible = false;
} else {
  wallProjectionLayer.color = wallVg.color;         // as THREE.Color
  wallProjectionLayer.opacity = wallVg.transparency;
}
```

This is additive to `VGSceneApplicator` — a new `applyToProjectionLayers(drawing, viewDefId)` method.

---

## 5. Layer 2 — View Engine

### 5.1 What PRYZM Has Today

| View Type | Status | How |
|---|---|---|
| `plan` (floor plan) | ✅ Works | `PlanViewService` — orthographic camera, `PlanSymbolCache` for native symbols, `LevelClipPlaneCache` for IFC clipping |
| `ceiling-plan` (RCP) | ⚠️ Schema only | `lookingUp` flag exists in schema, no dedicated projection |
| `section` | ⚠️ Partial | `SectionViewService` — clip planes applied to 3D model. No vector output. |
| `elevation` | ⚠️ Partial | Camera snap to orthographic + direction. No vector output. |
| `detail` | ❌ Schema only | No service, no crop region, no projection |
| `drafting` | ❌ Schema only | No implementation |
| `legend` | ❌ Schema only | No implementation |
| `structural-plan` | ⚠️ Schema only | No structural symbol differentiation |
| `3d` / `walkthrough` / `render` | ✅ Works | Standard perspective camera |

### 5.2 OBC 3.4.0 Contributions to View Engine

OBC provides two view-relevant primitives:

**`EdgeProjector`**: Handles the projection computation (described in detail in §4 above). Direction-agnostic — works for plan, section, elevation, RCP equally.

**`TechnicalDrawing` + `DrawingViewports`**:
- `TechnicalDrawing` is a `THREE.Group` container for all projected geometry and annotations for one view.
- `drawing.orientTo(normal)` sets the drawing plane orientation to match the projection direction.
- `drawing.viewports.create({left, right, top, bottom})` defines orthographic crop windows for sheet placement.
- Multiple viewports per drawing → one drawing can represent one full sheet with multiple view crops.
- `DrawingViewport` exposes a `THREE.OrthographicCamera` configured for paper-space rendering.

**What OBC does NOT provide**: A view manager, level management, VG governance, or any concept of PRYZM `ViewDefinition`. These remain entirely PRYZM-owned.

### 5.3 Gap Analysis: View Types After EdgeProjector Integration

| View Type | After Integration |
|---|---|
| **Floor Plan** | EdgeProjector `(0,-1,0)` + native element bridge. True vector linework replaces symbols. |
| **RCP** | EdgeProjector `(0,+1,0)` + ceiling-height near clip. Same pipeline as plan, inverted. |
| **Section** | EdgeProjector with section direction + near clip at cut plane. `SectionViewService` triggers projection. |
| **Elevation** | EdgeProjector `(0,0,±1)` or `(±1,0,0)`. `ViewController` reads `ViewDefinition.projectionDirection`. |
| **Detail** | EdgeProjector with tight `cropRegion` bounds. Parent-child `ViewDefinition` linkage via `parentViewId`. |
| **Drafting** | No projection — blank `TechnicalDrawing` canvas. Users place annotations directly. |
| **Structural Plan** | Same as floor plan but with structural category VG filter applied to EdgeProjector output. |

### 5.4 View Sync Contract

```
ElementStore.onChange
   → ViewDependencyTracker.markDirty(affectedViewIds)   [§01 StoreEventBus pattern]
   → UnifiedFrameLoop (low priority, debounced 300ms)
   → EdgeProjectorService.reproject(dirtyViewIds)        [async, WebWorker]
   → TechnicalDrawing updated
   → ViewportPreviewRenderer.invalidate(viewId)
   → SheetEditorPanel thumbnail refreshed
```

Level elevation is always re-resolved from `BimManager.getLevelElevation(levelId)` at re-projection time. Never cached (§02 §1.2).

---

## 6. Layer 3 — Annotation Engine: Full Revit-Grade Coverage

### 6.1 Current PRYZM Annotation Architecture — What Is Kept

**Kept without change:**
- `AnnotationStore.ts` — the authoritative data layer. All annotations live here as plain serialisable DTOs. No THREE.js (§01 §5).
- `AnnotationDependencyGraph.ts` — reactive element-to-annotation reverse index. Subscribe pattern extended to also dirty `ViewDependencyTracker`.
- `AnnotationVisibilityStore.ts` — per-view, per-category visibility.
- `ConstraintStore.ts` / `ConstraintSolver.ts` — driving dimension constraint enforcement.
- `AnnotationReference.ts` (`StableReference`) — survives geometry rebuilds. Extended to support IFC `GlobalId` references.
- All six existing commands (`CreateAnnotationCommand`, `UpdateAnnotationCommand`, `DeleteAnnotationCommand`, `LockAnnotationCommand`, `UpdateConstraintCommand`, `AnnotateViewCommand`) — kept exactly as-is.
- All six existing tools (`LinearDimensionAnnotationTool`, `AngularDimensionAnnotationTool`, `TextNoteTool`, `ElementTagTool`, `SpotElevationAnnotationTool`, `KeynoteTool`) — kept, potentially enhanced with OBC snap.
- `AnnotationRenderLayer.ts` — the Canvas 2D overlay renderer. **Kept as the live-view renderer**. This is the PRYZM-side rendering for real-time annotation display in the interactive viewport.

**Kept but extended:**
- `AnnotationTypes.ts` — new `AnnotationType` discriminants added for each new type (slope-dim, radius-dim, door-tag, window-tag, level-tag, grid-bubble, section-mark, elevation-mark, callout-detail, north-arrow, scale-bar, revision-cloud, matchline, breakline).
- `AnnotationElement` DTO — new `parameters` sub-schemas per type (type-narrowed, no `any`).

**Extended with new method:**
- `AnnotationRenderLayer.ts` — new renderers added for each new annotation type. Same Canvas 2D approach.

### 6.2 How OBC Annotation Systems Integrate

OBC provides six annotation systems: `LinearAnnotations`, `AngleAnnotations`, `LeaderAnnotations`, `BlockAnnotations`, `SlopeAnnotations`, `CalloutAnnotations`. These are interaction + geometry engines — they drive the tool state machines and produce committed geometry.

**The integration pattern — OBCAnnotationAdapter:**

```
User picks points in viewport
         │
         ▼
DrawingEditor (OBC, @thatopen/components-front)
  routes pointer events to active OBC annotation system
  OBC state machine: awaitingFirstPoint → positioningOffset → committed
         │
         ▼  onCommit fires
OBCAnnotationAdapter.ts  ← NEW FILE (src/elements/annotations/)
  1. Receives OBC commit payload (pointA, pointB, offset, style)
  2. Extracts plain measurement data — NO THREE.Group references
  3. Resolves StableReference: nearest BIM element or point ref
  4. Builds PRYZM AnnotationElement DTO
  5. Dispatches new CreateAnnotationCommand(element) via CommandManager  ← §01 §3
  6. OBC THREE.js preview geometry is disposed immediately
         │
         ▼
CommandManager.execute()
  → AnnotationStore.add(element)
  → StoreEventBus notifies AnnotationDependencyGraph
  → AnnotationRenderLayer renders via Canvas 2D on next frame
```

**What OBC geometry is used for (and not used for):**
- Used for: interaction preview (the in-progress dimension line as you move the mouse), BVH snap to projected wall edges, and ephemeral DXF export geometry.
- NOT used for: live annotation rendering (PRYZM Canvas 2D does this), persistent storage (PRYZM AnnotationStore does this), undo/redo (PRYZM CommandManager does this).

The OBC THREE.js geometry produced during the commit is **never forwarded to any PRYZM store**. This is the key contract compliance point.

### 6.3 Why This Dual-Layer Architecture?

1. **Undo/redo**: OBC has no undo system. PRYZM's `CommandManager` is the sole undo authority (§01 §3).
2. **StableReference**: OBC snaps to projected line segments — static points. PRYZM's `StableReference` snaps to live BIM elements that survive geometry rebuilds. When a wall moves, PRYZM annotations follow; OBC annotations would detach.
3. **Per-view scoping**: OBC annotations belong to a `TechnicalDrawing`, not a PRYZM `ViewDefinition`. PRYZM's `ownerViewId` scoping semantics are richer.
4. **Sheet rendering**: PRYZM's paper-space rendering pipeline uses the `AnnotationStore` DTOs → SVG element conversion, not OBC's THREE.js geometry.
5. **AI integration**: `AnnotateViewCommand` (AI macro) dispatches `CreateAnnotationCommand` instances. This works with the DTO-based store, not with OBC geometry.

### 6.4 OBC Snap as an Enhancement

OBC's `DrawingEditor` provides BVH-accelerated snap to `TechnicalDrawing` projection lines. This is a significant improvement over PRYZM's current wall-face snap, which uses raycasting against the full 3D mesh. The snap improvement is additive:

- Current: `LinearDimensionAnnotationTool` uses `WallFaceDetector` → raycasts against 3D wall geometry.
- After: The tool can optionally use `drawing.raycast(ray)` → O(log n) snap to projected edge segments in the active view's `TechnicalDrawing`.

Both snap paths remain valid. The 3D raycast is preferred when no `TechnicalDrawing` is active (e.g., annotating in 3D perspective).

### 6.5 Complete Annotation Type Analysis

#### 6.5.1 Dimensions

| Type | PRYZM Today | OBC 3.4.0 | Approach | DXF |
|---|---|---|---|---|
| **Linear dimension** | ✅ Full — wall-face snap, chains, constraint | ✅ `LinearAnnotations` — BVH snap, THREE.js | Keep PRYZM for live view. Use OBC snap when TechnicalDrawing active. DXF bridge. | Via `AnnotationDxfBridge` → OBC `LinearAnnotations` ephemerally |
| **Angular dimension** | ✅ `angular-dim` — 3-click, Canvas 2D | ✅ `AngleAnnotations` | Same as linear | Via DXF bridge |
| **Radius dimension** | ❌ | ❌ | New `radius-dim` type + `RadiusDimensionTool` + Canvas 2D arc | Custom `DxfExporter.registerSystemExporter()` |
| **Diameter dimension** | ❌ | ❌ | New `diameter-dim` + two-point chord + ⌀ symbol | Custom DXF |
| **Spot elevation** | ✅ Canvas 2D | ❌ | Keep PRYZM. Add DXF bridge. | Via DXF bridge (POINT + TEXT entities) |
| **Slope annotation** | ❌ | ✅ `SlopeAnnotations` | New `slope-dim` AnnotationType. OBC interaction. PRYZM Canvas 2D render. | Via DXF bridge → OBC `SlopeAnnotations` |
| **Stair arrow** | ❌ | ❌ | Custom Canvas 2D — UP/DN text + run arrow | Custom DXF TEXT + LEADER |

#### 6.5.2 Text & Notes

| Type | PRYZM Today | OBC 3.4.0 | Approach |
|---|---|---|---|
| **Text note** | ✅ `text-note` — Canvas 2D | ⚠️ `BlockAnnotations` closest | Keep PRYZM. DXF bridge → MTEXT entity. |
| **Multi-line text** | ⚠️ Partial wrapping | ❌ | Improve Canvas 2D wrapping. DXF MTEXT. |
| **Leader note** | ⚠️ via `tag` type | ✅ `LeaderAnnotations` — polyline leader | Use OBC for interaction. Adapter → `text-note` AnnotationType. |

#### 6.5.3 Tags

| Type | PRYZM Today | OBC 3.4.0 | Approach |
|---|---|---|---|
| **Generic element tag** | ✅ `tag` — `${type}`, `${mark}`, `${parameter:X}`, Canvas 2D | ❌ | Keep. DXF bridge → TEXT + LEADER. |
| **Door/Window tag** | ⚠️ Generic `tag` | ❌ | New `door-tag`, `window-tag` types — circle/diamond bubble. IFC property mapping. |
| **Room/Space tag** | ❌ | ❌ | Blocked on RoomStore. Future work. |
| **Level tag** | ❌ | ❌ | New `level-tag`. Reads `bimManager.getLevels()`. Triangle head + elevation. |
| **Grid bubble** | ❌ | ❌ | New `grid-bubble`. Reads `gridStore`. Circle with alphanumeric. Auto-placed. |
| **Structural member tag** | ⚠️ Generic `tag` | ❌ | Custom rectangular bubble. |

#### 6.5.4 View Reference Symbols

| Type | PRYZM Today | OBC 3.4.0 | Approach |
|---|---|---|---|
| **Section mark** | ❌ | ❌ | New `section-mark`. Auto-placed when section ViewDefinition created. Head shows sheet+detail number via `ViewLinkResolver`. |
| **Elevation mark** | ❌ | ❌ | New `elevation-mark`. Circle with 4 directional fills, each linked to elevation ViewDefinition. |
| **Callout bubble** | ⚠️ `keynote` closest | ✅ `CalloutAnnotations` | New `callout-detail` type. OBC interaction. Links to `detail` ViewDefinition via `parentViewId`. |
| **Revision cloud** | ❌ | ❌ | New `revision-cloud`. Polygon of arc segments. `RevisionCloudTool`. Canvas 2D arcs. |

#### 6.5.5 Symbols & Notation

| Type | PRYZM Today | OBC 3.4.0 | Approach |
|---|---|---|---|
| **North arrow** | ❌ | ❌ | Sheet-level symbol (not view-specific). Canvas 2D. Rotation from project north. |
| **Scale bar** | ❌ | ❌ | Derived from `SheetViewport.scale`. Canvas 2D graduated bar. |
| **Matchline** | ❌ | ❌ | Line + text label. Canvas 2D. Sheet-level linkage. |
| **Breakline** | ❌ | ❌ | Zigzag truncation symbol. Canvas 2D. |
| **Column symbol (plan)** | ⚠️ PlanSymbolCache | ✅ `BlockAnnotations` | Use OBC `BlockAnnotations`. Instance from ColumnStore positions. Auto-generated. |
| **Door swing (plan)** | ⚠️ PlanSymbolCache | ✅ `BlockAnnotations` | Use OBC `BlockAnnotations`. Instance from WallStore openings. |
| **Keynote** | ✅ Full — hexagon bubble + leader | ⚠️ `CalloutAnnotations` closest | Keep PRYZM. DXF bridge. |
| **Detail line** | ✅ `detail-line` — any style | ❌ | Keep. DXF bridge → LINE entity. |

### 6.6 `DimensionManager.ts` — Deprecation Required Before Phase 1

`DimensionManager.ts` (located at `src/elements/dimensions/`) creates THREE.js `LineSegments` and `Mesh` objects directly in the THREE.js scene, bypassing the store layer. This is a soft violation of §01 §5 (no THREE.js in the command/store layer) and a hard violation of §02 §4.3 (builders are the only creators of scene geometry). It predates `AnnotationRenderLayer` and is now redundant.

**Action**: Deprecate and remove `DimensionManager.ts` before Phase 1 begins. Verify that `AnnotationRenderLayer` covers all its current display output. This avoids the new pipeline inheriting its scene-mutation behaviour.

---

## 7. Layer 4 — Visibility Graphics (VG)

### 7.1 What PRYZM Has — Kept Entirely

The VG system is more complete than expected:

| Capability | Status |
|---|---|
| Per-category color, transparency, halftone, visibility | ✅ Works |
| View-level overrides | ✅ Works |
| Template system (apply preset to multiple views) | ✅ Works |
| Query-based visibility rules (`VisibilityRuleEngine`) | ✅ Works |
| Real-time sync (`VGSceneApplicator`) | ✅ Works |
| Undo/Redo for all VG changes | ✅ Works |
| IFC model category VG | ✅ Works |

**None of this is replaced.** OBC has no VG system. The PRYZM VG system is extended to:
1. Apply VG rules to `EdgeProjector` output line materials (new `applyToProjectionLayers()` method on `VGSceneApplicator`).
2. Add annotation category VG for new annotation types.
3. Wire `underlayStyle` (already in ViewDefinition schema) to `VGSceneApplicator` — a small wiring gap.

### 7.2 VG Gaps to Address

| Gap | Fix |
|---|---|
| Per-instance overrides (instance-level, not category-level) | Phase 4 — complex |
| True line weight > 1px (WebGL hardware limit) | SVG overlay or CSS line technique for paper-space |
| Underlay halftone not applied | Small fix: wire `underlayStyle` in `VGSceneApplicator` |
| Phase visibility (temporal context) | Wire `temporal` context in ViewDefinition to VGSceneApplicator |
| Per-subcategory overrides ("Walls: Common Edges") | Phase 3 — subcategory classification |

---

## 8. Layer 4 — Sheet Composition

### 8.1 What PRYZM Has — Kept Entirely

`SheetStore`, `TitleBlockStore`, `SheetEditorPanel` (SC-1 through SC-8), `ViewportPreviewRenderer` — all kept. The data layer is complete. The missing piece is **content quality**: viewport previews show plan symbols only, export paths are limited, and annotations never appear.

### 8.2 Multi-Viewport Sheet — Camera Architecture Revisited

When the user has a sheet with 3 plan views and a section:

```
Sheet: A1 Drawing — Floor Plans + Section
  ┌────────────────────────────────────────────────────┐
  │  Viewport 1: Floor Plan L1  │  Viewport 2: FL Plan L2 │
  │  Scale 1:100                │  Scale 1:100            │
  ├────────────────────────────────────────────────────┤
  │  Viewport 3: Floor Plan L3  │  Viewport 4: Section A-A│
  │  Scale 1:100                │  Scale 1:50             │
  └────────────────────────────────────────────────────┘
```

Each viewport corresponds to one `ViewDefinition`. Each `ViewDefinition` has one `TechnicalDrawing` (computed by `EdgeProjectorService` and cached in `ViewTechnicalDrawingCache`). The DXF exporter receives all four drawings simultaneously:

```typescript
// DxfExportService.exportSheetToDxf(sheetId)
const sheet = sheetStore.get(sheetId);
const entries = sheet.viewports.map(vp => {
  const drawing = viewTechnicalDrawingCache.get(vp.viewDefinitionId);
  return {
    drawing,
    viewports: [{
      x: vp.position.x,      // mm on paper
      y: vp.position.y,      // mm on paper
      scale: vp.scale,       // e.g. 0.01 for 1:100
    }]
  };
});
dxfExporter.export(entries, {
  widthMm: sheet.paperSize.widthMm,
  heightMm: sheet.paperSize.heightMm,
  margin: 10,
});
```

No interactive camera is involved at this stage. The `TechnicalDrawing` objects are pre-computed geometry stores.

**For the SheetEditorPanel thumbnails**, each viewport is rendered with a short-lived `THREE.OrthographicCamera`:

```typescript
// ViewportThumbnailRenderer — per-viewport camera (created + disposed per capture)
async captureThumbnail(viewDef: ViewDefinition, widthPx: number, heightPx: number): Promise<ImageBitmap> {
  const drawing = viewTechnicalDrawingCache.get(viewDef.id);
  const cam = new THREE.OrthographicCamera(...); // temporary — never stored
  // Configure cam from viewDef.spatial.cropRegion + scale
  // Render drawing to offscreen canvas
  // Dispose cam
  return bitmap;
}
```

These cameras are isolated from `MultiViewCameraManager` and the interactive pipeline (§02 §6.2 preview isolation rule).

### 8.3 OBC Paper Space DXF

OBC's `DxfExporter` supports paper-space composition natively:

```typescript
dxfExporter.export([
  { drawing: drawingA, viewports: [{ x: 10,  y: 150, scale: 0.01 }] },
  { drawing: drawingB, viewports: [{ x: 210, y: 150, scale: 0.01 }] },
  { drawing: drawingC, viewports: [{ x: 10,  y: 10,  scale: 0.02 }] },
  { drawing: drawingD, viewports: [{ x: 210, y: 10,  scale: 0.02 }] },
], { widthMm: 841, heightMm: 594, margin: 10 }); // A1 landscape
```

Output: AC1015 (AutoCAD R2000 compatible) DXF string. This maps directly to PRYZM's `SheetDefinition` → `SheetViewport` array. No schema changes needed in `SheetStore`.

---

## 9. Layer 5 — Export Formats

### 9.1 Print (Browser)

**Status**: ✅ Works. **Gap**: Annotations don't appear; quality matches screen resolution.
**Path**: Once `SVGCompositeRenderer` is built, the SVG DOM can be printed at any resolution. Annotations appear in print for the first time.

### 9.2 PDF (Vector)

**Status**: ❌ Not implemented.
**Approach** (Strategy A — client-side vector PDF):
```
SheetDefinition + ViewTechnicalDrawingCache →
SVGCompositeRenderer (new) →
SVG document (vector linework + annotation geometry + title block) →
jsPDF + svg2pdf.js → PDF blob download
```
**ISO format**: PDF/A-1b (AEC archival standard).

### 9.3 DXF / DWG

**DXF Status**: ❌ Not implemented. **OBC provides**: `DxfExporter` → AC1015 DXF.
**DWG**: DWG is a proprietary Autodesk format. Open-source DWG write is not available without commercial Teigha/ODA library. **Deliver DXF — universally accepted in AEC.**

**DXF layer naming** (ISO 13567):
| PRYZM concept | DXF layer |
|---|---|
| Wall projection lines | `A-WALL` |
| Slab projection lines | `A-FLOR` |
| Column projection lines | `A-COLS` |
| Door/window projection lines | `A-DOOR`, `A-GLAZ` |
| Linear dimensions | `A-ANNO-DIMS` |
| Text notes | `A-ANNO-TEXT` |
| Tags | `A-ANNO-TAGS` |
| Section/elevation marks | `A-ANNO-VIEW` |
| Grid lines | `S-GRID` |
| Title block | `T-BLK` |

### 9.4 DWF

**Recommendation**: Deprioritise. AEC market is moving from DWF to PDF for 2D delivery and IFC for model delivery. Deliver a bundle of PDF + DXF + IFC instead.

### 9.5 IFC Annotation Export

`IfcDraughtingAnnotation` and `IfcAnnotation` entities — future phase. Not in scope for this implementation plan but architecturally supported by the AnnotationStore DTO approach.

---

## 10. What Is Kept, Extended, and Deprecated

### 10.1 Kept Without Change

| Module | Location | Reason |
|---|---|---|
| `AnnotationStore` | `src/elements/annotations/AnnotationStore.ts` | Authoritative data layer. Complete. |
| `AnnotationDependencyGraph` | `src/elements/annotations/AnnotationDependencyGraph.ts` | Correct reactive pattern. Extended to dirty ViewDependencyTracker. |
| `AnnotationVisibilityStore` | `src/elements/annotations/AnnotationVisibilityStore.ts` | Complete for existing types. |
| `ConstraintStore` + `ConstraintSolver` | `src/elements/annotations/` | Driving dimensions. No change. |
| `AnnotationReference` / `StableReference` | `src/elements/annotations/AnnotationReference.ts` | Survives rebuilds. Extended for IFC GlobalId. |
| All 6 annotation commands | `src/commands/annotations/` | Fully undoable. No change. |
| `CommandManager` | `src/commands/` | Sole mutation authority (§01 §3). |
| `BimManager` | `src/core/` | Sole spatial authority (§02 §1.1). |
| `ElementRegistry` | `src/core/` | O(1) element lookup (§02 §2.1). |
| `StoreRegistry` | `src/core/` | Store lookup (§01). |
| `StoreEventBus` | `src/core/` | Event notification (§01 §7). |
| `VGGovernanceStore` + `VGSceneApplicator` | `src/core/` | VG governance. Extended for projection layers. |
| `SheetStore` + `TitleBlockStore` | `src/core/views/` | Complete data layer. No change. |
| `SheetEditorPanel` (SC-1 through SC-8) | `src/ui/SheetEditor/` | Complete UI. Export dialog extended. |
| `PlanViewService` | `src/core/views/` | Kept; orchestrates plan activation. Gains EdgeProjectorService call. |
| `SectionViewService` | `src/core/views/` | Kept; gains EdgeProjectorService call after clip plane setup. |
| `ViewController` | `src/core/views/` | Kept; extended to handle elevation direction + EdgeProjectorService. |
| `LevelClipPlaneCache` | `src/core/views/` | Kept for IFC fragment clipping in interactive 3D view. |
| `MultiViewCameraManager` | `src/core/rendering/` | Kept for interactive viewport. Not involved in sheet composition. |
| `UnifiedFrameLoop` | `src/core/rendering/` | Priority queue. `ViewDependencyTracker` registers low-priority projection tasks. |

### 10.2 Extended (Modified)

| Module | Additions |
|---|---|
| `AnnotationTypes.ts` | New `AnnotationType` discriminants: slope-dim, radius-dim, diameter-dim, door-tag, window-tag, level-tag, grid-bubble, section-mark, elevation-mark, callout-detail, north-arrow, scale-bar, revision-cloud, matchline, breakline |
| `AnnotationRenderLayer.ts` | New Canvas 2D renderers for each new annotation type |
| `AnnotationReference.ts` | IFC `GlobalId` reference type added |
| `VGSceneApplicator.ts` | New `applyToProjectionLayers(drawing, viewDefId)` method |
| `ViewDefinitionTypes.ts` | `projectionDirection`, `viewRange`, `cropRegion` fields in `ViewSpatialContext` |
| `SheetExportService.ts` | New methods: `exportToDxf()`, `exportToPdf()`, updated `exportToSvg()` |
| `ViewportPreviewRenderer.ts` | Uses `ViewportThumbnailRenderer` (new) for EdgeProjector-based content |

### 10.3 Deprecated and Removed

| Module | Location | Reason | When |
|---|---|---|---|
| `DimensionManager.ts` | `src/elements/dimensions/` | Creates THREE.js objects in scene directly; bypasses store layer; predates AnnotationRenderLayer; §01 §5 soft violation. | **Before Phase 1 starts** |
| `PlanSymbolGenerator.ts` | `src/core/views/` | Replaced by EdgeProjector for native elements once `NativeElementMeshExporter` bridge is complete. | **Phase 2 — after bridge is validated** |
| `PlanSymbolCache.ts` | `src/core/views/` | Lifecycle manager for PlanSymbolGenerator output. Deprecated with PlanSymbolGenerator. | **Phase 2** |

**Important**: `PlanSymbolGenerator` and `PlanSymbolCache` are kept through Phase 1 as the fallback plan renderer for native elements. Removing them before the EdgeProjector native bridge is validated would break plan view. They are deprecated only after the bridge achieves functional parity.

### 10.4 New Files Created

| File | Purpose |
|---|---|
| `src/core/views/EdgeProjectorService.ts` | Wraps OBC `EdgeProjector`. Handles all view types, directions, native + IFC geometry. |
| `src/core/views/ViewDependencyTracker.ts` | Dirty-flag system: element changes → affected view IDs → re-projection queue. |
| `src/core/views/ViewTechnicalDrawingCache.ts` | In-memory cache: `viewDefinitionId → TechnicalDrawing`. Invalidated on re-projection. |
| `src/core/views/ViewportThumbnailRenderer.ts` | Per-viewport thumbnail capture using temporary orthographic camera. |
| `src/core/geometry/NativeElementMeshExporter.ts` | Exposes builder mesh geometry for EdgeProjector. References only — no cloning, no store storage. |
| `src/elements/annotations/OBCAnnotationAdapter.ts` | Intercepts OBC `onCommit` events. Converts to `AnnotationElement` DTO. Dispatches `CreateAnnotationCommand`. |
| `src/export/sheets/DxfExportService.ts` | Full DXF export path. Assembles TechnicalDrawings per viewport. Calls OBC `DxfExporter`. |
| `src/export/sheets/AnnotationDxfBridge.ts` | Reads `AnnotationStore`. Creates ephemeral OBC annotation items for DXF serialisation. Disposes after export. |
| `src/export/sheets/SVGCompositeRenderer.ts` | Converts `TechnicalDrawing` LineSegments + AnnotationStore → SVG document. |
| `src/commands/views/CreateDetailViewCommand.ts` | Creates a `detail` ViewDefinition with `parentViewId` and `cropRegion`. |
| `src/commands/annotations/CreateSectionMarkCommand.ts` | Creates section ViewDefinition + auto-placed `section-mark` annotation. Atomic. |
| `src/commands/annotations/CreateElevationMarkCommand.ts` | Creates elevation ViewDefinition + `elevation-mark` annotation. Atomic. |
| `src/core/views/ViewLinkResolver.ts` | Maps `viewDefinitionId` → sheet number + detail number from `SheetStore`. Used by section-mark and elevation-mark renderers. |

---

## 11. OBC Package Upgrade — Pre-conditions and Risks

### 11.1 Version Gap

| Package | Currently Installed | Required for 3.4.0 Features | Risk |
|---|---|---|---|
| `@thatopen/components` | `3.3.3` | `3.4.0` | Medium — TechnicalDrawings API is new in 3.4.0 |
| `@thatopen/fragments` | current | `~3.4.0` | Medium — Fragment format may change |
| `web-ifc` | `0.0.74` | `>=0.0.77` | **HIGH — WASM API changes may break IFC loading** |
| `@thatopen/components-front` | not installed | `~3.4.0` | Low — new additive package |
| `camera-controls` | `3.1.2` | `>=3.1.2` | None — already satisfies |
| `three` | `0.183.2` | `>=0.182.0` | None — already satisfies |

### 11.2 Mandatory Pre-upgrade Validation

Before any code targets 3.4.0 APIs:

1. **Test Fragment format compatibility**: Load existing project IFC files with `web-ifc 0.0.77`. Verify geometry and property data are identical. If Fragment format changed between 0.0.74 and 0.0.77, stored projects must be migrated (re-exported from the original IFC files).
2. **`TechnicalDrawings` API surface test**: Build an isolated test against OBC 3.4.0 in a branch. Verify `EdgeProjector`, `TechnicalDrawing`, `DrawingViewports`, `DxfManager` APIs match the study's assumptions.
3. **Peer dependency chain**: `@thatopen/components` 3.4.0 → `@thatopen/fragments` 3.4.x → `web-ifc` 0.0.77. All must be updated together.

**If the Fragment format breaks**: A migration route is needed. The safe approach is to store original IFC file references in `pgProjectStore` so they can be re-imported. Projects using only PRYZM native elements are unaffected.

### 11.3 Feature Availability Without the Upgrade

Phase 1 foundation work (architecture, file structure, `EdgeProjectorService` scaffold, `ViewDependencyTracker`, `NativeElementMeshExporter`, `ViewDefinition` field additions) can be written and tested with `@thatopen/components 3.3.3` as long as the 3.4.0-specific APIs (`TechnicalDrawings`, `EdgeProjector`) are behind a feature flag. This reduces risk — the upgrade becomes a targeted step within Phase 1, not a prerequisite for all other development.

---

## 12. Complete Gap Matrix

| Feature | PRYZM Today | OBC 3.4.0 | Keep / Replace / New | Phase |
|---|---|---|---|---|
| **Floor plan (plan symbols)** | ✅ PlanSymbolCache | EdgeProjector | Replace (Phase 2) | 1→2 |
| **Floor plan (native geometry)** | ✅ PlanSymbolCache | Needs NativeElementMeshExporter bridge | Replace (Phase 2) | 1→2 |
| **Floor plan (IFC)** | ⚠️ Basic clipping | ✅ EdgeProjector | New (Phase 1) | 1 |
| **Section (vector)** | ⚠️ Clipped 3D | ✅ EdgeProjector | New (Phase 1) | 1 |
| **Elevation (vector)** | ⚠️ Camera snap | ✅ EdgeProjector | New (Phase 1) | 1 |
| **RCP** | ❌ | ✅ EdgeProjector inverted | New | 1 |
| **Detail view** | ❌ | EdgeProjector + crop | New | 1 |
| **Hidden lines** | ❌ | ✅ EdgeProjector toggle | New | 1 |
| **View sync on element change** | ⚠️ plan symbols only | ViewDependencyTracker + re-project | New | 1 |
| **Multi-viewport sheet composition** | ⚠️ Thumbnails only | TechnicalDrawing cache | Extend | 1 |
| **Multi-viewport cameras** | N/A (1 active) | ViewportThumbnailRenderer pool | New | 1 |
| **Linear dimension** | ✅ Full | ✅ OBC snap + DXF | Keep + DXF bridge | 2→3 |
| **Angular dimension** | ✅ | ✅ OBC DXF | Keep + DXF bridge | 2→3 |
| **Radius/Diameter dim** | ❌ | ❌ | New full build | 2 |
| **Slope annotation** | ❌ | ✅ SlopeAnnotations | Adapter | 2 |
| **Text note** | ✅ | DXF bridge | Keep + DXF | 2→3 |
| **Leader note** | ⚠️ | ✅ LeaderAnnotations | Adapter | 2 |
| **Generic element tag** | ✅ | ❌ | Keep + DXF | 2→3 |
| **Door/Window tag** | ⚠️ | ❌ | New dedicated type | 2 |
| **Level tag** | ❌ | ❌ | New | 2 |
| **Grid bubble** | ❌ | ❌ | New | 2 |
| **Column symbol (plan)** | ⚠️ | ✅ BlockAnnotations | OBC BlockAnnotations | 2 |
| **Door swing (plan)** | ⚠️ | ✅ BlockAnnotations | OBC BlockAnnotations | 2 |
| **Section mark** | ❌ | ❌ | New — complex (view linkage) | 2 |
| **Elevation mark** | ❌ | ❌ | New — complex (view linkage) | 2 |
| **Callout bubble** | ⚠️ | ✅ CalloutAnnotations | Adapter | 2 |
| **Keynote** | ✅ | ⚠️ | Keep + DXF | 2→3 |
| **Revision cloud** | ❌ | ❌ | New | 2 |
| **North arrow / Scale bar** | ❌ | ❌ | New (simple) | 2 |
| **Matchline / Breakline** | ❌ | ❌ | New | 2 |
| **VG 4-tier cascade** | ✅ | ❌ OBC has no VG | Keep + extend to projection layers | 1 |
| **Underlay halftone** | ⚠️ schema only | ❌ | Wire VGSceneApplicator | 1 |
| **True line weights** | ⚠️ WebGL limited | ❌ | SVG overlay technique | 3 |
| **PDF (vector)** | ❌ | Strategy A: SVG→PDF | New — SVGCompositeRenderer | 3 |
| **DXF export** | ❌ | ✅ DxfExporter | New — DxfExportService + bridge | 3 |
| **DWG export** | ❌ | ❌ proprietary | Not recommended | — |
| **DWF export** | ❌ | ❌ | Not recommended | — |
| **Annotations in any export** | ❌ | Via DXF bridge | New — AnnotationDxfBridge | 3 |
| **IFC annotation export** | ❌ | Future `IfcAnnotation` | Future | 4 |
| `DimensionManager.ts` | ⚠️ legacy | — | **Deprecate before Phase 1** | pre-1 |

---

## 13. Implementation Plan — Phased

### Pre-Phase: Cleanup (1 week — before any other work)

- **Remove `DimensionManager.ts`**: Verify `AnnotationRenderLayer` covers all its display. Remove file. Any remaining THREE.js dimension objects in the scene from `DimensionManager` must be cleaned up.
- **Validate OBC upgrade path**: In an isolated branch, upgrade `@thatopen/components` → 3.4.0, `web-ifc` → 0.0.77. Test IFC file loading with existing project data. Document findings. If Fragment format is compatible: proceed with upgrade in Phase 1. If not: build a Fragment migration utility first.
- **Add `@thatopen/components-front` to `package.json`**: Additive, no existing code affected.

---

### Phase 1: Vector Projection Engine (10–14 weeks)

**Goal**: All view types produce true vector linework from `EdgeProjector`. Multi-viewport sheet composition works for documentation output. `PlanSymbolCache` kept as fallback.

**Milestone 1.1 — Upgrade and scaffold (2 weeks)**
- Upgrade `@thatopen/components` → 3.4.0 + `web-ifc` → 0.0.77 (gated on pre-phase validation)
- Create `EdgeProjectorService.ts` — handles all view types (plan, section, elevation, RCP, detail) with correct direction and near/far from `ViewDefinition` + `BimManager`
- Create `ViewDependencyTracker.ts` — subscribes to `StoreEventBus`, computes affected view IDs, queues dirty views in `UnifiedFrameLoop` low priority
- Create `ViewTechnicalDrawingCache.ts` — `viewDefinitionId → TechnicalDrawing` persistent cache
- Add `projectionDirection`, `viewRange`, `cropRegion` fields to `ViewDefinitionTypes.ts`

**Milestone 1.2 — IFC model projection (3 weeks)**
- Wire `EdgeProjectorService` to `ViewController`: when a plan/section/elevation/RCP view is activated with loaded IFC models, `EdgeProjectorService.project(viewDef)` is called
- `TechnicalDrawing` stored in `ViewTechnicalDrawingCache`
- VG applied to projection layers via new `VGSceneApplicator.applyToProjectionLayers()`
- Hidden lines: separate `projection-hidden` layer with dashed material (VG-controlled)

**Milestone 1.3 — Native element bridge (4 weeks)**
- Create `NativeElementMeshExporter.ts`
- Wire to `EdgeProjectorService.project()`: native meshes projected alongside IFC models
- Validate plan view parity: EdgeProjector output vs. existing PlanSymbolCache output — both active for A/B comparison
- `PlanSymbolCache` kept; both systems active (feature flag: `PRYZM_EDGE_PROJECTOR_NATIVE=true`)

**Milestone 1.4 — Section, elevation, RCP views (2 weeks)**
- `SectionViewService` enhanced: after clip plane setup, calls `EdgeProjectorService.project(viewDef)` with section direction and near clip at cut plane
- Elevation views: `ViewController` reads `ViewDefinition.spatial.projectionDirection`; `EdgeProjectorService` uses it; no new service needed
- RCP: `ceiling-plan` ViewType → EdgeProjectorService direction `(0,+1,0)`

**Milestone 1.5 — Multi-viewport sheet composition (2 weeks)**
- Create `ViewportThumbnailRenderer.ts`: per-viewport camera, renders `TechnicalDrawing` to thumbnail bitmap
- `SheetEditorPanel` viewport preview updated to use `ViewportThumbnailRenderer`
- Multi-viewport rendering: all 4 viewports rendered independently from `ViewTechnicalDrawingCache`

**Milestone 1.6 — Detail view (2 weeks)**
- Add `cropRegion` to `ViewDefinition.spatial`
- Create `CreateDetailViewCommand.ts`: creates a `detail` ViewDefinition with `parentViewId` and a user-defined crop region
- `EdgeProjectorService` applies crop region as `DrawingViewport` bounds
- `DetailViewTool.ts`: user clicks two points in host view to define the crop region

**New files**: `EdgeProjectorService.ts`, `ViewDependencyTracker.ts`, `ViewTechnicalDrawingCache.ts`, `ViewportThumbnailRenderer.ts`, `NativeElementMeshExporter.ts`, `CreateDetailViewCommand.ts`, `DetailViewTool.ts`

**Packages**: `@thatopen/components` 3.4.0, `@thatopen/components-front`, `web-ifc` 0.0.77

---

### Phase 2: Full Annotation Coverage (12–16 weeks)

**Goal**: All Revit-grade annotation types available in the interactive viewport. OBC adapter wired. `PlanSymbolCache` deprecated.

**Milestone 2.1 — OBC DrawingEditor + adapter (2 weeks)**
- Create `OBCAnnotationAdapter.ts`
- Integrate `DrawingEditor` from `@thatopen/components-front` as the annotation interaction layer for OBC-backed types
- Adapter wires `onCommit` → `CreateAnnotationCommand` for all OBC annotation systems
- Adapter wires `onDelete` → `DeleteAnnotationCommand`
- Deprecate and remove `PlanSymbolGenerator` + `PlanSymbolCache` — EdgeProjector output now canonical for all element geometry in 2D views

**Milestone 2.2 — Missing dimension types (2 weeks)**
- `radius-dim`: AnnotationType + `RadiusDimensionTool` + Canvas 2D arc render
- `diameter-dim`: AnnotationType + tool + two-point chord + ⌀ symbol
- `slope-dim`: AnnotationType + OBC `SlopeAnnotations` adapter + Canvas 2D render

**Milestone 2.3 — Specialised tags (3 weeks)**
- `door-tag`, `window-tag`: dedicated bubble symbols, IFC property expressions
- `level-tag`: reads `bimManager.getLevels()`, triangle head + elevation value
- `grid-bubble`: reads `gridStore`, circle + alphanumeric, auto-placed at view extents
- `spot-elevation` DXF bridge added

**Milestone 2.4 — View reference symbols (4 weeks)**
- `section-mark`: auto-created by `CreateSectionMarkCommand`; `ViewLinkResolver` for dynamic sheet+detail number
- `elevation-mark`: `CreateElevationMarkCommand`, up to 4 directional fills, linked elevation views
- `callout-detail`: OBC `CalloutAnnotations` interaction + adapter; links to `detail` ViewDefinition via `parentViewId`
- `CreateSectionMarkCommand`, `CreateElevationMarkCommand`, `CreateCalloutDetailCommand` — each is atomic (creates ViewDefinition + annotation in one command)
- `ViewLinkResolver.ts` — maps view → sheet number + detail number

**Milestone 2.5 — Notation symbols (2 weeks)**
- `north-arrow`, `scale-bar`: sheet-level symbols, Canvas 2D
- `revision-cloud`: `RevisionCloudTool` + arc polygon + Canvas 2D
- `matchline`, `breakline`: Canvas 2D

---

### Phase 3: Export Pipeline (8–10 weeks)

**Goal**: Production-quality PDF and DXF export from sheets. Annotations appear in all exports.

**Milestone 3.1 — Annotation DXF bridge (3 weeks)**
- `AnnotationDxfBridge.ts`: reads `AnnotationStore` → creates ephemeral OBC annotation geometry → `DxfExporter` serialises → disposes. ISO 13567 layer naming.
- `DxfExportService.ts`: assembles all viewports from `ViewTechnicalDrawingCache`, calls bridge, calls `DxfExporter.export()`
- Custom exporters for types OBC doesn't have built-in (section-mark, level-tag, etc.) via `DxfExporter.registerSystemExporter()`
- Title block fields → DXF TEXT entities in `T-BLK` layer

**Milestone 3.2 — SVG composite renderer (3 weeks)**
- `SVGCompositeRenderer.ts`: `TechnicalDrawing` LineSegments → SVG `<line>` elements; `AnnotationStore` → SVG elements per type; title block → SVG `<text>`
- `SheetExportService.exportToSvg()` upgraded: calls `SVGCompositeRenderer` instead of placeholder
- North arrow, scale bar rendered as SVG symbols

**Milestone 3.3 — PDF export (2 weeks)**
- Add `jsPDF` + `svg2pdf.js`
- `SheetExportService.exportToPdf()`: `SVGCompositeRenderer` → SVG → `jsPDF` + `svg2pdf` → PDF/A-1b blob
- Multi-page PDF (one page per sheet in the project)

**Milestone 3.4 — Print quality (1 week)**
- `exportToPrint()` updated to use `SVGCompositeRenderer` output in print DOM

---

### Phase 4: Advanced VG + Performance (4–6 weeks)

- Per-instance VG overrides
- Subcategory VG controls ("Walls: Common Edges", "Doors: Panel", etc.)
- Phase visibility wired to `VGSceneApplicator`
- True line weight rendering via SVG overlay for paper-space (CSS `stroke-width` unlimited)
- `EdgeProjector` performance optimisation: spatial partitioning for large models (only project elements within view crop region)
- `AnnotationDependencyGraph` index optimisation for > 10k annotations

---

## 14. Contract Compliance Register

Every new module listed in §10.4 must satisfy the following before implementation:

| Rule | Source | Compliance Check |
|---|---|---|
| All store mutations via `CommandManager.execute()` | §01 §3 | `EdgeProjectorService`, `OBCAnnotationAdapter` dispatch commands; never mutate stores directly |
| No THREE.js class instances in stores | §01 §5 | `ViewTechnicalDrawingCache` is NOT a PRYZM store — it is a rendering cache, separate from `StoreRegistry`. `AnnotationStore` DTOs are plain objects only. |
| No `any` types | §03 §1.1 | All new AnnotationElement sub-schemas type-narrowed per discriminant |
| `BimManager` is sole level elevation authority | §02 §1.1 | `EdgeProjectorService` calls `bimManager.getLevelElevation(levelId)` at every projection; never caches |
| `ElementRegistry` for O(1) element lookup | §02 §2.5 | `NativeElementMeshExporter` uses `elementRegistry.getRoot(id)` |
| No tool writes to stores or registry | §02 §6.1 | `DetailViewTool`, `RevisionCloudTool` dispatch commands only |
| No orphaned geometry | §02 §4.3 | `NativeElementMeshExporter` releases mesh references after EdgeProjector resolves; `OBCAnnotationAdapter` disposes OBC THREE.js groups after commit |
| Preview isolation | §02 §6.2 | `ViewportThumbnailRenderer` temporary cameras are never added to `MultiViewCameraManager` or the interactive scene |
| OBC THREE.js groups never enter PRYZM stores | §01 §5 | `OBCAnnotationAdapter` extracts plain data only; groups disposed on commit |
| `StoreEventBus` for all element change notification | §01 §7 | `ViewDependencyTracker` subscribes to `StoreEventBus`; does not poll |
| Serialisable element schemas | §03 §1.1 | All new `AnnotationType` DTOs contain only `number`, `string`, `boolean`, `null`, plain arrays/objects |

---

*End of document. No source files were modified in producing this study.*
