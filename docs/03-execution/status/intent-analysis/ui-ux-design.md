# PRYZM — Intent / Properties Panel UI/UX Design

**Document type:** UI/UX Design (visual specification)
**Date:** 2026-04-26
**Status:** Pre-implementation (design only — no code)
**Owner:** Views + Presentation subsystems
**Companion docs:**
- `docs/03-execution/status/intent-analysis/INTENT-AS-VIEW-PROPERTIES-ORCHESTRATION-LAYER.md` — architectural blueprint (the *what* and *why*).
- `docs/03-execution/status/intent-analysis/INTENT-USER-JOURNEYS.md` — task-driven user flows that this UI/UX must support.
- `docs/USER-GUIDE-VISIBILITY-INTENT.md` — end-user mental model.
- `docs/02-decisions/contracts/25b-VG-INTENT-FULL-CONSOLIDATION-PLAN.md` — system invariants (V/G is retired).

This document is the **visual specification** for every panel involved in editing the appearance of a view. Every layout below is annotated; every control is named; every interaction has a defined target. It is the source of truth for the front-end work in stages **P1–P3** (see the implementation plan) and the per-view-type accordion in **S3**.

There are **five surfaces** in scope:

| # | Surface | When it appears | Owner file (today) |
|---|---|---|---|
| 1 | **Properties Panel (per view)** | Always — right-hand dock when a view is selected in the View Browser. | `src/ui/ViewPropertiesPanel.ts` |
| 2 | **Intent Editor Panel (master Intent)** | Modal, opened from the spine "Open Intent Editor ▸" or from the global Intents shelf. | `src/ui/VisibilityIntentPanel.ts` |
| 3 | **Inline Intent Action Sheet** (Customise / Create / Detach / Pin / Promote / Bind) | Popover — anchored to the spine action button that triggers it. | new — `src/ui/dialogs/IntentActionSheet.ts` |
| 4 | **Element-Type Visibility Editor** (the "exclude furniture from RCP" surface) | Sub-panel inside the Intent Editor's view-type section, expandable from the rule matrix. | new — `src/ui/views/ViewTypeRuleMatrix.ts` |
| 5 | **Per-Element Appearance Editor** (the form where you set line weight, colour, fill, symbolic rule for one element type in one state) | Inline expansion of a matrix cell, or popover. | refactored from `renderAppearanceForm()` in `VisibilityIntentPanel.ts` |

This document covers all five.

---

## 0. Design language — common conventions

These conventions apply across all five surfaces. They ensure the user reads the same idioms wherever they go.

### 0.1 Source indicator (the most important affordance in this design)

Every value-bearing field has a **source pill** to its right showing where the value comes from. Source determines colour, lock state, and which actions are available.

```
 Field name           [ value ]   ⓘ Intent · Pure   ↻
 Field name           [ value ]   ⓘ Intent · Profile · plan   ↻
 Field name           [ value ]   ⓘ Intent · Purpose · construction-docs   ↻
 Field name           [ value ]   ⓘ Override (this view)   ↻
 Field name           [ value ]   ⓘ System default
```

| Pill | Meaning | Field colour | Lock |
|---|---|---|---|
| `Intent · Pure` | Value comes from `intent.elementRules[…]` (the base rule). | Black-on-white | Read-only when Intent is `system` |
| `Intent · Profile · plan` | Value comes from `intent.viewTypeProfiles.plan.elementRules[…]`. | Black-on-white | Read-only when Intent is `system` |
| `Intent · Purpose · construction-docs` | Value comes from a purpose modifier matched by `view.purpose`. | Black-on-white | Read-only when Intent is `system` |
| `Override (this view)` | Value comes from `viewIntentInstance.localOverrides`. Per-view. | Amber accent | Always editable |
| `System default` | No Intent is bound; built-in fallback. | Grey | Always editable; writes go to `localOverrides` |

The `↻` button reverts the field to its source-of-record default. For `Override (this view)` it removes the override entry; for an Intent-source field it re-fetches the Intent value (a no-op until the user has dirtied it).

### 0.2 The four binding-mode badges (spine)

Badges are **monochrome**. The four modes are distinguished by **typography** (small-caps label inside a thin border) and **status glyph** (a leading dot), never by hue. The dot is filled (●) for an active intent, hollow (○) for unbound.

```
┌──────────────────────────────────────────────────────────────┐
│ Bound: Architectural Documentation        [ SYSTEM · ⊟ ]     │
│ Status: ● Pure · v3 · pinned                                 │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Bound: My Construction Docs               [ USER ]           │
│ Status: ● Customised — 3 local overrides [view list]         │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Bound: My Custom Intent                   [ VIEW-LOCAL ]     │
│ Status: ● Forked · v1 · only this view uses it                │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Bound: — (no Intent)                      [ UNBOUND ]        │
│ Status: ○ Using system defaults                               │
└──────────────────────────────────────────────────────────────┘
```

### 0.3 Monochrome palette

The entire Intent surface is rendered in a **black-and-white palette** with two greys for inactive state. No hues. Emphasis is achieved through **type weight** and **border weight**, not colour. (Project-wide accent colour is reserved for selection / hover states only and never for source provenance.)

| Token | Value | Used for |
|---|---|---|
| `--vi-bg` | `#ffffff` (light) / `#0c0d10` (dark) | Panel background |
| `--vi-fg` | `#101114` (light) / `#f5f6f8` (dark) | Primary text |
| `--vi-fg-muted` | `#5b6068` | Secondary text, source-pill labels, source-default values |
| `--vi-border` | `#d0d3d8` (light) / `#2a2d33` (dark) | Section dividers, field borders |
| `--vi-border-strong` | `#101114` (light) / `#f5f6f8` (dark) | Override field borders, active button outline |
| `--vi-spine-bg` | `#f4f5f7` (light) / `#16181d` (dark) | Spine block background — one shade off panel bg |
| `--vi-locked-fg` | `#8a8e96` | Locked field text (when bound to a system Intent) |

