/**
 * ViewDefinitionTypes — Phase B (base) + Phase VI (extended)
 *
 * Phase B fields are marked [B] — unchanged.
 * Phase VI additions are marked [VI] — all new fields are optional.
 *
 * Contract compliance:
 *   §01 §3.3  — ViewDefinitionStore implements an ElementStore-like interface
 *   §02        — All levelId references link to BimManager spatial authority
 *   §03 §1.1  — ViewDefinition is a first-class schema with stable fields;
 *                all fields are serialisable primitives or nested plain objects
 *   §04        — Serialisable; accessible via AIReadModel gateway
 *   §05        — Pure data types; no DOM, no Three.js, no rendering imports
 *   §07        — No server routes; client-side only
 *
 * Migration notes (Phase B → Phase VI):
 *   All new fields are optional. Phase B views deserialise without any new
 *   fields — the engine falls back to undefined, which means "use defaults".
 *   No existing field name or type has been changed.
 */

// ── Phase C stub — lightweight rule reference stored on ViewDefinition ────────
// Full VisibilityRule objects live in VisibilityRuleEngine. ViewDefinition.rules
// holds only this reference so the store can list which rules are associated
// with a view without duplicating data.
export interface VisibilityRuleStub {                   // [B] unchanged
    id:      string;
    label?:  string;
    enabled: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// VIEW TYPE                                                              [VI]
// Extended union — all Phase B values remain valid.
// ═════════════════════════════════════════════════════════════════════════════

export type ViewType =
    // ── Phase B ──────────────────────────────────────────────────────────────
    | 'plan'              // Floor Plan — orthographic top-down
    | '3d'               // 3D view — perspective or orthographic orbit
    | 'section'          // Building section — orthographic cut through
    | 'elevation'        // Elevation — orthographic exterior/interior face
    | 'analysis'         // Analysis view — colour-coded by parameter value
    // ── Phase VI ─────────────────────────────────────────────────────────────
    | 'ceiling-plan'     // Reflected Ceiling Plan — looking upward
    | 'structural-plan'  // Structural framing plan (beams/columns from above)
    | 'detail'           // Callout / detail — enlarged region of a parent view
    | 'drafting'         // 2D annotation-only view (no model elements)
    | 'legend'           // Symbol legend view
    | 'render'           // High-fidelity render output view
    | 'walkthrough'      // Animated camera path (future)
    ;

/** All valid ViewType values — used for validation in commands. */
export const ALL_VIEW_TYPES: readonly ViewType[] = [
    'plan', '3d', 'section', 'elevation', 'analysis',
    'ceiling-plan', 'structural-plan', 'detail', 'drafting', 'legend', 'render', 'walkthrough',
] as const;

/** ViewType values that support ViewRangeSettings (plan-family views). */
export const PLAN_VIEW_TYPES: readonly ViewType[] = [
    'plan', 'ceiling-plan', 'structural-plan',
] as const;

// ═════════════════════════════════════════════════════════════════════════════
// SPATIAL CONTEXT                                                        [B]
// ═════════════════════════════════════════════════════════════════════════════

export interface ViewSpatialContext {                   // [B] unchanged
    /** Reference to a BimManager level — §02 spatial authority. */
    levelId?: string;
    /** Section cut plane — for section and elevation views. */
    sectionPlane?: {
        normal:   [number, number, number];
        constant: number;
    };
    /**
     * Loose 3D AABB hint — used for 3D/analysis views.
     * Superseded by ViewCropSettings.region for plan views.
     */
    boundingBox?: {
        min: [number, number, number];
        max: [number, number, number];
    };

    // ── 2D documentation pipeline fields (DOC-1.2) ───────────────────────────

    /**
     * Unit vector describing the projection direction for EdgeProjectorService.
     * Default (0,-1,0) = plan view (looking downward).
     * Use VIEW_PROJECTION_DIRECTIONS presets for standard orientations.
     * §02 §5: resolved at projection time, never stored as a THREE.Vector3.
     */
    projectionDirection?: { x: number; y: number; z: number };

