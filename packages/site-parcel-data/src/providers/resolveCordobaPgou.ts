// Córdoba (INE 14021) — the PEPCH'01 buildable-ENVELOPE resolver (per-parcel max plantas → cornice).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The Córdoba counterpart of `resolveMadridNZ1Ring` / `resolveNlBestemmingsplan`: the ONE impure
// seam (a fetch through a C57 same-origin proxy) wrapping a deterministic parse. Given a WGS84
// point it reads the parcel's per-parcel storey count (`max_plantas`) and its zona/ordenanza from
// the live COACo GeoServer, then maps the PB+N storey count onto the PEPCH'01 cornice-height model
// (Arts 43-55: PB / PB+1 / PB+2 / PB+3 → 4.5 / 8 / 11 / 14 m; ocupación 70/80 %; patio 25/20 %).
//
// It NEVER renders on its own. Like `resolveCordobaSubzone`, it resolves the DATA; the L5 dispatcher
// decides whether to render, gated on `CORDOBA_ENVELOPE_VERIFIED` (default OFF). While the gate is
// closed a resolved envelope binds NO number on the panel/massing — the dispatcher shows the cited
// "machine-extracted, unverified" refusal (esCordobaZoneClassification.ts).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// LIVE PROOF (2026-07-26 — COACo GeoServer WFS 2.0.0, application/json)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   • Layer `coaco:vcatastro_urbanismo` — 5 725 parcels, `numberMatched="5725"` (hits), HTTP 200.
//   • DescribeFeatureType confirms per-parcel fields: `max_plantas` (xsd:int), `zona_nom`,
//     `zona_cod`, `ordenanza`, `sup_pc_m2`, `actuacion`, … — the per-parcel storey count is HERE.
//   • Real parcel `refcat='3834946UG4933S'` → `{ zona_nom:'Sur', ordenanza:'Colonia Tradicional
//     Popular', max_plantas:2, sup_pc_m2:165 }` (CQL_FILTER GetFeature, application/json). PB+1.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠⚠ THREE HONESTY CAVEATS THE CALLER MUST CARRY (§CONTEXT-DATA-HONESTY, C58 §1.4/§1.7a/§1.11)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. `max_plantas` IS CATASTRO-DERIVED, NOT THE ORDINANCE CEILING. It is the EXISTING built storey
//      count (a Catastro attribute), used here as an INDEPENDENT corroboration/proxy for the
//      permitted storeys — NEVER an authoritative "máx plantas" the PGOU/PEPCH published. So the
//      cornice height this returns is an ESTIMATE, `pipeline-extracted-unverified` at best, and the
//      resolver stamps that on `provenanceNote`. It must never be shown as a `structured` number.
//   2. INSTRUMENT MISMATCH — THE PEPCH LADDER vs THE LIVE PILOT. The PEPCH'01 (Conjunto Histórico)
//      governs the CASCO HISTÓRICO, which the COACo pilot EXPLICITLY EXCLUDES (its 2 vectorised
//      districts are Sur + Noroeste, under the PGOU-2001 — CORDOBA-DATA-RECON-SPIKE §1). Applying
//      the PEPCH cornice ladder to a Sur/Noroeste parcel is a MODEL choice, not a reading of that
//      parcel's own instrument, and `instrumentCaveat` says so. For a parcel actually under the
//      PGOU-2001 the authoritative envelope is the `ES_CORDOBA_PGOU2001_PACK` subzone, resolved via
//      `resolveCordobaSubzone`; this ladder is the low-rise historic-core model.
//   3. GRANULARITY. `max_plantas` on `coaco:vcatastro_urbanismo` is PER-PARCEL (granularity
//      'parcel'). The `coaco:vhex25_max_plantas` layer named in the brief is a 25 m HEX-GRID
//      AGGREGATE (coarser — a block/hex figure, C58 §1.11), so this resolver reads the per-parcel
//      layer and exposes the hex layer name only as a documented coarse fallback (never as the
//      per-parcel value). Do not swap them.
//
// PURITY of the parse (C58 §1.9): the fetch is injected; given the same response the parse is
// byte-deterministic. OTel span `pryzm.zoning.resolveCordobaEnvelope` (C58 §1.10 / P8).
//
// Strategic context — esCordobaPGOU2001.ts, esCordobaZoneClassification.ts (the gate),
// resolveCordobaSubzone.ts (the sibling subzone seam), CORDOBA-DATA-RECON-SPIKE §4,
// findings/CALIFICACION-ENDPOINT-PROBE.md, C57, C58 §1.4/§1.7a/§1.9/§1.10/§1.11, §CONTEXT-DATA-HONESTY.

