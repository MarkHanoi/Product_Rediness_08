# SPEC — Wall as a Single Boolean-Void Solid (no abutting segments)

> **Status**: PLAN / proposed spec — promote the normative parts into **C15 §3
> (Hosted-Element void geometry)** when implemented. **Created**: 2026-05-22.
> **Trigger**: architect (high importance) — "creating an opening splits the wall
> into ~3 box volumes joined together; you see the division lines in 3D and very
> clearly in IFC export. It must be a single volume. Analyse, review, document
> contractually, and implement if feasible — carefully, no shortcuts."
> **Governs**: `packages/geometry-wall/` (WallFragmentBuilder, LayeredWallOpeningBuilder),
> `packages/geometry-kernel/` (CSG), `plugins/ifc-export/`.
> **Contract alignment**: C11 (element-creation pipeline), C15 (hosted elements /
> void lifecycle), C05 §4 (IFC export scope — this spec extends it).

## 1. Problem (AS-IS)

A wall with an opening is **not** one solid. Two code paths produce abutting pieces:

- **Layered walls** — `LayeredWallOpeningBuilder.buildContinuousLayerGeometry()`
  discretises the wall into a grid and emits per-cell quads, skipping opening
  cells. Result: a single BufferGeometry **with interior edges** at the
  solid/void boundaries (the visible "division lines").
- **Plain walls** — `WallFragmentBuilder` (~lines 1437-1600) emits **separate
  `THREE.Mesh` segments** (before-opening, lintel, sill, after-opening), each its
  own box. Coplanar shared faces → visible seams + z-fighting.
- **IFC export** — `plugins/ifc-export/src/exporters/wall.ts` exports a single
  `IfcWallStandardCase` swept-solid box that **ignores `wall.openings` entirely**;
  doors/windows are separate `IfcDoor`/`IfcWindow` entities with **no**
  `IfcOpeningElement` / `IfcRelVoidsElement` / `IfcRelFillsElement`. So a
  receiving BIM tool sees a solid wall with detached fixtures — the opposite of
  the IFC convention.

## 2. Target (TO-BE) — one manifold solid with a boolean void

The BIM-correct model: **one wall solid, minus one void box per opening**, yielding
a single manifold mesh with a clean hole — and, in IFC, an `IfcOpeningElement`
subtracted via `IfcRelVoidsElement`, with the door/window filling it via
`IfcRelFillsElement`.

### §2.1 Geometry (NORMATIVE)

- A wall body MUST be built as **one solid** (the full extruded profile), then have
  each opening **subtracted** as a box: `produceBoolean('subtract', wallSolid, openingBox)`.
- The result MUST be a **single** BufferGeometry/descriptor with **no interior
  seam edges** across the lintel/sill/jambs — i.e. no abutting coplanar faces.
- The CSG engine is `KernelCSG` (manifold-3d, THREE-free) via `produceBoolean`,
  now exported from the kernel public surface (#96 phase 1, 2026-05-22).
- **Async caveat (critical):** `KernelCSG.create()` / `produceBoolean` are
  **async** (lazy WASM load). The wall build pipeline MUST integrate this on its
  async path — the boolean cannot be done in a synchronous builder tick. Options:
  (a) make the affected builder step async; (b) precompute the booled descriptor
  in the command/handler (async) and hand the finished descriptor to the
  synchronous mesh step. **(b) is preferred** — keeps the render tick sync.
- Layered walls: subtract the opening from **each layer solid** independently so
  per-layer materials/poché survive, then the per-layer results are the single
  solids (no grid seams).

### §2.2 IFC export (NORMATIVE — extends C05 §4)

- For each `wall.openings[]` entry, the exporter MUST emit an `IfcOpeningElement`
  and relate it to the wall via `IfcRelVoidsElement`.
- The hosting door/window MUST be related to its opening via `IfcRelFillsElement`.
- The wall body representation stays a single swept solid; the void is expressed
  relationally (the IFC-idiomatic way), NOT by pre-subtracting the mesh.

## 3. Phased plan

1. **Done (2026-05-22)** — export kernel CSG (`KernelCSG`, `produceBoolean`,
   boolean types) from `geometry-kernel/src/index.ts`.
2. **Geometry core** — add a pure kernel helper `produceWallWithVoids(wallSolid,
   openingBoxes)` (thin wrapper over `produceBoolean` looping the openings) +
   unit tests (manifold count == 1, genus matches opening count, watertight).
3. **Builder integration** — route `WallFragmentBuilder` / `LayeredWallOpeningBuilder`
   through the booled descriptor on the async path (§2.1 option b). Feature-flag
   it first (`__wallSingleVolume`) so the segmented path remains a fallback until
   verified, then flip the default.
4. **IFC** — `IfcOpeningElement` + `IfcRelVoidsElement` + `IfcRelFillsElement` in
   `plugins/ifc-export`.
5. **Promote** §2.1/§2.2 into C15 §3 as the canonical void-geometry contract.

## 4. Risks & mitigations

- **Manifold robustness** — degenerate/zero-width openings or openings flush with
  the wall end can yield non-manifold input. Mitigation: clamp opening boxes to a
  min size and inset slightly past the wall faces so the cut is clean; validate
  the result (`numVerts>0`, single manifold) and **fall back to the segmented
  path** on CSG failure (never ship an empty wall).
- **Async in the build tick** — see §2.1; precompute off the render tick.
- **Performance** — booleans are heavier than box emission; cache the booled
  descriptor by `composeWallGeometryHash + openings hash` (the kernel already has
  `composeBooleanHash`) so unchanged walls don't re-cut.
- **Material/poché per layer** — subtract per layer (§2.1) to preserve them.

## 5. Verification gate

```
1. Create a wall, add a door. MUST: in 3D, no division lines across lintel/sill;
   the wall reads as one volume. Orbit close — no z-fighting seams.
2. Export IFC, re-open in a viewer (or inspect): the wall is one solid with an
   IfcOpeningElement void; the door fills it (IfcRelFillsElement). No separate
   abutting wall solids.
3. Move/resize the opening → the single volume re-cuts correctly; undo restores.
4. CSG failure (forced) → falls back to the segmented mesh, never an empty wall.
```
