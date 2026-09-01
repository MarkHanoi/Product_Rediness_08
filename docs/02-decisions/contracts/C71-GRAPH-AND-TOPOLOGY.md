# C71 — Graph & topology: the relationship vocabulary and its per-edge semantics

> **Stamp**: 2026-08-12 · **Status**: CANONICAL
> **Scope**: the relationship vocabulary of the model graph — which edge families are REQUIRED, which are PARKED, how a parked family is unparked, how a new one is added, and the **six semantics every edge must carry** before it may be called a capability. Owns the rule that the **three graphs stay separate**, and the three gates that keep the vocabulary honest. It does **not** own what a command is (C03/C16), what persists (C05/C47), or what BIM 3.0 is as a whole ([C70](C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md)).
> **Key principle**: *An edge is only real when a writer and a reader agree it exists.* A declared type with no consumer is not partial progress — it is a false signal that inflates every coverage census and misleads every audit that greps for capability.
> **Authority**: subordinate to `STR-03` / `STR-04`, to [C70](C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md) (whose pillar-C and pillar-D invariants this contract implements), and to two ACCEPTED ADRs it may not contradict: [**ADR-0320**](../adrs/ADR-0320-relationship-vocabulary-scoped-by-consumers.md) (the vocabulary is scoped by measured consumers) and [**ADR-0321**](../adrs/ADR-0321-wall-connectivity-is-joinedTo-not-connectedTo.md) (`joinedTo`). Peers with **C52** (owns the UBG as an *editable* surface), **C27** (owns the Inspect tree that reads the graph), **C15** (owns hosting), **C11** (owns creation), **C05**/**C47** (own the snapshot and its versioning), **C69** (owns the verbs that carry these writes). Supersedes nothing.
> **Evidence** (READ-ONLY, cited never restated): [`EV-05`](../../04-reference/bim30-evidence/EV-05-relationship-coverage-ledger.md) — the coverage ledger incl. its same-day correction · [`EV-04`](../../04-reference/bim30-evidence/EV-04-semanticgraph-write-coverage.md) — per-kind write coverage · [`EV-03`](../../04-reference/bim30-evidence/EV-03-change-impact.md) — propagation traces · `BIM30-EVOLUTION-AUDIT.md` §17 (deleted 2026-08-15 — see git history; its DO-NOT-REBUILD consequences survive in [`BIM30-IMPLEMENTATION-ROADMAP.md`](../../03-execution/plans/BIM30-IMPLEMENTATION-ROADMAP.md) §6).
> **Gates**: `check-graph-write-coverage` · `check-graph-delete-integrity` · `check-graph-persistence` — specified in §6.
> **Changelog**: 2026-08-12 — created as Phase 0 of the BIM 3.0 master directive, subordinate to ADR-0320 and ADR-0321 on the day both were accepted.

---

## §0 — Why this contract exists, and why it is not an ontology

The obvious way to specify a building graph is to enumerate the relationships a building has.
That artefact exists in this repository already: `RelationshipType` declares **25 members**
(`packages/core-app-model/src/SemanticGraph.ts`). **The enumeration is not the capability**, and
this repository has now measured four different ways in which it is not:

- **Twelve of the twenty-five have zero writers and zero readers anywhere in production**
  (EV-04 §1 — per-type literal grep; the only matches are the declaration lines themselves).
  Vocabulary without computation. Every coverage census that counted them counted air.
- **`sitsOn` was the most-written edge in the graph and had no typed reader at all** — nearly
  every element kind emitting it on creation, nothing consuming it (EV-05 §1). A **writer census
  alone graded it healthy.** It was not.
- **`contains` is the inverse failure: read by production, written by nobody first-party.** Two
  surfaces ask; only IFC import ever writes it. On any native project, *"this room contains
  nothing"* and *"nobody ever wrote this edge"* are the **same answer** — this repository's
  signature defect, appearing in the graph.
- **A reader census taken over a dirty tree got two cells wrong**, and the correction found
  something worse than the error: `HierarchyTreePanel` calls `sg.getEdgesFromNode?.(…) ?? []`,
  **a method that has never existed** on `SemanticGraphManager`, so the optional call evaluated
  to `undefined` and the filter ran over `[]` every time. **The hierarchy tree's Furniture group
  has never rendered** (EV-05 correction) — the same shape as `SpeculativeEngine`'s guard on
  `getEdges`, a method that likewise does not exist, making two production read paths
  permanently return `[]` (EV-04 §5b).

Read together those four say one thing: **a census of either side is worthless, and a name found
by grep is not a wired capability.** So this contract does not enumerate an ontology. It requires
that every edge family carry, in one place, the six things that make it computable — and it
ratchets over the families that have a **named consumer**, not over the union.

> **§0.1 — MUST.** No section of this contract restates a measured count as its own claim. The
> measured facts recorded in §5 are dated, cited, and exist to be **superseded by the gates in
> §6**. Cite the gate output or the evidence appendix; where evidence is absent, write
> **UNPROVEN**.

---

## §1 — What an edge is, and the six semantics it must carry

> **§1.1 — MUST.** A **relationship edge** is a retained, typed record written at the moment the
> relationship comes into being, updated when it changes, and removed when it ends. Topology that
> is re-detected on every query is a **cache pretending to be knowledge**; topology written and
> never read is **vocabulary pretending to be capability** (C70 pillar C).

> **§1.2 — MUST. The six required semantics.** For every REQUIRED family, all six are declared,
> in the source, and each is decidable by a program:
>
> | # | Semantic | The question it answers |
> |---|---|---|
> | 1 | **writer** | which production code path creates the edge, and on which command |
> | 2 | **reader** | which production code path *typed-reads* it, and what computation it feeds |
> | 3 | **persistence** | is it serialized into the snapshot, verbatim or not at all |
> | 4 | **rebuild disposition** | is it **regenerated** on load, or **persist-only** — and if persist-only, it is on the persist-or-lose ledger by name |
> | 5 | **invalidation** | what a *move* / resize / re-detect does to it: preserved, updated, or removed-and-re-emitted |
> | 6 | **deletion** | what happens to it when either endpoint is deleted, and what undo restores |
>
> **An edge without all six is not a capability.** It is a declaration, and it must be counted as
> one.

> **§1.3 — MUST NOT.** An untyped enumeration does not count as a reader. Code that walks *every*
> relationship (`getAll`, an untyped `getRelationships` sweep, a panel rendering whatever it is
> handed) proves that **something enumerates every edge** — it never proves that an edge *family*
> is consumed. EV-05 excludes those deliberately and so does this contract.

> **§1.4 — MUST.** Semantic 5 (**invalidation**) is the one the corpus has never measured:
> mutation-update on **move** is **UNPROVEN for every family** (EV-05 §4). It is listed as
> required precisely so the gap has a name and a home, and `boundedBy` after a room-boundary
> change is the row most likely to be wrong.

> **§1.5 — MUST. THE SEVENTH SEMANTIC: `node kind`.** *(added 2026-09-01, lane EXT · audit §6.2 —
> §1.2's table is EXTENDED, not replaced.)*
>
> | # | Semantic | The question it answers |
> |---|---|---|
> | 7 | **node kind** | **what KIND of thing each endpoint is** — and whether the graph can tell |
>
> **Measured 2026-09-01 at HEAD, which is why this is a semantic and not a nicety:** an edge's
> identity is `(sourceId, targetId, type)` — widened to `(…, authoredBy)` only where that field is
> present — and `sourceId`/`targetId` are **bare strings**. `SemanticGraph` has **no node record and
> no node kind at all.** Every endpoint in the graph is an **element instance id**, by convention
> and by nothing else.
>
> ⛔ **The consequence, and it is why this cannot wait for the first non-instance node to arrive:**
> the moment an endpoint is something other than an instance — a **definition**, a **type**, a
> **classification** — `getEdgesFrom(id)` cannot tell the caller what it just handed back, and a
> typed reader written for instances will consume a definition id as if it were one. **That is not
> a type error; it is a silently wrong answer**, and the two `[]`-returning read paths of §0 are the
> proof that this repository does not detect silently wrong graph reads.
>
> **MUST.** Any family whose endpoints are **not both element instances** declares, per endpoint,
> which kind it is, and the reader is written against that declaration. **MUST NOT** infer an
> endpoint's kind from its id prefix at a call site — that is a second, undeclared vocabulary
> (C84 EI-8), and the prefix set is `ElementType`, which does not contain *definition* or *type*.
>
> ⚠ **The three families §2.7 admits are exactly the first ones with this shape**, which is why the
> axis is written before they land rather than after — §2.6's own logic (*"the only moment it is
> cheap"*) applied one level up, to the node instead of the edge.

---

## §2 — REQUIRED and PARKED

This section is the normative form of [ADR-0320](../adrs/ADR-0320-relationship-vocabulary-scoped-by-consumers.md).
Where this contract and that ADR disagree, **this contract wins** (contract suite > ADR); it is
written to agree.

> **§2.1 — the REQUIRED nine. MUST.** These families are the BIM 3.0 graph. Each must reach all
> six semantics of §1.2, and each is inside the coverage ratchet.

| # | Family | The consumer that makes it required |
|---|---|---|
| 1 | `hosts` / `hostedBy` | occupancy gating, the query engine, opening lifecycle, cascade delete, IFC export — **the reference-shape pair** |
| 2 | `boundedBy` | room ↔ wall queries, room detection, the semantic query engine |
| 3 | `adjacentTo` | room adjacency queries, the AI world model, program validators |
| 4 | `connectedTo` | room ↔ room via door — connectivity and pathfinding |
| 5 | `sitsOn` | dependency scheduling and the building graph — the **reader** was the gap, not the writer |
| 6 | `supports` | structural reasoning; beam assignment today, slab→wall declared and never written |
| 7 | `contains` | the AI world model and the hierarchy tree — **needs its first-party writer**, a named gap (§5) |
| 8 | `partOf` | unit containment |
| 9 | **`joinedTo`** — wall ↔ wall via a retained junction | junction lookup; see §3 |

> **§2.2 — the PARKED twelve. MUST.** `unitOf` · `levelOf` · `servesZone` · `precededBy` ·
> `supersedes` · `branchedFrom` · `causedFailureOf` · `wasMitigatedBy` · `exceededBenchmark` ·
> `replacedBy` · `maintainedBy` · `decommissionedBefore` are **declared-not-required**.

> **§2.3 — MUST. Parked is not a gap.** No coverage census, status document, audit or roadmap may
> count a parked family as "missing capability". *Parked* and *gap* are different states, and
> conflating them is the same error as conflating emptiness with failure. A gate that ratchets
> over the union of 25 measures a number that means nothing.

> **§2.4 — MUST NOT.** Parked members may not be **deleted** from the union. Removing them breaks
> `deserialize` on any snapshot that carries one — snapshot v3 — for zero computational gain.
> They stay declared, they stay out of the ratchet.

> **§2.5 — the unparking rule. MUST.** A parked family becomes REQUIRED only by an **ADR that
> names its first CONSUMER** — the reader, and the computation that reader feeds. **A
> writer-first unparking is forbidden.** Writing edges nothing reads is how `sitsOn` spent months
> as measured-but-meaningless coverage, and shipping a writer against a parked type is a
> **defect, not progress**.

> **§2.6 — the addition rule. MUST.** Any **new** `RelationshipType` member lands in **ONE PR**
> carrying, together:
>
> 1. at least one **writer**;
> 2. at least one typed **reader**;
> 3. its **rebuild disposition** — regenerated, or explicitly persist-only and added by name to
>    the persist-or-lose ledger;
> 4. its **delete behaviour** on both endpoints, and what undo restores.
>
> A PR adding a member without all four is refused by `check-graph-write-coverage` (§6). This is
> §1.2 made mechanical at the moment of introduction, which is the only moment it is cheap.

> **§2.7 — THE DEFINITION AXIS: `instantiates` · `specializes` · `dependsOnDefinition`**
> *(added 2026-09-01, lane EXT · audit §6.2 · ADR-0376 D5)*
>
> The component programme introduces the first endpoints in this graph that are **not element
> instances** (§1.5). Three edge families carry that axis. This clause writes their §2.6 four
> obligations **in advance**, which is the whole of the work §2.6 says is cheap only at the moment
> of introduction.
>
> ⛔ **THEY ARE NOT IN §2.1's REQUIRED SET TODAY, AND THIS CLAUSE DOES NOT PUT THEM THERE.**
> §2.5 forbids a writer-first unparking and §2.6 requires writer + typed reader in **ONE PR**.
> Listing a consumer-less family as REQUIRED would make `check-graph-write-coverage` — **already
> RC=3 at a shrink-only ledger of 0** — fail on three more families **because a document said so**.
> *A contract clause that turns a gate red without changing any behaviour is a regression with a
> citation attached.* **Each family joins §2.1 in the PR that lands its writer and its typed reader
> together, and its row moves in that same commit.**
>
> | Family | Endpoints (§1.5 node kinds) | The consumer that will make it REQUIRED |
> |---|---|---|
> | **`instantiates`** | *instance* → *definition* | the answer to *"what is this thing?"* for a placed component — the property panel, the schedule (C28), IFC entity resolution (C25), and the **definition-edit propagation** C65 §3.6 already mandates for types. Without it, an instance's definition is recoverable only by reading a field nothing else can traverse. |
> | **`specializes`** | *type* → *definition*, and *type* → *type* | C65's T1–T4 tiering made traversable: *"which types exist over this definition"*, which is the count C65 §3.6 requires the UI to state **before** an edit propagates. |
> | **`dependsOnDefinition`** | *definition* → *definition* | the nesting / reuse question (**D6**, OPEN): *"what breaks if this definition changes or is deleted?"* ⛔ It is also the **cycle** question — a definition graph without this edge cannot detect a definition that transitively contains itself, and `family-runtime`'s cycle detection covers **expressions**, not definitions. |
>
> **The four §2.6 obligations, per family, stated now so the landing PR is mechanical:**
>
> 1. **writer** — the command that creates the relationship, and **only** that command. ⛔ Not the
>    loader: a rebuild is a *disposition* (obligation 3), never a substitute for a writer, and
>    `CreateWallCommand` writing **zero** edges (§5.5) is the standing example of what that costs.
> 2. **typed reader** — a reader for *this family*, not a `getAll()` sweep (§1.3). ⚠ **Note what
>    §5.2's correction proves:** four REQUIRED families are write-only **today**, and the
>    allowlist entry in `GraphQueryService` that looked like a reader is disqualified by §1.3.
>    **Do not repeat that shape here** — an entry in a dynamic dispatcher is not the reader.
> 3. **rebuild disposition** — ⭐ **PERSIST-ONLY is the expected answer for all three, and that is a
>    finding, not a detail.** `instantiates` is authored, not derived: nothing about a placed
>    component's geometry lets a loader re-derive which definition minted it. So each lands **on the
>    named, shrink-only persist-or-lose ledger by name, in the same commit** (§5.4, §7.k — a ledger
>    in a document is not a ledger), and a snapshot lacking one **reports the named loss** (C70
>    I-INV-3). ⛔ **A component instance that loses `instantiates` on load is an element that no
>    longer knows what it is** — the most expensive silent loss this graph could carry.
> 4. **delete behaviour on BOTH endpoints, and what undo restores** — and the two endpoints are
>    **asymmetric**, which is why this obligation is not boilerplate here:
>    - deleting the **instance** purges its edges, and undo restores them **verbatim** (§5.6's
>      reference shape — reconstruction is impossible);
>    - deleting a **definition** with live instances is **not a cascade question, it is a REFUSAL
>      question**, and it is the same one C65 §3.4 already answers for a missing type: the instances
>      MUST resolve to a visible, named **unresolved** state, never a silent default, and never a
>      silent cascade-delete of the user's placed elements. ⛔ **Deleting a definition MUST NOT
>      delete instances**, and this contract records that here so nobody derives the opposite from
>      §5.6's purge rule, which is about *edges*, not about *elements*.
>
> > **§2.7.1 — MUST NOT overload an existing edge.** `partOf` (unit containment) and `contains` are
> > **instance→instance**; `instantiates` is instance→definition. Emitting a definition id under
> > either name poisons the AI world model with no error anywhere — §3.2's measured argument, one
> > vocabulary over. ⚠ And per §3.3, **a near-miss name is worse than a new name**: do not mint
> > `instanceOf` beside `instantiates`, or `dependsOn` beside `dependsOnDefinition`.
>
> > **§2.7.2 — MUST NOT** add any of the three to `RelationshipType` **before** its landing PR.
> > A declared member with no writer and no reader is §7.a's manufactured defect, and the gate
> > counts it.

---

## §3 — `joinedTo`: wall ↔ wall connectivity

This section is the normative form of [ADR-0321](../adrs/ADR-0321-wall-connectivity-is-joinedTo-not-connectedTo.md).

> **§3.1 — MUST.** Wall ↔ wall connectivity is written as **`joinedTo`**, both directions, by a
> writer that reads the **retained junction index**, carrying
> `metadata: { junctionType: 'L'|'T'|'Y'|'X'|'N-WAY', junctionDegree }`.

> **§3.2 — MUST NOT overload `connectedTo`.** `connectedTo` is documented at its declaration as
> *room ↔ room via door* and **both production readers consume it as rooms**. Emitting wall ids
> under that name is not a wiring task; it is a vocabulary change with two live consumers in the
> blast radius — one of which enumerates relationships untyped into **AI context**, which would
> poison the world model with no error anywhere. The separation matches IFC's own:
> `IfcRelConnectsPathElements` is a different relationship from space connectivity, so the export
> mapping stays 1:1.

> **§3.3 — MUST NOT name it `connectsTo`.** One letter of edit distance from `connectedTo` is a
> review hazard: the two would be confused in greps, in chat capabilities, and in every future
> audit. **The near-miss name is worse than a new name.** `joinedTo` greps cleanly to its own
> machinery (`WallJoinResolver`, `WallJunctionRecord`, "wall joins" throughout ADR-0055).

> **§3.4 — MUST. Stale-edge removal is part of the writer, not a follow-up.** Edges for a level
> are **removed and re-emitted at flush**. `addRelationship` idempotency alone lets a wall that
> *stops* joining keep its stale edge forever — idempotency prevents duplicates, never staleness.

> **§3.5 — MUST NOT** use `WallJunctionRecord.id` as a stored key. It is a within-solve handle and
> **renumbers when walls move**. The stored identity is the participant wall id pair plus the
> junction type.

> **§3.6 — rebuild disposition: REGENERATED.** Junctions are derived and the rebuild source is
> the retained index, so `joinedTo` is **not** persist-or-lose. Delete behaviour is inherited from
> the wall-family cascade purge (§5.6).

> **§3.7 — status, stated honestly.** ADR-0321 is ACCEPTED.
> > ✅ **LANDED 2026-08-12 (`56ee3337`).** The prior text read *"`joinedTo` is not yet a member of
> > `RelationshipType` and no writer exists … C-INV-2 is UNPROVEN."* That is now false, in the good
> > direction. `joinedTo` is a `RelationshipType` member with all four §2.6 elements: a writer
> > (`WallRebuildCoordinator.writeJoinedToEdgesForLevel`, remove-and-re-emit at flush so a wall that
> > *stops* joining drops its edge), a typed reader (`getJoinedWalls` — an unknown wall refuses with
> > a named reason, never `[]`), its rebuild disposition (REGENERATED — not snapshot-rebuilt, the
> > flush regenerates it), and its delete behaviour (the wall-family cascade purges it, undo restores
> > it verbatim). Proven by executed tests including the staleness-removal case against the real
> > retained junction index. **C-INV-2 moves UNPROVEN → proven-at-the-mechanism-level**; the one
> > residual is live-session reachability of the flush call site (unit-proven, wiring compiles, no
> > running-editor probe yet) — that residual, not the mechanism, is what remains UNPROVEN.

---

## §4 — The three graphs stay separate

There are three graph-shaped stores in this repository, and they are **not** three copies of one
thing:

| Store | What it is | Who owns it |
|---|---|---|
| **SemanticGraph** (`packages/core-app-model/src/SemanticGraph.ts`) | the retained typed-edge record over model elements — the subject of §§1–3 | this contract |
| **RoomGraphService** (`packages/spatial-index/`) | a lazily-rebuilt room connectivity index for spatial queries, invalidated by explicit call | spatial reasoning |
| **UBG** (`packages/building-graph/`) | the Unified Building Graph — the aggregate/projection model | [C52](C52-EDITABLE-BUILDING-GRAPH.md), ADR-0058 |

> **§4.1 — MUST NOT merge the stores.** Merging them would change the serialized shape of
> `ProjectSnapshot` and **break snapshot v3 for a naming preference**. Three stores with three
> jobs is the correct design; one store with three responsibilities is a migration with no
> capability on the other side.

> **§4.2 — MUST. The UBG's vocabulary is the canonical QUERY vocabulary.** Consumers ask topology
> questions in the UBG's terms; the other two **map onto it**. This is what C70 **D-INV-1** means
> by *one canonical query vocabulary*: one vocabulary at the query surface, three stores beneath
> it, mappings declared in code rather than assumed by name.

> **§4.3 — MUST NOT infer coverage across graphs.** `precededBy` / `supersedes` / `branchedFrom`
> exist in **both** `SemanticGraph` and `packages/building-graph/src/types.ts`. Their presence in
> the UBG is **not** SemanticGraph coverage. **Greps that conflated the two have already produced
> one false capability claim in this repository** (EV-04 §1, ADR-0320 Consequences). Every gate in
> §6 declares which graph it measures, and measures exactly that one.

> **§4.4 — MUST.** A query that cannot be answered **refuses with a named reason**. `[]` may only
> ever mean *"zero results"*. `RoomGraphService`'s three indistinguishable cases and
> `SpeculativeEngine`'s guard-on-a-method-that-does-not-exist returning `[]` are the measured
> anti-targets, and they are the reason this rule is written here rather than assumed from C70
> L-INV-1.

---

## §5 — Measured facts this contract encodes

**Measured at HEAD by the Phase 0 sweeps, 2026-08-11/12.** These are dated findings, not
invariants; each is superseded by the gate that will keep it true (§6). Per §0.1 they are
recorded once, here.

**§5.1 — 25 declared types; 13 without a first-party writer.** `RelationshipType` declares 25
members. **12 have zero writers and zero readers** anywhere in production; **`contains` has no
first-party writer at all** — it is reachable only through the IFC import type union. So 13 of 25
carry no first-party write path (EV-04 §1). ➜ `check-graph-write-coverage`.

> ⚠ **SHARPENED 2026-08-12 by `check-graph-write-coverage` (first reading: exit 1, 5 findings at a
> named ledger of 5).** The IFC escape hatch above is illusory: `IfcImporter.ts:491` sits under the
> `adjacentTo|boundedBy` ternary at `:490`, so the `contains` arm is unreachable. **`contains` has
> no writer on ANY path, native or imported.** The same reading finds `partOf` with no writer, and
> `hostedBy` and `sitsOn` with writers but **no typed reader** — `sitsOn` at 18 writers / 0 readers,
> the widest write-only family in the estate. A write-only family is a §1.3 declaration, not a
> capability, and C71 §4.3 forbids inferring coverage from the writer alone.

> ⛔ **§5.2 IS INVERTED — corrected 2026-08-18. Read this before acting on it.**
>
> §5.2 concludes that *"a first-party `contains` writer is a **named Tier-2 gap**"*. **The writer
> exists.** `grep -n "contains" packages/command-registry/src/furniture/CreateFurnitureCommand.ts`
> → the edge is written at **`:250`** (`type: 'contains'`), and the comment block at **`:212-243`
> cites C71 §5.2 itself as its motivation** — this section was ACTED ON, and then not updated.
>
> **The live failure is the OPPOSITE half, and this contract does not name it.**
> `npx tsx tools/ga-gate/check-graph-write-coverage.ts` → **RC=3**, and all four unledgered
> findings are *missing typed READERS*, not missing writers:
>
> > `⛔ UNLEDGERED contains/reader — REQUIRED family 'contains' has NO typed production reader —`
> > `write-only state nobody can query. (1 allowlist-only mention at`
> > `packages/ai-host/src/graph/GraphQueryService.ts:148 — an allowlist for a dynamic reader is not`
> > `a typed reader, C71 §1.3)`
>
> The same finding stands for **`hosts` (`:143`)**, **`boundedBy` (`:147`)** and
> **`connectedTo` (`:145`)** — **four REQUIRED families, all write-only.** §5.2's own §1.3 rule is
> what disqualifies the reads it counted: an allowlist entry in a dynamic dispatcher is not a typed
> reader.
>
> ⛔ **An engineer following §5.2 literally builds the half that already exists while the failing
> half stays unnamed.** The Tier-2 gap to close is **a typed production reader for each of the four
> families**, and the ledger is **SHRINK-ONLY at 0** — do not raise it.
>
> ⚠ **Knock-on:** [C83](./C83-SPATIAL-VALIDITY-AND-DESIGN-LOGIC.md) §0.2.3 states the `contains`
> edge *"does not exist on ANY path"*. That was true when C83 was written and is **now stale on the
> write side** — though C83's operative instruction (*"C83 rules MUST resolve containment
> geometrically and MUST NOT read the edge"*) is **unaffected and still correct**, because the
> reader the rules would need is exactly what the gate says is missing.

**§5.2 — `contains` is read-only, and the read is worse than it looks.** Two production surfaces
read it — the AI world model, and the hierarchy tree. On any project not imported from IFC both
ask a question always answered "nothing", and **cannot distinguish that from "this room contains
nothing"**. The hierarchy tree's read is additionally broken through a method that has never
existed, so its Furniture group has never rendered (EV-05 §1 + correction). A first-party
`contains` writer is a **named Tier-2 gap**, not a background nicety.

**§5.3 — `_rebuildSemanticGraph` exists in ONE place.**

> ⚠ **CORRECTED 2026-08-12 by `check-graph-persistence` ARM D.** This section previously read
> "exists in TWO byte-identical copies", naming `packages/persistence-client/src/loader/ProjectLoader.ts`
> and `apps/editor/src/engine/persistence/ProjectLoader.ts`. **That is no longer true.** Both loaders
> now import a single extracted `packages/persistence-client/src/loader/rebuildSemanticGraph.ts`;
> the literal identifier survives only in a `SemanticGraph.ts:82` docblock. Per §0.1 the gate's
> executed reading supersedes dated prose, and the gate prints this supersession on every run.
> The §6 arm (d) — *exactly one* rebuild — therefore **passes today**, and its job is now to keep
> it that way rather than to report a known duplication.

The regenerated set is `hosts`, `hostedBy`, `boundedBy`, `adjacentTo`, `partOf`, and the rebuild
fires only when the graph is empty (EV-04 §3). ➜ `check-graph-persistence` ARM D.

**§5.4 — the persist-or-lose set is `connectedByLift`, `measuredAt`, `decidedBy`.**

> ⚠ **CORRECTED 2026-08-12 by `check-graph-persistence` (first reading: exit 1, 3 findings at a
> named ledger of 3).** This section previously named five families — `sitsOn`, `supports`,
> `connectedTo`, `connectedByStair`, `connectedByLift`. The measured classification is
> **9 regenerated-loader · 1 regenerated-flush · 16 persist-only**, and it corrects the prose in
> **both directions**: four of the five named families (`sitsOn`, `supports`, `connectedTo`,
> `connectedByStair`) are loader-regenerated and were never persist-or-lose; while **two families
> the list never named — `measuredAt` and `decidedBy` — are persist-or-lose WITH live writers**,
> and lose silently on a pre-graph snapshot. The old list was simultaneously too long and
> incomplete, which is precisely why §7.k forbids leaving a ledger as prose.

A project loaded from a pre-graph snapshot **permanently loses** a persist-or-lose family until the
elements are re-created. The ledger is now mechanical, named and shrink-only at
`tools/rac-conformance/certification/gates/graph-persistence-debt.json`, satisfying C70 **I-INV-2**.
➜ `check-graph-persistence`.

**§5.5 — `CreateWallCommand` writes no edges at all.** Zero graph calls (EV-04 §2, EXECUTED). The
loader rebuild is currently the *only* source of a wall's graph presence — and per §5.3 that
rebuild regenerates neither `sitsOn` nor `joinedTo`.

**§5.6 — the wall-family delete purge landed.** Commit `3ee632f6` — *"deleting a wall no longer
strands its edges — and undo restores them verbatim, because reconstruction is impossible"*. It is
the **reference shape** for semantic 6 of §1.2: purge on delete, **verbatim restore** on undo, and
the explicit reason that reconstruction is not an option. ➜ `check-graph-delete-integrity`.

**§5.7 — deserialize silently drops malformed edges.** Any relationship missing
`id`/`type`/`sourceId`/`targetId` is discarded on load. Defensible on load; the consequence is
that malformed edges are written and saved without complaint and vanish on the next load — **a
defect that self-erases on reload is a defect nobody can reproduce** (EV-04 §4).

**§5.8 — UNPROVEN, and named as such.** Mutation-update on **move** for every family (EV-05 §4) ·
whether undo of an edit reverses the SemanticGraph edges the same command wrote (EV-03 §10.3) ·
whether any writer that exists is actually **reached at runtime** — every claim in §5 is
source-level; **no runtime probe has been executed against a live graph**, and the graph has no
equivalent of the CA-21 read-back discipline that exists for verbs (EV-05 §4).

---

## §6 — The gates

Three gates, each naming **which graph** it measures (§4.3), each under C70 §5's four-exit-code
contract with a declared floor. All three belong beside the BIM 3.0 certification gates at
`tools/rac-conformance/certification/gates/`. ~~**Measured 2026-08-12: none of the three exists at
HEAD** — they are specified here, and until they exist the invariants they decide are UNPROVEN.~~

> ⛔ **CORRECTED 2026-08-18 — ALL THREE EXIST, AND ONE IS RED.** The sentence above was written in
> the **present tense**, so it rotted; the dated half was true on 2026-08-12 and is retained for
> that reason. Measured:
>
> ```
> ls tools/ga-gate/check-graph-write-coverage.ts >    tools/rac-conformance/certification/gates/check-graph-persistence.ts >    tools/rac-conformance/certification/gates/check-graph-delete-integrity.ts
> npx tsx tools/ga-gate/check-graph-write-coverage.ts > /tmp/gwc.txt 2>&1; echo "RC=$?" >> /tmp/gwc.txt
> ```
>
> `check-graph-write-coverage` landed under **`tools/ga-gate/`**, not the certification directory
> this section names — look in both places before concluding a gate is missing. It reads **RC=3**:
>
> > `→ [3] RATCHET EXCEEDED — check-graph-write-coverage (C71 §6 · C70 C-INV-1/C-INV-4): 4 finding(s) against a declared level of 0.`
>
> ⚠ **§5 has been citing these gates' output since before §6 declared them unbuilt.** A contract
> that quotes a gate's findings in one section and calls it non-existent in another is telling the
> reader two incompatible things; the quoting section was right.
>
> ⭐ **The authoring rule this section broke, and the fix to copy:** C74 and C75 wrote
> *"UNBUILT **at stamp time (2026-08-12)**, stated explicitly so absence is never inferred from
> omission."* **A dated historical claim cannot rot into a falsehood.** C71, C72 and C73 all wrote
> the present tense and all three became false. **Never write a build status in the present tense.
> Write it dated, or cite the gate's exit code.**

### `check-graph-write-coverage` — the vocabulary is scoped, and shrinking

| | |
|---|---|
| **Subject** | `RelationshipType` members read from `SemanticGraph.ts`, cross-referenced against writer and typed-reader call sites in `packages`, `apps`, `plugins`, excluding tests and excluding `SemanticGraph.ts` itself |
| **Asserts** | (a) every **REQUIRED** family (§2.1) has ≥1 production writer AND ≥1 **typed** reader (untyped sweeps excluded, §1.3); (b) no family has a writer without a reader — a **writer-first addition exits 3**, per §2.5; (c) every new member since the last run carries all four elements of §2.6; (d) PARKED members are **not counted** in either direction |
| **Floor** (exit **2**) | declared types read from source > 0 **and** ≥ the count of families the ledger names. A run that parsed no union, or resolved no call sites, is MISCONFIGURED — *not* "full coverage" |
| **Ledger** | named, shrink-only, checked in **both directions**: a family that reaches writer+reader must leave the ledger in the same commit (C70 §5.4/§5.5) |
| **Exit condition** | the ratchet over the REQUIRED nine reaches **0**, at which point the gate becomes hard-0 and leaves the debt ledger |

### `check-graph-delete-integrity` — no kind strands its edges

| | |
|---|---|
| **Subject** | every element kind's delete path, and the undo of each |
| **Asserts** | (a) each kind's delete purges **all** relationships for the deleted element — no kind is the exception the wall family used to be; (b) undo **restores the purged edges verbatim** (`3ee632f6` is the reference shape, §5.6); (c) a delete never returns an **empty cascade by design** (C70 F-INV-2); (d) no comment asserts that another mechanism performs the purge — the two-mechanisms-each-assuming-the-other defect is a finding |
| **Floor** (exit **2**) | delete paths discovered ≥ the number of kinds the element registry declares. Discovering fewer means the walk missed kinds, and a purge report over a subset is not a purge report |
| **Exit condition** | hard-0 across every kind, with the undo half proven by executed read-back rather than by the presence of a restore call |

### `check-graph-persistence` — persist-or-lose is named, never discovered

| | |
|---|---|
| **Subject** | the serialized `ProjectSnapshot` graph slice, and `_rebuildSemanticGraph` — **all copies of it** |
| **Asserts** | (a) every declared type is classified **regenerated** or **persist-only**, with no third state; (b) the persist-only set equals a **named, shrink-only ledger** — an unlisted persist-or-lose family is the surprise C70 I-INV-2 forbids, and a ledger entry no longer measured is **stale and exits 3**; (c) loading a snapshot that lacks a persist-only family **reports the named loss** rather than loading silently (C70 I-INV-3); (d) the rebuild function exists in **exactly one** place — the two byte-identical copies of §5.3 are a finding, because a rebuild widened in one copy and not the other is a divergence no test would see; (e) malformed edges dropped on deserialize are **counted and reported**, not silently discarded (§5.7) |
| **Floor** (exit **2**) | snapshot records compared > 0 **and** rebuild copies located ≥ 1. A comparator reporting "0 divergences" must report **how many edges it compared** |
| **Exit condition** | the persist-or-lose ledger is **empty**, or every remaining member is a founder-signed exception with a named reason (C70 §6.6) |

> **§6.1 — MUST.** These three gates measure **SemanticGraph**. A gate measuring the UBG or
> `RoomGraphService` is a different gate with a different subject and says so in its header
> (§4.3).

> **§6.2 — what these gates CANNOT see**, stated so nobody reads them as coverage: **(a)
> runtime reachability** — discovery is static, so a writer that exists but is never reached
> counts as present (§5.8); **(b) correctness** — a writer emitting the *wrong* edge passes every
> arm here; **(c) move-time invalidation** — semantic 5 of §1.2 has no arm in any of the three,
> and is the first thing to add; **(d) dynamic dispatch** — a reader reached only through a
> `getAll()` scan is invisible by design (§1.3), which is a deliberate under-count, not an
> oversight.

---

## §7 — Anti-patterns

- **§7.a — Adding a `RelationshipType` member with a writer and no reader.** §2.5/§2.6 — this is
  the `sitsOn` defect, manufactured on purpose.
- **§7.b — Counting parked families as missing capability.** §2.3.
- **§7.c — Deleting parked members to tidy the union.** §2.4 — it breaks snapshot v3 deserialize
  for a naming preference.
- **§7.d — Overloading an existing edge name.** §3.2. And a near-miss name is worse than a new
  one (§3.3).
- **§7.e — Treating `addRelationship` idempotency as staleness handling.** §3.4 — it prevents
  duplicates, never stale edges.
- **§7.f — Counting an untyped enumeration as a reader.** §1.3.
- **§7.g — Reading a UBG type name as SemanticGraph coverage.** §4.3 — it has already produced one
  false claim.
- **§7.h — Returning `[]` for "cannot answer".** §4.4.
- **§7.i — Merging the three graphs.** §4.1.
- **§7.j — Widening one copy of `_rebuildSemanticGraph`.** §5.3, §6 arm (d) — the copy left behind
  is the next silent loss.
- **§7.k — Leaving persist-or-lose as prose.** §5.4 — a ledger in a document is not a ledger.
- **§7.l — Inferring a node's KIND from its id prefix at a call site.** §1.5 — the prefix set is
  `ElementType` and it contains no *definition* and no *type*, so the inference is wrong for exactly
  the endpoints that need it.
- **§7.m — Promoting a family to REQUIRED in a DOCUMENT.** §2.7 — REQUIRED is earned by a writer
  and a typed reader landing together; a contract edit that turns a shrink-only gate red without
  changing behaviour is a regression with a citation attached.
- **§7.n — Cascading a DEFINITION delete into its instances.** §2.7 obligation 4 — the instances get
  C65 §3.4's visible unresolved state. Deleting a user's placed elements to tidy a graph edge is the
  most expensive possible reading of §5.6's purge rule.
