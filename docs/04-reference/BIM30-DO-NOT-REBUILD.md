# BIM 3.0 — Do Not Rebuild

> **Stamp**: 2026-08-12 · **Phase 0** of the founder's BIM 3.0 master directive · **Branch**: `main` · **HEAD**: `a8f15234`
> **Companion**: [`BIM30-GAP-REGISTER.md`](BIM30-GAP-REGISTER.md) — the gap half. That document says what is missing; **this one says what must survive the fixing**, and it is the more dangerous of the two to get wrong. A gap left open costs a capability. A working subsystem "cleaned up" costs the capability *and* the knowledge of why it was built that way.
> **Authority**: [C70](../02-decisions/contracts/C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md)–[C75](../02-decisions/contracts/C75-PROVENANCE.md), [ADR-0318](../02-decisions/adrs/ADR-0318-composeruntime-owns-authoritative-stores.md)–[ADR-0321](../02-decisions/adrs/ADR-0321-wall-connectivity-is-joinedTo-not-connectedTo.md), and the evidence appendices. Where this document and a contract disagree, **the contract wins**.
> **Doctrine**: no cell is inferred. Where evidence is absent the cell reads **UNPROVEN**.

---

## §0 — The headline

## NO ARCHITECTURAL REWRITE REQUIRED.

This is not an encouragement; it is a **measured finding that survived two downgrades**. The
evolution audit's REPLACE list is **empty**, and it stayed empty through the §17 addendum — the
same addendum that discovered the constraint solver was a mock and the generic cascade was dead
([CD §H](BIM30-CONTINUITY-DELIVERABLE.md), audit §17.5). Two of the product's advertised organs
turned out hollow and **still nothing needed replacing**, because what was hollow was never
load-bearing: the things actually keeping the model consistent are hand-wired, pair-by-pair, and
they work.

The gap register classifies sixty measured defects across all six BIM 3.0 contracts. Its
**ARCHITECTURAL CHANGE count is 0**.

> ### The one candidate considered — and rejected
>
> **Merging the dual edge vocabulary.** Two relationship vocabularies exist: `SemanticGraph`'s 25
> declared types and the UBG's 10-edge query set. The obvious tidy is to merge them into one.
>
> **Rejected.** Merging the stores would change the serialized shape of `ProjectSnapshot` and
> **break snapshot v3 for every persisted project, in exchange for a naming preference** — a
> migration with no capability on the other side. The resolution is **mapping, not merging**:
> declare the UBG's vocabulary the canonical **query** vocabulary, keep the three stores separate,
> and write the mappings down **in code rather than assuming them by name** (C71 §4.1–§4.3, CD §E).
> This is now a binding MUST NOT, not a preference.

