// SWITZERLAND — `resolveChZone`: the national Grundnutzung (land-use zone) resolver.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS — the ONE honest, shippable Swiss win (SWITZERLAND-DATA-RECON-SPIKE.md §0 verdict)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The deciding probe (2026-07-24) established **Outcome B**: Switzerland's national Nutzungsplanung
// WFS (`geodienste.ch/db/npl_nutzungsplanung_v1_2_0/deu`, layer `ms:grundnutzung`) publishes the
// **zone IDENTIFICATION** as structured data — `typ_kommunal_code`, `typ_kommunal_bezeichnung`,
// `hauptnutzung_code/bezeichnung`, `bemerkungen` (the local abbreviation, e.g. `W2`), `rechtsstatus`,
// `kanton`, `dokument` — but carries **NO** `nutzungsziffer` (FAR), `geschosszahl` (floors) or
// `gebäudehöhe` (height). Those are model+PDF-bound (the optional federal INTERLIS `Typ.Nutzungsziffer`
// slot + the cantonal Baureglement PDF), NOT national WFS attributes. See the recon §1–2.
//
// So this resolver returns the **ZONE**, at `structured` confidence, and the buildable ENVELOPE is a
// cited REFUSAL (`chZoning.ts` → `chZoningEnvelopeRefusal`). It NEVER fabricates a density or a height.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// HONESTY PROPERTIES — read before changing this file
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. IT NEVER THROWS. Every miss / unreachable endpoint / non-OK / malformed body / parse failure
//      returns a typed REFUSAL, so the L5 dispatcher shows a cited refusal, never a fabricated number
//      (mirrors `DkZoningProvider.fetchZoningAtPoint` and `resolveMadridNZ1Ring`).
//   2. IT REFUSES AMBIGUITY. A point that intersects more than one grundnutzung polygon (a zone
//      boundary) is genuinely ambiguous; a zone derived from a coin-flip is exactly what C58 forbids,
//      so `ambiguous-zone` refuses rather than pick `features[0]` (mirrors the MUC one-container gate).
//   3. IT DOES NOT INVENT NUMBERS. There is no density/height field ANYWHERE in this module's output —
//      not null-that-could-be-filled, but structurally absent, because the WFS does not publish them.
//
// LAYERING (C58 §1.9): the fetch (through the C57 same-origin proxy `/api/ch/grundnutzung`, never
// browser→geodienste directly under CSP) is the ONE impure seam; `parseChGrundnutzungGml` is PURE and
// deterministic and is what the fixture tests exercise against the captured recon feature. Injectable
// `fetchImpl`. OTel span `pryzm.zoning.resolveChZone` (C58 §1.10 / P8).
//
// ⚠ geodienste.ch is NOT geo-blocked (recon §4 origin note); the ZG *cantonal* WFS is — so this uses
// the NATIONAL endpoint (19+ cantons via one call), wired server-side in `server/chGrundnutzungProxy.js`.
//
// Strategic context — docs/04-reference/jurisdictions/ch/findings/SWITZERLAND-DATA-RECON-SPIKE.md,
// ch/RATE-IMPLEMENTATION-PLAN.md §Phase 1, C58 §1.2/§1.4/§1.5/§1.10.

import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.zoning');

/** The same-origin proxy route the browser calls (never geodienste.ch directly — C57 CSP). */
export const CH_GRUNDNUTZUNG_PATH = '/api/ch/grundnutzung';

/** The national Nutzungsplanung WFS layer the zone is read from (recon §1). */
export const CH_GRUNDNUTZUNG_LAYER = 'ms:grundnutzung';

/**
 * The identified Swiss land-use zone — the STRUCTURED half of Outcome B. Every field mirrors a
 * `ms:grundnutzung` element from the national WFS (recon §1.1/§1.2). There is DELIBERATELY no FAR /
 * floors / height field: those are model+PDF-bound and are refused, never carried here as a fillable
 * null (which would blur "absent from the WFS" with "we haven't fetched it yet").
 */
export interface ChZoneIdentification {
    /** `typ_kommunal_code` — the municipal zone code (e.g. `1102`). Keys the future FAR catalogue. */
    readonly typKommunalCode: string | null;
    /** `typ_kommunal_bezeichnung` — the municipal zone label (e.g. `Wohnzone`). */
    readonly typKommunalBezeichnung: string | null;
    /** `hauptnutzung_code` — the national main-use code (e.g. `11`). */
    readonly hauptnutzungCode: string | null;
    /** `hauptnutzung_bezeichnung` — the national main-use label (e.g. `Wohnzonen`). */
    readonly hauptnutzungBezeichnung: string | null;
    /** `bemerkungen` — the LOCAL abbreviation the zone number implies (e.g. `W2`). */
    readonly bemerkungen: string | null;
    /** `rechtsstatus` — legal status (e.g. `inKraft`). */
    readonly rechtsstatus: string | null;
    /** `kanton` — the two-letter canton (e.g. `AI`). Keys the future per-canton FAR harvest. */
    readonly kanton: string | null;
    /** `dokument` — a link/JSON to the governing Baureglement, when the canton populates it (else null). */
    readonly dokument: string | null;
}

