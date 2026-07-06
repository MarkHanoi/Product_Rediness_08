// @pryzm/auto-dimension — pure 2-D geometry primitives.
//
// These are faithful PURE ports of the cited pure `{x,z}` helpers in
// `packages/geometry-wall/src/JunctionResolverV2.ts` (`sub`/`add`/`scale`/`dot`/
// `unit`/`leftPerp` :267-274, `intersectLines` :277, `projectOnSeg` :286). They
// are re-implemented here rather than imported because `@pryzm/geometry-wall`
// transitively pulls `@pryzm/renderer-three` + `@thatopen/components` (THREE) at
// its barrel — importing it would taint this L2 package and break P2 (single
// THREE owner). Same maths, same tolerances; zero external dependencies.

/** Plan-view point in metres (world XZ, y dropped — the engine convention). */
export interface PtXZ {
  readonly x: number;
  readonly z: number;
}

export const PARALLEL_DET = 1e-9;

export function sub(a: PtXZ, b: PtXZ): PtXZ {
  return { x: a.x - b.x, z: a.z - b.z };
}
export function add(a: PtXZ, b: PtXZ): PtXZ {
  return { x: a.x + b.x, z: a.z + b.z };
}
export function scale(a: PtXZ, k: number): PtXZ {
  return { x: a.x * k, z: a.z * k };
}
export function dot(a: PtXZ, b: PtXZ): number {
  return a.x * b.x + a.z * b.z;
}
export function lenSq(a: PtXZ): number {
  return a.x * a.x + a.z * a.z;
}
export function len(a: PtXZ): number {
  return Math.hypot(a.x, a.z);
}
export function unit(a: PtXZ): PtXZ {
  const L = len(a) || 1;
  return { x: a.x / L, z: a.z / L };
}
/** CCW 90° perpendicular of a direction — the offset-line / witness normal. */
export function leftPerp(d: PtXZ): PtXZ {
  return { x: -d.z, z: d.x };
}

/** 2-D line-line intersection `p1 + t*d1 = p2 + s*d2`; null when parallel. */
export function intersectLines(p1: PtXZ, d1: PtXZ, p2: PtXZ, d2: PtXZ): PtXZ | null {
  const det = d1.x * d2.z - d1.z * d2.x;
  if (Math.abs(det) < PARALLEL_DET) return null;
  const w = sub(p2, p1);
  const t = (w.x * d2.z - w.z * d2.x) / det;
  return { x: p1.x + t * d1.x, z: p1.z + t * d1.z };
}

/** Closest-point parameter `t∈[0,1]` of `p` projected onto segment a→b. */
export function projectOnSeg(
  p: PtXZ,
  a: PtXZ,
  b: PtXZ,
): { t: number; foot: PtXZ; perpDist: number } {
  const ab = sub(b, a);
  const L2 = lenSq(ab);
  if (L2 < 1e-12) return { t: 0, foot: a, perpDist: len(sub(p, a)) };
  const tRaw = dot(sub(p, a), ab) / L2;
  const t = Math.max(0, Math.min(1, tRaw));
  const foot = { x: a.x + ab.x * t, z: a.z + ab.z * t };
  return { t, foot, perpDist: len(sub(p, foot)) };
}

/**
 * Scalar station of `p` along the axis anchored at `origin` with unit
 * direction `axisDir` — the 1-D coordinate the chain planner uses (§SPIKE §3.2).
 */
export function station(p: PtXZ, origin: PtXZ, axisDir: PtXZ): number {
  return dot(sub(p, origin), axisDir);
}

/**
 * Canonicalise a run direction so it is orientation-independent of member
 * insertion order (§SPIKE §14.2): force `x > 0`, or `z > 0` when `x ≈ 0`.
 */
export function canonicalDir(d: PtXZ): PtXZ {
  const u = unit(d);
  if (u.x > 1e-9) return u;
  if (u.x < -1e-9) return { x: -u.x, z: -u.z };
  // x ≈ 0 — decide by z.
  return u.z >= 0 ? u : { x: -u.x, z: -u.z };
}
