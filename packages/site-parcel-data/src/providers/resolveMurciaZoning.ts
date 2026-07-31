// MURCIA (INE 30030) — `resolveMurciaZoning`: the LIVE calificación + sector reader.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS — the ONE impure seam `murciaZoningProvider.ts` was written to sit above
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `murciaZoningProvider.ts` is L2-PURE: it maps ALREADY-FETCHED attributes to a disposition and
// says so in its own header ("The fetch belongs in a proxy/provider above it, exactly as
// `mapPlandataToZoningRecord.ts` separates the DK mapping from the DK fetch"). This module IS that
// provider. Without it the mapper is unreachable from a click — which is exactly the state it was
// in until now.
//
// Murcia's municipal GeoServer (`geoserver.murcia.es/geoserver/wfs`) answers a point query with two
// polygon layers (live-verified 2026-07-31, n = 2 discriminating points):
//
//   `Murcia:pgou_alineaciones` — the CALIFICACIÓN (⚠ misleadingly named; it is a MultiSurface
//                                polygon layer carrying `calificacion` / `descripcion` /
//                                `uso_global` / `sector` / `url` / `f_inicial` / `f_fin`)
//   `Murcia:pgou_sectores`     — the ÁMBITO / sector (`sector`, `clase_suelo`, `categoria`,
//                                `uso_global`, `pedania`, `superficie`, `f_inicial`, `f_fin`)
//
// The browser cannot reach that host cross-origin under CSP `connect-src 'self'`, so the fetch goes
// through the C57 same-origin proxy `/api/es/murcia-pgou` (`server/murciaPgouProxy.js`), exactly as
// Córdoba's COACo reader goes through `/api/cordoba/ordenanzas`.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// FOUR HONESTY PROPERTIES — read before changing this file
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. IT NEVER THROWS. Every miss / unreachable proxy / malformed body is a TYPED refusal, so the
//      L5 dispatcher always has something honest to render (mirrors `resolveChZone`).
//   2. FAILURE ≠ EMPTY, PER LAYER. The proxy answers `null` for a layer whose upstream did not
//      answer and `[]` for a layer that genuinely covers nothing here, and this resolver keeps the
//      two apart to the end (`endpoint-unreachable` vs `no-records-here`). Collapsing them is the
//      documented §CONTEXT-DATA-HONESTY failure (L-422/457/467/469).
//   3. IT APPLIES MURCIA'S OWN LEGAL-STATUS ATTRIBUTE. `f_inicial`/`f_fin` are the validity
//      interval — Murcia's answer to the question Denmark answers with `bygkunifelt` booleans. A
//      record whose `f_fin` has passed is SUPERSEDED and is filtered out here, because quoting it
//      would publish a repealed rule under a current-sounding citation. When a point carries ONLY
//      superseded records that is its own refusal reason, never silently "nothing here".
//   4. IT REFUSES AMBIGUITY. Two DIFFERENT in-force calificaciones at one point is a boundary, and
//      a zone chosen by `features[0]` is a coin flip — the same gate `resolveChZone` applies.
//
// ⚠ IT RESOLVES NO NUMBER, AND CANNOT. The WFS `DescribeFeatureType` schemas carry no altura, no
// edificabilidad, no ocupación and no retranqueo (verified against the schemas, not merely against
// one response). This module returns IDENTITY only; the envelope disposition — and every refusal
// it can produce — is `murciaEnvelopeDisposition`'s, and it is PURE.
//
// PURITY of the parse (C58 §1.9): the fetch is injected; given the same body the parse is
// byte-deterministic. OTel span `pryzm.zoning.resolveMurciaZoning` (C58 §1.10 / P8).
//
// Strategic context — C57 (same-origin proxy seam), C58 §1.4/§1.5/§1.9/§1.10, §CONTEXT-DATA-HONESTY.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { isInMurcia } from './murciaBbox.js';
import {
    isInForce,
    type MurciaCalificacionFeature,
    type MurciaSectorFeature,
} from './murciaZoningProvider.js';

