import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { Vec3 } from '../base/primitives.js';

const StairShape = z.enum(['straight', 'l-shape', 'u-shape', 'spiral']);

/**
 * Stair — single-flight or multi-flight assembly between two levels.
 */
export const Stair = defineElement('stair', {
  levelId: z.string().default(''),
  /** Top level the stair lands on (must differ from `levelId`). */
  topLevelId: z.string().default(''),
  shape: StairShape.default('straight'),
  /** Stair start position in world coordinates. */
  origin: Vec3.default({ x: 0, y: 0, z: 0 }),
  /** Plan-direction angle in radians (about world Y). */
  rotation: z.number().default(0),
  /** Tread depth (run) in metres. */
  treadDepth: z.number().positive().default(0.28),
  /** Riser height in metres. */
  riserHeight: z.number().positive().default(0.18),
  /** Total horizontal stair width in metres. */
  width: z.number().positive().default(1.0),
  /** Number of risers. */
  numRisers: z.number().int().positive().default(15),
  materialId: z.string().optional(),
}).refine(
  (s) => s.numRisers >= 2,
  { message: 'Stair must have at least 2 risers (a single step is a slab edge, not a stair).' },
);

export type Stair = z.infer<typeof Stair>;
