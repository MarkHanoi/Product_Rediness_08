# SPEC — Analysis Surface & Widget Catalogue

**Status.** ⭐ **PARTIALLY IMPLEMENTED (2026-08-21, lane ANLZ2).** Was *"DRAFT — nothing here is built"*; that line is now false and is corrected in place rather than left to rot. **Built:** the `analysis` workspace mode (F4), the mode registry §D.1 made a precondition, the categorical palette §6 required, the query-descriptor substrate, eleven widgets, and five T3 rows shipping as REFUSALS. **Not built, and named:** the O(Δ) read model (L-3004), snapshot-persisted layouts (L-3007), the UBG maintenance §4.3 depends on entirely (L-2131) and therefore the three relational widgets W12–W15, and W26/W27. Per-row state is in the catalogue below. **Read the code and [ISSUE-LOG L-3000…L-3013](../../04-reference/ISSUE-LOG.md), not this line.**
**Implemented at.** `apps/editor/src/ui/analysis/` · sheet `apps/editor/src/ui/styles/panels/analysisSurface.ts` · commits `76d81209`, `bf80949e`, `4205c5c9`, `b9cd03a9`.
**Governed by.** [ADR-0343](../../02-decisions/adrs/ADR-0343-analysis-surface-and-composable-widget-model.md) — the surface, widget model, query substrate, colour doctrine and honesty rules. **This SPEC does not restate those decisions; it enumerates the catalogue that follows from them.**
**Contracts.** [C27 §6](../../02-decisions/contracts/C27-BIM3-INSPECT-MODEL.md) (this SPEC is its delivery), [C10 §1](../../02-decisions/contracts/C10-PERFORMANCE-AND-OBSERVABILITY.md), [C66 §1.1](../../02-decisions/contracts/C66-CONCURRENCY-AND-SCALE.md), [C06](../../02-decisions/contracts/C06-UI-SHELL-AND-TOOLS.md), [C05](../../02-decisions/contracts/C05-PERSISTENCE-AND-FILE-FORMAT.md), [C03](../../02-decisions/contracts/C03-SCHEMAS-COMMANDS-AND-STATE.md).
**Owner.** `apps/editor/src/ui/analysis/` — built. CSS prefix **`anl-`**, claimed in the sheet's own header (`ui/styles/panels/analysisSurface.ts`) and in `AnalysisSurface.ts`, which is where every other prefix in this repo is claimed.
> ⚠ **This line used to say the prefix would be claimed in "C06's prefix table". THERE IS NO SUCH TABLE.** Measured 2026-08-21, lane ANLZ2: `grep -n "prefix" docs/02-decisions/contracts/C06-UI-SHELL-AND-TOOLS.md` → **0 hits** across 969 lines; `wmb-`, `aud-`, `dw-` → 0 hits each. The convention this repo actually follows is a `CSS prefix:` line in the owning file's header. Recorded rather than silently satisfied — minting a new section inside a governing contract is not this lane's remit, and a SPEC instruction pointing at an artefact that does not exist is the defect shape CLAUDE.md keeps logging.
**Issue log.** Scoping: L-2130 … L-2138 (ANLZ1). Implementation: **L-3000 … L-3013** (ANLZ2).

---

## §1 — Scope tiers

Every widget in §4 carries exactly one tier. **The tier is about DATA, not effort.**

| Tier | Meaning |
|---|---|
| **T1** | Deliverable on today's substrate. The data exists and is reachable; only the widget and its rendering are missing. |
| **T2** | Needs the analysis read model (ADR-0343 §D.4) or a wiring step, but **no new data**. The facts exist; nothing indexes or exposes them. |
| **T3** | **Needs data that does not exist in this repo.** A T3 widget ships as a REFUSAL that names the missing model (H7) — never as a plausible-looking card. |

`T1*` marks a widget whose data exists but whose source is **stale by construction** (the UBG,
L-2131) — T1 the moment that source is maintained, and not before.

---

## §2 — The widget-result envelope (normative)

Every widget returns the same envelope, and its `coverage` vocabulary is **adopted verbatim** from
`packages/core-app-model/src/quantities/TakeoffTypes.ts:129-164` rather than reinvented:

```
AnalysisResult {
  figures:          Figure[]          // each: value, unit, basis, elementIds
  coverage:         CoverageRow[]     // MEASURED | COUNTED_ONLY | NOT_MEASURED + note
  unreachable:      string[]          // sources that could not be read AT ALL
  computedAt:       number
  computedOverCount: number           // what the figure was actually computed over
  complete:         boolean           // false ⇒ computedOverCount is a LOWER BOUND
}
```

- `complete: false` is the LRU-partial case (ADR-0343 §D.6 H5). **A widget with
  `complete: false` MUST say so on the card's face.** It may not round, extrapolate, or omit.
- `NOT_MEASURED` is **never** rendered as `0` — the engine's own type comment already binds this.
- `unreachable` is distinct from empty. *"The wall store was not published"* and *"there are no
  walls"* are different answers and must read differently.

### §2.1 — The four states, and how each renders

| State | Card renders |
|---|---|
| **Measured** | the figure, its unit, and a click-through to its elements |
| **Empty** (a real answer) | `0` **with** the axis named — *"0 roofs on this level"* |
| **Not computed / not measured** | the reason, never a number — *"roof area is not measured; see coverage"* |
| **Unreachable** | which source, and that the figure is therefore unknown — never a dash that reads as zero |

---

## §3 — Cost model

Per ADR-0343 §D.4. Every catalogue row states its **query cost** as one of:

| Cost | Meaning |
|---|---|
| **O(1)** | a read-model index lookup; refreshes inside one frame |
| **O(k)** | proportional to the result set (k groups / k rows), not the model |
| **O(n)** | proportional to element count — permitted **only** on a manual refresh, never `on-commit` |
| **O(n·m)** | a scan with a per-element derivation (e.g. take-off). **Manual refresh only, and it must show a progress state.** |

⚠ **`O(n)` today is not the textbook `O(n)`.** `FloorStore.getAll()`
(`packages/core-app-model/src/stores/FloorStore.ts:373`) `structuredClone`s every record on each
call, and `getByLevel` (`:377-379`) is `getAll().filter(...)`. A "cheap" group-by over five stores is
five deep clones of the model. **This is the single largest reason the read model exists.**

⚠ Every cost figure below is **estimated from the code path, not benched.** Per C66 §1.1, no row may
be described as supported at any document size until it is benched. **All rows are CLAIMED.**

---

## §4 — The widget catalogue

Grouped by the founder's reference screenshots (Speckle Workspace dashboards, 2026-08-21).

### §4.1 — Composition: counts and rollups

| # | Widget | Data source | Query cost | Tier | Honesty rule / what it refuses |
|---|---|---|---|---|---|
| W1 | **Category report** (donut) — element count by kind | read model `kind` index | O(1) | **T2** | Refuses if `complete:false`; renders the LRU-partial warning rather than a total. There is **no category index on any element store today** — this is the whole T2 gap. |
| W2 | **Family / type report** (donut) — count by element type | read model `typeId` index + the per-type catalogue stores | O(1) | **T2** | An element with no resolved type is its own slice, `untyped`, **never folded into the largest**. |
| W3 | **Group by level** (bar) — count by level | read model `levelId` index | O(1) | **T2** | Only `WallStore` has a level index today (`packages/geometry-wall/src/WallStore.ts:168`); every other `getByLevel` is a linear filter. Elements with no level are a named `unassigned` bar, never dropped. |
| W4 | **Levels list** with per-level counts | `LevelStore` + W3 | O(k) | **T2** | A level with zero elements renders `0` (a real answer); a level whose store is unreachable renders unknown. |
| W5 | **Element count KPI tile** | read model | O(1) | **T2** | ⛔ The headline number. If `complete:false` it renders **"≥ N"**, not **"N"** (L-2132). |
| W6 | **Selection breakdown** — composition of the current selection | `SelectionStore` + read model | O(k) | **T2** | Empty selection is an empty state, not a zeroed chart. |

### §4.2 — Quantities, materials and cost

