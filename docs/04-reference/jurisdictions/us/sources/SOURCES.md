# USA (`us`) — national data sources

**Status:** RESEARCH-CITED 2026-07-24 — structural sources confirmed; no live endpoint probes
run. No numeric rule values are verified — those live in per-jurisdiction ordinance PDFs or
the Zoneomics commercial API, neither of which has been queried for any specific US parcel.

> **Trust gate:** a field with NO citable source stays `null` in the pack and is listed under
> §B. A pack may not ship confidence `structured` unless EVERY field it sets has a row in §A here.

---

## A — VERIFIED (research-cited; not yet live-probed)

| Field (pack key / layer) | Value / endpoint | Unit | Governing instrument | Document (title + date) | URL / handle | Confidence |
|---|---|---|---|---|---|---|
| Legal basis for zoning | Municipal police power; no federal zoning statute | — | *Euclid v. Ambler Realty Co.*, 272 U.S. 365 (1926); state enabling acts derived from 1922 model SZEA | US Supreme Court decision, 1926 | `law.cornell.edu/supremecourt/text/272/365` | `published` |
| Jurisdiction count | ~33,000 independent zoning jurisdictions | count | NZA research; US planning academic literature | National Zoning Atlas documentation; Cornell Legal Constructs Lab | `zoningatlas.org` | `corroborated` |
| NZA — existence and access model | Browse-only interactive map + PDF "Zoning Snapshots"; no bulk download or API as of mid-2026 ("maybe 2026") | — | NZA FAQ statement | NZA FAQ, Land Use Atlas Inc., Cornell | `zoningatlas.org/faq` | `published` |
| NZA — AI automation posture | NZA explicitly rejects AI automation for ordinance parsing: "algorithms simply cannot (yet) understand the nuances of lengthy, complex zoning codes to the level of accuracy we require" | — | NZA FAQ | NZA FAQ | `zoningatlas.org/faq` | `published` |
| Mercatus Center redistribution | Aggregates NZA partner-team outputs as downloadable GeoJSON + XLS/CSV for completed states/regions | — | Mercatus Centre research programme | Mercatus Center at George Mason University | `mercatus.org` | `corroborated` |
| Zoneomics API — coverage claim | 20,000+ cities, 100M+ parcels; zone code + permitted use + FAR + building height + lot size | count; fields | Zoneomics product documentation | Zoneomics commercial product page | `zoneomics.com` | `published` (marketing claim; not independently verified) |
| Zoneomics — enterprise customer | Sidewalk Labs (Google) confirmed integration for permitted land use + development standards | — | Commercial reference | Published reference in research | `sidewalklabs.com` / Zoneomics | `corroborated` |
| Regrid — parcel coverage | 160M parcels, 99% of Americans, 3,229 counties; standardised schema; MCP server available | count | Regrid product documentation | Regrid (formerly Loveland/Landgrid) | `regrid.com` | `published` (marketing claim; not independently verified) |
| Regrid — MCP server | Regrid has shipped a Model Context Protocol server for AI-native parcel access | — | Regrid product announcement | Regrid blog/announcement | `regrid.com` | `corroborated` |
| Microsoft US Building Footprints | 129.6M building footprints, entire US, ODbL licence, no height attribute | count | Microsoft AI for Good research | GitHub: `microsoft/USBuildingFootprints`; licence ODbL | `github.com/microsoft/USBuildingFootprints` | `published` |
| Overture + USGS height model | Started 6M building heights (Boston, Chicago, Santa Clara); grown to 20M+; target 40–50M | count; coverage | Overture Maps Foundation + USGS 3DEP collaboration | Overture Maps Foundation announcement | `overturemaps.org` | `published` |
| USGS 3DEP — programme | National LiDAR programme; first-ever national baseline elevation data; DTM/DSM derived products; Public Domain | — | USGS, US Department of Interior | USGS 3D Elevation Program documentation | `usgs.gov/3dep` | `published` |
| NRHP — existence and coverage | ~100,000 listed properties; maintained by NPS under National Historic Preservation Act of 1966; free via ArcGIS feature services; updated weekly | count | National Historic Preservation Act of 1966, 54 U.S.C. §300101 et seq. | NPS National Register of Historic Places | `nps.gov/subjects/nationalregister/` | `published` |
| NRHP — restricted sites | Tribal, archaeological, and otherwise sensitive sites explicitly excluded from public spatial layer | — | NPS data policy | NPS NRHP documentation | `nps.gov` | `published` |
| NRHP — pre-1983 coordinate system | Records entered before 1983 use UTM/NAD27 — reproject before spatial joins | — | NPS data documentation | NPS NRHP technical notes | `nps.gov` | `published` |
| NRHP — NRIS join | Full descriptive data (~45 fields per property) is in a separate database (NRIS); spatial layer attributes are minimal | — | NPS data architecture | NPS NRHP / NRIS documentation | `nps.gov` | `published` |
| FEMA NFHL — existence | National Flood Hazard Layer (NFHL) — free ArcGIS MapServer covering FEMA Special Flood Hazard Areas | — | FEMA National Flood Insurance Program | FEMA NFHL product documentation | `msc.fema.gov/portal/home` | `published` (existence); endpoint not yet probed |
| US Census TIGER/Line roads | Free, national road network; Public Domain; updated annually | — | US Census Bureau | TIGER/Line Shapefiles | `census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html` | `published` |
| USGS NHD (water) | National Hydrography Dataset — free, national, Public Domain | — | USGS | NHD documentation | `usgs.gov/national-hydrography` | `published` |

