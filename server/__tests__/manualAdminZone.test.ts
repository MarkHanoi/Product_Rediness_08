/**
 * @file server/__tests__/manualAdminZone.test.ts
 *
 * §COR-MANUAL-ADMIN-ZONE — server-side admin-gating tests for the manual admin zone entry
 * mechanism (`server/adminAllowlist.js`, `server/manualAdminZoneStore.js`).
 *
 * SCOPE:
 *   1. isPryzmAdmin() — allowlisted email succeeds; non-allowlisted / null / empty fails.
 *   2. saveManualAdminZone() — allowlisted admin succeeds and persists (in-memory fallback,
 *      injected here so the suite runs with no live Postgres); non-admin / unauthenticated
 *      callers are rejected with a typed 'forbidden' error, and NOTHING is persisted.
 *   3. resolveManualAdminZone() — the entry's own author sees it back; a DIFFERENT allowlisted
 *      admin querying the SAME coordinates gets 'no-match' (no cross-admin leakage); a
 *      non-admin gets 'forbidden' regardless of what exists in the store.
 *
 * NOTE: this suite injects an in-memory fake `getPgPool` (returns null) so both functions use
 * the module's own in-memory fallback path — this is a genuine limitation: no live Postgres
 * instance is exercised here. The migration SQL itself (`server/dbMigrate.js`) was verified by
 * inspection only (syntax + convention match with the file's other CREATE TABLE blocks), not by
 * running it against a real database in this environment.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { isPryzmAdmin, PRYZM_ADMIN_ALLOWLIST } from '../adminAllowlist.js';
import {
    saveManualAdminZone,
    resolveManualAdminZone,
    _resetInMemoryStoreForTests,
} from '../manualAdminZoneStore.js';

const ADMIN_EMAIL = PRYZM_ADMIN_ALLOWLIST[0];
const OTHER_ADMIN_EMAIL = PRYZM_ADMIN_ALLOWLIST[1];
const NON_ADMIN_EMAIL = 'someone-else@example.com';

// Force the in-memory fallback path in every test (no getPgPool → pool is null).
const memDeps = { getPgPool: () => null };

describe('§COR-MANUAL-ADMIN-ZONE — isPryzmAdmin()', () => {
    it('returns true for every allowlisted email, case-insensitive + trimmed', () => {
        for (const email of PRYZM_ADMIN_ALLOWLIST) {
            expect(isPryzmAdmin(email)).toBe(true);
            expect(isPryzmAdmin(email.toUpperCase())).toBe(true);
            expect(isPryzmAdmin(`  ${email}  `)).toBe(true);
        }
    });

    it('returns false for a non-allowlisted email', () => {
        expect(isPryzmAdmin(NON_ADMIN_EMAIL)).toBe(false);
    });

    it('returns false for null/undefined/empty (no anonymous admin)', () => {
        expect(isPryzmAdmin(null)).toBe(false);
        expect(isPryzmAdmin(undefined)).toBe(false);
        expect(isPryzmAdmin('')).toBe(false);
    });
});

describe('§COR-MANUAL-ADMIN-ZONE — saveManualAdminZone() admin gating', () => {
    beforeEach(() => { _resetInMemoryStoreForTests(); });

    it('an allowlisted admin can save an entry', async () => {
        const row = await saveManualAdminZone(
            { jurisdiction: 'es-cordoba', lat: 37.9, lon: -4.75, zoneCode: 'PAS-2', subzoneCode: '2' },
            { email: ADMIN_EMAIL, userId: 'u1' },
            memDeps,
        );
        expect(row.zoneCode).toBe('PAS-2');
        expect(row.method).toBe('manual_admin_entry');
        expect(row.enteredByEmail).toBe(ADMIN_EMAIL.toLowerCase());
    });

    it('a non-allowlisted caller is rejected with a typed forbidden error, nothing persisted', async () => {
        await expect(
            saveManualAdminZone(
                { jurisdiction: 'es-cordoba', lat: 37.9, lon: -4.75, zoneCode: 'PAS-2' },
                { email: NON_ADMIN_EMAIL, userId: 'u2' },
                memDeps,
            ),
        ).rejects.toMatchObject({ code: 'forbidden' });

        // Prove nothing leaked into the store: even the allowlisted admin now finds no match.
        const result = await resolveManualAdminZone(
            { jurisdiction: 'es-cordoba', lat: 37.9, lon: -4.75 },
            { email: ADMIN_EMAIL },
            memDeps,
        );
        expect(result).toEqual({ ok: false, reason: 'no-match' });
    });

    it('an unauthenticated caller (null email) is rejected with a typed forbidden error', async () => {
        await expect(
            saveManualAdminZone(
                { jurisdiction: 'es-cordoba', lat: 37.9, lon: -4.75, zoneCode: 'PAS-2' },
                { email: null, userId: null },
                memDeps,
            ),
        ).rejects.toMatchObject({ code: 'forbidden' });
    });

    it('rejects invalid input even for an allowlisted admin (missing zoneCode)', async () => {
        await expect(
            saveManualAdminZone(
                { jurisdiction: 'es-cordoba', lat: 37.9, lon: -4.75 },
                { email: ADMIN_EMAIL, userId: 'u1' },
                memDeps,
            ),
        ).rejects.toMatchObject({ code: 'invalid-input' });
    });
});

describe('§COR-MANUAL-ADMIN-ZONE — resolveManualAdminZone() gating + scoping', () => {
    beforeEach(() => { _resetInMemoryStoreForTests(); });

    it('the entry\'s own author resolves it back, within the match radius', async () => {
        await saveManualAdminZone(
            { jurisdiction: 'es-cordoba', lat: 37.9000, lon: -4.7512, zoneCode: 'PAS-2', subzoneCode: '2' },
            { email: ADMIN_EMAIL, userId: 'u1' },
            memDeps,
        );
        const result = await resolveManualAdminZone(
            // A few metres off — proves the radius match, not an exact-coordinate requirement.
            { jurisdiction: 'es-cordoba', lat: 37.90005, lon: -4.75125 },
            { email: ADMIN_EMAIL },
            memDeps,
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.entry.zoneCode).toBe('PAS-2');
            expect(result.entry.subzoneCode).toBe('2');
            expect(result.entry.method).toBe('manual_admin_entry');
        }
    });

    it('a DIFFERENT allowlisted admin querying the SAME coordinates gets no-match (no cross-admin leakage)', async () => {
        await saveManualAdminZone(
            { jurisdiction: 'es-cordoba', lat: 37.9000, lon: -4.7512, zoneCode: 'PAS-2' },
            { email: ADMIN_EMAIL, userId: 'u1' },
            memDeps,
        );
        const result = await resolveManualAdminZone(
            { jurisdiction: 'es-cordoba', lat: 37.9000, lon: -4.7512 },
            { email: OTHER_ADMIN_EMAIL },
            memDeps,
        );
        expect(result).toEqual({ ok: false, reason: 'no-match' });
    });

    it('a non-admin caller gets forbidden regardless of what exists in the store', async () => {
        await saveManualAdminZone(
            { jurisdiction: 'es-cordoba', lat: 37.9000, lon: -4.7512, zoneCode: 'PAS-2' },
            { email: ADMIN_EMAIL, userId: 'u1' },
            memDeps,
        );
        const result = await resolveManualAdminZone(
            { jurisdiction: 'es-cordoba', lat: 37.9000, lon: -4.7512 },
            { email: NON_ADMIN_EMAIL },
            memDeps,
        );
        expect(result).toEqual({ ok: false, reason: 'forbidden' });
    });

    it('an unauthenticated (null email) caller gets forbidden', async () => {
        const result = await resolveManualAdminZone(
            { jurisdiction: 'es-cordoba', lat: 37.9000, lon: -4.7512 },
            { email: null },
            memDeps,
        );
        expect(result).toEqual({ ok: false, reason: 'forbidden' });
    });

    it('a point far outside the match radius resolves no-match even for the author', async () => {
        await saveManualAdminZone(
            { jurisdiction: 'es-cordoba', lat: 37.9000, lon: -4.7512, zoneCode: 'PAS-2' },
            { email: ADMIN_EMAIL, userId: 'u1' },
            memDeps,
        );
        const result = await resolveManualAdminZone(
            { jurisdiction: 'es-cordoba', lat: 38.5, lon: -5.5 },
            { email: ADMIN_EMAIL },
            memDeps,
        );
        expect(result).toEqual({ ok: false, reason: 'no-match' });
    });
});
