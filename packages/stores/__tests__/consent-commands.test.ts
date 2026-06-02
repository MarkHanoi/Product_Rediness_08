// A.30.d.1 — consent.* command handler tests.

import { describe, expect, it, beforeEach } from 'vitest';
import { ConsentStore } from '../src/ConsentStore.js';
import {
    grantConsent,
    revokeConsent,
    purgeUserConsent,
} from '../src/consent-commands/index.js';
import type { Consent, ConsentPurpose } from '@pryzm/schemas/privacy';

function consent(
    userId: string,
    purpose: ConsentPurpose,
    version: string,
    overrides: Partial<Consent> = {},
): Consent {
    return {
        userId,
        purpose,
        version,
        grantedAt: '2026-06-02T10:00:00.000Z',
        revokedAt: null,
        source: 'settings',
        ...overrides,
    };
}

describe('grantConsent()', () => {
    let store: ConsentStore;
    beforeEach(() => {
        store = new ConsentStore();
    });

    it('grants a fresh consent + returns superseded:[]', () => {
        const result = grantConsent(consent('usr_a', 'analytics', 'v1'), store);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.event.supersededRows).toEqual([]);
        }
        expect(store.isConsented('usr_a', 'analytics')).toBe(true);
    });

    it('supersedes prior active versions of the same purpose', () => {
        grantConsent(
            consent('usr_a', 'analytics', 'v1', {
                grantedAt: '2026-06-01T10:00:00.000Z',
            }),
            store,
        );
        const result = grantConsent(
            consent('usr_a', 'analytics', 'v2', {
                grantedAt: '2026-06-02T10:00:00.000Z',
            }),
            store,
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.event.supersededRows.length).toBe(1);
            expect(result.event.supersededRows[0]!.version).toBe('v1');
        }
    });

    it('does NOT supersede other-purpose grants', () => {
        grantConsent(consent('usr_a', 'analytics', 'v1'), store);
        const result = grantConsent(consent('usr_a', 'marketing-email', 'v1'), store);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.event.supersededRows).toEqual([]);
    });

    it('throws on Zod-invalid payload', () => {
        const bad = { ...consent('usr_a', 'analytics', 'v1'), purpose: 'unknown' };
        expect(() => grantConsent(bad as unknown as Consent, store)).toThrow();
    });
});

describe('revokeConsent()', () => {
    let store: ConsentStore;
    beforeEach(() => {
        store = new ConsentStore();
    });

    it('revokes the active consent', () => {
        grantConsent(consent('usr_a', 'analytics', 'v1'), store);
        const result = revokeConsent(
            { userId: 'usr_a', purpose: 'analytics', revokedAt: '2026-06-03T10:00:00.000Z' },
            store,
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.event.consent.revokedAt).toBe('2026-06-03T10:00:00.000Z');
        }
        expect(store.isConsented('usr_a', 'analytics')).toBe(false);
    });

    it('rejects when there is no active consent', () => {
        const result = revokeConsent(
            { userId: 'usr_a', purpose: 'analytics', revokedAt: '2026-06-03T10:00:00.000Z' },
            store,
        );
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason).toBe('no-active-consent');
            expect(result.message).toMatch(/no active 'analytics'/);
        }
    });

    it('rejects revoking after a previous revoke (no active consent left)', () => {
        grantConsent(consent('usr_a', 'analytics', 'v1'), store);
        revokeConsent(
            { userId: 'usr_a', purpose: 'analytics', revokedAt: '2026-06-03T10:00:00.000Z' },
            store,
        );
        const result = revokeConsent(
            { userId: 'usr_a', purpose: 'analytics', revokedAt: '2026-06-04T10:00:00.000Z' },
            store,
        );
        expect(result.ok).toBe(false);
    });

    it('throws on Zod-invalid payload', () => {
        expect(() =>
            revokeConsent(
                { userId: 'usr_a', purpose: 'invalid' as ConsentPurpose, revokedAt: '2026-06-03T10:00:00.000Z' },
                store,
            ),
        ).toThrow();
    });
});

describe('purgeUserConsent()', () => {
    let store: ConsentStore;
    beforeEach(() => {
        store = new ConsentStore();
    });

    it('purges every row for the user + returns count', () => {
        grantConsent(consent('usr_a', 'analytics', 'v1'), store);
        grantConsent(consent('usr_a', 'marketing-email', 'v1'), store);
        grantConsent(consent('usr_b', 'analytics', 'v1'), store);
        const result = purgeUserConsent({ userId: 'usr_a' }, store);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.event.rowCount).toBe(2);
            expect(result.event.userId).toBe('usr_a');
        }
        // Other user untouched.
        expect(store.isConsented('usr_b', 'analytics')).toBe(true);
    });

    it('returns rowCount: 0 when the user has no rows (idempotent)', () => {
        const result = purgeUserConsent({ userId: 'usr_unknown' }, store);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.event.rowCount).toBe(0);
    });

    it('throws on empty userId', () => {
        expect(() => purgeUserConsent({ userId: '' }, store)).toThrow();
    });
});
