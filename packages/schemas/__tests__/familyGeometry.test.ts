// P0.5 Stage-3 (Family Platform) — L0 GeneratedGeometry substrate tests.
//
// Mirrors the structure + style of familyParametric.test.ts.  Drives 100%
// coverage (enforced by `vitest.config.ts`) for every schema in the new
// `family-geometry/` substrate.
//
// Covers:
//   - builder-ref:      BuilderKindSchema, BuilderRefSchema
//   - plan-symbol-ref:  PlanSymbolKindSchema, PlanSymbolRefSchema
//   - footprint:        FootprintSchema (incl. clearance defaults)
//   - generated:        GeneratedGeometrySchema (top-level)
//   - cross-imports:    GeneratedGeometry.identity round-trips through
//                       FamilyIdentitySchema

import { describe, expect, it } from 'vitest';
import {
    // builder-ref
    BuilderKindSchema,
    BuilderRefSchema,
    type BuilderKind,
    type BuilderRef,
    // plan-symbol-ref
    PlanSymbolKindSchema,
    PlanSymbolRefSchema,
    type PlanSymbolKind,
    type PlanSymbolRef,
    // footprint
    FootprintSchema,
    type Footprint,
    // generated
    GeneratedGeometrySchema,
    type GeneratedGeometry,
    // from-parametric (Stage-3 synthesiser)
    synthesiseGeometry,
    // cross-package fixture
    FamilyIdentitySchema,
    type ParametricFamily,
    type ParametricParameter,
    type Primitive,
} from '../src/index.js';

// ── Fixture builders ───────────────────────────────────────────────────────

const baseIdentity = () => ({
    id:      'family/com.pryzm.core/desk',
    name:    'Desk',
    version: '1.0.0',
    author:  'PRYZM',
    license: 'MIT',
});

const minimalBuilder = (): BuilderRef => ({
    kind:        'parametric',
    modulePath:  '@pryzm/family-runtime/builders/parametric',
    exportName:  'buildParametric',
    builderHash: 'builder:fixture',
});

const minimalPlanSymbol = (): PlanSymbolRef => ({
    kind:       'parametric',
    modulePath: '@pryzm/family-runtime/plan-symbols/parametric',
    exportName: 'buildPlanSymbol',
    bboxMinX:   -0.75,
    bboxMinY:   -0.375,
    bboxMaxX:   0.75,
    bboxMaxY:   0.375,
});

const minimalFootprint = (): Footprint => ({
    lengthM:          1.5,
    depthM:           0.75,
    clearFrontM:      0,
    clearSideM:       0,
    clearBackM:       0,
    clearAboveM:      0,
    excludeDoorSwing: false,
});

const minimalGeometry = (): GeneratedGeometry => ({
    identity:      baseIdentity(),
    builder:       minimalBuilder(),
    planSymbol:    minimalPlanSymbol(),
    footprint:     minimalFootprint(),
    geometryHash:  'geom:fixture',
    synthesisedAt: '2026-01-01T00:00:00.000Z',
});

// ── BuilderKindSchema ──────────────────────────────────────────────────────

describe('BuilderKindSchema', () => {
    const kinds: BuilderKind[] = ['parametric', 'glb-import', 'mesh-literal', 'composite'];

    for (const kind of kinds) {
        it(`accepts '${kind}'`, () => {
            expect(BuilderKindSchema.safeParse(kind).success).toBe(true);
        });
    }

    it("rejects 'invalid'", () => {
        expect(BuilderKindSchema.safeParse('invalid').success).toBe(false);
    });

    it('rejects an empty string', () => {
        expect(BuilderKindSchema.safeParse('').success).toBe(false);
    });
});

// ── BuilderRefSchema ───────────────────────────────────────────────────────

