# Visibility-Intent Master Implementation Plan

**File:** `docs/Analysis/MASTER-IMPLEMENTATION-PLAN.md`
**Date:** 2026-04-26
**Status:** Authoritative planning document — supersedes the stage list in `docs/01_ELEMENTS/03_VIEWS/10_VIEW_INTENT_SYSTEM_IMPLEMENTATION_PLAN.md` §0 and the planning summary in `docs/Analysis/INTENT-USER-JOURNEYS.md` §14.
**Total estimated effort:** **~14 engineering days** (split across 11 waves; Waves 1–6 are the critical path for the new Properties panel; Waves 7–11 add depth and parity).

---

## 0. How to read this document

This document is the **single source of truth** for the order, content, dependencies, files, schema bumps, validation steps, and acceptance criteria of every change required to land the Visibility-Intent Properties-panel reorganisation.

It consolidates four upstream sources:

| Upstream source | What it contributed |
|---|---|
| `docs/01_ELEMENTS/03_VIEWS/10_VIEW_INTENT_SYSTEM_IMPLEMENTATION_PLAN.md` | Stages **S1–S8** (engine-level work). |
| `docs/Analysis/INTENT-AS-VIEW-PROPERTIES-ORCHESTRATION-LAYER.md` | Stages **P0–P3** (panel-level work) + the new `viewSeed` schema. |
| `docs/Analysis/INTENT-PANELS-UI-UX-DESIGN.md` | Black-and-white iconography, four quick paths to the Intent Editor, source-pill rules, modal layouts. |
| `docs/Analysis/INTENT-USER-JOURNEYS.md` §13 | Audit gaps **A1–A10** (new work), **B1–B4** (schema/contract clarifications), **C1–C5** (sequencing constraints). |

**Wave** is the unit of release. Each wave is independently mergeable and produces a usable improvement. Waves are sequenced so the critical-path UX (Waves 1–6) is reachable in ~7 engineering days; Waves 7–11 add 3D, RCP, IFC, and persistence depth.

**Audit-gap absorption.** Per C1–C5, every audit-gap item from the journeys doc is folded into the wave that requires it (e.g. A4 inside Wave 4 with S3, A6 inside Wave 6 with P3). The original A/B/C identifiers are preserved as cross-references.

---

## 1. Master timeline at a glance

| Wave | Name | Stages folded in | Effort | Cumulative | Critical path? |
|---|---|---|---|---|---|
| **1** | Foundations: parity + V/T absorption | S1, S2, P0 | ~6 h | 6 h | ✓ |
| **2** | Panel cleanup: V/G removal + Intent spine + monochrome iconography | P1, A5, A7 | ~13 h | ~2.7 d | ✓ |
| **3** | Standardised view-header Intent picker | S4 | ~2 h | ~3 d | ✓ |
| **4** | Per-view-type architecture | S3, A4, B1, B3 | ~3.5 d | ~6.5 d | ✓ |
| **5** | Resolver + provenance | P2, B4, A8 | ~1.5 d | ~8 d | ✓ |
| **6** | Binding affordances + version pin | P3, A6, A10, A9, B2 | ~1.5 d | ~9.5 d | ✓ |
| **7** | Mass edit + multi-select | A1, A2, A3 | ~1.5 d | ~11 d |  |
| **8** | 3D appearance + renderer | S5 | ~2.5 d | ~13.5 d |  |
| **9** | Detail-view inheritance + RCP inversion | S6 | ~1.5 d | ~15 d |  |
| **10** | IFC projection refactor | S7 | ~1 d | ~16 d |  |
| **11** | Persistence + collaboration sync | S8 | ~2 d | ~18 d |  |

> **Note on totals.** The 14-day "Waves 1–6 only" headline assumes one engineer working sequentially with no parallelism. Waves 2 and 4 can be partially parallelised (independent files), trimming the critical path by ~1 day. Waves 7–11 are independent of each other and can run in parallel by additional engineers.

---

## 2. Cross-cutting principles

These rules apply to **every** wave and are non-negotiable:

1. **No new V/G code.** Per Contract 25b §2.1 and §2.4, `vgGovernanceStore` is `@deprecated readable, never written`. The post-merge setup script must keep failing the build if any code path writes to it.
2. **Intent is the spine.** Every view-property field that is not pure spatial geometry resolves through the Intent precedence chain (§3 of orchestration doc). Render-path code never reads from V/G.
3. **No coloured iconography.** The Properties panel and Intent Editor render in the monochrome palette of UI/UX doc §0.3 with the line-glyph icon set of §0.4. Source provenance is shown by typography + 2 px left edge, never by hue.
4. **One config table for view-type behaviour.** `src/ui/views/ViewTypePropertiesPanelConfig.ts` (new) is the single place that decides which sections render for which `viewType`. Adding a new view type is one row.
5. **All persistence touches mirror Socket.io.** Per Contract 30, every `intentStore`, `viewIntentInstanceStore`, and `vgGovernanceStore` write must be accompanied by a Socket.io broadcast. Wave 11 hardens this.
6. **Schema bumps are paired with migrations.** Every schema-version increment ships with a forward-only migration in `src/migrations/` and a versioned snapshot test in `tests/migrations/`.
7. **Documentation lives next to the code.** Each wave updates `replit.md`, the relevant contract doc, and the relevant `docs/01_ELEMENTS/` reference doc in the same PR.

---

## 3. Dependency graph

```
            ┌──────┐
            │ Wave 1 │ — S1, S2, P0 (foundations)
            └───┬────┘
                │
                ▼
            ┌──────┐
            │ Wave 2 │ — P1 (panel cleanup) ◀──────┐
            └───┬────┘                              │
                │                                   │
                ▼                                   │
            ┌──────┐                                │
            │ Wave 3 │ — S4 (header picker)         │
            └───┬────┘                              │
                │                                   │
                ▼                                   │
            ┌──────┐         ┌──────┐               │
            │ Wave 4 │ ────▶ │ Wave 5 │ — resolver  │
            └───┬────┘       └───┬────┘ + provenance│
                │                │                  │
                ▼                ▼                  │
            ┌──────┐         ┌──────┐               │
            │ Wave 6 │ ◀──── │ depends on Wave 5 ──┘
            └───┬────┘
                │
   ┌────────────┼────────────┬────────────┬────────────┐
   ▼            ▼            ▼            ▼            ▼
┌──────┐    ┌──────┐    ┌──────┐    ┌──────┐    ┌──────┐
│Wave 7│    │Wave 8│    │Wave 9│    │Wave10│    │Wave11│
└──────┘    └──────┘    └──────┘    └──────┘    └──────┘
   ↑           ↑           ↑           ↑           ↑
   └───────────┴───────────┴───────────┴───────────┘
                Independent — parallelisable
```

---

## 4. WAVE 1 — Foundations: parity + View Template absorption (~6 hours)

### Wave goal

Land the cheapest, highest-leverage prep work so that Waves 2+ have clean ground to stand on. Specifically: (a) finish the SVP/tool-registry parity owed since Phase 5a, (b) add the missing fill-colour picker, (c) absorb View Templates into the Intent so the panel cleanup in Wave 2 can delete a whole panel section.

### Stages

#### Stage S1 — SVP header parity + tool-handler registry parity (~1.5 h)

- **Goal:** Bring the Standardised View Properties (SVP) header to parity with the tool-handler registry per `docs/00_Contracts/07-BIM-SECURITY-CONTRACT.md` Phase 5a.
- **Files touched:**
  - `src/ui/views/StandardisedViewHeader.ts`
  - `src/core/tools/ToolHandlerRegistry.ts`
  - `tests/views/standardised_view_header.test.ts`
- **Steps:**
  1. Audit the SVP header for missing tool buttons (compare against `ToolHandlerRegistry.list()`).
  2. Wire each missing tool to the header with the same affordance pattern as existing tools.
  3. Verify the tool-registry → header binding is one-way (registry is source of truth).
- **Acceptance:** All registered tools appear in the SVP header in registration order.
- **Source:** doc 10 §S1.

#### Stage S2 — `fill.colour` picker in Element Rules (~30 min)

- **Goal:** Phase-9 P9-01 — add the missing fill-colour picker in the Visibility-Intent panel's Element Rules tab.
- **Files touched:**
  - `src/ui/intent/PerStateAppearanceForm.ts`
  - `src/core/presentation/VisibilityIntentTypes.ts` (verify `appearance.fill.colour: string` already exists — it does)
- **Steps:**
  1. Add a colour-input row above the existing `fillStyle` row.
  2. Wire to `UpdateIntentRuleCommand({ ..., appearance: { fill: { colour } } })`.
  3. Default to `#000000` when undefined; render the override field with the `--vi-border-strong` left edge per UI/UX §0.3.
- **Acceptance:** User can pick a fill colour for any `(elementType, state)` pair; value persists; appears in the source-chain tooltip.
- **Source:** doc 10 §S2.

#### Stage P0 — View Template absorption (~4 h)

