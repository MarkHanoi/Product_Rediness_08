// Telde (INE 35026, Gran Canaria) — the SIPU `EDIF` per-point zone resolver.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS, AND WHY IT DOES NOT LOOK LIKE `resolveZaragozaZone` / `resolveCordobaSubzone`
// ══════════════════════════════════════════════════════════════════════════════════════════════
// This is the Telde counterpart of `resolveZaragozaZone` / `resolveCordobaSubzone`: the ONE impure
// seam (an injectable fetch through a same-origin proxy) wrapping a deterministic parse — here,
// `readSipuZone` (`canariasSipuProvider.ts`), REUSED rather than duplicated, because that function
// already turns a raw SIPU `EDIF` row into a validated, grammar-classified reading and is the
// documented single place that contract lives (§CANARIAS-SIPU-PROVIDER header).
//
// ⚠⚠ UNLIKE ZARAGOZA/CÓRDOBA, THE LIVE ENDPOINT THIS RESOLVER WOULD CALL DOES NOT EXIST TODAY.
// `esCanariasSipu.ts` records, measured, that IDECanarias' WFS is administratively disabled and its
// WMS serves byte-identical blank tiles everywhere including a negative control — a service-wide
// outage, not a per-query miss (`§10 IDECanarias WFS` note in that file). There is therefore no
// live point→EDIF-row join PRYZM can stand behind yet, and no `server/teldeZoningProxy.js` has been
// written (checked: `server/` carries no `telde`/`sipu`/`canarias` file, this session). Rather than
// fabricate a working endpoint, this resolver is written EXACTLY like its Zaragoza/Córdoba peers —
// injectable fetch, a named same-origin proxy path, typed refusals, never throws — so that:
//   (a) it is genuinely activation-ready: standing up `TELDE_EDIF_PATH` server-side and nothing
//       else makes it live, matching the "one wire, not a rewrite" property every sibling resolver
//       has;
//   (b) it is honestly UNREACHABLE today, and says so via the real `endpoint-unreachable` refusal
//       reason — not a fabricated 'no-zone' that would misreport "this parcel carries no
//       determination" when the truth is "PRYZM cannot ask yet";
//   (c) tests can inject a fake fetch (as every sibling resolver's tests do) to prove the PARSE side
//       of the contract — that a resolved EDIF row reaches `readSipuZone` correctly, that a packed
//       code is named, that an unpacked code is named with its `TELDE_UNPACKED_ZONES` reason — while
//       the "is there really a server today" question is answered separately and honestly by the
//       real-fetch behaviour never being stubbed to pretend otherwise.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THREE HONESTY PROPERTIES (mirror `resolveCordobaSubzone` / `resolveZaragozaZone`)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. IT NEVER THROWS. Every miss / unreachable endpoint / malformed body returns a typed REFUSAL.
//   2. IT DOES NOT DECIDE TO RENDER. It resolves the DATA (a `SipuZoneReading` via `readSipuZone`);
//      the dispatcher decides, gated on `CANARIAS_ENVELOPE_VERIFIED` (default OFF).
//   3. IT NEVER SILENTLY DROPS A MATCHED-BUT-UNPACKED CODE. A real hit on e.g. `A1` or `INDEF`
//      resolves `ok: true` with that code; whether it is packed is `esTeldePgo2003.ts`'s
//      `TELDE_PGO2003_ZONE_CODES` question, answered by the DISPATCHER, not discarded here.
//
// PURITY of the parse (C58 §1.9): the fetch is injected; given the same response the parse is
// byte-deterministic (delegated to `readSipuZone`, itself L2-pure). OTel span
// `pryzm.zoning.resolveTeldeZone` (C58 §1.10 / P8).
//
// Strategic context — esCanariasSipu.ts, esTeldePgo2003.ts, canariasSipuProvider.ts, teldeBbox.ts,
// C58 §1.4/§1.5/§1.9/§1.10, §CONTEXT-DATA-HONESTY, VERIFICATION.md §6 (the dispatch-wiring gap this
// resolver + `applyTeldeZoningThenFallback` close).

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { readSipuZone, type SipuEdifRecord, type SipuZoneReading } from './canariasSipuProvider.js';

const tracer = trace.getTracer('pryzm.zoning');

/**
 * Same-origin proxy path this resolver would call once a server-side `EDIF` point-join exists.
 * ⚠ NOT WIRED SERVER-SIDE TODAY (see the module header) — calling this resolver without an
 * injected `fetchImpl` will genuinely hit the network and genuinely fail, which is the honest
 * behaviour: there is nothing dishonest to guard against.
 */
export const TELDE_EDIF_PATH = '/api/telde/edif';

/** A WGS84 point — the frame the resolver queries the EDIF zone by. */
export interface TeldeLngLat {
    readonly lat: number;
    readonly lon: number;
}

/** Injectable dependencies so the adapter is unit-testable without the network. */
export interface TeldeZoneDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production would use the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy base for the per-point `EDIF` zone lookup. */
    readonly edifPathBase?: string;
}

/** Why a Telde `EDIF` zone resolution refused. Closed vocabulary — operationally distinct. */
export type TeldeZoneRefusalReason =
    /** No usable WGS84 point was supplied — nothing to intersect the EDIF layer by. */
    | 'no-point'
    /** No `fetch` available, the endpoint could not be reached, or it returned a non-OK / bad body. */
    | 'endpoint-unreachable'
    /** The point-intersect returned no `EDIF` feature at this point. */
    | 'no-zone';

export interface TeldeZoneResolution {
    /** The validated, grammar-classified reading `readSipuZone` produced from the raw row. */
    readonly reading: SipuZoneReading;
}

export type TeldeZoneResult =
    | { readonly ok: true; readonly resolution: TeldeZoneResolution }
    | { readonly ok: false; readonly reason: TeldeZoneRefusalReason };

/** Read the first WFS/GeoJSON feature's `properties` from a body, or null. Never throws. */
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
        console.warn('[telde-zone] fetch failed (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false };
    }
}

/**
 * Resolve a Telde parcel's SIPU `EDIF` zone (`ES_TELDE_PGO2003_PACK` covers 31 of its 46 codes).
 * Point-intersects the (not-yet-server-wired) EDIF layer and hands the raw row to `readSipuZone`.
 * NEVER throws — every failure is a typed refusal (three honesty properties in the header).
 *
 * @param point  the parcel query point (WGS84).
 * @param deps   injectable fetch + proxy base.
 */
export async function resolveTeldeZone(
    point: TeldeLngLat | null | undefined,
    deps: TeldeZoneDeps = {},
): Promise<TeldeZoneResult> {
    const span = tracer.startSpan('pryzm.zoning.resolveTeldeZone');
    span.setAttribute('provider', 'sipu-edif-telde');
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

        const base = deps.edifPathBase ?? TELDE_EDIF_PATH;
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

        const rec = props as SipuEdifRecord;
        const reading = readSipuZone(rec);
        if (!reading.zoneCode) {
            span.setAttribute('resultFields', 'no-zone');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-zone' };
        }

        span.setAttribute('resultFields', 'ok');
        span.setAttribute('zoneCode', reading.zoneCode);
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: true, resolution: { reading } };
    } catch (err) {
        // Defensive: the whole path is best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn('[telde-zone] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'endpoint-unreachable' };
    } finally {
        span.end();
    }
}
