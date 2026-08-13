# Generative Quality — Master Programme Tracker

> **Stamp**: created 2026-08-13 · **Status**: LIVING — updated on every commit that changes a cell
> **Programme code**: **GQ**. Row ids are `GQ-*` and are **never** register ids from BIM 3.0.
> **Purpose**: the single file the founder can open to see how far the **generators** are from
> production, what each phase delivers **as a user-visible capability**, and what is left.
> **Scope**: the question *"when PRYZM generates a design, is the design correct?"* — and, in its
> final phase, *"can PRYZM change a design it already made?"*
> **Authority**: subordinate to the contracts. [C50](../../02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md)
> (what a typology pipeline *is*) · [C16](../../02-decisions/contracts/C16-COMMAND-AUTHORING-PROTOCOL.md)
> (how a generator commits) · [C78](../../02-decisions/contracts/C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md)
> (the universal relationship rule the edit layer stands on). Where this file and a contract
> disagree, **the contract wins**. This file is execution-tier: below contracts, below ADRs.
> **Vision companion**: [typology-expansion-roadmap.md](./typology-expansion-roadmap.md) carries the
> *ambition* (25+ typologies, marketplace, per-typology effort model). **It carries no status.**
> This file carries status and refuses to carry ambition. Read them as a pair; do not merge them.

---

## ⏱ THE NUMBER — read this line and stop

> ### **0 of 28 readiness cells PROVEN** · 0 FAILED-by-instrument · **28 UNPROVEN**
> **The programme is 0 % PROVEN and that is a statement about measurement, not about the code.**
> Nobody has ever run an instrument over generator output quality. UNPROVEN is neither a pass nor a
> fail — it is *"nobody looked"* (C70 §2.2), and every cell in §1's matrix is in that state today.
>
> | | |
> |---|---|
> | **Denominator** | **28** = **4 registered typology packs × 7 readiness gates** (§-1) |
> | **Proven by an executed instrument** | **0** |
> | **Failed by an executed instrument** | **0** |
> | **UNPROVEN — nobody measured** | **28** |
> | **Founder-reported defects awaiting reproduction** | **3** (GQ-D1 · GQ-D2 · GQ-D3, §1.3) |
> | **Readiness gates that exist as code** | **0 of 7** — measured 2026-08-13, see §1.4 |
>
> ⚠ **Do not read "0 failed" as "nothing is broken."** The founder tested the shipped generators on
> 2026-08-13 and reported three defects (§1.3). They are **real and unreproduced by any instrument**,
> which is exactly why they count as UNPROVEN rather than FAILED: this programme's first act is to
> convert UNPROVEN → FAILED, which will look like collapse and is the opposite. BIM 3.0 spent its
> first week doing the same thing.
>
> ⚠ **This 28 is NOT part of BIM 3.0's 82.** Merging them would corrupt both. See §-1.

---

## 🚧 §-1 — THE DENOMINATOR, AND WHY IT IS NOT THE 82

**BIM 3.0's 82-row register measures ONE question: *when the model changes, does PRYZM stay
truthful?*** Its denominator is model trust under change.

**This programme measures TWO different questions with a different denominator:**

1. *When PRYZM generates a design from a brief, is the design architecturally correct?*
2. *When a user changes a design PRYZM generated, does the design survive with its intent intact?*

A generator can produce a sealed bedroom in a model whose relationship graph is flawless. A model
can lose track of a moved wall in a plan whose circulation is perfect. **The two failure modes are
independent, so their counts must be independent.** Folding these cells into the 82 would make
`X/82` mean nothing — it would no longer be *"how much of model-trust is closed"*, and no arithmetic
would recover the split afterwards.

