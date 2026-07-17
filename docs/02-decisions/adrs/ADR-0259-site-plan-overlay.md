# ADR-0259 — Georeferenced site-plan overlay (PDF/image) for boundary capture

- **Status:** ACCEPTED (2026-06-26) — IMPLEMENTED first cut (upload → rasterise → place on
  the 2D site map → move/scale/rotate/opacity/lock → 2-point calibrate → per-project
  persist). Auto-boundary-detection from the plan is a documented future phase.
- **Owner:** site-first onboarding + geospatial UI
  (`apps/editor/src/ui/site/overlay/`, `apps/editor/src/ui/geospatial/SiteBoundaryMap2D.ts`,
  `apps/editor/src/ui/onboarding/OnboardingStepController.ts`).
- **Affects:** the site-first flow shared by ALL pipelines (residential house, residential
  building, apartment) — every typology consumes the same C19 parcel boundary, so a more
  accurate boundary improves every downstream generator + GIS/sun/shadow analysis.
- **References:**
  [C19-SITE-MODEL-AND-PARCEL](../contracts/C19-SITE-MODEL-AND-PARCEL.md) (§1.3 LTP-ENU origin,
  §1.4 parcel polygon is the legal lot outline this overlay helps author accurately, §5 the
  `apps/editor/src/ui/site/` authoring surface),
  [C18-ELEMENT-PREVIEW-VISUAL-CONTRACT §41](../contracts/C18-ELEMENT-PREVIEW-VISUAL-CONTRACT.md)
  (brand: white + `#6600FF`, NO pure black),
  [C12-GEOSPATIAL](../contracts/C12-GEOSPATIAL.md) (the coordinate substrate),
  [SPEC-FORMA-SITE-VIEW](../../03-execution/specs/SPEC-FORMA-SITE-VIEW.md) (the existing
  2D MapLibre draw surface this overlay renders under),
  [SPEC-45-PDF-TO-BIM-PIPELINE](../../03-execution/specs/SPEC-45-PDF-TO-BIM-PIPELINE.md)
  (the server-side auto-extraction pipeline the FUTURE auto-boundary phase aligns to).
- **Spec:** [SPEC-SITE-PLAN-OVERLAY](../../03-execution/specs/SPEC-SITE-PLAN-OVERLAY.md).

## Context

The most truthful boundary a user has is the surveyor's / architect's site plan — a CAD PDF
or a scanned survey image. PRYZM authors the C19 parcel polygon by drawing on a GIS basemap
(`SiteBoundaryMap2D`, MapLibre), but the basemap alone (satellite + OSM vector) is not always
precise enough to trace a legal lot. Letting the user lay their own plan over the map,
calibrate it to true real-world scale, and trace the boundary against **both** the plan and
the basemap yields a boundary that is both **accurate** (from the plan) and **georeferenced**
(from the basemap) — the C19 §1.4 goal.

Two forces shaped the decision:

