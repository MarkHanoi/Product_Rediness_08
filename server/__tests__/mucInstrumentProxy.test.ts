// §MUC-INSTRUMENT-PROXY (L-658) — tests for the Catalonia-wide governing-instrument lookup.
//
// The fixtures below are SHAPED FROM REAL RESPONSE BODIES probed live on 2026-07-31 against
// `https://sig.gencat.cat/ows/MUC/wms` (layers `MUCVW_AMBIT_PG_INE` and `MUCVW_MUCS_TM`) — not
// from documentation. Every `TIPUS` string is quoted verbatim, INCLUDING its 40-character
// truncation, because that truncation is exactly what a docs-derived equality table would miss.
//
// The behaviour under test is mostly REFUSAL and ATTRIBUTION. Naming the wrong governing
// instrument is a wrong-jurisdiction answer, which is worse than admitting we do not know — so the
// selector must decline far more often than it commits.

import { describe, expect, it, beforeEach } from 'vitest';
import {
    normaliseTipus,
    classifyInstrumentTipus,
    rpucCodiPublic,
    selectMunicipality,
    selectGoverningInstrument,
    buildInstrumentInfoUrl,
    fetchInstrumentAtPoint,
    makeMucInstrumentHandler,
    __resetMucInstrumentCache,
    mucInstrumentCacheStats,
    MUC_AMBIT_PG_LAYER,
    MUC_TERME_MUNICIPAL_LAYER,
    MUC_INSTRUMENT_FEATURE_COUNT,
} from '../mucInstrumentProxy.js';

/** A square ring around (lon, lat) with the given half-size in degrees. */
const square = (lon: number, lat: number, h: number): number[][] => [
    [lon - h, lat - h], [lon + h, lat - h], [lon + h, lat + h], [lon - h, lat + h], [lon - h, lat - h],
];

/** Girona, Barri Vell — the point the live probe resolved to Girona's Revisió del PGOU. */
const GIRONA = { lat: 41.9847, lon: 2.8249 };

function ambit(expedient: string, tipus: string, ine: string, ring: number[][]) {
    return {
        type: 'Feature',
        geometry: { type: 'MultiPolygon', coordinates: [[ring]] },
        properties: {
            EXPEDIENT: expedient,
            TIPUS: tipus,
            IND_EXTERN: 'S',
            CODI_INE: ine,
            ACCES_RPUC:
                'http://dtes.gencat.cat/rpucportal/AppJava/cercaExpedient.do?reqCode=veureExpedient&codiPublic=' +
                expedient.replace(/\s/g, ''),
        },
    };
}

function terme(ine: string, municipi: string, ring: number[][]) {
    return {
        type: 'Feature',
        geometry: { type: 'MultiPolygon', coordinates: [[ring]] },
        properties: { ID: 1, CODI_INE: ine, MUNICIPI: municipi },
    };
}

const fc = (features: unknown[]) => ({ type: 'FeatureCollection', features });

// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('§MUC-INSTRUMENT-PROXY normaliseTipus / classifyInstrumentTipus', () => {
    it('strips diacritics and unifies apostrophes so the register’s own strings match', () => {
        expect(normaliseTipus("Pla d'ordenació urbanística municipal ")).toBe(
            "pla d'ordenacio urbanistica municipal",
        );
        expect(normaliseTipus('Modificació normes subsidiàries')).toBe(
            'modificacio normes subsidiaries',
        );
        // The register mixes typographic and ASCII apostrophes.
        expect(normaliseTipus('Pla d’ordenació urbanística municipal')).toBe(
            "pla d'ordenacio urbanistica municipal",
        );
        for (const bad of [null, undefined, 42, '']) {
            expect(normaliseTipus(bad as unknown as string)).toBe('');
        }
    });

    it('classifies every TIPUS the statewide scan actually found — VERBATIM, truncation included', () => {
        // ⚠ These 21 strings are the complete distinct `TIPUS` set over all 8 396 expedients,
        // quoted exactly as the service returns them. Several are cut mid-word at 40 characters —
        // which is precisely why matching is by PREFIX and why an equality table would match none.
        const CASES: ReadonlyArray<readonly [string, string]> = [
            // ── the BASE general-planning instruments — what "governs" means ──
            ["Pla d'ordenació urbanística municipal ", 'general-plan'],
            ["Revisió pla d'ordenació urbanística muni", 'general-plan'],
            ["Pla general d'ordenació urbana", 'general-plan'],
            ['Revisió pla general ordenació urbana mun', 'general-plan'],
            ['Normes subsidiàries tipus a i tipus b', 'general-plan'],
            ['Revisió-adaptació normes subsidiàries', 'general-plan'],
            ['Normes de planejament urbanístic', 'general-plan'],
            ['Normes complementàries', 'general-plan'],
            ['Text refós normes urbaníst  planej gral', 'general-plan'],
            ['Delimitació de sòl urbà', 'general-plan'],
            // ── modifications: real and in force, but NOT the base instrument ──
            ["Modificació de pla general d'ordenació ", 'modification'],
            ['Modificació normes subsidiàries', 'modification'],
            ['Modificació pla ordenació urbanística mu', 'modification'],
            ['Modificació normes planejament urbanísti', 'modification'],
            ['Modificació delimitació de sòl urbà', 'modification'],
            // ⚠ starts with a token that also opens a supra-municipal family — must stay a
            // modification, which is why the `modificacio` rule is FIRST in the table.
            ['Modificació del pla director urbanístic', 'modification'],
            // ── supra-municipal ──
            ['Pla director urbanístic', 'supramunicipal'],
            ['Pla territorial general/sectorial ', 'supramunicipal'],
            // ── delivery programmes, not plans ──
            ["Programa d'actuació urbanística", 'programme'],
            ['Programa actuació urbanística municipal ', 'programme'],
            ['Revisió programa actuació pla general', 'programme'],
        ];
        expect(CASES).toHaveLength(21);
        for (const [tipus, kind] of CASES) {
            expect(classifyInstrumentTipus(tipus).kind, tipus).toBe(kind);
        }
    });

    it('an UNRECOGNISED TIPUS is `unclassified` — never promoted, never silently dropped', () => {
        for (const t of ['Instrument que ningú ha vist', '', '   ', null, undefined]) {
            const c = classifyInstrumentTipus(t as unknown as string);
            expect(c.kind, String(t)).toBe('unclassified');
            expect(c.family, String(t)).toBeNull();
        }
    });

    it('every general-plan classification carries a human family name for the citation', () => {
        const c = classifyInstrumentTipus("Pla d'ordenació urbanística municipal ");
        expect(c.family).toMatch(/POUM/);
    });
});

describe('§MUC-INSTRUMENT-PROXY rpucCodiPublic', () => {
    it('collapses a sub-referenced expedient onto the plan it belongs to', () => {
        // Measured at Girona: the SAME plan comes back as two containing rows, and both ACCES_RPUC
        // links carry the identical codiPublic. Deduplicating on the raw EXPEDIENT would report one
        // plan twice and make a single-instrument municipality look ambiguous.
        expect(rpucCodiPublic('2001 / 001092 / G')).toBe('2001/001092/G');
        expect(rpucCodiPublic('2001 / 001092 / G / 00037')).toBe('2001/001092/G');
        expect(rpucCodiPublic('2001 / 001092 / G')).toBe(rpucCodiPublic('2001 / 001092 / G / 00037'));
    });

    it('returns null rather than guessing on a malformed reference', () => {
        for (const bad of ['', '2001', '2001 / 001092', null, undefined, 7]) {
            expect(rpucCodiPublic(bad as unknown as string), String(bad)).toBeNull();
        }
    });
});