describe('BuilderRefSchema', () => {
    it('accepts a minimal valid builder ref', () => {
        expect(BuilderRefSchema.safeParse(minimalBuilder()).success).toBe(true);
    });

    it('rejects an empty modulePath', () => {
        const b = { ...minimalBuilder(), modulePath: '' };
        expect(BuilderRefSchema.safeParse(b).success).toBe(false);
    });

    it('rejects an empty exportName', () => {
        const b = { ...minimalBuilder(), exportName: '' };
        expect(BuilderRefSchema.safeParse(b).success).toBe(false);
    });

    it('rejects an empty builderHash', () => {
        const b = { ...minimalBuilder(), builderHash: '' };
        expect(BuilderRefSchema.safeParse(b).success).toBe(false);
    });

    it("rejects an unknown kind ('extruded')", () => {
        const b = { ...minimalBuilder(), kind: 'extruded' };
        expect(BuilderRefSchema.safeParse(b).success).toBe(false);
    });

    it('rejects a missing kind', () => {
        const { kind: _omitted, ...without } = minimalBuilder();
        void _omitted;
        expect(BuilderRefSchema.safeParse(without).success).toBe(false);
    });
});

// ── PlanSymbolKindSchema ───────────────────────────────────────────────────

describe('PlanSymbolKindSchema', () => {
    const kinds: PlanSymbolKind[] = ['parametric', 'svg-literal', 'composite'];

    for (const kind of kinds) {
        it(`accepts '${kind}'`, () => {
            expect(PlanSymbolKindSchema.safeParse(kind).success).toBe(true);
        });
    }

    it("rejects 'png-literal'", () => {
        expect(PlanSymbolKindSchema.safeParse('png-literal').success).toBe(false);
    });
});

// ── PlanSymbolRefSchema ────────────────────────────────────────────────────

describe('PlanSymbolRefSchema', () => {
    it('accepts a minimal valid plan-symbol ref', () => {
        expect(PlanSymbolRefSchema.safeParse(minimalPlanSymbol()).success).toBe(true);
    });

    it('accepts negative bbox coordinates (family-local origin is at the centroid)', () => {
        const p: PlanSymbolRef = {
            ...minimalPlanSymbol(),
            bboxMinX: -2.5,
            bboxMinY: -1.25,
            bboxMaxX: -0.5,
            bboxMaxY: -0.25,
        };
        expect(PlanSymbolRefSchema.safeParse(p).success).toBe(true);
    });

    it('rejects an empty modulePath', () => {
        const p = { ...minimalPlanSymbol(), modulePath: '' };
        expect(PlanSymbolRefSchema.safeParse(p).success).toBe(false);
    });

    it('rejects an empty exportName', () => {
        const p = { ...minimalPlanSymbol(), exportName: '' };
        expect(PlanSymbolRefSchema.safeParse(p).success).toBe(false);
    });

    it('rejects a non-numeric bbox field', () => {
        const p = { ...minimalPlanSymbol(), bboxMinX: 'left' as unknown as number };
        expect(PlanSymbolRefSchema.safeParse(p).success).toBe(false);
    });

    it('rejects a missing bbox field', () => {
        const { bboxMaxY: _omitted, ...without } = minimalPlanSymbol();
        void _omitted;
        expect(PlanSymbolRefSchema.safeParse(without).success).toBe(false);
    });
});

// ── FootprintSchema ────────────────────────────────────────────────────────

