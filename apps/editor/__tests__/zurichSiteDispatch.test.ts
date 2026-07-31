// §ZURICH-BZO — the L5 REACHABILITY test: does a real click on a City-of-Zürich parcel reach the
// municipal BZO code, and does the AZ-capped envelope actually get computed?
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS TEST EXISTS — and what it caught
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Zürich was the sharpest case of "authored, then never connected" in this package, and it did NOT
// look like one: `chZurichBzo.ts`, `zurichBzoProvider.ts`, the owner-signed BZO 700.100 catalogue and
// the §L-616 COMPUTED-envelope branch in `applyChZoningThenFallback` had ALL shipped, with tests. But
// the same-origin route they all depend on — `/api/ch/zurich-bzo` — **did not exist in `server.js`**.
// So in production every Zürich parcel resolved `endpoint-unreachable`, fell through to the national
// Grundnutzung path, and got a generic refusal. A signed AZ table, a certified gate and a working
// engine, reachable by nobody. The provider's own header predicted exactly this ("while absent this
// resolves unreachable"); no test asserted it, so nothing said the day had come to fix it.
//
// This suite drives the REAL `dispatchParcelBoundary` on a real `SiteModelStore` sited in Zürich and
// asserts the municipal route is called and the computed envelope lands. The ONLY stubs are the two
// same-origin proxies. **Remove the `isInZurichCity` branch and these fail**: the path then takes the
// national CH route and never calls `/api/ch/zurich-bzo` at all.
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

/** Zürich HB — the ZURICH-BZO-PROBE reference point (BFS-Nr 261, canton ZH). */
const PARCEL = { lat: 47.377, lon: 8.54 } as const;

/**
 * The zone this fixture reports, and the numbers the OWNER-SIGNED BZO 700.100 transcription carries
 * for it under the resolved regime. `docid=15172` is in the static crosswalk as BZO 2016, so the
 * regime RESOLVES — which is what lets a height be cited at all (`W2bIII` would refuse, because its
 * height is 8.5 m under 91/99 and 9.0 m under 2016 and a coin flip there is a fabricated height).
 */
const ZONE = {
    typ: 'Z5',
    ordinanceUrl: 'https://oerebdocs.zh.ch/getDoc?docid=15172',
    az: 2.0,
    maxHeight_m: 19.0,
    maxVollgeschosse: 5,
} as const;

/** A `bzo_zone_v` GML feature in the QGIS-Server shape the city WFS publishes (probe §2). */
const BZO_GML = `<?xml version="1.0" encoding="UTF-8"?>
<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs" xmlns:qgs="http://www.qgis.org/gml"
  numberMatched="1" numberReturned="1">
  <gml:featureMember xmlns:gml="http://www.opengis.net/gml">
    <qgs:bzo_zone_v gml:id="bzo_zone_v.1">
      <qgs:typ>${ZONE.typ}</qgs:typ>
      <qgs:rechtsstatus>inKraft</qgs:rechtsstatus>
      <qgs:rechtsvorschrift_url>${ZONE.ordinanceUrl}</qgs:rechtsvorschrift_url>
      <qgs:plan_url>https://www.stadt-zuerich.ch/bzo</qgs:plan_url>
      <qgs:mutationsnummer>2016-01</qgs:mutationsnummer>
      <qgs:objectid>4711</qgs:objectid>
    </qgs:bzo_zone_v>
  </gml:featureMember>
</wfs:FeatureCollection>`;

/** A well-formed EMPTY collection — the source ANSWERED and there is no BZO zone at the point. */
const BZO_EMPTY_GML =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs" numberMatched="0" numberReturned="0"/>';

/** A plot ring in scene metres, centred on the site origin — ~40 × 41 m ≈ 1 640 m². */
const BOUNDARY = {
    polygon: [
        { x: -20, z: -20 }, { x: 20, z: -20 }, { x: 20, z: 21 }, { x: -20, z: 21 },
    ],
    edgeClassifications: ['front', 'side', 'rear', 'side'] as const,
};

interface RouteLog {
    readonly urls: string[];
}

