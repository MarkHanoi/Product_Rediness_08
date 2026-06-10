# 0066 — Access-Graph-First Generative Layout Doctrine

**Status**: PROPOSED
**Date**: 2026-06-10
**Deciders**: architecture team (founder-driven — *"a domestic floor plan is not a collection of rooms that fit inside a perimeter, it is a HIERARCHICAL ACCESS GRAPH"*)
**Related contracts**: [C53 — Generative Layout Engine Architecture](../contracts/C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md) (§1 topology-before-geometry), [C52 — Editable Building Graph](../contracts/C52-EDITABLE-BUILDING-GRAPH.md), [C19 — Site Model & Parcel](../contracts/C19-SITE-MODEL-AND-PARCEL.md)
**Related ADRs**: [ADR-0061](./0061-building-graph-bidirectional-edit-substrate.md) (determinism substrate), [ADR-0062](./0062-layout-engine-deterministic-graph-solver.md) (deterministic graph solver), [ADR-0063](./0063-house-generative-layout-doctrine.md) (per-storey apartment pipeline + multi-storey spine)
**Related SPECs**: [SPEC-ACCESS-GRAPH-AND-SPATIAL-GRAMMAR](../../03-execution/specs/SPEC-ACCESS-GRAPH-AND-SPATIAL-GRAMMAR.md) (the normative companion), [SPEC-ARCHITECTURAL-PROGRAM-RULES](../../03-execution/specs/SPEC-ARCHITECTURAL-PROGRAM-RULES.md) (the room DB this doctrine governs)
**Context docs**: [LAYOUT-GENERATION-ALGORITHM](../../04-reference/LAYOUT-GENERATION-ALGORITHM.md) (the master engine walkthrough), master-execution-tracker §47.

## Context

The founder gave a deep architectural critique of the generative house layout:

> *"A domestic floor plan is not a collection of rooms that fit inside a perimeter — it is a
> HIERARCHICAL ACCESS GRAPH. Every room must be reachable from the front door by traversing a
> defined sequence of spaces. The correct grammar for a two-storey house is:
> **Street → Front door → Entrance hall → [Living/Kitchen/Dining/Stair] → Landing →
> [Bedrooms/Bathrooms].** The algorithm generates rooms as isolated units and connects them with
> doors AFTER the fact — this is backwards. The access graph must be defined FIRST as a topology,
> and rooms placed to satisfy it."*

His 7 fundamental gaps were: (1) no access-graph-first spatial grammar; (2) incomplete room-type
vocabulary (entrance hall as a ground-floor anchor, a proper rectangular landing, a ground-floor WC,
a utility); (3) area partitioning with no per-type ENFORCED caps **at the SHIPPED level** (an
en-suite shipped at ~53 m², a master at 29 m²); (4) en-suite duplication / labelling collisions;
(5) miter-clamp warnings from diagonal-wall geometry degeneracy; (6) window placement done per-WALL
not per-ROOM; (7) the stair creating two phantom rooms instead of a single excluded void.

### The honest A/B split — what already exists vs what genuinely changes

A full read of the engine (`packages/ai-host/src/workflows/apartmentLayout/` and the master doc
`LAYOUT-GENERATION-ALGORITHM.md`) establishes that **most of the founder's grammar is already
designed into the engine** — but it is designed *engine-internal*, *pre-detection*, and is then
lost at the **engine→editor execution/detection/naming boundary**. The two classes:

