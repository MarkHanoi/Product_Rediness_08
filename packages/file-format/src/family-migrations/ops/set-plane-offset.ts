// Op #20: set-plane-offset — §82.1-PARAMETRIC-DATUM.
//
// STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC §82.1 (*"create a reference plane …
// rename it; DIMENSION TO IT"*) · C110 §2.8 `§TWO-DEFAULT-STORES` · C111 §5.1
// D-9 (*"`referencePlanes` … are inert"*) · C84 EI-6 / EI-9 · spec §75.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⭐ THE ACT THIS OP PERFORMS: *"put this datum `Height` above the origin"* —
//    the parametric DIMENSION that positions a reference plane. It is the half
//    of §82.1 that `add-reference-plane` and `rename-reference-plane` could not
//    reach: those two put a NAMED datum in the document, and a datum whose
//    position no parameter can change is a label, not a reference plane.
// ═══════════════════════════════════════════════════════════════════════════
//
// ─── WHY AN EXPRESSION AND NOT A NUMBER ────────────────────────────────────
// A number beside the geometry is exactly what the founder's requirement is
// NOT. The Revit semantic is: geometry is locked to planes, planes are
// positioned by PARAMETRIC dimensions, so changing a parameter moves the plane
// and the geometry follows. A literal `origin` cannot participate in that
// chain because no parameter can reach it. `offsetExpression` is read by
// `bakeFamilyInstance` against the SAME resolved parameter scope every profile
// coordinate and every `lengthExpression` is read against — so `Height` here
// and `Height` there are one value, resolved once, by the ONE engine.
//
// ─── ONE POSITION, NOT TWO (C110 §2.8 · C84 EI-9) ──────────────────────────
// `ReferencePlaneSchema` now has two fields that could be read as "where is
// this plane": the v1 literal `origin` and this expression. They are NOT two
// answers — `origin` is still not applied by any evaluator (there is no
// per-solid transform in the schema) and `set-extrude-work-plane` refuses a
// non-zero one outright. This op therefore REFUSES an expression on a plane
// whose origin is not the model origin, rather than accepting a document that
// states a position twice and states it wrongly once. The bake refuses the
// same pair a second time; that duplication is deliberate, because a
// hand-written document never passes through this op.
//
// ─── WHAT IT DOES NOT DO, DECLARED (C84 EI-6) ──────────────────────────────
//   • ⛔ It does not validate the EXPRESSION. `@pryzm/file-format` does not
//     depend on `@pryzm/family-runtime` and this lane mints no second parser
//     (C110 §4 standing review rule: PRYZM has an expression engine; no lane
//     may propose a new one). An unparseable expression is refused where it is
//     evaluated — at the bake, in the engine's own words — and the definition
//     workspace previews it live before the author commits. What IS checked
//     here is what a string-shape check can honestly check: that the string is
//     not blank.
//   • ⛔ It does not measure from another PLANE. The offset is from the model
//     origin along this plane's own normal. Plane-to-plane dimensioning needs
//     a datum graph with its own cycle detection, and C110 §4.3's Kahn sort is
//     over parameters, not planes.
//   • ⛔ It does not reorient or delete. `add-reference-plane`'s header rules
//     that a plane already carrying profiles cannot be reoriented without
//     deciding what happens to that geometry. MOVING a plane along its own
//     normal is the one change that decision does not gate: the profiles stay
//     in the plane, and moving with it is precisely what the author asked for.
//
// ⭐ CLEARING IS THE SAME OP (`offsetExpression: null`). `introduce-expression`
//    shipped without its pair and made every formula write-once — the defect
//    `delete-expression` exists to repair. One `set-*` verb with a nullable
//    argument cannot repeat it, and matches `set-box-dimensions` /
//    `set-type-values` rather than minting a second verb for one field.

import type { FamilyDocument, ReferencePlane } from '../../family-schema.js';
import type { Migrator, RawFamily } from '../types.js';

