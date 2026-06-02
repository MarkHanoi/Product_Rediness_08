// A.30.a — L0 C22 Privacy schema tests.
//
// Pins the §2 invariants: 4-tier enum closed; DSAR type-specific shape
// (rectify needs patch); RetentionPolicy PII ≤ 90 days backup ceiling;
// Consent revokedAt ≥ grantedAt.

import { describe, expect, it } from 'vitest';
import {
    DataTierSchema,
    RegionSchema,
} from '../src/privacy/DataTier.js';
import {
    DsarRequestSchema,
    DsarTypeSchema,
    DsarStatusSchema,
} from '../src/privacy/DsarRequest.js';
import {
    ConsentSchema,
    ConsentPurposeSchema,
    ConsentSourceSchema,
} from '../src/privacy/Consent.js';
import {
    RetentionPolicySchema,
    RetentionTriggerSchema,
} from '../src/privacy/RetentionPolicy.js';

// ── Enums ──────────────────────────────────────────────────────────────

describe('DataTierSchema', () => {
    it('covers the 4 tiers, closed enum', () => {
        expect(DataTierSchema.options).toEqual([
            'pii',
            'project',
            'telemetry',
            'derived',
        ]);
    });

    it('rejects unknown tiers', () => {
        expect(() => DataTierSchema.parse('public')).toThrow();
    });
});

describe('RegionSchema', () => {
    it('covers the 4 regions', () => {
        expect(RegionSchema.options).toEqual([
            'eu',
            'us',
            'ap',
            'self-hosted',
        ]);
    });
});

describe('DsarTypeSchema + DsarStatusSchema', () => {
    it('DsarTypeSchema covers the 3 types', () => {
        expect(DsarTypeSchema.options).toEqual(['export', 'delete', 'rectify']);
    });
    it('DsarStatusSchema covers the 5 statuses', () => {
        expect(DsarStatusSchema.options).toEqual([
            'pending',
            'in-progress',
            'completed',
            'manual',
            'rejected',
        ]);
    });
});

describe('ConsentPurposeSchema', () => {
    it('covers the 5 purposes', () => {
        expect(ConsentPurposeSchema.options.length).toBe(5);
        expect(ConsentPurposeSchema.options).toContain('ai-training');
    });
});

// ── DsarRequest ────────────────────────────────────────────────────────

const DSAR_ID = 'dsar_12345678-1234-1234-1234-123456789012';

describe('DsarRequestSchema', () => {
    function base(): unknown {
        return {
            id: DSAR_ID,
            userId: 'usr_alice',
            type: 'export',
            status: 'pending',
            submittedAt: '2026-06-02T12:00:00.000Z',
            acknowledgedAt: null,
            dueAt: '2026-07-02T12:00:00.000Z',
            completedAt: null,
            verificationToken: 'verify-abc-123',
            verifiedAt: null,
            workerId: null,
            attempts: 0,
            exportBundleUrl: null,
            rectifyPatch: null,
        };
    }

    it('accepts a fully-populated pending export request', () => {
        expect(() => DsarRequestSchema.parse(base())).not.toThrow();
    });

    it('rejects id missing the dsar_ prefix', () => {
        const bad = { ...(base() as object), id: 'request_123' };
        expect(() => DsarRequestSchema.parse(bad)).toThrow();
    });

    it('rejects dueAt < submittedAt', () => {
        const bad = {
            ...(base() as object),
            submittedAt: '2026-07-02T12:00:00.000Z',
            dueAt: '2026-06-02T12:00:00.000Z',
        };
        expect(() => DsarRequestSchema.parse(bad)).toThrow(/dueAt/);
    });

    it('type=rectify requires rectifyPatch', () => {
        const bad = { ...(base() as object), type: 'rectify', rectifyPatch: null };
        expect(() => DsarRequestSchema.parse(bad)).toThrow(/rectifyPatch/);
    });

    it('type=export rejects a non-null rectifyPatch', () => {
        const bad = { ...(base() as object), type: 'export', rectifyPatch: { email: 'x' } };
        expect(() => DsarRequestSchema.parse(bad)).toThrow(/rectifyPatch/);
    });

    it('accepts a rectify with non-null patch', () => {
        const good = {
            ...(base() as object),
            type: 'rectify',
            rectifyPatch: { displayName: 'Alice Smith' },
        };
        expect(() => DsarRequestSchema.parse(good)).not.toThrow();
    });

    it('status=completed requires completedAt', () => {
        const bad = {
            ...(base() as object),
            status: 'completed',
            completedAt: null,
            verifiedAt: '2026-06-02T13:00:00.000Z',
        };
        expect(() => DsarRequestSchema.parse(bad)).toThrow(/completedAt/);
    });

    it('status=in-progress requires verifiedAt', () => {
        const bad = {
            ...(base() as object),
            status: 'in-progress',
            verifiedAt: null,
            workerId: 'worker-1',
        };
        expect(() => DsarRequestSchema.parse(bad)).toThrow(/verifiedAt/);
    });

    it('status=pending tolerates verifiedAt being null', () => {
        const good = {
            ...(base() as object),
            status: 'pending',
            verifiedAt: null,
        };
        expect(() => DsarRequestSchema.parse(good)).not.toThrow();
    });

    it('status=rejected tolerates verifiedAt being null (failed verification)', () => {
        const good = {
            ...(base() as object),
            status: 'rejected',
            verifiedAt: null,
        };
        expect(() => DsarRequestSchema.parse(good)).not.toThrow();
    });

    it('exportBundleUrl must be a URL when set', () => {
        const bad = { ...(base() as object), exportBundleUrl: 'not-a-url' };
        expect(() => DsarRequestSchema.parse(bad)).toThrow();
        const good = {
            ...(base() as object),
            exportBundleUrl: 'https://pii-bucket.eu.pryzm.app/exports/abc.zip',
        };
        expect(() => DsarRequestSchema.parse(good)).not.toThrow();
    });
});

