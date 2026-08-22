# ADR-0358 — A facet is a QUESTION, not a set of ids

- **Status:** Accepted
- **Date:** 2026-08-22
- **Lane:** ANLX31
- **Supersedes:** nothing. **Extends** ADR-0343 (§D.3 the widget contract, §D.6 the honesty rules).
- **Contracts:** C27 §4 (SelectionBus is the single authorised entry point for selection) ·
  C78 (universal relationships) · C09 (AI & visibility intent) · C84 (element integrity)
- **Issue log:** L-6600 · L-6601 · L-6602 · L-6603 · L-6604
- **Implements:** `apps/editor/src/ui/analysis/selectionFacets.ts`,
  `analysisReadModel.idsForFacet()`, `AnalysisSurface._renderFacetBar()`

---

## 1. Context — the founder's sentence, and the one word in it that decides the design

> *"In Analysis tab - i want to select for example: **Wall** - and have all the walls on the
> pryzm 3d scene highlighted. / if **walls for example and level 1 are selected** - then wall in
> level 1 should be highlighted / if we select ceilings in quantities tab > ceiling should
> highlight"*

The load-bearing word is **and**. "Walls" is picked on the category donut; "Level 1" is picked on
the elements-by-level bar. They are **two widgets reading two different axes**, and the join
between them has to live somewhere.

### 1.1 What was actually broken, measured before anything was written

Two separate defects, and they have different shapes. C01 §6 rule 6 — *"X has no writer" is a
MEASUREMENT* — so both were measured, not asserted:

**(a) The highlight was UNREACHABLE, not absent (L-6600).** Commit `596f7cb2` had already added
the entire paint half and every line of it is correct: the `'analysis'` lens in
`DiagnosticMaterialManager`, the light-grey ghost `0xd8dce3`, the PRYZM-purple selected set
`0x6600FF`, `setAnalysisSelection()`, and an `InspectModeCoordinator` subscription to
`'selection.changed'`. The subscription was to an event **nothing emits**:

```
grep -rn "emit('selection.changed'" --include=*.ts apps packages plugins
  -> 1 hit: packages/runtime-composer/src/composeRuntime.ts:317
     (inside buildSelectionStub().notify())

notify() runs ONLY from runtime.selection.{add,remove,clear,set}

grep -rnE "selection\.(set|add|remove|clear)\(" --include=*.ts apps packages plugins
  (minus tests / DrawingSelectionIndex)
  -> 1 hit: plugins/selection/src/handlers/ClearSelection.ts:29
     — and that is `ctx.stores.selection`, a plugin-SDK SelectionStore,
       a DIFFERENT object from the runtime's SelectionSlot.
```

**Zero production sites ever put an id into `runtime.selection`.** Every function on the path was
individually correct and the feature did nothing. This is
[[committed-is-not-reachable]] exactly, and it is why no unit test caught it.

**(b) The cross-filter was ABSENT.** `widgetRenderers.selectFigure()` dispatched
`{ type: 'select', elementIds: [...f.elementIds] }` — a **flat set of ids** — and
`SelectionBus.dispatch` replaces `currentIds` wholesale. A second click on a second widget could
only replace the first.

---

## 2. Decision

### 2.1 A facet holds `(axis, key)` — the QUESTION — and never the resolved ids

```ts
interface AnalysisFacet {
  readonly axis: AnalysisAxis;   // 'category' | 'level' | 'type' | 'chapter' | 'unit' | 'relationship'
  readonly key: string;          // the read model's namespaced figure key
  readonly label: string;
  readonly capturedIds: readonly string[];  // FALLBACK ONLY — see §2.4
}
```

**Why not a flat id set.** Click "Walls" → hold 312 ids. Now click "Level 1". The set has
forgotten that it ever meant *walls*; all it holds is 312 opaque strings. It can REPLACE them or
UNION them — it **cannot intersect with intent**, because "walls on level 1" is not derivable from
"these 312 ids" plus "these 208 ids" without re-asking what each list MEANT.

