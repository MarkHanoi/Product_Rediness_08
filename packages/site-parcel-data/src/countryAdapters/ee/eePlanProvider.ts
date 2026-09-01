// E1d — ESTONIA (EE) · plan arm: PLANK/PLANIS WFS (`dp_hoonestus` · `dp_krunt` ·
// `dp_kehtiv` · `detailplaneering`).
//
// §J: `planGeometry: PlanProvider — zones, plans, prescriptions, restrictions (typed
// outcomes)`. Schema mapping ONLY. The per-plot ehitusõigus VALUES ride the raw property
// bags out of here; turning them into E1a `SiteIntelRule` objects is `eeRuleMapper.ts`
// (pure), so the impure fetch and the pure mapping stay separable (C58 §1.9).
//
// MEASURED SCHEMA (GetFeature 2026-09-01 — Kopli tn 2 Tallinn + Väike kaar 33 Tartu):
//   dp_hoonestus (building areas): sysid (plan join key) · objectid · krunt_id ·
//     krundi_nimi · arv (max buildings) · pind/pindpealne/pindalune (under-building area,
//     total/above/below ground) · korgus (max height m) · korgusabs (absolute height,
//     EH2000) · sygavus (depth) · tihedus (density/FAR) · protsent (coverage %) ·
//     sbp/sbppealne/sbpalune (closed gross floor area = GFA) · maxsoosak/minsoosak (roof
//     pitch) · tingimus (free-text conditions). ⚠ ALL VALUES ARE STRINGS; empty is "";
//     fill quality varies per plan (probed: sibling feature with korgus "0" / tihedus "").
//   dp_krunt (plots): sysid · objectid · nimetus · otstarve (use, "; "-joined) · tahis ·
//     maxsoosak/minsoosak · pind · tingimus.
//   detailplaneering (plan register): sysid · planid · kovid (municipal plan id, e.g.
//     DP041780) · plannim · planseis_nimi (Kehtiv / Osaliselt kehtiv / …) · planeesm ·
//     planviide (municipal doc URL) · algatkp/vastuvkp/kehtestkp (initiated/accepted/
//     ADOPTED dates) · url (PLANIS UI) · failid. Queried by sysid via OGC Filter XML
//     (MapServer — no CQL; measured working shape).
//   dp_kehtiv (valid detail plans, polygon = plan AREA): sysid · kovid · plannim ·
//     planseis_nimi · kehtestkp · planviide · url.
//
// COVERAGE HONESTY (lane 4 EE-1 regime note): `absent` from dp layers means "no valid
// detail plan IN PLANK at this point" — older paper-era plans may exist only in municipal
// registers, so absence here is NOT proof of vacancy. That caveat is carried VERBATIM in
// `EE_PLANK_ABSENCE_CAVEAT` so every consumer must confront it.

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchTransient, type FetchOutcome } from '@pryzm/schemas';
import {
    buildPlankAttributeFilterUrl,
    buildPlankBboxUrl,
    buildPlankIntersectsRingUrl,
    eeWfsGetFeatures,
    EE_NATIVE_URN,
    EE_WGS84_URN,
    type EeWfsDeps,
    type EeWfsFeature,
} from './eeWfsClient.js';

const tracer = trace.getTracer('pryzm.siteintel.ee');

/** PLANK layer names — the measured, live-probed set this adapter consumes. */
export const EE_PLANK_LAYER_HOONESTUS = 'dp_hoonestus';
export const EE_PLANK_LAYER_KRUNT = 'dp_krunt';
export const EE_PLANK_LAYER_DP_KEHTIV = 'dp_kehtiv';
export const EE_PLANK_LAYER_PLAN_REGISTER = 'detailplaneering';
export const EE_PLANK_LAYER_YP_MAAKASUTUS = 'yp_maakasutus';

/**
 * The "not-in-PLANK ≠ no-plan" disambiguation caveat, verbatim from lane 4 EE-1. Attached to
 * every dp-layer `absent` interpretation — distinguishing the two requires the municipality,
 * which is NOT this adapter's job to fake.
 */
export const EE_PLANK_ABSENCE_CAVEAT =
    'absent = no valid detail plan IN PLANK at this point; paper-era plans may exist only in ' +
    'municipal registers — confirm with the municipality before claiming vacancy (lane 4 EE-1)';

