# WAVE 4a+4e — plan view + the three families that reach no renderer

Lane files: apps/editor/src/engine/initTools.ts ·
packages/runtime-composer/src/CommandEventBridge.ts ·
packages/core-app-model/src/views/ViewDependencyTracker.ts

## BEFORE (audit 2026-08-29, raw/synthesis.json seven_separate_facts)
29 / 26 / 21 / 21 / **renders_plan 15** / 21 / 13

renders_plan YES (15): annotation balcony bathroomPod beam boundary-line column door
floor furniture handrail plumbing roof stair wall window
NOT YES (14): ceiling(UNVERIFIED) curtain-wall(UNVERIFIED) dimension(NO) grid(NO)
lift(PARTIAL) liftPart(NO) lighting(UNVERIFIED) pool(PARTIAL) room(UNVERIFIED)
section-view(NO) selection(NO) slab(NO) structural(NO) water(NO-DISPUTED)

## MEASURED, running log

### The chain, as measured (not assumed)
storeEventBus.emit({elementType}) -> ViewDependencyTracker._onStoreEvent
  -> `if (!GEOMETRY_ELEMENT_TYPES.has(event.elementType)) return;`  (VDT.ts:676)
  -> _resolveLevelIdForEvent (VDT._elementLevelMap, populated ONLY by registerElement)
  -> if unresolved: §G3-STALE fallback = mark ALL non-3D views dirty + warn  <-- THE STORM
  -> _dirtyViewIds -> _flush -> onReprojectionNeeded (initScene.ts:1250) -> _reprojectView

So membership in GEOMETRY_ELEMENT_TYPES is necessary AND registerElement is necessary.
Adding a family to the set WITHOUT registering its ids reintroduces §G3-STALE.

### lighting — WIRE. Plan symbol builder PROVEN.
- Builder: packages/core-app-model/src/views/symbols/LightingPlanSymbolRenderer.ts
  `renderLightingSymbols` — consumed at PlanViewCanvas.ts:102/2292/2301 (called :660, :2092)
  AND apps/editor/src/engine/views/plan-canvas/PlanViewSymbolRenderer.ts:3.
  It is a STORE-DRIVEN symbol pass, not a `*PlanSymbolBuilder` class — which is why the
  audit's `grep -oE '[A-Za-z]+PlanSymbolBuilder'` (13 classes) could not see it.
- Emit: packages/geometry-lighting/src/LightingStore.ts:89 emits
  storeEventBus {elementType:'lighting'} on add/update/remove (§L-1087).
- THE SOURCE ITSELF NAMES THIS FIX AS THE DECLARED FOLLOW-UP, twice:
  LightingStore.ts:75-83 "⚠ DECLARED, NOT FIXED ... adding 'lighting' is the follow-up"
  packages/geometry-lighting/__tests__/lightingSemanticBusEmit.test.ts:18-30 same.
- Bridge: initTools.ts:2757 `lighting.created` — calls bimManager.registerElement at :2826
  (AFTER _ls.add) and NEVER viewDependencyTracker.registerElement. The one bridge of
  fifteen that does this.
- Ladder: AUTHORED ok / REACHABLE ok / COMPOSABLE **FAILS** (VDT filter) / CERTIFIED no.

### room — measuring. Plan representation PROVEN to exist (two independent ones).
- RoomBoundingLineBuilder.ts:114 stamps userData.version and 'room' IS in
  EdgeProjectorService.CACHEABLE_ELEMENT_TYPES (:1994-1999) -> projected LINEWORK.
- PlanViewCanvas._renderRoomFills (:2488, called :383 and :1959) reads window.roomStore.
- RoomStore.ts:273/377/415 emits storeEventBus {elementType:'room'} create/update/delete.
- RISK MEASURED: RoomStore.update has NO no-op guard, and geometryMutationEvents.ts
  NON_CASTER_BIM_EVENTS records 'bim-room-updated' as firing "hundreds per batch"
  (L-1154/L-1155). Rooms are NOT in VDT._elementLevelMap -> adding 'room' alone would
  route every one of those into the §G3-STALE all-views fallback.


