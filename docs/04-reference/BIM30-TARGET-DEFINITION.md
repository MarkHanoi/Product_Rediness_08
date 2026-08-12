# BIM 3.0 Target Definition — the single source of truth for what BIM 3.0 IS

> **Stamp**: 2026-08-12 · **Phase 0** of the founder's BIM 3.0 master directive · **Branch**: `main`
> **Status**: TARGET DEFINITION. This document states what BIM 3.0 **is** — it does not grade where
> PRYZM stands. Current-state facts appearing here are cited from the measured corpus
> ([`BIM30-CONTINUITY-DELIVERABLE.md`](BIM30-CONTINUITY-DELIVERABLE.md) rev 2,
> [`BIM30-EVOLUTION-AUDIT.md`](BIM30-EVOLUTION-AUDIT.md) incl. §17,
> [`bim30-evidence/EV-03`](bim30-evidence/EV-03-change-impact.md) /
> [`EV-04`](bim30-evidence/EV-04-semanticgraph-write-coverage.md) /
> [`EV-05`](bim30-evidence/EV-05-relationship-coverage-ledger.md),
> [`BIM20-CERTIFICATION-RESULTS.md`](BIM20-CERTIFICATION-RESULTS.md)) and carry the caveat
> **as of the last measurement (2026-08-11)** — a parallel re-baseline document owns the current
> reading. Where a current-state fact is unknown, the cell says **UNPROVEN-AT-WRITING**.
>
> **Companion**: [`BIM30-CAPABILITY-MODEL.md`](BIM30-CAPABILITY-MODEL.md) — the 16 capability
> domains, each wired to the machinery that will meet it.
>
> **Reading rule**: every definition below is stated in terms of **MODEL CAPABILITY, never UI
> features**. A panel, a toolbar, a rendered acknowledgement — none of these is evidence of
> anything in this document. The founder's framing is binding: **"No UI acknowledgement counts as
> success."**

---

## 1. What BIM 3.0 is

BIM 3.0 is a **computational building model**: a persistent, authoritative, identity-preserving
model whose topology is explicit, whose geometry is a deterministic consequence of model state,
whose relationships are computable by algorithms, whose changes propagate deterministically, whose
every datum knows how it came to be known, and which **refuses honestly** where it cannot answer.

It is not a renderer, not a chat interface, not a file format, and not an AI product. AI may sit
at the boundary as an *interface* — the founder's rule: **"The LLM may sit above the computational
model, not underneath it."** Nothing an LLM emits is ever model truth; it becomes truth only by
passing through the same command path as every other mutation, subject to the same constraints,
provenance, and refusals.

## 2. Target architecture

One directed flow. Every arrow is a boundary that may refuse; no arrow may be bypassed.

```
        ┌──────────────────────────────────────────────────────────────┐
        │                            USER                              │
        └───────────────┬──────────────────────────────┬───────────────┘
                        │ direct manipulation           │ natural language
                        │                               ▼
                        │              ┌───────────────────────────────┐
                        │              │   AI INTERFACE  (OPTIONAL)    │
                        │              │ intent → proposal; read-only  │
                        │              │ by default; never an authority│
                        │              └───────────────┬───────────────┘
                        ▼                              ▼
        ┌──────────────────────────────────────────────────────────────┐
        │                     COMMANDS  (the only mutation path)       │
        │        canExecute → execute → undo/redo · typed refusals     │
        └───────────────────────────────┬──────────────────────────────┘
                                        ▼
        ┌──────────────────────────────────────────────────────────────┐
        │                     AUTHORITATIVE MODEL                      │
        │   one store per element kind · persistent identity (id+GUID) │
        │   provenance on every element · persisted, versioned         │
        └───────────────┬──────────────────────────────┬───────────────┘
                        ▼                              ▼
        ┌───────────────────────────┐  ┌───────────────────────────────┐
        │     COMPUTATIONAL GRAPH   │  │    DETERMINISTIC GEOMETRY     │
        │ explicit topology, typed  │◄─┤ pure function of model state; │
        │ edges, retained junctions,│  │ regenerable, never authored   │
        │ reverse-dependency index  │  │ by hand                       │
        └───────────────┬───────────┘  └───────────────┬───────────────┘
                        ▼                              ▼
        ┌──────────────────────────────────────────────────────────────┐
        │              ALGORITHMS  +  CONSTRAINTS                      │
        │  detection, pathfinding, generation, validation, propagation,│
        │  solving (only where proven necessary) — all deterministic   │
        └───────────────────────────────┬──────────────────────────────┘
                                        ▼
        ┌──────────────────────────────────────────────────────────────┐
        │                    COMPUTATIONAL BIM                         │
        │   queryable · explainable · collaborative · certifiable      │
        └──────────────────────────────────────────────────────────────┘
```

