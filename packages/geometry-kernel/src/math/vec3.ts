// Greenfield vec3 helpers — gl-matrix-style, plain `[number, number,
// number]` tuples, no THREE.  Matches the API the wall producer needs
// after lifting `MiterPrismBuilder.ts` and friends from PRYZM 1 (see
// S08-T1 in `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md`).

import type { Point3D } from '../types/Point3D.js';

export type Vec3 = [number, number, number];

export function create(): Vec3 {
  return [0, 0, 0];
}

export function fromPoint(p: Point3D): Vec3 {
  return [p.x, p.y, p.z];
}

export function toPoint(v: Vec3): Point3D {
  return { x: v[0], y: v[1], z: v[2] };
}

export function set(out: Vec3, x: number, y: number, z: number): Vec3 {
  out[0] = x; out[1] = y; out[2] = z;
  return out;
}

export function copy(out: Vec3, a: Vec3): Vec3 {
  out[0] = a[0]; out[1] = a[1]; out[2] = a[2];
  return out;
}

export function add(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out[0] = a[0] + b[0]; out[1] = a[1] + b[1]; out[2] = a[2] + b[2];
  return out;
}

export function sub(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out[0] = a[0] - b[0]; out[1] = a[1] - b[1]; out[2] = a[2] - b[2];
  return out;
}

export function scale(out: Vec3, a: Vec3, k: number): Vec3 {
  out[0] = a[0] * k; out[1] = a[1] * k; out[2] = a[2] * k;
  return out;
}

export function scaleAndAdd(out: Vec3, a: Vec3, b: Vec3, k: number): Vec3 {
  out[0] = a[0] + b[0] * k;
  out[1] = a[1] + b[1] * k;
  out[2] = a[2] + b[2] * k;
  return out;
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  const ax = a[0], ay = a[1], az = a[2];
  const bx = b[0], by = b[1], bz = b[2];
  out[0] = ay * bz - az * by;
  out[1] = az * bx - ax * bz;
  out[2] = ax * by - ay * bx;
  return out;
}

export function lengthSq(a: Vec3): number {
  return a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
}

export function length(a: Vec3): number {
  return Math.sqrt(lengthSq(a));
}

export function distance(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function normalize(out: Vec3, a: Vec3): Vec3 {
  const lenSq = lengthSq(a);
  if (lenSq === 0) {
    out[0] = 0; out[1] = 0; out[2] = 0;
    return out;
  }
  const inv = 1 / Math.sqrt(lenSq);
  out[0] = a[0] * inv; out[1] = a[1] * inv; out[2] = a[2] * inv;
  return out;
}

/**
 * Convert a forward-direction-perpendicular outward normal in the XZ
 * plane.  Convention matches PRYZM 1's `MiterPrismBuilder.ts:44`:
 * `outward = (-dir.z, 0, dir.x)`.
 */
export function outwardXZ(out: Vec3, dir: Vec3): Vec3 {
  out[0] = -dir[2]; out[1] = 0; out[2] = dir[0];
  return out;
}
