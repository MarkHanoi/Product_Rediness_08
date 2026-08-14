import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { RetrofittedProvenanceSchema } from '../provenance/ValueOrigin.js';
import { RetrofittedConfidenceSchema } from '../provenance/ElementConfidence.js';
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
