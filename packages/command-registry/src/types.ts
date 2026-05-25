export enum CommandType {
    CREATE_WALL = 'CREATE_WALL',
    UPDATE_WALL_PROPERTIES = 'UPDATE_WALL_PROPERTIES',
    UPDATE_WALL_HEIGHT = 'UPDATE_WALL_HEIGHT',
    DELETE_ELEMENT = 'DELETE_ELEMENT',
    ADD_OPENING = 'ADD_OPENING',
    REMOVE_OPENING = 'REMOVE_OPENING',
    CREATE_LEVEL = 'CREATE_LEVEL',
    DELETE_LEVEL = 'DELETE_LEVEL',
    ASSIGN_ELEMENT_TO_LEVEL = 'ASSIGN_ELEMENT_TO_LEVEL',
    CREATE_GRID = 'CREATE_GRID',
    CREATE_GRID_SYSTEM = 'CREATE_GRID_SYSTEM',
    REMOVE_GRID = 'REMOVE_GRID',
    DELETE_ALL_GRIDS = 'DELETE_ALL_GRIDS',
    UPDATE_GRID = 'UPDATE_GRID',
    TOGGLE_PIN_GRID = 'TOGGLE_PIN_GRID',
    UPDATE_LEVEL = 'UPDATE_LEVEL',
    CREATE_STAIR = 'CREATE_STAIR',
    UPDATE_STAIR_PARAMETERS = 'UPDATE_STAIR_PARAMETERS',
    VALIDATE_STAIR = 'VALIDATE_STAIR',
    GENERATE_STAIR_GEOMETRY = 'GENERATE_STAIR_GEOMETRY',
    DELETE_STAIR = 'DELETE_STAIR',
    UPDATE_STAIR_FLIGHTS = 'UPDATE_STAIR_FLIGHTS',
    CHANGE_STAIR_SHAPE = 'CHANGE_STAIR_SHAPE',
    REGISTER_ELEMENT = 'REGISTER_ELEMENT',
    CREATE_BEAM = 'CREATE_BEAM',
    UPDATE_BEAM = 'UPDATE_BEAM',
    ASSIGN_BEAM_SUPPORTS = 'ASSIGN_BEAM_SUPPORTS',
    VALIDATE_BEAM = 'VALIDATE_BEAM',
    UPDATE_WINDOW_WIDTH = 'UPDATE_WINDOW_WIDTH',
    UPDATE_WINDOW_HEIGHT = 'UPDATE_WINDOW_HEIGHT',
    UPDATE_WINDOW_SILL_HEIGHT = 'UPDATE_WINDOW_SILL_HEIGHT',
    UPDATE_WINDOW_FIRE_RATING = 'UPDATE_WINDOW_FIRE_RATING',
    UPDATE_DOOR_WIDTH = 'UPDATE_DOOR_WIDTH',
    UPDATE_DOOR_HEIGHT = 'UPDATE_DOOR_HEIGHT',
    UPDATE_DOOR_SILL_HEIGHT = 'UPDATE_DOOR_SILL_HEIGHT',
    UPDATE_DOOR_FIRE_RATING = 'UPDATE_DOOR_FIRE_RATING',
    UPDATE_DOOR_ACCESSIBILITY_TYPE = 'UPDATE_DOOR_ACCESSIBILITY_TYPE',
    UPDATE_DOOR_FRAME_COLOR = 'UPDATE_DOOR_FRAME_COLOR',
    UPDATE_DOOR_LEAF_COLOR = 'UPDATE_DOOR_LEAF_COLOR',
    MOVE_DOOR = 'MOVE_DOOR',
    UPDATE_WINDOW_FRAME_COLOR = 'UPDATE_WINDOW_FRAME_COLOR',
    MOVE_WINDOW = 'MOVE_WINDOW',
    CENTER_WINDOW_IN_WALL = 'CENTER_WINDOW_IN_WALL',
    UPDATE_ELEMENT_MARK = 'UPDATE_ELEMENT_MARK',
    CREATE_CURTAIN_WALL = 'CREATE_CURTAIN_WALL',
    UPDATE_CURTAIN_WALL = 'UPDATE_CURTAIN_WALL',
    UPDATE_ALL_CURTAIN_WALLS = 'UPDATE_ALL_CURTAIN_WALLS',
    UPDATE_WALL_DIMENSIONS = 'UPDATE_WALL_DIMENSIONS',
    UPDATE_WALL_COLOR = 'UPDATE_WALL_COLOR',
    UPDATE_WALL_LAYERS = 'UPDATE_WALL_LAYERS',
    UPDATE_WALL_SYSTEM_TYPE = 'UPDATE_WALL_SYSTEM_TYPE',
    UPDATE_ELEMENT_PARAMETER = 'UPDATE_ELEMENT_PARAMETER',
    CHANGE_WALL_LEVEL = 'CHANGE_WALL_LEVEL',
    UPDATE_WALL_BASELINE = 'UPDATE_WALL_BASELINE',
    // §WALL-AUDIT-2026-W1: batched cascade for SlabWallConnectivityService.
    CASCADE_WALL_BASELINE = 'CASCADE_WALL_BASELINE',
    UPDATE_ELEMENT_THICKNESS = 'UPDATE_ELEMENT_THICKNESS',
    UPDATE_SLAB = 'UPDATE_SLAB',
    UPDATE_SLAB_DIMENSIONS = 'UPDATE_SLAB_DIMENSIONS',
    UPDATE_ALL_SLABS = 'UPDATE_ALL_SLABS',
    CREATE_SLAB = 'CREATE_SLAB',
    // C2 §SLAB-SYSTEM-AUDIT-2026: Dedicated slab-delete command (replaces polymorphic slab branch in DELETE_ELEMENT).
    DELETE_SLAB = 'DELETE_SLAB',
    CREATE_SLABS_ON_ALL_FLOORS = 'CREATE_SLABS_ON_ALL_FLOORS',
    CREATE_WALLS_FROM_SLAB = 'CREATE_WALLS_FROM_SLAB',
    CREATE_CURTAIN_WALLS_FROM_SLAB = 'CREATE_CURTAIN_WALLS_FROM_SLAB',
    CREATE_WALLS_ON_ALL_SLABS = 'CREATE_WALLS_ON_ALL_SLABS',
    // SPEC-SEMANTIC §10 #11-#13 — windows on façade walls (SL-3 consumer, hosted C15).
    CREATE_WINDOWS_ON_WALLS = 'CREATE_WINDOWS_ON_WALLS',
    // SPEC-SEMANTIC §10 #7/#9/#10 — doors between adjacent rooms (SL-2 consumer, hosted C15).
    CREATE_DOORS_BETWEEN_ADJACENT_ROOMS = 'CREATE_DOORS_BETWEEN_ADJACENT_ROOMS',
    CREATE_CURTAIN_WALLS_ON_ALL_SLABS = 'CREATE_CURTAIN_WALLS_ON_ALL_SLABS',
    CREATE_ROOF = 'CREATE_ROOF',
    UPDATE_ROOF = 'UPDATE_ROOF',
    DELETE_ROOF = 'DELETE_ROOF',
    CREATE_HANDRAIL = 'CREATE_HANDRAIL',
    DELETE_HANDRAIL = 'DELETE_HANDRAIL',
    MOVE_HANDRAIL = 'MOVE_HANDRAIL',
    UPDATE_FURNITURE_PARAMETERS = 'UPDATE_FURNITURE_PARAMETERS',
    CREATE_PLUMBING_FIXTURE = 'CREATE_PLUMBING_FIXTURE',
    UPDATE_PLUMBING_PARAMETERS = 'UPDATE_PLUMBING_PARAMETERS',
    CREATE_FURNITURE = 'CREATE_FURNITURE',
    // ── Lighting (first-class citizen) ───────────────────────────────────────
    CREATE_LIGHTING            = 'CREATE_LIGHTING',
    // SPEC-SEMANTIC §10 #41 — one downlight per (non-circulation) room.
    CREATE_LIGHTING_BY_ROOM    = 'CREATE_LIGHTING_BY_ROOM',
    DELETE_LIGHTING            = 'DELETE_LIGHTING',
    MOVE_LIGHTING              = 'MOVE_LIGHTING',
    UPDATE_LIGHTING_PARAMETERS = 'UPDATE_LIGHTING_PARAMETERS',
    CREATE_SLAB_ON_LEVEL_SIMILAR_TO_SELECTED = 'CREATE_SLAB_ON_LEVEL_SIMILAR_TO_SELECTED',
    CREATE_ALL_SLABS_FROM_LEVEL_TO_ALL_FLOORS = 'CREATE_ALL_SLABS_FROM_LEVEL_TO_ALL_FLOORS',
    CREATE_ALL_SLABS_FROM_LEVEL_TO_TOP_LEVEL = 'CREATE_ALL_SLABS_FROM_LEVEL_TO_TOP_LEVEL',
    CREATE_OPENING = 'CREATE_OPENING',
    DELETE_OPENING = 'DELETE_OPENING',
    UPDATE_OPENING = 'UPDATE_OPENING',
    UPDATE_HANDRAIL = 'UPDATE_HANDRAIL',
    UPDATE_SLAB_LEVEL = 'UPDATE_SLAB_LEVEL',
    UPDATE_SLAB_SKETCH = 'UPDATE_SLAB_SKETCH',
    UPDATE_SLAB_LAYERS = 'UPDATE_SLAB_LAYERS',
    UPDATE_SLAB_POLYGON = 'UPDATE_SLAB_POLYGON',
    ADD_CURTAIN_GRID_LINE = 'ADD_CURTAIN_GRID_LINE',
    REMOVE_CURTAIN_GRID_LINE = 'REMOVE_CURTAIN_GRID_LINE',
    REPLACE_CURTAIN_PANEL_TYPE = 'REPLACE_CURTAIN_PANEL_TYPE',
    REPLACE_CURTAIN_PANEL_WITH_DOOR = 'REPLACE_CURTAIN_PANEL_WITH_DOOR',
    CREATE_COLUMN = 'CREATE_COLUMN',
    UPDATE_COLUMN = 'UPDATE_COLUMN',
    DELETE_COLUMN = 'DELETE_COLUMN',
    UPDATE_COLUMN_LEVEL = 'UPDATE_COLUMN_LEVEL',
    REMOVE_COLUMNS_ON_LEVEL = 'REMOVE_COLUMNS_ON_LEVEL',
    CLEAR_PROJECT = 'CLEAR_PROJECT',
    LOAD_PROJECT_SNAPSHOT = 'LOAD_PROJECT_SNAPSHOT',
    // PROJECT-LOAD-PERFORMANCE-13 §2 (Phase 1) — atomic snapshot import as a
    // single command.  Replaces N per-element CreateXCommands during load with
    // one ImportProjectCommand that itself replays the same per-element work
    // but bypasses CommandManager dispatch for each sub-command (one callback
    // fan-out + one audit-stack entry instead of N).
    IMPORT_PROJECT = 'IMPORT_PROJECT',
    VG_CREATE_TEMPLATE                = 'VG_CREATE_TEMPLATE',
    VG_APPLY_TEMPLATE_TO_MODEL        = 'VG_APPLY_TEMPLATE_TO_MODEL',
    VG_SET_CATEGORY_STYLE             = 'VG_SET_CATEGORY_STYLE',
    VG_SET_VIEW_CATEGORY_STYLE        = 'VG_SET_VIEW_CATEGORY_STYLE',
    VG_CAPTURE_VIEW_PRESET            = 'VG_CAPTURE_VIEW_PRESET',
    VG_APPLY_TEMPLATE_TO_VIEW         = 'VG_APPLY_TEMPLATE_TO_VIEW',
    VG_UPDATE_TEMPLATE_CATEGORY_STYLE = 'VG_UPDATE_TEMPLATE_CATEGORY_STYLE',
    // DOC-4.1 — Per-instance VG override (Tier 4.5 in cascade)
    VG_SET_INSTANCE_OVERRIDE          = 'VG_SET_INSTANCE_OVERRIDE',
    // Phase A — Semantic Tag System
    TAG_ELEMENT                       = 'TAG_ELEMENT',
    // Phase B — ViewDefinition Entity
    CREATE_VIEW_DEFINITION            = 'CREATE_VIEW_DEFINITION',
    UPDATE_VIEW_DEFINITION            = 'UPDATE_VIEW_DEFINITION',
    DELETE_VIEW_DEFINITION            = 'DELETE_VIEW_DEFINITION',
    // Phase C — Serialisable Visibility Rule Layer
    CREATE_VISIBILITY_RULE            = 'CREATE_VISIBILITY_RULE',
    UPDATE_VISIBILITY_RULE            = 'UPDATE_VISIBILITY_RULE',
    DELETE_VISIBILITY_RULE            = 'DELETE_VISIBILITY_RULE',
    TOGGLE_VISIBILITY_RULE            = 'TOGGLE_VISIBILITY_RULE',
    CREATE_VISIBILITY_INTENT          = 'CREATE_VISIBILITY_INTENT',
    UPDATE_VISIBILITY_INTENT          = 'UPDATE_VISIBILITY_INTENT',
    DELETE_VISIBILITY_INTENT          = 'DELETE_VISIBILITY_INTENT',
    // Wave 7 / Stage A2 — mass-edit commands for VisibilityIntent appearances.
    BULK_APPLY_APPEARANCE             = 'BULK_APPLY_APPEARANCE',
    COPY_APPEARANCE_PATCH             = 'COPY_APPEARANCE_PATCH',
    PASTE_APPEARANCE_PATCH            = 'PASTE_APPEARANCE_PATCH',
    ASSIGN_VIEW_INTENT                = 'ASSIGN_VIEW_INTENT',
    UNBIND_VIEW_INTENT                = 'UNBIND_VIEW_INTENT',
    PIN_VIEW_INTENT_VERSION           = 'PIN_VIEW_INTENT_VERSION',
    TAKE_LATEST_INTENT_VERSION        = 'TAKE_LATEST_INTENT_VERSION',
    CREATE_INTENT_FROM_VIEW           = 'CREATE_INTENT_FROM_VIEW',
    HIDE_ELEMENT_IN_VIEW              = 'HIDE_ELEMENT_IN_VIEW',
    ISOLATE_ELEMENT_IN_VIEW           = 'ISOLATE_ELEMENT_IN_VIEW',
    GHOST_ELEMENT_IN_VIEW             = 'GHOST_ELEMENT_IN_VIEW',
    SET_GRAPHIC_OVERRIDE              = 'SET_GRAPHIC_OVERRIDE',
    CLEAR_OVERRIDE                    = 'CLEAR_OVERRIDE',
    CLEAR_ALL_OVERRIDES               = 'CLEAR_ALL_OVERRIDES',
    // Phase III — Sheets and Schedules
    CREATE_SHEET                      = 'CREATE_SHEET',
    UPDATE_SHEET                      = 'UPDATE_SHEET',
    DELETE_SHEET                      = 'DELETE_SHEET',
    // Phase S1 — Sheet Viewport Placement
    ADD_VIEWPORT_TO_SHEET             = 'ADD_VIEWPORT_TO_SHEET',
    REMOVE_VIEWPORT_FROM_SHEET        = 'REMOVE_VIEWPORT_FROM_SHEET',
    MOVE_VIEWPORT                     = 'MOVE_VIEWPORT',
    UPDATE_VIEWPORT_SCALE             = 'UPDATE_VIEWPORT_SCALE',
    // Phase S1 — Sheet Revision Management
    ADD_REVISION_TO_SHEET             = 'ADD_REVISION_TO_SHEET',
    REMOVE_REVISION_FROM_SHEET        = 'REMOVE_REVISION_FROM_SHEET',
    CREATE_SCHEDULE                   = 'CREATE_SCHEDULE',
    UPDATE_SCHEDULE                   = 'UPDATE_SCHEDULE',
    DELETE_SCHEDULE                   = 'DELETE_SCHEDULE',
    // Phase VI — Extended View Properties
    SET_VIEW_OUTPUT                   = 'SET_VIEW_OUTPUT',
    SET_VIEW_RANGE                    = 'SET_VIEW_RANGE',
    SET_VIEW_CROP                     = 'SET_VIEW_CROP',
    SET_VIEW_UNDERLAY                 = 'SET_VIEW_UNDERLAY',
    // Phase VII — Camera Persistence, View Templates, Phase Filters
    SET_VIEW_PROJECTION               = 'SET_VIEW_PROJECTION',
    SET_VIEW_TEMPLATE                 = 'SET_VIEW_TEMPLATE',
    SET_VIEW_TEMPLATE_LOCK            = 'SET_VIEW_TEMPLATE_LOCK',
    CREATE_VIEW_TEMPLATE              = 'CREATE_VIEW_TEMPLATE',
    UPDATE_VIEW_TEMPLATE              = 'UPDATE_VIEW_TEMPLATE',
    DELETE_VIEW_TEMPLATE              = 'DELETE_VIEW_TEMPLATE',
    ASSIGN_VIEW_TEMPLATE              = 'ASSIGN_VIEW_TEMPLATE',
    OVERRIDE_VIEW_TEMPLATE_PROPERTY   = 'OVERRIDE_VIEW_TEMPLATE_PROPERTY',
    RESET_VIEW_TEMPLATE_PROPERTY      = 'RESET_VIEW_TEMPLATE_PROPERTY',
    CREATE_PHASE_FILTER               = 'CREATE_PHASE_FILTER',
    // Phase VIII — Semantic Context, Lighting, Design Options
    SET_VIEW_SEMANTICS                = 'SET_VIEW_SEMANTICS',
    SET_VIEW_LIGHTING                 = 'SET_VIEW_LIGHTING',
    SET_VIEW_DESIGN_OPTION            = 'SET_VIEW_DESIGN_OPTION',
    // Phase SC-4 — Parametric Layout Engine
    SET_SHEET_LAYOUT_RULE             = 'SET_SHEET_LAYOUT_RULE',
    APPLY_SHEET_LAYOUT_PRESET         = 'APPLY_SHEET_LAYOUT_PRESET',
    // Phase SC-5 — Data Panels
    ADD_DATA_PANEL_TO_SHEET           = 'ADD_DATA_PANEL_TO_SHEET',
    UPDATE_DATA_PANEL                 = 'UPDATE_DATA_PANEL',
    REMOVE_DATA_PANEL_FROM_SHEET      = 'REMOVE_DATA_PANEL_FROM_SHEET',
    // Phase SC-6 — Multi-Output Export
    EXPORT_SHEET                      = 'EXPORT_SHEET',
    // Phase SC-7 — AI Sheet Authoring
    SET_SHEET_COMPOSITION_INTENT      = 'SET_SHEET_COMPOSITION_INTENT',
    // §ANN — Annotation System (Phase A + B)
    CREATE_ANNOTATION                 = 'CREATE_ANNOTATION',
    DELETE_ANNOTATION                 = 'DELETE_ANNOTATION',
    UPDATE_ANNOTATION                 = 'UPDATE_ANNOTATION',
    // §ANN-C3 — Constraint Solver: lock/unlock a placed linear-dim as a constraint
    LOCK_ANNOTATION                   = 'LOCK_ANNOTATION',
    // §ANN-VII-1 — Constraint Solver: explicitly post locked dims to solver
    UPDATE_CONSTRAINT                 = 'UPDATE_CONSTRAINT',
    // §ANN-C1 — Phase C: AI-Augmented Annotation
    ANNOTATE_VIEW                     = 'ANNOTATE_VIEW',
    // §STAIR — Railing sub-system
    CREATE_STAIR_RAILING              = 'CREATE_STAIR_RAILING',
    UPDATE_STAIR_RAILING              = 'UPDATE_STAIR_RAILING',
    DELETE_STAIR_RAILING              = 'DELETE_STAIR_RAILING',
    // Phase D — Door/Window parametric parameter updates
    UPDATE_DOOR_PARAMETER             = 'UPDATE_DOOR_PARAMETER',
    UPDATE_WINDOW_PARAMETER           = 'UPDATE_WINDOW_PARAMETER',
    // DOC-1.12 — Detail View
    CREATE_DETAIL_VIEW                = 'CREATE_DETAIL_VIEW',
    // DOC-2.7 — Section mark + elevation mark (atomic: view + annotation)
    CREATE_SECTION_MARK               = 'CREATE_SECTION_MARK',
    CREATE_ELEVATION_MARK             = 'CREATE_ELEVATION_MARK',
    // DOC-2.8 — Callout detail (atomic: detail view + callout annotation)
    CREATE_CALLOUT_DETAIL             = 'CREATE_CALLOUT_DETAIL',
    // ── Rooms ──────────────────────────────────────────────────────────────
    CREATE_ROOM                       = 'CREATE_ROOM',
    UPDATE_ROOM                       = 'UPDATE_ROOM',
    UPDATE_ROOM_BOUNDARY              = 'UPDATE_ROOM_BOUNDARY',
    DELETE_ROOM                       = 'DELETE_ROOM',
    RENAME_ROOM                       = 'RENAME_ROOM',
    SET_ROOM_OCCUPANCY                = 'SET_ROOM_OCCUPANCY',
    UPDATE_ROOM_FINISHES              = 'UPDATE_ROOM_FINISHES',
    DETECT_ROOM_FROM_WALLS            = 'DETECT_ROOM_FROM_WALLS',
    DETECT_ALL_ROOMS                  = 'DETECT_ALL_ROOMS',
    BATCH_CREATE_ROOMS                = 'BATCH_CREATE_ROOMS',
    REDETECT_ROOMS                    = 'REDETECT_ROOMS',
    // ── Room Bounding Line commands (§ROOM-BOUNDING) ──────────────────────────
    CREATE_ROOM_BOUNDING_LINE         = 'CREATE_ROOM_BOUNDING_LINE',
    UPDATE_ROOM_BOUNDING_LINE         = 'UPDATE_ROOM_BOUNDING_LINE',
    DELETE_ROOM_BOUNDING_LINE         = 'DELETE_ROOM_BOUNDING_LINE',
    APPLY_GENERATIVE_LAYOUT           = 'APPLY_GENERATIVE_LAYOUT',
    // FIX-7 §01 §2.1: Sketch degradation when a referenced wall is removed — now undoable
    DEGRADE_SLAB_SKETCH               = 'DEGRADE_SLAB_SKETCH',
    // FIX-8 §01 §2.1: Batch slab removal on level deletion — now undoable
    REMOVE_SLABS_ON_LEVEL             = 'REMOVE_SLABS_ON_LEVEL',
    // ── Ceilings ───────────────────────────────────────────────────────────
    CREATE_CEILING                    = 'CREATE_CEILING',
    // SPEC-SEMANTIC §10 #28/#29 — batch ceiling-by-room (consumes room.occupancyType).
    CREATE_CEILINGS_BY_ROOM           = 'CREATE_CEILINGS_BY_ROOM',
    UPDATE_CEILING                    = 'UPDATE_CEILING',
    REMOVE_CEILING                    = 'REMOVE_CEILING',
    UPDATE_CEILING_BOUNDARY           = 'UPDATE_CEILING_BOUNDARY',
    UPDATE_CEILING_LAYERS             = 'UPDATE_CEILING_LAYERS',
    REMOVE_CEILINGS_ON_LEVEL          = 'REMOVE_CEILINGS_ON_LEVEL',
    CREATE_FLOOR                      = 'CREATE_FLOOR',
    // SPEC-SEMANTIC §10 #34 — batch floor-finish by room type (consumes room.occupancyType).
    CREATE_FLOORS_BY_ROOM_TYPE        = 'CREATE_FLOORS_BY_ROOM_TYPE',
    UPDATE_FLOOR                      = 'UPDATE_FLOOR',
    REMOVE_FLOOR                      = 'REMOVE_FLOOR',
    UPDATE_FLOOR_BOUNDARY             = 'UPDATE_FLOOR_BOUNDARY',
    UPDATE_FLOOR_LAYERS               = 'UPDATE_FLOOR_LAYERS',
    REMOVE_FLOORS_ON_LEVEL            = 'REMOVE_FLOORS_ON_LEVEL',

    // ── Data Platform: Hierarchy (Phase DP) ────────────────────────────────
    CREATE_SITE                       = 'CREATE_SITE',
    CREATE_BUILDING                   = 'CREATE_BUILDING',
    CREATE_HIERARCHY_LEVEL            = 'CREATE_HIERARCHY_LEVEL',
    CREATE_UNIT                       = 'CREATE_UNIT',
    UPDATE_HIERARCHY_NODE             = 'UPDATE_HIERARCHY_NODE',
    DELETE_HIERARCHY_NODE             = 'DELETE_HIERARCHY_NODE',
    ASSIGN_ROOM_TO_UNIT               = 'ASSIGN_ROOM_TO_UNIT',
    UPDATE_PLANNED_DATA               = 'UPDATE_PLANNED_DATA',

    // ── Data Platform: Templates (Phase DP) ────────────────────────────────
    CREATE_TEMPLATE                   = 'CREATE_TEMPLATE',
    UPDATE_TEMPLATE                   = 'UPDATE_TEMPLATE',
    DELETE_TEMPLATE                   = 'DELETE_TEMPLATE',
    ASSIGN_TEMPLATE_TO_NODE           = 'ASSIGN_TEMPLATE_TO_NODE',
    UNASSIGN_TEMPLATE                 = 'UNASSIGN_TEMPLATE',
    MARK_PROPERTY_DERIVED             = 'MARK_PROPERTY_DERIVED',
    CLEAR_PROPERTY_DERIVED            = 'CLEAR_PROPERTY_DERIVED',
    SET_DERIVATION                    = 'SET_DERIVATION',
    DUPLICATE_TEMPLATE                = 'DUPLICATE_TEMPLATE',

    // ── Data Platform: Element Codes (Phase DP) ────────────────────────────
    ASSIGN_ELEMENT_CODE               = 'ASSIGN_ELEMENT_CODE',

    // ── Autonomous Auditor — Phase 0 (Requirements) ─────────────────────────
    SET_ROOM_REQUIREMENT              = 'SET_ROOM_REQUIREMENT',
    UPDATE_REQUIREMENT                = 'UPDATE_REQUIREMENT',
    DELETE_REQUIREMENT                = 'DELETE_REQUIREMENT',

    // ── Autonomous Auditor — Phase 1 (Remediation) ──────────────────────────
    AUTO_REMEDIATE                    = 'AUTO_REMEDIATE',

    // ── Selection Toolbar — Phase 5 Contextual Operations ───────────────────
    JOIN_WALLS                        = 'JOIN_WALLS',
    CUT_WALL                          = 'CUT_WALL',
    MIRROR_ELEMENT                    = 'MIRROR_ELEMENT',
    COPY_ELEMENT                      = 'COPY_ELEMENT',
    SCALE_ELEMENT                     = 'SCALE_ELEMENT',
    OFFSET_ELEMENT                    = 'OFFSET_ELEMENT',

    // ── Autonomous Auditor — Phase 3 (Asset Catalog) ─────────────────────────
    ADD_ASSET_CATALOG_ENTRY           = 'ADD_ASSET_CATALOG_ENTRY',
    UPDATE_ASSET_CATALOG_ENTRY        = 'UPDATE_ASSET_CATALOG_ENTRY',
    DELETE_ASSET_CATALOG_ENTRY        = 'DELETE_ASSET_CATALOG_ENTRY',

    // ── Floor-Plan Underlay (PDF / JPG import overlay) ──────────────────────
    // Contract 01 §2.1 — every underlay mutation MUST be a Command so that the
    // user can Ctrl+Z the placement, drag, rotate, and 3-point scale/rotate.
    // The underlay is non-semantic (Contract 04 §3.1) so these commands declare
    // affectedStores=['underlay'] which yields an empty snapshot scope (no
    // existing store key matches) — the commands manage their own state.
    CREATE_UNDERLAY                   = 'CREATE_UNDERLAY',
    TRANSFORM_UNDERLAY                = 'TRANSFORM_UNDERLAY',
    DELETE_UNDERLAY                   = 'DELETE_UNDERLAY',

    // ── Level Operations ─────────────────────────────────────────────────────
    // Clone all elements on a source level to one or more target levels.
    // Duplicates: walls (+ openings), slabs, columns, furniture.
    DUPLICATE_FLOOR_PLAN              = 'DUPLICATE_FLOOR_PLAN',
}

