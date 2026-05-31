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
