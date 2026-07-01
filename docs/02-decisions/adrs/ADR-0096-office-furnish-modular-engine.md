# ADR-0096 — Modular Furnish Office engine (Phase 2 of SPEC-OFFICE-GENERATION-ENGINE)

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-01 |
| Owner | Office generation (`apps/editor/src/ui/office-building`, `packages/ai-host/src/workflows/officeFurnish`) |
| Builds on | ADR-0092 (office typology · §OFFICE-ARCH-FURNISH-SPLIT Phase 1) |
| Governs | `docs/02-decisions/specs/SPEC-OFFICE-GENERATION-ENGINE.md` (Phase 2: §5 module library · §6 glazed enclosures · §7 clearances · §8 occupancy · §9 steps 7–8 · §11 component quality) |
| Tags | §OFFICE-FURNISH-MODULAR, §DIAG-OFFICE-FURNISH-VALIDATION |
| Contracts | P2 (no `import * as THREE`) · P6 (mutation via the command bus — `CreateFurnitureCommand`) · P8 (the pure L2 engine is span-free pure functions; the editor `execute` span already owns the boundary) |

## Context

ADR-0092 shipped Phase 1: Command 1 (Generate Office Architecture) emits architecture only, and
Command 2 (`pryzmFurnishOffice`) MOVED the old in-Build furniture into a separate command — but its
placement was still the Phase-1 radial desk grid (individually-placed desks + a few meeting/cafe
clusters), NOT the SPEC §5 modular system. SPEC §5 requires a MODULAR engine: reusable modules
snapped to the circulation grid, occupancy-driven (§8), respecting clearances (§7), with a final
egress/clearance validation (§9 steps 7–8).

## Decision — §OFFICE-FURNISH-MODULAR

A new PURE L2 engine in `packages/ai-host/src/workflows/officeFurnish/` composes reusable modules and
places them; the editor-side Command 2 maps each placed item to a `CreateFurnitureCommand` (P6). The
Phase-1 module-type vocabulary + `estimateOccupancy` are KEPT and extended.

### Module library (SPEC §5 / §11) — `moduleRecipes.ts`

Nine module recipes, each a pure function `(cx, cz, rotY, …) → PlacedModule` composing the §11
component library from the EXISTING `FurnitureType` vocabulary (no new element types):

| SPEC §5 module | Composition | Notes |
|---|---|---|
| Single workstation | `desk` + `desk_chair` + monitor + pedestal | atomic top-up unit |
| Linear workstation | N × desk-unit in a row + privacy screen | |
| Bench workstation | 2 back-to-back rows sharing a spine screen + end planters | the open-plan workhorse |
| Collaborative block | sofas + `coffee_table` + wall screen + whiteboard + plants | |
| Meeting-room block | `table` + chairs (3/side) + `tv` + whiteboard + `sideboard` | |
| Executive office | large `desk` + visitor chairs + `sideboard` + meeting table + plant | fills a glazed enclosure (§6) |
| Phone booth | compact `desk` + `desk_chair` + `lamp` | acoustic pod (§6) |
| Kitchen block | `kitchen_straight` + `kitchen_island` + `fridge` + high `table` + stool `chair`s + plant | |
| Breakout block | `sofa_3seat` + `lounge_chair`s + `coffee_table` + `side_table` + plants | |

All nine ship complete — none deferred.

### Occupancy → module mix (SPEC §8) — `occupancyPlan.ts`

`planModuleMix(usableAreaM2)` estimates occupancy (~1/10 m², KEPT from Phase 1) and scales the module
counts to workplace benchmarks: ~1 meeting room / 18 people · 1 phone booth / 14 · 1 exec office / 25
(≥20 occ) · 1 collaboration setting / 20 · 1 breakout / 40 (≥20 occ) · 1 kitchenette / floor. A
`desksTargetOverride` caps desks to the plate's engine desk budget (perf) while amenity ratios still
scale to occupancy. Everything scales — no fixed layouts.

### Placement engine (SPEC §5/§6/§7) — `furnishPlanner.ts`

`planFloorFurnish(input)` for one floor:
1. Fills the open-plan band with BENCH rows on concentric radial shelves, benches oriented TANGENT to
   the ring (aligned to the band), packed at `deskClearance` spacing up to the desk budget. A bench
   that would clash a keep-out degrades to a linear row, then a single desk, then is skipped.
2. Drops collaboration + breakout blocks at the band edges (occupancy-scaled).
3. Places meeting / executive / phone-booth / kitchen modules into the architecture's SUPPORT ROOMS +
   GLAZED ENCLOSURES (glazed-exec → executive office, glazed-focus/interview → phone booth — SPEC §6).
4. Scatters a deterministic biophilic planting layer, seeded by floor index (reproducible).

Every candidate module is validated against the keep-outs BEFORE it is kept, so the output is
clearance-clean by construction.

