// §COR-MANUAL-ADMIN-ZONE — the dispatch-integration test for the manual admin zone entry
// mechanism (2026-08-05). Mirrors `cordobaTracedZoneVerifiedSiteDispatch.test.ts`'s shape, but the
// gate here is SESSION IDENTITY (an auth token in client storage that a server call resolves to an
// allowlisted admin's own saved entry), not a boolean constant.
//
// Proves:
//   (a) an admin session with a manual entry computes a REAL envelope from it, end-to-end.
//   (b) a non-admin / no-token session querying the SAME coordinates gets the normal, unaffected
//       (gate-closed traced-zone) behaviour — no leakage of the admin's entry.
//   (c) none of the existing `*_VERIFIED` flags are read or mutated by this mechanism.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SiteModelStore, siteCreate } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { BuildableEnvelope } from '@pryzm/schemas';
import {
    CORDOBA_ENVELOPE_VERIFIED,
    CORDOBA_TRACED_ZONES_VERIFIED,
    SEVILLA_ENVELOPE_VERIFIED,
} from '@pryzm/site-parcel-data';
import { dispatchParcelBoundary, getLastBuildableEnvelope } from '../src/ui/site/siteDispatch.js';

/** Same PAS-2 interior point used throughout the Córdoba traced-zone test suites. */
const PAS2_POINT = { lat: 37.9000309378604, lon: -4.751228404551405 };

const BOUNDARY = {
    polygon: [
        { x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: 40 }, { x: 0, z: 40 },
    ],
    edgeClassifications: ['front', 'side', 'rear', 'side'] as const,
};

function ctxFor(store: SiteModelStore) {
    const emitted: string[] = [];
    const rt = {
        events: { emit: (t: string) => { emitted.push(t); } },
    } as unknown as PryzmRuntime;
    return { ctx: { rt, store, projectId: 'proj-cordoba-manual-admin', toast: () => {} }, emitted };
}

async function waitForEvent(emitted: readonly string[], type: string, timeoutMs = 4_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (emitted.includes(type)) return;
        await new Promise((r) => setTimeout(r, 5));
    }
}

/** A fetch mock that answers `/api/manual-zone/resolve` with a fixed admin entry and throws (like
 *  the existing suites' `failOnAnyFetch`) on every other URL — the same "no PLANNING network call"
 *  filtering idiom every sibling Córdoba dispatch test already uses. */
function fetchThatAnswersManualZoneOnly(entry: {
    zoneCode: string;
    subzoneCode?: string | null;
    enteredByEmail?: string;
}): typeof globalThis.fetch {
    return vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/manual-zone/resolve')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    ok: true,
                    entry: {
                        zoneCode: entry.zoneCode,
                        subzoneCode: entry.subzoneCode ?? null,
                        payload: {},
                        enteredByEmail: entry.enteredByEmail ?? 'admin@example.com',
                        enteredAt: '2026-08-05T00:00:00.000Z',
                        notes: null,
                    },
                }),
            } as unknown as Response;
        }
        throw new TypeError(`unstubbed fetch in manual-admin-zone test: ${url}`);
    }) as unknown as typeof globalThis.fetch;
}

function failOnAnyFetch(): typeof globalThis.fetch {
    return vi.fn(async (input: RequestInfo | URL) => {
        throw new TypeError(`unstubbed fetch in manual-admin-zone (no-token) test: ${String(input)}`);
    }) as unknown as typeof globalThis.fetch;
}

describe('§COR-MANUAL-ADMIN-ZONE — none of the existing *_VERIFIED flags are touched', () => {
    it('CORDOBA_ENVELOPE_VERIFIED, CORDOBA_TRACED_ZONES_VERIFIED, SEVILLA_ENVELOPE_VERIFIED read their real committed values', () => {
        // This mechanism must never read or flip any of these — it is a completely separate,
        // additive, per-admin-session path. Pinned here so a future edit that accidentally wires
        // this feature through one of these flags is caught immediately.
        expect(CORDOBA_ENVELOPE_VERIFIED).toBe(true);
        expect(CORDOBA_TRACED_ZONES_VERIFIED).toBe(false);
        expect(SEVILLA_ENVELOPE_VERIFIED).toBe(true);
    });
});

