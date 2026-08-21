# ADR-0345 — Every dimension and property is ASKABLE and SETTABLE, or refused by name

- **Status:** Accepted
- **Date:** 2026-08-21
- **Lane:** RAC3 · Issue Log L-2200..L-2213
- **Contracts:** C67 (RAC capability control plane), C68 (element chat onboarding), C16 (command authoring), C84 (element integrity) + the C85–C99 per-element block, C74 (constraint honesty), C78 §1.4
- **Gate:** `tools/ga-gate/check-property-rac-matrix.ts` · ledger `tools/ga-gate/property-rac-matrix.json`
- **Sibling:** ADR-0344 (when a host moves, its dependents adapt or refuse — never fall silent). Same defect shape, one axis over, asked on the same day.

---

## 1 · The ask, verbatim

> "Please do a **deep review of ALL element properties against RAC**. **All dims and
> properties of all elements should be queryable and executable by RAC.** Do an
> **audit — document — plan — and fix**."
> — founder, 2026-08-21

Two verbs joined by "and". This ADR measures both, separately, because they turned out
to be in completely different states.

---

## 2 · What was measured, and what it found

### 2.1 EXECUTABLE was largely built. QUERYABLE was **not built at all**.

Four rungs of the chat ladder were walked. Each declines honestly, and none of them
answers:

| rung | what it does with "how tall is this wall?" | evidence |
|---|---|---|
| tier 0/1 grammar | no matcher claimed it | — |
| NL classifier | **MISS, by design** — *"Questions are for the LLM — never misread 'how high is this wall?' as a command to change it"* | `packages/ai-host/src/intents/LocalNaturalLanguageResolver.ts:1428` |
| LLM planner | can only emit `SemanticIntent`s drawn from `allChatCapabilities()`, **every one of them an EXECUTION** | `packages/ai-host/src/intents/LlmPlanner.ts` header |
| legacy `QueryEngine` | **SIX** read-only pattern blocks: command families, command help, model summary, decisions log, element COUNT, level LIST. **Not one reads a property off an element.** | `packages/ai-host/src/QueryEngine.ts:416, 429, 448, 475, 506, 526` |

And the one engine in the repository that *can* read the model — `SemanticQueryEngine`,
whose patterns are LIST / COUNT / RELATIONSHIP — **is imported by exactly one surface**,
`apps/editor/src/ui/dataworkbench/NLQueryPanel.ts:165`, the Data Workbench. The chat does
not import it. Its only numeric patterns are room-AREA thresholds, which *filter* rather
than report a value.

So the terminal answer to every property question in the product was
`"I'm not sure how to help with that yet."` — **not a refusal naming the gap. Silence.**
That is the C78 §1.4 / C74 defect class: *"there is no such property"* and *"nobody wired
it"* arrive as the same sentence.

### 2.2 The denominator was itself under-measured — on the two families the founder asks about most

`tools/ga-gate/check-chat-capability-coverage.ts` check 9 has counted "panel-editable
properties the chat cannot reach" since 2026-08-11. Its own header names limit (1):

> *"fields rendered by DEDICATED sections rather than the schema table — `WindowSection` /
> `DoorSection` own width/height/sillHeight/type/colour and the table says so in its own
> comments, so **window and door look far emptier here than they are**"*

Measured: the `SCHEMAS` table gives a **window seven rows, of which exactly one (`mark`)
is editable**, while `packages/geometry-window/src/WindowSection.ts` writes **twelve**
fields and `packages/geometry-door/src/DoorSection.ts` writes **seventeen**. ⭐ **33 of
this ADR's 112 cells were invisible to the pre-existing measurement**, and they are
concentrated in WINDOW and DOOR.

The denominator now lives in `tools/ga-gate/lib/panelPropertySurface.ts`, read by BOTH
gates, so the two cannot disagree about what "a property a user can see" means. Check 9
deliberately still calls **half A only**, so its reading does not move (verified: 49/42,
unchanged across the extraction) — widening that ratchet is its own decision, not a side
effect of extracting a function.

---

## 3 · The matrix — 112 cells, two verdicts each

**Measured 2026-08-21 by `check-property-rac-matrix`, which DERIVES every cell on every
run.** Nothing below is transcribed: the numerators are the real resolver's real answers
to real intents, and the denominator is parsed from the panel.

