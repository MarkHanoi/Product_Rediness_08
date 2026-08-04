// Cartagena (INE 30016) — the `wms_RPG0` (currently-valid R0/1987 plan) `Manzanas` layer resolver.
//
// WHAT THIS IS
// ─────────────────────────────────────────────────────────────────────────────────────────────
// `ide.cartagena.es/wms_RPG0/wmservice.aspx`, layer `Manzanas`, CONFIRMED LIVE 2026-08-04 —
// `GetFeatureInfo` against a real block returned well-formed GML with fields `ID`/`Matricula`/
// `Norma`/`Ficha_web`, e.g. `Norma: "Ac4 (2,3505) Uso Máximo Residencial = 23384,45 m²"`.
//
// ⚠⚠ WHY `RPG0`, NOT `RPG1`/`RPG2`. `RPG1` (`Periodo=R1` in the sibling `Ficha/*` HTML service) is
// the 2012 Revisión del PGMO, declared NULL by the Superior Court of Justice of Murcia
// (20-May-2015) and upheld by the Spanish Supreme Court (15-June-2016) — every `R1` record carries
// its own disclaimer confirming this. `RPG0` is the 1987 PGMO, which RE-ENTERED FORCE
// AUTOMATICALLY on that annulment (the standard Spanish planning-law consequence: nullifying a
// revision reinstates the instrument it repealed) and remains the sole currently-valid plan today.
// A new revision (`RPG2`) is at provisional-approval stage (Feb 2026) but not yet in force. Using
// `RPG1`/`RPG2` here would produce a legally indefensible envelope citing an annulled or
// not-yet-effective instrument — see `docs/04-reference/jurisdictions/es/es-mc/30016-cartagena/
// findings/CAPABILITY-RESEARCH-2026-08-04.md` §0 for the full resolution.
//
// ⚠⚠ IT RESOLVES DATA, IT DOES NOT DECIDE TO RENDER. `CARTAGENA_ENVELOPE_VERIFIED`
// (`esCartagena.ts`) is `false` — a resolved zone binds NO number by itself. What it binds is the
// zone code + block-specific coefficient on the refusal card, so a Cartagena parcel gets a cited,
// zone-specific "PRYZM has not signed off this ordinance" refusal instead of a generic message.
//
// THREE HONESTY PROPERTIES (mirrors `resolveSevillaZone`):
//   1. NEVER THROWS. Every miss / unreachable endpoint / malformed body returns a typed refusal.
//   2. DOES NOT DECIDE TO RENDER. The caller decides, gated on `CARTAGENA_ENVELOPE_VERIFIED`.
//   3. NEVER INVENTS A ZONE. An empty/unreachable response yields a typed refusal, never a
//      guessed `Norma` code.
//
// PURITY: this is the ONE impure boundary (a network fetch) — parsing the `Norma` composite is a
// separate pure function so this file stays a thin, testable seam.
//
// Strategic context — `containers/wmsGetFeatureInfo.ts`, `cartagenaBbox.ts`, C58 §1.4/§1.9/§1.10.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { queryWmsGetFeatureInfo } from './containers/wmsGetFeatureInfo.js';
import { isInCartagena } from './cartagenaBbox.js';

const tracer = trace.getTracer('pryzm.zoning');

/** The live, currently-valid-plan (R0/1987) WMS service. */
export const CARTAGENA_WMS_RPG0_SERVICE = 'https://ide.cartagena.es/wms_RPG0/wmservice.aspx';

/** The block-level zoning layer, confirmed queryable at scale 500-5000 (parcel-appropriate). */
export const CARTAGENA_MANZANAS_LAYER = 'Manzanas';

/** A WGS84 point — the frame this resolver is queried by. */
export interface CartagenaLngLat {
    readonly lat: number;
    readonly lon: number;
}

/**
 * The parsed `Norma urbanística` composite. The field is free text (e.g. `"Vu1 (0,52)"`,
 * `"Ac4 (2,3505) Uso Máximo Residencial = 23384,45 m²"`) — this is the ONE place that regex-parses
 * it, so every caller sees the same structured shape.
 */
export interface CartagenaNormaParsed {
    /** The zone-family code, e.g. `Ac4`, `Vu1`, `Cc2`. */
    readonly zoneCode: string;
    /** The block-specific numeric coefficient in parentheses, when present (e.g. edificabilidad override). */
    readonly coefficient: number | null;
    /** A precomputed maximum buildable area in m², when the composite states one directly. */
    readonly maxBuildableAreaM2: number | null;
    /** The raw, unparsed `Norma` string — always carried through, never discarded. */
    readonly raw: string;
}