---

## RESULT — WAVE 4a + 4e, 2026-08-31

### Code changed (3 files, 0 committed)
1. `packages/core-app-model/src/views/ViewDependencyTracker.ts` — `'lighting'` and
   `'room'` join `GEOMETRY_ELEMENT_TYPES`, under a written §PLAN-MEMBERSHIP-RULE
   (two preconditions: something draws it AND its ids are registered).
2. `apps/editor/src/engine/initTools.ts` — §FT-LIGHTING now registers VDT +
   bimManager BEFORE `lightingStore.add()` (§G3-STALE-FIX order, copied from the
   wall §P2.1 bridge, NOT from the C11 §11 legend); the stale
   "lighting is NOT in GEOMETRY_ELEMENT_TYPES … by design" header is corrected.
   NEW §FT-ROOM-PLAN bridge registers rooms in VDT off the STORE's own
   `bim-room-added/updated/removed` DOM events.
3. `packages/core-app-model/src/views/__tests__/lightingAndRoomReachThePlanView.test.ts`
   — NEW. 10 tests, 4 executed controls.

### BEFORE / AFTER, measured
| measurement | before | after |
|---|---|---|
| probe suite vs HEAD tracker (`git show HEAD:` copy, run, deleted) | **3 pass / 7 FAIL** | — |
| probe suite vs this tree | — | **10 pass / 0 fail** |
| `packages/core-app-model` `npx vitest run src/views` | 34 files / 327 tests | **35 / 337 pass** |
| `packages/geometry-lighting` full suite | — | **15 files / 159 pass** |
| root `tsc --noEmit -p tsconfig.json` | 2 errors | **2 errors — SAME two, both foreign** |
| `renders_plan` out of 29 | **15** | **17** |

