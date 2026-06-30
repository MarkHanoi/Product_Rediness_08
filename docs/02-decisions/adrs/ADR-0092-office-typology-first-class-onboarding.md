# ADR-0092 — Office typology is first-class from the picker (onboarding wiring + default-ON gate)

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-06-30 |
| Owner | Onboarding + typology dispatch (`apps/editor/src/ui/onboarding`, `apps/editor/src/ui/office-building`) |
| Builds on | A.21.j (house onboarding branch) · §RESI-MULTIFAMILY (residential onboarding branch) — both KEPT intact |
| Tags | §OFFICE-ONBOARDING-WIRE |
| Contracts | P2 (no `import * as THREE`) · P4 (no `(window as any)` — narrow typed `globalThis` lookups only) · P6 (mutation via the office controller/command bus — controller/executor own it) · P8 (≥1 span — the office controller's `request()` owns the OTel span; the new pure helpers are span-free I/O-free pure functions) |

## Context

"Commercial building — office" appeared in the New-Project typology picker but did **nothing
useful**: selecting it, drawing a boundary and pressing Generate produced an **apartment**, not an
office. Two upstream facts caused this:

1. **Feature-gated OFF.** The office console generator (`pryzmGenerateOfficeBuilding`) and the
   composeRuntime typology-pack registration were both gated `=== true` on
   `globalThis.__PRYZM_OFFICE_BUILDING__`, requiring a DevTools flag flip. Residential-building
   uses a **selection-opt-in** posture instead (picking it IS the opt-in).
2. **No office dispatch.** `OnboardingStepController.generateAndFinish()` switched
   `casa-unifamiliar → house`, `residential-multifamily → residential`, **else → apartment**. The
   office typology fell into the `else`, so it built an apartment. Worse, `briefBootstrap`'s
   `GENERATOR_READY_TYPOLOGIES` gate bailed BEFORE the step flow even ran for office.

The office tower is **circular** (radius + storeys), but the user draws a **polygon** parcel — so
the circle has to be DERIVED from the drawn plot.

## Decision — §OFFICE-ONBOARDING-WIRE

Make office a **first-class typology from the picker**, mirroring residential-building:

1. **Default-ON, opt-OUT gates.** `isOfficeBuildingEnabled()` (UI generate path) and the
   composeRuntime pack-registration gate now read `!== false`: enabled unless an EXPLICIT
   `globalThis.__PRYZM_OFFICE_BUILDING__ === false` force-disables it. Selecting the typology is
   the opt-in; no console flag is needed for the UI path. The gate functions are KEPT so the
   feature can still be force-disabled.
2. **Office dispatch branch.** `generateAndFinish()` gains `else if (this.isOfficeTypology())
   { await this.generateOffice(); }` BEFORE the apartment `else`. ADDITIVE — the house / resi /
   apartment branches are byte-unchanged. `isOfficeTypology()` accepts BOTH the registry pack id
   (`office-building`, what the TypologyPicker emits from `manifest.id`) and the short/RAC form
   (`office`), since there is no id-normalisation layer between the picker and the brief.
3. **Parcel → circle derivation.** `generateOffice()` reads the drawn parcel (shared
   `readParcelFootprint()`), derives a circle that **sits inside the plot** via the pure
   `deriveOfficeCircleFromParcel` (vertex **centroid** + a **fit radius** = the min perpendicular
   distance from the centroid to every polygon edge, additionally clamped by the bbox half-min-side),
   resolves storeys from the brief (`stories`/`floors`/`levels`, default 40, clamp [1,40]), and
   drives the SAME `OfficeBuildingController.request({ stories, radiusM })` the console path uses
   (which opens the office setup modal → Build). If the parcel read/derive fails it falls back to a
   default 22 m radius so the flow never blocks (mirrors the house path's defensive posture).
4. **No custom office setup step.** The generic confirm step already renders correctly for office
   (`typologyLabel()` → "office"), and the office controller's modal covers stories / radius / desk
   density tuning — so a bespoke onboarding office step is intentionally NOT built (avoids a
   half-built step for a same-day landing). The residential program step is unchanged.

## Consequences

- Picking "Commercial building — office" → location → draw boundary → Generate now produces the
  brief-N (default 40) storey **circular office tower**, not an apartment.
- Pure, shared helpers (`deriveOfficeCircleFromParcel`, `isOfficeTypologyId`,
  `resolveOfficeStoreyCount`) are unit-tested (`apps/editor/__tests__/DeriveOfficeCircle.test.ts`,
  11 cases) — the dispatch predicate and the geometry derivation are covered without standing up
  the heavy controller.
- Production posture change: the office pack now registers by default. Force-disable with
  `globalThis.__PRYZM_OFFICE_BUILDING__ = false` if a regression appears.
- Files: `apps/editor/src/ui/office-building/officeBuildingTrigger.ts` (gate flip + controller
  accessor), `deriveOfficeCircle.ts` (NEW pure helpers), `apps/editor/src/ui/onboarding/
  OnboardingStepController.ts` (dispatch + `generateOffice`), `briefBootstrap.ts` (ready-set +
  toast noun), `apps/editor/src/types/globals.d.ts` (gate comments),
  `packages/runtime-composer/src/composeRuntime.ts` (registration gate flip).

## Amendment (2026-06-30) — feasibility ALWAYS builds · preview step · full tower

The founder live-tested and hit three gaps; this amendment supersedes point 4 above (a bespoke
office setup step IS now built) and adds the feasibility + tower-build decisions.

### §OFFICE-PLATE-AUTOFIT — the office must ALWAYS build (degrade like residential)

A ~499 m² parcel derived `radius 10 m`, `stories 40` → the controller **hard-rejected** ("floor
plate infeasible: core leaves no room for an inner circulation ring"), so nothing built. The
residential building never hard-rejects (it degrades: "N units didn't fit" but still emits a
building). Decision: the office matches that posture.

- `generateOfficeFloorPlate` (`packages/ai-host/.../officeFloorPlate.ts`) no longer rejects a
  too-small plate. It **clamps the radius UP** to a minimum sensible plate (`MIN_BUILD_RADIUS_M =
  10 m`) and **shrinks the core fraction** (floor `MIN_CORE_FRACTION = 0.10`) so the inner
  circulation ring stays a half-corridor wide. The ring radii are clamped to stay strictly
  ordered + inside the plate. The ONLY remaining reject is a non-finite / non-positive radius
  (genuinely no plate to build on). It returns a new `autoFit: OfficePlateAutoFit` with the
  as-built radius / core fraction + human `notes`.
- `orchestrateOfficeBuilding` clamps the radius up-front (so the whole building — analytics radius,
  floor elevations, GFA — is consistent with the built plate), caps the storey count to
  `maxFeasibleStoriesForRadius(radius)` (NEW exported helper, ≥1 span), hard-clamps to the 60-storey
  engine ceiling, and surfaces `requestedStories` + a merged `autoFit`. It clamps rather than
  rejects out-of-range stories — the office ALWAYS builds.
- `deriveOfficeCircleFromParcel` (§OFFICE-DERIVE-FILL) pushes the derived radius UP toward the
  bbox-fit (geometric mean of the centroid-inscribed radius and the bbox half-min-side), never past
  the bbox — so a near-square ~500 m² parcel fills toward the largest plate that fits instead of an
  over-conservative inscribed radius.

### §OFFICE-PREVIEW-STEP — an office SETUP step mirroring the residential building

`OnboardingStepController.renderGenerateConfirmStep` now branches on `isOfficeTypology()` to
`renderOfficeProgramStep` (the sibling of `renderResidentialProgramStep`), confined to the office
region (no edits to the resi/house/apartment branches or the `§ONB-RESULT-VIEW` handoff). It renders
the resi landscape layout (centre live preview · right controls) with: a STORIES slider **capped to
`maxFeasibleStoriesForRadius`** (so the preview is never infeasible — it re-caps live as the radius
slider moves), FLOOR-TO-FLOOR, RADIUS (derived, adjustable), DESK DENSITY, a CULTURE toggle
(open-plan-first / perimeter-offices-first), and a circular-plate note. It re-runs the PURE
`orchestrateOfficeBuilding` on every change and paints the existing `buildOfficePlatePreviewSvg` +
`buildOfficeAnalyticsHtml` (display-only, no scene mutation — P3/P6). "Build this tower" writes the
chosen params into `briefMetadata` and runs the SAME generate path; `generateOffice` reads them and
calls the new `OfficeBuildingController.buildDirect` (orchestrate + execute, NO redundant second
modal). The console / RAC path (no preview) still uses `request()` + the modal.

### §OFFICE-TOWER-BUILD — the executor builds a real multi-storey tower (not one disc)

The `OfficeBuildingExecutor` previously emitted only ONE representative slab (a flat disc). It now
mints one editor level per feasible storey (`AddLevelCommand`) and, in ONE `batchCoordinator.runBatch`
(one undo, `skipRedetectRooms`): (a) a CIRCULAR FLOOR SLAB per storey stacked at the floor-to-floor
cascade, (b) a segmented PERIMETER WALL RING (the n-gon footprint edges as wall segments via the bus
`wall.batch.create`) per storey for a façade the Forma white-materials / façade-analysis can paint
on, and (c) on the representative office floor, the CENTRAL CORE slab + the concentric desk-zone
room-bounding lines (open-plan / perimeter / collab / circulation) so the plate reads as an office
layout in plan. Level minting degrades gracefully (stops + builds a shorter tower) if a level fails.
Per-desk BIM furniture is a later slice.

- Tests: `packages/ai-host/.../officeFloorPlate.test.ts` (auto-fit: small plate clamps + still
  builds + never rejects; core-shrink; storey clamp; `maxFeasibleStoriesForRadius` monotonic ≥1) and
  `apps/editor/__tests__/DeriveOfficeCircle.test.ts` (§OFFICE-DERIVE-FILL: ~500 m² → sensible radius;
  fill never past the bbox).
- Files (this amendment): `packages/ai-host/src/workflows/officeBuilding/officeFloorPlate.ts`,
  `officeBuildingOrchestrator.ts`, `packages/ai-host/src/index.ts` (exports),
  `apps/editor/src/ui/office-building/{deriveOfficeCircle.ts, OfficeBuildingController.ts,
  OfficeBuildingExecutor.ts}`, `apps/editor/src/ui/onboarding/OnboardingStepController.ts`
  (office step + `generateOffice` only).