    /**
     * Simplified vertical range for EdgeProjectorService.
     *
     * DOC-1.5d — DEFINITIVE REFERENCE FRAME CONTRACT:
     *   Both nearOffset and farOffset are measured IN METRES FROM THE LEVEL FLOOR ELEVATION.
     *   Level floor elevation = BimManager.getLevelById(levelId).elevation  (§02 §1.2).
     *
     *   nearOffset = distance above floor where the cut plane sits.
     *                Default: 1.2 m (standard AEC 1200 mm cut through doors/windows).
     *   farOffset  = distance above floor of the TOP of the view range.
     *                Default: 3.0 m (captures a full standard storey).
     *
     *   EdgeProjector clip planes (world-Y, Y-up right-handed):
     *     nearPlane = floorElevation + nearOffset   (cut plane — upper clipping boundary)
     *     farPlane  = floorElevation + farOffset    (top of view range — upper extent)
     *
     *   Elements with any geometry between [floorElevation, floorElevation + farOffset]
     *   are visible in projection. The cut plane at (floorElevation + nearOffset) is
     *   where walls, doors, and windows are "cut through" in plan view.
     *
     *   Elements above farOffset (e.g. beams at 3.5 m in a 4.0 m storey) are excluded
     *   from a standard plan. Use VIEW_RANGE_PRESETS.structural (farOffset: 4.0) to
     *   show ceiling beams.
     *
     *   For RCP views: projectionDirection is (0,+1,0); nearOffset/farOffset apply
     *   downward from the ceiling datum.
     *
     * Distinct from ViewRangeSettings (the interactive plan-view range — top/cut/bottom/depth
     * level-bound pairs). This field is the flat scalar window fed to the OBC EdgeProjector.
     */
    viewRange?: {
        nearOffset: number;
        farOffset:  number;
    };

    /**
     * World-space XZ crop window passed to EdgeProjectorService.
     * Enables detail-view projections that cover only a sub-region of the level.
     * Distinct from ViewCropSettings (interactive clipping) — this is the
     * geometry pre-filter applied before the OBC EdgeProjector runs.
     */
    cropRegion?: {
        minX: number;
        minZ: number;
        maxX: number;
        maxZ: number;
    };

    sectionVolume?: ViewSectionVolume;
}

/**
 * Geometry-only lens consumed by projection/visibility classification.
 * Presentation properties such as line weight, colour, fill, and overrides stay
 * outside this type and are resolved through the Visibility Intent pipeline.
 */
export type ViewGeometryLens = Pick<
    ViewSpatialContext,
    'levelId' | 'sectionPlane' | 'boundingBox' | 'projectionDirection' | 'viewRange' | 'cropRegion' | 'sectionVolume'
>;

export interface ViewSectionVolume {
    origin: [number, number, number];
    direction: [number, number, number];
    width: number;
    height: number;
    near: number;
    far: number;
}

// ── Preset projection direction vectors (DOC-1.2) ────────────────────────────
// Consumed by EdgeProjectorService; plain objects — no THREE.js imports.
// All vectors are unit-length and right-handed (PRYZM world: Y = up).

export const VIEW_PROJECTION_DIRECTIONS = {
    /** Standard floor plan — looking downward along -Y. */
    plan:           { x:  0, y: -1, z:  0 },
    /** Reflected ceiling plan — looking upward along +Y. */
    ceilingPlan:    { x:  0, y:  1, z:  0 },
    /** Front elevation — looking along -Z (south face). */
    elevationFront: { x:  0, y:  0, z: -1 },
    /** Back elevation — looking along +Z (north face). */
    elevationBack:  { x:  0, y:  0, z:  1 },
    /** Left elevation — looking along -X (west face). */
    elevationLeft:  { x: -1, y:  0, z:  0 },
    /** Right elevation — looking along +X (east face). */
    elevationRight: { x:  1, y:  0, z:  0 },
} as const;

// ═════════════════════════════════════════════════════════════════════════════
// TEMPORAL CONTEXT                                                  [B + VI]
// ═════════════════════════════════════════════════════════════════════════════

export interface ViewTemporalContext {
    /** [B] Phase filter as literal string (Phase B). */
    phaseFilter?: 'Existing' | 'Demolition' | 'New Construction' | 'Future';
    /**
     * [VI] Reference to a named PhaseFilter entity (PhaseFilterStore, Phase VII).
     * Preferred over the literal phaseFilter string once Phase VII ships.
     * Both coexist during migration — engine reads phaseFilterId first.
     */
    phaseFilterId?: string;
    /**
     * [VI] The "current phase" of this view — the phase at which the project
     * is evaluated. Elements newer than this phase are shown according to
     * the active phase filter.
     */
    phase?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE VI — OUTPUT SETTINGS
// Controls HOW the view is drawn — not WHAT is visible (that is rules[]).
// ═════════════════════════════════════════════════════════════════════════════

/** Visual rendering style for a view. Maps to PresentationEngine modes. */
export type ViewVisualStyle =
    | 'wireframe'        // Edges only, no surfaces
    | 'hiddenLine'       // Edges with hidden lines removed
    | 'shaded'           // Flat shaded surfaces
    | 'shadedWithEdges'  // Shaded + edge overlay (default for plan/section)
    | 'realistic'        // PBR materials with lighting
    ;

export interface ViewOutputSettings {
    /**
     * Drawing scale as a ratio denominator (e.g. 100 = 1:100, 50 = 1:50).
     * Governs annotation symbol sizes, line weights, and dimension text height.
     */
    scale?: number;

