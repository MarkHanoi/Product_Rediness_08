// P0.5 Stage-4 (Family Platform) — L0 GeneratedSchemas substrate tests.
//
// Mirrors the structure + style of familyGeometry.test.ts.  Drives 100%
// coverage (enforced by `vitest.config.ts`) for every schema in the new
// `family-schemas/` substrate.
//
// Covers:
//   - instance-schema-spec:  InstanceParameterKindSchema, InstanceParameterSpecSchema,
//                            InstanceSchemaSpecSchema
//   - command-payload-spec:  CommandKindSchema, CommandPayloadSpecSchema,
//                            CommandPayloadSetSchema
//   - generated:             GeneratedSchemasSchema (top-level)
//   - cross-imports:         GeneratedSchemas.identity round-trips through
//                            FamilyIdentitySchema

import { describe, expect, it } from 'vitest';
import {
    // instance-schema-spec
    InstanceParameterKindSchema,
    InstanceParameterSpecSchema,
    InstanceSchemaSpecSchema,
    type InstanceParameterKind,
    type InstanceParameterSpec,
    type InstanceSchemaSpec,
    // command-payload-spec
    CommandKindSchema,
    CommandPayloadSpecSchema,
    CommandPayloadSetSchema,
    type CommandKind,
    type CommandPayloadSpec,
    type CommandPayloadSet,
    // generated
    GeneratedSchemasSchema,
    type GeneratedSchemas,
    // from-parametric-geometry (Stage-4 synthesiser)
    synthesiseSchemas,
    // cross-package fixture
    FamilyIdentitySchema,
    type ParametricFamily,
    type ParametricParameter,
    type GeneratedGeometry,
} from '../src/index.js';

// ── Fixture builders ───────────────────────────────────────────────────────

const baseIdentity = () => ({
    id:      'family/com.pryzm.core/desk',
    name:    'Desk',
    version: '1.0.0',
    author:  'PRYZM',
    license: 'MIT',
});

const minimalNumberParam = (): InstanceParameterSpec => ({
    name:         'widthM',
    kind:         'number',
    label:        'Width (m)',
    userEditable: true,
});

const minimalInstanceSchema = (): InstanceSchemaSpec => ({
    parameters: [minimalNumberParam()],
    specHash:   'spec:fixture',
});

const minimalCommandPayload = (command: CommandKind): CommandPayloadSpec => ({
    command,
    parameters:  command === 'remove' ? [] : [minimalNumberParam()],
    payloadHash: `payload:${command}:fixture`,
});

const minimalCommandSet = (): CommandPayloadSet => ({
    create: minimalCommandPayload('create'),
    update: minimalCommandPayload('update'),
    remove: minimalCommandPayload('remove'),
});

const minimalGeneratedSchemas = (): GeneratedSchemas => ({
    identity:        baseIdentity(),
    instanceSchema:  minimalInstanceSchema(),
    commandPayloads: minimalCommandSet(),
    schemasHash:     'schemas:fixture',
    synthesisedAt:   '2026-01-01T00:00:00.000Z',
});

// ── InstanceParameterKindSchema ────────────────────────────────────────────

describe('InstanceParameterKindSchema', () => {
    const kinds: InstanceParameterKind[] = [
        'number',
        'integer',
        'string',
        'boolean',
        'enum-string',
    ];

    for (const kind of kinds) {
        it(`accepts '${kind}'`, () => {
            expect(InstanceParameterKindSchema.safeParse(kind).success).toBe(true);
        });
    }

    it("rejects 'bigint'", () => {
        expect(InstanceParameterKindSchema.safeParse('bigint').success).toBe(false);
    });

    it('rejects an empty string', () => {
        expect(InstanceParameterKindSchema.safeParse('').success).toBe(false);
    });
});

// ── InstanceParameterSpecSchema ────────────────────────────────────────────

