// §NL-BESTEMMINGSPLAN-PROXY (L-609 / §NL-NATIONWIDE) — tests for the keyless PDOK RP WMS proxy.
//
// The fixtures are SHAPED FROM the GeoJSON the PDOK "Ruimtelijke plannen" WMS GetFeatureInfo returns
// (live-verified 2026-07-26). No live network — every test injects `fetchImpl`. Load-bearing:
//   • the SVBP2012 maatvoering unpack (`"<naam>"="<waarde>"` → { naam, waarde }),
//   • the GOVERNING-PLAN pick from the SUBSTANTIVE layers (never a thematic plangebied overlay), and
//   • the §CONTEXT-DATA-HONESTY split — an UPSTREAM FAILURE (502) must never look like an EMPTY
//     answer ({ plan: null }), so the client returns endpoint-unreachable, never no-plan.

import { describe, expect, it, beforeEach } from 'vitest';
import {
    buildNlGfiUrl,
    parsePdokMaatvoering,
    pickGoverningDossier,
    fetchNlBestemmingsplan,
    makeNlBestemmingsplanHandler,
    __resetNlBpCache,
    NL_RP_WMS_ENDPOINT,
} from '../nlBestemmingsplanProxy.js';

// ── fixtures — the detailed plan (carries the bouwvlak + bouwhoogte) vs a thematic overlay ────────
const DETAIL_DOSSIER = 'NL.IMRO.0014.BP526Binnenstad';
const OVERLAY_DOSSIER = 'NL.IMRO.0014.BP647HerzPark2020'; // "Herziening Parkeren" — onherroepelijk, NO bouwvlak
const BESTVLAK_ID = 'NL.IMRO.0014.EP45239211345-00';

const RING = [[6.566, 53.219], [6.5665, 53.219], [6.5665, 53.2195], [6.566, 53.2195], [6.566, 53.219]];

const maatvoeringBody = {
    features: [
        {
            properties: {
                dossierid: DETAIL_DOSSIER, dossierstatus: 'geconsolideerd', datum: '2016-06-08',
                naam: 'maximum bouwhoogte (m)', maatvoering: '"maximum bouwhoogte (m)"="24"',
                bestemmingsvlak: `Enkelbestemming=${BESTVLAK_ID}`,
            },
        },
    ],
};
const enkelBody = {
    features: [{
        properties: { dossierid: DETAIL_DOSSIER, dossierstatus: 'geconsolideerd', datum: '2016-06-08', naam: 'Centrum - 1', identificatie: BESTVLAK_ID },
        geometry: { type: 'Polygon', coordinates: [RING] },
    }],
};
const bouwvlakBody = {
    features: [{ properties: { dossierid: DETAIL_DOSSIER }, geometry: { type: 'Polygon', coordinates: [RING] } }],
};
// The plangebied layer returns BOTH the detail plan AND a higher-status thematic overlay.
const gebiedBody = {
    features: [
        { properties: { dossierid: OVERLAY_DOSSIER, dossierstatus: 'geheel onherroepelijk in werking', datum: '2021-07-10', naam: 'Herziening Parkeren 2021', identificatie: `${OVERLAY_DOSSIER}-vg01` } },
        { properties: { dossierid: DETAIL_DOSSIER, dossierstatus: 'geconsolideerd', datum: '2016-06-08', naam: 'Binnenstad', identificatie: `${DETAIL_DOSSIER}-vg02` } },
    ],
};

