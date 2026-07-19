# ADR-0115 — Underlay-defined Project North + the dual-north (project↔true) transform

- **Status:** Accepted (2026-07-02) — IMPLEMENTED first coherent vertical slice
  (dual-north transform primitive + underlay geolocation record + capture-to-model
  command path + always-on 3D-site entry). Plan-canvas gizmo bridge + globe θ
  application are documented follow-ups (see §Remaining).
- **Deciders:** Founder + Claude (Opus 4.8)
- **Tags:** `§FEAT-SITE-OVERLAY-PLACE`, `§FEAT-PROJECT-TRUE-NORTH`, `§FEAT-SITE-VIEW-ALWAYS-ON`,
  `§FIX-SITE-OVERLAY-RENDER-AND-FLOW` (L-58), `§FIX-SITE-OVERLAY-CALIBRATION-EXCLUSIVE` +
  `§FIX-SITE-OVERLAY-IMPORT-TERMINAL` (L-69/L-70), `§FEAT-SITE-OVERLAY-PLAN-UNDERLAY` (L-71),
  `§FIX-SITE-OVERLAY-DOUBLE-PANEL` (L-77), `§FIX-SITE-OVERLAY-ENTER-CANVAS` (L-78).
- **Audit rows:** L-38 (overlay + dual north), L-40 (3D site/globe always reachable),
  L-58 (the MapLibre overlay wasn't visibly rendering + the flow didn't complete),
  L-69 (2-pt calibration dead + import wrongly coupled to generate),
  L-70 (import path still armed draw + generate), L-71 (THE goal — plan on canvas, project north),
  L-77 (double panel), L-78 ("Finish" showed nothing — the underlay was created but never framed).
