// Slab intent helpers — S12-T2.
//
// `code-level ADR docs/02-decisions/adrs/0013-intent-resolver.md`
//
// Slab placement does not require host-element resolution (unlike a
// door which lives on a wall).  The intent file therefore exposes
// pure-geometry helpers that the placement tool and handlers share —
// signed area + closed-loop validation + centroid.

interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Signed XZ area of a CCW polygon (Y-up convention).
 *  Positive = CCW from above. */
export function signedAreaXZ(loop: readonly Vec3Like[]): number {
  let sum = 0;
  for (let i = 0, n = loop.length; i < n; i++) {
    const a = loop[i]!;
    const b = loop[(i + 1) % n]!;
    sum += a.x * b.z - b.x * a.z;
  }
  return sum / 2;
}

/** Centroid (XZ) of a polygon.  Uses signed area weighting; valid for
 *  simple polygons (no self-intersection). */
export function centroidXZ(loop: readonly Vec3Like[]): { x: number; z: number } {
  const a = signedAreaXZ(loop);
  if (a === 0) {
    let x = 0, z = 0;
    for (const p of loop) { x += p.x; z += p.z; }
    return { x: x / loop.length, z: z / loop.length };
  }
  let cx = 0, cz = 0;
  for (let i = 0, n = loop.length; i < n; i++) {
    const p = loop[i]!;
    const q = loop[(i + 1) % n]!;
    const cross = p.x * q.z - q.x * p.z;
    cx += (p.x + q.x) * cross;
    cz += (p.z + q.z) * cross;
  }
  const f = 1 / (6 * a);
  return { x: cx * f, z: cz * f };
}

export interface SlabPolygonValidation {
  readonly ok: boolean;
  readonly reason?: string;
  readonly area?: number;
}

/** Validate a slab boundary loop.  Mirrors the schema's `.refine` —
 *  must have ≥3 vertices and the first vertex must NOT equal the last
 *  (we use open-form polygons; closure is implicit). */
export function validateSlabBoundary(
  loop: readonly Vec3Like[],
): SlabPolygonValidation {
  if (loop.length < 3) {
    return { ok: false, reason: 'boundary must have ≥3 vertices' };
  }
  const first = loop[0]!;
  const last = loop[loop.length - 1]!;
  if (first.x === last.x && first.y === last.y && first.z === last.z) {
    return { ok: false, reason: 'boundary must be open (do not duplicate the closing vertex)' };
  }
  const a = signedAreaXZ(loop);
  if (Math.abs(a) < 1e-9) {
    return { ok: false, reason: 'boundary has zero area' };
  }
  return { ok: true, area: a };
}
