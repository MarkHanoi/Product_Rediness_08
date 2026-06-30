# ADR-0081 — Circle boundary-draw tool (centre + radius → closed N-gon)

- Status: Accepted
- Date: 2026-06-30
- Tags: §CIRCLE-BOUNDARY, geospatial, boundary-draw, site
- Supersedes / relates to: §RECT-BOUNDARY, §BND-MODE-STRIP (the boundary-draw mode strip),
  ADR-059 (site-plan overlay), C19 (site substrate / parcel boundary)

## Context

The 2D site-boundary draw surface (`apps/editor/src/ui/geospatial/SiteBoundaryMap2D.ts`)
is the founder's primary tool for authoring a parcel boundary. It already offered four
draw modes via the `§BND-MODE-STRIP` pill toolbar: **Rectangle** (two-corner,
`§RECT-BOUNDARY`), **Linear** (free polyline), **Orthogonal** (90°-locked polyline,
`A.21.D60`), and **Curved** (graceful straight-segment fallback — no curve geometry yet).

A new office-tower typology (and circular footprints generally) needs a **Circle** tool.
The downstream C19 `ParcelBoundary` is a straight-edged XZ polygon — there is no arc/curve
primitive in the boundary pipeline, and every consumer (setback checks, stair carve, the
apartment/building generators) expects a vertex ring.

## Decision

Add a fifth boundary-draw mode, **Circle** (`§CIRCLE-BOUNDARY`), as a two-point tool:

1. **Click 1 = centre.** Click 2 = a point on the circumference; radius = the projected
   metric distance centre→cursor. The second click commits immediately (same UX shape as
   Rectangle — no double-click / Enter to close).
2. **Live radius readout** — a violet chip at the circumference point under the cursor,
   formatted `R 12.5 m`, mirroring the line tool's edge-length labels.
3. **Snapping** — reuses the existing building corner/edge snap (`resolveSnap`) for the
   centre and circumference points, and snaps the radius to the nearest **0.5 m** round
   value when within tolerance (`snapRadiusToRound`). The relative-right-angle (ortho)
   snap is correctly excluded (a circle is radial, not rectilinear).
4. **Output is a closed regular N-gon polygon** (default **64 segments**) emitted into the
   SAME `vertices` array the rectangle uses, flowing through the SAME commit path
   (`buildBoundaryFromLatLonRing → dispatchParcelBoundary → site.setParcelBoundary`). No
   new geometry type, no new commit branch.

### Why an N-gon, not a true curve

A 64-gon is visually indistinguishable from a circle at parcel scale (max chord sagitta
error < 0.13 % of the radius; area ≥ 99.8 % of πr²) and requires **zero** changes to the
boundary contract or any downstream consumer. The segment count is a parameter
(`DEFAULT_CIRCLE_SEGMENTS = 64`) so fidelity vs vertex-count is tunable.

### Why projection-aware radius (metres, not degrees)

`latLonToSceneXZ` is a per-axis affine map with a `cos(lat0)` longitude stretch. To make
the **projected XZ shape a true circle** (not a longitude-stretched ellipse), the
circumference is sampled in metric angle θ — `dx = r·cos θ`, `dz = r·sin θ` — and each
metric offset is inverted per axis back to lat/lon. CCW winding (positive XZ signed area)
matches the rectangle emitter, so `classifyEdges` sees a consistent outward normal.

## Consequences

- New PURE module `apps/editor/src/ui/geospatial/circleBoundary.ts` (no DOM / maplibre /
  THREE), unit-tested in `apps/editor/__tests__/circleBoundary.test.ts` — mirrors the
  `§RECT-BOUNDARY` `rectBoundary.ts` + test precedent exactly (pure geometry helpers in
  this directory are not OTel-handler functions and carry no span, consistent with
  `rectBoundary.ts` / `orthoSnap.ts`; the GA OTel gate is scoped to `plugins/*/src/handlers/`).
- `SiteBoundaryMap2D.ts` gains a fifth pill (`I Circle` — `C` is taken by Curved), the
  `circle` internal draw mode, a circle-centre state + live rubber-band preview, and a
  pooled radius-readout marker. Per-edge dimension labels are suppressed in circle mode
  (64 chord chips would be noise); the radius chip is the circle's sole readout.
- Preview stroke stays PRYZM violet `#6600FF` (vertex handles) over the Forma green
  boundary line — the existing render path; brand-compliant, no black.

## Stretch / not-done (clean seams left)

- **Ellipse** (centre + two radii) and **Arc/fillet on an existing boundary corner** were
  scoped as stretch and are **not** built. They would plug in as additional pill modes that
  emit N-gon vertices through the SAME `setX...Vertices → refreshRing → commit` seam the
  circle uses. The pure-emitter pattern (`circleBoundary.ts`) is the template: add an
  `ellipseCornersFromCentreRadii(...)` / `arcCornersOnCorner(...)` pure module + a draw-mode
  branch in `onClick` / `onMouseMove`. No downstream contract change is needed (still a
  vertex ring).
