// §CONTEXT-DERIVED-STUDY-ENVELOPE (§ENVAMS148) — the L5 REACHABILITY test for the context-derived
// study massing: does a genuinely-empty NL bestemmingsplan answer (the `no-plan-at-point` case
// `nlSiteDispatch.test.ts` already pins) actually reach `buildContextDerivedStudyEnvelope` with
// REAL neighbour data, and does the gate genuinely keep it OFF today?
//
// Mirrors `nlSiteDispatch.test.ts`'s own reachability template (a real `dispatchParcelBoundary` on
// a real `SiteModelStore`, only the same-origin proxies stubbed) — the same discipline that file's
// own header states: a pure-function unit suite proves nothing about whether the dispatcher ever
// calls the function (memory: [[committed-is-not-reachable]]).
//
// ⚠ `CONTEXT_DERIVED_STUDY_ENVELOPE_CERTIFIED` is SHUT by default (§UNSIGNED-GATE-DEFAULTS-SHUT) —
// the first test below pins that the shut gate is a TRUE no-op (the refusal card is byte-identical
// to `nlSiteDispatch.test.ts`'s own no-plan case, and nothing is ever recorded). The second test
// flips the gate via `vi.mock`'s `importOriginal` (the `CORDOBA_RASTER_CLASSIFIED_ZONES_VERIFIED`
// precedent in `cordobaRasterClassifiedVerifiedSiteDispatch.test.ts`) to prove the OPEN path is
// real, not merely unit-tested in isolation.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@pryzm/site-parcel-data', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@pryzm/site-parcel-data')>();
    return { ...actual, CONTEXT_DERIVED_STUDY_ENVELOPE_CERTIFIED: true };
});

import { SiteModelStore, siteCreate } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    dispatchParcelBoundary,
    getLastBuildableEnvelope,
} from '../src/ui/site/siteDispatch.js';
import { getContextDerivedStudyEnvelope } from '../src/ui/site/contextDerivedStudyEnvelopeState.js';

/** A distinct NL point (Groningen-centrum, the third §NL-NATIONWIDE live-probe point) — kept
 *  apart from `nlSiteDispatch.test.ts`'s Rotterdam point so the two files' module-level
 *  `contextBuildings.ts` bbox caches can never collide even if a future test run shares a worker. */
const PARCEL = { lat: 53.2194, lon: 6.5665 } as const;

const BOUNDARY = {
    polygon: [
        { x: -10, z: -10 }, { x: 10, z: -10 }, { x: 10, z: 10 }, { x: -10, z: 10 },
    ],
    edgeClassifications: ['front', 'side', 'rear', 'side'] as const,
};

/** A genuinely-empty bestemmingsplan answer — the exact `no-plan-at-point` shape
 *  `nlSiteDispatch.test.ts` pins (source answered, no plan/bouwvlak/zone here). */
const EMPTY_NL_BODY = { plan: null, bestemmingsvlak: null, bouwvlak: null, maatvoeringen: [] };

/** Four REAL (OSM-tagged) neighbouring building heights + one with NEITHER height nor levels (the
 *  fabricated-placeholder `assumed` case) — all within a few metres of `PARCEL`, i.e. well inside
 *  the 50 m study radius. Overpass `out geom` shape: `{type:'way', id, tags, geometry:[{lat,lon}]}`. */
function overpassElement(id: number, lat: number, lon: number, tags: Record<string, string>) {
    const d = 0.00003; // ~3 m square footprint.
    return {
        type: 'way' as const,
        id,
        tags,
        geometry: [
            { lat: lat - d, lon: lon - d },
            { lat: lat + d, lon: lon - d },
            { lat: lat + d, lon: lon + d },
            { lat: lat - d, lon: lon + d },
            { lat: lat - d, lon: lon - d },
        ],
    };
}

const NEIGHBOUR_ELEMENTS = [
    overpassElement(1, PARCEL.lat + 0.0001, PARCEL.lon + 0.0001, { building: 'yes', height: '12' }),
    overpassElement(2, PARCEL.lat + 0.0001, PARCEL.lon - 0.0001, { building: 'yes', height: '14' }),
    overpassElement(3, PARCEL.lat - 0.0001, PARCEL.lon + 0.0001, { building: 'yes', height: '16' }),
    overpassElement(4, PARCEL.lat - 0.0001, PARCEL.lon - 0.0001, { building: 'yes', height: '18' }),
    // No height / levels tag at all — resolves to the FABRICATED 9 m `assumed` default, and MUST be
    // excluded from the study's sample (the honesty property this whole feature exists to keep).
    overpassElement(5, PARCEL.lat + 0.0002, PARCEL.lon, { building: 'yes' }),
];

