# ADR-0073 — Hierarchical Access Graph & Corridor-as-Spine Engine
# (D-TGL §P3c+ / C53 §13 / tracker §52.7)

- **Status:** Proposed (2026-06-21) · Reviewer assessment added 2026-06-21
- **Layer:** L2 pure engine + L3 orchestration bridge
  `packages/ai-host/src/workflows/apartmentLayout/tgl/`
  `packages/ai-host/src/workflows/houseLayout/`
  `packages/ai-host/src/workflows/residentialBuilding/` ← NEW

---

## ⚑ Reviewer assessment (Claude, 2026-06-21) — READ BEFORE IMPLEMENTING

**Verdict: the DIRECTION is correct and endorsed; ONE part needs a technical correction, and the
rollout must be incremental, not big-bang.**

**1. Endorsed — corridor-as-spine is the right inversion.** This matches the independent root-cause
the live audit reached (the comb lays rooms off one straight face and falls back to squarify, which
has no corridor-adjacency guarantee → sealed back rooms; see
`circulation-first-class-lu-corridor-2026-06-21.md` and the ADR-0068 INV-3 gap). The corridor being a
*side effect of squarify* rather than its *cause* is the documented root of the sealed-room class.

**2. CORRECTION — Part B must be FOOTPRINT-driven, not CENTROID-driven.** As written, Part B's
`deriveCirculationPath(shell, stairAnchor, privateRooms[targetCentroid], minWidth)` routes the MSP
"within minWidth/2 of every private room CENTROID." But the current engine derives room positions
*from* subdivision — there is **no pre-subdivision bubble-graph embedding** that yields per-room
centroids. Routing the corridor to centroids that don't exist yet is a chicken-and-egg
(corridor←centroids←subdivision←corridor), and `effectivePlateArea = plateArea − corridorArea` has the
same circularity (corridorArea depends on the path which depends on room positions). **Finch does NOT
do this** — the ADR's own Context §1 says the spine is "derived purely from the building footprint's
long axis; it is not sized from programme," and Part D's `deriveBuildingSpine` correctly uses the
footprint medial axis. Make Part B consistent with Part D: **derive the corridor from the SHELL
(medial axis / long-axis strip, L/U following the plate arms), inflate to minWidth, then pack rooms
into shell−corridor.** Rooms then border the corridor *by construction* — no centroids, no
circularity, simpler, and it matches Finch. (The just-landed `planLCorridorComb` is exactly this
model at the comb scale: it slices rooms off two perpendicular corridor legs without any centroid.)

**3. Rollout — incremental, NOT big-bang.** The Phase-1 checklist replaces `buildBubbleGraph` +
`subdivide` corridor handling + the executor + room detection in one sweep against an apartment
generator with years of accumulated tuning (dozens of tracked fixes in the comb / spanning-corridor /
squarify family). A wholesale swap risks regressing the many working cases to fix the failing ones.
Sound sequence: (a) DONE — `planLCorridorComb` + `§HORZ-SHARED-WALL-FIX` (L-corridor + the
horizontal door-detection bug, both shipped/tested); (b) build `deriveCirculationPath` as a PURE,
STANDALONE footprint-driven primitive with its own RED→GREEN tests, NOT yet wired; (c) wire it as an
ADDITIVE candidate that competes with the existing carve on the connectivity gate (selected only when
it produces ≥ as-connected a result), so every plate where today's carve already works is
byte-identical; (d) only after it dominates, retire the old paths. Each step independently shippable,
full `house*.test.ts` green between steps, founder visual sign-off before any deploy (as the ADR
already mandates).

**4. Parked correctly:** polygon-native subdivision (§Open architecture question) stays out of scope —
agreed; the residual after an axis-aligned corridor is rectangulable for Phase 1/2.

The rest of the ADR (HAG data model, Part C unit-entry bridge, Part D building orchestrator, the
executable test contract, the diagnostics) is adopted as written, with Part B amended per §2 above.

---

## Context — the Finch benchmark, precisely

From the three supplied images, Finch's residential building generator does, in order:
1. **Places the corridor spine first** — a connected line running the building's structural bay,
   branching at L/T/U junctions, fixed width (≥1.2 m clear), **derived from the footprint long axis,
   not from programme.**
2. **Places cores as hub nodes** on the spine at ≤30 m fire-escape intervals (UK/EU). Each core = stair
   + lift + lobby, placed before any unit is assigned to its bay.
3. **Places unit front-door nodes** off the spine — one per unit, alternating both sides
   (double-loaded). The front door is the edge from building graph → unit sub-graph.
4. **Generates each unit's internal layout** as a separate sub-graph pass (D-TGL per unit, front door
   fixed on the corridor wall).
5. **Renders the bubble-graph overlay** as a two-level tree: spine → unit entries → unit rooms.

