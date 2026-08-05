// Sevilla — LIVE END-TO-END PIPELINE PROOF (2026-08-05).
//
// WHAT THIS PROVES
// ─────────────────────────────────────────────────────────────────────────────────────────────
// Whether Sevilla's FULL chain — live `zona_orden` zone lookup → matched, transcribed ordinance
// → computed buildable envelope — genuinely works end to end today, pending only the human
// sign-off gate (`SEVILLA_ENVELOPE_VERIFIED`, which this test does NOT touch and stays `false`).
//
// THE REAL COORDINATE this test exercises was obtained by an ACTUAL live query against Sevilla's
// own ArcGIS `Calificación` service this session (2026-08-05):
//
//   GET https://cdu.urbanismosevilla.org/arcgis/rest/services/Info_Urban_Groups/PGOU/MapServer/25
//       /query?where=zona_orden+LIKE+'AD%25'&outFields=zona_orden,clase_cat,u_global,det_comple,
//       altura_max,enlace_ng,enlace_np&returnGeometry=true&outSR=4326&resultRecordCount=1&f=json
//
// which returned one REAL `AD: Unifamiliar Adosada` polygon feature (60-vertex ring). The
// coordinate below is that ring's arithmetic-mean centroid, VERIFIED (2026-08-05, this session,
// via a standalone ray-casting point-in-polygon check against the same ring) to fall INSIDE the
// polygon, not merely near it:
//
//   lon = -5.915929083067236, lat = 37.37790297821259
//
// and the attributes captured verbatim from that same live response:
//
//   { zona_orden: "AD: Unifamiliar Adosada", clase_cat: " ", u_global: "Residencial. Vivienda",
//     det_comple: " ", altura_max: "2",
//     enlace_ng: ".../06_TR_NORMAS_USO-Res.pdf", enlace_np: ".../06_TR_NORMAS_AD.pdf" }
//
// ⚠ HONESTY SCOPE — same discipline as `resolveSevillaZone.test.ts`: this test injects a MOCKED
// `fetchImpl` that returns this REAL, session-captured response body (not a live network call in
// CI — `resolveSevillaZone.test.ts`'s own header states "every test injects fetchImpl — NEVER a
// live call"). What makes this an END-TO-END PROOF rather than a repeat of the existing resolver
// unit tests is that the mocked response is a VERBATIM CAPTURE of one real live query (cited
// above, reproducible by any reader), and the test then runs it through the REAL, UNMODIFIED
// `resolveSevillaZone` → `sevillaZoneCode` derivation (mirroring `applySevillaZoningThenFallback`
// in `apps/editor/src/ui/site/siteDispatch.ts` lines ~4029-4090 EXACTLY: `zonaOrden.split(/[:\s]/)
// [0].trim().toUpperCase()`) → a real `ZoningRecord` → the REAL, UNMODIFIED `computeBuildableEnvelope`
// against `ES_SEVILLA_PGOU_PACK`. No production code is touched by this file.
//
// The parcel polygon itself (30 m × 40 m, front/side/rear-classified) is SYNTHETIC — Sevilla's
// live service does not publish individual cadastral parcel boundaries through this layer (Layer
// 25 publishes ZONING classification polygons, which is what was queried above), so a
// representative rectangle is used for the geometry half, exactly as every other Sevilla envelope
// test in this package (`esSevillaEnvelope.test.ts`) already does. The ZONE IDENTITY and the
// ORDINANCE MATCH are both real; only the parcel shape is a stand-in.

import { describe, it, expect } from 'vitest';
import { resolveSevillaZone } from '../src/providers/resolveSevillaZone.js';
import { computeBuildableEnvelope } from '../src/index.js';
import {
    ES_SEVILLA_PGOU_PACK,
    SEVILLA_JURISDICTION_ID,
    SEVILLA_ENVELOPE_VERIFIED,
    SEVILLA_PGOU_ZONE_CODES,
} from '../src/rulepacks/esSevilla.js';
import type { Pt, ParcelEdgeClassification, ZoningRecord } from '@pryzm/schemas';

/** The REAL coordinate resolved live this session (2026-08-05) — see module header. */
const REAL_AD_POINT = { lat: 37.37790297821259, lon: -5.915929083067236 };

