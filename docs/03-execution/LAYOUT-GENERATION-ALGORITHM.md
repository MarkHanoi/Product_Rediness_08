# LAYOUT-GENERATION-ALGORITHM.md

**Status:** living reference · **Author:** Claude (PRYZM agent) · **Date:** 2026-06-13
**Scope:** the end-to-end automatic floor-plan generator (apartment + house), the D-TGL
engine, the editor execution/realisation path, the known defects with their root causes,
and the recommended fix roadmap. Written as the capstone of a long debugging session so the
analysis is not lost and a browser-capable continuation can pick it up precisely.

> **Why this doc exists.** Across many test rounds the founder reported recurring defects
> (upper-floor white space, rooms merging, windows between rooms, open corners, doors in the
> wrong room, beds through walls). Several were root-caused to *one* structural cause (the
> stair carve) and to a *systematic engine→execution gap*. This document captures the full
> pipeline, the precise root causes, every fix attempted (and why some had to be reverted),
> and what the correct fix is. **The single most important finding:** unit tests pass on the
> *engine output* but do not exercise the *editor's render of that output*, so a green test
> suite does NOT prove a correct rendered plan.

---

## 0. The two entry points

| Command / surface | Path | Stair? | Notes |
|---|---|---|---|
| `pryzmGenerateApartmentLayout()` / apartment modal | single storey, no vertical core | **No** | One plate, one rect — fills cleanly. The "good" baseline. |
| `pryzmGenerateHouse(n)` / "Design your house" modal | multi-storey, vertical stair core | **Yes** | The stair carve fractures the plate — source of most house-only defects. |

Both share the **D-TGL engine** (`packages/ai-host/src/workflows/apartmentLayout/tgl/`). The
house adds an **orchestrator** (`packages/ai-host/src/workflows/houseLayout/`) that splits the
programme across storeys and reserves the stair core, then calls the same engine per storey.

---

## 1. End-to-end pipeline