describe('FootprintSchema', () => {
    it('accepts a minimal valid footprint', () => {
        expect(FootprintSchema.safeParse(minimalFootprint()).success).toBe(true);
    });

    it('rejects a zero lengthM', () => {
        const f = { ...minimalFootprint(), lengthM: 0 };
        expect(FootprintSchema.safeParse(f).success).toBe(false);
    });

    it('rejects a negative lengthM', () => {
        const f = { ...minimalFootprint(), lengthM: -0.5 };
        expect(FootprintSchema.safeParse(f).success).toBe(false);
    });

    it('rejects a zero depthM', () => {
        const f = { ...minimalFootprint(), depthM: 0 };
        expect(FootprintSchema.safeParse(f).success).toBe(false);
    });

    it('rejects a negative depthM', () => {
        const f = { ...minimalFootprint(), depthM: -0.75 };
        expect(FootprintSchema.safeParse(f).success).toBe(false);
    });

    it('rejects a negative clearance value', () => {
        const f = { ...minimalFootprint(), clearFrontM: -0.1 };
        expect(FootprintSchema.safeParse(f).success).toBe(false);
    });

    it('applies default 0 for clearFrontM / clearSideM / clearBackM / clearAboveM when omitted', () => {
        const parsed = FootprintSchema.parse({ lengthM: 1.5, depthM: 0.75 });
        expect(parsed.clearFrontM).toBe(0);
        expect(parsed.clearSideM).toBe(0);
        expect(parsed.clearBackM).toBe(0);
        expect(parsed.clearAboveM).toBe(0);
    });

    it('applies default false for excludeDoorSwing when omitted', () => {
        const parsed = FootprintSchema.parse({ lengthM: 1.5, depthM: 0.75 });
        expect(parsed.excludeDoorSwing).toBe(false);
    });

    it('preserves explicitly supplied excludeDoorSwing=true', () => {
        const f: Footprint = { ...minimalFootprint(), excludeDoorSwing: true };
        const parsed = FootprintSchema.parse(f);
        expect(parsed.excludeDoorSwing).toBe(true);
    });

    it('accepts non-zero clearance values', () => {
        const f: Footprint = {
            lengthM:          1.5,
            depthM:           0.75,
            clearFrontM:      0.9,
            clearSideM:       0.3,
            clearBackM:       0.05,
            clearAboveM:      0.6,
            excludeDoorSwing: false,
        };
        expect(FootprintSchema.safeParse(f).success).toBe(true);
    });
});

// ── GeneratedGeometrySchema ────────────────────────────────────────────────

