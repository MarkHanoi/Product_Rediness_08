# Spain — Buildings / LOD / Height (context layer)

> Part of the 3D-Context-Data country study (`../../CONTEXT-DATA-COUNTRY-STUDY.md`, umbrella **L-511**;
> deep-dive **L-512**). Height methods split into `../SPAIN-HEIGHT-MEASUREMENT.md`.
> Endpoints live-probed 2026-07-21 unless marked otherwise.

## Footprint + parcel — Catastro (authoritative, already in the zoning pipeline)
- **BU (Building)** + **BuildingPart** + **CP (cadastral parcel)** — pull all three per request.
  CP carries `refcat` + parcel area + admin use (already reliable; no upgrade needed).
- Access: **WFS** (`ovc.catastro.meh.es/INSPIRE/wfsBU.aspx`, live 200) for on-demand bbox lookups
  (extent/feature-count limited); **ATOM** per-municipality feeds for bulk city/region ingest.
- Coverage ~95%. **Pais Vasco (Bizkaia/Gipuzkoa/Araba) + Navarra run SEPARATE cadastres**
  (`CatastroEus` / `CatastroNav`) — distinct ATOM/WFS URLs, NOT covered by the main DGC service.
  See `../regions/pais-vasco-separate-cadastre/`, `../regions/navarra-separate-cadastre/`.

## Floor count — real, from Catastro `BuildingPart`
- **`ALTURAS`** = floors ABOVE ground (+ a parallel below-ground count for basements/parking).
- Also: year built + year renovated (separate), structural flags (lift/heating/free-height).
- **Raw FXCC `CONSTRU` field** (only if touching the cadastral-cartography shapefile, not INSPIRE GML)
  encodes floor composition as signed Roman numerals, e.g. `-II+IV+TZA` = 2 basements + 4 above-grade
  + rooftop terrace. More expressive than `ALTURAS` (captures terraces/porches/mixed-height parts) but
  needs a parser — build only for high-value sites needing terrace-vs-floor massing/shadow accuracy.

> **Terrain DTM = byproduct of this same PNOA class-2 pull** — the bare-ground (class-2) returns
> rasterized here for the nDSM's `DTM` half ARE the terrain-draping surface (roads/water/parks/site
> grading). No new ES sourcing; see `../../CONTEXT-DATA-TERRAIN.md` (L-522).

## Height — a HYBRID, never a single "REAL" (the core L-512 finding)
Catastro's OWN 3D viewer states its heights are estimated: every floor is flat-extruded at 3 m
("extrusion de cada planta a 3 metros"). That is the **same category of estimate as OSM
`building:levels`**, just from an authoritative floor count. It systematically **under**-states height
on ambitious buildings (Benidorm towers measured ~3.6 m/floor). So carry THREE provenance fields:
- **`floor_count`** (Catastro `ALTURAS`) — REAL as a *count*, not a measured height.
- **`measured_height_m`** — from **LiDAR nDSM 90th-percentile** under the footprint (see
  `../SPAIN-HEIGHT-MEASUREMENT.md`), tagged with which PNOA/ICGC coverage cycle produced it.
- **`height_confidence`** — from (a) agreement of `floor_count x ~3-3.2 m` vs `measured_height_m`, and
  (b) LiDAR point count inside the footprint (few points -> downgrade; don't report a percentile of 3 pts).
Cross-check: if the two disagree by >~1 floor, FLAG for review (LiDAR misclass = overhanging tree; or
Catastro lag = unregistered rooftop addition) — don't silently pick one.

## Roof shape / LOD — the honest gap
**No nationwide Spanish LOD2 exists.** The best regional layer, **ICGC's Catalonia 3D building model**
(Barcelona's 18k-volume showcase), is explicitly **LOD1**: flat-top block extrusion, no roof shape.
1. **Cheap, highest value/effort:** flat extrusions driven by LiDAR nDSM height (correct ridge height,
   no roof shape). <- the Spain baseline.
2. **Higher fidelity (stretch, Barcelona-first):** self-run roof-plane segmentation (RANSAC) on
   classified LiDAR building points — the 3DBAG technique, not pre-built for Spain; viable now for
   Barcelona given ICGC's dense new 3rd LiDAR coverage. **Badge "reconstructed", NOT "official"**
   (distinct from how NL/DK/CH native LOD2 is badged).

## Gate — buildings/height
| Q | Verdict | Evidence |
|---|---|---|
| Real footprint? | **YES** | Catastro BU/BuildingPart/CP, WFS live |
| Real height? | **YES (hybrid)** | floor_count (Catastro) + measured nDSM (LiDAR); neither alone |
| Real roof shape? | **NO (self-reconstruct only)** | no LOD2 in ES; ICGC Catalonia is LOD1 |
| Coverage gaps | Pais Vasco/Navarra separate cadastres; PNOA vintage varies per tile (2009-2025) |
