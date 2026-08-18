# C27 — BIM 3.0 Inspect Model

> **Stamp**: 2026-05-31 · **Status**: DRAFT
> **Scope**: genuinely new spatial-intelligence inspection surface — master tree (Site → Building → Level → Apartment → Room → ElementType → ElementInstance), selection-driven isolation via `packages/visibility/` (P7), graphical dashboards per node type. Coexists with `plugins/ifc-inspector/` (which becomes the element-instance sub-panel for Pset editing) and supersedes the flat `apps/editor/src/ui/PropertyInspector.ts`.
> **Depends on**: [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) (commands + state), [C09](C09-AI-AND-VISIBILITY-INTENT.md) (visibility intent — P7), [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) (command authoring), [C04](C04-RENDERING-AND-SCHEDULING.md) (isolation animator subscribes FrameScheduler).
> **Downstream**: [C28](C28-DATA-PANEL-AND-AUTOMATION.md) (Data grid selection sync), [C24](C24-SHEET-COMPOSITION-ENGINE.md) (Sheet viewport view picker reuses tree).
> **Key principles**: **P3** (isolation animator subscribes FrameScheduler), **P6** (commands only), **P7** (isolation IS a visibility intent — not a parallel flag), **P8** (every Inspect operation has a span).
> **Master plan**: [PRYZM3-MASTER-IMPLEMENTATION-PLAN-2026-05-31.md Part V](../03-execution/plans/master-implementation-plan.md).
> **Prior-art**: [PRYZM3-PRIOR-ART-AUDIT-2026-05-31.md §3.5](../03-execution/status/prior-art-audit-2026-05-31.md). **Verdict: GENUINELY NEW** with a migration plan for existing `PropertyInspector.ts` (~~80 files~~ — **RETRACTED, the real figure is 14; see §0.0**).


---

## §0.0 — ⛔ CORRECTION 2026-08-18: §9 ORDERS A LIVE COMPONENT DELETED IN FAVOUR OF A REPLACEMENT THAT DOES NOT EXIST

**Do not execute §9 Phases γ or δ.** They deprecate and then *remove* `PropertyInspector` "in
favour of `ElementInstanceDashboard`". Measured at HEAD, **2026-08-18**:

| Claim | Where | Measured |
|---|---|---|
| `ElementInstanceDashboard` is the replacement | §6 table, §9 Phase γ | **ZERO occurrences in any code file.** `grep -rIl ElementInstanceDashboard` matches **3 files, all Markdown** — this contract, the amendment register, and a superseded 2026-06-01 plan. |
| the seven §6 dashboards | §6 | `ls apps/editor/src/ui/inspect/dashboards` → **No such file or directory**. **None of the seven was built.** |
| `SpatialRelationshipResolver` (§5) | `packages/spatial-index/` | **ZERO code occurrences** (4 matches, all Markdown). `IsolationStateStore` is specified as *derived from* it. |
| `InspectBridge` (§5) | `apps/editor/src/engine/` | **ZERO code occurrences** (Markdown only). |
| *"`PropertyInspector.ts` (80 files)"* | §0 prior-art line, §9 opening | **WRONG BY ~6×.** `ls apps/editor/src/ui/property-inspector/*.ts \| wc -l` → **13**, plus `apps/editor/src/ui/PropertyInspector.ts` = **14**. The migration was sized against a number six times the real one. |

⛔ **`PropertyInspector` is LIVE on three independent axes**, and a single import census sees only
the first:

1. **import axis** — it hosts 13 live specialist submodules under
   `apps/editor/src/ui/property-inspector/` (`WallLayerSection`, `SlabLayerSection`,
   `FloorPropertySection`, `CeilingPropertySection`, `FurniturePropertySection`,
   `MaterialDispatch`, `RoomPathfinderPanel`, …), each with live callers.
2. **build-graph axis** — named in `apps/editor/migrations/sunset-pryzm1.json:50` as
   `"file": "src/ui/PropertyInspector.ts"`. **No import census sees a JSON manifest.**
3. **call axis** — mirrored by `apps/editor/src/ui/property-panel/PropertyPanelAdapter.ts:5,60,68`
   (*"Mirrors `PropertyInspector.hide()`"*, *"Mirrors `PropertyInspector.update(obj)`"*).

This is defect shape **B — one-axis reachability**: the "zero importers" style count is arithmetically
correct and the deletion conclusion drawn from it is not.

### What C27 has ALREADY SHIPPED while labelling it "(NEW)"

