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

> ### **0 of 28 readiness cells PROVEN · 4 FAILED by execution · 2 CONTESTED · 22 UNPROVEN**
> ### **and 0 of 28 are GATED AT THE INVARIANT — 6 sit on a 27-row shrink-only ledger (2026-09-06); the other 22 can regress silently tomorrow.**
> Sources: [SPEC-49-CIRCULATION-INTEGRITY](../specs/SPEC-49-CIRCULATION-INTEGRITY.md) §2 (executed
> sweeps) and [ISSUE-LOG](../../04-reference/ISSUE-LOG.md) **L-854…L-865** (browser observation on
> `517f7a70`), both 2026-08-13. **Those artefacts are the authority; this line only quotes them.**
>
> | | |
> |---|---|
> | **Denominator** | **28** = **4 registered typology packs × 7 readiness gates** (§-1) |
> | **PROVEN** | **0** |
> | **FAILED by an executed instrument** | **4** — `apartment` R1 + R2, `casa-unifamiliar` R1 + R2 |
> | **CONTESTED — two instruments disagree** | **2** — `residential-building` R1 + R2 (§1.2) |
> | **UNPROVEN — nobody measured** | **22** |
> | **Cells held by a GATE** | **0 of 28 fully · 6 PARTIALLY** (2026-09-06) — `check-generator-circulation.ts` ledgers R1+R2 for the three swept packs at a **27-row shrink-only baseline, not hard-0**, so those six cells can no longer regress *silently*, but nothing holds them at the invariant. `office-building` is unswept and R3/R6/R7 have no file at HEAD (§1.4) |
> | **Founder-reported defects REPRODUCED** | **3 of 3** (GQ-D1 · GQ-D2 · GQ-D3, §1.3) |
>
> **The worst single reading, so it is not buried** *(re-measured 2026-09-06 — the 2026-08-13
> reading was 12/24 · 11/24 · 7/106)*: `casa-unifamiliar` (house) ships **9 of 24 storeys with an
> unreachable room** and **9 of 24 with a doorless room** — still including storeys whose **`Stair`
> has no opening at all** (four such rows remain ledgered). Apartment is **5 / 107** on both. **The
> generators are not in the same condition**, and a blended rate would have been true of none of
> them and would have pointed the fix at the wrong one.
>
> ⚠ **The numbers fell; no cell passed.** Every R1/R2 cell is still **❌**, and the fall is other
> lanes' generator work between 08-13 and 09-06 — surfaced by re-running SPEC-49 §2's
> reproductions, not produced by the lane that re-ran them (§1.2).
>
> ⚠ **There is no ✅ in this programme, and one nearly appeared.** The synthetic sweep read
> `residential-building` **0/34 clean** on R1 and R2 — and the founder, looking at a real generated
> building in the browser the same day, reported *"rooms without doors, circulation not good"*
> (L-862). **A green sweep and a red browser is not a contradiction to be averaged; it is the
> synthetic-sample gap the audit itself named** (SPEC-49 §6, `CI-5-INSTRUMENT`). Those two cells are
> **CONTESTED**, not proven. **Had this tracker banked them as ✅, it would have reported a clean
> generator on the same day the founder watched it fail.**
>
> ⚠ **This 28 is NOT part of BIM 3.0's 82.** Merging them would corrupt both. See §-1.
>
> ⚠ **The 28 is also known to be too small.** The browser probe found generator defects that no R1–R7
> cell can hold — 121 unannounced compliance errors, a furnish stage that times out and is skipped,
> generated buildings with no unit containment. **Candidate gates R8–R10 are named in §1.5 and are
> deliberately NOT yet in the denominator**, because changing the gate set is a ratification, not
> bookkeeping (§5.c).

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

### §-1.1 — Division of labour with SPEC-49, so neither document drifts

[SPEC-49](../specs/SPEC-49-CIRCULATION-INTEGRITY.md) §8 proposed a generator-readiness register and
deliberately declined to create one unilaterally. **This file is that register** — SPEC-49 §8 was
amended in `50adec27` to say so, once both landed in the same hour. **No separate
`GENERATOR-READINESS-REGISTER.md` exists, and none should be created**: a third artefact would give
the same rate two homes and guarantee they diverge.

| | **SPEC-49** | **This tracker** |
|---|---|---|
| Owns | the **measurement method**, the **per-typology readings**, the **gate design** | **programme sequencing and status** |
| Grain | one row per invariant occurrence, incl. non-circulation rules (`window`, room-proportion, daylight, out-of-bounds) | 28 cells, `typology × readiness gate` |
| Answers | *"which defects are open, at what rate, behind which gate?"* | *"how far is the programme from production?"* |
| On disagreement | **wins on any rate** | quotes SPEC-49; never mints a rate of its own |

