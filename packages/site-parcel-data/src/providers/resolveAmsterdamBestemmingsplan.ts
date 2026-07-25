// L-609 — the Amsterdam bestemmingsplan `ringRef` RESOLVER + maatvoering READER (the provider half
// of the NL explicit-area wiring, C58 §2.2 KG-4 / ADR-0270). The Barcelona/Madrid explicit-area
// pattern applied to the Netherlands' unusually well-provisioned planning data.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The Netherlands publishes bestemmingsplan / omgevingsplan objects MACHINE-READABLE (IMRO2012,
// SVBP2012), served nationally by the DSO **Ruimtelijke Plannen API v4** (Kadaster / Informatiehuis
// Ruimte). So — UNLIKE Madrid, where only the footprint geometry is published and the numeric
// coefficient (COEF_Z) is a withheld coded token — an Amsterdam parcel yields BOTH:
//   1. the `bouwvlak` — the buildable-envelope POLYGON, published directly as GeoJSON geometry
//      (the `explicit-area` footprint, exactly Madrid's Fondo case), AND
//   2. the `maatvoering` objects — the RULE NUMBERS with unambiguous SVBP2012 semantics:
//      "maximum bouwhoogte (m)" (max height), "maximum bebouwingspercentage (%)" (max coverage),
//      "maximum aantal bouwlagen" (max storeys). These have STATED units, so — again unlike
//      COEF_Z — a clean value is a genuine `published-structured` number, not a withheld token.
//
// PROBE (L-609, 2026-07-25, point 52.3676,4.9041 — central Amsterdam):
//   • Endpoint `POST https://ruimte.omgevingswet.overheid.nl/ruimtelijke-plannen/api/opvragen/v4/
//     plannen/_zoek` with `{_geo:{contains:{type:Point,coordinates:[lon,lat]}}}` is LIVE and
//     authoritative — it returned HTTP 401 `{"error":"Kadaster - Niet geauthenticeerd.","
//     errorDetail":"Missing API Key"}`. The plan/bouwvlak/maatvoering are real and machine-readable,
//     but the API is GATED behind an Informatiehuis Ruimte API key PRYZM does not yet hold.
//   • Workflow (Geoforum #2577): `/plannen/_zoek` (Point contains) → plan id; then
//     `GET /maatvoeringen?bestemmingsplangebied=<id>` + `/bouwvlakken` + `/bestemmingsvlakken`.
//   • Field vocabulary is SVBP2012 §5.5 (docs.geostandaarden.nl/ro/svbp), cross-checked against a
//     REAL plan's regels (NL.IMRO.1721.bpDeHelling: "bebouwingspercentage … maximaal 50 %",
//     per-location "maximale bouwhoogte (m)"). See the maatvoering classifier below.
//
// Because the live API needs a key we do not hold, the CURRENT SHIPPING STATE is a CITED REFUSAL
// (see the pack's `nlAmsterdamRefusal`) behind `NL_AMS_BESTEMMINGSPLAN_CERTIFIED` (default OFF).
// This module is the machinery that renders a REAL envelope the moment the same-origin proxy + key
// are wired AND a plan's maatvoering is human-verified — same discipline as Madrid/Córdoba.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THREE HONESTY PROPERTIES — read before changing this file (§CONTEXT-DATA-HONESTY)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. IT NEVER THROWS. Every miss / unreachable endpoint / malformed body returns a typed REFUSAL,
//      so the L5 dispatcher shows a cited refusal, never a fabricated number (mirrors Madrid/BCN).
//   2. IT DOES NOT PROJECT. The bouwvlak ring comes back in WGS84 (the proxy asks the RP API for
//      `content-crs: epsg:4326`), NOT in scene-XZ. Projection to the authoring frame is the L5
//      dispatcher's job — so this module stays L2-pure with no proj4 dependency.
//   3. A MAATVOERING IS NEVER FABRICATED, AND `min` IS NEVER READ AS `max`. `waarde` becomes a
//      structured number ONLY when it is a single clean finite positive value; absent/blank/coded →
//      `null` (honest withheld), NEVER 0. And the naam MUST be a `maximum`/`maximale` typering —
//      a `minimum`/`minimale` maatvoering (e.g. "minimale bouwhoogte") is REFUSED as a max-height
//      candidate, because publishing a floor as a ceiling is the exact §CONTEXT-DATA-HONESTY trap.
//
// PURITY of the parse (C58 §1.9): the fetch is injected; given the same response the parse is
// byte-deterministic. OTel span `pryzm.zoning.resolveAmsterdamBestemmingsplan` (C58 §1.10 / P8).
//
// Strategic context — C58 §2.2 (KG-4), ADR-0270, the pack header `nlAmsterdamBestemmingsplan.ts`,
// and `resolveMadridNZ1Ring.ts` (the mirrored precedent).

import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.zoning');

