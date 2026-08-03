// §MURCIA-STREET-WIDTH — measuring the *ancho de calle* from Murcia's published alineaciones.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT SIG-MU2 SIGNED, AND WHAT THIS FILE OWES IT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Founder, 2026-08-02: *"The ordinance makes street width the legal criterion. It does not
// prescribe a measurement methodology. Computing that width from authoritative geometry is an
// implementation of the ordinance, not a modification of it. The legal rule remains unchanged;
// only the measurement is derived."*
//
// That approval carries FOUR BINDING CONDITIONS. Three of them are this file's responsibility and
// each is pinned by a named test in `__tests__/murciaStreetWidth.test.ts`:
//
//   C1 REPRODUCIBLE FROM AUTHORITATIVE GEOMETRY. Same input ⇒ byte-identical width. The authority
//      is Murcia's own published `Murcia:pgou_alineaciones`; every step below is pure arithmetic on
//      it, and the fetch is injected so a fixture reproduces a live answer exactly.
//   C2 EXPLICITLY LABELLED CONSTRUCTED. Every success carries `provenance: 'measured-geometry'` and
//      `authority`, as DATA, not as a comment — the resolution cannot be rendered without them.
//      ADR-0271: Barcelona's *profunditat edificable* is constructed and says so.
//   C4 REFUSE WHERE UNCERTAINTY COULD CHANGE THE BAND. This file supplies the honest `spread_m`
//      (the measurement's own error bar) that `resolveMurciaAnchoDeCalle` turns into the band-edge
//      refusal, and refuses outright on truncated/absent geometry. **Never weaken this to raise
//      coverage — it is now a SIGNED requirement, not a policy choice.**
//   (C3 — every result carries its article — lives in `esMurciaAnchoDeCalle.ts`, where the bands are.)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// DOCTRINE B (SIG-M2, Madrid) — CHECKED AGAINST, AND IT BINDS HERE TOO
// ══════════════════════════════════════════════════════════════════════════════════════════════
// *"PRYZM shall dispatch deterministic envelopes only where the applicable zoning geometry is
// directly supported by authoritative published data. Partial publication does not authorize
// inference beyond its demonstrated spatial extent."*
//
// Measuring a width from published alineaciones is an IMPLEMENTATION of a published criterion —
// the distinction the founder's own SIG-MU2 rationale draws. But the second sentence bites, so
// both partial-data cases REFUSE rather than extrapolate:
//   • no alineación polygon covers the point       ⇒ `no-alineacion-here` (never a nearby polygon)
//   • the neighbourhood query hit the feature cap  ⇒ `neighbourhood-truncated` (the polygon across
//                                                     the street may be the one that was dropped)
// A width invented where the municipality published no geometry is exactly the inference beyond
// demonstrated extent Doctrine B forbids.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY MURCIA CAN DO THIS WHERE MADRID AND CÓRDOBA CANNOT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `geometry/streetWidth.ts` needs OUR block outline plus the outlines across the street. Barcelona
// gets its outline from `dissolveParcelsToBlockRing`. **Murcia's municipality publishes the
// block-level alineación polygons directly**, so this route skips the dissolve entirely — which is
// why the 8.81 pp was reachable here without solving dissolve first.
//
// ⚠ CORRECTED 2026-08-02 — the dissolve figures previously quoted here were WRONG, and this file
// was the last live copy of them (sixth propagation of the same stale claim; `streetWidth.ts:28-40`
// had already been corrected). It read "fails on most non-Barcelona blocks (BCN 2/2, Madrid 2/4,
// Córdoba 0/3)". **`0/3` was a THREE-BLOCK SAMPLE that reached shipped code as a P1 ceiling.**
// Measured at scale in both Córdoba lineages: **Catastro INSPIRE 20/26 = 76.9 % (the production
// path), COACo 354/400 = 88.5 %**; Barcelona 96.22 %. Dissolve costs roughly one block in four — it
// does NOT cap a city. Do not re-derive a ceiling from a handful of blocks (BLOCKER-CLASSIFICATION-
// STANDARD: "a ceiling asserted from a sample is not a ceiling — state N").
//
// ⚠ And under ADR-0290 the dissolve is now the FALLBACK, not the goal: `idecordoba:manzana`
// publishes 20 730 block polygons covering 92.9 % of Córdoba's ordenanza polygons, and published
// geometry outranks geometry we derive ourselves (ADR-0283).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// §NATIVE-CRS-MEASUREMENT — THE WIDTH IS MEASURED IN EPSG:25830, NEVER IN REPROJECTED DEGREES
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠⚠ THIS FILE USED TO MEASURE THE WRONG GEOMETRY, AND IT WAS ONE URL PARAMETER.
//
// The proxy asked GeoServer for `srsName=EPSG:4326`. GeoServer serialises GeoJSON at
// `numDecimals=4` — 0,1 mm in the layer's native METRES, but ~8,8 m of longitude and ~11,1 m of
// latitude in DEGREES. So the rings this module measured were quantised to roughly ten metres, and
// the number it produced picks a storey band at 4 m, 8 m and 12 m thresholds.
//
// MEASURED LIVE 2026-08-02, same features in both CRS matched by WFS feature id (707 features /
// 19 986 segments over 12 neighbourhoods):
//     segment |Δlength|   median 2,96 m · p90 7,34 m · p99 10,33 m · max 13,71 m
//     DEGENERATE (zero-length) segments — 4326: 7 499 of 19 986 (37,5 %) · native 25830: 1
// The measurement error was the same size as the legal bands, and a third of every ring's edges had
// collapsed to nothing. `format_options=numDecimals` is not honoured by this server, so more
// precision in 4326 was never on offer.
//
// **THE RULE, AND IT IS GENERAL:** request the publisher's native metric CRS → measure in it →
// reproject ONLY at a display boundary. This resolver returns SCALARS (metres), so it has no display
// boundary at all and nothing here is ever reprojected. The capability lives in
// `../geometry/nativeCrs.ts`, region-agnostic, so Catalunya (25831), Galicia (25829) and every other
// metre-CRS publisher plug in by naming their EPSG code — not by copying this file.
//
// **AND IT IS ENFORCED, NOT MERELY DOCUMENTED.** The body must DECLARE a CRS on the metric
// allow-list; anything else — a missing `crs`, a geographic `crs`, an unrecognised code — is the
// typed refusal `crs-not-native`. A future author who points the proxy back at 4326 does not get a
// subtly wrong width, they get a loud refusal and a red test.
//
// NOT A SECOND SOLVER: the measurement is `measureStreetWidths` / `blockEdgesFacingParcel` /
// `governingStreetWidth`, unmodified and region-agnostic (ADR-0275). This module only fetches,
// frames, and picks. OTel span (P8 / C58 §1.10). Never throws — every miss is a TYPED refusal.

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
import { pointSegmentDistance } from '@pryzm/site-validators';
import { isInMurcia } from './murciaBbox.js';
import { featureCoversXY, MURCIA_PGOU_PATH } from './resolveMurciaZoning.js';

