# BIM 3.0 — the implementation roadmap

> **Stamp**: 2026-08-15 · **Branch**: `main`
> **Scope**: this document is the **forward plan** for both halves of BIM 3.0. It is one of exactly
> two surviving BIM30 planning documents. The other is
> [`BIM30-MASTER-COMPLETION-TRACKER.md`](BIM30-MASTER-COMPLETION-TRACKER.md), which holds **measured
> state**. Nothing on this page is a status reading.
> **Authority**: [C70](../../02-decisions/contracts/C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md) ·
> [C71](../../02-decisions/contracts/C71-GRAPH-AND-TOPOLOGY.md) ·
> [C72](../../02-decisions/contracts/C72-PROPAGATION-AND-PREVSTATE.md) ·
> [C73](../../02-decisions/contracts/C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) ·
> [C74](../../02-decisions/contracts/C74-CONSTRAINT-HONESTY.md) ·
> [C75](../../02-decisions/contracts/C75-PROVENANCE.md) · C78 · C79 · C80 · C81 · C82 · C83.
> Where this plan and a contract disagree, **the contract wins**.
> **Doctrine**: no ordering below is chosen for convenience. Every edge in the sequence points at a
> dependency that can be named. Where no dependency exists and no evidence orders two items, they
> are stated as **parallel**, not ranked. Where evidence is absent the entry reads **UNPROVEN** —
> neither a pass nor a fail (C70 §0.2). Where a fact is genuinely unknown it reads **NOT
> DETERMINED**, and that is a permitted answer.

---

## §0 — What this document is, and how to read it

### §0.1 — The two-document rule

This roadmap carries **plan only**: objectives, dependency edges, exit *conditions*, sub-phase
inventories, protected subsystems, gate-engineering rules, and scope boundaries.

It carries **no status readings, no counts of closed rows, no percentages-complete, and no dates**.
Those live exclusively in `BIM30-MASTER-COMPLETION-TRACKER.md` and in the gates' own ledger JSON.

| This document answers | The tracker answers |
|---|---|
| What must be built, and in what order, and why that order | What has been measured, and at which SHA |
| What "done" would mean for each phase — the falsifiable exit condition | Which exit conditions are met |
| What must not be rebuilt | Which gates are green, red, or UNPROVEN |
| Which items are founder-blocked and what unblocks them | What the current counted position is |

**The reason, stated so it is not re-litigated: a plan that carries its own status drifts from the
gate that measures it.** The corpus this document replaces contained a roadmap header saying "84
rows", a tracker headline saying "34 of 82", a tracker §8 saying the headline was stale, and a
session brief carrying three mutually inconsistent counted positions — all true when written, all
read as current. A number written into a plan is a number nobody re-runs. **Counts rot in documents
and do not rot in gates. Read the gate.**

**How to cite state from here.** Reference a tracker row **id** — `GR-xx` (graph/relationships),
`PR-xx` (propagation), `MT-xx` (model truth), `CO-xx` (constraints), `PV-xx` (provenance),
`CE-xx` (certification), `GE-xx` (geometry), `CB-xx` (collaboration) — and let the tracker supply
its state. Never copy a reading across.

### §0.2 — Conflict-resolution order

Per `CLAUDE.md`, strongest first:

**`docs/01-strategy/STR-03-engineering-vision.md` → `docs/01-strategy/STR-04-architecture.md` →
the contract suite (as enumerated by `docs/02-decisions/contracts/README.md`) → ADRs
(`docs/02-decisions/adrs/`) → SPECs (`docs/03-execution/specs/`) → this plan.**

Two corrections a reader needs before using that ordering:

- **`CLAUDE.md` states the suite as C01–C68. That is stale.** The suite now runs to **C83**, with
  **C76 never minted** (see §9.4). The BIM 3.0 contracts — C70–C75, C78–C83 — sit *above* this
  plan in the ordering and none of them appears in `CLAUDE.md`'s stated range. Defer to
  `contracts/README.md`, never to the range written in `CLAUDE.md`.
- **This plan is the weakest artefact in the list.** When code disagrees with a contract, the code
  is wrong. When *this document* disagrees with a contract, **this document is wrong** and is
  edited in place. An architecture change is never adopted by roadmap (§6.4).

### §0.3 — ⭐ THE SCHEME DECODER — three rival "Phase A/B/C" letterings existed. This is how they resolve.

**This is the single most important structural section in the rewrite.** The corpus used the
letters A/B/C for three different things and the digits 0–9 for two more. A future reader who finds
an old reference to "Phase B" or "Phase 3" in a commit message, an ADR, a contract, or a comment
must be able to decode it. That is what this table is for.

| Scheme | Where it was used | What its labels meant | Status now |
|---|---|---|---|
| **Capability phases A–H** | tracker §2 | A instrument · B model truth + first golden op · C relationships that survive · D cascade across all elements · E provenance · F regeneration · G constraints & determinism · H collaboration | ⭐ **ADOPTED as the spine of Half 1.** Letters kept. See §3. |
| **Numbered phases 0R · 1 · 2 · 3 · 4 · 5 · 6 · 7 · 8 · 9 · F** | the previous edition of this roadmap, §1 | dependency-ordered substrate work, no letters | ⭐ **RETAINED as the DEPENDENCY ORDERING underneath A–H.** Not a rival plan. Mapping table at §3.1. |
| **Percentage-milestone phases A / B / C** | the session brief, §2.3–§2.5 | A ≈ "next session's slice" · B ≈ "the drains" · C ≈ "the long pole" | ⛔ **RETIRED as a letter scheme.** Its content survives as execution scheduling, renamed **Waves** (Wave 1 / Wave 2 / Wave 3). See §10. |
| **Reasoning-loop R0–R9** | `BIM30-REASONING-LOOP-PLAN.md` | the product reasoning loop: disposition → contract → planner → preview → execution → report → confirmation → parity → provenance → certification | ✅ **PRESERVED as a distinct interleaved track**, with its substrate edges. Not merged into A–H. See §5. |
| **Certification-suite phases 0–5** | `BIM30-CERTIFICATION-PLAN.md` §6 | gate-suite build order: plan → Tier-1/2 static gates → `seedBuilding30` → `report.ts` → Tier-3 gates → meta-gate | ✅ **PRESERVED, scoped to the harness only.** Cross-referenced at §7.8. It is not a programme phase scheme. |
| **C83 slices S0 · S1 · Slice C · S3 · S4** | spatial-validity programme | an adjacent, founder-requested capability programme | ✅ **Adjacent track, pointer only.** Not one of the 82 (§1.2). Sequencing at §10.4. |

**Decoding an old reference.**

| If you find… | It almost certainly means… | Read here |
|---|---|---|
| "Phase A is closed" in a session brief dated on or before 2026-08-15 | the **percentage-milestone** Phase A → **Wave 1** | §10.1 |
| "Phase A" in the tracker, or beside the words *instrument what exists* | the **capability** Phase A | §3.2 |
| "Phase C is open and its first three defects are fixed" | the **percentage-milestone** Phase C → **Wave 3** | §10.3 |
| "Phase C" beside *relationships that survive* or *writer + typed reader* | the **capability** Phase C | §3.4 |
| "Phase 3", "Phase 5", "Phase 8" bare | the **numbered dependency** phases | §3.1 |
| "Phase F" | ⚠ **ambiguous by construction** — the numbered scheme's **BLOCKED-ON-FOUNDER** bucket *and* the capability scheme's **regeneration** phase. Disambiguate by content: collaboration/sync → §9; regeneration/authored-work-protection → §3.7 |
| "Phase 0" in a certification context | the **certification-suite** phase 0 | §7.8 |
| "R2", "R7" | the **reasoning loop** | §5 |

⚠ **The `F` collision is real and is not resolved by renaming**, because both usages are cited in
committed artefacts. It is recorded here so a reader disambiguates by content rather than by
assuming. **New work must not mint a sixth scheme.**

### §0.4 — ⭐ The denominator: 84 rows, 82 classified gaps, 86 type-instances

The gap register carries **84 unique row ids** — `GR` 18 · `PR` 13 · `GE` 12 · `CO` 12 · `PV` 8 ·
`MT` 10 · `CB` 5 · `CE` 6. Two of those rows are **not gaps**: **GR-02** (the PARKED relationship
types — parked is not a gap) and **GR-03** (a recount note). That leaves **82 classified gaps**.
Four rows carry two implementation types each (**GR-06, GR-16, PR-10, GE-06**), giving **86
type-instances**, which is the denominator the implementation-type distribution is taken over.

> **84 rows − 2 non-gap rows = 82 classified gaps = 86 type-instances.**
> **Say all three, or the confusion re-opens.**

This reconciliation existed in the gap register and **in neither of the two surviving documents**.
The previous edition of this roadmap said "84 rows" in its header and "82" in its §3 and §4; the
tracker said "82". Both were correct and neither explained itself. **That is exactly the class of
unexplained discrepancy this rewrite exists to kill.**

**Corollary, binding**: `X/82` is the trust programme's fraction and **only** the trust programme's
(§1). Generator quality and the edit layer have their own denominators and may not be folded in.

### §0.5 — How to use this document

1. **Starting a phase** — read §2 (the ordering rules) first, then the phase's own section in §3.
   The ordering rules are what produced the order; without them the order is arbitrary and will be
   re-litigated by every new lane.
2. **Building a gate** — read §7 before writing a line. In particular §7.4, the **residency rule**,
   which decides which runner your gate belongs to, and §7.6, which decides how a red-on-arrival
   reading is filed.
3. **About to refactor, consolidate, "clean up" or replace a subsystem** — read §6 first. It is not
   an appendix. Its entire purpose is preventing wasted rebuilds, and it has already prevented
   several.
4. **About to propose an architecture or topology change** — read §6.4 first. The default answer is
   NO CHANGE and the burden is on the proposal.
5. **Wondering what to do next week** — §10, and only §10. Everything else in this document is
   durable; §10 is volatile by design.
6. **Wondering where the programme stands** — not here. The tracker.

### §0.6 — What this document does NOT establish

Carried forward from the previous edition, because the list is load-bearing:

- **No measurement was performed for it.** Every fact here is cited to the artefact that measured
  it, or marked UNPROVEN / NOT DETERMINED.
- **No duration, no estimate, no date.** Inventing one would be the inference §2.3 forbids. The
  only dates in this document are **expiry dates on obligations other artefacts already set**
  (§9.4).
- **No severity ranking.** Priority is a founder decision. The order here is a *dependency* order.
- **Parallelism is not scheduled.** Phases 5–8 of the numbered scheme share no dependency edge and
  may run concurrently once 1–3 are in place, but **who runs what is not derivable from evidence.**
- **Whether any existing gate is green today is deliberately absent.** See §0.1.
- **"No architectural change required" is not "the architecture is good."** See §6.4.

---

## §1 — The three programmes that must never be merged

| Programme | The question it asks | Denominator | Where its state lives |
|---|---|---|---|
| **BIM 3.0 — TRUST** | *when the model changes, does PRYZM stay truthful?* | **82 register rows** (§0.4) | `BIM30-MASTER-COMPLETION-TRACKER.md` |
| **GENERATIVE QUALITY** | *when PRYZM generates a design, is the design correct?* | **28** = 4 typology packs × 7 readiness gates | `GENERATIVE-QUALITY-MASTER-TRACKER.md` |
| **THE EDIT LAYER** | *can PRYZM change a design and keep its intent?* | **not yet enumerable** | ibid. §2.3 |

### §1.1 — Why merging destroys `X/82` — the reasoning, verbatim

> *"a generator can produce a sealed bedroom in a model whose relationship graph is flawless, and a
> model can lose a moved wall in a plan whose circulation is perfect. The failure modes are
> independent, so the counts must be. Merging them would destroy the meaning of `X/82` and no
> arithmetic would recover the split afterwards. **Cross-reference freely; never merge.**"*

The mechanism is worth stating plainly: the two programmes fail for unrelated reasons, so a single
fraction over their union would move for reasons the reader could not attribute — and because the
merge is lossy, **the split could not be recovered afterwards by any arithmetic**. It is a one-way
door.

**Binding consequence**: a lane closing a generator-quality row **must not move this document's or
the trust tracker's numerator**, and vice versa. The generative programme has its own tracker and
its own denominator of 28.

### §1.2 — C83 (spatial validity) is likewise NOT one of the 82

C83 is a **founder-requested capability programme**, CANONICAL, binding on spatial-validity work —
and it is **a pointer row only** in the trust register, not one of the 82.

⚠ **A recorded governance gap, unresolved**: the gap register's Authority line names C70–C75 only.
*"A CANONICAL contract that binds spatial-validity work while sitting outside the register's stated
authority chain is a governance gap, not a defect."* It is recorded here so it is not lost with the
register section that recorded it. **NOT DETERMINED**: which artefact should own the fix.

### §1.3 — Two further items with executed evidence and no owning row

Recorded because they are structural gaps *in the register itself*, and would otherwise die with
the document that found them:

1. **L-861's class** — interior partitions re-welding to a moved host — is paid and
   founder-verified, but is neither GR-12 nor one of `check-move-propagation`'s families. It has
   no row.
2. **The first G6-shaped behaviour in the tree** (detect → ask → one-undoable-command) has **no
   cell in which to say so.** The register can record gaps and cannot record the arrival of a
   maturity behaviour.

---

## §2 — The six ordering rules

> ⚠ **Correction, applied here.** The previous edition headed this section *"The five ordering
> rules"* and then enumerated **six** (§0.1–§0.6). The distillation copied the heading without
> flagging the miscount. **There are six. They are numbered §2.1–§2.6 below and retain their
> original §0.n identifiers in parentheses so existing citations still resolve.**

These rules produced the phase order. They are stated **before** the phases so the order can be
audited against them rather than accepted.

### §2.1 (§0.1) — A gate lands BEFORE its implementation, and it lands RED

**Rule.** For every capability whose gate is specified-and-unbuilt, the gate ships first, is
negative-tested against a planted violation, and is expected to exit **1 DECLARED-LEVEL** at a
baseline pinned at its own measured reading — or **3** if the reading is worse than the ledger.
**A red gate on day one is the deliverable, not a failure of the phase.**

**Reason, and it is precedent, not preference.** BIM 2.0 closed at 9/10 with a score that never
moved by redefinition, because the ten criteria were written down before the work. The inverse is
also recorded, five times in one session: ~15 gates green-and-blind; a compile gate that fabricated
~90 PASS lines per run for its entire life; an empty seed that outscored every real run.
> *"**A capability implemented before its gate exists cannot be scored** — and in this repository,
> unscored capability has consistently read as working capability."*

C70 §4.1 makes the consequence binding: no level is awarded without an executed run.

### §2.2 (§0.2) — The six UNMAPPED gates are Phase-0 residue, not later work

**Rule.** The six GATE-class rows of the coverage matrix — move-time invalidation (**GR-12**), the
bespoke propagation trackers (**PR-09**), conflict-surfacing (**CB-04**), refusal reachability at
the UI (**GE-09**), the `./compliance` rule enumeration (**CO-12**), and clash detection
(**GE-06**) — are closed in Phase 0R, before any capability phase opens.

**Reason.** The blocker to being scoreable at all is not the gap count; it is that thirteen
coverage-matrix entries are unmapped, six of them gates, and **a domain with an unmapped gate
cannot be scored at all**. The propagation row is the sharp one: §6.2 protects the bespoke
propagation trackers because **Level 4 rests on them**, and the same source concedes they are *the
least instrumented subsystem in the product*. The one thing holding up the only maturity level
PRYZM currently has is ungated.
> *"**Instrumenting what already works ranks above building what does not**"* — the first protects
> an award already made; the second only pursues one not yet made.

**The honest limit on this rule, stated rather than smoothed over.** Two of the six arms attach to
gates that do not exist yet: the move-time arm belongs to the three C71 gates (GR-12 blocked-by
GR-11), and the enumeration arm belongs to `check-constraint-honesty` (CO-12 blocked-by CO-11).
Those two ship in Phase 0R as **written arm specifications with subject, floor and negative test
defined**, and their code lands with the host gate in Phase 1 — **in the same PR**, so the host
gate is never merged without them. The other four need no host and ship as code in Phase 0R.

### §2.3 (§0.3) — Dependency, not size

**Rule.** Phases are ordered by the edges the register records in its **blocked-by** column and by
edges derivable from the contracts. **Effort is never an ordering input.**

**Reason, with three worked examples:**

- **`joinedTo` needs a writer before its gate can pass.** GR-04 is G0 with no member in
  `RelationshipType`; the gate's own arm makes a **writer-first addition exit 3** (C71 §6) — so the
  writer and the reader land together, and the ratchet cannot reach 0 over the REQUIRED families
  until they do. The gate still lands first (§2.1); it lands red.
- **The epsilon policy needs one declared constant before any predicate migration.** Collapsing
  rival ray casts with different degenerate guards *before* a declared numeric-zero epsilon exists
  means **the collapse picks a behaviour silently** — the C73 §3.7 violation. The constant is the
  oracle the collapse is measured against.
- **Provenance fields need the export-mapping question answered before they can be called
  complete.** PV-04 is C75 §5's own **largest open risk**: provenance that stops at the export
  boundary is how a generated guess lands in an IFC export as a surveyed fact. C75 §7.7 permits
  exactly two terminal states — the mapping exists, or its absence is recorded **by name** as an
  accepted limitation. It may not be left blank, and until it is one of the two, the provenance
  phase is not exitable.

### §2.4 (§0.4) — One family per PR for the predicate canonicalisations

**Rule.** Each predicate family in C73 §3.1 is **one PR**: canonical file, structural counting
gate, named exclusions, baseline pinned at the reading, **shipping consumer identified by name
first**. No sweep.

**Reason.** C73 §3.5 is a MUST NOT and gives the mechanism: the polygon-offset fix succeeded
because it was one family with an oracle at a known answer (300 mm eave, spread 0.000) and the
shipping path identified first.
> *"A sweep replacing 61 ray casts in one change has **no oracle and no bisect**."*

C73 §3.6 adds the reason the naive version fails: **the offset defect was never "three copies" — it
was that the fix and the shipping code were different files.** Collapsing onto a copy the shipping
path cannot reach reads as done and is not.

### §2.5 (§0.5) — Adapter truthfulness before solver binding, and never in the same commit

**Rule.** CO-01 (report the `kind` performed + a non-suppressible first-call production signal),
CO-02 (not-configured ≠ configured-and-failed) and CO-03 (the tests name the configuration they do
not cover) land in their **own commits**, before any binding work — and **no binding work is
authorised at all** until CO-08 has classified a family at C74 §4.2(c) with evidence.

**Reason, quoted in full because paraphrase destroys it.** C74 §4.3:
> *"If the truthfulness fix and the real binding land together, the fix is invisible: the adapter
> starts telling the truth in the same commit that makes the truth flattering, and the organisation
> learns nothing about the fact that a mock shipped for months behind passing tests. **The lesson is
> the deliverable.**"*

C74 §4.4 closes the other escape: the honesty fix may **not** be deferred until the binding is
ready, because C74 §3.1–§3.3 are satisfiable today with no new dependency.

### §2.6 (§0.6) — Founder-gated items are BLOCKED-ON-FOUNDER and are not scheduled

