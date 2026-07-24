# Los Angeles (0644000) — per-field sources

**Status:** OPEN — no values verified yet. No numeric zoning rule has been cited from a primary
source for any LA parcel.

## A — VERIFIED (research-confirmed leads; not yet live-probed)

| Field (pack key) | Value | Unit | Governing article | Document (title + date) | URL / handle | Confidence |
|---|---|---|---|---|---|---|
| Governing instrument | Los Angeles Municipal Code (LAMC) Title 1, Article 2 (Zoning Ordinance) | — | California Gov. Code §65000 et seq. (state enabling law); LA Charter §550 et seq. | LAMC (current) | `library.amlegal.com/codes/los_angeles/latest/lamc/` | `published` |
| Zone code vocabulary | Base zone (R1, RD1.5, R3, C1, C2, CM, M1, M2, etc.) + height district suffix (-VL, -1, -2, -3, -4) | — | LAMC §12.21.1 et seq. | LAMC (current) | `library.amlegal.com/codes/los_angeles/` | `published` |
| Height district table | LAMC §12.21.1 defines height districts: VL=30ft, 1=45ft, 2=6 stories/75ft, 3=as-of-right unlimited with FAR cap, 4=unlimited | ft / FAR | LAMC §12.21.1 | LAMC (current) — text not yet extracted | `library.amlegal.com/codes/los_angeles/latest/lamc/0-0-0-109218` | VERIFIED-LEAD (text not read) |
| California Coastal Act authority | CCC has jurisdiction over development in the Coastal Zone; supersedes city zoning for development standards | — | California Coastal Act, Public Resources Code §30000 et seq. | California Coastal Act (current) | `leginfo.legislature.ca.gov` | `published` |
| `geohub.lacity.org` Zoning layer | LA zoning district boundaries + zone code | GeoJSON / FeatureServer | — | LA GeoHub open data | `geohub.lacity.org` — search "Zoning Information" | VERIFIED-LEAD (not live-probed) |
| NRHP heritage | National Register of Historic Places — LA properties included in national layer | — | National Historic Preservation Act 1966 | NPS NRHP via ArcGIS feature service | `services1.arcgis.com/.../National_Register_of_Historic_Places/FeatureServer` | `published` |
| LARIAC programme | LA Region Imagery Acquisition Consortium — produces LiDAR-derived building heights and possibly LOD2 models for LA County periodically | — | LA County GIS programme | LARIAC documentation | `gis.lacounty.gov/lariac/` | `corroborated` — existence confirmed; product availability/access/currency not confirmed |

## B — UNVERIFIED / open (stays `null` in the pack)

| Field | Why not verified | What would verify it |
|---|---|---|
| Height district FAR/height values (LAMC §12.21.1 table) | Table text not read | Read LAMC §12.21.1 at `library.amlegal.com` — extract VL/1/2/3/4 FAR and height values |
| LA GeoHub zoning layer — numeric FAR/height attributes | Not probed | `curl` the LA GeoHub FeatureServer for one feature; inspect for FAR, HEIGHT, SETBACK fields |
| Specific Plan boundary layer | Not probed | `geohub.lacity.org` — search "Specific Plan Areas"; check polygon layer and attribute schema |
| California Coastal Zone boundary (GIS) | Not probed | `coastal.ca.gov` GIS downloads — Coastal Zone boundary shapefile/feature service |
| LARIAC product access and currency | Not probed | `gis.lacounty.gov/lariac/` — check latest LARIAC release date and access terms |
| Q-condition registry | No confirmed queryable source | LA City Planning ZIMAS (Zoning Information and Map Access System) — check per parcel |
| Zoneomics field completeness for LA zones | Not probed | Zoneomics API — query C2-1, R3-1, M1-1 parcels; check FAR and max_height null rates |
| Any numeric FAR, height, setback for any specific LA parcel | No ordinance or API has been read | Read LAMC §12.21 for target zone + height district; or query Zoneomics API |

⚠ No FAR, height, setback, or lot-coverage value has been verified from a primary source
for any LA zone district or specific parcel.
