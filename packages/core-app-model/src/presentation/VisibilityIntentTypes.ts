/**
 * VisibilityIntentTypes — Contract 25 §9
 *
 * Canonical type definitions for the PRYZM Visibility Intent System (BIM 3.0).
 *
 * Contract compliance:
 *   Contract 25 §1  — Final rendering equation types
 *   Contract 25 §3  — ViewGeometryLens (see ViewDefinitionTypes.ts)
 *   Contract 25 §4  — ElementGraphicsRules + ElementStateAppearance
 *   Contract 25 §5  — VisibilityIntent + ViewTypeModifier
 *   Contract 25 §6  — ViewIntentInstance
 *   Contract 25 §7  — OverrideLayer
 *   Contract 25 §9  — Complete data model schemas
 *
 * Purity rules (Contract 05 §4):
 *   - No DOM, no Three.js, no rendering imports.
 *   - No side effects — pure data interfaces only.
 *   - PenZone intentionally NOT imported here; ElementState is the semantic
 *     counterpart defined at this layer (both map 1-to-1, conversion in
 *     IntentRuleResolver).
 */

// ─── Element State ────────────────────────────────────────────────────────────

/**
 * The four visibility states an element can occupy relative to a view's
 * cut plane and view range.
 *
 * Semantic mapping to PenZone (GraphicsRulesEngine / PenWeightTable):
 *   'cut'        → 'CUT'
 *   'beyond'     → 'BEYOND'
 *   'hidden'     → 'HIDDEN'
 *   'projection' → 'PROJECTION'
 */
export type ElementState = 'cut' | 'beyond' | 'hidden' | 'projection';

// ─── Line and Fill Appearance ─────────────────────────────────────────────────

/**
 * Line appearance descriptor.
 *
 * Mapping to PenStyle (PenWeightTable.ts):
 *   weight  → PenStyle.widthMm
 *   colour  → PenStyle.color
 *   opacity → PenStyle.opacity
 *   style   → derived from PenStyle.dashPx:
 *                null       = 'solid'
 *                [4,3]      = 'dashed'
 *                [2,2]      = 'dotted'
 *                [8,4,2,4]  = 'chain'
 */
export interface LineAppearance {
    /** Line style — solid, dashed, dotted, or chain (long-dash/dot). */
    style:   'solid' | 'dashed' | 'dotted' | 'chain';
    /** Line weight in millimetres. AEC convention: 0.13 / 0.18 / 0.25 / 0.35 / 0.50 / 0.70 mm. */
    weight:  number;
    /** CSS colour string. Undefined = inherit from document theme (usually '#000000'). */
    colour?: string;
    /**
     * Opacity factor 0.0–1.0.
     * 1.0 = fully opaque (default).
     * Used for beyond-zone elements which conventionally render at ~55% opacity.
     */
    opacity: number;
}

/**
 * Fill (surface) appearance descriptor.
 *
 * Applied to closed element regions in plan view cut state (poche) and
 * solid fill zones. In 3D and projection views, fill is rarely used.
 */
export interface FillAppearance {
    /**
     * Fill style:
     *   'none'  — no fill; element outline only.
     *   'solid' — flat solid colour fill.
     *   'poche' — architectural poche (solid fill, typically black or dark grey).
     *   'hatch' — named hatch pattern (see pattern field + HatchPatternLibrary).
     */
    style:    'none' | 'solid' | 'poche' | 'hatch';
    /**
     * Named hatch pattern key from HatchPatternLibrary.
     * Required when style = 'hatch'. Ignored otherwise.
     * Built-in values: 'diagonal-45' | 'diagonal-cross' | 'dot-grid' | 'brick'
     */
    pattern?: string;
    /** CSS colour string. Undefined = use black for poche, grey for solid. */
    colour?:  string;
    /** Fill opacity 0.0–1.0. */
    opacity:  number;
}

// ─── Element State Appearance ─────────────────────────────────────────────────

/**
 * Complete visual appearance for an element in a single state.
 * One of these records exists per (elementType × state) combination in an intent.
 */
