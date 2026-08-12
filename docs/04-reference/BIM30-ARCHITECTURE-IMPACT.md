# BIM 3.0 — architecture impact

> **Stamp**: 2026-08-12 · **Phase 0** of the founder's BIM 3.0 master directive · **Branch**: `main` · **HEAD**: `2824a8e4`
> **Why this document exists**: the directive's **§18 architecture rule** requires an architecture-impact document to exist, and to answer ten questions, **before any architecture or topology rewrite is proposed**. This document exists so that the rule is satisfied *and so that the answer is on the record when it is NO*.
> **Input**: [`BIM30-GAP-REGISTER.md`](BIM30-GAP-REGISTER.md) §9 (the implementation-type distribution) and §0.1 (the headline finding) · [`BIM30-DO-NOT-REBUILD.md`](BIM30-DO-NOT-REBUILD.md) (the protection half) · [C71 §4](../02-decisions/contracts/C71-GRAPH-AND-TOPOLOGY.md) (the three graphs) · [`BIM30-CONTINUITY-DELIVERABLE.md`](BIM30-CONTINUITY-DELIVERABLE.md) §E, §H.
> **Companion**: [`BIM30-IMPLEMENTATION-ROADMAP.md`](../03-execution/plans/BIM30-IMPLEMENTATION-ROADMAP.md) — every phase in it carries *architecture impact: none*, and this document is why.
> **Doctrine**: where evidence is absent the entry reads **UNPROVEN** (C70 §0.2). This document performs no measurement of its own.

---

## §1 — The verdict

> # NO ARCHITECTURAL CHANGE REQUIRED.

**And it is a count, not a conclusion.** The gap register classifies **82 gaps** into **86
type-instances**, one of ten implementation types. The row for ARCHITECTURAL CHANGE — *"the current
structure cannot host the fix; something must be replaced"* — reads **0**.

| Implementation type | Count |
|---|---|
| **INVARIANT** | 48 |
| **WIRING** | 18 |
| **MISSING PERSISTENCE** | 6 |
| **MISSING VERB** | 4 |
| **MISSING ALGORITHM** | 3 |
| **MISSING COLLABORATION** | 3 |
| **RETENTION** | 2 |
| **EXPOSURE** | 1 |
| **MISSING SOLVER** | 1 |
| **ARCHITECTURAL CHANGE** | **0** |

