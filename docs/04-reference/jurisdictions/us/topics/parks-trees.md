# USA — Parks / Trees (context layer)

> Part of the 3D-Context-Data country study. See `../README.md`.
> **Verify every endpoint live before relying on it.**

- **Primary source for parks:** OpenStreetMap (`leisure=park`, `landuse=grass/forest`) + city open-data park polygons
- **Primary source for street trees:** City tree cadasters (major US cities publish open cadasters; no national equivalent)
- **National fallback for vegetation:** USGS National Land Cover Database (NLCD) — free, ~30m resolution
- **Integration effort:** LOW (OSM parks); LOW-MED (city cadasters where available); HIGH (NLCD processing for individual trees)

---

## Source details

| Source | Endpoint | Feature type | Licence | Notes |
|---|---|---|---|---|
| **OpenStreetMap** | Overpass API / Overture Maps | `leisure=park`, `landuse=grass/forest`, `natural=tree` | **ODbL** | Best freely available park boundaries; tree points sparse |
| **Chicago tree cadaster** | `data.cityofchicago.org` — "Street Trees" dataset | Point layer — tree species, DBH, condition, location | **Open (CC)** — confirmed open | One of the most complete urban tree datasets in the US; ~630K+ trees |
| **Los Angeles tree cadaster** | `geohub.lacity.org` — "Street Trees" | Point layer | **Open** — expected CC/ODbL; confirm licence | LA maintains a city tree inventory; coverage status TBD |
| **New York City tree cadaster** | `data.cityofnewyork.us` — "2015 Street Tree Census" (Treemap) | Point layer — species, diameter, health, lat/lon | **Open (CC BY 4.0)** — confirmed open | NYC TreesCount! 2015; 683,788 street trees mapped; 2025 census in progress |
| **USGS NLCD (National Land Cover Database)** | `mrlc.gov` / USGS EarthExplorer | 30 m raster — land cover classes including forests/grassland | **Public Domain** | Updated every 3–5 years; 2021 edition available; good for regional vegetation analysis but not individual trees |
| **USFS Urban FIA (Forest Inventory and Analysis)** | `fia.fs.usda.gov` | Statistical sample data for urban tree canopy | **Public Domain** | Sampling data, not per-tree spatial layer |

---

## Spike evidence (fill during Phase 1)

| Question | Answer | Evidence |
|---|---|---|
| Park boundary polygons available? | **YES** — OSM + city park portals both carry park polygons | OSM qualitatively confirmed; city portals not yet probed |
| Tree point data with species + height? | **YES for Chicago and NYC** (open cadasters); **likely for LA** (unconfirmed) | City open-data portals confirmed for Chicago and NYC |
| OSM tree coverage density in target cities? | Moderate — parks mapped well; individual street trees sparse in OSM | Qualitative from OSM wiki |
| National tree point data? | **NO free national per-tree spatial dataset** — NLCD gives vegetation area, not individual trees | USFS FIA is statistical sampling, not spatial per-tree |
| Height data in city cadasters? | **Mixed** — Chicago cadaster includes DBH (diameter at breast height) but not always measured height; NYC has species + diameter; derive height from species-DBH allometry | Not yet probed for explicit height field |

---

## Implementation notes

- **Chicago tree cadaster** is the most complete for the pilot city. The `data.cityofchicago.org`
  "Street Trees" dataset is open and regularly updated. Height is not a direct attribute but
  can be estimated from species + DBH using standard allometric equations (same approach as
  Germany's ATKIS species-typical-height fallback).
- **NYC TreesCount! 2015** (683,778 trees) is the most detailed census available. A 2025 census
  is in progress — check `data.cityofnewyork.us` for the updated dataset before building the
  NYC pipeline. Use species + `tree_dbh` for height estimation.
- **LA:** Confirm `geohub.lacity.org` tree inventory existence and licence before building.
  If absent, OSM + NLCD vegetation raster is the fallback.
- **Park polygons:** prefer city park authority datasets over OSM for boundary accuracy (city
  parks departments maintain authoritative polygon layers). OSM is the fallback. Both are ODbL
  or similar.
- **Canopy spread:** US city cadasters typically carry DBH (diameter at breast height). Use
  species-typical canopy spread ratios for LOD2 tree placement.
- **NLCD use case:** NLCD is useful for **regional vegetation context** (green area fraction in
  a neighbourhood) but cannot provide individual tree locations. Do not use NLCD for per-tree
  placement in a 3D scene.
