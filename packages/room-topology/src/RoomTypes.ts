/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Semantic Model (Store layer)
 * File:             src/elements/rooms/RoomTypes.ts
 * Contract:         docs/01_ELEMENTS/09_Rooms_Contract/01-ROOM-DATA-MODEL-CONTRACT.md
 * Parent Contracts: 01-BIM-ENGINE-CORE-CONTRACT, 03-BIM-SEMANTIC-MODEL-CONTRACT
 *
 * Defines all TypeScript interfaces and enums for the Room subsystem.
 * No THREE.js imports — all geometry is XZ-plane plain objects for JSON round-trip safety.
 */

import { CoreElement } from '@pryzm/core-app-model';

// ── Occupancy Classification ───────────────────────────────────────────────────

export type RoomOccupancyType =
  // ── Residential ──────────────────────────────────────────────────────────
  | 'bedroom'
  | 'living-room'
  | 'kitchen'
  | 'bathroom'
  | 'dining-room'
  | 'utility-room'
  | 'garage'
  | 'storage-residential'

  // ── Commercial Office ─────────────────────────────────────────────────────
  | 'open-office'
  | 'private-office'
  | 'meeting-room'
  | 'reception'
  | 'breakout'
  | 'server-room'

  // ── Retail ────────────────────────────────────────────────────────────────
  | 'retail-floor'
  | 'stockroom'
  | 'changing-room'

  // ── Healthcare ────────────────────────────────────────────────────────────
  | 'patient-room'
  | 'operating-theatre'
  | 'waiting-room'
  | 'consultation-room'
  | 'pharmacy'

  // ── Education ─────────────────────────────────────────────────────────────
  | 'classroom'
  | 'laboratory'
  | 'lecture-hall'
  | 'library'
  | 'staff-room'

  // ── Hospitality ───────────────────────────────────────────────────────────
  | 'hotel-bedroom'
  | 'restaurant'
  | 'bar'
  | 'function-room'
  | 'spa'

  // ── Industrial / Warehouse ────────────────────────────────────────────────
  | 'warehouse'
  | 'loading-bay'
  | 'plant-room'
  | 'electrical-room'

  // ── Circulation ───────────────────────────────────────────────────────────
  | 'corridor'
  | 'stairwell'
  | 'lift-lobby'
  | 'entrance-lobby'
  | 'foyer'

  // ── Amenity / Shared ──────────────────────────────────────────────────────
  | 'wc'
  | 'accessible-wc'
  | 'shower-room'
  | 'kitchen-shared'
  | 'prayer-room'

  // ── Outdoor / Transitional ────────────────────────────────────────────────
  | 'terrace'
  | 'balcony'
  | 'atrium'
  | 'courtyard'

  // ── Default ───────────────────────────────────────────────────────────────
  | 'unclassified';

// ── Boundary ──────────────────────────────────────────────────────────────────

/** A vertex in the XZ world plane (Y-up coordinate system). */
export interface RoomVertex {
  x: number;
  z: number;
}

/** How the room boundary was detected or created. */
export type RoomDetectionMethod =
  | 'auto-topology'   // Flood-fill from wall graph (DetectRoomFromWallsCommand)
  | 'manual-boundary' // User drew explicit polygon
  | 'point-pick'      // User clicked inside a wall-enclosed zone
  | 'ai-generated'    // AI placed room from programme description
  | 'ifc-import';     // Imported from IFC IfcSpace geometry

export interface RoomBoundary {
  /** Closed CCW polygon in world XZ coordinates. Last vertex implicitly connects to first. Min 3 vertices. */
  polygon: RoomVertex[];
  /** Room clear height in metres. Must be > 0. */
  height: number;
  /** Y-offset from level elevation (typically 0). Used for raised floor zones. */
  baseOffset: number;
  /** How this boundary was established. */
  detectionMethod: RoomDetectionMethod;
}

// ── Finish Specification ──────────────────────────────────────────────────────

export interface RoomFinishSpec {
  materialId?: string;
  materialName: string;
  materialColor: string;
  finishCode?: string;
  nbs?: string;
  csiDivision?: string;
  notes?: string;
}

export interface RoomFinishes {
  floor?: RoomFinishSpec;
  ceiling?: RoomFinishSpec;
  walls?: RoomFinishSpec;
  skirtingHeight?: number;
  coveHeight?: number;
}

// ── Computed Metrics (read-only, always derived) ──────────────────────────────

export interface RoomComputedMetrics {
  /** Net floor area in m² (shoelace formula on boundary.polygon). */
  area: number;
  /** Gross area including wall thickness contribution (future: half-wall offset). */
  grossArea: number;
  /** Boundary perimeter in metres. */
  perimeter: number;
  /** area × boundary.height (m³). */
  volume: number;
  /** Polygon centroid for room tag placement. */
  centroid: RoomVertex;
  /** Axis-aligned bounding box in world XZ. */
  boundingBox: {
    minX: number;
    minZ: number;
    maxX: number;
    maxZ: number;
  };
}

// ── Extended Properties ───────────────────────────────────────────────────────

export interface RoomProperties {
  mark?: string;
  comments?: string;
  isNetArea?: boolean;
  isFired?: boolean;
  isAcoustic?: boolean;
  ventilationType?: 'natural' | 'mechanical' | 'mixed' | 'none';
  targetTemperature?: number;
  lightingLux?: number;
  acousticRating?: number;
  sprinklerZone?: string;
  hvacZone?: string;
  accessibilityLevel?: 'none' | 'part-m' | 'wheelchair-user-dwelling';
  [key: string]: string | number | boolean | null | undefined;
}

// ── IFC Interoperability ──────────────────────────────────────────────────────

