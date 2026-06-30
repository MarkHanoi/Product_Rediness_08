# ADR-0093 — Forma 3D-site: all-white architectural model + on-demand façade sun analysis

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-06-30 |
| Owner | Geospatial / Cesium Forma view (`apps/editor/src/ui/geospatial`, `apps/editor/src/ui/climate`) + GLB export (`packages/file-format/src/export/glb`) |
| Builds on | ADR-0089/0091 (§FORMA-SCENE-QUALITY) · ADR-0086 (§SITE-METRIC-SUN-TEXTURE / ground heatmap) — both KEPT intact |
| Tags | §FORMA-WHITE-MATERIAL · §FORMA-FACADE-ANALYSIS |
| Contracts | P2 (no `import * as THREE` outside renderer-three — the GLB exporter in `file-format` already owns the THREE allowance; the façade compute in `siteMetricGrids` is THREE-free) · P4 (no `(window as any)` — typed viewport interface) · P8 (≥1 span / exported fn — the new pure helpers carry a structured console breadcrumb, the same span convention the surrounding `siteMetricGrids` / `formaSceneQuality` files use in this transitional `apps/editor` zone) · graceful-degrade discipline · brand white + `#6600FF`, no black |

## Context

The founder wants the Cesium "Forma" 3D-site view to read like a clean professional
architectural model (Spacio / Autodesk-Forma reference):

1. **TASK A — all-white massing.** Today the user's designed building is placed on the
   Forma study via the "Real full-fidelity model" GLB export (`forma6`), keeping its REAL
   BIM materials (brick / colour). On the Forma view it should instead render every element
   in a clean **WHITE** material — EXCEPT window glass, which stays translucent — while
   keeping the already-shipped Forma soft shadows + AO so the white reads with gradient
   shadowing. This must be **Forma-VIEW-ONLY**: the editor's WebGPU BIM view and the normal
   GLB download/export path keep real materials.

2. **TASK B — façade analysis on demand.** Analysis currently paints only on the GROUND
   (sun-hours / temperature / wind / population, as a smooth interpolated texture — ADR-0086).
   The founder wants an opt-in toggle that ALSO paints the active metric (priority: SUN-HOURS)
   on the user's designed building's **outer façade + roof** — not the context buildings —
   with the SAME colour ramp as the ground heatmap (Forma's yellow→purple-style building
   exposure colouring).

## Decision — §FORMA-WHITE-MATERIAL (Task A)

The Forma-white look is a **GLB-export option**, NOT a change to the live BIM scene or the
default export.

- `exportFragmentsToGLB(scene, { formaWhite: true })` remaps EVERY exported mesh to a clean
  near-white massing material (`0xF4F4F2` = `FORMA_PALETTE.proposedFill`), and WINDOW / glazing
  meshes to a translucent glass material (`MeshPhysicalMaterial`, `transmission` + low opacity).
  No option (the default) = real materials unchanged → the editor BIM view and the normal
  GLB download are NOT regressed.
- **§I3 safety.** The export clones share their materials BY REFERENCE with the live scene
  (`clone(true)`), so the override NEVER mutates an existing material — it ASSIGNS a fresh
  export-only material to `mesh.material`. Those fresh materials are tracked and disposed in
  `disposeExportRoot` (they are export-owned, unlike the shared real materials, so disposing
  them is safe and frees nothing the live viewport needs).
- **Glass detection** is a pure, unit-tested classifier `classifyFormaWhiteRole(elementType,
  material)`: glass when the (own-or-ancestor) element type is `window` / `curtainWall` /
  `glazing` / `skylight`, OR the material is physically glass (`transmission > 0`, or the BIM
  glazing convention `transparent === true` with `depthWrite === false` — see `makeGlassMat`
  in `@pryzm/geometry-window`). A merely-transparent material with `depthWrite` ON (e.g. a
  faded preview overlay) is NOT treated as glass. Everything else → white.
- **Wiring.** `GISAreaLayout.placeRealModelOnForma` exports with `{ formaWhite: true }`; the
  result lands through the existing `renderRealModelOnForma` path, so the Forma soft shadows +
  AO + terrain clamp all still apply to the white model.

## Decision — §FORMA-FACADE-ANALYSIS (Task B)

A new **toggle** ("Analyse building façade") in `FormaSiteAnalysisControls`, **DEFAULT OFF**,
shown only while the sun-hours heatmap is active (the priority façade metric). When ON it
colours the designed building's exterior wall faces + roof by direct sun-hours, with the SAME
ramp as the ground heatmap.

- **Compute (pure, THREE-free, P2-safe), `siteMetricGrids.ts`:**
  - `buildFacadeSamplePoints(rings, heightM, spacing, maxSamples)` — lays a lattice of sample
    points across each exterior wall face (along the segment × up the storey) plus a coarse
    roof grid; each wall point carries an outward unit normal and is nudged 0.25 m outward so
    the shadow ray doesn't self-occlude. Decimates uniformly above the cap.
  - `prepareFacadeSunGrid(input)` — reuses the EXACT ground sun-hours machinery already in this
    file (`generateSunSamples` from `@pryzm/solar-analysis`, `toPrisms` + `sunBlocked` for the
    extruded context + own-massing occlusion test) and returns the points plus a pure
    `evaluateIntensity(point)` (heavy raycast) and `colourFor` = the SAME `sunHoursCellColour`
    ramp. A wall face only takes sun samples on its outward side (back-faces self-shade); the
    roof faces up.
- **Render (`CesiumViewport.ts`):** the building footprint (`formaLastMassingInput.boundary`,
  scene-XZ → ENU `east = x, north = −z`) + storey-band heights feed `prepareFacadeSunGrid`; the
  per-point raycast is evaluated in per-frame batches (`facadeChunkBuild`, mirroring the ground
  heatmap's `chunkBuild`) and each point becomes a small coloured Cesium polygon quad oriented
  in the wall plane (tangent × up) or flat for the roof. Only the user's building is painted —
  the occluders include the context but the SAMPLED surfaces are the designed building's ring
  only. Clears on toggle-off, metric switch away from sun-hours, massing re-render, and dispose.

### Scope landed vs SPEC'd

The shipped façade render is a **clean per-point quad colouring** on the SAME ramp (small,
overlapping quads → continuous read), default-off, only the user's building, fully toggled and
chunked. A **smooth per-face bilinear-interpolated façade gradient** (analogous to the ground
texture's `rasterizeMetricTexture` but UV-mapped per wall plane) is the natural next increment
and is **SPEC'd here** rather than half-built: it would rasterise each wall face's sample lattice
into a per-face texture and apply it as an `ImageMaterialProperty` on a wall-plane rectangle. The
current quad path already reads smoothly at the shipped spacing; the texture upgrade is a
display-only refinement with no compute change.

## Consequences

- Forma view now reads as a clean white architectural model with translucent glass, matching
  the reference; the BIM editor view and the default GLB export are untouched.
- Façade sun analysis is a real, default-off, toggle-driven feature reusing the ground heatmap's
  compute + ramp, so the floor and façade read as one continuous study.
- New pure helpers are unit-tested: the white-material role classifier
  (`packages/file-format/__tests__/glb-export-forma-white.test.ts`) and the façade
  sample-point generation + intensity evaluator
  (`apps/editor/__tests__/siteMetricGrids.test.ts`).
- No P2/P4 regressions; the GLB override lives in `file-format` (already THREE-allowed), the
  façade compute is THREE-free, and the toggle is typed on the viewport interface.