import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.zoning');

/**
 * Same-origin proxy route the browser calls (C57 — never geoserver.pgou.coacordoba.org directly).
 * The proxy runs the `coaco:vcatastro_urbanismo` point-intersect (handling the native EPSG:25830 /
 * axis puzzle server-side, same as `resolveCordobaSubzone`) and returns GeoJSON. Wired server-side
 * in `server/cordobaZoningProxy.js` (the orchestrator's job — see this resolver's report note).
 */
export const CORDOBA_PARCEL_ENVELOPE_PATH = '/api/cordoba/vcatastro';

/**
 * The COACo 25 m HEX-GRID aggregate of `max_plantas`. Documented for provenance ONLY: it is a
 * block/hex figure (coarser than per-parcel — C58 §1.11) and this resolver does NOT read it as the
 * per-parcel value. A future coarse-fallback path could query it when the per-parcel join is blank.
 */
export const CORDOBA_VHEX25_MAX_PLANTAS_LAYER = 'coaco:vhex25_max_plantas' as const;

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE PEPCH'01 ENVELOPE MODEL — named, cited constants (never magic numbers in the mapper)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * PEPCH'01 (Plan Especial de Protección del Conjunto Histórico) Arts 43-55 — the cornice-height
 * ladder, keyed by TOTAL storey count (plantas). PB = 1 planta (ground only). The ladder caps at
 * PB+3; a taller Catastro reading is OUTSIDE this low-rise historic-core model and is refused
 * rather than extrapolated (C58 §1.4 — never invent a value beyond the stated table).
 *
 * ⚠ These are the PEPCH figures the task specified; the `ordinanceRef` and `provenanceNote` on
 * every resolution name the instrument, so a consumer never mistakes them for the parcel's own
 * PGOU-2001 subzone envelope (caveat 2 in the header).
 */
export const PEPCH01_CORNICE_HEIGHT_BY_PLANTAS: Readonly<Record<number, number>> = {
    1: 4.5, // PB
    2: 8, // PB+1
    3: 11, // PB+2
    4: 14, // PB+3
};

/** The PEPCH'01 ocupación (coverage) bounds — Arts 43-55. Stated as ratios 0..1 (schema unit). */
export const PEPCH01_OCUPACION = { min: 0.7, max: 0.8 } as const;

/** The PEPCH'01 patio (interior courtyard) share bounds — Arts 43-55. Ratios 0..1. */
export const PEPCH01_PATIO_RATIO = { min: 0.2, max: 0.25 } as const;

/** The instrument every PEPCH'01-derived envelope cites. */
export const PEPCH01_INSTRUMENT_REF =
    'PEPCH-Córdoba-2001 (Plan Especial de Protección del Conjunto Histórico), Arts 43-55 ' +
    '(ocupación 70/80 %, cornisa PB/PB+1/PB+2/PB+3 = 4,5/8/11/14 m, patio 25/20 %). ' +
    'Per-parcel storeys: COACo `coaco:vcatastro_urbanismo.max_plantas` (Catastro-derived, ' +
    'MACHINE-READ, NOT human-verified — pipeline-extracted-unverified).';

/** A WGS84 point — the frame the resolver queries by (the proxy reprojects to EPSG:25830). */
export interface CordobaLonLat {
    readonly lat: number;
    readonly lon: number;
}

