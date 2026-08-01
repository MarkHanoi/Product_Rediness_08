// §MADRID-ZONE-ROUTING — `resolveMadridNormaZonal`: which **Norma Zonal** governs this parcel?
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS — the missing routing seam between a Madrid click and the PGOUM-97 rule pack
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `esMadridPgoum97.ts` holds 23 cited zones keyed by the live municipal vocabulary, `esMadridNZ1.ts`
// owns six more (`1.1`…`1.6`) and `madridNZ3Refusal` answers five (`3.1`…`3.2`). Nothing could reach
// any of them from a click, because nothing asked Madrid **which** Norma Zonal a parcel is in. The
// existing `resolveMadridNZ1Ring` cannot answer that question: it reads
// `PG_CONDICIONES_EDIFICACION/6`, an NZ-1-shaped plane whose `COND_EDIF` is a per-manzana condition
// code — and `sources/SOURCES.md` §0.3 states verbatim *"Take the zonal grado from
// `NORMAS_ZONALES.AMB_TX_ETIQ`, never from `COND_EDIF`."*
//
// So this module reads the MASTER ROUTING LAYER (MADRID-DATA-RECON-SPIKE §2, probed live
// 2026-07-24; `sources/VERIFICATION.md` V5 — ✅ VERIFIED-LIVE):
//
//   DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/MapServer/0   field `AMB_TX_ETIQ`
//
// whose distinct-value read returned exactly **34** codes. Those 34 are 23 (this pack) + 6 (NZ 1) +
// 5 (NZ 3) with nothing left over, which is why the routing table needs no translation layer: the
// extraction was performed against this very vocabulary.
//
// The join is SPATIAL — `CODMANZANA` is not a Catastro refcat substring (VERIFICATION.md V11) — so
// the query is a point-intersect on the parcel's WGS84 point, issued through the C57 same-origin
// proxy `/api/madrid/normas-zonales` (`server/madridNormasZonalesProxy.js`). The browser cannot
// reach sigma.madrid.es cross-origin under CSP `connect-src 'self'`.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// FOUR HONESTY PROPERTIES — read before changing this file
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. IT NEVER THROWS. Every miss / unreachable proxy / malformed body is a TYPED refusal, so the
//      L5 dispatcher always has something honest to render (mirrors `resolveChZone`,
//      `resolveMurciaZoning`, `resolveMadridNZ1Ring`).
//   2. FAILURE ≠ EMPTY. The proxy answers 502 when the municipal service did not answer and
//      200-with-`[]` when it answered and publishes no Norma Zonal at this point. This resolver
//      keeps them apart to the end (`endpoint-unreachable` vs `no-feature`). Collapsing them is the
//      documented §CONTEXT-DATA-HONESTY failure (L-422/457/467/469) — and here it would be
//      especially costly, because a genuine `no-feature` is EVIDENCE about the open zones-2/6/10/11
//      question (`SOURCES.md` §0.3 candidate (c): parcels that route nowhere).
//   3. IT REFUSES AMBIGUITY. A point-intersect on a planar coverage should return exactly one
//      polygon; two DIFFERENT codes means the click sits on a zone boundary (or the layer overlaps
//      itself), and a zone chosen by `features[0]` is a coin flip. Identical duplicates collapse.
//   4. IT RESOLVES NO NUMBER, AND CANNOT. `sources/VERIFICATION.md` V7 is a VERIFIED-NEGATIVE: no
//      `ALTURA`/`PLANTAS`/`FONDO`/`RETRANQUEO` attribute or coded-value domain exists on ANY
//      PGOUM-97 service. Madrid's parametric numbers are genuinely not in GIS — they are in the
//      Compendio, and the pack that transcribed them is human-gated. This module returns IDENTITY.
//
// ⚠ IT ALSO DOES NOT CLASSIFY. Mapping a code to a pack / a refusal / a coverage gap is the
// registry's job (`rulepacks/registry.ts`) and the dispatcher's; keeping that out of here is what
// lets a future Madrid zone become a DATA addition rather than a provider edit (C58 §1.5).
//
// PURITY of the parse (C58 §1.9): the fetch is injected; given the same body the parse is
// byte-deterministic. OTel span `pryzm.zoning.resolveMadridNormaZonal` (C58 §1.10 / P8).
//
// Strategic context — C57 (same-origin proxy seam), C58 §1.4/§1.5/§1.9/§1.10, §CONTEXT-DATA-HONESTY,
// docs/04-reference/jurisdictions/es/es-md/28079-madrid/sources/SOURCES.md §0.3.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { isInMadrid } from './madridBbox.js';

