# BIM 3.0 — Master Completion Tracker

> **Stamp**: created 2026-08-13 · **Status**: LIVING — updated on every commit that closes a row
> **Purpose**: the single file the founder can open to see, without asking, exactly how far BIM 3.0
> is from completion, what each phase delivers **as a user-visible capability**, and what is left.
> **Authority**: subordinate to [C70](../../02-decisions/contracts/C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md)
> (what BIM 3.0 *is*) and [C78](../../02-decisions/contracts/C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md)
> (the universal rule). Sequencing follows
> [BIM30-IMPLEMENTATION-ROADMAP.md](BIM30-IMPLEMENTATION-ROADMAP.md); this file adds **status and
> capability**, which the roadmap deliberately refuses to carry.
> **Row ids** are the 84 rows of [BIM30-GAP-REGISTER.md](../../04-reference/BIM30-GAP-REGISTER.md).
> This file **cites** them; it never restates their content (C70 §0.2).
>
> ### ⚠ THIS IS ONE OF THREE PROGRAMMES, NOT THE ONLY ONE — and they must never be merged
>
> | Programme | The question it answers | Its denominator | Its tracker |
> |---|---|---|---|
> | **BIM 3.0 — TRUST** | *when the model changes, does PRYZM stay truthful?* | **82 register rows** | **THIS FILE** |
> | **GENERATIVE QUALITY** | *when PRYZM generates a design, is the design correct?* | **28** = 4 typology packs × 7 readiness gates | [GENERATIVE-QUALITY-MASTER-TRACKER.md](GENERATIVE-QUALITY-MASTER-TRACKER.md) |
> | **THE EDIT LAYER** | *can PRYZM change a design and keep its intent?* | **not yet enumerable** — see below | *ibid.*, §2.3 (its Phase 3) |
>
> **Do NOT fold generator-quality or edit-layer work into the 82.** That denominator measures model
> trust under change; a generator can produce a sealed bedroom in a model whose relationship graph
> is flawless, and a model can lose a moved wall in a plan whose circulation is perfect. The failure
> modes are independent, so the counts must be. Merging them would destroy the meaning of `X/82`
> and no arithmetic would recover the split afterwards. **Cross-reference freely; never merge.**
>
> **The edit layer is hard-preconditioned on bar 3 of this programme** ([roadmap §3.1](BIM30-IMPLEMENTATION-ROADMAP.md#31--️-three-different-bars-and-this-roadmap-only-sequences-the-first)):
> `check-relationship-determination` does not exist, and 4,018 of 4,100 cells are SILENT. An edit
> engine over a 98 %-silent relationship product would not preserve intent — it would destroy it
> silently. **Bar 3 is therefore not only this programme's open question; it is the gate another
> programme is waiting behind.**

---

## ⏱ THE NUMBER — read this line and stop

> ### **41 % COMPLETE · 59 % REMAINING** — mid-session recount; end-of-session restamp IN FLIGHT
> **34 of 82 classified gap-register rows CLOSED** · 33 OPEN · **15 UNPROVEN**
> (C70 §2.2: UNPROVEN is *neither* a pass nor a fail — it is "nobody looked").
> Source: the register's §9.0 recount at `7028060c`, produced by executed gate runs at `b61f0ba3`
> (lane L1, 2026-08-13 mid-session). That register is the authority; this line only quotes it.
>
> ⚠ **The figure's own history, recorded rather than quietly swapped**: 33 (looser pass, wrong) →
> 25 (the register's stricter pass, which split UNPROVEN out as its own state) → **34, by
> execution** (`0c4ab1f6` + `7028060c`: nine rows closed on EXECUTED readings, two left UNPROVEN
> by measurement). Every step was a recount, never an increment (§0.3).
>
> ⚠ **RECOUNT IN FLIGHT**: the 34 was taken **mid-session** while seven lanes were still landing
> commits; ~17 commits followed `b61f0ba3`, including GE-11 going CLEAN hard-0, prevstate reaching
> hard-0, constraint-honesty reaching 2 and predicate-canonical reaching 7. An **end-of-session
> re-verification pass (lane L14) is restamping every row**; where it disagrees with the 34, the
> later execution wins — and **GR-09 may be RE-OPENED** by it (runtime `sitsOn=[]` evidence).
> Per §0.3 this line will not be adjusted until that recount produces its figure.
>
> | | |
> |---|---|
> | **Complete** | **41 %** — 34 rows, executed mid-session recount (`7028060c`) |
> | **Remaining** | **59 %** — 33 open, 15 unproven |
> | Session-end gate cover (L-852) | ALL GREEN / stale-free: move-propagation **3/3** · no-empty **85/85** · prevstate **hard-0** · room-aabb **CLEAN** · predicate-canonical **7/7** · constraint-honesty **2/2** · xss 0 · plan-determinism 0 · deterministic-regeneration 134/134 (**re-anchored — debt MOVED, not paid**, `f36015e5`) |
> | Blocked by founder decision | Ladder L7 + L8, all 4 collaboration rows |
>
> **Do not quote the gate cover as capability.** It measures whether we can *see* defects, not
> whether they are fixed. The single honest headline is **41 %**, and §1 explains what it hides.

---

## ✅ §-3 — HOW WE WILL KNOW IT WORKS FOR **ALL** ELEMENTS, NOT JUST WALLS

> ### ✅ UPDATE 2026-08-13, end of session — §-1's defect is HALF FIXED (`798f2cfd`)
> **The slab now follows a moved wall: 0 rebuilds → 1.** Both `SlabDependencyTracker` and
> `SlabWallConnectivityService` guarded on `e.detail.slab`, a field the store has never sent
> (it sends `{ id }`), so `registerSlab()` was unreachable and the dependency graph stayed empty.
> `check-move-propagation` **7/7 → 6/6**.
>
> **Still broken, and NOT to be assumed fixed:** the **stored polygon** does not follow — 36.000 m²
> drawn vs **24.000 m² recorded** — so schedules, take-off and export read the pre-move shape.
> **Browser behaviour is UNPROVEN** (unit harness only). **Walls still do not extend to join.**
> See the brief's §2.0.

> **The founder's question: "before BIM 3.0 is closed, how do I know this works 100 %, for every
> element — not only walls?"**
>
> **The answer is one gate, and it does not exist yet.**

Every audit so far has measured **one row at a time** and then asked a human to generalise. That is
the whole problem: `wall.move` is proven, and the proof does not transfer. C78 §20 already names
the instrument that would settle it — **`check-relationship-determination` (U-INV-1)** — and
**measured 2026-08-13: the file does not exist.**

### What that gate must do (and why nothing else answers the question)

1. **Enumerate the denominator, and exit 2 if it cannot.** The full
   `(element kind × relationship × operation)` product, derived from the registries — *not* a
   hand-written list, which would silently shrink to whatever we already pass. C70 §5.2: a verdict
   over an unestablished subject is not a verdict. **A count of passing cells without a count of
   cells is the empty-seed lie.**
2. **Require every cell to be one of three things** (C78 §1.1) — DETERMINED-affected ·
   DETERMINED-unaffected · **UNDETERMINED with a typed reason from the 11-member union.**
   A cell that is silent is a failure; a cell that honestly refuses is a **pass**.
3. **Never infer "unaffected" from absence** (C78 §1.4). `0 dependents` and `I could not determine
   dependents` must be distinguishable at the caller — the defect that made a room tell the AI the
   building has no walls.
4. **Named, shrink-only ledger.** Every unwired cell listed by name so the count cannot drift.
5. **Land RED**, at the honest first reading. Today that would be most of the grid below.

**When that ledger reaches empty — or every remaining entry is a founder-signed exception — BIM 3.0
is closed for all elements. Not before, and no amount of per-family green substitutes for it.**

### Why this is now buildable, and was not last week

The audit's blocker C.1 — *"`ConsequencePlanner<WallMoveCommand>` is hard-bound; everything else
waits behind this"* — **is dead** (see §-2). With the registry generic and three families
registered, a universal gate has something real to iterate over. Before that, it could only have
measured one family and a wall of N/A.

### The three that still have no owner

From the audit's §F, updated: **floor-finish dependency** (references now written, **0 consumers**),
**slab/finish as predicted consequences**, and **constraint evidence for 16 of 17 families**.
Real transport stays founder-blocked. Those four are what the gate will keep red until they land.

---

## 🎯 §-2 — WHAT "DONE" ACTUALLY MEANS (read before §-1, or §-1 will mislead you)

> **§-1 below is ONE EXAMPLE. It is not the goal.** The goal is that **every element is fully
> wired to every element it relates to, for every operation** — and where it is not, the system
> says so in a typed voice.

The wall→slab case is a single cell in a large matrix. C78 states the real bar directly: for
**every `(element, related element, operation)` triple**, the answer must be
**DETERMINED-affected · DETERMINED-unaffected · UNDETERMINED-with-a-typed-reason** — and
**C78 §19.1 applies no-partial-credit ACROSS that product**, not just along one chain.

### The authoritative matrix — from the 2026-08-12 certification audit, with 2026-08-13 deltas

That audit's verdict was **Zero GREEN · Five YELLOW · Nine RED**, and its decisive measurement was
**2 planners · 4 dependency trackers · ceiling, roof, stair, floor-finish and level with ZERO
`wallStore.subscribe`**.

| SOURCE → DEPENDENT | 2026-08-12 | **2026-08-13 delta** |
|---|---|---|
| wall → **wall** | 🟡 | 🟡 unchanged |
| wall → **junction** | 🟡 | 🟡 unchanged — still the only fully plan-bound arrow |
| wall → **opening** | 🟡 tracker-only | 🟡→ **real planner landed** (`cb3d59c6`), 5 of 6 matrix columns |
| wall → **room** | 🔴 | 🔴 unchanged |
| wall → **slab (region)** | 🔴 no ref | 🔴 **refs now correct; root cause PINNED** — §-1 |
| wall → **floor finish** | 🔴 no edge at all | 🔴 **refs now written**, 0 consumers |
| wall → **ceiling** | 🔴 | 🔴 **refs now written**, 0 consumers |
| wall → **stair** | 🔴 | 🔴 unchanged (delete-purge + verbatim undo landed) |
| wall → **roof** | 🔴 MEASURED-ABSENT | 🔴 **structurally blocked** — no field can hold a ref; Zod strips it |
| level → **everything** | 🔴 strands 11 types | 🔴 delete-purge landed; move still unmeasured |
| wall → **constraints** | 🟡 1 of 17 evidenced | 🟡 unchanged |
| wall → **graph** | 🟡 | 🟡→ **8 of REQUIRED 9** families have writer + typed reader |
| **generated elements** | 🔴 no verb at all | 🔴→ **`room.regenerate` exists and REFUSES honestly** (GEN-GAP-1) |
| **AI-proposed** | 🟡 DECLARED | 🟡 unchanged — the AI half is structurally undispatchable |

### 🟢 THE ARCHITECTURAL BLOCKER IS DEAD — verified 2026-08-13

The audit's blocker **C.1** read: *"`ConsequencePlanner<WallMoveCommand>` is hard-bound — no second
family can register. **Everything else waits behind this.**"*

**It no longer holds.** `ConsequencePreviewService.ts:312` now types the map
`ReadonlyMap<string, ConsequencePlanner<never>>`, its docstring records the old signature, and
**three planners are registered** (`consequencePreviewServiceComposition.ts:65, 71, 82`). Opening
the third row cost *one* `planners.set` in one shared factory — no service class was edited.

That was the gate on every other family. **The pattern is now generalisable, and the remaining 🔴
rows are work rather than redesign.** Of the audit's five blockers, C.1 is closed, C.4 (floor
finish had no dependency edge) is closed at creation, and C.2/C.3/C.5 stand.

**⬜/🔴 is still the majority, and 🔴 is not "probably fine" — much of it was ⬜ UNMEASURED until
this week.** Measuring turned several ⬜ into 🔴, which is why the counted percentage *fell*. That
is the program working: **you cannot wire what you have not proven is unwired.**

**The end state**: every cell reads ✅ or carries a typed, named refusal. Not one flagship
operation working — *all of them, or an honest "I cannot determine that" per cell.*

> **Why §-1 still leads**: `wall → slab @ move` is the cell the founder asked about first, it has
> a pinned root cause with a worked precedent, and — most importantly — **its fix pattern is the
> template for most other 🔴 move cells**, which fail the same way: a reference written at
> creation that nothing reads at mutation time.

---

## 🔴 §-1 — THE WORKED EXAMPLE, AND THE FIRST CELL TO CLOSE (2026-08-13)

> **The founder's original question — *"closed polyline of walls → slab by region → move a wall —
> does the slab follow?"* — is ANSWERED. It does NOT follow. And the cause is a two-word bug.**

Measured by an executed probe (`packages/geometry-slab/__tests__/c79MovePropagation.test.ts`), which
first proved it could *detect* a non-following slab before being trusted (C74 §3.4).

| § | Measured |
|---|---|
| §1 | **The re-projection MATH is correct.** The production sketch→polygon path tracks a moved centreline exactly, and is idempotent and order-independent. |
| §2 | **A slab created after the tracker is wired NEVER re-projects — 0 rebuilds.** Positive control: the same harness *does* observe a rebuild after `tracker.bootstrap()`. |
| §2 | **ROOT CAUSE, pinned:** the store emits `{ id }`; **all three tracker listeners read `{ slab }` / `{ slabId }`.** An event-shape mismatch. |
| §4 | The mesh follows; **the stored polygon does not** — the sketch resolves to 36 m² while `slab.polygon` still says 24 m². |
| §5 | **Finish references are CORRECT and read by NOTHING.** Structural: the finish edge uses `{x,z}`; the only resolver in the tree returns `{x,y}`. |
| §3 | **C79 §5.2's five states are NOT distinguishable** — `preserved` and `undetermined` are **byte-identical**, the §5.2.1 FORBIDDEN COLLAPSE, executed. |

**What this means, stated plainly:** today's work made **11 of 11 region paths carry correct host
references at creation** — and *almost nothing consumes them at move time*. The reference graph is
real, the maths is right, and the wire between them is cut. This is C70 §4.2's *machinery present ≠
capability reachable*, at the centre of the product's core promise.

**Why this is good news:** the cause is small, named, and pinned to the line — **and it has a
worked precedent in this repo.**

> **THE FIX, located.** `SlabStore.emit` fires `bim-slab-{added,updated,removed}` with the
> F.events.18 payload **`{ id }`** (`packages/event-bus/src/catalog.ts:95-97`), while
> `SlabDependencyTracker.ts:57-67` guards on **`e.detail.slab` / `e.detail.slabId`**. So
> `registerSlab()` is **unreachable from the event path** and the dependency graph stays empty.
> Only `bootstrap()` (`initTools.ts:828`, run **once** at wiring) ever fills it — and the gate's
> positive control proves *that* path works, so the machinery is sound and only the wire is cut.
>
> **`initBuilders.ts:367-383` was fixed for this EXACT shape mismatch in May**
> (§DOM-EVENT-LISTENER-AUDIT-2026-05-18). The two trackers were not.
> **`SlabWallConnectivityService.ts:115-122` carries the identical defect.** A known bug class,
> fixed in one place and left in three.

**Gate: `check-move-propagation` — [1] DECLARED-LEVEL at 7/7**, 4 families, 7 arms, 4/4 controls.
⚠ Its first pin of **3** was WRONG and the gate caught it: that run had a failing positive control,
so four arms never reached a verdict and their findings were invisible. Pinning 3 would have
declared a level *below* the truth. It exited **2 MISCONFIGURED** instead of scoring over an
unproven subject — a live demonstration of why "0 findings" without "N examined" is the empty-seed
lie. **This is the highest-value single fix available in the program** and should be the first work
of the next session.

---

## §0 — How to read this file

**Three states, never collapsed** (C70 §2.2): **PASS** = executed evidence it works ·
**FAIL** = executed evidence of a defect · **UNPROVEN** = nobody measured. UNPROVEN is *not* a
soft pass. Most of this program's progress in its first week was converting UNPROVEN → FAIL,
which looks like regression and is the opposite.

**Two axes, never averaged into one number:**

| Axis | What it means | Why it must stay separate |
|---|---|---|
| **INSTRUMENTATION** | gates exist, prove their subject, and have been watched go red | fast to build; proves nothing about capability |
| **CAPABILITY** | the editor actually does the thing correctly | slow; this is what a user experiences |

A gate that exists and reads RED is **instrumentation complete, capability zero**. Reporting a
blended percentage hides exactly that distinction, which is why §1 carries two numbers.

> **§0.1 — MUST.** Every commit closing a row updates this file **in the same commit**. A row
> marked closed with no commit sha is not closed. This mirrors C70 §5.4: debt leaves the ledger in
> the commit that pays it.

> **§0.3 — MUST. The headline number is COUNTED, never carried forward.** The ⏱ block above is
> re-derived by an executed measurement pass — running the gates and counting register rows — not
> by incrementing the previous figure as lanes report. Lane reports are evidence *for* a recount,
> never a substitute: an orchestrator adding up self-reported wins is precisely the BY-READ mode
> C70 §0.1 forbids, and it is how a number drifts optimistic one honest step at a time. Each
> headline carries the HEAD sha it was measured at; if that sha is behind, the number is stale and
> must say so rather than be adjusted by hand.

> **§0.2 — MUST NOT.** No percentage in this file may be computed across both axes, and none may
> be quoted without its numerator and denominator. C70 §3.2 forbids "90 %" as a capability claim;
> the fractions here are **coordination aids**, not capability claims.

---

## §1 — Where we are (updated every closing commit)

**Last measured: 2026-08-13.**

### Capability — the number that matters

| Measure | Reading | Source |
|---|---|---|
| Golden operations holding the full 11-link chain | **1 of 5** | `wall.move` (`867e128c`) |
| Golden-operation **matrix cells** | **16 of 30** (was 6) | `wall.create` (`46d06234`) and `opening.move` (`cb3d59c6`) each fill 5 of 6; AI parity stays `—` for both — structurally, not by oversight |
| Region paths conforming (C79 §6.3) | ✅ **11 of 11 — gate exit 0 CLEAN** | `625a9926`, `86030325`, `9fd9c5b6`, `f1825a2b`. Was **1 of 6** this morning. ⚠ A green §6.3 is **attribution-at-creation only** — §5.2's five recomputation states stay UNPROVEN, so *"the finish follows when its wall moves"* is **NOT** claimed |
| Element kinds purging relationships on delete | **9 of 19** | `check-graph-delete-integrity`: 20 → **10** findings (`ca0a7ce3`, `86776ddf`, `7546ce0f`, `19825e25`, `76d42dd9`, `03e93609`) |
| Gates at exit 3 (never absorbable, C70 §5.1) | **9 → 0** | `96939dd4`, `719452a7`, `a0fedd87`, `e45752e4`, `89623324` + plant-debris removal |
| Dependency indexes that can genuinely refuse | **1 of 10** | `check-index-can-refuse` (`6d87f324`), 9 findings |
| Relationship families with writer **and** typed reader | ✅ **8 of the REQUIRED 9** | `check-graph-write-coverage` exit 1 at **2/2** (was 5). Only `partOf` shows ✗, and it is **DECLINED not deferred** — a 36-reader census found no consumer, and C71 §2.5 forbids writer-first unparking without an ADR naming the first consumer |
| Files returning `[]` to mean "could not determine" | **105 files** | `check-no-empty-means-unknown` (`3fd164a1`) |
| Element kinds carrying provenance | ✅ **27 adopted; ledger 28 → 1** | `check-provenance-coverage` [1] at 1/1. ⚠ **`27 covered ≠ provenance populated`** — every kind defaults to `predates-provenance`, which is honest and empty. **Instrumenting the producers is the real work** and is C75 §6.3(b)'s recorded blind spot |

### Instrumentation

| Measure | Reading |
|---|---|
| C70 §7 gates existing at HEAD | **10 of 10** (`ff421f96`) |
| BIM 3.0 gates built this week | **~10 new**, each negative-tested |
| Geometry axis has an executed subject | **YES** — 64 meshes / 912 tris (`221fdef7`) |
| Certification suite exit | **was 3, now 0 on the undoredo row** (`fbed1a7d`) |

### The honest headline — MEASURED 2026-08-13, replacing an earlier estimate

An executed measurement pass (34 gates run, register + roadmap + C70 §4/§6 + C78/C79/C80 read
row-by-row) replaced the estimate that used to sit here. **The estimate was wrong and is recorded
as wrong**, per §7.a.

| Denominator | Closed | Fraction |
|---|---|---|
| **Register gaps (the headline)** | ~~33 / 82~~ → **25 / 82** | **30 %** ← superseded by the register's stricter pass; see ⏱ above |
| Roadmap phases fully MET | 0 / 11 | 0 % |
| C70 Definition-of-Done conditions MET | 1 / 8 | 13 % |
| Ladder levels awarded above L4 | 0 / 4 | 0 % |
| Golden-operation matrix cells | 6 / 30 | 20 % |
| C78 U-INVs satisfied | 2 / 14 | 14 % |
| C79 conformance rows | 8 / 11 | 73 % |
| C80 gates built | 2 / 5 | 40 % |
| **Gates at exit 0 or 1** | **32 / 41** | **78 %** ← *the instrument, not the building* |

> **40 %, not 70 %.** The "70 % feeling" comes from the last row: the gate suite is ~78 % green.
> That measures **the thermometer, not the fever.**

**Four things a single percentage would hide** — each measured, not asserted:

1. **The closed rows are disproportionately instrumentation; the open rows are disproportionately
   capability.** Nine of the 33 closures are "the gate was unbuilt, now it exists". The 47 open
   rows contain *every* missing algorithm (2-D boolean, clash engine), *every* provenance field,
   and *all four* collaboration rows. **The remaining work is structurally harder, not merely
   more.**
2. **Nine gates sit at exit 3**, which C70 §5.1 makes *never* absorbable — so any percentage today
   is computed over a suite whose own aggregate verdict is RATCHET EXCEEDED. Five are stale
   ledgers (~1 h). Three are real breaches, worst `check-deterministic-regeneration` at **134
   against a declared 0**.
3. **Almost everything proven is proven for `wall.move` and nothing else.** Five gates read exit 0
   — all wall-scoped. Read as *"the loop works"*, true. Read as *"the product reasons about
   change"*, **20 % true**.
4. **Two gates are green in a way not to be trusted, and are counted as UNPROVEN here:**
   `check-collab-graph-integrity` returned 0 while its own spec says that is structurally
   impossible without a deployed transport; `check-ai-human-parity` says in its own output which
   half it had to **simulate**. UNPROVEN wearing a pass's clothes is the precise failure C70 §0
   was written about.

**What is genuinely strong, stated so this is not one-sided:** **zero exit-2 MISCONFIGURED across
34 executed gates.** Every gate established its subject. Given this repo's founding trauma — ~15
gates green and blind at once, an empty seed outscoring every real run — that is the hardest-won
result in the program, and it is why DoD condition 8 (falsifiability) is the one condition MET.

> ⚠ **The gap register itself is ~199 commits stale** (header `a8f15234`, HEAD is far past it) and
> carries no status column. Every closure above had to be reconstructed from commit subjects and
> executed gate runs. **Reconstruction from commit subjects is BY-READ**, and this repository has a
> documented history of BY-READ reading better than executed. Re-stamping the register is itself a
> named task (see Phase A.11).

> **Levels 7–8 remain FOUNDER-BLOCKED** and cannot be scheduled by any amount of engineering
> (C70 §2.2, roadmap Phase F).

---

## §2 — The phase plan

Each phase states: **exit condition** (precise, falsifiable), **register rows**, **status**, and
**the capability a user gets when it closes**. Sub-phases are the unit of work and of commit.

---

### PHASE A — Instrument what exists · **95 % · nearly closed**

*Roadmap 0R + Phase 1. Every domain becomes scoreable; every gate lands, red, at a named ledger.*

| # | Sub-phase | Rows | Status | Evidence |
|---|---|---|---|---|
| A.1 | C71 graph gates ×3 | GR-11, GR-13, GR-14 | ✅ **DONE** | `4eedca8c`, `5fb70137`, `ff421f96` |
| A.2 | C72 suppression + prevState | PR-08, PR-09 | ✅ **DONE** | `2db42576`, `4dbed18f`, `a45327eb` |
| A.3 | C73 tolerance module + predicate gate | GE-01, GE-02 | ✅ **DONE** | `07173cdf` |
| A.4 | C73 determinism gate | GE-11 | 🔄 **IN FLIGHT** | — |
| A.5 | C75 provenance gates ×2 | PV-07 | 🔄 **IN FLIGHT** | — |
| A.6 | C78 index-refusal + no-empty gates | — | ✅ **DONE** | `6d87f324`, `3fd164a1` |
| A.7 | C79 region gates ×5 | — | 🔄 **IN FLIGHT** | `04f42918` (1 of 5) |
| A.8 | C80 generation gate | — | 🔄 **IN FLIGHT** | — |
| A.9 | CE-02 geometry axis subject | CE-02 | ✅ **DONE** | `221fdef7` |
| A.10 | **Integration commit** — register all in one suite | CB-03 | ⬜ **NEXT** | — |
| A.11 | ⚠ **Re-stamp the gap register** — ~199 commits stale, no status column, so nobody can answer "how far are we" from the document whose job that is | — | ⬜ **TODO — high leverage** | — |
| A.12 | ⚠ **Clear the 9 exit-3 gates** — 5 stale ledgers (~1 h) + 3 real breaches (`check-deterministic-regeneration` 134 vs 0, `check-provenance-not-invented` 6 vs 2, `check-no-empty-means-unknown` 99 vs 98). Exit 3 is NEVER absorbable (C70 §5.1) and the suite's aggregate verdict is RATCHET EXCEEDED until they clear | — | 🔄 **IN FLIGHT** | — |
| A.13 | ⚠ **Audit the two untrustworthy greens** — `check-collab-graph-integrity` exit 0 while its spec says that is impossible without a transport; `check-ai-human-parity` admits which half it simulates. Both must read UNPROVEN or prove their subject | — | ⬜ TODO | — |

**Exit**: every C70 §7 gate exists at HEAD, in one suite, under one `contract.ts`; zero exit-2s;
every exit-1 against a **named** ledger; every arm watched go red.

> **CAPABILITY DELIVERED**: *none directly — and that is the point.* What the user gets is that
> **every subsequent claim is checkable**. Before Phase A, "wall-move is safe" was an opinion.
> After it, it is a gate reading that can go red. The founder-visible benefit: **no capability can
> silently regress from here**, and no status report can flatter itself.

---

### PHASE B — Model truth & the first golden operation · **80 %**

*Roadmap Phase 2 + reasoning-loop R1–R6. Mutations land in nameable stores; `wall.move` proves the
whole loop end to end.*

| # | Sub-phase | Rows | Status | Evidence |
|---|---|---|---|---|
| B.1 | R1 consequence contract + envelope | — | ✅ **DONE** | `74c1b73e` |
| B.2 | R2 `wall.move` planner | — | ✅ **DONE** | `5a196e7d` |
| B.3 | R3 preview, pure, with a caller | — | ✅ **DONE** | `5ef3a01f` |
| B.4 | C78 §8 closed reason union (11) + typed `PreviewOutcome` | — | ✅ **DONE** | `ac06733f` |
| B.5 | Plan determinism gate (G-REASON-02) | — | ✅ **DONE** | `40d77a14`, exit 0 |
| B.6 | R4 execution consumes the plan + reconciliation | — | ✅ **DONE** | `867e128c` |
| B.7 | R5 the consequence report | — | ✅ **DONE** | `2fde7359` — gate was green over an untyped absence; new clause (f) drives the real producer |
| B.8 | R6 confirmation policy + approval binding | — | ⬜ TODO | — |
| B.9 | G-1 graph families restored on load | GR-17 | ✅ **DONE** | `a55ed23e` |
| B.10 | Undo does not walk the version counter | — | ✅ **DONE** | `fbed1a7d` |
| B.11 | command-registry visible to CI (281 tests) | — | ✅ **DONE** | `b60e21cc` |
| B.12 | MT-01 readback-positive verbs | MT-01…07 | 🟡 PARTIAL | — |

**Exit**: `wall.move` holds all eleven Golden Chain links, scored by the harness, with `prevState`
as the oracle.

> **CAPABILITY DELIVERED — the first thing a user can feel:**
> **The architect's what-if.** Drag a bedroom wall. *Before releasing*, a preview states:
> "Door D-04 refits · junction with W-12 re-welds · Kitchen 12.4 m² → 10.8 m²." Release on an
> illegal position and the move is **refused with both numbers**: "Kitchen would become 6.4 m²;
> minimum is 7.0 m²." Approval binds to that exact plan — if a collaborator moved something in
> between, the approval is refused and a fresh plan offered rather than silently applying a stale
> one. **One Ctrl+Z** returns wall, openings, junctions and room polygon together.

---

### PHASE C — Relationships that survive · **30 %**

*Roadmap Phase 3. Every REQUIRED relationship gets a writer, a typed reader, delete-purge and
verbatim undo. This is where "3 of 19 kinds" becomes 19 of 19.*

| # | Sub-phase | Rows | Status |
|---|---|---|---|
| C.1 | Delete-purge + verbatim undo: **stair, handrail, roof** | GR-05 | ✅ **DONE** (`ca0a7ce3`, `86776ddf`, `7546ce0f`) — 5 ledger rows struck |
| C.2 | Delete-purge + verbatim undo: **ceiling, floor** | GR-05 | ✅ **DONE** (`19825e25`, `76d42dd9`) — ceiling purge is one axis wider: execute() already unregistered fixtures/diffusers/skylights, stranding their edges too |
| C.3 | Delete-purge + verbatim undo: **level** | GR-05 | ✅ **DONE** (`03e93609`) — ⚠ **the ledger named the WRONG strand set.** "One edge per element on the level" is mostly unreachable (`canExecute` refuses with children). The reachable set is smaller and invisible to that guard: stair/lift register on the **base** level only, so **every top level carries two edges with empty `childrenIds`**, passes the guard, and leaves the resolver believing a dead level is still reachable by stair |
| C.3b | `opening`, `grid` — **no edge writers today**; rows are declared-coincidence, not live strands | GR-05 | ⬜ TODO (declare or write the writer) |
| C.3c | `addRelationship` idempotency ignored metadata — two stairs on one level pair shared ONE `connectedByStair` edge | GR-04 | ✅ **DONE** — optional `Relationship.authoredBy` discriminator. Chose author-keying over metadata-aware dedup because `joinedTo` re-emits every junction each flush with **changing** metadata, so metadata-aware idempotency would make the hottest write path duplicate-*creating*. **`connectedByLift` had it too** (two lifts per core is the common case). Identity threaded through **4 verbatim-restore paths** that dropped it — undo would have eaten the survivor — and through the graph rebuild, which re-collapsed the pair **on every project load** |
| C.3d | ⚠ **C79 §10.1 probe went RED** — `regionSketchPersistenceRoundTrip.test.ts` 10 failed / 6 passed; `ProjectSerializer` resolves `undefined` at dynamic import (barrel/circular-load hazard). **A contract claim resting on a red probe is the BY-READ failure C70 §0.1 forbids** | — | 🔄 **IN FLIGHT — high priority** |
| C.4 | 8 kinds that purge but restore nothing on undo | GR-06 | ⬜ TODO |
| C.5 | 5 kinds that reconstruct instead of restoring verbatim | GR-06 | ⬜ TODO |
| C.6 | `contains` — no writer on ANY path (IFC arm unreachable) | GR-04 | 🟡 **HALF DONE** — the **rebuild** half landed (`76a212aa`): reconstructed from `furniture.hostedSpaceId`, so it is REGENERATED like its seven neighbours, never guessed. An item with no `hostedSpaceId` writes no edge, because minting containment on load is the provenance-invented-on-load defect. The **live first-party writer** half is in flight |
| C.7 | `partOf` writer | GR-04 | ⬜ TODO |
| C.8 | `hostedBy`, `sitsOn` typed readers (`sitsOn` = 18 writers / 0 readers) | GR-07 | ⬜ TODO |
| C.9 | `measuredAt`, `decidedBy` persist-or-lose — silently lost today | GR-13 | ⬜ TODO |
| C.10 | The 105-file `[]`-means-unknown drain | GR-10 | 🔄 IN FLIGHT (readers of `boundingWallIds` first) |
| C.11 | `boundingWallIds` three-layer defect: writer + rebuild + readers | GR-17 | 🔄 IN FLIGHT |

**Exit**: every REQUIRED family has writer + typed reader + rebuild + mutation-update on **delete
AND move**; `check-no-empty-means-unknown` ledger drained; persist-or-lose ledger empty or
founder-signed.

> **CAPABILITY DELIVERED:**
> **Nothing silently forgets.** Delete a wall and every relationship it carried is purged — then
> **Ctrl+Z restores them byte-identically**, not "reconstructed approximately." Save a project,
> reload it, and the model knows the same things it knew before: which walls bound which room,
> what sits on what. And when the system genuinely cannot determine something, the panel says
> **"cannot determine: no dependency index for stair → slab"** instead of showing an empty list
> that looks like "nothing is affected." *This is the difference between a tool that is silent and
> a tool that is trustworthy.*

---

### PHASE D — The cascade across all elements · **20 %**

*Roadmap Phase 5 + reasoning-loop R7. Every element kind gets its planner; the AI reaches them
through the same verbs.*

| # | Sub-phase | Rows | Status |
|---|---|---|---|
| D.1 | C79 rows 6–8: floor/ceiling by region carry references | — | ✅ **DONE** (`9fd9c5b6`) — §10.3 decided: DERIVE FROM THE ROOM |
| D.2 | C79 rows 9–10: ceiling/floor plan tools gain region capability | — | ✅ **DONE** (`f1825a2b`) — new build, not repair (both had **zero** occurrences of `region`). Obeys §10.3: **no new tracer** — a thin adapter over the same `buildRoomFinishBoundarySketch` the row-6/7 commands call, so the repo's wall-tracer count is unchanged. Refusal path proven: an undetermined room boundary **refuses and creates nothing**, and consults the wall lookup **zero** times |
| D.2b | ⚠ **FINDING** — the plan tools' `floor.create`/`ceiling.create` bus dispatches route to the **plugin** handlers, not the fixed row-6/7 commands, and `plugins/floor/src/handlers/CreateFloor.ts:137` still writes `boundingWallIds: []`. Two rival creation paths for one element | — | ⬜ **TODO — own lane** |
| D.3 | `wall.create` planner — was **AUTHORED AND UNWIRED** (zero callers; the repo's signature hazard reproduced inside the flagship program) | — | ✅ **DONE** (`46d06234`, `4f9e8082`, `e878bdad`). The chokepoint was **not** the map: all three surfaces funnelled through `normalizeToWallMove`, which returns `null` for any other verb — a planner in the map would still have been dead. That is U-INV-5's *nominal genericity* exactly. Now one shared factory + a verb→rule map, so a third row needs no service edit. Determinism harness proven by mutation: injecting a clock/RNG residue turns **4 arms red**. `check-plan-determinism` **exit 0, 2 of 2 planners** |
| D.4 | `opening.move` planner | — | ✅ **DONE** (`cb3d59c6`) — three dispatch spellings (`door.setOffset`, `window.setOffset`, `opening.move`) map to ONE semantic planner, deliberately, so a door and a window on the same wall cannot get different collision answers. Four refusal shapes, each naming both numbers. Never-delete is **structural**: `topology.removed` is a literal `[]` with no parameter that could populate it (C70 F-INV-3). Harness proven non-inert by a **section-strip diagonal** — stripping each hashed section reddens exactly its own arm, zero cross-talk |
| D.4b | ⚠ **FINDING** — a producer emitted `RELATIONSHIP_NOT_READABLE` beside a sub-reason whose declared parent is `RELATIONSHIP_NOT_RECORDED`, contradicting C78 §8.3's ownership map. It survived 52 green tests because `refusal-vocabulary.test.ts` validates **the map, not the emitters**. Fixed, and a producer-side sweep added | — | ✅ **DONE** (`cb3d59c6`) |
| D.5 | `furniture.generate` planner | — | ⬜ TODO |
| D.6 | The remaining ~10 families dispatching with no preview | PR-01…07 | ⬜ TODO |
| D.7 | R7 AI/human parity gate green | — | ⬜ TODO |
| D.8 | Floor finish — no dependency at all today | GR-18 | ⬜ TODO |

**Exit**: all five golden operations hold their full chain; `normalize(human) === normalize(ai)`.

> **CAPABILITY DELIVERED:**
> **Every edit explains itself — and the AI is a colleague, not a separate system.**
> Move a stair, resize a slab, delete a column: each produces a plan or a typed "I don't know why
> not." Draw a wall through a room and it refuses *naming the split it would cause*. And in chat:
> *"widen all corridors to 1.5 m"* → the **same planner**, the same preview card, the same
> refusals, one approval, one undo. The AI literally cannot obtain a different answer than a
> script, because parity is gate-measured and the bus is blind to who is calling.

---

### PHASE E — Provenance at element grain · **5 %**

*Roadmap Phase 8 + R8. Every value knows how it came to be known. **This is the tightest knot:**
C78, C79 and C80 all consume it.*

| # | Sub-phase | Rows | Status |
|---|---|---|---|
| E.1 | Five-value vocabulary in `packages/schemas` | PV-03 | ✅ **DONE** (`57f2b539`) |
| E.2 | `check-provenance-coverage` per-kind ratchet | PV-07 | 🔄 **IN FLIGHT** |
| E.3 | PV-01: unknown origin no longer upgraded to authoritative | PV-01 | 🔄 IN FLIGHT |
| E.4 | Repair path writes INFERRED-with-reason | PV-02 | 🔄 IN FLIGHT |
| E.5 | Provenance field on all 29 element schemas | PV-04 | ✅ **DONE** — 27 kinds, ledger **28 → 1**, backward-compat test **274/274** (per kind: a pre-change record parses, lands on `origin: null` + `predates-provenance` never on one of the five, is byte-stable across a JSON round-trip, and differs from the original by only the added key). ⚠ **The inherited version was reverted for a reason worth remembering:** it spread `...elementProvenanceField`, and the indirection made the field **invisible to the gate measuring it** — 27 schemas carried provenance while the gate read `covered kinds: NONE`. It also hid the field from the §2.5 retrofit-safety arm. Its own docstring had argued against exactly that pattern |
| E.5b | ⚠ **The `water` fixture caught a test passing for the WRONG REASON** — the inherited backward-compat test derived its pre-change record from `parse({})`, which *throws* for water (`surfaceElevation > bottomElevation`; "an empty pool has no water element", ADR-0124). Two rejection arms would have gone **green on water for the wrong reason**, because a bad provenance and a zero depth both fail and `success === false` cannot tell them apart. Fixed with a fixture, an arm-0 baseline-validity floor, and a path assertion on every rejection | — | ✅ **DONE** |
| E.6 | Generators stamp provenance (D-TGL, D-FLE, D-CE, roof) | PV-06 | ⬜ TODO |
| E.7 | Provenance survives save→reload (round-trip test) | PV-05 | ⬜ TODO |
| E.8 | Export boundary: how the 5 values land in IFC/DXF | PV-08 | ⬜ TODO — **largest open risk** (C75 §5) |

**Exit**: every element carries an origin; `'unknown'` appears only on pre-migration data and is
never silently rewritten; `check-provenance-coverage` reaches its per-kind target.

> **CAPABILITY DELIVERED:**
> **"Who decided this, and how?"** Click any element — a wall thickness, a room area, a window
> head height — and get a truthful answer: *you drew this* · *measured from the survey* ·
> *computed from the model* · *inferred from a default, here is the assumption* · *regenerated,
> and here is what it replaced*. **A guess never wears your name.** This is the foundation for
> professional liability: an architect can defend a drawing because the model can say where every
> number came from.

---

### PHASE F — Regeneration you can trust · **10 %**

*C80. Generation becomes a verb, protects authored work, and is undoable in one press.*

| # | Sub-phase | Rows | Status |
|---|---|---|---|
| F.1 | GEN-GAP-1 `room.regenerate` as a bus verb (v1 refuses honestly) | — | ✅ **DONE** (`59187a0b`) — refuses as a **VALUE on `HandlerResult.refusal`, not a throw**, because `canExecute({valid:false})` throws and a throw is exactly what C80 §10.f's `catch {}` swallows. Zero mutations proven three independent ways through a real bus over a real `RoomStore`. `protects` names the `manual-boundary` rooms and cites GEN-GAP-2 |
| F.2 | `check-generation-is-consequential` gate | — | ✅ **DONE** (`ee93de31`) — **C80 §1's exit condition MET: 1 generation verb discovered, was 0.** The audit found one detector (`produceCommand`) that had never been watched fail: the claim was arm-grain, so a fourth forbidden shape inside arm (b) read as tested while being UNPROVEN (C74 §6.2). Driven, and given its own row |
| F.3 | GEN-GAP-2 authority: `may` / `protected` / `unknown-authority` per element | — | ⬜ TODO — blocks on **E.5** |
| F.4 | GEN-GAP-3 prior-run discovery (what did the last run produce?) | — | ⬜ TODO — blocks on F.3 |
| F.5 | The double defect: clear is too aggressive **and** too narrow | — | ⬜ TODO |
| F.6 | One generation = one undo (D-TGL, room detection) | — | ⬜ TODO |
| F.7 | GEN-GAP-4 the four NOT-EVALUATED verifications | — | ⬜ TODO |

**Exit**: a re-run in a fresh session returns `determined`; the authored room survives; the
duplicate-on-rerun defect is reproduced by a gate, then closed.

> **CAPABILITY DELIVERED:**
> **Regenerate without fear.** *"Make it 4 bedrooms"* → the plan says: **"regenerates 14 rooms ·
> protects your hand-placed front door and the wall you moved · 2 conflicts need your decision."**
> Today the measured truth is the opposite — regeneration **destroys** authored rooms, and a second
> run stacks a whole building on the first. That is why F.1 ships a verb that *refuses out loud*
> rather than one that pretends. **An honest refusal is a feature; a silent deletion is a defect.**

---

### PHASE G — Constraints & determinism · **25 %**

*Roadmap Phases 6–7. One tolerance policy, one implementation per predicate, no adapter reporting
a solve it did not perform.*

| # | Sub-phase | Rows | Status |
|---|---|---|---|
| G.1 | Declared tolerance module in geometry-kernel | GE-01 | ✅ **DONE** (`07173cdf`) |
| G.2 | Point-in-polygon canonicalisation (61 rival bodies → 1) | GE-02 | ⬜ TODO |
| G.3 | The other 4 predicate families | GE-03, GE-04 | ⬜ TODO |
| G.4 | Adapter honesty: no mock reporting a real solve | CO-01…03 | 🟡 PARTIAL (`c084f5ba`) |
| G.5 | `check-no-hidden-mock` baseline → 0 | CO-05 | ⬜ TODO |
| G.6 | Every constraint family carries a §1.1 classification | CO-08 | 🟡 PARTIAL (`7712d454`, `34664b30`) |
| G.7 | One `StairValidationAuthority` (duplicated today) | CO-06 | ⬜ TODO |
| G.8 | Violations become queryable model state, not log lines | CO-07 | ⬜ TODO |

**Exit**: C74 §7's seven conditions; every family's declared strength has executable evidence
**at that strength**.

> **CAPABILITY DELIVERED:**
> **The same model draws the same way twice, and a refusal names its rule.** No more "it looked
> different after reload." When a constraint stops you, it says **which rule and both numbers** —
> and the system never claims a solver did work a mock performed. *You can trust a "no."*

---

### PHASE H — Collaboration · **FOUNDER-BLOCKED**

*Roadmap Phase F. Not schedulable by engineering.*

| # | Sub-phase | Status |
|---|---|---|
| H.1 | Sync transport deployment decision | ⛔ **FOUNDER DECISION** |
| H.2 | `check-collab-graph-integrity` green against a real transport | ⛔ blocked on H.1 |
| H.3 | MT-08 the 250 ms window (3 `it.fails`, RED-BY-DESIGN) | ⛔ blocked on H.1 |
| H.4 | K-INV-2 merges losing authored state produce explicit conflicts | ⬜ TODO after H.1 |

> **CAPABILITY DELIVERED:** two architects on one model, edits converging property-by-property,
> **your undo reverting your gesture and never your colleague's**, and any merge that would discard
> authored work surfacing as a resolvable conflict rather than a silent overwrite.
> **⛔ Levels 7 and 8 of the maturity ladder cannot be awarded until H.1 is decided.**

---

## §3 — Definition of Done (C70 §6) — live status

| # | Condition | Status |
|---|---|---|
| 1 | Canonical test: 2 levels, stair, 6 rooms, graph rebuilt twice identical, one wall moved with `prevState` as oracle | 🟡 PARTIAL — geometry subject exists (`221fdef7`) |
| 2 | The 8 golden operations each hold their **entire** chain | 🔴 1 of 5 operations |
| 3 | VERIFIED reachable and reached | ⛔ needs transport (H.1) |
| 4 | Readiness gates green at declared levels with floors | 🟡 PARTIAL — Phase A |
| 5 | Every REQUIRED relationship: writer + typed reader + rebuild + delete AND move | 🔴 9 of 25 — Phase C |
| 6 | Persist-or-lose ledger empty or founder-signed | 🔴 3 named — Phase C.9 |
| 7 | Provenance complete at element grain | 🔴 ~1 of 29 — Phase E |
| 8 | Falsifiability proven in-run | ✅ **MET** — every gate negative-tested |

## §4 — Maturity ladder (C70 §4)

| Level | Requires | Status |
|---|---|---|
| **4** | derived topology auto-maintained | ✅ HELD — instrumented by Phase A |
| **5** | unified queryable graph as runtime service | 🟡 Phases A+C |
| **6** | constraint/dependency-driven | 🟡 Phase G — **C74 §4.5 authorises no solver until every family is classified** |
| **7** | collaborative versioned graph | ⛔ **FOUNDER** (H.1) |
| **8** | full BIM 3.0 | ⛔ **FOUNDER** (H.1) + all phases |

---

## §5 — Realistic schedule

| Milestone | Estimate | Gating |
|---|---|---|
| **CI gate closed** (roadmap §3 definition) | **1–2 days** | Phase A.10 |
| All 5 golden operations | **~2 weeks** | Phases B.7–B.8, D |
| Relationships survive (Phase C) | **~2–3 weeks** | parallel with D |
| Provenance at element grain (Phase E) | **~2–3 weeks** | E.5 is the long pole |
| Regeneration trustworthy (Phase F) | **~1 week after E** | blocks on E.5 |
| **Capability-complete except collaboration** | **~6 weeks** | all above |
| **L8 / full BIM 3.0** | **unschedulable** | ⛔ H.1 founder decision |

> **§5.1** These are coordination estimates, not commitments, and **not capability claims**
> (C70 §3.2). Closure is declared by executed gate runs, never by this table.

---

## §6 — Commit log (append-only; every row-closing commit)

| Date | SHA | What closed | Phase |
|---|---|---|---|
| 08-12 | `a55ed23e` | G-1: 3 graph families restored on load | B.9 |
| 08-12 | `ac06733f` | C78 §8 reason union (11) + typed `PreviewOutcome` | B.4 |
| 08-12 | `40d77a14` | Plan-determinism gate — exit 0 | B.5 |
| 08-12 | `625a9926` | Roof-by-region → shared tracer | D.1 |
| 08-12 | `4dbed18f` | Load-window pause/resume in try/finally | A.2 |
| 08-12 | `2db42576` | Suppression gate at the contract path | A.2 |
| 08-12 | `a45327eb` | Suppression ledger 43 → 41 | A.2 |
| 08-12 | `86030325` | C79 rows 2+3: slab 3D + pick-walls fallback | D.1 |
| 08-12 | `4eedca8c` | `check-graph-delete-integrity` — 20 findings | A.1 |
| 08-12 | `5fb70137` | `check-graph-persistence` — 3 findings | A.1 |
| 08-13 | `b60e21cc` | command-registry test scripts — 281 tests were invisible | B.11 |
| 08-13 | `91b605ce` | C71 §5.1/§5.3/§5.4 corrected by measurement | A.1 |
| 08-13 | `fbed1a7d` | Undo no longer walks the version counter | B.10 |
| 08-13 | `07173cdf` | Tolerance module + predicate-canonical gate | A.3, G.1 |
| 08-13 | `04f42918` | `check-region-host-attribution` | A.7 |
| 08-13 | `458c013a` | C79 §10.1 ANSWERED — region survives persistence | D.1 |
| 08-13 | `f2cf2297` | C79 §10.1 recorded with its contingency | D.1 |
| 08-13 | `6d87f324` | `check-index-can-refuse` — 9 findings | A.6 |
| 08-13 | `3fd164a1` | `check-no-empty-means-unknown` — 105 files | A.6 |
| 08-13 | `867e128c` | R4: execution consumes the plan + reconciliation | B.6 |
| 08-13 | `221fdef7` | CE-02: Geometry axis has an executed subject | A.9 |

---

## §8 — NEXT SESSION STARTS HERE (handoff, 2026-08-13, 63 commits)

### Do these first, in this order

1. **🔴 Fix the move-propagation wire (see §-1).** The store emits `{ id }`; all three
   `SlabDependencyTracker` listeners read `{ slab }` / `{ slabId }`. Pinned by
   `packages/geometry-slab/__tests__/c79MovePropagation.test.ts`. **Highest-value single fix in the
   program** — it is what makes "move a wall, the slab follows" true. Also fix the finish-edge
   `{x,z}` vs resolver `{x,y}` mismatch (§5 of that probe).
2. **Then re-run the probe** and watch §2 flip from *"0 rebuilds"* to a rebuild. That is the
   founder's question turning green on executed evidence.
3. **Then C79 §5.2's five states** — `preserved` and `undetermined` are currently byte-identical,
   which is §5.2.1's FORBIDDEN COLLAPSE. The re-derivation returns no state at all.
4. **Then RECOUNT the register** (`docs/04-reference/BIM30-GAP-REGISTER.md`) — it is status-bearing
   as of `c0a1785c` but predates ~40 commits. **Do not increment the headline by hand** (§0.3).

### Resolved at the very end of the session

- **MT-09 — MEASURED, no longer UNPROVEN.** `check-per-package-compile` completed on a long
  budget: **26 packages fail isolated compilation · 84 compiled · 9 skipped as known issues.**
  The register cited **27** from a commit subject nobody had verified; the real figure is 26, so
  roadmap Phase 9's `< 27` condition is met — **barely, and by measurement rather than by
  quotation.** The 26 are named in the gate's output.
- **GR-12's probe is committed** (`a1c052a9`, 16/16) — see §-1.

### ⚠ 18 GIT WORKTREES ARE LEFT BEHIND, 14 HOLDING 25 UNMERGED COMMITS

Not created by this session — they predate it. **Nothing was deleted, because a worktree holding
unmerged commits is somebody's unshipped work and removing it is destructive.** Decide per branch:

`agent/b2-perf` (7) · `agent/b1-snaplevel` (2) · `agent/b3-curvedhost` (2) · `agent/c1-isolation` (2) ·
`agent/c2-apex-nav` (2) · `agent/c7-confirm-panel-ux` (2) · `agent/c11-stray-logo` (1) ·
`agent/c12-element-types` (1) · `agent/c3-thumbnails` (1) · `agent/c4-typology-choice` (1) ·
`agent/c5-launch-readiness` (1) · `agent/c6-visibility-intent` (1) · `agent/c9-viewport-white` (1) ·
`envelope-badalona-08015` (1)

Also present with no unmerged work: `agent/c17-rake-ui`, `fix-hostwall-freeze`, `C:/pzd`,
`pryzm-baseline-wt`. Those are safe to prune with `git worktree remove` once confirmed.

### Known-good state at handoff

- **Root tsc: 0 errors.** ⚠ It **needs `NODE_OPTIONS=--max-old-space-size=6144`** — without it the
  compiler can **exit 0 while OOM-ing**, i.e. report a false green. Always pass the flag.
- **XSS: exit 0**, baseline tightened. Three sinks introduced by our own R5/R6 UI were closed; the
  `data-plan-hash="${…}"` one could **mint event handlers on the Confirm button**.
- Suites: command-bus 73/73 · command-registry 386/386 · core-app-model 801/801 ·
  room-topology 145/145 · schemas 1555 pass (3 **pre-existing** failures: water round-trip ×2 —
  a deliberate ADR-0124 refine, and view-template `detailLevel` ×1).
- **Not deployed.** Everything is local. Deploy gates are green *except* that the founder question
  above is answered NO, which is a product-honesty reason to fix first and ship after.

### Traps this session hit — do not re-learn them

- **`git commit` without `-- <paths>` takes the WHOLE shared index**, including other lanes' staged
  files. It happened twice (once to me). **`git commit --amend` is worse — it swallowed 31 files.**
  Always `git commit -F msg -- <explicit paths>`.
- **A lane going silent while holding uncommitted work is the default failure mode**, not the
  exception. Poll lanes by **file mtime and commits**, never by launch records.
- **Verify inherited work by execution, never by its author's report.** Two examples this session:
  a provenance abstraction that made its field **invisible to the gate measuring it** (27 kinds
  covered, gate read `NONE`), and a ledger row **struck as PAID on a free-text string** in a suite
  that never reaches the engine.

## §7 — Anti-patterns for this file

- **§7.a** Quoting a blended percentage across instrumentation and capability. §0.2.
- **§7.b** Marking a row closed without a commit sha. §0.1.
- **§7.c** Recording UNPROVEN as a blank, a zero, or a pass. C70 §8.k.
- **§7.d** Describing a phase as "90 % done" as though partial credit existed. C70 §3.2.
- **§7.e** Letting a capability claim outrun its gate. A gate that exists and reads RED means the
  capability is **absent and now visible** — not present.
- **§7.f** Scheduling Phase H. It is a founder decision; estimating it is fiction.

---

## §8 — SESSION 2026-08-14 · THE 30-AGENT SESSION · 220+ COMMITS

> **Authority: [`BIM30-NEXT-SESSION-BRIEF.md` §12](BIM30-NEXT-SESSION-BRIEF.md).** This section is
> the tracker-shaped view of it. Where they differ, §12 wins — it carries the executed readings.

### §8.1 — Where the programme stands

**~74 of 82 rows are closable on executed evidence. The register file still reads 34/82.** That gap
is not work; it is an unstamped file. Per §0.1 this tracker does not quote the higher number as
fact — it records that the evidence exists, names where, and leaves the counted figure to the stamp.

**Corroboration, new for this programme:** a 12-agent read-only verification workflow re-ran every
decisive gate independently and audited seven closure claims **refute-by-default**. All seven
CONFIRMED, every cited commit an ancestor of HEAD, every artefact present. The evidence base is no
longer self-reported.

### §8.2 — Instrumentation: what reached CLEAN

| Gate | Session open → close |
|---|---|
| `check-predicate-canonical` | 53 → **[0] CLEAN hard-0** |
| `check-provenance-export-boundary` | 5 → **[0] CLEAN** |
| `check-prevstate-contract` | → **[0] CLEAN, empty ledger** |
| **`check-conflict-surfacing`** | *did not exist* → built → **[0] CLEAN** (103 silent merges → 0) |
| `check-structuredclone-new-commands` | 135 → **exit 0, AT baseline 119** |
| `check-no-empty-means-unknown` | 85 → **71** |
| `check-no-dark-test-files` | 137 → **13** |
| `check-relationship-determination` (**bar 3**) | 134 → **132** |
| Root `tsc` | RED at close → **0 errors repo-wide** (PV-06 required a field three hand-built parts did not carry) |

⚠ **§8.2.a — the instrumentation finding that outranks the rest.** **Four committed gates are
registered in NO runner** — not `run-all.ts`'s `GATES`, not `ci.yml`, not `package.json`, and no
exemption allowlist exists: `check-derived-not-authored`, `check-deterministic-regeneration`,
**`check-predicate-canonical`**, `check-provenance-coverage`. This is §7.e's failure mode one level
up: not a gate that reads RED, but a gate that **runs nowhere**. `check-predicate-canonical` is the
instrument GE-02, GE-03 and GE-12 are measured against; `check-deterministic-regeneration` is one of
three GE-07 is recorded CLOSED on. Those readings are true when a human runs the script and enforced
never. **First action next session — cheaper than any row.**

### §8.3 — Capability: what a user can now do that they could not

- **A moved wall drags its floor finish and ceiling** — proven by reached behaviour (22.04 → 33.64 m²,
  exactly once), retiring the prior session's false green.
- **A house that seals a room says so** — a blocking, dismiss-only card naming the sealed rooms and
  the failed rule, replacing an unconditional green success toast.
- **A dropped furnish stage reaches the result** — lighting stamps `furnished`/`unfurnished` with a
  mandatory disclosure; the §CHAIN-TIMEOUT double-fire is dead. Root cause was **unsatisfiable**,
  not a short timer.
- **Generated buildings have units** — rooms are born carrying `unitId`; C81's precondition met for
  residential.
- **The BIM ribbon exists.** 30 professional toolbars had zero production importers and the editor
  had **no visible chrome host at all**. The host is visible, two surfaces mounted, and **all 276
  unbacked verbs refuse by name citing their SPEC-50 backlog row** instead of dispatching into
  nothing.
- **Roof-vs-walls clash is detected AND announced**, consuming an elevation delta the reconcile had
  always carried and always dropped.

### §8.4 — Defects nobody knew about, found by execution

1. **The AI relay was dead in production.** A bundler-evasion `Function('s','return import(s)')`
   resolved against the realm, so the configured branch **always threw** and the `catch` **always
   served demo layout fixtures as AI output**.
2. **P8 data loss**: whole-doc pending bookkeeping wiped after any merge → a second concurrent edit
   discarded **silently, 103 of 103 measured cases**.
3. **§CE04-RING-PIN**: the unified ring-buffer undo is **measurably less faithful than the legacy
   path it replaces** — ratchets class-2 counters, drops `_sourceBaseLine`. Plus
   `UpdateWallBaselineCommand` declares no `targetIds`, defeating U-8's shadow-drop: **one phantom
   Ctrl+Z after a gizmo wall move**.
4. **`boundedBy` is STALE** after a ring-breaking wall move (GR-12's first reading; the arm existed
   nowhere before this session).
5. **A dev-only module executed unguarded in the shipped editor**, with three production
   capabilities riding on it (split, then guarded).

### §8.5 — Rows that were WRONG IN THE HEALTHY DIRECTION

Re-measurement overturned five row headlines. Standing rule: **re-measure before building.**
MT-06's two opening stores hold disjoint facts and *cannot* diverge · MT-07's rival was deleted
months ago · GE-01's "geometry-kernel exports no epsilon" is false (four roles, eight consumers) ·
GE-09's "Invalid geometry" string exists nowhere user-facing · CO-10's premise was false (a
production caller exists; the real defect was the inverse).

### §8.6 — What 82/82 still needs

**Stamp-only (~8 rows):** the restamp, using each lane's drop-in evidence text.
**Small and owned:** MT-03's last verbs · the drain from 71 · PV-08 (pay it with
`check-provenance-coverage` FINDING C2 — same `floor` kind) · CE-05's mount queue.
**Founder, not engineering:** **CB-02 is one env flip** (`PgAuthz` is written, wired, tested,
fail-closed) · **CB-01 is ~$5–10/mo for one always-on process** (code half convergence-proven).
**Genuine construction:** CO-06's 57 scaffolds (⚠ close the gate's grace-clause loophole first, or
a bulk pay walks the ratchet down having bought nothing) · MT-04's 11 kind migrations · GE-06's
slices.
**Correctly unclosable:** CE-06 — a one-client fixture cannot prove a multi-client claim. Closing it
would be the lie the row exists to prevent.

**BAR 3 is the second half of 100 %** and moved by 2 verbs of 100. It lands by verb family
(C78 §19.1 forbids partial credit) and is load-bearing for C81's edit layer.

### §8.7 — Traps added to §6's list

- **Lanes idle on background test runs.** The default stall, now measured: vitest's import phase is
  **2–7 minutes** on a saturated tree (once, 93 ms of tests sat behind 420 s of import). A lane that
  reports "waiting" twice must be told to **read its output file**, not re-arm a monitor.
- **Transient API 529s and model usage limits kill lanes mid-flight.** They resume from transcript
  with state intact.
- **Hunk-level staging (`git apply --cached`) is the correct rescue** when two lanes interleave in
  one file. Three collisions across 220 commits, all self-detected and repaired by the lanes.
- **Lane msgfiles belong in the scratchpad, never the repo root.** The orchestrator's root cleanup
  swept several mid-flight; the lanes recovered, but the rule is now explicit.

### §8.8 — New governance from this session: **C83 — Spatial Validity & Design Logic**

**Pointer row. This is NOT one of the 82** — it is a founder-requested capability programme, and per
§0 the 82 measure model trust under change. **Do not fold it in; cross-reference it.**

| | |
|---|---|
| **Contract** | [C83 — Spatial Validity & Design Logic](../../02-decisions/contracts/C83-SPATIAL-VALIDITY-AND-DESIGN-LOGIC.md) · DRAFT 2026-08-14 (`28b47ec1`, materially amended `840526a0`) |
| **The question it owns** | *is this arrangement of elements valid?* — asked of a design a human is authoring, while they author it |
| **Founder's cases** | interior wall through a window opening = **IMPOSSIBLE** (refuse + offer concrete alternatives) · sofa/bed blocking a door = **INADVISABLE** (offer, user decides) · sofa at a window, bed under a window = **FINE** (silent) |
| **Verdicts map onto C74; they are not a new taxonomy** | IMPOSSIBLE = **ENFORCEMENT** · INADVISABLE = **ADVISORY**. A hard/soft split has been independently decided **four times** in this repo with four vocabularies; C74 §1.1 is canonical because it is a contract. ⚠ C74 §2's protected table has **exactly one** ENFORCEMENT row — a second is a contract edit in the same PR, not a doc follow-up. |
| **Phases — REORDERED by the survey** | **S0** plan-view `canPlace` parity (a **regression**, two lines) → **S1** `FURNITURE_BLOCKS_DOOR` ADVISORY (zero new geometry / vocabulary / UI / schema) → **Slice C** make `contains` reachable → **S3** `Door.swing` → `OpeningPose` (**L-856**) → **S4** `OCC_CROSSES_HOSTED_OPENING` ENFORCEMENT. **S0, S1 and Slice C are each unblocked today and mutually independent.** |
| **Why the headline case moved to LAST** | not because it shrank — because it costs a C74 §2 row **and** a preview trigger with **zero callers repo-wide** (`wireToolForConsequencePreview`). C11 §7.6 names what shipping it early produces: *"a dead click behind a perfect preview."* |
| **Gates** | four named, **all UNBUILT — UNPROVEN** per C70 §7.1 |

**The findings worth reading even if you never build this** — measured by the 26-agent prior-art
survey with adversarial reachability checking, 2026-08-14:

1. **The founder's *"every room knows what elements are within it (I think)"* holds for BOUND, holds
   with a caveat for HOSTED, and is FALSE for CONTAINED.** `RoomContentsService` answers all three and
   is genuinely wired — `PropertyPanelStoreEnricher.ts:109` is on the unconditional path for **every**
   selected element. But the authority for BOUND is `room.boundingWallIds` (`Room.ts:140`), **not the
   graph**; and `hosted` is DERIVED from it, so an unrecorded bounding-wall list empties doors and
   windows too (the service returns `undetermined` rather than zero — consumers must read it).
2. ⚠ **The `contains` edge does not exist on ANY path** — not hand-authored, not AI. All 14 non-test
   `CreateFurnitureCommand` sites were read and none supplies `hostedSpaceId`; the AI path computes
   the right answer (`buildFurnishCommands.ts:76`) and **drops it three times**; and there is **no
   refusing reader** for the family at all. C83's first draft claimed generated furniture carried it —
   **that was wrong, and is corrected in place rather than quietly swapped.** Rules therefore resolve
   containment **geometrically**, and ⚠ `graphmove.cert.ts` must stop classifying `contains` as
   ID-KEYED before anyone stores it: drag a sofa bedroom→kitchen and an ID-keyed edge keeps asserting
   the bedroom with full confidence.
3. ⚠ **`getBoundingWalls`, the refusal-bearing reader, has ZERO production callers.** Every real
   reader takes raw `getTargets(roomId,'boundedBy')` → `[]`, so a move-invalidated room reaches
   `SemanticQueryEngine.ts:148` as an affirmative *"bounded by nothing"* — the `[]`-means-unknown
   collapse C71 §4.4 forbids, **inside the family everyone calls the mature one.** And
   `clearGraphAuthoritative` has **0 production callers** (the gate says so itself,
   `check-suppression-is-reversible.ts:13`), so on generated levels the corrective re-detect is
   **permanently** suppressed.
4. ⚠ **Named defect, independent of this feature**: the same user action produces different graph
   state in plan vs 3D. 3D writes the `hosts` edge (`DoorTool.ts:503`); the plan tools do not
   (`DoorPlanToolHandler.ts:174` → legacy adapter, store-only). **The entire L6 plugin tier — the tier
   tools are being migrated INTO — writes zero SemanticGraph edges.** Relatedly, plan view lets you
   create two **overlapping** doors that 3D refuses: that regression is C83's Slice 0.
5. ⚠ **Of the ConstraintEngine's three registered triggers only one fires** (`:113` is a silent no-op
   because `window.runtime` is assigned after the static import graph; `:115` is dead) — **and the
   live one calls `run()` directly, bypassing the `batchCoordinator.isBatching` suppression
   entirely.** The guard sits on the path that never fires.