export interface ElementStateAppearance {
    /** Whether the element is drawn at all in this state. */
    visible:      boolean;
    /** Line / edge appearance. */
    line:         LineAppearance;
    /** Fill / surface appearance. */
    fill:         FillAppearance;
    /**
     * Ghost style when the element is overridden to 'ghost' via the OverrideLayer.
     * 'fade'  — element rendered at reduced opacity (ghostOpacity).
     * 'dash'  — element rendered with dashed linework.
     * 'none'  — no ghost style; ghosting falls back to full hide.
     */
    ghostStyle?:  'fade' | 'dash' | 'none';
    /** Opacity used when ghostStyle = 'fade'. Range 0.0–1.0. Default: 0.35. */
    ghostOpacity?: number;
    /**
     * Symbolic rendering rule key (Phase 3 — SymbolicRuleRenderer).
     * Only meaningful in the 'projection' state for plan views.
     * Examples: 'plan-door-swing' | 'plan-window-cased'
     * When present the SymbolicRuleRenderer draws 2D symbols instead of raw geometry.
     */
    symbolicRule?: string;
    /**
     * Stage S5 — 3D surface appearance hints applied by the 3D renderer.
     * Only consumed in '3d' (and 'render') views; ignored by 2D projection.
     */
    surface3D?:    ThreeDimensionalAppearance;
}

// ─── Three-Dimensional Appearance (Stage S5) ──────────────────────────────────

/**
 * Per-state surface descriptor consumed by the 3D renderer (FragmentMaterial /
 * GroupedFragmentBuilder) when an intent owns a view's 3D look.
 *
 * All fields are optional — the renderer falls back to its built-in default
 * material when a field (or the whole record) is undefined.
 */
export interface ThreeDimensionalAppearance {
    /** CSS hex colour for the diffuse surface tint. */
    colour?:        string;
    /** Surface opacity 0.0–1.0; values < 1 enable transparent rendering. */
    opacity?:       number;
    /** Whether to render edge overlay lines on the 3D mesh. */
    edges?:         boolean;
    /** Material model — 'flat' uses Lambert; 'pbr' uses PBR; 'unlit' uses MeshBasic. */
    material?:      'flat' | 'pbr' | 'unlit';
    /** PBR-only — metalness factor 0.0–1.0. */
    metalness?:     number;
    /** PBR-only — roughness factor 0.0–1.0. */
    roughness?:     number;
}

// ─── Element Graphics Rules ───────────────────────────────────────────────────

/**
 * Complete appearance rules for a single element type across all four states.
 * Stored in VisibilityIntent.elementRules keyed by elementType string.
 *
 * Special key '__default__' provides a fallback for element types not
 * explicitly listed in the intent.
 */
export interface ElementGraphicsRules {
    /** Element type identifier matching CategoryFromFlags / ElementTypeRegistry. */
    elementType:  string;
    /**
     * Stage A4 (Wave 4) — element-type visibility toggle.
     *
     * The canonical "exclude furniture from RCP" affordance. When `false`, the
     * resolver short-circuits to a fully hidden appearance (zero-pen, opacity 0)
     * regardless of the requested state.
     *
     * Defaults to `true` when omitted, preserving existing behaviour for every
     * legacy intent. Authored via the per-view-type rule matrix (Wave 4.5 UI)
     * which dispatches `SetIntentProfileElementVisibilityCommand`.
     */
    visible?:     boolean;
    /** Appearance when the element is physically cut by the cut plane. */
    cut:          ElementStateAppearance;
    /** Appearance when the element is visible below the cut plane (in projection). */
    projection:   ElementStateAppearance;
    /** Appearance when the element is below the view depth limit. */
    beyond:       ElementStateAppearance;
    /** Appearance when the element is outside the view range (invisible by default). */
    hidden:       ElementStateAppearance;
}

export interface ViewTypeModifierStateTransform {
    sourceState?: ElementState;
    lineWeightMultiplier?: number;
}

// ─── Appearance Patch ─────────────────────────────────────────────────────────

