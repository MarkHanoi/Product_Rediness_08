// P0.5 slice 0 (Family Platform) — L0 ParametricFamily top-level schema.
//
// The OUTPUT of Stage-2 parametric decomposition: a canonical structured form
// describing a family as an ordered list of primitives plus a set of variable
// axes (parameters).  Stage-3 geometry synthesis consumes a `ParametricFamily`
// and produces THREE objects at instance-bake time.
//
// Cross-imports:
//   - `family-registry/identity.js`           → FamilyIdentitySchema (L0)
//   - `family-parametric/parameter.js`        → ParametricParameterSchema (L0)
//   - `family-parametric/primitive.js`        → PrimitiveSchema           (L0)
//
// L0-pure: Zod-only.  No I/O, no THREE, no DOM, no `@pryzm/*` outside the
// `@pryzm/schemas` package.
//
// References:
//   - APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4
//     Stage 2 (Parametric Decomposition — outputs ParametricFamily)

import { z } from 'zod';
import { FamilyIdentitySchema } from '../family-registry/identity.js';
import { ParametricParameterSchema } from './parameter.js';
import { PrimitiveSchema } from './primitive.js';

/**
 * Top-level ParametricFamily.  The Stage-2 decomposer produces one of these
 * per Stage-1 FamilyDefinition.
 *
 *   - `identity`         carried verbatim from the FamilyDefinition (so a
 *                        ParametricFamily can be cache-keyed independently
 *                        of its definition)
 *   - `parameters`       map of parameter name → descriptor; drives the
 *                        parametric surface area at instance-bake time
 *   - `primitives`       ORDERED list of primitives — order is the
 *                        deterministic build order Stage-3 follows; must be
 *                        non-empty (a family with no primitives has no
 *                        geometry)
 *   - `parametricHash`   stable hash of the canonical form (post-decomposition)
 *                        — cache key shared between the decomposer and
 *                        Stage-3 synthesis
 *   - `decomposedAt`     ISO 8601 timestamp the Stage-2 decomposer ran at
 */
export const ParametricFamilySchema = z.object({
    identity:       FamilyIdentitySchema,
    parameters:     z.record(z.string(), ParametricParameterSchema),
    primitives:     z.array(PrimitiveSchema).min(1),
    parametricHash: z.string().min(1),
    decomposedAt:   z.string().min(1),
});
export type ParametricFamily = z.infer<typeof ParametricFamilySchema>;
