# BIM 3.0 Master Completion Tracker — the MEASURED STATE

> **Stamp**: 2026-08-15 · **HEAD at writing**: `3afcac71` · **Branch**: `main`
> **Readings**: measurement pass 2026-08-15, spanning `0ba90dc7` → `92535b31`, plus three gates
> this document re-ran itself at `3afcac71` (named in-line, §4.4).
> **This document carries NO forward plan.** The plan is
> [`BIM30-IMPLEMENTATION-ROADMAP.md`](BIM30-IMPLEMENTATION-ROADMAP.md); it carries the phases,
> the sequencing and the ordering rules, and it cites the row ids below. This file carries the
> measured state and cites the roadmap's phases. **Neither repeats the other.** If you find a
> phase narrative here, it is a defect in this file; if you find a row status there, it is a
> defect in that one.
> **Authority**: the contracts, not this file — C70–C75, C08, C66, C69, ADR-0318, ADR-0319,
> ADR-0323. Where this file and a contract disagree, the contract wins. Where this file and a
> **gate reading** disagree, **the gate wins** (C70 §0.2).
> **This file absorbs the row-level content of the deleted `BIM30-GAP-REGISTER.md`** (its §0
> taxonomies, §1–§8 rows, §9 distribution, §10 coverage matrix, §11 limits), the deleted
> BRIEF §9 (32 user scenarios), the deleted CAPABILITY-MODEL's per-domain MINIMUM CHANGE verbs,
> and the deleted DISPOSITION-DOCKET's dated obligations. Those files are gone; this is where
> their state lives now.

---

## §0 — THE MEASUREMENT CONTRACT

Stated first, because it is the thing that makes every number below worth reading.

### §0.1 — The binding rule

> **A row counts CLOSED, OPEN or UNPROVEN only if THIS pass ran that row's deciding instrument
> and read the number.**
>
> Everything else is **NOT RE-MEASURED**, and NOT RE-MEASURED is **never inherited as closed**.
> A row the previous stamp called CLOSED is not closed here; it is *last known closed*, and its
> Status cell says so in its own words.

The three status values are never collapsed into two (carried from this tracker's own §0, which
predates the register): **CLOSED · OPEN · UNPROVEN.** UNPROVEN is not a soft pass and not a fail —
it means **nobody looked** (C70 §2.2). Most of this programme's first-week progress was converting
UNPROVEN → OPEN, which reads as regression and is the opposite.

**Two axes, never averaged: INSTRUMENTATION and CAPABILITY.** A gate that exists and reads RED is
instrumentation complete, capability zero. §4 is the instrumentation axis; §2 is the capability
axis. A single blended percentage across the two would hide exactly the distinction the programme
is built on, so this file quotes none.

### §0.2 — The corollary the pass proved, in BOTH directions

Carrying is not verifying — and the error does not have a preferred sign.

| Row | What the last stamp carried | What was actually true, and since when |
|---|---|---|
| **PR-13** | OPEN at the `a75e8e1e` stamp (12:46) | **Already CLOSED.** `43ae13f4` landed at **08:52** — hours *before* the stamp. One `ColumnStore` file repo-wide; the `core-app-model` fork was already gone. |
| **CE-04** | UNPROVEN at the same stamp | **Already CLOSED.** `13557717` (the CE-03/CE-04 cert arms) landed at **09:01**, likewise hours before. |

That stamp carried **69 of 82 rows unmeasured**, and **at least two of the carries were
PESSIMISTIC**. This matters more than it looks: a register that only ever errs toward overstating
the gap is still a register nobody can plan from, and it is the same class of defect as a stale
gate understating one. **Both substitute a document's memory for a measurement.**

### §0.3 — The anti-staleness trigger, and why it is MECHANICAL this time

The previous stamp went **92 commits** without a recount (measured by lane T2 at `92535b31`; the
distance is **95** at this document's HEAD `3afcac71`, measured here by
`git log --oneline a75e8e1e..HEAD | wc -l`). The register's own §0.0 rule 1 — *"a row's status
changes in the SAME commit that changes the row's state"* — **existed, was binding, and failed**,
because it depended on a human remembering it.

> **The restamp trigger is now mechanical, not remembered.**
>
> `tools/tracker/update-tracker.ts` (shipped `5f9dca7f`, run from `.githooks/post-commit`) writes
> a **gate-staleness table** into §11's auto-block on every commit: for each gate named in
> `tools/tracker/row-paths.json`, the SHA and date of its last recorded measurement and **how many
> commits have landed since**. A reader who opens this file sees *"this reading is 246 commits
> old"* in the same glance as the reading.
>
> **The trigger: any row whose deciding gate shows a reading-age above 50 commits in §11 is not
> quotable as current UNLESS §2 carries a dated hand-run reading for it.** Re-run the gate or
> re-mark the row NOT RE-MEASURED. The number is printed by the tool; it is not something anyone
> has to remember to compute.
>
> ⚠ **Read the age correctly — it is a LOWER BOUND on freshness, not an upper bound on staleness.**
> The tool measures *when the gate's evidence artefact was last committed*, because that is the one
> thing a post-commit hook can know without running anything. **A gate that runs and finds nothing
> new does not rewrite its baseline**, so a 456-commit-old artefact means *"the recorded reading is
> 456 commits old"*, **not** *"the gate has not run in 456 commits"* — several of the gates showing
> large ages in §11 were executed in this very pass (§4). The age tells you how old the number
> **written down** is. That is exactly the question the previous stamp got wrong, and it is why the
> instrument is worth having even though it cannot see a run that changed nothing.

**The hook never changes a row's STATUS.** See §11. It counts and discloses; only an executed gate
run moves a status.

---

## §1 — THE COUNTED POSITION

### §1.0 — ⭐ RESTAMP 2026-08-16 · **IT WENT DOWN, and that is the pass working**

> **Stamp**: 2026-08-16 · **HEAD at measurement**: `3785eae6` · **Denominator**: 79 (§1.2)
> ⚠ **This reading is already historical.** ~30 lane commits landed after it, several of which move
> rows named below. It is recorded as a DATED PASS, not as "current" — quoting it as current would
> be the exact staleness defect §0.1 exists to prevent. The next recount will differ; run it.

```
COMPLETION            53 / 79 = 67.1%     (measured-only)     ← was 59 / 79 = 74.7%
                      54 / 79 = 68.4%     (like-for-like, carrying MT-09 as the previous stamp did)
VERIFICATION COVERAGE 53 / 53 = 100%                          ← was 30 / 59 = 50.9%
```

**Completion fell by ~6–7 points and coverage rose to 100%. Those are the same event.** Seven
carried closures were finally measured; **five were refuted and two more downgraded** because their
deciding gate could not be honestly read. **Completion fell PRECISELY BECAUSE coverage rose.**

> This is §1.2.1's error running in reverse. The last stamp banked closures it had not measured.
> This one measured them and had to give six back. **A register that only ever goes up is not
> measuring.**

Coverage is 100 % **by construction, not by luck**: no closure survived this pass on a carry. Every
carried closure that could not be re-measured was downgraded rather than inherited, and MT-09 — the
only row still carried — is reported **NOT DETERMINED**, not CLOSED.

**Quality inside that 100 %**: 43 of the 53 are held by an executed instrument's **exit code**; 10
by an executed **source census** (GR-15, PR-04, PR-06, PR-07, PR-13, CO-05, CO-07, CO-10, PV-06,
MT-08). The census class is not toothless — two of this pass's losses (GE-04, PV-05) came from
source censuses — but it is the weaker half and is named as such.

**Reconciliation against the previous stamp — it closes exactly, which is itself the check:**

```
previous CLOSED                                        59
  − 7 lost CLOSED   GE-02 GE-03 GE-04 PV-05 MT-01 MT-02 MT-03
  + 2 gained CLOSED CO-09 MT-10
  = 54   like-for-like
  − 1    MT-09 removed from the numerator as unmeasured
  = 53   measured-only
```

That the arithmetic closes independently confirms the previous **59 was counting MT-09 as a carried
closure** — which nothing in the old text said.

#### Per block — C70 model-truth is the worst in the register, and it got worse

| block | rows | CLOSED | OPEN | UNPROVEN | ND | closed % |
|---|---|---|---|---|---|---|
| C71 graph & topology (GR) | 16 | 13 | 2 | 1 | — | 81.3 % |
| C72 propagation (PR) | 13 | 12 | 1 | — | — | **92.3 %** |
| C73 geometry (GE) | 12 | 4 | 5 | 3 | — | 33.3 % |
| C74 constraints (CO) | 12 | 10 | 2 | — | — | 83.3 % |
| C75 provenance (PV) | 8 | 7 | 1 | — | — | 87.5 % |
| C70 model-truth (MT) | 10 | **2** | 5 | 2 | 1 | **20.0 %** |
| C08 collaboration (CB) | 5 | 2 | 2 | 1 | — | 40.0 % |
| certification (CE) | 6 | 3 | 1 | 2 | — | 50.0 % |
| **total** | **82** | **53** | **19** | **9** | **1** | |

#### The ten rows that moved — **two up, eight down**

| row | old → new | what decided it |
|---|---|---|
| **MT-10** | OPEN → **CLOSED** | `check-xss-guards` **exit 0** — 547 baselined findings / 142 files / 4655 scanned. The `0064df08` fix holds on a corpus **+10 files larger** with findings and files unmoved. The recount the row was waiting for. |
| **CO-09** | OPEN → **CLOSED** | `check-constraint-honesty` **exit 1, 1 finding at declared level 1** (was 2/2). `StairValidationAuthority.spec.ts:38` classified REAL at VALIDATION; the gate struck `H3::StairValidationAuthority`, which is why the reading fell 2→1. |
| **MT-01** | CLOSED → **UNPROVEN**, then **SPLIT — see §1.0a** | ⭐ **The green rested on the wrong runtime.** `hello-12-elements` calls `bootstrapWithEverything()` directly, never `composeRuntime`. There `getStoreForType('wall')` is unregistered, so the readback that goes green is `rt.stores.wall` — **the plugin DTO store the row itself says nobody reads.** ⚠ **My DIAGNOSIS of *why* was wrong — corrected in §1.0a.** |

#### §1.0a — ⚠ MT-01: THIS RESTAMP'S OWN DIAGNOSIS WAS REFUTED, and the row is THREE arms

**Corrected 2026-08-17 by lane K1, which measured the thing this stamp inferred.** §1.0 said the row
was unreachable because `engineAttached=false`. **That is only the outer skin.** Measured on the same
composed runtime with the engine ATTACHED exactly as `initBuilders.ts:551` attaches it:

```
engineAttached wall/slab/room : true true true
wall.create  → DISPATCH OK      AUTHORITATIVE wall readback : ABSENT
slab.create  → DISPATCH OK      AUTHORITATIVE slab readback : ABSENT
```

> **Attaching the engine does not make the create land — it converts the honest refusal straight back
> into a SILENT FALSE SUCCESS. The refusal was never the defect.**

**The real defect:** nothing at the composition root carried a create to the authoritative store. The
browser worked only because of an **L7 subscriber** (`initTools.ts` §P2.1 for wall, §FT1 for slab)
that the command layer cannot see and never tests for. `CreateWall.ts`/`CreateSlab.ts` treat
*"registered AND engine-attached"* as proof that *"the bridge completes the write"* — **an unchecked
implication**, falsified in a process where the engine was attached and no subscriber existed.

⭐ **AND MT-01 AS STATED WAS UNSATISFIABLE** — the `[[unsatisfiable-gate-decomposition-is-the-fix]]`
pattern. A bare composed runtime has **no level authority by design** (ADR-0318 I-3), so
`WallStore.add()` MUST refuse rather than invent a level. *"Readback-positive on a bare composed
bus"* **can never be true.** **The decomposition IS the fix**, as two claims:
engine **ABSENT** ⇒ refuse by name · engine **PRESENT** ⇒ readback-positive.

**The row is therefore THREE arms, not one, and they must be counted separately:**

| arm | status | evidence |
|---|---|---|
| **wall** | **CLOSED** | readback-positive on the composed bus, proven at the STORED value and pinned by IDENTITY (`toBe`) to the `geometry-wall/store` module singleton `ProjectSerializer` reads — so a copy cannot satisfy it. Watched failing first. `a287cfaa` + `7f5b8f01` |
| **slab** | **OPEN — reclassified WIRING → SHAPE** | the committed plugin record is **REJECTED verbatim** by the authoritative store: `[{code:'invalid_type', path:['position']}]`. Authoritative shape is polygon/position/width/depth; plugin shape is `boundary`. ⚠ **Mirroring it would mint a SECOND translation rival to §FT1's** — the silent-drift defect `CreateRoom.ts` refuses on principle. |
| **room** | **OPEN — a DISTINCT defect, not a readback one** | `CreateRoomHandler` declares `affectedStores:[]` and returns `{forward:[],inverse:[]}` — **no patch pair exists to mirror.** Its only authoritative write path is `window.commandManager`, a P1/P6 breach in its own right. ⚠ The row's stated cause (a `'room'` vs `'rooms'` storeKey mismatch) is **STALE — already fixed**. |

⚠ **The false test that held this row closed is now pinned against recurrence.** `hello-12-elements`
keeps its real job but asserts in-file that `getStoreForType(kind) === undefined` for
wall/slab/room/door/window — **proving it has no authoritative store to reach**, so it can never
again be read as a reachability proof. The reachability claim lives in a sibling that composes via
`composeRuntime()`.
| **GR-12** | OPEN → **UNPROVEN** | Both instruments read GREEN (`check-move-propagation` [0] hard-0; H6 16/16) **and both declare the row's core question unmeasured** — H6's notMeasured carries *"SUBSCRIBER REACHABILITY — whether any production path drives a re-detect on a move"*. Green gates, unproven invariant. |
| **GE-02** | CLOSED → **UNPROVEN** | `check-predicate-canonical` **NOT RUN** — a lane held it and its baseline dirty; running it would read a half-edited gate against a half-edited baseline. **A row lost to lane ownership, not to code.** |
| **GE-03** | CLOSED → **UNPROVEN** | Same gate, same block. |
| **GE-04** | CLOSED → **OPEN** | Source census refutes it: the two `WallIntersectionResolver` copies are **byte-identical** (`diff -q` clean, 527 LOC each) and **both live**. |
| **PV-05 · MT-02 · MT-03** | CLOSED → down | see §2; each carries its own executed evidence. |

⚠ **GE-02 and GE-03 are the cheapest two rows in the register to recover** — they need a clean gate
run, not code. They are downgraded because of concurrency, and they will move on the next recount.

### §1.1 — Distribution, counted over the 82 classified rows *(the 2026-08-15 pass — SUPERSEDED by §1.0)*

| Class | Count | What it means here |
|---|---|---|
| **CLOSED** — re-verified by execution in this pass | **30** | the deciding instrument ran, at a reading this pass read |
| **OPEN** — gate says not done, reading in hand | **19** | measured and still failing, most at a named shrink-only ledger |
| **UNPROVEN** — no sufficient instrument exists | **5** | nobody measured; neither a pass nor a fail |
| **NOT RE-MEASURED THIS PASS** | **28** | last-known status carried, named individually in §2, never counted as closed |
| **Total** | **82** | |

~30 instruments were re-run to produce this: 14 gates, 8 suites, plus source measurements, with
10 certification-gate runs and 10 source verifications delegated inside the lane.

**MT-09 corrected the distribution mid-pass.** Its gate finally returned after ~25 minutes and
moved the row NOT-RE-MEASURED → OPEN, so OPEN went 18→19 and NOT-RE-MEASURED 29→28. **MT-09 holds
at exactly 26 failing packages** — the three-day-old carried number, flagged in the register as the
single most-carried number in it, was **accurate**. Worth stating plainly, because the doctrine
cuts both ways: carrying is still not verifying; this one happened to be right.

### §1.2 — The ceiling

- **Absolute ceiling: 82 of 82.** No row requires architectural change. §2.9's ARCHITECTURAL
  CHANGE count of **0** survived the recount.
- **With the founder's CB-01 / CB-02 / CB-05 deferral: 79 of 82.** The authority for that deferral
  is [`L-391-COLLAB-DEPLOY-DECISION.md`](L-391-COLLAB-DEPLOY-DECISION.md) — **that file is not
  being deleted; read it there.** It is not restated here and must not be.
### §1.2.1 — ⚠ TWO NUMBERS, AND CONFLATING THEM IS AN ERROR THIS FILE ALREADY MADE

**Corrected 2026-08-15, after the founder challenged the reading.** An earlier draft of this section
reported *"30 of 79 = 38 %"* as the completion figure. **That was wrong, and it was wrong in a way
worth naming**, because the mistake is subtle and reputable-looking: 30 is the number of closures
**re-proven by execution in this pass**, not the number of rows that are closed. Reporting it as
completion implies 29 closures evaporated. They did not. **Nothing regressed except MT-10**, which
was fixed the same day (`0064df08`).