> **The protocol, verbatim from SPEC-49 §8:** *a changed rate is re-measured **there** first — by
> re-running the four reproductions in its §2 — then quoted **here**.* A number has exactly one home.
> If this tracker's §1.2 and SPEC-49 §2 ever disagree, **SPEC-49 is right and this file is stale.**

---

## §0 — How to read this file

**Four states, never collapsed** (C70 §2.2 gives the first three): **PROVEN** = executed evidence it
is correct · **FAILED** = executed evidence of a defect · **UNPROVEN** = nobody measured ·
**CONTESTED** = two instruments looked and disagreed.

**CONTESTED is this programme's own addition and it earns its place.** BIM 3.0 measures one model
with one class of instrument, so it never needs it. This programme measures *generated output*, and
output can be swept in a harness and watched in a browser — two instruments with different reach.
When they disagree, the disagreement **is the finding**, and collapsing it into either neighbour
throws away the only thing that was learned. **A CONTESTED cell resolves by building the instrument
that settles it, never by preferring the kinder reading** (§1.2).

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

### §1.2 — The readiness matrix — 4 × 7 = 28 cells · 0 PROVEN · 4 FAILED · 2 CONTESTED · 22 UNPROVEN

The seven readiness gates, **in dependency order**. A typology is production-ready when all seven
read PROVEN for it. Nothing below R1 is negotiable: a plan whose rooms cannot be reached is not a
plan with a defect, it is not a plan.

| # | Readiness gate | The invariant | Gate exists? |
|---|---|---|---|
| **R1** | **REACHABILITY** | every room is reachable from the entry along a door-graph path — the access DAG of [SPEC-CIRCULATION-GRAPH](../specs/SPEC-CIRCULATION-GRAPH.md) PART 1 | ⚠ **PARTIAL — `check-generator-circulation.ts` (CI-1), measured 2026-09-06.** Not hard-0: a NAMED shrink-only ledger. And it reads the **engine's own carried verdict**, not an independent BFS — the gate says so itself. **Not the R1 gate 1.4 describes** |
| **R2** | **APERTURE** | every enclosed room has ≥ 1 door; no room is sealed; every door is hosted in a real wall segment | ⚠ **PARTIAL — `check-generator-circulation.ts` (CI-2), measured 2026-09-06.** NAMED shrink-only ledger, not hard-0. Reads the shipped door graph independently AND the carried verdict, and the two agree exactly. **Does not check a door is USABLE** (width, swing, hosted in a real segment) — that half is unmeasured |
| **R3** | **CLEARANCE** | no furniture, fixture or element occludes a door swing or a circulation path | ❌ **no file at HEAD** |
| **R4** | **DIMENSIONAL** | corridor widths, room minima, door widths hold against the normative database | ❌ no gate — 14 validators exist, unwired as a gate |
| **R5** | **ADJACENCY** | mandatory adjacencies present, forbidden adjacencies absent, privacy gradient monotone | ❌ no gate — 10 validators exist, unwired as a gate |
| **R6** | **DETERMINISM** | the same brief on the same site produces the same plan | ❌ **no file at HEAD** for generator output |
| **R7** | **REGENERATION SAFETY** | the plan survives a user edit with its circulation intact — the bridge to Phase 3 | ❌ **no file at HEAD** |

| Typology pack | R1 | R2 | R3 | R4 | R5 | R6 | R7 | Sample behind the non-❔ cells |
|---|---|---|---|---|---|---|---|---|
| `apartment` | ❌ **5/107** | ❌ **5/107** | ❔ | ❔ | ❔ | ❔ | ❔ | **107** shipped winners of 108 shell × programme combos through `generateDeterministicLayouts` |
| `casa-unifamiliar` (house) | ❌ **9/24** | ❌ **9/24** | ❔ | ❔ | ❔ | ❔ | ❔ | 24 shipped storeys through `generateHouseLayout`, 0 null |
| `residential-building` | ⚠ **CONTESTED** | ⚠ **CONTESTED** | ❔ | ❔ | ❔ | ❔ | ❔ | sweep: 34 synthetic units, **0/34**, `coreReachable` affirmative · browser: founder on a real generated building, *"rooms without doors, circulation not good"* (L-862) |
| `office-building` | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | ❔ | **never swept** |

