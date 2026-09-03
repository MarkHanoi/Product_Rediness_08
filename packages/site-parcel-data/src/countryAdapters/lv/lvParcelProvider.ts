// LANE LV — LATVIA (LV) · parcel arm: the geolatvija VRAA GeoServer `vraa:parcel` cadastral
// land-unit layer (zemes vienība), served from the national Kadastrs via VZD.
//
// §J: `parcel: ParcelProvider — resolve(point|id) → FetchOutcome<ParcelFeature>`. Schema mapping
// ONLY — no business logic, no envelope math (there is no LV rules leg in this adapter; numeric
// planning parameters live in the TIAN legal text, see index.ts). The click path requests WGS84
// output (srsName=EPSG:4326), so the ring comes back already in WGS84 [lon,lat] and no projection
// is done here (lvWfsClient.ts measured fact 2).
//
// MEASURED SCHEMA (GetFeature 2026-09-03, parcel code 01000070006 @ Pils iela 23, Rīga, and the
// bbox click path over the same block):
//   code (cadastral designation, 11 digits `01000070006`) · property_code (property cadastral
//   number) · objectcode (ATVK/classifier) · address (`Pils iela 23, Rīga, LV1050`) · purpose_use
//   (intended-use label(s); `;`-joined when several apply) · area (m², integer) · area_scale (m²,
//   float) · owner (FORM-of-ownership label — `juridiska persona (Īpašnieks)` / `pašvaldība
//   (Īpašnieks)`, NOT owner identity) · owned_by_municipality (bool) · public_water (bool) ·
//   geom_act_d (geometry-actualisation date, `2011-11-02Z`) · parcel_status_kind_name · geometry
//   MultiPolygon in EPSG:4326 (srsName honoured server-side).
//
// GEOMETRY-ONLY + identity: NO owner identity (the `owner` attribute is a legal-FORM category, the
// Kadastrs ownership register with names is a separate, access-controlled system — never fetched
// here), NO envelope (there is no served numeric envelope in Latvia — index.ts records the
// deferral).

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchTransient, type FetchOutcome } from '@pryzm/schemas';
import {
    buildLvCqlUrl,
    buildLvWgs84BboxUrl,
    lvWfsGetFeatures,
    LV_OUTPUT_CRS,
    type LvWfsDeps,
    type LvWfsFeature,
} from './lvWfsClient.js';

const tracer = trace.getTracer('pryzm.siteintel.lv');

/** The cadastral land-unit layer (zemes vienība). PROBED LIVE 2026-09-03. */
export const LV_PARCEL_LAYER = 'vraa:parcel';

/** Provider/provenance id for registry + attribution. ONE constant so row/parser/source align. */
export const LV_PARCEL_PROVIDER_ID = 'lv-vzd-kadastrs-geolatvija';
export const LV_PARCEL_PROVIDER_LABEL = 'Kadastra zemes vienība (Latvia · VZD / geolatvija)';

/** A resolved Latvian cadastral land-unit — identity + WGS84 geometry, nothing invented. */
export interface LvCadastralParcel {
    /** Cadastral designation of the land unit (`code`, e.g. `01000070006`) — the parcel identifier. */
    readonly cadastralCode: string;
    /** Property cadastral number (`property_code`), or null. */
    readonly propertyCode: string | null;
    /** ATVK/classifier code (`objectcode`), or null. */
    readonly objectCode: string | null;
    /** Address (`address`), or null. */
    readonly address: string | null;
    /** Intended-use label(s) (`purpose_use`); `;`-joined when several apply. Verbatim, never parsed. */
    readonly purposeUse: string | null;
    /** Registered area in m² (`area`, integer) — the cadastre's own attribute, never derived. */
    readonly areaM2: number | null;
    /** Finer area in m² (`area_scale`, float) as served — carried alongside, not reconciled. */
    readonly areaScaleM2: number | null;
    /** FORM of ownership (`owner`) — a legal category label, NOT owner identity. */
    readonly ownershipForm: string | null;
    /** Whether the municipality owns it (`owned_by_municipality`), or null. */
    readonly ownedByMunicipality: boolean | null;
    /** Whether it is public water (`public_water`), or null. */
    readonly publicWater: boolean | null;
    /** Geometry-actualisation date as served (`geom_act_d`, e.g. `2011-11-02Z`). */
    readonly geometryActualisedDate: string | null;
    /** Parcel status kind (`parcel_status_kind_name`), or null. */
    readonly statusKind: string | null;
    /** Outer ring as [lon,lat] pairs in WGS84 exactly as served (srsName=EPSG:4326). */
    readonly ring: ReadonlyArray<readonly [number, number]>;
    /** CRS of `ring` — always WGS84 (the output CRS this adapter requests). */
    readonly crs: string;
    /** Provenance tag — always `lv-vzd-kadastrs-geolatvija`. */
    readonly source: string;
}

