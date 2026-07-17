# 3D Site Analysis — Credibility, Provenance & Roadmap Audit

> **Stamp**: 2026-07-17 · **Status**: OPEN AUDIT (L-373) · **Owner**: UNASSIGNED · **Severity**: P2 (with one P1 sub-item — see §1)
> **Scope**: the four gradient-heatmap layers on the Forma 3D Site Analysis surface — **Sun Hours, Wind Comfort, Temperature, Population Density** (plus the shipped 5th, **Daylight / VSC**). Audits what each layer *actually* computes, where its numbers *actually* come from (grounded in code, file:line), how credible it is for engineering/planning decisions, and how to evolve it to decision-grade.
> **Ground truth read before writing**: `apps/editor/src/ui/climate/siteMetricGrids.ts`, `apps/editor/src/ui/climate/siteRealData.ts`, `apps/editor/src/ui/geospatial/FormaSiteAnalysisControls.ts`, `apps/editor/src/ui/geospatial/contextBuildings.ts`, `apps/editor/src/workers/solarCodec.ts`, `packages/street-analytics/src/{HeatIslandGrid,WindComfortGrid,PopulationDensityGrid}.ts`, `packages/solar-analysis/src/{solarPosition,sunSamples}.ts`, `packages/climate-host/src/{liveNormalsAdapter,bundledNormals,fallbackDataset}.ts`.
> **Governance anchors verified**: C21-CLIMATE-INGESTION (CANONICAL), C54-IN-BROWSER-WIND-CFD (DRAFT), C55-GEODATA-ANALYTICAL-LAYERS (DRAFT), ADR-0095 (ACCEPTED/IMPLEMENTED).

---

## TL;DR — the single most important credibility finding

**All spatial variation a user sees on the Temperature and Wind maps is heuristic/estimated, not measured or simulated.** The only *measured* input to those two maps is a **single scalar base value** for the whole site (NASA POWER climatology, a coarse ≈50 km reanalysis grid point — `siteRealData.ts:120-199`). Everything spatial on top is a closed-form proxy:

- **Wind** paints a centroid-distance *shelter* heuristic (`WindComfortGrid.ts:75-87`) in **Lawson LDC pedestrian-comfort colours** (`WindComfortGrid.ts:32-46`). Using the *industry-standard Lawson criterion palette* on a non-CFD heuristic **implies a pedestrian wind-microclimate assessment was performed, when none was** — no wake, no corner acceleration, no downdraught, no channelling. This is the sharpest "estimate dressed as decision-grade" risk. **→ P1 trust sub-item (L-373a).** C54 exists precisely to replace this with real WebGPU-LBM CFD.
- **Temperature** paints a hard-coded UHI formula `ΔT = 6 °C × density × (1 − ventilation)` (`HeatIslandGrid.ts:28,55`) — no land-surface temperature, albedo, or land-cover data behind it.
- The colour ramps are **disc-normalised to each field's own min→max** (`siteMetricGrids.ts` `parityFieldMapper`), yet the legends show **absolute-looking units** (°C with a `base→+6 °C` axis; m/s `Calm→Gusty`) — so "red" means "hottest/windiest *in this view*", not a fixed absolute value the legend implies.

**Mitigating credit**: PRYZM already discloses this honestly. The panel provenance captions (`FormaSiteAnalysisControls.ts:1103-1145`) explicitly say "Estimate — …", name the real source when it lands, and the `§ANALYSIS-NO-FAKE-FALLBACK` work (ADR-0095) **removed** the previous invented radial hotspot. So this is a *credibility-hardening* initiative, not a "we are lying to users" emergency — hence overall **P2**, with the Lawson-palette-implies-assessment issue raised to **P1**.

---

## §1 — Classification & severity

- **Type**: NEW enhancement / validation initiative. The analyses exist and ship; their **data-provenance and credibility-for-decisions are largely undocumented and partly heuristic**. This is a gap-closing + trust-hardening effort, not a defect fix.
- **Severity: P2** (post-launch acceptable) overall — the layers are functional, honestly captioned, and useful as *comparative/indicative* concept-stage tools.
- **P1 sub-item (L-373a)**: Wind (and to a lesser degree Temperature) render **heuristic spatial fields in authoritative-looking, standards-named colour scales** (Lawson LDC classes; absolute °C axis) whose spatial signal is not measured or simulated. Anyone reading these as an engineering assessment would be misled. Impact-based justification: *a developer or planner could make a massing/comfort decision believing a Lawson wind study or a thermal-comfort study was run, when only a single reanalysis-grid scalar was measured and the rest is a distance heuristic.*
- **Impact (one sentence)**: The 3D Site Analysis surface is a strong differentiator and demo asset, but its Wind/Temperature layers must not present modelled heuristics in decision-grade clothing without an on-panel fidelity badge and a documented method — and the roadmap to real CFD/LST is not yet scheduled.

---

## §2 — Architectural alignment (contracts / ADRs / specs this touches)

