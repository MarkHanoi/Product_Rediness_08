// §MURCIA-COVERS-POINT — the WFS BBOX is an AREA query; a parcel asks a POINT question.
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────────────────────
// `murciaWiring.test.ts` proved the Murcia chain is REACHABLE, using fixtures that carry only
// attributes. It could not catch this, because the defect is not in the mapping — it is in the
// SELECTION among several features the live service legitimately returns.
//
// The proxy queries with a bbox of half-extent 0.00005° (~11 m × 9 m at 38 °N) and WFS `BBOX` is an
// INTERSECTS predicate, so GeoServer correctly returns every polygon whose edge passes near the
// click. Before the fix the resolver treated all of them as answers about the point:
//
//   • the ambiguity gate compared the covering `RR` polygon against the NEIGHBOURING `EV` (Zonas
//     verdes) polygon, saw two different zone codes, and refused with `ambiguous-zone`;
//   • the sector was read off `inForce[0]`, whichever polygon GeoServer happened to list first.
//
// Both turned the founder's parcel — the exemplar the whole Murcia wiring is justified by — from
// the LEGALLY GROUNDED `derived-plan` refusal (PGOU Arts. 6.6.2 / 5.24.5.1, ámbito TA-379) into the
// WEAKER `no-rule-pack` coverage refusal. Same screen, strictly less true.
//
// ⚠ THE FIXTURES ARE THE LIVE PROD RESPONSE, NOT A RECONSTRUCTION. Rings and attributes below are
// VERBATIM from `GET https://pryzm.fly.dev/api/es/murcia-pgou?lat=38.0061&lon=-1.138028`, captured
// 2026-07-31 against commit 60d11aea. The coordinates really are rounded to 4 decimals — that is
// GeoServer's configured output precision for these layers, and it is why the ambiguity gate is
// KEPT for genuinely co-located polygons rather than replaced by containment.
//
// @see packages/site-parcel-data/src/providers/resolveMurciaZoning.ts — §MURCIA-COVERS-POINT

import { describe, expect, it } from 'vitest';
import {
    resolveMurciaZoning,
    featureCoversPoint,
    MURCIA_PGOU_PATH,
} from '../src/providers/resolveMurciaZoning.js';
import { murciaEnvelopeDisposition } from '../src/providers/murciaZoningProvider.js';

/** The founder's parcel — refcat 3481104XH6038S, `PL U.A. 5ª DEL P.P. CR-5`, Churra/El Puntal. */
const PARCEL = { lat: 38.0061, lon: -1.138028 } as const;

const ALIVE = { f_inicial: '2021-09-09Z', f_fin: '2999-12-30Z' } as const;

/** VERBATIM prod ring — the calificación polygon that COVERS the parcel. */
const RR_RING = [[[[-1.138, 38.0063], [-1.1378, 38.0061], [-1.1381, 38.0059], [-1.1383, 38.0061], [-1.138, 38.0063]]]];

/** VERBATIM prod ring — the ADJACENT green-space polygon. Its edge passes within the bbox; it does
 *  NOT cover the parcel. This is the feature that used to trip the ambiguity gate. */
const EV_RING = [[[
    [-1.1379, 38.0059], [-1.1381, 38.0058], [-1.1381, 38.0059], [-1.1378, 38.0061], [-1.1376, 38.0062],
    [-1.1365, 38.0069], [-1.1363, 38.007], [-1.136, 38.0072], [-1.136, 38.0071], [-1.1362, 38.007],
    [-1.1369, 38.0065], [-1.1361, 38.0055], [-1.1362, 38.0055], [-1.1364, 38.0056], [-1.137, 38.0065],
    [-1.1379, 38.0059],
]]];

/** A neighbouring sector that does NOT cover the parcel (prod listed it FIRST). Simplified ring,
 *  positioned west of the parcel — the topology is what matters, and it is the prod topology. */
const PERI_RING = [[[[-1.1439, 38.0048], [-1.1400, 38.0048], [-1.1400, 38.0090], [-1.1439, 38.0090], [-1.1439, 38.0048]]]];

/** The governing ámbito, which DOES cover the parcel. Prod listed it LAST. */
const TA379_RING = [[[[-1.1426, 37.9998], [-1.1330, 37.9998], [-1.1330, 38.009], [-1.1426, 38.009], [-1.1426, 37.9998]]]];

const feat = (properties: Record<string, unknown>, coordinates: unknown) => ({
    type: 'Feature',
    geometry: { type: 'MultiPolygon', coordinates },
    properties,
});

