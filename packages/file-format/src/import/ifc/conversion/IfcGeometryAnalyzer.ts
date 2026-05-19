import * as THREE from '@pryzm/renderer-three/three';
import { RectangleAnalysis } from './IfcConversionTypes';

/**
 * Maximum number of vertices sampled for PCA.  Keeps cost O(1) on large meshes
 * while providing enough statistical coverage for typical IFC geometry.
 */
const PCA_MAX_SAMPLES = 512;

export class IfcGeometryAnalyzer {
  analyse(mesh: THREE.Mesh): RectangleAnalysis | null {
    const box = new THREE.Box3().setFromObject(mesh);
    if (!Number.isFinite(box.min.x) || box.isEmpty()) return null;

    const width  = Math.max(0.01, box.max.x - box.min.x);
    const depth  = Math.max(0.01, box.max.z - box.min.z);
    const height = Math.max(0.01, box.max.y - box.min.y);
    const center = box.getCenter(new THREE.Vector3());

    const pca = this.computePcaXZ(mesh, center);

    return {
      minX: box.min.x,
      maxX: box.max.x,
      minY: box.min.y,
      maxY: box.max.y,
      minZ: box.min.z,
      maxZ: box.max.z,
      width,
      depth,
      height,
      center: { x: center.x, y: center.y, z: center.z },
      polygonXZ: [
        { x: box.min.x, z: box.min.z },
        { x: box.max.x, z: box.min.z },
        { x: box.max.x, z: box.max.z },
        { x: box.min.x, z: box.max.z },
      ],
      polygonXY: [
        { x: box.min.x, y: box.min.z },
        { x: box.max.x, y: box.min.z },
        { x: box.max.x, y: box.max.z },
        { x: box.min.x, y: box.max.z },
      ],
      ...pca,
    };
  }

  /**
   * Compute the wall/beam baseline using PCA-derived orientation when available,
   * falling back to AABB heuristics for simple axis-aligned elements.
   *
   * PCA gives the true primary axis of the element (its length direction) and the
   * perpendicular secondary axis (its thickness direction) directly from the mesh
   * vertex cloud.  This is correct for diagonal walls where AABB extents are
   * inflated and completely wrong.
   *
   * Pset thickness (from Qto_WallBaseQuantities.Width etc.) is always preferred
   * over the geometry-derived secondary extent, because the IFC-authored value is
   * the authoritative design thickness and excludes any finish layers that geometry
   * might include.
   */
  wallBaseline(
    a: RectangleAnalysis,
    psets?: Record<string, any>,
  ): { start: { x: number; z: number }; end: { x: number; z: number }; thickness: number } {
    const psetThickness = psets ? this.readWallThicknessFromPsets(psets) : undefined;

    if (
      a.pcaStart &&
      a.pcaEnd &&
      a.pcaSecondaryExtent !== undefined &&
      a.pcaPrimaryExtent !== undefined &&
      a.pcaPrimaryExtent > 0.01
    ) {
      const geomThickness = Math.min(1.5, Math.max(0.05, a.pcaSecondaryExtent));
      const thickness = psetThickness ?? geomThickness;
      return {
        start: a.pcaStart,
        end: a.pcaEnd,
        thickness,
      };
    }

    // AABB fallback for elements where PCA could not be computed
    if (a.width >= a.depth) {
      const geomThickness = Math.min(1.5, Math.max(0.05, a.depth));
      const thickness = psetThickness ?? geomThickness;
      return {
        start: { x: a.minX, z: a.center.z },
        end:   { x: a.maxX, z: a.center.z },
        thickness,
      };
    }

    const geomThickness = Math.min(1.5, Math.max(0.05, a.width));
    const thickness = psetThickness ?? geomThickness;
    return {
      start: { x: a.center.x, z: a.minZ },
      end:   { x: a.center.x, z: a.maxZ },
      thickness,
    };
  }

  /**
   * Read the true wall thickness from IFC property sets.
   * Revit exports this under several possible key names depending on the IFC
   * version and export settings.
   */
  readWallThicknessFromPsets(psets: Record<string, any>): number | undefined {
    const candidates = [
      psets['Qto_WallBaseQuantities']?.['Width'],
      psets['Qto_WallBaseQuantities']?.['Thickness'],
      psets['Pset_WallCommon']?.['Thickness'],
      psets['Pset_WallCommon']?.['Width'],
      psets['BaseQuantities']?.['Width'],
    ];

    for (const raw of candidates) {
      const v = Number(raw ?? 0);
      if (v > 0.01 && v < 3.0) return v;
    }
    return undefined;
  }

