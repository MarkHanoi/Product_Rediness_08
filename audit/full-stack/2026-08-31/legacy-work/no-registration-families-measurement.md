# LANE L2b — the ten NO-REGISTRATION families, measured (2026-08-31)

**Question** (from `legacy.json` HEADLINE.the_order_trap → NO_REGISTRATION_AT_ALL_ON_THE_BUS_PATH):
for each family, does a BUS-created element (a) appear in plan view, (b) appear in the BIM tree /
level hierarchy, (c) register with viewDependencyTracker — via ANY mechanism?

**HEAD at measurement**: `d34d8519` (working tree also carries UNCOMMITTED sibling-lane edits,
e.g. `apps/editor/src/PluginRegistry.ts` lane-7B1b structural note — line numbers below were read
from this tree, not from the commit). READ-ONLY lane: zero production files written; probes lived
in the session scratchpad and were deleted after their outputs were transcribed here.

---

## The three consumer mechanisms (measured once, apply to every row)

1. **Plan view has TWO distinct pipelines**, and families split across them:
   - **Projection pipeline** (technical drawing): `NativeElementMeshExporter` enumerates
     `elementRegistry.getAllRoots()` (`packages/core-app-model/src/geometry/NativeElementMeshExporter.ts:361`)
     → `EdgeProjectorService` projects linework, then runs the **store-driven symbol passes**
     (`EdgeProjectorService.ts:3937` door, `:3980` plumbing, `:3992` window, `:4006` stair — each
     `inject()` reads its legacy store, e.g. `DoorPlanSymbolBuilder.ts:274 doorStore.getAll()`,
     `PlumbingPlanSymbolBuilder.ts:58 store.getAll()`). A re-projection runs only when
     **ViewDependencyTracker** dirties the view.
   - **Canvas-pass pipeline**: `PlanViewCanvas` paints some families on EVERY canvas render, no
     projection needed — grid datums from `bimManager.getGrids()` (`PlanViewCanvas.ts:387/785`),
     annotations from the subsystem `annotationStore` (`PlanViewCanvas.ts:4,636`). In the active
     main plan view the canvas repaints on the ~30 ms `PlanViewManager` tick
     (`PlanViewManager.ts:764-778`); in a split-view Canvas2D pane repaint is tracker-driven
     (VDT header §FIX-PLAN-PROJECT-SPLIT-INCREMENTAL) — canvas-pass families in split view were
     NOT separately measured.
2. **VDT invalidation semantics** (EXECUTED — Probe A below, real class): a `storeEventBus` event
   whose `elementType` is in `GEOMETRY_ELEMENT_TYPES` but whose id was never `registerElement`-ed
   falls into the **§G3-STALE fallback** — `console.warn` + mark EVERY non-3D view dirty, coarse
   (`ViewDependencyTracker.ts:893/906-930`). So "no VDT registration" ≠ "no plan invalidation":
   it means *inefficient, warn-spamming, all-views* invalidation. An elementType NOT in the set
   (`Grid`, `annotation:*`) produces ZERO invalidation.
3. **The BIM tree (`SpatialTree.ts`) does NOT read `bimManager` children.** It uses
   `bimManager.getLevels()` for the level list only (`:168`), then enumerates **eight legacy
   stores directly** — wall, slab, column, beam, **stair**, curtainWall, **plumbing**, furniture
   (`:157-166`) — and resolves doors/windows as children of the wall row via
   `el.childrenIds` → `wallStore.getWindow/getDoor` (`:280-290`). ⚠ Refresh is event-driven, NOT
   store-subscribed: `model-updated` (emitted only by AI/generation UI flows),
   `bim-level-added/removed`, IFC import, +500 ms initial (`:515-527`). Tree presence below means
   "present in the data the tree reads at its next refresh" — true for every family equally.

## Executed probes (falsification-controlled)

- **Control suite** (foreground): `cd apps/editor && npx vitest run __tests__/DuplicateCreateStillRegisters.test.ts`
  → **3/3 PASS** — proves the AST-extraction harness detects VDT+bim registration in the shipped
  ceiling/lighting closures at this HEAD.
