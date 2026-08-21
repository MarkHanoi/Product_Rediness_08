# ADR-0343 — The Analysis surface is a workspace MODE, and its dashboards are composable widgets over a maintained read model

**Status:** **ACCEPTED and IMPLEMENTED IN PART (2026-08-21)** · proposed by lane ANLZ1, implemented by lane ANLZ2.
> ⭐ **What is BUILT:** §D.1 (the fourth workspace mode `analysis`, F4, half-screen) **and its binding precondition**, the mode registry — `apps/editor/src/ui/platform/workspaceModes.ts`, landed in the FIRST commit as §D.1 requires (L-3000). §D.2 (one widget engine; `ui/inspect/dashboards/` is still NOT created). §D.3 (the query descriptor; layouts persist, see below). §D.5 (colour — the eight categorical values §U.2 left open are chosen, CVD-simulated and guarded: L-3001). §D.6 (the honesty rules, guarded by 32 assertions).
> ⛔ **What is NOT built, and must not be read as built:** §D.4's *incrementally-maintained, StoreEventBus-driven, O(Δ)* read model — what shipped is a **cached full projection**, one O(n) scan memoised until invalidated (**L-3004, OPEN**). §D.3's *"layouts persist in the `.pryzm` snapshot"* — they are in `localStorage` keyed by project id, said on the surface's own face, because the snapshot READ leg lives in a file a concurrent lane owned (**L-3007, OPEN**). ~~§D.7 in full — the graphs have NOT moved out of the GIS tab…~~ ⭐ **DONE 2026-08-21 (lane UBG1, L-3250…L-3259).** The ⛔ BINDING PRECONDITION was **discharged first, in that order**: the UBG is now StoreEventBus-maintained (L-3251) — and the blocker went deeper than L-2131 recorded, because `BuildingGraph` had **no retraction primitive at all**, so a delete was unrepresentable and subscribing alone could not have helped (L-3250). The GIS registry is 15→13 actions / 4→3 groups; `relationship-graph` + `relationship-coverage` ship on the DEFAULT Analysis dashboard. ⚠ Four of the ten UBG edge families still cannot be populated in production and each ships a NOT_MEASURED coverage row saying why (L-3258). ⚖ §U.1 (does `graph.building` retire?) was SURFACED, not taken — it remains the founder's call and both overlays stay installed.
> ⚖ **§U.4 decided by the implementing lane:** the read model lives in `apps/editor/src/ui/analysis/`, NOT in a new `@pryzm/analysis-read-model` package and NOT beside `SemanticIndex` in `core-app-model`. Reason: what shipped reads `window.*` element stores exactly as `computeTakeoff()` does and is therefore browser-coupled; promoting browser coupling into an L2 package would be the wrong direction. ⭐ **When L-3004 makes it StoreEventBus-driven, that coupling goes away and the question should be re-asked** — at that point the L2 package is the right home.
> **Issue log:** L-3000 … L-3013. **Artefacts:** `76d81209`, `bf80949e`, `4205c5c9`, `b9cd03a9`.
**Trigger:** founder, 2026-08-21 — *"I would like also in Inspect to have data graphs — really nicely done with the graphics, the structure and logic of Speckle. This is a big feature and maybe should even be another tab — Analysis? like Inspect (half mode). Scope it correctly — contracts, specs, ADRs. Amazing colours, amazing performance. Probably the Living Graph and Building Graph should be there also — now in the GIS tab (incorrect) — it should really be like PowerBI."*
**Spec:** [SPEC-ANALYSIS-SURFACE-AND-WIDGETS](../../03-execution/specs/SPEC-ANALYSIS-SURFACE-AND-WIDGETS.md) — the widget catalogue, per-widget scope tier, data gap, cost and refusal.
**Governing contracts:** [C27 §6](../contracts/C27-BIM3-INSPECT-MODEL.md) (graphical data dashboards — *this ADR is that section's delivery vehicle, not a rival*), [C06](../contracts/C06-UI-SHELL-AND-TOOLS.md) (UI shell), [C10 §1](../contracts/C10-PERFORMANCE-AND-OBSERVABILITY.md) (NFTs), [C66 §1.1](../contracts/C66-CONCURRENCY-AND-SCALE.md) (a capacity that has not been measured is a CLAIM), [C52](../contracts/C52-EDITABLE-BUILDING-GRAPH.md), [C03](../contracts/C03-SCHEMAS-COMMANDS-AND-STATE.md), [C05](../contracts/C05-PERSISTENCE-AND-FILE-FORMAT.md).
**Related ADRs (referenced, NOT contradicted):** [ADR-0058](./ADR-0058-unified-building-graph.md) (UBG projects, never replaces), [ADR-0061](./ADR-0061-building-graph-bidirectional-edit-substrate.md) (the graph is a bidirectional edit substrate; edits re-run the existing engine), [ADR-0067](./ADR-0067-graph-ir-intent-first-building-graph-bim3.md) (graph-IR, intent-first), [ADR-0068](./ADR-0068-five-graph-model-circulation-first-building-graph.md).
**Strategy:** [STR-14](../../01-strategy/STR-14-pryzm-building-graph-and-relational-ai-foundation.md).
**Issue log:** L-2130 … L-2138.

> **Every measurement in this ADR was taken at HEAD on 2026-08-21 and is cited with a file and
> line.** Where a number came from a subagent it was re-taken by hand before being written here.
> Two claims in this document are explicitly marked NOT MEASURED IN THIS LANE. Read the code, not
> this file — these rot.

---

## Context

### C.1 — The founder is asking for a section that is already contracted and has never been built

**C27 §6 — "Graphical data dashboards"** specifies seven per-node dashboards in
`apps/editor/src/ui/inspect/dashboards/`, including a `BuildingDashboard` of *"Stacked floor-area
bar + room type donut + element count by category"*. That is very nearly a description of the
founder's Speckle screenshots, written months earlier.

**None of the seven exists.** C27's own §0.0 correction (2026-08-18) records the measurement:
`ls apps/editor/src/ui/inspect/dashboards` → *No such file or directory*, and
`ElementInstanceDashboard` has **zero occurrences in any code file**.

So this is not a new product idea needing a new contract. It is C27 §6, unbuilt, with a surface
question and a substrate question attached. This ADR answers those two questions.

### C.2 — "like Inspect (half mode)" names a thing that exists, and it is not the Inspect panel

The phrase resolves precisely, and the resolution decides the surface question:

- **`WorkspaceMode`** (`apps/editor/src/ui/WorkspaceController.ts:32`) is
  `'author' | 'inspect' | 'data'`, driven by the top pill bar (`ui/platform/WorkspaceModeBar.ts:48-78`)
  and F1/F2/F3 (`WorkspaceController.ts:517-519`). That file's own header (`:9-11`) reads:
  *"author (F1) — full 3D canvas; DataWorkbench hidden · inspect (F2) — 50/50 split: 3D left …
  AuditStack right · data (F3) — DataWorkbench full width; Three.js canvas display:none"*.
  The inspect branch sets `canvas.style.width = '50%'` (`:131`). **This is the half mode.**
- **The Inspect RAIL PANEL is a different thing** — `{ id: 'INSPECT', label: 'Inspect' }` is one of
  nine entries in the left icon strip (`ui/ViewBrowser/ProjectBrowserPanel.ts:225`), hosted by
  `RailPanelController`, whose width is `DEFAULT_WIDTH 280`, `MIN_WIDTH 220`, `MAX_WIDTH 600`
  (`ui/ViewBrowser/RailPanelController.ts:24-26`). **It has no half mode and cannot have one at
  600 px.**
- **The DataWorkbench** does declare a `'split'` mode at 50% (`ui/dataworkbench/DataWorkbench.ts`,
  `WorkbenchMode = 'hidden' | 'panel' | 'split' | 'full'`), **but nothing drives it there**:
  `WorkspaceController` calls `dw.setMode('hidden')` in author (`:123`) and inspect (`:134`), and
  `dw.setMode('full')` in data (`:149`). The 50% mode has no caller.

### C.3 — The substrate, measured. This is where "amazing performance" is decided

Four independent measurements, each of which rules out an obvious answer:

1. **The Unified Building Graph is stale by construction.** `window.__pryzmBuildingGraph` is
   populated only by `window.pryzmBuildBuildingGraph()` (`apps/editor/src/engine/buildBuildingGraph.ts:853-855`).
   Its **only production callers are the two graph overlays** — `ui/graph/BuildingGraphOverlay.ts:366-367`
   and `ui/living-graph/LivingGraphOverlay.ts:770,773,905`. `ui/layout/installLiveGraphWiring.ts`
   makes four install calls and **subscribes to nothing**. STR-14 §3 says the UBG is *"Incrementally
   maintained off the StoreEventBus (we already fire per-element events)"*; **that is not what is
   built** (L-2131). A dashboard bound to the UBG would report the model as it stood the last time
   somebody opened a graph overlay.
2. **`ElementStore.getState()` is a lower bound, and its type does not say so.** The store is
   capacity-bounded with LRU eviction to IndexedDB (`packages/stores/src/ElementStore.ts:141`,
   `capacity: options.capacity ?? 50_000`), and `getState()`'s own doc comment (`:157-158`) reads
   *"Returns a ReadonlyMap view of the IN-MEMORY (LRU-resident) elements. Elements evicted to
   IndexedDB are NOT present here."* **Any aggregate computed by iterating it is an undercount
   whenever eviction has occurred, and nothing in the returned value distinguishes that from a
   true count** (L-2132).
3. **There is no cross-type element iterator, and the per-type ones are expensive.** The pattern is
   per-store `getAll()`. `packages/core-app-model/src/stores/FloorStore.ts:373` `structuredClone`s
   every record on every call, and `:377-379` implements `getByLevel` as
   `this.getAll().filter(...)` — an O(n) deep clone per group-by, per widget, per refresh. The same
   shape is in `BeamStore.ts:128`, `CeilingStore.ts:428`, `RoofStore.ts:158`, `StairStore.ts:146`.
   **Exactly one store has a level index** — `packages/geometry-wall/src/WallStore.ts:168`,
   `private _levelIndex: Map<string, Set<string>>`, whose comment states it *"Reduces getByLevel()
   from O(n) linear scan to O(1) Set lookup."* No element store has a **category** index.
4. **The right shape already exists, on the wrong axis.** `packages/core-app-model/src/SemanticIndex.ts`
   (265 LOC) is an O(1) inverted index that *"Subscribes to StoreEventBus (read-only)"*,
   is *"Serialisable for ProjectSnapshot persistence"* and exposes `evaluateQuery(expr, elementId)`
   over a typed `SemanticQueryExpression` (`:31-38`). **It indexes tags only** — `getElementsByTag`
   (`:119`), `getTagSummary(): Record<string, number>` (`:130`). It is the template for the answer,
   not the answer.

### C.4 — The honesty vocabulary already exists in this repo, and it is better than one I would invent

`packages/core-app-model/src/quantities/` holds a real take-off engine (`QuantityTakeoff.ts`, 879 LOC,
`computeTakeoff()` at `:395`). Its result type carries a section literally headed *"Coverage (the
honest half)"* (`TakeoffTypes.ts:129-164`):