const tracer = trace.getTracer('pryzm.zoning');

/**
 * The authority string every success carries. SIG-MU2 condition 2: the source must be NAMED, and
 * named as what it is — a municipal geometry layer, never an official width measurement.
 */
export const MURCIA_STREET_WIDTH_AUTHORITY =
    'CONSTRUCTED by PRYZM from Ayuntamiento de Murcia, «Murcia:pgou_alineaciones» (municipal ' +
    'GeoServer, EPSG:25830) — a frontage-to-frontage distance measured from published alineación ' +
    'geometry IN THAT NATIVE CRS, at the precision the municipality serialises it. ⚠ NOT an ' +
    'official municipal street-width measurement: Murcia publishes no ancho oficial ' +
    '(corpus/RETRIEVAL-LOG.md §3).';

export interface MurciaStreetWidthDeps {
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy base (default `MURCIA_PGOU_PATH`). */
    readonly pathBase?: string;
    /**
     * The committed parcel ring in the SAME lon/lat degrees, when known. Used only to narrow which
     * block edges govern (`blockEdgesFacingParcel`). Omitted ⇒ the narrowest frontage of the whole
     * block governs, which is the conservative fallback `governingStreetWidth` already documents.
     */
    readonly parcelRingLonLat?: ReadonlyArray<readonly [number, number]>;
}

