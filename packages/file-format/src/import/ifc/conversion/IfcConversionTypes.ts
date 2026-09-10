import * as THREE from '@pryzm/renderer-three/three';

/**
 * Every category the classifier can yield, in CONVERSION ORDER.
 *
 * L-13298 — the type is DERIVED from this list, and the coordinator iterates THIS list. A
 * category therefore cannot be added to the type without appearing here, and cannot appear
 * here without being visited. Before this constant existed the type had 16 members, the
 * coordinator's `switch` had 15 cases, and its loop iterated FIVE: eleven categories sat in
 * the type and the switch for the life of the repository and were never reached — and,
 * because they never touched `converted`, `failed` or `issues`, the report read
 * "100% converted, 0 failed" over a denominator that excluded everything it dropped.
 *
 * Order is dependency order: rooms → walls → curtain walls (both host openings) → doors and
 * windows (need a converted host) → horizontal elements → verticals → roofs → stairs →
 * railings → furniture → the two non-element buckets last.
 */
export const IFC_NATIVE_CATEGORIES = [
  'room',
  'wall',
  'curtainwall',
  'door',
  'window',
  'slab',
  'floor',
  'ceiling',
  'column',
  'beam',
  'roof',
  'stair',
  'railing',
  'furniture',
  'native-proxy',
  'unsupported',
] as const;

export type IfcNativeCategory = (typeof IFC_NATIVE_CATEGORIES)[number];

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

/**
 * Every scanned element takes EXACTLY ONE of three exits, and the coordinator holds
 * `scanned === converted + unsupported + failed` as an invariant (§CONTEXT-DATA-HONESTY,
 * L-581/L-616: a DROP and an ABSENCE must never share a value). The per-category counters
 * (`walls`, `slabs`, …) count elements ROUTED to that converter, whether or not the
 * conversion then succeeded.
 */
export interface IfcConversionStats {
  scanned: number;
  /** Elements routed to an element converter (= scanned − unsupported). */
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
  /** Reference-proxy records registered. A proxy is NOT an element and is never counted as converted. */
  proxies: number;
  /** Elements no converter produces a PRYZM element for. Counted, and named in `unsupportedByIfcType`. */
  unsupported: number;
  converted: number;
  failed: number;
  /**
   * L-13298 — the unsupported elements BY NAME, keyed by the IFC type the user recognises
   * (`IFCPLATE → 12`). This is the number the summary must print alongside `converted` and
   * `failed`; "100% converted" over a denominator that silently excluded these is the defect.
   */
  unsupportedByIfcType: Record<string, number>;
  /** The same elements keyed by the classifier category they landed in. */
  unsupportedByCategory: Partial<Record<IfcNativeCategory, number>>;
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