| | count |
|---|---|
| panel-visible (family × property) cells, 15 families | **112** |
| **BOTH** — askable and settable | **36** |
| **EXECUTE-ONLY** — settable, not askable | **1** |
| **QUERY-ONLY** — askable, not settable | **0** (structurally impossible, hard-0) |
| **SILENT** — neither, and nothing says so | **75** |

### 3.1 Per family

| family | cells | BOTH | EXECUTE-ONLY | SILENT |
|---|---|---|---|---|
| beam | 4 | 2 | 0 | 2 |
| column | 6 | 4 | 0 | 2 |
| curtain-mullion | 0 | 0 | 0 | 0 |
| curtain-panel | 2 | 0 | 0 | 2 |
| curtain-wall | 7 | 4 | 0 | 3 |
| **door** | **17** | **3** | 0 | **14** |
| furniture | 7 | 4 | 0 | 3 |
| handrail | 14 | 4 | 0 | 10 |
| **lighting** | **0** | 0 | 0 | 0 |
| roof | 6 | 4 | 0 | 2 |
| slab | 4 | 2 | 0 | 2 |
| stair | 14 | 3 | 0 | 11 |
| **stair-railing** | 6 | **0** | 0 | **6** |
| wall | 7 | 3 | 1 | 3 |
| **window** | **18** | **3** | 0 | **15** |

Two rows deserve a second look:

- **`lighting` shows ZERO cells and that is CORRECT, not a parse failure.** The lighting
  panel has no editable rows at all, by design — `PropertyDescriptorGenerator.ts:461-462`
  states the reason: there is no `lighting` case in `UpdateElementParameterCommand`'s
  store switch, so even `mark` is withheld rather than offered as a dead control. A
  family with nothing to edit is honest; a family with controls nobody wired is not.
- **`stair-railing` is 0 of 6.** Not one of its six editable properties is reachable
  either way, although `set-stair-railing-type` exists for its TYPE.

### 3.2 The full cell list

Verdicts are **WIRED (with the capability that reaches it)** or **SILENT**. There are no
REFUSES cells: **nothing in this product refuses a property ask by name today**, which is
finding L-2202.

