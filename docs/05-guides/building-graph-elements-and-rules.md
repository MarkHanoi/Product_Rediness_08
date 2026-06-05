# The Building Graph — Elements & Rules

> A deep guide to the **"⚛ Graph / Building Graph — living view"** overlay: what its
> **elements** (nodes) are, what its **relationships** (edges) are, and what **rules**
> govern them — for both users reading the living view and developers extending it.

**Governance:** [ADR-0058 — Unified Building Graph](../02-decisions/adrs/0058-unified-building-graph.md)
· [Strategy: PRYZM Building Graph & Relational-AI Foundation](../01-strategy/PRYZM-BUILDING-GRAPH-AND-RELATIONAL-AI-FOUNDATION.md)

---

## 1. What the living view is

The overlay you open with the **⚛ Graph** button (header: *"Building Graph — living
view · 35 nodes · 136 relations"*) renders the **Unified Building Graph (UBG)** — a
single, read-only, node + edge projection of your model. It is the "x-ray" of the
building: every room, wall, door, level — and the **rules they break** — shown as a
living, force-directed blob where related things cluster and pull on each other.

Two facts to anchor on:

- **It is a projection, never a source of truth.** The UBG is rebuilt on demand from
  PRYZM's specialised graphs (spatial topology, room connectivity, semantic
  relationships, dependency cascade, compliance). Editing the model is what changes it;
  you cannot author the building *by* editing the graph.
- **"35 nodes · 136 relations" is literally `graph.allNodes().length` and
  `graph.allEdges().length`** — computed in `BuildingGraphOverlay.rebuildFromGraph()`
  ([apps/editor/src/ui/graph/BuildingGraphOverlay.ts](../../apps/editor/src/ui/graph/BuildingGraphOverlay.ts)).
  The graph is acquired via `window.pryzmBuildBuildingGraph()` and re-rendered whenever
  the runtime emits `pryzm:building-graph-rebuilt` (after any model or compliance
  change). The rendering is pure Canvas-2D — no THREE (P2-safe), no `requestAnimationFrame`
  (P3-safe) — which is why it can float over the editor without touching the render loop.

---

## 2. Elements (the nodes)

A UBG node is deliberately minimal and **typology-agnostic**:
`{ id, kind, props?, refs? }` (`packages/building-graph/src/types.ts`). The `kind` is a
free string — the *adapters* that build the graph own the vocabulary; the core never
constrains it. That openness is what lets a house, an office, or a hospital all project
into the same graph.

### Node kinds you will actually see

| `kind` | What it represents | Minted by |
|---|---|---|
| `room` / `space` | A detected room (carries `levelId`, name, `roomType`, area) | room-graph adapter |
| `wall` | A wall element | topology adapter (via `kindOf`) |
| `door` | An opening linking two rooms (a thin node; `refs` = the two rooms it joins) | room-graph adapter |
| `window` | A window opening | topology adapter |
| `level` / `building` / `site` | Hierarchy nodes (Site → Building → Level) | topology adapter |
| `furniture` / `system` / `zone` | Contents, building systems (HVAC), abstract zones | adapters / future |
| `circulation` | A generated corridor/route that threads several rooms (`refs` = the rooms it passes) | room-graph adapter |
| **`rule`** | A **synthetic** node (`rule:{ruleId}`) that a violation points at — see §4 | constraint adapter |
| `element` | Generic fallback when the kind can't be resolved | topology / constraint adapters |

The **element universe** (the candidate nodes) is the set of live element stores —
walls, curtain walls, slabs, columns, rooms, room-bounding-lines, etc. In production the
node ids are read directly off the live 3D scene, and the level ids from
`bimManager.getAllLevels()`. The overlay's `labelFor()` prefers a human label from
`props.name / label / roomType / elementType`, and otherwise humanises the kind
(`element` → `Element`, `curtain_wall` → `Curtain Wall`).

> **Reading tip:** the bright, white-ringed **central blob** is the highest-degree node
> (the most-connected element — usually a hub room or the level). Magenta nodes are
> **rule** nodes (a breach — see §4); the pink/purple field is just the aesthetic.

---

## 3. Relationships (the edges)

There are **two vocabularies**, and conflating them is the most common mistake:

- the **UBG edge set** — a *closed* set of 10 the overlay draws, and
- the **SemanticGraph relationship set** — the *richer* set of 24 the model actually
  stores, which the UBG projects down from.

The "136 relations" in the header are **UBG edges**, not the full relational truth.

### 3.1 UBG edges — the closed set of 10 (what the overlay shows)

`packages/building-graph/src/types.ts`. Per ADR-0058, **7 are live today**; three
(`hostedIn`, `servesZone`, `precededBy`) are reserved for later adapters.

| UBG edge | Projected from | Meaning |
|---|---|---|
| `bounds` | spatial topology (`intersects`) | A spatially bounds B (a wall bounds a room) |
| `adjacentTo` | spatial topology | A is spatially adjacent to B (share a face/edge) |
| `connectsTo` | room connectivity | A connects to B through a door/opening (weight = door width) |
| `circulatesVia` | D-TGL circulation | a circulation path passes via room B |
| `derivesFrom` | semantic derivation family | A is derived from B |
| `dependsOn` | dependency cascade | A must rebuild when B changes |
| `violates` | constraint engine | element A **violates** rule-node B |
| `hostedIn` *(reserved)* | hosted-element graph | a door hosted in a wall |
| `servesZone` *(reserved)* | zoning / aggregates | a system serves a zone |
| `precededBy` *(reserved)* | temporal graph | mutation ordering |

### 3.2 SemanticGraph relationships — the full set of 24 (the relational truth)

`packages/core-app-model/src/SemanticGraph.ts`. These are written by **commands** and
are the real BIM relational substrate the UBG summarises:

- **Spatial / structural (13):** `hosts` (wall→door/window) · `hostedBy` (inverse) ·
  `connectedTo` (room↔room via door) · `adjacentTo` (room↔room via shared wall) ·
  `boundedBy` (room→wall) · `contains` (room→furniture) · `sitsOn` (wall→slab; stair→level) ·
  `supports` (slab→wall) · `partOf` (room→unit) · `unitOf` (unit→level) ·
  `levelOf` (level→building) · `servesZone` (HVAC→room) · **`connectedByStair`** (floor↔floor).
- **Temporal (3):** `precededBy` · `supersedes` · `branchedFrom`.
- **Causal (2):** `causedFailureOf` · `wasMitigatedBy`.
- **Performance (2):** `measuredAt` · `exceededBenchmark`.
- **Lifecycle (3):** `replacedBy` · `maintainedBy` · `decommissionedBefore`.
- **Intent (1):** `decidedBy` (element→DecisionRecord).

**Where edges get written** — examples:
- `connectedByStair` + `sitsOn` are written by `CreateStairCommand` (both directions, for
  egress routing) — this is how a staircase makes vertical circulation *queryable*.
- `hosts` / `hostedBy` (door/window in wall) and `boundedBy` (room→wall) are written by
  the wall / opening / room commands in `packages/command-registry/src/`.

The UBG's `derivesFrom` projects only the derivation family
(`branchedFrom`, `supersedes`, `precededBy`); `dependsOn` projects the structural family
(`hosts`, `hostedBy`, `boundedBy`, `sitsOn`, `supports`, `connectedTo`, `adjacentTo`).

---

## 4. Rules — what governs the graph

"Rules" in PRYZM are **three distinct layers**, each enforced differently. Together they
are what makes the graph *normative* (a thing that can be right or wrong), not just
descriptive.

### 4.1 The ConstraintEngine — 17 building-code rules

`packages/constraint-solver/src/ConstraintEngine.ts`. The boot log line
`17 rules registered (7 Tier 1, 5 Tier 2 spatial, 5 Tier 2 physics)` is this engine.
Each rule is `{ id, tier, severity, description, check(ctx) }`. They **auto-run**
(debounced 600 ms) whenever sync-state changes / a room changes / a project loads — and
are **suppressed during batch creation** so a 24-wall generate doesn't thrash. On every
run the engine broadcasts `pryzm-constraints-updated` with error/warning counts — which
is what tints the rooms in the **compliance overlay** ("7 error room(s) tinted") and
mints the `violates` edges in the graph.

**Tier 1 — life-safety & habitability (7):**