export interface CommandValidationResult {
    ok: boolean;
    reason?: string;
    blockingIssues?: string[];
    warnings?: string[];

}

/**
 * A non-executable proposal generated by the AI.
 * Bridges IntentSuggestions (AI) to Commands (Kernel).
 */
export interface CommandProposal {
    id: string;
    proposalId?: string;
    intentType: string;
    command: Command;
    rationale: string;
    validation: CommandValidationResult;
    confidence: number;
}

export interface CommandResult {
    success: boolean;
    affectedElementIds: string[];
    info?: string[];
    error?: string; // ✅ ADD THIS
}

export interface SerializedCommand {
    type: CommandType;
    payload: Record<string, any>;
    targetIds: string[];
    timestamp: number;
    version: number;
}

export interface CommandContext {
    bimManager: import('@pryzm/core-app-model').BimManager;
    projectContext: import('@pryzm/core-app-model').ProjectContext;
    stores: {
        wallStore: import('@pryzm/geometry-wall').WallStore;
        slabStore: import('@pryzm/geometry-slab').SlabStore;
        columnStore: import('@pryzm/geometry-column').ColumnStore;
        gridStore: import('@pryzm/core-app-model').GridStore;
        stairStore: import('@pryzm/geometry-stair').StairStore;
        beamStore: import('@pryzm/core-app-model').BeamStore;
        curtainWallStore: import('@pryzm/geometry-curtain-wall').CurtainWallStore;
        roofStore: import('@pryzm/geometry-roof').RoofStore;
        plumbingStore: import('@pryzm/geometry-plumbing').PlumbingStore;
        furnitureStore: import('@pryzm/geometry-furniture').FurnitureStore;
        lightingStore?: import('@pryzm/geometry-lighting').LightingStore;
        handrailStore: import('@pryzm/core-app-model').HandrailStore;
        openingStore: import('@pryzm/core-app-model').OpeningStore;
        roomStore?: import('@pryzm/room-topology').RoomStore;
        curtainPanelStore?: import('@pryzm/geometry-curtain-wall').CurtainPanelStore;
        wallSystemTypeStore?: import('@pryzm/geometry-wall').WallSystemTypeStore;
        slabSystemTypeStore?: import('@pryzm/geometry-slab').SlabSystemTypeStore;
        ceilingStore?: import('@pryzm/core-app-model').CeilingStore;
        ceilingSystemTypeStore?: import('@pryzm/core-app-model').CeilingSystemTypeStore;
        floorStore?: import('@pryzm/core-app-model').FloorStore;
        floorSystemTypeStore?: import('@pryzm/core-app-model').FloorSystemTypeStore;
        stairMeshBuilder?: {
            updateStair(stair: any, isPreview?: boolean): void;
            removeStair(stairId: string): void;
        };
        stairTypeStore?: import('@pryzm/geometry-stair').StairTypeStore;
        stairLandingStore?: import('@pryzm/geometry-stair').StairLandingStore;
        stairRailingStore?: import('@pryzm/geometry-stair').StairRailingStore;
        // ── Data Platform stores (Phase DP) ──────────────────────────────────
        // Optional so all existing commands compile without change.
        hierarchyStore?: import('@pryzm/core-app-model').HierarchyStore;
        templateStore?: import('@pryzm/core-app-model').TemplateStore;
        templateAssignmentStore?: import('@pryzm/core-app-model').TemplateAssignmentStore;
        elementCodeStore?: import('@pryzm/core-app-model').ElementCodeStore;
        // ── Autonomous Auditor — Phase 0 ────────────────────────────────────
        requirementStore?: import('@pryzm/core-app-model').RequirementStore;
        // ── Autonomous Auditor — Phase 3 ────────────────────────────────────
        assetCatalogStore?: import('@pryzm/core-app-model').AssetCatalogStore;
        // ── ANNOTATION-SYSTEM-AUDIT-2026 A1 ─────────────────────────────────
        // Annotation-tier stores injected so commands no longer read
        // window.annotationStore etc. All annotation commands now
        // resolve their dependencies from `ctx.stores`. Optional during
        // migration: when absent (e.g. legacy tests), commands fall back to
        // the legacy window globals to remain backwards-compatible.
        annotationStore?: import('@pryzm/plugin-annotations').AnnotationStore;
        annotationVisibilityStore?: import('@pryzm/plugin-annotations').AnnotationVisibilityStore;
        constraintStore?: import('@pryzm/plugin-annotations').ConstraintStore;
        viewDefinitionStore?: typeof import('@pryzm/core-app-model').viewDefinitionStore;
        viewIntentInstanceStore?: typeof import('@pryzm/core-app-model').viewIntentInstanceStore;
        vgGovernanceStore?: typeof import('@pryzm/core-app-model').vgGovernanceStore;
    };
    commandManager: import('./CommandManagerImpl').CommandManager;
    wallFragmentBuilder?: any;
    // ── ANNOTATION-SYSTEM-AUDIT-2026 A1 ─────────────────────────────────────
    /**
     * Optional ConstraintSolver service. UpdateConstraintCommand reads this to
     * run a solver pass after rebuilding constraint records. Falls back to
     * window.constraintSolver for legacy callers.
     */
    constraintSolver?: import('@pryzm/plugin-annotations').ConstraintSolver;
    /**
     * Optional resolver stores bag used by the annotation dependency graph and
     * the constraint solver to convert StableReferences into world-space points.
     * Mirrors the annotation system's `_resolverStores` singleton.
     */
    resolverStores?: import('@pryzm/plugin-annotations').ResolverStores;
    /**
     * Optional dependency graph. ProjectLoader calls `rebuild()` after a
     * project deserialise so the reverse index reflects the loaded annotations
     * (audit fix A5).
     */
    annotationDependencyGraph?: import('@pryzm/plugin-annotations').AnnotationDependencyGraph;
    /**
     * §WALL-AUDIT-2026-W2 (RESOLVED 2026-04-24): the FurnitureFragmentBuilder
     * is now exposed on `CommandContext` so `DeleteElementCommand`'s `furniture`
     * branches no longer need to read window.furnitureFragmentBuilder.
     * Optional during migration: when absent, commands silently skip the visual
     * cleanup / restore step (semantic state is unaffected).
     */
    furnitureFragmentBuilder?: any;
    /**
     * P3.6 — Topology Layer stub.
     * Optional until the Core team delivers the Topology Layer.
     * Commands call via optional chaining so they remain no-ops until wired.
     */
    topologyGraph?: {
        addNode(id: string, elementType: string, props: Record<string, unknown>): void;
        removeNode(id: string): void;
    };
}

