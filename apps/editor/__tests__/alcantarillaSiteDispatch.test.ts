// §ALCANTARILLA-ENVELOPE — the L5 REACHABILITY test: what does a real click on a real
// Alcantarilla parcel actually put on screen today?
//
// Alcantarilla (INE 30005) has NO rulepack — the two 1983 PGOU ordinance source documents are
// SharePoint-hosted and return HTTP 403 to automated fetch (see `esAlcantarilla.ts`). What it DOES
// have is a real, live, COARSE land-use resolver against CARM's own regional WFS
// (`resolveAlcantarillaLanduse.ts`). This suite proves the dispatch wiring the same way
// `cartagenaSiteDispatch.test.ts` does: the real `dispatchParcelBoundary`, a real
// `SiteModelStore`, real Alcantarilla land, and the ONLY stub is the injectable `fetch`.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SiteModelStore, siteCreate } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { BuildableEnvelope } from '@pryzm/schemas';
import {
    isInAlcantarilla,
    ALCANTARILLA_BBOX,
    ALCANTARILLA_JURISDICTION_ID,
} from '@pryzm/site-parcel-data';
import {
    dispatchParcelBoundary,
    getLastBuildableEnvelope,
} from '../src/ui/site/siteDispatch.js';

const BOUNDARY = {
    polygon: [
        { x: 0, z: 0 }, { x: 15, z: 0 }, { x: 15, z: 20 }, { x: 0, z: 20 },
    ],
    edgeClassifications: ['front', 'side', 'rear', 'side'] as const,
};

function ctxFor(store: SiteModelStore) {
    const emitted: string[] = [];
    const rt = {
        events: { emit: (t: string) => { emitted.push(t); } },
    } as unknown as PryzmRuntime;
    return { ctx: { rt, store, projectId: 'proj-alcantarilla', toast: () => {} }, emitted };
}

async function waitForEvent(emitted: readonly string[], type: string, timeoutMs = 4_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (emitted.includes(type)) return;
        await new Promise((r) => setTimeout(r, 5));
    }
}

/** A point well inside `ALCANTARILLA_BBOX` and clear of every sibling registration. */
const ALCANTARILLA_POINT = { lat: 37.965, lon: -1.22 } as const;

function geoJsonAround(lat: number, lon: number, properties: Record<string, unknown>) {
    const d = 0.01;
    return {
        type: 'FeatureCollection',
        features: [
            {
                type: 'Feature',
                properties,
                geometry: {
                    type: 'Polygon',
                    coordinates: [[
                        [lon - d, lat - d], [lon + d, lat - d],
                        [lon + d, lat + d], [lon - d, lat + d],
                        [lon - d, lat - d],
                    ]],
                },
            },
        ],
    };
}

function stubWfs(body: unknown): typeof globalThis.fetch {
    return vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('https://mapas-gis-inter.carm.es/geoserver/')) {
            return {
                ok: true,
                status: 200,
                json: async () => body,
            } as unknown as Response;
        }
        throw new TypeError(`unstubbed URL in unit test: ${url}`);
    }) as unknown as typeof globalThis.fetch;
}

async function dispatchAlcantarilla(
    projectId: string,
): Promise<{ store: SiteModelStore; envelope: BuildableEnvelope | null }> {
    const store = new SiteModelStore();
    siteCreate(
        {
            projectId,
            location: { latitude: ALCANTARILLA_POINT.lat, longitude: ALCANTARILLA_POINT.lon },
        },
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
    return { store, envelope: getLastBuildableEnvelope() };
}

describe('§ALCANTARILLA-ENVELOPE — a click on an Alcantarilla parcel reaches the Alcantarilla code', () => {
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('the fixture point really is inside the shipping Alcantarilla bbox extent (the routing premise)', () => {
        expect(isInAlcantarilla(ALCANTARILLA_POINT.lat, ALCANTARILLA_POINT.lon)).toBe(true);
        expect(ALCANTARILLA_POINT.lat).toBeGreaterThanOrEqual(ALCANTARILLA_BBOX.minLat);
        expect(ALCANTARILLA_POINT.lat).toBeLessThanOrEqual(ALCANTARILLA_BBOX.maxLat);
        expect(ALCANTARILLA_POINT.lon).toBeGreaterThanOrEqual(ALCANTARILLA_BBOX.minLon);
        expect(ALCANTARILLA_POINT.lon).toBeLessThanOrEqual(ALCANTARILLA_BBOX.maxLon);
    });

    it('a resolved land-use feature dispatches a LAND-USE-NAMED structural refusal — never a fabricated envelope', async () => {
        globalThis.fetch = stubWfs(
            geoJsonAround(ALCANTARILLA_POINT.lat, ALCANTARILLA_POINT.lon, {
                Clasificacion: 'ResidentialUse',
                Municipio: 'Alcantarilla',
                plan: 'es.carm.sitmurcia.pgalca.plu.sp:0030005',
            }),
        );
        const { store, envelope } = await dispatchAlcantarilla('proj-alcantarilla');
        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal).toBeTruthy();
        expect(envelope!.refusal!.code).toBe('no-rule-pack');
        expect(envelope!.refusal!.legallyGrounded).toBe(false);
        expect(envelope!.maxHeight_m).toBeNull();
        const prose =
            `${envelope!.refusal!.headline} ${envelope!.refusal!.detail} ` +
            `${(envelope!.refusal!.knownFacts ?? []).join(' ')}`;
        expect(prose).toMatch(/Alcantarilla/);
        expect(prose.toLowerCase()).toMatch(/sharepoint|403/);
        expect(store.getSite()!.parcel.zoning.jurisdictionRef).toBe(ALCANTARILLA_JURISDICTION_ID);
        expect(store.getSite()!.parcel.maxHeight).toBeNull();
    });

    it('NO feature at this point still reaches a cited refusal, never the estimated triple', async () => {
        globalThis.fetch = stubWfs({ type: 'FeatureCollection', features: [] });
        const { store, envelope } = await dispatchAlcantarilla('proj-alcantarilla-empty');
        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal).toBeTruthy();
        expect(envelope!.refusal!.legallyGrounded).toBe(false);
        expect(envelope!.maxHeight_m).toBeNull();
        expect(store.getSite()!.parcel.zoning.jurisdictionRef).toBe(ALCANTARILLA_JURISDICTION_ID);
    });
});
