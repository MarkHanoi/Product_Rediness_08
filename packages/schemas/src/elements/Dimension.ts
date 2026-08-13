import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { RetrofittedProvenanceSchema } from '../provenance/ValueOrigin.js';
import { Vec3 } from '../base/primitives.js';

const DimensionKind = z.enum([
  'linear',
  'angular',
  'radial',
  'diameter',
  'spot-elevation',
  'slope',
]);

const DimensionUnits = z.enum(['mm', 'cm', 'm', 'in', 'ft']);

/**
 * Dimension style — drives arrowhead and tick rendering on the dim line.
 *
 * - `architectural` — closed-arrow heads (default for floor plans).
 * - `engineering`  — slash ticks (rotated 60° hash on the dim line).
 * - `custom`       — caller-supplied via material id; producer leaves
 *                    the body bounds correct but emits no arrowheads.
 */
const DimensionStyle = z.enum(['architectural', 'engineering', 'custom']);

/**
 * Dimension — measurement annotation on a view.
 *
 * S29 / `code-level ADR docs/02-decisions/adrs/0028-plan-view-canvas-architecture.md`.
 *
 * `levelId` is the **primary** anchor — every dimension belongs to one level
 * (the plan-view skeleton filters by `levelId === activeLevel`).  `viewId`
 * stays optional so sheet-mounted dims can keep their view binding alongside
 * the level scope without a discriminator change.
 */
export const Dimension = defineElement('dimension', {
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
  /** The level this dimension belongs to.  Plan view filters by this field. */
  levelId: z.string().default(''),
  /** Optional view binding for sheet-mounted dimensions (S33+). */
  viewId: z.string().default(''),
  kind: DimensionKind.default('linear'),
  /** Reference points (≥ 2 for linear; 3 for angular; 1+ for spot). */
  points: z.array(Vec3).min(1).default([
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
  ]),
  /** Witness-line offset in millimetres at sheet scale. */
  offsetMm: z.number().default(8),
  units: DimensionUnits.default('mm'),
  /** Decimal places to display. */
  precision: z.number().int().min(0).max(6).default(0),
  /** Arrowhead / tick style for the dimension line. */
  style: DimensionStyle.default('architectural'),
  /** When true, the value is overridden by `overrideText`. */
  overridden: z.boolean().default(false),
  overrideText: z.string().optional(),
}).refine(
  (d) => {
    if (d.kind === 'linear') return d.points.length >= 2;
    if (d.kind === 'angular') return d.points.length >= 3;
    return d.points.length >= 1;
  },
  { message: 'Insufficient reference points for dimension kind.' },
);

export type Dimension = z.infer<typeof Dimension>;