**Source provenance is rendered through the source-pill's typographic style, not through colour:**

| Source | Visual | Notes |
|---|---|---|
| `Intent · Pure` | Small-caps label, `--vi-fg`, no border weight change | Default look |
| `Intent · Profile · plan` | Small-caps label with `· profile` suffix in `--vi-fg-muted` | Same weight as Pure |
| `Intent · Purpose · construction-docs` | Small-caps label with `· purpose` suffix | Same weight |
| `Override (this view)` | Small-caps label with **bold** weight + 2 px solid `--vi-border-strong` left edge on the field | The bold weight + thick left edge are the only visual emphasis used to flag a per-view override |
| `System default` | Small-caps label in `--vi-fg-muted` | Italic optional, never coloured |

### 0.4 Iconography

All icons are **monochrome line glyphs** rendered as 16 px SVG, stroke 1.25 px, in `currentColor` (so they pick up `--vi-fg` or `--vi-fg-muted` from context). **No colour emojis** — the table below shows ASCII / Unicode line-glyph approximations for documentation, but the production icons are SVG (Lucide / Phosphor / equivalent thin-line set).

| Icon | Glyph (doc) | Production form | Meaning |
|---|---|---|---|
| Lock | `⊟` | thin-outline padlock, monochrome | Field is read-only because Intent is `system`-scoped |
| Reset | `↻` | circular-arrow line glyph | Revert to source default |
| Open | `▸` | right-pointing chevron, line glyph | Navigate to a sub-panel or modal |
| Info | `ⓘ` | thin-circle with `i`, line glyph | Hover/click for source provenance |
| Pin | `⊙` | thin-outline pin (no fill, no shadow) | View is pinned to a specific Intent version |
| Diverged | `△` | thin-outline triangle (no fill) | Bound Intent has been updated since this view's pin |
| Plus | `+` | thin cross, line glyph | Add a new entry (rule, modifier, purpose, etc.) |
| Visible | `◯` | thin-outline circle | Element/category visibility — visible (default) |
| Hidden | `⊘` | thin-outline circle with diagonal slash | Element/category visibility — hidden in this view-type |
| External link | `↗` | small arrow north-east | Opens the Intent Editor in a new modal |
| Edit | `✎` | thin-outline pencil | Triggers an inline editor or popover |
| More | `⋯` | three dots horizontal | Discloses secondary actions |

