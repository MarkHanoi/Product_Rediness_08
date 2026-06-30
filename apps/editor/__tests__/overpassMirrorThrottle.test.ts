// §OVERPASS-GENTLE-MIRRORS (ADR-0087) — Overpass mirror back-off + throttle tests.
//
// Validates the gentle-mirror strategy that replaced the prior `Promise.any`
// all-at-once blast (which tripped the public Overpass endpoints' 429 rate
// limiter). Node env, no DOM — we drive the PURE cooldown registry directly and
// exercise the 429 back-off through a stubbed global `fetch`.
//
//   1. cooldown registry: note → cooling down → expires → honours Retry-After
//   2. a 429 from a mirror records a shared cooldown (skips that mirror next time)
//   3. concurrency/stagger constants are sane (≤ mirror count, > 0)
//   4. all-mirrors-cooling-down degrades to an EMPTY collection (never throws)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    OVERPASS_ENDPOINTS,
    OVERPASS_MAX_CONCURRENCY,
    OVERPASS_STAGGER_MS,
    OVERPASS_RATE_LIMIT_COOLDOWN_MS,
    isOverpassMirrorCoolingDown,
    noteOverpassMirrorRateLimited,
    clearOverpassMirrorCooldowns,
    clearContextBuildingCache,
    fetchContextBuildings,
} from '../src/ui/geospatial/contextBuildings';

const MIRROR = OVERPASS_ENDPOINTS[0];

beforeEach(() => {
    clearContextBuildingCache(); // also clears cooldowns
    clearOverpassMirrorCooldowns();
    // localStorage may be undefined in the node test env — the loader swallows that.
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('§OVERPASS-GENTLE-MIRRORS cooldown registry', () => {
    it('a noted mirror is cooling down for the default floor, then expires', () => {
        const now = 1_000_000;
        expect(isOverpassMirrorCoolingDown(MIRROR, now)).toBe(false);
        noteOverpassMirrorRateLimited(MIRROR, undefined, now);
        expect(isOverpassMirrorCoolingDown(MIRROR, now)).toBe(true);
        // just before the floor expires → still cooling down
        expect(isOverpassMirrorCoolingDown(MIRROR, now + OVERPASS_RATE_LIMIT_COOLDOWN_MS - 1)).toBe(true);
        // after the floor → available again
        expect(isOverpassMirrorCoolingDown(MIRROR, now + OVERPASS_RATE_LIMIT_COOLDOWN_MS + 1)).toBe(false);
    });

    it('honours a longer Retry-After over the default floor', () => {
        const now = 2_000_000;
        const retryAfterSec = (OVERPASS_RATE_LIMIT_COOLDOWN_MS / 1000) + 120; // 2 min longer
        noteOverpassMirrorRateLimited(MIRROR, retryAfterSec, now);
        // still cooling down well past the default floor
        expect(isOverpassMirrorCoolingDown(MIRROR, now + OVERPASS_RATE_LIMIT_COOLDOWN_MS + 1)).toBe(true);
        expect(isOverpassMirrorCoolingDown(MIRROR, now + retryAfterSec * 1000 + 1)).toBe(false);
    });

    it('a shorter / absent Retry-After never undercuts the floor', () => {
        const now = 3_000_000;
        noteOverpassMirrorRateLimited(MIRROR, 1, now); // 1s requested
        expect(isOverpassMirrorCoolingDown(MIRROR, now + 2000)).toBe(true); // floor still applies
        expect(isOverpassMirrorCoolingDown(MIRROR, now + OVERPASS_RATE_LIMIT_COOLDOWN_MS + 1)).toBe(false);
    });

    it('clearOverpassMirrorCooldowns resets all mirrors', () => {
        const now = 4_000_000;
        for (const m of OVERPASS_ENDPOINTS) noteOverpassMirrorRateLimited(m, undefined, now);
        for (const m of OVERPASS_ENDPOINTS) expect(isOverpassMirrorCoolingDown(m, now)).toBe(true);
        clearOverpassMirrorCooldowns();
        for (const m of OVERPASS_ENDPOINTS) expect(isOverpassMirrorCoolingDown(m, now)).toBe(false);
    });
});

describe('§OVERPASS-GENTLE-MIRRORS throttle constants', () => {
    it('keeps concurrency bounded below the mirror count and stagger positive', () => {
        expect(OVERPASS_MAX_CONCURRENCY).toBeGreaterThanOrEqual(1);
        expect(OVERPASS_MAX_CONCURRENCY).toBeLessThanOrEqual(OVERPASS_ENDPOINTS.length);
        expect(OVERPASS_STAGGER_MS).toBeGreaterThan(0);
    });
});

describe('§OVERPASS-GENTLE-MIRRORS 429 back-off through fetch', () => {
    it('records a cooldown for a mirror that returns 429 and degrades to empty', async () => {
        // Every mirror returns 429 with a Retry-After → all back off, empty result.
        const fetchMock = vi.fn(async () =>
            new Response('rate limited', {
                status: 429,
                headers: { 'Retry-After': '30' },
            }),
        );
        vi.stubGlobal('fetch', fetchMock);

        const result = await fetchContextBuildings(51.5, -0.12); // London-ish
        // Never throws → empty collection.
        expect(result.type).toBe('FeatureCollection');
        expect(result.features).toHaveLength(0);
        // At least the first contacted mirror must now be cooling down.
        const anyCoolingDown = OVERPASS_ENDPOINTS.some((m) => isOverpassMirrorCoolingDown(m));
        expect(anyCoolingDown).toBe(true);
    });

    it('skips a pre-cooled mirror (does not contact it)', async () => {
        // Pre-cool the FIRST mirror; verify fetch is never called with its URL.
        noteOverpassMirrorRateLimited(MIRROR);
        const fetchMock = vi.fn(async (url: string) => {
            // Non-cooled mirrors return an empty-but-valid Overpass JSON.
            void url;
            return new Response(JSON.stringify({ elements: [] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        });
        vi.stubGlobal('fetch', fetchMock);

        await fetchContextBuildings(40.0, -3.0);
        const contactedFirstMirror = fetchMock.mock.calls.some(([u]) => u === MIRROR);
        expect(contactedFirstMirror).toBe(false);
    });
});
