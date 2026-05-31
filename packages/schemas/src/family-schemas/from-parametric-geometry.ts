// P0.5 Stage-4 (Family Platform) — pure synthesiser that transforms a
// `ParametricFamily` (Stage-2) + `GeneratedGeometry` (Stage-3) pair into a
// `GeneratedSchemas` (Stage-4 OUTPUT type).
//
// Per APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4:
//
//   ParametricFamily + GeneratedGeometry → [Stage 4 data model] → GeneratedSchemas
//
// Pure: no I/O outside `new Date().toISOString()` (the timestamp stamp; the
// caller can pin it via `opts.synthesisedAt` for deterministic tests).  Zod
// schemas remain the contract surface — this file emits a plain object that
// round-trips through `GeneratedSchemasSchema.parse`.
//
// Cross-imports:
//   - `family-parametric/index.js` → ParametricFamily   (L0)
//   - `family-geometry/index.js`   → GeneratedGeometry  (L0)
//   - `family-schemas/index.js`    → GeneratedSchemas + sub-types (L0)
//
// L0-pure: TypeScript-only.  No THREE, no DOM, no `@pryzm/*` outside the
// `@pryzm/schemas` package.

import type { ParametricFamily, ParametricParameter } from '../family-parametric/index.js';
import type { GeneratedGeometry } from '../family-geometry/index.js';
import type {
    GeneratedSchemas,
    InstanceParameterSpec,
    InstanceSchemaSpec,
    CommandPayloadSpec,
    CommandPayloadSet,
} from './index.js';

/**
 * Options for `synthesiseSchemas`.
 *
 *   - `synthesisedAt`  OPTIONAL ISO 8601 timestamp to stamp on the output;
 *                      defaults to `new Date().toISOString()` at call time.
 *                      Pinning enables deterministic tests + golden-file
 *                      fixtures.
 */
export interface SynthesiseSchemasOptions {
    readonly synthesisedAt?: string;
}

/**
 * The synthetic `id` parameter that every command-payload carries.  It is
 * NOT a user-editable instance parameter — the runtime mints it — but every
 * `create` / `update` / `remove` payload needs it to identify the target
 * instance.  Surfaced as the FIRST entry of the parameter array per
 * convention so the command bus can pop it off uniformly.
 */
function buildIdParameter(): InstanceParameterSpec {
    return {
        name:         'id',
        kind:         'string',
        label:        'ID',
        userEditable: false,
    };
}

/**
 * Capitalise the first letter of a parameter name to form its display label.
 * Empty names are rejected upstream by Zod (`InstanceParameterSpecSchema`
 * + the schema parsing flow) so this assumes `name.length >= 1`.  No empty-
 * string guard is needed — the Zod parse would have failed earlier.
 */
