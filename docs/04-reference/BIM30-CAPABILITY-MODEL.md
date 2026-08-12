# BIM 3.0 Capability Model — the 16 capability domains

> **Stamp**: 2026-08-12 · **Phase 0** of the founder's BIM 3.0 master directive · **Branch**: `main`
> **Companion**: [`BIM30-TARGET-DEFINITION.md`](BIM30-TARGET-DEFINITION.md) — pillars, invariants,
> Golden Chain, maturity ladder. This document wires each of the founder's 16 capability domains
> to the machinery that will meet it. **It is a definition document, not a re-baseline**: every
> CURRENT cell is cited from the measured corpus and carries **"as of the last measurement"
> (2026-08-11)** — a parallel re-baseline document owns the live reading, and cells it must fill
> say **UNPROVEN-AT-WRITING**. Several subsystems were being edited by other agents at the
> corpus stamp (Continuity rev 2 addendum); where a landed fix may have moved a cell, that is
> noted rather than guessed.
>
> **Corpus keys**: **CD** = [`BIM30-CONTINUITY-DELIVERABLE.md`](BIM30-CONTINUITY-DELIVERABLE.md) rev 2
> · **AU** = [`BIM30-EVOLUTION-AUDIT.md`](BIM30-EVOLUTION-AUDIT.md) (§17 = same-day addendum)
> · **EV-03/04/05** = [`bim30-evidence/`](bim30-evidence/) appendices
> · **CR** = [`BIM20-CERTIFICATION-RESULTS.md`](BIM20-CERTIFICATION-RESULTS.md)
> · **ADR-0318/0319** = [`../02-decisions/adrs/`](../02-decisions/adrs/).
>
> **MATURITY** uses the corpus's scales where the corpus grades one (G0–G6 per relationship
> family, AU §2; ladder Levels for whole-model claims, AU §11). **MINIMUM CHANGE** uses the
> founder's implementation-type taxonomy: *wiring · retention · exposure · invariant · verb ·
> algorithm · solver · persistence · collaboration*. **READINESS GATE** names the `check-*` gate
> that scores the domain; the gate suite is specified in CD §I under the four-exit-code contract
> (`0` clean · `1` failed · `2` MISCONFIGURED never absorbable · `3` RATCHET EXCEEDED never
> absorbable, each with a floor). CD §I recorded the suite as not-yet-existing at its stamp;
> the founder's candidate list marks `check-identity-roundtrip`, `check-derived-regenerable`,
> `check-propagation-reaches`, `check-collab-graph-integrity` as already existing — **which are
> live at HEAD is UNPROVEN-AT-WRITING; the re-baseline will state it.**

---

## 1. MODEL TRUTH

- **TARGET BEHAVIOR** — one authoritative record per element kind, named by the composition root;
  every other representation derived and rebuildable; no verb can succeed against a detached copy
  (pillar A).
- **WHY BIM 3.0 NEEDS IT** — every downstream computation is only as true as the store it reads;
  two authorities make every answer conditional on which copy you asked.
- **CURRENT PRYZM IMPLEMENTATION** — `composeRuntime` (P1 single composition root) + ADR-0318
  `storeRegistry` adoption (`runtime.stores.elements` is the serializer's instance — identity,
  not construction; same-instance probe 6/6); per-kind stores (`WallStore`, `RoomStore`,
  geometry singletons); CA-21 liveness census over the C69 verb register.
- **CURRENT MATURITY** — Level 4 substrate; as of the last measurement door/window were
  headless-authoritative by design, 12 kinds ABSENT-headless but adoption-ready per kind (AU §1);
  known authority rivalries: openings' two copies, three rival level records, unserialized
  composed `BuildingStore` (AU §17.3, §17.6).
- **EVIDENCE** — AU §1, §4, §17.3, §17.6 · ADR-0318 · CD §B.
- **GAP** — per-kind registry adoption incomplete; authority rivalries undeclared; three verbs
  measured as liveness lies (`door.create`, `window.create`, `template.create`, AU §1).
- **MINIMUM CHANGE** — **wiring** (per-kind ADR-0318 adoption: wall, room, slab first) +
  **invariant** (declare the single authority per rivalry and delete the loser).
- **TEST** — for each kind: mutate via bus verb headlessly, read back through
  `runtime.stores.elements.get(kind)`, assert the serializer sees the same instance and the same
  bytes (the ADR-0318 probe pattern, extended per kind).
- **READINESS GATE** — CA-21 read-backs (existing census machinery) + `check-identity-roundtrip`'s
  store-reach floor; MISCONFIGURED when a kind's store is unreachable, never "clean".

## 2. IDENTITY

- **TARGET BEHAVIOR** — `id` + `ifcData.guid` minted once at authoring, byte-stable across
  save/reload/undo/redo/regenerate/export (pillar B; ADR-0319 class 1).
- **WHY BIM 3.0 NEEDS IT** — identity is the join key for every relationship, schedule, export,
  and merge; a re-minted GUID invisibly severs a model from its own IFC history.