### Clearances + final validation (SPEC §7 + §9 steps 7–8) — `clearanceValidation.ts`

`CLEARANCES` encodes §7 (main 1.8–2.4 m · secondary 1.2–1.5 m · desk 0.9–1.2 m · meeting ≥1.0 m). The
keep-out model is the circulation annuli (primary/secondary corridors around the core / at the
perimeter) + the axial fire-egress spokes the circulation-first architecture laid FIRST. `validateFurnish`
samples each module's bbox against the keep-outs (core disc, glass, annuli, spokes) and reports
violations + the tightest clearance + a `§DIAG-OFFICE-FURNISH-VALIDATION` one-line summary (logged by
the editor after placement). The engine produces ZERO violations by construction; the validator is the
assertion (and the test hook).

### Glazed enclosures (SPEC §6)

Phase 1's circulation-first architecture (`planOfficeFloorArchitecture`) already emits the glazed
executive/focus/interview enclosures as `CreateCurtainWallCommand` chord walls. Phase 2 does NOT
re-create them — it PLACES the exec/booth modules INTO those existing glazed rooms (the context threads
the enclosure rects + kinds from Command 1). No new glazing is emitted by the furnish pass (architecture
is never regenerated — SPEC §1).

### Editor seam

`officeBuildContext.ts` is enriched: Command 1 now stashes the usable area, the primary/secondary
circulation annuli, the escape-spoke headings, and the support-room + glazed-enclosure rects. Command 2
(`officeFurnish.ts`) reads them, drives `planFloorFurnish` for the representative office floor + ground
floor, and emits each `PlacedItem` as a `CreateFurnitureCommand` in deferred `skipRedetectRooms` /
`skipPbrUpgrade` batches (same perf pattern as Phase 1). The ground reception + cafe + ceiling
downlights + floor finishes are kept (finish upgraded to warm timber per §11). Only the ground +
representative floors are detailed; other floors stay shell (perf).

## Asset dependency (FLAGGED, not fixed) — OBJECT-STORAGE-GLB

The engine work (module COMPOSITION + placement + quantities) is complete. The reference
Steelcase/Herman-Miller-grade LOOK additionally depends on the curated GLB furniture catalog, which in
prod 404s (the 185 MB `/items/*.glb` catalog is `.dockerignore`d out of the image — tracker
OBJECT-STORAGE-GLB), so furniture renders as PLACEHOLDER geometry until those GLBs are re-hosted on
object storage and referenced by the `FurnitureType` entries the engine emits. That is asset/hosting
work, out of scope for this engine ADR.

## FurnitureType substitutions (no new element types were invented)

The engine names only existing `FurnitureType`s; where a bespoke office SKU is missing it substitutes
the nearest existing type:
- **Monitor / wall screen / TV** → `tv` (no dedicated `monitor` type).
- **Privacy screen / whiteboard / pegboard** → `wall_art` (thin wall-mounted slab family).
- **Mobile storage pedestal** → `bookshelf`; **credenza / storage** → `sideboard`.
- **Coffee-machine / microwave counter** → `base_unit`; **cabinetry run** → `kitchen_straight`.
- **Acoustic pod shell** → not modelled as furniture (the enclosure is the Phase-1 glazed room); the
  booth places `desk` + `desk_chair` + `lamp` inside it.

## Consequences

- Command 2 now produces an occupancy-scaled MODULAR fit-out (bench/linear/single workstations +
  collaboration + breakout on the open plan; meeting/exec/booth/kitchen in the support + glazed rooms),
  clearance-clean by construction, with a logged `§DIAG-OFFICE-FURNISH-VALIDATION` summary.
- NEW pure L2 modules (unit-testable in Node): `officeModuleTypes.ts`, `moduleRecipes.ts`,
  `occupancyPlan.ts`, `clearanceValidation.ts`, `furnishPlanner.ts` (+ Phase-1 `officeModuleLibrary.ts`).
- Tests: `packages/ai-host/src/workflows/officeFurnish/__tests__/furnishPlanner.test.ts` (11 cases —
  recipe composition · occupancy mix scaling · validation flags corridor overlap · full-floor plan is
  clearance-clean + deterministic). Existing office tests unchanged (22 green).
- Public barrel: `@pryzm/ai-host` exports the recipes + `planModuleMix` + `planFloorFurnish` +
  `validateFurnish` + `CLEARANCES`; the office validation result exports as `OfficeFurnishValidation`
  (the unqualified `FurnishValidation` is taken by the D-FLE per-room validator).
- Files: `packages/ai-host/src/workflows/officeFurnish/{officeModuleTypes,moduleRecipes,occupancyPlan,
  clearanceValidation,furnishPlanner,index}.ts` + `__tests__/furnishPlanner.test.ts`,
  `packages/ai-host/src/index.ts` (exports), `apps/editor/src/ui/office-building/{officeFurnish.ts,
  officeBuildContext.ts, OfficeBuildingExecutor.ts}`.