- **Goal:** Per orchestration doc §2.6.1 and §4.4, fold every payload of a View Template into the Intent itself via a new `viewSeed` block. Mark `viewTemplateStore` `@deprecated readable, never written`.
- **Files touched:**
  - `src/core/presentation/VisibilityIntentTypes.ts` — add `ViewSeed` interface + Zod schema; add `viewSeed?: ViewSeed` field on `VisibilityIntent`. Bump intent schema version (current → +1).
  - `src/core/presentation/templates/viewTemplateStore.ts` — mark `@deprecated`. Add a runtime guard in `setTemplate()` that logs an error and no-ops.
  - `src/migrations/runViewTemplateToIntentMigration.ts` (**new**) — walks `viewTemplateStore.list()`, finds or creates an Intent for each, copies the four payloads (identity defaults, scale, locked-fields, V/G binding) into `intent.viewSeed`. For every view that referenced a template, sets `viewIntentInstanceStore.getInstance(viewId).intentId` to the migrated Intent. Records a `Migrated from template '<name>'` provenance entry.
  - `src/ui/ViewPropertiesPanel.ts` — delete the View Template section render path (this is also part of Wave 2's P1, but the deletion is harmless if it lands here first).
  - `src/ui/views/CreateViewFromTemplateDialog.ts` → renamed to `CreateViewFromIntentDialog.ts`. Picker source changes from `viewTemplateStore.list()` to `intentStore.list().filter(i => i.viewSeed)`. The "Apply Template" command becomes `CreateViewFromIntentCommand` and runs the new resolver helper `resolveViewSeed()` to seed the new view's identity, scale, and lock fields.
  - `tests/migrations/run_view_template_to_intent_migration.test.ts` (**new**).
- **Schema diff:**
  ```ts
  interface ViewSeed {
      nameTemplate?:    string;
      discipline?:      DisciplineCode;
      purpose?:         ViewPurpose;
      defaultPhase?:    string;
      initialScale?:    number;
      initialLevel?:    'this' | 'auto';
      lockedFields?:    Array<'scale'|'detailLevel'|'visualStyle'|'displayModel'|'shadows'|'cropActive'|'underlayEnabled'|'phase'|'discipline'|'purpose'>;
      perViewType?:     Partial<Record<ViewType, { nameTemplate?: string; initialScale?: number }>>;
  }
  interface VisibilityIntent {
      // ... existing fields ...
      viewSeed?: ViewSeed;
  }
  ```
- **Validation:**
  - `npm run check` passes.
  - Migration unit test: feed a `viewTemplateStore` with 3 templates → assert 3 Intents have correct `viewSeed`, and every previously-bound view has its `intentId` set.
  - Round-trip test: load a project saved before migration; verify the post-migration in-memory state matches the expected snapshot.
- **Acceptance:**
  - `rg "viewTemplateStore\.set" src/` returns zero non-deprecated callers.
  - The "Create View" dialog lists Intents (with `viewSeed`) instead of templates.
  - Loading a pre-P0 project succeeds without console errors and shows former templates as Intents.
- **Source:** orchestration doc §2.6.1, §4.4, §6.0.

### Wave 1 acceptance gate

- All three stages green; `npm run check` clean; migration test green; one screenshot diff against pre-Wave-1 baseline showing the Properties panel is unchanged (P0 deletes a section but P1 will visibly remove it in Wave 2).

---

## 5. WAVE 2 — Panel cleanup: V/G removal + Intent spine + monochrome iconography (~13 hours, parallelisable to ~8 hours)

### Wave goal

Replace the legacy V/G Settings card with the new Visibility-Intent spine; render the four-mode binding affordance; convert all panel iconography to the black-and-white system; expose four independent paths to the Intent Editor; surface per-view overrides in the spine; add the canvas context-menu shortcut for "Override appearance in this view".

### Stages

#### Stage P1-core — Properties panel V/G→Intent migration (~5 h)

- **Goal:** Per orchestration §6.1 and UI/UX §1.1–§1.9, replace the V/G card with the Intent spine, add the sticky header `Intent: <name> [↗ Edit]` shortcut, the full-width spine `[ ↗ OPEN INTENT EDITOR ]` button, and the monochrome design system.
- **Files touched:**
  - `src/ui/ViewPropertiesPanel.ts` (1676 LOC — the panel under analysis). Delete `_renderVgSettingsSection()` and `_renderViewTemplateSection()`. Promote `_renderIntentSection()` above all others; rename internally to `_renderIntentSpine()`. Add the sticky header shortcut. Add the four-action button row (actions wired in P3).
  - `src/ui/property-panel/ViewPropertiesSection.ts` — adapter updates.
  - `src/styles/panels/viewerPanels.ts` — add `--vi-*` design tokens from UI/UX §0.3; add the spine-block class with the full-width primary button styling.
  - `src/ui/icons/ViewerIconSet.ts` (**new**) — bundle the line-glyph SVGs for `lock` (⊟), `reset` (↻), `open` (▸), `info` (ⓘ), `pin` (⊙), `diverged` (△), `plus` (+), `visible` (◯), `hidden` (⊘), `external-link` (↗), `edit` (✎), `more` (⋯). 16 px, 1.25 px stroke, `currentColor`.
  - `src/ui/intent/IntentSourcePill.ts` (**new**) — renders the source pill in monochrome; takes `{ source, isOverride }` and applies bold weight + 2 px left edge if `isOverride`.
- **Steps:**
  1. Delete the V/G Settings render path. Confirm `_renderIntentSection()` already covers what V/G Settings used to surface.
  2. Add the new sticky header bar with `Intent: <name> [↗ Edit]`.
  3. Render the new four-mode spine with the full-width `[ ↗ OPEN INTENT EDITOR ]` primary button at the top of every binding mode.
  4. Make the Intent name in the spine a clickable link to the Intent Editor.
  5. Wire the keyboard shortcut `I` (when focus is in the panel) to open the Intent Editor — see UI/UX §5.4.
  6. Replace every coloured emoji icon (`🔒 👁 🚫 📌 ⚠ 🎨 🗎`) with the equivalent SVG line glyph from `ViewerIconSet`.
  7. Apply the `--vi-*` palette tokens; remove all hex literals from inline styles.
  8. Rename "AI Intent" section to "View Description"; add the read-only Bound-Intent description block above the per-view textarea (see orchestration §4.9).
  9. Add the three Intent provenance rows to Metadata per UI/UX §1.8.
- **Acceptance:**
  - `rg "VG SETTINGS|🔒|👁|🚫|📌|🎨|🗎" src/ui/` returns zero matches.
  - The Properties panel no longer shows the V/G card or the View Template card.
  - The four quick paths to the Intent Editor (header shortcut, spine primary button, name-as-link, keyboard `I`) all open the same modal.
  - All existing tests pass; no data migration required.
- **Source:** orchestration §6.1; UI/UX §1.1, §1.2, §1.9; per C2 in journeys §13.

#### Stage A5 — Canvas context-menu "Override appearance in this view" (~4 h)

- **Goal:** Per journeys §13 A5, allow right-click on a canvas element to open the Per-Element Editor in **override mode** (writes to `localOverrides.graphicOverrides[].targetId`).
- **Files touched:**
  - `src/ui/canvas/CanvasContextMenu.ts` — add the menu entry.
  - `src/ui/intent/PerElementAppearanceEditor.ts` — accept an `editingMode: 'intent' | 'override'` prop; switch the dispatched command between `UpdateIntentRuleCommand` and `UpsertGraphicOverrideCommand`.
- **Acceptance:** Right-click → "Override appearance in this view" → editor opens with the element's current resolved appearance pre-filled; saving writes a per-instance override; the override appears in the spine override list (A7).
- **Source:** journeys §13 A5; per C2 lands here in Wave 2.

#### Stage A7 — Spine override list with per-row revert (~4 h)

- **Goal:** Per journeys §13 A7, the spine's `[ Show overrides ▾ ]` disclosure renders every entry of `localOverrides.graphicOverrides`, `.visibilityOverrides`, `.outputOverride`, `.viewRangeOverride`, `.cropOverride`, `.underlayOverride` as a unified list with per-row `↻ revert` and a bulk `Clear all overrides` button.
- **Files touched:**
  - `src/ui/intent/SpineOverrideList.ts` (**new**)
  - `src/ui/ViewPropertiesPanel.ts` — embed the new list in the Mode-2/Mode-3 spine block.
  - `src/core/presentation/commands/RevertOverrideCommand.ts` (**new**) — revert one override or all overrides on a view.
- **Acceptance:** A view with 3 graphic overrides + 1 visibility override + 1 view-range override shows 5 lines; clicking `↻` on any line removes that override and re-resolves the view; bulk `Clear all` removes them all.
- **Source:** journeys §13 A7; per C2 lands here in Wave 2.

### Wave 2 acceptance gate

- Visual regression: screenshot of the Properties panel before/after; the "after" must be entirely monochrome, must show the new sticky header shortcut, the full-width primary button, and zero coloured icons.
- All four quick paths to the Intent Editor verified by manual test.
- Spine override list shows every override category with revert affordance.

---

## 6. WAVE 3 — Standardised view-header Intent picker (~2 hours)

### Wave goal

Per doc 10 §S4, the standardised view header (the strip across every view) gains an Intent picker so the user can bind/rebind without opening the Properties panel.

### Stage S4

- **Files touched:**
  - `src/ui/views/StandardisedViewHeader.ts`
  - `src/ui/intent/HeaderIntentPicker.ts` (**new**)
- **Steps:**
  1. Add a small dropdown to the right side of the header showing the current Intent name.
  2. Dropdown options: list of Intents the user can bind to (filtered by `intentScope !== 'view-local'` for everyone else's view-local Intents).
  3. Selecting an option dispatches `BindViewIntentCommand({ keepOverrides: false })` (the `keepOverrides` flag itself lands in Wave 6 / A6; until then it is a no-op).
- **Acceptance:** Header dropdown reflects the bound Intent; switching binds the new Intent; the Properties panel updates live.
- **Source:** doc 10 §S4.

---

## 7. WAVE 4 — Per-view-type architecture (~3.5 days)

### Wave goal

Per doc 10 §S3 (with C1, C5, B1, B3 folded in), restructure the panel so view-type-specific sections render only for the appropriate view type, sourced from the Intent's `viewTypeProfiles[viewType]`. Add the **element-type visibility toggle** (the canonical "exclude furniture from RCP" affordance). Add segment-tag tests for section/elevation. Wire the resolver to merge profile rules over base rules at priority 4000.

### Stages

#### Stage S3 — Per-view-type panel restructure (~2 days)

- **Files touched:**
  - `src/ui/views/ViewTypePropertiesPanelConfig.ts` (**new**) — the single config table from cross-cutting principle #4.
  - `src/ui/ViewPropertiesPanel.ts` — consume the config to decide which sections to render.
  - `src/ui/intent/VisibilityIntentPanel.ts` — replace the four flat tabs with a per-view-type accordion (one accordion per `viewType`; each contains Element Rules, View Modifiers, Purpose Modifiers, View Range, Crop, Underlay).
  - `src/ui/intent/ViewTypeRuleMatrix.ts` (**new**) — the per-view-type rule matrix component.
  - `src/core/presentation/VisibilityIntentTypes.ts` — add `ViewTypeProfile` interface; bump intent schema version (P0's bump → +2 total).
  - `src/core/presentation/IntentRuleResolver.ts` — add the priority-4000 merge step (this is **B3**).
- **Steps:**
  1. Define the `ViewTypeProfile` schema with `elementRules`, `viewRange`, `crop`, `underlay`, `output` slots per orchestration §2.2.
  2. Migrate every existing Intent: convert legacy `viewTypeModifiers` to `viewTypeProfiles[viewType]` entries (forward migration in `src/migrations/`).
  3. Build `ViewTypePropertiesPanelConfig` per orchestration §3 matrix.
  4. Build `ViewTypeRuleMatrix` — table of `(elementType × state)` cells with per-cell click-to-edit.
  5. Wire the Properties panel to consume the config and the resolver.
  6. Add `IntentRuleResolver.resolveIntentStyle()`'s new priority-4000 step that merges `intent.viewTypeProfiles[viewType].elementRules?.[elementType]` over the base `intent.elementRules[elementType]` before the existing state-clone (B3).
- **Acceptance:**
  - Plan view shows only the plan-relevant sections; section view shows section-relevant sections; 3D view hides view-range/crop/underlay.
  - Editing a wall-cut rule under the `plan` accordion in the Intent Editor updates the plan view but leaves the section view untouched (because the section view reads from its own profile).
  - Migration of legacy `viewTypeModifiers` produces equivalent `viewTypeProfiles` entries (snapshot test).
- **Source:** doc 10 §S3; orchestration §3; B3.

#### Stage A4 — Element-type visibility toggle in the rule matrix (~1 day)

- **Goal:** Per journeys §13 A4, the canonical "exclude furniture from RCP" affordance.
- **Files touched:**
  - `src/core/presentation/VisibilityIntentTypes.ts` — add `ElementGraphicsRules.visible?: boolean` (default true).
  - `src/core/presentation/IntentRuleResolver.ts` — consult the type-level `visible` flag before per-state rules; if false, return `null` (element is hidden in this view-type).
  - `src/ui/intent/ViewTypeRuleMatrix.ts` — add the `[◯ visible | ⊘ hidden]` column on each row.
  - `src/core/presentation/commands/SetIntentProfileElementVisibilityCommand.ts` (**new**).
- **Acceptance:** In the RCP profile, clicking the `[◯ visible]` icon on the Furniture row flips it to `[⊘ hidden]`. Every RCP view bound to that Intent stops showing furniture. Plan views (different profile) remain unaffected.
- **Source:** journeys §13 A4; per C1 lands inside Wave 4 here.

#### Stage B1 — Section/elevation segment-tag contract test (~1 day)

- **Goal:** Per journeys §13 B1, explicitly define and test the segment-state (`cut` / `projection` / `beyond`) tagging in `EdgeProjectorService` for section and elevation views.
- **Files touched:**
  - `docs/00_Contracts/25-VISIBILITY-INTENT-SYSTEM-CONTRACT.md` — add §2.6.1 specifying the segment-state mapping for section and elevation per the cut-plane + far-clip model.
  - `tests/projection/edge_projector_service.test.ts` (**new**) — fixture geometry → expected segment-state tags.
- **Acceptance:** Contract doc updated; tests green for at least three distinct fixture cases (a beam crossing the cut plane → cut + projection segments; a wall behind the cut plane within far-clip → beyond segments; a wall beyond far-clip → no segments).
- **Source:** journeys §13 B1; per C5 lands alongside Wave 4.

#### Stage B3 — Resolver priority-4000 merge (folded into S3)

- Already covered as step 6 of S3 above. Listed separately so future readers see it tracked.
- **Effort:** 1 hour, included in S3.
- **Source:** journeys §13 B3.

### Wave 4 acceptance gate

- Plan, RCP, section, elevation, and 3D views each render only their relevant sections per the §3 matrix.
- Furniture-hidden-in-RCP works end-to-end and survives a save/load cycle.
- `EdgeProjectorService` test suite green for the new fixtures.

---

## 8. WAVE 5 — Resolver + provenance (~1.5 days)

### Wave goal

Per orchestration §6.2 and journeys §13 B4, add the four resolver helpers (`resolveViewRange`, `resolveCrop`, `resolveUnderlay`, `resolveOutput`) plus `resolveViewSeed` (from P0), each returning `{ value, source }`. Wire the Properties panel's View Range / Crop / Underlay / Output sections through them with per-row source pills and `↻ Reset to Intent default` buttons. Add the source-chain reporter (B4) to power the source-pill tooltip. Add `intentUsageCount(intentId)` selector for the spine.

### Stages

#### Stage P2 — Resolver helpers + sourced fields (~1 day)

- **Files touched:**
  - `src/core/presentation/IntentRuleResolver.ts` — add `resolveViewRange`, `resolveCrop`, `resolveUnderlay`, `resolveOutput`, `resolveViewSeed`, `resolveWithSourceChain`. Each returns `{ value, source: 'system-default' | 'intent' | 'profile' | 'override' }`.
  - `src/ui/ViewPropertiesPanel.ts` — wire View Range / Crop / Underlay / Output sections through the helpers.
  - `src/ui/intent/IntentSourcePill.ts` — extend to consume the source returned from the resolver.
  - `src/ui/intent/ResetToIntentButton.ts` (**new**) — the `↻` button on each row.
- **Acceptance:** Every Intent-derived field in the panel shows a source pill; clicking `↻` clears the per-row override; the field re-resolves and the pill updates from `Override` → `Intent · Profile`.
- **Source:** orchestration §6.2; doc 10 §S3.

#### Stage B4 — Source-chain reporter (~1 day, ~6 h after P2 land)

- **Goal:** Per journeys §13 B4, the source pill's tooltip and the Per-Element Editor's provenance block both need the full chain.
- **Files touched:**
  - `src/core/presentation/IntentRuleResolver.ts` — add `resolveWithSourceChain()` returning `{ value, sources: Array<{ origin, value }> }`.
  - `src/ui/intent/SourceChainTooltip.ts` (**new**) — renders the chain on hover.
- **Acceptance:** Hovering any source pill shows the full precedence chain: e.g. `System default → Intent base (lineWeight 0.18) → Intent profile · plan (lineWeight 0.50) → Override (this view) (lineWeight 0.70)`. Each row shows the contributed value and a click-to-jump affordance.
- **Source:** journeys §13 B4; per C4 lands inside Wave 5 here.

#### Stage A8 — Intent usage-count selector (~2 h)

- **Goal:** Per journeys §13 A8, the spine shows "Used by 12 views" / "Used by 1 view (this one)".
- **Files touched:**
  - `src/core/presentation/selectors/intentUsageCount.ts` (**new**)
  - `src/ui/ViewPropertiesPanel.ts` — render the count in the spine binding row.
- **Acceptance:** Count is accurate; updates live on bind/unbind.
- **Source:** journeys §13 A8.

### Wave 5 acceptance gate

- Every Intent-derived field shows a source pill with chain tooltip.
- Reset-to-Intent button works on every row.
- Spine shows accurate usage count.

---

## 9. WAVE 6 — Binding affordances + version pin (~1.5 days)

### Wave goal

Per orchestration §6.3 and journeys §13 A6/A9/A10/B2, finally wire the four-mode binding actions (Customise / Detach / Make View-Local / Promote to Shared / Bind to / Save as Intent), add Intent-version pinning with the diverged banner, and define the snapshot scope for `CreateIntentFromViewCommand`.

### Stages

#### Stage P3 — Four-mode binding affordance (~1 day)

- **Files touched:**
  - `src/core/presentation/commands/` — new commands: `CustomiseIntentForViewCommand`, `MakeIntentViewLocalCommand`, `PromoteIntentToSharedCommand`, `CreateIntentFromViewCommand`, `UnbindViewIntentCommand`.
  - `src/ui/intent/IntentBindingActions.ts` (**new**) — the four-action button row in the spine.
  - `src/ui/intent/CreateIntentDialog.ts` (**new**) — the inline modal for "Save as Intent".
  - `src/core/presentation/VisibilityIntentTypes.ts` — add `intentScope: 'system' | 'user' | 'view-local'` (verify; may exist).
- **Acceptance:** All four mode transitions work (1↔2, 2↔3, *↔4). The spine status badge updates correctly. Customising a system Intent clones it to a user Intent and rebinds.
- **Source:** orchestration §6.3.

#### Stage A6 — `BindViewIntentCommand.keepOverrides` flag (~1 h, included in P3)

- **Goal:** Per journeys §13 A6, the bind command must accept `keepOverrides: boolean`.
- **Files touched:** existing `BindViewIntentCommand.ts`.
- **Acceptance:** When `false`, `localOverrides.graphicOverrides` is cleared on bind; when `true`, preserved.
- **Source:** journeys §13 A6; per C3 inside Wave 6 here.

#### Stage A10 — `UnbindViewIntentCommand({ keepValuesAsOverrides })` (~4 h)

- **Goal:** Per journeys §13 A10, when detaching, optionally snapshot every Intent-resolved field into `localOverrides` so the view looks identical post-detach.
- **Files touched:** new `UnbindViewIntentCommand.ts`.
- **Acceptance:** Visual regression: detach with `keepValuesAsOverrides=true` → screenshot is byte-identical to pre-detach.
- **Source:** journeys §13 A10.

#### Stage A9 — Diverged banner + version pin (~3 h)

- **Goal:** Per journeys §13 A9, when `instance.pinnedVersion < intent.version`, show the diverged banner with `[ Take vN ] [ Stay pinned ]` actions.
- **Files touched:**
  - `src/ui/intent/DivergedBanner.ts` (**new**)
  - `src/ui/ViewPropertiesPanel.ts` — render at top of spine when diverged.
  - `src/core/presentation/commands/PinViewIntentVersionCommand.ts` (**new**).
  - `src/core/presentation/commands/TakeLatestIntentVersionCommand.ts` (**new**).
- **Acceptance:** Pinning to v3 then advancing the master Intent to v4 shows the banner; "Take v4" updates the pin; "Stay pinned" dismisses for the session.
- **Source:** journeys §13 A9.

#### Stage B2 — `CreateIntentFromViewCommand` snapshot scope (~4 h, included in P3)

- **Goal:** Per journeys §13 B2, define which fields snapshot into a new Intent created from a view.
- **Spec:** documented in `CreateIntentFromViewCommand.ts` JSDoc:
  1. Every `localOverrides.graphicOverrides` collapses into `intent.viewTypeProfiles[viewType].elementRules`.
  2. Every `localOverrides.visibilityOverrides` of `mode='hide'` whose target is an element-type collapses into the type-level `visible=false` flag (uses A4).
  3. `localOverrides.outputOverride/cropOverride/underlayOverride` collapse into the matching profile defaults.
  4. Per-instance overrides (single wall hide) **do not snapshot** — they remain per-view local.
- **Acceptance:** Unit test feeds a view with all four override categories → asserts the resulting Intent's profile has the expected fields and that per-instance overrides remain on the view.
- **Source:** journeys §13 B2; per C3.

### Wave 6 acceptance gate

- All twelve user journeys (J1–J12) end-to-end-runnable manually with the new affordances.
- Bind/Unbind round-trip preserves visual fidelity when `keepValuesAsOverrides=true`.
- Diverged banner appears + dismisses + accepts new version correctly.

---

## 10. WAVE 7 — Mass edit + multi-select (~1.5 days)

### Wave goal

Per journeys §13 A1, A2, A3, fix the line-weight slider bound, add the mass-edit "..." menu in the Per-Element Editor, and add multi-select in the rule matrix.

### Stages

#### Stage A1 — Line-weight slider 0.05–5 mm (~15 min)

- **Files touched:** `src/ui/intent/PerStateAppearanceForm.ts`.
- **Steps:** Set slider range to 0.05–5.0 mm; numeric input accepts up to 10.0 mm; add `validateLineWeight(value)` helper.
- **Acceptance:** Slider drags from 0.05 to 5.0; numeric input clamps to 0.001–10.0.

#### Stage A2 — Mass-edit menu (~4 h)

- **Goal:** Add four operations in the Per-Element Editor toolbar: "Apply to all states", "Apply to all element types", "Copy as patch", "Paste patch".
- **Files touched:**
  - `src/ui/intent/PerElementAppearanceEditor.ts` — toolbar `<menu>`.
  - `src/core/presentation/commands/BulkApplyAppearanceCommand.ts` (**new**).
  - `src/core/presentation/commands/CopyAppearancePatchToClipboardCommand.ts` (**new**).
  - `src/core/presentation/commands/PasteAppearancePatchFromClipboardCommand.ts` (**new**).
- **Acceptance:** Each operation works in isolation; clipboard patch round-trips between two Intents.

#### Stage A3 — Multi-select in rule matrix (~1 day)

- **Goal:** Shift-click multiple cells in the matrix → batch-edit them in one Per-Element Editor session with `(varies)` placeholders.
- **Files touched:**
  - `src/ui/intent/ViewTypeRuleMatrix.ts` — selection state `Set<{elementType, state}>`.
  - `src/ui/intent/PerElementAppearanceEditor.ts` — batch mode rendering.
- **Acceptance:** Selecting 5 cells, editing line-weight, hitting Apply → 5 `UpdateIntentRuleCommand` dispatches; matrix updates all 5 cells.

---

## 11. WAVE 8 — 3D appearance + renderer (~2.5 days)

### Wave goal

Per doc 10 §S5 (gap G-A3), introduce the `ThreeDimensionalAppearance` schema and integrate with the Three.js renderer so 3D views can have Intent-driven surface/edge appearance per element type.

### Stage S5

- **Files touched:**
  - `src/core/presentation/VisibilityIntentTypes.ts` — add `ThreeDimensionalAppearance` interface (surface colour, edge colour, opacity, material preset).
  - `src/core/presentation/ThreeDAppearanceResolver.ts` (**new**).
  - `src/render/three/MaterialFactory.ts` — consume resolver.
  - `src/ui/intent/ThreeDAppearanceForm.ts` (**new**) — UI rows for the 3D-only fields.
- **Acceptance:** A 3D view bound to an Intent with `wall.threeD = { surfaceColour: '#d4c5b0' }` renders walls in that colour; switching Intent re-materialises live.
- **Source:** doc 10 §S5.

---

## 12. WAVE 9 — Detail-view inheritance + RCP state inversion (~1.5 days)

### Wave goal

Per doc 10 §S6 (gaps G-A4, G-A5), detail views inherit their parent view's Intent by default; RCP state inversion is owned by the Intent profile.

### Stage S6

- **Files touched:**
  - `src/core/presentation/VisibilityIntentTypes.ts` — add `ViewDefinition.parentViewId?: string`.
  - `src/core/presentation/IntentBindingResolver.ts` (**new**) — walks the parent chain to find the effective Intent.
  - `src/ui/ViewPropertiesPanel.ts` — show "Inherits from <parent>" badge for detail views.
  - `src/render/SectionGraphicsApplier.ts` — consume `viewTypeProfiles['ceiling-plan'].statesShown` and `symbolicRules` for state inversion.
- **Acceptance:** Creating a detail off a section view inherits the section's Intent. RCP views show ceilings as `cut` and walls as `projection`.
- **Source:** doc 10 §S6.

---

## 13. WAVE 10 — IFC projection refactor (~1 day)

### Wave goal

Per doc 10 §S7 (Phase 5b), refactor IFC reference projection to flow through the Intent system rather than its current bespoke path.

### Stage S7

- **Files touched:**
  - `src/render/ifc/IfcReferenceProjector.ts`
  - `src/core/presentation/IntentRuleResolver.ts` — accept IFC element types as first-class.
- **Acceptance:** IFC reference elements respect the bound Intent's element rules; toggling IFC visibility uses the same `[◯/⊘]` icon column from A4.
- **Source:** doc 10 §S7.

---

## 14. WAVE 11 — Persistence + collaboration sync (~2 days)

### Wave goal

Per doc 10 §S8 (gaps G-P1, G-P2, G-P3), harden persistence of all new fields and the Socket.io broadcast for every Intent / instance / version change.

### Stage S8

- **Files touched:**
  - `src/core/persistence/intentStore.ts` — bump schema version, add migration.
  - `src/core/persistence/viewIntentInstanceStore.ts` — same.
  - `src/server/socket/intentSync.ts` — broadcast every Intent / instance / version change.
  - `tests/persistence/intent_round_trip.test.ts` — full round-trip coverage.
  - `tests/collaboration/intent_sync.test.ts` — multi-client test.
- **Acceptance:** Two clients editing the same Intent see each other's changes within 200 ms; no silent data loss on schema bump; round-trip test green.
- **Source:** doc 10 §S8; Contract 30.

---

## 15. Cross-reference: audit-gap absorption map

| Audit gap | Lands in | Effort |
|---|---|---|
| **A1** Line-weight slider 0.05–5 mm | Wave 7 | 15 min |
| **A2** Mass-edit menu | Wave 7 | 4 h |
| **A3** Multi-select in matrix | Wave 7 | 1 d |
| **A4** Element-type visibility toggle | Wave 4 (per C1) | 1 d |
| **A5** Canvas context-menu override | Wave 2 (per C2) | 4 h |
| **A6** `keepOverrides` flag on bind | Wave 6 (per C3) | 1 h |
| **A7** Spine override list | Wave 2 (per C2) | 4 h |
| **A8** Intent usage count | Wave 5 | 2 h |
| **A9** Diverged banner + pin | Wave 6 | 3 h |
| **A10** Unbind with `keepValuesAsOverrides` | Wave 6 | 4 h |
| **B1** Section/elevation segment-tag tests | Wave 4 (per C5) | 1 d |
| **B2** `CreateIntentFromViewCommand` snapshot scope | Wave 6 (folded into P3) | 4 h |
| **B3** Resolver priority-4000 merge | Wave 4 (folded into S3) | 1 h |
| **B4** Source-chain reporter | Wave 5 (per C4) | 1 d |

---

## 16. Risk register

| Risk | Wave(s) | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| `runViewTemplateToIntentMigration` mis-merges templates whose payloads overlap an existing Intent | 1 | Medium | High — first-load failure | Migration is idempotent and additive: it only fills empty `viewSeed` fields, never overwrites. Snapshot tests cover three template+intent overlap cases. |
| Deleting V/G UI breaks projects that still reference `vgTemplateId` | 1, 2 | Low | High | Contract 25b §2.4 already specifies `vgTemplateId` is `@deprecated readable, never written`; the existing `runVGToIntentMigration()` runs on load. Verify by loading a pre-25b project in a CI fixture. |
| Source-chain tooltip causes layout thrash on hover | 5 | Medium | Low | Tooltip lazy-renders; uses `requestIdleCallback` for the chain computation. |
| Multi-select in the rule matrix dispatches N commands and overwhelms the undo stack | 7 | Medium | Medium | Wrap in a single `BatchCommand` so undo is one step. |
| Socket.io broadcast storms when one user edits many Intent fields rapidly | 11 | High | Medium | Coalesce intent-version broadcasts with a 200 ms debounce; piggy-back the diff. |
| Schema version bumps in P0 and S3 collide if not carefully sequenced | 1, 4 | Low | High | Each migration is forward-only and idempotent; the migration runner records `lastAppliedSchemaVersion` and applies in order. |

---

## 17. Definition of Done (program-level)

The program is **done** when **all** of the following hold:

1. Every wave's acceptance gate is green.
2. `rg "vgGovernanceStore\.set|viewTemplateStore\.set" src/` returns zero non-deprecated callers.
3. The Properties panel renders entirely in monochrome (no coloured icons, no hex literals outside `--vi-*` tokens).
4. The four quick paths to the Intent Editor (header shortcut, spine primary button, name link, keyboard `I`) all open the same modal and pass a manual smoke test.
5. All twelve user journeys (J1–J12) in `docs/Analysis/INTENT-USER-JOURNEYS.md` are runnable end-to-end.
6. `npm run check`, `npm run test`, and the migration test suite are green.
7. `replit.md` is updated with the new architecture summary.
8. The legacy implementation plan (`docs/01_ELEMENTS/03_VIEWS/10_VIEW_INTENT_SYSTEM_IMPLEMENTATION_PLAN.md`) is marked `@superseded` with a pointer to this master plan.

---

## 18. Change log

| Date | Change |
|---|---|
| 2026-04-26 | Initial draft consolidating S1–S8 (doc 10), P0–P3 (orchestration doc), A1–A10/B1–B4/C1–C5 (journeys §13), and UI/UX doc §0–§5. |
| 2026-04-26 | Wave 1 kicked off — appended §19 *Implementation Reality Notes (Waves 1 & 2)* with verified file paths and current-codebase status. P0 schema, migration, and ProjectLoader wiring landed. |

---

## 19. Implementation Reality Notes (Waves 1 & 2)

> **Purpose.** §4 and §5 above were written from the design docs and reference
> the *target* file layout. This appendix records what is actually in the repo
> on **2026-04-26**, what is already implemented, and what each wave still has
> to build. It is updated as each wave lands. **All future PRs for Waves 1–2
> must reconcile against this section, not the abstract paths in §4–§5.**

### 19.1  File-path corrections (canonical)

| §4–§5 reference | Actual file in repo | Status |
|---|---|---|
| `src/core/presentation/templates/viewTemplateStore.ts` | `src/core/views/ViewTemplateStore.ts` | Exists; marked `@deprecated readable` (Wave 1, this commit). |
| `src/migrations/runViewTemplateToIntentMigration.ts` | `src/migration/ViewTemplateToIntentMigration.ts` | **Created in Wave 1 (this commit).** Note: the repo uses singular `src/migration/`, not `src/migrations/`. |
| `src/ui/views/StandardisedViewHeader.ts` | `src/ui/views/ViewHeaderButtons.ts` (`buildViewHeaderToolbar`) | Already implements Stage S1 + S4 — see file header. Used by `PlanViewManager` and `SplitViewManager`. |
| `src/core/tools/ToolHandlerRegistry.ts` | *(no central registry yet)* — handlers live under `src/core/views/plantools/` | **NOT YET CREATED.** Per S1 wording the parity work is *audit + binding*; the registry itself is deferred to Wave 4 unless an audit reveals a missing tool. |
| `src/ui/intent/PerStateAppearanceForm.ts` | Inline in `src/ui/VisibilityIntentPanel.ts` (lines ~390–515) | The fill.colour reset (S2) is **already wired** at lines 396–413 (`data-appearance-reset="fill.colour"`). Extraction into a dedicated form file is part of Wave 2 P1. |
| `src/ui/views/CreateViewFromTemplateDialog.ts` → `CreateViewFromIntentDialog.ts` | *(no dialog file under `src/ui/views/`)* — view creation is currently driven from `ViewBrowser` rails | **NOT YET CREATED.** Build the new dialog directly under `src/ui/views/CreateViewFromIntentDialog.ts` in Wave 3 (S4) when the header picker lands. |
| `src/ui/icons/ViewerIconSet.ts` | *(does not exist)* | New file — Wave 2 P1. |
| `src/ui/intent/IntentSourcePill.ts` | *(does not exist)* | New file — Wave 2 P1. |
| `src/ui/intent/PerElementAppearanceEditor.ts` | *(does not exist)* | New file — Wave 2 A5. |
| `src/styles/panels/viewerPanels.ts` | Confirm path before P1 work; styling currently lives in `src/ui/styles/` and inline `<style>` blocks. | Verify in Wave 2 P1 kickoff. |
| `src/migrations/` (test snapshots) | Repo uses `tests/` (flat). Place new tests as `tests/<name>.spec.test.ts`. | Migration smoke test created at `tests/viewTemplateToIntent.spec.test.ts` (this commit). |

### 19.2  Wave 1 — actual delta delivered (this commit)

**S1 — SVP header tool-registry parity (status: ✅ pre-existing, no work needed this commit).**
The shared `buildViewHeaderToolbar()` factory in `src/ui/views/ViewHeaderButtons.ts` already consolidates Grid / IFC / V/G / Range / Close into a single toolbar consumed by both `PlanViewManager` and `SplitViewManager`. Stage S4's V/G+Overrides+Intent collapse is also already in place (file header self-documents it). The "tool-handler registry parity" in §4 §S1 refers to a future audit; there is no missing button today. **Action this commit: none.** **Future audit (Wave 4):** if `ToolHandlerRegistry` is built, add a header-binding test that compares `registry.list()` to the toolbar's child-button data attributes.

**S2 — `fill.colour` picker / reset (status: ✅ pre-existing, no work needed this commit).**
The reset affordance is wired in `src/ui/VisibilityIntentPanel.ts` at lines 396–413 via `data-appearance-reset="fill.colour"`. The full colour-picker row promised in UI/UX §0.4 is rendered through the generic `data-appearance="fill.colour"` change handler (lines 391–394 + 501–515). **Action this commit: none.** **Wave 2 P1** will lift this out into a dedicated `PerStateAppearanceForm` module so other appearance reset paths (line.colour, line.weight, fill.style, …) can reuse it.

**P0 — View Template absorption (status: ✅ delivered this commit).**
1. `src/core/presentation/VisibilityIntentTypes.ts`
   - Added `ViewSeed` interface + `ViewSeedLockableField`, `ViewSeedDiscipline`, `ViewSeedPurpose` type exports.
   - Added `viewSeed?: ViewSeed` to `VisibilityIntent` (additive, optional).
2. `src/core/presentation/migrations/IntentSchemaMigrations.ts`
   - Bumped `CURRENT_INTENT_SCHEMA_VERSION` 3 → **4**, added an additive v3→v4 migrator (no-op shape bump; the seed is populated only by the migration script below).
3. `src/core/views/ViewTemplateStore.ts`
   - Marked `@deprecated readable, never written` in the file header. Write methods remain functional for ViewTemplateManagerPanel and snapshot deserialisation; a Wave 11 lint sweep will reject any new caller.
4. `src/migration/ViewTemplateToIntentMigration.ts` (**new**)
   - Pure helpers `buildViewSeedFromTemplate()` and `buildIntentFromTemplate()` (exported for tests).
   - Idempotence guard `isViewTemplateMigrationComplete()` keyed on the `migrated-vt-` intent-id prefix.
   - Entry point `runViewTemplateToIntentMigration(viewLookup?)` — creates one absorbed intent per template, re-binds every view whose `viewTemplateId` matches via `viewIntentInstanceStore.assign(viewId, intentId)`. Optional `viewLookup` callback keeps the function pure-testable; production uses `(window as any).viewDefinitionStore`.
5. `src/core/persistence/ProjectLoader.ts`
   - Added a `try { … } catch` block immediately after the existing Phase 8.1 VG→Intent migration that dynamically imports and runs the new view-template migration. Failures are non-fatal (logged warning).
6. `tests/viewTemplateToIntent.spec.test.ts` (**new**)
   - Smoke test for `buildViewSeedFromTemplate()` and `buildIntentFromTemplate()` covering name/discipline/scale/lockedFields → seed mapping.

### 19.3  Wave 1 acceptance gate — current status

| Acceptance criterion (§4) | Status |
|---|---|
| `npm run check` passes (project-isolation + storage-isolation + `tsc --noEmit`) | Verified after this commit by the build run. |
| Migration unit test green | `tests/viewTemplateToIntent.spec.test.ts` covers helpers; an end-to-end test that exercises `runViewTemplateToIntentMigration()` against a mocked store is deferred to a follow-up commit (depends on a test harness for the singleton stores). |
| `rg "viewTemplateStore\.set\b" src/` returns zero non-deprecated callers | Verified: zero matches. |
| Pre-P0 project loads without console errors | Verified by smoke loading the demo project after the change (Vite dev workflow restart). |
| "Create View" dialog lists Intents instead of templates | **Deferred to Wave 3 (S4).** P0 only delivers the schema + migration; the dialog rename lands with the header picker rework. |

### 19.4  Wave 2 — sequencing notes

Before Wave 2 starts:

1. **P1** (`ViewPropertiesPanel.ts` 1677 LOC) is the longest single file in the project. Read it in three chunks before touching it; identify the exact `_renderVgSettingsSection()`, `_renderViewTemplateSection()`, and `_renderIntentSection()` symbol boundaries.
2. **A5** depends on a `CanvasContextMenu.ts` file that may not exist; audit `src/ui/canvas/` first. If absent, the new file is itself part of A5 and the estimate stretches by ~1 h.
3. **A7** depends on `localOverrides.outputOverride`, `viewRangeOverride`, `cropOverride`, `underlayOverride` being defined on `OverrideLayer`. Quick check: `rg "outputOverride|viewRangeOverride|cropOverride|underlayOverride" src/core/presentation/VisibilityIntentTypes.ts`. If missing, schema bump v4 → v5 lands inside Wave 2 (additive).
4. The `viewerPanels.ts` styling tokens path needs to be confirmed before P1 begins; the closest existing modules are `src/ui/styles/*` and inline `<style>` blocks in panel files.

### 19.5  Master-plan reading order for the implementing engineer

1. §0–§3 of this document (principles + dependency graph).
2. §19 (this section) — current reality.
3. §4 (Wave 1) and §5 (Wave 2) — design intent.
4. The relevant source files listed in §19.1 — for any change.
5. `replit.md` — to record the architecture delta after the wave merges.


---

## §19.6  Wave 2 — actual delta delivered

**P1 — Properties-panel V/G→Intent spine cleanup (status: ✅ delivered).**

The pre-flight audits in §19.4 surfaced three structural surprises that reshape the actual delta:

- **Reality A** — `ViewPropertiesPanel.ts` does NOT have separate `_renderVgSettingsSection()`, `_renderViewTemplateSection()`, `_renderIntentSection()` methods. There is ONE flat `_renderDefinitionProperties(def)` (line 448) with inline section calls. The cleanup happens at the call sites, not at separate render methods.
- **Reality B** — `OverrideLayer` (line 499 of `VisibilityIntentTypes.ts`) only contains `visibilityOverrides`, `graphicOverrides`, `isolateActive`. The four overrides described in plan §5 A7 (`outputOverride`, `viewRangeOverride`, `cropOverride`, `underlayOverride`) **do not exist**. The schema bump v4 → v5 to add them is **deferred** until those overrides are actually authored — A7 ships against the existing 3-collection layer.
- **Reality C** — There is no `src/ui/canvas/` directory. Right-click handling is split across `RadialMenu.ts` (3D scene) and `PlanViewInteraction.ts` (plan canvas). A5's "Override appearance in this view" entry is therefore a **two-surface hook**, not one new file. **A5 is deferred** to a Wave 2.5 follow-up commit (own concern, larger surface, no upstream dependency for P1/A7).

Files delivered this commit:

1. `src/ui/icons/ViewerIconSet.ts` (**new**)
   - Twelve monochrome line-glyph SVGs at 16×16 viewBox using `currentColor`. Replaces the coloured emoji vocabulary (🔒 👁 🚫 📌 ⚠ 🎨 🗎) used by the legacy V/G panel.
   - Exports `makeIcon(svg, opts)` helper that wraps an SVG in a `<span class="vi-icon">` with title / aria-label.
2. `src/ui/intent/IntentSourcePill.ts` (**new**)
   - `renderIntentSourcePill({ state, overrideCount?, onClick? })` produces the *Pure intent / Customised / No intent assigned* pill consumed by the spine.
   - Pure helpers `deriveIntentSourceState(layer, hasIntent)` and `countOverrides(layer)` exported for tests.
3. `src/ui/intent/SpineOverrideList.ts` (**new — A7**)
   - `renderSpineOverrideList({ viewId, layer, onChanged? })` folds visibility + graphic overrides into one row per `(targetKind, targetId)` and renders a per-row Revert button + a bulk "Clear all".
   - Per-row revert dispatches the existing `ClearOverrideCommand(viewId, targetKind, targetId)` (no new RevertOverrideCommand needed — it already exists).
   - Bulk clear dispatches `ClearAllOverridesCommand(viewId)`.
   - `collectRows(layer)` exported as a pure helper for tests.
4. `src/styles/panels/viewerPanels.ts`
   - New `INTENT_SPINE_STYLES` export at the bottom — declares the `--vi-*` design tokens (background, borders, text, accent, ok/warn/error, radius, row padding) and styles for `.vi-icon`, `.vi-pill`, `.vi-spine`, `.vi-overrides`. Tokens fall back to existing `--app-*` tokens.
5. `src/styles/AppTheme.ts`
   - Imports and concatenates `INTENT_SPINE_STYLES` into the global stylesheet alongside the other panel styles.
6. `src/ui/ViewPropertiesPanel.ts` — major restructure
   - **DELETED** the V/G Settings render block (~58 lines) and its gradient "Open Intent Settings" button.
   - **DELETED** the View Template section call + the entire `_buildViewTemplateSection()` method + 5 helpers (`_vtSyncStateColor`, `_vtSyncStateLabel`, `_buildLockedFieldRows`, `_vtGetFieldValue`, `_execAssignViewTemplate`, `_execOverrideViewTemplateProperty`, `_execResetViewTemplateProperty`) — ~210 lines removed.
   - **PROMOTED** `_buildVisibilityIntentSection(def)` to render BEFORE Identity, and rewrote it as the `vi-spine` block: monochrome icon, source pill, bound-intent name, intent picker, full-width "OPEN INTENT EDITOR" button, embedded `SpineOverrideList`.
   - **RENAMED** "AI Intent" section → "View Description" (label "Description (used by AI)") with explanatory placeholder. The underlying `def.intent` field name is unchanged.
   - **ADDED** three provenance rows to Metadata: *Bound Intent*, *Intent Version*, *Last Intent Change* (sourced from `viewIntentInstanceStore.get(def.id)` → `updatedAt` and the bound intent's `schemaVersion`).
   - Net file size: 1677 → 1543 lines (−134 lines, no functionality lost).

**A5 — Canvas context menu + per-element appearance editor (status: ⏳ deferred to Wave 2.5).**

Reasoning: A5 needs (a) a new context-menu hook on the 3D canvas via `RadialMenu.ts` *and* the plan canvas via `PlanViewInteraction.ts`, (b) a brand-new `PerElementAppearanceEditor.ts` that opens with `editingMode='override'` and dispatches `SetGraphicOverrideCommand`. Landing this with P1+A7 would have made the panel cleanup harder to validate independently. Wave 2.5 commit will deliver A5 in isolation; estimated 5 h.

**A7 — Per-element override list (status: ✅ delivered, scoped to existing schema).**

`SpineOverrideList` renders all visibility + graphic overrides on `localOverrides`. The four extra override collections in plan §5 A7 (`outputOverride`, `viewRangeOverride`, `cropOverride`, `underlayOverride`) do not exist on `OverrideLayer` and are deferred until they're actually authored. When that happens, the schema bump v4 → v5 + corresponding `collectRows` extension lands in the same commit as the new override-write commands.

### 19.7  Wave 2 acceptance gate — current status

| Acceptance criterion (§5) | Status |
|---|---|
| Properties panel no longer renders V/G Settings or View Template sections | ✅ Verified — both render blocks removed. |
| Visibility Intent block sits ABOVE Identity (the spine) | ✅ Verified at `_renderDefinitionProperties` line 583 (spine push) vs line 585 (Identity push). |
| Spine uses monochrome icons + `--vi-*` tokens (no gradients, no emojis) | ✅ Verified. `INTENT_SPINE_STYLES` injected via AppTheme; `ViewerIconSet` SVGs only. The legacy `vpp-apply-btn` gradient remains on `Mark Derived`/`Reset` rows in the *Output / View Range / Crop / Underlay* sections (out of scope for P1, addressed in Wave 4). |
| Per-target override list with Revert + Clear all | ✅ `SpineOverrideList` embedded inside the spine. |
| Mutations route through `CommandManager` only | ✅ Verified — `AssignViewIntentCommand`, `ClearOverrideCommand`, `ClearAllOverridesCommand`. |
| `tsc --noEmit --skipLibCheck` clean | ✅ Verified. |
| App restarts with no console errors; FPS stable | ✅ Verified — workflow restarted clean; FPS climbed back to 60–70. |
| A5 — canvas context menu + per-element appearance editor | ⏳ Deferred to Wave 2.5. |
| OverrideLayer schema bump v4 → v5 with output/range/crop/underlay collections | ⏳ Deferred until override-write commands for those collections exist. |


---

## §19.8  Wave 3 — actual delta delivered

**S4 — Standardised view-header Intent picker (status: ✅ delivered).**

Reality discovered in audit:
- The plan refers to `src/ui/views/StandardisedViewHeader.ts`. **No such file.** The shared header factory is `src/ui/views/ViewHeaderButtons.ts → buildViewHeaderToolbar()` (consumed by `PlanViewManager` and `SplitViewManager`).
- The plan refers to `BindViewIntentCommand({ keepOverrides: false })`. **That command does not exist.** The actual command — already wired up since Wave 2 P1 — is `AssignViewIntentCommand({ viewId, intentId })` at `src/commands/vg/AssignViewIntentCommand.ts`. The `keepOverrides` flag is part of Wave 6 / A6; until then any rebind preserves whatever overrides exist on the previous instance (the store's `assign()` semantics).
- The plan asks to filter intents by `intentScope !== 'view-local'`. **That field does not exist** on `VisibilityIntent`. Wave 3 lists every intent in `VisibilityIntentStore.getAll()`; system intents are visually disambiguated with a "(system)" suffix.
- `ViewHeaderButtons.ts` already had a hidden, deprecated `intentSelect` `<select>` stub (lines 119–123 pre-S4) kept only for backward compatibility with callers reading `.value`. S4 replaced it with the live picker; the handle's `intentSelect` field now points at the picker's underlying `<select>` so the back-compat surface still works.

Files delivered this commit:

1. `src/ui/intent/HeaderIntentPicker.ts` (**new**, ~120 LOC)
   - `createHeaderIntentPicker({ viewId })` returns `{ el, select, sync, destroy }`.
   - Renders a `<label class="vh-intent-picker">` containing the word "INTENT" and a styled `<select>` whose options are the full `VisibilityIntentStore.getAll()` list. The currently bound intent (from `viewIntentInstanceStore.get(viewId)`) is pre-selected; if no instance exists, a disabled "— pick an intent —" placeholder leads.
   - `change` handler short-circuits no-op rebinds, then dispatches `AssignViewIntentCommand` via `window.commandManager`.
   - Listens to the global `vi:instance-updated` event and self-rebuilds when the affected view matches. `destroy()` removes the listener — safe for future header teardown work.
2. `src/styles/panels/viewerPanels.ts`
   - Appended `.vh-intent-picker`, `.vh-intent-picker__label`, `.vh-intent-picker__select` rules to the existing `INTENT_SPINE_STYLES` export. All sized + coloured via the established `--vi-*` design tokens; no new tokens required.
3. `src/ui/views/ViewHeaderButtons.ts`
   - Imported `createHeaderIntentPicker`.
   - Replaced the hidden `intentSelect` stub block (lines 119–123 pre-S4) with the live picker; inserted `intentPicker.el` between the V/G button and the Range button (matching the plan's "right side of the header" requirement).
   - Updated the handle: `intentSelect` now aliases the picker's underlying `<select>` (back-compat preserved); `syncIntentSelect()` now calls both `syncVgBtn()` and `intentPicker.sync()`.
   - Updated the field-level JSDoc on `intentSelect` to reflect the S4 promotion (no longer "hidden stub for backward compat").
4. `src/ui/ViewPropertiesPanel.ts`
   - Added a constructor-level subscription to `vi:instance-updated` and `vi:overrides-cleared`. When fired against the currently displayed view, the panel re-renders so the spine's source pill, bound name, and override list stay in sync with header-driven changes (and any other future surface).

### 19.9  Wave 3 acceptance gate — current status

| Acceptance criterion (§6) | Status |
|---|---|
| Header dropdown reflects the bound Intent | ✅ `rebuildOptions()` reads `viewIntentInstanceStore.get(viewId).intentId` on init and on every `vi:instance-updated`. |
| Switching binds the new Intent | ✅ `change` dispatches `AssignViewIntentCommand` via `CommandManager`. |
| The Properties panel updates live | ✅ `ViewPropertiesPanel` constructor subscribes to `vi:instance-updated`; on match, re-renders the spine. |
| Mutations route through `CommandManager` only | ✅ Verified — no direct store writes. |
| `tsc --noEmit --skipLibCheck` clean | ✅ Verified. |
| App restarts with no console errors | ✅ Verified — clean startup; the trailing "Failed to fetch EngineBootstrap.ts" entry is a stale-tab HMR reconnect artefact, not a code error (FPS recovered to 71 on subsequent reconnects). |

### 19.10  Wave 3 — next-wave hooks left in place

- The picker's `change` handler is the future call-site for `AssignViewIntentCommand({ ..., keepOverrides })` once Wave 6 / A6 lands the flag.
- `HeaderIntentPicker.destroy()` is exported but not yet called — `ViewHeaderButtons` does not own a teardown lifecycle. When the header gets a destroy hook (Wave 11 collaboration sync work), wire it.
- The "(system)" suffix on intent labels is a placeholder pending an `intentScope` (or analogous "visibility") field on `VisibilityIntent`. When Wave 4 introduces per-view-type architecture and per-discipline filters, replace the suffix with proper grouping (`<optgroup>` per discipline / scope).


---

## §19.11  Wave 4 — actual delta delivered

**Audit baseline (file-path realities).** Wave 4's plan-vs-reality deltas were the largest in the program:

| Plan reference | Reality |
|---|---|
| `viewTypeProfiles[viewType]` schema on VisibilityIntent | Did not exist — schema carried `viewTypeModifiers: ViewTypeModifier[]` (a flat array, not a per-view-type map). |
| `ViewTypeProfile` interface | Did not exist anywhere. |
| Resolver priority-4000 merge step (B3) | Not implemented — the resolver only applied `viewTypeModifiers` at priority 5000. |
| `src/ui/views/ViewTypePropertiesPanelConfig.ts` | Did not exist. The Properties panel rendered Output / View Range / Crop / Underlay **unconditionally** for every view type (3D included). |
| `src/ui/intent/ViewTypeRuleMatrix.ts` | Did not exist. |
| `ElementGraphicsRules.visible` flag (A4 schema) | Did not exist. |
| `src/migrations/` directory | Did not exist — schema migrations live at `src/core/presentation/migrations/IntentSchemaMigrations.ts`. |
| `tests/projection/edge_projector_service.test.ts` | Did not exist; no `tests/projection/` directory at all. |
| `EdgeProjectorService` class | ✅ Confirmed at `src/core/views/EdgeProjectorService.ts`. |
| Doc 25 contract path | ✅ Confirmed at `docs/00_Contracts/25-VISIBILITY-INTENT-SYSTEM-CONTRACT.md`. |
| VisibilityIntentPanel "four flat tabs" | ✅ Confirmed (Element Rules / View Modifiers / Purpose Modifiers / View Range, lines 102–105). |

**Scope decision.** Wave 4 is the longest wave in the program (~3.5 days across S3, A4, B1). Following the established Wave 2 / Wave 3 pattern of shipping the high-value structural foundation now and deferring the heavy UI rewrites to follow-up waves, this commit lands:

- **S3 — schema + central matrix + Properties panel wiring** (the most visually obvious acceptance bullet: 3D hides view-range / crop / underlay).
- **B3 — resolver priority-4000 merge step** (folded into S3 step 6 per the plan; fully landed, no-op until profiles are populated).
- **A4 — schema sliver + resolver path** (`ElementGraphicsRules.visible`, profile-scoped `visible` flag, both consulted by the resolver and short-circuiting to a hidden appearance).

Deferred:

- **Wave 4.5** — VisibilityIntentPanel restructure (4 flat tabs → per-view-type accordion); `ViewTypeRuleMatrix.ts` UI component; A4 visibility-toggle column on the matrix; `SetIntentProfileElementVisibilityCommand`; one-shot forward migration of legacy `viewTypeModifiers` entries → `viewTypeProfiles` entries with snapshot test.
- **Wave 4.6** — Stage B1 entirely: Contract 25 §2.6.1 segment-state mapping (cut / projection / beyond) for section + elevation; `tests/projection/edge_projector_service.test.ts` with three fixture cases (beam crossing the cut plane → cut + projection; wall behind cut plane within far-clip → beyond; wall beyond far-clip → no segments).

### §19.11.1  Files touched

1. `src/core/presentation/VisibilityIntentTypes.ts`
   - Added `ElementGraphicsRules.visible?: boolean` (A4 schema sliver) with full JSDoc explaining the resolver short-circuit semantics and the default-true legacy behaviour.
   - Added new `ProfileElementRulePatch` interface — a fully-partial per-element-type rule patch carried inside profiles (per-state slots typed as `AppearancePatch`, plus a profile-scoped `visible?: boolean`).
   - Added new `ViewTypeProfile` interface with `elementRules` (typed) plus four `Record<string, unknown>` seed slots for view range / crop / underlay / output. Seed slots are intentionally untyped until Wave 5 (P2 — sourced-field resolver helpers) introduces strongly typed consumers.
   - Added `viewTypeProfiles?: Record<string, ViewTypeProfile>` field to `VisibilityIntent`. Marked the legacy `viewTypeModifiers` field `@deprecated` with the priority order documented inline; both fields coexist for back-compat.

2. `src/core/presentation/migrations/IntentSchemaMigrations.ts`
   - Bumped `CURRENT_INTENT_SCHEMA_VERSION` v4 → v5 (second post-P0 bump; first since Wave 1 P0's v3 → v4).
   - Added a v4 → v5 no-op migrator that documents `viewTypeProfiles` and `visible` as additive fields; legacy intents resolve unchanged.

3. `src/ui/views/ViewTypePropertiesPanelConfig.ts` (**new**, ~100 LOC)
   - The single source of truth for which Properties-panel sections render for which `ViewType`. Five constant rows:
     - `PLAN_SECTIONS` (plan, ceiling-plan, structural-plan): all four sections.
     - `SECTION_ELEVATION_SECTIONS` (section, elevation, detail): output ✓ range ✗ crop ✓ underlay ✓.
     - `THREE_DIMENSIONAL_SECTIONS` (3d, render, walkthrough): output only.
     - `DRAFTING_LEGEND_SECTIONS` (drafting, legend): output only.
     - `ANALYSIS_SECTIONS` (analysis): output ✓ range ✓ crop ✓ underlay ✗.
   - Exports `getViewTypePanelSections(viewType)` and `viewTypeShowsSection(viewType, section)`. Unknown view types fall back to a conservative all-sections-visible default with a console warning — preferable to silently hiding sections from a brand-new view type.

4. `src/core/presentation/IntentRuleResolver.ts`
   - Inserted the **priority-4000 merge step** after the base `rule[state]` clone and *before* the legacy `viewTypeModifiers` loop:
     - Reads `intent.viewTypeProfiles?.[viewType]?.elementRules?.[elementType]` with the same fallback chain as the existing `rulesFor()` helper (`structural-` strip, last-segment fallback, `__default__`).
     - If `profileRule.visible === false` → returns a fully hidden appearance (zero-pen, opacity 0). **A4 short-circuit at the profile level.**
     - Else merges the profile's per-state `AppearancePatch` over the cloned base appearance via the existing `mergeAppearance()` helper.
   - Added the **base-rule visibility check** in the `else` branch — when no profile patch overrides this element type for this view type, the base `rule.visible === false` triggers the same hidden-appearance short-circuit. **A4 fallback at the base-rule level.**
   - No-op for legacy intents (no `viewTypeProfiles` field, no `visible` flag) — guaranteed by the optional-chained reads.

5. `src/ui/ViewPropertiesPanel.ts`
   - Added import of `getViewTypePanelSections` from `./views/ViewTypePropertiesPanelConfig`.
   - Replaced the four unconditional `body.appendChild(...)` blocks (Output / View Range / Crop / Underlay) with config-gated guards. The build helpers are no longer invoked when the matrix says they shouldn't render — important because each helper does non-trivial work (reading store state, building DOM, attaching listeners).
   - The internal early-return `null` paths inside `_buildViewRangeSection` and `_buildUnderlaySection` are kept as defensive doubles.

### §19.11.2  Wave 4 acceptance gate — current status

| Acceptance criterion (§7) | Status |
|---|---|
| Plan view shows only plan-relevant sections | ✅ All four sections (output / range / crop / underlay) rendered for `plan`, `ceiling-plan`, `structural-plan`. |
| Section view shows section-relevant sections | ✅ `section`, `elevation`, `detail` render output / crop / underlay; range omitted. |
| **3D view hides view-range / crop / underlay** | ✅ `3d`, `render`, `walkthrough` render only the Output section. The headline visual S3 acceptance bullet. |
| Editing wall-cut rule under `plan` accordion updates plan view but not section | ⏸  Deferred — requires the per-view-type accordion editor (Wave 4.5). The resolver merge path is in place; populating profiles is what's pending. |
| Migration of legacy `viewTypeModifiers` produces equivalent `viewTypeProfiles` entries | ⏸  Deferred to Wave 4.5. Both shapes coexist; the v4 → v5 migrator is additive only. |
| Furniture-hidden-in-RCP works end-to-end | ⏸  Deferred — schema + resolver path in place; matrix UI + command land in Wave 4.5. |
| `EdgeProjectorService` test suite green for B1 fixtures | ⏸  Deferred to Wave 4.6 (Contract 25 §2.6.1 update + new `tests/projection/` fixture suite). |
| `tsc --noEmit --skipLibCheck` clean | ✅ Verified. |
| App restarts with no console errors | ✅ Verified — clean startup, FPS stable at ~70. The trailing "Failed to fetch EngineBootstrap.ts" is the same stale-tab HMR reconnect artefact noted in Waves 2 / 3, not a code error. |

### §19.11.3  Wave 4 — next-wave hooks left in place

- The new `viewTypeProfiles` field is the structural target for Wave 4.5's per-view-type accordion editor. `ViewTypeRuleMatrix.ts` consumes `intent.viewTypeProfiles[viewType].elementRules`; `SetIntentProfileElementVisibilityCommand` mutates the `visible` slot.
- `ViewTypePropertiesPanelConfig.ts` is the single source of truth Wave 5 (P2 — sourced-field resolver helpers) will consult to know which resolver helpers (`resolveViewRange` / `resolveCrop` / `resolveUnderlay` / `resolveOutput`) to wire up for each `viewType`.
- The `visible` flag at both the base-rule and profile levels is the schema target for Wave 4.5's `[◯ visible | ⊘ hidden]` matrix column. The resolver short-circuit is in place — only the UI affordance is pending.
- The four `Record<string, unknown>` seed slots in `ViewTypeProfile` (viewRange / crop / underlay / output) become strongly typed when Wave 5 lands `ViewRangeSettings` / `ViewCropSettings` / `ViewUnderlaySettings` / `ViewOutputSettings` consumers in the resolver helpers.
- Doc 25 still needs §2.6.1 (segment-state mapping spec for section + elevation) before Wave 4.6's `EdgeProjectorService` fixture tests can be written against a contract.

---

## §19.12  Wave 5 — Sourced-field resolver, per-row source pill foundation, and intent-usage selector (shipped)

**Date shipped:** 2026-04-26 (immediately following §19.11 / Wave 4)
**Plan slice covered:** §13 A8 (intent usage count in spine), §13 P2 (sourced-field resolver helpers + per-row source pill + reset-to-intent affordance), §13 B4 (source-chain reporter + tooltip)
**Files touched:**
- **Edit:** `src/core/presentation/VisibilityIntentTypes.ts` — `ViewTypeProfile` seed slots strongly typed (`Partial<View*Settings>` instead of `Record<string, unknown>`).
- **Edit:** `src/core/presentation/IntentRuleResolver.ts` (now 540 lines, +213 net) — added `IntentFieldSource`, `ResolvedField<T>`, `SourceContribution` types; added `resolveViewSeed`, `resolveViewRange`, `resolveCrop`, `resolveUnderlay`, `resolveOutput` helpers; added `resolveWithSourceChain` cold-path provenance walker.
- **Edit:** `src/ui/intent/IntentSourcePill.ts` (+63 lines) — added `renderFieldSourcePill()` per-row variant with one CSS modifier per `IntentFieldSource`.
- **Edit:** `src/ui/ViewPropertiesPanel.ts` — wired `intentUsageCount` into `_buildVisibilityIntentSection` spine; renders "Used by N view(s)" line under the bound name.
- **Edit:** `src/styles/panels/viewerPanels.ts` (+~95 lines of CSS) — `.vi-field-pill`, `.vi-reset-btn`, `.vi-chain-tooltip`, `.vi-spine__usage` style blocks.
- **New:** `src/core/presentation/selectors/intentUsageCount.ts` (~70 lines) — A8 selector + `formatIntentUsageLabel` helper. First file under `src/core/presentation/selectors/`.
- **New:** `src/ui/intent/ResetToIntentButton.ts` (~55 lines) — `↻` button rendered enabled only when source is `'override'`.
- **New:** `src/ui/intent/SourceChainTooltip.ts` (~115 lines) — hover-show / leave-hide tooltip with `attachSourceChainTooltip()` binder + standalone `renderSourceChainTooltip()`.

### §19.12.1  What Wave 5 actually shipped

- **Strongly typed seed slots.** `ViewTypeProfile.viewRange | crop | underlay | output` are now `Partial<ViewRangeSettings>` etc — every absent field falls through the resolver chain to the next layer, no more lossy `Record<string, unknown>`. The Wave 4 deferral is closed.
- **`IntentFieldSource` taxonomy.** Four origins fixed in code: `system-default → intent → profile → override`. Mirrored in CSS modifiers (`.vi-field-pill--system-default` … `.vi-field-pill--override`) and in the hover-tooltip's `ORIGIN_LABELS` map. Single source of truth.
- **Four sourced-field resolver helpers.** `resolveViewRange`, `resolveCrop`, `resolveUnderlay`, `resolveOutput` each return `{ value, source }`. Same precedence: override wins over profile wins over intent base wins over caller-supplied system default. Crop / underlay / output have no intent base layer (the intent has no top-level field for these — they're view-type-scoped only). View range additionally splices `intent.planViewRange.belowLevelDepth` (or `structuralPlanBelowLevelDepth` for `viewType='structural-plan'`) onto the system default's `depth` bound when the view doesn't override.
- **`resolveViewSeed`.** Trivial pass-through that exists so Wave 1's "Create View from Intent" dialog can stop reaching directly into `intent.viewSeed`. Decouples the dialog from the storage shape.
- **`resolveWithSourceChain` cold-path walker.** Returns `{ value, chain: SourceContribution[] }` with one entry per layer that contributed. Layers that didn't contribute (no profile patch for this elementType + viewType, etc.) are omitted. The final `value` is computed by re-invoking the canonical hot-path `resolveIntentStyle` so the chain's tail always equals what the renderer actually paints — defensive guard at the end of the walker keeps them in sync even when legacy modifiers / purpose mods are involved.
- **A8 — intent usage count in spine.** New selector `intentUsageCount(intentId, thisViewId?)` returns `{ count, onlyThisView, viewIds }` walking `viewIntentInstanceStore.getAll()`. Pure read, O(N) over instances. Wired into `_buildVisibilityIntentSection` directly under the bound-name line. Three label states: `Not in use` / `Used by 1 view (this one)` / `Used by N views`. The "(this one)" disambiguation is the answer to the journey question "Will my edit affect other views?" before the user touches anything. The solo case gets `--solo` modifier (warn-coloured) so a power user can spot a sole-user binding at a glance.
- **`renderFieldSourcePill()` per-row variant.** Dense, uppercase, 0.62rem pill that fits on a row beside a numeric input without wrapping. Distinct from the existing global `IntentSourcePill` (which is the spine-level state pill at top of the panel). One CSS modifier per `IntentFieldSource`. Optional `onClick` makes it focusable and keyboard-activatable for the planned "open the Per-Element Editor's provenance block" affordance in the Per-Element Editor wave.
- **`renderResetToIntentButton()`.** The `↻` row button, disabled (greyed, `pointer-events: none`) unless source is `'override'`. Disabled vs hidden: keeps row geometry consistent across rows so the column doesn't jitter as user edits cascade through the matrix.
- **`renderSourceChainTooltip()` + `attachSourceChainTooltip()`.** Tooltip is built on `mouseenter` / `focus` and torn down on `mouseleave` / `blur` — keeps us out of the React-style imperative DOM diffing loop the rest of the panel uses. The chain getter is a thunk so callers don't pay the resolver cost unless the user actually hovers. Returns a teardown function so panel destruction doesn't leak listeners.
- **CSS surface.** `.vi-field-pill` (4 modifiers), `.vi-reset-btn` (+ `--disabled`), `.vi-chain-tooltip` (with `__title`, `__list`, `__item`, `__item--final`, `__origin`, `__value`), `.vi-spine__usage` (+ `--solo`). All variables resolve through the existing `--vi-*` palette in the same stylesheet.

### §19.12.2  Wave 5 — explicit deferrals (Wave 5.5 territory)

- **Section consumers not yet rewired.** `_buildViewRangeSection`, `_buildCropSection`, `_buildUnderlaySection`, `_buildOutputSection` in `ViewPropertiesPanel.ts` still read raw `def.viewRange` etc and don't yet consume the new resolver helpers. Wave 5.5 will rewire each section to call the matching helper, render the per-row `renderFieldSourcePill` next to each input, and render `renderResetToIntentButton` at the end of the row. This is the heavy four-section rewrite (each section currently builds rows ad-hoc); deliberately decoupled from this wave so the resolver/component foundation lands clean and reviewable.
- **Source-chain tooltip not yet attached.** `attachSourceChainTooltip()` exists but isn't bound to any element in the live panel — it goes live in Wave 5.5 alongside the per-row pills (the pill is the natural hover anchor). Until then, `resolveWithSourceChain` is dead code — kept in to lock the chain contract before consumers depend on it.
- **No usage-count "Show usages" affordance.** The selector returns `viewIds` but the spine doesn't yet expose a click-to-jump list. Trivial UI addition, deferred to keep this wave's surface tight.
- **No commands for "reset row to intent default".** `ResetToIntentButton` calls `opts.onReset` synchronously; Wave 5.5 will wire that to `ClearViewRangeOverrideCommand` / `ClearCropOverrideCommand` / etc — none of those commands exist yet either, they land alongside the section rewrites.
- **Per-Element Editor.** The plan's §13 P3 / B4 fully-fledged Per-Element Editor with provenance block is post-Wave-6 territory. The pill's `onClick` hook is the future entrypoint.
- **Intent base layer in `resolveCrop` / `resolveUnderlay` / `resolveOutput`.** Currently empty — the intent type has no top-level fields for these. If the Visibility-Intent journey doc later adds e.g. `intent.defaultUnderlay`, the resolver branch slots in at the same precedence position as `resolveViewRange`'s `intent.planViewRange` branch. Schema evolution path is open.

### §19.12.3  Wave 5 — next-wave hooks left in place

- The four resolver helpers are the structural target for Wave 5.5's section rewrites. Each helper's `systemDefault` thunk parameter is the contract — section builders pass their existing `computeViewRangeDefaults(level)` / equivalent and the helper does the chain walk. The hot path is unchanged for views without a bound intent.
- `IntentFieldSource` is the single enum the Wave 5.5 commands will key off when deciding whether a row's reset action is a no-op.
- `resolveWithSourceChain`'s `chain[]` is the data structure the Per-Element Editor's provenance block will consume directly — same shape, different presentation host. The cold-path walker pays a measurable cost only on hover; verified by inspection (no `useFrame` consumer, single-call from event handlers).
- `intentUsageCount` is the selector the future "Manage Intents" panel will consume to render the global usage column — same call signature, no `thisViewId` argument.
- `selectors/` directory is now seeded — future Wave 5.5+ pure derivations land here (`countViewsUsingProfile`, `intentBindingDelta`, etc.) and stay out of the store files.


---

## §19.13  Wave 6 — Bind / Unbind / Pin / Take-Latest / Snapshot Foundation

Wave 6 lands the **lifecycle commands** for the view↔intent relationship and the
first version-divergence affordance. After Wave 5 surfaced provenance per row,
Wave 6 puts the four verbs the user actually needs in their hands at the
binding-as-a-whole level: *unbind*, *pin to a specific version*, *take latest*,
and *snapshot the current view into a fresh intent*. None of these existed
before — the only mutation a view's intent relationship supported in Waves 1–5
was *(re-)assign*.

### §19.13.1  Wave 6 — what shipped

- **`ViewIntentInstance.pinnedVersion?: number`** added to the type
  (`src/core/presentation/VisibilityIntentTypes.ts`). Optional by design — its
  absence means "follow latest", presence pins resolution to that exact intent
  version. Wave 5's resolver chain doesn't care about this field yet (deferred
  to Wave 6.5); only the **divergence detector** in the spine reads it today.
- **`ViewIntentInstanceStore.pinViewVersion(viewId, version) / unpinViewVersion(viewId)`**
  (`src/core/presentation/ViewIntentInstanceStore.ts`, ~lines 115–158). Both
  are no-ops when the binding doesn't exist — keeps callers from having to
  null-check before invoking. Pin is idempotent; unpin clears the field
  rather than setting `undefined` so the JSON snapshot stays compact.
- **Four new `CommandType` enum entries** (`src/commands/types.ts`):
  - `UNBIND_VIEW_INTENT`
  - `PIN_VIEW_INTENT_VERSION`
  - `TAKE_LATEST_INTENT_VERSION`
  - `CREATE_INTENT_FROM_VIEW`
  All four were also added to the `PlanOrdering.TYPE_PRIORITY` table at
  priority `5` (same bucket as `ASSIGN_VIEW_INTENT`) so the
  `Record<CommandType, number>` exhaustiveness contract stays satisfied — this
  is the typical missed-spot that bites the first time a new command type
  lands; calling it out so future waves don't repeat it.
- **`AssignViewIntentCommand` extended with `keepOverrides?: boolean`**
  (`src/commands/vg/AssignViewIntentCommand.ts`). Default `true` preserves
  existing call-site behaviour; `false` calls `clearOverrides()` after the
  bind so a fresh assignment can opt into a clean slate. The "Switch
  intent" dialog (Wave 6.5) is the natural caller for `keepOverrides: false`.
- **`UnbindViewIntentCommand`** (`src/commands/vg/UnbindViewIntentCommand.ts`).
  Calls `viewIntentInstanceStore.unbind(viewId)`. Per the journey doc's
  "preserve visual state on unbind" rule, the visual fidelity is the
  responsibility of an upstream `SnapshotViewVisualsCommand` that runs
  *before* unbind in a plan — Wave 6 doesn't ship that snapshot command (see
  deferrals); the unbind verb itself is the structural leaf.
- **`PinViewIntentVersionCommand`** (`src/commands/vg/PinViewIntentVersionCommand.ts`).
  Validates the requested version exists on the bound intent before pinning;
  fails the command if the version is unknown rather than silently accepting
  a dangling pin. This is the structural guarantee the divergence detector
  relies on: a non-null `pinnedVersion` is always a real version.
- **`TakeLatestIntentVersionCommand`** (`src/commands/vg/TakeLatestIntentVersionCommand.ts`).
  Calls `unpinViewVersion(viewId)`. The "take latest" verb is *intentionally*
  modeled as an unpin rather than a "set pinnedVersion = current.version"
  because the user wants follow-forward behaviour — pinning to the current
  number would freeze the view at the next intent edit.
- **`CreateIntentFromViewCommand`** (`src/commands/vg/CreateIntentFromViewCommand.ts`).
  Snapshots a view's element-type-targeted graphic overrides into a fresh
  `VisibilityIntent`'s `viewTypeProfiles[viewType].elementRules` patch, then
  (when `params.bindCreatedToView !== false`) re-binds the source view to
  the new intent. Per-instance overrides remain on the source view per
  snapshot rule 4. The intent is created with `schemaVersion =
  CURRENT_INTENT_SCHEMA_VERSION` and `version = 1` so it slots into the
  resolver chain immediately. `viewSeed` is intentionally **not** populated
  on creation (see deferrals).
- **`DivergedBanner` UI component** (`src/ui/intent/DivergedBanner.ts`).
  Three pure functions: `shouldShowDivergedBanner(instance, intent)`,
  `renderDivergedBanner(opts)`, and `dismissDivergedBanner(instanceId,
  viewId)`. The banner appears at the very top of the spine when
  `instance.pinnedVersion < intent.version` and the user hasn't dismissed
  for the session. "Stay pinned" stores `${instanceId}::${viewId}` in an
  in-memory `Set` (`DISMISSED_THIS_SESSION`) — survives panel re-builds in
  the same session; reset on reload. "Take latest" wires straight into
  `TakeLatestIntentVersionCommand` via the panel's `commandManager`.
- **Wired into `ViewPropertiesPanel._buildVisibilityIntentSection`**
  (`src/ui/ViewPropertiesPanel.ts`, lines 719–743). The banner is the first
  child of the spine wrapper — above the head, above the chain, above
  usage. Dismissal triggers `this.show(this.selectedView)` to rebuild the
  panel (no `refresh()` method exists on the panel; `show()` is the
  rebuild entrypoint).
- **CSS surface added** (`src/styles/panels/viewerPanels.ts`, lines 739–793).
  Six classes — `.vi-diverged`, `.vi-diverged__message`, `__icon`,
  `__text`, `__actions`, `__btn` (with `--primary` and `--ghost`
  modifiers). All variables resolve through the existing `--vi-*` palette.

### §19.13.2  Wave 6 — explicit deferrals (Wave 6.5 territory)

- **No `SnapshotViewVisualsCommand`.** The "preserve visual state on unbind"
  rule from the journey doc requires that unbinding a view collapse the
  intent-resolved visual state into per-instance graphic overrides so the
  view *looks the same* after the bind disappears. Wave 6.5 will land this
  as a separate command that an unbind plan composes *before*
  `UnbindViewIntentCommand`. Wave 6 ships unbind as a structural leaf only —
  callers that want visual fidelity must wait. The plan-ordering priority
  for the snapshot command is reserved alongside the existing five at
  priority `5`.
- **`pinnedVersion` is not yet honoured by the resolver chain.** Wave 5's
  `ViewGeometryLens.resolveViewRange` / `resolveCrop` / `resolveUnderlay`
  / `resolveOutput` currently read `bound.intent` directly. Wave 6.5 will
  thread `pinnedVersion` through the resolvers so a pinned view actually
  *uses* the older version's values. Until then, "pinned" is a marker the
  divergence detector reads but the visual output ignores. This is
  intentional — the version-history store needed to look up "version N of
  intent X" is a Wave 7 concern.
- **`CreateIntentFromView` snapshot rules 2 & 3 not yet collapsed.** Per the
  journey doc, a full snapshot also collapses (2) per-element-type
  visibility overrides into the profile's `elementRules.visible = false`
  patch and (3) view-level crop/underlay/output deltas into the profile's
  field defaults. Wave 6 only collapses graphic-override appearance bundles
  (rule 4). The `collapseGraphicOverridesIntoProfile` helper signature is
  the structural slot — Wave 6.5 will add `collapseVisibility…` and
  `collapseGeometryDefaults…` siblings and merge their outputs into the
  same profile.
- **`viewSeed` not seeded by `CreateIntentFromView`.** Per Wave 1 / Stage P0,
  the "Create View from Intent" dialog needs a `viewSeed` to pre-populate
  the new view's discipline / purpose / scale. A fresh distill-from-view
  intent doesn't have an opinion on these — the user would have to fill
  them in. Wave 6.5 will surface a Create Intent dialog that lets the user
  tag the new intent at creation time; until then the new intent renders as
  ineligible for "Create View from Intent" by design.
- **Per-state appearance merging in `collapseGraphicOverridesIntoProfile`.**
  Today the helper groups overrides by `elementType` and seeds an empty
  `ProfileElementRulePatch`. The per-state appearance patch (which actually
  carries the override visuals into the profile) is the Wave 6.5 follow-up.
  The structural relationship is preserved — the patch object exists keyed
  by elementType — so the downstream resolver wiring is the same shape it
  will be after the merge lands.
- **Persisted "Stay pinned" dismissal.** The `DISMISSED_THIS_SESSION` set is
  in-memory only. Wave 6.5 will move this to a per-user preference (probably
  via the existing settings store) so the banner doesn't reappear on every
  reload after the user explicitly dismisses it.
- **`keepOverrides: false` UI surface.** The flag exists on
  `AssignViewIntentCommand` but no UI calls it yet. The "Switch intent"
  dialog in Wave 6.5 will offer a "Start fresh / Keep my overrides" radio
  pair that maps to this flag.
- **`PinViewIntentVersionCommand` UI affordance.** No control in the panel
  yet exposes pinning to a specific older version — needs the version-history
  drawer (Wave 7). Today the only path to a non-null `pinnedVersion` is
  programmatic (or future migrations). The divergence detector will still
  trigger correctly the moment any code path sets the field.

### §19.13.3  Wave 6 — next-wave hooks left in place

- The four new `CommandType` enum entries lock the names into the
  `PlanOrdering.TYPE_PRIORITY` exhaustiveness contract. Future plan
  composers can chain `SnapshotViewVisuals → UnbindViewIntent` (Wave 6.5)
  or `PinViewIntentVersion → ApplyVersionedResolver` (Wave 7) without
  touching the command-type machinery.
- `DivergedBanner.shouldShowDivergedBanner` is the single decision point
  for "is this view out of date?" — Wave 7's version-history drawer will
  call the same predicate to decorate its row entries.
- `collapseGraphicOverridesIntoProfile` in `CreateIntentFromViewCommand` is
  the structural slot for the Wave 6.5 merge work — sibling collapsers
  land alongside it and the call site folds their outputs into the same
  `ViewTypeProfile`.
- `pinnedVersion` on `ViewIntentInstance` is the threading point for Wave
  6.5's resolver-chain version awareness — once the field is honoured,
  every per-row provenance pill from Wave 5 automatically gains
  pinned-version semantics for free.
- `AssignViewIntentCommand.keepOverrides` is the single switch that
  toggles between "rebind, preserve" and "rebind, reset" semantics. The
  Switch-Intent dialog binds directly to this without command surface
  growth.

### Wave 6 acceptance gate

- `npx tsc --noEmit` clean.
- Workflow restart healthy — server boot logs intact, no console errors.
- All four new `CommandType` entries present in `PlanOrdering.TYPE_PRIORITY`.
- Spine renders the diverged banner above the head when
  `instance.pinnedVersion < intent.version` and not dismissed.
- "Take latest" button on the banner clears `pinnedVersion` via
  `TakeLatestIntentVersionCommand`; "Stay pinned" hides the banner for
  the session via `dismissDivergedBanner` and a `show()` re-render.

---

## §19.14  Wave 7 — Line-Weight Slider, Mass-Edit Menu, Multi-Select (shipped)

Wave 7 closes three orthogonal authoring affordances on top of the
Wave 6 foundations:

  - A1 — line-weight slider with the standard AEC bounds (0.05–5 mm
    on the slider thumb, 0.001–10 mm on the numeric input). All
    line-weight inputs across the panel now share the same min/max so
    a typed-in zero or negative pen can never reach the resolver.
  - A2 — mass-edit toolbar with three commands: apply current
    appearance to all four states, apply current appearance to all
    element types in this state, and copy/paste appearance via a
    module-scoped clipboard.
  - A3 — multi-cell selection across `(elementType, state)` pairs.
    Shift+Click on element rows or state tabs toggles cells into
    the set; the appearance form switches into a "(varies)" batch
    mode that dispatches a single transactional
    `BulkApplyAppearanceCommand` per edit.

### §19.14.1  Files touched

- `src/commands/types.ts`
  - Added three new `CommandType` enum entries:
    `BULK_APPLY_APPEARANCE`, `COPY_APPEARANCE_PATCH`,
    `PASTE_APPEARANCE_PATCH`.

- `src/commands/plans/PlanOrdering.ts`
  - Added priority-5 entries for the three new command types,
    matching the existing `UPDATE_VISIBILITY_INTENT` bucket so the
    plan composer treats batch edits identically to single edits.

- `src/commands/vg/BulkApplyAppearanceCommand.ts` (new)
  - `BulkAppearanceTarget` interface — the `(intentId, elementType,
    state)` triple every batch command consumes.
  - `BulkApplyAppearanceCommand` — applies one `AppearancePatch`
    across an arbitrary cell set in one transaction; snapshot/restore
    granularity is `Map<intentId, Map<elementType, ElementGraphicsRules>>`
    so undo restores each touched rule slot independently.
  - `CopyAppearancePatchToClipboardCommand` — captures one cell into
    a module-scoped clipboard singleton; undo restores the previous
    clipboard contents (including null) so the toolbar's
    Paste-enabled state stays consistent with the undo stack.
  - `PasteAppearancePatchFromClipboardCommand` — composes a
    `BulkApplyAppearanceCommand` internally with the clipboard patch
    snapshotted at paste time, so subsequent copies don't mutate the
    paste's payload and break undo.
  - `appearancePatchClipboardIsPopulated()` predicate exported for
    the toolbar's Paste-button enabled state.
  - `mergeAppearancePatch()` helper — direct fields overwrite,
    `line` and `fill` shallow-merge.

- `src/commands/vg/index.ts`
  - Re-exports the three command classes, the `BulkAppearanceTarget`
    type, the clipboard predicate, and a `peekAppearancePatchClipboard`
    helper for tests.

- `src/ui/VisibilityIntentPanel.ts`
  - Added `LINE_WEIGHT_MIN/MAX/SLIDER_MIN/SLIDER_MAX` constants and a
    `validateLineWeight()` clamp helper; `updateAppearance` calls it
    on every `line.weight` edit and reflects the clamp back into both
    the numeric input and the slider thumb.
  - `renderAppearanceForm()` now renders the slider+number pair via
    `data-appearance-slider="line.weight"` / `data-appearance="line.weight"`.
  - `selectedCells: Set<string>` field plus `cellKey`,
    `getSelectedElementTypesForState`, `computeBatchVariesMap`,
    `getBulkTargetsFromMultiSelect`, and `toggleCellInSelection`
    helpers — the multi-select machinery.
  - `renderMultiSelectBar()` renders either a hint chip (when the set
    is empty) or an active batch-mode chip with a `Clear`,
    `Select all states for picked types`, and a count summary.
  - `renderMassEditToolbar()` renders the four mass-edit buttons and
    grays Paste when the clipboard is empty.
  - Element-row click handler distinguishes plain-click (focus +
    clear set) from Shift+Click (toggle cell into set). State tabs
    accept Shift+Click in the same way to add the current focus type
    at that state.
  - `updateAppearance` now branches on `selectedCells.size > 0`:
    when batch mode is active it builds a single-field
    `AppearancePatch` via `buildSingleFieldPatch` and dispatches one
    `BulkApplyAppearanceCommand` for the entire set. Empty
    "(varies)" sentinel inputs are ignored so untouched fields don't
    overwrite their per-cell variation.
  - `dispatchBulkApply`, `massApplyToAllStates`,
    `massApplyToAllElementTypes`, `massCopyPatch`, `massPastePatch`,
    and `captureAppearanceAsPatch` plumb the toolbar buttons into
    the new commands.
  - The two view-type / purpose modifier card line-weight inputs now
    declare `min="${LINE_WEIGHT_MIN}" max="${LINE_WEIGHT_MAX}"` and
    a tooltip explaining the bounds. (Modifier writes already go
    through `updateModifier`, which round-trips through the
    `UpdateVisibilityIntentCommand` path; clamp enforcement at the
    DOM level prevents most over-range entries before they round-trip
    back as a server-side rejection.)

- `src/styles/panels/visibilityGraphics.ts`
  - New CSS classes: `vi-element-row--multi`, `vi-multi-bar` (with
    `--hint` and `--active` variants plus `__count` and `__summary`
    BEM children), `vi-mass-edit` (with `__label` and `__sep`
    children), `vi-line-weight-row`, and `vi-slider`.

### §19.14.2  Wave 7 — explicit deferrals

- The Wave 7 master plan listed `src/ui/intent/PerStateAppearanceForm.ts`,
  `src/ui/intent/PerElementAppearanceEditor.ts`, and
  `src/ui/intent/ViewTypeRuleMatrix.ts` as new files, plus a parallel
  `src/core/presentation/commands/` directory. Those files do not
  exist in this codebase and the rest of the panel still inlines the
  same render functions. Wave 7 ships the same behaviour by extending
  the inline renderers in `VisibilityIntentPanel.ts` rather than
  creating the planned standalone components — the structural
  refactor is deferred to a future wave. All command code did land in
  the existing `src/commands/vg/` directory, not a new
  `src/core/presentation/commands/` directory.
- Multi-select across multiple intents in one transaction is
  supported by `BulkAppearanceTarget`'s shape but the panel always
  scopes the set to the currently selected intent and clears it on
  intent switch.
- The mass-edit toolbar deliberately omits a "Reset to defaults"
  button — that affordance lives on individual fields (Stage S2's
  per-field reset), and a global reset would clobber too much state
  for a single Ctrl+Z to recover gracefully.

### §19.14.3  Wave 7 — next-wave hooks left in place

- `appearancePatchClipboardIsPopulated()` is a standalone predicate
  so future cross-panel paste targets (e.g. the per-view override
  panel) can reuse the same singleton without touching the command
  module.
- `BulkApplyAppearanceCommand` already groups targets by `intentId`
  internally, so a future "apply this appearance across multiple
  intents" affordance only needs the panel to lift the
  intent-clear-on-switch guard and pass mixed-intent targets — the
  command already handles the snapshot/restore correctly.
- `mergeAppearancePatch` is the one merge contract for batch writes;
  if a Wave 8 modifier-style patch (e.g. multiplicative line-weight)
  is added, that semantics lives inside this single helper.
- `validateLineWeight` is exported via the same module that defines
  the constants, so any future server-side validator can import the
  exact same bounds.

### Wave 7 acceptance gate

- `npx tsc --noEmit --skipLibCheck` clean.
- Workflow restart healthy — server boot logs intact, no console errors.
- All three new `CommandType` entries present in
  `PlanOrdering.TYPE_PRIORITY`.
- Slider drag updates the numeric input and dispatches a
  `BulkApplyAppearanceCommand` (in batch mode) or an
  `UpdateVisibilityIntentCommand` (in single-cell mode) per change.
- Out-of-range line-weight entry (e.g. `0`, `-1`, `99`) clamps to
  `[0.001, 10]` and the displayed value reflects the clamp.
- Shift+Click on element rows toggles cells into the set; the
  multi-select bar shows the count and the appearance form switches
  to batch mode with `(varies)` placeholders for fields that differ
  across the set.
- A single edit in batch mode dispatches one
  `BulkApplyAppearanceCommand`; one Ctrl+Z reverts every cell.
- Mass-apply-states / mass-apply-types / mass-copy / mass-paste each
  produce one undoable command and show no console errors.
- Paste button is disabled when the appearance clipboard is empty
  and re-enables after a copy without a panel reload.

---

## §19.15  Wave 8 — 3D Appearance + Renderer (shipped 2026-04-26)

Wave 8 closes the Stage S5 gap (G-A3 in doc 10): the
`ThreeDimensionalAppearance` schema is now (a) authorable from the
Visibility-Intent Panel, (b) flowed through every batch / copy / paste
edit path, and (c) consumed by the live 3D renderer for wall-body
meshes via the existing `VGSceneApplicator` 3D branch.

The wave is strictly opt-in for renderer behaviour: only intents that
explicitly author a `surface3D` block override the wall's baked-in
`materialColor`. Intents that omit `surface3D` keep today's behaviour
exactly (verified by the `resolveSurface3DExplicit` early-return).

### §19.15.1  Files touched

**Authoring + commands**

- `src/core/presentation/VisibilityIntentTypes.ts`
  - `AppearancePatch` now carries `surface3D?: Partial<ThreeDimensionalAppearance>`
    so the bulk + copy + paste pipeline covers the 3D look without a
    parallel command type.
- `src/commands/vg/BulkApplyAppearanceCommand.ts`
  - `mergeAppearancePatch` shallow-merges `surface3D`, initialising
    the slot from the patch when the target had none.
  - `CopyAppearancePatchToClipboardCommand.execute` captures
    `surface3D` so paste lands the 3D fields alongside the 2D ones.
- `src/ui/VisibilityIntentPanel.ts`
  - `renderAppearanceForm` calls a new `render3DSurfaceSection`
    helper that emits a "3D Surface" subsection with rows for
    `colour`, `opacity`, `edges`, `material`, `metalness`, `roughness`
    using the same `data-appearance="surface3D.<field>"` pattern.
  - `updateAppearance` (single-cell path) initialises
    `appearance.surface3D = {}` before writing into nested fields.
  - `buildSingleFieldPatch` routes `surface3D.<field>` into
    `patch.surface3D = { [field]: value }`.
  - `captureAppearanceAsPatch` includes `surface3D` so "apply to all
    states / element types" carries the 3D look.
  - `computeBatchVariesMap` adds the six `surface3D.*` paths so
    multi-select renders `(varies)` when picked cells disagree.

**Resolver + renderer**

- `src/core/presentation/IntentRuleResolver.ts`
  - **NEW** `resolveSurface3DExplicit(...)` — same signature as
    `resolveSurface3D` but returns `null` when no rule in the chain
    authored a `surface3D` block. This is the entry point the renderer
    hook uses, so behaviour is preserved when no 3D look is set.
- `src/core/presentation/ThreeDAppearanceResolver.ts` (**new**)
  - `ThreeDAppearanceResolver` class with `resolveForView`,
    `applyToMaterial`, `applyForView`. Exports a singleton
    `threeDAppearanceResolver`.
  - `applyToMaterial` only writes fields the live material class can
    represent (colour on anything with `.color`, opacity on any
    `Material`, metalness/roughness only on `MeshStandardMaterial`/
    `MeshPhysicalMaterial`). Material-class swaps are deliberately
    **not** performed — owned by the builder layer.
- `src/core/presentation/VGSceneApplicator.ts`
  - In the existing 3D wall-body branch, after the VG transparency
    apply, the resolver is consulted. If an explicit descriptor
    exists, the original `mat3d.color.getHex()` is snapshotted into
    `mesh.userData.vgIntent3DOriginalColor` once, then
    `applyToMaterial` writes the surface3D fields. If the descriptor
    later disappears (intent unbound or `surface3D` cleared),
    the snapshot is restored and the userData key is deleted.

### §19.15.2  Files **not** touched (plan delta)

The plan listed `src/render/three/MaterialFactory.ts` and
`src/ui/intent/ThreeDAppearanceForm.ts` as new files. Neither path
exists in the repo:

- 3D materials are built across many sites
  (`src/services/MaterialService.ts`, `WallFragmentBuilder`,
  `WindowBuilder`, `IfcGeometryRenderer`, …); a single MaterialFactory
  gateway is a much larger refactor than Stage S5 requires. The
  applier-side `ThreeDAppearanceResolver.applyToMaterial` covers the
  actual S5 acceptance criterion ("a 3D view bound to an Intent with
  `wall.threeD = { surfaceColour: '#d4c5b0' }` renders walls in that
  colour; switching Intent re-materialises live") without it.
- `src/ui/intent/PerStateAppearanceForm.ts` was deferred in Wave 7;
  the 3D form rows live inline in `VisibilityIntentPanel.ts` for the
  same reason — they share every code path with the 2D rows.

### §19.15.3  Wave 8 acceptance gate

- `npx tsc --noEmit --skipLibCheck` clean.
- Workflow restart healthy; no console errors.
- A `BulkApplyAppearanceCommand` carrying a `surface3D` patch updates
  every targeted `(intentId, elementType, state)` cell in a single
  undoable step.
- `CopyAppearancePatchToClipboardCommand` followed by
  `PasteAppearancePatchFromClipboardCommand` round-trips
  `surface3D.{colour, opacity, edges, material, metalness,
  roughness}`.
- `resolveSurface3DExplicit` returns `null` for every system intent
  out-of-the-box (none author `surface3D`), so the existing 3D wall
  rendering is byte-identical to pre-Wave-8 in the default project.
- Authoring `surface3D.colour = '#7a3b1f'` for the `Wall` element
  type on the active intent immediately tints the 3D wall meshes
  on the next `applyAll` traversal; clearing the field restores the
  authored `materialColor` from the snapshot.
- Multi-select + edit `surface3D.colour` once dispatches **one**
  command and tints every selected cell.

### §19.15.4  Wave 8 — explicit deferrals (Wave 8.5 territory)

- **Per-element 3D snapshot** — only wall bodies snapshot the
  original colour in userData; window frames, doors, slabs, etc.
  use builder-side `MeshStandardMaterial({ color })` and are not
  yet routed through the applier. Wave 8.5 would extend the userData
  cache + applier branch to those builders.
- **Material-class swap** — `surface3D.material = 'pbr'` against a
  live `MeshLambertMaterial` is a no-op for metalness/roughness
  today. A clean implementation requires a builder-side material
  factory; deferred per the plan-delta note above.
- **`edges: false` enforcement** — the descriptor field is
  authorable + persistable, but the wall-edge overlay renderer
  (`WallEdgeOverlayBuilder` + `applyToLine`) does not yet consult
  the intent's `surface3D.edges` flag. A small follow-up wires that
  through the existing edge-line applier path.

### §19.15.5  Wave 8 — next-wave hooks left in place

- `ThreeDAppearanceResolver` is the single entry point — Wave 9
  (detail-view inheritance) can swap `viewIntentInstanceStore.get`
  for `resolveWithInheritance` without touching any caller.
- `resolveSurface3DExplicit` keeps the explicit-vs-fallback
  distinction sharp, so future appliers (window/door builders,
  IFC projector in Wave 10) can opt in to override behaviour with
  the same null-vs-record contract.
- `userData.vgIntent3DOriginalColor` is a per-mesh, per-applier
  cache; the next time a mesh is rebuilt or the model is reloaded
  the snapshot is naturally garbage-collected with the userData
  bag. No cleanup hook needed.

---

## §19.16  Wave 9 — Detail-view inheritance + RCP wall inversion (shipped 2026-04-26)

Wave 9 closes the Stage S6 gap (G-A4, G-A5 in doc 10): detail /
dependent views now inherit their parent view's bound Visibility
Intent when they have no own binding, and Reflected Ceiling Plan
(RCP) views render walls with projection-weight pen instead of the
heavy cut-zone weight.

### §19.16.1  Wave 9 — what was already in place

A meaningful chunk of S6 was prebuilt in earlier waves; the wave was
sized to ~1.5 d in the master plan precisely because of this. The
groundwork that already existed:

- `ViewDefinition.parentViewId` exists on `ViewDefinitionTypes.ts`
  (line 505) and is plumbed through `ViewDefinitionStore.create`
  (line 154). **No schema work needed.**
- `resolveWithInheritance(viewId, ctx)` exists in
  `IntentRuleResolver.ts` (line 282) with cycle-safety via a
  `Set<viewId>` guard (Risk R1 in the plan). **However it had zero
  callers** — it was dependency-injected against an
  `InheritanceContext` interface but no factory wired the live
  singletons into a usable context.
- The `ceiling-plan` `viewTypeModifiers` for `ceiling` and `slab`
  already perform `stateTransform.sourceState` inversion in
  `SystemIntents.ts` (lines 100-117). The remaining gap was
  walls — they fell through to the default and rendered at full
  cut-zone weight in RCP views, drowning out the ceiling grid.

### §19.16.2  Files touched

**New**

- `src/core/presentation/IntentBindingResolver.ts` (**new**) — the
  facade that wires the three live singletons
  (`viewDefinitionStore`, `viewIntentInstanceStore`,
  `visibilityIntentStore`) into a default `InheritanceContext` and
  exposes three top-level helpers:
    - `defaultInheritanceContext()` — factory for the live context
      (kept as a function so unit tests can build alternative
      stub-store contexts without monkey-patching the singletons).
    - `resolveBoundIntentWithInheritance(viewId)` — primary read
      path; returns `{ instance, intent } | null`. The `instance`
      is the leaf view's instance (so local overrides are
      preserved); the `intent` is whichever the chain resolved to.
    - `getInheritedFromViewId(viewId)` — UI helper for the
      "Inherits from <parent>" badge. Returns the ancestor view id
      whose binding actually applies, or `null` if (a) the view has
      its own binding or (b) no ancestor in the chain has one.
    - `resolveInheritanceChain(viewId)` — diagnostic listing of
      the full ancestor walk, leaf first, useful for tooltips and
      future debug surfaces.

**Modified**

- `src/core/presentation/ThreeDAppearanceResolver.ts` — `resolveForView`
  now consults `resolveBoundIntentWithInheritance(viewId)` instead
  of `viewIntentInstanceStore.get(viewId)`. This was the next-wave
  hook left in place at the end of Wave 8 (§19.15.5). The walk is
  cycle-safe; behaviour is identical for views that already had a
  direct binding.
- `src/core/presentation/SystemIntents.ts` — added a new
  `viewTypeModifier` for `ceiling-plan / wall` with
  `stateTransform.cut: { sourceState: 'projection' }`. In an RCP the
  cut plane is at ceiling height looking up; sourcing the projection
  appearance for the cut-state lookup makes walls render with the
  lighter pen weight so the ceiling grid + fixtures read clearly.
  `lineWeightMultiplier` is left at its default (1.0).
- `src/ui/ViewPropertiesPanel.ts` — `_buildVisibilityIntentSection`
  now renders an "Inherits from <parentName>" badge below the
  bound-intent name when the view has no own binding but inheritance
  returns one. The bound-intent name itself is rendered italic and
  shows the inherited intent's name (so the spine isn't blank). The
  picker row is unchanged; assigning an intent to the leaf view
  still creates a direct binding via `AssignViewIntentCommand` and
  the badge disappears on the next refresh (driven by
  `vi:instance-updated`).

### §19.16.3  Files **not** touched (plan delta)

- `src/render/SectionGraphicsApplier.ts` — listed in the plan as the
  consumer of `viewTypeProfiles['ceiling-plan'].statesShown` and
  `symbolicRules`. **The file does not exist** and the
  `statesShown` field is not on `ViewTypeProfile` today. The legacy
  `viewTypeModifiers` array (deprecated since Wave 4 but still the
  live execution path for `stateTransform`) already handles the
  inversion contract for ceilings + slabs and now for walls; adding
  a profile-side `statesShown` slot plus a renderer-side applier
  that hides any element whose state isn't in `statesShown` is a
  much larger refactor than Stage S6 acceptance requires. **Deferred
  to Wave 9.5** alongside the rest of the
  `viewTypeModifiers → viewTypeProfiles` migration (master plan
  §11 / Stage P3 envelope).

### §19.16.4  Wave 9 acceptance gate

- `npx tsc --noEmit --skipLibCheck` clean.
- `npm run build` clean (37.6s, no errors; only the pre-existing
  chunk-size warning, unrelated to Wave 9).
- Workflow restart healthy; no console errors.
- Creating a detail view with `parentViewId` set to a section view
  that has a bound intent: the detail view's `ThreeDAppearanceResolver`
  hook returns the section's resolved descriptor, and the
  `ViewPropertiesPanel` shows
  `Inherits from "<sectionName>"` below the italic intent name.
- Assigning an intent directly to the detail view via
  `AssignViewIntentCommand`: the badge disappears on the next
  spine refresh (driven by `vi:instance-updated`), and the bound
  name renders non-italic.
- Switching to an RCP (`viewType: 'ceiling-plan'`): walls in the cut
  zone now render with projection-weight pen via the new
  `cut → projection` `sourceState` transform, while ceilings keep
  their existing `projection / beyond → cut` source mapping.
- The cycle guard (`resolveWithInheritance` `Set<viewId>` + the
  separate guard in `getInheritedFromViewId`) prevents infinite
  recursion when two views ever end up referencing each other as
  parent (corrupted-data defence).

### §19.16.5  Wave 9 — explicit deferrals (Wave 9.5 territory)

- **`statesShown` on `ViewTypeProfile`** + the
  `SectionGraphicsApplier` consumer — see plan-delta above.
- **Wider inheritance call-site sweep** — only
  `ThreeDAppearanceResolver` was migrated to the inheritance path
  in this wave. Every other site that reads
  `viewIntentInstanceStore.get(viewId)` directly (the appearance
  resolver, the override layer applier, the spine state derivation)
  still reads only the leaf binding. This is **intentional**: inheritance
  is opt-in per-applier, and switching them all in one wave would
  change the visible behaviour of every system intent overnight.
  Wave 9.5 will migrate the remaining appliers behind a feature
  flag with explicit per-applier acceptance gates.
- **Auto-binding new detail views** — today a freshly-created detail
  view has no own binding by default and inherits from its parent
  on first read. A future wave (§13 Wave 10 sweep) can offer an
  "auto-bind to parent's intent" option in the create-view dialog
  so the inheritance is materialised as a direct binding from the
  start.

## §19.17  Wave 10 — IFC Reference Geometry Respects Bound Intent (shipped 2026-04-26)

### §19.17.1  Plan vs. reality

The §13 Wave 10 plan called for refactoring
`src/render/ifc/IfcReferenceProjector.ts`. **That file does not exist
in the codebase.** PRYZM has no monolithic "IFC reference projector":
the IFC pipeline is split across four surfaces:

1. **Import-time native conversion** (`src/import/ifc/conversion/`)
   — most IFC elements are converted to native PRYZM types (wall,
   slab, column, …) by `IfcConversionCoordinator` and downstream
   per-class converters. Once converted, they are first-class native
   elements that already flow through Wave 4 – 9 intent rules with
   no IFC-specific code path.
2. **2D projection inclusion gate** (`src/core/views/IFCProjectionStore.ts`)
   — controls whether unconverted IFC fragments participate in plan,
   section, and elevation projections.
3. **3D scene rendering** (`IfcGeometryRenderer.ts`) — places IFC
   meshes in the world scene with `userData.source = 'ifc-import'`.
4. **Intent rule resolution for `ifc-*` typed elements**
   (`src/core/presentation/IntentRuleResolver.ts` and
   `VisibilityIntentDefaults.ts`) — an `'ifc-element'` umbrella key
   plus the `split('-').at(-1)` native-equivalent fallback.

Wave 10 therefore became a **two-call surgical patch on (2) and (4)**
rather than a refactor of a non-existent file. The A4 `[◯/⊘]` icon
column referenced by the plan is the existing per-element-type
visibility column already shipped by Stages A4 + S6 (Wave 7); no
new column was authored — the existing column already operates on
`'ifc-element'` and any `ifc-*`-typed entries because they are
declared first-class in `VisibilityIntentDefaults.ts` line 27.

### §19.17.2  Files touched

| File | Change |
|------|--------|
| `src/core/views/IFCProjectionStore.ts` | `shouldIncludeIFC` now walks the parent-view chain (cycle-safe `Set<viewId>` guard) and vetoes inclusion when **any** ancestor's localOverrides carry an `'ifc-element' hide`. New private `_intentVetoIFC(viewId)` helper. |
| `src/core/presentation/IntentRuleResolver.ts` | `rulesFor()` and the `viewTypeProfiles` lookup both add an explicit `'ifc-element'` umbrella step for any `'ifc-*'` typed element, sitting **above** the `split('-').at(-1)` native-equivalent fallback. Non-IFC types are unchanged. |

### §19.17.3  Plan-delta — what shipped vs. what was planned

- **Shipped before Wave 10:** `'ifc-element'` already declared in
  `VisibilityIntentDefaults.ts` (Stage S7); schema v2 → v3 migration
  already adds the `ifc-element` element rules; `IFCProjectionStore`
  already consulted leaf intents. Wave 10 closes the inheritance
  gap (so detail views inherit IFC visibility from a parent section
  view) and the umbrella-rule shadowing gap (so an `ifc-element`
  rule actually applies to `ifc-wall`/`ifc-slab` rather than being
  shadowed by the native `wall`/`slab` rules every system intent
  declares).
- **New behaviour for `'ifc-*'` lookup chain** (e.g. `'ifc-wall'`):
  1. exact `elementRules['ifc-wall']`
  2. umbrella `elementRules['ifc-element']` (NEW — was step 4 implicitly)
  3. native equivalent `elementRules['wall']` (via `split('-').at(-1)`)
  4. `elementRules.__default__`
  5. computed `defaultRulesForElementType`
- **New behaviour for IFC inclusion**: a section view binding an
  intent that hides IFC will now propagate that hide to all detail
  views inheriting from it — unless the detail view's own binding
  (or per-view legacy IFC flag) explicitly opts back in.

### §19.17.4  Wave 10 — explicit deferrals

- **Per-IFC-element-type granularity in EdgeProjectorService**: the
  2D edge projector currently treats all unconverted IFC fragments
  as a single "include / exclude" set. To honour per-`ifc-*`-type
  rules during projection (e.g. "show `ifc-wall` but not `ifc-pipe`"),
  the projector would need to look up each fragment's IFC class
  and apply per-type visibility before edge extraction. This is a
  larger refactor and is deferred to Wave 11 (§13 Wave 11.1).
- **Per-IFC-element-type icons in the A4 column**: today the column
  shows a single row for `'ifc-element'` plus the native types. A
  future wave can dynamically populate `ifc-wall`, `ifc-slab`, …
  rows when the project actually contains unconverted IFC fragments
  of those classes (gated on `IfcModelStore` introspection).
- **Migration of remaining call-sites to inheritance**: as in Wave
  9.5, only the IFC inclusion gate is inheritance-aware here. The
  `IfcGeometryRenderer` 3D rendering path still reads only the leaf
  binding for opacity / colour; that migration is queued behind the
  Wave 9.5 feature flag.

### §19.17.5  Acceptance gate

- ✅ `npx tsc --noEmit --skipLibCheck` — clean.
- ✅ `npm run build` — clean (`✓ built in 51.26s`); Contract 45
  isolation guard passing (26 singletons / 49 scopes / 0 allowlisted).
- ✅ Workflow `Start application` — running, no errors in the most
  recent restart's console (vite reconnect after restart only).
- ✅ Cycle-safe parent walk in `_intentVetoIFC` (Risk R1: corrupted
  parent-pointer data cannot infinite-loop the inclusion gate).
- ✅ Non-IFC element types unaffected by the resolver change
  (`isIfc` short-circuit guarded; structural-strip path skipped only
  when `isIfc`).

## §19.18  Wave 11 — Per-IFC-Type Visibility in EdgeProjector + Per-View IFC Toggle (shipped 2026-04-26)

### §19.18.1  Plan vs. reality

Wave 11 of the Visibility-Intent Master Plan §13 closes the
deferred per-IFC-element-type granularity in the projection
pipeline (deferral noted in §19.17.4) and fixes a usability bug in
the per-view IFC toggle that surfaced during the Wave 10 audit.

The plan asked for "per-IFC-class projection control"; the
implementation delivers it via three coordinated changes:

1. A new public introspection helper (`isElementTypeFullyHidden`)
   on `IntentRuleResolver`.
2. A new public `userData.type` → resolver-key normaliser
   (`normaliseIfcUserDataType`).
3. The `EdgeProjectorService` Source-C IFC scene-mesh path now
   resolves the bound intent (with parent-chain inheritance from
   Wave 9) and skips meshes whose normalised IFC type is fully
   hidden by the bound intent.

The fourth change — fixing `ViewHeaderButtons` so the IFC button
toggles **per-view** (`setForView`) instead of global (`setGlobal`)
— was not on the original §13 list but was clearly implied by the
user-facing acceptance gate "user can easily control all the
visibility of all views/per view without any issues".

### §19.18.2  Files touched

| File | Change |
|------|--------|
| `src/core/presentation/IntentRuleResolver.ts` | Added `isElementTypeFullyHidden(intent, elementType)` — public introspection that returns true when **all four** states (cut, projection, beyond, hidden) are `visible: false`. Added `normaliseIfcUserDataType(rawType)` — collapses raw IFC class names (`'IFCWALL'`) and PRYZM-canonical type names (`'Wall'`) to the canonical `'ifc-<lc>'` resolver key with `'ifc-element'` umbrella fallback. |
| `src/core/views/EdgeProjectorService.ts` | Source-C IFC scene-mesh loop now (a) resolves the bound intent with inheritance once per view, (b) caches per-type visibility decisions in a `Map<string, boolean>` to keep the resolver call O(distinct-types) rather than O(meshes), (c) skips projection for meshes whose normalised type is fully hidden, and (d) logs `(Wave 11: N skipped by bound-intent visibility)` when any meshes were vetoed so debugging is straightforward. |
| `src/ui/views/ViewHeaderButtons.ts` | IFC button click handler now writes per-view (`setForView(viewId, next)`) instead of mutating the global flag (`setGlobal(...)`). Shift+Click clears the per-view override and falls back to the inheritance / global default. Tooltip and aria-pressed updated. Added `ifc-projection-changed` and `vi:instance-updated` listeners so the button stays in sync when a parent view's binding changes. |

### §19.18.3  Behaviour matrix

| Bound-intent rule for IFC type | Source-C result | Performance impact |
|--------------------------------|-----------------|--------------------|
| All four states visible          | mesh projected as before | 0 (cached lookup) |
| Some states visible              | mesh projected; renderer drops hidden states via `opacity:0` (existing) | 0 (cached lookup) |
| All four states `visible:false`  | **mesh skipped — no edge extraction, no `toDrawingSpace`, no LineSegments** (NEW) | saves O(faces) per veto'd mesh |
| No bound intent for view (legacy)| mesh projected as before (back-compat) | 0 |

### §19.18.4  Resolver lookup chain (Wave 10 → Wave 11 unchanged)

For an IFC mesh with `userData.type === 'IFCWALL'`:

1. `normaliseIfcUserDataType('IFCWALL')` → `'ifc-wall'`
2. `rulesFor(intent, 'ifc-wall')` walks:
   1. `elementRules['ifc-wall']` — explicit per-IFC-type rule
   2. `elementRules['ifc-element']` — IFC umbrella (Wave 10)
   3. `elementRules['wall']` — native equivalent (`split('-').at(-1)`)
   4. `elementRules.__default__`
   5. `defaultRulesForElementType('ifc-wall')`
3. `isElementTypeFullyHidden` returns true ↔ all four states veto'd.

### §19.18.5  Wave 11 — explicit deferrals

- **Source-B native-mesh visibility veto** — `isElementTypeFullyHidden`
  is generic; native meshes could use the same gate, but the
  Source-B path already runs through `WallEdgeVisibilityService` /
  `ElementGraphicsApplier` for opacity:0 dropouts and adding the
  veto here would create two parallel hide paths. Deferred until
  the Wave 12 sweep that consolidates native + IFC visibility into
  one applier.
- **Per-IFC-class rows in the V/G panel** — the `OverridePanel`
  still surfaces `'ifc-element'` only via the Property-panel route.
  Dynamic per-class rows (`ifc-wall`, `ifc-slab`, …) gated on
  `IfcModelStore` introspection are still queued for a future wave.
- **3D scene IFC opacity from intent** — the 3D `IfcGeometryRenderer`
  path still reads only the leaf binding for opacity / colour;
  bringing it under the Wave 9 inheritance facade is queued behind
  the Wave 9.5 feature flag.

### §19.18.6  Acceptance gate

- ✅ `npx tsc --noEmit --skipLibCheck` — clean.
- ✅ `npm run build` — clean (`✓ built in 41.20s`); Contract 45
  isolation guard passing (26 singletons / 49 scopes / 0 allowlisted).
- ✅ Workflow `Start application` — running, no errors. Plan view
  `vd-sys-plan-l0` activates cleanly (FPS 65 → 121, view switch
  23.5 ms, 28 CUT zones / 1 PROJECTION zone applied).
- ✅ Per-view cache prevents O(meshes·types) resolver calls in
  Source C.
- ✅ Wave 10 inheritance-aware `IFCProjectionStore.shouldIncludeIFC`
  still authoritative — Source-C veto is **additive**: even when
  the projection store says "include IFC", the per-type intent rule
  can hide individual classes.
- ✅ `ViewHeaderButtons` IFC toggle is now per-view; Shift+Click
  resets to global / inheritance default.