- **Probe A** (`npx tsx` on the REAL `ViewDependencyTracker` + `viewDefinitionStore`, driving
  `_onStoreEvent` directly): **8/8 PASS** —
  `wall` registered→targeted `[v-plan-L1]`; `door`/`window`/`stair`/`plumbing` unregistered→
  §G3-STALE warn + ALL non-3D views dirty; `Grid`/`grid`/`annotation:text-note`→ zero dirty.
- **Probe B** (harness-style TS-AST extraction from the shipped `initTools.ts`):
  - Part 1 — handler existence per channel:
    `wall.created` EXISTS, registers vdt+bim(`ev.wallId`) · `wall.opening.created` EXISTS,
    registers **NOTHING** · `lift.created` EXISTS, registers vdt+bim(`ev.liftId` — parent only) ·
    `stair.created` / `plumbing.created` / `grid.created` / `annotation.created` /
    `dimension.created` / `structural.created` / `bathroomPod.created` / `liftPart.created` —
    **NO initTools handler at all**.
  - Part 2 — EXECUTED the shipped `wall.opening.created` arrow (door payload) with recording
    spies: `addOpening`=1, `doorStore.add`=1, `vdt.registerElement`=**0**, `bim.registerElement`=**0**.
  - Part 3 — falsification control: same arrow with ONE injected registration line → spies record
    1/1. The zero in Part 2 is a measurement, not a blind spy.
- Zero-subscriber re-check at this HEAD:
  `grep -rn "on('<ch>'" apps/editor/src plugins packages --include=*.ts` (tests excluded) → **0**
  for each of `grid.created`, `plumbing.created`, `annotation.created`, `dimension.created`,
  `structural.created`. The CEB cases for these five emit **no element id** (payload cast is
  `{ levelId?: string }` only — `CommandEventBridge.ts:1533/1787/1797/1807/1817`), so even a
  subscriber could not register anything.

---

## Per-family table

Verbs matter: several families have TWO bus verbs with opposite outcomes. Each row names the verb measured.