The two numbers answer different questions and both belong in any status report:

| Measure | Value | The question it answers |
|---|---|---|
| **COMPLETION** | **59 of 79 = 75 %** | *Where is the product?* Rows whose status is CLOSED. |
| **VERIFICATION COVERAGE** | **30 of 59 = 51 %** | *How much of that can this pass personally vouch for?* |

**Completion is 59 / 79 = 75 %.** Counted mechanically over the Status column of §2:
**59 CLOSED · 16 OPEN · 6 UNPROVEN**. Of the 59, **30 were re-measured this pass** and **29 are
carried** — every carried row is named individually in §2 with `NOT RE-MEASURED — last known …`, so
a reader can always separate earned from inherited without doing arithmetic.

The arithmetic reconciles with history exactly, which is itself a check on the recount:
**55** at the `a75e8e1e` stamp **+ 4 newly closed this pass** (PR-05, PR-13, MT-03, CE-04) = **59**.
Progression across stamps: **25 → 34 → 51 → 55 → 59.**

- Remaining closable: **20** (16 OPEN + 6 UNPROVEN − 2 CB rows already inside those, per §1.2's
  deferral). 59 + 20 = 79 ✓

> **Quote completion and confidence TOGETHER. Never quote one alone.** The earlier "30 of 79"
> understated two sessions of real work by half, and the older habit of quoting **55** without
> saying it was 92 commits stale is the same defect facing the other way.
>
> ⚠ **SUPERSEDED — the current figures are §1.0's: 53 / 79 completion, 53 / 53 coverage.** The
> 59 / 79 and 30 / 59 below are the 2026-08-15 pass, kept because §1.0's reconciliation arithmetic
> cites them. **Do not quote them as current.** And note what the pairing rule looks like when it
> actually bites: this restamp moved completion **DOWN** 59→53 while moving coverage **UP** 30→100 %.
> Reporting either number alone would have been a lie in a different direction — one would claim a
> collapse, the other a triumph, and both describe the same seven measurements.

### §1.3 — The 84-vs-82 reconciliation, stated once so it is never re-litigated

No surviving document has ever set this out in one place. It is arithmetic, not judgement:

```
  84   unique row ids            (GR 18 · PR 13 · GE 12 · CO 12 · PV 8 · MT 10 · CB 5 · CE 6)
−  1   GR-02  — PARKED. 12 declared-but-unused relationship families. PARKED is not a gap;
                no census may count them as missing capability (C71 §2.3), and they may not be
                deleted — that breaks `deserialize` on snapshot v3 (C71 §2.4).
−  1   GR-03  — an anti-recount NOTE, not a defect. It exists solely to stop "13 relationship
                types without writers" being re-inflated: 12 are PARKED, one (`contains`) is
                the gap.
= 82   classified gaps          ← the denominator for every count in this file
+  4   rows carrying TWO implementation types (GR-06, GR-16, PR-10, GE-06)
= 86   type-instances           ← the denominator for §2.9 only
```

**84 rows / 82 classified / 86 type-instances.** A document quoting any one of those three without
the other two will re-open this confusion. The roadmap's header previously said 84 and this
tracker said 82; both were right about different things and neither said which.

---

## §2 — ALL 82 ROWS

### §2.0 — The two classification axes (carried verbatim; this is the taxonomy the whole corpus indexes against)

Grading alone cannot separate the two failure modes this repository actually has. **A disconnected
subsystem is not a missing subsystem** — `DependencyResolver` emitted four typed, catalogued
cascade events and nothing listened; fixing that is a call site, building it would be a quarter.
**A missing subsystem is not a disconnected one** — there was no 2-D boolean union anywhere in the
tree, and no amount of wiring produces one. A register carrying only maturity would rank the mock
solver and the dead cascade identically; they are nothing alike.

| Grade | Maturity |
|---|---|
| **G0** | absent — no representation of the concept exists |
| **G1** | represented — a type, a name, a declaration exists; no instances flow |
| **G2** | persisted — instances exist and survive save/reload |
| **G3** | relational — the datum is connected to other data, addressable from them |
| **G4** | computational — an algorithm consumes it and produces an answer |
| **G5** | deterministic reasoning — the answer is reproducible, refusal-honest, gate-pinned |
| **G6** | closed-loop — the answer feeds back into the model and maintains itself |

| Type | What the work actually is |
|---|---|
| **WIRING** | the machinery exists and is not connected to its caller, subscriber or registration |
| **RETENTION** | a value is computed and discarded; the fix extends an existing computation's lifetime |
| **EXPOSURE** | reachable internally, no surface (verb, slot, API) |
| **INVARIANT** | right sometimes; the fix is a rule, a gate or a refusal that makes it right always |
| **MISSING VERB** | no command id, or an id with no handler |
| **MISSING ALGORITHM** | the computation does not exist in the tree at all |
| **MISSING SOLVER** | a simultaneous system with no closed form and no numerical procedure |
| **MISSING PERSISTENCE** | computed and never serialized, or serialized and never rebuilt |
| **MISSING COLLABORATION** | multi-client behaviour no single-client change can produce |
| **ARCHITECTURAL CHANGE** | the current structure cannot host the fix; something must be replaced |

### §2.1 — Reading the row tables

The last column is **non-negotiable and is the point of this section**: it separates statuses this
pass EARNED from statuses it INHERITED.

- `RE-MEASURED 2026-08-15` — the deciding instrument ran in this pass; the reading is in the cell.
- `RE-MEASURED (reading not itemised)` — the pass counted the row as re-measured, but its
  write-up did not itemise a per-row reading (these fall in the pass's 10 delegated source
  verifications). The status is earned; the number is **NOT DETERMINED**.
- `NOT RE-MEASURED — last known …` — carried. **Not evidence of anything at HEAD.**

Where a reading is unknown the cell reads **NOT DETERMINED**. It never reads `0` and never reads
blank, because a zero would be indistinguishable from a fresh measurement.

### §2.2 — §1 · Graph & topology (owner: C71) — 16 counted rows

| Row | Claim | Contract | Deciding instrument | Status | Reading + date/SHA | Source of this status |
|---|---|---|---|---|---|---|
| **GR-01** | `contains` has no first-party writer — on a native project *"this room contains nothing"* and *"nobody wrote this edge"* are the same answer | C71 §5.2 | `check-graph-write-coverage` + H5 `graphruntime.cert` | **CLOSED** | `[1]` **2/2** (both remaining rows are `partOf`, each DECLINED with a written §2.5 rationale); `contains` writer ●1 / reader ●2 / rebuild ●1 and REACHED live in H5 · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **GR-02** | *(PARKED — 12 declared families, zero writers, zero readers. NOT A GAP; see §1.3)* | C71 §2.2–2.3 | — | **n/a** | not counted, by rule | — |
| **GR-03** | *(anti-recount NOTE — 12 of the 13 are PARKED, one is the gap; see §1.3)* | C71 §5.1 | — | **n/a** | not counted, by rule | — |
| **GR-04** | `joinedTo` decided (ADR-0321 ACCEPTED) and unlanded; C70 C-INV-2 UNPROVEN until it lands | C71 §3 | `check-topology-survives` | **CLOSED** | `[0]` **CLEAN, hard-0** — all five transitions MEASURED-PASS; C-INV-2 proven by two independent observations · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **GR-05** | `sitsOn` was the most-written edge with no typed reader; runtime reachability UNPROVEN | C71 §2.1 r5 | `check-graph-write-coverage` + H5 | **CLOSED** | `[1]` **2/2**; H5 **16/16** regenerated 2026-08-15T07:52Z with `sitsOn` **REACHED ×5** through real command executions | RE-MEASURED 2026-08-15 |
| **GR-06** | `_rebuildSemanticGraph` regenerates 5 of 25 types and fires only when the graph is empty — five families are PERSIST-OR-LOSE | C71 §5.4 · C70 I-INV-2 | `check-graph-persistence` | **CLOSED** | `[1]` **3/3**, checked both directions · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **GR-07** | the persist-or-lose list is PROSE with no gate — *a ledger in a document is not a ledger* | C71 §6 | `check-graph-persistence` | **CLOSED** | `[1]` **3/3** at a NAMED ledger (`graph-persistence-debt.json`) · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **GR-08** | `_rebuildSemanticGraph` exists in TWO byte-identical copies | C71 §5.3 | `check-graph-persistence` ARM D | **CLOSED** | ARM D measures **1** rebuild definition; gate `[1]` 3/3 · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **GR-09** | `CreateWallCommand` writes no graph edges at all | C71 §5.5 | `check-graph-runtime-readback` — SPAWNS H5 `graphruntime.cert` and asserts the `CreateWallCommand — sitsOn` case reads REACHED against a FRESH artefact | **CLOSED** | **GENERATED** — run `npx tsx tools/bim30-status/bim30-status.ts --row GR-09`; this row is no longer CARRIED | GATED 2026-08-17 — deciding instrument is now a runnable gate |
| **GR-10** | `deserialize` silently drops malformed edges — *a defect that self-erases on reload is a defect nobody can reproduce* | C71 §5.7 | `check-graph-persistence` ARM E | **OPEN** | `[1]` 3/3 — ARM E finding `deserialize/silent-malformed-drop` stands, ledgered; drops still neither counted nor reported · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **GR-11** | all three C71 gates are unbuilt at HEAD | C71 §6 | `check-gate-residency` — the three C71 §6 gates: file, run-all registration, verdict path | **CLOSED** | **GENERATED** — run `npx tsx tools/bim30-status/bim30-status.ts --row GR-11`; this row is no longer CARRIED | GATED 2026-08-17 — deciding instrument is now a runnable gate |
| **GR-12** | mutation-update on MOVE is UNPROVEN for every family; `boundedBy` after a boundary change is the most likely to be wrong | C71 §1.4 | `check-move-propagation` + H6 `graphmove.cert` | **OPEN** | `check-move-propagation` **3/3 → `[1]` 1/1**; H6 **16/16**; C79 §5.2's five-state channel no longer MEASURED-ABSENT. **Blocked on a schema, see §3.4** · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **GR-13** | room identity is recovered by centroid proximity (2.0 m), not preserved — move a bounding wall far enough and the room is destroyed | C70 C-INV-3 | `check-room-identity-survives-wall-move` | **CLOSED** | `[0]` **CLEAN, hard-0** — a 40 m wall move (20 m centroid shift) and identity survives, matched structurally on `boundingWallIds` · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **GR-14** | `RoomGraphService` returns `[]` for three distinguishable cases; two further read paths return `[]` unconditionally | C71 §4.4 · C70 L-INV-1 | `check-no-empty-means-unknown` | **OPEN** | `[1]` **63/63** — ledger 95 → 71 → 67 → 68 → **63**, shrink-only, five drain commits · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **GR-15** | `measuredAt`'s writer is broken — a positional 4-arg call against a 1-object signature, invisible because the global is `any` | C71 §5 | `check-source-verified-invariants` SV1 — the `measuredAt` writer calls the declared ONE-OBJECT signature (was 4 positional) | **CLOSED** | **GENERATED** — run `npx tsx tools/bim30-status/bim30-status.ts --row GR-15`; this row is no longer CARRIED | GATED 2026-08-17 — deciding instrument is now a runnable gate |
| **GR-16** | no `graph.*` bus verbs; the UBG has no runtime home | C70 D-INV-1/3 | `check-graph-query-verbs` — the three `graph.*` verbs are declared, the registrar is CALLED from production wiring (not merely exported), the spec is claimed by a vitest config, and it executes | **CLOSED** | **GENERATED** — run `npx tsx tools/bim30-status/bim30-status.ts --row GR-16`; this row is no longer CARRIED | GATED 2026-08-17 — deciding instrument is now a runnable gate |
| **GR-17** | the UBG's own header claims snapshot persistence it does not have | C71 §4 | `check-ubg-snapshot-derived` — no `ubg` key in either `ProjectSerializer` (the half the L2 suite declares it CANNOT measure), plus the cited suite executed and proven not dark | **CLOSED** | **GENERATED** — run `npx tsx tools/bim30-status/bim30-status.ts --row GR-17`; this row is no longer CARRIED | GATED 2026-08-17 — deciding instrument is now a runnable gate |
| **GR-18** | no runtime probe has ever been executed against a live graph — *a writer that exists and is never reached still reads ✅* | C71 §5.8 | `check-graph-runtime-readback` — SPAWNS H5 `graphruntime.cert`; freshness is a floor, and the NEVER-CREATED negative control must read NOT-REACHED or every verdict is void | **CLOSED** | **GENERATED** — run `npx tsx tools/bim30-status/bim30-status.ts --row GR-18`; this row is no longer CARRIED | GATED 2026-08-17 — deciding instrument is now a runnable gate |

### §2.3 — §2 · Propagation & prevState (owner: C72) — 13 rows

| Row | Claim | Contract | Deciding instrument | Status | Reading + date/SHA | Source of this status |
|---|---|---|---|---|---|---|
| **PR-01** | the dead cascade, arm A: four typed CustomEvents, zero listeners, `TODO(TASK-15)` on the dispatch line | C72 §2.1 | `check-propagation-reaches` | **CLOSED** | `[0]` **CLEAN, hard-0**, 4642 files · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **PR-02** | arm B: `StoreChangeEvent` carries no pre-mutation state; the resolver subscribes to the bus, not the stores | C72 §3.2 | `check-propagation-reaches` ARM B | **CLOSED** | `[0]` CLEAN — `prevState` reaches the emitter AND is declared on the payload · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **PR-03** | `prevState` is emitted by 5 stores out of ~120 `*Store.ts` files | C72 §3.1 | `check-prevstate-contract` | **CLOSED** | **NOT DETERMINED** by the row lane. ⚠ Its gate DID read `[0]` hard-0 in M1's HEAD estate sweep at `0ba90dc7` — see §7.6 | NOT RE-MEASURED — last known CLOSED 2026-08-14 |
| **PR-04** | `operation === 'delete'` returns `[]` — the operation with the largest fan-out computes nothing | C72 §2.3 · C70 F-INV-2 | `check-propagation-reaches` | **CLOSED** | `[0]` CLEAN over the wired event · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **PR-05** | `clearGraphAuthoritative` has 1 definition, 0 production callers — every generated level keeps its rooms suppressed by default | C72 §4.1, §4.3 | `check-source-verified-invariants` SV5 — `clearGraphAuthoritative` has >=1 production CALL SITE (the arm `check-suppression-is-reversible` S1 is blind to by design) | **CLOSED** *(moved OPEN → CLOSED)* | **GENERATED** — run `npx tsx tools/bim30-status/bim30-status.ts --row PR-05`; this row is no longer CARRIED | GATED 2026-08-17 — deciding instrument is now a runnable gate |
| **PR-06** | `initPersistence.ts` pauses the topology observer and sync-state engine with no `finally` — a throw leaves them off for the session | C72 §4.2 | `check-source-verified-invariants` SV2 — every `.pause()` in `initPersistence.ts` is released inside a `finally` | **CLOSED** | **GENERATED** — run `npx tsx tools/bim30-status/bim30-status.ts --row PR-06`; this row is no longer CARRIED | GATED 2026-08-17 — deciding instrument is now a runnable gate |
| **PR-07** | `RECONCILABLE_TYPES` names 13 types, is exported, has zero consumers; the real reconcile rebuilds walls and slabs only | C72 §5.1–5.2 | `check-source-verified-invariants` SV3 — `RECONCILABLE_TYPES` has a production consumer AND that consumer is called | **CLOSED** | **GENERATED** — run `npx tsx tools/bim30-status/bim30-status.ts --row PR-07`; this row is no longer CARRIED | GATED 2026-08-17 — deciding instrument is now a runnable gate |
| **PR-08** | `check-prevstate-contract` and `check-suppression-is-reversible` are specified and NOT BUILT | C72 §6 | `check-gate-residency` — the two C72 §6 gates: file, run-all registration, verdict path | **CLOSED** | **GENERATED** — run `npx tsx tools/bim30-status/bim30-status.ts --row PR-08`; this row is no longer CARRIED | GATED 2026-08-17 — deciding instrument is now a runnable gate |
| **PR-09** | no gate asserts the bespoke trackers still reach their pairs — *the propagation that actually works is ungated* | C72 §6.1.2 | `check-propagation-trackers-reach` | **CLOSED** | `[1]` **1/1** · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **PR-10** | roof → walls-beneath propagation is MEASURED-ABSENT in both directions | C72 §1.1 | `check-geometry-change-consumers` P1–P3 — the detector exists, `checkAndAnnounceRoofWallClashes` is reached through a TWO-HOP wiring chain (announcer ← subscribers ← launcher), and the cited suite executes. ⚠ shares an exit code with PR-12 | **CLOSED** | **GENERATED** — run `npx tsx tools/bim30-status/bim30-status.ts --row PR-10`; this row is no longer CARRIED | GATED 2026-08-17 — deciding instrument is now a runnable gate |
| **PR-11** | the wall→room cascade rule is authored and never registered, and the handler it would register is a no-op | C72 §2.2 | source census of `registerCrossHandlers` | **OPEN** | `registerCrossHandlers` exported from `plugins/cross/src/handlers/index.ts`, `plugins/cross/src/wall-room.ts` still dispatches; `room.recomputeBoundary` still empty · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **PR-12** | schedules have no geometry subscription — open panels show stale areas | C72 §1.1 | `check-geometry-change-consumers` P4–P5 — `SCHEDULE_GEOMETRY_EVENTS` is a FAMILY (floor 6, not the one event the fixture dispatched) and is actually attached, plus the staleness spec executes. ⚠ shares an exit code with PR-10 | **CLOSED** | **GENERATED** — run `npx tsx tools/bim30-status/bim30-status.ts --row PR-12`; this row is no longer CARRIED | GATED 2026-08-17 — deciding instrument is now a runnable gate |
| **PR-13** | three stores duplicated (Column / Door / Window) — any cascade wired to one is blind to the other | C72 §0.3 | `check-source-verified-invariants` SV4 — exactly one Column/Door/WindowStore authority file repo-wide | **CLOSED** *(moved OPEN → CLOSED; see §0.2 — it was already true at the last stamp)* | **GENERATED** — run `npx tsx tools/bim30-status/bim30-status.ts --row PR-13`; this row is no longer CARRIED | GATED 2026-08-17 — deciding instrument is now a runnable gate |

