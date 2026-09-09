<!--
  LANE OUTPUT — Plan / elevation / section documentation quality
  Workflow task w01dhdpp4. Produced 2026-09-09 and captured to the repo the same day.

  ⚠ THIS IS A LANE REPORT, NOT A CONTRACT. It is an audit's own words, verified by its
  own adversarial passes and no further. Where it and the code disagree, the code wins
  and this file is stale. Line numbers rot fast — re-read before acting on one.

  ⭐ Captured because the fixes it drove ship across several commits, and the REASONING
  behind a one-line change is the part that is expensive to reconstruct. Several findings
  here were deliberately NOT implemented; the commits say which and why.
-->

# PRYZM Documentation Quality — Implementation Plan
### Plan / elevation / section · lane opened by the founder 2026-09-08
**Written against HEAD `5e463032` (2026-09-09 08:02).** Every line number below was re-read at this SHA, not carried from the audits — three commits landed *after* the dimension audits were written (`584aaab2` 07:14, `9babe6f5` 07:22, `5e463032` 08:02) and they invalidate parts of four of them. Corrections are flagged inline.

---

## 1 · DO THE FIVE COMPLAINTS SHARE ONE ROOT?

**No. There are two shared roots and three genuinely independent defects.** Forcing them into one story would mis-order the work, because the two shared roots explain *different* complaints and the three independents are not reachable from either.

### Shared root A — the family-declaration ladder (six hand-typed vocabularies, nothing checks them)

"What family is this line, and may the user govern it?" is answered independently by six lists that must agree and are maintained by hand:

| # | List | Location | Entries | Drives |
|---|---|---|---|---|
| 1 | `ELEMENT_TYPE_TO_PROJECTION_LAYER` | `apps/editor/src/engine/views/EdgeProjectorService.ts:203-269` | ~60 spellings | which ISO layer native linework lands on |
| 2 | `ISO_LAYER_TO_VG_CATEGORY` | `packages/core-app-model/src/drawing/DrawingLayerIdentity.ts:96-135` | 19 | layer → VG category (canvas colour/visibility) |
| 3 | `penCategoryForLayerTag` | `packages/core-app-model/src/drawing/PenWeightTable.ts:452-470` | 12 regex arms | layer → pen category (**weight + dash**) |
| 4 | `VisibilityIntentDefaults.ELEMENT_TYPES` | `packages/core-app-model/src/presentation/VisibilityIntentDefaults.ts:15-46` | 20 | the rows the Visibility Intent panel renders |
| 5 | `OverridePanel.CATEGORIES` | `apps/editor/src/ui/OverridePanel.ts:247-269` | 13 | the per-view quick-hide tick list |
| 6 | `CATEGORY_TO_DXF_LAYER` | `packages/core-app-model/src/presentation/VGSceneApplicator.ts:87-102` | 14 (11 distinct layers) | export-side layer styling |

(A seventh, `ELEMENT_TYPE_REGISTRY` at `packages/core-app-model/src/presentation/ElementTypeRegistry.ts:31`, declares in its own header *"Adding new element type requires one entry here only"* — that sentence is false, and its only live consumer is `BimGridRenderer.ts`. An eighth, `SVGCompositeRenderer.ISO_LINE_WEIGHTS` at `packages/file-format/src/export/sheets/SVGCompositeRenderer.ts:62-82`, is the export weight ladder.)

Measured divergences at HEAD:

- `A-PLMB` → list 2 says `plumbing`; list 3 has **no arm** → `'projection'` → `rulesFor()` misses → `__default__` → seeded from **wall** (`VisibilityIntentDefaults.ts` `const category = elementType === '__default__' ? 'wall' : elementType`). The authored `plumbing: pen(0.13,'#374151')` (PenWeightTable.ts:154) has never been reachable.
- Same for `A-GRID` / `S-GRID` / `A-LEVL` — `grid: pen(0.13,'#0000cc',[8,4])` and `level: pen(0.13,'#334155',[5,3])` (PenWeightTable.ts:155,157) are **authored datum pens that no line can resolve to**.
- Same for `A-AREA` (`spaceEnvelope`, live producer `apps/editor/src/engine/SpaceEnvelopePlanSymbolBuilder.ts:73`) — and worse, there is no `spaceEnvelope` pen row either, so it needs two rows not one.
- `S-COLS` (written by `ColumnPlanSymbolBuilder`) does **not** match `/A-COLS|column|beam/i` → `'projection'`.
- `A-BEAM` **does** match that regex via the `beam` alternative → returns `'column'`. The `beam` intent row can never govern a beam. (Harmless numerically today — the column and beam pens are identical — and a latent wrong answer, which is worse than a fallback.)
- `OverridePanel.CATEGORIES` offers `railing` and `curtainwall`; nothing ever resolves to either id (`Handrail`→`A-STRS`→`stair`; `CurtainWall`→`A-WALL`→`wall`). **Two enabled checkboxes that cannot match anything** — a direct C102 V-RE-1 breach.
- `OverridePanel.CATEGORIES` has **no `lighting` row** — added to lists 1, 2, 3 and 4 by `584aaab2` this morning, missed on 5 and 6. **The four-site rule was obeyed at four sites out of six, today.**
- `ISO_LINE_WEIGHTS` has no `A-FURN`, `A-PLMB`, `A-CEIL`, `A-BEAM`, `A-LGHT`, `A-CONS`, `A-AREA`, `A-GRID`, `A-LEVL` → all export at `projection-visible` 0.25 mm, roughly double their screen pen.

**This root explains: #5 (rooms), most of #3 (unreadable lines), the classification half of #4 (lighting, now fixed), and the "my line-type row does nothing for this family" half of #2.**

