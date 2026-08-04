// §CARTAGENA-ENVELOPE — the L5 REACHABILITY + HONESTY-GATE test: what does a real click on a real
// Cartagena parcel actually put on screen today?
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS TEST EXISTS
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// `ES_CARTAGENA_PGMO1987_PACK` is REGISTERED in `rulepacks/registry.ts` with a non-empty
// `packsByZone` (Vc1/Vc2/Vu1), and `resolveCartagenaZone.ts` queries a LIVE `wms_RPG0`
// `GetFeatureInfo` service. This suite proves the dispatch wiring the same way
// `teldeSiteDispatch.test.ts` does: the real `dispatchParcelBoundary`, a real `SiteModelStore`, a
// site on real Cartagena land, and the ONLY stub is the injectable `fetch` the WMS container calls.
// Unlike Telde/El Sauzal, there is NO signed-future compute branch here — every zone's setback is
// genuinely unquantified in the source ordinance, so both a resolved AND an unresolved zone must
// reach the SAME kind of outcome: a cited structural refusal, never the fabricated estimated
// triple.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SiteModelStore, siteCreate } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { BuildableEnvelope } from '@pryzm/schemas';
import {
    CARTAGENA_ENVELOPE_VERIFIED,
    isInCartagena,
    CARTAGENA_BBOX,
    CARTAGENA_JURISDICTION_ID,
    CARTAGENA_ZONE_CODES,
} from '@pryzm/site-parcel-data';
import {
    dispatchParcelBoundary,
    getLastBuildableEnvelope,
} from '../src/ui/site/siteDispatch.js';

/** A real point inside Cartagena's término municipal, well within `CARTAGENA_BBOX`. */
const PARCEL = {
    lat: 37.6,
    lon: -0.99,
} as const;

/** A small plot ring in scene metres — the shape a draw/select commits. */
const BOUNDARY = {
    polygon: [
        { x: 0, z: 0 }, { x: 15, z: 0 }, { x: 15, z: 20 }, { x: 0, z: 20 },
    ],
    edgeClassifications: ['front', 'side', 'rear', 'side'] as const,
};

interface RouteLog {
    readonly urls: string[];
}

/** A well-formed `GetFeatureInfo` GML body carrying one `Manzanas` feature. */
function gmlFor(fields: Record<string, string>): string {
    const leaves = Object.entries(fields)
        .map(([k, v]) => `<${k}>${v}</${k}>`)
        .join('');
    return `<msGMLOutput><gml:featureMember>${leaves}</gml:featureMember></msGMLOutput>`;
}

/** Stub the one network boundary this path calls: the `wms_RPG0` `GetFeatureInfo` endpoint. */
function stubWms(log: RouteLog, body: string | null): typeof globalThis.fetch {
    return vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        log.urls.push(url);
        if (url.startsWith('https://ide.cartagena.es/wms_RPG0/')) {
            return {
                ok: true,
                status: 200,
                text: async () => body ?? '<msGMLOutput></msGMLOutput>',
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
    return { ctx: { rt, store, projectId: 'proj-cartagena', toast: () => {} }, emitted };
}

async function waitForEvent(emitted: readonly string[], type: string, timeoutMs = 4_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (emitted.includes(type)) return;
        await new Promise((r) => setTimeout(r, 5));
    }
}

async function dispatchCartagena(body: string | null): Promise<{
    store: SiteModelStore;
    envelope: BuildableEnvelope | null;
    urls: string[];
}> {
    const log: RouteLog = { urls: [] };
    globalThis.fetch = stubWms(log, body);
    const store = new SiteModelStore();
    siteCreate(
        { projectId: 'proj-cartagena', location: { latitude: PARCEL.lat, longitude: PARCEL.lon } },
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

describe('§CARTAGENA-ENVELOPE — a click on a Cartagena parcel reaches the Cartagena code', () => {
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('the fixture point really is inside the shipping Cartagena bbox extent (the routing premise)', () => {
        expect(isInCartagena(PARCEL.lat, PARCEL.lon)).toBe(true);
        expect(PARCEL.lat).toBeGreaterThanOrEqual(CARTAGENA_BBOX.minLat);
        expect(PARCEL.lat).toBeLessThanOrEqual(CARTAGENA_BBOX.maxLat);
        expect(PARCEL.lon).toBeGreaterThanOrEqual(CARTAGENA_BBOX.minLon);
        expect(PARCEL.lon).toBeLessThanOrEqual(CARTAGENA_BBOX.maxLon);
    });

    it('the honesty gate is unsigned — this is the premise the whole suite tests', () => {
        expect(CARTAGENA_ENVELOPE_VERIFIED).toBe(false);
    });

    it('a PACKED zone (Vc1) queries the live WMS then dispatches a ZONE-NAMED structural refusal — never a fabricated envelope', async () => {
        const body = gmlFor({ ID: '1234', Matricula: 'R0-PGMO-0204', Norma: 'Vc1 (1,4)' });
        const { store, envelope, urls } = await dispatchCartagena(body);
        expect(urls.some((u) => u.includes('wms_RPG0'))).toBe(true);
        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal).toBeTruthy();
        expect(envelope!.refusal!.code).toBe('no-rule-pack');
        expect(envelope!.refusal!.legallyGrounded).toBe(false);
        expect(envelope!.maxHeight_m).toBeNull();
        expect(CARTAGENA_ZONE_CODES).toContain('Vc1');
        const prose = `${envelope!.refusal!.headline} ${envelope!.refusal!.detail}`;
        expect(prose).toMatch(/Vc1/);
        expect(prose.toLowerCase()).toMatch(/setback|retranqueo/);
        expect(store.getSite()!.parcel.zoning.jurisdictionRef).toBe(CARTAGENA_JURISDICTION_ID);
        expect(store.getSite()!.parcel.maxHeight).toBeNull();
    });

    it('an UNPACKED-but-resolved zone code still refuses on its own named merits', async () => {
        const body = gmlFor({ ID: '5678', Matricula: 'R0-PGMO-0099', Norma: 'Cc4 (2,1)' });
        const { envelope } = await dispatchCartagena(body);
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal!.code).toBe('no-rule-pack');
        const prose = `${envelope!.refusal!.headline} ${envelope!.refusal!.detail}`;
        expect(prose).toMatch(/Cc4/);
    });

    it('NO feature at this point still reaches a cited refusal, never the estimated triple', async () => {
        const { envelope } = await dispatchCartagena(null);
        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal).toBeTruthy();
        expect(envelope!.refusal!.legallyGrounded).toBe(false);
        expect(envelope!.maxHeight_m).toBeNull();
    });
});