describe('InstanceParameterSpecSchema', () => {
    it('accepts a minimal valid number parameter', () => {
        expect(InstanceParameterSpecSchema.safeParse(minimalNumberParam()).success).toBe(true);
    });

    it('rejects an empty name', () => {
        const p = { ...minimalNumberParam(), name: '' };
        expect(InstanceParameterSpecSchema.safeParse(p).success).toBe(false);
    });

    it('rejects an empty label', () => {
        const p = { ...minimalNumberParam(), label: '' };
        expect(InstanceParameterSpecSchema.safeParse(p).success).toBe(false);
    });

    it('rejects an unknown kind', () => {
        const p = { ...minimalNumberParam(), kind: 'date' as unknown as InstanceParameterKind };
        expect(InstanceParameterSpecSchema.safeParse(p).success).toBe(false);
    });

    it('applies default userEditable=true when omitted', () => {
        const parsed = InstanceParameterSpecSchema.parse({
            name:  'widthM',
            kind:  'number',
            label: 'Width (m)',
        });
        expect(parsed.userEditable).toBe(true);
    });

    it('preserves explicitly supplied userEditable=false', () => {
        const p: InstanceParameterSpec = { ...minimalNumberParam(), userEditable: false };
        const parsed = InstanceParameterSpecSchema.parse(p);
        expect(parsed.userEditable).toBe(false);
    });

    it('accepts a number param with min/max bounds', () => {
        const p: InstanceParameterSpec = {
            name:         'widthM',
            kind:         'number',
            label:        'Width (m)',
            minNumber:    0.1,
            maxNumber:    5,
            userEditable: true,
        };
        expect(InstanceParameterSpecSchema.safeParse(p).success).toBe(true);
    });

    it('accepts an integer param with min/max bounds', () => {
        const p: InstanceParameterSpec = {
            name:         'shelfCount',
            kind:         'integer',
            label:        'Shelves',
            minNumber:    0,
            maxNumber:    20,
            userEditable: true,
        };
        expect(InstanceParameterSpecSchema.safeParse(p).success).toBe(true);
    });

    it('accepts a string param with description', () => {
        const p: InstanceParameterSpec = {
            name:         'finishLabel',
            kind:         'string',
            label:        'Finish label',
            description:  'Human-facing finish label',
            userEditable: true,
        };
        expect(InstanceParameterSpecSchema.safeParse(p).success).toBe(true);
    });

    it('accepts a boolean param with defaultValue', () => {
        const p: InstanceParameterSpec = {
            name:         'hasDrawer',
            kind:         'boolean',
            label:        'Has drawer',
            defaultValue: false,
            userEditable: true,
        };
        expect(InstanceParameterSpecSchema.safeParse(p).success).toBe(true);
    });

    it('accepts an enum-string param with enumValues', () => {
        const p: InstanceParameterSpec = {
            name:         'finish',
            kind:         'enum-string',
            label:        'Finish',
            enumValues:   ['oak', 'walnut', 'painted'],
            defaultValue: 'oak',
            userEditable: true,
        };
        expect(InstanceParameterSpecSchema.safeParse(p).success).toBe(true);
    });

    it('rejects a non-finite minNumber (NaN)', () => {
        const p = { ...minimalNumberParam(), minNumber: Number.NaN };
        expect(InstanceParameterSpecSchema.safeParse(p).success).toBe(false);
    });

    it('rejects a non-finite maxNumber (Infinity)', () => {
        const p = { ...minimalNumberParam(), maxNumber: Number.POSITIVE_INFINITY };
        expect(InstanceParameterSpecSchema.safeParse(p).success).toBe(false);
    });

    it('rejects enumValues whose entries are not strings', () => {
        const p = {
            ...minimalNumberParam(),
            kind:       'enum-string' as const,
            enumValues: [1, 2, 3] as unknown as string[],
        };
        expect(InstanceParameterSpecSchema.safeParse(p).success).toBe(false);
    });
});

// ── InstanceSchemaSpecSchema ───────────────────────────────────────────────

