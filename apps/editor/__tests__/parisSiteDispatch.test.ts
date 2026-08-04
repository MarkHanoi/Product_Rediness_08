// §PARIS-PLU — the L5 REACHABILITY test: does a real click on a Paris parcel actually reach the
// Paris PLU bioclimatique code, and does the C19 Parcel receive the published ECM volume?
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS TEST EXISTS
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// `frParisPluBioclimatique.ts` + `resolveParisPluZone.ts` shipped with a full unit suite — the pack
// shape, the pure `parseParisPluResponse`, the ECM engine — and NONE of it exercised the DISPATCH.
// That is precisely the gap that let three packs in this package sit inert: every pure test passes
// while no line of the jurisdiction's code can be reached from a running click. A provider test
// cannot detect that; only driving the real dispatcher can.
//
// So this suite calls the REAL `dispatchParcelBoundary` on a real `SiteModelStore` sited on the
// live-probed Paris ECM parcel, and asserts on what lands in the C19 Parcel and in the cached
// envelope the renderers read. The ONLY stub is the same-origin `/api/paris/plu` proxy, replayed
// from the live probe recorded 2026-07-26. Nothing about the routing, the ordering, the projection
// or the dispatch is mocked — **remove the `isInParis` branch from `applyZoning` and these fail**,
// because the path then falls to the estimated default and never calls the proxy at all.
//
// Mirrors `murciaSiteDispatch.test.ts` (the canonical reachability template) and imports the real
// `@pryzm/stores` + `@pryzm/site-parcel-data`, like `parcelBoundaryEnvelopeOrdering.test.ts`.
//
// ⚠ UPDATED 2026-08-04 (§UNSIGNED-GATE-DEFAULTS-SHUT / L-449). `FR_PARIS_PLU_CERTIFIED` was `true`
// with NO recorded signature and was correctly SHUT on 2026-08-02 (`l449CertificationGates.ts`).
// Unlike NL, Paris resolves + computes BEFORE checking the gate (see `applyParisZoningThenFallback`
// step 3's own comment: "gate closed but the engine computed a volume → show the enriched
// zone+height refusal, never the structured volume"), so the proxy call and zone resolution below
// are UNCHANGED — only the two tests that asserted a DRAWN volume are updated to expect the
// enriched cited refusal instead.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SiteModelStore, siteCreate } from '@pryzm/stores';
import { listJurisdictionCoverage } from '@pryzm/site-parcel-data';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { BuildableEnvelope } from '@pryzm/schemas';
import {
    dispatchParcelBoundary,
    getLastBuildableEnvelope,
} from '../src/ui/site/siteDispatch.js';

/** The live-probed Paris ECM parcel (plub_ecm, 2026-07-26): cadastral 19-DL-0002, zone UG, 25 m. */
const PARCEL = {
    lat: 48.88277,
    lon: 2.39303,
    cadastral: '19-DL-0002',
    heightCeiling_m: 25,
    ecmAreaM2: 83.122,
} as const;

/**
 * The REAL published `plub_ecm` buildable-footprint ring at that point — WGS84 `[lon, lat]`, an
 * 83.12 m² polygon (`st_area_shape`). Verbatim from the live probe; NOT a synthesised shape, so the
 * projection this test exercises is the one production runs.
 */
const ECM_RING: number[][] = [
    [2.3931038094292516, 48.88276064338342],
    [2.393001862080542, 48.88271733661974],
    [2.392945092827867, 48.88277390868914],
    [2.3930191509844616, 48.88280803048602],
    [2.3930429653843492, 48.88281900338607],
    [2.3930497999222764, 48.88282215240052],
    [2.393065568606225, 48.882829417055696],
    [2.3930732840190987, 48.88282192071428],
    [2.3930879424678713, 48.88280767864911],
    [2.393104230241959, 48.88279216510006],
    [2.3931019714300135, 48.882791286699536],
    [2.3931227489565896, 48.88276868763264],
    [2.3931038094292516, 48.88276064338342],
];

/** A small plot ring in scene metres, centred on the site origin — the shape a draw/select commits. */
const BOUNDARY = {
    polygon: [
        { x: -14, z: -14 }, { x: 14, z: -14 }, { x: 14, z: 15 }, { x: -14, z: 15 },
    ],
    edgeClassifications: ['front', 'side', 'rear', 'side'] as const,
};

/** The `/api/paris/plu` body at the probe point — zone + hauteur + filet + the ECM footprint. */
const PLU_BODY = {
    zone: {
        libelle: 'UG',
        libelong: 'Zone urbaine générale',
        typezone: 'U',
        nomfic: '75056_reglement_20260616.pdf',
        idurba: '75056_PLU_20260616',
        datappro: null,
    },
    hauteur: { hauteur_m: PARCEL.heightCeiling_m },
    hmc: null,
    filet: { code: 'V', cour: 'C' },
    ecm: {
        ring: ECM_RING,
        areaM2: PARCEL.ecmAreaM2,
        emprisePct: null,
        graphicHeight: null,
        cadastral: PARCEL.cadastral,
    },
    eal: null,
};

interface RouteLog {
    readonly urls: string[];
}

/**
 * Stub the same-origin proxies this path calls. `/api/paris/plu` replays the live probe; the
 * best-effort context-tile prefetch (`applyZoning` warms it at the parcel centroid) answers empty so
 * it neither hangs nor pollutes the log's meaning.
 */