<!-- BEGIN MATRIX (generated from the gate's own run — do not hand-edit) -->
| family | property | QUERY | EXECUTE |
|---|---|---|---|
| beam | `depth` | ✅ depth | ✅ set-depth |
| beam | `mark` | ⛔ SILENT | ⛔ SILENT |
| beam | `materialColor` | ⛔ SILENT | ⛔ SILENT |
| beam | `width` | ✅ width | ✅ set-width |
| column | `baseOffset` | ✅ base-offset | ✅ set-base-offset |
| column | `depth` | ✅ depth | ✅ set-depth |
| column | `height` | ✅ height | ✅ set-height |
| column | `mark` | ⛔ SILENT | ⛔ SILENT |
| column | `materialColor` | ⛔ SILENT | ⛔ SILENT |
| column | `width` | ✅ width | ✅ set-width |
| curtain-panel | `materialOverride` | ⛔ SILENT | ⛔ SILENT |
| curtain-panel | `panelType` | ⛔ SILENT | ⛔ SILENT |
| curtain-wall | `baseOffset` | ✅ base-offset | ✅ set-base-offset |
| curtain-wall | `gridXSpacing` | ⛔ SILENT | ⛔ SILENT |
| curtain-wall | `gridYSpacing` | ⛔ SILENT | ⛔ SILENT |
| curtain-wall | `height` | ✅ height | ✅ set-height |
| curtain-wall | `mark` | ⛔ SILENT | ⛔ SILENT |
| curtain-wall | `mullionSize` | ✅ mullion-size | ✅ set-mullion-size |
| curtain-wall | `panelThickness` | ✅ panel-thickness | ✅ set-panel-thickness |
| door | `accessibilityType` | ⛔ SILENT | ⛔ SILENT |
| door | `doorType` | ⛔ SILENT | ⛔ SILENT |
| door | `fireRating` | ⛔ SILENT | ⛔ SILENT |
| door | `frameColor` | ⛔ SILENT | ⛔ SILENT |
| door | `frameDepth` | ⛔ SILENT | ⛔ SILENT |
| door | `frameThickness` | ⛔ SILENT | ⛔ SILENT |
| door | `handleHeight` | ⛔ SILENT | ⛔ SILENT |
| door | `height` | ✅ height | ✅ set-height |
| door | `hingesSide` | ⛔ SILENT | ⛔ SILENT |
| door | `leafColor` | ⛔ SILENT | ⛔ SILENT |
| door | `leafThickness` | ⛔ SILENT | ⛔ SILENT |
| door | `leafVisibleInPlan` | ⛔ SILENT | ⛔ SILENT |
| door | `mark` | ⛔ SILENT | ⛔ SILENT |
| door | `openingProfile` | ⛔ SILENT | ⛔ SILENT |
| door | `sillHeight` | ✅ sill-height | ✅ set-sill-height |
| door | `swingDirection` | ⛔ SILENT | ⛔ SILENT |
| door | `width` | ✅ width | ✅ set-width |
| furniture | `baseOffset` | ✅ base-offset | ✅ set-base-offset |
| furniture | `color` | ⛔ SILENT | ⛔ SILENT |
| furniture | `height` | ✅ height | ✅ set-height |
| furniture | `length` | ✅ length | ✅ set-length |
| furniture | `mark` | ⛔ SILENT | ⛔ SILENT |
| furniture | `material` | ⛔ SILENT | ⛔ SILENT |
| furniture | `width` | ✅ width | ✅ set-width |
| handrail | `balusterShape` | ⛔ SILENT | ⛔ SILENT |
| handrail | `balusterSpacing` | ✅ baluster-spacing | ✅ set-baluster-spacing |
| handrail | `balusterWidth` | ✅ baluster-width | ✅ set-baluster-width |
| handrail | `baseOffset` | ✅ base-offset | ✅ set-base-offset |
| handrail | `fillType` | ⛔ SILENT | ⛔ SILENT |
| handrail | `height` | ✅ height | ✅ set-height |
| handrail | `infillMaxGap` | ⛔ SILENT | ⛔ SILENT |
| handrail | `mark` | ⛔ SILENT | ⛔ SILENT |
| handrail | `materialColor` | ⛔ SILENT | ⛔ SILENT |
| handrail | `postEndCondition` | ⛔ SILENT | ⛔ SILENT |
| handrail | `postSpacing` | ⛔ SILENT | ⛔ SILENT |
| handrail | `railDiameter` | ⛔ SILENT | ⛔ SILENT |
| handrail | `railProfile` | ⛔ SILENT | ⛔ SILENT |
| handrail | `thickness` | ⛔ SILENT | ⛔ SILENT |
| roof | `baseOffset` | ✅ base-offset | ✅ set-base-offset |
| roof | `mark` | ⛔ SILENT | ⛔ SILENT |
| roof | `materialColor` | ⛔ SILENT | ⛔ SILENT |
| roof | `overhang` | ✅ overhang | ✅ set-overhang |
| roof | `slope` | ✅ roof-pitch | ✅ set-roof-pitch |
| roof | `thickness` | ✅ thickness | ✅ set-thickness |
| slab | `baseOffset` | ✅ base-offset | ✅ set-base-offset |
| slab | `mark` | ⛔ SILENT | ⛔ SILENT |
| slab | `materialColor` | ⛔ SILENT | ⛔ SILENT |
| slab | `thickness` | ✅ thickness | ✅ set-thickness |
| stair | `accessibilityType` | ⛔ SILENT | ⛔ SILENT |
| stair | `fireRating` | ⛔ SILENT | ⛔ SILENT |
| stair | `mark` | ⛔ SILENT | ⛔ SILENT |
| stair | `properties.handrailHeight` | ⛔ SILENT | ⛔ SILENT |
| stair | `properties.material` | ⛔ SILENT | ⛔ SILENT |
| stair | `properties.nosingDepth` | ⛔ SILENT | ⛔ SILENT |
| stair | `properties.nosingType` | ⛔ SILENT | ⛔ SILENT |
| stair | `properties.railingType` | ⛔ SILENT | ⛔ SILENT |
| stair | `properties.riserVisible` | ⛔ SILENT | ⛔ SILENT |
| stair | `properties.stringerThickness` | ⛔ SILENT | ⛔ SILENT |
| stair | `properties.stringerType` | ⛔ SILENT | ⛔ SILENT |
| stair | `riserHeight` | ✅ riser-height | ✅ set-riser-height |
| stair | `treadDepth` | ✅ tread-depth | ✅ set-tread-depth |
| stair | `width` | ✅ width | ✅ set-width |
| stair-railing | `balusterShape` | ⛔ SILENT | ⛔ SILENT |
| stair-railing | `balusterSpacing` | ⛔ SILENT | ⛔ SILENT |
| stair-railing | `balusterWidth` | ⛔ SILENT | ⛔ SILENT |
| stair-railing | `handrailHeight` | ⛔ SILENT | ⛔ SILENT |
| stair-railing | `material` | ⛔ SILENT | ⛔ SILENT |
| stair-railing | `topRailHeight` | ⛔ SILENT | ⛔ SILENT |
| wall | `baseOffset` | ✅ base-offset | ✅ set-base-offset |
| wall | `fireRating` | ⛔ SILENT | ⛔ SILENT |
| wall | `height` | ✅ height | ✅ set-wall-dimensions |
| wall | `loadBearing` | ⛔ SILENT | ⛔ SILENT |
| wall | `mark` | ⛔ SILENT | ⛔ SILENT |
| wall | `materialColor` | ⛔ SILENT | ✅ set-wall-color |
| wall | `rakeAngleDeg` | ✅ rake-angle | ✅ set-wall-rake |
| window | `columnRatios` | ⛔ SILENT | ⛔ SILENT |
| window | `finishMaterial` | ⛔ SILENT | ⛔ SILENT |
| window | `fireRating` | ⛔ SILENT | ⛔ SILENT |
| window | `frameColor` | ⛔ SILENT | ⛔ SILENT |
| window | `glassOpacity` | ⛔ SILENT | ⛔ SILENT |
| window | `height` | ✅ height | ✅ set-height |
| window | `mark` | ⛔ SILENT | ⛔ SILENT |
| window | `openingProfile` | ⛔ SILENT | ⛔ SILENT |
| window | `revealProjection` | ⛔ SILENT | ⛔ SILENT |
| window | `revealSplayHead` | ⛔ SILENT | ⛔ SILENT |
| window | `revealSplayJambLeft` | ⛔ SILENT | ⛔ SILENT |
| window | `revealSplayJambRight` | ⛔ SILENT | ⛔ SILENT |
| window | `revealSplaySill` | ⛔ SILENT | ⛔ SILENT |
| window | `rowRatios` | ⛔ SILENT | ⛔ SILENT |
| window | `sill` | ⛔ SILENT | ⛔ SILENT |
| window | `sillHeight` | ✅ sill-height | ✅ set-sill-height |
| window | `width` | ✅ width | ✅ set-width |
| window | `windowType` | ⛔ SILENT | ⛔ SILENT |
<!-- END MATRIX -->

---

## 4 · The findings, ranked

**L-2200 · The QUERY axis did not exist.** 0 of 112 cells were askable. Four rungs, four
honest declines, no answer. Closed for 36 cells by §FEAT-RAC-PROPERTY-QUERY (below).

**L-2201 · `mark` is the single most common silent property — eleven families.** Every
family's panel carries an editable Mark / Name row and **nothing in chat sets or reports
it**. A user can rename a ROOM by sentence (`rename-room`) and cannot mark a WALL.

**L-2202 · There is no property-granular refusal anywhere.** `CHAT_UNAVAILABLE` holds 52
rows and every one of them is keyed by a BUS COMMAND (`wall.move`, `floor.setMaterial`).
A family can refuse "move" by name while **every one of its dimensions stays silent** —
two different denominators, and only the coarser one has honest copy.

**L-2203 · The founder's two most-asked families are the two worst.** window 15/18 SILENT,
door 14/17 SILENT — and both were invisible to the pre-existing measurement (§2.2).

**L-2204 · Two record worlds, and the chat can pick the wrong one.** `packages/schemas/src/elements/*.ts`
(L0 Zod, re-exported as the plugin DTO) and the geometry / `core-app-model` record are
**different shapes**, and the second is what the fragment builders, the IFC exporter and
persistence read. Six families were checked: door models swing as ONE field in L0 and TWO
at runtime (`hingesSide` + `swingDirection`); slab is polygon-only in L0 and box-plus-polygon
at runtime; room is flat in L0 and nested at runtime; beam uses `baseLine` in L0 and
`startPoint`/`endPoint` at runtime. `Floor.ts:46-50` says outright that **nothing parses a
`FloorData` with its own schema today.**
⭐ **This bit this very lane**, which is why it is recorded rather than merely noted — see §6.

**L-2205 · `wall.materialColor` is EXECUTE-ONLY and it is honest, not an oversight.** The
chat can paint a wall (`set-wall-color`) and cannot report the colour, because
`PropertyReader`'s contract is NUMERIC. A colour is a hex string; reporting it needs a
second reader shape, which is a decision and not a patch.

**L-2206 · Five panel surfaces are outside the denominator entirely** and can rot silently.
Named in the ledger's `unmeasuredPanels` so the shortfall is countable (C10): the hand-built
ROOM cards (including a read-only Metrics card of **six measurements — gross area, net area,
perimeter, volume, height, vertices — that a user can see and cannot ask for**), the curtain
sub-element panels, the wall/slab LAYER editors, the curtain grid/panel editors, and the
Spatial `PlacementEditor` — where **wall LENGTH is editable and belongs to no family table
at all**.

**L-2207 · Five production `.ts` files contain literal NUL bytes and are classified BINARY
by `grep`.** Found while sweeping: `packages/building-graph/src/BuildingGraph.ts` (4 bytes),
`apps/editor/src/ui/canvas/ConsequenceReportView.ts` (2),
`apps/editor/src/ui/apartment-layout/activeRoomAdjacencyOverrides.ts` (2),
`packages/core-app-model/src/presentation/IntentRuleResolver.ts` (1),
`packages/site-parcel-data/src/rulepacks/esMadridSpacmAmbitoJoin.ts` (1). This is L-2094's
hazard, unfixed and wider than one file: **any audit sweep that pipes through `grep`
silently loses them.** Not this lane's files; recorded for whoever owns them.

---

## 5 · The decision

> **A dimension or property a user can SEE in the Properties panel must be ASKABLE and
> SETTABLE from chat — or REFUSED BY NAME, with the reason and the real route. Silence is
> not a third state the product may occupy.**

And the mechanism that makes the first half cheap:

> ⭐ **A property that is EXECUTABLE is QUERYABLE, BY CONSTRUCTION.**

Every row of `PROPERTY_QUERY_ROWS` names the EXECUTE capability it mirrors and reads its
element kinds **off that capability at call time** (`queryableKinds`), never re-typed.
There is no state in which the chat can SET a property and not REPORT it. This is
deliberately the inverse of how `packages/input-host/src/operations/ElementCapabilities.ts`
failed — it advertises Mirror / Offset / Scale on seven families whose commands are
wall-only, because the claim and the code were two tables that had to agree and nothing
made them.

---

## 6 · What shipped (the FIX half)

**§FEAT-RAC-PROPERTY-QUERY (L-2210)** — `packages/ai-host/src/intents/PropertyQuery.ts`,
17 rows, wired through:

- a grammar GENERATED from the table (`how tall is …`, `what is the sill height of …`,
  `tell me the width of …`, `the thickness of this wall`), which **cannot claim a sentence
  carrying a measurement** — so it can never nibble at a mutation;
- membership routing before `applySemanticIntent`'s switch — **zero new case arms** (that
  ratchet is already over baseline at 29/27 and is unmoved by this change);
