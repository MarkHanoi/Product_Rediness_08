// L-609 / §NL-NATIONWIDE — the Netherlands bestemmingsplan `ringRef` RESOLVER + maatvoering READER,
// NATIONWIDE and KEYLESS (was Amsterdam-only + RP-API-v4 key-gated). The Madrid/BCN explicit-area
// pattern applied to the Netherlands' unusually well-provisioned, and — crucially — KEYLESS planning
// data. C58 §2.2 (KG-4) / ADR-0270.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS — and why it is now NATIONAL + KEYLESS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The Netherlands publishes every bestemmingsplan MACHINE-READABLE (IMRO2012 / SVBP2012). The
// original L-609 slice routed through the DSO **Ruimtelijke Plannen API v4**
// (ruimte.omgevingswet.overheid.nl) — authoritative, but GATED behind an Informatiehuis Ruimte API
// key PRYZM does not hold (probe 2026-07-25 → HTTP 401 "Missing API Key"). That is why the pack
// shipped a cited refusal.
//
// This slice replaces that with the founder-verified KEYLESS route: **PDOK "Ruimtelijke plannen"
// WMS** (`service.pdok.nl/kadaster/ruimtelijke-plannen/wms/v1_0`) — a national mirror of every
// officially-published Wro/Bro plan, no key, no CORS to the browser (we still proxy for CSP). Its
// `GetFeatureInfo` at a WGS84 point returns, per SVBP2012, BOTH:
//   1. the `bouwvlak` — the buildable-envelope POLYGON, as GeoJSON geometry (the `explicit-area`
//      footprint, exactly Madrid's Fondo case), AND
//   2. the `maatvoering` objects — the RULE NUMBERS with unambiguous SVBP2012 semantics:
//      "maximum bouwhoogte (m)" (max height), "maximum bebouwingspercentage (%)" (max coverage),
//      "maximum aantal bouwlagen" (max storeys). STATED units ⇒ a clean value is a genuine
//      `published-structured` number, not a withheld token (unlike Madrid's COEF_Z).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// LIVE PROOF (§NL-NATIONWIDE, 2026-07-26 — keyless PDOK RP WMS GetFeatureInfo, application/json)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   • Endpoint: `GET service.pdok.nl/kadaster/ruimtelijke-plannen/wms/v1_0?...request=GetFeatureInfo
//     &query_layers=maatvoering&info_format=application/json&crs=EPSG:4326` — HTTP 200, keyless.
//   • Real `maximum bouwhoogte (m)` at 2–3 NL points, live (this is what flips the gate ON):
//        Rotterdam-centrum (51.918, 4.479)  → 40 m   plan NL.IMRO.0599.BP1143LijnbkCools
//        Utrecht-centrum   (52.0935, 5.115) → 26 m   plan NL.IMRO.0344.BPSTJACOBLANGEVIE  (bouwvlak 55 pts)
//        Groningen-centrum (53.2194, 6.5665)→ 24 m   plan NL.IMRO.0014.BP574BinnenstadGV  (bouwvlak 60 pts)
//   • Field vocabulary is SVBP2012 §5.5 (docs.geostandaarden.nl/ro/svbp): `naam` = the typering,
//     value delivered in the PDOK `maatvoering` string `"<naam>"="<waarde>"` — the SERVER proxy
//     unpacks that into the `{ naam, waarde }` shape this reader consumes (so this module stays a
//     byte-deterministic parse of a consolidated body; see `server/nlBestemmingsplanProxy.js`).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THREE HONESTY PROPERTIES — read before changing this file (§CONTEXT-DATA-HONESTY)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. IT NEVER THROWS. Every miss / unreachable endpoint / malformed body returns a typed REFUSAL,
//      so the L5 dispatcher shows a cited refusal, never a fabricated number (mirrors Madrid/BCN).
//   2. IT DOES NOT PROJECT. The bouwvlak ring comes back in WGS84 (the proxy asks the WMS for
//      CRS EPSG:4326), NOT in scene-XZ. Projection to the authoring frame is the L5 dispatcher's job
//      — so this module stays L2-pure with no proj4 dependency.
//   3. A MAATVOERING IS NEVER FABRICATED, AND `min` IS NEVER READ AS `max`. `waarde` becomes a
//      structured number ONLY when it is a single clean finite positive value; absent/blank/coded →
//      `null` (honest withheld), NEVER 0. And the naam MUST be a `maximum`/`maximale` typering —
//      a `minimum`/`minimale` maatvoering (e.g. "minimale bouwhoogte") is REFUSED as a max-height
//      candidate, because publishing a floor as a ceiling is the exact §CONTEXT-DATA-HONESTY trap.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// §NL-SPARSE-FALLBACK — the bouwvlak is SPARSE (live probe: Amsterdam + Rotterdam)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// A live probe showed a separate `bouwvlak` polygon is the EXCEPTION, not the rule: most parcels
// publish only an `enkelbestemming` (the zone) + a `maatvoering` (e.g. max bouwhoogte) ON that zone,
// with NO bouwvlak. Refusing whenever no bouwvlak resolved therefore OVER-REFUSED broadly (the
// founder hit "couldn't complete" on every Amsterdam parcel). So this resolver now has TWO ok cases,
// discriminated by `ringSource`:
//   • `'bouwvlak'`       — a bouwvlak resolved → the PRECISE footprint (dispatcher → `structured`).
//   • `'bestemmingsvlak'`— no bouwvlak, but the ZONE footprint + a usable maatvoering are published →
//                          the zone EXTENT as an UPPER BOUND (dispatcher → `estimated-ruleset` with a
//                          caveat, NEVER `structured`). Mirrors the DK L-620 storey fix: use the real
//                          published zone data instead of refusing a drawable parcel.
// It refuses (`no-bouwvlak`) ONLY when NEITHER a bouwvlak NOR a usable zone-extent-plus-maatvoering
// is present — a genuine absence, never fabricated (§CONTEXT-DATA-HONESTY).
//
// PURITY of the parse (C58 §1.9): the fetch is injected; given the same response the parse is
// byte-deterministic. OTel span `pryzm.zoning.resolveNlBestemmingsplan` (C58 §1.10 / P8).
//
// Strategic context — C58 §2.2 (KG-4), ADR-0270, the pack header `nlBestemmingsplan.ts`, and
// `resolveMadridNZ1Ring.ts` (the mirrored precedent).

