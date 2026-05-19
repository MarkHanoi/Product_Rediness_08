export enum AIIntentType {
    MODIFY_PROPERTY = 'MODIFY_PROPERTY',
    DELETE_ELEMENT = 'DELETE_ELEMENT',
    CREATE_ELEMENT = 'CREATE_ELEMENT',
    CREATE_MULTIPLE_LEVELS = 'CREATE_MULTIPLE_LEVELS',
    CREATE_WALLS_ON_SLAB = 'CREATE_WALLS_ON_SLAB',
    CREATE_ROOF_BY_REGION = 'CREATE_ROOF_BY_REGION',
    MODIFY_WARDROBE = 'MODIFY_WARDROBE',
    RECONFIGURE_WARDROBE = 'RECONFIGURE_WARDROBE',
    /** Phase 1: Replace the type of an individual curtain wall panel. */
    REPLACE_CURTAIN_PANEL = 'REPLACE_CURTAIN_PANEL',
    /** Phase 1: Add a grid line to a curtain wall's U or V axis. */
    ADD_CURTAIN_GRID_LINE = 'ADD_CURTAIN_GRID_LINE',
    /** Phase 4.2 (VG): Set per-category style override on a model. */
    SET_VG_CATEGORY_STYLE = 'SET_VG_CATEGORY_STYLE',
    /** Phase 4.2 (VG): Assign a VG template to a model file. */
    APPLY_VG_TEMPLATE_TO_MODEL = 'APPLY_VG_TEMPLATE_TO_MODEL',
    // ── Phase D — LLM View Authoring Protocol ─────────────────────────────────
    /** Phase D: Create a new ViewDefinition entity with optional VG template and intent. */
    CREATE_VIEW_DEFINITION    = 'CREATE_VIEW_DEFINITION',
    /** Phase D: Update the AI-authored intent string (and optional discipline/template) on a ViewDefinition. */
    UPDATE_VIEW_INTENT        = 'UPDATE_VIEW_INTENT',
    /** Phase D: Create a serialisable VisibilityRule on a view, model, or template scope. */
    CREATE_VISIBILITY_RULE    = 'CREATE_VISIBILITY_RULE',
    /** Phase D: Update mutable fields (condition, effect, priority, label, enabled) of a VisibilityRule. */
    UPDATE_VISIBILITY_RULE    = 'UPDATE_VISIBILITY_RULE',
    /** Phase D: Delete a VisibilityRule by id. */
    DELETE_VISIBILITY_RULE    = 'DELETE_VISIBILITY_RULE',
    /** Phase D: Tag one or more BIM elements by a QueryExpression condition or a specific elementId. */
    TAG_ELEMENTS_BY_CONDITION = 'TAG_ELEMENTS_BY_CONDITION',
    /** Phase D: Read-only query — returns current view state via AIReadModel.getViewsForLLM(). No command produced. */
    QUERY_VIEW_STATE          = 'QUERY_VIEW_STATE',
    // ── Phase IV — Sheet & Schedule AI Authoring ───────────────────────────────
    /** Phase IV: Create a new SheetDefinition entity in SheetStore. */
    CREATE_SHEET              = 'CREATE_SHEET',
    /** Phase IV: Update mutable fields on an existing SheetDefinition. */
    UPDATE_SHEET              = 'UPDATE_SHEET',
    /** Phase IV: Create a new ScheduleDefinition entity in ScheduleStore. */
    CREATE_SCHEDULE           = 'CREATE_SCHEDULE',
    /** Phase IV: Update mutable fields on an existing ScheduleDefinition. */
    UPDATE_SCHEDULE           = 'UPDATE_SCHEDULE',
}

export interface BaseAIIntent {
    intentId: string;
    intentType: AIIntentType;
    rationale: string;
    confidence: number;
}

export interface ModifyPropertyIntent extends BaseAIIntent {
    intentType: AIIntentType.MODIFY_PROPERTY;
    targetElementId: string;
    property: string;
    suggestedValue: unknown;
}

export interface DeleteElementIntent extends BaseAIIntent {
    intentType: AIIntentType.DELETE_ELEMENT;
    targetElementId: string;
}

