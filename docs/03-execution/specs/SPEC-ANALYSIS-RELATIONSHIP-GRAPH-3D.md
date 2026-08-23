# SPEC — The Analysis relationship graph: hierarchy views, the 3-D viewport, and bidirectional selection

**Lane:** GRAPH48 · **Date of every measurement below: 2026-08-23** · **Issue log:** L-8400 … L-8480
**Governing contracts:** C71 (graph & topology vocabulary) · C78 (universal relationship & consequence)
**ADR:** ADR-0364 (one graph, six projections) · builds on ADR-0343, ADR-0358, ADR-0058, ADR-0320
**Files:** `apps/editor/src/ui/analysis/**` · `packages/building-graph/**`

---

## §0 — The request, and the honest scope of the answer

> *"Improve 200 % the graph section under Analytics. Same as [BIMUniXchange IFC Network Analyzer].
> Spatial-based 3-D graph where the user can navigate and select an element — and it should
> highlight in PRYZM 3-D. Element-based · System-based · Room-based · Topology-based relationships.
> The user can also select an element in the PRYZM view and the graph will display all element
> topology relationships."*

**⭐ PHASE 1 WAS AN AUDIT, AND THE AUDIT CHANGED THE PLAN.** A great deal of this shipped in the
last two days. What follows is the measured REUSE / EXTEND / MISSING table, one command per row.
Nothing in it is transcribed from another document.

---

## §1 — The audit table

**⚠ Read the command, not the verdict.** Every row was established by running the command in the
last column at HEAD on 2026-08-23. `grep` here means BOTH the `Grep` tool (ripgrep) and Git Bash
`grep -rn`, run separately, because ripgrep has missed files in this repo twice this week
(§GREP-SILENCE). Where the two disagreed the disagreement is recorded; they did not.

