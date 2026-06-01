// edge-projection — pure plan-view edge classifier (S30).
//
// Spec: `phases/PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md` §S30.
// ADR:  `code-level ADR docs/02-decisions/adrs/0028-plan-view-canvas-architecture.md`
//       `[strategic ADR-016]` (drawing engine foundation — classifier role).
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Pure function — no THREE, no DOM, no `window`.
// • Deterministic — identical inputs produce byte-identical output in Node
//   worker_thread and browser worker (K1-B requirement).
// • Role: CLASSIFIER only.  Downstream, `packages/drawing-primitives/`
//   (landed S31-bis post-2B closeout; ADR-0029)
//   emits the actual primitive stream from `ClassifiedEdge[]`; this module
//   does NOT emit primitives directly.
//
// COORDINATE CONVENTION (matches wall/slab schemas)
// ─────────────────────────────────────────────────────────────────────────────
//   World X  →  plan X
//   World Z  →  plan Y   (the "y" field of Vec2 in this module)
//   World Y  →  vertical (dropped in projection)
//
// EDGE KINDS (ISO 128-21 informed)
// ─────────────────────────────────────────────────────────────────────────────
//   wall-outer      heavy line (0.50 mm) — exposed outer face of wall
//   wall-inner      medium line (0.25 mm) — interior face of wall
//   opening         thin line (0.10 mm) — jamb lines at door/window openings
//   poche-boundary  medium line (0.25 mm) — end caps sealing the wall section
//
// OPENING DETECTION (cut-plane test)
// ─────────────────────────────────────────────────────────────────────────────
// An opening passes through the cut plane if:
//   wallBase + opening.sillHeight  <  cutPlane  <  wallBase + opening.sillHeight + opening.height
// (strict inequalities — openings that end exactly at the cut plane are solid.)

import type { Wall, Door, Window } from '@pryzm/schemas';

// ── Public types ─────────────────────────────────────────────────────────────

/** 2-D point in plan space (world X / world Z). */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** A classified plan-view edge at a given cut height. */
export interface Edge2D {
  readonly kind: 'wall-outer' | 'wall-inner' | 'opening' | 'poche-boundary';
  readonly start: Vec2;
  readonly end: Vec2;
  /** Which wall (or opening element) this edge belongs to. */
  readonly elementId: string;
  /** ISO 128-21 line weight in mm: 0.10 | 0.25 | 0.50 | 0.70 | 1.00. */
  readonly lineWeight: number;
}

