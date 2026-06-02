// A.30.c — L3 ConsentStore tests.

import { describe, expect, it, beforeEach } from 'vitest';
import { ConsentStore } from '../src/ConsentStore.js';
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

describe('ConsentStore — read API', () => {
    let store: ConsentStore;
    beforeEach(() => {
        store = new ConsentStore();
    });

    it('starts empty', () => {
        expect(store.size()).toBe(0);
        expect(store.activeFor('usr_a', 'analytics')).toBeUndefined();
        expect(store.isConsented('usr_a', 'analytics')).toBe(false);
    });

    it('get returns undefined for unknown rows', () => {
        expect(store.get('usr_a', 'analytics', 'v1')).toBeUndefined();
    });

    it('listForUser returns rows ordered by grantedAt asc', () => {
        store.grant(consent('usr_a', 'analytics', 'v1', { grantedAt: '2026-06-02T10:00:00.000Z' }));
        store.grant(consent('usr_a', 'marketing-email', 'v1', { grantedAt: '2026-06-01T10:00:00.000Z' }));
        const rows = store.listForUser('usr_a');
        expect(rows.length).toBe(2);
        expect(rows[0]!.grantedAt < rows[1]!.grantedAt).toBe(true);
    });

    it('activeForUser returns only non-revoked rows', () => {
        store.grant(consent('usr_a', 'analytics', 'v1'));
        store.grant(consent('usr_a', 'marketing-email', 'v1'));
        store.revoke('usr_a', 'marketing-email', '2026-06-03T10:00:00.000Z');
        const active = store.activeForUser('usr_a');
        expect(active.length).toBe(1);
        expect(active[0]!.purpose).toBe('analytics');
    });
});

describe('ConsentStore — grant + supersede', () => {
    let store: ConsentStore;
    beforeEach(() => {
        store = new ConsentStore();
    });

    it('grants a fresh consent + activeFor finds it', () => {
        store.grant(consent('usr_a', 'analytics', 'v1'));
        expect(store.isConsented('usr_a', 'analytics')).toBe(true);
        expect(store.activeFor('usr_a', 'analytics')?.version).toBe('v1');
    });

    it('granting an identical row is idempotent (no listener fire)', () => {
        const c = consent('usr_a', 'analytics', 'v1');
        store.grant(c);
        let fires = 0;
        store.subscribe(() => fires++);
        const superseded = store.grant(c);
        expect(superseded).toEqual([]);
        expect(fires).toBe(0);
    });

    it('granting a new VERSION supersedes the prior active row + returns it', () => {
        store.grant(
            consent('usr_a', 'analytics', 'v1', {
                grantedAt: '2026-06-01T10:00:00.000Z',
            }),
        );
        const superseded = store.grant(
            consent('usr_a', 'analytics', 'v2', {
                grantedAt: '2026-06-02T10:00:00.000Z',
            }),
        );
        expect(superseded.length).toBe(1);
        expect(superseded[0]!.version).toBe('v1');
        expect(superseded[0]!.revokedAt).toBe('2026-06-02T10:00:00.000Z');
        // Active is now v2.
        expect(store.activeFor('usr_a', 'analytics')?.version).toBe('v2');
    });

    it('granting a new version of one purpose does NOT supersede other purposes', () => {
        store.grant(consent('usr_a', 'analytics', 'v1'));
        store.grant(consent('usr_a', 'marketing-email', 'v1'));
        const superseded = store.grant(consent('usr_a', 'analytics', 'v2'));
        expect(superseded.length).toBe(1);
        expect(superseded[0]!.purpose).toBe('analytics');
        // marketing-email still active.
        expect(store.isConsented('usr_a', 'marketing-email')).toBe(true);
    });

    it('granting a new version per-user is isolated', () => {
        store.grant(consent('usr_a', 'analytics', 'v1'));
        const superseded = store.grant(consent('usr_b', 'analytics', 'v1'));
        // usr_a's row is NOT touched by usr_b's grant.
        expect(superseded).toEqual([]);
        expect(store.isConsented('usr_a', 'analytics')).toBe(true);
        expect(store.isConsented('usr_b', 'analytics')).toBe(true);
    });

    it('activeFor picks the latest grantedAt when multiple active rows exist', () => {
        // (Defensive — the supersede path normally prevents this, but
        // direct grant calls with old timestamps should still pick
        // the latest grant.)
        store.grant(
            consent('usr_a', 'analytics', 'v1', {
                grantedAt: '2026-06-01T10:00:00.000Z',
            }),
        );
        store.grant(
            consent('usr_a', 'analytics', 'v2', {
                grantedAt: '2026-06-02T10:00:00.000Z',
            }),
        );
        // The supersede pass marked v1 revoked; activeFor returns v2.
        expect(store.activeFor('usr_a', 'analytics')?.version).toBe('v2');
    });
});

