
// ── Ceiling layer function ─────────────────────────────────────────────────
export type CeilingLayerFunction =
  | 'structure'
  | 'air-gap'
  | 'insulation'
  | 'substrate'
  | 'finish'
  | 'suspended-grid';

export interface CeilingLayer {
  name: string;
  function: CeilingLayerFunction;
  thickness: number;
  materialId?: string;
  materialColor?: string;
  visible?: boolean;
  lambda?: number;
  rValue?: number;
  acousticAbsorption?: number;
}

// ── Boundary ───────────────────────────────────────────────────────────────
export type CeilingVertex = { x: number; z: number };

export type CeilingDetectionMethod =
  | 'manual-polygon'
  | 'from-room'
  | 'from-slab'
  | 'ai-generated'
  | 'ifc-import';

export interface CeilingBoundary {
  polygon: CeilingVertex[];
  height: number;
  thickness: number;
  baseOffset: number;
  detectionMethod: CeilingDetectionMethod;
}

// ── Hole elements ──────────────────────────────────────────────────────────
export type CeilingHoleSubType =
  | 'light-fixture'
  | 'hvac-diffuser'
  | 'skylight'
  | 'access-hatch'
  | 'structural-beam'
  | 'generic';

export type CeilingHoleShape = 'rectangular' | 'circular' | 'polygon';

export interface CeilingHoleElement {
  id: string;
  subType: CeilingHoleSubType;
  shape: CeilingHoleShape;
  offsetX?: number;
  offsetZ?: number;
  width?: number;
  depth?: number;
  centerX?: number;
  centerZ?: number;
  radius?: number;
  polygon?: CeilingVertex[];
  label?: string;
  elementId: string;
  materialId?: string;
  frameColor?: string;
  depth3d?: number;
}

// ── Finish spec ────────────────────────────────────────────────────────────
export type CeilingPattern =
  | 'none'
  | 'grid-600x600'
  | 'grid-1200x600'
  | 'grid-1200x300'
  | 'strip-planks'
  | 'coffered'
  | 'linear-baffles';

export interface CeilingFinishSpec {
  soffitMaterialId?: string;
  soffitColor?: string;
  soffitPattern?: CeilingPattern;
  exposedStructure: boolean;
  /** Material name absorbed from the linked room's finishes.ceiling.materialName */
  materialName?: string;
}

// ── Slope (Phase 2 reserved) ───────────────────────────────────────────────
export interface CeilingSlope {
  risePerRun: number;
  directionX: number;
  directionZ: number;
  pivotX: number;
  pivotZ: number;
}

// ── Sketch (parametric boundary) ──────────────────────────────────────────
export type CeilingEdgeRef = 'centerLine' | 'interiorFace' | 'exteriorFace';

export interface CeilingFreeLineEdge {
  type: 'freeLine';
  start: { x: number; z: number };
  end: { x: number; z: number };
}

export interface CeilingHostReferenceEdge {
  type: 'hostReference';
  hostId: string;
  hostType: 'wall' | 'slab';
  reference: CeilingEdgeRef;
  offset: number;
  fallback?: { start: { x: number; z: number }; end: { x: number; z: number } };
}

export type CeilingSketchEdge = CeilingFreeLineEdge | CeilingHostReferenceEdge;

export interface CeilingSketchLoop {
  edges: CeilingSketchEdge[];
}

export interface CeilingSketch {
  outerLoop: CeilingSketchLoop;
  innerLoops?: CeilingSketchLoop[];
}

// ── Properties bag ─────────────────────────────────────────────────────────
export interface CeilingProperties {
  mark?: string;
  comments?: string;
  manufacturer?: string;
  productCode?: string;
  installationDate?: string;
  fireRating?: string;
  acousticRating?: string;
  cleanroomClass?: string;
  humidityZone?: 'dry' | 'wet' | 'intermittent';
  thermalTransmittance?: number;
  [key: string]: unknown;
}

// ── IFC data ───────────────────────────────────────────────────────────────
export interface CeilingIfcData {
  guid: string;
  ifcClass: 'IfcCovering';
  predefinedType: 'CEILING';
  objectType?: string;
  description?: string;
  longName?: string;
  psets?: Record<string, Record<string, string | number | boolean>>;
}

// ── Metadata ───────────────────────────────────────────────────────────────
export interface CeilingMetadata {
  createdAt: number;
  modifiedAt: number;
  createdBy: string;
  version: number;
  tags?: string[];
  description?: string;
}

// ── Computed metrics (never stored) ───────────────────────────────────────
export interface CeilingComputedMetrics {
  area: number;
  perimeter: number;
  netArea: number;
  holeArea: number;
  volume: number;
  boundingBox: { minX: number; maxX: number; minZ: number; maxZ: number };
}

// ── Primary record ────────────────────────────────────────────────────────
export interface CeilingData {
  id: string;
  type: 'ceiling';
  levelId: string;
  parentId?: string;

  label: string;
  ceilingNumber: string;
  department?: string;

  boundary: CeilingBoundary;
  sketch?: CeilingSketch;

  systemTypeId?: string;
  layers?: CeilingLayer[];
  finishSpec: CeilingFinishSpec;
  holeElements: CeilingHoleElement[];

  slope?: CeilingSlope;

  coveredRoomIds: string[];
  boundingWallIds: string[];
  hostSlabId?: string;
  /** ID of the room this ceiling is linked to — used to absorb room finish data. */
  hostRoomId?: string;

  colour?: string;
  opacity?: number;
  visible: boolean;

  properties: CeilingProperties;
  ifcData?: CeilingIfcData;
  revitId?: string;

  phase?: 'existing' | 'new' | 'demolished' | 'temporary';
  metadata: CeilingMetadata;
}

// ── Tool mode ─────────────────────────────────────────────────────────────
export type CeilingToolMode = 'NONE' | 'POLYGON' | 'RECTANGLE' | 'AUTO_FROM_ROOM';

export type CeilingToolState = 'IDLE' | 'DRAWING' | 'CONFIRMING';

export interface CeilingCreatorCallbacks {
  onCancel?: () => void;
}

// ── Type category ─────────────────────────────────────────────────────────
export type CeilingTypeCategory =
  | 'plasterboard'
  | 'suspended-act'
  | 'exposed-concrete'
  | 'timber'
  | 'metal'
  | 'specialist'
  | 'custom';

export interface CeilingSystemType {
  id: string;
  name: string;
  description?: string;
  layers: CeilingLayer[];
  totalThickness: number;
  isBuiltIn: boolean;
  category: CeilingTypeCategory;
  tags?: string[];
  ifcTypeName?: string;
  metadata: {
    createdAt: number;
    modifiedAt: number;
    createdBy: string;
    version: number;
  };
}
