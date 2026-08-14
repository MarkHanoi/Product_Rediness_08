import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { RetrofittedProvenanceSchema } from '../provenance/ValueOrigin.js';
import { RetrofittedConfidenceSchema } from '../provenance/ElementConfidence.js';
import { Vec3 } from '../base/primitives.js';

/**
 * Plumbing run primitives (S26 / ADR-0023).
 *
 * Only three sub-types in S26 — `straight`, `elbow`, `tee` — enough
 * to compose any orthogonal pipe network on a level.  Routing-grade
 * pipework with diagonal runs and reducers lands in S27.
 */
const PlumbingKind = z.enum(['straight', 'elbow', 'tee']);

export const Plumbing = defineElement('plumbing', {
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
  kind: PlumbingKind.default('straight'),
  /** Origin point in world coordinates. */
  origin: Vec3.default({ x: 0, y: 0, z: 0 }),
  /** Outer diameter, metres. */
  diameter: z.number().positive().default(0.05),
  /** Pipe wall thickness, metres (informational, geometry uses outer). */
  wallThickness: z.number().nonnegative().default(0.005),
  /** Length for `straight`; arm length for `elbow`/`tee`. */
  length: z.number().positive().default(1),
  /** Y-axis rotation, radians. */
  rotation: z.number().default(0),
  /** Bend radius for `elbow`, metres (centre-line). */
  bendRadius: z.number().positive().default(0.075),
  baseOffset: z.number().default(0),
  /** Fluid system tag (e.g. `cold-water`, `waste`). */
  systemTag: z.string().default('cold-water'),
  materialId: z.string().optional(),
});

export type Plumbing = z.infer<typeof Plumbing>;