/** Why a Swiss zone resolution refused. Closed vocabulary — these are operationally distinct. */
export type ChZoneRefusalReason =
    /** The point is outside the loose Swiss bbox — nothing to query. */
    | 'out-of-switzerland'
    /** No `fetch`, the proxy could not be reached, or it returned a non-OK / bodyless response. */
    | 'endpoint-unreachable'
    /** The WFS returned zero grundnutzung polygons at the point (no published zone here). */
    | 'no-zone-here'
    /** More than one grundnutzung polygon intersects the point (a boundary) — refuse, never guess. */
    | 'ambiguous-zone'
    /** A body was returned but no grundnutzung feature with any zone identity could be parsed. */
    | 'unparsable-response';

export type ChZoneResolution =
    | { readonly ok: true; readonly zone: ChZoneIdentification }
    | { readonly ok: false; readonly reason: ChZoneRefusalReason };

/** Injectable dependencies so the resolver is unit-testable without the network (mirrors `ZoningProviderDeps`). */
export interface ChZoneDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production uses the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy path base (default `CH_GRUNDNUTZUNG_PATH`). */
    readonly pathBase?: string;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE PURE PARSE — GML featureCollection → grundnutzung features
// ──────────────────────────────────────────────────────────────────────────────────────────────
//
// `outputFormat=application/json` is rejected for this layer (recon §1.2), so the transport is GML.
// The grundnutzung feature members carry FLAT text elements (no nesting), so a deterministic
// element-extraction is sufficient and honest; it never guesses geometry. Namespace-prefix-tolerant.

