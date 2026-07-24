# Sweden — Water (context layer)

> Part of the 3D-Context-Data country study. Last updated: 2026-07-24 · Status: RESEARCH — not probed.

- **Target:** rivers, lakes, coastline for context rendering.

## Sources

| Source | Coverage | Licence | Format | Status |
|---|---|---|---|---|
| Lantmäteriet GSD-Terrängkartan | National — authoritative coastline, lakes, rivers | CC0 / open | Vector / WMS | Not live-probed |
| SMHI (Swedish Meteorological and Hydrological Institute) | Hydrological network (streams, catchments) | Open | WFS / download | Not live-probed |
| OpenStreetMap | National | ODbL | GeoJSON/PBF | Ready (universal fallback) |

## Notes

- **Lantmäteriet GSD-Terrängkartan** includes coastline, lake boundaries, and river courses as
  authoritative national open data. CRS: SWEREF99TM (EPSG:3006). This is the highest-quality
  source for rendering contexts.
- **SMHI** publishes hydrological open data including detailed stream networks and catchment areas,
  useful for flood-overlay and environmental context. Endpoint: `https://opendata.smhi.se/` —
  not live-probed.
- **Sweden has extensive lake/river coverage** (over 100,000 lakes > 1 ha); OSM coverage of major
  water bodies is very good in Sweden.
- **Recommended Phase 1 path:** OSM (immediate). Lantmäteriet for Phase 2 for authoritative
  shoreline and lake polygon quality.

## Spike evidence (fill during Phase 1)

| Question | Answer | Evidence |
|---|---|---|
| Coastline/lake layer in Lantmäteriet | ✅ In GSD-Terrängkartan (CC0) | Lantmäteriet product pages (published) |
| SMHI open data endpoint | ❔ Not probed | `https://opendata.smhi.se/` |
| OSM water coverage Sweden | Very high | Community consensus; no probe needed |