/** A dp_hoonestus feature: the raw served property bag + native-CRS ring, nothing coerced. */
export interface EeHoonestusFeature {
    /** Plan-register join key (`sysid`) — resolve the plan via `resolveEePlanRegisterRow`. */
    readonly sysid: number | null;
    readonly objectid: string | null;
    readonly krundiNimi: string | null;
    /**
     * The ehitusõigus attributes EXACTLY as served (strings; "" = unfilled). Parsing them into
     * typed rule values — including the "0"/""-means-UNKNOWN rule — is `eeRuleMapper.ts`.
     */
    readonly raw: Readonly<Record<string, string>>;
    readonly ring: ReadonlyArray<readonly [number, number]>;
    readonly crs: string;
}

/** A dp_krunt (plot) feature: the raw served property bag + native-CRS ring, nothing coerced. */
export interface EeKruntFeature {
    readonly sysid: number | null;
    readonly objectid: string | null;
    readonly nimetus: string | null;
    /** Use categories (`otstarve`), "; "-joined as served. */
    readonly otstarve: string | null;
    readonly raw: Readonly<Record<string, string>>;
    /** Outer ring exactly as served ([easting, northing] pairs) — the plot's DRAWN geometry. */
    readonly ring: ReadonlyArray<readonly [number, number]>;
    readonly crs: string;
}

/** A detailplaneering register row — the plan identity + adoption date + document URLs. */
export interface EePlanRegisterRow {
    readonly sysid: number;
    /** Municipal plan id (`kovid`, e.g. `DP041780`) — the plan_id the provenance JSON carries. */
    readonly kovid: string | null;
    readonly name: string | null;
    /** Plan status (`planseis_nimi`: Kehtiv / Osaliselt kehtiv / …), verbatim. */
    readonly status: string | null;
    /** Adoption date (`kehtestkp`, ISO date) — the Rule's `valid_from`. */
    readonly adopted: string | null;
    /** Municipal plan-document URL (`planviide`) — the provenance `document`. */
    readonly documentUrl: string | null;
    /** PLANIS UI URL (`url`). */
    readonly planisUrl: string | null;
}

function strProp(p: Record<string, unknown>, k: string): string | null {
    const v = p[k];
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}
function numProp(p: Record<string, unknown>, k: string): number | null {
    const v = p[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
}
function rawStrings(p: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const k of Object.keys(p)) {
        const v = p[k];
        if (typeof v === 'string') out[k] = v;
        else if (typeof v === 'number' && Number.isFinite(v)) out[k] = String(v);
    }
    return out;
}
function parseRing(feature: EeWfsFeature): Array<readonly [number, number]> {
    const geom = feature.geometry;
    const ring: Array<readonly [number, number]> = [];
    if (geom && (geom.type === 'Polygon' || geom.type === 'MultiPolygon')) {
        let coords: unknown = geom.coordinates;
        if (geom.type === 'MultiPolygon' && Array.isArray(coords)) coords = coords[0];
        const outer = Array.isArray(coords) ? coords[0] : null;
        if (Array.isArray(outer)) {
            for (const pair of outer) {
                if (Array.isArray(pair) && pair.length >= 2) {
                    const x = Number(pair[0]);
                    const y = Number(pair[1]);
                    if (Number.isFinite(x) && Number.isFinite(y)) ring.push([x, y] as const);
                }
            }
        }
    }
    return ring;
}

/** PURE: one dp_hoonestus GeoJSON feature → `EeHoonestusFeature`. */
export function parseEeHoonestusFeature(
    feature: EeWfsFeature,
    crs: string,
): EeHoonestusFeature {
    const p = feature.properties;
    return {
        sysid: numProp(p, 'sysid'),
        objectid: strProp(p, 'objectid'),
        krundiNimi: strProp(p, 'krundi_nimi'),
        raw: rawStrings(p),
        ring: parseRing(feature),
        crs,
    };
}

/** PURE: one dp_krunt GeoJSON feature → `EeKruntFeature` (Polygon geometry measured live). */
export function parseEeKruntFeature(feature: EeWfsFeature, crs: string): EeKruntFeature {
    const p = feature.properties;
    return {
        sysid: numProp(p, 'sysid'),
        objectid: strProp(p, 'objectid'),
        nimetus: strProp(p, 'nimetus'),
        otstarve: strProp(p, 'otstarve'),
        raw: rawStrings(p),
        ring: parseRing(feature),
        crs,
    };
}

/** PURE: one detailplaneering GeoJSON feature → `EePlanRegisterRow`, or null without a sysid. */
export function parseEePlanRegisterRow(feature: EeWfsFeature): EePlanRegisterRow | null {
    const p = feature.properties;
    const sysid = numProp(p, 'sysid');
    if (sysid === null) return null;
    return {
        sysid,
        kovid: strProp(p, 'kovid'),
        name: strProp(p, 'plannim'),
        status: strProp(p, 'planseis_nimi'),
        adopted: strProp(p, 'kehtestkp'),
        documentUrl: strProp(p, 'planviide'),
        planisUrl: strProp(p, 'url'),
    };
}

