<!--
  BARCELONA LOD2 ADOPTION PLAN
  Lane BCN-LOD2 · opened by the founder 2026-09-09 · 22 agents, 7 audited dimensions,
  14 adversarial verifiers. Captured to the repo the same turn it was produced
  ([[capture-founder-research-to-repo]]).

  THE FOUNDER'S ASK, VERBATIM:
    "BARCELONA IS OUR KEY PILOT PROJECT - i have discoverred a way more detailed LOD 200
     dataset that i would like to include on our 3d site"
    https://w20.bcn.cat/cartobcn/default.aspx?lang=en
    https://github.com/OloOcki/awesome-citygml#Spain
    https://www.barcelona.cat/geoportal/en

  ⭐ READ §1 FIRST. It corrects the premise: the dataset is the CITY's LOD1 (flat roofs, by
  the publisher's own written declaration), and the articulation in the founder's screenshot
  is one building decomposed into many flat-topped volumes — 7.27x more polygons than we draw
  today, measured in the identical bbox. That IS an LOD 200 massing model, which is what he
  asked for; it is NOT roof geometry.

  ⚠ EVERY figure marked with a tick was measured first-hand against the live service or the
  shipped R2 tiles on 2026-09-09. Figures marked UNVERIFIED were inherited and NOT re-fetched.
  Do not promote an UNVERIFIED figure by quoting it without the marker.

  ⛔ TWO HARVESTER TRAPS WERE HIT LIVE AND ARE RECORDED IN §2. Both return confident wrong
  answers rather than errors. Read them before writing any harvester against this service.
-->

All measurements are in and first-hand. Writing the plan.

# Barcelona LOD2 — Adoption Plan for the 3D Site Context

**Lane:** `BCN-LOD2` · **Date:** 2026-09-09 · **Pilot city:** Barcelona
**Status:** RECOMMEND — with one blocker (licence) and one premise correction the founder needs first.
Every number below marked ✅ was measured by this lane today against the live service or the shipped R2 tiles. Numbers marked ⚠ UNVERIFIED are inherited from upstream research and were **not** re-fetched here.

---

## 1. GO / NO-GO

**QUALIFIED GO on the massing, HARD NO on the roofs, and the licence gates redistribution — not access.** The founder is right about what he saw and the brief is wrong about what it is: Barcelona publishes **LOD1 with flat roofs, by the city's own written declaration** ✅ — the articulation in his screenshot is not roof geometry, it is one building decomposed into many flat-topped volumes (**7.27× more polygons than we draw today, measured in the identical bbox** ✅). That is not a downgrade of his ask, it is a precise reading of it: he wrote **"LOD 200"**, which is the AIA/BIMForum *massing* tier — generalised volumes with approximate size, shape and location — and Barcelona's multi-prism model at 0.02 m planimetric / 0.025 m altimetric municipal precision **is exactly an LOD 200 massing model**. So we can give him what he asked for, using the renderer we already have, with no mesh pipeline. Three things stop a naive adoption: (a) the **roof-form attribute block is not adoptable** — only 9.4% of volumes are fully specified and its `bldgheight` contradicts the volume's own geometry by >2 m on 41.2% of rows ✅, so shipping it would fabricate roofs on a fifth of the city; (b) the **draw budget breaks** — 83,756 volumes fall inside one default scope square against `CTX_TOTAL_MAX_BUILDINGS = 14000` and a 30,000 ceiling ✅, i.e. **6.0× over budget in a city that is already only drawing 54% of its footprints**; and (c) the **licence is unresolved and the failure mode is specific** — Barcelona's own legal notice grants CC BY 4.0 but routes *"types of data where there is participation by third parties"* to **CC BY-ND 4.0** ✅ verbatim, and this dataset carries joined Catastro attributes, while the service item itself returns `licenseInfo: ""` ✅. ND would forbid our baked tiles outright but **would not forbid streaming the city's own service unmodified** — which is also the cheapest route and the one to ship first. Do not justify this lane on the scorecard or on data quality: Barcelona's context heights are **already 96.9% solid, 0.5% assumed, verdict `measured`** ✅, and C63 moves by exactly zero. Fund it as pilot-demo credibility, which is a legitimate reason, and say so in those words.