The optional AI interface is deliberately drawn **beside** the user, not beneath the model. Remove
the AI box entirely and the system loses no capability except conversation — as of the last
measurement this is already grep-proven for the deterministic core (audit §9, §17.3: production
deploys carry no AI key; every generation engine is AI-clean).

## 3. The twelve capability pillars (A–L)

Each pillar: a plain-language definition of the **model capability**, then the testable
invariant(s) that make it falsifiable. A pillar with no falsifiable invariant is marketing, not a
pillar.

### A — Authoritative model

**Definition.** For every element kind there is exactly one authoritative record, and everything
else — meshes, projections, graph nodes, exports, panel contents — is a derived representation
that can be discarded and rebuilt from it. Two copies of the same truth is zero copies.

**Invariants.**
- A-INV-1: for each element kind, exactly one store is authoritative, and the composition root
  can name it (`composeRuntime` / ADR-0318 registry — identity, not construction).
- A-INV-2: deleting every derived representation and regenerating from authoritative state yields
  an equivalent model (see pillar I for the comparator).
- A-INV-3: no verb may succeed against a detached copy of the truth — a mutation that changes a
  DTO nobody reads is a *lie*, not a capability (the CA-21 liveness-lie class, audit §1).

**Known target-relevant facts, as of the last measurement:** openings had two authoritative
copies (`OpeningStore` + `WallData.openings[]`) and three rival level records existed
(audit §17.3); `wall.openings[]` is the one authority for openings and
`WallOccupancyStore` is a pure query over it (audit §17.6). The target is A-INV-1 with those
rivalries resolved by *declaration and deletion*, not by synchronisation code.

### B — Persistent identity

**Definition.** An element's identity — its `id` and its `ifcData.guid` — is minted once, at
authoring, and survives every subsequent event of its life: save, reload, undo, redo, move,
regenerate, export, import, collaboration merge. Identity is AUTHORED state (ADR-0319 class 1);
nothing downstream may re-mint it.

**Invariants.**
- B-INV-1: save → reload: every element restores under its original `id` and `guid`
  (byte-identical, no tolerance, ever — ADR-0319).
- B-INV-2: undo → redo: no identity or monotonic counter walks forward across a cycle
  (ADR-0319 class 2: DERIVED-BUT-CAUSAL fields may differ across a restore, never across an undo).
- B-INV-3: the GUID is the IFC round-trip **join key**: a model saved and reopened still matches
  its own prior IFC/Revit exports.

**As of the last measurement** this pillar HOLDS for ids and GUIDs across every kind the
certification harness covers (Continuity rev 2, `f941b39a`, `50725deb`); the audit-field half is
governed by ADR-0319 and was in flight.

### C — Explicit topology

**Definition.** Relationships between elements — hosting, bounding, adjacency, connectivity,
support, containment, dependency — are **retained, typed records**, written at the moment the
relationship comes into being, updated when it changes, removed when it ends. Topology that is
re-detected on every query is a cache pretending to be knowledge; topology that is written and
never read is vocabulary pretending to be capability.

**The relationship vocabulary, scoped honestly.** The founder lists ~13 candidate relationships
but rules: **"only relationships with demonstrated computational value should be required."**
EV-05 measured the ground truth of that rule: of 25 declared SemanticGraph types, **12 have zero
writers and zero readers** — vocabulary without computation — and an edge is only real *"when a
writer and a reader agree it exists"* (EV-05 §1). The target therefore splits the vocabulary in
two, and the split is part of the definition, not an implementation detail:

**REQUIRED — proven consumers exist or are named in the roadmap; each must reach
writer + reader + rebuild + mutation-update:**

