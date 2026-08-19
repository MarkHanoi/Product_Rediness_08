# ADR-0336 — The Project Browser element filter writes VISIBILITY INTENT, not `Object3D.visible`

- **Status**: ACCEPTED — 2026-08-19
- **Contract**: [C09 §4.7](../contracts/C09-AI-AND-VISIBILITY-INTENT.md) (normative home)
- **Principle**: P7 (visibility intent ≠ UI state)
- **Supersedes nothing.** Closes the routing half of **OI-058** and names the largest single
  holder of P7 ARM B.

## Context — the founder's report, and why it is THREE known items

> *"The element filter works great in 3D view — could it also work for ANY possible active
> view? Plan view, elevation, etc.?"*

The control is the Project Browser's **ELEMENTS** list
(`apps/editor/src/ui/ViewBrowser/panels/unified-browser/ProjectVisibilitySection.ts`), with its
Search and **Reset visibility** affordances.

Three separately-tracked items are **one defect**:

| Item | How it was tracked | What it actually is |
|---|---|---|
| The founder's feature request | a feature gap | the filter never expresses view-scoped intent |
| **The largest single P7 ARM-B violation** | `13` of the gate's `40` tolerated `.visible =` writes, in **one file** | the same 13 writes |
| **OI-058** (`pascalorg-editor-research.md` §3.1, *"highest-value takeaway"*) | a **perf** finding — 8 full-scene traverses | the same 8 traverses |

**Measured 2026-08-19**, `npx tsx tools/ga-gate/check-visibility-intent-not-ui.ts` → **RC=0**,
`ARM B … 40/43`, top holder:

```
13  apps/editor/src/ui/ViewBrowser/panels/unified-browser/ProjectVisibilitySection.ts
```

`scene.traverse` over that file → **8**, at lines
`69 · 77 · 93 · 104 · 125 · 156 · 193 · 307`. The P7 count and the OI-058 count are **the same
code read twice**.

## The finding — and the part the hypothesis got WRONG

The working hypothesis was: *the filter writes UI state; projected views never read
`Object3D.visible`; therefore "it does not work in plan" is **unsatisfiable**, not broken.*

**The first two clauses are confirmed. The conclusion is only half the story, and the other half
decides the size of the work.**

### Confirmed — projected views never read `Object3D.visible` for native elements

`apps/editor/src/engine/views/EdgeProjectorService.ts` (3851 lines) contains **exactly two**
`.visible` tokens: `:2308` `result.visible` (an OBC geometry buffer, not a flag) and `:3288`
`if (!mesh.visible) return;` — which lives in the **IFC/fragment branch (Source C)**.

**Source B — the NATIVE PRYZM element path (`:2328`–`:3242`), where every element in the
founder's screenshot comes from — has ZERO reads of `Object3D.visible`.** It does not walk the
scene graph at all: it iterates `nativeMeshGroups` built by
`NativeElementMeshExporter.exportForView()` from **BimManager levels + elementRegistry**. Its
only filters are view-type mesh-role opt-outs and geometric AABB culls.

⇒ For a native wall, *"the Project Browser hid it, so plan should not draw it"* is a condition
that **can never become true**. That is §UNSATISFIABLE-GATE, and it is why no amount of
debugging the plan renderer would have found it.

### NOT predicted — the correct authority ALREADY EXISTS, is persisted, and is already read

`ViewIntentInstance.localOverrides` (`OverrideLayer`) carries
`visibilityOverrides: VisibilityOverride[]` with
`targetKind: 'element' | 'elementType' | 'category'` and `action: 'hide' | 'isolate' | 'ghost'`
(`packages/core-app-model/src/presentation/VisibilityIntentTypes.ts:620-685`) — **per-ELEMENT,
per-VIEW**. It is:

- **written by commands that already exist and are already on the bus** —
  `HideElementInViewCommand` / `IsolateElementInViewCommand` / `GhostElementInViewCommand` /
  `ClearOverrideCommand` (`packages/command-registry/src/vg/`), registered at
  `apps/editor/src/engine/initBusHandlers.ts:2366-2394` as `view.hideElement` /
  `view.isolateElement` / `view.setGraphicOverride` / `view.clearOverride`;
