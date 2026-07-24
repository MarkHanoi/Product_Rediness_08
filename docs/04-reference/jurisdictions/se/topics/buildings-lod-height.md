# Sweden — Buildings / LOD / Height (context layer)

> Part of the 3D-Context-Data country study (see `../README.md`).
> Last updated: 2026-07-24 · Status: RESEARCH COMPLETE — no live probe; no code.

- **Target LOD:** LOD2 (real roofs preferred; LOD1 extrusion from terrain as fallback)
- **Key finding:** Sweden's terrain point cloud is free and nationally complete (the best in Europe);
  but finished per-building LOD2 volumes are a **municipal product** — Stockholm confirmed fee-based,
  Gothenburg unknown (first to deliver a building record to NGP), Malmö unknown.

---

## Source overview

| Source | Coverage | Licence | Format | Access |
|---|---|---|---|---|
| Lantmäteriet LiDAR (terrain) | **Complete nationally** (2009–2019, 0.5–1 pts/m²) | Free, commercial use allowed | LAZ point cloud + derived DTM/DSM | Free download (account required for some products) |
| Lantmäteriet building register | National (building footprints) | CC0 | Vector (INSPIRE BU) | Account + scope selection |
| Stockholm 3D LOD2 | Stockholm municipality only | **Fee-based** (city planning dept. fee schedule) | CityGML / proprietary | Paid — city portal |
| Gothenburg NGP building record | Gothenburg? (first city to deliver to NGP) | Unknown — needs check | Unknown | Unknown |
| Malmö 3D buildings | Unknown | Unknown | Unknown | Unknown |

---

## Spike evidence (fill during Phase 1)

| Question | Answer | Evidence (endpoint response / sample) |
|---|---|---|
| (a) Real footprint nationally? | YES (Lantmäteriet building register — INSPIRE BU footprints) | Lantmäteriet product pages (published) |
| (b) Real height (LOD2) nationally? | NO — not a free national product; terrain point cloud only | Stockholm confirmed fee-based; others unknown |
| (c) Real roof shape nationally? | NO — no national CityGML LOD2 building model (unlike Denmark "Danmark i 3D" or Germany LoD2-DE) | Stated from research |
| (d) DSM-derived height as fallback? | YES — terrain point cloud (DSM) allows per-building height estimation | Lantmäteriet product spec (published) |
| CRS of Lantmäteriet responses | SWEREF99TM (EPSG:3006) | Lantmäteriet standard CRS (published) |
| Gothenburg LOD2 status | ❔ UNVERIFIED — first to deliver building record to NGP; may be free | Needs direct portal check |
| Malmö LOD2 status | ❔ UNVERIFIED | Needs direct portal check |
| Stockholm LOD2 cost | Fee-based; specific price not fetched | Stated from research |

---

## 5-building spot check (fill during Phase 1 probe)

| Building id | Dataset height | Visual (satellite/StreetView) | Verdict |
|---|---|---|---|
| TBD | TBD | TBD | TBD |

---

## Implementation notes

- **LOD1 fallback path (safe starting point):** use Lantmäteriet building footprints (CC0, national)
  + DSM point-cloud height (free, national) → extrude to LOD1. This is the same path used for
  Spain and Switzerland (no free national LOD2). Cost: one offline processing step.
- **LOD2 path (per-city):** check Gothenburg's geodata portal first (likely most open). If Gothenburg
  offers LOD2 via NGP or its own portal for free, wire it using the same CityGML→CityJSON→3D-Tiles
  pipeline validated for Denmark.
- **Do NOT pay Stockholm's fee-based LOD2 for a demo or prototype** — the LOD1 fallback from
  national terrain is free and good enough for the envelope-rendering use case.
- **Adapter target:** same pipeline as Denmark ("Danmark i 3D") if LOD2 becomes available;
  LOD1-extrusion path (same as Spain/Switzerland) as the universal fallback.
- Reprojection: SWEREF99TM (EPSG:3006) → WGS84 (EPSG:4326) via proj4js — same pattern as Denmark
  EPSG:25832.
