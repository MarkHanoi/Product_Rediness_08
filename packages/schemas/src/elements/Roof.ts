import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { RetrofittedProvenanceSchema } from '../provenance/ValueOrigin.js';
import { RetrofittedConfidenceSchema } from '../provenance/ElementConfidence.js';
import { Vec3 } from '../base/primitives.js';

const RoofShape = z.enum(['flat', 'gable', 'hip', 'mono', 'mansard']);

/**
 * Skylight — an opening cut into a pitched roof surface.
 * Added in W-1C-5 (completion-plan §W-1C-5).
 */
export const Skylight = z.object({
  id: z.string().min(1),
  /** Position of the skylight centre, in roof-local XZ coordinates. */
  position: Vec3.default({ x: 0, y: 0, z: 0 }),
  /** Skylight frame width in metres. */
  width: z.number().positive().default(1.0),
  /** Skylight frame depth in metres. */
  depth: z.number().positive().default(0.8),
  /** Frame profile width in metres. */
  frameWidth: z.number().nonnegative().default(0.05),
  materialId: z.string().optional(),
});

export type Skylight = z.infer<typeof Skylight>;

/**
 * Roof — a polygonal upper element. Pitch in radians; 0 means flat.
 */
export const Roof = defineElement('roof', {
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
  boundary: z.array(Vec3).min(3).default([
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 1, y: 0, z: 1 },
    { x: 0, y: 0, z: 1 },
  ]),
  shape: RoofShape.default('flat'),
  /** Roof pitch in radians; must be in [0, π/2). */
  pitch: z.number().min(0).max(Math.PI / 2 - 0.001).default(0),
  /** Eave overhang in metres. */
  overhang: z.number().nonnegative().default(0),
  thickness: z.number().positive().default(0.2),
  materialId: z.string().optional(),
  materialColor: z.string().optional(),
  /** Skylights cut into this roof surface (W-1C-5). */
  skylights: z.array(Skylight).default([]),
  /** IDs of adjacent roofs this roof has been joined to (W-1C-5). */
  joinedToRoofIds: z.array(z.string()).default([]),
  /**
   * §ROOF-BOUNDING-WALLS — the walls whose centrelines produced this roof's
   * boundary, when it was created BY REGION. Closes the L0 half of the C79 §6.3
   * named storage gap (owner `@pryzm/geometry-roof`).
   *
   * WHY THIS EXISTS: `RoofRegionTrace.traceRoofRegionAtPoint` already attributes
   * every traced ring edge to the wall that produced it — by construction, never
   * by proximity — and already returns `attribution.hostWallIds`. That reference
   * was never missing; it was DISCARDED, because this schema declared no field it
   * could occupy and Zod's default `strip` mode deleted it in transit while
   * `parse()` reported success. A roof could not follow its walls for want of a
   * FIELD, not for want of a wire.
   *
   * SHAPE mirrors the one proven L0 precedent, `Room.boundingWallIds`
   * (`Room.ts`), down to the uniqueness refinement below — with exactly ONE
   * deliberate deviation: `.optional()`, not `.default([])`.
   *
   * ⚠ THE DEVIATION IS FORCED, NOT STYLISTIC. C79 §7.1 — quoted at
   * `RoofRegionTrace.ts` — names an unpopulated `boundingWallIds: []` on a roof
   * as the anti-pattern BY NAME ("writing a field the model cannot honour"), and
   * ADR-0299 / §CONTEXT-DATA-HONESTY requires that a refusal and an empty result
   * not collapse to the same value. `Room` may default to `[]` because its
   * producer repopulates it on every rebuild; a roof may not, because roofs drawn
   * by rectangle or polyline are NEVER region-traced, and a defaulted `[]` would
   * assert of every one of them that it was traced and bounded nothing.
   *
   *   absent  → never attributed (drawn by rectangle/polyline, or predates this field)
   *   `[]`    → traced, and attributed to no wall
   *
   * Those are different facts. Keep them different values.
   *
   * ADDITIVE-OPTIONAL is also what preserves snapshot v3: a roof written before
   * this field existed parses unchanged and lands on `undefined` — never on `[]`.
   */
  boundingWallIds: z.array(z.string().min(1)).optional(),
}).refine(
  (r) => r.shape !== 'flat' || r.pitch === 0,
  { message: 'Roof with shape="flat" must have pitch=0.' },
).refine(
  (r) => r.boundingWallIds === undefined
    || new Set(r.boundingWallIds).size === r.boundingWallIds.length,
  { message: 'Roof boundingWallIds must be unique (do not list a wall twice).' },
);

export type Roof = z.infer<typeof Roof>;