/** The response prod actually returns at the founder's parcel — order preserved. */
function prodBody() {
    return {
        calificaciones: [
            feat({ calificacion: 'RR', descripcion: 'Residencial, ordenación remitida al planeamiento anterior', uso_global: 'Residencial', sector: 'TA-379', url: 'RR.pdf', ...ALIVE }, RR_RING),
            feat({ calificacion: 'EV', descripcion: 'Zonas verdes', uso_global: 'Espacios Libres', sector: 'TA-379', url: 'EV.pdf', ...ALIVE }, EV_RING),
        ],
        sectores: [
            feat({ sector: 'PERI-UM-114', clase_suelo: 'Urbano', categoria: null, uso_global: 'Residencial', pedania: 'EL PUNTAL', superficie: 83010, f_inicial: '2024-09-24Z', f_fin: '2999-12-30Z' }, PERI_RING),
            feat({ sector: null, clase_suelo: 'Sistemas Generles', categoria: null, uso_global: null, pedania: 'SANGONERA LA SECA', superficie: 19268054, f_inicial: '2026-05-20Z', f_fin: '2999-12-30Z' }, TA379_RING),
            feat({ sector: 'TA-379', clase_suelo: 'Urbanizable', categoria: 'Urbanizable Transitorio', uso_global: 'Residencial', pedania: 'EL PUNTAL', superficie: 383313, f_inicial: '2024-01-17Z', f_fin: '2999-12-30Z' }, TA379_RING),
        ],
    };
}

function fetchReturning(body: unknown, status = 200) {
    return (async (url: string) => {
        expect(String(url)).toContain(MURCIA_PGOU_PATH);
        return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
    }) as unknown as typeof fetch;
}

const ASOF = '2026-07-31';

describe('§MURCIA-COVERS-POINT — featureCoversPoint is three-valued and geometry-true', () => {
    it('says TRUE for the polygon that covers the parcel', () => {
        expect(featureCoversPoint(feat({}, RR_RING), PARCEL.lat, PARCEL.lon)).toBe(true);
    });

    it('says FALSE for the adjacent polygon that merely intersects the query bbox', () => {
        expect(featureCoversPoint(feat({}, EV_RING), PARCEL.lat, PARCEL.lon)).toBe(false);
        expect(featureCoversPoint(feat({}, PERI_RING), PARCEL.lat, PARCEL.lon)).toBe(false);
    });

    it('says NULL — never false — when there is no geometry to test (honesty: unknown ≠ no)', () => {
        expect(featureCoversPoint({ properties: { calificacion: 'RR' } }, PARCEL.lat, PARCEL.lon)).toBeNull();
        expect(featureCoversPoint(feat({}, []), PARCEL.lat, PARCEL.lon)).toBeNull();
        expect(featureCoversPoint({ geometry: { type: 'Point', coordinates: [-1.138, 38.0061] } }, PARCEL.lat, PARCEL.lon)).toBeNull();
        expect(featureCoversPoint(null, PARCEL.lat, PARCEL.lon)).toBeNull();
    });

    it('excludes a point that falls in a HOLE of an otherwise covering polygon', () => {
        const donut = [[
            [[-1.14, 38.00], [-1.13, 38.00], [-1.13, 38.01], [-1.14, 38.01], [-1.14, 38.00]],
            [[-1.1385, 38.0055], [-1.1375, 38.0055], [-1.1375, 38.0065], [-1.1385, 38.0065], [-1.1385, 38.0055]],
        ]];
        expect(featureCoversPoint(feat({}, donut), PARCEL.lat, PARCEL.lon)).toBe(false);
    });
});

