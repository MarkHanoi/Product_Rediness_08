// §BALEARS-ENVELOPE — the L5 REACHABILITY test for the §OPEN-TOP-INDICATIVE arm: does a real click
// on the real Manacor control parcel actually put an indicative volume on screen today, now that
// `OPEN_TOP_INDICATIVE_JURISDICTIONS` lists Balears (2026-08-03)?
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS TEST EXISTS
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// This session's static trace found `applyBalearsZoningThenFallback` already calling
// `envelopePublicationPosture(BALEARS_JURISDICTION_ID)` and branching on
// `posture.posture === 'open-top-indicative' && rendererCanExpressOpenTop` — but nobody had ever
// DRIVEN it. `BALEARS_ENVELOPE_VERIFIED` is `false` (no determination), but
// `OPEN_TOP_INDICATIVE_JURISDICTIONS` now carries a Balears entry and `rendererCanExpressOpenTop`
// is measured `true`, so the indicative arm should now be reachable. This suite proves it with the
// real `dispatchParcelBoundary`, a real `SiteModelStore`, and the real MANACOR RE_NA control parcel
// fixture already committed for `resolveBalearsMuib.test.ts` (same zone: maxFloors 3, FAR 2.4,
// coverage 80%, no numeric height, no setbacks). The only stubs are the two same-origin proxies
// (`/api/catastro/parcel`, `/api/es/balears-muib`) — nothing about routing, posture or dispatch is
// mocked. It also proves the two guardrails by contrast: an unresolved zone still refuses, and if
// `rendererCanExpressOpenTop` were false the indicative arm must fall back to the cited refusal
// rather than silently draw.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SiteModelStore, siteCreate } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { BuildableEnvelope } from '@pryzm/schemas';
import {
    BALEARS_ENVELOPE_VERIFIED,
    isInBalears,
    envelopePublicationPosture,
    BALEARS_JURISDICTION_ID,
} from '@pryzm/site-parcel-data';
import {
    dispatchParcelBoundary,
    getLastBuildableEnvelope,
} from '../src/ui/site/siteDispatch.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The REAL Manacor RE_NA control parcel — same fixture `resolveBalearsMuib.test.ts` pins. */
const FIXTURE = JSON.parse(
    readFileSync(
        resolve(
            HERE,
            '..',
            '..',
            '..',
            'packages',
            'site-parcel-data',
            '__tests__',
            'fixtures',
            'balears-manacor-7704702ED1870S.json',
        ),
        'utf8',
    ),
) as {
    queryPoint: { lat: number; lon: number };
    muibAttributes: Record<string, unknown>;
    refcat: string;
};
const HTML = readFileSync(
    resolve(HERE, '..', '..', '..', 'tools', 'balears-muib-probe', 'out', 'p-test-292430.html'),
    'utf8',
);
const ATTRS = FIXTURE.muibAttributes;
const PT = FIXTURE.queryPoint;

/** A plot ring in scene metres, large enough that an 80 %-coverage/no-setback rule leaves a footprint. */
const BOUNDARY = {
    polygon: [
        { x: 0, z: 0 },
        { x: 15, z: 0 },
        { x: 15, z: 18 },
        { x: 0, z: 18 },
    ],
    edgeClassifications: ['front', 'side', 'rear', 'side'] as const,
};

interface RouteLog {
    readonly urls: string[];
}

/** Body shape mirrors `okBody()` in `resolveBalearsMuib.test.ts`. */
const okBody = (overrides: Record<string, unknown> = {}, html: string | null = HTML) => ({
    qualificacions: [{ attributes: { ...ATTRS, ...overrides } }],
    fitxa: html === null ? null : { identitat: 292430, url: ATTRS['URL'], html },
});

function stubProxies(log: RouteLog, muibBody: unknown, muibOk = true, muibStatus = 200): typeof globalThis.fetch {
    return vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        log.urls.push(url);
        if (url.startsWith('/api/catastro/parcel')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    parcel: {
                        refcat: FIXTURE.refcat,
                        address: 'PZ DE L\'EBENISTA 8 MANACOR (ILLES BALEARS)',
                        areaM2: 297,
                        areaOfficialM2: 297,
                        source: 'catastro',
                        ring: [
                            { lat: PT.lat, lon: PT.lon },
                            { lat: PT.lat + 0.0001, lon: PT.lon },
                            { lat: PT.lat + 0.0001, lon: PT.lon + 0.00013 },
                            { lat: PT.lat, lon: PT.lon + 0.00013 },
                        ],
                    },
                }),
            } as unknown as Response;
        }
        if (url.startsWith('/api/es/balears-muib')) {
            return {
                ok: muibOk,
                status: muibStatus,
                json: async () => muibBody,
            } as unknown as Response;
        }
        throw new TypeError(`unstubbed URL in unit test: ${url}`);
    }) as unknown as typeof globalThis.fetch;
}

function ctxFor(store: SiteModelStore) {
    const emitted: string[] = [];
    const rt = {
        events: { emit: (t: string) => { emitted.push(t); } },
    } as unknown as PryzmRuntime;
    return { ctx: { rt, store, projectId: 'proj-balears', toast: () => {} }, emitted };
}

async function waitForEvent(emitted: readonly string[], type: string, timeoutMs = 4_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (emitted.includes(type)) return;
        await new Promise((r) => setTimeout(r, 5));
    }
}

