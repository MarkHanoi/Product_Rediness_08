# Nordrhein-Westfalen (NRW) — Land technical profile

**ISO 3166-2:** `de-nw` · **Land seat:** Düsseldorf · **CRS:** ETRS89 / UTM 32N (EPSG:25832) ·
**Last updated:** 2026-07-30 · **Status:** **VERIFIED-LIVE anchor — wire-first Land ("German Barcelona")**

> **Confidence:** the **LoD2 CityGML open download is VERIFIED-LIVE** — `opengeodata.nrw.de`
> probed 2026-07-24 (HTTP 200; index lists "3D-Gebäudemodell LoD2", Open Data Download Client,
> per-tile packaging). Every OTHER cell below is **CONVERGENT-SECONDARY** — probe before it gates
> production. NRW is the one Land where the top of the LOD ladder is confirmed open.

The Land is the technical authority for cadastre, terrain, imagery and buildings; the buildable
envelope for NRW municipalities (e.g. Köln) is a municipal matter — see `../CITIES/`.

---

1. **Exec summary (readiness /10)** — **9.6 (reviewer est.)**. Everything technical is open: OGC
   API Features / REST / I3S / WMS for buildings, LiDAR DGM, DOP10, flood, ALKIS parcels. LoD2 is
   the only VERIFIED-LIVE geodata cell in all of Germany.
2. **Responsible authorities** — Geobasis NRW / IT.NRW (GDI-NW); open portal `opengeodata.nrw.de`.
3. **CRS** — native **EPSG:25832** (UTM32N, west zone). Height datum DHHN2016 (NHN). Transform
   25832 → WGS84 → ENU.
4. **Cadastre (ALKIS)** — `Flurstück` via GDI-NW WFS / OGC API Features; schema = national ALKIS
   Objektartenkatalog (Gemarkung/Flur/Flurstück, geometry). Licence **DL-DE Zero 2.0** (open).
   Reverse coordinate lookup: available (convergent). CONVERGENT-SECONDARY — probe endpoint.
5. **Buildings** — LoD1 / **LoD2** (CityGML) + LoD3 in places; ALKIS `Gebäude` footprints with
   `Gebäudefunktion`. **LoD2 = VERIFIED-LIVE.**
6. **Building heights** — LoD2 carries measuredHeight + `traufhoehe` (eaves) + `firsthoehe` (ridge)
   + roof planes directly. No P90 / DSM sampling needed. VERIFIED-LIVE (roof geometry too).
7. **Terrain** — DGM1 (1 m LiDAR) via WCS / GeoTIFF, DL-DE Zero 2.0. CONVERGENT-SECONDARY.
8. **DSM** — published; **not needed** — LoD2 supplies true height. Skip nDSM derivation.
9. **Orthophotos** — **DOP10** (10 cm) via WMTS / WMS / download, DL-DE Zero 2.0. CONVERGENT-SECONDARY.
10. **Administrative** — AGS via VG250 (BKG) national routing; Land code `05`.
11. **Addresses** — Hauskoordinaten / ALKIS address point; per-Land. CONVERGENT-SECONDARY.
12. **Roads** — ATKIS Basis-DLM (official) or OSM fallback. CONVERGENT-SECONDARY.
13. **Hydrography** — ATKIS Basis-DLM water; EU Flood Directive layers published (open). CONVERGENT-SECONDARY.
14. **Protected areas** — BfN Natura2000 (federal) + NRW landscape plans. CONVERGENT-SECONDARY.
15. **Geology** — BGR (federal) + Geologischer Dienst NRW. CONVERGENT-SECONDARY.
16. **Planning** — BauGB → BauNVO → municipal Bebauungsplan; XPlanung delivery per-municipality.
17. **Envelope feasibility** — municipal (Köln etc.); ~2/10 technically-derivable; legal, not data.
18. **Performance** — open bulk download + OGC API tiling; suited to a Barcelona-style bake.
19. **PRYZM impl** — `LandResolver → NRWProvider (AbstractALKISProvider subclass) → ParcelFeature →
    ENU`. Lowest complexity; wire this Land first. LoD2 → context PMTiles directly.
20. **Outstanding unknowns** — ALKIS reverse-lookup endpoint exact URL; DOP10 tiling scheme; flood
    WFS field names. All probe items; none blocks the LoD2 wire.

---

**Probe evidence (VERIFIED-LIVE):**

| Endpoint | Probed | Result | Verdict |
|---|---|---|---|
| `https://www.opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/` | 2026-07-24 | HTTP 200 — LoD2 CityGML tiles, Open Data Download Client, per-tile packaging | **VERIFIED — LoD2 open** |

**Related:** `../LAND-REGISTRY.md` (row 10) · `../GERMANY.md` · `../LOD-RATE.md` (probe appendix) ·
`../GERMANY-GEOSPATIAL-DATA-INVENTORY.md`.
