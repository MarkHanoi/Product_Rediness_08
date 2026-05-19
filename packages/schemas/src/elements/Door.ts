import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { idRef } from '../base/refs.js';
import { createId } from '../factory/createId.js';

/**
 * Door — hosted by a wall opening. Width/height in metres.
 *
 * `wallId` is brand-typed via `idRef('wall')` so cross-store references are
 * compile-time-safe (cannot pass a `SlabId` where a `WallId` is required).
 */
export const Door = defineElement('door', {
  /** Host wall id — branded `WallId`, validated to the canonical `wall_<ulid>` shape. */
  wallId: idRef('wall').default(() => createId('wall')),
  /** Opening id within the host wall. */
  openingId: z.string().default(''),
  doorType: z.enum(['single', 'double']).default('single'),
  width: z.number().positive().default(0.9),
  height: z.number().positive().default(2.1),
  sillHeight: z.number().nonnegative().default(0),
  /** Distance along the wall baseline from start, in metres. */
  offset: z.number().nonnegative().default(0),
  frameThickness: z.number().nonnegative().default(0.05),
  frameWidth: z.number().nonnegative().default(0.05),
  frameColor: z.string().optional(),
  leafColor: z.string().optional(),
  fireRating: z.string().optional(),
  accessibilityType: z.string().optional(),
  /** Swing direction — which side the door is hinged and which way it opens.
   *  TASK-04 (MASTER-IMPL-PLAN-2026-05-18 BUG-3): additive field with backward-compatible
   *  default so all existing door records read as 'left-in'.
   *  Consumed by SetDoorSwingHandler (execute) and DoorCommitter (GEOMETRY_FIELDS). */
  swing: z.enum(['left-in', 'left-out', 'right-in', 'right-out', 'sliding'])
    .optional()
    .default('left-in'),
}).refine(
  (d) => d.frameWidth * 2 <= d.width,
  { message: 'Door frameWidth must not exceed half the leaf width.' },
);

export type Door = z.infer<typeof Door>;
