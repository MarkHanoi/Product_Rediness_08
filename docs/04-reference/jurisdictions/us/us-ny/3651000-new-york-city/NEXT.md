# NEXT — New York City (3651000, New York, USA)

> **Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD

## 1 — WHERE WE STOPPED

Scaffold only. NYC is identified as the most data-rich but most structurally complex of the
three US pilot cities. The single most important open question is whether MapPLUTO's
`MaxAllwFAR` field provides a machine-readable, parcel-level FAR value — if it does, NYC may
have a materially higher free-source rate than Chicago or LA. No NYC-specific endpoint probe
has been run. Do Chicago first; then probe MapPLUTO before any other NYC-specific work.

## 2 — THE NUMBER

**0% — not started.** No NYC parcel has been resolved to a zoning envelope. Denominator: all
private-buildable tax lots in the five boroughs (~860,000 lots in MapPLUTO).

## 3 — BLOCKERS

### 3.1 — MapPLUTO `MaxAllwFAR` field — structured FAR at parcel level (HIGHEST VALUE PROBE)
- **What it is.** NYC's MapPLUTO dataset includes `MaxAllwFAR` (maximum allowable FAR per
  lot), `ResidFAR`, `CommFAR`, `FacilFAR`. If these are populated as numeric fields, NYC has
  a free, structured, parcel-level FAR source with no equivalent in Chicago or LA.
- **Why it blocks.** If `MaxAllwFAR` is populated and current, NYC's free rate for FAR rises
  dramatically — potentially to ~50–60% for non-SPD lots. This changes the NYC cost model
  entirely (commercial Zoneomics less critical for FAR; SPDs become the ceiling limiter).
- **THE EXACT RESUME STEP.**
  ```bash
  # MapPLUTO via NYC Open Data API — inspect one lot
  curl "https://data.cityofnewyork.us/resource/64uk-42ks.json?$limit=1" \
    | python3 -m json.tool | grep -E '"maxallwfar|residfar|commfar|facilfar|zonedist1|bldgclass"'

  # Check the field completeness (null rate) for a sample
  curl "https://data.cityofnewyork.us/resource/64uk-42ks.json?$limit=100&$select=maxallwfar,zonedist1,borocode&$where=borocode='1'" \
    | python3 -m json.tool
  ```

### 3.2 — ZOLA API — structured zoning lookup by BBL
- **What it is.** NYC's ZOLA (Zoning and Land use Application) provides parcel-level zoning
  information. A ZOLA API may return structured FAR + height + special districts by BBL.
- **THE EXACT RESUME STEP.**
  ```bash
  # ZOLA API — lookup by BBL (example: Manhattan lot)
  # BBL format: borocode(1)+block(5)+lot(4)
  curl "https://api.zola.nyc/zoning/lot/1/00847/0023" \
    | python3 -m json.tool
  # (URL pattern approximate — check api.zola.nyc or zola.planning.nyc.gov for actual endpoint)
  ```

### 3.3 — Special Purpose District coverage fraction unknown
- **What it is.** NYC has 80+ Special Purpose Districts. SPDs modify or supersede the base
  Zoning Resolution rules for their parcels. The fraction of NYC lots covered by an SPD
  (especially in Manhattan) is significant but not measured.
- **Why it blocks.** SPD lots require individual SPD-ordinance sourcing; MapPLUTO's base zone
  FAR may be wrong for them. The SPD fraction determines the structural ceiling.
- **THE EXACT RESUME STEP.** MapPLUTO has a `SPDist1` field — query the MapPLUTO API for
  the fraction of Manhattan lots with a non-null `SPDist1`.

### 3.4 — NYC 3D building model access
- **What it is.** NYC publishes a 3D building model (LOD2 equivalent) on its open data portal.
  Currency and download format need confirmation.
- **THE EXACT RESUME STEP.** Search `data.cityofnewyork.us` for "3D Building Model" — confirm
  the dataset is current (< 3 years old), free, and what format (Shapefile/CityGML/OBJ).

