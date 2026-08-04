// §LORCA-ENVELOPE — the L5 REACHABILITY test: what does a real click on a real Lorca parcel
// actually put on screen today?
//
// Lorca (INE 30024) has NO rulepack and NO working zone-identity resolver: a candidate parcel-
// lookup mechanism (`urbanismoenredWS/FichaUrbanistica`) was located in the live viewer's own
// production JS bundle, but it requires a runtime session token automated tooling could not
// obtain, so it was never fired against a real coordinate (see `esLorca.ts`). So this path is a
// pure, synchronous cited refusal — proven the same way `esMalaga.ts`/`esGranada.ts`'s dispatch
// is proven — never the fabricated estimated triple (§L-663).

import { describe, it, expect } from 'vitest';
import { SiteModelStore, siteCreate } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { BuildableEnvelope } from '@pryzm/schemas';
import { isInLorca, LORCA_BBOX, LORCA_JURISDICTION_ID } from '@pryzm/site-parcel-data';
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
    return { ctx: { rt, store, projectId: 'proj-lorca', toast: () => {} }, emitted };
}

async function waitForEvent(emitted: readonly string[], type: string, timeoutMs = 4_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (emitted.includes(type)) return;
        await new Promise((r) => setTimeout(r, 5));
    }
}

/** A point well inside `LORCA_BBOX` and clear of every sibling Región de Murcia registration. */
const LORCA_POINT = { lat: 37.6, lon: -1.7 } as const;

async function dispatchLorca(): Promise<{ store: SiteModelStore; envelope: BuildableEnvelope | null }> {
    const store = new SiteModelStore();
    siteCreate(
        { projectId: 'proj-lorca', location: { latitude: LORCA_POINT.lat, longitude: LORCA_POINT.lon } },
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

describe('§LORCA-ENVELOPE — a click on a Lorca parcel reaches the Lorca code', () => {
    it('the fixture point really is inside the shipping Lorca bbox extent (the routing premise)', () => {
        expect(isInLorca(LORCA_POINT.lat, LORCA_POINT.lon)).toBe(true);
        expect(LORCA_POINT.lat).toBeGreaterThanOrEqual(LORCA_BBOX.minLat);
        expect(LORCA_POINT.lat).toBeLessThanOrEqual(LORCA_BBOX.maxLat);
        expect(LORCA_POINT.lon).toBeGreaterThanOrEqual(LORCA_BBOX.minLon);
        expect(LORCA_POINT.lon).toBeLessThanOrEqual(LORCA_BBOX.maxLon);
    });

    it('a Lorca parcel dispatches a cited "identified, not yet reachable" refusal — never a fabricated envelope', async () => {
        const { store, envelope } = await dispatchLorca();
        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal).toBeTruthy();
        expect(envelope!.refusal!.code).toBe('no-rule-pack');
        expect(envelope!.refusal!.legallyGrounded).toBe(false);
        expect(envelope!.maxHeight_m).toBeNull();
        const prose = `${envelope!.refusal!.headline} ${envelope!.refusal!.detail}`;
        expect(prose).toMatch(/Lorca/);
        expect(prose.toLowerCase()).toMatch(/token|urbanismoenred/);
        expect(store.getSite()!.parcel.zoning.jurisdictionRef).toBe(LORCA_JURISDICTION_ID);
        expect(store.getSite()!.parcel.maxHeight).toBeNull();
    });
});