/**
 * ⚠⚠ THE L-449-STYLE CERTIFICATION GATE. **DEFAULT OFF.** While false, the dispatcher keeps the
 * Amsterdam cited refusal and this resolver's output is never rendered. Flip to true ONLY after:
 *   (a) the same-origin `/api/nl/bestemmingsplan` proxy is wired (it injects the Informatiehuis
 *       Ruimte API key + runs the RP API v4 `_zoek` → maatvoeringen/bouwvlakken sequence), AND
 *   (b) a human verifies, for a real Amsterdam plan, that the returned `bouwvlak` + `maximum
 *       bouwhoogte (m)` are the governing values (the light L-449 cert).
 *
 * Unlike Madrid (whose COEF_Z semantics stay withheld ⇒ `estimated-ruleset` even when certified),
 * a certified Amsterdam `maximum bouwhoogte (m)` is an authoritative `published-structured` number
 * with a STATED unit, so the dispatcher may render `structured` when a real maatvoering resolves —
 * and `estimated-ruleset` when only the bouwvlak (no numbers) is available. See the dispatcher.
 *
 * (Typed `boolean`, not the literal `false`, so a consumer's `if (NL_AMS_BESTEMMINGSPLAN_CERTIFIED)`
 * compute branch is not narrowed away as dead code while the gate is closed.)
 */
export const NL_AMS_BESTEMMINGSPLAN_CERTIFIED: boolean = false;

/**
 * The `ringRef` handle this resolver answers for. MUST equal the pack's rule `ringRef` — asserted
 * at the top of `resolveAmsterdamBestemmingsplan` so a vintage drift refuses rather than resolves
 * against the wrong plane.
 */
export const NL_AMS_RING_REF = 'nl-ams-bestemmingsplan:bouwvlak-maatvoering/rp-v4' as const;

/**
 * The same-origin proxy route the browser calls (never `ruimte.omgevingswet.overheid.nl` directly —
 * C57 CSP + the API key must never reach the browser). The proxy runs the RP API v4 sequence
 * (`/plannen/_zoek` → `/maatvoeringen` + `/bouwvlakken` + `/bestemmingsvlakken`), injects the
 * Informatiehuis Ruimte key, and returns a CONSOLIDATED body in the shape this module parses. Wiring
 * the proxy is the remaining act (mirrors Madrid's `/api/madrid/condiciones`).
 */
export const NL_AMS_BESTEMMINGSPLAN_PATH = '/api/nl/bestemmingsplan';

/** A WGS84 point — the frame the resolver queries with and returns the ring in (property 2 above). */
export interface NlLatLon {
    readonly lat: number;
    readonly lon: number;
}

/** Injectable dependencies so the adapter is unit-testable without the network (mirrors Madrid). */
export interface AmsterdamBpDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production uses the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy path base (default `NL_AMS_BESTEMMINGSPLAN_PATH`). */
    readonly pathBase?: string;
}

/** Why an Amsterdam resolution refused. Closed vocabulary — these are legally/operationally distinct. */
export type AmsterdamBpRefusalReason =
    /** The rule this was asked to resolve carries a different `ringRef` (vintage / plane drift). */
    | 'ringref-mismatch'
    /** No usable WGS84 point was supplied — nothing to query the plan by. */
    | 'no-point'
    /** No `fetch` available, the endpoint could not be reached, or it returned a non-OK / bad body. */
    | 'endpoint-unreachable'
    /** The point is not covered by an adopted bestemmingsplan (no plan here). */
    | 'no-plan'
    /** A plan resolved, but it publishes NO bouwvlak polygon covering the parcel. */
    | 'no-bouwvlak'
    /** The bouwvlak geometry has < 3 distinct vertices — not a usable ring. */
    | 'degenerate-geometry';

/**
 * The maatvoering numbers read from the plan, ALREADY classified + validated (honesty property 3).
 * Every field is `null` for honest absence — NEVER a fabricated 0, and a `minimum` maatvoering is
 * never promoted into a `maximum` field.
 */
