# Vestidor (closet) — pre-build audit vs the live engine (2026-06-21)

Per SPEC-CLOSET-VESTIDOR's instruction to restate the typology split + Phase gating and **flag any
conflict with the real codebase before writing code**. No code written yet — this audit gates the build.

## Restated scope (confirmed understanding)
- **Typology A — Corridor closet**: furnish-layer only, furnishes an *existing* circulation zone
  between a resolved bedroom and its resolved ensuite. No new room/wall/door. Kitchen-planner-shaped.
- **Typology B — Private room closet**: pipeline-layer; a *new* enclosed room carved from the
  bedroom (one new wall + one bedroom-only door + a new `ProgramRoom`/`LayoutRoom`). Upstream near
  `subdivide.ts`/`wallsAndDoors.ts`, mirroring the master→ensuite carve. NOT a furnish-layer hack.
- **Gating**: Phase 1 (A) only, browser-confirmed on ≥3 houses, before Phase 2 (B) starts.

## 🚩 BLOCKING CONFLICT — Typology A's zone does NOT exist in the current engine
- **Ensuites are carved directly out of the host bedroom and share a wall → a DIRECT door**
  (`programRules.ensuite.accessFrom = ['master']`; `tryCarveEnsuiteFromMaster`, `subdivide.ts:1079`).
  There is **no corridor segment threaded between a bedroom and its ensuite** — the ensuite opens
  straight off the bedroom.
- **The furnish layer furnishes one ROOM at a time** (`furnishRoom(input: FurnishRoomInput)`), and a
  **`corridor`-type room furnishes to `[]`** (`furnishRoom.ts:3`). There is no "sub-zone between two
  rooms" input; the planner only ever sees a single room's walls/doors/windows.

**Consequence:** SPEC §3's `ClosetZoneInput` ("the circulation corridor between bedroom and ensuite,
its two bounding wall runs, its length, clear width, door swings at both ends") has no source in the
engine. Typology A as written would furnish a zone that is never generated. The §2.4 gate
("requires an already-resolved ensuite adjacency … bedroom↔bathroom flagged isEnsuite") will match,
but the matched adjacency is a **single shared wall + door**, not a threadable corridor.

### Three ways forward (founder decision — this is C.7 #1 & #2 with real data)
1. **Redefine Typology A as a bedroom wardrobe-RUN** — furnish closet modules along the host
   bedroom's own free wall(s) (the room the furnish layer actually receives), gated on
   area ≥ 20.25 m². This IS kitchen-planner-shaped and buildable now as `closetPlanner.ts`. ⚠ It
   overlaps the EXISTING wardrobe module (`wardrobeLayout.ts`) — resolve overlap first (is this a
   richer replacement, or a distinct "dressing run" archetype?).
2. **Skip A, go to Typology B** (the genuine private dressing room — carve from bedroom). This is the
   architecturally-honest "vestidor" but it is Phase 2 (pipeline carve, room-graph mutation,
   higher risk) — contradicts the "Phase 1 first, lowest risk" gating.
3. **Make the engine thread a corridor** between bedroom↔ensuite when a vestidor is wanted (a
   pipeline change to insert a circulation zone) — this is *also* upstream/pipeline work, not
   furnish-layer, so it's not the low-risk Phase 1 either.

**Only option 1 is a low-risk, furnish-layer, build-now Phase 1** — and it needs the wardrobe-overlap
decision. Options 2 & 3 are pipeline work (Phase 2 class).

## Secondary signature notes (so the build matches reality, not the spec's assumptions)
- **Validation/scoring live in `furnishLayout/rules/`, not inline.** Kitchen uses
  `rules/kitchenValidation.ts` (`validateKitchenLayout`, `formatKitchenViolations`) +
  `rules/kitchenScoring.ts` (`scoreKitchenLayout`, `formatKitchenScore`) + `rules/ruleSchema.ts`
  (`LayoutScore`). A closet build should add `rules/closetValidation.ts` + `rules/closetScoring.ts`,
  not inline gates.
- **Real helpers to reuse (not reinvent):** `runWalls(input)`, `perpendicular(a,b)`, `buildChain(walls,n)`,
  `chooseShape(input, walls, pref)`, `canHostL/canHostU` (`kitchenLayout.ts`); `wallDir/wallMid/
  yawFromNormal/wallHasDoor/wallHasWindow` (`wallAnalysis.ts`); `quadInPolygon/quadOverlapsAny/
  footprintCorners/Quad` (`collision.ts`); `footprintOf` (`footprints.ts`); `doorObstacles` lives in
  `placeSolver.ts` + a mirror in `kitchenLayout.ts`.
- **Types** (`furnishLayout/types.ts`): `FurnishRoomInput`, `PlacedFurniture`, `Pt`, `RoomWallSeg`,
  `FurnitureKind`. There is NO `ClosetZoneInput` type and no "between-two-rooms" furnish input — a new
  zone type would be a new concept, not an existing one.
- **`generateAndRank`** (`kitchenLayout.ts:514`) is kitchen-specific today; the spec's suggestion to
  generalise it to take a `planClosetSingle` callback is sound but is a refactor of a shared
  primitive — do it deliberately, with the kitchen tests as the regression gate.
- **New `FurnitureKind`s** (closet hang/drawer/shoe/mirror/bench) must be added to the
  `FurnitureKind` union + `footprints.ts` catalogue + the `furnishRules` spec↔footprint pin test
  (the lone currently-failing `furnishRules` test already guards kind↔footprint dimension parity).

## Recommendation
**Do not start coding Typology A as specced** — its zone doesn't exist. Get the founder's pick among
options 1–3 (and, if option 1, the wardrobe-overlap resolution). Until then this stays a queued,
no-code item. The restate + this audit is the low-risk deliverable; the build waits on the decision.
