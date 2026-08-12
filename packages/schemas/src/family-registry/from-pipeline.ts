// P0.5 Stage-5 (Family Platform) — pure assembler that composes a
// `RegisteredFamily` from the upstream Stage-1/2/3/4 outputs.
//
// Per APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4:
//
//   ParametricFamily + GeneratedGeometry + GeneratedSchemas
//     → [Stage 5 register] → RegisteredFamily
//
// (The Stage-5 ASSEMBLY step — what this file implements — is the PURE
// TRANSFORMER half.  The registration itself, i.e.
// `registerFamily(state, family)` against a FamilyRegistryState, is a
// SEPARATE concern performed by the caller AFTER this assembler runs.)
//
// Pure: no I/O.  No timestamp stamp (Stage-5 carries forward the upstream
// hashes, not a fresh wall-clock).  Zod schemas remain the contract surface;
// this file emits a plain object that round-trips through
// `RegisteredFamilySchema.parse`.
//
// Cross-imports:
//   - `../family-definition/index.js`  → FamilyDefinition          (L0)
//   - `../family-parametric/index.js`  → ParametricFamily          (L0)
//   - `../family-geometry/index.js`    → GeneratedGeometry         (L0)
//   - `../family-schemas/index.js`     → GeneratedSchemas          (L0)
//   - `./index.js` (sibling barrel)    → RegisteredFamily +
//                                        FamilyCategory / FamilyOccupancy /
//                                        FamilyOrigin / ArchetypeHint /
//                                        FamilyMountClass            (L0)
//
// L0-pure: TypeScript-only.  No THREE, no DOM, no `@pryzm/*` outside the
// `@pryzm/schemas` package.

import type { FamilyDefinition } from '../family-definition/index.js';
import type { ParametricFamily } from '../family-parametric/index.js';
import type { GeneratedGeometry } from '../family-geometry/index.js';
import type { GeneratedSchemas } from '../family-schemas/index.js';
import type {
    RegisteredFamily,
    FamilyCategory,
    FamilyOccupancy,
    FamilyOrigin,
    ArchetypeHint,
} from './index.js';
// C75 §2.1 — the assembler records where `origin` came from instead of inventing it.
import {
    unknownProvenance,
    systemProvenance,
    type ValueProvenance,
} from '../provenance/ValueOrigin.js';

/**
 * Options for {@link assembleRegisteredFamily}.
 */
export interface AssembleRegisteredFamilyOptions {
    /**
     * Origin tag.  `'core'` is reserved for hardcoded developer-shipped
     * families; `'plugin'` for marketplace plugins; `'ai-generated'` for
     * fully-AI-synthesised families; `'user'` for a user-uploaded one.
     *
     * ⚠ **Omitting this is not the same as passing `'user'`, and C75 §2.1 is
     * why.** Omitting it yields the least-privileged member `'user'` for the
     * required `origin` field, *plus* an `originProvenance` recording that
     * nobody stated an origin. Passing `'user'` explicitly records an
     * `observed` origin — a caller's actual statement. A consumer that must
     * distinguish "a person uploaded this" from "we did not know" reads
     * `originProvenance`, never `origin` alone.
     */
    readonly origin?: FamilyOrigin;
    /**
     * Override the category.  `FamilyDefinition` does NOT carry an explicit
     * `category` field today — Stage-5 derives one heuristically (see the
     * §Algorithm note in {@link assembleRegisteredFamily}).  v1 returns
     * `'general'` when no override is supplied; the heuristic refinement
     * (semantic-name → category classifier) is a future ML / rules slice.
     */
    readonly category?: FamilyCategory;
    /**
     * Override the tags.  Default: derived from
     * `FamilyDefinition.ai.semanticNames` + the family's `mountClass` + the
     * derived occupancy from archetypeHints[0] (if any), lower-cased,
     * de-duplicated, and sorted for determinism.
     */
    readonly tags?: ReadonlyArray<string>;
}

/**
 * Known apartment-room occupancy vocabulary.  Used by the archetype-hint
 * occupancy derivation: a semantic name like `"bedroom"` matches the
 * `'bedroom'` occupancy; an unknown semantic name falls back to `'general'`.
 *
 * Kept as a plain frozen set rather than imported from
 * `@pryzm/schemas/apartment` so the registry does NOT acquire a hard
 * dependency on the apartment substrate (per `registered-family.ts`
 * §FamilyOccupancySchema comment).  Both `living` and `living_room` are
 * recognised — the apartment substrate uses `living` while user-supplied
 * descriptors often say `living_room` / `living-room`.
 */
