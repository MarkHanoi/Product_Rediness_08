# SPEC-CIRCULATION-GRAPH — Graph-theory residential circulation (founder, 2026-06-17)

Status: **canonical brief**. This governs the D-TGL house generator's circulation. A
layout that fails **any** invariant below is INVALID and must be rejected *before* scoring —
not down-weighted. Origin: founder message "§CIRCULATION-GRAPH — COMPLETE ARCHITECTURAL
REBUILD" (2026-06-17). Implementation lives in `packages/ai-host/src/workflows/houseLayout/`
(stair) + `apartmentLayout/tgl/` (subdivide, enumerate, wallsAndDoors) + `rules/programRules.ts`.

## PART 1 — The access-graph model (DAG)

Circulation is a DAG; an edge = "has a door into", direction = reachable-from-entry. Every
habitable room has **exactly one parent**:
- Public rooms → parent = entrance hall (GF) or corridor (FF)
- Private rooms → parent = corridor (both floors)
- En-suite → parent = master bedroom ONLY

Three valid topologies:
- **A — Ground floor (public zone present):** FRONT DOOR → ENTRANCE HALL (root) → {stair, living, GF corridor}. living ══(open weld)══ kitchen ══ dining. GF corridor exists ONLY if a GF bedroom exists; it serves {bedroom, bathroom}.
- **B — Upper floor (no public zone):** STAIR KEEP-OUT → STAIR LANDING (root) = corridor start → {bathrooms, bedrooms, master}; master → en-suite.
- **C — Single storey:** entrance hall serves everything directly.

**G0** — every habitable room has exactly one parent; no orphan (no door); none reachable only
through another private room; none with >1 corridor-level parent.

## PART 2 — Stair as a vertical graph edge
- **S1 (GF):** sharedWall(stairKeepOut, entranceHall) ≥ 0.9m — the only permitted GF stair connection.
- **S2 (FF):** sharedWall(stairKeepOut, corridor) ≥ 0.9m; corridor originates at the stair.
- **S3:** stair position determines corridor axis — abuts RIGHT→corridor runs left(x); BACK→forward(z); LEFT→right(x); CENTRE→plate long axis.
- **S4:** stair keep-out overlaps no habitable cell; opens onto corridor (FF) / hall (GF) only.

## PART 3 — Ground-floor graph rules
- **GF-R1** entrance hall is the only front-door node; on street-facing shell edge; area 8–18m²; width ≥1.8m, depth ≥2.0m.
- **GF-R2** living/kitchen/dining are children of the hall (or of each other via open-plan weld).
- **GF-R3** open-plan weld is NOT a door: kitchen↔dining → openZone=true, no wall, maxDoors=0; dining reaches circulation via kitchen → not sealed.
- **GF-R4** GF corridor is ONE door off the hall; never connects to living/kitchen/dining.
- **GF-R5** GF bedroom & bathroom are children of the corridor only (no door to hall).
- **GF-R6** corridor exists ⟺ GF bedroom exists.
- **GF-R7** no public room touches the corridor (no door or open-zone threshold).

## PART 4 — Upper-floor graph rules
- **FF-R1** corridor is the root; corridor cell shares ≥0.9m wall with stair keep-out; corridorReachM > 0.
- **FF-R2** corridor length ≥ Σ(served room widths along corridor axis) × 0.90.
- **FF-R3** every bedroom (incl. master) has a direct corridor door; never reached through another bedroom/bathroom.
- **FF-R4** every non-ensuite bathroom has a corridor door; bathrooms sit ALONG the corridor, not blocking the landing.
- **FF-R5** en-suite shares a wall ONLY with master; any corridor-shared wall is SOLID (accessFrom = ['masterBedroom'] only).
- **FF-R6** placement order from stair outward: landing(1.5m) → bathrooms(mid) → bedrooms(outer) → master(terminus) → en-suite(off master).

## PART 5 — Hard rejection gates (ORDERED; first failure = reject, no scoring)
0 stair lands on circulation only · 1 GF root exists (8–18m²) · 2 root on perimeter · 3 stair touches root ≥0.9m · 4 GF corridor attached to root ≥0.9m · 5 NO public room on corridor · 6 GF bedroom on corridor only · 7 GF bathroom on corridor only · 8 FF corridor touches stair ≥0.9m · 9 every FF bedroom on corridor · 10 every FF bathroom on corridor · 11 en-suite NOT on corridor (solid wall) · 12 no sealed room · 13 open-plan weld is open (dining not sealed by a solid weld).

