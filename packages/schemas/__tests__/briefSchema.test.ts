// O.12.a (Onboarding · typology-declared brief) — L0 BriefField/BriefSchema tests.
//
// Validates the typed brief-field schema + the apartment briefSchema the
// onboarding RAC renders. Field kinds, cross-field refinements (default in
// range / default in options / unique ids), and the apartment manifest's
// own briefSchema all under test.
//
// Design of record: docs/03-execution/specs/SPEC-TYPOLOGY-BRIEF-SCHEMA.md §2-§3.

import { describe, expect, it } from 'vitest';
import {
    BriefFieldSchema,
    BriefSchemaSchema,
    type BriefField,
} from '../src/typology/briefSchema.js';

// ─────────────────────────────────────────────────────────────────────────────
// The canonical apartment briefSchema — must match the live generator/picker
// keys in apps/editor/src/ui/apartment-layout/layoutRequestPayload.ts.
// ─────────────────────────────────────────────────────────────────────────────
const APARTMENT_BRIEF = {
    fields: [
        { kind: 'range', id: 'bedrooms', label: 'Bedrooms', min: 1, max: 5, step: 1, default: 2 },
        { kind: 'range', id: 'bathrooms', label: 'Bathrooms', min: 1, max: 3, step: 1, default: 1 },
        {
            kind: 'select',
            id: 'style',
            label: 'Style',
            options: [
                { value: 'modern', label: 'Modern' },
                { value: 'classic', label: 'Classic' },
                { value: 'minimal', label: 'Minimal' },
                { value: 'warm', label: 'Warm' },
            ],
            default: 'modern',
        },
        { kind: 'toggle', id: 'openPlanKitchenDining', label: 'Open-plan kitchen + dining', default: true },
        { kind: 'toggle', id: 'masterEnSuite', label: 'Master en-suite', default: false },
        { kind: 'range', id: 'targetAreaM2', label: 'Target area', min: 40, max: 200, step: 5, default: 75, unit: 'm²' },
        { kind: 'text', id: 'notes', label: 'Anything else', placeholder: 'e.g. home office…' },
    ],
} as const;

describe('BriefSchemaSchema — apartment brief', () => {
    it('parses the canonical apartment briefSchema', () => {
        const parsed = BriefSchemaSchema.parse(APARTMENT_BRIEF);
        expect(parsed.fields).toHaveLength(7);
        const ids = parsed.fields.map((f) => f.id);
        expect(ids).toEqual([
            'bedrooms',
            'bathrooms',
            'style',
            'openPlanKitchenDining',
            'masterEnSuite',
            'targetAreaM2',
            'notes',
        ]);
    });

    it('preserves the masterEnSuite live key (capital S)', () => {
        const parsed = BriefSchemaSchema.parse(APARTMENT_BRIEF);
        const ids = parsed.fields.map((f) => f.id);
        expect(ids).toContain('masterEnSuite');
        expect(ids).not.toContain('masterEnsuite');
    });

    it('requires at least one field', () => {
        expect(() => BriefSchemaSchema.parse({ fields: [] })).toThrow();
    });

    it('rejects duplicate field ids', () => {
        expect(() =>
            BriefSchemaSchema.parse({
                fields: [
                    { kind: 'range', id: 'bedrooms', label: 'Bedrooms', min: 1, max: 5, step: 1, default: 2 },
                    { kind: 'range', id: 'bedrooms', label: 'Bedrooms again', min: 1, max: 3, step: 1, default: 1 },
                ],
            }),
        ).toThrow(/unique/i);
    });
});

