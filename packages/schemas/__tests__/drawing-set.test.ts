// C30 DSM-α-1 (Drawing Set Management) — L0 drawing-set substrate tests.
//
// Covers (>= 22 cases per the DSM-α-1 brief):
//   • Revision — minimal + full + each rejection branch
//   • SheetReference — every discipline + unknown discipline + order signs
//   • DrawingSet — minimal + status enum + cross-ref validation +
//                  per-discipline order uniqueness + cross-discipline
//                  same-order allowed + optional fields
//   • SheetIssue — minimal + with acknowledgements
//   • Round-trip idempotence (Schema.parse(Schema.parse(x)) === Schema.parse(x))

import { describe, expect, it } from 'vitest';
import {
    RevisionSchema,
    SheetReferenceSchema,
    DisciplineSchema,
    DrawingSetSchema,
    DrawingSetStatusSchema,
    SheetIssueSchema,
    SheetIssueAcknowledgementSchema,
    type Revision,
    type SheetReference,
    type Discipline,
    type DrawingSet,
    type DrawingSetStatus,
    type SheetIssue,
} from '../src/drawing-set/index.js';

describe('RevisionSchema', () => {
    const minimal: Revision = {
        letter: 'A',
        date: '2026-06-01',
        description: 'First issue',
    };

    it('accepts a minimal revision', () => {
        expect(RevisionSchema.parse(minimal)).toEqual(minimal);
    });

    it('accepts a full revision with author + supersededBy', () => {
        const full: Revision = {
            ...minimal,
            author: 'MH',
            supersededBy: 'B',
        };
        expect(RevisionSchema.parse(full)).toEqual(full);
    });

    it('accepts numeric letter conventions ("0", "1", "12")', () => {
        for (const letter of ['0', '1', '12']) {
            expect(RevisionSchema.parse({ ...minimal, letter }).letter).toBe(letter);
        }
    });

    it('accepts an ISO 8601 datetime (not just a date)', () => {
        const parsed = RevisionSchema.parse({ ...minimal, date: '2026-06-01T09:00:00Z' });
        expect(parsed.date).toBe('2026-06-01T09:00:00Z');
    });

    it('rejects an empty letter', () => {
        expect(() => RevisionSchema.parse({ ...minimal, letter: '' })).toThrow();
    });

    it('rejects a letter longer than 3 chars', () => {
        expect(() => RevisionSchema.parse({ ...minimal, letter: 'ABCD' })).toThrow();
    });

    it('rejects a letter with non-alphanumeric chars', () => {
        expect(() => RevisionSchema.parse({ ...minimal, letter: 'A-1' })).toThrow();
        expect(() => RevisionSchema.parse({ ...minimal, letter: 'a' })).toThrow();
    });

    it('rejects an unparseable date', () => {
        expect(() => RevisionSchema.parse({ ...minimal, date: 'not-a-date' })).toThrow();
    });
});

describe('SheetReferenceSchema', () => {
    const allDisciplines: Discipline[] = ['A', 'S', 'M', 'E', 'P', 'L', 'C', 'G'];

    it('accepts each of the 8 disciplines', () => {
        for (const discipline of allDisciplines) {
            const sr: SheetReference = {
                sheetId: 'sheet-1',
                sheetNumber: `${discipline}-101`,
                sheetName: 'Some sheet',
                discipline,
                order: 0,
            };
            const parsed = SheetReferenceSchema.parse(sr);
            expect(parsed.discipline).toBe(discipline);
        }
    });

    it('rejects an unknown discipline letter', () => {
        expect(() => SheetReferenceSchema.parse({
            sheetId: 'sheet-1',
            sheetNumber: 'X-101',
            sheetName: 'X',
            discipline: 'X' as Discipline,
            order: 0,
        })).toThrow();
    });

    it('accepts a negative order (cover-sheet convention)', () => {
        const sr: SheetReference = {
            sheetId: 'cover',
            sheetNumber: 'G-000',
            sheetName: 'COVER',
            discipline: 'G',
            order: -1,
        };
        expect(SheetReferenceSchema.parse(sr).order).toBe(-1);
    });

    it('rejects a non-numeric order', () => {
        expect(() => SheetReferenceSchema.parse({
            sheetId: 'sheet-1',
            sheetNumber: 'A-101',
            sheetName: 'X',
            discipline: 'A',
            order: '1' as unknown as number,
        })).toThrow();
    });

    it('exposes DisciplineSchema for engine reuse', () => {
        expect(DisciplineSchema.parse('A')).toBe('A');
        expect(() => DisciplineSchema.parse('Z')).toThrow();
    });
});