---

## 2. What the data actually is

| Property | Value | Source |
|---|---|---|
| **Publisher** | Ajuntament de Barcelona, `Cartografia_AJBCN`. **Not ICGC, not Catastro.** | ✅ portal item owner field |
| **Declared LOD** | **LOD1.** Verbatim: *"El nivell de detall del model és LOD1 … les edificacions es representen com a blocs sòlids amb **teulades planes**, com cubs o paral·lelepípedes i la cota de la teulada és la màxima del volum"* | ✅ item `b0850352…` |
| **Provenance** | Municipal 3D topographic cartography, **extruded** onto the municipal MDS surface model | ✅ same item |
| **Accuracy** | **0.02 m planimetric / 0.025 m altimetric** (inherited from the source linework) | ✅ same item |
| **Update cadence** | *"de forma mensual"* claimed — but the LOD2 service item's `modified` is **2025-06-24**, ~14 months stale | ✅ both |
| **Feature count** | **475,305 volumes** (not buildings) | ✅ `returnCountOnly` |
| **Roof form** | `roofform` 100% populated: Flat 366,194 · Gable 87,586 · Hip 21,525 | ✅ server groupBy |
| **Roof form, USABLE** | **44,485 = 9.4%** (Gable with both `eaveheight` and `roofdir`). Hip with `roofdir` = **0**. Pitched without `eaveheight` = **53,512 = 49.0% of all pitched** | ✅ five cross-tabs |
| **Roof block integrity** | `bldgheight` disagrees with `z_max_vol − z_min_vol` by **>2 m on 195,913 rows (41.2%)**, >5 m on 63,782 | ✅ server-side `ABS()` |
| **Access routes** | (1) `…/Hosted/BCN_3DtoFeat/FeatureServer/**22**` — 2D footprint + attributes, keyless, paginated, `f=json` only (`f=geojson` errors); (2) `…/Hosted/3D_MTM/SceneServer` — I3S 1.9 meshpyramids, keyless; (3) CartoBCN SLPK 552 MB, no HTTP Range | ✅ (1)(2) · ⚠ (3) not re-fetched |
| **CRS** | Services WGS84 `wkid 4326`. Vertical **`EGM96_Geoid`, `vcsWkid 5773`** — orthometric | ✅ layer JSON |
| **Licence** | **UNRESOLVED.** `licenseInfo: ""`, `accessInformation: ""`, `description: ""`, owner `portaladmin` on `Edificis_LOD2`. Geoportal grants CC BY 4.0 **but routes third-party-participated data to CC BY-ND 4.0** and flags a further carve-out for *"geographical information, protected by the Cartographic Act of Catalonia"* | ✅ item + legal notice |
| **Vintage of joined attributes** | Catastro block stamped `ano_ref: 2018` | ⚠ UNVERIFIED here |
| **Coverage** | Municipal limit only — stops dead at L'Hospitalet. Scope-disc coverage: Eixample ~99.7%, Sants ~83%, Poblenou ~82% | ⚠ UNVERIFIED here — **re-measure before any tier retirement** |
| **Mesh content** | SLPK triangles are ~98.6% flat-or-vertical by area | ⚠ UNVERIFIED here (needs the 552 MB pull) |

**Two harvester traps, both hit live today** ✅:
- `resultOffset` is **silently ignored on `groupBy` queries** — offsets 0/2000/4000/6000 returned the *identical* 2,000 groups. Any dissolve-ratio measured by paging groups is wrong.
- `returnDistinctValues=true&returnCountOnly=true` answers **475,305** — the row count, not the distinct count. It gives a confident, wrong all-clear on key uniqueness.

