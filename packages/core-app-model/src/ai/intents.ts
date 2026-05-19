/**
 * @file intents.ts
 * @description Formal vocabulary for AI-generated intents.
 *
 * CHANGE LOG — AI Element Generation Phase 0:
 *  - Added CREATE_AI_ELEMENT to AIIntentType enum.
 *
 * NOTE: These are NOT executable by the AI. They are structural markers
 * used to classify the "intent" behind a suggestion or rule violation.
 */

export enum AIIntentType {
    CREATE_ELEMENT = 'CREATE_ELEMENT',
    CREATE_WALLS_ON_SLAB = 'CREATE_WALLS_ON_SLAB',
    CREATE_WALLS_ON_ALL_SLABS = 'CREATE_WALLS_ON_ALL_SLABS',
    MODIFY_PROPERTY = 'MODIFY_PROPERTY',
    DELETE_ELEMENT = 'DELETE_ELEMENT',
    SWITCH_VIEW = 'SWITCH_VIEW',
    GENERATE_REPORT = 'GENERATE_REPORT',
    VALIDATE_MODEL = 'VALIDATE_MODEL',
    CREATE_MULTIPLE_LEVELS = 'CREATE_MULTIPLE_LEVELS',
    CREATE_CURTAIN_WALLS_ON_SLAB = 'CREATE_CURTAIN_WALLS_ON_SLAB',
    CREATE_CURTAIN_WALLS_ON_ALL_SLABS = 'CREATE_CURTAIN_WALLS_ON_ALL_SLABS',
    CREATE_ROOF_BY_REGION = 'CREATE_ROOF_BY_REGION',
    MODIFY_CURTAIN_WALL_PROPERTY_ALL = 'MODIFY_CURTAIN_WALL_PROPERTY_ALL',
    CREATE_SLABS_ON_ALL_FLOORS = 'CREATE_SLABS_ON_ALL_FLOORS',
    CREATE_SLAB_ON_LEVEL_SIMILAR_TO_SELECTED = 'CREATE_SLAB_ON_LEVEL_SIMILAR_TO_SELECTED',
    CREATE_ALL_SLABS_FROM_LEVEL_TO_ALL_FLOORS = 'CREATE_ALL_SLABS_FROM_LEVEL_TO_ALL_FLOORS',
    CREATE_ALL_SLABS_FROM_LEVEL_TO_TOP_LEVEL = 'CREATE_ALL_SLABS_FROM_LEVEL_TO_TOP_LEVEL',
    MODIFY_WARDROBE = 'MODIFY_WARDROBE',
    // ── Grid System ───────────────────────────────────────────────────────────
    CREATE_GRID_SYSTEM = 'CREATE_GRID_SYSTEM',
    DELETE_ALL_GRIDS   = 'DELETE_ALL_GRIDS',
    // ── AI Element Generation ─────────────────────────────────────────────────
    CREATE_AI_ELEMENT = 'CREATE_AI_ELEMENT',
}

export interface AIIntent {
    type: AIIntentType;
    payload: Record<string, unknown>;
    metadata?: {
        reason: string;
        confidence: number;
        sourceRule?: string;
    };
}