| family | bus verb (live?) | (a) plan view | (b) BIM tree | (c) VDT | mechanism-or-absence | evidence command |
|---|---|---|---|---|---|---|
| **door** | `wall.opening.create` (LIVE — `DoorPlanToolHandler.ts:213`) | **YES** | **YES** (child of host wall) | **NO** | Bridge `initTools.ts:1530-1653` mirrors to legacy `WallStore.addOpening` (wall record gains `childrenIds` + doors sub-map → tree child via `SpatialTree.ts:280` `wallStore.getDoor`) + `doorStore.add` → symbol pass `EdgeProjectorService.ts:3937`. Invalidation: wall `update` event on the VDT-REGISTERED wallId (targeted) AND `DoorStore.ts:64` `'door'` create → §G3-STALE coarse fallback (warn + all non-3D views). `bimManager.registerElement`: ABSENT on bus path → door id never enters `level.childrenIds` (only legacy `CreateWallOpeningCommand.ts:182` does it). | Probe B Parts 1-3; Probe A DOOR case; `grep -n childrenIds packages/geometry-wall/src/WallStore.ts` (addOpening :1264-1323) |
| **window** | `wall.opening.create` (LIVE — `WindowPlanToolHandler.ts:161`) | **YES** | **YES** (child of host wall) | **NO** | Identical to door: `windowStore.add` (`WindowStore.ts:50` emits `'window'`) → §G3-STALE fallback; symbol pass `:3992`; tree via `wallStore.getWindow`. bimManager ABSENT on bus path. | same as door |
| **bathroomPod** | `bathroomPod.create` (LIVE — `BathroomPodPlanToolHandler.ts:330`) | pod: **NO** · members: **YES** | pod: **NO** · members: **YES** (as `plumbing_fixture` rows) | **NO** (pod AND members) | Handler `plugins/plumbing/handlers/CreateBathroomPod.ts` writes Immer `bathroomPod` store only (`affectedStores=['bathroomPod']`, :124). `bathroomPodMemberMirror` (`subscribeDirty`, attached `initTools.ts:1758`) projects members into `window.plumbingStore` via bare `store.add()` (`bathroomPodMemberMirror.ts:224`) → `bim-plumbing-added` → `PlumbingFragmentBuilder` 3D + `'plumbing'` storeEventBus create → §G3-STALE fallback → plan symbol pass `:3980`. The mirror BYPASSES `CreatePlumbingFixtureCommand`, so members get NEITHER VDT NOR bimManager (unlike hand-placed fixtures, which get bimManager). Pod itself: no mesh, no symbol, no store row any consumer reads. | `grep -c registerElement apps/editor/src/engine/bathroomPodMemberMirror.ts` → 0; Probe A PLUMBING case |
| **liftPart** | `lift.create` (LIVE — `LiftPlanToolHandler.ts:265`; parts ride `ev.parts`) | **as parent linework only** | **NO** (lift AND parts) | parent-only (`ev.liftId`), per-part **NO** | §FT-LIFT bridge (`initTools.ts:1687`) hands parts to `LiftCompoundMeshBuilder`; ONE group per lift, `elementRegistry.registerRoot(lift.id, group)` (`LiftCompoundMeshBuilder.ts:231`), children `selectable:false` → projection pipeline picks up the PARENT root; no per-part id, store, or event. VDT/bim register parent at `initTools.ts:1705-1706`. `registerElement` is `Map.set` — it does NOT dirty views; creation-time plan invalidation arrives via the enclosure families (walls/curtain-walls/openings, per the §FT-LIFT header), which the lift flow emits on their own channels. No lift store in SpatialTree's list → neither lift nor parts in the tree. | Probe B Part 1 (`lift.created` → `ev.liftId` only); `grep -n registerRoot packages/geometry-lift/src/LiftCompoundMeshBuilder.ts` |
| **grid** | `grid.add` (LIVE — `GridPlanToolHandler.ts:235/253/901`) · rival `grid.create` (plugin) is DEAD | **YES** (canvas pass) | **NO** (tree has no grid rows; `GridManagerPanel` is a separate panel) | **NO** | `grid.add` → E.5.4 bridge (`initBusHandlers.ts:2383`) → legacy `AddGridCommand` → `GridStore.add` → storeEventBus `elementType:'Grid'` → **BimKernel's own subscription** (`BimKernel.ts:159-210`): grids map (`getGrids()`), `bimGridRenderer.buildGrid` 3D line, `elementRegistry.registerSemantic/registerRoot`. Plan datums drawn from `bimManager.getGrids()` per canvas paint (`PlanViewCanvas.ts:387`). `'Grid'` is NOT in `GEOMETRY_ELEMENT_TYPES` → zero VDT traffic (Probe A). `grid.create` (plugin verb): Immer-only, CEB emits id-less `grid.created` → 0 subscribers → invisible everywhere. | Probe A GRID case; `grep -n "'Grid'" packages/core-app-model/src/BimKernel.ts:160`; zero-subscriber grep |
| **annotation** | `annotation.create` (LIVE for grid bubbles — `GridPlanToolHandler.ts:352`; text tools use legacy `commandManager` directly) | **YES** (canvas pass) | **NO** | **NO** (inapplicable) | §ANN-ONE-STORE: bus handler (`plugins/annotations/handlers/CreateAnnotation.ts`) sinks into the SUBSYSTEM `annotationStore` (`canonicalAnnotationSink.ts:147`) + Immer ledger. `planViewAnnotationRenderer.render` paints it on every `PlanViewCanvas` render (`PlanViewCanvas.ts:636`). Store emits `elementType:'annotation:<type>'` (`AnnotationStore.ts:121-126`) → not in GEOMETRY set → zero VDT traffic (Probe A) — harmless for the canvas pass, unmeasured for split-view repaint latency. | Probe A ANNOTATION case; `grep -n annotationStore packages/core-app-model/src/views/PlanViewCanvas.ts` |
| **dimension** | `dimension.create` (bus verb DEAD-ENDS; live linear-dim tool uses `window.commandManager` → `CreateAnnotationCommand` → subsystem store — `LinearDimPlanToolHandler.ts:269-275`) | **NO** | **NO** | **NO** | Handler writes ONLY the Immer `dimension` DTO store (`CreateDimension.ts:75-79`); its only consumers are `pluginStoreUndoAdapter` + `PluginRegistry` (undo bookkeeping). CEB `dimension.created` carries no id and has 0 subscribers. Complete absence — a bus-created dimension exists in no rendered store. | `grep -rln "stores\.dimension" apps/editor/src packages/core-app-model/src` → 2 files (undo adapter, PluginRegistry); zero-subscriber grep |
| **structural** | `structural.create` (handler registered `engineLauncher.ts:704`; UNREACHABLE from any user surface — lane 7B1b) | **NO** | **NO** | **NO** | Immer `structural` store only. `StructuralCommitter` — the only thing that could draw it — constructed NOWHERE (re-measured this lane: `grep -rn "new StructuralCommitter(" apps packages plugins --include=*.ts \| grep -v node_modules \| grep -vE '\.test\.\|__tests__'` → **0**). `PluginRegistry.ts:1260-1279` (lane 7B1b, uncommitted): tool dead at every layer — no matrix row, no panel, `__pryzmScreenToWorld` assigned nowhere. CEB `structural.created` id-less, 0 subscribers. | the greps above; Probe B Part 1 |
| **plumbing** | `plumbing.createFixture` (LIVE — `PlumbingPlanToolHandler.ts:200`) · rival `plumbing.create` (plugin DTO) is DEAD | **YES** | **YES** (`plumbingStore` is in SpatialTree's 8) | **NO** | Bus handler (`plugins/plumbing/handlers/CreatePlumbingFixture.ts:50-57`) delegates to legacy `CreatePlumbingFixtureCommand` via `window.commandManager`: `bimManager.registerElement` (:64) + `stores.plumbingStore.add` (:99) → `bim-plumbing-added` → `PlumbingFragmentBuilder` (`initBuilders.ts:679`) + `'plumbing'` create emit (`PlumbingStore.ts:40`) → §G3-STALE coarse fallback → symbol pass `:3980`. So bimManager YES, VDT NO. `plumbing.create`: Immer-only; CEB `plumbing.created` id-less, 0 subscribers. | Probe A PLUMBING case; `grep -n registerElement packages/command-registry/src/plumbing/CreatePlumbingFixtureCommand.ts` |
| **stair** | `stair.create` (LIVE — `StairPlanToolHandler.ts:246`; plugin deliberately does NOT claim it, §FIX-STAIR-CREATE-SHADOW) | **YES** | **YES** (`stairStore` is in SpatialTree's 8) | **NO** | E.5.4 bridge (`initBusHandlers.ts:2541`) → legacy `CreateStairCommand`: `bimManager.registerElement(stairId, baseLevelId)` (:340) + `stairStore.add` (:438) → `StairStore.ts:183` emits `'stair'` → §G3-STALE coarse fallback; mesh via `StairMeshBuilder` (store-subscribed, `initBuilders.ts:975`) which populates `stairPlanSymbolRegistry` → `stairSymbolTechnicalDrawingBridge.inject` (`EdgeProjectorService.ts:4006`). So bimManager YES, VDT NO. No `stair.create` CEB case and no initTools stair bridge — the legacy command IS the render path. | Probe A STAIR case; Probe B Part 1; pin `apps/editor/__tests__/StairCreateReachesGeometryStore.test.ts` |

## Where the wall-pattern wire (unconditional VDT+bim registration, §G3-STALE-FIX shape) would be sound — WIRED NOTHING

Preconditions per `ViewDependencyTracker.ts` §PLAN-MEMBERSHIP-RULE: (1) something draws it,
(2) its ids get registered. The wire is sound only where (1) already holds and the miss is (2).

- **door / window — SOUND.** Insertion point: `initTools.ts` §P2.3 arm, immediately after
  `elementId`/`type` resolution and BEFORE the dedup guard at `:1541` (wall pattern =
  registration unconditional; the guard gates only the mirror writes). Register `elementId`
  against `_legacyWall?.levelId ?? ''` in VDT + bimManager. Both preconditions hold: `'door'`/
  `'window'` are in `GEOMETRY_ELEMENT_TYPES` and the symbol passes are live. Effect: converts a
  per-door coarse ALL-views §G3-STALE sweep (+warn) into targeted level invalidation, and puts
  door/window ids into `level.childrenIds` on the bus path for the first time. ⚠ bimManager
  throws on empty levelId (`BimKernel.ts:243-268`) — keep the try/catch the wall arm uses, since
  a legacy-only wall record may be absent mid-migration.
- **stair — SOUND.** Insertion point: `packages/command-registry/src/stair/CreateStairCommand.ts:340`,
  `viewDependencyTracker.registerElement(stairId, baseLevelId)` beside the existing bimManager
  call (undo leg: `unregisterElement` beside `:700`). Precedent for VDT-in-command-registry:
  `CreateCurtainWallCommand.ts:201`. Precondition (1) holds (stair symbol bridge live).
- **plumbing — SOUND.** Insertion point: `CreatePlumbingFixtureCommand.ts:64`, same shape,
  `registerElement(id, this.payload.levelId)`; unregister beside `:123`. Precondition (1) holds.
- **bathroomPod members — SOUND, with the mirror as the site** (the audit already named this
  family "the bridge mechanism is the TARGET mechanism; the registration spine is the thing
  missing"). Insertion point: `bathroomPodMemberMirror.ts` `projectBathroomPodMembers` — register
  each member id against `pod.levelId` before `store.add(...)` in the project loop, and
  unregister in the reap loop. Because the mirror sees execute/undo/redo alike via
  `subscribeDirty`, registration would survive undo by construction — better than the event
  bridges. The POD's own id: registering it would violate precondition (1) (nothing draws the
  pod); leave it out.
- **liftPart — NOT SOUND per-part.** Parts are compound children by design (one root, children
  `selectable:false`, C104 R-8 / C15 §12); they have no per-part store, event, or plan
  representation of their own. The parent is already registered (`initTools.ts:1705-1706`).
  Nothing to wire without first inventing per-part identity, which is a contract change.
- **grid — NOT the wall pattern.** Registration alone changes nothing (`registerElement` is a
  `Map.set`; `'Grid'` events never reach `_onStoreEvent`'s set test). Adding `'grid'`/`'Grid'`
  to `GEOMETRY_ELEMENT_TYPES` is a §PLAN-MEMBERSHIP-RULE product decision (and today unnecessary:
  datums are a canvas pass fed by BimKernel's own StoreEventBus subscription).
- **annotation — NOT the wall pattern.** View-scoped canvas-pass family; `annotation:*` types are
  outside the geometry set by design. No VDT/bim wire applies.
- **dimension — NOT the wall pattern.** The defect is upstream of registration: the bus verb
  writes a store nothing renders. The sound fix is the §ANN-ONE-STORE treatment (sink into the
  rendered subsystem store), not a registration call on a dead record.
- **structural — NOT the wall pattern.** Precondition (1) fails outright: no consumer of the
  store was ever constructed. Registration would claim plan/tree presence for a family that
  draws nothing (the exact failure the membership rule's ⛔ warns about).

## What this lane did NOT establish

- Split-view Canvas2D repaint latency for the canvas-pass families (grid datums, annotations)
  after a create — the active-main-plan 30 ms driver was verified in code, the split pane was not
  driven end-to-end.
- Whether the enclosure-less lift (if `enclosureType` permits one) gets ANY creation-time plan
  invalidation — parts emit no store event and `registerElement` does not dirty.
- Browser-level pixels. Every (a) verdict is "the drawing/canvas pass reads a store this create
  writes, and an invalidation path reaches the view" — the layer above
  `committed-is-not-reachable`'s pure-function bar, but still below a screenshot.
