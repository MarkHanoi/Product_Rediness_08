// P0.5 Stage-3 (Family Platform) — pure ParametricFamily → GeneratedGeometry
// Stage-3 synthesiser.
//
// v1 contract: takes an already-validated ParametricFamily (the Stage-2
// output) and produces a GeneratedGeometry by deriving:
//   1. a typed BuilderRef    (3D builder module + export name + cache key)
//   2. a typed PlanSymbolRef (2D plan-symbol module + export name + bbox)
//   3. a Footprint           (placement metadata for the D-FLE engine)
//   4. a geometryHash        (stable cache key shared with downstream stages)
//
// The synthesiser DOES NOT construct THREE objects — it emits REFERENCES
// (module path + export name) that the runtime (L4+) resolves at instance-
// bake time.  This keeps Stage-3 L0 / P5 pure.  L0 = no I/O, no THREE, no
// DOM, no `@pryzm/*` outside the `@pryzm/schemas` package.  The only non-
// determinism is `new Date().toISOString()` — opt-out-able via
// `opts.synthesisedAt` for deterministic tests.
//
// Pipeline flow per APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4:
//
//   ParametricFamily  ─[Stage 3 Geometry Synthesis]→  GeneratedGeometry
//
// v1 scope: SINGLE-primitive ParametricFamily (the Stage-2 v1 output).
// Multi-primitive composite synthesis is a later slice (the substrate is
// ready; the synthesiser just picks `primitives[0]` for now).
//
// Cross-imports:
//   - `family-parametric/index.js` → ParametricFamily, Primitive (L0)
//   - `family-geometry/index.js`   → GeneratedGeometry + sub-types (L0)
//
// References:
//   - APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4
//     Stage 3 (Geometry Synthesis — outputs GeneratedGeometry)

import type { ParametricFamily, Primitive } from '../family-parametric/index.js';
import type {
    GeneratedGeometry,
    BuilderRef,
    BuilderKind,
    PlanSymbolRef,
    PlanSymbolKind,
    Footprint,
} from './index.js';

/**
 * Options for {@link synthesiseGeometry}.
 *
 *   - `synthesisedAt`              OPTIONAL ISO 8601 timestamp to stamp on
 *                                  the output; defaults to
 *                                  `new Date().toISOString()` at call time.
 *                                  Pinning enables deterministic tests +
 *                                  golden-file fixtures.
 *   - `defaultBuilderModulePath`   OPTIONAL ES-module specifier used as the
 *                                  emitted BuilderRef.modulePath; defaults
 *                                  to `@pryzm/family-instance/parametric-builder`.
 *                                  Exposed so consumers can target a
 *                                  vendor-specific builder bundle without
 *                                  re-issuing the L0 contract.
 *   - `defaultPlanSymbolModulePath` OPTIONAL ES-module specifier used as the
 *                                  emitted PlanSymbolRef.modulePath; defaults
 *                                  to `@pryzm/family-instance/plan-symbol-builder`.
 */
export interface SynthesiseGeometryOptions {
    readonly synthesisedAt?: string;
    readonly defaultBuilderModulePath?: string;
    readonly defaultPlanSymbolModulePath?: string;
}

/** Default builder module path — resolved at L4+ time by the runtime. */
const DEFAULT_BUILDER_MODULE_PATH = '@pryzm/family-instance/parametric-builder';

/** Default plan-symbol module path — resolved at L4+ time by the runtime. */
const DEFAULT_PLAN_SYMBOL_MODULE_PATH = '@pryzm/family-instance/plan-symbol-builder';

/**
 * Pure Stage-3 synthesiser.  Takes a ParametricFamily and emits a
 * GeneratedGeometry by deriving builder + plan-symbol references and a
 * footprint from the parametric primitives.
 *
 * Pure: no I/O outside `new Date().toISOString()` (the timestamp stamp; the
 * caller can pin it via `opts.synthesisedAt`).  No THREE, no DOM, no module
 * resolution at parse time — just emits typed references that the L4+
 * runtime resolves later.
 *
 * v1 scope: single-primitive ParametricFamily (the Stage-2 v1 output).
 * Multi-primitive composite synthesis is a later slice — for now the
 * synthesiser picks `primitives[0]` as the primary.  Identity passes through
 * by REFERENCE (`output.identity === input.identity`) so consumers must not
 * mutate the returned identity.
 */