export type MurciaStreetWidthRefusal =
    /** Outside the coarse municipal bbox. */
    | 'out-of-murcia'
    /** No usable `fetch`. */
    | 'no-fetch'
    /** The service did not answer. ⚠ NOT "there is no geometry here" (L-422/457/467/469). */
    | 'endpoint-unreachable'
    /** It answered, but nothing parsed into a ring — the layer may have changed shape. */
    | 'unparsable-response'
    /**
     * §NATIVE-CRS-MEASUREMENT — the body did not declare a CRS we are allowed to MEASURE in
     * (missing `crs`, a geographic CRS, or a code absent from `NATIVE_METRIC_CRS`).
     *
     * ⚠ THIS IS THE GUARD, AND IT REFUSES ON PURPOSE. Measuring a legal street width on geometry
     * that has been reprojected to degrees and serialised at 4 decimals costs a median 3 m — the
     * size of the bands themselves. There is no safe fallback, so there is no fallback: a width we
     * cannot stand behind is not published.
     */
    | 'crs-not-native'
    /** DOCTRINE B — no published alineación covers this point. Never substitute a nearby one. */
    | 'no-alineacion-here'
    /** DOCTRINE B — the neighbourhood hit the feature cap, so the far side may be missing. */
    | 'neighbourhood-truncated'
    /**
     * Rays found no opposing frontage on any governing edge, or the samples disagreed by more than
     * the tolerance. ⚠ THIS IS CONDITION 4 WORKING, NOT A DEFECT — the alternative is a width the
     * geometry does not support choosing a storey band.
     */
    | 'no-opposing-frontage';

export type MurciaStreetWidthResolution =
    | {
          readonly ok: true;
          /** Median frontage-to-frontage distance, metres. CONSTRUCTED — see `provenance`. */
          readonly width_m: number;
          /** THE ERROR BAR (max − min across rays). Feeds the band-edge guard. Condition 4. */
          readonly spread_m: number;
          readonly sampleCount: number;
          readonly edgeIndex: number;
          /** Condition 2 — carried as DATA so a consumer cannot render the width without it. */
          readonly provenance: 'measured-geometry';
          readonly authority: string;
          /** How many neighbouring polygons the measurement had to shoot at. Audit aid. */
          readonly neighbourCount: number;
          /**
           * §MURCIA-EJE-COMERCIAL — is the GOVERNING frontage a graphed *Eje Comercial*
           * (Art. 5.5.3)? THREE-VALUED and it must stay that way: `true` earned, `false` confident,
           * **`null` = cannot tell**, which the band resolver turns into a refusal rather than
           * silently applying the ordinary 4-planta row.
           */
          readonly ejeComercial: boolean | null;
          /**
           * §NATIVE-CRS-MEASUREMENT — the CRS the metres above were actually measured in, carried
           * as DATA. A reviewer (or a downstream audit) can see that the number came from the
           * publisher's own metric frame and not from a reprojection, without reading this file.
           */
          readonly measurementCrs: string;
      }
    | { readonly ok: false; readonly reason: MurciaStreetWidthRefusal };

/** A GeoJSON linear ring — `[easting, northing]` in the body's declared native metric CRS. */
type CoordRing = readonly (readonly number[])[];

/**
 * Every OUTER ring of a GeoJSON Polygon / MultiPolygon, placed in the measurement frame. Holes are
 * not frontages.
 *
 * ⚠ THE INPUT IS NATIVE EASTING/NORTHING, NOT DEGREES, and `frame.fromNative` is a RIGID TRANSFORM
 * — a translation plus the scene convention's northing negation. Nothing is scaled, rotated or
 * rounded, so a distance measured downstream IS the publisher's distance to the last serialised
 * digit. This is the whole point of §NATIVE-CRS-MEASUREMENT; a `fromLonLat` here would undo it.
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

/** The proxy's `?extent=neighbourhood` body. */
interface NeighbourhoodBody {
    /**
     * §NATIVE-CRS-MEASUREMENT — the CRS the geometry below is serialised in, DECLARED by the proxy.
     * ⚠ Optional in the type and REQUIRED in practice: an absent `crs` is not "assume 4326", it is
     * `crs-not-native`. Inferring a CRS from the magnitude of a coordinate is how a measurement
     * pipeline quietly starts measuring degrees.
     */
    readonly crs?: unknown;
    readonly alineaciones?: unknown[] | null;
    readonly ejesComerciales?: unknown[] | null;
    readonly truncated?: boolean;
}