describe('InstanceSchemaSpecSchema', () => {
    it('accepts a minimal valid spec', () => {
        expect(InstanceSchemaSpecSchema.safeParse(minimalInstanceSchema()).success).toBe(true);
    });

    it('accepts an empty parameters array with non-empty specHash', () => {
        const s: InstanceSchemaSpec = { parameters: [], specHash: 'spec:empty' };
        expect(InstanceSchemaSpecSchema.safeParse(s).success).toBe(true);
    });

    it('rejects an empty specHash', () => {
        const s = { ...minimalInstanceSchema(), specHash: '' };
        expect(InstanceSchemaSpecSchema.safeParse(s).success).toBe(false);
    });

    it('rejects an object missing specHash', () => {
        const { specHash: _omitted, ...without } = minimalInstanceSchema();
        void _omitted;
        expect(InstanceSchemaSpecSchema.safeParse(without).success).toBe(false);
    });

    it('rejects an object missing parameters', () => {
        const { parameters: _omitted, ...without } = minimalInstanceSchema();
        void _omitted;
        expect(InstanceSchemaSpecSchema.safeParse(without).success).toBe(false);
    });

    it('rejects when a nested parameter is invalid (propagates from InstanceParameterSpecSchema)', () => {
        const s = {
            parameters: [{ ...minimalNumberParam(), name: '' }],
            specHash:   'spec:fixture',
        };
        expect(InstanceSchemaSpecSchema.safeParse(s).success).toBe(false);
    });
});

// ── CommandKindSchema ──────────────────────────────────────────────────────

describe('CommandKindSchema', () => {
    const kinds: CommandKind[] = ['create', 'update', 'remove'];

    for (const kind of kinds) {
        it(`accepts '${kind}'`, () => {
            expect(CommandKindSchema.safeParse(kind).success).toBe(true);
        });
    }

    it("rejects 'clone'", () => {
        expect(CommandKindSchema.safeParse('clone').success).toBe(false);
    });
});

// ── CommandPayloadSpecSchema ───────────────────────────────────────────────

describe('CommandPayloadSpecSchema', () => {
    const kinds: CommandKind[] = ['create', 'update', 'remove'];

    for (const kind of kinds) {
        it(`accepts a valid spec for '${kind}'`, () => {
            expect(CommandPayloadSpecSchema.safeParse(minimalCommandPayload(kind)).success).toBe(true);
        });
    }

    it('rejects an empty payloadHash', () => {
        const p = { ...minimalCommandPayload('create'), payloadHash: '' };
        expect(CommandPayloadSpecSchema.safeParse(p).success).toBe(false);
    });

    it('rejects an unknown command kind', () => {
        const p = { ...minimalCommandPayload('create'), command: 'clone' as unknown as CommandKind };
        expect(CommandPayloadSpecSchema.safeParse(p).success).toBe(false);
    });

    it('rejects an object missing parameters', () => {
        const { parameters: _omitted, ...without } = minimalCommandPayload('update');
        void _omitted;
        expect(CommandPayloadSpecSchema.safeParse(without).success).toBe(false);
    });
});

// ── CommandPayloadSetSchema ────────────────────────────────────────────────

describe('CommandPayloadSetSchema', () => {
    it('accepts a minimal valid set with all three commands', () => {
        expect(CommandPayloadSetSchema.safeParse(minimalCommandSet()).success).toBe(true);
    });

    it('rejects a set missing create', () => {
        const { create: _omitted, ...without } = minimalCommandSet();
        void _omitted;
        expect(CommandPayloadSetSchema.safeParse(without).success).toBe(false);
    });

    it('rejects a set missing update', () => {
        const { update: _omitted, ...without } = minimalCommandSet();
        void _omitted;
        expect(CommandPayloadSetSchema.safeParse(without).success).toBe(false);
    });

    it('rejects a set missing remove', () => {
        const { remove: _omitted, ...without } = minimalCommandSet();
        void _omitted;
        expect(CommandPayloadSetSchema.safeParse(without).success).toBe(false);
    });

    it('rejects when a nested payload spec is invalid (propagates from CommandPayloadSpecSchema)', () => {
        const s = {
            ...minimalCommandSet(),
            create: { ...minimalCommandPayload('create'), payloadHash: '' },
        };
        expect(CommandPayloadSetSchema.safeParse(s).success).toBe(false);
    });
});

// ── GeneratedSchemasSchema ─────────────────────────────────────────────────

