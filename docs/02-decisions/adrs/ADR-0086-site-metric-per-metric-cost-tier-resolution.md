# ADR-0084 — Site-metric grid resolution is DECOUPLED per cost tier (§SITE-METRIC-COST-TIER)

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-06-30 |
| Tag | §SITE-METRIC-COST-TIER |
| Owner | Analytics / Geospatial (Agent 5) |
| Closes | Founder: "site analysis really really slow", "Sun-hours is NOT rendering" (Temp/Wind/Daylight render fine), "Population renders but is slow" — on the deployed 240 m disc (`18013/22201 cell(s), radius 240 m`) |
| Extends / Revises | [ADR-0079](./ADR-0079-site-metric-analysis-disc-decoupled-from-camera.md) decision **#2** (uniform finer cells / per-metric caps), [ADR-0080](./ADR-0080-site-metric-daylight-vsc-ground-grid.md) (daylight VSC), §SITE-METRIC-HEATMAP |
| Constraint reference | C04 (scheduling — chunked builds), C01 P2 (no THREE outside renderer-three) |

---

## Context

ADR-0079 doubled the analysis disc to 240 m and HALVED the cell size (uniformly: sun
2.5 m, climate/pop 1.8 m), raising the per-metric caps (sun 9000, climate/pop 24000).
On the now-deployed 240 m disc the grid generates ~22k cells
(`[site-metric] population heatmap: 18013/22201 cell(s), radius 240 m`).

The defect: **the metrics do NOT cost the same per cell, but they all inherited the
same fine grid.**

- The CHEAP field metrics are an **O(1) closed-form** per cell — temperature (UHI ΔT
  built-density formula), wind (Lawson shelter proxy), population (OSM GFA proxy).
  They tolerate ~22k cells (population "renders but is slow" — the cost is the N
  Cesium entities, not the maths).
- The EXPENSIVE metrics **raycast per cell against every context prism** for many
  sky/sun directions — sun-hours (one shadow ray-march per cell × sun-sample × prism)
  and daylight VSC (per cell × az×alt sky patch × prism). On the 240 m disc the OSM
  context can be hundreds of prisms, so a fine grid is **millions of ray tests**.
  Sun-hours then takes minutes or never visibly completes — the founder's
  "Sun-hours is NOT rendering" while the cheap metrics paint fine. (Daylight VSC
  *appeared* to render only because its symptom is less obvious; it was equally
  over-gridded.)

Sun-hours was **not broken — it was drowning in cell count.**

## Decision

**Decouple the grid resolution per COST TIER, in one authoritative pure place.**

`apps/editor/src/ui/climate/siteMetricGrids.ts` now exports:

- `metricCostTier(metric)` → `'cheap' | 'expensive'` — `'expensive'` = a per-cell
  raycast/sky-sweep against the context prisms (sun-hours, daylight); `'cheap'` = an
  O(1) field (temperature, wind, population).
- `siteMetricGridBudget(metric)` → `{ cellSizeM, maxCells }` — the recommended grid
  resolution per metric:
  - **Expensive**: `cellSizeM 5 m`, `maxCells 3500` — a few thousand cells, so the
    per-cell raycast (× samples × prisms) completes **and PAINTS in a couple of
    seconds**, and far fewer Cesium entities to draw.
  - **Cheap**: `cellSizeM 2.4 m`, `maxCells 12000` — still a fine field, but a cap
    that bounds the **entity-draw count** (the "population is slow" symptom is the
    ~22k individual entities, not the trivial per-cell maths).

`CesiumViewport.renderSiteMetricOverlay` reads `siteMetricGridBudget(metric)` for the
cell size + cap of every branch instead of hard-coding `2.5 m / 9000` (sun, daylight)
and `1.8 m / 24000` (cheap). The pure `buildSiteMetricGrid` / `prepareSunHoursGrid` /
`prepareDaylightVscGrid` also default `resolveCellSize`'s cap to the metric's budget,
so the whole-grid and chunked paths agree. The chunked progressive paint + the
cell-cap clamp-up-and-log (ADR-0079) are unchanged — finer cells are never silently
truncated; the expensive tier simply asks for fewer of them.

This **supersedes ADR-0079 decision #2** (the uniform 2.5 m / 1.8 m cells + 9000 /
24000 caps): cell size is no longer uniform-per-disc but a function of per-cell cost.

## Consequences

- Sun-hours completes + visibly paints on the 240 m disc within a couple of seconds
  (≈ 3.5k coarse cells instead of ~8.5k clamped fine cells × hundreds of prisms),
  keeping its shaded→sunny ramp + legend.
- Daylight VSC (the heaviest per-cell metric) inherits the same expensive budget.
- Population / temperature / wind keep a fine field but with a bounded entity count
  (~12k cap), so they paint faster than the prior ~22k.
- One pure table (`siteMetricGridBudget`) is the single source of truth for per-metric
  resolution; the renderer never hard-codes cell size or caps. A unit test pins
  "expensive coarser + lower-cap than cheap" and "sun-hours yields fewer cells than
  population on the same disc".

