# SPEC — Access Graph & Spatial Grammar (residential generative layout)

> **Status**: DRAFT (normative once ratified). **Date**: 2026-06-10.
> **Governed by**: [ADR-0066 — Access-Graph-First Generative Layout Doctrine](../../02-decisions/adrs/0066-access-graph-first-generative-layout-doctrine.md)
> · [C53 — Generative Layout Engine Architecture](../../02-decisions/contracts/C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md) (§1 topology-before-geometry)
> · [C52 — Editable Building Graph](../../02-decisions/contracts/C52-EDITABLE-BUILDING-GRAPH.md).
> **Companion specs**: [SPEC-ARCHITECTURAL-PROGRAM-RULES](./SPEC-ARCHITECTURAL-PROGRAM-RULES.md) (the room DB)
> · [SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE](./SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md) (the P1→P9 pipeline)
> · [SPEC-CASA-UNIFAMILIAR-TYPOLOGY](./SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md) (the multi-storey house).
> **Reference**: [LAYOUT-GENERATION-ALGORITHM](../../04-reference/LAYOUT-GENERATION-ALGORITHM.md) (engine walkthrough, file:line).
> **Tracker**: master-execution-tracker §47.

This SPEC is the normative companion to ADR-0066. It is written as an **honest ledger**: each rule is
mapped to **where it is ALREADY enforced in the engine (file:line)** versus **the NEW work needed at
the execution boundary**. The dominant lever is execution-boundary fidelity (the engine designs well;
the editor ships imperfectly), NOT rebuilding the engine.

---

## §1 — Framing: the two failure classes (A) and (B)

A generated plan can diverge from the founder's grammar for two distinct reasons:

- **(A) EXECUTION-BOUNDARY fidelity** — the engine designed it correctly, but the *editor execution /
  room detection / naming* lost it. Dominant cause. Surfaced by `§DIAG-EXEC-*`
  (`apps/editor/src/ui/house-layout/houseExecDiagnostics.ts`) and reconciled by `§ROOM-NAME-BIJECTIVE`
  (`apps/editor/src/ui/apartment-layout/matchDetectedRooms.ts`). A 53 m² en-suite is **impossible**
  from the engine caps → it is a *detected merged polygon*, class (A).
- **(B) GENUINELY-MISSING / doctrine-level** — a real gap that needs new engine or detection work:
  the post-detection access-graph re-assertion, detected-room cap validation, the stair-as-excluded
  void, and robust non-orthogonal polygon offset.

Every rule below is tagged `ALREADY-ENGINE`, `EXECUTION-BOUNDARY`, or `NEW`.

---

## §2 — The canonical access grammar (the typed access graph)

**Rule G — A domestic plan is a HIERARCHICAL ACCESS GRAPH, defined first, satisfied by geometry.**
The normative residential grammar for a two-storey house:

```
Street ──▶ Front door ──▶ Entrance hall ──▶ [ Living | Kitchen | Dining | Stair ]
                                                              │
                                                            Stair
                                                              ▼
                                          Landing ──▶ [ Bedroom* | Bathroom* | En-suite(of master) ]
```

Invariants (each a legal-door reachability statement, NOT a geometry statement):

- **G1** Every habitable room is reachable from the front door by a sequence of LEGAL doors.
- **G2** The front door lands in a **single entrance hall** (ground-only); the hall opens only to the
  social zone and the corridor — never directly to a bedroom or bathroom.
- **G3** Private rooms hang off circulation (corridor / landing), never off another private room; a
  bathroom is **never** the sole access to a bedroom.
- **G4** Upper floors are reached by the stair, arriving at a **Landing** (circulation), from which a
  continuous corridor reaches every upper bedroom and bathroom.

**Where already enforced (`ALREADY-ENGINE`):**
- The typed access graph is built at **P5** — `tgl/semanticGraph.ts` produces the persistent
  `LayoutGraph` (Spaces / Walls / Openings / Doors / Windows + typed edges), per the master doc §1.
- C53 **§1** already binds "topology is the source of truth; geometry is a projection of it."
- Door legality (G1/G3) is the **permission matrix** `accessFrom` in `rules/programRules.ts:246`
  (`ROOM_RULES`), tested by `doorAllowedBetween` (`programRules.ts:592`): `hall.accessFrom =
  ['living','corridor']`; `bathroom.accessFrom = ['corridor']` only (`§BATH-CORRIDOR-ONLY`);
  `ensuite.accessFrom = ['master']` only; `bedroom.accessFrom` excludes `bedroom` and `maxDoors = 1`
  (a bedroom is never reachable only through another bedroom).
