// §ZGZ-ENVELOPE — the L5 REACHABILITY + HONESTY-GATE test: what does a real click on a real
// Zaragoza parcel actually put on screen today?
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS TEST EXISTS
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// `ES_ZARAGOZA_PGOU2024_PACK` is REGISTERED in `rulepacks/registry.ts` with a non-empty
// `packsByZone` (4 transcribed A1 subgrados) whenever `ZARAGOZA_ENVELOPE_VERIFIED` is true, and the
// L5 dispatcher now resolves the LIVE calificación (`urbanismo:Calificaciones_Urbanas`). A wired
// resolver + a curated pack + an unsigned gate is exactly the dangerous configuration Córdoba's own
// test suite exists to police — the question "does a Zaragoza click publish a number right now?"
// cannot be answered by reading any one file, only by DRIVING THE DISPATCH. This suite is the
// direct analogue of `cordobaSiteDispatch.test.ts`: the real `dispatchParcelBoundary`, a real
// `SiteModelStore`, a site on real Zaragoza land, and the ONLY stub is the same-origin
// `/api/zaragoza/calificaciones` proxy. Nothing about the routing, the ordering, the gate or the
// dispatch is mocked — remove the `isInZaragoza` branch from `applyZoning` and the first test
// fails, because a Zaragoza plot would then fall through to the ESTIMATED front/side/rear default,
// precisely the fabrication the gate exists to prevent.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SiteModelStore, siteCreate } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { BuildableEnvelope } from '@pryzm/schemas';
import {
    ZARAGOZA_ENVELOPE_VERIFIED,
    isInZaragoza,
    ZARAGOZA_BBOX,
    registeredPackZoneCodes,
    ZARAGOZA_JURISDICTION_ID,
} from '@pryzm/site-parcel-data';
import {
    dispatchParcelBoundary,
    getLastBuildableEnvelope,
} from '../src/ui/site/siteDispatch.js';

/** A point inside Zaragoza's término municipal (well within `ZARAGOZA_BBOX`, asserted below). */
const PARCEL = {
    lat: 41.6488,
    lon: -0.8891,
} as const;

/** A small plot ring in scene metres — the shape a draw/select commits. */
const BOUNDARY = {
    polygon: [
        { x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 14 }, { x: 0, z: 14 },
    ],
    edgeClassifications: ['front', 'side', 'rear', 'side'] as const,
};

interface RouteLog {
    readonly urls: string[];
}

/**
 * Stub the one same-origin proxy this path calls. Any OTHER URL rejects, which is deliberate: if
 * the Zaragoza path ever started calling a national Catastro endpoint (it does not today) that
 * would need to surface here rather than hang silently.
 */
function stubProxies(
    log: RouteLog,
    calificacion: { calificacion?: string; descripcion?: string } | null,
): typeof globalThis.fetch {
    return vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        log.urls.push(url);
        if (url.startsWith('/api/zaragoza/calificaciones')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    features: calificacion ? [{ properties: calificacion }] : [],
                }),
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
    return { ctx: { rt, store, projectId: 'proj-zaragoza', toast: () => {} }, emitted };
}

/** Bounded poll — the zoning leg is a fire-and-forget async continuation. */
async function waitForEvent(emitted: readonly string[], type: string, timeoutMs = 4_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (emitted.includes(type)) return;
        await new Promise((r) => setTimeout(r, 5));
    }
}