const tracer = trace.getTracer('pryzm.zoning');

/** The same-origin proxy route the browser calls (never geoserver.murcia.es directly — C57 CSP). */
export const MURCIA_PGOU_PATH = '/api/es/murcia-pgou';

/** The calificación polygon layer (⚠ named "alineaciones", but it IS the calificación plane). */
export const MURCIA_CALIFICACION_LAYER = 'Murcia:pgou_alineaciones';

/** The ámbito / sector polygon layer. */
export const MURCIA_SECTOR_LAYER = 'Murcia:pgou_sectores';

/** A WGS84 query point. The proxy owns the reprojection to the layers' native CRS. */
export interface MurciaLatLon {
    readonly lat: number;
    readonly lon: number;
}

/** Injectable dependencies so the resolver is unit-testable without the network. */
export interface MurciaZoningDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production uses the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy base (default `MURCIA_PGOU_PATH`). */
    readonly pathBase?: string;
    /**
     * ISO date the validity interval is tested against. INJECTED so the temporal filter is
     * deterministic in a test and auditable in production — never an implicit `Date.now()` deep
     * inside a parse. Defaults to today at the call site (this is the impure seam; the MAPPER above
     * it stays clock-free).
     */
    readonly asOf?: string;
}

/** Why a Murcia zoning resolution refused. Closed vocabulary — these are operationally distinct. */
export type MurciaZoningRefusalReason =
    /** The point is outside the loose Murcia bbox, or is not finite — nothing to query. */
    | 'out-of-murcia'
    /** No `fetch`, the proxy could not be reached, or NEITHER layer's upstream answered. */
    | 'endpoint-unreachable'
    /** Both layers answered and neither publishes a polygon at this point (a real negative). */
    | 'no-records-here'
    /** Records exist here but EVERY one of them is outside its validity interval (superseded). */
    | 'only-superseded-records'
    /** Two DIFFERENT in-force calificaciones cover the point (a boundary) — refuse, never guess. */
    | 'ambiguous-zone'
    /** Bodies came back but nothing parseable as a Murcia planning record could be read. */
    | 'unparsable-response';

/** The in-force records at the point. Either may be null — the layers are independent. */
export interface MurciaZoningRecords {
    readonly calificacion: MurciaCalificacionFeature | null;
    readonly sector: MurciaSectorFeature | null;
    /** How many records the point carried that were SUPERSEDED (dropped). Provenance, not a rule. */
    readonly supersededCount: number;
}

export type MurciaZoningResolution =
    | { readonly ok: true; readonly records: MurciaZoningRecords }
    | { readonly ok: false; readonly reason: MurciaZoningRefusalReason };

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE PURE PARSE — GeoJSON feature properties → the verbatim attribute records
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Read a property as a trimmed non-empty string, else null. Never throws, never coerces a number. */
function str(props: Record<string, unknown>, key: string): string | null {
    const v = props[key];
    if (typeof v === 'string') {
        const t = v.trim();
        return t === '' ? null : t;
    }
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return null;
}

