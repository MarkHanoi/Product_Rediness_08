// buildLayeredOpenings — lifted from
// `src/elements/walls/LayeredWallOpeningBuilder.ts` (290 LOC),
// adapted to plain typed-array output and `Point3D`-backed math.
//
// Two pieces survive verbatim from PRYZM 1:
//   - `clusterOpenings` — group overlapping openings into clusters.
//   - The miter-projected `pushVertex` formula (see `LayeredWallOpeningBuilder
//     .ts:121-144`) — the vertex-grid + miter-projected positions.
//
// What is NEW (vs PRYZM 1):
//   - Returns `RawGeometry` instead of `THREE.BufferGeometry`.
//   - Materials live on the producer (`composeMaterialKey`).
//
// The clustering + grid layout is identical to the PRYZM 1
// reference, so PRYZM-1-byte parity for layered + openings walls is
// possible.

import type { Wall } from '@pryzm/protocol';
import type { Point3D } from '../../types/Point3D.js';
import type { RawGeometry } from './rawGeometry.js';
import type { MiterNormal } from './buildMiterPrism.js';

type Opening = Wall['openings'][number];
type Layer = NonNullable<Wall['layers']>[number];

export interface OpeningCluster {
  minLeft: number;
  maxRight: number;
  openings: Opening[];
}

interface OpeningRect {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

export function clusterOpenings(openings: readonly Opening[]): OpeningCluster[] {
  const sorted = [...openings].sort((a, b) => a.offset - b.offset);
  const clusters: OpeningCluster[] = [];
  for (const op of sorted) {
    const left = op.offset - op.width / 2;
    const right = op.offset + op.width / 2;
    let merged = false;
    for (const cluster of clusters) {
      if (right >= cluster.minLeft - 0.001 && left <= cluster.maxRight + 0.001) {
        cluster.minLeft = Math.min(cluster.minLeft, left);
        cluster.maxRight = Math.max(cluster.maxRight, right);
        cluster.openings.push(op);
        merged = true;
        break;
      }
    }
    if (!merged) clusters.push({ minLeft: left, maxRight: right, openings: [op] });
  }
  return clusters.sort((a, b) => a.minLeft - b.minLeft);
}

function addUniqueBreak(values: number[], value: number): void {
  const rounded = Math.round(value * 1000000) / 1000000;
  if (!values.some((v) => Math.abs(v - rounded) < 0.000001)) values.push(rounded);
}

function normaliseOpeningRects(
  openings: readonly Opening[],
  wallLength: number,
  wallHeight: number,
): OpeningRect[] {
  const rects: OpeningRect[] = [];
  for (const op of openings) {
    const left = Math.max(0, op.offset - op.width / 2);
    const right = Math.min(wallLength, op.offset + op.width / 2);
    const bottom = Math.max(0, op.sillHeight ?? 0);
    const top = Math.min(wallHeight, (op.sillHeight ?? 0) + op.height);
    if (right - left > 0.001 && top - bottom > 0.001) {
      rects.push({ left, right, bottom, top });
    }
  }
  return rects;
}

/**
 * Build a single layer's geometry as a continuous mesh with rectangular
 * openings carved out by skipping cells of the grid.  Returns vertex
 * positions tagged with the layer's outward / inward / top / bottom /
 * cap normals.  Lifted from `buildContinuousLayerGeometry` in PRYZM 1.
 */
export function buildContinuousLayerGeometry(
  rects: readonly OpeningRect[],
  wallLength: number,
  wallHeight: number,
  wallBaseOffset: number,
  baseStart: Point3D,
  directionX: number,
  directionZ: number,
  outwardX: number,
  outwardZ: number,
  layerCenter: number,
  layerThickness: number,
  startMN: MiterNormal | null,
  endMN: MiterNormal | null,
): RawGeometry {
  const xs = [0, wallLength];
  const ys = [0, wallHeight];
  for (const rect of rects) {
    addUniqueBreak(xs, rect.left);
    addUniqueBreak(xs, rect.right);
    addUniqueBreak(ys, rect.bottom);
    addUniqueBreak(ys, rect.top);
  }
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);