> ### The denominator rule — binding for this file
>
> 1. **The denominator is `registered typology packs × readiness gates`.** Today: **4 × 7 = 28**.
>    Both factors are measurable at HEAD; neither is a hand-written list.
> 2. **The denominator GROWS when a typology is registered, and is never shrunk to improve the
>    ratio.** Adding school + museum + hospital takes it 28 → **49**. A programme that expands its
>    scope and keeps its old denominator is reporting a fiction. This mirrors C70 §5.3 — a floor may
>    never be lowered to go green.
> 3. **A cell is PROVEN only from an artefact that was RUN.** Not from a commit subject, not from
>    reading the source. Source-verified is a weaker class and says so in-row.
> 4. **The edit layer (Phase 3) does NOT enter this 28.** It gets its own denominator, and that
>    denominator **cannot be established yet** — see §2.3. A phase whose subject cannot be
>    enumerated cannot be scored, and inventing a score for it is the empty-seed lie.
> 5. **Cross-reference BIM 3.0; never fold into it.** Cite `BIM30-GAP-REGISTER.md` rows by id where
>    a dependency exists. Never copy a row across, and never re-state a row's content (C70 §0.2).

---

## §0 — How to read this file

**Three states, never collapsed** (C70 §2.2): **PROVEN** = executed evidence it is correct ·
**FAILED** = executed evidence of a defect · **UNPROVEN** = nobody measured.

**Two axes, never averaged into one number:**

| Axis | What it means | Why it must stay separate |
|---|---|---|
| **INSTRUMENTATION** | a readiness gate exists, enumerates its subject, and has been watched go red | fast to build; proves nothing about output quality |
| **OUTPUT QUALITY** | the generated plan is actually architecturally correct | slow; this is what an architect sees |

> **§0.1 — MUST.** Every commit that changes a cell updates this file **in the same commit**. A cell
> marked PROVEN with no commit sha is not proven.

> **§0.2 — MUST NOT.** No percentage here may be computed across both axes, and none may be quoted
> without its numerator and denominator.

> **§0.3 — MUST. The headline is COUNTED, never carried forward.** The ⏱ block is re-derived by
> running the gates and counting cells — never by incrementing as lanes report. Each headline
> carries the HEAD sha it was measured at; if that sha is behind, the number is **stale** and must
> say so rather than be adjusted by hand.

> **§0.4 — MUST. A test file is not evidence that a test runs.** ISSUE-LOG **L-851** established
> **147 dark suites** repo-wide out of 2,043 test files × 163 runners. Any cell closed on "there is
> a test for that" is closed on nothing. Name the runner and the executed result.

---

## §1 — Where we are — MEASURED 2026-08-13

### §1.1 — The inventory that exists (measured, not recalled)

| What | Reading | How measured |
|---|---|---|
| AI-host workflows | **9 directories + 6 top-level files** | `ls packages/ai-host/src/workflows/` → `apartmentLayout` · `houseLayout` · `residentialBuilding` · `officeBuilding` · `officeFurnish` · `furnishLayout` · `ceilingLayout` · `lightingLayout` · `daylight`, plus `Generate3Options{,Types}.ts` · `PlanCritique{,Types}.ts` · `VoiceCommand{,.impl}.ts` |
| Registered typology packs | **4** | `ls -d packages/typology-pack-*` → `apartment` · `casa-unifamiliar` · `office-building` · `residential-building` |
| Packs reachable at runtime | **4 of 4** | all four `register(build*TypologyPack())` in `packages/runtime-composer/src/composeRuntime.ts` (≈ lines 1061–1123), each inside its own `try/catch` |
| Typology pipeline package | **exists, 14 source files** | `packages/typology-pipeline/src/` — `PipelineRouter` · `TypologyRegistry` · `RacChatbotModel` · `TypologyPickerModel` · 7 stage modules |
| **Normative programme-rules databases** | **1, and it is residential-only** | `find packages -name 'programRules*.ts'` → exactly one: `packages/ai-host/src/workflows/apartmentLayout/rules/programRules.ts` |
| Room types in that database | **16** | `ALL_ROOM_RULES` — 13 core (`living kitchen dining hall corridor stair master bedroom study bathroom ensuite wc utility`) + 3 opt-in (`open_plan balcony storage`, §NEW-ROOM-TYPES) |
| Dimensional validators | **14 files** | `packages/ai-host/src/workflows/apartmentLayout/dimensions/` — incl. `validateCorridorWidth.ts`, `validateEntrySightline.ts`, `validateRoomHierarchy.ts` |
| Topology validators | **10 files** | `packages/ai-host/src/workflows/apartmentLayout/validators/topology/` — incl. `mandatoryAdjacency.ts`, `forbiddenAdjacency.ts`, `privacyGradient.ts`, `sequencing.ts` |
| Test files under `packages/ai-host` | **239** | `find packages/ai-host -name '*.test.ts' \| wc -l`. ⚠ **Per §0.4 this is a file count, not a run count.** How many execute is **UNPROVEN**. |

