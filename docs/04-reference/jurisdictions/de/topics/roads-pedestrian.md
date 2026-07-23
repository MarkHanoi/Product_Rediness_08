# Germany — Roads / Pedestrian (context layer)

> Part of the 3D-Context-Data country study. See `../README.md`.
> **Verify every endpoint live before relying on it.**

- **Primary source:** ATKIS Basis-DLM (per Land) — the national authoritative topographic dataset, includes road network at object level
- **Alternative source:** OpenStreetMap (ODbL) — consistent national coverage, no licence gate, good quality in German cities
- **Integration effort:** MED — ATKIS licence varies per Land; OSM is a reliable uniform fallback

---

## Source details

| Source | Endpoint | Feature type | Licence | Notes |
|---|---|---|---|---|
| ATKIS Basis-DLM | Per-Land geoportal WFS — same as ALKIS operator | Road objects (`Strasse`, `Weg`, `Platz`) | Per-Land (see ALKIS licence note in `buildings-lod-height.md`) | Most authoritative; object-level with road type, width attributes |
| OpenStreetMap / Overture Maps | `overturemaps.org` or OSM Overpass API | `transportation` (OSM `highway` keys) | ODbL (commercial OK, share-alike on derived data) | Uniform coverage, well-maintained in DE cities; no Land licence complexity |
| BKG Verwaltungsgrenzen + Verkehr | `gdz.bkg.bund.de` | Federal road network | Open (dl-de/by-2-0) | Federal-level roads only; missing pedestrian / local detail |

---

## Spike evidence (fill during Phase 1)

| Question | Answer | Evidence |
|---|---|---|
| Object-level road polygons available (ATKIS)? | YES (research-confirmed) — ATKIS Basis-DLM carries road objects with width and type attributes | NOT YET live-probed |
| Pedestrian areas / Plätze available (ATKIS)? | YES — `Platz` feature type in ATKIS; pedestrian zones are typed | NOT YET live-probed |
| OSM coverage quality in Hamburg/Munich/Berlin? | EXCELLENT — all three are major cities with dense OSM contributor activity | Qualitative assessment; spot-check during live probe |
| CRS (ATKIS) | Likely EPSG:25832 (UTM Zone 32N) or EPSG:4326 if WFS serves with SRSNAME param | NOT YET probed |
| Licence (ATKIS verbatim) | Varies per Land — check per-Land geoportal before ingesting | NOT YET |
| Fallback condition (when to use OSM) | When ATKIS licence is restrictive / fee-based, OR when live probe fails | Apply universally as a first option given licence simplicity |

---

## Implementation notes

- **Recommended default:** use OSM via Overture Maps for the initial pipeline — consistent across
  all three target cities, no licence negotiation, good pedestrian coverage. Add ATKIS as a
  higher-accuracy upgrade for Länder where it is freely accessible.
- **ATKIS road width:** ATKIS carries `breiteKlasse` (width class) attributes that OSM lacks for
  most roads. If road width is needed for the context scene (shadows, perspective accuracy),
  ATKIS adds value over OSM for this specific attribute.
- **CRS reprojection:** same as buildings — reproject from UTM to WGS84 in the adapter.