/**
 * A deep-partial appearance patch used in modifier statePatch records.
 * Unlike Partial<ElementStateAppearance>, the line and fill sub-objects
 * are themselves Partial — callers need only specify the fields they want
 * to override; all other fields inherit from the resolved base appearance.
 */
export type AppearancePatch = {
    visible?:       boolean;
    line?:          Partial<LineAppearance>;
    fill?:          Partial<FillAppearance>;
    ghostStyle?:    'fade' | 'dash' | 'none';
    ghostOpacity?:  number;
    symbolicRule?:  string;
    /**
     * Wave 8 / Stage S5 — 3D-only surface descriptor, partial so a patch can
     * specify e.g. only `surface3D.colour` without clobbering other 3D fields
     * already set on the target appearance.
     */
    surface3D?:     Partial<ThreeDimensionalAppearance>;
};

// ─── View Type Modifier ───────────────────────────────────────────────────────

/**
 * A per-view-type patch applied on top of an intent's ElementGraphicsRules.
 *
 * Modifiers let a single intent express different appearances across view types
 * without forking the intent. For example:
 *   - Plan view: door projection state → symbolicRule = 'plan-door-swing'
 *   - Section view: wall cut state → line.weight *= 1.5
 *
 * Modifiers are applied AFTER the base intent rules at priority 5000 (phase 2+).
 */
export interface ViewTypeModifier {
    /**
     * View type this modifier applies to.
     * Matches ViewDefinitionTypes.ViewType values.
     */
    viewType:     string;
    /**
     * Element type this modifier applies to.
     * Undefined = modifier applies to ALL element types for this view type.
     */
    elementType?: string;
    /**
     * Partial appearance patch per state.
     * Only the defined states and their defined properties are merged —
     * all other properties retain the base intent values.
     * Uses AppearancePatch so line/fill sub-objects can be partially specified.
     */
    statePatch:   Partial<Record<ElementState, AppearancePatch>>;
    stateTransform?: Partial<Record<ElementState, ViewTypeModifierStateTransform>>;
    /**
     * Stage S6 — Reflected Ceiling Plan inversion helper.
     * Lists element-states whose source geometry should be sourced from the
     * inverted (mirrored) view direction. The 3D resolver mirrors normals and
     * winding for any state present in this set.
     */
    invertedSourceStates?: ElementState[];
}

// ─── View Type Profile (Wave 4 / Stage S3) ────────────────────────────────────

/**
 * Per-(elementType) rule patch carried inside a `ViewTypeProfile`.
 *
 * Compared with `ElementGraphicsRules` this is fully partial: each per-state
 * appearance slot is an `AppearancePatch` (partial line/fill/visible), and the
 * element-type-level `visible` flag is independent of the base rule's flag.
 * Only the slots present in the patch override the base rule; everything
 * else inherits.
 */
export interface ProfileElementRulePatch {
    /**
     * Stage A4 — element-type visibility flag scoped to this view-type.
     *
     * When `false`, hides this element type for views of the enclosing
     * `viewType` regardless of state. When omitted, falls back to the base
     * `ElementGraphicsRules.visible` flag.
     */
    visible?:    boolean;
    cut?:        AppearancePatch;
    projection?: AppearancePatch;
    beyond?:     AppearancePatch;
    hidden?:     AppearancePatch;
}

/**
 * Stage S3 / Wave 4 — view-type profile.
 *
 * The single per-view-type bucket of overrides + seeds carried by an Intent.
 * Lives under `VisibilityIntent.viewTypeProfiles[viewType]`. The resolver
 * applies `elementRules` at priority 4000 (above base rules, below the
 * legacy `viewTypeModifiers` array). The remaining slots are seeds + defaults:
 *   - When a new view of this `viewType` is created from this Intent, its
 *     `ViewDefinition` populates its viewRange / crop / underlay / output
 *     settings from these slots before any user edits (seed role).
 *   - When a bound view's setting is undefined, the Wave 5 resolver helpers
 *     (`resolveViewRange` / `resolveCrop` / `resolveUnderlay` / `resolveOutput`)
 *     return the profile slot as the default with `source: 'profile'`.
 *
 * Slot types are `Partial<...>` so a profile can specify just the fields it
 * cares about — every absent field falls through to the next layer in the
 * resolver's precedence chain (intent → system-default).
 */
