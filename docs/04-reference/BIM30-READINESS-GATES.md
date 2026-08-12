# BIM 3.0 — the readiness gates, as executable specifications

> **Stamp**: 2026-08-12 · **Status**: LIVING SPECIFICATION · **Phase**: 0
> **Authority**: subordinate to [`C70`](../02-decisions/contracts/C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md)
> (the four-exit-code contract, the minimum-evidence floor, the Golden Chain, the maturity ladder,
> the Definition of Done) and to the five subject contracts it decomposes:
> [`C71`](../02-decisions/contracts/C71-GRAPH-AND-TOPOLOGY.md) §6 ·
> [`C72`](../02-decisions/contracts/C72-PROPAGATION-AND-PREVSTATE.md) §6 ·
> [`C73`](../02-decisions/contracts/C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) §5 ·
> [`C74`](../02-decisions/contracts/C74-CONSTRAINT-HONESTY.md) §6 ·
> [`C75`](../02-decisions/contracts/C75-PROVENANCE.md) §6.
> **This document adds no invariant.** It is the implementation specification for the gates those
> contracts name. Where a contract and this document disagree, **the contract wins** — raise the
> conflict as a defect in this file, never as a variance in a gate.
> **Siblings** (forthcoming, owned elsewhere — do not duplicate their content here):
> `docs/04-reference/BIM30-GAP-REGISTER.md` (the enumerated gaps) and
> `docs/04-reference/BIM30-DO-NOT-REBUILD.md` (the machinery that already works and must be
> activated rather than rewritten). The certification harness that consumes these gates is
> [`BIM30-CERTIFICATION-PLAN.md`](../03-execution/plans/BIM30-CERTIFICATION-PLAN.md).

---

## §0 — Coverage, stated before anything else so nobody infers it

**23 gates are specified in this document. 7 exist at HEAD. 16 do not.**

*(**Amended 2026-08-12** — this read "4 exist / 19 do not" until BIM 3.0 Phase 1 Tier 1 landed
`check-solver-is-real`, `check-provenance-not-invented` and `check-epsilon-policy`. Corrected in
place in the same change that set the residency rule, because a coverage table that under-counts
built gates rots exactly as fast as one that over-counts them.)*

| | Count | Gates |
|---|---|---|
| **BUILT** | **7** | `check-identity-roundtrip` · `check-derived-regenerable` · `check-propagation-reaches` (under `tools/rac-conformance/certification/gates/`) · `check-collab-graph-integrity` (under `tools/ga-gate/` — **misplaced under §2.1a and a standing finding**, C70 §7.2) · `check-solver-is-real` · `check-provenance-not-invented` · `check-epsilon-policy` (all three under `tools/ga-gate/` — **correctly placed**: static single-pass scans, §2.1a) |
| **SPECIFIED-NOT-BUILT** | **16** | `check-authoritative-state` · `check-topology-persistence` · `check-topology-invalidation` · `check-graph-write-coverage` · `check-graph-delete-integrity` · `check-graph-persistence` · `check-prevstate-contract` · `check-suppression-is-reversible` · `check-constraint-honesty` · `check-no-hidden-mock` · `check-predicate-canonical` · `check-deterministic-regeneration` · `check-provenance-coverage` · `check-derived-classification` · `check-algorithmic-core` · `check-collab-model-integrity` |

> **Not one of the 23, and built anyway:** `check-propagation-trackers-reach`
> (`certification/gates/`) closes C72 §6.1.2(d) — the four **bespoke** propagation pairs, which are
> the propagation that actually works in this product and which §3.9 explicitly **cannot see**. It
> is an **executed** gate and is correctly placed under §2.1a. Counting it here would inflate the
> 23; omitting it entirely would repeat the omission it exists to close, so it is stated and not
> counted.

> **§0.1 — a gate's existence is not its greenness.** Whether the four BUILT gates are green
> **today** is deliberately not recorded here (C70 §0.2: counts rot in documents and do not rot in
> gates). Run them. `check-collab-graph-integrity` is additionally **structurally incapable of
> exit 0 against production** while no transport is deployed, and that is correct behaviour, not
> a defect of the gate.

> **§0.2 — 19 of 23 means BIM 3.0 readiness is mostly UNPROVEN.** UNPROVEN is neither a pass nor
> a fail; it is *"nobody looked"* (C70 §2.2). No status document, roadmap, or summary may render
> a SPECIFIED-NOT-BUILT row as a blank cell, a zero, or an inherited green.

---

## §1 — The two rules, and the meta-rule

These are not style guidance. Each was learned by measurement in this repository, and each has a
commit or an artefact behind it.

### §1.1 — RULE 1. No gate may pass for any of these six reasons

A gate that passes because —

1. **a directory exists**,
2. **a file exists**,
3. **a grep found a string**,
4. **a mock returned success**,
5. **a UI displayed success**, or
6. **a test never exercised the real path**

— has measured nothing. Every one of the six is a recorded incident here, not a hypothetical:
~15 gates were simultaneously green and blind by conflating emptiness with success (C70 §0); the
"FreeCAD-grade constraint solver" is a `MockSolver` behind a `kind = 'planegcs'` label whose
31/33 passing tests bind to the mock (C74 §0, C70 §0); `PlanegcsAdapter.test.ts` covers the
injected-`underlying` path and **not** the `??` fallback every production construction takes
(C74 §3.5); and every classifier test passed throughout the openings `no-prevState` defect
because each test **built `prevState` by hand** and handed it to the classifier — they tested the
classifier, and the broken thing was the emit seam (C72 §3.4).

The positive form: **the only evidence of a mutation is an independent read-back of authoritative
state** (C70 L-INV-4), and the only evidence of a capability is an executed run whose comparator
has been watched go red (C70 §5.6).

### §1.2 — RULE 2. A broken measurement system must never report green

Two incidents, both closed, both cited here because the rule is theirs:

- **The empty-seed incident.** A certification run with **nothing in it** — every kind failing to
  seed, every comparator honestly reporting "nothing to compare", every row UNPROVEN, FAILED
  tally 0, vitest exit 0 — produced **the best-looking certification this repository had ever
  recorded**. A maximally broken run was maximally green. Closed at `e5addac8`; the mechanism is
  `tools/rac-conformance/certification/floors.ts` plus `certify.ts`'s pre-run freshness stamp,
  and that run now exits **2**.
- **The fabricating compile gate.** A gate printed **~90 PASS lines per run for its entire life**
  and never compiled the thing it reported on. Un-blinded at `2b1e7e99`, at which point it
  immediately surfaced 27 packages that fail isolated compilation.

Therefore, binding on every gate in this document:

> **A comparator reporting "0 divergences" MUST also report how many objects it compared.**
> A report of zero over a subject of zero is the empty-seed lie, and it exits **2**, never **0**.

### §1.3 — THE META-RULE (learned by C9). A meta-gate reports; it never aborts

A gate that audits **other gates** — coverage of the gate suite, floor presence, ledger
freshness, negative-control existence — **MUST emit its result as a finding inside the suite's
report and MUST NOT terminate, `process.exit()` out of, or otherwise pre-empt the suite it is
auditing.** C9 learned this the expensive way: an auditor that aborts converts "one gate is
misconfigured" into "no gate ran", and the suite's output becomes indistinguishable from a crash
— which is the C10 defect wearing a supervisor's uniform. The auditor's own verdict is a row
like any other; it may raise the suite's aggregate exit code through `certify.ts`'s `worst()`
ranking, and that is the *only* channel by which it is allowed to influence anything.

---

## §2 — The exit-code contract, stated once

Every gate in this document uses **one** implementation:
`tools/rac-conformance/certification/contract.ts` (`reportGate`, `verdictOf`, `Floor`,
`GateResult`). A gate that implements its own exit codes is a contract violation (C70 §5.1).

| Code | Meaning | Absorbable as declared debt? |
|---|---|---|
| **0** CLEAN | the gate measured its subject and found nothing wrong | n/a |
| **1** DECLARED-LEVEL | exactly the failures its **named** ledger declares | yes — by name, shrink-only |
| **2** MISCONFIGURED | the gate could not **establish its subject** | **NEVER** |
| **3** RATCHET EXCEEDED | worse than the ledger declares, **or the ledger is stale** | **NEVER** |

Consequences that are already implemented in `contract.ts` and must not be re-litigated per gate:

- **Floors are evaluated first and short-circuit to 2.** Any unmet floor wins over any finding
  count.
- **A stale ledger entry exits 3**, separately from findings, because folding it into the finding
  count would let one fix and one un-struck entry cancel out and read as "no change" (C70 §5.4).
- **0 findings against a `declared > 0` also exits 3** — paid debt leaves the ledger in the commit
  that pays it.
- **Floors are misconfiguration detectors, not difficulty settings.** Lowering one is the same act
  as deleting the gate and must be reviewed as such (C70 §5.3).
- **Ledgers name their entries.** A bare count lets a PR fix one finding, break another, and stay
  level (C70 §5.5). Checked in **both directions**.
- **A gate whose script file is missing is MISCONFIGURED**, never excusable as debt — `certify.ts`
  already does this, and `spawnSync`'s `r.status ?? 2` files an unspawnable gate the same way.

> **§2.1 — where a gate lives.** ~~Every gate in this document belongs under
> `tools/rac-conformance/certification/gates/` and is driven by `certify.ts`. The one exception at
> HEAD, `check-collab-graph-integrity` under `tools/ga-gate/`, is a **recorded finding** (C70
> §7.2): two suites with two exit-code implementations is how a four-exit-code contract quietly
> becomes two contracts. New gates do not join the exception.~~
>
> **AMENDED 2026-08-12 · §2.1-RESIDENCY. Reason:** the paragraph above was written when the split
> was one file wide and could honestly be called an exception. It is not one file wide any more —
> BIM 3.0 Phase 1 Tier 1 landed `check-solver-is-real`, `check-provenance-not-invented` and
> `check-epsilon-policy` in `tools/ga-gate/`, and `check-propagation-reaches`'s file already sat in
> the certification tree while being registered in `run-all.ts`. **Two runners exist, both are
> real, and the split was undocumented as a rule** — so every new gate was an unguided decision
> resolved by whoever wrote it. Amended in place rather than rewritten, per this document's own
> correction discipline; the struck text is the state it replaced. The amendment is below.

**§2.1a — the rule. Residency follows what a gate must REACH to establish its subject, not what it
asserts.**

| | **`tools/ga-gate/`**, run by `run-all.ts` | **`tools/rac-conformance/certification/gates/`**, run by `certify.ts` |
|---|---|---|
| **Admits** | gates that establish their subject by **reading the tree at HEAD** — a single-pass scan of sources, `package.json` manifests, committed artefacts, ledger JSON | gates that establish their subject **from a run** — compose a runtime, seed a world, dispatch verbs, open a transport, or grade an artefact a suite wrote in the same invocation |
| **Cost** | seconds to a minute each; ~40 of them run in one sweep | minutes to tens of minutes each |
| **Known tension** | `check-per-package-compile` sits here and takes ~25 min on its own — it spawns `tsc` per package, so by the boundary test below it is arguably executed. It is **named rather than hidden**: it predates this rule, it dominates every `run-all` wall-clock, and it is the standing argument for splitting `run-all` into fast/slow passes. It is **not** precedent for putting new executed gates here. | `check-collab-graph-integrity` is the mirror image and is misplaced the other way — see §2.1c |
| **Depends on** | `node:fs`, `lib/sourceScan.ts` | `world.ts`, `capture.ts`, `floors.ts`, the pre-run freshness stamp, and whatever transport or DOM shim the pair under test needs |

