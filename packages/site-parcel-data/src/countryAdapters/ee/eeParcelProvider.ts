// E1d — ESTONIA (EE) · parcel arm: Maa-amet cadastre `kataster:ky_kehtiv`.
//
// §J: `parcel: ParcelProvider — resolve(point|bbox) → FetchOutcome<ParcelFeature>`.
// Schema mapping ONLY — no business logic. Geometry stays in the NATIVE CRS with the CRS
// carried on the object (E1a `NativeCrsGeometry` discipline; lane 4 EE-2: "query and measure
// in L-EST97, never after reprojection").
//
// MEASURED SCHEMA (GetFeature 2026-09-01, parcels 78401:101:7194 + 79504:004:0020):
//   tunnus (cadastral id) · l_aadress (address) · mk_nimi/ov_nimi/ay_nimi (county/municipality/
//   district) · siht1..3 + so_prts1..3 (use categories + %) · pindala (m²) · registr/muudet
//   (dates) · maks_hind (taxable value) · ads_oid/adob_id (address ids) · geometry_name "geom",
//   GeoJSON output [E,N] in EPSG:3301 by default (srsName honoured for 4326).
//
// GEOMETRY-ONLY + identity: NO ownership (kinnistusraamat/RIK is gated — lane 4 EE-2 records
// the gate; `omvorm`/`kinnistu` here are form-of-ownership categories, not owner identity),
// NO envelope (that is the PLANK arm).

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchTransient, type FetchOutcome } from '@pryzm/schemas';
import {
    buildGeoserverCqlUrl,
    buildGeoserverWgs84BboxUrl,
    eeWfsGetFeatures,
    EE_NATIVE_CRS,
    type EeWfsDeps,
    type EeWfsFeature,
} from './eeWfsClient.js';

const tracer = trace.getTracer('pryzm.siteintel.ee');

/** The cadastre layer — valid cadastral units. PROBED LIVE 2026-09-01. */
export const EE_CADASTRE_LAYER = 'kataster:ky_kehtiv';
export const EE_CADASTRE_WORKSPACE = 'kataster';

/** One land-use share as the cadastre serves it (`siht1` "ELAMUMAA" + `so_prts1` 80). */
export interface EeLandUseShare {
    readonly use: string;
    readonly percent: number | null;
}

/** A resolved Estonian cadastral parcel — identity + native-CRS geometry, nothing invented. */
export interface EeCadastralParcel {
    /** Cadastral identifier (`tunnus`, e.g. `78401:101:7194`). */
    readonly tunnus: string;
    /** Address (`l_aadress`), or null. */
    readonly address: string | null;
    /** Municipality (`ov_nimi`) / county (`mk_nimi`) / district (`ay_nimi`). */
    readonly municipality: string | null;
    readonly county: string | null;
    readonly district: string | null;
    /** Intended-use shares (`siht1..3` + `so_prts1..3`), in served order, empties dropped. */
    readonly landUse: readonly EeLandUseShare[];
    /** Registered area in m² (`pindala`) — the cadastre's own attribute, never derived. */
    readonly areaM2: number | null;
    /** Registration / last-modified dates as served (`registr` / `muudet`, e.g. `2023-06-12Z`). */
    readonly registered: string | null;
    readonly modified: string | null;
    /** Outer ring in the CRS named by `crs` — [x,y] pairs exactly as served, never reprojected. */
    readonly ring: ReadonlyArray<readonly [number, number]>;
    /** CRS of `ring` (the E1a native-CRS-on-the-object discipline). */
    readonly crs: string;
    /** Provenance tag — always `ee-maaamet-kataster`. */
    readonly source: string;
}

/** Provider/provenance id for registry + attribution. */
export const EE_PARCEL_PROVIDER_ID = 'ee-maaamet-kataster';
export const EE_PARCEL_PROVIDER_LABEL =
    'Katastriüksus (Estonia · Maa- ja Ruumiamet kataster)';