export interface ViewTypeProfile {
    /**
     * Per-element-type rule patches indexed by elementType string.
     * Special key `__default__` is the fallback for unrecognised types.
     * Merged over the base `intent.elementRules[elementType]` at resolver
     * priority 4000 (Stage B3).
     */
    elementRules?: Record<string, ProfileElementRulePatch>;
    /** Default view-range settings for views of this viewType (Wave 5 — resolveViewRange). */
    viewRange?:    Partial<import('../views/ViewDefinitionTypes').ViewRangeSettings>;
    /** Default crop region (Wave 5 — resolveCrop). */
    crop?:         Partial<import('../views/ViewDefinitionTypes').ViewCropSettings>;
    /** Default underlay settings (Wave 5 — resolveUnderlay). */
    underlay?:     Partial<import('../views/ViewDefinitionTypes').ViewUnderlaySettings>;
    /** Default output settings — scale / detail level / visual style (Wave 5 — resolveOutput). */
    output?:       Partial<import('../views/ViewDefinitionTypes').ViewOutputSettings>;
}

// ─── Purpose Modifier ─────────────────────────────────────────────────────────

/**
 * Built-in view purpose values for ViewDefinition.purpose and PurposeModifier.purpose.
 * Represents the intended use of a view in the project delivery workflow.
 *
 * Distinct from ViewSemanticContext.purpose (which is an AI/LLM semantic tag).
 */
export type ViewPurpose =
    | 'construction-docs'
    | 'design-review'
    | 'coordination'
    | 'presentation'
    | (string & {});

/**
 * A purpose-scoped appearance patch applied on top of an intent's resolved
 * appearance (after view-type modifiers) when the active view carries a
 * matching ViewDefinition.purpose value.
 *
 * Applied at priority 6000 — after view-type modifiers (5000) and before
 * element-level OverrideLayer overrides (50000).
 *
 * Use cases:
 *   construction-docs  → poche fills, heavy pen weights for printed sheets
 *   design-review      → toned surfaces, lighter linework for screen review
 *   coordination       → discipline isolation, clash highlight colours
 *   presentation       → rendered surface fills, reduced clutter
 */
export interface PurposeModifier {
    /**
     * View purpose this modifier activates for.
     * Matches ViewDefinition.purpose values.
     */
    purpose:      ViewPurpose;
    /**
     * Element type this modifier applies to.
     * Undefined = modifier applies to ALL element types for this purpose.
     */
    elementType?: string;
    /**
     * Partial appearance patch per state.
     * Merges on top of the view-type modifier results — later keys win.
     * Uses AppearancePatch so line/fill sub-objects can be partially specified.
     */
    statePatch:   Partial<Record<ElementState, AppearancePatch>>;
}

// ─── Visibility Intent ────────────────────────────────────────────────────────

/**
 * A named, versioned master template that defines element appearance across
 * every state and every element type in a project.
 *
 * Views bind to an intent via ViewIntentInstance. Intents are shared and
 * immutable from the view's perspective — views cannot edit the master intent,
 * only add local overrides via OverrideLayer.
 *
 * System intents (isSystem = true) are loaded from SystemIntents.ts fixture
 * data at startup and are never written to the database. User intents are
 * persisted in the `visibility_intents` PostgreSQL table.
 */
