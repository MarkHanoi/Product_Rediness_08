# USA — Roads / Pedestrian (context layer)

> Part of the 3D-Context-Data country study. See `../README.md`.
> **Verify every endpoint live before relying on it.**

- **Primary source:** US Census TIGER/Line (free, national, Public Domain) + OpenStreetMap (ODbL)
- **Secondary source for pedestrian detail:** city open-data portals (sidewalks, crosswalks, bike lanes)
- **Integration effort:** LOW — TIGER/Line is a well-structured free national source

---

## Source details

| Source | Endpoint | Feature type | Licence | Notes |
|---|---|---|---|---|
| **US Census TIGER/Line** | `census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html` | Road network (`MTFCC` codes); updated annually | **Public Domain** | The authoritative US road network; used by Google Maps, etc. as a base; good attribute schema (road class, name, FIPS join key) |
| **OpenStreetMap** | Overpass API / Overture Maps | `highway=*`; `footway`, `cycleway`, `pedestrian` | **ODbL** | Richer pedestrian/cycling detail than TIGER; better for urban context |
| **Overture Maps (transportation theme)** | `overturemaps.org/release/` — GeoParquet | Road segments with standardised attributes | **ODbL** | Built partly from OSM + TIGER; simplifies multi-source ingestion |
| **Chicago sidewalk data** | `data.cityofchicago.org` | Sidewalk polygons + ADA compliance | **Open** | Confirm dataset exists and schema |
| **NYC pedestrian network** | `data.cityofnewyork.us` | Sidewalks, crosswalks, pedestrian plazas | **Open** | NYC has extensive open pedestrian layer |
| **LA pedestrian data** | `geohub.lacity.org` | Sidewalk inventory | **Open** — TBD | Confirm existence |

---

## Spike evidence (fill during Phase 1)

| Question | Answer | Evidence |
|---|---|---|
| National road network available free? | **YES** — TIGER/Line or OSM/Overture | Confirmed |
| Pedestrian network (sidewalks) national? | **NO** — city-by-city open data only; no national sidewalk layer | No national sidewalk dataset confirmed |
| Road width available? | TIGER/Line carries `MTFCC` (class) but not width; OSM has `width` tag sparsely populated | Not yet probed |
| CRS of TIGER/Line | EPSG:4326 (WGS84) | TIGER/Line specification |

---

## Implementation notes

- **TIGER/Line** is the canonical US road source: it is Public Domain, national, well-maintained,
  and structured with the `MTFCC` classification system (S1100 = Primary Road, S1200 = Secondary
  Road, S1400 = Local Neighbourhood Road, S1500 = Vehicular Trail, S1630 = Ramp, S1640 = Service
  Drive, S1710 = Walkway/Pedestrian Trail, etc.).
- **OSM/Overture** adds pedestrian detail (footways, plazas, crosswalks) that TIGER lacks.
  Use Overture Maps transportation theme as a single ODbL-licenced combined source where possible.
- **City portals for pedestrian layers:** Chicago and NYC are the richest; LA TBD. Use city
  data where available for the pilot cities rather than OSM for pedestrian accuracy.
- **Road width:** no free national road-width dataset exists. Use OSM `width` tag where
  populated; derive from TIGER road class + typical width lookup table as fallback.
