// §L-441 — SIU national classification proxy.
//
// The geometry is upstream's problem; what this proxy owns is HONESTY and RESILIENCE, so
// that is what these tests target:
//   • an unrecognised class must surface as unknown, never as a plausible neighbour;
//   • an upstream failure must not break a user mid-flow;
//   • the payload must state its granularity so nothing downstream can mistake a land class
//     for a buildable envelope.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    normaliseClaseSuelo,
    isInForce,
    siuClassificationHandler,
    __resetSiuCacheForTests,
    SIU_CLASSIFICATION_PATH,
} from '../jurisdiction/siuClassificationProxy.js';

function mockRes() {
    return {
        statusCode: null, body: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; },
    };
}
const req = (lat, lon) => ({ query: { lat: String(lat), lon: String(lon) } });

const FEATURE = (attrs) => ({
    ok: true,
    json: async () => ({ features: [{ attributes: attrs }] }),
});

beforeEach(() => { __resetSiuCacheForTests(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('§L-441 normaliseClaseSuelo', () => {
    it('maps every class SIU actually publishes', () => {
        expect(normaliseClaseSuelo('SUELO URBANO')).toBe('urbano');
        expect(normaliseClaseSuelo('SUELO URBANO NO CONSOLIDADO')).toBe('urbano_no_consolidado');
        expect(normaliseClaseSuelo('SUELO URBANIZABLE DELIMITADO O SECTORIZADO')).toBe('urbanizable_delimitado');
        expect(normaliseClaseSuelo('SUELO URBANIZABLE NO DELIMITADO O SECTORIZADO')).toBe('urbanizable_no_delimitado');
        expect(normaliseClaseSuelo('SUELO NO URBANIZABLE')).toBe('no_urbanizable');
        expect(normaliseClaseSuelo('SISTEMAS GENERALES Y OTROS')).toBe('sistemas_generales');
    });

    it('tolerates case and whitespace (upstream formatting is not a contract)', () => {
        expect(normaliseClaseSuelo('  suelo urbano  ')).toBe('urbano');
    });

    it('returns NULL for an unknown class — never a plausible guess', () => {
        // The important one. If SIU adds a class after a refresh, mapping it onto an existing
        // key would misclassify real land with full confidence and no warning.
        expect(normaliseClaseSuelo('SUELO DE NUEVA CATEGORIA')).toBeNull();
        expect(normaliseClaseSuelo('')).toBeNull();
        expect(normaliseClaseSuelo(undefined)).toBeNull();
        expect(normaliseClaseSuelo(42)).toBeNull();
    });
});

describe('§L-441 isInForce', () => {
    it('99999999 (or empty) means still in force; any real date means superseded', () => {
        expect(isInForce('99999999')).toBe(true);
        expect(isInForce('')).toBe(true);
        expect(isInForce(null)).toBe(true);
        expect(isInForce('20240101')).toBe(false);
    });
});

describe('§L-441 handler', () => {
    it('returns the classification for a real point', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => FEATURE({
            ProvINE: '08019', ClaseSuelo: 'SUELO URBANO', NuclRural: '0', FechaBaja: '99999999',
        })));
        const res = mockRes();
        await siuClassificationHandler(req(41.399507, 2.201201), res);
        expect(res.statusCode).toBe(200);
        expect(res.body.found).toBe(true);
        expect(res.body.clase).toBe('urbano');
        expect(res.body.municipioIne).toBe('08019');
        expect(res.body.inForce).toBe(true);
    });

    it('STATES ITS GRANULARITY so nothing downstream reads it as a buildable envelope', () => {
        // C58 §1.11. A land class is not permission to build, and the payload must say so on
        // its face rather than relying on every consumer to remember.
        return (async () => {
            vi.stubGlobal('fetch', vi.fn(async () => FEATURE({
                ProvINE: '28079', ClaseSuelo: 'SUELO URBANO', NuclRural: '0', FechaBaja: '99999999',
            })));
            const res = mockRes();
            await siuClassificationHandler(req(40.4168, -3.7038), res);
            expect(res.body.granularity).toBe('municipality-polygon');
            expect(res.body.source).toBe('siu');
        })();
    });

    it('surfaces an UNKNOWN class honestly — clase null, raw preserved', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => FEATURE({
            ProvINE: '08019', ClaseSuelo: 'SUELO INVENTADO', NuclRural: '0', FechaBaja: '99999999',
        })));
        const res = mockRes();
        await siuClassificationHandler(req(41.4, 2.2), res);
        expect(res.body.found).toBe(true);
        expect(res.body.clase).toBeNull();               // not guessed
        expect(res.body.claseRaw).toBe('SUELO INVENTADO'); // but not lost either
    });

    it('NEVER breaks the user mid-flow: upstream failures return 200 + a reason', async () => {
        // The parcel is already selected; the classification is enrichment. A 5xx here would
        // surface as a broken interaction over what is at worst a missing chip.
        for (const [label, impl] of [
            ['network',  async () => { throw new Error('ECONNREFUSED'); }],
            ['http-500', async () => ({ ok: false, status: 500 })],
            ['arcgis-error', async () => ({ ok: true, json: async () => ({ error: { code: 500 } }) })],
        ]) {
            __resetSiuCacheForTests();
            vi.stubGlobal('fetch', vi.fn(impl));
            const res = mockRes();
            await siuClassificationHandler(req(41.4, 2.2), res);
            expect(res.statusCode, label).toBe(200);
            expect(res.body.found, label).toBe(false);
            expect(typeof res.body.reason, label).toBe('string');
        }
    });

    it('distinguishes NO COVERAGE from a failure, and caches it', async () => {
        // "The point is outside SIU" is a real answer worth caching; a failure is not.
        const f = vi.fn(async () => ({ ok: true, json: async () => ({ features: [] }) }));
        vi.stubGlobal('fetch', f);
        const r1 = mockRes(); await siuClassificationHandler(req(0, 0), r1);
        expect(r1.body).toMatchObject({ found: false, reason: 'no-coverage' });
        const r2 = mockRes(); await siuClassificationHandler(req(0, 0), r2);
        expect(r2.body.cached).toBe(true);
        expect(f).toHaveBeenCalledTimes(1);
    });

    it('caches by rounded coordinate so panning does not hammer a government host', async () => {
        const f = vi.fn(async () => FEATURE({
            ProvINE: '08019', ClaseSuelo: 'SUELO URBANO', NuclRural: '0', FechaBaja: '99999999',
        }));
        vi.stubGlobal('fetch', f);
        await siuClassificationHandler(req(41.399507, 2.201201), mockRes());
        // ~1 m away — same 4dp cache cell, and land classes are far coarser than that.
        await siuClassificationHandler(req(41.399509, 2.201203), mockRes());
        expect(f).toHaveBeenCalledTimes(1);
    });

    it('rejects bad coordinates without calling upstream', async () => {
        const f = vi.fn();
        vi.stubGlobal('fetch', f);
        for (const [lat, lon] of [['abc', 2], [200, 2], [41, 999]]) {
            const res = mockRes();
            await siuClassificationHandler(req(lat, lon), res);
            expect(res.statusCode).toBe(400);
        }
        expect(f).not.toHaveBeenCalled();
    });

    it('exposes a stable route path', () => {
        expect(SIU_CLASSIFICATION_PATH).toBe('/api/siu/classification');
    });
});