import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.zoning');

/**
 * ⚠⚠ THE L-449-STYLE CERTIFICATION GATE. **DEFAULT ON** (§NL-NATIONWIDE, 2026-07-26).
 *
 * Flipped true because the load-bearing precondition is MET and PROVEN live:
 *   (a) the same-origin `/api/nl/bestemmingsplan` proxy is wired to the KEYLESS PDOK RP WMS
 *       (`server/nlBestemmingsplanProxy.js`) — no API key, so no key can leak, and
 *   (b) real `maximum bouwhoogte (m)` values verified live at three NL points (Rotterdam 40 m,
 *       Utrecht 26 m, Groningen 24 m — see the header PROOF block).
 *
 * A certified NL `maximum bouwhoogte (m)` is an authoritative `published-structured` number with a
 * STATED unit, so the dispatcher may render `structured` when a real maatvoering resolves — and
 * `estimated-ruleset` when only the bouwvlak (no numbers) is available. See the dispatcher.
 *
 * ⛔ SHUT 2026-08-02 — UNSIGNED, AND SPAIN IS THE FOCUS. §UNSIGNED-GATE-DEFAULTS-SHUT.
 *
 * This gate was ON with `signature: null` — publishing numeric envelopes NATIONWIDE with no human
 * signature behind them. Same reasoning as `FR_PARIS_PLU_CERTIFIED`: an envelope published under no
 * signature is a number with legal weight and no legal basis.
 *
 * ⚠ THE HONEST FINDING: this is the WEAKEST case for shutting of the two, and it is recorded that
 * way so reopening is cheap. `maximum bouwhoogte (m)` is an authoritative `published-structured`
 * number with a STATED UNIT, read live from the keyless PDOK proxy — PRYZM TRANSCRIBES NO ORDINANCE.
 * That is the same argument (ADR-0283 Doctrine B) under which DENMARK is authorised UNGATED. On the
 * merits NL probably belongs in `UNGATED_AUTHORISED_JURISDICTIONS` beside Plandata.dk.
 *
 * It is shut anyway, for one reason: NOBODY HAS MADE THAT CALL. Denmark's ungated entry is a
 * RECORDED DECISION; the Netherlands' open gate was an unrecorded default. The difference between
 * those two is the entire point of Step 0.
 *
 * COVERAGE EFFECT: bounded the same way. Every NL parcel refuses HONESTLY AND CITED, carrying the
 * resolved bouwvlak; the determination survives, the drawn envelope stops.
 *
 * TO REOPEN, a signature need assert only that Doctrine B applies — that `maatvoering` is the
 * authority's own published determination and not PRYZM's reading of one. If that holds, the correct
 * fix is not to reopen this gate but to DELETE it and move NL to `UNGATED_AUTHORISED_JURISDICTIONS`.
 *
 * (Typed `boolean`, not the literal `false`, so a consumer's `if (NL_BESTEMMINGSPLAN_CERTIFIED)`
 * draw branch is not narrowed away as dead code while the gate is shut.)
 */