> **What this table says, plainly.** The machinery is not absent. There are validators for corridor
> width, for entry sightline, for mandatory and forbidden adjacency, for the privacy gradient — and
> a 16-room normative database behind them. **The gap is not "no validators exist"; it is that
> nothing enumerates whether the validators cover the failure the founder saw, and nothing runs them
> as a gate over generated output.** That is a *reachability* problem, and this repository has a
> documented history of authored-but-unwired machinery reading as working machinery.

### §1.2 — The readiness matrix — 4 × 7 = 28 cells, ALL UNPROVEN

The seven readiness gates, **in dependency order**. A typology is production-ready when all seven
read PROVEN for it. Nothing below R1 is negotiable: a plan whose rooms cannot be reached is not a
plan with a defect, it is not a plan.

| # | Readiness gate | The invariant | Gate exists? |
|---|---|---|---|
| **R1** | **REACHABILITY** | every room is reachable from the entry along a door-graph path — the access DAG of [SPEC-CIRCULATION-GRAPH](../specs/SPEC-CIRCULATION-GRAPH.md) PART 1 | ❌ **no file at HEAD** |
| **R2** | **APERTURE** | every enclosed room has ≥ 1 door; no room is sealed; every door is hosted in a real wall segment | ❌ **no file at HEAD** |
| **R3** | **CLEARANCE** | no furniture, fixture or element occludes a door swing or a circulation path | ❌ **no file at HEAD** |
| **R4** | **DIMENSIONAL** | corridor widths, room minima, door widths hold against the normative database | ❌ no gate — 14 validators exist, unwired as a gate |
| **R5** | **ADJACENCY** | mandatory adjacencies present, forbidden adjacencies absent, privacy gradient monotone | ❌ no gate — 10 validators exist, unwired as a gate |
| **R6** | **DETERMINISM** | the same brief on the same site produces the same plan | ❌ **no file at HEAD** for generator output |
| **R7** | **REGENERATION SAFETY** | the plan survives a user edit with its circulation intact — the bridge to Phase 3 | ❌ **no file at HEAD** |

| Typology pack | R1 | R2 | R3 | R4 | R5 | R6 | R7 |
|---|---|---|---|---|---|---|---|
| `apartment` | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| `casa-unifamiliar` (house) | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| `residential-building` | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |
| `office-building` | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ |

**❔ = UNPROVEN. There is no ✅ and no ❌ in this matrix, and putting one there without an executed
instrument behind it is the defect this repository spent 2026-08-13 correcting.**

**Cross-cutting engines score INSIDE these cells, not beside them.** `furnishLayout` and
`officeFurnish` are where R3 CLEARANCE is won or lost; `ceilingLayout`, `lightingLayout` and
`daylight` are downstream consumers and hold no readiness cell of their own. A furniture engine that
blocks a door fails the **typology's** R3 — the defect belongs to the plan a user sees.

### §1.3 — The founder's reported defects — 2026-08-13, verbatim