export function synthesiseGeometry(
    parametric: ParametricFamily,
    opts: SynthesiseGeometryOptions = {},
): GeneratedGeometry {
    // 1. Contract-defensive guard.  ParametricFamilySchema.primitives uses
    //    `.min(1)`, so a parsed ParametricFamily always has ≥1 primitive —
    //    but the synthesiser accepts a typed `ParametricFamily` directly
    //    (no Zod parse here) so a hand-built object COULD slip an empty
    //    array past TypeScript.  Fail explicit to match the upstream
    //    Stage-2/Stage-4 doctrine.
    if (parametric.primitives.length < 1) {
        throw new Error(
            'synthesiseGeometry: parametric.primitives must be non-empty ' +
            '(Stage-2 v1 always emits at least one primitive).',
        );
    }

    const identity = parametric.identity;

    // 2. Pick the primary primitive.  Multi-primitive composite synthesis
    //    is a later slice; for v1 the first primitive in the deterministic
    //    Stage-2 ordering is the family's primary form.
    const primary = parametric.primitives[0]!;

    const builderModulePath =
        opts.defaultBuilderModulePath ?? DEFAULT_BUILDER_MODULE_PATH;
    const planSymbolModulePath =
        opts.defaultPlanSymbolModulePath ?? DEFAULT_PLAN_SYMBOL_MODULE_PATH;

    // 3. Derive the 3D BuilderRef from the primary primitive's kind.
    const builder = buildBuilderRef(identity.id, identity.version, primary, builderModulePath);

    // 4. Derive the 2D PlanSymbolRef + bbox (family-local) from the primary
    //    primitive.  Boxes use real dimensions; other kinds fall back to a
    //    unit-square placeholder (real bbox computation for composite /
    //    sweep / revolve / loft is a later slice — see TODO below).
    const planSymbol = buildPlanSymbolRef(primary, parametric, planSymbolModulePath);

    // 5. Derive the placement Footprint from the primary primitive.  For a
    //    box, lengthM = max(W, D) and depthM = min(W, D); non-box primitives
    //    fall back to a unit-square footprint until per-kind footprint
    //    extraction lands.  Clearance fields default to 0 — real per-family
    //    clearances are a future Footprint-overrides slice.
    const footprint = buildFootprint(primary, parametric);

    // 6. Top-level geometry hash.  Cache key shared with downstream stages.
    const geometryHash =
        `geometry:${identity.id}|${identity.version}|` +
        `${builder.builderHash}|${planSymbol.exportName}|` +
        `${footprint.lengthM.toFixed(6)}x${footprint.depthM.toFixed(6)}`;

    // 7. Stamp the timestamp.
    const synthesisedAt = opts.synthesisedAt ?? new Date().toISOString();

    return {
        identity,
        builder,
        planSymbol,
        footprint,
        geometryHash,
        synthesisedAt,
    };
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Capitalise the first letter of a non-empty string.  `PrimitiveKindSchema`
 * is a closed `z.enum` of non-empty literals, so the input is guaranteed
 * `length >= 1` — no empty-string guard needed.
 */
function capitalise(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Discriminator: every parametric `PrimitiveKind` other than `'composite'`
 * reduces to `BuilderKind = 'parametric'` (the runtime dispatches on the
 * primitive kind inside the parametric builder).  `'composite'` maps to
 * `BuilderKind = 'composite'` (a separate runtime resolver path).
 */
function deriveBuilderKind(primitiveKind: Primitive['kind']): BuilderKind {
    if (primitiveKind === 'composite') {
        return 'composite';
    }
    return 'parametric';
}

/**
 * Map a primitive kind to its exported builder function name.  For composite
 * primitives the runtime dispatches on the recursive composite tree, so the
 * export is just `'buildComposite'`; for every other (leaf) kind, the export
 * is `'build' + capitalise(kind)` (e.g. `'buildBox'`, `'buildCylinder'`).
 */
function deriveBuilderExportName(primitiveKind: Primitive['kind']): string {
    if (primitiveKind === 'composite') {
        return 'buildComposite';
    }
    return `build${capitalise(primitiveKind)}`;
}

/**
 * Mirror of {@link deriveBuilderExportName} for the 2D plan-symbol builder.
 * Composite primitives use a recursive composite symbol; other kinds use a
 * per-kind symbol export.
 */
function derivePlanSymbolExportName(primitiveKind: Primitive['kind']): string {
    if (primitiveKind === 'composite') {
        return 'planSymbolComposite';
    }
    return `planSymbol${capitalise(primitiveKind)}`;
}

/**
 * Build the 3D BuilderRef for the primary primitive.  The `builderHash`
 * encodes identity + primitive kind + primitive id so the runtime can cache
 * the baked geometry across instances of the same family.
 */
function buildBuilderRef(
    identityId: string,
    identityVersion: string,
    primary: Primitive,
    modulePath: string,
): BuilderRef {
    const kind = deriveBuilderKind(primary.kind);
    const exportName = deriveBuilderExportName(primary.kind);
    const builderHash =
        `builder:${identityId}|${identityVersion}|${primary.kind}|${primary.id}`;
    return {
        kind,
        modulePath,
        exportName,
        builderHash,
    };
}

/**
 * Resolve a {@link Primitive} dimension to a literal numeric value.  A
 * `ParameterRef` is resolved against `parametric.parameters[paramName].range
 * .defaultValue`; a literal number passes through; everything else (an
 * unknown paramName, or a missing dimension key) falls back to
 * `defaultIfMissing`.  The synthesiser never throws on a missing key — it
 * degrades to the unit-square fallback further up the call stack.
 */
function resolveDimension(
    primary: Primitive,
    dimKey: string,
    parametric: ParametricFamily,
    defaultIfMissing: number,
): number {
    const v = primary.dimensions[dimKey];
    if (v === undefined) {
        return defaultIfMissing;
    }
    if (typeof v === 'number') {
        return v;
    }
    // v is a ParameterRef.  Resolve against parametric.parameters by name.
    const param = parametric.parameters[v.paramName];
    if (param === undefined) {
        return defaultIfMissing;
    }
    return param.range.defaultValue;
}

/**
 * Build the 2D PlanSymbolRef for the primary primitive.  bbox is in family-
 * LOCAL coordinates (centred on origin):
 *   - for a box: `[-W/2, -D/2, +W/2, +D/2]` using resolved boxWidth/boxDepth
 *   - for any other kind (cylinder / extrusion / sweep / revolve / loft /
 *     composite): a unit-square `[-0.5, -0.5, +0.5, +0.5]` placeholder.
 *
 * TODO: composite / sweep / revolve / loft need real bbox computation —
 * deferred to a future slice that introduces per-kind bbox extractors.
 */
function buildPlanSymbolRef(
    primary: Primitive,
    parametric: ParametricFamily,
    modulePath: string,
): PlanSymbolRef {
    const kind: PlanSymbolKind =
        primary.kind === 'composite' ? 'composite' : 'parametric';
    const exportName = derivePlanSymbolExportName(primary.kind);

    let halfW: number;
    let halfD: number;
    if (primary.kind === 'box') {
        const w = resolveDimension(primary, 'boxWidth',  parametric, 1);
        const d = resolveDimension(primary, 'boxDepth',  parametric, 1);
        halfW = w / 2;
        halfD = d / 2;
    } else {
        // Unit-square placeholder for non-box primitives in v1.  See TODO.
        halfW = 0.5;
        halfD = 0.5;
    }

    return {
        kind,
        modulePath,
        exportName,
        bboxMinX: -halfW,
        bboxMinY: -halfD,
        bboxMaxX:  halfW,
        bboxMaxY:  halfD,
    };
}

/**
 * Build the placement Footprint for the primary primitive.  For a box,
 * `lengthM = max(W, D)` and `depthM = min(W, D)` — the family's primary
 * axis is the longer side.  Non-box primitives fall back to a unit-square
 * (1m × 1m) footprint.  Clearance fields default to 0; real per-family
 * clearances are a future Footprint-overrides slice.
 */
function buildFootprint(
    primary: Primitive,
    parametric: ParametricFamily,
): Footprint {
    let lengthM: number;
    let depthM: number;
    if (primary.kind === 'box') {
        const w = resolveDimension(primary, 'boxWidth', parametric, 1);
        const d = resolveDimension(primary, 'boxDepth', parametric, 1);
        lengthM = Math.max(w, d);
        depthM  = Math.min(w, d);
    } else {
        lengthM = 1;
        depthM  = 1;
    }
    return {
        lengthM,
        depthM,
        clearFrontM:      0,
        clearSideM:       0,
        clearBackM:       0,
        clearAboveM:      0,
        excludeDoorSwing: false,
    };
}