export const NL_BESTEMMINGSPLAN_CERTIFIED: boolean = false;

/**
 * The `ringRef` handle this resolver answers for. MUST equal the pack's rule `ringRef` — asserted
 * at the top of `resolveNlBestemmingsplan` so a vintage drift refuses rather than resolves against
 * the wrong plane. Versioned to the PDOK-WMS route (was `/rp-v4`).
 */
export const NL_RING_REF = 'nl-bestemmingsplan:bouwvlak-maatvoering/pdok-wms' as const;

/**
 * The same-origin proxy route the browser calls (never `service.pdok.nl` directly — C57 CSP). The
 * proxy runs the PDOK RP WMS `GetFeatureInfo` sequence (maatvoering + bouwvlak + enkelbestemming +
 * bestemmingsplangebied), picks the governing plan, and returns a CONSOLIDATED body in the shape
 * this module parses. Mirrors Madrid's `/api/madrid/condiciones`.
 */
export const NL_BESTEMMINGSPLAN_PATH = '/api/nl/bestemmingsplan';

/** A WGS84 point — the frame the resolver queries with and returns the ring in (property 2 above). */
export interface NlLatLon {
    readonly lat: number;
    readonly lon: number;
}

/** Injectable dependencies so the adapter is unit-testable without the network (mirrors Madrid). */
export interface NlBpDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production uses the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy path base (default `NL_BESTEMMINGSPLAN_PATH`). */
    readonly pathBase?: string;
}

/** Why an NL resolution refused. Closed vocabulary — these are legally/operationally distinct. */
export type NlBpRefusalReason =
    /** The rule this was asked to resolve carries a different `ringRef` (vintage / plane drift). */
    | 'ringref-mismatch'
    /** No usable WGS84 point was supplied — nothing to query the plan by. */
    | 'no-point'
    /** No `fetch` available, the endpoint could not be reached, or it returned a non-OK / bad body. */
    | 'endpoint-unreachable'
    /** The point is not covered by an adopted bestemmingsplan (no plan here). */
    | 'no-plan'
    /** A plan resolved, but it publishes NEITHER a bouwvlak polygon NOR a usable zone-extent fallback
     *  (no bestemmingsvlak footprint carrying a usable maatvoering). §NL-SPARSE-FALLBACK. */
    | 'no-bouwvlak'
    /** The bouwvlak geometry has < 3 distinct vertices — not a usable ring. */
    | 'degenerate-geometry';

/**
 * The maatvoering numbers read from the plan, ALREADY classified + validated (honesty property 3).
 * Every field is `null` for honest absence — NEVER a fabricated 0, and a `minimum` maatvoering is
 * never promoted into a `maximum` field.
 */