/** Injectable dependencies so the adapter is unit-testable without the network. */
export interface CordobaEnvelopeDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production uses the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy base for the per-parcel query (default `CORDOBA_PARCEL_ENVELOPE_PATH`). */
    readonly pathBase?: string;
}

/** Why a Córdoba envelope resolution refused. Closed vocabulary — operationally distinct. */
export type CordobaEnvelopeRefusalReason =
    /** No usable WGS84 point was supplied — nothing to intersect the parcel plane by. */
    | 'no-point'
    /** No `fetch` available, the endpoint could not be reached, or it returned a non-OK / bad body. */
    | 'endpoint-unreachable'
    /** The point-intersect returned no `coaco:vcatastro_urbanismo` feature (outside the pilot). */
    | 'no-parcel'
    /** A parcel was returned but `max_plantas` is absent/blank/≤0 — honest withheld, NEVER a 0. */
    | 'no-max-plantas'
    /** `max_plantas` is beyond the PEPCH PB+3 ladder — refuse rather than extrapolate a cornice. */
    | 'plantas-out-of-model';

/** The PEPCH'01 envelope parameters resolved for a parcel (all real or the whole thing refuses). */
export interface CordobaEnvelopeParams {
    /** Total storey count read per-parcel from Catastro `max_plantas` (PB = 1). */
    readonly maxPlantas: number;
    /** N in "PB+N" (0..3), i.e. `maxPlantas - 1`. */
    readonly pbPlusN: number;
    /** The PEPCH'01 cornice height for `maxPlantas` (m). An ESTIMATE — see header caveat 1. */
    readonly corniceHeight_m: number;
    /** PEPCH'01 ocupación upper bound (0..1) — the coverage cap for the model. */
    readonly ocupacion: number;
    /** PEPCH'01 patio (courtyard) share (0..1) — the interior free-space the model reserves. */
    readonly patioRatio: number;
    /** The COACo `zona_nom` the parcel falls in (`Sur` / `Noroeste`), or null. */
    readonly zona: string | null;
    /** The COACo `ordenanza` family name (`Colonia Tradicional Popular`, …), or null. */
    readonly ordenanza: string | null;
    /** What this figure is ABOUT (C58 §1.11): always 'parcel' — `max_plantas` is per-parcel. */
    readonly granularity: 'parcel';
    /** The governing-instrument citation for the cornice ladder (PEPCH'01). */
    readonly ordinanceRef: string;
    /** The honesty note the caller MUST surface: Catastro-derived, unverified, instrument-mismatch. */
    readonly provenanceNote: string;
}

export type CordobaEnvelopeResult =
    | { readonly ok: true; readonly params: CordobaEnvelopeParams }
    | { readonly ok: false; readonly reason: CordobaEnvelopeRefusalReason };

// ──────────────────────────────────────────────────────────────────────────────────────────────
// PURE HELPERS
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Map a per-parcel storey count onto the PEPCH'01 cornice ladder. Returns the cornice height (m)
 * for a valid PB..PB+3 count, or `null` for a count outside the model (≤0, non-integer, or > PB+3).
 * NEVER extrapolates and NEVER coerces a bad value to 0 (C58 §1.4/§1.7a). PURE.
 */
export function pepchCorniceForPlantas(maxPlantas: unknown): number | null {
    if (typeof maxPlantas !== 'number' || !Number.isInteger(maxPlantas) || maxPlantas < 1) {
        return null;
    }
    return PEPCH01_CORNICE_HEIGHT_BY_PLANTAS[maxPlantas] ?? null;
}

/** Coerce a WFS numeric property (number, or a numeric string, possibly comma-decimal) → number|null. */
function numFromProp(v: unknown): number | null {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
    const s = v.trim().replace(',', '.');
    if (s === '') return null;
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : null;
}

