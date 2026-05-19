import * as THREE from '@pryzm/renderer-three/three';

/**
 * WallJoinAuditUtils
 * 
 * Pure utility module for robust wall join analysis.
 * Used by WallJoinResolver to communicate adjustment results with full metadata.
 * 
 * Contract compliance:
 * - No semantic mutation
 * - No store writes
 * - Pure computation only
 * - Deterministic output
 */

/**
 * Describes how a single wall's baseline should be adjusted after miter resolution.
 * Miter normals (if present) guide the fragment builder's projection logic for end caps.
 *
 * §STEP4: field names aligned with WallJoinResolver.JoinData
 * (startMiterNormal → startMN, endMiterNormal → endMN).
 */
export interface JoinAdjustment {
  /** Adjusted baseline endpoints */
  baseLine: [THREE.Vector3, THREE.Vector3];
  
  /** Miter plane normal at start endpoint (unit vector in XZ).
   *  - If null: perpendicular (free) end cap
   *  - If present: miter-projected end cap
   */
  startMN?: { nx: number; nz: number } | null;
  
  /** Miter plane normal at end endpoint (unit vector in XZ) */
  endMN?: { nx: number; nz: number } | null;
}

/**
 * Result of join resolution for a single wall.
 * Maps 1:1 to a WallData element.
 */
export interface JoinResult {
  wallId: string;
  adjustment: JoinAdjustment;
}

/**
 * Validates endpoint convergence after join resolution.
 * Returns true if two points are within tolerance (merge is acceptable).
 * 
 * Tolerance = 0.001m (1mm) — sufficient for numerical drift,
 * strict enough to catch failed joins.
 */
export function validateEndpointConvergence(
  point1: THREE.Vector3,
  point2: THREE.Vector3,
  tolerance: number = 0.001
): boolean {
  const dx = point1.x - point2.x;
  const dz = point1.z - point2.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  return dist <= tolerance;
}

/**
 * Computes the bisector direction for two wall directions.
 * Used for non-perpendicular join angles (45°, 120°, etc.).
 * 
 * @param dir1 Normalized direction of first wall (away from join point)
 * @param dir2 Normalized direction of second wall (away from join point)
 * @returns Normalized bisector direction in XZ, or null if dirs are parallel
 */
export function computeBisector(dir1: THREE.Vector3, dir2: THREE.Vector3): THREE.Vector3 | null {
  const sum = new THREE.Vector3(dir1.x + dir2.x, 0, dir1.z + dir2.z);
  if (sum.length() < 0.0001) return null; // Parallel or opposite
  return sum.normalize();
}

/**
 * Computes a miter plane normal for a given join configuration.
 * For perpendicular joins: uses one wall's inward tangent.
 * For other angles: uses the bisector of inward tangents.
 * 
 * @param wallDir Normalized wall direction (along baseline)
 * @param angle Angle between two walls (in radians)
 * @param preferBisector If true, always use bisector (for non-90° joins)
 * @returns Unit vector in XZ representing miter plane normal, or null if undefined
 */
export function computeMiterNormal(
  wallDir: THREE.Vector3,
  tangentA: THREE.Vector3,
  tangentB: THREE.Vector3,
  angle: number,
  preferBisector: boolean = false
): THREE.Vector3 | null {
  // For perpendicular: simple perpendicular to wall direction
  if (Math.abs(angle - Math.PI / 2) < 0.05 && !preferBisector) {
    const perp = new THREE.Vector3(-wallDir.z, 0, wallDir.x);
    return perp.length() > 0.0001 ? perp.normalize() : null;
  }

  // For non-perpendicular or explicit bisector: use bisector of inward tangents
  const bisector = computeBisector(tangentA, tangentB);
  return bisector;
}

/**
 * Diagnostic helper: checks if a join is robust (both walls converge cleanly).
 * Used for debug logging only.
 * 
 * @returns object with 'isRobust', 'maxDrift', 'details' fields
 */
export function diagnoseJoinRobustness(
  point1: THREE.Vector3,
  point2: THREE.Vector3,
  tolerance: number = 0.001
): {
  isRobust: boolean;
  maxDrift: number;
  reason: string;
} {
  const dx = point1.x - point2.x;
  const dz = point1.z - point2.z;
  const drift = Math.sqrt(dx * dx + dz * dz);

  return {
    isRobust: drift <= tolerance,
    maxDrift: drift,
    reason: drift <= tolerance
      ? 'Converged within tolerance'
      : `Drift ${(drift * 1000).toFixed(1)}mm exceeds ${(tolerance * 1000).toFixed(1)}mm tolerance`
  };
}