describe('GeneratedGeometrySchema', () => {
    it('accepts a minimal valid GeneratedGeometry', () => {
        expect(GeneratedGeometrySchema.safeParse(minimalGeometry()).success).toBe(true);
    });

    it('rejects missing identity', () => {
        const { identity: _omitted, ...without } = minimalGeometry();
        void _omitted;
        expect(GeneratedGeometrySchema.safeParse(without).success).toBe(false);
    });

    it('rejects missing builder', () => {
        const { builder: _omitted, ...without } = minimalGeometry();
        void _omitted;
        expect(GeneratedGeometrySchema.safeParse(without).success).toBe(false);
    });

    it('rejects missing planSymbol', () => {
        const { planSymbol: _omitted, ...without } = minimalGeometry();
        void _omitted;
        expect(GeneratedGeometrySchema.safeParse(without).success).toBe(false);
    });

    it('rejects missing footprint', () => {
        const { footprint: _omitted, ...without } = minimalGeometry();
        void _omitted;
        expect(GeneratedGeometrySchema.safeParse(without).success).toBe(false);
    });

    it('rejects an empty geometryHash', () => {
        const g = { ...minimalGeometry(), geometryHash: '' };
        expect(GeneratedGeometrySchema.safeParse(g).success).toBe(false);
    });

    it('rejects an empty synthesisedAt', () => {
        const g = { ...minimalGeometry(), synthesisedAt: '' };
        expect(GeneratedGeometrySchema.safeParse(g).success).toBe(false);
    });

    it('rejects when identity.version is non-semver (propagates from FamilyIdentitySchema)', () => {
        const g = minimalGeometry();
        g.identity = { ...g.identity, version: '1.0' };
        expect(GeneratedGeometrySchema.safeParse(g).success).toBe(false);
    });

    it('rejects when builder.modulePath is empty (propagates from BuilderRefSchema)', () => {
        const g = minimalGeometry();
        g.builder = { ...g.builder, modulePath: '' };
        expect(GeneratedGeometrySchema.safeParse(g).success).toBe(false);
    });

    it('rejects when footprint.lengthM is zero (propagates from FootprintSchema)', () => {
        const g = minimalGeometry();
        g.footprint = { ...g.footprint, lengthM: 0 };
        expect(GeneratedGeometrySchema.safeParse(g).success).toBe(false);
    });

    it('round-trips a parsed GeneratedGeometry through safeParse (no shape mutation)', () => {
        const g = minimalGeometry();
        const parsed = GeneratedGeometrySchema.safeParse(g);
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data.identity).toEqual(g.identity);
            expect(parsed.data.builder).toEqual(g.builder);
            expect(parsed.data.planSymbol).toEqual(g.planSymbol);
            expect(parsed.data.footprint).toEqual(g.footprint);
            expect(parsed.data.geometryHash).toBe(g.geometryHash);
            expect(parsed.data.synthesisedAt).toBe(g.synthesisedAt);
        }
    });

    it('accepts a maximal GeneratedGeometry (every clearance + excludeDoorSwing=true)', () => {
        const g: GeneratedGeometry = {
            identity:      baseIdentity(),
            builder:       {
                kind:        'glb-import',
                modulePath:  '@pryzm/family-runtime/builders/glb',
                exportName:  'loadGlb',
                builderHash: 'builder:glb@v2',
            },
            planSymbol:    {
                kind:       'svg-literal',
                modulePath: '@pryzm/family-runtime/plan-symbols/svg',
                exportName: 'drawSvg',
                bboxMinX:   -0.9,
                bboxMinY:   -0.45,
                bboxMaxX:   0.9,
                bboxMaxY:   0.45,
            },
            footprint:     {
                lengthM:          1.8,
                depthM:           0.9,
                clearFrontM:      0.7,
                clearSideM:       0.2,
                clearBackM:       0.05,
                clearAboveM:      1.2,
                excludeDoorSwing: true,
            },
            geometryHash:  'geom:desk-maximal@v1',
            synthesisedAt: '2026-02-02T12:34:56.000Z',
        };
        expect(GeneratedGeometrySchema.safeParse(g).success).toBe(true);
    });
});

// ── Cross-imports ──────────────────────────────────────────────────────────

describe('cross-imports', () => {
    it("a GeneratedGeometry's identity is a valid FamilyIdentity in isolation", () => {
        const g = minimalGeometry();
        expect(FamilyIdentitySchema.safeParse(g.identity).success).toBe(true);
    });

    it("a GeneratedGeometry's identity is REJECTED when version is non-semver (full propagation)", () => {
        const g = minimalGeometry();
        g.identity = { ...g.identity, version: 'not-semver' };
        expect(GeneratedGeometrySchema.safeParse(g).success).toBe(false);
    });
});

// ── synthesiseGeometry (Stage-3 transformer) ───────────────────────────────

const PINNED_TS = '2026-05-31T12:00:00.000Z';

const makeParam = (
    overrides: Partial<ParametricParameter['range']> = {},
): ParametricParameter => ({
    range: {
        name:         'widthM',
        unit:         'm',
        min:          0.1,
        max:          5,
        defaultValue: 1,
        ...overrides,
    },
});

const makeBoxPrimitive = (
    overrides: Partial<Primitive> = {},
): Primitive => ({
    id:           'box-0',
    kind:         'box',
    dimensions:   { boxWidth: 1.5, boxDepth: 0.75, boxHeight: 0.9 },
    transform:    {
        translate: { x: 0, y: 0, z: 0 },
        rotateDeg: { x: 0, y: 0, z: 0 },
        scale:     { x: 1, y: 1, z: 1 },
    },
    materialSlot: 'default',
    ...overrides,
});

