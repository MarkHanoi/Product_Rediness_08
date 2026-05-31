// P0.5 Stage-4 (Family Platform) — L0 InstanceSchemaSpec sub-schema for the
// GeneratedSchemas substrate (Stage-4 data-model synthesis OUTPUT).
//
// An `InstanceSchemaSpec` describes the auto-generated INSTANCE-parameter
// shape of a registered family — the typed set of properties that every
// placed instance of the family must conform to.  The Stage-4 synthesiser
// (a later L2+ slice) derives this from the upstream `ParametricFamily`
// (parameter axes) + `GeneratedGeometry` (footprint + builder contract);
// the L4 property panel reads `parameters` to render edit fields and the
// command bus reads it to validate update payloads.
//
// Cross-imports: none outside `@pryzm/schemas` itself.
//
// L0-pure: Zod-only.  No I/O, no THREE, no DOM, no `@pryzm/*` outside the
// `@pryzm/schemas` package.
//
// References:
//   - APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4
//     Stage 4 (Data-Model Synthesis — outputs GeneratedSchemas)

import { z } from 'zod';

/**
 * The Zod-kind of a single instance parameter.  Intentionally CLOSED — the
 * Stage-4 synthesiser must reduce every parameter to one of these five
 * kinds; richer types (e.g. `bigint`, `date`, `nested object`) are out of
 * scope for the substrate and would be a separate slice.
 *
 *   - `number`        finite floating-point (with optional min/max bounds)
 *   - `integer`       integer (with optional min/max bounds)
 *   - `string`        free-form string
 *   - `boolean`       true/false flag
 *   - `enum-string`   string drawn from a closed `enumValues` set
 */
export const InstanceParameterKindSchema = z.enum([
    'number',
    'integer',
    'string',
    'boolean',
    'enum-string',
]);
export type InstanceParameterKind = z.infer<typeof InstanceParameterKindSchema>;

/**
 * A single parameter on the instance schema.
 *
 *   - `name`           the canonical (machine-readable) property name
 *   - `kind`           the Zod-kind discriminant (see above)
 *   - `label`          display label for the property panel
 *   - `description`    OPTIONAL human-facing description / tooltip text
 *   - `defaultValue`   OPTIONAL default; the substrate does NOT cross-check
 *                      the value against `kind` (the Stage-4 synthesiser is
 *                      responsible for that — keeps the schema parse-pure)
 *   - `minNumber`      OPTIONAL lower bound for `number` / `integer` kinds
 *   - `maxNumber`      OPTIONAL upper bound for `number` / `integer` kinds
 *   - `enumValues`     OPTIONAL permitted string set for `enum-string` kind
 *   - `userEditable`   whether the property panel should expose this for
 *                      user edit; defaults to `true` so the common case
 *                      (most parameters ARE user-editable) is the zero-typing
 *                      default.  Set `false` for synthetic / derived fields
 *                      that exist on the instance but are not exposed in UI.
 */
export const InstanceParameterSpecSchema = z.object({
    name:         z.string().min(1),
    kind:         InstanceParameterKindSchema,
    label:        z.string().min(1),
    description:  z.string().optional(),
    defaultValue: z.unknown().optional(),
    minNumber:    z.number().finite().optional(),
    maxNumber:    z.number().finite().optional(),
    enumValues:   z.array(z.string()).optional(),
    userEditable: z.boolean().default(true),
});
export type InstanceParameterSpec = z.infer<typeof InstanceParameterSpecSchema>;

/**
 * The complete instance-parameter schema spec for a family.
 *
 *   - `parameters`   ordered list of parameter specs (may be empty — a
 *                    family with no instance parameters is legitimate; its
 *                    instances are positioned purely by host-coords)
 *   - `specHash`     stable hash of the parameter set; used as a cache key
 *                    so two GeneratedSchemas with the same instance shape
 *                    can reuse a baked validator
 */
export const InstanceSchemaSpecSchema = z.object({
    parameters: z.array(InstanceParameterSpecSchema),
    specHash:   z.string().min(1),
});
export type InstanceSchemaSpec = z.infer<typeof InstanceSchemaSpecSchema>;
