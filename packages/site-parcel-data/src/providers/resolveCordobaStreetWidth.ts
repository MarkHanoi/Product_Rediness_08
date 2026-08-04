// §COR-STREET-WIDTH — measuring the street width Córdoba MC's per-street-width height table (Art.
// 13.5.3.1) is keyed on, from the AYUNTAMIENTO'S OWN PUBLISHED BLOCK LAYER — `idecordoba:manzana`.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS, AND WHY IT SUPERSEDES NOTHING THAT ALREADY WORKS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// A DIFFERENT block-ring resolver already exists and is wired in production:
// `apps/editor/src/ui/site/parcel/resolveCordobaMcStreetWidth.ts` DISSOLVES the manzana from its
// constituent Catastro parcels (`dissolveParcelsToBlockRing`), because at the time it was written
// no municipality-published block polygon was known to be reachable. That path is real, tested,
// and measured at 76.9 % (production Catastro INSPIRE lineage) / 88.5 % (COACo's own copy) —
// see `dissolveParcelsToBlockRing`'s own header and `resolveMurciaStreetWidth.ts`'s §CORRECTED note.
//
// This module is the OTHER half of `geometry/streetWidth.ts`'s own header claim — "region-agnostic:
// takes rings and returns metres" — fed from `idecordoba:manzana`, the Ayuntamiento de Córdoba's own
// published city-block layer (live-verified 2026-08-04: `totalFeatures = 20 730`, EPSG:25830, real
// MultiPolygon geometry at `https://ide.cordoba.es/geoserver/wfs`). A manzana published DIRECTLY as
// a polygon needs **no dissolve at all** — the exact shortcut Murcia's `pgou_alineaciones` already
// gets, and `resolveMurciaStreetWidth.ts` names as the reason Murcia could ship ahead of Córdoba.
//
// Under ADR-0283 (published geometry outranks geometry PRYZM derives itself) and ADR-0290 (as
// `resolveMurciaStreetWidth.ts`'s own header records: "the dissolve is now the FALLBACK, not the
// goal"), THIS resolver is the PRIMARY path for Córdoba MC, and the dissolve-based
// `resolveCordobaMcStreetWidth` becomes the fallback for whatever `idecordoba:manzana` does not
// cover. The caller (`apps/editor/src/ui/site/siteDispatch.ts`) tries this one first.
//
// NOT A SECOND SOLVER: the measurement is `measureStreetWidths` / `blockEdgesFacingParcel` /
// `governingStreetWidth`, unmodified and region-agnostic (ADR-0275), exactly as
// `resolveMurciaStreetWidth.ts` uses it. This module only fetches, frames, and picks.
//
// SIMPLER THAN MURCIA IN ONE RESPECT: Córdoba has no *Eje Comercial* graphed-axis layer counterpart
// in this table (Art. 13.5.3.1 carries no such condition), so there is no `ejeComercial` field and
// no second upstream fetch — one layer, one query, one result.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// DOCTRINE B — refuse rather than infer beyond published extent
// ══════════════════════════════════════════════════════════════════════════════════════════════
// *"PRYZM shall dispatch deterministic envelopes only where the applicable zoning geometry is
// directly supported by authoritative published data. Partial publication does not authorize
// inference beyond its demonstrated spatial extent."* (SIG-M2, Madrid — binds here too.)
//
//   • no published manzana covers the point         ⇒ `no-manzana-here` (never a nearby polygon)
//   • the neighbourhood query hit the feature cap    ⇒ `neighbourhood-truncated` (the block across
//                                                       the street may be the one that was dropped)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// §NATIVE-CRS-MEASUREMENT — MEASURED IN EPSG:25830, NEVER IN REPROJECTED DEGREES
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Identical discipline to `resolveMurciaStreetWidth.ts` (see that file's header for the measured
// cost of getting this wrong: a median 3 m error against 8 m/2 m-apart legal bands, from a
// 4-decimal degree serialisation). The proxy (`server/cordobaZoningProxy.js`,
// `makeCordobaManzanaHandler`) asks the IDE GeoServer for `srsName=EPSG:25830` and declares
// `crs: 'EPSG:25830'` on every response, including empty ones. `makeMeasurementFrame` is the single
// enforcement point: a body that does not declare an allow-listed metric CRS refuses loudly
// (`crs-not-native`) rather than measuring reprojected degrees.
//
// Contracts: C58 §1.1/§1.4/§1.9/§1.10 · ADR-0271 · ADR-0275 · ADR-0283 · ADR-0287 ·
// §CONTEXT-DATA-HONESTY (L-422/457/467/469). Never throws — every miss is a typed refusal.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { Pt } from '@pryzm/schemas';
import {
    measureStreetWidths,
    blockEdgesFacingParcel,
    governingStreetWidth,
} from '../geometry/streetWidth.js';
import {
    makeMeasurementFrame,
    type MeasurementFrame,
} from '../geometry/nativeCrs.js';
import { isInCordoba } from './cordobaBbox.js';
import { featureCoversXY } from './resolveMurciaZoning.js';

const tracer = trace.getTracer('pryzm.zoning');

/** The same-origin proxy route (`server/cordobaZoningProxy.js`, `makeCordobaManzanaHandler`). */
export const CORDOBA_MANZANA_PATH = '/api/cordoba/manzana';

/**
 * The authority string every success carries — named as what it is, never as an official measure.
 * Córdoba publishes no *ancho oficial* for any street (§COR-ALIGNMENT, `esCordobaPGOU2001.ts`).
 */
export const CORDOBA_STREET_WIDTH_AUTHORITY =
    'CONSTRUCTED by PRYZM from Ayuntamiento de Córdoba, «idecordoba:manzana» (IDE Córdoba ' +
    'GeoServer, ide.cordoba.es, EPSG:25830) — a frontage-to-frontage distance measured from ' +
    'published city-block geometry IN THAT NATIVE CRS, at the precision the municipality ' +
    'serialises it. ⚠ NOT an official Córdoba street-width measurement: no alineación layer ' +
    'exists to read one from (see §COR-ALIGNMENT), and idecordoba:manzana carries no zoning at all.';

export interface CordobaStreetWidthDeps {
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy base (default `CORDOBA_MANZANA_PATH`). */
    readonly pathBase?: string;
    /**
     * The committed parcel ring in the SAME lon/lat degrees, when known. Used only to narrow which
     * block edges govern (`blockEdgesFacingParcel`). Omitted ⇒ the narrowest frontage of the whole
     * block governs (`governingStreetWidth`'s documented conservative fallback).
     */
    readonly parcelRingLonLat?: ReadonlyArray<readonly [number, number]>;
}

export type CordobaStreetWidthRefusal =
    /** Outside the coarse Córdoba pilot bbox. */
    | 'out-of-cordoba'
    /** No usable `fetch`. */
    | 'no-fetch'
    /** The service did not answer. ⚠ NOT "there is no block published here" (L-422/457/467/469). */
    | 'endpoint-unreachable'
    /** It answered, but nothing parsed into a ring — the layer may have changed shape. */
    | 'unparsable-response'
    /**
     * §NATIVE-CRS-MEASUREMENT — the body did not declare a CRS we are allowed to MEASURE in
     * (missing `crs`, a geographic CRS, or a code absent from `NATIVE_METRIC_CRS`). Refuses on
     * purpose — see the file header.
     */
    | 'crs-not-native'
    /** DOCTRINE B — no published manzana covers this point. Never substitute a nearby one. */
    | 'no-manzana-here'
    /** DOCTRINE B — the neighbourhood hit the feature cap, so the far side may be missing. */
    | 'neighbourhood-truncated'
    /**
     * Rays found no opposing frontage on any governing edge, or the samples disagreed by more than
     * the tolerance. ⚠ THIS IS THE HONESTY GATE WORKING, NOT A DEFECT.
     */
    | 'no-opposing-frontage';

export type CordobaStreetWidthResolution =
    | {
          readonly ok: true;
          /** Median frontage-to-frontage distance, metres. CONSTRUCTED — see `provenance`. */
          readonly width_m: number;
          /** THE ERROR BAR (max − min across rays). Feeds the ADR-0287 band-edge guard. */
          readonly spread_m: number;
          readonly sampleCount: number;
          readonly edgeIndex: number;
          readonly provenance: 'measured-geometry';
          readonly authority: string;
          /** How many neighbouring manzanas the measurement had to shoot at. Audit aid. */
          readonly neighbourCount: number;
          /** The CRS the metres above were actually measured in, carried as DATA. */
          readonly measurementCrs: string;
      }
    | { readonly ok: false; readonly reason: CordobaStreetWidthRefusal };

/** A GeoJSON linear ring — `[easting, northing]` in the body's declared native metric CRS. */
type CoordRing = readonly (readonly number[])[];

/**
 * Every OUTER ring of a GeoJSON Polygon / MultiPolygon, placed in the measurement frame. Holes are
 * not frontages. Identical shape to `resolveMurciaStreetWidth.ts`'s `featureOuterRings` — kept as a
 * local copy rather than a shared export because each file's `CoordRing`/`Pt` wiring is otherwise
 * self-contained and a shared geometry helper this small is not worth a new module boundary.
 */
function featureOuterRings(feature: unknown, frame: MeasurementFrame): Pt[][] {
    const geom = (feature as { geometry?: { type?: unknown; coordinates?: unknown } } | null)?.geometry;
    if (!geom || typeof geom !== 'object') return [];
    const coords = geom.coordinates;
    if (!Array.isArray(coords) || coords.length === 0) return [];
    const project = (ring: CoordRing): Pt[] =>
        ring
            .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
            .map((p) => frame.fromNative(p[0]!, p[1]!));
    if (geom.type === 'Polygon') {
        const outer = (coords as unknown as readonly CoordRing[])[0];
        const r = outer ? project(outer) : [];
        return r.length >= 3 ? [r] : [];
    }
    if (geom.type === 'MultiPolygon') {
        const out: Pt[][] = [];
        for (const poly of coords as unknown as readonly (readonly CoordRing[])[]) {
            const outer = poly?.[0];
            if (!outer) continue;
            const r = project(outer);
            if (r.length >= 3) out.push(r);
        }
        return out;
    }
    return [];
}

/** The proxy's neighbourhood response body (`server/cordobaZoningProxy.js`, `makeCordobaManzanaHandler`). */
interface CordobaManzanaBody {
    /**
     * §NATIVE-CRS-MEASUREMENT — the CRS the geometry below is serialised in, DECLARED by the proxy.
     * ⚠ Optional in the type and REQUIRED in practice: an absent `crs` is `crs-not-native`, never
     * "assume 4326".
     */
    readonly crs?: unknown;
    readonly manzanas?: unknown[] | null;
    readonly truncated?: boolean;
}

/** Shoelace magnitude. Local so the tie-break below cannot depend on import order. */
function ringArea(ring: ReadonlyArray<Pt>): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!, q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
}

