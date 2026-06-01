# PRYZM — Visibility Intent Panel: Gap Analysis & View-Type Specificity Design

**Document type:** Analysis / Design Brief for Next Development Round  
**Date:** 2026-04-15  
**Status:** Pre-implementation (no code changes made)  
**Author:** System analysis — Contract 25 Phase 9 preparation

---

## Executive Summary

Two gaps have been identified in the current Visibility Intent Panel (Phase 7/8 UI):

1. **Fill colour is missing from the editor.** The old V/G panel exposed both fill colour and edge (line) colour per category. The new Intent panel exposes line colour and fill *style* but omits the fill *colour* picker entirely. Additionally, the Intent system's `fill.colour` field does not yet drive 3D surface colour — the 3D renderer reads `wall.materialColor` (a per-element property) instead.

2. **Intent rules apply uniformly across all view types.** The base intent defines one set of rules per element type, with no UI exposure of view-type-specific variations. The data model already supports this via `ViewTypeModifier`, but the UI only exposes it as raw JSON — not as a first-class editing surface. The user has also correctly identified a richer concept: **view purpose** (Construction Documents vs Design Review vs Coordination) which does not yet exist in the data model at all.

---

## Gap 1: Fill Colour

### Current State

The `renderAppearanceForm()` method in `VisibilityIntentPanel.ts` renders these fields per state (Cut/Beyond/Hidden/Projection):

| Field          | Control           | Status  |
|----------------|-------------------|---------|
| Visible        | Checkbox          | Present |
| Line weight    | Number input      | Present |
| Line colour    | Color picker      | Present |
| Line opacity   | Number input      | Present |
| Line style     | Dropdown          | Present |
| Fill style     | Dropdown          | Present |
| Fill opacity   | Number input      | Present |
| Fill colour    | **MISSING**       | **GAP** |
| Symbolic rule  | Text input        | Present |

The `FillAppearance` interface (`VisibilityIntentTypes.ts`) includes `colour?: string`, making it optional but supported by the data model. The UI simply never renders a color picker for `fill.colour`.

### 3D Rendering Disconnect

The 3D renderer (`WallFragmentBuilder.ts`) reads material colour from the **element-level** property:

```
wall.materialColor ?? '#d4c5b0'   // hardcoded fallback: light tan/grey
```

This is a **per-element attribute** stored in `WallDataSchema` — it is **not** read from the Intent system. The Intent system's `fill.colour` currently drives only 2D plan fill colour (poche shading in section/plan views). In other words:

- Setting `fill.colour = '#ffffff'` in an Intent → white fill in 2D plan cut state only
- The 3D surface colour of a wall → still controlled by `wall.materialColor` (element property)

This means **two separate colour systems** exist for the same element:

| Colour system       | Where set             | What it controls          | Current gap  |
|---------------------|-----------------------|---------------------------|--------------|
| `wall.materialColor`| Element properties UI | 3D surface colour         | Not in Intent system |
| `intent.fill.colour`| Intent panel          | 2D plan fill/poche colour | UI picker missing |

### Recommended Fix (Phase 9)

**Part A — UI:** Add a fill colour picker to `renderAppearanceForm()` between "Fill style" and "Fill opacity":

```html
<div class="vi-label">Fill colour</div>
<input class="vi-input" type="color" data-appearance="fill.colour" 
       value="${appearance.fill.colour ?? '#cccccc'}">
```

**Part B — 3D Bridge:** Define how `fill.colour` flows into 3D rendering. There are two architectural options:

**Option B1 — Intent overrides 3D material colour (Recommended)**  
When a view has an assigned Intent, the renderer queries `resolveIntentStyle()` for the element in 3D state and uses `appearance.fill.colour` as the surface colour (overriding `wall.materialColor`). This makes Intent the single style authority for all view types including 3D.

Advantage: Single source of truth. One intent can control both plan poche colour and 3D surface colour.  
Disadvantage: Requires threading the renderer through the Intent resolution pipeline, which it currently bypasses.

**Option B2 — Dedicated 3D colour field in Intent**  
Add a `surfaceColour?: string` field to `ElementStateAppearance` or to `ViewTypeModifier` (3D-specific). This is explicit and less ambiguous (fill.colour = "what you'd see in poche on a drawing", surface.colour = "what you'd see in the 3D model").

Advantage: Semantically cleaner — plan poche colour and 3D material colour are different concepts.  
Disadvantage: More data to manage; users configure two colour fields.

