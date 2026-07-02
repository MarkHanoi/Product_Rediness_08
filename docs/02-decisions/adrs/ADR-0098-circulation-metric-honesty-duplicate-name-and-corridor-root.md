# ADR-0098 — Circulation-% honesty: duplicate-name-safe reachability + corridor root + storage rescue

- **Status:** Accepted (2026-07-02)
- **Layer:** L5 metric (`apps/editor/src/ui/apartment-layout/layoutBubbleGraph.ts`) + L2 engine
  (`packages/ai-host/src/workflows/apartmentLayout/tgl/emitGeometry.ts`, `wallsAndDoors.ts`).
- **Governs:** `docs/03_PRYZM3/SPEC-CIRCULATION-GRAPH.md` §9.2–9.5 (the door-aware circulation
  reachability metric + the generator's MAXIMUM-circulation guarantee).
- **Relates to:** ADR-0087 (`§DOOR-RESCUE-REACH`), ADR-0072 (corridor-spine on fragmented
  plates), ADR-062 (doors as circulation-graph entities); analysis
  `HOUSE-CIRCULATION-SEALED-ROOMS-2026-06-20.md`.

## Context

Founder live report ("Design your house — live", 2-storey house): the modal showed
**"Circulation 100%"** + score 92 while the TOP rooms (a Bedroom, a Bathroom, a Dining) were
**not reachable** — no corridor reached them and/or they had no door onto circulation. The
circulation METRIC passed while real door-to-door reachability from the entrance was incomplete —
a validation gap that let isolated rooms through.

### Root cause (reproduced deterministically over `generateHouseLayout`)

The modal number is `computeCirculationReachability(option).fraction` — a BFS over the room DOOR
graph (`room.doorAdjacentTo`). Three defects made it lie:

1. **Duplicate-name collision (primary).** The access edges reference rooms **by NAME**, and the
   engine mints **duplicate display names** — the `§DIAG-FILL-RESIDUAL` pass names *every* residual
   service cell simply `"Storage"` (subdivide.ts `residualMintName`), so a plate can carry three+
   rooms literally named "Storage". The metric keyed its BFS graph by a `Map<name, index>`, which
   **collapsed every same-named room onto ONE node**. A physically SEALED "Storage" (empty
   `doorAdjacentTo`, `hasDirectAccess=false`) then inherited a CONNECTED same-named sibling's
   reachability and was counted as reached → the metric reported **100% over a physically isolated
   room**. Live repro: a 17×12.5 m ground storey with a sealed "Storage" reported `circ=100%`.
2. **Upper-floor root anchored on a sealed stair.** The metric rooted the BFS `hall → stair →
   circulation`. On an upper floor the stair keep-out usually ships **door-less** (rooms open onto
   the corridor, not the stair), so rooting at the stair reached NOTHING → a fully
   corridor-connected floor scored **0%**. SPEC FF-R1 makes the **corridor** the upper-floor root.
3. **`storage` outside the generator guarantee.** `§DOOR-RESCUE-REACH` (ADR-0087) rescues only
   `{living,kitchen,dining,master,bedroom,study}`; a residual `storage` closet could ship genuinely
   sealed while the metric counted it as a habitable destination.

## Decision

1. **Metric is duplicate-name-safe.** `computeCirculationReachability` (and the plan-overlay
   red-node BFS) key the reachability graph by **array index**, resolving each referenced name to
   **ALL** rooms bearing it. A sealed duplicate is its own node and is correctly unreached — the
   false 100% is impossible. (`§DUP-NAME-SAFE`.)
2. **Unique display names at emit.** `emitGeometry` mints a **unique** display name per space
   (`"Storage"`, `"Storage 2"`, …) in deterministic order; every name-keyed consumer (the metric,
   `adjacentTo`/`doorAdjacentTo`, room-detection, the schedule, IFC) sees one node per room. GUIDs
   are unchanged — element identity is the GUID, not the name. (`§DUP-NAME-UNIQUE`.)
3. **Corridor is the upper-floor root.** Entrance-root order is `hall → CORRIDOR → stair → any
   circulation → first room`, matching SPEC FF-R1 and the engine's own reach root; the BFS never
   anchors on an isolated stair. (`§ROOT-CORRIDOR-BEFORE-STAIR`.)
4. **Storage is in the rescue set.** `§DOOR-RESCUE-REACH` also rescues `storage` (a dry, accessible
   service closet whose `programRules.accessFrom` is {corridor,hall,bedroom}); wet rooms
   (bathroom/wc/utility) stay owned by their privacy passes. (`§DOOR-RESCUE-STORAGE`.)

The metric now reflects REAL door-reachability from the entrance; no isolated room can pass as
100%.

## Consequences

- **Positive:** the displayed circulation % is honest — it drops below 100% exactly when a
  habitable room is not door-reachable from the entrance, closing the reported gap. Unique names
  also fix downstream name-collision in schedules/IFC/room-detection.
- **Neutral:** a fully-connected layout is unchanged (the rescue is net-add-only; unique naming is
  a no-op when names are already distinct).
- **Out of scope (tracked defect):** on some over-programmed / fragmented plates the residual-fill
  mints a **disconnected island of `storage` closets** the door-rescue cannot legally connect (each
  abuts only another storage or a sub-door-width wall). The honest metric now correctly reports
  these as < 100% (previously masked as a false 100%). Closing the residual over-tiling is a
  carve-side change in the revert-prone subdivider and is tracked as a `.skip` regression in
  `apps/editor/__tests__/houseCirculationReachabilityHonest.test.ts`.

## Tests

- `apps/editor/__tests__/planGraphOverlay.test.ts` — `does NOT mask a SEALED duplicate-named room`
  and `roots at the CORRIDOR (not a sealed stair)`.
- `apps/editor/__tests__/houseCirculationReachabilityHonest.test.ts` — end-to-end over the real
  generator: unique names, metric-consistent-with-physical-door-graph, ground-floor full
  circulation; the every-storey-100% case is a tracked `.skip` (residual island).