export interface ProjectWallEdgesInput {
  readonly walls: readonly Wall[];
  readonly doors: readonly Door[];
  readonly windows: readonly Window[];
  /** Elevation of the level (world Y of the level's floor plane). */
  readonly levelZ: number;
  /**
   * Distance above levelZ at which the cut plane intersects the model.
   * Default: 1.0 m (the architectural standard for plan view cuts).
   */
  readonly cutHeight?: number;
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Projects wall geometry onto the plan-view cut plane and classifies each
 * resulting edge.  Returns an ordered, deterministic array of `Edge2D`.
 *
 * The output is consumed by `packages/drawing-primitives/` to emit SVG/Canvas
 * path primitives, and by the plan-view host to stroke the 2-D scene.
 */
export function projectWallEdges(input: ProjectWallEdgesInput): Edge2D[] {
  const { walls, doors, windows, levelZ } = input;
  const cutHeight = input.cutHeight ?? 1.0;
  const cutPlane = levelZ + cutHeight;
  const edges: Edge2D[] = [];

  const doorsByWall = _groupByWall(doors, (d) => d.wallId);
  const winsByWall  = _groupByWall(windows, (w) => w.wallId);

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
    const nx = -uz;          // left-normal in plan
    const nz =  ux;
    const halfT = wall.thickness * 0.5;

    // ── Collect opening intervals ───────────────────────────────────────────
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

    // ── Solid segments → outer + inner face edges ───────────────────────────
    for (const [t0, t1] of solid) {
      if (t1 - t0 < 1e-9) continue;

      const s0x = a.x + ux * t0;
      const s0z = a.z + uz * t0;
      const s1x = a.x + ux * t1;
      const s1z = a.z + uz * t1;

      edges.push({
        kind: 'wall-outer',
        start: { x: s0x + nx * halfT, y: s0z + nz * halfT },
        end:   { x: s1x + nx * halfT, y: s1z + nz * halfT },
        elementId: wall.id,
        lineWeight: 0.5,
      });

      edges.push({
        kind: 'wall-inner',
        start: { x: s0x - nx * halfT, y: s0z - nz * halfT },
        end:   { x: s1x - nx * halfT, y: s1z - nz * halfT },
        elementId: wall.id,
        lineWeight: 0.25,
      });
    }

    // ── Opening intervals → jamb edges ──────────────────────────────────────
    for (const [t0, t1] of merged) {
      const t0c = Math.max(0, Math.min(t0, len));
      const t1c = Math.max(0, Math.min(t1, len));
      if (t1c - t0c < 1e-9) continue;

      const emitJamb = (tc: number): void => {
        const jx = a.x + ux * tc;
        const jz = a.z + uz * tc;
        edges.push({
          kind: 'opening',
          start: { x: jx + nx * halfT, y: jz + nz * halfT },
          end:   { x: jx - nx * halfT, y: jz - nz * halfT },
          elementId: wall.id,
          lineWeight: 0.1,
        });
      };

      emitJamb(t0c);
      emitJamb(t1c);
    }

    // ── End-caps (poche-boundary) ────────────────────────────────────────────
    const hasStartSolid = solid.length > 0 && solid[0]![0] < 1e-9;
    const hasEndSolid   = solid.length > 0 && solid[solid.length - 1]![1] > len - 1e-9;

    if (hasStartSolid) {
      edges.push({
        kind: 'poche-boundary',
        start: { x: a.x + nx * halfT, y: a.z + nz * halfT },
        end:   { x: a.x - nx * halfT, y: a.z - nz * halfT },
        elementId: wall.id,
        lineWeight: 0.25,
      });
    }
    if (hasEndSolid) {
      edges.push({
        kind: 'poche-boundary',
        start: { x: b.x + nx * halfT, y: b.z + nz * halfT },
        end:   { x: b.x - nx * halfT, y: b.z - nz * halfT },
        elementId: wall.id,
        lineWeight: 0.25,
      });
    }
  }

  return edges;
}

// ── Internal helpers (exported for testing) ──────────────────────────────────

/**
 * Groups an array of hosted elements by their wall-id selector.
 * Exported so tests can verify the grouping independently.
 */
export function _groupByWall<T>(
  items: readonly T[],
  getWallId: (item: T) => string,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const id = getWallId(item);
    const arr = map.get(id);
    if (arr) {
      arr.push(item);
    } else {
      map.set(id, [item]);
    }
  }
  return map;
}

/**
 * Merges overlapping/touching intervals.  Input need not be sorted.
 * Returns a sorted, non-overlapping list.
 */
export function _mergeIntervals(
  intervals: readonly [number, number][],
): [number, number][] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [[sorted[0]![0], sorted[0]![1]]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]!;
    const cur  = sorted[i]!;
    if (cur[0] <= last[1]) {
      last[1] = Math.max(last[1], cur[1]);
    } else {
      merged.push([cur[0], cur[1]]);
    }
  }
  return merged;
}

/**
 * Computes the complement of `intervals` within `[rangeStart, rangeEnd]`.
 * The returned segments are the "solid" (non-open) portions of the range.
 */
export function _invertIntervals(
  intervals: readonly [number, number][],
  rangeStart: number,
  rangeEnd:   number,
): [number, number][] {
  const solid: [number, number][] = [];
  let cursor = rangeStart;
  for (const [t0, t1] of intervals) {
    if (t0 > cursor + 1e-9) {
      solid.push([cursor, Math.min(t0, rangeEnd)]);
    }
    cursor = Math.max(cursor, t1);
    if (cursor >= rangeEnd) break;
  }
  if (cursor < rangeEnd - 1e-9) {
    solid.push([cursor, rangeEnd]);
  }
  return solid;
}