| # | Widget | Data source | Query cost | Tier | Honesty rule / what it refuses |
|---|---|---|---|---|---|
| W7 | **Material stats** (m³ / m² / m per material) | `computeTakeoff()` → `TakeoffLine{unit}` (`packages/core-app-model/src/quantities/QuantityTakeoff.ts:395`) | O(n·m) — manual refresh | **T1** | The engine's `coverage` is rendered **beside** the table, not hidden behind a tooltip. `kg` is documented by the engine as produced by no measurer — it must not appear as a zero. |
| W8 | **Material map** (treemap) | same take-off lines as W7 | O(k) after W7 | **T1** | Area encodes quantity in ONE unit; mixing m² and m³ in one treemap is forbidden — the unit is in the title. **No treemap renderer exists in the repo** — this is build work, not a data gap. |
| W9 | **Take-off coverage card** | `TakeoffResult.coverage` + `unreadableStores` | O(1) after W7 | **T1** | ⭐ This widget's entire job is H2. It is **not optional chrome** — every quantity widget links to it. |
| W10 | **Cost / 5D rollup** | `applyRates()` / `CostModel.ts` (193 LOC, `:103`) | O(k) after W7 | **T2** | Rates are an input, not a fact: the card names the rate set and its date, or refuses. **Coordinate with lane DATA1** — its `mediciones` bucket (L-2003) wires this engine. |
| W11 | **Room / area schedule** | `ScheduleExtractor` (`packages/core-app-model/src/schedules/ScheduleExtractor.ts`) | O(n) | **T2** | ⛔ **MUST NOT read `ScheduleExtractor`'s string fields.** `:238` emits `(r.computed?.area ?? 0).toFixed(2)` — an absent area becomes the string `"0.00"` (L-2136). This widget needs a numeric accessor that preserves absence; until it exists, the widget is T3 and refuses. |

### §4.3 — Relational: the graphs

| # | Widget | Data source | Query cost | Tier | Honesty rule / what it refuses |
|---|---|---|---|---|---|
| W12 | **Relationship graph** — nodes + typed edges (`CONNECTED_TO`-class) | UBG `allNodes()` / `allEdges()` | O(V+E) | **T1\*** | ⛔ Blocked on L-2131 — the UBG is rebuilt only by the two graph overlays. Until it is StoreEventBus-maintained the card must **timestamp its data** and say when it was last projected. |
| W13 | **Living Graph** (force-directed, five layers) | as W12, per [SPEC-LIVING-BUILDING-GRAPH](./SPEC-LIVING-BUILDING-GRAPH.md) | O(V²) per sim step | **T1\*** | Already shipped as an overlay; this is a **host change only** (ADR-0343 §D.7). Rooms with invalid boundaries are skipped, per that SPEC's §3 bug-avoidance contract. |
| W14 | **Model checker** — rule violations | UBG `violates` edges ← `ConstraintEngine` via `provideLiveGraphSources` (`ui/layout/installLiveGraphWiring.ts:47`) | O(E) | **T1\*** | ⛔ **"Zero violations" and "the constraint source was absent" are the SAME VALUE here** and must not be. If `provideLiveGraphSources` did not attach, the card says *unknown*, never *pass*. |
| W15 | **Circulation / adjacency metrics** | UBG `adjacentTo` / `circulatesVia` | O(E) | **T1\*** | Per-relation-type queries have **no index** on `SemanticGraphManager` (L-2138) — a whole-model type query is `getAll()` + filter. Fine at project scale, stated so it is not assumed indexed. |

### §4.4 — Change and time

| # | Widget | Data source | Query cost | Tier | Honesty rule / what it refuses |
|---|---|---|---|---|---|
| W16 | **Change table** — Type / Previous / Current / Δ / Status | — | — | **T3** | ⛔ **NAMED GAP: version-to-version element identity.** `ComparisonEngine.getDeltaMap()` (`packages/core-app-model/src/comparison/ComparisonEngine.ts:93`) compares *planned vs actual*, not *version N vs N+1*; `TemporalGraph` records mutations, which is a different question. A cross-version diff needs stable element ids **across saved versions** plus a version index. Refuses with: *"a diff needs two saved versions and stable ids across them."* |
| W17 | **Session history / mutation log** | `temporalGraphManager` (already backing `DesignHistoryPanel`) | O(k) | **T1** | It is a **session** log. The card must not be titled "version history" — that is W16, and it does not exist. |

