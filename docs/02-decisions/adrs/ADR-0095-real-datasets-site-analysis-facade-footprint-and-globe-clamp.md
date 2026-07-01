# ADR-0095 — Real free datasets for site analysis (population / temperature / wind), façade-footprint resolution, honest degradation, and globe tile-clamp fixes

- **Status:** ACCEPTED (2026-07-01) — IMPLEMENTED.
- **Owner:** analytics / geospatial (the Cesium side-3D site analysis surface).
- **Affects:**
  - `apps/editor/src/ui/climate/siteRealData.ts` (NEW — real free-dataset fetchers: NASA POWER + WorldPop)
  - `apps/editor/src/ui/climate/siteMetricGrids.ts` (real baselines thread into the pure grid; fake radial fallback removed; `buildRealWindRose`; legend/unit)
  - `apps/editor/src/ui/geospatial/CesiumViewport.ts` (real-data fetch+repaint wiring; façade footprint resolution; globe tile-clamp no-self-hit; bounding-sphere framing; console-spam removal)
  - `apps/editor/src/ui/geospatial/FormaSiteAnalysisControls.ts` (real-provenance captions + real wind rose)
  - `apps/editor/__tests__/siteMetricGrids.test.ts` (+6 tests)
- **References:** `§ANALYSIS-REAL-POPULATION`, `§ANALYSIS-REAL-TEMPERATURE`, `§ANALYSIS-REAL-WIND`,
  `§ANALYSIS-NO-FAKE-FALLBACK`, `§FORMA-FACADE-FOOTPRINT-FIX`, `§GLOBE-TILE-CLAMP-NO-SELF-HIT`,
  `§GLOBE-FIT-BUILDING`; supersedes the synthetic parts of `§SITE-METRIC-PARITY-ALL` (the radial
  fallback) and the OSM-GFA population proxy default; ADR-0093 (façade analysis), ADR-0086
  (metric texture), ADR-0084 (cost-tier), C21 (climate ingestion).

## Context

The side-3D site analysis metrics were PROXIES, and the code said so:

- **Population** = an OSM building **floor-area** density proxy — *not* a census/WorldPop grid.
  A landmark (e.g. Sagrada Família) read "busy" because the proxy measures building
  footprint × floors, not people/footfall.
- **Temperature** = a built-density UHI **formula** over a *synthesised* regional-normals
  baseline (invented, not measured).
- **Wind** = a Lawson pedestrian **shelter proxy** over a *synthesised* 16-sector wind rose.
- Worse: when the OSM context was sparse, every cheap metric fell back to a **smooth radial
  synthetic gradient** — a fake hotspot centred on the studied building, with no data behind it.

Two additional defects on the Cesium surface:

- **Façade analysis** (`§FORMA-FACADE-ANALYSIS`) resolved the designed building's footprint
  ONLY from `formaLastMassingInput.boundary`, which is `null` whenever no parcel ring was
  drawn — so it logged `no building footprint — skipping façade analysis` and never painted
  sun on walls/roof, in both Real and Massing fidelity modes.
- **Photoreal-globe height clamp** floated the building and CREPT it upward on every 3D-view
  switch: `scene.sampleHeightMostDetailed` raycast the loaded tiles (which include the
  ALREADY-PLACED model + neighbour roofs), so each re-seat sampled its own roof and stacked
  it ~one storey per switch (a feedback loop; deployed logs showed HEIGHT climbing 199 → 524 →
  525 m). A per-`moveEnd` `RUNTIME VERIFICATION` log flooded the console.

## Decision

### 1. Real datasets (`§ANALYSIS-REAL-*`)

A new browser-side data service `siteRealData.ts` fetches REAL, FREE, keyless, CORS-enabled
public datasets, cached by rounded lat/lon (~1 km), de-duped in-flight, and NON-FATAL (any
failure resolves null):

- **Temperature + Wind → NASA POWER** (`power.larc.nasa.gov`). ONE climatology request returns
  `T2M` (2 m air temp), `WS10M` (10 m wind speed) AND `WD10M` (wind direction). This gives the
  REAL site baseline air temperature and REAL regional wind speed + prevailing direction.
- **Population → WorldPop** (`api.worldpop.org`). The global 100 m gridded raster summed over
  the site plot → REAL persons/hectare.