1. **There is already a plan-import path, and it CRASHES.** The legacy floor-plan importer
   (`FloorPlanImportPanel` → `FloorPlanUnderlayTool`) rasterises a PDF/image and uploads it as
   a **THREE texture** on a plane in the BIM scene. The rasteriser capped WIDTH (1500px) but
   **not HEIGHT**, so a tall plan produced e.g. a 1500×50000px image; `loadTexture()` handed it
   straight to the GPU with **no device-limit clamp**. On the WebGPU backend that exceeds
   `maxTextureDimension2D` (typ. 8192) → **device-lost** → the app crashes a beat after the
   underlay "links" (the founder's report). This is a plan-VIEW underlay (XZ THREE plane), a
   different surface than a **site** overlay, which must sit on the **map in geographic
   coordinates**.

2. **Reuse the existing site substrate, don't reinvent.** The 2D MapLibre draw surface, the
   `boundaryProjection` local-equirectangular frame (shared with the parcel boundary), the
   `pdfjs-dist` rasteriser, and the per-project `UnderlayPersistence` localStorage pattern all
   already exist. The overlay should compose them, not fork them.

## Decision

Add a **georeferenced site-plan overlay** as a MapLibre `image` source on the existing 2D
boundary-draw map, driven by a small controller + pure geometry/calibration/persistence
helpers.

1. **Render via MapLibre `image` source, NOT a THREE texture.** MapLibre natively anchors a
   raster to four geographic corners (`{ type:'image', url, coordinates:[TL,TR,BR,BL] }`) with a
   `raster-opacity` paint. The overlay is inserted **beneath** the violet boundary-draw layers,
   so the user traces over it. Crucially MapLibre owns its own GL context and tiles the image —
   it **never touches the WebGPU device** the legacy underlay crashes on. The site overlay is
   therefore robust by construction: an oversized source can only cost MapLibre memory, never
   lose the BIM renderer's device.

2. **Pure geometry/calibration in a headless layer.** `sitePlanOverlayGeometry.ts` owns the
   transform model (centre metres E/N about the site origin, metres-per-pixel, rotation) and
   the compose → corner-lat/lon math, in the **same** local-equirectangular frame as
   `boundaryProjection` (z = −North, C19 §1.3). **2-point calibration** —
   `metresPerPixel = realDistanceM / pixelDistance` — is the accuracy key and is fully pure +
   tested, with degenerate-input guards (coincident points, non-positive distance → null →
   toast, never a 0/∞ scale).

3. **Robust rasterise with a size cap on BOTH dimensions.** `sitePlanRasterizer.ts` reuses
   `pdfjs-dist` (lazy-loaded, page-selectable) and caps **both** width and height to the
   smaller of the device max texture dimension and a conservative `SAFE_MAX_TEXTURE_DIM`
   (4096), via the pure `computeCappedSize`. Every path is guarded → a bad file throws an Error
   the controller turns into a toast.

4. **Fix the legacy crash at source too.** `PDFToImageConverter` and `ImageToImportConverter`
   now cap height as well as width; `FloorPlanUnderlayTool.loadTexture()` gained a last-line
   device-cap **downscale** (redraw oversized images onto a capped canvas → `CanvasTexture`)
   plus try/catch with dispose-on-failure; `Step3UnderlayView.handlePlaceUnderlay` guards the
   `create()` call so a decode failure degrades to a toast instead of throwing into the flow.

5. **Persist per project, separate scope.** `pryzm.sitePlanOverlay.v1.<projectId>` (mirrors the
   v2 floor-plan underlay pattern but is a distinct key — the site overlay is geographic, the
   floor-plan underlay is plan-view; keeping scopes separate preserves C13 isolation). The
   record stores the data URL, the transform, the geo-origin, opacity, lock, page, and a
   `calibrated` flag; (de)serialise is pure + round-trip tested and rejects corrupt/future
   records.

6. **Entry points.** A "📄 Overlay a plan / PDF" card in the onboarding site step + an
   on-map "📄 Overlay plan / PDF" button on the 2D draw surface. Boundary tracing reuses the
   existing draw tool unchanged.

## Alternatives considered

- **Extend the THREE `FloorPlanUnderlayTool` to the site/map.** Rejected: it is plan-view
  (XZ plane in the BIM scene), it is the surface that crashes, and putting a georeferenced
  raster on the map through THREE would require re-projecting per frame and re-introduce the
  device-texture risk. MapLibre's `image` source is the right primitive.
- **A second coordinate projector.** Rejected (SPEC-FORMA §8.3 non-goal): we reuse the
  `boundaryProjection` local-equirectangular frame so the overlay shares the parcel frame.
- **Auto-detect the boundary from the PDF now.** Deferred: the founder is unsure it is feasible
  yet; the SPEC plans it as a future phase aligned to SPEC-45 (edge-detection / vectorisation →
  a candidate boundary the user confirms). The first cut is a precise *manual* trace aid.

## Consequences

- **Positive:** accurate, georeferenced boundary capture for every typology; the link-then-crash
  bug is fixed both for the new overlay (by construction) and the legacy underlay (size caps +
  downscale guard); pure helpers are unit-tested; no schema change (P5), no new mutation path
  (P6 — the overlay is a UI render aid that feeds the EXISTING `site.setParcelBoundary` via the
  unchanged draw tool), single-THREE owner untouched (P2 — MapLibre, not THREE), no
  `(window as any)` (P4 — typed window hook).
- **Negative / follow-ups:** the overlay raster is stored as a data URL in localStorage (quota
  pressure for very large plans — mitigated by the size cap; a future phase may move it to
  project storage); calibration is 2-point (uniform scale) — a future affine/4-corner warp would
  correct a skewed scan; snapping the boundary draw to overlay corners needs vectorised plan
  features (future); auto-boundary-detection is a separate, larger phase.
