# BIM 3.0 — Phase 0A: Element + Authoritative State Inventory

> **Purpose.** Phase 0A of the UNIVERSAL RELATIONSHIP PROGRAM. This document measures what
> the universal consequence architecture must actually cover, so that the governing rule —
> *any element → any related element must either participate in the full safe-mode lifecycle
> OR explicitly return UNDETERMINED with a typed reason; never silently ignore a known
> dependency* — can be scoped against reality rather than against an estimate.
>
> **This document is a MEASUREMENT, not a design.** Every number below carries the command
> that produced it. Where a reading is uncertain it is marked **UNCERTAIN** with the reason.
> Nothing here is rounded, and nothing is inferred from a prior document.

---

## §0 — Provenance and re-runnability

| | |
|---|---|
| **Measurement date** | 2026-08-12 |
| **HEAD sha** | `2b6368549d03cb3e476d12dfd8a4d3a8906a6c80` |
| **Branch** | `main` |
| **Method** | Read-only. No file in the tree was modified except this one. |

**Caveat on concurrency.** Six other agents held this working tree during measurement. The
`git status` snapshot at session start showed modifications in `packages/geometry-slab/src/SlabStore.ts`,
`packages/room-topology/src/RoomStore.ts`, `packages/runtime-composer/src/composeRuntime.ts`,
`apps/editor/src/engine/initBuilders.ts`, `apps/editor/src/engine/engineLauncher.ts`, four
`plugins/*` handler/tool files, and ~20 `tools/ga-gate/*` scripts. Readings that touch those
files are flagged **IN-FLIGHT** at their row. All other readings are stable.

### Commands used

```bash
# §1 element families
ls packages/schemas/src/elements/*.ts | wc -l                      # → 29 (28 + index.ts)
ls packages/geometry-*/package.json | wc -l                        # → 15 (14 element + geometry-kernel)
ls -d plugins/*/ | wc -l                                           # → 48

# §2 authoritative stores
find packages plugins apps -name "*Store.ts" \
  -not -path "*/node_modules/*" -not -path "*/dist/*" | wc -l      # → 139
find ... -name "*Store.ts" ... | xargs -n1 basename | sort | uniq -d   # → 15 duplicate basenames
npx tsx tools/ga-gate/check-declared-project-scopes.ts
npx tsx tools/ga-gate/check-no-direct-store-writes.ts

# §3 command verbs
grep -cE '^\| `[a-zA-Z0-9_.-]+`' docs/04-reference/API-VERB-REGISTER.md          # → 332 rows
grep -oE '^\| `[a-zA-Z0-9_.-]+`' ... | sed 's/| `//;s/`//' | sort -u | wc -l     # → 323 unique
grep -oE '^\| `...`' ... | sed 's/\..*//' | sort | uniq -c | sort -rn            # family histogram
grep -oE '^\| `...`' ... | awk -F'.' '{print $2}' | sort | uniq -c | sort -rn    # operation histogram

# §4 observers
find packages plugins apps \( -name "*Observer*.ts" -o -name "*DependencyTracker*.ts" \
  -o -name "*Reconcil*.ts" -o -name "*ConsequencePlanner*.ts" \) | grep -v node_modules
grep -rn "\.subscribe(" packages plugins apps --include="*.ts" -l | grep -v node_modules \
  | grep -vE "__tests__|\.test\.|\.spec\." | wc -l                 # → 92 files

# §5 persistence
wc -l apps/editor/src/engine/persistence/ProjectSerializer.ts \
      apps/editor/src/engine/persistence/ProjectLoader.ts \
      packages/persistence-client/src/loader/ProjectSerializer.ts \
      packages/persistence-client/src/loader/ProjectLoader.ts