/**
 * Store keys recognised by CommandManager for scoped snapshot and rollback.
 * Contract 01 §2.2.1 — every command declares which stores it touches.
 * The CommandManager uses this declaration to snapshot ONLY those stores,
 * eliminating the O(N × S) global structuredClone that ran on every command.
 *
 * VIEW-SYSTEM-AUDIT-2026 F4.6/F5.1/F5.5 — view-adjacent stores added so view
 * commands can declare their footprint accurately.  These keys correspond to
 * StoreRegistry registrations performed by each store module on import.
 *
 * Special keys:
 *   'level'  — snapshots ctx.bimManager.getLevels() (spatial authority, not a store)
 */
export type StoreKey =
    | 'wall'
    | 'slab'
    | 'level'
    | 'column'
    | 'beam'
    | 'roof'
    | 'curtainWall'
    | 'furniture'
    | 'lighting'
    | 'handrail'
    | 'stair'
    | 'door'
    | 'window'
    // F5.1 / F5.5 — view-adjacent stores (registered with StoreRegistry).
    | 'view'
    | 'view-template'
    | 'view-intent-instance'
    | 'view-camera-state'
    | 'phase-filter'
    | 'sheet'
    | 'schedule'
    | 'title-block'
    | 'vg-governance'
    | 'vg-instance-override'
    | 'visibility-rule'
    | 'visibility-intent'
    | 'semantic-index';

