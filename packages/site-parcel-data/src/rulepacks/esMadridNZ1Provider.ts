// L-608 — the Madrid Norma Zonal 1 PROVIDER/ADAPTER: sigma.madrid.es geometry → the GENERIC
// `ExplicitAreaSource` the merged `explicit-area` solver consumes.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS — the Madrid-SPECIFIC half of the `explicit-area` pipeline
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The solver primitive (`geometry/explicitArea.ts`: `resolveExplicitAreaRing` + `solveExplicitArea`)
// is jurisdiction-AGNOSTIC and already merged. This module is its FIRST provider: it turns Madrid's
// live-published PGOUM-97 Norma Zonal 1 geometry into the generic `ExplicitAreaSource` the resolver
// accepts. It ADAPTS the city into the primitive; it NEVER re-implements the solve — the pure clip
// and the ringRef validation stay in `explicitArea.ts`. All Madrid knowledge (field names, `COEF_Z`
// coding, the ArcGIS layer numbers, the CRS) lives HERE and nowhere in the engine (C58 §1.5).
//
//   sigma.madrid.es/hosted/rest/services/PGOUM97/PG_CONDICIONES_EDIFICACION/MapServer
//     • layer 6  "Condiciones de la Edificación" (esriGeometryPolygon) — the CLOSED buildable
//                footprint, carrying COEF_Z / CODMANZANA / COND_EDIF / NUMORD. VERIFIED LIVE
//                2026-07-23: single-ring polygons in EPSG:25830, one feature per catalogued unit
//                (NUMORD) within a manzana (CODMANZANA). This resolves the old "which layer is the
//                ring" open question (SOURCES.md §A caveat 2) — it is layer 6, read directly.
//     • layer 1  "Ficha Específica" (esriGeometryPoint, field FESPECIFICA) — parcels with
//                INDIVIDUALLY-defined conditions; a point in the parcel ⇒ the general footprint
//                does NOT govern ⇒ `hasParcelOverride: true` ⇒ the resolver DEFERS (honest, not the
//                general polygon applied to a parcel it was not drawn for).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE COEF_Z HONESTY GATE (§CONTEXT-DATA-HONESTY — the load-bearing part of this file)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `COEF_Z` is typed **String(255)** and its live value vocabulary (probed 2026-07-23) is NOT a bare
// float. Observed distinct values: `"-"`, `"4"`, `"5"`, `"0 / 5"`, `"0 / 4"`. So:
//   • `"-"` / `""` / null  → NO coefficient published (absent). NOT zero.
//   • `"4"` / `"5"` / `"1,20"` → a single clean number (comma-decimal tolerated).
//   • `"0 / 5"` → a COMPOUND CODE. `parseFloat("0 / 5") === 0` is the exact silent-zero trap this
//                 gate exists to stop. It is REFUSED (`kind: 'coded'`), never coerced to 0.
// `parseCoefZ` is the defensive classifier. Even a cleanly-numeric COEF_Z is NOT promoted into
// `source.edificabilidad` (which the engine feeds to `maxFAR` → volume) UNLESS the caller passes
// `assertCoefZAsFAR: true` — because the m²/m² SEMANTICS of "Coeficiente Z" are UNVERIFIED against
// the primary NNUU (the observed 4/5 read like grados/plantas, not FAR ratios). Promoting a
// grado-looking "5" to FAR = 5 would silently multiply the volume. The FOOTPRINT ring is the real
// NZ 1 envelope and flows regardless; the FAR stays null until a human confirms the coding and
// signs the L-449 gate. The assertion IS the human "parse under assertion".
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// LAYERING (C58 §1.9 / §3.1)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   • `parseCoefZ`, `mapMadridConditionsToExplicitAreaSource` — PURE (no I/O, no THREE, no DOM,
//     deterministic). Unit-tested against fixtures modelled on the live probe.
//   • `MadridNZ1RingProvider.fetchExplicitAreaSource` — the ONE impure seam (fetch). Mirrors
//     `DkZoningProvider`: a same-origin proxy (never browser→sigma directly, C57), an OTel span
//     (P8 / C58 §1.10), an `isInMadrid` gate, and NEVER throws — a miss / failure returns `null`
//     and the caller falls back to a refusal, never a guess.
//   • Coordinate frame: the ArcGIS rings are EPSG:25830 (UTM 30N) easting/northing metres. This
//     module emits them via an injectable `projectPoint`, defaulting to `{x: easting, z: northing}`.
//     The L5 editor injects the real scene-XZ rebase — a pure TRANSLATION, and `parcel ∩ footprint`
//     is translation-invariant, so both must be rebased by the SAME transform (the editor's job).
//
// PURE core + one impure fetch. Governance: C58 §1.5/§1.9/§1.10/§1.11/§2.2 (KG-4), ADR-0270,
// docs/04-reference/jurisdictions/es/es-md/28079-madrid/.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { Pt } from '@pryzm/schemas';
import type { ExplicitAreaSource } from '../geometry/explicitArea.js';
import { MADRID_NZ1_RULE } from './esMadridNZ1.js';

