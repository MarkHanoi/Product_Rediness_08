// §MURCIA-ENVELOPE — the L5 REACHABILITY test: does a real click on a Murcia parcel actually reach
// the Murcia code?
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS TEST EXISTS, AND WHY IT DRIVES THE REAL DISPATCHER
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The Murcia rule pack, bbox and zoning mapper shipped as ORPHANS: complete, unit-tested, and
// referenced by nothing outside their own files. Every one of their own tests passed, and not one
// line of Murcia code could be reached from the running app. A provider test cannot detect that —
// only exercising the DISPATCH can. So this suite calls the real `dispatchParcelBoundary` on a real
// `SiteModelStore` with a site located on the founder's Murcia parcel, and asserts on what lands in
// the C19 Parcel and in the cached envelope the renderers read.
//
// The only stubs are the two SAME-ORIGIN PROXIES the path fetches (`/api/catastro/parcel`,
// `/api/es/murcia-pgou`), replayed from the live responses recorded 2026-07-31. Nothing about the
// routing, the ordering, the disposition or the dispatch is mocked — if the `isInMurcia` branch is
// removed from `applyZoning`, or the registry entry is dropped, or the refusal stops being cited,
// these assertions fail.
//
// NOTE: imports the real `@pryzm/stores` + `@pryzm/site-parcel-data`, like
// `parcelBoundaryEnvelopeOrdering.test.ts`.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SiteModelStore, siteCreate } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { BuildableEnvelope } from '@pryzm/schemas';
import {
    dispatchParcelBoundary,
    getLastBuildableEnvelope,
} from '../src/ui/site/siteDispatch.js';

/** The founder's parcel — Catastro + Murcia GeoServer, both read live on 2026-07-31. */
const PARCEL = {
    refcat: '3481104XH6038S',
    lat: 38.0061,
    lon: -1.138028,
    address: 'PL U.A. 5ª DEL P.P. CR-5  P1 MURCIA (CHURRA) (MURCIA)',
    areaOfficialM2: 935,
} as const;

/** A small plot ring in scene metres — the shape a draw/select commits. */
const BOUNDARY = {
    polygon: [
        { x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 31 }, { x: 0, z: 31 },
    ],
    edgeClassifications: ['front', 'side', 'rear', 'side'] as const,
};

/** `Murcia:pgou_alineaciones` at the parcel — verbatim attributes. */
const CAL_FEATURE = {
    type: 'Feature',
    properties: {
        calificacion: 'RR',
        descripcion: 'Residencial, ordenación remitida al planeamiento anterior',
        uso_global: 'Residencial',
        sector: 'TA-379',
        url: 'RR.pdf',
        f_inicial: '2021-09-09Z',
        f_fin: '2999-12-30Z',
    },
};

/** `Murcia:pgou_sectores` at the parcel — verbatim attributes. */
const SECTOR_FEATURE = {
    type: 'Feature',
    properties: {
        sector: 'TA-379',
        clase_suelo: 'Urbanizable',
        categoria: 'Urbanizable Transitorio',
        uso_global: 'Residencial',
        pedania: 'EL PUNTAL',
        superficie: 383313,
        f_inicial: '2024-01-17Z',
        f_fin: '2999-12-30Z',
    },
};

interface RouteLog {
    readonly urls: string[];
}

/**
 * Stub the two same-origin proxies this path calls. Any OTHER URL rejects, which is deliberate:
 * a unit test may reach no network, and a path that quietly started calling something else should
 * surface here rather than hang.
 */
