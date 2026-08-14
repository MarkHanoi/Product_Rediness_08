import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { RetrofittedProvenanceSchema } from '../provenance/ValueOrigin.js';
import { RetrofittedConfidenceSchema } from '../provenance/ElementConfidence.js';
import { Vec3 } from '../base/primitives.js';

/**
 * Floor — an applied floor FINISH: a horizontal element bounded by a closed
 * polygon whose top face is the Finished Floor Level (FFL), with the body
 * extending DOWNWARD by its thickness. The exact mirror of {@link Ceiling}.
 *
 * ─── WHY THIS SCHEMA EXISTS (C75 §5, the decision written down) ──────────────
 * `check-provenance-coverage`'s C2 arm reported, from 2026-08-12 to 2026-08-14,
 * the INVERSE of a missing provenance field: `FloorDetectionMethod` exists at
 * `packages/core-app-model/src/stores/FloorTypes.ts:58` — a five-member element
 * family provenance vocabulary — while `packages/schemas/src/elements` had **no
 * `defineElement('floor')` at all**. A kind the L0 layer cannot name can never
 * carry provenance there.
 *
 * C75 §5 permits arguing a kind OUT of scope, in writing on the gate's ledger.
 * `floor` is **not** argued out, and the evidence is that it is a first-class
 * element everywhere except here:
 *
 *  1. `FloorData extends CoreElement` with `type: 'floor'`, its own store
 *     (`FloorStore`), its own tool, its own commands — it is not a view of
 *     something else.
 *  2. `'floor'` was ALREADY in L0's `ElementType` union and `FloorId = Id<'floor'>`
 *     already existed (`types/Id.ts`). The id and type system admitted floors; only
 *     the schema was missing, which is what made the hole easy to miss.
 *  3. It is **not** a duplicate of `slab`. `FloorTypes.ts` states the split at the
 *     top: a finish is `IfcCovering { PredefinedType = FLOORING }`; *"structural
 *     slabs remain as IfcSlab."* Two IFC classes, two elements.
 *  4. Its twin already has a schema. `ceiling` — same five-member detection
 *     vocabulary, same polygon-plus-thickness boundary, mirrored geometry — has
 *     carried `defineElement('ceiling')` all along. The asymmetry was the anomaly.
 *  5. `FloorDetectionMethod`'s own members settle it: `ai-generated` is INFERRED
 *     and `ifc-import` is OBSERVED — precisely the cases C75 §0.1 says a user must
 *     be able to tell apart from their own work.
 *
 * ─── WHAT THIS SCHEMA DELIBERATELY DOES NOT CARRY ───────────────────────────
 * No `detectionMethod` field. The legacy vocabulary is TRANSLATED into the
 * canonical five by `provenance/DetectionMethodOrigin.ts` (PV-08), not copied
 * onto the element — a sixth declaration of that union is the C75 §1.2 defect,
 * and the honest UNKNOWN default this kind needs lives in `provenance` below.
 *
 * ⚠ Like `Ceiling`, this is the CANONICAL L0 declaration, not a re-typing of the
 * store DTO: `FloorData` in `core-app-model` is far richer (layers, slope, service
 * holes, underfloor heating, IFC psets). Converging the two is an element-type
 * migration (C65/C03) and is not attempted here; nothing parses a `FloorData`
 * with this schema today.
 */
export const Floor = defineElement('floor', {
  /**
   * PV-04 / C75 §2.4 — where this element's values came from: one of the five
   * (`ValueOrigin.ts`, which owns the vocabulary and is never restated here),
   * or an explicit unknown carrying its reason.
   *
   * ⚠ `RetrofittedProvenanceSchema`, spelled out here rather than spread from a
   * shared constant or folded into `BaseNodeShape`, and that is deliberate twice
   * over. C75 §2.5 requires optional-with-an-UNKNOWN-default so a record written
   * before this field existed parses unchanged and lands on `predates-provenance`
   * — never on a member of the five (§2.1 and §2.5 are the same rule). And
   * `check-provenance-coverage` measures the file that declares
   * `defineElement('<kind>')`: an indirection hides the field from the C3
   * retrofit-safety arm, so coverage you cannot see at the point of use is the
   * §4.d defect in a new place.
   */
  provenance: RetrofittedProvenanceSchema,
  /**
   * PV-06 / C75 §1.3 — how much this element's values can be TRUSTED. A separate
   * axis from `provenance`: that says where a value came from, this says how sure
   * we are of it, and C75 §1.2 forbids merging axes.
   *
   * ⚠ `RetrofittedConfidenceSchema`, spelled out at every kind for the same
   * measured reason as above. Optional with an UNKNOWN-with-reason default, so a
   * record written before this field existed lands on `pending-implementation` —
   * never on a tier, never on `score: 0`.
   *
   * The vocabulary is C62's (`site/metadata/DataConfidence.ts`, ADR-0280),
   * REUSED not reinvented: PV-06 says C62 owns confidence (§4.h).
   */
  confidence: RetrofittedConfidenceSchema,
  levelId: z.string().default(''),
  boundary: z.array(Vec3).min(3).default([
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 1, y: 0, z: 1 },
    { x: 0, y: 0, z: 1 },
  ]),
  /**
   * FFL offset above the level datum, in metres — the TOP face. The body extends
   * DOWNWARD from here by `thickness` (`FloorTypes.ts`'s geometry invariant, the
   * inverse of a ceiling's).
   */
  baseOffset: z.number().min(0).default(0),
  /**
   * Total assembly thickness, in metres. Defaults to 15 mm — tile / engineered
   * timber — matching `DEFAULT_FINISH_THICKNESS_M` in `FloorTypes.ts`.
   */
  thickness: z.number().positive().default(0.015),
  materialId: z.string().optional(),
  materialColor: z.string().optional(),
});

export type Floor = z.infer<typeof Floor>;
