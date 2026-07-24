# New York City (3651000) — per-field sources

**Status:** OPEN — no values verified yet. No numeric zoning rule has been cited from a primary
source for any NYC parcel. Key open question: whether MapPLUTO `MaxAllwFAR` is populated.

## A — VERIFIED (research-confirmed leads; not yet live-probed)

| Field (pack key) | Value | Unit | Governing article | Document (title + date) | URL / handle | Confidence |
|---|---|---|---|---|---|---|
| Governing instrument | NYC Zoning Resolution (in force since 1961, continuously amended) | — | NYC Charter §200 et seq.; New York State General City Law | NYC Zoning Resolution (current) | `zr.planning.nyc.gov` | `published` |
| Zone code vocabulary | R1-1 through R10H (residential), C1-1 through C8-4 (commercial), M1-1 through M3-2 (manufacturing) + Special Purpose Districts (80+) | — | NYC Zoning Resolution Articles I–VII | NYC Zoning Resolution (current) | `zr.planning.nyc.gov` | `published` |
| BBL (parcel join key) | Borough (1 digit) + Block (5 digits) + Lot (4 digits) = 10-digit unique parcel identifier | — | NYC Department of Finance / City Planning convention | Standard NYC planning data convention | NYC PLUTO/MapPLUTO documentation | `published` |
| MapPLUTO dataset | Tax lot data incl. ZoneDist1, SPDist1-3, MaxAllwFAR (numeric — population status TBD), ResidFAR, CommFAR, BldgClass, NumFloors | GeoJSON / Shapefile | — | NYC MapPLUTO (latest release) | `data.cityofnewyork.us/resource/64uk-42ks.json` | VERIFIED-LEAD (schema known; field population not probed) |
| ZOLA | Parcel-level zoning information lookup by address or BBL; web app + potential API | — | NYC Department of City Planning | `zola.planning.nyc.gov` | `zola.planning.nyc.gov` | VERIFIED-LEAD (exists; API endpoint not confirmed) |
| NYC Zoning Resolution — full text (searchable) | Complete current text of the NYC ZR | — | NYC Charter | NYC ZR, NYC DCP | `zr.planning.nyc.gov` | `published` |
| NRHP heritage | National Register of Historic Places — NYC properties included in national layer | — | National Historic Preservation Act 1966 | NPS NRHP via ArcGIS feature service | `services1.arcgis.com/.../National_Register_of_Historic_Places/FeatureServer` | `published` |
| NYC Landmarks Preservation Commission data | Individual landmarks + historic districts + scenic landmarks | — | NYC Admin Code §25-301 et seq. | LPC open data via `data.cityofnewyork.us` | `data.cityofnewyork.us` — "Individual Landmarks" | VERIFIED-LEAD (not live-probed) |
| NYC 3D building model | 3D building volumes for NYC — potentially LOD2 | — | NYC Dept of Information Technology & Telecommunications (DoITT) / DCP | `data.cityofnewyork.us` — "NYC 3D Model" | `data.cityofnewyork.us` | VERIFIED-LEAD (exists; currency and access not confirmed) |
| Microsoft Building Footprints | 129.6M US footprints including NYC | ODbL | Microsoft AI for Good | GitHub `microsoft/USBuildingFootprints` | `github.com/microsoft/USBuildingFootprints` | `published` |

## B — UNVERIFIED / open (stays `null` in the pack)

| Field | Why not verified | What would verify it |
|---|---|---|
| MapPLUTO `MaxAllwFAR` — null rate and reliability | Not probed — this is the single most important unknown | `curl "https://data.cityofnewyork.us/resource/64uk-42ks.json?$limit=100&$where=borocode='1'&$select=bbl,zonedist1,spdist1,maxallwfar"` — count non-null values |
| ZOLA API endpoint and schema | ZOLA web app exists; REST API not confirmed | Check `api.zola.nyc` or NYC DCP developer documentation for a machine-readable endpoint |
| SPDist1 fraction of Manhattan lots | Not probed | MapPLUTO query: `$where=borocode='1'&$select=count(*),spdist1&$group=spdist1` |
| NYC 3D building model — format, currency, licence | Portal not checked | `data.cityofnewyork.us` — search "NYC 3D" — check format (CityGML/OBJ/Shapefile), date, and licence |
| Floor area bonus accounting in `MaxAllwFAR` | Unknown whether MapPLUTO includes bonus FAR or as-of-right only | If `MaxAllwFAR` is populated: compare against ZR tables for a sample of lots in Inclusionary Housing areas |
| TDR/air-rights transfer records | BSA/ZAP database; not a queryable GIS layer | `zap.planning.nyc.gov` — check for an air-rights database; likely requires per-lot manual search |
| Zoneomics field completeness for NYC zones | Not probed | Zoneomics API — query R6, C2-7, M1-6, and a Special Purpose District lot; check FAR and max_height null rates |
| Any confirmed numeric FAR, height, setback for any specific NYC parcel | No ordinance or API has been read | MapPLUTO `MaxAllwFAR` probe (above) is the first step |

⚠ No numeric FAR, height, or setback value has been verified from a primary source for any
NYC parcel. MapPLUTO's `MaxAllwFAR` is the highest-value free source to probe; if it is
populated and reliable, NYC's free-source coverage for FAR may be significantly higher than
any other US pilot city.