- The single ground-only hall (G2) is `§HALL-SINGLETON` + `§LANDING-NOT-HALL`/G14
  (`bubbleGraph.ts:160-178`); the upper "Landing" is the relabelled engine `corridor`
  (`houseProgramFloor.ts`).
- Door coverage (G1) is `§SEALED-ROOMS` / `§CIRCULATION-REROUTE` (`wallsAndDoors.ts`) +
  `§EVERY-ROOM-ACCESS-COMB`.
- The hard gate `§TOPO-HARD-REJECT` (`enumerate.ts:252-258`) already ranks below every clean
  candidate any tiling with a windowless habitable room / a land-locked room / a private-room-off-hall
  / a room overlap.

**What is NEW (`B1` / `EXECUTION-BOUNDARY`):** the access graph is consumed as a *scoring input* and a
*pre-detection design*. It is **not re-asserted against the detected plan** the user receives. The new
obligation: after `RoomDetectionEngine` runs, reconcile the detected door/room set against the
engine's `LayoutGraph` and surface any divergence (G1–G4 violated on the shipped plan = a defect).
`§ROOM-NAME-BIJECTIVE` is the first slice (1:1 room identity); the access-graph reachability assertion
over the *detected* doors is the target gate.

---

## §3 — Room-type vocabulary completeness

**Rule V — The grammar requires a complete typed vocabulary.** Required anchors: an **entrance hall**
on the ground storey as the access root; a **proper rectangular landing** upstairs; a **ground-floor
WC**; a **utility**.

**Where already enforced (`ALREADY-ENGINE`):** the `RoomType` union has 14 members incl. `hall`,
`corridor` (relabelled "Landing" upstairs), `wc`, `utility`, `ensuite`, `stair`
(`programRules.ts` `ROOM_RULES`, master doc §4.1.1). `ROOM_RULES` is a `Record<RoomType, RoomRule>`
so a missing member fails to compile.

**What is NEW (`EXECUTION-BOUNDARY`):** ensure these types are actually *included in the program* for
the relevant storey (ground WC / utility are program-inclusion choices, not vocabulary gaps) and that
the **landing detects as a rectangle, not a residual sliver** — a detection-quality requirement, not a
vocabulary one.

---

## §4 — Shipped-area-cap enforcement (per-type min/max, validated on the DETECTED room)

**Rule A — Every room must obey per-type min/max area caps; the cap is validated on the SHIPPED,
DETECTED polygon, not only the engine target.** The founder's normative per-type table:

| Room type | Min (m²) | Max (m²) |
|---|---|---|
| Kitchen | 10 | 18 |
| Living | 18 | 28 |
| Bathroom | 4 | 8 |
| En-suite | 3 | 6 |
| Bedroom | 9 | 16 |
| Master bedroom | 14 | 22 |

**Where already enforced (`ALREADY-ENGINE`):** the size-scaled `§AREA-FRACTIONS` clamps on the engine
**target** — `minAreaFrac`/`maxAreaFrac` per rule (`programRules.ts:494`, e.g. `bedroom.maxAreaFrac
0.16`, `master 0.20`, `living 0.32`, `kitchen 0.16`) applied in `bubbleGraph.ts:256-279`
(`target = clamp(weight share, [max(minAreaM2, minAreaFrac·A), maxAreaFrac·A])`). These plus
`minAreaM2`/`minShortSideM` (UK Building-Regs / HQI `DB-NNN` minima) mean a room *as designed* cannot
violate the caps by 50–200 %.

**What is NEW (`B2` / `EXECUTION-BOUNDARY`):** the caps are never checked against the **detected**
polygon. A detected room that exceeds its per-type cap is a *detection-merge signal* (two engine rooms
flooded into one). `§DIAG-EXEC-AREA` (`houseExecDiagnostics.ts`) already logs, per detected room,
`detectedArea vs engineTarget vs cap` with an `OK / ⚠ OVER-CAP / ⚠ NO-ENGINE-MATCH` verdict — this is
the diagnostic. The target is a **gate**: a detected room over its cap (or with no engine match) blocks
"clean" status and is surfaced to the user. Note: the founder's table uses absolute m²; the engine uses
size-scaled fractions. The reconciliation rule is: **the detected room must satisfy the tighter of
{absolute table cap, `maxAreaFrac × plate`}** for the diagnostic verdict.

