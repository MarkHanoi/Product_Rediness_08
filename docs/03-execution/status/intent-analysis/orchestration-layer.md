# PRYZM — Visibility Intent as the Single Orchestration Layer for All View Properties

**Document type:** Deep Analysis + Implementation Plan
**Date:** 2026-04-26
**Status:** Pre-implementation (design only — no code changes)
**Owner:** Views + Presentation subsystems
**Author:** Architectural analysis pass following the Properties-Panel screenshots of 2026-04-26

**Source documents (read first if you have not):**
- `docs/USER-GUIDE-VISIBILITY-INTENT.md` — end-user mental model and workflows for the Intent system.
- `docs/02-decisions/contracts/25-VISIBILITY-INTENT-SYSTEM-CONTRACT.md` — canonical contract; the four-layer architecture and the rendering equation.
- `docs/02-decisions/contracts/25b-VG-INTENT-FULL-CONSOLIDATION-PLAN.md` — the six-Wave plan that retires V/G as a parallel system and makes Intent the sole authority.
- `docs/03-execution/status/intent-analysis/INTENT-PANEL-GAPS-AND-VIEW-TYPE-SPECIFICITY.md` — Phase-9 gaps (fill colour, view-type modifier UI, view purpose).
- `docs/01_ELEMENTS/03_VIEWS/09_VIEW_INTENT_SYSTEM_DEEP_ANALYSIS.md` — per-view-type semantic palette and header-surface mapping.
- `docs/01_ELEMENTS/03_VIEWS/10_VIEW_INTENT_SYSTEM_IMPLEMENTATION_PLAN.md` — eight-stage engineering schedule (S1–S8).

This document slots between contract 25b (system invariants) and doc 10 (engineering schedule). It reframes the question from *"how do we retire V/G?"* (answered by 25b) and *"how should the Intent editor look?"* (answered by docs 09/10) into a third, user-facing question:

> **"How does the per-view Properties panel become the orchestration cockpit for the Intent system, given that V/G has been retired?"**

The screenshots attached on 2026-04-26 (`GROUND FLOOR` view properties panel — Identity, V/G Settings, Visibility Intent, View Template, Output, View Range, Crop, Underlay, AI Intent, Metadata) are the concrete artefact this document analyses and re-architects.

---

## 0. Executive summary

1. **The user's request, restated.** Visibility Intent is the orchestration layer for *everything* a view shows: line/fill rules, surface colour, detail level, view range, depth, crop, underlay, IFC reference, even visual-style and shadow flags. The Properties panel today still presents many of those settings as if they were view-local. After Contract 25b retires V/G, the Properties panel must become the cockpit that lets the user reach every one of them through a **single Intent-aware spine**, regardless of whether the view is **bound to a system Intent**, **bound to a user Intent**, **bound to a freshly-created inline Intent**, or **unbound (no Intent)**.

2. **The user's hard requirement, restated.** Every control in the Properties panel must work in **all four binding modes**:
   - **Bound (system Intent)** — read-only Intent fields show inherited values; per-view fields remain editable; "Customise" promotes the view to a user Intent.
   - **Bound (user Intent)** — Intent fields editable in-place; edits propagate to every other view sharing that Intent.
   - **Bound (view-local Intent)** — a private Intent exists for this view only; edits are isolated.
   - **Unbound** — the view falls back to system defaults; the panel shows every Intent-managed field as a per-view override.

3. **The architectural shift.** Today, view-type specificity lives in `ViewDefinition` (e.g. `viewRange` only meaningful for plans, `sectionBox` only for 3D, `crop.farClip` only for section/elevation). Intent today is view-type-agnostic — `elementRules` apply uniformly. The shift required by this analysis: **the Intent record carries a per-view-type rule profile** (`intent.viewTypeProfiles[viewType]`), and the Properties panel renders **only the controls that belong to the active view's `viewType`**, sourced from those profiles. This unifies what doc 09 §2.4 already calls the "per-view-type matrix."

4. **The fate of every section in the screenshots.** Mapping is in §4. Short version:

   | Screenshot section | Fate |
   |---|---|
   | Identity (Name, ViewType, Discipline, Purpose, Phase Filter) | **Stays** in `ViewDefinition`, view-local. *Purpose* now drives an Intent purpose-modifier (already wired). |
   | **V/G Settings (Template + Rules + "Open Intent Settings")** | **Removed** — orphan from the V/G era. Replaced by the Visibility Intent block. The Open-Intent-Settings button collapses into the Intent editor link. |
   | **Visibility Intent (Intent dropdown + Intent State + "Open Intent Editor")** | **Promoted** to the panel's spine. Adds: bind/unbind toggle, "New Intent from this view", "Make view-local", purity badge. |
   | View Template | **Removed — absorbed into Intent.** Earlier draft kept this as a peer of Intent; on second look the four payloads (identity defaults, scale, locked-fields, V/G binding) all naturally belong on the Intent itself. New `intent.viewSeed` block carries them. The "Create View from Template" flow becomes "Create View from Intent". See §2.6.1 and §4.4. |
   | **Output (Scale, Detail Level, Visual Style, Display Model, Shadows)** | **Split** — Scale stays per-view (sheet output). Detail Level, Visual Style, Display Model, Shadows move into the Intent's per-view-type profile (Intent decides "how detailed should *plans* render in this Intent"); the per-view Output card becomes a thin override surface. |
   | **View Range (Top, Cut, Bottom, Depth)** | **Becomes Intent-derived per-view-type**. Plan/RCP/Structural-Plan use the four-bound form sourced from `intent.viewTypeProfiles.plan.viewRange` with a per-view delta. Section/Elevation get a "Cut + Far" variant. 3D hides the section. |
   | **Crop (Crop Active, Annotation Crop, View Depth)** | **Stays per-view** for crop region (geometry, not graphics). The boolean toggles (active / annotation) move into the Intent profile so an Intent like "Construction Documents" can default `cropActive = true` for plan views. |
   | **Underlay (Base Level, Top Level, Orientation)** | **Stays per-view** for level pickers (referential to project levels), but the Intent profile owns *whether* underlays are enabled, *what styling* the underlay layer uses, and *which orientation* the discipline expects (e.g. RCP defaults to "Looking Up"). |
   | **AI Intent (the natural-language "Intent (used by AI)" textarea)** | **Renamed** to "View Description (AI hint)" to disambiguate from Visibility Intent. The free-text field is per-view, but the panel also surfaces the bound Visibility Intent's `description` read-only above it for AI grounding. |
   | Metadata (Created By, Created, Modified, Version) | **Stays** — pure audit. Adds: "Bound Intent version / pinned?" row to capture intent drift. |

5. **The retirement of V/G.** The "V/G Settings" card in screenshot 2 is a relic. Per Contract 25b §2.4, the legacy `vgTemplateId` field is `@deprecated` on `ViewDefinition`, and the only legitimate visibility surface is the Intent system. This document removes the V/G Settings card from the panel and folds its three controls (Template picker, Rules count, "Open Intent Settings" button) into the Visibility Intent block, where they belong.

---

## 1. Current state — what the screenshots show

The `GROUND FLOOR` view (a plan view, see Identity → View Type → "plan") has **ten panel sections** in the screenshots:

```
┌─────────────────────────────────────────────────────────────┐
│ Header:   GROUND FLOOR                                      │
├─────────────────────────────────────────────────────────────┤
│ 1. IDENTITY        Name | View Type | Discipline | Purpose  │
│                    | Phase Filter                            │
│                                                             │
│ 2. V/G SETTINGS    Template (none) | Rules: 0 attached      │  ← LEGACY (delete)
│                    [ Open Intent Settings ▸ ]               │
│                                                             │
│ 3. VISIBILITY      Visibility Intent: Architectural Doc...  │
│    INTENT          Intent State: Pure intent                 │
│                    [ Open Intent Editor ▸ ]                  │
│                                                             │
│ 4. VIEW TEMPLATE   View Template: (none) | Sync State        │  ← LEGACY (delete — see §4.4, absorbed into Intent)
│                                                             │
│ 5. OUTPUT          Scale | Detail Level | Visual Style |     │
│                    Display Model | Shadows                   │
│                                                             │
│ 6. VIEW RANGE      Top (Level + Offset)                      │
│                    Cut (Level + Offset)                      │
│                    Bottom (Level + Offset)                   │
│                    Depth (Level + Offset)                    │
│                    [ ↻ Reset to Level Defaults ]             │
│                                                             │
│ 7. CROP            Crop Active | Annotation Crop             │
│                                                             │
│ 8. UNDERLAY        Base Level ID | Top Level ID | Orientation│
│                    [ Save Underlay ]                         │
│                                                             │
│ 9. AI INTENT       Intent (used by AI): "Default ground     │
│                    floor plan — system default."             │
│                                                             │
│ 10. METADATA       Created By: system | Created | Modified   │
│                    | Version                                 │
└─────────────────────────────────────────────────────────────┘
```

