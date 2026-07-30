# TIGER/Line — US National Boundaries & Roads (fallback)

**Owner:** US Census Bureau · **Role:** national administrative-boundary + road + place/county
context and FIPS routing · **Licence:** Public Domain · **Confidence:** CONVERGENT-SECONDARY
(not probed — pending-probe)

> National **fallback / context** dataset. TIGER never carries parcels, zoning, FAR, or height.
> It provides the boundary + road context layer and the FIPS join key that names each city
> pack. See [`../USA.md §3`](../USA.md).

## What it is
- **TIGER/Line** (Topologically Integrated Geographic Encoding and Referencing) = the Census
  Bureau's national geographic base: state / county / place / census-tract / block polygons,
  road centrelines, hydrography edges, and address ranges.
- The **FIPS** codes TIGER carries are PRYZM's US routing key: `us-<state-iso>/<state-FIPS +
  place-FIPS>-<slug>` (e.g. NYC = `36 + 51000`, SF = `06 + 67000`).

## Where PRYZM uses it
- Admin-boundary context (city/county outlines) around a site.
- Road-network context fallback where a city's own road layer is absent (OSM is the richer
  alternative for street furniture / widths).
- FIPS resolution: coord → place → the correct `us/CITIES/<CITY>` pack.

## Access (pending live probe)
- Annual TIGER/Line Shapefiles + GeoJSON via the Census FTP / `tigerweb` ArcGIS REST services.
- CRS: NAD83 (EPSG:4269) — reproject to 4326 → ENU.

## Not the payload
Roads/boundaries only. Any parcel + zoning + envelope answer comes from a `CityParcelProvider` /
`CityZoningProvider`, never from TIGER.

## Pending-probe checklist
- [ ] `tigerweb` REST endpoint URL + query syntax confirmed live
- [ ] Road-centreline currency vs OSM for a target city
- [ ] Place-polygon → FIPS routing verified against the NYC/SF packs