describe("§MURCIA-COVERS-POINT — the founder's parcel resolves the LEGALLY GROUNDED refusal", () => {
    it('does not refuse `ambiguous-zone` on a NEIGHBOURING polygon (the regression)', async () => {
        const res = await resolveMurciaZoning(PARCEL, { asOf: ASOF, fetchImpl: fetchReturning(prodBody()) });
        // Before §MURCIA-COVERS-POINT this was { ok: false, reason: 'ambiguous-zone' }.
        expect(res.ok).toBe(true);
    });

    it('reads the calificación that covers the parcel (RR), not the neighbour (EV)', async () => {
        const res = await resolveMurciaZoning(PARCEL, { asOf: ASOF, fetchImpl: fetchReturning(prodBody()) });
        if (!res.ok) throw new Error(`expected records, got refusal ${res.reason}`);
        expect(res.records.calificacion?.calificacion).toBe('RR');
    });

    it('reads the governing ámbito TA-379, not the first-listed non-covering PERI-UM-114', async () => {
        const res = await resolveMurciaZoning(PARCEL, { asOf: ASOF, fetchImpl: fetchReturning(prodBody()) });
        if (!res.ok) throw new Error(`expected records, got refusal ${res.reason}`);
        // Before the fix this was 'PERI-UM-114' — a neighbour, and NOT a remitted-ámbito prefix,
        // which is what silently downgraded the refusal.
        expect(res.records.sector?.sector).toBe('TA-379');
        expect(res.records.sector?.clase_suelo).toBe('Urbanizable');
    });

    it('produces the cited derived-plan refusal — legallyGrounded, naming expediente 379', async () => {
        const res = await resolveMurciaZoning(PARCEL, { asOf: ASOF, fetchImpl: fetchReturning(prodBody()) });
        if (!res.ok) throw new Error(`expected records, got refusal ${res.reason}`);
        const d = murciaEnvelopeDisposition(res.records.calificacion, res.records.sector, ASOF, []);
        if (d.kind !== 'refusal') throw new Error('expected a refusal disposition');
        expect(d.refusal.code).toBe('derived-plan');
        expect(d.refusal.legallyGrounded).toBe(true);
        expect(d.refusal.ordinanceRef).toContain('6.6.2');
        expect(d.refusal.ordinanceRef).toContain('5.24.5.1');
        expect(d.refusal.detail).toContain('expediente 379');
    });

    it('still publishes NO buildable number anywhere in the refusal', async () => {
        const res = await resolveMurciaZoning(PARCEL, { asOf: ASOF, fetchImpl: fetchReturning(prodBody()) });
        if (!res.ok) throw new Error('expected records');
        const d = murciaEnvelopeDisposition(res.records.calificacion, res.records.sector, ASOF, []);
        if (d.kind !== 'refusal') throw new Error('expected a refusal');
        expect(d.refusal).not.toHaveProperty('maxHeightM');
        expect(d.refusal).not.toHaveProperty('maxFAR');
        expect(JSON.stringify(d.refusal)).not.toMatch(/\b262\s*m²/);
    });

    it('STILL refuses when two calificaciones genuinely cover the same point (the gate survives)', async () => {
        const body = {
            calificaciones: [
                feat({ calificacion: 'RR', sector: 'TA-379', ...ALIVE }, RR_RING),
                feat({ calificacion: 'EE', sector: 'TA-379', ...ALIVE }, RR_RING), // same ring ⇒ real overlap
            ],
            sectores: [],
        };
        const res = await resolveMurciaZoning(PARCEL, { asOf: ASOF, fetchImpl: fetchReturning(body) });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.reason).toBe('ambiguous-zone');
    });

    it('reports `no-records-here` when the returned polygons all miss the point', async () => {
        const body = { calificaciones: [feat({ calificacion: 'EV', sector: 'TA-379', ...ALIVE }, EV_RING)], sectores: [] };
        const res = await resolveMurciaZoning(PARCEL, { asOf: ASOF, fetchImpl: fetchReturning(body) });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.reason).toBe('no-records-here');
    });
});

describe('§CONTEXT-DATA-HONESTY — a HALF-answer is a failure, never a clean negative', () => {
    it('does not report `no-records-here` when the calificación layer never answered', async () => {
        // The proxy's real half-down payload: one layer null, the other an honest empty.
        const res = await resolveMurciaZoning(PARCEL, {
            asOf: ASOF,
            fetchImpl: fetchReturning({ calificaciones: null, sectores: [] }),
        });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        // Before the guard this was 'no-records-here' — i.e. "Murcia published no record covering
        // this point", asserted while the layer that carries the calificación was silent.
        expect(res.reason).toBe('endpoint-unreachable');
    });

    it('does not report `no-records-here` when the sector layer never answered', async () => {
        const res = await resolveMurciaZoning(PARCEL, {
            asOf: ASOF,
            fetchImpl: fetchReturning({ calificaciones: [], sectores: null }),
        });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.reason).toBe('endpoint-unreachable');
    });

    it('still reports a genuine double-empty as `no-records-here`, not a failure', async () => {
        const res = await resolveMurciaZoning(PARCEL, {
            asOf: ASOF,
            fetchImpl: fetchReturning({ calificaciones: [], sectores: [] }),
        });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.reason).toBe('no-records-here');
    });

    it('a half-answer that still carries covering records is USED, not discarded', async () => {
        const res = await resolveMurciaZoning(PARCEL, {
            asOf: ASOF,
            fetchImpl: fetchReturning({ calificaciones: prodBody().calificaciones, sectores: null }),
        });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.records.calificacion?.calificacion).toBe('RR');
        expect(res.records.sector).toBeNull();
    });
});