## Alternatives considered

- *Keep one uniform fine grid, optimise the raycast instead* (BVH / spatial-index the
  prisms). Rejected for this pass — a real win but a larger change; the cost-tier
  decouple delivers the founder's "paints in seconds" immediately and is orthogonal
  (a future raycast speedup can RAISE the expensive cap without changing the seam).
- *Render the heatmap as a single batched Cesium primitive / canvas-texture overlay*
  (one draw call instead of N entity rectangles). Deferred — a worthwhile render-
  efficiency follow-up, but it rewrites the paint + clear/dispose lifecycle; the
  cap reductions already remove the acute slowness without that risk this pass.

## Follow-ups (non-blocking)

- Batch the heatmap cells into a single Cesium `GroundPrimitive` /
  `PerInstanceColorAppearance` (one draw call), or a canvas-texture rectangle overlay,
  and pool/reuse the cell geometry across metric switches.
- Spatial-index the context prisms so the expensive cap can be raised back toward the
  fine grid without re-introducing the stall.

---

## Amendment — 2026-06-30 (§SITE-METRIC-FINE-CHEAP + §SITE-METRIC-{TEMP,WIND}-CONTRAST)

Founder feedback on the deployed 240 m disc:

1. **"Cells are still too big — want them MUCH smaller."** The cheap-tier budget
   (`2.4 m`, cap `12000`) still read as coarse; the live log showed temperature at
   `8988/11025 cell(s)`.
2. **"Is the data accurate? is it all the same?"** — the Temperature map looked
   uniform, and the Wind map rendered a **flat CALM (all-blue)** field with the panel
   on "Wind data loading…" and an **empty wind rose**.

### Decision (amends the **cheap tier** of `siteMetricGridBudget` only)

- **Cheap tier → a much finer grid.** `cellSizeM 2.4 → 1.3 m`, `maxCells 12000 → 28000`.
  The cheap metrics are O(1) per cell and the build is already chunked across frames
  (`CesiumViewport.chunkBuild`), so the only cost is entity count — ~28k cells is ~3×
  heavier to draw but non-blocking and stall-free. The `resolveCellSize` clamp-and-log
  still fires if the cap bites (nothing silently truncated). **The EXPENSIVE tier is
  unchanged (`5 m` / `3500`)** — a fine raycast grid would re-introduce the freeze; the
  fine-grained sun-hours fix is a separate texture-decouple pass.

- **Temperature + wind now VARY visibly (contrast).** Two pure value→colour remaps in
  `siteMetricGrids.ts` (no change to the shared `@pryzm/street-analytics` engines):
  - `§SITE-METRIC-TEMP-CONTRAST` — stretch the UHI intensity (linear gain about the
    0.5 pivot) so dense-built (hot) vs open/green (cool) zones differ clearly on the
    warm ramp.
  - `§SITE-METRIC-WIND-CONTRAST` — the flat-calm root cause was a **too-low freestream**:
    a temperate bundled-normals mean (~2–3 m/s) sits under the Lawson "comfortable"
    threshold (2.5 m/s) for *every* cell, so shelter (which only lowers speed) can't
    move any cell to another class → one flat colour. Fix: a non-zero DIRECTIONAL
    baseline with an **exposure FLOOR** (`windInput`, 4.2 m/s — open field lands in the
    differentiating band; a real live mean above the floor passes through), recoloured
    off a **continuous** Lawson ramp (`lawsonRampColour`) instead of the 4-class step
    palette, so sheltered-vs-exposed cells separate into distinct hues.

- **Honest provenance + non-empty rose** (`FormaSiteAnalysisControls.ts`):
  - Temperature + wind captions made explicit MODELLED ESTIMATES, mirroring the
    population "OSM proxy — not census" pattern: *"Estimated: regional climate normal +
    urban-heat-island ΔT from OSM built density (not live sensor measurement)"* and
    *"Estimated: Lawson pedestrian-comfort proxy from regional climate wind-rose + OSM
    upwind shelter (not live measurement)"*.
  - The wind-rose PANEL now falls back to OFFLINE bundled regional normals
    (`resolveDatasetOrFallback`) when the live ClimateStore dataset hasn't landed but a
    location exists — the SAME bundled path the metric grid uses — so the rose shows a
    real mean + prevailing direction instead of latching on an empty
    "Wind data loading…" state while the map already paints a field.

### Consequences

- The cheap field metrics paint a visibly smooth grid (~1.6 m effective after the cap
  clamp on the 240 m disc); the temperature + wind maps clearly differentiate hot/cool
  and sheltered/exposed instead of reading uniform.
- No new compute-stall risk (still O(1) per cell, chunked); the expensive tier and the
  clamp-and-log are untouched. Unit tests pin: cheap cells ≤ 1.5 m + cap ≥ 20k, the
  cheap grid yields > 12k cells on the 240 m disc, and temperature/wind value **and**
  colour vary across the disc (incl. wind not collapsing to one colour on a low-mean
  bundled baseline).

