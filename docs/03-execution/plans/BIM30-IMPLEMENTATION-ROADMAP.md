# BIM 3.0 — the implementation roadmap

> **Stamp**: 2026-08-12 · **Phase 0** of the founder's BIM 3.0 master directive · **Branch**: `main` · **HEAD**: `2824a8e4`
> **Input, and the only one**: [`BIM30-GAP-REGISTER.md`](../../04-reference/BIM30-GAP-REGISTER.md) — 84 rows, each already carrying maturity, implementation type, evidence, owning contract, smallest change and blocked-by. **This document is that register's topological sort. It mints no new gap.** A row appearing here that is not in the register is a defect in this document.
> **Companions, owned elsewhere — referenced, never restated**: `BIM30-READINESS-GATES.md` and `BIM30-CERTIFICATION-PLAN.md` (parallel authorship) own the per-gate specifications and the certification run plan. Where this roadmap says "build the gate", *they* say what the gate asserts. [`BIM30-ARCHITECTURE-IMPACT.md`](../../04-reference/BIM30-ARCHITECTURE-IMPACT.md) owns the architecture verdict; every phase below carries **architecture impact: none**, and that is a consequence of the register's measured **ARCHITECTURAL CHANGE = 0 of 86 type-instances**, not an assumption of this plan.
> **Authority**: [C70](../../02-decisions/contracts/C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md) · [C71](../../02-decisions/contracts/C71-GRAPH-AND-TOPOLOGY.md) · [C72](../../02-decisions/contracts/C72-PROPAGATION-AND-PREVSTATE.md) · [C73](../../02-decisions/contracts/C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) · [C74](../../02-decisions/contracts/C74-CONSTRAINT-HONESTY.md) · [C75](../../02-decisions/contracts/C75-PROVENANCE.md). Where this plan and a contract disagree, **the contract wins**.
> **Doctrine**: no ordering below is chosen for convenience. Every edge in the sequence points at a dependency that can be named. Where no dependency exists and no evidence orders two items, they are stated as **parallel**, not ranked. Where evidence is absent the entry reads **UNPROVEN** — neither a pass nor a fail (C70 §0.2).

---

## §0 — The five ordering rules, each with the reason it exists

These rules produced the phase order. They are stated before the phases so the order can be
audited against them rather than accepted.

### §0.1 — A gate lands BEFORE its implementation, and it lands RED

**Rule.** For every capability whose gate is specified-and-unbuilt, the gate ships first, is
negative-tested against a planted violation, and is expected to exit **1 DECLARED-LEVEL** at a
baseline pinned at its own measured reading — or **3** if the reading is worse than the ledger.
A red gate on day one is the deliverable, not a failure of the phase.

**Reason, and it is precedent, not preference.** BIM 2.0 closed at 9/10 with a score that never
moved by redefinition, because the ten criteria were written down before the work
([BIM20-ACCEPTANCE §0.1](BIM20-ACCEPTANCE-10-OF-10.md)). The inverse is also recorded, five times
in one session: ~15 gates green-and-blind, a compile gate that fabricated ~90 PASS lines per run
for its entire life, an empty seed that outscored every real run (C70 §0). **A capability
implemented before its gate exists cannot be scored** — and in this repository, unscored
capability has consistently read as working capability. C70 §4.1 makes the consequence binding:
no level is awarded without an executed run.

### §0.2 — The six UNMAPPED gates are Phase-0 residue, not later work

**Rule.** The six GATE-class rows of the register's §10.1 coverage matrix — move-time
invalidation (GR-12), the bespoke propagation trackers (PR-09), conflict-surfacing (CB-04),
refusal reachability at the UI (GE-09), the `./compliance` rule enumeration (CO-12), and clash
detection (GE-06) — are closed in Phase 0R, before any capability phase opens.

**Reason.** §10.2 states it directly: the blocker is not the gap count, it is that **thirteen
entries are unmapped, six of them gates**, and *a domain with an unmapped gate cannot be scored at
all*. The propagation row is the sharp one. [DO-NOT-REBUILD §2](../../04-reference/BIM30-DO-NOT-REBUILD.md)
protects the bespoke propagation trackers because **Level 4 rests on them** — and §14.2 of that
same document concedes they are *the least instrumented subsystem in the product*. The one thing
holding up the only maturity level PRYZM currently has is ungated. **Instrumenting what already
works ranks above building what does not**, because the first protects an award already made and
the second only pursues one not yet made.

**The honest limit on this rule, stated rather than smoothed over.** Two of the six arms attach to
gates that do not exist yet: the move-time arm belongs to the three C71 gates (GR-12 blocked-by
GR-11) and the enumeration arm belongs to `check-constraint-honesty` (CO-12 blocked-by CO-11).
Those two ship in Phase 0R as **written arm specifications with subject, floor and negative test
defined**, and their code lands with the host gate in Phase 1 — in the same PR, so the host gate
is never merged without them. The other four need no host and ship as code in Phase 0R.

### §0.3 — Dependency, not size

**Rule.** Phases are ordered by the edges the register records in its **blocked-by** column and by
edges derivable from the contracts. Effort is never an ordering input.

**Reason, with the three worked examples the directive names.**
- **`joinedTo` needs a writer before `check-graph-write-coverage` can pass.** GR-04 is G0 with no
  member in `RelationshipType`; the gate's own arm (b) makes a **writer-first addition exit 3**
  (C71 §6) — so the writer and the reader land together, and the gate's ratchet cannot reach 0
  over the REQUIRED families until they do. The gate still lands first (§0.1); it lands red.
- **The epsilon policy needs one declared constant before any predicate migration.** GE-03 is
  blocked-by GE-01 in the register. Collapsing three ray casts with three different degenerate
  guards *before* a declared numeric-zero epsilon exists means the collapse picks a behaviour
  silently — exactly the C73 §3.7 violation. The constant is the oracle the collapse is measured
  against.
- **Provenance fields need the export mapping question answered before they can be called
  complete.** PV-04 is the contract's own **largest open risk** (C75 §5): provenance that stops at
  the export boundary is how a generated guess lands in an IFC export as a surveyed fact. C75 §7.7
  permits exactly two terminal states — the mapping exists, or its absence is recorded **by name**
  as an accepted limitation. It may not be left blank, and until it is one of the two, the
  provenance phase is not exitable.

### §0.4 — One family per PR for the R3-style canonicalisations

**Rule.** Each predicate family in C73 §3.1 is one PR: canonical file, structural counting gate,
named exclusions, baseline pinned at the reading, **shipping consumer identified by name first**.
No sweep.

**Reason.** C73 §3.5 is a MUST NOT and gives the mechanism: the polygon-offset fix succeeded
because it was one family with an oracle at a known answer (300 mm eave, spread 0.000) and the
shipping path identified first. A sweep replacing 61 ray casts in one change has **no oracle and
no bisect**, and would land on top of the §0.2 guard divergence rather than resolving it. C73 §3.6
adds the reason the naive version fails: the offset defect was never "three copies", it was that
*the fix and the shipping code were different files* — collapsing onto a copy the shipping path
cannot reach reads as done and is not.

### §0.5 — Adapter truthfulness before solver binding, and never in the same commit

