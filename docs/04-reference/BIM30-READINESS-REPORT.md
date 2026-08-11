# BIM 3.0 Readiness Report — foundation excavation

> **Stamp**: 2026-08-11 · **Author**: Agent BIM30-EXCAVATE · **Branch**: `main` ·
> **Status**: READ-ONLY INVESTIGATION — no product source was edited; this file is the only repo write.
> **The directive**: founder BIM 3.0 readiness brief of 2026-08-11 — discover how much of BIM 3.0
> already exists implicitly inside PRYZM and the smallest path to activate it. **Do not re-architect.**
>
> **Evidence vocabulary** (used on every claim): **EXECUTED** — a suite/probe was run in this
> investigation and its output read · **EXECUTED-CITED** — an executed result recorded today by
> another artefact (CA-21 gate, certification plan, audit §17), cited not re-run · **BY-READ** —
> proven by reading source at HEAD (strong enough for "exists", never for "runtime-proven") ·
> **UNPROVEN** — no executed evidence either way.
>
> **Runs executed for this report (2026-08-11):**
> - `pnpm --filter @pryzm/room-topology test` → **13 files, 92/92 PASS**
> - `pnpm --filter @pryzm/spatial-index test` → **2 files, 20/20 PASS**
> - `pnpm --filter @pryzm/constraint-solver test` → **31 PASS / 2 skipped**
>
> **The headline before the detail: PRYZM already contains a building graph — three of them,
> layered, one of which is persisted — plus a typed relationship vocabulary, a dependency
> resolver, a real geometric constraint solver, and IFC relationship export. BIM 3.0 is not a
> build project here; it is an activation project.** The binding constraint is the same one that
> blocks BIM 2.0 certification: the composition root exposes almost none of it.

---

## 1. Current BIM 2.0 Status

Cited from [`BIM20-CERTIFICATION-PLAN.md`](../03-execution/plans/BIM20-CERTIFICATION-PLAN.md)
(matrix A.1) and [`ENGINEERING-AUDIT-2026-08-11.md`](ENGINEERING-AUDIT-2026-08-11.md) §17 — not re-derived:

- Chain = Intent → Command → Authoritative State → Geometry → Persistence → Undo → Collab → Report.
  **No subsystem is BIM 2.0 complete.** Whole-chain executed evidence existed for ~2 verbs at plan time.
- **NEW since the plan (EXECUTED-CITED, CA-21 liveness gate, landed today):** store census against
  the composed runtime — **REACHABLE stores: 8** (door, window, annotation, sheet, schedule, view,
  hierarchy, template); **ABSENT: 15** (wall, slab, roof, room, ceiling, floor, furniture,
  plumbing, stair, column, curtain-wall, grid, beam, handrail, opening). Verdicts over the
  320-verb register: **7 PROVEN (all `plugins/annotations`) · 168 UNPROVABLE-NO-STORE ·
  145 UNKNOWN** — and **three observed CA-21 lies**: `door.create`, `window.create`,
  `template.create` report success while the authoritative store does not change. This *revises*
  the certification plan's "doors/windows furthest along" row: even the reachable kinds now carry
  an observed liveness lie.