function str(v: unknown): string | null {
    return typeof v === 'string' && v.trim() !== '' ? v : null;
}
function num(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function bool(v: unknown): boolean | null {
    return typeof v === 'boolean' ? v : null;
}

/** PURE: one `vraa:parcel` GeoJSON feature → `LvCadastralParcel`, or null if it has no code/ring. */
export function parseLvParcelFeature(
    feature: LvWfsFeature,
    crs: string = LV_OUTPUT_CRS,
): LvCadastralParcel | null {
    const p = feature.properties;
    const cadastralCode = str(p['code']);
    if (cadastralCode === null) return null;
    const geom = feature.geometry;
    const ring: Array<readonly [number, number]> = [];
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
    return {
        cadastralCode,
        propertyCode: str(p['property_code']),
        objectCode: str(p['objectcode']),
        address: str(p['address']),
        purposeUse: str(p['purpose_use']),
        areaM2: num(p['area']),
        areaScaleM2: num(p['area_scale']),
        ownershipForm: str(p['owner']),
        ownedByMunicipality: bool(p['owned_by_municipality']),
        publicWater: bool(p['public_water']),
        geometryActualisedDate: str(p['geom_act_d']),
        statusKind: str(p['parcel_status_kind_name']),
        ring,
        crs,
        source: LV_PARCEL_PROVIDER_ID,
    };
}

function firstParcelOutcome(
    outcome: FetchOutcome<readonly LvWfsFeature[]>,
    label: string,
): FetchOutcome<LvCadastralParcel> {
    if (outcome.status !== 'found') return outcome;
    const parsed = parseLvParcelFeature(outcome.value[0]!);
    if (parsed === null) {
        return fetchTransient(`upstream-failed: unparsable vraa:parcel feature (${label})`);
    }
    return { status: 'found', value: parsed };
}

/**
 * Resolve a land unit by its cadastral designation (`code`) — exact CQL equality, WGS84 geometry
 * back. NEVER throws; a wrong layer / unreachable endpoint / no-such-code each come back as their
 * own outcome. The single-quote is stripped from the literal so the CQL cannot be broken by input.
 */
export async function resolveLvParcelByCode(
    code: string,
    deps: LvWfsDeps = {},
): Promise<FetchOutcome<LvCadastralParcel>> {
    return tracer.startActiveSpan('pryzm.siteintel.lv.resolveParcelByCode', async (span) => {
        try {
            span.setAttribute('lv.code', code);
            const cql = `code='${code.replace(/'/g, '')}'`;
            const url = buildLvCqlUrl(LV_PARCEL_LAYER, cql, 1);
            const outcome = await lvWfsGetFeatures(url, `${LV_PARCEL_LAYER} code=${code}`, deps);
            const result = firstParcelOutcome(outcome, `code=${code}`);
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
 * the server reprojects and returns WGS84 (lvWfsClient.ts measured fact 2); this module does NO
 * projection. The window is a click (~6 m half-width), not a search.
 */
export async function resolveLvParcelAtWgs84Point(
    lat: number,
    lon: number,
    deps: LvWfsDeps = {},
): Promise<FetchOutcome<LvCadastralParcel>> {
    return tracer.startActiveSpan('pryzm.siteintel.lv.resolveParcelAtPoint', async (span) => {
        try {
            span.setAttribute('lv.lat', lat);
            span.setAttribute('lv.lon', lon);
            const d = 0.00006; // ~6 m half-window — a click, not a search
            const url = buildLvWgs84BboxUrl(
                LV_PARCEL_LAYER,
                lat - d,
                lon - d,
                lat + d,
                lon + d,
                1,
            );
            const outcome = await lvWfsGetFeatures(
                url,
                `${LV_PARCEL_LAYER} @ ${lat.toFixed(6)},${lon.toFixed(6)}`,
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
