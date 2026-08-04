// Zaragoza (INE 50297) — the `urbanismo:Calificaciones_Urbanas` calificación resolver.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// PRYZM binds a Zaragoza parcel to its PGOU-2024 calificación grade (A1/3.1, A1/4.2, …) by asking
// the city's own IDEZar GeoServer for the `urbanismo:Calificaciones_Urbanas` polygon at the point
// (§ZGZ-SUBGRADO, `esAragon.ts`). It is the Zaragoza counterpart of `resolveCordobaSubzone` /
// `resolveMurciaZoning`: the ONE impure seam (a fetch through a C57 same-origin proxy) wrapping a
// deterministic parse of the `calificacion` attribute — the field CENSUSED live this session
// (`tools/ogc-layer-census/probe_zaragoza_subgrado.py`, `out/zaragoza_subgrado_census.json`): its
// 7,967-polygon vocabulary reconciles exactly against the coarser `urbanismo:Estructura` layer
// (1,325 = 1,325 for the A1 family), so `calificacion` is not a guess — it is the field that
// answered, censused end to end.
//
// ⚠⚠ IT IS WIRED, BUT THE HONESTY GATE STAYS CLOSED. `ZARAGOZA_ENVELOPE_VERIFIED` (`esAragon.ts`)
// is false until a Spanish-planning-literate human transcribes arts. 4.1.12/4.1.13/4.1.15/4.1.17
// and signs `sources/VERIFICATION.md`, so the L5 dispatcher renders the cited "no signed rule"
// REFUSAL for every Zaragoza parcel today — this resolver's output is NOT rendered into a number.
// The wiring means one signature renders it the day sign-off lands; until then a resolved zone
// binds NO figure (§CONTEXT-DATA-HONESTY).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THREE HONESTY PROPERTIES (mirror `resolveCordobaSubzone` / `resolveMurciaZoning`)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. IT NEVER THROWS. Every miss / unreachable endpoint / malformed body returns a typed REFUSAL.
//   2. IT DOES NOT DECIDE TO RENDER. It resolves the DATA; the dispatcher decides, gated on
//      `ZARAGOZA_ENVELOPE_VERIFIED` (default OFF).
//   3. IT NEVER SILENTLY DROPS A MATCHED-BUT-UNPACKED CODE. Zaragoza's calificación carries 52
//      distinct codes (only 4 — A1/3.1, A1/3.2, A1/4.1, A1/4.2 — are packed by
//      `esZaragoza.ts`); a real hit on e.g. `A1/1` or `EQ` resolves `ok: true` with that code and
//      `packed: false`, NEVER a `no-zone` refusal that would read as "outside the plan" when the
//      point is squarely inside it. Deciding WHICH resolved codes may render is the DISPATCHER's
//      job (it holds `ZARAGOZA_ZONE_CODES`), not this resolver's — this file stays L2-pure of that
//      pack-membership question and only reports what the server said.
//
// PURITY of the parse (C58 §1.9): the fetch is injected; given the same response the parse is
// byte-deterministic. OTel span `pryzm.zoning.resolveZaragozaZone` (C58 §1.10 / P8).
//
// Strategic context — `esAragon.ts` (§ZGZ-SUBGRADO, the gate + the census), `esZaragoza.ts` (the
// packed 4 subgrados), C57, C58 §1.4/§1.5/§1.9/§1.10, §CONTEXT-DATA-HONESTY.

import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.zoning');

/**
 * Same-origin proxy routes the browser calls (C57 — never idezar-sig.zaragoza.es directly). The
 * proxy builds the WFS query and returns the GeoJSON. Wired server-side in
 * `server/zaragozaZoningProxy.js`.
 */
export const ZARAGOZA_CALIFICACIONES_PATH = '/api/zaragoza/calificaciones';

/** A WGS84 point — the frame the resolver queries the calificación by (the proxy reprojects). */
export interface ZaragozaLngLat {
    readonly lat: number;
    readonly lon: number;
}

/** Injectable dependencies so the adapter is unit-testable without the network. */
export interface ZaragozaZoneDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production uses the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy base for the `Calificaciones_Urbanas` spatial query. */
    readonly calificacionesPathBase?: string;
}