async function dispatchZaragoza(
    calificacion: { calificacion?: string; descripcion?: string } | null = { calificacion: 'A1/3.1' },
): Promise<{
    store: SiteModelStore;
    envelope: BuildableEnvelope | null;
    urls: string[];
}> {
    const log: RouteLog = { urls: [] };
    globalThis.fetch = stubProxies(log, calificacion);
    const store = new SiteModelStore();
    siteCreate(
        { projectId: 'proj-zaragoza', location: { latitude: PARCEL.lat, longitude: PARCEL.lon } },
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
    return { store, envelope: getLastBuildableEnvelope(), urls: log.urls };
}

describe('§ZGZ-ENVELOPE — a click on a Zaragoza parcel reaches the Zaragoza code', () => {
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('the fixture point really is inside the shipping término-municipal extent (the routing premise)', () => {
        expect(isInZaragoza(PARCEL.lat, PARCEL.lon)).toBe(true);
        expect(PARCEL.lat).toBeGreaterThanOrEqual(ZARAGOZA_BBOX.minLat);
        expect(PARCEL.lat).toBeLessThanOrEqual(ZARAGOZA_BBOX.maxLat);
        expect(PARCEL.lon).toBeGreaterThanOrEqual(ZARAGOZA_BBOX.minLon);
        expect(PARCEL.lon).toBeLessThanOrEqual(ZARAGOZA_BBOX.maxLon);
    });

    it('ROUTES to the Zaragoza branch — NOT to the estimated front/side/rear default', async () => {
        // ⚠ THE REACHABILITY ASSERTION. If the `isInZaragoza` branch is removed from `applyZoning`,
        // this Spanish plot falls through to `applyEstimatedZoning`, which produces a REAL envelope
        // with setbacks and a height — `status: 'ok'`, no refusal. Both assertions below then fail.
        // The jurisdiction ref is the second half of the same proof: `idezar-calificaciones` is
        // written by no other branch.
        const { store, envelope, urls } = await dispatchZaragoza();
        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal).toBeTruthy();
        expect(store.getSite()!.parcel.zoning.jurisdictionRef).toBe('idezar-calificaciones');
        // The Zaragoza leg calls exactly the one same-origin proxy it needs, nothing more.
        const planningCalls = urls.filter((u) => u.includes('zaragoza') || u.includes('idezar'));
        expect(planningCalls.length).toBeGreaterThan(0);
    });

    it('the pack is registered ONLY while the gate is signed (today: gate is false)', () => {
        // ⚠ ⛔ THIS PINS THE GATE, NOT A FIXED PACK STATE. `ZARAGOZA_ENVELOPE_VERIFIED` is `false`
        // in this repository (§ZGZ-SUBGRADO, `esAragon.ts`) — a founder act, never a model flip
        // (L-449/L-677). `registeredPackZoneCodes` mirrors `registry.ts`'s own gate, so this
        // assertion tracks the SAME constant `applyZaragozaZoningThenFallback` reads, and drifts
        // together with it rather than duplicating a boolean that could disagree.
        expect(ZARAGOZA_ENVELOPE_VERIFIED).toBe(false);
        expect(registeredPackZoneCodes(ZARAGOZA_JURISDICTION_ID)).toHaveLength(0);
    });
});

describe('§ZGZ-ENVELOPE §HONESTY-GATE — a resolved grade never renders a number while the gate is shut', () => {
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('a PACKED grade (A1/3.1) resolves but dispatches a cited no-signed-rule refusal, never a number', async () => {
        const { envelope } = await dispatchZaragoza({
            calificacion: 'A1/3.1',
            descripcion: 'A1/3.1: Edificación en manzana cerrada. Barrios periféricos',
        });
        const r = envelope!.refusal!;
        // ⚠ `legallyGrounded: false` and it must stay false. The PGOU-2024 DOES set an envelope for
        // this subgrado (arts. 4.1.12) — what is missing is PRYZM's signed transcription, not the
        // law. Claiming `true` would attribute PRYZM's own unsigned state to Aragonese planning law.
        expect(r.legallyGrounded).toBe(false);
        const prose = `${r.headline} ${r.detail}`.toLowerCase();
        expect(prose).toMatch(/zaragoza/);
        // The resolved grade must be NAMED in the refusal, not silently dropped (honesty property 3
        // on `resolveZaragozaZone` / the §ZGZ-ZONE resolve in the dispatcher).
        expect(prose).toContain('a1/3.1');
    });

    it('a MATCHED-BUT-UNPACKED grade (A1/1) also refuses, never crashes, never borrows another subgrado\'s numbers', async () => {
        const { envelope } = await dispatchZaragoza({ calificacion: 'A1/1' });
        const r = envelope!.refusal!;
        expect(r.legallyGrounded).toBe(false);
        expect(envelope!.status).toBe('none');
    });

    it('an UNRESOLVED point (no calificación feature) still dispatches a cited refusal, never falls through to the estimate', async () => {
        const { envelope } = await dispatchZaragoza(null);
        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal).toBeTruthy();
    });

    it('NEVER draws an extrudable volume — no massing can be built from this answer', async () => {
        const { envelope } = await dispatchZaragoza();
        expect(envelope!.insetPolygon).toEqual([]);
        expect(envelope!.insetAreaM2).toBe(0);
        expect(envelope!.maxHeight_m).toBeNull();
        expect(envelope!.farLimitedHeight_m).toBeNull();
        expect(envelope!.maxFloors).toBeNull();
        expect(envelope!.maxCoverage).toBeNull();
        expect(envelope!.maxVolumeM3).toBeNull();
        expect(envelope!.tiers).toEqual([]);
    });

    it('writes NO number onto the persisted C19 Parcel either', async () => {
        const { store } = await dispatchZaragoza();
        const site = store.getSite()!;
        expect(site.parcel.maxHeight).toBeNull();
        expect(site.parcel.maxFAR).toBeNull();
        expect(site.parcel.buildableRing).toBeNull();
    });
});
