---
name: Sweden NGP and open data probe
description: Live probe results for Swedish spatial data APIs; confirmed endpoints, geo-block finding, and rate estimates
---

## Confirmed endpoints (probed 2026-07-24)

**RAÄ WMS (heritage) — VERIFIED LIVE, globally accessible:**
- Endpoint: `https://pub.raa.se/visning/lamningar_v1/ows`
- HTTP 200; Fees: NONE; AccessConstraints: NONE
- GetFeatureInfo returns GeoJSON (`application/json`)
- Layers: fornlamning, ovrkulthistlamning, ejkulthistlamning, ingenantikvariskbedomning, mojligfornlamning
- CRS: CRS:84 + EPSG:3006 (SWEREF99TM)
- Coverage: all Sweden (lon 6.98–29.57, lat 54.63–69.31)

**NGP STAC/OAPIF (detaljplan) — CONFIRMED URL, GEO-BLOCKED:**
- Base URL: `https://api.lantmateriet.se/distribution/geodatakatalog/sokning/v2/detaljplan/v2`
- HTTP 403 "Geolocation Block!" from non-Swedish IPs — confirmed 2026-07-24
- API type: STAC v1.0.0 + OAPIF Part 1 + Part 2 (CRS)
- Auth: OAuth2 via `https://apimanager.lantmateriet.se/`
- Default CRS: WGS84; SWEREF99TM available via `crs` + `bbox-crs` params
- Pre-2022 plans legally absent from NGP (confirmed from official Lantmäteriet page)

**Why:** The geo-block is on Lantmäteriet's infrastructure, not a permission issue. Needs Swedish IP or proxy.
**How to apply:** Any NGP probe or production integration must route through Swedish infrastructure.

**Boverket Planbestämmelsekatalog API — CONFIRMED OPEN, exact URL unresolved from non-SE:**
- Portal: `https://api-portal.boverket.se/reference#api=planbestammelsekatalogenv2`
- Web app: `https://planbestammelsekatalogen.boverket.se/`
- Open, no registration; ~3,700 provision codes; JSON + XML + Excel; updated 2025-12-01
- Exact REST base URL: must be loaded from Azure APIM SPA in a browser from Swedish IP

**Lantmäteriet open data — CC0:**
- All cadastral, terrain, building products: CC0, commercial use permitted
- API portal: `https://apimanager.lantmateriet.se/`

## Rate estimate

- Headline: ~40% (post-2022 plans, optimistic land-area coverage)
- Conservative: ~20–30% (pre-2022 plans dominate land area)
- Heritage overlay: ~95% (verified live, free, national)
- Terrain: ~95% (CC0, complete, free)

## Key structural facts

- Swedish law is national/flat (PBL) — no region layer needed
- Pre-2022 plans NOT required to be in NGP (confirmed official source)
- PDF plan map is still legally binding ("pdf-plankartan som är juridiskt gällande" — Göteborg workshop May 2025)
- "Tolkningsskuld" = interpretation debt from digitising old plans
- Gothenburg (kommunkod 1480) = first city to deliver building record to NGP; recommended first target

## Dead ends confirmed

- `api.lantmateriet.se` from non-SE IPs → HTTP 403 "Geolocation Block!" — do NOT retry from non-Swedish cloud
- `pb.boverket.se` — dead domain (DNS fail)
- `api.boverket.se/planbestammelsekatalog/v2/bestammelser` — HTTP 404 (Azure APIM path must come from SPA)
- `planbestammelsekatalogen.boverket.se` — HTTP 000 from Replit (geo-restricted or firewall)
