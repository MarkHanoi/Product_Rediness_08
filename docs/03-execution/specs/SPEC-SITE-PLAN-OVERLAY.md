# SPEC — Site-plan overlay (georeferenced PDF/image boundary-capture aid)

| Field | Value |
|---|---|
| Status | Active — normative (first cut implemented; automation phase planned) |
| Version | 1.0 |
| Date | 2026-06-26 |
| Owner | Site-first onboarding + geospatial UI |
| ADR | [ADR-0259](../../02-decisions/adrs/ADR-0259-site-plan-overlay.md) |
| Contracts | [C19](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md), [C12](../../02-decisions/contracts/C12-GEOSPATIAL.md), [C18 §41](../../02-decisions/contracts/C18-ELEMENT-PREVIEW-VISUAL-CONTRACT.md) |
| Companion SPECs | [SPEC-FORMA-SITE-VIEW](./SPEC-FORMA-SITE-VIEW.md) (the 2D draw surface), [SPEC-45-PDF-TO-BIM-PIPELINE](./SPEC-45-PDF-TO-BIM-PIPELINE.md) (the future auto-extraction phase) |
| Module | `apps/editor/src/ui/site/overlay/` |

> Lay a client PDF / survey image over the GIS site map, scale + position + calibrate it to
> true real-world scale, and trace an accurate parcel boundary against BOTH the plan AND the
> basemap — yielding a truthful C19 boundary at the real-world location for every pipeline
> (residential house, residential building, apartment).

---

## §1 Scope

Governs the **site-level** georeferenced plan overlay shown on the 2D MapLibre boundary-draw
surface (`SiteBoundaryMap2D`) during the site-first flow. It does **not** govern the legacy
**plan-view** floor-plan underlay (`FloorPlanUnderlayTool`, a THREE plane in the BIM scene),
except that this SPEC's §7 fixes a crash shared by that path. It does **not** change polygon
drawing, the projection math, or the command bus — the overlay is a render + UI aid; the
boundary is still authored by the existing draw tool dispatching `site.setParcelBoundary`.

## §2 UX flow (the panels)

The complete process — items marked **[built]** ship in the first cut; **[spec]** are future.

1. **Entry [built].** Two entry points, both landing on the 2D draw map:
   - the onboarding **site step** card "📄 Overlay a plan / PDF" (`OnboardingStepController.renderSiteStep`);
   - an on-map **"📄 Overlay plan / PDF"** button (`SiteBoundaryMap2D`).
   Both open a file picker (PDF / PNG / JPG / WebP).
2. **PDF page pick [built].** A PDF is probed for its page count; the overlay rasterises page 1
   by default; the panel exposes **◀ page / page ▶** when the PDF has multiple pages.
3. **Rasterise [built].** The chosen page/image is rasterised to a **size-capped** PNG data URL
   (§7) — never larger than the device texture cap — and placed on the map.
4. **Placement on the map [built].** The raster is rendered as a MapLibre `image` source
   **beneath** the violet boundary-draw layers, anchored to four geographic corners. The
   **overlay panel** (top-right, white + `#6600FF`) offers:
   - **Move** — a 4-arrow pad (proportional nudge); drag on the map [spec — handle-drag].
   - **Rotate** — ⟲/⟳ 5° steps.
   - **Scale** — −/+ size (relative zoom of the overlay, centre-fixed).
   - **Opacity** — a 0–100% slider (`raster-opacity`).
   - **Lock / Unlock** — pins the overlay (disables move/scale/rotate/calibrate).
   - **Show / Hide**, **Remove plan**.
5. **2-point calibration [built] — the accuracy key (§3).**
6. **Boundary tracing [built — reuses the draw tool].** With the overlay calibrated + visible,
   the user traces the boundary with the EXISTING `SiteBoundaryMap2D` draw tool. The drawn ring
   feeds `buildBoundaryFromLatLonRing` → `dispatchParcelBoundary` → `site.setParcelBoundary`
   unchanged. **Snapping the draw to overlay corners is [spec]** — it needs vectorised plan
   features the raster does not carry yet.
