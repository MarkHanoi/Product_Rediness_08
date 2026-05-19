import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { Vec3 } from '../base/primitives.js';

const PanelKind = z.enum(['glazed', 'spandrel', 'door', 'opaque']);

/**
 * Curtain wall — an extruded grid of mullions and panels along a baseline.
 */
const PanelRotation = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);

const CurtainPanel = z.object({
  id: z.string().min(1),
  row: z.number().int().nonnegative(),
  col: z.number().int().nonnegative(),
  kind: PanelKind.default('glazed'),
  materialId: z.string().optional(),
  /** Per-panel rotation in degrees (0/90/180/270). Mainly relevant
   *  for asymmetric panel kinds (e.g. door swing). Default 0. */
  rotation: PanelRotation.default(0),
});

export const CurtainWall = defineElement('curtainwall', {
  levelId: z.string().default(''),
  baseLine: z.tuple([Vec3, Vec3]).default([
    { x: 0, y: 0, z: 0 },
    { x: 4, y: 0, z: 0 },
  ]),
  height: z.number().positive().default(3),
  /** Mullion thickness in metres. */
  mullionThickness: z.number().positive().default(0.05),
  /** Panel grid: vertical mullion spacing in metres. */
  bayWidth: z.number().positive().default(1.2),
  /** Panel grid: horizontal transom spacing in metres. */
  bayHeight: z.number().positive().default(1.5),
  panels: z.array(CurtainPanel).default([]),
  materialId: z.string().optional(),
}).refine(
  (cw) => new Set(cw.panels.map((p) => p.id)).size === cw.panels.length,
  { message: 'CurtainWall panel ids must be unique within a single curtain wall.' },
);

export type CurtainWall = z.infer<typeof CurtainWall>;