---

## Amendment — 2026-06-30 (§SITE-METRIC-SUN-TEXTURE) — sun-hours DISPLAY decoupled from COMPUTE

This lands the deferred follow-up this ADR itself named ("render the heatmap as a
single … canvas-texture rectangle overlay"). It is the fine-grained sun-hours fix the
cost-tier amendment explicitly punted ("the EXPENSIVE tier is unchanged … the
fine-grained sun-hours fix is a separate texture-decouple pass").

### Problem

Sun-hours still read as a few thousand BIG SQUARES while the cheap metrics paint a
smooth ~1.3 m field. We could not simply shrink the expensive cell: the cost is the
per-cell **raycast** (× sun-sample × prism), so a fine raycast grid re-freezes the
viewport (live log: `§perf cell-cap: 9216 cells would exceed 3500; clamping 5.0→8.1 m`,
`sunHours heatmap: 2199 cell(s)`).

### Decision — decouple DISPLAY resolution from COMPUTE resolution (Option A)

The expensive part is the COMPUTE, not the render. So COMPUTE sun-hours on the
affordable raycast grid (unchanged chunked, non-blocking), then DISPLAY a single
**bilinearly-interpolated texture** over the disc — one draw call, a smooth gradient,
no thousands of entities.

- `siteMetricGrids.ts` (pure, no Cesium/THREE/DOM):
  - `SunHoursGridPrep` now also exposes `evaluateIntensity(cell) → 0..1 | null` (the
    factored-out raycast, shared by the discrete `evaluate` and the texture), plus
    `cellSizeM` + `radiusM` (the compute-lattice geometry the texture resamples from).
  - **`rasterizeSunHoursTexture(prep, intensities[, texSize])` → `SunHoursTexture`**
    (RGBA bytes, default 512² ≈ 0.9 m/texel on the 240 m disc — ~10× finer than the
    ~8 m compute cells the founder called "massive"). It snaps each computed intensity onto a regular index
    lattice (+ a valid mask for holes under a mass / off-disc), then for every fine
    texel does a **mask-renormalised bilinear** interpolation of the 4 surrounding
    nodes — so building-shadow holes fill smoothly from neighbours instead of punching
    dark squares. A round-disc alpha cutout (+ a thin edge feather) gives the Forma
    circle; colours come from the SAME `sunHoursRgb` ramp as the discrete cells + legend.
  - The expensive-tier budget is nudged `5 m / 3500 → 4 m / 5000`: the entity-count
    ceiling that pinned sun-hours coarse is GONE (display is now one texture, not N
    entities), so the only remaining limit is the raycast — a slightly finer COMPUTE
    grid → a smoother resampled field, still a couple-of-seconds raycast. Daylight VSC
    keeps the discrete-entity path (its colour-step field reads fine as cells).

- `CesiumViewport.renderSiteMetricOverlay` sun-hours branch: chunk-fills the per-cell
  `intensities` across frames (same `chunkBuild`, same stale-`seq` guard), then builds
  the texture ONCE and paints it via `paintSunHoursTexture` — a single
  `rectangle` entity over the disc's 2R×2R bounding square (north-up ENU ≈ cartographic
  at this scale; the grid uses true `eastNorthUpToFixedFrame`, no project-north spin)
  with an `ImageMaterialProperty` from the RGBA canvas. The entity joins
  `siteMetricEntities`, so `clearSiteMetricOverlay` removes it like any layer.

### Consequences

- Sun-hours now reads as fine/smooth as the cheap metrics WITHOUT re-freezing: compute
  stays on the affordable raycast grid (chunked, non-blocking) and the smooth gradient
  is ONE textured rectangle (cheaper than thousands of entity rectangles). Keeps the
  shaded→sunny ramp + legend (same `sunHoursRgb` core).
- `siteMetricGrids.ts` stays pure (texture is raw RGBA; the canvas/material lives in the
  Cesium render branch only). Span: `rasterizeSunHoursTexture` emits the §-tagged
  `[span][site-metric-sun-texture]` console breadcrumb (same convention as
  `prepareDaylightVscGrid` — this transitional `apps/editor/src/ui/climate` zone has no
  L7 otel facade; the GA otel-span gate scopes only the plugins handler dirs).
  `paintSunHoursTexture` is a private render helper (span-free; the compute path carries
  the breadcrumb).
- Unit tests pin: `evaluateIntensity` is 0..1 + null under a mass; the texture is square
  RGBA with a round transparent cutout (centre opaque, corners α0); adjacent texels move
  in small steps (interpolation smoothing, not big squares); a building-shadow hole still
  gets an opaque colour from its neighbours (masked fill).
- The OTHER named follow-up (spatial-index the prisms, Option B) remains open and is now
  orthogonal — a future raycast speedup can raise the expensive cap → an even finer
  compute grid feeding the same texture, with no render-path change.