    /**
     * Custom scale denominator — used when a non-standard ratio is needed.
     * Takes precedence over `scale` when present.
     */
    customScale?: number;

    /**
     * How model geometry is displayed relative to the reference plane:
     * - 'normal'   — standard display (default)
     * - 'halftone' — all model elements rendered at reduced opacity
     * - 'hidden'   — model elements suppressed (annotation/drafting only)
     */
    displayModel?: 'normal' | 'halftone' | 'hidden';

    /**
     * Level of detail for element geometry representation.
     * Coarse = simplified; Medium = standard; Fine = full geometry.
     */
    detailLevel?: 'coarse' | 'medium' | 'fine';

    /**
     * Visibility of Part elements (for construction documentation workflows):
     * - 'showOriginal' — show original elements, hide parts
     * - 'showParts'    — show divided parts, hide originals
     * - 'showBoth'     — show both simultaneously
     */
    partsVisibility?: 'showOriginal' | 'showParts' | 'showBoth';

    /** Visual rendering style for this view. */
    visualStyle?: ViewVisualStyle;

    /** Whether cast shadows are rendered. */
    shadows?: boolean;

    /** Whether ambient occlusion is enabled. */
    ambientOcclusion?: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE VI — VIEW RANGE (Plan Views only)
// The vertical slice through the building model that controls element
// visibility in plan views.
// All levelId references resolve via BimManager (§02 contract).
// All offset values are in world units (metres).
// ═════════════════════════════════════════════════════════════════════════════

export interface ViewRangeBound {
    /** Reference to a BimManager level ID — §02 spatial authority. */
    levelId: string;
    /** Vertical offset from the level elevation in world units (metres). */
    offset:  number;
}

export interface ViewRangeSettings {
    /**
     * The upper boundary of elements drawn in cut profile.
     * Elements intersecting the cut plane up to this level are shown cut.
     */
    top:    ViewRangeBound;

    /**
     * The horizontal cut plane — elements intersecting this plane
     * are drawn with their cut profiles (section hatching, poche walls).
     * §02 rule: computed as BimManager.getLevelById(cut.levelId).elevation + cut.offset
     */
    cut:    ViewRangeBound;

    /**
     * The lower boundary of elements drawn in projection below the cut plane.
     * Elements between this level and the cut plane are drawn as projected (dashed or thin).
     */
    bottom: ViewRangeBound;

    /**
     * View depth — elements below bottom but above this depth are drawn
     * in projection with the "beyond" line style.
     */
    depth:  ViewRangeBound;
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE VI — CROP SETTINGS
// Controls whether the view's visible extent is clipped to a rectangular
// region. Replaces the loose spatial.boundingBox for plan views.
// ═════════════════════════════════════════════════════════════════════════════

export interface ViewCropSettings {
    /** Whether the crop region is active and clips view rendering. */
    enabled: boolean;

    /**
     * 2D crop region in level-plane coordinates [x, z].
     * Undefined when enabled = false or when the view uses full extent.
     */
    region?: {
        min: [number, number];
        max: [number, number];
    };

    /**
     * Whether annotation elements (dimensions, tags, grid bubbles) are also
     * clipped to the crop region boundary.
     */
    annotationCrop?: boolean;