describe('GeneratedSchemasSchema', () => {
    it('accepts a minimal valid GeneratedSchemas', () => {
        expect(GeneratedSchemasSchema.safeParse(minimalGeneratedSchemas()).success).toBe(true);
    });

    it('rejects missing identity', () => {
        const { identity: _omitted, ...without } = minimalGeneratedSchemas();
        void _omitted;
        expect(GeneratedSchemasSchema.safeParse(without).success).toBe(false);
    });

    it('rejects missing instanceSchema', () => {
        const { instanceSchema: _omitted, ...without } = minimalGeneratedSchemas();
        void _omitted;
        expect(GeneratedSchemasSchema.safeParse(without).success).toBe(false);
    });

    it('rejects missing commandPayloads', () => {
        const { commandPayloads: _omitted, ...without } = minimalGeneratedSchemas();
        void _omitted;
        expect(GeneratedSchemasSchema.safeParse(without).success).toBe(false);
    });

    it('rejects missing schemasHash', () => {
        const { schemasHash: _omitted, ...without } = minimalGeneratedSchemas();
        void _omitted;
        expect(GeneratedSchemasSchema.safeParse(without).success).toBe(false);
    });

    it('rejects missing synthesisedAt', () => {
        const { synthesisedAt: _omitted, ...without } = minimalGeneratedSchemas();
        void _omitted;
        expect(GeneratedSchemasSchema.safeParse(without).success).toBe(false);
    });

    it('rejects an empty schemasHash', () => {
        const g = { ...minimalGeneratedSchemas(), schemasHash: '' };
        expect(GeneratedSchemasSchema.safeParse(g).success).toBe(false);
    });

    it('rejects an empty synthesisedAt', () => {
        const g = { ...minimalGeneratedSchemas(), synthesisedAt: '' };
        expect(GeneratedSchemasSchema.safeParse(g).success).toBe(false);
    });

    it('rejects when identity.version is non-semver (propagates from FamilyIdentitySchema)', () => {
        const g = minimalGeneratedSchemas();
        g.identity = { ...g.identity, version: '1.0' };
        expect(GeneratedSchemasSchema.safeParse(g).success).toBe(false);
    });

    it('rejects when instanceSchema.specHash is empty (propagates from InstanceSchemaSpecSchema)', () => {
        const g = minimalGeneratedSchemas();
        g.instanceSchema = { ...g.instanceSchema, specHash: '' };
        expect(GeneratedSchemasSchema.safeParse(g).success).toBe(false);
    });

    it('rejects when a commandPayloads entry is invalid (propagates from CommandPayloadSetSchema)', () => {
        const g = minimalGeneratedSchemas();
        g.commandPayloads = {
            ...g.commandPayloads,
            update: { ...g.commandPayloads.update, payloadHash: '' },
        };
        expect(GeneratedSchemasSchema.safeParse(g).success).toBe(false);
    });

    it('round-trips a parsed GeneratedSchemas through safeParse (no shape mutation)', () => {
        const g = minimalGeneratedSchemas();
        const parsed = GeneratedSchemasSchema.safeParse(g);
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data.identity).toEqual(g.identity);
            expect(parsed.data.instanceSchema).toEqual(g.instanceSchema);
            expect(parsed.data.commandPayloads).toEqual(g.commandPayloads);
            expect(parsed.data.schemasHash).toBe(g.schemasHash);
            expect(parsed.data.synthesisedAt).toBe(g.synthesisedAt);
        }
    });

    it('accepts a maximal GeneratedSchemas (every parameter kind + all three commands populated)', () => {
        const params: InstanceParameterSpec[] = [
            { name: 'widthM',     kind: 'number',      label: 'Width (m)',  minNumber: 0.1, maxNumber: 5, userEditable: true },
            { name: 'shelfCount', kind: 'integer',     label: 'Shelves',    minNumber: 0,   maxNumber: 20, userEditable: true },
            { name: 'finishLabel', kind: 'string',     label: 'Finish',     description: 'Human label', userEditable: false },
            { name: 'hasDrawer',  kind: 'boolean',     label: 'Has drawer', defaultValue: true, userEditable: true },
            { name: 'finish',     kind: 'enum-string', label: 'Finish kind', enumValues: ['oak', 'walnut'], defaultValue: 'oak', userEditable: true },
        ];
        const g: GeneratedSchemas = {
            identity:       baseIdentity(),
            instanceSchema: { parameters: params, specHash: 'spec:desk-maximal@v1' },
            commandPayloads: {
                create: { command: 'create', parameters: params,                    payloadHash: 'payload:create@v1' },
                update: { command: 'update', parameters: [params[0]!, params[3]!],  payloadHash: 'payload:update@v1' },
                remove: { command: 'remove', parameters: [],                        payloadHash: 'payload:remove@v1' },
            },
            schemasHash:    'schemas:desk-maximal@v1',
            synthesisedAt:  '2026-02-02T12:34:56.000Z',
        };
        expect(GeneratedSchemasSchema.safeParse(g).success).toBe(true);
    });
});

