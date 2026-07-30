# Brandenburg — Land technical profile

**ISO 3166-2:** `de-bb` · **CRS:** ETRS89 / UTM 33N (EPSG:25833) ·
**Last updated:** 2026-07-30 · **Status: unprobed, see `../LAND-REGISTRY.md`** — unprobed

> **Confidence: CONVERGENT-SECONDARY (unprobed).** Scaffold stub. Endpoints, licence, auth, CRS and
> formats for Brandenburg have NOT been live-probed. Nothing here may move a RATE cell until probed
> and wired. Empty and failed are the same value. NRW LoD2 is the only VERIFIED-LIVE anchor
> (`../LANDS/NORDRHEIN-WESTFALEN.md`).
>
> **Note:** GDI-BE shared platform with Berlin; DiPlanung operational 2026-07-23.

Standards are national (AAA-Modell: AFIS / ALKIS / ATKIS); Brandenburg's services implement them
independently. Populate each section from the Land geoportal on probe.

---

## 20-section template (per followup study §PER-LAND) — to populate on probe

1. Exec summary (readiness /10) — *unprobed*
2. Responsible authorities (per dataset) — GDI-BE (shared with Berlin) *(unprobed)*
3. CRS — native EPSG:25833 (UTM33N/east); Gauss-Krüger legacy; transform → WGS84 → ENU
4. Cadastre (ALKIS: reverse-lookup? API type? Gemarkung/Flur/Flurstück, licence, update freq) — *unprobed*
5. Buildings (LoD1/2/3, geometry, formats) — *unprobed*
6. Building heights (eaves/ridge/roof; LoD2 direct — no DSM) — *unprobed*
7. Terrain (DGM1/2/5, LiDAR, datum, format) — *unprobed*
8. DSM (usually NOT needed — LoD2 supplies true height) — *unprobed*
9. Orthophotos (DOP10/20, WMTS, CRS) — *unprobed*
10. Administrative (AGS / Gemeinde / Landkreis via VG250) — *unprobed*
11. Addresses — *unprobed*
12. Roads (ATKIS vs OSM) — *unprobed*
13. Hydrography — *unprobed*
14. Protected areas (BfN Natura2000 + Land landscape) — *unprobed*
15. Geology (BGR / state) — *unprobed*
16. Planning (BauGB → BauNVO → Bebauungsplan; XPlanung/DiPlanung status) — *unprobed*
17. Envelope feasibility (municipal, legal not technical) — *unprobed*
18. Performance — *unprobed*
19. PRYZM impl (LandResolver → ALKIS provider → ParcelFeature → ENU) — *unprobed*
20. Outstanding unknowns — endpoints, licence, auth, CRS confirmation, XPlanGML null-rate — *all unprobed*

---

**Related:** `../LAND-REGISTRY.md` · `../GERMANY.md` · `../GERMANY-GEOSPATIAL-DATA-INVENTORY.md`.
