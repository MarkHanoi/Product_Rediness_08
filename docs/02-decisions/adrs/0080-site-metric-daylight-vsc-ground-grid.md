# ADR-0080 — Daylight (Vertical Sky Component) is a side-3D ground-grid metric (§SITE-METRIC-DAYLIGHT-VSC)

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-06-30 |
| Tag | §SITE-METRIC-DAYLIGHT-VSC |
| Owner | Analytics / Geospatial (Agent 5) |
| Closes | Founder/UX: the "Daylight (VSC)" metric chip in the Site-analysis panel was greyed-out ("Open in the BIM view") — the last unimplemented heatmap in the switcher. |
| Extends | [ADR-0079](./0079-site-metric-analysis-disc-decoupled-from-camera.md) (analysis-disc + §SITE-METRIC-HEATMAP family), [ADR-0074](./0074-gpu-solar-sun-hours-environmental-analysis.md) (solar/env analysis) |
| Constraint reference | C04 (scheduling — chunked builds), C01 P2 (no THREE outside renderer-three), C10 §2 / P8 (OTel spans — scope note below) |

---

## Context

The Forma-style "Site analysis" panel paints **one switchable ground heatmap at a
time** over the Cesium globe around the massing (§SITE-METRIC-HEATMAP): sun-hours,
temperature (UHI), wind (Lawson), population (OSM proxy). The fifth chip — **Daylight
(VSC)** — was permanently disabled. Its `MetricAvailability` was hard-coded
`available:false, reason:'Open in the BIM view (VSC)'`, and `setSiteMetricOverlay`
coerced `'daylight' → null`, because the only daylight code in the repo was the
per-ROOM, window-aperture `computeRoomDaylight` pass in
`@pryzm/ai-host/.../daylight/daylightAnalysis.ts` (used by the BIM-view per-room
scorer). That pass models light **admitted through a room's own window rectangles**;
it is not the metric the side-3D view needs.

**VSC (Vertical Sky Component)** is the standard daylight / right-to-light metric: the
proportion of a (uniform) sky hemisphere visible from a façade point, as a percentage.
Against a fully unobstructed vertical plane VSC ≈ **39.6 %** (textbook datum); a
neighbouring building that fills part of the sky lowers it. The BRE right-to-light
"rule of thumb" flags a window whose VSC falls below ~27 %, or to < 0.8× its prior
value, as materially affected. This is a *context-driven* metric — exactly the
question a site model with extruded OSM neighbours can answer.

## Decision

Implement Daylight (VSC) as a **first-class side-3D ground grid** in the same
`siteMetricGrids.ts` → `CesiumViewport[site-metric]` system as sun-hours, NOT as a
BIM-view pass.

1. **Per-cell VSC math (`verticalSkyComponentPct`, exported, pure).** For a cell, an
   observer is placed `VSC_OBSERVER_UP_M = 1.6 m` up and the upper sky hemisphere is
   swept on a fixed `24 × 9` (azimuth × altitude) lattice. A sky patch is **visible**
   when the ray toward it (rising at `tan(alt)` per horizontal metre) clears every
   context-building prism — reusing the **exact** `toPrisms` + `rayBlockedByPrism`
   analytic occlusion already built for the sun-hours pass (no new geometry, no THREE,
   P2-safe). Each patch carries the projected weight `sin(alt)·cos(alt)`; the visible
   weight is normalised to the unobstructed total and scaled to the canonical
   `UNOBSTRUCTED_VSC_PCT = 39.6 %`. An open site reads ≈ 39.6 % everywhere; a tall
   near neighbour drops it monotonically.

2. **Chunkable driver (`prepareDaylightVscGrid`, exported, pure).** Mirrors
   `prepareSunHoursGrid`: the cheap setup (grid + prisms) runs once; the heavy per-cell
   sky sweep lives in a returned `evaluate(cell)`. `CesiumViewport.renderSiteMetricOverlay`
   drives it through the existing `chunkBuild` frame-batched loop (220 cells/tick), so
   the field fills in progressively and never freezes the WebGPU viewport — identical
   to sun-hours. The synchronous `buildSiteMetricGrid('daylight', …)` path (whole-grid)
   is kept for tests / small discs.

3. **Availability + wiring.** `siteMetricAvailability` now marks `daylight` as an
   `available`, `isGroundGrid` metric (needs only the analysis disc — no climate, no
   lat/lon, no BIM mesh; an open site simply reads near the unobstructed max). The
   `FormaSiteAnalysisControls` chip therefore enables automatically. `setSiteMetricOverlay`
   no longer coerces daylight to null.

4. **Legend + provenance.** Legend ramp is **PRYZM-purple (#6600FF, overshadowed) →
   soft violet → white → warm gold (#F6C445, open sky)** — white + #6600FF, no black —
   on a 0 → ~40 % axis with a `%` unit. A provenance caption follows the population-
   proxy pattern: "Vertical Sky Component: % of sky visible, obstructed by the massing
   + OSM context (analytic sky sweep). Open ≈ 40%; right-to-light concern < ~27%."

## Comfort-metric audit (Task 3, recorded here for traceability)

Temperature (`computeHeatIslandGrid`) and Wind (`computeWindComfortGrid`) **already
produce real per-cell spatial variation**, not a flat field: heat ΔT is driven by
distance-weighted built density within a 40 m radius of each cell, and Lawson wind by
per-cell upwind shelter from the context obstacles. The bundled climate normal supplies
only the *baseline* (mean temp / mean speed + prevailing direction); the spatial field
is modulated per cell by the OSM context. No additional gradient was needed. (Where
there is genuinely no OSM context near a cell the field is correctly near-uniform — the
honest answer for an open site.)

## Consequences

- **+** The last greyed metric is live; the switcher is complete (5/5).
- **+** Zero new geometry/occlusion code — VSC reuses the sun-hours prisms + ray-march.
- **+** Pure + deterministic; unit-tested (open-datum, taller-neighbour-shades-more,
  monotonic-in-height, under-building / out-of-disc skip).
- **−** v1 occlusion is the same coarse analytic ray-march as sun-hours (a stylised
  shadow, not a surveyed VSC). It is a planning-grade RELATIVE field, not a
  code-compliant daylight certificate. Honest caption reflects this.

## P8 / OTel-span note

C10 §2 / P8 require every new exported function to add ≥1 span. The GA gate
(`tools/ga-gate/check-otel-spans.ts`) scopes that obligation to CommandBus handler
files under the plugins handler directories; the transitional `apps/editor/src/ui/climate`
metric-bridge has no L7 OTel facade and a direct `@opentelemetry/api` import there
would violate the L7 boundary (ADR-002 §2). Consistent with the existing exported
functions in this file (`buildSiteMetricGrid`, `prepareSunHoursGrid`, …, none of which
import OTel), the new `prepareDaylightVscGrid` emits a single structured
`console.debug('[span][site-metric-daylight-vsc] …')` telemetry breadcrumb as its
observable marker. `verticalSkyComponentPct` is the pure inner kernel called by it.

## Files

- `apps/editor/src/ui/climate/siteMetricGrids.ts` — VSC math + chunkable prep + legend + availability.
- `apps/editor/src/ui/geospatial/CesiumViewport.ts` — daylight render branch (chunked) + un-coerce.
- `apps/editor/src/ui/geospatial/FormaSiteAnalysisControls.ts` — chip tooltip + provenance caption.
- `apps/editor/__tests__/siteMetricGrids.test.ts` — VSC + availability + legend tests.
