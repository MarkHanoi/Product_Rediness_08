# Element Creation Pipeline — Production-Readiness Audit

**Measured 2026-08-29 · HEAD `064a838e` · branch `main`**
Scope: every element family, against C01 §1–§5 (P1–P8, 8-layer model, import matrix, package
ownership, 9 convergence booleans, CI gate inventory) and C11 (§2 shape, §5 handler contract,
§5.5 registration, §10.2 bridge invariants, §11 matrix).

> **Status of this document.** Phases 0, 1, 2, 3 and 4 are COMPLETE. §2 carries **29 rows** —
> asserted equal to `ls families/*.json | wc -l` — and §3 carries the seven counted facts:
> **29 / 26 / 21 / 21 / 15 / 21 / 13**. Zero INCOMPLETE verdicts; zero invented cells. The full
> Phase 4 synthesis, with 27 ranked findings each carrying WIRE / REPLACE / REMOVE / DOCUMENT and
> an acceptance command naming a **printed number**, is at `raw/synthesis.json`.
>
> ⚠ **An adversarial pass over the family rows (`raw/verify-families.json`) produced THREE
> substantive refutations and FIVE citation refutations, and they are folded in below.** The
> substantive three: `furniture` and `plumbing` DO export (both rows had grepped
> `plugins/ifc-export/`, not the exporter the button runs), and `balcony` does **NOT** persist
> (its proof was D6-void — the test assigned the very `window.runtime` whose absence is the
> defect). **§8's F-01 and F-09 are superseded by §2/§3 and by `raw/synthesis.json`.**

---

## 1 — MEASUREMENT-SYSTEM STATUS

> **D4 — a crashing gate is not a passing gate and not a failing gate.**
> **D3 — RC=0 is not 0 violations.**

### 1.1 — ⛔ THE MERGE-BLOCKING GATE JOB FAILS AT HEAD

`run-all.ts:1162` sets `anyFailed = true` on exit code 3 **unconditionally** and never absorbs it
via `gate-debt.json` (RATCHET-EXCEEDED-IS-NEVER-DEBT, R7 / L-836). Seven gates exit 3 at HEAD:

| Gate | RC | Measured vs ceiling |
|---|---|---|
| `check-cast-count` (P4) | **3** | scoped strict **11 / 3** — headroom **−8** |
| `check-otel-spans` (P8) | **3** | Zone B breached; Zone C ungated |
| `check-layer-boundaries` | **3** | **all four arms breached** (below) |
| `check-command-naming` | **3** | 5 non-canonical prefixes / baseline **0** |
| `check-no-commandmanager` | **3** | literal `commandManager.execute` **12 / ceiling 0** — hard regression |
| `check-graph-write-coverage` | **3** | 4 findings against a NAMED ledger of **0** |
| `check-gate-subject-floors` | **3** | **7 gates lack a subject floor**; ceiling 0 |
| `check-batch-creation-coverage` | **1** | FAIL — `CreateCurtainWallsFromSlabCommand` no longer loops unbatched |

**Nothing downstream of these is inadmissible** — they are honest FAILs, not misconfigurations.
But **CI is red on `main` by the repo's own rules**, and every "the gates are green" statement
about this pipeline is false as of this measurement.

> **Adversarial pass, confirmed:** `exit_code_2 = 0 · ENOENT = 0 · empty_scope = 0` across the
> suite. **No gate is PROVEN misconfigured**, so no conclusion in this audit is inadmissible.
> All 98 scripts registered in `run-all.ts` resolve on disk (0 missing).

### 1.2a — BUT THE PROPERTY IS UNDECIDABLE FOR SEVEN GATES, AND THE REPO SAYS SO

`check-gate-subject-floors.ts` — **RC=3**, *"gates inspected: 73 · floored: 66 · unfloored: 7."*
In the gate's own words: **"A gate without a subject floor cannot tell '0 violations' from 'walked
nothing'."**

| Unfloored gate | Defect |
|---|---|
| `check-material-id-required.ts` | no floor constant AND no exit-2 path — **returns RC=0** |
| `check-material-maps-tiling.ts` | exit-2 path, no declared floor — **returns RC=0** |
| `check-runtime-arg-omitted.ts` | no floor constant AND no exit-2 path — **returns RC=0** |
| `check-property-rac-matrix.ts` | no floor constant AND no exit-2 path |
| `check-render-aggregate-seam.ts` | no floor constant AND no exit-2 path *(also in no runner)* |
| `check-tool-activator-coverage.ts` | exit-2 path, no declared floor |
| `check-batch-creation-coverage.ts` | declares a floor but has **no reachable `process.exit(2)`** |

**Three of the seven currently return RC=0.** Those three greens are not refuted — they are
**unfalsifiable**, which is a different and worse state than wrong.

### 1.2b — TWO LATENT HAZARDS IN `check-cast-count.ts`

**(a) An arm that can never fail.** `check-cast-count.ts:78-79` —
`if (!existsSync(BASELINE_FILE)) return Number.MAX_SAFE_INTEGER;`. If
`.ga-gate/baselines/cast-count.json` is ever absent, the strict arm **can never fail**: a missing
prerequisite and a clean measurement print the same result. *(The file exists and is git-tracked
at count 3 — latent hazard, not a current false green.)*