| Doc | Status (verified) | Relevance |
|---|---|---|
| **C21-CLIMATE-INGESTION** | **CANONICAL** (ratified 2026-07-16, `C21…md:3`) | Governs how climate (EPW/NOAA/solar/wind/temperature) is ingested, normalised, cached, served. Temperature + Wind *base values* flow through this substrate (`ClimateHost`, `@pryzm/climate-host`). The offline `fallback-defaults` tier is a C21 §1.2 concept. |
| **C54-IN-BROWSER-WIND-CFD** | **DRAFT** (`C54…md:3`) | The **intended future of the Wind layer** — WebGPU Lattice-Boltzmann CFD (recirculation, roof-edge separation, corner acceleration). Explicitly calls today's wind-rose/Lawson streaks "coarse" and the CFD field its "high-fidelity sibling". Decision record ADR-0064; spec SPEC-WIND-CFD-LBM. |
| **C55-GEODATA-ANALYTICAL-LAYERS** | **DRAFT** (`C55…md:3`) | Governs the *planned* Hektar-style national open-data **Layers panel** (flood, landslide, slope, soil, noise, **population per km²**, monuments…) via a **pluggable-provider** abstraction. **COVERAGE GAP:** the four *shipped* heatmaps are **NOT** governed by C55 — they predate it and are bespoke L5 editor overlays (`siteMetricGrids.ts` + `FormaSiteAnalysisControls.ts` + `@pryzm/street-analytics`), not C55 `GeodataProvider` descriptors. C55 §1.5 (mandatory per-source attribution) and §1.6 (population/sensitive layers carry the C22 PII tier) are standards the current layers should adopt. |
| **C19-SITE-MODEL-AND-PARCEL** | present (referenced by C55/C54/C21) | The Site + parcel + bbox the analyses query against; the OSM context bbox derives from it. |
| **C12-GEOSPATIAL** | present (referenced) | LTP-ENU ↔ WGS84 substrate; the site-ENU frame all cells are placed in. |
| **C22-PRIVACY-AND-PII-TIER / C23-PROVENANCE** | referenced by C55 §1.5–1.6 | Population is an aggregate public dataset → PROJECT/DERIVED tier; attribution must be non-droppable. Current WorldPop/OSM caption partially satisfies C23; no formal C22 tier tag exists on the shipped layer. |
| **ADR-0095** (real datasets: pop/temp/wind, façade, globe clamp) | **ACCEPTED / IMPLEMENTED** (2026-07-01, `ADR-0095…md:3`) | The authoritative record for the *current* real-data wiring: NASA POWER (temp+wind) + WorldPop (population); removed the synthetic radial fallback; added `buildRealWindRose`, real-provenance captions. **This audit is the credibility review of exactly this work.** |
| **ADR-0074** (GPU solar sun-hours) | **PROPOSED** (partially shipped) | NOAA-replica sun-position (`solarPosition.ts`, ±0.5°) + deterministic sun samples behind Sun Hours + Daylight. Honesty clause: when climate is only `fallback-defaults`, the pass **MUST refuse absolute kWh/m²** and degrade to geometric sun-hours; "an indicative geometric sun-hours figure is not a certified solar/energy analysis." |
| **ADR-0064** (wind CFD LBM) **PROPOSED** · **ADR-0065** (geodata provider) **PROPOSED** · **ADR-0079** (analysis disc) **ACCEPTED** (grid part superseded by 0086) · **ADR-0080** (daylight VSC grid) **ACCEPTED** · **ADR-0086** (per-metric cost-tier) **ACCEPTED** · **ADR-0093** (Forma white model + façade) **ACCEPTED** · **ADR-0128** (sun-hours BVH + real-geometry façade) **ACCEPTED/PROPOSED** | statuses verified | Decision trail for cost-tier resolution, BVH acceleration, VSC grid, façade sun. **ADR-0080** is candid: VSC is "a planning-grade RELATIVE field, **not a code-compliant daylight certificate**." **ADR-0086** amendment forces the temp/wind captions to read "modelled estimate … not live sensor measurement." **ADR-0128 L-144**: the façade study paints a **4-face prism, not the real 192-wall/228-opening geometry** — "the analytic surface ≠ the visible building." |
| **C22-PRIVACY-AND-PII-TIER / C23-PROVENANCE** | both **DRAFT** ("C22-min" Tier-1 unimplemented, L-345) | Population is tagged **PROJECT / PII-adjacent** in SPEC-GEODATA §7; the shipped layer does not yet carry the tag. |
| **SPEC-FORMA-SITE-VIEW §6** | DRAFT (§11 VERIFIED-WORKING 2026-07-17) | Analysis hooks are **read-only consumers** — "FORMA adds the Cesium visualisation, not new analysis math." §6 line 156: the heat tint is "a **deliberately COARSE comfort cue, NOT a microclimate simulation**"; a true comfort/CFD sim is "deferred rather than faked." Directly corroborates this audit's P1 finding. |
| **SPEC-WIND-CFD-LBM / SPEC-3D-ANALYTICS-FIXES** | DRAFT / brief | CFD spec sets the **AIJ Case-B r≈0.84 CI release gate** + mandatory sheltered-zone calibration caveat. Analytics-fixes brief notes the wind/heat overlays are "**data-starved, NOT stubs**" and flags **§OVERPASS-RELIABILITY** — all four keyless Overpass mirrors 429/timeout on pan (the substrate that feeds every layer's spatial signal). |
| **SPEC-FORMA-SITE-VIEW §6**, **SPEC-GEODATA-ANALYTICAL-LAYERS**, **SPEC-WIND-CFD-LBM**, **SPEC-3D-ANALYTICS-FIXES-AND-OVERLAYS** | specs | §6 is the "interrogate the site" analysis hooks the panel implements; the geodata + wind-CFD specs are the roadmap engineering specs. |

**Conflicts / gaps to flag (not resolved here):**
1. **Coverage gap — no contract governs the four shipped heatmaps as data-provenance-bearing analytical layers.** C55 governs a *different, unbuilt* draped-provider subsystem; C21 governs climate *ingestion* but not the *derived heatmap credibility/labelling*. The shipped Sun/Wind/Temp/Population heatmaps sit in an ungoverned seam between C21 and C55. **Recommendation (text only, §logging): add a "Known Violations / Coverage Gap" note to C55 §1 and a cross-ref in C21 §10.**
2. **Standards-palette conflict**: rendering a non-CFD heuristic in Lawson LDC comfort colours conflicts with the *spirit* of C54 (which reserves pedestrian-comfort assessment for the CFD engine) and with C55 §1.5 provenance intent. C54 §1.6 "one engine input per knob" implies the coarse wind field should be visibly badged as a proxy, not styled as an assessment.
3. **C22 PII tier not applied**: Population ships without the C55 §1.6 / C22 `dataTier` tag, even though it is exactly the "population" layer C55 §1.6 calls out (SPEC-GEODATA §7 already assigns it PROJECT / PII-adjacent).
4. **The honesty precedent already exists — apply it to the shipped layers.** C54 §1.1 makes a visible **BETA + calibration-status** label a *contract invariant* enforced by CI (`check-windcfd-beta-label.ts`), and C55 §1.5 makes attribution CI-enforced (`check-geodata-attribution.ts`). The four *shipped* heatmaps have no equivalent CI-enforced fidelity/provenance label — the disclosure is voluntary caption text. **Recommendation: extend the C54/C55 labelling discipline to cover the shipped Sun/Wind/Temp/Population overlays.**

**Two governance anomalies surfaced during this audit (flag to governance, not fixed here):**
- **ADR file/title mismatch**: `ADR-0086-…-cost-tier-resolution.md` is titled "ADR-0084" internally and cross-referenced inconsistently by ADR-0079/0080/0093.
- **P8/OTel deviation**: the `apps/editor/src/ui/climate` analytics zone emits `console.debug('[span] …')` breadcrumbs instead of real OpenTelemetry spans (documented in ADR-0080 and ADR-0128) — a conscious deviation from C10 §2 / P8 not covered by the GA span gate.

---

## §3 — Architecturally-sound approach (pattern each fix should follow)

- **Temperature + Wind base values** → keep flowing through the **C21 ingestion adapter** (`@pryzm/climate-host` live path: Open-Meteo primary + PVGIS irradiance, `liveNormalsAdapter.ts:10-22`; NASA POWER for the analysis baselines, `siteRealData.ts`). Do **not** add a parallel climate fetcher. When higher-fidelity climate is needed (ERA5, local station), add it as a **C21 provider tier**, not an editor one-off.
- **Wind spatial field** → the correct fix is **C54's WebGPU-LBM CFD** as the high-fidelity sibling; the Lawson heuristic stays only as the instant/fallback tier and must be **badged "proxy — not CFD"**. This is a multi-layer touch: solver package (new L1/L2) + result-field overlay (renderer-three, P2) + `windcfd.*` command (P6) + schema (P5) + cache (C10).
- **Temperature spatial field** → future UHI/LST should be a **data-driven overlay** (satellite LST / land-cover) ingested through the C55 pluggable-provider path *or* a C21 climate tier — **not** a hard-coded `MAX_UHI × density` formula. Fast fix (label + disc-normalisation disclosure) differs from correct fix (real LST raster).
- **Population** → already anchored to WorldPop (real). Correct fix = add C55 §1.6 PII tier tag + C23 provenance record + census/day-night upgrade as **additional providers**, reusing the existing `fetchRealPopulationSample` cache pattern (`siteRealData.ts:288-349`).
- **New layers (Daylight-VSC compliance, Noise, Flood, Solar-radiation-kWh)** → author as **C55 `GeodataLayer` descriptors through the pluggable provider**, or as analysis passes reusing the existing Forma overlay path (`setSiteMetricOverlay`), **never one-off scene hacks**. The renderer + legend are already generic (`siteMetricGrids.ts:34-35` "add one branch returns `MetricGridCell[]`").
- **Cross-cutting**: every layer needs a **fidelity badge + provenance record + absolute-vs-relative legend disclosure** — this is the single highest-leverage, lowest-cost change and touches only the client overlay + legend (`renderMetricLegend`, `metricSourceNote`).

---

## A. Per-layer audit

### A.1 — Sun Hours ☀
- **What it measures**: Direct-beam sunlight **hours on a single analysis day** at each ground cell. Value stored is genuine absolute hours: `value = litFraction × (daylightSamples × stepHours)` (`siteMetricGrids.ts:1050,1065-1066,1077`). A cell is "lit" at instant *t* if the ray toward the sun is not blocked by any building prism.
- **Why architects/developers/planners care**: overshadowing of amenity/gardens/PV, solar access rights (BRE/"right to light"), passive-solar orientation, terrace/balcony sunlight, park/plaza usability.
- **Decisions it supports**: massing height/setback to protect neighbours' sun; where to put gardens, terraces, PV; shadow-study for planning submission (comparative).
- **How to read the gradient**: deep blue = shaded, teal→gold→warm = increasingly sunny (`sunHoursRgb`, `siteMetricGrids.ts:410-431`). Legend `Shaded → Sunny`, unit **h** (`siteMetricLegend`, `…:2872-2879`).
- **Colour scale + units**: 4-stop ramp `#2C3E80→#3FA796→#F6C445→#F4753A`; tooltip reports **hours** for the selected day.
- **Assumptions / limits**: **(a)** single day only — Summer/Equinox/Winter presets (June/Mar/Dec solstice-equinox, `sunSamples.ts:29-40`), **not annual cumulative**; **(b)** 15-min cadence; **(c)** sun position = NOAA low-error approximation, **±0.5°** (`solarPosition.ts:12`), a byte-replica of `RealSunService`; **(d)** occluders = OSM footprints + the massing **extruded from a FLAT ground datum** — **no terrain elevation, no ground slope** (`solarCodec.ts:158,197-227`); **(e)** direct-beam geometry only — **no diffuse/atmospheric/cloud** attenuation, so it is sun-*hours*, not irradiance; **(f)** OSM context heights limit accuracy (see §A.5).
- **Static vs dynamic**: dynamic w.r.t. date/time scrubber + sun-day preset; static day (not a year integration).
- **Verdict**: The **most credible** of the four for its stated purpose (comparative shadow study). Sun geometry is genuinely accurate; the honest gaps are *single-day*, *flat-ground*, and *OSM-height-limited*.

### A.2 — Wind Comfort 🌬
- **What it measures**: A **pedestrian-level shelter estimate**. Freestream base speed is reduced per cell by a shelter factor from nearby building centroids, then classified by **Lawson LDC** thresholds (`WindComfortGrid.ts:32-37,55-95`).
- **Why they care**: pedestrian comfort/safety in plazas, entrances, gaps between towers; wind nuisance is a common planning objection.
- **Decisions it supports**: (aspirationally) where wind is uncomfortable/dangerous, whether a tower gap channels wind. **In its current form it should inform only *coarse siting intuition*, not comfort sign-off.**
- **How to read**: continuous ramp blue(calm)→green→amber→red(gusty) (`lawsonRampColour`, `siteMetricGrids.ts:850-870`) — note this is a smoothed version of the discrete Lawson class colours (`LAWSON_COLOURS`, `WindComfortGrid.ts:40-46`). Legend `Calm→Gusty`, unit **m/s**.
- **Assumptions / limits — the credibility problem**: **(a)** base speed is a **single scalar** — real NASA POWER 10 m annual-mean when landed (`windInput`, `siteMetricGrids.ts:818-845`), else a **synthetic 4.2 m/s exposure FLOOR** injected so the map isn't flat (`WIND_EXPOSURE_FLOOR_MS`, `…:840`); **(b)** spatial signal = **Σ(height/distance × upwind-alignment) centroid heuristic** (`WindComfortGrid.ts:75-87`) — **NOT CFD**: no wake, no corner/Venturi acceleration (the *dangerous* real effect), no downdraught, no recirculation, no ground roughness; **(c)** shelter only ever *reduces* speed, so the map **structurally cannot show acceleration** — the exact hazard pedestrian-wind studies exist to find; **(d)** disc-normalised colour (relative, not absolute).
- **Static vs dynamic**: static (annual-mean base + prevailing direction); no seasonal/gust scenario.
- **Verdict**: **Visualisation-only.** Directionally plausible for "sheltered vs open" intuition; **must not be read as a Lawson assessment.**

### A.3 — Temperature 🌡
- **What it measures**: Urban-heat-island air-temperature estimate: `tempC = base + ΔT`, `ΔT = 6 °C × density × (1 − ventilation)` (`HeatIslandGrid.ts:28-30,43,55-59`).
- **Why they care**: overheating risk, outdoor thermal comfort, cooling-load siting, green-infrastructure justification, UHI mitigation policy.
- **Decisions it supports**: (aspirationally) hot spots to shade/green; **currently indicative only.**
- **How to read**: cool yellow→orange→deep red (`heatCellColour`, `HeatIslandGrid.ts:66-85`). Legend axis `base °C → +6 °C`, unit **°C** (`siteMetricLegend:2844-2852`).
- **Assumptions / limits**: **(a)** base = **real NASA POWER T2M warm-season climatology** when landed (`siteRealData.ts:153-155`), else Köppen-template bundled normals (`bundledNormals.ts:14-18`) — **air temp, not surface/radiant temp**, at ≈50 km resolution; **(b)** spatial signal = a **hard-coded formula**: peak UHI fixed at **6 °C** (`MAX_UHI_C`), density from building heights within a **40 m radius** (`DENSITY_RADIUS_M`), ventilation from wind mean — **no land-surface temperature, albedo, land cover, vegetation, water, or anthropogenic-heat data**; **(c)** UHI is a *nocturnal* phenomenon physically, but this presents it as a static field; **(d)** disc-normalised colour vs absolute-looking axis (see §C).
- **Static vs dynamic**: static.
- **Verdict**: **Visualisation-only / indicative.** The base °C is real; the entire spatial pattern is a heuristic, not a measurement or simulation.

### A.4 — Population Density 👥
- **What it measures**: Residents per hectare. **Real WorldPop 100 m gridded density when reachable** (`siteRealData.ts:288-349`), distributed *within* the plot by the OSM built-mass pattern; **falls back to a pure OSM GFA proxy** `residents = footprint × floors × 0.035 persons/m²` (`PopulationDensityGrid.ts:13,56-85`) when WorldPop is unreachable.
- **Why they care**: catchment/demand, amenity/retail viability, infrastructure load, density-policy compliance, mix justification.
- **Decisions it supports**: neighbourhood-density context; unit-mix/amenity sizing (coarse).
- **How to read**: pale yellow→deep red (`densityCellColour`, `PopulationDensityGrid.ts:88-94`). Legend `Low→High`, unit **p/ha** (`siteMetricLegend:2862-2871`).
- **Assumptions / limits**: **(a)** WorldPop = **modelled dasymetric** (not census-measured), **2020**, **residential/night-time** population, `wpgppop` constrained raster (`siteRealData.ts:305-309`) — good for residential density, **blind to daytime/employment/footfall**; **(b)** sampled over a ~300 m square and divided to p/ha (`…:326-329`) — a **single plot-mean scalar**, spatially spread only by the OSM proxy; **(c)** proxy fallback = `0.035 persons/m² GFA` rule-of-thumb (`PopulationDensityGrid.ts:13`) — reads a landmark's big footprint as "busy" (the exact defect ADR-0095 called out); **(d)** cache keyed to ~1 km rounding (`siteRealData.ts:44-47`).
- **Static vs dynamic**: static (annual raster).
- **Verdict**: **Decision-useful (residential context) when WorldPop is reachable; visualisation-only on the OSM-proxy fallback.**

### A.5 — The shared substrate (affects ALL four)
Every layer's *spatial* signal derives from **OSM Overpass building footprints** (keyless, `contextBuildings.ts:1,26-31`) with heights/floors read from OSM `height` / `building:levels` tags (`contextBuildings.ts:57-62`), defaulting to a **3 m storey** when untagged (`PopulationDensityGrid.ts:15`). **OSM height/floor completeness is the dominant accuracy limiter for sun shadows, wind shelter, UHI density, and the population proxy simultaneously.** Sparse OSM → weak/flat fields → the app used to invent a radial gradient (now removed, ADR-0095).

---

## B. Data validation table

| Layer | Probable ACTUAL source (file:line) | Nature | Spatial res. | Temporal res. | Expected accuracy | Confidence (0–100, eng/planning) | Verdict |
|---|---|---|---|---|---|---|---|
| **Sun Hours** | NOAA sun-position replica (`solarPosition.ts:23-84`, ±0.5° `:12`) + analytic prism occlusion (`solarCodec.ts:197-227`); occluders = OSM (`contextBuildings.ts`) | **Simulated** (geometry), deterministic | ~4 m compute cells (`siteMetricGrids.ts:560`), 512² display texture | **Single day** (Su/Eq/Wi preset), 15-min steps | Sun angle excellent; result limited by OSM height + flat-ground + single-day | **60** | **Decision-useful** (comparative shadow study); NOT annual/compliance/kWh-grade |
| **Wind Comfort** | Base: NASA POWER WS10M/WD10M annual mean (`siteRealData.ts:147-176`) or synthetic 4.2 m/s floor (`siteMetricGrids.ts:840`). Spatial: Lawson centroid-shelter heuristic (`WindComfortGrid.ts:75-87`) | Base **measured (coarse reanalysis)**; spatial **estimated heuristic** | Base ≈50 km grid point; spatial ~7.5 m cells | Annual mean; static | Base ±plausible; spatial field **not validated**, cannot show acceleration | **25** | **Visualisation-only** — NOT a Lawson assessment |
| **Temperature** | Base: NASA POWER T2M warm-season (`siteRealData.ts:153-155`) or Köppen template (`bundledNormals.ts:14-18`). Spatial: hard-coded UHI `6×density×(1−vent)` (`HeatIslandGrid.ts:55`) | Base **measured (coarse)**; spatial **estimated formula** | Base ≈50 km; spatial ~7.5 m cells | Warm-season climatology; static | Base ±1–2 °C plausible; spatial ΔT **not measured** (no LST/land cover) | **30** | **Visualisation-only / indicative** |
| **Population Density** | WorldPop 2020 100 m `wpgppop` (`siteRealData.ts:305-329`); fallback OSM GFA proxy `×0.035` (`PopulationDensityGrid.ts:13,60-72`) | **Modelled (WorldPop)** / **estimated (OSM proxy)** | 100 m raster (WorldPop) → plot-mean scalar; proxy at cell res | Annual (2020); static | WorldPop good for residential; proxy poor for non-residential | **55** WorldPop / **20** proxy | **Decision-useful (WorldPop) / visualisation-only (proxy)** |
| *Daylight (VSC)* *(shipped 5th)* | Per-cell sky-hemisphere sweep vs OSM+massing (`siteMetricGrids.ts:2828`, ADR-0080) | **Simulated** (geometry) | ~4 m cells | Static (geometry) | Analytic VSC; open datum ≈40%, right-to-light flag <27% | **60** | **Decision-useful** (relative right-to-light screen) |

*Confidence = fitness for an engineering/planning **decision**, not visual quality. All four are visually rich; the scores reflect provenance + method rigour.*

---

## C. UI recommendations (so a user understands the colours without docs)

**Universal (all layers) — highest leverage, lowest cost:**
1. **Fidelity badge** on every legend: `Measured` / `Simulated` / `Estimated (proxy)` / `Indicative`. Today the caption text says it (`metricSourceNote`, `FormaSiteAnalysisControls.ts:1103-1145`) — promote it to a coloured pill so it's unmissable.
2. **Absolute-vs-relative disclosure**: because colour is **disc-normalised** (`parityFieldMapper`), state "Colours scaled to the visible area (min→max)" and print the **actual numeric min/max** at the legend ends, not just `Calm/Gusty` / `Low/High`.
3. **Provenance line** (already present) + **fetch date + dataset version** (WorldPop 2020, NASA POWER climatology, OSM fetch time) per C55 §1.5 / C23.

**Sun Hours** — show: **analysis date + season preset**, **time range** swept, **cadence** (15 min), "**Direct beam only — no diffuse/cloud**", "**Flat ground — terrain not modelled**", "**Shadows from OSM context + your massing (OSM heights may be missing)**", legend `0 h … N h` with the **actual daylight-hours of that day**, and a "single day, not annual" caveat.

**Wind Comfort** — show: **base wind (value + prevailing direction + source)**, an explicit "**Shelter proxy — not CFD; cannot show wind acceleration**" badge, and **rename the classes** away from bare "Lawson" (e.g. "shelter estimate") unless/until C54 CFD backs them. State the base is an annual mean, not a gust scenario.

**Temperature** — show: **base air temp (value + source + warm-season note)**, "**UHI ΔT is a built-density estimate (0–6 °C), not measured surface temperature**", legend as `base °C → base+6 °C` **with the real base printed**, and an "air temperature, not radiant/surface" note.

**Population Density** — show: **WorldPop 2020, persons/ha, residential (night-time)** when real; when on fallback, a prominent "**OSM footprint proxy — not residents**" badge. Note "distributed within plot by built mass".

---

## D. Better data sources (per layer)

**Sun Hours / Solar**
| Source | Accuracy | Coverage | Licence | Cost | Update | Suitability |
|---|---|---|---|---|---|---|
| Current NOAA-replica geometry | High angle, single-day | Global | in-house | free | n/a | Good baseline |
| **+ Cesium World Terrain / national LiDAR DTM** (adds terrain to occlusion) | High | Global (Cesium) / national LiDAR best | Cesium Ion / open LiDAR | free–$$ | static | **Recommended: add terrain to shadow model** |
| PVGIS / NSRDB / Meteonorm (irradiance kWh/m²) | High (irradiance) | EU / US / global | free (EU/US) / commercial | free–$$$ | annual | **For kWh/m² + PV yield** |
| Ladybug/Radiance-class annual cumulative | Reference | Global | open | free (compute) | n/a | For annual-hours compliance |
→ **Source of truth**: keep NOAA geometry; **add terrain (Cesium/LiDAR)** for occlusion and **PVGIS/NSRDB** for irradiance/kWh.

**Wind**
| Source | Accuracy | Coverage | Licence | Cost | Update | Suitability |
|---|---|---|---|---|---|---|
| Current Lawson centroid heuristic | Low | Global | in-house | free | static | Intuition only |
| **C54 WebGPU-LBM CFD** (planned) | Medium-high (early-stage) | Any massing | in-house | free (client GPU) | on-demand | **Recommended primary** |
| ERA5 / station wind rose (real inlet) | High (inlet) | Global / point | free (CDS) / open | free | hourly/annual | **Recommended inlet for CFD** |
| Cloud RANS/LES CFD | Reference | Any | commercial | $$$ | on-demand | Detailed-design validation |
→ **Source of truth**: **C54 LBM CFD** driven by an **ERA5/station wind-rose inlet**; retire the centroid heuristic to a labelled fallback.

**Temperature / UHI**
| Source | Accuracy | Coverage | Licence | Cost | Update | Suitability |
|---|---|---|---|---|---|---|
| Current UHI formula | Low | Global | in-house | free | static | Indicative |
| **Landsat 8/9 & ECOSTRESS LST** (surface temp) | Medium-high | Global | free (USGS/NASA) | free | 16-day / ISS | **Recommended: real surface-temp raster** |
| Copernicus/ESA land cover + albedo | Medium | Global | free | free | annual | UHI drivers |
| ERA5-Land / local station air temp | High (air) | Global/point | free | free | hourly | **Real base air temp** (upgrade NASA POWER) |
| UMEP/UWG microclimate model | Reference | Any | open | free (compute) | scenario | UTCI/PET comfort |
→ **Source of truth**: **ERA5-Land** base + **Landsat/ECOSTRESS LST** overlay; replace the hard-coded formula.

**Population**
| Source | Accuracy | Coverage | Licence | Cost | Update | Suitability |
|---|---|---|---|---|---|---|
| Current WorldPop 100 m / OSM proxy | Medium / low | Global | CC-BY / ODbL | free | 2020 / live | OK residential baseline |
| **National census / ABS/ONS/Eurostat GEOSTAT** | High | Per-country | open (mostly) | free | 1–10 yr | **Recommended where available** |
| GHS-POP (JRC) | Medium-high | Global 100 m | free | free | ~5 yr | Global consistency |
| Meta/Kontur/Foursquare day-night & footfall | High (activity) | Global | mixed / commercial | free–$$$ | frequent | **Daytime/employment/footfall** |
→ **Source of truth**: **national census** where present, **GHS-POP/WorldPop** global fallback, **Kontur/Foursquare** for day-night & footfall.

---

## E. Better methods (current → future)

- **Sun**: single-day lit-fraction → **annual cumulative sun-hours + kWh/m²** (integrate over the year with PVGIS/NSRDB irradiance), **façade exposure + roof PV yield**, **overshadowing-compliance** checks (BRE APSH/"no-sky-line", 2h-on-21-March style tests), terrain-aware occlusion.
- **Wind**: centroid-shelter heuristic → **C54 WebGPU-LBM CFD** with **Lawson/NEN-8100 comfort + safety criteria** computed from the *velocity field* (so acceleration/downdraught/channelling appear), multi-direction weighted by the real wind rose, **tower-base acceleration** and **corner-effect** detection.
- **Temperature**: `6×density×(1−vent)` formula → **satellite LST + land-cover-driven UHI**, **UTCI/PET outdoor-comfort** (mean radiant temp from the sun-hours pass + wind from CFD), **shaded-vs-exposed comfort maps**, seasonal/heatwave scenarios.
- **Population**: plot-mean scalar → **census-block choropleth**, **day-vs-night population**, **employment/jobs density**, **catchment/isochrone** (walk 5/10/15-min), **projections** to horizon year.

---

## F. Gap analysis (missing analyses, ranked by value per stakeholder)

Value key: ★★★ high, ★★ medium, ★ low.

| Missing analysis | Architects | Developers | Gov / planners | Notes |
|---|---|---|---|---|
| **Daylight/VSC compliance** (BRE) | ★★★ | ★★ | ★★★ | Shipped as relative VSC (ADR-0080); needs **pass/fail compliance** framing |
| **Overshadowing / solar-access compliance** | ★★★ | ★★ | ★★★ | Sun engine exists; add the statutory tests |
| **Annual solar radiation (kWh/m²) + PV yield** | ★★★ | ★★★ | ★ | Net-zero/ESG; needs PVGIS/NSRDB |
| **Real pedestrian wind (CFD)** | ★★ | ★★★ | ★★★ | C54 — biggest credibility upgrade |
| **Noise (road/rail/air)** | ★★ | ★★★ | ★★★ | Planning objection driver; C55 layer |
| **Flood risk (fluvial/pluvial/coastal)** | ★★ | ★★★ | ★★★ | Often a hard constraint; C55 §1.8 keep-out |
| **Planning controls / zoning / height limits** | ★★★ | ★★★ | ★★★ | Envelope legality; C55 provider |
| **Operational carbon / energy** | ★★ | ★★★ | ★★ | ESG; ties to C21 climate |
| **Walkability / 15-min access / isochrones** | ★★ | ★★★ | ★★★ | Amenity/value narrative |
| **Accessibility (slope/step-free)** | ★★ | ★ | ★★ | Terrain DTM |
| **View corridors / visual impact** | ★★★ | ★★ | ★★★ | Heritage/skyline protection |
| **Infrastructure capacity (utilities/transport)** | ★ | ★★★ | ★★★ | Feasibility |
| **Tree canopy / green cover / biodiversity net gain** | ★★ | ★★ | ★★★ | Policy (BNG) |
| **Stormwater / drainage / runoff** | ★★ | ★★ | ★★★ | SuDS compliance |
| **UHI mitigation / thermal comfort (UTCI)** | ★★ | ★ | ★★★ | Upgrade of Temperature layer |

**Ranked headline priorities**: *Architects* → Daylight/overshadowing compliance, view corridors, solar radiation. *Developers* → Planning controls, flood, noise, walkability, CFD wind. *Gov/planners* → Planning controls, flood, noise, overshadowing, view corridors, BNG/stormwater.

---

## G. Roadmap — to engineering-grade decision-support

**Phase 0 — Truthful labelling (days; P1 for the wind/temp trust risk).** Fidelity badges + absolute/relative legend disclosure + provenance/date on every layer (§C). Rename bare "Lawson" until CFD backs it. **No new data.** Touches: `FormaSiteAnalysisControls.ts` legend/caption + `siteMetricLegend`. **Adopt the existing C54 §1.1 BETA/calibration-label pattern and C55 §1.5 attribution pattern for the shipped layers, and add a CI gate** (`check-siteanalysis-fidelity-label.ts`) mirroring `check-windcfd-beta-label.ts` so the disclosure can't silently regress. Governed by: a C55 §1.5-style provenance requirement note for the shipped heatmaps.

**Phase 1 — Ground the existing layers in better base data (weeks).** Terrain-aware sun occlusion (Cesium/LiDAR DTM); ERA5-Land base temp/wind via a **C21 provider tier**; C22 PII tier tag on Population; census provider for Population where available. Reuse `siteRealData` cache pattern; no new subsystem.

**Phase 2 — Real simulation for the two weakest layers (1–2 quarters).** Ship **C54 WebGPU-LBM wind CFD** (ADR-0064 / SPEC-WIND-CFD-LBM) as the primary wind field; add **annual solar radiation + kWh/m² + PV** (PVGIS/NSRDB) on the existing sun pass; add **satellite-LST UHI** + **UTCI/PET comfort** (mean radiant temp from the sun pass, wind from CFD).

**Phase 3 — The C55 national analytical-layers platform (2+ quarters).** Build the **pluggable-provider** subsystem (`packages/geodata-layers/`, ADR-0065) and land the compliance/constraint layers: **Daylight/overshadowing compliance, Noise, Flood, Planning controls, View corridors, BNG/tree canopy, Stormwater**. Feed suitability/keep-out into the layout engine via the **existing** SPEC-ENVIRONMENTAL-DESIGN-DRIVERS consumer (C55 §1.8) — never a parallel objective.

**Phase 4 — Decision-grade certification.** Validate each layer against a reference (measured stations, cloud CFD, statutory test suites), publish accuracy envelopes, and gate "compliance" framing behind validated methods only.

Subsystem mapping: Sun/Daylight → `@pryzm/solar-analysis` + terrain. Wind → C54 `windcfd.*`. Temperature → C21 climate tiers + C55 LST provider. Population + all new layers → C55 `geodata-layers` providers. All overlays → the existing Forma `setSiteMetricOverlay` generic path.

---

## Appendix — key file:line index

- Layer routing + disc-normalisation: `apps/editor/src/ui/climate/siteMetricGrids.ts:645-786` (`buildSiteMetricGrid`), `:925-940+` (`parityFieldMapper`), `:818-845` (`windInput`/4.2 m/s floor), `:1011-1082` (sun-hours prep, `value=intensity*maxHours` `:1077`), `:2839-2894` (legends/units).
- Real data fetchers: `apps/editor/src/ui/climate/siteRealData.ts:120-199` (NASA POWER temp+wind), `:288-349` (WorldPop 2020 `wpgppop`), `:44-47` (~1 km cache key).
- Engines: `packages/street-analytics/src/HeatIslandGrid.ts:28,30,43,55` (UHI formula/constants), `WindComfortGrid.ts:32-46,75-87` (Lawson + shelter heuristic), `PopulationDensityGrid.ts:13,15,56-85` (GFA proxy).
- Sun geometry: `packages/solar-analysis/src/solarPosition.ts:12,23-84` (NOAA ±0.5° replica), `sunSamples.ts:29-40,68-93` (single-day presets). Occlusion: `apps/editor/src/workers/solarCodec.ts:158,197-227` (flat-ground prisms).
- Panel + provenance captions: `apps/editor/src/ui/geospatial/FormaSiteAnalysisControls.ts:1103-1145` (source notes), `:1154-1198` (real vs estimate wind rose), `:1052-1099` (legend).
- Substrate: `apps/editor/src/ui/geospatial/contextBuildings.ts:1,26-31,57-62` (OSM Overpass, height/floors from tags).
- Climate tiers: `packages/climate-host/src/liveNormalsAdapter.ts:10-22` (Open-Meteo + PVGIS), `bundledNormals.ts:14-18` (Köppen templates), `fallbackDataset.ts:18-19` (`fallback-defaults`).
</content>
</invoke>
