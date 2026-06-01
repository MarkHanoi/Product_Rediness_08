// C28 DAT-α-1 (Data Panel & Automation) — L0 data substrate tests.
//
// Covers (>= 18 cases per the DAT-α-1 brief):
//   • DataFilter — empty + populated (all 5 fields)
//   • ParameterFilter — each of the 9 operators + unknown rejection
//   • ParameterFilter — every `value` shape (string / number / bool / string[] / number[])
//   • DataSort — empty + multi-column + unknown direction
//   • DataGroupBy — every enum value + unknown rejection
//   • QualityRule — minimal + full + every rejection branch
//   • QualityViolation — minimal + with fixSuggestion
//   • BulkUpdatePayload — each `newValue` type + object-typed rejection
//   • ScheduledCheck — minimal + populated lastResult
//   • Round-trip idempotence (Schema.parse(Schema.parse(x)) === Schema.parse(x))
//
// Target: 100% branch coverage per `packages/schemas/vitest.config.ts`.

import { describe, expect, it } from 'vitest';
import {
    DataFilterSchema,
    ParameterFilterSchema,
    DataSortSchema,
    DataGroupBySchema,
    QualityRuleSchema,
    QualityRuleScopeSchema,
    QualityRuleSeveritySchema,
    QualityRuleSourceSchema,
    QualityViolationSchema,
    BulkUpdatePayloadSchema,
    BulkUpdateValueSchema,
    ScheduledCheckSchema,
    ScheduledCheckResultSchema,
    type DataFilter,
    type ParameterFilter,
    type DataSort,
    type DataGroupBy,
    type QualityRule,
    type QualityViolation,
    type BulkUpdatePayload,
    type ScheduledCheck,
} from '../src/data/index.js';

describe('DataFilterSchema', () => {
    it('accepts an empty filter {}', () => {
        const parsed = DataFilterSchema.parse({});
        expect(parsed).toEqual({});
    });

    it('parses a populated filter with all 5 fields', () => {
        const populated: DataFilter = {
            type: ['wall', 'door'],
            level: ['level-1', 'level-2'],
            apartment: ['apt-1'],
            room: ['room-7', 'room-8'],
            parameterFilters: [
                { paramName: 'height', op: 'gte', value: 2.4 },
                { paramName: 'finish', op: 'in', value: ['paint', 'tile'] },
            ],
        };
        const parsed = DataFilterSchema.parse(populated);
        expect(parsed).toEqual(populated);
    });

    it('rejects non-array `type`', () => {
        expect(() => DataFilterSchema.parse({ type: 'wall' })).toThrow();
    });
});

describe('ParameterFilterSchema', () => {
    const ops: ParameterFilter['op'][] = [
        'eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'in', 'nin', 'contains',
    ];

    it('accepts each of the 9 operators', () => {
        for (const op of ops) {
            const pf = ParameterFilterSchema.parse({
                paramName: 'x', op, value: 1,
            });
            expect(pf.op).toBe(op);
        }
    });

    it('rejects an unknown op', () => {
        expect(() => ParameterFilterSchema.parse({
            paramName: 'x', op: 'matches', value: 'foo',
        })).toThrow();
    });

    it('accepts a string value', () => {
        const pf = ParameterFilterSchema.parse({ paramName: 'finish', op: 'eq', value: 'paint' });
        expect(pf.value).toBe('paint');
    });

    it('accepts a number value', () => {
        const pf = ParameterFilterSchema.parse({ paramName: 'height', op: 'gt', value: 2.4 });
        expect(pf.value).toBe(2.4);
    });

    it('accepts a boolean value', () => {
        const pf = ParameterFilterSchema.parse({ paramName: 'isExterior', op: 'eq', value: true });
        expect(pf.value).toBe(true);
    });

    it('accepts a string[] value', () => {
        const pf = ParameterFilterSchema.parse({ paramName: 'tag', op: 'in', value: ['a', 'b'] });
        expect(pf.value).toEqual(['a', 'b']);
    });

    it('accepts a number[] value', () => {
        const pf = ParameterFilterSchema.parse({ paramName: 'level', op: 'in', value: [1, 2, 3] });
        expect(pf.value).toEqual([1, 2, 3]);
    });

    it('rejects an empty paramName', () => {
        expect(() => ParameterFilterSchema.parse({ paramName: '', op: 'eq', value: 1 })).toThrow();
    });

    it('rejects an object-typed value', () => {
        expect(() => ParameterFilterSchema.parse({
            paramName: 'x', op: 'eq', value: { nested: 1 },
        })).toThrow();
    });
});

