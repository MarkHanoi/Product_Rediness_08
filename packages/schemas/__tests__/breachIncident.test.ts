// A.30.b — BreachIncident schema tests.
//
// Pins the C22 §2.5 + §1.9 invariants: status-driven required fields,
// 72-h clock start at confirmedAt, recordsAffected ≥ subjectsAffected.

import { describe, expect, it } from 'vitest';
import {
    BreachIncidentSchema,
    BreachSeveritySchema,
    BreachStatusSchema,
    BreachRegionSchema,
    AuthorityNotificationSchema,
    SubjectNotificationSchema,
} from '../src/privacy/BreachIncident.js';

const BREACH_ID = 'breach_12345678-1234-1234-1234-123456789012';

function base(overrides: Record<string, unknown> = {}): unknown {
    return {
        id: BREACH_ID,
        detectedAt: '2026-06-01T10:00:00.000Z',
        confirmedAt: null,
        status: 'suspected',
        severity: 'medium',
        tiersAffected: ['pii'],
        recordsAffected: 100,
        subjectsAffected: 50,
        regionsAffected: ['eu'],
        description: 'Suspicious activity on the auth log.',
        authorityNotification: null,
        subjectNotification: null,
        closedAt: null,
        ...overrides,
    };
}

describe('Enums', () => {
    it('BreachSeveritySchema covers the 4 severities', () => {
        expect(BreachSeveritySchema.options).toEqual([
            'low',
            'medium',
            'high',
            'critical',
        ]);
    });

    it('BreachStatusSchema covers the 5 statuses', () => {
        expect(BreachStatusSchema.options).toEqual([
            'suspected',
            'confirmed',
            'notified-authority',
            'notified-subjects',
            'closed',
        ]);
    });

    it('BreachRegionSchema covers the 3 PRYZM-managed regions', () => {
        expect(BreachRegionSchema.options).toEqual(['eu', 'us', 'ap']);
    });
});

describe('AuthorityNotificationSchema + SubjectNotificationSchema', () => {
    it('accepts a fully-populated authority notification', () => {
        const ok = AuthorityNotificationSchema.parse({
            authority: 'ICO',
            sentAt: '2026-06-02T10:00:00.000Z',
            referenceNumber: 'ICO-2026-12345',
        });
        expect(ok.authority).toBe('ICO');
    });

    it('accepts a null referenceNumber', () => {
        expect(() =>
            AuthorityNotificationSchema.parse({
                authority: 'CNIL',
                sentAt: '2026-06-02T10:00:00.000Z',
                referenceNumber: null,
            }),
        ).not.toThrow();
    });

    it('SubjectNotificationSchema accepts email / in-app / postal', () => {
        for (const method of ['email', 'in-app', 'postal']) {
            expect(() =>
                SubjectNotificationSchema.parse({
                    sentAt: '2026-06-02T10:00:00.000Z',
                    method,
                    template: 'breach-art-34-v1',
                }),
            ).not.toThrow();
        }
    });

    it('SubjectNotificationSchema rejects unknown method', () => {
        expect(() =>
            SubjectNotificationSchema.parse({
                sentAt: '2026-06-02T10:00:00.000Z',
                method: 'fax',
                template: 't',
            }),
        ).toThrow();
    });
});

describe('BreachIncidentSchema — happy path', () => {
    it('accepts a suspected breach with minimum fields', () => {
        expect(() => BreachIncidentSchema.parse(base())).not.toThrow();
    });

    it('accepts a fully-closed breach with the full notification chain', () => {
        const ok = base({
            status: 'closed',
            confirmedAt: '2026-06-01T12:00:00.000Z',
            authorityNotification: {
                authority: 'ICO',
                sentAt: '2026-06-04T10:00:00.000Z',
                referenceNumber: 'ICO-2026-12345',
            },
            subjectNotification: {
                sentAt: '2026-06-05T10:00:00.000Z',
                method: 'email',
                template: 'breach-art-34-v1',
            },
            closedAt: '2026-07-01T10:00:00.000Z',
        });
        expect(() => BreachIncidentSchema.parse(ok)).not.toThrow();
    });
});

