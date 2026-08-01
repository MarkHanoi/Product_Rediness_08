// §MADRID-PGOUM97 — the L5 REACHABILITY test: does a real click on a Madrid parcel actually reach
// the Madrid PGOUM-97 code?
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS TEST EXISTS, AND WHY IT DRIVES THE REAL DISPATCHER
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// `esMadridPgoum97.ts` shipped as an ORPHAN: 23 cited Norma-Zonal subzones, a legally-grounded NZ 3
// refusal and a street-width height table — complete, unit-tested, and referenced by nothing outside
// its own file. Every one of its own tests passed, and not one line of it could be reached from the
// running app: a Madrid click went straight to the NZ 1 footprint plane, so a parcel in Norma Zonal 8
// was told "no published buildable footprint at this point" — true, useless, and implying the
// ordinance is silent when Capítulo 8.8 states its rules explicitly.
//
// A provider test cannot detect that. Only exercising the DISPATCH can. So this suite calls the real
// `dispatchParcelBoundary` on a real `SiteModelStore` with a site located in Madrid, and asserts on
// what lands in the C19 Parcel and in the cached envelope the renderers read.
//
// The only stubs are the three SAME-ORIGIN PROXIES this path fetches (`/api/catastro/parcel`,
// `/api/madrid/normas-zonales`, `/api/madrid/condiciones`). Nothing about the routing, the ordering,
// the gate or the dispatch is mocked — if the `isInMadrid` branch is removed from `applyZoning`, or
// the zone resolver stops being called, or the honesty gate stops refusing, these assertions fail.
//
// ⚠ THE CENTRAL ASSERTION IS AN ABSENCE. `MADRID_ENVELOPE_VERIFIED` is `false`, so a parcel in a
// FULLY PARAMETERISED zone (NZ 7, every field a stated scalar) must still receive a cited refusal and
// no number. A test that asserted a rendered envelope would go green on precisely the failure the
// gate exists to prevent.
//
// NOTE: imports the real `@pryzm/stores` + `@pryzm/site-parcel-data`, like
// `murciaSiteDispatch.test.ts`.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SiteModelStore, siteCreate } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { BuildableEnvelope } from '@pryzm/schemas';
import {
    dispatchParcelBoundary,
    getLastBuildableEnvelope,
} from '../src/ui/site/siteDispatch.js';

/** A central-Madrid parcel (Barrio de Salamanca / Sol axis) — unambiguously inside INE 28079. */
const PARCEL = {
    refcat: '9872023VK4797D',
    lat: 40.41678,
    lon: -3.70379,
    address: 'CALLE MAYOR 1 MADRID (MADRID)',
    areaOfficialM2: 620,
} as const;

/** A small plot ring in scene metres — the shape a draw/select commits. */
const BOUNDARY = {
    polygon: [
        { x: 0, z: 0 }, { x: 24, z: 0 }, { x: 24, z: 26 }, { x: 0, z: 26 },
    ],
    edgeClassifications: ['front', 'side', 'rear', 'side'] as const,
};

interface RouteLog {
    readonly urls: string[];
}

/** What each stubbed proxy should answer for one dispatch. */
interface ProxyPlan {
    /** `/api/madrid/normas-zonales` → the Esri body, or `'down'` for the 502 the proxy returns. */
    readonly normasZonales: unknown | 'down';
    /** `/api/madrid/condiciones` → the Esri body, or `'down'`. Only the NZ-1 path reads it. */
    readonly condiciones?: unknown | 'down';
}

/** One `NORMAS_ZONALES/MapServer/0` feature, in the shape the proxy returns. */
function zoneFeature(code: string, denom?: string) {
    return { attributes: { AMB_TX_ETIQ: code, ...(denom ? { AMB_TX_DENOM: denom } : {}) } };
}

/**
 * Stub the three same-origin proxies this path calls. Any OTHER URL rejects, which is deliberate:
 * a unit test may reach no network, and a path that quietly started calling something else should
 * surface here rather than hang.
 */
