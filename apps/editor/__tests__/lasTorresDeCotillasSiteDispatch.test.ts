// §LAS-TORRES-DE-COTILLAS-ENVELOPE — the L5 REACHABILITY test: what does a real click on a real
// Las Torres de Cotillas parcel actually put on screen today?
//
// Las Torres de Cotillas (INE 30038) has NO rulepack and NO working zone-identity resolver: a
// real parcel-level zoning digitization exists (VisualUrb), but it is a commercial third-party
// SaaS returning HTTP 401 without a paid licence, and the one municipal PDF carrying the UE/UZE
// setback figures returned corrupted/binary to automated extraction (see
// `esLasTorresDeCotillas.ts`). So this path is a pure, synchronous cited refusal — never the
// fabricated estimated triple (§L-663).

import { describe, it, expect } from 'vitest';
import { SiteModelStore, siteCreate } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { BuildableEnvelope } from '@pryzm/schemas';
import {
    isInLasTorresDeCotillas,
    LAS_TORRES_DE_COTILLAS_BBOX,
    LAS_TORRES_DE_COTILLAS_JURISDICTION_ID,
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
    return { ctx: { rt, store, projectId: 'proj-las-torres-de-cotillas', toast: () => {} }, emitted };
}

async function waitForEvent(emitted: readonly string[], type: string, timeoutMs = 4_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (emitted.includes(type)) return;
        await new Promise((r) => setTimeout(r, 5));
    }
}

/**
 * A point well inside `LAS_TORRES_DE_COTILLAS_BBOX`, clear of `MOLINA_DE_SEGURA_BBOX` and
 * `ALCANTARILLA_BBOX` so this test isolates ONE branch of the hand-ordered `if` chain regardless
 * of the honest registry-level ties `jurisdictionSpecificity.test.ts` documents for this cluster.
 */
const LAS_TORRES_POINT = { lat: 37.995, lon: -1.3 } as const;

async function dispatchLasTorres(): Promise<{ store: SiteModelStore; envelope: BuildableEnvelope | null }> {
    const store = new SiteModelStore();
    siteCreate(
        {
            projectId: 'proj-las-torres-de-cotillas',
            location: { latitude: LAS_TORRES_POINT.lat, longitude: LAS_TORRES_POINT.lon },
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

describe('§LAS-TORRES-DE-COTILLAS-ENVELOPE — a click on a Las Torres de Cotillas parcel reaches the Las Torres de Cotillas code', () => {
    it('the fixture point really is inside the shipping Las Torres de Cotillas bbox extent (the routing premise)', () => {
        expect(isInLasTorresDeCotillas(LAS_TORRES_POINT.lat, LAS_TORRES_POINT.lon)).toBe(true);
        expect(LAS_TORRES_POINT.lat).toBeGreaterThanOrEqual(LAS_TORRES_DE_COTILLAS_BBOX.minLat);
        expect(LAS_TORRES_POINT.lat).toBeLessThanOrEqual(LAS_TORRES_DE_COTILLAS_BBOX.maxLat);
        expect(LAS_TORRES_POINT.lon).toBeGreaterThanOrEqual(LAS_TORRES_DE_COTILLAS_BBOX.minLon);
        expect(LAS_TORRES_POINT.lon).toBeLessThanOrEqual(LAS_TORRES_DE_COTILLAS_BBOX.maxLon);
    });

    it('a Las Torres de Cotillas parcel dispatches a cited "digitized but commercially gated" refusal — never a fabricated envelope', async () => {
        const { store, envelope } = await dispatchLasTorres();
        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal).toBeTruthy();
        expect(envelope!.refusal!.code).toBe('no-rule-pack');
        expect(envelope!.refusal!.legallyGrounded).toBe(false);
        expect(envelope!.maxHeight_m).toBeNull();
        const prose = `${envelope!.refusal!.headline} ${envelope!.refusal!.detail}`;
        expect(prose).toMatch(/Las Torres de Cotillas/);
        expect(prose.toLowerCase()).toMatch(/visualurb|401/);
        expect(store.getSite()!.parcel.zoning.jurisdictionRef).toBe(LAS_TORRES_DE_COTILLAS_JURISDICTION_ID);
        expect(store.getSite()!.parcel.maxHeight).toBeNull();
    });
});