---

## §5 — En-suite parent-child invariant

**Rule E — At most ONE en-suite per master; directly adjacent; smaller than its parent; reachable ONLY
through the master.**

**Where already enforced (`ALREADY-ENGINE`):** `ensuite.accessFrom = ['master']` only
(`programRules.ts`); the en-suite is carved from **inside** the master's squarified rect
(`tryCarveEnsuiteFromMaster`, `subdivide.ts:460`) so the only-permitted master↔ensuite shared wall
exists and the en-suite is strictly a sub-region of (hence smaller than) the master. The bubble graph
auto-mints at most one ensuite (master-attached) (`bubbleGraph.ts` mint order).

**What is NEW (`EXECUTION-BOUNDARY`):** the founder's *duplicate en-suite / duplicate "Stair"* was a
**naming collision** (two detected rooms mapped to the same engine label), not an engine duplication.
Fixed by `§ROOM-NAME-BIJECTIVE` (`matchDetectedRooms.ts`): a pure two-pass bijective match
(direct-containment → nearest-unused fallback) so each engine room maps to exactly one detected room and
no label is emitted twice. The remaining NEW assertion: validate on the *detected* pair that
`area(ensuite) < area(master)` and that the ensuite's only door is to the master.

---

## §6 — Stair-as-void, excluded from room detection BEFORE it runs

**Rule S — The stair footprint is a single non-habitable VOID; it must be EXCLUDED from room detection
before detection runs, so it never splits into two phantom rooms.**

**Where already enforced (`ALREADY-ENGINE`):** the engine mints a `stair` RoomType
(`§STAIR-ROOM-TYPE`, `programRules.ts:433`, `enumerate.ts:385-460`), carves the core as a keep-out
before subdivide (`§STAIR-KEEPOUT` / `§STAIR-OBSTACLE-CARVE`), corner-anchors it (`§STAIR-CORNER-ANCHOR`
/ ADR-0063 H4), and — crucially — now guarantees **keep-out == shipped footprint by construction**
(`§STAIR-CONTAIN-UPSTREAM`, ADR-0063 H3, `houseOrchestrator.ts`). So the exact contained world
footprint of the stair is well-defined and available.

