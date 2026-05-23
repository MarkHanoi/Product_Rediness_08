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
2. **Done (2026-05-23)** — pure kernel helper `produceWallWithVoids(wallSolid,
   openingBoxes, opts?)` added at `geometry-kernel/src/producers/wallVoids.ts`
   (loops `produceBoolean('subtract', …)` over the openings, carries the wall
   material, returns the solid unchanged when there are no openings, and bails on
   an emptied intermediate so the caller can fall back). Exported from the kernel
   public surface. Unit-tested in `__tests__/produceWallWithVoids.test.ts`
   (6 cases: no-op identity, single void has more faces than a box + stays within
   the wall AABB, material carried, two-openings adds geometry, deterministic
   hash, missing-wall rejection) — all green. NOT wired into the builder (phase 3).
3. **Builder integration** — route `WallFragmentBuilder` / `LayeredWallOpeningBuilder`
   through the booled descriptor on the async path (§2.1 option b). Feature-flag
   it first (`__wallSingleVolume`) so the segmented path remains a fallback until
   verified, then flip the default.

   **✅ IMPLEMENTED 2026-05-23** (type-clean end-to-end, flag-gated default-off,
   plain straight walls; needs the §5 visual + IFC verify before flipping the
   default). Files: `geometry-wall/src/descriptorToBufferGeometry.ts` (new),
   `WallFragmentBuilder.ts` (DI seam `setSingleVolumeProducer` + flag-gated async
   `_tryUpgradeWallToSingleVolume` swap with staleness guard + segment fallback),
   `apps/editor/src/engine/singleVolumeWallProducer.ts` (new, kernel-backed) +
   `initTools.ts` injection; `@pryzm/geometry-kernel` added to `apps/editor` deps.
   Enable with `window.__wallSingleVolume = true` then create/edit a wall with an
   opening. Layered/curved walls + IFC voids (phase 4) remain follow-ups.

   **Validated implementation plan (2026-05-23 analysis — as built):**
   - **Dependency seam (do NOT add `@pryzm/geometry-kernel` to `geometry-wall`).**
     `geometry-wall` depends only on `@pryzm/renderer-three` (THREE), and
     `command-registry` has no kernel dep either. Adding one needs a `pnpm install`.
     Instead use **dependency injection**, mirroring the existing `_instanceBridge`
     pattern in `WallFragmentBuilder`: add an optional
     `_singleVolumeProducer?: (p: SingleVolumeWallParams) => Promise<BufferGeometryDescriptorLike | null>`
     with a public setter. `apps/editor` (which already composes the kernel)
     imports `produceExtrude` + `produceWallWithVoids` and injects the producer at
     boot. `geometry-wall` stays THREE-only.
   - **Local frame (verified against the segmented path).** The `wallGroup` is
     translated to `start` with NO rotation; each child mesh is individually
     rotated `rotation.y = -atan2(dir.z, dir.x)` so its local-x runs along the
     wall direction. So the single CSG mesh is built in **wall-local space**
     (x ∈ [0, length] along the wall, y ∈ [baseOffset, baseOffset+height],
     z ∈ [−thickness/2, +thickness/2]) and placed at the group origin with
     `rotation.y = −angle`, `position = (0,0,0)`.
   - **Descriptor assembly (in the injected producer).**
     wall solid = `produceExtrude([{x:0,z:−t/2},{x:L,z:−t/2},{x:L,z:t/2},{x:0,z:t/2}],
     height, { worldY: baseOffset })`; per opening (SPEC §4 — inset past faces)
     box = `produceExtrude([offset−w/2 … offset+w/2] × [−t/2−ε … t/2+ε], op.height,
     { worldY: op.sillHeight − ε })`; then `produceWallWithVoids(solid, boxes)`.
   - **descriptor → THREE.** ✅ **Shipped 2026-05-23** —
     `packages/geometry-wall/src/descriptorToBufferGeometry.ts`
     (`descriptorToBufferGeometry(descriptorLike) → THREE.BufferGeometry | null`).
     Structural input type (no `@pryzm/geometry-kernel` dep added); returns null
     on an empty descriptor so the caller falls back to segments. Type-clean.
   - **Wiring in `buildWall` plain-opening branch (~line 1437).** Build the
     segments synchronously as today (immediate render + fallback). If
     `window.__wallSingleVolume` AND `_singleVolumeProducer` AND not curved/layered:
     call the producer async; on resolve, **with a staleness guard** (verify the
     `wallGroup` is still attached / still the current group for `wall.id` via
     `wallToFragmentsMap`), remove the segment meshes + add the single CSG mesh
     (one fragment id, registered like a wall body). On producer failure → keep
     segments (never an empty wall).
   - **Scope first cut to plain straight walls.** Layered (`LayeredWallOpeningBuilder`,
     per-layer subtract) + curved are a follow-up; they keep the segmented path.
   - **Verify (SPEC §5) before flipping the default** — visual (no seams) + IFC.
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
