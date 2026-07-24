# Finland — Parks / Green space / Trees (context layer)

> Part of the 3D-Context-Data country study. Last updated: 2026-07-24 · Status: RESEARCH — not probed.

- **Target:** parks, green space, urban trees for context rendering.

## Sources

| Source | Coverage | Licence | Format | Status |
|---|---|---|---|---|
| Maastotietokanta (KMTK) — vegetation/land-cover | **National** — includes green areas, forest, open land, water bodies | Open data | OGC WFS / download; EPSG:3067 | Not live-probed |
| Syke (Finnish Environment Institute) — protected areas | National parks, Natura 2000 areas, nature reserves | Open data | WFS / download | Not live-probed |
| Helsinki region green-area data | Helsinki metro municipal open data | Open | GeoPackage / Shapefile / WFS | Not live-probed |
| OpenStreetMap | National | ODbL | GeoJSON / PBF | Ready (universal fallback) |

## Notes

- **Maastotietokanta (KMTK)** is the national topographic database (NLS); its land-cover classification
  covers forest, open land, and urban green areas. Available as open geodata in EPSG:3067 (ETRS89/TM35FIN).
  This is the authoritative national green-area layer — same source as the Buildings class used for height.
- **Syke (Finnish Environment Institute)** publishes protected-area boundaries (national parks, Natura 2000
  areas, nature reserves) as open WFS. Relevant for conservation/heritage constraint overlays more than
  routine context rendering.
- **Urban street trees:** no confirmed national dataset. Helsinki publishes its own urban tree cadastre as
  open data. Other cities (Tampere, Turku, Oulu) may have municipal datasets — check individually per city
  pack. OSM is the practical immediate fallback.
- **Recommended Phase 1 path:** OSM immediately (universal fallback); KMTK land-cover classification for
  Phase 2 where authoritative national green-area layer is needed.

## Spike evidence (fill during Phase 1)

| Question | Answer | Evidence |
|---|---|---|
| Green-space layer in KMTK | ✅ Present — land-cover classification in Maastotietokanta (stated) | NLS Maastotietokanta product specification |
| National street-tree dataset | ❌ Not confirmed at national level | Municipal-only; OSM as fallback |
| Syke protected-areas WFS | ❔ Not probed | `https://paikkatiedot.ymparisto.fi/` (Syke open geodata portal) |
| Helsinki tree cadastre | ❔ Not probed | Helsinki region open data portal |
