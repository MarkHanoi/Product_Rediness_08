import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { Vec3 } from '../base/primitives.js';

/**
 * Floor / slab — a polygonal horizontal element bounded by a closed loop of
 * sketch points and optional inner holes.
 */
const SlabLoop = z.array(Vec3).min(3);

export const Slab = defineElement('slab', {
  levelId: z.string().default(''),
  /** Outer boundary, world coordinates. */
  boundary: SlabLoop.default([
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 1, y: 0, z: 1 },
    { x: 0, y: 0, z: 1 },
  ]),
  /** Optional inner hole loops (e.g., shafts). */
  holes: z.array(SlabLoop).default([]),
  /** Slab thickness in metres. */
  thickness: z.number().positive().default(0.2),
  /** Vertical offset from level base, in metres. */
  baseOffset: z.number().default(0),
  materialId: z.string().optional(),
  materialColor: z.string().optional(),
  systemTypeId: z.string().optional(),
}).refine(
  (s) => {
    const first = s.boundary[0]!;
    const last = s.boundary[s.boundary.length - 1]!;
    return first.x !== last.x || first.y !== last.y || first.z !== last.z;
  },
  { message: 'Slab boundary must be open (do not duplicate the closing vertex).' },
);

export type Slab = z.infer<typeof Slab>;