    /**
     * Far clip for section and elevation views — depth from the cut plane
     * in world units. Undefined means unclipped (show full depth).
     */
    farClip?: {
        /** Optional level reference for the far boundary — §02 spatial authority. */
        levelId?: string;
        /** Offset from the cut plane in world units (metres). */
        offset:   number;
    };
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE VI — UNDERLAY SETTINGS (Plan Views only)
// Shows another level's elements as a ghosted reference in a plan view.
// ═════════════════════════════════════════════════════════════════════════════

export interface ViewUnderlaySettings {
    /** BimManager level ID at the base of the underlay range. */
    baseLevelId?: string;
    /** BimManager level ID at the top of the underlay range. */
    topLevelId?:  string;
    /**
     * Viewing direction of the underlay:
     * - 'lookingDown' — plan view, looking at the level below from above
     * - 'lookingUp'   — reflected ceiling plan, looking at the level above from below
     */
    orientation: 'lookingDown' | 'lookingUp';
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE VI — ANNOTATION VISIBILITY (per-annotation-category overrides)
// ═════════════════════════════════════════════════════════════════════════════

export interface AnnotationVisibilitySettings {
    dimensions?:        boolean;
    grids?:             boolean;
    levels?:            boolean;
    sectionHeads?:      boolean;
    elevationTags?:     boolean;
    spotElevations?:    boolean;
    spotCoordinates?:   boolean;
    roomTags?:          boolean;
    spaceTags?:         boolean;
    genericAnnotation?: boolean;
    detailItems?:       boolean;
    insulation?:        boolean;
    references?:        boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE VI — SEMANTIC CONTEXT (LLM / World Model)
// Human and machine-readable context for AI authoring and World Model queries.
// ═════════════════════════════════════════════════════════════════════════════

export interface ViewSemanticContext {
    /**
     * Primary audience for this view.
     * Guides LLMs on detail level, annotation density, and styling choices.
     */
    audience?: 'client' | 'contractor' | 'engineer' | 'coordination' | 'internal';

    /**
     * Design phase purpose of this view.
     * Used by the World Model to group views by project workflow stage.
     */
    purpose?:
        | 'design'
        | 'documentation'
        | 'coordination'
        | 'analysis'
        | 'presentation'
        | 'review'
        | 'construction'
        ;

    /**
     * Arbitrary semantic tags on the view itself (not on elements).
     * Example: ['fire-safety', 'regulatory-submission', 'level-01']
     */
    tags?: string[];

    /**
     * Human-readable filter descriptions — what subset of the model this view shows.
     * AI-authored. Used in Project Browser tooltips and LLM context.
     * Example: ["Level 1 only", "Structural elements", "New construction phase"]
     */
    filters?: string[];
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE VI — TEMPLATE LOCK
// Tracks which view properties a view manages independently from its
// View Template (Phase VII). All fields default to false = template controls.
// ═════════════════════════════════════════════════════════════════════════════

export interface ViewTemplateLock {
    scale?:               boolean;
    detailLevel?:         boolean;
    visualStyle?:         boolean;
    discipline?:          boolean;
    phaseFilter?:         boolean;
    vgTemplate?:          boolean;
    viewRange?:           boolean;
    crop?:                boolean;
    annotationOverrides?: boolean;
    rules?:               boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// §DAY9 — PER-VIEW GRAPHICS ENGINE OVERRIDES                      [Contract 23]
//
// These types are stored on ViewDefinition and injected into GraphicsRulesEngine
// as priority-9000 (category) and priority-10000 (element) rules whenever a
// view is rendered.  They are fully serialisable (plain objects / primitives).
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Minimal pen-style override record — mirrors `Partial<PenStyle>` from
 * PenWeightTable without importing that file (keeps types pure / no engine deps).
 */
export interface OverridePenStyle {
    /** Line weight in mm (e.g. 0.18, 0.25, 0.50, 0.70). */
    widthMm?:   number;
    /** CSS colour string (e.g. '#ff0000'). */
    color?:     string;
    /** SVG/Canvas dash array in px, or null for solid. */
    dashArray?: number[] | null;
    /** 0–1 opacity factor. */
    opacity?:   number;
}

/**
 * A single per-category style override for a specific view.
 * Injected at priority 9000 (VIEW tier) into GraphicsRulesEngine.
 *
 * zone     — drawing zone: 'CUT' | 'PROJECTION' | 'BEYOND'
 * category — element category: 'wall' | 'column' | 'beam' | 'door' | …
 */
export interface ViewCategoryOverride {
    zone:     string;
    category: string;
    style:    OverridePenStyle;
}

/**
 * A single per-element style override for a specific view.
 * Injected at priority 10000 (ELEMENT tier) into GraphicsRulesEngine.
 */
export interface ViewElementOverride {
    /** UUID of the element this override applies to. */
    elementId: string;
    zone:      string;
    category:  string;
    style:     OverridePenStyle;
}

// ═════════════════════════════════════════════════════════════════════════════
// VIEW DEFINITION — COMPLETE SCHEMA                               [B + VI]
// ═════════════════════════════════════════════════════════════════════════════

export interface ViewDefinition {

