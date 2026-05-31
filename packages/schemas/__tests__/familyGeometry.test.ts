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
    // cross-package fixture
    FamilyIdentitySchema,
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