Two **modal screenshots** also appear:

- The **Visibility Intents editor** (`VisibilityIntentPanel.ts`, current Phase-7 UI). Four flat tabs across the top: **Element Rules**, **View Modifiers**, **Purpose Modifiers**, **View Range**. Inside Element Rules, four state sub-tabs: **cut**, **beyond**, **hidden**, **projection**. Per-state, per-element-type form: `Visible · Line Weight · Line Colour · Line Opacity · Line Style · Fill Style · Fill Colour · Fill Opacity · Symbolic Rule`. (Note: the screenshot still shows the `Fill Colour` row pre-Phase-9; Phase-9 P9-01 is a 30-min add per the gaps doc.)

These two surfaces — the **Properties panel** (per-view) and the **Intent panel** (per-Intent) — are the two halves of the orchestration cockpit. This document pins down their division of labour.

### 1.1 What the screenshots prove is broken

Reading the screenshots against `docs/USER-GUIDE-VISIBILITY-INTENT.md` and Contract 25b:

1. **Two parallel V/G blocks coexist.** The legacy `V/G SETTINGS` (template + rules count + Open Intent Settings) sits directly above the modern `VISIBILITY INTENT` block. They are functional duplicates — and 25b says only one survives. The legacy block has been `@deprecated` at the type level (`vgTemplateId` per 25b Wave-4 Appendix B) but is still rendered in the panel.

2. **No view-type filtering on the panel sections.** A 3D view today shows *View Range*, *Crop > View Depth (m)*, *Underlay*, even though all three are meaningless for 3D. A drafting view shows *Output > Detail Level* even though it has no model elements to represent. The panel needs a **view-type config table** (the same one called for in doc 10 Stage S3) driving conditional section visibility.

3. **No bind/unbind UX for the Intent.** The Intent dropdown supports *which* Intent the view uses, but offers no way to:
   - Detach the view (work without an Intent — for a quick sketch view).
   - Promote view-local overrides into a brand-new Intent.
   - Convert from "view-local Intent" to "shared Intent" once stable.
   These three transitions are the core authoring loop the user described in this round; they are documented in Workflow 7 of the User Guide but have no panel surface.

4. **Output settings are panel-local even when they should follow the Intent.** Detail Level (Coarse/Medium/Fine), Visual Style (Wireframe/Hidden Line/Shaded), Display Model (Normal/Halftone/Hidden), and the Shadows checkbox are *graphic decisions*. A "Construction Documents" Intent should default plans to Detail Level = Fine, Visual Style = Hidden Line, Shadows = off. A "Design Review" Intent should default 3D views to Visual Style = Shaded with Edges, Shadows = on. Today none of this is reachable from the Intent.

5. **View Range is partially Intent-aware, but the wiring is invisible to the user.** `ViewRangeIntentResolver.ts` (`176 LOC`) computes `top/cut/bottom/depth` by combining the Intent's `planViewRange.belowLevelDepth` with the per-view `viewRange` overrides. The panel screenshot shows the four bounds but never indicates what the Intent contributes. A user editing "Bottom · Offset = 0" today has no idea whether their value is the Intent default or a per-view override.

6. **Underlay orientation is not view-type-aware.** A reflected ceiling plan's underlay should default to "Looking Up"; an architectural plan's to "Looking Down". The dropdown currently exposes both regardless of `viewType` and has no Intent-driven default.

7. **Metadata says nothing about Intent provenance.** A view bound to "Architectural Documentation v3" should record that pin so that, when the master Intent is updated to v4, the user can decide whether to take the new master or stay on v3. Today there is no Intent-version row.

---

## 2. The orchestration model — Intent as the single spine

### 2.1 Three architectural rules

Following Contract 25b §1 and the rendering equation:

> *Rule A — Single resolver.* `IntentRuleResolver` is the only function that produces an `ElementStateAppearance`, `ThreeDimensionalAppearance`, view-range, crop default, underlay default, output default, or any other view-property default. The Properties panel **reads** through it and **writes** through commands that target either the Intent record (shared) or the `ViewIntentInstance.localOverrides` (view-local).

> *Rule B — Per-view-type profile.* Every Intent carries a `viewTypeProfiles: Record<ViewType, ViewTypeProfile>` block. Each profile contains **only** the fields that view type can express (e.g. `plan.viewRange` exists, `3d.viewRange` does not). The panel renders the Intent fields filtered through the active view's profile.

> *Rule C — Four binding modes, one panel.* The same panel renders for `bound-system`, `bound-user`, `bound-view-local`, and `unbound` views. The difference is **affordance** (read-only vs editable, "Promote" vs "Detach", etc.), not section presence.

### 2.2 The data model — what `viewTypeProfiles` looks like

This is an additive expansion of the existing `VisibilityIntent` type (`src/core/presentation/VisibilityIntentTypes.ts`). It does **not** delete or replace any current field; existing intents continue to load with the new fields defaulting to `undefined` / sensible fallbacks.

```ts
// NEW — added to VisibilityIntent in Stage S3 (per doc 10).
interface ViewTypeProfile {
    viewType: ViewType;          // 'plan' | 'ceiling-plan' | 'structural-plan' |
                                 //   'section' | 'elevation' | 'detail' | '3d' |
                                 //   'analysis' | 'render'
                                 // (Excludes 'drafting' | 'legend' | 'walkthrough' —
                                 //  those have no Intent surface.)

    // ── Element rules ──────────────────────────────────────────────
    elementRules?: Partial<Record<string, ElementGraphicsRules>>;
    // Per-element-type override of the Intent's base elementRules.
    // Only entries different from base are stored (sparse).
    // Resolver merges base ← profile.elementRules.

    // ── State palette ──────────────────────────────────────────────
    statesShown:  ElementState[];
    // Which of cut/beyond/projection/hidden the Intent panel renders
    // editing controls for in this view-type's section. Drives the
    // ViewTypeRuleMatrix and prevents the user from authoring a "cut
    // colour" for a 3D view.

    // ── View Range ─────────────────────────────────────────────────
    viewRange?: {
        kind: 'four-bound' | 'cut+far' | 'far-only' | 'inherit' | 'none';
        // four-bound = plan/RCP/structural-plan
        // cut+far    = section
        // far-only   = elevation
        // inherit    = detail (from parentView)
        // none       = 3d / drafting / legend

        defaultTop?:    LevelOffset;   // optional Intent-level default
        defaultCut?:    LevelOffset;
        defaultBottom?: LevelOffset;
        defaultDepth?:  LevelOffset;
        defaultFar?:    number;        // metres — section/elevation
        belowLevelDepth?: number;      // already exists in PlanViewRangeDefaults
    };

    // ── Crop ───────────────────────────────────────────────────────
    crop?: {
        defaultActive:        boolean; // Intent-level default for cropActive
        defaultAnnotationCrop: boolean;
        defaultFarClip?:      number;  // metres, section/elevation only
    };

    // ── Underlay ───────────────────────────────────────────────────
    underlay?: {
        enabledByDefault:     boolean;
        defaultOrientation:   'looking-down' | 'looking-up';  // RCP default → 'looking-up'
        underlayLineStyle?:   LineAppearance;                 // styling of the underlay layer
    };

    // ── Output (graphic side of "Output") ─────────────────────────
    output?: {
        defaultDetailLevel?:  'coarse' | 'medium' | 'fine';
        defaultVisualStyle?:  'wireframe' | 'hiddenLine' | 'shaded' |
                              'shadedWithEdges' | 'realistic';
        defaultDisplayModel?: 'normal' | 'halftone' | 'hidden';
        defaultShadows?:      boolean;
        // Note: 'scale' is NOT here — it is sheet/output-only and stays per-view.
    };

    // ── IFC reference geometry ────────────────────────────────────
    ifcReference?: {
        visible:           boolean;        // Intent-level default for this viewType
        styleAsBeyond?:    boolean;        // render IFC in 'beyond' state appearance
    };

    // ── Symbolic rules (doors/windows in plan, etc.) ─────────────
    symbolicRules?: Record<string, string>;
    // elementType → symbolicRuleId. e.g. { door: 'plan-door-swing' }.
}

// EXTENDED — VisibilityIntent gets:
interface VisibilityIntent {
    // ... existing fields (id, name, description, isSystem, version, etc.) ...
    elementRules:       Record<string, ElementGraphicsRules>;
    viewTypeModifiers:  ViewTypeModifier[];     // existing — superseded by viewTypeProfiles
                                                 // but kept as a compatibility shim for one
                                                 // release; readers prefer profiles.
    purposeModifiers:   PurposeModifier[];
    planViewRange?:     PlanViewRangeDefaults;  // existing — folded into
                                                 //   viewTypeProfiles.plan.viewRange in Stage S3
    viewTypeProfiles?:  Partial<Record<ViewType, ViewTypeProfile>>;  // NEW
    schemaVersion:      number;                 // bumped to 3 when a profile is written
}

// NEW — per-view binding shape (already exists; documented for completeness)
interface ViewIntentInstance {
    id:           string;
    viewId:       string;
    intentId:     string | null;          // null → unbound (Mode 4 in §2.3)
    intentScope:  'system' | 'user' | 'view-local';   // NEW — drives panel affordance
    pinnedVersion?: number;               // NEW — pin to a specific Intent version
    localOverrides: OverrideLayer;
}
```