const KNOWN_OCCUPANCIES: ReadonlySet<FamilyOccupancy> = new Set([
    'master',
    'bedroom',
    'living',
    'living_room',
    'kitchen',
    'dining',
    'bathroom',
    'wc',
    'corridor',
    'storage',
    'balcony',
    'study',
    'ensuite',
]);

/**
 * Normalise a semantic name for occupancy matching: lower-case + trim +
 * convert hyphens / spaces to underscores so `"Living Room"`, `"living-room"`,
 * and `"living_room"` all match the same canonical occupancy key.
 */
function normaliseOccupancyCandidate(name: string): string {
    return name
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
}

/**
 * Derive the archetype-hint occupancy from the FamilyDefinition's semantic
 * names.  Returns the FIRST semantic name that matches a known occupancy, or
 * `'general'` when no semantic name matches.  Multi-occupancy archetype
 * hints are a future slice — v1 emits exactly one hint per family.
 */
function deriveOccupancy(definition: FamilyDefinition): FamilyOccupancy {
    for (const raw of definition.ai.semanticNames) {
        const candidate = normaliseOccupancyCandidate(raw);
        if (KNOWN_OCCUPANCIES.has(candidate)) {
            return candidate;
        }
    }
    return 'general';
}

/**
 * Derive the default tag set: lower-cased semantic names + the mountClass +
 * the derived occupancy (only when it differs from `'general'`).
 * De-duplicated + sorted for determinism so a downstream cache keyed on
 * `JSON.stringify(family.tags)` is stable across re-runs.
 */
function deriveTags(
    definition: FamilyDefinition,
    occupancy: FamilyOccupancy,
): string[] {
    const collected = new Set<string>();
    for (const name of definition.ai.semanticNames) {
        const trimmed = name.trim().toLowerCase();
        if (trimmed.length > 0) {
            collected.add(trimmed);
        }
    }
    collected.add(definition.behaviour.mountClass);
    if (occupancy !== 'general') {
        collected.add(occupancy);
    }
    return [...collected].sort();
}

/**
 * Pure Stage-5 assembler.  Composes the final `RegisteredFamily` from the
 * original `FamilyDefinition` (Stage-1 canonical form) + the three pipeline
 * outputs (Stage-2 parametric / Stage-3 geometry / Stage-4 schemas).
 *
 * The actual REGISTRATION step (writing the result into a
 * `FamilyRegistryState` via `registerFamily(state, result)`) is a SEPARATE
 * concern handled by the caller — this transformer is pure and returns the
 * payload only.
 *
 * Algorithm:
 *   1. VALIDATE identity coherence across all four inputs — throw with a
 *      descriptive message when any identity id mismatches (fail-explicit
 *      per the contract doctrine).
 *   2. DERIVE `category` — use `opts.category` if supplied, else fall back
 *      to the v1 placeholder `'general'`.  Semantic-name → category
 *      classification is a future slice.
 *   3. DERIVE `mountClass` from `definition.behaviour.mountClass`
 *      (passes through directly).
 *   4. DERIVE `origin` from `opts.origin`, AND record `originProvenance`
 *      (C75 §2.1). A caller that stated an origin is recorded as having stated
 *      it; a caller that stated nothing yields the least-privileged member
 *      `'user'` marked UNKNOWN-with-reason, never presented as a decision.
 *   5. DERIVE `archetypeHints` — v1 emits exactly ONE hint constructed
 *      from `definition.placement.defaultAnchor` + a derived occupancy
 *      (first semantic-name match in `KNOWN_OCCUPANCIES`, else `'general'`).
 *      Multi-occupancy archetype hints are a future slice.
 *   6. PASS THROUGH `ifcMapping` = `definition.bim` (the two schemas are
 *      structurally identical — `IfcMappingSchema`).
 *   7. COMPOSE `schemaHash` from the three upstream hashes + identity id +
 *      version — the stable cache key for the FULL pipeline output.
 *   8. DERIVE `tags` — use `opts.tags` if supplied, else fall back to the
 *      lower-cased semantic-name + mountClass + occupancy union, de-duped
 *      and sorted for determinism.
 *
 * `output.identity === definition.identity` (BY REFERENCE — the assembler
 * does NOT clone the identity block).  Consumers must not mutate the input
 * definition's identity.
 */