## 4 — TRIP-WIRES

- **4.1 — If MapPLUTO `MaxAllwFAR` confirmed populated** → NYC free-source rate for FAR is
  significantly higher than Chicago or LA; update RATE.md with measured rate; NYC may not
  need Zoneomics for FAR (only for SPD-complex lots).
- **4.2 — If ZOLA API returns structured FAR/height by BBL (free)** → NYC has a structured
  zoning API at no cost — unique among the three pilot cities. Document endpoint and update
  RATE.md; this is a material change to the US country-level assessment.
- **4.3 — If NYC 3D building model confirmed current and free** → NYC LOD2 context is fully
  available; update `us/topics/buildings-lod-height.md`; LOD2 is achievable for NYC.
- **4.4 — If SPDist1 fraction in Manhattan > 50%** → NYC commercial ceiling is lower than
  estimated; SPD individual-ordinance sourcing would be required for most Manhattan lots.
  Update RATE.md ceiling estimate.
- **4.5 — If MapPLUTO `MaxAllwFAR` is confirmed to include bonus FAR** (inclusionary housing,
  POPS) → the field is the maximum possible (with bonuses), not the as-of-right FAR. A lower
  `ZoneDist1`-derived as-of-right FAR must be sourced separately. Document clearly.

## 5 — WHAT IS ALREADY BUILT (do not redo)

- NYC zone code vocabulary + BBL join key + MapPLUTO structure documented — `README.md §1, §3`
- NYC structural complexity (SPDs, bonuses, TDR, ULURP) documented — `README.md §1`
- NYC identified as pilot city #3 (highest complexity / highest data richness)

## 6 — VERIFIED SOURCES

| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| NYC Zoning Resolution | NYC zoning ordinance — all district rules | `published` | `zr.planning.nyc.gov` (full text, searchable) |
| MapPLUTO (NYC Open Data) | Tax lot data including ZoneDist1, MaxAllwFAR, ResidFAR, etc. | VERIFIED-LEAD (schema known; values not probed) | `data.cityofnewyork.us/resource/64uk-42ks.json` |
| ZOLA (NYC DCP) | Parcel-level zoning lookup by address or BBL | VERIFIED-LEAD (exists; API endpoint TBD) | `zola.planning.nyc.gov` |
| NYC Open Data — Buildings | Building permits, BIS (Building Information System) | VERIFIED-LEAD | `data.cityofnewyork.us` |
| NRHP (NPS) | National heritage layer — NYC properties included | `published` | NPS ArcGIS feature service (national) |
| NYC Landmarks Preservation Commission | Designated landmarks + historic districts | VERIFIED-LEAD | `nyc.gov/landmarks` + `data.cityofnewyork.us` — "Individual Landmarks" |

## 7 — DEAD ENDS

- *(none yet — no probes run)*

## 8 — THE SMALLEST NEXT STEP

**Probe MapPLUTO `MaxAllwFAR` for a sample of Manhattan lots. Estimated: 0.25 dev-days.**

```bash
# MapPLUTO field inspection — Manhattan (borocode=1) sample
curl "https://data.cityofnewyork.us/resource/64uk-42ks.json?\$limit=20&\$where=borocode=%271%27&\$select=bbl,zonedist1,spdist1,maxallwfar,residfar,commfar,facilfar" \
  | python3 -m json.tool
```

**What each outcome implies:**
- `MaxAllwFAR` is non-null and populated across zone types → NYC has free structured FAR at the
  parcel level; free rate rises dramatically; update RATE.md immediately.
- `MaxAllwFAR` is null or inconsistently populated → FAR sourcing requires ZOLA API or
  Zoning Resolution table reads; proceed to §3.2 (ZOLA probe).
- `SPDist1` non-null in >40% of Manhattan lots → SPD fraction is high; NYC ceiling is lower;
  document SPD as the NYC-specific structural blocker.