/** Read a property as a finite number, else null. A blank/absent value is NOT zero (L-616). */
function num(props: Record<string, unknown>, key: string): number | null {
    const v = props[key];
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number.parseFloat(v);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/** Pull the `properties` bag out of a GeoJSON-ish feature, or null. Never throws. */
function featureProps(feature: unknown): Record<string, unknown> | null {
    if (!feature || typeof feature !== 'object') return null;
    const props = (feature as { properties?: unknown }).properties;
    return props && typeof props === 'object' ? (props as Record<string, unknown>) : null;
}

/**
 * Map one `Murcia:pgou_alineaciones` feature to the calificación record. PURE. Field names are
 * VERBATIM from the live schema — renaming them here would silently decouple us from the source.
 * Returns null when the feature carries no usable identity at all.
 */
export function readMurciaCalificacion(feature: unknown): MurciaCalificacionFeature | null {
    const p = featureProps(feature);
    if (!p) return null;
    const rec: MurciaCalificacionFeature = {
        calificacion: str(p, 'calificacion'),
        descripcion: str(p, 'descripcion'),
        uso_global: str(p, 'uso_global'),
        sector: str(p, 'sector'),
        url: str(p, 'url'),
        f_inicial: str(p, 'f_inicial'),
        f_fin: str(p, 'f_fin'),
    };
    return rec.calificacion === null && rec.sector === null && rec.descripcion === null ? null : rec;
}

/** Map one `Murcia:pgou_sectores` feature to the sector record. PURE. Verbatim field names. */
export function readMurciaSector(feature: unknown): MurciaSectorFeature | null {
    const p = featureProps(feature);
    if (!p) return null;
    const rec: MurciaSectorFeature = {
        sector: str(p, 'sector'),
        clase_suelo: str(p, 'clase_suelo'),
        categoria: str(p, 'categoria'),
        uso_global: str(p, 'uso_global'),
        pedania: str(p, 'pedania'),
        superficie: num(p, 'superficie'),
        f_inicial: str(p, 'f_inicial'),
        f_fin: str(p, 'f_fin'),
    };
    return rec.sector === null && rec.clase_suelo === null ? null : rec;
}

/**
 * Split records into the ones we may quote and the ones we may not.
 *
 * ⚠ `isInForce` is THREE-VALUED and only an explicit `false` drops a record: `null` means "this
 * record carries no usable interval", which is not a licence to discard the only answer the
 * municipality published. It rides through and the disposition names the uncertainty.
 */
function partitionInForce<T extends { f_inicial: string | null; f_fin: string | null }>(
    records: readonly T[],
    asOf: string,
): { readonly inForce: readonly T[]; readonly superseded: number } {
    const inForce: T[] = [];
    let superseded = 0;
    for (const r of records) {
        if (isInForce(r.f_inicial, r.f_fin, asOf) === false) superseded++;
        else inForce.push(r);
    }
    return { inForce, superseded };
}

/** Two calificación records are "the same answer" when their zone code AND ámbito agree. */
function sameCalificacion(a: MurciaCalificacionFeature, b: MurciaCalificacionFeature): boolean {
    return a.calificacion === b.calificacion && a.sector === b.sector;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE IMPURE SEAM — resolve the live planning records at a WGS84 point
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** The proxy payload. `null` = that layer's upstream did NOT answer; `[]` = it answered, empty. */
interface MurciaProxyBody {
    readonly calificaciones?: readonly unknown[] | null;
    readonly sectores?: readonly unknown[] | null;
}

/**
 * Resolve the Murcia calificación + ámbito records in force at a WGS84 point, through the
 * same-origin `/api/es/murcia-pgou` proxy. NEVER throws — every failure is a typed refusal.
 *
 * ⚠ This returns IDENTITY, never a buildable number: the layers publish none (see the header).
 * The caller feeds the records to the PURE `murciaEnvelopeDisposition`, which decides whether the
 * honest answer is the legally-grounded `derived-plan` refusal (the PGOU remits the ordering to a
 * prior instrument) or the `no-rule-pack` coverage refusal.
 */
export async function resolveMurciaZoning(
    point: MurciaLatLon | null | undefined,
    deps: MurciaZoningDeps = {},
): Promise<MurciaZoningResolution> {
    const span = tracer.startSpan('pryzm.zoning.resolveMurciaZoning');
    span.setAttribute('provider', 'murcia-pgou-geoserver');
    try {
        if (
            !point ||
            !Number.isFinite(point.lat) ||
            !Number.isFinite(point.lon) ||
            !isInMurcia(point.lat, point.lon)
        ) {
            span.setAttribute('resultFields', 'out-of-murcia');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'out-of-murcia' };
        }

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('resultFields', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'endpoint-unreachable' };
        }
        const asOf = deps.asOf ?? new Date().toISOString().slice(0, 10);
        const base = deps.pathBase ?? MURCIA_PGOU_PATH;
        const url =
            `${base}?lat=${encodeURIComponent(String(point.lat))}` +
            `&lon=${encodeURIComponent(String(point.lon))}`;

        let body: MurciaProxyBody | null = null;
        try {
            const res = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' } });
            if (!res || !res.ok) {
                // Includes the proxy's own 502 — "the municipal service did not answer", which is
                // NOT "there is nothing here". Keeping them apart is honesty property (2).
                span.setAttribute('resultFields', 'upstream-miss');
                span.setStatus({ code: SpanStatusCode.OK });
                return { ok: false, reason: 'endpoint-unreachable' };
            }
            body = (await res.json()) as MurciaProxyBody | null;
        } catch (fetchErr) {
            span.setAttribute('resultFields', 'fetch-error');
            span.setStatus({ code: SpanStatusCode.OK });
            console.warn('[murcia-zoning] fetch failed (non-fatal):', (fetchErr as Error)?.message ?? fetchErr);
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        const calRaw = body?.calificaciones ?? null;
        const secRaw = body?.sectores ?? null;
        if (calRaw === null && secRaw === null) {
            // Neither layer answered — a transport failure wearing a 200, or an empty envelope.
            span.setAttribute('resultFields', 'endpoint-unreachable');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        const calAll = (Array.isArray(calRaw) ? calRaw : [])
            .map(readMurciaCalificacion)
            .filter((r): r is MurciaCalificacionFeature => r !== null);
        const secAll = (Array.isArray(secRaw) ? secRaw : [])
            .map(readMurciaSector)
            .filter((r): r is MurciaSectorFeature => r !== null);

        const calCount = Array.isArray(calRaw) ? calRaw.length : 0;
        const secCount = Array.isArray(secRaw) ? secRaw.length : 0;
        if (calCount + secCount > 0 && calAll.length + secAll.length === 0) {
            // Features came back but not one carried a readable planning attribute — the layer may
            // have changed shape. NAME that rather than report a clean "nothing here" (L-422).
            span.setAttribute('resultFields', 'unparsable-response');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'unparsable-response' };
        }

        const cal = partitionInForce(calAll, asOf);
        const sec = partitionInForce(secAll, asOf);
        const supersededCount = cal.superseded + sec.superseded;

        if (cal.inForce.length === 0 && sec.inForce.length === 0) {
            if (supersededCount > 0) {
                // ⚠ NOT "no records here": records DO cover this point, and every one of them is
                // outside its validity interval. Quoting one would publish a repealed rule.
                span.setAttribute('resultFields', 'only-superseded-records');
                span.setAttribute('supersededCount', supersededCount);
                span.setStatus({ code: SpanStatusCode.OK });
                return { ok: false, reason: 'only-superseded-records' };
            }
            span.setAttribute('resultFields', 'no-records-here');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-records-here' };
        }

        // Ambiguity gate — several in-force calificaciones that do NOT agree is a boundary, and a
        // zone picked by array order is a coin flip. Identical duplicates (the same polygon returned
        // twice by a tiny bbox) are NOT ambiguous and collapse to one.
        const first = cal.inForce[0] ?? null;
        if (first && cal.inForce.some((c) => !sameCalificacion(c, first))) {
            span.setAttribute('resultFields', 'ambiguous-zone');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'ambiguous-zone' };
        }

        const records: MurciaZoningRecords = {
            calificacion: first,
            sector: sec.inForce[0] ?? null,
            supersededCount,
        };
        span.setAttribute('resultFields', 'records');
        span.setAttribute('calificacion', records.calificacion?.calificacion ?? 'n/a');
        span.setAttribute('sector', records.sector?.sector ?? records.calificacion?.sector ?? 'n/a');
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: true, records };
    } catch (err) {
        // Defensive: the whole path is best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn('[murcia-zoning] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'endpoint-unreachable' };
    } finally {
        span.end();
    }
}
