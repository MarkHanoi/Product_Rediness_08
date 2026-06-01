# PRYZM — Visibility Intent User Journeys (and Plan Audit)

**Document type:** User journeys + audit against the implementation plan
**Date:** 2026-04-26
**Status:** Pre-implementation (design only — no code)
**Owner:** Views + Presentation subsystems
**Companion docs:**
- `docs/03-execution/status/intent-analysis/INTENT-AS-VIEW-PROPERTIES-ORCHESTRATION-LAYER.md` — architectural blueprint and 11-stage implementation plan (S1–S8 + P1–P3).
- `docs/03-execution/status/intent-analysis/INTENT-PANELS-UI-UX-DESIGN.md` — visual specification for the five surfaces.
- `docs/USER-GUIDE-VISIBILITY-INTENT.md` — end-user mental model.
- `docs/02-decisions/contracts/25b-VG-INTENT-FULL-CONSOLIDATION-PLAN.md` — V/G retirement contract.
- `docs/01_ELEMENTS/03_VIEWS/10_VIEW_INTENT_SYSTEM_IMPLEMENTATION_PLAN.md` — Stages S1–S8.

---

## 0. Purpose

A user journey is a **task** described from the user's point of view, with **every click** named. Each journey then has an **audit table** that maps each click to the implementation stage that delivers it. If a click cannot be mapped to a stage, the audit calls out a **plan gap** and proposes the addition.

The journeys are deliberately concrete. Examples taken from the user's brief:

- "Change a plan-view wall element to line width 5 mm and colour blue."
- "Cut state of walls in plan: solid black."
- "Control the outlook of beyond / cut / projection lines for any element in elevation and section."
- "Exclude furniture systems from RCP."

These are augmented with eight more journeys covering the four binding modes, version pinning, multi-view edits, undo, and migration from a legacy V/G project.

The 12 journeys are:

| # | Journey | Mode targeted | Surfaces touched |
|---|---|---|---|
| J1 | Make all walls in a plan view: cut solid black, projection blue 0.50 mm | Mode 1 → 2 (Customise then edit) | Properties panel, Action Sheet, Intent Editor, Per-Element Editor |
| J2 | Set beyond / cut / projection styles for beams in a section view | Mode 2 (edit user Intent) | Intent Editor, Per-Element Editor |
| J3 | Exclude furniture from RCP views | Mode 2 | Intent Editor (rule matrix visibility column) |
| J4 | Make a one-off override on a single view | Mode 1 (override only) | Properties panel sections |
| J5 | Save current view-local edits as a brand-new Intent | Mode 4 → 2 | Action Sheet (Save as Intent) |
| J6 | Switch a view from one Intent to another, keeping local tweaks | Mode 1/2 → another | Action Sheet (Bind to) |
| J7 | Pin a view to a specific Intent version | any mode | Properties panel Metadata |
| J8 | Promote a view-local Intent to project-wide | Mode 3 → 2 | Action Sheet (Promote to Shared) |
| J9 | Detach a view (work without an Intent) | Mode 1/2 → 4 | Action Sheet (Detach) |
| J10 | Override a single instance: hide one wall in one view | any mode | On-canvas overrides + Properties spine override list |
| J11 | Change view range: bottom of the cut plane in plan to −2 m for one view | Mode 1 (override) | Properties panel View Range |
| J12 | Migrate a pre-25b project (V/G templates) and verify nothing changed visually | n/a | Background migration + Properties panel verification |

After the journeys, §13 has the **consolidated audit** with concrete updates to the implementation plan (new commands, schema additions, missing UI controls).

---

## J1 — Make all walls in plan view: cut solid black, projection blue 0.50 mm

**Persona:** Architect using a system Intent ("Architectural Documentation"). Wants the project's wall language updated to a darker poche and a blue projection line. The change should propagate to every plan view that uses the same Intent — *not* just this one view.

**Pre-state:**
- Mode 1 (bound to system Intent "Architectural Documentation v3").
- Active view: `GROUND FLOOR` (plan).

### Steps