// ── Consent ────────────────────────────────────────────────────────────

describe('ConsentSchema', () => {
    function base(): unknown {
        return {
            userId: 'usr_alice',
            purpose: 'analytics',
            version: '2026-06-01',
            grantedAt: '2026-06-02T10:00:00.000Z',
            revokedAt: null,
            source: 'signup',
        };
    }

    it('accepts an active consent', () => {
        expect(() => ConsentSchema.parse(base())).not.toThrow();
    });

    it('accepts a revoked consent (revokedAt ≥ grantedAt)', () => {
        const good = {
            ...(base() as object),
            revokedAt: '2026-06-03T10:00:00.000Z',
        };
        expect(() => ConsentSchema.parse(good)).not.toThrow();
    });

    it('rejects revokedAt < grantedAt', () => {
        const bad = {
            ...(base() as object),
            grantedAt: '2026-06-02T10:00:00.000Z',
            revokedAt: '2026-06-01T10:00:00.000Z',
        };
        expect(() => ConsentSchema.parse(bad)).toThrow(/revokedAt/);
    });

    it('rejects unknown purpose', () => {
        const bad = { ...(base() as object), purpose: 'data-sale' };
        expect(() => ConsentSchema.parse(bad)).toThrow();
    });

    it('rejects unknown source', () => {
        const bad = { ...(base() as object), source: 'cli' };
        expect(() => ConsentSchema.parse(bad)).toThrow();
    });

    it('source values include signup / settings / modal / api', () => {
        expect(ConsentSourceSchema.options).toEqual([
            'signup',
            'settings',
            'modal',
            'api',
        ]);
    });
});

// ── RetentionPolicy ────────────────────────────────────────────────────

describe('RetentionPolicySchema', () => {
    function base(): unknown {
        return {
            tier: 'pii',
            maxDays: 365,
            maxBackupDays: 90,
            earlyPurgeTriggers: ['account-delete', 'dsar-delete'],
            sweepIntervalMinutes: 60,
        };
    }

    it('accepts a PII policy with maxBackupDays = 90', () => {
        expect(() => RetentionPolicySchema.parse(base())).not.toThrow();
    });

    it('rejects PII policy with maxBackupDays > 90 (C22 §1.6)', () => {
        const bad = { ...(base() as object), maxBackupDays: 91 };
        expect(() => RetentionPolicySchema.parse(bad)).toThrow(/§1\.6/);
    });

    it('accepts a PROJECT policy with maxBackupDays > 90', () => {
        const good = {
            ...(base() as object),
            tier: 'project',
            maxDays: 1095,
            maxBackupDays: 365,
        };
        expect(() => RetentionPolicySchema.parse(good)).not.toThrow();
    });

    it('rejects maxBackupDays > maxDays', () => {
        const bad = {
            ...(base() as object),
            maxDays: 30,
            maxBackupDays: 60,
        };
        expect(() => RetentionPolicySchema.parse(bad)).toThrow(/maxBackupDays/);
    });

    it('rejects negative maxDays', () => {
        const bad = { ...(base() as object), maxDays: -1 };
        expect(() => RetentionPolicySchema.parse(bad)).toThrow();
    });

    it('rejects zero sweepIntervalMinutes', () => {
        const bad = { ...(base() as object), sweepIntervalMinutes: 0 };
        expect(() => RetentionPolicySchema.parse(bad)).toThrow();
    });

    it('accepts the full early-purge trigger set', () => {
        const good = {
            ...(base() as object),
            earlyPurgeTriggers: [
                'account-delete',
                'project-delete',
                'consent-revoke',
                'dsar-delete',
                'parent-delete',
            ],
        };
        expect(() => RetentionPolicySchema.parse(good)).not.toThrow();
    });

    it('rejects unknown early-purge trigger', () => {
        const bad = {
            ...(base() as object),
            earlyPurgeTriggers: ['account-delete', 'subpoena'],
        };
        expect(() => RetentionPolicySchema.parse(bad)).toThrow();
    });

    it('RetentionTriggerSchema covers all 5 triggers', () => {
        expect(RetentionTriggerSchema.options.length).toBe(5);
    });
});
