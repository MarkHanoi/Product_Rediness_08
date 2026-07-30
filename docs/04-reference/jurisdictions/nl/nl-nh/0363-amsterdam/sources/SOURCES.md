# Amsterdam (0363) — data sources

> **Status:** PARTIALLY WIRED — Kadaster BRK parcel + 3DBAG height + AHN terrain all wired/live-verified in
> code; the omgevingsplan/DSO zoning feed is a research lead (not probed/wired). No numeric rule value certified.

---

## A — VERIFIED (wired / live-verified)

| Field | Value / endpoint | Instrument | URL | Confidence |
|---|---|---|---|---|
| Parcel geometry | Kadaster BRK — `kadastralekaart:Perceel` (real polygon `perceel ASD04 F 6685 @ Amsterdam`) | national Kadaster (BRK) | `service.pdok.nl` kadastralekaart WFS v5_0 | `WIRED + LIVE` — `parcelProviders/registry.ts` `pdok-nl`, keyless |
| Building height (measured) | 3DBAG roof−ground (`b3_h_dak_50p − b3_h_maaiveld`) → `tagged` | 3DBAG (BAG × AHN LiDAR) | `api.3dbag.nl/collections/pand/items` (OGC API Features, CityJSON, EPSG:7415) | `WIRED + LIVE` — `heightSources.mjs 3dbag` impl:live; per-city bake unlanded |
| Terrain (DTM) | AHN `dtm_05m` (range −8..322 m NAP), GetCoverage → image/tiff | AHN (Actueel Hoogtebestand Nederland) | `service.pdok.nl/rws/ahn/wcs/v1_0` | `LIVE-VERIFIED` 2026-07-25 — keyless CC0, HTTP 200; `terrain.mjs nl` |
| Context buildings/roads/water/parks | OSM baked PMTiles | `bake.mjs` REGIONS `netherlands` (`netherlands-latest.osm.pbf`, bbox `3.30,50.75,7.30,53.70`) | `s3://pryzm-assets/tiles/…` | `live` (baked, national) |

## B — RESEARCH LEAD (needed before any numeric rule may ship)

| Field | Candidate source | Method |
|---|---|---|
| **Zone/function + height rules** | omgevingsplan via **DSO** / `ruimtelijkeplannen.nl` (STOP/TPOD) | Probe for an Amsterdam parcel → confirm structured *functie* + *goothoogte*/*bouwhoogte*/*bebouwingspercentage* vs. text |
| Operative document (omgevingsplan vs transitional bestemmingsplan) | DSO transitional-law status | Confirm which document governs the target parcel |
| Building geometry + address | BAG (Basisregistratie Adressen en Gebouwen) | national; already joined in 3DBAG |
| welstand / heritage overlays | welstandsnota + rijks/gemeentelijke monumenten | Confirm queryable layers |

⚠ Nothing in §B has been probed or wired in this audit — the LEGISLATION + ENVELOPE axes stay `not-assessed`.
No numeric height/coverage value from the omgevingsplan may ship until read + recorded by a verifier
(§CONTEXT-DATA-HONESTY).

*Cross-refs: `../../sources/SOURCES.md` (national) · `../../findings/NETHERLANDS-DATA-SOURCE-STUDY.md`.*
