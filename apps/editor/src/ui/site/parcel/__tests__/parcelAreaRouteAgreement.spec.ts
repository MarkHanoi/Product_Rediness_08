// §AREA-ROUTE-AGREEMENT (C57 §1.14, lane CADASTRAL-COVERAGE 2026-09-09; REWRITTEN BY LANE
// REFUTED-FIX 2026-09-10 after an adversarial verifier proved the first version bound NOTHING) —
// the URL the client PROVIDER ACTUALLY REQUESTS, matched against the route the SERVER ROUTER
// ACTUALLY REGISTERS.
//
// ⛔ WHY THIS SPEC EXISTS, AND IT IS NOT HYPOTHETICAL — IT ALREADY HAPPENED.
// -----------------------------------------------------------------------------------------------
// Spain's area leg shipped as `/api/catastro/parcels` and was renamed to `/api/catastro/parcel/area`
// about an hour later, to match the `<pointRoute>/area` shape DK and the EU legs already used. For
// that hour the client pointed at a route the server no longer served. NOTHING FAILED LOUDLY: a 404
// comes back as a body the reader cannot parse, which becomes `unreachable`, which renders as "the
// cadastre did not answer" — a sentence blaming a Spanish government service for a string mismatch
// inside PRYZM.
//
// ⛔ THE FIRST VERSION OF THIS SPEC DID NOT CATCH THAT, AND SAID IT DID. MEASURED 2026-09-10, all
// three of a verifier's mutations left it 4/4 GREEN:
//   1. `CatastroParcelProvider`'s area constant set back to the literal `'/api/catastro/parcels'`
//      — i.e. the production defect above, reintroduced verbatim.
//   2. `WfsParcelProvider`'s `${cfg.endpoint}/area` changed to `${cfg.endpoint}/parcels-area`,
//      unregistering FR, NL, DK and every other proxy cadastre in one character run.
//   3. The SERVER's `router.get(\`${EU_PARCEL_PATH}/:cc/area\`)` renamed to `/:cc/parcels-area`.
// It missed 1 because it re-derived the client URL instead of reading the constant the provider
// uses; missed 2 because it never mentioned `WfsParcelProvider`; and missed 3 because its EU
// assertion built BOTH sides from `EU_PARCEL_PATH` with the same helper — a tautology that cannot
// fail for any reason. A tautology shaped like a guard is worse than no guard: it stops the next
// person writing a real one.
//
// ⭐ SO NEITHER SIDE IS RE-DERIVED HERE. THERE IS NO EXPECTED PATH LITERAL IN THIS FILE.
//   · CLIENT side — `globalThis.fetch` is replaced with a recorder and the REAL provider (resolved
//     through the REAL `parcelRegistry` from a REAL coordinate, so `proxyPath` comes from the
//     `@pryzm/site-parcel-data` row the app actually uses) is asked for an area. Whatever URL it
//     emits is the subject. Rename anything in that chain and the subject changes.
//   · SERVER side — `createJurisdictionRouter()` is BUILT, and the client's pathname is matched
//     against `router.stack` using Express's own `Layer.match`. That is the real matcher, in the
//     real registration order, so "specific before `:cc`" is exercised rather than assumed.
//   · The assertion is HANDLER IDENTITY: the client's URL must resolve to the very
//     `…ParcelsAreaHandler` function object that serves it. "Matches some route" is not enough —
//     `/api/parcel/fr` matches `:cc` and would answer the POINT handler with a body the area
//     reader cannot use.
//
// ⚠ IT DELIBERATELY IMPORTS THE SERVER MODULES. That is unusual for a `ui/` spec and it is the
// entire point: this is the cross-model agreement check [[same-rule-two-implementations]]
// prescribes, and it can only exist where both models are in scope.

