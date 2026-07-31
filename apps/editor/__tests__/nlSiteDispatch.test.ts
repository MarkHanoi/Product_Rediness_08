// §NL-BESTEMMINGSPLAN — the L5 REACHABILITY test: does a real click on a Dutch parcel actually
// reach the bestemmingsplan code, and does the C19 Parcel receive the published bouwvlak + height?
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS TEST EXISTS
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// `nlBestemmingsplan.ts` + `resolveNlBestemmingsplan.ts` shipped with a thorough unit suite — the
// SVBP2012 typering classifier, the min-vs-max honesty gate, the GeoJSON ring reader — and none of
// it touched the DISPATCH. Every one of those tests passes whether or not a single line of NL code
// is reachable from a click. Only driving the real dispatcher can tell the difference, which is
// exactly why this file exists.
//
// So this suite calls the REAL `dispatchParcelBoundary` on a real `SiteModelStore` sited in
// Rotterdam-centrum — one of the three points the §NL-NATIONWIDE probe verified live on 2026-07-26
// (40 m maximum bouwhoogte, plan NL.IMRO.0599.BP1143LijnbkCools) — and asserts on what lands in the
// C19 Parcel and in the cached envelope. The ONLY stub is the same-origin `/api/nl/bestemmingsplan`
// proxy. **Remove the `isInNetherlands` branch from `applyZoning` and these fail**: the path then
// falls to the estimated default and the proxy is never called.
//
// Mirrors `murciaSiteDispatch.test.ts` (the canonical reachability template).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SiteModelStore, siteCreate } from '@pryzm/stores';
import { listJurisdictionCoverage } from '@pryzm/site-parcel-data';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { BuildableEnvelope } from '@pryzm/schemas';
import {
    dispatchParcelBoundary,
    getLastBuildableEnvelope,
} from '../src/ui/site/siteDispatch.js';

/** Rotterdam-centrum — a §NL-NATIONWIDE live-probe point (2026-07-26). */
const PARCEL = {
    lat: 51.918,
    lon: 4.479,
    planId: 'NL.IMRO.0599.BP1143LijnbkCools',
    planNaam: 'Lijnbaankwartier-Coolsingel',
    bouwhoogte_m: 40,
} as const;

/**
 * A ~16 × 20 m `bouwvlak` centred on the probe point, in the GeoJSON WGS84 `[lon, lat]` order the
 * PDOK WMS returns (closing vertex repeated, as the source publishes it). Deliberately SMALLER than
 * the parcel below, so a pass-through of the parcel ring could not masquerade as a clip.
 */
const BOUWVLAK_RING: number[][] = [
    [4.4788835, 51.9179102],
    [4.4791165, 51.9179102],
    [4.4791165, 51.9180898],
    [4.4788835, 51.9180898],
    [4.4788835, 51.9179102],
];

/** A larger zone (bestemmingsvlak) extent — the §NL-SPARSE-FALLBACK footprint. */
const ZONE_RING: number[][] = [
    [4.4787, 51.9178],
    [4.4793, 51.9178],
    [4.4793, 51.9182],
    [4.4787, 51.9182],
    [4.4787, 51.9178],
];

/** A plot ring in scene metres, centred on the site origin — the shape a draw/select commits. */
const BOUNDARY = {
    polygon: [
        { x: -20, z: -20 }, { x: 20, z: -20 }, { x: 20, z: 21 }, { x: -20, z: 21 },
    ],
    edgeClassifications: ['front', 'side', 'rear', 'side'] as const,
};

/** The consolidated `/api/nl/bestemmingsplan` body: plan + bouwvlak + maatvoering (the probe case). */
const BOUWVLAK_BODY = {
    plan: { id: PARCEL.planId, naam: PARCEL.planNaam },
    bestemmingsvlak: { naam: 'Gemengd - 1' },
    bouwvlak: { geometrie: { type: 'Polygon', coordinates: [BOUWVLAK_RING] } },
    maatvoeringen: [
        { naam: 'maximum bouwhoogte (m)', waarde: String(PARCEL.bouwhoogte_m) },
        { naam: 'maximum aantal bouwlagen', waarde: 13 },
    ],
};

