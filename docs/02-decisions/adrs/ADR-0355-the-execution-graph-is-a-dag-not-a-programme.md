# ADR-0355 — The execution graph is a DAG, not a programme; "6D" is already Carbon; and the amendment ADR-0351 pointed at never existed

- **Status:** Accepted
- **Date:** 2026-08-22
- **Lane:** SEQ27
- **Supersedes:** nothing.
- **Amends:** **[ADR-0351](ADR-0351-4d-time-and-6d-carbon-are-built-and-neither-invents-a-number.md)
  §8 4D** — it ADDS a second view over the same data and **weakens none of its refusals**. This ADR
  is also the amendment that `ConstructionSequence.ts` and
  `packages/core-app-model/src/quantities/index.ts` were citing as *"ADR-0353 §3"*, which was never
  true — see §5.
- **Corrects in place:** `packages/core-app-model/src/quantities/ConstructionSequence.ts` (header
  ADR line), `packages/core-app-model/src/quantities/index.ts` (the 4D export block comment).
- **Adds:** `packages/core-app-model/src/quantities/SequenceGraph.ts` + `SequenceGraph.test.ts`,
  `apps/editor/src/ui/dataworkbench/buckets/SequenceGraphView.ts`,
  `apps/editor/src/ui/dataworkbench/__tests__/sequenceGraphView.spec.ts`; a `seqView` mode on
  `MedicionesTimeCarbon.ts`.
- **Contract:** [C37 §5.7](../contracts/C37-SCHEDULE-4D.md) (new).
- **Issue log:** L-6300 … L-6330.

---

## 1 · Context — the request, verbatim, and the two words in it that point at nothing

Founder, 2026-08-22:

> *"Could you create also a tab for **6d graph of execution**? like a **mind map** but for
> **activity execution in time**?"*

He attached a Mural mind map: a central node, curved colour-coded edges radiating to children.

**Two words in that sentence name things that do not exist, and they fail in opposite directions.**
Both had to be resolved rather than silently interpreted, which is why this ADR exists at all.

### 1.1 — "6D" is already Carbon

The MEDICIONES bucket's tab bar is defined at `apps/editor/src/ui/dataworkbench/DataWorkbench.ts`
`:234-237`:

| id | label |
|---|---|
| `mz-takeoff` | Take-off |
| `mz-cost` | 5D Cost |
| `mz-time` | 4D Time |
| `mz-carbon` | **6D Carbon** |

The content he describes — *"activity execution"* — is unambiguously the **4D** sequence data, not
carbon. **Two tabs labelled 6D would be a permanent, load-bearing misnaming** in the one product
whose entire discipline is naming things accurately, and it would be discovered later by a user
asking why the carbon tab has no carbon in it.

### 1.2 — "in time" is the one thing this data does not have

`deriveConstructionSequence` states its own contract, and the 4D tab prints it on every render:

> *"36 derived activities over 381 measured elements, plus one SUBSTRUCTURE activity that measures
> nothing. ⛔ **NO ACTIVITY HAS A DURATION AND NONE HAS A DATE.** The **ORDER** and the
> **DEPENDENCIES** are derived from the model and from ordinary constructability; a duration needs
> an output rate (m²/day) that PRYZM does not hold and will not invent. **Nothing here is a forward
> pass, a float or a critical path — with no durations there is nothing to pass forward.**"*

So exactly two things are real — the **ORDER** and the **DEPENDENCY EDGES** — and four are not:
durations, dates, float, critical path.

---

## 2 · Decision — a DEPENDENCY GRAPH, and the amendment ADR-0351 was missing

**The picture is a DAG of dependencies. It is not a Gantt, not a timeline, and not a partial CPM.**

A Gantt chart is a drawing whose *primary axis is the one quantity this model does not have*.
Drawing one would commit precisely the failure ADR-0351 §8 4D-3 already names — *"a
half-implemented CPM is the same defect shape as a fabricated output rate."*

A mind map, by contrast, encodes **adjacency and nothing else**. This is the pleasant part of the
finding: **the drawing the founder asked for is also the correct drawing for the data**, and it is
correct for a reason stronger than taste. It is not a softer version of a programme; it is the right
picture for a model that knows what follows what and does not know when.