**Recommendation:** Option B1 with a ViewTypeModifier bridge — base `fill.colour` controls plan poche, the 3D view-type modifier overrides it for surface colour. See Gap 2 for the modifier system design.

---

## Gap 2: View-Type Specificity

### Current State

The Visibility Intent system has a **two-level structure**:

```
Level 1 — elementRules   (one rule per element type, no view-type differentiation)
Level 2 — viewTypeModifiers  (patches per viewType × elementType × state)
```

The `ViewTypeModifier` data type already exists and supports:
- Targeting a specific `viewType` string (plan, section, elevation, 3d, detail, rcp, etc.)
- Optionally scoping to a specific `elementType`
- A `statePatch` — a partial appearance override per state
- A `stateTransform` — source-state remapping and line-weight multiplication

However, the current UI only exposes modifiers as a raw JSON text field:

```html
<input data-modifier-field="statePatch" value='{"cut":{"line":{"weight":0.5}}}'>
```

This is completely unusable for non-technical users. No ordinary workflow can reach this today.

### What the User Expects

Looking at the old V/G panel (screenshot 1), the system showed per-category settings that implied the same appearance across all views. The user now correctly asks: **should graphics settings be different per view type?**

The answer in professional BIM practice is: **yes, always.**

| View type       | Expected wall behaviour                                          |
|-----------------|------------------------------------------------------------------|
| Plan (cut)      | Poche fill (black/dark), heavy cut line, no projection fill      |
| Section/Elevation| Thin lines, no fill (or light grey), cut elements show poche     |
| 3D              | Material surface colour (white/grey/tan), no poche, ambient lit  |
| Detail          | Poche fill, heavier weight cut lines (×2 scale factor typical)   |
| Reflected Ceiling| Inverted — ceiling is primary surface, no floor poche           |
| Drafting/Legend  | User-controlled, no 3D mesh                                     |

