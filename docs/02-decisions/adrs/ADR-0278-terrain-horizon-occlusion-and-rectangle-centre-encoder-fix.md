# 0278 — Interior-city white terrain: the quantized-mesh coarse-tile is horizon-culled — fix the bounding centre (rectangle, not vertex-centroid) and the horizon occlusion point (never-cull for wide-angle tiles)

**Status**: ACCEPTED
**Date**: 2026-07-29
**Deciders**: founder (live 3D-Site testing across Spanish cities) + architecture team
**Related contracts**: [C12 — Geospatial & Coordinate Systems](../contracts/C12-GEOSPATIAL.md) (§10 records the quantized-mesh tile-header encoding invariants this ADR mandates), [C04 — Rendering & Scheduling](../contracts/C04-RENDERING-AND-SCHEDULING.md) (the Cesium/Forma globe this terrain renders on)
**Related ADRs**: [ADR-0268](./ADR-0268-cesium-3d-tiles-georeferenced-building-placement.md) (the ellipsoidal WGS-84 ground datum the terrain meshes share), [ADR-0277](./ADR-0277-geo-data-sourcing-map-open-datasets-derived-heights.md) (the national DTM sourcing that feeds the bake)
**Reference docs**: [CITY-REPLICATION-STANDARD.md](../../04-reference/standards/CITY-REPLICATION-STANDARD.md) (L6 terrain layer — the encoder invariants below are now part of the replication standard), [CONTEXT-DATA-TERRAIN.md](../../04-reference/geospatial/CONTEXT-DATA-TERRAIN.md) (§ encoder invariants), [V1-LAUNCH-READINESS-AUDIT.md](../../04-reference/V1-LAUNCH-READINESS-AUDIT.md) (L-639)
**Code**: `tools/context-bake/terrain.mjs` (`horizonOcclusionPoint`, `encodeQuantizedMesh`), `apps/editor/src/ui/geospatial/CesiumViewport.ts` (§CULL-PROBE), `apps/editor/src/ui/geospatial/terrainCoverage.ts` (`TERRAIN_TILESET_VERSION`)

## Context

Coastal Mediterranean Spanish cities (Barcelona, Alicante, Valencia, Málaga, Palma…) rendered shaded
terrain relief correctly in the 3D-Site (Cesium "Forma") view. **Every interior / high-elevation
Spanish city — Madrid, Burgos, Toledo, Soria, Valladolid, León… — rendered the terrain as a
featureless near-white surface**, with context buildings appearing to float. The split looked
elevation-correlated, and several plausible theories were pursued and disproved in turn: the
white-mask flat-lighting bug (real, separately fixed — vertex normals + `globe.enableLighting`); a
camera-parked-underground framing race (real, separately fixed); DTM NoData/NaN (real for rías, fixed
with a NaN-guard); a "sea-level fill" of coarse ancestor tiles (landed but irrelevant to this bug).
None of them made interior terrain render.

The breakthrough came from an **in-viewport diagnostic that asks Cesium directly why it will not draw
the tile** (`§CULL-PROBE`, added to the `[CTX-TERRAIN-GAP]` log): for each level-0 root tile it prints
`computeTileVisibility` (0 = NONE/culled, 2 = FULL), the tile's stored min/max height, its
bounding-volume centre magnitude, and its horizon-occlusion-point magnitude. Burgos read:

```
§CULL-PROBE root(0,0) vis=0(NONE) minH=51 maxH=51 bvCtrMag=… occPtMag=0.0000
```

`vis=0` = the root tile is **horizon-culled**. `occPtMag=0.0000` = the tile-header's horizon occlusion
point is the **zero vector (0,0,0) = the Earth's centre**. Cesium's horizon test treats an occludee at
the geocentre as *always below the horizon*, so the root tile is *always* culled → refinement never
starts → **0 terrain tiles render → white**. Decoding the actual served tile off R2 confirmed it at the
byte level: header **`centerMag=0`** and **`occ=(0,0,0)`**.

### Root cause — two chained encoder bugs, both specific to a per-city tile pyramid

Our per-city bake synthesises a full Cesium quantized-mesh pyramid `z0..zMax` where only the city's
~0.14° patch has real DTM and everything else is filler. The problem is entirely in the **coarse
ancestor tiles**, above all **z0, which spans a full hemisphere** (`lon[-180,0]` or `[0,180]`,
`lat[-90,90]`):

1. **Bounding centre collapses to the geocentre.** `encodeQuantizedMesh` used the **vertex centroid**
   as the tile's bounding centre. A flat coarse tile carries no triangulation error, so MARTINI
   reduces it to just its **corner vertices** — which sit at **lat ±90, the poles**. Averaging the
   poles yields **(0,0,0)**. That garbage centre was written into the tile header *and* fed to
   `horizonOcclusionPoint` as the cone axis.

2. **Horizon occlusion point collapses to zero.** `horizonOcclusionPoint` builds the standard Cesium
   occlusion cone about the centre direction and takes the max per-vertex magnitude. For a
   >hemisphere tile, **every corner vertex is >90° from the centroid**, so every candidate has a
   non-positive denominator → `resultMag` stays `0` → the returned occludee is `centreDir * 0 =
   (0,0,0)`. This is the case where Cesium's own `computeHorizonCullingPoint` returns `undefined`: **a
   single occludee point cannot horizon-cull a tile that subtends more than a hemisphere.**