## PART 6 — Corridor carve: axis selection (FF)
Axis chosen relative to STAIR position, not plate long axis. minDist to each dominant-rect edge;
EDGE_THRESHOLD=2.0m. >threshold → central → plate long axis. Else corridor runs ALONG the stair's
wall, stair-end edge touching the keep-out. HARD GATE: if resulting corridor doesn't share ≥0.9m
with stairKeepOut → return null (wrong axis, try fallback). **Do NOT inject a corridorStub when the
gap > 0.5m** — a large gap means the wrong axis was chosen.

## PART 7 — Open-plan weld (dining seal fix)
`programRules`: when `openPlanKitchenDining`, kitchen↔dining pairRule { openZone:true,
dividerPermitted:false, maxDoors:0 }; ensure dining.accessFrom includes 'kitchen'.
`wallsAndDoors` MERGE-DIVIDER: if pair is kitchen↔dining && openPlanKitchenDining && dividerPresent
&& !openZone → force openZone=true, weldDropped=true.

## PART 8 — Verification checklist (run after every layout)
GF: hall exists & 8–18m² · hall perimeterAdjacent · stair↔hall ≥0.9 · corridor⟺bedroom · corridor↔hall
≥0.9 · bedroom.parent=corridor · bathroom.parent=corridor · no public↔corridor door · openPlanKD ⇒
kitchen↔dining openZone & dining not sealed · GF sealed=[].
FF: corridor↔stair ≥0.9 · corridorReachM>0 · every bedroom↔corridor ≥0.9 · every bathroom↔corridor
≥0.9 · ensuite.accessFrom=['masterBedroom'] · ensuite↔corridor <0.9 (solid) · FF sealed=[].
Both: stair overlaps no room · corridor aspect ≥3:1 (spine not blob) · no bedroom reached only through another bedroom.
Any failure ⇒ hardValid=false ⇒ REJECT, try next enumeration.

---
### Implementation status (2026-06-17)
- **Stair anti-fragment (PART 2/S3 upstream):** DONE on HEAD — `chooseStairCorePosition`
  penalises central (`PERIMETER_PREFERENCE=1.0`) and fragmenting mid-edge (`FRAGMENT_PENALTY=0.5`,
  `MID_EDGE_NO_CORNER_PENALTY=2.0`). Verified: for plate 16958×14446 it picks a back-corner stair,
  NOT central. A production log showing `kind=central <-- WINNER` is a STALE bundle (hard-refresh).
- **FF axis (PART 6):** `§STAIR-FACE-AXIS` shipped (`00de6362`). Remaining: drop corridorStub when gap>0.5m.
- **PART 5 gates:** the framework exists in `enumerate.ts` (corridorStairGap/corridorHallGap/publicOnCorr/corrBlob). Gates reject; they don't PRODUCE a valid candidate — that's the carve's job.
- **PART 7 weld:** not yet wired at the real divider site (MERGE-DIVIDER line is pre-weld diagnostic only).
- **GF structured carve (PART 3 topology):** the hall-hinge carve (`tryHallHingeCarve`) encodes it but only fires when `dominantFrac ≥ 0.4`; a corner stair (now selected) should restore a high dominantFrac so it fires.
- **FF-R5 en-suite off corridor:** SHIPPED (`5baafcd7`) — `tryCarveEnsuiteFromMaster` takes the corridor rect, carves the en-suite on the master face away from it.
- **PART 6 stub gap-cap:** SHIPPED (`c55d0823`) — upper-floor `findCorridorStubToKeepOut` capped at 0.5 m gap; ground floor uncapped.

### FF-R1: the polygon L/T/U corridor — SHIPPED (Phase 1-4, 2026-06-17)
**Status: LIVE on main.** Phase 1 (`cellPolygonById` channel through subdivide→finalise→enumerate
`cellPolyByIdWorld`), Phase 2 (`emitPolygonCorridorLeg` — L-leg through empty space to the stair,
`§POLYGON-CORRIDOR-LEG`), Phase 3 (polygon-aware gates — `sharedWallRunPolyM` + `corridorStairGapFor`
read the corridor polygon, `§POLYGON-NATIVE-SEAM`), and Phase 4 (`§POLYGON-CORRIDOR-ARM` — threads
both arms so far-arm rooms abut, L→T/U) are all integrated; `wallsAndDoors` + `semanticGraph` consume
the polygon. Also shipped 2026-06-18: §ROOF-SIT-ON-WALL-HEAD (flat roof lifted by its thickness off
the wall head, so it no longer clashes with the upper-floor walls).

**§PERIMETER-PN-RECTIFY — ATTEMPTED THEN REVERTED.** Minting the upper perimeter in the partitions'
Project-North frame closed the post-openings L-corner seam in theory, but it moved the upper shell off
the (un-rectified) GROUND shell → the storeys stopped stacking ("wall exterior edges not good"). It is
NOT on main. The L-corner-gap-after-openings and the window/door placement-drift are instead handled
ALIGNMENT-PRESERVINGLY in the execution engine — see `EXECUTION-ENGINE-RENDER-DEFECTS-AUDIT.md`
(defect 2 = re-base the opening offset against the live mitred wall; defect 3 = broaden the
§NEAR-CORNER-L recovery so a `bothMitred` corner actually closes). Remaining circulation work: FR-1
suite-fallback (below).

