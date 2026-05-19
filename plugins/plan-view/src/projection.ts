// projection — pure 3D-to-plan projection (S29 / ADR-0028).
//
// No DOM, no canvas, no `window`.  Same input → same output, every time.
// Consumed by both the canvas host (renders the segments) and tests
// (asserts on shape).
//
// World convention (matches the wall + slab schemas):
//   * X+ → plan +X
//   * Z+ → plan +Y
//   * Y  → vertical, dropped in projection
//
// Filter rule: emit only elements whose `levelId === request.levelId`.

import type { Wall, Slab, Door } from '@pryzm/plugin-sdk';

export interface PlanPoint { readonly x: number; readonly y: number }

export interface PlanSegment {
  readonly elementId: string;
  readonly kind: 'wall' | 'door-break';
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  /** Wall thickness in metres for stroke weight. Door breaks reuse host wall thickness. */
  readonly thickness: number;
}

export interface PlanPolygon {
  readonly elementId: string;
  readonly kind: 'slab';
  readonly points: readonly PlanPoint[];
}

export interface PlanScene {
  readonly wallSegments: readonly PlanSegment[];
  readonly slabOutlines: readonly PlanPolygon[];
  readonly doorBreaks: readonly PlanSegment[];
}

export interface ProjectPlanSceneInput {
  readonly walls: readonly Wall[];
  readonly slabs: readonly Slab[];
  readonly doors: readonly Door[];
  readonly levelId: string;
}

const EMPTY: PlanScene = Object.freeze({
  wallSegments: [],
  slabOutlines: [],
  doorBreaks: [],
});

/** Pure projection — takes a flat snapshot of element DTOs, returns plan-view geometry. */
export function projectPlanScene(input: ProjectPlanSceneInput): PlanScene {
  if (typeof input.levelId !== 'string') return EMPTY;

  const wallSegments: PlanSegment[] = [];
  const wallById = new Map<string, Wall>();
  for (const w of input.walls) {
    if (w.levelId !== input.levelId) continue;
    wallById.set(w.id, w);
    const [a, b] = w.baseLine;
    wallSegments.push({
      elementId: w.id,
      kind: 'wall',
      ax: a.x,
      ay: a.z,
      bx: b.x,
      by: b.z,
      thickness: w.thickness,
    });
  }

  const slabOutlines: PlanPolygon[] = [];
  for (const s of input.slabs) {
    if (s.levelId !== input.levelId) continue;
    const points: PlanPoint[] = s.boundary.map((p) => ({ x: p.x, y: p.z }));
    slabOutlines.push({
      elementId: s.id,
      kind: 'slab',
      points,
    });
  }

  // Door breaks: for every door whose host wall is on the active level,
  // emit the segment along the wall baseline that the door opening occupies.
  // The committer / SVG export draws the wall in two halves around this break.
  const doorBreaks: PlanSegment[] = [];
  for (const d of input.doors) {
    const host = wallById.get(d.wallId);
    if (!host) continue;
    const [wa, wb] = host.baseLine;
    const dx = wb.x - wa.x;
    const dz = wb.z - wa.z;
    const wallLen = Math.hypot(dx, dz);
    if (wallLen === 0) continue;
    const ux = dx / wallLen;
    const uz = dz / wallLen;
    // Clamp the opening to the wall length so a stale offset can't
    // emit a break beyond the end of its host.
    const startOffset = Math.max(0, Math.min(d.offset, wallLen));
    const endOffset = Math.max(0, Math.min(d.offset + d.width, wallLen));
    if (endOffset <= startOffset) continue;
    doorBreaks.push({
      elementId: d.id,
      kind: 'door-break',
      ax: wa.x + ux * startOffset,
      ay: wa.z + uz * startOffset,
      bx: wa.x + ux * endOffset,
      by: wa.z + uz * endOffset,
      thickness: host.thickness,
    });
  }

  return { wallSegments, slabOutlines, doorBreaks };
}
