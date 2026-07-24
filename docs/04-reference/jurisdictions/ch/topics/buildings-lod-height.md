# Switzerland — Buildings / LOD / Height (context layer)

> Part of L-511 (`../../../V1-LAUNCH-READINESS-AUDIT.md`). **Gate: PASSED** (2026-07-24).
> Live probes: GWR API VERIFIED LIVE, CityGML 2.0 CONFIRMED.

## Source stack

| Tier | Dataset | What it gives | Format | Licence |
|---|---|---|---|---|
| LOD2 geometry (baseline) | **swissBUILDINGS3D 2.0** | Closed solid OR separate roof/façade/footprint; manually stereo-photogrammetrically extracted roofs incl. overhangs. ±30–50cm. **Full national + Liechtenstein since 2018.** | FileGDB, DWG, **CityGML 2.0** | Free OGD |
| LOD2 geometry (EGID-enhanced) | **swissBUILDINGS3D 3.0 Beta** | Same LOD2 + **EGID baked in model**; biannual update. **CityGML 2.0 confirmed** (official swisstopo page 2024-08-14). Canton coverage: see `../regions/README.md`. | FileGDB, DWG, **CityGML 2.0** | Free OGD |
| Ground-truth / height verification | **swissSURFACE3D** | Classified airborne LiDAR, 15–20 pts/m². Classes: Ground / Low/Med/High veg / **Building** / Water / Bridge / power lines / façades. Full national (7-stage survey 2017–2024/25). Newest tiles: **COPC** (cloud-native); older: zipped `.las` (LAZ 1.2). | LAZ 1.2 / COPC | Free OGD, no login |
| DSM raster | **swissSURFACE3D Raster** | 0.5m DSM (ground + veg + buildings); full national by 2025. | GeoTIFF, 1 km² tiles | Free OGD |
| DTM (bare earth) | **swissALTI3D** | 0.5m or 2m grid, terrain only; 6-year cycle; full national. | GeoTIFF, 1 km² tiles | Free OGD |
| Attribute register | **GWR (BFS)** `housing-stat.ch` | EGID-linked per-building: **GASTW** (Anzahl Geschosse), **GBAUJ** (Baujahr), **GKAT/GKLAS** (type), **GAREA** (footprint area), GVOL (volume), heating fields. Stufe A public. ≤48h update. **API VERIFIED LIVE 2026-07-24.** | API/JSON via `madd.bfs.admin.ch/eCH-0206` | Public / Stufe A open |

## CityGML version — CONFIRMED

> **CityGML 2.0** — confirmed from official swisstopo product page
> (`swisstopo.admin.ch/en/landscape-model-swissbuildings3d-citygml-20240814`, 2024-08-14):
> *"swisstopo is providing some of the 3D building models from swissBUILDINGS3D 3.0 Beta in the open
> data format CityGML 2.0."*

The CityGML format is available for 3.0 Beta cantons only (not 2.0 product); 2.0 is available in
FileGDB and DWG. Plan ingestion pipeline for **CityGML 2.0**.

## The join that matters

`swissBUILDINGS3D` (geometry) + `GWR` (attributes) share the **EGID** key:
- **3.0 Beta cantons:** EGID baked directly into the model → direct join
- **2.0 fallback cantons:** EGID joined via coordinate match from GWR buildings.geojson
  (`madd.bfs.admin.ch` download: `buildings.geojson` in LV95/CH1903+)

Result per building: real LOD2 3D solid with manually extracted roof shape **plus** storey count,
construction year, building type from an independent federal register updated ≤48h.

## GWR Stufe A field schema — CONFIRMED (PDF v4.2)

Full confirmed Stufe A building fields (all public, no restriction):

