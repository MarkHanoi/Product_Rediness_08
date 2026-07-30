# Netherlands (`nl`) — national data sources

> Per-field national citations. City-level citations live in `nl-<province>/<CBS>-<slug>/sources/`.
> Only live-verified / wired feeds go in §A; research leads go in §B (never promote a lead to §A without a probe).

## A — VERIFIED / WIRED (national)

| Field | Source | Access | Evidence | Confidence |
|---|---|---|---|---|
| **Cadastral parcels** | Kadaster **BRK** via PDOK | `service.pdok.nl` kadastralekaart WFS v5_0 `kadastralekaart:Perceel`, keyless | `parcelProviders/registry.ts` `pdok-nl` note: real polygon `perceel ASD04 F 6685 @ Amsterdam`, HTTP 200 application/json | `WIRED + LIVE` |
| **Building geometry + measured height** | **3DBAG** (BAG × AHN LiDAR) | `api.3dbag.nl/collections/pand/items` — OGC API Features, CityJSON, EPSG:7415 (RD+NAP) | live-verified 2026-07-21/24: LoD 0/1.2/1.3/2.2, `b3_h_dak_50p`/`b3_h_nok`/`b3_h_maaiveld`, `b3_dak_type`, sub-m RMSE, CC BY 4.0; `heightSources.mjs 3dbag` impl:live | `WIRED + LIVE` (source); per-city bake unlanded |
| **Terrain (DTM/DSM)** | **AHN** (Actueel Hoogtebestand Nederland) | `service.pdok.nl/rws/ahn/wcs/v1_0` — WCS 2.0.1, `dtm_05m` / `dsm_05m`, keyless CC0 | `terrain.mjs nl` probe: GetCapabilities HTTP 200; GetCoverage `dtm_05m` → HTTP 200 image/tiff (351,985 B) LIVE-VERIFIED 2026-07-25; NAP (EPSG:5709), `geoidSepM 43.0` | `LIVE-VERIFIED` |
| **Context buildings/roads/water/parks** | OSM (Geofabrik `netherlands-latest.osm.pbf`) | `bake.mjs` REGIONS `netherlands`, bbox `3.30,50.75,7.30,53.70` (national) → baked PMTiles | national whole-country context bake | `live` (baked) |

## B — RESEARCH LEAD (needed before any legislation/envelope rule may ship)

| Field | Candidate source | Method / status |
|---|---|---|
| Zone/function + height/density rules | omgevingsplan via **DSO** ("Regels op de kaart") / `ruimtelijkeplannen.nl`, STOP/TPOD | Probe at one address → structured field vs plan text (the critical unknown; `NEXT.md §3.1`) |
| Building address register | **BAG** (Basisregistratie Adressen en Gebouwen) | national; joined in 3DBAG |
| Context roads/water/green (authoritative) | **BGT** `api.pdok.nl/lv/bgt/ogc/v1/collections` | HTTP 000 from the spike env (possibly egress) — re-verify (`README.md`); OSM bake is the shipping path |
| Heritage overlays | rijksmonumenten / beschermd stadsgezicht | not probed as a per-parcel geo-layer |

⚠ Nothing in §B has been probed/wired — the LEGISLATION + ENVELOPE axes stay `not-assessed` (§CONTEXT-DATA-HONESTY).

*Cross-refs: `../README.md`, `../LOD-RATE.md`, `../findings/NETHERLANDS-DATA-SOURCE-STUDY.md`, `../COUNTRY-RATE.md`.*