const makeParametric = (
    primitives: Primitive[],
    overrides: {
        id?: string;
        version?: string;
        parameters?: Record<string, ParametricParameter>;
    } = {},
): ParametricFamily => ({
    identity: {
        id:      overrides.id ?? 'family/com.pryzm.core/desk',
        name:    'Desk',
        version: overrides.version ?? '1.0.0',
        author:  'PRYZM',
        license: 'MIT',
    },
    parameters:     overrides.parameters ?? {},
    primitives,
    parametricHash: 'parametric:desk@v1',
    decomposedAt:   '2026-01-01T00:00:00.000Z',
});

describe('synthesiseGeometry', () => {
    it('produces a valid GeneratedGeometry that round-trips through GeneratedGeometrySchema.parse', () => {
        const parametric = makeParametric([makeBoxPrimitive()]);
        const out = synthesiseGeometry(parametric, { synthesisedAt: PINNED_TS });
        const parsed = GeneratedGeometrySchema.safeParse(out);
        expect(parsed.success).toBe(true);
    });

    it('throws with a descriptive message when primitives array is empty', () => {
        // Bypass TypeScript's Array.min(1) inference; the contract guard is
        // defensive against hand-built objects that elude the upstream Zod
        // parse (`ParametricFamilySchema.primitives` uses `.min(1)`).
        const empty = makeParametric([]);
        (empty as unknown as { primitives: Primitive[] }).primitives = [];
        expect(() => synthesiseGeometry(empty)).toThrow(/non-empty/i);
    });

    it("BuilderRef.kind === 'parametric' for a box primitive", () => {
        const out = synthesiseGeometry(
            makeParametric([makeBoxPrimitive()]),
            { synthesisedAt: PINNED_TS },
        );
        expect(out.builder.kind).toBe('parametric');
        expect(out.builder.exportName).toBe('buildBox');
    });

    it("BuilderRef.exportName === 'buildCylinder' for a cylinder primitive", () => {
        const cyl = makeBoxPrimitive({
            id:         'cyl-0',
            kind:       'cylinder',
            dimensions: { cylinderRadius: 0.4, cylinderHeight: 1 },
        });
        const out = synthesiseGeometry(
            makeParametric([cyl]),
            { synthesisedAt: PINNED_TS },
        );
        expect(out.builder.kind).toBe('parametric');
        expect(out.builder.exportName).toBe('buildCylinder');
    });

    it("BuilderRef.exportName === 'buildExtrusion' for an extrusion primitive", () => {
        const ext = makeBoxPrimitive({
            id:         'ext-0',
            kind:       'extrusion',
            dimensions: { profileLength: 1, extrudeDepth: 0.2 },
        });
        const out = synthesiseGeometry(
            makeParametric([ext]),
            { synthesisedAt: PINNED_TS },
        );
        expect(out.builder.exportName).toBe('buildExtrusion');
    });

    it("BuilderRef.kind === 'composite' + exportName === 'buildComposite' for a composite primitive", () => {
        const comp = makeBoxPrimitive({
            id:         'comp-0',
            kind:       'composite',
            dimensions: {},
        });
        const out = synthesiseGeometry(
            makeParametric([comp]),
            { synthesisedAt: PINNED_TS },
        );
        expect(out.builder.kind).toBe('composite');
        expect(out.builder.exportName).toBe('buildComposite');
        // PlanSymbolRef likewise discriminates on composite
        expect(out.planSymbol.kind).toBe('composite');
        expect(out.planSymbol.exportName).toBe('planSymbolComposite');
    });

    it("PlanSymbolRef.kind === 'parametric' + correct exportName for every parametric kind", () => {
        const kinds = ['box', 'cylinder', 'extrusion', 'sweep', 'revolve', 'loft'] as const;
        for (const kind of kinds) {
            const p = makeBoxPrimitive({ id: `${kind}-0`, kind, dimensions: {} });
            const out = synthesiseGeometry(
                makeParametric([p]),
                { synthesisedAt: PINNED_TS },
            );
            expect(out.planSymbol.kind).toBe('parametric');
            // capitalise: 'box' → 'planSymbolBox', etc.
            const expected = `planSymbol${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
            expect(out.planSymbol.exportName).toBe(expected);
        }
    });

    it('bbox is centred on the origin for a box primitive with literal dimensions', () => {
        const box = makeBoxPrimitive({
            dimensions: { boxWidth: 2, boxDepth: 1, boxHeight: 0.9 },
        });
        const out = synthesiseGeometry(
            makeParametric([box]),
            { synthesisedAt: PINNED_TS },
        );
        expect(out.planSymbol.bboxMinX).toBe(-1);
        expect(out.planSymbol.bboxMaxX).toBe(1);
        expect(out.planSymbol.bboxMinY).toBe(-0.5);
        expect(out.planSymbol.bboxMaxY).toBe(0.5);
    });

    it('bbox uses the parameter default for a box primitive with ParameterRef dimensions', () => {
        const box = makeBoxPrimitive({
            dimensions: {
                boxWidth:  { paramName: 'widthM' },
                boxDepth:  { paramName: 'depthM' },
                boxHeight: { paramName: 'heightM' },
            },
        });
        const parametric = makeParametric([box], {
            parameters: {
                widthM:  makeParam({ name: 'widthM',  defaultValue: 1.6 }),
                depthM:  makeParam({ name: 'depthM',  defaultValue: 0.8, min: 0.1, max: 2 }),
                heightM: makeParam({ name: 'heightM', defaultValue: 0.9, min: 0.1, max: 1.5 }),
            },
        });
        const out = synthesiseGeometry(parametric, { synthesisedAt: PINNED_TS });
        expect(out.planSymbol.bboxMinX).toBe(-0.8);
        expect(out.planSymbol.bboxMaxX).toBe(0.8);
        expect(out.planSymbol.bboxMinY).toBe(-0.4);
        expect(out.planSymbol.bboxMaxY).toBe(0.4);
    });

    it('bbox falls back to fixture default when a ParameterRef points at an unknown parameter', () => {
        // Defensive: TypeScript permits this since ParameterRef is just
        // `{ paramName: string }` — the synthesiser degrades to the
        // dimension's fixture default (1) instead of throwing.
        const box = makeBoxPrimitive({
            dimensions: { boxWidth: { paramName: 'unknown' }, boxDepth: 0.6 },
        });
        const out = synthesiseGeometry(
            makeParametric([box]),
            { synthesisedAt: PINNED_TS },
        );
        // boxWidth falls back to 1 (fixture default); boxDepth = 0.6
        expect(out.planSymbol.bboxMinX).toBe(-0.5);
        expect(out.planSymbol.bboxMaxX).toBe(0.5);
        expect(out.planSymbol.bboxMinY).toBe(-0.3);
        expect(out.planSymbol.bboxMaxY).toBe(0.3);
    });

    it('bbox falls back to fixture default when a box primitive omits a dimension key', () => {
        const box = makeBoxPrimitive({
            // No boxWidth / boxDepth supplied — synthesiser uses the
            // unit-square fallback per axis.
            dimensions: {},
        });
        const out = synthesiseGeometry(
            makeParametric([box]),
            { synthesisedAt: PINNED_TS },
        );
        expect(out.planSymbol.bboxMinX).toBe(-0.5);
        expect(out.planSymbol.bboxMaxX).toBe(0.5);
    });

    it('bbox is a unit square for non-box parametric primitives (placeholder until per-kind extractors land)', () => {
        const cyl = makeBoxPrimitive({
            kind:       'cylinder',
            dimensions: { cylinderRadius: 0.4, cylinderHeight: 1 },
        });
        const out = synthesiseGeometry(
            makeParametric([cyl]),
            { synthesisedAt: PINNED_TS },
        );
        expect(out.planSymbol.bboxMinX).toBe(-0.5);
        expect(out.planSymbol.bboxMaxX).toBe(0.5);
        expect(out.planSymbol.bboxMinY).toBe(-0.5);
        expect(out.planSymbol.bboxMaxY).toBe(0.5);
    });

    it('Footprint.lengthM = max(boxWidth, boxDepth); depthM = min', () => {
        const box = makeBoxPrimitive({
            dimensions: { boxWidth: 1.5, boxDepth: 0.75, boxHeight: 0.9 },
        });
        const out = synthesiseGeometry(
            makeParametric([box]),
            { synthesisedAt: PINNED_TS },
        );
        expect(out.footprint.lengthM).toBe(1.5);
        expect(out.footprint.depthM).toBe(0.75);
    });

    it('Footprint.lengthM = depthM when boxWidth and boxDepth are equal', () => {
        const box = makeBoxPrimitive({
            dimensions: { boxWidth: 0.9, boxDepth: 0.9, boxHeight: 0.4 },
        });
        const out = synthesiseGeometry(
            makeParametric([box]),
            { synthesisedAt: PINNED_TS },
        );
        expect(out.footprint.lengthM).toBe(0.9);
        expect(out.footprint.depthM).toBe(0.9);
    });

    it('Footprint.lengthM = depthM = 1 for a non-box primitive (unit-square placeholder)', () => {
        const sweep = makeBoxPrimitive({
            kind:       'sweep',
            dimensions: { sweepPathLength: 2 },
        });
        const out = synthesiseGeometry(
            makeParametric([sweep]),
            { synthesisedAt: PINNED_TS },
        );
        expect(out.footprint.lengthM).toBe(1);
        expect(out.footprint.depthM).toBe(1);
    });

    it('Footprint clearance fields default to 0 and excludeDoorSwing defaults to false', () => {
        const out = synthesiseGeometry(
            makeParametric([makeBoxPrimitive()]),
            { synthesisedAt: PINNED_TS },
        );
        expect(out.footprint.clearFrontM).toBe(0);
        expect(out.footprint.clearSideM).toBe(0);
        expect(out.footprint.clearBackM).toBe(0);
        expect(out.footprint.clearAboveM).toBe(0);
        expect(out.footprint.excludeDoorSwing).toBe(false);
    });

    it('geometryHash is deterministic — same input → same hash', () => {
        const parametric = makeParametric([makeBoxPrimitive()]);
        const a = synthesiseGeometry(parametric, { synthesisedAt: PINNED_TS });
        const b = synthesiseGeometry(parametric, { synthesisedAt: PINNED_TS });
        expect(a.geometryHash).toBe(b.geometryHash);
    });

    it('geometryHash CHANGES when identity.version changes', () => {
        const a = synthesiseGeometry(
            makeParametric([makeBoxPrimitive()], { version: '1.0.0' }),
            { synthesisedAt: PINNED_TS },
        );
        const b = synthesiseGeometry(
            makeParametric([makeBoxPrimitive()], { version: '2.0.0' }),
            { synthesisedAt: PINNED_TS },
        );
        expect(a.geometryHash).not.toBe(b.geometryHash);
    });

    it('geometryHash CHANGES when the primitive kind changes', () => {
        const box = makeBoxPrimitive();
        const cyl = makeBoxPrimitive({
            kind:       'cylinder',
            dimensions: { cylinderRadius: 0.4, cylinderHeight: 1 },
        });
        const a = synthesiseGeometry(
            makeParametric([box]),
            { synthesisedAt: PINNED_TS },
        );
        const b = synthesiseGeometry(
            makeParametric([cyl]),
            { synthesisedAt: PINNED_TS },
        );
        expect(a.geometryHash).not.toBe(b.geometryHash);
    });

    it('builderHash includes identity + primitive kind + primitive id', () => {
        const out = synthesiseGeometry(
            makeParametric([makeBoxPrimitive({ id: 'p-special' })]),
            { synthesisedAt: PINNED_TS },
        );
        expect(out.builder.builderHash).toContain('family/com.pryzm.core/desk');
        expect(out.builder.builderHash).toContain('1.0.0');
        expect(out.builder.builderHash).toContain('box');
        expect(out.builder.builderHash).toContain('p-special');
    });

    it('opts.synthesisedAt pins the timestamp verbatim', () => {
        const out = synthesiseGeometry(
            makeParametric([makeBoxPrimitive()]),
            { synthesisedAt: PINNED_TS },
        );
        expect(out.synthesisedAt).toBe(PINNED_TS);
    });

    it('default synthesisedAt is a valid ISO 8601 string', () => {
        const out = synthesiseGeometry(makeParametric([makeBoxPrimitive()]));
        expect(out.synthesisedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        expect(Number.isNaN(Date.parse(out.synthesisedAt))).toBe(false);
    });

    it('falls back to new Date().toISOString() when opts.synthesisedAt is undefined (no opts at all)', () => {
        const out = synthesiseGeometry(makeParametric([makeBoxPrimitive()]));
        const stampedMs = Date.parse(out.synthesisedAt);
        expect(Math.abs(Date.now() - stampedMs)).toBeLessThan(5_000);
    });

    it('opts.defaultBuilderModulePath propagates to BuilderRef.modulePath', () => {
        const out = synthesiseGeometry(
            makeParametric([makeBoxPrimitive()]),
            {
                synthesisedAt:            PINNED_TS,
                defaultBuilderModulePath: '@my-vendor/custom-builder',
            },
        );
        expect(out.builder.modulePath).toBe('@my-vendor/custom-builder');
    });

    it('opts.defaultPlanSymbolModulePath propagates to PlanSymbolRef.modulePath', () => {
        const out = synthesiseGeometry(
            makeParametric([makeBoxPrimitive()]),
            {
                synthesisedAt:               PINNED_TS,
                defaultPlanSymbolModulePath: '@my-vendor/custom-plan-symbol',
            },
        );
        expect(out.planSymbol.modulePath).toBe('@my-vendor/custom-plan-symbol');
    });

    it('default modulePaths point at the @pryzm/family-instance bundle', () => {
        const out = synthesiseGeometry(
            makeParametric([makeBoxPrimitive()]),
            { synthesisedAt: PINNED_TS },
        );
        expect(out.builder.modulePath).toBe('@pryzm/family-instance/parametric-builder');
        expect(out.planSymbol.modulePath).toBe('@pryzm/family-instance/plan-symbol-builder');
    });

    it('pure: same input → same output (modulo timestamp)', () => {
        const parametric = makeParametric([makeBoxPrimitive()]);
        const a = synthesiseGeometry(parametric, { synthesisedAt: PINNED_TS });
        const b = synthesiseGeometry(parametric, { synthesisedAt: PINNED_TS });
        expect(a).toEqual(b);
    });

    it('identity passes through by reference (output.identity === input.identity)', () => {
        const parametric = makeParametric([makeBoxPrimitive()]);
        const out = synthesiseGeometry(parametric, { synthesisedAt: PINNED_TS });
        expect(out.identity).toBe(parametric.identity);
    });

    it('only the FIRST primitive drives the output (multi-primitive composite is a later slice)', () => {
        // v1 picks primitives[0]; subsequent primitives are ignored.
        const box = makeBoxPrimitive({ id: 'box-primary', dimensions: { boxWidth: 1.2, boxDepth: 0.6 } });
        const cyl = makeBoxPrimitive({ id: 'cyl-secondary', kind: 'cylinder', dimensions: {} });
        const out = synthesiseGeometry(
            makeParametric([box, cyl]),
            { synthesisedAt: PINNED_TS },
        );
        // The primary box's kind drives the BuilderRef and footprint.
        expect(out.builder.exportName).toBe('buildBox');
        expect(out.builder.builderHash).toContain('box-primary');
        expect(out.builder.builderHash).not.toContain('cyl-secondary');
        expect(out.footprint.lengthM).toBe(1.2);
        expect(out.footprint.depthM).toBe(0.6);
    });
});
