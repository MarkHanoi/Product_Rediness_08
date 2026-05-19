/**
 * FloorTypes.ts — Semantic data model for the Floor Finish subsystem.
 *
 * Contract: docs/01_ELEMENTS/08_Floors_Contract/01-FLOOR-DATA-MODEL-CONTRACT.md
 *
 * IFC mapping: IfcCovering { PredefinedType = FLOORING }
 * Structural slabs remain as IfcSlab — this file covers applied finish elements only.
 *
 * GEOMETRY INVARIANTS:
 * - Top face is at FFL = level.elevation + boundary.baseOffset
 * - Body extends DOWNWARD by boundary.thickness (inverse of ceilings)
 * - Top face normals point UP (0, +1, 0)
 * - Polygon vertices are CCW when viewed from above (Y+)
 */

import { CoreElement } from '../CoreElement';

// ── Layer function ─────────────────────────────────────────────────────────

export type FloorLayerFunction =
  | 'finish'              // Topmost visible face (tiles, carpet, hardwood, resin, epoxy)
  | 'adhesive'            // Thin-bed mortar, tile adhesive, glue
  | 'screed'              // Sand-cement, calcium sulphate, or polymer-modified screed
  | 'underfloor-heating'  // UFH pipe matrix or electric mat layer
  | 'insulation'          // Thermal or acoustic insulation (PIR, mineral wool, XPS)
  | 'tanking'             // Waterproof membrane — required in wet zones
  | 'substrate';          // Existing substrate or structural interface layer

export interface FloorLayer {
  name: string;
  function: FloorLayerFunction;
  thickness: number;           // Metres. Must be > 0.
  materialId?: string;
  materialColor?: string;      // Hex fallback
  visible?: boolean;
  lambda?: number;             // Thermal conductivity (W/m·K)
  rValue?: number;             // Thermal resistance (m²·K/W)
  wetAreaCompliant?: boolean;
  acousticImpactRating?: number; // Impact sound insulation Lw (dB)
  roughness?: number;          // PBR roughness override (0 = mirror, 1 = fully diffuse)
  metalness?: number;          // PBR metalness override (0–1)
}

// ── Zone type ─────────────────────────────────────────────────────────────

export type FloorZoneType =
  | 'dry'
  | 'wet'
  | 'raised'
  | 'external'
  | 'cleanroom'
  | 'food-safe';

// ── Boundary ───────────────────────────────────────────────────────────────

export type FloorVertex = { x: number; z: number };

export type FloorDetectionMethod =
  | 'manual-polygon'
  | 'from-room'
  | 'from-slab'
  | 'ai-generated'
  | 'ifc-import';

export interface FloorBoundary {
  polygon: FloorVertex[];      // CCW when viewed from above. Min 3 vertices.
  baseOffset: number;          // Y offset from level datum (metres). >= 0.
                               // FFL world Y = level.elevation + baseOffset
  thickness: number;           // Total assembly thickness (metres). > 0.
                               // Y range: [FFL - thickness, FFL]
  detectionMethod: FloorDetectionMethod;
}

// ── Finish spec ────────────────────────────────────────────────────────────

export type FloorPattern =
  | 'none'
  | 'tile-300x300'
  | 'tile-600x600'
  | 'tile-600x300'
  | 'tile-herringbone'
  | 'plank-90'
  | 'plank-45'
  | 'plank-herringbone'
  | 'terrazzo'
  | 'seamless';

export interface FloorFinishSpec {
  finishMaterialId?: string;
  finishColor?: string;       // Default: '#D4C4A8'
  finishPattern?: FloorPattern;
  jointWidth?: number;        // Grout joint width in metres. Default: 0.003
  jointColor?: string;        // Default: '#B0A898'
  exposedScreed: boolean;
  coveSkirting?: boolean;
  /** Material name absorbed from the linked room's finishes.floor.materialName */
  materialName?: string;
}

// ── Slope / Fall-to-drain (Phase 2) ───────────────────────────────────────

export interface FloorSlope {
  fallRatio: number;          // Rise per run. e.g. 0.0125 = 1:80. >= 0.
  directionX: number;         // Unit vector X — downslope direction in XZ plane.
  directionZ: number;         // Unit vector Z — must form unit vector with directionX.
  pivotX: number;             // World X of high point (zero-fall reference).
  pivotZ: number;             // World Z of high point.
  secondaryFallRatio?: number;
  secondaryDirectionX?: number;
  secondaryDirectionZ?: number;
}

// ── Service holes (Phase 2) ────────────────────────────────────────────────

export type FloorHoleSubType =
  | 'floor-drain'
  | 'floor-box'
  | 'column-sleeve'
  | 'sump-pit'
  | 'floor-hatch'
  | 'pipe-sleeve'
  | 'generic';

export type FloorHoleShape = 'rectangular' | 'circular' | 'polygon';

export interface FloorServiceHole {
  id: string;
  subType: FloorHoleSubType;
  shape: FloorHoleShape;
  offsetX?: number;
  offsetZ?: number;
  width?: number;
  depth?: number;
  centerX?: number;
  centerZ?: number;
  radius?: number;
  polygon?: FloorVertex[];
  label?: string;
  elementId: string;          // REQUIRED — UUID for hosted sub-element
  frameColor?: string;
  depth3d?: number;           // Visual reveal depth. Default: 0.02 m.
  gratingMaterialId?: string;
}

// ── Underfloor heating ─────────────────────────────────────────────────────