export interface NlMaatvoering {
    /** "maximum bouwhoogte (m)" — the max building height in metres. The crux number. */
    readonly maxBouwhoogte_m: number | null;
    /** "maximum goothoogte (m)" — the max EAVE height. Recorded for provenance; it is NOT the
     *  ridge/height cap, so the dispatcher must not use it as `maxHeight_m`. */
    readonly maxGoothoogte_m: number | null;
    /** "maximum aantal bouwlagen" — the max number of building layers/storeys. */
    readonly maxAantalBouwlagen: number | null;
    /** "maximum bebouwingspercentage (%)" as a RATIO 0..1 (schema `maxCoverage` unit). */
    readonly maxBebouwingspercentage: number | null;
    /** FSI / vloeroppervlakteindex (floor-space index = FAR), when the plan publishes one; else
     *  null — SVBP2012 does not make FSI a core maatvoering, so this is usually absent. */
    readonly far: number | null;
}

export type NlBpResolution =
    | {
          readonly ok: true;
          /**
           * WHICH ring `ringLatLon` is (§NL-SPARSE-FALLBACK). `'bouwvlak'` = the PRECISE published
           * buildable footprint (the dispatcher renders it `structured`). `'bestemmingsvlak'` = the
           * ZONE footprint used as an UPPER-BOUND extent because the plan published NO bouwvlak — the
           * dispatcher renders it `estimated-ruleset` with an upper-bound caveat, NEVER `structured`.
           */
          readonly ringSource: 'bouwvlak' | 'bestemmingsvlak';
          /** The published buildable-envelope ring for the parcel, in WGS84 (L5 projects it). Either the
           *  precise bouwvlak or — when none is published — the zone (bestemmingsvlak) extent; see
           *  `ringSource`. */
          readonly ringLatLon: NlLatLon[];
          /** The maatvoering numbers (validated; nulls are honest withheld). */
          readonly maat: NlMaatvoering;
          /** The bestemming (zone) naam this parcel falls in (e.g. "Wonen"), or null. */
          readonly bestemming: string | null;
          /** The IMRO plan id the values were read from (e.g. `NL.IMRO.0363.…`), for provenance. */
          readonly planId: string | null;
          /** The plan's human name (e.g. "Amsterdam Zuidas"), for provenance. */
          readonly planNaam: string | null;
      }
    | { readonly ok: false; readonly reason: NlBpRefusalReason };

// ──────────────────────────────────────────────────────────────────────────────────────────────
// PURE HELPERS — the classifier + validators (the honesty gate)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The kinds of maatvoering this reader recognises, keyed to the SVBP2012 §5.5 typering. A closed
 * vocabulary — an unrecognised `naam` maps to `null` and is ignored (never guessed at).
 */
export type MaatvoeringKind =
    | 'max-bouwhoogte'
    | 'max-goothoogte'
    | 'max-aantal-bouwlagen'
    | 'max-bebouwingspercentage'
    | 'fsi';

/**
 * Classify a raw maatvoering `naam` (SVBP2012 §5.5 typering) into a `MaatvoeringKind`, or `null`.
 *
 * ⚠ THE `min` GUARD (honesty property 3): a maatvoering whose typering is a `minimum` / `minimale`
 * is NOT a maximum, so it is REFUSED here — reading "minimale bouwhoogte" as a max height would
 * publish a floor as a ceiling. Only `maximum` / `maximale` (or an unqualified height with no
 * min/max word — rare, treated conservatively as NOT a cap and refused) is accepted.
 *
 * Tolerant of the two spellings the corpus mixes ("maximum" vs "maximale"), of the "(m)"/"(%)"
 * unit suffix, and of surrounding whitespace/case; strict on the min-vs-max quantifier.
 */
export function classifyMaatvoering(naam: unknown): MaatvoeringKind | null {
    if (typeof naam !== 'string') return null;
    const s = naam.trim().toLowerCase();
    if (s === '') return null;
    // Quantifier gate: must be an explicit maximum. `minimum`/`minimale` is refused outright.
    const isMax = /\bmaxim[au]m?\b|\bmaximale\b|\bmaximum\b/.test(s);
    const isMin = /\bminimu?m?\b|\bminimale\b|\bminimum\b/.test(s);
    if (!isMax || isMin) return null;
    // FSI / vloeroppervlakteindex → FAR. Checked first because it contains no hoogte/percentage term.
    if (s.includes('fsi') || s.includes('vloeroppervlakteindex') || s.includes('floor space index')) {
        return 'fsi';
    }
    if (s.includes('bebouwingspercentage')) return 'max-bebouwingspercentage';
    if (s.includes('aantal bouwlagen')) return 'max-aantal-bouwlagen';
    // ⚠ ORDER: test `bouwhoogte` before `goothoogte`. Both contain "hoogte"; only the exact term
    // discriminates them, and reading a goothoogte as the height cap would UNDER-state on a pitched
    // roof (the ridge is above the eave). They are separate fields.
    if (s.includes('bouwhoogte')) return 'max-bouwhoogte';
    if (s.includes('goothoogte')) return 'max-goothoogte';
    return null;
}

