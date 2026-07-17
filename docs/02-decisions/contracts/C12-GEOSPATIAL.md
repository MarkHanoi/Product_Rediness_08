# C12 — Geospatial & Coordinate Systems

> **Stamp**: 2026-05-03  
> **Status**: ACTIVE — Wave A17 (Sprint S126–S128)  
> **Governs**: `packages/geospatial/`, `plugins/ifc-import/` (IfcProjectedCRS read), `plugins/ifc-export/` (IfcProjectedCRS write), depth buffer configuration in `packages/renderer-three/`  
> **Principles**: P1 (layered), P3 (render scheduling), P8 (performance & precision)

---

## §1 — Coordinate Precision Mandate

### §1.1 LTP-ENU Rebasing

**MUST**: The scene coordinate origin MUST be recentred to the Local Tangent Plane East-North-Up (LTP-ENU) frame nearest to the camera whenever the camera moves more than **1 km** from the current scene origin.

**Rationale**: WebGL (and Three.js) use single-precision `float32` for GPU position buffers. At 1 km precision, `float32` provides ~0.06 m resolution — below the tolerance threshold for architectural elements. Beyond 1 km, jitter artefacts become visible. Typical infrastructure projects (rail corridors, road alignments) span tens to hundreds of kilometres; without rebasing, distant elements will shimmer or snap.

**Implementation**: `packages/geospatial/src/LTPENURebase.ts`
- `projectToScene(lat, lon, elev)` → `THREE.Vector3` — WGS84 to scene (ENU relative to current origin)
- `unprojectFromScene(pos)` → `{ lat, lon, elev }` — scene to WGS84
- `recenter(lat, lon, elev)` → `THREE.Vector3` — shift origin; returns translation to apply to all scene objects
- `setOrigin(lat, lon, elev)` — explicit origin reset (used on project open)

**Projection library**: `proj4` (already in workspace; tree-shaken via dynamic import). The `LTPENURebase` class MUST accept a `proj4` instance as a constructor dependency (no global singleton) to support test injection.

**CI gate**: Unit tests in `packages/geospatial/__tests__/LTPENURebase.test.ts` MUST verify:
1. Round-trip accuracy: `unproject(project(lat, lon, elev))` within 1 cm.
2. Translation vector is non-zero after `recenter`.
3. Scene origin resets to `(0, 0, 0)` after `setOrigin`.

### §1.2 IfcProjectedCRS Read-on-Import

**MUST**: When parsing an IFC file, the importer MUST detect `IFCPROJECTEDCRS` entities and extract:
- `Name` — EPSG code string (e.g. `"EPSG:27700"`)
- `GeodeticDatum` (optional)
- Easting / Northing offset (from `IFCMAPCONVERSION` linked entity)

**IF** an `IFCPROJECTEDCRS` is present, the importer MUST pass the extracted EPSG string and offsets to `LTPENURebase` to set the initial scene origin.

**IF** no `IFCPROJECTEDCRS` is present, the importer MUST assume `COORDINATE_TO_ORIGIN: true` (current behaviour — no change).

### §1.3 IfcProjectedCRS Write-on-Export

**MUST**: When exporting an IFC4X3 file and the active project has geospatial metadata (an EPSG code + origin coordinates), the exporter MUST write:
1. `IFCPROJECTEDCRS` with the EPSG code.
2. `IFCMAPCONVERSION` linking the `IFCPROJECTEDCRS` to `IFCGEOMETRICREPRESENTATIONCONTEXT` with the correct easting/northing offsets.

**MAY**: The IFC4 exporter MAY also write `IFCPROJECTEDCRS` (it is valid in IFC4). This is optional for Wave A17.

---

### §1.4 The ONE Datum Boundary — vertical anchoring on the globe

*(Ratified from §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF / L-259, which the implementation has
cited as "C12 §1.4" since 2026-07-12; written into the contract here. Extended by
§FEAT-VIEW-ACTIVATION-LOADING-OVERLAY / L-270 with the READINESS clause.)*

**The defect this closes.** A building was anchored on the photoreal globe at height `0` before
any ground measurement existed. `0` is the **WGS-84 ellipsoid** — not sea level, and not the
photoreal tile surface (the geoid separation is ≈ **+49 m** in the Balearics). The building was
therefore buried ~50 m underground, *intermittently* — a warm tile cache won the race, a cold
one lost it. **"The base is 0" and "the ground is unknown" were indistinguishable.**

- **MUST**: Every vertical anchor MUST resolve to an explicit ground **anchor** that is either
  **RESOLVED** (with its `source` recorded: `photoreal-tile-clamp` | `tileset-bounding-sphere` |
  `ellipsoid-flat-ground`) or **UNRESOLVED**. There is deliberately **no numeric fallback**: a
  fabricated `0` while photoreal tiles are the visible ground is forbidden.