export interface FloorUnderfloorHeating {
  type: 'water' | 'electric';
  pipePitch?: number;         // Pipe centres (m). Typical: 0.15–0.20
  outputWatts?: number;       // Power output (W/m²)
  thermostatZoneId?: string;
  systemMaterialId?: string;
}

// ── IFC data ───────────────────────────────────────────────────────────────

export interface FloorIfcData {
  guid: string;
  ifcClass: 'IfcCovering';
  predefinedType: 'FLOORING';
  objectType?: string;
  description?: string;
  longName?: string;
  psets?: Record<string, Record<string, string | number | boolean>>;
}

// ── Properties (extensible scheduling) ────────────────────────────────────

export interface FloorProperties {
  mark?: string;
  comments?: string;
  manufacturer?: string;
  productCode?: string;
  installationDate?: string;
  slip_resistance?: string;   // e.g. 'R10', 'R11', 'R12'
  pendulumValue?: number;
  fireClassification?: string;
  chemicalResistance?: string;
  thermalTransmittance?: number;
  warrantyYears?: number;
  [key: string]: unknown;
}

// ── Metadata / Audit trail ────────────────────────────────────────────────

export interface FloorMetadata {
  createdAt: number;      // Unix ms — immutable after creation
  modifiedAt: number;     // Unix ms — updated on every write
  createdBy: string;      // userId | 'system' | 'ai-assistant' | 'ifc-import'
  version: number;        // Monotonically increasing from 1
  tags?: string[];
  description?: string;
}

// ── Sketch (parametric edges — Phase 2) ───────────────────────────────────

export type FloorEdgeRef = 'centerLine' | 'interiorFace' | 'exteriorFace';

export interface FloorFreeLineEdge {
  type: 'freeLine';
  start: { x: number; z: number };
  end: { x: number; z: number };
}

export interface FloorHostReferenceEdge {
  type: 'hostReference';
  hostId: string;
  hostType: 'wall' | 'slab';
  reference: FloorEdgeRef;
  offset: number;
  fallback?: { start: { x: number; z: number }; end: { x: number; z: number } };
}

export type FloorSketchEdge = FloorFreeLineEdge | FloorHostReferenceEdge;

export interface FloorSketchLoop {
  edges: FloorSketchEdge[];
}

export interface FloorSketch {
  outerLoop: FloorSketchLoop;
  innerLoops?: FloorSketchLoop[];
}

// ── Tool state ─────────────────────────────────────────────────────────────

export type FloorToolState = 'IDLE' | 'DRAWING';

// ── System type ────────────────────────────────────────────────────────────

export type FloorTypeCategory =
  | 'tile-stone'
  | 'timber'
  | 'carpet'
  | 'vinyl-resilient'
  | 'resin-concrete'
  | 'screed'
  | 'raised-access'
  | 'specialist'
  | 'custom';

export interface FloorSystemType {
  id: string;
  name: string;
  description?: string;
  layers: FloorLayer[];
  totalThickness: number;
  isBuiltIn: boolean;
  category: FloorTypeCategory;
  zoneTypes: FloorZoneType[];
  tags?: string[];
  ifcTypeName?: string;
  metadata: {
    createdAt: number;
    modifiedAt: number;
    createdBy: string;
    version: number;
  };
}

// ── Primary record ─────────────────────────────────────────────────────────

/**
 * FloorData — the authoritative floor finish record.
 *
 * SLAB BINDING RULE (THE KEY CONSTRAINT):
 * When hostSlabId is set, the floor's top face is bound to the slab's top face.
 * FloorSlabBindingHandler watches 'bim-slab-updated' events and updates bound floors.
 *
 * GEOMETRY RULE:
 * - Top face at FFL = level.elevation + boundary.baseOffset
 * - Body extends DOWNWARD by boundary.thickness
 * - Top face normals point UP (0, +1, 0)
 */
export interface FloorData extends CoreElement {
  id: string;
  type: 'floor';
  levelId: string;
  parentId?: string;

  label: string;
  floorNumber: string;
  department?: string;
  zoneType?: FloorZoneType;

  boundary: FloorBoundary;
  sketch?: FloorSketch;

  systemTypeId?: string;
  layers?: FloorLayer[];

  finishSpec: FloorFinishSpec;
  slope?: FloorSlope;
  serviceHoles: FloorServiceHole[];
  underfloorHeating?: FloorUnderfloorHeating;

  coveredRoomIds: string[];
  boundingWallIds: string[];
  /** ID of the room this floor is linked to — used to absorb room finish data. */
  hostRoomId?: string;

  /**
   * SLAB BINDING — the structural slab directly below this floor finish.
   * When set, FloorSlabBindingHandler keeps floor.boundary.baseOffset
   * synchronised with the slab's top-face position (slab.baseOffset).
   * If the slab is deleted, hostSlabId is set to null and the floor stays in place.
   */
  hostSlabId?: string;

  colour?: string;
  opacity?: number;
  visible: boolean;

  properties: FloorProperties;
  ifcData?: FloorIfcData;
  revitId?: string;

  phase?: 'existing' | 'new' | 'demolished' | 'temporary';
  metadata: FloorMetadata;
}

// ── Callbacks interface (for FloorTool) ────────────────────────────────────

export interface FloorToolCallbacks {
  floorStore?: import('./FloorStore').FloorStore;
  applyHighlight: (obj: import('three').Object3D) => void;
  updateInspector: (obj: import('three').Object3D) => void;
  zoomToAll: () => Promise<void>;
  getCurrentVisualStyle: () => number;
  onFloorCreated?: (floor: FloorData) => void;
  onCancel?: () => void;
  bimManager?: any;
  commandManager?: any;
  elementRegistry?: any;
}
