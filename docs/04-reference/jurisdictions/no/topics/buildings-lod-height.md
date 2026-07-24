# Norway — buildings, LOD, and height

**Last updated:** 2026-07-24 · **Status:** RESEARCH COMPLETE — national sources characterised; no live per-parcel probe run

---

## Summary

Norway has the **strongest national building and terrain coverage** of the three countries studied (Germany, France, Norway). The LiDAR terrain model is complete, free, and nationally operated. Building footprints are licence-gated for commercial use. Building points are fully open.

---

## Layer inventory

| Layer | Source | Content | LOD | Access | Licence | Status |
|---|---|---|---|---|---|---|
| **Building points** | Matrikkelen — Bygningspunkt | One point per building, linked to matrikkel building number | Point (location only) | Free, no login, WFS via Geonorge | Open | **CONFIRMED — use this for presence/location without a licence step** |
| **Building footprints + top height** | FKB-Bygning (Felles KartBase) | Parcel footprint polygon + top-height value per building/roof element, 2.5D; matrikkel-linked | LOD1/LOD2 footprint | **Free for Norge digitalt parties only** (public bodies + Geovekst agreement holders); **private/commercial: reseller purchase required** (Geodata, Norkart) or direct Kartverket agreement | Norge digitalt / Geovekst cooperative | Schema confirmed; **licence-gated for commercial use** |
| **Terrain DTM/DSM (LiDAR)** | Nasjonal detaljert høydemodell (NDH) | Nationwide LiDAR coverage — DTM and DSM grids, ≥2 pts/m² (5 pts/m² in densified areas); 2016–2022 | Full LiDAR | **Free, no login** — `høydedata.no` + WMS/WFS/WCS via Geonorge | Open | **CONFIRMED LIVE — the single best terrain source of the three countries studied** |
| **Heritage buildings** | Kulturminnesøk.no (Riksantikvaren) | ~220,000 heritage objects with geometry and attributes | Point/polygon | Free, no login | Open | CONFIRMED LIVE |
| **Pre-1900 building survey** | SEFRAK (Riksantikvaren) | ~515,000 pre-1900/pre-1945 buildings surveyed 1975–1995; separate from Askeladden | Point | Via Riksantikvaren WMS/WFS | Open | Published; endpoint not yet probed |

---

## FKB-Bygning — the licence gate

⚠ **FKB-Bygning is the single most commonly missed cost item in a Norway integration.** Norway's open-data posture is excellent — parcel geometry, terrain, and heritage data are all free — and this can create an incorrect impression that FKB-Bygning building footprints are also free. They are **not free for a commercial entity**:

- **Free:** public bodies (kommuner, statlige etater) + Geovekst-agreement holders ("Norge digitalt" parties)
- **Requires a purchase:** private companies, commercial engines — must buy via a reseller (Geodata, Norkart) or negotiate a direct Kartverket agreement

**Workaround for massing without footprints:** Matrikkelen — Bygningspunkt (one point per building, fully open, no login) provides building presence and location. Combined with NDH terrain, it enables a coarse massing estimate without the FKB-Bygning licence step, if the engine accepts point-location-only precision for existing buildings.

---

## NDH — why this matters

Norway's NDH is **complete nationwide** (2016–2022), free, and no-login — unlike:
- Germany's LoD2-DE, which is INSPIRE-restricted at the national level and per-Land at the tile level
- France's LiDAR HD, which was still rolling out as of 2026 (not yet complete nationwide)

NDH delivers DTM (bare earth) and DSM (surface including vegetation + buildings) at ≥2 pts/m². This enables:
- Terrain-referenced height calculations (for kotehøyde/gesimshøyde interpretation)
- Building height estimation from DSM – DTM difference (where FKB-Bygning footprints are available)
- Slope analysis for § 29-4 height measurement (average terrain along façade)

**Endpoint:** `https://hoydedata.no` (portal); WCS available at `https://wcs.geonorge.no/skwms1/wcs.hoyde-dtm1` (GetCapabilities not yet fetched).

---

## No true LoD2 (volumetric 3D model)

Neither FKB-Bygning nor any other confirmed Norwegian national source provides a true LoD2 volumetric model (roof shape, wall geometry, windows). FKB-Bygning provides:
- 2.5D building footprint polygon
- A single top-height value per building/roof element (not a full 3D geometry)

This is the same limitation as Germany's LoD2-DE (CityGML roof geometry, derived from LiDAR — not a true architectural 3D model) and France's LOD200 gap. For true architectural massing, the engine must combine FKB-Bygning footprints + NDH terrain rather than using a ready-made 3D building model.

---

## Recommended integration sequence

1. Use **Matrikkelen — Bygningspunkt** (free, open) for building presence and location — no licence step
2. Use **NDH terrain** (free, open) for terrain-referenced height calculations and slope analysis
3. Resolve **FKB-Bygning licence** (Norge digitalt agreement or reseller purchase) for footprint + top-height geometry — required for massing engine
4. Use **Kulturminnesøk.no** (free, open) for heritage overlay
5. **SEFRAK** (Riksantikvaren WMS/WFS): probe endpoint before using — separate from Askeladden, pre-1900/pre-1945 buildings
