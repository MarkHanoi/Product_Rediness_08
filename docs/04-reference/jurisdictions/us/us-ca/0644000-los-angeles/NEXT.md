# NEXT — Los Angeles (0644000, California, USA)

> **Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD

## 1 — WHERE WE STOPPED

Scaffold only. Chicago is the recommended first US pilot city; LA is second. The key structural
complications identified for LA vs Chicago: the California Coastal Commission overlay (adds a
second legal authority layer in the Coastal Zone), Specific Plans (LA analogue of Chicago PDs),
the height-district suffix system (zone code alone is insufficient — height district must be
resolved too), and Q-conditions (parcel-specific zoning modifications not derivable from the
base zone). No LA-specific endpoint has been probed.

## 2 — THE NUMBER

**0% — not started.** No LA parcel has been resolved to a zoning envelope.

## 3 — BLOCKERS

### 3.1 — LA open zoning dataset — numeric attributes unknown
- **What it is.** `geohub.lacity.org` publishes a Zoning Information layer. Whether it includes
  numeric FAR and max height (not just zone code string like `C2-1`) is unknown.
- **THE EXACT RESUME STEP.**
  ```bash
  # Find the LA Zoning dataset on GeoHub
  curl "https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services/ZONING_INFORMATION/FeatureServer/0/query?where=1%3D1&outFields=*&resultRecordCount=1&f=json" \
    | python3 -m json.tool | grep -E '"ZONE_CLAS|FAR|HEIGHT|SETBACK"'
  # (Endpoint URL is approximate — verify from geohub.lacity.org catalogue)
  ```

### 3.2 — Height district table derivation from LAMC
- **What it is.** LA's max height and FAR depend on both the base zone AND the height district
  suffix (VL, 1, 2, 3, 4). LAMC §12.21.1 tables define these. These are fixed tables that can
  be built as a static lookup — but only after reading the LAMC text.
- **THE EXACT RESUME STEP.** Read LAMC Article 2, Section 12.21.1 (Height Districts) at
  `library.amlegal.com/codes/los_angeles/latest/lamc/0-0-0-109218` — extract the height and
  FAR values for each height district. Build a lookup table base_zone × height_district → FAR + max_height.

### 3.3 — California Coastal Commission boundary
- **What it is.** The CCC Coastal Zone boundary determines which parcels require CCC approval
  in addition to LA city zoning. The CCC publishes a GIS layer.
- **THE EXACT RESUME STEP.**
  ```bash
  curl "https://maps.coastalzone.ca.gov/..." # Check coastal.ca.gov for the Coastal Zone boundary WFS/feature service
  ```

### 3.4 — Specific Plan coverage fraction unknown
- **What it is.** LA's many active Specific Plans (Ventura, Hollywood, Venice, Boyle Heights,
  etc.) supersede the base LAMC zone. The fraction of LA parcels covered by a Specific Plan is
  not measured.
- **THE EXACT RESUME STEP.** Check `geohub.lacity.org` for a "Specific Plan Areas" layer;
  overlay with parcel count to estimate coverage fraction.

## 4 — TRIP-WIRES

- **4.1 — If Chicago zoning open-data probe shows numeric FAR/height attributes** → run the
  same probe on `geohub.lacity.org` LA zoning layer immediately.
- **4.2 — If Zoneomics handles LA height district suffixes correctly** (confirmed in Chicago
  probe) → LA Zoneomics integration is likely straightforward; proceed to Phase 3.
- **4.3 — If LARIAC LiDAR/LOD2 products confirmed free** → LA building height coverage may be
  stronger than the national Overture estimate. Update `us/topics/buildings-lod-height.md`.
- **4.4 — If CCC Coastal Zone boundary API confirmed free** → add as standard overlay for LA
  (and flag for any other California city).

## 5 — WHAT IS ALREADY BUILT (do not redo)

- LA zone code vocabulary + height district system documented — `README.md §1`
- LA identified as pilot city #2; overlay complications documented

## 6 — VERIFIED SOURCES

| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| LAMC Title 1, Article 2 (Zoning) | LA zoning ordinance — zone districts, height districts, FAR, setbacks | `published` | `library.amlegal.com/codes/los_angeles/` |
| `geohub.lacity.org` Zoning layer | Zone district boundary + code | VERIFIED-LEAD (not live-probed) | Search "Zoning Information" on GeoHub |
| California Government Code §65000 et seq. | State enabling law for municipal zoning | `published` | `leginfo.legislature.ca.gov` |
| California Coastal Act (Pub. Resources Code §30000 et seq.) | CCC authority and Coastal Zone definition | `published` | `leginfo.legislature.ca.gov` |

## 7 — DEAD ENDS

- *(none yet — no probes run)*

## 8 — THE SMALLEST NEXT STEP

**Complete Chicago Phase 0 first.** After Chicago probe, run the same probe on LA GeoHub
zoning layer. The LA probe costs ~0.25 dev-days and answers whether LA can address free or
requires Zoneomics for numeric attributes — the same question as Chicago.