describe('DataSortSchema', () => {
    it('accepts an empty sort []', () => {
        expect(DataSortSchema.parse([])).toEqual([]);
    });

    it('accepts a multi-column sort', () => {
        const sort: DataSort = [
            { column: 'level', direction: 'asc' },
            { column: 'height', direction: 'desc' },
        ];
        expect(DataSortSchema.parse(sort)).toEqual(sort);
    });

    it('rejects an unknown direction', () => {
        expect(() => DataSortSchema.parse([
            { column: 'x', direction: 'ascending' },
        ])).toThrow();
    });

    it('rejects an empty column name', () => {
        expect(() => DataSortSchema.parse([
            { column: '', direction: 'asc' },
        ])).toThrow();
    });
});

describe('DataGroupBySchema', () => {
    const allValues: DataGroupBy[] = [
        'type', 'level', 'apartment', 'room', 'custom-field',
    ];

    it('accepts each of the 5 enum values', () => {
        for (const v of allValues) {
            expect(DataGroupBySchema.parse(v)).toBe(v);
        }
    });

    it('rejects an unknown value', () => {
        expect(() => DataGroupBySchema.parse('floor')).toThrow();
    });
});

describe('QualityRuleSchema', () => {
    const minimal: QualityRule = {
        id: 'r1',
        scope: 'room',
        predicateId: 'p:room-min-area',
        severity: 'warning',
        message: 'Room area below minimum.',
        source: 'g-class',
    };

    const full: QualityRule = {
        ...minimal,
        fixSuggestion: 'Increase the room area to at least 9 m².',
    };

    it('accepts a minimal rule', () => {
        expect(QualityRuleSchema.parse(minimal)).toEqual(minimal);
    });

    it('accepts a full rule with fixSuggestion', () => {
        expect(QualityRuleSchema.parse(full)).toEqual(full);
    });

    it('rejects an unknown severity', () => {
        expect(() => QualityRuleSchema.parse({
            ...minimal, severity: 'critical' as QualityRule['severity'],
        })).toThrow();
    });

    it('rejects an unknown scope', () => {
        expect(() => QualityRuleSchema.parse({
            ...minimal, scope: 'wall' as QualityRule['scope'],
        })).toThrow();
    });

    it('rejects an unknown source', () => {
        expect(() => QualityRuleSchema.parse({
            ...minimal, source: 'invented' as QualityRule['source'],
        })).toThrow();
    });

    it('rejects an empty id', () => {
        expect(() => QualityRuleSchema.parse({ ...minimal, id: '' })).toThrow();
    });

    it('rejects an empty predicateId', () => {
        expect(() => QualityRuleSchema.parse({ ...minimal, predicateId: '' })).toThrow();
    });

    it('exposes scope / severity / source sub-enums', () => {
        // Smoke-check the sub-enums are usable on their own.
        expect(QualityRuleScopeSchema.parse('apartment')).toBe('apartment');
        expect(QualityRuleSeveritySchema.parse('info')).toBe('info');
        expect(QualityRuleSourceSchema.parse('custom')).toBe('custom');
        expect(() => QualityRuleScopeSchema.parse('site')).toThrow();
        expect(() => QualityRuleSeveritySchema.parse('debug')).toThrow();
        expect(() => QualityRuleSourceSchema.parse('builtin')).toThrow();
    });
});

describe('QualityViolationSchema', () => {
    const minimal: QualityViolation = {
        ruleId: 'r1',
        elementId: 'wall-7',
        severity: 'warning',
        message: 'Wall thinner than minimum.',
    };

    it('accepts a minimal violation', () => {
        expect(QualityViolationSchema.parse(minimal)).toEqual(minimal);
    });

    it('accepts a violation with fixSuggestion', () => {
        const v: QualityViolation = { ...minimal, fixSuggestion: 'Thicken to 100 mm.' };
        expect(QualityViolationSchema.parse(v)).toEqual(v);
    });

    it('rejects an empty elementId', () => {
        expect(() => QualityViolationSchema.parse({ ...minimal, elementId: '' })).toThrow();
    });

    it('rejects an unknown severity', () => {
        expect(() => QualityViolationSchema.parse({
            ...minimal, severity: 'fatal' as QualityViolation['severity'],
        })).toThrow();
    });
});

