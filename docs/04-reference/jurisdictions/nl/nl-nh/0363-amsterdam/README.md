# Amsterdam (`0363`) — Jurisdiction Pack

**Country:** `nl` · **Province:** Noord-Holland (`nl-nh`, ISO 3166-2 NL-NH) · **CBS gemeentecode:** `0363` ·
**Governing framework:** Omgevingswet (in force 1 Jan 2024) · **Operative plan:** omgevingsplan Amsterdam
(gemeente-wide) · **Last updated:** 2026-07-30 · **Maintainer:** UNASSIGNED

---

## Pack status

| Dimension | Status | Gate condition |
|---|---|---|
| **Context data (OSM bake)** | ✅ LIVE — `bake.mjs` REGIONS `netherlands` (national) | baked `buildings/roads/water/parks/landuse` at the Amsterdam bbox |
| **Parcel (Kadaster BRK)** | ✅ WIRED + LIVE — `pdok-nl` provider | click resolves to a Kadaster perceel (real polygon @ Amsterdam) |
| **Building height (3DBAG)** | ✅ SOURCE LIVE — per-city bake unlanded | per-city 3DBAG bbox bake OR OSM-footprint-join lands; provenance histogram probed |
| **Terrain (AHN)** | ⚠️ BAKEABLE (rung-50) — unverified | `terrain.verify.mjs` round-trip + deployed `layer.json` 200 |
| **Zoning (omgevingsplan / DSO)** | RESEARCH ONLY — national register known, NOT wired | DSO / `ruimtelijkeplannen.nl` probe → structured function + height for an Amsterdam parcel |
| **Rule pack — omgevingsplan** | NOT STARTED | omgevingsplan feed sourced + wired |
| **Overlay: welstand + heritage** | NOT STARTED | welstandsnota + rijks/gemeentelijke monumenten layers |

**Overall status: NOT STARTED (context + parcel + height sources live; no rule pack).**

## What governs here

The Netherlands has a **strong national data + planning framework**:

- **Omgevingswet** (in force **1 Jan 2024**) — the national framework law; the operative local plan is the
  gemeente-wide **omgevingsplan** (replacing the per-area bestemmingsplan), served through the national **DSO**
  (Digitaal Stelsel Omgevingswet) and `ruimtelijkeplannen.nl`, using the **STOP/TPOD** standard.
- Building rules are structured per *gebied*: *functie* (use), *goothoogte* (eaves height), *bouwhoogte*
  (building height), *bebouwingspercentage* (coverage). This tends to be a **structured-attribute** envelope
  (Lyon-style), not a formula KIND (Paris/Brussels) — *if* the DSO feed is wired.
- **Transitional caveat:** a given Amsterdam parcel may still be governed by a legacy bestemmingsplan under the
  omgevingsplan's transitional law until the gemeente fully migrates.
- **Overlays:** welstand (aesthetic control) and rijks/gemeentelijke monumenten (heritage) apply on top.

## National data sources (all national, work identically across NL)

| Layer | Source | Access | Status |
|---|---|---|---|
| Cadastral parcels | **Kadaster BRK** via PDOK | `service.pdok.nl` kadastralekaart WFS v5_0 `kadastralekaart:Perceel` — keyless | ✅ WIRED (`pdok-nl`) + live (real polygon @ Amsterdam) |
| Building geometry + address | **BAG** (Basisregistratie Adressen en Gebouwen) | PDOK / kadaster | national; 3DBAG joins BAG × AHN |
| Building height (measured) | **3DBAG** (BAG × AHN LiDAR) | `api.3dbag.nl/collections/pand/items` (OGC API Features, CityJSON) | ✅ WIRED (`heightSources.mjs 3dbag`, impl:live) |
| Terrain (DTM) | **AHN** (Actueel Hoogtebestand Nederland) | `service.pdok.nl/rws/ahn/wcs/v1_0` `dtm_05m`, keyless CC0 | ✅ `terrain.mjs nl` — GetCoverage HTTP 200 verified 2026-07-25 |
| Zoning / building rules | omgevingsplan via **DSO** / `ruimtelijkeplannen.nl` (STOP/TPOD) | national register | ⚠️ known, NOT wired this audit |
| Context buildings/roads/water/parks | `bake.mjs` REGIONS `netherlands` (OSM) | baked PMTiles | ✅ live |

## Source hierarchy

| Data needed | Source | Confidence |
|---|---|---|
| Parcel geometry | Kadaster BRK (PDOK) | `verified-live` (wired) |
| Building height | 3DBAG | `verified-live` (source); per-city bake unlanded |
| Terrain | AHN (PDOK WCS) | `verified-live` (keyless GetCoverage) |
| Zone/function + height rules | omgevingsplan / DSO | `research-lead` — not wired |

## Open questions

1. Does the **DSO / `ruimtelijkeplannen.nl`** API return a structured *functie* + *goothoogte*/*bouwhoogte*
   attribute for an Amsterdam parcel (Lyon-style), or a text/PDF rule? This decides whether NL is a config
   integration or a sourcing task.
2. For a given parcel, is the operative document the **omgevingsplan** or a **transitional bestemmingsplan**?
3. Does the deployed context tileset render 3DBAG measured heights, or OSM `assumed`? (Currently OSM — the
   whole-country bake refuses 3DBAG per-tile; see `HEIGHT.md`.)

---

**Related files:** `../../README.md` (country umbrella) · `../../COUNTRY-RATE.md` · `RATE.md` (composite
scorecard) · `NEXT.md` · `sources/SOURCES.md`.
