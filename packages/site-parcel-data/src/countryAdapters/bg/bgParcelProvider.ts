// LANE BG — BULGARIA (BG) · the parcel arm: GCCA/AGKK INSPIRE Cadastral Parcels
// (`inspire.cadastre.bg/arcgis/rest/services/Cadastral_Parcel/MapServer/0`, keyless).
//
// REPORT §J: `parcel: ParcelProvider — resolve(point) → FetchOutcome<ParcelFeature>`. Schema
// mapping ONLY — no business logic, no envelope math, no geometry computation. The register serves
// `areavalue` (m²), so this adapter carries it verbatim and NEVER derives area from the ring (the
// Madrid/Murcia measure-after-reprojection trap the repo already paid for).
//
// MEASURED SCHEMA (layer `?f=json` + point query, 2026-09-03 — Sofia capital, live):
//   `nationalcadastralref` (the Bulgarian cadastral identifier, the id — "68134.100.5", where
//   68134 = the EKATTE settlement code for Sofia) · `id_localid` (= the reference) · `id_namespace`
//   ("BG.CP") · `areavalue` (register m²) + `areavalue_uom` ("m2") · `label` · `admunit` (numeric
//   admin-unit code) · `validfrom` / `beginlifespanversion` (epoch-ms).
//
// GEOMETRY-ONLY + identity: NO ownership (the Bulgarian cadastre serves owner data only through the
// paid, identity-gated register extract — not this public INSPIRE layer), NO envelope (Bulgarian
// building terms live in OUP/PUP municipal plans as PDF/DWG; there is no national machine-readable
// rules channel — see the honest no-rule-pack `precedence` in index.ts).

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchTransient, type FetchOutcome } from '@pryzm/schemas';
import type { ArcgisRestFeature } from '../../providers/containers/arcgisRest.js';
import {
    BG_RING_CRS,
    bgEsriOuterRing,
    bgNum,
    bgParcelPointQuery,
    bgParcelWhereQuery,
    bgSqlLiteral,
    bgStr,
    type BgArcgisDeps,
} from './bgCadastreClient.js';

const tracer = trace.getTracer('pryzm.siteintel.bg');

/** Provider/provenance id — matches the registry row + the `bgSources.ts` row id (one spelling). */
export const BG_PARCEL_PROVIDER_ID = 'bg-gcca-inspire-cadastral-parcel';
export const BG_PARCEL_PROVIDER_LABEL =
    'Поземлен имот (Bulgaria · ГКГК/АГКК INSPIRE Cadastral Parcels)';

/** A resolved Bulgarian cadastral parcel — identity + WGS84 geometry + served register facts. */
export interface BgCadastralParcel {
    /**
     * `nationalcadastralref` — the Bulgarian cadastral identifier (идентификатор), e.g.
     * "68134.100.5". Opaque (never split into EKATTE/район/parcel — that grammar is not served).
     */
    readonly nationalCadastralReference: string;
    /** INSPIRE local id (`id_localid`, usually equal to the reference), or null. */
    readonly inspireLocalId: string | null;
    /** INSPIRE namespace (`id_namespace`, e.g. "BG.CP"), or null. */
    readonly inspireNamespace: string | null;
    /** Layer `label` as served, or null. */
    readonly label: string | null;
    /** Numeric administrative-unit code (`admunit`), verbatim, or null. */
    readonly administrativeUnit: number | null;
    /**
     * The register's own area in m² (`areavalue`), carried verbatim — NEVER derived from the ring.
     */
    readonly areaM2: number | null;
    /** The served area unit (`areavalue_uom`, e.g. "m2"), or null. */
    readonly areaUom: string | null;
    /** Life-cycle start as served (`validfrom` / `beginlifespanversion`), epoch-ms number, or null. */
    readonly validFromEpochMs: number | null;
    /** Outer ring — `[lon, lat]` pairs, server-side reprojected to WGS84. */
    readonly ring: ReadonlyArray<readonly [number, number]>;
    /** CRS of `ring` — always {@link BG_RING_CRS} (`EPSG:4326`). */
    readonly crs: string;
    /** Provenance tag — always {@link BG_PARCEL_PROVIDER_ID}. */
    readonly source: string;
}

