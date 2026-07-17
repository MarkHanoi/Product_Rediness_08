# ADR-0082 — Circle / Ellipse / Fillet boundary-draw tools (centre + radius → closed N-gon)

- Status: Accepted
- Date: 2026-06-30
- Tags: §CIRCLE-BOUNDARY, §ELLIPSE-BOUNDARY, §FILLET-BOUNDARY, geospatial, boundary-draw, site
- Supersedes / relates to: §RECT-BOUNDARY, §BND-MODE-STRIP (the boundary-draw mode strip),
  ADR-0259 (site-plan overlay), C19 (site substrate / parcel boundary)

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

## Follow-up — Ellipse + Fillet siblings (2026-06-30, this ADR extended in place)

The two seam-marked stretch siblings were taken up. Both reuse the circle's
projection-inversion + the SAME `setX...Vertices → refreshRing → commit` seam; no
downstream contract change (still a vertex ring).

### §ELLIPSE-BOUNDARY — SHIPPED (sixth pill, `E`)

- New PURE module `apps/editor/src/ui/geospatial/ellipseBoundary.ts` mirroring
  `circleBoundary.ts`: `ellipseCornersFromCentreRadii(centre, rxMetres, ryMetres,
  segments=64)` → closed CCW 64-gon, with per-axis projection inversion so the projected
  XZ ellipse is true (semi-major `rx` along East/X, semi-minor `ry` along North/Z), NOT
  longitude-stretched. Helpers: `ellipseAxisRadiusMetres` (per-axis read-back),
  `fmtRadiiMetres` (`Rx 20.0 × Ry 12.5 m` readout), `snapRadiusToRound` (same 0.5 m snap).
- **Interaction = centre → bounding-box corner** (the ADR-marked "bounding-box ellipse"
  option): click 1 = centre; the second click's projected X offset = `rx`, Y offset = `ry`
  → immediate commit, exactly the circle's two-click shape. Live rubber-band preview +
  two-axis radii readout chip in brand `#6600FF`; per-edge dim chips suppressed (as for the
  circle); ortho snap excluded (the ellipse is box-defined). A circle is the `rx === ry`
  special case (asserted in tests).
- Unit-tested in `apps/editor/__tests__/ellipseBoundary.test.ts` (closed N-gon, area ≈
  π·rx·ry, XZ extent 2rx × 2ry, ellipse-equation membership, CCW winding, degenerate-input
  rejection, per-axis read-back, readout/snap format).

### §FILLET-BOUNDARY — pure helper SHIPPED; corner-pick UI deferred (clean seam)

- New PURE module `apps/editor/src/ui/geospatial/filletBoundary.ts`:
  `filletCornerArc(prev, corner, next, radiusMetres, segments=8)` rounds one boundary
  corner into an N-segment arc TANGENT to the two adjacent edges — computed in true metric
  XZ (project about the corner, solve, invert back to lat/lon). It CLAMPS the radius so the
  tangent never consumes more than half (`EDGE_FRACTION = 0.5`) of either adjacent edge (no
  self-intersection) and returns the clamped `radiusUsed` so the UI can show it;
  `maxFilletRadiusMetres` exposes that cap. Collinear / degenerate / non-positive input →
  empty arc (caller keeps the corner). Helpers: `fmtFilletRadiusMetres` (`Fillet 2.5 m`).
- Unit-tested in `apps/editor/__tests__/filletBoundary.test.ts` (constant-radius arc from a
  single centre, tangency to both edges, radius clamp, collinear/degenerate empties, segment
  count, max-radius scaling).
- **UI deferred (NOT half-built):** the corner-pick interaction (require/read-back a
  committed boundary → hit-test a corner → drag a fillet radius → splice the arc → re-commit)
  is a distinct interaction from the two-click draw modes and is documented as a TODO at the
  `§BND-MODE-STRIP` mode-strip definition in `SiteBoundaryMap2D.ts`. The pure engine above is
  the ready plug-in point.

### Pure-helper convention (both modules)

The pure geometry helpers in this directory carry no OTel span — consistent with
`circleBoundary.ts` / `rectBoundary.ts` / `orthoSnap.ts`; the GA OTel gate (P8) is scoped to
`plugins/*/src/handlers/`, not these pure lat/lon → vertex emitters.
