# Baden-Württemberg — Land technical profile

**ISO 3166-2:** `de-bw` · **CRS:** ETRS89 / UTM 32N (EPSG:25832) ·
**Last updated:** 2026-07-30 · **Status: unprobed, see `../LAND-REGISTRY.md`** — open (convergent)

> **Confidence: CONVERGENT-SECONDARY (unprobed).** Scaffold stub. LoD2 + DGM1 are research-reported
> open (LGL-BW) but NOT live-probed. Nothing here may move a RATE cell until probed and wired.
> Empty and failed are the same value. NRW LoD2 is the only VERIFIED-LIVE anchor
> (`../LANDS/NORDRHEIN-WESTFALEN.md`).
>
> **Note:** LoD2 + DGM1 reported open; probe LGL-BW geoportal.

Standards are national (AAA-Modell: AFIS / ALKIS / ATKIS); Baden-Württemberg's services implement
them independently. Populate each section from the Land geoportal on probe.

---

## 20-section template (per followup study §PER-LAND) — to populate on probe

1. Exec summary (readiness /10) — *unprobed* (reviewer est. 9.1)
2. Responsible authorities (per dataset) — LGL-BW *(unprobed)*
3. CRS — native EPSG:25832 (UTM32N/west); Gauss-Krüger legacy; transform → WGS84 → ENU
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
