// §PARIS-PLU-PROXY — tests for the Ville-de-Paris PLU bioclimatique proxy (zone + hauteur + HMC + filet).
//
// Fixtures are SHAPED FROM the live 2026-07-25 probe: GPU zone_urba GeoJSON (UG), opendata plub_hauteur
// (25 m), plub_hmc (ht_hmc 85 NGF) and plub_filet (haut "N"). No live network — every test injects
// `fetchImpl`. Load-bearing property: the §CONTEXT-DATA-HONESTY split — a transport FAILURE of the two
// PRIMARY upstreams (zone + hauteur) yields 502 (endpoint-unreachable), never an EMPTY 200; and the
// HMC/filet ENRICHMENTS never flip a reachable answer to unreachable.

import { describe, expect, it, beforeEach } from 'vitest';
import {
    buildParisZoneUrbaUrl,
    buildParisHauteurUrl,
    buildParisHmcUrl,
    buildParisFiletUrl,
    buildParisEcmUrl,
    buildParisEalUrl,
    extractParisHmc,
    extractParisFilet,
    extractParisEcm,
    extractParisEal,
    extractOuterRing,
    fetchParisPlu,
    makeParisPluHandler,
    __resetParisCache,
    PARIS_HMC_ENDPOINT,
    PARIS_FILET_ENDPOINT,
    PARIS_ECM_ENDPOINT,
    PARIS_EAL_ENDPOINT,
    PARIS_FILET_RADIUS_M,
} from '../jurisdiction/parisPluProxy.js';

const zoneBody = {
    features: [{ properties: {
        libelle: 'UG', libelong: 'Zone urbaine générale', typezone: 'U',
        nomfic: '75056_reglement_20260616.pdf', idurba: '75056_PLU_20260616', datappro: null,
    } }],
};
const hauteurBody = { results: [{ hauteur: 25 }] };
const hmcBody = { results: [{ hmc: 'NGF', ht_hmc: 85.0 }] };
const filetBody = { results: [{ haut: 'N', cour: 'X' }] };
// A live-shaped ECM record: geo_shape Feature/Polygon, source area, emprise/hauteur 0 = not specified.
const ecmGeoShape = {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[[2.393, 48.882], [2.3931, 48.882], [2.3931, 48.8821], [2.393, 48.8821], [2.393, 48.882]]] },
};
const ecmBody = { results: [{ emprise: 0.0, hauteur: 0.0, st_area_shape: 83.12, c_sec: 'DL', c_asp: '19-DL-0002', n_pc: 2, geo_shape: ecmGeoShape }] };
const ealBody = { results: [{ st_area_shape: 6.6, geo_shape: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[2.3378, 48.8868], [2.3379, 48.8868], [2.3379, 48.8869], [2.3378, 48.8869], [2.3378, 48.8868]]] } } }] };

type ParisSource = 'zone' | 'hauteur' | 'hmc' | 'filet' | 'ecm' | 'eal';

/** Route a fetch to the right fixture by URL substring; `fail` set marks a transport failure per source. */
function routedFetch(fail: Set<ParisSource> = new Set()): typeof fetch {
    return (async (url: string) => {
        const which: ParisSource = url.includes('wfs') ? 'zone'
            : url.includes('plub_hmc') ? 'hmc'
            : url.includes('plub_filet') ? 'filet'
            : url.includes('plub_ecm') ? 'ecm'
            : url.includes('plub_eal') ? 'eal'
            : 'hauteur';
        if (fail.has(which)) throw new Error(`${which} down`);
        const body = which === 'zone' ? zoneBody
            : which === 'hmc' ? hmcBody
            : which === 'filet' ? filetBody
            : which === 'ecm' ? ecmBody
            : which === 'eal' ? ealBody
            : hauteurBody;
        return { ok: true, text: async () => JSON.stringify(body) };
    }) as unknown as typeof fetch;
}

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

// URLSearchParams encodes spaces as `+`; normalise so the WKT reads naturally in assertions.
const dec = (url: string) => decodeURIComponent(url).replace(/\+/g, ' ');

