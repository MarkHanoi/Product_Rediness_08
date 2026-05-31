// P0.5 Stage-3 (Family Platform) — L0 PlanSymbolRef sub-schema for the
// GeneratedGeometry substrate (Stage-3 geometry synthesis OUTPUT).
//
// A `PlanSymbolRef` is a typed reference to the 2D plan-symbol builder —
// the TOP-DOWN representation of the family used in plan views, the
// schedule, and the auto-furnishing pipeline's bird's-eye footprint
// renderer.  As with `BuilderRef`, the schema carries a reference; the
// runtime (L4+) resolves it into an actual SVG / Canvas2D draw call at
// view-bake time.
//
// Cross-imports: none outside `@pryzm/schemas` itself.
//
// L0-pure: Zod-only.  No I/O, no THREE, no DOM, no `@pryzm/*` outside the
// `@pryzm/schemas` package.
//
// References:
//   - APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4
//     Stage 3 (Geometry Synthesis — outputs GeneratedGeometry, including
//     a 2D plan symbol alongside the 3D builder)

import { z } from 'zod';

/**
 * The KIND of a 2D plan symbol builder.  The runtime dispatches on this
 * discriminant when resolving a `PlanSymbolRef` into actual 2D geometry:
 *
 *   - `parametric`   synthesised from the family's primitives (top-down
 *                    projection of the 3D parametric form)
 *   - `svg-literal`  inline SVG path string (vendor-supplied symbol)
 *   - `composite`    multi-symbol composite (e.g. a sink within a vanity)
 *
 * Intentionally CLOSED — see `BuilderKindSchema` for the rationale.
 */
export const PlanSymbolKindSchema = z.enum([
    'parametric',
    'svg-literal',
    'composite',
]);
export type PlanSymbolKind = z.infer<typeof PlanSymbolKindSchema>;

/**
 * Typed reference to a 2D plan-symbol builder.  As with `BuilderRef`, the
 * reference is resolved at L4+ time.
 *
 *   - `kind`         one of `PlanSymbolKindSchema`
 *   - `modulePath`   ES-module specifier that exports the symbol builder
 *   - `exportName`   exported function name within the module
 *   - `bboxMinX`     min X of the symbol's bounding rect in family-LOCAL
 *                    coordinates (metres); MAY be negative — the family's
 *                    local origin is at its centroid, not its corner
 *   - `bboxMinY`     min Y of the symbol's bounding rect (metres)
 *   - `bboxMaxX`     max X of the symbol's bounding rect (metres)
 *   - `bboxMaxY`     max Y of the symbol's bounding rect (metres)
 */
export const PlanSymbolRefSchema = z.object({
    kind:       PlanSymbolKindSchema,
    modulePath: z.string().min(1),
    exportName: z.string().min(1),
    bboxMinX:   z.number(),
    bboxMinY:   z.number(),
    bboxMaxX:   z.number(),
    bboxMaxY:   z.number(),
});
export type PlanSymbolRef = z.infer<typeof PlanSymbolRefSchema>;
