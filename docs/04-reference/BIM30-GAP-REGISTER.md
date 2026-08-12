# BIM 3.0 Gap Register — every gap, twice classified

> **Stamp**: 2026-08-12 · **Phase 0** of the founder's BIM 3.0 master directive · **Branch**: `main` · **HEAD**: `a8f15234`
> **Companion**: [`BIM30-DO-NOT-REBUILD.md`](BIM30-DO-NOT-REBUILD.md) — the architecture-protection half. Read them as a pair: this document says what is missing, that one says what must survive the fixing.
> **Authority**: the contracts, not this file. [C70](../02-decisions/contracts/C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md) · [C71](../02-decisions/contracts/C71-GRAPH-AND-TOPOLOGY.md) · [C72](../02-decisions/contracts/C72-PROPAGATION-AND-PREVSTATE.md) · [C73](../02-decisions/contracts/C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) · [C74](../02-decisions/contracts/C74-CONSTRAINT-HONESTY.md) · [C75](../02-decisions/contracts/C75-PROVENANCE.md) carry the binding invariants and the measured facts. This register **indexes** them into one addressable list; where it and a contract disagree, **the contract wins**.
> **Doctrine**: no cell is inferred. Where evidence is absent the cell reads **UNPROVEN**, which is neither a pass nor a fail — it is *"nobody looked"* (C70 §2.2). No count below is a new measurement; every one is cited to the artefact that measured it, and counts rot in documents (C70 §0.2) — **re-run the gate, do not trust this line**.

---

## §0 — Why every gap carries TWO classifications

The founder's directive demands both a **maturity** grade and an **implementation type**, and the
two answer different questions. Grading alone cannot distinguish the two failure modes this
repository actually has:

- **A disconnected subsystem is not a missing subsystem.** `DependencyResolver` emits four typed,
  catalogued cascade events and nothing listens (C72 §0). The generic propagation layer is not
  absent — it is *unreachable*. Fixing it is a call site; building it would be a quarter.
- **A missing subsystem is not a disconnected one.** There is no 2-D boolean union anywhere in the
  tree, and three files independently defer one (audit §17.6). No amount of wiring produces it.

Maturity says how far the capability has climbed. Implementation type says **what kind of work
closes it**, and therefore what it costs and who can do it. A register carrying only the first
would rank the mock solver and the dead cascade identically; they are nothing alike.

### The maturity ladder (per-gap)

| Grade | Meaning |
|---|---|
| **G0** | absent — no representation of the concept exists |
| **G1** | represented — a type, a name, a declaration exists; no instances flow |
| **G2** | persisted — instances exist and survive save/reload |
| **G3** | relational — the datum is connected to other data, addressable from them |
| **G4** | computational — an algorithm consumes it and produces an answer |
| **G5** | deterministic reasoning — the answer is reproducible, refusal-honest, gate-pinned |
| **G6** | closed-loop — the answer feeds back into the model and maintains itself |

### The implementation types (per-gap)

| Type | What the work actually is |
|---|---|
| **WIRING** | the machinery exists and is not connected to its caller, its subscriber, or its registration |
| **RETENTION** | a value is computed and discarded; the fix extends an existing computation's lifetime |
| **EXPOSURE** | a capability is reachable internally but has no surface (verb, slot, API) |
| **INVARIANT** | the behaviour is right sometimes; the fix is a rule, a gate, or a refusal that makes it right always |
| **MISSING VERB** | no command id, or an id with no handler |
| **MISSING ALGORITHM** | the computation does not exist in the tree at all |
| **MISSING SOLVER** | a simultaneous system with no closed form and no numerical procedure |
| **MISSING PERSISTENCE** | the value exists in memory and is never serialized, or is serialized and never rebuilt |
| **MISSING COLLABORATION** | multi-client behaviour that no single-client change can produce |
| **ARCHITECTURAL CHANGE** | the current structure cannot host the fix; something must be replaced |