describe('§MUC-INSTRUMENT-PROXY selectMunicipality — one container or refuse', () => {
    const ring = square(GIRONA.lon, GIRONA.lat, 0.02);

    it('resolves the single containing terme municipal', () => {
        const m = selectMunicipality(fc([terme('17079', 'Girona', ring)]), GIRONA.lon, GIRONA.lat);
        expect(m).toEqual({ ineCode: '17079', municipalityName: 'Girona' });
    });

    it('refuses when NOTHING contains the point (at sea, or outside Catalonia)', () => {
        const far = square(0.5, 40.0, 0.01);
        expect(selectMunicipality(fc([terme('17079', 'Girona', far)]), GIRONA.lon, GIRONA.lat)).toBeNull();
        expect(selectMunicipality(fc([]), GIRONA.lon, GIRONA.lat)).toBeNull();
    });

    it('refuses an AMBIGUOUS point rather than picking a side of a municipal boundary', () => {
        // The municipality is what every sentence of the refusal is addressed to; guessing it
        // mis-addresses the whole card.
        const both = fc([terme('17079', 'Girona', ring), terme('17999', 'Neighbour', ring)]);
        expect(selectMunicipality(both, GIRONA.lon, GIRONA.lat)).toBeNull();
    });

    it('refuses a feature with no INE code — it tells us nothing', () => {
        const noIne = { ...terme('17079', 'Girona', ring) };
        (noIne.properties as Record<string, unknown>).CODI_INE = '   ';
        expect(selectMunicipality(fc([noIne]), GIRONA.lon, GIRONA.lat)).toBeNull();
    });

    it('never throws on a malformed collection', () => {
        for (const bad of [null, undefined, {}, { features: 'nope' }]) {
            expect(selectMunicipality(bad as never, GIRONA.lon, GIRONA.lat)).toBeNull();
        }
    });
});

describe('§MUC-INSTRUMENT-PROXY selectGoverningInstrument', () => {
    const near = square(GIRONA.lon, GIRONA.lat, 0.02);
    /** A polygon that does NOT contain the query point. */
    const away = square(GIRONA.lon + 1.5, GIRONA.lat + 0.5, 0.02);

    it('resolves the CONFIRMED municipal general plan, deduplicating its sub-reference', () => {
        const sel = selectGoverningInstrument(
            fc([
                ambit('2001 / 001092 / G', 'Revisió pla general ordenació urbana mun', '17079', near),
                ambit('2001 / 001092 / G / 00037', 'Revisió pla general ordenació urbana mun', '17079', near),
                ambit('2004 / 014960 / G', "Modificació de pla general d'ordenació ", '17079', near),
                ambit('2018 / 067068 / C', 'Pla director urbanístic', '43004', near),
            ]),
            GIRONA.lon,
            GIRONA.lat,
            '17079',
        );
        expect(sel.outcome).toBe('resolved');
        expect(sel.ambiguous).toBe(false);
        expect(sel.governingInstrument?.expedient).toBe('2001 / 001092 / G');
        expect(sel.governingInstrument?.confirmed).toBe(true);
        expect(sel.governingInstrument?.rpucUrl).toContain('rpucportal');
        // the human family name, not the truncated raw string
        expect(sel.governingInstrument?.tipus).toMatch(/PGOU/);
        // ⚠ FOUR rows went in and THREE come out: the sub-referenced duplicate
        // ('2001 / 001092 / G / 00037') collapsed onto its parent plan. That collapse is the whole
        // reason `rpucCodiPublic` exists — without it this municipality would look AMBIGUOUS, and
        // an ambiguity is reported as "PRYZM will not say which plan governs".
        expect(sel.allContaining).toHaveLength(3);
        expect(sel.allContaining.filter((r) => r.kind === 'general-plan')).toHaveLength(1);
        // …and the modification and the supra-municipal PDU are REPORTED as provenance, while
        // being excluded from the governing-plan decision.
        expect(sel.allContaining.map((r) => r.kind).sort()).toEqual([
            'general-plan',
            'modification',
            'supramunicipal',
        ]);
    });

    it('NEVER filters by CODI_INE — a metropolitan instrument filed elsewhere still counts', () => {
        // ⚠ THE MEASURED TRAP. '1985/000604/B' is filed under Badalona (08015) and its àmbit spans
        // ~32 × 34 km INCLUDING Barcelona. Filtering by CODI_INE would hide it everywhere but
        // Badalona. It must survive the filter — and be reported UNCONFIRMED.
        const sel = selectGoverningInstrument(
            fc([ambit('1985 / 000604 / B', "Pla general d'ordenació urbana", '08015', near)]),
            GIRONA.lon,
            GIRONA.lat,
            '17079',
        );
        expect(sel.outcome).toBe('resolved');
        expect(sel.governingInstrument?.expedient).toBe('1985 / 000604 / B');
        expect(sel.governingInstrument?.confirmed).toBe(false);
        expect(sel.governingInstrument?.filedUnderIne).toBe('08015');
    });

    it('DOES filter by geometry — a non-containing expedient is discarded', () => {
        const sel = selectGoverningInstrument(
            fc([ambit('2001 / 001092 / G', 'Revisió pla general ordenació urbana mun', '17079', away)]),
            GIRONA.lon,
            GIRONA.lat,
            '17079',
        );
        expect(sel.outcome).toBe('no-base-instrument-registered');
        expect(sel.governingInstrument).toBeNull();
        expect(sel.allContaining).toEqual([]);
    });

    it('reports `no-base-instrument-registered` when only modifications contain the point', () => {
        // ⚠ BARCELONA'S REAL CASE, and it is a FACT rather than a failure: the PGM-1976 predates
        // the register, so the register genuinely lists only modifications there.
        const sel = selectGoverningInstrument(
            fc([
                ambit('2018 / 067642 / B', "Modificació de pla general d'ordenació ", '08019', near),
                ambit('2010 / 041406 / B', 'Pla territorial general/sectorial ', '08019', near),
                ambit('2018 / 067068 / C', 'Pla director urbanístic', '43004', near),
            ]),
            GIRONA.lon,
            GIRONA.lat,
            '08019',
        );
        expect(sel.outcome).toBe('no-base-instrument-registered');
        expect(sel.governingInstrument).toBeNull();
        // …but the containing instruments are still reported as provenance.
        expect(sel.allContaining).toHaveLength(3);
    });

    it('flags AMBIGUOUS when two DIFFERENT confirmed plans both contain the point', () => {
        const sel = selectGoverningInstrument(
            fc([
                ambit('2001 / 001092 / G', 'Revisió pla general ordenació urbana mun', '17079', near),
                ambit('2016 / 062086 / N', "Pla d'ordenació urbanística municipal ", '17079', near),
            ]),
            GIRONA.lon,
            GIRONA.lat,
            '17079',
        );
        expect(sel.outcome).toBe('resolved');
        expect(sel.ambiguous).toBe(true);
    });

    it('prefers a CONFIRMED plan over an unconfirmed one that also contains the point', () => {
        const sel = selectGoverningInstrument(
            fc([
                ambit('1985 / 000604 / B', "Pla general d'ordenació urbana", '08015', near),
                ambit('2001 / 001092 / G', 'Revisió pla general ordenació urbana mun', '17079', near),
            ]),
            GIRONA.lon,
            GIRONA.lat,
            '17079',
        );
        expect(sel.governingInstrument?.expedient).toBe('2001 / 001092 / G');
        expect(sel.governingInstrument?.confirmed).toBe(true);
    });

    it('never throws on malformed input, and skips rows with no expedient', () => {
        expect(selectGoverningInstrument(null as never, 0, 0, null).outcome).toBe(
            'no-base-instrument-registered',
        );
        const blank = ambit('   ', "Pla d'ordenació urbanística municipal ", '17079', near);
        const sel = selectGoverningInstrument(fc([blank]), GIRONA.lon, GIRONA.lat, '17079');
        expect(sel.allContaining).toEqual([]);
    });
});

