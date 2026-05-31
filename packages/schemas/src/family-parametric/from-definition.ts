// P0.5 slice 1 (Family Platform) — pure FamilyDefinition → ParametricFamily
// Stage-2 decomposer.
//
// v1 contract: takes an already-validated FamilyDefinition and produces a
// ParametricFamily containing ONE 'box' primitive parameterised over the
// definition's dimensions, plus first-class parameter entries promoted
// verbatim from `geometry.parametricRanges`.
//
// Real multi-primitive decomposition (sweep / loft / revolve for complex
// families) is a later slice.  This v1 satisfies the contract end-to-end for
// ~80% of residential furniture (rectangular pieces).
//
// Pure data transform: NO I/O.  The only non-determinism is
// `new Date().toISOString()` — and that is opt-out-able via
// `opts.decomposedAt` for deterministic tests.
//
// Pipeline flow per APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4:
//
//   FamilyDefinition  ─[Stage 2 Parametric Decomposition]→  ParametricFamily
//
// References:
//   - APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4
//     Stage 2 (Parametric Decomposition — outputs ParametricFamily)

import type { FamilyDefinition } from '../family-definition/index.js';
import type { ParametricRange }  from '../family-request/index.js';
import type {
    ParametricFamily,
    ParametricParameter,
    ParametricValue,
    Primitive,
    PrimitiveTransform,
} from './index.js';

/** Options for {@link decomposeFamily}. */
export interface FromDefinitionOptions {
    /**
     * Override the decomposition timestamp.  Provide a fixed ISO 8601 string
     * in tests to keep the transformer fully deterministic; otherwise the
     * transformer stamps `new Date().toISOString()` at call time.
     */
    readonly decomposedAt?: string;

    /**
     * Primary primitive id.  Defaults to `'p0'` — v1 is single-primitive so
     * this is the box's id.  Exposed mainly for tests + future slices that
     * compose multi-primitive families on top of the v1 box.
     */
    readonly primaryPrimitiveId?: string;

    /**
     * Material slot for the box primitive.  Defaults to `'default'` — bound
     * to a concrete material at family-registration time.
     */
    readonly materialSlot?: string;
}

/**
 * Candidate parameter names (lower-cased) that map to each box axis.  The
 * decomposer scans `geometry.parametricRanges` for a name (case-insensitive)
 * matching any of these and uses the first match as a `ParameterRef` for the
 * corresponding box dimension.  Falls back to the literal value from
 * `geometry.dimensions` when no parameter name matches.
 */
const WIDTH_NAMES  = ['width',  'widthm',  'w'] as const;
const DEPTH_NAMES  = ['depth',  'depthm',  'd'] as const;
const HEIGHT_NAMES = ['height', 'heightm', 'h'] as const;

/**
 * Pure FamilyDefinition → ParametricFamily transformer.
 *
 * v1 algorithm:
 *   1. Promote every entry in `definition.geometry.parametricRanges` to a
 *      first-class `ParametricParameter` (range carried verbatim; no
 *      constraint expression — that's a later slice).
 *   2. Emit ONE 'box' primitive whose `boxWidth` / `boxDepth` / `boxHeight`
 *      reference a matching parameter by name (case-insensitive search over
 *      `WIDTH_NAMES` / `DEPTH_NAMES` / `HEIGHT_NAMES`) when one exists, and
 *      otherwise fall back to the literal value from
 *      `definition.geometry.dimensions`.
 *   3. Compute `parametricHash` as a stable deterministic join of identity,
 *      primary primitive id, sorted parameter names, and the box dims.
 *   4. Stamp `decomposedAt = opts.decomposedAt ?? new Date().toISOString()`.
 *
 * Sub-blocks pass through by REFERENCE — `output.identity === input.identity`
 * — so consumers must not mutate the returned identity.
 */