/** The COMMON Dutch case: no bouwvlak, but a zone extent carrying a maatvoering. */
const SPARSE_BODY = {
    plan: { id: PARCEL.planId, naam: PARCEL.planNaam },
    bestemmingsvlak: {
        naam: 'Wonen',
        geometrie: { type: 'Polygon', coordinates: [ZONE_RING] },
    },
    bouwvlak: null,
    maatvoeringen: [{ naam: 'maximum bouwhoogte (m)', waarde: '24' }],
};

interface RouteLog {
    readonly urls: string[];
}

/**
 * Stub the same-origin proxies this path calls. `/api/nl/bestemmingsplan` replays the probe; the
 * best-effort context prefetch answers empty so it neither hangs nor pollutes the log.
 */
function stubProxies(log: RouteLog, nlBody: unknown, nlOk = true): typeof globalThis.fetch {
    return vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        log.urls.push(url);
        if (url.startsWith('/api/nl/bestemmingsplan')) {
            if (!nlOk) return { ok: false, status: 502, json: async () => ({}) } as unknown as Response;
            return { ok: true, status: 200, json: async () => nlBody } as unknown as Response;
        }
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
    return { ctx: { rt, store, projectId: 'proj-nl', toast: () => {} }, emitted };
}

/** Bounded poll — the zoning leg is a fire-and-forget async continuation (+ a bounded retry). */
async function waitForEvent(emitted: readonly string[], type: string, timeoutMs = 8_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (emitted.includes(type)) return;
        await new Promise((r) => setTimeout(r, 5));
    }
}