⭐ **Facets compose; flat sets do not.** That is the whole decision.

### 2.2 The three composition rules

| # | rule | why this and not the alternative |
|---|---|---|
| 1 | **Across axes: INTERSECTION.** `category:walls` ∩ `level:L1` | The founder's sentence read literally, and the only reading under which a second click NARROWS — which is what a filter is for. |
| 2 | **Within one axis: REPLACEMENT. One facet per axis.** | ⛔ **NOT** the faceted-search convention (union within a facet), and the reason is not taste. Every card already carries `SeriesFocus`, which lights **exactly one** key. If the model held `{walls, doors}` while the donut lit only `doors`, the picture and the selection would make different claims on the same card — and the chart, being what the reader is looking at, is the one they would believe. One facet per axis makes emphasis and selection **incapable** of disagreeing. ⛔ Intersecting *within* an axis was never a candidate: walls ∩ doors is always empty, so every second click would answer with an empty scene. |
| 3 | **Same key again clears that axis.** | There must always be a way BACK to the whole population, reachable by the same gesture that left — the rule `SeriesFocus.toggle` already states, applied to the model half. |

Rule 2 is expressed as a **data structure, not a check**: the store is `Map<AnalysisAxis, AnalysisFacet>`,
which *cannot* hold two facets on one axis.

**Rejected alternative — union within an axis.** It is a real feature and can be added later, but
only *together with* a chart emphasis that can light two slices. Shipping it before that would
ship rule 2's failure mode.

### 2.3 Ids are RE-RESOLVED on every refresh, never stored

`analysisReadModel.idsForFacet(axis, key)` recomputes from the live census (or the memoised
take-off) every time. A facet picked before a wall was drawn, a storey was added, or the project
was re-read stays **true** rather than decaying into a list of ids that no longer name anything.

A pinned id set would be a screenshot of a query. It would silently shrink as the model moved, and
the reader would see fewer purple walls with nothing on screen saying why. Cost is one pass over
the **memoised** census — not a rescan.

### 2.4 `null` means "not projectable" and is NOT an empty set

`idsForFacet` returns `ReadonlySet<string> | null`, the same three-state discipline
`GraphPlacement.levelOf` uses:

- **a set** (possibly empty) — a live answer. *"The wall store was read and there are no walls"* is
  true, and rendering it as stale would understate what the model knows.
- **`null`** — this module cannot recompute the axis. The caller falls back to `capturedIds`
  **and flags the facet `fresh: false`**, and the chip bar prints `(N, snapshot)`.

Collapsing the two would let *"the wall store was not published"* read as *"there are no walls"* —
[[context-data-honesty-family]] at the smallest possible scale.

**`relationship` is refused deliberately.** A relationship figure counts **edges**, not elements,
and its ids include synthetic nodes (`rule`, `circulation`) that name no element in any store.
Re-resolving it would require reading the UBG, which is maintained on its own cadence and is not
the census's to read (ADR-0343 §D.4). It resolves through the snapshot and says so.

### 2.5 The wire is `selectionBus`, and both sources feed ONE sink

`InspectModeCoordinator` now subscribes to `selectionBus` as well as to `'selection.changed'`.
These are **not rivals** — they are two *sources* feeding one *sink*, `_setAnalysisEmphasis`.
C27 §4 names SelectionBus *"the single authorised entry point for all selection sources"*, and
every surface the founder clicks already dispatches on it. `'selection.changed'` is the
runtime-canonical event and costs nothing while it is dead; when `runtime.selection` acquires
writers, `SelectionManager` already mirrors into `selectionBus` (§MULTI-SELECT-SHIFT, L-1550), so
the two stay in agreement. **One sink is what makes keeping both safe.**

Only `select` and `clear` repaint. `highlight` / `isolate` / `focus-camera` are decorations *over*
the current selection and `dispatch()` deliberately refuses to let them rewrite `currentIds` —
repainting on them would paint a set that did not move.

---

## 3. ⛔ A facet narrows the EMPHASIS. It never narrows a DENOMINATOR.

