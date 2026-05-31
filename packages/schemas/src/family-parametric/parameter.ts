// P0.5 slice 0 (Family Platform) — L0 Parameter sub-schema for a
// ParametricFamily.
//
// A `ParametricParameter` is one VARIABLE AXIS of a parametric family.  Stage-3
// instance-bake time samples a value from each parameter's `range`, optionally
// constrained by an inter-parameter `constraint` expression.  The constraint
// DSL is parsed by `@pryzm/family-runtime` (a later slice); this substrate
// only carries the string verbatim.
//
// Cross-imports:
//   - `family-request/geometry.js` → ParametricRangeSchema  (both L0)
//
// L0-pure: Zod-only.
//
// References:
//   - APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4
//     Stage 2 (Parametric Decomposition — promotes ParametricRange to a
//     first-class parameter)

import { z } from 'zod';
import { ParametricRangeSchema } from '../family-request/geometry.js';

/**
 * A first-class parameter on a parametric family.
 *
 *   - `range`       the named range (unit + min/max + default) — promoted
 *                   verbatim from a Stage-1 FamilyRequest.parametricRange
 *   - `constraint`  OPTIONAL inter-parameter constraint expression, e.g.
 *                   `"depth >= width / 2"`.  Parsed by
 *                   `@pryzm/family-runtime` at instance-bake time; this
 *                   schema does NOT validate the DSL — the substrate is the
 *                   contract surface only.
 */
export const ParametricParameterSchema = z.object({
    range:      ParametricRangeSchema,
    constraint: z.string().optional(),
});
export type ParametricParameter = z.infer<typeof ParametricParameterSchema>;
