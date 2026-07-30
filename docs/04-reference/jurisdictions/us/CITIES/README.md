# US Cities — the primary atlas (`us/CITIES/`)

**Last updated:** 2026-07-30 · **Confidence (whole file):** CONVERGENT-SECONDARY (not probed —
pending-probe). **No RATE % cell is asserted here** (§CONTEXT-DATA-HONESTY).

> Because the US is the **inverse of Germany** (city/county owns parcels + zoning directly, no
> national cadastre — see [`../USA.md`](../USA.md)), the **city is the atlas unit**. These docs
> are the US equivalent of the German Land files. Two are written in full; the rest are Tier-1
> stubs pending probe. Each links **into** the existing scored `us/us-<state>/<FIPS>-<slug>/`
> RATE dossier (this atlas does not duplicate or edit the dossiers).

## Docs in this folder

| City | Depth | Adapter family | Routing key | Dossier (scored) |
|---|---|---|---|---|
| [New York City](./NEW_YORK_CITY.md) | **FULL** | `NYC*Provider` (MapPLUTO) | BBL | [`../us-ny/3651000-new-york-city/`](../us-ny/3651000-new-york-city/README.md) |
| [San Francisco](./SAN_FRANCISCO.md) | **FULL** | `SF*Provider` (APN) | APN | [`../us-ca/0667000-san-francisco/`](../us-ca/0667000-san-francisco/README.md) |
| [Seattle](./SEATTLE.md) | STUB | `Seattle*Provider` | parcel PIN | — |
| [Denver](./DENVER.md) | STUB | `Denver*Provider` | schednum | — |
| [Boston](./BOSTON.md) | STUB | `Boston*Provider` | parcel-id | — |
| [Austin](./AUSTIN.md) | STUB | `Austin*Provider` | TCAD id | — |
| [Chicago](./CHICAGO.md) | STUB | `Chicago*Provider` | PIN | [`../us-il/1714000-chicago/`](../us-il/1714000-chicago/README.md) |
| [Philadelphia](./PHILADELPHIA.md) | STUB | `Philly*Provider` | OPA account | — |
| [Washington DC](./WASHINGTON_DC.md) | STUB | `DC*Provider` | SSL | — |
| [Portland](./PORTLAND.md) | STUB | `Portland*Provider` | taxlot id | — |

## Readiness ranking (CONVERGENT-SECONDARY · unprobed · sequencing only)

Scores are **relative readiness for the parcel+zoning+height+terrain stack**, not RATE cells.
They inform which city to probe first; they move nothing until probed live.

| Rank | City | Readiness | Why |
|---|---|---|---|
| 1= | **New York City** | 9.5 | MapPLUTO ≈ complete PRYZM dataset (tax-lot polygon + zoning + footprint + FAR + land-use in one layer); ArcGIS REST + Open Data; BBL reverse lookup |
| 1= | **San Francisco** | 9.5 | Barcelona analogue — accurate APN parcels + zoning + height-and-bulk districts + LiDAR; consolidated city-county (one code, no internal routing) |
| 1= | **Seattle** | 9.5 | Strong open-data + zoning GIS + LiDAR |
| 1= | **Denver** | 9.5 | Strong open-data parcel + zoning + terrain |
| 1= | **Washington DC** | 9.5 | Consolidated district; excellent open-data (OCTO); height-of-buildings act |
| 1= | **Portland** | 9.5 | Metro RLIS + strong zoning GIS |
| 7= | **Boston** | 9.0 | Good open-data; requires JOIN of parcel-GIS + assessor + zoning-GIS + zoning-text |
| 7= | **Austin** | 9.0 | Strong open-data; TCAD assessor join |
| 7= | **Chicago** | 9.0 | Strong open-data city; zoning district GIS; multi-source join |
| 7= | **Philadelphia** | 9.0 | OPA + zoning GIS; multi-source join |

**Engineering note (from the study):** NYC and SF are unusually *complete in one layer*. Most
other Tier-1 cities require **joining** parcel-GIS + assessor + zoning-GIS + zoning-text +
footprints + LiDAR per city — more integration work than NYC's single MapPLUTO. A 9.0/9.5
score reflects *data availability*, not *integration ease*.

## Implementation waves (sequencing, not commitment)

- **Wave 1:** NYC · San Francisco · Seattle · Denver · Austin · Boston
- **Wave 2:** Portland · Chicago · Philadelphia · Washington DC · Minneapolis · Phoenix · Dallas · Houston
- **Wave 3:** smaller municipalities (per-city crawl of ArcGIS Hub / Socrata portals)

## Honesty
Every score and status is **CONVERGENT-SECONDARY (not probed)**. "Unprobed" ≠ "no data" — it
means we have not yet looked. A city leaves "unprobed" only when its parcel + zoning layer is
probed live and wired as a `CityParcelProvider` / `CityZoningProvider`; the envelope stays
not-assessed until a per-city rule pack exists.