### §4.5 — Developer / area analytics (the SIA 416 + GFA family)

**All of §4.5 is T3 and blocked on one decision: ADR-0343 §U.3, which measured-area standard PRYZM
adopts.** They are enumerated so the gap is named per widget rather than as one shrug.

| # | Widget | Blocking gap | Tier |
|---|---|---|---|
| W18 | **GFA extractor** — Total GFA / NIA | No measured-area standard is encoded. `targetGFA` (`ScheduleExtractor.ts:574`) is a **target**, not a measurement — rendering it as GFA would be H3. | **T3** |
| W19 | **GEA : NIA ratio** | Both operands are W18. H3: a ratio needs **both** operands `MEASURED`. | **T3** |
| W20 | **SIA 416 surface table** per storey | **Zero `SIA` occurrences in `packages/` or `apps/editor/src`.** Needs an SIA 416 category (SU/SP/SD/SC/SI) mapping per space, and no space carries one. | **T3** |
| W21 | **SIA ratio gauges** (SU/SP, SD/SP, SC/SP, SI/SP) | W20. | **T3** |
| W22 | **Unit mix / bedroom distribution** | Bedroom count is derivable from room types (would be T2); **the unit model that groups rooms into sellable units is the gap**. | **T3** |
| W23 | **Tenure distribution / affordable mix %** | ⛔ **Tenure has no model anywhere in this repo.** It is not derivable from geometry, rooms, or program. It is authored data that does not exist. | **T3** |
| W24 | **Area efficiency metrics** | W18 + W22. | **T3** |
| W25 | **Unit mix configurator** (write path) | W22, **and** it is a *write* surface — out of scope for a read-only Analysis surface (ADR-0343 §D.3). If wanted, it is an ADR-0061-shaped per-node delta re-running the existing engine, **never a parallel mutator**. | **T3** |

### §4.6 — Environmental

| # | Widget | Data source | Query cost | Tier | Note |
|---|---|---|---|---|---|
| W26 | **Sun hours / solar heat** | `@pryzm/solar-analysis` | unknown | **UNVERIFIED** | ⚠ **NOT MEASURED IN THIS LANE.** Memory records this as shipped (C21 / ADR-0074); this lane did not open it. **Do not plan against this row until it is measured.** |
| W27 | **Climate charts** (sun path, wind rose) | `ui/climate/climateChartData.ts` (267 LOC, pure) | O(1) | **T1** | Already drawn as hand-built SVG in `ClimatePanel.ts` / `FormaSiteAnalysisControls.ts`. Reuse the pure data module; **do not port the hard-coded `ACCENT`/`WIND_BAND_COLORS` literals** (L-2135). |

---

## §5 — Rendering

- **Chart.js 4.5.1 is the only charting dependency in the workspace** — declared once, at the **root**
  `package.json:255`, **not** in `apps/editor/package.json`, which `AnalyticsPanel.ts` resolves by
  hoisting (L-2134). **Fix the manifest before adding a second consumer.** There is no d3, echarts,
  recharts, plotly, visx, uplot, cytoscape or force-graph anywhere in the workspace.
- **Three idioms exist today and none is a house standard**: Chart.js canvas (exactly one file,
  `AnalyticsPanel.ts`); hand-built SVG via `createElementNS` (`ClimatePanel.ts`,
  `FormaSiteAnalysisControls.ts`, `RoomGraphPanel.ts`, `GridManagerPanel.ts`); and Canvas-2D
  overlays (`BuildingGraphOverlay.ts:182`, `LivingGraphOverlay.ts:313`). **This SPEC does not pick
  one** — it requires that whichever is picked is picked **once**, and that every colour it uses is a
  token.