**❌ = FAILED by an executed instrument · ⚠ = CONTESTED, two instruments disagree · ❔ = UNPROVEN,
nobody measured · ✅ = PROVEN, and no cell has earned one.** Readings quoted from
[SPEC-49](../specs/SPEC-49-CIRCULATION-INTEGRITY.md) §2 and ISSUE-LOG **L-854…L-865**; SPEC-49 names
the reproduction file and the exact `vitest` command for each. **Never put a mark here without one.**

> ⚠ **R1/R2 RATES RE-MEASURED 2026-09-06 (lane RESI-CI0-EMIT-BOUNDARY, `c1e4de7c`).** They read
> `apartment 7/106 · 7/106` and `house 12/24 · 11/24` from 2026-08-13 until this edit. Re-measured
> by re-running SPEC-49 §2's own reproductions — **the §-1.1 protocol: the rate is re-measured
> THERE first, then quoted here** — and SPEC-49 §2 has been updated in the same commit, so the two
> files do not disagree.
>
> **⛔ THE CELLS ARE STILL ❌ AND NOTHING HERE WAS PROVEN.** A rate that fell is not a cell that
> passed. `casa-unifamiliar` still ships **9 of 24 storeys with an unreachable room and 9 with a
> doorless room**; `apartment` still ships 5 of 107 broken on both.
>
> **⛔ THIS LANE DID NOT EARN THIS MOVEMENT AND MUST NOT BE READ AS HAVING DONE SO.** It changed no
> generator code. The improvement is other lanes' work between 08-13 and 09-06, surfaced by
> re-running the instrument. Recording it under a lane that only re-measured would be the
> confident-register-row defect this programme exists to avoid.
>
> ⭐ **Two things the new numbers say that the old ones did not.** (a) The apartment **denominator**
> moved 106 → **107**: one combo that used to ship nothing now ships, so the base is larger AND the
> failures fewer. (b) **CI-1 and CI-2 are now exactly equal on both generators** (5/5, 9/9) —
> SPEC-49 §2 fact 2 predicted this, because the defect is *"no door was ever emitted"*, not a
> routing failure; the house sweep has now collapsed to the full identity apartment always had.
>
> ⚠ **A SECOND INSTRUMENT READS R1 LOWER, and it is a finding, not noise.**
> `check-generator-circulation.ts` reads CI-1 at **3/107 · 4/24** because it reads the **carried
> CI-0 verdict** (computed pre-emission on the bubble graph); the figures in the table above come
> from an **independent BFS over the SHIPPED door graph**. **CI-2 agrees exactly on all three
> generators**, which is precisely what makes the CI-1 gap worth naming. Per §a2 this is **not**
> resolved by preferring the kinder number: the artefact-side reading is closer to the user.

> **Three qualifications that the marks alone would hide:**
>
> 1. **CONTESTED is a state, not a rounding error — and it must never be resolved by picking the
>    kinder reading.** The synthetic sweep and the browser disagree about `residential-building`
>    because they looked at different things: convex quads and founder-scale rectangles versus a real
>    generated building. **The browser is closer to the user, so the burden is on the sweep**, and the
>    resolution is `CI-5-INSTRUMENT` (SPEC-49 §6) — replay real project shells — not a judgement call.
> 2. **No cell is gated.** Zero of the seven gates exist, so **every** mark in this table is a
>    snapshot that can go stale on the next commit with nothing to catch it.
> 3. **R3's ❔ is not ignorance.** The furniture sweep measured a **1 % floor** (3 of 288 rooms,
>    against a door's *real* swing arc) — but on single-door, centred-door, **rectangular** rooms
>    called directly, not on generated typology output. And L-856 records that `doorSwingKeepout.ts`
>    is **dead code** — `Door.swing` never reaches the furnisher — so the keep-out the solver consults
>    cannot be the arc a real door sweeps. The defect is confirmed present in the engine; **its rate
>    per typology is unmeasured**, and SPEC-49 §5/§6 records why.

**Cross-cutting engines score INSIDE these cells, not beside them.** `furnishLayout` and
`officeFurnish` are where R3 CLEARANCE is won or lost; `ceilingLayout`, `lightingLayout` and
`daylight` are downstream consumers and hold no readiness cell of their own. A furniture engine that
blocks a door fails the **typology's** R3 — the defect belongs to the plan a user sees.

### §1.3 — The founder's reported defects — 2026-08-13, verbatim

