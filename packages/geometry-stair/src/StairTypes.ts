// ─── Phase 1: Data Model Foundation ────────────────────────────────────────
// NO THREE.js imports in the semantic layer (§03-BIM-SEMANTIC-MODEL-CONTRACT §1.1)
// All consumer files convert Vec3 → THREE.Vector3 at build time.

import type { RailingType } from './StairRailingTypes';

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

// ─── Shape types ────────────────────────────────────────────────────────────

export type StairShape = 'I' | 'L' | 'U' | 'spiral' | 'winder';

export type StairMaterial = 'concrete' | 'steel' | 'timber' | 'marble' | 'glass' | 'composite';

export type StairNosingType = 'none' | 'standard' | 'extended' | 'rounded';

export type StairStringerType = 'none' | 'closed' | 'open' | 'mono';

// ─── Flight ─────────────────────────────────────────────────────────────────

export interface StairFlight {
    direction: Vec3;
    riserCount: number;
    startOverride?: Vec3;
    /**
     * Per-flight tread depth override (metres).
     *
     * §STAIR-PREVIEW-MATCH-2026-04-25 v2 — when a multi-segment stair path
     * (L/U) is converted from a 2D polyline, each segment may resolve to a
     * slightly different per-segment tread depth (segment_length / step_count)
     * because the solver distributes a fixed total step count across segments
     * of arbitrary length.  Carrying that value per-flight here lets the
     * mesh builder lay out each flight to fit its drawn polyline segment
     * EXACTLY, so the 3D stair matches the 2D preview footprint instead of
     * extending past the user-drawn corner by ~½ tread + ½ width.
     *
     * When omitted, the mesh builder falls back to `stair.treadDepth` (the
     * single nominal value) — preserving legacy/uniform-tread stairs built
     * by StairCreationController.
     */
    treadDepth?: number;
}

// ─── Landing ─────────────────────────────────────────────────────────────────

export interface StairLanding {
    depth: number;
    /**
     * Optional landing centre in world XZ (Y unused).
     *
     * §STAIR-PREVIEW-MATCH-2026-04-25 v3 — when a 2D-polyline-driven stair
     * reserves landing space inside each flight's segment (so the flight
     * portion stops short of the polyline corner), the mesh builder needs
     * to know WHERE the landing should sit independently of where flight 1
     * ended.  Setting `center` to the user-drawn polyline corner places the
     * landing centred on that corner regardless of flight 1's end position.
     *
     * When omitted, the mesh builder falls back to placing the landing
     * relative to the previous flight's end (legacy / auto-advance flow).
     */
    center?: Vec3;
}

// ─── Properties ──────────────────────────────────────────────────────────────

export interface StairProperties {
    mark?: string;
    material?: StairMaterial;
    treadMaterial?: StairMaterial;
    riserMaterial?: StairMaterial;
    riserVisible: boolean;
    nosingType: StairNosingType;
    nosingDepth: number;
    stringerType: StairStringerType;
    stringerThickness?: number;
    handrailLeft: boolean;
    handrailRight: boolean;
    handrailHeight: number;
    railingType?: RailingType;
    description?: string;
    tags?: string[];
}

export const DEFAULT_STAIR_PROPERTIES: StairProperties = {
    riserVisible: true,
    nosingType: 'standard',
    nosingDepth: 0.025,
    stringerType: 'none',
    handrailLeft: true,
    handrailRight: true,
    handrailHeight: 1.050,
};

// ─── Metadata ─────────────────────────────────────────────────────────────────

export interface StairMetadata {
    createdAt: string;
    modifiedAt: string;
    version: number;
    source: 'user' | 'ai' | 'import';
    createdBy?: string;
}

export interface StairTypeSnapshot {
    typeId: string;
    name: string;
    defaults: Record<string, string | number | boolean>;
    capturedAt: string;
}

// ─── StairData (renamed from Stair) — the canonical semantic model ──────────
// Implements ElementSchema (§03-BIM-SEMANTIC-MODEL-CONTRACT §1.1).
// No THREE.Vector3. All positions/directions are plain Vec3.

export interface StairData {
    // ── Identity
    id: string;
    type: 'stair';

    // ── Level binding (§02-BIM-SPATIAL-PROJECTION-CONTRACT §1)
    levelId: string;
    baseLevelId: string;
    topLevelId: string;
    baseOffset: number;
    topOffset: number;

    // ── Geometry params
    shape: StairShape;
    startPosition: Vec3;
    width: number;
    riserHeight: number;
    treadDepth: number;
    riserCount: number;

    // ── Structural definition
    flights: StairFlight[];
    landings: StairLanding[];

    // ── Shape control parameters
    /** L-shape: which way the second run turns (default 'left') */
    turnDirection?: 'left' | 'right';
    /** U-shape: which side the second run is placed on (default 'left') */
    secondRunSide?: 'left' | 'right';
    /** L / U shapes: number of risers in first flight before the landing */
    stepsBeforeLanding?: number;

    // ── Type system
    typeId?: string;
    typeSnapshot?: StairTypeSnapshot;

    // ── Properties / materials
    properties: StairProperties;

    // ── Code compliance
    accessibilityType?: 'standard' | 'accessible';
    fireRating?: string;
    buildingCodeVariant?: string;

    // ── AI semantic model (§03 §4)
    parameters: Record<string, number | string | boolean | null>;

    // ── Audit trail (§03 §1.1)
    metadata: StairMetadata;

    // ── IFC
    ifcData?: {
        guid: string;
        ifcClass: 'IfcStair' | 'IfcStairFlight';
    };
}

// ── Backwards-compatible alias — consumers update to StairData over time
export type Stair = StairData;

// ─── Constraints ──────────────────────────────────────────────────────────────

export interface StairValidationConstraints {
    MIN_RISER_HEIGHT: number;
    MAX_RISER_HEIGHT: number;
    MIN_TREAD_DEPTH: number;
    MIN_WIDTH: number;
    MIN_ACCESSIBLE_WIDTH: number;
    MIN_RISER_COUNT: number;
    HEIGHT_TOLERANCE: number;
    MAX_RISERS_PER_FLIGHT: number;
    MIN_LANDING_DEPTH: number;
    MIN_HANDRAIL_HEIGHT: number;
    MAX_HANDRAIL_HEIGHT: number;
}

export const STAIR_CONSTRAINTS: StairValidationConstraints = {
    MIN_RISER_HEIGHT: 0.150,
    MAX_RISER_HEIGHT: 0.190,
    MIN_TREAD_DEPTH: 0.250,
    MIN_WIDTH: 0.900,
    MIN_ACCESSIBLE_WIDTH: 1.200,
    MIN_RISER_COUNT: 2,
    HEIGHT_TOLERANCE: 0.050,
    MAX_RISERS_PER_FLIGHT: 16,
    MIN_LANDING_DEPTH: 0.900,
    MIN_HANDRAIL_HEIGHT: 0.900,
    MAX_HANDRAIL_HEIGHT: 1.100,
};

// ─── Validation results ────────────────────────────────────────────────────

export interface StairValidationResult {
    isValid: boolean;
    errors: StairValidationError[];
    warnings: StairValidationWarning[];
}

export interface StairValidationError {
    code: string;
    message: string;
    field: string;
    currentValue: number | string;
    requiredValue?: number | string;
}

export interface StairValidationWarning {
    code: string;
    message: string;
    field: string;
    recommendation: string;
}

// ─── Events ────────────────────────────────────────────────────────────────

export type StairEventType = 'add' | 'update' | 'remove';
export type StairEventListener = (event: StairEventType, stair: StairData) => void;
