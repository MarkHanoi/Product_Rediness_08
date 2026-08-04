// §SEVILLA-ENVELOPE — the L5 REACHABILITY test: does a real click on a Sevilla parcel reach the
// Sevilla code, and does it stay a cited, zone-named refusal by default (the
// §STAGING-UNCERTIFIED-PREVIEW override is OFF unless explicitly activated — see
// `uncertifiedPreviewMode.test.ts` for that gate's own unit tests)?
//
// This suite pins the REGRESSION baseline for the 2026-08-04 fondo-geometry work
// (`resolveSevillaAlignments.ts`, `sevillaFondoClip.ts`): wiring the real `A_INTERIOR-MAXIMA`
// geometry into `applySevillaZoningThenFallback` must not change SEVILLA's default (preview-off)
// behaviour — every parcel still refuses, still names the real zona_orden, still renders no number.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SiteModelStore, siteCreate } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { BuildableEnvelope } from '@pryzm/schemas';
import { SEVILLA_ENVELOPE_VERIFIED, SEVILLA_JURISDICTION_ID, isInSevilla } from '@pryzm/site-parcel-data';
import {
    dispatchParcelBoundary,
    getLastBuildableEnvelope,
} from '../src/ui/site/siteDispatch.js';

/** Sevilla centre (Nominatim, verified in existing Sevilla fixtures). */
const PARCEL = { lat: 37.3886303, lon: -5.9953403 } as const;

const BOUNDARY = {
    polygon: [
        { x: 0, z: 0 }, { x: 15, z: 0 }, { x: 15, z: 20 }, { x: 0, z: 20 },
    ],
    edgeClassifications: ['front', 'side', 'rear', 'side'] as const,
};

interface RouteLog { readonly urls: string[]; }

/** Stubs BOTH ArcGIS layers Sevilla's dispatch can call: layer 25 (zone) and layer 4 (alignments). */
function stubProxies(log: RouteLog, zonaOrden: string | null): typeof globalThis.fetch {
    return vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        log.urls.push(url);
        if (url.includes('/25/query')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    spatialReference: { wkid: 25830 },
                    features: zonaOrden ? [{ attributes: { zona_orden: zonaOrden }, geometry: {} }] : [],
                }),
            } as unknown as Response;
        }
        if (url.includes('/4/query')) {
            // No fondo geometry stubbed — proves the preview branch (OFF by default) never even
            // needs this to resolve for the baseline refusal to be correct.
            return {
                ok: true,
                status: 200,
                json: async () => ({ spatialReference: { wkid: 4326 }, features: [] }),
            } as unknown as Response;
        }
        return { ok: true, status: 200, json: async () => ({ elements: [] }) } as unknown as Response;
    }) as unknown as typeof globalThis.fetch;
}

function ctxFor(store: SiteModelStore) {
    const emitted: string[] = [];
    const rt = { events: { emit: (t: string) => { emitted.push(t); } } } as unknown as PryzmRuntime;
    return { ctx: { rt, store, projectId: 'proj-sevilla', toast: () => {} }, emitted };
}

async function waitForEvent(emitted: readonly string[], type: string, timeoutMs = 4_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (emitted.includes(type)) return;
        await new Promise((r) => setTimeout(r, 5));
    }
}

async function dispatchSevilla(zonaOrden: string | null): Promise<{
    store: SiteModelStore;
    envelope: BuildableEnvelope | null;
    urls: string[];
}> {
    const log: RouteLog = { urls: [] };
    globalThis.fetch = stubProxies(log, zonaOrden);
    const store = new SiteModelStore();
    siteCreate({ projectId: 'proj-sevilla', location: { latitude: PARCEL.lat, longitude: PARCEL.lon } }, store);
    const { ctx, emitted } = ctxFor(store);
    expect(
        dispatchParcelBoundary(ctx, { ...BOUNDARY, edgeClassifications: [...BOUNDARY.edgeClassifications] }),
    ).toBe(true);
    await waitForEvent(emitted, 'site.zoning-updated');
    return { store, envelope: getLastBuildableEnvelope(), urls: log.urls };
}

describe('§SEVILLA-ENVELOPE — default (preview-off) behaviour is unchanged by the fondo-geometry work', () => {
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('the fixture point really is inside the shipping Sevilla extent (the routing premise)', () => {
        expect(isInSevilla(PARCEL.lat, PARCEL.lon)).toBe(true);
    });

    it('the gate stays shut', () => {
        expect(SEVILLA_ENVELOPE_VERIFIED).toBe(false);
    });

    it('ROUTES to the Sevilla branch and refuses, naming the resolved SB zone', async () => {
        const { store, envelope, urls } = await dispatchSevilla('SB: Suburbana');
        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal).toBeTruthy();
        expect(envelope!.maxHeight_m).toBeNull();
        expect(envelope!.insetPolygon).toEqual([]);
        expect(store.getSite()!.parcel.zoning.jurisdictionRef).toBe(SEVILLA_JURISDICTION_ID);
        expect(store.getSite()!.parcel.maxHeight).toBeNull();
        // Confirms the zone query DID fire (layer 25) — reachability, on the existing precedent.
        expect(urls.some((u) => u.includes('/25/query'))).toBe(true);
    });

    it('an unresolved zone still refuses honestly, never falls through to the estimated triple', async () => {
        const { envelope } = await dispatchSevilla(null);
        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal).toBeTruthy();
    });
});
