// E1d — ESTONIA (EE) · buildings arm: `etak_tuletis:etak_ehr_hooned` — the STATE-MAINTAINED
// ETAK↔EHR conflation layer on the Maa-amet public geoserver.
//
// §J: `buildings: BuildingProvider — federated: national override > Overture backbone`.
// Estonia IS the national override, pre-joined: each footprint carries the ETAK id AND the
// EHR building-register id + register attributes (the conflation NL does via BAG id is done
// by the state here — lane 4 EE-3). No conflation work in this adapter.
//
// MEASURED SCHEMA (DescribeFeatureType + GetFeature 2026-09-01, Kopli tn 2):
//   geometry column `shape` (NOT `geom` — the cadastre workspace uses `geom`; using the wrong
//   one is an HTTP 400 "Illegal property name" refusal, measured) · etak_id · ehr_gid ·
//   taisaadress · korgus_m (ETAK measured height — can be null) · korgus (EHR register
//   height) · max_korruste_arv (floors) · ehitisalune_pind (footprint m²) · suletud_netopind
//   (closed net area) · seisund (state, e.g. "Olemas") · esmane_kasutus (first-use year) ·
//   energiaklass · ehr_url.
//
// HEIGHT-METHOD HONESTY (E1a `BuildingHeightMethod`, SURVEYED ≠ NORMATIVE ≠ DERIVED): the
// layer serves TWO heights — `korgus_m` (ETAK, ALS-measured → SURVEYED when present) and
// `korgus` (EHR register attribute → MODELLED/declared). They are DIFFERENT claims; this
// provider carries both, labelled, and invents neither. (Live probe: Kopli tn 2 has
// korgus_m=null, korgus=17.4 — matching the plan's korgus 17.4, i.e. built-to-permit.)

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { type FetchOutcome } from '@pryzm/schemas';
import {
    buildGeoserverCqlUrl,
    buildGeoserverIntersectsRingUrl,
    buildGeoserverWgs84BboxUrl,
    eeWfsGetFeatures,
    EE_NATIVE_CRS,
    type EeWfsDeps,
    type EeWfsFeature,
} from './eeWfsClient.js';

const tracer = trace.getTracer('pryzm.siteintel.ee');

export const EE_BUILDINGS_LAYER = 'etak_tuletis:etak_ehr_hooned';
export const EE_BUILDINGS_WORKSPACE = 'etak_tuletis';
/** Geometry column of the buildings layer — measured; the cadastre's `geom` 400s here. */
export const EE_BUILDINGS_GEOMETRY_COLUMN = 'shape';

/** One conflated ETAK↔EHR building. Both height claims carried, labelled, never merged. */
export interface EeBuilding {
    readonly etakId: number | null;
    /** EHR building-register id — the join key to the EHR open-data channel. */
    readonly ehrGid: string | null;
    readonly address: string | null;
    /** ETAK ALS-measured height (m) — SURVEYED when present; null = not measured. */
    readonly heightSurveyedM: number | null;
    /** EHR register height (m) — a register attribute, NOT a survey. */
    readonly heightRegisterM: number | null;
    readonly maxFloors: number | null;
    readonly footprintM2: number | null;
    readonly closedNetAreaM2: number | null;
    /** Register state (`seisund`), verbatim (e.g. "Olemas" = exists). */
    readonly state: string | null;
    /** First-use year (`esmane_kasutus`), when served. */
    readonly firstUseYear: number | null;
    readonly ehrUrl: string | null;
    readonly source: string;
}

export const EE_BUILDINGS_PROVIDER_ID = 'ee-etak-ehr-hooned';

function str(v: unknown): string | null {
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return null;
}
function num(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
}

/** PURE: one etak_ehr_hooned feature → `EeBuilding`. */
export function parseEeBuildingFeature(feature: EeWfsFeature): EeBuilding {
    const p = feature.properties;
    return {
        etakId: num(p['etak_id']),
        ehrGid: str(p['ehr_gid']),
        address: str(p['taisaadress']),
        heightSurveyedM: num(p['korgus_m']),
        heightRegisterM: num(p['korgus']),
        maxFloors: num(p['max_korruste_arv']),
        footprintM2: num(p['ehitisalune_pind']),
        closedNetAreaM2: num(p['suletud_netopind']),
        state: str(p['seisund']),
        firstUseYear: num(p['esmane_kasutus']),
        ehrUrl: str(p['ehr_url']),
        source: EE_BUILDINGS_PROVIDER_ID,
    };
}