| # | User action | Surface | What happens |
|---|---|---|---|
| 1 | Click `GROUND FLOOR` in the View Browser. | View Browser | Properties Panel populates. Spine reads "Bound to: Architectural Documentation [ SYSTEM · ⊟ ]". |
| 2 | In the spine, click **Customise**. | Properties → Spine | Inline Action Sheet "Customise this view's Intent" opens (UI/UX §3.1). |
| 3 | Accept the default name "My Architectural Documentation" and choose **Apply to: all 0 other views currently bound to system** (i.e., just this one if it's the only such view). Click **Create user Intent**. | Action Sheet | Backend dispatches `CustomiseIntentForViewCommand` → clones the system Intent into a user Intent → re-binds the view. Spine flips to Mode 2: "Bound to: My Architectural Documentation [user]". |
| 4 | Click **Open Intent Editor ▸** in the spine. | Properties → Spine | Intent Editor modal opens, scrolled to the active view-type's section: ▌Plan▐. |
| 5 | Locate the **Wall** row in the rule matrix. The cells visible are `cut · beyond · projection · hidden`. | Intent Editor → Rule matrix | Cells are populated from the Intent. |
| 6 | Click the **Wall · cut** cell. | Intent Editor | Per-Element Appearance Editor opens (UI/UX §4). |
| 7 | Set Line Weight = `0.7`, Line Colour = `#000000`, Line Style = `Solid`, Fill Style = `Solid`, Fill Colour = `#000000`, Fill Opacity = `1.0`. Click **Apply**. | Per-Element Editor | Backend dispatches `UpdateIntentRuleCommand` → bumps Intent version. Matrix cell updates to `▣ 0.7 black`. |
| 8 | Click the **Wall · projection** cell. | Intent Editor | Editor reopens for the projection state. |
| 9 | Set Line Weight = `0.5` (or `5.0` in the user's example — see note below), Line Colour = `#0000ff`, Line Style = `Solid`. Click **Apply**. | Per-Element Editor | Cell updates. Active plan view canvas repaints within one frame to show new wall styling. |
| 10 | (Optional) Click `...` in the editor → **Apply to all element types (this state)** to also blue every other element's projection state. | Per-Element Editor | Mass-edit applies the same `lineColour` to every row's `projection` cell. |
| 11 | Press `Cmd/Ctrl+S` or click **Save → v4**. | Intent Editor footer | Intent persists at version 4. Every other view bound to "My Architectural Documentation" repaints accordingly (in this case only the GROUND FLOOR, but if more views were bound they would all update). |

**Note on "5 mm".** AEC convention treats line weight as a **screen-space thickness** in mm at the printed page. 5 mm is unusually heavy (typical AEC poche cut is 0.5–0.7 mm; presentation graphics rarely exceed 1.5 mm). The system permits any value the user enters; the Per-Element Editor's slider should allow 0.05–5.0 mm with manual entry beyond if needed (configurable). This document interprets the user's literal request as 5.0 mm and flags it as the upper bound of the slider in §13 audit-item A1.

### Audit table

| Step | Maps to plan stage | Status | Gap? |
|---|---|---|---|
| 1 | (existing) | ✅ already works | — |
| 2 | **P3** (Action Sheet — Customise) | △ pending | requires new command `CustomiseIntentForViewCommand` |
| 3 | **P3** (binding-mode transition) | △ pending | command + ViewIntentInstance schema bump (`intentScope`) |
| 4 | (existing) | ✅ works | navigation only |
| 5 | **S3** (rule matrix) | △ pending | new `ViewTypeRuleMatrix` component |
| 6 | **S3** + **S2** | △ pending | matrix cell click → Per-Element Editor |
| 7 | S2 (fill colour) + existing UpdateIntentRuleCommand | △ partial | fill colour picker is the S2 deliverable; line colour exists |
| 8 | **S3** (matrix) | △ pending | same as step 6 |
| 9 | (existing line colour input) | ✅ partial | line weight slider needs upper-bound validation per audit A1 |
| 10 | **NEW** (mass-edit "..." menu) | △ NOT IN PLAN | **plan gap A2** — see §13 |
| 11 | (existing version bump on save) | ✅ works | — |

---

## J2 — Set beyond / cut / projection styles for beams in a section view

**Persona:** Structural engineer authoring the structural Intent for sections. Beams in section should have heavy cut, dashed projection past the cut, faded beyond past the far clip.

**Pre-state:**
- Mode 2 (bound to user Intent "Structural Coordination v1").
- Active view: `SECTION A-A` (section).

### Steps

| # | User action | Surface | What happens |
|---|---|---|---|
| 1 | Open the Intent Editor for "Structural Coordination" via the spine. | Properties → Spine | Modal opens. |
| 2 | Click the **Section** tab in the per-view-type accordion. | Intent Editor | Sub-sections re-render through `viewTypeProfiles.section`. The matrix shows columns `cut · beyond · projection · hidden` (same as plan, but the View-Range section becomes "cut + far"). |
| 3 | Click **Beam · cut**. | Rule matrix | Per-Element Editor opens for the cut state in the section profile. |
| 4 | Set Line Weight = `0.5`, Line Colour = `#000000`, Fill Style = `Solid`, Fill Colour = `#444444`. Click **Apply**. | Per-Element Editor | Beam cut style for sections updates. |
| 5 | Click **Beam · projection**. Set Line Weight = `0.25`, Line Style = `Dashed`, Line Colour = `#666666`. Click **Apply**. | Per-Element Editor | Beam projection lines become thin dashed grey. |
| 6 | Click **Beam · beyond**. Set Line Weight = `0.18`, Line Opacity = `0.5`, Line Colour = `#999999`. Click **Apply**. | Per-Element Editor | Beam beyond lines become faded thin grey. |
| 7 | (Optional) Repeat for Column, Slab, Wall — or use the **multi-select** affordance: in the matrix, shift-click `Beam · cut`, `Column · cut`, `Slab · cut`, `Wall · cut` then click any selected cell to open the editor in batch mode (UI/UX §5.3). Set Line Weight = `0.5` in one shot. | Rule matrix → Per-Element Editor | All four cells update simultaneously. |
| 8 | **Save → v2**. | Intent Editor footer | Intent persists. All section views bound to "Structural Coordination" repaint. |

### Audit table

| Step | Maps to plan stage | Status | Gap? |
|---|---|---|---|
| 1 | (existing) | ✅ | — |
| 2 | **S3** (per-view-type accordion) | △ pending | section profile must exist in `ViewTypeProfile` schema |
| 3–6 | **S3** + **S2** + existing | △ partial | Per-Element Editor needs to render `Line Style: Dashed` + `Line Opacity` controls (line opacity already in `LineAppearance`) |
| 7 | **NEW** (multi-select in matrix) | △ NOT IN PLAN | **plan gap A3** — see §13 |
| 8 | (existing) | ✅ | — |

**Important:** the section view's effect requires the **edge-projector** to actually emit `beyond` and `projection`-tagged segments past the cut plane. This is partly there (`EdgeProjectorService` + section cuts) but the contract for *which segments are tagged `beyond` vs `projection`* in section/elevation needs a verification pass — see §13 audit-item B1.

---

## J3 — Exclude furniture from RCP views

**Persona:** Architect doing reflected ceiling plans. Furniture clutters the ceiling drawing and should not appear at all in RCP, regardless of the floor plan.

**Pre-state:**
- Mode 2 (bound to user Intent "Architectural Documentation").
- Active view: `RCP — GROUND FLOOR` (ceiling-plan).

### Steps

| # | User action | Surface | What happens |
|---|---|---|---|
| 1 | Open the Intent Editor via the spine. | Properties → Spine | Modal opens. |
| 2 | Click the **RCP** tab in the per-view-type accordion. | Intent Editor | Sub-sections render through `viewTypeProfiles['ceiling-plan']`. |
| 3 | In the rule matrix, scroll to the **Furniture** row. | Rule matrix | Row visible. The right-most column shows `[◯ visible]`. |
| 4 | Click the `[◯ visible]` icon. | Rule matrix → visibility toggle | Icon flips to `[⊘ hidden]`. The row is greyed out. Backend dispatches `SetIntentProfileElementVisibilityCommand` → writes `viewTypeProfiles['ceiling-plan'].elementRules.furniture.visible = false`. Intent version bumps. All RCP views bound to this Intent stop showing furniture. |
| 5 | (Optional) Repeat for **Plumbing**, **Lighting fixture (architectural)** — keep only ceiling-relevant categories like Lighting (mechanical), Diffusers, Sprinklers visible. | Rule matrix | Each row toggle independently. |
| 6 | **Save → v4**. | Intent Editor | Persisted. Every RCP view repaints without furniture. |

### Audit table

| Step | Maps to plan stage | Status | Gap? |
|---|---|---|---|
| 1–2 | **S3** | △ pending | per-view-type accordion |
| 3 | **S3** (rule matrix) | △ pending | matrix component |
| 4 | **NEW** (element-type visibility toggle in profile) | △ NOT IN PLAN | **plan gap A4** — see §13. Needs: schema field on `ElementGraphicsRules` for a profile-level `visible` boolean, new command `SetIntentProfileElementVisibilityCommand`, UI surface for the eye toggle. |
| 5 | same as 4 | △ pending | — |
| 6 | (existing) | ✅ | — |

**Important alternative:** the user could also set `Furniture · projection · visible = false` per state via the Per-Element Editor. That works today but requires the user to hide furniture in *every* state — not a single click. The visibility toggle in the matrix's right column (the eye column) is the **type-level** "always invisible in this view-type" shortcut, which is what J3 asks for. This is the single most-requested AEC workflow that is missing from the current plan.

---

## J4 — Make a one-off override on a single view

**Persona:** Architect needs the GROUND FLOOR plan view to render walls slightly differently than the rest of the project — *just for a presentation board*. Should not change the Intent.

**Pre-state:**
- Mode 1 (bound to system Intent).
- Active view: `GROUND FLOOR` (plan).

### Steps

| # | User action | Surface | What happens |
|---|---|---|---|
| 1 | Right-click any wall in the canvas → **Override appearance in this view…**. | Canvas context menu | Per-Element Appearance Editor opens in **override mode** for `(wall, projection, this view)`. The editor reads "Wall · projection · GROUND FLOOR override". |
| 2 | Set Line Colour = `#ff0000` (red, for presentation emphasis). Click **Apply**. | Per-Element Editor | Backend dispatches `SetViewGraphicOverrideCommand` → writes `localOverrides.graphicOverrides.push({ targetType: 'wall', state: 'projection', patch: { line: { colour: '#ff0000' } } })`. |
| 3 | Spine status badge animates from "Pure intent" → "Customised — 1 override". | Properties → Spine | Override count visible. |
| 4 | (Optional) Click **Show overrides ▾** in the spine. | Properties → Spine | The override list appears with `Wall · projection · lineColour: → #ff0000   [↻ revert]`. |
| 5 | When done with the presentation, click `↻ revert` next to the override entry. | Override list | Backend dispatches `RemoveViewGraphicOverrideCommand`. Wall colour returns to Intent. |

### Audit table

| Step | Maps to plan stage | Status | Gap? |
|---|---|---|---|
| 1 | **NEW** (canvas context menu → "Override appearance in this view") | △ NOT IN PLAN | **plan gap A5** — see §13. Needs: context menu entry, dispatch to Per-Element Editor in override mode. |
| 2 | (existing) | ✅ | `OverrideLayer.graphicOverrides` exists in schema |
| 3 | (existing) | ✅ | spine renders override count |
| 4 | **P1** (override list in spine) | △ pending | extend the spine markup |
| 5 | (existing command) | ✅ | — |

---

## J5 — Save current view-local edits as a brand-new Intent

**Persona:** Architect tinkered with a sketch view (Mode 4, no Intent), liked the result, wants to save it as a reusable Intent.

**Pre-state:**
- Mode 4 (no Intent bound).
- Active view: `SKETCH — Concept A` (plan).

### Steps

| # | User action | Surface | What happens |
|---|---|---|---|
| 1 | Spine shows "Bound to: — (no Intent) [unbound]". Click **Save current settings as Intent**. | Properties → Spine | Action Sheet opens (UI/UX §3.3). |
| 2 | Type Name = "Concept Sketch". Choose Scope = **User Intent (visible everywhere)**. Click **Create Intent**. | Action Sheet | Backend dispatches `CreateIntentFromViewCommand`. New Intent saved. View rebound to it. Spine flips to Mode 2: "Bound to: Concept Sketch [user]". |
| 3 | The Intent Editor is auto-opened so the user can verify and rename anything they want. | Intent Editor (modal) | Editor opens at the active view-type tab. |

### Audit table

| Step | Maps to plan stage | Status | Gap? |
|---|---|---|---|
| 1 | **P3** (Action Sheet) | △ pending | — |
| 2 | **P3** | △ pending | new command `CreateIntentFromViewCommand` (need to enumerate which fields snapshot into the Intent — proposed in §13 audit-item B2) |
| 3 | (UX choice) | — | optional auto-open after create |

---

## J6 — Switch a view from one Intent to another, keeping local tweaks

**Persona:** User wants to swap the bound Intent without losing the per-view colour overrides they've made.

**Pre-state:**
- Mode 2 (bound to "My Construction Docs", with 3 graphic overrides).
- Active view: `GROUND FLOOR`.

### Steps

| # | User action | Surface | What happens |
|---|---|---|---|
| 1 | In the spine, click the Intent dropdown. | Properties → Spine | Inline Bind-to picker opens (variant of UI/UX §3.5). |
| 2 | Choose "Tender Set 2026" from the user-Intent list. | Picker | Action Sheet shows: "Take Intent's defaults for unset fields ☐ vs keep my current per-view values as overrides ☑" |
| 3 | Leave the checkbox checked. Click **Bind**. | Action Sheet | Backend dispatches `BindViewIntentCommand({ keepOverrides: true })`. Existing 3 overrides remain. The 4-bound View Range / Crop / etc. now resolve from the new Intent's defaults but the wall colour overrides survive. |
| 4 | Spine now reads "Bound to: Tender Set 2026 [user] · Customised — 3 overrides". | Properties → Spine | — |

### Audit table

| Step | Maps to plan stage | Status | Gap? |
|---|---|---|---|
| 1–3 | **P3** + (existing AssignViewIntentCommand) | △ partial | existing command lacks the `keepOverrides` flag. Plan-gap **A6** — see §13. |
| 4 | (existing override count rendering) | ✅ | — |

---

## J7 — Pin a view to a specific Intent version

**Persona:** Architect has finalised tender drawings. Other team members will continue editing the project Intent, but the tender views must remain frozen.

**Pre-state:**
- Mode 2 (bound to user Intent "Construction Docs v7", not pinned).
- Active view: `TENDER — A101 GROUND FLOOR PLAN`.

### Steps

| # | User action | Surface | What happens |
|---|---|---|---|
| 1 | Scroll to the Metadata section in the Properties panel. | Properties → Metadata | Section visible. |
| 2 | Click **⊙ pin to v7** next to "Intent Pinned". | Metadata | Backend dispatches `PinViewIntentVersionCommand({ version: 7 })`. Spine shows "Pinned to v7". |
| 3 | A teammate later edits the Intent → it advances to v8. | Server-side | The view detects this on next open. |
| 4 | When the user reopens this view, a banner appears at the top of the spine: "△ Bound Intent has a newer version (v8). You are pinned to v7." | Properties → Spine | Banner click options: **Take v8** or **Stay pinned to v7**. |

### Audit table

| Step | Maps to plan stage | Status | Gap? |
|---|---|---|---|
| 1–2 | **P3** (Metadata extension + PinViewIntentVersionCommand) | △ pending | needs `pinnedVersion` field on `ViewIntentInstance` |
| 3 | (existing collaboration sync — partial) | △ depends on **S8** | persistence + Socket.io broadcast of intent version change |
| 4 | **P3** (Diverged banner UI) | △ pending | — |

---

## J8 — Promote a view-local Intent to project-wide

**Persona:** User created a view-local Intent for one view, found it useful, wants to share it.

**Pre-state:**
- Mode 3 (bound to view-local "Ground Floor Custom v2").
- Active view: `GROUND FLOOR`.

### Steps

| # | User action | Surface | What happens |
|---|---|---|---|
| 1 | In the spine, click **Promote to Shared Intent**. | Properties → Spine | Action Sheet opens (UI/UX §3.4). |
| 2 | Confirm name = "Ground Floor Custom" (or rename). Click **Share Intent**. | Action Sheet | Backend dispatches `PromoteViewLocalIntentCommand`. The Intent's `intentScope` flips from `'view-local'` to `'user'`. It now appears in every other view's Intent picker. |
| 3 | Spine updates to "Bound to: Ground Floor Custom [user]". | Properties → Spine | — |

### Audit table

| Step | Maps to plan stage | Status | Gap? |
|---|---|---|---|
| 1–3 | **P3** | △ pending | new command + scope flip |

---

## J9 — Detach a view (work without an Intent)

**Persona:** User wants a quick sketch view that doesn't follow any project-wide style.

**Pre-state:**
- Mode 1 (bound to system Intent).
- Active view: `SKETCH — Iteration 5`.

### Steps

| # | User action | Surface | What happens |
|---|---|---|---|
| 1 | In the spine, click **More ▾** → **Detach (use system defaults only)**. | Properties → Spine | Confirmation: "Detaching will switch this view to system defaults. Your current values become per-view overrides. Continue? [Cancel] [Detach]" |
| 2 | Click **Detach**. | Confirmation | Backend dispatches `UnbindViewIntentCommand({ keepValuesAsOverrides: true })`. `intentInstance.intentId = null`. Every previously-Intent-sourced field becomes an Override. Spine shows Mode 4. |

### Audit table

| Step | Maps to plan stage | Status | Gap? |
|---|---|---|---|
| 1–2 | **P3** | △ pending | new command `UnbindViewIntentCommand` |

---

## J10 — Hide one specific wall instance in one view

**Persona:** User wants to hide one tracing reference wall on one plan, without affecting Intent-level rules.

**Pre-state:**
- Any mode.
- Active view: `GROUND FLOOR`.
- Element selected on canvas: `wall-id-abc-123`.

### Steps

| # | User action | Surface | What happens |
|---|---|---|---|
| 1 | Right-click the wall → **Hide in this view**. | Canvas context menu | Backend dispatches `AddViewVisibilityOverrideCommand({ targetId: 'wall-abc-123', mode: 'hide' })`. Override layer gets `visibilityOverrides: [{ targetId: 'wall-abc-123', mode: 'hide' }]`. |
| 2 | Wall vanishes in this view; it remains visible in every other view. | Canvas | Renderer respects override. |
| 3 | Spine override count increments. | Properties → Spine | "Customised — 1 override". |
| 4 | Spine override list shows: `Wall #abc-123 · hidden  [↻ revert]`. | Properties → Spine | — |
| 5 | Click `↻ revert`. | Override list | Wall reappears. |

### Audit table

| Step | Maps to plan stage | Status | Gap? |
|---|---|---|---|
| 1 | (existing canvas context menu — Hide/Isolate already implemented per current Override Layer system) | ✅ | — |
| 2 | (existing renderer) | ✅ | — |
| 3 | **P1** (spine override count) | △ pending | extend spine to surface count from `localOverrides.visibilityOverrides.length + .graphicOverrides.length` |
| 4 | **P1** (spine override list) | △ pending | — |
| 5 | (existing) | ✅ | — |

---

## J11 — Change view range: bottom of the cut plane in plan to −2 m for one view

**Persona:** Architect needs an unusual view range for one specific plan (showing a sunken patio level below the floor) without affecting other plans.

**Pre-state:**
- Mode 1 (bound to "Architectural Documentation v3").
- Active view: `GROUND FLOOR` (plan).
- Intent's `viewTypeProfiles.plan.viewRange.defaultDepth = { level: 'this', offset: -1.2 }`.

### Steps

| # | User action | Surface | What happens |
|---|---|---|---|
| 1 | Scroll to **View Range** section. | Properties → View Range | Section renders with all four bounds. The Depth row shows `Off [-1.2 m]   ⓘ Intent · Profile · plan   ↻`. |
| 2 | Click the Offset input on Depth, change to `-2.0`. | View Range | Source pill updates from `Intent · Profile · plan` to `Override (this view)` (amber). Backend dispatches `SetViewRangeOverrideCommand({ depth: { offset: -2.0 } })`. |
| 3 | Canvas repaints. The view shows the structure between -2.0 m and +1.2 m as a `beyond` projection layer. | Canvas | — |
| 4 | (Optional) Click `↻` next to Depth. | View Range | Override cleared, value reverts to `-1.2`. |

### Audit table

| Step | Maps to plan stage | Status | Gap? |
|---|---|---|---|
| 1 | **P2** (resolveViewRange + source pill) | △ pending | — |
| 2 | **P2** (per-row override write) | △ pending | requires extending OverrideLayer to carry `viewRangeOverride: Partial<ViewRangeSettings>` |
| 3 | (existing ViewRangeIntentResolver) | ✅ | — |
| 4 | **P2** | △ pending | — |

---

## J12 — Migrate a pre-25b project (V/G templates) and verify nothing changed visually

**Persona:** Existing user opens a project that was created before V/G retirement. The project has `vgTemplates[]` and views with `vgTemplateId` set.

**Pre-state:** Project loaded, no migration run yet.

### Steps

| # | User action | Surface | What happens |
|---|---|---|---|
| 1 | User opens project. | Project loader | `runVGToIntentMigration()` runs (per Contract 25b §3 Wave 1). For every `vgTemplate`, an Intent is created. For every view with `vgTemplateId`, a `ViewIntentInstance` is created bound to the migrated Intent. Console logs: `[VGToIntentMigration] Migrated 4 templates, 12 view bindings`. |
| 2 | User opens any view — Properties Panel shows the spine bound to the migrated Intent (e.g. "Standard Architecture (migrated)"). The legacy V/G Settings card is **gone** (per §4.2 of the orchestration doc). | Properties Panel | — |
| 3 | User opens the canvas. Visual output is byte-identical to the pre-migration appearance. | Canvas | — |

### Audit table

| Step | Maps to plan stage | Status | Gap? |
|---|---|---|---|
| 1 | **25b Wave 1** (existing migration) | ✅ | — |
| 2 | **P1** (deletion of V/G Settings card) | △ pending | — |
| 3 | (existing) | ✅ | requires migration's appearance-equivalence test (existing in 25b) |

---

## 13. Consolidated audit — gaps and required plan updates

The 12 journeys above surface the following gaps that the **existing implementation plan (S1–S8 + P1–P3) does not yet cover**. Each is given an item ID and a proposed addition.

### A. Plan additions (new work or schema fields)

| ID | Gap | Source journey | Proposed addition | Effort |
|---|---|---|---|---|
| **A1** | Per-Element Editor's Line Weight slider has no defined upper bound; user's example asks for 5 mm. | J1 | Set slider range to **0.05–5.0 mm**, with a numeric input that accepts up to 10.0 mm. Add `validateLineWeight()` helper. | 15 min |
| **A2** | No mass-edit "..." menu in Per-Element Editor for "Apply to all states / Apply to all element types / Copy as patch / Paste patch". | J1, J2 | Add the four mass-edit operations as a `<menu>` in the editor toolbar. New commands: `BulkApplyAppearanceCommand({ scope, appearance })`, `CopyAppearancePatchToClipboard`, `PasteAppearancePatchFromClipboard`. | 4 h |
| **A3** | No multi-select in the rule matrix (shift-click multiple cells then edit as batch). | J2 | Add cell selection state (`Set<{elementType, state}>`). Per-Element Editor enters batch mode with `(varies)` placeholders; on Apply, dispatches one `UpdateIntentRuleCommand` per cell. | 1 day |
| **A4** | **Element-type visibility toggle in the rule matrix** (the canonical "exclude furniture from RCP" affordance). | J3 | (i) Add `ElementGraphicsRules.visible?: boolean` (already de facto supported via per-state `appearance.visible` but the type-level toggle needs a single field). (ii) Add `[◯/⊘]` icon column to `ViewTypeRuleMatrix`. (iii) New command: `SetIntentProfileElementVisibilityCommand({ profileViewType, elementType, visible })`. (iv) Resolver consults this flag before per-state rules. | 1 day |
| **A5** | No canvas context-menu entry for "Override appearance in this view" → opens Per-Element Editor in override mode. | J4 | Add the menu entry. Per-Element Editor needs an `editingMode: 'intent' \| 'override'` prop. New command surface for graphic overrides at element-instance granularity (already exists as `graphicOverrides[].targetId`); just needs the UI hook. | 4 h |
| **A6** | `BindViewIntentCommand` must accept a `keepOverrides: boolean` option (J6 step 3). | J6 | Extend command signature. When `keepOverrides=false`, clear `localOverrides.graphicOverrides` on bind. | 1 h |
| **A7** | Spine override list (the `Show overrides ▾` disclosure with per-row revert). | J4, J10 | Render `localOverrides.graphicOverrides` and `.visibilityOverrides` and `.outputOverride` etc. as a unified list with per-row `↻ revert` and bulk `Clear all`. | 4 h |
| **A8** | No ability to surface "this view-local Intent is used by 1 view" / "this user Intent is used by 12 views" counts in the spine. | J1, J7 | Add `intentUsageCount(intentId)` computed selector that counts `viewIntentInstances` with that `intentId`. Render in spine. | 2 h |
| **A9** | Spine "Diverged banner" (Pinned to v7, Intent now v8). | J7 | Compare `instance.pinnedVersion` to `intent.version` on render; render banner with `Take vN` and `Stay pinned` actions. New command: `TakeLatestIntentVersionCommand`. | 3 h |
| **A10** | Detach with `keepValuesAsOverrides: true` (J9 step 2) — currently `UnbindViewIntentCommand` is not in the plan. | J9 | New command. Reads every Intent-resolved field, snapshots into `localOverrides`, then sets `intentId = null`. | 4 h |

### B. Schema / contract clarifications

| ID | Clarification | Source journey | Action |
|---|---|---|---|
| **B1** | Section / elevation `EdgeProjectorService` must reliably tag segments as `cut` vs `projection` vs `beyond` per the cut-plane + far-clip model. Today the plan-family path is well-tested; the section/elevation tagging is implicit. | J2 | Add a §2.6.1 sub-section to Contract 25 explicitly defining the segment-state mapping for section and elevation views. Add unit tests in `EdgeProjectorService.test.ts` for a known geometry → expected state tags. | 1 day (test + doc) |
| **B2** | `CreateIntentFromViewCommand` (J5) — which fields snapshot into the new Intent? | J5 | Define snapshot scope: (i) every `localOverrides.graphicOverrides` collapses into the Intent's `viewTypeProfiles[viewType].elementRules`. (ii) every `localOverrides.visibilityOverrides` of `mode='hide'` whose target is an element-type collapses into the visibility flag from A4. (iii) `localOverrides.outputOverride/cropOverride/underlayOverride` collapse into the matching profile defaults. (iv) Per-instance overrides (single wall hide) DO NOT snapshot — they remain per-view local. | 4 h (spec) + included in P3 |
| **B3** | `viewTypeProfiles[viewType].elementRules` precedence vs base `intent.elementRules` was specified at priority 4000 in the orchestration doc but `IntentRuleResolver` change-set is not yet in the plan. | J1, J2, J3 | Add to **S3** the resolver line: `rule = mergeRules(base[elementType], profile.elementRules?.[elementType])` immediately before the existing state-clone. | 1 h |
| **B4** | Source-chain reporting (the tooltip and the Per-Element Editor provenance block). | All journeys | Add `resolveWithSourceChain()` to `IntentRuleResolver` returning `{ value, sources: Array<{ origin, value }> }`. Used by the source pill component. | 1 day |

### C. Plan timing / ordering updates

| ID | Update | Source |
|---|---|---|
| **C1** | Item **A4** (element-type visibility toggle) is the single most important AEC affordance after the spine. Promote it to land **inside Stage S3** (rather than as a separate later item). Without it, J3 cannot complete. | J3 |
| **C2** | Items **A5** (canvas context-menu override) and **A7** (spine override list) should land in **Stage P1** so that even Mode-1 users can do per-view overrides immediately after V/G is removed. | J4, J10 |
| **C3** | Item **A6** (`BindViewIntentCommand.keepOverrides`) must land in **Stage P3** before any Bind UX is shown. | J6 |
| **C4** | Item **B4** (source chain) must land in **Stage P2** because the source pill UI in P2 depends on it. | All |
| **C5** | The contract test in **B1** should land alongside **Stage S3** to validate the section/elevation profile rendering. | J2 |

### D. Non-plan remarks (acknowledged not done in this scope)

| ID | Note |
|---|---|
| **D1** | Real-time multi-user sync of Intent edits + version pin transitions is **Stage S8**. Until S8 lands, J7 step 3 (a teammate's edit advancing the Intent version) only takes effect on the next view re-open, not in real-time. This is acceptable for the v1 of the orchestration model. |
| **D2** | The "Tender Set 2026" name in J6 implies **Intent presets / curated catalog** UX which is a future addition (post-S8). For now, all user Intents are flat in the picker. |
| **D3** | Print-time scale-aware line-weight rendering (a "5 mm at 1:100" produces a different screen-px output than at 1:50) is a separate **printing/output** concern handled in `PenStyle` rendering. Not a journey concern; documented in `docs/02-decisions/contracts/19-PRINTING-OUTPUT-CONTRACT.md`. |

---

## 14. Updated implementation-plan summary

After applying the audit additions, the schedule from the orchestration doc §6 expands by ~3.5 engineering days and shifts as follows:

| Order | Stage | Goal | Net effort |
|---|---|---|---|
| 1 | **S1** | SVP header parity + tool registry parity | 1.5 h |
| 2 | **S2** | `fill.colour` picker in Element Rules | 30 min |
| 3 | **P1** + **A5** + **A7** | Properties panel cleanup; **plus** canvas-context "Override in this view" + spine override list (audit C2) | ~5 h |
| 4 | **S4** | Intent picker in standardised view header | 2 h |
| 5 | **S3** + **A2** + **A3** + **A4** + **B3** + **C5** | Per-view-type accordion + rule matrix + element-type visibility toggle + multi-select + mass-edit "..." menu + section/elevation profile + contract test | ~3 days (was 2) |
| 6 | **P2** + **B4** | Resolver helpers + source pill + per-row reset; **plus** source-chain provenance API (audit C4) | ~1.25 days (was 1) |
| 7 | **P3** + **A6** + **A8** + **A9** + **A10** | Four-mode binding affordance + inline Action Sheets + Bind keepOverrides + usage counts + diverged banner + Detach command | ~1.5 days (was 1) |
| 8 | **S5** | `ThreeDimensionalAppearance` schema + 3D renderer integration | 2.5 days |
| 9 | **S6** | Detail-view inheritance + RCP state inversion | 1.5 days |
| 10 | **S7** | IFC projection refactor into Intent system | 1 day |
| 11 | **S8** | Persistence + collaboration sync hardening | 2 days |

**Net total:** ~13.5 days (was ~12). The added 1.5 days deliver the AEC-critical element-type visibility toggle, multi-select editing, and the per-view override loop that the journeys revealed are absent from the current plan.

The **`docs/03-execution/status/intent-analysis/INTENT-AS-VIEW-PROPERTIES-ORCHESTRATION-LAYER.md` document is updated** in §6.5 (new sub-section) to incorporate audit items A1–A10, B1–B4, C1–C5. See the next document update below.

---

## 15. Conclusion

The 12 journeys validate that the orchestration model is sound for the four binding modes, version pinning, per-view overrides, and migration. They surface 10 implementation-level gaps (audit items A1–A10) and 4 schema-level clarifications (B1–B4) that materially affect the implementation plan, plus 5 sequencing updates (C1–C5). All gaps have concrete proposed work-items.

**The most consequential single addition** surfaced by the audit is the **element-type visibility toggle in the rule matrix (audit A4)** — without it, J3 (excluding furniture from RCP) is impossible to complete in fewer than four clicks per element type per state. Promoting it inside Stage S3 (per audit C1) costs ~1 day and unlocks the most-asked AEC workflow.

The **second most consequential** is the **canvas context-menu "Override in this view" + spine override list (audit A5 + A7)**, which give Mode-1 users immediate per-view tweaking without leaving their canvas. Folding these into Stage P1 (audit C2) makes the V/G-retirement landing strictly better than the V/G era at the moment it ships, rather than waiting for P3.