- `localAction: 'answer'`, the read-only class `visibility-query` established — the bridge's
  entire handling of it is `case 'answer': break;`
- an INJECTED reader (`apps/editor/src/ui/ai/chatPropertyReader.ts`) resolving through
  `storeRegistry` — the ADR-0318 authoritative slot `composeRuntime.ts:1554-1558` registers
  the geometry singletons into — **never the plugin DTO twin**, whose cost
  `initBusHandlers.ts:1160-1168` records.

**THREE ABSENCES, THREE SENTENCES** (§CONTEXT-DATA-HONESTY). No reader injected / no such
element / **no such field on the record**. The third is the most valuable answer in the
feature: a field the WRITE claims to set and the READ cannot find is evidence the write is
landing where nothing reads, and the product says so instead of inventing a `0`.

### ⭐ The gate caught two defects in the feature it shipped with

This is the strongest available evidence that it is not decorative:

1. **`roof-pitch` read the wrong field.** The first draft read `pitch` in RADIANS, reasoning
   from `packages/schemas/src/elements/Roof.ts:73` — the L0 Zod schema, which is **not the
   record the write lands in**. `set-roof-pitch` dispatches `roof.update` → `UpdateRoofCommand`
   → the geometry `RoofData` (`packages/geometry-roof/src/RoofTypes.ts:83`), which carries
   **`slope`, a GRADIENT**, written with `Math.tan`. The draft would have answered *"the stored
   record carries no pitch to read back"* for every roof in the product. The gate reported
   `roof.slope` as **EXECUTE-ONLY** — exactly what a read pointed at the wrong field looks
   like from outside. Now `slope`, spoken through `atan`, the exact mirror of the write.
   **This is L-2204 biting the lane that logged it.**