function capitaliseFirstLetter(name: string): string {
    return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Map a `ParametricParameter` to an `InstanceParameterSpec`.  Stage-4 v1
 * simplification: every parameter is `kind: 'number'` — the
 * `ParametricRange.unit` discriminant carries the unit semantics but does
 * not change the Zod kind (all of m / mm / cm / in / ft / deg / rad /
 * unitless reduce to a finite floating-point number at the instance layer).
 * A later slice MAY split `unitless` into `integer` when min/max are
 * integer-valued; for the substrate we keep the surface uniform.
 */
function paramToInstanceSpec(
    name: string,
    parameter: ParametricParameter,
): InstanceParameterSpec {
    return {
        name,
        kind:         'number',
        label:        capitaliseFirstLetter(name),
        defaultValue: parameter.range.defaultValue,
        minNumber:    parameter.range.min,
        maxNumber:    parameter.range.max,
        userEditable: true,
    };
}

/**
 * Build an instance-schema spec hash that is STABLE across runs (the
 * synthesiser is pure modulo the timestamp).  Encodes:
 *   - the family id (so two different families with identical parameter
 *     shapes still get distinct hashes)
 *   - the sorted parameter names
 *   - the sorted parameter ranges (`min/default/max` triplet per name)
 *
 * This is intentionally a readable string — the substrate does not need a
 * cryptographic hash; the runtime uses it as a cache key.
 */
function buildSpecHash(identityId: string, params: InstanceParameterSpec[]): string {
    // The synthesiser ALWAYS fills `minNumber` / `maxNumber` / `defaultValue`
    // on every emitted InstanceParameterSpec (see `paramToInstanceSpec`), so
    // we can format them directly — no nullish-coalescing branch.
    const names = params.map((p) => p.name);
    const ranges = params.map(
        (p) => `${String(p.minNumber)}/${String(p.defaultValue)}/${String(p.maxNumber)}`,
    );
    return `instance:${identityId}|${names.join(',')}|${ranges.join(',')}`;
}

/**
 * Build a command-payload spec hash.  Encodes the command verb + the
 * upstream instance-schema spec hash; for `remove` (which carries only the
 * id) we hash on the identity id directly so two different families do not
 * share a `remove` hash.
 */
function buildPayloadHash(
    command: 'create' | 'update' | 'remove',
    identityId: string,
    instanceSpecHash: string,
): string {
    if (command === 'remove') {
        return `remove:${identityId}`;
    }
    return `${command}:${instanceSpecHash}`;
}

/**
 * Pure Stage-4 synthesiser.  Takes a `ParametricFamily` + `GeneratedGeometry`
 * (both bearing the same `FamilyIdentity`) and produces a `GeneratedSchemas`
 * with:
 *   1. `instanceSchema.parameters`  one entry per `parametric.parameters`
 *      entry, sorted by name for deterministic ordering; every entry is
 *      `kind: 'number'` (v1 simplification — see `paramToInstanceSpec`).
 *   2. `commandPayloads.create`  `id` + the full parameter set.
 *   3. `commandPayloads.update`  `id` + the same parameter set (caller may
 *      patch any subset).
 *   4. `commandPayloads.remove`  `id` only.
 *   5. `schemasHash`  stable hash derived from identity + instanceSchema +
 *      the three payload hashes.
 *   6. `synthesisedAt`  ISO 8601; pinnable via `opts.synthesisedAt`.
 *
 * Throws (fail-explicit per the contract doctrine) when
 * `parametric.identity.id !== geometry.identity.id` — that is a contract
 * violation upstream, not a recoverable input.
 */
export function synthesiseSchemas(
    parametric: ParametricFamily,
    geometry: GeneratedGeometry,
    opts: SynthesiseSchemasOptions = {},
): GeneratedSchemas {
    // 1. Validate compatibility — both inputs MUST carry the same identity.
    if (parametric.identity.id !== geometry.identity.id) {
        throw new Error(
            `synthesiseSchemas: identity mismatch — parametric.identity.id ` +
            `(${parametric.identity.id}) !== geometry.identity.id ` +
            `(${geometry.identity.id})`,
        );
    }

    const identity = parametric.identity;

    // 2. Build instance parameters, sorted by name for determinism.  Object
    //    record keys are unique so the comparator never returns 0; we use
    //    `localeCompare` rather than an explicit ternary so the unreachable
    //    equal-keys branch does not show up in coverage.
    const sortedEntries = Object.entries(parametric.parameters)
        .slice()
        .sort(([a], [b]) => a.localeCompare(b));
    const instanceParameters: InstanceParameterSpec[] = sortedEntries.map(
        ([name, parameter]) => paramToInstanceSpec(name, parameter),
    );

    // 3. Build instance-schema spec.
    const specHash = buildSpecHash(identity.id, instanceParameters);
    const instanceSchema: InstanceSchemaSpec = {
        parameters: instanceParameters,
        specHash,
    };

    // 4. Build command payloads.
    const idParam = buildIdParameter();

    const createPayload: CommandPayloadSpec = {
        command:     'create',
        parameters:  [idParam, ...instanceParameters],
        payloadHash: buildPayloadHash('create', identity.id, specHash),
    };

    const updatePayload: CommandPayloadSpec = {
        command:     'update',
        parameters:  [idParam, ...instanceParameters],
        payloadHash: buildPayloadHash('update', identity.id, specHash),
    };

    const removePayload: CommandPayloadSpec = {
        command:     'remove',
        parameters:  [idParam],
        payloadHash: buildPayloadHash('remove', identity.id, specHash),
    };

    const commandPayloads: CommandPayloadSet = {
        create: createPayload,
        update: updatePayload,
        remove: removePayload,
    };

    // 5. Top-level schemas hash.  Identity-version is included so two
    //    versions of the same family with identical parameter shapes still
    //    get distinct top-level hashes.
    const schemasHash =
        `schemas:${identity.id}|${identity.version}|` +
        `${specHash}|` +
        `${createPayload.payloadHash}|` +
        `${updatePayload.payloadHash}|` +
        `${removePayload.payloadHash}`;

    // 6. Stamp the timestamp.
    const synthesisedAt = opts.synthesisedAt ?? new Date().toISOString();

    return {
        identity,
        instanceSchema,
        commandPayloads,
        schemasHash,
        synthesisedAt,
    };
}