/** Query window: bbox around a point. Native = (N,E) urn order; WGS84 = (lat,lon) urn order. */
export type EePlanPoint =
    | { readonly kind: 'native'; readonly northing: number; readonly easting: number }
    | { readonly kind: 'wgs84'; readonly lat: number; readonly lon: number };

function pointBboxUrl(layer: string, point: EePlanPoint): string {
    if (point.kind === 'native') {
        const d = 1; // ±1 m in L-EST97
        return buildPlankBboxUrl(
            layer,
            [point.northing - d, point.easting - d, point.northing + d, point.easting + d],
            EE_NATIVE_URN,
        );
    }
    const d = 0.00002; // ~±2 m
    return buildPlankBboxUrl(
        layer,
        [point.lat - d, point.lon - d, point.lat + d, point.lon + d],
        EE_WGS84_URN,
    );
}

/**
 * dp_hoonestus (building areas with ehitusõigus attributes) at a point. `absent` carries the
 * PLANK coverage caveat — see `EE_PLANK_ABSENCE_CAVEAT`.
 */
export async function resolveEeHoonestusAtPoint(
    point: EePlanPoint,
    deps: EeWfsDeps = {},
): Promise<FetchOutcome<readonly EeHoonestusFeature[]>> {
    return tracer.startActiveSpan('pryzm.siteintel.ee.resolveHoonestus', async (span): Promise<FetchOutcome<readonly EeHoonestusFeature[]>> => {
        try {
            const url = pointBboxUrl(EE_PLANK_LAYER_HOONESTUS, point);
            const outcome = await eeWfsGetFeatures(
                url,
                `${EE_PLANK_LAYER_HOONESTUS} @ ${JSON.stringify(point)}`,
                deps,
            );
            if (outcome.status !== 'found') {
                span.setStatus(
                    outcome.status === 'transient'
                        ? { code: SpanStatusCode.ERROR, message: outcome.reason }
                        : { code: SpanStatusCode.OK },
                );
                return outcome.status === 'absent'
                    ? { status: 'absent', reason: `${outcome.reason} — ${EE_PLANK_ABSENCE_CAVEAT}` }
                    : outcome;
            }
            // The bbox CRS scopes the FILTER only — geometry always returns in the layer's
            // native EPSG:3301 (the 4326-bbox probe returned native-metre coordinates).
            const crs = 'EPSG:3301';
            span.setStatus({ code: SpanStatusCode.OK });
            return {
                status: 'found',
                value: outcome.value.map((f) => parseEeHoonestusFeature(f, crs)),
            };
        } finally {
            span.end();
        }
    });
}

/** dp_krunt (plots) at a point — typed outcome, same caveat handling. */
export async function resolveEeKruntAtPoint(
    point: EePlanPoint,
    deps: EeWfsDeps = {},
): Promise<FetchOutcome<readonly EeKruntFeature[]>> {
    return tracer.startActiveSpan('pryzm.siteintel.ee.resolveKrunt', async (span): Promise<FetchOutcome<readonly EeKruntFeature[]>> => {
        try {
            const url = pointBboxUrl(EE_PLANK_LAYER_KRUNT, point);
            const outcome = await eeWfsGetFeatures(
                url,
                `${EE_PLANK_LAYER_KRUNT} @ ${JSON.stringify(point)}`,
                deps,
            );
            span.setStatus(
                outcome.status === 'transient'
                    ? { code: SpanStatusCode.ERROR, message: outcome.reason }
                    : { code: SpanStatusCode.OK },
            );
            if (outcome.status !== 'found') {
                return outcome.status === 'absent'
                    ? { status: 'absent', reason: `${outcome.reason} — ${EE_PLANK_ABSENCE_CAVEAT}` }
                    : outcome;
            }
            return {
                status: 'found',
                value: outcome.value.map((f) => parseEeKruntFeature(f, 'EPSG:3301')),
            };
        } finally {
            span.end();
        }
    });
}

/**
 * dp_hoonestus features INTERSECTING a parcel ring — the server-side exact-intersection form
 * that replaced the centroid representative point (supplement §9 flag 1: a vertex-mean
 * centroid is biased and can fall OUTSIDE a concave parcel, silently querying the neighbour's
 * plan; measured 2026-09-01: this filter returns exactly Kopli tn 2's 2 hoonestusalas where
 * the ring-bbox form returned 6 features from 3 plans). `ring` is [easting, northing] pairs
 * exactly as the cadastre serves — no client-side geometry math anywhere in this adapter.
 */
