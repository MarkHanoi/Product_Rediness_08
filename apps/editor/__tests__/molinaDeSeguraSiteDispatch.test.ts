// §MOLINA-DE-SEGURA-ENVELOPE — the L5 REACHABILITY test: what does a real click on a real Molina
// de Segura parcel actually put on screen today?
//
// Molina de Segura (INE 30027) has NO rulepack and NO working zone-identity resolver: the public
// "P.G.M.O. Información territorial" viewer is a third-party SaaS SPA (citymap.tecnogeows.com)
// whose backend API could not be enumerated by static fetch, and the ordinance PDFs' per-zone
// tables are image/vector-drawn, not text-extractable (see `esMolinaDeSegura.ts`). So this path
// is a pure, synchronous cited refusal — never the fabricated estimated triple (§L-663).

import { describe, it, expect } from 'vitest';
import { SiteModelStore, siteCreate } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { BuildableEnvelope } from '@pryzm/schemas';
import {
    isInMolinaDeSegura,
    MOLINA_DE_SEGURA_BBOX,
    MOLINA_DE_SEGURA_JURISDICTION_ID,
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
    return { ctx: { rt, store, projectId: 'proj-molina-de-segura', toast: () => {} }, emitted };
}

async function waitForEvent(emitted: readonly string[], type: string, timeoutMs = 4_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (emitted.includes(type)) return;
        await new Promise((r) => setTimeout(r, 5));
    }
}

/** A point well inside `MOLINA_DE_SEGURA_BBOX` and clear of every sibling registration. */
const MOLINA_POINT = { lat: 38.15, lon: -1.2 } as const;

async function dispatchMolina(): Promise<{ store: SiteModelStore; envelope: BuildableEnvelope | null }> {
    const store = new SiteModelStore();
    siteCreate(
        { projectId: 'proj-molina-de-segura', location: { latitude: MOLINA_POINT.lat, longitude: MOLINA_POINT.lon } },
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

describe('§MOLINA-DE-SEGURA-ENVELOPE — a click on a Molina de Segura parcel reaches the Molina de Segura code', () => {
    it('the fixture point really is inside the shipping Molina de Segura bbox extent (the routing premise)', () => {
        expect(isInMolinaDeSegura(MOLINA_POINT.lat, MOLINA_POINT.lon)).toBe(true);
        expect(MOLINA_POINT.lat).toBeGreaterThanOrEqual(MOLINA_DE_SEGURA_BBOX.minLat);
        expect(MOLINA_POINT.lat).toBeLessThanOrEqual(MOLINA_DE_SEGURA_BBOX.maxLat);
        expect(MOLINA_POINT.lon).toBeGreaterThanOrEqual(MOLINA_DE_SEGURA_BBOX.minLon);
        expect(MOLINA_POINT.lon).toBeLessThanOrEqual(MOLINA_DE_SEGURA_BBOX.maxLon);
    });

    it('a Molina de Segura parcel dispatches a cited "identified, not yet reachable" refusal — never a fabricated envelope', async () => {
        const { store, envelope } = await dispatchMolina();
        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal).toBeTruthy();
        expect(envelope!.refusal!.code).toBe('no-rule-pack');
        expect(envelope!.refusal!.legallyGrounded).toBe(false);
        expect(envelope!.maxHeight_m).toBeNull();
        const prose = `${envelope!.refusal!.headline} ${envelope!.refusal!.detail}`;
        expect(prose).toMatch(/Molina de Segura/);
        expect(store.getSite()!.parcel.zoning.jurisdictionRef).toBe(MOLINA_DE_SEGURA_JURISDICTION_ID);
        expect(store.getSite()!.parcel.maxHeight).toBeNull();
    });
});
