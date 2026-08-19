import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { RetrofittedProvenanceSchema } from '../provenance/ValueOrigin.js';
import { RetrofittedConfidenceSchema } from '../provenance/ElementConfidence.js';
import { idRef } from '../base/refs.js';
import { createId } from '../factory/createId.js';

/**
 * Door — hosted by a wall opening. Width/height in metres.
 *
 * `wallId` is brand-typed via `idRef('wall')` so cross-store references are
 * compile-time-safe (cannot pass a `SlabId` where a `WallId` is required).
 */
export const Door = defineElement('door', {
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
  /**
   * PV-06 / C75 §1.3 — how much this element's values can be TRUSTED. A
   * separate axis from `provenance`: that says where a value came from, this
   * says how sure we are of it, and C75 §1.2 forbids merging axes.
   *
   * ⚠ `RetrofittedConfidenceSchema`, spelled out at every kind rather than
   * spread from a shared constant or folded into `BaseNodeShape` — the same
   * instruction `RetrofittedProvenanceSchema` carries above, for the same
   * measured reason. Optional with an UNKNOWN-with-reason default, so a
   * record written before this field existed parses unchanged and lands on
   * `pending-implementation` — never on a tier, never on `score: 0`.
   *
   * The vocabulary is C62's (`site/metadata/DataConfidence.ts`, ADR-0280),
   * REUSED not reinvented: PV-06 says C62 owns confidence (§4.h).
   */
  confidence: RetrofittedConfidenceSchema,
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
  /**
   * ⭐ C100 §2.1 / S17 — THE DOOR'S MATERIAL IDENTITY, one per material surface.
   *
   * C100 §9.1 listed `door` and `window` under *"no `materialId` EXISTS to lose —
   * colour-only in the L0 schema"*, calling it *"C100 §2.1's explicit MUST NOT, for
   * two of the most-used families in the product"*. These two fields close that,
   * and their SHAPE is the part worth reading rather than their presence.
   *
   * ⚠ **Why not one plain `materialId`, which is what 18 sibling schemas carry.**
   * A door does not have *a* material; it has two surfaces made of different things
   * — an aluminium frame around a timber leaf is an ordinary door, not an edge
   * case. A single `materialId` would name half the element and leave the other half
   * to a hex, which is the very loss §2.1 forbids (*"a hex is not a material; it is
   * one attribute of one"*), one level up. The repository has already ruled on this
   * shape: C100 §9.7 examined `mullionMaterialId` / `glazingMaterialId` on the
   * curtain wall and recorded that *"the curtain wall record has no plain
   * `materialId` to write"* — correct, not a defect. This is that ruling applied.
   *
   * ⚠ **These are not a NEW vocabulary.** They are the L0 projection of a pairing
   * the RUNTIME record has carried for months: `DoorTypes.ts`'s
   * `frameFinish.materialId` / `leafFinish.materialId`, written by the property
   * panel's Frame/Leaf Finish dropdowns straight out of the master library. The flat
   * `frameColor` / `leafColor` fields below are, in `DoorTypes.ts`'s own words,
   * *"derived from these for the 3-D renderer"* — so id-beside-hex, per surface, is
   * the arrangement that already exists, now expressed where C03 §1.1 says the
   * canonical schema lives.
   *
   * Per C73 §1 / C100 §2.1 these are **PERSIST-OR-LOSE**; the colours beside them
   * are a **CACHE** except where they carry an explicit user override.
   */
  frameMaterialId: z.string().optional(),
  leafMaterialId: z.string().optional(),
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