7. **Persistence [built] (§5).** The overlay (source/page + transform + calibration + opacity +
   lock + visibility) persists per project and reloads with the project.

## §3 Calibration math (the accuracy key)

The user clicks **two points on the map** that correspond to two points on the plan a **known
real distance** apart (a dimensioned wall, a scale bar, a plot edge), then enters that distance
in metres. Each clicked map point is converted to the overlay's **source-pixel** space (the
inverse of the current placement transform), so the result is independent of the on-screen zoom.

```
metresPerPixel = realDistanceM / hypot(pxB.x − pxA.x, pxB.y − pxA.y)
```

`computeCalibrationScale(pixelA, pixelB, realDistanceM)` (`sitePlanOverlayGeometry.ts`) returns
that scale, or **null** (→ toast) when the two points coincide or the distance is
non-positive / non-finite — so the overlay can never collapse to 0 or explode to ∞. The scale
is applied centre-fixed (`applyCalibration`) so the plan scales about its middle. Once
calibrated, every metre on the plan is a real metre on the ground, so a traced boundary inherits
the plan's accuracy.

## §4 Coordinate model

The overlay is positioned in the **same** local-equirectangular metric frame as the parcel
boundary (`boundaryProjection`, C19 §1.3, z = −North) about the site origin (lat0, lon0):

- `centre` — metres East/North of the overlay middle from the site origin.
- `metresPerPixel` — the calibration scale (real metres per source pixel).
- `rotationRad` — clockwise rotation (North-up, East-right).

`overlayCornersEastNorth` composes these into TL,TR,BR,BL corner offsets (image-top = +North,
image-Y down), which `overlayCornerLatLons` / `toMapLibreCoordinates` unproject to the
`[[lon,lat]…]` array MapLibre's `image` source consumes. Re-anchoring on origin change
(geocode) just recomputes coordinates (`ImageSource.setCoordinates`) — no re-decode.

## §5 Persistence schema

Key `pryzm.sitePlanOverlay.v1.<projectId>` (localStorage; separate scope from the v2 floor-plan
underlay). `PersistedSitePlanOverlay`:

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | `1` | rejected if absent/different (forward-safe) |
| `fileName` | string | display |
| `sourceKind` | `'pdf' \| 'image'` | re-rasterise rule |
| `imageDataUrl` | string | the **size-capped** raster (data URL) |
| `page` | number | 1-based PDF page (1 for images) |
| `originLat` / `originLon` | number | the geo-anchor the corners were computed about |
| `transform` | `SitePlanOverlayTransform` | centre E/N, metresPerPixel, rotationRad, widthPx, heightPx |
| `opacity` | number | 0..1 (clamped on serialise) |
| `locked` / `visible` | bool | pin / visibility |
| `calibrated` | bool | whether 2-point calibration was run |
| `savedAt` | ISO string | |

`serializeOverlay` / `deserializeOverlay` are **pure** (no localStorage import) and round-trip
tested; `deserializeOverlay` returns null on corrupt JSON, wrong version, missing image, or an
invalid transform (non-positive scale, missing centre) so a bad record degrades to "no overlay".
The thin `read/write/clearPersistedOverlay` wrappers are guarded (quota / private mode → false).

## §6 Render path — why MapLibre `image`, not THREE

The overlay is a MapLibre `image` source + `raster` layer (`SitePlanOverlayLayer.ts`) inserted
beneath `pryzm-boundary-fill`. MapLibre owns its own GL context and tiles the raster — it
**never touches the WebGPU device** the BIM renderer uses, so an oversized source can only cost
MapLibre memory, never lose the BIM device. Move/scale/rotate call `setCoordinates`; page-swap
calls `updateImage`; opacity is a paint property; all calls are guarded against a disposed map.

## §7 Robust raster handling — the link-then-crash fix

