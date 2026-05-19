/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Semantic Model (Type definitions)
 * File:             src/elements/roomBoundingLines/RoomBoundingLineTypes.ts
 * Contracts:        03-BIM-SEMANTIC-MODEL-CONTRACT §1 — ElementSchema
 *                   03-BIM-SEMANTIC-MODEL-CONTRACT §1.7 — Mark pattern (RB prefix)
 *
 * Defines the RoomBoundingLine element — a planar line element that participates
 * in room detection without being a physical wall. Placed in Interiors category.
 *
 * Schema compliance:
 *   - All fields serializable (no THREE.js / no functions / no circular refs)
 *   - placement uses XZ-plane plain objects (no Point3D imported — keeps circular-free)
 *   - Mark prefix: RB (Room Bounding)
 */

export interface RoomBoundingLinePlacement {
  /** Start point in level-local XZ plane (world X/Z, Y=levelElevation) */
  start: { x: number; z: number };
  /** End point in level-local XZ plane */
  end: { x: number; z: number };
}

export interface RoomBoundingLineProperties {
  /** Canonical mark: RB-FF-NNN (Contract §03-1.7) */
  mark: string;
  /** Whether this line actively participates in room detection (default true) */
  isActive: boolean;
  /** Optional display name */
  name?: string;
  /** Override display colour (CSS hex) — defaults to system colour when absent */
  color?: string;
}

export interface RoomBoundingLineMetadata {
  createdAt: number;
  modifiedAt: number;
  createdBy: string;
  version: number;
  tags?: string[];
}

export interface RoomBoundingLineData {
  /** Stable immutable element ID (Contract §03-1.1) */
  id: string;
  /** Discriminant type — used by StoreRegistry and userData shadow store */
  type: 'RoomBoundingLine';
  /** Level the line belongs to (must exist in BimManager) */
  levelId: string;
  /** Geometric placement: start/end in XZ plane */
  placement: RoomBoundingLinePlacement;
  /** Semantic properties */
  properties: RoomBoundingLineProperties;
  /** System metadata */
  metadata: RoomBoundingLineMetadata;
}

/** Serialized form for ProjectSnapshot (plain object, safe for JSON.stringify) */
export type SerializedRoomBoundingLine = RoomBoundingLineData;

export type RoomBoundingLineEventType = 'add' | 'update' | 'remove';
export type RoomBoundingLineEventListener = (
  event: RoomBoundingLineEventType,
  line: RoomBoundingLineData,
  prevState?: RoomBoundingLineData,
) => void;