// ── Cross-imports ──────────────────────────────────────────────────────────

describe('cross-imports', () => {
    it("a GeneratedSchemas's identity is a valid FamilyIdentity in isolation", () => {
        const g = minimalGeneratedSchemas();
        expect(FamilyIdentitySchema.safeParse(g.identity).success).toBe(true);
    });

    it("a GeneratedSchemas's identity is REJECTED when version is non-semver (full propagation)", () => {
        const g = minimalGeneratedSchemas();
        g.identity = { ...g.identity, version: 'not-semver' };
        expect(GeneratedSchemasSchema.safeParse(g).success).toBe(false);
    });
});

// ── synthesiseSchemas (Stage-4 transformer) ────────────────────────────────

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

const makeParametric = (
    parameters: Record<string, ParametricParameter>,
    overrides: { id?: string; version?: string } = {},
): ParametricFamily => ({
    identity: {
        id:      overrides.id ?? 'family/com.pryzm.core/desk',
        name:    'Desk',
        version: overrides.version ?? '1.0.0',
        author:  'PRYZM',
        license: 'MIT',
    },
    parameters,
    primitives: [
        {
            id:           'box-0',
            kind:         'box',
            dimensions:   { boxWidth: 1, boxDepth: 0.6, boxHeight: 0.75 },
            transform:    {
                translate: { x: 0, y: 0, z: 0 },
                rotateDeg: { x: 0, y: 0, z: 0 },
                scale:     { x: 1, y: 1, z: 1 },
            },
            materialSlot: 'default',
        },
    ],
    parametricHash: 'parametric:desk@v1',
    decomposedAt:   '2026-01-01T00:00:00.000Z',
});

const makeGeometry = (
    overrides: { id?: string; version?: string } = {},
): GeneratedGeometry => ({
    identity: {
        id:      overrides.id ?? 'family/com.pryzm.core/desk',
        name:    'Desk',
        version: overrides.version ?? '1.0.0',
        author:  'PRYZM',
        license: 'MIT',
    },
    builder: {
        kind:        'parametric',
        modulePath:  '@pryzm/family-builders/desk.js',
        exportName:  'buildDesk',
        builderHash: 'builder:desk@v1',
    },
    planSymbol: {
        kind:       'parametric',
        modulePath: '@pryzm/family-plan-symbols/desk.js',
        exportName: 'deskSymbol',
        bboxMinX:   -0.5,
        bboxMinY:   -0.3,
        bboxMaxX:    0.5,
        bboxMaxY:    0.3,
    },
    footprint: {
        lengthM:          1,
        depthM:           0.6,
        clearFrontM:      0,
        clearSideM:       0,
        clearBackM:       0,
        clearAboveM:      0,
        excludeDoorSwing: false,
    },
    geometryHash:  'geometry:desk@v1',
    synthesisedAt: '2026-01-02T00:00:00.000Z',
});

