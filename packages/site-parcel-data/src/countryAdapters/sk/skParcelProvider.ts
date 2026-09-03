// LANE SK — SLOVAKIA (SK) · the parcel arm: ÚGKK/GKÚ ESKN cadastre, C-register parcels
// (`VRM/kn/MapServer/9` "Plocha parcely C", keyless).
//
// REPORT §J: `parcel: ParcelProvider — resolve(point) -> FetchOutcome<ParcelFeature>`. Schema
// mapping ONLY — no business logic, no envelope math, no geometry computation. The register serves
// `DESCRIPTIVE_AREA_OF_PARCEL` (Výmera SPI, m²) directly, so this adapter carries it verbatim and
// NEVER derives area from the ring (the Madrid/Murcia measure-after-reprojection trap the repo
// already paid for).
//
// MEASURED SCHEMA (layer `?f=json` + point query, 2026-09-03 — Bratislava Old Town, live; body at
// __tests__/fixtures/sk-bratislava-2026-09-03/recorded-live-2026-09-03.json):
//   `ID` (register-C parcel primary key / OID, 2090872505) · `PARCEL_NUMBER` (parcelné číslo,
//   STRING "15") · `CADASTRAL_UNIT_ID` (katastrálne územie numeric id, 2933) · `FOLIO_ID` (list
//   vlastníctva / LV title-deed id, 335384911) · `DESCRIPTIVE_AREA_OF_PARCEL` (register m², 832) ·
//   `NATURE_OF_LAND_USE_ID` (druh pozemku code, 9) · `VALID_TO_DATE` (epoch-ms, or null) ·
//   geometry = esri polygon rings, WGS84 when `outSR=4326` is asked.
//
// GEOMETRY-ONLY + identity: NO ownership (the LV owner data is the registered-rights channel, not
// this map layer — `FOLIO_ID` is the LV *number*, never the owners), NO envelope (Slovak zoning =
// municipal územné plány, PDFs today with a state IS due ~2028; there is no machine-readable rules
// channel — see the adapter header + skSources.ts, and the documents-only `precedence` in index.ts).

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchTransient, type FetchOutcome } from '@pryzm/schemas';
import type { ArcgisRestFeature } from '../../providers/containers/arcgisRest.js';
import {
    SK_RING_CRS,
    skEsriOuterRing,
    skNum,
    skParcelByObjectIdQuery,
    skParcelPointQuery,
    skStr,
    type SkArcgisDeps,
} from './skEsknClient.js';

const tracer = trace.getTracer('pryzm.siteintel.sk');

/** Provider/provenance id — matches the registry row + the `skSources.ts` row id (one spelling). */
export const SK_PARCEL_PROVIDER_ID = 'sk-ugkk-eskn-kn-parcela-c';
export const SK_PARCEL_PROVIDER_LABEL =
    'Parcela registra C (Slovakia · ÚGKK / GKÚ ESKN kataster)';

/** A resolved Slovak C-register cadastral parcel — identity + WGS84 geometry + served register facts. */
export interface SkCadastralParcel {
    /**
     * `PARCEL_NUMBER` — parcelné číslo (e.g. "15"), the citizen-facing parcel number WITHIN its
     * cadastral unit. Opaque string; never split (a "123/4" sub-parcel grammar is display, not an
     * identity this adapter parses).
     */
    readonly parcelNumber: string;
    /** `CADASTRAL_UNIT_ID` — katastrálne územie numeric id (2933). The NAME needs a codelist join
     *  not served on this layer, so it is carried as the numeric id only, never invented. */
    readonly cadastralUnitId: number | null;
    /** `ID` — the register-C parcel primary key / OID (2090872505), the by-id lookup key. */
    readonly registerCId: number | null;
    /** `FOLIO_ID` — list vlastníctva (LV / title-deed) id (335384911), or null. The LV *number*, never owners. */
    readonly folioId: number | null;
    /**
     * `DESCRIPTIVE_AREA_OF_PARCEL` — the register's own area in m² (Výmera SPI), carried VERBATIM,
     * NEVER derived from the ring. Distinct from `SHAPE.AREA` (Web-Mercator-distorted), which this
     * adapter does not read.
     */
    readonly areaM2: number | null;
    /** `NATURE_OF_LAND_USE_ID` — druh pozemku code, verbatim, or null (a codelist id, not a name). */
    readonly landUseId: number | null;
    /** `VALID_TO_DATE` — the register version's validity upper bound, epoch-ms as served, or null. */
    readonly validToEpochMs: number | null;
    /** Outer ring — `[lon, lat]` pairs, server-side reprojected to WGS84. */
    readonly ring: ReadonlyArray<readonly [number, number]>;
    /** CRS of `ring` — always {@link SK_RING_CRS} (`EPSG:4326`). */
    readonly crs: string;
    /** Provenance tag — always {@link SK_PARCEL_PROVIDER_ID}. */
    readonly source: string;
}