function stubProxies(log: RouteLog, murciaBody: unknown): typeof globalThis.fetch {
    return vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        log.urls.push(url);
        if (url.startsWith('/api/catastro/parcel')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    parcel: {
                        refcat: PARCEL.refcat,
                        address: PARCEL.address,
                        areaM2: PARCEL.areaOfficialM2,
                        areaOfficialM2: PARCEL.areaOfficialM2,
                        source: 'catastro',
                        ring: [
                            { lat: PARCEL.lat, lon: PARCEL.lon },
                            { lat: PARCEL.lat + 0.0002, lon: PARCEL.lon },
                            { lat: PARCEL.lat + 0.0002, lon: PARCEL.lon + 0.0003 },
                            { lat: PARCEL.lat, lon: PARCEL.lon + 0.0003 },
                        ],
                    },
                }),
            } as unknown as Response;
        }
        if (url.startsWith('/api/es/murcia-pgou')) {
            return { ok: true, status: 200, json: async () => murciaBody } as unknown as Response;
        }
        // Context-building prefetch etc. — best-effort callers that swallow this.
        throw new TypeError(`unstubbed URL in unit test: ${url}`);
    }) as unknown as typeof globalThis.fetch;
}

function ctxFor(store: SiteModelStore) {
    const emitted: string[] = [];
    const rt = {
        events: { emit: (t: string) => { emitted.push(t); } },
    } as unknown as PryzmRuntime;
    return { ctx: { rt, store, projectId: 'proj-murcia', toast: () => {} }, emitted };
}

/** Bounded poll — the zoning leg is a fire-and-forget async continuation. */
async function waitForEvent(emitted: readonly string[], type: string, timeoutMs = 4_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (emitted.includes(type)) return;
        await new Promise((r) => setTimeout(r, 5));
    }
}

async function dispatchMurcia(murciaBody: unknown): Promise<{
    store: SiteModelStore;
    envelope: BuildableEnvelope | null;
    urls: string[];
}> {
    const log: RouteLog = { urls: [] };
    globalThis.fetch = stubProxies(log, murciaBody);
    const store = new SiteModelStore();
    siteCreate(
        { projectId: 'proj-murcia', location: { latitude: PARCEL.lat, longitude: PARCEL.lon } },
        store,
    );
    const { ctx, emitted } = ctxFor(store);
    expect(dispatchParcelBoundary(ctx, { ...BOUNDARY, edgeClassifications: [...BOUNDARY.edgeClassifications] })).toBe(true);
    await waitForEvent(emitted, 'site.zoning-updated');
    return { store, envelope: getLastBuildableEnvelope(), urls: log.urls };
}

