// P0.5 slice 0 (Family Platform) — L0 ParametricFamily substrate tests.
//
// Mirrors the structure + style of familyDefinition.test.ts.  Drives 100%
// coverage (enforced by `vitest.config.ts`) for every schema in the new
// `family-parametric/` substrate.
//
// Covers:
//   - primitive:  PrimitiveKindSchema, Vec3Schema, PrimitiveTransformSchema,
//                 ParameterRefSchema, ParametricValueSchema, PrimitiveSchema
//   - parameter:  ParametricParameterSchema
//   - family:     ParametricFamilySchema (top-level)
//   - cross-imports: ParametricParameter.range round-trips through
//                    ParametricRangeSchema

import { describe, expect, it } from 'vitest';
import {
    // primitive
    PrimitiveKindSchema,
    Vec3Schema,
    PrimitiveTransformSchema,
    ParameterRefSchema,
    ParametricValueSchema,
    PrimitiveSchema,
    type PrimitiveKind,
    type Vec3,
    type PrimitiveTransform,
    type ParameterRef,
    type ParametricValue,
    type Primitive,
    // parameter
    ParametricParameterSchema,
    type ParametricParameter,
    // family
    ParametricFamilySchema,
    type ParametricFamily,
    // cross-package fixture (from family-request slice)
    ParametricRangeSchema,
    type ParametricRange,
} from '../src/index.js';

// ── Fixture builders ───────────────────────────────────────────────────────

const baseIdentity = () => ({
    id:      'family/com.pryzm.core/desk',
    name:    'Desk',
    version: '1.0.0',
    author:  'PRYZM',
    license: 'MIT',
});

const baseRange = (): ParametricRange => ({
    name:         'width',
    unit:         'm',
    min:          0.5,
    max:          2.4,
    defaultValue: 1.5,
});

