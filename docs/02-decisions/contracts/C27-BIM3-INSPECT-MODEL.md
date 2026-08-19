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

## §0.1 — ⛔ CORRECTION 2026-08-19: §1.2 IS VIOLATED — THERE ARE **TWO** MODEL TREES, AND THE ONE THE FOUNDER READS IS NOT C27's

**Lane ENV1, from a founder report on the deployed build.** His Level 15 node read:

```
WALL 25 · SLAB 1 · UNKNOWN 227 · ROOM 1
```

**227 elements on one level classified `UNKNOWN`**, immediately after a bulk window create.

### The measurement §1.2 does not survive

§1.2 states *"Only **one** model-tree component SHALL exist in the codebase. Duplicate trees … are
a CI violation"*, and names `tools/ga-gate/check-model-tree-count.ts` as the gate. Measured
2026-08-19:

| Claim | Measured |
|---|---|
| one model-tree component | **TWO.** `apps/editor/src/ui/inspect/ModelTree.ts` (C27's, reading `runtime.elementStore`) **and** the shipped **Project Browser** — `apps/editor/src/ui/ViewBrowser/panels/UnifiedBrowserPanel.ts` (`title.textContent = 'Project Browser'`) with `unified-browser/ProjectTreeSection.ts` + `unified-browser/BrowserDataHelpers.ts`, reading **17 `window.*Store` legacy globals**. |
| gate `check-model-tree-count.ts` | **DOES NOT EXIST** (`ls tools/ga-gate/check-model-tree-count.ts` → no such file). §1.2 has never been enforced. |
| a third | `apps/editor/src/ui/ProjectBrowser/ProjectBrowser.tsx` is a **static React mock** with hard-coded `initialState` — dead relative to the shipped panel, and a trap for anyone grepping "ProjectBrowser". |

**This is the C69 pattern again: nothing owns the surface the user actually reads.** C27 specifies a
tree that is half-built and gates a duplication rule with a gate that was never written, while the
tree in front of the founder answers to no contract at all. Its private classification expression —
three copies of `el.type ?? el.elementType ?? 'Unknown'` — is a direct consequence: an unowned
surface writes its own vocabulary.

### What `UNKNOWN 227` actually was — ⭐ the elements genuinely have no type

Not a casing mismatch, not a lookup bug. `groupByType` was **reporting accurately**:

- `DoorOpeningSchema` (`packages/geometry-door/src/DoorTypes.ts`), `WindowOpeningSchema`
  (`packages/geometry-window/src/WindowTypes.ts`) and `BeamData`
  (`packages/core-app-model/src/stores/BeamTypes.ts`) **declare no `type` / `elementType` field at
  all.**
- They are Zod objects in default **STRIP** mode, so a caller that passes `type` has it **deleted**
  on the way in — a door record cannot carry its own kind today even deliberately.
- Every other store in `getAllStores` declares one. So **`UNKNOWN` == doors + windows + beams,
  exactly.**
- The uppercase is CSS (`.pb-ubp-st-type-name { text-transform: uppercase }`), which is why
  grepping the source for `'UNKNOWN'` finds nothing.

### Normative, pending a decision on who owns this surface

1. **ONE classifier per tree.** The Project Browser now resolves every element kind through a single
   exported `elementTypeName(el)` (`unified-browser/BrowserDataHelpers.ts`), consumed by
   `groupByType`, `getTypeElementIds` and `UnifiedBrowserPanel._expandToElement`. Three copies of
   one expression is how a fix lands in one and not the others — before this, *"isolate this type"*
   could collect a different set than the group header it was clicked on. **C84 EI-9.**
2. **A missing kind is filled from PROVENANCE, never from a guess.** A record returned by
   `window.doorStore` **is** a door; `getAllStores` already knows which store each row came from.
   Shape-sniffing (*"it has a `doorType` field, so it is probably a door"*) is forbidden — that is a
   fourth private vocabulary, **C84 EI-8**.
3. **A declared type always wins.** The provenance fallback must go quiet on its own the day the
   DTOs carry `type`.
4. **An unclassifiable row stays `Unknown` and stays VISIBLE.** Absorbing it into a plausible bucket
   converts a finding into a silent misreport.
5. ⚠ **The vocabularies are NOT interchangeable and MUST NOT be merged.** The tree reads the store
   DTO's `type` (**lowercase**, `CoreElement.ElementType`); the pick registry reads
   `THREE.Object3D.userData.elementType` (**PascalCase**, FROZEN by
   [C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md)). `.toLowerCase()` is the mandated bridge, and the
   `[PickDiag]` counter that omitted it (ISSUE-LOG **L-1173**) printed
   `doorsRegistered=0 windowsRegistered=0` against 3,304 real openings — an **unsatisfiable**
   condition whose false negative was then quoted as fact in ISSUE-LOG L-912 and L-913.

**Binding artefact:**
`apps/editor/src/ui/ViewBrowser/panels/unified-browser/__tests__/elementTypeVocabulary.spec.ts`.

### ⚠ OPEN — three items, none closed by the above

- **The DTO is the root, and it is unfixed.** Adding `type` to the three schemas changes the
  persisted shape and every `safeParse` round-trip; it belongs to the geometry-door /
  geometry-window / core-app-model owners. **Do not close it on the strength of the read-side
  repair.** (ISSUE-LOG **L-1172**.)
- **Every door and window is listed TWICE per level.** `ProjectTreeSection.ts` renders each as a
  child row under its host wall (via `wall.childrenIds` → `WallStore`'s own sub-maps, which *do*
  carry `type`) **and** as a top-level group. `UNKNOWN 227` was therefore already a **double
  count**; it is now a correctly-named double count. Whether hosted openings belong at level scope
  at all is a product decision, deliberately not made silently here.
- **§1.2 itself.** Either C27 owns the shipped Project Browser (and §1.2's "one tree" must be
  reconciled against two, with the gate actually written), or a contract is minted for it. Until
  then this §0.1 is the only thing binding it, and a DRAFT contract binds nothing.


---

## §1 — Invariants

### §1.1 — Inspect is a spatial-intelligence surface

The Inspect tab is **not a property list**. It is a hierarchical model-tree + viewport-isolation + graphical-dashboard surface. The user navigates the model hierarchy by tree node; selection drives viewport isolation (rest of model semi-transparent or hidden); the data panel transforms per node type into a rich graphical dashboard.

### §1.2 — One model-tree component

Only **one** model-tree component SHALL exist in the codebase. Duplicate trees (e.g. a sheet picker tree + a separate inspect tree) are a CI violation. Reusers consume the same `<ModelTreeComponent>` and bind a different `onSelectNode` handler.

CI gate: new `tools/ga-gate/check-model-tree-count.ts`.

> ⛔ **VIOLATED, and the gate DOES NOT EXIST — measured 2026-08-19. See [§0.1](#01--correction-2026-08-19-12-is-violated--there-are-two-model-trees-and-the-one-the-founder-reads-is-not-c27s).**
> There are **two** live trees (`ui/inspect/ModelTree.ts` and the shipped **Project Browser**,
> `ui/ViewBrowser/panels/UnifiedBrowserPanel.ts` + `unified-browser/ProjectTreeSection.ts`) plus a
> dead React mock at `ui/ProjectBrowser/ProjectBrowser.tsx`. They read **different data sources**
> (`runtime.elementStore` vs 17 `window.*Store` globals) and had **different classification
> expressions** — which is how the founder's tree came to read `UNKNOWN 227`. `ls
> tools/ga-gate/check-model-tree-count.ts` → **no such file**: this invariant has never been
> enforced. Do not read §1.2 as a description of the codebase.

### §1.3 — Isolation is a visibility intent

Selection-driven isolation routes through `packages/visibility/` (P7). It is NOT a parallel UI flag, NOT direct opacity mutation, NOT a custom `mesh.material.opacity = 0.2` write somewhere in editor code. The `IsolationVisibilityIntent` is dispatched into `packages/visibility/` and applied by `packages/scene-committer/` via THREE material opacity ([C04 §3](C04-RENDERING-AND-SCHEDULING.md)).

CI gate: ~~new `tools/ga-gate/check-visibility-intent.ts`~~ — ⚠ **still UNBUILT under that name; the nearest real gate is [`check-visibility-intent-not-ui.ts`](../../../tools/ga-gate/check-visibility-intent-not-ui.ts), a RATCHET at arm B 40/43 with a DIFFERENT subject (UI leakage, not `material.opacity`). See †GATE-ALIAS.** Specified: — any direct `material.opacity = N` outside `IsolationAnimator` is a violation.

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
| Visibility intent only | No direct `material.opacity` outside `IsolationAnimator` | ⚠ ~~NEW `tools/ga-gate/check-visibility-intent.ts`~~ — **UNBUILT; †GATE-ALIAS** |
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


---

## †GATE-ALIAS — correction 2026-08-18: cited gate names that DO NOT RESOLVE

The gate name(s) cited above **do not exist on disk**. In every case the gate **is real** but is
**spelled differently** — so the correct action is *use the real name*, and ⛔ **never build a
second copy**.

```
ls tools/ga-gate/check-schema-purity.ts tools/ga-gate/check-direct-store-writes.ts    tools/ga-gate/check-three-import-boundary.ts tools/ga-gate/check-commandmanager.ts    tools/ga-gate/check-visibility-intent.ts
# -> No such file or directory (ALL FIVE)
```

| Cited (does not exist) | Real gate | Measured 2026-08-18 |
|---|---|---|
| `check-schema-purity.ts` | **`tools/ga-gate/check-domain-purity.ts`** | P5, hard-fail at the invariant |
| `check-direct-store-writes.ts` | **`tools/ga-gate/check-no-direct-store-writes.ts`** | **RC=0, `within baseline (37/37)`** — a ratchet, **NOT** hard-0. P6 is **NOT-YET-TRUE as enforcement**. |
| `check-three-import-boundary.ts` | **`tools/ga-gate/check-three-imports.ts`** | P2, hard-fail at the invariant |
| `check-commandmanager.ts` | **`tools/ga-gate/check-no-commandmanager.ts`** *and* **`tools/ga-gate/check-commandmanager-any.ts`** — two gates, not one | `check-no-commandmanager` **RC=1** (*"failing at its DECLARED level: literal 11/11 · window 62/62 · cm.execute 62/62"*); `check-commandmanager-any` **RC=0** (`OK: 25 / 25`); and the npm script `check:commandmanager` → `scripts/check/ci-check-no-commandmanager.mjs` **RC=1** at **139/136**. ⚠ **Three counters, three verdicts, one subject — name the gate you ran or quote no number.** |
| `check-visibility-intent.ts` | **`tools/ga-gate/check-visibility-intent-not-ui.ts`** | **RC=0**, `arm A clean (0), arm B within baseline (40/43)` — a ratchet tolerating **40** violations, **not** the hard-0 a reader would assume |

⚠ **"Extends an existing gate" is a claim about a gate you must be able to name and run.** Three of
the five real gates above are **ratchets with non-zero baselines**, so extending them does **not**
produce the hard-fail these clauses imply. Any clause above that reads as running enforcement is
**NOT-YET-TRUE** until re-stated against the real gate's actual arms.