The critical fact: **in Finch the corridor is never a room to be packed** — it is the skeleton from
which rooms hang (C53 §13.A Layers 3–4). PRYZM today inverts this: `subdivide.ts` gives the corridor a
bubble area weight and packs it in the squarify step, so its position is a side effect, not a cause.
Every downstream failure (disconnected hall, sealed bedroom, stair-to-corridor gap, L-plate orphaned
arm) traces to this inversion.

## Decision

### Part A — HAG: the Hierarchical Access Graph
The canonical structure governing layout at every residential scale:
```
BUILDING LEVEL (new — ResidentialBuildingLayout)
  SpineNode[]      ← the corridor as a first-class graph object
  CoreNode[]       ← stair + lift + lobby, hub on the spine
  UnitEntryNode[]  ← front-door position, one per unit, child of SpineNode
UNIT LEVEL (existing D-TGL, reframed)
  RoomNode[]       ← existing ProgramRoom, children of UnitEntryNode
  AdjacencyEdge[]  ← existing bubble graph edges
  CirculationNode  ← hall/landing/corridor WITHIN the unit, DERIVED (not a packed room)
```
Directed graph, edges public→private: `SpineNode → UnitEntryNode → CirculationNode → RoomNode`, an
edge only where `programRules.ts` permits a door. The HAG is the editable object (C52): drag a wall →
HAG node updates → geometry re-projects; change a slider → RoomNode added/removed → re-pack.

### Part B — Corridor as a derived spine (the core engine change) — AMENDED (see Reviewer §2)
The corridor/landing/hall-within-unit MUST be derived geometrically from the **shell footprint**
(medial axis / long-axis strip; L/U following the plate arms), inflated to `CORRIDOR_MIN_W`, with the
**stair keep-out / unit-entry point as the anchor the spine must reach**. Rooms then pack into
`shell − corridor`, so every room borders the corridor by construction. New order:
```
AFTER:  deriveCirculationPath(shell, stairAnchor/entry, minWidth) → corridor polygon
        → squarify packs rooms into the RESIDUAL (shell − corridor)
        → every room has a corridor-adjacent wall by construction
        → stair is the anchor ⇒ corridor-adjacent by construction
```
1. `buildBubbleGraph` (P2): the corridor is no longer a `ProgramRoom` with `areaWeight`; it becomes a
   `CirculationPath { minWidth, servedRooms[], anchorNode }`.
2. `deriveCirculationPath` (new, footprint-driven): construct the spine from the shell + anchor;
   inflate; clip. Replaces `tryCarveCorridor` / `tryCarveDoubleLoadedCorridor` /
   `tryStairSpanningCorridor` (which *searched* for the corridor by trial subdivision).
3. `subdivideWithReport` (P3): receives shell with the corridor already subtracted; packs only rooms.
4. `finalise`: remove `orientCorridorToKeepOut` (compensation no longer needed).
5. `wallsAndDoors` (P4): the corridor has door-length walls to every served room by construction;
   `§CIRCULATION-REROUTE` retained as a safety net that should fire zero times.

### Part C — Unit entry as a HAG edge (house ↔ building bridge)
```typescript
interface UnitEntryNode { id; position: Point; facingWall: WallSegment; connectedSpineNode?: string }
```
Single house: `facingWall` = exterior shell wall (front door); the internal hall+corridor derive from
this entry as the MSP anchor on the ground floor. Apartment unit: `facingWall` = the corridor-facing
wall. The unit generator never knows whether it sits in a house or a building — the HAG contract is
identical.

### Part D — ResidentialBuildingLayout orchestrator (the multi-apartment goal)
New `packages/ai-host/src/workflows/residentialBuilding/`: `buildingOrchestrator.ts`,
`buildingSpine.ts` (`deriveBuildingSpine` — footprint medial axis → `SpineNode[]`),
`corePlacement.ts` (`placeCores` — fire-escape intervals), `unitStackAssignment.ts`
(`assignUnitsToBays` — programme → unit types), `unitGenerator.ts` (D-TGL per unit with the
`UnitEntryNode` constraint), `buildingHAG.ts` (the HAG + serialisation to `SemanticLayoutGraph`).

## Consequences
**Positive:** closes the sealed-room class for houses (corridor touches every room by construction);
closes stair-to-corridor disconnection (stair is the anchor); closes the L-plate secondary-arm
white-space (the spine follows both arms); closes the hall-hinge cavern rejection (hall is part of the
circulation geometry, not in the squarify competition); unlocks residential-building generation;
matches Finch's architecture while keeping PRYZM's generative-per-unit + deterministic + editable
advantages.

**Costs / risks:** `deriveCirculationPath` is new geometry in the most defect-prone path → test-first,
use `geometry-wall` polygon utilities; ~25 house golden tests re-baseline with **human visual
sign-off** (no auto-deploy); area budget shifts (`effectivePlateArea = plateArea − corridorArea`) →
`scaleProgramToShell` must subtract the corridor; executor must emit `CirculationPath` as walls (not a
room) and `RoomDetectionEngine` must exclude circulation polygons; `§DIAG-EXEC-ROOMS` recalibrated to
count circulation paths separately; phased delivery to protect CI.

