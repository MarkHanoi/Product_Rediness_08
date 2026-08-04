// Zaragoza — `resolveZaragozaZone`: the IDEZar `urbanismo:Calificaciones_Urbanas` point resolver.
//
// The compliance-critical seam turned pure: given FIXTURE WFS GeoJSON (NEVER a live call — every
// test injects `fetchImpl`), the parse is deterministic. Fixtures mirror the shapes measured live
// this session (`tools/ogc-layer-census/probe_zaragoza_subgrado.py`,
// `out/zaragoza_subgrado_census.json`): the `calificacion` attribute carries codes like `A1/3.1`
// and `A1/1`. These tests pin the honesty properties in the resolver header: never throws, a
// matched-but-unpacked code resolves `ok: true` rather than being silently dropped, and a failure
// vs. an empty answer stay distinct reasons.

import { describe, it, expect } from 'vitest';
import { resolveZaragozaZone } from '../src/providers/resolveZaragozaZone.js';

const PT = { lat: 41.6488, lon: -0.8891 }; // a point inside Zaragoza's término municipal.

/** A GeoJSON FeatureCollection with one feature carrying `properties`. */
const fc = (properties: Record<string, unknown>) => ({ features: [{ properties }] });

function stubFetch(body: unknown, ok = true): { fetchImpl: typeof fetch; calls: () => number } {
    let calls = 0;
    const fetchImpl = (async () => {
        calls++;
        return { ok, json: async () => body };
    }) as unknown as typeof fetch;
    return { fetchImpl, calls: () => calls };
}

describe('resolveZaragozaZone — the Calificaciones_Urbanas point resolve', () => {
    it('resolves a PACKED grade (A1/3.1) with its descripcion', async () => {
        const { fetchImpl } = stubFetch(
            fc({
                calificacion: 'A1/3.1',
                descripcion: 'A1/3.1: Edificación en manzana cerrada. Barrios periféricos',
            }),
        );
        const res = await resolveZaragozaZone(PT, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.resolution.zoneCode).toBe('A1/3.1');
            expect(res.resolution.descripcion).toBe(
                'A1/3.1: Edificación en manzana cerrada. Barrios periféricos',
            );
        }
    });

    it('resolves a MATCHED-BUT-UNPACKED grade (A1/1) rather than dropping it (honesty property 3)', async () => {
        const { fetchImpl } = stubFetch(
            fc({
                calificacion: 'A1/1',
                descripcion:
                    'A1/1: Edificación en manzana cerrada. Trama de ensanche con ordenación gráfica de fondo edificable',
            }),
        );
        const res = await resolveZaragozaZone(PT, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.resolution.zoneCode).toBe('A1/1');
        }
    });

    it('a feature with no descripcion still resolves the code, with descripcion null', async () => {
        const { fetchImpl } = stubFetch(fc({ calificacion: 'EQ' }));
        const res = await resolveZaragozaZone(PT, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.resolution.zoneCode).toBe('EQ');
            expect(res.resolution.descripcion).toBeNull();
        }
    });

    it('a missing point refuses WITHOUT fetching', async () => {
        const { fetchImpl, calls } = stubFetch(fc({ calificacion: 'A1/3.1' }));
        const res = await resolveZaragozaZone(null, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-point');
        expect(calls()).toBe(0);
    });

    it('a non-finite point refuses WITHOUT fetching', async () => {
        const { fetchImpl, calls } = stubFetch(fc({ calificacion: 'A1/3.1' }));
        const res = await resolveZaragozaZone({ lat: Number.NaN, lon: -0.8 }, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-point');
        expect(calls()).toBe(0);
    });

    it('no feature at the point → `no-zone` (an EMPTY answer, not a failure)', async () => {
        const { fetchImpl } = stubFetch({ features: [] });
        const res = await resolveZaragozaZone(PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-zone');
    });

    it('a feature with no usable `calificacion` value → `no-zone`', async () => {
        const { fetchImpl } = stubFetch(fc({ calificacion: '' }));
        const res = await resolveZaragozaZone(PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-zone');
    });

    it('an upstream non-OK response → `endpoint-unreachable` (a FAILURE, distinct from empty), never throws', async () => {
        const { fetchImpl } = stubFetch(fc({ calificacion: 'A1/3.1' }), false);
        const res = await resolveZaragozaZone(PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });

    it('a THROWING fetch → `endpoint-unreachable`, never throws into the caller', async () => {
        const throwFetch = (async () => {
            throw new Error('network down');
        }) as unknown as typeof fetch;
        await expect(
            resolveZaragozaZone(PT, { fetchImpl: throwFetch }),
        ).resolves.toMatchObject({ ok: false, reason: 'endpoint-unreachable' });
    });

    it('no fetch implementation available → `endpoint-unreachable`, never throws', async () => {
        const original = globalThis.fetch;
        // @ts-expect-error — deliberately removing fetch to exercise the no-fetch guard.
        delete globalThis.fetch;
        try {
            const res = await resolveZaragozaZone(PT, {});
            expect(res.ok).toBe(false);
            if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
        } finally {
            globalThis.fetch = original;
        }
    });
});
