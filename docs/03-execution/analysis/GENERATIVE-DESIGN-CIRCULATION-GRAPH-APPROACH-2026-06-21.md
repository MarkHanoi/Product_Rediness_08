# Generative residential design — the graph approach, focused on circulation (2026-06-21)

A reference for how PRYZM's D-TGL engine generates a residential house from a brief, and — the focus
of this doc — **how circulation (entry → corridor → rooms, and the stair) is treated as a first-class
graph concern, not a leftover of room packing.** Companion to `LAYOUT-GENERATION-ALGORITHM.md`,
`ADR-0066` (access-graph-first), `ADR-0068` (circulation-first building graph), `ADR-0073`
(Hierarchical Access Graph / corridor-as-spine), `C53` §13.

---

## 0. The thesis: a layout IS a graph, and circulation is its skeleton

A residential plan is, at heart, an **access graph**: nodes are spaces (rooms + circulation), edges
are *permeable boundaries* (doors / open thresholds). A plan is "good" when:

1. **Every habitable room is reachable** from the entrance without passing through another private
   room (you don't walk through bedroom A to reach bedroom B).
2. **Circulation is explicit** — a hall at the entrance, a corridor spine that serves the private
   rooms, a landing where the stair arrives — not a residual gap between rooms.
3. **The door graph honours architectural permission** (`programRules.ts`): a bedroom doors onto a
   corridor, never onto another bedroom; an ensuite doors only off its master; public rooms (living/
   kitchen/dining) cluster off the hall, not the bedroom corridor.

PRYZM builds this graph FIRST (the bubble graph), then realises geometry that satisfies it — the
"access-graph-first" doctrine (ADR-0066). The persistent defects this session (sealed bedrooms,
isolated stair, public-on-corridor) all trace to one anti-pattern: **circulation emerging as a side
effect of area-packing instead of being a driver.** The fix direction is to make the corridor a
*derived spine* the rooms hang off (ADR-0073).

---

## 1. The pipeline (where circulation is decided)

```
BRIEF (bedrooms, baths, storeys, …)
  │
  ├─ storeyAllocation.ts ───────── split program across storeys.
  │     GROUND = social (living/kitchen/dining/hall) + 1 guest bedroom + WC.
  │     UPPER  = bedrooms + baths + ensuite; stair arrives at a LANDING (corridor), NOT a 2nd hall.
  │
  ├─ P2  bubbleGraph.ts ────────── the ACCESS GRAPH: ProgramRoom[] + AdjacencyEdge[].
  │     Each room gets a target area (area-weight × plate) + a privacy class
  │     (circulation | public | private). The corridor (r4) + hall (r0) are circulation nodes.
  │     Edges encode the desired access topology (hall→corridor→bedroom, bath→corridor, …).
  │
  ├─ P3  subdivide.ts ──────────── realise room RECTANGLES that satisfy the graph.
  │     The CARVE family (below) decides where the corridor runs + which rooms abut it.
  │     A stair keep-out is reserved first (a non-room obstacle) on every storey it passes.
  │
  ├─ P4  wallsAndDoors.ts ──────── build walls; place ONE door per graph edge that the geometry
  │     admits (addDoor needs a shared wall ≥ MIN_DOOR_WIDTH). Door passes run in order:
  │       bubble → stair-landing → permitted-reconcile → over-cap → circulation-reroute →
  │       multihop-reroute → wetroom-public.
  │
  ├─ enumerate.ts ──────────────── 8 orientation strategies (x/z × fwd/rev × id/mir) are generated,
  │     each scored by HARD gates + a soft objective vector; the best ships.
  │
  └─ emitGeometry.ts → editor ──── rooms/walls/doors dispatched; RoomDetectionEngine re-detects the
        rooms from the built walls (the "did the graph close the loop?" check).
```

The two places circulation is *won or lost*: **P3 (which carve, what corridor shape)** and the
**enumerate topology gate** (which rejects circulation-broken candidates).

---

## 2. Circulation as a first-class graph concern

### 2.1 The circulation nodes
- **Hall (entrance)** — the arrival node; the front door lands on its perimeter wall. Exactly ONE
  hall, always on the ground storey (`§HALL-SINGLETON`). Public rooms cluster off the hall.
- **Corridor (spine)** — the private-zone distributor. Every private room (bedroom/bath/ensuite)
  must share a door-width wall with it. On an upper storey the corridor IS the stair's landing.
- **Stair** — vertical circulation. Reserved as a keep-out rect; modelled as a first-class `stair`
  room (ADR-0063) so a habitable room can never tile into it. The stair MUST door onto circulation
  (the corridor or the hall) — a sealed stair is a hard defect.

### 2.2 The carve family — how the corridor geometry is chosen (`subdivide.ts`)
The corridor is carved, then private rooms *comb* off it (each room a full-depth slice sharing the
corridor face — guaranteeing a corridor-adjacent wall). In priority order:

| carve | when | corridor shape |
|-------|------|----------------|
| `tryHallHingeCarve` | GROUND floor | `[public │ hall │ corridor │ private]` — public on the HALL, not the corridor (avoids `corridor-public`) |
| `tryNoPublicDoubleLoadedCarve` | UPPER floor (no public rooms) | central corridor strip, rooms combed off BOTH sides |
| `tryNoPublicSingleLoadedCarve` | shallow/fragmented upper plate | corridor on one face, rooms off one side |
| `§EVERY-ROOM-ACCESS-COMB` (`sliceZoneAlongFace`) | the comb inside each carve | straight strip — every room full-depth off ONE face |
| **`planLCorridorComb`** (§LU-CORRIDOR) | when the straight comb can't fit all rooms on one run, OR the straight corridor misses the stair | **L** — rooms along TWO perpendicular corridor legs (`rectUnionRing`); stair-anchored so a leg reaches the stair |
| `tryStairSpanningCorridor` | stair-fragmented plate | spine fragment serving all private rooms |

The **shape doctrine** mirrors the kitchen's I/L/U: straight (I) is the simple case; **L** wraps a
corner when one run can't host all rooms or must reach the stair; **U** is the natural extension
(three legs via `rectUnionRing`). Corridor cells can be non-rectangular polygons — the data model
(`SubdivideResult.cellPolygonById`) already carries L/U rings, and `polyRectSharedWallM` measures a
room↔polygon-corridor shared wall for door eligibility.

### 2.3 The door pipeline (realising the access edges) — `wallsAndDoors.ts`
Each graph edge becomes a door IFF the two cells share a wall ≥ `MIN_DOOR_WIDTH`. Passes escalate:
`bubble` (the wanted edges) → `stair-landing` (stair↔corridor) → `permitted-reconcile` →
`circulation-reroute`/`multihop-reroute` (re-route a sealed room onto any *permitted* wall) →
`wetroom-public` (last-resort bathroom→public). A room that ends with no door is reported in
`sealedRoomIds` — never silently dropped.

### 2.4 The topology gate (enumerate) — circulation is HARD, not cosmetic
`§DIAG-TOPO-GATE` hard-rejects a candidate on any of: `circulation` (a room reachable only through a
non-circulation room), `reach` (a room unreachable from entry), `corridor-public` (a public room
fronts the corridor), `corridor-stair` (stair not on the corridor), `corridor-hall` (corridor doesn't
touch the hall), `corrBlob` (corridor over-fat). When ALL 8 strategies hard-fail
(`§TOPO-HARD-REJECT-ALL`), the engine ships the least-bad and surfaces the failing rule — it never
emits an empty result, but it flags the compromise.

---

## 3. The known failure modes (and the graph-first cure)

| symptom (console) | graph cause | cure |
|---|---|---|
| `r5(bedroom) → NO DOOR ✗` (sealed) | room tiled BEHIND the front row → no corridor wall (squarify has no corridor-adjacency guarantee) | comb (every room off the corridor face); §LU-CORRIDOR L when one run can't fit all |
| `stair → NO DOOR` / `sharesStairWall=NO` | corridor placed without anchoring to the stair | stair-anchored L (`§LU-CORRIDOR-COMPETE`): a leg lands on the stair wall by construction |
| `publicOnCorr=YES` → `corridor-public` | hall-hinge carve failed → public rooms fall onto the corridor | keep public on the HALL (hall-hinge); take the corridor out of the area budget so the hall-wing isn't starved |
| `droppedRooms=[bedroom]` on ground | over-program: corridor + guest bedroom compete for a stair-fragmented plate | corridor as a zero-area derived spine, not a squarify participant |
| corridor always straight | the L-comb is a FALLBACK, not a competitor — straight wins by being tried first | make L/U COMPETE (score shapes like the kitchen), not just rescue |

The throughline: **whenever circulation is a consequence of area-packing, it breaks; whenever it's a
driver (corridor derived first, rooms hung off it), it holds.**

---

## 4. The direction — corridor as a DERIVED spine (ADR-0073, the HAG)

The end-state (ADR-0073 "Hierarchical Access Graph") inverts the current order so circulation is
first-class by construction:

```
TODAY:                                   TARGET (HAG):
bubble graph gives corridor an area      corridor is NOT an area-weighted room
  → squarify packs it alongside rooms     → derive the corridor SPINE from the FOOTPRINT
  → its position is a side effect           (medial axis / long-axis strip; L/U follows the plate),
  → doors try to connect it afterward       anchored at the stair / entry
                                          → pack rooms into the RESIDUAL (shell − corridor)
                                          → every room borders the corridor BY CONSTRUCTION
                                          → the stair is the spine's anchor → never isolated
```

Key reviewer correction (recorded in ADR-0073 §2): the spine must be **footprint-driven**, not
room-centroid-driven — the engine has no pre-subdivision room centroids, so routing the corridor to
them is circular. Finch (the benchmark) derives the spine "purely from the footprint's long axis, not
from programme" — PRYZM should match that. The same engine then scales to a multi-apartment building:
a building-level corridor SPINE with cores as hub nodes and unit front-doors as edges
(`ResidentialBuildingLayout`), each unit's interior generated by the same D-TGL.

The incremental path being executed: (1) `§HORZ-SHARED-WALL-FIX` (door-eligibility on horizontal
corridor edges) ✅; (2) the `planLCorridorComb` primitive (L corridor + stair-anchored) ✅;
(3) wire it as a fallback ✅; (4) make it COMPETE (`§LU-CORRIDOR-COMPETE`, stair-isolation case) ◑;
(5) full first-class shape competition (straight/L/U scored) + footprint-derived spine — the HAG.

---

## 5. Circulation diagnostics map (filter the browser console by these)

| §DIAG tag | what it tells you about circulation |
|---|---|
| `§DIAG-BUBBLE` | the access-graph nodes: each room's type, privacy class, target area; the corridor + entry ids |
| `§EVERY-ROOM-ACCESS-COMB` | did the straight comb fit (every room on the corridor face) or fall back to squarify (rooms buried) |
| `§LU-CORRIDOR APPLIED` / `§LU-CORRIDOR-COMPETE` | the L corridor fired (rescue / stair-isolation competitor) |
| `§DIAG-STAIR-CIRC` | `sharesCorridorWall` / `doorOntoCirculation` — is the stair connected, or SEALED |
| `§STAIR-SPINE-TOUCH` / `§STAIR-CIRC-STUB` / `§STAIR-ROOM-GROW-TO-CORRIDOR` | the three downstream stair-bridging attempts |
| `§DIAG-DOORS summary` | doors placed, compromises, and the `sealed=[…]` list (rooms with no door) |
| `§DIAG-ADJACENCY` | per-room realised door graph (`r5(bedroom) → corridor✓` vs `→ NO DOOR ✗`) |
| `§DIAG-CIRCULATION-REACH` | `allHabitableReachable` + which rooms are sealed |
| `§DIAG-CORRIDOR-QUALITY` | `directAccess=N/M` (rooms directly on the corridor) vs `servedThrough` (reached through another room) |
| `§DIAG-TOPO-GATE` | the hard circulation verdict per strategy: `circulation / reach / corridor-public / corridor-stair / corridor-hall` |
| `§DIAG-CORRIDOR-CONTIGUITY-SUMMARY` | did any strategy produce a corridor that reaches the entrance hall |

**One-line health read:** a circulation-sound house shows `§DIAG-DOORS summary … sealed=[]`,
`§DIAG-STAIR-CIRC … doorOntoCirculation=YES`, `§DIAG-CIRCULATION-REACH … allHabitableReachable=YES`,
and a `§DIAG-TOPO-GATE … hardValid=true` with no `corridor-*` failures.