```
BRIEF (modal sliders: floors, bedrooms, bathrooms, living/kitchen flags,
       open-plan, master-ensuite, per-room size sliders, daylight/privacy/…)
   │
   ▼
HOUSE ORCHESTRATOR  (houseOrchestrator.ts)            ── HOUSE ONLY ──
   • distribute programme across storeys:
       ground = SOCIAL (living/kitchen/dining/hall) [+ guest bed only if it fits]
       upper  = BEDROOMS + baths (+ ensuite)
       (§DIAG-ALLOC, §HALL-SINGLETON, §PLATE-ROLE density)
   • choose + size the STAIR core, build the keep-out rect
       (§DIAG-STAIR, §DIAG-STAIR-RESERVE, §DIAG-STAIR-FOOTPRINT-RATIO)
   • per storey → generateDeterministicLayouts(shellRect, subProgramme, keepOut)
   │
   ▼
D-TGL ENGINE  per storey, runDeterministicLayout.ts → tries 8 strategies (x/z × fwd/rev × id/mir):
   ├─ P2  buildBubbleGraph (bubbleGraph.ts)
   │       programme → ProgramRoom[] (type, TARGET AREA, isPrivate, needsWindow)
   │                 + adjacency edges (the "bubble diagram")
   │       • scaleProgramToShell — scales bedroom COUNT to the plate (~130 m²/bed apt,
   │         ~45 m²/bed house storey). KEY: per-room SIZE is NOT the lever; the plate is
   │         filled by room COUNT + squarify geometry (see §PLATE-ROLE note in the file).
   │       • per-room target area = areaWeight share, clamped [floor, maxAreaFrac×plate]
   │       (§DIAG-BUBBLE)
   ├─ P3  subdivide (subdivide.ts)   ◄── THE CORE GEOMETRY + the white-space defect
   │       • rectilinear dissection of the shell minus the stair keep-out
   │       • stairCarved ⇒ the plate is an L ⇒ decomposes into DOMINANT + SECONDARY rect(s)
   │         (§DIAG-RECTS areas=[…] dominantFrac=…)
   │       • if dominantFrac ≥ DOMINANT_FRACTION (0.40): trySingleRectCarve(dominant)
   │         — corridor strip + public/private zones, ensuite carved from master
   │         (§DIAG-BRANCH path=carve). ELSE packMultiRect (per-fragment, merge-prone).
   │       • finalise(): corridor physiognomy strip, end-trim, §STAIR-CIRC-FACE reflection
   │         (orientCorridorToKeepOut — makes the corridor abut the stair so the stair can
   │         door onto circulation), §STAIR-OVERLAP-CLIP (no room across the stair).
   │       • claimResidualPlacements: any blank ≥ RESIDUAL_MODERATE_BLANK_M2 (3 m²) is
   │         GROWN into an adjacent grow-eligible room (capped at areaHardMax) or MINTED as
   │         a `utility` "Store" cell (split ≤ ~7.5 m² each) (§DIAG-FILL-RESIDUAL)
   ├─ P4  wallsAndDoors (wallsAndDoors.ts)
   │       • walls from room boundaries; repairSegments welds junctions + DROPS any wall
   │         < WJR_SAFE_MIN_LEN_M (0.50 m)
   │       • DOOR pipeline: bubble doors → permitted-reconcile → over-cap → circulation-
   │         reroute → multihop-BFS, so every habitable room is corridor-reachable
   │         (§DIAG-DOORS, §DIAG-ADJACENCY, §SEALED-ROOMS, §STAIR-DOOR-LANDING,
   │          §STAIR-OPEN-ZONE)
   ├─ P9  emitGeometry (emitGeometry.ts)
   │       • rooms → semantic graph → LayoutRoom[] (adjacentTo from ADJACENT_TO/
   │         CONNECTS_THROUGH edges), walls[], window junction set
   │   + windowEmission/ — one+ window per windowable perimeter room, confined to the
   │       room's OWN segment of the shell wall, centred on the midpoint, in-bounds
   │       (§DIAG-WIN, §WINDOW-SPAN-FIT, §WINDOW-ROOM-PORTION, §WINDOW-IN-BOUNDS-POSTCOND)
   └─ enumerate (enumerate.ts): HARD gates (min-area, mandatory rooms, circulation reach,
           window) + SOFT objective vector (efficiency, adjacency, daylight, circulation,
           corridorInterior, corridorAccess, …) → rank → pick the best (§DIAG-ENUM,
           §DIAG-TOPO-GATE, §DIAG-WINNER, §resolveRoomOverlaps no-overlap net)
   │
   ▼  best ScoredLayoutOption per storey (the MODAL renders THIS — usually correct)
   │
   ▼
EDITOR EXECUTION  (apps/editor/src/ui/house-layout/HouseLayoutExecutor.ts)  ◄── the realisation gap
   • dispatch wall.batch.create, wall.createOpening (doors), window openings, the entrance
     door, room bounding lines — pre-minted ids, one runBatch (one undo)
   • §OPENING-VOID-WHOLE-LEVEL: after openings settle, rebuild host walls WHOLE-LEVEL so the
     void is cut + corners re-mitred (v184)
   │
   ▼
WallRebuildCoordinator (apps/editor/src/engine/WallRebuildCoordinator.ts)
   • WallJoinResolver.resolveLevel → corner miters + T-joins + §PARTITION-SHELL-INNER-FACE
     + §NEAR-CORNER-L (v191 — closes a rotated-shell corner whose two ends are ≤120 mm apart)
   • builds wall meshes (opening voids) ; §DIAG-OPENING-VOID, §DIAG-PERIM-CORNER-WHOLE
   │
   ▼
RoomDetectionEngine → nameDetectedRooms.ts (matchDetectedRooms.ts: detected polygon ↔ engine
   room by overlap) → names + types ; then furnish / light / ceiling / floor passes
   • EXECUTION-BOUNDARY DIAGNOSTICS: houseExecDiagnostics.logExecRoomDiagnostics()
     (§DIAG-EXEC-ROOMS engineRooms vs detectedRooms, -WALLS, -DOORS, -WINDOWS, -AREA,
      -FILL, -STAIR-SIZE, -WIN-BOUNDS, -OVERLAP, -ROLLUP) — fires at the END of the console.
```

---

## 2. THE central defect — upper-floor / secondary white space (root-caused)

**Symptom:** a generated house leaves a large unassigned cell (e.g. `Room 01-001 40 m²`) — on
the upper floor, and on the ground too when over-programmed. **The apartment never does this.**

**Root cause (definitive):**
- Apartment: no stair → no carve → the plate is **one rect** → squarify tiles it fully → **0 residual**.
- House: the stair is carved in a corner → the plate is an **L** that decomposes into a
  **dominant rect + a secondary rect** (`§DIAG-RECTS areas=[99.4, 36.2, 6.8]`). When the
  dominant clears the 0.40 gate, `trySingleRectCarve(dominant)` packs the **whole programme into
  the dominant rect only** and ships (0 drops). The **secondary rect is left empty**. Because it
  sits *across the stair* from every placed room, the residual-fill cannot GROW any room into it
  (nothing abuts it; bordering rooms are at their hard-max) → it MINTS a cluster of ~7 m² `Store`
  cells. The editor then renders that cluster as one generic `Room NN-NNN`.
- Over-programming (e.g. 3→5 beds on ~95 m²) pushes all beds upstairs, the ground bedroom
  disappears, and BOTH plates get an unfilled secondary rect.