- **(A) Already-designed-in-the-engine but NOT reliably SHIPPING — an EXECUTION-BOUNDARY fidelity
  problem.** This is the dominant cause. The engine *does* build a typed access graph (the P5
  `LayoutGraph`, `tgl/semanticGraph.ts`), *does* enforce a permission matrix where a bedroom is
  never off another bedroom and a bath is off a corridor only (`rules/programRules.ts:246`
  `ROOM_RULES`, `doorAllowedBetween` `:592`), *does* enforce size-scaled area caps (`§AREA-FRACTIONS`,
  bedroom `maxAreaFrac 0.16`, master `0.20`, `programRules.ts:494`+`bubbleGraph.ts:256-279`), *does*
  mint a single ground-only entrance `hall` with `frontage:'required'` (`§HALL-SINGLETON`,
  `§LANDING-NOT-HALL`/G14, `bubbleGraph.ts:160-178`), *does* mint a `stair` RoomType excluded from
  tiling (`§STAIR-ROOM-TYPE`, `programRules.ts:433`), *does* require a window on every habitable room
  (`windowMandatory` + `§WINDOW-MANDATORY-RESCUE`, `shellWallMatch.ts`), and *does* hard-reject a
  windowless / land-locked / private-off-hall / overlapping tiling (`§TOPO-HARD-REJECT`,
  `enumerate.ts:252-258`). **The 53 m² en-suite is geometrically impossible from those engine caps** —
  it is therefore a *detected merged polygon*, not an engine room: when a partition endpoint misses
  the shell centreline the `RoomDetectionEngine` (`nameDetectedRooms`) floods two engine rooms into
  one and re-labels the merged blob with the nearest engine label. The just-shipped
  `§ROOM-NAME-BIJECTIVE` (`apps/editor/src/ui/apartment-layout/matchDetectedRooms.ts`) and the new
  `§DIAG-EXEC-*` execution-boundary diagnostics (`house-layout/houseExecDiagnostics.ts`) target
  exactly this class.

- **(B) Genuinely-missing / doctrine-level changes.** A residue is real new work:
  (B1) the **access-graph-FIRST inversion** is only *half* present — C53 §1 already mandates
  "topology is the source of truth, geometry is a projection of it," and P5 builds a typed graph,
  but the access graph is consumed as a *scoring input* and a *pre-detection design*, never
  re-asserted as a **post-detection invariant** on the plan the user actually receives;
  (B2) **shipped-area-cap enforcement** — caps are enforced on the engine *target*, never validated
  against the *detected* room polygon (so a detection-merge silently violates them);
  (B3) the **stair-as-excluded-void BEFORE detection** — the engine reserves a keep-out and mints a
  `stair` room, but room *detection* still runs over the stair footprint and can split it into two
  phantom rooms; the stair footprint is not registered as a detection-time exclusion;
  (B4) **robust polygon offset for non-orthogonal walls** — the miter-clamp fall-back ladder
  (`§DIAG-FLOOR-INSET`) is a symptom-management path, not a robust (Clipper-style) offset.

This ADR records the *doctrine* that resolves the inversion and pins where the SHIPPED plan must be
validated against the access graph. It is the access-graph companion to ADR-0063 (which fixed *which
layer owns what* for the house) and ADR-0062 (the deterministic graph solver). It does **not** claim
the engine lacks what it has; it pins the execution-boundary as the primary lever.

## Decision

**A generated domestic plan is governed by a typed, hierarchical ACCESS GRAPH that is defined FIRST
and then re-validated against the SHIPPED, DETECTED plan — not only against the engine's
pre-detection design.** Five binding sub-decisions:

**AG1 — The canonical access grammar is a typed graph, asserted as an invariant.** The grammar
`Street → Front door → Entrance hall → [Living/Kitchen/Dining/Stair] → Landing → [Bedrooms/Bathrooms]`
is the normative residential access topology (SPEC-ACCESS-GRAPH-AND-SPATIAL-GRAMMAR §2). The engine
already *builds* this graph (P5 `LayoutGraph`) and *encodes* its edge legality (the `accessFrom`
permission matrix); this ADR makes its satisfaction a **first-class invariant of the engine output
AND of the detected plan**, not merely a scoring term. Every habitable room must be reachable from
the front door by a legal door sequence; no private room may be the *sole* access to another private
room (a bathroom is never the only way into a bedroom).