    // ── 1. Identity ─────────────────────────────────────────────── [B] ──────
    /** Stable, immutable ID — never re-generated. */
    id:           string;
    /** Display name — editable. */
    name:         string;
    /** View type — extended in Phase VI; all Phase B values remain valid. */
    viewType:     ViewType;

    // ── 2. Dependency hierarchy ──────────────────────────────────── [VI] ────
    /** For callout/detail views: the host view's id. */
    parentViewId?:  string;
    /** Views that are callouts or dependents of this view. */
    dependentIds?:  string[];
    /** Name shown in the title block when this view is placed on a sheet. */
    titleOnSheet?:  string;

    // ── 3. Template & Inheritance ────────────────────────────────── [VI] ────
    /**
     * @deprecated Contract 25b — VG templates are superseded by Visibility
     * Intents. The field is retained for backward compatibility on read
     * (legacy projects) and is converted to a `ViewIntentInstance.intentId`
     * by `runVGToIntentMigration()` on project load. New code MUST NOT write
     * to this field — use `AssignViewIntentCommand` instead.
     *
     * VG Template ID — overrides the model-level VG template for this view.
     * Part of the (legacy) 4-tier VG cascade (Tier 3).
     */
    vgTemplateId?:    string;
    /**
     * View Template ID — a named preset controlling a defined set of view
     * properties (scale, detail level, discipline, phase filter, VG template).
     * Phase VII entity; stored as a reference ID here.
     */
    viewTemplateId?:  string;
    /**
     * Which view properties this view controls independently from its template.
     * Undefined = all properties controlled by the template.
     */
    templateLock?:    ViewTemplateLock;

    /**
     * templateOverrides — per-property deviation tracking. [Phase 12]
     * Key = ViewTemplateProperties field name (e.g. 'scale', 'detailLevel').
     * Value = reason for the deviation (user-entered justification string).
     * Differs from template AND key present → 'derived' (orange badge).
     * Differs from template AND key absent  → 'conflict' (red badge).
     */
    templateOverrides?: Record<string, string>;

    /**
     * viewSyncState — computed by SyncStateEngine. Never written directly. [Phase 12]
     * Reflects whether this view's properties conform to its assigned ViewTemplate.
     */
    viewSyncState?: import('../hierarchy/HierarchyTypes').SyncState;

    // ── 4. Context (Spatial + Temporal) ─────────────────────────── [B] ──────
    /** Spatial anchoring — level, section plane, bounding box. */
    spatial:      ViewGeometryLens;
    /** Temporal/phase context — phase filter. */
    temporal:     ViewTemporalContext;

    // ── 5. Discipline / Scope ────────────────────────────────────── [B] ──────
    /** Architectural, structural, MEP, or all-discipline view. */
    discipline?:     'architecture' | 'structure' | 'mep' | 'all';
    /** Finer-grained sub-discipline (e.g. 'fire-safety', 'hvac'). */
    subDiscipline?:  string;
    /** Scope box ID — limits horizontal extents to a named region. */
    scopeBoxId?:     string;
    /** Design Option this view is scoped to (Phase VII entity). */
    designOptionId?: string;

    // ── 6. Visibility / Graphics ─────────────────────────────────── [B] ──────
    /**
     * Serialisable visibility rules evaluated against SemanticIndex.
     * Phase B: VisibilityRuleStub[] (lightweight reference).
     * Phase C: full VisibilityRule[] (replaced additively, same field name).
     */
    rules:               VisibilityRuleStub[];
    /** Annotation category visibility overrides. */
    annotationOverrides?: AnnotationVisibilitySettings;

