# C78 — The universal relationship & consequence contract

> **Stamp**: 2026-08-12 · **Status**: CANONICAL
> **Scope**: the rule that binds **every** element to **every** related element — that a consequential operation on A either carries B through the full safe-mode lifecycle, or returns **UNDETERMINED with a typed reason**. Owns the seventeen axes A–Q every relationship must answer (§2–§18), the **consolidated typed refusal vocabulary** (§8), the **three-legal-answers rule** for the per-relationship question, and the rule that **the composition, not the contract type, is what violates the founder's rule today**. It does **not** own the relationship vocabulary (that is [C71](C71-GRAPH-AND-TOPOLOGY.md)), the propagation protocol ([C72](C72-PROPAGATION-AND-PREVSTATE.md)), what a command is (C03/C16), or what BIM 3.0 is as a whole ([C70](C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md)).
> **Key principle**: *BIM 3.0 is not 10/10 when every element happens to have a cascade implementation. It is 10/10 when the ARCHITECTURE GUARANTEES that every supported consequential operation is either safely plan-bound or explicitly returns UNDETERMINED — never silently does something else.* (founder, 2026-08-12)
> **Authority**: subordinate to `STR-03-engineering-vision.md` / `STR-04-architecture.md` and to [C70](C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md), whose pillar-C/F/L invariants this contract generalises. Subordinate to [**ADR-0322**](../adrs/ADR-0322-one-consequence-contract.md) (one consequence contract) and to **STR-06** (the reasoning-loop doctrine). **Defers to [C71](C71-GRAPH-AND-TOPOLOGY.md) on the relationship VOCABULARY and the six per-edge semantics — C78 restates none of them and may not mint a rival edge family.** Defers to [C72](C72-PROPAGATION-AND-PREVSTATE.md) on cascade wiring and `prevState`. Peers with **C03**/**C16** (commands), **C05**/**C47** (persistence), **C08**/**C66** (concurrency), **C73** (determinism and epsilon), **C74** (constraint strength), **C75** (provenance), **C65** (element types), **C69** (the verb enumeration this contract must eventually cover). Supersedes nothing.
> **Relationship to C70.** C70 §3 states the Golden Chain for **a capability**, and its worked instance in this repository is the wall-move chain. **C78 is the generalisation of that chain across the element × relationship product.** C70 asks *"does this capability hold at every link?"*; C78 asks *"for every (element, related element, operation) triple, is the answer DETERMINED-affected, DETERMINED-unaffected, or UNDETERMINED with a reason?"* Where C70 §3.2's no-partial-credit rule applies along a chain, C78 §19.1 applies the same rule across the product. Neither may be satisfied by the other.
> **Evidence appendices** (READ-ONLY, cited never restated): [`BIM30-PHASE0-ELEMENT-INVENTORY.md`](../../04-reference/BIM30-PHASE0-ELEMENT-INVENTORY.md) (0A — elements, stores, verbs) · [`BIM30-PHASE0-RELATIONSHIP-INVENTORY.md`](../../04-reference/BIM30-PHASE0-RELATIONSHIP-INVENTORY.md) (0B — the 35 relationships) · [`BIM30-PHASE0-CONSEQUENCE-MACHINERY.md`](../../04-reference/BIM30-PHASE0-CONSEQUENCE-MACHINERY.md) (0C — the machinery and the couplings) · [`BIM30-PHASE0-CROSSCUTTING-INVENTORY.md`](../../04-reference/BIM30-PHASE0-CROSSCUTTING-INVENTORY.md) (0D — constraints, provenance, undo, concurrency, persistence; gaps G-1…G-16).
> **Gate**: no gate decides C78 as a whole today. §20 names one gate per invariant; **every one of them is a NAMED GAP at stamp time** and their honest status is UNPROVEN, per C70 §7.1 — never an inherited green.
> **Changelog**: 2026-08-12 — created as Phase 1 of the founder's universal safe-mode program, on the Phase 0 measurements of the same day. Phase 3 decides the HOW; this contract is the WHAT and the WHY, and specifies no implementation.

---

## §0 — Why this contract exists: eight measured failures

Every item below was measured on 2026-08-12 at HEAD `2b636854`, is cited to file:line, and is
recorded in a Phase 0 appendix. None is an opinion, and none is a prediction.

**§0.a — The L1 contract is already universal; the composition is what is not.**
`packages/command-bus/src/consequence.ts` exports **36 types, 36 element-agnostic, 0 wall-named**;
`ConsequencePlanner<TCommand, TPlan>` (`:654–656`) is fully parametric with `TCommand`
unconstrained (0C §1, OBSERVATION 2). **The foundation is sound.** Every wall coupling measured
lives strictly *above* that line, in L7 composition. This is the single most consequential fact in
this contract, and it sets its posture: C78 does not ask for a new type system. It asks that the
one that exists be *reached*.

**§0.b — Real coverage is one verb of 323.** The register measures **323 unique verbs**, of which
**100 are consequential** (31 create + 27 delete + 18 move + 12 update + 12 batch; 0A §3.2).
Exactly one — `wall.move` — is served by a composed planner (0A §3.3). That is **1 % of the
consequential surface**, and the other 99 % dispatch with no preview, no policy, and no report.

**§0.c — A second planner is authored and unreachable.** `WallCreateConsequencePlanner` is 956
LOC, factory-wrapped, and carries 43 test call-sites; `rg 'createWallCreateConsequencePlanner'`
returns **one hit — the composition file's own header comment** (0C OBSERVATION 7). It is
registered in no preview map, no execution map, no confirmation map. *Existence is not
reachability*, and a census that counts planners rather than composed planners overstates coverage
by 100 %.

**§0.d — Three couplings, and only three, hold the system to one family.**
`ReadonlyMap<string, ConsequencePlanner<WallMoveCommand>>` at `ConsequencePreviewService.ts:103`
and `ConsequenceExecutionService.ts:92` (the *value* is hard-typed while the *key* is generic);
`normalizeToWallMove` at `ConsequencePreviewService.ts:81–93`, which is the system's **only**
verb→semantic map and knows exactly two verbs; and
`MovePlanToolHandler.ts:243`'s `if (this._targetType !== 'wall') return;`, which is why ≥11
element families move through the one plan-tool handler with no consequence preview at all
(0C §3.9, OBSERVATION 6). `confirmationFlowComposition.ts:67` launders the map through
`as unknown as ReadonlyMap<string, ConsequencePlanner<never>>` — the double cast is the two
registries disagreeing about their own type in production.

**§0.e — `preview()` returns bare `null` for four distinct causes, two of them semantic
opposites.** `ConsequencePreviewService.ts:107–116` has two `return null` statements reached from
four structurally different failures: N1 *no family recognises this verb*, N2/N3 *the caller's
payload is malformed*, N4 *the planner exists but is not composed here*. **N1 and N4 are
opposites** — "no such family" versus "the family exists, unwired" — and they are the same value.
The overlay's `if (!plan) return;` (`ConsequencePreviewOverlay.ts:202`) swallows a **fifth**: a
caught throw at `:196` returns identically (0C §6). The declared contract for that `null`
(`:57–58`) describes **N4 only**.

**§0.f — Two reasons are encoded as fake hashes because no typed reason existed.**
`ConsequenceExecutionService.ts:239` writes the sentinel string
`'UNVERIFIABLE:no-planner-for-type'` into two fields that everywhere else hold FNV-1a hashes; a
consumer comparing hashes sees a mismatch and reports `PLAN_STALE`, when the actual fact is *no
planner exists for this family*. `ConfirmationFlow.ts:269–271` mints `'UNPLANNABLE'` the same way
(0C OBSERVATION 5). Meanwhile `UNSUPPORTED_ELEMENT_TYPE` — the contract member minted at
`consequence.ts:67` for exactly this refusal — has **zero production producers**. The improvisation
and the unused member are the same defect seen from two ends.

**§0.g — Twelve of fourteen dependency-naming fields are honoured by nothing, and two of them
are structurally always empty.** `boundingWallIds` is **hardcoded `[]`** on both floor
(`CreateFloorCommand.ts:231`) and ceiling (`CreateCeilingCommand.ts:191`); `hostRoomId`,
`coveredRoomIds`, lighting `roomId` and `hostId`, roof and pool `parentId`, stair/lift
`baseLevelId`/`topLevelId` all name a dependency nothing re-derives (0B §4.1). Only `hostSlabId`
on floors and `hostId` on slab sketch edges are honoured. **A field that names a dependency and is
always empty is worse than no field**: it makes "no bounding walls" and "we never computed them"
the same value — the §CONTEXT-DATA-HONESTY shape, in a schema.

**§0.h — Nine indexes exist; exactly one can refuse.** Of 35 measured relationships, 18 have no
index or no reactor, and of the nine dependency indexes only `DependencyResolver.getAffected`
returns `determined | cannot-determine` (0B §1, §3). Every other index answers *"nothing depends on
this"* and *"I have no entry for this"* with the same value.

> **§0.1 — MUST.** No claim of universal safe-mode coverage may be made from source-reading.
> C70 §0.1 binds this contract: **BY-READ is never an award**, and a planner that exists but is
> not composed is **not** coverage (§0.c is the standing example).

> **§0.2 — MUST NOT.** No section of this contract, and no document citing it, may restate a
> measured count as if it were stable. The counts above carry their measurement date and their
> source; cite the appendix or the gate, never this page. Where evidence is absent the correct
> word is **UNPROVEN** (C70 §2.2) — never a blank, never an optimistic default.

> **§0.3 — the template already in the tree. MUST.**
> `packages/persistence-client/src/loader/rebuildSemanticGraph.ts` **already implements the
> founder's rule**, and C78 is generalising something that works rather than inventing doctrine.
> It reconstructs eight edge families from authoritative element state; it **refuses to invent
> `sitsOn` for walls, doors, windows and curtain-walls** because no creation writer emits it for
> them (`:63–70` — *"emitting it here would INVENT an edge the live model never has"*); and it
> returns `connectedByLift` and `contains` **by name** in
> `RebuildSemanticGraphResult.unreconstructable` (`:203–215`) so the load reports the loss.
> **Every §G refusal in this contract is that behaviour, lifted to the whole product.** Any
> implementation that finds itself designing a new refusal doctrine has not read this file.
>
> ⚠ And the caution that comes with it: the same file's `boundedBy` arm is **silently broken** —
> `:131` reads `room.boundary?.boundingWallIds`, a field that lives at top level
> (`RoomDataSchema.ts:165–166`), so three families produce zero edges and **none is named in
> `unreconstructable`** (0D §5.3, G-1). *The template is the pattern, not a warrant that the
> pattern is correctly applied.*

---

## §1 — The governing rule

> **§1.1 — the founder's rule, binding. MUST.** For every element A, every element B related to
> A, and every consequential operation on A, the system must **either**
>
> **(1)** carry B through the full safe-mode lifecycle — discovery → prediction → plan →
> confirmation policy → plan-bound execution → reconciliation → report — **or**
> **(2)** explicitly return **UNDETERMINED with a typed reason from §8's closed union.**
>
> There is no third outcome.

> **§1.2 — the four MUST NOTs, stated as the founder stated them.**
> **(a)** **NEVER silently ignore a known dependency.** A dependency is *known* the moment a
> field names it, an index holds it, or a C71 edge family declares it — not only when a reactor
> exists (§0.g).
> **(b)** **NEVER return `[]`, `null`, `0` or `undefined` when the system cannot determine the
> answer.** This is C70 L-INV-1 applied to the consequence path, where it is currently violated at
> the entry point (§0.e).
> **(c)** **NEVER execute a different algorithm from the one previewed.** The plan the user
> approved and the plan the execution binds to are one artefact (§10, §11).
> **(d)** **NEVER bypass the consequence system through an observer** where safe-mode guarantees
> are required. An observer that mutates authoritative state outside the plan makes the report
> false without making the gate red (§17).

> **§1.3 — the per-relationship contract question. MUST.** Every relationship in the C71
> vocabulary, and every relationship carried by a store field, must answer exactly one question:
>
> > **"If element A changes, how does the system determine whether B is affected?"**
>
> and the answer must be exactly one of **three legal values**:
>
> | Answer | Meaning | What it obliges |
> |---|---|---|
> | **DETERMINED-affected** | B is affected; the affected set is computed | B enters the plan; its predicted transition is stated (§7) |
> | **DETERMINED-unaffected** | B is provably not affected, **from data the system holds** | nothing — but the determination must be *derivable*, not assumed |
> | **UNDETERMINED + reason** | the system cannot tell | a typed §8 reason, surfaced in the plan and in the report |

> **§1.4 — MUST NOT. Never infer "unaffected" from missing data.** An empty index, an absent
> field, a `?? []`, an unregistered planner and a caught exception are **UNDETERMINED**, never
> DETERMINED-unaffected. This is the single most-violated clause in the measured estate: `[]` from
> `room.boundary?.boundingWallIds` (§0.3), `null` from `preview()` (§0.e), and the eight indexes
> that cannot refuse (§0.h) are each an instance.

> **§1.5 — MUST. Scope of "consequential".** An operation is **consequential** if it can change
> another element's geometry, topology, validity, identity or existence. The measured
> consequential set is the 100 verbs of 0A §3.2 (create · delete · move · update · batch). A verb
> outside that set is **out of scope by classification**, and the classification is itself a
> declaration that must be reviewable — not an omission. *Silence is not scoping.*

---

## §2 — A · Element identity

> **§2.1 — MUST.** Every element that can appear in a plan is addressed by a **stable, opaque
> `ElementId`**. `consequence.ts:41` already types this as `string` and is correct; the identity
> rules themselves are C70 B-INV-1/2/3's, and C78 restates none of them.

> **§2.2 — MUST NOT. An element id may not encode its kind, and no code may infer a kind by
> parsing one.** The measured cost of the alternative is on the record:
> `confirmationPolicy.ts:105` prefix-tests ids against `HOSTED_PREFIXES = ['door','window','opening']`,
> and `:96–103` records that `'w_'` and `'d_'` were **removed** after the certification gate caught
> `'w_'` matching every WALL fixture and making every plan `recommended`. The file states its own
> exit condition at `:102–103`: *"When the contract grows a kind-carrying change set, this
> function reads that instead and the constant goes away."*

> **§2.3 — MUST.** A `ConsequencePlan`'s change set must become **kind-carrying**. Measured today:
> `ConsequencePlan.changed` is `ElementSet = readonly string[]` (`consequence.ts:334`, `:44`) — **no
> kind is carried anywhere on the plan** (0C OBSERVATION 9). Until it is, every kind-sensitive
> policy in the system is either a prefix heuristic or absent, and both are declared defects.
> *Exit condition:* `HOSTED_PREFIXES` is deleted in the commit that lands the kind-carrying change
> set.

> **§2.4 — MUST.** Where the plan's `changed` set is kind-blind, that is a **declared degradation**
> whose direction must be the safe one. `confirmationPolicy.ts:85–103` is the model: a miss in
> `changes_hosted_elements` costs a *nudge* (it only ever raises `none → recommended`), never a
> blocker, because blockers come from `refused` and `violationsCreated`, which are
> kind-independent. **A kind-blind heuristic that could lower a requirement is forbidden.**

---

## §3 — B · Relationship identity

> **§3.1 — MUST. C71 owns the vocabulary; C78 owns nothing of it.** The relationship families,
> their REQUIRED/PARKED classification, the six per-edge semantics (writer · reader · persistence ·
> rebuild disposition · invalidation · deletion), the unparking rule and the addition rule are
> [C71](C71-GRAPH-AND-TOPOLOGY.md) §1–§2. **C78 may not restate, extend, re-classify or shadow
> them**, and a C78-driven implementation that needs a new edge family must go through C71 §2.6 —
> one PR carrying writer, typed reader, rebuild disposition and delete behaviour together.

> **§3.2 — MUST.** A relationship is **in C78's scope** if it is either (a) a C71 vocabulary
> member, **or** (b) a *store-field relationship*: a field on one element naming another element's
> id, whether or not any code reacts to it. Measured: 26 C71 members plus 14 dependency-naming
> fields, of which **12 are honoured by nothing** (0B §2, §4.1). C71 governs (a); **C78 exists
> largely because of (b)** — the relationships that are real to the user and absent from the graph.

> **§3.3 — MUST. Wire-or-delete applies to store-field relationships.** Under
> [C72](C72-PROPAGATION-AND-PREVSTATE.md) §2.1's rule, a field naming a dependency must reach one
> of two terminal states: **honoured** (something re-derives the dependent when the source changes,
> or a §8 refusal is returned) or **removed** (field, writer and reader deleted in one commit).
> `boundingWallIds: []` on floor and ceiling is the standing example of the third, forbidden state
> (§0.g, 0B OPEN QUESTION 3): *a field that names a dependency and is structurally always empty
> makes "none" and "never computed" the same value.*

> **§3.4 — MUST NOT.** No relationship may be inferred from spatial coincidence or from a type
> name. The Phase 0B inventory states this as its own method (`0B §0`) and C78 adopts it as a
> normative rule: *a field named `roomId` is a relationship only where code reads it, and whether
> anything reacts is a separate, separately-measured fact.*

---

## §4 — C · Relationship direction

> **§4.1 — MUST.** Every relationship declares its **direction of consequence**, which is a
> distinct fact from the direction of the edge. The three cases, all measured in the estate:
>
> | Case | Meaning | Measured instance |
> |---|---|---|
> | **forward-only** | A changing affects B; B changing does not affect A | slab → floor-finish elevation (`FloorSlabBindingHandler.ts:43–44`) |
> | **symmetric** | either endpoint changing affects the other | wall ↔ wall `joinedTo` (`WallRebuildCoordinator.ts:183`); room ↔ room `adjacentTo` |
> | **inverse-required** | the query is only answerable from the reverse index | wall → door: the plan needs `wallId → Set<doorId>` (`DoorDependencyTracker.ts:32,44`), not `doorId → wallId` |

> **§4.2 — MUST.** Consequence discovery reads the direction it needs. A forward-only edge
> traversed backwards, or a relationship held only in the direction the query does not need, is
> **`NO_DEPENDENCY_INDEX`** (§8) — never an empty result. `LightingStore.getAllForRoom`
> (`LightingStore.ts:52`) is the measured shape of this: a **forward** query exists, the room →
> lighting *reaction* does not, and nothing subscribes (0B §1A row 11).

> **§4.3 — MUST NOT.** A write-only relationship may not be counted as coverage in any C78 status
> document. Measured write-only families: `hostedBy`, `sitsOn` (18 writers, **zero typed
> readers**), `connectedByStair`, `connectedByLift`, `decidedBy` (0B §2.1, §2.3). C71 §1.3 already
> rules that an untyped enumeration is not a reader; C78 adds that **an unread edge cannot
> determine a consequence**, so a family in this state answers UNDETERMINED by construction and
> must say so.

---

## §5 — D · Dependency discovery

> **§5.1 — MUST.** For every (element kind, operation) pair in scope (§1.5), the system must be
> able to enumerate candidate dependents **or** refuse. The enumeration must come from a *recorded*
> relationship — an index, a graph edge, or a field — never from a re-scan that could silently
> return fewer results than exist.

> **§5.2 — MUST. Every dependency index must be able to refuse.** Measured: nine indexes exist and
> **exactly one** can (`DependencyResolver.getAffected` → `{status: 'determined' | 'cannot-determine', reason}`,
> `DependencyResolver.ts:91–93, 311–338`; 0B §3). The other eight return an empty set for both
> "nothing depends on this" and "I hold no entry for this". *Exit condition:* every index in the
> §3.2 scope returns a determination shape, and 0B OPEN QUESTION 6 — *should the `AffectedSet`
> shape be lifted to a shared contract every tracker implements?* — is answered by an ADR rather
> than by each tracker deciding privately.

> **§5.3 — MUST.** Discovery must state its **completeness**, not only its contents. A discovery
> that traversed 2 of 5 relationship types must say so; the measured shape is
> `initDependencyCascade.ts:59`, which routes exactly `sitsOn` and `supports` and `continue`s past
> every other type — leaving **19 of 26 declared types record-only** (0B §3.1). Routing two types
> is a defensible decision (C72 §2.4 explains why routing the host/room families here would
> double-rebuild); **not reporting that only two were routed is not.**

> **§5.4 — MUST NOT.** Discovery may not silently narrow by element kind. `MovePlanToolHandler.ts:243`
> — `if (this._targetType !== 'wall') return;` — is the measured instance: ten-plus families move
> through that handler and receive no discovery at all, with no record that discovery was skipped
> (0C OBSERVATION 6). **Skipping discovery is `UNSUPPORTED_ELEMENT_TYPE`, and it must be
> emitted, not returned as silence.**

> **§5.5 — MUST.** **Level-global and aggregate dependencies are first-class**, and a per-element
> edge is the wrong shape for them. Measured: five constraint families
> (`FIRE_COMPARTMENT_AREA`, `MEANS_OF_ESCAPE_COUNT`, `ROOM_MAX_TRAVEL_DISTANCE`,
> `LIFT_ADJACENT_LOBBY`, `PLUMBING_ZONE`) take the LEVEL as subject or scan every room on it, so
> retyping ONE room to `stairwell` flips verdicts for **every** room on the floor (0D §1.4 shape 2,
> G-11). A discovery model that can only express element→element edges must return UNDETERMINED for
> these, not an empty set.

> **§5.6 — MUST.** **Cache-mediated dependencies are dependencies.** Five further families read
> `window.physicsEngine.cache` keyed by `room.id`, with no recorded edge back to the elements that
> produced the entry; `DAYLIGHT_HABITABLE` and `THERMAL_GLAZING_OVERHEATING` are physically
> functions of window/glazing state and the window→room dependency is invisible (0D §1.4 shape 3,
> G-10). A dependency laundered through a cache is `STALE_DERIVED_STATE` at best and must be
> declared as such.

---

## §6 — E · Dependency freshness

> **§6.1 — MUST.** A plan states the **state it was computed against**, and execution verifies
> that state is still current (§11). The mechanism exists — `PlanStaleRefusal`
> (`consequence.ts:565–575`) carries `kind: 'PLAN_STALE'`, four hashes, and the stale plan itself
> as evidence — and C78 requires it be reached on every family, not one.

> **§6.2 — MUST. Derived state that is known stale is UNDETERMINED, never a computed answer.**
> `STALE_DERIVED_STATE` (`consequence.ts:68`) exists precisely for this and has ~9 producing sites
> (0C §2.1). The rule it encodes: *the derived state this branch reads is known out-of-date, so an
> answer would be a guess.*

> **§6.3 — MUST. Move is a distinct lifecycle phase, and it is the one the estate has never
> measured.** C71 §1.4 records that semantic 5 (invalidation on move) is **UNPROVEN for every
> family**, and `check-graph-write-coverage` prints *"move-time invalidation — NO ARM. UNPROVEN for
> every family"* on every run (0B §7.1). Delete is rare and load is idempotent; **move is the
> dominant edit in the product.** A relationship scoring present on all four measured obligations
> (writer/reader/rebuild/delete) can still be completely stale after a wall move.

> **§6.4 — MUST.** Per relationship, "A moved" must resolve to exactly one of four dispositions,
> declared in source and decidable by a program: **(i)** B's geometry re-derives · **(ii)** B's
> relationship is re-evaluated and may break · **(iii)** B is unaffected **by construction** ·
> **(iv)** UNDETERMINED with a §8 reason. (0B §7.3 states this as the question Phase 1 must
> decide; this clause is the answer's required shape, not the per-family assignment, which is
> Phase 2 work.)

> **§6.5 — MUST.** There must be **one shared definition of "changed enough to matter"**.
> Measured: each bespoke tracker implements its own predicate — e.g.
> `DoorDependencyTracker._wallGeometryChanged` (`DoorDependencyTracker.ts:112–120`) compares
> `height`, `thickness` and both `baseLine` endpoints — *"duplicated per family and shared by
> nothing"* (0B §7.2). Until one exists, each family's notion of a material change is private and
> untestable, and two families can disagree about whether the same edit happened.

> **§6.6 — MUST NOT.** A level-elevation change may not be treated as element-local. Measured:
> **15 families carry `levelId`; exactly ONE reacts** to `bim-level-updated` — floor finishes, via
> the single listener at `FloorSlabBindingHandler.ts:45` against emitters at
> `UpdateLevelCommand.ts:88,110` (0B §4.2). Everything else keeps its old world-Y until an
> unrelated rebuild happens to touch it, and nothing anywhere reports it. **UNPROVEN, and worse
> than unimplemented:** `ChatCommandClassification.ts:153` records level re-stack semantics as
> *undefined*, so there is not yet a target behaviour to test against (0B OPEN QUESTION 2). This
> clause forbids the silent-stale outcome; it does not decide the semantics.

---

## §7 — F · Prediction

> **§7.1 — MUST.** Where a dependent is DETERMINED-affected, the plan states **what it will become**
> — not merely that it will change. The contract already carries the vocabulary:
> `MetricTransition` (`consequence.ts:296–303`), `PredictedGeometry` (`:255–268`), and the
> `*Undetermined` triple on `ConsequenceReport` (`:477`, `:498`, `:519`).

> **§7.2 — MUST. A prediction that cannot be made is named, not omitted.** The
> `RoomPredictionRefusal` union (`predictRoomGeometry.ts:110–128`) is the estate's best existing
> instance: eight distinct, closed, geometrically meaningful refusals. §8 governs how they reach
> the plan.

> **§7.3 — UNPROVEN / OPEN. `PredictedGeometry` is generic in name and room-shaped in structure.**
> Measured: `PredictedVertex` is `{x, z}` with no `y` (`:234–237`); `boundingBox` is a 2-D AABB
> (`:262–267`); the only scalars are `area`, `perimeter`, `centroid` (0C OBSERVATION 1). A predicted
> slab fits; a predicted **stair run, roof plane, column or wall solid does not** — there is no
> field that can carry a height, an elevation, a normal or a solid. **This contract does not decide
> whether the universal predicted-geometry type is this one, a superset, or a per-family family of
> types** (0C OPEN QUESTION 3). It decides only that a family whose geometry cannot be expressed
> must return UNDETERMINED rather than a plausible 2-D projection of a 3-D change.

> **§7.4 — MUST.** `MetricName` (`:187–196`) is **supply-bound by declaration**: its header states
> it enumerates only what a planner in this repo can compute today, and it grows per family by
> contract edit. A family needing a metric outside the union **adds it to the union**; it may not
> encode the metric as prose in a `detail` string.

> **§7.5 — MUST. Preview is pure.** The plan-producing path mutates nothing. This is
> G-REASON-01, gated by `check-preview-purity` — today wall-scoped by fixture
> (`WallMoveConsequencePlanner` imported at `:32`, `wall-1` minted at `:52`; 0C §4.1).

> **§7.6 — MUST. Planning is deterministic:** same state + same command ⇒ byte-equal plan
> (`consequence.ts:651–653`, G-REASON-02). ⚠ **Measured gap:** G-REASON-01, 03, 04, 05 and 06 all
> have gate files in `certify.ts:392`; **G-REASON-02 has none** (0C OPEN QUESTION 6). It is cited
> by six source files as the reason for `stableStringify`, sorted element sets and a deterministic
> `planId`, and it is *the invariant a second planner is most likely to break silently.* Its status
> is **UNPROVEN**, and §20 names its gate as a NAMED GAP.

---

## §8 — G · UNDETERMINED semantics — **the heart of this contract**

Phase 0C measured **23 distinct reason values across 6 modules in 5 naming conventions**
(SCREAMING_SNAKE, lowercase-kebab, `kind` tags, a free-text `reason`, and an ad-hoc hash sentinel),
of which **7 of 8 room-prediction refusals lossily collapse to `STALE_DERIVED_STATE` through a
single ternary** at `WallMoveConsequencePlanner.ts:292`. A consumer branching on `reason` cannot
distinguish *a room collapsed to zero area* from *a cache is stale*.

### §8.1 — The consolidated union

> **§8.1 — MUST.** There is **ONE closed union** of typed undetermined reasons on the consequence
> path. It is SCREAMING_SNAKE. Every member below either exists in the contract today (four do) or
> is minted here to receive a value the estate is currently improvising. **The union is closed;
> adding a member is a contract edit, and the per-family specificity that does not fit belongs in
> §8.3's sub-reason, never in prose.**

| # | Member | Status | Meaning | Measured basis |
|---|---|---|---|---|
| 1 | `NO_DEPENDENCY_INDEX` | **exists** (`consequence.ts:65`) | The substrate that would answer this has not landed. `detail` names the roadmap phase. | 4 producing sites |
| 2 | `ENGINE_NOT_AVAILABLE` | **exists** (`:66`) | The engine exists but is not reachable in this runtime — not composed, not installed, boot order. | ~14 producing sites |
| 3 | `UNSUPPORTED_ELEMENT_TYPE` | **exists, 0 producers** (`:67`) | No planner has a rule for this element kind / verb. | **zero production producers** (0C OBSERVATION 3) |
| 4 | `STALE_DERIVED_STATE` | **exists** (`:68`) | The derived state this branch reads is known out-of-date; an answer would be a guess. | ~9 producing sites |
| 5 | `INVALID_REQUEST` | **NEW** | The *caller's* payload is malformed or fails its schema. | N2/N3 (§0.e). All four existing members describe the **system's capability**; none describes the **request** (0C OPEN QUESTION 1) |
| 6 | `GEOMETRY_UNPREDICTABLE` | **NEW** | The prediction is geometrically impossible or out of scope for the predictor. | receives 6 of the 8 `RoomPredictionRefusal` members (§8.2) |
| 7 | `TOPOLOGY_CHANGE_POSSIBLE` | **promoted** from `predictRoomGeometry.ts:128` | The operation may SPLIT or MERGE the dependent; only re-detection — itself a mutation — could resolve it. | today lossily mapped to `NO_DEPENDENCY_INDEX` |
| 8 | `RELATIONSHIP_NOT_RECORDED` | **NEW** | The relationship is known to exist as a concept but is not written by any producer, so nothing can be traversed. | `contains` (0 writers), `partOf` (0 writers), `boundingWallIds: []` (§0.g) |
| 9 | `RELATIONSHIP_NOT_READABLE` | **NEW** | The edge is written but has no typed reader / no reverse index in the required direction (§4.2, §4.3). | `hostedBy`, `sitsOn` (18 writers / 0 readers), `connectedByStair`, `connectedByLift`, `decidedBy` |
| 10 | `AGGREGATE_SCOPE_UNSUPPORTED` | **NEW** | The dependency is level-global or aggregate; no per-element edge can express it. | the five level-global constraint families (§5.5, G-11) |
| 11 | `PLANNER_THREW` | **NEW** | The planner raised; the failure is caught and reported rather than swallowed. | today the overlay's caught throw at `ConsequencePreviewOverlay.ts:196–199` is indistinguishable from four other causes (§0.e) |

> **§8.2 — MUST. The 23→11 mapping, stated per source value, including what loses information
> today.** A member marked ⚠ is one whose *current* handling is lossy; the third column is the
> target, not the present.

| Source value (measured) | Home module | Today | Target member | Note |
|---|---|---|---|---|
| `NO_DEPENDENCY_INDEX` | command-bus L1 | native | `NO_DEPENDENCY_INDEX` | unchanged |
| `ENGINE_NOT_AVAILABLE` | command-bus L1 | native | `ENGINE_NOT_AVAILABLE` | unchanged |
| `UNSUPPORTED_ELEMENT_TYPE` | command-bus L1 | native, **0 producers** | `UNSUPPORTED_ELEMENT_TYPE` | must acquire producers at N1 and at `MovePlanToolHandler.ts:243` |
| `STALE_DERIVED_STATE` | command-bus L1 | native | `STALE_DERIVED_STATE` | unchanged, but **narrowed** — it stops being the default sink |
| `NO_WALL_LINKAGE` | room-topology L2 | ⚠ → `STALE_DERIVED_STATE` | `RELATIONSHIP_NOT_RECORDED` + sub-reason | **loses information today** |
| `MISSING_BOUNDING_WALL` | room-topology L2 | ⚠ → `STALE_DERIVED_STATE` | `RELATIONSHIP_NOT_RECORDED` + sub-reason | **loses information today** |
| `CURVED_WALL_UNSUPPORTED` | room-topology L2 | ⚠ → `STALE_DERIVED_STATE` | `GEOMETRY_UNPREDICTABLE` + sub-reason | **loses information today** |
| `DEGENERATE_BOUNDARY` | room-topology L2 | ⚠ → `STALE_DERIVED_STATE` | `GEOMETRY_UNPREDICTABLE` + sub-reason | **loses information today** |
| `OPEN_LOOP` | room-topology L2 | ⚠ → `STALE_DERIVED_STATE` | `GEOMETRY_UNPREDICTABLE` + sub-reason | **loses information today** |
| `SELF_INTERSECTING` | room-topology L2 | ⚠ → `STALE_DERIVED_STATE` | `GEOMETRY_UNPREDICTABLE` + sub-reason | **loses information today** |
| `COLLAPSED` | room-topology L2 | ⚠ → `STALE_DERIVED_STATE` | `GEOMETRY_UNPREDICTABLE` + sub-reason | **loses information today** — a room at zero area prints the same value as "a cache is stale" |
| `TOPOLOGY_CHANGE_POSSIBLE` | room-topology L2 | ⚠ → `NO_DEPENDENCY_INDEX` | `TOPOLOGY_CHANGE_POSSIBLE` | **promoted to L1** — it is not an index gap, it is a determinate statement about topology |
| `graph-unavailable` | ai-host L2 | never reaches the plan | `ENGINE_NOT_AVAILABLE` | convention change kebab → SCREAM; the graph channel keeps its own union, and the **bridge** is what §8.5 governs |
| `unknown-element` | ai-host L2 | never reaches the plan | `INVALID_REQUEST` | the id names nothing |
| `unsupported-relationship` | ai-host L2 | never reaches the plan | `UNSUPPORTED_ELEMENT_TYPE` | near-duplicate of the L1 member's intent with no typed bridge today |
| `wall-unknown-to-joinedTo-writer` | core-app-model L2 | ⚠ prose in `detail` | `RELATIONSHIP_NOT_RECORDED` + sub-reason | **the only reason value in the estate that names a wall in its identifier** — must lose the family name |
| `producer-not-instrumented` | schemas L0 | separate channel (`unknownReason`) | **stays C75's** — not imported | C75 owns provenance-unknown; C78 may not absorb it (§8.6) |
| `PLAN_STALE` | command-bus L1 | `kind` tag, execution arm | **stays a `kind`** | §8.4 — a plan-binding outcome, not an undetermined impact |
| `NO_PLAN_SUPPLIED` | command-bus L1 | `PredictionAbsence.reason` | **stays a `kind`** | §8.4 |
| `APPROVAL_STALE` | apps/editor L7 | `kind` tag, consent arm | **stays a `kind`** | §8.4 |
| `APPROVAL_UNKNOWN_PLAN` | apps/editor L7 | `kind` tag, consent arm | **stays a `kind`** | §8.4 |
| `NO_PLAN_AVAILABLE` | apps/editor L7 | `kind` tag, consent arm | **stays a `kind`**, but its *cause* is carried | today it re-labels all four §0.e causes as N4 (`ConfirmationFlow.ts:208–219`); it must carry the §8.1 member that caused it |
| `UNVERIFIABLE:no-planner-for-type` | apps/editor L7 | ⚠ **hash sentinel** | `UNSUPPORTED_ELEMENT_TYPE` or `ENGINE_NOT_AVAILABLE` | **must cease to exist.** A reason wearing a hash's clothes makes a consumer report `PLAN_STALE` for a fact that is not staleness (§0.f) |
| `'UNPLANNABLE'` | apps/editor L7 | ⚠ **hash sentinel** | whichever §8.1 member the live re-plan produced | same defect, second site (`ConfirmationFlow.ts:269–271`) |

**Tally: 23 measured values → 11 union members + 5 retained `kind` tags + 1 foreign channel
(C75's) that C78 does not absorb. Twelve of the 23 lose information today**, and every one of the
twelve is marked ⚠ above.

> **§8.3 — MUST. Sub-reasons are typed, never prose.** Per-family specificity is carried in a
> **typed, per-family sub-reason** alongside the union member — not by string-parsing a `detail`
> field. Today the precise `RoomPredictionRefusal` survives only as prose:
> `WallMoveConsequencePlanner.ts:293` writes `` detail: `${p.reason}: ${p.detail}. …` ``, which is
> the same class of defect that `consequence.ts:271–295` documents as *retired* for
> `regeneration.skipped[].reason`. A universal system will have N per-family unions
> (wall-junction, slab-boundary, roof-plane); **the flat union does not grow to hold them, and
> `detail` does not carry them.** (This resolves 0C OPEN QUESTION 2 in favour of the
> member + typed sub-reason pair; the exact carrier shape is Phase 3.)

> **§8.4 — MUST. `reason` and `kind` are different things and stay different.** A `reason` says
> *why an impact could not be determined* and belongs on `UndeterminedImpact`. A `kind` discriminates
> a **terminal outcome** of the plan/consent/execution machinery (`PLAN_STALE`, `NO_PLAN_SUPPLIED`,
> `APPROVAL_STALE`, `APPROVAL_UNKNOWN_PLAN`, `NO_PLAN_AVAILABLE`). Merging the two vocabularies
> would make both unreadable. **But a `kind` must carry the `reason` that caused it** where one
> exists — `NO_PLAN_AVAILABLE` today asserts a cause it did not measure.

> **§8.5 — MUST. Cross-channel refusals are bridged by a typed map, never by re-labelling.**
> `GraphQueryRefusalReason` (`GraphQueryService.ts:91–93`) and C75's `ProvenanceUnknownReason`
> keep their own unions; where their values must reach a `ConsequencePlan`, the mapping is an
> explicit, exhaustive, reviewable function. A `default:` arm that funnels unknown foreign values
> into one member is the §8.2 ternary defect rebuilt.

> **§8.6 — MUST NOT.** C78 may not absorb, alias or extend **C75's** provenance vocabulary. C75
> §2's five origins and its UNKNOWN-with-reason design (`ValueOrigin.ts:83–89` — *"There is no
> `unknown` member, and its absence is the design"*) are that contract's, and provenance-unknown is
> not consequence-undetermined.

> **§8.7 — MUST. `ConsequenceRefusal.reason` stays free text, deliberately.** `consequence.ts:119`
> is untyped because a refusal must carry **the producer's own numbers verbatim** —
> `confirmationPolicy.ts:150–160` states the rule: surface the producer's sentence, never re-derive
> it. This is C70 G-INV-4 (*a refused mutation names the rule and both numbers*), and §8's typed
> union does not replace it. **They coexist: the union says which category, the free text says what
> the producer measured.**

> **§8.8 — MUST NOT. No untyped absence on the consequence path.** Measured today: `null` from
> `preview()` (4 causes), `null` from `planNow()` (the same 4, re-implemented), two hash sentinels,
> and a silent `return` that swallows 5 (0C §6.4). **Every one becomes a typed determination.**
> This is C70 L-INV-1 at the exact function that decides whether a plan exists at all —
> `consequence.ts:36–38` already states the founding rule (*"'I found nothing' and 'I could not
> look' are never the same value"*), and the plan BODY honours it exhaustively while its **entry
> point does not** (0C OBSERVATION 10).

> **§8.9 — MUST.** A `ConsequenceReport` names its undetermined items **individually**. The triple
> already exists (`validationUndetermined` `:477`, `metricsUndetermined` `:498`,
> `geometryUndetermined` `:519`); a count without names is a C70 §5.5 bare-count ledger by another
> route.

---

## §9 — H · Plan hashing

> **§9.1 — MUST.** A plan is identified by a hash over its **content**, and separately over the
> **pre-state it was computed against**. Both exist (`PlanStaleRefusal`, `consequence.ts:565–575`,
> four hashes).

> **§9.2 — MUST.** Hashing is deterministic and canonical. `stableStringify` is a pure, generic
> helper that today merely *lives* inside `WallMoveConsequencePlanner.ts` and is imported from
> there by `ConsequenceExecutionService.ts:61–62` (0C §3.2 #8) — a generic utility residing in a
> family-specific file is a coupling waiting to be cited as a precedent.

> **§9.3 — MUST NOT. A hash field may never carry a reason.** `'UNVERIFIABLE:no-planner-for-type'`
> and `'UNPLANNABLE'` (§0.f) are forbidden by this clause specifically, and the ban is
> type-level, not stylistic: a field typed to hold a hash must be unable to hold a sentence.

> **§9.4 — MUST NOT.** The confirmation policy may not be a field on the plan. This is a *stated
> design constraint* (`confirmationPolicy.ts:23–32`): keeping `computeConfirmationPolicy(plan)`
> referentially transparent means a policy tweak does not change the plan hash and therefore does
> not invalidate every outstanding approval. C78 pins it as a rule so it is not "simplified" away.

---

## §10 — I · Execution binding

> **§10.1 — MUST.** Execution binds to the plan it was given. *"NEVER execute a different
> algorithm from the one previewed"* (§1.2c) is decided by G-REASON-03,
> `check-execution-plan-agreement` — today wall-scoped, importing the planner dynamically at
> `:122–123` and building `new Map([['wall.move', planner]])` at `:191` (0C §4.1).

> **§10.2 — MUST.** Executing **without** a plan is a typed, first-class outcome — not a degraded
> success. `ExecutionConsequence` already has three arms (`reconciled | plan-stale | unplanned`,
> `consequence.ts:595–615`) and `PredictionAbsence` types the absence (`:583–586`). The measured
> gap is not the type; it is that `MovePlanToolHandler` falls back to `dispatchDirect()` on refusal
> (`:~544`) logging only the kind, so a plan-less dispatch is indistinguishable in the report from
> a family that never had a planner.

> **§10.3 — MUST.** Read-back is the only evidence of a mutation (C70 L-INV-4). Measured:
> `DEFAULT_READBACK_STORES = ['wall','room','door','window','stair']`
> (`ConsequenceExecutionService.ts:185`) is a **default**, overridable via `deps.readbackStores`
> (`:100`) — but a sixth family is invisible to read-back until that list or the override grows.
> **A family absent from read-back must not be reported as reconciled.**

> **§10.4 — MUST NOT.** The plan-bound path may not be reserved for one family by a tool-handler
> branch (§5.4). Whether unplanned dispatch for door/window/slab/stair/roof/column/beam/furniture/
> plumbing/lighting/structural is an accepted interim state or a tracked gap is **0C OPEN QUESTION
> 7 and is not settled by this contract** — but under §1.2b it must be *reported* as unplanned
> either way.

---

## §11 — J · Reconciliation

> **§11.1 — MUST.** After execution, predicted and actual are compared, and the verdict is typed.
> `PredictedVsActual` (`:391–402`), `ActualConsequences` (`:409–413`) and
> `PlanDivergenceVerdict` (`plan-agreed | plan-fidelity-divergence`, `:445–451`) already exist.

> **§11.2 — MUST.** Divergence is **reported**, never absorbed. A reconciliation that finds a
> divergence and prints success is the report-payload-discard defect the ga-gate at
> `run-all.ts:164` exists to catch (C68 §5.g).

> **§11.3 — MUST.** The reconciliation engine stays family-agnostic. Measured: `fingerprint()`
> (`:468–483`), `readback()` (`:493–517`), `validationDelta()` (`:520–545`) and `reconcile()`
> (`:549–641`) — roughly 200 of that file's 642 lines — contain **no wall or room reference at
> all** (0C §3.2). The room-specific half (`applyReshape` `:335–398`, `geometryReadback`
> `:411–459`, `PredictedRoomGeometryApplier` `:152`) is *correctly* family-specific; the two must
> not be re-entangled.

> **§11.4 — MUST.** `ConsequenceReportView` renders through the contract vocabulary only. It is
> measured at **zero wall couplings** (`rg 'wall|Wall'` → no matches; 0C §3.3) — **the one L7
> surface that is already universal**, and it is to be kept that way.

---

## §12 — K · Undo grouping

> **§12.1 — MUST.** One user gesture — the cause and every consequence the plan bound to it — is
> **one undo unit**. Gated by `check-room-reshape-undo` (today wall-scoped: it hard-codes
> `{type:'wall.move', payload:{id:'wall-n'}}` at `:157`).

> **§12.2 — MUST.** Gesture identity is causal, not temporal (`gestureScope.ts:1–27`), and
> **absence is not membership** (`:25–27`): an entry with no gesture id is never a twin of
> anything, and unlabelled entries fall to the chronological rule. Consequence for C78: a
> multi-element relationship edit whose commands are not gesture-scoped **does not fail loudly** —
> it degrades to chronological undo, silently.

> **§12.3 — MUST. Asynchronous consequence maintenance threads its gesture id explicitly.** The
> scope is **synchronous by contract** (`gestureScope.ts:44–50`) and deliberately not propagated
> across `await`. But relationship maintenance is characteristically deferred — debounced room
> re-detection, the wall rebuild flush, the CRDT read-back (0D G-4). Each must pass `gestureId`
> via `executeCommand`'s `opts.gestureId` or `CommandMetadata.gestureId`, **or it is not in the
> gesture**, and one user action undoes in pieces.

> **§12.4 — MUST.** A command excluded from history that **re-derives a relationship** is a
> silent-divergence site: undoing the cause leaves the derived edges standing.
> ⚠ **UNPROVEN — the population of such sites is UNKNOWN.** 0D §3.4 declines to state a count
> because a partial enumeration reads as exhaustive (`ReDetectRoomsCommand` is one known instance;
> `__pryzmBuildingGenActive` at `CommandManagerImpl.ts:157` excludes an entire generation run).
> **This is the largest measurement debt this contract inherits** (0D G-6), and no C78 status may
> report undo coverage while it stands.

---

## §13 — L · Provenance

> **§13.1 — MUST. C75 owns provenance; C78 consumes it and may not restate it.** The five origins,
> `SystemWritableOrigin`'s type-level exclusion of `authored`, and UNKNOWN-with-reason are
> C75's.

> **§13.2 — MUST.** A plan states which of its predicted changes touch **authored** state.
> ⚠ **UNPROVEN and currently unanswerable:** **0 of 29 element schemas carry a provenance field**
> (0D §2.2); every `origin:` in `packages/schemas/src/elements/*` is a geometric `Vec3`;
> `packages/schemas/src/provenance/index.ts` is not even re-exported from the root barrel.
> `ElementProvenanceIndex.ts:26–33` states it without hedging: *"NO ELEMENT IN THIS REPOSITORY
> CARRIES PROVENANCE TODAY … there is no field to read"*, and reporting
> `producer-not-instrumented` is **the correct answer, not a degraded one**.

> **§13.3 — MUST.** Until §13.2 is satisfiable, a plan that cannot determine authorship says so —
> `unknown-authority` — and **must not present the change as safe to clear.** *A safe mode cannot
> protect what it cannot identify* (0D G-3).

> **§13.4 — MUST NOT.** No consequence path may stamp an origin it did not observe (C70 H-INV-1).
> The two live counter-examples sit on the room LOAD path in one 40-line region:
> `roomSnapshotUtils.ts:156` — `(rawBoundary['detectionMethod'] as any) || 'auto-topology'` —
> an `as any` defeating the union at exactly the boundary it existed to police, plus a fallback
> presenting a missing origin as a real observation (0D §2.4, G-13).

---

## §14 — M · Persistence

> **§14.1 — MUST.** A relationship the model relies on either **survives** save→reload, or the
> load **names the loss**. C70 I-INV-3; the template is §0.3's `unreconstructable` list.

> **§14.2 — MUST NOT. A relationship may not die silently on load.** Measured live defect:
> `rebuildSemanticGraph.ts:131` reads `room.boundary?.boundingWallIds`, but the field is a
> **sibling** of `boundary`, verified three ways — Zod (`RoomDataSchema.ts:56–61` vs `:165–166`),
> serializer (`roomSnapshotUtils.ts:89`, top level) and loader (`:184`, top level). The optional
> chain absorbs a shape error into `[]`, so `boundedBy` yields zero edges, `wallToRooms` stays
> empty, and the dependent `adjacentTo` and `connectedTo` are also zero — **and none of the three
> is reported in `unreconstructable`** (0D §5.3, G-1). Its unit test fabricates the fixture *in the
> implementation's shape*, so the defect is self-certifying green.
> **Blast radius:** the same relation is the sole cross-element hop for **five constraint
> families** via `roomStore.getRoomsAdjacentToWall(wallId)` (0D §1.4, G-2). One field is the hinge
> for three graph families and five constraint families.

> **§14.3 — MUST.** A new relationship carrier is added to **every** serializer whitelist in the
> same commit. Measured hazard: nine per-kind serializers enumerate explicit keys and the snapshot
> enumerates explicit arrays, in **two hand-synced copies**; the codebase records the precedent in
> its own comment (`ProjectSerializer.ts:408–410` — *"these two allow-lists diverging is how
> `function` was silently dropped on reload"*; 0D G-12). **Anything not named is dropped by
> default.**

> **§14.4 — MUST.** A relationship declared REGENERATED-on-load is sound only while its
> regenerator fires on **every** load path. ⚠ **UNPROVEN:** `joinedTo` is never serialized — no
> `JunctionStore`, no snapshot key — and the *"therefore NOT a loss"* claim
> (`rebuildSemanticGraph.ts:22–26`) rests entirely on `WallRebuildCoordinator`'s flush; **that
> call-order guarantee was not traced** (0D §5.5, G-14). If any path skips it, `joinedTo` is lost
> with no report.

> **§14.5 — MUST NOT.** An empty collection and an absent collection may not serialise
> identically. `ceilings`/`lighting` use `len>0 ? … : undefined` (0A §5.1), so a load cannot
> distinguish *this project has no ceilings* from *this snapshot predates ceilings* — the same
> value-collision as §0.e, in the file format.

---

## §15 — N · Concurrency

> **§15.1 — MUST. C08 and C66 own what may be claimed; C78 claims nothing.** No capacity tier
> moves from CLAIMED to HELD on C78 evidence (C66 §1). The permission ledger is 0D §4.4's and is
> authoritative.

> **§15.2 — MUST.** A plan computed against one client's state is bound to that state at execution
> (§6.1, §11.1) regardless of a peer's concurrent edit. A remote mutation arriving between preview
> and execute makes the plan **stale**, which is a determinate outcome (`PLAN_STALE`) — never a
> silently different execution.

> **§15.3 — MUST NOT.** A peer's edit may not enter this client's undo history as local work.
> ⚠ **Measured RED at HEAD:** the two-client gate reports
> `undo/undo-reverted-peer-work` — A's Ctrl+Z reverted B's `materialColor`. Root cause identified
> (the CRDT read leg never stamped `source: 'REMOTE'`, so peers' edits land as `HUMAN_DIRECT`), a
> fix is authored, **and the gate still reads RED** (0D §4.3, G-5).

> **§15.4 — UNPROVEN. Relationship ESTABLISHMENT under concurrency is not measured at all.** The
> in-process harness applies **property updates only** — *"a peer never mints an element it has not
> seen"* (`twoClientWorld.ts:94`) — but relationships are typically established **by a create**
> (host a door; bound a room). And the shared-id arm is **not measurable in one Node realm**:
> `ElementRegistry.getInstance()` is a module singleton and `CreateWallCommand` refuses a duplicate
> id, which is the definition of two peers editing the same wall (`:80–87`). **That arm needs two
> processes** (0D G-7). No C78 status may report concurrency coverage for relationship creation.

---

## §16 — O · Blind mode

> **§16.1 — MUST. The confirmation requirement is a pure function of the plan.** CONFIRMED by
> measurement: `computeConfirmationPolicy(plan: ConsequencePlan): ConfirmationPolicy`
> (`confirmationPolicy.ts:124`) takes one argument, reads exactly five plan fields
> (`refused` `:134`, `violationsCreated` `:135`, `topology.removed` `:136`, `undetermined` `:139`,
> `changed` `:140–141`), imports only four `import type` from `@pryzm/command-bus`, and touches no
> DOM, store, clock, user or command type (0C §5).

> **§16.2 — MUST NOT.** The shortcut is forbidden **by name**: STR-06 §10 — *"Never
> `if (command.isDestructive) showConfirm()` — that reproduces the gap"*
> (`confirmationPolicy.ts:8–21`). Destructiveness is a property of the **computed consequences**,
> not of the verb.

> **§16.3 — MUST.** The card renders the verdict; it never reaches one. `ConfirmationFlow.ts:221`
> computes the policy and `:227` hands it to the prompt already computed. This is what lets a gate
> assert the policy with no DOM, and `check-approval-binding` does.

> **§16.4 — MUST.** The policy is family-agnostic today and must stay so. Measured: the three
> REQUIRED clauses and two of three RECOMMENDED clauses read contract fields only. **The one
> degradation is `changes_hosted_elements`**, which depends on §2.2's prefix heuristic and silently
> does not fire for a family whose hosted children are not door/window/opening — a curtain-wall
> panel, a roof penetration, a duct fitting. That degradation is **declared, not hidden**, and its
> direction is the safe one (§2.4).

---

## §17 — P · Region relationships

> **§17.1 — MUST.** An element created **by tracing a region of other elements** retains a
> reference to what it was traced from, or the creation declares the reference unretained.

> **§17.2 — MUST NOT.** A "By Region · Auto-detect from enclosed walls" affordance may not promise
> the same thing for two families while retaining the relationship for only one. Measured:
> **exactly one of six region paths retains the relationship** — the plan-view slab path, via
> `traceRegionSketchAtPoint` (`SlabRegionTracer.ts:730`), whose **only caller in the tree** is
> `SlabPlanToolHandler.ts:13,389`. Roof uses a *different* detector,
> `WallRegionDetector.detect(hitPoint, wallStore): Pt[] | null`
> (`packages/geometry-roof/src/WallRegionDetector.ts:44`), which **cannot carry a host reference
> even in principle** — its walk returns `loopIdxs.map(idx => points[idx])` at `:193`, projecting
> to coordinates and discarding wall identity before returning. The founder-facing affordance
> exists for roofs (`CreatePanelLayout.ts:310`); the retained relationship does not. **Move a wall
> and the roof stays put, silently** (0B §5, §5.1).

> **§17.3 — MUST.** Where attribution can fail, the failures are **named and counted**, not
> absorbed. `SlabPlanToolHandler.ts:394–404` is the model: it logs `hostEdges`, `freeEdges`,
> `curvedFallbacks`, `missingIdFallbacks`, `ambiguousFallbacks` and states plainly that *"free
> edges do NOT follow a wall"*; `SlabRegionTracer.ts:310` types the three failure modes
> (`'curved' | 'noWallId' | 'ambiguous'`). `WallRegionDetector.ts:28–31,183–189` gets the
> equivalent right at its own level — it logs when it aborts on the loop cap rather than returning
> a silent `null` (L-699). **"No closed region here" and "I gave up" are not the same value.**

> **§17.4 — MUST.** Where a region-traced relationship is **not** retained, the created element's
> dependency answer is `RELATIONSHIP_NOT_RECORDED` (§8.1 #8) — not an empty affected set.

---

## §18 — Q · Generated / regenerated relationships

> **§18.1 — MUST.** A generator that clears before rebuilding **plans the clear**, and the plan is
> refusable. The refusable form **already exists and already refuses**: `planRegenerationClear`
> over a level holding one authored and one generated room returns **refuse=true · clearable=1 ·
> PROTECTED=1 · unknown-authority=0**, with a sentence naming the protected element; the control
> over two system-produced rooms returns refuse=false · clearable=2 — *"refusal is a decision, not
> a constant"* (0B §6.1, arms (c) and (c·control)).

> **§18.2 — MUST. The live path must call it.** Measured, EXECUTED through the real store and the
> real `room.delete` handler on the real bus: the §GRAPH-CLEAR-FIRST pattern over the *same* set →
> seeded=2 · remaining=0 · **the authored room survived = false** (0B §6.1 arm (b)). Arms (b) and
> (c) run over the same set and disagree, because (b) is production and (c) is the reported form
> nothing has been wired to. **Phase 1 must wire the existing refusal, not design one.** This is
> the only defect in the Phase 0 corpus that is EXECUTED-PROVEN rather than measured structurally.

> **§18.3 — MUST.** Regeneration is a **command**, so that it is refusable, undoable and gateable.
> ⚠ **Measured:** *every* generator is a UI controller — house, apartment, office, residential,
> ceiling, furnish and lighting layout executors, plus two host services — and **not one is a bus
> verb**; the only generate-shaped verbs are `GENERATE_STAIR_GEOMETRY` and `ai.floorplan.generate`,
> *"neither of which regenerates an area"* (0B §6). *This is precisely why nothing can enforce
> clear-then-rebuild centrally — there is no central place.* Whether regeneration becomes a verb
> family or authored-protection moves into the stores is **0B OPEN QUESTION 8 and is not settled
> here.**

> **§18.4 — MUST.** A regenerated relationship is marked as regenerated (C75's `regenerated`
> origin) so a later pass can tell it from an authored one. ⚠ Blocked on §13.2's absent field.

> **§18.5 — UNPROVEN.** `check-authored-state-protection` states its own scope limit and prints it
> every run: **3 of 7 verifications are EXECUTED; 4 are NOT EVALUATED for want of substrate** —
> an authored *wall* byte-intact (no wall carries provenance), an authored *opening* (same), a
> generated wall UPDATED (there is no regeneration verb to run), and an AI-proposed element still
> marked INFERRED (nothing stamps an origin). *"This gate does NOT claim the scenario passes"*
> (0B §6.2). C78 adopts that phrasing: **the gate's silence on four arms is not coverage.**

---

## §19 — The universal invariants

The ids below are stable and are the citable form. Each is falsifiable, and §20 names the gate that
would decide it.

| Id | Invariant |
|---|---|
| **U-INV-1** | For every (element, related element, consequential operation) triple in scope, the system returns exactly one of **DETERMINED-affected · DETERMINED-unaffected · UNDETERMINED+reason** (§1.3) |
| **U-INV-2** | No consequence path returns `null`, `[]`, `0` or `undefined` to mean *"I could not determine"* (§1.2b, §8.8) |
| **U-INV-3** | Every undetermined outcome carries a member of §8.1's **closed** union; no reason is encoded as a hash, a prose `detail`, or a silent return (§8.1, §9.3) |
| **U-INV-4** | "Unaffected" is never inferred from missing data — an empty index, an absent field, an unregistered planner or a caught throw is UNDETERMINED (§1.4) |
| **U-INV-5** | The planner registry accepts any family: no consequence-routing type is parameterised on a single family's command type (§0.d) |
| **U-INV-6** | Every field naming a dependency is honoured or removed; no field naming a dependency is structurally always empty (§3.3) |
| **U-INV-7** | Every dependency index returns a determination, not a bare set (§5.2) |
| **U-INV-8** | The plan executed is the plan previewed and approved; a state change between the two is `PLAN_STALE`, never a different algorithm (§1.2c, §10.1) |
| **U-INV-9** | One gesture is one undo unit, including asynchronously-maintained consequences (§12) |
| **U-INV-10** | A relationship survives save→reload, or the load names the loss (§14.1, §14.2) |
| **U-INV-11** | Preview is pure and planning is deterministic (§7.5, §7.6) |
| **U-INV-12** | A generator's clear is plan-bound and refuses on authored state (§18.1, §18.2) |
| **U-INV-13** | The confirmation requirement is a pure function of the plan, never of the verb (§16.1, §16.2) |
| **U-INV-14** | No observer mutates authoritative state on a path where safe-mode guarantees are required, outside the plan (§1.2d) |

> **§19.1 — the no-partial-credit rule, applied across the product. MUST.** C70 §3.2 forbids
> partial credit **along** the Golden Chain; C78 forbids it **across** the element × relationship
> product. *One family with a complete lifecycle is not "the architecture works, we just need to
> repeat it"* — it is one family, and the coverage claim is 1 of N until N is measured. The
> founder's framing is the binding one: **the guarantee is architectural, not a count of
> implementations.**

> **§19.2 — MUST NOT.** No status document may report C78 coverage as a percentage of *planners
> written*. The denominator is **composed, reachable** planners over consequential verbs (§0.b,
> §0.c), and the reachability question is the one to ask (C70 §4.2).

---

## §20 — Gates, and the exit condition per invariant

> **§20.1 — MUST.** **Every gate in this table is a NAMED GAP at stamp time.** Under
> [C70](C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md) §7.1, a gate named here that does not exist at HEAD
> makes its invariant **UNPROVEN** — never a blank row, and never an inherited green from a
> neighbouring gate that happens to exist. Where an existing gate is named, it is named with its
> measured scope limit.

| Invariant | Gate (all NAMED GAPS unless stated) | Floor | Exit condition |
|---|---|---|---|
| U-INV-1 | `check-relationship-determination` — over a declared relationship ledger, every row answers one of the three legal values | relationships read from the ledger > 0 | the ledger covers the C71 vocabulary **plus** the §3.2 store-field relationships, and no row is blank |
| U-INV-2, U-INV-3 | `check-consequence-refusal-typing` | consequence entry points scanned ≥ declared minimum | zero untyped absences on the path; the two hash sentinels are gone; `UNSUPPORTED_ELEMENT_TYPE` has ≥1 producer |
| U-INV-3 (cross-module) | **extend the existing** `check-refusal-identity` (`run-all.ts:180`, 88 named offenders) to the consequence path | offenders named, shrink-only | 0C OPEN QUESTION 9 answered; §8.2's twelve ⚠ rows reach 0 |
| U-INV-4 | `check-no-empty-means-unknown` | discovery sites scanned > 0 | no `?? []`, `?.` or catch-arm on a discovery path collapses failure into emptiness |
| U-INV-5 | `check-planner-registry-generic` | registry declaration sites read ≥ 2 | no consequence-routing type names a single family's command type; the `as unknown as` cast at `confirmationFlowComposition.ts:67` is deleted |
| U-INV-6 | `check-dependency-fields-honoured` | fields discovered ≥ declared minimum | the measured 12-of-14 unhonoured fields reach 0 by honouring **or** by deletion (§3.3) |
| U-INV-7 | `check-index-can-refuse` | indexes discovered > 0 | the measured 1-of-9 refusing indexes reaches all |
| U-INV-8 | **exists, wall-scoped**: `check-execution-plan-agreement` (G-REASON-03) + `check-approval-binding` (G-REASON-05) | per-family fixture ≥ 1 | parametric over a family table, or one fixture per family — **0C OPEN QUESTION 5 is unsettled**: at 5 gates × N families, a five-family system is 25 fixtures |
| U-INV-9 | **exists, wall-scoped**: `check-room-reshape-undo`; plus a NAMED GAP for the async arm | gesture fixtures ≥ 1 | the non-undoable-command census (0D G-6) exists, and every relationship-re-deriving command in it is either in a gesture or declared |
| U-INV-10 | **specified by C71 §6** `check-graph-persistence`; plus a NAMED GAP arm for **§14.2's live defect** | relationships round-tripped > 0 | a test drives serialize → parse → load **end-to-end** and asserts a relationship survives — **no test anywhere does this today** (0D §5.5) |
| U-INV-11 | **exists, wall-scoped**: `check-preview-purity` (G-REASON-01). ⚠ **G-REASON-02 has NO GATE FILE AT ALL** (0C OPEN QUESTION 6) | fixtures ≥ 1 per family | a determinism gate exists and is family-parametric; it is the invariant a second planner is most likely to break silently |
| U-INV-12 | **exists, partially**: `check-authored-state-protection` — 3 of 7 arms EXECUTED, **4 have no subject** (§18.5) | executed arms ≥ 3 | the four unevaluated arms acquire subjects: element-grain provenance (§13.2) and a `*.regenerate` verb (§18.3) |
| U-INV-13 | **exists, indirectly**: `check-approval-binding` asserts the policy with no DOM | plans evaluated > 0 | the policy reads a **kind-carrying** change set and `HOSTED_PREFIXES` is deleted (§2.3) |
| U-INV-14 | `check-observer-bypass` | mutating observers discovered ≥ declared minimum | the measured direct-write observers (`SlabDependencyTracker.ts:170`, `SlabWallConnectivityService.ts:337`, `CurtainPanelSyncHandler.ts:111,141,161`) are plan-bound or declared |

> **§20.2 — MUST.** Every gate above obeys the four-exit-code contract implemented once in
> `tools/rac-conformance/certification/contract.ts` (C70 §5.1), declares a **floor** and exits
> **2 MISCONFIGURED** when the floor is unmet (C70 §5.2). *Emptiness is never a pass* — and a gate
> for a contract whose central subject is "failure and emptiness are different values" that itself
> passed on an empty subject would be self-refuting.

> **§20.3 — MUST.** Every comparator is **watched go red** against a tampered state before it is
> trusted (C70 §5.6).

> **§20.4 — MUST NOT.** A floor may never be lowered to make a run green (C70 §5.3), and a ledger
> of bare counts is forbidden (C70 §5.5) — entries are **named**, and an entry that leaves its
> class leaves the list in the same commit.

> **§20.5 — what these gates CANNOT see**, stated so no reader takes the table for coverage:
> **(a)** static discovery counts authored-but-unreached code as present — §0.c is the standing
> example, and no gate here answers reachability; **(b)** a green gate proves its own assertion,
> never the invariant around it; **(c)** every non-concurrency gate is single-client by
> construction, and §15.4's establishment arm needs two processes; **(d)** an executed run proves
> the seeded fixture, not the user's project.

---

## §21 — What this contract could NOT settle

Named so the gaps have homes, and so no implementation reads silence as a decision. Each carries
the Phase 0 open question it inherits.

1. **Is `PredictedGeometry` the universal predicted-geometry type, or the room one?** (0C OQ3, §7.3.)
   It is 2-D and plan-polygon-shaped; a stair run, roof plane or wall solid does not fit. This
   decides whether the reshape half of the execution service generalises or needs per-family
   appliers.
2. **What replaces `normalizeToWallMove`?** (0C OQ4.) Does each planner declare the verbs it
   answers for, or does the command registry carry the semantic type? C78 requires only that the
   answer be registry-driven and refusal-typed (§8.1 #3).
3. **Per-family gate fixtures, or one parametric harness?** (0C OQ5, §20 U-INV-8.) Five G-REASON
   gates × N families is 25 fixtures at five families.
4. **What are level re-stack semantics?** (0B OQ2, §6.6.) *Undefined*, not merely unimplemented
   (`ChatCommandClassification.ts:153`). Does re-elevating a level move its elements, or redefine
   the datum they are measured from?
5. **Should `boundingWallIds` be populated, or deleted?** (0B OQ3, §3.3.) C78 forbids the current
   third state; it does not choose between the two legal ones.
6. **Does regeneration become a bus verb family?** (0B OQ8, §18.3.)
7. **Are the six rival plugin DTO stores dead or live?** (0A OQ1.) Cannot be settled by grep; needs
   a runtime reachability probe. A consequence system cannot plan against a store it cannot name.
8. **Which of the 213 verbs whose authoritative store is `NONE or UNKNOWN` are genuinely storeless
   vs merely undeclared?** (0A OQ4.) *A verb whose authoritative store is unnamed cannot have its
   consequences planned* — this is prerequisite to U-INV-1's ledger.
9. **The non-undoable-command census.** (0D G-6, §12.4.) Deliberately unstated in Phase 0 because a
   partial list reads as exhaustive. The largest inherited measurement debt.
10. **Is unplanned dispatch for the other ~10 families an accepted interim state or a tracked
    gap?** (0C OQ7, §10.4.)

---

## §22 — Anti-patterns

- **§22.a — Returning `[]`/`null` for "I could not determine".** §1.2b, U-INV-2. The measured
  entry-point instance is `preview()`'s four-cause `null` (§0.e).
- **§22.b — Inferring "unaffected" from missing data.** §1.4. An empty index is not an answer.
- **§22.c — A reason encoded as a hash, a prefix, or prose in `detail`.** §8.3, §9.3, §2.2.
- **§22.d — Counting authored planners as coverage.** §0.c, §19.2 — reachability is the question.
- **§22.e — A field that names a dependency and is always empty.** §3.3 — worse than no field.
- **§22.f — A per-family reason union collapsed into a general one by a ternary.** §8.2's twelve ⚠
  rows; `WallMoveConsequencePlanner.ts:292` is the site.
- **§22.g — `if (command.isDestructive) showConfirm()`.** §16.2 — forbidden by name in STR-06 §10.
- **§22.h — Minting a relationship family outside C71 §2.6.** §3.1 — C78 owns no vocabulary.
- **§22.i — Reporting a wall-scoped gate as evidence for another family.** §20, C70 §2.1.
- **§22.j — Treating a gate's unevaluated arm as a pass.** §18.5, C70 §2.2 — UNPROVEN reads
  differently from both pass and fail.
- **§22.k — Restating a Phase 0 count in prose as if it were stable.** §0.2 — cite the appendix.
- **§22.l — Wiring a consequence path around the plan through an observer.** §1.2d, U-INV-14.

---

**Status**: CANONICAL 2026-08-12. Phase 1 of the universal safe-mode program — **contracts before
code**. Every invariant in §19 is **UNPROVEN** at stamp time, because **every gate in §20 is a
NAMED GAP or exists only at wall scope**, and under C70 §7.1 that is the honest reading, not a
failing one. This contract specifies no implementation; Phase 3 decides the HOW.