- **CURRENT PRYZM IMPLEMENTATION** — GUID resolved in each command's constructor so redo
  re-stamps the same value (`f941b39a`); `ImportProjectCommand` passes ids for stair/beam
  (`50725deb`, §PERSIST-L1 reaching the shipping path); ADR-0319 three-class field taxonomy.
- **CURRENT MATURITY** — as of the last measurement: **identity HOLDS** — "not one guid
  divergence remains in the harness"; element ids and GUIDs survive save→restore→redo across
  every kind the harness covers (CD §A-1/A-2, headline table).
- **EVIDENCE** — CD rev 2 §A, "The target, scored honestly" row 1 · CR F-1/F-2 (the pre-fix
  measurements) · ADR-0319.
- **GAP** — the audit-field half (class-2 counters ratcheting +2 per undo cycle; class-3
  timestamp enumeration) was C3/C4 work in flight; room identity is semantic-fragile
  (centroid-proximity survival, EV-03 — graded under TOPOLOGY).
- **MINIMUM CHANGE** — **invariant** (comparator adopts ADR-0319's enumerated classes) +
  **wiring** (patch-based redo so class-2 counters stop ratcheting — named in ADR-0319 as the
  largest consequence).
- **TEST** — seed every kind → mutate → save → reload → undo → redo; diff ids/GUIDs at zero
  tolerance; diff class-2 fields across the undo cycle at zero tolerance.
- **READINESS GATE** — `check-identity-roundtrip` (hard-0, no baseline; extends
  `persistence.cert.ts`) + `check-derived-classification` (ADR-0319: an unclassifiable field is
  FAIL, not a default).

## 3. PERSISTENCE

- **TARGET BEHAVIOR** — save→reload returns the same model: authoritative state byte-for-byte,
  derived state equivalent, incidental state enumerated-and-excluded; nothing gained, nothing
  lost, nothing drifted (Golden Chain link 8).
- **WHY BIM 3.0 NEEDS IT** — a model that changes by being saved is not a model; it is a process
  with a memory leak in the truth.
- **CURRENT PRYZM IMPLEMENTATION** — real `ProjectSerializer`/`ProjectLoader` pair; snapshot v3
  (SemanticGraph serialized verbatim, EV-04 §3); the BIM20 certification harness (§10 protocol:
  seed via real commands → mutate via live verbs → serialize → reload → deep per-property diff,
  empty tolerance list).
- **CURRENT MATURITY** — as of the last measurement: persistence suite **8 failed / 13 passed**
  (`f941b39a`, CD rev 2); measured open defects: F-3 (+15 mm/reload cumulative drift on
  plumbing/furniture — IN FLIGHT at corpus stamp, CD §A-4), F-4 (openings gain frame fields on
  reload), F-5 (`persist:opening` MISCONFIGURED — `openingStore` holds 0 records and says so).
- **EVIDENCE** — CR §H1 + F-3/F-4/F-5 · CD §A-4 · AU §17.3 (persist-or-lose list).
- **GAP** — state round-trip (not identity) is what still fails; browser I/O
  (IndexedDB/Supabase/autosave) UNPROVEN — only the in-memory pair is exercised (CR UNPROVEN list).
- **MINIMUM CHANGE** — **persistence** (fix the double-applied offset mechanism behind F-3 —
  explicitly not "subtract 15 mm"; make the loader's opening merge symmetric for F-4) +
  **invariant** (settle whether `openingStore` is authoritative at all, F-5).
- **TEST** — the H1 comparator at zero undocumented divergences per kind, plus a two-cycle run
  proving drift is zero (cycle 2 ≡ cycle 1, the cumulative-drift killer).
- **READINESS GATE** — `check-identity-roundtrip` + `check-derived-regenerable`; both inherit
  the MISCONFIGURED floor (a comparator that reached no store never prints clean).

## 4. TOPOLOGY

- **TARGET BEHAVIOR** — REQUIRED relationships (hosts/hostedBy, boundedBy, adjacentTo,
  connectedTo, sitsOn, supports, contains, dependsOn, wall↔wall junctions) retained as typed
  records with writer + reader + rebuild + mutation-update; the 12 zero-consumer types PARKED
  (Target Definition pillar C — the split is the definition).
- **WHY BIM 3.0 NEEDS IT** — algorithms cannot run over relationships that are re-detected per
  query with per-caller epsilons; retained topology is what makes the model computable rather
  than merely renderable.
- **CURRENT PRYZM IMPLEMENTATION** — `SemanticGraph` (25 declared types, persisted snapshot v3);
  ADR-0055 junction pipeline (`JunctionResolverV2`, computes L/T/X records every rebuild);
  `Room.boundingWallIds` + `RoomBoundaryBuilder`/`RoomTopologyObserver`; `wall.openings[]` as the
  single opening authority with `WallOccupancyStore` as pure query (AU §17.6).
- **CURRENT MATURITY** — per family (AU §2): hosting **G4**, room-bounding **G4**, room↔room
  **G5**, wall↔wall junctions **G2-transient** (computed then discarded — `JunctionDraft` dies
  inside `resolveJunctions`, AU §17.6), containment **G3**, dependency **G4-forward-only**;
  nothing G6. Junction-retention work was in flight at the corpus stamp; whether it landed is
  UNPROVEN-AT-WRITING (re-baseline will state it). 2 of 8 topology questions are genuine indexed
  lookups (AU §17.6 corrected count).
- **EVIDENCE** — AU §2, §3, §17.6 · EV-05 ledger · EV-03 (room identity centroid-fragile;
  wall-delete graph-edge leak CLOSED same-day per EV-05 row 1).
- **GAP** — junction records discarded; `sitsOn` write-only, `contains` read-only, `measuredAt`
  broken (EV-05); room identity destroyed-and-recreated on boundary change;
  `_graphAuthoritativeLevels` never un-marked (EV-03).
- **MINIMUM CHANGE** — **retention** (CONNECT-3: keep the junction records the resolver already
  computes — "an extension of an existing computation's lifetime, not new architecture", AU §3)
  + **wiring** (a typed reader for `sitsOn`, a writer for `contains`) + **invariant** (room
  identity survives boundary edits by id, not centroid).
- **TEST** — move/resize/save-load/undo a wall: junction index answers wall-connectivity as a
  lookup with no resolver re-run; every REQUIRED edge family passes the EV-05 two-column test
  (writer AND typed reader) plus delete AND move mutation-update.
- **READINESS GATE** — `check-topology-survives` (no operation mints a new semantic id) +
  `check-graph-write-coverage` (zero-writer count ratchets from 12 downward, never up).

## 5. GRAPH

- **TARGET BEHAVIOR** — one canonical query vocabulary (the UBG's 10-edge set) mapped over the
  stores; graph queries exposed as read-only refusal-honest bus verbs through the composed
  runtime; rebuild deterministic (pillar D).
- **WHY BIM 3.0 NEEDS IT** — the graph is the API of the building; unexposed graph machinery is
  authored-but-unwired capability, the repo's signature hazard.
- **CURRENT PRYZM IMPLEMENTATION** — three graphs: `RoomGraphService` (G5 computation, BFS,
  20/20), `SemanticGraph` (persisted), `@pryzm/building-graph` (UBG — pure, Zod-validated,
  span-instrumented) behind a dev-hook; `SemanticQueryEngine`; `DependencyResolver`'s spatial
  index.
- **CURRENT MATURITY** — as of the last measurement: "machinery yes, exposure no — zero graph
  verbs" (CD scoring table); UBG has no runtime home; dual vocabulary resolved by **mapping, not
  merging** (CD §E — merging breaks every persisted project for a naming preference); the UBG's
  header claims snapshot persistence it does not have (AU §17.6).
- **EVIDENCE** — CD §B, §E · AU §10, §13 CONNECT-1 · EV-04 (rebuild regenerates 5 of 25 types).
- **GAP** — no `graph.*` verbs; failure≠empty violations in `RoomGraphService`; rebuild coverage
  5/25; pre-graph snapshots permanently lose `sitsOn`/`supports` (EV-04 §3).
- **MINIMUM CHANGE** — **exposure** (UBG → `composeRuntime` slot + `graph.query` /
  `graph.neighbors` / `graph.path` in the read-only capability class) + **wiring** (widen
  `_rebuildSemanticGraph` — one existing function, protects four of the five priority rows at
  once, EV-05 §3).
- **TEST** — the audit §15 canonical test's graph half: rebuild twice → identical snapshots;
  the golden query ("which rooms border the kitchen?") answered through the bus verb with a
  typed refusal path proven by asking on an unreachable level.
- **READINESS GATE** — `check-graph-write-coverage` + the §16.2 rebuild-determinism probe;
  refusal-honesty asserted by the verb's own conformance row (CA-21 pattern).

## 6. GEOMETRY

- **TARGET BEHAVIOR** — geometry a pure, deterministic function of model state; one canonical
  implementation per predicate family under one declared epsilon policy; impossibility refuses
  (pillar E).
- **WHY BIM 3.0 NEEDS IT** — deterministic geometry is what makes regeneration, certification,
  and collaboration convergence possible at all; 42 rival predicates with 12 epsilons make every
  geometric answer caller-dependent.
- **CURRENT PRYZM IMPLEMENTATION** — canonical polygon offset (R3 gate, oracle-proven 300 mm
  spread 0.000); refusal-honest inset (three named collapse modes); manifold-3d CSG (canonical);
  ADR-0055 wall pipeline; ADR-0299 simplicity assertion at one call path.
- **CURRENT MATURITY** — deterministic consequence of state: **YES — "the strongest finding in
  the whole assessment"** (CD scoring table). Substrate hygiene, as of the last measurement:
  42 point-in-polygon copies, ≥5 half-plane clippers with NO general 2D boolean, 5
  triangulations (one silently wrong on concave rooms), 7+ segment-intersection copies, 12+
  distinct epsilons for "the same thing", no clash engine behind 12 registered command ids
  (AU §17.6 table).
- **EVIDENCE** — AU §8, §17.6 · CR (Geometry axis UNPROVEN everywhere headlessly — no fragment
  builders run in the harness).
- **GAP** — duplication + absent epsilon policy + no headless geometry evidence; "merge two
  footprints" not expressible (no 2D boolean union).
- **MINIMUM CHANGE** — **invariant** (one declared epsilon constant; new predicates must consume
  it) + the R3 recipe per family (canonical file + counting gate — point-in-polygon first) +
  **algorithm** (a general 2D boolean; a real clash engine — both labelled construction, CD §H).
- **TEST** — headless fragment build in the certification harness so the Geometry axis stops
  reading UNPROVEN; per-family counting gates at their pinned counts; the roof-overhang oracle
  pattern replicated per canonicalised family.
- **READINESS GATE** — `check-epsilon-policy` (R3 counting-gate pattern, CD §I) + the existing
  R3 offset gate as the template.

## 7. PROPAGATION

- **TARGET BEHAVIOR** — every declared cascade event has a live listener and a `prevState`-carrying
  emitter; deletes cascade; host mutations re-validate hosted state; nothing goes silently stale
  (pillar F).
- **WHY BIM 3.0 NEEDS IT** — propagation is what makes the model *a* model instead of a bag of
  elements that happen to be saved together.
- **CURRENT PRYZM IMPLEMENTATION** — the bespoke spine, measured live: `prevState` store events
  (§STEP7) → `WallRebuildCoordinator` (incl. diff-based neighbour discovery),
  `DoorDependencyTracker`/`WindowDependencyTracker` (regression-pinned),
  `RoomTopologyObserver`, cascade-delete in `DeleteElementCommand`,
  `spatial-authority-reconcile` for level elevation.
- **CURRENT MATURITY** — Level 4 is earned by this bespoke wiring (AU §17.4). The **generic**
  cascade is dead as of the last measurement: `defaultRebuildDispatcher` emits four event names
  with zero listeners repo-wide, `setRebuildDispatcher` never called, deletes return `[]` by
  design (AU §17.2). Census: 10 `prevState` emitters / 23 subscribers / **5 actually read
  `prevState`** (EV-03 §0). Openings translate on wall move (EXECUTED-PROVEN, EV-03 §1); the
  opening re-clamp hole was CLOSED via `planOpeningRefit` (CD §D-1, `dcf646a0`).
- **EVIDENCE** — EV-03 (the trace appendix) · AU §5, §17.2 · CD §B, §D.
- **GAP** — CONNECT-0: the dispatcher seam is one uncalled setter; `spatial-authority-reconcile`
  covers walls+slabs only (columns, beams, stairs, roofs, furniture stranded); schedules have no
  geometry subscription; furniture `contains` re-evaluation routes to the dead cascade.
- **MINIMUM CHANGE** — **wiring** (call `setRebuildDispatcher` with real listeners — both halves:
  EV-03's correction stands, `DependencyResolver` subscribes to the bus, not the stores, so
  `prevState` never reaches it; "both halves, or neither", CD §G Tier 2) + **invariant** (deletes
  stop returning `[]`).
- **TEST** — the canonical test's propagation clause: move one wall, assert via graph queries
  that exactly the predicted dependents changed and nothing else, `prevState` diff as oracle.
- **READINESS GATE** — `check-propagation-reaches` (every declared cascade event has ≥1 listener
  AND a `prevState`-carrying emitter — written to catch CONNECT-0 and EV-03's second cause,
  CD §I).

## 8. CONSTRAINTS

- **TARGET BEHAVIOR** — declared rules at proven strengths: validation (report) → enforcement
  (commit-time refusal) → solving (only where model-space constraints prove necessary); adapters
  truthful; violations queryable; refusals carry both numbers (pillar G).
- **WHY BIM 3.0 NEEDS IT** — constraints are how the model defends its own consistency without a
  human replaying every rule by eye.
- **CURRENT PRYZM IMPLEMENTATION** — `WallOccupancyStore.canPlace` (real commit-time enforcement
  gate); `planOpeningRefit` (refit-or-refuse with both measurements); compliance rule registry
  (wired, 800 ms-debounced advisory); `StairConstraintEngine` in the stair dispatch path
  (on the untested twin copy — AU §17.1.3); `annotationConstraints` (the only persisted family —
  checked, never solved); `violates` edge + constraintAdapter (dev-only reachable).
- **CURRENT MATURITY** — as of the last measurement: **planegcs is a mock** — `PlanegcsAdapter`
  delegates 100% to `MockSolver`, the worker entry was never written, the 31/33 tests test the
  mock (AU §17.1). No model-space constraint store. Level 6 is one constraint store **plus a real
  solver** away.
- **EVIDENCE** — AU §6, §17.1 · CD §C, §H (WASM binding = construction, not wiring, labelled as
  such).
- **GAP** — adapter untruthfulness (a mock wearing a solver's interface); no stored model-space
  constraints; validators shout into logs instead of `violates` edges;
  `provideLiveGraphSources` has no production caller.
- **MINIMUM CHANGE** — **invariant first** (adapter truthfulness: a mock must announce itself —
  the founder's sequence: *prove* which constraints need validation vs enforcement vs solving
  before building any solver) → **wiring** (validators → `violates` edges, CONNECT-2) →
  **solver** only if a model-space family proves it needs one (walls-parallel is the named pilot,
  stored + validated first, solver-maintained later — AU §6.1).
- **TEST** — an executed run in which the adapter reports its own nature; a stored constraint
  survives save/reload and its violation produces a queryable `violates` edge plus a refusal
  naming rule + both numbers.
- **READINESS GATE** — `check-constraint-honesty` ("no adapter may report a solve it did not
  perform; a mock must announce itself" — would have caught the planegcs mock, CD §I).

## 9. SPATIAL REASONING

- **TARGET BEHAVIOR** — the deterministic topology questions (bounding, adjacency, containment,
  connectivity, dependents, point-location) answered as lookups where retention permits, as
  honest geometric computation where geometry is the right tool (point-in-room), each through a
  certified query path.
- **WHY BIM 3.0 NEEDS IT** — spatial questions are the substrate of every higher algorithm:
  layout, compliance, clash, pathfinding, quantity.
- **CURRENT PRYZM IMPLEMENTATION** — `RoomGraphService` (BFS pathfinding, connected components,
  accessibility — the repo's one proven G5 computation); `RoomRelationshipService`
  (point-in-room, wall-adjacent rooms); `elementSpatialIndex` (live, maintained by
  `DependencyResolver`'s useful half); hierarchy `partOf` lookups.
- **CURRENT MATURITY** — as of the last measurement: 2 of 8 questions genuine indexed lookups;
  2 O(n) scans over re-detected caches; 3 geometric recomputes, of which room-adjacency is
  O(rooms²) on invalidation (AU §17.6 corrected grading); room spatial index fed two
  incompatible AABB definitions — a concave room can be missed, a live correctness bug (AU §17.6).
- **EVIDENCE** — AU §3, §17.6 · EV-03 §1 (invalidation hops).
- **GAP** — re-detection where retention would serve (wall connectivity, rooms-sharing-wall
  reverse index); cross-level pathfinding G0 (RoomGraph is per-level); AABB inconsistency.
- **MINIMUM CHANGE** — **retention** (junction index; a reverse wall→rooms index) + **exposure**
  (the questions become `graph.*` verb answers) + **invariant** (one AABB definition for the
  room index).
- **TEST** — each of the eight questions answered by an executed probe through the composed
  runtime, with the LOOKUP rows proven O(1)-shaped (no resolver re-run observed) and
  point-in-room proven correct on a concave fixture room.
- **READINESS GATE** — `check-topology-survives` + the graph verbs' conformance rows; the AABB
  fix pins under a regression test rather than a new gate.

## 10. PROVENANCE

- **TARGET BEHAVIOR** — every element carries an origin in the founder's
  AUTHORED / OBSERVED / COMPUTED / INFERRED / REGENERATED vocabulary; provenance is never
  invented; repair is legible; confidence ceiling-only (pillar H).
- **WHY BIM 3.0 NEEDS IT** — an algorithm that cannot distinguish authored intent from its own
  inference will eventually overwrite the user with itself.
- **CURRENT PRYZM IMPLEMENTATION** — `detectionMethod` on the room/floor/ceiling family (three
  non-unified enums); `project_command_log` (implicit history); ADR-0319 field classification;
  the `LandBasis` branded type + `BuildableEnvelope` refusal unions as the shipped honesty
  idioms; ADR-0319's `check-derived-classification` mandate.
- **CURRENT MATURITY** — one element family in ten carries any provenance; `confidence` has zero
  hits repo-wide; provenance is **invented on load** (`roomSnapshotUtils.ts:156` defaults missing
  `detectionMethod` to `'auto-topology'`); `ProvenanceStore` (C23 AI lineage) is not persisted at
  all (AU §7, §17.3 — as of the last measurement).
- **EVIDENCE** — AU §7, §17.3 (the six-field upgrade of the five-field proposal) · CD §C, §G
  Tier 3.
- **GAP** — nine kinds with no origin field; the P1-5 repair path stamps `'ai-generated'` on
  invented boundaries; PDF→BIM discards the per-candidate confidence it already computes.
- **MINIMUM CHANGE** — **invariant** (schema: one optional origin block on `BaseNodeShape`,
  `'unknown'` first-class and never defaulted, `derivationStatus: authored|derived|repaired|refused`,
  separate `rev` — AU §17.3's six-field form; sequenced after per-kind ADR-0318 adoption,
  because "provenance fields are worthless while a verb can stamp them on a detached DTO store").
  The P1-5 fix ships in the same PR — *the fix IS writing the field* (CD §G).
- **TEST** — load a snapshot with a missing origin → the element reads `'unknown'`, not
  `'auto-topology'`; run the repair path → the element reads `repaired` with method+note; the
  golden provenance operation ("who created this and how?") answers from origin fields +
  command log.
- **READINESS GATE** — `check-provenance-not-invented` (no code path stamps an origin it did not
  observe — `roomSnapshotUtils.ts:156` is its founding counterexample, CD §I) +
  `check-derived-classification` (ADR-0319).

## 11. REGENERABILITY

- **TARGET BEHAVIOR** — rebuild-from-authoritative ≡ restored snapshot; the persist-or-lose list
  is a named, shrinking ledger; pre-graph snapshots lose nothing silently (pillar I).
- **WHY BIM 3.0 NEEDS IT** — regenerability is the proof that the authoritative model actually
  is authoritative; anything that cannot be rebuilt is a second, undeclared authority.
- **CURRENT PRYZM IMPLEMENTATION** — the derived-is-regenerable discipline (AU §4: with named
  exceptions, every derived representation rebuilds); `_rebuildSemanticGraph` (5 of 25 types,
  two byte-identical copies); room re-detection on every load (`ProjectLoader` fires
  `ReDetectRoomsCommand` per level — the polygon is a cache of the wall graph, AU §17.6).
- **CURRENT MATURITY** — as of the last measurement the non-regenerable ledger held **six**
  members: SemanticGraph edges outside the rebuild's 5 types · temporalGraph · decisionRecords ·
  P1-5 invented room polygons · persisted `Room.area/volume/perimeter` caches with no staleness
  marker · unpersisted `ProvenanceStore` (AU §17.3). No rebuild≡restored diff probe existed
  (AU §4).
- **EVIDENCE** — AU §4, §17.3 · EV-04 §3 · CD §D-8 (byte-compatible round-trip holds for no kind
  pre-ADR-0319).
- **GAP** — the ledger is not yet a *gate-enforced* ledger; the rebuild is a slice, not a
  reconstruction.
- **MINIMUM CHANGE** — **retention/persistence per ledger row** (persist what cannot be rebuilt,
  widen the rebuild for what can) + **invariant** (the ledger becomes input to a gate, so a new
  persist-or-lose member is a red diff, not a surprise).
- **TEST** — serialize → restore → rebuild → diff ∅ (the canonical test's middle clause); load a
  deliberately pre-graph snapshot → every REQUIRED edge either reconstructed or reported lost by
  name.
- **READINESS GATE** — `check-derived-regenerable` ("the persist-or-lose list is a named,
  shrinking ledger, not a surprise" — CD §I).

## 12. ALGORITHMIC GENERATION

- **TARGET BEHAVIOR** — deterministic engines generate model content through commands, with
  COMPUTED/INFERRED provenance, typed refusals on insufficient input, and full Golden Chain
  compliance (undoable as ONE gesture, persistable, propagating).
- **WHY BIM 3.0 NEEDS IT** — generation is where computational BIM pays rent: the model designs
  under constraints instead of merely recording.
- **CURRENT PRYZM IMPLEMENTATION** — D-TGL apartment layout (offline by design, 67 tests) ·
  D-FLE furnish · D-CE ceilings · room detection · ADR-0055 wall joins · schedules/QTO · IFC
  export incl. `IfcRelSpaceBoundary` · solar analysis (C21) · C63 envelope resolution with typed
  refusals · PDF→BIM tier 1 (proven zero-token).
- **CURRENT MATURITY** — the deterministic core is **complete and grep-confirmed AI-clean**;
  production ships with no AI key (CD §F, AU §9, strengthened by §17.3). This is the
  most-finished domain in the model as of the last measurement.
- **EVIDENCE** — AU §9, §17.3 · CD §B, §F.
- **GAP** — generation executors suppress room redetect permanently (`_graphAuthoritativeLevels`
  never un-marked, EV-03); generated output carries no provenance fields yet (domain 10); known
  quality defects live in the memory queue, not the corpus.
- **MINIMUM CHANGE** — **wiring** (un-mark authoritative levels when generation ends;
  generation writes `origin:'ai-generated'`/COMPUTED provenance once the fields exist) — the
  engines themselves need no change to meet the target.
- **TEST** — a generation run followed by the full chain: one undo reverts it entirely,
  save/reload preserves it, a subsequent manual wall move propagates into the generated fabric
  (redetect no longer suppressed).
- **READINESS GATE** — `check-topology-survives` over a generated fixture + the existing engine
  test suites (already executable evidence).

## 13. QUERY / REASONING

- **TARGET BEHAVIOR** — the model answers questions — topology, impact, validation, quantity,
  provenance, explanation — through certified read paths, with failure ≠ empty everywhere; the
  eight golden operations (AU §15) are the acceptance surface.
- **WHY BIM 3.0 NEEDS IT** — a model you cannot interrogate is a drawing with metadata.
- **CURRENT PRYZM IMPLEMENTATION** — `SemanticQueryEngine`; `RoomGraphService` queries; the UBG
  query vocabulary; `WorldModelAdapter` (the AI read surface); `canPlace` refusal reasons +
  BuildableEnvelope-style typed refusals surfaced through chat (the explanation path, P0-8
  CLOSED per AU §15).
- **CURRENT MATURITY** — "computationally queryable: machinery yes, exposure no — zero graph
  verbs" (CD scoring table, as of the last measurement). Known failure≠empty defects on the read
  paths: `RoomGraphService` `[]` conflation; `SpeculativeEngine` dead reads;
  `HierarchyTreePanel` calling a method that has never existed, so the Furniture group has never
  rendered (EV-05 correction).
- **EVIDENCE** — AU §13 STRENGTHEN, §15 · EV-04 §5 · EV-05 corrections · CD §E.
- **GAP** — no bus-level query verbs; typed-refusal replacements for the `[]` sites; dead reader
  call sites of the `getEdges` shape.
- **MINIMUM CHANGE** — **exposure** (the three graph verbs) + **invariant** (typed refusal
  unions on the three named `RoomGraphService` cases; type `window.semanticGraphManager` so
  wrong-signature reads become compile errors — EV-04 §6's highest-leverage fix).
- **TEST** — seven of the eight golden operations pass as executed probes (the eighth,
  collaboration, is named as blocked, never absorbed — AU §15); each query proven to
  distinguish empty from failed by probing both.
- **READINESS GATE** — the verbs' CA-21 conformance rows + `check-graph-write-coverage`;
  failure-honesty asserted per verb under the four-exit-code contract.

## 14. COLLABORATION

- **TARGET BEHAVIOR** — concurrent editing converges with identity, topology, and constraints
  intact; data-losing merges surface as user-resolvable conflicts — **"No silent substitution"**
  (pillar K).
- **WHY BIM 3.0 NEEDS IT** — a building is designed by teams; a single-user computational model
  is a prototype of one.
- **CURRENT PRYZM IMPLEMENTATION** — Yjs CRDT machinery client-side; the certification's Sync
  axis (currently the honest UNPROVEN column); C66 capacity contract (no tier may be described
  as supported while CLAIMED); WS-auth + scoring-gate work making the deploy decision "a single
  reversible flip" (CD §A-3).
- **CURRENT MATURITY** — **UNPROVABLE as of the last measurement: no transport is deployed
  (L-391 leg C); C66: 0 tiers HELD.** Collaboration is UNPROVEN on every certification row *by
  construction*, which caps every row at PARTIALLY VERIFIED — "no amount of further engineering
  raises the ceiling; one founder decision does" (CD §A). A hosted-edge convergence result was
  in flight at HEAD (commit `d2730a0c` — "measured, not assumed"); its scope is
  UNPROVEN-AT-WRITING, re-baseline to confirm.
- **EVIDENCE** — CD §A-3, §G Tier 4 · CR (Sync axis) · AU §12 ("the RAC's strongest capabilities
  are its least syncable — late-bound `'all'` subjects, P1-10").
- **GAP** — the transport (founder decision + ~$5–10/mo); then merge semantics for the persisted
  graph (deliberately after day 90, AU §14); conflict-surfacing has no gate at all.
- **MINIMUM CHANGE** — **collaboration** (the founder's own taxonomy term: deploy leg C behind a
  staging flag; then per-capability convergence proofs; conflict-surfacing invariant on every
  merge that can lose data).
- **TEST** — two clients edit a wall and its hosted door concurrently → both converge, the
  hosting edge intact, and any lost-update path emits an explicit conflict artefact the user can
  resolve.
- **READINESS GATE** — `check-collab-graph-integrity` (CD §I — **blocked on A-3**; the block is
  stated, never absorbed into a green).

## 15. AI BOUNDARY

- **TARGET BEHAVIOR** — **"The LLM may sit above the computational model, not underneath it."**
  AI is a consumer of bus verbs and graph reads: read-only by default, mutating only through the
  same commands/constraints/refusals as a human, never an authority over model state; its
  outputs carry INFERRED provenance until accepted (pillar A of the architecture diagram).
- **WHY BIM 3.0 NEEDS IT** — the boundary is what keeps model truth deterministic while language
  stays free; the founder's doctrine is open vocabulary above, hard rule-gates below, refusing
  with both numbers.
- **CURRENT PRYZM IMPLEMENTATION** — the P0-4 inversion (read-only default posture); the
  structural read-only capability class, wired to the live intent path and proven against store
  bytes with a positive control, UNREADABLE ≠ EMPTY asserted through the production context
  builder (CD §A-6, CLOSED, `a48fa88d`); the RAC three-tier ladder with zero-token deterministic
  tiers; `runBatch` = one command, one undo; in-process AiPlane registration via
  `composeRuntime → getAiHost`.
- **CURRENT MATURITY** — "AI is an interface, not the source of truth: **YES**" with the
  read-only class the last gap — and that gap CLOSED in rev 2 (CD scoring table + §A-6, as of
  the last measurement). AI-required set is exactly three capabilities, all consumers (CD §F).
- **EVIDENCE** — CD §A-6, §F · AU §9, §17.3 (zero-token proofs; no AI key in production).
- **GAP** — graph verbs not yet chat-queryable (they don't exist — domain 5); AI-proposed
  content lacks INFERRED provenance fields (domain 10).
- **MINIMUM CHANGE** — **exposure** (once `graph.*` verbs exist, admit them to the read-only
  capability class — CD §G Tier 5) + **invariant** (accepted AI proposals stamp
  `origin:'ai-generated'`, never AUTHORED).
- **TEST** — a chat query answers a topology question through the same verb a script would use,
  including the refusal case; a chat-driven mutation is indistinguishable in the store,
  undo stack, and provenance from the same mutation scripted — except for its origin field.
- **READINESS GATE** — the RAC ladder probes + CA-21 rows for every AI-reachable verb; the
  read-only class's own positive-control test (already executed, CD §A-6).

## 16. CERTIFICATION

- **TARGET BEHAVIOR** — every capability claim in domains 1–15 is an EXECUTED claim: statuses
  derived from independently-measured axes, partial evidence never promoted, falsifiability
  proven in-run against tampered state, and no instrument able to print a pass it did not
  measure (pillar L operationalised).
- **WHY BIM 3.0 NEEDS IT** — certification is the only thing that keeps the other fifteen
  domains true next week; a guessed ✓ is the same defect class as a gate printing a number it
  never measured.
- **CURRENT PRYZM IMPLEMENTATION** — the BIM20 certification harness (`persistence.cert.ts` +
  `undoredo.cert.ts` + `generate-report.ts`, machine-readable JSON): real serializer/loader,
  real composed bus, whole-store deep captures, `statusOf()` derived never hand-assigned, empty
  tolerance list, per-row falsifiability (every green cell watched go red against a tampered
  expectation), MISCONFIGURED floors (`persist:opening` reports MISCONFIGURED, never clean);
  the four-exit-code contract; empty-seed impossibility (commit `e5addac8`); the C69 register +
  CA-21 census as the verb-level substrate.
- **CURRENT MATURITY** — the harness exists and has run (34 operations measured; suite deltas
  landing at the corpus stamp — CD rev 2 declined to re-score mid-edit, and that refusal is
  itself the discipline). The **gate suite of CD §I did not exist as of the corpus stamp**;
  the founder's candidate list marks four (`check-identity-roundtrip`,
  `check-derived-regenerable`, `check-propagation-reaches`, `check-collab-graph-integrity`) as
  since built — UNPROVEN-AT-WRITING, re-baseline to confirm which are live and green.
- **EVIDENCE** — CR (whole document, esp. Falsifiability + UNPROVEN list) · CD §I · ADR-0319
  (`check-derived-classification`).
- **GAP** — Geometry axis UNPROVEN everywhere (no headless fragment builds); the unified
  `performUndoRedo` path uncertified (legacy stack only); browser I/O uncertified; the remaining
  CD §I gates unbuilt.
- **MINIMUM CHANGE** — **invariant** (build the remaining gates on the existing harness — "none
  needs new infrastructure", CD §I; every gate under the four-exit-code contract with a floor).
- **TEST** — the certification *of the certification*: each new gate demonstrates, in its own
  run, that a tampered state goes red and that an unreadable subject reads MISCONFIGURED —
  before its first green is believed.
- **READINESS GATE** — this domain IS the gate suite: all ten CD §I gates +
  `check-derived-classification`, green at declared levels, is the Definition-of-Done condition 4
  of [`BIM30-TARGET-DEFINITION.md`](BIM30-TARGET-DEFINITION.md) §6.

---

## Cross-domain reading

Three facts organise everything above, and they are measured, not rhetorical:

1. **The ceiling is a decision, not code** — domain 14's missing transport caps every
   certification row at PARTIALLY VERIFIED by construction (CD §A). Domains 1–13 and 15–16 can
   all reach their targets while the ceiling stands; none can be *finished* (Golden Chain link
   10) until it lifts.
2. **The dominant implementation types are retention, wiring, and exposure — not construction.**
   The audit's REPLACE list is empty and survived the §17 downgrades (CD §H). The named
   construction items are exactly three, and labelled: the planegcs WASM binding (only if
   solving proves necessary), a general 2D boolean, a real clash engine.
3. **Nothing in this document is done until domain 16 says so.** Every TARGET BEHAVIOR above is
   a claim; the gate column is what keeps it true. That is the corpus's founding lesson —
   fifteen green-and-blind gates in one session — and it is why CERTIFICATION is a capability
   domain and not an appendix.