> *"the corridor doesn't reach the relevant bedrooms · rooms without doors · furniture in front of a
> door. The graph layout is critical — every room must be accessible; corridors and circulation are
> critical."*

| id | Defect as reported | Maps to | State |
|---|---|---|---|
| **GQ-D1** | the corridor does not reach the relevant bedrooms | **R1 REACHABILITY** | **FOUNDER-REPORTED · unreproduced by any instrument** |
| **GQ-D2** | rooms without doors | **R2 APERTURE** | **FOUNDER-REPORTED · unreproduced by any instrument** |
| **GQ-D3** | furniture in front of a door | **R3 CLEARANCE** | **FOUNDER-REPORTED · unreproduced by any instrument** |

**"Unreproduced" is not scepticism about the report.** It means no artefact in this repository can
yet be pointed at to show the defect, watch it go red, and watch it go green — and until one can,
"fixed" would be an opinion. Reproducing these three is **Phase 1's first work item**, and it is
owned by the circulation-audit lane, whose findings land in
[`SPEC-XX-circulation-integrity.md`](../specs/SPEC-XX-circulation-integrity.md) (**PENDING — path is
the intended path; verify it exists before citing it**) and as `L-853+` rows in
[ISSUE-LOG](../../04-reference/ISSUE-LOG.md).

**Which typologies these were seen in is NOT recorded and must not be guessed.** The founder tested;
the per-typology attribution is UNPROVEN. That is why §1.2's matrix is uniformly ❔ rather than
selectively ❌.

### §1.4 — What is NOT-YET-TRUE, stated so nobody mistakes it for a settled invariant

- **No readiness gate exists. Zero of seven.** Measured 2026-08-13:
  `find . -name 'check-*circulation*' -o -name 'check-*reachab*'` → **empty**; `tools/ga-gate/` holds
  **56 files** and none is scoped to generator output. `check-deterministic-regeneration` exists but
  is a **BIM 3.0** gate about model regeneration, **not** about generator plan determinism — do not
  cite it for R6.
- **`SPEC-CIRCULATION-GRAPH.md` is a canonical brief with NO gate behind it.** It states its
  invariants in binding language — *"a layout that fails any invariant below is INVALID and must be
  rejected before scoring"* — and **whether the code enforces that is UNPROVEN.** A specification
  describing enforcement that does not exist is the exact defect class recorded as **L-809 / L-812**
  in `CLAUDE.md`. Treat that spec as a *source of invariants*, not as evidence of them.
- **The 14 dimensional and 10 topology validators are apartment-scoped.** Whether
  `casa-unifamiliar`, `residential-building` or `office-building` reach them at all is **UNPROVEN**.
- **There is exactly ONE normative programme-rules database and it is residential.** `office-building`
  ships an orchestrator and a floor-plate module but **no programme-rules database was found**
  (`find packages -name 'programRules*.ts'` → one file). Office readiness therefore has a missing
  R4/R5 subject, not merely a missing gate.
- **"Production ready" has never been defined for a generator in this repository.** §1.2's seven
  gates are this file's proposal for that definition. Until a contract ratifies them, they are a
  **working definition**, not an invariant. Ratifying them belongs to the contract lane, not here.

---

## §2 — The phase plan — the founder's order, and why it is also the engineering order

**The founder's stated priority order, 2026-08-13: FIRST fix the existing generators · THEN expand
typologies (school, museum, hospital) · THEN the edit engine.** It is encoded below unchanged.

> ### §2.0 — Why this order is not merely a preference
>
> **Expanding typologies before circulation is correct multiplies the defect.** Every new typology
> inherits the circulation machinery. School, museum and hospital are *more* circulation-dependent
> than a flat — egress routes, corridor widths, wayfinding and separated public/clinical flows are
> the substance of those briefs, not a detail of them. Adding three typologies onto an unproven
> circulation layer takes the denominator from 28 to 49 while proving nothing, and every defect
> found afterwards must be fixed four to seven times instead of once.
>
> **The edit layer has a hard precondition that engineering cannot route around.** It is not a
> sequencing preference; see §2.3.