interface RouteLog { readonly urls: string[] }

function stubProxies(log: RouteLog, nlBody: unknown, overpassElements: unknown[]): typeof globalThis.fetch {
    return vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        log.urls.push(url);
        if (url.startsWith('/api/nl/bestemmingsplan')) {
            return { ok: true, status: 200, json: async () => nlBody } as unknown as Response;
        }
        if (url.startsWith('/api/overpass')) {
            return { ok: true, status: 200, json: async () => ({ elements: overpassElements }) } as unknown as Response;
        }
        return {
            ok: true, status: 200,
            json: async () => ({ elements: [] }),
            text: async () => '', arrayBuffer: async () => new ArrayBuffer(0),
        } as unknown as Response;
    }) as unknown as typeof globalThis.fetch;
}

function ctxFor(store: SiteModelStore) {
    const emitted: string[] = [];
    const rt = { events: { emit: (t: string) => { emitted.push(t); } } } as unknown as PryzmRuntime;
    return { ctx: { rt, store, projectId: 'proj-nl-study', toast: () => {} }, emitted };
}

async function waitForEvent(emitted: readonly string[], type: string, timeoutMs = 8_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (emitted.includes(type)) return;
        await new Promise((r) => setTimeout(r, 5));
    }
}

/** A short bounded wait for the BEST-EFFORT study attach, which runs after the refusal dispatch
 *  and has its own network leg (`fetchContextBuildingsNearAndFar`) with no completion event of its
 *  own to await — polls the session-only state instead. */
async function waitForStudyState(siteId: string, timeoutMs = 4_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (getContextDerivedStudyEnvelope(siteId) !== null) return;
        await new Promise((r) => setTimeout(r, 5));
    }
}

describe('§CONTEXT-DERIVED-STUDY-ENVELOPE — reachability from a real dispatch', () => {
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('the gate is mocked OPEN, and an NL no-plan refusal is still byte-honest — the study rides ALONGSIDE it, never inside it', async () => {
        const log: RouteLog = { urls: [] };
        globalThis.fetch = stubProxies(log, EMPTY_NL_BODY, NEIGHBOUR_ELEMENTS);
        const store = new SiteModelStore();
        siteCreate(
            { projectId: 'proj-nl-study', location: { latitude: PARCEL.lat, longitude: PARCEL.lon } },
            store,
        );
        const { ctx, emitted } = ctxFor(store);
        expect(
            dispatchParcelBoundary(ctx, { ...BOUNDARY, edgeClassifications: [...BOUNDARY.edgeClassifications] }),
        ).toBe(true);
        await waitForEvent(emitted, 'site.zoning-updated');

        // The refusal itself is COMPLETELY UNCHANGED by the gate — this is the same `no-plan-at-point`
        // card `nlSiteDispatch.test.ts` pins, never promoted to `ok`, never carrying a study-derived
        // number in any of its own fields.
        const envelope = getLastBuildableEnvelope();
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal!.code).toBe('no-plan-at-point');
        expect(envelope!.maxHeight_m).toBeNull();
        expect(envelope!.insetPolygon).toEqual([]);

        const site = store.getSite()!;
        await waitForStudyState(site.id);
        const study = getContextDerivedStudyEnvelope(site.id);
        expect(study).not.toBeNull();
        expect(study!.ok).toBe(true);
        if (!study!.ok) return;
        // Median of the four REAL heights (12, 14, 16, 18) is 15 — the fabricated-default fifth
        // neighbour (id 5, no height/levels tag) must be EXCLUDED, not folded in as a 0 or a 9 m.
        expect(study!.study.maxHeight_m).toBe(15);
        expect(study!.study.heightBasis.sampledCount).toBe(4);
        expect(study!.study.heightBasis.excludedAssumedCount).toBe(1);
        expect(study!.study.status).toBe('context-derived-study');
        expect(study!.study.disclaimer.toUpperCase()).toContain('INDICATIVE');
        // The footprint defaults to the parcel ring itself (setback_m 0) — a 20 x 20 m square.
        expect(study!.study.setback_m).toBe(0);
        expect(study!.study.footprintAreaM2).toBeCloseTo(400, 3);
    });
});
