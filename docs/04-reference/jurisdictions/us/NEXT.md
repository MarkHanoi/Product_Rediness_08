# NEXT — USA (`us`)

> **What this file is.** The single place recording where we stopped on the USA, exactly why,
> and precisely what to do to go further the moment it becomes possible — so a source or
> technique found while working on any OTHER jurisdiction can be brought straight back here.
> **Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** RESEARCH COMPLETE — pre-implementation

---

## 1 — WHERE WE STOPPED (the one-paragraph truth)

The national legal structure is fully characterised — the ~33,000-jurisdiction fragmentation
rooted in *Euclid v. Ambler* (1926), the four-way regime classifier (zoning district / overlay
/ non-conforming / unincorporated), the landscape of commercial actors (Zoneomics, Regrid),
academic actors (NZA, Mercatus), and free data layers (Microsoft footprints, Overture/USGS
heights, NRHP heritage, USGS 3DEP terrain). Three cities were scoped in depth (Chicago,
Los Angeles, NYC); the sequencing case is clear (Chicago first as the most open-data-friendly
with confirmed Overture/USGS pilot coverage). The central unresolved question is not "which
legal mechanism" (the municipal zoning ordinance is the only mechanism everywhere) but "can we
reach numeric FAR/height/use code without reading the ordinance PDF?" — and the answer is
commercially yes (Zoneomics) but freely no. No pack is implemented; no live endpoint probe
has been run.

---

## 2 — THE NUMBER (what % of clicks, which denominator, and why)

**Zoning full-envelope resolution: 0% (not started).**

**Context-data resolution: 0% (endpoints identified in research, not live-probed).**

Denominator: any US parcel in a jurisdiction covered by Zoneomics (20,000+ cities) for the
commercial rate; any US parcel in an ArcGIS Hub county portal or Mercatus NZA partner state
for the free rate.

Current headline: **~12% (free), ~55% (commercial)** — research estimates, not endpoint-measured.
See `RATE.md` for derivation.

---

## 3 — BLOCKERS

### 3.1 — Jurisdiction router: no free national layer exists

- **What it is.** The first pipeline question — "which of ~33,000 jurisdictions' ordinances
  governs this parcel?" — has no free national answer. Unlike Germany (XPlanung B-Plan polygon
  covers the parcel or §34 by absence) there is no spatial layer whose presence/absence answers
  the question.
- **Why it blocks.** Without jurisdiction routing, no ordinance can be fetched and no numeric
  rule can be sourced.
- **What would unblock it (ascending cost).** (1) Probe Regrid parcel API — Regrid attaches
  jurisdiction name and FIPS code to each parcel record, which provides the routing key.
  (2) Probe Zoneomics API — Zoneomics both routes and resolves in one call. (3) Build a
  spatial join against a Census Places layer (free TIGER/Line) + a hand-curated jurisdiction
  polygon layer (NZA has been building this; Mercatus may publish it).
- **THE EXACT RESUME STEP.** Fetch the Regrid free-tier parcel API for a single Chicago parcel
  (lat/lon known from Chicago open data): `GET https://app.regrid.com/api/v2/parcels/point?lat=<lat>&lon=<lon>` — inspect the response for a `jurisdiction` or `zoning_jurisdiction` field.

### 3.2 — Zoneomics numeric field completeness unknown

- **What it is.** Zoneomics claims FAR + building height + lot size for 20,000+ cities, but
  field completeness (what % of queried parcels return a non-null FAR) is unknown.
- **Why it blocks.** The commercial rate estimate (~55%) hinges on this. If Zoneomics returns
  use code only (not FAR/height) for most parcels, the commercial ceiling falls to ~25%.
- **What would unblock it.** Probe Zoneomics API for a sample of Chicago parcels; measure what
  % return non-null FAR, height, and lot-coverage fields.
- **THE EXACT RESUME STEP.** Sign up for a Zoneomics trial / request a sample API key; run:
  `GET https://zoneomics.com/api/v1/zoning?lat=41.8781&lng=-87.6298&apikey=<key>` — inspect
  the response for `far`, `max_height`, `lot_coverage` fields and their null rate across 20+
  Chicago sample parcels across different zone types.