describe('DrawingSetSchema', () => {
    const baseRevision: Revision = {
        letter: 'A',
        date: '2026-06-01',
        description: 'First issue',
    };

    const minimal: DrawingSet = {
        id: 'ds-1',
        name: 'DD Issue 2026-06-15',
        projectId: 'proj-1',
        sheets: [],
        currentRevision: 'A',
        revisions: [baseRevision],
        status: 'draft',
    };

    it('accepts a minimal drawing set (no sheets, single revision)', () => {
        expect(DrawingSetSchema.parse(minimal)).toEqual(minimal);
    });

    it('accepts each of the 4 statuses', () => {
        const statuses: DrawingSetStatus[] = ['draft', 'issued', 'superseded', 'archived'];
        for (const status of statuses) {
            const parsed = DrawingSetSchema.parse({ ...minimal, status });
            expect(parsed.status).toBe(status);
        }
    });

    it('rejects an unknown status', () => {
        expect(() => DrawingSetSchema.parse({
            ...minimal,
            status: 'pending' as DrawingSetStatus,
        })).toThrow();
    });

    it('rejects a currentRevision letter that is not in revisions[]', () => {
        expect(() => DrawingSetSchema.parse({
            ...minimal,
            currentRevision: 'Z',
        })).toThrow();
    });

    it('accepts a currentRevision pointing to a non-first revision', () => {
        const parsed = DrawingSetSchema.parse({
            ...minimal,
            currentRevision: 'B',
            revisions: [
                { ...baseRevision, letter: 'A', supersededBy: 'B' },
                { letter: 'B', date: '2026-07-01', description: 'Coordination markup' },
            ],
        });
        expect(parsed.currentRevision).toBe('B');
    });

    it('accepts optional client / notes / issueDate', () => {
        const populated: DrawingSet = {
            ...minimal,
            status: 'issued',
            issueDate: '2026-06-15',
            client: 'Acme Corp',
            notes: 'For DD review.',
        };
        expect(DrawingSetSchema.parse(populated)).toEqual(populated);
    });

    it('enforces unique order per discipline', () => {
        const sheets: SheetReference[] = [
            { sheetId: 's1', sheetNumber: 'A-101', sheetName: 'P1', discipline: 'A', order: 0 },
            { sheetId: 's2', sheetNumber: 'A-102', sheetName: 'P2', discipline: 'A', order: 0 },
        ];
        expect(() => DrawingSetSchema.parse({ ...minimal, sheets })).toThrow();
    });

    it('accepts same order across DIFFERENT disciplines', () => {
        const sheets: SheetReference[] = [
            { sheetId: 's1', sheetNumber: 'A-101', sheetName: 'P1', discipline: 'A', order: 0 },
            { sheetId: 's2', sheetNumber: 'S-101', sheetName: 'F1', discipline: 'S', order: 0 },
            { sheetId: 's3', sheetNumber: 'M-101', sheetName: 'H1', discipline: 'M', order: 0 },
        ];
        const parsed = DrawingSetSchema.parse({ ...minimal, sheets });
        expect(parsed.sheets).toHaveLength(3);
    });

    it('accepts multiple sheets with distinct orders within one discipline', () => {
        const sheets: SheetReference[] = [
            { sheetId: 's1', sheetNumber: 'A-101', sheetName: 'P1', discipline: 'A', order: 0 },
            { sheetId: 's2', sheetNumber: 'A-102', sheetName: 'P2', discipline: 'A', order: 1 },
            { sheetId: 's3', sheetNumber: 'A-103', sheetName: 'P3', discipline: 'A', order: 2 },
        ];
        const parsed = DrawingSetSchema.parse({ ...minimal, sheets });
        expect(parsed.sheets.map((s) => s.order)).toEqual([0, 1, 2]);
    });

    it('exposes DrawingSetStatusSchema for engine reuse', () => {
        expect(DrawingSetStatusSchema.parse('draft')).toBe('draft');
        expect(() => DrawingSetStatusSchema.parse('unknown')).toThrow();
    });
});