/**
 * Read a maatvoering `waarde` as a clean finite POSITIVE number, or `null` (honest withheld).
 * Tolerates a Dutch decimal comma ("12,5" → 12.5). NEVER coerces a blank/coded/absent value to 0,
 * and rejects a non-positive value (0 or negative is a transcription artefact, not a real cap).
 */
export function readMaatWaarde(raw: unknown): number | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null;
    const s = String(raw).trim().replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    const n = Number.parseFloat(s);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * One raw maatvoering object as the consolidated proxy body publishes it (minimal — only what the
 * reader touches). SVBP2012 gives the `naam` (typering) and a numeric `waarde`. The PDOK WMS packs
 * these into a `"<naam>"="<waarde>"` string; the SERVER proxy unpacks it into this shape.
 */
export interface RawMaatvoering {
    readonly naam?: unknown;
    readonly waarde?: unknown;
}

/**
 * Fold a list of raw maatvoering objects into the validated `NlMaatvoering`. Pure. Later entries of
 * the same kind do NOT overwrite an already-set value (the first clean value wins) so the result is
 * deterministic regardless of source ordering. A `%` coverage is divided to a 0..1 ratio.
 */
export function readMaatvoeringen(list: readonly RawMaatvoering[] | null | undefined): NlMaatvoering {
    let maxBouwhoogte_m: number | null = null;
    let maxGoothoogte_m: number | null = null;
    let maxAantalBouwlagen: number | null = null;
    let maxBebouwingspercentage: number | null = null;
    let far: number | null = null;
    for (const m of list ?? []) {
        const kind = classifyMaatvoering(m?.naam);
        if (kind === null) continue;
        const v = readMaatWaarde(m?.waarde);
        if (v === null) continue;
        switch (kind) {
            case 'max-bouwhoogte':
                if (maxBouwhoogte_m === null) maxBouwhoogte_m = v;
                break;
            case 'max-goothoogte':
                if (maxGoothoogte_m === null) maxGoothoogte_m = v;
                break;
            case 'max-aantal-bouwlagen':
                // Storeys are an integer count; a fractional layer count is a transcription artefact.
                if (maxAantalBouwlagen === null && Number.isInteger(v)) maxAantalBouwlagen = v;
                break;
            case 'max-bebouwingspercentage':
                // A percentage 0<v<=100 → ratio; anything outside that is not a percentage (withheld).
                if (maxBebouwingspercentage === null && v > 0 && v <= 100) {
                    maxBebouwingspercentage = v / 100;
                }
                break;
            case 'fsi':
                if (far === null) far = v;
                break;
        }
    }
    return { maxBouwhoogte_m, maxGoothoogte_m, maxAantalBouwlagen, maxBebouwingspercentage, far };
}

/**
 * Close a GeoJSON Polygon (outer ring, WGS84 `[lon, lat]` pairs) into the resolver's `NlLatLon[]`
 * form, dropping the duplicated closing vertex GeoJSON appends. Returns null when fewer than 3
 * distinct vertices survive (degenerate). Accepts either a bare coordinate ring or a full
 * `{ type:'Polygon', coordinates:[[...]] }` / `{ type:'MultiPolygon', coordinates:[[[...]]] }`.
 */
