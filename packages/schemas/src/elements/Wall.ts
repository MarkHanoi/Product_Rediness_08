import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { Vec3 } from '../base/primitives.js';

/**
 * Linear or curved wall between two points on a level.
 *
 * The canonical schema; every other element family follows this template.
 *
 * Geometry: `baseLine` is a 2-tuple of world-XZ endpoints (the `y` component
 * holds the level elevation per PRYZM 1's §WALL-AUDIT-2026-M7 convention).
 * If `curve` is present, the wall is a quadratic-Bézier arc between those
 * endpoints via `curve.control`; absent means straight.
 */
const WallLayerFunction = z.enum([
  'finish-exterior',
  'substrate',
  'insulation',
  'air-barrier',
  'structure',
  'finish-interior',
]);

const WallLayer = z.object({
  name: z.string().min(1),
  function: WallLayerFunction,
  /** Layer thickness in metres; must be > 0. */
  thickness: z.number().positive(),
  materialId: z.string().optional(),
  materialColor: z.string().optional(),
});

const Opening = z.object({
  id: z.string().min(1),
  type: z.enum(['window', 'door']),
  doorType: z.enum(['single', 'double']).optional(),
  windowType: z.enum(['single', 'double']).optional(),
  /** Distance along the wall baseline from start, in metres. */
  offset: z.number().nonnegative(),
  width: z.number().positive(),
  height: z.number().positive(),
  sillHeight: z.number().nonnegative(),
  elementId: z.string().min(1),
});

const WallCurve = z.object({
  /** Quadratic-Bézier control point in world space (XZ plane). */
  control: Vec3,
  /** Tessellation segment count; min 4, recommend 16–32. */
  segments: z.number().int().min(4).default(16),
});

const WallSide = z.enum(['interior', 'exterior', 'unknown']);

export const Wall = defineElement('wall', {
  /** Owning level id. Walls without a level are invalid. */
  levelId: z.string().default(''),
  baseLine: z
    .tuple([Vec3, Vec3])
    .default([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ]),
  curve: WallCurve.optional(),
  /** Wall height in metres. */
  height: z.number().positive().default(2.5),
  /** Wall thickness in metres. */
  thickness: z.number().min(0.05).default(0.1),
  /** Vertical offset from level base, in metres. */
  baseOffset: z.number().default(0),
  openings: z.array(Opening).default([]),
  materialId: z.string().optional(),
  materialColor: z.string().optional(),
  systemTypeId: z.string().optional(),
  layers: z.array(WallLayer).optional(),
  frontSide: WallSide.optional(),
  backSide: WallSide.optional(),
})
  // (1) MIN_WALL_LEN: planar baseline length must clear the join-resolver
  //     minimum so the wall is non-degenerate. Y axis is intentionally ignored
  //     because baseLine.y carries the level elevation, not planar length.
  //     Mirrors `WallDataSchema` §WALL-AUDIT-2026 (RESOLVED 2026-04-24).
  .refine(
    (w) => {
      const [a, b] = w.baseLine;
      return Math.hypot(a.x - b.x, a.z - b.z) >= 0.05;
    },
    { message: 'Wall too short: baseLine endpoints must be ≥ 0.05 m apart in the XZ plane.' },
  )
  // (2) baseLine endpoint y-consistency: both endpoints must share the same
  //     elevation. A wall baseLine is a horizontal segment by contract;
  //     divergent y values indicate a stale cascade or mis-projected drag.
  .refine(
    (w) => w.baseLine[0].y === w.baseLine[1].y,
    { message: 'Wall baseLine endpoints must share the same y (level elevation).' },
  )
  // (3) Derived-index invariant: `childrenIds` must be a set-superset of
  //     `openings[*].elementId`. Mirrors WallStore's belt-and-braces guard
  //     so the parametric-vs-geometric child sets cannot drift.
  .refine(
    (w) => {
      if (w.openings.length === 0) return true;
      const have = new Set(w.childrenIds);
      return w.openings.every((o) => have.has(o.elementId));
    },
    { message: 'Wall.childrenIds must be a superset of openings[*].elementId.' },
  );

export type Wall = z.infer<typeof Wall>;