### 2.3 Four binding modes — affordance table

| Mode | `intentId` | `intentScope` | Properties panel behaviour |
|---|---|---|---|
| **1. Bound (system)** | UUID of system Intent | `'system'` | Intent fields read-only with a lock icon. "Customise" button → creates a user Intent (clones the system Intent), rebinds, switches to Mode 2. Per-view fields fully editable. |
| **2. Bound (user)** | UUID of user Intent | `'user'` | Intent fields editable in-place; edits propagate to every view bound to this Intent. "Detach" → moves to Mode 4. "Make View-Local" → forks the Intent into a private copy, switches to Mode 3. |
| **3. Bound (view-local)** | UUID of private Intent (only this view uses it) | `'view-local'` | Intent fields editable; edits affect only this view. "Promote to Shared" → renames + makes it a user Intent visible in everyone's picker, switches to Mode 2. |
| **4. Unbound** | `null` | — | Every Intent-managed field shows in the panel as a per-view field (sourced from system defaults), saved into `localOverrides`. "Bind to…" → rebinds to a chosen Intent, switches to Mode 1/2/3. "Save as Intent" → creates an Intent from the local overrides, switches to Mode 2. |

The same panel renders in all four modes. The differences are:

- **Lock icons** on inherited fields when the Intent is read-only.
- **Action buttons** (Customise / Detach / Make View-Local / Promote to Shared / Bind to… / Save as Intent) shown contextually.
- **"Pure intent" vs "Customised" badge** (already in screenshot 3) becomes a tri-state: **Pure**, **Customised** (some local overrides), **Forked** (Mode 3, the Intent itself is private).

### 2.4 The render-time precedence chain (unchanged from Contract 25)

```
FinalElementAppearance =
    (Intent base elementRules)                     ← priority 1000
  + (Intent viewTypeProfiles[viewType].elementRules) ← priority 4000  (NEW slot)
  + (Intent viewTypeModifiers — legacy patches)    ← priority 5000  (deprecated, kept for compat)
  + (Intent purposeModifiers — by view.purpose)    ← priority 6000
  + (ViewIntentInstance.localOverrides.graphicOverrides) ← priority 50000
  + (ViewIntentInstance.localOverrides.visibilityOverrides — gate)
```

The existing `IntentRuleResolver.resolveIntentStyle()` (`183 LOC`) gains a single new step (priority 4000) between base rules and view-type modifiers. The legacy `viewTypeModifiers` slot remains for one release, then is dropped after migrations convert it to profile entries.

### 2.5 The same precedence applies to non-graphic fields

This is the contribution this document makes on top of doc 10. The resolver gains four more pure functions:

```ts
// All take the same precedence chain as resolveIntentStyle, but produce
// different return types. None of them ever cause a render side-effect;
// they purely answer "what value does this field have at this moment?"

resolveViewRange(instance, intent, viewType):       ResolvedViewRange
resolveCrop(instance, intent, viewType):            ResolvedCrop
resolveUnderlay(instance, intent, viewType):        ResolvedUnderlay
resolveOutput(instance, intent, viewType):          ResolvedOutput
resolveViewSeed(intent, viewType):                  ResolvedViewSeed   // NEW (View Template absorption)
```

Each returns `{ value, source: 'system-default' | 'intent' | 'profile' | 'override' }`. The panel uses `source` to decide whether to render the field with a lock icon, a "from Intent" subtitle, or a "Reset to Intent default" `↻` button.

This is the design pattern that makes the panel work in all four binding modes from one render path. **No conditional code per mode.** The resolver answers, the panel reflects.

### 2.6 Direct answers — what is, and is not, part of the Intent

The user has asked four scoping questions. The full design intent is below; the short answers first:

| Question | Answer | Where it lives in the schema |
|---|---|---|
| Can the **View Template** be folded into the Intent? | **Yes — fully.** A View Template was a "named recipe for creating views" (identity defaults + locked fields + governed scale + V/G template id). All of these collapse into the Intent itself. | New `intent.viewSeed` block (§2.6.1) and existing `intent.viewTypeProfiles` (§2.2). |
| Can the **View Range** be part of the Intent? | **Yes — fully.** All four bounds (Top / Cut / Bottom / Depth) and the section/elevation Far Clip live in the Intent profile. The per-view value is an override against the Intent default. | `intent.viewTypeProfiles[viewType].viewRange` (§2.2). |
| Can the **Crop / Section Box** be part of the Intent? | **Partially — by design.** The *boolean toggles* (active, annotation-crop, sectionBox-active) and the *crop styling* (line style of the crop boundary) live in the Intent. The *region geometry itself* (the rectangle / AABB) stays per-view — it is spatial-instance data with no project-level analogue. | Booleans + style → `intent.viewTypeProfiles[viewType].crop` (§2.2). Geometry → `viewIntentInstance.localOverrides.cropRegion` / `sectionBox`. |
| Can the **Underlay** be part of the Intent? | **Partially — by design.** *Whether* underlays are enabled, *what orientation* the discipline expects, and *how* the underlay layer is styled live in the Intent. The *level pickers* (which level is "below this one") stay per-view because they are referential — they point to project-specific level entities. | Booleans + orientation + style → `intent.viewTypeProfiles[viewType].underlay` (§2.2). Level references → per-view. |

The four sections below give the detail.

#### 2.6.1 View Template absorbed — the new `intent.viewSeed` block

A View Template historically carried four kinds of data:
1. **Identity defaults** — `discipline`, `purpose`, default `phase`, name template (e.g. `"L01 — {discipline} Plan"`).
2. **Output defaults** — initial `scale`, `lockedFields[]`.
3. **Governance** — which fields are locked; sync state vs the master template.
4. **Visibility/Graphics binding** — historically a `vgTemplateId`; now an Intent.

Items (1)–(3) move into a new `viewSeed` block on the Intent itself; item (4) is the Intent itself. The result: **a Template *is* an Intent + a viewSeed**. There is no separate Template entity to maintain.

```ts
// NEW — added to VisibilityIntent in Stage P0 (see §6.6).
interface ViewSeed {
    // ── When applied to create a new view ────────────────────────
    nameTemplate?:    string;           // e.g. "L{level} — {discipline} Plan"
    discipline?:      DisciplineCode;   // 'architecture' | 'structure' | 'mep' | 'all'
    purpose?:         ViewPurpose;      // 'construction-docs' | 'design-review' | …
    defaultPhase?:    string;           // 'existing' | 'new-construction' | …
    initialScale?:    number;           // 1 : N
    initialLevel?:    'this' | 'auto';  // for plan-family views

    // ── Field locks (the governance dimension) ───────────────────
    lockedFields?:    Array<
        | 'scale'
        | 'detailLevel'
        | 'visualStyle'
        | 'displayModel'
        | 'shadows'
        | 'cropActive'
        | 'underlayEnabled'
        | 'phase'
        | 'discipline'
        | 'purpose'
    >;
    // When a field is locked, the Properties panel renders it
    // read-only with the lock icon — exactly the same affordance as
    // a system-Intent field (so the "lock" idiom is uniform).

    // ── Per-view-type seed overrides (rare but possible) ─────────
    perViewType?: Partial<Record<ViewType, {
        nameTemplate?: string;
        initialScale?: number;
    }>>;
}

// EXTENDED — VisibilityIntent gets:
interface VisibilityIntent {
    // ... existing fields ...
    viewSeed?: ViewSeed;  // NEW — absorbed View Template payload
}
```

