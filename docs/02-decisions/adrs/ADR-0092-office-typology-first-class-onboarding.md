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

> ⚠ **KNOWN VIOLATION — CORRECTION OF RECORD (L-669, 2026-08-01). The premise in the paragraph
> above was FALSE when it was written, and this ADR's office decision rests on it.**
>
> "The residential building never hard-rejects (it degrades…)" is not what the engine did.
> `orchestrateResidentialBuilding` returns `{status:'rejected'}` — a HARD refusal, nothing built —
> whenever a level's partition places zero apartments. The founder hit exactly that on a 674 m²
> plot on 2026-08-01, and on a ~352 m² plot on 2026-06-24 before that. Measured pre-fix: a
> 16 × 45 m (720 m²) plate REFUSED while a 16.5 × 16.5 m (272 m²) plate built.
>
> The office typology was therefore given its clamp-up-and-always-build posture by analogy with a
> behaviour residential did not have. That is not a reason to revert §OFFICE-PLATE-AUTOFIT — the
> posture may still be right on its own merits — but the JUSTIFICATION must be re-argued rather
> than inherited, and the two typologies should not be assumed to agree.
>
> **Since L-669 (`8094c3fb`)** residential degrades further before refusing (§RESI-NARROW-PLATE-SIDE-CORE
> falls back to a side-core single-loaded plan, dropping the derived plate-width floor from 19.6 m
> to 11.1 m), but it still **hard-rejects below that floor by design** — and deliberately so: a
> plate that cannot hold a core plus one apartment run must refuse rather than emit ribbons (the
> §RESI-NARROW-PLATE-SIDE-CORE ribbon guard). So "always builds" is NOT, and should not become,
> the residential contract.
>
> **Status: OPEN — needs an ADR owner.** Either amend this section to argue the office posture on
> its own terms, or supersede it. Tracked as **L-669**; see also **L-671** (no contract requires a
> refusal to name the constraint the engine actually evaluated).

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

## Amendment (2026-06-30) — §OFFICE-PERIMETER-GLAZING · curtain-glass façade + RBL/perf fixes

The founder live-tested the tower and asked for a **glass curtain-wall reading**: EVERY perimeter
wall segment, on EVERY storey, must carry a window that fills almost the **full width** of the
segment and almost the **full height** (sill near the floor, head near the slab — floor-to-slab
glazing). Three issues were fixed in `OfficeBuildingExecutor.ts` (+ the new pure
`officePerimeterGlazing.ts`).

### §OFFICE-PERIMETER-GLAZING — a hosted window per segment (window, not curtain-wall)

Each perimeter segment now hosts ONE **punched window** — a C15 HOSTED opening (`type: 'window'`)
created through the command bus (`CreateWallOpeningsBatchCommand` → `wall.createOpening`), NOT a
direct store write (P6/C11). **Decision: a punched window, not a curtain-wall element.** Rationale:
(a) the founder asked for a window *hosted in* each segment — a punched opening is the canonical
C15 hosted child of its host wall; (b) it reuses the exact, proven cascade the residential building
uses for its commercial shopfront windows (`§RESI-GROUND-COMMERCIAL-CURTAIN`), including the
stored-wall length clamp (`clampOpeningToWall`) that keeps a pane from overrunning the corner; (c)
the perimeter wall ring is KEPT (the founder's spec is a window *in* each segment, not a wall
replacement) and a window reads as glass while keeping the façade structure for shadow/analysis.

- **Sizing (pure, unit-tested `perimeterGlazingSpec`)**: width = segment − 2·jamb where jamb =
  clamp(7.5%·seg, [0.15, 0.30] m), shrunk on a short segment so a minimal pane still fits; centred
  (equal jamb both ends). Sill = 0.15 m (low); head = floor-to-floor − 0.30 m header; pane height =
  ftf − 0.30 − 0.15 (≥ 85% of the storey height — "almost full height to the slab"). A segment too
  short for a sensible pane (< 0.4 m clear) is skipped (degrades gracefully, like level minting).