describe('BreachIncidentSchema — status-driven required fields', () => {
    it('status=confirmed requires confirmedAt', () => {
        const bad = base({ status: 'confirmed', confirmedAt: null });
        expect(() => BreachIncidentSchema.parse(bad)).toThrow(/confirmedAt/);
    });

    it('status=notified-authority requires authorityNotification', () => {
        const bad = base({
            status: 'notified-authority',
            confirmedAt: '2026-06-01T12:00:00.000Z',
            authorityNotification: null,
        });
        expect(() => BreachIncidentSchema.parse(bad)).toThrow(
            /authorityNotification/,
        );
    });

    it('status=notified-subjects requires subjectNotification', () => {
        const bad = base({
            status: 'notified-subjects',
            confirmedAt: '2026-06-01T12:00:00.000Z',
            authorityNotification: {
                authority: 'ICO',
                sentAt: '2026-06-04T10:00:00.000Z',
                referenceNumber: null,
            },
            subjectNotification: null,
        });
        expect(() => BreachIncidentSchema.parse(bad)).toThrow(
            /subjectNotification/,
        );
    });

    it('status=closed requires closedAt', () => {
        const bad = base({
            status: 'closed',
            confirmedAt: '2026-06-01T12:00:00.000Z',
            authorityNotification: {
                authority: 'ICO',
                sentAt: '2026-06-04T10:00:00.000Z',
                referenceNumber: null,
            },
            subjectNotification: {
                sentAt: '2026-06-05T10:00:00.000Z',
                method: 'email',
                template: 't',
            },
            closedAt: null,
        });
        expect(() => BreachIncidentSchema.parse(bad)).toThrow(/closedAt/);
    });
});

describe('BreachIncidentSchema — timing + count invariants', () => {
    it('rejects confirmedAt < detectedAt', () => {
        const bad = base({
            detectedAt: '2026-06-02T10:00:00.000Z',
            confirmedAt: '2026-06-01T10:00:00.000Z',
            status: 'confirmed',
        });
        expect(() => BreachIncidentSchema.parse(bad)).toThrow(/confirmedAt/);
    });

    it('rejects recordsAffected < subjectsAffected', () => {
        const bad = base({ recordsAffected: 10, subjectsAffected: 50 });
        expect(() => BreachIncidentSchema.parse(bad)).toThrow(/recordsAffected/);
    });

    it('accepts records == subjects (one record per subject)', () => {
        const ok = base({ recordsAffected: 50, subjectsAffected: 50 });
        expect(() => BreachIncidentSchema.parse(ok)).not.toThrow();
    });

    it('rejects negative counts', () => {
        expect(() =>
            BreachIncidentSchema.parse(base({ recordsAffected: -1 })),
        ).toThrow();
    });
});

describe('BreachIncidentSchema — id pattern', () => {
    it('rejects id missing the breach_ prefix', () => {
        expect(() =>
            BreachIncidentSchema.parse(base({ id: 'incident_123' })),
        ).toThrow();
    });
});

describe('BreachIncidentSchema — tier + region arrays', () => {
    it('accepts a multi-tier multi-region breach', () => {
        const ok = base({
            tiersAffected: ['pii', 'project'],
            regionsAffected: ['eu', 'us'],
        });
        expect(() => BreachIncidentSchema.parse(ok)).not.toThrow();
    });

    it('rejects unknown tier', () => {
        expect(() =>
            BreachIncidentSchema.parse(base({ tiersAffected: ['public'] })),
        ).toThrow();
    });

    it('rejects unknown region', () => {
        expect(() =>
            BreachIncidentSchema.parse(base({ regionsAffected: ['antarctica'] })),
        ).toThrow();
    });

    it('rejects "self-hosted" as a region (self-hosted breaches are not PRYZM-managed)', () => {
        expect(() =>
            BreachIncidentSchema.parse(base({ regionsAffected: ['self-hosted'] })),
        ).toThrow();
    });
});