/** Decode the handful of XML entities that appear in these text elements. */
function decodeXmlEntities(s: string): string {
    return s
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

/** Extract one flat text element's value from a feature block, or null (absent / self-closing / blank). */
function extractTag(block: string, local: string): string | null {
    // Prefix-tolerant open+close (`<ms:foo>…</ms:foo>` or `<foo>…</foo>`); non-greedy body.
    const re = new RegExp(
        `<(?:[A-Za-z0-9_]+:)?${local}\\b[^>]*?>([\\s\\S]*?)</(?:[A-Za-z0-9_]+:)?${local}>`,
    );
    const m = re.exec(block);
    if (!m) return null; // absent OR self-closing (`<ms:foo/>`) — both are honest absence.
    const raw = decodeXmlEntities(m[1] ?? '').trim();
    return raw === '' ? null : raw;
}

/** A parsed grundnutzung feature — exactly the fields the national layer publishes (recon §1.1). */
export interface ChGrundnutzungFeature {
    readonly typKommunalCode: string | null;
    readonly typKommunalBezeichnung: string | null;
    readonly hauptnutzungCode: string | null;
    readonly hauptnutzungBezeichnung: string | null;
    readonly bemerkungen: string | null;
    readonly rechtsstatus: string | null;
    readonly kanton: string | null;
    readonly dokument: string | null;
}

/**
 * Parse a WFS 2.0 GML `GetFeature` response for `ms:grundnutzung` into its feature members. PURE +
 * deterministic — no I/O, no guess. Prefix-tolerant on the feature element and every field. Returns
 * one entry per grundnutzung polygon the WFS returned (0, 1, or many — the caller decides disposition).
 */
export function parseChGrundnutzungGml(gml: string | null | undefined): ChGrundnutzungFeature[] {
    if (typeof gml !== 'string' || gml.length === 0) return [];
    // Each feature is a `grundnutzung` element (any namespace prefix), non-greedy to its own close.
    const featureRe = /<(?:[A-Za-z0-9_]+:)?grundnutzung\b[\s\S]*?<\/(?:[A-Za-z0-9_]+:)?grundnutzung>/g;
    const out: ChGrundnutzungFeature[] = [];
    let m: RegExpExecArray | null;
    while ((m = featureRe.exec(gml)) !== null) {
        const block = m[0];
        out.push({
            typKommunalCode: extractTag(block, 'typ_kommunal_code'),
            typKommunalBezeichnung: extractTag(block, 'typ_kommunal_bezeichnung'),
            hauptnutzungCode: extractTag(block, 'hauptnutzung_code'),
            hauptnutzungBezeichnung: extractTag(block, 'hauptnutzung_bezeichnung'),
            bemerkungen: extractTag(block, 'bemerkungen'),
            rechtsstatus: extractTag(block, 'rechtsstatus'),
            kanton: extractTag(block, 'kanton'),
            dokument: extractTag(block, 'dokument'),
        });
    }
    return out;
}

/** True when a parsed feature carries at least one usable zone-identity field (else it is noise). */
function hasZoneIdentity(f: ChGrundnutzungFeature): boolean {
    return (
        f.typKommunalCode !== null ||
        f.typKommunalBezeichnung !== null ||
        f.hauptnutzungCode !== null ||
        f.bemerkungen !== null
    );
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE IMPURE SEAM — resolve the zone at a WGS84 point
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the Swiss land-use zone at a WGS84 point from the national Nutzungsplanung WFS (through the
 * same-origin `/api/ch/grundnutzung` proxy, which forwards a point-BBOX `GetFeature` to geodienste.ch
 * and returns the raw GML). NEVER throws — every failure is a typed refusal (see the header honesty
 * properties). The buildable envelope is refused separately (`chZoningEnvelopeRefusal`): this resolver
 * only IDENTIFIES the zone; it never returns a density or a height.
 *
 * @param lat  EPSG:4326 latitude of the parcel's representative point.
 * @param lon  EPSG:4326 longitude.
 */
export async function resolveChZone(
    lat: number,
    lon: number,
    deps: ChZoneDeps = {},
): Promise<ChZoneResolution> {
    const span = tracer.startSpan('pryzm.zoning.resolveChZone');
    span.setAttribute('provider', 'geodienste-ch-grundnutzung');
    try {
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            span.setAttribute('resultFields', 'out-of-switzerland');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'out-of-switzerland' };
        }

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('resultFields', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'endpoint-unreachable' };
        }
        const base = deps.pathBase ?? CH_GRUNDNUTZUNG_PATH;
        const url =
            `${base}?lat=${encodeURIComponent(String(lat))}` +
            `&lon=${encodeURIComponent(String(lon))}`;

        let gml: string | null = null;
        try {
            const res = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' } });
            if (!res || !res.ok) {
                span.setAttribute('resultFields', 'upstream-miss');
                span.setStatus({ code: SpanStatusCode.OK });
                return { ok: false, reason: 'endpoint-unreachable' };
            }
            const body = (await res.json()) as { gml?: string | null } | null;
            gml = body?.gml ?? null;
        } catch (fetchErr) {
            span.setAttribute('resultFields', 'fetch-error');
            span.setStatus({ code: SpanStatusCode.OK });
            console.warn('[ch-zoning] fetch failed (non-fatal):', (fetchErr as Error)?.message ?? fetchErr);
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        if (gml === null) {
            // The proxy answered but carried no GML — no zone at the point (negative result).
            span.setAttribute('resultFields', 'no-zone-here');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-zone-here' };
        }

        const features = parseChGrundnutzungGml(gml).filter(hasZoneIdentity);
        if (features.length === 0) {
            // A body came back but nothing parseable as a zone. Distinct from a clean miss: the
            // WFS may have changed shape, so name it rather than silently report "no zone here".
            const isEmptyCollection = /numberReturned=["']0["']|numberMatched=["']0["']/.test(gml);
            const reason: ChZoneRefusalReason = isEmptyCollection ? 'no-zone-here' : 'unparsable-response';
            span.setAttribute('resultFields', reason);
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason };
        }
        if (features.length > 1) {
            // A point on a zone boundary intersected several polygons — refuse, never guess (§2).
            span.setAttribute('resultFields', 'ambiguous-zone');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'ambiguous-zone' };
        }

        const f = features[0]!;
        const zone: ChZoneIdentification = {
            typKommunalCode: f.typKommunalCode,
            typKommunalBezeichnung: f.typKommunalBezeichnung,
            hauptnutzungCode: f.hauptnutzungCode,
            hauptnutzungBezeichnung: f.hauptnutzungBezeichnung,
            bemerkungen: f.bemerkungen,
            rechtsstatus: f.rechtsstatus,
            kanton: f.kanton,
            dokument: f.dokument,
        };
        span.setAttribute('resultFields', 'zone');
        span.setAttribute('typKommunalCode', zone.typKommunalCode ?? 'n/a');
        span.setAttribute('kanton', zone.kanton ?? 'n/a');
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: true, zone };
    } catch (err) {
        // Defensive: the whole path is best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn('[ch-zoning] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'endpoint-unreachable' };
    } finally {
        span.end();
    }
}
