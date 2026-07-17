# ADR-0268 — Cesium 3D-Tiles georeferenced building placement (LTP-ENU anchor · photoreal-tile-clamp ground datum · seat-and-reveal · full-height massing · CesiumThreeBridge coexistence)

- **Status:** ACCEPTED (2026-07-17) — IMPLEMENTED + **VERIFIED WORKING LIVE** on Fly (`pryzm.fly.dev`, 2026-07-17). Verified-good baseline is snapshot tag **`snapshot-cesium-3d-globe-working-2026-07-17`**.
- **Owner:** geospatial (the Cesium "3D globe" / "3D Site" placement surface).
- **Governs:** how a PRYZM building is placed, seated, and framed on the Google Photorealistic 3D-Tiles globe.
- **Ratifies into contract:** [C12 §7](../contracts/C12-GEOSPATIAL.md) (the georeferenced-placement invariant). Builds on and consolidates the globe-clamp slice of [ADR-0095](./ADR-0095-real-datasets-site-analysis-facade-footprint-and-globe-clamp.md); companion to [ADR-0065](./ADR-0065-geodata-analytical-layers-pluggable-provider.md).
- **Affects (all read-only for this ADR — code already shipped):**
  - `apps/editor/src/ui/geospatial/globeGroundAnchor.ts` — the PURE datum + georef reductions (`resolveGlobeGroundAnchor`, `decideGroundAnchorAction`, `reduceTileGroundHeight`, `originSeparationMeters`, `georefOriginsDiverge`).
  - `apps/editor/src/ui/geospatial/CesiumViewport.ts` — the live wiring (`renderRealModelOnGlobe:7530`, `renderFormaMassing:3021`, `resolveFullBuildingHeight:8035`, `tileBandsToFullHeight:8081`, `holdGlobeBuildingForUnresolvedGround:4340`, `revealGlobeBuildingForGround:4352`, `logGlobeAnchorEvidence:4391`, `flyToModelBoundingSphere:4836`).
  - `apps/editor/src/ui/geospatial/viewActivationLoading.ts` — the anchor/ready gate (`whenGroundSettled()` consumer).
  - `packages/renderer-three/src/geospatial/CesiumThreeBridge.ts` — the THREE↔Cesium camera/scene bridge (ENU floating-origin anchor).
- **§-tags cited (canonical in-code anchors):** `§FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF` (L-259), `photoreal-tile-clamp`, `§FORMA-FULL-HEIGHT`, `§A.21.D49`, `§GLOBE-FIT-BUILDING`, `§GLOBE-FRAME-NO-JUMP`, `§GLOBE-HEADING-90` / `§A.21.D54`.

---

## Context

PRYZM can place the authored BIM building onto Google Photorealistic 3D-Tiles ("3D globe" / "3D Site"
view) so the design stands inside the real-world city. Getting a building to sit **correctly** on the
photoreal tiles is a georeferencing problem with two independent axes — horizontal position and vertical
datum — plus a renderer-coexistence problem (WebGPU BIM canvas vs WebGL Cesium canvas). Historically each
was mis-handled:

1. **Vertical burial (defect i).** Every height Cesium consumes via `Cartesian3.fromDegrees(lon, lat, h)`
   / `Transforms.eastNorthUpToFixedFrame` is **ELLIPSOIDAL WGS-84**, not orthometric (AMSL). `h = 0` is the
   ellipsoid, not sea level and not the tile surface. The photoreal mesh is authored in ellipsoidal heights
   (geoid separation ≈ **+49 m** in the Balearics), so anchoring at the pre-sample default `0` buries the
   building ~50 m under the tiles. Worse, the tile-surface height sample is **asynchronous** (only returns
   once tiles have streamed at LOD): a warm cache won the race and looked correct; a cold cache lost it and
   buried the building. "The base is 0" and "the ground is unknown" were indistinguishable.

