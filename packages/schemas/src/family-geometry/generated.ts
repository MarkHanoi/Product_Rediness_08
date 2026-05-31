// P0.5 Stage-3 (Family Platform) — L0 GeneratedGeometry top-level schema.
//
// The OUTPUT of Stage-3 geometry synthesis: a typed bundle of (3D builder
// reference + 2D plan-symbol reference + placement footprint) plus the
// identity copied verbatim from the upstream `ParametricFamily`.  Stages 4-5
// (registration + RegisteredFamily emission) consume a `GeneratedGeometry`
// as one of their inputs; the apartment-layout + D-FLE engines consume the
// `footprint` block to place an instance.
//
// Cross-imports:
//   - `family-registry/identity.js`         → FamilyIdentitySchema   (L0)
//   - `family-geometry/builder-ref.js`      → BuilderRefSchema       (L0)
//   - `family-geometry/plan-symbol-ref.js`  → PlanSymbolRefSchema    (L0)
//   - `family-geometry/footprint.js`        → FootprintSchema        (L0)
//
// L0-pure: Zod-only.  No I/O, no THREE, no DOM, no `@pryzm/*` outside the
// `@pryzm/schemas` package.
//
// References:
//   - APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4
//     Stage 3 (Geometry Synthesis — outputs GeneratedGeometry)

import { z } from 'zod';
import { FamilyIdentitySchema } from '../family-registry/identity.js';
import { BuilderRefSchema } from './builder-ref.js';
import { PlanSymbolRefSchema } from './plan-symbol-ref.js';
import { FootprintSchema } from './footprint.js';

/**
 * Top-level GeneratedGeometry — the OUTPUT TYPE of Stage-3 synthesis.
 *
 *   - `identity`        copied verbatim from the upstream `ParametricFamily`
 *                       (Stage-2 output) so a GeneratedGeometry can be
 *                       cache-keyed independently of the parametric form
 *   - `builder`         3D builder reference (resolved at L4+ time)
 *   - `planSymbol`      2D plan-symbol reference (resolved at L4+ time)
 *   - `footprint`       placement-footprint metadata used by the apartment-
 *                       layout + D-FLE auto-furnishing pipelines
 *   - `geometryHash`    stable hash of the synthesised contract (typically
 *                       derived from `builder.builderHash` + the plan
 *                       symbol's module/exportName + the footprint
 *                       dimensions); cache key shared between the
 *                       synthesiser and downstream registration
 *   - `synthesisedAt`   ISO 8601 timestamp the Stage-3 synthesiser ran at
 */
export const GeneratedGeometrySchema = z.object({
    identity:      FamilyIdentitySchema,
    builder:       BuilderRefSchema,
    planSymbol:    PlanSymbolRefSchema,
    footprint:     FootprintSchema,
    geometryHash:  z.string().min(1),
    synthesisedAt: z.string().min(1),
});
export type GeneratedGeometry = z.infer<typeof GeneratedGeometrySchema>;
