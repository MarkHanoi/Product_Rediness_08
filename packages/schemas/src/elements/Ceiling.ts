import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { Vec3 } from '../base/primitives.js';

/**
 * Ceiling — a horizontal element bounded by a closed polygon, hung at a
 * configurable offset below the level above.
 */
export const Ceiling = defineElement('ceiling', {
  levelId: z.string().default(''),
  boundary: z.array(Vec3).min(3).default([
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 1, y: 0, z: 1 },
    { x: 0, y: 0, z: 1 },
  ]),
  /** Ceiling height above the level base, in metres. */
  ceilingHeight: z.number().positive().default(2.7),
  thickness: z.number().positive().default(0.05),
  materialId: z.string().optional(),
  materialColor: z.string().optional(),
}).refine(
  (c) => c.thickness < c.ceilingHeight,
  { message: 'Ceiling thickness must be smaller than its ceilingHeight (otherwise it would punch through the floor below).' },
);

export type Ceiling = z.infer<typeof Ceiling>;
