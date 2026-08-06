
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

// ── Ceiling-Finished-Level (CFL) resolution — §FIX-INTERIOR-FFL-SEATING ──────
//
// The MIRROR of the floor case. A ceiling-hosted element (downlight, pendant
// canopy, HVAC diffuser) must hang from the FINISHED ceiling SOFFIT, not from the
// raw structural slab underside implied by `level.elevation + level.height`.
//
// Geometry invariant (matches `CeilingPanelBuilder`, which is the only writer of
// ceiling world-Y): the panel TOP sits at
//     worldY_top    = level.elevation + boundary.baseOffset + boundary.height
// and its underside — the finished soffit — at
//     worldY_soffit = worldY_top - boundary.thickness
// so the SOFFIT OFFSET above the level datum is
//     baseOffset + height - thickness.
//
// Pure: no I/O, no THREE, no DOM (kept self-contained so CeilingTypes stays leaf-pure).

/** Ray-cast point-in-polygon over a ceiling boundary (XZ plane). Pure. */
function cflPointInPolygon(point: { x: number; z: number }, polygon: readonly CeilingVertex[]): boolean {
  let inside = false;
  const n = polygon.length;
  if (n < 3) return false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const vi = polygon[i]!;
    const vj = polygon[j]!;
    if (
      vi.z > point.z !== vj.z > point.z &&
      point.x < ((vj.x - vi.x) * (point.z - vi.z)) / (vj.z - vi.z) + vi.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * STRICT position-dependent CFL query: the finished-soffit offset (metres above the
 * level datum) of the ceiling that COVERS `point`, or `null` when no visible ceiling
 * covers it (bare structure — the caller falls back to the level's own head height).
 *
 * TIE-BREAK (normative, the mirror of `resolveFflOffsetAt`): when several visible
 * ceilings cover the same point, the LOWEST soffit wins — a fixture hangs from the
 * ceiling plane the room actually sees, and the lowest one is what occludes the rest.
 *
 * Pure: no I/O, no THREE, no DOM.
 */
export function resolveCflOffsetAt(
  ceilings: readonly CeilingData[] | undefined | null,
  point: { x: number; z: number },
): number | null {
  if (!ceilings || ceilings.length === 0) return null;
  let best: number | null = null;
  for (const c of ceilings) {
    if (!c || !c.boundary || c.visible === false) continue;
    if (!cflPointInPolygon(point, c.boundary.polygon)) continue;
    const b = c.boundary;
    const soffit = (b.baseOffset ?? 0) + (b.height ?? 0) - (b.thickness ?? 0);
    if (!Number.isFinite(soffit)) continue;
    if (best === null || soffit < best) best = soffit;
  }
  return best;
}