**AG2 — Topology precedes geometry, and is RE-ASSERTED post-detection.** Per C53 §1 the topology
graph is the source of truth and geometry is its projection (already true engine-internal). The new
obligation: after the editor executes and `RoomDetectionEngine` re-detects rooms, the detected
room/door set MUST be reconciled back against the engine's access graph (`§ROOM-NAME-BIJECTIVE`
1:1 matching is the first slice; an access-graph reachability assertion over the detected doors is
the target). A detected plan whose access graph diverges from the engine's design is a **defect to
surface**, never silently shipped.

**AG3 — Area caps are validated on the DETECTED room, not only the engine target.** The
`§AREA-FRACTIONS` per-type min/max caps already clamp the engine target; this ADR additionally
requires the *detected* polygon to be checked against the same per-type caps. A detected room that
exceeds its cap by the founder's observed 50–200 % is a *detection-merge signal* and must be flagged
(`§DIAG-EXEC-AREA` ships this as a diagnostic today; a hard gate is the target). The founder's
per-type table (kitchen 10–18, living 18–28, bathroom 4–8, en-suite 3–6, bedroom 9–16, master
14–22 m²) is recorded normatively in the SPEC.

**AG4 — The en-suite is a parent-child constrained child of its master.** At most one en-suite per
master, directly adjacent to it, smaller than its parent, reachable ONLY through the master
(`ensuite.accessFrom = ['master']`, `programRules.ts`). The engine already enforces this; the
duplicate-"Stair"/duplicate-en-suite the founder saw was a *naming bijection* failure, fixed by
`§ROOM-NAME-BIJECTIVE`. The parent-child area invariant (en-suite ≤ parent) must additionally be
asserted on the detected pair.

**AG5 — The stair footprint is a single non-habitable VOID excluded from room detection BEFORE it
runs.** The engine already mints a `stair` RoomType and carves a keep-out; the missing piece is that
*room detection* must treat the contained stair world-footprint as an a-priori exclusion so it can
never split into two phantom rooms. (`§STAIR-CONTAIN-UPSTREAM` already guarantees keep-out == shipped
footprint, so the exclusion polygon is now well-defined and available to the detector.)

## Consequences

- **Positive:** the founder's headline defects (53 m² en-suite, duplicate Stair, door-less rooms,
  windowless rooms, phantom stair rooms) are reframed as *one* root class — execution-boundary
  fidelity — with a single observability spine (`§DIAG-EXEC-*`) and a single reconciliation seam
  (`§ROOM-NAME-BIJECTIVE` → access-graph re-assertion). Work is *targeted at the boundary*, not a
  rebuild of a mature engine.
- **Determinism preserved:** the access-graph re-assertion and the detected-room cap validation are
  *read-only* observers first (diagnostics), then *gates*; neither introduces randomness. The
  apartment single-plate path stays byte-identical (ADR-0061 I2).
- **Honest scope:** (A) is the dominant, cheaper lever and is already in flight; (B1)–(B4) are
  genuinely-new, staged work. The biggest single win remains making the *detected* plan faithful to
  the *designed* access graph — the engine designs well; the editor ships imperfectly.
- **Cost / staging:** AG2/AG3 land as diagnostics-first (shipped), then hard gates (queued); AG5
  needs a detection-time exclusion API on `RoomDetectionEngine`; (B4) robust offset is the largest,
  lowest-priority item.

## What already exists vs what changes (the honest ledger)

