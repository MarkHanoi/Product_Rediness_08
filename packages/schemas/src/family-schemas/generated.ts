// P0.5 Stage-4 (Family Platform) — L0 GeneratedSchemas top-level schema.
//
// The OUTPUT of Stage-4 data-model synthesis: a typed bundle of the
// auto-generated instance-parameter schema spec + the three auto-generated
// command-payload specs, plus the identity copied verbatim from the
// upstream `ParametricFamily` / `GeneratedGeometry`.  Stage-5 (registration
// → RegisteredFamily emission) consumes a `GeneratedSchemas` to populate
// the runtime's per-family validator surface.
//
// Cross-imports:
//   - `family-registry/identity.js`             → FamilyIdentitySchema      (L0)
//   - `family-schemas/instance-schema-spec.js`  → InstanceSchemaSpecSchema  (L0)
//   - `family-schemas/command-payload-spec.js`  → CommandPayloadSetSchema   (L0)
//
// L0-pure: Zod-only.  No I/O, no THREE, no DOM, no `@pryzm/*` outside the
// `@pryzm/schemas` package.
//
// References:
//   - APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4
//     Stage 4 (Data-Model Synthesis — outputs GeneratedSchemas)

import { z } from 'zod';
import { FamilyIdentitySchema } from '../family-registry/identity.js';
import { InstanceSchemaSpecSchema } from './instance-schema-spec.js';
import { CommandPayloadSetSchema } from './command-payload-spec.js';

/**
 * Top-level GeneratedSchemas — the OUTPUT TYPE of Stage-4 synthesis.
 *
 *   - `identity`         copied verbatim from the upstream ParametricFamily
 *                        / GeneratedGeometry so a GeneratedSchemas can be
 *                        cache-keyed independently of the geometry bundle
 *   - `instanceSchema`   auto-generated instance-parameter schema spec
 *                        (drives the property panel + update payloads)
 *   - `commandPayloads`  auto-generated create / update / remove payload
 *                        specs (drives the command bus's per-family validators)
 *   - `schemasHash`      stable hash of the full Stage-4 output; typically
 *                        derived from `instanceSchema.specHash` + the three
 *                        `commandPayloads.*.payloadHash` values + identity
 *   - `synthesisedAt`    ISO 8601 timestamp the Stage-4 synthesiser ran at
 */
export const GeneratedSchemasSchema = z.object({
    identity:        FamilyIdentitySchema,
    instanceSchema:  InstanceSchemaSpecSchema,
    commandPayloads: CommandPayloadSetSchema,
    schemasHash:     z.string().min(1),
    synthesisedAt:   z.string().min(1),
});
export type GeneratedSchemas = z.infer<typeof GeneratedSchemasSchema>;
