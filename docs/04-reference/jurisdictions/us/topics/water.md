# USA — Water (context layer)

> Part of the 3D-Context-Data country study. See `../README.md`.
> **Verify every endpoint live before relying on it.**

- **Primary source:** USGS National Hydrography Dataset (NHD) — free, national, Public Domain
- **Secondary source:** OpenStreetMap (ODbL) — good urban water feature detail
- **Integration effort:** LOW — NHD is a mature, well-documented national product

---

## Source details

| Source | Endpoint | Feature type | Licence | Notes |
|---|---|---|---|---|
| **USGS NHD (National Hydrography Dataset)** | `usgs.gov/national-hydrography` / `prd-tnm.s3.amazonaws.com` | Rivers, streams, lakes, ponds, canals, coastline — polygon + line | **Public Domain** | The authoritative US water network; updated nationally; NHDPlus has additional attributes (flow, catchments) |
| **NHDPlus V2 / HR** | `nhdplus.com` / USGS | Enhanced NHD with stream order, flow direction, catchment polygons | **Public Domain** | Best for hydrological analysis; HR (High Resolution) version where available |
| **OpenStreetMap** | Overpass API / Overture Maps | `natural=water`, `waterway=*`, `landuse=reservoir` | **ODbL** | Good for small urban water features (fountains, drainage channels) not always in NHD |
| **NOAA Nautical Charts** | `charts.noaa.gov` | Coastal water + depth | **Public Domain** | Relevant for NYC coastal context |

---

## Spike evidence (fill during Phase 1)

| Question | Answer | Evidence |
|---|---|---|
| National water polygons available free? | **YES** — NHD is the definitive national source | Confirmed; Public Domain |
| Urban water features (small canals, retention ponds)? | NHD covers most; OSM supplements for small urban features | Not yet probed per city |
| CRS of NHD | EPSG:4269 (NAD83 geographic) — reproject to WGS84 | NHD specification |
| Coastal boundary? | NHD coastline + NOAA for detailed coastal areas | Confirmed |

---

## Implementation notes

- **NHD is the standard.** Use NHDPlus HR for the three target cities — it provides richer
  attributes (stream order, flow direction) and better resolution than standard NHD. Download
  by Hydrologic Unit Code (HUC) — Chicago: HUC 07, LA: HUC 18, NYC: HUC 02.
- **OSM supplements NHD** for small urban water features (ornamental pools, stormwater features)
  that NHD may not capture at the city block scale. The Overture Maps hydrology theme (derived
  from OSM + NHD) is a convenient unified source.
- **FEMA NFHL** (flood zones) is a related overlay — not a water-geometry source, but flood
  zones are displayed alongside water in 3D context. Confirm FEMA NFHL endpoint separately.
- **CRS:** NHD is in NAD83 (EPSG:4269); reproject to WGS84 (EPSG:4326) for PRYZM internal
  storage. The difference is sub-metre for continental US; a simple proj transform suffices.
