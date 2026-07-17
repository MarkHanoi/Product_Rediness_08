# ADR-0087 — Door-rescue post-pass: the generator-side maximum-circulation guarantee + modal readout

- **Status:** ACCEPTED (2026-06-30) — IMPLEMENTED. Realises the generator lever SPEC'd (staged) in
  ADR-0262 / SPEC-CIRCULATION-GRAPH §9.4.
- **Owner:** circulation engine (`packages/ai-host/src/workflows/apartmentLayout/tgl`) +
  apartment/house/resi modals (`apps/editor/src/ui`).
- **Affects:**
  - `packages/ai-host/src/workflows/apartmentLayout/tgl/wallsAndDoors.ts` — new `§DOOR-RESCUE-REACH`
    post-pass (`2e`) in `buildWallsAndDoors`.
  - `packages/ai-host/__tests__/tglWallsAndDoors.test.ts` — `§DOOR-RESCUE-REACH` describe block.
  - `apps/editor/src/ui/apartment-layout/{layoutCardModel,layoutModalHtml}.ts`,
    `apps/editor/src/ui/house-layout/{houseCardModel,houseModalHtml}.ts`,
    `apps/editor/src/ui/residential-building/{residentialCardModel,residentialModalHtml}.ts` — the
    "Circulation NN%" chip.
  - `apps/editor/__tests__/layoutCardModel.test.ts` — `circulationPct` cases.
- **References:** [SPEC-CIRCULATION-GRAPH PART 9](../../03-execution/specs/SPEC-CIRCULATION-GRAPH.md)
  (§9.3 modal readout SHIPPED, §9.5 door-rescue SHIPPED), ADR-0262 (doors as first-class graph
  entities + `computeCirculationReachability`), ADR-0061 (pure-predicate / no-span precedent —
  `unreachableHabitableRoomIds`, `servedThroughPrivateRoomIds`), `§BATH-CORRIDOR-ONLY`,
  `§WETROOM-PUBLIC-DOOR`, `§HALL-NOT-WETROOM-ONLY`, `§CIRCULATION-REROUTE`.

## Context

ADR-0262 added door NODES to the living graph and the pure `computeCirculationReachability(option)`
predicate (`fraction === 1` ⟺ every habitable room is reachable through a PATH OF DOORS from the
entrance = MAXIMUM circulation), and SPEC'd — but did not implement — the generator-side GUARANTEE
that the chosen winner reaches `fraction === 1` across typologies, plus surfacing the circulation %
in the modals.

The existing door router (`buildWallsAndDoors`) already had circulation passes, but two gaps left
rooms unreachable:
1. The reroute passes (`§CIRCULATION-REROUTE` `2c` / multihop `2c-ii`) target only PRIVATE/SERVICE
   rooms — a **sealed PUBLIC room** (living/kitchen/dining with no door) is invisible to them
   (`needsCirculationAccess` returns false for a public type).
2. The multihop chain only fires when a PERMITTED door-chain already exists.

So a layout could ship with a habitable public room (or a room reachable only through it) that has
no door path from the entrance — `fraction < 1`.

## Decision

### 1. `§DOOR-RESCUE-REACH` post-pass (shared TGL door router)
Add a final additive pass `2e` to `buildWallsAndDoors`, after the reroute / multihop / wetroom
passes. It:
- BFS-marks every room reachable from the entrance over the **realised DOOR graph** (+ open
  thresholds), using the SAME entrance-root rule as `unreachableHabitableRoomIds` and the modal's
  `computeCirculationReachability` (explicit `entryId` → lowest-id circulation room → lowest-id
  room), so all three agree on the same front.
- For each still-UNREACHED **habitable** room — the `REACH_HABITABLE_TYPES` set
  (living/kitchen/dining/master/bedroom/study), the exact denominator the metric measures — adds
  ONE door onto a shared wall with an already-REACHED neighbour.
- **Iterates** to convergence: a rescue makes the room reached, so a room reachable only through it
  is rescued on the next round (bounded by room count).

Constraints (so the rescue is privacy-correct, not a blanket "open every wall"):
- **Permitted-only.** Tier 1 = a clean rule-legal under-cap door; Tier 2 = a permitted pair
  relaxing only the door CAP (counted as a `compromise` so P8 still prefers a plan that needed
  none). The rescue **never** crosses a forbidden type pair — no bedroom↔bedroom, no bathroom-off-
  living. A habitable room with no PERMITTED reached neighbour stays flagged (the ranker / reach
  diagnostic own that rare case), never forced open illegally.
- **Wet/service rooms EXCLUDED.** A sealed bathroom is owned by the dedicated privacy passes
  (`§BATH-CORRIDOR-ONLY`, `§WETROOM-PUBLIC-DOOR`, `§HALL-NOT-WETROOM-ONLY`); the rescue must not
  re-introduce the bathroom↔bedroom / bathroom-off-hall anti-patterns those exist to prevent.
- **NET-ADD only.** Never removes/moves a door; a fully-reachable layout is byte-identical.

Because the pass lives in the SHARED apartmentLayout TGL path (no `housePath` gate), APARTMENT,
HOUSE, and RESIDENTIAL (per-cell) all inherit the guarantee — no per-typology fork.

### 2. "Circulation NN%" modal readout
Each modal card model computes `computeCirculationReachability(option).fraction` and surfaces it
as a brand-purple chip beside the existing `/100` soft score — separating true door-graph
completeness from the 23-axis design score (§9.3's "score 84" diagnosis). 100% = solid `#6600FF`
(white text); below 100% a softer violet; a wall-adjacency fallback (no door graph) shows a "~"
qualifier. NO black. Surfaced per-card (apartment), per-floor (house "Design your house — live"),
and per-apartment (resi preview).

## Consequences
- `fraction → 1` for normal plans by construction, through one shared code path.
- No new EXPORTED engine function (the rescue is an internal slice of `buildWallsAndDoors`; the
  modal chip helpers are internal renderers) ⇒ no new OpenTelemetry P8 span is owed — consistent
  with ADR-0061's pure-predicate precedent.
- A genuinely land-locked habitable room (no permitted reached neighbour in this tiling) is still
  surfaced — the rescue narrows but does not mask the ranker's reach gate.
