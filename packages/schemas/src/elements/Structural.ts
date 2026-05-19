import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { Vec3 } from '../base/primitives.js';

/**
 * Second-tier structural elements (S26 / ADR-0023).
 *
 * Sub-types share the same DTO; the producer dispatches on `kind`:
 *   - `brace`            — diagonal linear member between two points
 *   - `footing`           — pad footing (rectangular box)
 *   - `foundation-slab`  — thick rectangular pad below grade
 *   - `connection`        — small node at a connection point (sphere/box)
 */
const StructuralKind = z.enum([
  'brace',
  'footing',
  'foundation-slab',
  'connection',
]);

export const Structural = defineElement('structural', {
  levelId: z.string().default(''),
  kind: StructuralKind.default('brace'),
  /** Insertion point in world coordinates (centre / origin). */
  origin: Vec3.default({ x: 0, y: 0, z: 0 }),
  /** Brace endpoint relative to origin (only used by `brace`). */
  endOffset: Vec3.default({ x: 1, y: 0, z: 0 }),
  /** Footprint width (X). */
  width: z.number().positive().default(0.6),
  /** Footprint depth (Z). */
  depth: z.number().positive().default(0.6),
  /** Footprint thickness / member depth (Y). */
  thickness: z.number().positive().default(0.4),
  /** Section / member radius for `brace`. */
  radius: z.number().positive().default(0.06),
  /** Y-axis rotation, radians. */
  rotation: z.number().default(0),
  baseOffset: z.number().default(0),
  materialId: z.string().optional(),
}).refine(
  (s) => s.kind !== 'brace' || (s.endOffset.x !== 0 || s.endOffset.y !== 0 || s.endOffset.z !== 0),
  { message: 'Brace requires non-zero endOffset.' },
);

export type Structural = z.infer<typeof Structural>;