**The boundary test is one question: *does this gate need something that does not exist until
something runs?*** Yes → certification. No → ga-gate.

Two things follow, and both are the reason the rule is shaped by cost rather than by tidiness:

- **"All gates live in one folder" is the wrong rule in both directions.** Folding the executed
  gates into `run-all.ts` makes a sweep that people run casually into one they run never — and a
  verification tool that is too slow to run teaches nothing and gets switched off, which is
  precisely how this suite spent its life unwired (L-774). Folding the ~40 static gates into
  `certify.ts` turns the certification harness into a static scanner and buries four executed
  gates inside forty scans.
- **Residency is about the RUNNER; the directory should follow but is not the rule.**
  `check-propagation-reaches` is the standing case: it is **static** and is therefore registered in
  `run-all.ts`, while its **file** stays beside `cascade-events.json`, the ledger it reads. That is
  legal — what is registered is the path, not a copy — and the co-location is worth more than the
  tidiness. It is also registered in `certify.ts`, so it runs in both suites; that is disclosed by
  the runner, not failed, because running twice is wasteful rather than dishonest.

**§2.1b — exactly ONE exit-code implementation, imported by both homes, never copied.**
`tools/rac-conformance/certification/contract.ts` (`reportGate`, `verdictOf`, `Floor`,
`GateResult`) is the only implementation of the four codes, and the residency rule does **not**
weaken that — it is what makes the split safe. Verified at HEAD: all three Tier-1 ga-gate gates
open with `import { reportGate, … } from '../rac-conformance/certification/contract.js'`. C70
§7.2's real objection was never "two folders"; it was **"two exit-code implementations"**, which is
how a four-exit-code contract quietly becomes two contracts. A gate in `tools/ga-gate/` that
hand-rolls `process.exit(1)` for a ratchet breach is the violation — *not* its address. Two homes
sharing one contract is a split; two contracts is a fork.

**§2.1c — `check-collab-graph-integrity` is reclassified, not excused.** Under §2.1a it is an
**executed** gate (two real `y-websocket` clients against a live server) and therefore belongs in
the certification tree. It sits in `tools/ga-gate/` today. It remains a **recorded finding** (C70
§7.2), now with a named exit condition rather than an open-ended exception: **it moves to
`certification/gates/` in the same change that resolves its transport question**, which is a
founder decision (§5.1). Until then it is a *misplaced gate with a reason*, which is a materially
different thing from an unexplained one, and the residency rule is what makes it visible as such.

**§2.1d — DISCOVERY: two runners means two registration points, and until 2026-08-12 nothing could
see both.** A gate registered in neither runner is the §AUTHORED-BUT-UNWIRED failure this repo
keeps paying for — `check-verb-liveness.ts` was committed enforcing C16 §5.1 CA-21 and registered
nowhere for a day, and `run-all.ts` grew its unregistered-gate check because of it.