**Rule.** CB-01, CB-02, CB-05 and MT-08 appear in the BLOCKED-ON-FOUNDER bucket (§9), which has
**no position in the sequence and no predicted date**. Nothing downstream of them may be scheduled
as though they will arrive.

**Reason.** C70 §2.2 names collaboration the standing example of UNPROVEN-by-construction, and
BIM 2.0 recorded 9/10 as *the declared arithmetic maximum without the sync server, stated on day
one so the number could not be quietly redefined*. MT-08 is explicitly **not** taken as decided by
the founder's ratification of ADR-0321 (see §9.2).
> *"**Scheduling a founder decision as a task is how a decision becomes an assumption.**"*

---

## §3 — HALF 1 · The capability phases A → H

Half 1 is the **trust** programme: *when the model changes, does PRYZM stay truthful?* Its spine is
the eight capability phases **A–H**, because they are the only scheme in the corpus that states
**what a user gets** per phase and they are exit-testable.

**Every phase carries `architecture impact: none`**, and that is a *consequence* of the register's
measured **ARCHITECTURAL CHANGE = 0 of 86 type-instances**, not an assumption of this plan. The
distribution behind it: INVARIANT 48 · WIRING 18 · MISSING PERSISTENCE 6 · MISSING VERB 4 · MISSING
ALGORITHM 3 · MISSING COLLABORATION 3 · RETENTION 2 · EXPOSURE 1 · MISSING SOLVER 1 (unauthorised) ·
**ARCHITECTURAL CHANGE 0**.

> ⭐ **The distribution is the argument.** *"An audit of **existence** passes in this repository; an
> audit of **reachability** is the one that fails."* And its corollary, quoted because softening it
> inverts it: *"a repository whose entire defect list is wiring and invariants is a repository where
> **reading the code will always look better than running it**… **The absence of architectural
> change raises the value of the gates, it does not lower it.**"*

### §3.1 — ⭐ The A–H ↔ 0R–9 mapping, and the numbered phases as dependency ordering

The numbered phases are **not a rival plan**. They are the dependency ordering *underneath* the
capability phases: the substrate work that must be true before a capability phase can exit.

| Capability phase | Maps to numbered phase(s) | Also consumes |
|---|---|---|
| **A** — instrument what exists | **0R** + **1** | — |
| **B** — model truth + first golden operation | **2** | reasoning loop **R1–R6** |
| **C** — relationships that survive | **3** | — |
| **D** — the cascade across all elements | **5** | reasoning loop **R7**; graph exposure **4** |
| **E** — provenance at element grain | **8** | reasoning loop **R8** |
| **F** — regeneration you can trust | C80 (no numbered phase) | blocks on E |
| **G** — constraints & determinism | **6** + **7** | — |
| **H** — collaboration | **BLOCKED-ON-FOUNDER** (§9) | — |
| *(no capability phase)* | **4** — graph exposure | folded into D's prerequisites |
| *(no capability phase)* | **9** — certification completion | spans A–G; see §7.8 |

⚠ **Two numbered phases have no capability phase of their own.** Phase **4** (graph exposure — the
Level 5 phase) is a prerequisite of D rather than a capability a user names; Phase **9**
(certification completion) is cross-cutting. Neither is dropped; both are stated below.

#### §3.1.1 — The numbered phases, in dependency order

| # | Objective | Prerequisites | Rows | Measurable exit condition | Owning gates |
|---|---|---|---|---|---|
| **0R** | Instrument what already works. No domain in the coverage matrix remains unscoreable; every GATE-class UNMAPPED row becomes a built gate or a written arm spec bound to a Phase 1 host gate | none (entry point) | PR-09 · GE-09 · CB-04 · GE-06 (refusal half) · GR-12 (spec) · CO-12 (spec) | GATE class reads **zero UNMAPPED rows**; each of the six carries a gate file or a spec with subject/floor/recorded negative test; **12 of 12 clash ids have a handler or refuse**, no silent no-op | new bespoke-propagation gate + refusal-reachability arm, exit 0 or 1-at-pinned-baseline, **never 2** |
| **1** | The gate wave (**expected RED**). Every gate C70 §7 names exists at HEAD, establishes its subject, obeys the one exit-code contract, **and has been watched go red** | 0R | GR-11 · PR-08 · GE-07 · CO-11 · PV-07 · CE-01 · CB-03 | All C70 §7 gates have a file at HEAD; `certify.ts` runs the full set; **zero exit-2s**; every exit-1 against a **named** ledger; every arm has a recorded red observation; `check-collab-graph-integrity` reports **UNPROVEN, not green** | the specified-and-unbuilt gate set + CB-03 suite consolidation |
| **2** | Model truth — ADR-0318 per kind. Every mutation lands in a store the composition root can name | 1 | MT-01…MT-07 | `wall.create` / `slab.create` / `room.create` **readback-positive on the composed bus**; zero registered verbs answer with silence; SHADOWED and ABSENT-headless kinds each strictly below their pinned tracker reading; zero `??` window-global fallbacks in `engineLauncher`; **one** declared authority for openings and **one** for levels | `check-identity-roundtrip` stays CLEAN across all kinds; `check-derived-classification` reaches floor |
| **3** | Graph writers, persistence, honest reads. Every REQUIRED relationship has a production writer + typed production reader; rebuild is not a lossy slice; a read distinguishes empty from failed | 1 + 2 (MT-01) | GR-01, 04, 05, 06, 07, 08, 09, 10, 13, 14, 15, 17, 18 · PV-05 | `joinedTo` is a `RelationshipType` member with ≥1 writer and ≥1 **typed** reader; C-INV-2 proven by an executed run; `_rebuildSemanticGraph` in **exactly one** file; the persist-or-lose ledger is a **file**, shrink-only; **zero** production read paths return `[]` for "cannot answer"; a room survives a bounding-wall move **beyond 2.0 m** with its id intact | `check-graph-write-coverage` · `-delete-integrity` · `-persistence` · `check-topology-survives` |
| **4** | Graph exposure — **the Level 5 phase.** The graph becomes a runtime service through the composed bus, AI included, with typed refusals | 3 | GR-16 | Three verbs exist on the composed runtime; each answers the golden query **and its refusal case** in an executed probe; AI reaches them through the same verbs; **zero of the three returns `[]` to mean "cannot answer"** | `check-graph-write-coverage` + CA-21 rows + the C69 register grading all three LIVE |
| **5** | Propagation: **both arms, or neither.** Every declared cascade has a live listener **and** a `prevState`-carrying emitter, or is deleted; suppression reversible | 1 + 2 (PR-13 first) | PR-01…07, 11, 12, 13 (+PR-10 partial) | `cascade-events.json.declaredFindings` reaches **0**; `StoreChangeEvent` carries a pre-mutation field; **S1 and S2 hard-0 with no exemptions**; `RECONCILABLE_TYPES` has a consumer for every type it names, or names only types it has | `check-propagation-reaches` · `check-prevstate-contract` · `check-suppression-is-reversible` + the 0R bespoke-tracker gate (**must not regress**) |
| **6** | Epsilon policy, then predicate canonicalisation. One declared tolerance policy from the layer that owns geometry; one canonical implementation per predicate family under it | 1 + **GE-01 before every other row in the phase** | GE-01, 03, 02, 12, 04, 11, 10 | `geometry-kernel` exports the declared tolerance module; every collapsed family's counting gate reads its declared **1**; the three `CesiumViewport` guards become one guard **with a written canonical decision**; the room index has one AABB definition + a passing concave-room regression; `wall.split` exists as an id over the opening-aware handler; **GE-08 remains UNPROVEN and is written as UNPROVEN** | `check-epsilon-policy` · `check-predicate-canonical` (**structural, never name-based** — see §7B.5) · `check-deterministic-regeneration` |
| **7** | Constraint honesty. No adapter reports a solve it did not perform; every family carries a written strength classification; violations become queryable model state | 1 + **§2.5 sequencing binding within the phase** | CO-01, 02, 03, 05, 06, 07, 08, 10 | C74 §7's seven conditions verbatim: the adapter reports what it performs **in its own commit**; `loadSolver` distinguishes the two failures; two gates built, negative-tested, hard; `check-no-hidden-mock` baseline at 0 and off `gate-debt.json`; one `StairValidationAuthority`; `createWorkerHandler` wired or deleted; **every** family carries a C74 §1.1 classification | `check-constraint-honesty` · `check-solver-is-real` · `check-no-hidden-mock` + CO-12's enumeration arm |
| **8** | Provenance at element grain. Every datum knows how it came to be known, one five-value vocabulary, never invented; the export boundary **answered** rather than blank | 1 + 2 (MT-01) | PV-01, 02, 03, 04, 06, 08 | C75 §7's seven conditions. Specifically: **zero** `?? '<member>'` / `\|\| '<member>'` defaults of a provenance union at any deserialisation or import boundary; a provenance type in `packages/schemas`; `check-provenance-coverage` at its per-kind target and off `gate-debt.json`; **PV-04 in one of its two terminal states, in writing** | `check-provenance-not-invented` (hard) · `check-provenance-coverage` · `check-derived-not-authored` (hard) |
| **9** | Certification completion. Every claim in domains 1–15 is an EXECUTED claim; the harness's blind spots named rather than closed by assertion | 1–8 | CE-02…06 · MT-09 · MT-10 | Zero UNPROVEN rows in the coverage matrix that are not **declared UNPROVEN with a named reason**; the Geometry axis scored from an executed headless fragment build; isolated-compilation failures and XSS sites each strictly below their pinned tracker readings | `certify.ts` over the complete gate set, **empty-seed impossibility intact** |
| **F** | **BLOCKED-ON-FOUNDER** — no position in the sequence, no predicted date | — | CB-01 · CB-02 · CB-05 · MT-08 | **Not schedulable.** See §9 | — |

> ⚠ **Two exit thresholds were deliberately de-numbered.** The previous edition wrote Phase 9's exit
> as *"isolated-compilation failures < 27"* and *"XSS sites < 8"*, and Phase 2's as *"SHADOWED < 9"*
> / *"ABSENT-headless kinds < 11"*. Those thresholds were set from readings, and at least one has
> since been corrected by execution (**27 → 26**, and 26 is itself an unre-run reading). A threshold
> frozen from a stale reading can be satisfied by a regression. **The exit is now expressed against
> the tracker's pinned reading**, which is the artefact that moves.

#### §3.1.2 — ⚠ Premises inside the numbered phases that were REFUTED by re-measurement

Carried as corrections, not deleted, so nobody re-derives them. **Each of these was a stated
premise of a phase row and each is now known false in the healthy direction.**

| Row | The premise as written | Verdict |
|---|---|---|
| **GE-01** (Phase 6) | *"`geometry-kernel` exports no epsilon at all"* | ⛔ **REFUTED** — four roles, eight consumers |
| **GE-09** (Phase 0R) | the *"Invalid geometry"* string is user-facing | ⛔ **REFUTED** — it exists nowhere user-facing |
| **CO-10** (Phase 7) | no production caller exists | ⛔ **REFUTED** — a production caller exists; **the real defect was the inverse** |
| **MT-06** (Phase 2) | the two opening stores can diverge | ⛔ **REFUTED** — they hold **disjoint facts** and cannot diverge |
| **MT-07** (Phase 2) | a rival store exists | ⛔ **REFUTED** — the rival was deleted months ago |
| **GR-01 / GR-11 / GR-16** | headline gaps | ⛔ **REFUTED in the healthy direction** — a `contains` writer exists; all three C71 gates are built; three `graph.*` verbs exist |
| **§3.1's "`check-relationship-determination` is a NAMED GAP with no file at HEAD"** | | ⛔ **REFUTED — the file exists**, with its ledger. **Do not repeat this claim.** See §4. |

> ⭐ **The standing rule this produces: RE-MEASURE BEFORE BUILDING.** Rows being wrong in the
> healthy direction is not good news about the rows; it is evidence that a register goes stale
> faster than it is read. *"A Phase 0 inventory that reports a gate as missing when it is present is
> exactly the wrong baseline that sends Phase 1 rebuilding what already exists."*

---

### §3.2 — PHASE A · Instrument what exists

**Maps to**: numbered **0R + 1**. **Entry**: none — this is the entry point of the programme.

**Objective.** Every domain becomes scoreable; every gate lands, red, at a named ledger, in one
suite, under one exit-code implementation.

> **CAPABILITY DELIVERED**: *none directly — and that is the point.* What the user gets is that
> **every subsequent claim is checkable**. Before Phase A, "wall-move is safe" was an opinion.
> After it, it is a gate reading that can go red. The founder-visible benefit: **no capability can
> silently regress from here**, and no status report can flatter itself.

**Exit condition (falsifiable).** Every C70 §7 gate exists at HEAD, in one suite, under one
`contract.ts`; **zero exit-2s**; every exit-1 against a **named** ledger; **every arm watched go
red**.

**Sub-phases.**

| # | Delivers | Exit test |
|---|---|---|
| **A.1** | C71 graph gates ×3 (GR-11, GR-13, GR-14) | three gate files at HEAD, each with a recorded negative-control failure text |
| **A.2** | C72 suppression + `prevState` gates (PR-08, PR-09) | suppression reversibility and `prevState` presence both measured, not asserted |
| **A.3** | C73 declared tolerance module + predicate counting gate (GE-01, GE-02) | the module is exported from `geometry-kernel`; the counting gate reads a pinned number |
| **A.4** | C73 determinism gate (GE-11) | gate exists and its ledger is named |
| **A.5** | C75 provenance gates ×2 (PV-07) | coverage + not-invented arms both present |
| **A.6** | C78 index-refusal + no-empty gates | a refusal is distinguishable from an empty result **in the exit code** |
| **A.7** | C79 region gates ×5 | five arms, each with a subject it establishes |
| **A.8** | C80 generation gate | a generation verb is discoverable by the gate; C80 §1's exit condition is met |
| **A.9** | CE-02 geometry-axis subject | the Geometry axis has a subject it can score over |
| **A.10** | **The integration commit (CB-03)** — register every gate into one suite | one suite, one `contract.ts`, no gate carrying its own exit codes |
| **A.11** | **Re-stamp the register** | every row's Status derives from a **re-run gate**, not from a commit subject (see §7B.2) |
| **A.12** | **Clear the exit-3 gates** — stale ledger entries and real breaches, separately | zero exit-3s; **exit 3 is never absorbable** (C70 §5.1) |
| **A.13** | **Audit the untrustworthy greens** | `check-collab-graph-integrity` reads UNPROVEN, not 0; `check-ai-human-parity` names in its exit code which half it simulates |

**Owning gates.** The full C70 §7 set, plus the two 0R gates from §2.2 (bespoke-propagation reach,
refusal reachability).

**Known traps.**
- ⭐ **A gate is not honest because its caveat is written down — it is honest when the caveat is in
  the exit code.** `check-collab-graph-integrity` exited **0** under a `✓` headline while its own
  spec says a green is structurally impossible without a transport, and *"this zero had already
  been cited elsewhere as 'GREEN'."* **Prose beneath a zero is not read by CI, by a status table, or
  by the next gate's ledger.** This is what A.13 exists for.
- **A gate registered in no runner reads true and enforces never.** Four committed gates once sat in
  no runner at all — *"not a gate that reads RED, but a gate that **runs nowhere**."* That specific
  instance is resolved; **the class recurs**, and §7.4/§7.5 are the guard.
- **The negative control is part of the gate, not part of the review.** Until a recorded red
  observation exists for an arm, **the arm is UNPROVEN and may not be cited as coverage** — even
  though the gate file exists and exits 0.

---

### §3.3 — PHASE B · Model truth & the first golden operation

**Maps to**: numbered **2**, plus reasoning-loop **R1–R6**. **Entry**: Phase A (numbered 1).

**Objective.** Mutations land in stores the composition root can name, and `wall.move` proves the
whole reasoning loop end to end.

> **CAPABILITY DELIVERED — the first thing a user can feel:**
> **The architect's what-if.** Drag a bedroom wall. *Before releasing*, a preview states: "Door
> D-04 refits · junction with W-12 re-welds · Kitchen 12.4 m² → 10.8 m²." Release on an illegal
> position and the move is **refused with both numbers**: "Kitchen would become 6.4 m²; minimum is
> 7.0 m²." Approval binds to that exact plan — if a collaborator moved something in between, the
> approval is refused and a fresh plan offered rather than silently applying a stale one. **One
> Ctrl+Z** returns wall, openings, junctions and room polygon together.

**Exit condition.** `wall.move` holds **all eleven Golden Chain links**, scored by the harness, with
`prevState` as the oracle.

**Sub-phases.**

| # | Delivers | Exit test |
|---|---|---|
| **B.1** | R1 — the consequence contract (types + envelope, no engine) in `packages/command-bus` | types compile; the envelope threads through `executeCommand` **unused-but-carried**; **zero behaviour change**; root `tsc` clean |
| **B.2** | R2 — the `wall.move` planner | `plan(wall.move)` returns a populated `ConsequencePlan` |
| **B.3** | R3 — preview, pure, **with a caller** | preview purity proven the strong way (see §5, G-REASON-01) |
| **B.4** | C78 §8 closed reason union (11 members) + typed `PreviewOutcome` | 23 rival reason values across 6 modules and 5 naming conventions collapse to **one closed 11-member union** |
| **B.5** | Plan-determinism gate (G-REASON-02) | same state + same command → same plan, twice, **byte-equal** |
| **B.6** | R4 — execution consumes the plan + reconciliation | the executed result is compared against the plan, not against itself |
| **B.7** | R5 — the consequence report | completeness per the declared contract, for `wall.move` |
| **B.8** | **R6 — confirmation policy + approval binding** | a stale approval is **refused**, not silently applied; the card renders the plan |
| **B.9** | Graph families restored on load (GR-17) | a family present before save is present after load |
| **B.10** | Undo does not walk the version counter | counters may differ across a restore, **never** across an undo |
| **B.11** | `command-registry` visible to CI | its suite runs in CI rather than locally only |
| **B.12** | **MT-01 readback-positive verbs** | `wall.create` / `slab.create` / `room.create` readback-positive **on the composed bus** |

**Owning gates.** `check-identity-roundtrip` · `check-derived-classification` ·
`check-plan-determinism`.

**Known traps.**
- ⭐ **Never reconstruct `prevState` by re-reading the store — it diffs a value against itself.**
- ⭐ **A classifier whose only reachable branch is its `no-prevState` branch may not ship.** This is
  not hypothetical: the openings fast path was unreachable **for want of two arguments**, and every
  existing classifier test passed throughout, **because each one built `prevState` by hand**. They
  tested the classifier; the broken thing was the **seam**.
- **The genericity is real of the service and not of the file.** Adding a planner family required
  **no service-class edit** — but `ConsequencePreviewService.ts` *the file* still changes, because
  the shared normalizer registry physically lives in it. ⭐ **Hoisting that registry into its own
  module would make C78 U-INV-5's claim checkable by diff** rather than by a test that has to
  adjudicate intent. **Open, named, cheap, and nobody has scheduled it.**
- **The confirmation policy is deliberately NOT a field on `ConsequencePlan`**, so a policy tweak
  does not change the plan hash and invalidate outstanding approvals. Do not "tidy" it onto the
  plan.
- **STR-06 §10 forbids the shortcut by name**: *"Never `if (command.isDestructive) showConfirm()` —
  that reproduces the gap."*