### §2.4 — §3 · Geometry determinism & tolerance (owner: C73) — 12 rows

| Row | Claim | Contract | Deciding instrument | Status | Reading + date/SHA | Source of this status |
|---|---|---|---|---|---|---|
| **GE-01** | there is no tolerance policy — 267 declarations, ≥8 distinct "a small number means equal" conventions spanning three orders of magnitude | C73 §2.1 | `check-epsilon-policy` | **OPEN** | `[3]` **324 vs declared 322** after two drains (357→338→322) · 2026-08-15. See §3.1 — this row has now re-reddened twice | RE-MEASURED 2026-08-15 |
| **GE-02** | point-in-polygon has ~71 named definitions across 116 files; 61 distinct ray-cast bodies | C73 §3.1 | `check-predicate-canonical` (C1 arm) | **CLOSED** ⚠ **CONTRADICTED AT HEAD** | last known `[0]` hard-0, no baseline. **Its own deciding gate reads `[3]` RATCHET EXCEEDED at `0ba90dc7`, C1 = 2 new point-in-polygon rivals** (`boundaryGuard.ts:86`, `ai-host/…/proceduralLayout.ts:55`) | NOT RE-MEASURED — last known CLOSED 2026-08-14; **see §6.4, this carry is actively contradicted** |
| **GE-03** | one file holds three copies of the even-odd ray cast with three different degenerate-divide guards — inside/outside/divide-by-zero for one polygon in one session | C73 §3.1 | `check-predicate-canonical` (C3 arm) | **CLOSED** ⚠ same gate is RED | last known C3 = 0. C3 specifically is not reported separately in the HEAD reading; the gate as a whole is `[3]` | NOT RE-MEASURED — last known CLOSED 2026-08-14 |
| **GE-04** | `WallIntersectionResolver` ×3 · `FloorPlanDiagnostics` ×2 · `RoomStore.ts` ×2 | C73 §3 | source re-measure of the four families | **CLOSED** | **NOT DETERMINED** — one of the pass's 10 delegated source verifications; no per-row reading was itemised | RE-MEASURED 2026-08-15 (reading not itemised) |
| **GE-05** | no general 2-D boolean — ≥5 independent half-plane clippers, no union primitive; *"merge two footprints" is not expressible* | C73 §3 | `polygonBoolean.ts` + its oracle suite | **CLOSED** | **NOT DETERMINED** at this pass | NOT RE-MEASURED — last known CLOSED 2026-08-14 (`3f004a58`) |
| **GE-06** | clash detection is a stub wearing a capability's clothes — 12 declared ids vs 12 toolbar ids, 3 in common, no handler, no detector | C70 L-INV-1 | source census of clash implementations | **OPEN** | **0 clash-engine implementations**; `clash-run` remains a registered id with no handler · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **GE-07** | three C73 gates specified and NOT BUILT | C73 §5 | `check-gate-residency` — the three C73 §5 gates EXIST and are REGISTERED (their readings are GE-01/02/03) | **CLOSED** | **GENERATED** — run `npx tsx tools/bim30-status/bim30-status.ts --row GE-07`; this row is no longer CARRIED | GATED 2026-08-17 — deciding instrument is now a runnable gate |
| **GE-08** | cross-machine determinism and GPU-side geometry are UNPROVEN — everything runs in one process on one architecture | C73 §5.4 | `check-cross-process-determinism` | **UNPROVEN** | **4 fixtures byte-identical across 3 processes** — and the gate's own scope block says this proves SAME-MACHINE cross-process only; §5.4b and §5.4c remain unreached · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **GE-09** | no gate asserts that a refusal is SURFACED to the user rather than caught and logged | C73 §4.4 | `check-refusal-identity` | **OPEN** | **71 findings at baseline 71** (arm A 38 / arm B 33); the walls family landed "fifth and last", 77→71 · 2026-08-15. See §3.2 | RE-MEASURED 2026-08-15 |
| **GE-10** | no `wall.split` verb id (⚠ the corpus was wrong that `wall.cut` was absent — it exists and is opening-aware) | C70 §3 | `SplitWall.ts` + the verb register | **CLOSED** | **NOT DETERMINED** at this pass | NOT RE-MEASURED — last known CLOSED 2026-08-14 |
| **GE-11** | the room spatial index is fed two incompatible AABB definitions — **a concave room can be missed.** A live correctness bug, not duplication | C73 §1 | `check-room-aabb-canonical` | **CLOSED** | `[0]` **CLEAN, hard-0** — ARM A reads 0 non-canonical · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **GE-12** | triangulation ×5, segment intersection ×7+, planar face tracing ×5 — a centroid-fan triangulation is silently wrong on concave input | C73 §3.1 | `check-triangulation-canonical` | **OPEN** | `[1]` **6/6**. The triangulation half is genuinely paid (7 bodies → 1 canonical). **C2 still reads 1 counted family with NO named canonical file** (`planar-topology-engine`) · 2026-08-15. See §3.3 | RE-MEASURED 2026-08-15 |

### §2.5 — §4 · Constraint honesty (owner: C74) — 12 rows

| Row | Claim | Contract | Deciding instrument | Status | Reading + date/SHA | Source of this status |
|---|---|---|---|---|---|---|
| **CO-01** | the named mock — `PlanegcsAdapter` declares `readonly kind = 'planegcs'` while delegating every call to `MockSolver` | C74 §3.1–3.2 | source verification + `check-no-hidden-mock` | **CLOSED** | **NOT DETERMINED** at this pass | NOT RE-MEASURED — last known CLOSED 2026-08-14 (`c084f5ba`) |
| **CO-02** | the silent fallback — `loadSolver()` returns `MockSolver` on both paths; supplying `PLANEGCS_WASM_URL` changes nothing | C74 §3.3 | `check-solver-is-real` | **CLOSED** | **NOT DETERMINED** by the row lane. ⚠ Its gate DID read `[0]` hard-0 in M1's HEAD sweep at `0ba90dc7` — see §7.6 | NOT RE-MEASURED — last known CLOSED 2026-08-14 |
| **CO-03** | the 31-of-33 passing tests test the MOCK — they inject the field whose own docstring says production must not pass it | C74 §3.5–3.6 | `check-no-hidden-mock` | **CLOSED** | `[1]` **9/9** with **0 FINDING M-C** · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **CO-04** | `planegcs` is not a dependency of any workspace — there is no WASM module to bind, at any version | C74 §4.1, §4.5 | `grep '"planegcs"' --include=package.json` | **OPEN, and correctly unauthorised** | **0 hits repo-wide.** C74 §4.5 forbids solver work until a constraint family proves it needs solving; the cheapest next action is **correctly none** · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **CO-05** | `createWorkerHandler` has zero production callers — 10 hits, all definition/barrel/doc/test | C74 §3.8 | source re-measure | **CLOSED** | **NOT DETERMINED** at this pass | NOT RE-MEASURED — last known CLOSED (DELETE terminal state reached 2026-08-12) |
| **CO-06** | the scaffold is undated and its two halves disagree — *a scaffold whose retirement date is untracked is permanent architecture nobody chose* | C74 §3.4 | `check-no-hidden-mock` (M-B) | **OPEN** | `[1]` **9/9** — nine scaffolds carry no date, no owner and no retiring assertion. **Credit separately: the `[3]` STALE LEDGER red named at the last restamp is CLEARED** · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **CO-07** | `StairValidationAuthority` exists twice; the copy with zero production importers can drift from shipped behaviour with a green suite | C74 §2.2 | source census | **CLOSED** | **NOT DETERMINED** — delegated source verification, reading not itemised | RE-MEASURED 2026-08-15 (reading not itemised) |
| **CO-08** | no constraint family carries a §1.1 classification — VALIDATION / ENFORCEMENT / ADVISORY / SOLVING is written nowhere | C74 §1.3, §4.2 | `check-constraint-honesty` | **CLOSED** | `[1]` **2/2** · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **CO-09** | no model-space constraint store — `annotationConstraints` is the only persisted family, checked and never solved | C74 §4.2 | one executable test naming `StairValidationAuthority` at its declared VALIDATION strength | **OPEN, correctly deferred** | blocked on CO-08 reaching §4.2(c) with evidence; one family has evidence, the rest do not · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **CO-10** | violations are log lines, not queryable model state — `violates` + `constraintAdapter` are dev-only reachable | C70 G-INV-3 | source census of `provideLiveGraphSources` callers | **CLOSED** | **NOT DETERMINED** at this pass | NOT RE-MEASURED — last known CLOSED 2026-08-14 (`AIAreaLayout.ts:317`) |
| **CO-11** | all three C74 gates are UNBUILT | C74 §6 | `check-gate-residency` — the three C74 §6 gates EXIST and are REGISTERED (their readings are CO-01/03/06/08/12) | **CLOSED** | **GENERATED** — run `npx tsx tools/bim30-status/bim30-status.ts --row CO-11`; this row is no longer CARRIED | GATED 2026-08-17 — deciding instrument is now a runnable gate |
| **CO-12** | no gate enumerates the `./compliance` registry's rules — only its wiring is checked | C74 §6.3 | `check-constraint-honesty` (G-INV-2) | **CLOSED** | `[1]` **2/2**, G-INV-2 enumerates the registry · 2026-08-15 | RE-MEASURED 2026-08-15 |

### §2.6 — §5 · Provenance (owner: C75) — 8 rows · **NOT ONE WAS RE-MEASURED**

⚠ **All eight provenance rows are carried.** The C75 gates were in M1's HEAD estate sweep (§4) but
were not attributed row-by-row, and **PV-04's IFC surface is lane A5's live territory this
session** — attributing from here would be guessing. Read this block as *last known*, nothing more.

| Row | Claim | Contract | Deciding instrument | Status | Reading + date/SHA | Source of this status |
|---|---|---|---|---|---|---|
| **PV-01** | provenance is INVENTED at deserialisation — a missing field loads as `'auto-topology'`, *the most authoritative member of the union*, and an `as any` defeats the type at exactly the point that would have caught it | C75 §2.1 | `check-provenance-not-invented` | **CLOSED** | **NOT DETERMINED** by the row lane; gate read `[1]` **2/2** in M1's HEAD sweep at `0ba90dc7`, unattributed | NOT RE-MEASURED — last known CLOSED 2026-08-14 |
| **PV-02** | element schemas carry NO provenance — `originDetail`, `derivationStatus`, `detectionMethod` all 0 hits across `packages/schemas` | C75 §2.4 | `check-provenance-coverage` | **CLOSED** | **NOT DETERMINED**; gate PASSED in M1's HEAD sweep, unattributed. Last known ledger **28 → 1** | NOT RE-MEASURED — last known CLOSED 2026-08-14 |
| **PV-03** | the repair path stamps INVENTED geometry as DETECTED — `repairToSimplePolygon()` substitutes a ring topology never traced, then writes the detected `detectionMethod` | C75 §2.3 | `check-provenance-not-invented` | **CLOSED** | **NOT DETERMINED** at this pass | NOT RE-MEASURED — last known CLOSED 2026-08-14 (`7b015805`) |
| **PV-04** | no export mapping exists — how AUTHORED/OBSERVED/COMPUTED/INFERRED/REGENERATED land in IFC or DXF is undefined. **The contract names this its own largest open risk** | C75 §7.7 | `check-provenance-export-boundary` | **CLOSED** | **NOT DETERMINED.** ⚠ **Its gate is one of the 13 that run in NO runner** (§5) — nothing has defended this closure since it was made | NOT RE-MEASURED — last known CLOSED 2026-08-14; IFC surface is lane A5's live territory |
| **PV-05** | `ProvenanceStore` (C23 AI lineage) is not persisted at all — destroyed on every reload | C70 I-INV-2 | the serializer's `provenance` slice + suite | **CLOSED** | **NOT DETERMINED** at this pass | NOT RE-MEASURED — last known CLOSED 2026-08-14 (`a5211b46` + `8cab70c1`) |
| **PV-06** | `confidence` has zero hits repo-wide on the element side, while site/context/climate/zoning carry mandatory confidence | C75 §1.3 (C62 owns confidence) | schema census | **CLOSED** | **NOT DETERMINED** at this pass | NOT RE-MEASURED — last known CLOSED 2026-08-14 (`d3c69ee7`) |
| **PV-07** | all three C75 gates are UNBUILT; per-kind coverage is therefore UNPROVEN, not zero | C75 §6 | `check-gate-residency` — the three C75 §6 gates EXIST and are REGISTERED (their readings are PV-01/03/06) | **CLOSED** | **GENERATED** — run `npx tsx tools/bim30-status/bim30-status.ts --row PV-07`; this row is no longer CARRIED | GATED 2026-08-17 — deciding instrument is now a runnable gate |
| **PV-08** | `detectionMethod` is three non-unified enums across the one family that has provenance | C75 §1.2 | `check-provenance-coverage` (PV-08 arm) | **CLOSED** | **NOT DETERMINED** at this pass | NOT RE-MEASURED — last known CLOSED 2026-08-14 (hard-0 at `a75e8e1e`) |

### §2.7 — §6 · Model truth, verbs & identity (owners: C70, ADR-0318, C69) — 10 rows

| Row | Claim | Contract | Deciding instrument | Status | Reading + date/SHA | Source of this status |
|---|---|---|---|---|---|---|
| **MT-01** | `wall.create` / `slab.create` are readback-negative and `room.create` dispatch-throws — the plugin handlers write DTO stores nobody reads | C70 A-INV-3 · ADR-0318 | CA-21 read-back census | **CLOSED** | **NOT DETERMINED** at this pass | NOT RE-MEASURED — last known CLOSED 2026-08-14 (`7f380fbe`, `80845b3e`) |
| **MT-02** | `view.create` raises a TypeError; `sheet.create` / `schedule.create` / `hierarchy.createSite` are registered verbs no handler answers | C69 · C70 L-INV-1 | `check-verb-register` | **CLOSED** | **exit 0** at `3afcac71`, *"API-VERB-REGISTER.md matches the code, both directions"* — **re-run by this document**, §4.4. ⚠ The gate was a REGRESSION at `0ba90dc7`, fixed at `3afcac71` | RE-MEASURED 2026-08-15 |
| **MT-03** | 9 SHADOWED verbs remain (14→9 at close-out); a bridge is the designated winner in every case | C69 | `check-verb-register` | **CLOSED** *(moved OPEN → CLOSED)* | **`SHADOWED (dead route): 0`** — the class the list was minted to hold is EMPTY · 2026-08-15, re-confirmed exit 0 at `3afcac71` | RE-MEASURED 2026-08-15 |
| **MT-04** | 11 store kinds remain unadopted by the ADR-0318 registry — ABSENT-headless, present in-browser via `registerAllStores` | ADR-0318 I-3 | `adr0318.stores.probe.ts` | **OPEN** *(moved UNPROVEN → OPEN, and NOT to closed)* | probe **10/10** → headless ABSENT **exactly 11** (roof, ceiling, floor, furniture, plumbing, stair, column, curtainwall, grid, beam, handrail); PRESENT beyond door/window = **0** · 2026-08-15. See §3.10 | RE-MEASURED 2026-08-15 |
| **MT-05** | `engineLauncher` hands `window.columnStore ?? columnStoreInstance` to the serializer while registering the instance — if the global is ever a different object, registry and serializer identity diverge | ADR-0318 I-1 | a heap-identity probe — **does not exist** | **UNPROVEN** | both `??` fallbacks live at `engineLauncher.ts:866/868`; `mt05WindowStoreSameInstance.spec.ts` **3/3** pins the strings and **cannot see the heap** · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **MT-06** | `persist:opening` is MISCONFIGURED for its kind; openings have two authoritative copies (`OpeningStore` + `WallData.openings[]`) | C70 A-INV-1 | source census of the rival stores | **OPEN** | rival stores both exist; **the single authority has never been declared and the loser never deleted** · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **MT-07** | three rival level records — `WallStore` levels vs `packages/stores` `LevelStore` vs the hierarchy — and wall `baseLine[*].y` stores absolute world Y | C70 A-INV-1 | source census | **OPEN** | ⚠ **FOUR rivals, not three** — `plugins/plan-view/src/LevelStore.ts` is a fourth the row never counted · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **MT-08** | the undo gesture race — pinned RED-BY-DESIGN by 3 `it.fails` at the 250 ms window | C70 §3.1 | source verification | **CLOSED** | **NOT DETERMINED** at this pass | NOT RE-MEASURED — last known CLOSED 2026-08-14 (`774a91e6`, *"a gesture is an identity, not a stopwatch reading"*) |
| **MT-09** | 27 packages fail isolated compilation, masked by root `skipLibCheck` and surfaced only when the compile gate was un-blinded | C70 §0 | `check-per-package-compile` | **OPEN** | **85 compiled / 9 skipped / 26 failed** (first reading 27). The gate **exits 1 and does block** — `check-per-package-compile.ts:258` is `process.exit(1)` inside the `anyFailed` branch · 2026-08-15. See §6.2 and §7.2 | RE-MEASURED 2026-08-15 (~25 min run) |
| **MT-10** | 8 post-freeze XSS sites | — (security; owned by territory) | `check-xss-guards` | **OPEN at the pass reading** ⚠ **superseded post-pass, restamp owed** | pass reading: `[3]` — OverridePanel **1 → 3** unescaped `${}` into innerHTML, from `799255c0`. **Fixed at `0064df08`. This document re-ran the gate at `3afcac71`: exit 0, *"no new unguarded HTML-sink interpolations"*, 547 baselined findings across 142 files, 4645 scanned** (§4.4). The row is counted OPEN because the distribution in §1.1 is the pass's; the next recount closes it | RE-MEASURED 2026-08-15, then re-run at `3afcac71` |