const tracer = trace.getTracer('pryzm.zoning');

/**
 * The ringRef this provider answers for — TAKEN FROM the pack so the two can never drift. A source
 * whose `ringRef` does not equal this is rejected by `resolveExplicitAreaRing` (`ringref-mismatch`).
 * Narrowed by `kind` because `MADRID_NZ1_RULE` is typed as the broad `GeometricRule` union and only
 * the `explicit-area` member carries `ringRef` (the pack always sets that member — see esMadridNZ1.ts).
 */
export const MADRID_NZ1_RING_REF: string =
    MADRID_NZ1_RULE.kind === 'explicit-area' ? MADRID_NZ1_RULE.ringRef : 'madrid-nz1:fondo-condiciones/v-2023';

/**
 * Same-origin proxy routes the browser calls (C57 — never the sigma endpoint directly, so no CSP
 * `connect-src` change and no key exposure). The server-side proxy that forwards these to
 * `sigma.madrid.es/.../PG_CONDICIONES_EDIFICACION/MapServer/{6,1}/query` is the REMAINING wiring
 * act (documented in the Madrid record); this module is proxy-agnostic via `deps.*PathBase`.
 */
export const MADRID_NZ1_CONDICIONES_PATH = '/api/madrid/pgoum97/condiciones';
export const MADRID_NZ1_FICHA_PATH = '/api/madrid/pgoum97/ficha';

/** Loose Madrid-municipality WGS84 bbox — a proximity gate, NOT a claim of jurisdiction. */
export const MADRID_BBOX = {
    minLat: 40.3,
    maxLat: 40.65,
    minLon: -3.9,
    maxLon: -3.5,
} as const;

/** True when a WGS84 point falls in the loose Madrid bounding box. Never throws. */
export function isInMadrid(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= MADRID_BBOX.minLat &&
        lat <= MADRID_BBOX.maxLat &&
        lon >= MADRID_BBOX.minLon &&
        lon <= MADRID_BBOX.maxLon
    );
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 1 — THE COEF_Z DEFENSIVE PARSER (the honesty gate)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Classification of a raw `COEF_Z` String value. A closed vocabulary — these are different states. */
export type CoefZParse =
    /** `"-"`, `""`, null/undefined — the source publishes NO coefficient. NOT zero. */
    | { readonly kind: 'absent' }
    /** A single clean number (`"5"`, `"1,20"`) — parsed. Semantics (FAR vs grado) still unverified. */
    | { readonly kind: 'numeric'; readonly value: number }
    /** A compound / non-numeric code (`"0 / 5"`) — REFUSED, so it is never silently coerced to 0. */
    | { readonly kind: 'coded'; readonly raw: string };

/**
 * Classify a raw `COEF_Z` (typed String on layer 6). Defensive by contract: the compound code
 * `"0 / 5"` — for which `parseFloat` returns a plausible-but-wrong `0` — is reported as `coded`,
 * never numeric. Comma decimals (`"1,20"`) are tolerated (Spanish locale). Anything not matching a
 * single signed decimal after trimming is `coded`; the placeholder `"-"` and blanks are `absent`.
 */
