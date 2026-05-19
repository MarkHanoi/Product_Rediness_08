import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { Vec3 } from '../base/primitives.js';

const ColumnShape = z.enum(['rectangular', 'circular', 'i-section']);

/**
 * Structural column — extrusion of a profile between two levels.
 */
export const Column = defineElement('column', {
  levelId: z.string().default(''),
  /** Top level id; absent → extrude `height` metres up from `baseOffset`. */
  topLevelId: z.string().optional(),
  /** Insertion point in world coordinates. */
  origin: Vec3.default({ x: 0, y: 0, z: 0 }),
  shape: ColumnShape.default('rectangular'),
  width: z.number().positive().default(0.4),
  depth: z.number().positive().default(0.4),
  height: z.number().positive().default(3),
  baseOffset: z.number().default(0),
  /** Rotation about Y in radians. */
  rotation: z.number().default(0),
  materialId: z.string().optional(),
}).refine(
  (c) => c.shape !== 'circular' || c.width === c.depth,
  { message: 'Circular column must have width === depth (the cylinder diameter).' },
);

export type Column = z.infer<typeof Column>;