The `(NEW)` markers in §5's table are **stale, not aspirational** — five of the named artefacts
exist, with tests:

- `packages/stores/src/InspectSelectionStore.ts` (+ `packages/stores/__tests__/InspectSelectionStore.test.ts`)
- `packages/stores/src/IsolationStateStore.ts` (+ `packages/stores/__tests__/isolationStateStore.test.ts`)
- `packages/visibility/src/intents/IsolationIntent.ts`
- `packages/renderer-three/src/IsolationAnimator.ts` (+ `packages/renderer-three/__tests__/isolationAnimator.test.ts`)
- `packages/schemas/src/inspect/selection.ts`, and a live `apps/editor/src/ui/inspect/ModelTree.ts`

**Genuinely absent: `SpatialRelationshipResolver` and `InspectBridge`** — which is precisely the
edge C27 §5 says `IsolationStateStore` derives from, so the isolation tiering that ships today is
not the one this contract specifies. That, not the PropertyInspector deletion, is the real open
work.

**Re-measure rather than trusting this table** — every count above rots:

```
grep -rIl "ElementInstanceDashboard" --exclude-dir=node_modules --exclude-dir=.git .
ls apps/editor/src/ui/property-inspector/*.ts | wc -l
ls apps/editor/src/ui/inspect/dashboards
```

**AMENDMENT:** §9 Phases γ and δ are **SUSPENDED** until `ElementInstanceDashboard` exists and
reaches parity on all three axes above; the *"(80 files)"* figure is **retracted** in both places
it appears; §5's `(NEW)` markers are retracted for the five shipped artefacts and stand only for
`SpatialRelationshipResolver` and `InspectBridge`. **Status remains DRAFT** — nothing here is
ACTIVE, and per the README status ladder a DRAFT contract binds nothing, which is the only reason
this deletion order has not yet been executed.

---

## §1 — Invariants

### §1.1 — Inspect is a spatial-intelligence surface

The Inspect tab is **not a property list**. It is a hierarchical model-tree + viewport-isolation + graphical-dashboard surface. The user navigates the model hierarchy by tree node; selection drives viewport isolation (rest of model semi-transparent or hidden); the data panel transforms per node type into a rich graphical dashboard.

### §1.2 — One model-tree component

Only **one** model-tree component SHALL exist in the codebase. Duplicate trees (e.g. a sheet picker tree + a separate inspect tree) are a CI violation. Reusers consume the same `<ModelTreeComponent>` and bind a different `onSelectNode` handler.

CI gate: new `tools/ga-gate/check-model-tree-count.ts`.

### §1.3 — Isolation is a visibility intent

Selection-driven isolation routes through `packages/visibility/` (P7). It is NOT a parallel UI flag, NOT direct opacity mutation, NOT a custom `mesh.material.opacity = 0.2` write somewhere in editor code. The `IsolationVisibilityIntent` is dispatched into `packages/visibility/` and applied by `packages/scene-committer/` via THREE material opacity ([C04 §3](C04-RENDERING-AND-SCHEDULING.md)).

CI gate: new `tools/ga-gate/check-visibility-intent.ts` — any direct `material.opacity = N` outside `IsolationAnimator` is a violation.

### §1.4 — Isolation animator subscribes to the frame bus

The fade transition (200 ms on isolation change) MUST subscribe to `FrameScheduler.onFrame` at `render` priority. It MUST NOT call `requestAnimationFrame` directly. Preserves P3.

For models with > 1000 isolated elements, the animator MUST stagger fades by spatial cluster (close-to-camera first) to avoid frame-budget overruns.

### §1.5 — Commands flow through commandBus

All Inspect mutations (`inspect.selectNode`, `inspect.isolate`, `inspect.exitIsolation`, `inspect.expandTree`, `inspect.focusElement`) MUST dispatch through `commandBus` per P6. UI MUST NOT mutate `InspectSelectionStore` directly.

### §1.6 — Every Inspect operation has a span

Per P8, every exported Inspect operation emits an OpenTelemetry span. Span name: `pryzm.inspect.<verb>` (e.g. `pryzm.inspect.isolateNode`, `pryzm.inspect.selectNode`).

---

## §2 — Model tree hierarchy

Six levels, lazy-loaded:

| Level | Node type | Source of truth | On select → isolation |
|---|---|---|---|
| 0 | Project / Site | `SiteModelStore` ([C12](C12-GEOSPATIAL.md)) | No isolation (all visible) |
| 1 | Building | `BuildingStore` (TBD) | Other buildings dimmed (30%) |
| 2 | Level / Floor | `LevelStore` (existing) | Other levels hidden; level plan highlighted |
| 3 | Apartment / Unit | `ApartmentParametersStore` (D-α-1, existing) | Apartment in colour; other apartments dimmed (20%) |
| 4 | Room / Space | `RoomStore` (existing — `plugins/rooms/` S25) | Room full opacity; rest dimmed (15%) or hidden |
| 5 | Element Type | `ElementStore` (existing) | All elements of type highlighted; others dimmed |
| 6 | Element Instance | `ElementStore` (existing) | Single element highlighted; rest 10% opacity |

Tree is virtualised — only render expanded branches. Performance target: tree render at 10k elements < 100 ms.

---

## §3 — Schema (in `packages/schemas/src/inspect/`)

| Schema | Owns |
|---|---|
| `InspectSelection` | `{ type: 'project' \| 'building' \| 'level' \| 'apartment' \| 'room' \| 'elementType' \| 'elementInstance', id: string, level: 0..6, breadcrumb: string[] }` |
| `IsolationTier` | `'FULL' \| 'DIMMED' \| 'HIDDEN'` with optional opacity `[0, 1]` for DIMMED |
| `IsolationOverride` | per-element `{ elementId: string, tier: IsolationTier }` |
| `SpatialRelationship` | `'SELECTED' \| 'PARENT' \| 'SIBLING' \| 'CHILD' \| 'UNRELATED'` (computed by `SpatialRelationshipResolver`) |

---

## §4 — Stores

| Store | Path | Owns |
|---|---|---|
| `InspectSelectionStore` | `packages/stores/src/InspectSelectionStore.ts` (NEW) | Currently-inspected node `{ type, id, level, breadcrumb }`. Subscribes to model-tree selection AND viewport selection (bidirectional sync). |
| `IsolationStateStore` | `packages/stores/src/IsolationStateStore.ts` (NEW) | Current isolation tier per element. Derived from `InspectSelectionStore` + `SpatialRelationshipResolver`. |

---

## §5 — Isolation engine

### §5.1 — `IsolationVisibilityIntent`

`packages/visibility/src/intents/IsolationIntent.ts` (NEW). Per-element override map. Tiers by spatial relationship to the selected node:

- `SELECTED`: 100% opacity.
- `PARENT`: 70% opacity.
- `SIBLING`: 20% opacity (configurable per level).
- `CHILD`: 100% opacity.
- `UNRELATED`: 10% opacity OR `HIDDEN` (user-configurable; default DIMMED).

### §5.2 — `SpatialRelationshipResolver`

`packages/spatial-index/src/SpatialRelationshipResolver.ts` (NEW). For a given selection, computes the relationship for every element. Performance target: < 10 ms for 10k elements (using the existing R-tree index).

### §5.3 — `InspectToViewportBridge`

`apps/editor/src/engine/InspectBridge.ts` (NEW). Listens to `InspectSelectionStore` → invokes `SpatialRelationshipResolver` → dispatches `IsolationVisibilityIntent` → triggers `scene-committer` refresh.

### §5.4 — `IsolationAnimator`

`packages/renderer-three/src/IsolationAnimator.ts` (extension). 200 ms smooth fade. Subscribes to `FrameScheduler.onFrame('render')`. Stagger fades for > 1000 elements by spatial cluster.

---

## §6 — Graphical data dashboards

Per-node-type dashboards in `apps/editor/src/ui/inspect/dashboards/`:

| Node | Dashboard component | Data source |
|---|---|---|
| Project / Site | `ProjectDashboard` | Project metadata + IFC export status + location summary |
| Building | `BuildingDashboard` | Stacked floor-area bar + room type donut + element count by category |
| Level | `LevelDashboard` | Colour-coded floor plan mini-map + area-breakdown sunburst + furniture density heatmap |
| Apartment | `ApartmentDashboard` | Apartment plan with room labels + radar chart of cognition-stack objective vector + adjacency diagram |
| Room | `RoomDashboard` | Isolated 3D room view + daylight gradient + sightline graph (L5-ε-1) + area-vs-target gauge + furniture inventory + adjacency list |
| Element Type | `ElementTypeDashboard` | Count-over-levels bar + distribution histogram + compliance pass/fail pie |
| Element Instance | `ElementInstanceDashboard` | 3D isolated view + Pset tree (via `plugins/ifc-inspector/`) + parameter list + history changelog |

---

## §7 — Commands