### §2.8 — §7 · Collaboration (owner: C70 pillar K, C08, C66) — 5 rows

| Row | Claim | Contract | Deciding instrument | Status | Reading + date/SHA | Source of this status |
|---|---|---|---|---|---|---|
| **CB-01** | Leg C is not deployed — no CRDT transport exists in any environment. Collaboration is UNPROVEN on every certification row **by construction**, capping every row at PARTIALLY VERIFIED | C70 K-INV-3 | `check-two-client-convergence` | **OPEN — founder-blocked** | arms 1–3 CLEAN: **3 properties, 2 independently composed clients, 8 crossings, both controls fired**. Refused on the gate's own SCOPE · 2026-08-15. See §3.9 | RE-MEASURED 2026-08-15 |
| **CB-02** | `PgAuthz` has not been written, `MemoryAuthz.addMember()` is called nowhere in production, `project_members` exists with nothing hydrating it | C08 | source measure | **OPEN** | ⚠ **two of three headline claims are now FALSE**: `PgAuthz.ts` exists and is wired (`policies.ts:140`, on `PRYZM_AUTHZ_MODE=pg`); `project_members` IS in `dbMigrate.js:120`. **Still open: `MemoryAuthz.addMember` has 0 production callers — nothing hydrates membership** · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **CB-03** | `check-collab-graph-integrity` lives in `tools/ga-gate/`, not beside the BIM 3.0 certification gates — two suites with two exit-code implementations | C70 §7.2 | the gate-residency rule (READINESS-GATES §2.1) | **CLOSED** | **NOT DETERMINED** at this pass | NOT RE-MEASURED — last known CLOSED 2026-08-14 (residency is by declared design) |
| **CB-04** | conflict-surfacing has NO gate at all — C70 K-INV-2 is unmeasured by anything | C70 K-INV-2 | `check-conflict-surfacing` | **CLOSED** | `[0]` **CLEAN, hard-0** over **309 real merges** · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **CB-05** | the RAC's strongest capabilities are its least syncable — late-bound `'all'` subjects (P1-10) | C08 | per-capability convergence proofs | **UNPROVEN** | blocked behind CB-01, by construction · 2026-08-15 | RE-MEASURED 2026-08-15 |

### §2.9 — §8 · Certification & gates (owner: C70 §5, §7) — 6 rows

| Row | Claim | Contract | Deciding instrument | Status | Reading + date/SHA | Source of this status |
|---|---|---|---|---|---|---|
| **CE-01** | 6 of the 10 gates C70 §7 names have no file at HEAD | C70 §7.1 | the six named gates | **CLOSED** | all six exist and were EXECUTED · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **CE-02** | the Geometry axis is UNPROVEN everywhere headlessly — no fragment builders run in the certification harness | C70 §6.1 | the harness's geometry subject | **CLOSED** | **NOT DETERMINED** at this pass | NOT RE-MEASURED — last known CLOSED 2026-08-14 (`221fdef7`) |
| **CE-03** | browser I/O is uncertified — IndexedDB / Supabase / autosave are never exercised | C05 | `persistence.cert.ts` CE-03 arm | **UNPROVEN, narrowed** | a real arm EXISTS and PASSES (`persistence.cert.ts:339`) — and the harness's own words are *"fake-indexeddb, a shim, not a browser"*, measuring *"the LOCAL IndexedDB tier only"*. Supabase + autosave unexercised · 2026-08-15. See §3.7 | RE-MEASURED 2026-08-15 |
| **CE-04** | the unified `performUndoRedo` path is uncertified — the legacy stack only | C03 §4.5–4.8 | `undoredo.cert.ts` CE-04 block | **CLOSED** *(moved UNPROVEN → CLOSED; see §0.2 — already true at the last stamp)* | **44/44** — certify-enrolled, drives real `performUndo()`/`performRedo()` down both legs against the seeded world under one whole-store comparator, with a negative control · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **CE-05** | static discovery counts authored-but-unreached code as present — no gate answers the REACHABILITY question, the one this repository keeps failing | C70 §4.2 | a gesture-reachability instrument — **does not exist** | **OPEN** | the gate's own notMeasured block names it: **~120 `apps/editor/src/ui` files call `executeCommand`, inventoried nowhere** · 2026-08-15 | RE-MEASURED 2026-08-15 |
| **CE-06** | an executed run proves the SEEDED FIXTURE, not the user's project; every non-collaboration gate is single-client by construction | C70 §7.3 | a real user project as certification subject | **UNPROVEN** | `check-derived-classification` `[1]` **1/1** prints *"THE SEED, NOT THE USER'S PROJECT"* in its own output · 2026-08-15. **Correctly unclosable — a one-client fixture cannot prove a multi-client claim** | RE-MEASURED 2026-08-15 |

### §2.10 — Implementation-type distribution (over 86 type-instances)

**The distribution IS the argument.** WIRING · RETENTION · EXPOSURE · INVARIANT dominate, and that
is a finding about PRYZM, not a coincidence: the signature hazard here is **authored-but-unwired**.
**An audit of *existence* passes in this repository; an audit of *reachability* is the one that
fails.**

| Implementation type | Count | Reading |
|---|---|---|
| **INVARIANT** | 48 | the behaviour exists and is right *sometimes*; a rule, gate or refusal makes it right *always*. Roughly half are the gates themselves |
| **WIRING** | 18 | authored-but-unwired — the signature hazard |
| **MISSING PERSISTENCE** | 6 | provenance fields, the persist-or-lose ledger, the constraint store |
| **MISSING VERB** | 4 | `wall.split` · registered ids no handler answers · the graph verbs · the clash ids |
| **MISSING ALGORITHM** | 3 | 2-D boolean · clash engine · the roof-clash detector |
| **MISSING COLLABORATION** | 3 | transport · authz · per-capability convergence |
| **RETENTION** | 2 | `prevState` on `StoreChangeEvent`; `prevState` at the remaining stores |
| **EXPOSURE** | 1 | the UBG → `composeRuntime` slot and the three graph verbs |
| **MISSING SOLVER** | 1 | and it is **unauthorised** — C74 §4.5 stands |
| **ARCHITECTURAL CHANGE** | **0** | — |

> **Say it loudly, because it is the headline. ARCHITECTURAL CHANGE is EMPTY.** Eighty-two rows of
> measured defects spanning six contracts and every one of the twelve pillars, and **not one
> requires replacing a subsystem.** The single replacement candidate anyone proposed — merging the
> dual edge vocabulary (SemanticGraph's 25 types vs the UBG's 10) — was **considered and
> rejected**, because it would break snapshot v3 for every persisted project in exchange for a
> naming preference (C71 §4.1).
>
> **The corollary is a warning, not a comfort.** A repository whose entire defect list is wiring
> and invariants is one where **reading the code will always look better than running it.** That
> is precisely the condition under which fifteen gates went green-and-blind, a compile gate
> fabricated ~90 PASS lines per run for its entire life, and an **empty seed scored better than
> any real run**. The absence of architectural change **raises** the value of the gates; it does
> not lower it.

### §2.11 — Coverage matrix, one row per capability domain (carried from the register's §10)

*CURRENT cells are cited, never inferred. This table's readings are the register's; they were not
re-taken in this pass and are marked accordingly at the foot.*

| # | Domain | TARGET | CURRENT (as last measured) | GAP (row ids) | GATE |
|---|---|---|---|---|---|
| 1 | **Model truth** | one authoritative store per kind, named by the composition root | ADR-0318 slot live; door/window headless-authoritative by design; 11 kinds ABSENT-headless | MT-01…07 | CA-21 census + `check-identity-roundtrip` store-reach floor |
| 2 | **Identity** | id + GUID byte-stable across save/reload/undo/redo/export | **HOLDS** — 17/17 kinds keep id and GUID | — | `check-identity-roundtrip` ✅ |
| 3 | **Persistence** | authoritative byte-for-byte, derived equivalent, incidental enumerated | 0 FAILED; exclusions enumerated per ADR-0319 | MT-06, CE-03 | identity-roundtrip + derived-regenerable ✅ · **browser I/O ⛔ UNMAPPED** |
| 4 | **Topology** | REQUIRED families with writer + typed reader + rebuild + mutation-update on delete **and** move | 4 HEALTHY of 25 declared; junctions now retained | GR-01, 04, 05, 06, 09, 12, 13 | topology-survives ✅ · graph-write-coverage ✅ (both now exist) |
| 5 | **Graph** | one canonical query vocabulary, exposed as refusal-honest bus verbs | *machinery yes, exposure no* → GR-16 closed; UBG still not persisted | GR-14, 16, 17 | graph-write-coverage ✅ |
| 6 | **Geometry** | deterministic consequence of state; one predicate per family under one epsilon policy | **determinism YES — the strongest finding in the assessment**; substrate duplicated and unguarded | GE-01…12 | epsilon-policy 🔴 · predicate-canonical 🔴 · deterministic-regeneration 🔴 |
| 7 | **Propagation** | every declared cascade has a live listener AND a `prevState`-carrying emitter | generic cascade wired; **bespoke spine works and earns Level 4** | PR-01…13 | propagation-reaches ✅ · prevstate-contract ✅ · suppression-is-reversible ✅ · trackers-reach ✅ |
| 8 | **Constraints** | declared rules at proven strengths; adapters truthful; violations queryable | four real components; **the solver is a mock** | CO-01…12 | constraint-honesty ✅ · solver-is-real ✅ · no-hidden-mock ✅ |
| 9 | **Spatial reasoning** | the eight topology questions as lookups where retention permits | 2 of 8 genuine indexed lookups | GE-11, GR-04, GR-16 | topology-survives ✅ (AABB now hard-0 under room-aabb-canonical) |
| 10 | **Provenance** | five-value vocabulary, never invented, repair legible | one family of ten, outside `packages/schemas`, invented on load | PV-01…08 | the three C75 gates ✅ · **export mapping ⛔ runs in no runner (§5)** |
| 11 | **Regenerability** | rebuild ≡ restored snapshot; persist-or-lose named and shrinking | rebuild is a slice (5 of 25) | GR-06, 07, 08, PV-05 | derived-regenerable ✅ · graph-persistence ✅ |
| 12 | **Algorithmic generation** | deterministic engines through commands, with provenance and typed refusals | complete and grep-confirmed AI-clean; production ships with no AI key | PR-05, PV-02 | topology-survives over a generated fixture ⛔ |
| 13 | **Query / reasoning** | certified read paths; failure ≠ empty everywhere | three named `[]`-conflation sites; the ledger reads 63 | GR-14, 16 | `check-no-empty-means-unknown` — **runs in no runner (§5)** |
| 14 | **Collaboration** | concurrent edits converge with topology intact; conflicts explicit | **UNPROVABLE — no transport.** C66: 0 tiers HELD | CB-01…05 | collab-graph-integrity ✅ exists, **blocked on CB-01** |
| 15 | **AI boundary** | the LLM sits above the model, never underneath | **YES** — read-only default, zero-token deterministic tiers, no AI key in production | GR-16, PV-02 | RAC ladder probes ✅ + CA-21 rows per AI-reachable verb |
| 16 | **Certification** | every claim in 1–15 is an EXECUTED claim | harness real, falsifiability proven per row, four-exit-code contract live, empty-seed impossibility landed (`e5addac8`) | CE-01…06 | this domain **is** the gate suite |

