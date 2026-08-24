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

### §1.5 — KNOWN VIOLATION: `CesiumThreeBridge.setAnchor()` puts ECEF coordinates in the BIM scene graph (L-604, OPEN)

> **Status: OPEN — NOT fixed. Recorded so this contract stops claiming behaviour the code does
> not have.** Severity **P1** (silent geometry corruption class). Owner: **UNASSIGNED**.
> Target: **TBD**.

**The violation.** §1.1 mandates that the THREE scene coordinate frame is **LTP-ENU, local, and
recentred within 1 km of the camera**, for the stated `float32` precision reason.
`plugins/geospatial/src/CesiumThreeBridge.ts` `setAnchor()` (`:63–101`) does the opposite: it
re-parents BIM meshes into a `GIS_BIM_ROOT` group and assigns that group the **full ECEF**
`Cesium.Transforms.eastNorthUpToFixedFrame(anchor)` matrix. The group's translation is the
anchor's Earth-centred position — **~6.37 × 10⁶ m for any point on Earth**. Every mesh beneath it
therefore has a **world** position at ECEF magnitude while its **local** position is unchanged.
That is precisely the regime §1.1 exists to prevent, and it is not merely a rendering concern:
any consumer that reads **world** coordinates from the shared scene graph inherits the ECEF
frame.

**The consumer it broke.** `SplitViewManager._fitCamTargetToScene()` expands a `Box3` over every
mesh in the scene (world space) and hands the centre to the plan camera target. Because
`PlanViewCanvas.screenToWorld` **adds** that target to every click, a globe-scale target
relocates authored geometry — the L-481 defect (a wall committed ~300 km from the origin).

**What is verified, and what is not** (§C58 §1.4 honesty, applied to our own diagnosis):
- ✅ **Verified by code reading:** `setAnchor()` is the only mechanism in the repository that can
  place globe-scale transforms into the BIM THREE scene graph, and `_fitCamTargetToScene`
  consumes world coordinates.
- ✅ **VERIFIED 2026-08-19 (L-1420) — `setAnchor()` DOES run, and the call path recorded here was
  WRONG.** This bullet used to read *"❌ NOT verified: that `setAnchor()` actually ran … `setAnchor()`
  is called from the separate `cesium-model-transformed` event."* There is a **SECOND call site this
  contract did not know about**: `apps/editor/src/ui/layout/GISAreaLayout.ts:556–560` calls
  `bridge.setAnchor()` **unconditionally on first GIS init**, with a **hard-coded default anchor —
  the Sydney Opera House, `lon 151.2153 / lat -33.8568`** — before any geocode, for **every project
  in every city**. It always runs. (The unconditional Sydney default is itself a defect: **L-1423,
  OPEN, P2**.)
- ✅ **VERIFIED 2026-08-19 (L-1420) — the derivation IS established, for the GLB-export consumer.**
  This bullet used to read *"❌ NOT verified: that the observed target … is arithmetically the ECEF
  anchor."* The caution was correct and is retained below; what changed is that a **second consumer**
  produced a number that **does** close arithmetically. The founder's 3D-Globe **Real** export logged
  `📦 Bounding box minY: 2553068.999066395`, and:

  | | |
  |---|---|
  | WGS-84 ECEF **Y** of the Sydney default anchor | **2 553 076.920 m** |
  | observed `minY` | **2 553 068.999 m** |
  | residual | **−7.921 m** = `east_y · x_local` for `east_y = −0.876435`, i.e. a **9.04 m** east extent — **a house footprint** |

  The offset **is** the anchor translation and the remainder **is** the building. That is a
  derivation, not a magnitude. It is re-derived from WGS-84 first principles (importing nothing from
  the code under test) in `packages/file-format/__tests__/glb-export-authoring-frame.test.ts`.
- ❌ **STILL NOT VERIFIED — do not read the above as covering it.** The **plan-fit** target
  `(-1505720.29, -1635527.14, -948869.49)` recorded in this section is a **DIFFERENT observation from
  a different session**, and it has **not** been closed arithmetically against any anchor. Barcelona's
  ECEF is positive in x and z; that triple is negative in all three. **The magnitude is globe-scale;
  that derivation is not established.** Naming `setAnchor()` as *the* producer of THAT number on
  magnitude alone would still be exactly the inference that made L-481 stall for weeks.

**Why no speculative fix was made.** The obvious candidates — filter `GIS_BIM_ROOT` out of the
plan fit, or make the fit run in the authoring frame rather than the world frame — each change
what the plan pane frames, and picking one against an unconfirmed producer risks "fixing" the
wrong thing (the L-481 note in `SplitViewManager` says the underlay was the leading suspect, and
that too was inferred from magnitude and never traced). What shipped instead (L-604) is the
evidence the diagnosis needs:
- the outlier probe now measures **world** position and prints the **ancestry**, because the
  previous probe read `obj.position` (LOCAL) and therefore could not see a parent-borne
  transform at all — **a probe that passed while measuring nothing**;
- the producer now **refuses** an implausible fit against the same imported bound the consumer
  enforces, keeps the last good target, and logs **once** instead of every frame.

**The real fix belongs here, in C12**, not in the plan pane: either the bridge must not place
ECEF coordinates in the shared scene graph at all (an LTP-ENU-relative group per §1.1), or C12
must declare an explicit, contracted exception with a named frame flag that world-space consumers
can test. Until one of those lands, this section stands as the record that the code disagrees
with §1.1 and **the code is wrong**. ⇒ **The named frame is specified in §9 (the SiteFrame
authority); L-604 is closed by folding this bridge under it.**

#### §1.5.1 — The NAMED FRAME FLAG (L-1420, PARTIAL — one consumer, not the seam)

*(2026-08-19. The second of the two options above, shipped for **one** consumer. ⛔ §1.5 remains
**OPEN**; this narrows the blast radius, it does not close the violation.)*

**MUST — a node that re-expresses its subtree out of the authoring frame DECLARES it.** The
declaration is `userData.pryzmSceneFrame`: absent or `'authoring'` means the site-local metric BIM
frame §1.1 mandates; any other value names the georeferenced frame the subtree is in.
`CesiumThreeBridge`'s `GIS_BIM_ROOT` stamps `'geo-ecef'` at construction.

**MUST — a world-space consumer that cannot tolerate a georeferenced frame DERIVES the boundary, and
DERIVES it two ways.** The authority is
`packages/file-format/src/export/glb/GLBExporter.ts` — `isGeoreferencedFrame` / `resolveExportFrame`:

- **ARM A — DECLARED.** The flag above.
- **ARM B — MEASURED.** A node whose **world** translation is **≥ `AUTHORING_FRAME_MAX_TRANSLATION_M`
  (100 km)** IS a georeferencing frame by construction. §1.1 caps the authoring frame at **1 km**;
  ECEF starts at **6.37e6 m**; **nothing real lands in the gap**, which is what makes arm B a
  classification and not a guess.

⭐ **ARM B IS NORMATIVE, NOT BELT-AND-BRACES.** Arm A alone requires every current *and future*
producer to remember to declare — and an invariant that must be REMEMBERED rather than DERIVED is
this repository's most-repeated defect shape. Arm B requires cooperation from nobody. **A consumer
that implements only arm A does not satisfy this clause.**

**MUST — resolve the SHALLOWEST georeferenced ancestor, never the nearest.** Georeference is inherited
downward through `matrixWorld`, so every intermediate group beneath the boundary satisfies arm B too;
dividing out the *nearest* match would additionally strip the element's own offset **inside** the
building. The shallowest one is the only node whose parent is still in the authoring frame.