export interface CartagenaZoneResolution {
    readonly id: string | null;
    /** e.g. `R0-PP-CO51-0007`, `R0-PGMO-0204`. */
    readonly matricula: string | null;
    readonly norma: CartagenaNormaParsed;
}

export type CartagenaZoneRefusalReason =
    | 'out-of-cartagena'
    | 'no-fetch'
    | 'service-error'
    | 'no-zone-here'
    | 'no-norma-field';

export type CartagenaZoneResult =
    | { readonly ok: true; readonly resolution: CartagenaZoneResolution }
    | { readonly ok: false; readonly reason: CartagenaZoneRefusalReason; readonly detail?: string };

export interface CartagenaZoneDeps {
    readonly fetchImpl?: typeof fetch;
    readonly serviceBase?: string;
}

/**
 * Parse the `Norma` composite field. PURE. Never throws — an unparseable string still returns a
 * result, with `zoneCode` set to the raw string's leading token and everything else `null`, so a
 * caller always has SOMETHING to name in a refusal card, never a hard failure over a parse quirk.
 */
export function parseCartagenaNorma(raw: string): CartagenaNormaParsed {
    const trimmed = raw.trim();
    // "<code> (<coef>) [rest]" — code is the leading run of letters+digits, coef is the first
    // parenthesised decimal (Spanish comma decimal separator), max area is any "= <number> m²".
    const codeMatch = /^([A-Za-zÁÉÍÓÚñÑ]+\d*)/.exec(trimmed);
    const coefMatch = /\(([\d]+,[\d]+)\)/.exec(trimmed);
    const areaMatch = /=\s*([\d.]+,[\d]+)\s*m[²2]/.exec(trimmed);
    const toNumber = (s: string): number | null => {
        const n = Number(s.replace(/\./g, '').replace(',', '.'));
        return Number.isFinite(n) ? n : null;
    };
    return {
        zoneCode: codeMatch?.[1] ?? trimmed,
        coefficient: coefMatch ? toNumber(coefMatch[1]!) : null,
        maxBuildableAreaM2: areaMatch ? toNumber(areaMatch[1]!) : null,
        raw: trimmed,
    };
}

/**
 * Resolve a Cartagena parcel's currently-valid (R0/1987) `Manzanas` block record at a WGS84 point.
 * **NEVER THROWS.**
 */
export async function resolveCartagenaZone(
    point: CartagenaLngLat | null | undefined,
    deps: CartagenaZoneDeps = {},
): Promise<CartagenaZoneResult> {
    const span = tracer.startSpan('pryzm.zoning.resolveCartagenaZone');
    span.setAttribute('provider', 'cartagena-wms-rpg0-manzanas');
    try {
        if (
            !point ||
            typeof point.lat !== 'number' ||
            typeof point.lon !== 'number' ||
            !Number.isFinite(point.lat) ||
            !Number.isFinite(point.lon) ||
            !isInCartagena(point.lat, point.lon)
        ) {
            span.setAttribute('resultFields', 'out-of-cartagena');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'out-of-cartagena' };
        }

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('resultFields', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-fetch' };
        }

        const serviceBase = deps.serviceBase ?? CARTAGENA_WMS_RPG0_SERVICE;
        const result = await queryWmsGetFeatureInfo({
            fetchImpl,
            serviceBase,
            layers: CARTAGENA_MANZANAS_LAYER,
            queryLayers: CARTAGENA_MANZANAS_LAYER,
            lat: point.lat,
            lon: point.lon,
            srs: 4326,
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

        const normaRaw = feature.attributes['Norma'];
        if (!normaRaw || !normaRaw.trim()) {
            span.setAttribute('resultFields', 'no-norma-field');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-norma-field' };
        }

        span.setAttribute('resultFields', 'ok');
        span.setStatus({ code: SpanStatusCode.OK });
        return {
            ok: true,
            resolution: {
                id: feature.attributes['ID'] ?? null,
                matricula: feature.attributes['Matricula'] ?? null,
                norma: parseCartagenaNorma(normaRaw),
            },
        };
    } catch (e) {
        span.setAttribute('resultFields', 'service-error');
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: false, reason: 'service-error', detail: e instanceof Error ? e.message : String(e) };
    } finally {
        span.end();
    }
}