async function dispatchNl(nlBody: unknown, nlOk = true): Promise<{
    store: SiteModelStore;
    envelope: BuildableEnvelope | null;
    urls: string[];
}> {
    const log: RouteLog = { urls: [] };
    globalThis.fetch = stubProxies(log, nlBody, nlOk);
    const store = new SiteModelStore();
    siteCreate(
        { projectId: 'proj-nl', location: { latitude: PARCEL.lat, longitude: PARCEL.lon } },
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

describe('§NL-BESTEMMINGSPLAN — a click on a Dutch parcel reaches the bestemmingsplan code', () => {
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('ROUTES to the PDOK proxy at the PARCEL centroid — the reachability assertion', async () => {
        const { urls } = await dispatchNl(BOUWVLAK_BODY);
        // ⚠ THE REACHABILITY ASSERTION. Remove the `isInNetherlands` branch from `applyZoning` and
        // the parcel falls to the estimated default; this call never happens and this fails.
        const nlCall = urls.find((u) => u.startsWith('/api/nl/bestemmingsplan'));
        expect(nlCall).toBeDefined();
        // §L-521 — the query point is the PARCEL'S AREA CENTROID, not the site anchor.
        const q = new URLSearchParams(nlCall!.split('?')[1]!);
        expect(Math.abs(Number(q.get('lat')) - PARCEL.lat)).toBeLessThan(5e-4);
        expect(Math.abs(Number(q.get('lon')) - PARCEL.lon)).toBeLessThan(5e-4);
    });

    it('CLIPS the parcel to the published bouwvlak and applies the real maatvoering', async () => {
        const { envelope } = await dispatchNl(BOUWVLAK_BODY);
        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('ok');
        expect(envelope!.refusal).toBeNull();
        // The height is the plan's OWN "maximum bouwhoogte (m)" — a structured value with a stated
        // SVBP2012 unit, never derived and never defaulted.
        expect(envelope!.maxHeight_m).toBe(PARCEL.bouwhoogte_m);
        expect(envelope!.maxFloors).toBe(13);
        // ⚠ The footprint is the BOUWVLAK (≈ 320 m²), not the 40 × 41 m parcel (1 640 m²). A
        // pass-through of the parcel ring would land near 1 640 and fail here.
        expect(envelope!.insetAreaM2).toBeGreaterThan(200);
        expect(envelope!.insetAreaM2).toBeLessThan(500);
        expect(envelope!.insetPolygon.length).toBeGreaterThanOrEqual(3);
        // A precise published bouwvlak is not an upper bound — the §L-619 flag stays false.
        expect(envelope!.footprintIsUpperBound).toBe(false);
    });

    it('threads the published height onto the C19 Parcel via the command bus', async () => {
        const { store } = await dispatchNl(BOUWVLAK_BODY);
        const site = store.getSite()!;
        expect(site.parcel.maxHeight).toBe(PARCEL.bouwhoogte_m);
        expect(site.parcel.buildableRing).not.toBeNull();
    });

    it('§NL-SPARSE-FALLBACK — no bouwvlak ⇒ the ZONE extent, LABELLED an upper bound', async () => {
        // ⚠ The honesty property: the zone extent is real published data but a WEAKER claim than a
        // bouwvlak, so it must never ship at `structured` and must SAY it is an upper bound.
        const { envelope } = await dispatchNl(SPARSE_BODY);
        expect(envelope!.status).toBe('ok');
        expect(envelope!.maxHeight_m).toBe(24);
        expect(envelope!.confidence).toBe('estimated-ruleset');
        const caveats = envelope!.caveats.join(' | ');
        expect(caveats).toContain('bestemmingsvlak');
        expect(caveats).toMatch(/UPPER BOUND/i);
    });

    it('does NOT fall back to the estimated triple when PDOK is DOWN — and says it was a retry', async () => {
        // ⚠ The failure mode this guards: the bouwvlak is an explicit-area rule, so a front/side/rear
        // estimate would be the wrong SHAPE (C58 §2.2 / ADR-0270), not merely an imprecise number.
        const { store, envelope } = await dispatchNl(null, false);
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal).toBeTruthy();
        // STRUCTURAL-SEAM-4 — a still-failing TRANSIENT is the retry-honest refusal…
        expect(envelope!.refusal!.code).toBe('source-data-unavailable');
        expect(envelope!.refusal!.detail).toContain('temporary outage');
        expect(envelope!.maxHeight_m).toBeNull();
        expect(envelope!.insetPolygon).toEqual([]);
        expect(store.getSite()!.parcel.maxHeight).toBeNull();
    });

    it('ABSENCE is a DIFFERENT refusal from FAILURE — no plan here never offers a retry', async () => {
        // §CONTEXT-DATA-HONESTY (L-422/457/467/469): the source ANSWERED and there is nothing here.
        // That is durable, so it must not be quoted with the transient code the test above asserts.
        const { envelope } = await dispatchNl({
            plan: null,
            bestemmingsvlak: null,
            bouwvlak: null,
            maatvoeringen: [],
        });
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal!.code).toBe('no-plan-at-point');
        expect(envelope!.refusal!.detail).toContain('will not change');
        expect(envelope!.maxHeight_m).toBeNull();
    });

    it('S5 — the Netherlands is lit on the C60 coverage globe, with the dispatcher own predicate', () => {
        const nl = listJurisdictionCoverage().find((j) => j.jurisdictionId === 'nl-bestemmingsplan');
        expect(nl).toBeDefined();
        expect(nl!.countryCode).toBe('NL');
        // ⚠ The globe's `contains` IS the routing predicate (C60 §2), so it can never light land the
        // dispatcher would not route into. Rotterdam in; London out.
        expect(nl!.contains(PARCEL.lat, PARCEL.lon)).toBe(true);
        expect(nl!.contains(51.5, -0.12)).toBe(false);
        // ⚠⚠ KNOWN COARSENESS, ASSERTED SO IT CANNOT HIDE — REPORTED, NOT INTRODUCED HERE.
        // `NETHERLANDS_BBOX` (50.7–53.7 N, 3.3–7.3 E) is the NATIONAL box the dispatch already gates
        // on, and it overlaps northern Belgium and a strip of NW Germany. Registering the globe on a
        // TIGHTER box was rejected: the registry header forbids a coverage claim that is not the
        // dispatcher's own predicate, because the two would then drift invisibly — the exact failure
        // C60 §2 exists to prevent. So the globe states, truthfully, what the router does.
        // ⇒ A Brussels click routes to the NL path today and gets `nlNoPlanRefusal` — which cites a
        // Dutch instrument on Belgian land. It draws NO number (that is why this is a coarseness and
        // not a fabrication), but the citation is wrong-jurisdiction and should be narrowed by a
        // polygon gate or a BE peel-off, exactly as L'Hospitalet is peeled off before Barcelona.
        // If you tighten the box, DELETE this assertion — do not "fix" it by loosening the test.
        expect(nl!.contains(50.85, 4.35)).toBe(true); // Brussels — inside the coarse national box.
        // ⚠ `nl:bouwvlak` is a PRYZM-internal handle, not a Dutch legal zone code — publishing it on
        // the globe would present our own token as a legal category. The list is empty on purpose.
        expect(nl!.packZoneCodes).toEqual([]);
    });
});