describe('§COR-MANUAL-ADMIN-ZONE — admin session (auth token present) computes the manually-entered zone', () => {
    let realFetch: typeof globalThis.fetch;
    let hadLocalStorage: boolean;
    let realLocalStorage: unknown;

    beforeEach(() => {
        realFetch = globalThis.fetch;
        hadLocalStorage = 'localStorage' in globalThis;
        realLocalStorage = hadLocalStorage ? (globalThis as { localStorage?: unknown }).localStorage : undefined;
        // Node test environment has no real `localStorage` — stub the one key this feature reads,
        // mirroring the real `bim-platform-token` key `AuthModal.ts` writes in the browser.
        (globalThis as { localStorage?: unknown }).localStorage = {
            getItem: (key: string) => (key === 'bim-platform-token' ? 'fake-admin-session-token' : null),
        };
    });
    afterEach(() => {
        globalThis.fetch = realFetch;
        if (hadLocalStorage) (globalThis as { localStorage?: unknown }).localStorage = realLocalStorage;
        else delete (globalThis as { localStorage?: unknown }).localStorage;
        vi.restoreAllMocks();
    });

    it('computes a real envelope from the admin-entered zone code, tagged with the manual-admin jurisdiction ref', async () => {
        globalThis.fetch = fetchThatAnswersManualZoneOnly({ zoneCode: 'PAS-2', subzoneCode: '2' });
        const store = new SiteModelStore();
        siteCreate(
            { projectId: 'proj-cordoba-manual-admin', location: { latitude: PAS2_POINT.lat, longitude: PAS2_POINT.lon } },
            store,
        );
        const { ctx, emitted } = ctxFor(store);
        expect(
            dispatchParcelBoundary(ctx, {
                ...BOUNDARY,
                edgeClassifications: [...BOUNDARY.edgeClassifications],
            }),
        ).toBe(true);
        await waitForEvent(emitted, 'site.zoning-updated');
        const envelope: BuildableEnvelope | null = getLastBuildableEnvelope();
        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('ok');
        expect(envelope!.refusal).toBeFalsy();
        expect(envelope!.zoneCode).toBe('PAS-2');
        expect(envelope!.insetPolygon.length).toBeGreaterThan(0);
        expect(envelope!.insetAreaM2).toBeGreaterThan(0);
        expect(store.getSite()!.parcel.zoning.jurisdictionRef).toBe('coaco-pgou-manual-admin');
    });
});

describe('§COR-MANUAL-ADMIN-ZONE — non-admin / no-token session: normal unaffected behaviour, no leakage', () => {
    let realFetch: typeof globalThis.fetch;
    let hadLocalStorage: boolean;
    let realLocalStorage: unknown;

    beforeEach(() => {
        realFetch = globalThis.fetch;
        hadLocalStorage = 'localStorage' in globalThis;
        realLocalStorage = hadLocalStorage ? (globalThis as { localStorage?: unknown }).localStorage : undefined;
        // No token at all — the common case for every ordinary (non-admin) session.
        (globalThis as { localStorage?: unknown }).localStorage = {
            getItem: () => null,
        };
    });
    afterEach(() => {
        globalThis.fetch = realFetch;
        if (hadLocalStorage) (globalThis as { localStorage?: unknown }).localStorage = realLocalStorage;
        else delete (globalThis as { localStorage?: unknown }).localStorage;
        vi.restoreAllMocks();
    });

    it('the SAME coordinates an admin manually zoned to PAS-2 still fall through to the normal (refusal) chain for a session with no auth token', async () => {
        // §HONESTY — even though `fetchThatAnswersManualZoneOnly` WOULD answer with PAS-2 if called,
        // the resolver's own "no token ⇒ never call the network" guarantee means this mock is never
        // invoked at all for the manual-zone endpoint; failOnAnyFetch below proves that directly.
        globalThis.fetch = failOnAnyFetch();
        const store = new SiteModelStore();
        siteCreate(
            { projectId: 'proj-cordoba-manual-admin-nonadmin', location: { latitude: PAS2_POINT.lat, longitude: PAS2_POINT.lon } },
            store,
        );
        const { ctx, emitted } = ctxFor(store);
        expect(
            dispatchParcelBoundary(ctx, {
                ...BOUNDARY,
                edgeClassifications: [...BOUNDARY.edgeClassifications],
            }),
        ).toBe(true);
        await waitForEvent(emitted, 'site.zoning-updated');
        const envelope: BuildableEnvelope | null = getLastBuildableEnvelope();
        expect(envelope).not.toBeNull();
        // Never the admin's manually-entered zone — proves no leakage to a session without the token.
        expect(envelope!.zoneCode).not.toBe('PAS-2');
        expect(envelope!.status).not.toBe('ok');
        expect(envelope!.refusal).toBeTruthy();
        expect(store.getSite()!.parcel.zoning.jurisdictionRef).not.toBe('coaco-pgou-manual-admin');
        // No manual-zone (or any other planning) network call happened.
        const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as unknown as [string][];
        const planningCalls = calls
            .map(([u]) => String(u))
            .filter((u) => u.includes('manual-zone') || u.includes('catastro') || u.includes('coaco') || u.includes('coacordoba') || u.includes('cordoba-traced'));
        expect(planningCalls).toEqual([]);
    });
});