| id | severity | checks | regulation |
|---|---|---|---|
| `ROOM_MIN_AREA` | error | room area ≥ minimum for its occupancy | UK Part M |
| `ROOM_NEEDS_DOOR` | error | every room has ≥1 door (skips terrace/balcony/atrium/stairwell) | Part B egress |
| `HABITABLE_NEEDS_WINDOW` | error | habitable rooms have ≥1 window | Part F & L |
| `STAIR_HEADROOM` | error | headroom ≥ 2.0 m | Part K §1.7 |
| `DOOR_WIDTH_vs_CIRCULATION` | warning | door ≤ the corridor it opens into | Part M §4.2 |
| `ACCESSIBLE_ROUTE` | warning | accessible rooms have a door ≥ 900 mm | BS 8300:2018 |
| `ROOM_MAX_TRAVEL_DISTANCE` | warning | ≤ 45 m to the nearest stairwell | Part B §3.4 |

**Tier 2 — spatial / fire-strategy (5):**

| id | severity | checks |
|---|---|---|
| `FIRE_COMPARTMENT_AREA` | error | level floor area ≤ 2,000 m² (Part B) |
| `MEANS_OF_ESCAPE_COUNT` | error | ≥2 stairwells per floor if area > 100 m² (Part B) |
| `CORRIDOR_WIDTH` | warning | corridor width ≥ 1,200 mm (Part M) |
| `LIFT_ADJACENT_LOBBY` | info | lift sits on a level with a lobby/corridor (Part M) |
| `PLUMBING_ZONE` | info | wet room adjacent to another wet zone (cost/clustering) |

**Tier 2 — physics (5; evaluated against the PhysicsEngine cache):**

| id | severity | checks |
|---|---|---|
| `ACOUSTIC_RT60_HOSPITAL` | warning | patient/theatre RT60 < 0.5 s (NHS HBN 00-08) |
| `ACOUSTIC_RT60_SCHOOL` | warning | classroom RT60 < 0.8 s (BB93) |
| `ACOUSTIC_RT60_COURT` | warning | court/assembly RT60 < 1.2 s (BS EN ISO 3382-1) |
| `DAYLIGHT_HABITABLE` | warning | habitable daylight factor ≥ 1% (BRE; Part L) |
| `THERMAL_GLAZING_OVERHEATING` | warning | thermal load ≤ 45 W/m² (CIBSE TM52; Part O) |

**How a rule reaches the graph:** the constraint adapter turns each violation into a
synthetic `rule:{ruleId}` node (kind `rule`, rendered magenta so breaches *pop*) plus a
`violates` edge from the offending element, carrying the severity + message as evidence.
So in the living view, a room with a red halo and a magenta `rule` node hanging off it is
"this element breaks that code rule" — visible at a glance.

### 4.2 Architectural program rules — the room database

`packages/ai-host/src/workflows/apartmentLayout/rules/programRules.ts`
(see [SPEC-ARCHITECTURAL-PROGRAM-RULES](../03-execution/specs/SPEC-ARCHITECTURAL-PROGRAM-RULES.md)).
This is the **normative room DB** — one `RoomRule` per room type (the TypeScript
`Record` forces exhaustiveness). Each rule carries privacy class, acoustic role, frontage
preference, sizing (`areaWeight`, `minAreaM2`, `minShortSideM`, `maxAreaFrac`,
`needsWindow`), and crucially the **connectivity rules**:

- **`accessFrom`** — which room types a door into this room may connect to. Symmetric:
  `doorAllowedBetween(a,b)` is true iff `b ∈ accessFrom(a)` **or** `a ∈ accessFrom(b)`.
  *This is the rule that forbids illogical doors* (bedroom↔bedroom, bathroom↔kitchen,
  ensuite↔corridor). E.g. bathroom `accessFrom: ['corridor']` only; ensuite
  `accessFrom: ['master']`; bedroom `accessFrom: ['corridor','living','dining'], maxDoors: 1`.
- **`maxDoors`** — the privacy door cap (bedroom 1, master 2, social rooms ∞).
- **`adjacencyPreference`** — soft per-pair weights (kitchen↔dining = 1.0).

### 4.3 Adjacency rules — mandatory / wet / acoustic / frontage