*(Distribution quoted from [gap register §9](BIM30-GAP-REGISTER.md#9--implementation-type-distribution); counts rot in documents — re-derive from the register, not from this table.)*

**Why the distinction between a count and a conclusion is load-bearing.** A conclusion would say
*"the architecture is right"*. This says something narrower and more defensible: **of the defects
that have been found and classified, none requires replacing a subsystem.** Eighty-two rows,
spanning six contracts and all twelve pillars, and the REPLACE list is empty — and it **survived
the §17 downgrades**, the two re-measurements that made the report worse without adding a single
replacement item (CD §H). A defect nobody has found yet is in none of these counts (register
§11.5).

**The corollary is a warning, not a comfort**, and it is quoted because softening it would invert
its meaning: *a repository whose entire defect list is wiring and invariants is a repository where
reading the code will always look better than running it.* That is precisely the condition under
which ~15 gates went green-and-blind, a compile gate fabricated ~90 PASS lines per run for its
entire life, and an empty seed scored better than any real run. **The absence of architectural
change raises the value of the gates; it does not lower it.**

---

## §2 — The one candidate considered, and rejected

**Proposal.** Merge the dual edge vocabulary: `SemanticGraph`'s ~25 declared relationship types and
the UBG's 10-edge aggregate/projection vocabulary become one store with one vocabulary. The
motivation is real — C70 D-INV-1 requires *one canonical query vocabulary*, and two vocabularies
have **already produced one false capability claim in this repository**, when a grep conflated
`precededBy` / `supersedes` / `branchedFrom` in the UBG with coverage in `SemanticGraph`
(C71 §4.3, EV-04 §1).

**Status: REJECTED. Resolved by mapping instead** (C71 §4.2, CD §E).

### The ten questions

> **A note on provenance, per this document's own doctrine.** The founder's master directive is not
> checked into this repository — `grep` for it returns only the documents that cite it. The ten
> questions below are therefore stated in the form the §18 rule requires (what, why, what breaks,
> what it costs, how it is undone, what the smaller alternative is), **reconstructed from the
> citing documents rather than quoted verbatim**. The *questions'* exact wording is **UNPROVEN**;
> the *answers* are cited. Anyone holding the directive text should reconcile the headings — and
> the answers should survive that reconciliation, because they are answers about the system, not
> about the phrasing.

| # | Question | Answer for the dual-vocabulary merge |
|---|---|---|
| **1** | **What exactly would change?** | Three graph-shaped stores collapse to one: `SemanticGraph` (`packages/core-app-model/`, the retained typed-edge record, **serialized verbatim into snapshot v3**), `RoomGraphService` (`packages/spatial-index/`, the lazily-rebuilt room-connectivity index), and the UBG (`packages/building-graph/`, the pure Zod-validated aggregate/projection vocabulary). Their union becomes one type union and one store. |
| **2** | **What capability does the change deliver that the current structure cannot host?** | **None.** This is the disqualifying answer, and it is first for that reason. The capability C70 D-INV-1 asks for is *one canonical query vocabulary at the surface* — not one store. §4 answers it in full. |
| **3** | **Why CAN the existing system do this without the change?** | **Mapping.** C71 §4.2 is binding and already decided: **the UBG's vocabulary is the canonical QUERY vocabulary**; consumers ask topology questions in the UBG's terms and the other two stores **map onto it, with the mappings declared in code rather than assumed by name**. One vocabulary at the query surface, three stores beneath it. The exposure work is GR-16 — a `composeRuntime` slot plus `graph.query` / `graph.neighbors` / `graph.path` in the existing read-only capability class. It is classified **EXPOSURE + MISSING VERB**, not architectural change. |
| **4** | **What breaks?** | **Snapshot v3 deserialization, for every persisted project.** `ProjectSnapshot` carries `semanticGraph` at schema v3, serialized verbatim, every edge, no filtering. Merging the stores **changes the serialized shape** (C71 §4.1, DO-NOT-REBUILD §12). The same constraint forbids the neighbouring tidy-up: the 12 PARKED relationship types may not be deleted, because removing a union member **breaks `deserialize` on any snapshot carrying one** (C71 §2.4). And the failure is the invisible kind — the file still opens. |
| **5** | **What else breaks that is not obvious?** | `RoomGraphService` is **the repository's one proven G5 computation** (20/20 tests: BFS pathfinding, connected components, accessibility). It is the only deterministic-reasoning-grade computation in the product, and it is the one with the most to lose from being folded into a store with two other responsibilities. Separately, `connectedTo` would be under pressure to carry wall connectivity — both production readers consume it as **rooms**, and one enumerates relationships **untyped into AI context**, so the overload would **poison the AI world model with no error anywhere** (C71 §3.2). |
| **6** | **What is the migration cost?** | A **snapshot version bump (v3 → v4) with a forward migration for every persisted project**, plus a re-verification of the identity round-trip that currently reads **0 CLEAN across 17/17 kinds keeping id *and* GUID**, plus re-establishing the persistence suite's **0 FAILED**. `ifcData.guid` is AUTHORITATIVE with **no tolerance, ever** — it is the IFC round-trip join key, and a re-minted GUID breaks correspondence with every previously exported IFC file **invisibly, because both files still open** (ADR-0319, DO-NOT-REBUILD §12). Cost in engineer-time is **not estimated here** — estimating it would be an inference, and the answer does not depend on it. |
| **7** | **What is the rollback?** | **There is no clean one.** Code rolls back with a revert; **data does not.** Once a v4 snapshot has been written by any client, reverting the code strands those projects on a format the reverted loader cannot read. A rollback would itself require a reverse migration, written and tested in advance — i.e. the rollback plan is a second migration. Contrast the mapping alternative, whose rollback is a revert of a mapping file and a `composeRuntime` slot, with **zero persisted data touched**. |
| **8** | **What is the smaller alternative, and is it sufficient?** | Mapping (question 3), plus the two edge additions the register already schedules: `joinedTo` as a new member with a writer over the **already-retained** junction index (GR-04, ADR-0321), and a first-party `contains` writer where containment is already computed (GR-01). **Sufficient: yes** — D-INV-1/2/3 are satisfied at the query surface, which is where the contract states them. |
| **9** | **What does the change cost if we are wrong about the capability?** | Asymmetric, and that asymmetry is the decision. Wrong about **mapping** → write the merge later, having lost a mapping file. Wrong about **merging** → every persisted project has been migrated to a shape that delivered nothing, and the rollback is a second migration. C71 §4.1's phrasing is the whole argument: *one store with three responsibilities is **a migration with no capability on the other side***. |
| **10** | **What is the standing decision, and who may revisit it?** | **REJECTED**, recorded at C71 §4.1 (MUST NOT), C71 §7.i (anti-pattern), DO-NOT-REBUILD §13 row 1, and gap register §0.1. Revisiting requires a superseding **ADR** with evidence, not a plan, a roadmap or a refactor PR — and it must add a row to §5 of this document first. |

### The one-sentence reason

**Merging would break snapshot v3 for every persisted project in exchange for a naming preference;
mapping delivers the same contract invariant, in code, with no migration and a one-commit
rollback.**

---

## §3 — Construction that is NOT architecture change

Three items in the register are **new code**. None of them is a rewrite, and conflating the two is
how a wiring list becomes a rewrite proposal (register §0.1).

| Item | Gap | What makes it construction, not architecture change |
|---|---|---|
| **The planegcs WASM binding** | CO-04 (MISSING SOLVER) | It **fills an existing adapter**. `PlanegcsAdapter` and the `SolverPorter` shape already exist and are already the seam every caller goes through; the binding replaces a delegate behind an interface nobody else sees. No call site changes. **And it is unauthorised**: `planegcs` is a dependency of **zero** workspaces, and C74 §4.5 stands — *no constraint family in this repository has been shown to require SOLVING*. Construction that is not architecture change **and not yet permitted** are three different statements; all three hold here. |
| **The model-space constraint store** | CO-09 (MISSING PERSISTENCE) | It **follows the component editor's existing store pattern** (CD §H). A new store instance of a shape the system already has is not a new structure. It opens only when a family reaches C74 §4.2(c) with evidence. |
| **A real clash-detection engine** | GE-06 (MISSING ALGORITHM + MISSING VERB) | **A UI stub exists; the engine does not.** `ClashDetectionToolbarCommands` declares 12 ids, `ClashDetectionToolbar.ts` emits 12 ids, and **only 3 are common to both**; measured at HEAD there is no handler in any plugin and no detector anywhere in the tree. The engine is a new algorithm behind an existing toolbar and an existing command-bus surface. The *first* change is not the engine at all — it is making the ten unhandled ids **refuse** instead of silently no-op (C70 L-INV-1). |

*(The register's §0.1 lists a fourth construction item, the general 2-D boolean (GE-05). It is
construction on the same reading — ≥5 independent half-plane clippers exist, no general clipper and
no union primitive — and it likewise replaces nothing.)*

### Why the distinction matters, stated once and plainly

**Construction inside an existing boundary is not a rewrite.** A rewrite is defined by what it
*replaces*: it invalidates persisted data, changes a serialized shape, moves a boundary, or forces
call sites to change. None of the four does any of that.

The distinction matters because it is load-bearing in **both** directions:

- **Downward** — it stops a wiring list from being read as a rewrite proposal. "We need a solver, a
  boolean and a clash engine" sounds like a new architecture and is not; each fills a socket that
  already exists.
- **Upward** — it stops construction from being smuggled in as wiring. The register labels these
  four **rather than hiding them**, precisely because the failure mode in this repository is the
  opposite one: *authored-but-unwired*, found five times in one session. A missing subsystem is not
  a disconnected one, and no amount of wiring produces a 2-D boolean.

---

## §4 — The standing rule for the future

> **MUST.** Any later proposal for architectural change — merging stores, changing the serialized
> shape of `ProjectSnapshot`, moving a layer boundary, replacing a subsystem — **adds a row to §5
> of this document answering the same ten questions of §2, with evidence, before any code is
> written.**

> **MUST.** **The default answer is NO CHANGE.** A proposal that cannot name a capability the
> current structure *cannot host* (question 2) is rejected at question 2 and goes no further. The
> burden is on the proposal, and it is not discharged by an argument that the result would be
> tidier: C71 §4.1's standing verdict is that breaking snapshot v3 **for a naming preference** is
> the paradigm case of a change that must not happen.

> **MUST.** A proposal that would change the serialized shape of `ProjectSnapshot` must state its
> **forward migration and its reverse migration** in the same document, because a code revert is
> not a rollback once a client has written the new shape (§2 question 7).

> **MUST NOT.** An architecture change may not be adopted by roadmap, by plan, by PR description or
> by refactor. It is adopted by a **superseding ADR** that cites this document's row, or not at
> all (C71 §7.i, DO-NOT-REBUILD §13 rows 1 and 22).

### §4.1 — The rows

*(empty at stamp time — no architectural change has been proposed and accepted.)*

| # | Proposal | Date | Verdict | Where the ten answers live |
|---|---|---|---|---|
| 1 | Merge the dual edge vocabulary (three graphs → one) | 2026-08-12 | **REJECTED** | §2 above |

---

## §5 — What could still overturn this

Stated so the verdict is falsifiable rather than defended. **Each item below is a finding that, if
it arrived with evidence, would justify re-opening §1** — and none of them has arrived.

1. **A required BIM 3.0 invariant proves unrepresentable in snapshot v3.** The verdict rests on
   *"new fields land optional with an `UNKNOWN`-with-reason default so existing snapshots parse
   unchanged"* (C75 §2.5, DO-NOT-REBUILD §12). If a C70 invariant needed a **required** field, a
   changed field *type*, or a restructured edge record, the additive route closes and a version bump
   becomes unavoidable. **The nearest live test of this is PV-02** — the five-value provenance type
   in `packages/schemas` — and C75 §7.4 requires it verified **against a pre-change snapshot**. Until
   that verification is executed, representability is **UNPROVEN, not proven**.
2. **Collaboration merge semantics prove impossible over the current store shapes.** C70 K-INV-1/2
   require concurrent edits to a host and its hosted element to converge with the hosting edge
   intact, and any lossy merge to produce a resolvable conflict artefact. **No CRDT transport is
   deployed in any environment** (CB-01), so this is UNPROVEN *by construction* — and it is the one
   item on this list that could plausibly demand a store-shape change, because CRDT convergence is a
   property of data shape, not of wiring. The local evidence is encouraging and **is not the test**:
   the hosting edge survives concurrent editing locally, single-client. **Verdict: UNPROVEN, and the
   deciding evidence is behind a founder decision.**
3. **`joinedTo`'s writer proves it cannot key on anything stable.** C71 §3.5 forbids keying on
   `WallJunctionRecord.id` because it renumbers when walls move. The mitigation is remove-and-re-emit
   per level (§3.4). If no stable key exists at all for wall-to-wall connectivity, the retained
   junction index would need a shape change — not a rewrite, but the first real pressure on a
   persisted structure. **UNPROVEN until GR-04 lands.**
4. **The reachability probes contradict the source-level reading at scale.** **No runtime probe has
   ever executed against a live graph** (GR-18); every claim in EV-04/EV-05 is source-level, and this
   whole verdict is built on classifications derived from reading. If the CE-05 reachability
   instrument class shows that the machinery which "exists" is systematically unreachable in the
   composed runtime — not in ones and twos but as a pattern — then *"the structure can host the
   fix"* becomes a claim about code that never runs. **This is the most likely of the five to
   arrive**, and it would not necessarily change the verdict; it would change what the verdict is
   about.
5. **A defect nobody has found yet.** Register §11.5: the counts describe how the **known** defects
   distribute. The verdict is over 82 rows, not over the repository. **A count of zero over a
   discovered set is not a proof over an undiscovered one** — which is the same sentence this
   repository already learned about empty seeds.

**None of the five is currently evidence for change.** Items 1, 2 and 3 are UNPROVEN and have named
instruments that will decide them (PV-02's pre-change snapshot verification; CB-01's transport;
GR-04's writer). Item 4 has a named instrument that does not exist yet (CE-05). Item 5 is
unfalsifiable by construction and is listed so that the verdict is never mistaken for a guarantee.

---

## §6 — What this document does NOT establish

1. **It performs no measurement.** The distribution in §1 is quoted from the gap register; the
   protections are quoted from the contracts and DO-NOT-REBUILD. **Read the gate, not this line**
   (C70 §0.2).
2. **"No architectural change required" is not "the architecture is good."** It is the statement
   that no *classified gap* requires replacing a subsystem. The layer model's own honest residue —
   `runtime-composer` is not really L3, `core-app-model` sits at L2 while importing L4, and the
   eight backend packages have **no layer at all** — is recorded in `CLAUDE.md`, is outside the BIM
   3.0 gap register's scope, and is untouched by this verdict.
3. **It does not estimate.** No engineer-time figure appears for the rejected merge (§2 question 6),
   deliberately: the rejection does not depend on the number, and supplying one would invite the
   decision to be re-litigated on the number.
4. **It does not authorise the construction items.** §3 says the planegcs binding, the constraint
   store, the clash engine and the 2-D boolean are not architecture changes. **Three of the four are
   not authorised by anything**, and CO-04 is explicitly unauthorised while C74 §4.5 stands.
5. **The ten questions are reconstructed, not quoted.** See the note in §2. The directive text is
   not in this repository.
