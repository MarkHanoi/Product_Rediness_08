import * as THREE from '@pryzm/renderer-three/three';

export type IfcNativeCategory =
  | 'room'
  | 'wall'
  | 'slab'
  | 'floor'
  | 'ceiling'
  | 'column'
  | 'beam'
  | 'door'
  | 'window'
  | 'roof'
  | 'curtainwall'
  | 'railing'
  | 'furniture'
  | 'stair'
  | 'native-proxy'
  | 'unsupported';

export type IfcConversionMode = 'dry-run' | 'convert';

export interface IfcSourceTrace {
  modelId: string;
  modelName?: string;
  expressID: number;
  ifcTypeName?: string;
  rawIfcType?: string;
  globalId?: string;
  storeyName?: string;
  sourceMeshName?: string;
  psets?: Record<string, any>;
}

export interface IfcConversionCandidate {
  sourceId: string;
  category: IfcNativeCategory;
  mesh: THREE.Mesh;
  trace: IfcSourceTrace;
  levelId?: string;
  reason?: string;
}

export interface IfcConversionOptions {
  modelId?: string;
  selectedOnly?: boolean;
  hideSourceMeshes?: boolean;
  mode: IfcConversionMode;
}

export interface IfcConversionIssue {
  severity: 'info' | 'warn' | 'error';
  sourceId?: string;
  message: string;
}

export interface IfcConversionStats {
  scanned: number;
  candidates: number;
  rooms: number;
  walls: number;
  slabs: number;
  floors: number;
  ceilings: number;
  columns: number;
  beams: number;
  doors: number;
  windows: number;
  roofs: number;
  curtainwalls: number;
  railings: number;
  furniture: number;
  stairs: number;
  proxies: number;
  unsupported: number;
  converted: number;
  failed: number;
}

export interface IfcConversionReport {
  id: string;
  modelId?: string;
  mode: IfcConversionMode;
  startedAt: number;
  completedAt: number;
  stats: IfcConversionStats;
  createdElementIds: string[];
  issues: IfcConversionIssue[];
  sourceTraces: Record<string, IfcSourceTrace>;
}

export interface RectangleAnalysis {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  width: number;
  depth: number;
  height: number;
  center: { x: number; y: number; z: number };
  polygonXZ: { x: number; z: number }[];
  polygonXY: { x: number; y: number }[];

  /**
   * PCA-derived orientation fields.
   * Computed from actual mesh vertices in world space — correct for diagonal
   * elements where AABB extents are inflated and unreliable.
   */
  pcaPrimaryAxis?: { x: number; z: number };   // unit vector along element length
  pcaSecondaryAxis?: { x: number; z: number };  // unit vector perpendicular (thickness dir)
  pcaPrimaryExtent?: number;                    // projected element length (metres)
  pcaSecondaryExtent?: number;                  // projected element thickness (metres)
  pcaStart?: { x: number; z: number };          // baseline start point in world XZ
  pcaEnd?: { x: number; z: number };            // baseline end point in world XZ
}
