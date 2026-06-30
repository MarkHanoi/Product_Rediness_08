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