export interface CreateElementIntent extends BaseAIIntent {
    intentType: AIIntentType.CREATE_ELEMENT;
    elementType: 'wall' | 'grid' | 'level';
    payload: Record<string, unknown>;
}

/** Phase 1: Replace the type of an individual curtain wall panel. */
export interface ReplaceCurtainPanelIntent extends BaseAIIntent {
    intentType: AIIntentType.REPLACE_CURTAIN_PANEL;
    panelId: string;
    newPanelType: 'SystemPanel_Glass' | 'SystemPanel_Opaque' | 'SystemPanel_Empty';
    materialOverride?: string;
}

/** Phase 1: Add a grid line to a curtain wall. */
export interface AddCurtainGridLineIntent extends BaseAIIntent {
    intentType: AIIntentType.ADD_CURTAIN_GRID_LINE;
    curtainWallId: string;
    axis: 'u' | 'v';
    t: number;
}

/** Phase 4.2 (VG): Partial VGCategoryStyle payload — mirrors VGGovernanceStore's VGCategoryStyle. */
export interface VGCategoryStylePayload {
    fillColor?: string;
    edgeColor?: string;
    lineWeight?: number;
    transparency?: number;
    visible?: boolean;
    halftone?: boolean;
    cutLineWeight?: number;
    projectionLineWeight?: number;
    beyondLineWeight?: number;
    beyondEdgeColor?: string;
    beyondVisible?: boolean;
}

/** Phase 4.2 (VG): Override a per-category style on a specific model file. */
export interface SetVGCategoryStyleIntent extends BaseAIIntent {
    intentType: AIIntentType.SET_VG_CATEGORY_STYLE;
    modelId: string;
    category: string;
    style: Partial<VGCategoryStylePayload>;
}

/** Phase 4.2 (VG): Assign a VG template to a model file. */
export interface ApplyVGTemplateToModelIntent extends BaseAIIntent {
    intentType: AIIntentType.APPLY_VG_TEMPLATE_TO_MODEL;
    modelId: string;
    templateId: string | null;
}

// ── Phase D — LLM View Authoring Protocol intent interfaces ──────────────────

/**
 * Phase D: Create a new ViewDefinition entity.
 * Maps to CreateViewDefinitionCommand.
 */
export interface CreateViewDefinitionIntent extends BaseAIIntent {
    intentType:   AIIntentType.CREATE_VIEW_DEFINITION;
    id:           string;
    name:         string;
    viewType:     'plan' | '3d' | 'section' | 'elevation' | 'analysis';
    discipline?:  'architecture' | 'structure' | 'mep' | 'all';
    levelId?:     string;
    phaseFilter?: 'Existing' | 'Demolition' | 'New Construction' | 'Future';
    vgTemplateId?: string;
    intent?:      string;
}

/**
 * Phase D: Update the AI-authored intent string on a ViewDefinition.
 * Optionally updates discipline and vgTemplateId.
 * Maps to UpdateViewDefinitionCommand with a selective patch.
 */
export interface UpdateViewIntentIntent extends BaseAIIntent {
    intentType:    AIIntentType.UPDATE_VIEW_INTENT;
    viewId:        string;
    intent?:       string;
    discipline?:   'architecture' | 'structure' | 'mep' | 'all';
    vgTemplateId?: string | null;
}

/**
 * Phase D: Create a serialisable VisibilityRule on a view, model, or template scope.
 * Maps to CreateVisibilityRuleCommand.
 */
export interface CreateVisibilityRuleIntent extends BaseAIIntent {
    intentType: AIIntentType.CREATE_VISIBILITY_RULE;
    id:         string;
    label?:     string;
    condition:  object;
    effect:     {
        visible?:      boolean;
        fillColor?:    string;
        edgeColor?:    string;
        transparency?: number;
        lineWeight?:   number;
        halftone?:     boolean;
    };
    priority:  number;
    scope:     'template' | 'model' | 'view';
    scopeId:   string;
    enabled:   boolean;
}

/**
 * Phase D: Update mutable fields of an existing VisibilityRule.
 * Maps to UpdateVisibilityRuleCommand.
 */
