# ADR-0115 — Underlay-defined Project North + the dual-north (project↔true) transform

- **Status:** Accepted (2026-07-02) — IMPLEMENTED first coherent vertical slice
  (dual-north transform primitive + underlay geolocation record + capture-to-model
  command path + always-on 3D-site entry). Plan-canvas gizmo bridge + globe θ
  application are documented follow-ups (see §Remaining).
- **Deciders:** Founder + Claude (Opus 4.8)
- **Tags:** `§FEAT-SITE-OVERLAY-PLACE`, `§FEAT-PROJECT-TRUE-NORTH`, `§FEAT-SITE-VIEW-ALWAYS-ON`
- **Audit rows:** L-38 (overlay + dual north), L-40 (3D site/globe always reachable).
- **Related / composes with:**
  [ADR-0070 Project North vs True North authoring frame](0070-project-north-vs-true-north-authoring-frame.md)
  (extends — gives θ a first-class *UI source*),
  [ADR-059 Georeferenced site-plan overlay](ADR-059-site-plan-overlay.md) (extends — the
  overlay's placement now *defines* project north),
  [C19-SITE-MODEL-AND-PARCEL](../contracts/C19-SITE-MODEL-AND-PARCEL.md) (§1.3 LTP-ENU
  origin = the project base point; `SiteLocation.trueNorth` = θ),
  [C12-GEOSPATIAL](../contracts/C12-GEOSPATIAL.md) (true-north radian convention),
  C04 (view / scheduling — additive, behind the north model),
  [SPEC-SITE-PLAN-OVERLAY](../../03-execution/specs/SPEC-SITE-PLAN-OVERLAY.md),
  [SPEC-PROJECT-NORTH-AUTHORING-FRAME](../../03-execution/specs/SPEC-PROJECT-NORTH-AUTHORING-FRAME.md).
- **Does NOT supersede** ADR-0070 or ADR-059; it composes with both.

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
- **ADR-059** shipped a georeferenced overlay on the MapLibre 2D site map with live
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
  site/globe view is always one click away. Reuses the ADR-059 overlay, the C19 site model +
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

1. **Plan-canvas gizmo bridge.** Wire the existing THREE plan-view underlay
   (`FloorPlanUnderlayTool` — already drag/`rotateBy`/`applyScale`/lock capable) so its
   confirm/OK captures `mesh.rotation.z` → `deriveProjectNorthAngle` → `dispatchSiteTrueNorth`,
   and shares the one overlay placement transform with the MapLibre surface. The pure
   transform + capture helpers + the P6 path all exist; this is the remaining UI wiring.
2. **Globe applies θ to the placed model.** `CesiumViewport` currently does not read
   `SiteLocation.trueNorth`; feed θ into the Forma massing placement so the model rotates to
   true north on the globe (the transform primitive is ready).
3. **Persist the underlay raster beyond localStorage** (large data URLs) — carried over from
   ADR-059.
4. **Promote the geolocation record to a durable schema element** if/when Model A (store in
   project-north end-to-end) is pursued — today θ on `SiteLocation.trueNorth` + the per-project
   overlay record is sufficient and P5-clean.