**Root cause (file:line).** `PDFToImageConverter.ts` capped width (`MAX_WIDTH_PX = 1500`) but
**not height** (the `renderScale` at the old line ~140 used only `MAX_WIDTH_PX / viewport.width`),
so a tall plan rendered to e.g. 1500×50000px. `FloorPlanUnderlayTool.loadTexture()` (old
line ~371) handed that straight to `THREE.TextureLoader` with **no device-limit clamp**; on the
WebGPU backend the next render exceeds `maxTextureDimension2D` (typ. 8192) → device-lost →
crash a beat after the underlay "links".

**Fixes (this SPEC):**

- **§7.1** `computeCappedSize` (`rasterSizeCap.ts`, pure + tested) caps **both** dimensions to
  `min(SAFE_MAX_TEXTURE_DIM=4096, deviceMaxDim)`, aspect-preserving; degenerate input → 1×1.
- **§7.2** `sitePlanRasterizer.ts` (the new overlay) renders PDFs / images through that cap from
  the start, reads the device cap via a throwaway WebGL `MAX_TEXTURE_SIZE` probe
  (`deviceTextureLimit.ts`, P2-safe — raw WebGL, no THREE), and guards every path (bad file →
  thrown Error → toast).
- **§7.3** The **legacy** converters now cap height too (`MAX_HEIGHT_PX = 4096` in both
  `PDFToImageConverter` and `ImageToImportConverter`).
- **§7.4** `FloorPlanUnderlayTool.loadTexture()` gained a last-line **downscale guard**: any
  image whose larger dimension exceeds 4096 is redrawn onto a capped canvas → `CanvasTexture`,
  with try/catch + dispose-on-failure. `Step3UnderlayView.handlePlaceUnderlay` wraps `create()`
  so a decode failure degrades to a toast, never a half-built mesh.

**Invariant:** no user-supplied raster reaches the GPU above the device texture cap. The new
overlay additionally never reaches the BIM GPU at all (§6).

## §8 Future phase — auto-boundary detection (NOT in the first cut)

Deferred per the founder (feasibility unproven). Planned as a phase aligned to
[SPEC-45-PDF-TO-BIM-PIPELINE](./SPEC-45-PDF-TO-BIM-PIPELINE.md):

1. After calibration, run edge-detection / vectorisation on the plan raster (the SPEC-45
   §2.2 floor-plan segmentation + §2.3 wall vectorisation surfaces, or a lighter outline-only
   contour) to propose a **candidate** plot boundary.
2. Project the candidate through the overlay transform → lat/lon → a draft ring.
3. Present it as an editable suggestion the user **confirms** (never auto-commits) before it
   becomes the `site.setParcelBoundary` ring.

Also future: handle-drag move on the map (§2.4), 4-corner affine warp for skewed scans (vs. the
first cut's uniform 2-point scale), snap-the-draw-to-overlay-corners (§2.6), and moving the
stored raster from localStorage to project storage for very large plans.

## §9 Brand + principles

White + `#6600FF`, deep-indigo ink, **NO pure black** (C18 §41). P5 (no schema change — pure
helpers + a UI aid), P6 (no new mutation path — the boundary is still authored by the existing
draw tool's `site.setParcelBoundary`), P2 (MapLibre + raw WebGL probe, no `import * as THREE`),
P4 (typed `window.pryzmOpenSitePlanOverlay` hook, no `(window as any)`).

## §10 Acceptance

- Pure helpers unit-tested by `apps/editor/__tests__/sitePlanOverlay.test.ts`:
  - 2-point calibration scale (+ coincident-point / bad-distance guards);
  - transform compose → corners (incl. 90° rotation, translate, scale) + projection round-trip;
  - persistence (de)serialise round-trip (+ corrupt / wrong-version / missing-image / bad-
    transform rejection);
  - raster size cap (tall-source HEIGHT-fit = the crash case; wide-source; device cap;
    degenerate input).
- The overlay renders on the 2D draw map under the boundary layers, with working
  move/scale/rotate/opacity/lock and a 2-point calibration, persisting per project — browser-
  verify on `pryzm.fly.dev` (the dev server is unusable per `localhost-dev-unusable`).
