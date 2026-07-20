// L-480 client adapter — the Catalan planning-qualification (clau) lookup.
//
// Thin, testable fetch of the SAME-ORIGIN proxy `/api/muc/zoning` (server/mucZoningProxy.js),
// which owns the keyless Generalitat WMS call and the point-in-polygon disambiguation. This
// adapter turns a WGS84 point into the RESOLVED municipal clau ('13a' / '13E' / '13b' / …) or
// null, and NEVER throws — the caller (jurisdiction selection in siteDispatch) decides how to
// react. Mirrors `CatastroParcelProvider`: pure (no THREE / Cesium / DOM), null on any doubt.
//
// ⚠ WHY THIS MATTERS: this is the ONE input that lets a Barcelona parcel resolve the founder-
// signed `ES_BARCELONA_ENSANCHE_PACK` (clau 13a/13E). Nothing else in PRYZM can name the zone,
// and the pack must NOT be applied on a guess — a 13b parcel (the founder's own Poblenou test
// plot) is a different rule and must resolve to null-for-this-pack, not borrow Eixample's depth.
//
// Verified live on prod 2026-07-20:
//   GET /api/muc/zoning?lat=41.39324&lon=2.16438
//   → { zoning: { clau: "13a", clauLabel: "Densificació Urbana Intensiva", mucCode: "R2", … } }

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.zoning');

/** The same-origin proxy route. Env-overridable, mirroring the Catastro adapter. */
export const MUC_ZONING_ENDPOINT =
    (import.meta.env.VITE_MUC_ZONING_ENDPOINT as string | undefined) ?? '/api/muc/zoning';

/**
 * A resolved qualification. `clau` is the MUNICIPAL code a PGM rule pack keys on; `mucCode`
 * is the coarser harmonised code (13a and 13b are BOTH 'R2'), kept only as evidence — it must
 * never select a rule pack.
 */
export interface MucQualification {
    readonly clau: string;
    readonly clauLabel: string | null;
    readonly mucCode: string | null;
    readonly mucLabel: string | null;
    readonly ineCode: string | null;
    readonly source: string;
    readonly sourceLayer: string;
}

/** Parse the proxy `{ zoning }` payload into a `MucQualification`, or null on a miss /
 *  unresolved / malformed body. Exported so the parse is unit-testable without `fetch`. */
export function parseMucResponse(json: unknown): MucQualification | null {
    if (!json || typeof json !== 'object') return null;
    const zoning = (json as { zoning?: unknown }).zoning;
    if (!zoning || typeof zoning !== 'object') return null; // includes the explicit unresolved {zoning:null}
    const z = zoning as Record<string, unknown>;
    const clau = typeof z.clau === 'string' ? z.clau.trim() : '';
    if (clau === '') return null; // a record with no municipal clau tells us nothing usable
    const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
    return {
        clau,
        clauLabel: str(z.clauLabel),
        mucCode: str(z.mucCode),
        mucLabel: str(z.mucLabel),
        ineCode: str(z.ineCode),
        source: str(z.source) ?? 'muc-gencat',
        sourceLayer: str(z.sourceLayer) ?? 'MUCVW_MUCS_QUAL',
    };
}

/**
 * Resolve the planning clau at a WGS84 point, or null when there is no single answer / the
 * source is unavailable. NEVER throws (P8 OTel span opened). A null here is honest "no usable
 * qualification", NOT a claim the parcel is unzoned — the proxy already distinguishes the two.
 */
export async function fetchQualificationAtPoint(lat: number, lon: number): Promise<MucQualification | null> {
    const span = _tracer.startSpan('pryzm.zoning.fetchQualificationAtPoint');
    span.setAttribute('pryzm.zoning.provider', 'muc-gencat');
    try {
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            span.setAttribute('pryzm.zoning.hit', false);
            return null;
        }
        span.setAttribute('pryzm.zoning.lat', lat);
        span.setAttribute('pryzm.zoning.lon', lon);

        const url =
            `${MUC_ZONING_ENDPOINT}?lat=${encodeURIComponent(String(lat))}` +
            `&lon=${encodeURIComponent(String(lon))}`;

        let res: Response;
        try {
            res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
        } catch (err) {
            console.warn('[gis][muc] network error', err);
            span.setAttribute('pryzm.zoning.hit', false);
            return null;
        }
        if (!res.ok) {
            console.warn('[gis][muc] proxy returned', res.status, res.statusText);
            span.setAttribute('pryzm.zoning.hit', false);
            return null;
        }

        let json: unknown;
        try {
            json = await res.json();
        } catch {
            console.warn('[gis][muc] non-JSON response');
            span.setAttribute('pryzm.zoning.hit', false);
            return null;
        }

        const qual = parseMucResponse(json);
        span.setAttribute('pryzm.zoning.hit', qual !== null);
        if (qual) span.setAttribute('pryzm.zoning.clau', qual.clau);
        return qual;
    } finally {
        span.end();
    }
}