---

### §3.4 — PHASE C · Relationships that survive

**Maps to**: numbered **3**. **Entry**: Phase A (numbered 1) + Phase B's MT-01.

**Objective.** Every REQUIRED relationship gets a writer, a typed reader, delete-purge and verbatim
undo, and survives save → reload.

> **CAPABILITY DELIVERED:**
> **Nothing silently forgets.** Delete a wall and every relationship it carried is purged — then
> **Ctrl+Z restores them byte-identically**, not "reconstructed approximately." Save a project,
> reload it, and the model knows the same things it knew before: which walls bound which room, what
> sits on what. And when the system genuinely cannot determine something, the panel says **"cannot
> determine: no dependency index for stair → slab"** instead of showing an empty list that looks
> like "nothing is affected." *This is the difference between a tool that is silent and a tool that
> is trustworthy.*

**Exit condition.** Every REQUIRED family has writer + typed reader + rebuild + mutation-update on
**delete AND move**; the `check-no-empty-means-unknown` ledger is drained; the persist-or-lose
ledger is empty or founder-signed.

**The REQUIRED / PARKED split — part of the definition, not an implementation detail.**

| REQUIRED (9) | PARKED (12) |
|---|---|
| `hosts` / `hostedBy` · `boundedBy` · `adjacentTo` · `connectedTo` · `sitsOn` · `supports` · `contains` · `dependsOn` · **wall↔wall junctions (`joinedTo`)** | `unitOf` · `levelOf` · `servesZone` · `precededBy` · `supersedes` · `branchedFrom` · `causedFailureOf` · `wasMitigatedBy` · `exceededBenchmark` · `replacedBy` · `maintainedBy` · `decommissionedBefore` |

**PARKED is not a gap.** Parked types stay in the schema — removing them breaks snapshot v3 for a
naming preference — but **no gate requires them, no roadmap item populates them, and adding a
writer without a reader is a defect, not progress.** No census may count these as missing
capability.

> ⭐ Pillar C's governing sentence: *"**Topology that is re-detected on every query is a cache
> pretending to be knowledge; topology that is written and never read is vocabulary pretending to be
> capability.**"* An edge is only real *"when a writer and a reader agree it exists."*

**Sub-phases.**

| # | Delivers | Exit test |
|---|---|---|
| **C.1** | Delete-purge + verbatim undo: **stair, handrail, roof** | delete purges every edge; undo restores them **byte-identically** |
| **C.2** | Delete-purge + verbatim undo: **ceiling, floor** | as C.1; note ceiling purge is one axis wider (fixtures/diffusers/skylights strand their edges too) |
| **C.3** | Delete-purge + verbatim undo: **level** | ⚠ **the ledger for this row once named the WRONG strand set.** *"One edge per element on the level" is mostly unreachable* (`canExecute` refuses with children). **The reachable set is smaller and invisible to that guard** — stair/lift register on the **base** level only, so every top level carries two edges with empty `childrenIds`, passes the guard, and leaves the resolver believing a dead level is still reachable by stair |
| **C.3b** | `opening` and `grid` — **no edge writers today** | either **declare** them as coincidence rows or **write** the writer. Rows must not sit as declared-coincidence |
| **C.3c** | `addRelationship` identity | idempotency must not ignore the discriminator. **Author-keying was chosen over metadata-aware dedup** because `joinedTo` re-emits every junction each flush with **changing** metadata, so metadata-aware idempotency would make the hottest write path **duplicate-creating**. Identity threads through every verbatim-restore path and the graph rebuild |
| **C.3d** | The C79 §10.1 persistence probe | the probe is **green from an executed run**. ⚠ *"A contract claim resting on a red probe is the BY-READ failure C70 §0.1 forbids"* |
| **C.4** | The kinds that purge but restore nothing on undo (GR-06) | undo restores, not reconstructs |
| **C.5** | The kinds that reconstruct instead of restoring verbatim (GR-06) | byte-identical restore |
| **C.6** | `contains` — a live first-party writer (GR-04) | ⚠ **fix the ID-KEYED classification FIRST.** *"an ID-keyed `contains` is a claim about space maintained as a claim about identity… **Storing it today would be worse than the absence.**"* The rebuild half must never *mint* containment on load — that is the provenance-invented-on-load defect |
| **C.7** | `partOf` writer (GR-04) | ⚠ see §9.3 — ADR-0325 settles the hierarchy substrate; `partOf` is PARKED and `GraphQueryService` must stop answering a confident `[]` |
| **C.8** | `hostedBy` / `sitsOn` **typed readers** (GR-07) | `sitsOn` currently has many writers and **zero typed readers**; an edge with no reader is vocabulary, not capability |
| **C.9** | `measuredAt` / `decidedBy` persist-or-lose (GR-13) | the persist-or-lose ledger is a **file**, shrink-only |
| **C.10** | The `[]`-means-unknown drain (GR-10) | **zero** production read paths return `[]` for "cannot answer". Start with the `boundingWallIds` readers |
| **C.11** | The `boundingWallIds` three-layer defect (GR-17) | writer + rebuild + readers, all three. ⚠ **The rebuild layer is CLOSED** — the loader now reads the **top-level** field; the previous read of `room.boundary?.boundingWallIds` *"matched NO persisted snapshot ever"*. **Record it fixed; do not carry it as live.** |

**Owning gates.** `check-graph-write-coverage` · `check-graph-delete-integrity` ·
`check-graph-persistence` · `check-topology-survives` · `check-no-empty-means-unknown`.

**Known traps.**
- ⭐ **`[]` may only ever mean "zero results".** *"'I found nothing' and 'I could not look' are never
  the same value."* This is the whole phase in one line.
- ⭐ **A field that names a dependency and is structurally always empty is worse than no field**
  (`boundingWallIds` hardcoded `[]` at creation).
- **Writer-first is a defect, not progress** — a writer with no reader **exits 3, by design, and
  correctly**.
- **A near-miss name is worse than a new name.** Wall connectivity is `joinedTo`, **not
  `connectedTo` and not `connectsTo`**.
- **Never key on `WallJunctionRecord.id`** — it renumbers when walls move.
- ⭐ **Stale-edge removal is part of the writer, not a follow-up.** `addRelationship` idempotency
  prevents duplicates and **never** staleness: a wall that *stops* joining would keep its stale edge
  forever. Edges are removed and re-emitted per level at flush.
- **A conditional `len > 0 ? … : undefined` serialisation makes an empty collection and an absent
  collection identical** — the same value-collision shape as a bare `return null`.
- ⛔ **No test anywhere asserts that a relationship survives serialize → parse → load end-to-end.**
  A unit test that fabricates its fixture *in the implementation's shape* matches the bug rather
  than the real serializer output. This is how the top-level-field defect survived.
- **Two allow-lists diverging is how a field was silently dropped on reload.** Widening one of two
  byte-identical copies leaves *"the copy left behind"* as the next silent loss.

---

### §3.5 — PHASE D · The cascade across all elements

**Maps to**: numbered **5**, plus numbered **4** (graph exposure) as a prerequisite, plus
reasoning-loop **R7**. **Entry**: Phase A (numbered 1) + Phase B (numbered 2, PR-13 first).

**Objective.** Every element kind gets its planner; every declared cascade has **both arms**; the AI
reaches them through the same verbs.

> **CAPABILITY DELIVERED:**
> **Every edit explains itself — and the AI is a colleague, not a separate system.** Move a stair,
> resize a slab, delete a column: each produces a plan or a typed "I don't know why not." Draw a
> wall through a room and it refuses *naming the split it would cause*. And in chat: *"widen all
> corridors to 1.5 m"* → the **same planner**, the same preview card, the same refusals, one
> approval, one undo. The AI literally cannot obtain a different answer than a script, because
> parity is gate-measured and the bus is blind to who is calling.

**Exit condition.** All five golden operations hold their full chain; `normalize(human) ===
normalize(ai)`.

**The governing rule of the phase — both arms, or neither.** Every declared cascade has a live
listener **and** a `prevState`-carrying emitter, **or it is deleted**. A listener without
`prevState` can only invalidate wholesale — that is the ADR-057 defect. And *"listeners alone are
not enough, because `DependencyResolver` subscribes to the **bus**, not the stores, so `prevState`
never reaches it. **Both halves, or neither.**"*

**Numbered Phase 4 — graph exposure (the Level 5 phase), a prerequisite of D.** Three graph verbs
exist on the composed runtime; each answers **the golden query and its refusal case** in an
executed probe; AI reaches them through the same verbs; **zero of the three returns `[]` to mean
"cannot answer".** (⚠ The old premise *"zero graph verbs"* is **REFUTED** — `graph.query`,
`graph.neighbors` and `graph.path` are declared and wired.)

**Sub-phases.**

| # | Delivers | Exit test |
|---|---|---|
| **D.1** | C79 rows 6–8 — floor/ceiling by region carry references | the reference is carried, not re-derived. §10.3 decided: **DERIVE FROM THE ROOM** |
| **D.2** | C79 rows 9–10 — ceiling/floor plan tools gain region capability | obeys §10.3: **no new tracer** — a thin adapter over the same boundary sketch the row-6/7 commands call, so the repo's wall-tracer count is unchanged. An undetermined room boundary **refuses and creates nothing** |
| **D.2b** | ⚠ **Two rival creation paths for one element** — the plan tools' `floor.create` / `ceiling.create` bus dispatches route to the **plugin** handlers, not the fixed commands, and the plugin handler still writes `boundingWallIds: []` | one creation path per element kind, or both declared |
| **D.3** | `wall.create` planner | ⚠ **the chokepoint was NOT the map.** All three surfaces funnelled through a normalizer returning `null` for any other verb — *a planner in the map would still have been dead.* **That is C78 U-INV-5's nominal genericity exactly.** Now one shared factory + a verb→rule map, so a third row needs no service edit |
| **D.4** | `opening.move` planner | three dispatch spellings map to **ONE** semantic planner, deliberately, *so a door and a window on the same wall cannot get different collision answers*. Never-delete is **structural**: the removal list is a literal `[]` with **no parameter that could populate it** (C70 F-INV-3) |
| **D.4b** | Producer-side refusal-vocabulary conformance | ⚠ a producer emitted a reason beside a sub-reason whose **declared parent differs**. *"It survived 52 green tests because the vocabulary test validates **the map, not the emitters**."* The arm must check emitters |
| **D.5** | `furniture.generate` planner | a plan or a typed UNDETERMINED |
| **D.6** | The remaining ~10 families dispatching with no preview (PR-01…07) | ⚠ `MovePlanToolHandler` handles ≥11 families and **only the `wall` arm previews and only the `wall` arm confirms**. **STILL TRUE — verify before assuming otherwise** |
| **D.7** | R7 — AI/human parity gate | `normalize(human) === normalize(ai)`, excluding exactly actor / origin / timestamp / proposal |
| **D.8** | Floor finish — **no dependency at all today** (GR-18) | a declared dependency, or a declared absence |

**Owning gates.** `check-propagation-reaches` · `check-prevstate-contract` ·
`check-suppression-is-reversible` · `check-move-propagation` · `check-ai-human-parity` + the 0R
bespoke-tracker gate, **which must not regress**.

**Known traps.**
- ⭐ **THE FALSE GREEN.** See §7B.1. It happened in **this phase's** gate. Read it before touching
  `check-move-propagation`.
- **Registering a no-op and claiming coverage is the defect, not the fix.** For PR-11, **implement
  the handler FIRST**.
- **`RECONCILABLE_TYPES` is exported with zero consumers**, and the real reconcile rebuilds walls
  and slabs only, *"stranding columns, beams, stairs, roofs, furniture, curtain walls and
  handrails at the old elevation."* Either give every named type a consumer, or name only the types
  it has.
- ⚠ **Move-time invalidation has NO ARM and is UNPROVEN for every family.** *"This is the single
  most important blind spot… **normal editing is mostly moves.**"* A relationship can score ● on
  every measured arm and still be completely stale after a wall move.
- **The roof gap is NOT a missing call to an existing function.** The region detector *"cannot carry
  a host reference even in principle"* — it discards wall identity. **There is no field to fill
  in.** The user-visible promise is identical to slab's: *"Move a wall and the roof stays put,
  silently."*
- ⚠ **PR-05 is UPDATE-SURRENDER** (founder decision, §9.3). Its gate **stays at its declared level
  by design** — the arm counts production callers *outside* the defining file and the release is
  same-file. **The row's annotation is corrected; the row is NOT hand-struck.**

---

### §3.6 — PHASE E · Provenance at element grain

**Maps to**: numbered **8**, plus reasoning-loop **R8**. **Entry**: Phase A (numbered 1) + Phase B
(numbered 2 / MT-01).

**Objective.** Every value knows how it came to be known, in one five-value vocabulary, never
invented. **This is the tightest knot: C78, C79 and C80 all consume it.**

> **CAPABILITY DELIVERED:**
> **"Who decided this, and how?"** Click any element — a wall thickness, a room area, a window head
> height — and get a truthful answer: *you drew this* · *measured from the survey* · *computed from
> the model* · *inferred from a default, here is the assumption* · *regenerated, and here is what it
> replaced*. **A guess never wears your name.** This is the foundation for professional liability:
> an architect can defend a drawing because the model can say where every number came from.

**Exit condition.** Every element carries an origin; the unknown value appears only on pre-migration
data and is **never silently rewritten**; `check-provenance-coverage` reaches its per-kind target
and leaves `gate-debt.json`; **PV-04 is in one of its two terminal states, in writing**.

**The vocabulary — five values, and the rules that keep it honest.**

| Value | Meaning |
|---|---|
| **AUTHORED** | a human decided it |
| **OBSERVED** | measured from a survey or an instrument |
| **COMPUTED** | derived deterministically from model state |
| **INFERRED** | derived from an assumption, **which is named** |
| **REGENERATED** | produced by a generator, **and what it replaced is recorded** |

- **The one absolute rule: provenance is never invented.**
- **COMPUTED and INFERRED may never be merged** (C75 §1.2).
- **`VALUE_ORIGINS` is a DECLARATION order, not a strength order — no code may treat the index as a
  rank.**
- ⭐ **`SystemWritableOrigin = Exclude<ValueOrigin,'authored'>`** — `authored` is excluded **by
  type**, so a generation / repair / import / migration path taking this type **cannot stamp human
  authorship on machine output**. Unrepresentable at the call site rather than caught by a gate
  afterwards.
- ⭐ **There is no `unknown` member, and its absence is the design** — *"it would immediately become
  the thing a `??` defaults to."* Instead there is a defaulted origin **plus six named unknown
  reasons**: `not-recorded` · `predates-provenance` · `producer-not-instrumented` ·
  `source-did-not-state` · `lost-in-transform` · `conflicting-records`.

**Sub-phases.**

| # | Delivers | Exit test |
|---|---|---|
| **E.1** | The five-value vocabulary in `packages/schemas` (PV-03) | ⚠ it must be **in the root barrel**. A subpath-only export means *"the vocabulary is not merely unadopted; it is **not even visible**"* to anyone importing from `@pryzm/schemas` |
| **E.2** | `check-provenance-coverage` per-kind ratchet (PV-07) | a per-kind target, shrink-only |
| **E.3** | PV-01 — an unknown origin is no longer upgraded to authoritative | no upgrade path exists |
| **E.4** | PV-02 — the repair path writes INFERRED-with-reason | repair no longer *"invents a boundary and records it as authored"* |
| **E.5** | The provenance field on every element schema (PV-04) | per kind: a pre-change record parses, lands on the defaulted origin with `predates-provenance` and **never on one of the five**, is byte-stable across a JSON round-trip, and differs from the original by only the added key. ⚠ **Do not re-introduce the spread-helper indirection** — see §7B.4 |
| **E.5b** | Fixture honesty in the backward-compat arm | ⚠ see §7B.4 — the `water` fixture caught a test passing for the **wrong reason** |
| **E.6** | Generators stamp provenance (D-TGL, D-FLE, D-CE, roof) (PV-06) | ⚠ today *"no wall carries provenance… **an authored wall is INDISTINGUISHABLE from a generated one at HEAD**"* |
| **E.7** | Provenance survives save → reload (PV-05) | an executed round-trip test. ⚠ the provenance store *"is not persisted at all — destroyed on every reload"* |
| **E.8** | **The export boundary** — how the five values land in IFC/DXF (PV-08) | **the largest open risk (C75 §5).** C75 §7.7 permits exactly two terminal states: the mapping exists, or its absence is recorded **by name** as an accepted limitation. **It may not be left blank** |

**Owning gates.** `check-provenance-not-invented` (hard) · `check-provenance-coverage` ·
`check-derived-not-authored` (hard).

**Known traps.**
- ⭐ **Provenance is invented on load** where a missing detection method defaults to a machine value
  — *"un-provenanced rooms silently deserialise as machine-detected."* The exact anti-pattern the
  honesty idioms exist to forbid.
- ⭐ **New provenance lands in `packages/schemas` — the L0 layer every consumer already reads —
  never in a store, a topology package or a serialiser.** That placement is *"exactly why exporters,
  the renderer and the AI host cannot see the one element provenance that exists today."*
- **Do not reinvent the confidence model.** C62 owns it; provenance is **orthogonal**.
- **Do not restate ADR-0319's vocabulary inside C75's, or vice versa** — *"a second copy becomes a
  rival list."*
- **Sequencing**: provenance fields are worthless while a verb can stamp them on a detached DTO
  store, so this phase is **sequenced after per-kind ADR-0318 adoption**. And *"the fix IS writing
  the field"* — it ships in the same PR.
- ⚠ **A provenance edge type is AI-call lineage, not value origin.** *"Every edge must originate at
  an AI artefact."* Do not read it as the element provenance this phase is about.

---

### §3.7 — PHASE F · Regeneration you can trust

**Maps to**: **C80** (no numbered phase of its own). **Entry**: blocks on **E.5**.

**Objective.** Generation becomes a verb, protects authored work, and is undoable in one press.

> **CAPABILITY DELIVERED:**
> **Regenerate without fear.** *"Make it 4 bedrooms"* → the plan says: **"regenerates 14 rooms ·
> protects your hand-placed front door and the wall you moved · 2 conflicts need your decision."**
> Today the measured truth is the opposite — regeneration **destroys** authored rooms, and a second
> run stacks a whole building on the first. That is why F.1 ships a verb that *refuses out loud*
> rather than one that pretends. **An honest refusal is a feature; a silent deletion is a defect.**

**Exit condition.** A re-run in a fresh session returns `determined`; **the authored room
survives**; the duplicate-on-rerun defect is reproduced by a gate, then closed.

**Sub-phases.**