### §2.1 — PHASE 1 — CORRECT THE GENERATORS · **0 % · circulation first**

*The founder's first priority. Nothing in Phase 2 starts while any R1/R2/R3 cell is FAILED.*

| # | Work item | Exit condition | Status |
|---|---|---|---|
| 1.1 | **Reproduce GQ-D1/D2/D3 as failing artefacts** | each defect has a runnable case that goes red today | ⬜ **NEXT — owned by the circulation-audit lane** |
| 1.2 | **Ratify the seven readiness gates** as a contract, not a plan | a contract section defines "production-ready generator" normatively | ⬜ TODO — **contract lane owns this, not this file** |
| 1.3 | **Build R1 REACHABILITY** — enumerate the denominator from the registry, land RED | every generated plan's every room is DETERMINED-reachable, DETERMINED-unreachable, or **UNDETERMINED with a typed reason**; silence is a failure | ⬜ TODO |
| 1.4 | **Build R2 APERTURE** | zero sealed rooms across all four packs, or a named shrink-only ledger | ⬜ TODO |
| 1.5 | **Build R3 CLEARANCE** | zero door-swing and circulation-path occlusions, or a named ledger | ⬜ TODO |
| 1.6 | **Wire R4 + R5** — the 24 existing validators become gates over generated output | validators run over emitted plans, not only over solver candidates | ⬜ TODO |
| 1.7 | **Build R6 DETERMINISM** for generator output | same brief + same site → byte-identical plan, or a typed reason why not | ⬜ TODO |
| 1.8 | **Extend all seven beyond `apartment`** | each gate's subject is the **registry**, not a hand-written typology list | ⬜ TODO |

**Exit**: all seven gates exist, enumerate their subject from the registry, exit 2 if they cannot,
and every one has been **watched go red**. All 28 cells read PROVEN, FAILED or UNPROVEN **by
measurement** — none by absence.

> **CAPABILITY DELIVERED**: an architect can trust that a generated plan is *walkable*. Every room
> reachable, every room with a door, no furniture blocking one. This is the floor beneath which no
> amount of daylight analysis, cost take-off or beautiful rendering means anything — **a plan you
> cannot walk through is not a plan.**

### §2.2 — PHASE 2 — TYPOLOGY EXPANSION · **BLOCKED ON PHASE 1**

*The founder named three: **school · museum · hospital**. The vision doc
[typology-expansion-roadmap.md](./typology-expansion-roadmap.md) §5 carries a 25-typology ambition;
this phase is only the three he named, and only after Phase 1 exits.*

**Each of the three needs FOUR things before an engine, and in this order:**

| # | Prerequisite | Why it comes first | For school | museum | hospital |
|---|---|---|---|---|---|
| **P-a** | **Normative room database** — the room types, their minima, their required apertures | there is exactly **one** such database today and it is residential (§1.1); an engine without one has no ground truth to be correct against | ⬜ | ⬜ | ⬜ |
| **P-b** | **Programme rules** — how many of each room, at what ratio, driven by the brief | a generator with no programme produces rooms, not a building | ⬜ | ⬜ | ⬜ |
| **P-c** | **Adjacency + circulation rules** — mandatory, forbidden, and the egress/wayfinding topology | this is where these three typologies are *hardest*: separated public/clinical flows (hospital), supervised sightlines and egress capacity (school), a controlled visitor sequence (museum) | ⬜ | ⬜ | ⬜ |
| **P-d** | **Registered typology pack** wired through `TypologyRegistry` per [C50](../../02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md) | the four existing packs are the proven pattern — mirror them, do not reinvent | ⬜ | ⬜ | ⬜ |