describe('§MUC-INSTRUMENT-PROXY buildInstrumentInfoUrl', () => {
    it('queries in CRS:84 (lon,lat) — never a bare EPSG:4326 bbox', () => {
        // ⚠ A bare 4326 bbox against a projected layer on this GeoServer returns SILENTLY EMPTY,
        // which is the failure mode that looks exactly like an answer.
        const url = buildInstrumentInfoUrl(MUC_AMBIT_PG_LAYER, GIRONA.lat, GIRONA.lon, 60);
        const q = new URL(url).searchParams;
        expect(q.get('crs')).toBe('CRS:84');
        expect(q.get('request')).toBe('GetFeatureInfo');
        expect(q.get('layers')).toBe(MUC_AMBIT_PG_LAYER);
        expect(q.get('query_layers')).toBe(MUC_AMBIT_PG_LAYER);
        expect(q.get('info_format')).toBe('application/json');
        expect(q.get('feature_count')).toBe('60');
        // lon-first, and centred on the point
        const [minLon, minLat, maxLon, maxLat] = q.get('bbox')!.split(',').map(Number);
        expect((minLon + maxLon) / 2).toBeCloseTo(GIRONA.lon, 6);
        expect((minLat + maxLat) / 2).toBeCloseTo(GIRONA.lat, 6);
        expect(minLon).toBeLessThan(maxLon);
        expect(minLat).toBeLessThan(maxLat);
    });

    it('asks for enough candidates that a dense municipality cannot truncate the base plan out', () => {
        // Measured worst case (Lleida centre) was 12 containing expedients.
        expect(MUC_INSTRUMENT_FEATURE_COUNT).toBeGreaterThanOrEqual(30);
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §CONTEXT-DATA-HONESTY — a fetch failure and a genuine empty must never be the same value.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const near = square(GIRONA.lon, GIRONA.lat, 0.02);

/** A fake fetch that answers per layer. `null` body means "make this layer fail". */
function fakeFetch(byLayer: Record<string, unknown | null>, opts: { status?: number } = {}) {
    return async (url: string) => {
        const layer = new URL(url).searchParams.get('layers')!;
        const body = byLayer[layer];
        if (body === null) {
            return { ok: false, status: opts.status ?? 503, text: async () => 'upstream down' };
        }
        return { ok: true, status: 200, text: async () => JSON.stringify(body) };
    };
}

describe('§MUC-INSTRUMENT-PROXY fetchInstrumentAtPoint — the two halves degrade independently', () => {
    const TM_OK = fc([terme('17079', 'Girona', near)]);
    const PG_OK = fc([ambit('2001 / 001092 / G', 'Revisió pla general ordenació urbana mun', '17079', near)]);

    it('resolves both halves on a good day', async () => {
        const r = await fetchInstrumentAtPoint(GIRONA.lat, GIRONA.lon, {
            fetchImpl: fakeFetch({ [MUC_TERME_MUNICIPAL_LAYER]: TM_OK, [MUC_AMBIT_PG_LAYER]: PG_OK }),
        });
        expect(r!.municipalityLookup).toBe('resolved');
        expect(r!.municipality).toEqual({ ineCode: '17079', municipalityName: 'Girona' });
        expect(r!.instrumentLookup).toBe('resolved');
        expect(r!.governingInstrument?.confirmed).toBe(true);
    });

    it('an INSTRUMENT-layer failure does not become "no instrument here"', async () => {
        const r = await fetchInstrumentAtPoint(GIRONA.lat, GIRONA.lon, {
            fetchImpl: fakeFetch({ [MUC_TERME_MUNICIPAL_LAYER]: TM_OK, [MUC_AMBIT_PG_LAYER]: null }),
        });
        expect(r!.instrumentLookup).toBe('unresolved');
        expect(r!.instrumentLookup).not.toBe('no-base-instrument-registered');
        expect(r!.governingInstrument).toBeNull();
        // ⚠ the municipality half still answered — it must not be dragged down with it
        expect(r!.municipalityLookup).toBe('resolved');
        expect(r!.municipality?.municipalityName).toBe('Girona');
    });

    it('a MUNICIPALITY-layer failure does not become "not in Catalonia"', async () => {
        const r = await fetchInstrumentAtPoint(GIRONA.lat, GIRONA.lon, {
            fetchImpl: fakeFetch({ [MUC_TERME_MUNICIPAL_LAYER]: null, [MUC_AMBIT_PG_LAYER]: PG_OK }),
        });
        expect(r!.municipalityLookup).toBe('unresolved');
        expect(r!.municipalityLookup).not.toBe('no-municipality-at-point');
        expect(r!.municipality).toBeNull();
        // …and with no municipality to compare against, the instrument cannot be CONFIRMED.
        expect(r!.instrumentLookup).toBe('resolved');
        expect(r!.governingInstrument?.confirmed).toBe(false);
    });

    it('a GENUINE empty (the open sea) is distinct from every failure', async () => {
        const r = await fetchInstrumentAtPoint(41.3, 2.3, {
            fetchImpl: fakeFetch({ [MUC_TERME_MUNICIPAL_LAYER]: fc([]), [MUC_AMBIT_PG_LAYER]: fc([]) }),
        });
        expect(r!.municipalityLookup).toBe('no-municipality-at-point');
        expect(r!.instrumentLookup).toBe('no-base-instrument-registered');
        expect(r!.municipalityLookup).not.toBe('unresolved');
        expect(r!.instrumentLookup).not.toBe('unresolved');
    });

    it('a ServiceExceptionReport (non-JSON) is a FAILURE, never an empty', async () => {
        const xml = async () => ({
            ok: true,
            status: 200,
            text: async () => '<?xml version="1.0"?><ServiceExceptionReport><ServiceException/></ServiceExceptionReport>',
        });
        const r = await fetchInstrumentAtPoint(GIRONA.lat, GIRONA.lon, { fetchImpl: xml as never });
        expect(r!.instrumentLookup).toBe('unresolved');
        expect(r!.municipalityLookup).toBe('unresolved');
    });

    it('refuses a non-finite coordinate rather than querying with NaN', async () => {
        for (const [lat, lon] of [[Number.NaN, 2.1], [41.9, Number.POSITIVE_INFINITY]] as const) {
            expect(await fetchInstrumentAtPoint(lat, lon, { fetchImpl: (() => { throw new Error('must not fetch'); }) as never })).toBeNull();
        }
    });
});

describe('§MUC-INSTRUMENT-PROXY handler', () => {
    const TM_OK = fc([terme('17079', 'Girona', near)]);
    const PG_OK = fc([ambit('2001 / 001092 / G', 'Revisió pla general ordenació urbana mun', '17079', near)]);

    beforeEach(() => __resetMucInstrumentCache());

    function res() {
        const out: { status?: number; body?: unknown; headers: Record<string, string> } = { headers: {} };
        return {
            out,
            setHeader(k: string, v: string) { out.headers[k] = v; },
            status(s: number) { out.status = s; return this; },
            json(b: unknown) { out.body = b; return this; },
        };
    }

    it('400s on missing or unparseable coordinates', async () => {
        const h = makeMucInstrumentHandler({ fetchImpl: (() => { throw new Error('must not fetch'); }) as never });
        for (const query of [{}, { lat: 'x', lon: '2' }, { lat: '41.9' }]) {
            const r = res();
            await h({ query } as never, r as never);
            expect(r.out.status).toBe(400);
        }
    });

    it('answers 200 with a NAMED outcome and caches only a success', async () => {
        const h = makeMucInstrumentHandler({
            fetchImpl: fakeFetch({ [MUC_TERME_MUNICIPAL_LAYER]: TM_OK, [MUC_AMBIT_PG_LAYER]: PG_OK }),
        });
        const r1 = res();
        await h({ query: { lat: String(GIRONA.lat), lon: String(GIRONA.lon) } } as never, r1 as never);
        expect(r1.out.status).toBe(200);
        expect((r1.out.body as Record<string, unknown>).instrumentLookup).toBe('resolved');
        expect(r1.out.headers['X-Muc-Instrument-Cache']).toBe('MISS');
        expect(mucInstrumentCacheStats().size).toBe(1);

        const r2 = res();
        await h({ query: { lat: String(GIRONA.lat), lon: String(GIRONA.lon) } } as never, r2 as never);
        expect(r2.out.headers['X-Muc-Instrument-Cache']).toBe('HIT');
    });

    it('⚠ NEVER caches a failure — one outage must not become a week-long "fact"', async () => {
        const h = makeMucInstrumentHandler({
            fetchImpl: fakeFetch({ [MUC_TERME_MUNICIPAL_LAYER]: TM_OK, [MUC_AMBIT_PG_LAYER]: null }),
        });
        const r = res();
        await h({ query: { lat: String(GIRONA.lat), lon: String(GIRONA.lon) } } as never, r as never);
        expect(r.out.status).toBe(200);
        expect((r.out.body as Record<string, unknown>).instrumentLookup).toBe('unresolved');
        expect(r.out.headers['X-Muc-Instrument-Cache']).toBe('MISS-UNRESOLVED');
        expect(r.out.headers['Cache-Control']).toMatch(/no-store/);
        expect(mucInstrumentCacheStats().size).toBe(0);
    });

    it('never returns a bare null body — every outcome is a named value the client can render', async () => {
        const h = makeMucInstrumentHandler({
            fetchImpl: fakeFetch({ [MUC_TERME_MUNICIPAL_LAYER]: fc([]), [MUC_AMBIT_PG_LAYER]: fc([]) }),
        });
        const r = res();
        await h({ query: { lat: '41.3', lon: '2.3' } } as never, r as never);
        const body = r.out.body as Record<string, unknown>;
        expect(body).not.toBeNull();
        expect(typeof body.municipalityLookup).toBe('string');
        expect(typeof body.instrumentLookup).toBe('string');
    });
});