export interface VisibilityIntent {
    /** Stable UUID — never changes after creation. */
    id:          string;
    /**
     * Stage S8 — schema migration version.
     * Bumped by IntentSchemaMigrations.ts when the intent shape changes.
     * Legacy rows missing this field are treated as v1 on read.
     */
    schemaVersion?: number;
    /** Human-readable display name. */
    name:        string;
    /** Optional description visible in the Intent selector UI. */
    description: string;
    /**
     * Monotonically increasing version counter.
     * Bumped by VisibilityIntentStore on every update.
     * Used by GraphicsRulesEngine to detect cache staleness.
     */
    version:     number;
    /**
     * System intents are read-only — they cannot be edited or deleted.
     * They are not persisted to the database.
     */
    isSystem:    boolean;
    /** ISO-8601 timestamp string. */
    createdAt:   string;
    /** ISO-8601 timestamp string. Updated on every write. */
    updatedAt:   string;
    /**
     * Element appearance rules indexed by elementType string.
     * Special key '__default__' is the fallback for unrecognised element types.
     */
    elementRules:      Record<string, ElementGraphicsRules>;
    /**
     * View-type modifiers applied on top of element rules.
     * Processed in array order — later modifiers override earlier ones for
     * the same (viewType × elementType × state) combination.
     *
     * @deprecated Wave 4 — being superseded by `viewTypeProfiles`. Both fields
     * coexist for back-compat: the resolver applies profiles first (priority
     * 4000) then modifiers (priority 5000). New authoring should target
     * `viewTypeProfiles`. Forward-migration of legacy modifiers into profiles
     * lands in Wave 4.5 alongside the per-view-type accordion editor.
     */
    viewTypeModifiers: ViewTypeModifier[];
    /**
     * Stage S3 / Wave 4 — per-view-type profiles.
     *
     * Indexed by `ViewType` string (e.g. 'plan', 'section', '3d'). Each profile
     * carries view-type-specific element-rule patches plus seed defaults for
     * view range / crop / underlay / output that are sown into a new view
     * when one is created from this intent.
     *
     * Optional and additive: legacy intents have no profiles and resolve
     * exactly as before. Populated by the per-view-type accordion editor
     * (Wave 4.5 UI).
     */
    viewTypeProfiles?: Record<string, ViewTypeProfile>;
    /**
     * Purpose modifiers applied after view-type modifiers at priority 6000.
     * Activated when the active view's ViewDefinition.purpose matches the
     * modifier's purpose field.
     * Undefined / empty = no purpose-specific overrides.
     */
    purposeModifiers?: PurposeModifier[];
    /**
     * Plan-view depth defaults.
     * Controls how far below the level floor plan views show `:beyond` reference linework.
     * When undefined the EdgeProjectorService defaults to 0 (no below-level geometry).
     * System intents set this to 1.20 m (architectural convention).
     */
    planViewRange?: PlanViewRangeDefaults;
    /**
     * Stage P0 (Master Implementation Plan Wave 1) — View Template absorption.
     *
     * Optional seed payload that lets an Intent act as a "view recipe": when a
     * new view is created from this Intent (CreateViewFromIntentDialog), these
     * values seed the new ViewDefinition's identity, scale, level, and locked
     * fields. Replaces the legacy ViewTemplate concept (ViewTemplateStore is
     * now `@deprecated readable`).
     *
     * Undefined = the Intent is appearance-only (the historical default) and
     * does not surface in the "Create View from Intent" picker.
     *
     * See: docs/03-execution/status/intent-analysis/MASTER-IMPLEMENTATION-PLAN.md §4 (Wave 1 / P0),
     *      docs/03-execution/status/intent-analysis/INTENT-AS-VIEW-PROPERTIES-ORCHESTRATION-LAYER.md §2.6.1, §4.4.
     */
    viewSeed?: ViewSeed;
}

// ─── View Seed (P0 / Wave 1 — View Template absorption) ──────────────────────

/**
 * Identity, scale, and lock-field defaults stamped on to a new view created
 * from an Intent. Maps 1:1 to the legacy `ViewTemplate` payload (Phase VII)
 * but lives inside the Intent so a single artefact owns both appearance
 * (elementRules / modifiers) AND view-creation defaults.
 *
 * Field-by-field correspondence with the legacy ViewTemplate:
 *   nameTemplate  ← ViewTemplate.name (or `intent.name` when absent)
 *   discipline    ← ViewTemplate.discipline
 *   purpose       ← ViewTemplate.output.purpose            (when present)
 *   defaultPhase  ← ViewTemplate.temporal.phaseFilter      (when present)
 *   initialScale  ← ViewTemplate.output.scale              (when present)
 *   initialLevel  ← 'auto'  (templates never carried a per-view level binding)
 *   lockedFields  ← ViewTemplate.lockedFields (subset of ViewTemplateLock keys)
 *   perViewType   ← (new — not present in legacy templates; reserved for Wave 4)
 */