⭐ **`ADR-0351 §8 4D-3 and 4D-5 are RESTATED HERE UNCHANGED and remain binding.** This ADR grants no
licence to compute a duration, a date, a float or a critical path, and `TaskDurationSource` is still
NOT widened.

---

## 3 · Decision — it is a VIEW MODE inside 4D Time, not a fifth tab

`4D Time` gains a two-button switch: **`List`** (the existing cards, unchanged, **still the
default**) and **`Execution graph`**.

### 3.1 — Why not a new tab

1. **It is the same read model.** One `deriveConstructionSequence` call feeds both views. Two tabs
   over one model is how two surfaces come to disagree — the failure shape this repo produces most
   often (three rival `commandManager` counters; five rival minima tables; two rival compound
   models, all in the last week).
2. **The coverage statement and the refusals stay attached to the data in ONE place.** A separate
   tab is a separate template, and a separate template is where a caveat quietly fails to get
   copied. §4 is entirely about this risk.
3. **It cannot be mistaken for a sixth dimension.** No new "6D".
4. **Smallest blast radius.** Four sibling lanes shared this tree; a view mode touches one file's
   render path, a tab touches `DataWorkbench.ts`'s tab union, panel map, and four mount sites.

### 3.2 — What was rejected

- ❌ **A second tab labelled `6D Graph`.** §1.1. Rejected on naming grounds alone.
- ❌ **A sibling tab named `Sequence`.** Viable, and the closest runner-up. Rejected because it
  splits one read model across two tabs for no gain — the graph is a *way of looking at* the
  sequence, and the sequence already has a home.
- ❌ **Replacing the list with the graph.** ⛔ He uses the list, and it is the only place an activity
  can be adopted as a task. `List` stays the default; a new view must never take away the one that
  works.

---

## 4 · Decision — the layout is RADIAL, and that is an honesty decision

⭐ **This is the most important paragraph in this ADR.**

The obvious rendering of a dependency DAG is **left-to-right layered**. ⛔ **It is the wrong one
here, and not by a little.**

A left-to-right graph of construction activities has an **unlabelled horizontal axis along which
work visibly progresses**. Every construction professional who has ever opened a programme reads
that axis as **TIME** — whatever the caption underneath says. This model has no time. So a
horizontal layout would introduce a fabricated quantity **through LAYOUT rather than through
arithmetic**: the same defect as a fabricated output rate, arriving through a door nobody was
watching, and passing every test that checks for numbers.

**A radial layout has no horizontal axis at all.** There is no left, no right, and no "further
along". Distance from the centre is **dependency DEPTH** — how many activities must finish first —
and the rings are labelled as exactly that, in words, on the panel.

**Consequences that follow from this, each enforced by a test:**

| Rule | Why | Test |
|---|---|---|
| Rings are labelled "dependency depth", never a date, week or phase | The label is what stops a reader importing a meaning the drawing does not carry | `the ring note names the rings DEPENDENCY DEPTH and denies they are time` |
| ⛔ **Node radius is CONSTANT** | Sizing by measured quantity is the natural graph idiom and is **banned**: `SUBSTRUCTURE` measures nothing *on purpose*, and a quantity-sized node would render the single most important honesty marker on the drawing as a dot of radius zero | `MEASURES NOTHING is drawn, labelled, and NOT shrunk to nothing` |
| `MEASURES NOTHING` is a dashed red ring | A channel that cannot collapse to zero | same |
| Unmeasured trades are **named**, never drawn | An empty node says *"this work takes no doing"*; an absence says *"PRYZM does not measure this"*, which is the true statement | `unmeasured trades are NAMED as an absence, never drawn as empty nodes` |
| The refusals are a **field on the read model** (`SequenceGraph.refusals`), not a template literal | A caveat that lives only in markup is one refactor away from deletion | `ALL FOUR REFUSALS ARE ON SCREEN, above the picture` |

⭐ **The edge carries its REASON.** The list view's *"follows N activities — why"* disclosure is the
best thing on the existing tab. On the graph it is promoted from a collapsed `<details>` to the
edge's own tooltip and to a click-to-read explanation strip, so the picture shows the **reasoning**
and not merely arrows.

---

## 5 · Correction — `ADR-0353 §3` was never an amendment to anything here

`ConstructionSequence.ts`'s header and the `quantities/index.ts` export block both read:

> *"ADR-0351 §4D, **AMENDED IN PLACE by ADR-0353 §3**."*

**Both halves are false, and they are false in different ways.**

- **ADR-0351 has no `§4D` heading.** Its sections are numbered 1–9; the 4D material is §8's rows
  tagged `4D-1`…`4D-6`. Measured: `grep -n '^## ' docs/02-decisions/adrs/ADR-0351-*.md`.
- **ADR-0353 is *"A reflected ceiling plan is PLAN-HANDED"*** (lane VIEWDOC20, 2026-08-22), and its
  §3 is about coordinate mapping and handedness. It says nothing about sequences, durations or
  output rates. Measured:
  `grep -ci 'sequence\|duration\|output rate\|constructab' docs/02-decisions/adrs/ADR-0353-*.md`
  → **1**, an incidental match.

**Two lanes minted `0353` on the same day, and the sequence lane's amendment never got a number at
all.** The refusals it described are real and are enforced by
`activitiesWithAFabricatedDuration()`; only the *pointer to where they were ratified* was wrong.
**This ADR is that missing amendment**, and both citations now point here.

⚠ This is the same defect class as the CLAUDE.md contract-range rot and L-809/L-812: **a document
citing an authority that does not say what the citation claims.** It is worth noting that the
citation was *plausible* — a same-day ADR number, correctly formatted — which is exactly why it
survived. **Cite by measurement, not by adjacency in time.**

---

## 6 · Decision — the renderer is REUSED, and the one part that could not be is NAMED

`apps/editor/src/ui/analysis/nodeLinkSvg.ts` is the repo's **ONE shared node-link renderer**
(L-3256) and was read in full before a line of this lane's view was written.

**REUSED, by direct import — nothing copied:**

- ✅ `SeriesFocus` + `markSeries` (`analysis/seriesFocus.ts`) — the founder's *"highlight this and
  the rest be a bit dormant"*. **One mechanism, one alpha constant.** Its CSS
  (`.anl-focus-on [data-series]`) is concatenated into the global sheet at `AppTheme.ts:225`, so it
  reaches the Data Workbench panel unchanged. ⛔ No second definition of "dormant" was written.
- ✅ `seriesColour()` (`analysis/AnalysisTypes.ts`) — the CVD-simulated eight-value scale.
  **No colour is minted by this lane.**
- ✅ Its conventions: keyboard-reachable nodes, `<title>` tooltips, no rAF.

**NOT REUSED — `renderNodeLink()` itself.** This is a measured verdict, not a preference. It cannot
draw this graph for **four independent reasons**:

1. It calls `forceLayout()` **unconditionally** at `:219`. There is **no seam to inject positions**,
   and a force layout would destroy the rank ordering that is the only real information this data
   has.
2. It draws `<line>` — **straight** edges. The founder's reference is curved.
3. Its edges are **undirected**. A dependency that does not say which way it points is not a
   dependency.
4. It has **no edge label**, and the edge *reason* is the single most valuable thing on this
   drawing.

⭐ **The collapsing seam is small and is named (L-6320).** If `renderNodeLink` grew an optional
`positions?: ReadonlyMap<string, {x,y}>` that short-circuits its `forceLayout` call, plus
`edgeShape?: 'line' | 'curve'` and `edgeLabel?: (e) => string`, then `SequenceGraphView.drawGraph()`
would become a call into it and ~120 lines would be deleted. **That change belongs to the owner of
`analysis/`** and is logged rather than made: this lane does not write into another lane's live
files.

⚠ **It was not agreed with that lane, and the attempt is recorded rather than implied.**
`SendMessage` to `GRAPH26` returned *"No agent named 'GRAPH26' is reachable"*, and no `ListAgents`
tool was available in this lane's toolset to find the real name. So the seam is **specified, not
negotiated**. ⛔ This ADR is not licence for a third renderer.

### 6.1 — The node cap does NOT transfer

`analysis/graphReadModel.ts:42` caps the Analysis relationship card because an **O(n²)** force
layout hairballs above a few dozen nodes. **This layout is a single-pass radial tidy tree — O(n)
after a sort — over ~37 nodes.** There is no cap here and none is inherited. Stated explicitly so a
later reader does not import a limit that never applied.

---

## 7 · The eight-colour floor against ten build stages

`BUILD_STAGES` has **ten** members. The categorical scale has **eight**, and `tokens.ts:465` is
explicit:

> ⛔ *"Do NOT extend this to `--app-cat-9`. Eight is where the floor stops clearing 10. A ninth
> series is a '+N others' bucket, not a colour."*

That is a **measured** CVD floor (global min ΔE00 **11.13**), not a taste rule, so a ninth and tenth
hue are not available to be minted.

**Resolution:** stages are coloured in build order from the eight; any stage beyond the eighth
*present* one takes the **named neutral**, and the legend **says so in words**. This is safe here
because `tokens.ts` also requires that colour is never the only channel — every node carries its
stage name as text, and every ring carries its depth. ⛔ **Do not "fix" this by adding `--app-cat-9`.**

---

## 8 · Consequences

- The 4D tab has two views over one read model; `List` is the default and is unchanged.
- `SequenceGraph.timeAxis` is `null` and `sequenceGraphTimeClaims()` is the gate that keeps it so —
  the sibling of `activitiesWithAFabricatedDuration()`. It checks **three independent** ways this
  drawing could become a programme: an axis appearing, an activity acquiring a duration, and **the
  refusals being stripped from the payload the view is handed**.
- **Pure SVG.** No canvas, no THREE (P2), no `requestAnimationFrame` (P3), no `(window as any)`
  (P4), no store writes (P6), no GPU path at all — so **nothing here degrades on the founder's
  `webgl-only` device**, because nothing here uses the GPU.

---

## 9 · What is STILL NOT TRUE — read this before quoting the graph

Stated as ADR-0351 §8 states its own gaps.

1. **The graph adds no new fact.** It is a second rendering of `deriveConstructionSequence`. Every
   caveat in ADR-0351 §8 4D-1…4D-6 applies to it verbatim.
2. **Angular position is not meaningful.** Only *radius* (depth) and *colour* (trade) encode
   anything. Two nodes being adjacent on a ring means nothing at all.
3. **The spanning tree is a layout device, not a claim.** A node with two predecessors is *placed*
   under one of them (its deepest, ties by lowest rank). **Every** dependency is still drawn, but
   the reader should not infer that the parent a node sits under is its "main" one.
4. **Not exercised against a real project in a browser by this lane.** The DOM suite mounts the real
   panel over a stubbed `wallStore` and reads rendered DOM — stronger than a unit test, weaker than
   the founder clicking the tab. The fixture yields **3 activities**; his model yields **37**, and
   label collision at 37 nodes on the outer rings **has not been observed by this lane**.
5. **The 8-colour overflow path has not been exercised**, because the fixture presents three stages.
   The branch exists and is unit-visible; it has not been seen on screen.

---

## 10 · Alternatives rejected

| Alternative | Why rejected |
|---|---|
| **A Gantt / timeline** | The axis would be the one quantity this model does not have. ADR-0351 §8 4D-3. |
| **Left-to-right layered DAG** | §4 — an unlabelled horizontal axis reads as time to every construction professional, whatever the caption says. |
| **Sizing nodes by quantity** | Would render `MEASURES NOTHING` as a zero-radius dot — deleting the drawing's most important honesty marker via a styling choice. |
| **Drawing unmeasured trades as zero-weight nodes** | Says *"this work takes no doing"* instead of *"PRYZM does not measure this"*. Opposite meanings. |
| **A second tab labelled 6D** | §1.1 — 6D is Carbon. |
| **Copying `nodeLinkSvg.ts` and editing it** | A fifth hand-rolled SVG graphic; the exact defect L-3256 exists to stop. §6 reuses three of its four parts and names the seam for the fourth. |
| **Adding `--app-cat-9` / `-10`** | §7 — breaks a measured colour-blind separation floor. |