| # | Delivers | Exit test |
|---|---|---|
| **F.1** | GEN-GAP-1 — `room.regenerate` as a bus verb whose v1 **refuses honestly** | refuses as a **VALUE on the result, not a throw** — because a throw is exactly what C80 §10.f's `catch {}` swallows. Zero mutations proven independently through a real bus over a real store |
| **F.2** | `check-generation-is-consequential` | C80 §1's exit condition: a generation verb is **discovered**, where the prior reading was zero. ⚠ the audit found a detector *"that had never been watched fail"* — an arm-grain claim let a fourth forbidden shape read as tested while UNPROVEN (C74 §6.2) |
| **F.3** | GEN-GAP-2 — authority per element (`may` / `protected` / `unknown-authority`) | **blocks on E.5** |
| **F.4** | GEN-GAP-3 — prior-run discovery (*what did the last run produce?*) | blocks on F.3 |
| **F.5** | The double defect — **clear is too aggressive AND too narrow** | both directions fixed; fixing one is not the row |
| **F.6** | One generation = one undo (D-TGL, room detection) | a single Ctrl+Z |
| **F.7** | GEN-GAP-4 — the four NOT-EVALUATED verifications | each evaluated, or declared UNPROVEN with a reason |

**Known traps.**
- ⭐ **The refusal EXISTS and WORKS — the live path simply does not call it.** `planRegenerationClear`
  is *"authored, tested and green — and unreachable"*, with **zero production callers**.
  ***Phase F must WIRE the existing refusal, not design one.*** **STILL TRUE — verified.** (The line
  citation has drifted; find it by symbol, not by line number.)
- **The graph-authoritative marking is never un-marked anywhere**, so a generated level *"freezes
  its rooms permanently; the releasing sweep is a no-op by construction."* Un-marking at generation
  end is one of the **two wiring changes** this phase needs — and **no engine change**.
- **There is no regeneration verb to run** for the house/apartment generators — *"the generators are
  UI controllers, not bus verbs."* ⚠ **NOT DETERMINED**: whether regeneration should become a bus
  verb family, or the UI executors should each call the existing refusal. It is an open question,
  not a decided one.
- ⛔ **Nothing in the deterministic generation stack may be rebuilt** — see §6.3. It came through
  both audit downgrades **strengthened**.

---

### §3.8 — PHASE G · Constraints & determinism

**Maps to**: numbered **6 + 7**. **Entry**: Phase A (numbered 1); **§2.5 is binding within the
phase**; **GE-01 lands before every other row in the geometry half**.

**Objective.** One tolerance policy, one implementation per predicate family, no adapter reporting a
solve it did not perform, and violations that become queryable model state.

> **CAPABILITY DELIVERED:**
> **The same model draws the same way twice, and a refusal names its rule.** No more "it looked
> different after reload." When a constraint stops you, it says **which rule and both numbers** —
> and the system never claims a solver did work a mock performed. *You can trust a "no."*

**Exit condition.** C74 §7's seven conditions; **every family's declared strength has executable
evidence at that strength**.

**Sub-phases.**

| # | Delivers | Exit test |
|---|---|---|
| **G.1** | The declared tolerance module in `geometry-kernel` (GE-01) | exported and consumed. ⚠ the premise *"exports no epsilon at all"* was **REFUTED**; the row is about a **declared policy**, not about absence |
| **G.2** | Point-in-polygon canonicalisation (GE-02) | one canonical implementation; the counting gate reads its declared **1**. **One family, one PR** (§2.4) |
| **G.3** | The other predicate families (GE-03, GE-04) | ⚠ **ordering is binding**, see below |
| **G.4** | Adapter honesty (CO-01…03) | ⚠ **in its own commit, never with the binding** (§2.5) |
| **G.5** | `check-no-hidden-mock` → baseline 0 and off `gate-debt.json` (CO-05) | ⚠ see the grace-clause trap below |
| **G.6** | Every constraint family carries a C74 §1.1 classification (CO-08) | **every** family, not most. ⚠ whether a classification is *right* is *"a written judgement, explicitly not machine-checkable"* |
| **G.7** | One `StairValidationAuthority` (CO-06) | ⚠ **the tested copy is not the shipped copy.** Stair validation *"runs on the untested twin"*, and neither may be cited as "the stair rules" without naming which one |
| **G.8** | Violations become queryable model state, not log lines (CO-07) | a query returns them |

**The predicate-family ordering — binding, and the reason is arithmetic.**

> segment-segment-intersection → polygon-area-and-winding → point-to-segment-distance →
> **polygon-containment-overlap LAST**, because it is built from the other two and counting it
> earlier would **double-count**.

**No solver is authorised.** C74 §4.5 is the standing verdict:
> *"**UNPROVEN — no constraint family in this repository has been shown to require SOLVING.** Do not
> build a solver because 'BIM 3.0 sounds like it needs one.'"*

CO-09 opens **only** when a family reaches C74 §4.2(c) **with evidence**. Verified: `planegcs` is
not a dependency of any workspace.

**⚠ The Level-6 ambiguity, stated AS ambiguous and deliberately not resolved here.** Level 6 reads
*"honest solving **where proven necessary**"*, and C74 §4.5 says no family has been shown to require
solving — so Level 6 looks awardable after this phase **with no solver at all**. **C70 §4.2 says
the opposite** (*"the grading was wrong: it is one constraint store **plus a real solver** away"*).
> *"The two readings are not reconciled by any artefact at HEAD. **Verdict: UNPROVEN, and C70 §4.2
> governs until CO-08 is written.**"*

And if CO-08 clears it, **C70 §4.2 must be amended by ADR, not by a roadmap.** ⚠ **OPEN QUESTION,
unresolved.**

**Known traps.**
- ⭐ **A gate that classifies by NAME can be satisfied by RENAMING.** One epsilon fix *was* a rename
  and *was* **correct** — the breaches were mis-named domain bands, and adopting the shared role
  would have **tightened a 0.15 m band by 150×**. *"But note what the gate actually verified: **a
  name.**"* **Rule: a rename must argue for itself in the commit, stating why the new name is TRUE
  and what adopting the checked role would have done to behaviour.** `check-predicate-canonical`
  must be **structural, never name-based**.
- **`check-no-hidden-mock`'s grace clause**: *"a header carrying only a fresh date currently passes,
  so a **bulk pay would walk the ratchet down having bought nothing**."* The fix for this **had to
  be RESTORED once after a shared-tree race reverted it** — **check it is still present before
  trusting a green reading.**
- **`check-epsilon-policy` re-reds on feature work by default** — *"budget a re-drain at the END of
  any feature lane, not the start."*
- ⭐ **`@pryzm/constraint-solver` is two unrelated things sharing a name.** The geometric-solver half
  is unreachable from any production user action and always runs the mock; the `./compliance` half
  is genuinely wired in production. **They must not be taken down together** (§6.3).
- ⭐ **A NULL STORE READS AS COMPLIANT.** Seventeen early `return []`s, one per family, plus a
  `validateAll` that swallows every throw: *"three independent paths to 'no violations'… and here
  **the shared value is the reassuring one.**"* An absent, unloaded or mis-wired store is
  byte-identical to a fully compliant building.
- **Two live rendering/rule defects verified and deliberately NOT fixed** (they are the subject, not
  noise): a room marginally below a minimum reports *"area 7.5 m² is below minimum 7.5 m²"* — *"the
  verdict is CORRECT; only the rendering is wrong"*; and a headroom rule on a standard 3.0 m storey
  yields ERROR **with the rule's own defaults**.
- **Nothing in the constraint layer can refuse a command.** The one genuine ENFORCEMENT gate,
  `WallOccupancyStore.canPlace`, **is not in the constraint engine at all.**

---

### §3.9 — PHASE H · Collaboration

**Maps to**: numbered **F** — the BLOCKED-ON-FOUNDER bucket. **Entry**: a founder decision. **Not
schedulable by engineering.**

> **CAPABILITY DELIVERED:** two architects on one model, edits converging property-by-property,
> **your undo reverting your gesture and never your colleague's**, and any merge that would discard
> authored work surfacing as a resolvable conflict rather than a silent overwrite.
> **⛔ Levels 7 and 8 of the maturity ladder cannot be awarded until H.1 is decided.**

**Sub-phases (stated for completeness; none is scheduled — §2.6).**

| # | Delivers | Blocked on |
|---|---|---|
| **H.1** | The sync-transport deployment decision | ⛔ **FOUNDER** — see §9.1 |
| **H.2** | `check-collab-graph-integrity` green **against a real transport** | H.1. Until then it must report **UNPROVEN, never green** |
| **H.3** | MT-08 — §UNDO-GESTURE-ID | H.1 |
| **H.4** | K-INV-2 — merges that would lose authored state produce **explicit conflicts** | after H.1 |

**Known traps.**
- ⭐ **The two concurrency gates ask different questions and neither subsumes the other**:
  `check-collab-graph-integrity` measures **the DOCUMENT**; `check-two-client-convergence` measures
  **the STORE and the UNDO STACKS**. C8's sentence is why both are needed: *"**Two peers can
  converge byte-for-byte onto a self-consistent, confidently WRONG building.**"*
- ⭐ **"Two Yjs documents converge" is true and worthless** — that is Yjs's own test suite. **No
  capacity tier moves from CLAIMED to HELD on that evidence.**
- ⭐ **An unnamed simulation is a lie.** The harness prints its provenance verbatim every run,
  splitting GENUINELY COMPOSED from SIMULATED from NOT MEASURED. **Keep that.**
- ⭐ **THE RETRACTION** — see §7B.2. It happened here, and its generalisation (*a probe that
  exercises an operation once cannot distinguish a fixed defect from a defect hidden behind a
  phantom no-op*) governs every future collaboration probe.
- **CE-06 is "correctly unclosable"**: *"a one-client fixture cannot prove a multi-client claim.
  Closing it would be the lie the row exists to prevent."*
- **Don't rebuild the two-client harness; extend it.** It is **GENUINELY COMPOSED** — two real world
  topologies, a real command bus and manager, two real document adapters, and the production write
  and read legs.

---

## §4 — HALF 2 · Bar 3 — the universal `element kind × relationship × operation` product

Half 2 is the **capability** half. It is not a continuation of Half 1; it is a second, orthogonal
completion condition, and **both must hold**.

### §4.1 — The three bars, and why only the first is sequenced by the phases

| # | Bar | What it means |
|---|---|---|
| **1** | **CI gate closed** | Every C70 §7 gate exists, in one suite, establishes its subject, exits 0/1 at a named ledger, and has been watched go red |
| **2** | **Definition of Done** | C70 §6's eight conditions: ratchets at 0, the eight golden operations holding their **entire** chain, the ladder to L8 |
| **3** | ⭐ **UNIVERSAL — every element** | **C78 §19.1's no-partial-credit rule applied ACROSS the `element × relationship × operation` product**, not along one chain |

> ⭐ **The load-bearing sentence for the whole programme**: C70 §3.2's no-partial-credit applies
> *along a chain*; **C78 §19.1 applies the same rule across the product** — and **"Neither may be
> satisfied by the other."**

**What "the CI gate is closed" does and does not mean.** It means: every C70 §7 gate exists at HEAD
**in one suite under one `contract.ts`**, each establishes its subject (never exits 2), each exits
0/1 against a named shrink-only ledger, each has been **watched go red**, and
`check-collab-graph-integrity` reports **UNPROVEN rather than green**. **It does *not* mean every
ratchet has reached 0.** The chain is `0R → 1 → 2 (MT-01 wall/slab/room only) → 9 (CE-02 only) →
CLOSED`, four links, each a floor and not a preference.

> **The uncomfortable reading, verbatim, and it must not be softened**: *"the critical path to a
> closed CI gate is almost entirely **instrument work**, and it closes with most of the register's
> 82 gaps still open… **A closed gate is the beginning of the ratchet, not the end of the work.**
> Anyone citing 'the BIM 3.0 gate is closed' as a capability claim is committing C70 §8.i."*

### §4.2 — The denominator and its shape

**4,100 cells = 100 consequential verbs × 41 relationships.**

- **The 100 consequential verbs** are the *consequential core* of the verb surface: **31 create +
  27 delete + 18 move + 12 update + 12 batch = 100 verbs that change topology or position.** Every
  one is a candidate for a consequence planner.
- **The 41 relationships** are the relationship axis of the product.
- The gate is `check-relationship-determination`, at
  `tools/rac-conformance/certification/gates/check-relationship-determination.ts`, with its ledger
  `relationship-determination.json`.

> ⚠ **Correction, and it must not be repeated.** The previous edition of this document said this
> gate was *"a NAMED GAP, no file at HEAD."* **That is false. The gate and its ledger both exist.**
> Planning around its absence would be planning to rebuild something that is already there.

**Readings live in the ledger and the tracker, never here.** The **4,100 denominator** is a
structural property of the plan and is stated above; **every sub-figure — findings, silent cells,
refusal-blocked cells, structurally-answerable cells — moves and is quoted only from the ledger
JSON.** A previous brief carried sub-figures that had all moved while the denominator had not; that
is precisely the drift §0.1 exists to prevent.

### §4.3 — ⭐ The five rules the bar-3 gate must obey

This is the specification to preserve. A future re-implementation that drops any one of these
produces a number that flatters.

1. **Enumerate the denominator, and exit 2 if it cannot.** The full `(element kind × relationship ×
   operation)` product derived **from the registries** — *not* a hand-written list, which would
   silently shrink to whatever we already pass. ⭐ **A count of passing cells without a count of
   cells is the empty-seed lie.**
2. **Require every cell to be one of exactly three things** (C78 §1.1): **DETERMINED-affected** ·
   **DETERMINED-unaffected** · **UNDETERMINED with a typed reason from the 11-member union.**
   *A cell that is silent is a failure; **a cell that honestly refuses is a pass**.*
3. **Never infer "unaffected" from absence** (C78 §1.4) — the defect that made a room tell the AI
   the building has no walls.
4. **A named, shrink-only ledger** — every unwired cell listed **by name**, so the count cannot
   drift.
5. **Land RED**, at the honest first reading (§2.1).

> **The exit condition, verbatim**: *"When that ledger reaches empty — or every remaining entry is a
> founder-signed exception — BIM 3.0 is closed for all elements. **Not before, and no amount of
> per-family green substitutes for it.**"*

### §4.4 — The verb-family landing discipline

**C78 §19.1 forbids partial credit: a verb family lands WHOLE.** A family half-landed is not
progress toward the bar; it is an unaccounted state that the ledger cannot express.

| Landed so far | Note |
|---|---|
| **hosted-opening CREATE family** | landed whole |
| **DELETE family** | landed whole |

**Next named cheapest: `wall.delete` / opening-delete**, on the existing cascade-purge substrate.

**Why the bar became buildable, and was not before.** The 2026-08-12 audit's blocker C.1 —
*"`ConsequencePlanner<WallMoveCommand>` is hard-bound; no second family can register; everything
else waits behind this"* — **is dead.** The map now types `ConsequencePlanner<never>` and multiple
families are registered.
> ⭐ *"Opening the third row cost **one `planners.set` in one shared factory** — no service class was
> edited."*

**The sequencing rule for choosing the next family**, in order:

1. **Cheapest on existing substrate first.** A family whose cascade/purge machinery already exists
   costs a registration, not a subsystem. `wall.delete` qualifies today.
2. **Never a family whose L0 schema cannot hold the reference.** ⚠ **Roof needs an L0 schema field
   FIRST**: `RoofTypes.ts` has no field that can hold a reference, and the roof schema types its
   boundary as a plain vector array, so **Zod strips a reference in transit**. `packages/schemas/**`
   is shared-dangerous, so that is a **sequenced solo change**, not part of a family PR.
3. **Never a family whose classification is wrong.** Fix the classification before writing the first
   edge (§3.4, C.6).
4. **One family per PR.** Same reason as §2.4: a multi-family sweep has no oracle and no bisect.

### §4.5 — ⭐ Bar-3 progress gates TWO programmes, not one

The relationship-determination work is **load-bearing for C81's edit layer** as well as for BIM 3.0.
A lane that treats bar 3 as "the BIM 3.0 long pole" is under-counting its value by one whole
programme. **Cross-reference, do not merge** (§1).

---

## §5 — The R0–R9 product reasoning loop

`BIM30-REASONING-LOOP-PLAN.md` builds the *product loop* on top of the substrate the numbered phases
close. **Neither supersedes the other**: *"that roadmap closes the substrate; this plan builds the
product loop on top of it."*

**The milestone that defines success**: **`wall.move 300 mm` end to end** — predict → explain →
confirm → execute → **independently read back** → report predicted-vs-actual → undo → AI parity.
> *"**One golden operation closed beats generic machinery opened.**"*

### §5.1 — The loop

| R | Deliverable | Exit |
|---|---|---|
| **R0** | Disposition of dead machinery (ADR-0323) | every authored-but-unwired item carries a disposition **with an owner and a date**; the docket is a **committed artefact** |
| **R1** | The consequence contract — types + envelope, **no engine** — in `packages/command-bus` | types compile; the envelope threads through `executeCommand` **unused-but-carried**; **zero behaviour change**; root `tsc` clean |
| **R2** | Generalise the planning idiom over `wall.move` | `plan(wall.move)` returns a populated `ConsequencePlan` with **G-REASON-02** determinism proven (same state + command → same plan, twice, **byte-equal**) |
| **R3** | Preview | **G-REASON-01** preview purity proven the **strong** way: stores byte-identical **AND** event streams silent **AND** undo stacks untouched **AND** dirty flags unchanged — **with a positive control proving the harness could detect each** |
| **R4** | Execution consumes the plan | **G-REASON-03** execution-plan agreement lands — **red or green, honest either way** — with its ledger |
| **R5** | The consequence report | **G-REASON-06** completeness per the declared contract, for `wall.move` |
| **R6** | Confirmation policy + approval binding | **G-REASON-05** green; the card renders the plan |
| **R7** | AI parity | **G-REASON-04** `normalize(human) === normalize(ai)`, excluding **exactly** actor / origin / timestamp / proposal; **+ G-REASON-07** no-silent-partial |
| **R8** | Provenance & regeneration authority | the authored-state-protection scenario passes **as an executed test** |
| **R9** | Certification | all seven G-REASON gates built, negative-tested, and **registered per the residency rule** (§7.4); the `wall.move` row fully green; the matrix backlog ordered |

### §5.2 — Substrate dependency edges — carry these

| Edge | Meaning |
|---|---|
| **R2's junction branch ← numbered Phase 3** | needs the `joinedTo` writer |
| **R2's regeneration branch ← numbered Phase 5** | needs propagation's both-arms rule |
| **R8 ← numbered Phase 8** | needs provenance at element grain |
| **everything ← numbered Phase 2's readback-positive verbs** | the readback is the oracle |

> ⭐ **Where substrate is missing, the planner DECLARES UNDETERMINED rather than waiting.** That is
> the rule that lets the loop proceed against an incomplete substrate without lying.

### §5.3 — What the loop's green gates do NOT claim

Recorded because four green gates were once read as covering a row they did not cover:
> *"Four green gates is **not** four gates covering the third row (C70 §3.3 — **a link may not be
> scored by a neighbour**)."*

And the AI-parity column stays blank **for a structural reason, not an oversight**: one baseline
verb is family-blocked from chat, the semantic-intent path is pure and never dispatches, and **no
production call site builds a `CommandExecutionContext`** — so **both actors are anonymous at the
funnel**. Parity cannot be measured until the funnel can tell them apart.

---

## §6 — ⭐ DO NOT REBUILD

> *"[The gap register] says what is missing; **this one says what must survive the fixing**, and it
> is the more dangerous of the two to get wrong. A gap left open costs a capability. A working
> subsystem 'cleaned up' costs the capability **and the knowledge of why it was built that way**."*

