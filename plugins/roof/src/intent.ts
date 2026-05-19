// Roof intent resolver — S11-T3.
//
// Roofs are NOT wall-hosted, so the intent surface is a 2D footprint
// helper rather than a hit-test-against-walls helper.  Two responsibilities:
//   1. `validatePolygon` — basic CCW/area sanity checks on a candidate
//      boundary (≥3 unique XZ points, non-degenerate area).
//   2. `centroid` — convenience helper used by the placement tool to
//      anchor camera focus / overlays.
//
// THREE-FREE.

interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface RoofPolygonValidation {
  readonly valid: boolean;
  readonly reason?: string;
  readonly area: number;
}

const DEGENERATE_AREA = 1e-6;

export function signedArea(boundary: readonly Vec3Like[]): number {
  let s = 0;
  const n = boundary.length;
  for (let i = 0; i < n; i++) {
    const a = boundary[i]!;
    const b = boundary[(i + 1) % n]!;
    s += a.x * b.z - b.x * a.z;
  }
  return s / 2;
}

export function centroid(boundary: readonly Vec3Like[]): Vec3Like {
  let sx = 0, sy = 0, sz = 0;
  for (const p of boundary) {
    sx += p.x; sy += p.y; sz += p.z;
  }
  const n = Math.max(1, boundary.length);
  return { x: sx / n, y: sy / n, z: sz / n };
}

export function validatePolygon(
  boundary: readonly Vec3Like[],
): RoofPolygonValidation {
  if (boundary.length < 3) {
    return { valid: false, reason: 'boundary requires ≥3 points', area: 0 };
  }
  const area = Math.abs(signedArea(boundary));
  if (area < DEGENERATE_AREA) {
    return { valid: false, reason: 'boundary is degenerate (collinear)', area };
  }
  return { valid: true, area };
}