import { describe, it, expect, afterEach } from 'vitest';
import { cadastralProviderFor, resolveParcelProvider } from '../parcelRegistry.js';
import type { ParcelProvider } from '../ParcelProvider.js';
import { listParcelJurisdictions } from '@pryzm/site-parcel-data';
// The SERVER's own router factory and handler function objects — not path strings.
import { createJurisdictionRouter } from '../../../../../../../server/jurisdiction/index.js';
import {
    catastroParcelHandler,
    catastroParcelsAreaHandler,
} from '../../../../../../../server/jurisdiction/parcelZoningProxy.js';
import {
    dkParcelHandler,
    dkParcelsAreaHandler,
} from '../../../../../../../server/jurisdiction/dkMatrikelProxy.js';
import {
    euParcelHandler,
    euParcelsAreaHandler,
} from '../../../../../../../server/jurisdiction/euCadastreProxy.js';

// ── THE SERVER MODEL ─────────────────────────────────────────────────────────────────────────────

interface ExpressLayer {
    readonly route?: {
        readonly path: string;
        readonly methods: Record<string, boolean>;
        readonly stack: ReadonlyArray<{ readonly handle: unknown }>;
    };
    match(path: string): boolean;
}

/**
 * The real router, built with a pass-through limiter. `createJurisdictionRouter` throws unless it
 * is handed one, which is itself the wiring contract — see its own doc comment.
 */
const router = createJurisdictionRouter({
    apiLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}) as unknown as { readonly stack: ReadonlyArray<ExpressLayer> };

/**
 * Resolve a pathname exactly the way Express will at runtime: first GET layer whose own matcher
 * accepts it, in registration order. Returns the registered pattern and the handler chain, or
 * null when NOTHING is registered there — which is what a 404 is.
 */
function resolveServerGet(pathname: string): { pattern: string; handlers: readonly unknown[] } | null {
    for (const layer of router.stack) {
        if (!layer.route) continue;
        if (!layer.route.methods.get) continue;
        if (!layer.match(pathname)) continue;
        return { pattern: layer.route.path, handlers: layer.route.stack.map((l) => l.handle) };
    }
    return null;
}

// ── THE CLIENT MODEL ─────────────────────────────────────────────────────────────────────────────

const REAL_FETCH = globalThis.fetch;
afterEach(() => { globalThis.fetch = REAL_FETCH; });

/** Record every URL the provider requests, answering with a body its reader accepts. */
function captureRequests(body: unknown): string[] {
    const seen: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        seen.push(typeof input === 'string' ? input : String(input));
        return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => body,
        } as unknown as Response;
    }) as typeof fetch;
    return seen;
}

/** The pathname the provider ACTUALLY GETs for an area query. No literal is involved. */
async function clientAreaPath(provider: ParcelProvider, lat: number, lon: number): Promise<string> {
    const seen = captureRequests({ outcome: 'ok', parcels: [], truncated: false });
    await provider.fetchParcelsInArea(lon, lat, 200);
    expect(seen.length, 'the provider issued no area request at all').toBeGreaterThan(0);
    return new URL(seen[0]!, 'http://pryzm.test').pathname;
}

/** The pathname the provider ACTUALLY GETs for a point query. */
async function clientPointPath(provider: ParcelProvider, lat: number, lon: number): Promise<string> {
    const seen = captureRequests({ parcel: null });
    await provider.fetchParcelOutcomeAtPoint(lon, lat);
    expect(seen.length, 'the provider issued no point request at all').toBeGreaterThan(0);
    return new URL(seen[0]!, 'http://pryzm.test').pathname;
}

/**
 * The provider the app would use for a real click, resolved through the real registry — so the
 * `proxyPath` under test is the one in `@pryzm/site-parcel-data`, not one this file invents.
 */
function providerAt(lat: number, lon: number): ParcelProvider {
    const { cadastral } = resolveParcelProvider(lat, lon);
    expect(cadastral, `no cadastral provider resolves at ${lat},${lon} — the fixture coordinate moved`).not.toBeNull();
    return cadastral!;
}

/**
 * ⛔ THE COUNTRIES THE VERIFIER NAMED. Three of the four were bound by nothing before this rewrite:
 * FR and NL ride the generic `WfsParcelProvider`, DK rides it through a named adapter, and only ES
 * was mentioned at all. Each row names the SERVER FUNCTION that must answer — the assertion is
 * identity against that object, so a route that merely exists is not enough.
 */
