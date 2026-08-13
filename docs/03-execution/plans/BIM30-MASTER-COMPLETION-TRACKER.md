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

---

## ⏱ THE NUMBER — read this line and stop

> ### **40 % COMPLETE · 60 % REMAINING**
> **33 of 82 classified gap-register rows closed** · measured 2026-08-13 at HEAD `ca0a7ce3` by an
> executed pass (34 gates run). A **delta recount is in progress** for the ~15 commits since.
>
> | | |
> |---|---|
> | **Complete** | **40 %** — 33 rows, executed evidence |
> | **Remaining** | **60 %** — 47 rows open, 2 unknown |
> | Instrumentation axis | ~78 % (32 of 41 gates at exit 0/1) — **the thermometer, not the fever** |
> | Blocked by founder decision | Ladder L7 + L8, all 4 collaboration rows |
>
> **Do not quote the 78 %.** It measures whether we can *see* defects, not whether they are fixed.
> The single honest headline is **40 %**, and §1 explains what that number hides.

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
| Region paths conforming (C79 §6.3) | **8 of 10 rows** | `625a9926`, `86030325`, `9fd9c5b6` — only rows 9–10 (capability-absent) remain |
| Element kinds purging relationships on delete | **9 of 19** | `check-graph-delete-integrity`: 20 → **10** findings (`ca0a7ce3`, `86776ddf`, `7546ce0f`, `19825e25`, `76d42dd9`, `03e93609`) |
| Gates at exit 3 (never absorbable, C70 §5.1) | **9 → 0** | `96939dd4`, `719452a7`, `a0fedd87`, `e45752e4`, `89623324` + plant-debris removal |
| Dependency indexes that can genuinely refuse | **1 of 10** | `check-index-can-refuse` (`6d87f324`), 9 findings |
| Relationship families with writer **and** typed reader | **9 of 25** | `check-graph-write-coverage`, 5 findings |
| Files returning `[]` to mean "could not determine" | **105 files** | `check-no-empty-means-unknown` (`3fd164a1`) |
| Element kinds carrying provenance | **~1 of 29** | C75 §3.3; coverage gate in flight |

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
| **Register gaps (the headline)** | **33 / 82** | **40 %** |
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
| C.6 | `contains` — no writer on ANY path (IFC arm unreachable) | GR-04 | ⬜ TODO |
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
| D.2 | C79 rows 9–10: ceiling/floor plan tools gain region capability | — | ⬜ TODO |
| D.3 | `wall.create` planner — was **AUTHORED AND UNWIRED** (zero callers; the repo's signature hazard reproduced inside the flagship program) | — | ✅ **DONE** (`46d06234`, `4f9e8082`, `e878bdad`). The chokepoint was **not** the map: all three surfaces funnelled through `normalizeToWallMove`, which returns `null` for any other verb — a planner in the map would still have been dead. That is U-INV-5's *nominal genericity* exactly. Now one shared factory + a verb→rule map, so a third row needs no service edit. Determinism harness proven by mutation: injecting a clock/RNG residue turns **4 arms red**. `check-plan-determinism` **exit 0, 2 of 2 planners** |
| D.4 | `opening.move` planner | — | ⬜ TODO |
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
| E.5 | Provenance field on all 29 element schemas | PV-04 | ⬜ TODO |
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
| F.1 | GEN-GAP-1 `room.regenerate` as a bus verb (v1 refuses honestly) | — | 🔄 **IN FLIGHT** |
| F.2 | `check-generation-is-consequential` gate | — | 🔄 IN FLIGHT |
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

## §7 — Anti-patterns for this file

- **§7.a** Quoting a blended percentage across instrumentation and capability. §0.2.
- **§7.b** Marking a row closed without a commit sha. §0.1.
- **§7.c** Recording UNPROVEN as a blank, a zero, or a pass. C70 §8.k.
- **§7.d** Describing a phase as "90 % done" as though partial credit existed. C70 §3.2.
- **§7.e** Letting a capability claim outrun its gate. A gate that exists and reads RED means the
  capability is **absent and now visible** — not present.
- **§7.f** Scheduling Phase H. It is a founder decision; estimating it is fiction.
