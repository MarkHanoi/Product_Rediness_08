# Sweden — Roads / Pedestrian network (context layer)

> Part of the 3D-Context-Data country study. Last updated: 2026-07-24 · Status: RESEARCH — not probed.

- **Target:** driveable roads + pedestrian/cycle network, object-level, for context rendering.

## Sources

| Source | Coverage | Licence | Format | Status |
|---|---|---|---|---|
| Lantmäteriet Topografisk webbkarta / GSD-Vägkartan | National — authoritative road network | CC0 / open | Vector tiles / WMS | Not live-probed |
| OpenStreetMap (OSM) | National | ODbL | GeoJSON/PBF | Ready (universal fallback) |

## Notes

- Lantmäteriet publishes **GSD-Vägkartan** (road map) as open geodata — the authoritative Swedish
  road network, including foot and cycle paths. Licence confirmed as open/CC0 for the standard
  products. CRS: SWEREF99TM (EPSG:3006).
- The **Nationell Vägdatabas (NVDB)** is the authoritative Swedish road attribute database (speed
  limits, road type, etc.) maintained by Trafikverket. Free access via NVDB REST API.
  Endpoint: `https://nvdb.trafikverket.se/` — not live-probed.
- **OSM** is the safe universal fallback and is already in use for other jurisdictions. Sweden's
  OSM coverage is excellent (highly active volunteer community).
- **Recommended path for Phase 1:** use OSM (immediate, no new endpoint). Wire Lantmäteriet
  GSD-Vägkartan for Phase 2 when official attribution is needed.

## Spike evidence (fill during Phase 1)

| Question | Answer | Evidence |
|---|---|---|
| OSM coverage quality for Stockholm/Gothenburg/Malmö | Very high | Community consensus; no probe needed |
| Lantmäteriet road vector endpoint | ❔ Not probed | Fetch `https://www.lantmateriet.se/en/geodata/` → GSD-Vägkartan |
| NVDB REST API live | ❔ Not probed | `https://nvdb.trafikverket.se/api/` |
