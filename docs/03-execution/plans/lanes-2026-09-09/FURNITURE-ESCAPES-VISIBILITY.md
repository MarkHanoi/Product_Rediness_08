<!--
  LANE OUTPUT — Furniture escapes the visibility intent — every hiding mechanism, and the one authority
  Workflow task wdp62av68. Produced 2026-09-09 and captured to the repo the same day.

  ⚠ THIS IS A LANE REPORT, NOT A CONTRACT. It is an audit's own words, verified by its
  own adversarial passes and no further. Where it and the code disagree, the code wins
  and this file is stale. Line numbers rot fast — re-read before acting on one.

  ⭐ Captured because the fixes it drove ship across several commits, and the REASONING
  behind a one-line change is the part that is expensive to reconstruct. Several findings
  here were deliberately NOT implemented; the commits say which and why.
-->

Every load-bearing claim is verified at HEAD `aa119382` (two commits past the dossier's `632d57b9`; both are docs/open-path perf and touch nothing in the view or drawing path). Here is the plan.

---

# Furniture escapes the visibility intent — fix plan

**Measured at HEAD `aa119382`, 2026-09-09. Every file:line below was re-read at this SHA, not carried from the dossier.**

---

## 1. Why does the furniture still render?

**One hop: `packages/core-app-model/src/views/PlanViewCanvas.ts:510`.**

```ts
const _elementId   = child.userData?.elementUUID as string | undefined;
```

That is the only place the live plan painter asks *"which element is this line?"*, and it asks exactly **one** of the five channels the answer lives in. For a furniture plan symbol the answer is not in that channel: OBC's `toDrawingSpace()` returns a brand-new `LineSegments` and `DrawingLayers.assign()` writes only `userData.layer`, so the furniture symbol builders put the id in the `DrawingSelectionIndex` WeakMap instead (`registerSegmentUUID`). **Measured at HEAD across all 20 injectors: 3 stamp `userData.elementUUID` (Boundary-line, Space-envelope, Opening-elevation), 11 register the WeakMap only, 6 emit no id at all.** So `_elementId` is `undefined`, and `IntentRuleResolver.ts:79` — `if (kind === 'element') return !!target.elementId && target.elementId === targetId;` — turns that absence into a clean `false`, i.e. *"not hidden"*, with no signal. The `{targetKind:'element', action:'hide'}` row that `HideElementInViewCommand.ts:30` pushes can never match. **The proof this is the hop and not a guess is thirteen lines below it in the same file:** `hitTest()` at `:1514` resolves the *same line's* id through `lookupElementUUID` first — so the bed he cannot hide is a bed he *can* click.

**Was his hypothesis right? PARTLY — right about the population, wrong about the reason, and the difference decides where the fix goes.**

- **Right:** it really is the symbol families that escape, and only in plan. `skipInPlan` (`EdgeProjectorService.ts:2914`) removes the native mesh edges precisely for bed/chair/sofa/kitchen/wardrobe/tree, so the symbol is the *only* furniture linework left — and it is the one line with no id. Furniture that has no symbol (`BookshelfBuilder.ts:14`, `DeskBuilder.ts:12`, `EntryStorageBuilder.ts:6` all ship `skipInPlan=false`) projects natively, is stamped at `EdgeProjectorService.ts:3223`, and **does** disappear.
- **Wrong:** symbols are not exempt from the visibility system. The symbol line is in the drawing, is layer-tagged `A-FURN`, and the **family** tier hides it correctly. Three symbol builders that *do* stamp the id are governed per-element today. So "because they are symbols" is a coincidence of which builders learned the lesson — it is **one missing field on a line**, not a category of geometry the system cannot see.
- **And it is not furniture-specific.** The same 0-of-11 omission covers doors, windows, plumbing and trees; the 6 no-id builders (column, roof, stair, wall-layer, level-datum, section-grid) are strictly worse — ungovernable *and* unpickable.

**Three other breaks produce his exact sentence, and I cannot rule them out from code. In firing order:**

| # | Condition | What happens |
|---|---|---|
| **0** | He clicked the Project Browser Furniture eye **while the 3D viewport was active** | **Nothing is written at all.** `ProjectVisibilitySection.ts:48` reads `window.viewDefinitionStore?.getActiveId?.()` — **a dead branch: `getActiveId` has zero definitions on that store** (the only ones repo-wide are `ToolRegistry.ts:125`, a different object, and a *test mock* at `elementFilterWritesIntent.spec.ts:73`). It falls to `viewController.currentViewDefinitionId`, which `ViewController.ts:1551` sets to `null` in 3D. `writeElementVisibilityIntent` then early-returns at `:67`. Only the `Object3D.visible` traverse runs: furniture vanishes in 3D, **every** 2D view keeps all of it — symbol or not. |
| **1** | He was in a plan view | The write lands and the mechanism above bites, for exactly the symbol families. |
| **2** | He had the furniture **selected** when he hid it | `_renderSelectionHighlights` (`:2402`) obeys **no** visibility authority. I grepped lines 2402–2530 for `_lineIsDrawn`, `resolveStyle`, `_styleResolver`, `visible`, `opacity` — **zero hits** — while it resolves the id through the *full* ladder at `:2427`. A full PRYZM-purple silhouette survives every hide, family or element. |
| **3** | He looked at the 3D viewport | 3D never reads the intent. `visibilityOverrides` has exactly **three** rendering readers repo-wide (`IntentRuleResolver.ts`, `IFCProjectionStore.ts:76`, and the gate via the resolver); `VGSceneApplicator` is not one — it resolves `mesh.visible` from `vgGovernanceStore` alone (`:914`, `:1114`), and that store has **no UI writer** (`SetVGCategoryStyleCommand` has zero non-test call sites outside the AI `VGIntentMapper`). |

His word *"symbols"* means he was looking at a plan, which points at **#1**. But **#0** is cheaper, more general and matches the most natural workflow, and **#2** would have made even a *working* family toggle look broken. **Section 7 gives a one-minute probe that separates all four.**

---

## 2. The cheapest fix that makes his gesture work

**Rank 1 — three lines, one file, one commit. `packages/core-app-model/src/views/PlanViewCanvas.ts`.**

The ladder already exists in this file, twice, written by the same author for the same question. The fix is to stop having a third spelling.

**(a) `:510` — the painter.** `drawing` is already in the closure (`const drawing` at `:419`, captured by the traverse opened at `:469`):

```ts
// was: const _elementId = child.userData?.elementUUID as string | undefined;
const _elementId = resolveLineElementId(drawing, child);
```

**(b) `:2916` — the pick-parity predicate, in the SAME commit.** `_lineIsDrawn` has exactly **one** caller (`hitTest` at `:1524`), and that caller has **already** resolved the id at `:1509-1519`. So thread it through rather than doing a second WeakMap lookup:

```ts
private _lineIsDrawn(child, viewType, viewId, elementId?: string): boolean
//   :2916  elementId,                       ← was child.userData?.elementUUID
//   :1524  if (!this._lineIsDrawn(child, _hitViewType, _hitViewId, id)) return;
```

⛔ **These two must land together.** Fixing `:510` alone produces the inverse defect: the line stops painting and stays clickable — exactly what `§HIDDEN-IS-NOT-PICKABLE` (L-3902) exists to prevent. Today the two agree *by coincidence* (both blind to the same field); the fix breaks the coincidence.

**(c) `:2427` — gate the selection glow.** After `if (!isSelected && !isHovered) return;`:

```ts
if (!this._lineIsDrawn(child, this._viewType, this._lastViewId ?? undefined, uuid)) return;
```

Without (c), the founder's own re-test reads as broken whenever anything is selected — including the *family* toggle, which is the control that works.

**Rank 2 — one line, `packages/core-app-model/src/presentation/SymbolInjectionGate.ts`, after `const { instance, intent } = bound;` (~`:124`):**

```ts
if (instance.localOverrides.isolateActive) return () => true;
```

The gate resolves with `{ elementType, category: elementType }` and **no** `elementId`. Under `isolateActive`, `IntentRuleResolver.ts:200` therefore returns `visible:false` for **every** family, the gate returns `false` for every family, and — via the native veto at `EdgeProjectorService.ts:2725` — **"Isolate in View" on any element blanks the entire plan drawing on the next re-projection, including the element that was isolated.** Isolate is a per-element concept; a family gate must not answer it.

**Rank 3 — three comments, same commit as Rank 1.** Three sites tell the next reader this bug is closed:
`SymbolInjectionGate.ts:~38`, `EdgeProjectorService.ts:2702`, `EdgeProjectorService.ts:3918` — all three say *"REFUTED at the canvas layer"* and all three cite `visibilityIntentGovernsSymbolInjectors.test.ts`. **That test drives only the family axis:** it builds lines as `ls.userData = { layer }` (`:118`) and hides via `intent.elementRules[cat] = rule({visible:false})`. `grep -n 'targetKind'` over the whole file returns **nothing**. It is the artefact that certifies the axis it does not test — the `[[gate-blind-on-the-wrong-axis]]` shape. Leaving any copy standing re-closes the bug on the next reader.

### What Rank 1–3 does **not** fix

| Not fixed | Where |
|---|---|
| The 6 injectors with no id in **either** channel — still ungovernable *and* unpickable | `ColumnPlanSymbolBuilder`, `RoofSlopeSymbolBuilder`, `StairSymbolTechnicalDrawingBridge`, `WallLayerPlanSymbolBuilder`, `LevelDatumLineBuilder`, `SectionGridLineBuilder` |
| Project Browser eye clicked **from 3D** — writes nothing at all | `ProjectVisibilitySection.ts:48`, `ViewController.ts:1551` |
| 3D viewport ignores the intent entirely | `VGSceneApplicator.ts:914` / `:1114` |
| DXF/PDF/SVG export emits **every** line regardless | `SVGCompositeRenderer.ts:240` |
| The drawing still *carries* the hidden geometry — `_onIntentInstanceUpdatedCore` (`PlanViewManager.ts:522-532`) sets `_lastRender = 0` (a repaint) and never invalidates `viewTechnicalDrawingCache`, so the gate is never re-consulted on an intent change | `PlanViewManager.ts:531` |
| Lighting plan symbols — painted from `LightingStore`, contribute zero `LineSegments` | `LightingPlanSymbolRenderer.ts:262` |
| Room fills — `'room'` is not in `VisibilityIntentDefaults.ELEMENT_TYPES`, so no intent rule for it can exist | `PlanViewCanvas.ts:2535` |
| Stale symbols after a move — `_transplantElementLines` filters on raw `userData.elementUUID` | `EdgeProjectorService.ts:4344`, `:4366` |

---

## 3. The full mechanism table

Deduplicated across the four dossier dimensions and re-verified at HEAD. **ALIVE** = reaches a pixel today. **DEAD** = cannot.

### A. The 2D canvas — the surface the founder is looking at

| # | Mechanism | Hides | Obeys | Ignores | Surfaces | State |
|---|---|---|---|---|---|---|
| A1 | **Per-element pen** `PlanViewCanvas.ts:510` | intended: one element. actual: nothing, for 17 of 20 injectors | `userData.elementUUID` → `graphicsRulesEngine.resolveStyle` → element tier | `lookupElementUUID` — the WeakMap its own siblings at `:1514`/`:2427` use | plan, section, elevation, detail, structural-plan | **ALIVE — THE BUG** |
| A2 | **Family pen (alpha-0)** `PlanViewCanvas.ts:526` | family, correctly | `penCategoryForLayerTag(layerTag)` → intent rules + `elementType`/`category` overrides | `Object3D.visible`; families the pen vocabulary cannot name (`A-PLMB`, `A-AREA`, `A-GRID`, `A-LEVL`, room, curtain-wall → `'projection'`, `PenWeightTable.ts:419`) | same | **ALIVE — works** |
| A3 | **Isolate over-hide** `IntentRuleResolver.ts:200` | *everything* — every symbol line, incl. the isolated element | `isolateActive` + `isolateTargets.some(...)` | that `resolvedTarget.elementId` is `undefined`, so `!some()` is unconditionally true | same | **ALIVE — inverse of A1** |
| A4 | **`_lineIsDrawn`** `:2916` | pickability | same blind read as A1 | the WeakMap | plan pointer | **ALIVE — must move with A1** |
| A5 | **Selection glow** `:2402` | **nothing — it ADDS marks** | `selectionBus.currentIds`, full id ladder at `:2427` | `_lineIsDrawn`, pen opacity, VG `visible`, `child.visible` — verified zero hits over 2402–2530 | plan, section, elevation, detail, structural-plan | **ALIVE — breaks the field test** |
| A6 | **VG hard-return** `:501` | family, before pen work | `resolveVgCanvasStyle` → `vgGovernanceStore` | the intent | same; repeated at `:2910`, `:2627` | **ALIVE but unreachable — no UI writer** |
| A7 | **Poché** `:2589` | cut fill | `viewIntentInstanceStore.get(_viewId)` **directly** at `:2599` | **inheritance** — the linework path uses `resolveBoundIntentWithInheritance`; on a dependent view linework resolves the parent's intent and poché the global default, in one drawing | plan, section, elevation | **ALIVE — divergent** |
| A8 | **Room fills** `:2535` | the whole room wash | `vgGovernanceStore` via `resolveRoomColourIntent` | the intent — and *cannot* be taught it (`'room'` absent from `ELEMENT_TYPES`) | plan-like | **ALIVE — no user hide** |
| A9 | **Lighting symbols** `LightingPlanSymbolRenderer.ts:262` | only other levels | `levelId` | intent, VG, pen, gate, `Object3D.visible`; emits zero `LineSegments` | plan, ceiling-plan, structural-plan | **ALIVE — obeys nothing** |
| A10 | **Crop clip** `:2175` | rasterised clip | `_resolveCropCanvasBounds` | element-level authorities | all canvas views | ALIVE — correct |
| A11 | **Grid / level / underlay flags** `:830`, `:1269`, `:1428` | datum marks | per-record `isVisible` | the intent's `grid`/`level` rules, which **do** exist | canvas views | ALIVE — two authorities, canvas reads the wrong one |

### B. Projection-time vetoes

| # | Mechanism | Hides | Obeys | Ignores | State |
|---|---|---|---|---|---|
| B1 | **`makeSymbolInjectionGate`** `SymbolInjectionGate.ts:112` | family, at injection | full intent ladder incl. overrides + isolate | **per-element by construction**; fails open on throw/unbound | **ALIVE — correct, except isolate (Rank 2)** |
| B2 | **Native group veto** `EdgeProjectorService.ts:2725` | family, native meshes | `vgCategoryForLayer(resolveProjectionLayer(type))` | types absent from `ELEMENT_TYPE_TO_PROJECTION_LAYER` → `FALLBACK_NATIVE_LAYER` → `null` family → **veto skipped** (`ParametricTree`, `Tree*`, `wardrobe_unit`, `Wardrobe*`) | ALIVE — has a hole |
| B3 | **IFC veto (Source C)** `:3778` + `:3771` | IFC family; and any IFC mesh with `mesh.visible === false` | `isElementTypeFullyHidden(intent, type)` | **the override tier** — takes the intent only, never the instance. And the **asymmetry**: Source C honours `mesh.visible`, Source B (all native PRYZM) has zero `.visible` reads in 2680–3230 and none in `NativeElementMeshExporter.ts` | ALIVE — same rule, two implementations |
| B4 | **`IFCProjectionStore._intentVetoIFC`** `:76` | *all* IFC projection, geometry-level | `visibilityOverrides` walked up the parent chain, hard-coded `targetId === 'ifc-element'` | every other family | ALIVE — a 4th shape, one family only |
| B5 | **`skipInPlan/Elevation/Section`** `:2914`, `:2922`, `:2932` | per-mesh | builder-authored flag | everything | ALIVE — correct by design; **the amplifier for A1** |
| B6 | **Role drops** `:2892` (doorHandle, legacyDoorFrame, legacyWindowFrame) | 3D-only hardware in plan | `mesh.userData.role` | all authorities | ALIVE — correct |
| B7 | **`CUT_ELIGIBLE_PLAN_LAYERS`** `:485` | non-listed families' cut + poché | a hard-coded six-name set | intent, VG, user | ALIVE — deliberate literal |
| B8 | **`PLAN_SYMBOL_INJECTION_VIEW_TYPES`** `:352` | all 12 floor-plane injectors outside 3 view types | a `Set` | everything; a 5th rival answer to "which views are plan-like" (L-5405) | ALIVE — unreconciled |
| B9 | **Level filter** `NativeElementMeshExporter.ts:323` | whole storeys | level span overlap + `level.childrenIds` | `Object3D.visible` (0 occurrences in file); **an element absent from `childrenIds` never exports** — openings are unioned back at `:341-372`, **furniture is not** | ALIVE — a silent second furniture hole |
| B10 | **Crop + scope cull** `:507`, `:519` | elements outside crop/frame | world AABB | intent, VG, `.visible` | ALIVE — correct |
| B11 | **`applyOcclusion`** `HiddenLineRemoval.ts:777` | occluded spans | disposition + zone | zone-less layers exempt at `:802` — so B2's unmapped Trees also escape occlusion | ALIVE — correct, inherits B2's hole |
| B12 | **`suppressSymbolisedElementLinework`** `OpeningElevationSymbolBuilder.ts:449` | wireframe an elevation symbol replaced | `userData.elementUUID` — **and it works precisely because that builder stamps it** | — | ALIVE — the existence proof for the fix |
| B13 | **Incremental graft** `:4344`, `:4366` | not visibility — **stale symbols after a move** | raw `userData.elementUUID` | the WeakMap | ALIVE — same missing field, different symptom |

### C. 3D viewport — five services writing one boolean

| # | Mechanism | State |
|---|---|---|
| C1 | `VGSceneApplicator` `:914`/`:1114` — the 3D authority. Reads `vgGovernanceStore` + instance-override + rule-engine + phase + underlay force-on + the `room`/`vgBaseVisible` mask at `:786`. **Ignores `visibilityOverrides` entirely.** | ALIVE — blind to the intent |
| C2 | `getVGCategory` `:154-158` — raw object index, **no canonicalisation**, unlike the 2D twin `_canonicalTypeKey` (`EdgeProjectorService.ts:314`). Misses `KitchenCabinet*`, `Lighting`, `wardrobe_unit`, `Tree*`, lowercase spellings → `processObject` bails at `:732` → **VG can neither hide nor style them in 3D, ever** | ALIVE — the L-275 fix was never carried across |
| C3 | `ViewRangeFilterService:273` · `CropRegionFilterService:195` · `PlanViewVisibilityCuller:104` · `LevelScoped3DCullingService:525` · `InstancedMeshCoalescer:433` · `visibilitySceneApplier:120` — six writers of `Object3D.visible`, sequenced by construction order in `initUI.ts:667-714` | ALIVE — last-writer-wins |
| C4 | `PlanViewVisibilityCuller:135` `root.visible = true` — unconditional restore over its own set, **un-hides what other services hid** | ALIVE — latent |
| C5 | `VGSceneApplicator.resetAll()` `:1127-1141` — unconditional `obj.visible = true` on **every** object; would clobber all of C3 at once. Only caller is `dispose()`, which has no production call site | **LATENT LANDMINE — not firing today** |

### D. Export

| # | Mechanism | State |
|---|---|---|
| D1 | `SVGCompositeRenderer.setTechnicalDrawing` `:240` — `layerName.includes('hidden')`, used **only** to add `stroke-dasharray` at `:381`. Emits every segment. Ignores `child.visible`, the intent, the pen opacity, `drawing.layers.setVisibility`. Also catches `projection-hidden` by substring — a name collision, not a decision | **ALIVE — a category the founder switched off is in every PDF and DXF he issues** |
| D2 | `AnnotationDxfBridge.ts:253` — a 21st injector, `elementUUID` 0, `registerSegmentUUID` 0 | ALIVE — same defect, export half |

### E. Dead — **DELETE**

| # | Thing | Evidence | Verdict |
|---|---|---|---|
| E1 | `VGSceneApplicator.applyToProjectionLayers` `:624-700` — writes `drawing.layers.setVisibility`; **no consumer reads `child.visible`** (`PlanViewCanvas.ts:469-472` and `SVGCompositeRenderer.ts:232` both test only `instanceof LineSegments`), and the drawing is unparented from the scene. Logs `styledLayers=N` as if it worked, on every `vi:instance-updated` (`PlanViewManager.ts:527-529`) | **DELETE** the method and its 5 call sites |
| E2 | `apps/editor/src/engine/views/plan-canvas/` — 4 files, **zero importers** (`PlanViewFillRenderer`, `PlanViewVGApplicator`, `PlanViewSymbolRenderer`, `PlanViewCanvasTypes`). Contains look-alike `renderLightingPlanSymbols` and `renderSelectionHighlights` that would absorb a fix invisibly. Still cited as live by `DrawingLayerIdentity.ts:187` and `EdgeProjectorService.ts:3957` | **DELETE** + fix the two citations |
| E3 | `PlanViewCanvas.scheduleWorkerRender` / `renderFromPipelineResult` (`:1896`, `:1953`) + `DrawingPipelineOrchestrator` + `DrawingPipelineWorker` — zero callers. **A third pen authority**: its own comment at `:2090` calls it *"a PRE-EXISTING divergence from Contract-23 §7.1"*. ⭐ Note the irony: `DrawingPipelineOrchestrator.ts:166-172` uses the **full ladder** — the dead path resolves identity correctly and the live one does not | **DELETE** |
| E4 | `plugins/plan-view/src/PlanViewRenderer.ts` — 351-line rival renderer, no `package.json` declares `@pryzm/plan-view` | **DELETE** |
| E5 | `apps/editor/src/ui/visibility/VisibilityIntentPanel.ts` — 50-line dead twin, zero importers, dispatches `visibility.hide` (not even the registered verb). Live panel is `apps/editor/src/ui/VisibilityIntentPanel.ts` | **DELETE** |
| E6 | `WorksetPanel.ts:146-150` — a select literally labelled **"Visibility in View"** (Visible / Hidden / Greyed). `_apply()` writes `window.worksetPanelSettings` and emits `pryzm:workset:settings-update`; **zero consumers** | **DELETE or wire — it promises the founder's exact feature** |
| E7 | `OverridePanel.CATEGORIES` rows `beam`, `railing`, `curtainwall` — **verified dead**: `penCategoryForLayerTag` can return only `{boundary-line, wall, column, door, window, slab, stair, handrail, roof, ceiling, furniture, lighting, projection}` (`PenWeightTable.ts:404-419`), and the flags map `beam→column` (`:449`), `railing→handrail`, curtain-wall→`wall`. Directly under a caption promising *"Unticking hides the whole category in this view only."* Two inverse over-hides fall out: unticking **Columns** also hides every beam; unticking **Walls** also hides every curtain wall. `lighting` is a pen category but is **missing** from this list (L-13267 miss) | **FIX the three ids; ADD lighting** |
| E8 | `packages/visibility` 11-wave chain — `.evaluate` has exactly one caller, E5, which has zero importers. Its store is `NOT PERSISTED · NOT UNDOABLE · NOT REPLICATED`, and `viewRegistry.activate()` has zero production callers so everything lands on `IMPLICIT_MODEL_VIEW_ID` | **DEAD for rendering — but KEEP.** This is the one exception to the DELETE rule and I am naming it rather than hiding it: it is the only *written* ordering spec for the eleven waves, with parity tests. **Adopt its order as the specification for §4; do not wire it as a runtime authority, and do not delete it.** |

---

## 4. The one authority

**Two authorities, and — as preferred — the important one is EXISTING and simply not called everywhere.**

### Authority A — identity. NEW function, but an *extraction*, not a new concept.

```ts
// packages/core-app-model/src/views/DrawingSelectionIndex.ts   (home of lookupElementUUID)
export function resolveLineElementId(
  drawing: object,
  child:   THREE.Object3D,
): string | undefined;
```

It is new **as a symbol** and old **as code**: the identical five-branch expression already exists verbatim at `PlanViewCanvas.ts:1509-1519`, `PlanViewCanvas.ts:2426-2431`, `DrawingPipelineOrchestrator.ts:166-172`, `PlanViewInteraction.ts:2048-2054` and (dead) `plan-canvas/PlanViewSymbolRenderer.ts:52`. Five copies, plus two sites (`:510`, `:2916`) that read one branch of it. **Extracting is strictly a reduction.** It belongs in `DrawingSelectionIndex.ts` because that file already owns half the ladder and its header already documents the contract.

### Authority B — the decision. **EXISTING**, called from exactly one place.

`PlanViewCanvas._lineIsDrawn` (`:2904`) already **is** the answer to *"does this line appear in this view?"* — VG leg, zone classification, pen resolution, `opacity > 0`. Its own header states the invariant (*"a change to either authority moves the pointer and the pixels together"*). **It has one caller**: `hitTest` at `:1524`. `render()` does not call it — it re-implements it inline at `:499-527`. Poché re-implements a third variant at `:2589`. The export re-implements a fourth at `SVGCompositeRenderer.ts:240`.

So the work is **not** to design an authority. It is to promote the one that exists:

```ts
// packages/core-app-model/src/views/LineAppearsInView.ts
export function lineAppearsInView(
  drawing:  object,
  child:    THREE.Object3D,
  viewType: string,
  viewId:   string | undefined,
  styleResolver?: VgCanvasStyleResolver,
): { drawn: boolean; pen: PenStyle; elementId: string | undefined };
```

It returns the pen alongside the boolean so `render()` can call it once instead of resolving twice. **Wave order is specified by `packages/visibility/src/waves/index.ts`** (E8) — adopted as the spec, not as the runtime.

### Migration order — painter by painter, with the founder-visible change each step produces

| Step | Change | Founder-visible result |
|---|---|---|
| **1** | Extract `resolveLineElementId`; call it at `:510` and thread the id into `_lineIsDrawn` at `:2916`/`:1524`; gate `_renderSelectionHighlights` at `:2427` | **His gesture works.** Right-click a bed in plan → Hide in View → it goes, and it stops being clickable. No purple ghost. |
| **2** | `SymbolInjectionGate` isolate escape | **"Isolate in View" stops blanking the drawing.** The isolated bed's own symbol survives; everything else goes. |
| **3** | Stamp the 6 no-id builders using the proven three-key pattern (`BoundaryLinePlanSymbolBuilder.ts:288-292` — `layerName` + `elementType` + `elementUUID` **before** `addProjectionLines`, then `registerSegmentUUID`) | Column crosshairs, stair walking lines, roof slope arrows and wall-layer lines become **selectable** in plan for the first time, and hideable. Also fixes **B13** — no more stale symbols after a move. |
| **4** | `render()`, `_lineIsDrawn`, `_renderPocheFills` and `hitTest` all call `lineAppearsInView`. Delete E1–E5 in the same PR | No visible change **except** poché stops disagreeing with linework on dependent/detail views. |
| **5** | `SVGCompositeRenderer` calls `lineAppearsInView` | **Hidden furniture leaves the PDF and the DXF.** The largest behaviour change in the plan — stage it last, alone. |
| **6** | Carry `_canonicalTypeKey` into `getVGCategory` (C2); add the missing `Lighting` rows | Kitchen units, wardrobes, trees and light fittings become hideable **in 3D**. |
| **7** | Fix `_activeViewId`'s dead branch (`ProjectVisibilitySection.ts:48`, `RadialMenu.ts:236`, `initUI.ts:3381`) — and decide what a Project Browser hide means with no active 2D view: **refuse visibly** or apply to the last 2D view. Do not keep the silent return | The Project Browser eye stops silently doing nothing when clicked from 3D. |
| **8** | Give `VGSceneApplicator` a `visibilityOverrides` leg, or route 3D through the same authority | The V/G Furniture checkbox finally affects 3D. |

**Steps 1–3 are the founder's bug. 4–8 are the architecture, and each is independently shippable.**

---

## 5. What would break

Several mechanisms hide things *correctly* today. Naming the specific regressions:

1. **Isolate flips direction on every saved view that has `isolateActive`.** Today isolate hides all symbols including the isolated element's own (A3). After step 1+2 it does the opposite. Any view the founder has saved under isolate will look different. **Guard:** the red-first arm for step 2 asserts the isolated element's *own* symbol survives *and* that a non-isolated bed's symbol goes — both directions in one test.

2. **Doors and windows start obeying per-element hide in plan.** `DoorPlanSymbolBuilder` and `WindowPlanSymbolBuilder` are register-only, so a per-element door hide is a no-op today. After step 1 it works. If any workflow relies on "hide the door leaf, keep the swing", it stops. **Guard:** a test that per-element hide on a door removes swing *and* jamb together, so the behaviour is at least coherent; flag it in the changelog rather than silently shipping it.

3. **Pen-cache cardinality → possible per-frame cache thrash.** `GraphicsRulesEngine._cache` is keyed `styleResolverCacheKey(ctx.elementId ?? '', viewId, zone:category)` with `CACHE_MAX_SIZE = 8_000` and a **wholesale `clear()`** on overflow (`:410`). Today every symbol line shares the `''` key. After step 1 each contributes its own. **Guard, and it is the cheap one:** `_matches` already returns `false` at `:245` when there is no element rule, so when the view has **zero** element-tier rules the id cannot change the answer — key on `''` unless `this._rules.some(r => r.priority === RULE_PRIORITY_ELEMENT)`. That makes the common case byte-identical to today and bounds the worst case to views that actually have per-element overrides.

4. **Hidden-but-selected elements lose their glow (step 1c).** That is correct — but it removes the only signal that a hidden element is still in the selection. **Guard:** keep the count in the selection HUD; assert in test that selecting a hidden element still reports 1 selected while painting nothing.

5. **Step 3 changes the incremental-graft hot path.** Stamping `userData.elementUUID` makes symbol lines newly *visible* to `_transplantElementLines` (`:4344`, `:4366`), which currently skips them. That fixes stale symbols — but it is new work on the 30 ms driver. **Guard:** the two builders that already stamp (`BoundaryLine`, `SpaceEnvelope`) are the natural control. **Measure the graft path with and without them before generalising** — if they have never cost anything, the risk is overstated; if they have, we learn it on 2 files instead of 6. Also note `_transplantElementLines` `:4370-4374` rebuilds lines carrying neither `userData.layer` nor `ELEMENT_FUNCTION_KEY`, silently dropping the L-285 pen axis — fix that in the same PR or step 3 will be blamed for it.

6. **Step 5 changes every issued document.** Sheets that print furniture the user switched off will stop printing it. That is the point, but it is a change to deliverables that may already be on paper. **Guard:** ship alone, with a test that names the exact layer set that stops exporting, and a release note.

7. **Step 6 makes VG able to hide things it has never been able to touch.** Canonicalising `getVGCategory` newly classifies `KitchenCabinetUnit`, `Tree*`, `wardrobe_unit`, `Lighting` — so any VG template default that says "furniture hidden" suddenly applies to them. And `vgGovernanceStore` has **no UI writer**, so those defaults are unaudited. **Guard:** before step 6, dump the resolved VG `visible` for every category against the shipped templates and assert all-true; do not fold VG into a unified authority until that dump is clean.

8. **`VGSceneApplicator.resetAll()` (C5) becomes live the day anyone calls `dispose()`.** Any step that adds an applicator teardown arms it. **Guard:** change `:1127-1141` to restore only what it recorded, in the same PR as step 8 — before anything calls dispose.

---

## 6. Tests — the red-first arm for each step

> ⛔ **Every source-text assertion below MUST be made against COMMENT-STRIPPED source.** This repo has shipped arms that matched their own explanatory comment three times in one day. Concretely: `PlanViewCanvas.ts:1508-1512` already contains the words `DrawingSelectionIndex`, `elementUUID` and `symbol bridges` **in a comment**, so a naive grep for the ladder at `:510` passes before the fix. Strip `//…` and `/*…*/` first, then assert.

**Step 1 — red first.** `perElementHideReachesSymbolLinework.test.ts`, mirroring the shape of `visibilityIntentGovernsSymbolInjectors.test.ts` but on the axis it never drives:
- build a drawing whose line carries **only** `userData = { layer: 'A-FURN' }` (the exact shape OBC leaves) and register it via `registerSegmentUUID(drawing, ls, 'bed-1')`;
- push `{ targetKind: 'element', targetId: 'bed-1', action: 'hide' }` into `localOverrides.visibilityOverrides`;
- render on a recording canvas; **assert no stroke is laid for that line** (`ctx.globalAlpha === 0` or no `stroke()` call) — **RED today**;
- **and in the same test** assert `pvc.hitTest(400,300,40)` returns `null` — **also RED today**, and the arm that stops anyone shipping `:510` without `:2916`;
- control: the same line with **no** override strokes normally and hit-tests to `'bed-1'`.

**Step 1c —** with `selectionBus.currentIds = ['bed-1']` and the element hidden, assert **zero** `rgba(102, 0, 255…)` strokes. RED today.

**Step 2 — red first.** With `isolateActive: true` and `{targetKind:'element', targetId:'bed-1', action:'isolate'}`:
- `makeSymbolInjectionGate(viewId,'plan')('furniture')` must return **true** (RED today — returns false);
- `('wall')` must also return **true** (the gate is not the place isolate is decided);
- after render, the bed's symbol is stroked and a second, non-isolated sofa's is not.

**Step 3 — red first.** A comment-stripped source assertion over all 20 injector files: every file that calls `addProjectionLines` must also assign `elementUUID` on the object it passes. Current reading **3 of 20**; the arm is a shrink-only ratchet at 20/20 with the 3 known-good as the fixture. Plus a behavioural arm: after `_transplantElementLines` grafts a moved sofa, exactly one sofa symbol exists in the drawing (RED today — two).

**Step 4 — red first.** A comment-stripped assertion that `PlanViewCanvas.ts` contains **exactly one** occurrence of the id-ladder expression and **one** call site each for the pen resolution — i.e. that `render`, `_lineIsDrawn` and `_renderPocheFills` all route through `lineAppearsInView`. Plus a parity arm: for a dependent view with no own binding, poché and linework resolve the **same** intent id (RED today — `:2599` bypasses inheritance).

**Step 5 — red first.** Export a sheet with `furniture` hidden by family; assert the SVG contains zero `A-FURN` paths (RED today — it contains all of them).

**Step 6 — red first.** `getVGCategory('KitchenCabinetUnit')`, `('wardrobe_unit')`, `('ParametricTree')`, `('Lighting')`, `('furniture')` all non-null (RED today — all null).

**Step 7 — red first.** With `viewController.currentViewDefinitionId = null`, clicking the Furniture eye must **not** silently no-op: assert either a dispatched command or a user-visible refusal. **And delete the `getActiveId` mock from `elementFilterWritesIntent.spec.ts:73/170/175/182`** — it fakes a method production does not have, which is why this path has a green test and a dead branch. `[[fake-more-capable-than-real]]`.

**Cross-cutting — the vocabulary agreement arm that nobody has.** Six hand-typed registries must agree and nothing checks it. Add a gate asserting that every id in `OverridePanel.CATEGORIES` is a value `penCategoryForLayerTag` can return, and that every key in `VisibilityIntentDefaults.ELEMENT_TYPES` appears in `ELEMENT_TYPE_TO_PROJECTION_LAYER` **and** `ELEMENT_TYPE_TO_VG_CATEGORY`. **First reading will be RED on at least five rows** (`beam`, `railing`, `curtainwall`, `lighting`, `spaceEnvelope`) — baseline it shrink-only. This is the arm that would have caught L-13267's two misses on the day they shipped.

---

## 7. Unknowns, and the cheapest probe for each

| # | Unknown | Cheapest probe | Cost |
|---|---|---|---|
| **1** | **Which gesture he used.** Decides between the four candidates in §1. | **The single decisive test, and it needs no store inspection.** In one plan: (a) **deselect everything**; (b) right-click a **bed** on the plan canvas → **Hide in View** (`PlanViewInteraction.ts:1465` resolves the id through the WeakMap, so the bed *is* pickable; `:1488` writes with `this._viewId`, so there is no active-view ambiguity); (c) right-click a **desk or bookshelf** → Hide in View. **Prediction: the desk goes, the bed stays.** If both go → it is not A1, look at #0 or #3. If both stay → the redraw is broken and my whole diagnosis is downstream of it. If the plan goes blank → isolate/gate. | 60 s |
| **2** | Whether a **category** hide actually fails in plan. I traced the whole chain and found no break, and did **not** run it. | In the same plan, untick **Furniture** in the OverridePanel. If it works and the right-click does not, that asymmetry *is* the proof of A1. If the category hide **also** fails, my trace is wrong and the next place to look is whether `viewDef.id` at projection time equals the `viewId` the panel wrote to. | 20 s |
| **3** | Whether his furniture is engine-built or GLB. | Covered by probe 1's desk/bed pair — no extra cost. | 0 |
| **4** | Whether the unmapped types (`ParametricTree`, `wardrobe_unit`, `Wardrobe*`) reach the **exporter wrapper** or only sit on child meshes. Two of three legs are measured; leg (c) is open. `ParametricTreeEngine.ts:96-107` stamps a top-level returned root, which is a strong candidate. | One console line in a live session: `elementRegistry.getRoot(<treeId>).userData.elementType`. If it reads `'ParametricTree'`, B2's hole is live in **elevation** (wardrobes carry no `skipInElevation`). | 30 s |
| **5** | Whether `SymbolicRuleRenderer` tolerates a zero pen. Door/window symbols take a composed `SymbolPen` rather than the generic stroke path. **This is the one uninspected risk in the step-1 fix.** | Read `SymbolicRuleRenderer`'s stroke path for a `widthMm: 0 / opacity: 0` guard before merging step 1; if absent, add the guard in the same commit. | 15 min |
| **6** | Whether the whole tree ignores `child.visible` (E1's "nothing reads setVisibility"). Proven for the two traversals read; not proven repo-wide. | `grep -rn '\.visible' --include=*.ts` over every consumer of `drawing.three`, comment-stripped. Cheap and it retires E1 for good. | 10 min |
| **7** | The 282 `.visible =` write sites. ~35 classified; the rest sampled, not verified. | Not worth a sweep. Instead add the C3 discipline as a gate: **every service that writes `Object3D.visible` must record what it hid and restore only that** — `LevelScoped3DCullingService` already does, `PlanViewVisibilityCuller` does not (`:135`). One arm, permanent. | 1 h |
| **8** | Perf impact of the cache-key cardinality change (§5.3). Named as a risk, not measured. | Instrument `_cache.size` and count `clear()` calls per frame on the densest available plan, before and after step 1. If clears/frame > 0, apply the `RULE_PRIORITY_ELEMENT` short-circuit guard. | 30 min |

---

### The one thing to carry out of this

The bug is **one field on one line**, and the reason it survived eight audits is that **three separate comments in two files tell the reader it is already refuted**, citing a test that only ever drives the family axis. Fixing `:510` without deleting those three comments leaves the next reader instructed not to reopen it. `[[gate-blind-on-the-wrong-axis]]`, `[[same-rule-two-implementations]]`.