**This section is load-bearing, not an appendix.** Read it before any refactor, consolidation,
"cleanup", or replacement. Its entire purpose is preventing wasted rebuilds.

### §6.0 — ⚠ What this section does NOT establish

Four points, carried across because they are the section's own guard rails:

1. **It performs no measurement.** Symbol presence was spot-checked; **behaviour was not
   re-executed.**
2. ⭐ **"Protected" does not mean "correct".** *"the bespoke propagation layer is the most protected
   subsystem here and **the least instrumented**… **Protection is a statement about replacement
   cost, not about proven behaviour.**"*
3. **It does not rank.** The order below follows the founder's original directive, not importance.
4. **It does not authorise anything.** *"A subsystem being protected does not make its gaps
   closed."*

### §6.1 — The 23-row protected list. Every row is a MUST NOT with a citation.

| # | Subsystem | The single sentence | Authority |
|---|---|---|---|
| 1 | **The three graphs** | may not be merged; **snapshot v3 breaks for a naming preference** | C71 §4.1, §7.i |
| 2 | **Parked relationship types** | may not be deleted to tidy the union | C71 §2.4, §7.c |
| 3 | **`connectedTo`** | may not be overloaded with wall connectivity — **it would poison the AI world model with no error anywhere** | C71 §3.2 |
| 4 | **Bespoke propagation trackers** | may not be retired in favour of the generic cascade; **Level 4 rests on them** | C72 §2.4, §8.g |
| 5 | **`WallOccupancyStore`** | **pure-query by design; may not be given storage** | audit §17.6, EV-03 §4.2 |
| 6 | **`wall.openings[]`** | the one opening authority, invariant-checked; **do not resurrect a rival** | audit §17.6 |
| 7 | **`prevState`** | may not be reconstructed by re-reading the store — **it diffs a value against itself** | C72 §3.5 |
| 8 | **`WallJunctionRecord.id`** | may not become a stored key; **it renumbers when walls move** | C71 §3.5 |
| 9 | **`joinedTo`** | not `connectedTo`, and **not `connectsTo`** — the near-miss name is worse | C71 §3.3 |
| 10 | **Refusals naming both numbers** | may not be softened into a clamp, a fallback, or an empty result | C73 §4.3 |
| 11 | **Deterministic generation engines** | need **no change** to meet the target; the zero-token property is to be kept **and tested** | C70 §1.3 |
| 12 | **Certification floors** | may never be lowered to go green — **identical in effect to deleting the gate** | C70 §5.3 |
| 13 | **The exit-code contract** | **one implementation**; a gate with its own is a violation | C70 §5.1 |
| 14 | **Paid debt** | leaves the ledger **in the commit that pays it**; a stale entry exits **3** | C70 §5.4 |
| 15 | **The empty tolerance list** | stays empty except by ADR, **enumerated by name** | ADR-0319 |
| 16 | **The `./compliance` registry** | must not be taken down with the solver half of the same package | audit §17.1.2 |
| 17 | **Real constraint components** | **an enforcement gate may not silently become advisory** | C74 §2.1 |
| 18 | **Honesty idioms** | copy them; **unrepresentable > checked > gated > convention** | C75 §2.8 |
| 19 | **COMPUTED vs INFERRED** | **may never be merged** | C75 §1.2 |
| 20 | **ADR-0318 registry** | identity not construction; one registry; **honest absence, no stand-ins** | ADR-0318 I-1/I-2/I-3 |
| 21 | **The verb register** | **generated, never hand-edited**; UNKNOWN stays a distinct grade | C69 |
| 22 | **`ProjectSnapshot`'s serialized shape** | the concrete constraint behind rows 1 and 2 | C05/C47, C71 §4.1 |
| 23 | **ADR-0319's three field classes** | may not be re-flattened; **the GUID has no tolerance, ever** | ADR-0319 |

### §6.2 — The protected subsystems: what each already does, and what must not be replaced

Each entry carries the two load-bearing fields. **WHAT IT ALREADY DOES** stops a rebuild being
proposed out of ignorance; **WHAT MUST NOT BE REPLACED** stops one being proposed out of tidiness.

#### §6.2.1 — The three graphs

**WHAT IT ALREADY DOES.** `SemanticGraph` — 25 declared types, **serialized verbatim into snapshot
v3**. `RoomGraphService` — **the repository's one proven G5 computation**. The Unified Building
Graph — pure, Zod-validated, span-instrumented, **and with no runtime home yet**.

**WHAT MUST NOT BE REPLACED.** *"Three stores with three jobs is the correct design. **One store
with three responsibilities is a migration with nothing on the other side.**"* And a second MUST
NOT that greps get wrong: ⭐ **"A UBG type name is not `SemanticGraph` coverage."** `precededBy`,
`supersedes` and `branchedFrom` exist in **both**, and *"greps conflating the two have **already
produced one false capability claim in this repository**."*

#### §6.2.2 — The bespoke propagation wiring

**WHAT IT ALREADY DOES.** `DoorDependencyTracker` / `WindowDependencyTracker`
(**EXECUTED-PROVEN**, pinned by a hosted-opening cascade freeze test) · `WallRebuildCoordinator`
(~2,000 lines; diff-based neighbour discovery **off `prevState`**) · `RoomTopologyObserver` (seven
suppression guards) · cascade-delete inside `DeleteElementCommand` **twice over**, at command level
and at store level · `spatial-authority-reconcile`.

**WHAT MUST NOT BE REPLACED.** Beyond row 4: **a migration off them requires the replacement to be
demonstrated propagating first, per pair — never a flag-day swap.** And **the double removal in the
wall-delete path is belt and braces, not redundancy to collapse.**

⚠ **The standing caveat, and it is the reason §2.2 exists**: *"**no gate asserts that the bespoke
trackers still reach their pairs**… The most protected subsystem in this document is also the least
instrumented."* And: *"a propagation test whose fixture supplies the very value under test proves
nothing."*

#### §6.2.3 — The retained junction index

**WHAT IT ALREADY DOES.** ADR-0055's `JunctionResolverV2` computes L/T/Y/X/N-WAY with participant
ids and typed refusals, and **since CONNECT-3 the records are retained** rather than discarded.

**WHAT MUST NOT BE REPLACED.** ⭐ **"Stale-edge removal is part of the writer, not a follow-up."**
`addRelationship` idempotency prevents duplicates and **never** staleness: a wall that *stops*
joining would keep its stale edge forever. **Edges are removed and re-emitted per level at flush.**

#### §6.2.4 — `prevState` store events

**WHAT IT ALREADY DOES.** Five stores emit it (`WallStore`, `SlabStore`, both `ColumnStore`s,
`RoomBoundingLineStore`). *"It is **arm B** of the definition of propagation. A listener without
`prevState` can only invalidate wholesale — that is the ADR-057 defect."*

**WHAT MUST NOT BE REPLACED.** The `§STEP7` convention **is the shape to copy, not to redesign**.
And ⭐ **"A classifier whose only reachable branch is its `no-prevState` branch may not ship."**

#### §6.2.5 — `WallOccupancyStore` + `planOpeningRefit` — the reference refusal shape

**WHAT IT ALREADY DOES.** *"`planOpeningRefit` runs on a wall shrink and returns **a plan**:
relocations where an opening still fits, and **typed refusals naming both measurements**… **No
opening is ever deleted to make room.**"*

**WHAT MUST NOT BE REPLACED.** The store is **pure-query by design and may not be given storage**
(row 5). The **companion precedents to copy rather than reinvent**:

- `BaselineReversalError`;
- the roof inset's **three named collapse modes**, each carrying its inward distance in metres —
  *"not one generic 'invalid roof'"*;
- `polygonOffset`'s `{ polygon: [], degenerate: true, reason: 'offset collapsed the ring' }` —
  ⭐ *"**an empty result that arrives labelled, so a consumer cannot read it as 'no overhang'**."*

Related, and closed rather than open: the wall never used to ask before an opening was clamped —
*"The gate always existed (`clampToWall`) with two production call sites, **both opening-side** —
the wall never asked. **It asks now.**"*

#### §6.2.6 — The deterministic generation engines

**WHAT IT ALREADY DOES.** D-TGL · D-FLE · D-CE · room detection · ADR-0055 wall joins · schedules
& QTO · **IFC export including `IfcRelSpaceBoundary`** · solar (C21) · C63 envelope with typed
refusals · PDF→BIM tier 1. **Grep-confirmed AI-clean; production deploys carry no AI key at all.**

**WHAT MUST NOT BE REPLACED.** **Nothing in the generation stack** — it came through *both* audit
downgrades **strengthened**. Specifically:

- *"**Zero-LLM BIM 3.0 is the target posture, not a fallback.**"*
- *"Any change that makes a deterministic tier require the worker is a regression of the AI
  boundary, **regardless of output quality**."*
- ⭐ **`IfcRelSpaceBoundary` export must not be lost in any room-detection refactor** — *"one of the
  few places where PRYZM's topology reaches an interchange format at all."*

**What it needs is two wiring changes and no engine change**: un-mark graph-authoritative levels
when generation ends, and stamp provenance once the fields exist.

#### §6.2.7 — The certification harness

**WHAT IT ALREADY DOES.** `certify.ts` over `gates/*` with `contract.ts` as the **single**
exit-code implementation, plus `floors.ts`, `capture.ts`, `seed.ts`, `world.ts` and the ratchet
JSON. Its properties: the four exit codes · **MISCONFIGURED floors** (a kind whose store is empty
reports MISCONFIGURED **and says so**, rather than printing clean over nothing) · tampered-state
falsifiability · **the empty-seed negative control** · a **derived, never hand-assigned** status
function · ⭐ **a documented-tolerance list that ships empty** — *"because a tolerance list written
to make a test pass is not a measurement, it is the test agreeing with the code."*

**WHAT MUST NOT BE REPLACED.** Beyond rows 12–15: **"all remaining BIM 3.0 gates extend it — none
needs new infrastructure."** The standing instruction is C71's and it governs the whole programme:
> ***"Activate, retain, and certify — do not rebuild."***

#### §6.2.8 — The `./compliance` rule registry

**WHAT IT ALREADY DOES.** `ConstraintEngine` at `@pryzm/constraint-solver/compliance`, imported by
the data-platform init, auto-run wired to `StoreEventBus` with an **800 ms debounce and a
load-quiet window**, **non-blocking by construction**, classified **ADVISORY**.

**WHAT MUST NOT BE REPLACED.** ⭐ *"**`@pryzm/constraint-solver` is two unrelated things sharing a
name.** The geometric solver half is unreachable from any production user action and always runs
`MockSolver`. **The `./compliance` half is genuinely wired in production.**"* Taking the package
down as a unit takes down the working half.

**The other three real components are equally protected**: `WallOccupancyStore.canPlace`
(ENFORCEMENT) · `annotationConstraints` (VALIDATION — **the only persisted constraint family in the
system**) · `StairValidationAuthority` (VALIDATION) — ⚠ *"**the tested copy is not the shipped
copy**, and neither may be cited as 'the stair rules' without naming which one."*

#### §6.2.9 — The ten honesty idioms. COPY THEM, DO NOT REINVENT THEM.

> *"the gap is not knowledge — the element core was built before this vocabulary existed and was
> never retrofitted."*

| # | Idiom | Why it is the one to copy |
|---|---|---|
| 1 | **`LandBasis`** | a **branded type that makes a wrong basis unrepresentable** — the strongest form available: **not a check, an impossibility** |
| 2 | **`BuildableEnvelope`** (C58/C64) | typed determinations + a **member-per-cause refusal union** |
| 3 | **`DataConfidence`** (ADR-0280) | confidence **plus an explicit UNKNOWN reason** |
| 4 | **`heightProfile`** | a **mandatory** 0..1 confidence + provenance tier — *"not optional, so it cannot be skipped"* |
| 5 | **`climateProvenance`** | per-field source attribution on a computed dataset |
| 6 | **`ProvenanceEdge`** | provenance as a **graph edge** — *"derivation is a relationship, not a label"* |
| 7 | **`AIArtefact`** | AI output marked as AI output, **structurally** |
| 8 | **`SemanticReadRefusal`** | *"the shape the `[]`-conflation sites must move to"* |
| 9 | **The typed junction refusals** | a named refusal per impossible junction |
| 10 | **`SlabFragmentBuilder`'s §REFUSE-NONSIMPLE-SLAB-RING** (ADR-0299) | refuses rather than emitting *"geometry that is wrong but plausible enough to be read as a modelling quirk"* — ⭐ *"**twenty files away from the room repair path that does the opposite**"* |

**Extra MUST NOTs**: new provenance lands in `packages/schemas` — the L0 layer every consumer
already reads — **never in a store, a topology package or a serialiser** · **do not reinvent the
confidence model** (C62 owns it; provenance is **orthogonal**) · **do not restate ADR-0319's
vocabulary inside C75's, or vice versa** — *"a second copy becomes a rival list."*

#### §6.2.10 — ADR-0318's store registry: identity, not construction

**WHAT IT ALREADY DOES.** *"`composeRuntime` **adopts** the module-singleton `storeRegistry` that
already existed and was already populated… exposed typed at `runtime.stores.elements` as a **live
view, not a copy**… **registry identity ≡ serializer identity, by construction, with zero new
wiring**."*

**WHAT MUST NOT BE REPLACED.** **I-1** identity, not construction · **I-2** one registry (a second
registry, or a compose-time `new <X>Store()` for a kind the engine launcher also constructs, is a
**P1 violation**) · **I-3 honest absence** — *"**No scaffold, no empty stand-in** — ABSENT must be
loud."* Plus ⭐ **`composeRuntime` must not `clear()` or `unregister()` at tearDown** — *"teardown of
an old runtime can run **after** a hot-reload successor composes, and clearing would wipe its
registrations."* And **the slot deliberately does not invent a uniform write surface; commands
remain the only mutation path (P6).**

#### §6.2.11 — The C69 generated verb register

**WHAT IT ALREADY DOES.** *"It is **the only instrument in the repository that answers the
reachability question** rather than the existence question, for any subsystem."* Grading turned "we
have a command bus" into measurable statements.

**WHAT MUST NOT BE REPLACED.** **The register is generated — do not hand-edit it** (*"a
hand-maintained register is an opinion"*) · **UNKNOWN is a real grade and must stay distinguishable
from LIVE and from dead** — *"collapsing it into either direction destroys the instrument."*

⚠ **And the gap it implies**: *"the graph has **no CA-21 equivalent**, and that absence is why every
EV-04/EV-05 claim is source-level and **every writer that exists but is never reached still reads
✅**."*

#### §6.2.12 — Snapshot v3 and `SemanticGraph` persistence

**WHAT IT ALREADY DOES.** `ProjectSnapshot` carries `semanticGraph` at **v3, serialized verbatim,
every edge, no filtering**; identity holds across the round-trip (every kind keeps id and GUID).

**WHAT MUST NOT BE REPLACED.** Beyond rows 22–23: ⭐ *"`id` and `ifcData.guid` are AUTHORITATIVE
with **no tolerance ever** — the GUID is the IFC round-trip join key, and a re-minted GUID breaks
correspondence with every previously exported IFC file **invisibly, because both files still
open**."* · counters are DERIVED-BUT-CAUSAL (**may differ across a restore, never across an
undo**) · timestamps excluded **by enumeration, never by pattern** · ⭐ **"Do not re-introduce the
patch-based-redo prediction."** ADR-0319 predicted redo needed a patch layer; **measurement
overturned it** — the ratchet was **undo walking the counter forward**, and once that was fixed,
re-execution satisfied class 2 with every redo row byte-equal and zero class-2 exclusions. *"The
struck prediction is preserved in the ADR on purpose: **a governance document that silently edits
its own predictions cannot be audited.**"*

### §6.3 — Protections recorded outside the DO-NOT-REBUILD document

**Merged here so they are not lost with the documents that recorded them.**

- ⭐ **`rebuildSemanticGraph.ts` is the model the rest of the programme should copy** — *"the one
  place already implementing the founder's rule: it reconstructs what it can from authoritative
  state, **refuses to fabricate what it cannot**, and returns the shortfall **by name**."* **Its
  exclusions are decisions, not gaps**: walls/doors/windows are excluded from `sitsOn` because
  *"emitting it on load would invent an edge the live model never has"*; **`joinedTo` is
  deliberately not rebuilt and deliberately not named as a loss**, because `WallRebuildCoordinator`
  regenerates it. ⚠ That last is **conditional on every load path reaching the coordinator's flush**,
  which is listed as **unverified**. Do not treat it as proven.
- ⭐ **The refusal EXISTS and WORKS — `planRegenerationClear` is authored, tested and green, and
  unreachable.** ***Phase F must wire the existing refusal, not design one.***
- **`ConsequencePlanner<TCommand>` is the generic hinge and it is already in place.**
  `ConsequenceReportView.ts` has **zero wall couplings** — *"the one L7 surface that is already
  universal"*; `ConfirmationFlow` contains **zero wall references**; and
  `fingerprint()` / `readback()` / `validationDelta()` / `reconcile()` — *"the reconciliation engine
  itself is family-agnostic."*
- **The two-client concurrency harness is GENUINELY COMPOSED. Don't rebuild it; extend it.**
- **`@pryzm/legacy-shim` is a deliberately zero-importer *process* package**, the named violation
  surface for lint fixtures and load-bearing for the lint-fixture runner → **RECLASSIFY, keep.**
- **`@pryzm/bench-visual-diff` is NOT an orphan** — a release gate runs it and counts it in a
  grow-floor; **deleting it hard-fails the visual-diff smoke check.**
- **`wall.cut` already rejects a cut whose openings straddle the cut point, naming the offending
  opening ids** — *"**Do not rebuild the cut path. The gap is an id.**"*
- **Reuse C62's confidence model**, and **reuse the `WallOpeningEmitSeam.test.ts` shape** for seam
  tests.
- **`check-offset-implementations.ts` is the working template** for every counting gate;
  **`collabGraphIntegrity.ts` is the working implementation** of the in-run negative control.
- ⚠ **`CascadeRunner` is PROMOTE, not the planner.** *"**One mechanism.** It emits a flat follow-on
  command list; it cannot express UNDETERMINED, excluded/untouched sets, violations, refusals, or a
  plan hash — the `ConsequencePlan`'s load-bearing fields."* **Two caveats R2 must own**, both
  pinned in its test file: ⭐ **visited-set keys are raw entity ids with no family namespace** — a
  wall and a room sharing an id string would dedupe against each other and **silently drop a
  legitimate cascade**; and ⭐ **emission SEQUENCE follows rule-registration order** — the *set* is
  stable, the *sequence* is not. **Canonical ordering is the planner's job.**

### §6.4 — ⭐ The architecture-change rules — a governance instrument, not a report

**The measured verdict: of the defects that have been found and classified, ARCHITECTURAL CHANGE =
0.** Note the shape of that claim: *"A conclusion would say 'the architecture is right'. This says
something narrower and more defensible: **of the defects that have been found and classified, none
requires replacing a subsystem.**"*

**The four standing rules. These are why this section exists.**

