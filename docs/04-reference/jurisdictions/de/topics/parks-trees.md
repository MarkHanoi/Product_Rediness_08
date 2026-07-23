# Germany — Parks / Trees (context layer)

> Part of the 3D-Context-Data country study. See `../README.md`.
> **Verify every endpoint live before relying on it.**

- **Primary source for trees:** Per-Land ATKIS Basis-DLM (`Vegetationsfläche`) or municipal tree cadasters (major cities have open tree registers)
- **Primary source for parks:** ATKIS `Erholungsfläche` + `Vegetationsfläche`; or OSM `leisure=park` + `landuse=grass`
- **Integration effort:** LOW-MED — OSM covers parks well; tree point data is city-specific

---

## Source details

| Source | Endpoint | Feature type | Licence | Notes |
|---|---|---|---|---|
| ATKIS Basis-DLM (parks + vegetation) | Per-Land WFS | `Erholungsfläche`, `Vegetationsfläche`, `Wald` | Per-Land | Most authoritative for park boundaries |
| OpenStreetMap | Overpass API / Overture Maps | `leisure=park`, `landuse=grass/forest`, `natural=tree` | ODbL | Good coverage; tree points sparse |
| Berlin tree cadaster | `odis.berlin.de` / `daten.berlin.de` | Point layer — every street tree, species + height | **Open** (CC BY 3.0) — confirmed open | ~800K trees as of 2024; one of the most detailed urban tree datasets in Europe |
| Munich tree cadaster | `muenchen.de` / `stadt.muenchen.de` | Point layer — Baumkataster | Open (CC BY 4.0 expected) — **not yet confirmed** | Similar to Berlin's; confirm on portal |
| Hamburg tree cadaster | `transparenzportal.hamburg.de` | Point layer — Straßenbaumkataster | Open (Hamburger Transparenzportal) — **not yet confirmed** | Confirm access and field names |

---

## Spike evidence (fill during Phase 1)

| Question | Answer | Evidence |
|---|---|---|
| Park boundary polygons available? | YES (ATKIS + OSM both carry park polygons) | NOT YET live-probed for ATKIS; OSM confirmed qualitatively |
| Tree point data with height? | YES for Berlin (open cadaster); likely for Hamburg/Munich (unconfirmed) | NOT YET live-probed |
| OSM tree coverage density in target cities? | Moderate — individual trees mapped in parks, sparse on streets | Qualitative from OSM wiki |
| CRS (ATKIS) | EPSG:25832/25833 (UTM) | NOT YET probed |
| Fallback for tree height | Use species-typical height from a lookup table (e.g. Linde ≈ 15 m, Platane ≈ 20 m) when cadaster height is null | Reasonable default; flag as `estimated` |

---

## Implementation notes

- **Berlin tree cadaster** is one of the most complete open urban tree datasets in Europe — use
  it directly for Berlin context rather than OSM. The `baumhoehe` field provides actual measured
  height per tree. Licence: CC BY 3.0, attribution required.
- **Park polygons:** ATKIS `Erholungsfläche` is the authoritative source; OSM `leisure=park` is
  a good fallback where ATKIS licence is restrictive. The two generally agree on boundaries for
  large parks; small urban green spaces may differ.
- **Tree species:** both ATKIS and the city cadasters carry species information. This can feed
  canopy-spread estimates (needed for LOD2 tree placement) without satellite imagery.