---

## B — UNVERIFIED / open (stays `null` in the pack)

| Field | Why not verified | What would verify it (the exact source to read) |
|---|---|---|
| Zoneomics field completeness (FAR, height null-rate per city) | Not API-probed | Sign up for Zoneomics API trial; query 20+ parcels in Chicago; measure non-null FAR, max_height, lot_coverage rate |
| Regrid parcel API field schema | Not probed | `GET https://app.regrid.com/api/v2/parcels/point?lat=41.8781&lon=-87.6298` — inspect response for parcel fields, jurisdiction routing, and zoning sub-fields |
| Chicago open zoning dataset — numeric attributes | Not probed | `curl "https://data.cityofchicago.org/resource/5s3e-9pji.geojson?$limit=1"` — inspect for FAR/height fields |
| Los Angeles open zoning dataset — numeric attributes | Not probed | `geohub.lacity.org` — search for "zoning" layer; inspect attribute schema |
| NYC ZOLA / ZAP structured data | Not probed | `zola.planning.nyc.gov` / `data.cityofnewyork.us` — inspect field schema for numeric FAR/height attributes |
| NRHP ArcGIS feature service endpoint | Not probed | `services1.arcgis.com/ZIL9uO234SHHBD4h/arcgis/rest/services/National_Register_of_Historic_Places/FeatureServer/0/query?where=1%3D1&outFields=*&resultRecordCount=1` |
| Overture Maps building height field name and null rate | Not probed | Download Overture Maps building layer for Chicago bbox; inspect for `height` field presence and null rate |
| USGS 3DEP LiDAR coverage for Chicago, LA, NYC | Not checked | USGS National Map Viewer (`apps.nationalmap.gov`) — check 3DEP availability tiles for each city bbox |
| Mercatus GeoJSON field schema (numeric FAR/height vs. zone-code-only) | Not probed | Download a Mercatus/NZA partner GeoJSON output; inspect field names against SOURCES.md |
| Any numeric zoning rule (FAR, height, setback) for any specific US parcel | No ordinance or API has been read | Query Zoneomics API for a specific parcel in Chicago; or read Chicago Municipal Code Ch. 17-2 for a specific zone district |

---

⚠ No numeric FAR, height, or setback value has been verified from a primary source for any
US parcel. The regime structure (municipal police power, 33,000 jurisdictions, Euclid basis)
is confirmed published. Commercial sources (Zoneomics, Regrid) are confirmed to exist but
their field schemas have not been live-probed.
