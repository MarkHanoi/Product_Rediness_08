# ADR-0351 — 4D time and 6D carbon are BUILT; the data model is the work, and neither dimension invents a number

- **Status:** Accepted
- **Date:** 2026-08-21
- **Lane:** DIM46
- **Supersedes:** **[ADR-0350](ADR-0350-mediciones-is-the-floor-4d-5d-6d-stand-on.md) §4 only** —
  its "what is NOT built" section, and the two `NOT BUILT` panels it shipped. **Everything else in
  ADR-0350 stands unchanged**, including its central ruling that the take-off is the ONLY thing 4D,
  5D and 6D may read. This ADR does not soften that; it depends on it.
- **Amends in place:** `packages/schemas/src/materials/materialRecord.ts` (+`carbon?`),
  `materialCatalog.ts` (merge), `materials/index.ts`, `packages/schemas/package.json`
  (`./construction` subpath), `packages/core-app-model/src/quantities/TakeoffTypes.ts`
  (+`materialBreakdown`), `QuantityTakeoff.ts` (emit it), `quantities/index.ts`,
  `core-app-model/src/index.ts`, `apps/editor/src/ui/dataworkbench/DataWorkbench.ts`,
  `buckets/MedicionesBucket.ts` (the two NOT-BUILT panels DELETED),
  `__tests__/medicionesHonesty.spec.ts`.
- **Adds:** `packages/schemas/src/materials/materialCarbon.ts`, `carbonFactorTable.ts`,
  `packages/schemas/src/construction/**`, `packages/core-app-model/src/quantities/CarbonModel.ts`,
  `ScheduleModel.ts`, `carbonCsv.ts` + two suites,
  `apps/editor/src/ui/dataworkbench/buckets/MedicionesTimeCarbon.ts`,
  `packages/schemas/__tests__/{materialCarbon,constructionTask}.test.ts`.
- **Commits:** `33dfda79` (model + surfaces), `4e0ff9a8` (115 test cases).
- **Contracts:** **C66 §1.1** (a figure that has not been measured is a CLAIM — applied here to
  durations and to carbon factors), **C100 §1.1** (ONE material record shape; the carbon facts go
  ON the record, not in a rival table) and **C100 §5** (a miss is a miss, never a substitute),
  **C84 EI-11**, **C03** (read models; no mutation, no undo entry), **C86 §10.1 PR-1**
  (`openingOutline` is THE outline producer — inherited through the take-off), **P6**, **P7**, **P8**.
- **Issue-log:** L-3100 … L-3121.
- **⚠ Numbering:** `ls adrs/ | grep -cE '^ADR-035[1-9]'` → **0** at the moment of writing, and
  `uniq -d` still shows **eight** pre-existing duplicate ADR numbers. 0351 was taken with that
  check run immediately before the commit, not from memory.

---

## 1 · Context — the instruction, and what was actually missing

> He was told 4D and 6D are NOT BUILT. His reply: **"I NEED ALL OF THAT PRESENT."**

ADR-0350 §4 listed **six** missing inputs — four for 4D, two for 6D. Lane DIM46's first job was to
**verify them rather than inherit them.** Four were real. Two were not, and one of the two was
wrong in a way that mattered.

| ADR-0350 §4 claim | Verified 2026-08-21, lane DIM46 |
|---|---|
| 4D-1 "no phase/task entity of any kind in the schemas" | **TRUE for a construction SCHEDULE.** But `packages/core-app-model/src/views/PhaseFilterStore.ts` and `packages/visibility/src/waves/w07-phase-filter.ts` exist and are seeded at boot. See §2 — they model a *different concept* and are **not** a rival. |
| 4D-2 "a phase field on every element" | **TRUE**, and §3 explains why 4D was built **without** adding one. |
| 4D-3 "no output rates for durations" | **TRUE, and it stays true on purpose.** |
| 4D-4 "no time axis in the visibility system" | **FALSE as stated.** There is no *date* axis, but there is a live, compose-root-registered visibility-intent write path (`visibility.isolate.selection` → `runtime.visibility.applyToScene`) that a date filter can drive **without minting a new visibility axis**. §4. |
| 6D-1 "no carbon factor on the material record" | **TRUE.** Re-checked field by field: `color`, `metalness`, `roughness`, `opacity`, `transparent`, `textureUrl`, `maps`, `tiling`. No carbon, no density. |
| 6D-4 "layer-level quantities are a prerequisite" | **TRUE, and it was the cheapest of the six to close** — `WallSystemType.layers[]` already carries `{ thickness, materialId }` for every layer. §5. |