`packages/ai-host/src/workflows/apartmentLayout/topology/adjacencyRules.ts` derives, from
the program rules, the **mandatory adjacencies** the layout validator must realise
(master↔ensuite when requested, hall↔corridor, hall↔living) plus the classification sets
(wet-room types, acoustic source/receiver, frontage-required/preferred). These govern
*generation* (the layout engine) rather than the live compliance overlay.

---

## 5. How elements and rules interact (the living cascade)

The "living" in *living view* is this loop:

1. **You change an element** — every mutation goes through a command on the command bus
   (P6: commands are the only mutation path), which updates a store and fires the
   StoreEventBus.
2. **The spatial graphs update reactively** — `TopologyLayer` (adjacency/intersection)
   and `RoomGraphService` (room↔room door connectivity) recompute; commands also write
   `SemanticGraph` relationships (a stair writes `connectedByStair`).
3. **The DependencyResolver cascades rebuilds** — it reads the SemanticGraph and queues
   rebuild tasks by priority (structural → hosted → spatial/rooms → derived), so moving a
   wall re-evaluates the rooms it bounds.
4. **The ConstraintEngine re-runs** (debounced) over the new state and emits
   `pryzm-constraints-updated` → the compliance overlay tints the offending rooms and the
   `violates` edges refresh.
5. **The UBG is re-projected** — `window.pryzmBuildBuildingGraph()` rebuilds one fresh
   graph from all five sources (each source independently skippable/guarded), caches it,
   and emits `pryzm:building-graph-rebuilt`. The overlay re-renders, so the blob flexes as
   the model — *and its compliance state* — change.

**Query surface** (for developers): the `BuildingGraph` exposes
`query({kind, edgeType})`, `neighbors(id, edgeType)`, `outEdges`/`inEdges`, and
`subgraph(rootId, depth)` (BFS). The overlay uses `outEdges`/`inEdges` for hover-neighbour
highlighting. This same surface is the foundation the relational-AI layer
(`SemanticQueryEngine`, semantic design assistant) builds on.

---

## 6. The graphs behind the projection

| Graph | File | Holds | → UBG via |
|---|---|---|---|
| **SemanticGraph** | `core-app-model/src/SemanticGraph.ts` | 24 typed directed relationships; 3 indices; O(1)/O(k) queries + BFS; persisted in the project snapshot | semantic adapter → `derivesFrom`, `dependsOn` |
| **TopologyLayer** | `room-topology/src/TopologyLayer.ts` | spatial adjacency/intersection, reactive to StoreEventBus | topology adapter → `bounds`, `adjacentTo` |
| **RoomGraphService** | `spatial-index/src/RoomGraphService.ts` | per-level room nodes + door edges (`isAccessible`) | room-graph adapter → `connectsTo`, `circulatesVia` |
| **DependencyResolver** | `core-app-model/src/DependencyResolver.ts` | rebuild cascade derived from the SemanticGraph | dependency adapter → `dependsOn` |
| **TemporalGraph** | `core-app-model/src/TemporalGraph.ts` | append-only mutation history (never deleted) | *(reserved)* → `precededBy` |
| **ConstraintEngine** | `constraint-solver/src/ConstraintEngine.ts` | the 17 compliance rules → violations | constraint adapter → `violates` |
| **UBG (BuildingGraph)** | `building-graph/src/BuildingGraph.ts` | the unified, insertion-ordered, P5-pure store the five adapters populate; serialisable | *(the projection target)* |

---

## 7. TL;DR

- **Elements (nodes)** = your model's things — rooms, walls, doors, windows, levels,
  circulation — plus synthetic **rule** nodes for breaches. The `kind` vocabulary is open
  so any typology projects in.
- **Relationships (edges)** = the UBG's closed set of 10 (`bounds`, `adjacentTo`,
  `connectsTo`, `circulatesVia`, `derivesFrom`, `dependsOn`, `violates`, + 3 reserved),
  projected from the model's richer **24 SemanticGraph relationships**.
- **Rules** = three layers: the **ConstraintEngine's 17 building-code rules** (live
  compliance, surfaced as `violates` edges + room tinting), the **program-rules room DB**
  (`accessFrom` / `maxDoors` / adjacency — what makes a door *legal*), and the **adjacency
  rules** (mandatory/wet/acoustic that govern generation).
- The view is **live** because every edit cascades through the spatial graphs →
  dependency rebuilds → constraint re-run → graph re-projection.
