# RAC Site/Solar/Spatial-Context Inventory (Dimension B evidence)

**Status: living audit.** Compiled 2026-08-10. Readiness classes: **(a)** data+live read
API · **(b)** data exists, no query API · **(c)** computed on demand in UI only · **(d)** missing.

## 1. Geolocation + north

- Canonical: `SiteModel` (`packages/schemas/src/site/SiteModel.ts:36`) with
  `SiteLocationSchema {latitude, longitude, elevationAsl, trueNorth(rad), crs, basePoint…}`
  (`SiteLocation.ts:27-40`); store `SiteModelStore` (`packages/stores/src/SiteModelStore.ts:52-74`)
  — `getSite/getLocation/getParcelBoundary/getFootprint/getContextBuildings/subscribe`.
  Writes only via `site.*` commands. Editor helper `getCurrentSiteOrigin()`
  (`siteDispatch.ts:581`).
- **Dual-north (ADR-0115/§L-430)**: θ = `trueNorth`; pure math
  `apps/editor/src/ui/site/overlay/projectTrueNorth.ts` (`projectVectorToTrueNorth:162` etc.);
  compass basis in model XZ: **N=−Z, E=+X, S=+Z, W=−X** (`FacadeOrientationMath.ts:41-46`);
  solar frame ENU (+X E, +Y Up, +Z S) with `projectNorthRad` shift, equivalence pinned by test.
- ⚠ **θ is passed as 0 by EVERY facade-orientation caller** (AIPanel `:1198` literal 0;
  executors omit) → "south-facing" is project-south, wrong on rotated sites.

## 2. Solar

- `@pryzm/solar-analysis` (pure, θ-aware): `computeSolarPositionRad`,
  `generateSunSamples(opts)`, `accumulateSunHours(surfaces, samples, isOccluded)`,
  `buildOccluderIndex`, **`accumulateRoomHeatGain` (SHGC per-room heat) — ZERO consumers** (b).
- THREE driver: `renderer-three/src/solar/computeSunHoursOnModel.ts` (paints heatmap; result
  not persisted/queryable per element — c). Editor: `sunHoursConsole.ts`
  (`window.pryzmComputeSunHours`), `SolarSunHoursPanel`.
- 3D-Site overlays: `FormaSunViewport` (`FormaSiteAnalysisControls.ts:88-133`) —
  sun path/wind/heat/metric setters on `CesiumViewport` (render-only; c). Shared UI state:
  `environmentAnalysisStore` (C59 §6; a). Viewport light: `RealSunService`
  (`setTime/setLocation/setProjectNorth`; c). Climate/wind: `ClimateStore` + windRose schema
  + climate-host fallback (a, provenance-tagged).

## 3. Facade orientation

`FacadeOrientationService` (`packages/spatial-index/src/FacadeOrientationService.ts:29-42`):
`getFacades(levelId, trueNorth=0)`, `exteriorWalls`, `facadesByOrientation(levelId,'N|E|S|W')`;
singleton on `window.facadeOrientationService`. **Can answer "south-facing exterior walls"
today** with caveats: per-level only (no roll-up); θ=0 everywhere; **requires detected rooms**
(walls with 0 bounding rooms get `orientation: null` — no rooms ⇒ zero south walls, silently);
4-point compass. Consumers incl. `AIPanel.getFacadeWallIds` (the closest existing chat scope).

## 4. Exterior/interior — three unreconciled definitions, not stored

Topological (`boundingRoomCount ≤ 1`, `FacadeOrientationMath.ts:106`) · geometric probe
(`solarSurfaceFilter.isExteriorFace`) · ai-host shell analysis (`shellAnalysis.ts:145`).
Wall schema has NO isExterior; `WallSide` is a finish-side concept — don't confuse. (c)

## 5. Parcel / envelope / terrain

`ParcelSchema {boundary+edgeClassifications('front|side|rear'), setbacks(null≠0, ADR-0270),
maxFAR, maxHeight, zoning, buildableRing, area}` (`Parcel.ts:82-124`).
**`buildableRing` is THE persisted buildable truth** — consumers must read it, never re-inset.
Editor helpers (`siteDispatch.ts`): `getLastBuildableEnvelope:709`,
`resolveBuildableFootprint:872`, `isZoningResponseStale:910` … all inside a 4000-line UI
module — **no headless SiteQueryService exists** (a schema / b headless). Zoning engine +
~40 jurisdiction providers in `packages/site-parcel-data`. Terrain: baked tiles + clamp cache
(`terrainCoverage.ts`, `CesiumViewport.ts:1051+`; c).

## 6. Relationships / rooms / spatial

- `SemanticGraphManager` (`core-app-model/src/SemanticGraph.ts`): 25 relation types,
  O(k) reads (`getTargets/getSources/traverse`), maintained by ~25 commands (a) —
  ⚠ `adjacentTo/boundedBy/connectedTo` written ONLY by room (re)detect; stale after wall edits.
- `RoomQueryService` (window-exposed): adjacency/connectivity/`findPath`/
  `findAccessiblePath`/`describeGraph` (built for AI payloads) (a);
  **`getElementsInRoom` covers doors+furniture+plumbing ONLY** (doc comment lies about
  windows/columns) (c); `getBoundaryElements` hard-codes `'wall'` type.
- `RoomStore` (`room-topology`): `getByLevel`, `getRoomsContainingPoint`,
  `getTotalAreaByOccupancy`, `getAreaSchedule`, `areAdjacent` (a);
  **no findByName/occupancy/area-threshold predicates** (b). `RoomData` carries name,
  `occupancyType` (closed enum incl. bedroom/kitchen/office…), `computed.area/centroid/bbox`.
- Levels: `LevelStore.list/findByNumber/findByElevation` — "levels 2–4" resolvable (a).
- Spatial indexes exist (`SpatialGrid`, `BVHQuery`, room spatial index) but **no
  element-level near/within service is exposed anywhere** (b); `ElementSpatialIndex`
  un-promoted (TODO TASK-08).
- **Chat contract today**: `CapabilityScope = selection|all|global` only; `AIReadModel` has
  **zero site/north/orientation/exterior getters** (d).

## 7. The 5 highest-leverage wirings (adopted into the roadmap)

1. Thread θ from `siteModelStore.getLocation().trueNorth` into facade classification +
   all-levels roll-up + fix the 0-bounding-rooms orientation hole → true "south-facing".
2. Headless **SiteQueryService** (parcel/buildableRing/setbacks/θ/lat-lng) promoted out of
   `siteDispatch.ts`, window-exposed beside roomQueryService.
3. Typed room predicates on RoomStore: `findByName/findByOccupancy/findByArea`.
4. Complete `getElementsInRoom` kinds (windows via hosts, columns, beams, lighting, stairs)
   + fix curtain-wall boundary type + the lying doc comment.
5. Element near/within service (promote ElementSpatialIndex or wrap SpatialGrid/BVH),
   compose with `semanticGraphManager.traverse` for near/adjacent.
   **Gating bonus:** extend `CapabilityScope` + value sources (orientation, room-ref,
   level-range) — the coverage gate rejects spatial capabilities until this lands.