| | Rule |
|---|---|
| **MUST** | Any later proposal for architectural change **adds a row to the architecture-impact register answering the same ten questions, with evidence, before any code is written.** |
| **MUST** | ⭐ **The default answer is NO CHANGE.** *"A proposal that cannot name a capability the current structure cannot host (question 2) is rejected at question 2 and goes no further. **The burden is on the proposal, and it is not discharged by an argument that the result would be tidier.**"* |
| **MUST** | A proposal changing `ProjectSnapshot`'s serialized shape must state **its forward migration and its reverse migration in the same document.** |
| **MUST NOT** | ⭐ *"An architecture change may not be adopted by roadmap, by plan, by PR description or by refactor. **It is adopted by a superseding ADR that cites this document's row, or not at all.**"* |

**The one rejected candidate, on the record so the answer survives**: merging the three graphs.

- **Q2 — "what capability does the current structure not host?" — *"None. This is the disqualifying
  answer, and it is first for that reason."***
- **Q4** — snapshot v3 deserialization breaks for every persisted project, *"and the failure is the
  invisible kind — **the file still opens**."*
- **Q5** — the non-obvious breakage: `RoomGraphService` is *"the repository's one proven G5
  computation"*, and `connectedTo` would be under pressure to carry wall connectivity, **poisoning
  the AI world model with no error anywhere**.
- **Q6** — cost includes re-verifying the identity round-trip, and the GUID **has no tolerance,
  ever**.
- **Q7** — ⭐ *"**There is no clean rollback.** Code rolls back with a revert; **data does not**…
  the rollback plan is a second migration."*
- **Q9** — the asymmetry **is** the decision: *"Wrong about mapping → write the merge later, having
  lost a mapping file. Wrong about merging → **every persisted project has been migrated to a shape
  that delivered nothing**."*
- **The one-sentence reason**: *"Merging would break snapshot v3 for every persisted project in
  exchange for a naming preference; mapping delivers the same contract invariant, in code, with no
  migration and a one-commit rollback."*

**Five falsifiers, so the verdict is falsifiable rather than defended.** (1) A required invariant
proves unrepresentable in snapshot v3 — the nearest live test is **PV-02**, and until verified
against a pre-change snapshot, **representability is UNPROVEN, not proven.** (2) **CRDT merge
semantics** — *"the one item that could plausibly demand a store-shape change, because CRDT
convergence is a property of data shape, not of wiring."* (3) `joinedTo`'s writer proves it cannot
key on anything stable. (4) ⭐ *"**This is the most likely of the five to arrive**"* — the
reachability probes contradicting the source-level reading at scale; *"it would not necessarily
change the verdict; **it would change what the verdict is about**."* (5) A defect nobody has found
yet — *"**A count of zero over a discovered set is not a proof over an undiscovered one**."*

⚠ **A method caveat worth preserving.** The founder's master directive is **not checked into this
repository**. The ten questions were therefore *"reconstructed from the citing documents rather than
quoted verbatim."* **The questions' exact wording is UNPROVEN; the answers are cited.**

⚠ **And the honest residue**: *"**'No architectural change required' is not 'the architecture is
good.'**"* `runtime-composer` is not really L3; `core-app-model` sits at L2 while importing L4; the
backend packages have no layer at all. Those are recorded in `CLAUDE.md`, outside this programme's
scope, and untouched by this verdict.

---

## §7 — Gate-engineering rules any new work must obey

Every rule below is a recorded incident, not a hypothetical.

### §7.1 — RULE 1 · The six forbidden pass-reasons

**No gate may pass for any of these six reasons:**

1. a **directory** exists;
2. a **file** exists;
3. a **grep** found a string;
4. a **mock** returned success;
5. a **UI** displayed success;
6. a **test** never exercised the real path.

> *"Every one of the six is a recorded incident here, not a hypothetical."*

**The positive form**: *"the only evidence of a mutation is an **independent read-back of
authoritative state**, and the only evidence of a capability is an **executed run whose comparator
has been watched go red**."*

And the founder's framing, binding: ⭐ **"No UI acknowledgement counts as success."**

### §7.2 — RULE 2 · A broken measurement system must never report green

> **Binding**: *"A comparator reporting '0 divergences' MUST also report **how many objects it
> compared**. A report of zero over a subject of zero is the empty-seed lie, and it **exits 2, never
> 0**."*

**Both founding incidents, named**: a run with **nothing in it** produced the best-looking
certification ever recorded (now exits 2); and a compile gate **fabricated ~90 PASS lines per run
for its entire life**.

**The order of authority among exit codes is fixed**: **MISCONFIGURED (2) → RATCHET EXCEEDED (3) →
DECLARED-LEVEL (1) → CLEAN (0)**. A test runner's own exit code **is not the verdict**.

**"Green" is used in the C70 §5 sense throughout this document: exit 0 CLEAN, or exit 1
DECLARED-LEVEL against a named, shrink-only ledger. Exit 2 and exit 3 are never absorbable and never
"green."**

### §7.3 — THE META-RULE · A meta-gate reports; it never aborts

> *"an auditor that aborts converts 'one gate is misconfigured' into 'no gate ran', and the suite's
> output becomes **indistinguishable from a crash**."*

A meta-gate may raise the aggregate exit code **only** through the suite runner's `worst()` ranking.

### §7.4 — ⭐ §2.1a · THE RESIDENCY RULE

**This rule exists in exactly one place in the corpus, and every new gate needs it.**

> ***"Residency follows what a gate must REACH to establish its subject, not what it asserts."***

**The boundary test is one question:**

> ### ***Does this gate need something that does not exist until something runs?***
>
> | Answer | Home | Runner |
> |---|---|---|
> | **YES** | `tools/rac-conformance/certification/gates/` | `certify.ts` |
> | **NO** | `tools/ga-gate/` | `run-all.ts` |

**Both reasons are given, because *"'All gates live in one folder' is the wrong rule in both
directions"*:**

- **Folding executed gates into the static runner** makes a casual sweep into one people run never
  — *"a verification tool that is too slow to run teaches nothing and gets switched off, which is
  precisely how this suite spent its life unwired (L-774)."*
- **Folding the static gates into the certification harness** *"turns the certification harness into
  a static scanner and buries four executed gates inside forty scans."*

⭐ **Residency is about the RUNNER; the directory should follow but is not the rule.**

**§2.1b — exactly ONE exit-code implementation, imported by both homes, never copied.**
> *"C70 §7.2's real objection was never 'two folders'; it was **'two exit-code implementations'**…
> **Two homes sharing one contract is a split; two contracts is a fork.**"*

**§2.1c — a misplaced gate is reclassified, not excused.** `check-collab-graph-integrity` moves to
the certification home **in the same change that resolves its transport question** — *"a misplaced
gate **with a reason**, which is a materially different thing from an unexplained one."*

**§2.1d — ⭐ the discovery that neither runner could see the other.** The static runner's
unregistered-gate check read its own directory **and nothing else**; the certification runner had
**no such check at all**, only a hard-coded array.
> *"A file dropped into `certification/gates/` and registered in neither runner would have been
> invisible to every instrument in the repository, **including the two that exist to detect exactly
> that**… **the hole was in the detector, not in the tree.**"*

Closed by extending the static runner to read **both** directories, **parsing the certification
runner's list from source rather than duplicating it** (a hand-copied list rots) and **failing the
parse loudly** rather than letting an unparsed list read as "nothing registered there". **Do not
regress that.**

### §7.5 — §2.2 negative controls, and §2.3 build the gate even if it cannot be green

**Definitions used throughout:**

- **Positive control** — a fixture the gate must call **clean**. *"it proves the gate is not stuck
  red, and it is what stops an over-eager matcher from being 'safe'."*
- **Negative control** — a **planted violation** the gate must call **dirty**, with its failure text
  recorded in the gate's header. *"**A comparator that has never failed has not been shown to be
  able to.**"*

⭐ **§2.2 — the negative control is part of the gate, not part of the review.** *"Until that record
exists for an arm, **the arm is UNPROVEN and may not be cited as coverage** — even though the gate
file exists and exits 0."*

⭐ **§2.3 — a gate that cannot be green today must still be BUILT.**
> ***"Deferring a gate until its subject is fixed is how a subject stays unfixed."***

**And the in-run form of the same idea**: a negative control runs **in-run**, and if the checker
calls the broken fixture clean, the run is `blind-comparator` → **exit 2**, and **every verdict it
produced that run is invalidated — not downgraded, invalidated.**

### §7.6 — ⭐ §2.4 · `gate-newly-measured.json` — the third category

> **A gate that lands red on defects that PREDATE it is NEITHER a regression NOR declared debt.**
> *"Filing it as a regression trains readers to treat red as noise; filing it as debt backdates a
> decision nobody made."*

**It is a SIBLING FILE to `gate-debt.json`, not a section of it**, because the two carry **different
consent rules** — `gate-debt.json`'s consent rule must stay attached to *choosing to ship a
violation* and must not leak onto *choosing to start measuring* — different shapes, and different
meanings when they grow.

**Semantics:**

| Property | Rule |
|---|---|
| The reading | pinned at **the first honest measurement**. **If the JSON and the gate disagree, the gate is right.** |
| What it absorbs | **exit 1 only.** Exceeding the pin **exits 3 before this file is consulted** — *"a second comparator over the same number is a second thing that can disagree."* |
| Required fields | every entry names an **exit condition** and a **`reviewBy` date**, **both required at load** |
| Expiry | the runner **fails when today > `reviewBy`** — *"an unenforced date is a comment, and a category with no exit is how 'temporary' becomes permanent"* |
| Leaving | **a passing entry must leave the file** |
| Output | the runner prints 🟡 KNOWN-DEBT · 🔵 NEWLY-MEASURED · ❌ REGRESSION **distinguishably**, *"so 'something broke' and 'we started measuring something that was already broken' can never read the same"* |

**The founder-consent answer, stated rather than inferred:**
> *"Requiring sign-off to turn an **instrument** on puts a human approval step in front of knowing
> something… **The founder's authority is over what we ship, not over what we are allowed to
> know.**"*

**With three hard edges:**

| Edge | Rule |
|---|---|
| **(a)** | An entry may only be added **in the commit that introduces its gate.** |
| **(b)** | ⭐ **Raising a pinned reading is FORBIDDEN OUTRIGHT — founder or not.** *"a measurement raised becomes a permission."* |
| **(c)** | **Extending a `reviewBy`, or moving an entry into `gate-debt.json`, REQUIRES THE FOUNDER** — *"that is the moment 'not fixed yet' becomes 'chosen to live with'."* |

**And the registration discipline that keeps the debt file from growing**: ⭐ **fix the site, then
register the gate at 0.** *"Registering first and ledgering the breach is how `gate-debt.json`
grew."* The first time it was done the right way here, a gate's first captured regression was **paid
at source instead of bought off with a ledger entry.**

### §7.7 — Build order, by cost ÷ leverage

| Tier | What | Note |
|---|---|---|
| **1** | manifest / single-file scans | cheapest, unblocks the most |
| **2** | structural source scans | reuse the counting-gate recipe rather than inventing one |
| **3** | executed harness gates | ⭐ **`check-authoritative-state` FIRST** — *"Highest leverage of the whole set — it is the gate that makes every other row's read-back trustworthy."* |
| **last** | the meta-gate `check-gates-are-real` | *"A gate suite that cannot audit itself is the next ~15-green-and-blind incident with better documentation."* Reports, never aborts (§7.3) |

### §7.8 — The certification-suite sequence, and what certification cannot prove

**The harness's own build order** (a scheme scoped to the harness alone — see §0.3):
**0** the plan and its sibling docs → **1** Tier-1/2 static gates, landing red at named ledgers →
**2** the canonical seed with its own floors, its own ratchet and a deliberate-breakage proof →
**3** the report extended to eleven links, **MISCONFIGURED added as a row status**, and the
arithmetic ceiling declared in the header → **4** Tier-3 gates, `check-authoritative-state` first →
**5** the meta-gate → **blocked**: the collaboration axis.

**Two harness changes are required and are not optional.** **MISCONFIGURED must become a row
status** — today it can only land as UNPROVEN, *"which reads as 'nobody looked' when the truth is
'the harness is broken'"* — and the Golden Chain grows from **7 links to 11**.

**The scoring rules, which are what make partial credit structurally impossible:**

- **No partial credit.** **No axis inferred from a neighbour.** **An unexecuted link is UNPROVEN,
  and a chain containing one scores incomplete, never passing.** **No link may be scored by the
  subsystem that owns it.** **REFUSES-CORRECTLY = pass.**
- ⭐ **Status is DERIVED, never hand-assigned.** *"A hand-assigned status is an opinion in a column of
  measurements."* · *"Derivation makes partial credit **structurally impossible**… Nobody has to
  *remember* the rule; it is a property of the function."*
- ⭐ **"Declaring an arithmetic ceiling on day one is a DoD requirement (C70 §6.3) — precisely so the
  number cannot be quietly redefined later, when the pressure to redefine it arrives."**
- **Floors are stated with the measurement they came from**, *"so that raising one to make something
  pass is **visibly a lie rather than a tuning choice**."*
- ⭐ **The oracle rule**: *"The comparator never consults `CommandResult.success`, a handler patch,
  or any store's own opinion — **never ask the same object whether it is valid.**"* And:
  ***"`[]` may only ever mean 'zero results'."*** And: **reasoning ops run twice, once with the AI
  host composed and once with it absent, and the two answers must be identical.**

**The canonical world — the seed is EXTENDED, never superseded.** Keep the existing seed as-is; add
a BIM-3.0 seed beside it sharing world/capture/contract/report. Three reasons: **(a)** the seeding
machinery is right — it composes every kind through **real** commands on the **real** command
manager, and *"a kind that cannot be composed by a real command is REPORTED as unseeded rather than
faked into existence"*; **(b)** the existing seeded model **cannot support a single BIM 3.0 topology
assertion** — two parallel walls that never touch (**zero junctions**, so the junction invariant is
*unmeasurable, not failing*), one room, every element on one level while the stair declares a top
level and arrives at an empty floor, **no interior wall at all** — *"An 18-kind inventory is not a
building"*; **(c)** the reviewability argument — editing the existing seed moves the subject
**underneath** its floors and ratchet in the same commit, *"indistinguishable, in review, from
lowering a floor to make a run green."*