export interface Command {
    id: string;
    type: CommandType;
    timestamp: number;
    targetIds: string[];
    /**
     * Contract 01 §2.2.1 — VIEW-SYSTEM-AUDIT-2026 F4.6 — REQUIRED.
     * Declares which stores this command touches so CommandManager snapshots
     * only those stores.  The previous optional declaration allowed silent
     * drift — every newly-added command had to be remembered manually.
     *
     * Use StoreKey values; unknown keys are ignored at runtime so commands
     * declaring not-yet-registered stores fail safe rather than crash.
     *
     * Examples:
     *   readonly affectedStores = ['wall'] as const;
     *   readonly affectedStores = ['wall', 'level'] as const;
     *   readonly affectedStores = ['view', 'view-intent-instance', 'vg-governance'] as const;
     */
    affectedStores: ReadonlyArray<string>;
    /**
     * When true, CommandManager.execute() runs the command but does NOT push it
     * onto the undo history stack.  Used for automatic background operations
     * (e.g. ReDetectRoomsCommand) that are side-effects of user actions rather
     * than user actions themselves.  Such commands must provide a no-op undo().
     */
    nonUndoable?: boolean;
    canExecute(context: CommandContext): CommandValidationResult;
    execute(context: CommandContext): CommandResult;
    undo(context: CommandContext): CommandResult;
    serialize(): SerializedCommand;
}

export const WALL_HEIGHT_CONSTRAINTS = {
    MIN_HEIGHT: 0.3,
    MAX_HEIGHT: 20.0,
    DEFAULT_HEIGHT: 3.0
} as const;