export function decomposeFamily(
    definition: FamilyDefinition,
    opts: FromDefinitionOptions = {},
): ParametricFamily {
    const decomposedAt = opts.decomposedAt ?? new Date().toISOString();
    const primaryId    = opts.primaryPrimitiveId ?? 'p0';
    const materialSlot = opts.materialSlot       ?? 'default';

    const ranges = definition.geometry.parametricRanges;

    // 1) Promote each parametricRange to a first-class ParametricParameter.
    const parameters: Record<string, ParametricParameter> = {};
    for (const range of ranges) {
        parameters[range.name] = { range };
    }

    // 2) Resolve each box axis to either a ParameterRef (when a matching
    //    parameter name exists) or a literal from geometry.dimensions.
    const { widthM, depthM, heightM } = definition.geometry.dimensions;
    const boxWidth:  ParametricValue = resolveAxis(ranges, WIDTH_NAMES,  widthM);
    const boxDepth:  ParametricValue = resolveAxis(ranges, DEPTH_NAMES,  depthM);
    const boxHeight: ParametricValue = resolveAxis(ranges, HEIGHT_NAMES, heightM);

    const transform: PrimitiveTransform = {
        translate: { x: 0, y: 0, z: 0 },
        rotateDeg: { x: 0, y: 0, z: 0 },
        scale:     { x: 1, y: 1, z: 1 },
    };

    const box: Primitive = {
        id:           primaryId,
        kind:         'box',
        dimensions:   { boxWidth, boxDepth, boxHeight },
        transform,
        materialSlot,
    };

    // 3) Compute parametricHash.
    const parametricHash = computeParametricHash(definition, primaryId, ranges, {
        boxWidth, boxDepth, boxHeight,
    });

    return {
        identity:    definition.identity,
        parameters,
        primitives:  [box],
        parametricHash,
        decomposedAt,
    };
}

/**
 * Resolve one box-axis dimension: if any range in `ranges` has a name
 * (case-insensitive) matching one of the candidate names, return a
 * `ParameterRef` to it; otherwise return the literal fallback.
 *
 * Exported for unit-testing the axis-resolution rules in isolation.
 */
export function resolveAxis(
    ranges:    readonly ParametricRange[],
    candidates: readonly string[],
    fallback:  number,
): ParametricValue {
    const candidateSet = new Set(candidates.map(c => c.toLowerCase()));
    for (const range of ranges) {
        if (candidateSet.has(range.name.toLowerCase())) {
            return { paramName: range.name };
        }
    }
    return fallback;
}

/**
 * Compute a stable, deterministic, non-cryptographic cache key for the
 * Stage-2 output.  Same input → same hash (modulo timestamp, which is not
 * part of the hash).  Box dimensions are fingerprinted as either the
 * 6-decimal literal value or `@<paramName>` for parameter refs.
 *
 * Format:
 *   `parametric:<id>|<version>|<primaryId>|<sortedParamNames>|<w>|<d>|<h>`
 *
 * Exported for unit-testing in isolation.
 */
export function computeParametricHash(
    definition: FamilyDefinition,
    primaryId:  string,
    ranges:     readonly ParametricRange[],
    boxDims:    { boxWidth: ParametricValue; boxDepth: ParametricValue; boxHeight: ParametricValue },
): string {
    const sortedParamNames = ranges.map(r => r.name).slice().sort();
    const parts = [
        definition.identity.id,
        definition.identity.version,
        primaryId,
        sortedParamNames.join(','),
        fingerprintValue(boxDims.boxWidth),
        fingerprintValue(boxDims.boxDepth),
        fingerprintValue(boxDims.boxHeight),
    ];
    return `parametric:${parts.join('|')}`;
}

/**
 * Deterministic fingerprint for a {@link ParametricValue}: literals as
 * 6-decimal fixed strings, parameter refs as `@<paramName>`.
 */
function fingerprintValue(v: ParametricValue): string {
    return typeof v === 'number' ? v.toFixed(6) : `@${v.paramName}`;
}