function stubProxies(log: RouteLog, plan: ProxyPlan): typeof globalThis.fetch {
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
                            { lat: PARCEL.lat + 0.00018, lon: PARCEL.lon },
                            { lat: PARCEL.lat + 0.00018, lon: PARCEL.lon + 0.00025 },
                            { lat: PARCEL.lat, lon: PARCEL.lon + 0.00025 },
                        ],
                    },
                }),
            } as unknown as Response;
        }
        if (url.startsWith('/api/madrid/normas-zonales')) {
            if (plan.normasZonales === 'down') {
                return { ok: false, status: 502, json: async () => ({ error: 'upstream' }) } as unknown as Response;
            }
            return { ok: true, status: 200, json: async () => plan.normasZonales } as unknown as Response;
        }
        if (url.startsWith('/api/madrid/condiciones')) {
            if (plan.condiciones === undefined || plan.condiciones === 'down') {
                return { ok: false, status: 502, json: async () => ({ error: 'upstream' }) } as unknown as Response;
            }
            return { ok: true, status: 200, json: async () => plan.condiciones } as unknown as Response;
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
    return { ctx: { rt, store, projectId: 'proj-madrid', toast: () => {} }, emitted };
}

/** Bounded poll — the zoning leg is a fire-and-forget async continuation. */
async function waitForEvent(emitted: readonly string[], type: string, timeoutMs = 8_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (emitted.includes(type)) return;
        await new Promise((r) => setTimeout(r, 5));
    }
}

async function dispatchMadrid(plan: ProxyPlan): Promise<{
    store: SiteModelStore;
    envelope: BuildableEnvelope | null;
    urls: string[];
}> {
    const log: RouteLog = { urls: [] };
    globalThis.fetch = stubProxies(log, plan);
    const store = new SiteModelStore();
    siteCreate(
        { projectId: 'proj-madrid', location: { latitude: PARCEL.lat, longitude: PARCEL.lon } },
        store,
    );
    const { ctx, emitted } = ctxFor(store);
    expect(dispatchParcelBoundary(ctx, { ...BOUNDARY, edgeClassifications: [...BOUNDARY.edgeClassifications] })).toBe(true);
    await waitForEvent(emitted, 'site.zoning-updated');
    return { store, envelope: getLastBuildableEnvelope(), urls: log.urls };
}

