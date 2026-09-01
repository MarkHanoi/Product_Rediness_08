// E6-LT — LITHUANIA (LT) · parcel arm: Registru centras NTR parcels, republished as open data
// by Statistics Lithuania (`ntr_sklypai/FeatureServer/0`).
//
// REPORT §J: `parcel: ParcelProvider — resolve(point|bbox) → FetchOutcome<ParcelFeature>`.
// Schema mapping ONLY — no business logic. Geometry stays in the NATIVE CRS with the CRS
// carried on the object (E1a `NativeCrsGeometry` discipline; lane 4 LT-2: query and measure in
// LKS-94, never after reprojection).
//
// MEASURED SCHEMA (layer `?f=json` + GetFeature, 2026-09-01 — both 20-parcel-baseline LT
// parcels): `unikalus_nr` (unique NTR code) · `kadastro_nr` (cadastral number, the national id,
// e.g. `0101/0054:0328`) · `pask_tipas` + `pask_tipas_pavad` (purpose code + name) ·
// `osta_statusas` + `osta_statusas_pavad` (object status) · `sen_pavad`/`sav_pavad` (eldership /
// municipality, from the Address Register) · `skl_plotas` (**registered area in HECTARES** —
// not m2; the conversion is explicit below and is the ONE unit transform in this file) ·
// `data_rk` (boundary-correction date) · `pastat_sk` / `adr_sk` (building and address counts) ·
// `st_p*` (protected-area overlap SHARES, %) · `kvr_p*` (cultural-heritage overlap shares, %) ·
// `ntr_duom_data` / `stk_duom_data` / `kvr_duom_data` (per-source data dates, served as
// STRINGS).
//
// ⚠ MEASURED FILL CAVEAT (2026-09-01): on BOTH baseline parcels `pask_tipas_pavad`,
// `sav_pavad` and `sen_pavad` came back **null** while `kadastro_nr`, `unikalus_nr`,
// `skl_plotas`, `pastat_sk` and `ntr_duom_data` were filled. Those are honest nulls in the
// service, not a parse failure — they are carried as null, never back-filled from the
// cadastral number's own municipality prefix (that would be an invented value).
//
// GEOMETRY-ONLY + identity: NO ownership (owner data is a priced Registru centras product —
// lane 4 LT-3 records the gate; nothing here is an owner), NO envelope (that is the ASGR arm).

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchTransient, type FetchOutcome } from '@pryzm/schemas';
import type { ArcgisRestFeature } from '../../providers/containers/arcgisRest.js';
import {
    LT_NATIVE_CRS,
    LT_PARCEL_LAYER_ID,
    LT_PARCEL_SERVICE,
    ltArcgisQuery,
    ltEsriOuterRing,
    ltNum,
    ltStr,
    ltWgs84PointParams,
    ltWhereParams,
    type LtArcgisDeps,
} from './ltArcgisClient.js';

const tracer = trace.getTracer('pryzm.siteintel.lt');

/** Provider/provenance id for attribution. Matches the `sourceRegistry/lt.ts` row id. */
export const LT_PARCEL_PROVIDER_ID = 'lt-rc-ntr-parcels-featureserver';
export const LT_PARCEL_PROVIDER_LABEL =
    'Zemes sklypas (Lithuania · Registru centras NTR, via Statistics Lithuania)';

/**
 * The `outFields` this adapter asks for. Explicit, never `*`: an added upstream column must be
 * a deliberate adapter change, not a silent widening of what downstream code may read.
 */
export const LT_PARCEL_OUT_FIELDS = [
    'unikalus_nr',
    'kadastro_nr',
    'pask_tipas',
    'pask_tipas_pavad',
    'osta_statusas_pavad',
    'sen_pavad',
    'sav_pavad',
    'skl_plotas',
    'data_rk',
    'pastat_sk',
    'adr_sk',
    'st_p',
    'st_p_pavad',
    'kvr_p',
    'kvr_p_pavad',
    'ntr_duom_data',
].join(',');

/** One protected-area / heritage overlap share, exactly as the register serves it. */
export interface LtParcelOverlapShare {
    /** Register the share is against (`protected-areas` = st_p, `cultural-heritage` = kvr_p). */
    readonly register: 'protected-areas' | 'cultural-heritage';
    /** Overlapping share of the parcel AREA in percent, or null when the column is empty. */
    readonly percent: number | null;
    /** The register's own names/types list for the overlapping objects, verbatim, or null. */
    readonly names: string | null;
}