> **§0.1 — the headline finding, stated before the table so it cannot be missed.**
>
> ## ARCHITECTURAL CHANGE count: **0**.
>
> **Not one gap in this register requires replacing a subsystem.** The audit's REPLACE list is
> empty and *survived the §17 downgrades* — the two downgrades that made the report worse did not
> add a single replacement item ([CD §H](BIM30-CONTINUITY-DELIVERABLE.md)). One candidate for
> replacement was considered and **rejected**: merging the dual edge vocabulary (SemanticGraph's
> 25 types vs the UBG's 10), resolved by **mapping** instead, because merging the stores would
> change the serialized shape of `ProjectSnapshot` and break snapshot v3 for a naming preference
> (C71 §4.1, CD §E).
>
> Four items are **construction** — new code, not new architecture — and are labelled as such
> rather than smuggled in: the planegcs WASM binding (fills an existing adapter, and **only if a
> constraint family proves it needs solving**, C74 §4.2), a model-space constraint store (follows
> the component-editor's existing store pattern), a general 2-D boolean, and a real clash engine.
> They appear below as MISSING SOLVER / MISSING PERSISTENCE / MISSING ALGORITHM. **Construction is
> not architectural change**, and conflating the two is how a wiring list becomes a rewrite
> proposal.
>
> **The distribution is the argument.** WIRING · RETENTION · EXPOSURE · INVARIANT dominate this
> register, and that is a *finding about PRYZM*, not a coincidence: the signature hazard here is
> **authored-but-unwired**, found five times in one session (C74 §0 enumerates them). An audit of
> *existence* passes in this repository; an audit of *reachability* is the one that fails.

---

## §1 — Graph & topology (owner: C71)

| ID | Gap | Maturity | Impl type | Evidence | Contract | Smallest change | Blocked by |
|---|---|---|---|---|---|---|---|
| **GR-01** | **`contains` has no first-party writer.** Two production surfaces read it; only IFC import writes it. On a native project *"this room contains nothing"* and *"nobody ever wrote this edge"* are the **same answer** | **G1** (declared; no native instances) | **WIRING** | EV-04 §1 · EV-05 §1 | C71 §5.2, §2.1 row 7 | write the edge where containment is already computed — `RoomContentsService._containedByCentroid` is a pull-time query today (EV-03 §5.3) | — |
| **GR-02** | **12 declared families with zero writers AND zero readers** — `unitOf` `levelOf` `servesZone` `precededBy` `supersedes` `branchedFrom` `causedFailureOf` `wasMitigatedBy` `exceededBenchmark` `replacedBy` `maintainedBy` `decommissionedBefore` | **G1** | **NOT A GAP — PARKED** | EV-04 §1 | C71 §2.2, §2.3 · ADR-0320 | **none.** Parked is a different state from gap. No census, status doc, audit or roadmap may count these as missing capability (C71 §2.3), and they may not be deleted — that breaks `deserialize` on snapshot v3 (§2.4) | — |
| **GR-03** | The founder's brief and the corpus both say *"13 relationship types without writers"*. **Read with GR-01 + GR-02: 12 of the 13 are PARKED and one (`contains`) is the gap.** Recorded so the number is never re-inflated | — | — | EV-04 §1 | C71 §5.1 | none — this row exists to stop a recount | — |
| **GR-04** | **`joinedTo` is decided and unlanded.** ADR-0321 ACCEPTED; measured 2026-08-12 it is **not a member of `RelationshipType` and no writer exists**. Until it lands, C70 **C-INV-2** (wall connectivity is a lookup, never a per-query resolver re-run) is **UNPROVEN** | **G0** | **WIRING** (writer over an index that is now retained) | C71 §3.7 · ADR-0321 · `WallFragmentBuilder.levelJunctions` at HEAD | C71 §3 | one flush-time emitter reading the retained junction index, both directions, with `{junctionType, junctionDegree}`; **remove-and-re-emit per level** (§3.4) and **never** key on `WallJunctionRecord.id` (§3.5) | — |
| **GR-05** | **`sitsOn` was the most-written edge in the graph with no typed reader.** ADR-0320 states `DependencyResolver` and `buildBuildingGraph` have since gained reads; **EV-05 measured zero readers on 2026-08-11**. Whether the reader is *reached at runtime* is **UNPROVEN** — the graph has no CA-21 equivalent | **G3→G4, UNPROVEN** | **WIRING** | EV-05 §1 (zero readers) vs ADR-0320 Context (reads gained) | C71 §2.1 row 5 | re-measure at HEAD under `check-graph-write-coverage`; do not carry either claim forward | GR-11 (gate unbuilt) |
| **GR-06** | **`_rebuildSemanticGraph` regenerates 5 of 25 types** (`hosts`, `hostedBy`, `boundedBy`, `adjacentTo`, `partOf`) and fires only when the graph is empty — so `sitsOn`, `supports`, `connectedTo`, `connectedByStair`, `connectedByLift` are **PERSIST-OR-LOSE**. A pre-graph snapshot loses them permanently | **G2, lossy** | **MISSING PERSISTENCE** + **WIRING** | EV-04 §3 · EV-05 §3 | C71 §5.4 · C70 I-INV-2 | widen the one existing function — it protects four of the five priority rows at once (EV-05 §3) | — |
| **GR-07** | **The persist-or-lose list is prose in EV-05 §3 with NO gate.** C70 I-INV-2 requires it named, mechanical and shrink-only. *A ledger in a document is not a ledger* | **G2** | **INVARIANT** | C71 §5.4 · §7.k | C71 §6 (`check-graph-persistence`) | the ledger becomes the gate's input file, checked in **both directions** (C70 §5.5) | GR-11 |
| **GR-08** | **`_rebuildSemanticGraph` exists in TWO byte-identical copies** — `packages/persistence-client/src/loader/ProjectLoader.ts` and `apps/editor/src/engine/persistence/ProjectLoader.ts`. A rebuild widened in one copy and not the other is a divergence no test would see | **G2** | **INVARIANT** (dedup) | EV-04 §3 (both confirmed at HEAD) | C71 §5.3, §7.j | one owner; the gate arm (d) of `check-graph-persistence` asserts exactly one | — |
| **GR-09** | **`CreateWallCommand` writes no graph edges at all** — zero graph calls. The loader rebuild is currently the only source of a wall's graph presence, and it regenerates neither `sitsOn` nor `joinedTo` | **G1 for walls** | **WIRING** | EV-04 §2 [EXEC] · §5.5 | C71 §5.5 | a `sitsOn` write beside the existing store write (EV-04 §6.4) | — |
| **GR-10** | **`deserialize` silently drops malformed edges.** Any relationship missing `id`/`type`/`sourceId`/`targetId` is discarded on load — so malformed edges are written, saved without complaint, and vanish on the next load. *A defect that self-erases on reload is a defect nobody can reproduce* | **G2** | **INVARIANT** | EV-04 §4 | C71 §5.7 | count and report the drops; do not discard silently | — |
| **GR-11** | **All three C71 gates are unbuilt at HEAD** — `check-graph-write-coverage`, `check-graph-delete-integrity`, `check-graph-persistence` | — | **INVARIANT** | C71 §6 ("Measured 2026-08-12: none of the three exists at HEAD") | C71 §6 | build them beside the certification gates, each declaring **which graph** it measures (§6.1) | — |
| **GR-12** | **Mutation-update on MOVE is UNPROVEN for every family.** Semantic 5 of the six required semantics has never been measured, and no arm of any of the three specified gates covers it. `boundedBy` after a room-boundary change is the row most likely to be wrong | **UNPROVEN** | **INVARIANT** | EV-05 §4 · C71 §6.2(c) | C71 §1.4 | a move-time arm; it is named "the first thing to add" by the contract itself | GR-11 |
| **GR-13** | **Room identity is recovered by centroid proximity, not preserved.** `RoomDetectionEngine` mints a fresh UUID per detection; `mergeWithExisting` writes back the matched id only within `CENTROID_MATCH_RADIUS` = **2.0 m**. Move a bounding wall far enough and the room is **destroyed and unregistered** from `bimManager`, `elementRegistry`, the semantic graph and the spatial index — name, program, finishes and every edge with it | **G3, fragile** | **INVARIANT** | EV-03 §5.1, R-7 · `RoomDetectionEngine.ts:121/491/842/869` | C70 C-INV-3 | a **second** match key beside the centroid in `mergeWithExisting` — e.g. `boundingWallIds` set overlap. Existing function, one extra predicate | — |
| **GR-14** | **`RoomGraphService` returns `[]` for three distinguishable cases**, and two further production read paths return `[]` unconditionally: `SpeculativeEngine` guards on `getEdges` and `HierarchyTreePanel` calls `getEdgesFromNode?.(…) ?? []` — **neither method has ever existed** on `SemanticGraphManager`. **The hierarchy tree's Furniture group has never rendered** | **G4, dishonest** | **INVARIANT** | EV-04 §5b · EV-05 correction | C71 §4.4 · C70 L-INV-1 | typed refusal unions; call `getTargets`/`getRelationships`; and **type `window.semanticGraphManager`** so a wrong-signature read is a compile error — EV-04 §6.3 calls this the highest-leverage of the three | — |
| **GR-15** | **`measuredAt`'s writer is broken.** `PhysicsEngine.ts:380` calls `addRelationship` **positionally** with four arguments against a one-object signature; `window.semanticGraphManager` is `any`, so TypeScript cannot catch it. One junk edge per session; `measuredAt` is never written correctly | **G1** | **WIRING** (one line) | EV-04 §5a [verified], incl. its **downward severity correction** | C71 §5 | pass the object literal; type the global | — |
| **GR-16** | **No `graph.*` bus verbs.** `graph.query` / `graph.neighbors` / `graph.path` do not exist; the UBG has no runtime home and lives behind a dev-hook. *Machinery yes, exposure no* | **G4 internal, G0 exposed** | **EXPOSURE** + **MISSING VERB** | CD §E, scoring table | C70 D-INV-1/3 | UBG → a `composeRuntime` slot + three read-only, refusal-honest verbs in the existing read-only capability class | — |
| **GR-17** | **The UBG's own header claims snapshot persistence it does not have** — no `ubg` key in `ProjectSerializer.ts` | **G4, mis-documented** | **INVARIANT** | audit §17.6 | C71 §4 | correct the header or persist it; do not leave the doc-vs-code drift | — |
| **GR-18** | **No runtime probe has ever been executed against a live graph.** Every claim in EV-04/EV-05 is source-level. A writer that exists and is never reached still reads ✅ | **UNPROVEN** | **INVARIANT** | EV-05 §4 · C71 §5.8 | C71 §5.8 | a CA-21-equivalent read-back discipline for the graph | GR-11 |

---

## §2 — Propagation & prevState (owner: C72)

| ID | Gap | Maturity | Impl type | Evidence | Contract | Smallest change | Blocked by |
|---|---|---|---|---|---|---|---|
| **PR-01** | **The dead cascade, arm A: four typed CustomEvents, zero listeners.** `pryzm-dep-cascade` · `pryzm-room-reval` · `pryzm-hosted-reval` · `pryzm-structural-cascade`, all four carrying `TODO(TASK-15)` **on the dispatch line itself**. `setRebuildDispatcher` — the escape hatch the file's own comment points at — has 2 hits, both inside `DependencyResolver.ts`, and is **never called** | **G1** | **WIRING** *or* **DELETE** | C72 §0 (re-measured at HEAD 2026-08-12) · audit §17.2 | C72 §2.1 | one of exactly two terminal states — WIRED (both arms) or DELETED (dispatch + catalog + ledger row in one commit). **No third state may persist** | PR-02 (the other arm) |
| **PR-02** | **The dead cascade, arm B: `StoreChangeEvent` carries no pre-mutation state.** `{elementId, elementType, operation, timestamp}` plus two `@deprecated` flags. `DependencyResolver` subscribes to the **bus**, not the stores — so even if listeners appeared tomorrow, the diff-based work they exist to do would still be unreachable | **G1** | **RETENTION** | C72 §0.2 (`StoreEventBus.ts:63–80`) | C72 §3.2 | a pre-mutation field on the change-notification type. **Both halves, or neither** — a one-armed fix is theatre, and worse than none because it is green (§8.b) | — |
| **PR-03** | **`prevState` is emitted by 5 stores out of 120** `*Store.ts` files in `packages/` — `WallStore`, `SlabStore`, `core-app-model/stores/ColumnStore`, `geometry-column/ColumnStore`, `RoomBoundingLineStore`. `WallStore.ts:19` says *"DependencyResolver uses prevState"*; it cannot | **G2** | **RETENTION** | C72 §0.2 · EV-03 §7 (10 emitters / 23 subscribers / **5 actually read it**) | C72 §3.1 | copy the `§STEP7` convention to each store on the declared diff-consumer list — on **every** `update` emit site, not merely the listener type | — |
| **PR-04** | **`operation === 'delete'` returns `[]`.** The operation with the largest dependent fan-out computes nothing — *not a conservative default, a silent one* | **G1** | **INVARIANT** | C72 §0 · audit §17.2 | C72 §2.3 · C70 F-INV-2 | a delete never returns an empty cascade **by design** | PR-01 |
| **PR-05** | **`clearGraphAuthoritative` has 1 definition, 0 production callers, 1 test caller.** The only release that runs is the inline GR2 branch — a manual wall `add`/`remove` outside a batch. **Every generated level keeps its rooms suppressed by default**; a user who then drags a bounding wall gets no re-detection at all, and nothing distinguishes *"rooms are correct"* from *"rooms were never recomputed"*. The end-of-generation sweep is a **no-op by construction** | **G4, suppressed** | **WIRING** | C72 §4.1 · EV-03 §8.4, R-4 | C72 §4.1, §4.3 | let a wall **`update`** surrender authority in the existing GR2 branch, or clear the set before the lifecycle sweep. One condition, one existing branch | — |
| **PR-06** | **`initPersistence.ts:362` pauses `roomTopologyObserver` + `syncStateEngine` and resumes at `:372` with no `finally`.** A throw inside `ProjectLoader.load` leaves topology observation and sync-state recompute off for the rest of the session, silently, with the project loaded and looking fine | **G4, fragile** | **INVARIANT** | C72 §4.2 · EV-03 R-5 | C72 §4.2 | `try { … } finally { resume() }`, copying `performUndoRedo.ts:357–364` verbatim | — |
| **PR-07** | **`RECONCILABLE_TYPES` names 13 element types, is exported, and has zero consumers anywhere.** The actual level-elevation reconcile is one callback rebuilding **walls and slabs only** — columns, beams, stairs, roofs, furniture, curtain walls and handrails on a re-elevated level are **stranded at the old elevation** | **G1 (the list) / G4 partial (the reconcile)** | **WIRING** | C72 §5.1 (`SpatialAuthority.ts:243`; `initWallLevelSubscribers.ts:36–53`) | C72 §5.1, §5.2 | either a consumer that handles every type it names, **or narrow the list to the truth** — narrowing a claim to the truth is a fix (§7) | — |
| **PR-08** | **`check-prevstate-contract` and `check-suppression-is-reversible` are specified and NOT BUILT** | — | **INVARIANT** | C72 §6.2, §6.3 | C72 §6 | build both; pin baselines **at the measured reading**, never above it | — |
| **PR-09** | **No gate asserts that the bespoke trackers still reach their pairs.** `check-propagation-reaches`'s subject is the four generic events only; the propagation that actually works is **ungated** | **UNPROVEN** | **INVARIANT** | C72 §6.1.2(d) | C72 §6.1.2 | a per-pair seam test in the `WallOpeningEmitSeam.test.ts` shape — driving the real mutation entry point, never a hand-built fixture (§3.4) | — |
| **PR-10** | **Roof → walls-beneath propagation is MEASURED-ABSENT in both directions.** Every roof-store subscriber is rendering, selection, culling or persistence. No wall consumer, no room consumer, no cross-rule. The known flat-roof/slab clash is therefore **structurally unpreventable** — no subscriber exists that could detect it | **G0** | **WIRING** + **MISSING ALGORITHM** (the detector) | EV-03 §6 [EXEC greps] | C72 §1.1 | a subscriber first; the clash detector is GE-06 | GE-06 |
| **PR-11** | **The wall→room cascade rule is authored and never registered**, and the handler it would register is itself a no-op. `room.recomputeBoundary` returns empty forward/inverse; `registerCrossHandlers` has zero callers | **G1** | **WIRING** — *but see the warning* | EV-03 R-8 [EXEC: 2 hits, definition + re-export] | C72 §2.2 | implement the handler **first**. Registering a no-op and claiming coverage is the defect, not the fix | — |
| **PR-12** | **Schedules have no geometry subscription** — open panels show stale areas after a geometry change | **G0** (BY-READ, not re-checked) | **WIRING** | audit §17.2 §5-matrix · EV-03 §10(2) — **UNPROVEN at HEAD** | C72 §1.1 | a subscription; verify the staleness first | — |
| **PR-13** | **Three stores are duplicated** (Column / Door / Window in both `core-app-model/src/stores` and `geometry-*`). **Any cascade wired to one is blind to the other** | **G2** | **INVARIANT** (dedup) | EV-03 R-12, §7.1 | C72 §0.3 | resolve to one owner before wiring any propagation through them | — |

---

## §3 — Geometry determinism & tolerance (owner: C73)

| ID | Gap | Maturity | Impl type | Evidence | Contract | Smallest change | Blocked by |
|---|---|---|---|---|---|---|---|
| **GE-01** | **There is no tolerance policy.** **267** tolerance declarations across `packages`/`apps`/`plugins`; **at least eight distinct "a small number means equal" conventions spanning three orders of magnitude** (`1e-6`×49, `0.05`×24, `0.001`×21, `1e-9`×18, …). **`packages/geometry-kernel` exports no epsilon at all** — the layer that owns geometry has no opinion on tolerance, so every consumer forms its own | **G4, non-deterministic across callers** | **INVARIANT** | C73 §0.1 (measured at HEAD, command given) | C73 §2.1 | one declared tolerance module exported from `geometry-kernel`: a numeric-zero epsilon, a model-space coincidence tolerance, a parallelism tolerance — **unit-qualified in the name** (§2.3). Domain bands (`defaultJunctionBandM`, `CENTROID_MATCH_RADIUS`) are **not** epsilons and stay put | — |
| **GE-02** | **Point-in-polygon has ~71 named definitions across 116 files**, **61 distinct ray-cast bodies across 56 files** by structural signature. A prior audit reported 42 — *that number was a floor, not a ceiling*, the **second** hand-counted duplicate tally in this repo to come in low **in the direction of leniency**. **2 rival "shared" implementations with 3 consumers between them**; both were written to end the duplication, neither did | **G4, caller-dependent** | **INVARIANT** (canonicalisation) | C73 §0.2 | C73 §3.1 | the proven R3 recipe — canonical file + **structural** counting gate + named exclusions + baseline pinned at the reading. **One family per PR**, shipping consumer identified **first** (§3.5, §3.6) | GE-07 |
| **GE-03** | **One file contains three copies of the even-odd ray cast with three different degenerate-divide guards** — `CesiumViewport.ts:9621` (`|| 1e-12`), `:10317` (`|| 1e-9`), and `pointInRing` (**no guard at all**). A horizontal edge is "inside" under one, "outside" under another, and a division by zero under the third — one file, one polygon, one session | **G4, self-contradictory** | **INVARIANT** | C73 §0.2 | C73 §2.4 | the guard comes from the declared numeric-zero epsilon or the predicate refuses. Where copies disagree, the collapse **states which behaviour is canonical and why** (§3.7) | GE-01 |
| **GE-04** | **`WallIntersectionResolver` ×3** (`ai-host`, `core-app-model/ai`, `room-topology` — two byte-identical) · **`FloorPlanDiagnostics` ×2** · **`RoomStore.ts` ×2** (`room-topology`, `stores`) | **G4** | **INVARIANT** (dedup) | C73 §0.2 (measured same day) | C73 §3 | one owner per family; the shipped copy identified by name before collapsing — *fixing the copy the shipping path cannot reach reads as done and is not* (§7.h) | — |
| **GE-05** | **No general 2-D boolean.** ≥5 independent Sutherland–Hodgman half-plane clippers, **no general clipper, no union primitive**; three files independently defer "a future general clipper". *"Merge two footprints" is not expressible* | **G0** | **MISSING ALGORITHM** (construction) | audit §17.6 table | C73 §3 | construction, labelled — not wiring | — |
| **GE-06** | **Clash detection is a stub wearing a capability's clothes — and the two id sets do not even match.** `packages/command-bus/src/commands.ts:395–408` declares `ClashDetectionToolbarCommands` with **12** entries; `ClashDetectionToolbar.ts` emits **12** ids; **only 3 are common to both** (`clash-run`, `clash-filter-new`, `clash-report-export`). Measured at HEAD: **no handler in any plugin, and no detector anywhere in the tree** | **G0** | **MISSING ALGORITHM** + **MISSING VERB** | audit §17.6 ("12 command ids, no engine") · verified at HEAD 2026-08-12 | C70 L-INV-1 | *first*, make the ten unhandled ids **refuse** rather than silently no-op; the engine is construction | — |
| **GE-07** | **Three C73 gates are specified and NOT BUILT** — `check-epsilon-policy`, `check-predicate-canonical`, `check-deterministic-regeneration` | — | **INVARIANT** | C73 §5 | C73 §5 | build them; **counting** gates, matched on structure, not names (§3.2) | — |
| **GE-08** | **Cross-machine determinism and GPU-side geometry are UNPROVEN** — D1/D2 run in one process on one architecture; anything computed in a shader is outside every gate | **UNPROVEN** | **INVARIANT** | C73 §5.4(b)(c) | C73 §5.4 | say UNPROVEN; do not infer it from single-process green | GE-07 |
| **GE-09** | **No gate asserts that a refusal is surfaced to the user** rather than caught and logged | **UNPROVEN** | **INVARIANT** | C73 §5.4(d) | C73 §4.4 | a reachability arm; "Invalid geometry" is a shrug, not a refusal | — |
| **GE-10** | **No `wall.split` verb id.** ⚠ **Corrected here against the corpus**: `wall.cut` **exists and is opening-aware** — `plugins/wall/src/handlers/CutWall.ts` **rejects a cut whose openings straddle the cut point, naming the offending opening ids**, re-checks race-defensively, and partitions the surviving openings to left/right. **The opening-blind path is the legacy `CutWallCommand`**, which discards the far half including its openings. The gap is a `split` id, not a missing capability | **G4 (cut) / G0 (split)** | **MISSING VERB** | verified at HEAD 2026-08-12 (`CutWall.ts:17–20, 116–126, 152–159, 184–224`) vs CD §C, audit §5/§17 | C70 §3 | a `wall.split` id over the existing opening-aware handler; **do not rebuild the cut path** | — |
| **GE-11** | **The room spatial index is fed two incompatible AABB definitions** (true bbox vs circle approximation) — **a concave room can be missed**. A live correctness bug, not duplication | **G4, incorrect** | **INVARIANT** | audit §17.6 | C73 §1 | one AABB definition; pin with a concave-room regression test | — |
| **GE-12** | **Triangulation ×5, segment intersection ×7+, ~30 `signedArea` + 7 `ensureCCW`, planar face tracing ×5** (incl. `PlanarTopologyEngine` ×3, two byte-identical 477-line clones beside the 220-line **shipped** one). A centroid-fan triangulation is **silently wrong on concave rooms**; simplicity is asserted at exactly ONE call path | **G4** | **INVARIANT** (canonicalisation) | audit §17.6 table | C73 §3.1 | R3 recipe, one family per PR, in the order the measured duplication argues for | GE-07 |

---

## §4 — Constraint honesty (owner: C74)

| ID | Gap | Maturity | Impl type | Evidence | Contract | Smallest change | Blocked by |
|---|---|---|---|---|---|---|---|
| **CO-01** | **The named mock.** `PlanegcsAdapter.ts:95` — `this.underlying = opts.underlying ?? new MockSolver()`; every `solve()`/`diagnose()` is a one-line delegation. And `:85` declares **`readonly kind = 'planegcs'`**. `MockSolver` is honest (`kind='mock'`); **the adapter takes the mock's behaviour and puts the real solver's name on it.** A caller inspecting the only externally visible identity the `SolverPorter` shape offers is told `planegcs` and gets projection arithmetic | **G1** | **INVARIANT** | C74 §0 | C74 §3.1, §3.2 | report the `kind` it performs, and emit a **non-suppressible first-call signal in a production build**. Satisfiable today, with no new dependency (§4.4) — **and it must land in its OWN commit, before any binding work** (§4.3), or the organisation learns nothing |  — |
| **CO-02** | **The silent fallback.** `loadSolver()` returns `MockSolver` on **both** paths — the no-URL miss and the fall-through *after* the URL is supplied. Supplying `PLANEGCS_WASM_URL` — the one action a caller could take to ask for the real thing — **changes nothing and reports nothing** | **G1** | **INVARIANT** | C74 §0 (`engine.ts:468`, `:483`) | C74 §3.3 | "not configured" and "configured but could not load" become different observable outcomes, and the second is a **failure**, not a default | — |
| **CO-03** | **The 31 of 33 passing tests test the mock.** `PlanegcsAdapter.test.ts` verifies delegation by *injecting* `opts.underlying` — the field whose own docstring says *"Production callers MUST NOT pass this"*. **The configuration production actually uses (the `??` fallback) is the untested one** | **G1** | **INVARIANT** | C74 §0 | C74 §3.5, §3.6 | the test file states which production configuration it does **not** cover; no claim of the form "the solver works, N tests pass" without naming the bound subject | — |
| **CO-04** | **`planegcs` is not a dependency of any workspace** — `grep '"planegcs"' --include=package.json` → **0 hits** repo-wide. There is no WASM module to bind, at any version | **G0** | **MISSING SOLVER** (construction — *and unauthorised*) | C74 §0, §3.7 | C74 §4.1, §4.5 | **none yet.** §4.5 stands: **UNPROVEN — no constraint family in this repository has been shown to require SOLVING.** *Do not build a solver because "BIM 3.0 sounds like it needs one"* | CO-08 (the per-family classification) |
| **CO-05** | **`createWorkerHandler` has zero production callers** — 10 hits: the definition, a barrel re-export, three doc comments, five test lines | **G1** | **WIRING** *or* **DELETE** | C74 §0, §3.8 | C74 §3.8 | wire it, or say in the barrel that it is unwired | — |
| **CO-06** | **The scaffold is undated and its two halves disagree.** The adapter header says *"S52 D1 SCAFFOLD … binding lands at S52 D2"*; `engine.ts` says **S53 D1** in four places. *A scaffold whose retirement date is untracked is permanent architecture that nobody chose* | **G1** | **INVARIANT** | C74 §0 | C74 §3.4 | an owner, a milestone, and an **assertion that fails when the milestone passes without the retirement** | — |
| **CO-07** | **`StairValidationAuthority` exists twice** — `geometry-stair` (production imports this one) and `constraint-solver` (**zero production importers**). Whichever copy the tests bind to, one of them is a rule set that can drift from shipped behaviour with a green suite | **G4** | **INVARIANT** (dedup) | C74 §2.2 · audit §17.1.3 | C74 §2.2 | one owner **before either copy is extended**; until then neither may be cited as "the stair rules" without naming which | — |
| **CO-08** | **No constraint family carries a §1.1 classification.** VALIDATION / ENFORCEMENT / ADVISORY / SOLVING is written down per constraint, with its evidence, **before any solver work is authorised** — and it is not written down anywhere today | **G0** | **INVARIANT** | C74 §1.3, §7.7 | C74 §1.3, §4.2 | the written classification. A family with none is treated as VALIDATION — the cheapest kind, not the most expensive | — |
| **CO-09** | **No model-space constraint store.** `annotationConstraints` is the **only** persisted constraint family in the system — written to the snapshot, read back, checked, never solved | **G2 for one family, G0 otherwise** | **MISSING PERSISTENCE** (construction, following an existing store pattern) | C74 §2 · audit §17.1.6 | C74 §4.2 | none until a family reaches §4.2(c) with evidence | CO-08 |
| **CO-10** | **Violations are log lines, not queryable model state.** The `violates` edge + `constraintAdapter` are **dev-only reachable** — `provideLiveGraphSources`'s only caller is a dev-tools file | **G2-dev-only** | **WIRING** | audit §17.1.4 | C70 G-INV-3 | a production caller for `provideLiveGraphSources`; validators emit `violates` edges | — |
| **CO-11** | **All three C74 gates are UNBUILT** — `check-constraint-honesty`, `check-solver-is-real`, `check-no-hidden-mock` | — | **INVARIANT** | C74 §6 ("all three UNBUILT at stamp time") | C74 §6 | build them; each carries an **exit-2 floor** on its own subject discovery and each arm is **negative-tested against a planted violation before it is trusted** (§6.2) | — |
| **CO-12** | **No gate enumerates the `./compliance` registry's rules** — only its wiring is checked | **UNPROVEN** | **INVARIANT** | C74 §6.3(d) | C74 §6.3 | an enumeration arm | CO-11 |

---

## §5 — Provenance (owner: C75)

| ID | Gap | Maturity | Impl type | Evidence | Contract | Smallest change | Blocked by |
|---|---|---|---|---|---|---|---|
| **PV-01** | **Provenance is invented at deserialisation.** `roomSnapshotUtils.ts:156` — `detectionMethod: (raw['detectionMethod'] as any) \|\| 'auto-topology'`. A snapshot missing the field is loaded **as if topology had detected the boundary**; `'auto-topology'` is not a neutral placeholder, it is the **most authoritative member of the union**. The `as any` defeats the union at exactly the point it would have caught this, and the serialised shape declares the field as bare `string` | **G2, false** | **INVARIANT** | C75 §0 Finding 1 | C75 §2.1, §7.1 | record **UNKNOWN-with-reason**; type the serialised field `RoomDetectionMethod` | — |
| **PV-02** | **Element schemas carry no provenance whatsoever.** Across `packages/schemas`: `originDetail` **0 hits**, `derivationStatus` **0 hits**, `detectionMethod` **0 hits**; every `origin:` in `elements/*` is a geometric `Vec3` — a *point*, not a provenance. The room/floor/ceiling family is the only element-level provenance in the system **and it does not live in the schema package at all** | **G0 for every kind but one** | **MISSING PERSISTENCE** | C75 §0 Finding 2, §3.3 | C75 §2.4 | a five-value provenance type **in `packages/schemas`**, built from the idioms that already exist (Finding 3), optional with an `UNKNOWN` default so existing snapshots parse unchanged (§2.5) | MT-01 — *provenance fields are worthless while a verb can stamp them on a detached DTO store* (audit §17.3) |
| **PV-03** | **The repair path stamps invented geometry as detected.** `RoomDetectionEngine.ts:454` runs `repairToSimplePolygon()` on a self-intersecting boundary — replacing it with *the largest simple ring*, a polygon the topology never traced — and then writes `detectionMethod: 'auto-topology'` at `:475`, identical to a genuinely flood-filled room. **The repair is logged to the console and not to the model** | **G2, false** | **INVARIANT** | C75 §0 Finding 4 | C75 §2.3 | write **INFERRED** plus the reason — *the fix IS writing the field* — or refuse in the `SlabFragmentBuilder.ts:706` form, which is twenty files away | PV-02 |
| **PV-04** | **No export mapping exists.** How AUTHORED/OBSERVED/COMPUTED/INFERRED/REGENERATED land in IFC or DXF is undefined. **The contract names this its largest open risk**: provenance that stops at the export boundary protects nothing downstream — it is how a generated guess ends up in an IFC export as a surveyed fact | **UNPROVEN** | **MISSING PERSISTENCE** (export) | C75 §5, §6.3(c) | C75 §7.7 | the mapping, or its absence recorded **by name** as an accepted limitation — never left blank | PV-02 |
| **PV-05** | **`ProvenanceStore` (C23 AI lineage) is not persisted at all** — destroyed on every reload | **G1** | **MISSING PERSISTENCE** | audit §17.3 | C70 I-INV-2 | persist it, or place it on the named persist-or-lose ledger | GR-07 |
| **PV-06** | **`confidence` has zero hits repo-wide** on the element side, while the site/context/climate/zoning domains carry rich, mandatory confidence | **G0** | **MISSING PERSISTENCE** | audit §17.3 | C75 §1.3 (C62 owns confidence) | reuse C62's model — do **not** reinvent it (§4.h) | PV-02 |
| **PV-07** | **All three C75 gates are UNBUILT** — `check-provenance-not-invented`, `check-provenance-coverage`, `check-derived-not-authored`. Per-kind coverage is therefore **UNPROVEN**, not zero | — | **INVARIANT** | C75 §6, §3.3 | C75 §6 | build them with exit-2 floors, each arm negative-tested before it is trusted | — |
| **PV-08** | **`detectionMethod` is three non-unified enums** across the one family that has provenance | **G2** | **INVARIANT** | audit §17.3 | C75 §1.2 | one vocabulary; the five values may not be aliased per package | PV-02 |

---

## §6 — Model truth, verbs & identity (owners: C70, ADR-0318, C69)

| ID | Gap | Maturity | Impl type | Evidence | Contract | Smallest change | Blocked by |
|---|---|---|---|---|---|---|---|
| **MT-01** | **`wall.create` and `slab.create` are readback-negative, and `room.create` dispatch-throws** on the composed bus — the plugin handlers write **DTO stores nobody reads**. *A mutation that changes a DTO nobody reads is a lie, not a capability* (C70 A-INV-3). Newly measurable only because C6 made the stores reachable; the generated verb register still grades all three **UNKNOWN** | **G1** | **WIRING** | [BIM20-ACCEPTANCE §0.1 follow-up 1](../03-execution/plans/BIM20-ACCEPTANCE-10-OF-10.md) | C70 A-INV-3 · ADR-0318 | per-kind ADR-0318 adoption (wall, room, slab first — they gate everything graph-shaped); each migration PR extends `adr0318.stores.probe.ts` with that kind's same-instance assertion | — |
| **MT-02** | **`view.create` raises a TypeError**, and **`sheet.create` / `schedule.create` / `hierarchy.createSite` are registered verbs that no handler answers** | **G1** | **MISSING VERB** (handler) | acceptance §0.1 follow-up 1 | C69 · C70 L-INV-1 | a handler, or a **refusal** — a registered id that silently does nothing is the worst of the three states | — |
| **MT-03** | **9 SHADOWED verbs remain** (14→9 at close-out). A bridge is the designated winner in every case; per-verb read-back tests are required | **G2** | **WIRING** | acceptance §0.1 follow-up 2 · `tools/ga-gate/check-verb-register.ts` | C69 | resolve per verb with a read-back test, not a preference | — |
| **MT-04** | **11 store kinds remain unadopted** by the ADR-0318 registry — ABSENT-headless, present in-browser via `registerAllStores` | **G2 in-browser / G0 headless** | **WIRING** | acceptance §0.1 follow-up 2 · ADR-0318 Exit condition | ADR-0318 I-3 | per-kind construction behind a headless-safe factory; **honest absence** (`undefined`) until then — no scaffold, no empty stand-in | — |
| **MT-05** | **`engineLauncher` hands `window.columnStore ?? columnStoreInstance` to the serializer** for column and curtain-wall while registering the instance into the registry. If the window global is ever a *different* instance, **registry identity and serializer identity diverge for those two kinds** — and the same-instance probe cannot see it headlessly | **G2, at risk** | **INVARIANT** | ADR-0318 "Named residual risks" | ADR-0318 I-1 | the per-kind migration deletes the `??` fallbacks | MT-04 |
| **MT-06** | **`persist:opening` is MISCONFIGURED for its kind** — `openingStore` holds 0 records after seed and **says so**, honestly. Whether it is authoritative at all is unsettled; openings have **two authoritative copies** (`OpeningStore` + `WallData.openings[]`) with nothing pinning them | **G2, rival authorities** | **INVARIANT** | acceptance §0.1 follow-up 5 · audit §17.3, §17.6 | C70 A-INV-1 | declare the single authority and delete the loser. Note `wall.openings[]` is already invariant-checked and `WallOccupancyStore` **stores nothing** — the design property is good, the rival is the problem | — |
| **MT-07** | **Three rival level records** — `WallStore` levels (the persisted one) vs `packages/stores` `LevelStore` vs the hierarchy — and wall `baseLine[*].y` stores **absolute world Y**, so the persisted DTO goes stale after a level-elevation change even though geometry re-projects | **G2, rival authorities** | **INVARIANT** | audit §17.3, §17.6 | C70 A-INV-1 | one authority per rivalry, declared | — |
| **MT-08** | **The undo gesture race** — pinned RED-BY-DESIGN by 3 `it.fails` at the 250 ms window | **G4, racy** | **INVARIANT** | acceptance §0.1 follow-up 3 | C70 §3.1 undo/redo link | **founder decision on §UNDO-GESTURE-ID.** Explicitly *not* taken as decided by the founder's "agree" of 2026-08-12 (ADR-0321 status note) | founder |
| **MT-09** | **27 packages fail isolated compilation**, masked by root `skipLibCheck` and surfaced only when the compile gate was un-blinded (it had fabricated ~90 PASS lines per run **for its entire life**) | **G4, unverified** | **INVARIANT** | acceptance §0.1 C9, follow-up 4 · commit `2b1e7e99` | C70 §0 | exit-3-fenced per territory; shrink-only | — |
| **MT-10** | **8 post-freeze XSS sites** | **G4, unsafe** | **INVARIANT** | acceptance §0.1 follow-up 4 | — (security; owned by territory) | fix per site, exit-3-fenced | — |

---

## §7 — Collaboration (owner: C70 pillar K, C08, C66)

| ID | Gap | Maturity | Impl type | Evidence | Contract | Smallest change | Blocked by |
|---|---|---|---|---|---|---|---|
| **CB-01** | **Leg C is not deployed — no CRDT transport exists in any environment.** Collaboration is UNPROVEN on every certification row **by construction**, which caps every row at PARTIALLY VERIFIED. *No amount of further engineering raises the ceiling; one founder decision does* | **G0 deployed / G4 client-side** | **MISSING COLLABORATION** | CD §A-3 · acceptance §0.1 C8 · C66: 0 tiers HELD | C70 K-INV-3 | deploy behind a staging-only flag; the code side is PROVEN locally (hosting edge survives concurrent editing, WS auth fail-closed) and the decision is *a single reversible flip* | **founder** |
| **CB-02** | **`PgAuthz` has not been written**, `MemoryAuthz.addMember()` is called **nowhere in production**, and the `project_members` table exists with nothing hydrating from it. So `PRYZM_AUTHZ_MODE=memory-allow-by-default` means **any signed-in PRYZM user who can name a room can join it**; `memory-deny` means nobody can join anything. Acceptable for a staging cohort; **not for production** | **G1** | **MISSING COLLABORATION** (authz) | [L-391 §4.1](../03-execution/plans/L-391-COLLAB-DEPLOY-DECISION.md) | C08 | `PgAuthz` is a **drop-in behind an existing seam** — the gate already asks the `Authz` boundary on every upgrade and refuses with `403 / not-a-project-member`; no call sites change | prerequisite of the **production** flip, not of CB-01 |
| **CB-03** | **`check-collab-graph-integrity` lives in `tools/ga-gate/`, not beside the BIM 3.0 certification gates.** Recorded as a **finding**, not blessed: two suites with two exit-code implementations is how the four-exit-code contract quietly becomes two contracts | **G1** | **INVARIANT** | C70 §7.1, §7.2 | C70 §7.2 | one suite, one `contract.ts` | — |
| **CB-04** | **Conflict-surfacing has no gate at all.** C70 K-INV-2 — *any merge discarding a user's authored state produces an explicit, resolvable conflict artefact; no silent substitution* — is unmeasured by anything | **G0** | **INVARIANT** | CD §A-3, capability model §14 | C70 K-INV-2 | a gate; it can be specified before the transport exists | CB-01 to run it |
| **CB-05** | **The RAC's strongest capabilities are its least syncable** — late-bound `'all'` subjects (P1-10) | **UNPROVEN** | **MISSING COLLABORATION** | audit §12 | C08 | per-capability convergence proofs after CB-01 | CB-01 |

---

## §8 — Certification & gates (owner: C70 §5, §7)

| ID | Gap | Maturity | Impl type | Evidence | Contract | Smallest change | Blocked by |
|---|---|---|---|---|---|---|---|
| **CE-01** | **6 of the 10 gates C70 §7 names have no file at HEAD.** Present: `check-identity-roundtrip`, `check-derived-regenerable`, `check-propagation-reaches` (certification suite) and `check-collab-graph-integrity` (ga-gate). **Absent**: `check-topology-survives`, `check-graph-write-coverage`, `check-constraint-honesty`, `check-epsilon-policy`, `check-provenance-not-invented`, `check-derived-classification` | — | **INVARIANT** | C70 §7.1 (measured 2026-08-12); confirmed at HEAD: `tools/rac-conformance/certification/gates/` holds exactly the three | C70 §7.1 | build them **on the existing harness — none needs new infrastructure** (CD §I) | — |
| **CE-02** | **The Geometry axis is UNPROVEN everywhere headlessly** — no fragment builders run in the certification harness | **UNPROVEN** | **WIRING** (harness) | capability model §16 GAP · CR | C70 §6.1 | a headless fragment build in the harness so the axis stops reading UNPROVEN | — |
| **CE-03** | **Browser I/O is uncertified** — IndexedDB / Supabase / autosave are never exercised; only the in-memory serializer/loader pair is | **UNPROVEN** | **INVARIANT** | CR UNPROVEN list · capability model §3 | C05 | name it; do not let in-memory green read as persistence green | — |
| **CE-04** | **The unified `performUndoRedo` path is uncertified** — the legacy stack only | **UNPROVEN** | **INVARIANT** | capability model §16 GAP | C03 §4.5–4.8 | extend `undoredo.cert.ts` to the unified path | — |
| **CE-05** | **Static discovery counts authored-but-unreached code as present.** No gate in the suite answers the **reachability** question, which is the one this repository keeps failing | **UNPROVEN** | **INVARIANT** | C70 §7.3(a) · C71 §6.2(a) | C70 §4.2 | *"Machinery present ≠ capability reachable"* — the reachability probe is the missing instrument class | — |
| **CE-06** | **An executed run proves the seeded fixture, not the user's project**, and every non-collaboration gate is **single-client by construction** | **UNPROVEN** | **INVARIANT** | C70 §7.3(c)(d) | C70 §7.3 | stated, not fixed — the fixture is itself a declared, reviewable artefact | — |

---

## §9 — Implementation-type distribution

Counted over the **84 rows** above, excluding the two non-gap rows (GR-02 PARKED, GR-03 the
recount note) — **82 classified gaps**, of which four carry two types (GR-06, GR-16, PR-10, GE-06),
giving **86 type-instances**.

| Implementation type | Count | Reading |
|---|---|---|
| **INVARIANT** | 48 | the largest class by far: the behaviour exists and is right *sometimes*; a rule, a gate or a refusal makes it right *always*. **Roughly half of these are the gates themselves** — 16 named gates are specified-and-unbuilt across C71–C75 |
| **WIRING** | 18 | authored-but-unwired — the signature hazard |
| **MISSING PERSISTENCE** | 6 | mostly provenance fields, the persist-or-lose ledger, and the constraint store |
| **MISSING VERB** | 4 | `wall.split` · the registered ids no handler answers · the graph verbs · the clash ids |
| **MISSING ALGORITHM** | 3 | 2-D boolean · clash engine · the roof-clash detector (the same engine) |
| **MISSING COLLABORATION** | 3 | transport · authz · per-capability convergence |
| **RETENTION** | 2 | `prevState` on `StoreChangeEvent`; `prevState` at the remaining stores |
| **EXPOSURE** | 1 | the UBG → `composeRuntime` slot and the three graph verbs |
| **MISSING SOLVER** | 1 | and it is **unauthorised** — C74 §4.5 stands |
| **ARCHITECTURAL CHANGE** | **0** | — |

> **§9.1 — say it loudly, because it is the headline.** **ARCHITECTURAL CHANGE is EMPTY.**
> Eighty-two rows of measured defects, spanning six contracts and every one of the twelve pillars, and **not
> one of them requires replacing a subsystem.** The dominant work is connecting things that are
> already built and pinning behaviours that are already mostly right. The single replacement
> candidate anyone proposed — merging the dual edge vocabulary — was **considered and rejected**,
> because it would break snapshot v3 for a naming preference and deliver no capability on the
> other side (C71 §4.1).
>
> **The corollary is a warning, not a comfort.** A repository whose entire defect list is wiring
> and invariants is a repository where *reading the code will always look better than running
> it*. That is precisely the condition under which fifteen gates went green-and-blind, a compile
> gate fabricated ~90 PASS lines per run for its entire life, and an **empty seed scored better
> than any real run**. The absence of architectural change raises the value of the gates, it does
> not lower it.

---

## §10 — Coverage matrix (directive §22)

**TARGET → CURRENT → GAP → IMPLEMENTATION → TEST → GATE**, one row per capability domain of
[`BIM30-CAPABILITY-MODEL.md`](BIM30-CAPABILITY-MODEL.md). *CURRENT* cells are cited, never
inferred; **UNPROVEN** means nobody looked and is neither a pass nor a fail.

| # | Domain | TARGET | CURRENT | GAP (ids) | IMPLEMENTATION | TEST | GATE |
|---|---|---|---|---|---|---|---|
| 1 | **Model truth** | one authoritative store per kind, named by the composition root | ADR-0318 slot live; door/window headless-authoritative **by design**; 11 kinds ABSENT-headless | MT-01…07 | WIRING + INVARIANT | per-kind mutate→read-back→same-instance (`adr0318.stores.probe.ts` pattern) | CA-21 census + `check-identity-roundtrip` store-reach floor |
| 2 | **Identity** | id + GUID byte-stable across save/reload/undo/redo/export | **HOLDS** — 17/17 kinds keep id **and** GUID; `check-identity-roundtrip` **0 CLEAN** | — | — | executed, green | `check-identity-roundtrip` ✅ |
| 3 | **Persistence** | authoritative byte-for-byte, derived equivalent, incidental enumerated | persistence **0 FAILED**, exclusions enumerated per ADR-0319 and printed per row | MT-06, CE-03 | INVARIANT | H1 comparator + two-cycle drift run | `check-identity-roundtrip` + `check-derived-regenerable` ✅ · **browser I/O ⛔ UNMAPPED** |
| 4 | **Topology** | REQUIRED families with writer + typed reader + rebuild + mutation-update on delete **and** move | 4 HEALTHY of 25 declared; junctions **now retained**; `joinedTo` unlanded | GR-01, 04, 05, 06, 09, 12, 13 | WIRING + RETENTION + INVARIANT | move/resize/save-load/undo → connectivity answered as a lookup with no resolver re-run | `check-topology-survives` ⛔ **absent** · `check-graph-write-coverage` ⛔ **absent** |
| 5 | **Graph** | one canonical query vocabulary, exposed as refusal-honest bus verbs | *machinery yes, exposure no* — **zero graph verbs**; UBG behind a dev-hook | GR-14, 16, 17 | EXPOSURE + MISSING VERB | rebuild twice → identical snapshots; the golden query through the bus verb **plus its refusal path** | `check-graph-write-coverage` ⛔ **absent** |
| 6 | **Geometry** | deterministic consequence of state; one predicate per family under one epsilon policy | determinism **YES — the strongest finding in the assessment**; substrate duplicated and unguarded | GE-01…12 | INVARIANT + MISSING ALGORITHM | per-family counting gates at pinned counts + an oracle fixture at a known answer (offset's 300 mm, spread 0.000) | `check-epsilon-policy` ⛔ · `check-predicate-canonical` ⛔ · `check-deterministic-regeneration` ⛔ (offset gate ✅ is the template) |
| 7 | **Propagation** | every declared cascade has a live listener **and** a `prevState`-carrying emitter | generic cascade **dead**; bespoke spine **works and earns Level 4** | PR-01…13 | WIRING + RETENTION | move one wall → exactly the predicted dependents change, `prevState` diff as oracle | `check-propagation-reaches` ✅ (8 findings, all declared) · `check-prevstate-contract` ⛔ · `check-suppression-is-reversible` ⛔ · **bespoke trackers ⛔ UNMAPPED** |
| 8 | **Constraints** | declared rules at proven strengths; adapters truthful; violations queryable | four real components (ADVISORY/ENFORCEMENT/VALIDATION×2); **the solver is a mock** | CO-01…12 | INVARIANT first, then WIRING; SOLVER only on evidence | an executed run in which the adapter **reports its own nature** | `check-constraint-honesty` ⛔ · `check-solver-is-real` ⛔ · `check-no-hidden-mock` ⛔ |
| 9 | **Spatial reasoning** | the eight topology questions as lookups where retention permits | 2 of 8 genuine indexed lookups; room index fed two incompatible AABBs | GE-11, GR-04, GR-16 | RETENTION + EXPOSURE + INVARIANT | each of the eight answered through the composed runtime; point-in-room proven on a **concave** fixture | `check-topology-survives` ⛔ (AABB pinned by regression test, not a gate) |
| 10 | **Provenance** | five-value vocabulary, never invented, repair legible | one family of ten, **outside `packages/schemas`**, **invented on load** | PV-01…08 | MISSING PERSISTENCE + INVARIANT | load a snapshot with a missing origin → reads `'unknown'`, not `'auto-topology'` | `check-provenance-not-invented` ⛔ · `check-provenance-coverage` ⛔ · `check-derived-not-authored` ⛔ · **export mapping ⛔ UNMAPPED** |
| 11 | **Regenerability** | rebuild ≡ restored snapshot; persist-or-lose named and shrinking | rebuild is a **slice** (5 of 25), in two copies; ledger is prose | GR-06, 07, 08, PV-05 | MISSING PERSISTENCE + INVARIANT | serialize → restore → rebuild → diff ∅; a pre-graph snapshot reports every loss **by name** | `check-derived-regenerable` ✅ · `check-graph-persistence` ⛔ |
| 12 | **Algorithmic generation** | deterministic engines through commands, with provenance and typed refusals | **complete and grep-confirmed AI-clean**; production ships with no AI key | PR-05 (suppression), PV-02 (no provenance fields) | WIRING | a generation run then the full chain: one undo reverts it entirely, reload preserves it, a later manual wall move propagates in | `check-topology-survives` over a generated fixture ⛔ (engine suites ✅ are executable evidence today) |
| 13 | **Query / reasoning** | certified read paths; failure ≠ empty everywhere | zero graph verbs; three named `[]`-conflation sites, two of them calling methods that never existed | GR-14, 16 | EXPOSURE + INVARIANT | every query proven to distinguish **empty from failed** by probing both | verbs' CA-21 conformance rows ⛔ (verbs absent) |
| 14 | **Collaboration** | concurrent edits converge with topology intact; conflicts explicit | **UNPROVABLE — no transport.** C66: 0 tiers HELD | CB-01…05 | MISSING COLLABORATION | two clients edit a wall and its hosted door → converge, hosting edge intact, lost-update emits a resolvable conflict | `check-collab-graph-integrity` ✅ exists, **blocked on CB-01**, and in the wrong suite (CB-03) · **conflict-surfacing ⛔ UNMAPPED** |
| 15 | **AI boundary** | the LLM sits above the model, never underneath | **YES** — read-only default, read-only capability class CLOSED, zero-token deterministic tiers, no AI key in production | GR-16 (verbs), PV-02 (INFERRED stamping) | EXPOSURE + INVARIANT | a chat query answers a topology question **through the same verb a script would use, including the refusal case** | RAC ladder probes ✅ + CA-21 rows per AI-reachable verb |
| 16 | **Certification** | every claim in 1–15 is an EXECUTED claim | harness real, falsifiability proven per row, four-exit-code contract live, **empty-seed impossibility landed** (`e5addac8`) | CE-01…06 | INVARIANT | the certification **of** the certification: each new gate shows a tampered state going red and an unreadable subject reading MISCONFIGURED **before its first green is believed** | this domain **is** the gate suite — 6 of 10 named gates ⛔ absent |

### §10.1 — UNMAPPED entries. **An unmapped anything blocks readiness.**

Stated explicitly, per the directive. These are not "low priority" — they are **holes in the
instrument**, and a domain with an unmapped gate cannot be scored at all.

| Kind | What is unmapped | Where it is recorded |
|---|---|---|
| **GATE** | **Move-time invalidation** (semantic 5 of C71 §1.2) — no arm in any of the three specified graph gates, and UNPROVEN for **every** relationship family | C71 §1.4, §6.2(c) · GR-12 |
| **GATE** | **The bespoke propagation trackers** — the propagation that actually works, and the thing Level 4 rests on, is **ungated**. `check-propagation-reaches`'s subject is the four dead events only | C72 §6.1.2(d) · PR-09 |
| **GATE** | **Conflict-surfacing** (K-INV-2) — no gate exists, specified or built | capability model §14 · CB-04 |
| **GATE** | **Refusal reachability at the UI** — no gate asserts a refusal is surfaced rather than caught and logged | C73 §5.4(d) · GE-09 |
| **GATE** | **The `./compliance` registry's rules** — only its wiring is checked, never its rule set | C74 §6.3(d) · CO-12 |
| **GATE + IMPLEMENTATION** | **Clash detection** — 12 declared ids, 12 different toolbar ids, 3 in common, no handler, no detector, no gate | GE-06 |
| **IMPLEMENTATION + GATE** | **Provenance export mapping** — the contract's own "largest open risk" | C75 §5, §7.7 · PV-04 |
| **TEST** | **Runtime reachability of graph writers** — no probe has ever run against a live graph; there is no CA-21 equivalent for the graph | C71 §5.8 · GR-18 · CE-05 |
| **TEST** | **Browser I/O persistence** — IndexedDB / Supabase / autosave never exercised | CE-03 |
| **TEST** | **Cross-machine determinism and GPU-side geometry** | C73 §5.4(b)(c) · GE-08 |
| **TEST** | **The unified `performUndoRedo` path** — legacy stack only | CE-04 |
| **TARGET** | **Whether `metadata.version` should be persisted at all**, and whether `_renderVersion` belongs on the model — ADR-0319 "Not decided here" | ADR-0319 |
| **TARGET** | **Does the layer model extend to the backend?** — eight backend packages have no layer at all | `CLAUDE.md` §architecture |

> **§10.2 — the readiness verdict this matrix produces.** **BIM 3.0 is NOT READY to be scored**,
> and the blocker is not the gap count — it is that **thirteen entries above are unmapped**, six of
> them gates. A capability whose gate does not exist cannot be UNPROVEN-then-proven; it cannot be
> *addressed at all*, because nothing can tell you when you are done. Per C70 §3.4 a chain
> containing an UNPROVEN link scores as **incomplete, never as passing** — and per §5.2 a gate that
> cannot establish its subject exits **2 MISCONFIGURED**, which is never absorbable as debt.
>
> The corresponding good news is bounded and real: **every unmapped entry above is an instrument
> to build, not an architecture to replace.**

---

## §11 — What this register does NOT establish

Stated so the boundaries are not inferred from silence.

1. **No measurement was performed for this document.** Every count and line citation is carried
   from the contracts, the ADRs, EV-03/04/05, the audit §17 addendum, or the BIM 2.0 close-out.
   Four claims were **independently re-verified at HEAD** for this register and are marked as such
   in-row: the clash id sets and their 3-way intersection, the absence of any clash handler or
   detector, the opening-awareness of `plugins/wall/src/handlers/CutWall.ts`, and the contents of
   `tools/rac-conformance/certification/gates/`. Everything else is cited, not re-run.
2. **Green-ness is not asserted for any existing gate.** C70 §0.2 is binding here: read the gate,
   not this line.
3. **No runtime probe was executed against a live graph, a live cascade, or a composed browser
   session** — the same limitation EV-03 §10 and EV-05 §4 declare, inherited unchanged.
4. **Severity is not ranked.** Rows are grouped by owning contract, not by importance; a
   priority ordering is a founder decision and would be an inference here.
5. **The counts in §9 are a count of *this document's rows*, not of the repository.** They describe
   how the known defects distribute across implementation types. A defect nobody has found yet is
   in none of them.