export interface SetPlaneOffsetParams {
  /** The `plane_` id of an EXISTING reference plane. */
  readonly planeId: string;
  /**
   * Signed offset along the plane's `normal`, in RUNTIME length units, as an
   * expression over the definition's parameters (`Height`, `Sill + 50`, `900`).
   * `null` CLEARS the dimension and returns the plane to an undimensioned datum.
   */
  readonly offsetExpression: string | null;
}

/** Below this a plane origin counts as the model origin. Metres: 1 µm, far
 *  under any authored datum offset. Copied from `set-extrude-work-plane`'s
 *  `ORIGIN_EPS` deliberately — it is the SAME question ("is this plane at the
 *  model origin?") and the two must not answer it differently. */
const ORIGIN_EPS = 1e-6;

/** Same scale the kernel and the bake use to ask "does this vector have length
 *  at all"; a component of a unit vector is dimensionless. */
const ZERO_EPS = 1e-9;

export function makeSetPlaneOffsetMigrator(
  from: string,
  to: string,
  params: SetPlaneOffsetParams,
): Migrator {
  return {
    id: `set-plane-offset:${params.planeId}`,
    from,
    to,
    description:
      params.offsetExpression === null
        ? `clear the parametric offset of plane ${params.planeId}`
        : `dimension plane ${params.planeId} to "${params.offsetExpression}"`,
    apply(input: RawFamily): RawFamily {
      const doc = input.document;

      const plane = doc.referencePlanes.find((pl) => pl.id === params.planeId);
      if (!plane) {
        throw new Error(
          `reference plane ${params.planeId} is not carried by this definition; a datum that is not ` +
            'there cannot be dimensioned',
        );
      }

      const expr = params.offsetExpression;

      if (expr !== null) {
        if (expr.trim() === '') {
          throw new Error(
            `the offset for plane ${plane.name} (${plane.id}) is blank. A blank expression is not a ` +
              'dimension of zero — pass null to CLEAR the dimension and say so.',
          );
        }

        const { x, y, z } = plane.normal;
        if (![x, y, z].every((c) => Number.isFinite(c))) {
          throw new Error(
            `reference plane ${plane.name} (${plane.id}) has a non-finite normal (${x}, ${y}, ${z}); ` +
              'it names no direction to measure the offset along',
          );
        }
        if (Math.hypot(x, y, z) < ZERO_EPS) {
          throw new Error(
            `reference plane ${plane.name} (${plane.id}) has a zero-length normal, so it names no ` +
              'direction to offset along. Refused rather than defaulting to +Y (spec §75) — a plane ' +
              'whose orientation is unstated is not a plane that happens to be horizontal.',
          );
        }

        if (
          Math.abs(plane.origin.x) > ORIGIN_EPS ||
          Math.abs(plane.origin.y) > ORIGIN_EPS ||
          Math.abs(plane.origin.z) > ORIGIN_EPS
        ) {
          throw new Error(
            `reference plane ${plane.name} (${plane.id}) already carries a literal origin ` +
              `(${plane.origin.x}, ${plane.origin.y}, ${plane.origin.z}), and a parametric offset ` +
              'would be a SECOND statement of where the plane is. The literal origin is applied by no ' +
              'evaluator (there is no per-solid transform in the schema) while the offset IS applied, ' +
              'so accepting both would make the document mean one thing and the geometry another. ' +
              'Return the origin to (0, 0, 0) and dimension the plane instead.',
          );
        }
      }

      const next: ReferencePlane =
        expr === null
          // ⭐ The key is DELETED, not set to null: `offsetExpression` is
          //    `.optional()` and ABSENT is its "no dimension" value, so a
          //    cleared plane re-packs byte-identically to one that never
          //    carried a dimension (C111 §5.4-a).
          ? stripOffset(plane)
          : { ...plane, offsetExpression: expr };

      return {
        manifest: { ...input.manifest },
        document: {
          ...doc,
          formatVersion: to,
          referencePlanes: doc.referencePlanes.map((pl) => (pl.id === next.id ? next : pl)),
        } as FamilyDocument,
        ifcMapping: input.ifcMapping,
        events: input.events,
      };
    },
  };
}

function stripOffset(plane: ReferencePlane): ReferencePlane {
  const { offsetExpression: _dropped, ...rest } = plane;
  return rest as ReferencePlane;
}