export async function resolveEeHoonestusForRing(
    ring: ReadonlyArray<readonly [number, number]>,
    deps: EeWfsDeps = {},
): Promise<FetchOutcome<readonly EeHoonestusFeature[]>> {
    return tracer.startActiveSpan('pryzm.siteintel.ee.resolveHoonestusForRing', async (span): Promise<FetchOutcome<readonly EeHoonestusFeature[]>> => {
        try {
            const url = buildPlankIntersectsRingUrl(EE_PLANK_LAYER_HOONESTUS, ring);
            const outcome = await eeWfsGetFeatures(
                url,
                `${EE_PLANK_LAYER_HOONESTUS} intersects parcel ring (${ring.length} pts)`,
                deps,
            );
            if (outcome.status !== 'found') {
                span.setStatus(
                    outcome.status === 'transient'
                        ? { code: SpanStatusCode.ERROR, message: outcome.reason }
                        : { code: SpanStatusCode.OK },
                );
                return outcome.status === 'absent'
                    ? { status: 'absent', reason: `${outcome.reason} — ${EE_PLANK_ABSENCE_CAVEAT}` }
                    : outcome;
            }
            // Filter CRS scopes the FILTER only — geometry returns in native EPSG:3301 (measured).
            const crs = 'EPSG:3301';
            span.setStatus({ code: SpanStatusCode.OK });
            return {
                status: 'found',
                value: outcome.value.map((f) => parseEeHoonestusFeature(f, crs)),
            };
        } finally {
            span.end();
        }
    });
}

/** dp_krunt (plots) intersecting a parcel ring — same form and rationale as the hoonestus arm. */
export async function resolveEeKruntForRing(
    ring: ReadonlyArray<readonly [number, number]>,
    deps: EeWfsDeps = {},
): Promise<FetchOutcome<readonly EeKruntFeature[]>> {
    return tracer.startActiveSpan('pryzm.siteintel.ee.resolveKruntForRing', async (span): Promise<FetchOutcome<readonly EeKruntFeature[]>> => {
        try {
            const url = buildPlankIntersectsRingUrl(EE_PLANK_LAYER_KRUNT, ring);
            const outcome = await eeWfsGetFeatures(
                url,
                `${EE_PLANK_LAYER_KRUNT} intersects parcel ring (${ring.length} pts)`,
                deps,
            );
            span.setStatus(
                outcome.status === 'transient'
                    ? { code: SpanStatusCode.ERROR, message: outcome.reason }
                    : { code: SpanStatusCode.OK },
            );
            if (outcome.status !== 'found') {
                return outcome.status === 'absent'
                    ? { status: 'absent', reason: `${outcome.reason} — ${EE_PLANK_ABSENCE_CAVEAT}` }
                    : outcome;
            }
            return {
                status: 'found',
                value: outcome.value.map((f) => parseEeKruntFeature(f, 'EPSG:3301')),
            };
        } finally {
            span.end();
        }
    });
}

/**
 * The plan-register row for a dp feature's `sysid` — the join MEASURED live (bbox on
 * `dp_kehtiv` at Kopli tn 2 returned a DIFFERENT, newer plan than the hoonestus features'
 * own sysid 30100071; only the attribute join is correct).
 */
export async function resolveEePlanRegisterRow(
    sysid: number,
    deps: EeWfsDeps = {},
): Promise<FetchOutcome<EePlanRegisterRow>> {
    return tracer.startActiveSpan('pryzm.siteintel.ee.resolvePlanRow', async (span): Promise<FetchOutcome<EePlanRegisterRow>> => {
        try {
            span.setAttribute('ee.sysid', sysid);
            const url = buildPlankAttributeFilterUrl(EE_PLANK_LAYER_PLAN_REGISTER, 'sysid', sysid);
            const outcome = await eeWfsGetFeatures(
                url,
                `${EE_PLANK_LAYER_PLAN_REGISTER} sysid=${sysid}`,
                deps,
            );
            if (outcome.status !== 'found') {
                span.setStatus(
                    outcome.status === 'transient'
                        ? { code: SpanStatusCode.ERROR, message: outcome.reason }
                        : { code: SpanStatusCode.OK },
                );
                return outcome;
            }
            const row = parseEePlanRegisterRow(outcome.value[0]!);
            if (row === null) {
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'unparsable' });
                return fetchTransient(
                    `upstream-failed: unparsable detailplaneering row (sysid=${sysid})`,
                );
            }
            span.setStatus({ code: SpanStatusCode.OK });
            return { status: 'found', value: row };
        } finally {
            span.end();
        }
    });
}
