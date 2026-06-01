// hit-test — point-in-element 2D hit testing for the plan view (G9, G10).
//
// Spec: `phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md` §S33 line 727:
//   "the `hitTest` function performs point-in-wall AABB test (fast)
//    followed by point-in-polygon refinement (for accuracy).  The wall
//    AABB is `wall.start`/`wall.end` ± `wall.thickness/2`."
//
// Subordinate ADR: `docs/02-decisions/adrs/0025-plan-view-svp-parity-contract-44.md`.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// `buildPlanHitTest({ walls, slabs, doors? })` returns
//   `(worldX, worldZ) => string | null`.
//
// Lookup order (most-specific wins):
//   1. Doors   — small rotated-AABB along the host wall axis.  Doors are
//                drawn ON TOP of their host wall in plan, so a click in
//                the door's footprint MUST select the door, not the wall.
//   2. Walls   — segment-distance ≤ thickness/2 (with AABB pre-filter).
//   3. Slabs   — point-in-polygon (Shoelace ray cast) on the boundary.
//
// On tie (overlapping walls), the LAST-iterated wall wins.  Callers can
// reorder the input to pick a hit-priority (e.g. selected first).
//
// COORDINATE CONVENTION
// ─────────────────────────────────────────────────────────────────────────────
//   wall.baseLine[0/1].x → world X
//   wall.baseLine[0/1].z → world Z   (plan "Y")
//   slab.boundary[i].x   → world X
//   slab.boundary[i].z   → world Z
//
// PURE: no DOM, no THREE, no `window` — Node-safe.

import type { Wall, Slab, Door } from '@pryzm/plugin-sdk';

export type HitTestFn = (worldX: number, worldZ: number) => string | null;

export interface PlanHitTestInput {
  readonly walls: Iterable<Wall>;
  readonly slabs?: Iterable<Slab>;
  readonly doors?: Iterable<Door>;
}

interface WallEntry {
  readonly id: string;
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
  readonly halfThickness: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

interface DoorEntry {
  readonly id: string;
  readonly cx: number;
  readonly cz: number;
  readonly halfWidth: number;
  readonly halfThickness: number;
  /** Cosine / sine of the host wall's baseline direction — used for
   *  rotated-AABB test. */
  readonly cos: number;
  readonly sin: number;
}

interface SlabEntry {
  readonly id: string;
  readonly polygon: readonly { readonly x: number; readonly z: number }[];
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

// ── Geometry helpers ────────────────────────────────────────────────────────

/** Squared distance from point (px,pz) to segment ((ax,az)-(bx,bz)). */
function segmentDistSq(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq === 0) {
    const ex = px - ax;
    const ez = pz - az;
    return ex * ex + ez * ez;
  }
  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = ax + t * dx;
  const cz = az + t * dz;
  const ex = px - cx;
  const ez = pz - cz;
  return ex * ex + ez * ez;
}

/** Ray-cast point-in-polygon on a closed loop (vertex 0 not repeated). */
function pointInPolygon(
  px: number,
  pz: number,
  poly: readonly { readonly x: number; readonly z: number }[],
): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const vi = poly[i]!;
    const vj = poly[j]!;
    const intersect =
      vi.z > pz !== vj.z > pz &&
      px < ((vj.x - vi.x) * (pz - vi.z)) / (vj.z - vi.z) + vi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Build a hit-test function over the supplied scene.  The returned function
 * is allocation-free per call.
 */
export function buildPlanHitTest(input: PlanHitTestInput): HitTestFn {
  const wallEntries: WallEntry[] = [];
  const wallsById = new Map<string, Wall>();
  for (const w of input.walls) {
    const a = w.baseLine[0];
    const b = w.baseLine[1];
    const half = w.thickness / 2;
    const minX = Math.min(a.x, b.x) - half;
    const maxX = Math.max(a.x, b.x) + half;
    const minZ = Math.min(a.z, b.z) - half;
    const maxZ = Math.max(a.z, b.z) + half;
    wallEntries.push({
      id: w.id,
      ax: a.x,
      az: a.z,
      bx: b.x,
      bz: b.z,
      halfThickness: half,
      minX,
      maxX,
      minZ,
      maxZ,
    });
    wallsById.set(w.id, w);
  }

  const doorEntries: DoorEntry[] = [];
  if (input.doors) {
    for (const d of input.doors) {
      const wall = wallsById.get(d.wallId);
      if (!wall) continue;
      const a = wall.baseLine[0];
      const b = wall.baseLine[1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len === 0) continue;
      const cos = dx / len;
      const sin = dz / len;
      const cx = a.x + cos * d.offset + cos * (d.width / 2);
      const cz = a.z + sin * d.offset + sin * (d.width / 2);
      doorEntries.push({
        id: d.id,
        cx,
        cz,
        halfWidth: d.width / 2,
        halfThickness: wall.thickness / 2,
        cos,
        sin,
      });
    }
  }

  const slabEntries: SlabEntry[] = [];
  if (input.slabs) {
    for (const s of input.slabs) {
      const poly: { x: number; z: number }[] = [];
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const v of s.boundary) {
        poly.push({ x: v.x, z: v.z });
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
        if (v.z < minZ) minZ = v.z;
        if (v.z > maxZ) maxZ = v.z;
      }
      slabEntries.push({ id: s.id, polygon: poly, minX, maxX, minZ, maxZ });
    }
  }

  return (worldX: number, worldZ: number): string | null => {
    // 1. Doors — rotated AABB check (door axis = host wall axis).
    //    Doors render ON TOP of walls in plan, so they take hit priority.
    for (const d of doorEntries) {
      const dx = worldX - d.cx;
      const dz = worldZ - d.cz;
      // Project into door-local frame.
      const localU = dx * d.cos + dz * d.sin;       // along wall
      const localV = -dx * d.sin + dz * d.cos;      // across wall
      if (Math.abs(localU) <= d.halfWidth && Math.abs(localV) <= d.halfThickness) {
        return d.id;
      }
    }

    // 2. Walls — segment distance with AABB pre-filter.
    let wallHit: string | null = null;
    for (const w of wallEntries) {
      if (worldX < w.minX || worldX > w.maxX) continue;
      if (worldZ < w.minZ || worldZ > w.maxZ) continue;
      const distSq = segmentDistSq(worldX, worldZ, w.ax, w.az, w.bx, w.bz);
      if (distSq <= w.halfThickness * w.halfThickness) {
        wallHit = w.id; // last wins on tie
      }
    }
    if (wallHit) return wallHit;

    // 3. Slabs — polygon ray-cast.
    for (const s of slabEntries) {
      if (worldX < s.minX || worldX > s.maxX) continue;
      if (worldZ < s.minZ || worldZ > s.maxZ) continue;
      if (pointInPolygon(worldX, worldZ, s.polygon)) return s.id;
    }

    return null;
  };
}