The current base `elementRules` in an Intent only defines one cut, beyond, hidden, projection state — these map well to plan and section views but are semantically ambiguous for 3D (where "cut" and "beyond" don't really apply in the same way).

### Proposed Three-Level Specificity Model (Phase 9 Design)

```
Level 1 — Base Intent rules           (element type × state — the "everywhere" default)
Level 2 — View-type rules             (element type × state × viewType — overrides Level 1)
Level 3 — View-purpose rules          (element type × state × viewType × purpose — overrides Level 2)
```

**Level 1 (exists):** Wall cut = poche fill, 0.5mm edge. Used when no view-type rule is found.

**Level 2 (partially exists via ViewTypeModifier, but UI is missing):**  
Wall in 3D view: fill.colour = '#e8e8e8' (light grey surface). No poche. Full opacity.  
Wall in section: no poche fill. Thinner lines. Beyond = dashed grey.

**Level 3 (does not yet exist in data model):**  
"Construction Documents" purpose: walls in plan = black poche, 0.70mm cut line.  
"Design Review" purpose: walls in plan = 50% transparent medium grey, 0.25mm lines.  
"Coordination (MEP)" purpose: walls ghosted to 20% opacity, all elements thin grey.

### View Purpose Concept

The user's observation about "view purpose" is the most important expansion needed. It maps to a concept found in production BIM tools as **graphic template sets** or **view discipline filters**.

A "view purpose" could be implemented as a named tag on a view, then the Intent system would pick a different modifier set based on that tag. Example:

```
ViewDefinition.purpose = 'construction-docs' | 'design-review' | 'coordination' | 'presentation' | null
```

The Intent would then have:

```ts
purposeModifiers: Array<{
  purpose: string;          // 'construction-docs' etc.
  viewType?: string;        // optionally also scoped to view type
  elementType?: string;
  statePatch: Partial<Record<ElementState, Partial<ElementStateAppearance>>>;
}>
```

### What Would Change in the UI

Instead of the current raw JSON modifier editor, the Intent panel needs a structured modifier table:

```
[View Type]  [Purpose]  [Element Type]  [State]  → [Appearance editor]
 plan         any        wall            cut      → line.colour + fill.colour + weight + style
 3d           any        wall            (3d)     → surfaceColour + opacity
 section      CD         wall            cut      → heavier weight override
```

This becomes a grid/matrix editor, similar in spirit to the old V/G panel's category grid (screenshot 1), but parameterised by view type and purpose rather than just category.

---

## Summary of Recommended Phase 9 Work

### Priority 1 — Fill colour picker (small, high value)

| Item | Description |
|------|-------------|
| P9-01 | Add `fill.colour` color picker to `VisibilityIntentPanel.renderAppearanceForm()` |
| P9-02 | Add `fill.colour` to the update path in `updateAppearance()` |
| P9-03 | Ensure `fill.colour` is serialized/deserialized in Intent snapshots (likely already works) |

### Priority 2 — View-type modifier UI (medium, high value)

| Item | Description |
|------|-------------|
| P9-10 | Replace raw JSON modifier inputs with a structured per-viewType × element × state editor |
| P9-11 | Add a first-class "3D appearance" section to the Intent editor (a viewType='3d' modifier block) |
| P9-12 | Wire `fill.colour` (from the 3D view-type modifier) into the 3D renderer as the surface colour source |
| P9-13 | Ensure `IntentRuleResolver.resolveIntentStyle()` is called by `WallFragmentBuilder` for the active view |

### Priority 3 — View purpose system (large, high strategic value)

| Item | Description |
|------|-------------|
| P9-20 | Add `purpose?: string` field to `ViewDefinition` (new optional tag on every view) |
| P9-21 | Add `purposeModifiers` array to `VisibilityIntent` data type |
| P9-22 | Extend `IntentRuleResolver` to evaluate purpose modifiers after view-type modifiers |
| P9-23 | Add purpose picker UI to View Properties panel |
| P9-24 | Add purpose modifier editor to Visibility Intent Panel |
| P9-25 | Seed built-in purpose modifiers: `construction-docs`, `design-review`, `coordination`, `presentation` |

---

## Specific Scenario: Making All Walls White in 3D

The user's concrete example: *"How do I make all walls render white in 3D?"*

**Today (broken workflow):**  
Impossible via the Intent panel. User would need to select each wall individually and change its `materialColor` property in the element properties panel.

**After Phase 9 (clean workflow):**  
1. Open Visibility Intent Panel
2. Select the Intent assigned to the target view (or the project default)
3. In the **View-Type section**, select **3D**
4. Select **Wall** as the element type
5. Set **Surface colour** (= `fill.colour` in the 3D modifier) to **#ffffff**
6. All views of type 3D using this Intent instantly show white walls

This is the standard Revit-equivalent workflow: Graphic Overrides in the Visibility/Graphics dialog, scoped to the 3D view.

---

## Data Model Changes Summary

```ts
// EXISTING (no change needed for P9-01 to P9-02):
interface FillAppearance {
  style: 'none' | 'solid' | 'poche' | 'hatch';
  colour?: string;   // Already exists — just needs a UI picker
  opacity: number;
}

// EXISTING (needs a better UI for P9-10 to P9-13):
interface ViewTypeModifier {
  viewType: string;
  elementType?: string;
  statePatch: Partial<Record<ElementState, Partial<ElementStateAppearance>>>;
  stateTransform?: ...;
}

// NEW (P9-20 to P9-25):
interface PurposeModifier {
  purpose:      string;              // 'construction-docs' | 'design-review' | ...
  viewType?:    string;              // optional additional scope
  elementType?: string;
  statePatch:   Partial<Record<ElementState, Partial<ElementStateAppearance>>>;
}

interface VisibilityIntent {
  // ... existing fields ...
  viewTypeModifiers:  ViewTypeModifier[];   // already exists
  purposeModifiers?:  PurposeModifier[];    // NEW in Phase 9
}

interface ViewDefinition {
  // ... existing fields ...
  purpose?: 'construction-docs' | 'design-review' | 'coordination' | 'presentation' | string;  // NEW
}
```

---

## Connection to 3D Rendering (Technical Detail)

Currently `WallFragmentBuilder.ts` bypasses the Intent system entirely:

```ts
// TODAY — bypasses Intent system:
const mat = new THREE.MeshStandardMaterial({
  color: new THREE.Color(wall.materialColor ?? '#d4c5b0'),
});
```

After Phase 9, it should query the Intent system for the active 3D view:

```ts
// PROPOSED — Intent system drives 3D colour:
const appearance = resolveIntentStyle(viewInstance, intent, 'wall', 'projection', '3d', target);
const surfaceColour = appearance?.fill?.colour ?? wall.materialColor ?? '#d4c5b0';
const mat = new THREE.MeshStandardMaterial({
  color: new THREE.Color(surfaceColour),
});
```

This requires `WallFragmentBuilder` to receive the active view context (which view is being rendered), so the correct ViewIntentInstance can be looked up. This is the largest engineering change in Phase 9.
