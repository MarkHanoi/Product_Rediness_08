# National Hydrography Dataset (NHD) — US Water Context

**Owner:** US Geological Survey · **Role:** national water-body / river / coastline context ·
**Licence:** Public Domain · **Confidence:** CONVERGENT-SECONDARY (not probed — pending-probe)

> National **fallback / context** dataset. NHD supplies the water layer for US sites. It never
> carries parcels or zoning. See [`../USA.md §3`](../USA.md).

## What it is
- **NHD** (and the higher-resolution **NHDPlus HR**) = the USGS national surface-water network:
  lakes, ponds, rivers, streams, canals, coastline, and flow network.
- The US analogue of the coastline/water layers PRYZM uses elsewhere — relevant to the
  dominant-coast / land-guard context logic for coastal cities (NYC, SF, Boston).

## Where PRYZM uses it
- Water-body + coastline context around a site (blue fill under the scene).
- Coastal-city sea framing — pairs with the dominant-coast + land-guard rule so sea ≠ land
  centre (see the sea-context memory).

## Access (pending live probe)
- NHD / NHDPlus HR via USGS National Map + ArcGIS REST feature services; Shapefile / GeoPackage.
- CRS: NAD83 (EPSG:4269) — reproject.
- OSM water is the alternative/finer source in dense urban cores.

## Not the payload
Water context only.

## Pending-probe checklist
- [ ] NHD REST feature-service endpoint confirmed live
- [ ] Coastline granularity vs OSM for a coastal target city
- [ ] Reprojection (4269 → 4326 → ENU) verified against a known shoreline