describe('§MURCIA-ENVELOPE — a click on the founder\'s Murcia parcel reaches the Murcia code', () => {
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('ROUTES to the Murcia municipal service — the link that was missing', async () => {
        const { urls } = await dispatchMurcia({
            calificaciones: [CAL_FEATURE],
            sectores: [SECTOR_FEATURE],
        });
        // ⚠ THE REACHABILITY ASSERTION. Before this wiring no Murcia code ran on any click: the
        // parcel resolved (Catastro is national) and the zoning fell through to the estimated
        // default. If the `isInMurcia` branch is removed from `applyZoning`, this fails.
        const murciaCall = urls.find((u) => u.startsWith('/api/es/murcia-pgou'));
        expect(murciaCall).toBeDefined();
        // §L-521 — the query point is the PARCEL'S AREA CENTROID, not the site anchor, so assert
        // proximity rather than a literal: it must land on the founder's parcel (within ~50 m).
        const q = new URLSearchParams(murciaCall!.split('?')[1]!);
        expect(Math.abs(Number(q.get('lat')) - PARCEL.lat)).toBeLessThan(5e-4);
        expect(Math.abs(Number(q.get('lon')) - PARCEL.lon)).toBeLessThan(5e-4);
        // …and it reads the parcel identity from the national Catastro path in the same pass.
        expect(urls.some((u) => u.startsWith('/api/catastro/parcel'))).toBe(true);
    });

    it('dispatches the LEGALLY GROUNDED derived-plan refusal onto the C19 Parcel', async () => {
        const { store, envelope } = await dispatchMurcia({
            calificaciones: [CAL_FEATURE],
            sectores: [SECTOR_FEATURE],
        });

        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('none');
        expect(envelope!.zoneCode).toBe('RR');
        expect(envelope!.refusal).toBeTruthy();
        // The ordinance ANSWERED, and its answer was "that other document" (PGOU Art. 6.6.2).
        expect(envelope!.refusal!.code).toBe('derived-plan');
        expect(envelope!.refusal!.legallyGrounded).toBe(true);
        expect(envelope!.refusal!.ordinanceRef).toContain('6.6.2');
        expect(envelope!.refusal!.detail).toContain('expediente 379');
        // The instrument named by the CADASTRAL ADDRESS, folded in from the Catastro leg.
        expect(envelope!.refusal!.detail).toContain('Plan Parcial CR-5');
        // The card opens with the user's own land, then the municipality's own words.
        const facts = envelope!.refusal!.knownFacts.join(' | ');
        expect(facts).toContain(PARCEL.refcat);
        expect(facts).toContain('TA-379');
        expect(facts).toContain('Urbanizable Transitorio');
        expect(facts).toContain('EL PUNTAL');

        // …and what reaches the persisted parcel: the zone + jurisdiction, and NO number.
        const site = store.getSite()!;
        expect(site.parcel.zoning.category).toBe('RR');
        expect(site.parcel.zoning.jurisdictionRef).toBe('murcia-pgou');
        expect(site.parcel.maxHeight).toBeNull();
        expect(site.parcel.maxFAR).toBeNull();
        expect(site.parcel.buildableRing).toBeNull();
    });

    it('NEVER draws an extrudable volume — no massing can be built from this answer', async () => {
        const { envelope } = await dispatchMurcia({
            calificaciones: [CAL_FEATURE],
            sectores: [SECTOR_FEATURE],
        });
        expect(envelope!.insetPolygon).toEqual([]);
        expect(envelope!.insetAreaM2).toBe(0);
        expect(envelope!.maxHeight_m).toBeNull();
        expect(envelope!.farLimitedHeight_m).toBeNull();
        expect(envelope!.maxFloors).toBeNull();
        expect(envelope!.maxCoverage).toBeNull();
        expect(envelope!.maxVolumeM3).toBeNull();
        expect(envelope!.tiers).toEqual([]);
        expect(envelope!.confidence).toBe('not-determined');
        // A competitor published ~262 m² of edificabilidad on this parcel as a "proxy PGOU".
        const prose = `${envelope!.refusal!.headline} ${envelope!.refusal!.detail}`;
        expect(prose).not.toMatch(/\b262\b/);
    });

    it('does NOT fall back to the estimated default when the municipal service is DOWN', async () => {
        // ⚠ The failure mode this guards: an estimated front/side/rear triple on a jurisdiction
        // whose ordinance publishes no such thing would be a fabrication wearing a badge.
        const { store, envelope } = await dispatchMurcia({ calificaciones: null, sectores: null });
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal).toBeTruthy();
        expect(envelope!.refusal!.code).toBe('no-rule-pack');
        expect(envelope!.refusal!.legallyGrounded).toBe(false);
        // FAILURE and ABSENCE stay different answers, on the card as well as in the code.
        expect(envelope!.refusal!.knownFacts.join(' ')).toContain('did not answer');
        expect(store.getSite()!.parcel.zoning.jurisdictionRef).toBe('murcia-pgou');
        expect(store.getSite()!.parcel.maxHeight).toBeNull();
    });

    it('still names the derived instrument when the municipal records are absent', async () => {
        const { envelope } = await dispatchMurcia({ calificaciones: [], sectores: [] });
        expect(envelope!.refusal!.code).toBe('no-rule-pack');
        // The cadastral address is a NATIONAL signal — it survives a municipal outage.
        expect(envelope!.refusal!.detail).toContain('Plan Parcial CR-5');
        expect(envelope!.refusal!.legallyGrounded).toBe(false);
    });
});