describe('§MADRID-PGOUM97 — a click on a Madrid parcel reaches the PGOUM-97 code', () => {
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('ROUTES to the Madrid Normas Zonales service — the link that was missing', async () => {
        const { urls } = await dispatchMadrid({ normasZonales: { features: [zoneFeature('8.2.b')] } });
        // ⚠ THE REACHABILITY ASSERTION. Before this wiring no zone-routing call was ever made: the
        // parcel resolved (Catastro is national) and every Madrid click went to the NZ 1 footprint
        // plane regardless of zone. If the `isInMadrid` branch is removed from `applyZoning`, or the
        // router stops resolving the zone, this fails.
        const zoneCall = urls.find((u) => u.startsWith('/api/madrid/normas-zonales'));
        expect(zoneCall).toBeDefined();
        // §L-521 — the query point is the PARCEL'S AREA CENTROID, not the site anchor, so assert
        // proximity rather than a literal: it must land on the parcel (within ~50 m).
        const q = new URLSearchParams(zoneCall!.split('?')[1]!);
        expect(Math.abs(Number(q.get('lat')) - PARCEL.lat)).toBeLessThan(5e-4);
        expect(Math.abs(Number(q.get('lon')) - PARCEL.lon)).toBeLessThan(5e-4);
        // ⚠ NOTE, deliberately NOT asserted here: the national Catastro identity leg
        // (`/api/catastro/parcel`) runs on its OWN async continuation and is not ordered against
        // `site.zoning-updated`, so asserting it in this test would be asserting a race. It is
        // covered where it belongs — the parcel-provider suites. This test is about ZONE ROUTING.
        // ⚠ AND IT DOES NOT ASK THE NZ-1 FOOTPRINT PLANE. An NZ-8 parcel has no Fondo de la
        // Edificación to fetch; querying it was the old behaviour's whole mistake.
        expect(urls.some((u) => u.startsWith('/api/madrid/condiciones'))).toBe(false);
    });

    it('⚠ THE HONESTY GATE — a fully-parameterised NZ 7 parcel STILL publishes no number', async () => {
        // NZ 7 grado 1º nivel a is the cleanest family in the pack: 14,50 m cornisa, 4 plantas,
        // 0,8 m²/m², 35 % ocupación, 4 m on all three edges — every value a stated scalar with an
        // article. And it renders NOTHING, because a MACHINE read those articles and no human has
        // signed the reading. This assertion is the point of the whole wiring.
        const { store, envelope } = await dispatchMadrid({
            normasZonales: { features: [zoneFeature('7.1.a', 'Edificación en baja densidad')] },
        });

        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('none');
        expect(envelope!.zoneCode).toBe('7.1.a');
        expect(envelope!.refusal).toBeTruthy();
        // Our process, not the ordinance's silence: the LAW is known and transcribed; what is
        // missing is a human signature on OUR transcription (§CONTEXT-DATA-HONESTY).
        expect(envelope!.refusal!.code).toBe('source-data-unavailable');
        expect(envelope!.refusal!.legallyGrounded).toBe(false);
        expect(envelope!.refusal!.ordinanceRef).toContain('Compendio 2025');
        expect(envelope!.refusal!.detail).toMatch(/human planning professional/i);
        // The card opens with the user's own land and the zone Madrid itself named.
        const facts = envelope!.refusal!.knownFacts.join(' | ');
        expect(facts).toContain('7.1.a');
        expect(facts).toContain('Edificación en baja densidad');

        // NOT ONE of the pack's real figures reaches the envelope or the persisted parcel.
        expect(envelope!.maxHeight_m).toBeNull();
        expect(envelope!.maxFloors).toBeNull();
        expect(envelope!.maxCoverage).toBeNull();
        expect(envelope!.insetPolygon).toEqual([]);
        expect(envelope!.insetAreaM2).toBe(0);
        expect(envelope!.maxVolumeM3).toBeNull();
        expect(envelope!.confidence).toBe('not-determined');
        const prose = `${envelope!.refusal!.headline} ${envelope!.refusal!.detail}`;
        expect(prose).not.toMatch(/14[.,]5|0[.,]8\s*m²|35\s*%/);

        const site = store.getSite()!;
        expect(site.parcel.zoning.category).toBe('7.1.a');
        expect(site.parcel.zoning.jurisdictionRef).toBe('madrid-pgoum');
        expect(site.parcel.maxHeight).toBeNull();
        expect(site.parcel.maxFAR).toBeNull();
        expect(site.parcel.buildableRing).toBeNull();
    });

    it('an NZ 3 parcel gets the LEGALLY GROUNDED derived-plan refusal, not the unverified one', async () => {
        const { store, envelope } = await dispatchMadrid({
            normasZonales: { features: [zoneFeature('3.1', 'Volumetría Específica')] },
        });
        expect(envelope!.status).toBe('none');
        expect(envelope!.zoneCode).toBe('3.1');
        // ⚠ THE DISTINCTION THAT MATTERS. NZ 3's refusal is the ORDINANCE'S OWN ANSWER — Art. 8.3.1
        // says the aprovechamiento is already exhausted — so it is `legallyGrounded: true` and it
        // survives sign-off. The NZ 7 card above is `false`, because that is a statement about
        // PRYZM's unfinished verification. Collapsing the two would blame Madrid for our backlog.
        expect(envelope!.refusal!.code).toBe('derived-plan');
        expect(envelope!.refusal!.legallyGrounded).toBe(true);
        expect(envelope!.refusal!.ordinanceRef).toContain('8.3.1');
        expect(envelope!.refusal!.detail).toMatch(/agotado|exhausted/i);
        expect(store.getSite()!.parcel.zoning.category).toBe('3.1');
        expect(store.getSite()!.parcel.maxHeight).toBeNull();
    });

    it('an NZ 1 parcel still gets its SETTLED ring-only answer — the router adds, never subtracts', async () => {
        // The published Fondo de la Edificación for the manzana, WGS84, comfortably containing the
        // stubbed parcel ring. COEF_Z rides as a coded TOKEN; no height or FAR is asserted from it.
        const ring = [
            [PARCEL.lon - 0.0004, PARCEL.lat - 0.0004],
            [PARCEL.lon + 0.0008, PARCEL.lat - 0.0004],
            [PARCEL.lon + 0.0008, PARCEL.lat + 0.0008],
            [PARCEL.lon - 0.0004, PARCEL.lat + 0.0008],
            [PARCEL.lon - 0.0004, PARCEL.lat - 0.0004],
        ];
        const { store, envelope, urls } = await dispatchMadrid({
            normasZonales: { features: [zoneFeature('1.3', 'Protección del Patrimonio Histórico')] },
            condiciones: {
                features: [{
                    attributes: { CODMANZANA: '28079A1234', COEF_Z: '0 / 4', NUMORD: '1', COND_EDIF: 'X' },
                    geometry: { rings: [ring] },
                }],
            },
        });
        // It went to the NZ-1 footprint plane — and only because the zone said `1.3`.
        expect(urls.some((u) => u.startsWith('/api/madrid/condiciones'))).toBe(true);
        expect(envelope!.status).toBe('ok');
        // ⚠ THE RESOLVED GRADO, not the pack's index-0 code. `1.3` and `1.1` are different grados.
        expect(envelope!.zoneCode).toBe('1.3');
        expect(envelope!.insetPolygon.length).toBeGreaterThanOrEqual(3);
        // The ring is the WHOLE claim: the COEF_Z semantics stay withheld behind the L-449 legend
        // read, so no height and no FAR is asserted from published geometry.
        expect(envelope!.maxHeight_m).toBeNull();
        expect(envelope!.maxFAR).toBeNull();
        expect(envelope!.confidence).toBe('estimated-ruleset'); // never `structured`
        expect(envelope!.caveats.join(' ')).toMatch(/COEF_Z/);
        expect(store.getSite()!.parcel.buildableRing).not.toBeNull();
    });

    it('a zone in NO family we hold gets the COVERAGE GAP, never a borrowed NZ 1 citation', async () => {
        // Normas Zonales 2/6/10/11 are absent from the live `AMB_TX_ETIQ` vocabulary for reasons
        // recorded as UNDETERMINED (SOURCES.md §0.3). If such a parcel exists, it must be told the
        // truth about our coverage — not about a zone it is not in.
        const { envelope } = await dispatchMadrid({
            normasZonales: { features: [zoneFeature('6.2', 'Norma Zonal 6')] },
        });
        expect(envelope!.status).toBe('none');
        expect(envelope!.zoneCode).toBe('6.2');
        expect(envelope!.refusal!.code).toBe('no-rule-pack');
        expect(envelope!.refusal!.legallyGrounded).toBe(false);
        expect(envelope!.refusal!.detail).not.toContain('Fondo de la');
    });

    it('does NOT fall back to the estimated default when the zoning service is DOWN', async () => {
        // ⚠ The failure mode this guards: an estimated front/side/rear triple carrying a violet
        // "Estimated" badge on land whose real rules we hold but may not publish. The router falls
        // through to the NZ-1 path (pre-router behaviour, unchanged), which refuses honestly.
        const { store, envelope } = await dispatchMadrid({ normasZonales: 'down', condiciones: 'down' });
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal).toBeTruthy();
        // FAILURE and ABSENCE stay different answers, on the card as well as in the code:
        // a still-failing transient is the retry-honest card, never `no-plan-at-point`.
        expect(envelope!.refusal!.code).toBe('source-data-unavailable');
        expect(envelope!.refusal!.detail).toMatch(/temporary outage|temporarily unreachable/i);
        expect(envelope!.refusal!.knownFacts.join(' ')).toMatch(/not resolved/i);
        expect(store.getSite()!.parcel.zoning.jurisdictionRef).toBe('madrid-pgoum');
        expect(store.getSite()!.parcel.maxHeight).toBeNull();
        expect(store.getSite()!.parcel.maxFAR).toBeNull();
    }, 20_000);

    it('a zone-layer EMPTY is not an outage — and still never fabricates a number', async () => {
        // The layer answered with zero features. A real negative about this point, distinct from the
        // 502 above, and it must not be laundered into "the source is down".
        const { envelope } = await dispatchMadrid({ normasZonales: { features: [] }, condiciones: { features: [] } });
        expect(envelope!.status).toBe('none');
        // The NZ-1 fallthrough's source ANSWERED with no footprint → the durable absence card.
        expect(envelope!.refusal!.code).toBe('no-plan-at-point');
        expect(envelope!.refusal!.knownFacts.join(' ')).toMatch(/no-feature/);
        expect(envelope!.maxHeight_m).toBeNull();
        expect(envelope!.insetPolygon).toEqual([]);
    }, 20_000);
});