**The hard tension (why it is not a one-liner):** the **carve path is exactly what guarantees the
stair↔corridor connection** (via `orientCorridorToKeepOut` in `finalise`). Any path-swap that
fills the secondary rect (`packMultiRect`, `tryStairSpanningCorridor`) **breaks stair circulation**
— PROVEN: re-routing the carve decision failed **15 `stairUpperCirculationFace` + 8
`stairDensePlateIntegrity`** tests. White-space-fill and stair-connection are in *direct conflict*
in the current carve architecture.

**Fix attempts (all reverted — recorded so they are not repeated):**
1. Grow per-room TARGET areas in `scaleProgramToShell` → **ineffective**: the subdivider fills by
   COUNT + squarify geometry, not target size; the residual rect did not move.
2. Carve-decision swap to the smallest-residual path (loose 8 m²/8 % gate) → **25 test regressions**.
3. Same with a tight 15 m²/12 % gate → still **23 stair-circulation regressions** (the tension above).
4. Residual-fill grow / mint-fewer → **blocked**: nothing abuts the secondary rect across the
   stair; `utility` mint is capped at ~7.5 m² (`RESIDUAL_MINT_MAX_M2`).

**The correct fix (needs implementation + VISUAL validation):** make the **carve itself span the
L** — place/relocate one room into the secondary leg AND keep the corridor running to the stair
(what an architect does with an L-plan). Concretely: extend `tryStairSpanningCorridor` to relocate
a *private* room (a bedroom, for bedroom-only upper floors — today it only relocates *public*
rooms), fire it when the dominant carve leaves a large residual (not only on a drop), and prove the
stair still doors onto circulation. This will change the ~25 layout-pinning house tests, which must
be **re-baselined deliberately and confirmed-better by eye** — it cannot be validated by unit tests
alone, and the agent that wrote this doc has **no browser** to see the rendered result.

---

## 3. THE systematic engine→execution realisation gap

**Symptom (founder, on the confirmed-current build `cb76fa91`):** exterior wall corners open,
windows mis-placed, doors in the wrong room/protruding, new bed variants set up wrong, Living +
Bedroom **merged into one room** — even though each of these has a code fix that **passes its unit
tests** (corners v191, windows v194, doors v183, beds v195).

**Conclusion:** the engine produces *correct data* (tests pass on it) but the **editor's build of
that data diverges**. Established instance: v194 — the modal confined each window to its room band
correctly, but the build path re-clamped the window to the *whole* shell wall ignoring the
partition junctions, dragging it across into the neighbour. The "Living+Bedroom merge" is the same
class: a divider wall is in the engine output but does not close the detection loop in the build
(dropped by `repairSegments`' 0.50 m floor, or its endpoints weld outside the 20 mm room-detection
grid after the world-rotation), so `RoomDetectionEngine` reads one space and `nameDetectedRooms`
labels it generically.

**Why it kept looking unfixed:** the gate this agent can run — `tsc --skipLibCheck` (0) +
`pnpm --filter @pryzm/ai-host test` (2650) — **does not exercise the editor render**. A green
suite is necessary but NOT sufficient. The authoritative signal lives in the browser console:
the `§DIAG-EXEC-*` block (fires after the build; filter the console by `§DIAG` to surface it).

---

## 4. Diagnostic instrumentation map (how to localise any future defect in ONE console paste)

Filter the browser console by `§DIAG` after a generate. Key lines, by symptom:

| Symptom | Line | Reads |
|---|---|---|
| white space / generic cell | `§DIAG-RECTS`, `§DIAG-FILL-RESIDUAL` | dominant/secondary rects; grown vs minted; largestBlankAfter |
| rooms merged | `§DIAG-EXEC-ROOMS` | engineRooms=N vs detectedRooms=M + both lists (M<N ⇒ merge) |
| divider wall missing | `§DIAG-EXEC-WALLS` | shell vs partition wall counts built |
| corners open | `§DIAG-PERIM-CORNER-WHOLE` | per-corner GAP in mm (>120 mm ⇒ outside v191's §NEAR-CORNER-L) |
| openings not cut | `§DIAG-OPENING-VOID` | per wall: voidCut yes/no + why (instanced / hidden / cached-invalid join) |
| window between rooms | `§DIAG-WIN`, `§WINDOW-SPAN-FIT` | per room: wall, roomBand, placed offset; drops |
| window out of shell | `§DIAG-EXEC-WIN-BOUNDS` | windows past the wall span |
| oversized stair | `§DIAG-STAIR-FOOTPRINT-RATIO`, `§DIAG-EXEC-STAIR-SIZE` | cellToFootprint× (>1.6 ⇒ oversized) |
| stair sealed / served-through | `§DIAG-STAIR-CIRC`, `§DIAG-EXEC-ADJ` | sharesCorridorWall, doorOntoCirculation |
| over-program / dropped rooms | `§FEASIBILITY-ALLOC`, `§DIAG-TOPO-GATE`, `§DIAG-WINNER` | fillRatio>1 ⇒ over-program; failed=[circulation,reach] |
| entrance door wrong room | `§DIAG-EXEC-ENTRANCE`, `§DIAG-ENTRANCE-FIX` | mainDoor on the hall's shell wall? |
| summary | `§DIAG-EXEC-ROLLUP` | roomsWithDoor / windowless / overCap / noEngineMatch / winOutOfBounds |

`logExecRoomDiagnostics` is wired from `nameDetectedRooms.ts:208` and fires on every house +
apartment generate, in the build `cb76fa91`+.

---

## 5. Fix roadmap (prioritised, with the validation each needs)

1. **Engine→execution realisation gap (HIGHEST LEVERAGE).** Fixing it makes the *already-shipped*
   corner/window/door/bed fixes actually render. Drive it from `§DIAG-EXEC-ROOMS`/`-WALLS`/
   `§DIAG-OPENING-VOID`/`§DIAG-PERIM-CORNER-WHOLE`. Likely first target: the divider-wall that
   doesn't close the detection loop (the Living+Bedroom merge) — check `repairSegments` 0.50 m
   drop + post-rotation junction weld vs the 20 mm detection grid.
2. **White-space L-spanning carve** (§2). Deep geometry; re-baseline ~25 house tests; validate by eye.
3. **Stair size** for the corner disposition if `cellToFootprint > 1.6` persists.
4. **Door clash / entrance-door room** refinements (§DIAG-EXEC-ENTRANCE / -DOORS driven).

**Process rule learned the hard way:** for anything in the subdivision/carve core, write the
failing test first, change ONE lever, run the FULL `ai-host` suite, and treat any
`stairUpperCirculationFace` / `stairDensePlateIntegrity` / `houseProgramSizerConvergence`
failure as a real regression (those pin the stair-circulation guarantee). Do not ship a layout
change that flips the subdivision path selection without re-baselining + visual confirmation.

---

## 6. File index

| Concern | File |
|---|---|
| storey programme split + stair core | `packages/ai-host/src/workflows/houseLayout/houseOrchestrator.ts`, `houseProgramFloor.ts` |
| bubble graph + room target areas | `…/apartmentLayout/tgl/bubbleGraph.ts` |
| subdivision + stair carve + residual-fill | `…/tgl/subdivide.ts` |
| walls + door pipeline + stair-open-zone | `…/tgl/wallsAndDoors.ts` |
| geometry emit + window junctions | `…/tgl/emitGeometry.ts` |
| windows (room-segment, in-bounds, size-by-type) | `…/windowEmission/*.ts` |
| strategy ranking + hard gates + overlap net | `…/tgl/enumerate.ts`, `objectives.ts` |
| editor execution / dispatch | `apps/editor/src/ui/house-layout/HouseLayoutExecutor.ts` |
| wall build + corner resolve + void cut | `apps/editor/src/engine/WallRebuildCoordinator.ts`, `packages/geometry-wall/src/WallJoinResolver.ts` |
| detected-room naming/matching | `apps/editor/src/ui/apartment-layout/nameDetectedRooms.ts`, `matchDetectedRooms.ts` |
| execution-boundary diagnostics | `apps/editor/src/ui/house-layout/houseExecDiagnostics.ts` |
| furniture / beds / kitchen / living rules | `packages/ai-host/src/workflows/furnishLayout/*`, `packages/geometry-furniture/src/builders/*` |

---

## OPEN ARCHITECTURE PROBLEM — polygon-native subdivision (any shape, not just rectangles)

> Raised 2026-06-15. The recurring white-space / wrong-direction-wall defects all trace to **one
> root**: the subdivider assumes the footprint is (or rectifies to) a **rectangle**, then bolts a
> residual-fill patch onto the leftover. The real requirement is to **subdivide an arbitrary
> polygon** (sheared / concave / L / drawn boundary / GIS parcel) program-driven, with walls on
> real cell edges and the sliders re-tiling the *whole* plate.
>
> **The full, self-contained design + phased build + risk register is `§13` of
> [`docs/04-reference/LAYOUT-GENERATION-ALGORITHM.md`](../04-reference/LAYOUT-GENERATION-ALGORITHM.md).**
> Recommended approach: recursive polygon binary-split (program-tree-guided, principal-axis-biased).
> Use that section for any external second opinion — it stands alone.