> *"the corridor doesn't reach the relevant bedrooms · rooms without doors · furniture in front of a
> door. The graph layout is critical — every room must be accessible; corridors and circulation are
> critical."*

| id | Defect as reported | Maps to | State — 2026-08-13 |
|---|---|---|---|
| **GQ-D1** | the corridor does not reach the relevant bedrooms | **R1 REACHABILITY** (SPEC-49 CI-1) | ✅ **REPRODUCED** — 2026-09-06: apartment **5/107**, house **9/24**, residential 0/34 *(was 7/106 · 12/24 on 2026-08-13)* — **still open, still red** |
| **GQ-D2** | rooms without doors | **R2 APERTURE** (SPEC-49 CI-2) | ✅ **REPRODUCED** — 2026-09-06: apartment **5/107**, house **9/24**, residential 0/34 *(was 7/106 · 11/24)* — **still open, still red** |
| **GQ-D3** | furniture in front of a door | **R3 CLEARANCE** (SPEC-49 CI-3) | ✅ **REPRODUCED in the engine** at a **1 % floor** (3/288 against the real swing arc) — **per-typology rate UNPROVEN** |

> ### ⚠ The measurement corrected the report, and the correction changes the fix
>
> The founder named **two** symptoms — *the corridor does not reach the bedrooms* and *rooms without
> doors*. **The sweep says they are ONE defect.** In the apartment run the two failing sets are
> **identical**; in the house run **11 of the 12** unreachable storeys are doorless. So this is not
> *"a well-doored bedroom stranded behind a bad spine"* — **no door was ever emitted.**
>
> Fixing the corridor-routing would therefore have moved nothing. Full mechanism, victims and the
> `§DOOR-RESCUE-REACH` wet-room exclusion that explains why bathrooms dominate: **SPEC-49 §2**.
> That SPEC owns the defect analysis; this file does not restate it.

**Owner**: the circulation-audit lane. Findings live in
[SPEC-49-CIRCULATION-INTEGRITY](../specs/SPEC-49-CIRCULATION-INTEGRITY.md) and as ISSUE-LOG rows
**L-854…L-858** (landed in `df028328`). The browser probe that followed adds **L-859…L-865**, whose
generator findings — none of them circulation — are §1.5.

### §1.4 — What is NOT-YET-TRUE, stated so nobody mistakes it for a settled invariant

- ~~**No readiness gate exists. Zero of seven.**~~ **CORRECTED 2026-09-06 — ONE now exists, and it
  covers TWO gates PARTIALLY.** The 2026-08-13 reading (`find . -name 'check-*circulation*' -o -name
  'check-*reachab*'` → **empty**) is stale: **`tools/ga-gate/check-generator-circulation.ts`** drives
  all three generators over the committed sweeps and ledgers **CI-1 (= R1)**, **CI-2 (= R2)** and
  **CI-4**. Re-run the find, do not trust this line.
  ⚠ **It is NOT the R1/R2 gate §1.2 describes, and the difference is not a technicality:**
  (a) it is a **NAMED shrink-only ledger of 27 rows, not hard-0** — it passes at exit 1 *with* the
  defects, by design; (b) its CI-1 arm reads the **engine's own carried verdict**, so it cannot
  falsify the engine — SPEC-49 §7 additionally records that predicate as duplicate-name
  LATENT-unsafe; (c) it reads the **engine payload, never the built model**, so a door emitted and
  then dropped by `executePlan` is invisible to it; (d) it counts doors without checking any door is
  **usable**. **R3, R6 and R7 still have no file at HEAD**, and `check-deterministic-regeneration`
  is a **BIM 3.0** gate about model regeneration — **do not cite it for R6.**
- **`SPEC-CIRCULATION-GRAPH.md` states its invariants in binding language and the code does not
  hold them.** It says *"a layout that fails any invariant below is INVALID and must be rejected
  before scoring"*; §1.2 measures 4 cells failing. A specification describing enforcement that does
  not exist is the exact defect class recorded as **L-809 / L-812** in `CLAUDE.md`. Treat that spec
  as a *source of invariants*, not as evidence of them.