The "Diverged" banner (when a bound Intent has advanced past this view's pinned version) uses the `△` icon plus thicker text weight on the message, never a coloured background.

### 0.5 Layout grid

- All sections use a 2-column grid: **label** (35% width) + **field + source pill + reset** (65% width).
- Sub-tables (the rule matrix in the Intent editor) use a third **state column** and a **per-cell** click target.
- Min panel width: 320 px (Properties dock). Modal min-width: 720 px (Intent editor).

---

## 1. Surface 1 — Properties Panel (per view)

### 1.1 Frame layout

```
┌─ PROPERTIES ───────────────────────────────────[ × ]┐
│  Header bar (sticky):                                │
│  ┌─────────────────────────────────────────────────┐│
│  │ ▢ GROUND FLOOR                            [⋯]  ││
│  │ plan · L0 · architecture · v 0.3.1               ││
│  │ ─────────────────────────────────────────────── ││
│  │ Intent: Architectural Documentation [↗ Edit]    ││  ← always-visible Intent shortcut
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  ┌─ 1. IDENTITY ─────────────────────────────────┐ │
│  ┌─ 2. VISIBILITY INTENT (spine) ────────────────┐ │
│  ┌─ 3. OUTPUT ───────────────────────────────────┐ │
│  ┌─ 4. VIEW RANGE ───────────────────────────────┐ │  ← shown for plan-family
│  ┌─ 5. CROP / SECTION BOX ───────────────────────┐ │
│  ┌─ 6. UNDERLAY ─────────────────────────────────┐ │  ← shown for plan / RCP
│  ┌─ 7. IFC REFERENCE ────────────────────────────┐ │
│  ┌─ 8. VIEW DESCRIPTION (AI grounding) ──────────┐ │
│  ┌─ 9. METADATA ─────────────────────────────────┐ │
│                                                     │
└─────────────────────────────────────────────────────┘
```

Notes:
- The **header bar** is sticky and always shows the bound Intent name with a one-click `[↗ Edit]` shortcut. This is the **shortest possible path** from "I'm looking at a view" to "I'm editing its Intent". The `↗` glyph is the standard "open in modal" affordance defined in §0.4.
- Sections are collapsible (click section title to collapse).
- Section visibility per view-type follows the matrix in `INTENT-AS-VIEW-PROPERTIES-ORCHESTRATION-LAYER.md` §3.
- The **View Template section is absent**. Per the orchestration doc §2.6, View Template is now folded into the Intent itself (specifically into a `viewSeed` block on the Intent record). The "create a view from a template" flow opens a "Create View from Intent" picker that selects an Intent and uses its `viewSeed` block to seed the new view's identity/scale defaults.

### 1.2 The spine — Visibility Intent block (the panel's centre of gravity)

The spine has a **primary action** — `[ ↗ OPEN INTENT EDITOR ]` — that is rendered as a **full-width, high-contrast button at the top of the block** in every binding mode. It is the panel's most prominent control. Combined with the always-visible `[↗ Edit]` shortcut in the header bar (§1.1) and the keyboard shortcut `I` (§5.4), the user has **three independent ways** to reach the Intent Editor at any moment.

**Mode 1 (bound to a system Intent):**

```
┌─ VISIBILITY INTENT ─────────────────────────────────┐
│  ┌─────────────────────────────────────────────────┐│
│  │  ↗  OPEN INTENT EDITOR                          ││  ← primary action, full-width
│  └─────────────────────────────────────────────────┘│
│                                                     │
│ Bound to:                                           │
│  ┌─────────────────────────────────────────────────┐│
│  │ ▾ Architectural Documentation     [ SYSTEM · ⊟]││
│  └─────────────────────────────────────────────────┘│
│  Used by 12 views · v3 (latest)                     │
│                                                     │
│ Status: ● Pure intent                               │
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Quick actions:                                  │ │
│ │  [ Customise (clone to user Intent) ]           │ │
│ │  More ⋯                                         │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

The "More ⋯" disclosure expands to:

```
│ │  [ Bind to a different Intent ▾ ]               │ │
│ │  [ Detach (use system defaults only) ]          │ │
│ │  [ ⊙ Pin to v3 ]                                 │ │
└─────────────────────────────────────────────────────┘
```

The Intent name itself is a **link** — clicking it opens the Intent Editor for that Intent (same target as the primary button). Hovering it underlines the text. This makes the name the fourth quick path to the editor.

**Mode 2 (bound to a user Intent):**

```
┌─ VISIBILITY INTENT ─────────────────────────────────┐
│  ┌─────────────────────────────────────────────────┐│
│  │  ↗  OPEN INTENT EDITOR                          ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│ Bound to:                                           │
│  ┌─────────────────────────────────────────────────┐│
│  │ ▾ My Construction Docs            [ USER ]     ││
│  └─────────────────────────────────────────────────┘│
│  Used by 4 views · v7                               │
│                                                     │
│ Status: ● Customised — 3 overrides in this view     │
│         [ Show overrides ▾ ]                        │
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │  [ Promote overrides → new Intent version ]     │ │
│ │  [ Edit Intent fields inline below ↓ ]          │ │
│ │  More ⋯                                         │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

Clicking **Show overrides** expands an inline list:

```
│  Overrides on this view:                            │
│   • Wall · cut · lineWeight: 0.5 → 0.7   [↻ revert] │
│   • Door · projection · symbolic:                   │
│     'plan-door-swing' → 'plan-door-arc'  [↻ revert] │
│   • Furniture (type) · hidden            [↻ revert] │
│   [ Clear all overrides ] [ Promote → new version ] │
```

**Mode 3 (view-local Intent):**

```
┌─ VISIBILITY INTENT ─────────────────────────────────┐
│  ┌─────────────────────────────────────────────────┐│
│  │  ↗  OPEN INTENT EDITOR                          ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│ Bound to:                                           │
│  ┌─────────────────────────────────────────────────┐│
│  │ ▾ Ground Floor Custom         [ VIEW-LOCAL ]   ││
│  └─────────────────────────────────────────────────┘│
│  Used by 1 view (this one) · v2                     │
│                                                     │
│ Status: ● Forked from "Architectural Documentation" │
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │  [ Promote to Shared Intent ]                   │ │
│ │  [ Edit Intent fields inline below ↓ ]          │ │
│ │  More ⋯                                         │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Mode 4 (unbound):**

```
┌─ VISIBILITY INTENT ─────────────────────────────────┐
│ Bound to: — (no Intent)               [ UNBOUND ]   │
│                                                     │
│ Status: ○ Using system defaults                     │
│         All values below are per-view overrides.    │
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │  [ Bind to an Intent ▾ ]                        │ │
│ │  [ Save current settings as new Intent ]        │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

In Mode 4, the primary button collapses (there is no Intent to edit). Binding to one or saving as one immediately reveals the primary `[ ↗ OPEN INTENT EDITOR ]` button.

### 1.3 Section example — Output (the split between sheet and graphics)

```
┌─ OUTPUT ────────────────────────────────────────────┐
│ Sheet output (per view)                             │
│  Scale (1:N)         [ 100 ]        ⓘ View-only     │
│                                                     │
│ Graphic style                                       │
│  Detail Level        [ Medium  ▾ ]  ⓘ Intent · Profile · plan   ↻ │
│  Display Model       [ Normal  ▾ ]  ⓘ Intent · Pure                ↻ │
│  Visual Style        [ shown only for 3D / render ]                  │
│  Shadows             [ shown only for 3D / render ]                  │
│                                                     │
│  [ Reset all graphic style to Intent ]              │
└─────────────────────────────────────────────────────┘
```

Hovering the `ⓘ` pill on Detail Level shows a tooltip:

```
  ┌─────────────────────────────────────────────────┐
  │ Source chain (from highest to lowest precedence)│
  │  ① Override (this view): —                      │
  │  ② Purpose · construction-docs: medium          │
  │  ③ Profile · plan: medium                       │
  │  ④ Intent base: medium                          │
  │  ⑤ System default: coarse                       │
  │  → Effective: medium                            │
  └─────────────────────────────────────────────────┘
```

This tooltip is the user's **debugger** for "why is this value what it is?". It appears identically on every Intent-resolved field across all five surfaces.

### 1.4 Section example — View Range (plan variant with row-level source)

```
┌─ VIEW RANGE ────────────────────────────────────────┐
│ Variant: four-bound (plan)                          │
│                                                     │
│ Top      Level [ Ground ▾ ] Off [ 3.0 m ]   ⓘ Intent · Profile · plan   ↻ │
│ Cut      Level [ Ground ▾ ] Off [ 1.2 m ]   ⓘ Intent · Profile · plan   ↻ │
│ Bottom   Level [ Ground ▾ ] Off [ 0.0 m ]   ⓘ Intent · Profile · plan   ↻ │
│ Depth    Level [ Ground ▾ ] Off [-1.2 m ]   ⓘ Override (this view)      ↻ │
│                                                     │
│ Below-level depth (intent-wide):                    │
│   1.20 m   ⓘ Intent · planViewRange · belowLevelDepth  ↻ │
│                                                     │
│ [ Reset all to Intent defaults ]                    │
└─────────────────────────────────────────────────────┘
```

The "Depth" row shows the override pill in amber; the others are Intent-sourced. One click on `↻` for the Depth row clears the override and reverts to `-1.5 m` (the Intent default). The "Below-level depth" row sits below; if the user has Mode-2 (user Intent) they can edit it directly; if Mode 1, it is locked.

### 1.5 Section example — Crop / Section Box

For plan / section / elevation:

```
┌─ CROP ──────────────────────────────────────────────┐
│ Crop Active        [ ☑ ]   ⓘ Intent · Profile · plan   ↻ │
│ Annotation Crop    [ ☐ ]   ⓘ Intent · Profile · plan   ↻ │
│ View Depth (m)     [ 25.0 ]   (section/elevation only)   │
│                                                          │
│ [ Edit Crop Region in viewport ▸ ]                       │
└──────────────────────────────────────────────────────────┘
```

For 3D / render, this section is replaced by **Section Box**:

```
┌─ SECTION BOX (3D AABB) ─────────────────────────────┐
│ Active             [ ☑ ]   ⓘ Override (this view)   ↻│
│ X min / max        [ -25.0 ] [ 25.0 ]   (m)          │
│ Y min / max        [   0.0 ] [ 12.0 ]   (m)          │
│ Z min / max        [ -25.0 ] [ 25.0 ]   (m)          │
│                                                     │
│ [ Capture from current viewport ]                   │
│ [ Reset to model bounds ]                           │
└─────────────────────────────────────────────────────┘
```

### 1.6 Section example — Underlay (plan / RCP only)

```
┌─ UNDERLAY ──────────────────────────────────────────┐
│ Use Underlay        [ ☑ ]   ⓘ Intent · Profile · plan   ↻ │
│ Base Level          [ Ground ▾ ]                          │
│ Top Level           [ — ▾ ]                               │
│ Orientation         [ Looking Down ▾ ]                    │
│   ⓘ Intent · Profile · plan default = Looking Down  ↻     │
│ Underlay Style      [ light grey, dashed ▸ ]              │
│   ⓘ Intent · Profile · plan                          ↻    │
└─────────────────────────────────────────────────────┘
```

Clicking "light grey, dashed ▸" opens a tiny popover that re-uses the Per-Element Appearance Editor (Surface 5) limited to the `line` group only.

### 1.7 Section example — IFC Reference

```
┌─ IFC REFERENCE GEOMETRY ────────────────────────────┐
│ Show in this view   [ ☑ ]   ⓘ Intent · Profile · plan   ↻ │
│ Render as           [ Beyond appearance ▾ ]               │
│   ⓘ Intent · Profile · plan                          ↻    │
└─────────────────────────────────────────────────────┘
```

### 1.8 Metadata extension (Intent provenance)

```
┌─ METADATA ──────────────────────────────────────────┐
│ Created By:        system                           │
│ Created:           2025-12-04 09:14                 │
│ Modified:          2026-04-26 10:14                 │
│ Version:           0.3.1                            │
│ ─────────────────────────────────────────────────── │
│ Bound Intent:      Architectural Documentation v3   │
│ Intent Pinned:     ☐ no   [⊙ pin to v3]            │
│ Last Intent Sync:  2026-04-26 10:14                 │
└─────────────────────────────────────────────────────┘
```

If the master Intent advances to v4 while this view is pinned to v3, a banner appears at the top of the spine:

```
┌─────────────────────────────────────────────────────┐
│ △ Bound Intent has a newer version (v4)             │
│   You are pinned to v3.                             │
│   [ Take v4 ] [ Stay pinned to v3 ]                 │
└─────────────────────────────────────────────────────┘
```

### 1.9 Quick paths to the Intent Editor (the "easy access" requirement)

Editing the Intent is the second-most-frequent task in the panel (after editing per-view overrides). The design therefore exposes **four independent affordances** that all open the same modal — pick whichever is closest to the user's current attention:

| # | Affordance | Where | Always visible? | When it's the right choice |
|---|---|---|---|---|
| 1 | **Header shortcut** — `Intent: <name> [↗ Edit]` | Sticky header bar of the Properties Panel (§1.1) | Yes — visible regardless of which section is scrolled into view | Default. The user's eye returns to the header constantly. |
| 2 | **Spine primary button** — `[ ↗ OPEN INTENT EDITOR ]` | Full-width, top-of-spine, in every binding mode (§1.2) | Yes (except Mode 4 / unbound) | When the user has just been reading the spine status (e.g. "3 overrides") and wants to fix it at the source. |
| 3 | **Intent name as link** | The Intent name in the spine binding row | Yes | Discoverability: the underline-on-hover invites a click on the name itself. |
| 4 | **Keyboard shortcut** `I` | When focus is in the Properties Panel (§5.4) | Yes | Power users. Pairs with `Esc` to close. |

A fifth indirect path exists: in any field whose source pill reads `Intent · Pure` or `Intent · Profile`, **clicking the source pill** opens the Intent Editor scrolled to that exact field. This is the "deep link" pattern documented in §5.1.

**Visual hierarchy rule:** the spine primary button (#2) is the **single highest-contrast control** in the entire Properties Panel — even more prominent than the binding-mode dropdown. This intentionally trains users to think of the Intent Editor as the "one click away" destination, and the Properties Panel itself as the "view-local overrides" surface. The cognitive split is preserved by the visual split.

**No accidental edits:** all four paths open the editor in *read mode* by default for `system`-scoped Intents (with a top-of-modal `[ Customise (clone to user Intent) ]` button) and in *write mode* for `user` and `view-local` Intents. The user is never one click away from accidentally mutating a system Intent.

---

## 2. Surface 2 — Intent Editor Panel (master Intent editor)

The Intent Editor is **modal** (not a side dock). It occupies the centre of the viewport when opened. It edits a single Intent at a time.

### 2.1 Frame layout

```
┌─ Intent Editor: Architectural Documentation (system) ─[ × ]┐
│  ┌─ Intent metadata ────────────────────────────────────┐ │
│  │ Name:        [ Architectural Documentation ]        │ │
│  │ Description: [ Default documentation intent ... ]   │ │
│  │ Scope:       SYSTEM ⊟  Version: v3  Used by 12 views│ │
│  │ Actions:     [ Duplicate to user Intent ]           │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌─ Per-view-type sections (accordion) ────────────────┐ │
│  │ [ Plan ] [ RCP ] [ Structural ] [ Section ] [ Elev ]│ │
│  │ [ Detail ] [ 3D ] [ Analysis ] [ Render ]            │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  Active section: ▌PLAN▐                                    │
│                                                            │
│  ┌─ Element rules (matrix) ─────────────────────────────┐ │
│  │   <see §2.2 below>                                    │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌─ View Range defaults (plan family) ─────────────────┐ │
│  ┌─ Crop defaults ─────────────────────────────────────┐ │
│  ┌─ Underlay defaults ─────────────────────────────────┐ │
│  ┌─ Output defaults ───────────────────────────────────┐ │
│  ┌─ IFC reference defaults ────────────────────────────┐ │
│  ┌─ Symbolic rules ────────────────────────────────────┐ │
│  ┌─ Purpose modifiers (apply across all view types) ───┐ │
│                                                            │
│  Footer:                                                   │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Bumped to v4 on save · 3 unsaved changes             │ │
│  │  [ Discard changes ]                  [ Save → v4 ] │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

The accordion at the top is the **per-view-type** navigation. Selecting one re-renders all sections below it through that view-type's profile (the matrix uses `viewTypeProfiles[active].statesShown` etc.).

For a **system Intent** (scope: system), every editable field is locked with a lock icon and the entire footer reads:

```
│  System Intents are read-only. [ Duplicate to user Intent ]│
```

### 2.2 The element-rule matrix (the most important sub-surface)

This is where 90% of Intent authoring happens. Layout is a table:

- **Rows**: element types (Wall, Slab, Column, Beam, Door, Window, Stair, Railing, Roof, Ceiling, Furniture, Lighting, MEP, Annotation, IFC, Custom).
- **Columns**: states applicable to the active view type (`statesShown` from the profile).

For PLAN the columns are `cut · beyond · projection · hidden`:

```
                       cut       beyond    projection  hidden    visibility
                      ─────     ──────    ──────────  ──────    ──────────
  Wall                ▣ 0.7    ▢ 0.18    ▣ 0.25      ◌ off     [◯ visible]
  Slab                ▣ 0.5    ▢ 0.18    ▢ 0.25      ◌ off     [◯ visible]
  Column              ▣ 0.5    ▢ 0.18    ▣ 0.25      ◌ off     [◯ visible]
  Beam                ▢ 0.35   ▢ 0.18    ▢ 0.25      ◌ off     [◯ visible]
  Door                ▢ 0.18   —         ▣ symbolic   ◌ off    [◯ visible]
  Window              ▢ 0.18   —         ▣ symbolic   ◌ off    [◯ visible]
  Stair               ▣ 0.5    ▢ 0.18    ▢ 0.25      ◌ off     [◯ visible]
  Railing             ▢ 0.18   ▢ 0.18    ▢ 0.25      ◌ off     [◯ visible]
  Roof                ▢ 0.18   ▢ 0.18    ▢ 0.25      ◌ off     [◯ visible]
  Ceiling             —        ▢ 0.18    ▢ 0.25      ◌ off     [◯ visible]    ← demoted in plan
  Furniture           —        —          ▢ 0.18      ◌ off     [◯ visible]
  Lighting            —        —          ▢ 0.18      ◌ off     [◯ visible]
  MEP                 —        —          ▢ 0.18      ◌ off     [◯ visible]
  Annotation          —        —          ▣ 0.18      ◌ off     [◯ visible]
  IFC reference       —        —          ▢ 0.18      ◌ off     [◯ visible]
  + Add element type  …
```

Cell legend:
- `▣` heavy line (≥ 0.5 mm) — bold border in the cell
- `▢` thin line — regular border
- `◌ off` not visible in this state
- `—` not authored (uses inherited rule from base or default)
- The number is the line weight in mm; clicking the cell opens the **Per-Element Appearance Editor** (Surface 5).
- The **visibility column** on the right is the **element-type visibility toggle** — see §2.3.

### 2.3 Element-Type Visibility column (the "exclude furniture from RCP" surface)

The right-most column of the matrix is the **visibility toggle** for that element type in this view-type's profile. Clicking the eye icon toggles the element type's `visible` flag at the profile level.

```
  Furniture           …            [◯ visible]   ← click here…
                                       ↓
  Furniture           …            [⊘ hidden]   ← element type now excluded from RCP
```

When `[⊘ hidden]` is set, every cell in that row is greyed out and a tooltip on the row reads:

```
  ┌─────────────────────────────────────────────────────┐
  │ Furniture is hidden in RCP views by this Intent.    │
  │ → Source: viewTypeProfiles['ceiling-plan']          │
  │           .elementRules.furniture.visible = false   │
  │ Click the ◯/⊘ icon to re-enable.                     │
  └─────────────────────────────────────────────────────┘
```

This is the **canonical "exclude an element type from a view type"** workflow. It is the AEC equivalent of Revit's "Categories > Visibility" checkbox in V/G overrides — but driven by the Intent system per Contract 25b.

For **per-element** visibility (hide one specific wall instance in one specific view), the user uses the **Override Layer** (`localOverrides.visibilityOverrides`), reached via the on-canvas Hide/Isolate toolbar — not this surface. The Intent matrix is for **type-level** decisions only.

### 2.4 View Range defaults section (Intent profile)

```
┌─ View Range defaults — plan ────────────────────────┐
│ Top default:    Level [ This Level ▾ ] + [ 3.00 m ] │
│ Cut default:    Level [ This Level ▾ ] + [ 1.20 m ] │
│ Bottom default: Level [ This Level ▾ ] + [ 0.00 m ] │
│ Depth default:  Level [ This Level ▾ ] + [-1.20 m ] │
│ Below-level depth (Intent-wide): [ 1.20 m ]         │
│ ↳ Used to project structure below the cut plane     │
│   as 'beyond' linework.                             │
└─────────────────────────────────────────────────────┘
```

For RCP, the labels are reversed (Bottom=ceiling cut datum, Top=above ceiling), and a tooltip explains the inversion.

For Section the section becomes:
```
┌─ View Range defaults — section ─────────────────────┐
│ Far clip default: [ 25.00 m ]                       │
│ ↳ Distance past the cut plane that elements project │
│   as 'beyond' linework.                             │
└─────────────────────────────────────────────────────┘
```

For Elevation: `Far clip default: [ 50.00 m ]`.

For Detail: section is hidden — the profile reads `kind: 'inherit'`.

For 3D: section is hidden — the profile reads `kind: 'none'`.

### 2.5 Symbolic Rules section

```
┌─ Symbolic rules — plan ─────────────────────────────┐
│ Door                  [ plan-door-swing ▾ ]         │
│ Window                [ plan-window-cased ▾ ]       │
│ Stair                 [ plan-stair-arrow ▾ ]        │
│ Plumbing fixture      [ none ▾ ]                    │
│ Custom symbol         [ + Add ]                     │
└─────────────────────────────────────────────────────┘
```

For RCP the suggested defaults differ: doors typically have no plan symbol, lighting fixtures get `rcp-light-symbol`.

### 2.6 Purpose Modifiers section (cross-cutting)

This section sits below the per-view-type sections and is **not** filtered by the active section.

```
┌─ Purpose modifiers ─────────────────────────────────┐
│ When a view's purpose is "construction-docs":       │
│  ┌─────────────────────────────────────────────────┐│
│  │ Wall · cut · lineWeight × 1.5 → ▣ 1.05 mm        ││
│  │ Slab · cut · fill colour: hatch 'concrete'       ││
│  │ Door · projection · halftone                     ││
│  │ [ + Add patch ]                                  ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│ When a view's purpose is "design-review":           │
│  ┌─────────────────────────────────────────────────┐│
│  │ All elements · projection · opacity 0.6          ││
│  │ Furniture · projection · fill colour: pastel     ││
│  │ [ + Add patch ]                                  ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│ [ + Add purpose ]                                   │
└─────────────────────────────────────────────────────┘
```

Each purpose is a collapsible card. Adding a patch opens the Per-Element Appearance Editor (Surface 5) in "patch-only" mode (only changed fields are saved).

---

## 3. Surface 3 — Inline Intent Action Sheet

This is a **popover** anchored to the Visibility Intent spine action button. It contains the small modal forms required for binding-mode transitions. Five flavours:

### 3.1 Customise (Mode 1 → Mode 2)

```
┌─ Customise this view's Intent ──────────────────────┐
│ This will create a personal copy of                 │
│ "Architectural Documentation" that only your views  │
│ will see. The original system Intent stays intact.  │
│                                                     │
│ Name:         [ My Architectural Documentation  ]  │
│ Description:  [ Cloned from system on 26 Apr ... ] │
│ Apply to:     ( ) Just this view                   │
│               (●) This view + 0 other views I       │
│                   currently have bound to system    │
│                                                     │
│ [ Cancel ]                  [ Create user Intent ]  │
└─────────────────────────────────────────────────────┘
```

### 3.2 Make View-Local (Mode 2 → Mode 3)

```
┌─ Fork this Intent to a view-local copy ─────────────┐
│ This will create a private Intent used only by      │
│ "GROUND FLOOR". Other views bound to "My            │
│ Construction Docs" will not be affected by your     │
│ edits.                                              │
│                                                     │
│ Private Intent name:                                │
│   [ Ground Floor Custom                          ]  │
│                                                     │
│ [ Cancel ]                          [ Fork Intent ] │
└─────────────────────────────────────────────────────┘
```

### 3.3 Save current as Intent (Mode 4 → Mode 2)

```
┌─ Save this view's settings as an Intent ────────────┐
│ Captures all current per-view fields and saves them │
│ as a reusable Intent. After save, this view will be │
│ bound to the new Intent.                            │
│                                                     │
│ Name:         [ Untitled Intent                  ] │
│ Description:  [ Created from Ground Floor on 26 ... │
│ Scope:        (●) User Intent (visible everywhere) │
│               ( ) View-local (private to this view)│
│ Base from:    [ — (start fresh from defaults) ▾ ]   │
│                                                     │
│ [ Cancel ]                       [ Create Intent ]  │
└─────────────────────────────────────────────────────┘
```

### 3.4 Promote to Shared (Mode 3 → Mode 2)

```
┌─ Share this Intent with the project ────────────────┐
│ "Ground Floor Custom" is currently view-local.      │
│ Sharing makes it visible in every view's Intent     │
│ picker.                                             │
│                                                     │
│ New name:     [ Ground Floor Custom              ]  │
│ Visibility:   (●) Whole project                    │
│               ( ) Discipline only                   │
│                                                     │
│ [ Cancel ]                       [ Share Intent ]   │
└─────────────────────────────────────────────────────┘
```

### 3.5 Bind to (Mode 4 → Mode 1/2)

```
┌─ Bind this view to an Intent ───────────────────────┐
│ ┌─ Search ────────────────────────────────────────┐ │
│ │ [ arch                                       ⌕ ]│ │
│ └──────────────────────────────────────────────────┘ │
│                                                     │
│ System Intents:                                     │
│  ○ Architectural Documentation     [system]         │
│  ○ Architectural Presentation      [system]         │
│                                                     │
│ User Intents:                                       │
│  ○ My Construction Docs             [user]          │
│  ○ Tender Set 2026                  [user]          │
│                                                     │
│ ☐ Take Intent's defaults for unset fields            │
│   (vs. keep my current per-view values as overrides) │
│                                                     │
│ [ Cancel ]                                  [ Bind ]│
└─────────────────────────────────────────────────────┘
```

The "Take Intent's defaults vs keep my values" checkbox is critical: it determines whether binding **clears** the current per-view values or **converts** them into local overrides.

---

## 4. Surface 4 — Per-Element Appearance Editor (cell editor)

This is the form that opens when the user clicks any cell in the rule matrix. It edits one `ElementStateAppearance` for one `(elementType, state)` pair within the active view-type profile.

### 4.1 Layout

```
┌─ Edit appearance — Wall · cut · plan profile ───────┐
│                                                     │
│  Visibility            [ ☑ Visible ]                │
│                                                     │
│  ── Line ──────────────────────────────             │
│  Line Weight (mm)      [ 0.70 ]   slider [▬▬▬▬▬▬▬◯▬▬]│
│  Line Colour           [ #000000 ▢ ]               │
│  Line Opacity          [ 1.00 ]   slider             │
│  Line Style            [ Solid ▾ ] (solid/dashed/   │
│                                    dotted/long-dash)│
│                                                     │
│  ── Fill ──────────────────────────────             │
│  Fill Style            [ Solid ▾ ] (solid/hatch/    │
│                                    none)             │
│  Fill Colour           [ #000000 ▢ ]   ← P9-01 add │
│  Fill Opacity          [ 1.00 ]   slider             │
│                                                     │
│  ── Symbolic ──────────────────────────             │
│  Symbolic Rule         [ none ▾ ]                   │
│                                                     │
│  ── Three-Dimensional (only for 3D / render) ──     │
│  Surface Colour        [ #d4c5b0 ▢ ]               │
│  Edge Colour           [ #333333 ▢ ]               │
│  Edge Weight (mm)      [ 0.18 ]                     │
│  Transparency          [ 0.00 ]                     │
│                                                     │
│  ── Provenance ────────────────────────             │
│  ⓘ Source chain                                     │
│   ① Override (this view): —                          │
│   ② Purpose · construction-docs: weight × 1.5       │
│   ③ Profile · plan: weight 0.5, fill solid #888    │
│   ④ Intent base: weight 0.5                          │
│   ⑤ System default: weight 0.35                     │
│   → Effective: weight 0.75 mm, fill #888888         │
│                                                     │
│  [ Reset to inherited ]   [ Cancel ]    [ Apply ]   │
└─────────────────────────────────────────────────────┘
```

### 4.2 Group hide/show

The four groups (Line / Fill / Symbolic / Three-Dimensional) are conditionally rendered based on the active view-type profile's `statesShown` and a few feature flags:
- `Three-Dimensional` group only appears when the active view-type is `3d` or `render`.
- `Symbolic` group only appears when the element type supports symbolic rules (Door, Window, Stair, Plumbing) AND the state is `projection` or `cut`.
- `Fill` group is hidden for `Annotation` element type (annotations are line-only).

### 4.3 Mass-edit affordance

A small "..." menu in the upper-right of the editor offers:

```
┌─────────────────────────────────────┐
│ • Apply to all states (cut/beyond/  │
│   projection/hidden) for this elem  │
│ • Apply to all element types (this  │
│   state)                             │
│ • Copy as patch to clipboard         │
│ • Paste patch from clipboard         │
└─────────────────────────────────────┘
```

"Apply to all states" is the canonical "make all wall lines blue 5mm" workflow shortcut.

---

## 5. Cross-surface interactions

### 5.1 The "deep link" pattern

Every source pill in the Properties panel is **clickable**. Clicking it opens the Intent Editor scrolled to the exact field that produced the value:

```
  Properties Panel                       Intent Editor
  ┌─────────────────────────┐            ┌─────────────────────────┐
  │ Detail Level [Medium ▾] │  click ⓘ  │ Active section: ▌PLAN▐  │
  │      ⓘ Intent · Profile │  ───────► │ Output defaults:         │
  │        · plan        ↻  │            │  Detail Level: [Medium] │
  └─────────────────────────┘            │  ◀── jumped here        │
                                         └─────────────────────────┘
```

This is the discoverability mechanism that lets users navigate from "what they see" to "where it comes from" in one click.

### 5.2 The "scope confirmation" dialog (Mode 2 + edits)

When a user edits an Intent field in the Properties panel under Mode 2 (user Intent shared with other views), a confirmation toast appears the first time per session:

```
  ┌─────────────────────────────────────────────────────┐
  │ △ This change affects 4 views bound to "My         │
  │   Construction Docs". Apply globally?               │
  │                                                     │
  │  [ Yes, apply to all 4 views ]                      │
  │  [ Apply to this view only (creates an override) ] │
  │  [ Cancel ]                                         │
  └─────────────────────────────────────────────────────┘
```

This protects against accidental fan-out of edits. After dismissing once, the user's choice (apply globally vs override) becomes the session default; a small status pill at the top of the spine reads "Edits → all 4 views ▼" with a click target to switch.

### 5.3 Multi-select (rule matrix)

In the Intent Editor's rule matrix, the user can **shift-click** multiple cells (across rows or columns) and edit them as a batch. The Per-Element Appearance Editor then shows multi-value fields with a `(varies)` placeholder:

```
  Line Weight (mm)      [ (varies)        ]   slider
  Line Colour           [ ▣ varies — pick ▾ ]
```

Setting a value applies it to every selected cell. This is how the user makes "every cell in the cut column black" in one action.

### 5.4 Keyboard shortcuts

| Shortcut | Surface | Action |
|---|---|---|
| `I` | Anywhere | Open Intent Editor for the active view's bound Intent |
| `Shift + I` | Anywhere | Open Intent Editor for `none` (master view) |
| `R` | Properties panel | Reset all overrides on the focused section |
| `Cmd/Ctrl + D` | Intent Editor | Duplicate active Intent |
| `Cmd/Ctrl + S` | Intent Editor | Save changes (bumps version) |
| `Esc` | Any popover/modal | Close without saving |

---

## 6. Responsive / overflow behaviour

| Width | Properties Panel | Intent Editor | Action Sheet |
|---|---|---|---|
| `≥ 1280 px` | Side dock 320 px | Centred modal 920 px | Anchored popover 360 px |
| `768–1279 px` | Side dock 280 px | Centred modal 720 px | Anchored popover 320 px |
| `< 768 px` | Bottom sheet, full-width | Full-screen modal | Bottom sheet, full-width |

Long Intent names truncate with ellipsis; full name on tooltip. The view-type accordion in the Intent Editor wraps to two rows below 720 px width.

---

## 7. Accessibility

- All source pills carry an `aria-label` of the full source chain (the same content the tooltip shows).
- All `↻` reset buttons carry an `aria-label` of `"Reset {fieldName} to {sourceLabel} default"`.
- Lock icons have `aria-hidden="true"`; the read-only state is communicated via `aria-readonly="true"` on the field.
- The rule matrix is implemented as `<table role="grid">` with proper row/column headers; keyboard navigation supports `Tab` between cells and `Space/Enter` to open the cell editor.
- Colour pickers expose a hex text input alongside the swatch for users who cannot use the visual picker.
- The four binding-mode badges use both colour and label (never colour alone) to distinguish modes.

---

## 8. Animations / transitions

- Section collapse/expand: `200 ms ease-out`.
- Source pill hover tooltip: fade-in `120 ms`, fade-out `60 ms`.
- Modal open: scale `0.96 → 1.0`, opacity `0 → 1`, `180 ms`.
- Spine status badge transitions (Pure → Customised on first override): pulse the badge once for `400 ms` to draw attention.
- Row reset (`↻`): the row briefly highlights `--vi-source-intent` for `300 ms`.

No long animations; the panel is meant to feel fast.

---

## 9. Implementation file map (forward-looking)

| Surface | Owner file (today) | Owner file (after restructure) |
|---|---|---|
| Properties Panel frame | `src/ui/ViewPropertiesPanel.ts` | `src/ui/ViewPropertiesPanel.ts` (refactored) |
| Properties Panel sections | inline | `src/ui/property-panel/sections/{Identity,IntentSpine,Output,ViewRange,Crop,Underlay,IFC,Description,Metadata}.ts` |
| Source pill component | — | `src/ui/components/SourcePill.ts` (new) |
| Intent Editor frame | `src/ui/VisibilityIntentPanel.ts` | `src/ui/VisibilityIntentPanel.ts` (rewritten) |
| Per-view-type accordion | — | `src/ui/views/ViewTypeAccordion.ts` (new) |
| Rule matrix | inline JSON editor | `src/ui/views/ViewTypeRuleMatrix.ts` (new) |
| Per-Element Appearance Editor | `renderAppearanceForm()` inline | `src/ui/views/ElementAppearanceEditor.ts` (extracted) |
| Action Sheet (5 variants) | — | `src/ui/dialogs/IntentActionSheet.ts` (new) |
| Config table (matrix from §3 of the orchestration doc) | — | `src/ui/views/ViewTypePropertiesPanelConfig.ts` (new — single source of truth) |
| Source chain resolver | `IntentRuleResolver.ts` (returns appearance) | extended with `resolveWithSourceChain()` returning `{ value, sources: [...] }` |

---

## 10. Conclusion

This UI/UX design provides one consistent visual language across five surfaces:

1. **Source pills** make every value's provenance visible.
2. **Reset buttons** give one-click revert per row.
3. **Lock icons** signal read-only state without disabling the field outright.
4. **The four binding-mode badges** make the Intent's relationship to this view explicit.
5. **The deep-link pattern** lets users go from a value in the Properties panel to its origin in the Intent editor in one click.
6. **The rule matrix with a visibility column** is how users exclude entire element types from a view type ("furniture out of RCP").
7. **The Per-Element Appearance Editor** is where line weight / colour / fill / symbolic / surface 3D values are edited, with multi-state and multi-element batch operations.

The next document, `INTENT-USER-JOURNEYS.md`, walks the user through specific tasks against this UI/UX so that any gap between "the user can do X" and "the UI lets them do X" surfaces concretely.