export function parseCoefZ(raw: unknown): CoefZParse {
    if (raw === null || raw === undefined) return { kind: 'absent' };
    const s = String(raw).trim();
    if (s === '' || s === '-') return { kind: 'absent' };
    // Spanish decimal comma → dot, but ONLY when it is the sole separator (no thousands ambiguity,
    // and no second numeric token — `"0 / 5"` still fails the single-decimal test below).
    const normalised = s.replace(',', '.');
    if (/^-?\d+(\.\d+)?$/.test(normalised)) {
        const value = Number(normalised);
        if (Number.isFinite(value)) return { kind: 'numeric', value };
    }
    return { kind: 'coded', raw: s };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 2 — THE ArcGIS RESPONSE SHAPES (minimal — only what the mapper reads)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** One layer-6 polygon feature (Esri JSON). `rings[0]` is the outer ring; `[x,y]` = easting,northing. */
export interface ArcGisPolygonFeature {
    readonly attributes?: Readonly<Record<string, unknown>>;
    readonly geometry?: { readonly rings?: ReadonlyArray<ReadonlyArray<readonly [number, number]>> } | null;
}

/** A layer-6 `.../query?f=json` response. */
export interface ArcGisPolygonQueryResponse {
    readonly features?: ReadonlyArray<ArcGisPolygonFeature>;
    readonly spatialReference?: { readonly wkid?: number } | null;
}

/** A layer-1 (Ficha Específica) point-query response — presence of ANY feature = an override. */
export interface ArcGisPointQueryResponse {
    readonly features?: ReadonlyArray<{ readonly attributes?: Readonly<Record<string, unknown>> }>;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 3 — THE PURE MAPPER: ArcGIS response → ExplicitAreaSource
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Why the mapper could not produce a source. Distinct from the resolver's refusals. */
export type MadridNZ1MapRefusal =
    /** The condiciones query returned no polygon feature covering the parcel. */
    | 'no-feature'
    /** The chosen feature carried no usable ring geometry. */
    | 'no-geometry'
    /** The ring has < 3 distinct vertices. */
    | 'degenerate-ring';

export type MadridNZ1MapResult =
    | {
          readonly ok: true;
          readonly source: ExplicitAreaSource;
          /** The COEF_Z classification, ALWAYS surfaced so a caller/report can see WHY (not just the value). */
          readonly coefZ: CoefZParse;
      }
    | { readonly ok: false; readonly reason: MadridNZ1MapRefusal };

export interface MapMadridConditionsOpts {
    /** The ringRef to stamp on the source (default `MADRID_NZ1_RING_REF`). */
    readonly ringRef?: string;
    /** UTM(25830) easting,northing → scene Pt. Default `{x: easting, z: northing}` (identity into XZ). */
    readonly projectPoint?: (easting: number, northing: number) => Pt;
    /** The Ficha Específica point-query result; ANY feature here ⇒ `hasParcelOverride: true`. */
    readonly fichaResponse?: ArcGisPointQueryResponse | null;
    /** Which polygon feature to use when several cover the point (default 0 — the first). */
    readonly featureIndex?: number;
    /**
     * Promote a cleanly-numeric COEF_Z into `source.edificabilidad` (which the engine feeds to
     * maxFAR→volume). Default FALSE: the FAR semantics of "Coeficiente Z" are UNVERIFIED, so the
     * number is withheld from the volume calc until a human asserts it (the L-449 gate). The
     * footprint ring flows regardless. See the file header's honesty-gate section.
     */
    readonly assertCoefZAsFAR?: boolean;
}

const DEFAULT_PROJECT = (easting: number, northing: number): Pt => ({ x: easting, z: northing });

/** Strip a trailing closing-duplicate vertex (Esri rings repeat the first point). */
function stripClosingVertex(ring: Pt[]): Pt[] {
    if (ring.length > 1) {
        const first = ring[0]!;
        const last = ring[ring.length - 1]!;
        if (Math.hypot(first.x - last.x, first.z - last.z) <= 1e-6) return ring.slice(0, -1);
    }
    return ring;
}

/**
 * Adapt a Madrid `PG_CONDICIONES_EDIFICACION` layer-6 response (+ optional Ficha layer-1 response)
 * into the generic `ExplicitAreaSource`. PURE and deterministic — never fabricates: no covering
 * polygon or no usable ring is a typed refusal, not an empty envelope.
 */
export function mapMadridConditionsToExplicitAreaSource(
    response: ArcGisPolygonQueryResponse | null | undefined,
    opts: MapMadridConditionsOpts = {},
): MadridNZ1MapResult {
    const features = response?.features ?? [];
    const idx = opts.featureIndex ?? 0;
    const feature = features[idx];
    if (!feature) return { ok: false, reason: 'no-feature' };

    const rings = feature.geometry?.rings;
    const outer = rings && rings.length > 0 ? rings[0] : undefined;
    if (!outer || outer.length < 3) return { ok: false, reason: 'no-geometry' };

    const project = opts.projectPoint ?? DEFAULT_PROJECT;
    const projected: Pt[] = [];
    for (const pair of outer) {
        const e = Number(pair[0]);
        const n = Number(pair[1]);
        if (!Number.isFinite(e) || !Number.isFinite(n)) return { ok: false, reason: 'no-geometry' };
        projected.push(project(e, n));
    }
    const ring = stripClosingVertex(projected);
    if (ring.length < 3) return { ok: false, reason: 'degenerate-ring' };

    const coefZ = parseCoefZ(feature.attributes?.['COEF_Z']);
    const edificabilidad =
        opts.assertCoefZAsFAR && coefZ.kind === 'numeric' ? coefZ.value : null;

    // A Ficha Específica point in the parcel means individually-defined conditions govern.
    const hasParcelOverride = (opts.fichaResponse?.features?.length ?? 0) > 0;

    const source: ExplicitAreaSource = {
        ringRef: opts.ringRef ?? MADRID_NZ1_RING_REF,
        footprintRing: ring,
        edificabilidad,
        hasParcelOverride,
    };
    return { ok: true, source, coefZ };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// 4 — THE IMPURE PROVIDER (the one fetch seam)
// ──────────────────────────────────────────────────────────────────────────────────────────────

export interface MadridNZ1ProviderDeps {
    /** Override `globalThis.fetch` (tests inject a fake). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy base for the condiciones (layer 6) query. */
    readonly condicionesPathBase?: string;
    /** Same-origin proxy base for the ficha (layer 1) query. */
    readonly fichaPathBase?: string;
    /** UTM→scene projector the L5 editor injects; default identity-into-XZ. */
    readonly projectPoint?: (easting: number, northing: number) => Pt;
    /** Override the ringRef (default the pack's). */
    readonly ringRef?: string;
    /** Promote a numeric COEF_Z to FAR (default false — see the mapper opt). */
    readonly assertCoefZAsFAR?: boolean;
}

export interface MadridNZ1Provider {
    readonly id: string;
    readonly label: string;
    /**
     * Resolve the NZ 1 buildable footprint at a WGS84 point into an `ExplicitAreaSource`, or `null`
     * (out-of-Madrid / no plan / upstream failure). NEVER throws. The caller passes the returned
     * source to `resolveExplicitAreaRing`, then injects the `ok` ring as `explicitAreaFootprint`.
     */
    fetchExplicitAreaSource(
        lat: number,
        lon: number,
        deps?: MadridNZ1ProviderDeps,
    ): Promise<MadridNZ1MapResult | null>;
}

async function queryJson(fetchImpl: typeof fetch, url: string): Promise<unknown | null> {
    try {
        const res = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' } });
        if (!res || !res.ok) return null;
        return (await res.json()) as unknown;
    } catch {
        return null;
    }
}

/**
 * `MadridNZ1RingProvider` — the Madrid NZ 1 `explicit-area` provider. Point-based (mirrors the C57
 * `ParcelProvider` precedent): the proxy keys the sigma spatial query on the parcel's WGS84 point.
 */
export const MadridNZ1RingProvider: MadridNZ1Provider = {
    id: 'sigma-madrid-pgoum97-nz1',
    label: 'sigma.madrid.es — PGOUM-97 Condiciones de la Edificación (Norma Zonal 1)',

    async fetchExplicitAreaSource(
        lat: number,
        lon: number,
        deps: MadridNZ1ProviderDeps = {},
    ): Promise<MadridNZ1MapResult | null> {
        const span = tracer.startSpan('pryzm.zoning.fetchMadridNZ1Footprint');
        span.setAttribute('provider', 'sigma-madrid-pgoum97-nz1');
        try {
            if (!isInMadrid(lat, lon)) {
                span.setAttribute('resultFields', 'out-of-madrid');
                span.setStatus({ code: SpanStatusCode.OK });
                return null;
            }
            const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
            if (typeof fetchImpl !== 'function') {
                span.setAttribute('resultFields', 'no-fetch');
                span.setStatus({ code: SpanStatusCode.OK });
                return null;
            }

            const q = `?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}`;
            const condUrl = (deps.condicionesPathBase ?? MADRID_NZ1_CONDICIONES_PATH) + q;
            const fichaUrl = (deps.fichaPathBase ?? MADRID_NZ1_FICHA_PATH) + q;

            const [condRaw, fichaRaw] = await Promise.all([
                queryJson(fetchImpl, condUrl),
                queryJson(fetchImpl, fichaUrl),
            ]);
            if (condRaw === null) {
                span.setAttribute('resultFields', 'upstream-miss');
                span.setStatus({ code: SpanStatusCode.OK });
                return null;
            }

            const result = mapMadridConditionsToExplicitAreaSource(
                condRaw as ArcGisPolygonQueryResponse,
                {
                    ringRef: deps.ringRef,
                    projectPoint: deps.projectPoint,
                    fichaResponse: (fichaRaw as ArcGisPointQueryResponse | null) ?? null,
                    assertCoefZAsFAR: deps.assertCoefZAsFAR,
                },
            );
            span.setAttribute('resultFields', result.ok ? 'source' : `refusal:${result.reason}`);
            if (result.ok) {
                span.setAttribute('coefZ', result.coefZ.kind);
                span.setAttribute('hasParcelOverride', String(result.source.hasParcelOverride ?? false));
            }
            span.setStatus({ code: SpanStatusCode.OK });
            return result;
        } catch (err) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
            console.warn('[madrid-nz1] unexpected error (non-fatal):', (err as Error)?.message ?? err);
            return null;
        } finally {
            span.end();
        }
    },
};
