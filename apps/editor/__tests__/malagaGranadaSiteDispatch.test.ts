// §RESEARCH-PENDING — the L5 REACHABILITY test for Málaga and Granada: does a real click on either
// city's land stop hitting the fabricated §L-663 estimated triple?
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS TEST EXISTS
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Before this session, neither city had an `isInX` branch anywhere in `applyZoning` — the forensic
// audits (`docs/.../29067-malaga/findings/`, `docs/.../18087-granada/findings/`) record "Dispatch
// status: Does not reach dispatch. Falls to applyEstimatedZoning — renders a fabricated generic
// estimate." for both. This suite proves the fix: a click on either city's land now reaches a
// cited "not yet researched" refusal instead. Mirrors `elSauzalSiteDispatch.test.ts`'s shape but
// simpler — neither city has a zone resolver, so there is nothing to stub.

import { describe, it, expect } from 'vitest';
import { SiteModelStore, siteCreate } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { BuildableEnvelope } from '@pryzm/schemas';
import {
    isInMalaga,
    MALAGA_BBOX,
    MALAGA_JURISDICTION_ID,
    isInGranada,
    GRANADA_BBOX,
    GRANADA_JURISDICTION_ID,
} from '@pryzm/site-parcel-data';
import {
    dispatchParcelBoundary,
    getLastBuildableEnvelope,
} from '../src/ui/site/siteDispatch.js';

/** A small plot ring in scene metres — the shape a draw/select commits. */
const BOUNDARY = {
    polygon: [
        { x: 0, z: 0 }, { x: 15, z: 0 }, { x: 15, z: 20 }, { x: 0, z: 20 },
    ],
    edgeClassifications: ['front', 'side', 'rear', 'side'] as const,
};

function ctxFor(store: SiteModelStore, projectId: string) {
    const emitted: string[] = [];
    const rt = {
        events: { emit: (t: string) => { emitted.push(t); } },
    } as unknown as PryzmRuntime;
    return { ctx: { rt, store, projectId, toast: () => {} }, emitted };
}

async function waitForEvent(emitted: readonly string[], type: string, timeoutMs = 4_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (emitted.includes(type)) return;
        await new Promise((r) => setTimeout(r, 5));
    }
}

async function dispatchAt(projectId: string, lat: number, lon: number): Promise<{
    store: SiteModelStore;
    envelope: BuildableEnvelope | null;
}> {
    const store = new SiteModelStore();
    siteCreate({ projectId, location: { latitude: lat, longitude: lon } }, store);
    const { ctx, emitted } = ctxFor(store, projectId);
    expect(
        dispatchParcelBoundary(ctx, {
            ...BOUNDARY,
            edgeClassifications: [...BOUNDARY.edgeClassifications],
        }),
    ).toBe(true);
    await waitForEvent(emitted, 'site.zoning-updated');
    return { store, envelope: getLastBuildableEnvelope() };
}

describe('§RESEARCH-PENDING — Málaga', () => {
    const CENTRE = {
        lat: (MALAGA_BBOX.minLat + MALAGA_BBOX.maxLat) / 2,
        lon: (MALAGA_BBOX.minLon + MALAGA_BBOX.maxLon) / 2,
    };

    it('the bbox centre really is inside the shipping Málaga extent (the routing premise)', () => {
        expect(isInMalaga(CENTRE.lat, CENTRE.lon)).toBe(true);
    });

    it('ROUTES to a cited refusal — NOT to the fabricated estimated triple', async () => {
        const { store, envelope } = await dispatchAt('proj-malaga', CENTRE.lat, CENTRE.lon);
        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal).toBeTruthy();
        expect(envelope!.refusal!.code).toBe('no-rule-pack');
        expect(envelope!.refusal!.legallyGrounded).toBe(false);
        expect(envelope!.maxHeight_m).toBeNull();
        expect(store.getSite()!.parcel.zoning.jurisdictionRef).toBe(MALAGA_JURISDICTION_ID);
        expect(store.getSite()!.parcel.maxHeight).toBeNull();
    });

    it('the refusal is HONEST about being unresearched, never implies a zone lookup happened', async () => {
        const { envelope } = await dispatchAt('proj-malaga-2', CENTRE.lat, CENTRE.lon);
        const prose = `${envelope!.refusal!.headline} ${envelope!.refusal!.detail}`.toLowerCase();
        expect(prose).toMatch(/málaga|malaga/);
        expect(prose).toMatch(/oracle|access|blocked|database/);
    });
});

describe('§RESEARCH-PENDING — Granada', () => {
    const CENTRE = {
        lat: (GRANADA_BBOX.minLat + GRANADA_BBOX.maxLat) / 2,
        lon: (GRANADA_BBOX.minLon + GRANADA_BBOX.maxLon) / 2,
    };

    it('the bbox centre really is inside the shipping Granada extent (the routing premise)', () => {
        expect(isInGranada(CENTRE.lat, CENTRE.lon)).toBe(true);
    });

    it('ROUTES to a cited refusal — NOT to the fabricated estimated triple', async () => {
        const { store, envelope } = await dispatchAt('proj-granada', CENTRE.lat, CENTRE.lon);
        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal).toBeTruthy();
        expect(envelope!.refusal!.code).toBe('no-rule-pack');
        expect(envelope!.refusal!.legallyGrounded).toBe(false);
        expect(envelope!.maxHeight_m).toBeNull();
        expect(store.getSite()!.parcel.zoning.jurisdictionRef).toBe(GRANADA_JURISDICTION_ID);
        expect(store.getSite()!.parcel.maxHeight).toBeNull();
    });

    it('the refusal is HONEST about being unresearched, never implies a zone lookup happened', async () => {
        const { envelope } = await dispatchAt('proj-granada-2', CENTRE.lat, CENTRE.lon);
        const prose = `${envelope!.refusal!.headline} ${envelope!.refusal!.detail}`.toLowerCase();
        expect(prose).toMatch(/granada/);
        expect(prose).toMatch(/not.*research|no planning source/);
    });
});
