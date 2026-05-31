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
    // Stage-2 decomposer (slice 1)
    decomposeFamily,
    resolveAxis,
    computeParametricHash,
    type FromDefinitionOptions,
    // cross-package fixture (from family-request slice)
    ParametricRangeSchema,
    type ParametricRange,
    // cross-package fixture (from family-definition slice — Stage-2 input)
    type FamilyDefinition,
    type FamilyDefinitionDerived,
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

// ── Stage-2 decomposer fixtures ────────────────────────────────────────────

const baseDerived = (): FamilyDefinitionDerived => ({
    canonicalSemanticNames: ['desk'],
    volumeM3:               1.5 * 0.75 * 0.72,
    footprintAreaM2:        1.5 * 0.75,
    canonicalHash:          'def:fixture',
    ingestedAt:             '2026-01-01T00:00:00.000Z',
});

const minimalDefinition = (overrides?: {
    parametricRanges?: ParametricRange[];
    dimensions?:       { widthM: number; depthM: number; heightM: number };
}): FamilyDefinition => ({
    identity:      baseIdentity(),
    documentation: { pdfs: [], specSheets: [], referenceImages: [] },
    geometry:      {
        dimensions:         overrides?.dimensions ?? { widthM: 1.5, depthM: 0.75, heightM: 0.72 },
        parametricRanges:   overrides?.parametricRanges ?? [],
        hostedRelationship: { hostKind: 'none' },
    },
    behaviour:     { movable: true, hosted: false, mountClass: 'floor' },
    constraints:   { excludeWallTypes: [] },
    placement:     {
        defaultAnchor:  'wall-window',
        allowedAnchors: [],
        excludedWalls:  [],
    },
    bim:           { entityType: 'IfcFurniture', psets: [] },
    ai:            { semanticNames: ['desk'], synonyms: [], cuesForPrompts: [] },
    derived:       baseDerived(),
});

// ── decomposeFamily ────────────────────────────────────────────────────────