const minimalPrimitive = (): Primitive => ({
    id:           'box-1',
    kind:         'box',
    dimensions:   { boxWidth: 1.5, boxDepth: 0.75, boxHeight: 0.72 },
    transform:    { translate: { x: 0, y: 0, z: 0 }, rotateDeg: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
    materialSlot: 'default',
});

const minimalParameter = (): ParametricParameter => ({
    range: baseRange(),
});

const minimalFamily = (): ParametricFamily => ({
    identity:       baseIdentity(),
    parameters:     { width: minimalParameter() },
    primitives:     [minimalPrimitive()],
    parametricHash: 'param:fixture',
    decomposedAt:   '2026-01-01T00:00:00.000Z',
});

// ── PrimitiveKindSchema ────────────────────────────────────────────────────

describe('PrimitiveKindSchema', () => {
    const kinds: PrimitiveKind[] = ['box', 'cylinder', 'extrusion', 'sweep', 'revolve', 'loft', 'composite'];

    for (const kind of kinds) {
        it(`accepts '${kind}'`, () => {
            expect(PrimitiveKindSchema.safeParse(kind).success).toBe(true);
        });
    }

    it("rejects 'sphere'", () => {
        expect(PrimitiveKindSchema.safeParse('sphere').success).toBe(false);
    });

    it('rejects an empty string', () => {
        expect(PrimitiveKindSchema.safeParse('').success).toBe(false);
    });
});

// ── Vec3Schema ─────────────────────────────────────────────────────────────

describe('Vec3Schema', () => {
    it('accepts finite numbers including zero and negatives', () => {
        const v: Vec3 = { x: 0, y: -1.25, z: 3.14 };
        expect(Vec3Schema.safeParse(v).success).toBe(true);
    });

    it('rejects NaN on any axis', () => {
        expect(Vec3Schema.safeParse({ x: NaN, y: 0, z: 0 }).success).toBe(false);
        expect(Vec3Schema.safeParse({ x: 0, y: NaN, z: 0 }).success).toBe(false);
        expect(Vec3Schema.safeParse({ x: 0, y: 0, z: NaN }).success).toBe(false);
    });

    it('rejects +Infinity and -Infinity', () => {
        expect(Vec3Schema.safeParse({ x: Infinity,  y: 0, z: 0 }).success).toBe(false);
        expect(Vec3Schema.safeParse({ x: -Infinity, y: 0, z: 0 }).success).toBe(false);
    });

    it('rejects when an axis is missing', () => {
        expect(Vec3Schema.safeParse({ x: 0, y: 0 }).success).toBe(false);
    });
});

// ── PrimitiveTransformSchema ───────────────────────────────────────────────

describe('PrimitiveTransformSchema', () => {
    it('applies the identity defaults when given an empty object', () => {
        const parsed = PrimitiveTransformSchema.parse({});
        const expected: PrimitiveTransform = {
            translate: { x: 0, y: 0, z: 0 },
            rotateDeg: { x: 0, y: 0, z: 0 },
            scale:     { x: 1, y: 1, z: 1 },
        };
        expect(parsed).toEqual(expected);
    });

    it('preserves explicitly supplied translate/rotateDeg/scale', () => {
        const t: PrimitiveTransform = {
            translate: { x: 1, y: 2, z: 3 },
            rotateDeg: { x: 90, y: 0, z: -45 },
            scale:     { x: 2, y: 2, z: 2 },
        };
        expect(PrimitiveTransformSchema.parse(t)).toEqual(t);
    });

    it('rejects a non-finite axis on translate', () => {
        const t = { translate: { x: NaN, y: 0, z: 0 } };
        expect(PrimitiveTransformSchema.safeParse(t).success).toBe(false);
    });
});

// ── ParameterRefSchema ─────────────────────────────────────────────────────

describe('ParameterRefSchema', () => {
    it('accepts a non-empty paramName', () => {
        const ref: ParameterRef = { paramName: 'width' };
        expect(ParameterRefSchema.safeParse(ref).success).toBe(true);
    });

    it('rejects an empty paramName', () => {
        expect(ParameterRefSchema.safeParse({ paramName: '' }).success).toBe(false);
    });

    it('rejects a missing paramName', () => {
        expect(ParameterRefSchema.safeParse({}).success).toBe(false);
    });
});

// ── ParametricValueSchema ──────────────────────────────────────────────────

describe('ParametricValueSchema', () => {
    it('accepts a finite literal number', () => {
        const v: ParametricValue = 0.75;
        expect(ParametricValueSchema.safeParse(v).success).toBe(true);
    });

    it('accepts a ParameterRef', () => {
        const v: ParametricValue = { paramName: 'width' };
        expect(ParametricValueSchema.safeParse(v).success).toBe(true);
    });

    it('rejects NaN', () => {
        expect(ParametricValueSchema.safeParse(NaN).success).toBe(false);
    });

    it('rejects a ref with an empty paramName', () => {
        expect(ParametricValueSchema.safeParse({ paramName: '' }).success).toBe(false);
    });
});

// ── PrimitiveSchema ────────────────────────────────────────────────────────

describe('PrimitiveSchema', () => {
    it('accepts a minimal box primitive with literal dimensions', () => {
        expect(PrimitiveSchema.safeParse(minimalPrimitive()).success).toBe(true);
    });

    it('accepts a primitive whose dimensions mix literals and parameter refs', () => {
        const p: Primitive = {
            id:           'box-mixed',
            kind:         'box',
            dimensions:   {
                boxWidth:  { paramName: 'width' },
                boxDepth:  0.75,
                boxHeight: { paramName: 'height' },
            },
            transform:    { translate: { x: 0, y: 0, z: 0 }, rotateDeg: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
            materialSlot: 'default',
        };
        expect(PrimitiveSchema.safeParse(p).success).toBe(true);
    });

    it("applies the 'default' materialSlot default when omitted", () => {
        const { materialSlot: _omitted, ...without } = minimalPrimitive();
        void _omitted;
        const parsed = PrimitiveSchema.parse(without);
        expect(parsed.materialSlot).toBe('default');
    });

    it('applies the identity transform default when omitted', () => {
        const { transform: _omitted, ...without } = minimalPrimitive();
        void _omitted;
        const parsed = PrimitiveSchema.parse(without);
        expect(parsed.transform).toEqual({
            translate: { x: 0, y: 0, z: 0 },
            rotateDeg: { x: 0, y: 0, z: 0 },
            scale:     { x: 1, y: 1, z: 1 },
        });
    });

    it('rejects an empty id', () => {
        const p = { ...minimalPrimitive(), id: '' };
        expect(PrimitiveSchema.safeParse(p).success).toBe(false);
    });

    it("rejects an unknown kind ('sphere')", () => {
        const p = { ...minimalPrimitive(), kind: 'sphere' };
        expect(PrimitiveSchema.safeParse(p).success).toBe(false);
    });

    it('rejects an empty materialSlot when supplied', () => {
        const p = { ...minimalPrimitive(), materialSlot: '' };
        expect(PrimitiveSchema.safeParse(p).success).toBe(false);
    });

    it('accepts an empty dimensions map (some primitives have none)', () => {
        const p: Primitive = { ...minimalPrimitive(), dimensions: {} };
        expect(PrimitiveSchema.safeParse(p).success).toBe(true);
    });
});

// ── ParametricParameterSchema ──────────────────────────────────────────────

describe('ParametricParameterSchema', () => {
    it('accepts a parameter with a range and no constraint', () => {
        expect(ParametricParameterSchema.safeParse(minimalParameter()).success).toBe(true);
    });

    it('accepts a parameter with a range AND a constraint string', () => {
        const p: ParametricParameter = { range: baseRange(), constraint: 'depth >= width / 2' };
        expect(ParametricParameterSchema.safeParse(p).success).toBe(true);
    });

    it('rejects when range is missing', () => {
        expect(ParametricParameterSchema.safeParse({}).success).toBe(false);
    });

    it('propagates ParametricRangeSchema validation (bad unit rejected)', () => {
        const p = { range: { ...baseRange(), unit: 'parsecs' } };
        expect(ParametricParameterSchema.safeParse(p).success).toBe(false);
    });
});

// ── ParametricFamilySchema ─────────────────────────────────────────────────

describe('ParametricFamilySchema', () => {
    it('accepts a minimal valid family (1 primitive + 1 parameter)', () => {
        expect(ParametricFamilySchema.safeParse(minimalFamily()).success).toBe(true);
    });

    it('rejects an empty primitives array', () => {
        const f = { ...minimalFamily(), primitives: [] };
        expect(ParametricFamilySchema.safeParse(f).success).toBe(false);
    });

    it('rejects an empty parametricHash', () => {
        const f = { ...minimalFamily(), parametricHash: '' };
        expect(ParametricFamilySchema.safeParse(f).success).toBe(false);
    });

    it('rejects an empty decomposedAt', () => {
        const f = { ...minimalFamily(), decomposedAt: '' };
        expect(ParametricFamilySchema.safeParse(f).success).toBe(false);
    });

    it('rejects when identity.version is non-semver (propagates from FamilyIdentitySchema)', () => {
        const f = minimalFamily();
        f.identity = { ...f.identity, version: '1.0' };
        expect(ParametricFamilySchema.safeParse(f).success).toBe(false);
    });

    it('accepts a parameters map with multiple entries', () => {
        const f = minimalFamily();
        f.parameters = {
            width:  { range: { name: 'width',  unit: 'm', min: 0.5, max: 2.4, defaultValue: 1.5 } },
            height: { range: { name: 'height', unit: 'm', min: 0.5, max: 2.4, defaultValue: 0.72 }, constraint: 'height <= width' },
        };
        expect(ParametricFamilySchema.safeParse(f).success).toBe(true);
    });

    it('accepts an empty parameters map (a fully-fixed family has no parameters)', () => {
        const f = { ...minimalFamily(), parameters: {} };
        expect(ParametricFamilySchema.safeParse(f).success).toBe(true);
    });

    it('round-trips a parsed family through safeParse (no shape mutation)', () => {
        const f = minimalFamily();
        const parsed = ParametricFamilySchema.safeParse(f);
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data.identity).toEqual(f.identity);
            expect(parsed.data.primitives).toHaveLength(1);
            expect(parsed.data.parametricHash).toBe(f.parametricHash);
        }
    });

    it('round-trips a maximal family (mixed primitive kinds + multiple parameters)', () => {
        const f: ParametricFamily = {
            identity:   baseIdentity(),
            parameters: {
                width:  { range: { name: 'width',  unit: 'm', min: 0.5, max: 2.4, defaultValue: 1.5 } },
                depth:  { range: { name: 'depth',  unit: 'm', min: 0.3, max: 1.0, defaultValue: 0.75 }, constraint: 'depth >= width / 4' },
                height: { range: { name: 'height', unit: 'm', min: 0.5, max: 2.4, defaultValue: 0.72 } },
            },
            primitives: [
                {
                    id:           'top',
                    kind:         'box',
                    dimensions:   { boxWidth: { paramName: 'width' }, boxDepth: { paramName: 'depth' }, boxHeight: 0.04 },
                    transform:    { translate: { x: 0, y: 0, z: 0.68 }, rotateDeg: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
                    materialSlot: 'top-surface',
                },
                {
                    id:           'leg-front-left',
                    kind:         'cylinder',
                    dimensions:   { cylinderRadius: 0.025, cylinderHeight: { paramName: 'height' } },
                    transform:    { translate: { x: -0.7, y: -0.3, z: 0.34 }, rotateDeg: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
                    materialSlot: 'leg',
                },
            ],
            parametricHash: 'param:desk@v1',
            decomposedAt:   '2026-02-02T12:34:56.000Z',
        };
        expect(ParametricFamilySchema.safeParse(f).success).toBe(true);
    });
});

// ── Cross-imports ──────────────────────────────────────────────────────────

describe('cross-imports', () => {
    it("a ParametricFamily's parameter range is a valid ParametricRange in isolation", () => {
        const f = minimalFamily();
        const range = f.parameters.width!.range;
        expect(ParametricRangeSchema.safeParse(range).success).toBe(true);
    });

    it("a ParametricFamily's identity is a valid FamilyIdentity (semver propagation)", () => {
        // We don't import FamilyIdentitySchema here to keep the test focused
        // on the family-parametric surface; but a non-semver version should
        // be rejected by ParametricFamilySchema thanks to the cross-import.
        const f = minimalFamily();
        f.identity = { ...f.identity, version: 'not-semver' };
        expect(ParametricFamilySchema.safeParse(f).success).toBe(false);
    });
});
