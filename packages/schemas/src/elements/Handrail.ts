import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { Vec3 } from '../base/primitives.js';

const HandrailShape = z.enum(['round', 'square', 'flat']);

/**
 * Handrail — extruded profile following a polyline path.
 */
export const Handrail = defineElement('handrail', {
  levelId: z.string().default(''),
  /** Optional host element (stair, slab edge, ramp). */
  hostId: z.string().optional(),
  /** Path in world coordinates; ≥ 2 points. */
  path: z.array(Vec3).min(2).default([
    { x: 0, y: 1, z: 0 },
    { x: 1, y: 1, z: 0 },
  ]),
  shape: HandrailShape.default('round'),
  /** Rail height above host, in metres. */
  height: z.number().positive().default(1.0),
  diameter: z.number().positive().default(0.04),
  materialId: z.string().optional(),
}).refine(
  (h) => {
    const a = h.path[0]!;
    const b = h.path[h.path.length - 1]!;
    return a.x !== b.x || a.y !== b.y || a.z !== b.z;
  },
  { message: 'Handrail path endpoints must differ (zero-length rail not allowed).' },
);

export type Handrail = z.infer<typeof Handrail>;
