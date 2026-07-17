# L/U-corridor implementation plan — synthesising SPEC-0074 + ADR-0073 (2026-06-21)

Audit of SPEC-0074, ADR-0073, the live ALMANZORA logs, and the landed code — then a realistic,
test-first plan. **Why the previous step did not change production: the L-comb core
(`planLCorridorComb`, committed `3ad38a59`) is correct and unit-tested, but it is NOT WIRED into the
carve, AND it cannot be wired as SPEC-0074's optimistic one-liner because of an impedance mismatch
(below). The §HORZ-SHARED-WALL-FIX in the same commit DID ship and is real.**

## What the latest deploy shows (screenshot + logs)
- Upper floor: a straight corridor now spans the plate and serves most rooms, but the log still
  reports `§EVERY-ROOM-ACCESS-COMB fell back to squarify`, `contiguous=0/8`, `r4(bedroom) NO DOOR`,
  `stairsBridgedToCorridor=0/1`. So the straight comb is doing the work where it can, and squarify
  buries the overflow + the stair never gets a corridor door.
- Ground floor: `droppedRooms=[bedroom,bathroom]` + `dining NO DOOR` — over-programmed plate; the
  corridor competes in squarify for fragments too small for a bedroom.

## The impedance mismatch (the real blocker SPEC-0074 understates)
SPEC-0074 Fix A Change 2 proposes `sliceZoneAlongFace(zone,…) ?? trySliceZoneAlongLFace(zone,…) ?? squarify`.
But at the real call site (`subdivide.ts:1630`, inside the post-carve comb) the corridor is **already
carved** as `carve.corridorRect` (a straight strip from `tryCarveCorridor`/`tryCarveSingleLoaded…`),
and the comb only lays the **private rooms** into the separate `carve.privateRect`. So:
- `sliceZoneAlongFace(carve.privateRect, …)` slices rooms off the **pre-existing** straight corridor.
- `planLCorridorComb` instead **constructs its own** L corridor from the FULL zone — it has no place
  to put a corridor that was already carved elsewhere.

Dropping `planLCorridorComb` in at line 1630 would emit TWO corridors (the carved strip + the L ring).
**The correct integration is one level up:** when the straight carve+comb cannot connect every room
(the comb returns null AND there are too many rooms for one face), try an **L-corridor carve of the
WHOLE zone** that replaces `tryCarveCorridor` + comb — i.e. `planLCorridorComb` competes as an
alternative CARVE, not as an alternative private-comb.

## Plan (test-first, additive, one concern per commit; honours the 5× revert history)

### Step 1 — adapt the L-comb to be a full-zone CARVE (pure, unit-tested now)
Extend `planLCorridorComb` so it returns a complete `SubdivideResult`-shaped output INCLUDING the
corridor as a room: `{ placements: [...rooms, {roomId: corridorId, rect: representativeCorridorRect}],
cellPolygonById: Map([[corridorId, corridorRing]]), droppedRooms: [] }`, and accept `corridorId` +
optional `stairAnchor`. The representative rect = the bbox of the larger leg (the area/min/overlap
gates run on it; the real L geometry is the ring). NEW tests: corridor room present, ring in
`cellPolygonById`, every private room shares ≥ MIN_DOOR with the ring (already tested), corridor
shares a wall with `stairAnchor`'s keep-out when supplied. PURE — no browser.

### Step 2 — stair-anchored L orientation (Fix C, subsumes the straight-comb anchor)
`planLCorridorComb` picks the L corner NEAREST `stairAnchor` (4 orientations, not the hardcoded
bottom-left), so legB terminates at the stair and the ring shares a wall with the stair keep-out →
`stairsBridgedToCorridor=1/1`. Unit-test the 4 corners + the stair-shared-wall assertion. PURE.

### Step 3 — WIRE as a competing carve at the §EVERY-ROOM-ACCESS-COMB / §NO-PUBLIC-CARVE fallback
At `subdivide.ts:1630` (single-loaded) and `:1739` (double-loaded `§NO-PUBLIC-CARVE`): when the comb
returns null (the straight corridor can't serve all rooms), call the full-zone L-carve on
`shell`/the dominant zone with the corridor id + `keepOut` centroid, BEFORE the squarify fallback.
If it returns non-null with zero drops and all rooms corridor-adjacent, use it (replacing the straight
carve's corridor for this zone). Thread its `cellPolygonById` into the returned result. Additive: when
the straight comb already worked, or the L-carve is infeasible, output is byte-identical (ADR-0061 I2).

### Step 4 — corridor not in squarify budget (Fix B), separate commit
`bubbleGraph.ts`: `corridor.areaWeight = 0` + `isCirculationOnly`; `subdivideWithReport` filters
circulation-only rooms out of squarify; `scaleProgramToShell` subtracts an estimated corridor
footprint from the effective plate. Closes the ground-floor `droppedRooms=[bedroom,bathroom]`.

### Step 5 — ground beds upstairs (orchestrator), separate commit
`houseOrchestrator.allocateProgramToStoreys`: for `storeyCount===2 && totalBeds<=4`, ground gets 0
bedrooms. Closes the ground over-programme at the source.

## Gate (per SPEC-0074 §6 governance)
Each step: write tests RED first → implement → `pnpm --filter @pryzm/ai-host test` (full suite, 2850+)
green → the lone pre-existing `furnishRules` failure excepted. Steps 3–5 change layouts → **browser
verification on ALMANZORA before relying on them** (the founder runs `pryzmGenerateHouse(2)`, filters
`§DIAG`, confirms `sealed=[]`, `stairsBridgedToCorridor=1/1`, all 4 bedrooms corridor-accessible). No
auto-deploy of a layout-changing step without that visual confirmation.

## Status
- DONE: L-comb pure core (`planLCorridorComb`) + §HORZ-SHARED-WALL-FIX (`3ad38a59`).
- THIS PLAN: Step 1 (full-zone carve adaptation) is the immediate next implementation — pure +
  unit-testable, no browser, unblocks Step 3's wiring.