/** Why a Zaragoza calificación resolution refused. Closed vocabulary — operationally distinct. */
export type ZaragozaZoneRefusalReason =
    /** No usable WGS84 point was supplied — nothing to intersect the calificación plane by. */
    | 'no-point'
    /** No `fetch` available, the endpoint could not be reached, or it returned a non-OK / bad body. */
    | 'endpoint-unreachable'
    /** The point-intersect returned no `Calificaciones_Urbanas` feature at this point. */
    | 'no-zone';

export interface ZaragozaZoneResolution {
    /** The raw `calificacion` attribute value, verbatim (e.g. `A1/3.1`, `A1/1`, `EQ`, `B1/1*`). */
    readonly zoneCode: string;
    /** The `descripcion` attribute echoed for provenance, or null when the feature carries none. */
    readonly descripcion: string | null;
}

export type ZaragozaZoneResult =
    | { readonly ok: true; readonly resolution: ZaragozaZoneResolution }
    | { readonly ok: false; readonly reason: ZaragozaZoneRefusalReason };

/** Read the first WFS feature's `properties` from a GeoJSON body, or null. Never throws. */
function firstProps(body: unknown): Record<string, unknown> | null {
    const features = (body as { features?: unknown } | null)?.features;
    const feature = Array.isArray(features) ? features[0] : null;
    if (!feature || typeof feature !== 'object') return null;
    const props = (feature as { properties?: unknown }).properties;
    return props && typeof props === 'object' ? (props as Record<string, unknown>) : null;
}

async function fetchJson(
    fetchImpl: typeof fetch,
    url: string,
): Promise<{ ok: true; body: unknown } | { ok: false }> {
    try {
        const res = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' } });
        if (!res || !res.ok) return { ok: false };
        return { ok: true, body: await res.json() };
    } catch (err) {
        console.warn('[zaragoza-zone] fetch failed (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false };
    }
}

/**
 * Resolve a Zaragoza parcel's PGOU-2024 calificación grade (`urbanismo:Calificaciones_Urbanas`,
 * censused §ZGZ-SUBGRADO). Point-intersects the layer at the WGS84 point and returns the raw
 * `calificacion` code. NEVER throws — every failure is a typed refusal (three honesty properties
 * in the header). Does NOT filter to the 4 packed subgrados — see honesty property 3.
 *
 * @param point  the parcel query point (WGS84); the calificación polygon is found by point-in-polygon.
 * @param deps   injectable fetch + proxy base.
 */
export async function resolveZaragozaZone(
    point: ZaragozaLngLat | null | undefined,
    deps: ZaragozaZoneDeps = {},
): Promise<ZaragozaZoneResult> {
    const span = tracer.startSpan('pryzm.zoning.resolveZaragozaZone');
    span.setAttribute('provider', 'idezar-calificaciones-urbanas');
    try {
        if (
            !point ||
            typeof point.lat !== 'number' ||
            typeof point.lon !== 'number' ||
            !Number.isFinite(point.lat) ||
            !Number.isFinite(point.lon)
        ) {
            span.setAttribute('resultFields', 'no-point');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-point' };
        }

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('resultFields', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        const base = deps.calificacionesPathBase ?? ZARAGOZA_CALIFICACIONES_PATH;
        const url =
            `${base}?lat=${encodeURIComponent(String(point.lat))}` +
            `&lon=${encodeURIComponent(String(point.lon))}`;
        const res = await fetchJson(fetchImpl, url);
        if (!res.ok) {
            span.setAttribute('resultFields', 'endpoint-unreachable');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        const props = firstProps(res.body);
        if (!props) {
            span.setAttribute('resultFields', 'no-zone');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-zone' };
        }

        const rawCode = props['calificacion'];
        const zoneCode = typeof rawCode === 'string' && rawCode.trim() !== '' ? rawCode.trim() : null;
        if (!zoneCode) {
            span.setAttribute('resultFields', 'no-zone');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-zone' };
        }
        const rawDesc = props['descripcion'];
        const descripcion =
            typeof rawDesc === 'string' && rawDesc.trim() !== '' ? rawDesc.trim() : null;

        span.setAttribute('resultFields', 'ok');
        span.setAttribute('zoneCode', zoneCode);
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: true, resolution: { zoneCode, descripcion } };
    } catch (err) {
        // Defensive: the whole path is best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn('[zaragoza-zone] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'endpoint-unreachable' };
    } finally {
        span.end();
    }
}