/** A resolved Lithuanian cadastral parcel — identity + native-CRS geometry, nothing invented. */
export interface LtCadastralParcel {
    /** Cadastral number (`kadastro_nr`, e.g. `0101/0054:0328`) — the national parcel id. */
    readonly kadastroNr: string;
    /** Unique NTR code (`unikalus_nr`, e.g. `440055970193`), or null. */
    readonly unikalusNr: string | null;
    /** Purpose name (`pask_tipas_pavad`) and code (`pask_tipas`), verbatim — often null (see header). */
    readonly purposeName: string | null;
    readonly purposeCode: number | null;
    /** Object status name (`osta_statusas_pavad`), verbatim, or null. */
    readonly statusName: string | null;
    /** Municipality (`sav_pavad`) / eldership (`sen_pavad`) from the Address Register, or null. */
    readonly municipality: string | null;
    readonly eldership: string | null;
    /**
     * Registered area in m2, converted from the served HECTARES (`skl_plotas`).
     * The conversion is exact (x 10 000) and is recorded on the object beside the raw value so
     * a consumer can never be unsure which unit it holds.
     */
    readonly areaM2: number | null;
    /** The raw served value of `skl_plotas`, in HECTARES — kept so the transform is auditable. */
    readonly areaHaRaw: number | null;
    /** Buildings / addresses registered on the parcel (`pastat_sk` / `adr_sk`), or null. */
    readonly buildingCount: number | null;
    readonly addressCount: number | null;
    /** Protected-area + cultural-heritage overlap shares, empties dropped. */
    readonly overlaps: readonly LtParcelOverlapShare[];
    /** NTR data date as served (`ntr_duom_data`, e.g. `2026-08-01`), or null. */
    readonly ntrDataDate: string | null;
    /** Outer ring in the CRS named by `crs` — [easting, northing] pairs exactly as served. */
    readonly ring: ReadonlyArray<readonly [number, number]>;
    /** CRS of `ring` (the E1a native-CRS-on-the-object discipline). */
    readonly crs: string;
    /** Provenance tag — always {@link LT_PARCEL_PROVIDER_ID}. */
    readonly source: string;
}

/** PURE: one `ntr_sklypai` feature → `LtCadastralParcel`, or null without a number/ring. */
export function parseLtParcelFeature(
    feature: ArcgisRestFeature,
    crs: string = LT_NATIVE_CRS,
): LtCadastralParcel | null {
    const a = feature.attributes;
    const kadastroNr = ltStr(a, 'kadastro_nr');
    if (kadastroNr === null) return null;
    const ring = ltEsriOuterRing(feature.geometry);
    if (ring.length < 3) return null;

    const overlaps: LtParcelOverlapShare[] = [];
    const stP = ltNum(a, 'st_p');
    const stNames = ltStr(a, 'st_p_pavad');
    if (stP !== null || stNames !== null) {
        overlaps.push({ register: 'protected-areas', percent: stP, names: stNames });
    }
    const kvrP = ltNum(a, 'kvr_p');
    const kvrNames = ltStr(a, 'kvr_p_pavad');
    if (kvrP !== null || kvrNames !== null) {
        overlaps.push({ register: 'cultural-heritage', percent: kvrP, names: kvrNames });
    }

    const areaHaRaw = ltNum(a, 'skl_plotas');
    return {
        kadastroNr,
        unikalusNr: ltStr(a, 'unikalus_nr'),
        purposeName: ltStr(a, 'pask_tipas_pavad'),
        purposeCode: ltNum(a, 'pask_tipas'),
        statusName: ltStr(a, 'osta_statusas_pavad'),
        municipality: ltStr(a, 'sav_pavad'),
        eldership: ltStr(a, 'sen_pavad'),
        // ha → m2. The ONLY unit transform in this file, and the raw stays beside it.
        areaM2: areaHaRaw === null ? null : areaHaRaw * 10_000,
        areaHaRaw,
        buildingCount: ltNum(a, 'pastat_sk'),
        addressCount: ltNum(a, 'adr_sk'),
        overlaps,
        ntrDataDate: ltStr(a, 'ntr_duom_data'),
        ring,
        crs,
        source: LT_PARCEL_PROVIDER_ID,
    };
}

