// P0.5 Stage-3 (Family Platform) — L0 BuilderRef sub-schema for the
// GeneratedGeometry substrate (Stage-3 geometry synthesis OUTPUT).
//
// A `BuilderRef` is a typed reference to a 3D geometry builder.  The Stage-3
// synthesiser does NOT construct THREE objects (L0 / P5 — schemas are pure).
// Instead it emits a reference that the runtime (L4+) resolves into actual
// geometry at instance-bake time.  This keeps the schema substrate cheap +
// parsing-pure and lets the runtime swap builder implementations without
// re-issuing the L0 contract.
//
// Cross-imports: none outside `@pryzm/schemas` itself.
//
// L0-pure: Zod-only.  No I/O, no THREE, no DOM, no `@pryzm/*` outside the
// `@pryzm/schemas` package.
//
// References:
//   - APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4
//     Stage 3 (Geometry Synthesis — outputs GeneratedGeometry)

import { z } from 'zod';

/**
 * The KIND of a 3D geometry builder.  The runtime dispatches on this
 * discriminant when resolving a `BuilderRef` into actual geometry:
 *
 *   - `parametric`     synthesised from `ParametricFamily.primitives`
 *                      (the common case — Stage-3 emits this when the
 *                      Stage-2 decomposer produced primitives)
 *   - `glb-import`     external GLB file (vendor-supplied family asset)
 *   - `mesh-literal`   inline mesh data (rare; used for tiny fixtures or
 *                      one-offs that don't justify a builder module)
 *   - `composite`      multi-builder composite (e.g. tree trunk + foliage
 *                      from two distinct builders combined at the runtime)
 *
 * Intentionally CLOSED: a Stage-3 synthesiser must reduce its output to one
 * of these four kinds.  Any future kind is a separate schema slice (and a
 * coordinated runtime resolver slice).
 */
export const BuilderKindSchema = z.enum([
    'parametric',
    'glb-import',
    'mesh-literal',
    'composite',
]);
export type BuilderKind = z.infer<typeof BuilderKindSchema>;

/**
 * Typed reference to a 3D geometry builder.  The reference is RESOLVED at
 * L4 composition time (NOT at L0 schema parse time — L0 stays pure).
 *
 *   - `kind`         one of `BuilderKindSchema`
 *   - `modulePath`   ES-module specifier that exports the builder function;
 *                    the runtime imports this lazily at instance-bake time
 *   - `exportName`   name of the exported function within the module
 *   - `builderHash`  stable hash of the builder's input contract — used as
 *                    a cache key so two GeneratedGeometry records that
 *                    share a builder + footprint reuse the baked mesh
 */
export const BuilderRefSchema = z.object({
    kind:        BuilderKindSchema,
    modulePath:  z.string().min(1),
    exportName:  z.string().min(1),
    builderHash: z.string().min(1),
});
export type BuilderRef = z.infer<typeof BuilderRefSchema>;