6. **`SPEC-49` §3 already wrote this programme's thesis: "The detection is not missing. The refusal
   is."** The correct door-swing sector exists and is imported only by its own tests (**L-856**);
   `programRules.ts` declares `excludeDoorSwing` per furniture kind and nothing reads it; the
   16-slice apartment validator family (A-1…A-8) has zero production callers; `@pryzm/data-engine`
   has zero consumers repo-wide. Measured: **3/288** generated rooms intrude the true swing arc,
   **0/288** intrude the box that ships.
7. ⚠ **The worst outcome already ships.** `RoomValidationService`'s area rules are guarded on
   `window.roomSystemTypeStore`, which is **assigned nowhere in the repo**, so the guard fails
   **closed** into a green *"✓ No issues found"* — a 2 m² bedroom renders identical to a conforming
   room. Absence-of-check and absence-of-defect are the same pixels, in the exact surface C83 wants
   to occupy.

⚠ **Adjacent, and deliberately NOT C83** (see its §8.5): whole-plan reachability is SPEC-49's. One
genuinely unowned defect sits between them — `houseCirculationNotice.ts`'s **§BUILT-PLAN-REACH**
records a verdict reporting `hardValid: true` while two doored storage rooms form an unreachable
island, because the hard rules run on the **bubble graph**, not the **realised door graph**. Schedule
it under SPEC-49.