| # | Capability the founder asked for | Verdict | What is actually there | Command that settles it |
|---|---|---|---|---|
| 1 | A graph read model over the UBG | **REUSE** | `graphReadModel.ts`, 655 lines. Projects nodes/edges, a coverage row per edge family, a level scope, a truncation flag and a liveness sentence. | `wc -l apps/editor/src/ui/analysis/graphReadModel.ts` → **655** |
| 2 | ONE shared node-link renderer | **REUSE** | `nodeLinkSvg.ts`, 517 lines: `forceLayout`, `renderNodeLink`, `renderEdgeLegend`, `FOCUS_NODE`/`FOCUS_EDGE`. | `grep -n "^export " apps/editor/src/ui/analysis/nodeLinkSvg.ts` → 6 exports |
| 3 | A layout that survives a real model | **REUSE** | Barnes-Hut quadtree above 60 nodes, exact O(n²) below it so every graph that drew before draws byte-identically. `THETA = 0.9`, `EXACT_BELOW = 60`. | `grep -n "THETA\|EXACT_BELOW" apps/editor/src/ui/analysis/nodeLinkSvg.ts` |
| 4 | A node cap that is measured, not guessed | **REUSE** | `GRAPH_NODE_CAP = 320`, chosen against a 100 ms one-shot budget; 480 measured at 103.8 ms and rejected. | `grep -n "GRAPH_NODE_CAP" apps/editor/src/ui/analysis/graphReadModel.ts` → `:82` |
| 5 | Graph node → highlight in PRYZM 3-D | **REUSE — IT ALREADY WORKS** | Node click → `selectionBus.dispatch({type:'select', source:'analytics'})` → `InspectModeCoordinator._setAnalysisEmphasis` → `DiagnosticMaterialManager.setAnalysisSelection`. | `grep -n "onPick" apps/editor/src/ui/analysis/widgetRenderers.ts` → `:915`; `grep -n "setAnalysisSelection" apps/editor/src/engine/inspect/DiagnosticMaterialManager.ts` → `:1521` |
| 6 | PRYZM 3-D selection → graph shows topology | **⛔ MISSING** | The graph widget is `refresh: 'manual'`, and `_renderSelectionWidgets()` re-renders **only** widgets whose `refresh === 'on-selection'`. Nothing re-renders the graph on a selection, and nothing narrows it to the picked element. | `grep -n "refresh:" apps/editor/src/ui/analysis/widgetCatalogue.ts` → `relationship-graph` at `:175` is `'manual'`; `grep -n "_renderSelectionWidgets" -A 12 apps/editor/src/ui/analysis/AnalysisSurface.ts` → `:496` `if (... def.refresh !== 'on-selection') continue;` |
| 7 | Cross-filter by category and by type | **REUSE** | `selectionFacets.ts` — a facet is a QUESTION (`{axis,key}`), never a set of ids; across axes intersects, within an axis replaces, same key clears. ADR-0358. | `grep -n "^export function" apps/editor/src/ui/analysis/selectionFacets.ts` → 7 |
| 8 | Highlight-and-dim inside the picture | **REUSE** | `seriesFocus.ts` — alpha only, hue never changed, nothing removed. | `grep -n "DORMANT_ALPHA" apps/editor/src/ui/analysis/seriesFocus.ts` → `:73` |
| 9 | The Unified Building Graph itself | **REUSE** | `packages/building-graph/` — `BuildingGraph.ts` (423), `types.ts` (157), 6 adapters, `rationale.ts`, `tracing.ts`. | `wc -l packages/building-graph/src/*.ts packages/building-graph/src/adapters/*.ts` → **1332** total |
| 10 | The ten edge families | **REUSE** | `UBG_EDGE_TYPES` is a closed 10-member tuple. | `grep -n "UBG_EDGE_TYPES" -A 12 packages/building-graph/src/types.ts` → `:34` |
| 11 | Per-family reality verdicts | **REUSE** | `EDGE_FAMILIES` in `graphReadModel.ts` carries a state + a note naming the command that settles it, per family. | `grep -n "EDGE_FAMILIES" apps/editor/src/ui/analysis/graphReadModel.ts` → `:182` |
| 12 | Element / Spatial / System / Room / Topology / Mixed views | **⛔ MISSING** | There is exactly ONE view. `projectGraph()` returns every node and every edge; the only selector is the level scope. No view enum, no per-view edge subset, no per-view empty state. | `grep -rn "hierarchy\|ElementBased\|SystemBased\|Mixed View" apps/editor/src/ui/analysis packages/building-graph/src` → **0 hits** |
| 13 | Discipline categories with counts (Structural / Architecture / MEP / Equipment / Spatial) | **⛔ MISSING** | The census has 18 declared FAMILIES (`walls`, `rooms`, `columns`, `plumbing`…) but no discipline axis. `AnalysisAxis` has no `discipline` member. | `grep -n "AnalysisAxis" -A 26 apps/editor/src/ui/analysis/AnalysisTypes.ts` → `category \| level \| type \| chapter \| unit \| relationship` |
| 14 | An IFC type tree with counts (`WALL (47)`, `SLAB (35)`…) | **EXTEND — via IFCTREE47, not a rival** | `plugins/ifc-inspector/src/tree/ifc-class-authority.ts` is the single PRYZM-type → IFC-class authority (mapped / `not-a-product` / `no-contract-row`). It is **UNTRACKED at the time of this audit**, so it cannot be imported yet. | `git status --porcelain plugins/ifc-inspector` → `?? plugins/ifc-inspector/src/tree/` |
| 15 | A 3-D graph the user can navigate | **⛔ MISSING** | Every graph surface in this app is 2-D: `nodeLinkSvg` is SVG; `BuildingGraphOverlay` and `LivingGraphCanvas` are Canvas-2D and say so in their headers. | `grep -rn "Canvas-2D only\|Canvas 2D only" apps/editor/src/ui/graph apps/editor/src/ui/living-graph` → 2 hits |
| 16 | A WebGL port that a card may draw into | **REUSE / EXTEND** | `apps/editor/src/ui/element-preview/` — ONE offscreen WebGL context for the whole app, no animation loop, every draw coalesced through `getFrameScheduler().scheduleOnce`. P2-legal import path `@pryzm/renderer-three/three`. | `grep -n "renderer-three/three\|scheduleOnce" apps/editor/src/ui/element-preview/ElementPreviewRenderer.ts` |
| 17 | Export network data / Export PNG | **⛔ MISSING** | No download, blob or data-URL path exists anywhere under `ui/analysis`, `ui/graph` or `ui/living-graph`. | `grep -rn "createObjectURL\|toDataURL\|\.download" apps/editor/src/ui/analysis apps/editor/src/ui/graph apps/editor/src/ui/living-graph` → **0 hits** |
| 18 | Legend | **REUSE (edges) / EXTEND (node types)** | `renderEdgeLegend` exists and is a query surface. The reference also legends NODE types (Root · Category · Type · Element · Property) — those node kinds do not exist here yet, because the tree they belong to does not (row 12). | `grep -n "renderEdgeLegend" apps/editor/src/ui/analysis/nodeLinkSvg.ts` → `:481` |
| 19 | Node-size control | **EXTEND** | Radius is `6 + 8·√(weight/maxWeight)` with weight = degree, hard-coded. No control. | `grep -n "const r = 6" apps/editor/src/ui/analysis/nodeLinkSvg.ts` |
| 20 | Colour scale | **REUSE — DO NOT MINT** | `seriesColour()` over the 8 CVD-simulated `--app-cat-*` tokens, plus a NAMED neutral for absence keys that is deliberately outside the rotation. | `grep -n "CAT_TOKENS\|ABSENCE_KEYS" apps/editor/src/ui/analysis/AnalysisTypes.ts` → `:320`, `:333` |

