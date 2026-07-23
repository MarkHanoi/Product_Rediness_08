# Spain — Deep-Dive: 3D Context Data Sourcing

Scope: context buildings + true roof/LOD detail, building heights, parcel geometry, trees, water, pedestrian infrastructure, and roads — Spain only, with real endpoints, real attribute schemas, and the honest limitations of each.

---

## 1. Building Footprints & Parcels (Catastro) — what you already have, made explicit

**Source:** Dirección General del Catastro (DGC), via its INSPIRE-compliant services.

**Two access methods, different purposes:**
- **WFS** (`ovc.catastro.meh.es/INSPIRE/wfsBU.aspx` for buildings, equivalent endpoint for parcels/`CP` cadastral parcels) — live queries by bounding box, good for on-demand site lookups, but has extent/feature-count limits, not meant for bulk pulls.
- **ATOM feed** — per-municipality bulk downloads, the right choice when ingesting a whole city/region at once. This is almost certainly what your Barcelona pipeline already uses.

**Coverage:** ~95% of Spanish territory. The Basque Country (Bizkaia, Gipuzkoa, Araba) and Navarre run their **own separate cadastral offices** with parallel but distinct INSPIRE services (`CatastroEus`, `CatastroNav` in the open-source tooling) — if Pryzm ever needs Bilbao, San Sebastián, or Pamplona, these are separate endpoints with separate ATOM/WFS URLs, not covered by the main DGC service.

**Parcel-level data (your "sound" layer):** the cadastral parcel (`CP`) geometry includes the official `refcat` (cadastral reference), parcel area, and administrative use classification. This is authoritative and already reliable — no upgrade needed here beyond making sure you're pulling `CP` alongside `BU` (buildings) and `BuildingPart` on every request.

---

## 2. Building Heights — the real schema, and its real limitation

This is the layer worth understanding in the most detail, because Catastro *does* carry height-relevant attributes, but they are administrative declarations, not survey measurements — and Catastro's own documentation says so.

### What the `BuildingPart` object actually contains
Per the DGC's own data model glossary (`Modelo de Datos Catastral`), each `BuildingPart` — a sub-element of a building, since a single building can have several parts with different heights — carries:
- **`ALTURAS`** — number of floors **above** ground level.
- A parallel field for floors **below** ground level (basements/underground parking).
- **Year built** and **year renovated**, separately.
- Flags for structural attributes (elevator present, heating present, free-height floors, etc.) that don't affect geometry but can inform interior BIM inference later.

### The FXCC raw encoding (if you ever touch the raw cadastral cartography shapefile instead of the INSPIRE GML)
The older cadastral cartography format encodes floor composition per building part using Roman numerals and sign prefixes in a single field (`CONSTRU`), e.g. `-II+IV+TZA` means: 2 basement floors, 4 floors above grade, plus a rooftop terrace (`TZA`). This is more expressive than the INSPIRE `ALTURAS` field alone (it captures terraces, porches, and mixed-height parts within one building) but requires a parser — worth building only if you need finer granularity than "N floors" for specific high-value sites (e.g. distinguishing a terrace level from a full floor for massing/shadow accuracy).

### The honest limitation — and why it matters for your height pipeline
Catastro's **own official 3D viewer** states outright that building heights it displays are estimated: *"Las alturas de los edificios son estimadas, ya que se ha hecho una extrusión de cada planta a 3 metros"* — i.e., every floor is extruded at a flat 3 meters regardless of actual floor-to-floor height. This is the same category of estimate as OSM's `building:levels` tag, just from an authoritative source instead of a crowd-sourced one — it's more *trustworthy* (real floor count, not guessed) but not more *accurate* in absolute meters. A field study on Benidorm's high-rises found actual average floor heights noticeably above 3m in buildings competing for height/prestige (their tallest sampled tower averages closer to 3.6m/floor), meaning the flat-3m assumption systematically **under**-states height on architecturally ambitious buildings — worth flagging in your own badge logic ("real floor count, estimated floor height") rather than treating Catastro height as fully "REAL."

