import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { Vec3 } from '../base/primitives.js';

const BeamShape = z.enum(['rectangular', 'i-section', 't-section']);

/**
 * Structural beam — extrusion of a profile along a baseline.
 */
export const Beam = defineElement('beam', {
  levelId: z.string().default(''),
  baseLine: z.tuple([Vec3, Vec3]).default([
    { x: 0, y: 0, z: 0 },
    { x: 4, y: 0, z: 0 },
  ]),
  shape: BeamShape.default('rectangular'),
  width: z.number().positive().default(0.2),
  depth: z.number().positive().default(0.4),
  /** Rotation of the profile about the beam axis, in radians. */
  rotation: z.number().default(0),
  materialId: z.string().optional(),
}).refine(
  (b) => {
    const [a, c] = b.baseLine;
    return a.x !== c.x || a.y !== c.y || a.z !== c.z;
  },
  { message: 'Beam baseLine endpoints must differ (zero-length beam not allowed).' },
);

export type Beam = z.infer<typeof Beam>;