function stubProxies(log: RouteLog, pluBody: unknown, pluOk = true): typeof globalThis.fetch {
    return vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        log.urls.push(url);
        if (url.startsWith('/api/paris/plu')) {
            if (!pluOk) return { ok: false, status: 502, json: async () => ({}) } as unknown as Response;
            return { ok: true, status: 200, json: async () => pluBody } as unknown as Response;
        }
        // Context-building prefetch (best-effort; the caller swallows any outcome).
        return {
            ok: true,
            status: 200,
            json: async () => ({ elements: [] }),
            text: async () => '',
            arrayBuffer: async () => new ArrayBuffer(0),
        } as unknown as Response;
    }) as unknown as typeof globalThis.fetch;
}

function ctxFor(store: SiteModelStore) {
    const emitted: string[] = [];
    const rt = {
        events: { emit: (t: string) => { emitted.push(t); } },
    } as unknown as PryzmRuntime;
    return { ctx: { rt, store, projectId: 'proj-paris', toast: () => {} }, emitted };
}

/** Bounded poll — the zoning leg is a fire-and-forget async continuation. */
async function waitForEvent(emitted: readonly string[], type: string, timeoutMs = 4_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (emitted.includes(type)) return;
        await new Promise((r) => setTimeout(r, 5));
    }
}

async function dispatchParis(pluBody: unknown, pluOk = true): Promise<{
    store: SiteModelStore;
    envelope: BuildableEnvelope | null;
    urls: string[];
}> {
    const log: RouteLog = { urls: [] };
    globalThis.fetch = stubProxies(log, pluBody, pluOk);
    const store = new SiteModelStore();
    siteCreate(
        { projectId: 'proj-paris', location: { latitude: PARCEL.lat, longitude: PARCEL.lon } },
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

describe('§PARIS-PLU — a click on a Ville-de-Paris parcel reaches the Paris code', () => {
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('ROUTES to the Paris PLU proxy at the PARCEL centroid — the reachability assertion', async () => {
        const { urls } = await dispatchParis(PLU_BODY);
        // ⚠ THE REACHABILITY ASSERTION. If the `isInParis` branch is removed from `applyZoning`,
        // the parcel falls to the estimated default, this call never happens, and this fails.
        const pluCall = urls.find((u) => u.startsWith('/api/paris/plu'));
        expect(pluCall).toBeDefined();
        // §L-521 — the query point is the PARCEL'S AREA CENTROID, not the site anchor.
        const q = new URLSearchParams(pluCall!.split('?')[1]!);
        expect(Math.abs(Number(q.get('lat')) - PARCEL.lat)).toBeLessThan(5e-4);
        expect(Math.abs(Number(q.get('lon')) - PARCEL.lon)).toBeLessThan(5e-4);
    });

    it('§UNSIGNED-GATE-DEFAULTS-SHUT — computes the real ECM volume, then WITHHOLDS it (cited refusal)', async () => {
        // ⚠ Paris resolves + computes BEFORE gating (unlike NL), so the proxy IS called and the zone
        // IS identified — but `FR_PARIS_PLU_CERTIFIED` is false, so the computed volume must never
        // reach the render: the enriched zone+height refusal replaces it, never a fabrication and
        // never the structured `ok` this test asserted before the gate was correctly shut.
        const { envelope } = await dispatchParis(PLU_BODY);
        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('none');
        expect(envelope!.zoneCode).toBe('UG');
        expect(envelope!.refusal).toBeTruthy();
        expect(envelope!.maxHeight_m).toBeNull();
        expect(envelope!.insetPolygon).toEqual([]);
    });

    it('threads NO height onto the C19 Parcel while the gate is closed', async () => {
        const { store } = await dispatchParis(PLU_BODY);
        const site = store.getSite()!;
        expect(site.parcel.maxHeight).toBeNull();
        expect(site.parcel.buildableRing).toBeNull();
    });

    it('does NOT fall back to the estimated triple when the PLU proxy is DOWN', async () => {
        // ⚠ The failure mode this guards: UG is an explicit-area zone (the ordinance publishes the
        // footprint AS GEOMETRY), so a front/side/rear estimate would be the wrong SHAPE — a
        // category error no confidence chip corrects (C58 §2.2 / ADR-0270).
        const { store, envelope } = await dispatchParis(null, false);
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal).toBeTruthy();
        expect(envelope!.refusal!.ordinanceRef).toContain('PLU bioclimatique');
        expect(envelope!.maxHeight_m).toBeNull();
        expect(envelope!.insetPolygon).toEqual([]);
        expect(store.getSite()!.parcel.maxHeight).toBeNull();
    });

    it('REFUSES honestly when the source answers but publishes no ECM at the point', async () => {
        // FAILURE and ABSENCE stay different code paths; neither may become a number.
        const { envelope } = await dispatchParis({ ...PLU_BODY, ecm: null });
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal).toBeTruthy();
        expect(envelope!.insetPolygon).toEqual([]);
        expect(envelope!.maxHeight_m).toBeNull();
    });

    it('S5 — France is lit on the C60 coverage globe, with the dispatcher own predicate', () => {
        const fr = listJurisdictionCoverage().find((j) => j.jurisdictionId === 'fr-75056-paris');
        expect(fr).toBeDefined();
        expect(fr!.countryCode).toBe('FR');
        // ⚠ The globe's `contains` IS the routing predicate, so it cannot light land the dispatcher
        // would not route into (C60 §2). Paris in, Boulogne-Billancourt (its own PLU) out.
        expect(fr!.contains(PARCEL.lat, PARCEL.lon)).toBe(true);
        expect(fr!.contains(48.8, 2.13)).toBe(false);
        // No static zone-code pack table: the envelope is resolved live from published geometry.
        expect(fr!.packZoneCodes).toEqual([]);
    });
});