> **§2.11a — the 13 UNMAPPED entries. An unmapped anything blocks readiness.** These are not "low
> priority" — they are **holes in the instrument**, and a domain with an unmapped gate cannot be
> scored at all. **6 GATE · 1 GATE+IMPL · 1 IMPL+GATE · 4 TEST · 2 TARGET:** move-time invalidation
> (GR-12) · the bespoke propagation trackers (PR-09) · conflict-surfacing (CB-04) · refusal
> reachability at the UI (GE-09) · the `./compliance` rule set (CO-12) · clash detection (GE-06,
> gate + implementation) · provenance export mapping (PV-04, implementation + gate) · runtime
> reachability of graph writers (GR-18, CE-05) · browser I/O persistence (CE-03) · cross-machine
> determinism and GPU geometry (GE-08) · the unified `performUndoRedo` path (CE-04) · **TARGET:
> whether `metadata.version` should be persisted at all and whether `_renderVersion` belongs on
> the model** (ADR-0319, "Not decided here") · **TARGET: does the layer model extend to the
> backend?** (eight backend packages have no layer at all).
>
> ⚠ **Four of those thirteen have since gained instruments** (GR-12's move-propagation arm,
> PR-09's trackers-reach gate, CB-04's conflict-surfacing gate, CE-04's cert block) and the
> statuses in §2 reflect that. **The two TARGET rows are open QUESTIONS nobody has answered**, and
> they are not defects — they are decisions nobody has taken.
>
> **The bounded good news, stated because it is real: every unmapped entry above is an instrument
> to build, not an architecture to replace.**

---

## §3 — THE TEN REFUSED CLOSE-CLAIMS

**This is the highest-value section in the file.** Each of these is a case where a lane was briefed
that a row was closable, or a commit subject said it was closed, and **the instrument said
otherwise**. Where a brief, a commit subject and a gate disagree, **the gate decides, every time**
(C70 §0.2).

### §3.1 — GE-01 · the epsilon fence
Two drains landed (**357 → 338 → 322**) and `check-epsilon-policy` still reads **`[3]` 324 against
a declared 322**. This is the same shape as the previous restamp's 359-vs-357: **features mint
declarations faster than drains retire them.** The two newest are
`apartment-layout/boundaryGuard.ts:CHAIN_EPS_M` and `roomFacadeMetrics.ts:ON_WALL_PERP_TOL_MM` —
both from this session's own feature work.

> **Draining does not close this row; a LANDING GATE does.** The row has now re-reddened twice by
> the same mechanism. Any further drain without a landing arm is buying a green that a feature PR
> will spend.

### §3.2 — GE-09 · refusal identity
The walls family landed, described as "fifth and last", and moved the baseline **77 → 71**. The
gate reads **71 findings at a baseline of 71**.

> **Seventy-one refusals still do not carry identity. Green-as-a-ratchet ≠ closed.** A gate sitting
> exactly at its declared level is a gate that is *not getting worse*. It is not a gate saying the
> defect is gone.

### §3.3 — GE-12 · triangulation
`check-triangulation-canonical` reads **`[1]` 6/6**, and **C2 still reads 1 counted family with NO
named canonical file** (`planar-topology-engine`). The triangulation half is genuinely paid — 7
bodies collapsed to 1 canonical with an oracle test.

> **The row is two families and one of them is untouched BY DESIGN** (C73 §3.5: one family per PR).
> Closing on the paid half would score half a row as a whole one.

### §3.4 — GR-12 · move propagation · **the biggest genuine movement, and it still does not close**
`check-move-propagation` went **3/3 → 1/1**, and C79 §5.2's five-state channel is **no longer
MEASURED-ABSENT** — three re-derivations now report `preserved` / `resized` / `conflicted`, and
`preserved` is distinguishable from `undetermined` at the caller. **Two of the previous restamp's
three reasons are dead.**

> **The survivor kills the close, verbatim:**
>
> **`RoofTypes.ts` declares NO field that can carry a boundary reference, and
> `schemas/elements/Roof.ts` types `boundary` as `Vec3[]` — so Zod strips a reference before it can
> transit the bus. Roof cannot follow.**
>
> Also open: C79 §10.6 — **no USER-facing surface carries the refusal.** A `console.warn` is a
> developer trace, not a refusal a user can act on.

The fix is a two-layer change (L0 + geometry-roof): add an optional `hostReference` to
`RoofFootprint` **and** widen `schemas/elements/Roof.ts`'s `boundary` so Zod stops stripping it.
Additive-optional avoids a snapshot break.

### §3.5 — GR-14 · empty-means-unknown
Five drain commits; `check-no-empty-means-unknown` reads **`[1]` 63/63** (95 → 71 → 67 → 68 → 63,
shrink-only every time).

> **Its own UNPROVEN block stands and is carried verbatim because it bounds every number above:**
> ARM C carries **residual doubt by design**; whole-store enumerations are excluded as honest
> empties; the scope is **name-shaped**, so a relationship question asked in other vocabulary is
> invisible to it; and it is **static only** — a site returning `[]` and a caller that would have
> refused correctly are indistinguishable to it. **It under-reports and never over-reports. That is
> the safe direction for a ratchet and it is NOT completeness.**

### §3.6 — CO-06 · hidden mocks
`check-no-hidden-mock` reads **`[1]` 9/9**. Nine scaffolds carry no date, no owner and no retiring
assertion. **Credit separately and explicitly: the `[3]` STALE LEDGER red named at the previous
restamp is CLEARED.**

### §3.7 — CE-03 · browser I/O · **the laundering refusal**
A real certification arm exists and passes (`persistence.cert.ts:339`). The harness's own words:
the substrate is *"fake-indexeddb, a shim, not a browser"*, measuring *"the LOCAL IndexedDB tier
only"*. Supabase and autosave are unexercised.

> **Closing "browser I/O uncertified" on a Node shim is the laundering C70 §0.1 forbids.** Stays
> UNPROVEN, narrowed. An executed unit suite is evidence; it is never certification.

### §3.8 — CB-02 · authz
Two of three headline claims are now **FALSE in the healthy direction**: `PgAuthz.ts` exists and is
wired (`policies.ts:140`, under `PRYZM_AUTHZ_MODE=pg`), and `project_members` **is** in
`dbMigrate.js:120`. **Still open: `MemoryAuthz.addMember` has 0 production callers — nothing
hydrates membership.** Under the CB deferral regardless.

### §3.9 — CB-01 · two-client convergence · **refused on the gate's own scope**
Arms 1–3 are clean: 3 properties, 2 independently composed clients, 8 crossings, both controls
fired. Refused anyway, quoting the gate:

> *"the wire here is SIMULATED … production still runs socket.io last-writer-wins … C8 remains
> FAIL — BLOCKED on the founder decision."*

A gate that proves a property over a simulated substrate has proved something about the code, not
about the deployment.

### §3.10 — MT-04 · store adoption · **the rule that also held GE-12 open**
The `adr0318.stores.probe.ts` measured **exactly the claimed 11** headless-ABSENT kinds, with
PRESENT-beyond-door/window = 0. The row moved **UNPROVEN → OPEN**, not to CLOSED.

> **An instrument that COUNTS a gap is not a CLOSURE of it.** This is the same rule that held
> GE-12 open at the previous stamp, and it is the rule most often bent when a lane is under
> pressure to show movement.

---

## §4 — THE GATE ESTATE

One `npx tsx tools/ga-gate/run-all.ts` at `0ba90dc7`. **60 verdict lines = 58 ga-gate files + 2
registered certification gates. Suite tally 37 passing / 23 failing.**

> ⚠ **How the Exit column was captured — read this before quoting it.** Every exit code below is
> **the runner's own per-gate classification, printed by `run-all.ts` from the child process it
> spawned**, read out of the captured log. It is **not** a shell `$?` harvested per gate, and it is
> **not** piped. The runner's own AGGREGATE exit (reported as 1 / BLOCKED) was **not** captured by
> this document and is marked **NOT DETERMINED** rather than copied. See §7.2 — this distinction is
> not pedantry; the pass came within one sentence of publishing a fake gate-honesty scandal over
> exactly it.

### §4.1 — RED at HEAD — 11 (10 exit-3 ratchet breaches + 1 unledgered regression)

All are genuine HEAD readings; none is in lane A5's or A7's uncommitted set.

| Gate | Exit | Reading | Cause | Owner | Status now |
|---|---|---|---|---|---|
| `xss-sink-scan` | 3 | OverridePanel **1 → 3** unescaped `${}` into innerHTML | from `799255c0` | apps/editor/src/ui | ✅ **FIXED `0064df08`** — re-run here, exit 0 (§4.4) |
| `verb-register` | 1, REGRESSION (no ledger) | API-VERB-REGISTER.md stale by 2 lines; **hard-0 with NO ledger** | derived doc artefact | docs artefact | ✅ **FIXED `3afcac71`** — re-run here, exit 0 (§4.4) |
| `secrets-register` | 3 | **13 vs 12** — the extra was an unledgered `DRIFT::` row for the register doc itself | derived doc artefact | docs artefact | ✅ **FIXED `3afcac71`** — re-run here, `[1]` 12/12 (§4.4); **12 real findings remain OPEN** |
| `epsilon-policy` | 3 | **324 vs 322** | new: `apartment-layout/boundaryGuard.ts:CHAIN_EPS_M`, `roomFacadeMetrics.ts:ON_WALL_PERP_TOL_MM` | **this session's own feature work** | OPEN |
| `predicate-canonical` | 3 | C1 = **2 new point-in-polygon rivals** | `boundaryGuard.ts:86`, `ai-host/…/proceduralLayout.ts:55` | **this session's own work** | OPEN — and it contradicts GE-02's carry, §6.4 |
| `otel-spans` | 3 | Zone B **55 uninstrumented of 64** vs baseline 52 | 3 new exports: `FloorRegionOverlap.ts`, `refusal/childRefusalText.ts`, `walls/CascadeWallBaselineCommand.ts` | **this session's own work** | OPEN |
| `declared-project-scopes` | 3 | **43 vs 41** | 2 new module-level project-scoped files: `ui/ai/OpenedRegionProposal.ts`, `ui/ai/WallMoveClashProposal.ts` | **this session's own work** | OPEN |
| `cast-count` (P4) | 3 | **6 vs 4 scoped** (repo-wide 209/215) | `LinearDimThirdClickOffset.spec.ts` ×3, `schedulePanelGeometryStaleness.spec.ts` ×2, `PlanViewToolOverlay.ts` ×1 | apps/editor engine | OPEN |
| `cast-unknown` (P4/L-845) | 3 | **211 vs 210** `window as unknown as` | — | apps/editor + packages | OPEN |
| `custom-event-packages` | 3 | **124 vs 122** | — | packages (core-app-model heavy) | OPEN |
| `deterministic-regeneration` | 3 | **STALE LEDGER — 21 pinned `file:line` rows no longer measured** (was 16) | line-number drift in `DoorSystemTypeStore` / `WindowSystemTypeStore` / `SlabFragmentBuilder` | geometry-door/window/slab | OPEN — see §6.1 |

> ### ⭐ **FIVE OF THE ELEVEN WERE MINTED BY THIS SESSION'S OWN FEATURE WORK**
>
> epsilon ×2 · predicate ×2 · otel ×3 · declared-scopes ×2. Not one of them is old debt surfacing;
> all four gates were at or below their level before this session's features landed.
>
> **The structural conclusion, and it is the whole point of this section: each drain gate needs a
> LANDING ARM, not more draining.** A drain buys a green that the next feature PR spends. A landing
> arm — a check that refuses a NEW declaration/rival/uninstrumented export at the door — is what
> makes the drain durable. Budget a re-drain at the **END** of a feature lane, never only at the
> start.

### §4.2 — 27 hard-0 invariants PASSING — the real guarantees

| Gate | Reading |
|---|---|
| `raf-count` (P3) | 1 owner, 4830 files scanned |
| `three-imports` (P2) | 0 outside `renderer-three`, 6825 files |
| `engine-bootstrap-loc` (P1) | 0 (file absent) |
| `motion-gate-coverage` (P8) | hard-0 |
| `ctrl-z-wired` (C03/Wave36) | hard-0 |
| `project-isolation-gate` (C13) | 4/4 |
| `no-workspacemountbridge` | 0 = HARD_CEILING, 5698 files |
| `scene-graph` | 0 / 4894 |
| `geometry-ceiling` | 0 / 4894 |
| `apps-editor-ghost-dirs` | hard-0 |
| `zoning-fidelity-label` | hard-0 |
| `height-fidelity` | hard-0 |
| `write-route-auth` | 47 routes: 40 authed, 7 declared-exempt |
| `command-naming` | 29 domains, 0 non-canonical |
| `single-compose` (P1) | 1 root, 0 rivals, 2/2 callers |
| `domain-purity` (P5) | 0 impurities / 170 files |
| `chat-capability-coverage` | 52 caps, 0 undeclared, 165 examples |
| `sync-disposition` | 325 verbs agree in both directions |
| `report-payload-discard` | 0 / 1732 |
| `offset-implementations` | 0 / 0 outside `polygonOffset.ts` |
| `propagation-reaches` | 0, 4642 files |
| `solver-is-real` | 0 |
| `prevstate-contract` | 0 |
| `conflict-surfacing` | 0, over 309 real merges |
| `derived-not-authored` | 0, 5 arms |
| `provenance-coverage` | 0 |
| `cross-process-determinism` | 4 fixtures byte-identical across 3 processes |
| *(meta)* `gate-subject-floors` | 57 gates inspected · floored 57 · **unfloored 0 — the ratchet reached 0** |

### §4.3 — AT-LEVEL ledgered gates (21) — declared level = measurement

| Gate | Exit | Reading |
|---|---|---|
| `no-commandmanager` | 1 KNOWN-DEBT | literal 11/11 · window 62/62 · cm.execute 62/62 |
| `custom-event-apps` | 1 KNOWN-DEBT | 20/20 |
| `per-package-compile` | 1 NEWLY-MEASURED | **85 compiled / 9 skipped / 26 failed** (first reading 27) |
| `layer-boundaries` | PASSED | violations 102/102 · unclassified 13/13 · sdk-bypass **171/182** |
| `no-direct-store-writes` (P6) | PASSED | 37/37 |
| `visibility-intent-not-ui` (P7) | PASSED | arm A clean 0 · arm B **40/43** |
| `refusal-identity` | PASSED | 71 findings · arm A 38 / arm B 33 · baseline 71 |
| `verb-liveness` | PASSED | grow-only baseline 7 = measured 7; 109 UNPROVABLE-NO-STORE, 209 UNKNOWN |
| `window-store-in-packages` | PASSED | 219/246 |
| `commandmanager-any` | PASSED | 25/25 |
| `structuredclone-commands` | PASSED | 119/157 |
| `l7-boundary` | PASSED | 84 files / 21 plugins · 103 violating lines · ceiling 84 |
| `collab-graph-integrity` | 1 NEWLY-MEASURED | **UNPROVEN** — local harness `ws://127.0.0.1:49152`, 10 records / 4 edges, neg-control fired |
| `provenance-not-invented` | 1 NEWLY-MEASURED | 2/2 |
| `suppression-is-reversible` | 1 NEWLY-MEASURED | 41/41 · ⚠ 2 findings name `CesiumViewport.ts:950,1298` = **IN-FLIGHT lane A7**, not HEAD debt |
| `no-hidden-mock` | 1 NEWLY-MEASURED | 9/9 |
| `constraint-honesty` | 1 NEWLY-MEASURED | 2/2 |
| `graph-write-coverage` | 1 NEWLY-MEASURED | 2/2 |
| `no-dark-test-files` | 1 NEWLY-MEASURED | 13/13 |
| `generator-circulation` | 1 NEWLY-MEASURED | 38/38 |
| `triangulation-canonical` | 1 NEWLY-MEASURED | 6/6 |

**Drift against each gate's own recorded `firstReading` (pre-session, all PAID DOWN):**
`suppression-is-reversible` 45→41 · `no-hidden-mock` 63→9 · `constraint-honesty` 21→2 ·
`graph-write-coverage` 5→2 · `provenance-not-invented` 7→2 · `triangulation-canonical` 13→6 ·
`no-dark-test-files` 137→13 · `per-package-compile` 27→26.
`generator-circulation` 18→38 is **EXPECTED** — the CI-1/CI-4 classes were pinned by founder
decision 2026-08-14.

**Five further gates are graded by `certify.ts`, NOT by `run-all.ts`, and the runner explicitly
declines to report their readings.** They are outside the 60 above; these are the pass's own
hand-runs: `propagation-trackers-reach` `[1]` 1/1 · `authoritative-state` `[1]` 1/1 ·
`derived-classification` `[1]` 1/1 · `two-client-convergence` (see §3.9) · `ai-human-parity`
**NOT DETERMINED — not run in this pass**. All five carry `reviewBy 2026-11-12`.

### §4.4 — Three gates this document re-ran itself, at `3afcac71`

Captured directly (`cmd; echo "EXIT=$?"`, value read from the printed line — never through a pipe,
never from the harness's overall status) and **corroborated by each gate's own findings text**,
which is the stronger evidence per §7.2:

| Gate | Exit | Findings text | Verdict |
|---|---|---|---|
| `check-xss-guards` | **0** | *"no new unguarded HTML-sink interpolations. 547 baselined finding(s) across 142 file(s); 4645 files scanned"* | MT-10's fix at `0064df08` **CONFIRMED** |
| `check-verb-register` | **0** | *"docs/04-reference/API-VERB-REGISTER.md matches the code, both directions"* | the `3afcac71` fix **CONFIRMED**; MT-02/MT-03 stand |
| `check-secrets-register` | **1** | `[1]` DECLARED-LEVEL — **12 findings at the declared level of 12** | the exit-3 breach is **CLEARED**; the 12 underlying FINDING-A rows (undeclared env reads in `plugin-sdk`, CI and `bake-worker`) remain **OPEN** |

**No CLOSED row regressed in the certification estate.** Ten certification gates re-ran green or
at-level (§1.1's evidence base), plus H5 `graphruntime.cert` and H6 `graphmove.cert` at **16/16**,
regenerated 2026-08-15T07:52Z, with `sitsOn` REACHED ×5, `contains` REACHED, and the never-created
negative control reading `[]`.

---

## §5 — ⭐ THE 13 GATES THAT RUN IN NO RUNNER

**This outranks the entire table above it.** Thirteen committed gate files under
`certification/gates/` are registered in **neither `run-all.ts` nor `certify.ts`**, and are
therefore **never executed by any instrument**:

1. `check-dependency-fields-honoured`
2. `check-generation-is-consequential`
3. `check-graph-delete-integrity`
4. `check-graph-persistence`
5. `check-index-can-refuse`
6. `check-move-propagation`
7. `check-no-empty-means-unknown`
8. `check-no-silent-partial`
9. `check-provenance-export-boundary`
10. `check-region-fallback-populated`
11. `check-region-host-attribution`
12. `check-region-reference-frame`
13. **`check-relationship-determination`**

The runner discloses this itself, and the disclosure is worth quoting: *"Two gate homes means two
registration points, and a gate in neither reads as coverage while running nowhere."*

### §5.1 — What this costs, stated without softening

| Gate | What depends on it | The consequence |
|---|---|---|
| **`check-relationship-determination`** | **IT IS THE BAR-3 GATE.** | **Every bar-3 number in every document — including the roadmap's — is a HAND-RUN reading with nothing defending it.** Nothing prevents it regressing between the run and the next time anyone looks. |
| `check-no-empty-means-unknown` | **GR-14** — the 63/63 ledger quoted in §2.2 and §3.5 | The drain from 95 → 63 is real and **entirely undefended**. A single PR can put it back. |
| `check-move-propagation` | **GR-12** — the 1/1 reading, the most valuable movement of the pass | Same. The `boundedBy` invalidation that took two commits and a schema argument to land is protected by nothing. |
| `check-graph-persistence` | **GR-06, GR-07, GR-08, GR-10** — four rows | Four row statuses rest on a gate CI never runs. |
| `check-graph-delete-integrity` | **GR-11** | 10/10 with nothing holding it there. |
| `check-provenance-export-boundary` | **PV-04** — *"the contract's own largest open risk"* | A carried closure (§2.6) on a gate that has never run in a runner. |
| the four `check-region-*` + `check-index-can-refuse` + `check-no-silent-partial` + `check-dependency-fields-honoured` + `check-generation-is-consequential` | region attribution, refusal honesty, partial-result honesty, dependency fields, generation consequence | **NOT DETERMINED** — no row in §2 was attributed to these in this pass. That is itself a finding. |

> **This is the §2.1d / L-774 shape recurring: *the state nobody investigates is the one they
> already expect.*** Everyone expected these gates to be running because they exist, are committed,
> pass when run by hand, and are cited in row after row. **The readings are real** — lanes ran them
> by hand and the numbers in §2 are those runs. **Nothing prevents them regressing.**
>
> **Registering these thirteen is a Wave-1 item, not a nice-to-have.** The roadmap owns the
> sequencing; this file owns the fact that until it lands, seven rows in §2 and the whole bar-3
> programme rest on readings with no CI behind them.

---

## §6 — ROTTING LEDGERS AND STALE DOCS

A ledger that keeps paid entries **absorbs the next regression silently**. That is the mechanism
these rows exist to protect, and it is unprotected in the places below.

### §6.1 — `deterministic-regeneration` — STALE LEDGER at 21 entries, up from 16

Twenty-one pinned `file:line` rows **no longer resolve to what they were pinned to**. The cause is
**line-number drift** in `DoorSystemTypeStore`, `WindowSystemTypeStore` and `SlabFragmentBuilder`.

> **This needs RE-ANCHORING, not a fix.** The defects those 21 rows named may or may not still
> exist; nobody knows, because the pointer no longer lands on the code. A ledger in this state is
> worse than an empty one: it reports 21 known-and-accepted items while measuring none of them, and
> the 22nd — a real regression — would land inside the noise and be indistinguishable from drift.

### §6.2 — MT-09's `SKIP_PACKAGES` — **35 of 94 packages unproven in isolation, not 26**

The row's headline number (26 failing) is accurate. **The number hides a sub-finding the row has
never carried:** the 9 "skips" are a **hard-coded `SKIP_PACKAGES` map, not a measurement**. So the
honest reading is:

```
  94   tsconfig-bearing packages
−  85   compiled                 → but 9 of the 94 were never attempted
= 26   failed  +  9 skipped  =  35 NOT PROVEN TO COMPILE IN ISOLATION
```

**The skip list contains `command-registry`, `core-app-model`, `runtime-composer` and `ai-host` —
four of the most load-bearing packages in the tree.**

> **MT-09's cheapest next action is NOT fixing a failing package. It is making the skip list
> SHRINK-ONLY**, so the exclusion cannot silently absorb the next package that stops compiling.
> Adding a package to a hard-coded skip map is currently a one-line way to make a compile failure
> disappear from a gate that is otherwise honest.

The 26 failing, named: editor-ui · engine · file-format ·
geometry-{column, curtain-wall, door, furniture, lift, lighting, plumbing, roof, slab, stair, wall, window} ·
input-host · persistence-client · physics-host · picking · renderer · room-topology ·
site-parcel-data · snapping · spatial-index · ui-base · views.

### §6.3 — **`CLAUDE.md` is measurably STALE in three places**

Every one of these was measured in this pass. `CLAUDE.md` is the first thing every agent reads, so
a stale number there propagates into every lane's assumptions before any work starts.

| `CLAUDE.md` says | Measured at `0ba90dc7` | Direction of the error |
|---|---|---|
| P7 `visibility-intent-not-ui` arm B is **45/43 and RED** | **40/43 — GREEN** | pessimistic; the doc reports a red that is paid |
| `layer-boundaries` sdk-bypass is **181/181** | **171/182** | wrong on both halves of the ratio |
| P4 `cast-count` is **217/215 repo-wide** | still RED, but at **6/4 scoped** (repo-wide 209/215) | wrong framing — the gate is scoped, the doc quotes it as repo-wide |

**Fixing `CLAUDE.md` is out of this file's write scope.** It is recorded here so the next lane with
that scope has the measured replacements in hand and does not have to re-derive them.

### §6.4 — GE-02's carry is CONTRADICTED by its own gate

GE-02 was closed on `check-predicate-canonical` reading **`[0]` CLEAN, hard-0, no baseline** — C1 =
0 non-canonical point-in-polygon bodies. **At `0ba90dc7` that same gate reads `[3]` RATCHET
EXCEEDED with C1 = 2**, both rivals minted by this session's own work (`boundaryGuard.ts:86`,
`ai-host/…/proceduralLayout.ts:55`).

> The row is left at its carried status **because this pass's row lane did not re-attribute it**,
> and promoting or demoting it from here would be inference, not measurement. But **the carry is
> not safe to quote**: a hard-0 closure whose gate is now RED on the same arm is the exact shape
> §0.1 exists to catch. **Re-attribute GE-02 and GE-03 in the next recount before either is cited
> anywhere.**

### §6.5 — A worked example of a miscount propagating through a derivative doc

The source roadmap headed its ordering rules **"The five ordering rules"** and then enumerated
**six**. The distillation copied that miscount **verbatim, in two places**.

> Trivial in itself, and precisely the failure mode the collapse to two documents exists to end:
> a derivative doc does not re-check its source, it **transcribes** it, and the error acquires a
> second citation that makes it look corroborated. Two documents cannot corroborate each other when
> one is a copy of the other.

---

## §7 — WHAT THIS TRACKER DOES **NOT** ESTABLISH

Stated so the boundaries are not inferred from silence.

### §7.1 — Carried forward from the register's §11

1. **Green-ness is not asserted for any existing gate.** C70 §0.2 is binding: **read the gate, not
   this line.** Every number here rots from the moment it is written.
2. **Almost every runtime claim is static or headless.** H5 and H6 are the exceptions — they drive
   real commands through the real `CommandManager` against production stores. **No claim here was
   made against a composed BROWSER session.** Every gate prints its own not-measured block; those
   blocks are not erased by being summarised.
3. **Severity is not ranked.** Rows are grouped by owning contract, not by importance. A priority
   ordering is a founder decision and would be an inference here. The roadmap sequences; it does
   not rank severity either.
4. **The counts are a count of THIS DOCUMENT'S ROWS, not of the repository.** They describe how the
   *known* defects distribute. **A defect nobody has found yet is in none of them** — and a count
   of zero over a discovered set is not a proof over an undiscovered one, which is the same
   sentence this repository already learned about empty seeds.
5. **UNPROVEN is a permitted answer and is not a gap in the work.** It means nobody measured. It is
   neither a pass nor a fail (C70 §2.2) and may never be collapsed into either.

### §7.2 — ⚠ **§EXIT-CODE-THROUGH-A-PIPE — a BINDING EVIDENCE RULE, not an anecdote**

> **Any claim of the form "gate X exits N" that was captured through a pipe (`| tail`, `| head`,
> `| grep`) or a compound command (`cmd; echo`) is UNRELIABLE EVIDENCE. Capture the exit code
> directly (`cmd; TRUE=$?`) or read the `process.exit` in the gate's source.**

**The same trap fired TWICE in one pass, on the same gate.** Both times a surface reading said
*"exit 0"* and the truth was **1**: the first was `| tail` reporting `tail`'s status; the second a
trailing `echo` reporting `echo`'s. Direct measurement then confirmed `TRUE_GATE_EXIT=1`, agreeing
with a source read of `check-per-package-compile.ts:258` — `process.exit(1)` inside the `anyFailed`
branch. **The gate exits 1 and does block.**

**State the consequence plainly, because it is the point: a recount that harvested exit codes
through pipes would have MANUFACTURED A GATE-HONESTY SCANDAL out of a shell artifact**, and this
pass came within one sentence of publishing exactly that — *"the gate prints ❌ and exits 0"* was
written before it was caught on the lane's own re-reading.

**What protected the number is the doctrine, not luck: MT-09 was counted OPEN at 26 on the gate's
FINDINGS, never on its exit code. Findings are the evidence; the exit code is a summary of them.**

This belongs beside §7.1 because it is the same species of limit: **a measurement system that can
be wrong in a way that reads as a finding about the thing being measured.** §4's Exit column
carries its own provenance note for exactly this reason — those codes are the runner's own printed
per-gate classification, not shell-harvested, and the one value this document could not vouch for
(the runner's aggregate exit) is marked **NOT DETERMINED** rather than copied.

### §7.3 — In-flight lanes excluded from the counts, and why

Two lanes were holding uncommitted work in the shared tree during the pass and are **excluded from
every number in §1 and §2**:

- **Lane A5 (IFC/export surface)** — this is PV-04's territory. Attributing a provenance
  export-boundary status from here would be guessing at another lane's live work. PV-04 is carried,
  and says so.
- **Lane A7** — `check-suppression-is-reversible` prints **2 findings naming
  `CesiumViewport.ts:950,1298`**, which are **in-flight A7 work, not HEAD debt**. The gate's 41/41
  reading is quoted with that caveat attached and must not be quoted without it.

**Excluding them is the honest choice and it has a cost:** the counts in §1 are a reading of a tree
that two lanes were actively changing. They are correct as of the readings and will be wrong the
moment those lanes land.

### §7.4 — This file does not establish that the READINGS ARE CURRENT

They are current as of `0ba90dc7` → `3afcac71`. **§11's auto-block is the only part of this file
that stays current**, and it stays current about *commits and staleness*, never about statuses.

### §7.5 — This file does not rank, schedule or estimate

Scheduling collaboration work is a founder decision; estimating it is fiction. No row below carries
an estimate and none should be added.

### §7.6 — The cheapest available promotion, named rather than performed

Nine of the 28 NOT-RE-MEASURED rows have a deciding gate that **did** read at `0ba90dc7` in M1's
estate sweep, but which the row-level lane did not attribute per row: **PV-01, PV-02, PV-03, PV-05,
PV-06, PV-07** (the three C75 gates), **PR-03** (`check-prevstate-contract` `[0]`), **CO-02**
(`check-solver-is-real` `[0]`), and **GE-02/GE-03** — the last two in the wrong direction (§6.4).

> **A single cross-read of §4 against §2 would promote up to eight rows from carried to verified at
> zero measurement cost.** It was not performed here, and performing it by inference rather than by
> attribution is exactly what §0.1 forbids. **It is named so the next pass takes it first.**

---

## §8 — WHAT A USER CAN ACTUALLY DO — 32 SCENARIOS

*Carried from the deleted `BIM30-NEXT-SESSION-BRIEF.md` §9. **This is the only assessment in the
entire corpus taken from the USER'S side rather than the gate's side** — every other artefact in
this programme measures instruments. That makes it state, and it makes it uniquely valuable.*

> ⚠ **Every verdict below was assessed 2026-08-13 and NONE was re-measured in this pass.** Treat
> the whole section as `NOT RE-MEASURED — last known 2026-08-13`, exactly as a row would be. It is
> carried in full rather than trimmed, because dropping a scenario whose verdict looks old is how
> an assessment quietly becomes a highlight reel.

### §8.1 — 100 % of WHAT — the most important thing on this page

**The 82 rows do not measure "can PRYZM generate an apartment". They measure "when the model
changes, does PRYZM stay truthful".** They are the *consequence* layer.

| | What 100 % on the 82 rows BUYS | What it does NOT buy |
|---|---|---|
| | Every edit propagates or refuses honestly. Areas, schedules and exports agree with the geometry. Nothing is silently wrong. **You can trust the model enough to sell from it.** | **New generative capability.** A typology PRYZM cannot design today, it still cannot design at 100 %. That lives in the typology packs / executors — **a different axis with its own roadmap.** |

**Two independent axes, both needed for the 32 prompts, only one counted by "100 %":**
**AXIS 1 — TRUST** (the 82 rows + the three bars) carries nearly every *modification* prompt.
**AXIS 2 — GENERATIVE REACH** (the executors) carries nearly every *generation* prompt.

Measured 2026-08-13, `packages/ai-host/src/workflows/` contains `apartmentLayout` · `houseLayout` ·
`residentialBuilding` · `officeBuilding` · `officeFurnish` · `furnishLayout` · `ceilingLayout` ·
`lightingLayout` · `daylight` · `Generate3Options` · `PlanCritique` · `VoiceCommand`. **There is no
`townhouse`, no `housingScheme`, no `masterplan`, no `courtyard`.** *(NOT RE-MEASURED.)*

### §8.2 — The structural limit that decides 16 of the 32

Every prompt in the four MODIFICATION categories asks PRYZM to change an existing design and keep
everything else valid. That is what **bar 3** measures, and its reading was:

> **4,100 cells (100 consequential verbs × 41 relationships): 4,018 SILENT · 72 refusal-BLOCKED ·
> 10 structurally-answerable.** 98 of 100 verbs have no normaliser and no composed planner; the
> preview entry point is bare-null. *(Reading dated 2026-08-13, NOT RE-MEASURED. And per §5, the
> gate that would defend it — `check-relationship-determination` — **runs in no runner.**)*

**In plain words: PRYZM can today MAKE a design far better than it can MODIFY one.**

### §8.3 — The 32 prompts

**Legend** — ✅ YES at 100 % · 🟡 PARTIAL (works, with a named gap) · 🔴 NO (needs work that is *not*
in the 82 rows or the three bars — a new executor, engine or rule set).

| # | Prompt | Verdict | Why |
|---|---|---|---|
| **1** | 2-bed ~85 m² in envelope | ✅ | `apartmentLayout` (D-TGL, P1–P9, 67 tests) + normative `programRules` + `furnishLayout` + `daylight`. Area targeting, room mix, circulation minimisation, daylight scoring all exist |
| **2** | 5 types, 50–120 m², studio→4-bed | 🟡 | each type generates; **"consistent architectural language" is not a modelled objective**. Five good plans, not a designed family |
| **3** | apartment behind a façade bay | 🟡 | window-aware placement + daylight-depth fields exist; **the façade *bay* is not a first-class input** — you align to openings, not to a rhythm |
| **4** | 110 m² family, 3-bed, terrace, cross-vent | 🟡 | zoning, two bathrooms, storage, daylight: yes. **Terrace weak** (outdoor space is not a modelled room type); **cross-ventilation not computed** — daylight is, airflow is not |
| **5** | 75 → 90 m², absorb adjacent area | 🔴 | boundary surgery preserving entrance, grid, openings. `RECONCILABLE_TYPES` is `['Wall','Slab']`; columns, stairs, doors, furniture are classified **STRANDED** (C72) |
| **6** | 2-bed → 3-bed, same envelope | 🔴 | topology re-partition of an existing plan; the only honest path is regenerate-with-new-brief, which discards your edits |
| **7** | improve layout, same envelope | 🔴 | needs critique → targeted edit. `PlanCritique` exists and scores a plan; **the edit half is the silent-verb problem.** It can tell you what is wrong and not fix it |
| **8** | combine two apartments, reuse wet areas | 🔴 | hardest of the four: cross-unit merge, party-wall removal, service-zone reuse. Needs bar 3 **and** junction re-weld |
| **9** | 180 m² 3-bed detached house | ✅ | `houseLayout` — spine-first upper floor, containment checks, stair placement, garden orientation; known defects logged and largely closed |
| **10** | 3-storey 150 m² narrow townhouse | 🟡 | no `townhouse` workflow; **vertical circulation on a narrow plate is the known weak spot** (§CORRIDOR-STAIR-CONTIGUITY). Roof-level daylight not modelled |
| **11** | scheme of 12 houses on a site | 🔴 | **no site-scale multi-building placement engine exists.** Plot subdivision, orientation, shared vs private outdoor space, pedestrian networks — none built. A new pack, not a gap in the 82 |
| **12** | compact 100 m² 3-bed homes, repeated | 🟡 | one home yes; **"across the scheme" is prompt 11's gap** |
| **13** | 2-bed → 3-bed house, same envelope | 🔴 | same root as prompt 6 |
| **14** | extend house 25 m² to garden | 🔴 | an extension is a *consequential* geometry change: new walls must weld to existing (**junction re-weld untouched**), the slab extends (works), the roof must follow — **roof has no reference field and needs an L0 schema change** (= GR-12, §3.4) |
| **15** | optimise scheme, same site area | 🔴 | prompt 11's engine *plus* modification. Furthest of all 32 from shipping |
| **16** | change housing mix 20×2-bed → mixed | 🔴 | same |
| **17** | 8-storey, ~8,000 m², ~80 apartments | 🟡 | `residentialBuilding` does shared core + N apartments/floor + corridor. **Known blocker: the corner-cell problem** — doors cannot be routed in cells with two external faces. Communal spaces unmodelled |
| **18** | 5-storey courtyard, ~60 apartments | 🟡 | no courtyard typology; the plate partitioner assumes a solid floorplate, not a ring. **Dual-aspect maximisation is not an objective function** |
| **19** | 6-storey urban, responding to street + neighbours | 🟡 | **where PRYZM is genuinely differentiated**: real context tiles, neighbour heights, terrain, real envelope law, street-width-driven height. Balconies and public realm unmodelled |
| **20** | from programme: 40×1-bed, 30×2-bed, 20×3-bed | 🟡 | the brief schema is slider-driven so the input is expressible; **core positioning is placed, not solved for** |
| **21** | +15 % apartments, same footprint | 🔴 | whole-building re-partition holding quality floors. Bar 3 plus a constrained optimiser that does not exist |
| **22** | add two floors, keep façade language | 🔴 | **the clearest single example of why bar 3 matters.** `RECONCILABLE_TYPES` covers Wall and Slab only; every other type is **STRANDED by design and announced at runtime** — PRYZM honestly tells you it did not move them. Correct, and still not the feature |
| **23** | optimise floorplate, keep core + grid | 🔴 | "improve without breaking" — bar 3 exactly |
| **24** | change apartment mix, same GFA | 🔴 | same |
| **25** | 6-storey ~12,000 m² office | 🟡 | `officeBuilding` + `officeStoreyFloors` exist. **Programme depth is the gap** — meeting/quiet/collaboration rooms need normative rules the room DB only partly has |
| **26** | flexible 1,800 m² floor for ~150 people | 🟡 | `officeFurnish` exists; **the occupancy chain (people → desks → area → support ratio) is not modelled** — you can furnish a floor, not solve one for a headcount |
| **27** | hybrid office: café, event space, amenities | 🔴 | those room types are **not in the programme-rules database**. Without normative rules a generator invents dimensions — the exact C75 "never invented" failure. **Needs rule authoring first: cheap, unglamorous, high value** |
| **28** | 5-storey office around a courtyard | 🟡 | same courtyard limitation as prompt 18 |
| **29** | cellular → hybrid workplace | 🔴 | demolition plus re-partition of an existing fit-out. Bar 3 |
| **30** | 120 → 160 people, same area | 🔴 | bar 3 **plus** the occupancy chain from prompt 26 |
| **31** | make floor flexible (movable partitions) | 🔴 | needs a **movable/demountable partition element type** that does not exist. A new element kind makes **C67/C68 mandatory** |
| **32** | extend office by 2,000 m² | 🔴 | same class as prompt 14, at building scale |

### §8.4 — The score, and the row to read twice

| | ✅ YES | 🟡 PARTIAL | 🔴 NO |
|---|---|---|---|
| All 32 prompts, at 100 % of the current programme | **2** | **12** | **18** |
| Generation prompts (1–4, 9–12, 17–20, 25–28) | 2 | 12 | 2 |
| **Modification prompts (5–8, 13–16, 21–24, 29–32)** | **0** | **0** | **16** |

**At 100 % of the 82 rows and the three bars, generation is 14 of 16 working or partly working —
modification is 0 of 16.** Not because modification is harder to *design*, but because modification
is where **truth** is required, and truth is what the 82 rows and bar 3 are building.

### §8.5 — ⚠ The correction that the "blocked on bar 3" framing understates

| | What it does | What it does NOT do |
|---|---|---|
| **Bar 3 (C78 consequence)** | makes a modification **SAFE** — every affected element determined, or refused with a typed reason; nothing goes silently stale | decide **WHAT to change** |
| **A modification/edit engine** *(does not exist, is not in any plan)* | decides that "2-bed → 3-bed" means split the larger bedroom, relocate one door, re-route the corridor, preserve the wet stack | — |

**PRYZM has generation engines and a trust layer. It has NO EDIT LAYER.** There is no workstream
anywhere whose subject is *transforming an existing design while preserving intent*.

> **Bar 3 green + no edit engine = a tool that will faithfully tell you it does not know how to
> convert your apartment.**

**And the honest counter-half — three of the 32 are the ASK's problem, not the product's:**
prompts **11, 15, 16** are **WRONG SCOPE** (masterplanning / urban design is a different product,
and should be an explicit product decision, not an item quietly failing on a BIM roadmap);
prompts **2, 12** are **WRONG WORDING** (nobody has operationalised aesthetic consistency and a tool
claiming to would be lying — reframe as "shared parameter set + repeated unit types + a common
façade rule", which *is* buildable); prompt **31** is **trivial by comparison** — an
element-library gap, not design reasoning.

*(§8.5's "what should enter the plan" — D-EDIT, programme-rule authoring, ring/courtyard plates,
the cross-ventilation decision — is PLAN, and belongs to
[`BIM30-IMPLEMENTATION-ROADMAP.md`](BIM30-IMPLEMENTATION-ROADMAP.md). It is deliberately not
carried here.)*

---

## §9 — THE PER-DOMAIN **MINIMUM CHANGE** VERBS

*Carried from the deleted `BIM30-CAPABILITY-MODEL.md`. **This is the only place the founder's
implementation taxonomy is applied domain by domain.** The verbs and the reasoning are carried;
**the CURRENT and MATURITY readings from that document are NOT** — every one was stamped
"as of 2026-08-11" and many are now false. §2.11 is the younger, measured replacement for those
cells.*

### §9.1 — The three cross-domain facts that organise everything

1. ⭐ **The ceiling is a DECISION, not code.** Domain 14's missing transport caps every
   certification row at PARTIALLY VERIFIED **by construction**. **Domains 1–13 and 15–16 can all
   reach their targets while the ceiling stands; none can be FINISHED until it lifts.**
2. **The dominant implementation types are retention, wiring and exposure — not construction.**
   (§2.10 is the count that proves it.)
3. **Nothing is done until domain 16 says so.** Every TARGET is a claim; **the gate column is what
   keeps it true.**

### §9.2 — The sixteen verbs

| # | Domain | MINIMUM CHANGE |
|---|---|---|
| 1 | Model truth | **wiring** (per-kind ADR-0318 adoption: wall, room, slab first) + **invariant** (declare the single authority per rivalry and **delete the loser**) |
| 2 | Identity | **invariant** (comparator adopts ADR-0319's enumerated classes) + **wiring** (patch-based redo so class-2 counters stop ratcheting — named in ADR-0319 as the largest consequence) |
| 3 | Persistence | **persistence** (fix the double-applied offset mechanism behind F-3 — *explicitly not "subtract 15 mm"*; make the loader's opening merge symmetric for F-4) + **invariant** (settle whether `openingStore` is authoritative at all — this is MT-06) |
| 4 | Topology | **retention** (CONNECT-3: keep the junction records the resolver already computes — *"an extension of an existing computation's lifetime, not new architecture"*) + **wiring** (a typed reader for `sitsOn`, a writer for `contains`) + **invariant** (room identity survives boundary edits **by id, not centroid**) |
| 5 | Graph | **exposure** (UBG → `composeRuntime` slot + the three read-only verbs) + **wiring** (widen `_rebuildSemanticGraph` — **one existing function, protects four of the five priority rows at once**) |
| 6 | Geometry | **invariant** (one declared epsilon constant; new predicates must consume it) + the per-family recipe (canonical file + counting gate — point-in-polygon first) + **algorithm** (a general 2-D boolean; a real clash engine — **both labelled construction**) |
| 7 | Propagation | **wiring** (call `setRebuildDispatcher` with real listeners — **both halves, or neither**: the resolver subscribes to the bus, not the stores, so `prevState` never reaches it) + **invariant** (deletes stop returning `[]`) |
| 8 | Constraints | **invariant FIRST** (a mock must announce itself) → **wiring** (validators → `violates` edges) → **solver only if a model-space family proves it needs one** (walls-parallel is the named pilot: stored + validated first, solver-maintained later) |
| 9 | Spatial reasoning | **retention** (junction index; a reverse wall→rooms index) + **exposure** (the questions become `graph.*` answers) + **invariant** (one AABB definition for the room index) |
| 10 | Provenance | **invariant** (one optional origin block on `BaseNodeShape`; `'unknown'` first-class and **never defaulted**; `derivationStatus: authored\|derived\|repaired\|refused`; separate `rev`). ⭐ **Sequenced AFTER per-kind ADR-0318 adoption, because "provenance fields are worthless while a verb can stamp them on a detached DTO store".** The PV-01 fix ships in the same PR — **the fix IS writing the field** |
| 11 | Regenerability | **retention/persistence per ledger row** (persist what cannot be rebuilt, widen the rebuild for what can) + **invariant** (the ledger becomes gate INPUT, so a new persist-or-lose member is a red diff, not a surprise) |
| 12 | Algorithmic generation | **wiring** (un-mark authoritative levels when generation ends; generation writes `origin:'ai-generated'`/COMPUTED provenance once the fields exist) — ⭐ **the engines themselves need NO change to meet the target** |
| 13 | Query / reasoning | **exposure** (the three graph verbs) + **invariant** (typed refusal unions on the three named `RoomGraphService` cases; **type `window.semanticGraphManager` so a wrong-signature read becomes a compile error** — named the highest-leverage fix of the three) |
| 14 | Collaboration | **collaboration** (the founder's own taxonomy term: deploy leg C behind a staging flag; then per-capability convergence proofs; conflict-surfacing invariant on every merge that can lose data) |
| 15 | AI boundary | **exposure** (once `graph.*` verbs exist, admit them to the read-only capability class) + **invariant** (accepted AI proposals stamp `origin:'ai-generated'`, **never AUTHORED**) |
| 16 | Certification | **invariant** (build the remaining gates on the existing harness — *"none needs new infrastructure"*; every gate under the four-exit-code contract **with a floor**) |

---

## §10 — DATED OBLIGATIONS

*Carried from the deleted `BIM30-DISPOSITION-DOCKET.md` (the artefact ADR-0323 requires) and the
deleted review COORDINATOR-NOTES. **These dates exist nowhere else.*** The docket's own rule
governs them: **"'Later' is not a disposition" — an expired undecided row FAILS the run that
discovers it (ADR-0323 rule 4).**

**Today is 2026-08-15.** The 30-day horizon closes **2026-09-14**; every dated row below falls on
**2026-09-12**, i.e. **28 days out — INSIDE the 30-day window and therefore flagged.**

| Item | Disposition owed | Owner | Due | Days out | Flag |
|---|---|---|---|---|---|
| `pryzm-render-registry-isolation-leak` (`initScene.ts:1492`) | **WIRE-PENDING.** This is the **C13 isolation-violation alarm**; the invariant requires the detection to be *heard*, and today it fires into silence beside its `[C13 VIOLATION]` console.error. Recommendation: a bootstrap listener incrementing an OTel counter + a dev-mode toast. **Removal instead requires explicit founder sign-off — deleting an alarm is a policy statement** (ADR-0323 rule 5) | Editor bootstrap owner; **escalation: FOUNDER** | 2026-09-12 | **28** | ⚠ **FOUNDER-GATED · WITHIN 30 DAYS** |
| `@pryzm/pdf-to-bim` | **WIRE-or-REMOVE — FOUNDER DECISION.** 0 importers, but a live parallel PDF flow exists in `apps/editor` + `apps/ai-worker`: two rival extraction paths, *"the exact 'five overlapping systems' pattern STR-06 §5 warns about"*. Recommendation REMOVE, unless the confidence-model/review-queue design is wanted as the successor — in which case WIRE means the live flow consumes this package's review queue **and the loser is deleted in the same change** | **FOUNDER** | 2026-09-12 | **28** | ⚠ **FOUNDER-GATED · WITHIN 30 DAYS** |
| `@pryzm/expr-eval` | **REMOVE** — 0 importers; two rival engines exist and both explain why in-source; STR-06 §18 explicitly rejects a second expression engine. The rivals' comments must be updated in the same commit so they stop citing a deleted package | R0 follow-up — **dedicated commit** (`pnpm-lock.yaml` churn, `pnpm install --frozen-lockfile` verified) | 2026-09-12 | **28** | ⚠ **WITHIN 30 DAYS** |
| `@pryzm/wcag-audit` | **WIRE-or-REMOVE.** 0 importers, no runner script anywhere. WIRE = a `tools/scripts/check-wcag-audit.mjs` runner in the a11y-check family invoked from CI. **If no owner claims it by the date, the default is REMOVE** | **UNCLAIMED** (a11y/gate owner) | 2026-09-12 | **28** | ⚠ **UNCLAIMED · WITHIN 30 DAYS** |
| `plugins/ai-generative` descriptor | **REMOVE at reviewBy unless wired.** 0 importers outside the package, `enabled: false`, registers nothing; the `Generate3Options` workflow it names is real in `@pryzm/ai-host` and reached via `getAiHost()` **without this shell**. A dated scaffold header was added (EXECUTED); the package is retained pending the date | **UNCLAIMED** (AI-host owner) | 2026-09-12 | **28** | ⚠ **UNCLAIMED · WITHIN 30 DAYS** |
| `getEdgesForRoom` / `getConnectedComponent` / `TemporalGraph.getEdgesForElement` | **WIRE-PENDING-R2** — impact-surface inputs. **HOLD; do not delete** | R2 implementer | **R2 exit** (or 2026-10-12, whichever first) | **NOT DETERMINED** (event-dated) | — |
| ⭐ **COORD-01 · `C76` was never minted** | The founder's 2026-08-12 finding: *"the element-kind census is **evidence of an architectural coverage problem, not itself a coverage metric**"*, and *"**per-kind percentages are not meaningful until that declaration exists**"*. Evidence: **three disagreeing kind enumerations — schema barrel 28 · chat probe list 16 · parameter-routing table 11 — and no document declares which is the denominator.** Scope call: **mint C76, the element-family register.** **Binding effect while it is unminted: any per-kind percentage anywhere is DOWNGRADED to "evidence over a contested denominator."** | **FOUNDER** (contract minting) | **NO DATE SET** | **NOT DETERMINED** | ⚠ **OPEN FOUNDER-LEVEL OBLIGATION, undated and therefore unexpirable — the state ADR-0323 rule 4 exists to prevent** |

> **Two closed COORD entries, recorded so they are not re-opened:** COORD-02 — C-17 (opening
> re-clamp) *"settled by re-measure, not by adjudicating prose"*, 7/7 green, **CLOSED**. COORD-03 —
> MT-08 §UNDO-GESTURE-ID closed at `774a91e6`, *"gesture identity replaces the 250 ms clock"*.
>
> **The docket's closing rule, which governs how any of the above may be discharged:** they exit
> **"decided per item from evidence, never wired in bulk to make a count go green."**

---

## §11 — THE AUTO-MAINTAINED BLOCK

Everything between the two markers below is **machine-owned** and regenerated in full on every
commit by `tools/tracker/update-tracker.ts` (shipped `5f9dca7f`, driven from `.githooks/post-commit`;
opt in per clone with `git config core.hooksPath .githooks`). It carries three things: a **commit
ledger** (SHA, date, subject, file count, and which rows own the paths touched — resolved through
`tools/tracker/row-paths.json`), an **UNMAPPED disclosure** of every changed path that matched no
row, and the **gate-staleness table** that §0.3's restamp trigger reads.

> ### ⛔ **The hook NEVER changes a row's STATUS. Only an executed gate run may do that.**
>
> A commit is evidence that **work happened**; it is not evidence that the work is **correct**. A
> hook that flipped a row to CLOSED because a file under that row was edited would be
> hand-incrementing a count from an unmeasured premise — the single most frequently logged defect
> class in this repo. So the block writes no `OPEN`/`CLOSED`/`UNPROVEN`, no `N of 82`, no
> percentage, and **there is a test that fails if it ever emits one**. It also never runs a gate,
> never fails a commit, never amends one, and never touches a byte outside the markers.
>
> An unmapped path is **disclosed**, never dropped — otherwise *"we have not written the mapping
> yet"* and *"no row was affected"* become the same value. A gate whose evidence artefact does not
> exist renders **`NOT DETERMINED`** with its reason, never `0`.

Verify by hand with `npx tsx tools/tracker/update-tracker.ts`, or in CI with `--check` (writes
nothing; exits non-zero if the block lags HEAD or the markers are missing, duplicated or inverted).

**First run of this file's block, 2026-08-15 — three things it immediately reported, recorded here
because they are findings, not plumbing:**

1. **`row-paths.json` now maps 50 of the 82 rows** (validated at `3afcac71`: 0 glob misses, 0
   missing evidence artefacts, 0 duplicate ids). **32 rows are deliberately unmapped** — no path in
   the tree could be attributed to them without guessing, and **a wrong mapping is invisible while
   an unmapped path is disclosed.**
2. **101 distinct changed paths in the 25-commit window matched no row**, led by `packages/ai-host`
   (27), `apps/editor` (24) and `docs/04-reference` (18). That is a **mapping gap, not an absence
   of work**, and the block says so in those words.
3. **Thirteen of the seventeen tracked gates show a recorded reading older than 50 commits** — up
   to 546 (`check-derived-not-authored`), 529 (`check-propagation-trackers-reach`) and 485
   (`check-authoritative-state`). Read that with §0.3's caveat: it is the age of the **written-down
   number**, not proof the gate has not run. It is nonetheless the single most useful line in this
   file, because it is the thing the previous stamp had no way to see.

⚠ **A correction this section owes to `tools/tracker/README.md`.** That README states
`check-relationship-determination` *"does not exist yet"* and is *"expected to render NOT
DETERMINED today"*. **That is FALSE at `3afcac71`** — both the gate file and its ledger
`relationship-determination.json` exist, and the block renders its age as **9 commits**, not NOT
DETERMINED. The real defect is worse than the one the README anticipated, and §5 is where it
lives: **the gate exists, is committed, passes when run by hand — and is registered in no runner
at all.** `row-paths.json` now carries that correction in the gate entry's own note.

<!-- TRACKER:AUTO:BEGIN -->

<!--
  MACHINE-OWNED BLOCK — regenerated in full by tools/tracker/update-tracker.ts
  on every commit (post-commit hook). Do not hand-edit: your edits are
  overwritten on the next commit. Prose OUTSIDE these two markers is never
  touched by the tool.

  THIS BLOCK NEVER CHANGES A ROW STATUS. It records which commits landed and
  which rows own the paths they touched. Only an executed gate run may move a
  row between OPEN / CLOSED / UNPROVEN.
-->

### 🤖 Commit ledger — auto-maintained, advisory only

| | |
|---|---|
| HEAD | `da855d83` — docs(ISSUE-LOG): L-916 — founder-reported hosted-opening record DESYNC on host move; MT-06's rival authorities arrive as a visible defect |
| HEAD date | 2026-08-15T09:40:51+01:00 |
| Repo commits | 5077 |
| Ledger window | 25 most recent commits |
| Mapping source | `tools/tracker/row-paths.json` — 50 row(s) mapped |

#### Commits (most recent first)

| SHA | Date | Rows touched | Files | Subject |
|---|---|---|---|---|
| `da855d83` | 2026-08-15 | *none mapped* | 1 | docs(ISSUE-LOG): L-916 — founder-reported hosted-opening record DESYNC on host move; MT-06's rival authorities arrive as a visible defect |
| `69752a60` | 2026-08-15 | *none mapped* | 18 | docs(BIM30): collapse the corpus, batch 1 — 18 documents DELETED, their load-bearing content absorbed |
| `56534571` | 2026-08-15 | *none mapped* | 1 | docs(BIM30/D1): roadmap rewritten as the PLAN half — three rival A/B/C schemes RECONCILED |
| `3afcac71` | 2026-08-15 | `MT-02`, `MT-03` | 2 | fix(C69/C77): regenerate the two DERIVED doc artefacts the gates read — verb-register hard-0 restored |
| `0064df08` | 2026-08-15 | `MT-10` | 1 | fix(MT-10/xss): OverridePanel's two refusal-reason ATTRIBUTES are escaped — the ratchet breach was shipped, not staged |
| `5f9dca7f` | 2026-08-15 | *none mapped* | 8 | feat(tracker): commit-ledger hook that DISCLOSES staleness instead of inventing status |
| `92535b31` | 2026-08-15 | *none mapped* | 7 | fix(ui-honesty): exec diagnostics + Cesium massing stop printing missing records as measurements (GR-10 rows 4+5 of 5, scope drained) |
| `0ba90dc7` | 2026-08-15 | *none mapped* | 1 | docs(handoff): §17 session close 2026-08-15 morning — 8-lane fleet, 2 deploys, 4 founder rows closed, wave-2 order |
| `80e77458` | 2026-08-15 | *none mapped* | 2 | docs(ISSUE-LOG): 2026-08-15 fleet closures L-906/L-909b/L-911/L-912 + 8 new rows, PURE APPEND; deploy contract §6.5.6 Windows-path amendment |
| `9e780581` | 2026-08-15 | `GR-12` | 7 | feat(consequence): the hosted-opening DELETE family lands whole — door.delete / window.delete / opening.delete reach ONE composed planner, harness INCLUDED (bar 3, C78 §5.1/§19.1) |
| `8a394fbb` | 2026-08-15 | *none mapped* | 4 | fix(refusal/L-911): the envelope reject reaches the user carrying BOTH counts — and the backwards "more bedrooms" hint dies at the table ceiling |
| `e4e952ef` | 2026-08-15 | *none mapped* | 17 | fix(report-honesty/L-909b): unmeasured is NEVER printed as measured zero — G-7/G-10/A-7 gain a NOT-MEASURED lane |
| `966686cc` | 2026-08-15 | *none mapped* | 3 | fix(C83-S1/L-912): wall-onto-DOOR silence CLOSED — solid overlap replaces the centreline clip, junction excuses narrowed to junctions |
| `5268d71c` | 2026-08-15 | *none mapped* | 4 | fix(ui-honesty): resi executor stops reading an unrecorded facade set as "interior cell" (GR-10 row ResidentialBuildingExecutor.ts) |
| `53dc31d3` | 2026-08-15 | `PR-13` | 14 | refactor(GE-01/C73): epsilon drain, core-app-model + ai-host non-apartment clusters — 26 ledger rows paid (3 consumed roles, 10 truthful renames), gate 338 -> 322 |
| `e89a5485` | 2026-08-15 | *none mapped* | 3 | feat(RAC/L-906): activate-placement is a DECLARED capability — registry row, acceptance family, adversarial pins; + the L-905 label-follows note |
| `e5d78672` | 2026-08-15 | *none mapped* | 5 | feat(RAC/L-906): "create a bed" ACTIVATES the palette's own placement tool — matrix + catalogue via the ONE ladder, ALL elements |
| `b7277753` | 2026-08-15 | *none mapped* | 3 | fix(ui-honesty): entrance-door placement stops treating an unsupplied occupancy map as a clear wall (GR-10 row houseEntranceWall.ts) |
| `799255c0` | 2026-08-15 | `MT-10` | 4 | fix(ui-honesty): OverridePanel stops rendering an unbound view as "Clean" (GR-10 row apps/editor/src/ui/OverridePanel.ts) |
| `113ef892` | 2026-08-15 | `GR-14` | 3 | fix(refusal): facet refusal row renders through shared facetRefusalText() — identity token in the visible text |
| `499549a8` | 2026-08-14 | `GR-12` | 5 | fix(refusal): GE-09v3 walls family — the FIFTH and last command-registry batch family |
| `6605d007` | 2026-08-14 | *none mapped* | 1 | test(RAC/L-911): MEASURED — the "5" in the envelope reject is a growth CEILING, not a request |
| `90d6f3a4` | 2026-08-14 | *none mapped* | 3 | fix(refusal): GE-09v3 slabs family — child refusals keep their identity via shared childRefusalText() |
| `59bc6f71` | 2026-08-14 | *none mapped* | 1 | test(C83-S1/L-912): MEASUREMENT FIRST — the door/window discriminator is REFUTED; three GEOMETRY branches are silent |
| `b89bae67` | 2026-08-14 | *none mapped* | 4 | fix(RAC/L-911): "3 BEDRROM" now carries 3 — the count typo defeated the parser the noun typo survived |

#### ❓ UNMAPPED paths in this window

**101 distinct changed path(s) matched no row.** That is a *mapping gap*, not an absence of work — the commits happened; `row-paths.json` just does not yet say which row owns them. Add the mapping rather than reading this as "nothing to report".

| Area | Unmapped paths |
|---|---|
| `packages/ai-host/…` | 27 |
| `apps/editor/…` | 24 |
| `docs/04-reference/…` | 18 |
| `packages/core-app-model/…` | 9 |
| `tools/tracker/…` | 7 |
| `docs/03-execution/…` | 4 |
| `packages/geometry-wall/…` | 3 |
| `tools/rac-conformance/…` | 3 |
| `packages/command-registry/…` | 2 |
| `tools/ga-gate/…` | 2 |
| `.githooks/post-commit` | 1 |
| `docs/02-decisions/…` | 1 |

#### 🕰 Gate reading staleness — how old is each recorded measurement?

> The hook **never runs a gate** (far too slow for post-commit). It reports how many commits have landed since each gate's evidence artefact last changed, so a stale reading announces itself instead of being quoted as current.

| Gate | Last recorded measurement | Date | Commits since | Reading age |
|---|---|---|---|---|
| `check-epsilon-policy` | `53dc31d3` | 2026-08-15 | 14 | ⚠ **14 commits old** — re-run before quoting |
| `check-predicate-canonical` | `ef8c993c` | 2026-08-13 | 252 | ⚠ **252 commits old** — re-run before quoting |
| `check-deterministic-regeneration` | `2a4853ae` | 2026-08-14 | 39 | ⚠ **39 commits old** — re-run before quoting |
| `check-triangulation-canonical` | `2a4853ae` | 2026-08-14 | 39 | ⚠ **39 commits old** — re-run before quoting |
| `check-xss-guards` | `2f2ea5da` | 2026-08-13 | 399 | ⚠ **399 commits old** — re-run before quoting |
| `check-graph-persistence` | `5fb70137` | 2026-08-12 | 456 | ⚠ **456 commits old** — re-run before quoting |
| `check-graph-delete-integrity` | `03e93609` | 2026-08-13 | 425 | ⚠ **425 commits old** — re-run before quoting |
| `check-move-propagation` | `445e7650` | 2026-08-14 | 70 | ⚠ **70 commits old** — re-run before quoting |
| `check-relationship-determination` | `9e780581` | 2026-08-15 | 9 | 9 commit(s) old |
| `check-no-empty-means-unknown` | `92535b31` | 2026-08-15 | 6 | 6 commit(s) old |
| `check-room-aabb-canonical` | `436e32f8` | 2026-08-13 | 323 | ⚠ **323 commits old** — re-run before quoting |
| `check-conflict-surfacing` | `a926a93d` | 2026-08-14 | 173 | ⚠ **173 commits old** — re-run before quoting |
| `check-propagation-trackers-reach` | `bbff7030` | 2026-08-12 | 529 | ⚠ **529 commits old** — re-run before quoting |
| `check-authoritative-state` | `f718d768` | 2026-08-12 | 485 | ⚠ **485 commits old** — re-run before quoting |
| `check-derived-classification` | `2b636854` | 2026-08-12 | 478 | ⚠ **478 commits old** — re-run before quoting |
| `check-derived-not-authored` | `e5addac8` | 2026-08-11 | 546 | ⚠ **546 commits old** — re-run before quoting |
| `check-no-dark-test-files` | `b76e5d91` | 2026-08-14 | 188 | ⚠ **188 commits old** — re-run before quoting |

<!-- TRACKER:AUTO:END -->

---

# §12 — SESSION DELTA 2026-08-15 (afternoon fleet) — measured movement AFTER the §1 restamp

> **These readings post-date the §1 distribution.** They are recorded here rather than folded into
> §1 because folding them in without re-running every row's instrument is exactly the inheritance
> §0 forbids. **§1 remains the counted position; §12 is what moved since, each line with the SHA
> and the reading its lane measured.** The next restamp reconciles them.

## §12.1 — Rows that moved, with executed evidence

| Row | Movement | SHA | Reading the lane measured |
|---|---|---|---|
| **MT-10** | REGRESSED → **FIXED** | `0064df08` | `check-xss-guards` GREW OverridePanel 1→3 (exit 3) → ✅ 0 new unguarded sinks, 547 baselined over 142 files. The breach was COMMITTED and shipped in `9e780581`; found by the recount, not by a gate run in CI |
| **GE-09** | 71 → **67** | `ebaf651f` · `1f1df248` | `check-refusal-identity` exit **0**, arm A 38→34, arm B 33, **zero stale**. `packages/command-registry` is now FULLY drained — zero baseline rows in the whole package. Remaining 67 are `plugins/slab` ×9, `apps/editor/ui/apartment-layout` ×7, `site-parcel-data` ×6, … |
| **Bar 3** (GR-12 family) | 126 → **125** | `d572fb7e` | `check-relationship-determination` (now runner-registered) exit 1 DECLARED-LEVEL; reaching verbs 9→10, refusal-BLOCKED 315→350, structurally-answerable 54→60 |
| **plan-determinism** | 6/5 → **6/6** | `d572fb7e` | exit **0 CLEAN**, ARM 4 debt paid in the same commit; all three ARM 2 pairs verified BY MUTATION |
| **GR-12** (roof) | blocker half-cleared | `f5a2c726` · `6cd4e8e5` | the L0 field landed additive-optional; *"the roof reference was never missing — L0 had nowhere to put it"* |
| **PR-11** | handler half real | `278b99e5` | tri-state determination with 4 reasons reused from C78 §8.1; differentiation PROVEN by running against a no-op (6 fail) and a wrong-impact stand-in (6 fail, DIFFERENT set) |
| **GE-06** | 12 verbs now REFUSE | `8de42e12` · `c2162b05` · `2bcc07ce` | 0 implemented / 12 refusing, `ENGINE_NOT_AVAILABLE` (C80 §1.4). **Row stays OPEN — refusals are not detectors** |
| **CO-06** | familyCreatorPlaceholder resolved | `a646eb94` | *"the twins were never twins; one is DEAD, one is LIVE"* |
| **MT-07** | decision transcribed | `e9f4f2b1` | **ADR-0327**. The row undercounted: **two real authorities, one PHANTOM, two miscounts** |
| **L-916** (no row — see §12.3) | founder defect CLOSED | `fc88e454` · `c100df8f` | measurement alone first, then §L-916-FRAME-RECORD-SYNC at all six `updateOpening()` call sites; pins flipped, one Ctrl+Z restores both records |
| **CE-05** | census landed | `e08869f9` | exit 1 at a shrink-only ledger of 80. **`EXECUTED-REACHED 0 / 230` BY CONSTRUCTION** — the census is done, the driving is not |
| **13 orphan gates** | 11 registered | `df0f6692` | 2 REFUSED (`check-index-can-refuse`, `check-region-reference-frame`) — both at exit 3, which no ledger may absorb |
| **verb-register · secrets-register** | RED → clean | `3afcac71` | derived documents had drifted from the code they describe; verb-register is hard-0 on NO ledger |
| **epsilon · predicate-canonical** | breaches paid AT SOURCE | `703d9404` | both back to declared/hard-0 — the debt this session's own feature work minted |

## §12.2 — ⭐ FINDINGS THAT CHANGE WHAT A ROW MEANS (each contradicts its row's premise)

Every lane that closed today found its row's premise **partly wrong**. That is the instrument
working, and it is the most important output of the fleet:

1. **PR-11's registry does not exist.** `new CascadeRunner()` appears **only in test files,
   repo-wide.** `registerCrossHandlers` having zero callers was never a wiring oversight — there is
   no live registry in production to register into. The row said "implement the handler first"; the
   handler is now real and the residual is a composition-root capability that was never stood up.
   **This is a C72 concern and it is recorded there.**
2. **GE-09's gate was silently RED.** The inherited work paid four baseline rows at source and
   struck ONE, leaving 3 stale entries and exit 3. Direction matters: a dead row cannot pass a real
   regression, but **it can absorb a NEW violation at the same file silently.**
3. **GE-06's detector already exists, unwired.** `geometry-roof` carries an oracle-tested roof×wall
   detector in state **`EXISTS_BUT_UNWIRED`** — deliberately kept a distinct third state from
   `REGISTERED` so it cannot be counted as coverage. This is what PR-10 needs.
4. **Two rival clash id sets.** The bus declares 12 `clash-*` ids; the toolbar declares a
   *different* 12, and **only 3 overlap.**
5. **A driver-parity defect in refusal rendering.** `executeChunked` rendered the machine token
   `'WALLS_PARALLEL'` where `execute()` rendered the sentence — **the load path and the interactive
   path disagreed about what the same refusal says.** Only a parity arm could catch it.
6. **The wall.delete inheritance did not compile.** A backtick-quoted `relationship:*/cannot-refuse`
   inside a JSDoc block terminated the comment (40+ TS1434/TS1005), and `BoundingWallsQuery` was
   imported from a barrel that does not export it. **"It is in the tree" and "it works" are
   different claims.**
7. **MT-09's skip list is a hard-coded map, not a measurement.** So the true position is **35 of 94
   tsconfig-bearing packages unproven in isolation, not 26** — and the list contains
   `command-registry`, `core-app-model`, `runtime-composer`, `ai-host`.

## §12.3 — MT-06 stopped being theoretical

**MT-06 (rival opening authorities) arrived as a user-visible production defect the same day it was
listed as a tidiness row.** The founder moved a wall; a window's VOID stayed correct while its FRAME
walked 2.26 m, leaving a clean hole with no frame in it (ISSUE-LOG L-916). Root cause measured: a
hosted opening is described TWICE — `WallData.openings[]` (drives the void, PERSISTS) and
`windowStore`/`doorStore` (drives the frame mesh) — and `WallStore.updateOpening()` writes the first
only, because `geometry-window`/`geometry-door` import `geometry-wall` and the reverse edge would be
circular.

`c100df8f` is the **"written together"** half: one seam, all six call sites, both records or
neither. **It is explicitly NOT MT-06.** MT-06's own fix — one authority, the rival deleted — would
make the defect **unrepresentable** rather than corrected, because no second number would exist to
disagree.

> **The lesson, recorded because it will recur: rival authorities do not stay theoretical.** A row
> that reads as architectural tidiness in the morning is a hole in a wall by the afternoon.