export interface AmsterdamMaatvoering {
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

export type AmsterdamBpResolution =
    | {
          readonly ok: true;
          /** The published bouwvlak (buildable-envelope) ring for the parcel, in WGS84 (L5 projects it). */
          readonly ringLatLon: NlLatLon[];
          /** The maatvoering numbers (validated; nulls are honest withheld). */
          readonly maat: AmsterdamMaatvoering;
          /** The bestemming (zone) naam this parcel falls in (e.g. "Wonen"), or null. */
          readonly bestemming: string | null;
          /** The IMRO plan id the values were read from (e.g. `NL.IMRO.0363.…`), for provenance. */
          readonly planId: string | null;
          /** The plan's human name (e.g. "Amsterdam Zuidas"), for provenance. */
          readonly planNaam: string | null;
      }
    | { readonly ok: false; readonly reason: AmsterdamBpRefusalReason };

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
 * One raw maatvoering object as the RP API v4 publishes it (minimal — only what the reader touches).
 * SVBP2012 gives the `naam` (typering) and a numeric `waarde`.
 */
export interface RawMaatvoering {
    readonly naam?: unknown;
    readonly waarde?: unknown;
}

/**
 * Fold a list of raw maatvoering objects into the validated `AmsterdamMaatvoering`. Pure. Later
 * entries of the same kind do NOT overwrite an already-set value (the first clean value wins) so the
 * result is deterministic regardless of source ordering. A `%` coverage is divided to a 0..1 ratio.
 */
export function readMaatvoeringen(list: readonly RawMaatvoering[] | null | undefined): AmsterdamMaatvoering {
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

/** The consolidated body the same-origin proxy returns (RP API v4 pieces, joined server-side). */
export interface AmsterdamBpProxyResponse {
    /** The leading bestemmingsplan for the point. `null` ⇒ no plan here. */
    readonly plan?: { readonly id?: unknown; readonly naam?: unknown } | null;
    /** The bestemmingsvlak (zone) the point falls in — its `naam` is the bestemming. */
    readonly bestemmingsvlak?: { readonly naam?: unknown } | null;
    /** The bouwvlak(ken) — the buildable-envelope polygon(s). First covering one is used. */
    readonly bouwvlak?: { readonly geometrie?: unknown } | null;
    readonly bouwvlakken?: ReadonlyArray<{ readonly geometrie?: unknown }> | null;
    /** All maatvoering objects for the parcel's bestemmingsvlak/bouwvlak. */
    readonly maatvoeringen?: readonly RawMaatvoering[] | null;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE IMPURE RESOLVER (the one fetch seam)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the Amsterdam bestemmingsplan bouwvlak + maatvoering at a WGS84 parcel point, through the
 * same-origin proxy (which runs the RP API v4 sequence + injects the key). Closes the bouwvlak into
 * a WGS84 ring and reads the maatvoering under the honesty gate. NEVER throws — every failure is a
 * typed refusal (see the header's three honesty properties).
 *
 * @param ruleRingRef  the pack rule's `ringRef` — asserted to equal `NL_AMS_RING_REF`.
 * @param point        the parcel query point (WGS84); the plan is found by point-in-plan.
 */
export async function resolveAmsterdamBestemmingsplan(
    ruleRingRef: string,
    point: NlLatLon | null | undefined,
    deps: AmsterdamBpDeps = {},
): Promise<AmsterdamBpResolution> {
    const span = tracer.startSpan('pryzm.zoning.resolveAmsterdamBestemmingsplan');
    span.setAttribute('provider', 'nl-rp-api-v4');
    try {
        if (ruleRingRef !== NL_AMS_RING_REF) {
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
        const base = deps.pathBase ?? NL_AMS_BESTEMMINGSPLAN_PATH;
        const url =
            `${base}?lat=${encodeURIComponent(String(point.lat))}` +
            `&lon=${encodeURIComponent(String(point.lon))}`;

        let body: AmsterdamBpProxyResponse | null = null;
        try {
            const res = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' } });
            if (!res || !res.ok) {
                span.setAttribute('resultFields', 'upstream-miss');
                span.setStatus({ code: SpanStatusCode.OK });
                return { ok: false, reason: 'endpoint-unreachable' };
            }
            body = (await res.json()) as AmsterdamBpProxyResponse;
        } catch (fetchErr) {
            span.setAttribute('resultFields', 'fetch-error');
            span.setStatus({ code: SpanStatusCode.OK });
            console.warn('[nl-ams-bp] fetch failed (non-fatal):', (fetchErr as Error)?.message ?? fetchErr);
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        const plan = body?.plan ?? null;
        if (!plan) {
            span.setAttribute('resultFields', 'no-plan');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-plan' };
        }

        // The bouwvlak polygon — the explicit-area footprint. Prefer the singular `bouwvlak`, else
        // the first entry of `bouwvlakken`.
        const bouwvlakGeom =
            body?.bouwvlak?.geometrie ??
            (Array.isArray(body?.bouwvlakken) ? body!.bouwvlakken![0]?.geometrie : undefined);
        const ring = ringFromGeoJson(bouwvlakGeom);
        if (!bouwvlakGeom) {
            span.setAttribute('resultFields', 'no-bouwvlak');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-bouwvlak' };
        }
        if (!ring) {
            span.setAttribute('resultFields', 'degenerate-geometry');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'degenerate-geometry' };
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

        span.setAttribute('resultFields', 'ok');
        span.setAttribute('maxBouwhoogte', maat.maxBouwhoogte_m ?? -1);
        span.setAttribute('maxBebouwingspercentage', maat.maxBebouwingspercentage ?? -1);
        if (planId) span.setAttribute('planId', planId);
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: true, ringLatLon: ring, maat, bestemming, planId, planNaam };
    } catch (err) {
        // Defensive: the whole path is best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn('[nl-ams-bp] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'endpoint-unreachable' };
    } finally {
        span.end();
    }
}