describe('§PARIS-PLU-PROXY URL builders — axis order + select', () => {
    it('HMC intersects URL is POINT(lon lat) and selects hmc,ht_hmc', () => {
        const url = dec(buildParisHmcUrl(48.857, 2.38));
        expect(url.startsWith(PARIS_HMC_ENDPOINT)).toBe(true);
        expect(url).toContain("intersects(geo_shape, geom'POINT(2.38 48.857)')"); // lon lat
        expect(url).toContain('select=hmc,ht_hmc');
    });

    it('filet URL uses within_distance (lines, not intersects) at the configured radius, selects haut,cour', () => {
        const url = dec(buildParisFiletUrl(48.857, 2.38));
        expect(url.startsWith(PARIS_FILET_ENDPOINT)).toBe(true);
        expect(url).toContain(`within_distance(geo_shape, geom'POINT(2.38 48.857)', ${PARIS_FILET_RADIUS_M}m)`);
        expect(url).toContain('select=haut,cour');
    });

    it('ECM URL is point-INTERSECTS POINT(lon lat) and selects the footprint geometry + fields', () => {
        const url = dec(buildParisEcmUrl(48.857, 2.38));
        expect(url.startsWith(PARIS_ECM_ENDPOINT)).toBe(true);
        expect(url).toContain("intersects(geo_shape, geom'POINT(2.38 48.857)')"); // lon lat
        expect(url).toContain('geo_shape');
        expect(url).toContain('st_area_shape');
    });

    it('EAL URL is point-INTERSECTS POINT(lon lat) and selects st_area_shape + geo_shape', () => {
        const url = dec(buildParisEalUrl(48.857, 2.38));
        expect(url.startsWith(PARIS_EAL_ENDPOINT)).toBe(true);
        expect(url).toContain("intersects(geo_shape, geom'POINT(2.38 48.857)')");
        expect(url).toContain('geo_shape');
    });

    it('the two axis orders stay DIFFERENT: WFS wants POINT(lat lon), opendata POINT(lon lat)', () => {
        expect(dec(buildParisZoneUrbaUrl(48.857, 2.38))).toContain('POINT(48.857 2.38)');
        expect(dec(buildParisHauteurUrl(48.857, 2.38))).toContain('POINT(2.38 48.857)');
    });
});

describe('§PARIS-PLU-PROXY extractors — HMC datum kept, filet code kept, empty → null', () => {
    it('extractParisHmc reads ht_hmc as the number and carries its NGF datum (not a relative height)', () => {
        expect(extractParisHmc(hmcBody)).toEqual({ hmc_m: 85, datum: 'NGF' });
    });
    it('extractParisHmc withholds on absent/non-positive ht_hmc', () => {
        expect(extractParisHmc({ results: [] })).toBeNull();
        expect(extractParisHmc({ results: [{ hmc: 'NGF', ht_hmc: 0 }] })).toBeNull();
    });
    it('extractParisFilet upper-cases haut + cour, withholds on empty', () => {
        expect(extractParisFilet(filetBody)).toEqual({ code: 'N', cour: 'X' });
        expect(extractParisFilet({ results: [{ haut: 'l' }] })).toEqual({ code: 'L', cour: null });
        expect(extractParisFilet({ results: [{ cour: 'c' }] })).toEqual({ code: null, cour: 'C' });
        expect(extractParisFilet({ results: [] })).toBeNull();
    });
});

