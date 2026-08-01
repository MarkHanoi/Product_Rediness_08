// §COR-ENVELOPE — the L5 REACHABILITY + HONESTY-GATE test: what does a real click on a real Córdoba
// parcel actually put on screen today?
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS TEST EXISTS
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// `ES_CORDOBA_PGOU2001_PACK` is REGISTERED in `rulepacks/registry.ts` with a non-empty `packsByZone`
// (13 packed subzones). Every value in it was MACHINE-EXTRACTED (OCR) from scanned ordinance PDFs
// and is `pipeline-extracted-unverified`; `sources/VERIFICATION.md` carries NO signature. A
// registered pack and an unsigned source are a dangerous pair — the question "is Córdoba publishing
// uncertified OCR numbers right now?" cannot be answered by reading either file, only by DRIVING
// THE DISPATCH. That is what this suite does, and the answer it pins is: **no number, a cited
// refusal, every time.**
//
// It is the direct analogue of `murciaSiteDispatch.test.ts` and it is deliberately structured the
// same way: the real `dispatchParcelBoundary`, a real `SiteModelStore`, a site on real Córdoba land,
// and the ONLY stub is the same-origin `/api/catastro/parcel` proxy. Nothing about the routing, the
// ordering, the gate or the dispatch is mocked — remove the `isInCordoba` branch from `applyZoning`
// and the first test fails, because a Córdoba plot would then fall through to the ESTIMATED
// front/side/rear default, which is precisely the fabrication the gate exists to prevent.
//
// ⚠ THE COORDINATE AND THE REFCAT ARE USED INDEPENDENTLY, ON PURPOSE. The `refcat` is the
// VERIFIED-LIVE one recorded in `findings/CORDOBA-DATA-RECON-SPIKE.md` §4 step 2 (a COACo
// `vcatastro_urbanismo` key-join, ordenanza "Colonia Tradicional Popular", distrito Sur). The
// lat/lon is a Sur-district point inside the shipping `CORDOBA_BBOX` pilot extent. No assertion
// pairs them — claiming this coordinate IS that parcel's centroid would be an unverified statement
// about real cadastral land (§CONTEXT-DATA-HONESTY), and nothing here needs it to be true.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SiteModelStore, siteCreate } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { BuildableEnvelope } from '@pryzm/schemas';
import {
    CORDOBA_ENVELOPE_VERIFIED,
    isInCordoba,
    CORDOBA_BBOX,
    registeredPackZoneCodes,
    CORDOBA_JURISDICTION_ID,
} from '@pryzm/site-parcel-data';
import {
    dispatchParcelBoundary,
    getLastBuildableEnvelope,
} from '../src/ui/site/siteDispatch.js';

/**
 * A Córdoba plot in the COACo Sur + Noroeste PGOU-2001 pilot. See the header on why the refcat and
 * the coordinate are not asserted to describe the same parcel.
 */
const PARCEL = {
    /** VERIFIED-LIVE 2026-07-23 — `CORDOBA-DATA-RECON-SPIKE.md` §4 step 2. */
    refcat: '3834946UG4933S',
    /** Distrito Sur, inside `CORDOBA_BBOX` (asserted below, never assumed). */
    lat: 37.87,
    lon: -4.779,
    areaOfficialM2: 165,
} as const;

/** A small plot ring in scene metres — the shape a draw/select commits. */
const BOUNDARY = {
    polygon: [
        { x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 14 }, { x: 0, z: 14 },
    ],
    edgeClassifications: ['front', 'side', 'rear', 'side'] as const,
};

interface RouteLog {
    readonly urls: string[];
}

/**
 * Stub the one same-origin proxy this path calls. Any OTHER URL rejects, which is deliberate: a
 * unit test may reach no network, and if the Córdoba path ever started calling a COACo endpoint
 * (WIRING-TODO 5, which lands WITH the sign-off) it must surface here rather than hang.
 */
function stubProxies(log: RouteLog): typeof globalThis.fetch {
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
                        address: 'CORDOBA (CORDOBA)',
                        areaM2: PARCEL.areaOfficialM2,
                        areaOfficialM2: PARCEL.areaOfficialM2,
                        source: 'catastro',
                        ring: [
                            { lat: PARCEL.lat, lon: PARCEL.lon },
                            { lat: PARCEL.lat + 0.0001, lon: PARCEL.lon },
                            { lat: PARCEL.lat + 0.0001, lon: PARCEL.lon + 0.00013 },
                            { lat: PARCEL.lat, lon: PARCEL.lon + 0.00013 },
                        ],
                    },
                }),
            } as unknown as Response;
        }
        throw new TypeError(`unstubbed URL in unit test: ${url}`);
    }) as unknown as typeof globalThis.fetch;
}

function ctxFor(store: SiteModelStore) {
    const emitted: string[] = [];
    const rt = {
        events: { emit: (t: string) => { emitted.push(t); } },
    } as unknown as PryzmRuntime;
    return { ctx: { rt, store, projectId: 'proj-cordoba', toast: () => {} }, emitted };
}

/** Bounded poll — the zoning leg is a fire-and-forget async continuation. */
async function waitForEvent(emitted: readonly string[], type: string, timeoutMs = 4_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (emitted.includes(type)) return;
        await new Promise((r) => setTimeout(r, 5));
    }
}