- **MUST**: While the datum is UNRESOLVED and photoreal tiles are the visible ground, the
  building MUST be **held hidden** and the measurement retried (driven by the tileset's own
  load events, not a blind timer). A building you cannot see yet is honest; a building 50 m
  under the street is a georeferencing lie.
- **MUST**: When the retry budget is exhausted, the building MUST be revealed at the last-known
  base **and the failure logged loudly** (`source: 'unresolved'`). Never silent.
- **MUST (readiness, L-270)**: The terminal of that clamp — seat-and-reveal, or the explicit
  give-up — is the platform's **ground-settle readiness signal**
  (`CesiumViewport.whenGroundSettled()`). Anything that must not act on an unanchored model
  MUST consume THAT signal rather than invent its own notion of "the terrain is probably ready
  by now". The 3D-globe / 3D-Site loading overlay dismisses on it and gates scene input until
  it arrives (C11 §6.6, CI-3/CI-4). A viewport torn down mid-clamp MUST report `settled: false`
  so consumers fail visibly instead of waiting forever.
- **Reference**: `apps/editor/src/ui/geospatial/globeGroundAnchor.ts` (pure:
  `resolveGlobeGroundAnchor`, `decideGroundAnchorAction`), `CesiumViewport`
  (`clampToPhotorealTilesThenReplace`, `reframeAfterBaseSettle` = the settle chokepoint).

---

## §2 — Logarithmic Depth Buffer

**MUST**: The Three.js renderer MUST use a logarithmic depth buffer when any loaded model spans more than **500 m** in any axis (detected from the scene bounding box after import).

**Rationale**: Default linear depth buffers produce Z-fighting at large scales (e.g. 10 km infrastructure corridors). A logarithmic depth buffer distributes precision inversely proportional to distance, eliminating Z-fighting for near and far geometry simultaneously.

**Configuration**: `packages/renderer-three/src/RenderPipelineService.ts`
- Renderer MUST be initialised with `logarithmicDepthBuffer: true` when the scene extent exceeds the threshold.
- A re-initialisation of the renderer is NOT required if the threshold is crossed after initial load; the renderer may be created with `logarithmicDepthBuffer: true` unconditionally (minor GPU cost, eliminates conditional logic).

**CI gate (soft-fail → hard-fail Phase F)**: `packages/renderer-three/__tests__/depth-buffer.test.ts` MUST assert that `renderer.capabilities.logarithmicDepthBuffer` is `true` when the scene extent exceeds 500 m.

---

## §3 — Proj4 Integration Rules

- `proj4` MUST be imported as a peer dependency in `packages/geospatial/` (not inlined).
- The geospatial package MUST NOT import from `packages/renderer-three/` directly. Coordinate conversions are pure math; Three.js `Vector3` results are constructed via `new THREE.Vector3(x, y, z)` only, with THREE imported from `@pryzm/renderer-three`.
- All projection calls MUST be wrapped in OTel spans named `pryzm.geospatial.*` (e.g. `pryzm.geospatial.projectToScene`).

---

## §4 — Package Boundaries

| Package | Responsibility |
|---|---|
| `packages/geospatial/` | LTP-ENU rebasing, proj4 wrappers, `IfcProjectedCRS` parse helpers |
| `plugins/ifc-import/` | Extract `IFCPROJECTEDCRS` + `IFCMAPCONVERSION` on import; pass to geospatial |
| `plugins/ifc-export/` | Write `IFCPROJECTEDCRS` + `IFCMAPCONVERSION` on IFC4X3 export |
| `packages/renderer-three/` | Enable logarithmic depth buffer based on scene extent |

Cross-package dependency direction: `renderer-three` ← `geospatial` ← `plugins/ifc-*`. No reverse imports.

---

## §5 — Wave Delivery Schedule

| Wave | Deliverable |
|---|---|
| A17 (Sprint S126) | `LTPENURebase.ts`, `IFC4X3Exporter.ts` with `IFCPROJECTEDCRS` write |
| A17 (Sprint S127) | `IfcProjectedCRS` read-on-import in `plugins/ifc-import/` |
| A17 (Sprint S128) | Logarithmic depth buffer enabled in `renderer-three` |

---

### §7 — Georeferenced building placement on the photoreal 3D-Tiles globe (Known-good ACTIVE)