---
## Founder feature requests (2026-06-17) — circulation completeness

These are the architecturally-sound answers to "a private room ends up served through
another room (e.g. bedroom→dining) because the corridor can't reach it."

### FR-1 — SUITE FALLBACK (master/en-suite in corridor-unreachable regions)
When the corridor cannot reach a private region (a far arm of a fragmented/L plate), DON'T
ship a corridor-dependent bedroom served through a public room. Instead allocate a
**self-contained suite** there: a `master` (+ optional `ensuite`) — the en-suite is accessed
ONLY from the master (FF-R5), and the master takes the corridor/hall door it can get. One or
MORE en-suite bedrooms may be placed this way. Net: every private room is either (a) on the
corridor, or (b) a self-contained suite — never "bedroom reachable only through the dining room".

**Code-grounded analysis (2026-06-17) — the obvious recipe is UNSOUND; here is the real shape.**
The intuitive fix ("re-type the unreachable bedroom → master so it can take a door") does NOT
work: `bedroom.accessFrom = ['corridor','living','dining']` ALREADY permits a living/dining door
(`programRules.ts:528`), and the door router's pass-i already attempts a private→public door,
with the over-cap pass relaxing the cap for any *permitted* pair (`wallsAndDoors.ts:1433-1457`).
A sealed bedroom logs `NO DOOR` because it is **geometrically landlocked** — no ≥0.9 m wall to
corridor, living, OR dining — not because of a permission/type cap. Re-typing to `master`
(`accessFrom` superset, `programRules.ts:486`) grants no new door, so it cannot reach an isolated
region. FR-1's true levers are therefore:
  1. **Geometry (already shipped):** extend circulation into the far region so its room abuts a
     reachable wall — this is exactly Phase-4 `§POLYGON-CORRIDOR-ARM`. When the arm reaches, the
     bedroom is served normally (no suite needed). The residual FR-1 case is ONLY a region the
     arm cannot reach AND that abuts a reachable PUBLIC room.
  2. **Scoring reclassification (the residual, RISKY):** in that residual case a master-suite
     doored off the living area is *architecturally acceptable*, whereas a plain
     bedroom-served-only-through-living is a *circulation compromise*. So FR-1's value is to
     RECLASSIFY the room's type so the corridor-quality / public-on-corridor gates treat it as
     acceptable and the candidate can WIN. This is inherently **per-candidate** (the retype must
     happen after subdivide proves the region unreachable, before scoring) — the precise pattern
     the reverted sealed-rescue showed perturbs the scorer + regresses the area-cap
     (see memory `house-doors-stair-fragmentation-root`). It MUST be done post-selection (rescue
     the WINNER only) or behind a gate that provably never changes a currently-passing candidate,
     and validated against the full 2749 + browser. NOT a quick edit — a focused, test-gated task.
Touch points (when undertaken): a POST-SELECTION suite rescue on the chosen winner (retype its
landlocked-but-public-abutting bedroom → master+ensuite, place the master's public door, mark the
ensuite solid-except-master) — NOT a per-candidate enumerate retype.

### FR-2 — L / T / U CORRIDOR — SHIPPED (= Phase 4)
This IS Phase 4 `§POLYGON-CORRIDOR-ARM` (live on main): the corridor polygon is threaded through the
dominant **and** secondary (and tertiary) fragments as an L / T / U so every private room in every arm
abuts it — the rect-free way to serve a multi-arm plate from one corridor, on the Phase-1
`cellPolygonById` channel + Phase-3 polygon-aware gates. Residual edge cases (a region NO arm can
reach) fall to FR-1.

### FR-3 — ENTRANCE-HALL FRONT DOOR ON THE PERIMETER (always)
The entrance hall's MAIN (and on the GF, effectively only mandatory) door is the FRONT DOOR,
and it MUST land on an EXTERIOR/perimeter wall of the hall (GF-R1: hall.perimeterAdjacent).
Today `§DIAG-ENTRANCE-PERIMETER boundsShellWall=YES` says it CAN, but the realised front door
often isn't placed on the perimeter. Enforce: the hall always gets a front door hosted on its
shell-perimeter wall (door router / executor), not an interior wall.

---
## PART 9 — DOORS AS FIRST-CLASS GRAPH ENTITIES + MAXIMUM CIRCULATION (founder, 2026-06-29)

