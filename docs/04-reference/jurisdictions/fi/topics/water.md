# Finland — Water bodies (context layer)

> Part of the 3D-Context-Data country study. Last updated: 2026-07-24 · Status: RESEARCH — not probed.

- **Target:** lakes, rivers, coastline for context rendering and shoreline-plan identification.

## Sources

| Source | Coverage | Licence | Format | Status |
|---|---|---|---|---|
| Maastotietokanta (KMTK) — water bodies | **National** — lakes, rivers, coastline; one of the major KMTK object classes | Open data | OGC WFS / download; EPSG:3067 | Not live-probed |
| Syke (Finnish Environment Institute) — watershed / catchment polygons | National hydrological data | Open data | WFS / download | Not live-probed |
| OpenStreetMap | National | ODbL | GeoJSON / PBF | Ready (universal fallback) |

## Notes

- **Maastotietokanta (KMTK)** includes water bodies as one of its major object classes — lakes, rivers,
  coastline, water bodies — with the same open-data terms as the Buildings and transport layers. This is
  the authoritative national water layer, maintained by NLS. CRS EPSG:3067.
- **Finland is unusually water-rich** — ~188,000 lakes and an extensive coastline. The KMTK water layer is
  particularly important here not just for context rendering but because shoreline areas are often governed
  by yleiskaava (master plan) rather than asemakaava in Finnish planning law. Knowing a parcel is on a
  shoreline is directly relevant to the plan-type resolution step (§1.2 in `../README.md`).
- **Shoreline zone rule:** Finnish planning law (Alueidenkäyttölaki) specifically addresses shoreline areas
  — the yleiskaava often governs shoreline construction in rural areas. The KMTK water-body layer, combined
  with the Ryhti yleiskaava data for Ryhti-live regions, is therefore a critical context layer for correct
  plan-type selection, not just rendering.
- **Recommended Phase 1 path:** OSM immediately; KMTK water bodies for Phase 2, noting the shoreline-plan
  relevance to the resolution engine.

## Spike evidence (fill during Phase 1)

| Question | Answer | Evidence |
|---|---|---|
| Water-body layer in KMTK | ✅ Confirmed — water bodies are a major KMTK object class (stated) | NLS Maastotietokanta product specification |
| Shoreline-zone planning relevance | ✅ Confirmed — yleiskaava often governs shoreline areas in Finnish law | Alueidenkäyttölaki + MoE planning documentation (stated) |
| Syke hydrological WFS | ❔ Not probed | `https://paikkatiedot.ymparisto.fi/` (Syke open geodata portal) |
| Flood-risk overlay | ❔ Not confirmed — flood risk in Finland may be relevant in certain coastal and river-delta areas; Syke is the likely source | Syke environmental data portal |