### The actual fix: real height via LiDAR nDSM, keyed to Catastro's real floor count as a cross-check
1. Take the Catastro footprint + real `ALTURAS` floor count (trustworthy for topology/floor count).
2. Independently compute height from **PNOA LiDAR** (see §5) via nDSM (DSM − DTM) sampled under the footprint.
3. Where the two disagree by more than ~1 floor's worth of height, flag for review rather than silently picking one — this catches both LiDAR misclassification (trees overhanging a low building) and Catastro data lag (a rooftop addition not yet registered).
4. Store both provenance types distinctly: `real_floor_count` (Catastro) vs. `measured_height_m` (LiDAR), rather than collapsing them into one "REAL" badge — this is a more honest granularity than what your zoning badge currently does, and it's a small change to your existing "Why these numbers?" panel pattern.

---

## 3. True LOD2 (roof geometry) — the honest gap

**There is no nationwide Spanish LOD2 CityGML product**, unlike the Netherlands (3DBAG), Denmark (Danmark i 3D), Switzerland (swissBUILDINGS3D), or Germany (state LOD2). The closest regional equivalent — **ICGC's Catalonia-wide 3D building layer** — is explicitly published at **LOD1** only ("nivell de detall bàsic, LOD1": flat-topped block extrusion, no roof shape), built from the 1:5,000 topographic base plus a national terrain model. Barcelona's own showcase 3D model (18,000+ volumes, colored by height) is this same LOD1 dataset, not a roof-modeled LOD2.

**Practical implication:** for real pitched/hipped/gabled roofs in Spain, you have two options, in order of effort:
1. **Cheap**: keep flat-topped extrusions (current OSM-equivalent quality) but drive the extrusion height from LiDAR nDSM instead of OSM tags or Catastro's flat 3m/floor — this alone is a meaningful visual and analytical upgrade (correct ridge height, even without roof shape) and is the highest-value-per-effort fix available for Spain.
2. **Higher-fidelity**: run your own roof-plane segmentation (RANSAC or similar plane-fitting) on the classified building points within the LiDAR cloud, to reconstruct actual roof shape — this is exactly the technique the Netherlands' 3DBAG pipeline uses, just not pre-built for you in Spain. Worth prioritizing for Barcelona specifically given ICGC's newly-completed **3rd LiDAR coverage**, which has meaningfully higher point density than the first two national PNOA coverages (see §5) — dense enough to make roof-plane fitting viable at building scale, not just terrain scale.

---

## 4. LiDAR / Terrain — two independent sources to combine

| Source | Coverage | Density | Format | License |
|---|---|---|---|---|
| **PNOA-LiDAR** (IGN/CNIG, national) | All of Spain, 3 coverages: 2009–2015, 2015–2021, 2022–2025 (3rd cycle rolling out) | ~0.5 pt/m² (1st cycle) → ~1 pt/m² (2nd) → higher density (3rd, in progress) | Classified LAZ point cloud; derived DTM/DSM GeoTIFF at 2m/5m/25m grids | Free, CC BY 4.0 |
| **ICGC LiDAR** (Catalonia only, regional) | Catalonia | 3rd coverage just completed, "grau de detall molt superior" (much higher detail) per ICGC's own announcement — used for DTM, DSM, and separate DTMv (terrain+vegetation) / DTMe (terrain+buildings) products | LAZ + derived rasters | Free, downloadable via ICGC | 

**Implementation note:** for Barcelona and Catalonia generally, prefer ICGC's regional LiDAR over PNOA where both exist — it's the more current, denser capture, and ICGC already derives separate vegetation-height and building-height composite rasters, which saves you the DSM-classification step. For the rest of Spain, PNOA's most recent available coverage per tile is your baseline; always check tile-level acquisition date since coverage was flown incrementally over more than a decade, so a "current" PNOA tile in one region might be a "2010" tile in another.

---

## 5. Trees

**No national tree dataset exists** (consistent with the rest of Europe), but Barcelona is a genuine, well-built exception worth using directly rather than falling back to procedural placement:

**Ajuntament de Barcelona — Open Data BCN** publishes three **complementary, geolocated, per-tree** datasets:
- **Arbrat viari** (street trees — trees in individual tree-pits along streets): 170,000+ records.
- **Arbrat de zona** (trees in non-park green zones/traffic islands).
- **Arbrat dels parcs** (trees within parks).

