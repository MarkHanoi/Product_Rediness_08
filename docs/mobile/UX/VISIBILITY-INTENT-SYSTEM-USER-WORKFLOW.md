# PRYZM — Visibility Intent System: Complete User Workflow

**Document type:** UX Reference  
**Version:** 1.0  
**Covers:** Contract 25 (Visibility Intent System), Phases 1–8

---

## Overview

The Visibility Intent System controls how every element in your project looks in every view. It answers two questions for each element:

1. **Is it visible at all?** (Hidden, Isolated, Ghosted, or Shown normally)
2. **If visible, how should it look?** (Line weight, line colour, fill colour, opacity)

The system works through a three-tier priority stack. Each tier can override the tier below it:

```
Tier 1 — Per-element overrides  (highest priority — "this specific wall, in this view")
Tier 2 — View intent instance   (mid priority — "all walls in this view follow Intent X")
Tier 3 — Visibility Intent      (base priority — "the default look for all walls everywhere")
```

---

## Core Concepts

### Visibility Intent

A **Visibility Intent** is a named style template — like "Construction Documents" or "Structural Review". It defines how each element type (walls, slabs, doors, windows, etc.) should look in each of its states:

| State        | Meaning                                                  |
|------------- |----------------------------------------------------------|
| **Cut**      | Element sliced by the view cut plane (plan view walls)   |
| **Beyond**   | Element visible but above the cut plane                  |
| **Hidden**   | Element hidden by geometry (shown as dashed if at all)   |
| **Projection** | Element seen from the side (elevations, sections)      |

For each state, the Intent defines: line colour, line weight, line style (solid/dashed/dotted), fill colour, fill style (solid/poche/hatch/none), and opacity.

### View Intent Instance

Each view is assigned one Intent. This assignment is the **View Intent Instance**. Changing which Intent a view uses swaps its entire graphic appearance in one action.

### Graphic Override

A **Graphic Override** is a per-element style change applied on top of the Intent for a specific view. For example: "Wall 42 should be red in this view, even though the Intent says black."

---

## Workflow 1: Creating a Visibility Intent

Use this when you want to define a new named graphic standard (e.g. for a new discipline or drawing set).

1. Open the **Visibility Intent Panel** from the toolbar or from the View Properties panel (click **Open Intent Settings ▸**).
2. In the panel header, click **+ New Intent**.
3. Give the Intent a name (e.g. "MEP Coordination") and optional description.
4. Select an element type from the left list (e.g. "Wall").
5. Select a state tab at the top (Cut / Beyond / Hidden / Projection).
6. Adjust **Line Weight**, **Line Colour**, **Fill Colour**, **Fill Style**, and **Opacity** using the editors.
7. Repeat steps 4–6 for each element type you need to configure.
8. The Intent is saved automatically. It is now available to assign to any view.

**Tip:** System intents (e.g. "PRYZM Default") cannot be edited. They serve as a baseline for new projects.

---

## Workflow 2: Assigning an Intent to a View

Use this when you want a view to use a specific graphic standard.

1. In the **Views Browser**, right-click the target view and choose **View Properties**, or click the view's settings icon.
2. In the View Properties panel, scroll to the **Visibility Intent** section.
3. Select the desired Intent from the dropdown list.
4. The view immediately adopts the new Intent's graphic rules. All elements redraw.

Alternatively:
1. Open the **Visibility Intent Panel**.
2. Select the Intent you want to use.
3. Use the **Assign to View** button and choose the target view from the picker.

**Note:** Each view can have only one assigned Intent at a time. Changing it replaces the previous assignment.

---

## Workflow 3: Hiding an Element in a View

Use this when a specific element should not appear in one particular view (without deleting it).

**Via keyboard shortcut:**

1. Click to select the element in the 3D viewport.
2. Press **H** to hide it in the current active view.

**Via right-click menu:**

1. Right-click the element in the viewport.
2. Choose **Hide in View**.

The element disappears from the current view only. It remains visible in all other views and in the 3D model. The hide action is recorded as a **Visibility Override** on the view's Intent Instance.

**To undo a hide:** Press **Ctrl+Z**, or use **Clear Overrides** (see Workflow 7).

---

## Workflow 4: Isolating Elements in a View

Use this to show only selected elements and ghost or hide everything else.

1. Select one or more elements.
2. Right-click and choose **Isolate in View**, or press **I** (if configured).

All other elements in the view become ghosted (shown at low opacity). Only the selected elements render at full appearance. This is useful for reviewing a single discipline without visual noise.

**To exit isolation:** Use **Clear Overrides** (Workflow 7) or press **Ctrl+Z**.

---

## Workflow 5: Ghosting an Element in a View

Use this to show an element at reduced opacity — visible for spatial reference but not print-quality.

1. Select the element.
2. Right-click and choose **Ghost in View**.

The element renders at ~25% opacity using the "fade" ghost style. Useful for showing underlying conditions, reference structure, or context without cluttering the primary drawing.

---

## Workflow 6: Applying a Graphic Override to an Element

Use this when one specific element needs to look different from the rest — for example, highlighting a modified wall in red for a revision cloud.

**Method A — Command:**

1. Select the element.
2. Open the right-click menu and choose **Set Graphic Override**.
3. In the dialog, choose the property to override: Line Colour, Line Weight, Fill Colour, or Fill Style.
4. Set the new value.
5. Click Apply.

**Method B — Visibility Intent Panel:**