/** PURE: one CP.CadastralParcel feature → `BgCadastralParcel`, or null without a reference/ring. */
export function parseBgParcelFeature(
    feature: ArcgisRestFeature,
    crs: string = BG_RING_CRS,
): BgCadastralParcel | null {
    const a = feature.attributes;
    const ref = bgStr(a, 'nationalcadastralref') ?? bgStr(a, 'id_localid');
    if (ref === null) return null;
    const ring = bgEsriOuterRing(feature.geometry);
    if (ring.length < 3) return null;
    return {
        nationalCadastralReference: ref,
        inspireLocalId: bgStr(a, 'id_localid'),
        inspireNamespace: bgStr(a, 'id_namespace'),
        label: bgStr(a, 'label'),
        administrativeUnit: bgNum(a, 'admunit'),
        areaM2: bgNum(a, 'areavalue'),
        areaUom: bgStr(a, 'areavalue_uom'),
        validFromEpochMs: bgNum(a, 'validfrom') ?? bgNum(a, 'beginlifespanversion'),
        ring,
        crs,
        source: BG_PARCEL_PROVIDER_ID,
    };
}

function firstParcelOutcome(
    outcome: FetchOutcome<readonly ArcgisRestFeature[]>,
    label: string,
): FetchOutcome<BgCadastralParcel> {
    if (outcome.status !== 'found') return outcome;
    const parsed = parseBgParcelFeature(outcome.value[0]!);
    if (parsed === null) {
        return fetchTransient(`upstream-failed: unparsable CP.CadastralParcel feature (${label})`);
    }
    return { status: 'found', value: parsed };
}

/**
 * Resolve the parcel at a WGS84 point (the map-click path). The service reprojects SERVER-SIDE;
 * this module performs no projection and no area math.
 *
 * ⚠ `absent` here is a DATA CHARACTERISTIC, not an outage, and it carries
 * {@link BG_INCOMPLETE_CADASTRE_CAVEAT}: the digital cadastral map (КККР) is substantially complete
 * for URBAN areas but is still being extended over parts of the country, so a 0-feature answer is
 * "no parcel in the digital cadastre here", never "no land here".
 */
export async function resolveBgParcelAtWgs84Point(
    lat: number,
    lon: number,
    deps: BgArcgisDeps = {},
): Promise<FetchOutcome<BgCadastralParcel>> {
    return tracer.startActiveSpan('pryzm.siteintel.bg.resolveParcelAtPoint', async (span) => {
        try {
            span.setAttribute('bg.lat', lat);
            span.setAttribute('bg.lon', lon);
            const outcome = await bgParcelPointQuery(
                lat,
                lon,
                `CP.CadastralParcel @ ${lat.toFixed(6)},${lon.toFixed(6)}`,
                deps,
            );
            if (outcome.status === 'absent') {
                span.setStatus({ code: SpanStatusCode.OK });
                return {
                    status: 'absent' as const,
                    reason: `${outcome.reason} — ${BG_INCOMPLETE_CADASTRE_CAVEAT}`,
                };
            }
            const result = firstParcelOutcome(outcome, `@${lat},${lon}`);
            span.setStatus(
                result.status === 'transient'
                    ? { code: SpanStatusCode.ERROR, message: result.reason }
                    : { code: SpanStatusCode.OK },
            );
            return result;
        } finally {
            span.end();
        }
    });
}

/**
 * Resolve a parcel by its `nationalcadastralref` (exact equality). NEVER throws; an unreachable
 * endpoint, an ArcGIS error body and a no-such-reference each come back as their own outcome (the
 * last as `absent`).
 */
export async function resolveBgParcelByReference(
    reference: string,
    deps: BgArcgisDeps = {},
): Promise<FetchOutcome<BgCadastralParcel>> {
    return tracer.startActiveSpan('pryzm.siteintel.bg.resolveParcelByReference', async (span) => {
        try {
            span.setAttribute('bg.ref', reference);
            const outcome = await bgParcelWhereQuery(
                `nationalcadastralref = ${bgSqlLiteral(reference)}`,
                `CP.CadastralParcel ref=${reference}`,
                deps,
            );
            const result = firstParcelOutcome(outcome, `ref=${reference}`);
            span.setStatus(
                result.status === 'transient'
                    ? { code: SpanStatusCode.ERROR, message: result.reason }
                    : { code: SpanStatusCode.OK },
            );
            return result;
        } finally {
            span.end();
        }
    });
}

/**
 * The incomplete-cadastre caveat, carried on every point-query `absent` so a consumer must confront
 * it rather than read "no parcel" as "no land". The Bulgarian digital cadastral map (КККР) urban
 * coverage is substantially complete, but the fabric is still being extended over parts of the
 * territory (sweep 2026-08-31: "Urban coverage of the KKR is substantially complete"), so a
 * 0-feature point query is a coverage characteristic, not an outage and not proof the land is
 * unregistered.
 */
export const BG_INCOMPLETE_CADASTRE_CAVEAT =
    'the Bulgarian digital cadastral map (КККР) is substantially complete for urban areas but is ' +
    'still being extended elsewhere: a 0-feature point query is a coverage characteristic (this ' +
    'point not yet in the digital cadastre), NOT an outage and NOT proof the land is unregistered ' +
    '(sweep 2026-08-31, measured)';
