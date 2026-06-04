// A.10.c / A.10.d (Phase A · Sprint 2) — NOAA normals reader + cache tests.
//
// Headless — NO network. The live path is exercised via an injected
// `fetchImpl`; the offline path falls back to the bundled templates.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NOAANormal } from '@pryzm/schemas';
import {
    resolveNormals,
    clearNormalsCache,
    normalsCacheSize,
} from '../src/noaaNormalsReader.js';

function fakeNormals(seed = 0): NOAANormal[] {
    return Array.from({ length: 12 }, (_, i) => ({
        month: (i + 1) as NOAANormal['month'],
        avgDryBulbC: 12 + seed,
        avgMinDryBulbC: 7 + seed,
        avgMaxDryBulbC: 17 + seed,
        avgRelHumidityPct: 60,
        avgPrecipMm: 40,
        avgWindSpeedMps: 3.2,
        prevailingWindDirDeg: 200,
        avgGlobalHorizontalWm2: 220,
        heatingDegreeDaysBase18: 150,
        coolingDegreeDaysBase18: 20,
    }));
}

describe('resolveNormals', () => {
    beforeEach(() => clearNormalsCache());

    it('falls back to bundled normals when no fetchImpl is wired (offline)', async () => {
        const res = await resolveNormals(51.5, -0.12);
        expect(res.tier).toBe('bundled');
        expect(res.vendor).toBe('PRYZM-builtin');
        expect(res.monthlyNormals).toHaveLength(12);
        expect(res.cacheHit).toBe(false);
    });

    it('uses the live fetch when one is provided', async () => {
        const fetchImpl = vi.fn(async () => fakeNormals(5));
        const res = await resolveNormals(40, -74, { fetchImpl });
        expect(fetchImpl).toHaveBeenCalledOnce();
        expect(res.tier).toBe('noaa-normals');
        expect(res.vendor).toBe('NOAA NCEI');
        expect(res.monthlyNormals[0]!.avgDryBulbC).toBe(17); // 12 + seed 5
    });

    it('caches by quantised lat/lon — second resolve is a cache hit', async () => {
        await resolveNormals(35.68, 139.69); // Tokyo
        expect(normalsCacheSize()).toBe(1);
        const second = await resolveNormals(35.68, 139.69);
        expect(second.cacheHit).toBe(true);
    });

    it('does NOT call the live fetch on a cache hit', async () => {
        const fetchImpl = vi.fn(async () => fakeNormals());
        await resolveNormals(1, 1, { fetchImpl });
        await resolveNormals(1, 1, { fetchImpl });
        expect(fetchImpl).toHaveBeenCalledOnce(); // second served from cache
    });

    it('degrades to bundled (never throws) when the live fetch rejects', async () => {
        const fetchImpl = vi.fn(async () => {
            throw new Error('NOAA rate-limited');
        });
        const res = await resolveNormals(48.85, 2.35, { fetchImpl });
        expect(res.tier).toBe('bundled');
        expect(res.monthlyNormals).toHaveLength(12);
    });

    it('degrades to bundled when the live fetch returns an invalid shape', async () => {
        // Only 6 entries → fails the .length(12) Zod check → bundled fallback.
        const fetchImpl = vi.fn(async () => fakeNormals().slice(0, 6));
        const res = await resolveNormals(10, 10, { fetchImpl });
        expect(res.tier).toBe('bundled');
    });

    it('bypassCache forces a fresh resolve', async () => {
        const fetchImpl = vi.fn(async () => fakeNormals());
        await resolveNormals(5, 5, { fetchImpl });
        await resolveNormals(5, 5, { fetchImpl, bypassCache: true });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });
});