| Founder gap | Already in the engine (file:line) | Class | What changes |
|---|---|---|---|
| Access-graph-first grammar | C53 §1 (topology is source of truth); P5 `LayoutGraph` `tgl/semanticGraph.ts`; `accessFrom` matrix `programRules.ts:592` | A + **B1** | Re-assert the graph on the DETECTED plan, not only pre-detection |
| Entrance hall anchor (ground-only) | `§HALL-SINGLETON` + `§LANDING-NOT-HALL`/G14 `bubbleGraph.ts:160-178`; `hall.frontage='required'` | A | Bijective naming so the hall is never merged away |
| Landing = proper rectangle | upper `corridor` relabelled "Landing" `houseProgramFloor.ts` | A | Ensure detection yields a rectangle, not a sliver |
| Ground-floor WC / utility | `wc`/`utility` RoomTypes `programRules.ts:498-499` | A | Program inclusion + naming |
| Per-type ENFORCED caps at SHIPPED level | `§AREA-FRACTIONS` engine TARGET caps `programRules.ts:494`,`bubbleGraph.ts:256-279` | **B2** | Validate the DETECTED polygon vs the cap (`§DIAG-EXEC-AREA` → gate) |
| En-suite uniqueness / parent-child | `ensuite.accessFrom=['master']`, single-ensuite carve `subdivide.ts:460` | A (+ assert on detected) | `§ROOM-NAME-BIJECTIVE` (shipped) + detected area ≤ parent |
| Miter-clamp / diagonal degeneracy | `§DIAG-FLOOR-INSET` fall-back ladder; `§RECTIFY-SHELL-PROJECT` | **B4** | Robust (Clipper-style) offset OR enforce orthogonal/45° partitions |
| Window per-ROOM not per-WALL | `windowMandatory` per room + `emitWindows.ts` per-room emission; `§DIAG-EXEC-WINDOWS` flags WINDOW-ON-PARTITION | A | Per-room window assertion on the detected plan |
| Stair → 2 phantom rooms | `§STAIR-ROOM-TYPE` mint + keep-out; `§STAIR-CONTAIN-UPSTREAM` (keep-out == shipped) | **B3** | Register the stair footprint as a detection-time EXCLUSION before detection runs |
| Every room ≥1 door | `§SEALED-ROOMS`/`§CIRCULATION-REROUTE` + `§EVERY-ROOM-ACCESS-COMB`; `§DIAG-EXEC-DOORS` flags NO-DOOR | A | Door-coverage assertion on the detected plan |

## Alternatives considered

- **Rebuild the engine to be access-graph-first.** Rejected: the engine already builds the typed
  graph (P5) and C53 §1 already mandates topology-first; the inversion the founder observed is at the
  *output/detection* boundary, not the subdivision core. Rebuilding would discard a mature, tested,
  deterministic engine to fix a boundary problem.
- **Treat the 53 m² en-suite as an engine area-cap bug.** Rejected as a misdiagnosis: that area is
  impossible from the engine caps (`maxAreaFrac`), so it is necessarily a detection-merge — fixing
  the cap math would change nothing.
- **Keep the access-graph satisfaction a soft scoring term only.** Rejected: a soft term lets a plan
  ship with a land-locked or door-less room when no candidate is clean; the founder's "every room
  ≥1 door / reachable from the front door" is a hard invariant, hence AG1/AG2 as gates (post-diagnostic).

## Shipped as (provenance)

`§ROOM-NAME-BIJECTIVE` (AG4 naming bijection, 2026-06-10,
`apps/editor/src/ui/apartment-layout/matchDetectedRooms.ts` + `nameDetectedRooms.ts`),
`§DIAG-EXEC-*` (AG2/AG3 observability, `apps/editor/src/ui/house-layout/houseExecDiagnostics.ts`:
`§DIAG-EXEC-ROOMS`/`-AREA`/`-DOORS`/`-WINDOWS`/`-STAIR`/`-ROTATION`). Prior enablers: `§AREA-FRACTIONS`,
`§HALL-SINGLETON`, `§LANDING-NOT-HALL`, `§STAIR-ROOM-TYPE`, `§STAIR-CONTAIN-UPSTREAM`,
`§WINDOW-MANDATORY-RESCUE`, `§TOPO-HARD-REJECT`, `§EVERY-ROOM-ACCESS-COMB`. Tracker: §47. The
post-detection access-graph re-assertion gate (AG2), the detected-room cap gate (AG3), the
detection-time stair exclusion (AG5), and robust polygon offset (B4) are QUEUED.
