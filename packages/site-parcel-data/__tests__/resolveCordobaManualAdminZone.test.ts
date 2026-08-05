// Córdoba (INE 14021) — tests for the MANUAL-ADMIN-ZONE resolver (2026-08-05). Proves the honesty
// properties documented in `resolveCordobaManualAdminZone.ts`'s header: never throws, never calls
// the network without an auth token, and correctly interprets the server's typed responses.

import { describe, it, expect, vi } from 'vitest';
import { resolveCordobaManualAdminZone } from '../src/providers/resolveCordobaManualAdminZone.js';

// Same PAS-2 interior point used by the traced-zone resolver's own test suite.
const PAS2_POINT = { lat: 37.9000309378604, lon: -4.751228404551405 };
// Nowhere near Córdoba (Madrid).
const MADRID_POINT = { lat: 40.4168, lon: -3.7038 };

function jsonResponse(status: number, body: unknown): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    } as unknown as Response;
}

describe('resolveCordobaManualAdminZone — input + coverage guards', () => {
    it('refuses no-point without ever calling fetch', async () => {
        const fetchImpl = vi.fn();
        const result = await resolveCordobaManualAdminZone(null, { fetchImpl, authToken: 'tok' });
        expect(result).toEqual({ ok: false, reason: 'no-point' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('refuses out-of-cordoba without ever calling fetch', async () => {
        const fetchImpl = vi.fn();
        const result = await resolveCordobaManualAdminZone(MADRID_POINT, { fetchImpl, authToken: 'tok' });
        expect(result).toEqual({ ok: false, reason: 'out-of-cordoba' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('refuses not-authenticated (no token) WITHOUT calling fetch at all — the load-bearing no-op guarantee', async () => {
        const fetchImpl = vi.fn();
        const result = await resolveCordobaManualAdminZone(PAS2_POINT, { fetchImpl, authToken: null });
        expect(result).toEqual({ ok: false, reason: 'not-authenticated' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});

describe('resolveCordobaManualAdminZone — server response interpretation', () => {
    it('resolves a real entry on a 200 ok:true response, sends the bearer token', async () => {
        const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
            expect(String(url)).toMatch(/\/api\/manual-zone\/resolve/);
            expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
            return jsonResponse(200, {
                ok: true,
                entry: {
                    zoneCode: 'PAS-2',
                    subzoneCode: '2',
                    payload: {},
                    enteredByEmail: 'admin@example.com',
                    enteredAt: '2026-08-05T00:00:00.000Z',
                    notes: null,
                },
            });
        });
        const result = await resolveCordobaManualAdminZone(PAS2_POINT, { fetchImpl, authToken: 'tok-123' });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.resolution.zoneCode).toBe('PAS-2');
            expect(result.resolution.subzoneCode).toBe('2');
            expect(result.resolution.enteredByEmail).toBe('admin@example.com');
            expect(result.resolution.provenance).toMatch(/manual admin entry/i);
        }
    });

    it('maps a 403 response to a forbidden refusal', async () => {
        const fetchImpl = vi.fn(async () => jsonResponse(403, { ok: false, reason: 'forbidden' }));
        const result = await resolveCordobaManualAdminZone(PAS2_POINT, { fetchImpl, authToken: 'tok' });
        expect(result).toEqual({ ok: false, reason: 'forbidden' });
    });

    it('maps an ok:false / no-match response to no-match', async () => {
        const fetchImpl = vi.fn(async () => jsonResponse(200, { ok: false, reason: 'no-match' }));
        const result = await resolveCordobaManualAdminZone(PAS2_POINT, { fetchImpl, authToken: 'tok' });
        expect(result).toEqual({ ok: false, reason: 'no-match' });
    });

    it('never throws on a network failure — returns data-unavailable', async () => {
        const fetchImpl = vi.fn(async () => { throw new TypeError('network down'); });
        const result = await resolveCordobaManualAdminZone(PAS2_POINT, { fetchImpl, authToken: 'tok' });
        expect(result).toEqual({ ok: false, reason: 'data-unavailable' });
    });

    it('never throws on a malformed JSON body', async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => { throw new SyntaxError('bad json'); },
        } as unknown as Response));
        const result = await resolveCordobaManualAdminZone(PAS2_POINT, { fetchImpl, authToken: 'tok' });
        expect(result).toEqual({ ok: false, reason: 'data-unavailable' });
    });

    it('never throws on a non-2xx, non-403 status', async () => {
        const fetchImpl = vi.fn(async () => jsonResponse(500, {}));
        const result = await resolveCordobaManualAdminZone(PAS2_POINT, { fetchImpl, authToken: 'tok' });
        expect(result).toEqual({ ok: false, reason: 'data-unavailable' });
    });
});