- **No widget calls `requestAnimationFrame`** (P3). No widget imports `* as THREE` (P2).
- **No `(window as any)`** (P4). Note that the UBG seam is reached today via typed `window`
  interface extensions, not casts; a widget consumes it through the read model or a typed accessor,
  never by widening `window`.

---

## §6 — Colour (implementation of ADR-0343 §D.5)

| Role | Source | Status |
|---|---|---|
| Chrome / accent | `--app-accent` `#6600FF` (`tokens.ts:46`) | exists |
| Sequential ramp | `DISCOVERY_RAMP` `rgb(216,203,255)` → `#6600FF` (`ui/inspect/audit/heatRamp.ts:28-33`) | **exists — promote into `tokens.ts`; do not mint a fourth ramp** (L-2135) |
| Diverging (Δ) | `--app-status-error-ink` `#b91c1c` → `--app-border` `#dde3f0` → `--app-status-success-ink` `#15803d` (`tokens.ts:334-342`) | exists |
| **Categorical, 8 series** | `--app-cat-1 … --app-cat-8` | ✅ **MINTED 2026-08-21 (L-3001)** — brand accent + Okabe-Ito with its `#0072B2` replaced by `#005F73`. CVD-simulated BEFORE commit (Machado 2009 severity 1.0, pairwise CIEDE2000): global floor **ΔE00 11.13** under tritanopia. Guard `ui/styles/__tests__/chartPalette.spec.ts` re-derives it from the shipped tokens on every run. |
| **Categorical neutral** | `--app-cat-unassigned` | ✅ **MINTED (L-3001)** — NOT in the rotation. `unassigned` / `untyped` / `unmeasured` always take it, whatever their index, so absence cannot borrow a category's identity. |

**Binding on the commit that mints the categorical scale:**

1. Values live in `apps/editor/src/ui/styles/tokens.ts` and nowhere else — that file states at
   `:276-277` that adding a value there is the only sanctioned way to introduce a colour.
2. The new `anl-` stylesheet is added to `apps/editor/src/ui/styles/__tests__/panelBrandStandard.spec.ts`
   in the **same commit**. ARM A globs a directory (a new sheet is caught automatically); the
   TypeScript arm keys off a named directory list and must be extended by hand.
3. **The eight are CVD-simulated (deuteranopia, protanopia, tritanopia) BEFORE they are committed**,
   and the check is added to the guard. ⚠ **This SPEC deliberately does not name the eight hexes**
   (ADR-0343 §U.2) — asserting CVD-safety without simulating it is precisely the defect this
   document exists to prevent.
4. Contrast is audited through `packages/a11y-tokens`. ⚠ Note `--app-text-muted` is recorded at
   **3.47:1 on white**, under AA — a known product-wide open item (L-1744), not introduced here.
5. **Colour is never the only channel** (SC 1.4.1): every series carries a label or pattern.
6. **`#0d1117` (`--app-canvas-bg`) never appears in a panel.** No black.
7. **Existing rival palettes are not extended.** `DataVisualizerService.ts:76-122` holds 37 raw hexes
   (`OCCUPANCY_COLORS`) and `GHOST_COLOR = '#9333ea'` — Tailwind purple-600, the exact rival
   `tokens.ts:260` names (L-2137). `AnalyticsPanel.ts:31-38` holds a third copy of the sync-state
   table in hex (L-2130). **A widget reads `syncStateColours.ts`, never any of these.**

---

## §7 — Persistence

Layouts are project content, not chrome: they persist in the `.pryzm` snapshot (C05), **not**
`localStorage`. Scope key is `(projectId, layoutId)`; the seven C27 §6 dashboards ship as built-in
presets (ADR-0343 §D.2). A layout referencing a widget kind the build does not know renders a named
placeholder — it is **never** silently dropped, because a dropped widget is a lost decision.

---

## §8 — What this SPEC does not cover

- The read model's internal design — ADR-0343 §D.4 states its contract and §U.4 leaves its home open.
- The mode-registry conversion that ADR-0343 §D.1 makes a precondition.
- The UBG's StoreEventBus maintenance (L-2131), which §4.3 depends on entirely.
- Anything DATA1 owns under `apps/editor/src/ui/dataworkbench/**`.