/**
 * Every LineString of a GeoJSON LineString / MultiLineString feature, in the measurement frame.
 * Native easting/northing in, rigid transform only — see `featureOuterRings`.
 */
function featureLines(feature: unknown, frame: MeasurementFrame): Pt[][] {
    const geom = (feature as { geometry?: { type?: unknown; coordinates?: unknown } } | null)?.geometry;
    if (!geom || typeof geom !== 'object') return [];
    const coords = geom.coordinates;
    if (!Array.isArray(coords) || coords.length === 0) return [];
    const project = (line: CoordRing): Pt[] =>
        line
            .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
            .map((p) => frame.fromNative(p[0]!, p[1]!));
    if (geom.type === 'LineString') {
        const l = project(coords as unknown as CoordRing);
        return l.length >= 2 ? [l] : [];
    }
    if (geom.type === 'MultiLineString') {
        const out: Pt[][] = [];
        for (const line of coords as unknown as readonly CoordRing[]) {
            const l = project(line);
            if (l.length >= 2) out.push(l);
        }
        return out;
    }
    return [];
}

/** Shortest distance from a point to a polyline, metres. */
function pointPolylineDistance(p: Pt, line: ReadonlyArray<Pt>): number {
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i + 1 < line.length; i++) {
        const d = pointSegmentDistance(p, line[i]!, line[i + 1]!);
        if (d < best) best = d;
    }
    return best;
}

/**
 * §MURCIA-EJE-COMERCIAL — is the GOVERNING frontage a graphed *Eje Comercial*?
 *
 * Art. 5.5.3 grants base `RM` *«5 plantas (16 m) en Ejes Comerciales con sección mayor de 12
 * metros»*. `Murcia:pgou_eje_comercial` publishes those axes as LineStrings, so the condition is
 * decidable — but only if we are honest about which way an error costs.
 *
 * ⚠⚠ THE ASYMMETRY IS THE WHOLE DESIGN, AND IT IS DELIBERATE.
 *   • A false **NO** costs one storey (4 plantas instead of 5) — an UNDER-grant, the safe direction.
 *   • A false **YES** publishes 16 m where the plan allows 13 m — an OVER-grant, and exactly the
 *     L-616 failure mode. So YES must be EARNED and NO may be cheap.
 *
 * THE TEST. The eje is the street's AXIS; the frontage is the building line. On a street of measured
 * width `w` the axis therefore runs roughly `w/2` away from, and roughly PARALLEL to, the frontage.
 * We sample along the governing edge and require the median distance to the nearest eje polyline to
 * sit in `[0.25·w, 0.85·w]` — a band centred on the geometric expectation, wide enough for a
 * non-central axis and narrow enough that an eje on the NEXT street over (≥ 1.5·w away) cannot
 * qualify. Anything else is UNKNOWN, never a guess.
 *
 * @returns `true` (earned) · `false` (no eje anywhere near — confident) · `null` (cannot tell, or
 *   the eje service did not answer; the caller must refuse rather than apply the ordinary band).
 */
function ejeComercialOnFrontage(
    edge: readonly [Pt, Pt],
    width_m: number,
    ejeLines: ReadonlyArray<ReadonlyArray<Pt>>,
    serviceAnswered: boolean,
): boolean | null {
    // A layer that did not answer is UNKNOWN — never a confident "no eje here".
    if (!serviceAnswered) return null;
    if (ejeLines.length === 0) return false;
    if (!Number.isFinite(width_m) || width_m <= 0) return null;

    const [a, b] = edge;
    const samples: Pt[] = [];
    for (let s = 1; s <= 9; s++) {
        const f = s / 10;
        samples.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f });
    }
    const perSample = samples.map((p) =>
        ejeLines.reduce((best, l) => Math.min(best, pointPolylineDistance(p, l)), Number.POSITIVE_INFINITY));
    const finite = perSample.filter((d) => Number.isFinite(d)).sort((x, y) => x - y);
    if (finite.length === 0) return false;
    const median = finite[finite.length >> 1]!;

    // Far from every eje in the neighbourhood ⇒ confidently NOT an Eje Comercial.
    if (median > 1.5 * width_m) return false;
    // Sitting where the axis of THIS street should be ⇒ earned YES.
    if (median >= 0.25 * width_m && median <= 0.85 * width_m) return true;
    // Near, but not where this street's axis belongs — an eje on an adjacent frontage, a corner, or
    // a non-central axis. We cannot tell, so we say so.
    return null;
}