**Rule.** CO-01 (report the `kind` performed + a non-suppressible first-call production signal),
CO-02 (not-configured ≠ configured-and-failed) and CO-03 (the tests name the configuration they do
not cover) land in their **own commits**, before any binding work — and no binding work is
authorised at all until CO-08 has classified a family at C74 §4.2(c) with evidence.

**Reason, quoted because paraphrase destroys it.** C74 §4.3: *"If the truthfulness fix and the real
binding land together, the fix is invisible: the adapter starts telling the truth in the same
commit that makes the truth flattering, and the organisation learns nothing about the fact that a
mock shipped for months behind passing tests. The lesson is the deliverable."* C74 §4.4 closes the
other escape: the honesty fix may not be deferred until the binding is ready, because §3.1–§3.3
are satisfiable today with no new dependency.

### §0.6 — Founder-gated items are BLOCKED-ON-FOUNDER and are not scheduled

**Rule.** CB-01 (deploy the sync transport → Level 7), CB-02 (`PgAuthz`, prerequisite of the
*production* flip only), CB-05 (per-capability convergence proofs), and MT-08 (§UNDO-GESTURE-ID)
appear in **Phase F**, which has no position in the sequence and no predicted date. Nothing
downstream of them may be scheduled as though they will arrive.

**Reason.** C70 §2.2 names collaboration the standing example of UNPROVEN-by-construction, and
BIM 20 §0.1 C8 records 9/10 as *the declared arithmetic maximum without the sync server, stated on
day one so the number could not be quietly redefined*. MT-08 is explicitly **not** taken as decided
by the founder's "agree" of 2026-08-12 (ADR-0321 status note). Scheduling a founder decision as a
task is how a decision becomes an assumption.

---

## §1 — The phases

Each phase carries: objective · prerequisites (by gap id) · exact changes · tests · **CI gates that
must go green** · **measurable exit condition** · risks · architecture impact.

**"Green" is used in the C70 §5 sense throughout: exit 0 CLEAN, or exit 1 DECLARED-LEVEL against a
named, shrink-only ledger. Exit 2 and exit 3 are never absorbable and never "green" (C70 §8.g).**

---

### Phase 0R — Instrument what already works (the six UNMAPPED gates)

| | |
|---|---|
| **Objective** | No domain in the coverage matrix remains unscoreable. Every GATE-class UNMAPPED row of §10.1 becomes either a built gate or a written arm specification bound to a Phase 1 host gate. |
| **Prerequisites** | none. This phase is the entry point. |
| **Gaps closed** | PR-09 · GE-09 · CB-04 · GE-06 (refusal half only) · GR-12 (spec) · CO-12 (spec) |

**Exact changes.**
1. **PR-09 — the bespoke propagation trackers get a gate.** A per-pair seam test in the
   `WallOpeningEmitSeam.test.ts` shape, driving the **real mutation entry point**, never a
   hand-built fixture (C72 §3.4, §8.c). One pair per bespoke tracker enumerated in
   [DO-NOT-REBUILD §2](../../04-reference/BIM30-DO-NOT-REBUILD.md). Subject and floor per
   `BIM30-READINESS-GATES.md`.
2. **GE-09 — refusal reachability.** An arm asserting a refusal is **surfaced to the user**, not
   caught and logged. C73 §4.4 is the invariant; `planOpeningRefit`'s refit-or-refuse shape naming
   both numbers is the reference (DO-NOT-REBUILD §5). *"Invalid geometry" is a shrug, not a
   refusal.*
3. **CB-04 — conflict-surfacing gate, specified and built now, run later.** C70 K-INV-2 is
   unmeasured by anything. The register states it can be specified before the transport exists;
   until CB-01 it reports **UNPROVEN, never green** (C70 §3.4 / §7 `check-collab-graph-integrity`
   row).
4. **GE-06 — the ten unhandled clash ids REFUSE.** 12 declared `ClashDetectionToolbarCommands`
   ids, 12 toolbar ids, **3 in common**, no handler, no detector. Make every id with no handler
   refuse (C70 L-INV-1). **The engine is construction and is not in this phase, or any near one.**
5. **GR-12 — move-time invalidation arm: written specification** (subject = every REQUIRED family
   after a move; C71 §6.2(c) calls it *"the first thing to add"*), landing as code with the C71
   gates in Phase 1, same PR.
6. **CO-12 — `./compliance` rule-enumeration arm: written specification**, landing as code with
   `check-constraint-honesty` in Phase 1, same PR.

**Tests.** Each new gate arm is **negative-tested against a planted violation with its failure text
recorded** before it is trusted (C71/C74 §6.2, C75 §6.2). An arm without that record is UNPROVEN
and may not be cited as coverage.

**CI gates that must go green.** The new bespoke-propagation gate and the refusal-reachability arm
exit 0 or 1-at-a-pinned-baseline — never 2. Existing suite unchanged: `check-identity-roundtrip`,
`check-derived-regenerable`, `check-propagation-reaches` stay at or better than their current
readings.

**Measurable exit condition.** The GATE class of gap-register §10.1 reads **zero UNMAPPED rows**;
each of the six carries either a gate file or a specification with subject, floor and recorded
negative test; every clash id either has a handler or refuses (12 of 12, no silent no-op).

**Risks.** (a) The bespoke seam tests can be written against fixtures instead of the real entry
point — that is C72 §8.c and would produce a green gate over an untested seam. (b) Instrumenting
the propagation spine risks touching it; DO-NOT-REBUILD §2 is a MUST NOT — **the gate observes, it
does not refactor**.

**Architecture impact: none.** All six are instruments over existing subjects.

---

### Phase 1 — The gate wave (expected RED)