2. **Horizontal offset (defect ii).** PRYZM has two georeference authorities — the **LTP-ENU origin**
   (`getCurrentSiteOrigin()`, the frame every authored wall's scene-XZ is baked in) and the **geocoded
   address** (`siteModelStore.getLocation()`). They coincide until a boundary is committed, after which the
   LTP origin is frozen (C19 §1.3) while the store location can still move. Anchoring or framing at the
   address while geometry lives in the LTP frame offsets the whole view by their separation.

3. **Stub massing.** A perf-capped tall tower feeds the massing only its ground-storey shell walls, so the
   shell extruded to a single ~19.5 m band and sank among the tall photoreal context.

4. **Renderer coexistence.** The editor renders BIM with **WebGPU**; Cesium renders **WebGL** on its own
   canvas, raised above and hiding the BIM canvases. A THREE-scene overlay (`CesiumThreeBridge`) owns no
   canvas of its own, so it cannot draw on the raised Cesium surface, and it assumes WebGL not WebGPU.

The live Fly run of 2026-07-17 (snapshot `snapshot-cesium-3d-globe-working-2026-07-17`) confirmed the
residential building places **correctly** end-to-end: anchor **LAT 40.420070, LON -3.705955** = the LTP-ENU
origin (anchor↔LTP separation **0.0 m**); ground datum resolved via **photoreal-tile-clamp** to base height
**706.90 m ELLIPSOIDAL** (the tile mesh IS the ground; no terrain provider); building held hidden until the
datum resolved then revealed; full tower height extruded (per-storey 4-vertex perimeter prisms + slabs/roof,
214 opening insets, 5 stair volumes); framed once by `flyToBoundingSphere`. This ADR records that behavior as
the canonical, verified-good design.

## Decision

Adopt the following as the normative georeferenced-placement design (each already implemented; this ADR pins
it so it cannot silently regress).

### D1 — The anchor is the LTP-ENU origin, never the geocoded address

The building is anchored at the **LTP-ENU origin** (`getCurrentSiteOrigin()`) — the exact frame the boundary
and every wall's scene-XZ are baked in — via ONE `eastNorthUpToFixedFrame` at that origin. The geocoded
address is instrumentation only. `originSeparationMeters` + `georefOriginsDiverge` measure and log the
anchor↔LTP and LTP↔address separations at the moment of placement (`logGlobeAnchorEvidence`), so a horizontal
defect is self-evident in the console rather than argued from screenshots. Verified live: anchor↔LTP = 0.0 m.

### D2 — The ground datum is resolved by photoreal-tile-clamp; `0` is never a fallback

The vertical anchor resolves to an explicit `GlobeGroundAnchor` that is either **RESOLVED** (with a recorded
`source`) or **UNRESOLVED** (`heightM: null` — deliberately no numeric fallback). When photoreal tiles are the
visible ground, `resolveGlobeGroundAnchor` clamps to `min(tile-surface picks) − seatEpsilon`
(`source: 'photoreal-tile-clamp'`) — the MIN over footprint + street-ring samples recovers true street ground
even when the centroid is occluded by a neighbour roof, and the raycast **excludes the placed model** so it
never samples its own roof (the ADR-0095 creep-up fix). When no tiles are shown, the rendered surface IS the
ellipsoid, so `0` is a true datum statement (`source: 'ellipsoid-flat-ground'`), not a fallback. All heights
are **ELLIPSOIDAL WGS-84**, stated in the `GroundDatum` type so no caller can pass an AMSL height invisibly.
Verified live: base 706.90 m ELLIPSOIDAL, source `photoreal-tile-clamp`.

### D3 — Seat-and-reveal ordering: hold hidden until the datum resolves

While the datum is UNRESOLVED and tiles are the visible ground, the building is **held HIDDEN**
(`holdGlobeBuildingForUnresolvedGround` / `newModel.show = false`) and the measurement is retried, driven by
the tileset's own load events (a `retriesLeft` countdown), not a blind timer. `decideGroundAnchorAction`
returns `hold-hidden-retry` → `seat-and-reveal` (on a measured datum) → `reveal-unknown-datum-warn` (budget
exhausted: reveal at last-known base but log loudly, `source: 'unresolved'`). "A building you cannot see yet
is honest; a building 50 m under the street is a georeferencing lie." The terminal of that clamp is the
platform's **ground-settle readiness signal** (`CesiumViewport.whenGroundSettled()`), which the 3D-globe /
3D-Site loading overlay consumes (§A.21.D49; C12 §1.4 readiness clause).

### D4 — Full-height massing (§FORMA-FULL-HEIGHT)

`resolveFullBuildingHeight` takes the MAX over the caller `fullBuildingHeightM` override, the tallest storey
band top, every slab `topElevation`, every roof `baseElevation + thickness`, and (last-resort, clamped) the
placed model's bounding-sphere diameter. When the authored bands top out materially below that,
`tileBandsToFullHeight` tiles the ground band's footprint upward into evenly-stacked storey bands (reusing the
ground perimeter, carrying no `levelId` — massing-only) until the stack reaches full height, so a perf-capped
tower extrudes and the façade sun study paints across the whole elevation instead of a single stub.