function str(v: unknown): string | null {
    return typeof v === 'string' && v.trim() !== '' ? v : null;
}
function num(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** PURE: one `ky_kehtiv` GeoJSON feature → `EeCadastralParcel`, or null if it has no tunnus/ring. */
export function parseEeParcelFeature(
    feature: EeWfsFeature,
    crs: string = EE_NATIVE_CRS,
): EeCadastralParcel | null {
    const p = feature.properties;
    const tunnus = str(p['tunnus']);
    if (tunnus === null) return null;
    const geom = feature.geometry;
    let ring: Array<readonly [number, number]> = [];
    if (geom && (geom.type === 'Polygon' || geom.type === 'MultiPolygon')) {
        let coords: unknown = geom.coordinates;
        if (geom.type === 'MultiPolygon' && Array.isArray(coords)) coords = coords[0];
        const outer = Array.isArray(coords) ? coords[0] : null;
        if (Array.isArray(outer)) {
            for (const pair of outer) {
                if (Array.isArray(pair) && pair.length >= 2) {
                    const x = num(pair[0]);
                    const y = num(pair[1]);
                    if (x !== null && y !== null) ring.push([x, y] as const);
                }
            }
        }
    }
    if (ring.length < 3) return null;
    const landUse: EeLandUseShare[] = [];
    for (const i of [1, 2, 3] as const) {
        const use = str(p[`siht${i}`]);
        if (use !== null) landUse.push({ use, percent: num(p[`so_prts${i}`]) });
    }
    return {
        tunnus,
        address: str(p['l_aadress']),
        municipality: str(p['ov_nimi']),
        county: str(p['mk_nimi']),
        district: str(p['ay_nimi']),
        landUse,
        areaM2: num(p['pindala']),
        registered: str(p['registr']),
        modified: str(p['muudet']),
        ring,
        crs,
        source: EE_PARCEL_PROVIDER_ID,
    };
}

function firstParcelOutcome(
    outcome: FetchOutcome<readonly EeWfsFeature[]>,
    label: string,
): FetchOutcome<EeCadastralParcel> {
    if (outcome.status !== 'found') return outcome;
    const parsed = parseEeParcelFeature(outcome.value[0]!);
    if (parsed === null) {
        return fetchTransient(`upstream-failed: unparsable ky_kehtiv feature (${label})`);
    }
    return { status: 'found', value: parsed };
}

/**
 * Resolve a parcel by cadastral id (`tunnus`) — exact CQL equality, native-CRS geometry back.
 * NEVER throws; a wrong layer / unreachable endpoint / no-such-tunnus each come back as their
 * own outcome.
 */
export async function resolveEeParcelByTunnus(
    tunnus: string,
    deps: EeWfsDeps = {},
): Promise<FetchOutcome<EeCadastralParcel>> {
    return tracer.startActiveSpan('pryzm.siteintel.ee.resolveParcelByTunnus', async (span) => {
        try {
            span.setAttribute('ee.tunnus', tunnus);
            const cql = `tunnus='${tunnus.replace(/'/g, '')}'`;
            const url = buildGeoserverCqlUrl(EE_CADASTRE_WORKSPACE, EE_CADASTRE_LAYER, cql, 1);
            const outcome = await eeWfsGetFeatures(
                url,
                `${EE_CADASTRE_LAYER} tunnus=${tunnus}`,
                deps,
            );
            const result = firstParcelOutcome(outcome, `tunnus=${tunnus}`);
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
 * Resolve a parcel at a WGS84 point (registry click path) via a tiny lat,lon urn-ordered bbox —
 * the server reprojects (measured fact 3 in `eeWfsClient.ts`); this module does NO projection.
 */
export async function resolveEeParcelAtWgs84Point(
    lat: number,
    lon: number,
    deps: EeWfsDeps = {},
): Promise<FetchOutcome<EeCadastralParcel>> {
    return tracer.startActiveSpan('pryzm.siteintel.ee.resolveParcelAtPoint', async (span) => {
        try {
            span.setAttribute('ee.lat', lat);
            span.setAttribute('ee.lon', lon);
            const d = 0.00005; // ~5 m half-window — a click, not a search
            const url = buildGeoserverWgs84BboxUrl(
                EE_CADASTRE_WORKSPACE,
                EE_CADASTRE_LAYER,
                lat - d,
                lon - d,
                lat + d,
                lon + d,
                1,
            );
            const outcome = await eeWfsGetFeatures(
                url,
                `${EE_CADASTRE_LAYER} @ ${lat.toFixed(6)},${lon.toFixed(6)}`,
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
