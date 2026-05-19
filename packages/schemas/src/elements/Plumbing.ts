import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { Vec3 } from '../base/primitives.js';

/**
 * Plumbing run primitives (S26 / ADR-0023).
 *
 * Only three sub-types in S26 — `straight`, `elbow`, `tee` — enough
 * to compose any orthogonal pipe network on a level.  Routing-grade
 * pipework with diagonal runs and reducers lands in S27.
 */
const PlumbingKind = z.enum(['straight', 'elbow', 'tee']);

export const Plumbing = defineElement('plumbing', {
  levelId: z.string().default(''),
  kind: PlumbingKind.default('straight'),
  /** Origin point in world coordinates. */
  origin: Vec3.default({ x: 0, y: 0, z: 0 }),
  /** Outer diameter, metres. */
  diameter: z.number().positive().default(0.05),
  /** Pipe wall thickness, metres (informational, geometry uses outer). */
  wallThickness: z.number().nonnegative().default(0.005),
  /** Length for `straight`; arm length for `elbow`/`tee`. */
  length: z.number().positive().default(1),
  /** Y-axis rotation, radians. */
  rotation: z.number().default(0),
  /** Bend radius for `elbow`, metres (centre-line). */
  bendRadius: z.number().positive().default(0.075),
  baseOffset: z.number().default(0),
  /** Fluid system tag (e.g. `cold-water`, `waste`). */
  systemTag: z.string().default('cold-water'),
  materialId: z.string().optional(),
});

export type Plumbing = z.infer<typeof Plumbing>;