describe('§PARIS-PLU-PROXY ECM/EAL extractors — real footprint geometry, 0.0 = not specified → null', () => {
    it('extractOuterRing pulls the outer ring of a Feature/Polygon geo_shape as [lon,lat] pairs', () => {
        const ring = extractOuterRing(ecmGeoShape);
        expect(ring).not.toBeNull();
        expect(ring!.length).toBe(5);
        expect(ring![0]).toEqual([2.393, 48.882]);
        expect(extractOuterRing(null)).toBeNull();
        expect(extractOuterRing({ geometry: { type: 'Polygon', coordinates: [[[1, 2]]] } })).toBeNull(); // < 3 pts
    });

    it('extractParisEcm returns the ring + source area; maps emprise/hauteur 0.0 → null (not specified)', () => {
        const ecm = extractParisEcm(ecmBody);
        expect(ecm).not.toBeNull();
        expect(ecm!.ring.length).toBe(5);
        expect(ecm!.areaM2).toBe(83.12);
        expect(ecm!.emprisePct).toBeNull(); // 0.0 = not specified
        expect(ecm!.graphicHeight).toBeNull(); // 0.0 = not specified
        expect(ecm!.cadastral).toBe('19-DL-0002');
        expect(extractParisEcm({ results: [] })).toBeNull();
        expect(extractParisEcm({ results: [{ st_area_shape: 50 }] })).toBeNull(); // no geometry → no footprint
    });

    it('extractParisEal returns the strip ring + area, or null', () => {
        const eal = extractParisEal(ealBody);
        expect(eal).not.toBeNull();
        expect(eal!.ring.length).toBe(5);
        expect(eal!.areaM2).toBe(6.6);
        expect(extractParisEal({ results: [] })).toBeNull();
    });
});

describe('§PARIS-PLU-PROXY fetchParisPlu — combined body + reachability honesty', () => {
    it('all six upstreams up → combined { zone, hauteur, hmc, filet, ecm, eal }', async () => {
        const body = await fetchParisPlu(48.857, 2.38, { fetchImpl: routedFetch() });
        expect(body).not.toBeNull();
        expect(body!.zone?.libelle).toBe('UG');
        expect(body!.hauteur).toEqual({ hauteur_m: 25 });
        expect(body!.hmc).toEqual({ hmc_m: 85, datum: 'NGF' });
        expect(body!.filet).toEqual({ code: 'N', cour: 'X' });
        expect(body!.ecm?.ring.length).toBe(5);
        expect(body!.ecm?.areaM2).toBe(83.12);
        expect(body!.eal?.areaM2).toBe(6.6);
    });

    it('ECM/EAL down but zone + hauteur up → still 200-shaped body, ECM/EAL null (never unreachable)', async () => {
        const body = await fetchParisPlu(48.857, 2.38, { fetchImpl: routedFetch(new Set(['hmc', 'filet', 'ecm', 'eal'])) });
        expect(body).not.toBeNull();
        expect(body!.zone?.libelle).toBe('UG');
        expect(body!.hmc).toBeNull();
        expect(body!.filet).toBeNull();
        expect(body!.ecm).toBeNull();
        expect(body!.eal).toBeNull();
    });

    it('BOTH primary upstreams (zone + hauteur) down → null (the 502 / endpoint-unreachable verdict)', async () => {
        const body = await fetchParisPlu(48.857, 2.38, { fetchImpl: routedFetch(new Set(['zone', 'hauteur'])) });
        expect(body).toBeNull();
    });
});

describe('§PARIS-PLU-PROXY handler — 200 carries the enriched payload, 502 stays distinct', () => {
    beforeEach(() => __resetParisCache());

    it('GET with valid coords → 200 { zone, hauteur, hmc, filet, ecm, eal }', async () => {
        const handler = makeParisPluHandler({ fetchImpl: routedFetch() });
        const { status, body } = await invoke(handler as never, { lat: '48.857', lon: '2.38' });
        expect(status).toBe(200);
        expect((body as { zone?: { libelle?: string } }).zone?.libelle).toBe('UG');
        expect(body.hmc).toEqual({ hmc_m: 85, datum: 'NGF' });
        expect(body.filet).toEqual({ code: 'N', cour: 'X' });
        expect((body as { ecm?: { areaM2?: number } }).ecm?.areaM2).toBe(83.12);
        expect((body as { eal?: { areaM2?: number } }).eal?.areaM2).toBe(6.6);
    });

    it('both primary upstreams down → 502 (NOT an empty 200)', async () => {
        const handler = makeParisPluHandler({ fetchImpl: routedFetch(new Set(['zone', 'hauteur'])) });
        const { status, body } = await invoke(handler as never, { lat: '48.857', lon: '2.38' });
        expect(status).toBe(502);
        expect(body.error).toBeTruthy();
    });

    it('missing coords → 400', async () => {
        const handler = makeParisPluHandler({ fetchImpl: routedFetch() });
        const { status } = await invoke(handler as never, {});
        expect(status).toBe(400);
    });
});
