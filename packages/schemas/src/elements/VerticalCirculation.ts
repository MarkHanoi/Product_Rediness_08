// Residential-building (multi-family) — Slice B / §4.2.
//
// L0 Zod schema for the NEW `verticalCirculation` (lift / elevator) element
// category — the building's vertical-circulation core's lift half, a peer to
// the stair (`Stair.ts`).
//
// L0-PURE (P5): Zod-only. No I/O, no THREE, no DOM, no `@pryzm/*` cross-package
// imports beyond the sibling base/* primitives — exactly as `Stair.ts`.
//
// Contract anchors:
//   - C11 §element-creation (the create command registers + projects this type)
//   - C15 §12 (the lift's LANDING DOORS are hosted openings on the shaft wall;
//             the lift BODY itself is a free element like the stair, not hosted)
//   - IFC mapping: IfcTransportElement (lift) — see file-format export.
//
// Audit/plan: docs/03-execution/plans/RESIDENTIAL-BUILDING-MULTI-FAMILY-AUDIT-AND-PLAN.md §4
// Tracker:    docs/03-execution/plans/RESIDENTIAL-BUILDING-IMPLEMENTATION-TRACKER.md (P1.B)

import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { RetrofittedProvenanceSchema } from '../provenance/ValueOrigin.js';
import { RetrofittedConfidenceSchema } from '../provenance/ElementConfidence.js';
import { Vec3 } from '../base/primitives.js';

/**
 * Lift kind. `passenger` is the default 8-person car; `accessible` is the
 * wheelchair-compliant car (wider, ≥ 1.1 × 1.4 m clear); `goods` is the
 * service/freight lift.
 */
export const LiftKind = z.enum(['passenger', 'accessible', 'goods']);
export type LiftKind = z.infer<typeof LiftKind>;

/**
 * VerticalCirculation — a lift / elevator: a vertical shaft connecting a base
 * level to a top level, carrying a car. The shaft punches a continuous void
 * through every slab it passes (unlike the stair, which only voids the slab
 * above a flight — see plan §4.3).
 *
 * Mirrors the `Stair` schema's shape + the `defineElement` convention exactly.
 */
export const VerticalCirculation = defineElement('verticalCirculation', {
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
  /** Base level the shaft starts on. */
  levelId: z.string().default(''),
  /** Top level the shaft reaches (shaft spans base..top; must differ). */
  topLevelId: z.string().default(''),
  kind: LiftKind.default('passenger'),
  /** Shaft base origin in world coordinates (the shaft's footprint origin). */
  origin: Vec3.default({ x: 0, y: 0, z: 0 }),
  /** Plan-direction angle in radians (about world Y). */
  rotation: z.number().default(0),
  /** Total shaft width in metres (car + structure). */
  shaftWidth: z.number().positive().default(1.8),
  /** Total shaft depth in metres (car + structure). */
  shaftDepth: z.number().positive().default(1.8),
  /** Rated car capacity in persons. */
  carCapacityPersons: z.number().int().positive().default(8),
  /** Landing-door clear width in metres (a C15-hosted opening per level). */
  doorWidth: z.number().positive().default(0.9),
  materialId: z.string().optional(),
}).refine(
  (v) => v.shaftWidth >= v.doorWidth,
  { message: 'Lift shaft width must be at least the landing-door width.' },
);

export type VerticalCirculation = z.infer<typeof VerticalCirculation>;
