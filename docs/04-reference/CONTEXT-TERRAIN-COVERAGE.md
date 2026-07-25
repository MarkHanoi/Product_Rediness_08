# Context Terrain — Coverage & Sourcing (Phase 3)

> **Canonical sourcing: see [`jurisdictions/GEO-DATA-SOURCING-MASTER.md`](jurisdictions/GEO-DATA-SOURCING-MASTER.md)**
> (terrain + height · dataset · endpoint · auth · licence · verdict, founder-verified 2026-07-25; decisions in
> [ADR-0277](../02-decisions/adrs/ADR-0277-geo-data-sourcing-map-open-datasets-derived-heights.md)). This doc
> reports **per-city terrain pipeline status**; the master is authoritative on *sourcing*. Where they differ,
> the master wins — notably: **Brussels-Capital is OK & keyless** (the §2.2 BLOCKED prompt below was a research
> error), and **Bavaria/Munich is OK (keyless CC BY 4.0)**.

> **Status: LIVE-PROBED SOURCING TABLE.** Every row's access verdict is a fact from an HTTP probe on
> 2026-07-24 / re-probed 2026-07-25 from a non-Replit machine (see `tools/context-bake/terrain.mjs`
> §1 `TERRAIN_SOURCES` for the exact probe URL + evidence string per country, and `--regions` for the
> per-city mapping). This doc is the honest answer to "does terrain render in city X, and if not why".

## 0 — What "terrain renders" requires (the whole chain)

1. An **open, commercial-OK national DTM** (bare-earth) for the country — this doc's subject.
2. `tools/context-bake/terrain.mjs` compiles a clip → Cesium **quantized-mesh** tiles → R2
   `tiles/terrain/<city>/` (via `.github/workflows/terrain-bake.yml`).
3. The client resolves the site's lon/lat → city (`apps/editor/src/ui/geospatial/terrainCoverage.ts`)
   and attaches a `CesiumTerrainProvider` (`CesiumViewport.maybeAttachTerrainProvider`). GUARDED: no
   baked tileset → the flat `EllipsoidTerrainProvider` stays (no regression).

A city renders terrain only when **all three** hold. This table is step 1; a ✅-access city can still
be "flat" until its tiles are baked (step 2) — that is a bake dispatch, not a sourcing gap.

## 1 — Per-city / per-country coverage

Access legend: **keyless** = open HTTP 200 + real coverage, no auth · **token** = open licence but a
(usually free) API key is required · **BLOCKED** = no open commercial DTM located.
`commercial?` = is the licence usable for a commercial product (the deciding question — an open-for-
research licence is **not** enough).

