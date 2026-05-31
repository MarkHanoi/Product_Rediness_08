// P0.5 slice 0 (Family Platform) — L0 Primitive sub-schema for a
// ParametricFamily (Stage-2 parametric decomposition output).
//
// A `Primitive` is one geometric piece in the parametric composition of a
// family.  Stage-3 geometry synthesis consumes an ordered list of primitives
// and produces the THREE objects; this substrate is the data shape only.
//
// Cross-imports: none outside `@pryzm/schemas` itself.
//
// L0-pure: Zod-only.  No THREE, no I/O, no DOM.
//
// References:
//   - APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4
//     Stage 2 (Parametric Decomposition — outputs ParametricFamily)

import { z } from 'zod';

/**
 * The KIND of a primitive.  Stage-3 synthesis dispatches on this discriminant
 * to pick the appropriate THREE construction path (`BoxGeometry`,
 * `CylinderGeometry`, extrude/sweep/revolve/loft, or a `composite` group of
 * nested primitives).
 *
 * Intentionally CLOSED: a Stage-2 decomposer must reduce arbitrary geometry to
 * one of these seven kinds.  Any future kind is a separate schema slice (and
 * a coordinated synthesiser slice in `family-runtime`).
 */
export const PrimitiveKindSchema = z.enum([
    'box',
    'cylinder',
    'extrusion',
    'sweep',
    'revolve',
    'loft',
    'composite',
]);
export type PrimitiveKind = z.infer<typeof PrimitiveKindSchema>;

/**
 * A 3D point in family-LOCAL coordinates (canonical units: metres).
 *
 * Finite-only: NaN / +Inf / -Inf are rejected — Stage-3 synthesis would
 * produce degenerate geometry from any of those.
 */
export const Vec3Schema = z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    z: z.number().finite(),
});
export type Vec3 = z.infer<typeof Vec3Schema>;

/**
 * Transform applied to the primitive in family-LOCAL coordinates.  The
 * composite primitive applies its transform to all nested primitives
 * recursively (the synthesiser, not this schema, enforces that).
 *
 *   - `translate`   metres along family-local X / Y / Z
 *   - `rotateDeg`   Euler XYZ rotation in DEGREES (the synthesiser converts)
 *   - `scale`       per-axis scale factor (default 1)
 *
 * All three fields default to the identity transform — the most common case
 * is "primitive sits at the family origin with no rotation or scale".
 */
export const PrimitiveTransformSchema = z.object({
    translate: Vec3Schema.default({ x: 0, y: 0, z: 0 }),
    rotateDeg: Vec3Schema.default({ x: 0, y: 0, z: 0 }),
    scale:     Vec3Schema.default({ x: 1, y: 1, z: 1 }),
});
export type PrimitiveTransform = z.infer<typeof PrimitiveTransformSchema>;

/**
 * Reference to a parameter (by NAME) instead of a literal number.  Stage-3
 * synthesis resolves these against `ParametricFamily.parameters[name]` at
 * instance-bake time.
 */
export const ParameterRefSchema = z.object({
    paramName: z.string().min(1),
});
export type ParameterRef = z.infer<typeof ParameterRefSchema>;

/**
 * A dimension value that MAY be either a literal number OR a parameter
 * reference.  Lets the same primitive shape carry both fixed dimensions
 * (e.g. a 0.02 m chamfer) and parameter-driven dimensions (e.g. `width`).
 */
export const ParametricValueSchema = z.union([
    z.number().finite(),
    ParameterRefSchema,
]);
export type ParametricValue = z.infer<typeof ParametricValueSchema>;

/**
 * A geometric primitive in a parametric family.
 *
 *   - `id`            unique id within the family (deterministic build order)
 *   - `kind`          one of `PrimitiveKindSchema`
 *   - `dimensions`    free-form key/value map of primitive-specific dims;
 *                     each value MAY be a literal OR a `ParameterRef`
 *                     (boxWidth, boxDepth, boxHeight, cylinderRadius, …)
 *   - `transform`     family-local placement; defaults to identity
 *   - `materialSlot`  material slot identifier — bound to a material at
 *                     family registration; defaults to `'default'`
 */
export const PrimitiveSchema = z.object({
    id:           z.string().min(1),
    kind:         PrimitiveKindSchema,
    dimensions:   z.record(z.string(), ParametricValueSchema),
    transform:    PrimitiveTransformSchema.default({
        translate: { x: 0, y: 0, z: 0 },
        rotateDeg: { x: 0, y: 0, z: 0 },
        scale:     { x: 1, y: 1, z: 1 },
    }),
    materialSlot: z.string().min(1).default('default'),
});
export type Primitive = z.infer<typeof PrimitiveSchema>;