---

## §2 — The three corrections this audit makes to the lane brief

**⭐ C01 §6 rule 6: a refuted hypothesis is recorded, not quietly dropped.**

### §2.1 — "The bidirectional selection he is asking for may ALREADY WORK." — **HALF TRUE.**

It is one wire, not two, and only one of the two directions is built.

- **Graph → 3-D: WORKS.** Verified by reading the whole path, not by assuming the dispatch lands:
  `widgetRenderers.ts:915` dispatches on `selectionBus`; `InspectModeCoordinator.ts:136` subscribes
  to that bus; `:277` calls `diagnosticMaterialManager.setAnalysisSelection(ids, scene)`;
  `DiagnosticMaterialManager.ts:1521` stores the set and repaints. The Analysis surface is a
  50 %-width right-hand panel (`#anl-surface { position: fixed; right: 0; width: 50% }`), so the
  3-D viewport is on screen beside the graph while the click happens. This wire was dead until
  §FIX-ANALYSIS-HIGHLIGHT-HAS-NO-EMITTER (L-6600) replaced a subscription to `selection.changed`
  — an event with zero production emitters — with `selectionBus`.
- **⛔ 3-D → graph: DOES NOT EXIST.** `relationship-graph` is `refresh: 'manual'`;
  `_renderSelectionWidgets()` skips every widget that is not `refresh: 'on-selection'`. Selecting a
  wall in the viewport changes nothing on the relationships tab. **This is the founder's second
  sentence and it is unbuilt.**

**⚠ One further limit on the direction that DOES work:** the purple is painted only while the
Analysis lens is the ACTIVE lens (`DiagnosticMaterialManager.ts:1523`,
`this._active && this._activeLens === 'analysis'`). A graph click made from any other workspace
updates the stored set and paints nothing until the user enters Analysis. That is deliberate and
documented; it is recorded here so nobody reports it as a defect.

### §2.2 — "`nodeLinkSvg.ts` is the ONE shared node-link renderer." — **IT IS THE INTENDED ONE. IT IS NOT THE ONLY ONE.**

