// Sevilla — `resolveSevillaZone`: the ArcGIS `Calificación` (layer 25) point-intersect resolver.
//
// Every test injects `fetchImpl` — NEVER a live call. The fixture response shape mirrors the
// REAL field schema verified live 2026-08-03 against
// `cdu.urbanismosevilla.org/arcgis/rest/services/Info_Urban_Groups/PGOU/MapServer/25?f=json`:
// `zona_orden` (e.g. `"SB: Suburbana"`), `clase_cat`, `u_global`, `det_comple`, `altura_max`
// (string, unit unresolved), `enlace_ng`, `enlace_np`, and `spatialReference.wkid: 25830`.
// These tests pin the resolver's honesty properties: never throws, never invents a zone, and
// `service-error` is kept distinct from `no-zone-here` (failure ≠ empty).

import { describe, it, expect } from 'vitest';
import {
    resolveSevillaZone,
    SEVILLA_ARCGIS_SERVICE,
    SEVILLA_CALIFICACION_LAYER,
    SEVILLA_NATIVE_EPSG,
    sevillaNoRulePackRefusal,
    SEVILLA_ENVELOPE_VERIFIED,
    ES_SEVILLA_PGOU_PACK,
    SEVILLA_PGOU_ZONE_CODES,
    isInSevilla,
    SEVILLA_BBOX,
} from '../src/index.js';

const PT = { lat: 37.3886303, lon: -5.9953403 }; // Sevilla centre (Nominatim, 2026-08-03).

/** A realistic ArcGIS `query` JSON response for layer 25, one feature. */
const arcgisResponse = (attributes: Record<string, unknown>, wkid = SEVILLA_NATIVE_EPSG) => ({
    spatialReference: { wkid, latestWkid: wkid },
    features: [{ attributes, geometry: { rings: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } }],
});

function fetchReturning(body: unknown, ok = true): typeof fetch {
    return (async () => ({ ok, status: ok ? 200 : 500, json: async () => body })) as unknown as typeof fetch;
}

