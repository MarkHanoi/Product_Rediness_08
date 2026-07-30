# Hamburg — Land technical profile

**ISO 3166-2:** `de-hh` · **Type:** city-state · **CRS:** ETRS89 / UTM 32N (EPSG:25832) ·
**Last updated:** 2026-07-30 · **Status: unprobed, see `../LAND-REGISTRY.md`** — TBD

> **Confidence: CONVERGENT-SECONDARY.** Scaffold stub. Hamburg WFS was partially live-probed for
> the RATE dossier (ALKIS GetCapabilities), but LoD2 openness and ALKIS auth remain TBD, and nothing
> here is a VERIFIED geodata claim. Nothing moves a RATE cell until probed and wired. Empty and
> failed are the same value. NRW LoD2 is the only VERIFIED-LIVE anchor
> (`../LANDS/NORDRHEIN-WESTFALEN.md`).
>
> **Note:** city-state; full XPlanung migration (2018, 1,900 B-Pläne); LoD2 via Transparenzportal TBD;
> ALKIS auth TBD — municipal detail in `../de-hh/02000-hamburg/`.

Standards are national (AAA-Modell: AFIS / ALKIS / ATKIS); Hamburg's services implement them
independently. Populate each section from the Land geoportal on probe.

---

## 20-section template (per followup study §PER-LAND) — to populate on probe

1. Exec summary (readiness /10) — *unprobed* (reviewer est. 9.5)
2. Responsible authorities (per dataset) — Hamburg LGV / `geodienste.hamburg.de`; XLeitstelle (XPlanung national coordination) *(unprobed)*
3. CRS — native EPSG:25832 (UTM32N/west); Gauss-Krüger legacy; transform → WGS84 → ENU
4. Cadastre (ALKIS: HH_WFS_ALKIS; reverse-lookup? auth? licence DL-DE BY 2.0 reported) — *auth unprobed*
5. Buildings (LoD1/2/3, geometry, formats) — *unprobed*
6. Building heights (eaves/ridge/roof; LoD2 direct — no DSM) — *unprobed*
7. Terrain (DGM1/2/5, LiDAR, datum, format) — *unprobed*
8. DSM (usually NOT needed — LoD2 supplies true height) — *unprobed*
9. Orthophotos (DOP10/20, WMTS, CRS) — *unprobed*
10. Administrative (AGS `02000000`; VG250 routing) — *unprobed*
11. Addresses — *unprobed*
12. Roads (ATKIS vs OSM) — *unprobed*
13. Hydrography (Elbe / port) — *unprobed*
14. Protected areas (BfN Natura2000 + Land landscape) — *unprobed*
15. Geology (BGR / state) — *unprobed*
16. Planning — **fully XPlanung-migrated 2018**; DiPlanung operational; see `../de-hh/02000-hamburg/` and `../CITIES/`
17. Envelope feasibility (municipal, legal not technical; §34 fraction assumed low but unmeasured) — *unprobed*
18. Performance — *unprobed*
19. PRYZM impl (LandResolver → HamburgProvider → ParcelFeature → ENU) — *unprobed*
20. Outstanding unknowns — ALKIS auth requirement; LoD2 licence (Transparenzportal); XPlanGML GRZ/GFZ/Höhe null-rate — *all unprobed*

---

**Related:** `../LAND-REGISTRY.md` (row 6) · `../de-hh/02000-hamburg/README.md` · `../GERMANY.md` ·
`../GERMANY-GEOSPATIAL-DATA-INVENTORY.md`.