describe('BriefFieldSchema — each kind validates', () => {
    it('accepts a valid range field', () => {
        const f: BriefField = { kind: 'range', id: 'r', label: 'R', min: 0, max: 10, step: 1, default: 5 };
        expect(() => BriefFieldSchema.parse(f)).not.toThrow();
    });

    it('accepts a range field with a unit', () => {
        const f: BriefField = { kind: 'range', id: 'a', label: 'Area', min: 40, max: 200, step: 5, default: 75, unit: 'm²' };
        expect(BriefFieldSchema.parse(f)).toMatchObject({ unit: 'm²' });
    });

    it('accepts a valid stepper field', () => {
        const f: BriefField = { kind: 'stepper', id: 'floors', label: 'Floors', min: 1, max: 4, default: 2 };
        expect(() => BriefFieldSchema.parse(f)).not.toThrow();
    });

    it('accepts a valid select field', () => {
        const f: BriefField = {
            kind: 'select',
            id: 's',
            label: 'S',
            options: [
                { value: 'a', label: 'A' },
                { value: 'b', label: 'B' },
            ],
            default: 'a',
        };
        expect(() => BriefFieldSchema.parse(f)).not.toThrow();
    });

    it('accepts a valid multiselect field', () => {
        const f: BriefField = {
            kind: 'multiselect',
            id: 'm',
            label: 'M',
            options: [
                { value: 'a', label: 'A' },
                { value: 'b', label: 'B' },
            ],
            default: ['a', 'b'],
        };
        expect(() => BriefFieldSchema.parse(f)).not.toThrow();
    });

    it('accepts an empty multiselect default', () => {
        const f: BriefField = {
            kind: 'multiselect',
            id: 'm',
            label: 'M',
            options: [{ value: 'a', label: 'A' }],
            default: [],
        };
        expect(() => BriefFieldSchema.parse(f)).not.toThrow();
    });

    it('accepts a valid toggle field', () => {
        const f: BriefField = { kind: 'toggle', id: 't', label: 'T', default: true };
        expect(() => BriefFieldSchema.parse(f)).not.toThrow();
    });

    it('accepts a valid text field (with and without placeholder)', () => {
        expect(() => BriefFieldSchema.parse({ kind: 'text', id: 'n', label: 'Notes' })).not.toThrow();
        expect(() =>
            BriefFieldSchema.parse({ kind: 'text', id: 'n', label: 'Notes', placeholder: 'hint' }),
        ).not.toThrow();
    });
});

describe('BriefFieldSchema — rejects invalid fields', () => {
    it('rejects an unknown kind', () => {
        expect(() => BriefFieldSchema.parse({ kind: 'slider', id: 'x', label: 'X' })).toThrow();
    });

    it('rejects a range field with default below min', () => {
        expect(() =>
            BriefFieldSchema.parse({ kind: 'range', id: 'r', label: 'R', min: 1, max: 5, step: 1, default: 0 }),
        ).toThrow();
    });

    it('rejects a range field with default above max', () => {
        expect(() =>
            BriefFieldSchema.parse({ kind: 'range', id: 'r', label: 'R', min: 1, max: 5, step: 1, default: 9 }),
        ).toThrow();
    });

    it('rejects a range field with min > max', () => {
        expect(() =>
            BriefFieldSchema.parse({ kind: 'range', id: 'r', label: 'R', min: 5, max: 1, step: 1, default: 3 }),
        ).toThrow();
    });

    it('rejects a range field with non-positive step', () => {
        expect(() =>
            BriefFieldSchema.parse({ kind: 'range', id: 'r', label: 'R', min: 0, max: 10, step: 0, default: 5 }),
        ).toThrow();
    });

    it('rejects a stepper field with default out of bounds', () => {
        expect(() =>
            BriefFieldSchema.parse({ kind: 'stepper', id: 's', label: 'S', min: 1, max: 4, default: 7 }),
        ).toThrow();
    });

    it('rejects a select field whose default is not an option value', () => {
        expect(() =>
            BriefFieldSchema.parse({
                kind: 'select',
                id: 's',
                label: 'S',
                options: [
                    { value: 'a', label: 'A' },
                    { value: 'b', label: 'B' },
                ],
                default: 'z',
            }),
        ).toThrow();
    });

    it('rejects a select field with no options', () => {
        expect(() =>
            BriefFieldSchema.parse({ kind: 'select', id: 's', label: 'S', options: [], default: 'a' }),
        ).toThrow();
    });

    it('rejects a multiselect field whose default is not an option value', () => {
        expect(() =>
            BriefFieldSchema.parse({
                kind: 'multiselect',
                id: 'm',
                label: 'M',
                options: [{ value: 'a', label: 'A' }],
                default: ['a', 'z'],
            }),
        ).toThrow();
    });

    it('rejects a field with an empty id', () => {
        expect(() =>
            BriefFieldSchema.parse({ kind: 'toggle', id: '', label: 'T', default: false }),
        ).toThrow();
    });
});