describe('ConsentStore — revoke', () => {
    let store: ConsentStore;
    beforeEach(() => {
        store = new ConsentStore();
        store.grant(consent('usr_a', 'analytics', 'v1'));
    });

    it('revokes the active consent + returns the revoked row', () => {
        const revoked = store.revoke('usr_a', 'analytics', '2026-06-03T10:00:00.000Z');
        expect(revoked?.revokedAt).toBe('2026-06-03T10:00:00.000Z');
        expect(store.isConsented('usr_a', 'analytics')).toBe(false);
    });

    it('is a no-op when there is no active consent (returns undefined)', () => {
        store.revoke('usr_a', 'analytics', '2026-06-03T10:00:00.000Z');
        const second = store.revoke('usr_a', 'analytics', '2026-06-04T10:00:00.000Z');
        expect(second).toBeUndefined();
    });

    it('historical revoked row stays in the store (audit history)', () => {
        store.revoke('usr_a', 'analytics', '2026-06-03T10:00:00.000Z');
        expect(store.size()).toBe(1);
        expect(store.get('usr_a', 'analytics', 'v1')?.revokedAt).toBe(
            '2026-06-03T10:00:00.000Z',
        );
    });
});

describe('ConsentStore — purgeUser (GDPR Art. 17)', () => {
    let store: ConsentStore;
    beforeEach(() => {
        store = new ConsentStore();
        store.grant(consent('usr_a', 'analytics', 'v1'));
        store.grant(consent('usr_a', 'marketing-email', 'v1'));
        store.grant(consent('usr_b', 'analytics', 'v1'));
    });

    it('hard-deletes every row for the named user', () => {
        const purged = store.purgeUser('usr_a');
        expect(purged).toBe(2);
        expect(store.size()).toBe(1);
        expect(store.listForUser('usr_a').length).toBe(0);
    });

    it('returns 0 when the user has no rows', () => {
        const purged = store.purgeUser('usr_does-not-exist');
        expect(purged).toBe(0);
    });

    it('leaves other users untouched', () => {
        store.purgeUser('usr_a');
        expect(store.isConsented('usr_b', 'analytics')).toBe(true);
    });
});

describe('ConsentStore — lifecycle', () => {
    it('subscribe + reset', () => {
        const store = new ConsentStore();
        let count = 0;
        store.subscribe(() => count++);
        store.grant(consent('usr_a', 'analytics', 'v1'));
        expect(count).toBe(1);
        store.reset();
        expect(count).toBe(2);
        expect(store.size()).toBe(0);
    });

    it('reset is a no-op when empty (no listener fire)', () => {
        const store = new ConsentStore();
        let count = 0;
        store.subscribe(() => count++);
        store.reset();
        expect(count).toBe(0);
    });

    it('dispose is idempotent', () => {
        const store = new ConsentStore();
        store.dispose();
        expect(() => store.dispose()).not.toThrow();
    });

    it('writes after dispose are warned + ignored', () => {
        const store = new ConsentStore();
        store.dispose();
        store.grant(consent('usr_a', 'analytics', 'v1'));
        expect(store.size()).toBe(0);
    });

    it('catches listener throws + carries on', () => {
        const store = new ConsentStore();
        let saw = false;
        store.subscribe(() => {
            throw new Error('test listener');
        });
        store.subscribe(() => {
            saw = true;
        });
        store.grant(consent('usr_a', 'analytics', 'v1'));
        expect(saw).toBe(true);
    });
});