/**
 * Measure the street width governing a Murcia point, from the municipality's published alineaciones.
 *
 * NEVER THROWS — every miss is a typed refusal, so the L5 dispatcher always has something honest to
 * render. OTel span `pryzm.zoning.resolveMurciaStreetWidth`.
 *
 * ⚠ THE RESULT IS AN INPUT, NOT AN ANSWER. Feed it to `resolveMurciaAnchoDeCalle` together with
 * `spread_m`; that function owns the band decision and the band-edge refusal. Reading `width_m`
 * and picking a band by hand would bypass SIG-MU2 condition 4.
 */
export async function resolveMurciaStreetWidth(
    point: { lat: number; lon: number } | null | undefined,
    deps: MurciaStreetWidthDeps = {},
): Promise<MurciaStreetWidthResolution> {
    const span = tracer.startSpan('pryzm.zoning.resolveMurciaStreetWidth');
    span.setAttribute('provider', 'murcia-pgou-alineaciones');
    try {
        if (
            !point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon) ||
            !isInMurcia(point.lat, point.lon)
        ) {
            span.setAttribute('resultFields', 'out-of-murcia');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'out-of-murcia' };
        }
        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('resultFields', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-fetch' };
        }

        const base = deps.pathBase ?? MURCIA_PGOU_PATH;
        const url =
            `${base}?lat=${encodeURIComponent(String(point.lat))}` +
            `&lon=${encodeURIComponent(String(point.lon))}&extent=neighbourhood`;

        let body: NeighbourhoodBody | null = null;
        try {
            const res = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' } });
            if (!res || !res.ok) {
                span.setAttribute('resultFields', 'upstream-miss');
                span.setStatus({ code: SpanStatusCode.OK });
                return { ok: false, reason: 'endpoint-unreachable' };
            }
            body = (await res.json()) as NeighbourhoodBody | null;
        } catch (err) {
            span.setAttribute('resultFields', 'fetch-error');
            span.setStatus({ code: SpanStatusCode.OK });
            console.warn('[murcia-width] fetch failed (non-fatal):', (err as Error)?.message ?? err);
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        // ⚠ PRECEDENCE: TRANSPORT FAILURE OUTRANKS EVERYTHING BELOW IT. A service that did not
        // answer cannot be blamed for its CRS, and reporting a configuration fault where there is
        // an outage would send an operator to the wrong place.
        const features = body?.alineaciones;
        if (features === null || features === undefined || !Array.isArray(features)) {
            span.setAttribute('resultFields', 'endpoint-unreachable');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        // ══════════════════════════════════════════════════════════════════════════════════════
        // §NATIVE-CRS-MEASUREMENT — THE GUARD. Establish the measurement frame BEFORE reading a
        // single coordinate, and refuse if we cannot have one.
        // ══════════════════════════════════════════════════════════════════════════════════════
        // ⚠ THERE IS DELIBERATELY NO FALLBACK. The obvious "be lenient — if `crs` is missing, assume
        // 4326 like we used to" is the exact defect this guard exists to close: it would silently
        // restore a measurement with a median 3 m error against 8 m and 12 m legal thresholds.
        // A width we cannot stand behind is not published. `crs-not-native` is a distinct refusal
        // from `endpoint-unreachable` and from `no-alineacion-here`, so an operator can tell a
        // mis-configured proxy from a dead one and from genuinely unplanned land.
        //
        // ⚠ AND IT SITS ABOVE THE EMPTY CHECK, WHICH IS THE OTHER HALF OF THE PRECEDENCE. An
        // unreadable CRS must never surface as "Murcia publishes no alineación here" — that is a
        // claim about the municipality's plan, made on the strength of our own mis-configuration.
        const frame = makeMeasurementFrame(body?.crs, point.lat, point.lon);
        if (!frame) {
            span.setAttribute('resultFields', 'crs-not-native');
            span.setAttribute('declaredCrs', String(body?.crs ?? '(absent)'));
            span.setStatus({ code: SpanStatusCode.OK });
            console.warn(
                '[murcia-width] REFUSING to measure: the proxy declared crs=' +
                `${String(body?.crs ?? '(absent)')}, which is not an allow-listed metric CRS. ` +
                'Measuring reprojected degrees costs ~3 m median against 8 m/12 m legal bands.',
            );
            return { ok: false, reason: 'crs-not-native' };
        }
        span.setAttribute('measurementCrs', frame.crs);
        span.setAttribute('measurementFidelity', frame.fidelity);
        // DOCTRINE B — a capped answer is a PARTIAL publication. The polygon across the street may
        // be exactly the one that was dropped, and a missing far side reads as a wide street.
        if (body?.truncated === true) {
            span.setAttribute('resultFields', 'neighbourhood-truncated');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'neighbourhood-truncated' };
        }
        if (features.length === 0) {
            span.setAttribute('resultFields', 'no-alineacion-here');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-alineacion-here' };
        }

        // ── Split the neighbourhood into OURS (covers the click) and THEIRS. ──────────────────
        // ⚠ `featureCoversXY` is THREE-VALUED and only an explicit `true` claims ours. A `null`
        // (untestable geometry) is treated as a NEIGHBOUR, never as our block: mis-assigning a
        // foreign polygon to "ours" would delete a real opposing frontage and widen the street.
        //
        // §NATIVE-CRS-MEASUREMENT — the COVER TEST runs in native metres too, against the click
        // PROJECTED into the layer's CRS. It is a measurement (an inside/outside decision on a
        // boundary), and on ~10 m quantised rings it was deciding which block you had clicked from
        // geometry that had lost its corners. `featureCoversXY` is the CRS-neutral spelling of the
        // same ray-cast — x is easting, y is northing, exactly as x was lon and y was lat.
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
            // DOCTRINE B — the municipality published no alineación over this point. Substituting
            // the nearest polygon would infer beyond the demonstrated spatial extent.
            span.setAttribute('resultFields', 'no-alineacion-here');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-alineacion-here' };
        }

        // Deterministic when a click sits in more than one published polygon (a shared boundary):
        // take the LARGEST outer ring by vertex count, then by absolute area. Never "the first one
        // GeoServer listed", which is a property of the server's ordering, not of the plan (C1).
        const ourRing = ours.reduce((a, b) =>
            b.length !== a.length ? (b.length > a.length ? b : a) : (ringArea(b) > ringArea(a) ? b : a));

        const result = measureStreetWidths(ourRing, theirs);
        // The committed parcel ring is PRYZM's own geometry, held at full double precision, so
        // projecting it here loses nothing — unlike wire geometry, which is already quantised by
        // the time we see it. `fromLonLat` is the only degree→metre step in this file, and it
        // touches no published coordinate.
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

        // §MURCIA-EJE-COMERCIAL — decide it against the edge that actually governs, not the parcel
        // centroid: Art. 5.5.3's condition is about the FRONTAGE, and a corner parcel can front an
        // eje on one side and an ordinary street on the other.
        const ejeRaw = body?.ejesComerciales;
        const ejeAnswered = Array.isArray(ejeRaw);
        const ejeLines: Pt[][] = ejeAnswered
            ? (ejeRaw as unknown[]).flatMap((f) => featureLines(f, frame))
            : [];
        const gA = ourRing[governing.edgeIndex % ourRing.length]!;
        const gB = ourRing[(governing.edgeIndex + 1) % ourRing.length]!;
        const ejeComercial = ejeComercialOnFrontage(
            [gA, gB], governing.width_m, ejeLines, ejeAnswered,
        );

        span.setAttribute('resultFields', 'width');
        span.setAttribute('width_m', governing.width_m);
        span.setAttribute('spread_m', governing.spread_m);
        span.setAttribute('ejeComercial', String(ejeComercial));
        span.setStatus({ code: SpanStatusCode.OK });
        return {
            ok: true,
            width_m: governing.width_m,
            spread_m: governing.spread_m,
            sampleCount: governing.sampleCount,
            edgeIndex: governing.edgeIndex,
            provenance: 'measured-geometry',
            authority: MURCIA_STREET_WIDTH_AUTHORITY,
            neighbourCount: theirs.length,
            ejeComercial,
            measurementCrs: frame.crs,
        };
    } finally {
        span.end();
    }
}

/** Shoelace magnitude. Local helper so the tie-break above cannot depend on import order. */
function ringArea(ring: ReadonlyArray<Pt>): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!, q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
}
