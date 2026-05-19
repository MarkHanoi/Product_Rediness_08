import { CommandProposal, CommandType } from '../types';

/**
 * Deterministic ordering rules for CommandPlan steps.
 * Rules:
 * 1. Creations first (elements must exist before mod)
 * 2. Level/Grid changes early (structural dependencies)
 * 3. Modifications
 * 4. Deletions last (ensure refs remain valid during plan)
 */
export class PlanOrdering {
    private static readonly TYPE_PRIORITY: Record<CommandType, number> = {
        [CommandType.CREATE_LEVEL]: 10,
        [CommandType.CREATE_GRID]: 11,
        [CommandType.CREATE_GRID_SYSTEM]: 11,
        [CommandType.REMOVE_GRID]: 95,
        [CommandType.DELETE_ALL_GRIDS]: 95,
        [CommandType.UPDATE_GRID]: 12,
        [CommandType.TOGGLE_PIN_GRID]: 12,
        [CommandType.UPDATE_LEVEL]: 12,
        [CommandType.REGISTER_ELEMENT]: 15,
        [CommandType.CREATE_WALL]: 20,
        [CommandType.CREATE_SLAB]: 21,
        [CommandType.CREATE_SLABS_ON_ALL_FLOORS]: 21,
        [CommandType.CREATE_SLAB_ON_LEVEL_SIMILAR_TO_SELECTED]: 21,
        [CommandType.CREATE_ALL_SLABS_FROM_LEVEL_TO_ALL_FLOORS]: 21,
        [CommandType.CREATE_ALL_SLABS_FROM_LEVEL_TO_TOP_LEVEL]: 21,
        [CommandType.CREATE_STAIR]: 22,
        [CommandType.CREATE_FURNITURE]: 23,
        [CommandType.ADD_OPENING]: 30,
        [CommandType.UPDATE_WALL_PROPERTIES]: 40,
        [CommandType.UPDATE_WALL_HEIGHT]: 41,
        [CommandType.UPDATE_STAIR_PARAMETERS]: 42,
        [CommandType.VALIDATE_STAIR]: 43,
        [CommandType.GENERATE_STAIR_GEOMETRY]: 44,
        [CommandType.DELETE_STAIR]: 45,
        [CommandType.UPDATE_STAIR_FLIGHTS]: 46,
        [CommandType.CHANGE_STAIR_SHAPE]: 47,
        [CommandType.ASSIGN_ELEMENT_TO_LEVEL]: 50,
        [CommandType.CREATE_BEAM]: 23,
        [CommandType.UPDATE_BEAM]: 45,
        [CommandType.ASSIGN_BEAM_SUPPORTS]: 46,
        [CommandType.VALIDATE_BEAM]: 47,
        [CommandType.UPDATE_WINDOW_WIDTH]: 48,
        [CommandType.UPDATE_WINDOW_HEIGHT]: 49,
        [CommandType.UPDATE_WINDOW_SILL_HEIGHT]: 50,
        [CommandType.UPDATE_WINDOW_FIRE_RATING]: 51,
        [CommandType.UPDATE_DOOR_WIDTH]: 52,
        [CommandType.UPDATE_DOOR_HEIGHT]: 53,
        [CommandType.UPDATE_DOOR_SILL_HEIGHT]: 53,
        [CommandType.UPDATE_DOOR_FIRE_RATING]: 54,
        [CommandType.UPDATE_DOOR_ACCESSIBILITY_TYPE]: 55,
        [CommandType.UPDATE_DOOR_FRAME_COLOR]: 55,
        [CommandType.UPDATE_DOOR_LEAF_COLOR]: 55,
        [CommandType.MOVE_DOOR]: 55,
        [CommandType.UPDATE_WINDOW_FRAME_COLOR]: 55,
        [CommandType.MOVE_WINDOW]: 55,
        [CommandType.CENTER_WINDOW_IN_WALL]: 55,
        [CommandType.UPDATE_ELEMENT_MARK]: 56,
        [CommandType.UPDATE_CURTAIN_WALL]: 57,
        [CommandType.UPDATE_ALL_CURTAIN_WALLS]: 57,
        [CommandType.REMOVE_OPENING]: 60,
        [CommandType.UPDATE_ELEMENT_THICKNESS]: 41,
        [CommandType.CREATE_WALLS_FROM_SLAB]: 25,
        [CommandType.CREATE_CURTAIN_WALL]: 26,
        [CommandType.CREATE_CURTAIN_WALLS_FROM_SLAB]: 26,
        [CommandType.CREATE_WALLS_ON_ALL_SLABS]: 25,
        [CommandType.CREATE_CURTAIN_WALLS_ON_ALL_SLABS]: 26,
        [CommandType.UPDATE_ALL_SLABS]: 41,
        [CommandType.UPDATE_SLAB]: 41,
        [CommandType.UPDATE_SLAB_DIMENSIONS]: 41,
        [CommandType.UPDATE_SLAB_LEVEL]: 41,
        [CommandType.UPDATE_SLAB_SKETCH]: 41,
        [CommandType.UPDATE_SLAB_LAYERS]: 41,
        [CommandType.UPDATE_SLAB_POLYGON]: 41,
        [CommandType.UPDATE_WALL_DIMENSIONS]: 41,
        [CommandType.UPDATE_WALL_COLOR]: 41,
        [CommandType.UPDATE_WALL_LAYERS]: 41,
        [CommandType.UPDATE_WALL_SYSTEM_TYPE]: 41,
        [CommandType.UPDATE_ELEMENT_PARAMETER]: 41,
        [CommandType.CREATE_ROOF]: 24,
        [CommandType.UPDATE_ROOF]: 42,
        [CommandType.DELETE_ROOF]: 91,
        [CommandType.CREATE_PLUMBING_FIXTURE]: 25,
        [CommandType.CREATE_OPENING]: 30,
        [CommandType.UPDATE_FURNITURE_PARAMETERS]: 43,
        [CommandType.UPDATE_OPENING]: 44,
        [CommandType.CREATE_HANDRAIL]: 25,
        [CommandType.UPDATE_HANDRAIL]: 45,
        [CommandType.DELETE_HANDRAIL]: 90,
        [CommandType.MOVE_HANDRAIL]: 45,
        [CommandType.UPDATE_PLUMBING_PARAMETERS]: 46,
        [CommandType.DELETE_OPENING]: 89,
        [CommandType.DELETE_ELEMENT]: 90,
        [CommandType.DELETE_LEVEL]: 100,
        [CommandType.CHANGE_WALL_LEVEL]: 41,
        [CommandType.UPDATE_WALL_BASELINE]: 41,
        // §WALL-AUDIT-2026-W1: structural cascade emitted by SlabWallConnectivityService
        // — runs alongside other wall baseline updates so that downstream sketch /
        // join-resolution passes observe a consistent post-cascade state.
        [CommandType.CASCADE_WALL_BASELINE]: 41,
        [CommandType.ADD_CURTAIN_GRID_LINE]: 58,
        [CommandType.REMOVE_CURTAIN_GRID_LINE]: 59,
        [CommandType.REPLACE_CURTAIN_PANEL_TYPE]: 60,
        [CommandType.REPLACE_CURTAIN_PANEL_WITH_DOOR]: 60,
        [CommandType.CREATE_COLUMN]: 15,
        [CommandType.UPDATE_COLUMN]: 15,
        // §COLUMN-AUDIT-2026 §C2 / §W7 / §C1: column-side equivalents of the
        // slab DELETE / UPDATE_LEVEL / REMOVE_ON_LEVEL ordering bands.
        // - DELETE_COLUMN sits in the cascade band (95) like DELETE_SLAB so it
        //   runs after the level whose deletion triggered the cleanup is gone.
        // - UPDATE_COLUMN_LEVEL sits next to UPDATE_SLAB_LEVEL (41) — same
        //   "bimManager re-registration" semantics.
        // - REMOVE_COLUMNS_ON_LEVEL sits next to REMOVE_SLABS_ON_LEVEL (95).
        [CommandType.DELETE_COLUMN]:                     95,
        [CommandType.UPDATE_COLUMN_LEVEL]:               41,
        [CommandType.REMOVE_COLUMNS_ON_LEVEL]:           95,
        [CommandType.CLEAR_PROJECT]: 0,
        [CommandType.LOAD_PROJECT_SNAPSHOT]: 1,
        // PROJECT-LOAD-PERFORMANCE-13 §2 Phase 1 — outermost wrapper command
        // for an entire project import.  Runs before everything else so the
        // PlanOrdering tie-breaker prefers it over any per-element create.
        [CommandType.IMPORT_PROJECT]: 0,
        [CommandType.VG_CREATE_TEMPLATE]: 5,
        [CommandType.VG_APPLY_TEMPLATE_TO_MODEL]: 5,
        [CommandType.VG_SET_CATEGORY_STYLE]: 5,
        [CommandType.VG_SET_VIEW_CATEGORY_STYLE]: 5,
        [CommandType.VG_CAPTURE_VIEW_PRESET]: 5,
        [CommandType.VG_APPLY_TEMPLATE_TO_VIEW]: 5,
        [CommandType.VG_UPDATE_TEMPLATE_CATEGORY_STYLE]: 5,
        [CommandType.VG_SET_INSTANCE_OVERRIDE]: 5,
        // Phase A — Semantic Tag System
        [CommandType.TAG_ELEMENT]: 5,
        // Phase B — ViewDefinition Entity
        [CommandType.CREATE_VIEW_DEFINITION]: 5,
        // DOC-1.12 — Detail View
        [CommandType.CREATE_DETAIL_VIEW]:     5,
        [CommandType.UPDATE_VIEW_DEFINITION]: 5,
        [CommandType.DELETE_VIEW_DEFINITION]: 5,
        // Phase C — Serialisable Visibility Rule Layer
        [CommandType.CREATE_VISIBILITY_RULE]: 5,
        [CommandType.UPDATE_VISIBILITY_RULE]: 5,
        [CommandType.DELETE_VISIBILITY_RULE]: 5,
        [CommandType.TOGGLE_VISIBILITY_RULE]: 5,
        [CommandType.CREATE_VISIBILITY_INTENT]: 5,
        [CommandType.UPDATE_VISIBILITY_INTENT]: 5,
        [CommandType.DELETE_VISIBILITY_INTENT]: 5,
        // Wave 7 / Stage A2 — bulk-apply / clipboard commands route through the
        // same VisibilityIntent priority bucket as UPDATE_VISIBILITY_INTENT.
        [CommandType.BULK_APPLY_APPEARANCE]: 5,
        [CommandType.COPY_APPEARANCE_PATCH]: 5,
        [CommandType.PASTE_APPEARANCE_PATCH]: 5,
        [CommandType.ASSIGN_VIEW_INTENT]: 5,
        [CommandType.UNBIND_VIEW_INTENT]: 5,
        [CommandType.PIN_VIEW_INTENT_VERSION]: 5,
        [CommandType.TAKE_LATEST_INTENT_VERSION]: 5,
        [CommandType.CREATE_INTENT_FROM_VIEW]: 5,
        [CommandType.HIDE_ELEMENT_IN_VIEW]: 5,
        [CommandType.ISOLATE_ELEMENT_IN_VIEW]: 5,
        [CommandType.GHOST_ELEMENT_IN_VIEW]: 5,
        [CommandType.SET_GRAPHIC_OVERRIDE]: 5,
        [CommandType.CLEAR_OVERRIDE]: 5,
        [CommandType.CLEAR_ALL_OVERRIDES]: 5,
        // Phase III — Sheets and Schedules
        [CommandType.CREATE_SHEET]:              5,
        [CommandType.UPDATE_SHEET]:              5,
        [CommandType.DELETE_SHEET]:              5,
        [CommandType.ADD_VIEWPORT_TO_SHEET]:     5,
        [CommandType.REMOVE_VIEWPORT_FROM_SHEET]:5,
        [CommandType.MOVE_VIEWPORT]:             5,
        [CommandType.UPDATE_VIEWPORT_SCALE]:     5,
        [CommandType.ADD_REVISION_TO_SHEET]:      5,
        [CommandType.REMOVE_REVISION_FROM_SHEET]: 5,
        [CommandType.CREATE_SCHEDULE]: 5,
        [CommandType.UPDATE_SCHEDULE]: 5,
        [CommandType.DELETE_SCHEDULE]: 5,
        // Phase VI — Extended View Properties
        [CommandType.SET_VIEW_OUTPUT]:   5,
        [CommandType.SET_VIEW_RANGE]:    5,
        [CommandType.SET_VIEW_CROP]:     5,
        [CommandType.SET_VIEW_UNDERLAY]: 5,
        // Phase VII — Camera Persistence, View Templates, Phase Filters
        [CommandType.SET_VIEW_PROJECTION]:    5,
        [CommandType.SET_VIEW_TEMPLATE]:      5,
        [CommandType.SET_VIEW_TEMPLATE_LOCK]: 5,
        [CommandType.CREATE_VIEW_TEMPLATE]:   5,
        [CommandType.UPDATE_VIEW_TEMPLATE]:   5,
        [CommandType.DELETE_VIEW_TEMPLATE]:   5,
        [CommandType.CREATE_PHASE_FILTER]:    5,
        // Phase VIII — Semantic Context, Lighting, Design Options
        [CommandType.SET_VIEW_SEMANTICS]:     5,
        [CommandType.SET_VIEW_LIGHTING]:      5,
        [CommandType.SET_VIEW_DESIGN_OPTION]: 5,
        // Phase SC-4 — Parametric Layout Engine
        [CommandType.SET_SHEET_LAYOUT_RULE]:        5,
        [CommandType.APPLY_SHEET_LAYOUT_PRESET]:    5,
        // Phase SC-5 — Data Panels
        [CommandType.ADD_DATA_PANEL_TO_SHEET]:      5,
        [CommandType.UPDATE_DATA_PANEL]:            5,
        [CommandType.REMOVE_DATA_PANEL_FROM_SHEET]: 5,
        // Phase SC-6 — Export
        [CommandType.EXPORT_SHEET]:                 5,
        // Phase SC-7 — AI Sheet Authoring
        [CommandType.SET_SHEET_COMPOSITION_INTENT]: 5,
        // §ANN — Annotation System (Phase A + B)
        [CommandType.CREATE_ANNOTATION]: 25,
        [CommandType.DELETE_ANNOTATION]: 90,
        [CommandType.UPDATE_ANNOTATION]: 50,
        // §ANN-C3 — Constraint Solver: lock/unlock a placed linear-dim
        [CommandType.LOCK_ANNOTATION]:   50,
        // §ANN-VII-1 — Constraint Solver: explicit constraint refresh command
        [CommandType.UPDATE_CONSTRAINT]: 50,
        // §ANN-C1 — Phase C: AI-Augmented Annotation (macro-command, low priority)
        [CommandType.ANNOTATE_VIEW]:     30,
        // Stair railing commands
        [CommandType.CREATE_STAIR_RAILING]: 26,
        [CommandType.UPDATE_STAIR_RAILING]: 45,
        [CommandType.DELETE_STAIR_RAILING]: 89,
        // Phase D — Door/Window parametric parameter updates
        [CommandType.UPDATE_DOOR_PARAMETER]:   55,
        [CommandType.UPDATE_WINDOW_PARAMETER]: 55,
        // ── Rooms ──────────────────────────────────────────────────────────
        [CommandType.CREATE_ROOM]:             25,
        [CommandType.APPLY_GENERATIVE_LAYOUT]: 24,
        [CommandType.BATCH_CREATE_ROOMS]:      25,
        [CommandType.DETECT_ROOM_FROM_WALLS]:  26,
        [CommandType.DETECT_ALL_ROOMS]:        26,
        [CommandType.REDETECT_ROOMS]:               26,
        [CommandType.CREATE_ROOM_BOUNDING_LINE]:    27,
        [CommandType.UPDATE_ROOM_BOUNDING_LINE]:    50,
        [CommandType.DELETE_ROOM_BOUNDING_LINE]:    51,
        [CommandType.UPDATE_ROOM]:             50,
        [CommandType.UPDATE_ROOM_BOUNDARY]:    50,
        [CommandType.RENAME_ROOM]:             51,
        [CommandType.SET_ROOM_OCCUPANCY]:      51,
        [CommandType.UPDATE_ROOM_FINISHES]:    51,
        [CommandType.DELETE_ROOM]:             90,
        // FIX-7: Sketch degradation on wall removal (cascading structural change)
        [CommandType.DEGRADE_SLAB_SKETCH]:     85,
        // FIX-8: Batch slab removal on level deletion (cascading structural deletion)
        [CommandType.REMOVE_SLABS_ON_LEVEL]:   95,
        // ── Ceilings ───────────────────────────────────────────────────────
        [CommandType.CREATE_CEILING]:            21,
        [CommandType.UPDATE_CEILING]:            41,
        [CommandType.REMOVE_CEILING]:            90,
        [CommandType.UPDATE_CEILING_BOUNDARY]:   41,
        [CommandType.UPDATE_CEILING_LAYERS]:     41,
        [CommandType.REMOVE_CEILINGS_ON_LEVEL]:  95,
        // ── Floors ─────────────────────────────────────────────────────────
        [CommandType.CREATE_FLOOR]:              21,
        [CommandType.UPDATE_FLOOR]:              41,
        [CommandType.REMOVE_FLOOR]:              90,
        [CommandType.UPDATE_FLOOR_BOUNDARY]:     41,
        [CommandType.UPDATE_FLOOR_LAYERS]:       41,
        [CommandType.REMOVE_FLOORS_ON_LEVEL]:    95,
        // ── Data Platform: Hierarchy (Phase DP) ────────────────────────────
        [CommandType.CREATE_SITE]:               10,
        [CommandType.CREATE_BUILDING]:           11,
        [CommandType.CREATE_HIERARCHY_LEVEL]:    12,
        [CommandType.CREATE_UNIT]:               13,
        [CommandType.UPDATE_HIERARCHY_NODE]:     50,
        [CommandType.DELETE_HIERARCHY_NODE]:     92,
        [CommandType.ASSIGN_ROOM_TO_UNIT]:       55,
        [CommandType.UPDATE_PLANNED_DATA]:       55,
        // ── Data Platform: Templates (Phase DP) ────────────────────────────
        [CommandType.CREATE_TEMPLATE]:           14,
        [CommandType.UPDATE_TEMPLATE]:           50,
        [CommandType.DELETE_TEMPLATE]:           92,
        [CommandType.ASSIGN_TEMPLATE_TO_NODE]:   56,
        [CommandType.UNASSIGN_TEMPLATE]:         56,
        [CommandType.MARK_PROPERTY_DERIVED]:     57,
        [CommandType.CLEAR_PROPERTY_DERIVED]:    57,
        [CommandType.SET_DERIVATION]:            57,
        [CommandType.DUPLICATE_TEMPLATE]:        14,
        // ── Data Platform: Element Codes (Phase DP) ────────────────────────
        [CommandType.ASSIGN_ELEMENT_CODE]:       58,
        // ── Autonomous Auditor — Phase 0 (Requirements) ─────────────────────
        [CommandType.SET_ROOM_REQUIREMENT]:      60,
        [CommandType.UPDATE_REQUIREMENT]:        61,
        [CommandType.DELETE_REQUIREMENT]:        98,
        [CommandType.AUTO_REMEDIATE]:            99,
        // ── Autonomous Auditor — Phase 3 (Asset Catalog) ─────────────────────
        [CommandType.ADD_ASSET_CATALOG_ENTRY]:    16,
        [CommandType.UPDATE_ASSET_CATALOG_ENTRY]: 62,
        [CommandType.DELETE_ASSET_CATALOG_ENTRY]: 97,
        // ── Phase 12: View Template Manager ────────────────────────────────
        [CommandType.ASSIGN_VIEW_TEMPLATE]:              55,
        [CommandType.OVERRIDE_VIEW_TEMPLATE_PROPERTY]:   57,
        [CommandType.RESET_VIEW_TEMPLATE_PROPERTY]:      57,

        // ── Phase 5: Selection Toolbar Contextual Operations ────────────────
        [CommandType.JOIN_WALLS]:                        60,
        [CommandType.CUT_WALL]:                          60,
        [CommandType.MIRROR_ELEMENT]:                    61,
        [CommandType.COPY_ELEMENT]:                      61,
        [CommandType.SCALE_ELEMENT]:                     62,
        [CommandType.OFFSET_ELEMENT]:                    61,
        // §ANN — 2D section / elevation marks and callout details
        [CommandType.CREATE_SECTION_MARK]:               25,
        [CommandType.CREATE_ELEVATION_MARK]:             25,
        [CommandType.CREATE_CALLOUT_DETAIL]:             25,
        // ── Phase L — Lighting ─────────────────────────────────────────────
        [CommandType.CREATE_LIGHTING]:                   25,
        [CommandType.MOVE_LIGHTING]:                     55,
        [CommandType.UPDATE_LIGHTING_PARAMETERS]:        55,
        [CommandType.DELETE_LIGHTING]:                   90,
        // Underlay (PDF/JPG plan reference). Created early (visual scaffold),
        // transformed during edits, deleted late (with other removals).
        [CommandType.CREATE_UNDERLAY]:                   12,
        [CommandType.TRANSFORM_UNDERLAY]:                42,
        [CommandType.DELETE_UNDERLAY]:                   95,
        // C2 §SLAB-SYSTEM-AUDIT-2026: Added DELETE_SLAB to CommandType enum.
        [CommandType.DELETE_SLAB]:                       95,
        // Level duplication (creates walls/slabs/cols/furniture in one atomic step).
        [CommandType.DUPLICATE_FLOOR_PLAN]:              21,
    };

    /**
     * Orders a list of proposals into a safe, deterministic sequence.
     */
    static sortProposals(proposals: CommandProposal[]): CommandProposal[] {
        return [...proposals].sort((a, b) => {
            const priorityA = this.TYPE_PRIORITY[a.command.type] ?? 999;
            const priorityB = this.TYPE_PRIORITY[b.command.type] ?? 999;

            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }

            // Stable ordering for same type (by timestamp then ID)
            if (a.command.timestamp !== b.command.timestamp) {
                return a.command.timestamp - b.command.timestamp;
            }
            return a.id.localeCompare(b.id);
        });
    }
}