export function ringFromGeoJson(geometry: unknown): NlLatLon[] | null {
    const outer = extractOuterRing(geometry);
    if (!Array.isArray(outer) || outer.length < 3) return null;
    const pts: NlLatLon[] = [];
    for (const pair of outer) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        const lon = Number(pair[0]);
        const lat = Number(pair[1]);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        pts.push({ lat, lon });
    }
    if (
        pts.length >= 2 &&
        pts[0]!.lat === pts[pts.length - 1]!.lat &&
        pts[0]!.lon === pts[pts.length - 1]!.lon
    ) {
        pts.pop();
    }
    return pts.length >= 3 ? pts : null;
}

/** Extract the outer coordinate ring from a variety of GeoJSON shapes. Pure, defensive. */
function extractOuterRing(geometry: unknown): unknown {
    if (!geometry) return null;
    // Bare ring: [[lon,lat], ...]
    if (Array.isArray(geometry) && Array.isArray(geometry[0]) && typeof geometry[0]?.[0] === 'number') {
        return geometry;
    }
    const g = geometry as { type?: unknown; coordinates?: unknown };
    const coords = g.coordinates;
    if (g.type === 'Polygon' && Array.isArray(coords)) return coords[0];
    if (g.type === 'MultiPolygon' && Array.isArray(coords) && Array.isArray(coords[0])) {
        return (coords[0] as unknown[])[0];
    }
    // Fallback: an array whose first element is itself a ring (Polygon.coordinates handed in raw).
    if (Array.isArray(coords) && Array.isArray(coords[0])) return coords[0];
    return null;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE CONSOLIDATED PROXY RESPONSE SHAPE (minimal — what the parser reads)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** The consolidated body the same-origin proxy returns (PDOK RP WMS pieces, joined server-side). */
export interface NlBpProxyResponse {
    /** The governing bestemmingsplan for the point. `null` ⇒ no plan here. */
    readonly plan?: { readonly id?: unknown; readonly naam?: unknown } | null;
    /** The bestemmingsvlak (zone) the point falls in — its `naam` is the bestemming, and (§NL-SPARSE-
     *  FALLBACK) its `geometrie` is the zone footprint used as an UPPER-BOUND extent when the plan
     *  publishes no separate `bouwvlak` (the common case — bouwvlak is sparse). */
    readonly bestemmingsvlak?: { readonly naam?: unknown; readonly geometrie?: unknown } | null;
    /** The bouwvlak(ken) — the buildable-envelope polygon(s). First covering one is used. */
    readonly bouwvlak?: { readonly geometrie?: unknown } | null;
    readonly bouwvlakken?: ReadonlyArray<{ readonly geometrie?: unknown }> | null;
    /** All maatvoering objects for the parcel's bestemmingsvlak/bouwvlak (proxy-unpacked). */
    readonly maatvoeringen?: readonly RawMaatvoering[] | null;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE IMPURE RESOLVER (the one fetch seam)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the NL bestemmingsplan bouwvlak + maatvoering at a WGS84 parcel point, through the
 * same-origin proxy (which runs the PDOK RP WMS GetFeatureInfo sequence, keyless). Closes the
 * bouwvlak into a WGS84 ring and reads the maatvoering under the honesty gate. NEVER throws — every
 * failure is a typed refusal (see the header's three honesty properties).
 *
 * @param ruleRingRef  the pack rule's `ringRef` — asserted to equal `NL_RING_REF`.
 * @param point        the parcel query point (WGS84); the plan is found by point-in-plan.
 */
export async function resolveNlBestemmingsplan(
    ruleRingRef: string,
    point: NlLatLon | null | undefined,
    deps: NlBpDeps = {},
): Promise<NlBpResolution> {
    const span = tracer.startSpan('pryzm.zoning.resolveNlBestemmingsplan');
    span.setAttribute('provider', 'nl-pdok-rp-wms');
    try {
        if (ruleRingRef !== NL_RING_REF) {
            span.setAttribute('resultFields', 'ringref-mismatch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'ringref-mismatch' };
        }
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
        const base = deps.pathBase ?? NL_BESTEMMINGSPLAN_PATH;
        const url =
            `${base}?lat=${encodeURIComponent(String(point.lat))}` +
            `&lon=${encodeURIComponent(String(point.lon))}`;

        let body: NlBpProxyResponse | null = null;
        try {
            const res = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' } });
            if (!res || !res.ok) {
                span.setAttribute('resultFields', 'upstream-miss');
                span.setStatus({ code: SpanStatusCode.OK });
                return { ok: false, reason: 'endpoint-unreachable' };
            }
            body = (await res.json()) as NlBpProxyResponse;
        } catch (fetchErr) {
            span.setAttribute('resultFields', 'fetch-error');
            span.setStatus({ code: SpanStatusCode.OK });
            console.warn('[nl-bp] fetch failed (non-fatal):', (fetchErr as Error)?.message ?? fetchErr);
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        const plan = body?.plan ?? null;
        if (!plan) {
            span.setAttribute('resultFields', 'no-plan');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-plan' };
        }

        const maat = readMaatvoeringen(body?.maatvoeringen);
        const bestemming =
            typeof body?.bestemmingsvlak?.naam === 'string' && body.bestemmingsvlak.naam.trim() !== ''
                ? body.bestemmingsvlak.naam.trim()
                : null;
        const planId =
            typeof plan.id === 'string' && plan.id.trim() !== '' ? plan.id.trim() : null;
        const planNaam =
            typeof plan.naam === 'string' && plan.naam.trim() !== '' ? plan.naam.trim() : null;

        const ok = (
            ringSource: 'bouwvlak' | 'bestemmingsvlak',
            ringLatLon: NlLatLon[],
        ): NlBpResolution => {
            span.setAttribute('resultFields', 'ok');
            span.setAttribute('ringSource', ringSource);
            span.setAttribute('maxBouwhoogte', maat.maxBouwhoogte_m ?? -1);
            span.setAttribute('maxBebouwingspercentage', maat.maxBebouwingspercentage ?? -1);
            if (planId) span.setAttribute('planId', planId);
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: true, ringSource, ringLatLon, maat, bestemming, planId, planNaam };
        };

        // ── PRECISE path: the published bouwvlak — the explicit-area footprint. Prefer the singular
        // `bouwvlak`, else the first entry of `bouwvlakken`. This path is UNCHANGED (§NL-SPARSE-
        // FALLBACK preserves it exactly): a bouwvlak that resolves is the precise/structured case.
        const bouwvlakGeom =
            body?.bouwvlak?.geometrie ??
            (Array.isArray(body?.bouwvlakken) ? body!.bouwvlakken![0]?.geometrie : undefined);
        if (bouwvlakGeom) {
            const ring = ringFromGeoJson(bouwvlakGeom);
            if (!ring) {
                span.setAttribute('resultFields', 'degenerate-geometry');
                span.setStatus({ code: SpanStatusCode.OK });
                return { ok: false, reason: 'degenerate-geometry' };
            }
            return ok('bouwvlak', ring);
        }

        // ── §NL-SPARSE-FALLBACK: no bouwvlak was published (the common NL case — bouwvlak is sparse).
        // If the bestemmingsvlak (zone) itself carries a FOOTPRINT and the zone's maatvoering has a
        // USABLE number (max bouwhoogte, and/or aantal bouwlagen / bebouwingspercentage), resolve the
        // ZONE extent as the ring and mark it `'bestemmingsvlak'`. The dispatcher then draws it as an
        // UPPER BOUND at `estimated-ruleset` (never `structured`) — mirroring the DK L-620 storey fix:
        // use the real published zone data rather than refuse a perfectly drawable parcel. Refuse ONLY
        // when there is NEITHER a bouwvlak NOR a usable zone-extent-plus-maatvoering.
        const hasUsableMaat =
            maat.maxBouwhoogte_m !== null ||
            maat.maxAantalBouwlagen !== null ||
            maat.maxBebouwingspercentage !== null;
        const zoneRing = ringFromGeoJson(body?.bestemmingsvlak?.geometrie);
        if (zoneRing && hasUsableMaat) {
            return ok('bestemmingsvlak', zoneRing);
        }

        span.setAttribute('resultFields', 'no-bouwvlak');
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: false, reason: 'no-bouwvlak' };
    } catch (err) {
        // Defensive: the whole path is best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn('[nl-bp] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'endpoint-unreachable' };
    } finally {
        span.end();
    }
}