### 3.3 — Microsoft footprint height gap (no height attribute)

- **What it is.** Microsoft's 129.6M footprints do not include a building height attribute —
  geometry only. Height requires Overture/USGS (20M buildings today) or 3DEP DSM-DTM derivation.
- **Why it blocks.** Without height, building-envelope context is LOD1-only (footprint, no
  volume). The full LOD2 context requires a height join.
- **What would unblock it (ascending cost).** (1) Join Overture Maps building layer (includes
  height for 20M+ US buildings) to Microsoft footprint by spatial key — free. (2) Derive height
  from USGS 3DEP (DSM minus DTM = nDSM; max nDSM within footprint = approx building height) —
  free but requires point-cloud or raster processing. (3) Commercial building-height data (not
  currently identified at national scale in this research pass).
- **THE EXACT RESUME STEP.** Download the Overture Maps building layer for a Chicago bbox (1 km²
  around the Loop) and inspect: field names, `height` attribute null rate, CRS, and join key
  to Microsoft footprint geometry.

### 3.4 — Free zoning data coverage: city open-data portals not systematically surveyed

- **What it is.** Many major US cities publish zoning district boundaries on open-data portals
  (ArcGIS Hub, Socrata). Whether these include numeric attributes (FAR, height) or only zone
  district codes is unsurveyed.
- **Why it blocks.** If city portals include numeric attributes, the free-source rate could rise
  by 5–10 pts without any commercial contract — but only for those specific cities.
- **What would unblock it.** Probe the three target cities: Chicago (`data.cityofchicago.org`),
  LA (`geohub.lacity.org`), NYC (`data.cityofnewyork.us` / ZOLA).
- **THE EXACT RESUME STEP.** `curl "https://data.cityofchicago.org/api/geospatial/..." ` — check
  the zoning dataset (dataset `5s3e-9pji` on Chicago Open Data) for FAR, max_height, and
  setback attributes in the schema.

### 3.5 — NRHP spatial data: pre-1983 coordinate system caveat unquantified

- **What it is.** Pre-1983 NRHP records use UTM/NAD27 instead of WGS84/NAD83. Unknown what
  fraction of the ~100,000 listed properties this affects.
- **Why it blocks.** Positional errors (up to ~200 m in some regions) make NRHP–parcel spatial
  joins unreliable for pre-1983 records without reprojection.
- **What would unblock it.** Fetch the NRHP ArcGIS feature service; inspect the `LISTED_DATE`
  attribute distribution and identify what fraction pre-dates 1983.
- **THE EXACT RESUME STEP.** `curl "https://services1.arcgis.com/ZIL9uO234SHHBD4h/arcgis/rest/services/National_Register_of_Historic_Places/FeatureServer/0/query?where=1%3D1&outFields=LISTED_DATE&resultRecordCount=1000&f=json"` — count records with LISTED_DATE < 1983.

---

## 4 — TRIP-WIRES (if you see X elsewhere, come back HERE and do Y)

- **4.1 — If a building-height modelling pipeline is built for any other jurisdiction** (IT, FR,
  DE) using nDSM (DSM–DTM) from national LiDAR → come back and apply the same pipeline to
  USGS 3DEP tiles for the three US target cities. The processing approach is identical; only the
  tile source changes. Estimated +25–30 pts on free height coverage.
- **4.2 — If NZA announces bulk download availability** (their FAQ says "maybe 2026") → come
  back and probe the NZA API immediately. This would be the single largest free-source upgrade
  event possible for the US — analogous to Sweden's NGP becoming open. Update §3.1 and probe.
- **4.3 — If Regrid's MCP server is evaluated for AI-native tool use in any jurisdiction** →
  note the evaluation result here. Regrid MCP is unique in the corpus; if it works for parcel
  queries, it may replace a custom Regrid API integration entirely.
- **4.4 — If Zoneomics updates its coverage claim** (currently 20,000+ cities; adding coverage
  weekly) → update `RATE.md` commercial rate estimate and §3.2.
- **4.5 — If any US city publishes a machine-readable zoning ordinance with structured FAR/height
  fields** (e.g. Chicago publishes numeric attributes in its open zoning GIS layer) → update that
  city's NEXT.md and raise the free-source rate accordingly. This is the US analogue of a German
  Land publishing LoD2 as open data.