**The finding worth keeping:** two of six blockers dissolved on contact with the code, and one of
them (4D-4) had been stated as a missing *subsystem* when what was missing was a *caller*. This is
the [§bulk-vs-query-endpoint-false-refusals](../../../) shape — a refusal about the wrong product —
and it is why a lane must re-measure a predecessor's blocker list instead of quoting it.

---

## 2 · Decision — `PhaseFilter` is NOT the 4D model, and no second phase store was built

The founder's boot log shows `Phase Filter Store initialized (built-ins seeded)`. Before adding
anything, this lane established what it models.

`PhaseFilter` is the **Revit design-phase filter**: `Existing` / `Demolition` / `New Construction` /
`Future`, each with a per-view display status (`show` / `halftone` / `hide` /
`demolished-override`). It answers *"what does this VIEW draw, given the design's phase
classification?"* It is **categorical**, it carries **no dates and no durations**, and its four
phases are a design vocabulary, not a programme.

A construction schedule answers a different question: *"on what DATE is this element built?"*

**MUST:** the two coexist and neither is derived from the other. `ConstructionTask` does not write
`element.properties.phase`, and `PhaseFilterStore` is not read by the 4D engine.
**MUST NOT:** a future lane may not collapse them "because both are called phase". A design phase
survives into the drawing set; a programme date does not, and merging them would make a
demolition plan depend on a contractor's start date.

This distinction is written into `packages/schemas/src/construction/index.ts` itself, at the point
where the mistake would be made.

---

## 3 · Decision — a task points at TAKE-OFF LINE CODES, not at element ids

`TakeoffLine.code` is already documented as a **stable join key**: *"re-running the take-off after
an edit has to land on the same code so the rate the user typed survives."* 4D reuses exactly that
key.

A `ConstructionTask` carries `lineCodes: string[]`, and its element set is **resolved from the live
take-off every time it is needed** (`resolveTasks`). The consequences are the useful ones:

- draw three more walls of a scheduled type and **they are already scheduled**;
- delete one and it leaves the task, with no edit to the task;
- a line code the take-off no longer produces is **reported** (`unresolvedLineCodes`), not silently
  dropped — that means the model changed after the task was written, and a programme owner must see it.

**This is also why ADR-0350 §4's blocker 4D-2 ("a phase field on every element") did not have to be
closed to ship 4D.** Putting `taskId` on every element is a schema change binding C67 + C68 and a
file-format change; the line-code join gets a working, model-tracking assignment with neither, and
`elementIds[]` remains for genuine one-offs — **stated as the axis that does NOT survive a
delete-and-redraw.**

---

## 4 · Decision — the time filter drives the EXISTING visibility-intent path, and returns FOUR sets

ADR-0350 §4 called a date filter "a new visibility axis". It is not. `composeRuntime` registers
`visibility.isolate.selection` / `visibility.reveal.all` on the bus and exposes
`runtime.visibility.applyToScene` as the sanctioned projection. The 4D scrubber dispatches the
command and calls the projection; **the panel never assigns `node.visible`** (P7: the UI states
intent, the composition layer performs it).

⚠ **What that inherits, stated rather than discovered later:** those handlers declare no store
patch, so the time filter is **NOT undoable**, is per-view and session-only, and does not sync to a
collaborator. The panel offers an explicit *"Show everything again"* instead of implying Ctrl+Z.

### 4.1 — ⭐ The ruling this dimension exists to encode

`scheduleStateAt()` returns **four** element sets — `built`, `inProgress`, `notStarted`,
**`unscheduled`** — and the fourth is never folded into the third.

> **An element no task covers is not "not yet built". It is UNKNOWN.**

A scrubber that hides unscheduled elements is asserting a fact the programme does not contain. So
they stay **visible** by default, the panel reports how many there are, and hiding them is an
explicit opt-in whose caption says, in red, that the viewport is now showing a claim the programme
does not support. This is §CONTEXT-DATA-HONESTY — *failure and empty are the same value* — applied
to time.

**MUST NOT:** collapse `unscheduled` into `notStarted`. An implementation that does passes every
"does the filter hide things?" test and is wrong about the building.

---

## 5 · Decision — a wall's carbon is measured PER LAYER, by the take-off's own measurers

`TakeoffLine` gains `materialBreakdown: MaterialVolume[]` — m³ per named material — emitted by the
existing measurers. **No second measurement engine was written**, because two engines is how two
numbers start disagreeing.

