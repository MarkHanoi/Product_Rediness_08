# NEXT — Chicago (1714000, Illinois, USA)

> **Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD

## 1 — WHERE WE STOPPED

Scaffold only. The national US structure is characterised; Chicago is identified as the
recommended first US pilot city (strongest open-data tradition, confirmed Overture/USGS height
pilot coverage). No live probe of any Chicago-specific endpoint has been run. The two open
questions that determine whether Chicago can proceed on free sources alone or requires Zoneomics
are: (a) whether the Chicago open zoning dataset on `data.cityofchicago.org` includes numeric
FAR/height attributes, and (b) whether Overture/USGS height coverage extends to the full city
or only a downtown bbox.

## 2 — THE NUMBER

**0% — not started.** No Chicago parcel has been resolved to a zoning envelope. Denominator:
all private-buildable parcels within the Chicago municipal boundary (~600,000 parcels across
~234 km²).

## 3 — BLOCKERS

### 3.1 — Chicago open zoning dataset — numeric attributes unknown
- **What it is.** `data.cityofchicago.org` hosts a "Zoning Districts" dataset. Whether it
  includes FAR, max_height, and setback attributes (not just zone district code) is unknown.
- **Why it blocks.** If it includes numeric attributes, Chicago can be partially addressed
  on free sources alone. If zone-code only, Zoneomics is required for any numeric envelope.
- **THE EXACT RESUME STEP.**
  ```bash
  curl "https://data.cityofchicago.org/resource/5s3e-9pji.geojson?$limit=1" \
    | python3 -m json.tool | grep -E '"zone_type|far|max_height|setback|floor_area"'
  ```

### 3.2 — Planned Development (PD) coverage fraction unknown
- **What it is.** PDs supersede base zone rules for their parcels. The fraction of Chicago
  parcels (especially downtown) governed by PD agreements is unknown.
- **Why it blocks.** PD-governed parcels require individual ordinance reads — neither Zoneomics
  nor a zoning district shapefile reliably answers for them. The PD fraction determines the
  structural ceiling for any automated pipeline in Chicago.
- **THE EXACT RESUME STEP.** Search `data.cityofchicago.org` for a "Planned Development" layer;
  overlay with parcel count to estimate % of parcels affected.

### 3.3 — Zoneomics field completeness for Chicago not confirmed
- **What it is.** Zoneomics claims FAR + height for 20,000+ cities including Chicago. Whether
  FAR and max_height are non-null for Chicago zone types (especially D-series downtown zones with
  bonus FAR systems) is unconfirmed.
- **THE EXACT RESUME STEP.** Request a Zoneomics API trial; query five parcels spanning
  RS-1, RT-4, B3, D-DX, and M1 zone types. Record null rates for `far` and `max_height`.

## 4 — TRIP-WIRES

- **4.1 — If Zoneomics FAR/height fields confirmed non-null for Chicago** → Chicago commercial
  rate rises to ~55–60%; begin Phase 2 implementation (§RATE-IMPLEMENTATION-PLAN).
- **4.2 — If Chicago open zoning dataset confirmed to include numeric FAR/height** → free source
  rate for Chicago rises by ~10–15 pts; update LEGISLATION-RATE.md and replicate probe for LA and NYC.
- **4.3 — If Regrid MCP server evaluated** → check whether parcel jurisdiction routing from
  Regrid MCP eliminates need for a custom Regrid API integration for Chicago.
- **4.4 — If Overture/USGS height coverage confirmed city-wide for Chicago** → building height
  context is substantially resolved free; update `us/topics/buildings-lod-height.md`.

## 5 — WHAT IS ALREADY BUILT (do not redo)

- National US structure characterisation — `us/findings/USA-MASTER-DATA-SOURCE-STUDY.md`
- Chicago zone code vocabulary documented — in this `README.md §1`
- Chicago identified as pilot city with confirmed Overture/USGS pilot coverage

## 6 — VERIFIED SOURCES

| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| Chicago Municipal Code Title 17 | Chicago zoning ordinance — zone district rules, FAR tables, height limits | `published` | `chicago.gov/city/en/depts/dcd/supp_info/chicago_zoning.html` — full text |
| `data.cityofchicago.org` Zoning Districts | Zone district boundary + code per parcel | VERIFIED-LEAD (not live-probed) | Dataset `5s3e-9pji` |
| `data.cityofchicago.org` Building Footprints | Building geometry for Chicago | VERIFIED-LEAD (not live-probed) | `data.cityofchicago.org` — "Building Footprints (current)" |
| Overture/USGS height model (Chicago pilot) | Building heights — pilot coverage | `published` (announcement) | Chicago named in Overture/USGS pilot announcement |

## 7 — DEAD ENDS

- *(none yet — no probes run)*

## 8 — THE SMALLEST NEXT STEP

**Probe the Chicago zoning dataset for numeric attributes. Estimated: 0.25 dev-days.**

```bash
# Check field schema of Chicago Zoning Districts dataset
curl "https://data.cityofchicago.org/resource/5s3e-9pji.geojson?$limit=1" \
  | python3 -m json.tool

# Also check the metadata endpoint
curl "https://data.cityofchicago.org/api/views/5s3e-9pji.json" \
  | python3 -m json.tool | grep -E '"name|fieldName|dataTypeName"' | head -40
```

If FAR/height present → Chicago free source rate rises significantly; document in LEGISLATION-RATE.md and
start Phase 1b. If zone-code only → Zoneomics contract is the next gate; move to §3.3.