**Finding, stated because it was not anticipated by this document or by C70:** `run-all.ts`'s
unregistered-gate check reads **`readdirSync(__dir)` — `tools/ga-gate/` and nothing else** — so it
was structurally incapable of seeing the certification tree; and `certify.ts` has **no such check
at all**, only a hard-coded `gates` array. Between them they covered one of the two homes. A file
dropped into `certification/gates/` and registered in neither runner would have been invisible to
every instrument in the repository, *including the two that exist to detect exactly that*. Nothing
is unregistered today (all four files in `certification/gates/` are in `certify.ts`'s list) — the
hole was in the detector, not in the tree, which is the L-827 shape: the state nobody investigates
is the one they already expect.

**Closed the same day** by extending `run-all.ts` to read `certification/gates/` and require every
`check-*.ts` there to be registered in **one** of the two runners, parsing `certify.ts`'s list from
source rather than duplicating it (a hand-copied list rots) and **failing the parse loudly** rather
than letting an unparsed list read as "nothing registered there".

**§2.1e — where a NEW gate goes, in one line each.** Static scan → `tools/ga-gate/`, registered in
`run-all.ts`'s `GATES`. Executed against the world → `certification/gates/`, registered in
`certify.ts`'s `gates`. Either way: import `contract.ts`, declare floors, record the negative
control in the header (§2.2), and if it lands red on pre-existing defects, pin it in
`tools/ga-gate/gate-newly-measured.json` (§2.4) — **not** in `gate-debt.json`.

> **§2.4 — a gate that lands red on defects that PREDATE it is NEITHER a regression NOR declared
> debt** *(added 2026-08-12)*. §2.3 requires such gates to be built anyway; this says where the red
> is recorded. `tools/ga-gate/gate-debt.json` declares two states — *fails and is not listed* =
> **REGRESSION**, *is listed* = **DECLARED DEBT**, the latter gated by its rule 3 on an explicit
> founder decision. A newly-built gate is neither: nothing got worse (the instrument arrived), and
> nobody chose to ship the defect (it was never measured). Filing it as a regression trains readers
> to treat red as noise; filing it as debt backdates a decision nobody made.
>
> The third category is **`tools/ga-gate/gate-newly-measured.json`** — a **sibling file**, not a
> section of `gate-debt.json`, because the two carry different consent rules (rule 3 must stay
> attached to *choosing to ship a violation*, and must not leak onto *choosing to start
> measuring*), different shapes (a bare `string[]` versus per-entry pinned reading, exit condition
> and review date), and different meanings when they grow. Its semantics:
>
> - the reading is **pinned at the gate's first honest measurement**, in the gate's own named
>   ledger; the JSON entry points at that ledger and carries a human-readable copy. **If the two
>   disagree, the gate is right.**
> - it is a **ratchet**: exceeding the pin exits **3** from `contract.ts` and is caught by
>   `run-all.ts`'s §RATCHET-EXCEEDED-IS-NEVER-DEBT branch *before* this file is consulted. **This
>   file absorbs exit 1 only.** It does not re-implement the ratchet — a second comparator over the
>   same number is a second thing that can disagree.
> - every entry names an **exit condition** and a **`reviewBy` date**, both required at load or the
>   runner refuses the file. `run-all.ts` **fails when today > `reviewBy`**: an unenforced date is a
>   comment, and a category with no exit is how "temporary" becomes permanent.
> - an entry whose gate starts **passing** must leave the file, same discipline as `gate-debt.json`
>   rule 2.
>
> **Does adding here need a founder decision, as rule 3 requires for declared debt? No — with three
> hard edges,** and the answer is stated rather than left to inference. Requiring sign-off to turn
> an *instrument* on puts a human approval step in front of knowing something, and the predictable
> response is to not land the gate — which is what §2.3 forbids. The founder's authority is over
> what we **ship**, not over what we are allowed to **know**; an entry here asserts no tolerance,
> only that a number is written down and may now only fall. The edges: **(a)** an entry may only be
> added **in the commit that introduces its gate** — a later addition is not a first reading and
> goes through rule 3; **(b)** raising a pinned reading is forbidden outright, founder or not (R7:
> a measurement raised becomes a permission); **(c)** extending a `reviewBy`, or moving an entry
> into `gate-debt.json`, **requires the founder** — that is the moment "not fixed yet" becomes
> "chosen to live with", which is exactly what rule 3 exists to gate. (c) is the only join between
> the two files, deliberately.
>
> `run-all.ts` prints the states distinguishably — 🟡 KNOWN-DEBT · 🔵 NEWLY-MEASURED · ❌
> REGRESSION per gate, with exit 2 and exit 3 in their own summary columns — so "something broke"
> and "we started measuring something that was already broken" can never read the same.

> **§2.2 — the negative control is part of the gate, not part of the review.** Every arm is
> **watched failing against a deliberately planted violation before it is trusted**, and the
> failure text is recorded in the gate's own header (C74 §6.2, C75 §6.2, C70 §5.6). Until that
> record exists for an arm, **the arm is UNPROVEN and may not be cited as coverage** — even
> though the gate file exists and exits 0. `check-collab-graph-integrity` is the shape to copy:
> it re-runs its own checker over a deliberately broken pair **inside the run**, and reports
> `blind-comparator` → exit 2 if the checker calls the broken pair clean.

> **§2.3 — a gate that cannot be green today must still be BUILT.** Several gates below fail on
> the day they land — `check-solver-is-real` (planegcs is 0 hits across every `package.json`),
> `check-epsilon-policy` E1 (there is no declared tolerance module), `check-graph-write-coverage`
> (`joinedTo` is not yet a `RelationshipType` member and has no writer). That is the correct
> outcome. They land at **exit 1 against a named ledger pinned at the measured reading**, and the
> ledger shrinks. Deferring a gate until its subject is fixed is how a subject stays unfixed.

---

## §3 — The gates

Each entry states: **status · owning invariants · subject · floor · assertions · positive
control · negative control · ratchet · exit condition · what it cannot see.** Exit-code semantics
are §2 for every gate and are not restated.

Two definitions used throughout:

- **Positive control** — a fixture or a state the gate must call **clean**. It proves the gate is
  not stuck red, and it is what stops an over-eager matcher from being "safe".
- **Negative control** — a deliberately planted violation the gate must call **dirty**, with the
  failure text recorded in the gate header. It proves the gate can fail. **A comparator that has
  never failed has not been shown to be able to.**

---

### 3.1 · `check-identity-roundtrip` — ids and GUIDs survive save→reload

**Status: BUILT** — `tools/rac-conformance/certification/gates/check-identity-roundtrip.ts`
**Owning invariants:** C70 **B-INV-1**, **B-INV-2**; B-INV-3 partially (the GUID as IFC join key).

| | |
|---|---|
| **Subject** | the artefact `results/persistence.json`, written by `__tests__/persistence.cert.ts`, which seeds through **real** `@pryzm/command-registry` commands, serialises with the **real** `ProjectSerializer` and reloads with the **real** `ProjectLoader`. It reads an artefact rather than building a second round-trip **on purpose**: two oracles that disagree is the worst outcome available. What it owes instead is proof the artefact is real — hence the floors. |
| **Floor (exit 2)** | artefact exists ≥1 · rows ≥18 · kinds whose comparison actually RAN ≥10 · kinds holding ≥1 comparable record ≥10 · element ids compared ≥12 |
| **Assertions** | **ARM A — id survival**: every id present before save is present after reload, and no id appears that nobody created. A kind whose store was **not reached** is a named finding, never "clean". **ARM B — GUID stability**: no divergence whose path ends `.ifcData.guid` / `.guid`. The two arms are asserted separately because they fail for different reasons and one number for two defects is not a measurement. |
| **Positive control** | a seeded kind whose ids and GUIDs round-trip must report `✓ ARM A <kind>: all N id(s) survived` — with N printed, so a pass over zero records is visible on its face. |
| **Negative control** | tamper the artefact (or the loader) so one element returns under a fresh uuid: ARM A must name the kind, the lost id and the minted id. Re-mint one `ifcData.guid`: ARM B must name it. **F-2 is the standing live negative control** — `ImportProjectCommand.ts` builds `CreateStairCommand`/`CreateBeamCommand` with no id, so the element survives under a fresh uuid and **no record count notices**: the count is identical, only the id set moves. |
| **Ratchet** | **none. Hard-0, no baseline.** An element returning under a different id is not a tolerance question: every reference to it — railings, openings, room boundaries, selection, schedules, IFC joins — is already wrong. |
| **Exit condition** | hard-0 across every kind the harness covers, **including** the GUID join key. |
| **Cannot see** | kinds the harness cannot seed (they are reported unseeded, and the floor guards the count) · whether the GUID is *correct* for IFC, only that it is *stable* · identity under collaboration merge · identity across an IFC export→import cycle (that is B-INV-3's other half and is **UNPROVEN**). |

---

### 3.2 · `check-authoritative-state` — the mutation moved the store nobody can fake

**Status: SPECIFIED-NOT-BUILT**
**Owning invariants:** C70 **A-INV-1**, **A-INV-2**, **A-INV-3**, **L-INV-4**.

| | |
|---|---|
| **Subject** | every bus verb under certification, executed against the composed headless world (`certification/world.ts`), with the oracle being an **independent read-back** via `capture.ts`'s `kindReaders` — the same store instances `ProjectSerializer` reads. |
| **Floor (exit 2)** | verbs dispatched ≥ the register's LIVE row count for the certified families · kinds whose authoritative reader was **reached** ≥ 10 · records in the pre-mutation capture ≥ 12 · dispatch outcomes recorded for 100 % of attempted verbs (a verb that threw is `THREW: …`, never absent) |
| **Assertions** | **S1** every mutating verb changes the **authoritative** store on exactly the intended properties, proven by before→after capture diff. **S2** no verb's only observable effect is on a detached plugin-DTO record — *a mutation that changes a DTO nobody reads is a lie, not a capability* (A-INV-3). The harness's `storesProvider` hands out exactly production's detached record view, and **nothing in the harness may read a verdict from it**; a verb whose only diff is in `dtoStores` is a **finding**, not a pass. **S3** each element kind names **one** authoritative store, and the composition root can name it (A-INV-1); two stores answering for one kind is a finding. **S4** a refused verb leaves the store **unchanged** and the refusal names the rule and both numbers (L-INV-3) — a refusal that mutated anything is worse than a failure. |
| **Positive control** | `wall.updateDimensions` with `height: 4.2` on the seeded wall: the diff must be exactly `wall.<id>.height 3 → 4.2` and nothing else. A diff of **zero** paths for a verb declared mutating fails S1. |
| **Negative control** | point one verb's handler at a detached DTO clone. S2 must name the verb and report "authoritative store unchanged; DTO-only write". Separately, widen the expected-path set by one field and confirm the comparator reports the extra path rather than absorbing it. |
| **Ratchet** | named, shrink-only, per verb — the DTO-only write list is the debt this gate exists to shrink. |
| **Exit condition** | zero DTO-only writes, and every certified verb has an S1 read-back with a named expected path set. |
| **Cannot see** | verbs the world cannot register (recorded in `registrationFailures`, and the floor guards the count) · geometry meshes (no fragment builders are registered in the harness — the Geometry link stays UNPROVEN by construction and is **said so in every row**) · whether the *intended* property set is the right one; the gate checks that the diff matches the declaration, not that the declaration is correct. |

---

### 3.3 · `check-topology-persistence` — junctions are retained, not re-detected

**Status: SPECIFIED-NOT-BUILT**
**Owning invariants:** C70 **C-INV-2**; C71 §3 (`joinedTo`), §3.4, §3.5, §3.6.

| | |
|---|---|
| **Subject** | the retained junction index (`WallJoinResolver` / `WallJunctionRecord` machinery, ADR-0055) and the `joinedTo` edge family in **SemanticGraph** — named explicitly, because C71 §4.3 forbids reading a UBG or `RoomGraphService` type name as SemanticGraph coverage, and a grep that conflated them **has already produced one false capability claim here**. |
| **Floor (exit 2)** | junction records read > 0 · walls seeded ≥ the canonical world's declared wall count · `joinedTo` edges compared > 0, **printed**. A run over a wall set with no junctions would report "0 stale junctions" and mean nothing. |
| **Assertions** | **T1** a wall-connectivity query is answered from the **retained index**, not by re-running the resolver — asserted by instrumenting the resolver and requiring **0 resolver invocations** during N queries. **T2** the stored identity is the participant wall-id pair plus junction type; `WallJunctionRecord.id` is **never** a stored key (C71 §3.5 — it is a within-solve handle and renumbers when walls move). **T3** edges carry `metadata: { junctionType: 'L'\|'T'\|'Y'\|'X'\|'N-WAY', junctionDegree }`. **T4** save→reload→rebuild reproduces the junction set exactly (`joinedTo` is REGENERATED, C71 §3.6 — so it must be *reproduced*, not persisted). **T5** at flush, edges for a level are **removed and re-emitted**; a wall that stops joining must not keep a stale edge (C71 §3.4 — `addRelationship` idempotency prevents duplicates, never staleness). |
| **Positive control** | the canonical world's L-junction corners: N corners in → N `joinedTo` pairs out, both directions, with `junctionType: 'L'`, and the count printed. |
| **Negative control** | move one wall so a junction dissolves, flush, and require the stale edge to be **gone**; assert the gate reports it when it is not. Second control: rename/renumber `WallJunctionRecord.id` between solves and require T2 to survive (if the gate goes red, it is keying on the handle). |
| **Ratchet** | none once landed — this is a hard invariant. Until `joinedTo` lands, the gate exits **2** (`joinedTo` is not a `RelationshipType` member) or **1** against a single named entry `joinedTo:unlanded`, and **C-INV-2 is UNPROVEN** and no document may say otherwise (C71 §3.7). |
| **Exit condition** | T1–T5 hard-0 with `joinedTo` landed under C71 §2.6's four elements. |
| **Cannot see** | whether the junction *classification* is correct (an L reported as a T passes every arm) · junction behaviour under collaborative merge · junctions produced by geometry the harness cannot seed. |

---

### 3.4 · `check-topology-invalidation` — semantic 5, the one nobody has measured

**Status: SPECIFIED-NOT-BUILT**
**Owning invariants:** C70 **C-INV-3**; C71 §1.2 semantic 5, §1.4, §6.2(c).

| | |
|---|---|
| **Subject** | every REQUIRED relationship family (C71 §2.1, the nine), put through **move · resize · regenerate · save-load · undo**, with the edge set captured before and after each. |
| **Floor (exit 2)** | families exercised ≥ the REQUIRED count the ledger names · mutations executed > 0 per family · edges compared per family, **printed per family** — a family with 0 edges is reported `MISCONFIGURED for this family`, never `preserved`. |
| **Assertions** | **I1** no surviving topological entity is **re-identified** by any of the five operations (C-INV-3) — a junction, a room boundary or a hosting edge that survives the operation keeps its semantic identity. **I2** an edge whose endpoints moved is **preserved, updated, or removed-and-re-emitted** — and which of the three is **declared per family in the ledger**, not discovered. **I3** `boundedBy` after a room-boundary change is asserted explicitly and separately; C71 §1.4 names it as the row most likely to be wrong. **I4** an edge that should have been removed is not left stale (the C71 §3.4 rule, generalised beyond walls). |
| **Positive control** | move a wall 100 mm along its own axis such that no junction topology changes: **every** edge must be preserved with identical identity, and the compared count printed. A gate that cannot call a no-op move clean is a gate that will be disabled. |
| **Negative control** | move a wall so one room's boundary genuinely changes; require the `boundedBy` delta to be reported. Then plant a writer that deletes-and-recreates an unaffected edge with a new id and require I1 to catch the re-identification. |
| **Ratchet** | named, shrink-only, **per family × per operation** (9 × 5 = 45 cells). A repo-wide percentage is forbidden — it lets one family's regression hide behind another's fix (C69 §7.c, C75 §3.1). |
| **Exit condition** | all 45 cells declared and measured, with the **move** column at 0 findings. It is 45/45 UNPROVEN today (C71 §1.4). |
| **Cannot see** | correctness of the resulting topology, only its stability and its declared disposition · invalidation triggered by paths the canonical world does not exercise · anything about PARKED families, which are **excluded by design** — parked is not a gap (C71 §2.3). |

---

### 3.5 · `check-graph-write-coverage` — the vocabulary is scoped, and shrinking

**Status: SPECIFIED-NOT-BUILT** · **specified verbatim by C71 §6**
**Owning invariants:** C70 **C-INV-1**, **C-INV-4**; C71 §1.2, §1.3, §2.5, §2.6.

| | |
|---|---|
| **Subject** | `RelationshipType` members read from `SemanticGraph.ts`, cross-referenced against writer and **typed-reader** call sites across `packages`, `apps`, `plugins` — excluding tests and excluding `SemanticGraph.ts` itself. **SemanticGraph only** (C71 §6.1). |
| **Floor (exit 2)** | declared types parsed from source > 0 **and** ≥ the count of families the ledger names · call sites resolved > 0. A run that parsed no union, or resolved no call sites, is MISCONFIGURED — *not* "full coverage". |
| **Assertions** | **(a)** every **REQUIRED** family (the nine) has ≥1 production writer **AND** ≥1 **typed** reader. **(b)** no family has a writer without a reader — a **writer-first addition exits 3** (C71 §2.5). **(c)** every member added since the last run carries all four elements of C71 §2.6 (writer · typed reader · rebuild disposition · delete behaviour + what undo restores). **(d)** PARKED members are **not counted in either direction**. |
| **Untyped enumeration is not a reader** | code walking *every* relationship — `getAll`, an untyped `getRelationships` sweep, a panel rendering whatever it is handed — proves that *something enumerates every edge*; it never proves a **family** is consumed (C71 §1.3). This under-count is **deliberate** and is stated in the gate header so it is never read as an oversight. |
| **Positive control** | `hosts`/`hostedBy` — the reference-shape pair, with occupancy gating, the query engine, opening lifecycle, cascade delete and IFC export as typed readers — must report writer+reader present. |
| **Negative control** | add a throwaway `RelationshipType` member with a writer and no reader: the gate must exit **3** naming it. Then delete the writer and confirm the member reports as declared-only rather than disappearing. |
| **Ratchet** | named, shrink-only, checked in **both directions**: a family reaching writer+reader **leaves the ledger in the same commit**. |
| **Exit condition** | the ratchet over the REQUIRED nine reaches **0**, at which point the gate becomes hard-0 and leaves the debt ledger. |
| **Cannot see** | **runtime reachability** — discovery is static, so a writer that exists but is never reached counts as present (C71 §5.8, §6.2a) · **correctness** — a writer emitting the *wrong* edge passes every arm · **move-time invalidation** (that is §3.4's job) · dynamic dispatch. |
| **Cannot be green until implementation lands** | `joinedTo` **is not a `RelationshipType` member and has no writer** (C71 §3.7); `contains` **has no first-party writer at all** — it is reachable only through the IFC import type union, so two production readers ask a question always answered "nothing" and cannot distinguish that from "this room contains nothing" (C71 §5.2); `CreateWallCommand` writes **zero** graph edges (C71 §5.5). |

---

### 3.6 · `check-graph-delete-integrity` — no kind strands its edges

**Status: SPECIFIED-NOT-BUILT** · **specified verbatim by C71 §6**
**Owning invariants:** C70 **F-INV-2**; C71 §1.2 semantic 6, §5.6.

| | |
|---|---|
| **Subject** | every element kind's delete path, and the undo of each. |
| **Floor (exit 2)** | delete paths discovered ≥ the number of kinds the element registry declares. Discovering fewer means the walk missed kinds, and **a purge report over a subset is not a purge report**. |
| **Assertions** | **(a)** each kind's delete purges **all** relationships for the deleted element — no kind is the exception the wall family used to be. **(b)** undo **restores the purged edges verbatim** — `3ee632f6` ("deleting a wall no longer strands its edges — and undo restores them verbatim, because reconstruction is impossible") is the reference shape. **(c)** a delete never returns an **empty cascade by design** (C70 F-INV-2, C72 §2.3: deletion has the largest dependent fan-out of any operation; computing nothing for it is not a conservative default, it is a silent one). **(d)** no comment asserts that *another* mechanism performs the purge — the two-mechanisms-each-assuming-the-other defect is itself a finding. |
| **Positive control** | delete a wall carrying `hosts` + `boundedBy` + `joinedTo` edges: purge count printed, undo restores the same edge ids and metadata byte-identically. |
| **Negative control** | disable the purge for one kind and require the gate to name that kind's stranded edges. Then make undo *reconstruct* rather than restore (fresh edge ids) and require arm (b) to fail — restore-verbatim and reconstruct are different behaviours and the gate must distinguish them. |
| **Ratchet** | none intended; if the initial reading is non-zero, pin a **named** per-kind ledger at the measured reading. |
| **Exit condition** | hard-0 across every kind, with the undo half proven by **executed read-back** rather than by the presence of a restore call. |
| **Cannot see** | deletes initiated by paths the harness does not drive · cascade *correctness* beyond non-emptiness · collaborative delete/merge interaction. |

---

### 3.7 · `check-graph-persistence` — persist-or-lose is named, never discovered

**Status: SPECIFIED-NOT-BUILT** · **specified verbatim by C71 §6**
**Owning invariants:** C70 **I-INV-2**, **I-INV-3**; C71 §5.3, §5.4, §5.7.

| | |
|---|---|
| **Subject** | the serialized `ProjectSnapshot` graph slice, and `_rebuildSemanticGraph` — **all copies of it**. |
| **Floor (exit 2)** | snapshot edge records compared > 0 **and** rebuild copies located ≥ 1. A comparator reporting "0 divergences" must report **how many edges it compared**. |
| **Assertions** | **(a)** every declared type is classified **regenerated** or **persist-only**, with **no third state**. **(b)** the persist-only set equals a **named, shrink-only ledger**; an unlisted persist-or-lose family is the surprise I-INV-2 forbids, and a ledger entry no longer measured is **stale → exit 3**. **(c)** loading a snapshot lacking a persist-only family **reports the named loss** rather than loading silently (I-INV-3). **(d)** the rebuild function exists in **exactly one** place — the two byte-identical copies at `packages/persistence-client/src/loader/ProjectLoader.ts` and `apps/editor/src/engine/persistence/ProjectLoader.ts` are a finding, because a rebuild widened in one copy and not the other is a divergence no test would see. **(e)** malformed edges dropped on deserialize are **counted and reported**, not silently discarded — *a defect that self-erases on reload is a defect nobody can reproduce* (C71 §5.7). |
| **Positive control** | a snapshot round-trip in which every regenerated family is reproduced: the gate prints the per-family compared counts and calls it clean. |
| **Negative control** | strip `sitsOn` from a snapshot and load it: arm (c) must report the **named** loss. Plant a malformed edge (missing `targetId`) and require arm (e) to count it. Widen one copy of `_rebuildSemanticGraph` and require arm (d) to report the divergence. |
| **Ratchet** | the persist-or-lose ledger, named and shrink-only. Today's measured members: `sitsOn`, `supports`, `connectedTo`, `connectedByStair`, `connectedByLift` — **prose in EV-05 §3 with NO gate**, which is exactly the state I-INV-2 forbids. |
| **Exit condition** | the ledger is **empty**, or every remaining member is a **founder-signed exception with a named reason** (C70 §6.6). |
| **Cannot see** | whether a regenerated family is regenerated *correctly* · rebuild behaviour on snapshots older than the ones tested · that the rebuild fires only when the graph is empty (a behaviour, not a shape — assert it separately or leave it **UNPROVEN by name**). |

---

### 3.8 · `check-derived-regenerable` — the persist-or-lose ledger for **fields**

**Status: BUILT** — `tools/rac-conformance/certification/gates/check-derived-regenerable.ts`
**Owning invariants:** C70 **I-INV-1**, **I-INV-2**, **I-INV-3**; C73 §1.3, §1.4.

| | |
|---|---|
| **Subject** | `results/regenerable.json` from `__tests__/regenerable.cert.ts`, plus the named ledger `gates/derived-ledger.json`. |
| **Floor (exit 2)** | artefact exists · ledger exists · records in capture A1 ≥12 · kinds captured ≥10 · **round trips that completed without throwing = 2 of 2** · kinds SEEDED ≥14 |
| **Assertions** | the **three-state** measurement, because two states cannot distinguish the cases: serialize (A1) → restore (A2) → serialize-and-restore again (A3). *differs A1→A2, identical A2→A3* = **REGENERABLE** (the restore reaches a fixed point). *differs A1→A2 **and** A2→A3* = **PERSIST-OR-LOSE** (every cycle mints a new value and destroys the authored one). The gate grades the second list only: an unlisted persist-or-lose field is a **finding**; a listed field no longer measured is **stale → 3**. |
| **Positive control** | a field that reaches a fixed point at A3 must land in REGENERABLE and consume no ledger slot. |
| **Negative control** | the **round-trip-threw floor is itself the control**: a throw leaves A2 ≡ A1, which would classify everything as regenerable — *the most comfortable possible answer, and a false one*. Force a serialise error and confirm exit 2, not exit 0. |
| **Ratchet** | `derived-ledger.json`, named, shrink-only, stale → 3. Findings hard-0 (the ledger absorbs the **known** set; it never absorbs a **new** member appearing). |
| **Exit condition** | the ledger is empty or founder-signed. |
| **Cannot see** | **REGENERABLE is not "blessed"** — it means only "a rebuild reproduces it". A field deterministically recomputed to a value the author never wrote is still a round-trip divergence, and its documented-tolerance list stays **empty** (C73 §1.4). Also blind to: determinism across processes/machines (that is §3.17), and fields on kinds the seed cannot compose. |

---

### 3.9 · `check-propagation-reaches` — both arms, or it is theatre

**Status: BUILT** — `tools/rac-conformance/certification/gates/check-propagation-reaches.ts`
**Owning invariants:** C70 **F-INV-1**, **F-INV-2**; C72 §1.1, §1.3, §2.1, §6.1.

| | |
|---|---|
| **Subject** | the four declared cascade events in `gates/cascade-events.json`, swept against all production `.ts`/`.tsx` sources, plus the typed event catalog. |
| **Floor (exit 2)** | ledger present · events declared ≥1 · **production files scanned ≥1500** · **typed catalog entries readable ≥200** · every ledger-named path exists on disk · every named trigger type is readable · every event has a catalog entry. A sweep of an empty tree would report "no listener anywhere" for every event and look like a **maximal finding** — the floor makes that a misconfiguration, not a pass. |
| **Assertions** | **ARM A** ≥1 production listener per declared event (not the catalog declaration, not the emitter, not a test). **ARM B1** the emitter's trigger-source type declares a pre-mutation field — the emitter *could* forward one. **ARM B2** the event's typed catalog entry declares one — the emitter *does*, and a listener may rely on it. *B1 without B2 is a source that holds the data and drops it; B2 without B1 is a contract promising data nobody holds.* **Only both is propagation.** |
| **Positive control** | any event with a real listener must print `✓ ARM A <name>: N listener(s)` naming files. The detector is **deliberately generous** — `addEventListener`, `.on(`, `.once(`, `.subscribe(`, `events.on(`, `runtime.events.on(` — because a false negative would report a defect that is not there, and the gate's whole authority is that its findings are real (C72 §1.3). |
| **Negative control** | delete a known listener and confirm ARM A names the event; strip the pre-mutation field from a trigger type and confirm ARM B1 flips. |
| **Ratchet** | `cascade-events.json.declaredFindings`, named, shrink-only, stale → 3. |
| **Exit condition** | `declaredFindings` reaches **0** — every event either **WIRED** (both arms) or **DELETED** (dispatch site, catalog entry and ledger row removed in one commit). No third state may persist (C72 §2.1). |
| **Cannot see** | a listener registered from a runtime-built string · whether a listener that exists *does anything correct* — arm A is presence, not behaviour · whether a `prevState`-carrying emitter carries the *right* snapshot · **the bespoke trackers**, which are the propagation that actually works and are **ungated today — UNPROVEN** (C72 §6.1.2d). |
| **Why static, not runtime** | "a listener exists" is a claim about the whole estate, and no headless world composes the whole estate — the certification world registers 9 plugin bridges out of 48 plugins. A runtime probe answers "no listener in *this* world", a strictly weaker sentence (C72 §6.1.1). |

---

### 3.10 · `check-prevstate-contract` — the seam, not the classifier

**Status: SPECIFIED-NOT-BUILT** · **specified by C72 §6.2**
**Owning invariants:** C70 **F-INV-1**; C72 §3.1–§3.5.

| | |
|---|---|
| **Subject** | every store whose subscribers make **diff-based** decisions, and every change-notification type such a subscriber consumes. |
| **Floor (exit 2)** | `*Store.ts` files read ≥ a declared floor **and** ≥1 diff consumer discovered. |
| **Assertions** | **P0** floors. **P1** *(ratchet, named)* every store on the declared diff-consumer list emits the third argument on **every** `update` emit site — not merely declares the parameter in its listener type. **P2** *(hard)* no classifier ships whose `no-prevState` branch is its **only reachable** branch. **P3** *(ratchet, named)* a propagation test exists per pair that drives the **real mutation entry point**; hand-built-fixture tests do not satisfy it. |
| **Positive control** | `packages/geometry-wall/__tests__/WallOpeningEmitSeam.test.ts` is the **shape to copy** and must satisfy P3 for its pair; `WallStore.ts:1279` and `:1363` (both call sites now pass the pre-mutation wall) must satisfy P1 for that store. |
| **Negative control** | remove the third argument from one emit site: P1 must name the store **and the site**, not just the store. Revert `WallStore.ts:1279` and require P2 to report the `no-prevState`-only classifier. **The standing lesson is the control's whole point**: every classifier test passed throughout the defect because each built `prevState` by hand — *a propagation test whose fixture supplies the very value under test proves nothing* (C72 §3.4). |
| **Also forbidden, and worth an arm** | `prevState` reconstructed by the consumer re-reading the store: after the mutation the store holds the **new** value, so a re-read diffs a value against itself and classifies "unchanged" — **a false clean** (C72 §3.5). |
| **Ratchet** | P1 and P3 named, pinned **at the measured reading, never above it** — a ratchet above its own reading is not a ratchet, it is free slots (C73 §3.4, and `check-offset-implementations.ts`'s own recorded correction). |
| **Exit condition** | P1 and P3 reach 0 named entries **and** `StoreChangeEvent` (or its successor) carries a pre-mutation field, closing C72 §3.2's standing finding. |
| **Cannot see** | whether the forwarded snapshot is the *right* one · consumers reached by dynamic dispatch · bespoke propagation pairs outside the declared list. |

---

### 3.11 · `check-suppression-is-reversible` — a release nothing calls is not a release

**Status: SPECIFIED-NOT-BUILT** · **specified by C72 §6.3**
**Owning invariants:** C70 **F-INV-1** (a suppressed channel does not propagate); C72 §4.1–§4.4.

| | |
|---|---|
| **Subject** | every suppression flag, pause/resume pair and authority marker in production code. |
| **Floor (exit 2)** | ≥1 suppression site discovered. A scan finding none is **misconfigured, not clean** — and this is the single most likely failure of this gate, because suppression sites do not share a naming convention. |
| **Assertions** | **S1** *(hard)* every marker with ≥1 production **setter** has a **release with ≥1 production caller**. **S2** *(hard)* every `pause()`…`resume()` pair spanning a fallible call is inside `try { … } finally { resume() }`. **S3** *(ratchet, named)* every flag declares its **scope** — level, batch, load window — and a flag with no declared scope is a finding; a lifetime bounded by process lifetime instead of by scope is the defect. |
| **Positive control (which is really the negative one)** | `RoomTopologyObserver._graphAuthoritativeLevels`: marked from four production sites; its public release `clearGraphAuthoritative` has **1 definition, 0 production callers, 1 test caller**. The only release that actually runs is a narrow inline branch — a manual add/remove of a wall on that level, *outside* a batch. An update, a batched mutation, or a level the user never structurally edits **stays frozen for the session**, so every generated level keeps its rooms suppressed by default. **S1 must be red on this the day it lands.** |
| **Negative control** | `apps/editor/src/engine/initPersistence.ts:362` pauses `roomTopologyObserver` and `syncStateEngine` and resumes at `:372` **with no `finally`** — S2 must name it. Then wrap it correctly and confirm S2 goes green, proving the arm is not stuck red. |
| **Ratchet** | S3 named; S1/S2 hard from day one against the two known sites, which means the gate lands at exit 1 with a two-entry ledger and shrinks to hard-0. |
| **Exit condition** | S1 and S2 hard-0 with **no exemptions**, S3's unscoped list empty. |
| **Cannot see** | a suppression implemented as a boolean nobody named `suppress`/`pause` — a static scan cannot enumerate an unnamed concept, and this limit must be in the header · whether a release *runs* at runtime (S1 proves a caller exists, not that it is reached — the §AUTHORED-BUT-UNWIRED distinction) · suppression by early-return inside a listener. |

---

### 3.12 · `check-constraint-honesty` — no adapter reports a solve it did not perform

**Status: SPECIFIED-NOT-BUILT** · **specified by C74 §6**
**Owning invariants:** C70 **G-INV-1**, **G-INV-2**; C74 §3.1, §3.2, §3.4, §3.5, §3.6.

| | |
|---|---|
| **Subject** | every `SolverPorter` (or comparable adapter) implementation, its declared `kind`, its span attributes, its return shape, and the constraint families with declared strengths. |
| **Floor (exit 2)** | adapters discovered > 0 · constraint families read from the classification register > 0. |
| **Assertions** | **H1** *(hard)* a class whose every public method delegates to a type named `Mock*`/`Stub*`/`Fake*` may **not** declare a non-mock `kind`. **H2** *(hard)* every stand-in emits a **non-suppressible first-call production signal** — a distinguished result field, a span attribute, or a one-time warning. *"It is documented in the file header" is not detection*; C74 §0 shows a header that has been accurate and ignored for months. **H3** *(hard)* every constraint family carries a declared strength — VALIDATION · ENFORCEMENT · ADVISORY · SOLVING — with executable evidence **at that strength**; "solver-driven" without a solver is a contract violation. **H4** *(finding)* a suite substituting a double for its production subject **states which production configuration is thereby not covered** — `PlanegcsAdapter.test.ts` covers injected-`underlying` delegation and **not** the `??` fallback every production construction takes. **H5** *(finding)* the same authority existing in two copies where production imports one and the tests may bind the other — `StairValidationAuthority` exists in `packages/geometry-stair` (imported by production) and `packages/constraint-solver` (**zero production importers**). |
| **Positive control** | `WallOccupancyStore.canPlace()` — a real ENFORCEMENT refusal on a real mutation path, called at opening commit from three production sites — must pass H3 at strength ENFORCEMENT with its refusal executed. |
| **Negative control** | flip a mock's `kind` back to `'planegcs'` (its state today) and require H1 red with the delegation chain printed. Suppress the first-call signal and require H2 red. |
| **Ratchet** | none for H1/H2/H3 — hard. H4/H5 named, shrink-only. |
| **Exit condition** | `PlanegcsAdapter` either performs a real solve or reports a `kind` that matches what it performs — **and that change lands in its own commit, before any binding work** (C74 §4.3: if truthfulness and capability land together, the adapter starts telling the truth in the same commit that makes the truth flattering, and *the organisation learns nothing about the fact that a mock shipped for months behind passing tests*). |
| **Cannot see** | **runtime substitution** — a double injected through DI is invisible to a source scan · **semantic correctness** — an honest solver computing the wrong answer passes every arm, because C74 governs *identity*, not *accuracy* · whether a family **truly needs** SOLVING, which is a written judgement, not a machine-checkable property · advisory rule *content*, only its wiring. |
| **Standing note** | **Test count may never be cited as evidence of subject health.** "31 of 33 passing" is a statement about a mock (C74 §3.6). |

---

### 3.13 · `check-solver-is-real` — the cheapest check in the suite

**Status: BUILT** *(2026-08-12)* — `tools/ga-gate/check-solver-is-real.ts` · static manifest+source scan, so `tools/ga-gate/` is its correct home under §2.1a · imports the one `contract.ts` · lands **exit 1** against a 4-entry named `LEDGER`, pinned in `gate-newly-measured.json` (§2.4)
**Owning invariants:** C70 **G-INV-1**, **L-INV-1**; C74 §3.3, §3.7.

| | |
|---|---|
| **Subject** | every adapter naming an external engine, cross-referenced against **every `package.json` in the repo**; and every solver-selecting function's return values. |
| **Floor (exit 2)** | `package.json` manifests read ≥ the workspace count (~97 + apps + plugins) · adapters naming an external engine discovered > 0. |
| **Assertions** | **R1** *(hard)* an adapter naming an external engine requires that engine to be a **declared dependency of some workspace**. **R2** *(hard)* no selector returns the **same value** for "not configured" and "configured but failed" — `loadSolver()` today returns `MockSolver` when a WASM URL is *absent* and, separately, when one is *present but unbindable*, and the two are **indistinguishable to the caller**. Failure and emptiness are never the same value; the second is a **failure**, not a default. **R3** *(hard)* dead capability is deleted or declared — `createWorkerHandler` has zero production callers, and unreachable machinery that looks reachable is the §AUTHORED-BUT-UNWIRED failure: an audit of *existence* passes, an audit of *reachability* fails. |
| **Positive control** | any adapter whose engine **is** a declared dependency must pass R1 with the manifest path printed. |
| **Negative control** | R1 is **red on the day it lands**: `planegcs` has **0 hits** across every `package.json` in the repo, which settles the question without reading a line of adapter code. That is the recorded negative-control text. |
| **Ratchet** | none — hard, with the known failures named in a two-entry ledger until fixed. |
| **Exit condition** | `loadSolver()` distinguishes not-configured from configured-and-failed; every named engine is a declared dependency or the adapter stops naming it; `createWorkerHandler` is wired or deleted. |
| **Cannot see** | whether a declared dependency is actually *loaded* at runtime — presence in a manifest is necessary, never sufficient · a engine bound through a URL resolved at runtime. |

---

### 3.14 · `check-no-hidden-mock` — generalised beyond solvers

**Status: SPECIFIED-NOT-BUILT** · **specified by C74 §6**
**Owning invariants:** C70 **G-INV-1**, and RULE 1(4) of §1.1 above.

| | |
|---|---|
| **Subject** | every test double, stub, fake, scaffold or not-yet-implemented adapter standing in for a **production** subject, anywhere in the estate. |
| **Floor (exit 2)** | source files scanned ≥ a declared floor (use `gates/scan.ts` or `tools/ga-gate/lib/sourceScan.ts` — both carry a required `minFiles`). |
| **Assertions** | **M1** every stand-in is **detectable from outside the module that defines it** — through its declared identity and a first-call signal — without reading its source. **M2** every scaffold carries **an owner, a date, and a gate**: (a) the milestone that retires it, (b) an assertion that fails when that milestone passes without the retirement. *A scaffold whose retirement date is untracked is permanent architecture that nobody chose* — the `PlanegcsAdapter` (S52 D2) / `engine.ts` (S53 D1) disagreement is what a scaffold with neither looks like. |
| **Positive control** | a stand-in that already announces itself must be reported present-and-declared, not counted as a finding. |
| **Negative control** | plant a `FakeXStore` wired into a production import path with no external signal; require it named. |
| **Ratchet** | a **named, shrink-only list checked in both directions** — a bare count would let one hidden mock be fixed while another is introduced (C69 §7.c). |
| **Exit condition** | the named baseline reaches **0**, at which point the gate leaves `tools/ga-gate/gate-debt.json` and flips to hard-0. |
| **Cannot see** | runtime DI substitution · a stand-in named nothing like a stand-in — which is why M1 requires an **outward signal** rather than a naming convention: the naming convention is what the scan can find, the signal is what makes the scan unnecessary. |

---

### 3.15 · `check-epsilon-policy` — one declared tolerance module, unit-qualified

**Status: BUILT** *(2026-08-12)* — `tools/ga-gate/check-epsilon-policy.ts` · static scan, correct home under §2.1a · imports the one `contract.ts` · lands **exit 1** (E1 red, E2 271, E5 113) against `epsilon-policy-baseline.json`, pinned in `gate-newly-measured.json` (§2.4)
**Owning invariants:** C70 **E-INV-2**; C73 §2.1–§2.5.

| | |
|---|---|
| **Subject** | tolerance declarations and tolerance literals across `packages`, `plugins`, `apps`, `src`; and the declared tolerance module in `packages/geometry-kernel`. |
| **Floor (exit 2)** | source files scanned ≥ a declared floor **and** ≥1 tolerance declaration found. A scan finding none is misconfigured, not clean. |
| **Assertions** | **E1** *(hard)* the declared tolerance module exists and is exported from `packages/geometry-kernel`, naming at minimum a **numeric-zero** epsilon (dimensionless), a **model-space coincidence** tolerance (metres), and a **model-space parallelism/collinearity** tolerance (radians or normalised dot). **E2** *(ratchet, named)* tolerance literals declared **outside** the module, pinned at the measured reading (**267** at C73's stamp), shrink-only, listed by file. **E3** *(hard)* a new or modified geometric predicate imports the declared tolerance. **E4** *(hard)* a declared tolerance's **value may only shrink or stay** — a widening is a contract violation and must be an explicit, argued change to the module. **E5** *(ratchet, named)* unit-unqualified tolerance names: `EPS = 0.05` is unreadable (5 cm, or 5 % of something?); `COINCIDENT_M = 0.05` cannot be misread, and `defaultJunctionBandM` is the naming precedent. |
| **Not epsilons** | domain bands — `defaultJunctionBandM`, `CENTROID_MATCH_RADIUS` — stay where they are under their own domain owner and are **excluded by name with the reason**, per C73 §3.3's exclusion discipline. |
| **Positive control** | a predicate importing `COINCIDENT_M` from the declared module must consume no ledger slot. |
| **Negative control** | widen a declared tolerance by one order of magnitude and require E4 red **naming the old and new values** — E4 is the arm that matters, because widening a tolerance changes what "the same place" means for every consumer and the change is invisible at the site that made it. |
| **Ratchet** | E2 and E5 named and shrink-only, pinned at the reading. **Never raise.** |
| **Exit condition** | E2 reaches **0** literals outside the module and E5's unqualified list is empty. |
| **Cannot see** | **tolerance appropriateness** — E4 can see a widening, not whether 0.05 m was ever the right coincidence radius for walls · tolerances computed at runtime · GPU-side comparisons. |
| **Cannot be green until implementation lands** | there is **no declared tolerance module today**; E1 is red on day one. |

---

### 3.16 · `check-predicate-canonical` — the R3 counting recipe, one family per PR

**Status: SPECIFIED-NOT-BUILT** · **specified by C73 §5.2**
**Owning invariants:** C70 **E-INV-2**; C73 §3.1–§3.7.

| | |
|---|---|
| **Subject** | one arm per predicate family: **point-in-polygon** (61 bodies measured), **segment/segment intersection**, **polygon area & winding**, **point-to-segment distance**, **polygon containment/overlap**. **Polygon offset is done and is the reference implementation of the recipe** — `tools/ga-gate/check-offset-implementations.ts`. |
| **Floor (exit 2)** | `minFiles` per arm (the offset gate uses 500 across four trees, "far below the real count and far above anything a broken root resolution would reach"). **The gate can never pass by looking nowhere.** |
| **Assertions** | **C0** floors. **C1** *(ratchet, named, per family)* non-canonical implementation count, pinned at the measured reading, shrink-only. **C2** *(hard)* each family names its canonical file **and its exclusions individually with reasons**. **C3** *(hard)* within a single file, a family may not appear twice with **differing degenerate-divide guards** — `\|\| 1e-12`, `\|\| 1e-9` and *no guard* in one file are three different geometries of the same polygon. |
| **The counting unit** | **(file × signature)**, not lines and not files. Not lines: one algorithm spans several arithmetic lines, so a line count moves when someone reformats. Not files: the pre-fix `geometry-kernel/.../roof/polygon.ts` held **two** independent algorithms — `applyOverhang` (centroid dilation) and `shrinkPolygon` (edge-shift) — and calling that "one implementation" because they shared a file would understate exactly the divergence being measured. |
| **Structure, never names** | a name-based count counts call sites and re-exports and is **trivially defeated by renaming**. Each signature must be a line of **arithmetic** that only an implementation can contain — the offset gate's `edge-shift-miter` matches the Cramer determinant of two shifted supporting lines; `centroid-radial-dilation` matches a vertex displaced along its own centroid ray, *a SCALE sold as an offset*, the exact shape of the defect that shipped. |
| **Positive control** | the canonical module itself, excluded by name, must not be counted; a pure re-export must not be counted. `packages/geometry-roof/src/pure/polygonOffset.ts` is a re-export with no arithmetic in it and reads 0. |
| **Negative control** | **already recorded and reusable**: scan the pre-fix tree (`git show HEAD~n:` of the three files) with the same signatures and exclusions — it reads **4**, and the prose in the original ticket said 3. The prose counted *clones of the then-canonical module* and silently excluded a file the predicate does count: **off-by-one in the direction of leniency, which is exactly the drift the gate exists to stop.** |
| **Ratchet** | per-family, named, pinned **at the reading, never above it**. |
| **Exit condition** | every family reads **0** non-canonical implementations, each with an **oracle fixture at a known answer** — the state polygon offset is in today (300 mm eave, spread 0.000). |
| **Cannot see** | **correctness of the survivor** — counting gates are deliberately blind to correctness, which is why each family also needs its oracle fixture · a copy written in a structurally novel way the signature does not match (a deliberate under-count, stated in the header). |
| **Process rule that belongs in the gate header** | **one family per PR.** The offset fix succeeded because it was one family, oracle-tested, with the shipping path identified *first*. A sweep replacing sixty-one ray casts in one change has no oracle and no bisect. And **before a family is collapsed, the shipping consumer is identified by name** — the offset defect was not "three copies", it was that *the fix and the shipping code were different files*, and each copy passed its own package's tests. |

---

### 3.17 · `check-deterministic-regeneration` — same model in, same geometry out

**Status: SPECIFIED-NOT-BUILT** · **specified by C73 §5.3**
**Owning invariants:** C70 **E-INV-1**, **I-INV-1**; C73 §1.1, §1.2.

| | |
|---|---|
| **Subject** | regeneration of derived geometry from authoritative model state, in-process, over the canonical world. Extends `check-derived-regenerable` from *round-trip* to *regeneration*. |
| **Floor (exit 2)** | element kinds regenerated ≥1 (and in practice ≥ the canonical world's kind count) · **objects compared, printed**. An empty subject is misconfiguration. |
| **Assertions** | **D0** floors. **D1** *(hard)* regenerating the same authoritative model **twice in the same process** yields byte-identical geometry. **D2** *(hard)* regenerating after **shuffling model iteration order** yields byte-identical geometry — this is the arm that catches unstable sort, hash-container iteration dependence, and float-accumulation order. **D3** *(ratchet, named)* the PERSIST-OR-LOSE ledger, shrink-only, stale entry exits **3**. |
| **Forbidden inputs, each worth its own detector** | wall-clock time · `Math.random` without a model-derived seed · unstable sort (ties must break on a **stable model key**, not insertion order) · float accumulation order varying with container iteration · **any renderer or viewport state** — *a value the renderer knows and the model does not is not an input to geometry.* |
| **Positive control** | a wall regenerated twice must produce byte-identical vertex arrays, with the vertex count printed. |
| **Negative control** | seed a producer with `Date.now()` (or reverse the element iteration order) and require D1/D2 red **naming the first divergent path**. The F-3-class per-reload drift (a 15 mm shift) is the historical instance. |
| **Ratchet** | D3 only; D1/D2 hard. |
| **Exit condition** | D1 and D2 hard-0 across every kind and the ledger empty; the ledger file is then **deleted with the finding path**. |
| **Cannot see** | **cross-machine / cross-architecture determinism** — D1/D2 run in one process on one architecture, so platform-dependent floating-point differences are **UNPROVEN** · **GPU-side geometry** — anything computed in a shader is outside every gate here and is **UNPROVEN** · whether the deterministic output is *correct*. |

---

### 3.18 · `check-provenance-not-invented` — no path stamps an origin it did not observe

**Status: BUILT** *(2026-08-12)* — `tools/ga-gate/check-provenance-not-invented.ts` · static scan, correct home under §2.1a · imports the one `contract.ts` · lands **exit 1** against a 7-entry named `LEDGER`, pinned in `gate-newly-measured.json` (§2.4). **V2 and V4 are NOT IMPLEMENTED and remain UNPROVEN** — the gate says so on every run
**Owning invariants:** C70 **H-INV-1**, **H-INV-2**; C75 §2.1, §2.2, §2.3, §2.5, §1.4.

| | |
|---|---|
| **Subject** | every deserialisation and import boundary, and every path assigning a member of the five-value union AUTHORED · OBSERVED · COMPUTED · INFERRED · REGENERATED. |
| **Floor (exit 2)** | source files scanned ≥ a declared floor · provenance-bearing records/assignment sites discovered > 0. |
| **Assertions** | **V1** *(hard)* no code path assigns a member of the union as a **fallback for an absent input**: no `?? '<member>'`, `\|\| '<member>'`, or defaulted destructure at a deserialisation or import boundary. **V2** *(hard)* a value that must be supplied for the model to be usable is stamped **INFERRED**, never AUTHORED and never COMPUTED — *a default that presents as authored is indistinguishable from a user decision and will be exported as one.* **V3** *(hard)* repair/healing/recovery **records what it did** in the model, with a reason — *the console is not the model*; where the substitution cannot be recorded, the correct behaviour is to **refuse**. **V4** *(hard)* a new provenance field is **optional with an `UNKNOWN`-with-reason default** that parses existing snapshots unchanged; the default is **never** a member of the five — otherwise the migration path becomes a second site that invents provenance. **V5** *(hard)* `as any` at a provenance boundary is a finding: it defeats the union at exactly the point the union existed to help. |
| **Positive control** | a path recording UNKNOWN-with-reason for a snapshot that genuinely lacks provenance must be clean. *A deserialiser reading a snapshot without provenance knows exactly one thing — that the snapshot lacks provenance — and that is what it must record.* |
| **Negative control** | `roomSnapshotUtils.ts:156` is the **canonical violation and the recorded negative-control text** — a `\|\|` default supplying `'auto-topology'` for an absent field. `RoomDetectionEngine.ts:454` is the second: it logs the substitution to the console and writes `'auto-topology'` to the model. `SlabFragmentBuilder.ts:706` is the **correct** form (refuse) and must read clean. |
| **Ratchet** | hard, with today's two known violations as a two-entry named ledger until fixed. |
| **Exit condition** | `roomSnapshotUtils.ts:156` records UNKNOWN-with-reason and the serialised field is typed `RoomDetectionMethod`, not `string`; `RoomDetectionEngine.ts:454` writes INFERRED with its reason or refuses. |
| **Cannot see** | **semantic truth** — a path writing OBSERVED while actually computing passes every static arm, because the gate checks *shape*, not *honesty of authorship* · **runtime provenance** — an origin decided by a branch is invisible to a source scan · the **export boundary** (C75 §5, **UNPROVEN**) · **cross-session regeneration** — the prior-value chain of REGENERATED is not verifiable statically. |
| **Preference order to encode in the header** | **unrepresentable > runtime check > gate > convention** (C75 §2.8). A convention is what `roomSnapshotUtils.ts:156` had. Where the `LandBasis` branding idiom can make a wrong provenance impossible to construct, that beats this gate. |

---

### 3.19 · `check-provenance-coverage` — per kind, never a percentage

**Status: SPECIFIED-NOT-BUILT** · **specified by C75 §6**
**Owning invariants:** C70 **H-INV-1**, **H-INV-3**; C75 §3.1–§3.3, §2.4.

| | |
|---|---|
| **Subject** | per **element kind**: whether a provenance field exists **in `packages/schemas`** (the L0 layer every consumer reads) and is populated on **every construction path**. |
| **Floor (exit 2)** | element kinds enumerated ≥ the element registry's declared count · schema files read > 0. |
| **Assertions** | **PC1** *(ratchet, named, per kind)* a provenance field exists in `packages/schemas` for the kind. **PC2** *(ratchet, named, per kind × construction path)* every construction path populates it. **PC3** *(hard)* provenance lives in `packages/schemas`, not in a store, a topology package or a serialiser — the current arrangement, where the sole element provenance lives **outside** `packages/schemas` entirely, is why exporters, the renderer and the AI host cannot see it. **PC4** *(hard)* confidence is not encoded in the provenance field; provenance is **orthogonal to confidence** (C62 owns confidence), and the two may not share a field. |
| **Positive control** | site / context / climate / zoning / AI artefacts are **rich and disciplined** today and must read covered — the gate must not be uniformly red, or nobody will believe its per-kind readings. |
| **Negative control** | remove the provenance field from one covered kind's schema and require **that kind** named. Then add a field outside `packages/schemas` and require PC3 to reject it — this is the arm that stops the fix being applied in the wrong layer. |
| **Ratchet** | **per kind, named, shrink-only, checked in both directions** — a kind that gains provenance leaves the list in the same commit, or the list rots into a record of things that are secretly fine. **A repo-wide percentage is forbidden**: it lets a large kind's regression hide behind a small kind's improvement. |
| **Exit condition** | the named baseline reaches its **agreed per-kind target** — not necessarily 100 %; a kind may be argued out of scope **in writing, on the named list, never by omission**. |
| **Cannot see** | whether the populated value is *true* (§3.18's blind spot, restated) · the export mapping — **UNPROVEN, and C75 §5 names it the largest open risk in the contract: provenance that stops at the export boundary protects nothing downstream.** |

---

### 3.20 · `check-derived-classification` — every field carries its ADR-0319 class

**Status: SPECIFIED-NOT-BUILT** · **named by C70 §7**
**Owning invariants:** C70 **B-INV-2**, **I-INV-1**; ADR-0319.

| | |
|---|---|
| **Subject** | every persisted element field, classified against ADR-0319's three classes: **1 AUTHORITATIVE** (byte-for-byte, no tolerance ever) · **2 DERIVED-BUT-CAUSAL** (may differ across a **restore**; may **never** differ across an **undo**) · **3 DERIVED-INCIDENTAL** (may differ across both). |
| **Floor (exit 2)** | fields classified ≥ a declared minimum · kinds covered ≥10. |
| **Assertions** | **K1** *(hard)* every persisted field carries a class, and the class is **enforced, not documented**. **K2** *(hard)* the class-2 and class-3 lists are **separate artefacts, separately named** — the persistence comparator MAY consume class 2 with a printed citation on every row it touches; the **undo comparator MUST NOT consume it, ever**. K2 is the arm that keeps them apart. **K3** *(hard)* both lists are **enumerated exact field paths matched by whole-segment tail equality** — never a pattern, never a prefix match, never "ignore fields ending in `At`" — so adding an entry is a **visible diff in review**. `metadata.modifiedAtBy` must not match `metadata.modifiedAt`. **K4** *(hard)* no monotonic counter is class 3: `metadata.version` and `_renderVersion` are class **2** and are deliberately absent from the class-3 list, because a counter that ratchets through an undo/redo cycle is a **real defect** and stays red until the code is fixed. |
| **Positive control** | `capture.ts`'s `ADR0319_CLASS3_FIELDS` (`metadata.createdAt`, `metadata.modifiedAt`) and `ADR0319_CLASS2_RESTORE_ONLY` (`metadata.version`, `_renderVersion`) are the reference implementation and must read clean, with their citations printed. |
| **Negative control** | merge the two lists into one and require K2 red — *the single combined list is exactly the shape of tolerance creep: one list that grows to fit whatever is failing, consumed everywhere, cited nowhere.* Then convert an entry to a prefix pattern and require K3 red. |
| **Ratchet** | the unclassified-field list, named and shrink-only. |
| **Exit condition** | every persisted field carries an enforced class and the unclassified list is empty. |
| **Cannot see** | whether a field's **assigned class is right** — a class-1 field mislabelled class 3 is invisible to a shape check and is caught only by the round-trip comparator going quiet, which is why the two lists' **sizes** must be reviewed, not just their contents. |

---

### 3.21 · `check-algorithmic-core` — reasoning without an LLM in the loop

**Status: SPECIFIED-NOT-BUILT**
**Owning invariants:** C70 **J-INV-1**, **J-INV-2**, **J-INV-3**, and **§1.3** (*the LLM may sit above the computational model, not underneath it*).

| | |
|---|---|
| **Subject** | every algorithm answering a reasoning question — what is connected · what is hosted · what is affected · what depends on what · what supports what · shortest path · what clashes · what becomes invalid — and its inputs, outputs and write path. |
| **Floor (exit 2)** | algorithms enumerated ≥ the register's declared count · executed probes > 0 · **answers compared, printed**. |
| **Assertions** | **A1** *(hard)* every algorithm is a **pure consumer** of authoritative state + graph reads, writing back **only through commands**. **A2** *(hard)* outputs carry COMPUTED/INFERRED provenance and, where inferred, confidence. **A3** *(hard)* insufficient input **refuses with the named gap** — it never pads the answer, and it never returns `[]`/`null`/`0` to mean "I could not answer". **A4** *(hard, the zero-LLM arm)* with **no AI key configured and the AI host absent from composition**, every algorithm still answers. *Removing the AI box entirely must cost the system no capability except conversation* — this is a property to be **tested and kept**, not admired. |
| **Positive control** | run the whole reasoning set twice: once with the AI host composed, once without. **The answers must be identical**, and the compared-answer count printed. |
| **Negative control** | remove one required input (delete the room set) and require A3 to produce a **named-gap refusal**, not an empty list. Then route one algorithm's write through a store directly and require A1 red. |
| **Ratchet** | named, per algorithm, shrink-only. |
| **Exit condition** | A1–A4 hard-0 across the enumerated set. |
| **Cannot see** | **answer correctness** — an algorithm returning a wrong-but-well-formed answer passes every arm; each reasoning question therefore needs an **oracle fixture in the canonical world** with a hand-checked expected answer · algorithms reachable only through UI paths the harness does not drive. |

---

### 3.22 · `check-collab-model-integrity` — the merge that loses authored state must say so

**Status: SPECIFIED-NOT-BUILT**
**Owning invariants:** C70 **K-INV-2**, **K-INV-3**; C08; C66 §1.

| | |
|---|---|
| **Subject** | merge outcomes at the **model** level: any merge that discards a user's authored state, and the conflict artefact it must produce. Sibling to §3.23, which owns the **relationship** half. |
| **Floor (exit 2)** | concurrent sessions established ≥2 · **element records compared and conflict artefacts inspected, both printed**. **No transport → exit 2, reason `transport-absent`** — never exit 0. |
| **Assertions** | **CM1** *(hard)* any merge discarding authored state produces an **explicit, resolvable conflict artefact** — **no silent substitution**. **CM2** *(hard)* the conflict artefact names **what was lost, whose it was, and both values**. **CM3** *(hard)* reload after conflict resolution preserves the resolution. **CM4** *(hard)* no capacity tier is described as supported while C66 §1 marks it CLAIMED — the gate reads C66 §1 and fails on a document that over-claims. |
| **Positive control** | two clients editing **disjoint** properties of the same element converge with both edits present and **zero** conflict artefacts — the gate must not manufacture conflicts. |
| **Negative control** | two clients editing the **same** property with a last-writer-wins transport: CM1 must report the silent substitution. Production runs socket.io last-writer-wins today, so this control is available immediately. |
| **Ratchet** | **none — zero tolerated, and not on `gate-debt.json`.** Losing a user's authored state has never been tolerated here, so there is no baseline to ratchet down from. |
| **Exit condition** | green **against a real transport**; until then it reports **UNPROVEN, never green** (C70 §3.4). |
| **Cannot see** | anything, today: **there is no deployed transport**, so this gate is exit-2 by construction, and that is a **founder decision, not an engineering task**. |

---

### 3.23 · `check-collab-graph-integrity` — converging the bytes is not preserving the model

**Status: BUILT** — `tools/ga-gate/check-collab-graph-integrity.ts` (harness at
`apps/sync-server/src/collab-gate/collabGraphIntegrity.ts`) · **location is a recorded finding**
(C70 §7.2)
**Owning invariants:** C70 **K-INV-1**, **K-INV-2**, **K-INV-3**; C08; C66 §1; P8.

| | |
|---|---|
| **Subject** | two real `y-websocket` clients editing a wall and its hosted door concurrently, against a local in-process sync server by default or a deployed target via `PRYZM_COLLAB_GATE_URL` + `PRYZM_COLLAB_GATE_TOKEN`. |
| **Floor (exit 2)** | `MIN_COMPARED_ELEMENTS` element records · `MIN_COMPARED_RELATIONSHIPS` hosting edges — **both printed with their floors on every run**. |
| **Assertions** | after the merge, **the door is still hosted by a wall that exists**, on **both** documents, with the host **resolving**. Note what it does **not** assert: that the two documents converge. *Yjs converges, and a gate asserting that is asserting a library's own test suite.* **Two peers can converge byte-for-byte onto a self-consistent, confidently wrong building.** |
| **Positive control** | the local-harness run: N hosting edges survive concurrent editing on both documents, 0 violations, with N printed. |
| **Negative control** | **built in, and it runs every time**: the harness re-runs its own checker over a **deliberately broken pair**. A checker that calls a dangling host "clean" makes the run `blind-comparator` → **exit 2**, invalidating every verdict it produced. This is the pattern every gate in this document should copy. |
| **Three results it refuses to conflate** | **no transport** → exit 2 `transport-absent` (before this gate, "the sync server is not deployed" and "collaboration works fine" produced the same observation — nothing went wrong — and C8 could have been scored green by a harness that never opened a socket) · **blind comparator** → exit 2 · **broken relationship** → exit 3. |
| **Ratchet** | **0, and not on `gate-debt.json`.** |
| **Exit condition** | green against a **real deployed transport**. `PRYZM_COLLAB_GATE_SCOPE=production` with no URL configured returns **exit 1**, reported as a declared level rather than dressed up as green. |
| **Cannot see** | production behaviour — production still runs socket.io last-writer-wins, and **C66 tiers remain CLAIMED, not HELD** · anything beyond the hosting edge (rooms, junctions, boundaries are §3.22's and future arms' work) · more than two peers. |

---

## §4 — The other direction: invariants with no gate

C70 §7.1 makes a named gap of every gate that does not exist. The symmetric obligation is this
section: **an invariant with no gate is an unenforced claim**, and leaving it unlisted is how a
contract becomes decoration. Each row below is **UNPROVEN**.

| Invariant | What is unenforced | Nearest gate, and why it does not cover this |
|---|---|---|
| **C70 D-INV-1** | `graph.query` / `graph.neighbors` / `graph.path` exist as read-only, **refusal-honest bus verbs over the composed runtime** | §3.5–§3.7 measure **writers, readers and persistence of edges**, never the **query surface**. **A gate is needed and is not in this document's 23** — specify `check-graph-verbs-exposed` when the verbs land (C70 §4 Level 5 turns on it). |
| **C70 D-INV-2** | rebuilding twice from the same authoritative state yields **identical snapshots** | §3.17 covers *geometry* regeneration; graph-snapshot idempotence is a separate assertion and is a **DoD §6.1 line item** with no gate. |
| **C70 D-INV-3** | every consumer above the bus — **the AI interface included** — reaches graph answers through the same verbs with the same refusals | no gate. §3.21 A4 is adjacent (zero-LLM answering) but does not assert *path identity*. |
| **C70 E-INV-3** | geometric impossibility is a **refusal**, never a silently-wrong mesh | §3.16 counts implementations; §3.17 checks determinism. Neither asserts refusal. C73 §5.4(d) states it plainly: **no gate asserts refusal reachability at the UI.** |
| **C70 F-INV-3** | host mutation re-validates hosted state — refit where it fits, refuse **naming both numbers** where it does not, **never delete a hosted element to make room** | `planOpeningRefit` and `BaselineReversalError` are the working precedents; **no gate executes them**. Highest-value missing arm in the propagation family. |
| **C70 G-INV-3** | violations are **queryable model state**, not log lines | §3.12 checks adapter identity, not violation storage. |
| **C70 G-INV-4** | a refused mutation **names the rule and both numbers** | no gate. Add as an arm to §3.2 S4 when the refusal vocabulary is enumerated. |
| **C70 H-INV-2** | repair is legible — an invented boundary is recorded as `repaired`, never as authored or detected | §3.18 V3 covers the *shape*; whether the recorded reason is *true* is unreachable statically. |
| **C70 L-INV-1** | no production API returns `[]`/`null`/`0` to mean "I could not answer" | **no repo-wide gate.** `RoomGraphService`'s three indistinguishable cases and `SpeculativeEngine`'s guard-on-a-method-that-does-not-exist returning `[]` are the measured anti-targets (C71 §4.4). A `check-empty-is-not-failure` counting gate is the obvious candidate and is **not specified here**. |
| **C70 L-INV-3** | refusals speak: rule, both numbers, **reaching the user verbatim** | no gate; C73 §5.4(d) marks the UI half UNPROVEN. |
| **C70 B-INV-3** (IFC half) | the GUID is the **IFC round-trip join key** | §3.1 ARM B proves *stability across save/reload*, never that an export→import cycle joins on it. |
| **C70 C-INV-4** | the count of **declared-but-unwritten** relationship types never grows | §3.5's ratchet covers REQUIRED families; the declared-but-unwritten count across the full union needs its own arm. |
| **C72 §5** | a reconciliation whose whitelist names N types **handles N or records the shortfall by name** | no gate. `SpatialAuthority.RECONCILABLE_TYPES` names thirteen entries, **is exported, and has zero consumers**; the real reconcile rebuilds walls and slabs only, stranding columns, beams, stairs, roofs, furniture, curtain walls and handrails at the old elevation. |
| **C74 §1.3** | every constraint family carries a **written classification with its evidence** | §3.12 H3 can check that a classification *exists*; whether the classification is *right* is a written judgement, explicitly not machine-checkable. |
| **C75 §5** | the **export mapping** for provenance into IFC/DXF | does not exist. C75 names it the largest open risk in that contract. |

---

## §5 — Build order for the 19 SPECIFIED gates

Ordered by **cost ÷ leverage**, cheapest and highest-leverage first. Cost is measured in what the
gate must reach: a `package.json` scan is cheaper than a source scan, which is cheaper than an
executed harness, which is cheaper than an executed harness that needs a subsystem built first.

### Tier 1 — manifest and single-file scans (hours each; land them this week) — ✅ **ALL THREE LANDED 2026-08-12**

*(All three are in `tools/ga-gate/`, which §2.1a confirms is their correct home: each is a
single-pass scan over the tree at HEAD. All three land **red**, as §2.3 requires, and are pinned in
`tools/ga-gate/gate-newly-measured.json` under §2.4 — **not** on `gate-debt.json`, because nobody
chose to ship these defects; nothing was measuring them.)*

| # | Gate | Why first |
|---|---|---|
| 1 | **`check-solver-is-real`** | *the cheapest check in the contract suite* (C74 §3.7): `planegcs` at 0 hits across every `package.json` settles the question without reading adapter code. Lands **red**, which is the point. |
| 2 | **`check-provenance-not-invented`** | a bounded source scan for `?? '<member>'` / `\|\| '<member>'` at deserialisation boundaries; two known violations give it an immediate negative control. |
| 3 | **`check-epsilon-policy`** (E2/E5 arms first; E1 red) | pure counting over a scan with an existing floor helper; the 267 literals are the ratchet's opening reading. |

### Tier 2 — structural source scans reusing the R3 recipe (days each)

| # | Gate | Why here |
|---|---|---|
| 4 | **`check-predicate-canonical`** | `check-offset-implementations.ts` is a working template; **one family per PR**, point-in-polygon (61) first. |
| 5 | **`check-no-hidden-mock`** | generalises §3.12's detector; needs the named-baseline sweep, which is the expensive half. |
| 6 | **`check-constraint-honesty`** | delegation-chain analysis is more work than a regex, but the subject is small (adapters + families). |
| 7 | **`check-prevstate-contract`** | `*Store.ts` emit-site scan; P2 needs classifier reachability analysis. |
| 8 | **`check-suppression-is-reversible`** | the discovery problem is real (suppression has no naming convention) — budget for the floor, not the arms. |
| 9 | **`check-graph-write-coverage`** | static and well-specified by C71 §6, but the **typed-reader** predicate is the hard part; do not ship a version that counts untyped sweeps. |
| 10 | **`check-graph-persistence`** | static + one snapshot fixture; arm (d), the two byte-identical `_rebuildSemanticGraph` copies, pays for the gate on its own. |
| 11 | **`check-derived-classification`** | `capture.ts` already holds the reference lists; the gate mostly enforces their **separation**. |
| 12 | **`check-provenance-coverage`** | per-kind enumeration is mechanical once the element registry is the source of truth. |

### Tier 3 — executed harness against the canonical world (weeks; depend on the world existing)

| # | Gate | Depends on |
|---|---|---|
| 13 | **`check-authoritative-state`** | the canonical world + the verb list. **Highest leverage of the whole set** — it is the gate that makes every other row's read-back trustworthy. |
| 14 | **`check-deterministic-regeneration`** | the canonical world + fragment builders registered in the harness (today the geometry link is UNPROVEN by construction). |
| 15 | **`check-graph-delete-integrity`** | the canonical world + executed undo read-back. |
| 16 | **`check-algorithmic-core`** | the canonical world + oracle answers per reasoning question. |
| 17 | **`check-topology-persistence`** | **blocked** — see below. |
| 18 | **`check-topology-invalidation`** | the canonical world + #17. |
| 19 | **`check-collab-model-integrity`** | **blocked** — see below. |

### §5.1 — Gates that cannot go green until implementation lands (build them anyway)

Per §2.3, each of these lands at **exit 1 against a named ledger** and shrinks. None may be
deferred.

| Gate | What must be built first |
|---|---|
| **`check-graph-write-coverage`** | `joinedTo` is **not a `RelationshipType` member and has no writer**; `contains` has **no first-party writer**; `CreateWallCommand` writes **zero** edges. Until these land under C71 §2.6, the REQUIRED-nine ratchet cannot reach 0. |
| **`check-topology-persistence`** | the same `joinedTo` gap. **C-INV-2 is UNPROVEN and must be recorded as UNPROVEN**, not as a failing test. |
| **`check-topology-invalidation`** | needs #17 plus mutation-update on **move**, which is **UNPROVEN for every family** — 45 cells, all of them. |
| **`check-epsilon-policy`** E1 | there is no declared tolerance module in `packages/geometry-kernel`. |
| **`check-solver-is-real`** R1/R2 | `planegcs` is not a dependency of any workspace; `loadSolver()` cannot distinguish not-configured from configured-and-failed. |
| **`check-constraint-honesty`** H1 | `PlanegcsAdapter` declares `kind = 'planegcs'` and delegates 100 % to `MockSolver`. **The honesty fix lands in its own commit, before any binding work** (C74 §4.3) — merging them destroys the lesson. |
| **`check-provenance-coverage`** | no five-value provenance type exists in `packages/schemas`. |
| **`check-suppression-is-reversible`** S1/S2 | `clearGraphAuthoritative` has 0 production callers; `initPersistence.ts:362` has no `finally`. |
| **`check-collab-model-integrity`** and **`check-collab-graph-integrity`** (production scope) | **no deployed transport.** This is a **founder decision, not engineering work**, and it is why both report exit 2 / UNPROVEN rather than green. |

### §5.2 — The meta-gate, built last and wired per §1.3

Once ≥12 gates exist, add `check-gates-are-real`: every gate in this document has a file, a floor,
a named ledger where it ratchets, and a **recorded negative-control text**. It **reports as a row
and never aborts the suite** (§1.3). A gate suite that cannot audit itself is the next
~15-green-and-blind incident with better documentation.

---

## §6 — What this document, as a whole, cannot see

Stated so the 23-gate table is never read as coverage:

- **(a) Static discovery counts authored-but-unreached code as present.** The **reachability**
  question — *is this writer, listener, release method or algorithm actually reached at runtime?*
  — is answered by **no gate here**. C70 §4.2 is the standing warning: *machinery present ≠
  capability reachable*, and Level 6 was graded "one constraint store away" on exactly that error.
- **(b) A green gate proves its own assertion, never the pillar around it.** Twelve pillars, 23
  gates, and no arithmetic between them (C70 §2.1 — no pillar is scored from a neighbour).
- **(c) Single-client by construction.** Every gate except §3.22/§3.23 says nothing whatsoever
  about multi-client behaviour.
- **(d) An executed run proves the seeded fixture, not the user's project** — and the fixture is
  itself a declared, reviewable artefact (see the certification plan).
- **(e) The four BUILT gates' current readings are not in this file, on purpose.** Counts rot in
  documents and do not rot in gates. **Read the gate.**