### Shared root B — several independent authorities over "does this appear in this view"

Six painters and two consumers each re-derive the answer:

| Surface | Authority it obeys | Authority it ignores |
|---|---|---|
| Native projection loop (`EdgeProjectorService.ts:2585` `_symbolGate`, 19 sites) | visibility intent (family) | — |
| 15 symbol injectors | `_symbolGate` at the call site | per-**element** intent (no `elementUUID` on the line) |
| `VGSceneApplicator.applyToProjectionLayers` → `drawing.layers.setVisibility` | VG store | **nothing reads its write** — dead |
| `PlanViewCanvas.render()` (:431 traverse) | VG store + intent pen | `Object3D.visible` |
| `_renderRoomFills` (:2488) | `vgGovernanceStore` only | visibility intent entirely |
| `renderLightingSymbols` (`LightingPlanSymbolRenderer.ts:242`) | **nothing** — filters on `levelId` alone | everything |
| 3D (`VGSceneApplicator.applyToMesh` + raw `scene.traverse` in `ProjectVisibilitySection.ts:167`) | `Object3D.visible` + VG store | the intent's `visible` |
| `SVGCompositeRenderer.setTechnicalDrawing` (:232) | layer-**name** substring `'hidden'` | `child.visible`, the intent, the pen table |

**This root explains #1 (furniture still renders) in full**, and is why the same gesture gives opposite answers in plan and elevation.

### The three independents

1. **#2's headline is a permissions gate, not a classification gate.** `VisibilityIntentPanel` is the sole writer of `line.style` (repo-wide: only :347-349 and :1286). Four `isSystem` gates block it — the form renders `disabled` (:264), `bindEvents` returns at :772 before wiring `[data-appearance]`, `VisibilityIntentStore.update()` returns `null`, and `UpdateVisibilityIntentCommand.canExecute` refuses. Every shipped intent is `isSystem: true`, and the founder's panel names one ("Architectural Documentation (Auto)"). ⚠ **Correction to the audit:** there *is* a visible reason — `VisibilityIntentPanel.ts:205-211` renders a purple read-only banner naming Duplicate as the escape hatch. So the symptom is "the escape hatch is one gesture away and undiscovered", not "silent refusal". Half the proposed fix already exists.
2. **#3's largest single term is a units bug, not a classification bug.** `PlanViewCanvas.ts:520` — `const _penPx = _pen.widthMm * SCREEN_PX_PER_MM` — with `SCREEN_PX_PER_MM = 96/25.4 = 3.7795` (`DrawingConstants.ts:73`). It reads neither `output.scale` nor the canvas zoom, while the annotations beside it travel the full paper→world→screen chain via `packages/core-app-model/src/annotations/paperScale.ts` (`paperMmToPx`, `resolveScaleDenominator`, `pxPerWorldMetre`). On a fitted plan the linework draws at 40-75 % of its own paper weight while the room tags are correct — which is exactly what makes it look starved.
3. **#4's remaining half is a missing producer.** `grep -rn "skipIn" packages/geometry-lighting/src/` → **zero hits at HEAD**. The 672-face luminaire is fully edge-projected, and there is no `LightingPlanSymbolBuilder` at all — the symbol is painted on the canvas.

**Verdict: two roots, three independents. Plan accordingly.** The unifying-story temptation here is "one visibility authority", and it is only half true: it does not explain the disabled line-style control, the mm→px constant, or the missing lighting producer.

---

## 2 · RANKED FIXES

Ranked by (founder-visible improvement) × (low risk). **LC** marks low-confidence items.

