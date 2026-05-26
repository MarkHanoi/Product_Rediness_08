// Apartment Layout Generator — shared types (SPEC-APARTMENT-LAYOUT-GENERATOR §3/§7/§8/§9).
//
// ZERO imports by design: the validator + scorer are pure functions over these
// plain types, so they unit-test in plain Node without any package barrel. The
// runtime Zod parse of the AI response (A1/A4) lives with the workflow and reuses
// these shapes.

export type RoomType =
    | 'master' | 'bedroom' | 'living' | 'kitchen' | 'dining'
    | 'bathroom' | 'ensuite' | 'hall' | 'corridor' | 'study' | 'utility';

/** A room in an AI-proposed layout (areas in m², coordinates in mm). */
export interface LayoutRoom {
    name: string;
    type: RoomType;
    area: number;                  // m²
    windowCount: number;
    /** Reachable without passing through another room (en-suite via master is allowed). */
    hasDirectAccess: boolean;
    /** Names of rooms this one is adjacent to (shares a wall / a door). */
    adjacentTo: string[];
    /** Footprint centroid (plan mm) — lets the build match this room to the
     *  detected room and apply its semantic name/type. */
    centroid?: Vec2mm;
    /** RoomOccupancyType string (e.g. 'bedroom','living-room') applied to the
     *  detected room post-build so it is coloured/tagged by use. */
    occupancy?: string;
}

export interface Vec2mm { x: number; y: number }      // plan coords, mm
/** A wall in a layout. `isExternal` marks a perimeter/shell wall — shown in the
 *  preview for context but skipped at build (the shell already exists). */
export interface LayoutWall { start: Vec2mm; end: Vec2mm; isExternal?: boolean }
export interface LayoutDoor { wallRef: number; offset: number; width: number; name?: string } // mm
/** A virtual room-bounding line (no wall, no door) that splits two adjacent
 *  open-plan spaces logically so room detection sees them as separate rooms.
 *  Built via the editor's `CreateRoomBoundingLineCommand` at execute time. */
export interface LayoutBoundary { start: Vec2mm; end: Vec2mm }

export interface LayoutOption {
    summary: string;
    rooms: LayoutRoom[];
    walls: LayoutWall[];
    doors: LayoutDoor[];
    /** Virtual room-splitters for open-plan thresholds (hall↔living, kitchen↔living,
     *  kitchen↔dining, …). Optional for back-compat with AI-produced options that
     *  predate this field. */
    boundaries?: LayoutBoundary[];
    corridorWidthMin: number;      // mm
}

export interface ApartmentConstraints {
    minCorridorWidth: number;      // mm
    wallThickness: number;         // mm
    floorToCeiling: number;        // mm
    wallTypeId: string;
}

export interface ApartmentProgram {
    bedrooms: number;
    bathrooms: number;
    masterEnSuite: boolean;
    openPlanKitchenDining: boolean;
    livingRoom: boolean;
    entranceHall: boolean;
}

export interface ScoringWeights {
    naturalLight: number;
    privacy: number;
    kitchenWorkflow: number;
    corridorEfficiency: number;
}

export interface ValidationResult {
    valid: boolean;
    /** Human-readable reasons; fed back into the retry prompt (§10). */
    failures: string[];
}

export interface LayoutScoreBreakdown {
    naturalLight: number;          // 0-1
    privacy: number;               // 0-1
    kitchenWorkflow: number;       // 0-1
    corridorEfficiency: number;    // 0-1
}

export interface LayoutScore {
    overall: number;               // 0-100
    breakdown: LayoutScoreBreakdown;
}

export interface ScoredLayoutOption extends LayoutOption {
    score: LayoutScore;
}

/** Generate-phase payload (SPEC §3). Units: mm for constraints; areas m². */
export interface ApartmentGenerateLayoutPayload {
    levelId: string;
    shellWallIds: string[];
    entranceDoorId: string;
    windowIds: string[];
    program: ApartmentProgram;
    constraints: ApartmentConstraints;
    options: { count: number; scoringWeights: ScoringWeights };
}