export interface UpdateVisibilityRuleIntent extends BaseAIIntent {
    intentType: AIIntentType.UPDATE_VISIBILITY_RULE;
    ruleId:     string;
    patch:      {
        label?:     string;
        condition?: object;
        effect?:    {
            visible?:      boolean;
            fillColor?:    string;
            edgeColor?:    string;
            transparency?: number;
            lineWeight?:   number;
            halftone?:     boolean;
        };
        priority?: number;
        enabled?:  boolean;
    };
}

/**
 * Phase D: Delete a VisibilityRule by id.
 * Maps to DeleteVisibilityRuleCommand.
 */
export interface DeleteVisibilityRuleIntent extends BaseAIIntent {
    intentType: AIIntentType.DELETE_VISIBILITY_RULE;
    ruleId:     string;
}

/**
 * Phase D: Tag one or more BIM elements.
 * If elementId is provided, tags that specific element.
 * If condition is provided (and no elementId), resolves the first matching element
 * via SemanticIndex. The LLM should produce one intent per element for bulk tagging.
 * Maps to TagElementCommand.
 */
export interface TagElementsByConditionIntent extends BaseAIIntent {
    intentType:    AIIntentType.TAG_ELEMENTS_BY_CONDITION;
    elementId?:    string;
    condition?:    object;
    tagsToAdd:     string[];
    tagsToRemove:  string[];
}

/**
 * Phase D: Read-only query — no command produced.
 * The caller should use AIReadModel.getViewsForLLM() directly.
 * Included in the union so the mapper can acknowledge and log it.
 */
export interface QueryViewStateIntent extends BaseAIIntent {
    intentType: AIIntentType.QUERY_VIEW_STATE;
}

// ── Phase IV — Sheet & Schedule AI Authoring intent interfaces ────────────────

/**
 * Phase IV: Create a new SheetDefinition entity in SheetStore.
 * Maps to CreateSheetCommand.
 */
export interface CreateSheetIntent extends BaseAIIntent {
    intentType:   AIIntentType.CREATE_SHEET;
    id:           string;
    sheetNumber:  string;
    name:         string;
    revision?:    string;
    viewIds?:     string[];
    titleBlock?:  string;
}

/**
 * Phase IV: Update mutable fields on an existing SheetDefinition.
 * Maps to UpdateSheetCommand.
 */
export interface UpdateSheetIntent extends BaseAIIntent {
    intentType: AIIntentType.UPDATE_SHEET;
    sheetId:    string;
    patch: {
        sheetNumber?: string;
        name?:        string;
        revision?:    string;
        viewIds?:     string[];
        titleBlock?:  string;
    };
}

/**
 * Phase IV: Create a new ScheduleDefinition entity in ScheduleStore.
 * Maps to CreateScheduleCommand.
 */
export interface CreateScheduleIntent extends BaseAIIntent {
    intentType:   AIIntentType.CREATE_SCHEDULE;
    id:           string;
    name:         string;
    scheduleType: 'doors' | 'windows' | 'walls' | 'columns' | 'custom';
    fields?:      string[];
}

/**
 * Phase IV: Update mutable fields on an existing ScheduleDefinition.
 * Maps to UpdateScheduleCommand.
 */
export interface UpdateScheduleIntent extends BaseAIIntent {
    intentType:  AIIntentType.UPDATE_SCHEDULE;
    scheduleId:  string;
    patch: {
        name?:   string;
        fields?: string[];
    };
}

export type AIIntent =
    | ModifyPropertyIntent
    | DeleteElementIntent
    | CreateElementIntent
    | ReplaceCurtainPanelIntent
    | AddCurtainGridLineIntent
    | SetVGCategoryStyleIntent
    | ApplyVGTemplateToModelIntent
    // Phase D
    | CreateViewDefinitionIntent
    | UpdateViewIntentIntent
    | CreateVisibilityRuleIntent
    | UpdateVisibilityRuleIntent
    | DeleteVisibilityRuleIntent
    | TagElementsByConditionIntent
    | QueryViewStateIntent
    // Phase IV
    | CreateSheetIntent
    | UpdateSheetIntent
    | CreateScheduleIntent
    | UpdateScheduleIntent;
