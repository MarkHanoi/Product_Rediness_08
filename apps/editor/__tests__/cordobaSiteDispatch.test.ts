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

/**
 * A large plot, sized to actually clear OA-1's real Art. 13.6.3.3 setback (½ × 21m height =
 * 10.5m on side AND rear) with buildable area left over. The small `BOUNDARY` above is correct
 * for the refusal-path tests (geometry never matters there) but is genuinely too small for OA-1's
 * real rule — confirmed by running the compute engine against it and observing a true
 * `status:'degenerate'`, not a bug in the dispatch code.
 */
const LARGE_BOUNDARY = {
    polygon: [
        { x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: 40 }, { x: 0, z: 40 },
    ],
    edgeClassifications: ['front', 'side', 'rear', 'side'] as const,
};

interface RouteLog {
    readonly urls: string[];
}

/**
 * §COR-MC-ANCHO fixture geometry — a 20×20 m block (3 vertical-strip parcels that dissolve by
 * exact edge-cancellation) with ONE neighbour 6 m across its east edge, i.e. a real, resolvable
 * 6 m street width (MC-1's first band: PB+2 = 9.75 m, well clear of the 8 m ADR-0287 guard).
 *
 * Converted from scene-XZ metres to WGS84 by the EXACT inverse of `latLonToSceneXZ`, about the
 * site origin (`PARCEL.lat`/`PARCEL.lon` — `siteCreate` below anchors the site there and θ=0), so
 * the round-trip through `toAuthoringFrame` inside the dispatcher lands back on these metres.
 */
const EARTH_RADIUS_M = 6_378_137;
const DEG2RAD = Math.PI / 180;
function xzToLatLon(x: number, z: number): { lat: number; lon: number } {
    const cosLat0 = Math.cos(PARCEL.lat * DEG2RAD);
    return {
        lat: PARCEL.lat - z / (DEG2RAD * EARTH_RADIUS_M),
        lon: PARCEL.lon + x / (DEG2RAD * EARTH_RADIUS_M * cosLat0),
    };
}
const MC_BLOCK_PARCELS_XZ: ReadonlyArray<{ refcat: string; ring: [number, number][] }> = [
    { refcat: 'BLK1', ring: [[0, 0], [7, 0], [7, 20], [0, 20]] },
    { refcat: 'BLK2', ring: [[7, 0], [13, 0], [13, 20], [7, 20]] },
    { refcat: 'BLK3', ring: [[13, 0], [20, 0], [20, 20], [13, 20]] },
];
// ⚠ Positioned across the block's BOTTOM edge (z = 0), 6 m south of it (z = −6 … −26) —
// deliberately the SAME edge the committed `BOUNDARY` fixture's own bottom edge lies on
// (`BOUNDARY.polygon`'s (0,0)→(12,0)), so `blockEdgesFacingParcel` genuinely identifies this as
// the parcel's OWN frontage rather than requiring the whole-block fallback.
const MC_NEIGHBOUR_6M_XZ: [number, number][] = [[0, -6], [20, -6], [20, -26], [0, -26]];

/**
 * Stub the same-origin proxies this path calls. Any OTHER URL rejects, which is deliberate: a
 * unit test may reach no network, and if the Córdoba path ever started calling a COACo endpoint
 * (WIRING-TODO 5, which lands WITH the sign-off) it must surface here rather than hang.
 */
