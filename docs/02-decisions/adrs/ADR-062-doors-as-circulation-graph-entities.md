# ADR-062 — Doors as first-class circulation-graph entities + door-aware reachability

- **Status:** ACCEPTED (2026-06-29) — graph + reachability slice IMPLEMENTED; generator
  max-circulation guarantee SPEC'd (staged).
- **Owner:** apartment/house living-graph (`apps/editor/src/ui/apartment-layout`,
  `apps/editor/src/ui/house-layout`) + circulation engine (`packages/ai-host/src/workflows`).
- **Affects:** `apps/editor/src/ui/apartment-layout/layoutBubbleGraph.ts`
  (`buildPlanGraphOverlaySvg` + new `computeCirculationReachability`),
  `apps/editor/__tests__/planGraphOverlay.test.ts`, and (consumers) `HouseLayoutModal._storeyGraphs`,
  `ApartmentLayoutModal`, `ResidentialBuildingModal`.
- **References:** [SPEC-CIRCULATION-GRAPH PART 9](../../03_PRYZM3/SPEC-CIRCULATION-GRAPH.md),
  ADR-0068 (five-graph circulation-first building graph), `§GRAPH-COMPLIANCE-RED`,
  `§CIRC-REACH`, `§DOOR-GRAPH`, `§CORRIDOR-STAIR-CONTIGUITY`, ADR-0061 (pure-predicate /
  no-span precedent: `unreachableHabitableRoomIds`).

## Context

The founder reported the house "Living Graph" circulation scores read TOO LOW (Ground floor
"score 84", never 100). The target is MAXIMUM circulation: **every habitable room cell is
reachable through circulation**. The key idea: **DOORS are the enablers of circulation** — a
circulation edge between two rooms is REAL only if a DOOR connects them. The graph today renders
rooms as circles + edges sourced from `room.adjacentTo` (mere wall-sharing), with NO door nodes,
so it overstates connectivity. This must generalise to ANY typology (house / apartment / resi
building) — circulation is a platform concept, not house-only.

### Root cause of "score < 100"

The displayed per-floor "score NN" is `option.score.overall` — a SOFT weighted sum over ~23
cognition axes (efficiency, daylight, privacy, `corridorAccess`, proportionalElegance, …), NOT a
circulation-completeness percentage. Even a layout with perfect door circulation scores < 100
because the soft axes never simultaneously max out (corridor area is penalised, daylight reach
is partial, etc.). So "84" was never, by itself, a circulation-failure signal. The engine DOES
compute door-aware reachability (`unreachableHabitableRoomIds`, `servedThroughPrivateRoomIds`,
`measureCorridorAccess` over `CONNECTS_THROUGH` edges) — but as a hard gate / one soft axis, not
as the headline number, and the GRAPH renderer never used the door set.

## Decision

1. **Doors are first-class graph entities.** The living-graph overlay
   (`buildPlanGraphOverlaySvg`) now sources its edges from `room.doorAdjacentTo` (the realised
   opening graph from `emitGeometry.ts`). Each real-door edge gets a small **door NODE** (white
   disc, `#6600FF` ring) at the edge midpoint: **room — door — room**. A wall-shared but doorless
   adjacency renders as a **faint dashed** edge with no door node, so a room reachable only
   without a door is visibly NOT connected. Node door-degree (not wall-degree) drives hub sizing.
   Pre-deploy parity: when no room carries `doorAdjacentTo`, every wall edge is treated as a door.

2. **Reachability follows doors.** New pure exported `computeCirculationReachability(option)` BFS-es
   from the storey entrance (hall → stair → first circulation) over the DOOR graph and returns
   `{ reached, total, fraction, unreachedRoomNames, hasDoorGraph }`. `fraction === 1.0` ⟺ every
   habitable room has a door PATH to the entrance = MAXIMUM circulation. This is the single
   door-aware source of truth shared by the red-node logic and any displayed circulation %.

3. **Generator must GUARANTEE `fraction === 1` for the winner**, cross-typology, as a final hard
   gate in each orchestrator. The levers are staged in SPEC PART 9.4 (house: post-selection suite
   rescue; apartment: door-router coverage; resi: core-corridor unit-door coverage). This ADR
   ships the graph + reachability (independently demo-visible); the generator gate is the next
   task, made trivial-to-add + testable by the pure predicate.

## Consequences

- The graph now tells the truth: edges you can WALK through (doors) vs edges that merely touch
  (dashed). Sealed / served-through rooms are visible as missing/dashed connections + red nodes.
- The circulation % is decoupled from the multi-axis design `score`. Recommendation (small
  follow-up): surface "circulation NN%" in the modal separately from `score`, with 100% as the
  demo target, instead of conflating the two.
- Brand-safe: door nodes are white + `#6600FF`, no black. Pure SVG, Node-testable, no THREE/DOM.

## Alternatives considered

- **Make `score.overall` reflect circulation completeness.** Rejected: `score` is a designed
  multi-axis quality number; folding a hard pass/fail into it hides the other axes and still
  wouldn't read "100" for good-but-not-perfect layouts. Better to show circulation % separately.
- **Keep edges on `adjacentTo`, just colour red.** Rejected: that is what overstates connectivity
  in the first place; the founder's point is that the EDGE itself is unreal without a door.

## P8 / P-principles note

`computeCirculationReachability` and the SVG builders are pure deterministic predicates in an
explicitly ZERO-runtime-import module; consistent with the `unreachableHabitableRoomIds` precedent
(ADR-0061) they carry no OpenTelemetry span — adding one would force a runtime telemetry import
into a Node-pure module. The renderer is a pure string builder (no THREE, no `window`, no store
writes), so P2/P4/P6 are not engaged.
