# Switzerland — Buildings / LOD / Height (context layer)

> Part of L-511 (`../../../V1-LAUNCH-READINESS-AUDIT.md`). Research ground-truth:
> `../findings/SWITZERLAND-MASTER-DATA-SOURCE-STUDY.md`. **Gate: PASSED** (2026-07-24).

## Source stack (not a single dataset — use all four tiers)

| Tier | Dataset | What it gives | Format | Licence |
|---|---|---|---|---|
| LOD2 geometry (baseline) | **swissBUILDINGS3D 2.0** | Closed solid OR separate roof/façade/footprint elements; manually stereo-photogrammetrically extracted roofs incl. overhangs. ±30–50cm planimetric/altimetric. **Full national + Liechtenstein since 2018.** | FileGDB, DWG, CityGML | Free OGD — `swisstopo.admin.ch/en/landscape-model-swissbuildings3d-2-0` |
| LOD2 geometry (enhanced) | **swissBUILDINGS3D 3.0 Beta** | Same LOD2 geometry + **EGID** (federal building ID) baked into the model; cleaner roof/façade separation. Biannual update. **Canton coverage: see §Coverage gaps below.** Route to 2.0 for all other cantons. | FileGDB, DWG, CityGML | Free OGD — `opendata.swiss/en/dataset/swissbuildings3d-3-0-beta` |
| Ground-truth / height verification | **swissSURFACE3D** | Classified airborne LiDAR point cloud, 15–20 pts/m². Classes include **Building**, Ground, vegetation (Low/Med/High), Water, Bridge, façades. Full national coverage (7-stage survey, completed 2017–2024/25). Newest tiles (Eastern Switzerland, since 2024): **COPC** (cloud-native, no full download required); older tiles: zipped `.las`. | LAZ 1.2 (older), COPC (newer) | Free OGD, no login |
| DSM raster (derived LiDAR) | **swissSURFACE3D Raster** | 0.5m grid DSM (ground + vegetation + buildings). Full national by 2025. Replaces on-request DSM orders. | GeoTIFF, 1 km² tiles | Free OGD |
| DTM (bare earth) | **swissALTI3D** | 0.5m or 2m grid, terrain only (no vegetation/buildings). 6-year update cycle. | GeoTIFF, 1 km² tiles | Free OGD |
| Attribute register — **key addition** | **GWR (Gebäude- und Wohnungsregister)**, Federal Statistical Office (BFS) | Per-building, EGID-linked: **Anzahl Geschosse** (storey count), **Baujahr** (construction year), **Gebäudeart** (building type), **Gebäudefläche** (footprint area), heating type, dwelling count. "Stufe A" data = public. Updated ≤48h nationally; Zürich / Thurgau / Glarus / Schwyz refresh daily. | API/JSON via `housing-stat.ch` (BFS); also republished by several cantons/cities via opendata.swiss | Public / Stufe A open |

## The join that matters

`swissBUILDINGS3D` (geometry) + `GWR` (attributes) share the **EGID** key. This gives, per building:
a real modeled 3D solid with actual roof shape (not generalized) **plus** storey count and construction
year from an independent statistical register. Materially richer than any other country in this series
(Germany's LoD2-DE: geometry only; Norway's FKB-Bygning: footprint + top-height only; neither has an
open, nationwide-linked storey-count register).

Where 3.0 Beta is **not yet live**, EGID can still be joined to 2.0 geometry via GWR coordinate match
— this is a fidelity/convenience gap, not a data-availability gap.

## Gate answers

| # | Question | Answer | Evidence source |
|---|---|---|---|
| a | Real footprint? | **YES** — swissBUILDINGS3D 2.0, nationwide since 2018 | `buildings-lod-height_1784895334355.md` |
| b | Real height? | **YES** — volumetric LOD2 solid + independent LiDAR (swissSURFACE3D) + GWR storey count | Same |
| c | Real roof shape? | **YES** — manually stereo-photogrammetrically extracted, not modeled/generalized | Same |

## 3.0 Beta coverage (EGID baked-in vs. join fallback)

**Live in 3.0 Beta (EGID in model):**
`AG, AI, AR, BE, BL, BS, FR, GL, JU, LU, NE, NW, OW, SG, SH, SO, SZ, TG, UR` + **city of Zürich only**.

**Not yet live in 3.0 Beta (use 2.0 + GWR join):**
`GE` (Geneva), `VD` (Vaud — incl. Lausanne), `VS` (Valais), `TI` (Ticino), `ZG` (Zug),
`GR` (Graubünden), and **canton Zürich outside the city itself**.

⚠ **3.0 Beta updates biannually.** Re-check this list against
`opendata.swiss/en/dataset/swissbuildings3d-3-0-beta` every 6 months before finalizing a
region-by-region build plan — additional cantons may have been added since 2026-07-24.

## Access notes

- swissBUILDINGS3D and swissSURFACE3D: `map.geo.admin.ch` selection UI or documented API;
  no registration required.
- swissSURFACE3D COPC tiles (2024 onward): usable with cloud-native point-cloud tooling without full
  download. Older tiles: zipped `.las`.
- GWR feed: `housing-stat.ch` (BFS). Several cantons (Zürich, Thurgau, Glarus, Schwyz) also
  publish via their own opendata.swiss entries — useful as regional mirrors.

## Open items (before implementation commits)

| Item | What to confirm | How |
|---|---|---|
| GWR Merkmalskatalog field schema | Exact field names, types, Stufe A/B split | Read `housing-stat.ch/files/881-2200.pdf` field-by-field before building schema mapping |
| CityGML export conformance level | CityGML 2.0 vs. 3.0 — matters for ingestion pipeline | Download one sample tile from `map.geo.admin.ch` and inspect the CityGML version declaration |
| 3.0 Beta canton coverage | Additional cantons added since 2026-07-24 | Check `opendata.swiss/en/dataset/swissbuildings3d-3-0-beta` distribution list |