| | |
|---|---|
| **Objective** | Every gate C70 §7 names exists at HEAD, establishes its subject, obeys the one exit-code contract, and has been watched go red. The instrument is complete before any capability is claimed. |
| **Prerequisites** | Phase 0R (the two arm specifications from §0.2 land inside this phase's PRs) |
| **Gaps closed** | GR-11 · PR-08 · GE-07 · CO-11 · PV-07 · CE-01 · CB-03 |

**Exact changes.** Sixteen specified-and-unbuilt gates plus one suite consolidation. Per
`BIM30-READINESS-GATES.md` for the arm-level specifications; per contract for the subject:

- **C71 (GR-11)** — `check-graph-write-coverage`, `check-graph-delete-integrity`,
  `check-graph-persistence`, each **naming which graph it measures** (C71 §6.1), each with the
  move-time arm from Phase 0R.
- **C72 (PR-08)** — `check-prevstate-contract` (P0–P3), `check-suppression-is-reversible` (S0–S3).
- **C73 (GE-07)** — `check-epsilon-policy`, `check-predicate-canonical`,
  `check-deterministic-regeneration`. **Counting gates, matched on structure, not names**
  (C73 §3.2). `check-offset-implementations.ts` is the template.
- **C74 (CO-11)** — `check-constraint-honesty`, `check-solver-is-real`, `check-no-hidden-mock`
  (named baseline, both directions), plus CO-12's enumeration arm.
- **C75 (PV-07)** — `check-provenance-not-invented`, `check-provenance-coverage`,
  `check-derived-not-authored`.
- **C70 residue (CE-01)** — `check-topology-survives` and `check-derived-classification`, the two
  C70 §7 rows with no file that are not already covered above.
- **CB-03** — one suite, one `contract.ts`. `check-collab-graph-integrity` moves from
  `tools/ga-gate/` beside the certification gates (C70 §7.2). Recorded as a finding today; two
  suites with two exit-code implementations is how the four-exit-code contract becomes two
  contracts.

**Tests.** Every arm negative-tested with recorded failure text. Every gate carries an **exit-2
floor on its own subject discovery**; a run below floor exits 2, never 0 (C70 §5.2). Every baseline
pinned **at the measured reading, never above it** (C73 §3.4) — a ratchet above its own reading is
free slots, an error already made once here and caught by re-measurement.

**CI gates that must go green.** None of the sixteen may exit **2** or **3** on its first run.
Several will exit **1**, and that is the intended outcome — `check-solver-is-real` fails its
`planegcs`-at-0-hits arm on day one **by design**.

**Measurable exit condition.** All ten C70 §7 gates have a file at HEAD; `certify.ts` runs the full
set; **zero exit-2s**; every exit-1 is against a **named** ledger (never a bare count, C70 §5.5);
every arm has a recorded red observation. `check-collab-graph-integrity` reports UNPROVEN, not
green.

**Risks.** (a) A gate that cannot establish its subject and is "fixed" by lowering the floor —
C70 §5.3 makes that identical to deleting the gate. (b) A gate merged without its negative test,
which is the exact condition that produced the green-and-blind fifteen. (c) Baseline inflation to
avoid a red first run.

**Architecture impact: none.** CD §I: *none of these gates needs new infrastructure*; they extend
the existing harness.

---

### Phase 2 — Model truth (ADR-0318 adoption per kind)

| | |
|---|---|
| **Objective** | Every mutation lands in a store the composition root can name, so that a read-back is possible at all. |
| **Prerequisites** | Phase 1 (`check-identity-roundtrip` store-reach floor + `check-derived-classification` must exist to score this) |
| **Gaps closed** | MT-01 · MT-02 · MT-03 · MT-04 · MT-05 · MT-06 · MT-07 |

**Why this phase is second and not later.** It is the register's own blocking edge: **PV-02 is
blocked-by MT-01** — *provenance fields are worthless while a verb can stamp them on a detached DTO
store*. The same reasoning generalises: a graph writer beside a store nobody reads writes edges
about a phantom. C70 A-INV-3: *a mutation that changes a DTO nobody reads is a lie, not a
capability*. Continuity §G states it as a tier rule — *"do not reverse this order; every graph
claim is unverifiable while identity is re-minted."*

**Exact changes.** Per-kind ADR-0318 adoption, **wall, room, slab first** because they gate
everything graph-shaped (MT-01); each migration PR extends `adr0318.stores.probe.ts` with that
kind's same-instance assertion. `view.create` / `sheet.create` / `schedule.create` /
`hierarchy.createSite` get a handler **or a refusal** — a registered id that silently does nothing
is the worst of the three states (MT-02). The 9 SHADOWED verbs resolve **per verb with a read-back
test, not a preference** (MT-03). The 11 unadopted store kinds get headless-safe factories with
**honest absence (`undefined`) until then — no scaffold, no empty stand-in** (MT-04, ADR-0318 I-3).
The per-kind migration deletes `engineLauncher`'s `window.columnStore ?? columnStoreInstance`
fallbacks (MT-05). MT-06 and MT-07 are **declarations, not code**: one authority per rivalry
(`OpeningStore` vs `WallData.openings[]`; the three rival level records), loser deleted.

**Tests.** mutate → independent read-back → same-instance (`toBe`) per kind, in the
`adr0318.stores.probe.ts` shape. Read-back of authoritative state is **the only evidence of a
mutation** (C70 L-INV-4); a UI acknowledgement is not evidence (§8.j).

**CI gates that must go green.** `check-identity-roundtrip` stays 0 CLEAN across 17/17 kinds
(it is green today — do not regress it). `check-derived-classification` reaches its declared floor.
The C69 generated verb register shows `wall.create` / `slab.create` / `room.create` leaving UNKNOWN.

**Measurable exit condition.** `wall.create`, `slab.create`, `room.create` are **readback-positive
on the composed bus**; zero registered verbs answer with silence; SHADOWED count strictly below 9
with a read-back test per resolved verb; store kinds ABSENT-headless strictly below 11; zero `??`
window-global fallbacks in `engineLauncher`'s serializer handoff; one declared authority for
openings and for levels.

**Risks.** (a) A stand-in store created to make a kind "present" — ADR-0318 I-3 forbids it, and it
would convert an honest absence into a silent lie. (b) MT-07's `baseLine[*].y` absolute-world-Y
rivalry is a data-shape decision that could tempt a snapshot change; it must not become one
(DO-NOT-REBUILD §13 row 22).

**Architecture impact: none.** ADR-0318's registry is **identity, not construction**
(DO-NOT-REBUILD §10).

---

### Phase 3 — Graph writers, persistence and honest reads

| | |
|---|---|
| **Objective** | Every REQUIRED relationship has a production writer and a typed production reader; the rebuild is not a lossy slice; a graph read distinguishes empty from failed. |
| **Prerequisites** | Phase 1 (GR-11 gates) · Phase 2 (MT-01, so edges are written about authoritative elements) |
| **Gaps closed** | GR-01 · GR-04 · GR-05 · GR-06 · GR-07 · GR-08 · GR-09 · GR-10 · GR-13 · GR-14 · GR-15 · GR-17 · GR-18 · PV-05 |

**Exact changes, in dependency order within the phase.**
1. **GR-15 + GR-14 (first, one PR): type `window.semanticGraphManager`.** EV-04 §6.3 calls this the
   highest-leverage of the three: it turns `PhysicsEngine.ts:380`'s positional four-argument call
   into a **compile error**, and turns `getEdges` / `getEdgesFromNode?.(…) ?? []` — methods that
   **never existed** — from a silent `[]` into a compile error. The Furniture group of
   `HierarchyTreePanel` has never rendered; this is why. Typed refusal unions replace the three
   `[]`-conflation sites (C71 §4.4, C70 L-INV-1).
2. **GR-04 `joinedTo` writer + typed reader in one commit.** One flush-time emitter over the
   **already-retained** junction index, both directions, carrying `{junctionType,
   junctionDegree}`; **remove-and-re-emit per level** (C71 §3.4); **never** key on
   `WallJunctionRecord.id` — it renumbers when walls move (C71 §3.5, DO-NOT-REBUILD §13 row 8).
   Not `connectedTo`, not `connectsTo` (row 9 — the near-miss name is worse than a new one). This
   closes C-INV-2, currently UNPROVEN.
3. **GR-09 + GR-01.** A `sitsOn` write beside the existing store write in `CreateWallCommand`
   (which writes **zero** graph edges today); a `contains` write where containment is already
   computed — `RoomContentsService._containedByCentroid` is a pull-time query today.
4. **GR-08 then GR-06.** Deduplicate `_rebuildSemanticGraph` to **one owner** *before* widening
   it — widening one of two byte-identical copies is C71 §7.j, *"the copy left behind is the next
   silent loss"*. Then widen the single copy: it protects four of the five priority rows at once.
5. **GR-07 + PV-05.** The persist-or-lose ledger stops being prose and becomes the gate's input
   file, checked in **both directions**. `ProvenanceStore` is persisted or placed on the ledger by
   name.
6. **GR-10.** Malformed edges dropped on deserialize are **counted and reported**. A defect that
   self-erases on reload is a defect nobody can reproduce.
7. **GR-13.** A **second** match key beside the centroid in
   `RoomDetectionEngine.mergeWithExisting` — e.g. `boundingWallIds` overlap. Today a bounding wall
   moved beyond `CENTROID_MATCH_RADIUS` = 2.0 m **destroys the room** with its name, program,
   finishes and every edge. C70 C-INV-3.
8. **GR-17.** The UBG header claims snapshot persistence it does not have. Correct the header or
   persist it — do not leave the drift.
9. **GR-05 + GR-18.** Re-measure `sitsOn` readers at HEAD under the new gate; carry **neither**
   prior claim forward. Add the CA-21-equivalent read-back discipline for the graph — **no runtime
   probe has ever executed against a live graph**, so every EV-04/EV-05 claim is source-level.

**Tests.** move / resize / save-load / undo → connectivity answered as a **lookup with no resolver
re-run**. Rebuild twice → identical snapshots (D-INV-2). Serialize → restore → rebuild → diff ∅. A
pre-graph snapshot reports every loss **by name**.

**CI gates that must go green.** `check-graph-write-coverage` (ratchet moving down over the
REQUIRED families; a writer-first addition exits 3 — hence writer and reader in one commit),
`check-graph-delete-integrity`, `check-graph-persistence` (arm (d) asserts exactly one rebuild
copy), `check-topology-survives`, `check-derived-regenerable` (stays green).

**Measurable exit condition.** `joinedTo` is a `RelationshipType` member with ≥1 production writer
and ≥1 **typed** production reader; C-INV-2 moves from UNPROVEN to proven by an executed run;
`_rebuildSemanticGraph` exists in exactly **one** file; the persist-or-lose ledger is a file, not a
paragraph, and shrink-only; zero production read paths return `[]` for "cannot answer"; a room
survives a bounding-wall move beyond 2.0 m with its id intact.

**Risks.** (a) GR-04 written as a writer without a reader — exits 3 by design, and correctly.
(b) Widening the rebuild in one copy (C71 §7.j). (c) Treating `addRelationship` idempotency as
staleness handling — it prevents duplicates, never stale edges (§7.e). (d) **The whole phase is
static-discovery-scored**; GR-18 is the arm that stops that being mistaken for reachability.

**Architecture impact: none.** The three graphs stay separate (C71 §4.1, DO-NOT-REBUILD §1) — see
[`BIM30-ARCHITECTURE-IMPACT.md`](../../04-reference/BIM30-ARCHITECTURE-IMPACT.md).

---

### Phase 4 — Graph exposure: the runtime service (the Level 5 phase)

| | |
|---|---|
| **Objective** | The graph becomes a runtime service reachable through the composed bus by every consumer, the AI interface included, with typed refusals. |
| **Prerequisites** | Phase 3 (there is no point exposing a vocabulary whose REQUIRED families have no writers) |
| **Gaps closed** | GR-16 |

**Exact changes.** UBG → a `composeRuntime` slot (it has no runtime home and lives behind a
dev-hook today) + `graph.query` / `graph.neighbors` / `graph.path` as **read-only, refusal-honest**
verbs in the existing read-only capability class. *Machinery yes, exposure no* is the current
state; this is the exposure.

**Tests.** The golden query answered through the bus verb **plus its refusal path**. A chat query
answers a topology question **through the same verb a script would use, including the refusal
case** (D-INV-3). CA-21 conformance rows per new verb.

**CI gates that must go green.** `check-graph-write-coverage`; the verbs' CA-21 rows; the C69
generated verb register grades all three LIVE, not UNKNOWN.

**Measurable exit condition.** Three verbs exist on the composed runtime; each answers the golden
query **and** its refusal case in an executed probe; the AI path reaches them through the same
verbs with the same refusals; zero of the three returns `[]` to mean "cannot answer".

**Risks.** Exposing a read verb over a graph whose writers are unproven at runtime (GR-18) would
export the source-level illusion to every consumer at once.

**Architecture impact: none.** A `composeRuntime` slot is the P1 composition root doing its
declared job.

---

### Phase 5 — Propagation: both arms, or neither

| | |
|---|---|
| **Objective** | Every declared cascade has a live listener **and** a `prevState`-carrying emitter, or is deleted; suppression is reversible; reconciliation covers what it names. |
| **Prerequisites** | Phase 1 (PR-08 gates) · Phase 2 (PR-13 duplicate stores must be resolved to one owner **before** wiring any propagation through them) |
| **Gaps closed** | PR-01 · PR-02 · PR-03 · PR-04 · PR-05 · PR-06 · PR-07 · PR-11 · PR-12 · PR-13 |

**Exact changes.**
1. **PR-13 first.** Column / Door / Window exist in both `core-app-model/src/stores` and
   `geometry-*`. **Any cascade wired to one is blind to the other.** Resolve to one owner before
   anything is wired through them.
2. **PR-06.** `initPersistence.ts:362–372` — `try { … } finally { resume() }`, copying
   `performUndoRedo.ts:357–364` verbatim. A throw inside `ProjectLoader.load` currently leaves
   topology observation and sync-state recompute **off for the rest of the session**, silently,
   with the project looking fine. Smallest change in the phase; largest silent blast radius.
3. **PR-01 + PR-02 together, or neither.** The four typed events get listeners **and**
   `StoreChangeEvent` gains a pre-mutation field — `DependencyResolver` subscribes to the *bus*,
   not the stores, so listeners alone leave the diff-based work unreachable. C72 §0.2 and §8.b:
   *a one-armed fix is theatre, and worse than none because it is green.* The permitted
   alternative is **DELETE** — dispatch + catalog + ledger row in one commit. **No third state may
   persist.**
4. **PR-03.** Copy the `§STEP7` convention to each store on the declared diff-consumer list, on
   **every** `update` emit site — not merely in the listener type. Never reconstruct `prevState`
   by re-reading the store: it diffs a value against itself (C72 §3.5, DO-NOT-REBUILD §13 row 7).
5. **PR-04.** `operation === 'delete'` stops returning `[]`. A delete never returns an empty
   cascade **by design** (F-INV-2).
6. **PR-05.** Let a wall **`update`** surrender authority in the existing GR2 branch, or clear the
   authoritative set before the lifecycle sweep. Today the end-of-generation sweep is a **no-op by
   construction** and nothing distinguishes *"rooms are correct"* from *"rooms were never
   recomputed"*.
7. **PR-07.** Either a consumer that handles every one of the 13 types `RECONCILABLE_TYPES` names,
   **or narrow the list to the truth**. C72 §7: *narrowing a claim to the truth is a fix*.
8. **PR-11.** Implement `room.recomputeBoundary` **first**; register the cross-rule second.
   Registering a no-op and claiming coverage is the defect, not the fix.
9. **PR-12.** Verify the schedule staleness before subscribing — it is BY-READ and **UNPROVEN at
   HEAD**.
10. **PR-10 (partial).** The roof→walls-beneath subscriber lands here; **the clash detector does
    not** — it is GE-06's engine, construction, out of scope for every phase in this document.

**Tests.** Move one wall → **exactly** the predicted dependents change, with the `prevState` diff
as the oracle. Every propagation test drives the **real mutation entry point** (C72 §3.4).

**CI gates that must go green.** `check-propagation-reaches` (`declaredFindings` strictly
shrinking from 8), `check-prevstate-contract` (P1/P3 named baselines shrinking, P2 hard),
`check-suppression-is-reversible` (S1/S2 hard-0), and the Phase 0R bespoke-tracker gate — which
must **not** regress while the generic layer is wired.

**Measurable exit condition.** `cascade-events.json.declaredFindings` reaches **0** — every event
wired on both arms or deleted, ledger file removed with the finding path (C72 §7). `StoreChangeEvent`
(or its successor) carries a pre-mutation field. S1 and S2 hard-0 with no exemptions.
`RECONCILABLE_TYPES` has a consumer for every type it names, or names only types it has.

**Risks.** (a) **The largest risk in this document**: C72 §8.g and DO-NOT-REBUILD §2 — wiring the
generic cascade must not become a reason to retire the bespoke trackers. **Level 4 rests on the
bespoke path.** The Phase 0R gate exists precisely so that a regression here is visible.
(b) A one-armed fix landing green. (c) Building on the unwired cascade before it is wired (§8.i).

**Architecture impact: none.** A pre-mutation field on an existing event type and listeners on
existing dispatches.

---

### Phase 6 — Epsilon policy, then predicate canonicalisation (one family per PR)

| | |
|---|---|
| **Objective** | One declared tolerance policy exported from the layer that owns geometry, and one canonical implementation per predicate family under it. |
| **Prerequisites** | Phase 1 (GE-07 gates) · **GE-01 before every other row in this phase** (§0.3) |
| **Gaps closed** | GE-01 · GE-03 · GE-02 · GE-12 · GE-04 · GE-11 · GE-10 · GE-08 (stated, not closed) |

**Exact changes, strictly ordered.**
1. **GE-01 — the declared tolerance module, exported from `geometry-kernel`.** A numeric-zero
   epsilon, a model-space coincidence tolerance, a parallelism tolerance, each **unit-qualified in
   the name** (C73 §2.3). Today `geometry-kernel` exports **no epsilon at all**, so every consumer
   forms its own — 267 declarations, ≥8 conventions spanning three orders of magnitude. **Domain
   bands are not epsilons**: `defaultJunctionBandM` and `CENTROID_MATCH_RADIUS` stay put.
2. **GE-03 — the three-guards-one-file collapse.** `CesiumViewport.ts:9621` (`|| 1e-12`), `:10317`
   (`|| 1e-9`), `pointInRing` (**no guard**). One polygon, one session, three answers. The guard
   comes from the declared numeric-zero epsilon **or the predicate refuses**, and the collapse
   **states which behaviour is canonical and why** (C73 §3.7) — a silent pick is a behaviour change
   shipped as a refactor.
3. **GE-02, GE-12 — one family per PR**, in the order the measured duplication argues for:
   point-in-polygon (61 structural bodies / ~71 named definitions across 116 files), segment
   intersection, area & winding, point-to-segment distance, containment/overlap, planar face
   tracing. Shipping consumer identified **by name first** (§3.6). Note the two rival "shared"
   implementations with 3 consumers between them: **both were written to end the duplication and
   neither did** — collapsing onto a third is the failure mode to avoid.
4. **GE-04 — dedup by family** (`WallIntersectionResolver` ×3, `FloorPlanDiagnostics` ×2,
   `RoomStore.ts` ×2), shipped copy named before collapsing.
5. **GE-11 — one AABB definition for the room spatial index.** Two incompatible definitions feed
   it today (true bbox vs circle approximation) and **a concave room can be missed**. A live
   correctness bug, not duplication; pin with a concave-room regression test.
6. **GE-10 — a `wall.split` id over the existing opening-aware handler.** `wall.cut` already exists
   and **rejects a cut whose openings straddle the cut point, naming the offending opening ids**.
   **Do not rebuild the cut path.** The gap is an id.
7. **GE-08 — cross-machine determinism and GPU-side geometry stay UNPROVEN** and are recorded as
   such. They are not inferred from single-process green.

**Not in this phase: GE-05.** No general 2-D boolean exists and three files independently defer
one. It is **MISSING ALGORITHM — construction**, it blocks no gate, and it is scheduled by nothing
in this roadmap.

**Tests.** Per-family counting gates at pinned counts, plus **an oracle fixture at a known answer**
— the offset gate's 300 mm eave / spread 0.000 is the template. A concave-room fixture for GE-11.

**CI gates that must go green.** `check-epsilon-policy`, `check-predicate-canonical` (structural,
never name-based), `check-deterministic-regeneration`, and the existing
`check-offset-implementations` unchanged.

**Measurable exit condition.** `geometry-kernel` exports the declared tolerance module; every
collapsed family's counting gate reads its declared **1**; the three `CesiumViewport` guards are
one guard with a written canonical decision; the room index has one AABB definition with a passing
concave-room regression; `wall.split` exists as an id over the opening-aware handler. GE-08 remains
UNPROVEN **and is written as UNPROVEN**.

**Risks.** (a) A mass refactor — C73 §3.5 MUST NOT, no oracle, no bisect. (b) Collapsing onto a
copy the shipping path cannot reach: *reads as done, is not*. (c) A name-based gate, trivially
defeated by renaming. (d) Softening a refusal into a clamp or an empty result
(DO-NOT-REBUILD §13 row 10).

**Architecture impact: none.** A new export from an existing L2 package and file-level
canonicalisation.

---

### Phase 7 — Constraint honesty (and the solver question, unanswered)

| | |
|---|---|
| **Objective** | No adapter reports a solve it did not perform; every constraint family carries a written strength classification; violations become queryable model state. |
| **Prerequisites** | Phase 1 (CO-11 gates) · §0.5 sequencing is binding **within** the phase |
| **Gaps closed** | CO-01 · CO-02 · CO-03 · CO-05 · CO-06 · CO-07 · CO-08 · CO-10 |

**Exact changes, in the order C74 §4.3 makes binding.**
1. **CO-01 — its own commit, before anything else in this phase.** `PlanegcsAdapter.ts:85` declares
   `readonly kind = 'planegcs'` while `:95` delegates 100 % to `MockSolver`. Report the `kind` it
   **performs**, and emit a **non-suppressible first-call signal in a production build**.
   Satisfiable today, no new dependency (C74 §4.4).
2. **CO-02 — its own commit.** `loadSolver()` returns `MockSolver` on **both** paths. "Not
   configured" and "configured but could not load" become different observable outcomes, and the
   second is a **failure**, not a default.
3. **CO-03.** The test file states which production configuration it does **not** cover. 31 of 33
   passing tests inject `opts.underlying` — the field whose own docstring says *"Production callers
   MUST NOT pass this"* — so **the configuration production actually uses is the untested one**. No
   claim of the form "the solver works, N tests pass" without naming the bound subject.
4. **CO-06.** The scaffold gets an owner, a milestone, and **an assertion that fails when the
   milestone passes without the retirement**. Its two halves currently disagree (S52 D2 vs S53 D1
   ×4).
5. **CO-07.** One owner for `StairValidationAuthority` (`geometry-stair` is the one production
   imports; `constraint-solver`'s copy has zero production importers) **before either copy is
   extended**. Until then neither may be cited as "the stair rules" without naming which.
6. **CO-05.** `createWorkerHandler` is wired, or the barrel says it is unwired.
7. **CO-08 — the written classification, per family**, VALIDATION / ENFORCEMENT / ADVISORY /
   SOLVING with its evidence. **A family with none is treated as VALIDATION — the cheapest kind,
   not the most expensive.**
8. **CO-10.** A **production** caller for `provideLiveGraphSources` (its only caller today is a
   dev-tools file); validators emit `violates` edges. G-INV-3: violations are queryable model
   state, not log lines.

**Not in this phase, and not authorised by it: CO-04 and CO-09.** `planegcs` is a dependency of
**zero** workspaces. C74 §4.5 stands as the standing verdict: **UNPROVEN — no constraint family in
this repository has been shown to require SOLVING.** *Do not build a solver because "BIM 3.0 sounds
like it needs one."* CO-09 (the model-space constraint store) opens only when a family reaches
C74 §4.2(c) with evidence.

**Tests.** An executed run in which the adapter **reports its own nature**. Negative tests per gate
arm before any arm is trusted.

**CI gates that must go green.** `check-constraint-honesty`, `check-solver-is-real` (its `planegcs`
arm may only go green by the adapter renaming itself, never by adding a dependency to satisfy a
gate), `check-no-hidden-mock` (named baseline shrinking, checked both directions), CO-12's
enumeration arm.

**Measurable exit condition.** C74 §7's seven exit conditions, verbatim: adapter reports what it
performs **in its own commit**; `loadSolver` distinguishes the two failures; two gates built,
negative-tested and hard; `check-no-hidden-mock` baseline at 0 and off `gate-debt.json`; one
`StairValidationAuthority`; `createWorkerHandler` wired or deleted; **every** family carries a
§1.1 classification.

**Risks.** (a) §5.g — fixing honesty and capability in one commit destroys the lesson.
(b) §5.f — a solver-shaped roadmap, SOLVING assumed from the product category. (c) Taking the
`./compliance` registry down with the solver half of the same package (DO-NOT-REBUILD §13 row 16).
(d) An enforcement gate silently becoming advisory (row 17).

**Architecture impact: none.** CO-01/02/03 are behaviour inside an existing adapter; CO-09 (if ever
authorised) follows the component-editor's **existing** store pattern — construction inside an
existing boundary, not a rewrite.

---

### Phase 8 — Provenance at element grain

| | |
|---|---|
| **Objective** | Every datum knows how it came to be known, in one five-value vocabulary, never invented — and the export boundary is answered rather than left blank. |
| **Prerequisites** | Phase 1 (PV-07 gates) · **Phase 2 / MT-01** (register: *provenance fields are worthless while a verb can stamp them on a detached DTO store*) |
| **Gaps closed** | PV-01 · PV-02 · PV-03 · PV-04 · PV-06 · PV-08 |

**Exact changes.**
1. **PV-02 — a five-value provenance type in `packages/schemas`**, built from the idioms that
   already exist (C75 §0 Finding 3), **optional with an `UNKNOWN` default so existing snapshots
   parse unchanged** (§2.5), verified against a pre-change snapshot. Today: `originDetail` 0 hits,
   `derivationStatus` 0 hits, `detectionMethod` 0 hits across `packages/schemas`; every `origin:`
   in `elements/*` is a geometric `Vec3` — a *point*, not a provenance.
2. **PV-01.** `roomSnapshotUtils.ts:156` records **UNKNOWN-with-reason** instead of
   `|| 'auto-topology'`, and the serialised field is typed `RoomDetectionMethod`, not bare
   `string`. `'auto-topology'` is not a neutral placeholder — it is the **most authoritative member
   of the union**, and the `as any` defeats the union at exactly the point that would have caught
   it.
3. **PV-03 — in the same PR as PV-02, because *the fix IS writing the field*.**
   `RoomDetectionEngine.ts:454`'s `repairToSimplePolygon()` writes **INFERRED plus the reason**, or
   refuses in the `SlabFragmentBuilder.ts:706` form. Today the repair is logged to the console and
   not to the model, and the invented boundary is stamped identically to a genuinely flood-filled
   room.
4. **PV-08.** One vocabulary; the five values may not be aliased per package. Three non-unified
   `detectionMethod` enums collapse to one.
5. **PV-06.** Reuse **C62's** confidence model — do not reinvent it (C75 §4.h). Confidence exists
   only on OBSERVED/INFERRED data and is **ceiling-only** (H-INV-3).
6. **PV-04 — the export mapping, or its absence recorded by name.** How AUTHORED / OBSERVED /
   COMPUTED / INFERRED / REGENERATED land in IFC and DXF. C75 §7.7 permits two terminal states and
   **blank is not one of them**. This is the contract's own largest open risk.

**Tests.** Load a snapshot with a missing origin → reads `'unknown'`, **not** `'auto-topology'`.
A pre-change snapshot parses unchanged after the schema addition. A repaired boundary reads
INFERRED with its reason.

**CI gates that must go green.** `check-provenance-not-invented` (hard;
`roomSnapshotUtils.ts:156` fails it today), `check-provenance-coverage` (named baseline, both
directions), `check-derived-not-authored` (hard).

**Measurable exit condition.** C75 §7's seven conditions. Specifically: zero `?? '<member>'` /
`|| '<member>'` defaults of a provenance union at any deserialisation or import boundary; a
provenance type present in `packages/schemas`; `check-provenance-coverage`'s baseline at its agreed
per-kind target and off `gate-debt.json`; **PV-04 in one of its two terminal states, in writing**.

**Risks.** (a) A required field breaking snapshot parse — §2.5's optional-with-`UNKNOWN` default is
the mitigation and must be verified against a real pre-change snapshot. (b) Merging COMPUTED and
INFERRED (DO-NOT-REBUILD §13 row 19 — *may never be merged*). (c) Stamping provenance onto a
detached DTO store, which is why Phase 2 precedes this one.

**Architecture impact: none.** An optional field on existing schemas.

---

### Phase 9 — Certification completion

| | |
|---|---|
| **Objective** | Every claim in domains 1–15 is an EXECUTED claim, and the harness's own blind spots are named rather than closed by assertion. |
| **Prerequisites** | Phases 1–8 (the harness cannot certify subjects that do not exist) |
| **Gaps closed** | CE-02 · CE-03 · CE-04 · CE-05 · CE-06 · MT-09 · MT-10 |

**Exact changes.** A **headless fragment build** in the certification harness so the Geometry axis
stops reading UNPROVEN (CE-02). Browser I/O — IndexedDB / Supabase / autosave — **named** as
uncertified; in-memory green may not read as persistence green (CE-03). `undoredo.cert.ts` extended
to the unified `performUndoRedo` path, not the legacy stack only (CE-04). The **reachability probe
class** — the missing instrument, and the question this repository keeps failing (CE-05);
*"machinery present ≠ capability reachable"*. CE-06 is **stated, not fixed**: an executed run
proves the seeded fixture, and the fixture is itself a declared, reviewable artefact. MT-09's 27
isolated-compilation failures and MT-10's 8 XSS sites shrink under their exit-3 fences, owned by
their territories.

**CI gates that must go green.** `certify.ts` over the complete gate set at DECLARED-LEVEL or
better, with the empty-seed impossibility (`e5addac8`) intact and the stale-artefact and
publication guards firing.

**Measurable exit condition.** Zero UNPROVEN rows in the coverage matrix that are not **declared
UNPROVEN with a named reason**; the Geometry axis scored from an executed headless fragment build;
isolated-compilation failures strictly below 27; XSS sites strictly below 8.

**Risks.** Declaring a limitation and then citing the declaration as coverage. CE-06's caveat is
permanent and must stay written.

**Architecture impact: none.**

---

### Phase F — BLOCKED-ON-FOUNDER (unscheduled, and not a phase in the sequence)

| | |
|---|---|
| **Gaps** | CB-01 (deploy the CRDT transport) · CB-02 (`PgAuthz`, prerequisite of the **production** flip only, not of CB-01) · CB-05 (per-capability convergence, blocked-by CB-01) · MT-08 (§UNDO-GESTURE-ID) |

**Status.** CB-01 is *a single reversible flip* behind a staging-only flag; the code side is PROVEN
locally (the hosting edge survives concurrent editing; WS auth fail-closed). No amount of further
engineering raises the collaboration ceiling — **one founder decision does**. MT-08 is pinned
RED-BY-DESIGN by three `it.fails` at the 250 ms window and is **explicitly not** taken as decided
by the founder's "agree" of 2026-08-12 (ADR-0321 status note).

**What this phase blocks.** Level 7 entirely; Level 8 through the Golden Chain's collaboration
link (C70 §3.4: a chain containing an UNPROVEN link scores as incomplete, never as passing); and
`check-collab-graph-integrity`, which reports UNPROVEN and **never green** until a real transport
exists.

**These items may not be ordered as though they will arrive.** No phase above depends on them, by
construction.

---

## §2 — What must complete before each maturity level may be AWARDED

C70 §4.1: *no level is awarded without an executed run.* C70 §4.2: a level may not be awarded on
the strength of the machinery existing. C70 §4.3: a level once awarded is held **only while its
gate stays green** — it is a ratchet subject, and losing it must exit non-zero.

| Level | Phases that must complete first | The executed run that awards it | Verdict |
|---|---|---|---|
| **4** — derived topology auto-maintained | **already held**, on the bespoke propagation spine (register §10 row 7). **Phase 0R is what keeps it**: today the subsystem the award rests on is ungated (PR-09), so the level is held without an instrument that could detect its loss | executable propagation evidence at unit level | **HELD, uninstrumented until Phase 0R** |
| **5** — unified queryable graph as a runtime service | **0R · 1 · 2 · 3 · 4** | graph verbs answer the topology questions **through the composed runtime**, with typed refusals, in an executed probe (D-INV-1/2/3) | **reachable by wiring** |
| **6** — constraint- and dependency-driven modelling | **0R · 1 · 7** (and Phase 3 for the reverse-dependency queries) | a stored constraint **survives persistence** and is checked / enforced / solved **at its declared strength**, and `check-constraint-honesty` is green | **conditionally reachable — see §2.1** |
| **7** — collaborative, versioned graph | **Phase F (founder)** + 0R · 1 | `check-collab-graph-integrity` green **against a real transport** | **unreachable without a founder decision** |
| **8** — full BIM 3.0 | **all of 0R–9 plus Phase F** | the eight golden operations each pass their **full** Golden Chain; provenance answers who/how for every element; IFC round-trips on the GUID join key | **unreachable without a founder decision** (the chain contains a collaboration link) |

### §2.1 — Level 6 and the solver: the one place the ladder is genuinely ambiguous, stated as ambiguous

Level 6's definition reads *"honest solving **where proven necessary**"*. C74 §4.5 records that
**no family has been shown to require SOLVING**, and `annotationConstraints` is already persisted,
read back and checked. On the face of it, Level 6 is awardable after Phase 7 with **no solver at
all**, provided CO-08's written classification lands no family at §4.2(c).

**But C70 §4.2 says the opposite in plain terms** — Level 6 was graded "one constraint store away"
and *"the grading was wrong: it is one constraint store **plus a real solver** away"*. The two
readings are not reconciled by any artefact at HEAD.

**Verdict: UNPROVEN, and C70 §4.2 governs until CO-08 is written.** The classification is the
instrument that decides it, which is why CO-08 sits inside Phase 7 rather than after it. If every
family classifies at VALIDATION / ENFORCEMENT / ADVISORY with evidence, Level 6 becomes reachable
without construction and C70 §4.2 should be amended by ADR — **not by a roadmap**.

### §2.2 — The sequencing verdict, honestly

- **Reachable by wiring alone**: **Level 5.** Phases 2–4 are WIRING, RETENTION, EXPOSURE and
  INVARIANT work over machinery that already exists. Nothing on the path to Level 5 requires code
  that has never been written — GR-16's verbs are exposure of an existing UBG, GR-04's writer reads
  an index that is **already retained**.
- **Needs contained construction**: **Level 6**, and only inside an existing boundary — a
  model-space constraint store following the component editor's existing pattern (CO-09), **if and
  only if** CO-08 authorises it. Level 8 additionally needs the IFC round-trip on the GUID join key
  and the provenance export mapping (PV-04).
- **Cannot be reached at all without a founder decision**: **Levels 7 and 8.** Level 7 requires a
  transport that does not exist in any environment; Level 8 inherits that through the Golden
  Chain's collaboration link. This is not an engineering estimate — it is C70 §2.2 and §3.4
  applied, and it was declared on day one at BIM 2.0's close-out so the number could not be quietly
  redefined later.
- **The construction items nobody is waiting on**: the 2-D boolean (GE-05), the clash engine
  (GE-06), and the planegcs binding (CO-04). None of them gates a level; all three are real gaps.

---

## §3 — The critical path

**Definition, stated so it cannot be redefined afterwards.** *"BIM 3.0 CI gate closed"* means:
every gate C70 §7 names **exists at HEAD, in one suite, under one `contract.ts`**; each
**establishes its subject** (never exits 2); each exits **0 or 1 against a named, shrink-only
ledger**; each has been **watched go red** against a planted violation; and
`check-collab-graph-integrity` reports **UNPROVEN rather than green** (C70 §3.4). It does **not**
mean every ratchet has reached 0 — that is the Definition of Done (C70 §6), which is a longer
chain and includes Phase F.

### The chain

```
Phase 0R  ─►  Phase 1  ─►  Phase 2 (MT-01 wall/slab/room only)  ─►  Phase 9 (CE-02 only)  ─►  CLOSED
   six          sixteen         readback-positive so the                headless fragment
 unmapped        gates          store-reach floors can be met            build so the Geometry
  gates        + CB-03                                                   axis has a subject
              one suite
```

---

### §3.1 — ⚠ THREE DIFFERENT BARS, AND THIS ROADMAP ONLY SEQUENCES THE FIRST

Added 2026-08-13, because the founder asked *"how do I know this works 100 %, for every element,
not just walls?"* — and **no section of this document answered it.** The §3 definition above is
the narrowest of three bars, and quoting it as "BIM 3.0 is closed" is C70 §8.i.

| # | Bar | What it means | Owner | Status |
|---|---|---|---|---|
| **1** | **CI gate closed** | Every C70 §7 gate exists, in one suite, establishes its subject, exits 0/1 at a named ledger, watched go red | §3 above | near — Phase 9's CE-02 landed 2026-08-13 |
| **2** | **Definition of Done** | C70 §6's eight conditions: ratchets at 0, the 8 golden operations holding their **entire** chain, the ladder to L8 | [C70](../../02-decisions/contracts/C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md) §6 | 1 of 8 met; L7/L8 founder-blocked |
| **3** | **UNIVERSAL — every element** | **C78 §19.1's no-partial-credit applied ACROSS the `element × relationship × operation` product**, not along one chain | [C78](../../02-decisions/contracts/C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md) §19.1, §20 U-INV-1 | **UNMEASURED — its gate does not exist** |

> **C78's own words, and the load-bearing sentence for this whole program:** C70 §3.2's
> no-partial-credit applies *along a chain*; **C78 §19.1 applies the same rule across the
> product** — and **"Neither may be satisfied by the other."**

**Bar 3 is the founder's question, and it is not on the critical path above.** It has one
instrument: **`check-relationship-determination` (C78 §20, U-INV-1)** — a NAMED GAP, **no file at
HEAD, measured 2026-08-13**. Until it exists, "every element works" is a claim no artefact in this
repository can support, and per C70 §0.1 the honest word is **UNPROVEN**.

**What it must do** is specified in
[BIM30-MASTER-COMPLETION-TRACKER.md](BIM30-MASTER-COMPLETION-TRACKER.md) §-3: enumerate the product
from the registries (exit 2 if it cannot establish that denominator), require every cell to be
DETERMINED-affected / DETERMINED-unaffected / **UNDETERMINED-with-a-typed-reason** — an honest
refusal is a **pass**, silence is a failure — carry a named shrink-only ledger, and land RED.

**It became buildable on 2026-08-13** and was not before: the 2026-08-12 audit's blocker C.1
(*"`ConsequencePlanner<WallMoveCommand>` is hard-bound — no second family can register; everything
else waits behind this"*) is **dead** — the map now types `ConsequencePlanner<never>` and three
families are registered. A universal gate finally has something real to iterate over instead of one
family and a wall of N/A.

> **Sequencing note.** Bar 3 does not replace Phases 0R–9; it is what those phases were *for*. The
> phases build the instruments; bar 3 is the instrument that measures whether the capability
> generalised. **Add `check-relationship-determination` to Phase 1's gate wave** — it is a gate, it
> lands red, and it is the only row in this document that can ever answer the founder's question.

**Four links, and each is a floor, not a preference:**

1. **0R before 1** — two of Phase 1's gates carry arms that Phase 0R specifies; a host gate merged
   without its arm is a gate that will need re-opening. And §0.2's reason stands on its own.
2. **1 before 2** — §0.1. A capability implemented before its gate cannot be scored, and this
   repository's entire failure history is unscored capability reading as working capability.
3. **2 (MT-01 only) before closure** — `check-identity-roundtrip`'s store-reach floor and
   `check-graph-*`'s subject resolution need authoritative stores that are actually read. A gate
   that cannot establish its subject exits **2**, which is never absorbable (C70 §5.1). **Only
   wall, slab and room are on the path** — the other MT rows are not.
4. **CE-02 before closure** — the Geometry axis is UNPROVEN **everywhere headlessly** because no
   fragment builders run in the harness. An axis with no subject cannot exit 0 or 1.

Additionally, **PV-04 in writing** is on the path in its cheapest form: C75 §7.7 forbids leaving it
blank, and recording the absence **by name** as an accepted limitation costs one paragraph. The
mapping itself is not on the path.

### What is NOT on the critical path

Named explicitly, because the value of a critical path is what it excludes:

- **The planegcs WASM binding (CO-04) and the model-space constraint store (CO-09)** — unauthorised
  until CO-08 classifies a family at §4.2(c). The *honesty* fixes (CO-01/02/03) are on the path
  only to the extent that `check-constraint-honesty` must be able to run; the gate closes red, and
  red-at-a-declared-level is closed.
- **The general 2-D boolean (GE-05)** and **the clash detection engine (GE-06's engine half)** —
  construction, gating nothing. GE-06's *refusal* half is on the path, inside Phase 0R.
- **Predicate canonicalisation reaching 1 per family (GE-02, GE-12)** — the *gate* is on the path;
  the *ratchet reaching 0* is not. A counting gate pinned at 61 and shrinking is closed.
- **All of Phase F** — CB-01, CB-02, CB-05, MT-08. The collaboration gate closes by reporting
  UNPROVEN, which is its correct behaviour without a transport.
- **MT-02 through MT-07** — real gaps, off the shortest chain; only MT-01's three kinds are on it.
- **Phase 5's cascade wiring, Phase 6's collapses, Phase 8's schema field** — each closes a
  ratchet, none is required for a gate to *establish its subject*.
- **MT-09's 27 packages and MT-10's 8 XSS sites** — exit-3-fenced under their own territories.

**The uncomfortable reading of that list, stated rather than buried:** the critical path to a
closed CI gate is almost entirely **instrument work**, and it closes with most of the register's 82
gaps still open — declared, named and shrinking, which is exactly what exit code 1 means. A closed
gate is the beginning of the ratchet, not the end of the work. Anyone citing "the BIM 3.0 gate is
closed" as a capability claim is committing C70 §8.i.

---

## §4 — What this roadmap does NOT establish

1. **No measurement was performed for this document.** Every count, line citation and status is
   carried from the gap register, the contracts, or the BIM 2.0 close-out. **Read the gate, not
   this line** (C70 §0.2).
2. **No duration, no estimate, no date.** Nothing here says how long a phase takes. Ordering is
   dependency; sizing is not attempted, and inventing it would be the inference §0.3 forbids.
3. **No severity ranking beyond the dependency edges.** The register itself declines to rank
   (§11.4), calling priority a founder decision. Phase order is dependency order; within a phase,
   the numbered steps carry their own stated edges and nothing more.
4. **Parallelism is not scheduled.** Phases 5, 6, 7 and 8 share no dependency edge with each other
   and may run concurrently after Phases 1–3; this document does not assign them, because who runs
   what is not derivable from evidence.
5. **The Level 6 ambiguity is unresolved** (§2.1) and is written as unresolved.
6. **Whether any existing gate is green today is UNPROVEN here**, deliberately (C70 §0.2).
