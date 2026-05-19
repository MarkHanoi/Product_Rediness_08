import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { idRef } from '../base/refs.js';
import { createId } from '../factory/createId.js';

/**
 * Window — hosted by a wall opening.
 *
 * `wallId` is brand-typed via `idRef('wall')` so cross-store references are
 * compile-time-safe (cannot pass a `SlabId` where a `WallId` is required).
 */
export const Window = defineElement('window', {
  /** Host wall id — branded `WallId`, validated to the canonical `wall_<ulid>` shape. */
  wallId: idRef('wall').default(() => createId('wall')),
  openingId: z.string().default(''),
  windowType: z.enum(['single', 'double']).default('single'),
  width: z.number().positive().default(1.2),
  height: z.number().positive().default(1.2),
  sillHeight: z.number().nonnegative().default(0.9),
  offset: z.number().nonnegative().default(0),
  frameThickness: z.number().nonnegative().default(0.05),
  frameWidth: z.number().nonnegative().default(0.05),
  frameColor: z.string().optional(),
  fireRating: z.string().optional(),
}).refine(
  (w) => w.frameWidth * 2 <= w.width,
  { message: 'Window frameWidth must not exceed half the pane width.' },
);

export type Window = z.infer<typeof Window>;
