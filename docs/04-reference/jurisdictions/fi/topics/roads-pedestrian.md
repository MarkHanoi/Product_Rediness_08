# Finland — Roads / Pedestrian network (context layer)

> Part of the 3D-Context-Data country study. Last updated: 2026-07-24 · Status: RESEARCH — not probed.

- **Target:** road network and pedestrian paths for context rendering and setback reference geometry.

## Sources

| Source | Coverage | Licence | Format | Status |
|---|---|---|---|---|
| Maastotietokanta (KMTK) — transport network | **National** — roads, paths, railways; authoritative national layer | Open data | OGC WFS / download; EPSG:3067 | Not live-probed |
| Digiroad (national road and street database) | **National** — maintained by Traficom (Finnish Transport and Communications Agency); includes carriageway geometry, address linkage, speed limits, traffic-management data | Open data | Download / OGC | Not live-probed |
| OpenStreetMap | National | ODbL | GeoJSON / PBF | Ready (universal fallback) |

## Notes

- **Maastotietokanta (KMTK)** includes the national transport network as one of its major object classes
  (roads, paths, railways). CRS EPSG:3067. Same open-data terms as the Buildings class.
- **Digiroad** is Finland's authoritative national road and street database, maintained by Traficom. It
  carries richer road-attribute data than KMTK (speed limits, traffic management, address linkage) —
  the equivalent of France's BDTOPO routes or Germany's ATKIS. Published as open data.
- **Setback reference geometry:** Finnish asemakaava setbacks are graphical (prickmark/kryss-equivalent
  line markings on plan drawings — see `../README.md §1.5`). The road-network layer from KMTK or Digiroad
  gives the street-frontage reference line for context rendering, but the actual setback value must come
  from the plan drawing interpretation, not a formula query against the road layer.
- **Recommended Phase 1 path:** OSM immediately; Digiroad or KMTK transport for Phase 2 where authoritative
  road geometry is needed for setback reference or address linkage.

## Spike evidence (fill during Phase 1)

| Question | Answer | Evidence |
|---|---|---|
| National road network in KMTK | ✅ Confirmed — transport network is a major KMTK object class (stated) | NLS Maastotietokanta product specification |
| Digiroad open data | ✅ Published as open data by Traficom (stated) | Traficom open data documentation |
| Digiroad download format / OGC endpoint | ❔ Not probed | `https://www.traficom.fi/fi/tilastot-ja-julkaisut/avoin-data/digiroad` |
| Setback numeric value from road layer | ❌ Not available — setbacks are graphical in asemakaava; road layer gives reference geometry only | Finnish plan-symbol standard (stated) |