2. **`wall.rakeAngleDeg` was EXECUTE-ONLY.** The founder can say *"make all walls angled by
   70"* and could not ask what the angle IS. A row was added; degrees on the record, read
   back verbatim — and the drift assertion in `propertyQuery.test.ts` is what forced the
   second angle unit to be declared rather than assumed.

---

## 7 · The PLAN — what remains, in cost order

**Step 1 — `mark`, eleven families, ONE row (L-2201).** The widest single win in the matrix.
`mark` is on every family's panel and reaches nothing. It needs a bus verb or a
`PropertyVocabulary` row proving the field is read by something; then its query twin is free.
**Expected value: 11 of 75 SILENT cells, ~ one table row plus its liveness proof.**

**Step 2 — the property-granular refusal surface (L-2202).** Turn the remaining SILENT cells
into honest refusals naming the real route, per C67. ⛔ **Deliberately NOT half-built in this
lane**, and the reason is a rule this repository has already paid for: a refusal table that no
GRAMMAR CLAIMS is *authored-but-unwired* — the user still gets the miss string while the table
reads as coverage. It needs the grammar and the table in the same commit, and the grammar must
be generated from the panel denominator (an L7 file a pure L2 module cannot import), so it
needs a codegen step or a hand-authored table gated against the panel. **That is a real design
decision, not a patch.** Expected value: up to 75 cells move SILENT → REFUSES.