There are **four** node-link implementations in this app today and `nodeLinkSvg.ts` is the newest
and smallest of them. Its own header says so (L-3257) and names the debt.

| Implementation | Lines | Technology | Reads |
|---|---|---|---|
| `ui/analysis/nodeLinkSvg.ts` | 517 | SVG | the UBG, via `graphReadModel` |
| `ui/graph/BuildingGraphOverlay.ts` + `graphLayout.ts` | 1031 + 257 | Canvas 2-D | the UBG directly |
| `ui/living-graph/**` (8 files, incl. `forceSimulation.ts` 343) | 3 194 | Canvas 2-D | the UBG, room-shaped |
| `ui/rooms/RoomGraphPanel.ts` | 561 | SVG, module-private | the room graph |

Command: `wc -l apps/editor/src/ui/graph/*.ts apps/editor/src/ui/living-graph/*.ts apps/editor/src/ui/rooms/RoomGraphPanel.ts`
→ **5 911** lines outside the shared module.

**⛔ THIS LANE DOES NOT COLLAPSE THEM AND DOES NOT PRETEND TO.** Migrating three live overlays is
not this lane's remit and doing it blind is the larger risk — the same judgement L-3257 already
recorded. What this lane commits to is the narrower and enforceable rule: **it adds no fifth.**
Every new thing built here (the 3-D layout, the hierarchy projection, the discipline taxonomy) is
built where the EXISTING shared module or the EXISTING L2 package can consume it.

**⭐ One of the four already solves the founder's second sentence, room-shaped.**
`LivingGraphOverlay.reflectGraphFocusFromModel()` (`:1032`) takes an element id picked in the model,
resolves it to its ROOM, focuses that node and pans it into view. That is the pattern; it is not
the answer, because the founder asked for the picked ELEMENT's topology, not its room's.

### §2.3 — "IFCTREE47 is building the IFC class/spatial/system/material/storey groupings — share the classifier." — **TRUE, AND I COULD NOT REACH THEM.**

`SendMessage` to `IFCTREE47` returned *"No agent named 'IFCTREE47' is reachable"*, and their work
is **untracked** (`git status --porcelain plugins/ifc-inspector` → `?? .../src/tree/`). An import
across an untracked path is a build that breaks the moment either lane commits alone.

**⭐ The resolution is a declared SEAM, not a fork.** `packages/building-graph/src/discipline.ts`
(this lane) resolves discipline from the PRYZM element FAMILY and exposes
`IfcClassResolver` — an injected function of exactly the shape
`ifc-class-authority.ts` already returns. When IFCTREE47 lands, the wiring is one import and no
logic moves. Until then the IFC-class column renders as *not resolved yet*, naming the reason,
rather than as a guess.

**⛔ What this lane does NOT do:** it does not re-derive a PRYZM-type → IFC-class map. That fact
already has four rival homes (`CoreElement.ts`, `IfcModelBuilder.ts`, `FragmentReader.ts`,
C25 §2) and IFCTREE47 is reconciling them. A fifth would be the exact defect this repo keeps
paying for.

---

## §3 — What is genuinely new, and the shape each new thing takes

### §3.1 — One graph, six projections (**ADR-0364**)

**⛔ THE SIX VIEWS ARE NOT SIX GRAPHS.** C71 §4.2 makes the UBG's vocabulary *"the canonical QUERY
vocabulary"* with the other stores mapping onto it; C71 §4.1 forbids merging the stores. A view is
therefore an **edge-family filter plus a node-role assignment over ONE projection**, and it is
implemented as such: `projectHierarchy(graph, view)` selects a subset of the same ten families.