- Register headline (read from `API-VERB-REGISTER.md`, cite-don't-transcribe): 320 verbs · LIVE 101 ·
  REFUSES 18 · SHADOWED 14 · UNKNOWN 187 · authoritative store NONE/UNKNOWN 219.
- Root cause on record (audit §17.0.1 / plan §B.1): `composeRuntime` composes only the plugin-DTO
  half; the geometry stores live in `engineLauncher`. A P1 ADR (founder-owned) is drafted in the plan.
- Collaboration leg C absent (L-391); undo has the pinned 125 ms gesture race (P1-7); C66: 0 tiers HELD.

**Consequence for BIM 3.0:** every topology subsystem below that reads the live stores is capped
by the same composition gap — it works in the browser session and is invisible to headless
certification. The BIM 3.0 foundation is largely *upstream-blocked, not missing*.

## 2. Identity & Relationships

**Identity — EXISTS, BY-READ.** Elements carry stable string ids; the id is the join key across
stores, serializer, sync (`syncDisposition.ts` names the id field per verb), undo patch pairs, and
the UBG (`UbgNode` keyed "by the existing element id", `packages/building-graph/src/types.ts`).
Renderer→element provenance exists for instanced meshes (`InstancedMeshCoalescer` group sources —
BY-READ of memory + gate references; not re-verified at line level).

**Relationships — four tiers, from persisted to derived:**

| Tier | Mechanism | Persisted? | Evidence |
|---|---|---|---|
| **Explicit, persisted** | `SemanticGraph` (`packages/core-app-model/src/SemanticGraph.ts`) — typed, indexed, traversable relationship store: `hosts/hostedBy`, `connectedTo`, `adjacentTo`, `boundedBy`, `contains`, `sitsOn/supports`, `partOf/unitOf/levelOf`, `servesZone`, `connectedByStair`, `connectedByLift`, + Phase G temporal/causal/performance/lifecycle/intent families | **YES — `ProjectSnapshot.semanticGraph` (schema v3)**, `ProjectSerializer.ts:1083` `semanticGraphManager.serialize()` | BY-READ |
| **Explicit, persisted, per-element** | `Room.boundingWallIds` with a uniqueness refinement, `packages/schemas/src/elements/Room.ts:106-115`; `door.wallId` host field (consumed by `RoomGraphService.invalidateForDoor`, `packages/spatial-index/src/RoomGraphService.ts:235-244`) | YES (element schema) | BY-READ |
| **Derived, cached, invalidated** | `RoomGraphService` per-level graph (nodes=rooms, edges=doors w/ `wallId`, `doorWidth`, `isAccessible`), lazy rebuild + dirty flags; `TopologyLayer` (init'd `apps/editor/src/engine/initScene.ts:438`); UBG built on demand | NO — reconstructible | BY-READ + EXECUTED (20/20) |
| **Derived per-call** | `RoomRelationshipService` (`packages/room-topology/src/RoomRelationshipService.ts`) — `getDoorRelationships` (roomFrom/roomTo via ±0.55 m normal sampling), `getWindowRelationships`, `getWallAdjacentRooms`, `getRoomAtPoint` | NO — pure resolution | BY-READ + EXECUTED (92/92) |

**Writers of the persisted graph — WIRED:** create/delete/copy commands in
`packages/command-registry` call `semanticGraphManager` (beam, column, furniture, handrail,
lighting, copy operations — `git grep semanticGraphManager.` → 20+ command files). **Readers —
WIRED:** `SemanticQueryEngine` + `WorldModelAdapter` (ai-host), `RelationshipExplorerPanel` +
`HierarchyTreePanel` (dataworkbench UI), the UBG `semanticAdapter`, and IFC export.
**Coverage per kind is UNPROVEN** — which kinds' commands actually write which relationship types
was not measured verb-by-verb; the CA-21 census (168 UNPROVABLE-NO-STORE) caps how much of it can
be runtime-proven today.

## 3. Graph-Readiness Table

12 capabilities × exists / where / runtime-proven / missing:

| # | Capability | Exists? | Where | Runtime-proven? | Missing |
|---|---|---|---|---|---|
| 1 | Stable element identity | YES | schemas + stores + sync id fields | Partially (8 reachable stores, CA-21 census) | headless reachability for 15 kinds |
| 2 | Typed relationship vocabulary | **YES, twice** | `SemanticGraph.RelationshipType` (13+ types); UBG `UBG_EDGE_TYPES` (10: `bounds, adjacentTo, connectsTo, circulatesVia, hostedIn, servesZone, derivesFrom, dependsOn, precededBy, violates` — `building-graph/src/types.ts:33-44`) | BY-READ; UBG unit-tested (`apps/editor/__tests__/buildBuildingGraph.test.ts`) | one canonical vocabulary (two overlapping ones exist) |
| 3 | Relationship persistence | YES | `ProjectSnapshot.semanticGraph` v3 | UNPROVEN (no executed save→reload of graph content) | a round-trip probe (cert plan C.2.1 pattern) |
| 4 | Room↔wall topology | YES | `boundingWallIds` + `RoomBoundaryBuilder`/`RoomDetectionEngine` + `RoomRelationshipService` | EXECUTED at unit level (92/92) | composed-runtime exposure |
| 5 | Room connectivity + pathfinding | YES | `RoomGraphService` — BFS `findPath`, `getConnectedComponent`, accessibility flag per door edge | EXECUTED at unit level (20/20) | not reachable as a bus verb / chat capability |
| 6 | Spatial queries | YES | `packages/spatial-index`: `SpatialGrid`, `BVHQuery`, `RoomQueryService`, `FacadeOrientationService` | EXECUTED at unit level | headless composition |
| 7 | Dependency propagation | YES | `DependencyResolver` consuming store events with `prevState` snapshots (`packages/geometry-wall/src/WallStore.ts:19-20, 572-574, 765-768` — adjacent-wall rebuild after edit/undo without full rescan) | BY-READ; wired in editor | not represented as queryable edges at runtime (UBG `dependsOn` adapter exists but pull-only) |
| 8 | Constraint evaluation | YES | `packages/constraint-solver` (`PlanegcsAdapter` — FreeCAD GCS — + `ConstraintEngine`, `StairValidationAuthority`, worker) | **EXECUTED 31/33** | production dispatch path unverified (see §7) |
| 9 | Semantic classification | YES | element kind discriminators; `SemanticIndex`, `SemanticTagRegistry`; `RoomTypeInferenceEngine` | BY-READ | per-kind attribute onboarding (C68) incomplete |
| 10 | Unified graph query surface | YES | `BuildingGraph.query({kind, edgeType})` + `neighbors` (P5-pure, Zod-validated, P8 spans on every mutation) | unit-tested | **no runtime service slot; built via a dev-hook** |
| 11 | Graph mutation safety | PARTIAL | commands are the mutation path (P6 ratchet 37); SemanticGraph written inside commands | NO — see §9 | undo/sync/persist proofs for graph writes |
| 12 | Deterministic reconstruction | YES | every derived tier in §2 rebuilds from stores; UBG is a pure projection with guarded adapters | EXECUTED at unit level | an executed equivalence probe (rebuild == restored) |

## 4. Topology Answers — the five questions

Graded against what the code can answer **today in a live editor session** (BY-READ unless noted):

| Question | Answer | Mechanism |
|---|---|---|
| Which walls bound this room? | **YES** | `Room.boundingWallIds` (persisted) + `boundedBy` edges in SemanticGraph + recompute via `RoomBoundaryBuilder` |
| Which rooms share this wall? | **YES** | `RoomRelationshipService.getWallAdjacentRooms(wallData)` (`RoomRelationshipService.ts:103`); `adjacentRooms` on `RoomNode` |
| Which openings belong to this wall? | **YES** | `door.wallId` / `window.wallId` host fields; `WallOccupancyStore` (consulted by `MoveDoorCommand`, `FloorPlanCommandBatcher`, `ProjectLoader` — grep-verified consumers); wall's own openings index (`_assertOpeningsChildrenInvariant`, `WallStore.ts:569`) |
| Which walls connect to this wall? | **YES (derived)** | `WallIntersectionResolver` (room-topology) + WallJoinResolver/JunctionResolverV2 junction records (ADR-0055 pipeline); `DependencyResolver` finds adjacency from baselines |
| Which elements depend on this wall? | **PARTIAL** | `DependencyResolver` (event-driven cascade w/ prevState); `hosts/hostedBy` in SemanticGraph; but there is no *queryable, complete* reverse-dependency index exposed at runtime — the UBG `dependsOn` adapter projects it only on demand |

**Honest cap:** all five are session-answers. None is exposed as a bus verb, none is provable
headlessly for the 15 ABSENT kinds, and no executed probe in this investigation drove them
end-to-end in a composed runtime (the composition gap again, not a topology gap).

## 5. Dependency Map

Command → store → derived → view, as wired today (BY-READ):

- **Commands** (`packages/command-registry`, ~320 verbs) mutate stores AND write
  `semanticGraphManager` relationships in the same command body (create/delete/copy families).
- **Stores** emit typed events with **pre-mutation snapshots** (`prevState`) explicitly designed
  for dependency diffing (`WallStore.ts §STEP7`).
- **DependencyResolver** consumes those events → queues adjacent-wall rebuilds (cascade layer).
- **RoomTopologyObserver** auto-redetects rooms on wall change (300 ms soft-coalesce →
  `_executeRedetect`; generation executors explicitly gate it — `ResidentialBuildingExecutor.ts:576`,
  `HouseLayoutExecutor.ts:1706` — proof it is live, since dead code needs no suppression flags).
- **RoomGraphService** invalidation is event-driven ("Called by EngineBootstrap event listeners",
  `RoomGraphService.ts:199-244`), rebuild lazy on query.
- **UBG** sits above all of it as a **pull-only projection**: `buildBuildingGraph()` reads
  TopologyLayer + RoomGraphService + SemanticGraph + DependencyResolver + ConstraintEngine
  snapshots through guarded extractors (`apps/editor/src/engine/buildBuildingGraph.ts:551`) and
  emits `pryzm:building-graph-rebuilt`.
- **Views**: `LivingGraphOverlay` (rebuild-on-show + throttled resync on edits),
  `RoomGraphPanel`, `RelationshipExplorerPanel`, `HierarchyTreePanel`, `BuildingGraphOverlay`.

The propagation spine BIM 3.0 needs — *edit → store event (with prevState) → dependency cascade →
topology re-derivation → graph invalidation → view refresh* — **already exists and runs in
production sessions.** What it lacks is certification and a composed-runtime home.

## 6. Semantic Readiness per Object Type

| Kind | Store reachable (CA-21 census, EXECUTED-CITED) | Relationship fields | Graph participation |
|---|---|---|---|
| Door / Window | YES (module singleton) — but `door.create`/`window.create` are two of the three observed CA-21 lies | `wallId` host; roomFrom/roomTo derivable | edges in RoomGraph + `hosts/hostedBy` |
| Wall | ABSENT | baseline, openings index, level | `boundedBy`/`adjacentTo` sources; junction graph |
| Room | ABSENT | `boundingWallIds` (persisted, unique) | first-class node everywhere |
| Slab / Roof / Ceiling / Floor | ABSENT | level; `sitsOn/supports` typed in SemanticGraph | partial |
| Stair / Lift | ABSENT | `connectedByStair` / `connectedByLift` typed | vertical edges typed, population UNPROVEN |
| Column / Beam / Handrail / Furniture / Plumbing / Grid / Curtain-wall | ABSENT | create-commands write SemanticGraph (grep-verified for beam/column/furniture/handrail/lighting) | partial |
| Annotation / Sheet / Schedule / View / Hierarchy / Template | YES — the **only 7 PROVEN verbs live here** (`plugins/annotations`) | n/a (documentation kinds) | out of topology scope |

The semantic *typing* is ahead of the semantic *reachability*: the vocabulary covers every kind;
the composed runtime reaches 8 of 23 store families.

## 7. Constraint Classification

| Class | Instances | Status |
|---|---|---|
| **HARD (solver)** | `PlanegcsAdapter` (FreeCAD GCS via planegcs) + `ConstraintEngine` + `stair-constraint-engine` + worker (`packages/constraint-solver/src`) | **EXECUTED 31/33 at unit level.** Production dispatch path UNPROVEN in this investigation (third-explorer detail not received; residual marked honestly). In the per-package-compile skip list per the brief — a build accommodation, not death: its tests compile and pass. |
| **HARD (occupancy)** | `WallOccupancyStore.canPlace()` — commit-time gate against opening conflicts; consumers incl. `MoveDoorCommand`, `FloorPlanCommandBatcher` | BY-READ, wired |
| **VALIDATION** | `RoomValidationService` (spatial-index), `StairValidationAuthority`, apartment dimensional+adjacency validators (10+8, per memory/strategy docs — **BY-READ only, locations not independently re-verified**) | EXECUTED for spatial-index portion (20/20) |
| **INVARIANT (type-level)** | Zod schema refinements (`boundingWallIds` uniqueness, `Room.ts:114`); `LandBasis` branded invariant type (C63, `74a20d37`); `BuildableEnvelope` 17 typed determinations + 11-member refusal union | BY-READ + cited |
| **DERIVED** | junction resolution (WallJoinResolver/JunctionResolverV2), room detection, inset/pullback gate (`RoomPolygonUtils.ts:1281-1287`, audit P1-4 CLOSED) | EXECUTED (92/92 room-topology) |
| **SOFT (scoring)** | programRules normative room DB, stair space-efficiency scoring, C63 scorecard weights | BY-READ / cited |
| **UI-ONLY** | snapping, picking alignment aids | BY-READ |
| **Constraint→graph bridge** | UBG `violates` edge type + `constraintAdapter` — **constraint breaches are already typed as graph edges** | BY-READ, unit-tested |

## 8. Authoritative → Derived → Geometry → Visualization Separation

Largely proven by the audit — cited, not re-derived:

- **Authoritative**: the legacy geometry singletons (what serializer/2-D projector/IFC read) —
  audit §17.0.1. The plugin DTO stores are the *non*-authoritative half; 17 verbs writing only
  them now REFUSE (P1-1).
- **Derived**: everything in §2 tiers 3–4 is cleanly read-only over authoritative state
  (`RoomGraphService` "Read-only: never writes to any store"; UBG "we never mutate any source
  graph", `buildBuildingGraph.ts:10-14`). The separation discipline is genuinely good here.
- **Geometry vs authoritative**: the roof oracle (300 mm → 300.00 mm, spread 0.000) proves the
  geometry link certifiable per-verb; P5 domain purity is a hard-0 gate (165+ files, 0 impurities).
- **Visualization**: P2 single-THREE-owner hard-0; graph overlays consume the UBG snapshot, never
  the stores directly.
- **The one leak**: `RoomRelationshipService._store()` falls back to `(window as any).roomStore`
  (`RoomRelationshipService.ts:46`) — the P4 cast debt lives inside the topology spine too.

**Grade: the four-layer separation BIM 3.0 requires already exists as a discipline; it fails only
at the composition seam** (authoritative stores constructed in the DOM half).

## 9. Graph Mutation Safety

Graded against the known BIM 2.0 state — **this is the weakest axis, and the grade is FAIL-shaped
UNPROVEN, not PASS**:

- **Create/modify/delete**: SemanticGraph writes ride inside commands (good — one mutation path),
  but with **168 of 320 verbs UNPROVABLE-NO-STORE and 3 observed CA-21 lies (EXECUTED-CITED)**,
  "the command succeeded, therefore the graph is consistent with the model" is not a statement
  anyone can certify today for most kinds.
- **Undo**: the 125 ms three-stack race is pinned RED-BY-DESIGN (`undoGestureOrdering.test.ts`,
  3 `it.fails`); `performUndo()` returns `void`; 16 door/window handlers strand ring entries
  (`buildUndoStoreMap` gap). Whether an undo that reverses a wall edit also reverses the
  SemanticGraph edges written by the same command is **UNPROVEN** — no probe exists.
- **Save/reload**: graph persistence exists (`semanticGraph` v3) with a loader path; **no executed
  round-trip comparator** (cert plan B.5/C.2.1 applies verbatim to the graph).
- **Collaboration**: leg C absent; graph writes are therefore single-client by construction; the
  derived tiers rebuild locally so *derived* topology would survive sync, but *persisted*
  SemanticGraph merge semantics are undesigned.
- **The mitigation that already exists**: every derived graph is reconstructible (§10), so the
  safety strategy available *without new architecture* is "persisted graph = cache with an oracle:
  rebuild and diff".

## 10. Automatic Topology Reconstruction

Already computed deterministically from authoritative state, today:

1. Room detection from walls — `RoomDetectionEngine` + `PlanarTopologyEngine` +
   `RoomTopologyObserver` auto-redetect (live, suppression-gated by every generation executor).
2. Room boundaries/insets — `RoomBoundaryBuilder`, `RoomPolygonUtils` (inset oracle now
   load-bearing, P1-4). ⚠ residue: `roomFromGraphSpec.ts:66-83` `repairToSimplePolygon` still
   invents a boundary unlogged (P1-5, OPEN).
3. Wall junctions — WallJoinResolver / JunctionResolverV2 + Footprint2D (ADR-0055).
4. Room connectivity graph — `RoomGraphService._buildGraph` from room/wall/door stores, per level.
5. Door/window↔room relationships — `RoomRelationshipService` geometric sampling.
6. The whole UBG — one `buildBuildingGraph()` call, pure projection, per-adapter degradation.

**Everything except the persisted SemanticGraph is rebuild-from-zero.** That is the BIM 3.0
property "topology is derived, never hand-maintained" — already the design here.

## 11. Capability Map

19 rows; the critical column is EXISTING FOUNDATION.

| # | BIM 3.0 capability | Existing foundation | Gap |
|---|---|---|---|
| 1 | Room adjacency | RoomGraphService `adjacentRooms` + SemanticGraph `adjacentTo` | expose as verb |
| 2 | Room connectivity / circulation | RoomGraph door edges + BFS `findPath` + `circulatesVia` UBG type; §CIRCULATION-GRAPH spec authored | verb + cross-level |
| 3 | Wall→room bounding | `boundingWallIds` + `boundedBy` | per-kind proof |
| 4 | Opening hosting | `wallId` + WallOccupancyStore + `hosts/hostedBy` | none material |
| 5 | Wall↔wall junctions | JunctionResolverV2 / WallIntersectionResolver | keep junction records queryable (thrown away after meshing today — BY-READ) |
| 6 | Vertical connectivity | `connectedByStair`/`connectedByLift` types | population coverage UNPROVEN |
| 7 | Spatial containment | level/building hierarchy verbs (`hierarchy.*` LIVE) + `partOf/unitOf/levelOf` | — |
| 8 | Spatial queries | SpatialGrid/BVHQuery (EXECUTED) | composed-runtime slot |
| 9 | Dependency cascade | DependencyResolver + prevState events + `dependsOn` UBG | reverse index as query |
| 10 | Geometric constraints | planegcs solver (EXECUTED 31/33) | production dispatch proof |
| 11 | Dimensional/code validation | RoomValidationService, StairValidationAuthority, apartment validators | unify under `violates` edges |
| 12 | Program/adjacency validation | programRules DB + adjacency validators | same |
| 13 | NL semantic query | `SemanticQueryEngine` + `WorldModelAdapter` over SemanticGraph | read-only capability class (cert plan B.8) |
| 14 | Unified graph query | **BuildingGraph.query — exists, pure, tested** | runtime service slot + verbs |
| 15 | Graph visualization | LivingGraphOverlay, RoomGraphPanel, BuildingGraphOverlay, RelationshipExplorerPanel | — (GRAPH.3 shipped) |
| 16 | IFC relationship export | `IfcRelSpaceBoundary` for `adjacentTo` + Pset_PRYZM_Spatial/Compliance (`ExportIFC.ts:13,126`) | more IfcRel types |
| 17 | Deterministic generation | D-TGL P1→P9 (67 tests per memory), D-FLE, D-CE — BY-READ, not re-executed | none for BIM 3.0 core |
| 18 | Performance edges (solar etc.) | `@pryzm/solar-analysis` (C21) + SemanticGraph Performance family | wire results as edges |
| 19 | Provenance / temporal graph | SemanticGraph Temporal/Intent families + UBG `precededBy` + `derivesFrom`; command log (`project_command_log`) | population UNPROVEN |

## 12. Hidden BIM 3.0 Discoveries

Ranked by how much they change the plan:

1. **`@pryzm/building-graph` EXISTS.** The strategy memory recorded "gap = ONE @pryzm/building-graph
   package" — **that gap has been closed** (ADR-0058, GRAPH.1 core + GRAPH.2 adapters + GRAPH.3
   overlays): a pure, P5-safe, Zod-validated, span-instrumented graph store with in/out adjacency
   indexes, dedup, kind-precedence merge, serialisable snapshots, and a 10-type edge vocabulary
   that *is* the BIM 3.0 relationship list. Editor wiring exists (`buildBuildingGraph.ts`, five
   adapters, guarded), installed in production via `AIAreaLayout.ts:316` → dev-hook
   `window.pryzmBuildBuildingGraph()`. **Classification: EXISTS-WIRED-BUT-PULL-ONLY** — it is a
   dev-hook artefact, not a composed runtime service.
2. **A persisted semantic relationship store already ships.** `SemanticGraph` in core-app-model,
   schema v3 in every project snapshot, written by command-registry commands, queried by AI and UI.
   BIM 3.0's "relationships are first-class, typed, persisted" is *already the shipped design* —
   what is missing is coverage proof, not architecture.
3. **The building already is a graph at the room tier** — `RoomGraphService`'s own header:
   "ROOMS AS NODES. DOORS AS EDGES. THE BUILDING IS A GRAPH." — with BFS pathfinding, connected
   components, and Part M/ADA accessibility flags per door edge. EXECUTED 20/20.
4. **A real geometric constraint solver (FreeCAD's GCS via planegcs) is in the tree and its tests
   pass** (31/33 EXECUTED). The skip-list entry hid a working solver.
5. **Constraint violations are already a graph edge type** (`violates` + constraintAdapter) — the
   BIM 3.0 "rules live in the graph" pattern, pre-built.
6. **Dependency propagation with pre-mutation snapshots** is designed into the stores themselves
   (`§STEP7` prevState) — the cascade layer most "BIM 3.0" pitches propose building is here.
7. **IFC export already speaks relationships** (`IfcRelSpaceBoundary` from `adjacentTo`), proving
   the internal vocabulary maps to the interchange standard.
8. **The verb register is a machine-readable command-metadata graph** (verb → owner → store →
   undo shape → sync disposition → chat class), generated and CI-diffed — a queryable model of the
   API itself.

## 13. Minimal Core

The smallest set that constitutes a BIM 3.0 core, chosen from what exists:

- **Identity**: element ids as-is (nothing new).
- **Relationship truth**: `SemanticGraph` (persisted) as the authoritative relationship record;
  derived services remain oracles that can rebuild/diff it.
- **Query surface**: `BuildingGraph` + its five adapters as the ONE read model; retire nothing —
  adapters already unify the specialised graphs.
- **Propagation**: store events + DependencyResolver + RoomTopologyObserver, unchanged.
- **Constraints**: `violates` edges fed by the existing validators; planegcs held for parametric
  editing later.

**Zero new packages required.** The core is: one composition slot, invalidation wiring
(store events → `buildBuildingGraph` rebuild, which `LivingGraphOverlay` already prototypes),
and read-only query verbs.

## 14. Zero-LLM BIM 3.0

Everything in §13 is deterministic. Rooms-from-walls, junctions, adjacency, connectivity,
pathfinding, dependency cascade, constraint checking, D-TGL/D-FLE/D-CE generation, IFC
relationship export — none touches an LLM (D-TGL is explicitly the offline engine; PDF→BIM has an
executed zero-token proof, `PdfToBimZeroToken.spec.ts`, cited from P1-14). **A complete BIM 3.0 —
typed, persisted, queryable, propagating building graph — is achievable in this codebase with
zero LLM involvement.** The LLM is a client of the graph, never a component of it.

## 15. AI Boundary

- AI reads the graph through `WorldModelAdapter` / `SemanticQueryEngine` (already the wiring).
- AI mutates only via bus verbs (RAC ladder); graph edges update inside those same commands —
  the AI can never write a relationship directly.
- Refusal doctrine (C16 CA-18, typed refusal unions à la `BuildableEnvelope`) applies to graph
  queries too: "the graph cannot answer X" must be a named refusal, not an empty array — note
  `RoomGraphService` currently returns `[]` for "stores not ready", "no path", and "no such room"
  alike (`RoomGraphService.ts:152, 253-258`): a known failure-vs-empty defect class
  (context-data-honesty family) to fix during activation, not after.
- The P0-4 lesson binds: graph queries must be a **read-only capability class** (cert plan B.8)
  so no query rung can fall through to a mutation.

## 16. BIM3.0-FOUNDATION-READY Gate Definition

The gate (a future `tools/ga-gate/check-bim30-foundation.ts`) passes when ALL of:

1. **Composed-runtime graph slot**: `composeRuntime()` exposes a graph service; the compose probe
   reports it non-ABSENT (piggybacks on B.1's exit condition).
2. **Rebuild determinism (executed)**: `buildBuildingGraph()` twice over the same state →
   identical snapshots; snapshot serialize→restore→rebuild diff = ∅.
3. **Store-event invalidation (executed)**: wall create/modify/delete/undo each provably dirty
   the affected level's graph and the rebuilt graph reflects the change (CA-21-style read-back,
   against the authoritative store).
4. **The five topology questions** (§4) each answered by an executed probe on a fixture building,
   through the runtime service — not through direct package imports.
5. **Failure ≠ empty**: graph queries return typed refusals for "stores not ready" vs "no result";
   negative-tested.
6. **Read-only class**: no graph query verb can reach a mutating rung (C.2.5 adversarial pattern).
7. **Persisted-graph honesty**: SemanticGraph round-trip comparator green for the covered kinds,
   with uncovered kinds NAMED in the gate output (shrink-only), never silently passed.

## 17. Subsystem Readiness Scores

READY / READY WITH SMALL EXTENSION / PARTIALLY READY / MISSING — no percentages.

| Subsystem | Score | Basis |
|---|---|---|
| `@pryzm/building-graph` (UBG core + adapters) | **READY WITH SMALL EXTENSION** (runtime slot + event-driven invalidation) | BY-READ + unit tests |
| `RoomGraphService` / spatial-index | **READY WITH SMALL EXTENSION** (verb exposure; refusal-vs-empty) | EXECUTED 20/20 |
| room-topology (detection, boundaries, relationships) | **READY WITH SMALL EXTENSION** (P1-5 repair-log residue; window-cast fallback) | EXECUTED 92/92 |
| SemanticGraph (persisted relationships) | **PARTIALLY READY** (vocabulary + persistence ready; per-kind write coverage and round-trip UNPROVEN) | BY-READ |
| DependencyResolver + store events | **READY WITH SMALL EXTENSION** (queryable reverse index) | BY-READ |
| constraint-solver (planegcs) | **PARTIALLY READY** (solver proven at unit level; production dispatch UNPROVEN — third-explorer detail not received, residual honest) | EXECUTED 31/33 |
| Wall junction pipeline (ADR-0055) | **PARTIALLY READY** (computes the graph, discards it after meshing) | BY-READ |
| WallOccupancyStore | **READY** | BY-READ, wired consumers |
| Validators (room/stair/apartment) + programRules | **PARTIALLY READY** (exist; unification under `violates` edges missing; apartment-validator locations BY-READ only) | mixed |
| Graph UI (Living Graph, panels) | **READY** | BY-READ, shipped |
| IFC relationship export | **READY WITH SMALL EXTENSION** (more IfcRel types) | BY-READ |
| Graph mutation safety (undo/sync/persist of relationships) | **MISSING as certification** — architecture present, zero executed proofs; capped by B.1, the 168 UNPROVABLE-NO-STORE verbs and the 3 observed CA-21 lies | EXECUTED-CITED |
| Composed-runtime reachability | **MISSING** — 15 of 23 store families ABSENT; the binding constraint on everything above | EXECUTED-CITED (CA-21 census) |

## 18. Recommended First Implementation

**Promote the Unified Building Graph from dev-hook to composed-runtime service — "graph
activation, not graph construction."** Sequenced strictly AFTER the B.1 store ADR lands (it is
the same seam; doing it first would wire the graph to the half of the model that certification
cannot see).

Concretely, one small package-boundary-respecting change:

1. Register a `graph` slot in `composeRuntime` that owns a `BuildingGraph` instance and the
   existing five adapters (the extractors in `buildBuildingGraph.ts` move behind the slot; the
   `window.pryzmBuildBuildingGraph` hook becomes a thin delegate, kept for the overlay).
2. Subscribe the slot to the store events DependencyResolver already consumes → dirty-flag +
   lazy rebuild (the exact `RoomGraphService` pattern, one level up).
3. Expose three read-only, refusal-honest query verbs (`graph.neighbors`, `graph.query`,
   `graph.path`) in the read-only capability class — instantly giving chat/AI/plugins the five
   topology answers of §4 through the governed path.
4. Ship the §16 gate with it, born green on the reachable kinds and NAMING the unreachable ones.

Why this over the alternatives: it converts ~15 authored subsystems into one certified capability
with near-zero new architecture (the directive's metric — maximum BIM 3.0 capability per line);
it creates the missing runtime proof surface for relationships (unblocking §9); and every
subsequent BIM 3.0 feature (parametric constraints, circulation compliance, AI spatial reasoning)
becomes a consumer of an already-live graph rather than a new wiring project.

---

*Not verified in this investigation (named, per doctrine): the third explorer's
constraint/validator/generation-engine detail did not arrive before deadline — those rows are
BY-READ or UNPROVEN as marked; no probe drove the composed runtime end-to-end here; apartment
validator file locations and D-TGL/D-FLE/D-CE test counts are cited from memory/strategy docs,
not re-executed; `InstancedMeshCoalescer` provenance not re-verified at line level.*