*(Ratified 2026-07-17 from [ADR-0268](../adrs/ADR-0268-cesium-3d-tiles-georeferenced-building-placement.md).
This §7 is the normative invariant for placing an authored building on the Google Photorealistic 3D-Tiles
"3D globe" / "3D Site" view. Extends §1.4 (the vertical datum boundary) with the horizontal-anchor, massing,
and coexistence invariants. **Status: Known-good ACTIVE behavior** — verified WORKING live on Fly, 2026-07-17,
baseline tag `snapshot-cesium-3d-globe-working-2026-07-17`; the live-run evidence is logged as
[V1-LAUNCH-READINESS-AUDIT L-365](../../04-reference/V1-LAUNCH-READINESS-AUDIT.md).)*

- **MUST (horizontal anchor = LTP-ENU origin).** A building placed on the globe MUST be anchored via ONE
  `eastNorthUpToFixedFrame` at the **LTP-ENU origin** (`getCurrentSiteOrigin()`) — the frame the boundary and
  every wall's scene-XZ are baked in — **NOT** at the geocoded address (`siteModelStore.getLocation()`). The
  address is instrumentation only; the anchor↔LTP and LTP↔address separations MUST be measured
  (`originSeparationMeters`) and logged at placement (`logGlobeAnchorEvidence`). Verified live: anchor↔LTP =
  **0.0 m** at LAT 40.420070, LON -3.705955.
- **MUST (ground datum via photoreal-tile-clamp when no terrain provider).** When photoreal tiles are the
  visible ground and no terrain provider is used, the vertical datum MUST resolve off the **tile mesh**:
  `min(footprint + street-ring picks) − seatEpsilon` with the placed model **excluded** from the raycast
  (`source: 'photoreal-tile-clamp'`), falling back to the tileset bounding-sphere ground, else UNRESOLVED.
  When no tiles are shown the ellipsoid IS the ground (`source: 'ellipsoid-flat-ground'`, height 0). Verified
  live: base **706.90 m** via `photoreal-tile-clamp` (the tile mesh IS the ground).
- **MUST (base height is ELLIPSOIDAL WGS-84, not AMSL).** Every base height handed to Cesium's placement APIs
  is ELLIPSOIDAL WGS-84 (`GroundDatum = 'ellipsoidal-wgs84'`), never orthometric / mean-sea-level. A fabricated
  `0` while photoreal tiles are the visible ground is forbidden (§1.4).
- **MUST (seat-and-reveal ordering).** While the datum is UNRESOLVED, the building MUST be **held HIDDEN** and
  retried on the tileset's load events (a `retriesLeft` countdown), then **revealed** on `seat-and-reveal`; a
  spent retry budget reveals at the last-known base with a loud `unresolved` warning. This terminal is the
  ground-settle readiness signal `CesiumViewport.whenGroundSettled()` (§1.4 readiness clause, §A.21.D49).
- **MUST (full-height massing).** A perf-capped tall tower whose authored bands collapse to a single ground
  band MUST be extruded to the resolved full building height (`§FORMA-FULL-HEIGHT`:
  `resolveFullBuildingHeight` MAX over override / band-top / slab tops / roof tops / model sphere, then
  `tileBandsToFullHeight` stacks per-storey footprint prisms) so it reads at true scale in context.
- **MUST (renderer coexistence — share the camera, not the device).** The placed detailed model is a native
  `Cesium.Model` glTF scene primitive (`§A.21.D49` `renderRealModelOnGlobe`), depth-tested against the tiles
  by Cesium; `CesiumThreeBridge` shares only the THREE camera/scene (ENU floating-origin re-parent), **never**
  the GPUDevice or canvas. Cesium is its own WebGL viewer above the BIM overlay; composes with
  `§RENDERER-LIVE-SWAP`. The glTF axis convention is pinned (`§GLOBE-HEADING-90`: `upAxis: Y`, `forwardAxis: X`)
  so the ENU mapping matches the massing's (east = x, north = −z, up = y) and the model is true-north-aligned.
- **MUST (frame once, no jump).** After the base settles, frame the building once via `flyToBoundingSphere`
  (`§GLOBE-FIT-BUILDING`), re-framing only after settle and never fighting user camera control or an invalid
  target (`§GLOBE-FRAME-NO-JUMP`). **EXCEPTION — stale-frame override (`§GLOBE-STALE-FRAME-REFRAME`, L-370):**
  the "never fight user camera control" rule holds ONLY for small settles. Because the initial frame is flown
  EARLY at the unresolved base 0 and the tile datum can resolve LATE and lift the building hundreds of metres
  (live trace: 0 → 706.9 m), a base settle that moves the building more than `GLOBE_STALE_FRAME_BASE_JUMP_M`
  (20 m) from the base the current frame was flown against (`formaFramedAtBaseHeight`) makes that frame STALE —
  it points at empty ground where the building WAS — so the one-shot corrective re-frame MUST still fire even
  after the user moved the camera (otherwise the user must manually zoom to find the building). The fire-at-
  most-once latch and the small-settle user-control protection are preserved for jumps at or under the
  threshold. Seam: `CesiumViewport.performInitialReframe`.