async function dispatchCordoba(): Promise<{
    store: SiteModelStore;
    envelope: BuildableEnvelope | null;
    urls: string[];
}> {
    const log: RouteLog = { urls: [] };
    globalThis.fetch = stubProxies(log);
    const store = new SiteModelStore();
    siteCreate(
        { projectId: 'proj-cordoba', location: { latitude: PARCEL.lat, longitude: PARCEL.lon } },
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

describe('§COR-ENVELOPE — a click on a Córdoba pilot parcel reaches the Córdoba code', () => {
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('the fixture point really is inside the shipping pilot extent (the routing premise)', () => {
        expect(isInCordoba(PARCEL.lat, PARCEL.lon)).toBe(true);
        expect(PARCEL.lat).toBeGreaterThanOrEqual(CORDOBA_BBOX.minLat);
        expect(PARCEL.lat).toBeLessThanOrEqual(CORDOBA_BBOX.maxLat);
        expect(PARCEL.lon).toBeGreaterThanOrEqual(CORDOBA_BBOX.minLon);
        expect(PARCEL.lon).toBeLessThanOrEqual(CORDOBA_BBOX.maxLon);
    });

    it('ROUTES to the Córdoba branch — NOT to the estimated front/side/rear default', async () => {
        // ⚠ THE REACHABILITY ASSERTION. If the `isInCordoba` branch is removed from `applyZoning`,
        // this Spanish plot falls through to `applyEstimatedZoning`, which produces a REAL
        // envelope with setbacks and a height — `status: 'ok'`, no refusal. Both assertions below
        // then fail. The jurisdiction ref is the second half of the same proof: `coaco-pgou` is
        // written by no other branch.
        const { store, envelope, urls } = await dispatchCordoba();
        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal).toBeTruthy();
        expect(store.getSite()!.parcel.zoning.jurisdictionRef).toBe('coaco-pgou');
        // ⚠ AND THE CÓRDOBA LEG MAKES NO NETWORK CALL AT ALL — not even the national Catastro read
        // that Murcia's leg performs. That is the current, honest state: the COACo subzone resolver
        // is WIRING-TODO 5 and lands WITH the sign-off, so a Córdoba parcel binds no subzone and the
        // refusal names the PILOT, never a PAS/OA/UAD/CTP/MC code it could not have resolved. The
        // cost is that the Córdoba card carries no cadastral identity (Murcia's does); the benefit
        // is that there is no path by which an OCR number could reach the screen. Pinned so that
        // wiring the resolver is a DELIBERATE change reviewed against the gate, never a drive-by.
        // (Filtered to the PLANNING surface: the best-effort 3D-context prefetch — PMTiles /
        // Overpass — rides along on any commit and says nothing about zoning.)
        const planningCalls = urls.filter(
            (u) => u.includes('catastro') || u.includes('coaco') || u.includes('coacordoba'),
        );
        expect(planningCalls).toEqual([]);
    });
});

describe('§COR-ENVELOPE §HONESTY-GATE — 13 OCR subzones are REGISTERED and NONE of them renders', () => {
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('the pack IS registered (so the risk is real) and the gate IS shut (so it does not fire)', () => {
        // Both halves matter. The first half is why this suite exists at all; the second is the
        // single constant that keeps 13 uncertified OCR subzones off the screen.
        expect(registeredPackZoneCodes(CORDOBA_JURISDICTION_ID)).toHaveLength(13);
        expect(CORDOBA_ENVELOPE_VERIFIED).toBe(false);
    });

    it('dispatches the cited MACHINE-EXTRACTED-UNVERIFIED refusal, never an OCR number', async () => {
        const { envelope } = await dispatchCordoba();
        const r = envelope!.refusal!;
        // ⚠ `legallyGrounded: false` and it must stay false. The PGOU-2001 DOES set an envelope
        // for these subzones — what is unverified is PRYZM's OCR of it. Claiming `true` would
        // attribute our own pipeline's unchecked state to Andalusian planning law.
        expect(r.legallyGrounded).toBe(false);
        const prose = `${r.headline} ${r.detail}`.toLowerCase();
        expect(prose).toMatch(/unverified|verif/);
        // The card states the PILOT scope, so a user is never told Córdoba is covered city-wide.
        expect(prose).toMatch(/sur|noroeste|pilot/);
    });

    it('NEVER draws an extrudable volume — no massing can be built from this answer', async () => {
        const { envelope } = await dispatchCordoba();
        expect(envelope!.insetPolygon).toEqual([]);
        expect(envelope!.insetAreaM2).toBe(0);
        expect(envelope!.maxHeight_m).toBeNull();
        expect(envelope!.farLimitedHeight_m).toBeNull();
        expect(envelope!.maxFloors).toBeNull();
        expect(envelope!.maxCoverage).toBeNull();
        expect(envelope!.maxVolumeM3).toBeNull();
        expect(envelope!.tiers).toEqual([]);
        // ⚠ `not-determined`, NOT `estimated-ruleset`. C58's confidence enum has a dedicated bottom
        // tier — `pipeline-extracted-unverified` — for OCR packs, and a violet "Estimated" badge on
        // an unread scanned PDF would be a confidence claim the pipeline has not earned. A refusal
        // sidesteps the question entirely, which is the only reason Córdoba is not mis-badged today.
        expect(envelope!.confidence).toBe('not-determined');
    });

    it('writes NO number onto the persisted C19 Parcel either', async () => {
        // The panel is not the only surface. A number reaching `site.parcel` would be exported,
        // saved and later read back as if it had been verified.
        const { store } = await dispatchCordoba();
        const site = store.getSite()!;
        expect(site.parcel.maxHeight).toBeNull();
        expect(site.parcel.maxFAR).toBeNull();
        expect(site.parcel.buildableRing).toBeNull();
    });
});