- **4.6 — If FEMA NFHL is confirmed as a working free ArcGIS feature service** → add it to the
  overlay risk layer for all three US cities. NFHL is the US equivalent of France's PPRI; the
  endpoint is known, just not yet probed.

---

## 5 — WHAT IS ALREADY BUILT (do not redo)

- National legal structure characterisation — `findings/USA-MASTER-DATA-SOURCE-STUDY.md`
- Country-level README + city stubs — `us/README.md`, `us-il/1714000-chicago/`,
  `us-ca/0644000-los-angeles/`, `us-ny/3651000-new-york-city/`
- National SOURCES.md with citations for all confirmed national sources
- Topics files with source tables — `us/topics/`
- Cross-jurisdiction comparison table — in `README.md §1.1` and `RATE.md`
- Rate estimate and ceiling analysis — `RATE.md`

---

## 6 — VERIFIED SOURCES (endpoint · what it answers · confidence tier · the exact query)

| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| *Euclid v. Ambler Realty Co.*, 272 U.S. 365 (1926) | Legal basis for municipal zoning as police power; no federal zoning authority | `published` | US Supreme Court decision — public record |
| National Zoning Atlas (NZA) FAQ | No bulk download; maybe 2026; browse-only | `published` — NZA's own statement | `zoningatlas.org/faq` |
| Zoneomics product page | 20,000+ cities, 100M+ parcels, FAR + height + use code; Sidewalk Labs customer | `published` (marketing claim) | `zoneomics.com` — not yet API-probed |
| Regrid product page | 160M parcels, 99% of Americans, 3,229 counties, MCP server | `published` (marketing claim) | `regrid.com` — not yet API-probed |
| Microsoft US Building Footprints | 129.6M footprints, ODbL, no height attribute | `published` + ODbL licence verified | GitHub: `microsoft/USBuildingFootprints` |
| Overture Maps + USGS 3DEP height model | 20M+ modelled building heights, growing to 40–50M | `published` (announced) | `overturemaps.org` — not yet probed |
| NRHP via NPS ArcGIS | ~100,000 historic properties, free, weekly-updated | `published` | `services1.arcgis.com/.../National_Register_of_Historic_Places/FeatureServer` — not yet probed |
| USGS 3DEP | National LiDAR coverage; DTM/DSM; Public Domain | `published` | `nationalmap.gov` / `apps.nationalmap.gov/3dep-productlinks/` |

---

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)

- **Free national zoning API (government-provided):** does not exist. The US federal government
  has never created a national zoning API; states have not either. Do not re-search for one.
- **NZA bulk download:** NZA explicitly states no bulk download exists as of mid-2026. Do not
  attempt to scrape the NZA interactive map — this would violate their terms. Wait for an
  official API announcement.
- **National zone code taxonomy (free lookup table):** does not exist. Each municipality defines
  its own zone codes. A mapping table like Germany's BauNVO §§2–11 cannot be built from public
  sources; Zoneomics' normalisation layer is a commercial product.

---

## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost

**Probe the Chicago open zoning dataset on the city's open-data portal. Estimated: 0.25 dev-days.**

```bash
# Chicago Zoning Districts — check field schema for numeric attributes
curl "https://data.cityofchicago.org/resource/5s3e-9pji.geojson?$limit=1" \
  | python3 -m json.tool | grep -E '"zone_type|far|height|setback|max|density"'
```

**What each outcome implies:**
- Chicago dataset includes FAR + max_height attributes (non-null) → Chicago free rate rises
  significantly; probe LA and NYC portals next.
- Chicago dataset includes zone_class only (no numeric attributes) → free zoning data is zone-
  code-only even in the most open-data-friendly US city; commercial (Zoneomics) is necessary
  for numeric attributes. Update RATE.md accordingly.
- Dataset not found / 404 → search `data.cityofchicago.org` for "zoning" to find the correct
  dataset ID.

This converts the US free-source rate estimate from "assumed ~0% numeric" to a measurement,
at ~0.25 dev-day cost — exactly analogous to the France GPU WFS probe recommendation.
