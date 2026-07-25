// SWITZERLAND / canton Zürich — `resolveZurichBzoZone`: the Stadt Zürich BZO (Bau- und Zonenordnung)
// land-use zone resolver — the FINE-GRAINED, MUNICIPAL half of the Swiss Outcome-B zone-ID.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS — the Zürich-reference-commune upgrade over the national resolver (ZURICH-BZO-PROBE §2)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The deciding Zürich probe (2026-07-25) established that the City of Zürich publishes its BZO as an
// open WFS (`ogd.stadt-zuerich.ch/wfs/geoportal/Nutzungsplanung___kommunale_Bau__und_Zonenordnung__BZO_`,
// layer `bzo_zone_v`, EPSG:2056) whose zone-polygon feature carries, as STRUCTURED data:
//   • `typ`                   — the MUNICIPAL zone code (e.g. `W2bIII`, `Z5`, `Oe5`, `E1`) — finer than
//                               the national `typ_kommunal_code`, and it ENCODES the Vollgeschosse in
//                               the Roman-numeral suffix (a signal, not a number we may cite as height).
//   • `rechtsstatus`          — legal status (e.g. `inKraft`).
//   • `rechtsvorschrift_url`  — a DIRECT link to THIS parcel's governing ordinance (BZO 700.100) on
//                               oerebdocs.zh.ch — the citation the national WFS's null `dokument` lacks.
//   • `plan_url`, `mutationsnummer`, `objectid` — provenance.
//
// ⚠ THE CRUX (ZURICH-BZO-PROBE §3): `DescribeFeatureType` for `bzo_zone_v` — AND for the dedicated
// `bzo_zone_erhoehte_az_v` ("Gebiete mit erhöhter Ausnützung") — carry **NO** numeric field: no
// `ausnuetzungsziffer`/`az`, no `vollgeschosse`, no `gebaeudehoehe`, no `baumassenziffer`. The
// Ausnützungsziffer / max height / Vollgeschosse are PDF-bound in the BZO 700.100 Bauordnung table,
// keyed by the `typ` code — recoverable only by a HUMAN-VERIFIED transcription of that article table
// (the L-449 gate, `CH_FAR_CERTIFIED`, still OFF). So Outcome B holds even for the best-provisioned
// canton: this resolver returns the RICHER zone IDENTITY (municipal code + a direct ordinance link),
// and the buildable ENVELOPE is a cited REFUSAL (`chZurichBzo.ts` → `zurichBzoEnvelopeRefusal`) that
// names the exact per-parcel BZO document. It NEVER fabricates a density or a height.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// HONESTY PROPERTIES — read before changing this file (identical discipline to `resolveChZone`)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. IT NEVER THROWS. Every miss / unreachable endpoint / non-OK / malformed body / parse failure
//      returns a typed REFUSAL, so the L5 dispatcher shows a cited refusal, never a fabricated number
//      (mirrors `resolveChZone` / `resolveMadridNZ1Ring`). ⚠ Until the same-origin Zürich BZO proxy is
//      wired server-side (`/api/ch/zurich-bzo`, the Madrid-proxy staging pattern), this resolves
//      `endpoint-unreachable` in production and the CH path falls through to the NATIONAL resolver —
//      a non-breaking upgrade, exactly like Madrid before its proxy landed.
//   2. IT REFUSES AMBIGUITY. A point that intersects more than one `bzo_zone_v` polygon (a zone
//      boundary) is genuinely ambiguous; a zone from a coin-flip is what C58 forbids, so `ambiguous-zone`
//      refuses rather than pick `features[0]` (mirrors `resolveChZone`).
//   3. IT DOES NOT INVENT NUMBERS. There is no density/height/floors field ANYWHERE in this module's
//      output — not a null-that-could-be-filled, but structurally absent, because the WFS does not
//      publish them (the §CONTEXT-DATA-HONESTY family: a REFUSAL and a FABRICATION must not collapse).
//
// LAYERING (C58 §1.9): the fetch (through the C57 same-origin proxy `/api/ch/zurich-bzo`, never
// browser→ogd.stadt-zuerich.ch directly under CSP) is the ONE impure seam; `parseZurichBzoGml` is PURE
// and deterministic and is what the fixture tests exercise against the captured probe feature.
// Injectable `fetchImpl`. OTel span `pryzm.zoning.resolveZurichBzoZone` (C58 §1.10 / P8).
//
// Strategic context — docs/04-reference/jurisdictions/ch/regions/zurich/ZURICH-BZO-PROBE.md,
// ch/RATE-IMPLEMENTATION-PLAN.md §Phase 2, C58 §1.2/§1.4/§1.5/§1.10.