Each record includes precise coordinates, species (common + scientific name), and district/neighborhood codes. Updated **quarterly**, available in CSV/JSON/KML/SHP (note: RDF/XML/KML formats were discontinued from the dataset in March 2021 in favor of a cleaner JSON+CSV structure — if you have old integration code referencing the old formats, it needs updating).

**Recommended pattern:** treat this as a city-specific Tier-A tree source (real, geolocated, species-typed) for Barcelona specifically, and fall back to procedural placement along OSM/BTN25 street and park polygons everywhere else in Spain — check whether Madrid, Valencia, and other major Spanish cities publish an equivalent open dataset (many large Spanish city councils run comparable "árbol viario" open-data catalogs; verify per-city before assuming absence, since coverage of this pattern is growing).

---

## 6. Water

**BTN25** (Base Topográfica Nacional, 1:25,000, IGN) carries a dedicated hydrography theme, and there's also a purpose-built **IGR Hidrografía** (Información Geográfica de Referencia — Hidrografía) layer that adds Pfafstetter river classification codes (a standardized international river-basin hierarchy) on top of the raw geometry, plus basin/sub-basin polygons from the Ministry for Ecological Transition (MITECO) at 100m/25m grid resolution. Both are:
- **Access:** WFS, ATOM, or the CNIG download center.
- **License:** free and open — Spain's IGN data was made fully open/free by ministerial order (Orden FOM/2807/2015), covering BTN25/BTN100, the national hydrography and transport reference layers, and PNOA outputs.

This is a genuine upgrade over OSM water polygons: authoritative bank lines, correct classification of natural vs. artificial watercourses, and basin-level context if you ever want catchment/flood-adjacent context layers.

---

## 7. Roads & Pedestrian Infrastructure

Two complementary national datasets, both free under the same 2015 open-data order:

- **BTN25 "Redes de Transporte"** — 88 thematic layers total across the whole BTN25 product, with a dedicated transport-network theme covering interurban roads (with kilometer-post reference points), urban streets, paths/tracks, rail, waterways, and air/cable transport, plus intermodal connections. This is closer to a proper object-level topographic base than OSM, though generalized at 1:25,000 (fine for site-context massing studies; less fine than the Netherlands' BGT for surveying individual paving/sidewalk polygons).
- **CartoCiudad** (IGN, in partnership with Spain's National Statistics Institute and local councils) — purpose-built for **urban** street networks and addressing: precise street centerlines, and critically, **"portales"** — building entrance points at the parcel edge. This is your best available source for pedestrian entry points into buildings, which is the specific pedestrian-infrastructure detail that's hardest to get from OSM (OSM tags entrances inconsistently).

**Practical read:** BTN25 gives you the road network and classification; CartoCiudad gives you the urban addressing/entrance-point layer that ties pedestrian access to specific buildings — combine both rather than picking one, since they serve different purposes (network vs. access-point detail).

---

## 8. Parks / Green Space

BTN25 includes explicit thematic layers for **zonas verdes** (green zones), **instalaciones deportivas** (sports facilities), and **instalaciones recreativas** (recreational facilities) as part of its 88-layer structure — these are surveyed polygons, not OSM-style crowd-digitized boundaries, and they distinguish facility types (sports vs. general green vs. recreational) that OSM's `leisure=*` tagging often blurs together.

---

## 9. Recommended Spain-Specific Pipeline

```
Footprint + parcel:     Catastro WFS/ATOM (BU + BuildingPart + CP)
                         → Basque Country / Navarre: separate CatastroEus / CatastroNav endpoints

Floor count (real):     Catastro BuildingPart.ALTURAS (+ below-grade count, year built/renovated)

Height (measured):      PNOA LiDAR nDSM (national) / ICGC LiDAR nDSM (Catalonia — prefer this regionally)
                         → cross-check against floor count × assumed floor height; flag disagreements

Roof shape:              flat extrusion at measured height (baseline, all of Spain)
                         → roof-plane segmentation from classified LiDAR points (stretch goal, prioritize Barcelona
                           given ICGC's new high-density 3rd coverage)

Roads:                   BTN25 "Redes de Transporte" (network) + CartoCiudad (urban entrances/addressing)

Water:                   BTN25 hydrography + IGR Hidrografía (Pfafstetter-coded)

Parks/green:             BTN25 zonas verdes / instalaciones deportivas / instalaciones recreativas

Trees:                   Barcelona: Arbrat viari + de zona + dels parcs (real, per-tree, quarterly updated)
                         Elsewhere: check for municipal equivalent; else procedural placement along
                         street/park polygons from BTN25/OSM
```

---

## 10. Known Gaps / Caveats to Badge Honestly

- **Height is a hybrid, not a single "REAL" source** — real floor count (Catastro) plus measured height (LiDAR) is more honest than either alone; don't collapse to one badge.
- **No true LOD2 exists anywhere in Spain today** — anything showing pitched/hipped roofs will be *your* reconstruction from LiDAR, not a government-supplied roof model; badge it as "reconstructed" rather than "official," distinct from how you'd badge NL/DK/CH data.
- **Basque Country and Navarre are separate systems** — don't assume the main Catastro endpoint silently covers Bilbao/San Sebastián/Pamplona; route these three regions to their own cadastral services.
- **PNOA tile currency varies by region** — always check acquisition date per tile; "3rd coverage" isn't uniformly available everywhere yet.
- **Tree data is a Barcelona-specific bonus, not a national capability** — verify per-city before assuming another Spanish city has the same open dataset.



# Spain — Real Building Height: Measurement Methods, Accuracy, and Implementation

**The problem restated:** Catastro's `ALTURAS` field gives you a real, trustworthy *floor count* — but Catastro's own 3D viewer admits it turns that into a height by extruding every floor at a flat 3m, which is an administrative approximation, not a measurement. To get an actual measured height per building, you need an independent geometric measurement — either from airborne LiDAR (ground-based/aerial capture) or from satellite. This document goes deep on both, with real accuracy numbers, and gives you the concrete computation method to implement.

**Bottom line up front:** for Spain specifically, airborne LiDAR (PNOA/ICGC) is the right primary source — it already covers 100% of the country, is free, and is now accurate to under 10cm RMSE on its newest coverage. Satellite-based height methods (SAR tomography, stereo-photogrammetry, spaceborne LiDAR) are real and worth knowing about, but every one of them is currently less accurate than Spain's own airborne LiDAR — so they belong in your pipeline as a secondary cross-check or as a fallback for markets/tiles where no airborne LiDAR exists, not as Spain's primary height source.

---

## 1. Airborne LiDAR (the right primary method for Spain)

### 1.1 What "DSM minus DTM" actually means
Every LiDAR pulse can reflect multiple times as it passes through a scene — first returns tend to hit the highest surface (roof, treetop), last returns tend to reach the ground. Two rasters are built from the classified point cloud:
- **DTM (Digital Terrain Model)** — built from points classified as bare ground only (ASPRS class 2). Represents the terrain surface with buildings and vegetation removed.
- **DSM (Digital Surface Model)** — built from all first-return / highest points, representing whatever is physically on top: roofs, tree canopy, ground where nothing else is there.
- **nDSM (normalized DSM)** = DSM − DTM. At any given (x,y), this gives you the height of whatever's there **above the ground**, which for a building footprint is the building's height.

### 1.2 The specific statistic to use per building — this matters more than people expect
Once you clip the nDSM raster (or the raw classified points) to a building's footprint polygon, you need a single height value. Published building-reconstruction literature is consistent on this:
- **Maximum** height is the most intuitive choice but is the *wrong* one to use alone — it's highly susceptible to antennas, chimneys, HVAC units, and lift-overrun structures on the roof, which inflates the "building height" above what an architect would call the roofline.
- **Mean/median** is more stable but can *underestimate* on buildings with sloped or complex roofs, and is sensitive to point-density thinning near footprint edges (where LiDAR coverage is naturally sparser).
- **The 90th (or 95th) percentile of nDSM values within the footprint** is the standard used in current building-reconstruction research — it reflects the height that the large majority of the roof surface sits at, without being pulled up by a single antenna spike or pulled down by a few stray edge points. Use this as your default; keep the raw max separately in case you want to model rooftop equipment as a distinct, thinner volume later.

### 1.3 What accuracy you're actually working with — PNOA's own published specs
| Coverage | Years | Point density | Vertical accuracy (RMSE Z) |
|---|---|---|---|
| 1st coverage | 2009–2015 | 0.5 pt/m² | ≤ 40 cm (spec minimum), ~20 cm average achieved |
| 2nd coverage | 2015–2021 | 0.5–4 pt/m² | ≤ 20 cm |
| 3rd coverage | 2022–2025 (rolling out; Catalonia flown first in 2022, Aragón/Extremadura/Cantabria/Canarias completed 2023) | 5 pt/m² | ≤ 10 cm |

This means: **the same nDSM technique gives meaningfully different real-world accuracy depending on which PNOA coverage cycle covers your specific tile.** A site in a region still only covered by the 1st coverage cycle inherits a ~20–40cm RMSE Z budget; a site in a 3rd-coverage region inherits under 10cm. Practically: always record which coverage cycle produced the height you're displaying, the same way you'd badge a data-source provenance — a "measured height" badge on a 1st-coverage tile and a "measured height" badge on a 3rd-coverage tile represent meaningfully different confidence, even though both are legitimately "REAL" rather than "ESTIMATED."

**Catalonia-specific note:** ICGC's own regional LiDAR (separate from PNOA, though coordinated with it) has already completed its 3rd coverage with, per ICGC's own description, "a much higher level of detail" than its prior two coverages — for Barcelona specifically, prefer ICGC's own point cloud over PNOA's, since it's both newer and denser.

### 1.4 Concrete implementation pipeline
```
1. Identify which PNOA (or ICGC, for Catalonia) tile(s) intersect the project bbox.
   Tiles are distributed as 2×2 km LAZ files — a typical single-building site needs only 1 tile.

2. Download the classified LAZ tile(s) from centrodedescargas.cnig.es (or ICGC's download portal).

3. Filter by ASPRS classification:
   - class 2 (ground)              → rasterize → DTM
   - class 6 (building), or        → rasterize (max/first-return per cell) → DSM
     all first-return points if building class is unreliable in a given tile

4. Compute nDSM = DSM − DTM (simple raster subtraction, e.g. via GDAL: gdal_calc.py -A dsm.tif -B dtm.tif --calc="A-B").

5. For each Catastro building footprint polygon:
   - Clip nDSM raster (or raw point subset) to the polygon.
   - Compute the 90th (or 95th) percentile of values within the clip → this is your measured height.
   - Also store max (for rooftop-equipment modeling later) and point count (for confidence — a footprint with very few LiDAR points inside it, common on small or narrow buildings, deserves a lower confidence flag).

6. Cross-check against Catastro's own ALTURAS × assumed floor height (~3–3.2m per floor).
   - If the two agree within roughly one floor's worth of height, keep the LiDAR-measured value as your "REAL — measured" height.
   - If they disagree by more, flag for manual review before trusting either value — disagreement usually means either a LiDAR misclassification (e.g., an overhanging tree miscounted as roof) or a genuine Catastro data lag (an unregistered rooftop addition, a recently built extra floor).
```

**Tooling:** this entire pipeline is standard geospatial tooling, no exotic dependencies — PDAL or laspy (Python) for point cloud filtering/classification handling, GDAL for the raster subtraction and zonal-statistics step, and you already have the Catastro footprint polygons from your existing ingestion. None of this requires machine learning; it's a straightforward, deterministic geometric computation, which also makes it easy to audit and re-run when a newer LiDAR coverage becomes available for a given tile.

---

## 2. Satellite-Based Height Methods (secondary/fallback — not primary for Spain)

These are real, published techniques, and worth understanding since your original question specifically asked about satellite-vs-ground computation. None currently beats airborne LiDAR's accuracy for Spain, but each has a role as a cross-check or as a fallback for markets without airborne LiDAR coverage.

### 2.1 SAR Tomography (TanDEM-X)
Uses multiple bistatic radar interferometry acquisitions from the German TanDEM-X satellite pair to reconstruct building height via tomographic inversion (recovering the vertical structure of radar backscatter at each ground location). A published city-scale validation against LiDAR ground truth (Munich, ~36,000 buildings) found:
- **38.7%** of buildings within 1m of LiDAR-measured height.
- **62.8%** within 2m.
- Overall standard deviation ≈ **2m** (after excluding clear demolition/construction mismatches between the two acquisition dates).

This is genuinely useful at country or continental scale where no airborne LiDAR exists, but a ~2m-level uncertainty is coarse for architectural site-context use — it would blur a 1-floor difference, which matters for massing/shadow studies. Relevant to Pryzm only for markets outside your airborne-LiDAR-covered countries, not for Spain.

### 2.2 Optical stereo-photogrammetry from very-high-resolution satellites (e.g., China's GF-7, or commercial Pléiades/WorldView-class imagery)
Building height is derived by generating a photogrammetric DSM from stereo satellite image pairs, then subtracting a terrain model — the same DSM−DTM logic as LiDAR, just with the DSM sourced from image correlation instead of a laser. A recent published method (rural China, validated against ICESat-2 spaceborne LiDAR as ground truth) achieved:
- **RMSE 2.13m, MAE 1.81m**, R² 0.83.

Again, meaningfully coarser than airborne LiDAR, and mainly relevant where no airborne LiDAR exists at all — this is the realistic fallback tier for a country with no national LiDAR program, not something to prefer over PNOA in Spain.

### 2.3 Global coarse-resolution satellite DEMs (Copernicus DEM GLO-30, SRTM)
These give terrain/surface elevation at 30m (or 12–24m for higher Copernicus tiers) grid resolution — far coarser than a typical building footprint. They're useful for regional terrain context (the same DTM role PNOA's own derived rasters already serve, just globally rather than Spain-specifically) but **not usable for individual building height** — a typical urban building footprint is smaller than a single pixel at this resolution, so there's nothing meaningful to extract per-building.

### 2.4 Spaceborne LiDAR (ICESat-2)
NASA's ICESat-2 does carry an actual laser altimeter, giving genuinely LiDAR-grade vertical precision — but only along narrow ground-tracks spaced tens of kilometers apart, not area coverage. It's used in research as an independent validation reference (as in the GF-7 study above) rather than as a direct per-building height source, since most buildings simply never fall under a ground-track.

---

## 3. Summary Table — Method Comparison for Spain

| Method | Type | Typical accuracy | Coverage in Spain | Recommendation |
|---|---|---|---|---|
| **PNOA/ICGC airborne LiDAR nDSM (90th percentile)** | Ground/aerial | 10–40cm RMSE Z depending on coverage cycle | 100% (varies by coverage cycle per region) | **Primary method — use this** |
| Catastro `ALTURAS` × assumed 3–3.2m/floor | Administrative | Systematic, floor-height-dependent (real cases show up to ~3.6m/floor on some buildings) | 95% (excl. Basque Country/Navarre, which have parallel data) | Cross-check only, not standalone height source |
| TanDEM-X SAR tomography | Satellite (radar) | ~2m std dev, ~63% of buildings within 2m | Global | Not needed in Spain (LiDAR is better); relevant elsewhere |
| Stereo-photogrammetry (VHR satellite + DL) | Satellite (optical) | ~2.1m RMSE | Global (imagery-dependent) | Not needed in Spain; fallback for non-LiDAR markets |
| Copernicus GLO-30 / SRTM | Satellite (radar-derived global DEM) | 30m grid — too coarse per-building | Global | Terrain context only, not building height |
| ICESat-2 | Satellite (laser altimeter) | LiDAR-grade, but sparse ground-tracks only | Global, sparse | Validation reference only |

---

## 4. What to actually badge in Pryzm

Given the above, a building height in Spain should carry three distinct pieces of provenance rather than one flat "REAL"/"ESTIMATED" toggle:
1. **`floor_count`** — from Catastro `ALTURAS`, real and trustworthy as a count.
2. **`measured_height_m`** — from PNOA/ICGC nDSM 90th-percentile computation, tagged with which LiDAR coverage cycle produced it (since accuracy genuinely differs by cycle/region).
3. **`height_confidence`** — derived from (a) how well `floor_count × assumed floor height` agrees with `measured_height_m`, and (b) how many LiDAR points fell inside the footprint (sparse point count on small buildings should downgrade confidence rather than silently reporting a percentile computed from 3 points).

This is more honest and more useful to end users than a single "real vs. estimated" flag, and it directly answers what you asked for: yes, ground/aerial LiDAR is the right "satellite-style" computed height for Spain, satellite methods are real but currently coarser, and the accuracy of even the LiDAR-measured number depends on which PNOA coverage cycle you're standing on.