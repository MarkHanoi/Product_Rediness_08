# Finland — Buildings / LOD / Height (context layer)

> Part of the 3D-Context-Data country study (see `../README.md`).
> Last updated: 2026-07-24 · Status: RESEARCH COMPLETE — no live probe; no code.

- **Target LOD:** LOD1/LOD2 (storey-count-derived extrusion from KMTK national data as baseline;
  full LOD2 roof-shape pending confirmation of KMTK 3D vector richness)
- **Key finding:** Finland has the **strongest building-height data layer of any country studied** — the
  Maastotietokanta (KMTK) Buildings feature class delivers nationally consistent, LiDAR-derived 3D building
  vectors including storey count (kerroslukumäärä), nationwide, as open data. Unlike Germany (per-Land
  LoD2-DE) or France (BD TOPO in-progress), this is genuinely national and free. Unlike Sweden (terrain
  LiDAR is free but finished LOD2 is municipal/paid), Finland has actual 3D building vectors derived from
  the 5-pt/m² LiDAR programme.

---

## Source overview

| Source | Coverage | Licence | Format | Access |
|---|---|---|---|---|
| Maastotietokanta (KMTK) Buildings feature class | **Complete nationally** — Finland mainland; LiDAR-derived 3D building vectors | Open data | OGC WFS / download; CRS ETRS89/TM35FIN (EPSG:3067) | Free (NLS open data) |
| KMTK — storey count (kerroslukumäärä) | National — structured attribute in Buildings class | Open data | Same as above | Free |
| KMTK — intended use classification | National — structured attribute | Open data | Same as above | Free |
| National LiDAR point cloud (0.5 pts/m² public tier) | Complete nationally — 2008–2019 legacy + 2020 onward programme | Open data | LAZ download | Free |
| National LiDAR point cloud (5 pts/m² — used for KMTK derivation) | Produced internally; 0.5 pts/m² public product thinned from this | Internal NLS | N/A — derived product (KMTK) is the public deliverable | N/A |
| RHR (rakennus- ja huoneistorekisteri) — building register | ~3 million buildings with richer attributes | GDPR-restricted | DVV permission required | ❌ Third-party access blocked — use KMTK instead |

---

## Spike evidence (fill during Phase 1 probe)

| Question | Answer | Evidence (endpoint response / sample) |
|---|---|---|
| (a) Real footprint nationally? | YES — KMTK Buildings class includes building footprint polygons | NLS Maastotietokanta product specification (published) |
| (b) Real height / storey count nationally? | YES — storey count (kerroslukumäärä) as structured attribute in KMTK Buildings class | NLS product specification (published; attribute name not live-confirmed) |
| (c) Full LOD2 roof geometry nationally? | ❔ UNVERIFIED — KMTK 3D vectors described as "three-dimensional instances"; whether this extends to actual roof-shape geometry (not just extruded height) needs direct DescribeFeatureType probe | NLS product specification language is ambiguous on LOD level |
| (d) DSM-derived height as fallback? | YES — national LiDAR point cloud (0.5 pts/m² public) allows per-building height estimation | NLS LiDAR product specification (published) |
| CRS of NLS responses | ETRS89/TM35FIN (EPSG:3067) | NLS standard CRS (published) |
| RHR availability as alternative | ❌ GDPR-restricted; DVV permission required for third-party access | DVV published access terms (published) |
| Helsinki protected-buildings multi-format data | YES — Helsinki open-data portal serves asemakaava-protected buildings in GML, KML, Excel, DWG, DXF, GeoPackage, MapInfo, Shapefile | Helsinki open data documentation (published) |

---

## 5-building spot check (fill during Phase 1 probe)

| Building id | KMTK storey count | KMTK height estimate | Visual (satellite) | Verdict |
|---|---|---|---|---|
| TBD | TBD | TBD | TBD | TBD |

---

## Implementation notes

- **LOD1 path (safe starting point):** use KMTK building footprints (open, national) + KMTK storey-count
  attribute → extrude to LOD1. If storey-count-to-height conversion factor is needed, apply Finnish
  standard (typically 3–3.5 m per floor depending on building type) until direct height-field confirmed.
  This is the same pattern as Spain/Switzerland; cost: one offline processing step.
- **LOD2 path (pending probe):** if KMTK 3D vectors include actual roof geometry (not just extruded
  outlines), wire the same CityGML→CityJSON→3D-Tiles pipeline validated for Denmark. The Phase 1 probe
  (DescribeFeatureType + sample features) resolves this.
- **Do NOT use RHR for building height/massing** — GDPR-restricted, third-party access blocked. KMTK is
  the correct open path for height and massing data.
- **Reprojection:** ETRS89/TM35FIN (EPSG:3067) → WGS84 (EPSG:4326) via proj4js — same pattern as Denmark
  EPSG:25832 and Sweden EPSG:3006.
- **National LiDAR vs. KMTK 3D vectors:** for context rendering, prefer KMTK Buildings (pre-derived
  building objects, structured attributes) over raw LiDAR point cloud. LiDAR is the fallback for areas
  where KMTK building derivation may lag (e.g. new construction post-last-KMTK-update).
- **Recommended Phase 1 action:** fetch KMTK WFS endpoint URL from NLS documentation; run
  DescribeFeatureType on the Buildings layer; confirm kerroslukumäärä attribute name, EPSG:3067 CRS, and
  whether 3D geometry is truly LOD1 or LOD2. Record in this file.