This is the honesty boundary and it is absolute.

When a facet is active, **every card on the surface keeps printing the whole model's figures.**
The donut still says 312 walls. The KPI still says the full element count. Only the 3-D emphasis
narrows.

**Why.** Re-running the queries under the facet would silently turn every total on the surface
into a *filtered* total while each card's own `basis` line still described the whole model — H1
(*"every figure names its basis"*) failed at the source layer, on every card at once. It is also
the distinction `graphReadModel` already draws and states in its own words:

> *"filtered to Level 1" is NOT the same statement as "truncated at 60 nodes" and they must never
> render identically.*

A **filter** is the reader choosing a smaller universe; a **cap** is the tool failing to show them
the model. This ADR adds a third thing that must not be confused with either: an **emphasis**,
which changes nothing about any number on screen.

Consequence, accepted deliberately: `AnalysisSurface` redraws **only the chip bar** on a facet
change. The widgets do not re-render.

---

## 4. An invisible filter is a bug generator

Because §3 means the cards do not change, a forgotten facet would leave a reader looking at
"312 walls" while 47 are purple in the viewport, with nothing accounting for the difference. So:

- a **chip bar** sits between the tab strip and the status strip — above the tab-scoped status
  line, because facets apply across every tab;
- one chip per axis, each carrying **the axis name** (`Family`, `Storey`, `Type`, `Chapter`,
  `Take-off line`, `Relation`) — a reader debugging an empty intersection needs to see that one
  chip is a family and the other a storey, because that is what tells them the two *compose*
  rather than *contradict*;
- each chip has a 24 px remove control (WCAG 2.2 AA 2.5.8), plus a **Clear all**;
- a sentence naming **every operand with its own count**:
  `Walls (312) ∩ Level 1 (208) -> 47 element(s) highlighted`.
  ⭐ An intersection the reader cannot decompose is one they cannot check.
- an **empty** intersection prints
  `... -> nothing satisfies all of these. That is an answer about the model, not a failed query.`
  A bare "0 selected" would read as a broken dashboard; this reads as *there are no walls on
  level 1*, which is a fact about the building.

The bar is `hidden` when no facet is active rather than rendering an empty "no filters" row — a
permanently visible strip teaches the reader to stop looking at that band, which is the habit this
bar exists to break.

---

## 5. Lifetime

| event | facets | why |
|---|---|---|
| model edit / `level-changed` / refresh | **survive, re-resolved** | §2.3 — the answer tracks the model. |
| tab switch | **survive** | Module state, shared like `graphReadModel._levelFilter`; two tabs under one filter bar must not show two universes. |
| leaving the Analysis workspace | **cleared** | The Analysis lens is the only thing that renders this emphasis; in Author/Inspect the purple is not painted at all. A filter still active but with **no visible effect anywhere** is §4's defect in its worst form. |
| page reload / new session | **not persisted** | Same rule as `_levelFilter`: a restored filter reopens the tab showing less than the model holds, with nothing on screen to explain it. |

---

## 6. Consequences

**Good.** The founder's three highlight asks are one mechanism, not three: family, family ∩ storey,
and a take-off chapter all go through `toggleFacet(axis, figure)`. The Quantities tab needed **no
new code** — its cards already carry `query.groupBy: 'chapter' | 'unit'`, so clicking "Ceilings"
files a `chapter` facet and it composes with a storey facet like anything else.

**Good.** Graphics are untouched with nothing selected: no material, no lens change, nothing
painted until a figure is clicked. WebGL-first — `MeshPhongMaterial` only, no WebGPU-only path.

**Accepted cost.** Cards show unfiltered figures while a filter is active (§3). This is the
correct trade and the chip bar is what makes it legible, but it *is* a thing a reader must learn.

**Accepted limit.** `relationship` facets are snapshots (§2.4). Making them live requires the UBG
to become a resolvable axis, which is a different decision.

**Open.** Union-within-an-axis (§2.2, rejected for now) needs a two-slice chart emphasis first.