export type ViewSeedLockableField =
    | 'scale'
    | 'detailLevel'
    | 'visualStyle'
    | 'displayModel'
    | 'shadows'
    | 'cropActive'
    | 'underlayEnabled'
    | 'phase'
    | 'discipline'
    | 'purpose';

export type ViewSeedDiscipline = 'architecture' | 'structure' | 'mep' | 'all';

export type ViewSeedPurpose =
    | 'construction-docs'
    | 'design-development'
    | 'schematic-design'
    | 'as-built'
    | 'coordination'
    | 'presentation';

export interface ViewSeed {
    /**
     * Display-name template for the new view.
     * May contain `{level}`, `{discipline}`, `{purpose}` placeholders that
     * `resolveViewSeed()` (Wave 5) substitutes at creation time.
     * When undefined, the new view inherits `intent.name`.
     */
    nameTemplate?: string;
    /** Discipline the new view should be tagged with. */
    discipline?:   ViewSeedDiscipline;
    /** Documentation purpose used by Stage A8 / purposeModifiers. */
    purpose?:      ViewSeedPurpose;
    /** Phase filter id stamped on the new ViewDefinition.temporal block. */
    defaultPhase?: string;
    /** Initial drawing scale (e.g. 50 → 1:50). */
    initialScale?: number;
    /**
     * 'this' = bind to the level the user is currently working on,
     * 'auto' = let the resolver pick the active level when the view is created.
     */
    initialLevel?: 'this' | 'auto';
    /**
     * Fields the new view treats as locked (the user cannot override locally).
     * Mirrors the historical `ViewTemplate.lockedFields` semantics.
     */
    lockedFields?: ViewSeedLockableField[];
    /**
     * Optional per-view-type overrides for `nameTemplate` and `initialScale`.
     * Reserved for Wave 4 (per-view-type architecture); the migration leaves
     * this undefined for legacy templates.
     */
    perViewType?: Record<string, { nameTemplate?: string; initialScale?: number }>;
}

// ─── Override Layer ───────────────────────────────────────────────────────────

/**
 * Target specifier for visibility and graphic overrides.
 * Scoped to a single element, an element type, or a category.
 */
export type OverrideTargetKind = 'element' | 'elementType' | 'category';

/**
 * A single visibility override — hides, isolates, or ghosts a target.
 * Stored in ViewIntentInstance.localOverrides.visibilityOverrides.
 */
export interface VisibilityOverride {
    /** What kind of target is specified. */
    targetKind: OverrideTargetKind;
    /**
     * ID of the target:
     *   targetKind = 'element'     → element UUID
     *   targetKind = 'elementType' → type string (e.g. 'wall')
     *   targetKind = 'category'    → category string (e.g. 'structural')
     */
    targetId:   string;
    /** Visibility action to apply. */
    action:     'hide' | 'isolate' | 'ghost';
    /** Ghost line style. Required when action = 'ghost'. */
    ghostStyle?: 'fade' | 'dash';
}

/**
 * A single graphic style override for a target in a specific state.
 * Overrides one or more properties of the target's ElementStateAppearance.
 * Stored in ViewIntentInstance.localOverrides.graphicOverrides.
 */
export interface GraphicOverride {
    /** What kind of target is specified. */
    targetKind: OverrideTargetKind;
    /** ID of the target (same semantics as VisibilityOverride.targetId). */
    targetId:   string;
    /** Which element state this override applies to. */
    state:      ElementState;
    /**
     * Partial appearance patch.
     * Only specified properties override the intent; all others inherit.
     */
    patch:      Partial<ElementStateAppearance>;
}

