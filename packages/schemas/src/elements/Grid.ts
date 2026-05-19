import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { Vec3 } from '../base/primitives.js';

const GridLineKind = z.enum(['linear', 'arc']);

const GridLine = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: GridLineKind.default('linear'),
  start: Vec3,
  end: Vec3,
  /** For arc grid lines; radius in metres. Required when kind === 'arc'. */
  radius: z.number().positive().optional(),
});

/**
 * Structural grid — collection of named axes (linear or arc).
 */
export const Grid = defineElement('grid', {
  levelId: z.string().default(''),
  /** Optional rotation about Y in radians. */
  rotation: z.number().default(0),
  lines: z.array(GridLine).default([]),
}).refine(
  (g) => g.lines.every((l) => l.kind !== 'arc' || typeof l.radius === 'number'),
  { message: 'Arc grid lines must define a positive radius.' },
);

export type Grid = z.infer<typeof Grid>;