    /**
     * §DAY9 — Per-view category pen overrides.
     * Each entry is injected into GraphicsRulesEngine at priority 9000 (VIEW tier)
     * when this view is active.  Only properties in `style` are applied — other
     * properties fall through to lower-priority rules.
     * @deprecated Contract 25 visibility intents supersede ViewDefinition-hosted
     * style overrides; kept only for legacy VG bridge compatibility.
     */
    categoryOverrides?: ViewCategoryOverride[];

    /**
     * §DAY9 — Per-view element pen overrides.
     * Each entry is injected into GraphicsRulesEngine at priority 10000 (ELEMENT tier)
     * when this view is active.  Element-level overrides win over category overrides.
     * @deprecated Contract 25 OverrideLayer supersedes ViewDefinition-hosted
     * style overrides; kept only for legacy VG bridge compatibility.
     */
    elementOverrides?: ViewElementOverride[];

    // ── 7. View Range (Plan Views) ───────────────────────────────── [VI] ────
    /**
     * Vertical slice through the building that defines what is visible in
     * plan views. Applies to: 'plan', 'ceiling-plan', 'structural-plan'.
     * Undefined for section, elevation, 3d, and analysis views.
     */
    viewRange?: ViewRangeSettings;

    // ── 8. Crop Region ───────────────────────────────────────────── [VI] ────
    /** Crop region settings — whether and how the view is clipped. */
    crop?: ViewCropSettings;

    // ── 9. Underlay (Plan Views) ─────────────────────────────────── [VI] ────
    /**
     * Underlay — shows another level's elements as a ghosted reference.
     * Applies to: 'plan', 'ceiling-plan'.
     */
    underlay?: ViewUnderlaySettings;

    // ── 10. Output / Representation ──────────────────────────────── [VI] ────
    /**
     * Output and representation settings — scale, detail level, visual style.
     * Controls HOW the view is drawn; not WHAT is visible (that is rules[]).
     */
    output?: ViewOutputSettings;

    // ── 11. Camera / Projection ───────────────────────────────────── [VII] ──
    /**
     * Camera state captured when the view was last saved.
     * Activating a view that has projection data restores the exact camera
     * position, target, projection type, and clipping planes.
     * Undefined = no saved camera; engine uses its default framing.
     */
    projection?: ViewProjectionSettings;

    // ── 12. Lighting (3D Views) ───────────────────────────────────── [VII] ──
    /**
     * Sun, background, and rendering quality for 3D views.
     * Only meaningful for viewType === '3d' or viewType === 'render'.
     * Undefined = inherits scene-level lighting settings.
     */
    lighting?: ViewLightingSettings;

    // ── 13. Section Box (3D Views) ────────────────────────────────── [VII] ──
    /**
     * Explicit 3D section box (AABB) for sectional clipping.
     * Only meaningful for viewType === '3d'. When enabled, the Three.js scene
     * is clipped to this box when the view is activated.
     */
    sectionBox?: ViewSectionBox;

    // ── 14. AI / LLM ─────────────────────────────────────────────── [B+VI] ──
    /** AI-authored human-readable description of this view's purpose. [B] */
    intent?: string;
    /** Machine-readable semantic context for LLM authoring and World Model queries. [VI] */
    semantics?: ViewSemanticContext;

    // ── 14a. View Purpose (P9) ───────────────────────────────────── [P9] ────
    /**
     * View purpose — high-level delivery workflow classification.
     * Governs which PurposeModifiers are activated from the assigned VisibilityIntent.
     *
     * Built-in values: 'construction-docs' | 'design-review' | 'coordination' | 'presentation'
     *
     * Distinct from semantics.purpose which holds AI/LLM semantic context tags
     * ('design' | 'documentation' | 'coordination' | 'analysis' | 'presentation' | 'review').
     */
    purpose?: 'construction-docs' | 'design-review' | 'coordination' | 'presentation' | string;

    // ── 15. Dependencies ─────────────────────────────────────────── [B] ──────
    /** Element IDs with explicit per-element view overrides (Phase VI store). */
    dependencies: {
        elements:   string[];
        templates?: string[];
    };