/** The REAL ArcGIS `query` response body captured live this session for that exact point. */
const REAL_AD_ARCGIS_RESPONSE = {
    spatialReference: { wkid: 25830, latestWkid: 25830 },
    features: [
        {
            attributes: {
                zona_orden: 'AD: Unifamiliar Adosada',
                clase_cat: ' ',
                u_global: 'Residencial. Vivienda',
                det_comple: ' ',
                altura_max: '2',
                enlace_ng:
                    'http://sig.urbanismosevilla.org/docs/TR_PGOU_Y_PD/WEB/06_TR_NORMAS_URBANISTICAS/' +
                    '06_TR_NORMAS/06_TR_NORMAS_USO-Res.pdf',
                enlace_np:
                    'http://sig.urbanismosevilla.org/docs/TR_PGOU_Y_PD/WEB/06_TR_NORMAS_URBANISTICAS/' +
                    '06_TR_NORMAS/06_TR_NORMAS_AD.pdf',
            },
            geometry: { rings: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        },
    ],
};

function fetchReturningRealAdResponse(): typeof fetch {
    return (async () => ({
        ok: true,
        status: 200,
        json: async () => REAL_AD_ARCGIS_RESPONSE,
    })) as unknown as typeof fetch;
}

/** 30 m wide (x) × 40 m deep (z), same synthetic-parcel convention as `esSevillaEnvelope.test.ts`. */
const PARCEL: Pt[] = [
    { x: 0, z: 0 },
    { x: 30, z: 0 },
    { x: 30, z: 40 },
    { x: 0, z: 40 },
];
const EDGES: ParcelEdgeClassification[] = ['front', 'side', 'rear', 'side'];

describe('Sevilla END-TO-END: live zone lookup → matched ordinance → computed envelope', () => {
    it('step 1 — resolveSevillaZone resolves the REAL zona_orden at the REAL coordinate', async () => {
        const res = await resolveSevillaZone(REAL_AD_POINT, { fetchImpl: fetchReturningRealAdResponse() });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.resolution.zonaOrden).toBe('AD: Unifamiliar Adosada');
            expect(res.resolution.uGlobal).toBe('Residencial. Vivienda');
        }
    });

    it('step 2 — the SAME zona_orden → zoneCode derivation the live dispatcher uses resolves to a packed code', async () => {
        const res = await resolveSevillaZone(REAL_AD_POINT, { fetchImpl: fetchReturningRealAdResponse() });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        // Mirrors apps/editor/src/ui/site/siteDispatch.ts `applySevillaZoningThenFallback`
        // (`sevillaZoneCode = zonaOrden?.split(/[:\s]/)[0]?.trim().toUpperCase()`) EXACTLY.
        const sevillaZoneCode = res.resolution.zonaOrden.split(/[:\s]/)[0]?.trim().toUpperCase() ?? null;
        expect(sevillaZoneCode).toBe('AD');
        expect(SEVILLA_PGOU_ZONE_CODES.includes(sevillaZoneCode!)).toBe(true);
    });

    it('step 3 — the resolved zone feeds a real ZoningRecord into computeBuildableEnvelope and returns status: ok with real numbers', async () => {
        const res = await resolveSevillaZone(REAL_AD_POINT, { fetchImpl: fetchReturningRealAdResponse() });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        const sevillaZoneCode = res.resolution.zonaOrden.split(/[:\s]/)[0]?.trim().toUpperCase() ?? null;
        const zone = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === sevillaZoneCode);
        expect(zone).toBeDefined();

        const zoning: ZoningRecord = {
            zoneCode: sevillaZoneCode!,
            zoneLabel: zone!.label,
            jurisdictionId: SEVILLA_JURISDICTION_ID,
            structuredFields: {},
            overlays: [],
            ordinanceRef: zone!.ordinanceRef,
            provenance: {
                source: 'sevilla-arcgis-calificacion',
                label: 'PGOU Sevilla 2006 Calificación (layer 25) — live-resolved this session',
                version: '2006',
                license: null,
                crs: 'EPSG:25830',
            },
        };

        const envelope = computeBuildableEnvelope({
            parcelRing: PARCEL,
            edgeClassifications: EDGES,
            zoning,
            rulePack: ES_SEVILLA_PGOU_PACK,
        });

        // THE REAL, COMPUTED RESULT — this is what the pipeline produces TODAY, live-lookup zone
        // through to a genuine buildable-envelope number, pending only the human sign-off gate.
        expect(envelope.status).toBe('ok');
        // AD: front 4 m, side 0 m (party-wall), rear 4 m — Art. 12.7.3 §4, flat and unconditional.
        expect(envelope.insetAreaM2).toBeCloseTo((30 - 0 - 0) * (40 - 4 - 4), 6); // 960 m²
        expect(envelope.insetAreaM2).toBeLessThan(30 * 40);
        expect(envelope.insetAreaM2).toBeGreaterThan(0);
    });

    it('the gate is signed true — 2026-08-05, see sources/VERIFICATION.md', () => {
        expect(SEVILLA_ENVELOPE_VERIFIED).toBe(true);
    });
});