async function dispatchBalears(
    muibBody: unknown,
    muibOk = true,
    muibStatus = 200,
): Promise<{ store: SiteModelStore; envelope: BuildableEnvelope | null; urls: string[] }> {
    const log: RouteLog = { urls: [] };
    globalThis.fetch = stubProxies(log, muibBody, muibOk, muibStatus);
    const store = new SiteModelStore();
    siteCreate({ projectId: 'proj-balears', location: { latitude: PT.lat, longitude: PT.lon } }, store);
    const { ctx, emitted } = ctxFor(store);
    expect(
        dispatchParcelBoundary(ctx, { ...BOUNDARY, edgeClassifications: [...BOUNDARY.edgeClassifications] }),
    ).toBe(true);
    await waitForEvent(emitted, 'site.zoning-updated');
    return { store, envelope: getLastBuildableEnvelope(), urls: log.urls };
}

describe('§BALEARS-ENVELOPE — routing premise', () => {
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('the fixture point really is inside the Balears routing box', () => {
        expect(isInBalears(PT.lat, PT.lon)).toBe(true);
    });

    it('the determination gate is shut and the indicative registry carries Balears', () => {
        // ⚠ Pinning both halves of the precondition this whole suite depends on: if either flips,
        // the indicative-arm test below stops proving what it claims to prove.
        expect(BALEARS_ENVELOPE_VERIFIED).toBe(false);
        const posture = envelopePublicationPosture(BALEARS_JURISDICTION_ID);
        expect(posture.posture).toBe('open-top-indicative');
        expect(posture.openTop).not.toBeNull();
    });
});

describe('§BALEARS-ENVELOPE — the OPEN-TOP-INDICATIVE arm actually draws', () => {
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('a resolved Balears zone with the determination gate shut dispatches status:ok, openTop, with the missing constraints as caveats', async () => {
        const { store, envelope, urls } = await dispatchBalears(okBody());
        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('ok');
        expect(envelope!.publicationPosture).toBe('open-top-indicative');
        expect(envelope!.insetAreaM2).toBeGreaterThan(0);
        const caveatText = envelope!.caveats.join(' \n ');
        expect(caveatText).toMatch(/OPEN TOP \(ADR-0293\)/);
        expect(caveatText).toMatch(/heritage/i);
        expect(caveatText).toMatch(/flood/i);
        expect(caveatText).toMatch(/coastal/i);
        expect(caveatText).toMatch(/INDICATIVE \(ADR-0293\)/);
        expect(caveatText).toMatch(/PRYZM claims NO buildable right here/);
        // ⚠ It must NOT read as a determination — no plain refusal, and the jurisdiction ref is the
        // Balears one, not a fallback to the estimated triple.
        expect(store.getSite()!.parcel.zoning.jurisdictionRef).toBe('goib-muib');
        expect(urls.some((u) => u.startsWith('/api/es/balears-muib'))).toBe(true);
    });

    it('an unresolved zone (endpoint down) still refuses — the indicative arm never fabricates from nothing', async () => {
        const { envelope } = await dispatchBalears(null, false, 502);
        expect(envelope).not.toBeNull();
        expect(envelope!.status).not.toBe('ok');
        expect(envelope!.publicationPosture).not.toBe('open-top-indicative');
        expect(envelope!.refusal).toBeTruthy();
    });

    it('an empty zoning answer (source responded, nothing there) also refuses, distinctly', async () => {
        const { envelope } = await dispatchBalears({ qualificacions: [], fitxa: null });
        expect(envelope).not.toBeNull();
        expect(envelope!.status).not.toBe('ok');
        expect(envelope!.refusal).toBeTruthy();
    });
});

describe('§BALEARS-ENVELOPE — the ADR-0293 self-disable guardrail', () => {
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => {
        realFetch = globalThis.fetch;
        vi.resetModules();
    });
    afterEach(() => {
        globalThis.fetch = realFetch;
        vi.doUnmock('@pryzm/site-parcel-data');
        vi.restoreAllMocks();
    });

    it('if `rendererCanExpressOpenTop` regressed to false, the SAME resolved zone falls back to the cited refusal instead of drawing', async () => {
        // ⚠ This is the ONE thing that cannot be exercised by importing the real module: the
        // constant is measured `true` today, on purpose (§OPEN-TOP-INDICATIVE docstring). Mocking
        // it here proves the self-disable branch in `applyBalearsZoningThenFallback` (siteDispatch
        // ~L4468-4479) is live code, not dead prose, WITHOUT touching the shipped measurement.
        vi.doMock('@pryzm/site-parcel-data', async () => {
            const actual = await vi.importActual<typeof import('@pryzm/site-parcel-data')>(
                '@pryzm/site-parcel-data',
            );
            return { ...actual, rendererCanExpressOpenTop: false };
        });
        const { dispatchParcelBoundary: dispatchMocked, getLastBuildableEnvelope: lastMocked } =
            await import('../src/ui/site/siteDispatch.js');

        const log: RouteLog = { urls: [] };
        globalThis.fetch = stubProxies(log, okBody());
        const store = new SiteModelStore();
        siteCreate({ projectId: 'proj-balears-regressed', location: { latitude: PT.lat, longitude: PT.lon } }, store);
        const { ctx, emitted } = ctxFor(store);
        expect(
            dispatchMocked(ctx, { ...BOUNDARY, edgeClassifications: [...BOUNDARY.edgeClassifications] }),
        ).toBe(true);
        await waitForEvent(emitted, 'site.zoning-updated');
        const envelope = lastMocked();

        expect(envelope).not.toBeNull();
        expect(envelope!.status).not.toBe('ok');
        expect(envelope!.publicationPosture).not.toBe('open-top-indicative');
        expect(envelope!.refusal).toBeTruthy();
        // The refusal must SAY it is a render-path regression, not present as an ordinary "unknown
        // jurisdiction" or "gate shut" card — ADR-0293's own honesty requirement.
        const prose = `${envelope!.refusal!.headline} ${envelope!.refusal!.detail}`.toLowerCase();
        expect(prose).toMatch(/render-path regression|renderer cannot currently express/);
    });
});