1. Open the **Visibility Intent Panel**.
2. The currently active view and its overrides are shown at the bottom.
3. Click the element's row and edit the override properties inline.

Graphic overrides apply per element, per view, per state. A wall can be black in cut state and red in projection state within the same view.

**To remove a single override:** Select the element → right-click → **Clear Override** (or press **Ctrl+Z**).

---

## Workflow 7: Clearing All Overrides in a View

Use this to reset a view back to its pure Intent appearance, removing all element-level hide/isolate/ghost/graphic overrides.

1. Make the target view active (click it in the Views Browser, or open it in the viewport).
2. Open the View Properties panel for that view.
3. Scroll to the **Visibility Intent** section.
4. Click **Clear All Overrides**.

A confirmation prompt appears. Confirming removes all visibility and graphic overrides for that view. The view reverts to showing everything according to its assigned Intent.

---

## Workflow 8: Editing an Existing Visibility Intent

Use this to update the graphic rules of an Intent — all views using that Intent update automatically.

1. Open the **Visibility Intent Panel**.
2. Select the Intent from the left list.
3. Make changes to any element type's state appearance.

All views that have this Intent assigned immediately redraw with the new rules. No manual refresh is needed.

**Caution:** Editing a shared Intent changes the appearance in every view that uses it. If you only want to change the appearance in one view, use a Graphic Override (Workflow 6) instead of editing the Intent.

---

## Workflow 9: Duplicating an Intent

Use this to create a variant of an existing Intent for a new drawing set, without starting from scratch.

1. Open the **Visibility Intent Panel**.
2. Select the Intent you want to duplicate.
3. Click the **Duplicate** button (copy icon next to the Intent name).
4. A new Intent named "Copy of [original]" is created with identical rules.
5. Rename it and make your changes.

---

## Workflow 10: Deleting an Intent

1. Open the **Visibility Intent Panel**.
2. Select the Intent.
3. Click the **Delete** (trash) button.

If the Intent is assigned to one or more views, a warning lists those views. Deleting a used Intent leaves those views without an assigned Intent — they fall back to the default system appearance.

**System Intents cannot be deleted.**

---

## Priority Resolution — How Styles Are Computed

When PRYZM renders an element in a view, it evaluates the following priority cascade from highest to lowest:

```
Priority 50000  Graphic Override (per-element, per-view)
Priority 40000  Visibility Override (hide/isolate/ghost, per-element, per-view)
Priority 30000  View Intent Instance (which Intent is assigned to this view)
Priority 20000  Visibility Intent elementRules (the Intent's base rules)
Priority 10000  System defaults (PRYZM built-in fallback)
```

The first match at any priority level wins. If an element has a Graphic Override for red lines, that always wins over the Intent's black lines. If a view hides an element, the hide wins over the Intent's visibility rules.

---

## View-Type Modifiers

Some Intents include **View-Type Modifiers** — rules that adjust the base style when the Intent is used in a specific view type (Plan, Section, Elevation, 3D, Detail, etc.).

For example, a "Construction Documents" Intent might:
- Show walls in **poche** fill in plan views
- Show walls with **no fill** in section/elevation views
- Show walls with **thin lines** in 3D views

Modifiers are configured in the **Visibility Intent Panel** under the **Modifiers** tab. They override the base rules for the specified view type only.

---

## Legacy V/G Panel (Archived)

Prior to Phase 8, element appearance was managed through the **V/G Governance Panel** (a Revit-style Visibility/Graphics dialog). This panel has been replaced by the Visibility Intent System.

- The V/G panel is **no longer accessible** from the View Properties panel.
- The **"Open Intent Settings ▸"** button in View Properties now opens the Visibility Intent Panel.
- Projects created before Phase 8 are **automatically migrated** on first load: VG templates become Intents, and per-element VG overrides become Graphic Overrides.

The legacy V/G data is preserved in the project file for reference but plays no role in rendering.

---

## Keyboard Shortcuts Reference

| Shortcut      | Action                                      |
|---------------|---------------------------------------------|
| `H`           | Hide selected element in active view        |
| `I`           | Isolate selected element in active view     |
| `Ctrl+Z`      | Undo last visibility or graphic override    |
| `Ctrl+Y`      | Redo                                        |

---

## Frequently Asked Questions

**Q: I hid an element. How do I make it visible again?**  
A: Press `Ctrl+Z` to undo the hide immediately. Or use **Clear All Overrides** in the View Properties panel to reset all hides in that view. Individual element hides can also be cleared via right-click → **Clear Override**.

**Q: I changed an Intent and now several views look wrong. How do I undo?**  
A: Press `Ctrl+Z` to undo the Intent edit. The change reverts in all views instantly.

**Q: Can I assign different Intents to different views in the same project?**  
A: Yes. Each view has its own Intent assignment. You can have a "Structural" Intent on structural views and a "Architectural" Intent on all other views.

**Q: What happens if I delete the only Intent in my project?**  
A: All views without an assigned Intent fall back to the PRYZM system default appearance (thin black lines, no fill). The system default cannot be deleted.

**Q: My Graphic Override isn't working — the element still shows the Intent colour.**  
A: Graphic Overrides apply per-state. Make sure you set the override for the correct state (Cut / Beyond / Projection). The element may be in a different state in the current view than expected.

**Q: How many Intents can I create?**  
A: There is no enforced limit. For performance, it is recommended to keep the number of active Intents under 50 per project.