export function assembleRegisteredFamily(
    definition: FamilyDefinition,
    parametric: ParametricFamily,
    geometry: GeneratedGeometry,
    schemas: GeneratedSchemas,
    opts: AssembleRegisteredFamilyOptions = {},
): RegisteredFamily {
    // 1. Identity coherence check — fail-explicit on any mismatch.
    if (definition.identity.id !== parametric.identity.id) {
        throw new Error(
            `assembleRegisteredFamily: identity mismatch — ` +
            `definition.identity.id (${definition.identity.id}) !== ` +
            `parametric.identity.id (${parametric.identity.id})`,
        );
    }
    if (definition.identity.id !== geometry.identity.id) {
        throw new Error(
            `assembleRegisteredFamily: identity mismatch — ` +
            `definition.identity.id (${definition.identity.id}) !== ` +
            `geometry.identity.id (${geometry.identity.id})`,
        );
    }
    if (definition.identity.id !== schemas.identity.id) {
        throw new Error(
            `assembleRegisteredFamily: identity mismatch — ` +
            `definition.identity.id (${definition.identity.id}) !== ` +
            `schemas.identity.id (${schemas.identity.id})`,
        );
    }

    // 2. Category — opts override, else v1 placeholder.
    const category: FamilyCategory = opts.category ?? 'general';

    // 3. MountClass passes through.
    const mountClass = definition.behaviour.mountClass;

    // 4. Origin — and its PROVENANCE, which is the part that used to be invented.
    //
    // C75 §2.1 (the ledger's `from-pipeline.ts:225`). This line read
    // `opts.origin ?? 'user'`: a family assembled with no stated origin was
    // recorded as one a PERSON uploaded. `origin` drives a permission tier
    // (`registered-family.ts:22`), so the invented value was not cosmetic — it
    // granted a trust level nobody conferred.
    //
    // `FamilyOrigin` has no member meaning "not known", so the honest record
    // needs two fields, not a fifth member (C75 §1.4 — unknown is a value with a
    // REASON, and a fifth member would just become the next `??` target):
    //
    //   • a caller that STATED an origin is recorded as stated, `observed`;
    //   • a caller that stated NOTHING keeps a usable `origin` — the schema
    //     requires one and every consumer indexes on it — but that value is
    //     marked for exactly what it is: not known, `producer-not-instrumented`,
    //     because the family PIPELINE has no place to carry an origin through
    //     from its source and that silence is ours, not the caller's.
    //
    // ⚠ The supplied value is still `'user'`, and the reason is deliberate: it
    // is the LEAST-privileged member of the union (`registered-family.ts:22` —
    // "a `user` family cannot author across plugin boundaries"), so a consumer
    // that ignores the provenance field errs toward refusing, never toward
    // granting. Under-claiming is the safe direction; `'core'` or `'plugin'`
    // here would have been an escalation. What C75 forbids is presenting that
    // supplied value AS a decision, and `originProvenance` is now the field
    // that stops it: any consumer can tell the two apart, which before it could
    // not.
    const origin: FamilyOrigin = opts.origin ?? 'user';
    const originProvenance: ValueProvenance = opts.origin === undefined
        ? unknownProvenance('producer-not-instrumented')
        : systemProvenance('observed', 'stated by the caller via AssembleRegisteredFamilyOptions.origin');

    // 5. Archetype hints — v1 emits ONE.
    const occupancy = deriveOccupancy(definition);
    const archetypeHints: ArchetypeHint[] = [
        {
            occupancy,
            anchor: definition.placement.defaultAnchor,
            // group intentionally omitted — multi-occupancy / grouping is a
            // future slice; ArchetypeHintSchema.group is optional so the
            // emitted hint round-trips cleanly.
        },
    ];

    // 6. IFC mapping passes through.
    const ifcMapping = definition.bim;

    // 7. Compose schemaHash — stable cache key across the full pipeline.
    const identity = definition.identity;
    const schemaHash =
        `registered:${identity.id}|${identity.version}|` +
        `${parametric.parametricHash}|` +
        `${geometry.geometryHash}|` +
        `${schemas.schemasHash}`;

    // 8. Tags — opts override, else derive.  Frozen-source-array safe: the
    //    spread inside the override branch ALSO de-dups + sorts so a caller
    //    passing duplicates / unsorted tags still produces a deterministic
    //    output.
    const tags: string[] = opts.tags
        ? [...new Set(opts.tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0))].sort()
        : deriveTags(definition, occupancy);

    return {
        identity,
        category,
        mountClass,
        origin,
        originProvenance,
        archetypeHints,
        ifcMapping,
        schemaHash,
        tags,
    };
}
