/**
 * TemplateTypes.ts — PRYZM Data Platform: Template System
 *
 * Source: PRYZM_DATA_PLATFORM_DEEP_IMPLEMENTATION_PLAN.md §STEP 2.1
 * Contract: 01-BIM-ENGINE-CORE-CONTRACT §3.2
 *
 * PRE-STEP 1 FIX (2026-03-31):
 *   FinishRequirement uses `materialId` (not `materialCode`) to match
 *   RoomFinishSpec.materialId in src/elements/rooms/RoomTypes.ts.
 *   Using `materialCode` would cause SyncStateEngine finish comparisons to
 *   silently fail — always returning 'conflict' even when finishes are correct.
 *
 * FUTURE NOTE on isShared:
 *   isShared is implemented as a local-only flag in this phase.
 *   Cross-project server-side template sharing is deferred to Phase C.
 *   // FUTURE: Phase C — server template registry
 */

export type TemplateScope = 'site' | 'building' | 'level' | 'unit' | 'room' | 'element';

export interface TemplateDefinition {
    id: string;
    scope: TemplateScope;
    name: string;
    code: string;              // e.g. "APT-1B"
    description?: string;
    version: number;
    /** Local-only flag in this phase. Cross-project sharing deferred to Phase C. */
    isShared: boolean;         // FUTURE: Phase C — server template registry
    requirements: TemplateRequirements;
    metadata: {
        createdAt: number;
        createdBy: string;
        modifiedAt: number;
        modifiedBy: string;
        tags?: string[];
    };
}

export interface TemplateRequirements {
    targetArea?: AreaRequirement;
    targetCount?: CountRequirement;
    childNodeRequirements?: ChildNodeRequirement[];
    wallRequirements?: WallRequirement[];
    doorRequirements?: DoorRequirement[];
    windowRequirements?: WindowRequirement[];
    finishRequirements?: FinishRequirement[];
    equipmentRequirements?: EquipmentRequirement[];
    adjacencyRequirements?: AdjacencyRequirement[];
    elementTypeCode?: string;
    fireRating?: string;
    materialSpec?: string;
    customRequirements?: CustomRequirement[];
}

export interface AreaRequirement {
    minimum?: number;           // m²
    maximum?: number;           // m²
    target?: number;            // m² ideal
    tolerancePercent?: number;  // default 5%
}

export interface CountRequirement {
    minimum?: number;
    maximum?: number;
    exact?: number;
}

export interface DoorRequirement {
    typeCode?: string;          // matches DoorOpening.type in DoorStore
    fireRating?: string;        // matches DoorOpening.fireRating
    minimumCount?: number;
    maximumCount?: number;
    requiredCount?: number;
    notes?: string;
}

export interface WindowRequirement {
    typeCode?: string;
    minimumCount?: number;
    maximumCount?: number;
    requiredCount?: number;
    minimumGlazingRatio?: number;
}

export interface WallRequirement {
    typeCode?: string;
    fireRating?: string;
    notes?: string;
}

/**
 * PRE-STEP 1 FIX: uses `materialId` to match RoomFinishSpec.materialId.
 *
 * SyncStateEngine finish evaluation chain:
 *   actual = room.finishes[requirement.surface]?.materialId
 *   compare against requirement.materialId (if specified)
 *
 * Do NOT rename this field to `materialCode` — that would cause silent
 * comparison failures in SyncStateEngine finish evaluation.
 */
export interface FinishRequirement {
    surface: 'floor' | 'ceiling' | 'wall';
    materialId?: string;        // matches RoomFinishSpec.materialId in RoomTypes.ts
    materialCategory?: string;
    notes?: string;
}

export interface EquipmentRequirement {
    equipmentType: string;
    minimumCount?: number;
    requiredCount?: number;
    notes?: string;
}

export interface AdjacencyRequirement {
    mustBeAdjacentTo?: string;    // occupancyType from RoomOccupancyType enum
    mustNotBeAdjacentTo?: string;
    notes?: string;
}

export interface ChildNodeRequirement {
    childScope: TemplateScope;
    templateCode?: string;
    minimumCount?: number;
    maximumCount?: number;
    requiredCount?: number;
}

export interface CustomRequirement {
    key: string;
    label: string;
    expectedValue?: string | number | boolean;
    tolerance?: number;
    notes?: string;
}

export interface TemplateAssignment {
    id: string;
    nodeId: string;              // HierarchyStore node id OR RoomStore room id
    nodeType: TemplateScope;
    templateId: string;
    assignedAt: number;
    assignedBy: string;
    /**
     * derivations: per-requirement-key flags.
     * When a key is present, the mismatch is 'derived' (orange) not 'conflict' (red).
     * Set via MarkPropertyDerivedCommand.
     */
    derivations: Record<string, string>;  // key → reason
}
