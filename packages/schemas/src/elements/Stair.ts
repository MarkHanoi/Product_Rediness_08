import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { RetrofittedProvenanceSchema } from '../provenance/ValueOrigin.js';
import { RetrofittedConfidenceSchema } from '../provenance/ElementConfidence.js';
import { Vec3 } from '../base/primitives.js';

const StairShape = z.enum(['straight', 'l-shape', 'u-shape', 'spiral']);

/**
 * Stair — single-flight or multi-flight assembly between two levels.
 */
export const Stair = defineElement('stair', {
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
  levelId: z.string().default(''),
  /** Top level the stair lands on (must differ from `levelId`). */
  topLevelId: z.string().default(''),
  shape: StairShape.default('straight'),
  /** Stair start position in world coordinates. */
  origin: Vec3.default({ x: 0, y: 0, z: 0 }),
  /** Plan-direction angle in radians (about world Y). */
  rotation: z.number().default(0),
  /** Tread depth (run) in metres. */
  treadDepth: z.number().positive().default(0.28),
  /** Riser height in metres. */
  riserHeight: z.number().positive().default(0.18),
  /** Total horizontal stair width in metres. */
  width: z.number().positive().default(1.0),
  /** Number of risers. */
  numRisers: z.number().int().positive().default(15),
  materialId: z.string().optional(),
}).refine(
  (s) => s.numRisers >= 2,
  { message: 'Stair must have at least 2 risers (a single step is a slab edge, not a stair).' },
);

export type Stair = z.infer<typeof Stair>;