/**
 * Measure the street width governing a Córdoba point, from the Ayuntamiento's published
 * `idecordoba:manzana` block layer.
 *
 * NEVER THROWS — every miss is a typed refusal. OTel span `pryzm.zoning.resolveCordobaStreetWidth`.
 *
 * ⚠ THE RESULT IS AN INPUT, NOT AN ANSWER. Feed it to `resolveCordobaMcHeightForWidth`
 * (`esCordobaPGOU2001.ts`) together with `spread_m`; that function owns the band decision and the
 * ADR-0287 band-edge refusal. Reading `width_m` and picking a band by hand would bypass it.
 */
export async function resolveCordobaStreetWidth(
    point: { lat: number; lon: number } | null | undefined,
    deps: CordobaStreetWidthDeps = {},
): Promise<CordobaStreetWidthResolution> {
    const span = tracer.startSpan('pryzm.zoning.resolveCordobaStreetWidth');
    span.setAttribute('provider', 'cordoba-idecordoba-manzana');
    try {
        if (
            !point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon) ||
            !isInCordoba(point.lat, point.lon)
        ) {
            span.setAttribute('resultFields', 'out-of-cordoba');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'out-of-cordoba' };
        }
        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('resultFields', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-fetch' };
        }

        const base = deps.pathBase ?? CORDOBA_MANZANA_PATH;
        const url =
            `${base}?lat=${encodeURIComponent(String(point.lat))}` +
            `&lon=${encodeURIComponent(String(point.lon))}`;

        let body: CordobaManzanaBody | null = null;
        try {
            const res = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' } });
            if (!res || !res.ok) {
                span.setAttribute('resultFields', 'upstream-miss');
                span.setStatus({ code: SpanStatusCode.OK });
                return { ok: false, reason: 'endpoint-unreachable' };
            }
            body = (await res.json()) as CordobaManzanaBody | null;
        } catch (err) {
            span.setAttribute('resultFields', 'fetch-error');
            span.setStatus({ code: SpanStatusCode.OK });
            console.warn('[cordoba-width] fetch failed (non-fatal):', (err as Error)?.message ?? err);
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        // ⚠ PRECEDENCE: TRANSPORT FAILURE OUTRANKS EVERYTHING BELOW IT (mirrors resolveMurciaStreetWidth).
        const features = body?.manzanas;
        if (features === null || features === undefined || !Array.isArray(features)) {
            span.setAttribute('resultFields', 'endpoint-unreachable');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        // §NATIVE-CRS-MEASUREMENT — THE GUARD. Establish the frame BEFORE reading a coordinate.
        // Sits ABOVE the empty check: an unreadable CRS must never surface as "Córdoba publishes no
        // manzana here" — that would be a claim about the municipality's data, made on the strength
        // of our own mis-configuration.
        const frame = makeMeasurementFrame(body?.crs, point.lat, point.lon);
        if (!frame) {
            span.setAttribute('resultFields', 'crs-not-native');
            span.setAttribute('declaredCrs', String(body?.crs ?? '(absent)'));
            span.setStatus({ code: SpanStatusCode.OK });
            console.warn(
                '[cordoba-width] REFUSING to measure: the proxy declared crs=' +
                `${String(body?.crs ?? '(absent)')}, which is not an allow-listed metric CRS.`,
            );
            return { ok: false, reason: 'crs-not-native' };
        }
        span.setAttribute('measurementCrs', frame.crs);
        span.setAttribute('measurementFidelity', frame.fidelity);

        // DOCTRINE B — a capped answer is a PARTIAL publication.
        if (body?.truncated === true) {
            span.setAttribute('resultFields', 'neighbourhood-truncated');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'neighbourhood-truncated' };
        }
        if (features.length === 0) {
            span.setAttribute('resultFields', 'no-manzana-here');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-manzana-here' };
        }

        // ── Split the neighbourhood into OURS (covers the click) and THEIRS. ──────────────────
        // ⚠ `featureCoversXY` is THREE-VALUED and only an explicit `true` claims ours — see
        // `resolveMurciaStreetWidth.ts` for why a `null` must be treated as a neighbour, never as
        // our block.
        const ours: Pt[][] = [];
        const theirs: Pt[][] = [];
        let parsedAny = false;
        for (const f of features) {
            const rings = featureOuterRings(f, frame);
            if (rings.length === 0) continue;
            parsedAny = true;
            if (featureCoversXY(f, frame.originE, frame.originN) === true) ours.push(...rings);
            else theirs.push(...rings);
        }
        if (!parsedAny) {
            span.setAttribute('resultFields', 'unparsable-response');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'unparsable-response' };
        }
        if (ours.length === 0) {
            // DOCTRINE B — the municipality published no manzana over this point.
            span.setAttribute('resultFields', 'no-manzana-here');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-manzana-here' };
        }

        // Deterministic when a click sits in more than one published polygon (a shared boundary):
        // take the LARGEST outer ring by vertex count, then by absolute area — never "the first one
        // GeoServer listed" (mirrors resolveMurciaStreetWidth's identical tie-break, C1).
        const ourRing = ours.reduce((a, b) =>
            b.length !== a.length ? (b.length > a.length ? b : a) : (ringArea(b) > ringArea(a) ? b : a));

        const result = measureStreetWidths(ourRing, theirs);
        // The committed parcel ring is PRYZM's own geometry at full double precision, so projecting
        // it here loses nothing — unlike wire geometry, already quantised by the time we see it.
        const parcelRing = deps.parcelRingLonLat
            ?.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))
            .map((p) => frame.fromLonLat(p[0], p[1]))
            .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z));
        const edges = parcelRing && parcelRing.length >= 3
            ? blockEdgesFacingParcel(ourRing, parcelRing)
            : undefined;
        const governing = governingStreetWidth(result, edges);
        if (!governing) {
            span.setAttribute('resultFields', 'no-opposing-frontage');
            span.setAttribute('rejectedEdges', result.rejected.length);
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-opposing-frontage' };
        }

        span.setAttribute('resultFields', 'width');
        span.setAttribute('width_m', governing.width_m);
        span.setAttribute('spread_m', governing.spread_m);
        span.setStatus({ code: SpanStatusCode.OK });
        return {
            ok: true,
            width_m: governing.width_m,
            spread_m: governing.spread_m,
            sampleCount: governing.sampleCount,
            edgeIndex: governing.edgeIndex,
            provenance: 'measured-geometry',
            authority: CORDOBA_STREET_WIDTH_AUTHORITY,
            neighbourCount: theirs.length,
            measurementCrs: frame.crs,
        };
    } finally {
        span.end();
    }
}