/** Buildings intersecting a NATIVE (EPSG:3301) point — CQL POINT takes (northing easting). */
export async function resolveEeBuildingsAtNativePoint(
    northing: number,
    easting: number,
    deps: EeWfsDeps = {},
): Promise<FetchOutcome<readonly EeBuilding[]>> {
    return tracer.startActiveSpan('pryzm.siteintel.ee.resolveBuildings', async (span): Promise<FetchOutcome<readonly EeBuilding[]>> => {
        try {
            // MEASURED axis-order trap: GeoServer CQL uses native axis order (N,E) for 3301.
            const cql = `INTERSECTS(${EE_BUILDINGS_GEOMETRY_COLUMN},POINT(${northing} ${easting}))`;
            const url = buildGeoserverCqlUrl(EE_BUILDINGS_WORKSPACE, EE_BUILDINGS_LAYER, cql, 10);
            const outcome = await eeWfsGetFeatures(
                url,
                `${EE_BUILDINGS_LAYER} @ N${northing},E${easting} (${EE_NATIVE_CRS})`,
                deps,
            );
            span.setStatus(
                outcome.status === 'transient'
                    ? { code: SpanStatusCode.ERROR, message: outcome.reason }
                    : { code: SpanStatusCode.OK },
            );
            if (outcome.status !== 'found') return outcome;
            return { status: 'found', value: outcome.value.map(parseEeBuildingFeature) };
        } finally {
            span.end();
        }
    });
}

/**
 * Buildings INTERSECTING a parcel ring (native [easting, northing] pairs as the cadastre
 * serves them) — the exact server-side intersection that replaced the centroid representative
 * point (supplement §9 flag 1). MEASURED 2026-09-01 at Kopli tn 2: 3 buildings including
 * etak 9368512 / ehr 121395845 (the baseline's expected conflation row); the (E N)-ordered
 * control polygon returned 0 features silently — the CQL axis trap holds for POLYGON too.
 */
export async function resolveEeBuildingsIntersectingRing(
    ring: ReadonlyArray<readonly [number, number]>,
    deps: EeWfsDeps = {},
): Promise<FetchOutcome<readonly EeBuilding[]>> {
    return tracer.startActiveSpan('pryzm.siteintel.ee.resolveBuildingsForRing', async (span): Promise<FetchOutcome<readonly EeBuilding[]>> => {
        try {
            const url = buildGeoserverIntersectsRingUrl(
                EE_BUILDINGS_WORKSPACE,
                EE_BUILDINGS_LAYER,
                EE_BUILDINGS_GEOMETRY_COLUMN,
                ring,
                50,
            );
            const outcome = await eeWfsGetFeatures(
                url,
                `${EE_BUILDINGS_LAYER} intersects parcel ring (${ring.length} pts, ${EE_NATIVE_CRS})`,
                deps,
            );
            span.setStatus(
                outcome.status === 'transient'
                    ? { code: SpanStatusCode.ERROR, message: outcome.reason }
                    : { code: SpanStatusCode.OK },
            );
            if (outcome.status !== 'found') return outcome;
            return { status: 'found', value: outcome.value.map(parseEeBuildingFeature) };
        } finally {
            span.end();
        }
    });
}

/** Buildings in a small WGS84 window (registry click path) — server-side reprojection. */
export async function resolveEeBuildingsAtWgs84Point(
    lat: number,
    lon: number,
    deps: EeWfsDeps = {},
): Promise<FetchOutcome<readonly EeBuilding[]>> {
    return tracer.startActiveSpan('pryzm.siteintel.ee.resolveBuildingsWgs84', async (span): Promise<FetchOutcome<readonly EeBuilding[]>> => {
        try {
            const d = 0.00005;
            const url = buildGeoserverWgs84BboxUrl(
                EE_BUILDINGS_WORKSPACE,
                EE_BUILDINGS_LAYER,
                lat - d,
                lon - d,
                lat + d,
                lon + d,
                10,
            );
            const outcome = await eeWfsGetFeatures(
                url,
                `${EE_BUILDINGS_LAYER} @ ${lat.toFixed(6)},${lon.toFixed(6)}`,
                deps,
            );
            span.setStatus(
                outcome.status === 'transient'
                    ? { code: SpanStatusCode.ERROR, message: outcome.reason }
                    : { code: SpanStatusCode.OK },
            );
            if (outcome.status !== 'found') return outcome;
            return { status: 'found', value: outcome.value.map(parseEeBuildingFeature) };
        } finally {
            span.end();
        }
    });
}
