import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { RetrofittedProvenanceSchema } from '../provenance/ValueOrigin.js';
import { idRef } from '../base/refs.js';
import { createId } from '../factory/createId.js';

/**
 * Window — hosted by a wall opening.
 *
 * `wallId` is brand-typed via `idRef('wall')` so cross-store references are
 * compile-time-safe (cannot pass a `SlabId` where a `WallId` is required).
 */
export const Window = defineElement('window', {
  /**
   * PV-04 / C75 §2.4 — where this element's values came from: one of the five
   * (`ValueOrigin.ts`, which owns the vocabulary and is never restated here),
   * or an explicit unknown carrying its reason.
   *
   * ⚠ `RetrofittedProvenanceSchema`, spelled out at every kind rather than
   * spread from a shared constant or folded into `BaseNodeShape`, and that is
   * deliberate twice over. C75 §2.5 requires optional-with-an-UNKNOWN-default so
   * a snapshot written before this field existed parses unchanged and lands on
   * `predates-provenance` — never on a member of the five (§2.1 and §2.5 are the
   * same rule). And `check-provenance-coverage` measures the file that declares
   * `defineElement('<kind>')`: an indirection hides the field from the C3
   * retrofit-safety arm, so coverage you cannot see at the point of use is the
   * §4.d defect in a new place.
   */
  provenance: RetrofittedProvenanceSchema,
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
