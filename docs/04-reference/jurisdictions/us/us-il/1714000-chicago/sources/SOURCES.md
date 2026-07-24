# Chicago (1714000) — per-field sources

**Status:** OPEN — no values verified yet. No numeric zoning rule has been cited from a primary
source for any Chicago parcel.

## A — VERIFIED (research-confirmed leads; not yet live-probed)

| Field (pack key) | Value | Unit | Governing article | Document (title + date) | URL / handle | Confidence |
|---|---|---|---|---|---|---|
| Governing instrument | Chicago Zoning Ordinance, Title 17, Chicago Municipal Code | — | Illinois Municipal Code 65 ILCS 5/ (home-rule authority) | Chicago Municipal Code Title 17 (current) | `chicago.gov/city/en/depts/dcd/supp_info/chicago_zoning.html` | `published` |
| Zone code vocabulary | RS-1 to RS-3, RT-3.5/RT-4, RM-4.5 to RM-6.5, B1-B3, C1-C3, M1-M3, DX/DS/DC/DR/D (downtown) | — | Chicago Municipal Code Title 17 | Chicago Zoning Ordinance (current) | `chicago.gov` | `published` |
| Open zoning dataset (boundaries) | `data.cityofchicago.org` dataset `5s3e-9pji` — zoning district boundaries | GeoJSON | — | Chicago Open Data Portal | `data.cityofchicago.org/resource/5s3e-9pji.geojson` | VERIFIED-LEAD (not live-probed) |
| Building footprints | `data.cityofchicago.org` — "Building Footprints (current)" | GeoJSON | — | Chicago Open Data Portal | `data.cityofchicago.org` | VERIFIED-LEAD (not live-probed) |
| Overture/USGS height pilot | Chicago named as one of three pilot cities for Overture Maps + USGS 3DEP building height model | — | Overture Maps Foundation announcement | Overture Maps Foundation | `overturemaps.org` | `corroborated` |
| NRHP heritage | National Register of Historic Places — Chicago properties included in national layer | — | National Historic Preservation Act 1966 | NPS NRHP via ArcGIS feature service | `services1.arcgis.com/.../National_Register_of_Historic_Places/FeatureServer` | `published` (national source) |
| Chicago Landmarks | Chicago Landmarks layer — City of Chicago Department of Planning and Development | — | Chicago Landmarks Ordinance (Municipal Code Ch. 2-120) | `data.cityofchicago.org` | `data.cityofchicago.org` — search "Landmarks" | VERIFIED-LEAD (not live-probed) |

## B — UNVERIFIED / open (stays `null` in the pack)

| Field | Why not verified | What would verify it (the exact source to read) |
|---|---|---|
| FAR (floor area ratio) per zone district | Not probed — may be in open zoning dataset or requires ordinance text read | Probe `5s3e-9pji.geojson?$limit=1` for `far` field; if absent, read Title 17-4-0 tables |
| Max height per zone district | Same — not probed | Same probe + Title 17-4-0 height tables |
| Setback (front/rear/side) per zone district | Not probed | Chicago Municipal Code Title 17-2-0 (residential) / 17-3-0 (commercial) setback tables |
| Planned Development (PD) boundary layer | Not probed | `data.cityofchicago.org` — search "Planned Development" for a PD polygon layer |
| Cook County FIPS parcel layer | Not probed | Cook County Assessor open data — `cookcountyassessor.com` or ArcGIS Hub |
| Zoneomics FAR/height for Chicago zones | Not probed | Zoneomics API trial — query RS-1, RT-4, B3, D-DX, M1 parcels; check null rates |

⚠ No FAR, height, setback, or lot-coverage value has been verified from a primary source
for any Chicago zone district or specific parcel.
