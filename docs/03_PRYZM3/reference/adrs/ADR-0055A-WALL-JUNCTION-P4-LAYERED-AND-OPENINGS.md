# ADR-0055A — P4 addendum: extending Pascal-style miters to layered walls + opening segments

- **Status:** proposed (2026-05-27)
- **Owner:** wall geometry (`@pryzm/geometry-wall`)
- **Supersedes:** ADR-0055 §P4 — splits into P4a / P4b / P4c.
- **Depends on:** [ADR-0055](ADR-0055-WALL-JUNCTION-PASCAL-STYLE.md) §P1–§P3b (shipped, default-ON 2026-05-27).

## Why an addendum

The original ADR-0055 carried P4 as a single one-line bullet ("Extend V2 to the layered + opening call sites; delete `WallJunctionInfill*` …"). Implementing it surfaced two structural blockers that need a written architectural decision before any code change. This addendum captures the analysis + the chosen algorithm so the next session resumes without re-deriving the constraints.

## Blocker 1 — `WallMiter` corners are thickness-specific

`JunctionResolverV2` produces a `WallMiter` per wall whose corner fields (`startLeft`, `startRight`, `endLeft`, `endRight`, `startPivot`, `endPivot`) are **absolute world-XZ points**, not normals. They are computed by intersecting two lines offset by `halfT = wall.thickness * 0.5` from the centerline at each junction ([`JunctionResolverV2.ts:261-266`](../../../../packages/geometry-wall/src/JunctionResolverV2.ts#L261-L266)):

```ts
const halfTc = curr.thickness * 0.5;
const halfTn = next.thickness * 0.5;
const leftAnchorCurr  = add(j.point, scale(leftPerp(curr.direction),  +halfTc));
const rightAnchorNext = add(j.point, scale(leftPerp(next.direction),  -halfTn));
const corner = intersectLines(leftAnchorCurr, curr.direction, rightAnchorNext, next.direction);
```

A layered wall has N strips stacked along the outward normal, each with its own lateral offset + thickness. The wall-level miter corner (computed against the full thickness) is **wrong** for any single layer because the layer's edge sits at a different lateral offset from the centerline. Reusing the wall-level miter for a layer produces a corner that's geometrically inconsistent with the layer's edge — visible as either an overhang or a gap in plan.

### Three candidate algorithms for P4a

| Algorithm | Layer corner correctness | Cross-wall edge-coincidence | Implementation complexity |
|---|---|---|---|
| **A. Per-layer resolver** — run `resolveJunctions` once per layer, with synthesised "layer walls" (centerline laterally offset, layer.thickness). | ✅ Each layer correct. | ⚠ Only if every wall on the junction has the **same** layer structure (same N, same per-layer offsets + thicknesses). Mixed structures → no edge-coincidence; visible gap at the layer-mismatch interface. | High — N× the resolver cost; new cache keyed on (level, layerIdx). |
| **B. Wall-envelope inset** — build the wall-level V2 polygon (full thickness), then derive each layer's polygon by inset from the envelope along the outward normal. | ✅ Each layer correct, **provided the miter line is exposed** (currently only the corner points are stored). | ❌ Cross-wall coincidence still requires the same-layer-structure precondition; the envelope inset doesn't fix mismatched layer stacks. | Medium — needs `WallMiter` extended with the miter line direction (a normal Pt2) at each junction end. |
| **C. Layer-mask carve** — render one wall-level prism (using V2 envelope, full thickness) AND a separate per-layer-coloured material assignment via `geometry.groups`. No per-layer junction maths. | ✅ Wall envelope is correct at junctions; layer separations appear only on the wall faces (not at junctions). | ✅ By construction (one envelope). | Low — touches the renderer (material group assignment) not the geometry; visual interpretation matches what most architectural plan tools do. |

**Algorithm C is the recommended path.** Rationale: layered walls visualise as stacked rectangles **on the face of the wall**, not as physically separate solids that need independent miters at junctions. The wedge defect is purely a **junction** problem; rendering one envelope prism with per-layer material groups closes the wedge by construction without per-layer miter complexity. Layer stripes remain visible on the wall faces (top, side, end) via `geometry.groups`. Plan-view edge projector continues to use the envelope polygon as the wall outline (already its current behaviour for P3b).

Side benefits of C:
- One mesh per wall (already the V2 contract).
- No per-layer cache invalidation pressure.
- Works **regardless** of whether neighbour walls have matching layer structures.

The cost is a slightly less "physically accurate" 3D representation (layers are visualised as material stripes, not separate solids). PRYZM does not currently use layer geometry for IFC export of layered material composition — that's stamped from `wall.layers` directly, not derived from the mesh.

## Blocker 2 — walls with openings split into BoxGeometry segments

`WallFragmentBuilder` (plain-wall path, `[1483-1700+]`) and `LayeredWallOpeningBuilder` split the wall into BoxGeometry segments around opening clusters. Each segment is a perpendicular-capped box — even the segments that ABUT a junction. The Pascal property is lost at the junction-abutting segments.

### Algorithm for P4b — junction-abutting segment carve

Pre-conditions: the WallMiter for the wall is available + the wall has ≥1 opening on the side facing a junction.

For each wall:
1. Compute the wall-envelope V2 polygon (P3b path — already cached).
2. Cluster openings (existing helper `clusterOpenings`).
3. For each opening cluster, compute the segment intervals along the wall's length:
   - `[0, leftEdge_0]`, `[rightEdge_i, leftEdge_{i+1}]`, ..., `[rightEdge_N, wallLength]`.
4. For each segment interval:
   - **If the segment touches a junction end** (interval starts at 0 OR ends at `wallLength` AND that end has a miter), build a V2-style polygon for the segment by intersecting the envelope polygon with the segment's vertical-slice plane. The result is a 4–6-vertex polygon that retains the wall's miter on the junction-facing side and gets a perpendicular cap on the opening-facing side.
   - **Else** (internal segment between two openings), use the existing BoxGeometry path (no junction = no wedge possible).
5. Extrude each segment polygon via `WallPolygonExtruder` (P3a).
6. Door/window frames build unchanged (they read wall thickness + offset, not segment geometry).

The polygon-vs-vertical-plane intersection is a 2-D operation on the wall's footprint polygon: walk the polygon edges, find the two intersections with the slice line `x = segmentStart` and `x = segmentEnd` (in wall-local frame), and emit the slice polygon. Pure 2-D, no CSG library needed.

## Algorithms summary

- **P4a (layered, no openings)** → **Algorithm C: wall-envelope prism with per-layer material groups.** Single mesh, single junction-aware envelope, layer stripes via `geometry.groups`.
- **P4b (walls with openings)** → **Algorithm "junction-abutting segment carve":** polygon-vs-vertical-plane intersection for segments that abut a junction; existing BoxGeometry for internal segments.
- **P4c (retire infill)** → delete `WallJunctionInfill*` + the `polygonOffset` patch once P4a + P4b ship and the wedge no longer appears in any junction visualisation.

## Blocker 3 — V2 ↔ legacy corner conventions are MATHEMATICALLY INCOMPATIBLE (2026-05-27)

Surfaced live by architect screenshot 3 (L-junction between V2 interior partition + legacy perimeter wall with windows). Independent paired audit confirmed:

**Pure V2 + V2 junction:** walls OVERLAP at a triangle. For two perpendicular 0.1 m walls meeting at world (5, 0, 0), each wall's polygon includes the THREE points {outside-L (4.95, −0.05), pivot (5, 0), inside-L (5.05, +0.05)}. Both walls cover the corner area; edge-coincident by construction.

**Pure legacy + legacy junction:** walls SHARE AN EDGE — the 45° bisector miter cut from (5.05, −0.05) to (4.95, +0.05) (line `z = 5 − x`). Each wall projects its outer-face corner onto this miter plane via `outward · dir = 0` plane. Edge-coincident by construction.

**Mixed V2 + legacy junction:** the two conventions resolve the outer corner on **OPPOSITE 45° lines** through the junction:

| Convention | Outer-L corner | Inner-L corner | Miter line slope through (5,0) |
|---|---|---|---|
| V2 | (4.95, −0.05) | (5.05, +0.05) | +1 (NE–SW) |
| Legacy | (4.95, +0.05) | (5.05, −0.05) | −1 (NW–SE) |

The two conventions are MIRROR IMAGES across the wall axis. A V2 wall's "outside-L beak" pokes to (4.95, −0.05); the legacy wall at the same junction stops at (4.95, +0.05). The unfilled `halfT × halfT` square between them renders as a dark wedge (screenshot 3).

This is **not** fixable by tuning thresholds, snap epsilons, or the cache phase — it's a structural choice. The two conventions cannot share a junction without a wedge in the general 90° case.

### Implication for P4b

P4b's "polygon-vs-vertical-plane carve for opening-bearing walls" must produce **V2-convention corners**, not legacy bisector corners. Otherwise the carved segment-end polygon won't share corners with the V2 wall on the other side of the junction. Concretely: when slicing a wall-with-openings into segments, the segment that abuts a junction inherits the wall's V2 polygon corners at that end (sLDefault/sR overrides with miter.startLeft/startRight + startPivot), and the slice at the opening edge gets a perpendicular cap.

### Interim mitigation (NOT shipped — recorded here for the next session)

Two pragmatic interim options, both with caveats:

(a) **Per-junction V2 disable** — in `WallRebuildCoordinator._flush`, after the V2 cache refresh, walk every junction in the resolved cluster set. If any participant has `openings.length > 0` or `layers.length > 0` or a curve, mark the junction "legacy-only" and delete the V2 miter corners for ALL its participants (so all walls at that junction take legacy). PROBLEM: the deleted V2 corners would also remove V2 from walls at the same junction that have a different junction at their other end with another V2-only wall — cascade. Needs per-end (not per-wall) state.

(b) **Hybrid wall polygon** — extend `WallFootprint2D` to mix V2 corners (3-vert bevel) on one end and legacy miter-cut corners (2-vert bevel) on the other. Requires the legacy miter normal to be available at footprint-build time + a new branch in the polygon assembler. The right architectural answer; estimated at the same complexity as P4b proper.

Until either lands, the screenshot-3 wedge remains in mixed L-junctions. The Issue-A height-match fix (interior partition height = max perimeter wall height) may reduce its visibility by eliminating the secondary "exposed strip above shorter wall" artefact, but the corner-geometry wedge itself is still there.

## Test plan

### P4a
- **Existing layered wall test fixtures** continue to render correctly (visual diff = layer stripes still visible on faces).
- **New unit test** — wall envelope geometry's `geometry.groups` matches `wall.layers.length`; each group's material index is the layer index; no triangle straddles two groups.
- **New visual test** — L/T/X junction with mismatched layer structures: wedge closed (V2), layer stripes consistent within each wall (per-wall material groups).

### P4b
- **New unit test** — `sliceWallPolygon(polygon, [start, end]) → polygon` for axis-aligned slices on free walls (no junction) reproduces the existing BoxGeometry footprint.
- **New unit test** — same on a junction-end wall produces a polygon that retains the wall's miter pivot vertex on the junction-facing side and a perpendicular cap on the opening-facing side.
- **New integration test** — wall with 1 opening at midspan + 1 junction at the end: end-segment is V2 (5/6 verts), middle-segment is box (4 verts on the cap).

### P4c
- **Manual visual test** — every junction kind (L / T / Y / X) with mixed plain/layered/with-opening walls. Wedge MUST not appear after `WallJunctionInfill*` deletion.
- **No remaining import** of `WallJunctionInfill*` in the codebase (`rg --files-with-matches WallJunctionInfill` returns empty).

## Migration

- P4a → no schema change; `wall.layers` already drives the material groups.
- P4b → no schema change; openings already carry `offset` + `width`.
- P4c → delete files; remove `import WallJunctionInfillManager` from `WallFragmentBuilder.ts` and any registration in the renderer init path.

## Decision pending

The above is the **architect's analysis**. Per C00 governance, P4a/P4b/P4c may not begin coding until this addendum is accepted (status moves to `accepted`). Until then, the shipped P3b default-ON pipeline holds the line for plain partition walls (the apartment generator's production case).

## References

- [`packages/geometry-wall/src/JunctionResolverV2.ts`](../../../../packages/geometry-wall/src/JunctionResolverV2.ts)
- [`packages/geometry-wall/src/WallFootprint2D.ts`](../../../../packages/geometry-wall/src/WallFootprint2D.ts)
- [`packages/geometry-wall/src/WallPolygonExtruder.ts`](../../../../packages/geometry-wall/src/WallPolygonExtruder.ts)
- [`packages/geometry-wall/src/WallPipelineV2.ts`](../../../../packages/geometry-wall/src/WallPipelineV2.ts)
- [`packages/geometry-wall/src/WallFragmentBuilder.ts:1483-1700`](../../../../packages/geometry-wall/src/WallFragmentBuilder.ts#L1483-L1700) — plain-wall-with-openings split.
- [`packages/geometry-wall/src/LayeredWallOpeningBuilder.ts`](../../../../packages/geometry-wall/src/LayeredWallOpeningBuilder.ts) — layered split.
- [`packages/geometry-wall/src/WallJunctionInfill.ts`](../../../../packages/geometry-wall/src/WallJunctionInfill.ts) + `WallJunctionInfillManager.ts` — slated for deletion by P4c.
