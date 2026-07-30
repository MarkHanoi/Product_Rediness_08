# USGS 3DEP — National LiDAR Terrain & Height Fallback

**Owner:** US Geological Survey (3D Elevation Program) · **Role:** national terrain (DTM/DSM) +
building-height fallback · **Licence:** Public Domain · **Confidence:** CONVERGENT-SECONDARY
(not probed — pending-probe)

> National **fallback / context** dataset. 3DEP is the US terrain source (the `us` terrain
> backend in the bake pipeline) and the building-height fallback via DSM−DTM. It never carries
> parcels or zoning. See [`../USA.md §3`](../USA.md).

## What it is
- **3DEP** = the USGS national LiDAR programme: bare-earth **DTM** and first-return **DSM**
  raster products plus source point clouds.
- Coverage: substantial national LiDAR (>60% high-quality as of 2024, target = full national),
  ~1 m grid urban / ~10 m rural. **Coverage is city-specific — probe the target city.**

## Where PRYZM uses it
- **Terrain** — the settled-terrain surface under a site (US backend = 3DEP). Steep-relief
  cities (SF) make this load-bearing for both massing and legal rasant.
- **Building-height fallback** — `height ≈ DSM − DTM` (nDSM) where a city has no measured height
  field. Indirect (raster differencing), ~1 m above-ground accuracy; not a height field in a
  feature service.

## Access (pending live probe)
- USGS National Map / TNM Access API; LAZ / GeoTIFF (DTM, DSM) tiles.
- CRS varies by project (often UTM / NAD83) — reproject to 4326 → ENU.

## Not the payload
Terrain + modelled height only. Parcel + zoning + regulated envelope come from a city source.

## Pending-probe checklist
- [ ] 3DEP tile availability confirmed for each target city (NYC, SF first)
- [ ] DSM−DTM nDSM height accuracy spot-checked vs a city height field
- [ ] TNM Access API endpoint + tile-fetch path verified live