For a wall, one row is emitted **per system-type layer**, each `netFaceArea × layerThickness`, using
**the same net area the m² line reports**. Therefore the `openingOutline()` deduction that removes
an arched window's true outline from the wall area removes it from the insulation and the blockwork
too. A round-arch 1.0 × 2.0 m void deducts 1.8907 m² of *every layer*, not 2.0000 m² of a bounding
box, and not nothing.

**MUST:** a layer with no `materialId` contributes **nothing** — not a share of its neighbour's
material, and not a zero row. An air cavity is measured as absent, and the 6D coverage says how much
volume that cost.

This closes ADR-0350 §4.2's blocker 6D-4, which that ADR called *"the take-off's largest gap"*.

---

## 6 · Decision — the 6D data model makes an uncited number UNTYPEABLE

> ⭐ *"A carbon number with no cited source is worse than no number: it will be quoted in a planning
> submission."*

`MaterialRecord` gains `carbon?: MaterialCarbonFacts` — **optional and additive**, exactly as
`maps`/`tiling` were, so every existing catalogue row stays valid unchanged.

### 6.1 — On the record, not beside it

The values are authored in `carbonFactorTable.ts` for legibility and **merged onto the catalogue
rows at module load**. A parallel `Record<materialId, factor>` living permanently beside the
catalogue would have been a **seventh material vocabulary** — the exact defect C100 §1.1 exists to
stop — and it would rot the first time a material was renamed. What a consumer reads is one record.

`carbonFactorOrphans()` + a test assert **zero** factor keys that do not exist in the catalogue: a
factor attached to a non-existent material applies to nothing, forever, and nothing on the 6D
surface would ever look wrong.

### 6.2 — It is impossible to express a value without its provenance

There is no `value: number` in this vocabulary that is not wrapped in a record carrying `source`,
`dataset`, `year`, `geography`, `provenance` **and `verification`**. That is the type system doing
work a review rule would otherwise have to do every week.

### 6.3 — ⭐ `verification` is a SEPARATE fact from `source`

**Cited** and **checked** are different facts, and collapsing them is how a plausible number
acquires authority it has not earned. Every factor PRYZM ships is
**`UNVERIFIED_TRANSCRIPTION`**: it names a real dataset and the row within it, and *nobody has
re-opened that dataset inside this repository and confirmed the figure.* The 6D panel says so in a
red banner **every time it shows a total**, and the CSV carries the state in its own column so it
survives being pasted into a spreadsheet.

**MUST NOT:** flip a row to `VERIFIED_AGAINST_SOURCE` without recording, in that row's own `source`
string, **who** checked it, **when**, and against **which table or page**. A verification that
cannot be re-checked is a stronger claim resting on nothing.

### 6.4 — Twenty factors ship, and roughly three hundred materials read NOT MEASURED

`SHIPPED_CARBON_FACTOR_COUNT` = **20** (cite the constant, never this number). ICE Database v3.0 for
the carbon factors and the timber/board densities; EN 1991-1-1 Annex A for the structural densities.

**The blanks are the correct output, not an omission to be tidied up later.** A 6D surface showing
three hundred plausible figures and one real one is indistinguishable from one showing three hundred
and one real ones, and an architect cannot tell which cell they just pasted into a submission. A
test asserts the table stays under a quarter of the catalogue, so *"complete the table"* fails a
test rather than passing a review.

Rows were deliberately **withheld** wherever the generic published figure does not describe the
PRYZM material: `concrete-white` (white cement), `concrete-precast` (works manufacture + transport),
the coated/toughened/tinted glass rows, every hardwood, all stone, all blockwork.

### 6.5 — ⭐ Two rows ship a factor and NO density, on purpose

`insulation-mineral-wool` and `insulation-eps` carry a published per-kg factor and **no density**,
because mineral wool ships anywhere from 23 to 150 kg/m³ and EPS from 15 to 35: **the density is a
specification decision, not a property of the material.** Choosing one would silently multiply every
insulation line by a number nobody chose.

So `carbonPerCubicMetre()` returns **`NO_DENSITY`**, the panel renders NOT MEASURED with the reason,
and the user closes it by entering the density of the product they actually specified. These two
rows are the honest shape of a half-known material, and they exercise the refusal branch **in
production** rather than only in a test.

---

## 7 · Consequences

- **The two red NOT BUILT badges are gone**, and `notBuiltPanel()` was **deleted rather than left
  unused** — a generic "not built" template sitting in the file is an invitation to ship another
  authored-but-empty surface.