**The canonical building, concrete enough to build**: 3 levels · **14 walls** (8 exterior forming a
**closed** rectangle × 2 levels — *"Closed shells are mandatory: **the corners are the junction
subject**"* — 6 interior, 1 curtain wall) · junction targets ≥8 L, ≥4 T, ≥1 X, ≥13 retained records
· ≥3 wall system types · **≥8 hosted openings** including 2 interior doors (*"what make
`connectedTo` measurable at all"*) and **1 curtain-wall opening attempted — if refused, the refusal
IS the evidence, and it scores REFUSES-CORRECTLY** · 3 slabs including a balcony · **1 roof with a
300 mm overhang — deliberately the polygon-offset oracle case** · **10 rooms**, a corridor adjacent
to ≥3 and door-connected to ≥2 · ≥1 multi-level stair · 6 columns + 4 beams · ≥3 material
assignments.

⭐ **Two of the declared topology targets are NAMED ZEROS, and that is the fixture doing its job**:
*"a world that declares the target and measures 0 makes the gap **a finding with a name**."*

**⚠ What certification CANNOT prove today — all UNPROVEN, and naming them is part of the
deliverable:**

| Blind spot | Why |
|---|---|
| The collaboration axis | no transport (§9.1) |
| GPU / shader geometry | not exercised headlessly |
| **Cross-architecture float determinism** | *"the ones that make a Windows founder's model differ from a Linux CI runner's — **not measured by anything**"* |
| **Runtime reachability** | static discovery counts authored-but-unreached code as **present** |
| The fixture is not the user's project | a seeded world is not a real one |
| ⭐ **Correctness beyond stability** | *"a writer emitting the wrong edge, a solver computing the wrong answer, and an algorithm returning a well-formed falsehood **all pass every arm**. **Oracle fixtures with hand-checked answers are the only remedy**, and today only polygon offset has one"* |
| Refusal reachability at the UI | GE-09's arm |
| The provenance export boundary | PV-08 (§3.6 E.8) |
| Bespoke propagation | §6.2.2's standing caveat |

**And two structural facts about the harness that bound every claim made from it**: the undo harness
certifies the **legacy** stack only; and only a minority of plugin bridges are registered, so *"any
claim of the form 'no listener anywhere' is a **static** claim and must not be made from this
world."*

⭐ **One production path deliberately runs in the harness and must not be "fixed" into a fork**: the
loader is routed through its real hidden-tab macrotask branch *"because the frame bus never ticks
headlessly and the load would await a frame that can never arrive"* — a measured 600 s hang.
**This is a real production path, not a harness fork.**

### §7.9 — Invariants with no gate — the other direction

> *"an invariant with no gate is an unenforced claim, and **leaving it unlisted is how a contract
> becomes decoration**."*

The highest-value missing arms, each naming why the nearest gate does not cover it:

| Invariant | The missing instrument |
|---|---|
| **D-INV-1** | needs a `check-graph-verbs-exposed` that is **not in the specified set** |
| **F-INV-3** | *"`planOpeningRefit` and `BaselineReversalError` are the working precedents; **no gate executes them**. **Highest-value missing arm in the propagation family.**"* |
| **L-INV-1** | ⭐ **no repo-wide gate.** *"A `check-empty-is-not-failure` counting gate is the obvious candidate and is **not specified**."* |
| **C72 §5** | `RECONCILABLE_TYPES` is exported with **zero consumers** (§3.5) |
| **C74 §1.3** | whether a classification is *right* is *"a written judgement, explicitly not machine-checkable"* |

---

## §7B — ⭐ Failure modes this programme has already suffered

**A rewrite that loses these re-introduces the error.** Every entry below is a way a future session
can fool itself, recorded because it *already happened here*. This section is not history; it is a
checklist.

### §7B.1 — THE FALSE GREEN · a gate satisfied by authoring MORE unreachable code

`check-move-propagation`'s consumer-counting arms both printed ✓ because the count moved 0 → 1 — and
**the one consumer was a package wired into nothing.**

> ⭐ *"**It was not paid. It was re-authored one layer further from the user.** A gate built to
> detect authored-but-unreachable code was satisfied by **authoring more unreachable code** — while
> the founder, in the browser, watched the finishes fail to move… the cleanest available proof of
> C70 §0.2 cutting in the unexpected direction: **here the gate itself was the thing that needed
> reading past.**"*

**Guard**: a counting arm over "consumers" must measure **reachability**, not file count.
**Reachability, not existence, is the correct audit.**

### §7B.2 — THE RETRACTION · a defect masked, not fixed; the claim was true of the READING

> ⭐ ***"`undo-reverted-peer-work` was NEVER ACTUALLY FIXED by the commit credited with fixing it; it
> was MASKED. The gate presses Ctrl+Z ONCE, and pre-fix that one press landed on a phantom no-op
> entry… that claim was true of the READING, not the CODE."***

Generalised, and this is the reusable form:
> ⭐ **"A probe that exercises an operation ONCE cannot distinguish a fixed defect from a defect
> hidden behind a phantom no-op."**

Two further facts from the same retraction: it *"was TWO stacked defects, and **the first was HIDING
the second**"*; and the peer's own edit *"was **BURIED, not dropped**."* Also: **the same clobber
fires single-user** — *"Concurrency only made it deterministic enough to see."*

### §7B.3 — "51, not ~74" · a forecast wearing a count's clothing

A figure of *"~74 rows closable"* was carried as though it were a measurement. It was not.

> ⭐ *"the orchestrator counted rows for which **a lane had produced evidence**. The restamp counted
> rows for which **it had re-run the gate itself.**"*

**The mechanism will recur.** Its three guards, all binding:

1. ⭐ **The headline is COUNTED, never carried forward.** *"an orchestrator adding up self-reported
   wins is precisely the BY-READ mode C70 §0.1 forbids, and it is how a number drifts optimistic one
   honest step at a time."*
2. **CLOSED only from an artefact that was RUN** — otherwise the row reads **CLOSED (BY-READ)**, and
   *"the two are never laundered into one another."*
3. **The gate is the authority, not the table.** A row moves **only on a recount that re-runs the
   gate itself**.

**And the counterweight, which is the strongest evidence the instrument works**: a restamp lane
**refused to close three rows it was handed as closable**, because the gates contradicted the brief.
> *"A register that closes what it is told to close **measures the brief, not the product**. Three
> refusals in one restamp is the strongest evidence this session produced that the instrument is
> load-bearing."*

### §7B.4 — Green bought the wrong way — four more shapes

| Shape | What happened | The guard |
|---|---|---|
| ⭐ **An abstraction hid its own field from the gate measuring it** | 27 schemas carried provenance while the gate read `covered kinds: NONE`, because the field was spread in from a helper. **Its own docstring had argued against exactly that pattern** | a coverage gate must see what a reader sees; prefer the explicit field over the shared spread |
| ⭐ **A test passing for the WRONG REASON** | a backward-compat arm derived its pre-change record from an empty parse, **which throws** for one element kind. *"Two rejection arms would have gone green… because a bad provenance and a zero depth both fail and `success === false` cannot tell them apart"* | assert **the path** on every rejection, and add an arm-0 baseline-validity floor |
| **A ledger row struck as PAID on a free-text string** | in a suite that never reaches the engine | strike from an executed run |
| **A stale pin is an uncommitted payment** | one pin sat *"stale across two payment rounds"* | the pin moves in the commit that pays it |

### §7B.5 — A gate that classifies by NAME can be satisfied by RENAMING

One epsilon fix **was** a rename, and **was correct** — the breaches were mis-named domain bands,
and adopting the shared role would have **tightened a 0.15 m band by 150×**.
> *"But note what the gate actually verified: **a name.**"*

**Rule**: a rename must **argue for itself in the commit**, stating **why the new name is TRUE** and
**what adopting the checked role would have done to behaviour**. Counting gates must be
**structural**, not name-based.

> ⭐ **Measured 2026-08-16 — the cost of this one, finally counted.** `check:commandmanager` matched
> the literal string `commandManager.execute` and reported **51 · PASS · "1 headroom remaining."**
> The true count of production calls reaching the legacy manager is **136** — literal 51 · **alias
> 71** · **indirect 14**. **It was seeing 37 % of its own subject**, and CLAUDE.md plus
> `deploy-fly.yml` both quoted its green as an assurance.
>
> **The instructive part is where the 85 came from.** Two sites *do* state gate-dodging as their
> rationale in their own comments (`AnnotateViewCommand.ts:199` — *"Renamed from `commandManager` →
> `_cmdMgr` to satisfy CI gate … keeping the ratchet count at threshold"*; `PlanViewToolOverlay.ts:782`).
> **But deliberate evasion was the small half.** The largest single class — ~40 sites — is bus
> handlers under `plugins/<pkg>/src/handlers/` opening with `const cm = window.commandManager`, in
> the exact L6 layer the gate exists to keep clean. Nobody was hiding. **A name-based gate does not
> merely invite evasion; it silently fails to count the ordinary case**, and the ordinary case is
> always the bigger number.
>
> **The fix is structural and needed no AST**: the manager must be **bound to a name** before it can
> be called under one, so bind-then-count over the binding's block. Arm 1 reproduces the old 51
> exactly, which is what proves the change is pure addition rather than a re-definition.
> `598fd707` · `afe0cdad`.

### §7B.5a — ⭐ THE THIRD CATEGORY: the instrument's SUBJECT is wider than the contract's CLAUSE

**Added 2026-08-16 from lane G2 (A.12).** A.12 as written splits exit 3 into two causes — *stale
ledger* and *real breach*. **That split is incomplete, and the missing category dominated.** Across
the two refused gates there were **four** exit-3 causes: **one** was real debt-keeping; **three were
false positives of the gates' own analysers**, and all three had the same shape.

> **The gate scored a site that the contract's clause does not bind.**

- `check-region-reference-frame` fired on `FinishSegmentAdapter.ts:150` — a `{x,z}`↔`{x,y}`
  coordinate adapter that **forwards** `edge.reference`. C79 §3.1/§3.2 bind *"a region-**traced**
  edge"* / *"a region **path**"* — **the act of CHOOSING a frame.** Forwarding is not choosing.
  Worse: it fired on the family that honours §3 *best* — the frame is refused one layer up in
  `reprojectFinishBoundary.ts:236` with a typed `GEOMETRY_UNPREDICTABLE`, under its own negative test.
- `check-index-can-refuse` scored two **constructor-only subclasses** as unable to refuse, while
  scoring the base class they inherit everything from as **able**, in the same run — because ARM B
  read **one file per subject**.
- The same gate policed C78 §8.1's **eleven**-member closed union against a **hand-copied five**, so
  a legitimate `ENGINE_NOT_AVAILABLE` refusal (member #2) was invisible.

**Three rules follow, and they are the point of this entry:**

1. **Diagnose an exit 3 into THREE buckets, not two** — stale ledger · real breach · **subject wider
   than the clause**. Quote the contract's actual verb. *Traced* and *forwarded* are different acts;
   a gate that cannot tell them apart is measuring the wrong set.
2. **Fix a false positive AT THE INSTRUMENT, never at the ledger.** Ledgering these three would have
   *"recorded three defects that do not exist and backdated a decision nobody made."*
3. **Before narrowing any gate, prove you have not weakened it.** G2's discipline is the standard:
   re-check every already-ledgered subject against the *new* rule and confirm each is still a
   finding — then, better, make the narrowing **police more than it did**. The region gate now names
   the upstream guard *and its regex* in the ledger and fails if that guard vanishes: **a deletion it
   previously could not have seen at all.** ⭐ **Redirection, not exemption.**

⚠ And the meta-finding: `run-all.ts`'s recorded reasons for refusing to register both gates **were
factually wrong**. *"We looked and it was not registrable"* was itself a BY-READ claim — the thing
C70 §0.1 forbids — sitting inside the runner that exists to stop BY-READ claims.

### §7B.6 — The mis-pin that the gate itself caught — why "0 findings" needs "N examined"

> ⭐ *"Its first pin of **3** was WRONG **and the gate caught it**: that run had a failing positive
> control, so four arms never reached a verdict and their findings were invisible. Pinning 3 would
> have declared a level **below** the truth. It exited **2 MISCONFIGURED** instead of scoring over an
> unproven subject — a live demonstration of why '0 findings' without 'N examined' is the empty-seed
> lie."*

This is §7.2 working. **Preserve the behaviour that produced it.**

### §7B.7 — Claims of enforcement that were not enforcement

- **Four committed gates registered in NO runner** — *"Those readings are true when a human runs the
  script and **enforced never.**"* (Resolved; the class recurs.)
- **A gate exiting 0 under a `✓` headline while its own spec says green is impossible** (§3.2, A.13).
- **A gate that "says in its own output which half it had to simulate"** — counted **UNPROVEN**.
  *"UNPROVEN wearing a pass's clothes is the precise failure C70 §0 was written about."*
- **A validation service guarded on a global that is assigned nowhere in the repo**, so the guard
  **fails CLOSED into a green "✓ No issues found"** — *"a 2 m² bedroom renders identical to a
  conforming room. **Absence-of-check and absence-of-defect are the same pixels.**"*
- ⭐ **A NULL STORE READS AS COMPLIANT** (§3.8).
- **`CLAUDE.md`'s own precedent** (L-809/L-812): a document claiming CI enforcement that did not
  exist. **The same class**, and it is why §0.2 corrects the contract range here.

### §7B.8 — Numbers that were corrected, and the direction of the error

**Every correction below ran in the direction of leniency** — the earlier reading was *kinder* than
the truth. That is the pattern to expect.

| Claim | Corrected to | The lesson |
|---|---|---|
| *"42 point-in-polygon implementations"* | **61 distinct ray-cast bodies / ~71 named definitions across 116 files** | *"A prior audit reported 42. **That number was a floor, not a ceiling.**"* And: *"**Twice now it has come in low, both times in the direction of leniency.**"* |
| *"regenerable with two exceptions"* | **six** named non-regenerable members | incl. *"the provenance store is not persisted at all — **destroyed on every reload**"* |
| *"11 inert headers"* | **16** | the plan under-counted by five, each named |
| *"27 packages fail isolated compilation"* | **26** | *"The register cited 27 from a commit subject nobody had verified"* — ⚠ and **26 is itself an unre-run reading** |
| triangulation / engine copy counts | **higher** | ⭐ *"its own new counting gate **corrects this register's arithmetic upward**. **An instrument that counts a duplication is not a collapse of it.**"* |
| ⭐ *"1 verb of 323"* — **the corpus's most-cited number** | **1 of 325**, and the numerator is now **≥5** | the verb denominator moved; **any document restating "323" needs updating** |
| ⭐ *"15 of the 19 generator errors"* | **FALSE** | *"a validation report printing **unmeasured defaults as measured zeros**"* — failure-vs-emptiness **in the reporting layer**, hiding where nobody had looked |

⭐ **And the method lesson from the last row**: *"**the founder's live testing outranks every
synthetic sweep.**"*

### §7B.9 — Premises refuted by re-measurement, and the discipline that follows

Beyond §3.1.2's row-level refutations:

- ⭐ **A gate reported missing was present.** *"**That was WRONG, and the error was mine, not the
  tree's** … I had scanned one directory only and concluded absence from a search that could not
  have found it — **a directory-scoped search reported as a tree-wide fact.**"* **Operational fix:
  run the gate from its own directory.**
- ⭐ **An audit corrected its own grep**: *"§5's 'MEASURED-ABSENT' for the verb was wrong, **my grep
  pattern missed it**."* Anyone reading the un-corrected section alone gets a false fact.
- ⭐ **A "one-line omission from the same tracer" was not that at all**: *"My first draft called this
  'a one-line omission from the same tracer'; **it is not**."*
- ⭐ **`withGesture` has ZERO production call sites**, contradicting two source comments describing a
  live site. *"what is broken is the **documentation**"* — the same class as L-809/L-812.
- ⭐ **"A real geometric constraint solver is in the tree"** — refuted the same day. *"The skip-list
  entry hid a working solver"* → **it hid a mock.** *"the solver is reachable nowhere; the mock is
  reachable in a non-production app."*
- **A package's "orphan" status was measured FALSE** (§6.3).

> ⭐ **The standing rule: RE-MEASURE BEFORE BUILDING**, and *"**inherit suspiciously, and it pays.**"*
> Verify inherited work **by execution, never by its author's report.**

### §7B.10 — Structural traps a future engineer must not walk into

**Modelling and data**

- ⭐ **`[]` means "zero results" and nothing else.**
- ⭐ **A wrong value is worse than a missing one.** *"**Fix the classification before writing the
  first edge.**"*
- ⭐ **A field that names a dependency and is structurally always empty is worse than no field.**
- **Writer-first exits 3, by design, and correctly.**
- **Registering a no-op and claiming coverage is the defect, not the fix.**
- **Never reconstruct `prevState` by re-reading the store.**
- **Never key on an id that renumbers.**
- **A near-miss name is worse than a new name.**
- **Widening one of two byte-identical copies leaves the other as the next silent loss.**
- **A conditional `len > 0 ? … : undefined` serialisation collapses empty and absent.**

**Process and tooling**

- ⭐ **A `console.log` is not a user-facing message**, and ⭐ **never synthesise an answer on the
  user's behalf.** A detector fired perfectly and spoke only to the console; a panel in the same
  path **resolved a fabricated `"cancelled"` for a prompt the user never saw** — *"the system
  recorded a user decision that no user made."* **It has now recurred three times. Treat "does the
  user SEE it?" as an acceptance criterion, not a polish step.**
- **Never enable dark tests blind** — *"MEASURE THE GREEN ONES IN ISOLATION FIRST, THEN REPOINT.
  Never enable blind — that is how a gap becomes a broken build."*
- **A test designed to go red when the fix lands must be re-stated in the same commit.**
- ⭐ **Root `tsc` can exit 0 while OOM-ing** without `NODE_OPTIONS=--max-old-space-size=6144` — *"it
  can report a false green."*
- ⭐ **`git commit` without `-- <paths>` takes the whole shared index** (it happened twice);
  **`git commit --amend` swallowed 31 files**; ⛔ **NEVER `git stash`** — the stash stack is global
  across worktrees. **A silent lane holding uncommitted work is the default failure mode.**
- ⭐ **Pressing Esc / interrupting the orchestrator chat KILLS every background agent.** *"Type and
  send, never Esc."* It has fired in three separate sessions.
- **A saturated tree makes the test runner's import phase minutes long** — *"A lane that reports
  'waiting' twice must be told to **read its output file**."*
- **The gate must be run from its own directory.**
- **Deploy from a clean detached worktree at a committed SHA while lanes edit the main tree** — the
  proven pattern for deploying mid-fleet. And **a deploy that the cover correctly refuses is the
  cover working**: *"Deploying would have shipped a non-compiling tree."*

---

## §8 — Explicitly NOT in scope

**The value of a critical path is what it excludes.** Everything below has been considered and
**ruled out as a wrong route**, not merely deferred. Re-proposing one requires new evidence, and in
the architecture cases, a superseding ADR (§6.4).

### §8.1 — The STR-06 §18 anti-list — visible gaps that are the wrong route

| Not in scope | Why |
|---|---|
| **Generic model-wide impact traversal** | the loop closes **one golden operation**, not a universal traverser |
| **An AI-specific router** | parity requires the AI to use **the same** verbs, not its own path |
| **Execute→undo as a preview mechanism** | preview must be **pure**; executing to preview is the defect |
| **Global `CascadeRunner` registration before its test** | registration is deferred to R2 (§6.3) |
| **A second expression engine** | two rival engines already explain in-source why they exist |
| **Exporter-wide provenance before ownership** | provenance export is WIRE-**after**-ownership |
| **Wiring every orphan reflexively** | *"decided per item from evidence, **never wired in bulk to make a count go green**"* |
| **320-verb coverage** | the consequential core is 100 verbs; the rest is not the subject |
| **A universal approval system before the consequence object exists** | approval binds to a plan; there is no plan to bind to yet |

### §8.2 — Not on the critical path to a closed CI gate

Named explicitly, because a closed gate is a narrow claim (§4.1): **most of the register's 82 gaps
are not on it.** The critical path is `0R → 1 → 2 (MT-01 wall/slab/room only) → 9 (CE-02 only)`.
Everything else — however valuable — is **after** the gate closes, and citing the closed gate as a
capability claim is a C70 §8.i violation.

### §8.3 — Construction that is authorised by nothing

⭐ **Three statements that are different and all true of some rows**: *"Construction that is not
architecture change **and not yet permitted** are three different statements; all three hold here."*
The distinction is load-bearing **in both directions**: **downward** it stops a wiring list being
read as a rewrite proposal; **upward** it stops construction being smuggled in as wiring.

- **No solver is authorised** (§3.8). CO-09 opens only on C74 §4.2(c) evidence.
- **The construction items nobody is waiting on** — GE-05, GE-06, CO-04 — **none gates a level; all
  three are real gaps.** They are not on any critical path and **three of the four are authorised by
  nothing.**

### §8.4 — Not this document's job

- **Status, counts, percentages** — the tracker (§0.1).
- **Per-gate assertions** — the gate file itself. *"Where this roadmap says 'build the gate', the
  gate says what it asserts."*
- **Estimation.** Deliberately absent: *"the rejection does not depend on the number, and supplying
  one would invite the decision to be re-litigated **on the number**."*

---

## §9 — FOUNDER-BLOCKED, and the dated obligations

**§2.6 governs this section: these items are never scheduled.** *"Scheduling a founder decision as a
task is how a decision becomes an assumption."* They have **no position in the sequence and no
predicted date**, and nothing downstream of them may be planned as though they will arrive.

### §9.1 — The four blocked rows, and what unblocks each

> ⚠ **THE AUTHORITY FOR THESE DECISIONS IS NOT THIS DOCUMENT.** It is
> [`L-391-COLLAB-DEPLOY-DECISION.md`](L-391-COLLAB-DEPLOY-DECISION.md), which is **not being
> deleted**. The rows below **point at it**. They deliberately do not restate its reasoning —
> **a restatement would fork the decision**, and a companion file that disagrees with its parent is
> how a reader ends up trusting the wrong one.

| Row | What it is | What unblocks it |
|---|---|---|
| **CB-01** | The sync transport | ⛔ **A founder spending decision.** Deferred — *"not needed for now"*. Per L-391 §0.1 it closes as **CORRECTLY DEFERRED, not as an open defect**, and ⭐ *"**the deferral is a spending decision about one always-on process, not an engineering gap.**"* Unblocked by the founder revisiting it. |
| **CB-02** | The authorization mode | ⛔ **DECIDED in principle, not yet flipped.** L-391 §0.2 names the target mode and its database prerequisite. The sync-server config is *"one flip behind this decision"*, left unchanged **deliberately**, because a strict mode without a database URL is *"a server that fails closed on every join."* Unblocked when CB-01 is. |
| **CB-05** | Per-capability convergence proofs | ⛔ **Inherits CB-01's deferral.** ⭐ *"It does **not** become UNPROVEN-for-want-of-effort; **it is unmeasurable by decision**."* C8 therefore **remains unscoreable**. |
| **MT-08** | §UNDO-GESTURE-ID | ⛔ **Explicitly NOT decided** by the founder's ratification of ADR-0321. That ADR records the governance boundary: *"The other two — the sync-server deploy and §UNDO-GESTURE-ID — were **not** taken as decided by that word and remain open."* |

**What they block**: **Level 7 entirely**; **Level 8** via the Golden Chain's collaboration link;
and `check-collab-graph-integrity`, which reports **UNPROVEN — never green — until a real transport
exists**.

### §9.2 — The ceiling — quote it only with the deferral named in the same sentence

The programme's arithmetic ceiling is recorded, with its authority, in L-391 and in the tracker:
**77/82 absolute**, and **74/82 once the CB-01 / CB-02 / CB-05 deferral is applied**.

> ⭐ **"74 is the number to plan against; 77 is the number to quote only with the deferral named in
> the same sentence."**

And the older, sharper form of the same fact: *"**PARTIALLY VERIFIED is the arithmetic ceiling until
the sync server is deployed… no amount of further engineering raises the ceiling; one founder
decision does.**"*

⚠ **Both figures are readings.** They are stated here because they are **plan targets** — the number
to plan against — and their live values belong to the tracker. If they disagree, **the tracker
wins**.

### §9.3 — Founder decisions already taken — recorded so they are not re-litigated

| Decision | Effect on this plan |
|---|---|
| **Wall connectivity is `joinedTo`, NOT `connectedTo`** (ADR-0321, ratified) | §3.4; row 9 of §6.1 |
| **PR-05 = UPDATE-SURRENDER**, not pre-sweep clear | §3.5. ⚠ **the gate stays at its declared level BY DESIGN; do NOT hand-strike the row** |
| **The generative-quality ledger: PIN NOW** | a generation-quality regression now fails CI. **Separate denominator** (§1) |
| **`hierarchyStore` + `parentId` is the SOLE hierarchy substrate** (ADR-0325) | settles what both DECLINED `partOf` rows were waiting on; `partOf` stays PARKED and the query service **stops answering a confident `[]`** (§3.4 C.7) |
| **The ribbon: MOUNT** (C82 + ADR-0326 + SPEC-50) | its Phase 3 landed **first, deliberately** — every unbacked verb **refuses with a reason** citing its backlog row |
| **Merging the three graphs: REJECTED** | §6.4 |
| **The restamp authorisation** — *"stamp it from fresh gate runs"* | §7B.3 |

### §9.4 — ⭐ DATED OBLIGATIONS — these expire, and they lived in a document being deleted

**Five items carry a hard `reviewBy` of 2026-09-12.** They were recorded in the disposition docket
and **nowhere else**. *"'Later' is not a disposition — an expired undecided row fails the run that
discovers it (ADR-0323 rule 4)."*

| Item | Disposition | Owner | `reviewBy` |
|---|---|---|---|
| ⭐ **`pryzm-render-registry-isolation-leak`** | **WIRE-PENDING.** *"**YES — this is the C13 isolation-violation alarm.** The invariant requires the **detection to be heard**; today the alarm fires into silence."* Recommendation: a bootstrap listener incrementing an OTel counter + a dev-mode toast. ⛔ **Removal instead requires explicit founder sign-off** — *"**Deleting an alarm is a policy statement.**"* (ADR-0323 rule 5) | Editor bootstrap owner; **escalation: founder** | **2026-09-12** |
| ⭐ **`@pryzm/pdf-to-bim`** | **WIRE-or-REMOVE — ⛔ FOUNDER DECISION.** Two rival extraction paths — *"the exact 'five overlapping systems' pattern STR-06 §5 warns about."* If WIRE, the live flow consumes this package's review queue **and the loser is deleted in the same change** (REPLACE semantics) | **Founder** | **2026-09-12** |
| **`@pryzm/expr-eval`** | **REMOVE** — delete the workspace; the two rival engines' in-source comments are updated **in the same commit** so they do not cite a deleted package. Needs a lockfile-churn commit | R0 follow-up (dedicated commit) | **2026-09-12** |
| **`@pryzm/wcag-audit`** | **WIRE-or-REMOVE** — WIRE means a runner in the a11y-check family invoked from CI. **If no owner claims it by `reviewBy`, the default is REMOVE** | a11y/gate owner — **UNCLAIMED** | **2026-09-12** |
| **`plugins/ai-generative` descriptor** | **REMOVE at `reviewBy` unless wired.** A dated scaffold header has been added; the workflow it names is real and reached **without this shell** | AI-host owner — **UNCLAIMED** | **2026-09-12** |

**Two further obligations keyed to a milestone rather than a date:**

| Item | Disposition | `reviewBy` |
|---|---|---|
| **`CascadeRunner`** | **PROMOTE** as the cascade branch of the future planner, **not** as the planner (§6.3) | **R2 exit**, or 2026-10-12, whichever is first |
| **`getEdgesForRoom` / `getConnectedComponent` / `TemporalGraph.getEdgesForElement`** | **WIRE-PENDING-R2** — impact-surface inputs, **HOLD, do not delete** | **R2 exit** |

### §9.5 — ⭐ COORD-01 / C76 — an open, unowned founder-level obligation

**This exists only in the review coordinator notes and would otherwise vanish entirely.**

> **COORD-01 (founder finding)**: *"the element-kind census is **evidence of an architectural
> coverage problem, not itself a coverage metric**"*; *"**per-kind percentages are not meaningful
> until that declaration exists.**"*

**The evidence**: three disagreeing kind enumerations — **schema barrel 28 · chat probe list 16 ·
parameter-routing table 11** — and ⭐ *"**No document declares which is the denominator.**"*

**The binding effect, still in force**: *"any finding phrased as a per-kind percentage is
**downgraded** to 'evidence over a contested denominator' until the register exists."*

**The scope call**: mint **C76** for the element-family register.

⚠ **C76 WAS NEVER MINTED.** The contract suite runs C70–C75 and C77–C83; **the README still reserves
C76 for the element-family register.** **COORD-01 remains an open, unowned obligation, and this
document is now the only plan-side record of it.**

**Two resolved coordinator entries, recorded so they are not re-opened**: the opening re-clamp
question was *"settled by re-measure, not by adjudicating prose"* and is **CLOSED**; and MT-08's
gesture-identity half landed — *"gesture identity replaces the 250 ms clock"* — though MT-08 itself
remains founder-blocked (§9.1).

### §9.6 — Other open founder decisions carried at close

- **The generative-quality ledger needs an owner.**
- **CI-1's runtime half** — refuse, or a blocking banner, when a house strands a room?
- **The dark-test no-runner scope call** — a body of test files under `tests/{parity,visual-diff,
  contract-44,ci,playwright}` **belong to no runner at all**; *"that needs a runner **created**."*
- **NOT DETERMINED**: whether the layer model extends to the backend (the backend packages have no
  layer). One of the coverage matrix's two unresolved TARGET rows.
- **NOT DETERMINED**: whether `metadata.version` should be persisted at all, and whether
  `_renderVersion` belongs on the model. ADR-0319 says *"Not decided here."* The other TARGET row.

---

## §10 — ⚠ WAVE SCHEDULING — the volatile section

> ### ⚠ **THIS SECTION IS VOLATILE BY DESIGN. EVERYTHING ELSE IN THIS DOCUMENT IS DURABLE.**
> Waves are **execution scheduling**, not structure. They change every session. **They are what the
> retired percentage-milestone A/B/C scheme became** (§0.3, decision 3), renamed so that no letter
> in this document means two things.
>
> **A wave is a batch of work, not a phase.** A wave may draw items from several capability phases
> at once. **Which items have landed is the tracker's question, not this section's** — several of
> the items below may already be complete.

### §10.1 — Wave 1 · *(was "Phase A" in the percentage scheme)*

| # | Item | Note |
|---|---|---|
| 1 | Deploy + browser verification | ⭐ **the founder's live testing outranks every synthetic sweep** (§7B.8) |
| 2 | Re-count the register from **fresh gate runs** | §7B.3 |
| 3 | GE-02 — the remaining point-in-polygon rivals | ⚠ **most are blocked on a `package.json` dependency and a `pnpm-lock` sync, NOT on code** |
| 4 | `HiddenLineRemoval.ts` — **the one real design item in this wave** | `pointInSilhouette` is **not a ring**; it needs a kernel `pointInEdgeSetEvenOdd`. It is not a call-site swap |
| 5 | L-851 — the spec files that have never run | ⚠ **measure green in isolation FIRST, then repoint. Never enable blind** |
| 6 | PR-12 — a one-line fix | ⚠ **its structural test is designed to go RED when the fix lands and must be re-stated in the same commit** |
| 7 | Enrol `check-room-aabb-canonical` in the certification suite | residency: it needs a run → certification (§7.4) |
| 8 | The finish-host tracker audit | the subject of §7B.1's false green |
| 9 | **Carry-forward** | ⛔ **the generative programme has its own tracker and its own denominator of 28 and must NOT move this programme's numerator** (§1) |

### §10.2 — Wave 2 · *(was "Phase B")* — the drains

| # | Item | Note |
|---|---|---|
| 1 | The `[]`-means-unknown drain to **0** | §3.4 C.10 |
| 2 | **CE-05 — the gesture-level reachability probe** | ⭐ command→graph is instrumented; **gesture→command is not — the harness starts one link too late.** Honest narrowing: a trackers-reach gate already exists as the missing instrument class, *"precisely because 'a tracker whose `subscribe()` call is intact and whose `touch()` line has been commented out passes every grep ever written'"* — but **its subject is the bespoke pairs, not the finish families.** Do not overstate the gap in either direction |
| 3 | PV-04 / PV-06 | the export boundary is MEASURED-ABSENT; a confidence field exists on site data and **on no element kind** |
| 4 | PR-10 | — |
| 5 | PR-11 | ⚠ **implement the handler FIRST** (§7B.10) |
| 6 | CE-03 / CE-04 | ⚠ **correct the texts, do not over-fix** — they are **UNCERTIFIED, not untested**. *"executed unit suites are evidence, never certification"* |

### §10.3 — Wave 3 · *(was "Phase C")* — the long pole

| # | Item | Note |
|---|---|---|
| 1 | **Bar 3, by verb family** | §4. **The long pole, and NOT a one-session job.** *"Anyone promising 100 % in one session has not read the gate's output"* |
| 2 | **Roof needs an L0 schema field FIRST** | §4.4 rule 2. `packages/schemas/**` is shared-dangerous → **a sequenced solo change** |
| 3 | ~~Junction re-weld~~ | ⛔ **STRUCK** — it was carried as open in **four** places and is done |
| 4 | The four not-yet-counted predicate families | ⚠ **in this order**: segment-segment-intersection → polygon-area-and-winding → point-to-segment-distance → **polygon-containment-overlap LAST** (§3.8) |
| 5 | The dark-test ledger to 0 | see §9.6 — part of it needs a **runner created** |

### §10.4 — Adjacent track · C83 spatial validity *(not one of the 82 — §1.2)*

**Reordered by survey.** **S0, S1 and Slice C are each unblocked and mutually independent.**

| Slice | What | Note |
|---|---|---|
| **S0** | plan-view `canPlace` parity | **a regression, two lines** |
| **S1** | `FURNITURE_BLOCKS_DOOR` as **ADVISORY** | **zero new geometry, vocabulary, UI or schema** |
| **Slice C** | make `contains` reachable | ⚠ **fix the ID-KEYED classification FIRST** (§3.4 C.6) |
| **S3** | `Door.swing` → `OpeningPose` (L-856) | — |
| **S4** | `OCC_CROSSES_HOSTED_OPENING` **ENFORCEMENT** | ⚠ **deliberately LAST**, though it is the headline case: it costs a C74 §2 row **and** a preview trigger with **zero callers repo-wide**. C11 §7.6 names what shipping it early produces: ***"a dead click behind a perfect preview."*** |

### §10.5 — The strategic read, kept because it is the only opinion in the corpus derived from measurement

- **Finish the trust programme, but stop treating 82/82 as the goal.**
- ⭐ **Bar 3 is the gate to the product the founder actually wants.**
- **Collaboration is a purchase decision, not an engineering one** (§9.1).
- **The generative ledger needs an owner** (§9.6).
- ⭐ **Fund instruments before features.**

---

## Appendix — the vocabulary this document uses

| Term | Meaning, and where the rule lives |
|---|---|
| **PASS / FAIL / UNPROVEN** | three states, **never collapsed**. *"**UNPROVEN is not a soft pass.** Most of this program's progress in its first week was converting UNPROVEN → FAIL, which looks like regression and is the opposite."* |
| **INSTRUMENTATION vs CAPABILITY** | two axes, **never averaged**. *"A gate that exists and reads RED is **instrumentation complete, capability zero**."* |
| **Green** | exit **0 CLEAN**, or exit **1 DECLARED-LEVEL** against a named shrink-only ledger. **Exit 2 and exit 3 are never "green"** (§7.2) |
| **CLOSED vs CLOSED (BY-READ)** | closed from a **re-run artefact** vs closed from prose. *"the two are never laundered into one another"* |
| **REFUSES-CORRECTLY** | **a pass.** A cell that honestly refuses is a pass; a cell that is silent is a failure |
| **NOT DETERMINED** | genuinely unknown, and **a permitted answer** |
| **BLOCKED-ON-FOUNDER** | **not schedulable** (§2.6, §9) |
| **The Golden Chain** | eleven links. **A capability missing a link is NOT BIM 3.0 complete. No partial credit across links** |
| **The maturity ladder** | L4–L8. **No level is awarded without executable evidence.** *"A level claimed from source-reading is BY-READ, and **BY-READ is never an award**."* ⚠ **Level 4 is HELD but was uninstrumented until Phase 0R** — *"the subsystem the award rests on is ungated, so the level is held without an instrument that could detect its loss"* |
| **Definition of Done** | C70 §6's eight conditions, **each an executed run.** *"**Nothing on this list is a UI feature. Nothing on this list can be satisfied by a document — including this one.**"* |

### What BIM 3.0 IS — the one-sentence definition, kept because every phase above is a piece of it

> *"BIM 3.0 is a **computational building model**: a persistent, authoritative, identity-preserving
> model whose topology is explicit, whose geometry is a deterministic consequence of model state,
> whose relationships are computable by algorithms, whose changes propagate deterministically, whose
> every datum knows how it came to be known, and which **refuses honestly** where it cannot answer."*
>
> *"It is not a renderer, not a chat interface, not a file format, and not an AI product."*

**The founder's rule, binding on every phase**: ⭐ ***"The LLM may sit above the computational model,
not underneath it."*** *"Nothing an LLM emits is ever model truth; it becomes truth only by passing
through the same command path as every other mutation."* The AI sits **beside** the user, not
beneath the model: *"Remove the AI box entirely and the system loses no capability except
conversation."*

**The reading rule, binding**: *"every definition is stated in terms of **MODEL CAPABILITY, never UI
features**. A panel, a toolbar, a rendered acknowledgement — none of these is evidence of
anything."*

**And the claim that survived every downgrade**: *"A complete BIM 3.0 is achievable in this codebase
**with zero LLM involvement**. **The LLM is a client of the graph, never a component of it.**"*

---

# §11 — PLAN AMENDMENTS, 2026-08-15 (measured, not forecast)

> Ten lanes ran against Half 1's open rows and Half 2's next family. **Every lane that closed found
> its row's premise partly wrong.** These amendments record what the plan must now say differently.
> Status readings live in the TRACKER (§12 there); this section carries only what changes the PLAN.

## §11.1 — Phase B · PR-11 is NOT a wiring task, and the plan must stop describing it as one

The roadmap said *"implement the handler FIRST — registering a no-op and claiming coverage is the
defect."* The handler is now genuinely implemented (`278b99e5`). **The row still cannot close, for a
reason the plan did not contain:** `new CascadeRunner()` appears **only in test files, repo-wide** —
there is no production registry for `registerCrossHandlers` to register into.

**Amendment:** PR-11's remaining work is **standing up a production cascade runner**, which is a
composition-root change (P1 — production code obtains a runtime only via `composeRuntime()`) and
therefore a **sequenced, founder-visible decision, not a handler task**. Recorded normatively in
[C72 §2.5](../../02-decisions/contracts/C72-PROPAGATION-AND-PREVSTATE.md), which also notes the
contradiction this creates with C72 §2.1's "no third state may persist": *handler real, channel
absent* is a third state.

## §11.2 — Phase B · GE-06 needs FIVE detectors, and one already exists unwired

The plan treated GE-06 as "a missing algorithm". Measured, it is more specific and cheaper in one
place than assumed:
- All **12 declared `clash-*` bus verbs now REFUSE** with typed identity (`ENGINE_NOT_AVAILABLE`,
  C80 §1.4) instead of being registered ids with no handler (`8de42e12`/`c2162b05`/`2bcc07ce`).
  **That is a refusal, not a detector — GE-06 stays OPEN**, and its commit says so.
- **What remains: five pure pair-detectors** — wall×wall, column×slab, stair×slab,
  furniture×clearance, opening×wall — roughly one lane-session each.
- ⭐ **`geometry-roof` ALREADY HAS an oracle-tested roof×wall detector in state
  `EXISTS_BUT_UNWIRED`** — kept a distinct third state from `REGISTERED` precisely so it cannot be
  counted as coverage. **PR-10 needs exactly this detector**, so PR-10's cheapest path is WIRING,
  not construction. The plan previously implied PR-10 waits on the whole clash engine; it does not.
- **New finding for a future lane:** the bus declares 12 `clash-*` ids and the **toolbar declares a
  DIFFERENT 12, with only 3 overlapping.** Two rival id sets for one capability (C69 rival-list
  class).

## §11.3 — Half 2 · the family cadence is confirmed, and the next family is named

Three families have now landed WHOLE (C78 §19.1): hosted-opening CREATE `78394be2`, hosted-opening
DELETE `9e780581`, **wall.delete `d572fb7e`**. Recorded normatively in
[C78 §19.3](../../02-decisions/contracts/C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md).

**The selection rule, now proven three times: choose by cheapest reuse of proven substrate, never by
verb popularity.** Next family = **`wall.batch.create`** (reuses `WallCreateConsequencePlanner` and
the occupancy seam; C78 §1.5 counts a batch as ONE consequential verb either way).

⚠ **`check-relationship-determination` ran in NO runner until `df0f6692`.** Every bar-3 number
quoted before then was hand-run with nothing defending it. Gate registration now precedes family
work, not follows it.

## §11.4 — ⭐ THE STRUCTURAL AMENDMENT: drains do not converge without a LANDING ARM

**Five of the eleven RED gates measured this session were minted by this session's own feature
work** — epsilon ×2, predicate-canonical ×2, otel ×3, declared-project-scopes ×2 — all from the
lanes that were simultaneously closing founder findings. They were paid at source (`703d9404`), but
the pattern is the point, and GE-01's refusal names it exactly:

> **Draining does not close a ratchet row; a LANDING ARM does.**

**Amendment, binding on every drain row (GE-01, GE-09, GR-14, CO-06):** a drain lane's deliverable
is not only the count going down. It is an arm that makes a NEW declaration fail at the door.
Without it a drain is a treadmill: the next feature mints debt faster than the drain retires it, and
the row re-reds — which GE-01 has now done **twice**. Budget the landing arm at the END of a feature
lane, never only at the start of a drain lane.

## §11.5 — Wave order, revised by measurement

1. **Register every gate before trusting any of its numbers.** 11 of 13 orphans registered
   (`df0f6692`); **2 refused** — `check-index-can-refuse` and `check-region-reference-frame`, both
   at exit 3, which no ledger may absorb. Those two need lanes that FIX, not lanes that register.
2. **Landing arms for the four drain rows** (§11.4) — ahead of further draining.
3. **MT-06** — one opening authority. Promoted: it produced a user-visible defect the day it was
   listed as tidiness (ISSUE-LOG L-916). See [tracker §12.3].
4. **PR-10 by wiring the existing roof×wall detector** (§11.2), not by building the engine.
5. **CE-05's driving half** — the census landed (`e08869f9`) at `EXECUTED-REACHED 0/230` **by
   construction**; the follow-on gate answers the residency question YES and belongs under
   `certify.ts`. Two prerequisites it must not skip: resolve the three indirection idioms
   (`commandType` ×30, `def.commandType` ×11, `_cmd.type` ×4 — 45 of the 61 undetermined sites),
   and cross the result with `build-census.ts`, because **a resolved dispatch into an UNBACKED verb
   is still a dead button.**
6. **The 14 UI files that dispatch commands with zero importers** — ten of them bind a gesture.
   L-847's shape, found by instrument this time rather than by the founder noticing.