**Sourcing P-a through P-c is architect work, not engineering work,** and it is the real cost. The
existing 16-room residential database carries constraint ids from a 248-constraint source
(`SPEC-LAYOUT-CONSTRAINT-DATABASE`, cited in `programRules.ts`); nothing equivalent exists for these
three, and **whether such a source has been identified is UNPROVEN.**

**On entry to this phase the denominator moves 28 → 49** (7 packs × 7 gates), per §-1 rule 2. The
new typologies enter with all seven cells UNPROVEN, and the headline ratio will *fall*. That is
correct behaviour and must not be smoothed.

> **CAPABILITY DELIVERED**: PRYZM addresses non-residential briefs. Note what this phase does **not**
> deliver — it delivers *breadth*, and breadth on an unproven circulation layer is negative value,
> which is why it is second and not first.

### §2.3 — PHASE 3 — THE EDIT LAYER · **DOES NOT EXIST · HARD-PRECONDITIONED ON BIM 3.0 BAR 3**

*No workstream anywhere in this repository transforms an existing design while preserving intent.
Measured 2026-08-13: there is no such package, no such workflow, no such contract section.*

Generation answers *"make me a building."* Editing answers *"make this building different, and keep
everything about it that I did not ask you to change."* The second is strictly harder, because it
requires knowing **what a change breaks**.

> ### ⛔ The precondition, stated plainly
>
> **The edit layer cannot be built on a model that does not know what its changes break.**
>
> BIM 3.0's **bar 3** — *"UNIVERSAL: every element"*, [C78](../../02-decisions/contracts/C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md)
> §19.1 + §20 U-INV-1, sequenced in [BIM30-IMPLEMENTATION-ROADMAP](./BIM30-IMPLEMENTATION-ROADMAP.md)
> §3.1 — is the instrument that answers it, and:
>
> - its gate, **`check-relationship-determination`, does not exist** — verified 2026-08-13, no file
>   under `tools/ga-gate/` matches; the roadmap §3.1 records the same measurement independently;
> - the product it must cover is **4,100 cells (100 consequential verbs × 41 relationships)**, of
>   which **4,018 are SILENT** — figure cited from [BIM30-NEXT-SESSION-BRIEF](./BIM30-NEXT-SESSION-BRIEF.md)
>   §2.5 / §9.1, **not measured by this file**.
>
> **An edit engine over a 98 %-silent relationship product would not preserve intent; it would
> destroy it silently, which is worse than refusing.** A generator that produces a bad plan is
> visibly bad. An editor that quietly breaks a relationship the model never tracked produces a plan
> that *looks* right and is not — and PRYZM has no instrument that would notice.
>
> **Exit condition for the precondition:** `check-relationship-determination` exists, enumerates its
> denominator from the registries, and its SILENT count is on a named shrink-only ledger that is
> falling. **Not** that it reads zero — that it exists, is honest, and is shrinking.

| # | Work item | Status |
|---|---|---|
| 3.1 | **Precondition**: BIM 3.0 bar 3 gate exists and its ledger is shrinking | ⛔ **BLOCKED — gate does not exist** |
| 3.2 | Contract the edit layer: what "intent" is, what survives a transform, what a refusal looks like | ⬜ TODO — **contract lane** |
| 3.3 | Establish the edit layer's own denominator (`transform × element × preserved-property`) | ⛔ **cannot be established until 3.1** |
| 3.4 | The engine | ⬜ not scheduled |

**The edit layer holds NO cell in the 28** (§-1 rule 4). Its denominator is a different product and
cannot be enumerated today; scoring it now would be a verdict over an unestablished subject.

> **CAPABILITY DELIVERED**: *"move the kitchen to the north side and keep everything else"* — the
> single most-requested thing a design tool does, and the thing PRYZM cannot do at all today.

---

## §3 — Definition of Done — per phase, falsifiable