- **All four MEDICIONES tabs now recompute on visit.** A stale programme or a stale carbon figure is
  worse than an absent one, because both are still signable.
- **The programme and the carbon overrides live in `localStorage`, per project**, exactly as the 5D
  rate book does, and **both panels say so on their own face**: not in the project file, not synced,
  not covered by undo. Moving them into the project file is a file-format change; putting `taskId`
  on an element is a schema change binding C67 + C68. **Both are named here as the next step rather
  than half-done** — a persistence claim the code cannot honour is the same defect class as an
  invented factor.
- **`isCarbonGap` / `isCarbonMeasured` are explicit type predicates**, not `if (!p.ok)`, because
  `core-app-model` compiles with `strictNullChecks: false` and will not narrow a boolean-literal
  discriminant under that setting. The honest-refusal shape has to survive the **loosest** compiler
  in this repo, not only the strictest.
- **`endOfDayMs()` is an exported L0 helper.** `taskProgressAt` answers about an *instant*: at
  midday of a task's finish day it is genuinely IN_PROGRESS, and at the end of that day it is
  COMPLETE. Both are correct answers to different questions, so the scrubber's question — *"built by
  the end of this day?"* — gets **one spelling**, instead of `+ MS_DAY - 1` at each call site.

---

## 8 · What is STILL NOT TRUE — read this before quoting either dimension

Stated as ADR-0350 §4 stated its own gaps, so nobody mistakes shipped for finished.

**4D:**
1. **No task assignment on the element.** A task's element set is derived, not stored on the model.
   An element cannot answer "what am I scheduled in?" from its own record.
2. **Not in the project file, not synced, not undoable** (above).
3. **`dependsOn` is RECORDED, NOT SOLVED.** No forward pass, no float, no critical path. Moving a
   predecessor moves nothing. A programme that silently re-plans is worse than one that plainly does
   not, and a half-implemented CPM is the same defect shape as a fabricated output rate.
4. **Calendar days only.** No working calendar, no weekends, no holidays, no jurisdiction to take
   them from.
5. **No output rates, and this is permanent until a licensed source exists.** `TaskDurationSource`
   has one member so a derived duration cannot be added without widening a union in a reviewed edit.
6. **In-progress work is drawn WHOLE.** PRYZM does not model partial construction; a half-built wall
   is different geometry, not a transparency.

**6D:**
1. **Every shipped factor is UNVERIFIED** (§6.3). This is the largest single caveat on the number.
2. **A1–A3 only.** Transport to site, construction, use, end of life and reuse (A4–A5, B, C, D) are
   not modelled, and the coverage statement says so on every render.
3. **Timber excludes biogenic sequestration** — a credit that depends on end-of-life fate cannot be
   claimed by a model with no end-of-life scenario. Reporting the credited figure would make timber
   look better than PRYZM can justify.
4. **Reinforcement, mortar, fixings and coatings are not measured**, so they are not counted. Each
   affected factor says so in its own `qualifier`.
5. **Only families whose measurers know a material contribute.** Walls (per layer), slabs, floors,
   ceilings, roofs, columns and beams carry `materialId`; doors, windows, stairs, furniture and
   plumbing are counted, not volumetric, and contribute nothing. The gap ledger and the
   "names no material" list report both, separately, because the fixes differ.
6. **No IFC / EPD import.** Factors arrive by hand, one material at a time.

**Unproven by anything in this ADR:** neither dimension has been exercised against a real project in
a browser by this lane. The DOM suite mounts the real panels over stubbed stores and reads the
rendered text, which is stronger than a unit test and weaker than a founder clicking the tab.

---

## 9 · Alternatives rejected

- **Ship 6D as "5D with a different multiplier."** ADR-0350 §4.3 rejected this and was right *at the
  time*: with no factor source, every line would refuse forever, and a capability that can only ever
  refuse is worse than a stated gap. **What changed is not the reasoning — it is that the factor
  source now exists**, cited, on the record, with twenty rows. The ~40-line version is still the
  wrong build; this one is ~1 100 lines because the *data model* was the work.
- **Seed a factor for every material.** Rejected as the failure the founder has been burned by all
  day. Twenty cited and ~309 honest blanks is the correct shape.
- **Extend `PhaseFilter` with dates.** Rejected: §2.
- **Add a 12th visibility wave for time.** Rejected: §4. The write path already existed; what was
  missing was a caller.
- **Store the programme on the element.** Rejected *for now*: §3. It is the right end state and it
  is a C67/C68 schema change, so it gets its own reviewed lane rather than a quiet field.
