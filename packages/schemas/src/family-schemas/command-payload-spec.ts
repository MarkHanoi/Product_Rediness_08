// P0.5 Stage-4 (Family Platform) — L0 CommandPayloadSpec sub-schemas for the
// GeneratedSchemas substrate (Stage-4 data-model synthesis OUTPUT).
//
// Every registered family gets THREE auto-synthesised command-payload
// schemas — `create`, `update`, and `remove`.  These describe the typed
// payload shape each command requires:
//
//   - `create` needs the full set of required instance parameters
//   - `update` needs an identifier + a parameter diff
//   - `remove` needs only an identifier
//
// The substrate carries the PARAMETER LIST verbatim from the instance
// schema; the runtime command bus (L1) uses it to validate dispatched
// payloads.  The Stage-4 synthesiser (a later L2+ slice) derives all three
// from the upstream `InstanceSchemaSpec` + family identity.
//
// Cross-imports:
//   - `family-schemas/instance-schema-spec.js` → InstanceParameterSpecSchema (L0)
//
// L0-pure: Zod-only.  No I/O, no THREE, no DOM, no `@pryzm/*` outside the
// `@pryzm/schemas` package.
//
// References:
//   - APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4
//     Stage 4 (Data-Model Synthesis — outputs GeneratedSchemas)

import { z } from 'zod';
import { InstanceParameterSpecSchema } from './instance-schema-spec.js';

/**
 * The KIND of an auto-generated family command.  Intentionally CLOSED:
 * every registered family supports exactly these three primitive verbs.
 * Higher-level verbs (clone, mirror, regenerate, …) compose them at L1+
 * and are not modelled at the substrate.
 */
export const CommandKindSchema = z.enum(['create', 'update', 'remove']);
export type CommandKind = z.infer<typeof CommandKindSchema>;

/**
 * One command-payload spec.
 *
 *   - `command`       which of `create` / `update` / `remove` this describes
 *   - `parameters`    the subset of instance parameters the command requires
 *                     (Stage-4 derivation rules: create = all required +
 *                     defaulted; update = id + the editable diff; remove =
 *                     id only).  The substrate carries the list verbatim
 *                     and does NOT cross-check the derivation — that's the
 *                     synthesiser's responsibility.
 *   - `payloadHash`   stable hash of the parameter set + command kind; used
 *                     as a cache key for the per-command validator.
 */
export const CommandPayloadSpecSchema = z.object({
    command:     CommandKindSchema,
    parameters:  z.array(InstanceParameterSpecSchema),
    payloadHash: z.string().min(1),
});
export type CommandPayloadSpec = z.infer<typeof CommandPayloadSpecSchema>;

/**
 * The complete set of command-payload specs for a family.  All three
 * commands MUST be present — there is no notion of a "read-only family" at
 * the substrate layer (the runtime can refuse a dispatched command, but
 * the schema surface always exposes the verb).
 */
export const CommandPayloadSetSchema = z.object({
    create: CommandPayloadSpecSchema,
    update: CommandPayloadSpecSchema,
    remove: CommandPayloadSpecSchema,
});
export type CommandPayloadSet = z.infer<typeof CommandPayloadSetSchema>;