describe('resolveSevillaZone — the ArcGIS Calificación (layer 25) point-intersect', () => {
    it('resolves the real zona_orden from a live-shaped ArcGIS response', async () => {
        const fetchImpl = fetchReturning(
            arcgisResponse({
                objectid: 1,
                clase_cat: 'SUELO URBANO',
                u_global: 'Residencial',
                zona_orden: 'SB: Suburbana',
                det_comple: null,
                altura_max: '7',
                enlace_ng: 'https://cdu.urbanismosevilla.org/docs/O_SB_NG.pdf',
                enlace_np: 'https://cdu.urbanismosevilla.org/docs/O_SB_NP.pdf',
            }),
        );
        const res = await resolveSevillaZone(PT, { fetchImpl });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.resolution.zonaOrden).toBe('SB: Suburbana');
            expect(res.resolution.claseCat).toBe('SUELO URBANO');
            expect(res.resolution.uGlobal).toBe('Residencial');
            expect(res.resolution.detComple).toBeNull();
            // ⚠ altura_max is carried as a RAW STRING, never parsed as a number (unit unresolved).
            expect(res.resolution.alturaMax).toBe('7');
            expect(res.resolution.enlaceNg).toContain('O_SB_NG.pdf');
            expect(res.resolution.enlaceNp).toContain('O_SB_NP.pdf');
        }
    });

    it('queries the confirmed live service + layer 25 + EPSG:25830', async () => {
        let capturedUrl = '';
        const fetchImpl = (async (url: string) => {
            capturedUrl = url;
            return { ok: true, json: async () => arcgisResponse({ zona_orden: 'CH: Casco Histórico' }) };
        }) as unknown as typeof fetch;
        await resolveSevillaZone(PT, { fetchImpl });
        expect(capturedUrl).toContain(SEVILLA_ARCGIS_SERVICE);
        expect(capturedUrl).toContain(`/${SEVILLA_CALIFICACION_LAYER}/query`);
        expect(capturedUrl).toContain(`outSR=${SEVILLA_NATIVE_EPSG}`);
        expect(capturedUrl).toContain('inSR=4326');
    });

    it('out-of-sevilla — a point outside the routing box never calls fetch', async () => {
        let called = false;
        const fetchImpl = (async () => {
            called = true;
            return { ok: true, json: async () => arcgisResponse({ zona_orden: 'X' }) };
        }) as unknown as typeof fetch;
        const res = await resolveSevillaZone({ lat: 41.0, lon: 2.0 }, { fetchImpl }); // Barcelona
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('out-of-sevilla');
        expect(called).toBe(false);
    });

    it('no-zone-here — the service answers with zero features (a genuine empty, not a failure)', async () => {
        const fetchImpl = fetchReturning({ spatialReference: { wkid: SEVILLA_NATIVE_EPSG }, features: [] });
        const res = await resolveSevillaZone(PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-zone-here');
    });

    it('service-error — an HTTP failure is distinct from an empty answer (failure ≠ empty)', async () => {
        const fetchImpl = fetchReturning({}, false);
        const res = await resolveSevillaZone(PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('service-error');
    });

    it('service-error — an ArcGIS HTTP-200 error body is a failure, never treated as empty', async () => {
        const fetchImpl = fetchReturning({ error: { code: 400, message: 'Invalid geometry' } });
        const res = await resolveSevillaZone(PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('service-error');
    });

    it('never throws — a fetch rejection resolves to a typed refusal', async () => {
        const fetchImpl = (async () => {
            throw new Error('network down');
        }) as unknown as typeof fetch;
        const res = await resolveSevillaZone(PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('service-error');
    });

    it('no-fetch — no fetchImpl and none in scope', async () => {
        const res = await resolveSevillaZone(PT, { fetchImpl: undefined as unknown as typeof fetch });
        // In a vitest/node environment globalThis.fetch usually exists, so this only asserts the
        // function never throws and returns a typed result either way.
        expect(typeof res.ok).toBe('boolean');
    });

    it('never invents a zone: blank zona_orden is treated as no-zone-here, not fabricated', async () => {
        const fetchImpl = fetchReturning(arcgisResponse({ zona_orden: '   ' }));
        const res = await resolveSevillaZone(PT, { fetchImpl });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('no-zone-here');
    });
});

describe('isInSevilla — the coarse municipal routing box', () => {
    it('accepts the municipal centre and rejects a distant city', () => {
        expect(isInSevilla(PT.lat, PT.lon)).toBe(true);
        expect(isInSevilla(41.3874, 2.1686)).toBe(false); // Barcelona
    });
    it('bbox matches the live-measured Nominatim extent, rounded outward', () => {
        expect(SEVILLA_BBOX.minLat).toBeLessThanOrEqual(37.3002036);
        expect(SEVILLA_BBOX.maxLat).toBeGreaterThanOrEqual(37.4529579);
        expect(SEVILLA_BBOX.minLon).toBeLessThanOrEqual(-6.0329183);
        expect(SEVILLA_BBOX.maxLon).toBeGreaterThanOrEqual(-5.8191571);
    });
});

describe('sevillaNoRulePackRefusal — the honest, zone-named refusal', () => {
    it('cites the REAL zona_orden when one resolved — never a generic message', () => {
        const refusal = sevillaNoRulePackRefusal('SB: Suburbana', null, ['Location: test']);
        expect(refusal.code).toBe('no-rule-pack');
        expect(refusal.legallyGrounded).toBe(false);
        expect(refusal.ordinanceRef).toBeNull();
        expect(refusal.headline).toContain('SB: Suburbana');
        expect(refusal.detail).toContain('SB: Suburbana');
    });

    it('falls back to a generic phrasing when no zone resolved, distinct from a resolved one', () => {
        const resolved = sevillaNoRulePackRefusal('SB: Suburbana', null, []);
        const unresolved = sevillaNoRulePackRefusal(null, null, []);
        expect(unresolved.headline).not.toBe(resolved.headline);
        expect(unresolved.headline).not.toContain('SB: Suburbana');
    });
});

describe('SEVILLA_ENVELOPE_VERIFIED — the honesty gate defaults closed', () => {
    it('is false — a founder-only act, never flipped by this task', () => {
        expect(SEVILLA_ENVELOPE_VERIFIED).toBe(false);
    });
    it('the pack ships exactly the zones this pass transcribed — SB, and nothing else guessed', () => {
        // ⚠ 2026-08-03: SB (Suburbana, Capítulo V) is now transcribed from its own ordinance PDF —
        // see esSevilla.ts. This does NOT open the gate: SEVILLA_ENVELOPE_VERIFIED (above) is still
        // false, and SB itself hard-refuses at the geometry level (SEVILLA_SB_FONDO_UNRESOLVED_RING).
        // This test pins that the zone list is EXACTLY what was read — no other zona_orden value
        // (MC, CH, etc.) may silently appear registered.
        expect(SEVILLA_PGOU_ZONE_CODES).toEqual(['SB']);
        expect(ES_SEVILLA_PGOU_PACK.zones.map((z) => z.code)).toEqual(['SB']);
    });
});