- **Glass classification**: the opening stamps `systemTypeId: 'wt-aluminium-commercial'` (anodised
  aluminium office/retail glazing, low `glassOpacity` ⇒ transmissive). The WindowBuilder renders
  real see-through glazing with a `window`/glass `userData.elementType`, so the Forma white-model
  pass (ADR-0093) + `solarSurfaceFilter` GLASS tokens classify it as glazing, not opaque white.
- **Ordering / single build**: windows are collected during the structural batch (host wall ids
  pre-minted) and punched in a DEFERRED, polled pass once the async `wall.batch.create` host walls
  land in the store (mirrors the resi/apartment openings pass) — the perimeter wall ring already
  ships in the one structural `runBatch`; the glazing pass keeps `skipRedetectRooms` (façade glass
  doesn't change room topology). A segment whose stored host wall can't fit a pane is dropped.

### §RBL-PLACEMENT-AT-SOURCE — office zone lines were ALL dropped

Every office desk-zone room-bounding-line was being skipped by the renderer's §RBL-PLACEMENT-GUARD
(`placement.start/end undefined`) and crashed the collab replay (`CREATE_ROOM_BOUNDING_LINE …
reading 'x'`), so each floor read as one empty room. Fixed at the SOURCE: the pure `ringPlanSegments`
helper emits a bounding line ONLY when both polygon endpoints are real finite points AND the edge is
non-degenerate (≥ 10 mm), so no undefined/NaN endpoint ever reaches a `CREATE_ROOM_BOUNDING_LINE`
payload.

### §OFFICE-PERIMETER-COARSEN — fewer elements (the "stuck on creation" headline)

The founder's root complaint: "too many elements — always stuck on creation." A 40-storey ×
≈64-gon footprint emitted ≈2560 perimeter wall segments (+ as many glazing windows) — the dominant
creation cost. **Investigation: a single closed-loop curtain-wall element is NOT supported** —
`CreateCurtainWallCommand` takes a single straight `start`/`end` segment, so glazing the circular
perimeter with curtain walls would still be ONE element per segment (no win over one window per
segment). The real lever is fewer SEGMENTS: the executor now **resamples the circular footprint
down to a ≤24-gon** (`resampleRing`, pure + unit-tested) for BOTH the slab outline and the
wall/window ring (kept on the SAME ring so they stay aligned). A 24-gon still reads as round at
building scale and cuts the per-storey perimeter element count ~2.6× (64→24): a 40-storey tower's
perimeter drops from ≈2560 walls → ≈960, and glazing windows likewise. Analytics / feasibility /
radius are untouched (emission-only decimation). Zone lines were ALREADY representative-floor only
(one floor, not 40). Net for a 40-storey build: roughly hundreds-to-low-thousands instead of
≈2641 — bounded by 24·storeys for the perimeter rather than 64·storeys.

### §OFFICE-PERF — skipPbrUpgrade on the structural batch

The structural `runBatch` now passes `skipPbrUpgrade: true` (big repeated-geometry batch that
doesn't need the cosmetic PBR envMap upgrade the engine warns about). The perimeter walls already
emit via one batched `wall.batch.create` per storey inside the `skipRedetectRooms` batch (room
re-detection suppressed, fired once — NOT per segment). NOT changed: level minting still runs before
the structural batch, matching the proven `ResidentialBuildingExecutor` pattern (levels are committed
+ `res.success`-checked so geometry can reference them and the build can degrade to a shorter tower);
folding `AddLevelCommand` into the batch is left as a separate, app-verifiable perf follow-up.

- Tests: `apps/editor/__tests__/OfficePerimeterGlazing.test.ts` (13 cases — glazing width/height/
  centring/short-segment/null degrade; RBL `ringPlanSegments` defined-endpoint / bad-vertex /
  degenerate-edge guards; `resampleRing` 64-gon→≤24 decimation / under-cap passthrough / non-finite
  drop).
- Files: `apps/editor/src/ui/office-building/{OfficeBuildingExecutor.ts, officePerimeterGlazing.ts
  (NEW pure)}`.

## Amendment (2026-07-01) — §OFFICE-INTERIOR-FITOUT · a real office INTERIOR (roof · core walls · entrance · desks/chairs · meeting rooms · cafe · lighting · finishes)

| Field | Value |
|---|---|
| Tags | §OFFICE-INTERIOR-FITOUT, §OFFICE-ROOF-CAP, §OFFICE-CORE-WALLS, §OFFICE-ENTRANCE, §OFFICE-DESK-GRID, §OFFICE-MEETING-ROOMS, §OFFICE-CAFE, §OFFICE-LOBBY, §OFFICE-CEILING-LIGHTS |

### Context

Founder (2026-07-01): the office generator shipped only a SHELL — per-storey circular slabs + a
coarsened perimeter wall/glazing ring + a solid core slab + zone lines. It was "missing EVERYTHING
inside": no roof, no interior layout, no entrance, no core WALLS (only a slab), no desks/chairs, no
meeting rooms, no cafe, no lighting, no floor finish. The build must read as a real office fit-out —
but PERFORMANCE-AWARE: fully fitting out all 40 floors freezes the main thread, so we detail a FEW
REPRESENTATIVE floors and leave the rest as massing.

### Decision — §OFFICE-INTERIOR-FITOUT

The executor now emits a believable interior, reusing the SAME element commands + patterns the
residential executor uses (P6 — commands only; P2 — no THREE; P8 — one span at `execute`):

1. **§OFFICE-ROOF-CAP** — a flat `CreateRoofCommand` slab over the disc on the TOP storey's wall
   head (`baseOffset = floorToFloor + thickness`, mirroring `ResidentialBuildingExecutor._createRoof`).
   Emitted inside the ONE structural batch. Roof went from 0 → 1.
2. **§OFFICE-CORE-WALLS** — the central core is now real ENCLOSING WALLS (a square RC enclosure
   inscribed in the circular core, one wall per edge with shared corners) on EVERY storey (the shaft
   is continuous), plus ONE centred fire/lobby door punched in a deferred pass once the walls land
   (mirrors `_buildCorePerimeter` / `_finishCoreDoors`). A `_mitreCorners` pass runs the corner-join
   resolver so the shaft reads clean. The solid core slab is retained as the shaft mass.
3. **§OFFICE-ENTRANCE** — a glazed DOUBLE front door punched (deferred) on the GROUND perimeter wall
   segment whose midpoint heading best matches the +X entrance direction.
4. **Interior fit-out on the DETAILED floors** (ground + the representative office floor, capped for
   performance) via the existing `CreateFurnitureCommand` + `CreateLightingCommand` +
   `CreateFloorCommand`:
   - **§OFFICE-DESK-GRID** — desk (`desk`) + chair (`desk_chair`) pairs on a regular grid inside the
     open-plan annulus, facing outward, capped at `MAX_FITOUT_DESKS = 60`.
   - **§OFFICE-MEETING-ROOMS** — 3 boardroom clusters (`table` + 6 `chair`) on the perimeter-office
     ring.
   - **§OFFICE-CAFE** + **§OFFICE-LOBBY** — ground-floor cafe clusters (`coffee_table` + 4 `chair`)
     + a reception desk (`table`) with two waiting `sofa_2seat` seats near the entrance.
   - **§OFFICE-CEILING-LIGHTS** — a `downlight` grid (schema-valid `kind`, avoiding the lighting
     `kind`-enum bug) inside the disc, skipping the core keep-out, capped at 48.
   - **Floor finishes** — a thin carpet finish on the office floor + a stone finish on the ground
     lobby (`CreateFloorCommand`, room-independent).

   All fit-out families land in their OWN deferred, `skipRedetectRooms` + `skipPbrUpgrade` batches so
   they never trigger the room-redetect storm and stay off the critical path — furniture READs the
   committed levels, finishes seat on the settled slabs. Detailing only a few floors keeps the emit
   performant on a 40-storey tower.

### Consequences

- The PURE placement math (`deskGrid`, `meetingRooms`, `cafeClusters`, `coreSquare`, `lobbyPlan`,
  `ceilingLightGrid`) lives in a NEW DOM-free module so it is unit-testable in plain Node.
- Element-count impact per generation (representative + ground detailed): +1 roof, +(4 core walls ×
  storeys) core walls, +(1 door × storeys) core doors, +1 entrance door, up to ~60 desk+chair pairs
  (~120 items) + 3 meeting clusters (~21 items) on the office floor, ~4 cafe clusters (~20 items) +
  reception (3 items) on the ground, up to 48 downlights, +2 floor finishes. The other ~38 floors stay
  as shell massing (unchanged) so the tower doesn't freeze.
- Tests: `apps/editor/__tests__/OfficeInteriorFitout.test.ts` (13 cases — desk-band containment +
  cap, meeting-cluster count/spread, cafe clusters, inscribed core square + door edge, lobby set-back,
  ceiling-light core keep-out).
- Files: `apps/editor/src/ui/office-building/{OfficeBuildingExecutor.ts, officeInteriorFitout.ts
  (NEW pure)}`.

## Amendment (2026-07-01) — Phase 1 of SPEC-OFFICE-GENERATION-ENGINE · architecture/furnish SPLIT · full core services · circulation-first floor · facade+glass colour

| Field | Value |
|---|---|
| Tags | §OFFICE-ARCH-FURNISH-SPLIT, §OFFICE-CORE-SERVICES, §OFFICE-CIRCULATION-FIRST, §OFFICE-FACADE-GLASS-COLOUR |
| Governs | `docs/02-decisions/specs/SPEC-OFFICE-GENERATION-ENGINE.md` (P1: §1–§4, §9 steps 1–6) |

### Context

The founder ratified the canonical **SPEC-OFFICE-GENERATION-ENGINE** (a best-in-class generative
office engine). Phase 1 implements the ARCHITECTURE/FURNISH split, the full core services, the
circulation-first floor algorithm, the AI-dropdown commands, the preview toggle, and per-founder
façade + glass colour pickers. The §OFFICE-INTERIOR-FITOUT amendment above emitted loose furniture
DURING Build — SPEC §1 requires architecture and furnishing to be TWO independent systems.

### Decision

1. **§OFFICE-ARCH-FURNISH-SPLIT (SPEC §1/§2)** — Command 1 (`OfficeBuildingExecutor.execute`) now
   emits **ARCHITECTURE ONLY** (slabs · perimeter/external walls · internal partition walls · roof ·
   doors · curtain glazing · structural core · lift shafts · staircases · toilets · accessible WC ·
   kitchenette + support/plant/storage rooms · circulation corridors · glazed office enclosures). ALL
   loose furniture (desks · chairs · reception · collab · cafe · meeting furniture · downlights ·
   floor finishes) MOVED OUT of Build into **Command 2 = Furnish Office** (`officeFurnish.ts` +
   `officeFurnishTrigger.ts`), which reads the architecture Command 1 stashed (`officeBuildContext.ts`)
   and populates it WITHOUT regenerating architecture. Registered as `pryzmFurnishOffice()` (console)
   + a **"Furnish Office" AI-dropdown** entry; **"Generate Office Architecture"** was also added to the
   dropdown. A **preview toggle** on `renderOfficeProgramStep` ("Architecture Only ↔ Architecture +
   Interior", default Architecture Only) threads through `buildDirect(..., { withInterior })` →
   `execute(..., { withInterior })` so "+ Interior" furnishes in the same build.
2. **§OFFICE-CORE-SERVICES (SPEC §3 — never empty core)** — the core now ALWAYS carries a main
   switchback (U) `CreateStairCommand` + a fire-escape stair (run OPPOSITE the main run) + ≥1 lift
   `CreateVerticalCirculationCommand` (2-car bank on large/very-large floors) + a fire-rated lobby,
   PLUS a toilet/service block (male · female · accessible WC · cleaning closet · service shaft) whose
   **cubicle counts SCALE by floor size** (`cubiclesPerGender`: small=2 · medium=3–4 · large=5+ ·
   very-large by occupant load ≈ 1/10 m² NIA). Emitted on the DETAILED floors (ground + representative)
   so a tall tower stays performant.
3. **§OFFICE-CIRCULATION-FIRST (SPEC §4/§9 steps 1–6)** — `planOfficeFloorArchitecture` SOLVES
   CIRCULATION BEFORE ROOMS by construction: GFA + core (steps 1–2, upstream) → **primary + secondary
   circulation + escape spokes (step 3)** → **support rooms (meeting/kitchenette/storage/plant, step
   4)** → **internal partitions + glazed office enclosures (step 5)**. The ordered pipeline is proven
   by the `§DIAG-OFFICE-CIRCULATION-FIRST` diagnostic (tested: 3→4→5). Partitions land via
   `wall.batch.create`; glazed enclosures via `CreateCurtainWallCommand`.
4. **§OFFICE-FACADE-GLASS-COLOUR (founder)** — TWO colour pickers on the office preview panel,
   mirroring the residential `§RESI-FACADE-COLOUR` swatch row: **Façade colour** (`materialColor` on
   perimeter/core/partition/toilet walls + roof) and **Glass colour** (NEW — `glazingColor` on the
   glazed-office curtain walls + the perimeter window glazing, since the office is heavily glazed).
   Threaded `officeBuildingTrigger → OfficeBuildingController → OfficeBuildingExecutor`. Defaults
   (façade warm-white, glass `#9bc8e4`) reproduce the current look when absent.
5. **Phase 2 (deferred)** — the MODULAR Furnish Office engine (SPEC §5/§6 module library +
   occupancy-driven placement §8 + circulation clearances §7 + final validation §9 7–8) is a later
   run. Phase 1 ships only the L2 seam `packages/ai-host/src/workflows/officeFurnish/` (module-type
   vocabulary + `estimateOccupancy`); Command 2 currently MOVES the existing furniture into the
   command rather than rewriting it.

### Consequences

- Command 1 emits architecture only; Command 2 (`pryzmFurnishOffice`) furnishes it — architecture
  never regenerates on furnish. The office is now the FIRST typology with a clean generate-vs-furnish
  split (a template for the others).
- NEW pure modules (unit-testable in Node): `officeCorePlan.ts` (core services + circulation-first
  planners), and `packages/ai-host/src/workflows/officeFurnish/officeModuleLibrary.ts`.
- Tests: `apps/editor/__tests__/OfficeCorePlan.test.ts` (12 cases — cubicle scaling small/medium/
  large/very-large · never-empty core · 2-car bank on large · circulation-BEFORE-rooms order ·
  support/glazed inboard of glass) + `packages/ai-host/src/workflows/officeFurnish/__tests__/
  officeModuleLibrary.test.ts` (occupancy estimator).
- Files: `apps/editor/src/ui/office-building/{OfficeBuildingExecutor.ts, OfficeBuildingController.ts,
  officeBuildingTrigger.ts, officeCorePlan.ts (NEW), officeFurnish.ts (NEW), officeFurnishTrigger.ts
  (NEW), officeBuildContext.ts (NEW), officeInteriorFitout.ts (furniture math retained for Command 2)}`,
  `apps/editor/src/ui/onboarding/OnboardingStepController.ts` (office step toggle + colour pickers +
  generateOffice threading), `apps/editor/src/ui/layout/AIAreaLayout.ts` (console register),
  `apps/editor/src/ui/ai/AIPanel.ts` (dropdown entries), `packages/ai-host/src/workflows/officeFurnish/*
  (NEW)`, `packages/ai-host/src/index.ts` (exports).

## Amendment (2026-07-01) — §OFFICE-CORE-REAL-CIRCULATION · §OFFICE-CIRC-RBL-PLACEMENT · §OFFICE-CORE-WALL-INNER-COLOUR

Three founder fixes to the office CORE, all mirroring the PROVEN residential building (`Residential
BuildingExecutor._createCore`) rather than reinventing:

1. **§OFFICE-CORE-REAL-CIRCULATION** — the founder: "we need the REAL stair (check the residential
   building) placed in the core + a real vertical-circulation LIFT (check the residential building)."
   The shipped core emitted a decorative ONE-STOREY stair (`baseLevelId === topLevelId`) on only the
   two detailed floors — not a continuous run. `_buildCoreServices` now mirrors residential
   `_createCore`: it emits a REAL `CreateStairCommand` switchback (main **+** fire-escape, remote
   second egress) per **adjacent minted-level pair** (ground→1, 1→2, … top−1→top) so vertical
   circulation is CONTINUOUS to roof access, and ONE `CreateVerticalCirculationCommand` **lift cab per
   level** spanning ground→top (visible on every floor, top floor gets the one-storey fallback cab).
   The stair now spans a real pair, so `CreateStairCommand.autoCreateOpening` is re-enabled (the slab
   void is punched in the UPPER floor — you walk up THROUGH it) and the recorded `recordStairVoid`
   cuts the floor finish over that same opening, exactly like the residential core. The stair riser
   count is derived into the command-valid `[0.15, 0.19]` band per flight so `CreateStairCommand` never
   silently blocks. Stair footprint sizing reuses `computeStairFootprintRect` from `@pryzm/geometry-
   stair` (the same helper residential uses). Nesting: the whole core-service pass runs AFTER the
   structural `runBatch` has closed, so its `cm.execute` / `runBatch` calls are top-level (never nested
   inside an already-open batch — the "runBatch called while already batching" warning cannot occur
   here).

2. **§OFFICE-CIRC-RBL-PLACEMENT** — the founder: hundreds of `office-circ` circulation-ring
   RoomBoundingLines rendered with `placement.start/end === undefined`, so every one was SKIPPED by the
   renderer's §RBL-PLACEMENT-GUARD and the circulation corridors never rendered. ROOT CAUSE: the
   circulation-ring pass built its 32-gon outline INLINE and pushed `{start,end}` verbatim — the ONLY
   office RBL emission that BYPASSED the §RBL-PLACEMENT-AT-SOURCE guard (`ringPlanSegments`) that every
   other office RBL routes through (zone lines `office-rbl-`, rect rooms `office-room-`). A ring on a
   collapsed radius (innerR === outerR, or a clamped/degenerate zone radius) minted coincident-vertex /
   zero-length edges whose placement round-tripped to undefined. FIX (at the SOURCE, the ADR's
   canonical rule): a NEW pure `circulationRingSegments(ring)` in `officeCorePlan.ts` builds each ring's
   inner + outer outline and routes EVERY edge through the SAME `ringPlanSegments` finite-endpoint +
   non-degenerate (≥ 10 mm) guard, dropping any non-positive/non-finite radius. Every emitted
   `office-circ-` line now carries a REAL, finite `placement.start/end` → the guard never skips it →
   the corridors render.

3. **§OFFICE-CORE-WALL-INNER-COLOUR** — the RC core enclosure walls (around the stair/lift/WC shaft)
   were painted with `facadeColor`. They are INTERIOR partitions, so they now read the **inner-wall
   colour** (`innerWallColor`, the picker the previous core agent added), matching the interior
   partitions — `facadeColor` stays on the EXTERNAL shell + roof only, `glassColor` on the glazing.
   The toilet/service + floor partitions already read `innerWallColor`; this brings the core enclosure
   into line.

- Tests: `apps/editor/__tests__/OfficeCorePlan.test.ts` extended — `circulationRingSegments` always
  yields defined + finite + non-degenerate `start`/`end` (the exact §RBL-PLACEMENT-GUARD invariant),
  drops collapsed/non-positive radii, and every real planner ring yields defined-placement segments;
  plus the plan always carries placeable main-stair + fire-stair footprints and ≥1 lift footprint (the
  inputs the executor's `CreateStairCommand` / `CreateVerticalCirculationCommand` consume).
- Files: `apps/editor/src/ui/office-building/{OfficeBuildingExecutor.ts, officeCorePlan.ts (+
  `circulationRingSegments`)}`, `apps/editor/__tests__/OfficeCorePlan.test.ts`.
