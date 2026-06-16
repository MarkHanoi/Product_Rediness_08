# ADR-0072 — Corridor-spine adjacency on stair-fragmented / L-T-U plates (D-TGL §P3c / tracker §52.6)

- **Status:** Proposed (2026-06-16)
- **Layer:** L2 pure engine — `packages/ai-host/src/workflows/apartmentLayout/tgl/`
- **Governs:** `SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md` §11.1 (the named "P3c adjacency-aware placement" gap)
- **Relates to:** ADR-0061 (deterministic least-bad selection), ADR-0066 (access-graph-first doctrine), ADR-0068 (circulation-first building graph); `single-apartment-fix-pass-spec` failure #2; `house-doors-stair-fragmentation-root`.
- **Contracts:** C16 (command authoring — the engine emits via the command bus), the program-rules DB (`rules/programRules.ts`) door **permission matrix** is the legality authority and is NOT relaxed by this ADR.

## Context

The D-TGL subdivider already carries a rich corridor-spine family that **guarantees** every private room shares a wall with the corridor when it fires: `tryCarveCorridor` (3-zone), `tryCarveDoubleLoadedCorridor` (§NO-PUBLIC), `tryCarveSingleLoadedCorridor` (§NO-SEAL-SINGLE-LOAD), and the `§EVERY-ROOM-ACCESS-COMB`. These run on a **single rect** — the whole shell (apartment) or the **dominant rect** after the stair keep-out carve (`§STAIR-OBSTACLE-CARVE`, subdivide.ts ~L2518).

On a **rotated L/T/U house plate** the stair keep-out + the plate's own concavity fracture the buildable area into **two or more comparable rects** with **no dominant rect**. Live telemetry (16.7×14.0 m L-plate, corner stair):

```
§DIAG-RECTS stairCarved=true rects=5 areas=[77.8, 71.0, 15.8, 11.6, 8.8] dominantFrac=0.42
§DIAG-BRANCH dominantFrac=0.42 path=carve  → picked carve (DROPPED bedroom)
… r5(bedroom) → NO DOOR ✗   (its wall-neighbours are bathroom/kitchen/stair — never the corridor)
§DIAG-CIRCULATION-REACH allHabitableReachable=NO sealed=[r5(bedroom)]
```

The dominant-rect carve runs the corridor in the **77.8 m² arm only**; rooms allocated to the other L-arm (71.0 m²) are never corridor-adjacent → land-locked → sealed. The alternative strategies that *do* reach the private rooms instead seal the **entrance hall** (`failed=[window,circulation]`). **No enumerated tiling produces one corridor adjacent to the entrance AND every private room** — the documented §52.6 dilemma ("dominant-rect-carve-drops vs generic-packing-seals"). This is purely the **single-rect assumption** of the carve family on a multi-arm plate; it is NOT a selection or door-routing bug (ADR-0061 selection already prefers the routed tier; the door router cannot host a door on a wall that does not exist).

## Decision

Introduce **P3c — an L/T-shaped (multi-arm) corridor spine** for the stair-fragmented branch, so the corridor follows the plate's arms and **every private room is wall-adjacent to the spine**.

1. **Detect the multi-arm plate.** In the `§STAIR-OBSTACLE-CARVE` branch, when no single rect clears `DOMINANT_FRACTION` (0.40) *or* the carve on the dominant rect would drop/seal a programmed room, treat the two largest rects as the **arms of an L/T** joined at their shared edge.
2. **Carve an L-corridor.** Place the corridor strip (≥ `CORRIDOR_STRIP_WIDTH_M` = 1.2 m) along the **inner edges** of both arms so it runs through the junction — i.e. an L/T spine. Each arm's private rooms comb off the spine on the arm's face (reusing the existing `§EVERY-ROOM-ACCESS-COMB` per arm), guaranteeing a corridor-adjacent wall for every room's door.
3. **Entrance reachability is part of the invariant.** The spine must remain adjacent to the entrance hall (or the hall→corridor edge) so the front-door→corridor→private-rooms path is unbroken — closing the "reachable candidate seals the hall" failure mode.
4. **No-regression gate (ADR-0061 / §STAIR-CARVE-NO-DROP doctrine).** P3c runs alongside the existing dominant-carve + `packMultiRect`, and the branch keeps whichever result satisfies the **spine invariant with the fewest dropped rooms**; on a plate where the legacy single-rect carve already links every room, P3c is a no-op (byte-identical). The program-rules **permission matrix** still gates every door (no illegal bedroom↔bedroom links).

### Executable contract (test-first)

The invariant is encoded as a deterministic test BEFORE the implementation (`houseCorridorSpineFragmented.test.ts`): on a stair-fragmented L-plate, **the chosen layout's corridor shares a ≥ door-width wall with every private/service room AND with the entrance hall**. The test reproduces the live `dominantFrac≈0.42` fracture via `subdivideWithReport(rects, graph, {stairCarved:true, keepOutRects})` and asserts `sealedRoomIds`/`unroutedToCirculationRoomIds` are empty for habitable rooms. It is RED today (reproduces the seal) and is the gate for the P3c implementation.

## Consequences

- **Positive:** closes §52.6 / SPEC §11.1; the corridor becomes a true link room on rotated L/T/U house plates; removes the land-locked-bedroom seal without relaxing door legality.
- **Cost / risk:** new geometry in the most defect-prone subdivider branch; must be landed test-first and browser-verified (not auto-deployed) — see the §CLAMP-COSHARE-WELD regression lesson (a wall-geometry change that passed unit tests still shipped a visible defect). Phased: P3c-a (detect multi-arm + L-corridor carve + test green) → P3c-b (entrance-reachability tie-in) → P3c-c (T/U generalisation).
- **Out of scope (separate roots, tracked elsewhere):** (i) the **WallJoinResolver over-trim** that leaves built partition ends ~1 m short of their host (`§DIAG-PARTITION-REACH` recovers ≤ `hostSnap` 200 mm only) — an *execution-side* cause of open corridors even when the *plan* is correct; (ii) the rotated stair keep-out poking outside the shell ("walls going off"); (iii) window-overflow-at-corner + a shell-containment validator. These are queued independently.