const tracer = trace.getTracer('pryzm.zoning');

/** The same-origin proxy route the browser calls (never sigma.madrid.es directly — C57 CSP). */
export const MADRID_NORMAS_ZONALES_PATH = '/api/madrid/normas-zonales';

/** The master Norma-Zonal routing layer id, for provenance/logging. The proxy owns the real URL. */
export const MADRID_NORMAS_ZONALES_LAYER = 0;

/**
 * The attribute carrying the `<zona>.<grado>` routing code — 34 distinct live values, VERIFIED-LIVE
 * 2026-07-24. Named as a constant because it is the ONE field the whole Madrid routing rests on.
 */
export const MADRID_ZONE_CODE_FIELD = 'AMB_TX_ETIQ' as const;

/**
 * The attribute carrying the official denomination. ⚠ ASSERTED-not-verified: probe P1 in
 * `sources/VERIFICATION.md` §1a has never been run, so this resolver REQUESTS it and reports `null`
 * when it is absent. An absent label is absent — it is never synthesised from the code.
 */
export const MADRID_ZONE_LABEL_FIELD = 'AMB_TX_DENOM' as const;

/** A WGS84 query point. The proxy owns the Esri query construction. */
export interface MadridZoneLatLon {
    readonly lat: number;
    readonly lon: number;
}

/** Injectable dependencies so the resolver is unit-testable without the network. */
export interface MadridNormaZonalDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production uses the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy base (default `MADRID_NORMAS_ZONALES_PATH`). */
    readonly pathBase?: string;
}

/** Why a Madrid Norma-Zonal resolution refused. Closed vocabulary — these are operationally distinct. */
export type MadridNormaZonalRefusalReason =
    /** The point is outside the loose Madrid bbox, or is not finite — nothing to query. */
    | 'out-of-madrid'
    /** No `fetch`, the proxy could not be reached, or it returned a non-OK / bad body. */
    | 'endpoint-unreachable'
    /** The layer ANSWERED and publishes no Norma Zonal at this point (a real negative). */
    | 'no-feature'
    /** Two DIFFERENT codes cover the point (a boundary) — refuse, never guess. */
    | 'ambiguous-zone'
    /** Features came back but none carried a readable `AMB_TX_ETIQ`. */
    | 'unparsable-response';

export type MadridNormaZonalResolution =
    | {
          readonly ok: true;
          /** The live `AMB_TX_ETIQ` value, VERBATIM and trimmed — e.g. `'8.2.b'`, `'4'`, `'1.3'`. */
          readonly zoneCode: string;
          /** `AMB_TX_DENOM` verbatim, or `null` when the layer published none (never synthesised). */
          readonly zoneLabel: string | null;
      }
    | { readonly ok: false; readonly reason: MadridNormaZonalRefusalReason };

/** Read an Esri attribute as a trimmed non-empty string, else null. Never throws, never coerces. */
function attrStr(attributes: Record<string, unknown>, key: string): string | null {
    const v = attributes[key];
    if (typeof v === 'string') {
        const t = v.trim();
        return t === '' ? null : t;
    }
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return null;
}

/** One parsed Esri feature: the routing code plus its (optional) official denomination. */
interface MadridZoneAttrs {
    readonly zoneCode: string;
    readonly zoneLabel: string | null;
}

/**
 * Map one Esri feature to its Norma-Zonal identity. PURE. Field names are VERBATIM from the live
 * layer — renaming them here would silently decouple us from the source. Returns null when the
 * feature carries no readable routing code.
 */