Origin: founder "the circulation scores are TOO LOW … we need MAXIMUM = every habitable room
cell is reachable through circulation. DOORS must become first-class ENTITIES in the graph —
a circulation edge between two rooms is only REAL if a DOOR connects them." This generalises to
**ANY typology** (house / apartment / residential building): circulation is a platform concept.
See ADR-062. Implementation slice (graph + scoring) is LIVE in
`apps/editor/src/ui/apartment-layout/layoutBubbleGraph.ts`.

### 9.1 — The model (door-aware bipartite-ish graph)
- Nodes are of TWO kinds: **room nodes** (one per room, sized by door-degree) and **door nodes**
  (one small node per realised opening, placed at the midpoint of the edge between the two rooms
  it connects). A room↔room circulation edge is drawn as **room — door — door-node — room**.
- An edge is REAL (solid violet) **iff** a door connects the two rooms — sourced from
  `room.doorAdjacentTo` (the realised opening graph emitted by `emitGeometry.ts`, the
  `permeable` set / `CONNECTS_THROUGH` edges), NOT `adjacentTo` (mere wall-sharing).
- A wall-shared-but-doorless adjacency renders as a **faint dashed** edge with NO door node — so
  a room reachable only WITHOUT a door is visibly NOT solidly connected (founder's "just because
  it's adjacent … needs a door, otherwise not compliant").
- Pre-deploy parity: when no room carries `doorAdjacentTo`, every wall edge is treated as a door
  (graph unchanged from the old wall-adjacency rendering).

### 9.2 — Reachability is door-PATH from the entrance (the score correctness fix)
`computeCirculationReachability(option)` (pure, deterministic, exported from `layoutBubbleGraph.ts`)
BFS-es from the storey entrance (hall → stair → first circulation room) over the DOOR graph and
returns `{ reached, total, fraction, unreachedRoomNames, hasDoorGraph }`:
- **Habitable** = NOT a circulation space (corridor/hall/stair are the spine, not destinations)
  and NOT served-within-parent (en-suite via master is allowed).
- A room is **reached** ONLY via a path of door-connected rooms — transitive over doors (a
  walk-through-bedroom-to-bedroom counts as reached IF a door path exists; a sealed room does
  not; a room touching the corridor by a wall with no door does not).
- **`fraction === 1.0` ⟺ MAXIMUM circulation** — every habitable room has a door path to the
  entrance. This is the true circulation number; mere wall-adjacency can no longer inflate it.

This is the single door-aware source of truth shared by the graph's RED-node logic
(`§GRAPH-COMPLIANCE-RED` / `§CIRC-REACH`) and any displayed circulation %.

### 9.3 — The "score 84" diagnosis (why the displayed number is < 100)
The per-floor "score NN" in the house/apartment modal is `option.score.overall` — a SOFT
weighted sum over ~23 cognition axes (efficiency, daylight, privacy, proportionalElegance,
`corridorAccess`, …), NOT a circulation-completeness percentage. Even a layout with PERFECT
door circulation scores < 100 because the other soft axes (corridor area penalty, daylight
reach, elegance, …) never simultaneously max out. So "84" was never a circulation failure
signal by itself. The architecturally meaningful circulation number is `computeCirculationReachability().fraction`
(hard) + the soft `corridorAccess` axis (`measureCorridorAccess`, already door-aware via
`CONNECTS_THROUGH`). **Recommendation:** surface the circulation % SEPARATELY in the modal
("circulation 100%") rather than conflating it with the multi-axis design `score`, and gate
`fraction === 1` as the demo target. (Graph + reachability shipped; modal-label wiring is the
next, small, follow-up.)

### 9.4 — GUARANTEE maximum circulation in the generator (cross-typology)
The generator must GUARANTEE `fraction === 1` for the chosen winner across ALL typologies. The
hard gates already reject `unreachableHabitableRoomIds.length > 0` (enumerate.ts) and
`servedThroughPrivateRoomIds` — both door-set based. The remaining levers (precise, staged):
1. **House:** the residual unreachable case is FR-1 (a fragmented-plate far region) — handle by
   the POST-SELECTION suite rescue (retype the landlocked-but-public-abutting bedroom →
   master+ensuite + place its door), NOT a per-candidate retype (see FR-1 analysis above).
2. **Apartment:** the door router (`wallsAndDoors.ts`) must emit a circulation door for every
   gated private room; `corridorAccess` already scores it and the reach gate rejects gaps.
3. **Residential building:** each per-cell apartment runs the same gate; the shared core/corridor
   must door onto every unit entrance (corridor-reaches-stair contiguity, `§CORRIDOR-STAIR-CONTIGUITY`).
The platform invariant: **a winner ships only if `computeCirculationReachability().fraction === 1`**
— wire this as a final hard gate in each orchestrator (house/apartment/resi). The graph + the
pure reachability predicate (this slice) make that gate trivial to add and to TEST.