**(b) A gate that writes its own tracked ledger.** When `current < baseline` it calls
`writeBaseline`, mutating a **git-tracked** file. A local run can silently move the ceiling.
*(Not triggered here — 11 > 3 returns first; confirmed by `git status --porcelain`.)*

### 1.2c — ⚠ ONE SUSPECTED DEFECT WAS REFUTED

I expected to find the resolver-blind lint rule (`eslint-plugin-boundaries` set to `error` with no
`import/resolver`, silently checking nothing). **It is still unresolved — and that is deliberate.**
`eslint.config.js:402-416` states it outright:

> *"There is NO import/resolver configured here, and adding one is a deliberate NON-choice … pnpm
> symlinks some `@pryzm/*` and not others, so resolver-based checking caught a violation in one
> package and silently skipped the identical one next door. THE AUTHORITY FOR THE LAYER RULE IS
> `tools/ga-gate/check-layer-boundaries.ts`."*

**This is a reasoned decision with a named authority, not a gap. It is NOT a finding.**

### 1.2 — ⛔ TWO GATES CONTAIN DEFECTS THAT MANUFACTURE FALSE GREENS

**(a) `check-single-compose.ts` (P1) prints a hard-coded literal.**
The gate located and named a rival — `apps/component-editor/src/app/familyEditorRuntime.ts:85
createFamilyEditorRuntime` — and then its terminal line reads:

```
[single-compose] one composition root (...), 0 rivals, 2/2 production caller(s).
```

`0 rivals` at `check-single-compose.ts:216` is a **hard-coded string, not the count**. RC=0.
A reader who trusts the terminal line concludes P1 is clean at zero rivals; the gate's own body
printed one. **This is the exact defect class the audit exists to hunt, inside the instrument.**

**(b) `check-gate-subject-floors.ts` reports that 7 of 73 gates have NO subject floor.**
A subject floor is the mechanism that prevents scope drift — it refuses a gate whose scan set has
collapsed. Seven gates can therefore scan an emptied directory and report `0` forever. The gate
that polices the instrument's honesty is itself exit-3.

### 1.3 — GATE INVENTORY RECONCILED

| | Measured | Documented (C01 §5) |
|---|---|---|
| Gate scripts on disk | **75** | 31 |
| Bucket B (on disk, in no runner, no ci.yml step) | **1** — `check-render-aggregate-seam.ts` (committed `377dd06b`, L-10530) | — |
| Gates run in this audit | 6 targeted + 24 principle/pipeline | — |

### 1.4 — WHERE CLAUDE.md IS NOW WRONG

`CLAUDE.md`'s P4 bullet, **itself a correction dated 2026-08-18**, asserts:

> *"RC=0, terminal line `[cast-tripwire] OK: 3 = baseline.` … Both arms are within ceiling;
> neither is breached."*

**Measured 2026-08-29: RC=3, scoped strict arm 11 against a ceiling of 3.** The correction that
fixed a stale-*pessimistic* reading has become stale-*optimistic*. Same failure, opposite sign.
A proposed patch is filed in `proposed-patches/`.

**Carried blind spot, not re-measured here:** `gate-debt.json`'s own `$comment` records **409
`window as unknown as` casts across 151 files that P4's regex cannot see.** A green P4 would still
mean only *"no new casts in the one spelling it checks."*

---

## 2 — VERDICT TABLE (per family)

**COMPLETE.** `ls families/*.json | wc -l` → **29**. **This table has 29 rows.** They map 1:1 onto
`census.json`'s own classification — 18 `ELEMENT_FAMILY_by_kind` + 6 `by_other_signals` +
2 `IN_ELEMENT_PLUGIN_IDS_but_no_verb_and_no_schema` + 3 `NOT_ON_DISK` = **29**. No family in the
census lacks a row; no row lacks a census entry; **zero INCOMPLETE verdicts.**

> **Normalisation note.** THREE row schemas were present, not two — variant 1
> (`registration`/`handler`/`lifecycle`/`milestones`/`status`), variant 2
> (`A_registration`…`D_seven_facts`/`first_failing_link`, **no `status`**), and a third shape used
> by the edge cases (`subject_class`/`deliberate_or_orphan`/`milestones`/`status`). Values were
> matched on the **leading token**, never on equality. Four rows (ceiling, curtain-wall, slab,
> wall) carry **object** values of the form `{v|verdict, proof}` that a string comparison would
> have silently dropped.

**Verdict rule.** `PRODUCTION-READY (create chain)` = all seven facts measured YES on at least one
complete route, no measured NO anywhere. `PARTIAL` = at least one route works end-to-end but at
least one fact is NO/PARTIAL. `NOT-READY` = no measured route by which a user can create it and see
it. `UNVERIFIED` = the decisive links could not be measured and none is measurably broken.

> ⚠ **"PRODUCTION-READY (create chain)" is deliberately qualified and is NOT a green light.**
> **All five** so graded have a measured failure *outside* the create chain — wall (7 UNMIRRORED
> update verbs), handrail (update verbs), roof (6 of 12 update verbs fail at `renders_3d`), stair
> (the chain holds through a **legacy `commandManager` route**), furniture (a promotion the
> adversarial pass explicitly declined to bless).