```ts
export type CoverageState =
  | 'MEASURED'        // Measured to a real quantity, by a stated basis.
  | 'COUNTED_ONLY'    // Present and counted (`ud`) but no area/volume/length is derived.
  | 'NOT_MEASURED';   // Not measured at all — the `note` says why. NEVER rendered as a zero.
```

…plus `unreadableStores` (*"Stores that were not reachable at all … Distinct from 'the store was
empty', which is a real answer and produces no line"*) and `measuredElementCount`. The `coverage`
field's own comment states the point this ADR is about: *"that is the difference between 'you have
no roofs' and 'roofs are not measured'."*

### C.5 — The colour question is a live, recorded defect, not a matter of taste

Lane UI1 closed L-1740…L-1744 **earlier today**: the Inspect and Data panels referenced **nine
undeclared custom properties across 62 references** and rendered in a palette nobody chose. The
authority is `apps/editor/src/ui/styles/tokens.ts`, which states at `:276-277` that *"Adding a value
here is the ONLY sanctioned way to introduce a colour to a panel. If a role is missing, add the role
— do not inline the hex."* The guard is `apps/editor/src/ui/styles/__tests__/panelBrandStandard.spec.ts`
(ARM C resolves every referenced custom property against its declaration).

Two facts from that ruling bound this ADR, and they point in **opposite** directions:

- **`§DATA-BUCKET-ACCENT-IS-ONE`** (`DataWorkbench.ts:104-118`) collapsed six bucket accents to one
  `var(--app-accent)`: *"a six-hue rail is the single most visible reason this surface reads as a
  different product … colour was the fifth redundant channel, and SC 1.4.1 forbids it being the only
  one regardless."*
- **`syncStateColours.ts:21-23`** deliberately did **not** collapse: *"The states are genuinely
  SEMANTIC — a badge that means 'conflict' must not look like one that means 'synced' — so this is
  not collapsed to the brand accent."*

A chart is nothing but colour carrying meaning. The reconciliation is stated as a decision in §D.5.

---

## Decision

### D.1 — Analysis is a fourth WORKSPACE MODE, not a DataWorkbench bucket and not a rail panel

**A new `analysis` workspace mode joins `author | inspect | data`, in half mode: the 3-D canvas at
50% on the left, the Analysis surface on the right — structurally identical to how `inspect` mounts
`AuditStack`.**

Reasons, each measured:

1. **It is what the founder asked for, literally.** "Half mode like Inspect" is
   `WorkspaceMode='inspect'` (C.2). The rail panel cannot be half (600 px cap) and the
   DataWorkbench's 50% mode has no caller.
2. **A dashboard must be able to point at the model.** Every Speckle widget the founder showed is a
   selector: click a donut segment, see those elements. In `data` mode the canvas is
   `display:none` (`WorkspaceController.ts:9-11`). **A bucket inside the DataWorkbench is a
   dashboard that cannot highlight what it is describing.** That is the decisive argument, and it is
   structural rather than aesthetic.
3. **The DataWorkbench is already at capacity as a concept.** It carries six buckets and 28 sub-tab
   ids (`DataWorkbench.ts:104-121`, `TabId` union), and lane DATA1 is adding a seventh
   (`mediciones`, L-2003) while this is written. Adding an eighth bucket that must *also* change
   what `data` mode means is a larger change than adding a mode.
4. **It does not orphan anything.** The DataWorkbench keeps `analytics` (its five Chart.js charts),
   `relationships`, `quantity-schedules` and `mediciones`. The Analysis surface consumes the same
   engines through the read model; it does not fork them.

**Honest counter-argument, recorded rather than smoothed over.** `WorkspaceModeBar._build()` holds
its modes as a **hard-coded local array literal** (`:48-78`), the `WorkspaceMode` union is a literal
(`WorkspaceController.ts:32`), and the F-key handler is three `if` statements (`:517-519`). A fourth
mode is therefore **five hand-edited sites, not a registration**, and a four-item pill bar is at the
edge of what a top-centre pill should hold. **Binding consequence: the first commit of this
programme converts the mode list to a registry.** If that conversion is not done, this decision has
made the shell worse, and the ADR should be revisited rather than executed.

**What this does NOT decide:** whether `analysis` eventually absorbs `inspect`'s right half
(`AuditStack`) or sits permanently beside it. Left open — see §U.5.

### D.2 — C27 §6 is delivered BY this surface. There is one widget engine, not two dashboard systems

C27 §6 specifies **per-node-type** dashboards bound to the Inspect tree selection. Speckle's model is
**composable widgets** the user arranges. These are not rivals — they differ only in *who chooses the
layout*:

> **A C27 §6 dashboard IS a saved widget layout whose widgets are all scoped to the current
> tree selection.** The seven named dashboards (`ProjectDashboard` … `ElementInstanceDashboard`)
> ship as seven **built-in layout presets**, not as seven bespoke components.

This is why `apps/editor/src/ui/inspect/dashboards/` stays empty and is **not** created. C27 §6's
directory citation becomes stale on this ADR's acceptance; C27 must be edited in place to point at
the Analysis surface (canonical-doc edit, never a derivative — CLAUDE.md).

### D.3 — The widget contract: typed, declaratively queried, cost-inspectable

An `AnalysisWidget` is:

```
{ id, kind, title, scope, query, refresh, render(host, result) }
```

with these binding properties:

- **`query` is a DESCRIPTOR, not a closure.** A widget declares *what* it wants over the read model's
  indexed axes; it never receives a store. Three consequences that are the whole point: the cost of a
  widget is **inspectable before it runs**, identical queries across widgets are **computed once**,
  and a widget **cannot** reach past the read model into `getState()` and silently undercount
  (C.3.2).
- **`scope`** is one of `project | building | level | apartment | room | selection | elementType`,
  bound to the same `InspectSelection` (`@pryzm/schemas`) the C27 tree already emits. Selection is
  the join between the chart and the model, in both directions.
- **`refresh`** is `manual | on-commit | on-selection`. **Never `on-frame`.** No widget may call
  `requestAnimationFrame` (P3 — the single owner is `packages/frame-scheduler/src/RafAdapter.ts`);
  any animation subscribes the frame bus.
- **Read-only.** A widget dispatches selection and visibility intent; it never writes a store (P6),
  and visibility it asks for is an intent, not a per-surface flag (P7).
- **Every exported widget function carries ≥1 OTel span** (P8). The span attribute set is bounded by
  the closed `kind` union — the same cardinality reasoning ADR-0058 §6 applied to edge types.

**Layouts persist per project, in the `.pryzm` snapshot (C05) — not in `localStorage`.** A dashboard
the founder arranged is project content: it must survive a machine change and travel with the file.
`localStorage` is where the rail panel keeps its width (`RailPanelController.ts:22-24`); that is the
right home for chrome and the wrong home for a deliverable.

### D.4 — The query substrate: a NEW maintained read model. This is the load-bearing decision

**Analysis widgets read one substrate: an incrementally-maintained analysis read model, built on the
`SemanticIndex` pattern — StoreEventBus-driven, O(Δ) on mutation, O(1) on lookup, serialisable.
Widgets do not read element stores, and they do not read the UBG for aggregates.**

Ruled out, with the measurement that ruled it out:

| Candidate | Ruled out because |
|---|---|
| **The UBG** (`window.__pryzmBuildingGraph`) | ~~Stale by construction — nothing subscribes to store events (C.3.1, L-2131).~~ ⚠ **The staleness half is FIXED (L-3251); the ruling STANDS on the other half.** The UBG is a PROJECTION: a node exists in it only if an adapter projected a relationship touching it, so an aggregate over it counts only the elements that participate in a projected edge — an undercount that reads as a count (C.3.2). |
| **Ad-hoc per-store `getAll()`** | O(n) `structuredClone` per group-by (C.3.3); one store has a level index, none has a category index. |
| **`ElementStore.getState()`** | Returns the LRU-resident subset only; an aggregate over it is an undercount that reads as a count (C.3.2, L-2132). |
| **`SemanticIndex` as-is** | Right architecture, wrong axis — tags only (C.3.4). It is the model to copy. |

The read model indexes exactly the axes a dashboard groups by — `kind`, `levelId`, `typeId`,
`materialId`, `roomId` — as counts plus running sums for the scalar measures the take-off engine
already defines. **It stores no geometry and derives no quantity of its own**: scalar measures come
from `computeTakeoff()`, which is the single measurement authority (D.6). It is a *projection*, in
exactly the sense ADR-0058 §1 uses of the UBG — it never becomes a second source of truth.

**The UBG keeps the relational widgets.** Node-link and rule-violation widgets read the UBG, because
those are its native questions — **but only once it is maintained** (D.7 precondition).

**Cost budget, binding** (by analogy to C10 NFT 5 *plan-view re-render < 100 ms p95* and NFT 13
*schedule rebuild 10k rows < 500 ms p95*):

| | Budget |
|---|---|
| Widget refresh, cached query | ≤ 16 ms p95 — one frame; a dashboard must never be the reason a frame is dropped |
| Widget refresh, cold recompute | ≤ 100 ms p95 at the C66 closed-beta document assumption (≤ 800 elements) |
| Read-model maintenance per element mutation | O(Δ), never O(n) |
| Full dashboard mount, 8 widgets | ≤ 250 ms p95 at the same tier |

**A widget that cannot answer inside its budget degrades to a stated refusal, never to a partial
number.** "Too large to compute" is an honest card; a silently truncated aggregate is not.

**C66 §1.1 applies by analogy, and is binding:** no widget may be *described* as supported at a
document size it has not been benched at. Every SPEC catalogue row carries its benched tier or the
word **CLAIMED**. The orchestrator reports the founder's project at **259 elements / 4,760 meshes**;
**this lane did not measure that and does not restate it as measured** — it is the shape of the
first bench, not evidence.

### D.5 — Colour: encoding may be plural, decoration may not

**The reconciliation of the two rulings in C.5 is the distinction between colour that *encodes* and
colour that *decorates*.** `§DATA-BUCKET-ACCENT-IS-ONE` collapsed six hues that carried no
information beyond identity already carried by icon and label. `syncStateColours.ts` kept six hues
that carry meaning. A chart series is the second case by definition. Therefore:

1. **Decorative chrome on the Analysis surface is `--app-accent` (`#6600FF`), white ground, no
   black.** `--app-canvas-bg` (`#0d1117`) is the 3-D canvas and must never appear in a panel.
2. **The sequential ramp ALREADY EXISTS. Do not mint a fourth.** `DISCOVERY_RAMP`
   (`apps/editor/src/ui/inspect/audit/heatRamp.ts:28-33`) runs `rgb(216,203,255)` → `#6600FF` and is
   already the one definition for the Inspect heat encoding (`§DISCOVERY-RAMP-IS-ONE`, L-1742).
   There are already **three** purple ramps in the tree — that one, `WIND_BAND_COLORS`
   (`ui/geospatial/FormaSiteAnalysisControls.ts:87-90`, six stops ending `#6600FF`), and
   `--app-gradient` (`tokens.ts:33`) — see L-2135. The ramp is promoted into `tokens.ts` as the
   canonical role and the other sites read it.
3. **A categorical scale must be MINTED — it does not exist.** `tokens.ts` has no `--chart-*` and no
   series-indexed set; its only multi-hue groups are role-named (status, CDE state, VG badge). The
   de-facto categorical palette in the product today is **37 raw hexes inside one file**
   (`DataVisualizerService.ts:76-122`, `OCCUPANCY_COLORS`) — L-2137.
4. ⚠ **A purple-monochrome categorical scale cannot be colour-blind-safe, and this ADR does not
   pretend otherwise.** Separating eight series under deuteranopia, protanopia and tritanopia
   requires variation in lightness *and* hue; a single-hue ramp gives lightness only. **The
   categorical scale therefore leaves the brand monochrome, and that is a deliberate, argued
   exception to "white + purple", justified by SC 1.4.1 — not a relaxation of it.**
5. ⚠ **This ADR does NOT name eight hex values.** Choosing eight colours and asserting they are
   CVD-safe without simulating them would be a hypothesis wearing the confidence of a measurement.
   The SPEC states the **constraint and the verification** (`packages/a11y-tokens` contrast audit +
   a named CVD-simulation check in the guard); the values are chosen and *verified* in the
   implementing commit. See §U.2.
6. **Colour is never the only channel.** Every categorical series carries a label, a legend order, or
   a pattern in addition to its hue — the reasoning `DataWorkbench.ts:104-118` already records.
7. **Diverging scale for Δ** reuses existing tokens: `--app-status-error-ink` (`#b91c1c`) →
   `--app-border` (`#dde3f0`) → `--app-status-success-ink` (`#15803d`) (`tokens.ts:334-342`).
8. **Every colour the surface uses is a token in `tokens.ts`, and the new `anl-` stylesheet is added
   to `panelBrandStandard.spec.ts`'s sheet list in the same commit that creates it.** ARM A globs a
   directory, so a sheet dropped beside the others is caught; the TypeScript arm is a named list and
   must be extended by hand.

### D.6 — Honesty rules for analytics (normative)

**Adopt `CoverageState` verbatim** (C.4) as the widget-result envelope — `MEASURED | COUNTED_ONLY |
NOT_MEASURED`, plus an unreachable-source list. Do not invent a second vocabulary. Then:

- **H1 — Every figure names its basis.** A widget renders the provenance of its number
  (`TakeoffLine.basis` and `qualifiers` already carry this) or renders nothing.
- **H2 — Empty, zero, not-computed and unreachable are FOUR states with four renderings.**
  `NOT_MEASURED` is **never** drawn as a zero — the engine's own type comment says so.
  ⛔ **This is already violated upstream:** `ScheduleExtractor.ts:238` emits
  `(r.computed?.area ?? 0).toFixed(2)`, turning "this room has no computed area" into the string
  `"0.00"` (L-2136). A widget must not read that field, and must not re-parse it.
- **H3 — No invented aggregates.** A widget may aggregate only over an axis the read model indexes.
  A derived ratio requires **both** operands `MEASURED`; if either is not, the ratio is
  `NOT_COMPUTED` — not an estimate, not a dash that looks like a zero.
- **H4 — Every figure is traceable to elements, and click-through is mandatory.**
  `TakeoffLine.elementIds` already carries the ids. **A number you cannot open is a number you cannot
  check**, and this surface exists to be checked.
- **H5 — A truncated scan is a refusal, not a number.** If any source is LRU-partial or unreadable,
  the widget reports incompleteness in the figure's own card. This is the most likely silent-
  undercount path in the product (C.3.2).
- **H6 — Capacity claims follow C66 §1.1** (D.4).
- **H7 — A refused widget names WHICH data is missing and WHY.** Not *"no data"* — *"a version diff
  needs two saved versions; this project has one."* An unactionable honest card is still a defect
  (memory: *refusing half needs its escape hatch*).
- **H8 — A widget that shows a number the model cannot support is worse than an empty card**, and in
  a review that is the finding, not a nitpick.

### D.7 — Where the Living Graph and Building Graph go

**Both move out of the GIS tab and into the Analysis surface.** The founder is right that they are
misplaced: they are *building* concerns hosted in the *site* tab. Today they are 2 of the **15**
actions in `apps/editor/src/ui/gis/gisActionRegistry.ts` — `graph.building` (`:351-359`, label
`Graph`, icon `⚛`, entry point `pryzmShowBuildingGraph`) and `graph.living` (`:361-369`, label
`Living Graph`, icon `✦`, entry point `pryzmOpenLivingGraph`) — in a group declared solely for them
(`graphs: 'Graphs'`, `:103`).

Migration, and it is deliberately small:

1. The `window` entry-point seam is **unchanged**. `installLiveGraphWiring()` keeps installing both
   overlays; only the host that calls them moves. Nothing about the overlays is rewritten.
2. `GIS_ACTIONS` loses the two rows; `GisActionGroup` (`:98`) loses `'graphs'`; `GIS_GROUP_LABEL`
   (`:103`) loses its row. The GIS registry goes to 13 actions and three groups.
3. The Analysis surface hosts them as a full-surface relational view plus an embeddable
   relationship-graph widget.

⛔ **BINDING PRECONDITION — the UBG must be StoreEventBus-maintained BEFORE the graphs move**
(L-2131). Moving a stale-by-construction view onto a surface the founder will read as live converts
a quiet defect into a visible one, and the move will be blamed for it. **The maintenance work is a
prerequisite of the migration, not a follow-up to it.**

⚠ **Deliberately NOT decided here: whether `graph.building` retires.** The registry's own comment
(`:340-349`) records that `living-graph/index.ts` states the Living Graph *"is intended to SUPERSEDE
the static ⚛ Graph view as the primary graph UI"*, that *"that reconciliation has never happened,
which is why the founder sees two adjacent pills for one concept"*, and that retiring
`graph.building` would delete a live capability. That is the founder's call and it stays his. The
migration is specified so the answer is **one edit either way**.

### D.8 — What this ADR does not touch

It does not contradict, and does not restate, any of: ADR-0058 (the UBG projects and never replaces —
**the read model in D.4 is a projection in exactly that sense**); ADR-0061 (the graph is a
bidirectional edit substrate whose edits re-run the *existing* deterministic engine — **Analysis
widgets are READ-ONLY and mint no second write path**); ADR-0067 (intent-first graph-IR); ADR-0068
(circulation-first five-graph model). Where a widget renders a graph, it renders **the** graph.

---

## Consequences

### Positive

- C27 §6 acquires a delivery vehicle and stops being seven unbuilt components.
- The single largest silent-undercount path in the product (C.3.2) gets named before a surface is
  built on top of it, rather than after a founder screenshot disagrees with a schedule.
- `computeTakeoff()`'s coverage model — already the best honesty vocabulary in the repo — becomes
  the product-wide one instead of one engine's private convention.
- One widget engine serves both the composable dashboard and the per-node C27 dashboards.
- The read model is reusable by the AI host: it is the aggregate layer `SemanticQueryEngine` lacks.

### Negative / deferred

- **A fourth workspace mode is real cost** and is only acceptable alongside the registry conversion
  (D.1). If that is skipped, this is a net loss to the shell.
- **A new read model is a new index to keep correct.** Its failure mode is a *wrong number*, which is
  worse than a missing one. It needs a differential test against a full scan from day one — the same
  discipline that makes the UBG's adapters idempotent (ADR-0058 §4).
- **The graphs cannot move until the UBG is maintained** (D.7). That is a dependency, not a nice-to-
  have, and it will make the migration look slower than it is.
- **Several headline widgets from the founder's screenshots need data that does not exist** — version
  diff, SIA 416, GFA, unit mix, tenure. The SPEC names the gap per widget rather than shipping a
  plausible-looking card over an absent model.

### Risks and mitigations

| Risk | Mitigation |
|---|---|
| The read model drifts from the stores it projects. | Differential test vs a full scan, run in CI at a fixed fixture; it is a projection, never a source of truth (ADR-0058 §1). |
| A widget renders an LRU-partial aggregate as a fact. | H5 + the query descriptor (D.3): a widget cannot reach `getState()`, so it cannot make this mistake by hand. |
| The categorical palette becomes a fifth rival palette. | Tokens only (`tokens.ts:276-277`), guarded by `panelBrandStandard.spec.ts` ARM C, extended in the same commit. |
| "Amazing colours" is read as licence to leave the palette. | D.5 states the exception narrowly, argues it from SC 1.4.1, and confines it to encoding. |
| Four modes crowd the pill bar. | §U.5 keeps absorption of `inspect`'s right half open rather than pre-empting it. |
| The founder sees a dashboard and assumes every card is live. | H1/H2/H7: every card states its coverage; a stale or unmeasured card says so on its face. |

---

## §U — Deliberately UNDECIDED

These are open on purpose. Each is a decision this lane could have made and had no basis to make;
writing a preference here would have been a guess wearing an ADR's authority.

- **§U.1 — Does `graph.building` retire in favour of `graph.living`?** The founder's call (D.7). The
  GIS registry has been carrying both, with the reconciliation noted and unmade, since it was
  written. The migration is specified so the answer costs one edit.
- **§U.2 — The eight categorical hex values.** Constraint and verification are specified (D.5);
  values are chosen in the implementing commit and must be **CVD-simulated before** they are
  committed, not after. Naming them here would be the exact defect this document is strictest about.
- **§U.3 — Which measured-area standard PRYZM adopts** (IPMS / RICS Code of Measuring Practice /
  SIA 416 / per-jurisdiction). This is a product and jurisdiction decision, not an architectural one,
  and **every** GFA, NIA, efficiency and unit-mix widget is downstream of it. Until it is answered,
  those widgets are Tier 3 and refuse. There are **zero** `SIA` occurrences in `packages/` or
  `apps/editor/src`.
- **§U.4 — Whether the read model is a new `@pryzm/analysis-read-model` package or lives beside
  `SemanticIndex` in `core-app-model`.** Both satisfy D.4. The layer question
  (`core-app-model` already sits at L2 while importing L4 — CLAUDE.md) argues for a new package; the
  StoreEventBus coupling argues for the existing one. Decide with the implementing lane.
- **§U.5 — Whether `analysis` eventually absorbs `inspect`'s right half (`AuditStack`).** Four pill-
  bar modes is a lot. Absorption is plausible and would be a strict simplification, but `AuditStack`
  is live, four-zone and unmeasured by this lane — proposing its removal would repeat the
  `PropertyInspector` error C27 §0.0 records.
- **§U.6 — What lane DATA1's `mediciones` bucket (L-2003) finally exposes.** It was in flight
  (untracked `buckets/MedicionesBucket.ts`, modified `DataWorkbench.ts`) while this was written, and
  it wires `computeTakeoff()` / `applyRates()`. **The 4D/5D widget rows in the SPEC stand on its
  finding and are marked accordingly.** This lane deliberately did not re-measure it.
