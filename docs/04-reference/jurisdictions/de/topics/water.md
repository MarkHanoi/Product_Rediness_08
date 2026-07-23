# Germany — Water (context layer)

> Part of the 3D-Context-Data country study. See `../README.md`.
> **Verify every endpoint live before relying on it.**

- **Primary source:** ATKIS Basis-DLM `Gewässer` feature type — rivers, lakes, canals as objects
- **Alternative:** OpenStreetMap `waterway=*`, `natural=water` — consistent, ODbL
- **Integration effort:** LOW — water features are stable; OSM quality in German cities is high

---

## Source details

| Source | Endpoint | Feature type | Licence | Notes |
|---|---|---|---|---|
| ATKIS Basis-DLM (water) | Per-Land WFS | `Fließgewässer` (river), `Stehendes Gewässer` (lake/pond) | Per-Land | Most authoritative — includes named waterways, width attributes |
| BKG — Gewässernetz (national) | `gdz.bkg.bund.de` — DLM250 Gewässernetz | National river/canal network | Open (dl-de/by-2-0) | Federal level; adequate for context display |
| OpenStreetMap | Overpass API / Overture Maps | `waterway=river/canal/stream`, `natural=water` | ODbL | Good for all three target cities; Hamburg harbour and canals, Berlin Spree, Munich Isar |

---

## Spike evidence (fill during Phase 1)

| Question | Answer | Evidence |
|---|---|---|
| Object-level water polygons available (ATKIS)? | YES (research-confirmed) | NOT YET live-probed |
| Waterway lines vs polygons (rivers)? | Both — ATKIS has both polyline and polygon representations for navigable waterways | NOT YET live-probed |
| CRS | EPSG:25832/25833 (UTM) | NOT YET probed |
| Licence (verbatim) | Per-Land for ATKIS; ODbL for OSM | NOT YET — check ATKIS per-Land before using |
| Fallback condition | OSM as default given licence simplicity; upgrade to ATKIS where free | Apply OSM universally first |

---

## Implementation notes

- **Hamburg:** the city has an unusually complex water network (Elbe, Alster, Binnenalster,
  extensive harbour channels). OSM coverage of Hamburg's waterways is excellent — confirmed
  qualitatively. Use OSM as the default; verify ATKIS licence separately if higher precision
  is needed for Alster shoreline.
- **Berlin:** the Spree, Havel, and numerous lakes (Müggelsee, Wannsee, Tegeler See) are
  major landscape elements. OSM covers these well.
- **Munich:** the Isar and the English Garden water features are well-mapped in OSM.
- **Recommendation:** use OSM water features as the default for all three cities. Water
  boundaries in urban areas change rarely; OSM maintains them reliably. ATKIS adds named
  waterway metadata and authoritative polygon boundaries if those are needed for attribution.