| View | Edge families it projects | Bound on the founder's model |
|---|---|---|
| **Element-based** | `hostedIn`, `dependsOn` | every node the census can name |
| **Spatial-based** | `bounds`, `adjacentTo` | ⚠ see the `bounds` warning in §3.2 |
| **System-based** | `servesZone` | **⛔ STRUCTURALLY EMPTY — see §3.3** |
| **Room-based** | `connectsTo`, `circulatesVia` | rooms + synthetic circulation nodes |
| **Topology-based** | `bounds`, `adjacentTo`, `hostedIn`, `joinedTo`-equivalents | the union of the spatial and element families |
| **Mixed** | all ten | the whole graph, capped |

### §3.2 — ⛔ TWO WARNINGS THAT MUST TRAVEL WITH `bounds`, AND MUST NOT BE LOST

Carried verbatim from `graphReadModel.ts`'s `EDGE_FAMILIES` and re-verified here:

1. **`bounds` emitted NOTHING in production until 2026-08-21** (L-3253). Its id universe read
   `window.pryzmScene`, which nothing in the repo ever assigned. Any reading of `bounds` coverage
   taken before that date is a reading of a dead wire, not of a building.
2. **`intersects` is a SYMMETRIC overlap test.** A `bounds` edge `A → B` therefore does **NOT**
   mean *"A contains B"*. A Spatial-Based view that drew arrowheads implying containment would be
   asserting a direction the test never measured. **The spatial view draws `bounds` undirected.**

### §3.3 — The per-view empty states, each naming its own cause

**⛔ A BLANK CANVAS IS THE ONE OUTPUT THAT IS NEVER ALLOWED.** `[[context-data-honesty-family]]`:
the failure value and the empty value are the same value unless the code makes them different.

| View | When empty, it says | Why that sentence and not another |
|---|---|---|
| **System-based** | *"No systems are authored in this model. `servesZone` is a **PARKED** family under C71 §2.2 — declared, deliberately not required, and it has no writer because there is no zone model to write from: no `zone` element kind exists among the 29 declared kinds, there is no zone store, and `SemanticGraph.ts:57` marks its own `servesZone` member `// (future)`. C71 §2.3: parked is not a gap. This view is empty because the product does not model systems, not because the query failed."* | This is the row the founder is most likely to read as a bug. It is not one, and inventing a zone model to fill it would be strictly worse than the blank (L-6613). |
| **Room-based** | names whether `connectsTo` produced nothing because there are no rooms, or because `RoomGraphService` was unreachable | `[]` may only ever mean "zero results" — C71 §4.4 |
| **Spatial-based** | names the L-3253 history if `bounds` is empty | a family that was dead for months must not read as a building with no boundaries |
| **Element-based** | distinguishes "no hosted elements" from "the UBG was not reachable" | `graphReadModel` already separates these; the view must not re-merge them |
| any view, graph unreachable | *"The Building Graph was not reachable — the projection has not run yet"* | already implemented at `widgetRenderers.ts:861`; reused verbatim |

### §3.4 — The 3-D viewport, and the port it ticks under

**⭐ IT REUSES THE ONE OFFSCREEN CONTEXT. IT DOES NOT CREATE A SECOND ONE.**

- **P2** — THREE is reached only through `@pryzm/renderer-three/three`, the owner package's
  namespace sub-path, which `check-three-imports.ts` names as compliant in its own header. This is
  the same import `ElementPreviewRenderer.ts`, `FurnitureThumbnailService.ts` and `PIPRenderer.ts`
  already use.
- **P3** — there is **no animation loop**. A draw happens only when something the image depends on
  changes (orbit drag, view switch, filter change, mount, resize) and every request is coalesced
  through `getFrameScheduler().scheduleOnce`. An idle 3-D graph costs zero frames.
- **⛔ Why not a second `WebGLRenderer`:** browsers cap live WebGL contexts (commonly 8–16) and
  silently kill the OLDEST when a new one is created. In this application the oldest is **the main
  viewport**. The standing constraint is *"don't compromise graphics"*, and the founder is on
  WebGL with no fallback beneath it.
