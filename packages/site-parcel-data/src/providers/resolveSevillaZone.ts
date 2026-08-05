// Sevilla (INE 41091) — the PGOU-2006 `Calificación` (Layer 25) point-intersect resolver.
//
// WHAT THIS IS
// ─────────────────────────────────────────────────────────────────────────────────────────────
// The ONE impure seam that binds a Sevilla parcel to its `zona_orden` — the field the founder's
// own research captures name as the zone identifier (`SOURCE-founder-sevilla-research-programme
// -2026-08-03.md` §A/§D, `FORENSIC-BLOCKER-AUDIT-2026-08-03.md` #5). It queries
// `cdu.urbanismosevilla.org/arcgis/rest/services/Info_Urban_Groups/PGOU/MapServer/25` ("Calificación")
// by point, via the reusable `queryArcgisRestPointIntersect` container (`containers/arcgisRest.ts`).
//
// ⚠⚠ IT RESOLVES DATA, IT DOES NOT DECIDE TO RENDER. This file reads no gate and computes no
// envelope; the L5 dispatcher (`siteDispatch.ts` §SEV-COMPUTE) decides, gated on
// `SEVILLA_ENVELOPE_VERIFIED` (`esSevilla.ts`). ⚠ This header previously asserted that flag was
// `false` and that "Sevilla has ZERO PRYZM rulepack code (no transcribed ordinance parameters)" —
// the 2026-08-03 state, corrected here: all fifteen live `zona_orden` codes are packed and the gate
// was signed 2026-08-05. What this resolver binds is unchanged either way: the real zone identity,
// so the outcome — a computed envelope, a cited structural refusal, or a coverage-gap card — always
// names the real zone rather than speaking generically, mirroring `resolveCordobaSubzone`'s three
// honesty properties.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// CRS + FIELD SCHEMA — VERIFIED LIVE (this task), NOT GUESSED
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Prior captures in this repo (`FORENSIC-BLOCKER-AUDIT-2026-08-03.md` #10,
// `SOURCE-founder-sevilla-research-programme-2026-08-03.md` §D.2) flagged the native CRS as
// "NOT FOUND" — an `EPSG:25830` figure sat beside self-flagged guesses. This file's CRS and field
// list come from a DIRECT fetch of the layer's OWN metadata,
// `https://cdu.urbanismosevilla.org/arcgis/rest/services/Info_Urban_Groups/PGOU/MapServer/25?f=json`,
// read 2026-08-03:
//
//   spatialReference: { wkid: 25830, latestWkid: 25830 }   — ETRS89 / UTM zone 30N. CONFIRMED,
//     not the prior survey's flagged guess.
//
//   fields (name : esri type : alias):
//     objectid   : esriFieldTypeOID      : OBJECTID
//     shape      : esriFieldTypeGeometry : Shape
//     clase_cat  : esriFieldTypeString   : CLASE_CAT
//     u_global   : esriFieldTypeString   : "Uso Global y Pormenorizado"
//     zona_orden : esriFieldTypeString   : "Zona de Ordenanza"        ← THE ZONE IDENTIFIER
//     det_comple : esriFieldTypeString   : "Determinaciones Complementarias"
//     altura_max : esriFieldTypeString   : "Altura máxima"            ← unit NOT established
//     enlace_ng  : esriFieldTypeString   : "Normas Generales"
//     enlace_np  : esriFieldTypeString   : "Normas Particulares"
//     se_mp_pgou : esriFieldTypeString   : "Modificación PGOU"
//     enlacesemp : esriFieldTypeString   : Enlace
//     publicar   : esriFieldTypeInteger  : Publicar
//     sentencia  : esriFieldTypeString   : Objeto
//
// ⚠ `altura_max` is `esriFieldTypeString`, NOT numeric — its unit (metres vs. storeys vs. a mixed
// notation) is UNRESOLVED by this fetch and is carried through here as a raw string, never parsed
// or interpreted as a number. Reading it as metres or storeys without a documented convention
// would be the exact L-616 / ADR-0287 fabrication `esValenciaEnvelope.ts`'s `altura` saga warns
// against. No caller of this resolver may treat `alturaMax` as a determination.
//
// ⚠ `enlace_ng`/`enlace_np` are carried through RAW. Whether they are a direct per-parcel PDF URL
// or require a further lookup is NOT verified by this fetch (the founder capture flags this as
// open) — so a caller must not assume `enlaceNp` is fetchable without checking it first.
//
// THREE HONESTY PROPERTIES (mirror `resolveCordobaSubzone`):
//   1. IT NEVER THROWS. Every miss / unreachable endpoint / malformed body returns a typed refusal.
//   2. IT DOES NOT DECIDE TO RENDER. The L5 dispatcher decides, gated on `SEVILLA_ENVELOPE_VERIFIED`
//      (default OFF, and there is no transcribed pack to gate open even if it were).
//   3. IT NEVER INVENTS A ZONE. An empty/unreachable response yields a typed refusal, never a
//      guessed `zona_orden`.
//
// Strategic context — findings/SOURCE-founder-sevilla-research-programme-2026-08-03.md,
// findings/FORENSIC-BLOCKER-AUDIT-2026-08-03.md, `containers/arcgisRest.ts`, C58 §1.4/§1.5/§1.9/
// §1.10, §CONTEXT-DATA-HONESTY, ADR-0294/ADR-0295 (region supplies providers, never a code path).

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { queryArcgisRestPointIntersect } from './containers/arcgisRest.js';
import { isInSevilla } from './sevillaBbox.js';

const tracer = trace.getTracer('pryzm.zoning');

/** The published feature service — `Info_Urban_Groups/PGOU`, confirmed live 2026-08-03. */
export const SEVILLA_ARCGIS_SERVICE =
    'https://cdu.urbanismosevilla.org/arcgis/rest/services/Info_Urban_Groups/PGOU/MapServer';

/** "Calificación" — the zoning layer, `zona_orden` the zone identifier. */
export const SEVILLA_CALIFICACION_LAYER = 25 as const;

/**
 * ETRS89 / UTM zone 30N. **CONFIRMED live** from `MapServer/25?f=json`'s own
 * `spatialReference.wkid`/`latestWkid` (2026-08-03) — this is the fact the prior surveys in this
 * repo explicitly flagged as unresolved; it is resolved here by reading the publisher's own
 * layer-detail metadata, not by re-guessing from a bare service-root probe.
 */
export const SEVILLA_NATIVE_EPSG = 25830 as const;

/** A WGS84 point — the frame the resolver queries the zone by. */
export interface SevillaLngLat {
    readonly lat: number;
    readonly lon: number;
}

export interface SevillaZoneDeps {
    /** Override `globalThis.fetch` (tests inject a fake). */
    readonly fetchImpl?: typeof fetch;
    /** Override the service root (tests, or a future same-origin proxy). */
    readonly serviceBase?: string;
}

/** Why a Sevilla zone resolution refused. Closed vocabulary — operationally distinct outcomes. */
export type SevillaZoneRefusalReason =
    /** No usable WGS84 point was supplied, or it falls outside the Sevilla routing box. */
    | 'out-of-sevilla'
    /** No `fetch` available. */
    | 'no-fetch'
    /** The endpoint could not be reached, or answered a transport/ArcGIS error body. */
    | 'service-error'
    /** The service answered correctly and Layer 25 carries no `Calificación` polygon here. */
    | 'no-zone-here';

export interface SevillaZoneResolution {
    /** `zona_orden` verbatim — the zone identifier, e.g. `"SB: Suburbana"`. */
    readonly zonaOrden: string;
    /** `clase_cat` verbatim — land classification. */
    readonly claseCat: string | null;
    /** `u_global` verbatim — "Uso Global y Pormenorizado". */
    readonly uGlobal: string | null;
    /** `det_comple` verbatim — "Determinaciones Complementarias". */
    readonly detComple: string | null;
    /**
     * `altura_max` VERBATIM, as a raw string. ⚠⚠ NEVER interpreted as a number here — its unit
     * (metres/storeys/mixed notation) is UNRESOLVED. Carried only so a caller can DISPLAY the
     * published value; it must not be treated as a determination.
     */
    readonly alturaMax: string | null;
    /** `enlace_ng` verbatim — "Normas Generales" link. Direct-vs-lookup status NOT verified. */
    readonly enlaceNg: string | null;
    /** `enlace_np` verbatim — "Normas Particulares" link. Direct-vs-lookup status NOT verified. */
    readonly enlaceNp: string | null;
}

export type SevillaZoneResult =
    | { readonly ok: true; readonly resolution: SevillaZoneResolution }
    | { readonly ok: false; readonly reason: SevillaZoneRefusalReason; readonly detail?: string };

const blank = (v: unknown): string | null => {
    const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
    return s.length ? s : null;
};

/**
 * Resolve a Sevilla parcel's PGOU-2006 `zona_orden` from the live `Calificación` layer (25).
 * **NEVER THROWS** — every failure is a typed refusal (three honesty properties in the header).
 *
 * @param point  the parcel query point (WGS84).
 * @param deps   injectable fetch + service base.
 */
export async function resolveSevillaZone(
    point: SevillaLngLat | null | undefined,
    deps: SevillaZoneDeps = {},
): Promise<SevillaZoneResult> {
    const span = tracer.startSpan('pryzm.zoning.resolveSevillaZone');
    span.setAttribute('provider', 'sevilla-arcgis-calificacion-25');
    span.setAttribute('epsg', SEVILLA_NATIVE_EPSG);
    try {
        if (
            !point ||
            typeof point.lat !== 'number' ||
            typeof point.lon !== 'number' ||
            !Number.isFinite(point.lat) ||
            !Number.isFinite(point.lon) ||
            !isInSevilla(point.lat, point.lon)
        ) {
            span.setAttribute('resultFields', 'out-of-sevilla');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'out-of-sevilla' };
        }

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('resultFields', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-fetch' };
        }

        const serviceBase = deps.serviceBase ?? SEVILLA_ARCGIS_SERVICE;
        const result = await queryArcgisRestPointIntersect({
            fetchImpl,
            serviceBase,
            layerId: SEVILLA_CALIFICACION_LAYER,
            lat: point.lat,
            lon: point.lon,
            inSR: 4326,
            outSR: SEVILLA_NATIVE_EPSG,
        });

        if (!result.ok) {
            span.setAttribute('resultFields', 'service-error');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'service-error', detail: result.detail };
        }

        const feature = result.features[0];
        if (!feature) {
            span.setAttribute('resultFields', 'no-zone-here');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-zone-here' };
        }

        const zonaOrden = blank(feature.attributes['zona_orden']);
        if (!zonaOrden) {
            // The layer answered a feature with no usable zone string — treat as "no zone here"
            // rather than invent one from an empty/whitespace value.
            span.setAttribute('resultFields', 'no-zone-here');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-zone-here' };
        }

        span.setAttribute('resultFields', 'ok');
        span.setAttribute('zonaOrden', zonaOrden);
        span.setStatus({ code: SpanStatusCode.OK });
        return {
            ok: true,
            resolution: {
                zonaOrden,
                claseCat: blank(feature.attributes['clase_cat']),
                uGlobal: blank(feature.attributes['u_global']),
                detComple: blank(feature.attributes['det_comple']),
                alturaMax: blank(feature.attributes['altura_max']),
                enlaceNg: blank(feature.attributes['enlace_ng']),
                enlaceNp: blank(feature.attributes['enlace_np']),
            },
        };
    } catch (e) {
        // Defensive: the whole path is best-effort — never throw into the caller.
        span.setAttribute('resultFields', 'service-error');
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: false, reason: 'service-error', detail: e instanceof Error ? e.message : String(e) };
    } finally {
        span.end();
    }
}