/**
 * The complete collection of per-view-instance overrides.
 * Attached to ViewIntentInstance.localOverrides.
 *
 * An empty OverrideLayer has no visual effect — it is equivalent to the
 * view using the intent directly with no local modifications.
 */
export interface OverrideLayer {
    /**
     * Visibility overrides — hide, isolate, or ghost specific elements/types.
     * Evaluated before graphic overrides in state resolution.
     */
    visibilityOverrides: VisibilityOverride[];
    /**
     * Graphic overrides — change line weight, colour, fill for specific targets.
     * Applied at the highest priority tier (50000) in GraphicsRulesEngine.
     */
    graphicOverrides:    GraphicOverride[];
    /**
     * Whether isolate mode is active for this view.
     * When true, only elements listed in visibilityOverrides with action='isolate'
     * are rendered; all other elements are treated as hidden.
     */
    isolateActive:       boolean;
}

/** An empty OverrideLayer — the default state for every new ViewIntentInstance. */
export const EMPTY_OVERRIDE_LAYER: Readonly<OverrideLayer> = Object.freeze({
    visibilityOverrides: [],
    graphicOverrides:    [],
    isolateActive:       false,
});

// ─── Plan View Range Defaults ─────────────────────────────────────────────────

/**
 * Intent-level defaults controlling how far below the active level floor
 * plan views extend their "beyond" reference zone.
 *
 * These values drive EdgeProjectorService.project() when the ViewDefinition
 * does not carry an explicit ViewRangeSettings.depth override.
 *
 * Architectural convention: 1.20 m below the floor (captures structure
 * from the storey beneath: beams, top-of-slab edges, column capitals).
 */
export interface PlanViewRangeDefaults {
    /**
     * Metres below the level floor elevation to project as `:beyond` linework
     * in 'plan' views. 0 = disabled (no below-level geometry shown).
     * Architectural default: 1.20.
     */
    belowLevelDepth?: number;
    /**
     * Metres below the level floor elevation to project as `:beyond` for
     * 'structural-plan' views. Falls back to belowLevelDepth when undefined.
     */
    structuralPlanBelowLevelDepth?: number;
}

// ─── View Intent Instance ─────────────────────────────────────────────────────

/**
 * The binding record between a view and a VisibilityIntent.
 *
 * Each ViewDefinition has at most one ViewIntentInstance at any time.
 * The instance holds the view's chosen intent ID plus any local overrides
 * that deviate from the master intent.
 *
 * Stored in ViewIntentInstanceStore and serialised with the project.
 */
export interface ViewIntentInstance {
    /** Stable UUID for this binding record. */
    id:            string;
    /** The ViewDefinition this instance belongs to. */
    viewId:        string;
    /** The VisibilityIntent this view is bound to. */
    intentId:      string;
    /**
     * View-local overrides applied on top of the master intent.
     * Empty = view displays exactly what the intent specifies.
     * Non-empty = "Customised" indicator shown in the View Browser.
     */
    localOverrides: OverrideLayer;
    /** ISO-8601 timestamp. Set when the instance is created. */
    createdAt:     string;
    /**
     * ISO-8601 timestamp. Updated whenever intentId changes or
     * localOverrides is mutated.
     */
    updatedAt:     string;
    /**
     * Master Implementation Plan Wave 6 / Stage A9 — version pin.
     *
     * When set, this view tracks the bound intent at exactly this version.
     * If `intent.version > pinnedVersion`, the resolver still uses the
     * latest intent (the field is informational, not a freeze) but the UI
     * shows the diverged banner with `[ Take vN ] [ Stay pinned ]`.
     *
     * Absence (the default) means "always-latest" — no banner shown,
     * the view picks up every intent edit immediately. Legacy bindings
     * created before Wave 6 have no pin and follow always-latest semantics.
     *
     * Mutated only by `PinViewIntentVersionCommand` and
     * `TakeLatestIntentVersionCommand`.
     */
    pinnedVersion?: number;
}