| Field code | Meaning |
|---|---|
| `EGID` | Eidg. Gebäudeidentifikator (federal building ID — the join key) |
| `EDID` | Eidg. Eingangsidentifikator |
| `EGAID` | Eidg. Gebäudeadressidentifikator |
| `GEBNR` | Amtliche Gebäudenummer |
| `GBEZ` | Name des Gebäudes |
| `GDEKT` | Kantonskürzel |
| `GGDENR` | BFS-Gemeindenummer |
| `GDENAME` | Gemeindename |
| `EGRID` | Eidg. Grundstückidentifikator (parcel join key) |
| `LGBKR` | Grundbuchkreisnummer |
| `LPARZ` | Parzellennummer |
| `GKODE` / `GKODN` | E/N coordinates (LV95) |
| `GKSCE` | Koordinatenherkunft |
| `DKODE` / `DKODN` | E/N entrance coordinates |
| **`GKAT`** | **Gebäudekategorie** (building category) |
| **`GKLAS`** | **Gebäudeklasse** (building class) |
| **`GSTAT`** | **Gebäudestatus** (projected/built/demolished) |
| **`GBAUJ`** | **Baujahr** (construction year) |
| `GBAUM` | Baumonat |
| `GBAUP` | Bauperiode |
| `GABBJ` | Abbruchjahr |
| **`GAREA`** | **Gebäudefläche** (footprint area m²) |
| `GVOL` | Gebäudevolumen (m³) |
| `GVOLNORM` | Norm used for volume |
| `GVOLSCE` | Volume information source |
| **`GASTW`** | **Anzahl Geschosse** (storey count) |
| `GAZZI` | Anzahl separate Wohnräume |
| `GSCHUTZR` | Zivilschutzraum |
| `GEBF` | Energiebezugsfläche (energy reference area) |
| `GWAERZH1/2`, `GENH1/2`, `GWAERSCEH1/2`, `GWAERDATH1/2` | Heating system (generator + energy source + info source + date) |
| `GWAERZW1/2`, `GENW1/2`, `GWAERSCEW1/2`, `GWAERDATW1/2` | Hot water system |

Stufe B (restricted, requires agreement): `GLOC1–4` (local codes), `GQUART` (quarter).

## GWR API — VERIFIED LIVE

```
POST https://madd.bfs.admin.ch/eCH-0206
Content-Type: text/xml
Body: eCH-0206 maddRequest (XML) with egid + requestContext=building

# GET shorthand (also works):
GET https://madd.bfs.admin.ch/eCH-0206?egid={EGID}&requestContext=building&lang=de
```

Live probe results (2026-07-24):
- EGID 1175237 (Poschiavo, canton GR): HTTP 200, XML returned — canton GR, coordinates, building data confirmed
- EGID 501001 (Heiden, canton AR): HTTP 200, XML returned — 5 dwellings, GASTW visible

Rate limit: 20 requests/minute.

## Gate answers

| # | Question | Answer | Confidence |
|---|---|---|---|
| a | Real footprint? | **YES** — nationwide since 2018 | `document` |
| b | Real height? | **YES** — LOD2 volumetric + LiDAR (swissSURFACE3D) + GWR GASTW | `document` + `VERIFIED-LIVE` |
| c | Real roof shape? | **YES** — manually stereo-photogrammetrically extracted, not generalized | `document` |

## Access notes

- All swisstopo products: `map.geo.admin.ch` selection UI or documented API; no registration.
- swissSURFACE3D COPC tiles (2024+): cloud-native, no full download needed.
- GWR: `madd.bfs.admin.ch` API (federal); canton mirrors available for ZH, TG, GL, SZ via opendata.swiss.
- swissBUILDINGS3D download also via STAC API at `data.geo.admin.ch`.

## Remaining open items (LOW effort)

| Item | Status | Action |
|---|---|---|
| CityGML version | ✅ **CLOSED — CityGML 2.0 confirmed** | No action needed |
| GWR Merkmalskatalog field schema | ✅ **CLOSED — Stufe A fields confirmed from PDF v4.2** | Schema documented above |
| 3.0 Beta canton list currency | ⚠️ Biannual update | Re-check `opendata.swiss/en/dataset/swissbuildings3d-3-0-beta` every 6 months |
| GKAT / GKLAS domain code values | ❓ Not yet transcribed | Read GWR PDF v4.2 `kodes_codes_codici.csv` section for full code lists |