| # | Family | Verdict | First failing link | C11 §11 matrix says | Refutes? |
|---|---|---|---|---|---|
| 1 | annotation | **PARTIAL** | `exports` — no IFC/PDF/DXF surface carries an annotation; four negative greps over four directories confirmed to exist, plus no `AnnotationReader` | **NO ROW** (§11.11 prose only, citing the LEGACY CommandManager path) | ✅ |
| 2 | **balcony** | **PARTIAL** | **`persists`** — corrected from `exports`. `ProjectSerializer.ts:1519 readPluginStore('balcony')` reads `window.runtime.stores.balcony`; composeRuntime's `StoresSlot` has **no balcony key and no index signature** | **NO ROW** (§11 preamble :1267 — "MUST be updated whenever a bridge is added") | ✅ |
| 3 | bathroomPod | **PARTIAL** | `persists` — DECLARED unpersisted (L-11527), 1 of the gate's 3 declared losses | **NO ROW** — and it has no CEB case either, so a reader finds neither | ✅ |
| 4 | beam | **PARTIAL** | `renders_3d` on the **3-D BeamTool bus leg** — the command commits, the CEB refuses to emit, a phantom beam exists with no mesh | Row **Beam**, every cell confirmed, Status **FULL** | ✅ |
| 5 | **boundary-line** | **PARTIAL** | **`persists`** — SAVE HALF ONLY. The restore (`ProjectLoader.ts:1628-1668`) sits in the legacy branch of `_useImportCommandPath()`, which returns **TRUE by default**; `grep -c boundaryLine ImportProjectCommand.ts` → **0** | **NO ROW** — and this family refutes the matrix's model most sharply (it calls no `LegacyStore.add()` at all, by design) | ✅ |
| 6 | ceiling | **UNVERIFIED** | `exports` = NO is the only outright NO; `reachable`/`renders_3d`/`renders_plan` are UNVERIFIED — probe P-1 printed `ceiling=undefined`, there is no readback target | Row **Ceiling**, ✅ on all six, Status **FULL** — the one B1 row not refutable cell-by-cell | — |
| 7 | column | **PARTIAL** | NONE on create. `renders_3d` on the **batch** chain (silent) and on 2 of 8 update verbs | Row **Column**, every cell confirmed | ✅ (Status only) |
| 8 | curtain-wall | **UNVERIFIED** | `reachable` — UNVERIFIED, **not NO**. Probe P-1 printed `curtainwall=undefined` *and* `curtain-wall=undefined` | Row **Curtain Wall**, FULL, "`add()` omits storeEventBus" + active `TODO-CW-STORE-BUS` | ✅ (cell 3, legend, spelling, **and the gap row**) |
| 9 | **dimension** | **NOT-READY** | **`reachable`** — `dimensionTool` is **READ** at `PluginRegistry.ts:1051` and **ASSIGNED NOWHERE IN THE REPO**. The "not ready — engine not yet initialised" branch is **permanent** | **NO ROW**; §11.14 claims a `*.move` handler for *every* family incl. dimension | ✅ |
| 10 | door | **PARTIAL** | `dispatchable` — `door.create` refuses every well-formed payload **by construction** (`CreateDoor.ts:154`; the brief's `:130-136` is an unrelated sillHeight guard). **The family IS reachable, via `wall.opening.create`** | One row "Wall Opening (Door/Window)", FULL, naming `OpeningStore.add()` | ✅ (zero `openingStore.add(` calls exist) |
| 11 | floor | **PARTIAL** | `exports` — no `FloorReader`; `ExportIFC.ts` builds an 11-key stores object with no `floorStore` | Row **Floor**, all six confirmed | ✅ (Status only) |
| 12 | furniture | **PRODUCTION-READY** *(create chain)* | NONE — **`exports=NO` was REFUTED**: `FurnitureReader.ts:41` → `IfcFurnishingElement` | Row **Furniture** — "No bridge", "3D via bus ❌", LEGACY-ONLY | ✅ **4 of 7 cells** |
| 13 | **grid** | **NOT-READY** | **`reachable`** — `grid.create` reaches no renderer. The live route is a **different verb**, `grid.add` via the `initBusHandlers.ts:275` legacy bridge | **NO ROW**; §11.11 says "both paths are wired" | ✅ |
| 14 | handrail | **PRODUCTION-READY** *(create chain)* | NONE. First failure is the UPDATE verbs | Row **Handrail** — "No bridge", VDT+bimManager ❌, LEGACY-ONLY | ✅ **5 of 7 cells** |
| 15 | lift | **PARTIAL** | `renders_plan` (**cabin only**) — no cabin plan symbol builder anywhere; the enclosure is complete to `exports` | **NO ROW**; §11.2 steps 5 and 6 both skipped | ✅ |
| 16 | liftPart | **PARTIAL** | `renders_plan` — no plan symbol builder; absent from `GEOMETRY_ELEMENT_TYPES` | **NO ROW** | ✅ |
| 17 | lighting | **PARTIAL** | `renders_plan` — the bridge calls `bimManager` (`:2826`) but **no `viewDependencyTracker`**: the ONE bridge of fifteen calling half the pair | Row **Lighting** — "OUT-OF-SCOPE — not a geometry element" | ✅ **5 of 7 cells** |
| 18 | plumbing | **PARTIAL** | `reachable` for the **DTO verb** `plumbing.create` (zero subscribers). The working route `plumbing.createFixture` has **no failing link** — its `exports=NO` was **REFUTED** (`PlumbingReader.ts:48` → `IfcSanitaryTerminal`) | **NO ROW**; §11.11 prose confirmed | ✅ (by omission) |
| 19 | pool | **PARTIAL** | `renders_plan` (**water body only**) — basin walls and floor slab project correctly | **NO ROW** for Pool or Water | ✅ |
| 20 | roof | **PRODUCTION-READY** *(create chain)* | NONE on create. 6 of 12 update verbs fail at `renders_3d` | Row **Roof**, all six confirmed, Status **FULL** | ✅ (Status only) |
| 21 | room | **PARTIAL** | `renders_plan` — every earlier **and later** link holds; `'room'` is absent from `GEOMETRY_ELEMENT_TYPES` | Row **Room**: "N/A (room derived, **not tool-created**)" | ✅ **3 of 7** — `RoomPlanToolHandler.ts:114` is a user-drawn polygon |
| 22 | section-view | **NOT-READY** | `reachable` | **NO ROW** — and the contract never says whether it is an element or a view | ✅ |
| 23 | selection | **NOT-READY** | `dispatchable` | **NO ROW** — correctly, it is not an element | — |
| 24 | **slab** | **PARTIAL** | **`reachable`** — READBACK-NEGATIVE. Probe P-3: dispatch OK, then `slabStore.getById(id) = undefined`. The CEB case reads `polygon` and **never `boundary`**, a shape `PreviewManager.ts:333` actually sends | Row **Slab**, ✅ all cells, Status **FULL** | ✅ **cell 1, therefore Status** |
| 25 | stair | **PRODUCTION-READY** *(create chain)* | NONE — but the chain holds **through a legacy `commandManager` route** | Row **Stair**, Status **⚠ PARTIAL** | ✅ (detail only — `:340`, not `:201`) — **the one honest row** |
| 26 | **structural** | **NOT-READY** | **`reachable`** | **NO ROW**; §11.14 counts `structural.move`, a **deliberately refusing dead verb** | ✅ |
| 27 | wall | **PRODUCTION-READY** *(create chain)* | NONE — the only D6-clean registration proof in the audit. First family failure: **7 UNMIRRORED update verbs** | Row **Wall**, ✅ all seven | ✅ **the LEGEND**, not the cell — following it literally would reintroduce §G3-STALE |
| 28 | water | **PARTIAL** | `renders_plan` — **DISPUTED** (see §9). The bridge *does* register both spatial authorities | **NO ROW** — the matrix answers "no bridge" by silence while `CommandEventBridge.ts:2051` answers yes | ✅ |
| 29 | window | **PARTIAL** | `dispatchable` — `window.create` refuses by construction (`CreateWindow.ts:98`). **The family IS reachable, via `wall.opening.create`** | Shares the "Wall Opening" row, FULL | ✅ (`OpeningStore.add()`) |

**Twenty-seven of 29 rows refute the C11 §11 matrix.** The two that do not are `ceiling` (confirmed
cell-by-cell) and `selection` (correctly has no row). **Fifteen of the 29 have NO ROW AT ALL.**

---

## 3 — THE SEVEN SEPARATE FACTS, COUNTED

| Fact | Count of 29 | What the drop from the line above means to a **user** |
|---|---|---|
| **authored** | **29** | Everything exists. **Not one finding in this audit is "the capability does not exist."** |
| **dispatchable** | **26** | −3, and **two are refusals BY DESIGN** — `door.create` and `window.create` refuse every payload so that `wall.opening.create` stays the one write path. Only `selection` is a real failure |
| **reachable** | **21** | −5. **This is where the product stops answering a gesture.** The user clicks, the app reports success, nothing exists |
| **renders 3D** | **21** | **±0 — the same 21.** In this codebase reaching the authoritative store and appearing in the viewport are the *same event*. The 3-D viewport is the honest surface |
| **renders plan** | **15** | **−6, the narrowest fact in the audit** and the most user-visible. A BIM tool that draws in 3-D and not in plan is not a BIM tool — plan is where drawings are issued |
| **persists** | **21** | **+6 — the number RISES, and that is the tell.** Families that never draw still save; two that draw perfectly do not survive reload |
| **exports** | **13** | **−8. Less than half.** The model outruns the deliverable by more than 2:1 |

### 3.1 — What each gap MEANS

**29 → 26 (dispatchable).** Two of the three are correct. Reading this drop as a defect would
restore the rival write path the repo deliberately removed.

**26 → 21 (reachable).** `grid`, `structural`, `dimension`, `section-view`, `slab`. Each has a
schema, a store, a handler and a CEB case, and no user gesture arrives — or arrives and lands
nowhere. `dimension` is the sharpest (an **unsatisfiable gate**, L-716 shape: `dimensionTool` is
read and never assigned). `slab` is different: it *is* reached, but `slab.create {boundary}` — a
shape the payload type accepts and `PreviewManager.ts:333` sends — lands in no store.
**A successful creation and a silent refusal are the same number of pixels.**

**21 → 21 (renders 3D).** Nothing in the measured set reaches a store and then fails to draw.
⚠ What this number hides is **FIDELITY, not presence**: roof drops `materialId`/`materialColor`
through the bridge and still counts YES, because **the seven-fact chain has no fidelity axis.**

**21 → 15 (renders plan).** Not one bug but a membership list — `GEOMETRY_ELEMENT_TYPES`
(`ViewDependencyTracker.ts:42-49`), which omits `room`, `lighting`, `water`, `liftPart` and
`boundaryLine`. The consequences differ in kind: the lift cabin and the pool's water have **no plan
symbol builder at all**; lighting's bridge calls `bimManager` but **not** `viewDependencyTracker`;
slab fails plan for exactly the payloads that fail 3-D, both guards sitting downstream of the same
`!ev.polygon || !ev.id` early return.

> ⚠ **A METHOD CORRECTION THIS AUDIT OWES ITSELF.** The brief's rule *"missing EITHER
> `registerElement` means `exportForView` returns 0 elements"* **is too strong.** `exportForView`'s
> PLAN branch builds its set from `levels.flatMap(l => l.childrenIds)` — **bimManager only**.
> `viewDependencyTracker` feeds *targeted dirty-marking*; its absence degrades to the §G3-STALE
> fallback, it does not empty the export. And plan **symbol injection**
> (`EdgeProjectorService.ts:3936`) is a **SIBLING** of the mesh loop at the same indent, not a
> child — so door, window, furniture and plumbing symbols do not require the family to be in
> `childrenIds` at all. **Three admissible mechanisms, not one.**

**15 → 21 (persists) — THE SINGLE MOST DIAGNOSTIC MOVEMENT IN THE TABLE.** The number going *up*
proves these are not one pipeline with a leak. And the count is not the point — **the silence is.**
`balcony` reads NO through a channel that **does not exist** on the composed runtime while
`snapshotFamilyCoverage.ts:161` **declares it `status:'persisted'`**, so it is not in
`UNPERSISTED_FAMILY_KEYS` and the C84 EI-6 loss loop **never names it**. A user authors a balcony,
sees it drawn, is told the project saved, and it is gone on reload with **no console line**.
`boundary-line` is the same shape one layer along: **saved and never restored, which is strictly
worse than never saved.** Contrast the three **honest** losses — bathroomPod (L-11527), section-view
(L-11524), structural (L-11523) — which are declared and named at baseline 3. **A declared loss is a
product decision; an undeclared one is data destruction.** And the gate blessing all of it exits 0,
printing *"NOT ESTABLISHED HERE: that any family ROUND-TRIPS."*

**21 → 13 (exports).** The end of the chain for twice as many families as any other fact.
Annotations and dimensions do not export **at all** — a sheet exported to PDF carries no dimensions.
This is also **the audit's own worst-measured column**, and the reason is instructive: **two IFC
exporters exist for one concept.** `packages/file-format/src/export/ifc` (what the Export IFC button
runs) carries per-family Readers including Furniture and Plumbing; `plugins/ifc-export` reads
walls/slabs/doors/windows/columns/beams/rooms only. Two rows searched only the plugin subtree and
reported NO for families that **do** export — a search **by directory name rather than by
capability**. The `floor` row is the control case, and its own printed listing contained the
`FurnitureReader` and `PlumbingReader` that refuted its siblings: **the refuting evidence was already
inside this audit.** ⚠ **14 families read `exports=NO` and there is no single place that says which
of those 14 are intentional.**

### 3.2 — ⛔ THE BRIEF'S OWN HEADLINE OVER-REPORTED THREE GAPS

Each of the three proposed fixes was **worse than the measured state**. This is D2, and it is not a
stylistic preference.

| Brief | Measured | The fix it implied |
|---|---|---|
| **G1** — 8 families "dispatchable but INVISIBLE" | **FIVE of the eight are reached**: `room` (`RoomPlanToolHandler.ts:114`), `plumbing` (a store-driven symbol builder that never consults `childrenIds`), `annotation` (three live dispatchers + a separate render subsystem), `balcony` (member re-stamping onto the members' own channels), `pool`. **Only `grid`, `structural`, `dimension` are genuinely invisible** | Would have built **five rival implementations** |
| **G2** — `water` is "a bridge listening for an event nothing emits" | **REFUTED.** The emitter is `CommandEventBridge.ts:2051`, inside `case 'pool.create':` (`:1871`). Water owns no verb **deliberately** — `PluginRegistry.ts:329-337`, ADR-0124 §4 | **Delete a live render bridge**, or **mint the exact rival the ADR forbids** |
| **G3** — `liftPart`/`bathroomPod` are schema-less compound **members** | **Half refuted.** `bathroomPod` is a compound **PARENT** owning two verbs. The "no L0 schema" half holds — **and holds for `lift` too**, whose shape is a hand-written `z.object` at **L2** | Would have mis-scoped the C47 format change |

**All three were NAME-shaped searches.** Searching for the *capability* finds what searching for the
*name* cannot.

---

## 4 — CENSUS (Phase 1)

Eight independent sources, compared as SETS in both directions. **Union 69 · 24 element families ·
25 infrastructure · 3 registered with no directory on disk.**

| # | Source | Count |
|---|---|---|
| S1 | `plugins/` directories on disk | **51** |
| S2 | `ALL_PLUGINS` ids | 30 |
| S3 | `PLUGIN_CATALOG` (`plugins.list()`) | 43 |
| S4 | `ELEMENT_PLUGIN_IDS` | 27 |
| S4b | `STORE_ONLY_PLUGIN_IDS` | 3 |
| S5 | `GEOMETRY_ELEMENT_TYPES` | 19 |
| S6 | CEB `case '<x>.create'` | 22 |
| S7 | `initTools` `.created` bridges | 15 |
| S8 | `defineElement` kinds in `schemas/src/elements/` | 30 (of 33 files) |

**19 set differences recorded.** The census gate `check-plugin-census-equivalence.ts` exits **RC=0
— at baseline, not at zero drift**: it reports **24 plugins on disk that contribute NOTHING at
boot** (arm A, baseline 24) and 8 on disk not reported by `plugins.list()` (arm B, baseline 8).
**This is D3 in its purest form: a green exit code over 32 named drift rows.**

**The package census disagrees with itself three ways:**

| | Measured 2026-08-29 | C01 §3:162 | C07 |
|---|---|---|---|
| packages | **103** manifests (105 entries, 2 non-dir) | 54 | — |
| apps | **13** | 12 | — |
| plugins | **51** | 46 | 48 |

The layer gate's own workspace count (**167**) reconciles exactly with disk: 103 + 13 + 51 = 167.
**The disk is consistent; the contract is stale by roughly a factor of two on packages.**

---

## 5 — CROSS-CUTTING: P1–P8 (Phase 2)

| P | Gate | RC | The number that matters |
|---|---|---|---|
| **P1** | `check-single-compose` | 0 | 1 definition · **1 rival named** · 2/2 callers — **but the success line hard-codes "0 rivals"** |
| **P2** | `check-three-imports` | 0 | **hard-0 across 8,171 files.** Strongest reading in the set — zero headroom, widest scope |
| **P3** | `check-raf-count` | 0 | **1 owner** (`RafAdapter.ts`), from *"Owners (code lines only)"* — 5 comment-only mentions correctly excluded |
| **P4** | `check-cast-count` | **3** | scoped **11 / 3**, headroom **−8** — BREACHED |
| **P5** | `check-domain-purity` | 0 | hard-0, 192 files, scope independently confirmed non-empty |
| **P6** | `check-no-direct-store-writes` | 0 | **37 / 37** — zero headroom **at a non-zero ceiling**. `packages` is **not in scope**: a direct store write from a package is invisible by design |
| **P7** | `check-visibility-intent-not-ui` | 0 | arm A hard-0 (20 files) · **arm B 40 / 43 — headroom 3**. PROXY-ONLY |
| **P8** | `check-otel-spans` | **3** | Zone A **275/275** hard-0 clean · Zone B breached · **Zone C UNGATED** |

**P3 is documented as FAILING at 5 owners. It passes at 1.** The documentation is stale in the
repo's favour — worth correcting, because a stale-pessimistic gate reading gets budget spent on a
problem that no longer exists.

### 5.1 — Layer boundaries: all four arms breached

`check-layer-boundaries.ts` — **RC=3**, 167 workspace packages, 152 classified:

| Arm | Measured | Baseline | Δ |
|---|---|---|---|
| Upward imports | **105** | 102 | **+3** |
| SDK-facade bypasses | **186** | 182 | **+4** |
| Banned third-party | **123** | 113 | **+10** |
| Unclassified packages | **15** | 13 | **+2** |

SDK bypass is kept **separate** from upward imports by the gate itself — `plugin → renderer-three`
is a *downward* edge and a facade-encapsulation breach, not a layer violation. Merging them makes
both unreadable.

### 5.2 — ADR-0367 extension-contract placement: **CONFORMS**

`PluginRegistration` is declared **exactly once**, at `packages/plugin-sdk/src/registration.ts:121`
(L5). No rival contract at L6 or L7. The documented root cause of families shipping undispatchable
**has been fixed and holds.**

### 5.3 — The mirror gates: declaration ≠ reachability

| Gate | RC | What it establishes |
|---|---|---|
| `check-mirror-completeness` | 0 | **200 verbs write a plugin DTO store · 44 have a bridge case · 156 do not** (109 UNMIRRORED + 47 declared-exempt). Establishes only that a channel is **DECLARED**. |
| `check-mirror-reachability` | 0 | **14 verbs dispatched across 3 families.** REACHES-SUBSCRIBER 7 · NO-TYPED-EVENT 4 · REFUSED 3 · **9 of 28 channels orphaned.** |

**Read those two rows together.** Reachability is proven for **7 verbs across 3 families**. There
are 24 element families and 361 verbs. The read-back half of the pipeline is measured for roughly
2% of the surface, and both gates exit 0.

---

## 6 — THE 9 CONVERGENCE BOOLEANS

**Documented 5/9. Measured 2/9 strict, 3/9 at its most generous. Phase F requires ≥ 6/9.**

| # | Boolean | Verdict | Measured |
|---|---|---|---|
| 1 | `legacy_src_folders == 1` | **MISCONFIGURED** | `src/` has **0 directories, 7 loose files**; `src/ui` **does not exist**. The predicate names a folder that is gone — it was never true and **cannot become true as worded** |
| 2 | `window_any_in_src_ui == 0` | **MISCONFIGURED** | **CONFIRMED SCOPE ARTEFACT.** The 0 comes from a nonexistent directory. Successor scope `apps/editor/src/ui` = **1,120 files, 70 casts** |
| 3 | `raf_owners_outside_frame_scheduler == 0` | **PASS** | Genuine hard-0, 5,438 files, code lines vs comments distinguished |
| 4 | `default_runtime == composeRuntime()` | **PARTIAL** | Holds for the editor runtime; the gate's success line is false (§1.2a) |
| 5 | `EngineBootstrap_LOC == 0` | **PASS** | Gate scans 3 dirs — cross-checked with a whole-tree `find`, which agrees |
| 6 | `all_workflows_green == workflows_total` | **FAIL** | 8 workflows; **6 are `workflow_dispatch`-only** — only `ci.yml` and `deploy-fly.yml` trigger on push |
| 7 | `plugin_sdk_published` | **FAIL** | npm **E404** for both `@pryzm/plugin-sdk` and the `publishConfig` rename `@pryzm/sdk` |
| 8 | `headless_published` | **FAIL** | npm **E404**. `private:false`, `access:public`, rc version — **publish-ready and unpublished** |
| 9 | `marketplace_live` | **FAIL** | DNS: `marketplace.pryzm.app` **does not resolve**. Control `pryzm.app` → 302 from the same shell in the same minute |

**Two of C01's five "achieved" booleans do not hold**, and #1 and #2 fail for the same reason:
**they are satisfied by the absence of a directory, not by clean code.** Absence of the folder and
absence of the defect are the same value — this is `§CONTEXT-DATA-HONESTY` restated as a
convergence metric.

---

## 7 — CONTRACT CONFLICTS (DOC-CONFLICT)

| ID | Conflict | Severity |
|---|---|---|
| **DC-01** | **C11 §11 matrix vs §0.0** — matrix marks handrail/furniture/lighting `❌ No bridge`; §0.0 (2026-08-18) proves all three are live (`§FT-HANDRAIL`, `§FT-LIGHTING`, `§FT-FURNITURE`). **Confirmed by Phase 1: all three appear in the measured `initTools` bridge set.** §11.1's work order is discharged | **P1** |
| **DC-02** | **C11 §11 contradicts ITSELF ~20 lines apart** — the Furniture matrix row says `❌ No bridge`; the §11.1 gap table immediately below says `✅ DONE`. Both are labelled the normative record | **P1** |
| **DC-03** | **§11.11 audits Plumbing / Grid / Annotation in prose; the §11 matrix has no row for any of them.** Absence from a normative matrix reads as *"not an element family"*, not *"unmeasured"* | **P1** |
| **DC-04** | **The normative matrix covers 14 families. The measured census is 24.** Ten families have no normative compliance record at all | **P0** |
| **DC-05** | **C11 §7.2** claims *"no OTel span, and plugin-sdk exposes no tracer"*; §0.0 measures `withHandlerSpan` in **253 files**. *(Do not read that as P8 satisfied — the plumbing existing and the coverage invariant holding are independent, and P8 is RC=3)* | **P2** |
| **DC-06** | Every `§11.x` per-element audit is stamped **2026-05-19** — over three months stale, sitting beneath a §0.0 that refutes three of its rows | **P2** |
| **DC-07** | **`CLAUDE.md` P4 bullet** asserts both arms within ceiling; measured RC=3 (§1.4) | **P1** |
| **DC-08** | **C01 §3** documents 54 packages / 12 apps / 46 plugins; measured **103 / 13 / 51** | **P2** |
| **DC-09** | **C01 §4** documents 5/9 booleans; measured 2/9 strict | **P1** |
| **DC-10** | **C01 §5** documents 31 gates; **75** scripts on disk | **P2** |

---

## 8 — RANKED FINDINGS

| # | Finding | Severity | Disposition |
|---|---|---|---|
| F-01 | **8 families dispatchable but invisible** — `room grid plumbing structural annotation dimension balcony pool` have a CEB `.create` case and no `initTools` bridge. *A successful creation and a silent refusal are the same number of pixels to the user.* Per-family confirmation pending Phase 3 — the census agent already flags balcony/pool as possibly bridged by member-event re-stamping | **P0** | **WIRE** (pending Phase 3) |
| F-02 | **`check-single-compose.ts` hard-codes `0 rivals`** while naming a rival — a false green manufactured inside the instrument | **P0** | **REPLACE** |
| F-03 | **Merge-blocking `ga-gate` job fails at HEAD** on 7 exit-3 ratchets no ledger can absorb | **P0** | **WIRE** |
| F-04 | **Read-back is proven for 7 verbs across 3 families** of 361 verbs / 24 families, and both mirror gates exit 0 | **P0** | **WIRE** |
| F-05 | **Booleans #1 and #2 are scope artefacts** — satisfied by a directory that no longer exists; successor scope has 70 casts | **P1** | **REPLACE** |
| F-06 | **`commandManager.execute` literal = 12 against a ceiling of 0** — hard regression, gate terminal reads *"WORSE THAN…"* | **P1** | **REPLACE** |
| F-07 | **All four layer arms breached** (+3 / +4 / +10 / +2) | **P1** | **WIRE** |
| F-08 | **7 of 73 gates lack a subject floor** — they can scan an emptied directory and report 0 forever | **P1** | **WIRE** |
| F-09 | **`water` bridge listens for an event nothing emits**; **`lift` is an element family with no L0 schema** | **P1** | **REMOVE / WIRE** (pending Phase 3) |
| F-10 | **5 non-canonical command prefixes against a baseline of 0** — `balcony bathroomPod boundaryLine curtainWall lift`. All five are element families in this audit's scope | **P1** | **REPLACE** |
| F-11 | **156 of 200 store-writing verbs have no bridge case** (109 UNMIRRORED) — create-mirror-without-update-mirror at scale | **P1** | **WIRE** |
| F-12 | **`check-render-aggregate-seam.ts` is committed and registered in no runner** — a gate policing nothing | **P2** | **WIRE or REMOVE** |
| F-13 | **P6 does not scan `packages/`** — a direct store write from a package is invisible by design | **P2** | **WIRE** |
| F-14 | **409 `window as unknown as` casts across 151 files P4's regex cannot see** (carried, not re-measured) | **P2** | **REPLACE** |

---

## 9 — UNVERIFIED REGISTER

*This section is mandatory and an empty one is itself suspicious.*

| Item | Why unverified | Exact next command |
|---|---|---|
| ~~All 24 per-family rows~~ | **CLOSED** — 29 rows measured, §2 | *(complete; see `raw/synthesis.json`)* |
| `water` / `renders_plan` — **the one DISPUTED cell** | The row says NO; the adversarial pass calls it a CANDIDATE OVER-REPORT — the §FT-WATER bridge registers **both** spatial authorities (`initTools.ts:1982`/`:1984`) and `WaterMeshBuilder.ts:153` sets no `skipInPlan`. Over-reporting it would authorise a rival water plan-symbol builder | Resolve `_groupFamily` for a `'water'` group and read `makeSymbolInjectionGate`'s behaviour for an UNREGISTERED family: `grep -n 'makeSymbolInjectionGate' -A40 apps/editor/src/engine/views/EdgeProjectorService.ts` |
| `ceiling` + `curtain-wall` — reachable / 3D / plan | NOT MEASURABLE HEADLESSLY: probe P-1 printed `ceiling=undefined`, `curtainwall=undefined`. Chains complete on paper, no link measurably broken | A **browser-context** probe, not a headless one — `npx playwright test` dispatching through `window.runtime.bus` and reading the mesh out of the scene |
| `lift`/`liftPart` L0 schema | Confirmed absent (30 `defineElement` kinds, neither present); the shape is a hand-written `z.object` at **L2**. Whether moving it is safe is a C47 format question | `grep -rhoE "defineElement\('[a-zA-Z-]+'" packages/schemas/src | sort -u | wc -l` → must reach **32** |
| Whether CI is actually red on `main` | Gate readings measured locally; GitHub Actions run state not queried | `gh run list --workflow=ci.yml --branch=main --limit 5` |
| The 409 `window as unknown as` casts | Carried from `gate-debt.json` `$comment`; not re-measured this pass | `rg -c "window as unknown as" --glob '!node_modules' -g '*.ts'` |
| P7 behavioural coverage | Gate is PROXY-ONLY and prints its own NOT-CHECKED list (persistence, per-view scoping, AI intent path) | `ls packages/visibility/__tests__/` |
| `sync_portion_within_16ms` per handler | Requires a bench, not a static scan | *(no bench harness identified)* |
| Undo revert-geometry per family | Requires executed undo, not a registration check | *(Phase 3 will mark UNVERIFIED per family)* |
| Golden Chain / BIM 3.0 columns (§9 optional) | Not requested as in-scope for this run | *(omit rather than guess)* |

---

## 10 — EVIDENCE

```
audit/element-creation/2026-08-29/
  FINDINGS.md                     this document
  census.json                     8-source set comparison, 19 set differences
  families/                       29 Phase 3 rows (COMPLETE — 24 families + 5 edge cases)
  raw/
    gates-principles.json         P1–P8: exists / listed / RC / printed numbers / scope / headroom
    gates-pipeline.json           16 element-pipeline gates, same protocol
    gates-inventory.json          75-script reconciliation, 4 buckets
    xcut-p1-p4.json               per-file lists
    xcut-p5-p8.json               three-zone OTel, P7 two-arm
    xcut-layers-booleans.json     4 layer arms, package census, ADR-0367, 9 booleans
    synthesis.json                Phase 4: 29 verdicts, 7 counts, 27 ranked findings, 16 unverified
    verify-families.json          adversarial pass: 3 substantive + 5 citation refutations
    verify-phase0.json            adversarial pass over the gate readings
    doc-conflicts-orchestrator.json
    *.log                         31 raw gate logs with exit codes
  proposed-patches/               proposed, NOT applied (D9)
```

**No production code was changed.**