**MUST — re-measure after resolution, and REFUSE rather than emit.** The GLB export re-measures its
tree and, if it still reaches ≥ 100 km, **dumps PER ROOT** (world bbox **and ancestry** — see the
probe clause below) and then **declines**, keeping the massing study. ⭐ Refusing is affordable here
precisely because a real, working fallback already exists; a gate whose refusing branch has no
escape hatch would be a regression with a contract citation attached.

**MUST — the per-root probe, never one aggregate number.** An aggregate `minY` cannot distinguish
*"one stray object is 2 553 km away"* from *"all 312 are"*, and those have different fixes; nor can it
name the ancestor that carries the transform. The probe reads **world** position and prints the
**ancestry**, for the reason L-604 already recorded: the previous probe read `obj.position` (LOCAL)
and was therefore **a probe that passed while measuring nothing** against a parent-borne matrix.

**Scope, stated honestly.** This is implemented for the **GLB export path only**. `SplitViewManager`'s
plan fit, and every other world-space consumer of the shared scene graph, still inherit the ECEF frame
and still rely on their own refusals. §9 item 3 remains the close.

**Also noted (separate, P3, not addressed):** `packages/renderer-three/src/geospatial/CesiumThreeBridge.ts`
is a **duplicate** of the live `plugins/geospatial` bridge and imports `three` directly. The live
importer is `GISAreaLayout.ts:402` via `@pryzm/plugin-geospatial`; the `renderer-three` copy has
no importer found. Two copies of a coordinate-frame boundary is a drift hazard.

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
[ISSUE-LOG L-365](../../04-reference/ISSUE-LOG.md).)*

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
- **MUST (the parcel void is a HOLE IN A PHOTOGRAPH — it MUST be masked, and MUST NOT invent ground).**
  §PLOT-CLEAR-PHOTOREAL cuts a parcel-shaped void through the tileset so the proposal is not buried. A
  vertical cut through captured 3-D mesh necessarily exposes a SECTION — roofs, façades and ground at many
  heights — and the mesh's BACK faces behind it (the founder's raw pink/orange, 2026-08-23). That is not a
  defect in the cut; it is the absence of anything covering it. The void MUST therefore be filled with an
  opaque NEUTRAL solid whose top sits at the building's own seat and whose sides and bottom close it
  (`applyPhotorealVoidCap`, §FIX-PHOTOREAL-VOID-CAP / L-10180). ⛔ It MUST NOT be textured, tinted or shaded
  to imitate ground: we deleted the evidence, and inventing a surface in its place is a worse answer than the
  hole. A viewer must be able to read it as *"this plot is cleared; the captured city stops here."*
  ⚠ The mask is seated on the SAME datum as the model and MUST ride the SAME re-seat — a plug created at clip
  time, before the tile-height clamp settles, otherwise hangs at ellipsoid 0 under a building that rose to
  real ground. It MUST be removed wherever the void is (no parcel, no tileset, opt-out, clip failure, Forma
  mode, project switch, dispose).
- **MUST NOT (claim a clipping remedy that has shipped).** The §L-452 note in `applyParcelClipToPhotorealTiles`
  described `Cesium3DTileset.clippingPolygons` as *"the first thing to try"* long after it was what the code
  ran. Retired 2026-08-23 with its measurement: the clip resolves against a signed-distance field sized
  `min(maximumTextureSize, max(128, ceil(4096 · quality)))` with `quality` defaulting to **1**, LINEAR-filtered,
  over the parcel's own extent — **already the API's ceiling**. ⭐ Therefore **the ragged void edge is NOT clip
  precision and no clipping parameter will smooth it**; a NAMED limit with a cap over it beats a smoothed-over
  one. Any future note in this area MUST state what was measured and when.
- **MUST ("my building is not visible" is DECIDED by a probe, never by inspection).** At least four distinct
  causes render identically: (1) the model anchored OUTSIDE the void, standing under un-clipped tiles — the
  only cause invisible in a screenshot; (2) held hidden for an unresolved ground datum (§1.4 / L-259); (3) no
  real model at all, because the GLB export refused over the triangle budget; (4) seated below the visible
  tile ground. Cutting the void MUST therefore emit the discriminator for ALL FOUR in one line
  (`logPhotorealVoidVsBuilding`, §PROBE-GLOBE-BUILDING-IN-VOID). A probe that omits a candidate silently rules
  it out, and choosing between them by reasoning is the §CONFIDENT-REGISTER-ROWS failure this repo has logged.
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

## §9 — The SiteFrame authority — ONE owner of origin + project-north θ + ground (STRUCTURAL-SEAM-2)

*(Added 2026-07-26. The normative form of the "named frame flag" §1.5 defers to. Grounds
`docs/04-reference/geospatial/SITE-FEASIBILITY-ARCHITECTURE-AND-SCALING.md` Part 3 §3.2. **Status: DRAFT — the
target architecture; the AS-IS below is a KNOWN VIOLATION recorded so this contract stops implying a
single frame the code does not have.**)*

**The defect this closes — measured by code reading, this session.** The scene⇄world mapping is
reconstructed independently at every geospatial consumer. The two modules designed to be the
authority are both bypassed: `LTPENURebase` (§1.1) is **never imported by anything that renders**
(`boundaryProjection.ts:8–30` explicitly declines it and ships its own equirectangular
approximation), and `apps/editor/src/ui/geospatial/sceneEnuFrame.ts` is a *partial* extraction whose
own header admits the mapping is "open-coded in ~15 sites … built by inspection, not by a machine
check." Concretely:

- **Origin has TWO competing authorities** — the frozen LTP-ENU origin (`getCurrentSiteOrigin()`) vs
  the geocoded address (`siteModelStore.getLocation()`), documented at `globeGroundAnchor.ts:37–48`,
  with `originSeparationMeters`/`georefOriginsDiverge` (:335–370) existing only to *measure the
  divergence*. `overlayOrigin()` picks between them at runtime.
- **θ (project→true north) is applied at ~13 sites across THREE idioms** — inline
  `trueVectorToProjectNorth` (`siteDispatch.ts:912–923` + six zoning-clip sites), shared
  `sceneXZToEnu` (`CesiumViewport.ts:3899/5273/7735`), `Matrix3.fromRotationZ(-θ)` baked into the
  glTF matrix (:9151), and a GLSL `u_pryzmProjNorth` uniform (:8373).
- **Ground is resolved in FOUR places** — `sampleTerrainMostDetailed` clamp (:5884→:5910), the
  separate photoreal-tiles clamp (:5177–5413), the pure `globeGroundAnchor` reducer (:172–292), and
  the shared `formaTerrainBaseHeight` field each consumer offsets on its own.
- **The ECEF bridge is DUPLICATED** (`plugins/geospatial/` vs `packages/renderer-three/`), neither
  θ-aware — §1.5 / L-604.

Each jurisdiction lights up a different consumer, so the ONE seam surfaces as a differently-shaped
bug per city: a θ-pivot *displacement* in Barcelona (Cerdà folds θ≈45° on 100 % of parcels, §C19
§1.12.3), a *terrain reseat* fault on a Copenhagen slope (L-584/L-585), a heatmap that applies **no
θ at all** (`CesiumViewport.ts:8896–8909`).

**Normative (the target):**

