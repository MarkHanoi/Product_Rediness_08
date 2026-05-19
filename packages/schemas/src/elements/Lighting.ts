import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { Vec3, ColorRgb } from '../base/primitives.js';

/**
 * Lighting fixtures (S26 / ADR-0023).
 *
 * The kernel producer emits the visible *fixture body* only; the
 * lighting committer attaches a `THREE.PointLight` (or RectAreaLight
 * for `strip`) using the parameters below.
 */
const LightingKind = z.enum([
  'downlight',
  'pendant',
  'strip',
  'wall-sconce',
  'emergency',
]);

export const Lighting = defineElement('lighting', {
  levelId: z.string().default(''),
  kind: LightingKind.default('downlight'),
  /** Mount point in world coordinates (ceiling / wall surface). */
  origin: Vec3.default({ x: 0, y: 0, z: 0 }),
  /** Y-axis rotation in radians. */
  rotation: z.number().default(0),
  /** Fixture body width (X). */
  width: z.number().positive().default(0.2),
  /** Fixture body depth (Z). */
  depth: z.number().positive().default(0.2),
  /** Fixture body thickness (Y). */
  thickness: z.number().positive().default(0.05),
  /** Pendant cable length / wall-sconce stand-off, metres. */
  dropLength: z.number().nonnegative().default(0),
  /** Effective illumination range, metres (PointLight `distance`). */
  range: z.number().nonnegative().default(6),
  /** Lumens, normalised to a THREE intensity value (0..N). */
  intensity: z.number().nonnegative().default(1),
  /** Linear-light color (sRGB 0..1). */
  color: ColorRgb.default([1, 1, 1]),
  /** ISO 50293 emergency override; lights stay on when power flag is false. */
  isEmergency: z.boolean().default(false),
  materialId: z.string().optional(),
});

export type Lighting = z.infer<typeof Lighting>;