## Executable contract (test-first, mandatory — RED before implementation)

### Phase 1 — Single-house corridor derivation — `packages/ai-host/__tests__/houseCorridorDerived.test.ts`
- rectangular plate: corridor touches every private room (within minWidth/2); stair is the anchor (≤0.1 m).
- L-plate: corridor follows BOTH arms (`path.isLShaped === true`); every room within minWidth/2.
- derived corridor guarantees a door-length wall (≥ MIN_DOOR_WIDTH) for every private room.
- hall anchored at the unit entry node (≤2 m of the front door), not floating.
- stair-to-corridor shared wall ≥ MIN_DOOR_WIDTH.
- no sealed habitable rooms on FOUNDER_BRIEF_2BED.

### Phase 2 — Building spine — `packages/ai-host/__tests__/residentialBuildingSpine.test.ts`
- rectangular building: spine on the centreline; L-building: spine branches at the junction.
- cores within fire-escape distance (≤30 m) on a long bar; ≥2 cores.
- every unit bay has a door-facing wall onto the corridor; no sealed rooms within any unit.

### Phase 3 — No-regression + deployment gate
Full `ai-host` suite green (2650+); founder visual sign-off on a 2-bed, a 3-bed, and an L-plate house;
`§DIAG-EXEC-ROOMS sealedRooms=0` in the browser for each. No Phase-3 commit auto-deploys.

## Implementation checklist (ordered, one PR per phase)
**Phase 1** — RED tests → `deriveCirculationPath` (footprint-driven, L-support) → bubble graph emits
`CirculationPath` → subdivide subtracts it → `scaleProgramToShell` corridor-aware → remove
`orientCorridorToKeepOut` → executor emits CirculationPath as walls → room detection excludes it →
`§DIAG-EXEC-ROOMS` recalibrated → GREEN → full suite → re-baseline with visual sign-off → founder
verifies 2-bed / 3-bed / L-plate.
**Phase 2** — RED tests → `residentialBuilding/` (`buildingHAG`, `buildingSpine`, `corePlacement`,
`unitStackAssignment`, `unitGenerator`, `buildingOrchestrator`) → GREEN → founder verifies 8-unit bar
+ L-block.
**Phase 3** — full suite green → founder sign-off → `§DIAG-EXEC-ROOMS sealedRooms=0` → update
`layout-generation-algorithm.md` + `C53 §3` + mark `ADR-0072` SUPERSEDED-IN-PART.

## PRYZM vs Finch — the moat
Finch's "Plan Library" requires the architect to pre-draw + upload every unit type; the system selects
and places pre-drawn plans. PRYZM's D-TGL **generates** the unit interior from a brief — so it handles
briefs that match no pre-drawn plan, varies unit layouts per bay, and regenerates on a changed
programme. Same graph-is-engine architecture, plus generative per-unit + deterministic byte-identity +
editor integration.

## Diagnostics
`§DIAG-HAG-SPINE`, `§DIAG-CIRCULATION-PATH` (pathType straight/L/T), `§DIAG-CORRIDOR-DERIVED`
(corridorArea / effectivePlate / corridorFrac — replaces `§DIAG-BRANCH`), `§DIAG-UNIT-ENTRY`,
`§DIAG-SEALED-POST-HAG` (must be empty).

## File index
HAG `…/residentialBuilding/buildingHAG.ts` · spine `…/buildingSpine.ts` · cores `…/corePlacement.ts`
· unit assign `…/unitStackAssignment.ts` · unit gen `…/unitGenerator.ts` · orchestrator
`…/buildingOrchestrator.ts` · corridor derivation `…/apartmentLayout/tgl/circulationPath.ts` (new) ·
bubble graph `…/tgl/bubbleGraph.ts` · subdivide `…/tgl/subdivide.ts` · executor
`apps/editor/src/ui/house-layout/HouseLayoutExecutor.ts` · room detection
`apps/editor/src/ui/apartment-layout/nameDetectedRooms.ts` · diagnostics
`apps/editor/src/ui/house-layout/houseExecDiagnostics.ts` · Phase-1 tests `houseCorridorDerived.test.ts`
· Phase-2 tests `residentialBuildingSpine.test.ts`.

---
*ADR-0073 — Hierarchical Access Graph & Corridor-as-Spine Engine · Status: Proposed 2026-06-21*
*Supersedes in part: ADR-0072 P3c (absorbed into HAG MSP) · Extends: ADR-0066, ADR-0068 §FG7,
ADR-0069, C53 §§1, 3, 13 · Author: founder + Claude (PRYZM agent); Part B amended per reviewer §2.*