---

## 3. The delta

### Visual gain — real, and it is the whole case
Measured in the **identical bbox** (the height probe's own box, 3.167 km² over the Eixample) ✅:

| | Today (shipped R2 tiles) | Barcelona LOD1 volumes |
|---|---|---|
| Polygons | **5,354** footprints | **38,909** volumes (**7.27×**) |
| Per building | 1 flat prism | ~10.5 flat prisms (Eixample); 5.5 (Gràcia); 5.3 (Poblenou) ✅ |

Those extra prisms are the lift overruns, stair cores, setback terraces and lower courtyard blocks in his screenshot. At the altitude PRYZM's camera actually lands on a site (143–320 m), that is the difference between a city of boxes and a city with relief. **This is the deliverable.**

### Analytical gain — approximately none, and we must not claim one
- **Heights are already solved.** Live re-probe of the shipped tiles at the Eixample today ✅: `verdict: "measured"`, 5,354 footprints, **5,185 measured-lidar (96.8%)**, 143 derived-levels, **25 assumed (0.5%)**, `solidRenderFraction 0.969`, median 24 m. There is no 9 m carpet in Barcelona to remove.
- **Shadows do not improve materially.** The occluder is a prism whose cap already sits at a representative roof height. Adding sub-volumes adds small-area relief that largely cancels over a day.
- **C63 moves zero.** Axis 6 scores `Math.min(1, h.tagged / total)` ✅ — height *provenance*, no roof term, and structurally blind to the `measured-lidar` rung. Axis 7 scores `present_layers / 9` over a fixed checklist ✅ — buildings is already present. C63 §1.3 forbids redefining an axis to make this count.

> ⛔ **A trap for whoever refreshes the record:** Barcelona's committed `heightsLod` block is stale (2026-08-01, `tagged: 503`, `measuredLidar: 0`) ✅. Refreshing it *honestly* scores the axis **lower**, because the scorer cannot see `measuredLidar`. Fix `computeScorecard.mjs:618` and amend C63 §3 Axis 6 **before** anyone measures this lane's before/after — otherwise the ruler is broken.

---

## 4. The three adoption shapes, ranked — plus the one that should win

The brief names three. Measurement disqualifies all three, and points at a fourth.

| # | Shape | Fidelity gained | Effort | R2 cost | Renderer risk | What breaks |
|---|---|---|---|---|---|---|
| **A** | **Attribute-only** — `roofform`/`eaveheight` onto today's footprints | **None visible.** Client has zero roof-shape code path ✅ | S | ~+2 MB | none | Nothing — and nothing gained. Ships a tag no consumer reads. |
| **B** | **Roof-parametric** — extrude gable/hip from the attribute block | Hips undirected (`roofdir` null ×21,525 ✅); 49% of pitched roofs have no eave ✅; `bldgheight` contradicts geometry on 41% ✅ | M | ~+5 MB | med | **§CONTEXT-DATA-HONESTY.** Fabricated roofs on ~22% of the city, drawn at measured-tier confidence. **Refuse.** |
| **C** | **Full mesh (I3S stream or 3D Tiles)** | ~1.4% of surface area is genuinely sloped ⚠ — a mesh carries almost nothing a prism does not | L | 0 (stream) / ~0.5–1.4 GB (bake, UNVERIFIED) | **high** | Geoid (EGM96 vs our EGM2008); coverage hole at the municipal line; no `heightProvenance` rung, so §SOLID-OR-WIREFRAME cannot classify it; C12 §13.3 gives a tileset **one** clipping slot, already spent on the §7 parcel void. |
| **D** ⭐ | **Multi-volume footprints, tiered by radius** — same PMTiles/entity path, `z_max_vol − z_min_vol` as the height, articulated inside a near ring, today's tiles beyond | **The founder's actual ask**, in full | M | ~+5–20 MB | med (budget) | Draw budget, and only the draw budget — which is the one thing we can control. |

### Recommend **D**, and defend it

**Against C (mesh).** The mesh is not carrying roofs — the publisher says LOD1 and flat ✅. Paying for a second render pipeline, a new provenance problem, a geoid correction and an unowned clipping slot to obtain flat-topped prisms we can already draw is the worst trade on the table. Cesium 1.143.0 *does* ship `I3SDataProvider` ✅ and a stream would be near-free — keep that as a **demo spike** (§5), not as the ship.

**Against B (roof-parametric).** Measured, not argued: 44,485 of 475,305 volumes are fully specified ✅. Presenting the other 90.6% as roofs is the exact defect this repo legislates against, and the field block's own height contradicts the geometry it is joined to on 41.2% of rows ✅ — a coherent Esri building record smeared across volume parts of a different granularity.

**Against A (attribute-only).** Zero user-visible change. The bake already writes `roof_type` for NL and 13 German Länder and **no client code reads it** ✅ (zero hits across `apps/editor/src/ui/geospatial/`). Adding a fourth unread producer is the authored-but-unwired pattern, not progress.

**Against doing nothing.** Doing nothing is defensible on data quality and on the scorecard — and indefensible on the one axis the founder named. Barcelona is the key pilot; the picture is the product there.

> ⛔ **And do not "just dissolve the parts."** Measured ✅: REFCAT-dissolved gives ~3,700 polygons in the probe bbox against today's 5,354 — **0.69×**, i.e. *coarser than what we ship now*, while destroying the articulation being bought. The dissolve is not a middle path; it is a downgrade. **Tier by radius, not by dissolve.**

### The budget arithmetic that sets the design (all ✅ measured)

| Radius | Volumes inside | % of `CTX_TOTAL_MAX_BUILDINGS` (14,000) |
|---|---|---|
| 200 m | 1,544 | 11% |
| **300 m** | **3,474** | **25%** |
| 400 m | 6,176 | 44% |
| 600 m | 13,895 | 99% |
| **Default scope square (2,519 m)** | **83,756** | **598% — 2.8× over the 30,000 ceiling** |

Two constraints fall out. The affordable radius for volumes at full budget is **602 m**, which lands almost exactly on the existing `CTX_SHADOW_RADIUS_CEILING_M = 600` ✅ — but spending the whole budget there empties the plate. And `CTX_NEAR_MAX_SHADOW_CASTERS = 1600` ✅ is exhausted at a **204 m** radius, so most volumes must be non-casting.

**Therefore: articulate the innermost ~300 m only** (3,474 volumes ≈ 25% of budget, net add ~+3,000 over the 478 footprints they replace), keep today's tiles from 300 m out, and mark the inner volumes non-shadow-casting except the nearest ring. 300 m is where the camera is.

> ⚠ Barcelona is **already over budget before this lane**: `contextBuildings.ts:384` records Eixample at 7,141 eligible / 54% drawn, **3,445 never drawn** ✅. Any articulation is bought by drawing fewer buildings elsewhere. Say that out loud in the founder review; it is the honest trade.

---

## 5. The cheapest useful increment — landable this week

**A same-origin proxy + a 300 m articulated near ring, read live. No bake, no R2, no publish, no manifest change, no new layer, no licence exposure.**

Why it is licence-safe: CC BY-ND forbids distributing *modified* material. A pass-through proxy serving the city's own service to the browser is not us distributing a derivative — **baking it into `buildings.pmtiles` is.** The streaming route therefore sidesteps the one blocker while the written answer is pending.

1. `server/context-delivery/bcn3dProxy.js` — clone the **existing precedent** `server/jurisdiction/bcnRefosOvProxy.js` ✅, which is already a purpose-built, layer-allowlisted Barcelona ArcGIS seam written for exactly this CSP reason. Allow `FeatureServer/22/query` and nothing else. (`geo.bcn.cat` is **not** in `server/securityHeaders.js` ✅ — same-origin dodges the CSP edit entirely.)
2. Query with `f=json` + `multipatchOption=xyFootprint`, bbox = the inner 300 m. Convert esri `rings` → GeoJSON client-side. **Do not request `f=geojson`** — it returns an error code 400 inside an HTTP 200 body ✅.
3. Height = `z_max_vol − z_min_vol` (relative, therefore **datum-free** — the one safe way to use these numbers). Ignore `baseelev`/`bldgheight` entirely.
4. Render through the existing near-tier `polygon` block (`CesiumViewport.ts:~12313`, `perPositionHeight: false`) with `shadows: DISABLED` beyond 200 m.
5. Add a **new provenance rung** — `'municipal-volume'`. The `never`-assert at `contextBuildings.ts:862` ✅ will force the decision at compile time rather than absorb it silently into `solid`.
6. Render the credit line (see §7). This is the first per-layer credit in 3D and it must ship with the data, not after.

Behind a flag, Barcelona-only. **Days, not weeks.** If the founder likes it, harden to a bake (§7) once the licence answer lands.

---

## 6. Does it generalise?

**Barcelona only, and that is fine — but do not let the lane pretend otherwise.**

- The volumes are the **city's** own topographic cartography ✅ — not ICGC (whose 3D city models are bespoke commissions ⚠) and not Catastro (2D nationally ⚠). No other Spanish city can be assumed to maintain a 0.02 m municipal 3D map.
- Under the **City Replication Standard** this lands on L4/L5 — the two cheapest, lowest-weighted layers. Under C63 it touches HEIGHTS/LOD (10%) and CONTEXT (5%) and **moves neither** (§3).
- **CONTEXT-LOD-BUILD-PLAN §4 §LoD2-NEXT** ✅ already scopes the mesh tier and explicitly sequences it *after* LoD1 real-height ships everywhere, on the four native-LoD2 countries. This lane is a founder-priority **pull-forward** of a deliberately deferred item. Record it as a reversal, not as new scope.
- **What genuinely generalises is different and cheaper:** the bake already emits `roof_type` for NL 3DBAG and 13 German Länder ✅, and **no client reads it** ✅. A parametric roof consumer would light up real LoD2 countries at once. It buys Barcelona nothing (no roof shape to carry) — so it is a *separate* lane, not this one's justification. ⚠ Note it needs a ridge height or pitch, which no tile currently carries; price it as a re-bake, not a render-only change.

**Verdict: a one-off is worth it for the key pilot** — provided it is scoped, flagged and named as a Barcelona special case in the City Replication Standard, so the two-language context (volumes here, prisms everywhere else) is a recorded decision rather than a discovered inconsistency.

---

## 7. Integration points

**Streaming route (§5 — ship first)**
| Step | File / symbol |
|---|---|
| Proxy | new `server/context-delivery/bcn3dProxy.js`, patterned on `server/jurisdiction/bcnRefosOvProxy.js` |
| CSP | `server/securityHeaders.js` — **no edit needed** if same-origin |
| Feature model | `apps/editor/src/ui/geospatial/contextBuildings.ts:1078` `tilesToCollection()` — the properties whitelist; and the `ContextBuildingFeature.properties` interface (~:88) |
| Provenance rung | `contextBuildings.ts:709` `ContextHeightProvenance` union → add `'municipal-volume'`; `:847` `contextHeightRenderTier()`; `:862` `const unclassified: never` forces the call |
| Budget | `apps/editor/src/ui/geospatial/contextExtentBudget.ts` — `CTX_TOTAL_MAX_BUILDINGS` :837, `_CEILING` :901, `CTX_NEAR_MAX_SHADOW_CASTERS` :807, `CTX_SHADOW_RADIUS_CEILING_M` :397 (⚠ marked **COUPLED CONSTANT** with `shadowMap.maximumDistance` — do not move one alone) |
| Render | `CesiumViewport.ts` near-tier `polygon` block (~:12313). A pitched-roof builder **already exists** at `:7422` (`pryzm-forma-roof-face`, `perPositionHeight: true`) ✅ if roofs are ever revisited |

**Baked route (only after a written licence)**
| Step | File / symbol |
|---|---|
| Harvest | `tools/context-bake/footprints/euRegisters.mjs` — **already an ArcGIS door** (`EU_DOOR_KINDS` includes `'arcgis'`, three live registrations). ⚠ It requests `&f=geojson` and returns `status:'error'` on ESRI-JSON (`§ESRI-JSON-IS-NOT-AN-EMPTY-PAGE`); layer 22 cannot answer geojson, so an `f=json` branch + rings→GeoJSON converter is required |
| Dispatch | `tools/context-bake/bake.mjs:1872` `applyNationalFootprints()` → `FOOTPRINT_SOURCES[r.footprintSource]`. ⛔ **`spain` already declares `footprintSource:'es_catastro'` and exactly one spec resolves per region** — `footprintSource` must become a list, or Barcelona a precedence rule inside the Catastro path |
| Bake CI | `.github/workflows/context-bake.yml` — `region=spain, stage=true`. ⚠ `footprints=official` arms the Córdoba named-building assertion and the §MEASURED-HEIGHT-GATE (`ciudadreal`, `toledo`); a Barcelona change cannot be dispatched without the whole national sweep passing |
| Merge/publish | `.github/workflows/context-merge-publish.yml` → `merge-tiles.mjs merge --expect all --layer buildings --live-manifest`. ⛔ **`--expect spain` would delete 48 live regions** (`merge-tiles.mjs:695`) |
| Manifest | `merge-tiles.mjs` `cmdMerge` writes `tileset-manifest.json`; read by `apps/editor/src/ui/geospatial/contextTilesetManifest.ts`. **No manifest edit is needed if this rides the existing `buildings` layer** — which is a strong argument against a new layer (no region has ever successfully staged an eighth ⚠) |
| Cache stamp | `contextTiles.ts:493` `CONTEXT_TILESET_VERSION` — bump **once, after** the last layer publishes and bytes are verified from the public host |

**Attribution (blocking, and it is new surface)**
- Zero `Cesium.Credit` registrations exist repo-wide ✅; `check-geodata-attribution.ts`, named as a hard-fail gate by C55 §1.5, **does not exist in the tree** ✅. So our ODbL OSM/Overture context is *already* uncredited in 3D (L-762).
- Build a **per-layer, region-keyed credit mechanism once** — it discharges Barcelona, the ODbL debt and the Overture follow-up together. Anchor: `apps/editor/src/ui/styles/attributionCredits.ts`. Mint the gate in the same PR.
- Line to render: `Buildings © Ajuntament de Barcelona (CartoBCN) — updated <date>, modified by PRYZM`. The update date and the "modified" flag are **licence obligations**, not decoration. Never imply the city endorses PRYZM.

---

## 8. Risks and unknowns

**Blocking**
1. **LICENCE — the ND branch.** ✅ Verbatim: *"for types of data where there is participation by third parties, the reuse is governed by the Attribution-No Derivatives 4.0 International licence (CC BY-ND 4.0)"*, plus a further carve-out for *"geographical information, protected by the Cartographic Act of Catalonia"*. The dataset carries joined Catastro attributes, so third-party participation is the likely reading. `Edificis_LOD2` returns `licenseInfo: ""`, owner `portaladmin`, empty description ✅ — its own web scene is named `LOD2_perpublicar` ("to-be-published"). Email `cartografia@bcn.cat` with a **yes/no question**: *is `Edificis_LOD2` CC BY 4.0, or ND?* ⛔ Do not wait on it — the repo's precedent for an unlicensed LoD2 source is **mark it blocked and keep moving** (Bavaria/ZSHH). Ship the streaming route meanwhile.
2. **DRAW BUDGET.** 83,756 volumes in one default scope ✅ = 6.0× over. Barcelona already draws only 54% of its footprints ✅. Unbounded adoption empties the plate to buy rooftop detail on a handful of near blocks — a regression dressed as an upgrade. Mitigated by the 300 m ring; **must be verified at the rendered pixel, not the feature count.**

**High**
3. **GEOID.** Service is `EGM96_Geoid` / `vcsWkid 5773` ✅; our terrain lifts with EGM2008 — and `terrain.mjs` records Spain's `geoidSepM` pinned at **51.0 (Madrid)** while **Barcelona measures 49.79** ✅, i.e. our terrain is already 1.21 m off (L-12975, open). Using relative `z_max−z_min` avoids this entirely. **Never use `baseelev` or `z_min_vol` as a ground elevation without an explicit lift.** Probe before fixing — the failure mode is a city buried 50 m under the terrain (L-466's shape).
4. **COVERAGE STOPS AT THE MUNICIPAL LINE.** ⚠ Reported at Sants ~83%, Poblenou ~82% of a default disc — that shortfall is L'Hospitalet, real buildings with no data. **Never retire the prism tiers**; the two sources must coexist and be masked at the administrative boundary. Re-measure this before any tier change.
5. **`rmse` is not an error metric.** It tracks `baseelev + bldgheight` — an absolute roof elevation. Filtering on "low rmse = high quality" would silently keep the seafront and discard the hills.