1. **There MUST be exactly one `SiteFrame`, constructed once in `composeRuntime` (P1)**, that owns
   the scene⇄world mapping: a single `origin` (the frozen LTP-ENU — the geocoded address is
   instrumentation only, never a second origin), a single `thetaRad` (the only θ source,
   `SiteLocation.trueNorth`), and a single `sampleGround(x,z)` (the only ground authority). It
   exposes `sceneToEnu` / `enuToScene` / `toCartesian` / `sampleGround`; it **delegates the proj4/UTM
   math to `LTPENURebase`** so the §1.1 class is finally on the render path.
2. **Every geospatial consumer MUST read the SiteFrame; none may re-derive origin, θ or ground.**
   `sceneEnuFrame.ts`'s `sceneXZToEnu` becomes the frame's single internal implementation; the ~13
   open-coded θ sites, the two origin authorities, and the four ground paths collapse into it.
3. **The `CesiumThreeBridge` MUST be de-duplicated to one copy that re-parents into an
   LTP-ENU-relative group** (never ECEF in the shared scene graph) — this closes §1.5 / L-604.
4. **A CI gate `check-scene-frame-single-owner` MUST hard-fail on any open-coded frame math outside
   the SiteFrame module** — `north = -z` / `-p.z`, `eastNorthUpToFixedFrame`, `fromRotationZ(theta)`.
   This replaces "believed complete by inspection" (the `sceneEnuFrame.ts` inventory's own caveat)
   with a machine check, because "one site migrated, one missed" is the exact failure the seam
   produces.
5. **⚠ The "θ = 0 everywhere, migrate consumers, then flip the producer" sequencing ADR-0115 relied
   on is SPENT.** `sceneEnuFrame.ts:33` still asserts θ is 0 in production, but C19 §1.12 *measured*
   θ ≈ ±45° on live Barcelona parcels and the producer is DONE (ADR-0115 item 8). The migration MUST
   therefore assume θ ≠ 0 and gate it (clause 4), not sequence around a zero that no longer holds —
   and MUST verify whether the still-unmigrated sites (the sun-hours heatmap, the caller-less
   `RealSunService.setProjectNorth`, the C34 §1.4 north arrow) are **already** mixing frames in
   production.
6. **θ is a SINGLE-PRODUCER value: written once, unconditionally (incl. 0), transactionally with the
   ring de-rotation, reset on clear, and read through ONE accessor.** The confirmed root of the
   Barcelona displacement (C19 §1.12; the round-trip is exact iff θ_write = θ_read) is four defects
   where the write and read drift apart: **g1** `siteDispatch.ts:913` guards the write behind
   `projectNorthRad !== 0` so a θ = 0 parcel never overwrites a prior ±45°; **g2** `:917` ignores
   `dispatchSiteTrueNorth`'s boolean return and de-rotates the ring even on a soft-reject (`:870-874`);
   **g3** `:813-842` clears the boundary but not `trueNorth`; and the render latch
   `CesiumViewport.readProjectNorthRad:2485-2526` reads `this.runtime` with no `window.runtime`
   fallback and returns 0 both when θ is 0 and when the read fails (§L-446). The SiteFrame's
   `setTheta` MUST persist unconditionally, de-rotate ONLY on a successful write, and `clear()` MUST
   reset θ; the single `theta` accessor sources `this.runtime ?? window.runtime`. **The 3-gap
   `siteDispatch` fix + the read-latch fix is the correct FIRST INCREMENT of this migration** (not a
   throwaway patch): it establishes the θ_write = θ_read invariant at the current sites, and when the
   SiteFrame lands the write becomes `siteFrame.setTheta(θ)` and the read `siteFrame.theta` — the same
   discipline relocated into one object. It is independently shippable and verified by §SITE-FRAME-PROBE.
7. **The `sampleGround` facet is the TERRAIN-IN-3D-SITE critical path (founder lead, 2026-07-26).**
   Terrain-in-3D-Site everywhere is the current lead deliverable, and it is the first sound consumer of
   the ground authority. It regressed (L-629, the L-626 revert of the `CesiumViewport.ts:5993`
   `photorealTilesActive` guard) because every ground-seated object is seated on ONE scalar
   `formaTerrainBaseHeight` (`:701`) sampled at the boundary CENTROID (`:3650`); drawing relief then
   z-fights context buildings (white shells) and occludes the flat heatmap (faint). **Therefore:
   `sampleGround(lat,lon)` MUST replace the single scalar, and EVERY distributed ground-seated consumer
   MUST read it BEFORE the `:5993` guard is relaxed** — near context (`:2137`), far-ring context, the
   sun-hours heatmap (drape / `CLAMP_TO_GROUND`), the parcel ring (`ParcelBoundarySceneRenderer.ts:169`),
   and the envelope/massing base (`:3884`, the L-584 rasant fix). The reseat is a HARD PREREQUISITE of
   terrain-on; shipping terrain-on first re-ships L-629 by construction. Sequenced as T0→T3 in the
   Part-3 build order.

8. **⭐⭐ THE FRAME MAPPING MUST BE ORIENTATION-PRESERVING, AND SOME GATE MUST HAVE A TERM FOR IT
   (L-10740, 2026-08-24).** Every clause above is about *rotation and translation*. **None of them
   has a term for a REFLECTION**, and a reflection is what the founder actually photographed:
   *"the parcel shade in PRYZM view … often the shade is not correct — it sort of MIRRORS to one
   side outwards."*
   - **MEASURED, so the θ half is settled and must not be re-litigated:** the θ chain
     (`deriveProjectNorthAngleFromParcel` → the `dispatchParcelBoundary` de-rotation →
     `sceneXZToEnu`) is a **proper rotation, determinant +1**, and round-trips an *asymmetric*
     parcel to 1e-9 m at every Barcelona bearing including the founder's θ = −44.87°. **A wrong
     SIGN on θ is a ROTATION, never a mirror** — negating θ preserves signed area exactly. θ ∈
     (−45°, +45°] **by the fold**, so a negative θ is ordinary, not a regression:
     `apps/editor/__tests__/parcelShadeIsNotMirrored.test.ts`.
   - **⚠ The fold IS bistable at ±45°, which is where the Cerdà grid sits.** A 0.3° change in the
     dominant edge flips θ by 90°. That is why one Barcelona session logs `−44.87°` and another
     `+43.40°`. It is self-cancelling end-to-end (the round-trip holds at 45.13°), so it is **not**
     the displacement bug — but it MUST be stated, because it is the single most available wrong
     explanation for one.
   - **The actual reflection was in a RASTERISER, not the frame:**
     `ParcelBoundarySceneRenderer.buildFill` rotated a shape built in `(x, −z)` by `rotateX(+π/2)`
     while `buildEnvelopeVolume`, 100 lines below it in the same file with identical shape
     construction, used `rotateX(−π/2)`. `Matrix4.makeRotationX(+π/2)` sends `(u, v, 0) → (u, 0,
     +v)`, so the parcel FILL landed at scene `z = −p.z`: mirrored about the scene X axis relative
     to the outline it exists to fill and to the envelope shade beside it. Because the frame origin
     is the parcel's FIRST VERTEX (`parcelFrameOrigin`), that mirror line runs through a **corner**
     of the plot, so the reflected copy lands wholly on the far side of it — the founder's "to one
     side outwards", exactly.
   - **MUST:** any scene⇄world or shape⇄scene mapping introduced under this section MUST be
     orientation-preserving end-to-end, and MUST be pinned by a test using a **CHIRAL** fixture.
     ⛔ **MUST NOT** use a rectangle or any axis-symmetric plot to demonstrate frame correctness: an
     axis-aligned rectangle **is its own mirror**, so every such test passes vacuously. This is why
     the defect survived — `side: THREE.DoubleSide` hides the flipped normals, and no symmetric
     fixture can falsify a reflection.
   - **MUST:** the `check-scene-frame-single-owner` gate of clause 4 MUST include a
     **chirality/signed-area** term. `|area|` is rotation-invariant AND reflection-invariant, so
     every existing check that reports an absolute area — `polygonCentroidAndAreaXZ` included — is
     reflection-blind by construction.
   - **SHIPPED as the interim:** `detectRingFrameDisagreement` (`sceneEnuFrame.ts`, pure + tested)
     and the `SHADE VERDICT:` arm on `§SITE-FRAME-PROBE`. It compares the parcel boundary against
     the buildable-envelope ring — two INDEPENDENT pipelines that must land in one frame — on three
     terms: `displaced` (an inset's centroid MUST lie inside its parcel — a geometric impossibility,
     the strongest term), `oversized`, and `reflected` (opposite winding — **deliberately reported
     separately as the WEAKEST term**, since a producer emitting the other winding convention trips
     it too). It also closes the hole the 2026-08-05 stale-async-zoning investigation named in its
     own §5 (*"the probe only checks the BOUNDARY, not the buildable envelope ring"*), so one arm
     covers two separately-reported defects.
   - **⛔ THE LESSON, which is the part that generalises:** `§SITE-FRAME-PROBE` printed
     `FRAME VERDICT: CONSISTENT` on the founder's own defective session and **was not lying**. Its
     only term is `deriveProjectNorthAngleFromParcel(ring) ≈ 0`, which folds **mod 90°** and reads
     only the dominant EDGE DIRECTION — so a mirrored ring is still "square", a 90°-rotated ring is
     still "square", and a consistently-applied wrong-signed θ re-derives to 0. **A success
     criterion with no term for the thing that is wrong reports success forever.** When a probe and
     a founder disagree, the probe's TERMS are the thing to audit first, before its readings.

**What one SiteFrame dissolves at once:** the Barcelona parcel/envelope θ-pivot displacement (one θ,
one pivot), terrain-in-Site z-fighting + the L-584/L-585 reseat (one `sampleGround`), the
heatmap-on-terrain occlusion (the overlay reads θ+ground from the frame), and the L-604 ECEF
corruption — one substrate, four "different" city bugs retired together.

**Sequencing (with the seams in the Part-3 plan):** SiteFrame is the **substrate and comes first** —
the envelope solid (C58 §1.14) draws *through* it, so if the massing is rewritten while the frame is
still sprayed, the new tiers/study-slabs re-inherit the spray. Within §9: stand up SiteFrame + the
CI gate → migrate consumers + de-dup the bridge → terrain-on-frame → heatmap-on-frame.

**Verification (localhost unusable):** unit-pin the ADR-0115 end-to-end property (a parcel squared
into the authoring frame maps back to its ORIGINAL true-world bearing — the test that catches a θ
applied in the wrong direction, which survives a naive round-trip) + the `check-scene-frame-single-
owner` gate; then deploy → founder browser-test a **Barcelona xamfrà corner** (the θ-fold-to-0 case,
C19 §1.12.2) and a **Copenhagen** sloped parcel (terrain reseat).

**Reference (read-only):** `packages/geospatial/src/LTPENURebase.ts`,
`apps/editor/src/ui/geospatial/sceneEnuFrame.ts`, `apps/editor/src/ui/geospatial/globeGroundAnchor.ts`,
`apps/editor/src/ui/site/{boundaryProjection,siteDispatch}.ts`,
`plugins/geospatial/src/CesiumThreeBridge.ts` (+ the `renderer-three` duplicate).

**Progress against item 3 (2026-08-19, L-1420) — and what it is NOT.**

Item 3 (*"the `CesiumThreeBridge` MUST be de-duplicated to one copy that re-parents into an
LTP-ENU-relative group"*) is **NOT DONE**. What landed instead is the **named frame flag** §1.5
offered as the alternative, implemented for **exactly one consumer** — see **§1.5.1**. Concretely:

- ✅ `GIS_BIM_ROOT` now **declares** the frame it imposes (`userData.pryzmSceneFrame = 'geo-ecef'`),
  so consumers can DERIVE the boundary instead of matching the string `"GIS_BIM_ROOT"`.
- ✅ The **GLB export** divides that frame out, so the model Cesium loads is site-local metres. This
  fixed a **P1 production defect**: the founder's building rendered as a continent-sized slab in the
  sky because the exporter baked ECEF (L-1420).
- ⛔ **The bridge still puts ECEF in the shared BIM scene graph.** §1.5 stays **OPEN**, at **P1**.
- ⛔ **The bridge is still DUPLICATED** (`plugins/geospatial/` vs `packages/renderer-three/`). Only the
  live `plugins/` copy carries the declaration, so the copies have now **drifted further apart**, not
  less — the P3 hazard this section names is measurably worse, and de-duplication is the fix, not
  copying the stamp into the dead twin.
- ⛔ **No `SiteFrame` exists**, no `check-scene-frame-single-owner` gate exists, the ~13 open-coded θ
  sites, two origin authorities and four ground paths are **untouched**.
- ⛔ **L-1423 (OPEN, P2)** — `GISAreaLayout.ts:556–560` anchors **every project in every city to the
  Sydney Opera House** on first GIS init, unconditionally, before any geocode. That is the transform
  whose ECEF **Y** produced the founder's `minY`. The correct close is item 3, **not** a different
  hard-coded default.

⭐ **A stated NOT-YET beats a claimed DONE.** One consumer was made frame-aware under a founder-live
production defect; the seam is exactly as open as it was.

**Known Violations (open):**
- **L-631 (P1, founder-priority) — terrain relief is OFF in 3D Site (Forma) for every city.**
  `CesiumViewport.maybeAttachTerrainProvider` early-returns at `CesiumViewport.ts:5993`
  (`if (this.photorealTilesActive) { … return; }`), so baked R2 terrain is skipped in Forma → flat
  base-0 ground everywhere. This is the **deliberate revert** of the L-626 fix (commit `89196071`),
  made because enabling terrain-in-Forma before the reseat re-introduces the z-fight against base-0
  context buildings (L-584/L-585) that this §9 sequencing exists to prevent. Per the §9 sequencing
  ("… terrain-on-frame → heatmap-on-frame"), **terrain-on-frame is only sound AFTER SiteFrame's
  `sampleGround` reseats context + envelope base + heatmap** — do NOT clear the :5993 gate on its own.
  ⚠ The founder wants terrain ON everywhere NOW, which CONFLICTS with this sequencing; the
  accept-a-known-regression-vs-do-it-in-order decision is escalated to the founder (see L-631 in
  `docs/04-reference/ISSUE-LOG.md`). Do NOT flip this §9 to ACTIVE on the back of a
  gate-only change.

---

## §10 — Baked terrain: quantized-mesh tile-header encoding invariants (L-639, ADR-0278)

**Governs**: `tools/context-bake/terrain.mjs` (`encodeQuantizedMesh`, `horizonOcclusionPoint`) — the
per-city Cesium quantized-mesh bake. **Rationale**: a per-city tile pyramid synthesises coarse ancestor
tiles (above all **z0, a full hemisphere** `lat[-90,90]`) that are almost entirely flat filler. Two
header fields, if computed naively, make Cesium **horizon-cull the root tile** — refinement never
starts, **zero tiles render, and the whole city shows white terrain** (the long "interior cities are
white, coastal are fine" bug; the split was really west-root `(0,0)` vs east-root `(1,0)`, not
elevation). Both invariants are **MUST**, CI-guardable by decoding the emitted root tile.

### §10.1 — Bounding centre = tile RECTANGLE centre, never the vertex centroid

**MUST**: the tile bounding centre written to the header (and used as the horizon-occlusion cone axis)
MUST be the ECEF of the tile rectangle's mid-longitude / mid-latitude at mean height:
`ecefFromLonLatH((west+east)/2, (north+south)/2, (minH+maxH)/2)`.

**MUST NOT**: use the vertex centroid. A flat coarse tile meshes (MARTINI) to its **corner vertices**,
which for a pole-spanning tile sit at **lat ±90** — their average is the **geocentre (0,0,0)**, a
garbage centre that both corrupts the header and gives the occlusion cone no valid direction.

### §10.2 — Horizon occlusion point MUST NOT be the zero vector; never-cull wide-angle tiles

**MUST**: `horizonOcclusionPoint` MUST return an occludee of magnitude ≈ 1 (fine tiles, the exact cone
result) or a **high never-cull magnitude** (`HORIZON_OCC_NEVER_CULL = 1e4`) for **wide-angle /
degenerate** tiles — defined as: centre direction undefined, OR any vertex past the horizon-grazing
cone (`denom ≤ 0`, i.e. >90° from centre), OR `resultMag ≤ 0`. A single occludee point cannot correctly
horizon-cull a >hemisphere tile (Cesium's own `computeHorizonCullingPoint` returns `undefined` there);
a magnitude-`1e4` occludee sits above every near-tile camera's horizon so the tile is never wrongly
culled. This is safe: a per-city bake has no far-side geometry to over-render.

**MUST NOT**: emit `(0,0,0)`. Cesium treats a geocentre occludee as *always below the horizon* → the
tile is *always* culled.

> ⚠⚠ **§10.2a — THE `§CULL-PROBE` THAT VERIFIES THIS CLAUSE PRINTED THREE FALSE EXPECTATIONS
> (L-10741, corrected 2026-08-24).** The founder pasted
> `§CULL-PROBE root(1,0) vis=0(0=NONE/2=FULL) … bvCtrMag=3189094(want~6.38e6) occPtMag=10000.0000(want~1.0)`
> as evidence of a defect. **All three numbers are CORRECT and the probe was the only thing claiming
> otherwise — it read a healthy tile as an alarm.** Measured against the Cesium bundle and
> `tools/context-bake/terrain.mjs`, not re-transcribed:
> - **`vis=0` means `PARTIAL` — VISIBLE.** The legend `0=NONE / 2=FULL` was **fabricated**; Cesium's
>   `Visibility` is **`NONE = −1, PARTIAL = 0, FULL = 1`**. A culled tile prints **−1**, and **2 is
>   not a value `computeTileVisibility` can return**. `PARTIAL` is moreover the *only* correct answer
>   for a hemisphere-sized OBB with the camera inside a city. ⚠ **ADR-0278's own narrative mis-read
>   this same enum**; its real evidence was `occPtMag=0.0000` plus an independent R2 byte decode,
>   both of which stand without it.
> - **`bvCtrMag ≈ 3.19e6` is arithmetically FORCED for a level-0 root**, not a fault. The field is an
>   `OrientedBoundingBox` centre Cesium derives **from the tile rectangle**; a level-0 tile spans a
>   hemisphere, so its centre sits at `R_eq/2 + h/2 = 3 189 094` — matching the founder's reading to
>   the digit. `want~6.38e6` is impossible at that level.
>   ⛔ **AND THIS FIELD CANNOT SEE THE DEFECT THE PROBE EXISTS FOR.** The §10.1 / ADR-0278 D1 bug is
>   the **quantized-mesh HEADER** bounding-sphere centre — a *different* field
>   (`root.data.terrainData._boundingSphere.center`). The Cesium-derived OBB is immune to a garbage
>   header centre, so the probe was testing an object that could not fail.
> - **`occPtMag = 10000` is THIS CLAUSE'S OWN `HORIZON_OCC_NEVER_CULL` sentinel reading back as
>   healthy.** `want~1.0` predates ADR-0278 D2 by one day and was never revised; `≈1` is correct only
>   for **narrow** tiles, never for a wide-angle/z0 root.
>
> ⛔⛔ **AND THE FALSE LEGEND WAS RATIFIED AS AN ACCEPTANCE CRITERION.** `ISSUE-LOG.md` L-639 records
> its verification as *"`§CULL-PROBE vis 0→2(FULL)`"*, and **ADR-0278 repeats it**. **`2` is not in
> `computeTileVisibility`'s codomain** — it can return only `−1 / 0 / 1` — so that pass criterion was
> never observable and was back-derived from the probe's own wrong legend, not measured. ⭐ **The
> consequence is the whole reason this cost a lane: `vis=0` is the HEALTHY POST-FIX reading, and it is
> the reading the fix actually produces — so a correct log was ratified to look like a failure.** The
> two byte-level measurements in that same L-639 entry (`centerMag 0→6378188`, `occMag 0→10000`) are
> real and stand.
>
> ⚠ **OPEN GAP (not closed here):** ADR-0278 and `CITY-REPLICATION-STANDARD.md` both make "decode the
> emitted root tile off R2 and assert `centerMag ≈ 6.38e6`, `occMag > 1`" a SHOULD before shipping a
> city. **No script implements it** — `grep -rn "centerMag\|occMag" tools/` returns nothing, and
> `tools/phase3-probes/probe-v8-terrain-posting.mjs` decodes the header's centre scalars and heights
> but **skips both the occlusion point (bytes 64–87) and the bounding-sphere centre vector**. So the
> one invariant pair §10.1/§10.2 declare MUST is verified by no automated check on either side.
>
> **MUST**: a diagnostic that prints an expected value MUST have that expectation **derived or cited**
> — from the enum, from the encoder constant, or from a closed form — never from the hypothesis of the
> day. ⛔ A probe printing a false `want~` is its own defect, and a *pessimistic* false `want~` is the
> worse kind: it manufactures bug reports and burns a lane per paste. The probe now decodes the enum,
> derives the centre expectation from the tile LEVEL, and names the header field it does **not** read.

### §10.3 — Tileset URL MUST be version-stamped; bump on every bake-output change

**MUST**: `terrainTilesetUrl` appends `?v=TERRAIN_TILESET_VERSION`
(`apps/editor/src/ui/geospatial/terrainCoverage.ts`). Terrain tiles are path-stable and cached (R2
1-day + proxy 1-hour must-revalidate); Cesium's `Resource` propagates the query to `layer.json` + every
`.terrain`. **Bump the version whenever the bake output changes** or a correct re-bake is invisible to
clients (an entire debugging session was lost to browsers serving pre-fix tiles under an unchanged URL).

### §10.4 — Verify the emitted tile, not the render loop

**SHOULD**: after a bake, decode the root tile off R2 and assert `centerMag ≈ 6.38e6` and `occMag > 1`
(never `0`) **before** shipping. The standing client forensic is `[CTX-TERRAIN-GAP] … §CULL-PROBE`
(`CesiumViewport.ts`), which logs Cesium's own `computeTileVisibility` verdict for the active root tile.
Terrain-render bugs are pinned by the runtime's own decision + the tile bytes, not by theorising from
`globe.getHeight` (which returns ≈ −Earth-radius purely as a symptom of zero rendered tiles).

---

## §11 — The massing's EXTENT: which ring, which height (§FORMA-MASSING-EXTENT)

The Forma 3D-Site / 3D-Globe massing asserts a **built volume on a real parcel**, in a view used for
feasibility. Both of its extents — the ring it is extruded over and the height it is extruded to —
are therefore claims about the design, and neither may be filled in from a quantity that does not
measure it. Ratified from L-1204 / L-1205 (founder 2026-08-19); supersedes nothing, and refines
`§FORMA-FULL-HEIGHT` (ADR-0268 §D4, §7 above).

### §11.1 — The building's own geometry outranks the parcel, always

- **MUST (ring precedence).** A storey band's extrusion outline is resolved most-reliable-first:
  **(1)** the band's exterior **wall loop** (`reconstructPerimeterRing`); **(2)** else the storey's
  **floor-slab** outer ring; **(3)** else — and only then — the **drawn parcel boundary**; **(4)**
  else per-wall boxes. The parcel ring is reachable **only** when the building has no ring of its own.
- **MUST NOT.** Branch on the presence of `input.boundary` before attempting the building's own ring.
  ⚠ This is not hypothetical guidance: `renderFormaMassing` did exactly that until 2026-08-19, and
  because the onboarding flow is *location → DRAW THE SITE BOUNDARY → generate*, the parcel is
  present in the **normal** case — so the wall-loop branch was unreachable and **every storey of
  every building was extruded over the plot line**. The topmost band's `closeTop` then painted an
  opaque parcel-sized plate at building height, which the founder reported as a broken roof (L-1204).
  `renderFacadeAnalysis` had already been corrected for the identical inversion (L-272,
  §FORMA-FACADE-FOOTPRINT-FIX) and the massing renderer twenty lines away kept it.
- **MUST (say when it is the plot).** When arm (3) is taken, the surface drawn is the **SITE, not the
  design**. It MUST be reported as a placeholder (console + any user-facing caption), never presented
  as the building's silhouette.
- **SHOULD (one decision, not two).** The precedence is a single pure function
  (`decideMassingRing`) consumed by every surface that needs a building footprint, so the massing and
  the façade study cannot drift apart about where the building is again.

### §11.2 — A height must come from a signal that measures height

- **MUST (authored signals only).** `resolveFullBuildingHeight` takes the MAX over the **caller
  override**, the **tallest authored storey-band top**, every **slab `topElevation`**, and every
  **roof `baseElevation + thickness`**. Each is a stated vertical fact about the design.
- **MUST NOT (⛔ the bounding sphere).** The placed GLB's **bounding-sphere diameter** MUST NOT be
  used as a height, at any clamp. A sphere radius is `√(planHalfDiagonal² + halfHeight²)`, so on any
  building wider than it is tall the plan extent dominates and `2r` reports the **diagonal**. On the
  founder's project — 7 authored levels topping out at **20.9 m** — this leg returned **42.4 m**, and
  `tileBandsToFullHeight` synthesised **7 extra storeys**: the globe drew **14 storeys and a 42.4 m
  tower** for a 20.9 m building, and the floor selector offered the user all 14 (L-1205). The prior
  code's own comment acknowledged the contamination and used the number anyway behind a `4 × bandTop`
  clamp, which bounded only *how wrong it could be*.
- **Rationale (the general rule).** Cesium's `Model` exposes a bounding **sphere** and no local-frame
  bounding box, so a placed model's vertical extent is genuinely **UNKNOWN** at that seam. Per the
  standing doctrine on real land, an unknown constraint MUST NOT be drawn as a known one — the
  correct response is to omit the source, not to approximate it. **If the authored geometry says
  20.9 m, draw 20.9 m.**

### §11.3 — Synthetic storeys must declare themselves

- **MUST.** `tileBandsToFullHeight` bands carry no `levelId` and correspond to **no authored storey**.
  When any are added, the log MUST state that they are **synthetic**, give the **authored** top
  height, give the resolved height, **name the signal that produced it**, and print the
  `N authored + M synthetic` split. A line reading only *"tiled 8 … up to 42.4 m"* is what let a
  doubled building pass unnoticed through a session's worth of console output.
- **MUST (attributable heights).** `resolveFullBuildingHeight` returns the winning **source**, not a
  bare number. Three rival explanations for "42.4" were live simultaneously during the L-1205
  investigation; a number with no provenance is re-theorised rather than read.
- **SHOULD.** The tiling itself remains legitimate for ADR-0268 §D4's motivating case — a perf-capped
  tower whose walls collapse to a single ground band **with a named height source**.

### §11.4 — GLB export for the Cesium views

- **MUST (name what the exporter cannot represent).** Before `GLTFExporter.parse`, the export tree is
  swept for materials that are neither `MeshStandardMaterial` nor `MeshBasicMaterial` — three's own
  predicate — and each is logged with its **material class, material name, object class, and owning
  element type + id**. `GLTFExporter` emits an anonymous warning per material; N anonymous warnings
  on a 313-element building are a rumour, not a finding, and one such rumour ("the five are the
  glazing") survived long enough to be treated as a diagnosis. ⚠ It is **false**:
  `MeshPhysicalMaterial extends MeshStandardMaterial` and can never trip that warning (L-1206).
- **MUST (one override pair per export tree).** The `§FORMA-WHITE-MATERIAL` override (ADR-0093)
  allocates **one** white and **one** glass material per export **tree**, not per element. Cesium
  batches by material, so duplicates are draw-call buckets, not free (L-1207).
- **MUST (test the bytes).** GLB behaviour is asserted by running the **real** `exportFragmentsToGLB`
  and decoding the emitted glTF, never by testing a pure classifier and declaring the exporter out of
  scope. The real path runs under Node — `FileReader` is the only missing global. A suite that stubs
  the exporter proves nothing about the file Cesium loads (L-1208).
- **~~KNOWN ASYMMETRY (open, founder decision)~~ → DECIDED 2026-08-19 (L-1422).** The asymmetry was:
  3D **Site** Real exported `{ formaWhite: true }` (windows → translucent glass) while 3D **Globe**
  Real exported with **no option**, so windows kept the raw BIM material — *"which may be an opaque
  solid colour"*. The founder, looking at the **globe**, reported the building as *"not rendering
  realistically"*. **Decision: glazing MUST read as glass on the globe too.**
  - **MUST — glazing is glass on BOTH Cesium REAL paths.** The globe path passes
    `{ glazingOverride: true }`.
  - **⛔ MUST NOT — the globe MUST NOT pass `formaWhite: true`.** That option also repaints every wall,
    slab and roof near-white, i.e. hands the photoreal globe the Forma **STUDY** look. On real tiles
    that is **strictly less realistic** — the exact opposite of the request. `glazingOverride` applies
    the **glass half only**; opaque elements keep their **real BIM materials**. The 3D **Site** study
    keeps full `formaWhite` and is unchanged.
  - The one-pair-per-TREE rule above applies unchanged to `glazingOverride` (one glass material, zero
    white ones), and is asserted on the decoded glTF `materials[]`.
- **MUST (annotation overlays are not architecture).** Line/point/sprite renderables — edge outlines,
  leaders, annotation strokes — are stripped from **both** Cesium REAL exports, and kept in the plain
  GLB download (an interchange export must not be silently reduced). ⭐ The predicate is **derived from
  the object's THREE class** (`isLine`/`isLineSegments`/`isPoints`/`isSprite`), **never a name list**:
  the pre-existing `NON_BUILDING_EXPORT_ELEMENT_TYPES` set is matched against ROOT elements only, and
  every real offender (`SlabEdges`, `WallEdges`, `floor-edge-overlay`) lives **inside** an element
  subtree — so no number of added names could ever have reached them. **That set was not incomplete,
  it was structurally blind** (L-1421).
- **MUST (the export tree is in the AUTHORING frame).** The emitted GLB MUST be site-local metres.
  See **§1.5.1** for the derived frame boundary, the shallowest-ancestor rule, the per-root probe and
  the refusal. The defect this closes is the founder's continent-sized building in the sky (L-1420).

- **Reference (read-only):** `apps/editor/src/ui/geospatial/formaMassingExtent.ts` ·
  `apps/editor/src/ui/geospatial/CesiumViewport.ts` (`renderFormaMassing`,
  `resolveFullBuildingHeight`, `tileBandsToFullHeight`) ·
  `packages/file-format/src/export/glb/GLBExporter.ts` ·
  `apps/editor/src/ui/layout/GISAreaLayout.ts` (the two Real-export call sites).

---

## §12 — Forma ground-context layers: geometry kind, seat, and depth (§FIX-FORMA-WATERWAY-GROUND-RIBBON, L-10160)

> Added 2026-08-23 after the founder: *"can you review the water rivers in the 3D Site view? They are in the forefront overlapping buildings … which they should not."* This is the FOURTH report of one defect shape in this view — §FORMA-CTX-ROAD-RIBBON (ADR-0095, 2026-07-01) records it verbatim for roads: *"the white lines draped straight THROUGH the buildings"* — and it recurred because the fix was applied per LAYER and never written down as a rule the next layer had to satisfy. §12 is that rule.

The 3D-Site (Forma) view draws OSM context as flat features on a synthetic ground: landuse, parks, roads, rail, water areas, waterway centre-lines, the sea. They share one datum and one depth budget, so they are governed together.

### §12.1 — A ground-context feature MUST be ground GEOMETRY, never a floating line

A linear context feature (road, rail track, river, canal) MUST be rendered as a **`corridor` of metric width** (or a `polygon` for an areal one). It MUST NOT be rendered as a `polyline` seated at a fixed height.

**Rationale, measured twice.** A polyline has no ground footprint: it is a screen-space ribbon hung at one altitude, so the surrounding context buildings — which extrude upward from that same altitude — are pierced by it at every crossing. That is precisely what ADR-0095 root-caused for roads. A corridor is a ground polygon with no `extrudedHeight`; it **cannot** rise into a building, at any camera altitude, by construction rather than by tuning.

### §12.2 — A ground-context feature MUST NOT ask the renderer to skip the depth test

`depthFailMaterial`, `disableDepthTestDistance` and per-feature render-order forcing are **FORBIDDEN** on this layer set. `depthFailMaterial` in particular draws the feature *precisely where it is occluded* — a river behind a tower is painted **over** the tower, at full opacity, **by configuration**. It is not a z-fight, a sorting accident or a terrain-precision artefact, and it is not fixable by nudging heights.

⛔ The inverse fix is equally forbidden: making the feature win the depth test (or drawing it last) hides the symptom by making the water deliberately overdraw the city. A context layer earns its place by being **occluded correctly**, not by being visible unconditionally.

### §12.3 — The seat is an ABSOLUTE scalar height, and every layer MUST be re-seatable

Forma runs with `globe.depthTestAgainstTerrain = false`, so a `clampToGround` / `CLAMP_TO_GROUND` ground primitive has no terrain stencil to classify into and renders **nothing** on baked terrain (§CTX-ABS-SEAT, L-635). Every ground-context feature therefore carries an **absolute scalar `height`**, seated on the settled city ground.

Because terrain settles **asynchronously and upward** (Madrid ~700 m, Burgos ~912 m), that scalar MUST be re-writable in place by `reseatContextGroundFeaturesForBase`. **A feature that carries its height inside its vertex positions is not re-seatable and is therefore non-conformant** — it will sit hundreds of metres below the settled ground on a high city.

⚠ The waterway centre-line was exactly that feature, and its exemption was recorded in the re-seat's own doc as harmless (*"thin, low-visibility"*). It was not harmless, because it was **compounded** by the §12.2 breach: wrong height AND painted through everything at that wrong height. Neither alone produces the founder's picture; together they produce it exactly. **When a layer is exempted from an invariant, the exemption's safety MUST be argued against the layer's OTHER settings, not against the invariant alone.**

### §12.4 — Stacking order is a single declared ladder

The per-layer offsets above the settled base are one ordered set, owned by `reseatContextGroundFeaturesForBase` and stated there: landuse `+0.005` < parks `+0.01` < roads / sea `+0.02` < water `+0.03`. A new layer MUST take a place in that ladder explicitly. Prose at a call site that contradicts the number is a defect in its own right — the water loader carried *"sit water just BELOW the road hair-line"* beside a seat that has always been **above** roads.

### §12.5 — A NOMINAL width MUST be labelled nominal, and MUST yield to a measured surface

A `waterway=*` or `highway=*` way is a centre-line; its ribbon width is a **class-typed nominal stand-in**, never a surveyed width, and it MUST be described as such wherever it is reported (the §GETCAPABILITIES-IS-NOT-AN-INVENTORY discipline: surveyed ≠ nominal ≠ normative).

Where the same feature is ALSO mapped as an area — OSM maps a large river both as `waterway=river` and as `natural=water` / `waterway=riverbank` — the **measured polygon wins and the centre-line MUST be dropped**, or a fabricated band is drawn on top of a real surface. The test MUST be a majority of the way's vertices inside the area, not "any vertex": a tributary meets a mapped river at its confluence and must still be drawn.

### §12.6 — Suppressed on the photoreal globe

These are FORMA-only flat features. When `photorealTilesActive`, the 3D tiles already carry the real roads, water, greenery, rail and trees, so every layer in this set MUST be cleared rather than drawn over them. (Pre-existing and unchanged by L-10160; recorded here so the set is governed as one.)

### §12.7 — A console warning is EVIDENCE, and MUST name its own subject

Cesium's one-time `"Entity corridor, ellipse, polygon or rectangle with heightReference must also have a defined height. heightReference will be ignored"` was read, reasonably, as proof that the water layer never clamped. **It was not the water layer.** MEASURED: the water polygons carry an explicit `height`, and the waterways were `polyline`s — a type the message does not even name. The sole emitter was the **site-metric heatmap rectangle**, where `heightReference` sat beside a deliberately-omitted `height` and was, per `GroundGeometryUpdater.getGeometryHeight` (cesium 1.143), **already being ignored** — the omitted height plus `classificationType: TERRAIN` is what made it a ground primitive. The redundant property is removed: no pixel changes, and a warning that misdirected one investigation stops misdirecting the next.

- **Reference (read-only):** `apps/editor/src/ui/geospatial/CesiumViewport.ts` (`loadContextWater`, `loadContextRoads`, `loadContextRail`, `loadContextSea`, `reseatContextGroundFeaturesForBase`, `paintMetricTexture`) · `apps/editor/src/ui/geospatial/contextWater.ts` (`waterwayKind`, `waterwayDuplicatesArea`) · `apps/editor/__tests__/formaWaterwayGroundRibbon.test.ts`.

---

## §6 — Contract History

| Date | Change |
|---|---|
| 2026-05-03 | Initial contract created — Wave A17 geospatial track (A17-T1). |
| 2026-07-12 | §1.4 The ONE Datum Boundary added (ratified from §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF / L-259). |
| 2026-07-17 | §7 Georeferenced building placement on the photoreal 3D-Tiles globe added (Known-good ACTIVE; ADR-0268; baseline `snapshot-cesium-3d-globe-working-2026-07-17`; evidence L-365). |
| 2026-07-17 | §8 Context-building fetch strategy added — ONE far-extent Overpass query, near+far split client-side (§PERF-CTX-SINGLE-FETCH; L-368; closes the previously-ungoverned context-fetch-latency gap). |
| 2026-07-17 | §7 "frame once, no jump" MUST refined — added the `§GLOBE-STALE-FRAME-REFRAME` (L-370) exception: a >20 m base-height jump between the early frame and the resolved datum re-frames ONCE even after user camera movement (the frame is stale), so no manual zoom is needed to find the lifted building. |
| 2026-07-26 | **§9 The SiteFrame authority added (STRUCTURAL-SEAM-2).** The normative "named frame flag" §1.5 defers to: ONE owner of origin + project-north θ + ground, read by every consumer, with a `check-scene-frame-single-owner` CI gate replacing the by-inspection `sceneEnuFrame.ts` inventory, the ECEF bridge de-duplicated under it (closes §1.5 / L-604), and the record that the "θ=0 then flip" sequencing is spent (C19 §1.12 measured θ≈45° live). Grounds `SITE-FEASIBILITY-ARCHITECTURE-AND-SCALING.md` Part 3. |
| 2026-07-26 | §9 **Known Violation L-631 recorded** — terrain relief is OFF in 3D Site (Forma) everywhere (`CesiumViewport.ts:5993` skip-gate; L-626 fix reverted `89196071`) because terrain-on-frame is not sound until SiteFrame's `sampleGround` reseats context + envelope base + heatmap. Founder wants it ON now → CONFLICT with the §9 sequencing, escalated for a founder decision. Do not flip §9 to ACTIVE on a gate-only change. |
| 2026-07-29 | **§10 Baked-terrain quantized-mesh encoding invariants added (L-639, ADR-0278).** Interior/west-hemisphere cities rendered white because the coarse z0 root tile was horizon-culled: the vertex-centroid bounding centre of a pole-spanning tile collapses to the geocentre → a zero horizon-occlusion point → Cesium always culls the root → 0 tiles render. Fix (MUST): rectangle-centre bounding centre (§10.1) + never-cull occludee for wide-angle tiles (§10.2) + version-stamped tileset URL (§10.3) + decode-the-tile verification (§10.4). Proven by `computeTileVisibility` + decoded R2 bytes (`occMag 0→10000`); Burgos/Madrid render full relief. |
| 2026-08-19 | **§11 The massing EXTENT contract added (L-1204/L-1205/L-1206/L-1207/L-1208).** Ring precedence: the building wall-loop/slab ring outranks the drawn PARCEL ring (the massing was extruded over the plot line, and its top cap was the pale sheet the founder reported as a broken roof). Height: the placed GLB bounding-SPHERE diameter is banned as a height source (it reported a 20.9 m building as 42.4 m and synthesised 7 phantom storeys); synthetic bands must declare themselves and name their height source. GLB: unsupported materials must be named, one white/glass pair per export tree, and export behaviour asserted through the REAL exporter. |
| 2026-08-19 | **§1.5.1 the NAMED FRAME FLAG added; §1.5 two "NOT verified" items resolved; §9 progress + §11.4 asymmetry DECIDED (L-1420/L-1421/L-1422/L-1423).** The founder's 3D-Globe Real building rendered as a continent-sized slab in the sky: `minY 2553068.999` is the WGS-84 ECEF **Y** of the **Sydney Opera House** (2 553 076.920) minus **7.921 m**, which is `east_y x_local` for a **9.04 m** house footprint — a derivation, not a magnitude. `GISAreaLayout:556-560` calls `setAnchor()` **unconditionally at GIS init** with that hard-coded default (a call site §1.5 did not know about, and itself L-1423), and the exporter baked `matrixWorld`. §1.5.1 makes the frame boundary **DERIVED** (arm A declared `userData.pryzmSceneFrame`, arm B measured >=100 km, shallowest ancestor, per-root probe, refuse-not-emit). §11.4: glazing reads as glass on the globe via `glazingOverride` — explicitly **NOT** `formaWhite: true`, which would be less realistic; and annotation overlays are stripped by THREE class, never by a name list. **§1.5 and §9 stay OPEN.** |
| 2026-08-23 | **§12 Forma ground-context layer rules added (L-10160).** The founder's "water rivers … in the forefront overlapping buildings" is §FORMA-CTX-ROAD-RIBBON's BUG 3 one layer over: the waterway centre-lines were the last floating `polyline` layer AND the only one carrying `depthFailMaterial` (which draws a feature *precisely where it is occluded*) AND the one feature `reseatContextGroundFeaturesForBase` deliberately skipped, so on a risen city they sat far below the ground and were painted through it. Waterways are now `corridor` ground ribbons of class-typed NOMINAL width, re-seated with every other layer, dropped where OSM maps the river's real surface. §12.7 records that the `heightReference` console warning belonged to the site-metric heatmap, not the water — and was already being ignored by Cesium. |
| 2026-08-23 | **§7 photoreal-void MASK + probe rules added (L-10180).** The founder's globe cut exposed the tile mesh's own section and back faces; the void is now filled with an opaque neutral plug seated on the building's datum and re-seated with it, and the plug must never invent ground. §L-452 RETIRED with its measurement: `clippingPolygons` (the fix that note called untried) is what ships, and its signed-distance resolution is already at the API ceiling — so the ragged edge is a NAMED limit, not a tunable. "Building not visible" has four look-alike causes and is now decided by a one-line probe rather than by inspection. |
| 2026-08-24 | **§9 clause 8 (the ORIENTATION/chirality clause) + §10.2a (the cull-probe's false expectations) added (L-10740/L-10741).** The founder's *"the parcel shade in PRYZM view … sort of MIRRORS to one side outwards"* was a REAL reflection — but **not in the θ frame**. MEASURED: the θ chain is a proper rotation (det +1) and round-trips an *asymmetric* parcel to 1e-9 m at θ = −44.87°; a wrong SIGN on θ is a rotation, never a mirror; θ ∈ (−45°, +45°] by the fold, so a negative θ is ordinary — though the fold **is bistable at ±45°**, which is exactly where the Cerdà grid sits and why one session logs −44.87° and another +43.40°. The reflection was in `ParcelBoundarySceneRenderer.buildFill`: `rotateX(+π/2)` on a shape built in `(x, −z)`, 100 lines from `buildEnvelopeVolume`'s correct `rotateX(−π/2)` with identical shape construction. It survived because `DoubleSide` hides the flipped normals and **an axis-aligned rectangle is its own mirror**, so every symmetric fixture passed vacuously. `§SITE-FRAME-PROBE` printed `CONSISTENT` throughout and was not lying — its one term folds **mod 90°**, so a mirror, a 90° flip and a consistently wrong-signed θ all re-derive to 0. New `SHADE VERDICT:` arm + pure `detectRingFrameDisagreement` (displaced / oversized / reflected), which also closes the envelope-ring hole the 2026-08-05 stale-async-zoning investigation named. §10.2a: all THREE `want~` values the `§CULL-PROBE` printed were wrong and wrong *pessimistically* — `vis=0` is `PARTIAL`/VISIBLE (Cesium is NONE=−1), `bvCtrMag≈3.19e6` is forced for a level-0 root, and `occPtMag=1e4` is §10.2's own sentinel reading back healthy. |