const CASES = [
    { name: 'SPAIN (Barcelona)', lat: 41.3874, lon: 2.1686, area: catastroParcelsAreaHandler, point: catastroParcelHandler },
    { name: 'FRANCE (Paris)', lat: 48.8566, lon: 2.3522, area: euParcelsAreaHandler, point: euParcelHandler },
    { name: 'NETHERLANDS (Amsterdam)', lat: 52.3676, lon: 4.9041, area: euParcelsAreaHandler, point: euParcelHandler },
    { name: 'DENMARK (Copenhagen)', lat: 55.6761, lon: 12.5683, area: dkParcelsAreaHandler, point: dkParcelHandler },
] as const;

describe('C57 §1.14 — the client asks the route the server actually registered', () => {
    /**
     * ⭐ THE HARNESS'S OWN GUARD, FIRST. Everything below is an assertion that a path RESOLVES; if
     * `resolveServerGet` matched everything, every one of them would be green for free — which is
     * exactly the failure mode this rewrite exists to remove. So: a path the server does not
     * register must resolve to null. `/api/catastro/parcels` is not a hypothetical string, it is
     * the literal defect that shipped for an hour.
     */
    it('⛔ the matcher is not vacuous: an unregistered path resolves to NOTHING', () => {
        expect(resolveServerGet('/api/catastro/parcels')).toBeNull();
        expect(resolveServerGet('/api/parcel/fr/parcels-area')).toBeNull();
        expect(resolveServerGet('/api/parcel/dk/parcels-area')).toBeNull();
        // …while a route that IS registered resolves. Otherwise "null" would prove nothing either.
        expect(resolveServerGet('/api/catastro/parcel/area')).not.toBeNull();
    });

    for (const c of CASES) {
        it(`⭐ ${c.name}: the AREA url the provider requests is served by its area handler`, async () => {
            const path = await clientAreaPath(providerAt(c.lat, c.lon), c.lat, c.lon);
            const hit = resolveServerGet(path);
            expect(hit, `the client GETs ${path} and the server registers NO GET route there`).not.toBeNull();
            expect(
                hit!.handlers,
                `the client GETs ${path}, which the server routes to ${hit!.pattern} — the wrong handler`,
            ).toContain(c.area);
        });

        it(`${c.name}: the POINT url the provider requests is served by its point handler`, async () => {
            const path = await clientPointPath(providerAt(c.lat, c.lon), c.lat, c.lon);
            const hit = resolveServerGet(path);
            expect(hit, `the client GETs ${path} and the server registers NO GET route there`).not.toBeNull();
            expect(
                hit!.handlers,
                `the client GETs ${path}, which the server routes to ${hit!.pattern} — the wrong handler`,
            ).toContain(c.point);
        });
    }

    /**
     * ⭐ EVERY cadastral row, not only the four the verifier happened to name. The next country is
     * added as a DATA row in `@pryzm/site-parcel-data` (§1.13.2) and gets its provider for free;
     * this is the arm that notices when the row's `proxyPath` has no server route behind it. Rows
     * with `proxyPath: null` are footprint-fallbacks by declaration and are not in scope.
     */
    it('⭐ EVERY registered cadastral jurisdiction resolves to a real server route, point AND area', async () => {
        const unrouted: string[] = [];
        for (const jur of listParcelJurisdictions()) {
            const provider = cadastralProviderFor(jur);
            if (!provider) continue;
            const lat = 0, lon = 0; // the coordinate never reaches the network here — only the URL matters.
            const areaPath = await clientAreaPath(provider, lat, lon);
            const pointPath = await clientPointPath(provider, lat, lon);
            if (!resolveServerGet(areaPath)) unrouted.push(`${jur.providerId}: AREA ${areaPath}`);
            if (!resolveServerGet(pointPath)) unrouted.push(`${jur.providerId}: POINT ${pointPath}`);
        }
        expect(unrouted, 'client routes with no server registration behind them').toEqual([]);
    });
});