| Relationship | Computational value already demonstrated (as of the last measurement) |
|---|---|
| `hosts` / `hostedBy` | the reference-shape HEALTHY pair (EV-05); opening lifecycle, cascade delete, IFC export |
| `boundedBy` | room ↔ wall queries, room detection, `SemanticQueryEngine` (EV-05 row 3) |
| `adjacentTo` | room adjacency queries, AI world model, program validators (EV-05 row 4) |
| `connectedTo` | room connectivity + pathfinding; gains a deterministic writer from retained junctions (CONNECT-3) |
| `sitsOn` | the most-written edge in the graph (~10 kinds); needs the *reader* — level/containment queries (EV-05 §3) |
| `supports` | structural reasoning; written for beams, declared-never-written for slab→wall (EV-05 row 7) |
| `contains` | two production surfaces already ask (AI world model, hierarchy tree); needs the *writer* (EV-05 §1) |
| `dependsOn` | change-impact queries; the UBG adapter exists pull-only (audit §2, §13 CONNECT-4) |
| wall↔wall connectivity (junctions) | L/T/X junction records already computed every rebuild and discarded (audit §3, §17.6); retention converts Q4 re-detection to lookup and removes the §DIAG-ROOM-LOOP defect class |

**PARKED — declared-not-required until a consumer exists:** the 12 zero-writer/zero-reader types
(`unitOf`, `levelOf`, `servesZone`, `precededBy`, `supersedes`, `branchedFrom`, `causedFailureOf`,
`wasMitigatedBy`, `exceededBenchmark`, `replacedBy`, `maintainedBy`, `decommissionedBefore` —
EV-04 §1), plus any future addition arriving without a named reader. Parked types stay in the
schema (removing them breaks snapshot v3 for a naming preference — Continuity §E) but **no gate
requires them, no roadmap item populates them, and adding a writer without a reader is a defect,
not progress**. The day a consumer exists, the type moves to REQUIRED and enters the coverage
ratchet.

**Invariants.**
- C-INV-1: every REQUIRED relationship has ≥1 production writer AND ≥1 typed production reader
  (the EV-05 two-column test), plus rebuild coverage and delete/move mutation-update.
- C-INV-2: junction records are retained with identity (participant wall ids, L/T/Y/X type,
  resolved geometry) — wall connectivity is a lookup, never a per-query re-run of the resolver.
- C-INV-3: move / resize / regenerate / save-load / undo never mint a new semantic identity for a
  surviving topological entity (rooms included — centroid-proximity survival, EV-03, is below
  target).
- C-INV-4: the count of declared-but-unwritten relationship types **never grows** (ratchet from
  12 downward — Continuity §I, `check-graph-write-coverage`).

### D — Computational graph