- **Reference (read-only):** `apps/editor/src/ui/geospatial/globeGroundAnchor.ts` (pure decisions),
  `CesiumViewport` (`renderRealModelOnGlobe:7530`, `renderFormaMassing:3021`, `resolveFullBuildingHeight:8035`,
  `tileBandsToFullHeight:8081`, `holdGlobeBuildingForUnresolvedGround:4340`, `revealGlobeBuildingForGround:4352`,
  `logGlobeAnchorEvidence:4391`), `packages/renderer-three/src/geospatial/CesiumThreeBridge.ts`. Pipeline spec:
  [SPEC-FORMA-SITE-VIEW §11](../../03-execution/specs/SPEC-FORMA-SITE-VIEW.md).

---

## §8 — Context-building fetch strategy — ONE far-extent Overpass query (§PERF-CTX-SINGLE-FETCH, L-368)

The surrounding OSM context buildings (2D map fill + Forma 3D near ring + far LOD ring) are fetched
from keyless Overpass with **exactly ONE network query per site**, at the FAR extent
(`CONTEXT_BBOX_FAR_HALF_DEG = 0.016°`). The near ring (`CONTEXT_BBOX_HALF_DEG = 0.008°`) is a
**subset** of that superset, so both rings are derived CLIENT-SIDE from the single response —
never by a second fetch:

- **NEAR** (extruded + shadow-casting) = footprints whose centroid falls inside the near bbox
  (`selectNearFootprints`).
- **FAR** (flat/low-poly, shadows OFF, nearest-N capped `CONTEXT_FAR_MAX_BUILDINGS = 900`) =
  superset minus the near disc, deduped by osmId, nearest-first (`selectFarRingFootprints`,
  §FEAT-FORMA-CONTEXT-EXTENT-LOD / L-187). Near ∪ Far is the exact complement — no overlap, no gap.

**Latency rule (this was previously ungoverned).** No context-building code path may issue a WIDE
query first and a NARROW query as a serial fallback purely to guard against a transient empty
result: empty Overpass results are never cached (client persist guard + server `MISS-EMPTY`), so a
wide-first-0 pattern re-pays that wasted round-trip on **every** visit. The ONLY permitted second
fetch is a **single** narrow-extent (`CONTEXT_BBOX_FALLBACK_HALF_DEG = 0.005°`) fallback taken
**once** when the far-extent query genuinely returns 0 (sparse/empty area) — never a wide-first
storm. The single far-extent query is non-empty → cacheable, so a repeat visit hits the persistent
localStorage cache (L-273) and skips Overpass entirely; **cache keys per site = 1** (was up to 3).

Preserved invariants: the in-flight per-bbox dedup (§SITE-METRIC-OVERPASS-PARALLEL / L-323), the
gentle-mirror concurrency + 429 back-off (§OVERPASS-GENTLE-MIRRORS / **ADR-0088**), the same-origin
`/api/overpass` proxy cache, and the far-ring LOD render budget (cap / flat / shadows-off). Entry
points: `fetchContextBuildingsNearAndFar` (near+far split) and `fetchContextBuildings` (delegates to
`.near`) in `apps/editor/src/ui/geospatial/contextBuildings.ts`; consumed by
`CesiumViewport.loadContextBuildings` + `renderContextBuildingsFarRing` and `SiteBoundaryMap2D`.

---

## §6 — Contract History

| Date | Change |
|---|---|
| 2026-05-03 | Initial contract created — Wave A17 geospatial track (A17-T1). |
| 2026-07-12 | §1.4 The ONE Datum Boundary added (ratified from §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF / L-259). |
| 2026-07-17 | §7 Georeferenced building placement on the photoreal 3D-Tiles globe added (Known-good ACTIVE; ADR-0268; baseline `snapshot-cesium-3d-globe-working-2026-07-17`; evidence L-365). |
| 2026-07-17 | §8 Context-building fetch strategy added — ONE far-extent Overpass query, near+far split client-side (§PERF-CTX-SINGLE-FETCH; L-368; closes the previously-ungoverned context-fetch-latency gap). |
| 2026-07-17 | §7 "frame once, no jump" MUST refined — added the `§GLOBE-STALE-FRAME-REFRAME` (L-370) exception: a >20 m base-height jump between the early frame and the resolved datum re-frames ONCE even after user camera movement (the frame is stale), so no manual zoom is needed to find the lifted building. |