function firstParcelOutcome(
    outcome: FetchOutcome<readonly ArcgisRestFeature[]>,
    label: string,
): FetchOutcome<LtCadastralParcel> {
    if (outcome.status !== 'found') return outcome;
    const parsed = parseLtParcelFeature(outcome.value[0]!);
    if (parsed === null) {
        return fetchTransient(`upstream-failed: unparsable ntr_sklypai feature (${label})`);
    }
    return { status: 'found', value: parsed };
}

/**
 * SQL string literal escaping for an ArcGIS `where` clause: a single quote is doubled, which
 * is the SQL-92 escape the service accepts. Lithuanian cadastral numbers contain `/` and `:`
 * and never a quote, so this is belt-and-braces — but a resolver that interpolates a caller's
 * string without escaping is a defect waiting for a different country's id scheme.
 */
function sqlLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Resolve a parcel by cadastral number (`kadastro_nr`) — exact equality, native-CRS geometry
 * back. NEVER throws; an unreachable endpoint, an ArcGIS error body and a no-such-number each
 * come back as their own outcome.
 */
export async function resolveLtParcelByKadastroNr(
    kadastroNr: string,
    deps: LtArcgisDeps = {},
): Promise<FetchOutcome<LtCadastralParcel>> {
    return tracer.startActiveSpan('pryzm.siteintel.lt.resolveParcelByKadastroNr', async (span) => {
        try {
            span.setAttribute('lt.kadastroNr', kadastroNr);
            const outcome = await ltArcgisQuery(
                LT_PARCEL_SERVICE,
                LT_PARCEL_LAYER_ID,
                ltWhereParams(
                    `kadastro_nr = ${sqlLiteral(kadastroNr)}`,
                    LT_PARCEL_OUT_FIELDS,
                    true,
                ),
                `ntr_sklypai kadastro_nr=${kadastroNr}`,
                deps,
            );
            const result = firstParcelOutcome(outcome, `kadastro_nr=${kadastroNr}`);
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
 * Resolve a parcel at a WGS84 point (the map-click path). The service reprojects SERVER-SIDE;
 * this module performs no projection.
 *
 * ⚠ `absent` here is a DATA CHARACTERISTIC, not an outage: Lithuanian street and state land is
 * frequently unparcelled, and lane 4 LT-3 measured a 0-feature point query on Gedimino pr. for
 * exactly that reason. The reason string carries {@link LT_UNPARCELLED_LAND_CAVEAT}.
 */
export async function resolveLtParcelAtWgs84Point(
    lat: number,
    lon: number,
    deps: LtArcgisDeps = {},
): Promise<FetchOutcome<LtCadastralParcel>> {
    return tracer.startActiveSpan('pryzm.siteintel.lt.resolveParcelAtPoint', async (span) => {
        try {
            span.setAttribute('lt.lat', lat);
            span.setAttribute('lt.lon', lon);
            const outcome = await ltArcgisQuery(
                LT_PARCEL_SERVICE,
                LT_PARCEL_LAYER_ID,
                ltWgs84PointParams(lat, lon, LT_PARCEL_OUT_FIELDS),
                `ntr_sklypai @ ${lat.toFixed(6)},${lon.toFixed(6)}`,
                deps,
            );
            if (outcome.status === 'absent') {
                span.setStatus({ code: SpanStatusCode.OK });
                return {
                    status: 'absent' as const,
                    reason: `${outcome.reason} — ${LT_UNPARCELLED_LAND_CAVEAT}`,
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
 * The unparcelled-land caveat, carried on every point-query `absent` so a consumer must
 * confront it rather than read "no parcel" as "no land" (lane 4 LT-3, measured).
 */
export const LT_UNPARCELLED_LAND_CAVEAT =
    'Lithuanian street and state land is often UNPARCELLED: a 0-feature point query is a data ' +
    'characteristic of the NTR, not an outage and not proof that the land is unregistered ' +
    '(lane 4 LT-3, measured on Gedimino pr. 2026-08-31)';