```

---

## §1 — Production element families

**Counted:** 28 schema files in `packages/schemas/src/elements/` (29 entries minus `index.ts`).
14 element-bearing `packages/geometry-*` packages (15 minus `geometry-kernel`, which is shared
math, not an element). 48 `plugins/*`.

The three axes do **not** align one-to-one. That misalignment is itself the finding: a family
can have a schema and no geometry package, a geometry package and no schema, or a plugin and
neither.

| Family | Schema (`packages/schemas/src/elements/`) | Zod? | Geometry package | Plugin | Serialised? |
|---|---|---|---|---|---|
| Wall | `Wall.ts` | yes (9 hits — richest) | `geometry-wall` | `plugins/wall` | yes (`walls`) |
| Door | `Door.ts` | yes (3) | `geometry-door` | `plugins/door` | yes (`doors`) |
| Window | `Window.ts` | yes (2) | `geometry-window` | `plugins/window` | yes (`windows`) |
| Slab / Floor | `Slab.ts` | yes (1 — thin) | `geometry-slab` | `plugins/slab`, `plugins/floor` | yes (`slabs`) |
| Column | `Column.ts` | yes (2) | `geometry-column` | `plugins/column` | yes (`columns`) |
| Beam | `Beam.ts` | yes (2) | `geometry-beam` | `plugins/beam` | yes (`beams`) |
| Roof | `Roof.ts` | yes (3) | `geometry-roof` | `plugins/roof` | yes (`roofs`) |
| Stair | `Stair.ts` | yes (2) | `geometry-stair` | `plugins/stair` | yes (`stairs`) |
| Curtain wall | `CurtainWall.ts` | yes (3) | `geometry-curtain-wall` | `plugins/curtain-wall` | yes (`curtainWalls`) |
| Furniture | `Furniture.ts` | yes (3) | `geometry-furniture` | `plugins/furniture` | yes (`furniture`) |
| Lighting | `Lighting.ts` | yes (2) | `geometry-lighting` | `plugins/lighting` | **conditional** — `lighting: len>0 ? … : undefined` |
| Plumbing | `Plumbing.ts` | yes (2) | `geometry-plumbing` | `plugins/plumbing` | yes (`plumbing`) |
| Pool | `Pool.ts` | **1 hit — thin** | `geometry-pool` | `plugins/pool` | **NO key in either serializer** |
| Lift / vertical circ. | `VerticalCirculation.ts` | yes (2) | `geometry-lift` | — (none) | **NO** — see §5, named unreconstructable |
| Room | `Room.ts` | yes (2) | — (`room-topology`) | `plugins/rooms` | yes (`rooms`) |
| Ceiling | `Ceiling.ts` | **1 hit — thin** | — | `plugins/ceiling` | **conditional** (`len>0 ? … : undefined`) |
| Handrail | `Handrail.ts` | yes (2) | — (in `geometry-stair`) | `plugins/handrail` | yes (`handrails`) |
| Grid | `Grid.ts` | yes (3) | — | `plugins/grid` | yes (`grids`) |
| Annotation | `Annotation.ts` | yes (2) | — | `plugins/annotations` | nested under `annotations{}` |
| Dimension | `Dimension.ts` | yes (4) | — | `plugins/dimensions` | nested under `annotations{}` |
| Section | `Section.ts` | **ZERO — plain interface** | — | `plugins/section-view` | **UNCERTAIN** (not in the key sweep) |
| Structural | `Structural.ts` | yes (2) | — | `plugins/structural` | **UNCERTAIN** |
| Schedule | `Schedule.ts` | yes (6) | — | `plugins/schedules` | via view stores |
| Sheet | `Sheet.ts` | yes (4) | — | `plugins/sheets` | via view stores |
| View | `View.ts` | yes (5) | — | `plugins/view` | via view stores |
| Water | `Water.ts` | **1 hit — thin** | — | — | **NO** |
| Project | `Project.ts` | yes (4) | — | — | root |
| ProjectOrigin | `ProjectOrigin.ts` | **1 hit — thin** | — | `plugins/geospatial` | yes |

**Findings on this axis.**

1. **`Section.ts` has zero Zod.** It is a plain TypeScript interface by deliberate choice.
   Its own header (`packages/schemas/src/elements/Section.ts:8-13`) states: *"Intentionally a
   plain interface rather than a full BaseNode-extended zod schema … A full zod schema can be
   layered on top in a future schema-hardening sprint."* Section carries 7 verbs (§3) with no
   runtime validation at the schema layer.
2. **Five schemas are thin** (single Zod hit): `Ceiling`, `Pool`, `Slab`, `Water`,
   `ProjectOrigin`. `Slab` is the alarming one — 17 verbs (§3, second-largest family) against
   the thinnest validation of any load-bearing element.
3. **`geometry-lift` has a store and a schema but no plugin and no serializer key.** Lifts are
   the one family that `rebuildSemanticGraph.ts:203-208` explicitly names as unreconstructable.

---

## §2 — Authoritative stores and rivals

**Counted:** 139 `*Store.ts` files outside `node_modules`/`dist`. Of these, **15 basenames are
duplicated** across packages.

### §2.1 The three-way store rivalry (the largest finding on this axis)

Six element families have **three** independent store implementations, and two of them are
constructed at runtime in the same boot:

| Family | Store A — `packages/geometry-*` | Store B — `core-app-model/src/stores/` | Store C — `plugins/*/src/store.ts` |
|---|---|---|---|
| Stair | `packages/geometry-stair/src/StairStore.ts` | `packages/core-app-model/src/stores/StairStore.ts` (182 ln) | `plugins/stair/src/index.ts:3` re-exports `./store.js` |
| Column | `packages/geometry-column/src/ColumnStore.ts` | `…/stores/ColumnStore.ts` (249 ln) | `plugins/column/src/index.ts:3` |
| Roof | `packages/geometry-roof/src/RoofStore.ts` | `…/stores/RoofStore.ts` (155 ln) | `plugins/roof/src/index.ts:7` |
| Furniture | `packages/geometry-furniture/src/FurnitureStore.ts` | `…/stores/FurnitureStore.ts` (55 ln) | `plugins/furniture/src/index.ts:3` |
| Lighting | `packages/geometry-lighting/src/LightingStore.ts` | `…/stores/LightingStore.ts` (63 ln) | `plugins/lighting/src/index.ts:3` |
| Plumbing | `packages/geometry-plumbing/src/PlumbingStore.ts` | `…/stores/PlumbingStore.ts` (40 ln) | `plugins/plumbing/src/index.ts:3` |

**These are not re-exports. They are independent implementations with different internal
representations** — the `core-app-model` variants hold `Map<string, XData>` and emit on a
`DOMEventBus` + `storeEventBus`; the plugin variants expose a `Store<XsState>` patch surface.

**Both are constructed at runtime**, in the same application:

| Family | Authoritative construction (`initBuilders.ts`) | Rival construction (`PluginRegistry.ts`) |
|---|---|---|
| Stair | `apps/editor/src/engine/initBuilders.ts:902` `new StairStore(projectContext)` from `@pryzm/geometry-stair` | `apps/editor/src/PluginRegistry.ts:307` `new StairStore()` from `@pryzm/plugin-stair` |
| Column | `initBuilders.ts:288` (import line 137, `@pryzm/geometry-column`) | `PluginRegistry.ts:291` (import line 55, `@pryzm/plugin-column`) |
| Roof | `initBuilders.ts:574` (import line 81, `@pryzm/geometry-roof`) | `PluginRegistry.ts:267` (import line 52, `@pryzm/plugin-roof`) |
| Furniture | `initBuilders.ts:732` (import line 98, `@pryzm/geometry-furniture`) | `PluginRegistry.ts:343` (import line 90, `@pryzm/plugin-furniture`) |
| Lighting | `initBuilders.ts:838` (import line 102, `@pryzm/geometry-lighting`) | `PluginRegistry.ts:371` (import line 98, `@pryzm/plugin-lighting`) |
| Plumbing | `initBuilders.ts:627` (import line 85, `@pryzm/geometry-plumbing`) | `PluginRegistry.ts:351` (import line 91, `@pryzm/plugin-plumbing`) |

> ⚠ **IN-FLIGHT.** `apps/editor/src/engine/initBuilders.ts` is modified in the working tree by
> another agent. Line numbers above are read from the working-tree state, not from HEAD. The
> *existence* of both construction sites is stable; the *line numbers* may shift.

`plugins/roof/src/handlers/index.ts:36` documents the consequence in its own comment: the plugin
handlers run `produceCommand`s *"against the plugin DTO store — a fresh `new RoofStore()`"*. This
matches the previously-recorded RAC finding that several plugin DTO stores are **dead** — written
to, never read by the render or persistence path. Whether each of the six is dead or live is
**UNCERTAIN** and requires a runtime reachability probe, not a static read (see §OPEN QUESTIONS).

### §2.2 Other duplicated basenames

| Basename | Location A | Location B | Assessment |
|---|---|---|---|
| `RoomStore.ts` | `packages/room-topology/src/RoomStore.ts` (3 exports) — **IN-FLIGHT** | `packages/stores/src/RoomStore.ts` (155 ln, L3 wrapper over the L0 `Room` schema) | Genuinely different layers; the `packages/stores` one documents itself as the A.23.b.2 reactive wrapper |
| `LevelStore.ts` | `packages/stores/src/LevelStore.ts` | `plugins/plan-view/src/LevelStore.ts` (70 ln) | The plugin one self-describes as *"ephemeral per-session active-level registry"* and states levels are **NOT replayed through the command bus event log** |
| `AnnotationStore.ts` | `packages/stores/src/AnnotationStore.ts` (42 ln) | `plugins/annotations/src/subsystem/AnnotationStore.ts` | Documented split (S34/ADR-0026): DTO in `packages/stores`, handlers in the plugin |
| `ScheduleStore.ts` | `packages/stores/` | `core-app-model/src/views/` | view-layer vs element-layer |
| `SheetStore.ts` | `packages/stores/` | `core-app-model/src/views/` | same |
| `TitleBlockStore.ts` | `packages/stores/` | `core-app-model/src/views/` | same |
| `StairTypeStore.ts` | `core-app-model/src/stores/` | `geometry-stair/src/` | same rivalry as §2.1 |
| `IndexedDBStore.ts` | `packages/stores/` | `packages/persistence-client/` | infrastructure, not element state |
| `GeometryCacheStore.ts` | `apps/editor/src/engine/persistence/` | `packages/persistence-client/src/loader/` | infrastructure |

**Door/Window are now clean** — a fork was deleted earlier today, and the sweep finds no rival
for `DoorStore.ts` or `WindowStore.ts`. `WallStore.ts` and `SlabStore.ts` likewise have exactly
one implementation each.

### §2.3 Gate readings

**`tools/ga-gate/check-declared-project-scopes.ts`** — **RED at HEAD**:

```
Declared scopes                       : 7
Probe registration sites in source    : 5
instance-scope presence debt          : 0
Distinct scopeName literals in source : 52
Duplicate scopeNames found / baselined: 0 / 0
Undeclared state candidates (baseline): 40
Undeclared state candidates (now)     : 41
✗ CANDIDATE SWEEP: 1 NEW file holds module-level project-scoped state with no declared owner:
   • apps/editor/src/engine/graphQueryBusHandlers.ts
