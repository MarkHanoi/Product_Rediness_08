# Sweden — Parks / Green space / Trees (context layer)

> Part of the 3D-Context-Data country study. Last updated: 2026-07-24 · Status: RESEARCH — not probed.

- **Target:** parks, green space, urban trees for context rendering.

## Sources

| Source | Coverage | Licence | Format | Status |
|---|---|---|---|---|
| Lantmäteriet GSD-Terrängkartan (topographic map) | National — includes vegetation/green areas | CC0 / open | Vector / WMS | Not live-probed |
| Naturvårdsverket (Swedish EPA) open data | National parks, nature reserves, Natura 2000 areas | Open | WFS / download | Not live-probed |
| OpenStreetMap | National | ODbL | GeoJSON/PBF | Ready (universal fallback) |

## Notes

- **Lantmäteriet GSD-Terrängkartan** is the national topographic dataset; includes land-cover
  classification (forest, open land, urban green). Available as open geodata, CRS SWEREF99TM.
- **Naturvårdsverket** (Swedish Environmental Protection Agency) publishes protected area
  boundaries (national parks, nature reserves) via open WFS — relevant for heritage/conservation
  overlays more than for routine context rendering.
- **Urban street trees:** no confirmed national dataset. Municipal datasets vary — Stockholm, Gothenburg,
  and Malmö each have their own city GIS portals with varying coverage of tree cadastres. OSM is
  the practical starting point.
- **Recommended Phase 1 path:** OSM (immediate). Lantmäteriet GSD-Terrängkartan for Phase 2
  where authoritative land-cover classification is needed.

## Spike evidence (fill during Phase 1)

| Question | Answer | Evidence |
|---|---|---|
| Green-space layer in Lantmäteriet | ❔ In GSD-Terrängkartan (stated) | Fetch lantmateriet.se product pages |
| National street-tree dataset | ❌ Not found at national level | Municipal-only; OSM as fallback |
| Naturvårdsverket WFS endpoint | ❔ Not probed | `https://geodata.naturvardsverket.se/` |