The PURE grid math (`buildSiteMetricGrid`) stays pure: `CesiumViewport` peeks the cache
synchronously, seeds the real baselines into the grid input, and kicks an async fetch that
repaints the active metric when real data lands. The built-density UHI ΔT (temperature) and
Lawson shelter/exposure (wind) legitimately stay as the SPATIAL modulation ON TOP of the real
baselines — air temp / freestream barely vary across a 240 m disc, so the modulation is the
legitimate spatial signal, but the BASE value is now measured. Population is anchored to the
real WorldPop areal density and distributed within the plot by the OSM built-mass pattern, so
a monument reads honestly low and a dense block high. The wind rose is rebuilt from the real
NASA POWER prevailing + mean/gust (`buildRealWindRose`).

**CORS:** NASA POWER and WorldPop both send permissive CORS headers, so these fetch directly
from the browser (same pattern as the existing Open-Meteo climate HUD). Should a source ever
tighten CORS, the one-async-fetch → cached-scalar shape makes routing through the existing CF
worker proxy (as the OSM/Overpass context fetchers do) a one-line URL swap.

### 2. No fake fallback (`§ANALYSIS-NO-FAKE-FALLBACK`)

The building-centred synthetic RADIAL gradient in `parityFieldMapper` is REMOVED. When a field
has no real spatial signal it now DEGRADES HONESTLY to a FLAT value everywhere (one uniform
colour), never an invented hotspot. Legends/captions label each metric REAL vs estimate: with
real data landed the caption reads "Real data · NASA POWER / WorldPop …"; otherwise it reads an
honest "Estimate …" (and, for population when WorldPop is unreachable, "Estimate unavailable —
showing OSM built-density proxy"). Wind stays labelled "estimate" only for the pedestrian-comfort
MODELLING; its base wind is now real.

### 3. Façade footprint resolution (`§FORMA-FACADE-FOOTPRINT-FIX`)

`renderFacadeAnalysis` resolves the designed building's footprint robustly, most-reliable source
first: (1) the drawn parcel boundary; (2) else the massing **wall-loop** perimeter
(`reconstructPerimeterRing` — the same silhouette the shell extrusion uses); (3) else the
ground-storey **floor-slab** outer ring; (4) else a square about the massing centroid. This
works in BOTH Real and Massing fidelity (the massing input persists as the fallback under the
real model), so sun-on-façade + roof paints instead of skipping.

### 4. Globe tile-clamp no-self-hit (`§GLOBE-TILE-CLAMP-NO-SELF-HIT`) + framing (`§GLOBE-FIT-BUILDING`)

- The height raycast now passes the placed model (+ our context entities) in
  `sampleHeightMostDetailed(positions, objectsToExclude)` so it NEVER samples the thing it is
  placing (kills the cumulative creep-up feedback loop). The MIN-over-a-grid-of-points sampling
  (centroid + boundary vertices) is retained (rejects neighbour-rooftop float).
- When the site centroid is unchanged on a mere view switch, the clamp REUSES the settled ground
  height and re-frames only — it does not re-sample/re-seat (the model is already seated
  absolutely at that base), so switching views can never move it up.
- The per-`moveEnd` `RUNTIME VERIFICATION` LAT/LON/HEIGHT console spam is removed.
- A shared bounding-sphere framing helper (`modelBoundingSphere` + `flyToModelBoundingSphere`,
  via `camera.flyToBoundingSphere` with a ~2.5× radius offset) drives BOTH the initial
  3D-Site/3D-Globe landing and the "Zoom to Site" button (through the existing `flyToFormaSite`
  entry point), so the whole tower is framed like zoom-extents; it falls back to the prior √area
  altitude heuristic only when no bounding sphere resolves.

## Consequences

- Population / temperature / wind are now real-data-backed; monuments read honestly; the fake
  radial hotspot is gone. Metrics are clearly labelled real vs estimate.
- Façade sun analysis paints in both fidelity modes.
- The globe building sits on true ground and never creeps; the console is quiet; landing +
  Zoom-to-Site frame the whole building.
- External fetches are all guarded/cached/non-fatal — no new hard dependency; offline/blocked
  simply keeps the honest estimate state.
- P2/P3/P5 respected (no THREE, no rAF, no schema mutation); the pure grid math stays pure.

## Alternatives considered

- **Kontur H3 population** — heavier client ingest; WorldPop stats API is a simpler bbox sample.
- **Open-Meteo for the analysis baseline** — already used for the HUD; NASA POWER gives a
  long-term CLIMATOLOGY (stable baseline + wind rose) in one call, better suited to a planning
  study than a single forecast hour.
- **Hiding the model during the sample tick** — `objectsToExclude` is cleaner and doesn't flicker.