| # | Complaint | Fix | Eff | Risk | Files | Reuses |
|---|---|---|---|---|---|---|
| 1 | **#1 furniture** | **Category checkbox must dispatch the CATEGORY command, not N per-element hides.** `applyCategoryVisibility` (`ProjectVisibilitySection.ts:288-294`) loops `applyElementVisibility` → `writeElementVisibilityIntent` → `view.hideElement` with `targetKind:'element'`. `GraphicsRulesEngine` passes `{elementId: ctx.elementId, elementType: category, category}` — and `ctx.elementId` is **permanently undefined on symbol lines**. So the browser writes the one target kind that can never match a sofa symbol. Swap to `view.setCategoryVisibility`. | S | L | `apps/editor/src/ui/ViewBrowser/panels/unified-browser/ProjectVisibilitySection.ts` | `SetCategoryVisibilityInViewCommand` (`packages/command-registry/src/vg/`), bus verb `view.setCategoryVisibility` (`initBusHandlers.ts:2443`) — already used end-to-end by `OverridePanel` | 
| 2 | **#1 furniture** | **One honest `_activeViewId()`.** `window.viewDefinitionStore?.getActiveId?.()` is permanently `undefined` — the only definition of that name is `ToolRegistry.ts:125`. Arm 2 is nulled by ViewController on every 3D activation. **Four copies**: `ProjectVisibilitySection.ts:48`, `RadialMenu.ts:236`, `initUI.ts:3381`, `WallFragmentBuilder.ts:714`. Delete the dead arm, put the read in one exported helper, and **refuse loudly in 3D** naming the view the exclusion would apply to. | S | L | those four files | `viewController.currentViewDefinitionId` already carries the §ANN-VIEW-INFER plan inference (`ViewController.ts:1562-1577`) | 
| 3 | **#3 readability** | **Make the authored-but-unreachable pens reachable.** Add `isPlumbing` / `isGrid` / `isLevel` / `isSpaceEnvelope` arms to `penCategoryForLayerTag`, keyed off `ISO_LAYER_TO_VG_CATEGORY`'s longest-prefix-wins so `S-COLS` and `S-GRID` resolve; move `beam` out of the column regex into its own arm; mint the one missing pen row (`spaceEnvelope`). **No pen-table value is invented** — plumbing/grid/level already exist. Today these all draw at 0.25 mm solid black (the wall pen). | S | L | `PenWeightTable.ts`, `DrawingLayerIdentity.ts` | `ISO_LAYER_TO_VG_CATEGORY` + `tagIsInFamily` + longest-prefix-wins (`DrawingLayerIdentity.ts:101-186`); `apps/editor/__tests__/viewIntentGovernsEveryCategory.test.ts` as the outcome harness | 
| 4 | **#3, all views** | **Wire the poché plane.** `5e463032` landed `PochePlane = 'xz'\|'xy'\|'zy'` on `PocheFillBuilder` **and explicitly did not wire it** ("⚠ WIRING NOT DONE"). Five callers still default to `'xz'`: `PlanViewCanvas.ts:2685`, `PlanViewFillRenderer.ts:140`, `CutSectionExtractor.ts:62`, `DxfExportService.ts:344`, `SVGCompositeRenderer.ts:170`. Sections/elevations still hatch nothing on screen **and in DXF/SVG/PDF**. | S | L | those five | `PlanViewCanvas.viewPlaneFrame()` (:328-336) already publishes `{isVertical,hWorldAxis,hSign}`; `_vertexToHV` (:337-342) is the correct reduction | 
| 5 | **#4 lighting** | **Retire the cyan literal.** `LightingPlanSymbolRenderer.ts:104` `ctx.lineWidth = 1.25` (heavier than a projected wall's 0.945 CSS px) and `:13-16` `#0ea5e9` on a black-and-white drawing. Give `renderLightingSymbols` a `SymbolPen` parameter exactly as L-280 did for door/window, resolved by the caller at `PlanViewCanvas.ts:2292`. **Also gate it** — it currently filters on `levelId` alone, so post-`584aaab2` a user who ticks Lighting off suppresses the mesh and keeps the blue disc. | S | L | `LightingPlanSymbolRenderer.ts`, `PlanViewCanvas.ts` | `SymbolPen` + `renderSymbol` in `packages/core-app-model/src/drawing/SymbolicRuleRenderer.ts:117`; `makeSymbolInjectionGate` | 
| 6 | **#5 rooms** | **Give rooms a category — row AND reader in one commit.** (a) add `'room'` to `ELEMENT_TYPES` and `OverridePanel.CATEGORIES`; (b) render the panel's rows from `ELEMENT_TYPES ∪ Object.keys(intent.elementRules)` (`VisibilityIntentPanel.ts:240`) — **no migrator backfills element types** (`migrations/IntentSchemaMigrations.ts:29`, v5, zero `elementRules` transforms), so a user-authored duplicate would silently not get the row; (c) teach `resolveRoomColourIntent` (`RoomColourIntent.ts:127`) to consult `visibilityIntentStore` first with `vgGovernanceStore` as fallback. ⛔ (a) without (c) ships a row that governs nothing. | M | M | `VisibilityIntentDefaults.ts`, `OverridePanel.ts`, `VisibilityIntentPanel.ts`, `RoomColourIntent.ts` | the whole colour-mode cascade: `ROOM_COLOUR_MODE_CHOICES`, `SetRoomColourModeCommand`, bus `room.setColourMode`, `RoomColourSystem.resolveForMode`, per-view+per-model tiers, snapshot persistence | 
| 7 | **#2 line type** | **Copy-on-write for system intents.** Re-enable the appearance form, wire it, and on first write to an `isSystem` intent auto-run the existing `duplicateIntent()` body then apply the patch to the copy. Keep the read-only banner as the pre-write explanation. ⛔ Never make system intents mutable — `cloneSystemIntents()` byte-compares the frozen seeds. ⚠ `duplicateIntent` binds only `this.contextViewId` (:945): on his 13 views this repairs **one**. Ship a "rebind all views currently on this intent" action with it or the founder reports it again. | M | L | `apps/editor/src/ui/VisibilityIntentPanel.ts` | `duplicateIntent()` (:923-964) already does create+bind in one gesture; `OverridePanel.promoteToIntent()` (:332-357) is the same move | 
| 8 | **#1 furniture** | **Stamp `elementUUID` on symbol linework.** Measured census at HEAD: of the builders that call `registerSegmentUUID`, only **three** also stamp `userData.elementUUID` — `OpeningElevationSymbolBuilder.ts:664`, `BoundaryLinePlanSymbolBuilder.ts:290`, `SpaceEnvelopePlanSymbolBuilder.ts:213`. (The audit's "17 of 18" is wrong; it is 15 of 18.) Add the stamp beside every `registerSegmentUUID`, and give `PlanViewCanvas` **one** private id resolver used by all four sites — render (:472), `_lineIsDrawn` (:2865), `hitTest` (:1476), highlight (:2380); the last two already resolve correctly via `lookupElementUUID` and the first two do not. | S | M | 15 `*PlanSymbolBuilder.ts` + `PlanViewCanvas.ts` | `lookupElementUUID` (`DrawingSelectionIndex.ts:67`) — do not build a second index | 
| 9 | **#3 readability** | **Linework must travel the paper transform.** Replace `_pen.widthMm * SCREEN_PX_PER_MM` with `paperMmToPx(widthMm, resolveScaleDenominator(viewDef.output), pxPerWorldMetre(w2s))`. ⚠ **Both sites or neither** — `:520/:524` (live) and `:2052` (`renderFromPipelineResult`, dead today). ⚠ **Re-derive the floor in the same change** or zooming out collapses the ladder onto `minStrokePx` — the exact L-288 defect. ⚠ The audit's proposed guard is inverted: at equal zoom **1:100 is 2× 1:50**, not the reverse. | M | M | `PlanViewCanvas.ts`, `CanvasRenderScale.ts` | `packages/core-app-model/src/annotations/paperScale.ts` implements the whole correct transform and its header states it as normative | 
| 10 | **#4 lighting** | **`skipInPlan` + `LightingPlanSymbolBuilder`, one commit, never separately.** `584aaab2`'s own body rules on this: *"adding one today would draw the symbol ON TOP of the blob and make it worse."* Stamp `skipInPlan`/`skipInElevation`/`skipInSection` in `LightingFragmentBuilder`'s existing traverse, and inject real `LineSegments` on `A-LGHT`. Give the injector its **own** view-type set including `'ceiling-plan'` — `PLAN_SYMBOL_INJECTION_VIEW_TYPES` (`EdgeProjectorService.ts:352`) excludes RCP *on purpose*, and an RCP is where luminaires belong. | L | M | `packages/geometry-lighting/src/`, `EdgeProjectorService.ts`, `LightingPlanSymbolRenderer.ts` | template `packages/geometry-plumbing/src/PlumbingPlanSymbolBuilder.ts` (113 lines); `LineworkBuf` in `TreePlanSymbolBuilder.ts:78-135`; `geometry-lighting/package.json` already declares the three deps a builder needs — **no lockfile churn** | 
| 11 | **all** | **The family-declaration gate.** A `tools/ga-gate/check-family-vocabularies.ts` comparing the six/eight sets **in both directions**, shrink-only baselined. Run as a report first — it names every missing row before any fix, which is precisely what was missed at 07:14 today. | M | L | `tools/ga-gate/` | `tools/ga-gate/check-contract-index-equivalence.ts` is a working set-vs-set gate to copy; `publishedStoreGlobals()` in `apps/editor/__tests__/InspectCategoryCoverage.test.ts:44` is the scanner | 
| 12 | **elev/sect** | **Datums + grid on the live path.** `PlanViewManager` is the DOC-19B route for elevation and section (`ViewController.ts:1513-1521`) and its five `applyToProjectionLayers` sites (:527, :656, :904, :1066, :1151) inject **nothing**. The only injectors are `ViewController.ts:710-712` (guarded `viewType === 'elevation'`, so sheets exclude sections), `:2310-2312` (legacy preset) and `SectionViewService.ts:227-229` (legacy tool). ⚠ Do the grid half first: `PlanViewCanvas.ts:388` has a rival canvas datum painter, so wiring both double-draws. | S | M | `PlanViewManager.ts`, `ViewController.ts` | `levelDatumLineBuilder` / `sectionGridLineBuilder` are built, exported and working | 
| 13 | **#3 export** | **Retire `ISO_LINE_WEIGHTS` / `PRYZM_WEIGHT_TO_MM` as rival authorities.** Derive the export weight from `resolvePen(zoneFromLayerName(tag), penCategoryForLayerTag(tag))`. Today `A-FURN`/`A-PLMB`/`A-CEIL`/`A-LGHT` export at 0.25 mm instead of 0.13, and cut wall == projected wall on every sheet. ⚠ Symbol builders also stamp `material.linewidth` literals (e.g. `DoorPlanSymbolBuilder` `LW_CUT = 2`) which the renderer prefers — a **third** authority that must be retired in the same change. | M | M | `SVGCompositeRenderer.ts`, `ViewportToSvg.ts`, `DxfExportService.ts` | `penZoneFromLayerName` / `penCategoryForLayerTag`; `SVGCompositeRenderer` already emits in paper mm | 
| 14 | trap removal | **Delete four dead surfaces before anyone edits them.** `apps/editor/src/engine/views/plan-canvas/PlanViewSymbolRenderer.ts` (144 lines, **zero importers**, cited as live in four comments incl. `ViewDependencyTracker.ts:102`); `plan-canvas/PlanViewFillRenderer.ts` (zero importers, cited as live in three); `PlanViewCanvas.renderFromPipelineResult`/`scheduleWorkerRender` (zero callers, a full rival painter that would silently ignore every intent override the day the worker is switched on); `DataPanelRenderer.ts:285-293` (calls `getActiveTemplate()` and `categoryStyles`, **neither of which exists** on `VGGovernanceStore`). | S | L | those four | — removal only | 
| 15 | **#2 line type** | **Wire or withdraw the two rival "Visual Style" selects.** `ViewPropertiesPanelBuilders.ts:408-431` (wireframe/hiddenLine/shaded/…, through `_fireSetViewOutput`) and `ViewPropertiesPanel.ts:394-411` (Consistent/Textures/Realistic, writing `(view as any).visualStyle` **direct, bypassing the bus**). Repo-wide, the only readers of `output.visualStyle` are the validator and the sync comparator. `hiddenLine` maps cleanly onto `resolveOcclusionDisposition`; the 3D-only options should be removed from a documentation view. | M | M | those two files, `ViewScope.ts` | `resolveOcclusionDisposition(viewOutput, scope)` (`ViewScope.ts:205-210`) — already the one resolver for that semantic, and `9babe6f5` just gave it a UI | 
| 16 | **#1 furniture** | **Fix the fake spec.** `elementFilterWritesIntent.spec.ts:73` stubs `viewDefinitionStore = { getActiveId: … }` — a method that does not exist in production, so the suite green-lights a path the app can never take. Its negative case varies both arms together (:182), so "3D active, viewController present, id null" is untested. | S | L | that spec | its `projectedPen()` harness already drives the real `graphicsRulesEngine` | 
| 17 | hygiene | **Delete the dead `setVisibility` write.** `VGSceneApplicator.ts:635` (+ :683/:690/:697) calls `drawing.layers.setVisibility`, which OBC implements as `child.visible = visible` — and **no consumer reads it**: `PlanViewCanvas` uses `traverse` (:431) with no `.visible` test, and `grep -c '\.visible'` over `SVGCompositeRenderer.ts` and `DxfExportService.ts` returns **0** in both. Delete rather than honour: honouring switches on a second VG-driven hide duplicating the canvas's own, and OBC's `assign` also hides at insertion time. | S | L | `VGSceneApplicator.ts` | — | 
| 18 | **#3** *(LC)* | **A composited-contrast floor.** BEYOND at `pen(0.09,'#6b7280',null,0.55)` composites to ≈1.25:1 on white — WCAG's non-text floor is 3:1. ⚠ **LOW CONFIDENCE ON THE FIX, not the measurement**: I re-derived it and no colour/alpha choice reaches 3:1 while the stroke is sub-device-pixel. This item is **gated on #9**; do not attempt it as a pen-table edit (C09 §4.6.4e(a) forbids inflating the table, and the arithmetic agrees). | S | M | `PenWeightTable.ts` (after #9) | `packages/file-format/__tests__/sheet-paper-text-standard.test.ts` is the finished "numbers in a spec, assertions in a gate" template | 