/** A WFS string property → trimmed non-empty string, else null. */
function strFromProp(v: unknown): string | null {
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

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
        console.warn('[cordoba-envelope] fetch failed (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false };
    }
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE IMPURE RESOLVER (the one fetch seam)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a Córdoba parcel's PEPCH'01 buildable-envelope parameters at a WGS84 point. Reads the
 * per-parcel `max_plantas` + `zona_nom` + `ordenanza` from `coaco:vcatastro_urbanismo` (through the
 * same-origin proxy) and maps the storey count onto the PEPCH cornice ladder. NEVER throws — every
 * failure is a typed refusal (the three honesty caveats live in the header). Emits the
 * `pryzm.zoning.resolveCordobaEnvelope` span (C58 §1.10 / P8).
 *
 * @param point  the parcel query point (WGS84); the parcel is found by point-in-polygon.
 * @param deps   injectable fetch + proxy base.
 */
export async function resolveCordobaEnvelope(
    point: CordobaLonLat | null | undefined,
    deps: CordobaEnvelopeDeps = {},
): Promise<CordobaEnvelopeResult> {
    const span = tracer.startSpan('pryzm.zoning.resolveCordobaEnvelope');
    span.setAttribute('provider', 'coaco-pepch');
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

        const base = deps.pathBase ?? CORDOBA_PARCEL_ENVELOPE_PATH;
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
            span.setAttribute('resultFields', 'no-parcel');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-parcel' };
        }

        // ⚠ HONEST WITHHELD, NEVER 0 (C58 §1.7a): a blank / absent / non-positive max_plantas is a
        // refusal, not a "PB" default. A cornice fabricated from a missing storey count is the exact
        // confident-wrong failure this whole Córdoba effort guards against.
        const rawPlantas = numFromProp(props['max_plantas']);
        if (rawPlantas === null || rawPlantas <= 0) {
            span.setAttribute('resultFields', 'no-max-plantas');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-max-plantas' };
        }
        const maxPlantas = Math.trunc(rawPlantas);
        const corniceHeight_m = pepchCorniceForPlantas(maxPlantas);
        if (corniceHeight_m === null) {
            // Beyond PB+3 (or non-integer): outside the PEPCH low-rise model. Refuse rather than
            // extrapolate a cornice the ladder does not state (C58 §1.4).
            span.setAttribute('resultFields', 'plantas-out-of-model');
            span.setAttribute('maxPlantas', maxPlantas);
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'plantas-out-of-model' };
        }

        const zona = strFromProp(props['zona_nom']);
        const ordenanza = strFromProp(props['ordenanza']);

        span.setAttribute('resultFields', 'ok');
        span.setAttribute('maxPlantas', maxPlantas);
        span.setAttribute('corniceHeight_m', corniceHeight_m);
        span.setStatus({ code: SpanStatusCode.OK });
        return {
            ok: true,
            params: {
                maxPlantas,
                pbPlusN: maxPlantas - 1,
                corniceHeight_m,
                ocupacion: PEPCH01_OCUPACION.max,
                patioRatio: PEPCH01_PATIO_RATIO.max,
                zona,
                ordenanza,
                granularity: 'parcel',
                ordinanceRef: PEPCH01_INSTRUMENT_REF,
                provenanceNote:
                    `Cornice ${corniceHeight_m} m ESTIMATED from Catastro storeys (max_plantas=` +
                    `${maxPlantas}, PB+${maxPlantas - 1}) via the PEPCH'01 ladder — NOT a published ` +
                    'ordinance ceiling, and machine-read/unverified (pipeline-extracted-unverified). ' +
                    'The PEPCH governs the casco histórico; a Sur/Noroeste parcel is under the ' +
                    'PGOU-2001 (use resolveCordobaSubzone + ES_CORDOBA_PGOU2001_PACK for its own ' +
                    'subzone envelope). Withheld until CORDOBA_ENVELOPE_VERIFIED is signed.',
            },
        };
    } catch (err) {
        // Defensive: the whole path is best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn('[cordoba-envelope] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'endpoint-unreachable' };
    } finally {
        span.end();
    }
}