export function readMadridZoneFeature(feature: unknown): MadridZoneAttrs | null {
    if (!feature || typeof feature !== 'object') return null;
    const attributes = (feature as { attributes?: unknown }).attributes;
    if (!attributes || typeof attributes !== 'object') return null;
    const bag = attributes as Record<string, unknown>;
    const zoneCode = attrStr(bag, MADRID_ZONE_CODE_FIELD);
    if (zoneCode === null) return null;
    return { zoneCode, zoneLabel: attrStr(bag, MADRID_ZONE_LABEL_FIELD) };
}

/**
 * Resolve the Norma Zonal governing a WGS84 point, through the same-origin
 * `/api/madrid/normas-zonales` proxy. NEVER throws — every failure is a typed refusal.
 *
 * ⚠ Returns IDENTITY, never a buildable number: the PGOUM-97 GIS publishes none (honesty property
 * 4). The caller routes the code — NZ 1 to its settled explicit-area path, NZ 3 to its legally
 * grounded refusal, the 23 packed codes to the human-gated PGOUM-97 pack.
 */
export async function resolveMadridNormaZonal(
    point: MadridZoneLatLon | null | undefined,
    deps: MadridNormaZonalDeps = {},
): Promise<MadridNormaZonalResolution> {
    const span = tracer.startSpan('pryzm.zoning.resolveMadridNormaZonal');
    span.setAttribute('provider', 'madrid-normas-zonales');
    try {
        if (
            !point ||
            !Number.isFinite(point.lat) ||
            !Number.isFinite(point.lon) ||
            !isInMadrid(point.lat, point.lon)
        ) {
            span.setAttribute('resultFields', 'out-of-madrid');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'out-of-madrid' };
        }

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('resultFields', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'endpoint-unreachable' };
        }
        const base = deps.pathBase ?? MADRID_NORMAS_ZONALES_PATH;
        const url =
            `${base}?lat=${encodeURIComponent(String(point.lat))}` +
            `&lon=${encodeURIComponent(String(point.lon))}`;

        let body: unknown = null;
        try {
            const res = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' } });
            if (!res || !res.ok) {
                // Includes the proxy's own 502 — "the municipal service did not answer", which is
                // NOT "there is no Norma Zonal here". Keeping them apart is honesty property (2).
                span.setAttribute('resultFields', 'upstream-miss');
                span.setStatus({ code: SpanStatusCode.OK });
                return { ok: false, reason: 'endpoint-unreachable' };
            }
            body = await res.json();
        } catch (fetchErr) {
            span.setAttribute('resultFields', 'fetch-error');
            span.setStatus({ code: SpanStatusCode.OK });
            console.warn('[madrid-zone] fetch failed (non-fatal):', (fetchErr as Error)?.message ?? fetchErr);
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        const features = (body as { features?: unknown } | null)?.features;
        const list = Array.isArray(features) ? features : [];
        if (list.length === 0) {
            // The layer ANSWERED with nothing. A real negative, and a datum for the open
            // zones-2/6/10/11 question — never to be reported as an outage.
            span.setAttribute('resultFields', 'no-feature');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-feature' };
        }

        const parsed = list
            .map(readMadridZoneFeature)
            .filter((r): r is MadridZoneAttrs => r !== null);
        if (parsed.length === 0) {
            // Features came back but not one carried `AMB_TX_ETIQ` — the layer may have changed
            // shape. NAME that rather than report a clean "nothing here" (L-422).
            span.setAttribute('resultFields', 'unparsable-response');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'unparsable-response' };
        }

        const first = parsed[0]!;
        if (parsed.some((p) => p.zoneCode !== first.zoneCode)) {
            span.setAttribute('resultFields', 'ambiguous-zone');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'ambiguous-zone' };
        }

        span.setAttribute('resultFields', 'zone');
        span.setAttribute('zoneCode', first.zoneCode);
        span.setStatus({ code: SpanStatusCode.OK });
        // Prefer the first covering record that actually carries a denomination: identical codes
        // may differ in label completeness, and a present label beats an absent one. Never invented.
        const zoneLabel = parsed.find((p) => p.zoneLabel !== null)?.zoneLabel ?? null;
        return { ok: true, zoneCode: first.zoneCode, zoneLabel };
    } catch (err) {
        // Defensive: the whole path is best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn('[madrid-zone] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'endpoint-unreachable' };
    } finally {
        span.end();
    }
}