**Items 1 + 2 together are the founder's literal complaint.** Neither alone closes it: #2 makes the write land, #1 makes it match.

---

## 3 · THE ONE THAT UNBLOCKS THE OTHERS

### Name it: the family-declaration gate (#11) — run as a **report**, before any per-family fix.

**The argument.** Four of the five complaints resolve to "add a row for family F to table T", and this repo has now shipped that shape incompletely **twice in the last twenty-four hours**:

- `584aaab2` (07:14 today) added `lighting` to tables 1, 2, 3 and 4 and missed 5 (`OverridePanel.CATEGORIES`) and 6 (`CATEGORY_TO_DXF_LAYER`) and 8 (`ISO_LINE_WEIGHTS`). **The founder still cannot hide lighting from the panel he reaches for, on the day it was "fixed".**
- The `A-AREA` row landed 2026-09-05 in table 2 with a comment in the same file (`DrawingLayerIdentity.ts:122-124`) recording that table 3 was skipped. Four days later it is still skipped, and space-envelope linework draws at the wall pen.

The gate does not fix anything. It **names every missing row before you touch a file**, which converts each subsequent per-family fix from "four of six sites and it looks done" into a closed set. It is half a day, it is shrink-only, and it is modelled on a gate that already exists and works (`check-contract-index-equivalence.ts`, which was minted for exactly this failure shape on the contract index).