**Migration:** Stage **P0** (new) walks every `viewTemplate` in `viewTemplateStore` and emits a matching Intent (or extends an existing one) with a `viewSeed`. Existing views that referenced a template by `viewTemplateId` get their `ViewIntentInstance.intentId` set to the migrated Intent. The legacy `viewTemplateStore` becomes a `@deprecated readable, never written` store — same retirement pattern Contract 25b uses for V/G.

**Properties panel impact:** the entire "View Template" section in the screenshots is **removed**. Identity gains a small "Created from Intent {name} v{n}" provenance row showing the `viewSeed` source. The Sync State badge migrates into the Intent spine (it is now "is this view's value still equal to the Intent's `viewSeed.initialScale`?"). The "Locked Fields" list moves into the Intent Editor as a new sub-section under the per-view-type accordion.

**Net effect:** one fewer top-level concept (Templates), one fewer top-level panel section, no functionality lost.

#### 2.6.2 View Range fully in Intent

Already specified in §2.2: `intent.viewTypeProfiles[viewType].viewRange` carries `defaultTop / defaultCut / defaultBottom / defaultDepth / defaultFar / belowLevelDepth` and a `kind` discriminator. The per-view value (today's `ViewDefinition.viewRange`) becomes a sparse override layer: `viewIntentInstance.localOverrides.viewRangeOverride: Partial<ViewRangeSettings>`. The resolver (§2.5) merges Intent profile + override.

**Properties panel impact:** the View Range section renders all four bounds; each row shows a source pill (`Intent · Profile · plan` or `Override (this view)`) and a `↻` reset that clears the per-row override. (UI/UX doc §1.4.)

#### 2.6.3 Crop fully in Intent — geometry stays per-view

The *intent* dimension of crop ("should plans default to crop-active? what does the crop boundary look like?") fully lives in `intent.viewTypeProfiles[viewType].crop`. The *spatial* dimension ("where is the crop rectangle in this specific view's XY plane?") cannot live in the Intent because it would force every view sharing the Intent to have the same rectangle — which is meaningless. The rectangle stays in `viewIntentInstance.localOverrides.cropRegion`.

**Section Box (3D AABB)** follows the same split: the boolean ("section box on by default?") lives in the Intent; the AABB itself lives per-view.

**Properties panel impact:** the Crop section renders the Intent-driven booleans with source pills, plus a separate "Edit Crop Region in viewport ▸" button that enters the on-canvas tool. (UI/UX doc §1.5.)

#### 2.6.4 Underlay fully in Intent — level references stay per-view

The *intent* dimension ("should plan views default to showing an underlay? what orientation? what styling?") lives in `intent.viewTypeProfiles[viewType].underlay`. The *referential* dimension ("which project level is the base of this view's underlay?") cannot live in the Intent because levels are per-project entities and the Intent must remain project-portable. Level references stay per-view.

**Properties panel impact:** the Underlay section shows the Intent-driven enable/orientation/style with source pills, plus the per-view level pickers as plain editable rows. (UI/UX doc §1.6.)

---

## 3. Per-view-type matrix — what the panel renders for each `viewType`

Cross-reference doc 09 §2.4. This table is the operational truth source for the new panel. **An empty cell means the section is hidden in the panel for that view type.**

| Section / view type        | plan    | ceiling-plan | structural-plan | section | elevation | detail | 3d | analysis | render | drafting | legend |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Identity (Name/Type/Discipline/Purpose/Phase) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Visibility Intent (binding spine)             | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (inherits parent) | ✓ | ✓ | ✓ | — | — |
| Output > Scale (per-view, sheet)               | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| Output > Detail Level (Intent-driven)          | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | — |
| Output > Visual Style (Intent-driven)          | — | — | — | — | — | — | ✓ | — | ✓ | — | — |
| Output > Display Model (Intent-driven)         | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | — |
| Output > Shadows (Intent-driven)               | — | — | — | — | — | — | ✓ | — | ✓ | — | — |
| View Range > four-bound                        | ✓ | ✓ (flipped) | ✓ | — | — | — | — | — | — | — | — |
| View Range > cut + far                          | — | — | — | ✓ | — | — | — | — | — | — | — |
| View Range > far only                           | — | — | — | — | ✓ | — | — | — | — | — | — |
| View Range > inherit (parent)                   | — | — | — | — | — | ✓ | — | — | — | — | — |
| Crop > active / annotation                      | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | — |
| Crop > farClip (m)                              | — | — | — | ✓ | ✓ | — | — | — | — | — | — |
| Crop > sectionBox (3D AABB)                     | — | — | — | — | — | — | ✓ | — | ✓ | — | — |
| Underlay (Base / Top / Orientation)             | ✓ | ✓ | — | — | — | — | — | — | — | — | — |
| IFC Reference toggle                            | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — |
| Lighting / Sun                                  | — | — | — | — | — | — | ✓ | — | ✓ | — | — |
| 3D Surface appearance (per element type)        | — | — | — | — | — | — | ✓ | — | ✓ | — | — |
| AI hint (free text)                             | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Metadata                                        | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Reading guides for the matrix:

- **`ceiling-plan`** — view range is "flipped" (RCP convention). Underlay default orientation becomes `'looking-up'`. Wall element rules are demoted (projection only); ceiling element rules promoted to `cut`. State inversion is owned by the Intent profile (`viewTypeProfiles['ceiling-plan'].statesShown` and `symbolicRules`).
- **`detail`** — `Visibility Intent` shows the **parent view's Intent name** with a "Inherits from <parent>" badge. The user can detach to use a different Intent, but the default is inheritance. (This depends on `ViewDefinition.parentViewId?` landing — doc 09 G-A4.)
- **`drafting` / `legend`** — no Intent surface. The Visibility Intent section is hidden entirely. Only Identity, Template, Output (Scale only), AI hint, and Metadata render.
- **`3d`** — Visual Style + Shadows + Lighting are first-class. The 3D **surface appearance** (per element type) is the first-class control where today the user must edit `wall.materialColor` per element. This depends on Stage S5 (`ThreeDimensionalAppearance` schema) per doc 10.

The matrix is implemented as a single configuration table (`src/ui/views/ViewTypePropertiesPanelConfig.ts`, new) that the panel consumes once per render. Adding a new view type is **one row** in the table.

---

## 4. Section-by-section fate — current panel → orchestrated panel

This section walks the ten panel sections from the screenshots top-to-bottom. For each, it answers: **what stays, what moves, what is deleted, what is added.**

### 4.1 Identity (KEEP, minor expansion)

**Current fields:** Name, View Type (read-only), Discipline, Purpose, Phase Filter.

**Decision:** Stays as a per-view section. Identity is project-organisational, not graphical.

**Changes:**
- **Purpose** field already drives `purposeModifiers` in the Intent (good). Add a small `?` tooltip on the dropdown that says: *"Picking a purpose applies the matching purpose modifier from your Intent. Click to see what it overrides."* Clicking opens the Intent panel scrolled to the Purpose Modifiers tab for that purpose.
- **Phase Filter** has no Intent involvement and stays a per-view setting.
- Add **Parent View** row (read-only initially), shown only for `viewType === 'detail'` — depends on G-A4.

### 4.2 V/G Settings (DELETE — the V/G era is over)

**Current fields:** Template (dropdown), Rules (count), "Open Intent Settings ▸" button.

**Decision:** **Delete the entire section.** Per Contract 25b §2.1 and §2.4, `vgGovernanceStore` is a `@deprecated` migration source only; the V/G Template UI is forbidden in any new code. The "Open Intent Settings" button moves into the Visibility Intent block.

**Migration concern:** Existing project data still carries `def.vgTemplateId` (per 25b Wave-4 it is `@deprecated readable, never written`). On first open after this refactor, `runVGToIntentMigration()` already converts it to a `ViewIntentInstance` with the migrated Intent. This panel deletion is therefore a UI-only change with no data consequences.

### 4.3 Visibility Intent (PROMOTE — becomes the spine)

**Current fields:** Visibility Intent dropdown, Intent State badge ("Pure intent" / "Customised"), "Open Intent Editor ▸" button.

**Decision:** This section is the **panel's spine** going forward. It is rendered first below Identity for every Intent-aware view type and its state drives the affordance of every other section.

**New layout:**

```
┌─ VISIBILITY INTENT ─────────────────────────────────────────┐
│  Bound to: [ Architectural Documentation (system)  ▾ ]      │
│            (i) Used by 12 views project-wide                │
│  Status:   ● Pure intent · v3 · pinned [unpin]              │
│                                                             │
│  Actions:  [ Customise → user Intent ]                      │
│            [ Detach (unbind) ]                              │
│            [ Open Intent Editor ▸ ]                         │
└─────────────────────────────────────────────────────────────┘
```

When **Mode 2 (user Intent):**
```
│  Status:   ● Customised — 3 local overrides [view list]     │
│  Actions:  [ Promote overrides → new Intent version ]       │
│            [ Make View-Local fork ]                         │
│            [ Detach ] [ Open Intent Editor ▸ ]              │
```

When **Mode 3 (view-local Intent):**
```
│  Bound to: My Custom Intent (view-local)                    │
│  Status:   ● Forked · v1 · only this view uses it            │
│  Actions:  [ Promote to Shared Intent ]                     │
│            [ Detach ] [ Edit fields below ↓ ]               │
```

When **Mode 4 (unbound):**
```
│  Bound to: — (no Intent)                                    │
│  Status:   ● Using system defaults                          │
│  Actions:  [ Bind to… ▾ ] [ Save current settings as Intent ]│
```

The spine block is also the only place Intent versioning is exposed: the user sees the version pin and can choose "Take latest version" when an Intent is updated by another collaborator.

**Section behaviour:** All sections below the spine read `intent + viewTypeProfiles[viewType] + localOverrides` through the resolver. They render fields with a **source indicator** (Intent / Profile / Override / System Default) and a **lock affordance** when the source is read-only.

### 4.4 View Template (DELETE — absorbed into the Intent)

**Current fields:** View Template dropdown, Sync State badge, dynamic locked-fields rows.

**Decision:** **Delete the entire section.** The earlier draft of this document kept View Template as a peer of Intent — that was wrong. A second look made it clear that there is no payload in a View Template that does not naturally belong on the Intent. The "two concepts" framing was an artefact of the V/G-era split, where Templates owned identity and V/G owned graphics. With Intent owning graphics, identity, view-type profiles, output defaults, view range, crop and underlay defaults, the Template has nothing left to carry.

The four payloads of a View Template move as follows (full schema in §2.6.1):

| View Template payload | Goes to |
|---|---|
| Identity defaults (`discipline`, `purpose`, name template, default phase) | `intent.viewSeed.{discipline,purpose,nameTemplate,defaultPhase}` |
| Output defaults (`initialScale`, per-view-type seed) | `intent.viewSeed.initialScale` and `intent.viewSeed.perViewType` |
| Locked fields list | `intent.viewSeed.lockedFields[]` (now an Intent concern, surfaced as the lock-icon affordance everywhere in the panel) |
| V/G binding (`vgTemplateId`) | The Intent itself — the binding *is* the Intent |

**Migration:** new Stage **P0** (added to §6.6) walks every entry in `viewTemplateStore` and emits or extends an Intent with the appropriate `viewSeed`. Each `ViewIntentInstance` whose underlying view referenced a template gets `intentId` set to the migrated Intent. `viewTemplateStore` is then marked `@deprecated readable, never written` — the same retirement pattern Contract 25b uses for V/G.

**Sync State:** the badge moves into the Intent spine (§4.3) as part of the existing "Pure / Customised / Forked" status. "Sync State" was always answering the question "does this view's effective settings still match its template's settings?" — that question is now "does this view have any local overrides against its Intent?" which is exactly what the spine status already answers.

**"Create View from Template" UX:** replaced by **"Create View from Intent"**. The picker chooses an Intent; the new view is seeded from `intent.viewSeed` and bound to that Intent. The two operations that used to be sequential (apply Template, then bind V/G) collapse into one click.

**Net effect:** one fewer top-level concept, one fewer top-level panel section, one fewer store, one fewer migration target — and the lock-icon idiom (already used for system-Intent fields) becomes the single visual language for "field is locked, can only be changed at the source".

### 4.5 Output (SPLIT — Scale stays per-view, the rest is Intent-driven)

**Current fields:** Scale (1:N), Detail Level, Visual Style, Display Model, Shadows, Scene Background.

**Decision:** Split into two micro-sections inside the Output card:

```
┌─ OUTPUT ────────────────────────────────────────────────────┐
│  ── Sheet output (per-view) ──                               │
│  Scale (1:N):       [ 100 ]                                  │
│                                                             │
│  ── Graphic style (from Intent) ──                           │
│  Detail Level:      [ Medium  ▾ ] (i) From Intent           │
│  Visual Style:      [ Shaded+Edges ▾ ] (i) From Intent      │
│  Display Model:     [ (inherit) ▾ ] (i) From Intent         │
│  Shadows:           [ ☐ ]              (i) From Intent      │
│  ↻ Reset to Intent defaults                                  │
└─────────────────────────────────────────────────────────────┘
```

- **Scale** stays per-view — it is a sheet/output decision, varies per drawing-sheet placement, never an Intent concern.
- **Detail Level / Visual Style / Display Model / Shadows** are sourced via `resolveOutput()`. The user can override per-view (writes to `localOverrides.outputOverride`). The `↻` button clears all overrides at once.
- **Visual Style** + **Shadows** rows are hidden for plan/section/elevation (they are only meaningful for 3D / render — see matrix §3).
- **Scene Background** — *kept globally* (it is a viewport-renderer concern, not a per-view-type Intent concern). Stays on the global preferences screen.

### 4.6 View Range (REFRAME — Intent-derived, four variants)

**Current fields (plan only):** Top, Cut, Bottom, Depth — each `Level + Offset (m)`. Plus a "Reset to Level Defaults" button.

**Decision:** The section becomes one of four variants, chosen by `viewTypeProfiles[viewType].viewRange.kind` (see §2.2):

#### Variant A — `four-bound` (plan / ceiling-plan / structural-plan)

```
┌─ VIEW RANGE ────────────────────────────────────────────────┐
│  Variant: four-bound (plan)                                  │
│  Source:  Top/Cut/Bottom = Intent default · Depth = override │
│                                                             │
│  Top      Level [ Ground ▾ ]  Offset [ 3.0 m ]   ↻         │
│  Cut      Level [ Ground ▾ ]  Offset [ 1.2 m ]   ↻         │
│  Bottom   Level [ Ground ▾ ]  Offset [ 0.0 m ]   ↻         │
│  Depth    Level [ Ground ▾ ]  Offset [ -1.2 m ]  ↻ (over.)  │
│                                                             │
│  [ Reset all to Intent defaults ]                            │
└─────────────────────────────────────────────────────────────┘
```

Each row carries a `↻` button that clears the per-view override and falls back to the Intent default. The "(over.)" tag marks rows currently overridden.

#### Variant B — `cut+far` (section)

```
│  Cut Plane:   [ defined by section line — see Section tool ] │
│  Far Clip:    [ 25.0 m ]   (i) From Intent                  │
```

#### Variant C — `far-only` (elevation)

```
│  Far Clip:    [ 50.0 m ]   (i) From Intent                  │
```

#### Variant D — `inherit` (detail)

```
│  Inherits view range from parent: [ Ground Plan ▸ ]          │
│  Local offset (Δ depth): [ 0.0 m ]                          │
```

Variant E for `3d` / `drafting` / `legend` is "section hidden entirely" (matrix §3).

**Implementation note:** `ViewRangeIntentResolver.ts` already exists and reconciles intent + per-view. The variants above are pure UI — no resolver change beyond adding the four-variant kind tag.

**RCP-specific:** in the plan variant rendered for `ceiling-plan`, the row order is reversed (Bottom is the ceiling, Top is what you'd see above) and the `belowLevelDepth` field becomes `aboveCeilingDepth` (gap noted in doc 09 §2.3.2).

### 4.7 Crop (HYBRID — region per-view, defaults from Intent)

**Current fields:** Crop Active (checkbox), Annotation Crop (checkbox).

**Decision:**

```
┌─ CROP ──────────────────────────────────────────────────────┐
│  Crop Active:         [ ☑ ]   (i) Default for plans is OFF  │
│                                    in this Intent  ↻         │
│  Annotation Crop:     [ ☐ ]   (i) From Intent      ↻         │
│  View Depth (m):      [ 25.0 ]   (section/elevation only)    │
│                                                             │
│  [ Edit Crop Region in viewport ▸ ]                          │
└─────────────────────────────────────────────────────────────┘
```

- The two booleans default from `viewTypeProfiles[viewType].crop.defaultActive / defaultAnnotationCrop`. Per-view override writes to `localOverrides.cropOverride`.
- The **crop region geometry** (the on-canvas rectangle) is **always per-view** — the Intent has no opinion on the shape, only on whether it is enabled. The "Edit Crop Region" button enters the same on-canvas crop tool that exists today.
- For `3d` and `render`, this section is replaced by **Section Box (3D AABB)** — a block of three min/max XYZ inputs with a "From viewport" capture button. Section Box is also per-view geometry; the Intent only decides whether section-box clipping is on or off by default.

### 4.8 Underlay (HYBRID — pickers per-view, presence + orientation from Intent)

**Current fields:** Base Level ID, Top Level ID, Orientation (Looking Down / Looking Up).

**Decision:**

```
┌─ UNDERLAY ──────────────────────────────────────────────────┐
│  Use Underlay:        [ ☑ ]   (i) From Intent                │
│  Base Level:          [ (none) ▾ ]                           │
│  Top Level:           [ (none) ▾ ]                           │
│  Orientation:         [ Looking Down ▾ ]   (i) Intent default│
│  Underlay Style:      [ Light grey, dashed ▸ ]   (i) Intent  │
│                                                             │
│  [ Save Underlay ]                                           │
└─────────────────────────────────────────────────────────────┘
```

- "Use Underlay" toggle defaults from `viewTypeProfiles[viewType].underlay.enabledByDefault`.
- "Orientation" defaults from `viewTypeProfiles[viewType].underlay.defaultOrientation`. RCP profile sets `'looking-up'` so a new RCP correctly underlay-renders the floor below from underneath.
- "Underlay Style" is new — opens a small inline appearance editor that writes `viewTypeProfiles[viewType].underlay.underlayLineStyle`. This is the path that lets a "Construction Documents" Intent display its underlay as faint grey dashed and a "Design Review" Intent display it solid pink.
- The level pickers (Base / Top) remain per-view — they reference project levels and there is no sensible Intent-level default ("which level is below this one").
- Section is hidden entirely for non-plan view types per the matrix (§3).

### 4.9 AI Intent (RENAME — disambiguate from Visibility Intent)

**Current field:** "Intent (used by AI)" textarea.

**Decision:** Rename the field and section to **"View Description (AI grounding)"**. The reuse of the word "Intent" creates collision with Visibility Intent and is the single most confusing label in the panel.

```
┌─ VIEW DESCRIPTION (for AI) ──────────────────────────────────┐
│  Bound Visibility Intent:                                    │
│   ┌────────────────────────────────────────────────────────┐ │
│   │ Architectural Documentation (system) — read-only       │ │
│   │ "Default documentation intent using PRYZM pen-weight   │ │
│   │  table conventions."                                   │ │
│   └────────────────────────────────────────────────────────┘ │
│                                                              │
│  This view's description (free text):                        │
│   ┌────────────────────────────────────────────────────────┐ │
│   │ Default ground floor plan — system default.            │ │
│   └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

Showing the bound Intent's description above the per-view text gives the AI both contexts when a query targets this view ("regenerate plan view of ground floor with Intent X"). The per-view text remains a free-text override that the user can use to give the view a custom narrative ("kitchen detail study, focus on island").

### 4.10 Metadata (KEEP — add Intent provenance)

**Current fields:** Created By, Created, Modified, Version.

**Decision:** Stays. Add three rows:

```
│  Bound Intent:        Architectural Documentation v3        │
│  Intent Pinned:       no  [pin to v3]                        │
│  Last Intent Sync:    26 Apr 2026, 10:14                     │
```

These tell the user, post-collaboration, when a teammate updated the Intent and whether their view took the change. The "pin" toggle is the lever that lets a user freeze a view's appearance against a known Intent version while others move on.

---

## 5. The Intent panel (the master editor) — what it must change

The Properties panel does not stand alone: every "Open Intent Editor ▸" link from the spine (§4.3) leads to the **Visibility Intent panel** (`src/ui/VisibilityIntentPanel.ts`, 640 LOC). For the orchestration model to work end-to-end, the Intent panel itself must restructure (this is doc 10 Stage S3, slightly extended here):

### 5.1 From four flat tabs to per-view-type sections

The current modal has four flat tabs (Element Rules / View Modifiers / Purpose Modifiers / View Range). Per doc 09 §7, this becomes:

```
┌─ Intent: Architectural Documentation (system) ─────[ Duplicate ]┐
│ ┌─ Per-view-type sections ───────────────────────────────────┐ │
│ │ [ Plan ] [ RCP ] [ Structural ] [ Section ] [ Elevation ]   │ │
│ │ [ Detail ] [ 3D ] [ Analysis ] [ Render ]                   │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
│ Active section: PLAN                                           │
│ ┌─ Element Rules (only states this view type uses) ─────────┐ │
│ │ Wall   cut · beyond · projection · hidden                  │ │
│ │ Slab   cut · beyond · projection · hidden                  │ │
│ │ Door   cut · projection (symbolic)                         │ │
│ │ ...                                                        │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
│ ┌─ View Range defaults (plan family) ────────────────────────┐ │
│ │  Top default:    Level + offset                            │ │
│ │  Cut default:    Level + offset                            │ │
│ │  Bottom default: Level + offset                            │ │
│ │  Depth default:  Level + offset                            │ │
│ │  Below-level depth: 1.2 m                                  │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
│ ┌─ Crop defaults ────────────────────────────────────────────┐ │
│ │  ☑ Crop active by default                                  │ │
│ │  ☐ Annotation crop by default                              │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
│ ┌─ Underlay defaults ────────────────────────────────────────┐ │
│ │  ☐ Underlay enabled by default                              │ │
│ │   Default orientation: Looking Down                         │ │
│ │   Underlay line style: [ light grey, dashed ▸ ]             │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
│ ┌─ Output defaults ──────────────────────────────────────────┐ │
│ │  Detail Level:   Medium                                    │ │
│ │  Display Model:  Normal                                    │ │
│ │  (Visual Style + Shadows hidden — not used by plan)        │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
│ ┌─ IFC reference geometry ───────────────────────────────────┐ │
│ │  ☑ Show IFC elements in plan views                         │ │
│ │  Style as: [ Beyond ▾ ]                                    │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
│ ┌─ Symbolic rules ───────────────────────────────────────────┐ │
│ │  Door:    plan-door-swing                                  │ │
│ │  Window:  plan-window-cased                                │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
│ ┌─ Purpose modifiers (apply across all view types) ──────────┐ │
│ │  [ Construction Docs ] [ Design Review ] [ Coordination ]  │ │
│ │   For each: a smaller per-view-type matrix                 │ │
│ └────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

The per-view-type accordion **mirrors the matrix in §3**: the same configuration table that hides Properties-panel sections also hides Intent-editor sub-sections. One config table, two consumers.

### 5.2 Inline Intent creation (Mode-3 path)

The Properties panel's "Customise" and "Save current settings as Intent" buttons (§4.3) open a **lightweight inline Intent dialog** that does not require navigating to the full editor:

```
┌─ Create new Intent from this view ──────────────────────────┐
│  Name:        [ Untitled Intent                       ]      │
│  Description: [ Created from Ground Floor on 26 Apr   ]      │
│  Scope:       (●) View-local (private to this view)          │
│               ( ) User Intent (visible to whole project)     │
│  Source:                                                     │
│    Base from: [ Architectural Documentation ▾ ]              │
│    + apply this view's local overrides                       │
│  [ Cancel ]                              [ Create Intent ]   │
└─────────────────────────────────────────────────────────────┘
```

A "view-local" Intent created here is automatically scoped — it does not appear in any other view's picker until the user explicitly **Promotes to Shared** from the spine.

---

## 6. Implementation plan — sequencing on top of existing Stages

The eight stages in `docs/01_ELEMENTS/03_VIEWS/10_VIEW_INTENT_SYSTEM_IMPLEMENTATION_PLAN.md` (S1–S8) cover most of the engineering. This document **interleaves four Properties-panel-specific stages** (P0–P3) into that schedule. Total added effort: ~3.5 engineering days.

| Order | Stage | Source | Goal | Effort |
|---|---|---|---|---|
| 1 | S1 | doc 10 | SVP header parity + tool registry parity | 1.5 h |
| 2 | S2 | doc 10 | `fill.colour` picker in Element Rules | 30 min |
| 3 | **P0** | **this doc §2.6.1, §4.4** | **Add `viewSeed` to `VisibilityIntent` schema (Zod + TS). Migrate every `viewTemplate` in `viewTemplateStore` into a corresponding Intent's `viewSeed`. Mark `viewTemplateStore` `@deprecated readable, never written`. Replace "Create View from Template" UI with "Create View from Intent". Delete the View Template panel section.** | **~4 h** |
| 4 | **P1** | **this doc** | **Delete V/G Settings card from `ViewPropertiesPanel`; promote Visibility Intent to spine; add the always-visible header `Intent: <name> [↗ Edit]` shortcut and the full-width spine `[ ↗ OPEN INTENT EDITOR ]` button (UI/UX §1.1, §1.2, §1.9); rename AI Intent to View Description.** | **~3 h** |
| 5 | S4 | doc 10 | Intent picker in standardised view header | 2 h |
| 6 | S3 | doc 10 + this doc §5 | Per-view-type accordion in Intent panel + per-view-type sections in Properties panel driven by **shared** config table | 2 days |
| 7 | **P2** | **this doc** | **Add resolver helpers `resolveViewRange/Crop/Underlay/Output/ViewSeed` returning `{ value, source }`. Wire Properties panel's View Range, Crop, Underlay, Output sections through them. Add `↻ Reset to Intent default` per row. Implement the lock-icon affordance for `viewSeed.lockedFields`.** | **~1 day** |
| 8 | **P3** | **this doc** | **Add the four-mode binding affordance (Customise / Detach / Make View-Local / Promote to Shared / Bind to / Save as Intent). Add inline Intent-creation dialog. Add Intent-version pin in Metadata.** | **~1 day** |
| 9 | S5 | doc 10 | `ThreeDimensionalAppearance` schema + 3D renderer integration | 2.5 days |
| 10 | S6 | doc 10 | Detail-view inheritance + RCP state inversion | 1.5 days |
| 11 | S7 | doc 10 | IFC projection refactor into Intent system | 1 day |
| 12 | S8 | doc 10 | Persistence + collaboration sync hardening | 2 days |

### 6.0 Stage P0 — View Template absorption (~4 hours)

**Files touched:**
- `src/core/presentation/VisibilityIntentTypes.ts` — add `ViewSeed` interface and Zod schema; add `viewSeed?: ViewSeed` field on `VisibilityIntent`. Bump intent schema version.
- `src/core/presentation/templates/viewTemplateStore.ts` — mark `@deprecated readable, never written`. Add a runtime guard in `setTemplate()` that logs an error and no-ops.
- `src/migrations/runViewTemplateToIntentMigration.ts` (new) — walks `viewTemplateStore.list()`, finds or creates an Intent for each, and copies the four payloads listed in §4.4 into `intent.viewSeed`. For every view that referenced a template, sets `viewIntentInstanceStore.getInstance(viewId).intentId` to the migrated Intent. Records a `Migrated from template '<name>'` provenance entry.
- `src/ui/ViewPropertiesPanel.ts` — delete the View Template section render path.
- `src/ui/views/CreateViewFromTemplateDialog.ts` → renamed to `CreateViewFromIntentDialog.ts`. Picker source changes from `viewTemplateStore.list()` to `intentStore.list().filter(i => i.viewSeed)`. The "Apply Template" command becomes `CreateViewFromIntentCommand` and runs `resolveViewSeed()` to seed the new view.

**Acceptance:**
- `rg "viewTemplateStore\.set" src` → zero non-deprecated callers.
- Loading a project that previously had View Templates shows every former template as an Intent with a `viewSeed` block; every view bound to those templates is now bound to the corresponding Intent.
- The Properties panel no longer renders a "View Template" section; the Identity section gains a "Created from Intent <name> v<n>" provenance row.
- The "Create View from Intent" dialog lists exactly the Intents that have a `viewSeed` (any Intent author can opt-in by setting one).

### 6.1 Stage P1 — Properties-panel cleanup (3 hours)

**Files touched:**
- `src/ui/ViewPropertiesPanel.ts` (1676 LOC — the panel under analysis).
- `src/ui/property-panel/ViewPropertiesSection.ts` (the panel adapter).
- `src/styles/panels/viewerPanels.ts` (style classes for the new spine block).

**Steps:**
1. Delete the `_renderVgSettingsSection()` (or its inline equivalent) — the entire V/G Settings card. Remove the legacy `vgGovernanceStore.list()` import. Confirm `_renderIntentSection()` already covers what V/G Settings used to surface (Template ≈ Intent picker).
2. Promote `_renderIntentSection()` above `_renderViewTemplateSection()` in render order, and rename internally to `_renderIntentSpine()`. Add the four-action button row described in §4.3 (the actions themselves are wired in P3 — this stage just renders them).
3. Rename "AI Intent" section to "View Description" (UI-only, no data path change). Add the read-only Bound Intent Description block above the per-view textarea (§4.9).
4. Add the three Intent provenance rows to Metadata (§4.10) — read-only, sourced from `viewIntentInstanceStore.getInstance(viewId).pinnedVersion` and `intent.version`.

**Acceptance:**
- `rg "VG SETTINGS" src` → zero matches.
- The Properties panel no longer shows two V/G blocks.
- The "Open Intent Editor ▸" button is the only entry point to the Intent panel from the Properties panel.
- All existing tests pass; no data migration required.

### 6.2 Stage P2 — Resolver helpers + sourced fields (1 day)

**Files touched:**
- `src/core/presentation/IntentRuleResolver.ts` (250 LOC — add four new pure functions).
- `src/core/presentation/VisibilityIntentTypes.ts` (492 LOC — add `ViewTypeProfile`, schema bump to 3).
- `src/ui/ViewPropertiesPanel.ts` (consumer).

**Steps:**
1. Add `ViewTypeProfile` type per §2.2 (additive, no migration).
2. Implement `resolveViewRange/Crop/Underlay/Output(instance, intent, viewType) → { value, source }`. Each follows the same precedence chain as `resolveIntentStyle`.
3. Refactor `_renderViewRangeSection`, `_renderCropSection`, `_renderUnderlaySection`, `_renderOutputSection` in `ViewPropertiesPanel` to call the resolvers and render with the source indicator + `↻` reset button per row.
4. Add `localOverrides.outputOverride / cropOverride / underlayOverride` to `OverrideLayer` in `VisibilityIntentTypes` — sparse, optional, defaults to `{}`. Resolver picks them up at priority 50000.
5. Add commands: `SetViewOutputOverrideCommand`, `SetViewCropOverrideCommand`, `SetViewUnderlayOverrideCommand`, `ClearOutputOverrideCommand` (one-shot per row), all routed through `commandManager` for undoability.

**Acceptance:**
- Editing a row in Output/Crop/Underlay writes to `localOverrides`, not to `ViewDefinition`. Verify by inspecting persisted JSON.
- `↻` reverts the row to Intent default within one frame.
- Switching the bound Intent updates the displayed default value (the override row, if present, stays put).
- Snapshot-test the resolver helpers with a fixture Intent + view definition.

### 6.3 Stage P3 — Four-mode binding affordance (1 day)

**Files touched:**
- `src/ui/ViewPropertiesPanel.ts` (consumer).
- `src/core/presentation/ViewIntentInstanceStore.ts` (146 LOC — add `intentScope` and `pinnedVersion`).
- New: `src/ui/dialogs/CreateIntentFromViewDialog.ts`.
- New commands: `BindViewIntentCommand`, `UnbindViewIntentCommand`, `MakeViewLocalIntentCommand`, `PromoteViewLocalIntentCommand`, `CreateIntentFromViewCommand`, `PinViewIntentVersionCommand`.

**Steps:**
1. Extend `ViewIntentInstance` with `intentScope: 'system' | 'user' | 'view-local'` and `pinnedVersion?: number`. Migration: existing instances default to `'user'` if the bound Intent has `isSystem: false`, else `'system'`.
2. Implement the six new commands. Each is a small wrapper around existing store mutators; the value is the undo path and the audit-log integration.
3. Render the four-action button row per §4.3 with affordance based on `intentScope`. Use a small state machine (`getAvailableActions(instance, intent) → Action[]`).
4. Implement `CreateIntentFromViewDialog` per §5.2.
5. Hook the Pin toggle in Metadata (§4.10) to `PinViewIntentVersionCommand`.

**Acceptance:**
- All four binding-mode transitions work and are undoable.
- "Save as Intent" from Mode 4 produces an Intent; the view rebinds; the panel switches to Mode 2.
- Pinning prevents the view from picking up master Intent updates; the spine badge reads "Pinned to v3" with an "unpin to take v4" affordance once a newer version exists.

### 6.4 Stages S5 / S6 / S7 — already documented in doc 10

These three stages remain as scheduled in doc 10 and are not re-described here. P1–P3 do **not** depend on S5/S6/S7 to ship — the Properties panel improvements work against the existing 2D-only surface; 3D-surface authority through Intent (S5) is additive.

### 6.5 Updates from the user-journey audit (2026-04-26)

The user-journey audit in `docs/03-execution/status/intent-analysis/INTENT-USER-JOURNEYS.md` §13 surfaced ten implementation gaps (A1–A10), four schema clarifications (B1–B4), and five sequencing updates (C1–C5) that this plan must absorb. The final, audited stage list:

| Order | Stage | Goal | Effort |
|---|---|---|---|
| 1 | **S1** | SVP header parity + tool registry parity | 1.5 h |
| 2 | **S2** | `fill.colour` picker in Element Rules | 30 min |
| 3 | **P1 + A5 + A7** | Properties panel cleanup; **plus** canvas-context "Override in this view" + spine override list (audit C2) | ~5 h |
| 4 | **S4** | Intent picker in standardised view header | 2 h |
| 5 | **S3 + A2 + A3 + A4 + B3 + C5** | Per-view-type accordion + rule matrix + **element-type visibility toggle** + multi-select + mass-edit menu + section/elevation profile + section/elevation contract test | ~3 days |
| 6 | **P2 + B4** | Resolver helpers + source pill + per-row reset; **plus** `resolveWithSourceChain()` provenance API | ~1.25 days |
| 7 | **P3 + A6 + A8 + A9 + A10** | Four-mode binding affordance + Action Sheets + `BindViewIntentCommand({ keepOverrides })` + Intent-usage counts + diverged-version banner + `UnbindViewIntentCommand({ keepValuesAsOverrides })` | ~1.5 days |
| 8 | **S5** | `ThreeDimensionalAppearance` schema + 3D renderer integration | 2.5 days |
| 9 | **S6** | Detail-view inheritance + RCP state inversion | 1.5 days |
| 10 | **S7** | IFC projection refactor into Intent system | 1 day |
| 11 | **S8** | Persistence + collaboration sync hardening | 2 days |

**Net total:** ~13.5 engineering days (was ~12). The added 1.5 days deliver the AEC-critical **element-type visibility toggle** (the "exclude furniture from RCP" affordance — audit A4), **multi-select editing** (A3) for batch-styling element rules, and the **per-view override loop** (A5 + A7) that lets Mode-1 users tweak views without leaving the canvas.

**The single most consequential addition** is **A4 (element-type visibility toggle inside the rule matrix)**: without it, the canonical "exclude X from view-type Y" workflow requires the user to set `visible: false` per state per element type — four clicks per row instead of one. Promoting it inside Stage S3 (audit C1) is required.

For the full audit details (each item's source journey, schema changes, command surface, and effort), see `docs/03-execution/status/intent-analysis/INTENT-USER-JOURNEYS.md` §13.

---

## 7. Risks and mitigations specific to the orchestration model

| # | Risk | Mitigation |
|---|---|---|
| R1 | Splitting Output into Intent-driven + per-view rows confuses users who think of Detail Level as a per-view setting (Revit convention). | Land P1 (deletion of V/G Settings + Intent spine promotion) before P2 (Output split). Use the source indicator and `↻` button to make the Intent inheritance visible. Update the user guide alongside P2. |
| R2 | View-local Intents clutter the project (every customised view spawns one). | Make "view-local" the **non-default** path: Mode-2 "Customise → user Intent" is the recommended action; Mode-3 "Make View-Local" is one extra click behind it. View-local intents have a distinct picker icon and never appear in the global Intent picker. |
| R3 | The four-mode affordance overwhelms first-time users. | Hide all but "Open Intent Editor" behind a "More actions ▾" disclosure in Mode 1 (the most common case). Show the full action set only in Mode 2/3. |
| R4 | Resolver helpers (P2) become a hot path on every panel render. | Memoise per `(instanceId, intentId, intentVersion)` — same caching pattern used by `IntentRuleResolver` today. Invalidate on `vi:intent-updated` / `vi:instance-updated`. |
| R5 | Existing projects break when `viewTypeProfiles` is null. | Resolver treats missing profiles as `{}` — falls back to base `elementRules` and system defaults for non-graphic fields. No migration required. Schema version bump to 3 is purely informational. |
| R6 | The deletion of V/G Settings (P1) hides a feature some power users still rely on. | The Visibility Intent picker covers every legitimate V/G Template use case once 25b Wave 4 migration has run. Verify by snapshot-testing the migration with a fixture project that has `vgTemplates[]` and `vgTemplateId` set. The legacy fields are `@deprecated` not deleted, so a user opening a pre-25b project still sees their templates converted to Intents. |
| R7 | Per-view-type matrix (§3) changes UI shape per view type — users navigating views see sections appear/disappear. | Document this in the User Guide as a feature ("the panel only shows what's relevant for the selected view"). Add a small "Why is X missing?" helper at the bottom of the panel that explains which sections are hidden and why. |

---

## 8. Acceptance criteria — what "done" looks like

After P1, P2, P3 land (in addition to the doc-10 stages they sequence with):

- [ ] The `ViewPropertiesPanel` does not render any "V/G Settings" card.
- [ ] The Visibility Intent block is the panel's spine (rendered immediately after Identity).
- [ ] The same panel works in all four binding modes; the action set differs but the section layout is consistent.
- [ ] A user can complete this workflow without opening the Intent editor: open a plan view → see "Bound to Architectural Documentation (system)" → click **Customise** → panel switches to Mode 2 with a fresh user-Intent → edit Bottom offset to `-2.0 m` → see the change in the canvas → save → reload → state persists.
- [ ] A user can complete this workflow: open a 3D view → see Output > Visual Style and Shadows but no View Range / Underlay / Crop / IFC sections.
- [ ] A user can complete this workflow: open an RCP view → see View Range with reversed bound order and "Above-ceiling depth" instead of "Below-level depth"; Underlay defaults to "Looking Up".
- [ ] Editing a `↻` button on any row clears that one override; metadata Last-Sync row updates.
- [ ] The Intent editor accordion has one section per view type; no flat tabs remain.
- [ ] The Intent editor and the Properties panel both consume the same `ViewTypePropertiesPanelConfig.ts` table — adding a new view type is one row in one file.
- [ ] All commands are undoable; `Ctrl+Z` round-trips every binding-mode transition.
- [ ] No reads or writes of `vgGovernanceStore` occur in the Properties panel code path (CI grep guard from 25b §6.1 catches regressions).

---

## 9. Cross-references

| Concern | Document |
|---|---|
| End-user mental model and workflows | `docs/USER-GUIDE-VISIBILITY-INTENT.md` |
| The four-layer architecture and rendering equation | `docs/02-decisions/contracts/25-VISIBILITY-INTENT-SYSTEM-CONTRACT.md` §1, §8 |
| Six-Wave V/G retirement plan | `docs/02-decisions/contracts/25b-VG-INTENT-FULL-CONSOLIDATION-PLAN.md` |
| Phase-9 gaps (fill colour, view-type modifier UI, view purpose) | `docs/03-execution/status/intent-analysis/INTENT-PANEL-GAPS-AND-VIEW-TYPE-SPECIFICITY.md` |
| Per-view-type semantic palette and matrix | `docs/01_ELEMENTS/03_VIEWS/09_VIEW_INTENT_SYSTEM_DEEP_ANALYSIS.md` §2 |
| Eight-stage engineering schedule (S1–S8) | `docs/01_ELEMENTS/03_VIEWS/10_VIEW_INTENT_SYSTEM_IMPLEMENTATION_PLAN.md` |
| Multi-view collaboration sync | `docs/02-decisions/contracts/30-REAL-TIME-COLLABORATION-CONTRACT.md` |
| Section / Elevation view geometry | `docs/02-decisions/contracts/22-SECTION-AND-ELEVATION-VIEW-CONTRACT.md` |
| SVP header parity | `docs/02-decisions/contracts/17-ENHANCED-SPLIT-VIEW-CONTRACT.md`, doc 07 Phase 5 |

---

## 10. Conclusion

The screenshots from 2026-04-26 captured a Properties panel mid-transition: a deprecated V/G Settings card sits beside a half-finished Visibility Intent block, while five other sections (Output, View Range, Crop, Underlay, AI Intent) silently bypass the Intent system the user expects to control them.

The path forward, from this analysis, is two simultaneous moves:

1. **Per-view-type-aware panel**, driven by one config table shared with the Intent editor (§3).
2. **Intent as orchestration spine**, with a four-mode binding affordance (§2.3) and resolver helpers that make every Intent-managed field render with a source indicator and a per-row reset (§6.2 / Stage P2).

Both moves are additive to the existing data model. No `ViewDefinition` field is deleted; no Intent record is migrated destructively. The result satisfies the user's literal request: **the user reaches every view-property field through the Intent panel — whether the view is bound to a default Intent, a custom Intent, a freshly-created inline Intent, or no Intent at all — and the controls shown are exactly those the active view's `viewType` actually uses.**

The three new Properties-panel stages (P1–P3) cost ~3 engineering days on top of the eight stages in doc 10, for a total of ~12 days. P1 alone delivers the immediate visible win (no more legacy V/G card, no more "AI Intent vs Visibility Intent" naming collision); P2 + P3 deliver the full orchestration model.