describe('synthesiseSchemas', () => {
    it('produces a valid GeneratedSchemas that round-trips through GeneratedSchemasSchema.parse', () => {
        const parametric = makeParametric({ widthM: makeParam() });
        const geometry = makeGeometry();
        const out = synthesiseSchemas(parametric, geometry, { synthesisedAt: PINNED_TS });
        const parsed = GeneratedSchemasSchema.safeParse(out);
        expect(parsed.success).toBe(true);
    });

    it('throws with a descriptive message when parametric.identity.id !== geometry.identity.id', () => {
        const parametric = makeParametric({ widthM: makeParam() }, { id: 'family/com.pryzm.core/desk' });
        const geometry = makeGeometry({ id: 'family/com.pryzm.core/chair' });
        expect(() => synthesiseSchemas(parametric, geometry)).toThrow(
            /identity mismatch/i,
        );
        expect(() => synthesiseSchemas(parametric, geometry)).toThrow(
            /family\/com\.pryzm\.core\/desk/,
        );
        expect(() => synthesiseSchemas(parametric, geometry)).toThrow(
            /family\/com\.pryzm\.core\/chair/,
        );
    });

    it('handles an empty parameters map → empty instanceSchema.parameters + valid (id-only) command payloads', () => {
        const parametric = makeParametric({});
        const geometry = makeGeometry();
        const out = synthesiseSchemas(parametric, geometry, { synthesisedAt: PINNED_TS });
        expect(out.instanceSchema.parameters).toEqual([]);
        // create + update still carry the synthetic id parameter
        expect(out.commandPayloads.create.parameters).toHaveLength(1);
        expect(out.commandPayloads.create.parameters[0]!.name).toBe('id');
        expect(out.commandPayloads.update.parameters).toHaveLength(1);
        expect(out.commandPayloads.update.parameters[0]!.name).toBe('id');
        expect(out.commandPayloads.remove.parameters).toHaveLength(1);
        expect(out.commandPayloads.remove.parameters[0]!.name).toBe('id');
        // and the whole bundle still validates
        expect(GeneratedSchemasSchema.safeParse(out).success).toBe(true);
    });

    it('surfaces every parametric parameter as an instance parameter, sorted by name', () => {
        const parametric = makeParametric({
            widthM:     makeParam({ name: 'widthM',     min: 0.1, max: 5,   defaultValue: 1 }),
            depthM:     makeParam({ name: 'depthM',     min: 0.1, max: 2,   defaultValue: 0.6 }),
            heightM:    makeParam({ name: 'heightM',    min: 0.1, max: 1.5, defaultValue: 0.75 }),
            shelfCount: makeParam({ name: 'shelfCount', unit: 'unitless', min: 0, max: 10, defaultValue: 2 }),
        });
        const geometry = makeGeometry();
        const out = synthesiseSchemas(parametric, geometry, { synthesisedAt: PINNED_TS });
        const names = out.instanceSchema.parameters.map((p) => p.name);
        expect(names).toEqual(['depthM', 'heightM', 'shelfCount', 'widthM']);
    });

    it('emits kind="number" for every instance parameter (v1 simplification)', () => {
        const parametric = makeParametric({
            widthM:     makeParam({ name: 'widthM',     unit: 'm' }),
            angleDeg:   makeParam({ name: 'angleDeg',   unit: 'deg', min: 0, max: 90, defaultValue: 45 }),
            shelfCount: makeParam({ name: 'shelfCount', unit: 'unitless', min: 0, max: 10, defaultValue: 2 }),
        });
        const geometry = makeGeometry();
        const out = synthesiseSchemas(parametric, geometry, { synthesisedAt: PINNED_TS });
        for (const p of out.instanceSchema.parameters) {
            expect(p.kind).toBe('number');
        }
    });

    it("propagates each source range's defaultValue / min / max onto the instance parameter", () => {
        const parametric = makeParametric({
            widthM: makeParam({ name: 'widthM', min: 0.2, max: 4.5, defaultValue: 1.25 }),
        });
        const geometry = makeGeometry();
        const out = synthesiseSchemas(parametric, geometry, { synthesisedAt: PINNED_TS });
        const widthM = out.instanceSchema.parameters.find((p) => p.name === 'widthM')!;
        expect(widthM.defaultValue).toBe(1.25);
        expect(widthM.minNumber).toBe(0.2);
        expect(widthM.maxNumber).toBe(4.5);
    });

    it('capitalises the first letter of the parameter name for the display label', () => {
        const parametric = makeParametric({
            widthM:     makeParam({ name: 'widthM' }),
            shelfCount: makeParam({ name: 'shelfCount', unit: 'unitless', min: 0, max: 10, defaultValue: 2 }),
        });
        const geometry = makeGeometry();
        const out = synthesiseSchemas(parametric, geometry, { synthesisedAt: PINNED_TS });
        const labels = out.instanceSchema.parameters.map((p) => p.label);
        // sorted by name → ['ShelfCount', 'WidthM']
        expect(labels).toEqual(['ShelfCount', 'WidthM']);
    });

    it('marks every instance parameter userEditable=true (the default surface)', () => {
        const parametric = makeParametric({
            widthM: makeParam({ name: 'widthM' }),
            depthM: makeParam({ name: 'depthM', min: 0.1, max: 2, defaultValue: 0.6 }),
        });
        const geometry = makeGeometry();
        const out = synthesiseSchemas(parametric, geometry, { synthesisedAt: PINNED_TS });
        for (const p of out.instanceSchema.parameters) {
            expect(p.userEditable).toBe(true);
        }
    });

    it("commandPayloads.create.command === 'create'", () => {
        const out = synthesiseSchemas(
            makeParametric({ widthM: makeParam() }),
            makeGeometry(),
            { synthesisedAt: PINNED_TS },
        );
        expect(out.commandPayloads.create.command).toBe('create');
    });

    it("commandPayloads.update.command === 'update'", () => {
        const out = synthesiseSchemas(
            makeParametric({ widthM: makeParam() }),
            makeGeometry(),
            { synthesisedAt: PINNED_TS },
        );
        expect(out.commandPayloads.update.command).toBe('update');
    });

    it("commandPayloads.remove.command === 'remove'", () => {
        const out = synthesiseSchemas(
            makeParametric({ widthM: makeParam() }),
            makeGeometry(),
            { synthesisedAt: PINNED_TS },
        );
        expect(out.commandPayloads.remove.command).toBe('remove');
    });

    it("commandPayloads.create.parameters[0] is the synthetic 'id' field (kind=string, userEditable=false)", () => {
        const out = synthesiseSchemas(
            makeParametric({ widthM: makeParam() }),
            makeGeometry(),
            { synthesisedAt: PINNED_TS },
        );
        const idParam = out.commandPayloads.create.parameters[0]!;
        expect(idParam.name).toBe('id');
        expect(idParam.kind).toBe('string');
        expect(idParam.label).toBe('ID');
        expect(idParam.userEditable).toBe(false);
    });

    it("commandPayloads.update.parameters[0] is the synthetic 'id' field too", () => {
        const out = synthesiseSchemas(
            makeParametric({ widthM: makeParam() }),
            makeGeometry(),
            { synthesisedAt: PINNED_TS },
        );
        const idParam = out.commandPayloads.update.parameters[0]!;
        expect(idParam.name).toBe('id');
        expect(idParam.kind).toBe('string');
        expect(idParam.userEditable).toBe(false);
    });

    it("commandPayloads.remove.parameters contains only the synthetic 'id' field", () => {
        const out = synthesiseSchemas(
            makeParametric({ widthM: makeParam(), depthM: makeParam({ name: 'depthM' }) }),
            makeGeometry(),
            { synthesisedAt: PINNED_TS },
        );
        expect(out.commandPayloads.remove.parameters).toHaveLength(1);
        expect(out.commandPayloads.remove.parameters[0]!.name).toBe('id');
    });

    it('commandPayloads.create / update carry id + the FULL instance-parameter list', () => {
        const parametric = makeParametric({
            widthM: makeParam({ name: 'widthM' }),
            depthM: makeParam({ name: 'depthM', min: 0.1, max: 2, defaultValue: 0.6 }),
        });
        const out = synthesiseSchemas(parametric, makeGeometry(), { synthesisedAt: PINNED_TS });
        const createNames = out.commandPayloads.create.parameters.map((p) => p.name);
        const updateNames = out.commandPayloads.update.parameters.map((p) => p.name);
        // sorted by name; 'id' prepended
        expect(createNames).toEqual(['id', 'depthM', 'widthM']);
        expect(updateNames).toEqual(['id', 'depthM', 'widthM']);
    });

    it('the three payloadHashes are distinct', () => {
        const out = synthesiseSchemas(
            makeParametric({ widthM: makeParam() }),
            makeGeometry(),
            { synthesisedAt: PINNED_TS },
        );
        const { create, update, remove } = out.commandPayloads;
        expect(create.payloadHash).not.toBe(update.payloadHash);
        expect(create.payloadHash).not.toBe(remove.payloadHash);
        expect(update.payloadHash).not.toBe(remove.payloadHash);
    });

    it('schemasHash is deterministic — same input → same hash', () => {
        const parametric = makeParametric({ widthM: makeParam() });
        const geometry = makeGeometry();
        const out1 = synthesiseSchemas(parametric, geometry, { synthesisedAt: PINNED_TS });
        const out2 = synthesiseSchemas(parametric, geometry, { synthesisedAt: PINNED_TS });
        expect(out1.schemasHash).toBe(out2.schemasHash);
    });

    it('schemasHash CHANGES when a parameter range changes (different parametric input)', () => {
        const baseParametric = makeParametric({
            widthM: makeParam({ name: 'widthM', min: 0.1, max: 5, defaultValue: 1 }),
        });
        const altParametric = makeParametric({
            widthM: makeParam({ name: 'widthM', min: 0.2, max: 6, defaultValue: 2 }),
        });
        const geometry = makeGeometry();
        const a = synthesiseSchemas(baseParametric, geometry, { synthesisedAt: PINNED_TS });
        const b = synthesiseSchemas(altParametric, geometry, { synthesisedAt: PINNED_TS });
        expect(a.schemasHash).not.toBe(b.schemasHash);
    });

    it('schemasHash CHANGES when identity.version changes', () => {
        const params = { widthM: makeParam() };
        const a = synthesiseSchemas(
            makeParametric(params, { version: '1.0.0' }),
            makeGeometry({ version: '1.0.0' }),
            { synthesisedAt: PINNED_TS },
        );
        const b = synthesiseSchemas(
            makeParametric(params, { version: '2.0.0' }),
            makeGeometry({ version: '2.0.0' }),
            { synthesisedAt: PINNED_TS },
        );
        expect(a.schemasHash).not.toBe(b.schemasHash);
    });

    it('opts.synthesisedAt pins the timestamp verbatim', () => {
        const out = synthesiseSchemas(
            makeParametric({ widthM: makeParam() }),
            makeGeometry(),
            { synthesisedAt: PINNED_TS },
        );
        expect(out.synthesisedAt).toBe(PINNED_TS);
    });

    it('default synthesisedAt is a valid ISO 8601 string', () => {
        const out = synthesiseSchemas(
            makeParametric({ widthM: makeParam() }),
            makeGeometry(),
        );
        // ISO 8601 with milliseconds: YYYY-MM-DDTHH:MM:SS.sssZ
        expect(out.synthesisedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        expect(Number.isNaN(Date.parse(out.synthesisedAt))).toBe(false);
    });

    it('pure: same input → same output (modulo timestamp)', () => {
        const parametric = makeParametric({
            widthM: makeParam(),
            depthM: makeParam({ name: 'depthM', min: 0.1, max: 2, defaultValue: 0.6 }),
        });
        const geometry = makeGeometry();
        const a = synthesiseSchemas(parametric, geometry, { synthesisedAt: PINNED_TS });
        const b = synthesiseSchemas(parametric, geometry, { synthesisedAt: PINNED_TS });
        expect(a).toEqual(b);
    });

    it('identity is passed through verbatim from parametric.identity onto the output', () => {
        const parametric = makeParametric({ widthM: makeParam() });
        const geometry = makeGeometry();
        const out = synthesiseSchemas(parametric, geometry, { synthesisedAt: PINNED_TS });
        expect(out.identity).toEqual(parametric.identity);
    });

    it('falls back to new Date().toISOString() when opts.synthesisedAt is undefined (no opts at all)', () => {
        const out = synthesiseSchemas(
            makeParametric({ widthM: makeParam() }),
            makeGeometry(),
        );
        // Reasonably close to "now": parsed date must be within 5 seconds of now
        const stampedMs = Date.parse(out.synthesisedAt);
        expect(Math.abs(Date.now() - stampedMs)).toBeLessThan(5_000);
    });
});