export interface RoomIfcData {
  /** IFC GlobalId (22-char base64 GUID). */
  guid: string;
  /** Always 'IfcSpace'. */
  ifcClass: 'IfcSpace';
  predefinedType?: 'SPACE' | 'PARKING' | 'GFA' | 'INTERNAL' | 'EXTERNAL';
  longName?: string;
  psets?: Record<string, Record<string, string | number | boolean>>;
}

// ── Audit Trail ───────────────────────────────────────────────────────────────

export interface RoomMetadata {
  /** Unix ms — set once at creation; never overwritten. */
  createdAt: number;
  /** Unix ms — updated on every semantic change. */
  modifiedAt: number;
  /** User ID or 'system' or 'ai-agent'. */
  createdBy: string;
  /** Monotonically increasing integer, starts at 1. */
  version: number;
  /** true if room was initially created by AI. */
  aiGenerated?: boolean;
  /** Incremented each time boundary is re-detected. */
  detectionVersion?: number;
  tags?: string[];
  description?: string;
}

// ── Main RoomData Record ──────────────────────────────────────────────────────

export interface RoomData extends Omit<CoreElement, 'ifcData'> {
  // ── Identity ───────────────────────────────────────────────────────────────
  id: string;
  type: 'room';
  levelId: string;
  parentId?: string;

  // ── Identification ─────────────────────────────────────────────────────────
  /** Human-readable room name. Empty string valid (unnamed room). Never null. */
  name: string;
  /** Alphanumeric room number (e.g. "101", "G.04"). Empty = unassigned. */
  roomNumber: string;
  department?: string;

  // ── Data Platform — hierarchy linkage ─────────────────────────────────────
  /**
   * unitId links this room to a UnitData node in HierarchyStore.
   * Optional — rooms that predate the hierarchy system have no unit assignment.
   * Set via AssignRoomToUnitCommand. Never set by room detection or AI.
   *
   * @see docs/00_PRZYM/PRYZM_DATA_PLATFORM_READINESS_AUDIT_2026-03-31.md § PRE-STEP 4
   */
  unitId?: string;

  // ── Boundary Definition (semantic, not scene-graph) ────────────────────────
  boundary: RoomBoundary;

  // ── Bounding Elements ──────────────────────────────────────────────────────
  boundingWallIds: string[];
  boundingSlabIds: string[];
  boundingColumnIds: string[];

  // ── Occupancy & Programme ──────────────────────────────────────────────────
  occupancyType: RoomOccupancyType;
  occupancyLoad?: number;
  programmeArea?: number;

  // ── Finish Specification ───────────────────────────────────────────────────
  finishes: RoomFinishes;

  // ── Computed Metrics (read-only, derived from boundary polygon) ─────────────
  computed: RoomComputedMetrics;

  // ── Visual Properties ──────────────────────────────────────────────────────
  /** Custom hex override (e.g. '#B8D4F0'). If absent, RoomColourSystem resolves from occupancyType. */
  colour?: string;
  /** Plan-fill opacity 0–1. Defaults to 0.35. */
  opacity?: number;

  // ── BIM Interoperability ───────────────────────────────────────────────────
  properties: RoomProperties;
  ifcData?: RoomIfcData;
  revitId?: string;

  // ── Phase (reserved for construction phasing) ──────────────────────────────
  phase?: 'existing' | 'new' | 'demolished' | 'temporary';

  // ── Audit Trail ────────────────────────────────────────────────────────────
  metadata: RoomMetadata;
}

// ── System Type (Room Type preset — from RoomSystemTypeStore) ─────────────────

export interface RoomTypeDefaults {
  minArea?: number;
  maxArea?: number;
  targetArea?: number;
  occupancyLoad?: number;
  ceilingHeight?: number;
  lightingLux?: number;
  targetTemperature?: number;
  ventilationRate?: number;
  noiseRating?: number;
  accessibilityLevel?: 'none' | 'part-m' | 'wheelchair-user-dwelling';
}

export interface SpaceStandardReference {
  standard: string;
  clause?: string;
  country: string;
}

export interface RoomSystemType {
  id: string;
  occupancyType: RoomOccupancyType;
  name: string;
  description?: string;
  colour: string;
  defaults: RoomTypeDefaults;
  finishTemplate?: RoomFinishes;
  spaceStandard?: SpaceStandardReference;
  createdAt: number;
  modifiedAt: number;
  isBuiltIn: boolean;
}

// ── Tool State ────────────────────────────────────────────────────────────────

export type RoomToolMode =
  | 'NONE'
  | 'AUTO_POINT_PICK'
  | 'DETECT_LEVEL'
  | 'MANUAL_BOUNDARY';

export interface RoomToolCallbacks {
  onRoomCreated: (roomId: string) => void;
  onCancel: () => void;
  getActiveLevel: () => { id: string; elevation: number; height: number } | null;
}

// ── Store Event Types ─────────────────────────────────────────────────────────

export type RoomEventType = 'add' | 'update' | 'remove';
export type RoomEventListener = (event: RoomEventType, room: RoomData, prevState?: RoomData) => void;

// ── Programme Template ────────────────────────────────────────────────────────

export interface ProgrammeRoomSpec {
  occupancyType: RoomOccupancyType;
  name: string;
  targetArea: number;
  minArea?: number;
  quantity?: number;
  adjacencies?: string[];
  mustBeOnLevel?: 'any' | 'ground' | 'upper';
}

export interface RoomProgrammeTemplate {
  id: string;
  name: string;
  typology: string;
  description: string;
  rooms: ProgrammeRoomSpec[];
  totalArea: number;
  notes?: string;
}