Four items in the register are **construction** — new code inside the frozen architecture — and are
labelled so rather than smuggled in: the planegcs WASM binding (fills an existing adapter, and only
if a constraint family proves it needs solving), a model-space constraint store (follows the
component-editor's existing store pattern), a general 2-D boolean, and a real clash engine.
**Construction is not architectural change.**

> **§0.1 — how to use this document.** Before any BIM 3.0 work that touches a subsystem named
> below, read its **WHAT MUST NOT BE REPLACED** row. Those rows are the load-bearing half. Each
> section carries five fields:
> **WHAT IT ALREADY DOES** · **WHY IT MATTERS TO BIM 3.0** · **WHAT BIM 3.0 NEEDS FROM IT** ·
> **HOW IT WILL BE EXTENDED** · **WHAT MUST NOT BE REPLACED**.

---

## §1 — The three graphs, and why merging them is forbidden

**WHAT IT ALREADY DOES.** Three graph-shaped stores exist, and they are **not three copies of one
thing** (C71 §4):

| Store | What it is | Proven state |
|---|---|---|
| **`SemanticGraph`** (`packages/core-app-model/src/SemanticGraph.ts`) | the retained typed-edge record over model elements — 25 declared types, **serialized verbatim into snapshot v3**, loaded back, malformed edges filtered | G2–G4; 4 families HEALTHY (writer + typed reader + rebuild) |
| **`RoomGraphService`** (`packages/spatial-index/`) | a lazily-rebuilt room-connectivity index — rooms as nodes, doors as edges: BFS pathfinding, connected components, accessibility | **the repo's one proven G5 computation**, 20/20 tests |
| **UBG** (`packages/building-graph/`) | the Unified Building Graph — pure, Zod-validated, span-instrumented, a 10-edge aggregate/projection vocabulary | pure and tested; **no runtime home yet** |

**WHY IT MATTERS TO BIM 3.0.** Three stores with three jobs is the correct design. One store with
three responsibilities is a migration with nothing on the other side. `RoomGraphService` is the
only deterministic-reasoning-grade computation in the product; `SemanticGraph` is the only thing
that persists topology at all; the UBG is the only clean query vocabulary anyone has written.

**WHAT BIM 3.0 NEEDS FROM IT.** D-INV-1/2/3: graph answers reachable as read-only, refusal-honest
bus verbs **through the composed runtime**, with one canonical query vocabulary at the surface.

**HOW IT WILL BE EXTENDED.** The UBG gets a `composeRuntime` slot; `graph.query` / `graph.neighbors`
/ `graph.path` join the existing read-only capability class; the other two stores **map onto** the
UBG's vocabulary, mappings declared in code. `SemanticGraph` gains `joinedTo` (ADR-0321) and a
first-party `contains` writer; `_rebuildSemanticGraph` widens from its 5-type slice.

**WHAT MUST NOT BE REPLACED.**
- **The three stores may not be merged** (C71 §4.1, §7.i). This is the rejected candidate of §0.
- **Parked relationship types may not be deleted to tidy the union** — removing them breaks
  `deserialize` on any snapshot carrying one, for zero computational gain (C71 §2.4, §7.c).
- **`connectedTo` may not be overloaded** to carry wall connectivity. Both production readers
  consume it as *rooms*, and one of them enumerates relationships **untyped into AI context** — it
  would poison the world model with **no error anywhere** (C71 §3.2, ADR-0321).
- **A UBG type name is not SemanticGraph coverage.** `precededBy` / `supersedes` / `branchedFrom`
  exist in both. Greps conflating the two have **already produced one false capability claim in
  this repository** (C71 §4.3, §7.g).

---

## §2 — The bespoke propagation wiring — **Level 4 rests on this, not on the generic cascade**

**WHAT IT ALREADY DOES.** Everything that propagates in PRYZM today is per-pair wiring, measured
live and regression-pinned:

- **`DoorDependencyTracker` / `WindowDependencyTracker`** — hosted openings re-anchor on wall move,
  height and thickness changes. Openings translating on a wall move is **EXECUTED-PROVEN** (EV-03
  §1), by parametric offset plus a `touch()` re-anchor, and pinned by
  `wallMoveHostedOpeningCascadeFreeze.test.ts`.
- **`WallRebuildCoordinator`** — 2,038 lines; the real adjacent-wall rebuild, including diff-based
  neighbour discovery off `prevState`.
- **`RoomTopologyObserver`** — seven suppression guards, debounced re-detect scheduling, graph
  authority surrender.
- **Cascade-delete** inside `DeleteElementCommand` — doors and windows removed with their wall
  **twice over**, at command level and at store level, and restored by undo.
- **`spatial-authority-reconcile`** — the level-elevation rebuild callback.

**WHY IT MATTERS TO BIM 3.0.** **Maturity Level 4 — "derived topology auto-maintained" — is earned
by this bespoke wiring and by nothing else.** The audit checked whether the level moves when the
generic cascade turned out dead, and the answer was **no, with the mechanism relabelled**: the
systems the change-impact traces measured as *live* are exactly these (audit §17.4). A refactor that
retired them in favour of the generic path **would retire the only working propagation in the
product** (C72 §0.3).

**WHAT BIM 3.0 NEEDS FROM IT.** F-INV-1/2/3 — reach, with `prevState` in hand, and host mutation
re-validating hosted state.

**HOW IT WILL BE EXTENDED.** The generic cascade is grown **out of** the bespoke layer, not over the
top of it: `_computeAffected`'s output is routed into the existing coordinators, or
`setRebuildDispatcher` is called with listeners that delegate to them. `prevState` spreads from 5
stores to the declared diff-consumer list. Deletes stop returning `[]`.

**WHAT MUST NOT BE REPLACED.**
- **C72 §2.4 is a MUST NOT with a name: the do-not-rebuild rule.** The bespoke trackers *may not*
  be removed, deprecated, or routed through the generic cascade **as part of wiring it**. A
  migration off them requires the replacement to be **demonstrated propagating first, per pair** —
  **never a flag-day swap** (§8.g).
- **`WallOccupancyStore`'s pure-query design is a property, not a defect.** It stores nothing: it
  reads `wall.openings[]` from the frozen record at query time, is transparent to undo and load,
  and **has nothing to orphan on delete** — no `release`, no `unregister`, by design. EV-03 §4.2
  records this explicitly as *"a genuinely good design property and should be recorded as such
  rather than 'fixed'"*.
- **The double removal in the wall-delete path is belt and braces, not redundancy to collapse.**
- **`wall.openings[]` is the one opening authority**, invariant-checked. Do not resurrect a rival.

> **⚠ Standing caveat, stated because it is exactly the hazard this document exists to prevent:**
> **no gate asserts that the bespoke trackers still reach their pairs** (C72 §6.1.2(d),
> gap PR-09). The most protected subsystem in this document is also the least instrumented. Its
> seam tests — `WallOpeningEmitSeam.test.ts` shape, driving the **real** mutation entry point — are
> the pattern to extend, and *"a propagation test whose fixture supplies the very value under test
> proves nothing"* (C72 §3.4).

---

## §3 — The retained junction index

**WHAT IT ALREADY DOES.** ADR-0055's `JunctionResolverV2` computes wall junctions — L / T / Y / X /
N-WAY with participant wall ids and typed refusals — and, since CONNECT-3 (`8552de14`, *"junctions
are retained, and undo stops walking counters forward"*), **the records are retained** rather than
dying inside `resolveJunctions` as `JunctionDraft` did. `WallJunctionRecord` is declared by the
resolver; `WallFragmentBuilder.levelJunctions` exposes the level's retained set.

**WHY IT MATTERS TO BIM 3.0.** C70 **C-INV-2**: wall connectivity must be a **lookup**, never a
per-query re-run of the resolver. The retained index is what makes that possible — and the payoff
is larger than speed. Room detection was **re-detecting the same junctions the wall resolver had
just computed, with a different epsilon** (a node grid vs the resolver's 0.20 m band), and that
mismatched double-detection is the documented root cause of the §DIAG-ROOM-LOOP failure class
(audit §17.6). The index also unblocks `IfcRelConnectsPathElements` export and junction-type
queries, which are impossible without re-running and re-classifying.

**WHAT BIM 3.0 NEEDS FROM IT.** A `joinedTo` writer over the retained index (ADR-0321), and Q4
("which walls connect to wall Y") answered as a graph lookup.

**HOW IT WILL BE EXTENDED.** One flush-time emitter, both directions, carrying
`metadata: { junctionType, junctionDegree }`; rebuild disposition **REGENERATED** (junctions are
derived and the rebuild source is the retained index, so `joinedTo` is *not* persist-or-lose); delete
behaviour inherited from the wall-family cascade purge.

**WHAT MUST NOT BE REPLACED.**
- **`WallJunctionRecord.id` may not become a stored key.** It is a within-solve handle and
  **renumbers when walls move**. The stored identity is the participant wall id pair plus the
  junction type (C71 §3.5, ADR-0321).
- **Stale-edge removal is part of the writer, not a follow-up.** `addRelationship` idempotency
  prevents duplicates and **never** staleness: a wall that *stops* joining would keep its stale edge
  forever. Edges are removed and re-emitted per level at flush (C71 §3.4, §7.e).
- **The name is decided.** Not `connectedTo` (§1), and **not `connectsTo`** — one letter of edit
  distance is a review hazard, and **the near-miss name is worse than a new name** (C71 §3.3).

---

## §4 — `prevState` store events (§STEP7)

**WHAT IT ALREADY DOES.** Five stores emit the pre-mutation snapshot as a third callback argument on
`update` — `WallStore`, `SlabStore`, both `ColumnStore`s, `RoomBoundingLineStore` — and the
consumers that read it make real diff-based decisions: adjacent-wall discovery, property-only fast
paths, whole-level-vs-local rebuild classification.

**WHY IT MATTERS TO BIM 3.0.** It is **arm B** of the definition of propagation (C72 §1.1). A
listener without `prevState` can only invalidate wholesale — that is the ADR-057 defect. The
convention already exists, is already correct, and is the one to copy.

**WHAT BIM 3.0 NEEDS FROM IT.** Every store on the declared diff-consumer list emitting it at
**every** `update` site, and a change-notification type that can structurally carry it.

**HOW IT WILL BE EXTENDED.** `check-prevstate-contract` ratchets P1 (emit sites) and P3 (seam tests)
to zero; `StoreChangeEvent` gains a pre-mutation field.

**WHAT MUST NOT BE REPLACED.**
- **`prevState` may never be reconstructed by the consumer by re-reading the store.** After the
  mutation the store holds the *new* value; a re-read diffs a value against itself and classifies as
  "unchanged" — a **false clean**, and failure-as-emptiness (C72 §3.5, §8.d).
- **The `§STEP7` convention is the shape to copy, not to redesign** (C72 §3.1).
- **A classifier whose only reachable branch is its `no-prevState` branch may not ship** (§3.3).
  This is not hypothetical: the openings fast path was unreachable **for want of two arguments**,
  and every existing classifier test passed throughout, because each one **built `prevState` by
  hand**. They tested the classifier; the broken thing was the **seam**.

---

## §5 — `WallOccupancyStore` + `planOpeningRefit` — the reference refusal shape

**WHAT IT ALREADY DOES.** `WallOccupancyStore.canPlace()` is a **real commit-time enforcement gate**
on a real mutation path: called from `plugins/wall/src/handlers/CreateWallOpening.ts`,
`packages/command-registry/src/walls/CreateWallOpeningCommand.ts`, and the door/window offset and
move commands. `planOpeningRefit` runs on a wall shrink and returns **a plan**: relocations where an
opening still fits, and **typed refusals naming both measurements** — the opening's required span
and the wall's remaining span — where it does not. A refused wall is skipped, keeping its previous
geometry. **No opening is ever deleted to make room.**

**WHY IT MATTERS TO BIM 3.0.** This is the **reference implementation of the refusal shape** the
whole target definition asks for: C70 **G-INV-4** and **F-INV-3**, C73 §4.1, C74 §1.1 ENFORCEMENT.
*"Refuse with both numbers"* is not an aspiration here — it ships.

**WHAT BIM 3.0 NEEDS FROM IT.** Its shape, replicated: every refusal names the rule and both
numbers, and reaches the user verbatim.

**HOW IT WILL BE EXTENDED.** The same refusal form spreads to the remaining geometric operations;
`BaselineReversalError`, the roof inset's **three named collapse modes** (each carrying its inward
distance in metres, not one generic "invalid roof"), and `polygonOffset`'s
`{ polygon: [], degenerate: true, reason: 'offset collapsed the ring' }` — **an empty result that
arrives labelled, so a consumer cannot read it as "no overhang"** — are the companion precedents to
copy (C73 §4.2).

**WHAT MUST NOT BE REPLACED.**
- **`WallOccupancyStore` must not be given storage.** Its pure-query design is why it needs no
  cleanup, no registration lifecycle, and is transparent to undo and load (audit §17.6, EV-03 §4.2).
- **No solver work may replace, bypass or "unify" a real constraint component** without a per-row
  migration that keeps its refusal behaviour observable. **An enforcement gate silently becoming
  advisory is a user-facing behaviour change disguised as a refactor** (C74 §2.1).
- **A refusal may not be softened into a clamp, a fallback, or an empty result** (C73 §4.3).

---

## §6 — The deterministic generation engines

**WHAT IT ALREADY DOES.** The most-finished domain in the entire model, and **grep-confirmed
AI-clean**: D-TGL apartment layout (67 tests) · D-FLE furnish · D-CE ceilings · room detection ·
ADR-0055 wall joins · schedules and QTO · **IFC export including `IfcRelSpaceBoundary`** · solar
analysis (C21) · C63 envelope resolution with typed refusals · PDF→BIM tier 1 (proven zero-token).
**Production deploys carry no AI key at all** and every one of these still runs.

**WHY IT MATTERS TO BIM 3.0.** It is the standing proof of the founder's binding posture:
*"the LLM may sit above the computational model, not underneath it"*, and **removing the AI box
entirely must cost the system no capability except conversation** (C70 §1.3). Zero-LLM BIM 3.0 is
**the target posture, not a fallback** (J-INV-3). AI is required for exactly three things, all of
them *consumers* of bus verbs and graph reads (CD §F).

**WHAT BIM 3.0 NEEDS FROM IT.** J-INV-1/2/3 — pure consumers of authoritative state writing back
only through commands, carrying COMPUTED/INFERRED provenance, refusing with the named gap on
insufficient input.

**HOW IT WILL BE EXTENDED.** Two wiring changes and **no engine change**: un-mark graph-authoritative
levels when generation ends (so a later manual wall move propagates into generated fabric), and
stamp provenance once the schema fields exist. The capability model states it plainly: *"the engines
themselves need no change to meet the target."*

**WHAT MUST NOT BE REPLACED.**
- **Nothing in the generation stack.** It is the bulk of BIM 3.0's delivered value and it came
  through both audit downgrades **strengthened**, not weakened (audit §17.3, §17.5).
- **The zero-token property is a property to be kept and tested, not admired** (C70 §1.3). Any
  change that makes a deterministic tier require the worker is a regression of the AI boundary,
  regardless of output quality.
- **`IfcRelSpaceBoundary` export must not be lost** in any room-detection refactor — it is one of
  the few places where PRYZM's topology reaches an interchange format at all.

---

## §7 — The certification harness

**WHAT IT ALREADY DOES.** `tools/rac-conformance/certification/` — `certify.ts` over `gates/*`,
with `contract.ts` as the **single** implementation of the exit-code contract, plus `floors.ts`,
`capture.ts`, `seed.ts`, `world.ts`, `cert-ratchet.json`. Its properties, each executed:

- **The four-exit-code contract** — `0` CLEAN · `1` DECLARED-LEVEL (absorbable by name, shrink-only)
  · `2` **MISCONFIGURED, never absorbable** · `3` **RATCHET EXCEEDED, never absorbable**.
- **MISCONFIGURED floors** — `minFiles`, `minRecords`, artefact freshness. A gate that cannot
  establish its subject **exits 2, not 0**. `persist:opening` reports MISCONFIGURED for its kind and
  **says so**, rather than printing clean over an empty store.
- **Tampered-state falsifiability** — every green cell has been **watched go red** against a
  deliberately tampered expectation. A comparator that has never failed has not been shown to be
  able to (C70 §5.6).
- **The negative control that closed BIM 2.0** — an **empty seed** once produced the best-looking
  certification the repo had ever recorded. That run now exits **2 MISCONFIGURED** (`e5addac8`).
- Real serializer/loader, real composed bus, whole-store deep captures, `statusOf()` **derived, never
  hand-assigned**, and a **documented-tolerance list that ships empty** — because a tolerance list
  written to make a test pass is not a measurement, it is the test agreeing with the code.

**WHY IT MATTERS TO BIM 3.0.** Certification is capability domain 16 and it is what keeps the other
fifteen true next week. Fifteen gates were found **green and blind** in one session; every one failed
by being unable to distinguish emptiness from failure. This harness is the instrument that made that
impossible, and **all remaining BIM 3.0 gates extend it — none needs new infrastructure** (CD §I).

**WHAT BIM 3.0 NEEDS FROM IT.** The ten C70 §7 gates hosted under one suite, each with a floor, each
negative-tested before its first green is believed.

**HOW IT WILL BE EXTENDED.** New gate files under `gates/`, using `scan.ts` and `floors.ts`; named
ledgers checked **in both directions**; `check-collab-graph-integrity` migrates in from
`tools/ga-gate/` so there is **one** suite and **one** exit-code implementation (C70 §7.2).

**WHAT MUST NOT BE REPLACED.**
- **A floor may never be lowered to make a run green.** Floors are **misconfiguration detectors,
  not difficulty settings**; lowering one is the same act as deleting the gate (C70 §5.3, §8.f).
- **A gate may not implement its own exit codes.** One `contract.ts` (C70 §5.1).
- **Debt that has been paid leaves the ledger in the commit that pays it.** A stale entry exits
  **3, deliberately**, because folding it into the finding count would let one fix and one un-struck
  entry cancel out and read as "no change" — *precisely how a ratchet stops ratcheting* (C70 §5.4).
- **Ledgers name their entries.** A bare count lets a PR fix one finding, break another, and stay
  level (C70 §5.5, §8.h).
- **The empty tolerance list stays empty** except by ADR (ADR-0319 is the only entry-granting act to
  date, and it enumerates class-3 fields **by name, never by pattern or prefix-match**).

---

## §8 — The `./compliance` rule registry

**WHAT IT ALREADY DOES.** `ConstraintEngine`, exported at the `@pryzm/constraint-solver/compliance`
subpath, imported by `apps/editor/src/engine/initDataPlatform.ts:50`. Auto-run is wired to
`StoreEventBus` with an **800 ms debounce and a load-quiet window**, and it is **non-blocking by
construction**. C74 classifies it **ADVISORY** and lists it as one of four components in the repo
doing genuinely real constraint work.

**WHY IT MATTERS TO BIM 3.0.** It is the working example of the ADVISORY strength — a rule evaluated
off the critical path, reported to the user, blocking nothing — and it demonstrates that PRYZM
already does constraint work **without a solver**. That matters, because it is the empirical
argument behind C74 §4.5: **UNPROVEN — no constraint family in this repository has been shown to
require SOLVING.**

**WHAT BIM 3.0 NEEDS FROM IT.** G-INV-2 — each family carrying a declared strength with executable
evidence *at that strength*.

**HOW IT WILL BE EXTENDED.** Its rules get enumerated by a gate (today only its wiring is checked —
an unmapped gate in the register, CO-12); violations become queryable `violates` edges rather than
log lines.

**WHAT MUST NOT BE REPLACED.**
- **`@pryzm/constraint-solver` is two unrelated things sharing a name.** The geometric solver half
  is unreachable from any production user action and always runs `MockSolver`. **The `./compliance`
  half is genuinely wired in production.** Any cleanup of the solver half must not take the
  compliance registry with it (audit §17.1.2).
- **An advisory registry silently becoming blocking is a user-facing behaviour change disguised as
  a refactor** (C74 §2.1).
- **The other three real components are equally protected**: `WallOccupancyStore.canPlace`
  (ENFORCEMENT), `annotationConstraints` (VALIDATION — **the only persisted constraint family in the
  system**, checked and never solved), `StairValidationAuthority` (VALIDATION, in the stair dispatch
  path — but see the duplicate warning: **the tested copy is not the shipped copy**, C74 §2.2, and
  neither may be cited as "the stair rules" without naming which one).

---

## §9 — The honesty idioms — copy them, do not reinvent them

**WHAT IT ALREADY DOES.** PRYZM has already solved "how do you say *I don't know* in a type", in
the non-element domains, five different ways — and C75 §0 Finding 3 is explicit that **the gap is
not knowledge**: the element core was built before this vocabulary existed and was never retrofitted.

| Idiom | What it already does right |
|---|---|
| **`LandBasis`** (`schemas/src/site/zoning/`) | a **branded type that makes a wrong basis unrepresentable** — the strongest form available: not a check, an **impossibility** |
| **`BuildableEnvelope`** (C58/C64) | typed determinations plus a **member-per-cause refusal union** — a refusal that says *which* thing was unknown |
| **`DataConfidence`** (ADR-0280) | confidence **plus an explicit UNKNOWN reason**, so "we don't know" is a value with a cause |
| **`heightProfile`** | a **mandatory** 0..1 confidence + provenance tier — not optional, so it cannot be skipped |
| **`climateProvenance`** | per-field source attribution on a computed dataset |
| **`ProvenanceEdge`** | provenance as a **graph edge** — derivation is a relationship, not a label |
| **`AIArtefact`** | AI output marked as AI output, **structurally** |
| **`SemanticReadRefusal`** | a typed graph-read refusal — the shape the `[]`-conflation sites must move to |
| **The typed junction refusals** | a named refusal per impossible junction, not one generic failure |
| **`SlabFragmentBuilder`'s §REFUSE-NONSIMPLE-SLAB-RING** (ADR-0299 §RECOVERY-MUST-REFUSE) | refuses rather than emitting *"geometry that is wrong but plausible enough to be read as a modelling quirk"* — **twenty files away from the room repair path that does the opposite** |

**WHY IT MATTERS TO BIM 3.0.** Pillar L (honest failure) and pillar H (provenance) are satisfied by
*shapes*, not by effort. Every one of these already exists, ships, and is proven in a domain that is
harder than the element core (real land, real law, real refusals).

**WHAT BIM 3.0 NEEDS FROM IT.** The same shapes at element grain: a five-value provenance type in
`packages/schemas`, typed refusal unions replacing the three `[]`-conflation read paths, and
`UNKNOWN`-with-reason as the default on every new provenance field.

**HOW IT WILL BE EXTENDED.** New provenance lands in `packages/schemas` — **the L0 layer every
consumer already reads** — never in a store, a topology package or a serialiser, which is exactly
why exporters, the renderer and the AI host cannot see the one element provenance that exists today
(C75 §2.4, §4.d).

**WHAT MUST NOT BE REPLACED.**
- **Prefer unrepresentable over checked**, checked over a gate, a gate over a convention. *A
  convention is what `roomSnapshotUtils.ts:156` had* (C75 §2.8).
- **COMPUTED and INFERRED may never be merged** "because both are derived". The distinction between
  *entailed by the inputs* and *plausibly guessed from them* is the entire subject of C75 (§1.2).
- **Do not reinvent the confidence model** — C62 owns it, and provenance is **orthogonal** to it
  (C75 §1.3, §4.h).
- **Do not restate ADR-0319's vocabulary inside C75's, or vice versa** — a second copy becomes a
  rival list (C75 §2.9).

---

## §10 — ADR-0318's store registry — **identity, not construction**

**WHAT IT ALREADY DOES.** `composeRuntime` does not construct element stores and does not receive
them as parameters. It **adopts the module-singleton `storeRegistry` that already existed and was
already populated with the authoritative instances**, and exposes it typed at
`runtime.stores.elements` as a **live view, not a copy**. `engineLauncher`'s existing
`registerAllStores` call registers the same instances it hands to the serializer — *registry
identity ≡ serializer identity, by construction, with zero new wiring* — and the same-instance
probe asserts it rather than assuming it (6/6).

**WHY IT MATTERS TO BIM 3.0.** It closed the root cause under the entire dead-verb class: the
composed runtime **offered nothing authoritative to write**, so V3 was UNPROVABLE-BY-CONSTRUCTION
for 12 of 14 element kinds, and handlers kept being authored against fresh plugin-DTO stores. It is
what makes C70 **A-INV-3** measurable at all: *a mutation that changes a DTO nobody reads is a lie,
not a capability.*

**WHAT BIM 3.0 NEEDS FROM IT.** Per-kind adoption until zero kinds read ABSENT headlessly — wall,
room and slab first, because they gate everything graph-shaped.

**HOW IT WILL BE EXTENDED.** Per kind, each migration PR extending `adr0318.stores.probe.ts` with
that kind's same-instance assertion. That reaches the ideal end state incrementally, each step
provable, without the big-bang wiring change.

**WHAT MUST NOT BE REPLACED.**
- **I-1 — identity, not construction.** `runtime.stores.elements.get(k)`, when defined, **IS** the
  instance the serializer reads. Never a copy, never a rival.
- **I-2 — one registry.** A second registry, or a compose-time `new <X>Store()` for a kind
  `engineLauncher` also constructs, is a **P1 violation of this ADR**. Constructing rivals forks
  state — the plugin-DTO half already demonstrates it.
- **I-3 — honest absence.** A kind absent from the registry reads `undefined`. **No scaffold, no
  empty stand-in** — ABSENT must be loud.
- **`composeRuntime` must not `clear()` or `unregister()` at tearDown** — teardown of an old runtime
  can run *after* a hot-reload successor composes, and clearing would wipe its registrations.
- **The slot deliberately does not invent a uniform write surface.** Commands remain the only
  mutation path (P6).

---

## §11 — The C69 generated verb register

**WHAT IT ALREADY DOES.** `docs/04-reference/API-VERB-REGISTER.md` is **generated**, not authored,
and is backed by `tools/ga-gate/check-verb-register.ts` and `check-verb-liveness.ts`. It grades
every registered verb — LIVE / SHADOWED / UNKNOWN — and the grading is what turned "we have a
command bus" into measurable statements: **lies 3→0, SHADOWED 14→9, LIVE 101→106** across BIM 2.0
C5, each an executed reading.

**WHY IT MATTERS TO BIM 3.0.** It is the only instrument in the repository that answers the
**reachability** question rather than the existence question, for any subsystem. C70 §4.2's rule —
*machinery present ≠ capability reachable* — is enforceable for verbs and for nothing else yet, and
CA-21 read-backs are what make a verb's V3 claim falsifiable.

**WHAT BIM 3.0 NEEDS FROM IT.** The pattern generalised: the graph has **no CA-21 equivalent**, and
that absence is why every EV-04/EV-05 claim is source-level and every writer that exists but is
never reached still reads ✅.

**HOW IT WILL BE EXTENDED.** UNKNOWN rows resolve as ADR-0318 adoption makes them measurable; the
three graph verbs join with conformance rows; a graph-side read-back discipline is built to the same
shape.

**WHAT MUST NOT BE REPLACED.**
- **The register is generated. Do not hand-edit it** — a hand-maintained register is an opinion, and
  C69 §0 catalogues the bench-asserts-its-own-header defect this exists to prevent.
- **UNKNOWN is a real grade and must stay distinguishable from LIVE and from dead.** Collapsing it
  into either direction destroys the instrument.

---

## §12 — Snapshot v3 and `SemanticGraph` persistence

**WHAT IT ALREADY DOES.** A real `ProjectSerializer` / `ProjectLoader` pair. `ProjectSnapshot`
carries `semanticGraph` at schema **v3**, serialized **verbatim, every edge, no filtering**, and
loaded back — with `deserialize` filtering malformed records defensively. Identity now holds across
the round-trip: **17/17 kinds keep id and GUID**, `check-identity-roundtrip` reads **0 CLEAN**, and
the persistence suite reached **0 FAILED** with exclusions enumerated per ADR-0319 and **printed per
row**.

**WHY IT MATTERS TO BIM 3.0.** Pillar B and Golden Chain link 8. It is also the constraint that
makes several tidy-ups forbidden: anything that changes the serialized shape breaks **every
persisted project**.

**WHAT BIM 3.0 NEEDS FROM IT.** I-INV-1/2/3 — rebuild ≡ restored, a **named and shrink-only**
persist-or-lose ledger, and a pre-graph snapshot that loses nothing *silently*.

**HOW IT WILL BE EXTENDED.** `_rebuildSemanticGraph` widens beyond its 5-type slice and is reduced
to **one** copy; the persist-or-lose list becomes a gate input; new fields land **optional with an
`UNKNOWN`-with-reason default so existing snapshots parse unchanged** (C75 §2.5).

**WHAT MUST NOT BE REPLACED.**
- **The serialized shape of `ProjectSnapshot`.** This is the concrete reason the three graphs may
  not be merged and parked relationship types may not be deleted (C71 §4.1, §2.4).
- **ADR-0319's three classes must not be re-flattened.** `id` and `ifcData.guid` are AUTHORITATIVE
  with **no tolerance ever** — the GUID is the IFC round-trip join key, and a re-minted GUID breaks
  correspondence with every previously exported IFC file **invisibly, because both files still
  open**. Counters are DERIVED-BUT-CAUSAL: they may differ across a restore and **never** across an
  undo. Timestamps are DERIVED-INCIDENTAL and excluded **by enumeration, never by pattern**.
- **Do not re-introduce the patch-based-redo prediction.** ADR-0319 predicted redo needed a patch
  layer; **measurement overturned it** — the ratchet was in **undo walking the counter forward**,
  and once `restoreRenderVersion` fixed that (`8552de14`), re-execution satisfied class 2 with
  **15/15 redo rows byte-equal and zero class-2 exclusions**. The struck prediction is preserved in
  the ADR on purpose: *a governance document that silently edits its own predictions cannot be
  audited.*

---

## §13 — The protected list, in one table

For review checklists. Every row is a MUST NOT with a contract citation.

| # | Subsystem | The single sentence | Authority |
|---|---|---|---|
| 1 | The three graphs | may not be merged; snapshot v3 breaks for a naming preference | C71 §4.1, §7.i |
| 2 | Parked relationship types | may not be deleted to tidy the union | C71 §2.4, §7.c |
| 3 | `connectedTo` | may not be overloaded with wall connectivity — it would poison the AI world model with no error anywhere | C71 §3.2 |
| 4 | Bespoke propagation trackers | may not be retired in favour of the generic cascade; **Level 4 rests on them** | C72 §2.4, §8.g |
| 5 | `WallOccupancyStore` | pure-query by design; may not be given storage | audit §17.6, EV-03 §4.2 |
| 6 | `wall.openings[]` | the one opening authority, invariant-checked; do not resurrect a rival | audit §17.6 |
| 7 | `prevState` | may not be reconstructed by re-reading the store — it diffs a value against itself | C72 §3.5 |
| 8 | `WallJunctionRecord.id` | may not become a stored key; it renumbers when walls move | C71 §3.5 |
| 9 | `joinedTo` | not `connectedTo`, and **not** `connectsTo` — the near-miss name is worse | C71 §3.3 |
| 10 | Refusals naming both numbers | may not be softened into a clamp, a fallback, or an empty result | C73 §4.3 |
| 11 | Deterministic generation engines | need no change to meet the target; the zero-token property is to be kept and tested | C70 §1.3, capability model §12 |
| 12 | Certification floors | may never be lowered to go green — identical in effect to deleting the gate | C70 §5.3 |
| 13 | The exit-code contract | one implementation; a gate with its own is a violation | C70 §5.1 |
| 14 | Paid debt | leaves the ledger in the commit that pays it; a stale entry exits **3** | C70 §5.4 |
| 15 | The empty tolerance list | stays empty except by ADR, enumerated by name | ADR-0319 |
| 16 | `./compliance` registry | must not be taken down with the solver half of the same package | audit §17.1.2 |
| 17 | Real constraint components | an enforcement gate may not silently become advisory | C74 §2.1 |
| 18 | Honesty idioms | copy them; unrepresentable > checked > gated > convention | C75 §2.8 |
| 19 | COMPUTED vs INFERRED | may never be merged | C75 §1.2 |
| 20 | ADR-0318 registry | identity not construction; one registry; **honest absence**, no stand-ins | ADR-0318 I-1/I-2/I-3 |
| 21 | The verb register | generated, never hand-edited; UNKNOWN stays a distinct grade | C69 |
| 22 | `ProjectSnapshot`'s serialized shape | the concrete constraint behind rows 1 and 2 | C05/C47, C71 §4.1 |
| 23 | ADR-0319's three field classes | may not be re-flattened; the GUID has no tolerance, ever | ADR-0319 |

---

## §14 — What this document does NOT establish

1. **It performs no measurement.** Every claim is carried from the contracts, the ADRs, EV-03/04/05,
   audit §17, or the BIM 2.0 close-out. Presence of the named symbols was spot-checked at HEAD
   (`planOpeningRefit`, `SemanticReadRefusal`, `IfcRelSpaceBoundary`, `LandBasis`,
   `BuildableEnvelope`, `WallJunctionRecord`, `clearGraphAuthoritative`, `RECONCILABLE_TYPES`,
   `restoreRenderVersion`, and the certification suite's contents); **behaviour was not re-executed.**
2. **"Protected" does not mean "correct".** §2's own caveat is the standing example: the bespoke
   propagation layer is the most protected subsystem here and **the least instrumented** — no gate
   asserts it still reaches its pairs. Protection is a statement about **replacement cost**, not
   about proven behaviour.
3. **It does not rank.** The order of sections follows the founder's directive, not importance.
4. **It does not authorise anything.** A subsystem being protected does not make its gaps closed;
   read the gap register for those, and the contract for the invariant.