| Phase | DONE means | Today |
|---|---|---|
| **1** | 7 gates exist · each enumerates its subject from the registry · each exits 2 rather than guess · each watched go red · 28 cells all measured · GQ-D1/D2/D3 each have a case that went red then green | **0 of 7 gates; 0 of 28 cells measured** |
| **2** | school + museum + hospital each have P-a…P-d · each registered · each scoring all 7 gates · denominator restated at 49 | **not started; blocked** |
| **3** | bar-3 gate exists and shrinks · edit contract ratified · edit denominator enumerable · engine passes it | **blocked at the precondition** |

**No phase is partially done.** A phase with six of seven gates is a phase in progress (C70 §3.2's
no-partial-credit, applied here by analogy — this file does not extend C70's authority, it borrows
its discipline).

---

## §4 — Commit log (append-only; every cell-changing commit)

| Date | SHA | What changed | Cells moved |
|---|---|---|---|
| 2026-08-13 | *(this commit)* | Programme created. Denominator declared at 28. All cells UNPROVEN. | — |

---

## §5 — Anti-patterns for this file

**a.** **Never write ✅ or ❌ in §1.2 without an executed artefact.** ❔ is the honest default and
costs nothing; a wrong ✅ costs a session.
**b.** **Never fold a cell into `BIM30-GAP-REGISTER.md`, and never fold a register row into here.**
The two denominators answer different questions (§-1).
**c.** **Never shrink the denominator.** Adding typologies raises it; removing a gate is a contract
change, not a bookkeeping one.
**d.** **Never cite a count this file states as a measurement.** Counts rot. Re-run the command in
the "How measured" column.
**e.** **Never claim a gate exists without checking HEAD.** Every "does not exist" line in §1.4
carries the command that established it — re-run it, do not trust the line.
**f.** **Never record a defect as fixed without the artefact that went red first.** GQ-D1/D2/D3 are
reported, not reproduced, and the distinction is the whole programme.

---

## §6 — Cross-references

| Doc | Relationship |
|---|---|
| [typology-expansion-roadmap.md](./typology-expansion-roadmap.md) | the **vision** (25+ typologies, packs, marketplace, effort model). This file is its **status half**. Neither replaces the other. |
| [C50-TYPOLOGY-PIPELINE.md](../../02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md) | the binding contract for typology packs and the 7-stage pipeline |
| [SPEC-CIRCULATION-GRAPH.md](../specs/SPEC-CIRCULATION-GRAPH.md) | the **source of R1's invariants** — the access DAG. ⚠ canonical brief, **no gate behind it** (§1.4) |
| [SPEC-XX-circulation-integrity.md](../specs/SPEC-XX-circulation-integrity.md) | **PENDING** — the circulation-audit lane's defect audit; intended path, verify before citing |
| [ISSUE-LOG.md](../../04-reference/ISSUE-LOG.md) | where GQ-D1/D2/D3 reproductions land as `L-853+` |
| [BIM30-MASTER-COMPLETION-TRACKER.md](./BIM30-MASTER-COMPLETION-TRACKER.md) | the **other** programme — model trust under change. §-3 is the doctrine this file's gate design copies |
| [BIM30-IMPLEMENTATION-ROADMAP.md](./BIM30-IMPLEMENTATION-ROADMAP.md) §3.1 | **the three bars**; bar 3 is Phase 3's precondition |
| [BIM30-GAP-REGISTER.md](../../04-reference/BIM30-GAP-REGISTER.md) | the 82 rows. **Cross-reference only — never merge** |
| [C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md](../../02-decisions/contracts/C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md) | §19.1 + §20 U-INV-1 — what the edit layer stands on |
| [C16-COMMAND-AUTHORING-PROTOCOL.md](../../02-decisions/contracts/C16-COMMAND-AUTHORING-PROTOCOL.md) | how a generator commits its result |

---

*End — Generative Quality Master Programme Tracker · created 2026-08-13 · LIVING.*