**Medium**
6. **No frame time exists anywhere.** Every figure in this plan is a *count*. `contextExtentBudget.ts` confesses the same about its own budget. A 300 m ring must be validated with a real browser run on the founder's machine.
7. **Third-party runtime dependency.** Streaming puts a pilot demo on a municipal IIS host with no SLA, whose service has not refreshed since **2025-06-24** ✅ despite a monthly-update claim. Acceptable behind a flag; not acceptable as the durable answer.
8. **`tippecanoe --drop-densest-as-needed`** on the baked route at 7.27× density is the L-579 "buildings not rendering" mechanism aimed at the pilot city. Bake and probe pre- and post-tippecanoe; do not reason about it.
9. **C63 Axis 6 can move the *wrong* way** if volumes replace footprints in the bake — the MDS raster stamp samples per footprint, and ~7× smaller polygons may lower the hit rate below the §MEASURED-HEIGHT-GATE floor.

**Unknowns — named, not papered over**
- Whether the SLPK and the live services are the **same vintage** (SLPK root reports 48 children, the service 49) ⚠. Not re-checked; the host ignores HTTP Range, so no cheap spot-check exists.
- `descarregues.icgc.cat` returned **403** to an earlier probe and was never retried with a browser-shaped session ⚠. Given this repo's nine-of-fourteen wrong-product refusal history, **do not harden "ICGC has no buildings" into doctrine** until someone opens it properly.
- Whether **CartoBCN product 118** — `MTM_GPKG_alçades.zip`, a heights-and-buildings GeoPackage, **verified live today at 126,289,364 bytes, keyless, CORS-open** ✅ — carries a per-building height. It is *catalogued* (therefore plausibly licence-clean, unlike the service) and drops straight into the existing vector bake. **One download settles it, and it may be a better durable source than the FeatureServer.** Do this before committing to the baked route.
- Whether product 145's zip ships a **per-product conditions document** ⚠ — the conditions page says affected products carry one. That may answer the licence question in an afternoon, with no email.
- `TIPUS_POL`'s value domain ⚠ — plausibly distinguishes main body from lift overrun from stair core, which would let us *style* rooftop plant rather than just draw it. Not enumerable from the SceneServer.
- Whether the founder's screenshot renders the city layer or Esri's own `OpenStreetMap3D_Buildings_v1`, which the same web scene also loads ⚠. Cheap to settle by toggling; it does not change the recommendation.