Root tsc's 2 errors are `CommandEventBridge.ts(428/435) TS6196 CommittedRoof /
CommittedColumn declared but never used` — a CONCURRENT lane's uncommitted WIP
(`git show HEAD:…CommandEventBridge.ts | grep CommittedRoof` -> **no output**;
`git diff --stat` -> 170 insertions). Not mine, not cleared, not touched.

### PART 1 dispositions
| family | disposition | evidence |
|---|---|---|
| **lighting** | **WIRE — DONE** | symbol = `renderLightingSymbols` (store-driven, not a `*PlanSymbolBuilder` class, which is why the audit's class grep missed it); emit = `LightingStore.ts:89`; the missing leg was invalidation, named as the declared follow-up in `LightingStore.ts:75-83` and in its own test file. |
| **room** | **WIRE — DONE** | symbol = BOTH `RoomBoundingLineBuilder` linework (`'room'` already in `CACHEABLE_ELEMENT_TYPES`) and `PlanViewCanvas._renderRoomFills`; emit = `RoomStore.ts:273/377/415`. |
| **liftPart / lift cabin** | **DOCUMENT** | absence measured on BOTH mechanisms: 13 `*PlanSymbolBuilder` classes (no Lift), AND the 10 store-driven `PlanViewCanvas._render*` passes (no lift). A list entry would claim plan and draw nothing. |
| **pool** | **DOCUMENT (water half only)** | basin walls + floor slab already project. |
| **water** | **SETTLED — DOCUMENT, dispute resolved** | THREE facts, each by command: (a) VDT registration ALREADY EXISTS (`initTools.ts:1985`); (b) no plan symbol on either mechanism; (c) **no `storeEventBus` emit of `elementType:'water'` exists anywhere** — the elementType census over `packages apps/editor/src plugins` returns ZERO. Adding `'water'` to the Set is INERT, not a fix. |

### PART 2 — grid / structural / section-view. NONE is WIRE. TWO ARE REFUTED.
⭐ **The brief predicted a fourth HARD-STOP-3 instance in this wave. There were TWO.**

- **grid — REPLACE (rival exists, and the family is NOT invisible).**
  The user's grid tool dispatches **`grid.add`**, not `grid.create`:
  `GridPlanToolHandler.ts:235/253/901` -> `initBusHandlers.ts:2382` -> `AddGridCommand`
  -> legacy `gridStore` -> `bimManager.setGridStore` (`engineLauncher.ts:429`) ->
  `BimGridRenderer` (`BimKernel.ts:151`). **It draws in PLAN too**, via the same
  store-driven mechanism that hid lighting: `PlanViewCanvas._renderBimGridDatums`
  (:921) reads `window.bimManager.getGrids()`. Its bubbles are `annotation.create`
  (`GridPlanToolHandler.ts:352`), and `annotation` is already `renders_plan: YES`.
  ⛔ Wiring `grid.created` (which `CommandEventBridge.ts:1242` emits) into a bridge
  would build a SECOND grid render path. The dead half is `grid.create` +
  `GridCommitter` (0 construction sites) + plugin `GridsState`.

- **section-view — REPLACE (rival exists, same shape).**
  The user's section marker dispatches **`section.mark.create`**, not
  `section.create` — `SectionPlanToolHandler.ts:120-122` says so in its own
  comment. It mints a `'section-mark'` ANNOTATION rendered by
  `PlanViewAnnotationRenderer._renderSectionMark` (:1777, dispatched :843) and
  `AnnotationRenderLayer` (:505), hit-tested (:654), dragged
  (`PlanViewInteraction.ts:1448/1895`), and consumed by `EdgeProjectorService`
  (:1191/:1264/:1284) to derive the cut. Section VIEWS are a first-class rendered
  view type (`EdgeProjectorService` :1239/:2313-2479/:4354, `PlanViewCanvas`,
  `PlanViewManager` :744/:1172/:1309, `SplitViewManager` :936, and
  `ViewDependencyTracker._getAffectedViews` marks EVERY section view dirty on any
  geometry change). ⛔ Constructing `SectionViewRenderer` / `SectionViewCanvasHost`
  would be a rival of that live path.

- **structural — REMOVE (rival = `column`), and the plugin already says so.**
  `plugins/structural/src/handlers/MoveStructural.ts:71` `STRUCTURAL_MOVE_UNREACHABLE`:
  *"THERE IS NO STRUCTURAL RUNTIME FAMILY … it is schema-only … The real structural
  element is `column`."* Confirmed: no `structuralStore`, no fragment builder, no
  renderer anywhere. The refusal already redirects correctly; the residue is
  deletion of a schema-only family, which needs an ADR, not a bridge.

### NEW measured defect, in my file, DELIBERATELY NOT FIXED
`'stair-landing'` and `'stair-railing'` in `GEOMETRY_ELEMENT_TYPES` **match nothing**.
`StairLandingStore.ts:42/66/90` emits `'stairLanding'`; `StairRailingStore.ts:70/97/115/126`
emits `'stairRailing'`. The hyphenated strings are `userData.elementType` on MESHES
(`StairLandingBuilder.ts:67`, `StairRailingBuilder.ts:288/301`) — a different vocabulary.
⛔ NOT "fixed" by correcting the spelling: precondition (2) fails — no site anywhere
calls `registerElement` for a landing or a railing, so the corrected spelling would
route a 31-segment railing run (C95 §15.5) into 31 §G3-STALE all-views sweeps.
Pinned as control C4 in the new suite, and written into the Set's docblock.

### Follow-ups this lane could not take (files outside its scope)
1. `packages/geometry-lighting/src/LightingStore.ts:75-83` and
   `packages/geometry-lighting/__tests__/lightingSemanticBusEmit.test.ts:18-30` still
   say the `'lighting'` membership is "DECLARED, NOT FIXED". **It is now fixed.**
   Both notes are stale and must be corrected in the same commit as this lane.
2. `packages/core-app-model/src/views/ViewDependencyTracker.ts:411` `setLevelResolver`
   is AUTHORED and has **zero production callers** — the general answer to
   precondition (2) that no bridge uses.