Barcelona and the other far-east-coast cities sit at **positive longitude**, so their active root is
`(1,0)`; interior/most-of-Spain cities are **west-hemisphere**, active root `(0,0)`. The two roots were
baking differently enough that `(1,0)` survived while `(0,0)` collapsed — which is exactly why "coastal
good, interior white" looked like an elevation split when it was really a **which-hemisphere-root**
split. Elevation was a red herring throughout.

### Why this went undiagnosed for so long

`globe.getHeight` returning `-6,327,947 m` (≈ −Earth radius) was read for hours as a high-elevation
tessellation bug. It is not — it is simply what `getHeight` returns when **zero tiles are rendered**
(no surface to sample), i.e. a *symptom* of the cull, not a cause. Every theory that reasoned from the
number rather than from Cesium's own visibility verdict was wrong. The lesson (recorded in
[[probe-can-be-wrong-three-ways]] / the honesty family): **ship the probe that queries the runtime's
own decision before theorising** — `computeTileVisibility` named the bug in one paste.

## Decision

**Fix both encoder bugs at the data level, in `tools/context-bake/terrain.mjs`:**

### D1 — Bounding centre = the tile's geometric RECTANGLE centre, never the vertex centroid

`encodeQuantizedMesh` MUST compute the tile bounding centre as the ECEF of the tile rectangle's
mid-lon / mid-lat at mean height:

```js
const lonCdeg = ((tile.west + tile.east) / 2) / D2R;
const latCdeg = ((tile.north + tile.south) / 2) / D2R;
const c = ecefFromLonLatH(lonCdeg, latCdeg, (minH + maxH) / 2);
```

This is always a valid on-ellipsoid point (magnitude ≈ 6.38 × 10⁶), so the header centre is sane and
`horizonOcclusionPoint` gets a real cone axis. The vertex centroid is forbidden precisely because a
pole-spanning tile's corner-only mesh averages to the geocentre.

### D2 — Never-cull occludee for wide-angle / degenerate tiles

`horizonOcclusionPoint` MUST detect the degenerate case and place the occludee **high above the
ellipsoid** in the centre direction so the tile is never wrongly horizon-culled:

- If the centre direction is undefined (`|dtpScaled| == 0`), or
- If **any** vertex falls past the horizon-grazing cone (`denom ≤ 0`, i.e. >90° from centre), or
- If `resultMag ≤ 0`,

then return `centreDir * HORIZON_OCC_NEVER_CULL` (magnitude `1e4`). A magnitude-`1e4` occludee is above
every near-tile camera's horizon, so Cesium never horizon-culls the tile. **Narrow (fine) city tiles
keep the exact cone result — their culling stays correct.** This is safe because a *per-city* bake has
no far-side geometry to over-render and the camera is always at the city.

### D3 — Version-stamp the tileset URL; bump on every bake change

Terrain tiles are path-stable and cached (R2 1-day + the same-origin proxy 1-hour must-revalidate), so
a re-bake keeps the same URL and browsers keep serving the old tile. `terrainTilesetUrl` MUST append
`?v=TERRAIN_TILESET_VERSION`; Cesium's `Resource` propagates the query to `layer.json` and every
`.terrain` tile, forcing a fresh fetch. **Bump `TERRAIN_TILESET_VERSION` whenever the bake output
changes**, otherwise a correct re-bake is invisible to clients.

### D4 — Keep the §CULL-PROBE diagnostic

The `[CTX-TERRAIN-GAP] … §CULL-PROBE` line (inspecting the *active renderable* root, not a hardcoded
hemisphere) stays in the client as the standing terrain-render forensic. It is cheap, only logs, and is
the fastest path to a verdict if terrain ever fails to render again.

## Consequences

- **Every west-hemisphere / interior European city renders real terrain.** Verified: Burgos renders
  full shaded relief with the city seated on it, identical in quality to Barcelona.
- **Every pre-fix tileset must be re-baked.** All tilesets emitted before 2026-07-29 carry the
  geocentre centre + zero occludee. The full-rollout re-bake runs via the new sharded workflow
  `terrain-bake-all.yml` (BAKEABLE_REGIONS across N parallel matrix jobs). Coastal cities that already
  worked are re-baked too — the new code is strictly more correct (they get either the exact cone
  result or the safe never-cull occludee).
- **Server-side verification is now part of the loop.** After a bake, decode the root tile off R2 and
  assert `centerMag ≈ 6.38e6` and `occMag > 1` (never `0`) before asking anyone to test — this ADR was
  reached only after several blind deploy→test cycles were replaced by decoding the actual bytes.
- **The encoder invariants are normative** — see C12 §10. Any future change to `encodeQuantizedMesh`
  or `horizonOcclusionPoint` must preserve D1/D2 or it will silently reintroduce the interior-city
  white-terrain regression.

## Verification

- Client: `§CULL-PROBE root(0,0) vis=2(FULL) occPtMag=10000 renderedTerrainTiles>0`.
- R2 tile bytes (independent decode): header `centerMag=6378188` (was 0), `occMag=10000` (was 0).
- Visual: interior cities render shaded relief with buildings seated on the ground.
