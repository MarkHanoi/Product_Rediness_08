import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { Vec3 } from '../base/primitives.js';

const RoofShape = z.enum(['flat', 'gable', 'hip', 'mono', 'mansard']);

/**
 * Skylight — an opening cut into a pitched roof surface.
 * Added in W-1C-5 (completion-plan §W-1C-5).
 */
export const Skylight = z.object({
  id: z.string().min(1),
  /** Position of the skylight centre, in roof-local XZ coordinates. */
  position: Vec3.default({ x: 0, y: 0, z: 0 }),
  /** Skylight frame width in metres. */
  width: z.number().positive().default(1.0),
  /** Skylight frame depth in metres. */
  depth: z.number().positive().default(0.8),
  /** Frame profile width in metres. */
  frameWidth: z.number().nonnegative().default(0.05),
  materialId: z.string().optional(),
});

export type Skylight = z.infer<typeof Skylight>;

/**
 * Roof — a polygonal upper element. Pitch in radians; 0 means flat.
 */
export const Roof = defineElement('roof', {
  levelId: z.string().default(''),
  boundary: z.array(Vec3).min(3).default([
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 1, y: 0, z: 1 },
    { x: 0, y: 0, z: 1 },
  ]),
  shape: RoofShape.default('flat'),
  /** Roof pitch in radians; must be in [0, π/2). */
  pitch: z.number().min(0).max(Math.PI / 2 - 0.001).default(0),
  /** Eave overhang in metres. */
  overhang: z.number().nonnegative().default(0),
  thickness: z.number().positive().default(0.2),
  materialId: z.string().optional(),
  materialColor: z.string().optional(),
  /** Skylights cut into this roof surface (W-1C-5). */
  skylights: z.array(Skylight).default([]),
  /** IDs of adjacent roofs this roof has been joined to (W-1C-5). */
  joinedToRoofIds: z.array(z.string()).default([]),
}).refine(
  (r) => r.shape !== 'flat' || r.pitch === 0,
  { message: 'Roof with shape="flat" must have pitch=0.' },
);

export type Roof = z.infer<typeof Roof>;