**Argue the alternative and reject it.** The tempting "one" is the structural resolver (§5). It is the right destination and it is the wrong first move: it would inherit all six vocabularies' silent disagreements into one function and make them harder to see, not easier. `makeSymbolInjectionGate`'s own **fail-open** policy (`SymbolInjectionGate.ts:114/120/145`) is safe for a boolean and has **no safe default for a pen** — failing open into "no pen" reproduces the flat ladder L-288 fixed. Build the vocabulary first; compose the resolver on top of a vocabulary that is known-consistent.

### Two hard ordering constraints, narrower than "the one", and both non-negotiable

1. **`skipInPlan` and the lighting symbol ship in the SAME commit.** `skipInPlan` alone is a silent deletion — `packages/geometry-window/__tests__/WindowMeshSkipInPlan.test.ts:32` records exactly that trap. A symbol alone draws on top of the blob and makes the founder's screenshot worse; `584aaab2`'s own closing paragraph rules on this.
2. **`elementUUID` (#8) lands before anyone widens `PLAN_INCREMENTAL_SAFE_TYPES`.** `_graftDirty` keys both passes on `userData.elementUUID`, so a symbol line can today be neither removed nor replaced on the graft path. Widening the safe-types set without the stamp turns a full-reprojection cost into a stale-symbol correctness bug.

---

## 4 · QUICK WINS — landable today, founder-visible, specific values

**Bundle A — "hiding furniture actually hides furniture" (items 1 + 2, ~half a day).**
- `ProjectVisibilitySection.applyCategoryVisibility` stops looping and dispatches one `view.setCategoryVisibility` with `{targetKind:'elementType', targetId:'furniture', visible:false}`. One command, one undo entry, and it matches symbol lines because the pen's intent target carries `elementType: category` derived from the stamped layer tag.
- `_activeViewId()` loses the `getActiveId?.()` arm at all four sites and gains a named refusal when the active pane is 3D.
- **Ship a one-line probe with it, in the same commit**: `console.log('[ProjectVisibilitySection] viewId=', viewId, 'elem=', elemId)` before the guard in `writeElementVisibilityIntent`. It settles, in one founder session, which of the three surfaces he used — the single fact no audit could establish from source.

**Bundle B — the unreachable pens (item 3, ~2 hours). These are authored values; nothing is invented.**

| Layer | Today (via `'projection'` → `__default__` → wall) | After |
|---|---|---|
| `A-PLMB` | 0.25 mm `#000000` solid | **0.13 mm `#374151`** solid *(`PenWeightTable.ts:154`)* |
| `A-GRID`, `S-GRID` | 0.25 mm `#000000` solid | **0.13 mm `#0000cc` dash [8,4]** *(:155)* |
| `A-LEVL` | 0.25 mm `#000000` solid | **0.13 mm `#334155` dash [5,3]** *(:157)* |
| `S-COLS` | 0.25 mm `#000000` solid | **0.25 mm `#1e293b`** (column PROJECTION) |
| `A-AREA` | 0.25 mm `#000000` solid | new `spaceEnvelope` row — propose **0.13 mm `#64748b`** |
| `A-BEAM` | resolves to `column` (identical pen, wrong name) | own arm, so the `beam` intent row becomes reachable |

Every one of these currently draws **as heavy and as black as a structural wall**. This is the same change that made the founder's plan lighter at 07:14, applied to the five families it missed.

**Bundle C — the cyan light fitting (item 5, ~2 hours).** `ctx.lineWidth = 1.25` → the resolved `SymbolPen` width (0.13 mm × the transform ≈ 0.49 CSS px today); `#0ea5e9` → the resolved `#303030`. Keep a selection highlight, but as a canvas **overlay** colour, not the symbol's own pen. Add the missing intent/VG gate in the same edit — post-`584aaab2` a Lighting untick suppresses the mesh and leaves the disc.

**Bundle D — sections hatch (item 4, ~3 hours).** Pass `PochePlane` at the five call sites, derived from `viewPlaneFrame()`. `5e463032` proved the builder with 8 arms and explicitly deferred the wiring. **This is the single largest readability change available for section drawings** and its risk is bounded by a committed test that pins plan behaviour byte-identical under the `'xz'` default.

**What is NOT a quick win, stated with the numbers so nobody tries it:** BEYOND contrast. `pen(0.09,'#6b7280',null,0.55)` at 0.319 device px composites to rgb(229,230,233) ≈ **1.25:1** on white. Raising alpha to 1.0 → ~1.7:1. Widening to 0.13 mm and darkening to `#3f3f46` at alpha 1 → ~2.5:1. **No colour/alpha combination reaches 3:1 while the stroke is sub-device-pixel** — the width transform (item 9) is load-bearing, and it is medium-risk because it must move two render paths and re-derive the floor together.

---

## 5 · STRUCTURAL — the seam, and the clauses it satisfies

### The seam already exists and is one function call from being the resolver

`makeSymbolInjectionGate(viewId, viewType)` (`packages/core-app-model/src/presentation/SymbolInjectionGate.ts:112-150`) already resolves the bound intent **once** via `resolveBoundIntentWithInheritance`, memoises per family, and is constructed once per projection at `EdgeProjectorService.ts:2585` where **both** the native loop (:2725) and all nineteen `_symbolGate(...)` sites consume it. Its own header states the ambition: *"THE ONE PLACE A SYMBOL INJECTOR ASKS 'IS THIS FAMILY VISIBLE IN THIS VIEW?'"*

Generalise it to:

```ts
makeViewGraphicsResolver(viewId, viewType) → {
  familyVisible(family): boolean
  pen(family, zone, elementId?): PenStyle
  fill(family, zone, elementId?): FillStyle | null
  colourMode(family): string | null      // rooms
}
```

built once per projection and once per paint, over the **one derived family vocabulary** from §3. Repoint in this order, each independently shippable and each verifiable at `ctx`:

1. `PlanViewCanvas.render()` — collapses `_styleResolver` + the inline `graphicsRulesEngine.resolveStyle` pair, which removes the vgCategory/penCategory disagreement in one move.
2. `_lineIsDrawn` (:2853) — so the pointer and the pixels stay one sentence. ⚠ It **already** shares `penCategoryForLayerTag` + `resolveStyle` with `render()` by deliberate design (header at :2840-2846); preserve that, do not re-derive it.
3. `_renderRoomFills` (:2488) and `renderLightingSymbols` — the two wholly ungoverned painters. **This is the step that finally gives rooms and lighting a working view-level control.**
4. Delete the two rogue second checks inside `DoorPlanSymbolBuilder.ts:280` and `WindowPlanSymbolBuilder.ts:245` (`vgGovernanceStore.getEffectiveStyle(...).hidden`) — no other builder has them.
5. Decide the **fail-open policy per answer** before widening. Fail-open is correct for `familyVisible`; there is no safe open default for `pen`.

⚠ Delete or convert `renderFromPipelineResult` first (§2 item 14) — it is a complete parallel painter with its own pen composition at :2052 that omits `_vgFactor` and never calls `resolveStyle`.

### Contract clauses this satisfies, and the two that need amending

- **C102 §4 V-RE-1** — *"a control for an unreachable capability must render disabled with the reason named … it MUST NOT render enabled and no-op."* Breached three times today: `OverridePanel`'s Railings and Curtain walls (ids nothing resolves to), and the two write-only Visual Style selects. The registry gate (§3) enforces the first class **at build time**; item 15 closes the second.
- **C102 §4 V-ST-3** — *"a counter must be proven by motion."* Generalise from counters to **controls**: `overridePanelDispatchReach.spec.ts:109` asserts the verb was dispatched, not that the projected pen moved, which is exactly how `railing` scored 1.000 while being dead. Drive the motion arms off the registry so a new family cannot be added without one.
- **C09 §4.7.5** already declares the intent-ordering BINDING; the 3D read arm was deferred and never landed. `VGSceneApplicator.applyToMesh` reads `threeDAppearanceResolver.resolveForView(...)` for **material fields only** — there is no path by which an intent's `visible:false` hides a mesh in 3D. That arm is the structural close of complaint #1's other half.
- **Amend, do not cite:** `SPEC-AUTODIMENSION.md:345-358` states the §12.11 lineweight hierarchy and `:540` records verbatim *"§12.11 lineweight hierarchy is not enforced."* Add a **§12.11.1** in the style of §12.14 (the text-legibility precedent that worked): mm per tier, the rule that annotation weight ≤ cut-wall weight, and a **composited-contrast floor** — the one number genuinely missing. ⚠ The weight floor is **not** missing: C09 §4.6.4e(c) already states *"THE STROKE FLOOR IS ONE DEVICE PIXEL"* normatively. C101 and C102 contain zero lineweight clauses; the numbers belong in the SPEC, the enforcement in `tools/ga-gate/`.

---

## 6 · HONEST STATE OF ELEVATIONS AND SECTIONS

**They are materially behind plan, and nothing in §4's quick wins reaches them except item 4.** Do not let a plan fix be reported as covering all three.

| Axis | Plan | Elevation | Section |
|---|---|---|---|
| Symbol injectors | **15** (`PLAN_SYMBOL_INJECTION_VIEW_TYPES`, `EdgeProjectorService.ts:352` + seven repeated literals) | **3** (plumbing, tree, opening) | **1** (tree only) |
| Poché | works | **dead** — plane never passed | **dead** — plane never passed |
| Level datums | n/a | present, but via a **rival canvas painter** (`PlanViewCanvas.ts:388`), not the injector | same |
| Grid lines | `_renderBimGridDatums` (:387), plan-only | **absent on the live route** | **absent on every route** |
| Auto-dimension | ✅ | ✅ | honestly refused, with a reason |
| Lighting | mesh dump + ungoverned canvas disc | mesh dump, **no symbol, no suppression flag** | same |
| Per-element hide | **cannot work** (symbol carries no id) | **works** (native path stamps `elementUUID` at :3223) | works |

Specifics worth acting on:

1. **Section and elevation poché are both dead, and elevation is the worse case** because it is *certified green*: `apps/editor/__tests__/elevationCutPocheIsIntentDeclared.test.ts` builds "an elevation cut band" whose every Y is 0 — a plan footprint. A fixture without the geometry of the thing it names cannot falsify the thing it names. `5e463032` added genuinely vertical arms to the builder's own test; **the app-level test is still fake.**
2. **After the plane is wired, `_parsePochePoints` is still wrong for left/right sections.** `PlanViewCanvas.ts:2718-2731` and `PlanViewFillRenderer.ts:254-266` both do `{ h: x, v: sectionFlipV ? -z : z }` — first component as horizontal, unconditionally — ignoring `_hWorldAxis`/`_hWorldSign`, which `viewPlaneFrame()` publishes precisely so consumers stop assuming plan. **A z-constant test fixture will not catch this.** Two defects, not one cleanup.
3. **A section can acquire grid lines on no route at all.** `PlanViewManager` (live) injects nothing; `ViewController.ts:710` is guarded `viewType === 'elevation'` so sheets exclude sections; `SectionViewService.ts:227` is the legacy tool path.
4. **Lighting is strictly worse in elevation/section than in plan.** `grep -rn "skipIn" packages/geometry-lighting/src/` → zero. In plan there is at least a (blue, ungoverned) symbol; in elevation and section there is a raw 672-face edge dump with no symbol and no suppression. The convention exists in all three view types (`EdgeProjectorService.ts:2914/:2922/:2932`) and `ParametricTreeEngine` stamps all three.
5. **Two rival "Front"s.** `ViewController.activate` routes a *queued* elevation/section ViewDefinition to the Canvas2D `PlanViewManager` (:1513-1521); with no id queued it falls to `_activateElevationView` (:2194), which sets `projection.set('Perspective')` and leaves the plan-symbol layer disabled. The Views rail queues the id; the ViewCube does not. **Confirmed non-escalating** — `activate()` nulls `_activeDefinitionId` in its `finally` (:1624), so the two cannot interfere. This needs a founder ruling and a label, not a code change.
6. **Auto-dimension's section gap is not a defect.** `autoDimensionActiveView.ts:16-20` refuses sections and names why (a section measures the *cut* — structural zones, ceiling voids, head heights). ⛔ Do not route sections through `applyElevationAutoDimensions` to "close the gap."

**One free experiment that discriminates the whole of complaint #1:** because `skipInPlan` is gated on `isPlanView` alone, furniture meshes **are** natively projected in elevation with `elementUUID` stamped. So hiding one bed from the Project Browser reaches `globalAlpha = 0` in elevation and reaches nothing in plan. One screenshot pair, zero code.

---

## 7 · REFUTED / UNKNOWN

### Refuted — investigated and found NOT to be a problem

- **"The symbol injectors ignore visibility intent entirely"** (the founder's own hypothesis, and what `SymbolInjectionGate.ts`'s header census suggests). **REFUTED** — 19 `_symbolGate(` sites in `EdgeProjectorService.ts`, including furniture. The builders are dumb; the caller is not. **Category-level hides DO reach symbols; element-level hides structurally cannot.** That distinction is the whole of complaint #1.
- **"The worker pipeline paints with a different pen."** Dead: `renderFromPipelineResult` / `scheduleWorkerRender` have zero callers. Real as a **trap**, not as a defect.
- **"The drawing is cached, so the toggle needs a re-projection that never happens."** `PlanViewManager` listens on `vi:intent-updated` (:190) and `GraphicsRulesEngine` clears its cache on seven `vi:*` events (:87-96). Ruled out.
- **"Only 22 of 63 layers are styled, so styling never reaches the canvas."** False premise — the canvas deliberately deleted its `material.linewidth` read (L-241 P5) and re-resolves per line. The 22/63/14 mismatch is real (three different units: layer objects / group-layer pairs / category keys) and its blast radius is **export**, not screen.
- **"No document states a minimum on-screen weight."** Refuted — C09 §4.6.4e(c) states it normatively. The genuinely missing number is the **contrast** floor.
- **"`minStrokePx` should be `1/max(1,dpr)`."** Refuted by arithmetic and already rejected by name in `9babe6f5`'s body: at dpr 1 it clamps 0.945 / 0.680 / 0.491 / 0.340 onto one value — four rungs flattened, L-288 restored. **The guard half of that finding survives** (`CanvasHairlineFloor.test.ts` should compute `lineWidth × dpr`, not `× scale`, and add a sub-1 dpr row); the width half does not.
- **"Deleting `setVisibility` would regress export."** Measured: `grep -c '\.visible'` → **0** in both `SVGCompositeRenderer.ts` and `DxfExportService.ts`. Deletion is safe; *honouring* it is the risky option.
- **Already landed — do not re-implement:** lighting classification at four sites (`584aaab2`); the occlusion-disposition and beyond-line-style UI, which closes the founder's "I change the line type" on the *view-output* axis (`9babe6f5`); the `PochePlane` selector with 8 test arms (`5e463032`, **wiring explicitly deferred**).
- **Audit census corrections:** `elementUUID` is stamped by **3** of 18 builders, not 1 (`OpeningElevationSymbolBuilder`, `BoundaryLinePlanSymbolBuilder`, `SpaceEnvelopePlanSymbolBuilder`). `CATEGORY_TO_DXF_LAYER` has **14** keys / 11 distinct layers. `ELEMENT_TYPES` is **20** entries including `lighting`. The `getActiveId` dead read is at **four** call sites, not two. The lighting symbol drawer has **10** cases + 1 default = 11 marks against **46** families (12 legacy + 34 `LOD200_FIXTURE_ROWS`) — and *"twenty LOD-200 families"* is stale in five places including L-1332 itself, against a source file that says *"Cite `LOD200_FIXTURE_ROWS.length`, never a count written in prose here."*

### Unknown — must be established, cheaply, before or during the work

1. **⭐ Which surface the founder used.** Three can "exclude furniture from a view" and they fail differently. His "NO OVERRIDES" is evidence against the Overrides panel and consistent with both finding-1 (nothing written) and finding-2 (written, cannot match). **Settled by one log line** (§4 Bundle A) or one plan-vs-elevation screenshot pair (§6). Findings 1 and 2 predict different fixes; ship both, but know which one he hit.
2. **Whether room linework reaches the projector at all.** `'room'` is in `CACHEABLE_ELEMENT_TYPES` (`EdgeProjectorService.ts:2031`) and `RoomBoundaryBuilder` stamps `userData.elementType='room'`, which suggests room groups are routinely iterated — but `NativeElementMeshExporter` selects `levels.flatMap(l => l.childrenIds)` and rooms live in `roomStore`. **If rooms do project, they fall to `FALLBACK_NATIVE_LAYER = 'projection-visible'` → `'projection'` → `__default__` → the wall pen, and no VG or intent decision can reach them.** Confirm with one browser log before adding an ISO layer (`A-AREA` is taken by `spaceEnvelope`; a room layer needs a name of its own).
3. **What "modify the colours" means for rooms.** One colour for all rooms (a `fill.colour` on the intent row), or an editable per-occupancy palette? `OCCUPANCY_PALETTE` (`RoomColourSystem.ts:114`, ~46 entries) has **no write path anywhere** — every reference is a read. A single category colour satisfies only the `uniform` mode. **Ask before building.**
4. **Whether his 13 views are bound individually or by inheritance.** `duplicateIntent` binds `contextViewId` only, so copy-on-write repairs one view of thirteen. Decides whether item 7 needs a "rebind all" action to be worth shipping.
5. **`H2-NME-CACHE hits=0 misses=70`.** The key (`elementId:viewId:version:cropKey`) is stable for an uncropped plan, and `cacheSize=69/500` after 70 misses is a **cold-cache** signature, not key churn. One repeat projection of the same view settles it.
6. **Whether `239.5 segment-equivalents removed` is over-occlusion.** 17 of 22 projection occluders degraded to the vertical-span hull. `9babe6f5` just gave occlusion disposition a UI, so this is now a one-screenshot A/B (Remove vs Show dashed).
7. **The oblique-section poché case.** The collapse is proven for cardinal normals. For an oblique section the XZ projection is a genuine 2D shape, so the builder returns a **foreshortened wrong polygon** rather than nothing — worse, and unmeasured. The plane fix addresses both; the test arm should cover the oblique case explicitly.
8. **Whether room-tag counts indicate a defect.** `0 room-tag(s) created … out of 7 live room(s)` alongside `15 error room(s) tracked` on a level with 7 rooms does not obviously reconcile, and tags *do* appear in his Level 2 screenshot. No mechanism offered; worth one lane's attention.
9. **Whether `HiddenLineRemoval`'s occluder set includes intent-hidden families.** If a hidden family still occludes, that is a fourth visibility bypass. Not measured.

### What I did not do

I ran no build, no test suite and no browser. Every claim above is read from source at the cited line at HEAD `5e463032`, plus `git show` on the three commits that landed today. Line numbers in the source audits had drifted by 1-30 lines (`584aaab2` inserted ~28 lines into `EdgeProjectorService.ts` alone) and have been re-anchored here — **re-read before editing; do not patch by line number.** Note also that the working tree carries seven modified files from an unrelated space-envelope lane; none touches the files in this plan, but `git status` before you start.