- ~~⛔ **The verdict is COMPUTED AND THROWN AWAY at the emit boundary.**~~ **CORRECTED 2026-09-06 —
  THIS BULLET WAS STALE, AND STALE IN THE DIRECTION THAT COSTS MOST.** It read: *"`hardValid` /
  `hardFailedRules` do not survive onto the emitted `LayoutOption` … **Nothing in Phase 1 is
  buildable before it.**"* **`CI-0` shipped in `1559275e`** and the verdict has been crossing the
  emit boundary since. Because this bullet and item 1.1 both still said NOT-DONE, **the item the
  programme calls its own blocker read as un-started while it was already delivered** — a doc
  asserting the ABSENCE of machinery that exists, which is L-809/L-812 inverted, and it parked
  everything sequenced beneath it. Measured at HEAD:
  `npx tsx tools/ga-gate/check-generator-circulation.ts` → verdict **CARRIED (CI-0) 107/107 ·
  24/24 · 34/34**, ARM B **0 disagreements across 165 measured options**.
  ⚠ **What is still TRUE from the old bullet, and must not be lost with it:** the verdict is a
  **verdict, not a refusal**. §TOPO-HARD-REJECT-ALL still ships the least-bad hard-invalid
  candidate (apartment **13/107**, house **15/24** hard-invalid winners shipped anyway), and the
  house path still cannot refuse a storey. **Defects still ship; they are merely no longer
  silent** — `houseLayout/circulationBanner.ts` names the sealed rooms. The founder decision on
  refuse-vs-banner (SPEC-49 §4, CI-1's runtime half) is **still open**.
  ⛔ **Read the gate, never this line.**
- **The 14 dimensional and 10 topology validators are apartment-scoped.** Whether
  `casa-unifamiliar`, `residential-building` or `office-building` reach them at all is **UNPROVEN**.
- **There is exactly ONE normative programme-rules database and it is residential.** `office-building`
  ships an orchestrator and a floor-plate module but **no programme-rules database was found**
  (`find packages -name 'programRules*.ts'` → one file). Office readiness therefore has a missing
  R4/R5 subject, not merely a missing gate.
- **"Production ready" has never been defined for a generator in this repository.** §1.2's seven
  gates are this file's proposal for that definition. Until a contract ratifies them, they are a
  **working definition**, not an invariant. Ratifying them belongs to the contract lane, not here.

### §1.5 — Generator defects the 7 gates CANNOT hold — candidate R8–R10, denominator NOT yet changed

The browser probe on `517f7a70` (ISSUE-LOG **L-859…L-865**) found generator-quality defects that are
**not circulation** and that **no R1–R7 cell can express.** Recording them here rather than forcing
them into an existing cell, because a denominator that quietly absorbs whatever is found stops
meaning anything:

| Candidate | The invariant it would hold | The evidence that demands it |
|---|---|---|
| **R8 — ANNOUNCEMENT** | *the system never ships output it has itself judged non-compliant without saying so* | **L-862**: a generated residential building logged **121 ERROR-severity room-compliance findings** — against **2** in a hand-drawn box — and generation completed with no indication anything was wrong. The compliance tint is opt-in and defaults **OFF** for an explicitly *aesthetic* reason |
| **R9 — STAGE INTEGRITY** | *the generation chain does not advance past a stage that failed or timed out* | **L-863**: `753 elements, 7 levels, 375 walls, 16 slabs, **0 furniture**` — the furnish stage exceeded a `FALLBACK_MS = 12_000` budget on a 24-room level, was silently dropped, and lighting fired anyway (`§CHAIN-TIMEOUT`) |
| **R10 — CONTAINMENT** | *a generated building has a spatial structure; rooms belong to units, units to levels* | **L-864**: generated buildings leave the spatial structure **empty** — rooms sit flat under the level and **no apartment entity exists** — until a user clicks a button in a panel most will never open. The generator knows it made 7 levels and 123 rooms; the panel's own offer proves the counts are derivable |

> **R8 is the same defect as `CI-0`, one level up.** Circulation's verdict is dropped at the *emit*
> boundary; compliance's verdict survives all the way to a **log line** and is dropped at the *user*
> boundary. Two different layers, one pattern: **the system knows, and does not say.** That pattern —
> not any individual room — is what this programme exists to close, and it is why R8 is a gate rather
> than a bug fix.

**These are NOT in the 28.** Adding a gate re-cuts the denominator for every typology at once
(28 → 40), and §5.c makes that a **ratification, not bookkeeping**. They enter when Phase 1 item 1.3
ratifies the gate set — as a contract, not as an edit to this file — and **the ratification should
consider all ten together**, because ratifying seven now and three later would produce exactly the
drifting denominator §-1 rule 2 forbids.

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

### §2.1 — PHASE 1 — CORRECT THE GENERATORS · **measured, not fixed · circulation first**

*The founder's first priority. Nothing in Phase 2 starts while any R1/R2/R3 cell is FAILED.*

| # | Work item | Exit condition | Status |
|---|---|---|---|
| 1.0 | **Reproduce GQ-D1/D2/D3 as failing artefacts** | each defect has a runnable case that goes red today | ✅ **DONE 2026-08-13** — SPEC-49 §2; four reproduction files named there, each driving the real production entry (C74 §3.4) |
| 1.1 | **`CI-0` — carry the circulation verdict across the emit boundary** | `hardValid` / `hardFailedRules` / unreachable + doorless room names ride on the emitted `LayoutOption` | ✅ **DONE — shipped `1559275e`**, re-verified by execution 2026-09-06 (`c1e4de7c`). **This row read "⬜ NEXT, AND IT BLOCKS EVERYTHING BELOW" long after it had shipped** — see the correction box under §1.4. Delivered `LayoutOption.circulation?: LayoutCirculationVerdict`, carrying MORE than the exit condition asked: three never-merged room sets by **id and name** plus the CI-4 gap flags. Carried **107/107 · 24/24 · 34/34**, ARM B **0 disagreements / 165 options**. ⚠ **A verdict, not a refusal** — 1.2 and 1.5 below are NOT closed by it |
| 1.2 | **Fix the house generator first** | `casa-unifamiliar` R1/R2 off **9/24 · 9/24** (re-measured 2026-09-06; was 12/24 · 11/24 at the 08-13 pin); the doorless `Stair` case gone — **4 `Stair` rows remain** in `generator-circulation-ledger.json` | ⬜ **TODO — still the worst generator by a wide margin** (house 38% vs apartment 5%). ⭐ The ledger names the cheapest first move: the **doorless `Stair` rows**, which need no product decision, where the bathroom rows do — §DOOR-RESCUE-REACH's wet-room exclusion is DELIBERATE, so closing those means deciding who rescues a landlocked wet room |
| 1.3 | **Ratify the seven readiness gates** as a contract, not a plan | a contract section defines "production-ready generator" normatively | ⬜ TODO — **contract lane owns this, not this file** |
| 1.4 | **Build R1 REACHABILITY** — enumerate the denominator from the registry, land RED | every generated plan's every room is DETERMINED-reachable, DETERMINED-unreachable, or **UNDETERMINED with a typed reason**; silence is a failure. ⚠ **key the access graph by room `id`, not display name** — SPEC-49 §7 records a latent duplicate-name defect that currently reads a sealed room as reached | ⬜ TODO |
| 1.5 | **Build R2 APERTURE** | zero sealed rooms across all four packs, or a named shrink-only ledger | ⬜ TODO |
| 1.6 | **Build R3 CLEARANCE** + close `CI-3-INSTRUMENT` | the keep-out the solver consults becomes the **real swing arc**; and an end-to-end probe measures the production rate, which needs the L7 room-payload builder reachable from L2 | ⬜ TODO |
| 1.7 | **Wire R4 + R5** — the 24 existing validators become gates over emitted plans | validators run over emitted plans, not only over solver candidates | ⬜ TODO — depends on 1.1 |
| 1.8 | **Build R6 DETERMINISM** for generator output | same brief + same site → identical plan, or a typed reason why not. ⚠ **not** `check-deterministic-regeneration`, which is a BIM 3.0 gate about a different subject | ⬜ TODO |
| 1.9 | **Sweep `office-building`, and sweep all four on REAL plates** (`CI-5-INSTRUMENT`) | no ❔ left in §1.2, and **the 2 CONTESTED cells resolved by measurement** rather than by preference | ⬜ TODO |
| 1.10 | **R8 ANNOUNCEMENT** — the system stops shipping output it has itself judged bad, silently | 121 ERROR-severity compliance findings cannot complete a generation with no user-visible signal (L-862). **Sibling of `CI-0` one layer up** — §1.5 | ⬜ TODO — **denominator change; ratify with 1.3** |
| 1.11 | **R9 STAGE INTEGRITY** — the chain stops advancing past a stage that timed out | a furnish stage that blows its 12 s budget cannot be silently dropped while lighting fires anyway (L-863) | ⬜ TODO — **ditto** |
| 1.12 | **R10 CONTAINMENT** — a generated building has a spatial structure without a user clicking for it | rooms belong to units, units to levels, at generation time (L-864) | ⬜ TODO — **ditto** |

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
Measured 2026-08-13: there is no such package and no such workflow. **The contract now exists** —
[C81 — Design Edit & Intent Preservation](../../02-decisions/contracts/C81-DESIGN-EDIT-AND-INTENT-PRESERVATION.md),
CANONICAL 2026-08-13, authored by the contract lane. **A contract is not an engine**: C81's own §7
names four gates and records every one as **UNBUILT / UNPROVEN** at stamp time. Nothing about the
edit layer's status below changes because a contract was written.*

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
| 3.1 | **Precondition**: BIM 3.0 bar 3 gate exists and its ledger is shrinking | ⛔ **BLOCKED — gate does not exist.** C81 §8 makes the same dependency binding from the contract side |
| 3.2 | Contract the edit layer: what "intent" is, what survives a transform, what a refusal looks like | ✅ **DONE — [C81](../../02-decisions/contracts/C81-DESIGN-EDIT-AND-INTENT-PRESERVATION.md), CANONICAL 2026-08-13** |
| 3.3 | Build C81 §7's four gates | ⬜ TODO — **all four UNBUILT at C81's stamp**; C81 is the authority on what they must do, not this file |
| 3.4 | Establish the edit layer's own denominator (`transform × element × preserved-property`) | ⛔ **cannot be established until 3.1** |
| 3.5 | The engine | ⬜ not scheduled |

**The edit layer holds NO cell in the 28** (§-1 rule 4). Its denominator is a different product and
cannot be enumerated today; scoring it now would be a verdict over an unestablished subject.

> **CAPABILITY DELIVERED**: *"move the kitchen to the north side and keep everything else"* — the
> single most-requested thing a design tool does, and the thing PRYZM cannot do at all today.

---

## §3 — Definition of Done — per phase, falsifiable

| Phase | DONE means | Today |
|---|---|---|
| **1** | the ratified gate set exists (7, or 10 with §1.5's candidates) · each enumerates its subject from the registry · each exits 2 rather than guess · each watched go red · every cell measured, **zero CONTESTED** · GQ-D1/D2/D3 each have a case that went red **then green** | **2026-09-06: 1 gate built covering 2 of 7 invariants PARTIALLY** (`check-generator-circulation.ts` — CI-1/CI-2/CI-4, ledgered not hard-0, watched red in both directions, exits 2 as a blind comparator) **· 6 of 28 cells measured, 2 of those CONTESTED · all 3 defects red, none yet green** |
| **2** | school + museum + hospital each have P-a…P-d · each registered · each scoring all 7 gates · denominator restated at 49 | **not started; blocked** |
| **3** | bar-3 gate exists and shrinks · edit contract ratified · edit denominator enumerable · engine passes it | **blocked at the precondition** |

**No phase is partially done.** A phase with six of seven gates is a phase in progress (C70 §3.2's
no-partial-credit, applied here by analogy — this file does not extend C70's authority, it borrows
its discipline).

---

## §4 — Commit log (append-only; every cell-changing commit)

| Date | SHA | What changed | Cells moved |
|---|---|---|---|
| 2026-08-13 | `a487fe87` | Programme created. Denominator declared at **28**. All 28 cells UNPROVEN — nothing had been measured. | — |
| 2026-08-13 | `65633d7e` | **First measurement, from SPEC-49's executed sweeps.** GQ-D1/D2/D3 all reproduced; the measurement **merged D1 and D2 into one defect** (no door emitted, not a routing failure). C81 landed, so Phase 3.2 closes. `CI-0` inserted as Phase 1's blocking prerequisite. | **UNPROVEN → FAILED ×4 · UNPROVEN → (provisionally) PROVEN ×2** |
| 2026-08-13 | *(this commit)* | **The two ✅s withdrawn within the hour**, by the browser probe (L-859…L-865): a harness said `residential-building` was clean, the founder watching a real generated building said *"rooms without doors, circulation not good"*. Both cells → **CONTESTED**; **CONTESTED** added to §0 as a fourth state. §1.5 opens on three defects no R1–R7 cell can hold, as candidate **R8–R10**, deliberately outside the denominator until ratified. | **PROVEN → CONTESTED ×2** |
| 2026-08-14 | *(L-GENBOUNDARYv2 probe commit)* | **L-907/L-909 evidence, executed** (ISSUE-LOG L-907/L-909 lane appends are the authority; this row only cites them): the strip-slicer bbox mint is pinned by execution (`proceduralLayout.ts:57-87`, **10/18 partition endpoints outside the captured boundary** on a non-orthogonal T-shell); the founder's chooser chips **"25 errors" + "Circulation ~0%" reproduced to the digit**, and both are partly FALSE readings (15 errors = report-layer unmeasured-as-zero; ~0% = BFS over an unbuilt adjacency graph while the option's own doors form a fully-connected chain); L-909(b) **determined**: windows WERE generated, the G-10/G-7/A-7 triple is FALSE → **15 of 19 executed-path errors are false readings**. Candidate rows boundary-capture / plan-fidelity remain candidates — **no cell state moved, evidence only**. | — |

| 2026-09-06 | `c1e4de7c` | **Item 1.1 `CI-0` closed — as ALREADY-SHIPPED, not as newly built.** The lane opened to build CI-0 and found it landed in **`1559275e`**; this file's item 1.1 and its §1.4 blocker bullet had both read NOT-DONE ever since, so *"the item that blocks everything below"* read un-started while it was delivered. Both corrected, with the executed artefact. The circulation gate was **exiting 3 STALE** at HEAD over **11 rows paid by earlier commits and never struck**; struck **38 → 27** after proving all 11 cases still swept (`shipped=true measured=true`), so a *vanished* case could not be mistaken for a *fixed* one. Gate **RC=3 → RC=1** at its declared level. R1/R2 rates re-measured in SPEC-49 §2 first, then quoted: apartment **7/106 → 5/107**, house **12/24 → 9/24** (R1) and **11/24 → 9/24** (R2). **NO GENERATOR CODE CHANGED** — the rate movement is other lanes' work, banked. | **no cell changed state** — R1/R2 stay **❌** on both generators; only their numerators, the gate column, and item 1.1 moved |

> **Read the two rows together, because the pair is the lesson.** The first entry moved four cells to
> FAILED and two to PROVEN. The second entry **took both greens back within the hour.** Neither
> instrument was wrong — the sweep ran on synthetic convex quads, the browser ran on a real building,
> and the gap between them was already a named missing instrument before either result existed.
>
> **A tracker that had banked those two greens would have reported a clean generator on the same day
> the founder watched it fail.** That is the entire failure mode this repository has been correcting,
> and it took four hours to nearly re-commit it. Converting UNPROVEN → FAILED looks like collapse and
> is the opposite; converting PROVEN → CONTESTED looks like regression and is also the opposite.
> **Nothing got worse on 2026-08-13. The lights came on.**

---

## §5 — Anti-patterns for this file

**a.** **Never write ✅ or ❌ in §1.2 without an executed artefact.** ❔ is the honest default and
costs nothing; a wrong ✅ costs a session.
**a2.** **Never resolve a CONTESTED cell by choosing.** It resolves when an instrument settles it.
A harness green and a browser red is a *finding about the harness*, and the browser is closer to the
user, so the burden is on the harness. This rule exists because it was nearly broken on day one.
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
| [SPEC-49-CIRCULATION-INTEGRITY.md](../specs/SPEC-49-CIRCULATION-INTEGRITY.md) | **THE AUTHORITY on §1.2's measured rates.** CI-1…CI-4, the reproductions, the `CI-0` emit-boundary finding, the named missing instruments. This file quotes it and **never restates it** |
| [C81-DESIGN-EDIT-AND-INTENT-PRESERVATION.md](../../02-decisions/contracts/C81-DESIGN-EDIT-AND-INTENT-PRESERVATION.md) | **the binding contract for Phase 3.** What an edit is, the preserved set, refusal obligations, one-edit-one-undo, and §8's hard bar-3 dependency |
| [ISSUE-LOG.md](../../04-reference/ISSUE-LOG.md) | GQ-D1/D2/D3 findings as `L-854…L-858` (verify — pending when this file was written) |
| [BIM30-MASTER-COMPLETION-TRACKER.md](./BIM30-MASTER-COMPLETION-TRACKER.md) | the **other** programme — model trust under change. §-3 is the doctrine this file's gate design copies |
| [BIM30-IMPLEMENTATION-ROADMAP.md](./BIM30-IMPLEMENTATION-ROADMAP.md) §3.1 | **the three bars**; bar 3 is Phase 3's precondition |
| [BIM30-GAP-REGISTER.md](../../04-reference/BIM30-GAP-REGISTER.md) | the 82 rows. **Cross-reference only — never merge** |
| [C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md](../../02-decisions/contracts/C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md) | §19.1 + §20 U-INV-1 — what the edit layer stands on |
| [C16-COMMAND-AUTHORING-PROTOCOL.md](../../02-decisions/contracts/C16-COMMAND-AUTHORING-PROTOCOL.md) | how a generator commits its result |

---

*End — Generative Quality Master Programme Tracker · created 2026-08-13 · LIVING.*