/**
 * Stub the same-origin proxies this path calls: the NEW `/api/ch/zurich-bzo` and the pre-existing
 * national `/api/ch/grundnutzung` it falls through to. The national one always answers EMPTY, so if
 * the municipal branch is skipped the test sees a bare national refusal — which is precisely the
 * production behaviour this wiring removed.
 */
function stubProxies(
    log: RouteLog,
    bzo: { ok: boolean; gml: string | null },
): typeof globalThis.fetch {
    return vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        log.urls.push(url);
        if (url.startsWith('/api/ch/zurich-bzo')) {
            if (!bzo.ok) return { ok: false, status: 502, json: async () => ({}) } as unknown as Response;
            return { ok: true, status: 200, json: async () => ({ gml: bzo.gml }) } as unknown as Response;
        }
        if (url.startsWith('/api/ch/grundnutzung')) {
            return { ok: true, status: 200, json: async () => ({ gml: null }) } as unknown as Response;
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
    return { ctx: { rt, store, projectId: 'proj-zurich', toast: () => {} }, emitted };
}

/** Bounded poll — the zoning leg is a fire-and-forget async continuation. */
async function waitForEvent(emitted: readonly string[], type: string, timeoutMs = 8_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (emitted.includes(type)) return;
        await new Promise((r) => setTimeout(r, 5));
    }
}