**Definition.** The model is queryable *as a graph*, at runtime, through the composed runtime —
not through a dev-hook, not by traversing a scene, not by each subsystem privately re-deriving
edges. One canonical query vocabulary (the UBG's), mapped from the stores that hold the edges;
queries distinguish "no results" from "cannot answer" (pillar L).

**Invariants.**
- D-INV-1: `graph.query` / `graph.neighbors` / `graph.path` exist as read-only, refusal-honest
  bus verbs over the composed runtime (audit §13 CONNECT-1).
- D-INV-2: rebuilding the graph twice from the same authoritative state yields identical
  snapshots (determinism probe, audit §15).
- D-INV-3: graph answers are reachable by every consumer above the bus — including the AI
  interface — through the same verbs, with the same refusals.

### E — Deterministic geometry

**Definition.** Geometry is a pure function of authoritative model state. Same model in, same
meshes out — every session, every machine, no wall-clock, no randomness, no accumulating drift.
This is already the design's strongest property as of the last measurement (Continuity: "the
strongest finding in the whole assessment") and the target is to keep it and *certify* it.

**Invariants.**
- E-INV-1: regenerating geometry from a restored snapshot equals regenerating it from the
  pre-save model (no F-3-class drift: the certification measured +15 mm/reload cumulative on
  plumbing/furniture, as of the last measurement — the mechanism, not the millimetres, is the
  defect).
- E-INV-2: each geometric predicate family has ONE canonical implementation under ONE declared
  epsilon policy, pinned by a counting gate (the R3 recipe; 42 point-in-polygon copies under no
  policy is the measured anti-target, audit §17.6).
- E-INV-3: geometric impossibility is a refusal, not a silently-wrong mesh (the ADR-0299
  simplicity-assertion pattern; the concave-room centroid-fan that is "silently wrong" is the
  anti-target).

### F — Propagation

**Definition.** When authoritative state changes, everything that depends on it is updated or
explicitly invalidated — deterministically, with the before-state (`prevState`) available to
every consumer that must diff. A change either reaches its dependents or the model says it
could not; there is no third state where dependents silently go stale.

**Invariants.**
- F-INV-1: every declared cascade event has ≥1 live listener AND its emitter carries `prevState`
  (Continuity §I, `check-propagation-reaches` — written to catch exactly the measured failure:
  the generic dispatcher emitting four event names with zero listeners, audit §17.2, and
  `updateDoor` emitting without `prevState`, EV-03 §3).
- F-INV-2: deletes propagate — a delete never returns an empty cascade *by design*
  (`DependencyResolver` `operation === 'delete'` → `[]`, audit §17.2, is the anti-target).
- F-INV-3: host mutation re-validates hosted state: shrink a wall and its openings are re-clamped
  or the operation is refused with both measurements (the `planOpeningRefit` shape — Continuity
  §D-1: relocate where it fits, refuse naming both numbers where it does not, never delete an
  opening to make room).

### G — Constraints

**Definition.** The model can hold declared rules about itself and act on them — at the strength
each rule actually needs. The founder's rule is binding: **do not build a solver because
BIM 3.0 sounds like it needs one** — for each constraint family, prove which of three strengths
it requires:

1. **Validation** — check and report (a `violates` edge, a typed refusal at commit);
2. **Enforcement** — a commit-time gate that refuses violating mutations
   (`WallOccupancyStore.canPlace` is the in-repo template);
3. **Geometric solving** — a solver maintains the relation under edits.

Most BIM constraints live at strengths 1–2. Strength 3 is earned per-family by demonstrated need,
never assumed.

**The measured fact this pillar must not forget:** planegcs is a mock — `PlanegcsAdapter`
delegates 100% to `MockSolver`, the WASM worker entry was never written, and the 31/33 passing
tests test the mock (audit §17.1, as of the last measurement). The honest sequence is therefore:
**adapter truthfulness first** (`check-constraint-honesty`: no adapter may report a solve it did
not perform; a mock must announce itself), **WASM binding only if model-space constraints prove
necessary** — and that binding is construction, not wiring, and is labelled as such
(Continuity §H).

**Invariants.**
- G-INV-1: no adapter reports a solve it did not perform.
- G-INV-2: every constraint family carries a declared strength (validation / enforcement /
  solving) and executable evidence at that strength; "solver-driven" without a solver is a
  contract violation.
- G-INV-3: constraint violations are queryable model state (`violates` edges), not log lines.
- G-INV-4: a refused mutation names the rule and **both numbers** (the founder's hard-stopper
  doctrine: refuse with the limit and the attempted value).

### H — Provenance

**Definition.** Every element, and eventually every load-bearing field, knows how it came to be
known. The founder's five-way distinction is the vocabulary:

- **AUTHORED** — a human (or an accepted proposal) stated it; survives byte-for-byte.
- **OBSERVED** — measured from an external source (import, scan, survey); carries its source.
- **COMPUTED** — derived deterministically from authoritative state; regenerable, never trusted
  over its inputs.
- **INFERRED** — produced by a heuristic or model with a confidence; ceiling-bounded, never
  silently promoted to AUTHORED.
- **REGENERATED** — rebuilt from authoritative state after a loss; equivalent to COMPUTED but
  records that a rebuild happened.

**The one absolute rule: provenance is never invented.** A missing origin is `'unknown'`,
first-class and legible — never defaulted to a value that claims knowledge
(`roomSnapshotUtils.ts:156` defaulting missing `detectionMethod` to `'auto-topology'` is the
measured anti-target, audit §17.3; the `LandBasis` branded type is the in-repo idiom to copy:
make the wrong basis *unrepresentable*).

**Invariants.**
- H-INV-1: no code path stamps an origin it did not observe (`check-provenance-not-invented`).
- H-INV-2: repair is legible — an invented boundary is recorded as `repaired`, never as authored
  or detected (the P1-5 fix *is* writing the field — Continuity §G).
- H-INV-3: confidence exists only on OBSERVED/INFERRED data and is ceiling-only (it can be
  lowered by evidence, never raised without it).

### I — Regenerability

**Definition.** Everything derived is rebuildable from authoritative state, and the rebuild is
**certified equivalent** to the persisted copy. Anything that cannot be rebuilt is either
promoted to authoritative (and persisted, versioned, provenance-carrying) or it is on a **named,
shrinking persist-or-lose ledger** — never a surprise loss.

**Invariants.**
- I-INV-1: rebuild-from-authoritative ≡ restored snapshot (`check-derived-regenerable`,
  Continuity §I).
- I-INV-2: the persist-or-lose list is enumerated and shrink-only (as of the last measurement it
  held six members, incl. SemanticGraph edges outside the 5-type rebuild, temporalGraph,
  decisionRecords, invented room polygons, stale area caches, the unpersisted ProvenanceStore —
  audit §17.3).
- I-INV-3: a pre-graph snapshot loses **nothing silently**: either the rebuild reconstructs the
  edge or the load reports the named loss (EV-04 §3's "permanently loses all `sitsOn` and
  `supports`" is the anti-target).

### J — Algorithmic reasoning

**Definition.** The model supports deterministic algorithms as first-class citizens: detection,
pathfinding, layout generation, quantity takeoff, solar, code-compliance, clash — running over
the graph and geometry, producing results with provenance (COMPUTED), refusing where inputs are
insufficient. **Zero-LLM BIM 3.0 is achievable and is the target posture**: as of the last
measurement ~25 capabilities are fully deterministic and production ships with no AI key
(Continuity §F).

**Invariants.**
- J-INV-1: every algorithm is a pure consumer of authoritative state + graph reads, writing back
  only through commands.
- J-INV-2: algorithm outputs carry COMPUTED/INFERRED provenance and, where inferred, confidence.
- J-INV-3: an algorithm with insufficient input refuses with the named gap — it never pads the
  answer (C63's refusal unions are the shipped template).

### K — Collaboration

**Definition.** Multiple users edit one model and the model stays *one model*: identities stable,
topology intact, constraints honoured. CRDT merges that would lose data surface as
**user-resolvable conflicts** — the founder's rule: **"No silent substitution."** A merge that
quietly picks a winner is data loss with better manners.

**Invariants.**
- K-INV-1: concurrent edits to a wall and its hosted door converge with the hosting edge intact
  (`check-collab-graph-integrity`, Continuity §I).
- K-INV-2: any merge that discards a user's authored state produces an explicit, resolvable
  conflict artefact — never a silent substitution.
- K-INV-3: collaboration claims are EXECUTED claims: no capacity tier is described as supported
  while C66 marks it CLAIMED. **As of the last measurement collaboration is UNPROVEN on every
  certification row by construction — no transport exists (L-391 leg C), and deploying it is a
  founder decision, not an engineering task** (Continuity §A-3: "no amount of further engineering
  raises the ceiling; one founder decision does").

### L — Honest failure

**Definition.** Failure and emptiness are never the same value. Every query, command, gate, and
probe distinguishes: *succeeded with results* · *succeeded with zero results* · *refused, with a
named reason* · *could not run (MISCONFIGURED)*. This is the pillar the whole corpus was built
on — fifteen gates were found green-and-blind in one session, every one by conflating emptiness
with success (Continuity §I).

**Invariants.**
- L-INV-1: no production API returns `[]`/`null`/`0` to mean "I could not answer"
  (`RoomGraphService`'s three indistinguishable cases and `SpeculativeEngine`'s
  guard-on-a-method-that-does-not-exist → `[]` are the measured anti-targets — audit §13, EV-04 §5).
- L-INV-2: every gate and certification obeys the four-exit-code contract — `0` clean · `1`
  failed at declared level · `2` MISCONFIGURED, never absorbable · `3` RATCHET EXCEEDED, never
  absorbable — and declares a `minFiles`-style floor so a broken scan can never print a pass.
- L-INV-3: refusals speak: they carry the rule, both numbers, and reach the user verbatim.
- L-INV-4: **"No UI acknowledgement counts as success"** — the only evidence of a mutation is an
  independent read-back of authoritative state (the CA-21 discipline).

## 4. The Golden Chain

Every BIM 3.0 capability must hold along the **entire** chain:

```
intent → command → state → geometry → topology → graph → propagation
      → persistence → undo/redo → collaboration → report
```

| Link | What must be true at this link |
|---|---|
| intent | user action or accepted AI proposal resolves to a typed command; ambiguity refuses, never guesses |
| command | the ONLY mutation path; `canExecute` refuses with reasons; the dispatch outcome is structured |
| state | authoritative store moved on exactly the intended properties, proven by independent read-back |
| geometry | derived meshes follow deterministically |
| topology | affected relationships are written/updated/removed — retained, not re-detected |
| graph | the change is visible to graph queries |
| propagation | dependents update or are explicitly invalidated, `prevState` in hand |
| persistence | survives save→reload with identity and authored state byte-intact (ADR-0319 classes) |
| undo/redo | returns exactly to the prior state; no counter walks forward |
| collaboration | converges under concurrent editing with relationships intact; conflicts explicit |
| report | the outcome — success, refusal, or conflict — is stated truthfully; failure ≠ empty |

**A capability missing a link is NOT BIM 3.0 complete.** No partial credit across links: a
wall-move that updates geometry but strands the schedule (EV-03 §1.3) is an incomplete chain, and
the certification format already scores exactly this way — one axis per link, no axis inferred
from a neighbour, partial evidence never promoted (BIM20-CERTIFICATION-RESULTS header).

## 5. The maturity ladder — Levels 4–8

Exactly as the founder defined them (the scale below Level 4 is history — as of the last
measurement PRYZM stands at Level 4; audit §11, held through the §17 downgrades):

| Level | Definition | Award condition |
|---|---|---|
| **4** | Derived topology auto-maintained — detection, invalidation, cascade keep derived state current | executable propagation evidence at unit level |
| **5** | Unified queryable graph as a runtime service — certified, failure-honest, exposed as verbs | graph verbs answer the topology questions through the composed runtime, with typed refusals, in an executed probe |
| **6** | Constraint- and dependency-driven modelling — stored model-space constraints, honest solving where proven necessary, reverse-dependency queries | a stored constraint survives persistence and is checked/enforced/solved at its declared strength in an executed run; `check-constraint-honesty` green |
| **7** | Collaborative, versioned graph — merge semantics preserve topology; per-element history; explicit conflicts | `check-collab-graph-integrity` green against a real transport |
| **8** | Full BIM 3.0 — explanation-capable, provenance-complete, interchange-round-tripping | the eight golden operations (audit §15) each pass their full Golden Chain, provenance answers "who/how" for every element, IFC round-trips on the GUID join key |

**"No level is awarded without executable evidence."** A level claimed from source-reading is
BY-READ, and BY-READ is never an award — the certification's own vocabulary applies to the ladder
itself. As of the last measurement: Level 4 held on executed evidence; Level 5 was one
composition slot away; Level 6 was one constraint store **plus a real solver** away (audit §17.4).

## 6. Definition of Done — BIM 3.0 is DONE when every condition below passes as an executed run

1. **The canonical test passes** (audit §15): a fixture building — two levels, stair, six rooms,
   doors, windows, roof — driven entirely through bus verbs in a composed headless runtime;
   UBG rebuilt twice → identical snapshots; serialize→restore→rebuild → diff ∅; one wall moved →
   graph queries prove exactly the predicted junction/room/area/dependency edges changed and
   nothing else, with `prevState` as the oracle.
2. **The eight golden operations** (query · impact · validation · geometry · provenance ·
   propagation · collaboration · explanation) each hold their **entire Golden Chain**, scored by
   the certification harness — statuses derived from axes, never hand-assigned.
3. **VERIFIED is reachable and reached**: the collaboration axis has a transport, and at least
   the golden-operation rows reach VERIFIED (as of the last measurement the arithmetic ceiling
   was PARTIALLY VERIFIED on every row, by construction — Continuity §A).
4. **The readiness gates are green at their declared levels** under the four-exit-code contract,
   each with a floor: `check-identity-roundtrip` (hard-0) · `check-topology-survives` ·
   `check-graph-write-coverage` (ratchet from 12, at 0) · `check-derived-regenerable` ·
   `check-propagation-reaches` · `check-constraint-honesty` · `check-epsilon-policy` ·
   `check-provenance-not-invented` · `check-derived-classification` (ADR-0319) ·
   `check-collab-graph-integrity`.
5. **Every REQUIRED relationship** (pillar C) has writer + typed reader + rebuild +
   mutation-update on delete AND move; the parked list has produced no writer-without-reader.
6. **The persist-or-lose ledger is empty**, or every remaining member is a founder-signed
   exception with a named reason.
7. **Provenance is complete at element grain**: every element carries an origin in the
   AUTHORED/OBSERVED/COMPUTED/INFERRED/REGENERATED vocabulary; `'unknown'` appears only on
   pre-migration data and is never silently rewritten.
8. **Falsifiability is proven in-run**: every comparator in the evidence set is watched go red
   against a tampered state (the BIM20 harness discipline: "an empty seed made the certification
   look better than it ever has — that is now impossible" is the standing bar).

Nothing on this list is a UI feature. Nothing on this list can be satisfied by a document —
including this one.