describe('BulkUpdatePayloadSchema', () => {
    const baseFilter = { type: ['wall'] };

    it('accepts a string newValue', () => {
        const p: BulkUpdatePayload = { filter: baseFilter, paramName: 'finish', newValue: 'paint' };
        expect(BulkUpdatePayloadSchema.parse(p).newValue).toBe('paint');
    });

    it('accepts a number newValue', () => {
        const p: BulkUpdatePayload = { filter: baseFilter, paramName: 'height', newValue: 2.7 };
        expect(BulkUpdatePayloadSchema.parse(p).newValue).toBe(2.7);
    });

    it('accepts a boolean newValue', () => {
        const p: BulkUpdatePayload = { filter: baseFilter, paramName: 'isExterior', newValue: true };
        expect(BulkUpdatePayloadSchema.parse(p).newValue).toBe(true);
    });

    it('accepts a null newValue (clear semantics)', () => {
        const p: BulkUpdatePayload = { filter: baseFilter, paramName: 'tag', newValue: null };
        expect(BulkUpdatePayloadSchema.parse(p).newValue).toBeNull();
    });

    it('rejects an object-typed newValue', () => {
        expect(() => BulkUpdatePayloadSchema.parse({
            filter: baseFilter, paramName: 'x', newValue: { nested: 1 },
        })).toThrow();
    });

    it('rejects an array-typed newValue', () => {
        expect(() => BulkUpdatePayloadSchema.parse({
            filter: baseFilter, paramName: 'x', newValue: [1, 2],
        })).toThrow();
    });

    it('rejects an empty paramName', () => {
        expect(() => BulkUpdatePayloadSchema.parse({
            filter: baseFilter, paramName: '', newValue: 1,
        })).toThrow();
    });

    it('exposes BulkUpdateValueSchema for engine reuse', () => {
        expect(BulkUpdateValueSchema.parse('x')).toBe('x');
        expect(BulkUpdateValueSchema.parse(1)).toBe(1);
        expect(BulkUpdateValueSchema.parse(false)).toBe(false);
        expect(BulkUpdateValueSchema.parse(null)).toBeNull();
        expect(() => BulkUpdateValueSchema.parse({ nope: true })).toThrow();
    });
});

describe('ScheduledCheckSchema', () => {
    const minimal: ScheduledCheck = {
        id: 'sc-1',
        ruleIds: ['r1', 'r2'],
        cron: '0 9 * * *',
        recipients: ['alice@example.com'],
    };

    it('accepts a minimal check (no lastRun / lastResult)', () => {
        const parsed = ScheduledCheckSchema.parse(minimal);
        expect(parsed).toEqual(minimal);
        expect(parsed.lastRun).toBeUndefined();
        expect(parsed.lastResult).toBeUndefined();
    });

    it('accepts a populated check with lastResult', () => {
        const populated: ScheduledCheck = {
            ...minimal,
            lastRun: '2026-06-01T09:00:00Z',
            lastResult: { violationCount: 3, summary: '3 warnings.' },
        };
        expect(ScheduledCheckSchema.parse(populated)).toEqual(populated);
    });

    it('rejects an empty recipient', () => {
        expect(() => ScheduledCheckSchema.parse({
            ...minimal, recipients: [''],
        })).toThrow();
    });

    it('rejects an empty cron', () => {
        expect(() => ScheduledCheckSchema.parse({
            ...minimal, cron: '',
        })).toThrow();
    });

    it('rejects a negative violationCount', () => {
        expect(() => ScheduledCheckSchema.parse({
            ...minimal,
            lastResult: { violationCount: -1, summary: 'oops' },
        })).toThrow();
    });

    it('rejects a non-integer violationCount', () => {
        expect(() => ScheduledCheckSchema.parse({
            ...minimal,
            lastResult: { violationCount: 1.5, summary: 'oops' },
        })).toThrow();
    });

    it('exposes ScheduledCheckResultSchema for engine reuse', () => {
        const r = ScheduledCheckResultSchema.parse({ violationCount: 0, summary: 'clean.' });
        expect(r.violationCount).toBe(0);
        expect(r.summary).toBe('clean.');
    });
});

describe('round-trip idempotence', () => {
    it('DataFilter — parse(parse(x)) === parse(x)', () => {
        const filter: DataFilter = {
            type: ['wall'],
            parameterFilters: [{ paramName: 'h', op: 'gte', value: 2 }],
        };
        const once = DataFilterSchema.parse(filter);
        const twice = DataFilterSchema.parse(once);
        expect(twice).toEqual(once);
    });

    it('QualityRule — parse(parse(x)) === parse(x)', () => {
        const rule: QualityRule = {
            id: 'r1',
            scope: 'project',
            predicateId: 'p:everything',
            severity: 'error',
            message: 'msg',
            fixSuggestion: 'fix',
            source: 'custom',
        };
        const once = QualityRuleSchema.parse(rule);
        const twice = QualityRuleSchema.parse(once);
        expect(twice).toEqual(once);
    });

    it('ScheduledCheck — parse(parse(x)) === parse(x)', () => {
        const sc: ScheduledCheck = {
            id: 'sc-1',
            ruleIds: ['r1'],
            cron: '0 0 * * *',
            recipients: ['x@y.z'],
            lastRun: '2026-06-01T00:00:00Z',
            lastResult: { violationCount: 0, summary: 'ok.' },
        };
        const once = ScheduledCheckSchema.parse(sc);
        const twice = ScheduledCheckSchema.parse(once);
        expect(twice).toEqual(once);
    });
});