  areaXZ(poly: { x: number; z: number }[]): number {
    let total = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      total += a.x * b.z - b.x * a.z;
    }
    return Math.abs(total) / 2;
  }

  perimeterXZ(poly: { x: number; z: number }[]): number {
    let total = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      total += Math.hypot(a.x - b.x, a.z - b.z);
    }
    return total;
  }

  /**
   * Compute PCA of mesh vertices projected onto the XZ horizontal plane.
   *
   * Returns the primary axis (element length direction), secondary axis
   * (perpendicular / thickness direction), their extents, and the derived
   * start/end baseline points — all in world space.
   *
   * Vertices are sampled at a fixed stride so the cost is bounded at
   * O(PCA_MAX_SAMPLES) regardless of mesh complexity.
   */
  private computePcaXZ(
    mesh: THREE.Mesh,
    _worldCenter: THREE.Vector3,
  ): Partial<RectangleAnalysis> {
    const geo = mesh.geometry as THREE.BufferGeometry | undefined;
    if (!geo) return {};

    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!posAttr || posAttr.count < 3) return {};

    const count = posAttr.count;
    const mat = mesh.matrixWorld;
    const step = Math.max(1, Math.floor(count / PCA_MAX_SAMPLES));
    const tmp = new THREE.Vector3();

    // --- Pass 1: centroid in XZ ---
    let sumX = 0, sumZ = 0, n = 0;
    for (let i = 0; i < count; i += step) {
      tmp.fromBufferAttribute(posAttr, i).applyMatrix4(mat);
      sumX += tmp.x;
      sumZ += tmp.z;
      n++;
    }
    if (n < 2) return {};

    const cx = sumX / n;
    const cz = sumZ / n;

    // --- Pass 2: covariance matrix in XZ ---
    let covXX = 0, covXZ = 0, covZZ = 0;
    for (let i = 0; i < count; i += step) {
      tmp.fromBufferAttribute(posAttr, i).applyMatrix4(mat);
      const dx = tmp.x - cx;
      const dz = tmp.z - cz;
      covXX += dx * dx;
      covXZ += dx * dz;
      covZZ += dz * dz;
    }
    covXX /= n;
    covXZ /= n;
    covZZ /= n;

    // --- Eigendecomposition of 2×2 symmetric matrix ---
    // λ = (trace/2) ± sqrt((trace/2)² - det)
    const halfTrace = (covXX + covZZ) / 2;
    const det = covXX * covZZ - covXZ * covXZ;
    const disc = Math.sqrt(Math.max(0, halfTrace * halfTrace - det));
    const lam1 = halfTrace + disc; // larger eigenvalue → primary axis

    // Primary eigenvector
    let px: number, pz: number;
    if (Math.abs(covXZ) > 1e-10) {
      // General case: eigenvector = [covXZ, lam1 - covXX] (unnormalised)
      px = covXZ;
      pz = lam1 - covXX;
    } else {
      // Covariance is already diagonal — principal axes are world X and Z
      px = covXX >= covZZ ? 1 : 0;
      pz = covXX >= covZZ ? 0 : 1;
    }

    const pLen = Math.hypot(px, pz);
    if (pLen < 1e-9) return {};
    px /= pLen;
    pz /= pLen;

    // Secondary axis is orthogonal to primary in XZ
    const sx = -pz;
    const sz = px;

    // --- Pass 3: project vertices onto primary and secondary axes ---
    let pMin = Infinity, pMax = -Infinity;
    let sMin = Infinity, sMax = -Infinity;

    for (let i = 0; i < count; i += step) {
      tmp.fromBufferAttribute(posAttr, i).applyMatrix4(mat);
      const dx = tmp.x - cx;
      const dz = tmp.z - cz;
      const projP = dx * px + dz * pz;
      const projS = dx * sx + dz * sz;
      if (projP < pMin) pMin = projP;
      if (projP > pMax) pMax = projP;
      if (projS < sMin) sMin = projS;
      if (projS > sMax) sMax = projS;
    }

    const primaryExtent   = pMax - pMin;
    const secondaryExtent = sMax - sMin;

    return {
      pcaPrimaryAxis:    { x: px, z: pz },
      pcaSecondaryAxis:  { x: sx, z: sz },
      pcaPrimaryExtent:  primaryExtent,
      pcaSecondaryExtent: secondaryExtent,
      pcaStart: { x: cx + pMin * px, z: cz + pMin * pz },
      pcaEnd:   { x: cx + pMax * px, z: cz + pMax * pz },
    };
  }
}