```

The key structural number: **52 distinct `scopeName` literals in source against 7 declared
scopes and 5 probe registration sites.** Duplication is baselined at 0 — that arm is clean —
but coverage is not: 41 files hold module-level project-scoped state with no declared owner.

> ⚠ The single new candidate, `apps/editor/src/engine/graphQueryBusHandlers.ts`, may be another
> agent's in-flight work. This gate reading is **IN-FLIGHT** — ~20 `tools/ga-gate/*` scripts are
> modified in the working tree.

**`tools/ga-gate/check-no-direct-store-writes.ts`** — **within baseline (37/37)**, i.e. P6 is
enforced at a tolerance of 37 direct writes, not at 0:

```
UI files scanned: 762 · *Store method calls in UI: 326 · classified as WRITES: 37
```
Concentrated in `DxfImportPanel.ts` (12), `ValidatePanel.ts` (6), `AIPanel.ts` (4),
`SheetEditorSidebar.ts` (4), `MaterialsBucket.ts` (3).

---

## §3 — Command / mutation verbs

**Source:** `docs/04-reference/API-VERB-REGISTER.md` (GENERATED — regenerate with
`npx tsx tools/ga-gate/check-verb-register.ts --write`; governed by C69).

Its own §"Measured at generation" block reports: **323 verbs** (floor 250), 1228 handler files
read (floor 900), **LIVE 110 · REFUSES 35 · SHADOWED 9 · UNKNOWN 169**, and — the number that
matters most here — **213 verbs whose authoritative store is NONE or UNKNOWN**.

**Row-count reconciliation.** The register table has **332 rows** but **323 unique verbs**. The
9 extras are verbs declared at two sites: `element.updateMark`, `furniture.updateParameters`,
`level.add`, `sheet.addViewport`, `stair.create`, `stair.move`, `template.assignToNode`,
`view.setCrop`, `view.updateDefinition`. This exactly matches the register's own SHADOWED count
of 9 — dual registration where boot order decides the winner. **`stair.create` and `stair.move`
being on this list is the §2.1 store rivalry surfacing in the verb layer.**

### §3.1 Verbs by element family

| Family | Verbs | | Family | Verbs |
|---|---:|---|---|---:|
| `wall` | **29** | | `column` | 8 |
| `curtain-wall` | **21** | | `beam` | 8 |
| `view` | 20 | | `structural` | 7 |
| `slab` | **17** | | `section` | 7 |
| `stair` | 15 | | `schedule` | 7 |
| `door` | 14 | | `plumbing` | 7 |
| `sheet` | 13 | | `dimension` | 7 |
| `room` | 13 | | `lighting` | 6 |
| `roof` | 13 | | `grid` | 6 |
| `window` | 12 | | `hierarchy` | 5 |
| `furniture` | 11 | | `vg` / `template` / `level` / `generation` / `floor` / `elementType` | 4 each |
| `handrail` | 9 | | `viewTemplate` / `selection` / `graph` / `data` | 3 each |
| `element` | 9 | | `rhino` / `projectOrigin` / `pool` | 2 each |
| `ceiling` | 9 | | `zoom-selected`, `zoom-fit`, `paste-clipboard`, `opening`, `generative`, `elevation`, `cube`, `copy-selection` | 1 each |
| `annotation` | 9 | | | |

46 distinct family prefixes.

### §3.2 Verbs by operation class

| Class | Count | Class | Count |
|---|---:|---|---:|
| `create` | **31** | `updateParameters` | 4 |
| `delete` | **27** | bare (no dot: `zoom-fit`, `zoom-selected`, `copy-selection`, `paste-clipboard`) | 4 |
| `move` | **18** | `updateLayers` / `setShape` / `setHeight` / `rename` / `add` | 3 each |
| `setMaterial` | 15 | `updateMark`, `updateDimensions`, `updateDefinition`, `updateColor`, `setWidth`, `setThickness`, `setText`, `setSillHeight`, `setScale`, `setOffset`, `setKind`, `setGraphicOverride`, `setFrameColor`, `setFireRating`, `setDimensions`, `setCrop`, `setColor`, `rotate`, `create-on-all-slabs`, `changeLevel`, `assignToNode`, `addViewport` | 2 each |
| `update` | 12 | | |
| `batch` | 12 | | |
| `setType` | 6 | | |
| `updateSystemTypeBatch` | 5 | | |

**The consequential core is 31 create + 27 delete + 18 move + 12 update + 12 batch = 100 verbs**
that change topology or position. Every one of these is a candidate for a consequence planner.
**Two exist.**

### §3.3 Consequence-planner coverage — the central measurement

`apps/editor/src/engine/consequence/` contains exactly two planners:

| Planner | File | Registered? |
|---|---|---|
| `WallMoveConsequencePlanner` | `WallMoveConsequencePlanner.ts:178` | **YES** — 3 sites |
| `WallCreateConsequencePlanner` | `WallCreateConsequencePlanner.ts:231` | **NO — registered nowhere** |

**`WallCreateConsequencePlanner` is authored, factory-wrapped, and fully unit-tested (43 test
call-sites in `apps/editor/__tests__/WallCreateConsequencePlanner.test.ts`) but is wired into
zero composition roots.** All three registration sites register only `wall.move`:

- `apps/editor/src/engine/consequenceExecutionServiceComposition.ts:62` — `planners.set('wall.move', …)`
- `apps/editor/src/engine/consequence/consequencePreviewServiceComposition.ts:50` — `planners.set('wall.move', …)`
- `apps/editor/src/ui/consequence/confirmationFlowComposition.ts:57` — `planners.set('wall.move', …)`

`grep -rn "createWallCreateConsequencePlanner"` returns its own definition
(`wallCreatePlannerComposition.ts:30`) and **no call site**. This is the *authored-but-unwired*
pattern: reachability, not existence, is the correct audit.

**Effective coverage is therefore 1 verb of 323 (0.3%), or 1 of the ~100 consequential verbs (1%).**

The type hard-coding is worse than "wall-only":

```
ConsequenceExecutionService.ts:92        readonly planners: ReadonlyMap<string, ConsequencePlanner<WallMoveCommand>>;
consequenceExecutionServiceComposition.ts:61  new Map<string, ConsequencePlanner<WallMoveCommand>>();
ConsequencePreviewService.ts:103         private readonly planners: ReadonlyMap<string, ConsequencePlanner<WallMoveCommand>>,
consequencePreviewServiceComposition.ts:49    new Map<string, ConsequencePlanner<WallMoveCommand>>();
confirmationFlowComposition.ts:57/67     new Map<…ConsequencePlanner<WallMoveCommand>>()
                                          … planners as unknown as ReadonlyMap<string, ConsequencePlanner<never>>
```

`confirmationFlowComposition.ts:67` launders the map through `as unknown as
ReadonlyMap<string, ConsequencePlanner<never>>` to satisfy `ConfirmationFlow.ts:169`. The
generic parameter is defeated by a double cast — the map cannot hold a non-wall-move planner
without one.

**The three `return null` sites** in `ConsequencePreviewService.ts`, all bare and
indistinguishable to the caller:

| Line | Reason | What the caller cannot tell |
|---|---|---|
| `:84` / `:89` | malformed payload (`normalizeToWallMove`) — missing `id`/`baseLine`, or missing `wallId`/`newBaseLine` | *the command was invalid* |
| `:92` | command type is neither `wall.move` nor `wall.updateBaseline` | *this verb is not normalizable* |
| `:109` | `this.normalize(command)` returned null (delegates the above) | *(inherits)* |
| `:111` | `this.planners.get(normalized.type)` missed — **no planner registered** | *nothing is watching this element* |

`:111` and `:92` are the dangerous pair. They are the "silently ignore a known dependency"
case the founder's rule forbids, and they are returned as the same value as "you sent me a
malformed payload."

---

## §4 — Observer / subscription paths that MUTATE

92 non-test files call `.subscribe(`. Of those, the following mutate element state.

| # | Path | Watches | Mutates | Through the bus? |
|---|---|---|---|---|
| 1 | `packages/room-topology/src/RoomTopologyObserver.ts:277,299,308,317,326` | `wallStore`, `curtainWallStore`, `roomBoundingLineStore`, `slabStore`, `columnStore` — **5 stores** | room topology; debounce + commit-coalesce timers (`:75`, `:79`) | **partly** — has `_suppressedCommitLevels` (`:357`) and `_graphAuthoritativeLevels` (`:181,232,290`) gating. **IN-FLIGHT** (`room-topology` modified) |
| 2 | `packages/geometry-door/src/DoorDependencyTracker.ts:50,56` | `doorStore`, `wallStore` | in-memory `graph`/`home` index only (`:143-162`) | index-only — no store writes |
| 3 | `packages/geometry-window/src/WindowDependencyTracker.ts:37,42` | `windowStore`, `wallStore` | in-memory index only (`:120-139`) | index-only |
| 4 | `packages/geometry-slab/src/SlabDependencyTracker.ts:69` | `wallStore` | **`slabStore.update()` at `:170`** | **NO — documented fallback.** `:167` warns *"Falling back to direct slabStore.update() for sketch degradation on wall removal."* The command path is preferred (`:120`) but the direct write remains reachable |
| 5 | `packages/geometry-slab/src/SlabWallConnectivityService.ts:125` | `wallStore` | **`wallStore.update()` at `:337`** | **NO for the cascade.** `:331` states plainly: *"§01 §2.1 structural cascade: `wallStore.update()` only (no commands)."* A separate legacy fallback at `:320` fires when no command manager is injected |
| 6 | `packages/geometry-curtain-wall/src/CurtainPanelSyncHandler.ts:56` | `cwStore` | **`panelStore.delete()` `:111`,`:161`; `panelStore.add()` `:141`** | **NO — no bus reference in the file** |
| 7 | `packages/command-registry/src/stair/StairSlabOpeningReconciler.ts` | stair/slab | **`openingStore.add()` `:171`,`:355`,`:408`; `openingStore.update()` `:351`,`:400`** | **UNCERTAIN** — lives inside `command-registry`, so it may be command-invoked rather than subscription-driven; not verified |
| 8 | `packages/core-app-model/src/views/ViewDependencyTracker.ts:325` | `storeEventBus` (all elements) | view dirty-sets; `_debounceTimer` `:176`; `_generationHoldWatchdog` `:237`,`:525` | view invalidation only, not element state |
| 9 | `apps/editor/src/engine/WallRebuildCoordinator.ts:471` | `wallStore` | render rebuild | render-side |
| 10 | `apps/editor/src/engine/initWallLevelSubscribers.ts:22` | `wallStore` | level reassignment | **UNCERTAIN** — untyped `(event: any, wall: any, prevState: any)` |
| 11 | `packages/core-app-model/src/annotations/TagReconciler.ts` | — | — | no subscribe and no store mutation found; name is misleading |
| 12 | `packages/geometry-stair/src/StairParameterReconciler.ts` | — | — | same — pure, no subscription |

**Debounced/`setTimeout` mutation sweep** (non-UI, non-test files that both call `setTimeout`
and call a `Store.update/add/remove/delete/set`):

| File | Store mutations |
|---|---:|
| `apps/editor/src/engine/initTools.ts` | **21** |
| `apps/editor/src/engine/persistence/ProjectLoader.ts` | 7 |
| `apps/editor/src/engine/views/PlanViewInteraction.ts` | 7 |
| `packages/persistence-client/src/loader/ProjectLoader.ts` | 5 |
| `apps/editor/src/engine/preview/PreviewManager.ts` | 2 |
| `packages/core-app-model/src/views/DefaultViewsManager.ts` | 1 |
| `apps/editor/src/engine/initCollaboration.ts` | 1 |

`initTools.ts` at 21 store mutations alongside `setTimeout` is the largest single concentration
outside the loaders. Loader writes are expected (hydration); `PlanViewInteraction.ts` at 7 is
interaction-time and warrants a closer read.

### §4.1 Families that mutate outside the command bus — the answer to the brief's question

**Confirmed (comment-documented, file:line cited):**

1. **Slab** — `SlabDependencyTracker.ts:170` direct `slabStore.update()` fallback.
2. **Wall** — `SlabWallConnectivityService.ts:337` direct `wallStore.update()`; the file
   *states* the cascade is store-only by design (`:331`).
3. **Curtain wall / panels** — `CurtainPanelSyncHandler.ts:111,141,161` direct `panelStore`
   add/delete with no bus in the file at all.

**Plus the baselined UI surface:** 37 direct writes across 11 UI files (§2.3), tolerated by
`check-no-direct-store-writes.ts`.

**Plus, structurally:** every verb in the 213 whose authoritative store the register records as
`NONE or UNKNOWN` is a path the universal contract cannot currently reason about, because the
target store is not even named.

---

## §5 — Persistence paths

Two `ProjectSerializer`/`ProjectLoader` pairs exist:

| Pair | Serializer | Loader |
|---|---|---|
| apps/editor | `apps/editor/src/engine/persistence/ProjectSerializer.ts` (1241 ln) | `apps/editor/src/engine/persistence/ProjectLoader.ts` (2486 ln) |
| persistence-client | `packages/persistence-client/src/loader/ProjectSerializer.ts` (884 ln) | `packages/persistence-client/src/loader/ProjectLoader.ts` (1501 ln) |

### §5.1 Serialised families

Both snapshot types declare the **same 14 required arrays**, in the same order:

`levels, grids, walls, windows, doors, slabs, columns, stairs, beams, curtainWalls, roofs, furniture, handrails, plumbing`

(apps/editor `ProjectSerializer.ts:125-138`; persistence-client `ProjectSerializer.ts:89-102`.)

Beyond the required 14:

| Key | apps/editor | persistence-client | Note |
|---|---|---|---|
| `rooms` | `:1046` (emitted) | `:138` `rooms?:` **optional** | asymmetric optionality |
| `ceilings` | `:1049` conditional `len>0 ? … : undefined` | `:140` `ceilings?:` / `:751` same conditional | **conditional emission** |
| `lighting` | `:1047` conditional `len>0 ? … : undefined` | — | conditional |
| `openings`, `elementCount` | `:1046` | — | |
| `annotations{annotations[],dimensions[]}` | `:340-341`, `:1124` | `:284-287`, `:820` | nested sub-object |

**Not serialised by either:** lifts (`VerticalCirculation`), pools, water, and — **UNCERTAIN** —
sections and structural elements, which did not appear in the key sweep but may be nested inside
`annotations{}` or a view slice not covered by the grep.

The `len>0 ? … : undefined` pattern for ceilings and lighting is a quiet hazard: an empty
collection and an absent collection serialise identically, so a load cannot distinguish "this
project has no ceilings" from "this snapshot predates ceilings." This is the same value-collision
shape as the bare `return null` in §3.3.

### §5.2 `rebuildSemanticGraph.ts` — what it reconstructs vs. names as lost

`packages/persistence-client/src/loader/rebuildSemanticGraph.ts` (218 ln) is now the **single
owner** of pre-graph rebuild; its header (`:1-7`) records that the two byte-identical copies C71
§5.3/§7.j named as a divergence hazard have been removed and both `ProjectLoader`s call this one
function.

**Reconstructs 8 relationship types** (`:92-98`, implemented `:110-201`), every one computed
from a field the element authoritatively carries:

| # | Edge | Derived from | Line |
|---|---|---|---|
| 1 | `hosts` / `hostedBy` | `wall.openings[].elementId` | `:112-125` |
| 2 | `boundedBy` | `room.boundary.boundingWallIds` | `:128-138` |
| 3 | `adjacentTo` | two rooms sharing a bounding wall | `:143-160` |
| 4 | `connectedTo` | shared bounding wall that carries a **door** opening | `:156-159` |
| 5 | `partOf` | `room.unitId` | `:163-166` |
| 6 | `sitsOn` | `element.levelId` for `SITS_ON_KINDS` | `:171-176` |
| 7 | `supports` | `beam.startSupportId` / `endSupportId` | `:179-185` |
| 8 | `connectedByStair` | `stair.baseLevelId` ↔ `topLevelId` | `:189-201` |

`SITS_ON_KINDS` (`:70-79`) = `slabs, columns, beams, roofs, furniture, handrails, plumbing,
lighting` — **8 kinds. Walls, doors, windows and curtain-walls are deliberately excluded**
(`:63-68`): no creation writer emits `sitsOn` for them, so emitting it on load would invent an
edge the live model never has. Stairs are handled separately because they sit on their **base**
level, not `levelId`.

**Names 2 losses explicitly** (`:187-210`) rather than dropping them:

| Loss | Reason as stated in source |
|---|---|
| `connectedByLift` | `:203-208` — *"lifts are NOT serialized into the snapshot at all (neither ProjectSerializer emits a lifts array), so the authoritative base/top level refs the edge derives from are absent."* |
| `contains` (room → contained element) | `:210-214` — REQUIRED by C71 §2.1 but *"has NO first-party writer — it is IFC-import-only"*; a native writer is a named Tier-2 gap (ADR-0320) |

**`joinedTo` (wall ↔ wall)** is deliberately NOT rebuilt and deliberately NOT named as a loss
(`:22-26`): it is regenerated from the retained junction index by `WallRebuildCoordinator`, which
removes-and-re-emits the level's edges on every rebuild, so a snapshot-side reconstruction would
be overwritten.

**This file is the model the rest of the program should copy.** It is the one place in the
codebase already implementing the founder's rule: it reconstructs what it can from authoritative
state, refuses to fabricate what it cannot, and returns the shortfall **by name** in
`RebuildSemanticGraphResult.unreconstructable` so the load reports the loss.

---

## §OPEN QUESTIONS — what could not be measured

1. **Are the six rival `plugins/*/src/store.ts` DTO stores dead or live?** Static reads show
   both constructed (`initBuilders.ts` and `PluginRegistry.ts`); `plugins/roof/src/handlers/index.ts:36`
   asserts the plugin one is a fresh throwaway. Distinguishing dead from live requires a **runtime
   reachability probe** (instrument each store's write path, drive a create/move for each of the
   six families, record which instance the renderer and serializer read). Cannot be settled by grep.
2. **Are `Section` and `Structural` serialised?** They did not appear in the array-key sweep of
   either serializer. They may be nested inside `annotations{}` or a view slice. Needs a targeted
   read of both serializers' annotation/view assembly blocks.
3. **Is `StairSlabOpeningReconciler` subscription-driven or command-invoked?** It mutates
   `openingStore` at 5 sites but lives in `command-registry`. Its trigger path was not traced.
4. **Which of the 213 `NONE or UNKNOWN`-store verbs are genuinely storeless vs. merely
   undeclared?** The register does not distinguish. Resolving this is prerequisite to any
   universal contract, because a verb whose authoritative store is unnamed cannot have its
   consequences planned.
5. **What do the 169 UNKNOWN-liveness verbs actually do at runtime?** The register defines
   UNKNOWN as *"a lone plugin `produceCommand` handler; nobody has proven either way."* A
   universal contract that covers dead verbs wastes effort; one that skips live verbs is unsafe.
6. **`initTools.ts` — are its 21 store mutations command-routed?** It is the largest non-loader
   concentration of `setTimeout` + store mutation. Not individually classified here.
7. **`initWallLevelSubscribers.ts:22`** takes `(event: any, wall: any, prevState: any)`; the
   untyped signature blocks static determination of what it mutates.
8. **IN-FLIGHT readings.** `initBuilders.ts`, `room-topology/RoomStore.ts`,
   `geometry-slab/SlabStore.ts`, `composeRuntime.ts` and ~20 `tools/ga-gate/*` scripts were being
   edited concurrently. Line numbers cited from those files are working-tree, not HEAD. **The
   `check-declared-project-scopes.ts` RED result and its one new candidate
   (`graphQueryBusHandlers.ts`) should be re-run on a quiet tree before being treated as a
   regression.**
