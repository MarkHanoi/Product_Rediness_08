// §EL-SAUZAL-ENVELOPE — the L5 REACHABILITY + HONESTY-GATE test: what does a real click on a real
// El Sauzal parcel actually put on screen today?
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS TEST EXISTS
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// `ES_EL_SAUZAL_PACK` (17 `RE-ViUf-N` Ciudad Jardín zones) and `resolveElSauzalZone` (an offline
// ZUSO shapefile point-in-polygon resolver) were built and REGISTERED in `registry.ts`'s coverage
// globe, but `esElSauzal.ts`'s own header records that `siteDispatch.ts` was DELIBERATELY left
// unwired — no `isInElSauzal` branch existed in `applyZoning`, so a real click on El Sauzal land
// fell through to the generic §L-663 chokepoint, which suppresses the estimated triple but never
// resolves a ZUSO zone or names it. `applyElSauzalZoningThenFallback` closes that gap. Mirrors
// `teldeSiteDispatch.test.ts` (the canonical offline-Canarias template): the real
// `dispatchParcelBoundary`, a real `SiteModelStore`, a site on real El Sauzal land — but UNLIKE
// Telde, nothing is stubbed at all, because `resolveElSauzalZone` reads a committed offline extract
// synchronously, never a network proxy.

import { describe, it, expect } from 'vitest';
import { SiteModelStore, siteCreate } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { BuildableEnvelope } from '@pryzm/schemas';
import {
    EL_SAUZAL_ENVELOPE_VERIFIED,
    EL_SAUZAL_BBOX,
    EL_SAUZAL_ZONE_CODES,
    EL_SAUZAL_JURISDICTION_ID,
    isInElSauzal,
    registeredPackZoneCodes,
} from '@pryzm/site-parcel-data';
import {
    dispatchParcelBoundary,
    getLastBuildableEnvelope,
} from '../src/ui/site/siteDispatch.js';

/**
 * A REAL point verified (in `resolveElSauzalZone.test.ts`, cross-checked in Python) to fall inside
 * the committed `ZUSO.shp` extract's `RE-ViUf-1` ring — not a synthesised coordinate.
 */
const PARCEL = {
    lat: 28.479513090001998,
    lon: -16.439655457879716,
} as const;

/** A small plot ring in scene metres — the shape a draw/select commits. */
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
    return { ctx: { rt, store, projectId: 'proj-el-sauzal', toast: () => {} }, emitted };
}

/** Bounded poll — the zoning leg is a fire-and-forget async continuation. */
async function waitForEvent(emitted: readonly string[], type: string, timeoutMs = 4_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (emitted.includes(type)) return;
        await new Promise((r) => setTimeout(r, 5));
    }
}