import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.zoning');

/** The same-origin proxy route the browser calls (never ogd.stadt-zuerich.ch directly — C57 CSP).
 *  Server proxy is a follow-up (Madrid-staging pattern); while absent this resolves unreachable. */
export const CH_ZURICH_BZO_PATH = '/api/ch/zurich-bzo';

/** The Stadt Zürich BZO WFS layer the zone is read from (ZURICH-BZO-PROBE §2). */
export const CH_ZURICH_BZO_LAYER = 'bzo_zone_v';

/**
 * The identified Stadt-Zürich BZO zone — the STRUCTURED half of Outcome B, at MUNICIPAL granularity.
 * Every field mirrors a `bzo_zone_v` element from the city WFS (probe §2). There is DELIBERATELY no
 * FAR / floors / height field: those are PDF-bound (BZO 700.100 Bauordnung) and are refused, never
 * carried here as a fillable null (which would blur "absent from the WFS" with "not yet fetched").
 */
export interface ZurichBzoZoneIdentification {
    /** `typ` — the municipal BZO zone code (e.g. `W2bIII`, `Z5`, `Oe5`, `E1`). Keys the BZO 700.100 table. */
    readonly typ: string | null;
    /** `rechtsstatus` — legal status (e.g. `inKraft`). */
    readonly rechtsstatus: string | null;
    /** `rechtsvorschrift_url` — a DIRECT link to THIS parcel's governing BZO ordinance (oerebdocs.zh.ch). */
    readonly rechtsvorschriftUrl: string | null;
    /** `plan_url` — the plan sheet link, when populated (else null). */
    readonly planUrl: string | null;
    /** `mutationsnummer` — the mutation reference, when populated (else null). */
    readonly mutationsnummer: string | null;
    /** `objectid` — the WFS feature id (provenance). */
    readonly objectid: string | null;
}

/** Why a Zürich BZO zone resolution refused. Closed vocabulary — these are operationally distinct. */
export type ZurichBzoRefusalReason =
    /** The point is outside the loose City-of-Zürich bbox — nothing to query. */
    | 'out-of-zurich'
    /** No `fetch`, the proxy could not be reached, or it returned a non-OK / bodyless response. */
    | 'endpoint-unreachable'
    /** The WFS returned zero `bzo_zone_v` polygons at the point (no published BZO zone here). */
    | 'no-zone-here'
    /** More than one `bzo_zone_v` polygon intersects the point (a boundary) — refuse, never guess. */
    | 'ambiguous-zone'
    /** A body was returned but no `bzo_zone_v` feature with any zone identity could be parsed. */
    | 'unparsable-response';

export type ZurichBzoResolution =
    | { readonly ok: true; readonly zone: ZurichBzoZoneIdentification }
    | { readonly ok: false; readonly reason: ZurichBzoRefusalReason };

/** Injectable dependencies so the resolver is unit-testable without the network (mirrors `ChZoneDeps`). */
export interface ZurichBzoDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production uses the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy path base (default `CH_ZURICH_BZO_PATH`). */
    readonly pathBase?: string;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE PURE PARSE — GML featureCollection → bzo_zone_v features
// ──────────────────────────────────────────────────────────────────────────────────────────────
//
// The Stadt Zürich BZO WFS (QGIS Server) publishes GML with `qgs:`-prefixed flat text elements (no
// nesting), so a deterministic element-extraction is sufficient and honest; it never guesses geometry.
// Namespace-prefix-tolerant, exactly like `parseChGrundnutzungGml`.