/** A fetch double that returns the right fixture per WMS `query_layers`. */
function layerFetch(bodies: Record<string, unknown>): typeof fetch {
    return (async (url: string) => {
        const layer = new URL(url).searchParams.get('query_layers') ?? '';
        const body = bodies[layer] ?? { features: [] };
        return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
}
const ALL_LAYERS = {
    maatvoering: maatvoeringBody, enkelbestemming: enkelBody, bouwvlak: bouwvlakBody, bestemmingsplangebied: gebiedBody,
};

function invoke(handler: (req: unknown, res: unknown) => Promise<unknown>, query: Record<string, string>) {
    const headers: Record<string, string> = {};
    let status = 0;
    let body: Record<string, unknown> = {};
    const res = {
        setHeader: (k: string, v: string) => { headers[k.toLowerCase()] = v; },
        status(code: number) { status = code; return this; },
        json(payload: Record<string, unknown>) { body = payload; return this; },
    };
    return handler({ query }, res).then(() => ({ status, body, headers }));
}

beforeEach(() => __resetNlBpCache());

describe('buildNlGfiUrl — WMS 1.3.0 GetFeatureInfo at a point', () => {
    it('builds a keyless PDOK RP WMS GetFeatureInfo query in EPSG:4326 (lat,lon bbox)', () => {
        const url = buildNlGfiUrl('maatvoering', 53.2194, 6.5665);
        expect(url.startsWith(NL_RP_WMS_ENDPOINT)).toBe(true);
        const p = new URL(url).searchParams;
        expect(p.get('request')).toBe('GetFeatureInfo');
        expect(p.get('query_layers')).toBe('maatvoering');
        expect(p.get('crs')).toBe('EPSG:4326');
        expect(p.get('info_format')).toBe('application/json');
        // EPSG:4326 in WMS 1.3.0 ⇒ axis lat,lon ⇒ bbox miny(lat),minx(lon),maxy,maxx
        expect(p.get('bbox')!.split(',').map(Number)[0]).toBeCloseTo(53.2194 - 0.0004, 6);
    });
});

describe('parsePdokMaatvoering — SVBP2012 unpack', () => {
    it('unpacks the packed "<naam>"="<waarde>" string', () => {
        expect(parsePdokMaatvoering({ maatvoering: '"maximum bouwhoogte (m)"="24"' })).toEqual({ naam: 'maximum bouwhoogte (m)', waarde: '24' });
    });
    it('falls back to a bare naam with a null waarde (never invents a value)', () => {
        expect(parsePdokMaatvoering({ naam: 'maximum bouwhoogte (m)' })).toEqual({ naam: 'maximum bouwhoogte (m)', waarde: null });
    });
    it('returns null when neither is present', () => {
        expect(parsePdokMaatvoering({})).toBeNull();
    });
});

describe('pickGoverningDossier — status then date', () => {
    it('prefers onherroepelijk over vastgesteld, then the most recent date', () => {
        const bags = [
            { dossierid: 'A', dossierstatus: 'vastgesteld', datum: '2020-01-01' },
            { dossierid: 'B', dossierstatus: 'geheel onherroepelijk in werking', datum: '2018-01-01' },
        ];
        expect(pickGoverningDossier(bags)).toBe('B');
    });
    it('returns null when no dossierid is present', () => {
        expect(pickGoverningDossier([{ naam: 'x' }])).toBeNull();
    });
});

describe('fetchNlBestemmingsplan — consolidation (never throws)', () => {
    it('⚠ picks the DETAIL plan that owns the bouwvlak, NOT the higher-status thematic overlay', async () => {
        const body = await fetchNlBestemmingsplan(53.2194, 6.5665, { fetchImpl: layerFetch(ALL_LAYERS) });
        expect(body).not.toBeNull();
        expect(body!.plan.naam).toBe('Binnenstad'); // the detail plan, not "Herziening Parkeren 2021"
        expect(body!.bestemmingsvlak).toEqual({ naam: 'Centrum - 1' });
        expect(body!.bouwvlak?.geometrie?.type).toBe('Polygon');
        expect(body!.maatvoeringen).toEqual([{ naam: 'maximum bouwhoogte (m)', waarde: '24' }]);
    });

    it('no substantive plan at the point → { plan: null } (honest empty, not a failure)', async () => {
        const body = await fetchNlBestemmingsplan(52.99, 6.56, { fetchImpl: layerFetch({ bestemmingsplangebied: gebiedBody }) });
        expect(body).toEqual({ plan: null });
    });

    it('every layer errors → null (upstream failure, distinct from empty)', async () => {
        const boom = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
        const body = await fetchNlBestemmingsplan(53.2194, 6.5665, { fetchImpl: boom });
        expect(body).toBeNull();
    });
});

describe('handler — §CONTEXT-DATA-HONESTY status split', () => {
    it('200 with the consolidated body on success', async () => {
        const handler = makeNlBestemmingsplanHandler({ fetchImpl: layerFetch(ALL_LAYERS) });
        const { status, body } = await invoke(handler, { lat: '53.2194', lon: '6.5665' });
        expect(status).toBe(200);
        expect((body as { plan: { naam: string } }).plan.naam).toBe('Binnenstad');
    });

    it('502 (NOT an empty 200) when the upstream is unreachable', async () => {
        const boom = (async () => { throw new Error('down'); }) as unknown as typeof fetch;
        const handler = makeNlBestemmingsplanHandler({ fetchImpl: boom });
        const { status, body } = await invoke(handler, { lat: '53.2194', lon: '6.5665' });
        expect(status).toBe(502);
        expect((body as { error: string }).error).toMatch(/did not answer/i);
    });

    it('400 on missing coordinates', async () => {
        const handler = makeNlBestemmingsplanHandler({ fetchImpl: layerFetch(ALL_LAYERS) });
        const { status } = await invoke(handler, {});
        expect(status).toBe(400);
    });
});