describe('decomposeFamily', () => {
    const PINNED: FromDefinitionOptions = { decomposedAt: '2026-03-03T00:00:00.000Z' };

    it('produces a ParametricFamily that round-trips through ParametricFamilySchema', () => {
        const out = decomposeFamily(minimalDefinition(), PINNED);
        expect(ParametricFamilySchema.safeParse(out).success).toBe(true);
    });

    it('empty parametricRanges → parameters: {} + literal box dimensions', () => {
        const def = minimalDefinition({ parametricRanges: [] });
        const out = decomposeFamily(def, PINNED);
        expect(out.parameters).toEqual({});
        expect(out.primitives[0]!.dimensions).toEqual({
            boxWidth:  1.5,
            boxDepth:  0.75,
            boxHeight: 0.72,
        });
    });

    it('promotes each parametricRange to a first-class ParametricParameter', () => {
        const ranges: ParametricRange[] = [
            { name: 'width',  unit: 'm', min: 0.5, max: 2.4, defaultValue: 1.5 },
            { name: 'height', unit: 'm', min: 0.5, max: 2.4, defaultValue: 0.72 },
        ];
        const out = decomposeFamily(minimalDefinition({ parametricRanges: ranges }), PINNED);
        expect(Object.keys(out.parameters).sort()).toEqual(['height', 'width']);
        expect(out.parameters.width!.range).toEqual(ranges[0]);
        expect(out.parameters.height!.range).toEqual(ranges[1]);
        // No constraint expression added by v1 decomposer.
        expect(out.parameters.width!.constraint).toBeUndefined();
        expect(out.parameters.height!.constraint).toBeUndefined();
    });

    it("box dimensions become ParameterRefs when range names match 'width' / 'depth' / 'height'", () => {
        const ranges: ParametricRange[] = [
            { name: 'width',  unit: 'm', min: 0.5, max: 2.4, defaultValue: 1.5 },
            { name: 'depth',  unit: 'm', min: 0.3, max: 1.0, defaultValue: 0.75 },
            { name: 'height', unit: 'm', min: 0.5, max: 2.4, defaultValue: 0.72 },
        ];
        const out = decomposeFamily(minimalDefinition({ parametricRanges: ranges }), PINNED);
        expect(out.primitives[0]!.dimensions).toEqual({
            boxWidth:  { paramName: 'width' },
            boxDepth:  { paramName: 'depth' },
            boxHeight: { paramName: 'height' },
        });
    });

    it('axis name matching is case-insensitive', () => {
        const ranges: ParametricRange[] = [
            { name: 'WIDTH', unit: 'm', min: 0.5, max: 2.4, defaultValue: 1.5 },
        ];
        const out = decomposeFamily(minimalDefinition({ parametricRanges: ranges }), PINNED);
        expect(out.primitives[0]!.dimensions.boxWidth).toEqual({ paramName: 'WIDTH' });
    });

    it('unmatched axes fall back to literal dimensions even when other ranges match', () => {
        const ranges: ParametricRange[] = [
            { name: 'width', unit: 'm', min: 0.5, max: 2.4, defaultValue: 1.5 },
        ];
        const out = decomposeFamily(minimalDefinition({ parametricRanges: ranges }), PINNED);
        expect(out.primitives[0]!.dimensions).toEqual({
            boxWidth:  { paramName: 'width' },
            boxDepth:  0.75,
            boxHeight: 0.72,
        });
    });

    it("recognises 'widthM' / 'depthM' / 'heightM' alias names", () => {
        const ranges: ParametricRange[] = [
            { name: 'widthM',  unit: 'm', min: 0.5, max: 2.4, defaultValue: 1.5 },
            { name: 'depthM',  unit: 'm', min: 0.3, max: 1.0, defaultValue: 0.75 },
            { name: 'heightM', unit: 'm', min: 0.5, max: 2.4, defaultValue: 0.72 },
        ];
        const out = decomposeFamily(minimalDefinition({ parametricRanges: ranges }), PINNED);
        expect(out.primitives[0]!.dimensions).toEqual({
            boxWidth:  { paramName: 'widthM' },
            boxDepth:  { paramName: 'depthM' },
            boxHeight: { paramName: 'heightM' },
        });
    });

    it('emits exactly ONE primitive (v1 single-primitive contract)', () => {
        const out = decomposeFamily(minimalDefinition(), PINNED);
        expect(out.primitives).toHaveLength(1);
    });

    it("the single primitive is kind 'box' with boxWidth / boxDepth / boxHeight dimension keys", () => {
        const out = decomposeFamily(minimalDefinition(), PINNED);
        const box = out.primitives[0]!;
        expect(box.kind).toBe('box');
        expect(Object.keys(box.dimensions).sort()).toEqual(['boxDepth', 'boxHeight', 'boxWidth']);
    });

    it('the box has the identity transform by default', () => {
        const out = decomposeFamily(minimalDefinition(), PINNED);
        expect(out.primitives[0]!.transform).toEqual({
            translate: { x: 0, y: 0, z: 0 },
            rotateDeg: { x: 0, y: 0, z: 0 },
            scale:     { x: 1, y: 1, z: 1 },
        });
    });

    it("primaryPrimitiveId option propagates to primitives[0].id (default 'p0')", () => {
        const out1 = decomposeFamily(minimalDefinition(), PINNED);
        expect(out1.primitives[0]!.id).toBe('p0');

        const out2 = decomposeFamily(minimalDefinition(), { ...PINNED, primaryPrimitiveId: 'desk-box' });
        expect(out2.primitives[0]!.id).toBe('desk-box');
    });

    it("materialSlot option propagates to primitives[0].materialSlot (default 'default')", () => {
        const out1 = decomposeFamily(minimalDefinition(), PINNED);
        expect(out1.primitives[0]!.materialSlot).toBe('default');

        const out2 = decomposeFamily(minimalDefinition(), { ...PINNED, materialSlot: 'walnut' });
        expect(out2.primitives[0]!.materialSlot).toBe('walnut');
    });

    it('decomposedAt option pins the timestamp', () => {
        const out = decomposeFamily(minimalDefinition(), { decomposedAt: '2026-04-04T05:06:07.000Z' });
        expect(out.decomposedAt).toBe('2026-04-04T05:06:07.000Z');
    });

    it("default decomposedAt is a valid ISO 8601 string when opts.decomposedAt is omitted", () => {
        const out = decomposeFamily(minimalDefinition());
        // RFC-3339 / ISO-8601 'YYYY-MM-DDTHH:MM:SS(.sss)Z' shape produced by
        // Date.prototype.toISOString().
        expect(out.decomposedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('parametricHash is deterministic — same input → same output', () => {
        const def = minimalDefinition({
            parametricRanges: [
                { name: 'width', unit: 'm', min: 0.5, max: 2.4, defaultValue: 1.5 },
            ],
        });
        const h1 = decomposeFamily(def, PINNED).parametricHash;
        const h2 = decomposeFamily(def, PINNED).parametricHash;
        expect(h1).toBe(h2);
    });

    it('parametricHash CHANGES when dimensions change', () => {
        const a = decomposeFamily(minimalDefinition({ dimensions: { widthM: 1.5, depthM: 0.75, heightM: 0.72 } }), PINNED);
        const b = decomposeFamily(minimalDefinition({ dimensions: { widthM: 2.0, depthM: 0.75, heightM: 0.72 } }), PINNED);
        expect(a.parametricHash).not.toBe(b.parametricHash);
    });

    it('parametricHash CHANGES when identity.version changes', () => {
        const defA = minimalDefinition();
        const defB = { ...minimalDefinition(), identity: { ...baseIdentity(), version: '2.0.0' } };
        const a = decomposeFamily(defA, PINNED);
        const b = decomposeFamily(defB, PINNED);
        expect(a.parametricHash).not.toBe(b.parametricHash);
    });

    it('parametricHash CHANGES when a literal box dim becomes a ParameterRef (range added)', () => {
        const literal = decomposeFamily(minimalDefinition({ parametricRanges: [] }), PINNED);
        const refd    = decomposeFamily(minimalDefinition({
            parametricRanges: [{ name: 'width', unit: 'm', min: 0.5, max: 2.4, defaultValue: 1.5 }],
        }), PINNED);
        expect(literal.parametricHash).not.toBe(refd.parametricHash);
    });

    it("parametricHash starts with the 'parametric:' prefix", () => {
        const out = decomposeFamily(minimalDefinition(), PINNED);
        expect(out.parametricHash.startsWith('parametric:')).toBe(true);
    });

    it('pure: two calls with the same input (and pinned decomposedAt) produce equal output', () => {
        const def = minimalDefinition({
            parametricRanges: [
                { name: 'width', unit: 'm', min: 0.5, max: 2.4, defaultValue: 1.5 },
            ],
        });
        const a = decomposeFamily(def, PINNED);
        const b = decomposeFamily(def, PINNED);
        expect(a).toEqual(b);
    });

    it("identity is passed through by REFERENCE (output.identity === input.identity)", () => {
        const def = minimalDefinition();
        const out = decomposeFamily(def, PINNED);
        expect(out.identity).toBe(def.identity);
    });

    it('default options object (decomposeFamily(def) with no second arg) is accepted', () => {
        const out = decomposeFamily(minimalDefinition());
        expect(out.primitives[0]!.id).toBe('p0');
        expect(out.primitives[0]!.materialSlot).toBe('default');
    });
});

// ── resolveAxis ────────────────────────────────────────────────────────────

describe('resolveAxis', () => {
    const W = ['width', 'widthm', 'w'] as const;

    it('returns the literal fallback when no range matches', () => {
        const ranges: ParametricRange[] = [
            { name: 'leafHeight', unit: 'm', min: 0.1, max: 1, defaultValue: 0.5 },
        ];
        expect(resolveAxis(ranges, W, 1.5)).toBe(1.5);
    });

    it('returns a ParameterRef when a range name matches one of the candidates', () => {
        const ranges: ParametricRange[] = [
            { name: 'width', unit: 'm', min: 0.5, max: 2.4, defaultValue: 1.5 },
        ];
        expect(resolveAxis(ranges, W, 1.5)).toEqual({ paramName: 'width' });
    });

    it("matching is case-insensitive on BOTH sides", () => {
        const ranges: ParametricRange[] = [
            { name: 'Width', unit: 'm', min: 0.5, max: 2.4, defaultValue: 1.5 },
        ];
        expect(resolveAxis(ranges, W, 1.5)).toEqual({ paramName: 'Width' });
    });

    it('returns the FIRST matching range when multiple ranges match', () => {
        const ranges: ParametricRange[] = [
            { name: 'W',     unit: 'm', min: 0.5, max: 2.4, defaultValue: 1.5 },
            { name: 'width', unit: 'm', min: 0.5, max: 2.4, defaultValue: 1.5 },
        ];
        expect(resolveAxis(ranges, W, 1.5)).toEqual({ paramName: 'W' });
    });
});

// ── computeParametricHash ──────────────────────────────────────────────────

describe('computeParametricHash', () => {
    it("formats the hash with the 'parametric:' prefix and pipe-joined parts", () => {
        const def = minimalDefinition();
        const h = computeParametricHash(def, 'p0', [], {
            boxWidth: 1.5, boxDepth: 0.75, boxHeight: 0.72,
        });
        expect(h).toBe(`parametric:${def.identity.id}|1.0.0|p0||1.500000|0.750000|0.720000`);
    });

    it('fingerprints a ParameterRef as @<paramName>', () => {
        const def = minimalDefinition();
        const h = computeParametricHash(def, 'p0', [], {
            boxWidth:  { paramName: 'width' },
            boxDepth:  0.75,
            boxHeight: 0.72,
        });
        expect(h.endsWith('@width|0.750000|0.720000')).toBe(true);
    });

    it('sorts parameter names lexicographically (input order does NOT affect the hash)', () => {
        const def = minimalDefinition();
        const rangesA: ParametricRange[] = [
            { name: 'width',  unit: 'm', min: 0.5, max: 2.4, defaultValue: 1.5 },
            { name: 'height', unit: 'm', min: 0.5, max: 2.4, defaultValue: 0.72 },
        ];
        const rangesB: ParametricRange[] = [
            { name: 'height', unit: 'm', min: 0.5, max: 2.4, defaultValue: 0.72 },
            { name: 'width',  unit: 'm', min: 0.5, max: 2.4, defaultValue: 1.5 },
        ];
        const dims = { boxWidth: 1.5, boxDepth: 0.75, boxHeight: 0.72 };
        const hA = computeParametricHash(def, 'p0', rangesA, dims);
        const hB = computeParametricHash(def, 'p0', rangesB, dims);
        expect(hA).toBe(hB);
        // And the sorted segment is present.
        expect(hA).toContain('|height,width|');
    });
});