**What is NEW (`B3` / `EXECUTION-BOUNDARY`):** `RoomDetectionEngine` still runs over the stair region
and can detect two phantom rooms (the founder's observation). The NEW work: feed the contained stair
world-footprint to detection as an **a-priori exclusion polygon** so the detector emits exactly one
non-habitable "Stair" void there and never a habitable room. `§DIAG-EXEC-STAIR` already asserts
"exactly ONE detected room overlaps the stair keep-out; ⚠ HABITABLE-ON-STAIR otherwise"
(`houseExecDiagnostics.ts`) — the diagnostic for this rule.

---

## §7 — Per-room window requirement (per-ROOM, not per-WALL)

**Rule W — Window placement is a per-ROOM requirement: every habitable room that fronts an exterior
wall gets ≥1 window on its best exterior face; partition (interior) walls never host windows.**

**Where already enforced (`ALREADY-ENGINE`):** window emission is **per-room**, not per-wall —
`windowEmission/emitWindows.ts` places windows room-by-room with a sun-biased best face,
`§WINDOW-CORNER-SETBACK`, multi-window distribution and climate sizing; `windowMandatory` rooms
(living/kitchen/master/bedroom) are protected by `§WINDOW-MANDATORY-RESCUE` (`shellWallMatch.ts`) so a
mandatory room never ships with 0 windows; `shellWallMatch.ts` maps engine windows onto the
**pre-existing shell** walls and `§DIAG-PARTY-WALL` suppresses a blind party façade. `windowMandatoryFor`
/ `windowDesiredFor` (`programRules.ts:681`/`:702`) separate the LEGAL hard-window set from the wider
"every room wants a window" set.

**What is NEW (`EXECUTION-BOUNDARY`):** assert the requirement on the *detected* plan. `§DIAG-EXEC-WINDOWS`
(`houseExecDiagnostics.ts`) already flags, per perimeter-fronting detected room, `⚠ NO-WINDOW`, and
flags `⚠ WINDOW-ON-PARTITION` when a window's host wall is an interior partition rather than the shell —
directly the founder's "per-wall not per-room" symptom. The target is to promote these to a gate
(every frontage room → ≥1 shell window; zero windows on partitions).

---

## §8 — Door-coverage guarantee

**Rule D — Every room has ≥1 door, and that door connects it to the access graph (circulation), per
the permission matrix.**

**Where already enforced (`ALREADY-ENGINE`):** `§SEALED-ROOMS` + `§CIRCULATION-REROUTE`
(`wallsAndDoors.ts`) reconcile doors so every room opens onto circulation; `§EVERY-ROOM-ACCESS-COMB`
gives every room a corridor wall; `§DOOR-MINIMUMS` (`programRules.ts` `MIN_DOOR_WIDTH_BY_TYPE`) sets the
clear-width floor; `maxDoorsFor` enforces the privacy door cap (bedroom 1, master 2, bathroom 1).

**What is NEW (`EXECUTION-BOUNDARY`):** assert on the detected plan. `§DIAG-EXEC-DOORS` already counts
door openings on each detected room's bounding walls and flags `⚠ NO-DOOR` (the founder's "8/10 rooms
door-gaps=0"). The target is a gate: a detected room with zero doors blocks "clean" status.

---

## §9 — Non-orthogonal geometry robustness (the miter-clamp warnings)

**Rule R — Diagonal-wall geometry degeneracy (the miter-clamp warnings) must be resolved by a robust
polygon offset OR by enforcing orthogonal / consistent-45° partitions.**

**Where already enforced (`ALREADY-ENGINE` — symptom management):** the floor-inset miter ladder
`§DIAG-FLOOR-INSET` / `§FLOOR-INNER-FACE` (`room-topology/RoomPolygonUtils.ts:268-372`,
`CreateFloorsByRoomTypeCommand.ts`) with near-parallel / runaway-corner / winding-inversion fall-backs;
`§RECTIFY-QUAD` (skewed convex quad → bbox) and `§RECTIFY-SHELL-PROJECT` (project partition endpoints
onto the real sheared shell within 20 mm by construction) keep the interior orthogonal and only move
perimeter contacts (master doc §3.2, §3.4).

**What is NEW (`B4` / `NEW`):** the miter ladder is a *fall-back*, not a robust offset. The doctrine
choice (ADR-0066) is either a robust Clipper-style polygon offset for the inset, or a hard constraint
that interior partitions are orthogonal / consistent-45°. Lowest priority of the (B) items.

---

## §10 — Acceptance signals (the `§DIAG-EXEC-*` spine)

The single console paste that tells us where quality is lost between the engine DESIGN and the editor
SHIP (`houseExecDiagnostics.ts`), per level:

| Signal | Asserts | Rule |
|---|---|---|
| `§DIAG-EXEC-ROOMS` | `engineRooms=N vs detectedRooms=M` (+ mismatch list) — the single most important line: proves whether detection merged/split | §2 / §4 |
| `§DIAG-EXEC-AREA` | per detected room: `detected vs engineTarget vs cap` → OK / ⚠ OVER-CAP / ⚠ NO-ENGINE-MATCH | §4 |
| `§DIAG-EXEC-DOORS` | per detected room: door count; ⚠ NO-DOOR | §8 |
| `§DIAG-EXEC-WINDOWS` | per frontage room: window count; ⚠ NO-WINDOW; ⚠ WINDOW-ON-PARTITION | §7 |
| `§DIAG-EXEC-STAIR` | exactly ONE detected room overlaps the stair keep-out; ⚠ HABITABLE-ON-STAIR | §6 |
| `§DIAG-EXEC-ROTATION` | (emitted from the executor) the principal-axis rotation applied to the shipped result | §9 |
| ROLLUP | `roomsWithDoor=X/M windowless=Y overCap=Z noEngineMatch=W` | all |

**Diagnostics-first → gate.** Each signal ships as a read-only observer (done), then becomes a hard gate
(queued) once stable on the founder's repro plot — keeping determinism (ADR-0061 I2) intact.

---

## §11 — Out of scope / explicit non-goals

- Re-writing the deterministic 8-strategy enumeration or the 21-axis objective vector (mature; C53 /
  SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE).
- Introducing randomness or a population optimiser (ADR-0062 forbids it).
- Multi-apartment floor-plate / shared-core scope (separate brief; tracker references the
  multi-apartment brief).