/** Decode the handful of XML entities that appear in these text elements. */
function decodeXmlEntities(s: string): string {
    return s
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

/** Extract one flat text element's value from a feature block, or null (absent / self-closing / blank / xsi:nil). */
function extractTag(block: string, local: string): string | null {
    // Prefix-tolerant open+close (`<qgs:foo>…</qgs:foo>` or `<foo>…</foo>`); non-greedy body.
    const re = new RegExp(
        `<(?:[A-Za-z0-9_]+:)?${local}\\b[^>]*?>([\\s\\S]*?)</(?:[A-Za-z0-9_]+:)?${local}>`,
    );
    const m = re.exec(block);
    if (!m) return null; // absent OR self-closing (`<qgs:foo/>`) OR nil (`<qgs:foo xsi:nil="true"/>`).
    const raw = decodeXmlEntities(m[1] ?? '').trim();
    return raw === '' ? null : raw;
}

/** A parsed `bzo_zone_v` feature — exactly the fields the city BZO layer publishes (probe §2). */
export interface ZurichBzoFeature {
    readonly typ: string | null;
    readonly rechtsstatus: string | null;
    readonly rechtsvorschriftUrl: string | null;
    readonly planUrl: string | null;
    readonly mutationsnummer: string | null;
    readonly objectid: string | null;
}

/**
 * Parse a WFS 1.1.0 GML `GetFeature` response for `bzo_zone_v` into its feature members. PURE +
 * deterministic — no I/O, no guess. Prefix-tolerant on the feature element and every field. Returns
 * one entry per `bzo_zone_v` polygon the WFS returned (0, 1, or many — the caller decides disposition).
 */
export function parseZurichBzoGml(gml: string | null | undefined): ZurichBzoFeature[] {
    if (typeof gml !== 'string' || gml.length === 0) return [];
    // Each feature is a `bzo_zone_v` element (any namespace prefix), non-greedy to its own close.
    const featureRe = /<(?:[A-Za-z0-9_]+:)?bzo_zone_v\b[\s\S]*?<\/(?:[A-Za-z0-9_]+:)?bzo_zone_v>/g;
    const out: ZurichBzoFeature[] = [];
    let m: RegExpExecArray | null;
    while ((m = featureRe.exec(gml)) !== null) {
        const block = m[0];
        out.push({
            typ: extractTag(block, 'typ'),
            rechtsstatus: extractTag(block, 'rechtsstatus'),
            rechtsvorschriftUrl: extractTag(block, 'rechtsvorschrift_url'),
            planUrl: extractTag(block, 'plan_url'),
            mutationsnummer: extractTag(block, 'mutationsnummer'),
            objectid: extractTag(block, 'objectid'),
        });
    }
    return out;
}

/** True when a parsed feature carries at least one usable zone-identity field (else it is noise). */
function hasZoneIdentity(f: ZurichBzoFeature): boolean {
    return f.typ !== null || f.rechtsvorschriftUrl !== null;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE IMPURE SEAM — resolve the BZO zone at a WGS84 point
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the Stadt-Zürich BZO land-use zone at a WGS84 point from the city BZO WFS (through the
 * same-origin `/api/ch/zurich-bzo` proxy, which forwards a point-BBOX `GetFeature` to
 * ogd.stadt-zuerich.ch and returns the raw GML). NEVER throws — every failure is a typed refusal (see
 * the header honesty properties). The buildable envelope is refused separately
 * (`zurichBzoEnvelopeRefusal`): this resolver only IDENTIFIES the zone; it never returns a density or
 * a height.
 *
 * @param lat  EPSG:4326 latitude of the parcel's representative point.
 * @param lon  EPSG:4326 longitude.
 */
export async function resolveZurichBzoZone(
    lat: number,
    lon: number,
    deps: ZurichBzoDeps = {},
): Promise<ZurichBzoResolution> {
    const span = tracer.startSpan('pryzm.zoning.resolveZurichBzoZone');
    span.setAttribute('provider', 'stadt-zuerich-bzo');
    try {
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            span.setAttribute('resultFields', 'out-of-zurich');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'out-of-zurich' };
        }

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('resultFields', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'endpoint-unreachable' };
        }
        const base = deps.pathBase ?? CH_ZURICH_BZO_PATH;
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
            console.warn('[ch-zurich-bzo] fetch failed (non-fatal):', (fetchErr as Error)?.message ?? fetchErr);
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        if (gml === null) {
            // The proxy answered but carried no GML — no BZO zone at the point (negative result).
            span.setAttribute('resultFields', 'no-zone-here');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-zone-here' };
        }

        const features = parseZurichBzoGml(gml).filter(hasZoneIdentity);
        if (features.length === 0) {
            // A body came back but nothing parseable as a zone. Distinct from a clean miss: the
            // WFS may have changed shape, so name it rather than silently report "no zone here".
            const isEmptyCollection = /numberReturned=["']0["']|numberMatched=["']0["']/.test(gml);
            const reason: ZurichBzoRefusalReason = isEmptyCollection ? 'no-zone-here' : 'unparsable-response';
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
        const zone: ZurichBzoZoneIdentification = {
            typ: f.typ,
            rechtsstatus: f.rechtsstatus,
            rechtsvorschriftUrl: f.rechtsvorschriftUrl,
            planUrl: f.planUrl,
            mutationsnummer: f.mutationsnummer,
            objectid: f.objectid,
        };
        span.setAttribute('resultFields', 'zone');
        span.setAttribute('typ', zone.typ ?? 'n/a');
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: true, zone };
    } catch (err) {
        // Defensive: the whole path is best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn('[ch-zurich-bzo] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'endpoint-unreachable' };
    } finally {
        span.end();
    }
}