async function dispatchElSauzal(lat: number, lon: number): Promise<{
    store: SiteModelStore;
    envelope: BuildableEnvelope | null;
}> {
    const store = new SiteModelStore();
    siteCreate({ projectId: 'proj-el-sauzal', location: { latitude: lat, longitude: lon } }, store);
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

describe('§EL-SAUZAL-ENVELOPE — a click on an El Sauzal parcel reaches the El Sauzal code', () => {
    it('the fixture point really is inside the shipping El Sauzal bbox extent (the routing premise)', () => {
        expect(isInElSauzal(PARCEL.lat, PARCEL.lon)).toBe(true);
        expect(PARCEL.lat).toBeGreaterThanOrEqual(EL_SAUZAL_BBOX.minLat);
        expect(PARCEL.lat).toBeLessThanOrEqual(EL_SAUZAL_BBOX.maxLat);
        expect(PARCEL.lon).toBeGreaterThanOrEqual(EL_SAUZAL_BBOX.minLon);
        expect(PARCEL.lon).toBeLessThanOrEqual(EL_SAUZAL_BBOX.maxLon);
    });

    it('ROUTES to the El Sauzal branch — NOT to the estimated front/side/rear default', async () => {
        // ⚠ THE REACHABILITY ASSERTION. If the `isInElSauzal` branch is removed from `applyZoning`,
        // this Canarian plot falls through to `applyEstimatedZoning`, which produces a REAL
        // envelope with setbacks and a height — `status: 'ok'`, no refusal.
        const { store, envelope } = await dispatchElSauzal(PARCEL.lat, PARCEL.lon);
        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal).toBeTruthy();
        expect(store.getSite()!.parcel.zoning.jurisdictionRef).toBe('el-sauzal-zuso-shapefile');
    });

    it('the gate is shut and `packsByZone` stays EMPTY (the Zaragoza pattern, not Telde\'s)', () => {
        // ⚠ ⛔ THIS PINS THE GATE, NOT A FIXED PACK STATE. `EL_SAUZAL_ENVELOPE_VERIFIED` is `false`
        // in this repository (L-449, `esElSauzal.ts`) — a founder act, never a model flip.
        // `registry.ts`'s own comment on the El Sauzal block is explicit: "GATED, NOT POPULATED —
        // mirrors ZARAGOZA_ENVELOPE_VERIFIED's pattern exactly", unlike Telde whose `packsByZone`
        // is populated unconditionally. `EL_SAUZAL_ZONE_CODES` (the 17 codes `esElSauzal.ts`
        // transcribes) still has its full length; the REGISTRY exposes none of them while shut.
        expect(EL_SAUZAL_ENVELOPE_VERIFIED).toBe(false);
        expect(EL_SAUZAL_ZONE_CODES).toHaveLength(17);
        expect(registeredPackZoneCodes(EL_SAUZAL_JURISDICTION_ID)).toEqual([]);
    });

    it('a PACKED zone (RE-ViUf-1) resolves but dispatches a cited no-signed-rule refusal naming it, never a number', async () => {
        const { envelope } = await dispatchElSauzal(PARCEL.lat, PARCEL.lon);
        const r = envelope!.refusal!;
        // ⚠ `legallyGrounded: false` and it must stay false — Título X Cap.3 DOES set generic
        // Ciudad Jardín parameters. What is missing is a signed transcription + the fichero anexo,
        // not the law.
        expect(r.legallyGrounded).toBe(false);
        expect(r.headline).toMatch(/RE-ViUf-1/);
        const prose = `${r.headline} ${r.detail}`.toLowerCase();
        expect(prose).toMatch(/sauzal|canarias|ciudad jardín|ciudad jardin/);
        expect(envelope!.status).toBe('none');
    });

    it('an UNRESOLVED point (outside any ZUSO polygon) still dispatches a cited refusal, never falls through to the estimate', async () => {
        // A point safely inside `EL_SAUZAL_BBOX` but outside every real `ZUSO.shp` ring (open sea /
        // unmapped land within the loose municipal-term box).
        const { envelope } = await dispatchElSauzal(28.55, -16.35);
        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal).toBeTruthy();
    });

    it('NEVER draws an extrudable volume — no massing can be built from this answer', async () => {
        const { envelope } = await dispatchElSauzal(PARCEL.lat, PARCEL.lon);
        expect(envelope!.insetPolygon).toEqual([]);
        expect(envelope!.insetAreaM2).toBe(0);
        expect(envelope!.maxHeight_m).toBeNull();
        expect(envelope!.maxFloors).toBeNull();
        expect(envelope!.maxCoverage).toBeNull();
        expect(envelope!.maxVolumeM3).toBeNull();
    });

    it('writes NO number onto the persisted C19 Parcel either', async () => {
        const { store } = await dispatchElSauzal(PARCEL.lat, PARCEL.lon);
        const site = store.getSite()!;
        expect(site.parcel.maxHeight).toBeNull();
        expect(site.parcel.maxFAR).toBeNull();
        expect(site.parcel.buildableRing).toBeNull();
    });
});