    // ── 16. Metadata ─────────────────────────────────────────────── [B] ──────
    /** §03 §1.1 compliant metadata block. */
    metadata: {
        createdAt:    number;
        modifiedAt:   number;
        createdBy:    string;
        version:      number;
        tags?:        string[];
        description?: string;
    };

    // ── 17. Sheet Placement Back-Reference ───────────────────────── [S5] ────
    /**
     * Back-reference populated when this view is placed on a sheet.
     * Read-only from ViewDefinition perspective — authoritative data lives in
     * SheetStore. Used by ProjectBrowserPanel to render the "📋 On Sheet"
     * badge without querying SheetStore each render cycle.
     *
     * Only one placement per non-legend/schedule view is allowed (§S5).
     * Undefined = view is not yet placed on any sheet.
     */
    sheetPlacement?: {
        /** ID of the sheet this view is placed on. */
        sheetId:    string;
        /** ID of the SheetViewport record within the sheet. */
        viewportId: string;
    };
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE VII — CAMERA / PROJECTION SETTINGS
// Stores the full camera state so that activating a view restores the
// exact camera position, target, and projection type.
// ═════════════════════════════════════════════════════════════════════════════

export interface ViewProjectionSettings {
    /**
     * Camera projection type.
     * - 'orthographic' — parallel projection (plan, section, elevation views)
     * - 'perspective'  — perspective projection (3D orbit views)
     */
    type?: 'orthographic' | 'perspective';

    /** Camera state captured at save time. All values in world units. */
    camera?: {
        /** Camera position in world space [x, y, z]. */
        position: [number, number, number];
        /** Orbit target / look-at point [x, y, z]. */
        target:   [number, number, number];
        /** Camera up vector [x, y, z] — normalised. */
        up:       [number, number, number];
        /**
         * Perspective field of view in degrees.
         * Undefined for orthographic cameras.
         */
        fov?:     number;
        /**
         * Orthographic zoom factor.
         * Undefined for perspective cameras.
         */
        zoom?:    number;
    };

    /** Near / far clip plane distances in world units. */
    clip?: {
        near?: number;
        far?:  number;
    };

    /**
     * When true, the camera cannot be rotated by the user while this view
     * is active (plan and section views lock rotation).
     */
    locked?: boolean;

    /**
     * Locked orientation as a unit normal vector [x, y, z].
     * Used by orthographic plan/section views to constrain the camera direction.
     */
    lockedOrientation?: [number, number, number];
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE VII — LIGHTING SETTINGS (3D Views only)
// Controls sun position, background type, and render quality per 3D view.
// ═════════════════════════════════════════════════════════════════════════════

export interface ViewLightingSettings {
    /** Whether the sun path arc is rendered in the viewport. */
    sunPath?: boolean;

    /** Sun position and intensity for this view. */
    sun?: {
        /** Azimuth in degrees (0 = North, 90 = East, 180 = South, 270 = West). */
        azimuth:    number;
        /** Altitude in degrees above the horizon (0–90). */
        altitude:   number;
        /** Intensity multiplier (0.0 = off, 1.0 = full). */
        intensity?: number;
    };

    /** Background type for the 3D view. */
    background?:
        | { type: 'sky' }
        | { type: 'gradient'; topColor: string; bottomColor: string }
        | { type: 'solid'; color: string }
        | { type: 'image'; url: string }
        ;

    /** Camera exposure override in EV stops (0 = default/neutral). */
    exposure?: number;

    /** Render quality preset for high-fidelity output modes. */
    renderQuality?: 'draft' | 'medium' | 'high' | 'best';
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE VII — SECTION BOX (3D Views only)
// Axis-aligned bounding box used to clip the 3D scene for sectional inspection.
// ═════════════════════════════════════════════════════════════════════════════

export interface ViewSectionBox {
    /** Whether the section box clipping is active. */
    enabled: boolean;
    /** Minimum corner of the AABB in world space [x, y, z]. */
    min?: [number, number, number];
    /** Maximum corner of the AABB in world space [x, y, z]. */
    max?: [number, number, number];
}

// ── Serialisation snapshot ─────────────────────────────────────────── [B] ──

export interface ViewDefinitionStoreSnapshot {            // [B] unchanged
    version: 1;
    views:   ViewDefinition[];
}