async function dispatchZurich(bzo: { ok: boolean; gml: string | null }): Promise<{
    store: SiteModelStore;
    envelope: BuildableEnvelope | null;
    urls: string[];
}> {
    const log: RouteLog = { urls: [] };
    globalThis.fetch = stubProxies(log, bzo);
    const store = new SiteModelStore();
    siteCreate(
        { projectId: 'proj-zurich', location: { latitude: PARCEL.lat, longitude: PARCEL.lon } },
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

describe('§ZURICH-BZO — a click on a City-of-Zürich parcel reaches the municipal BZO code', () => {
    let realFetch: typeof globalThis.fetch;
    beforeEach(() => { realFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('ROUTES to /api/ch/zurich-bzo — THE route that did not exist in server.js', async () => {
        const { urls } = await dispatchZurich({ ok: true, gml: BZO_GML });
        // ⚠ THE REACHABILITY ASSERTION. Remove the `isInZurichCity` branch and the parcel takes the
        // national CH path; this call never happens and this fails. Before the server route was
        // wired, this call was made but ALWAYS 404'd — which is why the assertion below (that the
        // national fallback is NOT reached) is the one that proves the fix rather than the wiring.
        const bzoCall = urls.find((u) => u.startsWith('/api/ch/zurich-bzo'));
        expect(bzoCall).toBeDefined();
        const q = new URLSearchParams(bzoCall!.split('?')[1]!);
        expect(Math.abs(Number(q.get('lat')) - PARCEL.lat)).toBeLessThan(5e-4);
        expect(Math.abs(Number(q.get('lon')) - PARCEL.lon)).toBeLessThan(5e-4);
        // ⚠ AND IT DOES NOT FALL THROUGH. A resolved municipal zone must short-circuit the national
        // Grundnutzung path — the fall-through IS the production symptom of the missing route.
        expect(urls.some((u) => u.startsWith('/api/ch/grundnutzung'))).toBe(false);
    });

    it('COMPUTES the AZ-capped envelope from the owner-signed BZO 700.100 transcription', async () => {
        const { envelope } = await dispatchZurich({ ok: true, gml: BZO_GML });
        expect(envelope).not.toBeNull();
        expect(envelope!.status).toBe('ok');
        expect(envelope!.zoneCode).toBe(ZONE.typ);
        expect(envelope!.refusal).toBeNull();
        // The AZ binds the engine's FAR cap, the regime-correct Gebäudehöhe the height cap.
        expect(envelope!.maxFAR).toBe(ZONE.az);
        expect(envelope!.maxHeight_m).toBe(ZONE.maxHeight_m);
        expect(envelope!.maxFloors).toBe(ZONE.maxVollgeschosse);
        // ⚠ §L-616 — the massing must be GFA-capped, not footprint × height. `farLimitedHeight_m` is
        // the field that makes that true; a null here would mean the AZ never bound and the envelope
        // silently over-stated (the OVERSTATES-FAR defect the founder corrected).
        expect(envelope!.farLimitedHeight_m).not.toBeNull();
        expect(envelope!.farLimitedHeight_m!).toBeGreaterThan(0);
        // ⚠ `estimated-ruleset`, NEVER `structured`: the AZ/height are a HUMAN transcription of the
        // BZO 700.100 PDF table, not a live WFS attribute. The WFS publishes no numeric field at all.
        expect(envelope!.confidence).toBe('estimated-ruleset');
        // The card names THIS parcel's own ordinance, not a generic citation.
        expect(envelope!.caveats.join(' | ')).toContain(ZONE.ordinanceUrl);
    });

    it('threads the BZO caps onto the C19 Parcel via the command bus', async () => {
        const { store } = await dispatchZurich({ ok: true, gml: BZO_GML });
        const site = store.getSite()!;
        expect(site.parcel.zoning.category).toBe(ZONE.typ);
        expect(site.parcel.maxHeight).toBe(ZONE.maxHeight_m);
        expect(site.parcel.maxFAR).toBe(ZONE.az);
        expect(site.parcel.buildableRing).not.toBeNull();
    });

    it('the municipal service being DOWN degrades to the NATIONAL refusal — never to a number', async () => {
        // §CONTEXT-DATA-HONESTY: an outage must degrade to a WEAKER, still-cited answer. It must not
        // reuse the last zone, must not estimate, and must not present the national refusal as
        // though the municipal question had been asked and answered.
        const { store, envelope, urls } = await dispatchZurich({ ok: false, gml: null });
        expect(urls.some((u) => u.startsWith('/api/ch/zurich-bzo'))).toBe(true);
        // It FELL THROUGH — the documented, non-breaking degradation.
        expect(urls.some((u) => u.startsWith('/api/ch/grundnutzung'))).toBe(true);
        expect(envelope!.status).toBe('none');
        expect(envelope!.refusal).toBeTruthy();
        expect(envelope!.maxHeight_m).toBeNull();
        expect(envelope!.maxFAR).toBeNull();
        expect(envelope!.insetPolygon).toEqual([]);
        expect(store.getSite()!.parcel.maxHeight).toBeNull();
        // ⚠ And it must NOT carry the Zürich zone: nothing was resolved, so quoting `Z5` would be a
        // claim about this parcel that no source made on this request.
        expect(envelope!.zoneCode).not.toBe(ZONE.typ);
    });

    it('an EMPTY municipal answer is a different path from a FAILED one', async () => {
        // The source answered and there is no BZO zone at the point. Also a fall-through, but for a
        // durable reason rather than a transient one — and, either way, never a fabricated number.
        const { envelope, urls } = await dispatchZurich({ ok: true, gml: BZO_EMPTY_GML });
        expect(urls.some((u) => u.startsWith('/api/ch/grundnutzung'))).toBe(true);
        expect(envelope!.status).toBe('none');
        expect(envelope!.maxHeight_m).toBeNull();
        expect(envelope!.maxFAR).toBeNull();
    });

    it('S5 — Switzerland stays ONE registration, and its summary states the Zürich exception', () => {
        const swiss = listJurisdictionCoverage().filter((j) => j.countryCode === 'CH');
        // ⚠ EXACTLY ONE. A second `ch-zh-zurich-bzo` registration would overlap SWITZERLAND_BBOX with
        // no rule for which wins — the ambiguity C60 §2 forbids. Zürich is handled INSIDE the Swiss
        // dispatch instead (`isInZurichCity`), so the globe keeps one Swiss claim.
        expect(swiss).toHaveLength(1);
        const ch = swiss[0]!;
        expect(ch.contains(PARCEL.lat, PARCEL.lon)).toBe(true);
        // The globe's promise must match what the engine now does at BFS-261 — a computed envelope,
        // not the blanket national refusal the summary used to claim.
        expect(ch.answerSummary).toContain('Zürich');
        expect(ch.answerSummary).toMatch(/Ausn(ü|u)tzungsziffer/);
        // Still no static zone→pack table: the numbers are resolved live from the signed catalogue.
        expect(ch.packZoneCodes).toEqual([]);
    });
});