- **2026-07-04 fix (L-77 + L-78).** Made the L-71 "✓ Finish → canvas" actually visible + clean.
  **L-78 (critical):** the underlay mesh was being created fine, but Finish never switched the
  editor into a framed view — it closed the map + `toggleGIS(false)` and left the user in an
  unframed view with the plan off-screen ("nothing"), compounded by an async race (GIS exited
  before the texture loaded). Fix: `commitProjectNorth` now AWAITs the underlay creation, then a
  new `pryzmActivateBimView('Top')` exits GIS + switches to plan view and `viewController.zoomToFit()`
  frames the plan. (Confirmed the underlay's visibility does NOT depend on `CREATE_UNDERLAY` — that
  command is undo-only and is try/catch-guarded, so a bus error can't blank the plan.) **L-77:** the
  import step now dismisses the plot-choice card (single active panel) + hides the redundant map
  uploader, restoring the choice card on Back.
- **2026-07-03 slice (L-70 + L-71).** Delivered the founder's DEFINING goal: import a PDF/JPG,
  place + calibrate it on the map, press "✓ Finish", and land straight in the PRYZM canvas with
  the plan as a live underlay — geolocated, real-size, and AXIS-ALIGNED to project north so it
  shows orthogonally in plan view for tracing walls (NO house generation, NO boundary trace).
  **L-71** = §Remaining #1 (below), now DONE via the reused floor-plan underlay pipeline.
  **L-70** = the overlay onboarding branch is fully decoupled: a dedicated `startOverlayImport()`
  opens the 2D map in OVERLAY-ONLY mode (`pryzmStartSitePlanOverlayImport` → SiteBoundaryMap2D
  `overlayOnly`: draw tool disarmed, mode-strip/instruction hidden), never arms
  `pryzmStartBoundaryDraw`, never runs the draw watchdog, and treats "✓ Finish" as terminal
  (create the canvas underlay → dispose the wizard → close the map → exit GIS). The card is
  re-labelled (no "then trace the boundary"). Other branches untouched.
- **2026-07-03 update (L-58, `§FIX-SITE-OVERLAY-RENDER-AND-FLOW`).** Made the MapLibre site
  overlay actually work end-to-end on the 2D boundary map (distinct from the plan-canvas
  THREE underlay of Remaining item 1). Three root causes fixed: (a) **render** — the
  Map↔Satellite basemap toggle calls `map.setStyle({diff:false})`, which wiped every custom
  source/layer; only the boundary ring was re-added, so the raster vanished (most visibly on
  the satellite basemap the founder was viewing). `SitePlanOverlayLayer` now SELF-HEALS on
  `style.load` (idempotent re-install, opacity/visibility preserved). Also: the origin
  fallback was `(0,0)` (Gulf of Guinea) when no location was geocoded — now the map's current
  centre — and a fresh upload eases the map to the plan's bounds so "choose file → image
  appears" is reliably true. (b) **storage** — Remaining item 3 (raster → IndexedDB). (c)
  **flow** — "✓ Use this placement" now, besides `dispatchSiteTrueNorth(θ)`, emits
  `site.overlay-placement-committed`; the onboarding wizard listens and advances Step 2 → the
  plot/confirm step (L-38: a geolocated + calibrated plan is a valid located plot — no
  mandatory boundary trace to proceed).
- **2026-07-03 follow-up (L-69, `§FIX-SITE-OVERLAY-CALIBRATION-EXCLUSIVE` +
  `§FIX-SITE-OVERLAY-IMPORT-TERMINAL`).** Two founder defects on the shipped overlay. **(1)
  2-pt calibration was dead:** (a) the overlay map-click listener read the MapMouseEvent as the
  lng/lat (`e.lng`/`e.lat`, undefined) instead of `e.lngLat` → NaN → no point captured; and (b)
  the boundary DRAW tool consumed the two clicks as parcel vertices (even committing a boundary
  → forcing generate). Fix: read `e.lngLat`, and the draw tool now YIELDS its clicks while
  `overlayController.isCalibrating()` is true, so both clicks land as scale points. **(2)
  Import decoupled from generate:** the L-58 commit routed "✓ Use this placement" into a
  default-plot generate-confirm — reversed. Import is now a TERMINAL "place → enter canvas"
  path: dispatch θ, keep the calibrated plan persisted, dispose the wizard — no forced boundary
  trace, no auto-generate. Boundary-trace / generate remain separate explicit onboarding
  branches. (Superseding the L-58 flow-completion behaviour of routing to the generate-confirm
  step; the typed `site.overlay-placement-committed` event is retained but now terminal.)
- **Related / composes with:**
  [ADR-0070 Project North vs True North authoring frame](ADR-0070-project-north-vs-true-north-authoring-frame.md)
  (extends — gives θ a first-class *UI source*),
  [ADR-0259 Georeferenced site-plan overlay](ADR-0259-site-plan-overlay.md) (extends — the
  overlay's placement now *defines* project north),
  [C19-SITE-MODEL-AND-PARCEL](../contracts/C19-SITE-MODEL-AND-PARCEL.md) (§1.3 LTP-ENU
  origin = the project base point; `SiteLocation.trueNorth` = θ),
  [C12-GEOSPATIAL](../contracts/C12-GEOSPATIAL.md) (true-north radian convention),
  C04 (view / scheduling — additive, behind the north model),
  [SPEC-SITE-PLAN-OVERLAY](../../03-execution/specs/SPEC-SITE-PLAN-OVERLAY.md),
  [SPEC-PROJECT-NORTH-AUTHORING-FRAME](../../03-execution/specs/SPEC-PROJECT-NORTH-AUTHORING-FRAME.md).
- **Does NOT supersede** ADR-0070 or ADR-0259; it composes with both.

## Context

The founder wants two things (L-38), both mirroring Revit's *Project North vs True North*:

**Part A — direct overlay UX.** Upload a PDF/image → it drops onto the plan canvas as an
underlay the user can **move / rotate / scale** interactively, then **OK**. No boundary
trace required; the deliverable is a properly located + geolocated + scaled underlay.
The **interactive rotate** is first-class: the angle the user rotates the image to align
it to the plan's orthogonal axis is what **defines project north**.

**Part B — dual north.** The underlay defines **PROJECT NORTH** (its own orthogonal
axis). The PRYZM **plan view always edits in the project frame** (walls drawn parallel to
the underlay read as axis-aligned). The **3D site / globe view works in TRUE NORTH** — the
model placed at its geolocation, rotated to true north by an angle **θ**. θ is captured
when the underlay is geolocated.

What already existed (verified in code):

- **ADR-0070** made *Project North* a first-class frame for generative geometry, but θ was
  *derived from the drawn boundary's principal axis* (`deriveProjectNorthFrame`,
  `principalAxisDeg`) — it had **no UI source**. Model A (store in project-north, carry a
  Project Base Point + angle to true north) was explicitly deferred.
- **ADR-0259** shipped a georeferenced overlay on the MapLibre 2D site map with live
  move/rotate/scale/opacity/lock + 2-point calibration + per-project persistence, plus a
  THREE plan-view underlay (`FloorPlanUnderlayTool` in `@pryzm/input-host`) that already
  supports drag-move, `rotateBy`, `applyScale`, and lock. The overlay's placement
  transform carries a **`rotationRad`** (clockwise vs scene/map north).
- **`SiteLocation.trueNorth`** (radians, C12) and `SiteModel.location` already exist, with
  a P6 command path (`site.updateLocation` → `SiteModelStore`).

The missing piece was the **bridge**: nothing captured the underlay's placement as θ, wrote
it to the model, or expressed the plan frame vs the globe frame through one transform. And
the **3D globe/site view was unreachable** from a normal 3D view (L-40): its only entry was
a buried GIS-rail button that dead-ended when the geospatial area was not yet mounted.

## Decision

Adopt the **underlay-defined Project North** and a single **dual-north rigid transform**.

### 1. Two DISTINCT angles (founder rule — never alias them)

- **Underlay on-canvas rotation** (`SitePlanOverlayTransform.rotationRad`, and the THREE
  underlay's `mesh.rotation.z`): the interactive move/rotate/scale orientation. Aligning
  the image to the plan's orthogonal axis is what **defines project north**. It lives on
  the overlay *placement transform* and persists with it (Part A).
- **θ = project→true-north** (`SiteLocation.trueNorth`, radians, C12): captured when the
  underlay is **geolocated** on the true-north basemap. This is what the **3D globe**
  applies. Stored on the model, **distinct** from the underlay rotation, so a later
  plan-frame re-rotate of the raster never silently moves true north, and vice-versa.

### 2. One transform primitive (`projectTrueNorth.ts`, pure, headless)

A rigid rotation by θ about the **project base point** (the C19 §1.3 LTP-ENU / site origin,
shared with the parcel boundary and the overlay geo-anchor), using the *same* clockwise
sign convention as the existing overlay corner math:

```
projectToTrueNorth(pt, θ, base):  E' =  dE·cosθ + dN·sinθ ;  N' = −dE·sinθ + dN·cosθ   (+base)
trueToProjectNorth(pt, θ, base):  inverse
projectVectorToTrueNorth(v, θ):   free-vector form (globe applies to the model's axes)
overlayInProjectFrame(t):         t with rotationRad = 0  (plan renders the underlay AXIS-ALIGNED)
```

**Invariant (θ = 0 ⇒ identity):** an underlay aligned to true north makes every mapping the
identity — **byte-identical to today** (ADR-0070 discipline). Round-trip is exact
(`project → true → project` returns the original point), so the plan frame and the globe
frame are two views of ONE rigid placement — seams that close in plan stay closed on the
globe.

### 3. Data model (P5 / P6 respected)

- θ lives on the **existing** `SiteLocation.trueNorth` — **no schema change** (P5). The P6
  mutation path is a thin `dispatchSiteTrueNorth(ctx, θ)` that reads the current
  `SiteLocation`, overrides **only** `trueNorth`, and re-runs the pure `site.updateLocation`
  handler (preserving lat/lon/elev/crs/basePoint) → emits `site.location-changed`.
- The **underlay geolocation record** (anchor lat/lon = base point, the two angles, the
  metric scale) is captured by the pure `captureUnderlayGeolocation()` and persisted with
  the existing per-project overlay record (`pryzm.sitePlanOverlay.v1.<projectId>`), extended
  with **optional, back-compatible** `projectNorthRad` + `projectNorthSet` fields (old
  records still load). The underlay's own on-canvas rotation stays on `transform.rotationRad`
  — the two angles are stored separately, honouring §1.

### 4. Part A — OK without a boundary trace

The overlay panel gains **"✓ Use this placement (set Project North)"**. It captures θ from
the committed placement, mirrors it onto the model via `dispatchSiteTrueNorth` (P6), and
persists it — **no boundary trace required** (the founder's Part-A goal). 2-point
calibration (scale) and boundary tracing remain independently available.

### 5. Plan view = project frame; globe = true north

- **Plan view** renders the underlay **axis-aligned** (`overlayInProjectFrame`, rotation
  removed) and edits in the project frame — walls drawn parallel to the underlay are
  axis-aligned by construction.
- **3D globe / site view** reads `SiteLocation.trueNorth` (θ) and applies the rigid
  transform so the model + underlay sit geolocated + rotated to true north.

### 6. L-40 — the 3D site/globe must ALWAYS be reachable

Root cause: the only UI entry to the Cesium/Forma site view was the GIS-rail **"3D Site"**
button calling `window.pryzmShowFormaView`, which dead-ended ("GIS area not mounted yet")
and required "Activate Geospatial" first. The Forma entry actually **self-bootstraps** Cesium
(`mountFormaViewToggle → applyFormaView → engageFormaCesium → toggleGIS(true)`), even with no
site. Fix (additive):

- Register a stable, self-bootstrapping global **`window.pryzmEnterSiteView`** at boot
  (inside `mountGISArea`, which runs in `createMainLayout`), and mount an **always-present
  floating "◉ 3D Site / Globe" launcher** on the 3D viewport (`#container`). Enters on a
  sensible default centre when no geolocation exists yet.
- Harden the GIS-rail button to prefer `pryzmEnterSiteView`, and if neither global is up,
  activate geospatial then retry — never a dead-end.

## Consequences

- **Positive:** the underlay's interactive rotation now *has meaning* (defines project
  north); the plan is orthogonal to the underlay while the globe is geolocated + true-north,
  through ONE tested rigid transform; θ round-trips exactly; θ = 0 is byte-identical; the 3D
  site/globe view is always one click away. Reuses the ADR-0259 overlay, the C19 site model +
  command path, and the existing Forma/Cesium view — **no parallel subsystem** (P1). MapLibre
  + raw math only, no `import * as THREE` added (P2); no new rAF (P3); no `(window as any)`
  (P4 — typed `pryzmEnterSiteView`); no schema change (P5 — θ on the existing
  `SiteLocation.trueNorth`); mutations via the `site.updateLocation` command (P6).
- **P8 note:** the new code is (i) **pure headless math** in the L5 overlay-geometry family
  (`projectTrueNorth.ts`, sibling to the spanless `sitePlanOverlayGeometry.ts`) and (ii)
  thin L5 UI-dispatch adapters mirroring the existing spanless `dispatchSiteLocation` /
  `dispatchParcelBoundary`. The actual site mutation flows through the `site.updateLocation`
  path; no new L1/L2 exported command surface is introduced, so no new span site is created.
  This matches the established local convention for these modules.
- **Negative / follow-ups (see §Remaining).**

## Remaining (this slice is PARTIAL by design)

1. ~~**Plan-canvas gizmo bridge.**~~ **DONE (2026-07-03, L-71, `§FEAT-SITE-OVERLAY-PLAN-UNDERLAY`).**
   Pressing "✓ Finish" on the site-plan overlay now INSTANTIATES the calibrated plan as a live
   underlay INSIDE the PRYZM editor canvas (plan + 3D), reusing the EXISTING floor-plan underlay
   pipeline — `FloorPlanUnderlayTool` (packages/input-host) + `CreateUnderlayCommand` dispatched
   via `runtime.bus` → the L-45 `CREATE_UNDERLAY` bridge (P6, undoable). The placement is the
   pure `computePlanUnderlayPlacement(transform)` (projectTrueNorth.ts): **size** = `pxPerMeter =
   1/mpp` (the 2-point calibration); **rotation** = `0` = AXIS-ALIGNED in plan view (the map
   shows the plan at true north, the canvas removes that rotation = project north = orthogonal
   for wall-tracing — this is `overlayInProjectFrame` applied to the renderer); **location** =
   the overlay centre re-expressed in the project frame (`trueToProjectNorth` about the site
   origin). Engine bridge: `apps/editor/src/engine/createSiteOverlayUnderlay.ts`
   (`createPlanCanvasUnderlayFromSiteOverlay`, one OTel span — P8; P2-clean: mutates the mesh
   via the tool's state handle, no `import * as THREE`). Wired controller → SiteBoundaryMap2D
   `onEnterCanvas` → engine helper. θ still lands on `SiteLocation.trueNorth` via
   `dispatchSiteTrueNorth` for the globe. (This is what the L-69 note anticipated.)
2. **Globe applies θ to the placed model.** **SLICE 2b PARTIAL (2026-07-19, L-430).**
   `CesiumViewport` did not read `SiteLocation.trueNorth` at all; it now does, via
   `readProjectNorthRad()`, and the PRIMARY massing path (`renderFormaMassing`'s
   `toCartesian` closure — what places the authored building, boundary and envelope on the
   globe) routes through the new headless `sceneEnuFrame.ts` (`sceneXZToEnu`).
   - **Extracted, not inlined.** `CesiumViewport.ts` is ~8 000 lines bound to Cesium + the DOM
     and is effectively untestable; the frame mapping was therefore pulled out into a pure
     module with 6 direct tests, including the end-to-end property that a parcel squared into
     the authoring frame lands back on its ORIGINAL true-world bearing. That last test is the
     one that catches a θ applied in the WRONG DIRECTION — such a θ round-trips perfectly and
     so survives a round-trip test, which is the trap here.
   - **θ is applied at the scene boundary, NOT inside `enuToCartesian`.** That helper already
     receives east/north and is shared by inputs that are ALREADY true-north (terrain samples,
     OSM context, the sun anchor). Rotating there would DOUBLE-rotate them. θ belongs at the
     one place authored scene coordinates cross into the world frame.
   - **STILL PARTIAL — see the MIGRATION INVENTORY at the top of `sceneEnuFrame.ts`** for the
     named list of sites still open-coding `east = x, north = −z` (terrain `enuToLatLon` +
     its ring callers, `sceneRingToMetric`, the centroid helpers, the glTF real-model
     placement — which needs `projectHeadingToTrueBearingDeg` for its HEADING as well as its
     position — the §GLOBE-HEADING-90 path, and a GLSL shader that computes the mapping
     per-fragment on the GPU and will need θ as a uniform or CPU pre-rotation).
   - **This partial state is safe ONLY because θ is still 0 everywhere** (no producer yet), so
     every mapping is the identity. Completing the inventory is a HARD PRECONDITION of item 8;
     enabling the producer first would place migrated and unmigrated geometry in two different
     frames — the building splits across bearings, and nothing throws.
3. ~~**Persist the underlay raster beyond localStorage** (large data URLs) — carried over from
   ADR-0259.~~ **DONE (2026-07-03, L-58, `§FIX-SITE-OVERLAY-RENDER-AND-FLOW`).** The site-plan
   overlay raster now lives in IndexedDB (`SiteOverlayRasterStore`, per-project, mirroring the
   L-45 floor-plan `UnderlayRasterStore`); localStorage keeps only lean metadata
   (`writePersistedOverlay` strips the raster; `readPersistedOverlayMetadata` tolerates its
   absence; a legacy inline record migrates to IDB on first restore). This closed the
   `QuotaExceededError` that silently failed the save/restore so the raster never repainted.
4. **Promote the geolocation record to a durable schema element** if/when Model A (store in
   project-north end-to-end) is pursued — today θ on `SiteLocation.trueNorth` + the per-project
   overlay record is sufficient and P5-clean.
5. ~~**Parcel-derived θ (Pipeline B).**~~ **DONE (2026-07-19, L-430 slice 1, `66b0a0de`.)**
   This ADR shipped θ only for an UNDERLAY-defined project north (an imported plan the user
   rotates on the basemap). Pipeline B is PARCEL-driven — the user selects/draws a real
   cadastral plot and never imports a plan — so `deriveProjectNorthAngleFromParcel(ringXZ)`
   (`projectTrueNorth.ts`) derives θ from the parcel's DOMINANT (longest) edge, folded into
   (−π/4, +π/4] mod π/2 so it is always the SMALLEST squaring rotation and an already-square
   site returns EXACTLY 0 (byte-identity). PURE — derives only; application is items 2 + 6.
6. **Solar consumes θ — ⚠ THE INVARIANT IS EASILY STATED BACKWARDS.**
   **SLICE 2a DONE (2026-07-19, L-430).** It is tempting (and was written down wrongly in the
   V1 audit before this amendment) to say "solar must never consume the rotated frame". That is
   **false and produces silently wrong shadow studies.** The invariant this ADR actually
   protects is that **sun-vs-BUILDING geometry is preserved**. If the authoring frame rotates
   by θ and the sun vector does not follow, the sun keeps pointing at true north while the
   building no longer does — every shadow swings by θ. **Solar is a MANDATORY θ consumer.**
   What stays TRUE north is the *reported* azimuth (panel readout, climate charts,
   `lastPosition`) — a fact about the world; what rotates is the scene light VECTOR.
   - Applied at BOTH sun-direction builders: `packages/solar-analysis/src/solarPosition.ts`
     `sunDirectionFromAltAz(alt, az, projectNorthRad = 0)` (drives sun-hours ANALYSIS) and its
     deliberate replica in `RealSunService._drive` (drives the VIEWPORT key light), the latter
     via a new `setProjectNorth(θ)` kept SEPARATE from `setOffsets` so a user slider can never
     corrupt the frame (the "two angles must never alias" rule, §Consequences).
   - **Duplication hazard:** that math exists twice. θ on only one gives *rendered shadows
     disagreeing with analysed shadows* — the worst failure mode, since each looks plausible
     alone. The two MUST move in lock-step; both files now say so at the call site.
   - **Layering:** `solar-analysis` (L2) and `core-app-model` (L1) may not import this L5
     primitive. Applying `trueVectorToProjectNorth` to
     `(east, north) = (cosAlt·sin az, cosAlt·cos az)` reduces exactly to an azimuth shift of
     −θ, so the low layers use that SCALAR form — no illegal import — and
     `apps/editor/__tests__/projectNorthSolarEquivalence.test.ts` pins it against the REAL
     transform (plus a θ=0 strict-equality byte-identity check, altitude invariance, façade
     incidence preservation, and a **negative control** proving that ignoring θ genuinely
     breaks the invariant, so the suite cannot pass vacuously).
   - New primitive: `trueVectorToProjectNorth` — the previously missing inverse free-vector
     form, the counterpart to `projectVectorToTrueNorth`.

### Sequencing rule for the remaining θ application (items 2, 7) — deliberate

Wire every θ **CONSUMER** first while θ is still 0, then enable the **PRODUCER** last.
θ = 0 ⇒ every mapping is the identity, so each consumer lands provably byte-identical and
carries no behavioural risk; flipping the producer on then lights up plan, globe and solar
coherently in ONE step. The intuitive order (derive θ first) would rotate the plan while
`CesiumViewport` still read 0 — i.e. ship a visibly wrong globe and invite a per-subsystem
ad-hoc counter-rotation, which is exactly how double-rotation defects are born.

7. **North arrow must resolve from project context (C34 §1.4).**
   `PlanViewAnnotationRenderer._renderNorthArrow` reads a literal
   `ann.parameters.northAngle ?? 0` and never consults `SiteLocation.trueNorth`, which C34 §1.4
   forbids ("MUST resolve direction from project context; MUST NOT carry a hard-coded numeric
   direction"). Once θ ≠ 0 the plan north arrow would point at project north while claiming
   true north. The GA gate meant to catch this, `tools/ga-gate/check-north-arrow-source.ts`,
   is marked (NEW) in C34 and **does not exist yet** — it must be built with this item.
   Note `FacadeOrientationService.northBasis(trueNorth)` is ALREADY parameterised and merely
   needs its callers to pass θ (`CreatePanelLayout.ts` currently relies on the `0` default).
8. **THE PRODUCER — derive θ at parcel commit. SHIPS LAST, BY DESIGN.**
   `siteDispatch.dispatchParcelBoundary` calls `deriveProjectNorthAngleFromParcel(ring)` and
   dispatches it via the existing `dispatchSiteTrueNorth` (P6). This is the single change that
   makes θ ≠ 0 and therefore activates every consumer at once.
   **HARD PRECONDITIONS — all of items 2, 6, 7 complete:**
   - the `sceneEnuFrame.ts` migration inventory fully drained (globe geometry AND headings);
   - solar θ wired end-to-end — the θ plumbing exists (item 6) but `RealSunService`
     `setProjectNorth` still needs a CALLER subscribing to `site.location-changed`, and
     `computeSunHoursOnModel`/`sunSamples` need θ threaded from the site;
   - the north arrow resolving from project context, so plan sheets do not claim true north
     while pointing at project north.
   **Also unresolved at the producer:** the parcel ring itself is committed in the TRUE frame
   by `boundaryProjection.buildBoundaryFromLatLonRing`. Either it is de-rotated at commit (so
   the authoring frame really is project north — the founder's ask) or every downstream
   consumer applies θ⁻¹. The former is the ADR-0070 RIGID-TRANSFORM-LAST spirit and is
   strongly preferred; it must be decided explicitly, not drifted into.
