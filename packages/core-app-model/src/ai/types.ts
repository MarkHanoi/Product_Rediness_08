import { AIIntentType } from './intents';

export interface AIIntentSuggestion {
    intent: AIIntentType;
    targetElementId?: string;
    levelId?: string;
    property?: string;
    currentValue?: any;
    suggestedValue?: any;
    rationale: string;
    confidence: number;
    impact: string;
    payload?: any;
}

export type ElementType =
    | 'wall'
    | 'slab'
    | 'column'
    | 'window'
    | 'door'
    | 'curtain-wall'
    | 'beam'
    | 'stair'
    | 'genericComponent'
    | 'furniture'
    | 'handrail';

export type SpatialStatus = 'Verified' | 'Orphaned' | 'Unknown';

export interface AIStairDescriptor {
    riserCount?: number;
    treadCount?: number;
    baseLevelId?: string;
    topLevelId?: string;
}

export interface AIGenericComponentDescriptor {
    componentName?: string;
    familyId?: string;
    parameters?: Record<string, any>;
}

export interface AIElement {
    id: string;
    type: ElementType;
    levelId: string;
    levelName?: string;
    parentId?: string;
    childrenIds?: string[];
    properties: AIProperties;
    ifcData?: {
        guid?: string;
        ifcClass?: string;
        psetCommon?: Record<string, any>;
    };
    spatialStatus?: SpatialStatus;
    stairDescriptor?: AIStairDescriptor;
    componentDescriptor?: AIGenericComponentDescriptor;
    
    // Furniture extensions
    furnitureType?: string;
    width?: number;
    height?: number;
    length?: number;
    wardrobeConfig?: any;
}

/**
 * Structural classification for element properties.
 * Separates core architectural data from extension metadata.
 */
export interface AIProperties {
    // Core Schema (Strongly Typed)
    core: {
        material?: string;
        function?: 'Internal' | 'External';
        isExternal?: boolean;
        loadBearing?: boolean;
        fireRating?: string;
        acousticRating?: string;
    };
    // Extension Schema (Flexible Namespacing)
    extensions: {
        cost?: {
            category?: string;
            unitPrice?: number;
        };
        maintenance?: Record<string, any>;
        custom?: Record<string, any>;
    };
    // Legacy support for unclassified properties
    unclassified: Record<string, any>;
}

export interface AIWall extends AIElement {
    type: 'wall';
    length: number;
    height: number;
    thickness: number;
    baseOffset: number;
    openingCount: number;
}

export interface AIDoor extends AIElement {
    type: 'door';
    width: number;
    height: number;
    sillHeight: number;
    doorType?: 'single' | 'double';
    wallId: string;
}

export interface AIWindow extends AIElement {
    type: 'window';
    width: number;
    height: number;
    sillHeight: number;
    windowType?: 'single' | 'double';
    wallId: string;
}

export interface AISlab extends AIElement {
    type: 'slab';
    width: number;
    depth: number;
    thickness: number;
}

export interface AIColumn extends AIElement {
    type: 'column';
    width: number;
    depth: number;
    height: number;
    profile: 'rectangular' | 'circular';
}

export interface AIBeam extends AIElement {
    type: 'beam';
    startPoint: { x: number; y: number; z: number };
    endPoint: { x: number; y: number; z: number };
    width: number;
    depth: number;
    span: number;
    spanToDepthRatio: number;
    startSupportId?: string;
    endSupportId?: string;
    startSupportType?: 'column' | 'wall' | 'beam';
    endSupportType?: 'column' | 'wall' | 'beam';
    supportCount: number;
}

export interface AILevel {
    id: string;
    name: string;
    elevation: number;
    height?: number;
    childrenIds?: string[];
}

/**
 * AI read model for a curtain wall — richer than the previous AIElement stub.
 * Exposes grid topology and panel count for AI façade reasoning.
 */
export interface AICurtainWall extends AIElement {
    type: 'curtain-wall';
    length: number;
    height: number;
    baseOffset: number;
    gridXSpacing: number;
    gridYSpacing: number;
    /** Number of U-lines (columns + 1) in the grid. */
    uLineCount: number;
    /** Number of V-lines (rows + 1) in the grid. */
    vLineCount: number;
    /** Total number of grid cells (panels). */
    panelCount: number;
    /** Breakdown of panel types in this wall. */
    panelTypeSummary: {
        glass: number;
        opaque: number;
        empty: number;
    };
}

/**
 * AI read model for a single curtain wall panel.
 * Allows AI to reason about individual façade cells.
 */
export interface AICurtainPanel {
    id: string;
    curtainWallId: string;
    levelId: string;
    cellIndex: [number, number];
    panelType: 'SystemPanel_Glass' | 'SystemPanel_Opaque' | 'SystemPanel_Empty';
    materialOverride?: string;
    /** Approximate panel area in m² (cell width × cell height). */
    area: number;
}

export interface RuleSeverity {
    level: 'error' | 'warning' | 'info';
    code: string;
}

export interface RuleExplanation {
    title: string;
    severity: 'P0' | 'P1' | 'P2';
    condition: string;
    technicalFinding: string;
    professionalImpact: string;
    downstreamConsequences: string[];
    recommendedAction?: string;
    aiActionSafety: {
        canSuggestFix: boolean;
        canAutoExecute: false;
        notes: string;
    };
}

export interface RuleViolation {
    ruleId: string;
    ruleName: string;
    severity: RuleSeverity;
    elementId: string;
    elementType: ElementType;
    message: string;
    details: string;
    levelId?: string;
    explanation?: string;
    suggestedAction?: string;
    fullExplanation?: RuleExplanation;
}

export interface ValidationReport {
    timestamp: Date;
    totalElements: number;
    violations: RuleViolation[];
    summary: {
        errors: number;
        warnings: number;
        info: number;
    };
}

export interface QueryResult {
    query: string;
    answer: string;
    elements?: AIElement[];
    count?: number;
    groupedData?: Record<string, any[]>;
}

export interface ModelSummary {
    totalElements: number;
    byType: Record<ElementType, number>;
    byLevel: Record<string, number>;
    levels: AILevel[];
    ifcReadiness: {
        complete: number;
        incomplete: number;
        missing: string[];
    };
}

/**
 * Minimal interface for AIService consumed by QueryEngine.
 *
 * Anchored to: docs/archive/pryzm3-internal/04-PLAN-FORWARD/09-WAVE-5-CAST-DELETION.md §3 §4.
 * Wave 5 Day 1: replaces window-cast aiService reads in QueryEngine.ts.
 * QueryEngine imports this interface (not the concrete AIService class) to
 * avoid a circular dependency:  AIService → QueryEngine → AIService.
 */
export interface AIServiceLike {
    /**
     * Returns the current intent suggestions.
     * Return type is `any[]` because QueryEngine monkey-patches this method with
     * loosely-typed suggestion literals (pre-existing pattern; Wave 7 will tighten).
     */
    getIntentSuggestions(): any[];
    getCommandProposals(): Promise<unknown[]>;
}