describe('SheetIssueSchema', () => {
    const minimal: SheetIssue = {
        drawingSetId: 'ds-1',
        sheetId: 'sheet-1',
        revision: 'A',
        issueDate: '2026-06-15',
        recipients: ['alice@example.com'],
    };

    it('accepts a minimal sheet issue (no acknowledgedBy)', () => {
        const parsed = SheetIssueSchema.parse(minimal);
        expect(parsed).toEqual(minimal);
        expect(parsed.acknowledgedBy).toBeUndefined();
    });

    it('accepts an issue with acknowledgedBy entries', () => {
        const populated: SheetIssue = {
            ...minimal,
            transmittalRef: 'TR-001',
            acknowledgedBy: [
                { recipient: 'alice@example.com', date: '2026-06-16' },
                { recipient: 'bob@example.com', date: '2026-06-17T10:00:00Z' },
            ],
        };
        expect(SheetIssueSchema.parse(populated)).toEqual(populated);
    });

    it('rejects an empty recipients array', () => {
        expect(() => SheetIssueSchema.parse({ ...minimal, recipients: [] })).toThrow();
    });

    it('rejects an unparseable issueDate', () => {
        expect(() => SheetIssueSchema.parse({ ...minimal, issueDate: 'not-a-date' })).toThrow();
    });

    it('rejects an unparseable acknowledgement date', () => {
        expect(() => SheetIssueSchema.parse({
            ...minimal,
            acknowledgedBy: [{ recipient: 'alice@example.com', date: 'never' }],
        })).toThrow();
    });

    it('exposes SheetIssueAcknowledgementSchema for engine reuse', () => {
        const ack = SheetIssueAcknowledgementSchema.parse({
            recipient: 'x@y.z',
            date: '2026-06-16',
        });
        expect(ack.recipient).toBe('x@y.z');
        expect(() => SheetIssueAcknowledgementSchema.parse({
            recipient: '',
            date: '2026-06-16',
        })).toThrow();
    });
});

describe('round-trip idempotence', () => {
    it('DrawingSet — parse(parse(x)) === parse(x)', () => {
        const ds: DrawingSet = {
            id: 'ds-1',
            name: 'DD Issue 2026-06-15',
            projectId: 'proj-1',
            sheets: [
                { sheetId: 's1', sheetNumber: 'A-101', sheetName: 'Ground Plan', discipline: 'A', order: 0 },
                { sheetId: 's2', sheetNumber: 'S-101', sheetName: 'Foundations', discipline: 'S', order: 0 },
            ],
            currentRevision: 'A',
            revisions: [
                { letter: 'A', date: '2026-06-01', description: 'First issue', author: 'MH' },
            ],
            status: 'issued',
            issueDate: '2026-06-15',
            client: 'Acme',
            notes: 'For DD review.',
        };
        const once = DrawingSetSchema.parse(ds);
        const twice = DrawingSetSchema.parse(once);
        expect(twice).toEqual(once);
    });

    it('SheetIssue — parse(parse(x)) === parse(x)', () => {
        const si: SheetIssue = {
            drawingSetId: 'ds-1',
            sheetId: 'sheet-1',
            revision: 'A',
            issueDate: '2026-06-15',
            recipients: ['alice@example.com', 'bob@example.com'],
            transmittalRef: 'TR-001',
            acknowledgedBy: [
                { recipient: 'alice@example.com', date: '2026-06-16' },
            ],
        };
        const once = SheetIssueSchema.parse(si);
        const twice = SheetIssueSchema.parse(once);
        expect(twice).toEqual(once);
    });

    it('Revision — parse(parse(x)) === parse(x)', () => {
        const rev: Revision = {
            letter: 'B',
            date: '2026-07-01',
            description: 'Coordination markup',
            author: 'MH',
        };
        const once = RevisionSchema.parse(rev);
        const twice = RevisionSchema.parse(once);
        expect(twice).toEqual(once);
    });
});
