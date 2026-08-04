// Sevilla — `resolveSevillaAlignments`: the ArcGIS `Alineaciones` (layer 4) envelope-query
// resolver for the `fondo máximo edificable` (max buildable-depth) line.
//
// Every test injects `fetchImpl` — NEVER a live call. The fixture response shape mirrors the REAL
// live query verified 2026-08-04: `layer: 'A_INTERIOR-MAXIMA'`, `spatialReference.wkid: 25830`
// (though this resolver requests `outSR: 4326` so it never has to do UTM math itself), a real
// 4-vertex polyline path.

import { describe, it, expect } from 'vitest';
import {
    resolveSevillaAlignments,
    SEVILLA_ALINEACIONES_LAYER,
    SEVILLA_FONDO_MAXIMA_CODES,
} from '../src/index.js';

const PT = { lat: 37.3886303, lon: -5.9953403 }; // Sevilla centre.

const arcgisEnvelopeResponse = (features: Array<{ layer: string; path: number[][] }>) => ({
    spatialReference: { wkid: 4326, latestWkid: 4326 },
    features: features.map((f) => ({
        attributes: { objectid: 1, layer: f.layer },
        geometry: { paths: [f.path] },
    })),
});

function fetchReturning(body: unknown, ok = true): typeof fetch {
    return (async () => ({ ok, status: ok ? 200 : 500, json: async () => body })) as unknown as typeof fetch;
}

describe('resolveSevillaAlignments — the ArcGIS Alineaciones (layer 4) envelope-query', () => {
    it('resolves a real fondo máximo edificable line from a live-shaped response', async () => {
        const fetchImpl = fetchReturning(
            arcgisEnvelopeResponse([
                {
                    layer: 'A_INTERIOR-MAXIMA',
                    path: [[-5.995, 37.388], [-5.994, 37.388], [-5.994, 37.389], [-5.995, 37.389]],
                },
            ]),
        );
        const res = await resolveSevillaAlignments(PT, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.fondoLines).toHaveLength(1);
            expect(res.fondoLines[0]!.layerCode).toBe('A_INTERIOR-MAXIMA');
            expect(res.fondoLines[0]!.path).toHaveLength(4);
        }
    });

    it('queries the confirmed layer id and only the fondo-maxima codes', async () => {
        let capturedUrl = '';
        const fetchImpl = (async (url: string) => {
            capturedUrl = url;
            return { ok: true, status: 200, json: async () => arcgisEnvelopeResponse([]) };
        }) as unknown as typeof fetch;
        await resolveSevillaAlignments(PT, { fetchImpl });
        expect(capturedUrl).toContain(`/${SEVILLA_ALINEACIONES_LAYER}/query`);
        for (const code of SEVILLA_FONDO_MAXIMA_CODES) {
            expect(capturedUrl).toContain(encodeURIComponent(code).replace(/'/g, "'"));
        }
    });

    it('refuses out-of-Sevilla points without calling fetch', async () => {
        let called = false;
        const fetchImpl = (async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; }) as unknown as typeof fetch;
        const res = await resolveSevillaAlignments({ lat: 40.0, lon: -3.7 }, { fetchImpl }); // Madrid
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('out-of-sevilla');
        expect(called).toBe(false);
    });

    it('treats an ArcGIS error body as a service-error, never an empty answer', async () => {
        const fetchImpl = fetchReturning({ error: { code: 400, message: 'bad request' } });
        const res = await resolveSevillaAlignments(PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('service-error');
    });

    it('returns no-fondo-line-nearby (not a crash) when the search finds nothing', async () => {
        const fetchImpl = fetchReturning(arcgisEnvelopeResponse([]));
        const res = await resolveSevillaAlignments(PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-fondo-line-nearby');
    });

    it('never throws on a malformed geometry — skips the feature instead', async () => {
        const fetchImpl = fetchReturning({
            spatialReference: { wkid: 4326 },
            features: [{ attributes: { layer: 'A_INTERIOR-MAXIMA' }, geometry: { paths: [[[1, 1]]] } }],
        });
        const res = await resolveSevillaAlignments(PT, { fetchImpl });
        expect(res.ok).toBe(false); // the single malformed (1-vertex) feature is skipped
        if (!res.ok) expect(res.reason).toBe('no-fondo-line-nearby');
    });
});