function stubProxies(
    log: RouteLog,
    opts?: { resolvedSubzoneLink?: string; mcBlockAvailable?: boolean },
): typeof globalThis.fetch {
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
        if (url.startsWith('/api/catastro/block')) {
            if (!opts?.mcBlockAvailable) {
                // The DEFAULT — no block published for this test's refcat. `fetchBlockForParcel`
                // treats a non-ok response as "no block" and never throws, so §COR-MC-ANCHO simply
                // fails to measure a width and falls through to the structural refusal.
                return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
            }
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    block: {
                        manzana: 'TESTMZ',
                        parcels: MC_BLOCK_PARCELS_XZ.map((p) => ({
                            refcat: p.refcat,
                            ring: p.ring.map(([x, z]) => xzToLatLon(x, z)),
                            areaM2: 130,
                        })),
                        neighbours: [{
                            refcat: 'NEIGH1',
                            ring: MC_NEIGHBOUR_6M_XZ.map(([x, z]) => xzToLatLon(x, z)),
                        }],
                    },
                }),
            } as unknown as Response;
        }
        if (opts?.resolvedSubzoneLink && url.startsWith('/api/cordoba/ordenanzas')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    features: [
                        {
                            properties: {
                                link: opts.resolvedSubzoneLink,
                                ordenanza: 'Ordenación Abierta',
                            },
                        },
                    ],
                }),
            } as unknown as Response;
        }
        if (url.startsWith('/api/cordoba/')) {
            // Unstubbed §COR-SUBZONE call in a test that doesn't provide `resolvedSubzoneLink` —
            // this is the DEFAULT (subzone genuinely unresolved), not a test-harness failure.
            return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
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

async function dispatchCordoba(opts?: {
    resolvedSubzoneLink?: string;
    boundary?: typeof BOUNDARY;
    mcBlockAvailable?: boolean;
}): Promise<{
    store: SiteModelStore;
    envelope: BuildableEnvelope | null;
    urls: string[];
}> {
    const log: RouteLog = { urls: [] };
    globalThis.fetch = stubProxies(log, opts);
    const store = new SiteModelStore();
    siteCreate(
        { projectId: 'proj-cordoba', location: { latitude: PARCEL.lat, longitude: PARCEL.lon } },
        store,
    );
    const { ctx, emitted } = ctxFor(store);
    const activeBoundary = opts?.boundary ?? BOUNDARY;
    expect(
        dispatchParcelBoundary(ctx, {
            ...activeBoundary,
            edgeClassifications: [...activeBoundary.edgeClassifications],
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

    it('the pack IS registered — 13 OCR subzones exist to be at risk', () => {
        // ⚠ CORRECTED 2026-08-03: `CORDOBA_ENVELOPE_VERIFIED` was signed `true` by commit
        // `6d2357a8` — six other test files were updated in that commit to match; this one was
        // missed. The registration-count assertion still holds; the gate assertion below is now
        // the opposite of what it asserted before signing.
        expect(registeredPackZoneCodes(CORDOBA_JURISDICTION_ID)).toHaveLength(13);
        expect(CORDOBA_ENVELOPE_VERIFIED).toBe(true);
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

describe('§COR-COMPUTE — a RESOLVED subzone, gate signed, actually renders (2026-08-04)', () => {
    // ⚠ WHY THIS SUITE EXISTS. Every test above this line drives `dispatchCordoba()` with the
    // §COR-SUBZONE call unstubbed, so `subzone` never resolves and every assertion above only
    // proves the UNRESOLVED-subzone fallback path. `CORDOBA_ENVELOPE_VERIFIED` has been `true`
    // since `6d2357a8`, and the compute branch (`siteDispatch.ts`, §COR-COMPUTE) has existed since
    // this session — but until this suite, NOTHING in the repo exercised a resolved subzone
    // actually reaching `computeBuildableEnvelope` and returning `status: 'ok'`. That gap was
    // flagged explicitly rather than assumed closed; this suite closes it for real.
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('CORDOBA_ENVELOPE_VERIFIED is genuinely true today (the precondition this suite assumes)', () => {
        expect(CORDOBA_ENVELOPE_VERIFIED).toBe(true);
    });

    it('OA-1 (alignment-based, a real 21m height, not the MC structural-refusal family) COMPUTES', async () => {
        // `O_OA1.pdf` -> subzoneCodeFromLink -> "OA-1", one of the 13 registered zones, and one
        // whose `geometricRule` is a plain `alignment` kind (per `esCordobaPGOU2001.ts`) — not
        // MC's `explicit-area` + unresolved-ring sentinel, which structurally refuses on its own
        // merits regardless of the gate. This is the "normal" case the gate was signed for.
        const { store, envelope } = await dispatchCordoba({
            resolvedSubzoneLink: 'O_OA1.pdf',
            boundary: LARGE_BOUNDARY,
        });
        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('ok');
        expect(envelope!.refusal).toBeFalsy();
        expect(envelope!.insetPolygon.length).toBeGreaterThan(0);
        expect(envelope!.insetAreaM2).toBeGreaterThan(0);
        expect(envelope!.maxHeight_m).toBe(21);
        // The gate being signed does NOT mean the confidence tier jumps to "verified" — a
        // machine-OCR'd pack stays capped at its own declared ceiling (L-665,
        // `capEnvelopeConfidenceToPackDefault`, confirmed landed in `ZoningRulesEngine.ts:264`).
        // Proven live here: the actual dispatched confidence is `pipeline-extracted-unverified`.
        expect(envelope!.confidence).toBe('pipeline-extracted-unverified');
        // A real number now reaches the persisted parcel too — the mirror of the earlier
        // "writes NO number" assertion, now that there IS a legitimate number to write.
        const site = store.getSite()!;
        expect(site.parcel.maxHeight).toBe(21);
    });

    it('MC-3 (the explicit-area / unresolved-ring family) STILL structurally refuses even resolved+signed', async () => {
        // The signature does not unblock MC — Córdoba publishes no alineación from which MC's
        // per-street-width height table (Art. 13.5.3.1) could be measured. `O_MC3.pdf` ->
        // "MC-3" resolves fine (the SUBZONE is known), but `computeBuildableEnvelope` hard-fails
        // the `explicit-area` rule because no `explicitAreaFootprint` is ever injected for the
        // `CORDOBA_MC_FONDO_UNRESOLVED_RING` sentinel — ADR-0270's "hard fail, never fall through
        // to the plain parcel inset" behaviour, proven here rather than assumed.
        const { envelope } = await dispatchCordoba({ resolvedSubzoneLink: 'O_MC3.pdf' });
        expect(envelope).not.toBeNull();
        expect(envelope!.status).not.toBe('ok');
        expect(envelope!.refusal).toBeTruthy();
        expect(envelope!.insetPolygon).toEqual([]);
    });

    it('an unresolved subzone (§COR-SUBZONE genuinely fails) still falls through to the honest coverage-gap refusal', async () => {
        // The negative control for this whole suite: no `resolvedSubzoneLink` means the same
        // unresolved path every earlier test in this file exercises — confirms the new stub
        // machinery didn't change default behaviour for the common (still-most-likely) case.
        const { envelope } = await dispatchCordoba();
        expect(envelope!.status).not.toBe('ok');
        expect(envelope!.refusal).toBeTruthy();
    });
});

describe('§COR-MC-ANCHO (2026-08-04) — the MC per-street-width HEIGHT resolves; the FOOTPRINT still refuses', () => {
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('a Catastro block THAT DISSOLVES with a real opposing frontage RESOLVES the height (Art. 13.5.3.1)', async () => {
        // `O_MC1.pdf` -> "MC-1"; the stubbed `/api/catastro/block` dissolves to a 20×20 m manzana
        // with a 6 m opposing frontage — MC-1's first band, PB+2 = 9.75 m, comfortably clear of
        // the ADR-0287 guard around the 8 m boundary.
        const { envelope } = await dispatchCordoba({
            resolvedSubzoneLink: 'O_MC1.pdf',
            mcBlockAvailable: true,
        });
        expect(envelope).not.toBeNull();
        // ⚠ THE FOOTPRINT STILL REFUSES — this is NOT a full 'ok' envelope. MC's *fondo edificable*
        // has no resolved block geometry (a SEPARATE, out-of-scope capability); see
        // `cordobaMcResolvedPack`'s own header. Resolving the height does not resolve the footprint.
        expect(envelope!.status).not.toBe('ok');
        expect(envelope!.insetPolygon).toEqual([]);
        const r = envelope!.refusal!;
        expect(r.legallyGrounded).toBe(false);
        // The REAL, computed height + measured width now ride in the refusal as cited facts —
        // this is what distinguishes this branch from the plain "nothing is known" card below.
        const prose = r.knownFacts.join(' ');
        expect(prose).toMatch(/13\.5\.3\.1/);
        expect(prose).toMatch(/PB\+2/);
        expect(prose).toMatch(/9\.75/);
        expect(prose).toMatch(/6\.00 m|6\.0\d m/); // the measured street width
        expect(prose).toMatch(/ADR-0287/);
    });

    it('an MC parcel WITHOUT a resolvable width (no block published) falls through UNCHANGED', async () => {
        const { envelope } = await dispatchCordoba({
            resolvedSubzoneLink: 'O_MC1.pdf',
            mcBlockAvailable: false,
        });
        expect(envelope!.status).not.toBe('ok');
        expect(envelope!.insetPolygon).toEqual([]);
        const r = envelope!.refusal!;
        // The height-resolution branch never fired, so the refusal is the SAME generic card the
        // pre-existing MC-3 test above pins — no fabricated height, no measured-width fact.
        const prose = r.knownFacts.join(' ');
        expect(prose).not.toMatch(/measured street width/);
        expect(prose).not.toMatch(/PB\+2/);
    });
});