| City(ies) | Country | DTM dataset | Grid | Vertical datum | Licence | commercial? | Access | Notes / reason |
|---|---|---|---|---|---|---|---|---|
| Amsterdam | 🇳🇱 NL | AHN DTM (PDOK WCS) | 0.5 m | NAP (EPSG:5709) | CC0 | ✅ yes | **keyless** | GetCoverage image/tiff verified (the reproducible one-city proof). **Wired end-to-end today.** |
| Paris, Lyon | 🇫🇷 FR | RGE ALTI / IGN (Géoplateforme) | 1 m | NGF-IGN69 | etalab 2.0 | ✅ yes | **keyless** | WMS-r/WCS + altimetrie REST keyless. Needs proj4 (Lambert-93) adapter. |
| Rome, Milan | 🇮🇹 IT | TINITALY/01 DEM (INGV) | 10 m | Italian geoid (orthometric) | CC-BY 4.0 | ✅ yes | **keyless** | WMS `tinitaly_dem`, AccessConstraints=none (probed 2026-07-25). ⚠ 10 m — coarser than the sub-metre DTMs elsewhere, but a genuine national bare-earth model. |
| London | 🇬🇧 GB | EA LIDAR Composite DTM 1 m | 1 m | ODN (Newlyn) | OGL v3 | ✅ yes | **keyless** | WCS 2.0.1 `…Lidar_Composite_Elevation_DTM_1m` (probed 2026-07-25). England only (Scotland/Wales separate portals; London covered). Needs proj4 (EPSG:27700) adapter. |
| Copenhagen | 🇩🇰 DK | DHM/Terræn (Datafordeler) | 0.4 m | DVR90 (EPSG:5799) | free — verify commercial clause | ⚠ verify | **token** | `&apikey=<DATAFORDELER_API_KEY>` (Basic Auth retired 2026, commit 1fc5bc8b). |
| Oslo | 🇳🇴 NO | NDH / Kartverket DTM | 1 m | NN2000 (EPSG:5941) | NLOD / CC-BY | ✅ yes | **keyless** | WCS 1.1 Capabilities live from a non-Replit host. |
| Stockholm | 🇸🇪 SE | Lantmäteriet Markhöjdmodell | 1 m | RH2000 (EPSG:5613) | CC0 (open since 2022) | ✅ yes | **token** | Open CC0 but delivered via account-gated download — free `LANTMATERIET_API_KEY` (probed: unauth routes 404). |
| Helsinki | 🇫🇮 FI | NLS/MML Korkeusmalli 2 m | 2 m | N2000 (EPSG:5717) | CC-BY 4.0 | ✅ yes | **token** | WCS returns **401 without a key** (probed 2026-07-25); free NLS open-data `MML_API_KEY`. |
| Zürich, Geneva, Bern | 🇨🇭 CH | swissALTI3D (STAC GeoTIFF) | 0.5 m | LN02 (EPSG:5728) | swisstopo open (BGDI) | ✅ yes | **keyless** | Bare-earth STAC assets on public data.geo.admin.ch. Needs proj4 (LV95) adapter. |
| Madrid, Barcelona, Córdoba | 🇪🇸 ES | PNOA MDT (IGN/CNIG) + ICGC (Cat.) | 5 m | EVRF2007 / REDNAP | CC-BY 4.0 | ✅ yes | **keyless** | INSPIRE Elevation WMS live. Terrain is per-CITY (building bake is one national `spain` region). Needs proj4 (ETRS89-UTM) adapter. |
| New York, San Francisco | 🇺🇸 US | 3DEP 1 m DEM (USGS TNM) | 1 m | NAVD88 (GEOID18) | public domain | ✅ yes | **keyless** | TNM products API → S3 GeoTIFF. ⚠ geoid sep is NEGATIVE in CONUS. Needs proj4 (state UTM) adapter. |
| **Lisbon, Porto** | 🇵🇹 PT | — | — | Cascais 1938 | — | — | **BLOCKED** | DGT publishes cartography but **no open national bare-earth DTM** WCS/tiles (guessed elevation route 404). Only fallback = Copernicus (EU-DEM 25 m deprecated / GLO-30 is a DSM). See prompt §2.1. |
| **Brussels** | 🇧🇪 BE | — (region-split) | — | TAW/DNG | — | — | **BLOCKED** | No national DTM; region-split (Flanders DHMV, Wallonia MNT both open) but **Brussels-Capital is an enclaved separate region** neither reliably covers. URBIS GeoServer exposes no elevation coverage (probed). See prompt §2.2. |
| **Berlin** | 🇩🇪 DE | Geoportal Berlin DGM1 (not wired) | 1 m | DHHN2016 | dl-de/by-2-0 | ✅ likely | **BLOCKED (per-Land)** | Germany is 16 per-Land portals; only **NRW** is in the registry. Berlin has its own DGM1 — a separate adapter. See prompt §2.3. |
| **Munich** | 🇩🇪 DE | Bayern DGM1 (not wired) | 1 m | DHHN2016 | dl-de/by-2-0 | ✅ likely | **BLOCKED (per-Land)** | Bavaria (Geodaten Bayern / LDBV) DGM1 — separate adapter. See prompt §2.3. |
| **Riyadh, Jeddah** | 🇸🇦 SA | — | — | — | — | — | **BLOCKED** | GEOSA publishes **no open DEM/DSM** service. Matches the Saudi OSM building-desert. See prompt §2.4. |

**Bakeable now: 18 cities · Blocked: 7 cities** (`node tools/context-bake/terrain.mjs --regions`).

### Datum note (honest)
The orthometric→ellipsoidal lift (`geoidSepM`) in the registry is a **per-city constant** (cm-accurate
over one 256 m tile). A per-tile EGM2008 lookup should replace it when a geoid grid is wired — the
constant is fine for the current tile sizes but is an approximation, not a survey value.

### ⚠ FABDEM is NOT a commercial global drape
FABDEM (30 m, global, bare-earth) is the tempting "cover everywhere" fallback. It is licensed
**CC-BY-NC-SA 4.0 — NON-COMMERCIAL**. It **must not** be shipped as a drape surface for a commercial
product without clearing the clause. It is carried in the registry as `_fabdem` with
`commercialOk:false` precisely so it can never be selected by accident. For a blocked country the
honest answer is "flat ground + a founder prompt", **not** "silently drape FABDEM".

---

## 2 — Blocked-country founder prompts (copy-paste)

Each prompt states the precise reason and exactly what to verify. Paste the relevant one to the
founder / the in-country contact.