- **already reachable from a DIFFERENT UI** — `apps/editor/src/ui/RadialMenu.ts:268-274` and
  `apps/editor/src/engine/views/PlanViewInteraction.ts:1328-1349` (right-click → *"Hide in
  View"*);
- **persisted** — `ProjectSerializer.ts:855` / `ProjectLoader.ts:1141`;
- **undoable** — each command carries a real inverse and declares
  `affectedStores = ['view-intent-instance']`;
- **and already READ by the 2D drawing pen path**:
  `PlanViewCanvas.ts:459-465` calls
  `graphicsRulesEngine.resolveStyle(zone, category, { viewId, elementId: child.userData.elementUUID, … })`
  → `GraphicsRulesEngine._intentRules` (`:377-407`) → `resolveIntentPenStyle` →
  `resolveIntentStyle` (`IntentRuleResolver.ts:198-224`) → `appearanceToPenStyle` (`:132-138`).

**This was proven by EXECUTION, not by reading.** A probe driving the real
`viewIntentInstanceStore`, the real `HideElementInViewCommand` and the real
`graphicsRulesEngine` — no stub of anything under test — returns:

```
baseline         A{opacity:1, widthMm:0.5}   B{opacity:1, widthMm:0.5}
after hide(A)    A{opacity:0, widthMm:0}     B{opacity:1, widthMm:0.5}
other view       A{opacity:1, widthMm:0.5}
[PASS] positive control: both visible at baseline
[PASS] per-element hide reaches the PEN (A -> opacity 0, width 0)
[PASS] negative control: hide is ELEMENT-scoped (B untouched)
[PASS] scope control: a DIFFERENT view is unaffected
```

⇒ **The founder's feature is a ROUTING job, not a build.** The plan/section/elevation half
already works, for every element, per view, persisted and undoable. **The Project Browser is the
one surface in the product that bypasses it** — it writes `Object3D.visible` through
`window.selectionManager.world.scene.three`, which only the 3D viewport reads.

*3D "works great" precisely BECAUSE mutating `Object3D.visible` happens to be the correct
application of intent in that one surface — the filter has been writing the ANSWER for one view
instead of the QUESTION for all of them.*

## Decision

### D1 — The element filter WRITES INTENT. One authority, many readers.

The Project Browser's element/category visibility ops MUST dispatch the existing bus verbs
(`view.hideElement`, `view.isolateElement`, `view.clearOverride`) against the **active view**.
They MUST NOT be the authority for what is visible.

`OverrideLayer.visibilityOverrides` on `ViewIntentInstance` is **the single authority**. Every
view type is a **READER** through its own applicator:

| Reader | Mechanism | State |
|---|---|---|
| plan · section · elevation (2D canvas) | `graphicsRulesEngine.resolveStyle({viewId, elementId})` → pen `opacity/widthMm = 0` | **ALREADY WORKS** (executed proof above) |
| sheets / viewports | delegate to the same plan source via `ViewSource` | inherits, no new code |
| 3D viewport | an applicator arm that READS the resolved intent and sets `Object3D.visible` | **TO BUILD** — see D4 |
| Cesium / site view | out of scope; site context is not a model-element surface | not addressed |

⛔ **A second per-view traversal MUST NOT be added.** Setting `Object3D.visible` in 3D is not a
P7 violation *per se* — it is the legitimate APPLICATION of intent in the one surface where the
scene graph is the output medium. It becomes a violation when the UI panel does it directly, as
the authority, which is exactly today's defect.

### D2 — Scope semantics: PER-VIEW, applied to the ACTIVE view. (Revit alignment.)

Hiding a wall from the Project Browser is a **VIEW-scoped** act, not project-wide and not
template-wide. This is Revit's model, and the founder's own panel already renders it:
*"Used by 8 views"* + *"NO OVERRIDES"* — i.e. an intent is SHARED by N views, while overrides
are LOCAL to one.

Consequences that MUST be honoured, because they are not obvious and will be hit:

1. Switching views does **not** carry the hide across. That is correct and is Revit's behaviour.
2. Because it is correct-but-surprising, the panel **MUST name the view it is acting on**. A
   filter that silently retargets on view switch is indistinguishable from one that is broken.
3. A project-wide hide, if ever wanted, is a **separate, named act** (edit the bound INTENT,
   which is `elementRules[elementType].visible` and is shared by all 8 views) — never an
   unlabelled side effect of the same control.
4. `OverrideTargetKind` has **no `'level'` member**. The Project Browser's LEVEL axis therefore
   has no direct intent expression today; it stays on the legacy path until either a `'level'`
   target kind is minted or the level axis is expressed as N element overrides. **This is
   recorded as open, not silently mapped** — see §Open.

### D3 — `Reset visibility` clears OVERRIDES, and says so.

It MUST dispatch `view.clearAllOverrides` for the active view, returning the panel to the
*"NO OVERRIDES / Pure intent"* state the ViewProperties panel already displays. It MUST NOT
reach into the scene and set everything visible, because that desynchronises the scene from the
authority (today it does exactly that).

### D4 — 3D becomes a READER before the legacy traverses are deleted. Ordering is binding.

The eight traverses MUST NOT be removed in the same change that starts writing intent. Until a
3D applicator arm reads `OverrideLayer`, deleting them regresses the one view that works today —
§REFUSING-HALF-NEEDS-ITS-ESCAPE-HATCH. The ordering is:

1. **Step 1 (this ADR's implementation)** — the filter writes intent *in addition to* its
   existing scene write. Plan/elevation/section start working. 3D keeps working via the legacy
   path. **No P7 or OI-058 credit is claimed at this step, and none may be claimed.**
2. **Step 2** — a 3D applicator arm reads the resolved override layer. Only then do the eight
   traverses and the `bag.*Visible` maps come out, retiring **13 of the 40** P7 ARM-B violations
   and **8 of the 8** traverses in one change.

Splitting it this way is deliberate: Step 1 is provable and cannot regress, Step 2 is the
ratchet payment. **Claiming Step 2's numbers while shipping Step 1 is the defect this repo keeps
paying for.**

### D5 — Panel state is NOT the source of truth and MUST NOT be persisted separately.

`UnifiedBrowserPanel._elemVisible` / `_catVisible` / `_levelVisible` / `_isolateMode` are
private in-memory `Map`s (`UnifiedBrowserPanel.ts:101-111`) with **no serializer entry anywhere**
— confirmed: `grep elemVisible packages/persistence-client packages/file-format` → 0 hits, and
there is no re-apply hook, so any scene rebuild silently drops the filter while the panel keeps
showing the eye-off icon. The fix is **not** to persist them. They become a *projection* of the
override layer, which is already persisted and already survives reload and project switch.

## Consequences

- The founder's feature is delivered by routing, not by a new subsystem.
- One authority replaces a UI-state map that could never have reached a projected view.
- The perf win (OI-058) and the P7 ratchet payment fall out of Step 2 for free — but only at
  Step 2.
- A real defect surfaced *by this analysis* and fixed with it: `PlanViewCanvas.ts:2430-2438`
  resolves the **cut poché fill** through `resolveIntentStyle(..., { elementType, category })`
  with **no `elementId`**, so a per-element hide would have removed an element's outline and
  left its grey fill drawn. Passing `elementId` there is required for D1 to be visually true.

## Open — recorded, not inferred

1. **`OverrideTargetKind` has no `'level'`.** The Project Browser's level axis (and the
   `ifc-storey:` path) has no intent expression. Mint a target kind, or expand to N element
   overrides, or leave the level axis 3D-only — undecided.
2. **Five rival visibility mechanisms exist**, and this ADR blesses ONE.
   `vgInstanceOverrideStore` is `@deprecated` with **zero writers and no persistence**;
   `visibilityRuleEngine` is persisted but has **no human UI** (AI-only, via
   `ViewAuthoringIntentMapper.ts:193`); `packages/visibility`'s `ViewVisibilityIntentStore` is
   wired to five bus verbs and read by `SpatialTree` but its own header says
   **NOT PERSISTED · NOT UNDOABLE · NOT REPLICATED**. Consolidation is not attempted here and
   MUST NOT be assumed.
3. **`applyToProjectionLayers` is per-CATEGORY only** and always will be — it drives
   `drawing.layers.setVisibility(layerName, …)` over 14 DXF layers with **no `elementId` in
   scope anywhere in the method** (`VGSceneApplicator.ts:517-616`). It is not, and must not be
   mistaken for, the per-element route. The per-element route is the PEN, not the layer.
4. **`clipSignature` (`EdgeProjectorService.ts:1791`) carries no visibility term**, so a
   projection-time veto (as opposed to the paint-time pen veto used here) would not invalidate
   cached geometry. The pen route was chosen partly because it sidesteps this entirely.
