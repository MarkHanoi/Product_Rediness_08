// poche — pure plan-view poche-fill producer (S30).
//
// Spec: `phases/PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md` §S30.
// ADR:  `[strategic ADR-016]` (drawing engine foundation).
//       SPEC-04 §2.3 — hatch alignment follows element local coordinate system.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Pure function — no THREE, no DOM, no `window`.
// • Deterministic — identical inputs → byte-identical output in Node + browser.
// • Each `PocheFill.polygon` is a closed CCW quadrilateral (the rectangular
//   wall cross-section at the cut plane).  The last vertex is NOT repeated
//   (the polygon is implicitly closed by returning to polygon[0]).
// • Per SPEC-04 §2.3: hatch direction is aligned to the wall's local
//   coordinate system (along the baseline direction), never the view origin.
//
// COORDINATE CONVENTION
// ─────────────────────────────────────────────────────────────────────────────
//   polygon[i].x  →  world X
//   polygon[i].y  →  world Z   (plan "Y")

import type { Wall, Door, Window } from '@pryzm/schemas';
import { _mergeIntervals, _invertIntervals, _groupByWall } from './edge-projection.js';

// ── Public types ─────────────────────────────────────────────────────────────

/** 2-D point in plan space (world X / world Z). */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/**
 * A single solid fill region for a wall cross-section at the cut plane.
 * The fill polygon is a clockwise (screen-space) quadrilateral oriented
 * along the wall's baseline direction.
 *
 * `hatchAngle` (degrees, 0–360) is the angle of the hatch lines in the
 * element's local coordinate system per SPEC-04 §2.3.
 */
export interface PocheFill {
  readonly polygon: readonly Vec2[];
  readonly elementId: string;
  /** Hatch angle in degrees relative to element-local X axis (baseline direction). */
  readonly hatchAngle: number;
}

export interface ComputePocheFillsInput {
  readonly walls: readonly Wall[];
  readonly doors: readonly Door[];
  readonly windows: readonly Window[];
  /** Elevation of the level's floor plane (world Y). */
  readonly levelZ: number;
  /**
   * Cut height above levelZ in metres.
   * Default: 1.0 m (standard plan view cut).
   */
  readonly cutHeight?: number;
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Computes solid poche fill polygons for all wall cross-sections at the
 * given cut plane.
 *
 * For each solid segment of each intersecting wall the function returns a
 * `PocheFill` whose `polygon` is a 4-vertex CCW quadrilateral aligned with
 * the wall's baseline direction (per SPEC-04 §2.3 hatch-alignment rule).
 */
export function computePocheFills(input: ComputePocheFillsInput): PocheFill[] {
  const { walls, doors, windows, levelZ } = input;
  const cutHeight = input.cutHeight ?? 1.0;
  const cutPlane = levelZ + cutHeight;

  const doorsByWall = _groupByWall(doors, (d) => d.wallId);
  const winsByWall  = _groupByWall(windows, (w) => w.wallId);

  const fills: PocheFill[] = [];

  for (const wall of walls) {
    const [a, b] = wall.baseLine;
    const wallBase = a.y + wall.baseOffset;
    const wallTop  = wallBase + wall.height;

    if (wallBase >= cutPlane || wallTop <= cutPlane) continue;

    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-9) continue;

    const ux = dx / len;
    const uz = dz / len;
    const nx = -uz;   // left-normal (plan space)
    const nz =  ux;
    const halfT = wall.thickness * 0.5;

    // Hatch angle: angle of wall baseline relative to world +X axis, in degrees.
    // Per SPEC-04 §2.3, hatch lines run parallel to the wall, so the hatch
    // angle equals the baseline direction (not perpendicular to it).
    const hatchAngle = (Math.atan2(uz, ux) * 180) / Math.PI;

    // ── Collect opening intervals ─────────────────────────────────────────
    const openCuts: [number, number][] = [];

    for (const op of wall.openings) {
      const opBase = wallBase + op.sillHeight;
      if (opBase < cutPlane && opBase + op.height > cutPlane) {
        openCuts.push([op.offset, op.offset + op.width]);
      }
    }
    for (const d of doorsByWall.get(wall.id) ?? []) {
      const opBase = wallBase + d.sillHeight;
      if (opBase < cutPlane && opBase + d.height > cutPlane) {
        openCuts.push([d.offset, d.offset + d.width]);
      }
    }
    for (const w of winsByWall.get(wall.id) ?? []) {
      const opBase = wallBase + w.sillHeight;
      if (opBase < cutPlane && opBase + w.height > cutPlane) {
        openCuts.push([w.offset, w.offset + w.width]);
      }
    }

    const merged = _mergeIntervals(openCuts);
    const solid  = _invertIntervals(merged, 0, len);

    // ── Emit one PocheFill per solid segment ─────────────────────────────
    for (const [t0, t1] of solid) {
      if (t1 - t0 < 1e-9) continue;

      // 4-vertex CCW polygon (in screen space: +X right, +Y down plan).
      // Vertices traverse: start-outer → end-outer → end-inner → start-inner.
      const polygon: Vec2[] = [
        { x: a.x + ux * t0 + nx * halfT, y: a.z + uz * t0 + nz * halfT },
        { x: a.x + ux * t1 + nx * halfT, y: a.z + uz * t1 + nz * halfT },
        { x: a.x + ux * t1 - nx * halfT, y: a.z + uz * t1 - nz * halfT },
        { x: a.x + ux * t0 - nx * halfT, y: a.z + uz * t0 - nz * halfT },
      ];

      fills.push({ polygon, elementId: wall.id, hatchAngle });
    }
  }

  return fills;
}