- **Picking without a raycaster.** The layout is computed here, so the renderer returns each node's
  **projected screen position** after a draw. Hit-testing and labels are then plain 2-D over the
  blit: labels stay crisp at full canvas resolution, and no THREE type crosses the widget boundary.

### §3.5 — Barnes-Hut in three dimensions: ONE tree, not two

A 3-D force layout needs an **octree** where the 2-D one uses a **quadtree**. Writing a second
tree beside the first would be precisely the duplication this lane exists to avoid, so the
existing cell is made **dimension-generic** (`2^D` children, quadrant computed over `D` axes) and
both layouts call it.

**⛔ The 2-D output must not move.** `nodeLinkSvg.ts` promises that every graph that drew before
§PERF-GRAPH-BARNES-HUT draws byte-identically, and `graphLayoutScale.spec.ts` asserts determinism.
The generalisation therefore ships with a **differentiating test** that captures the 2-D layout of
a fixed graph before and after and asserts exact equality — measured, not asserted from the shape
of the diff.

---

## §4 — Bounds, per view, for the largest model named in the brief

**⚠ C66 §1.1 — none of these is a supported-capacity claim.** They are the bounds at which each
surface stops drawing and starts SAYING it stopped.

| Surface | Bound | What happens at the bound |
|---|---|---|
| 2-D SVG graph | `GRAPH_NODE_CAP = 320` nodes | the 320 most-connected are drawn; `truncated` is set; the card prints `≥` on every count and names the cap and the total. **Never a silent clip.** |
| 3-D graph | the same 320 | one cap, one notice, one number — a second cap would mean the 2-D and 3-D tabs of one card disagreed about the same building |
| UBG today | **430 nodes** on the founder's model | 320 of 430 drawn = 74 %. Before §PERF-GRAPH-BARNES-HUT it was 60 of 430 = 14 %. |
| The 111 263-element IFC model | **⛔ THE UBG DOES NOT HOLD IT** | The UBG is a projection, not a census: a node exists only if an adapter projected a relationship touching it. An imported IFC file creates no UBG adapter edges. So the honest bound is *"this graph shows the relationships PRYZM's adapters project; an imported IFC model contributes none of them"* — and the card says that rather than showing 320 of 111 263 and implying the rest are merely undrawn. |
| Discipline / type counts | the **element census**, 18 declared stores, `O(n)` memoised | the census is the denominator and it is written down; an unreachable store is reported, never folded into zero |

---

## §5 — Exactly what the founder clicks

**To select a wall in PRYZM and see its topology in the graph** (after this lane's Stage E):

1. Enter the **Analysis** workspace (the `Author | Inspect | Analysis | Data` bar at the top).
   The dashboard opens on the right half; the 3-D viewport keeps the left half.
2. Open the **Relationships** tab.
3. Click the wall **in the 3-D viewport**. It turns PRYZM purple (that half already worked), and
   the relationship graph re-centres on it, showing its typed neighbours out to the chosen depth
   with everything else dormant rather than removed.
4. Click any node **in the graph**. That element highlights in the 3-D viewport (this half already
   worked, via `selectionBus`).
5. `Element-based / Spatial / System / Room / Topology / Mixed` switches which relation families
   the picture projects; `2D / 3D` switches how it is drawn. Neither changes the population, and
   both restate the scope on the card.

---

## §6 — What this SPEC deliberately does not claim

- It does not claim the four node-link implementations have been collapsed. They have not (§2.2).
- It does not claim `servesZone` will ever be filled. Under C71 §2.5 an unparking needs an ADR
  naming its first CONSUMER, and a writer-first unparking is forbidden.
- It does not claim the IFC discipline column is resolved. It is a declared seam awaiting
  IFCTREE47 (§2.3), and it renders as unresolved until then.
- It does not claim a millisecond budget for the 3-D layout on any machine but the one it was
  measured on (C66 §1.1).