/** PURE: one C-parcel feature -> `SkCadastralParcel`, or null without a PARCEL_NUMBER / >=3-vertex ring. */
export function parseSkParcelFeature(
    feature: ArcgisRestFeature,
    crs: string = SK_RING_CRS,
): SkCadastralParcel | null {
    const a = feature.attributes;
    const parcelNumber = skStr(a, 'PARCEL_NUMBER');
    if (parcelNumber === null) return null;
    const ring = skEsriOuterRing(feature.geometry);
    if (ring.length < 3) return null;
    return {
        parcelNumber,
        cadastralUnitId: skNum(a, 'CADASTRAL_UNIT_ID'),
        registerCId: skNum(a, 'ID'),
        folioId: skNum(a, 'FOLIO_ID'),
        areaM2: skNum(a, 'DESCRIPTIVE_AREA_OF_PARCEL'),
        landUseId: skNum(a, 'NATURE_OF_LAND_USE_ID'),
        validToEpochMs: skNum(a, 'VALID_TO_DATE'),
        ring,
        crs,
        source: SK_PARCEL_PROVIDER_ID,
    };
}

function firstParcelOutcome(
    outcome: FetchOutcome<readonly ArcgisRestFeature[]>,
    label: string,
): FetchOutcome<SkCadastralParcel> {
    if (outcome.status !== 'found') return outcome;
    const parsed = parseSkParcelFeature(outcome.value[0]!);
    if (parsed === null) {
        return fetchTransient(`upstream-failed: unparsable Plocha parcely C feature (${label})`);
    }
    return { status: 'found', value: parsed };
}

/**
 * Resolve the parcel at a WGS84 point (the map-click path). The service reprojects SERVER-SIDE;
 * this module performs no projection and no area math. NEVER throws — an unreachable endpoint, the
 * WAF 403, and a no-parcel point each come back as their own outcome (the last as `absent`).
 */
export async function resolveSkParcelAtWgs84Point(
    lat: number,
    lon: number,
    deps: SkArcgisDeps = {},
): Promise<FetchOutcome<SkCadastralParcel>> {
    return tracer.startActiveSpan('pryzm.siteintel.sk.resolveParcelAtPoint', async (span) => {
        try {
            span.setAttribute('sk.lat', lat);
            span.setAttribute('sk.lon', lon);
            const outcome = await skParcelPointQuery(
                lat,
                lon,
                `kn:Plocha parcely C @ ${lat.toFixed(6)},${lon.toFixed(6)}`,
                deps,
            );
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
 * Resolve a parcel by its register-C id (`ID` / OID) via `objectIds` — the WAF-safe by-id form (the
 * ESKN WAF blocks `where=`; see skEsknClient.ts fact 5). NEVER throws; an unreachable endpoint, an
 * ArcGIS error body and a no-such-id each come back as their own outcome (the last as `absent`).
 */
export async function resolveSkParcelByRegisterCId(
    registerCId: number,
    deps: SkArcgisDeps = {},
): Promise<FetchOutcome<SkCadastralParcel>> {
    return tracer.startActiveSpan('pryzm.siteintel.sk.resolveParcelByRegisterCId', async (span) => {
        try {
            span.setAttribute('sk.registerCId', registerCId);
            const outcome = await skParcelByObjectIdQuery(
                registerCId,
                `kn:Plocha parcely C ID=${registerCId}`,
                deps,
            );
            const result = firstParcelOutcome(outcome, `ID=${registerCId}`);
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