| Command | Effect |
|---|---|
| `inspect.selectNode` | Set `InspectSelectionStore.selection` to `{ type, id }`. Triggers isolation bridge + dashboard update. |
| `inspect.isolate` | Apply `IsolationVisibilityIntent` for current selection. |
| `inspect.exitIsolation` | Clear isolation; restore default visibility. |
| `inspect.expandTree` | Expand tree branches up to a depth. |
| `inspect.collapseTree` | Collapse to root. |
| `inspect.focusElement` | Scroll viewport camera to selected element + isolate. |

All commands open OTel spans per P8.

---

## §8 — Cross-tab sync

The Data tab ([C28](C28-DATA-PANEL-AND-AUTOMATION.md)) reads `InspectSelectionStore`. Selecting a node in Inspect filters the Data grid to that node's elements. Selecting a row in Data sets `InspectSelectionStore` (bidirectional).

The Sheets tab ([C24](C24-SHEET-COMPOSITION-ENGINE.md)) reuses the model tree as the viewport view picker. Dragging a room node onto a sheet creates a viewport bound to that room's view.

---

## §9 — Migration plan for existing PropertyInspector

`apps/editor/src/ui/PropertyInspector.ts` + `apps/editor/src/ui/property-inspector/` (~~80 files~~ — **RETRACTED: 13 + 1 = 14, measured `ls apps/editor/src/ui/property-inspector/*.ts | wc -l` → 13; see §0.0**) currently implement a flat property inspector with element-specific sections. Migration:

1. **Phase α**: keep `PropertyInspector` working alongside new Inspect tab. New tab is opt-in (toggle).
2. **Phase β**: integrate `plugins/ifc-inspector/` as the element-instance dashboard (per §6 row 7).
3. **Phase γ** — ⛔ **SUSPENDED per §0.0: the replacement has zero code occurrences.** deprecate `PropertyInspector` in favour of `ElementInstanceDashboard`. Move the per-element-type specialist sections (e.g. `WallLayerSection`, `SlabLayerSection`) into composable dashboard components.
4. **Phase δ** — ⛔ **SUSPENDED per §0.0: do not delete a component live on three axes.** remove `apps/editor/src/ui/PropertyInspector.ts` once feature parity reached + user feedback positive.

---

## §10 — CI gates

| Gate | What it checks | Implementation |
|---|---|---|
| One model tree | Only one `ModelTreeComponent` import path | NEW `tools/ga-gate/check-model-tree-count.ts` |
| Visibility intent only | No direct `material.opacity` outside `IsolationAnimator` | NEW `tools/ga-gate/check-visibility-intent.ts` |
| Commands only | UI dispatches via `commandBus` | extend existing |
| Contract presence | Every new file references C27 | extend existing |
| Inspect schemas purity | `packages/schemas/src/inspect/` has no I/O / DOM / THREE | extend existing |

---

## §11 — NFT targets

| NFT | Target | Bench |
|---|---|---|
| Tree render at 10k elements | < 100 ms | `inspect-tree.bench.ts` (new) |
| Isolation engaged | < 50 ms | `inspect-isolate.bench.ts` (new) |
| Smooth fade transition | 60 FPS (no dropped frames) | `inspect-fade.bench.ts` (new) |
| SpatialRelationshipResolver | < 10 ms for 10k elements | `spatial-relationship.bench.ts` (new) |
| Dashboard component render | < 200 ms each | per-component |

---

## §12 — Phase delivery

Master plan [§11.4](../03-execution/plans/master-implementation-plan.md) INS-α-1 through INS-γ-4. ~18 wk total.

---

## §13 — What is NOT in this contract

- **The Data grid** — [C28](C28-DATA-PANEL-AND-AUTOMATION.md). C27 owns selection; C28 owns grid data + automation.
- **Sheet authoring** — [C24](C24-SHEET-COMPOSITION-ENGINE.md). C27's tree is reused by Sheets as a view picker.
- **AI dispatch** — [C09](C09-AI-AND-VISIBILITY-INTENT.md). The visibility intent itself is from C09; C27 dispatches one specific intent.
- **Element creation / editing** — [C11](C11-ELEMENT-CREATION-PIPELINE.md). C27 inspects existing elements.
- **The Author tab** — separate concern; covered by element creation contracts + the BIM 2.0 Data Management Panel ([APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM.md](../03-execution/plans/apartment/bim2-bim3-data-mgmt.md)).

---

*End — C27 BIM 3.0 Inspect Model, 2026-05-31.*