**Step 3 — the window / door dimensional cluster (L-2203).** `revealProjection`, the four
`revealSplay*`, `frameThickness`, `frameDepth`, `leafThickness`, `handleHeight` are all
metric and all route through the generic `element.updateParameters` carrier — one
`PropertyVocabulary` row each, zero resolver code, **but each needs both halves of that
table's honesty bar proven** (the field exists AND the builder reads it AND the write
rebuilds). ⚠ `WallStore.updateWindow` merges the whole partial onto the window record, but
the HOST WALL's opening carries only `width`/`height`/`sillHeight`/`offset`
(`WallStore.ts:1543-1548`) — **the L-1923 trap. A generic `updateParameters` path is NOT
evidence a property is executable.** Expected value: ~10 cells, at real per-field cost.

**Step 4 — the five unmeasured panels (L-2206).** Extend the shared denominator. The ROOM
metrics card alone is six measurements a user can see and cannot ask for.

**Step 5 — the non-numeric reader (L-2205).** A second `PropertyReadOutcome` shape for
strings/enums unlocks colour, type and finish reporting across every family.

---

## 8 · What this ADR and its gate CANNOT tell you

1. **Whether a BOTH cell is CORRECT.** The gate proves the sentence REACHES a command or an
   answer, never that the number landing is right. Write liveness is `PropertyVocabulary`'s
   honesty bar and coverage checks 3b/3d; read correctness is `propertyQuery.test.ts`.
2. **Anything about record fields no panel row exposes.** A different subject with a different
   denominator (§L-2204).
3. **Whether a SILENT cell SHOULD be wired.** The matrix records what the product does.
   Whether chat ought to set a door's handle height is a design question this does not answer.
4. **The behaviour under undo, collaboration merge, or save/reload.**