### 2.1 🇵🇹 Portugal (Lisbon, Porto)
```
🇵🇹 Portugal terrain — BLOCKED. We could not find an open, commercial-OK national bare-earth DTM.
DGT (dgterritorio.gov.pt) publishes cartography but no open DTM WCS/tile service we could reach
(our guessed elevation WCS returned 404 on 2026-07-25). The only global fallback is Copernicus —
EU-DEM (25 m, deprecated) or GLO-30 (a surface/DSM, not bare-earth) — neither is acceptable as a
commercial national terrain drape.
Please confirm ONE of:
  1) Does DGT (or DGT's "Modelo Digital do Terreno") publish a downloadable/WCS DTM, and under what
     licence (is it commercial-OK, i.e. not research-only)?
  2) If not, are you OK using Copernicus GLO-30 DSM as a low-confidence stopgap (with the caveat it
     is a surface model, so buildings/trees are baked into the ground), OR should Portugal stay flat?
```

### 2.2 🇧🇪 Belgium (Brussels)
```
🇧🇪 Brussels terrain — BLOCKED. Belgium has no national DTM — elevation is region-split. Flanders
(DHMV II) and Wallonia (MNT LiDAR) are both open, but Brussels-Capital is a separate enclaved region
that neither reliably covers, and the Brussels URBIS GeoServer exposes no elevation coverage (probed
2026-07-25). We need the Brussels-Capital-specific DTM.
Please confirm:
  1) The Brussels-Capital DTM/MNT service — is it Bruxelles Environnement / CIRB(BRIC)? A WCS/WMS or
     download URL?
  2) Its licence — commercial-OK? And its grid resolution + vertical datum (TAW/DNG?).
  (If only Flanders/Wallonia are acceptable, we can wire those for sites just outside the region,
   but a Brussels-centre site needs the Brussels-Capital source.)
```

### 2.3 🇩🇪 Germany (Berlin, Munich — and the other 14 non-NRW Länder)
```
🇩🇪 Germany terrain — BLOCKED beyond NRW. Germany's elevation is 16 per-Land portals; we have only
North Rhine-Westphalia (DGM1, keyless WCS) wired. Berlin and Munich each need their own Land adapter:
  • Berlin  → Geoportal Berlin "DGM1" (FIS-Broker / geoportal.berlin.de)
  • Munich  → Bavaria "DGM1" (Geodaten Bayern / LDBV / geodaten.bayern.de)
Both are dl-de/by-2-0 (attribution, commercial-OK) as far as we know. Please confirm, per Land you
want live:
  1) The DGM1 WCS/download endpoint URL, and
  2) That the licence is commercial-OK (dl-de/by-2-0 or similar).
This mirrors the existing per-Land German BUILDING state-router (L-511) — same 16-portal problem.
```

### 2.4 🇸🇦 Saudi Arabia (Riyadh, Jeddah)
```
🇸🇦 Saudi terrain — BLOCKED. We found no open national DTM via GEOSA/MOMRAH — GEOSA (geosa.gov.sa)
publishes no DEM/DSM WCS/WMS/tile service, and there is no keyless national bare-earth model (this
matches the Saudi OSM building-desert we hit for footprints — the country is data-scarce and
government-gated). FABDEM covers Saudi but is CC-BY-NC (non-commercial) so we will NOT ship it.
Please ask your GEOSA / MOMRAH / Real Estate General Authority contact:
  1) Does GEOSA publish (or licence) a DEM or DSM — a WCS/WMS or a tile service — and at what grid?
  2) What are the licence terms (commercial-OK?) and is it geo-fenced/token-gated like the parcel data?
Until then Riyadh/Jeddah render flat ground (buildings + context still load; only terrain is absent).
```

---

## 3 — Free-key (token) cities — action, not blocked
DK / SE / FI are **open-licence** but need a free API key added as a **repo secret** (they are Fly
secrets today only if at all):

- **🇩🇰 Copenhagen** — `DATAFORDELER_API_KEY` (reuse the Matrikel key; mint at portal.datafordeler.dk).
- **🇸🇪 Stockholm** — `LANTMATERIET_API_KEY` (free Lantmäteriet consumer key).
- **🇫🇮 Helsinki** — `MML_API_KEY` (free NLS open-data key, asiointi.maanmittauslaitos.fi).

`terrain-bake.yml` already threads all three as env; add each as a **repo** secret (not only Fly)
before baking that city, or its authenticated fetch fails in CI.

## 4 — Wiring status (what's code-complete vs pending)
- ✅ **Client render wiring** — shipped (`terrainCoverage.ts` + `CesiumViewport.maybeAttachTerrainProvider`).
- ✅ **Compiler + datum fix + quantized-mesh encoder** — shipped (`terrain.mjs`, commit 4fe33c1d).
- ✅ **Registry + per-city REGIONS + live probes** — shipped (this doc's table).
- ✅ **CI** — `terrain-bake.yml` (manual dispatch).
- ⏳ **Per-country fetch/reproject adapters** — only 🇳🇱 NL (Amsterdam) is wired end-to-end. Every other
  keyless country needs a proj4 reprojection adapter (its native CRS → WGS-84) plus a GeoTIFF fetch
  for its DTM protocol. Until then those cities SKIP loudly in the bake (no wrong-datum tileset).