  const xCount = xs.length - 1;
  const yCount = ys.length - 1;
  const solid: boolean[][] = [];
  for (let i = 0; i < xCount; i++) {
    solid[i] = [];
    for (let j = 0; j < yCount; j++) {
      const cx = (xs[i]! + xs[i + 1]!) / 2;
      const cy = (ys[j]! + ys[j + 1]!) / 2;
      solid[i]![j] = !rects.some(
        (rect) =>
          cx > rect.left + 0.0001 &&
          cx < rect.right - 0.0001 &&
          cy > rect.bottom + 0.0001 &&
          cy < rect.top - 0.0001,
      );
    }
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const half = layerThickness / 2;
  const back = layerCenter - half;
  const front = layerCenter + half;

  // Pre-compute miter dot products (matches PRYZM 1 line 129-132).
  const startMnDotDir = startMN ? startMN.nx * directionX + startMN.nz * directionZ : 0;
  const startMnDotOut = startMN ? startMN.nx * outwardX + startMN.nz * outwardZ : 0;
  const endMnDotDir = endMN ? endMN.nx * directionX + endMN.nz * directionZ : 0;
  const endMnDotOut = endMN ? endMN.nx * outwardX + endMN.nz * outwardZ : 0;

  /**
   * Resolve a grid-cell vertex `(x, y, z)` into world XYZ.
   * `x` is along-wall distance, `z` is lateral offset from baseline,
   * `y` is height above wall base.
   */
  const resolve = (x: number, y: number, z: number): [number, number, number] => {
    let effectiveX = x;
    if (startMN && x < 1e-5 && Math.abs(startMnDotDir) > 1e-4) {
      effectiveX = -(startMnDotOut * z) / startMnDotDir;
    } else if (endMN && Math.abs(x - wallLength) < 1e-5 && Math.abs(endMnDotDir) > 1e-4) {
      effectiveX = wallLength - (endMnDotOut * z) / endMnDotDir;
    }
    const wx = baseStart.x + directionX * effectiveX + outwardX * z;
    const wy = baseStart.y + wallBaseOffset + y;
    const wz = baseStart.z + directionZ * effectiveX + outwardZ * z;
    return [wx, wy, wz];
  };

  const isSolid = (i: number, j: number): boolean =>
    i >= 0 && i < xCount && j >= 0 && j < yCount && solid[i]![j]!;

  function pushQuad(
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
    nx: number, ny: number, nz: number,
  ): void {
    const A = resolve(a[0], a[1], a[2]);
    const B = resolve(b[0], b[1], b[2]);
    const C = resolve(c[0], c[1], c[2]);
    const D = resolve(d[0], d[1], d[2]);
    // Two CCW tris matching PRYZM 1 winding.
    positions.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]);
    positions.push(A[0], A[1], A[2], C[0], C[1], C[2], D[0], D[1], D[2]);
    for (let k = 0; k < 6; k++) normals.push(nx, ny, nz);
  }

  for (let i = 0; i < xCount; i++) {
    for (let j = 0; j < yCount; j++) {
      if (!solid[i]![j]) continue;
      const x0 = xs[i]!;
      const x1 = xs[i + 1]!;
      const y0 = ys[j]!;
      const y1 = ys[j + 1]!;

      // Front (+z) face.
      pushQuad([x0, y0, front], [x1, y0, front], [x1, y1, front], [x0, y1, front],
        outwardX, 0, outwardZ);
      // Back (−z) face.
      pushQuad([x1, y0, back], [x0, y0, back], [x0, y1, back], [x1, y1, back],
        -outwardX, 0, -outwardZ);

      // Left edge — only if the neighbouring cell is hollow.
      if (!isSolid(i - 1, j)) {
        pushQuad([x0, y0, back], [x0, y0, front], [x0, y1, front], [x0, y1, back],
          -directionX, 0, -directionZ);
      }
      if (!isSolid(i + 1, j)) {
        pushQuad([x1, y0, front], [x1, y0, back], [x1, y1, back], [x1, y1, front],
          directionX, 0, directionZ);
      }
      if (!isSolid(i, j - 1)) {
        pushQuad([x1, y0, front], [x0, y0, front], [x0, y0, back], [x1, y0, back],
          0, -1, 0);
      }
      if (!isSolid(i, j + 1)) {
        pushQuad([x0, y1, back], [x0, y1, front], [x1, y1, front], [x1, y1, back],
          0, 1, 0);
      }
    }
  }

  return { positions, normals };
}

export function buildLayeredOpeningsLayers(
  wall: Wall,
  baseStart: Point3D,
  directionX: number,
  directionZ: number,
  outwardX: number,
  outwardZ: number,
  wallLength: number,
  startMN: MiterNormal | null,
  endMN: MiterNormal | null,
): { layer: Layer; layerCenter: number; geometry: RawGeometry }[] {
  const layers = wall.layers ?? [];
  const totalThickness = layers.reduce((sum, l) => sum + l.thickness, 0);
  const rects = normaliseOpeningRects(wall.openings, wallLength, wall.height);
  let cursor = -totalThickness / 2;
  const out: { layer: Layer; layerCenter: number; geometry: RawGeometry }[] = [];
  for (const layer of layers) {
    const center = cursor + layer.thickness / 2;
    cursor += layer.thickness;
    const geom = buildContinuousLayerGeometry(
      rects,
      wallLength,
      wall.height,
      wall.baseOffset,
      baseStart,
      directionX,
      directionZ,
      outwardX,
      outwardZ,
      center,
      layer.thickness,
      startMN,
      endMN,
    );
    out.push({ layer, layerCenter: center, geometry: geom });
  }
  return out;
}
