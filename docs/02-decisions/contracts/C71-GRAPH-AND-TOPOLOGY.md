# C71 — Graph & topology: the relationship vocabulary and its per-edge semantics

> **Stamp**: 2026-08-12 · **Status**: CANONICAL
> **Scope**: the relationship vocabulary of the model graph — which edge families are REQUIRED, which are PARKED, how a parked family is unparked, how a new one is added, and the **six semantics every edge must carry** before it may be called a capability. Owns the rule that the **three graphs stay separate**, and the three gates that keep the vocabulary honest. It does **not** own what a command is (C03/C16), what persists (C05/C47), or what BIM 3.0 is as a whole ([C70](C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md)).
> **Key principle**: *An edge is only real when a writer and a reader agree it exists.* A declared type with no consumer is not partial progress — it is a false signal that inflates every coverage census and misleads every audit that greps for capability.
> **Authority**: subordinate to `STR-03` / `STR-04`, to [C70](C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md) (whose pillar-C and pillar-D invariants this contract implements), and to two ACCEPTED ADRs it may not contradict: [**ADR-0320**](../adrs/ADR-0320-relationship-vocabulary-scoped-by-consumers.md) (the vocabulary is scoped by measured consumers) and [**ADR-0321**](../adrs/ADR-0321-wall-connectivity-is-joinedTo-not-connectedTo.md) (`joinedTo`). Peers with **C52** (owns the UBG as an *editable* surface), **C27** (owns the Inspect tree that reads the graph), **C15** (owns hosting), **C11** (owns creation), **C05**/**C47** (own the snapshot and its versioning), **C69** (owns the verbs that carry these writes). Supersedes nothing.
> **Evidence** (READ-ONLY, cited never restated): [`EV-05`](../../04-reference/bim30-evidence/EV-05-relationship-coverage-ledger.md) — the coverage ledger incl. its same-day correction · [`EV-04`](../../04-reference/bim30-evidence/EV-04-semanticgraph-write-coverage.md) — per-kind write coverage · [`EV-03`](../../04-reference/bim30-evidence/EV-03-change-impact.md) — propagation traces · [`BIM30-EVOLUTION-AUDIT.md`](../../04-reference/BIM30-EVOLUTION-AUDIT.md) §17.
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

> **§3.7 — status, stated honestly.** ADR-0321 is ACCEPTED; **measured 2026-08-12, `joinedTo` is
> not yet a member of `RelationshipType` and no writer exists.** It is a *decided, unlanded*
> family. Until it lands with all four elements of §2.6, C70's **C-INV-2** (wall connectivity is a
> lookup, never a per-query re-run of the resolver) is **UNPROVEN**, and no document may record it
> otherwise.

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

**§5.2 — `contains` is read-only, and the read is worse than it looks.** Two production surfaces
read it — the AI world model, and the hierarchy tree. On any project not imported from IFC both
ask a question always answered "nothing", and **cannot distinguish that from "this room contains
nothing"**. The hierarchy tree's read is additionally broken through a method that has never
existed, so its Furniture group has never rendered (EV-05 §1 + correction). A first-party
`contains` writer is a **named Tier-2 gap**, not a background nicety.

**§5.3 — `_rebuildSemanticGraph` exists in TWO byte-identical copies and regenerates 5 of 25
types.** The copies are at `packages/persistence-client/src/loader/ProjectLoader.ts` and
`apps/editor/src/engine/persistence/ProjectLoader.ts` (both confirmed present at HEAD,
2026-08-12); the regenerated set is `hosts`, `hostedBy`, `boundedBy`, `adjacentTo`, `partOf`, and
the rebuild fires only when the graph is empty (EV-04 §3).

**§5.4 — therefore `sitsOn`, `supports`, `connectedTo`, `connectedByStair` and `connectedByLift`
are PERSIST-OR-LOSE.** A project loaded from a pre-graph snapshot **permanently loses** them until
the elements are re-created. **That list is currently prose in EV-05 §3 with NO gate** — which is
exactly the state C70 **I-INV-2** forbids: the persist-or-lose ledger must be named, mechanical and
shrink-only. ➜ `check-graph-persistence`.

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
`tools/rac-conformance/certification/gates/`. **Measured 2026-08-12: none of the three exists at
HEAD** — they are specified here, and until they exist the invariants they decide are UNPROVEN.

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