### D5 — CesiumThreeBridge coexistence (share the camera, not the device)

The real detailed model is placed as a native **`Cesium.Model` glTF scene primitive** (`§A.21.D49`
`renderRealModelOnGlobe`): the live BIM THREE scene is serialised to GLB and loaded into Cesium, which
depth-tests it against the 3D-Tiles natively — sidestepping the WebGPU↔WebGL split entirely. `CesiumThreeBridge`
shares only the THREE **camera + scene** (an ENU floating-origin re-parent, `eastNorthUpToFixedFrame` at the
anchor), never the GPUDevice or canvas; it composes with `§RENDERER-LIVE-SWAP`. Cesium is its own WebGL viewer
raised above the BIM overlay. The glTF axis convention is pinned by `§GLOBE-HEADING-90` / `§A.21.D54`
(`upAxis: Y`, `forwardAxis: X` = `Y_UP_TO_Z_UP` only) so the model's ENU mapping matches the massing's
(east = x, north = −z, up = y) and it is true-north-aligned.

### D6 — Framing without jump (§GLOBE-FIT-BUILDING / §GLOBE-FRAME-NO-JUMP)

After the base settles, the camera frames the placed building **once** via `flyToBoundingSphere`
(`flyToModelBoundingSphere`, ~2.5× radius, zoom-extents), re-framing only after the datum settles
(`reframeAfterBaseSettle`). `§GLOBE-FRAME-NO-JUMP` guards prevent a late corrective flight from fighting user
camera control or an invalid (NaN) frame target.

## Consequences

- The building sits on true ground, at the correct horizontal position, and never intermittently buries or
  creeps. The failure modes are now honest (hidden-while-streaming, or a loud unresolved-datum warning) rather
  than a silent 50 m burial.
- The vertical datum is a typed, logged, testable value. The pure reductions in `globeGroundAnchor.ts` are
  unit-testable without a live Cesium viewer (which cannot run headless), mirroring the `globePlacementDecisions`
  precedent; being pure decisions they are P8 span-exempt.
- Full-height massing means perf-capped towers read at true scale in context.
- WebGPU/WebGL coexistence is achieved by the glTF-primitive path (renderer-agnostic) + camera-only bridge; no
  GPUDevice or canvas is shared, so a Cesium `recoverFromGpuReset` is a downstream reaction, never causal.
- P2/P3/P5 respected: no THREE outside renderer-three, no rAF, no schema mutation; `globeGroundAnchor.ts` has
  no Cesium/THREE/DOM/I-O imports.
- **Known-good baseline** is fixed at snapshot `snapshot-cesium-3d-globe-working-2026-07-17`; any regression is
  measured against that tag and the live-run evidence recorded in [V1-LAUNCH-READINESS-AUDIT L-365](../../04-reference/V1-LAUNCH-READINESS-AUDIT.md).

## Alternatives considered

- **Anchor at the geocoded address.** Rejected — geometry is baked in the LTP-ENU frame; anchoring at the
  address offsets the building by the (frozen-origin vs moving-store) separation (defect ii).
- **Anchor at `h = 0` (ellipsoid) with a terrain provider fallback.** Rejected — `0` is the WGS-84 ellipsoid,
  ~49 m below MSL in the Balearics; with photoreal tiles as the ground it buries the building. No terrain
  provider is used — the tile mesh IS the ground.
- **A blind timer to wait for tiles before seating.** Rejected — the wait is data-dependent (network/cache);
  the tileset's own load events drive the retry, and `whenGroundSettled()` is the honest readiness signal.
- **Render the BIM via the `CesiumThreeBridge` THREE overlay.** Rejected for the placed model — the bridge
  owns no canvas and assumes WebGL, so on the raised WebGPU-vs-WebGL split it is never drawn; the glTF scene
  primitive is renderer-agnostic and depth-tests natively against the tiles.
- **Hide the model during each sample tick instead of excluding it from the raycast.** Rejected in ADR-0095 —
  `objectsToExclude` is cleaner and doesn't flicker (retained here).
