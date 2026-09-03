// LANE SI — SLOVENIA (SI) · parcel arm: GURS Kataster nepremičnin `SI.GURS.KN:PARCELE`.
//
// §J: `parcel: ParcelProvider — resolve(point|id) → FetchOutcome<ParcelFeature>`. Schema mapping
// ONLY — no business logic. Geometry stays in the NATIVE CRS with the CRS carried on the object
// (the E1a `NativeCrsGeometry` discipline; query in WGS84, the server reprojects the query, and the
// ring comes back in D96/TM = EPSG:3794 — never a hand-rolled projection).
//
// MEASURED SCHEMA (GetFeature 2026-09-03, capital click Ljubljana 46.0569,14.5058 → parcel
// PARCELE.100100001379837235):
//   PARCELA_ID (numeric internal id) · EID_PARCELA / EID (stable machine id "100100001379837235") ·
//   KO_ID (katastrska občina / cadastral-municipality id, 1725) · NAZIV ("1725 AJDOVŠČINA" — KO id
//   + KO name) · ST_PARCELE (parcel number "2468/4") · POVRSINA (registered area m², 1896) ·
//   E_CEN/N_CEN (centroid in 3794) · UPRAVNI_STATUSI_NAZIV_SL (administrative status "ni urejena") ·
//   DATUM_SYS (system timestamp "2024-09-16T…Z"). Output GeoJSON, geometry in EPSG:3794 by default.
//
// GEOMETRY + IDENTITY + registered area; NO ownership (the Land Register / Zemljiška knjiga is a
// separate authority), NO envelope (the ENVELOPE-GEOMETRY channel is the MNVP planning WFS —
// siSources.ts, the rules half). The canonical human parcel reference is `KO_ID + ST_PARCELE`
// ("1725 2468/4"); the stable machine key is `EID_PARCELA`.

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchTransient, type FetchOutcome } from '@pryzm/schemas';
import {
    buildSiEidCqlUrl,
    buildSiWgs84BboxUrl,
    SI_NATIVE_CRS,
    siWfsGetFeatures,
    type SiWfsDeps,
    type SiWfsFeature,
} from './siWfsClient.js';

const tracer = trace.getTracer('pryzm.siteintel.si');

/** Provider/provenance id for registry + attribution. */
export const SI_PARCEL_PROVIDER_ID = 'si-gurs-kn-parcele';
export const SI_PARCEL_PROVIDER_LABEL = 'Parcela (Slovenia · GURS Kataster nepremičnin)';

/** A resolved Slovenian cadastral parcel — identity + native-CRS geometry, nothing invented. */
export interface SiParcel {
    /**
     * Human cadastral reference `KO_ID ST_PARCELE` (`"1725 2468/4"`) — cadastral municipality +
     * parcel number, the way a parcel is cited in Slovenia. Null only if neither part is served.
     */
    readonly parcelRef: string | null;
    /** Stable machine id (`EID_PARCELA`, e.g. `"100100001379837235"`), or null. */
    readonly eid: string | null;
    /** Cadastral-municipality (katastrska občina) id (`KO_ID`, e.g. `1725`), or null. */
    readonly koId: number | null;
    /** KO label as served (`NAZIV`, e.g. `"1725 AJDOVŠČINA"`), or null. */
    readonly naziv: string | null;
    /** Parcel number within the KO (`ST_PARCELE`, e.g. `"2468/4"`), or null. */
    readonly stParcele: string | null;
    /** Registered area in m² (`POVRSINA`) — the cadastre's own attribute, never derived. */
    readonly areaM2: number | null;
    /** Administrative status as served (`UPRAVNI_STATUSI_NAZIV_SL`, e.g. `"ni urejena"`), or null. */
    readonly status: string | null;
    /** Last system update timestamp (`DATUM_SYS`, e.g. `"2024-09-16T14:03:30Z"`), or null. */
    readonly datumSys: string | null;
    /** Outer ring in the CRS named by `crs` — [x,y] pairs exactly as served, never reprojected. */
    readonly ring: ReadonlyArray<readonly [number, number]>;
    /** CRS of `ring` (the E1a native-CRS-on-the-object discipline) — `EPSG:3794`. */
    readonly crs: string;
    /** Provenance tag — always `si-gurs-kn-parcele`. */
    readonly source: string;
}

function str(v: unknown): string | null {
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}
function num(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
}

/**
 * PURE: one `SI.GURS.KN:PARCELE` GeoJSON feature → `SiParcel`, or null if it has neither a usable
 * identity (EID or KO+number) nor a ring. `crs` is the CRS the caller knows the geometry is in
 * (native EPSG:3794 for the no-`srsName` queries this adapter issues).
 */
export function parseSiParcelFeature(
    feature: SiWfsFeature,
    crs: string = SI_NATIVE_CRS,
): SiParcel | null {
    const p = feature.properties;
    const eid = str(p['EID_PARCELA']) ?? str(p['EID']);
    const koId = num(p['KO_ID']);
    const stParcele = str(p['ST_PARCELE']);
    const parcelRef = koId !== null && stParcele !== null ? `${koId} ${stParcele}` : null;
    // Identity floor: at least a stable id OR the human cadastral reference must be present.
    if (eid === null && parcelRef === null) return null;

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
        parcelRef,
        eid,
        koId,
        naziv: str(p['NAZIV']),
        stParcele,
        areaM2: num(p['POVRSINA']),
        status: str(p['UPRAVNI_STATUSI_NAZIV_SL']),
        datumSys: str(p['DATUM_SYS']),
        ring,
        crs,
        source: SI_PARCEL_PROVIDER_ID,
    };
}

function firstParcelOutcome(
    outcome: FetchOutcome<readonly SiWfsFeature[]>,
    label: string,
): FetchOutcome<SiParcel> {
    if (outcome.status !== 'found') return outcome;
    const parsed = parseSiParcelFeature(outcome.value[0]!);
    if (parsed === null) {
        return fetchTransient(`upstream-failed: unparsable PARCELE feature (${label})`);
    }
    return { status: 'found', value: parsed };
}

/**
 * Resolve a parcel by its stable machine id (`EID_PARCELA`) — exact CQL equality, native-CRS
 * geometry back. NEVER throws; a wrong layer / unreachable endpoint / no-such-eid each come back as
 * their own outcome.
 */
export async function resolveSiParcelByEid(
    eid: string,
    deps: SiWfsDeps = {},
): Promise<FetchOutcome<SiParcel>> {
    return tracer.startActiveSpan('pryzm.siteintel.si.resolveParcelByEid', async (span) => {
        try {
            span.setAttribute('si.eid', eid);
            const url = buildSiEidCqlUrl(eid, 1);
            const outcome = await siWfsGetFeatures(url, `PARCELE EID_PARCELA=${eid}`, deps);
            const result = firstParcelOutcome(outcome, `eid=${eid}`);
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
 * Resolve the parcel at a WGS84 point (registry click path) via a tiny lat,lon urn-ordered bbox —
 * the server reprojects the query (measured fact 2 in `siWfsClient.ts`); this module does NO
 * projection. Returns the FIRST feature the bbox catches; the browser proxy picks the ring that
 * actually contains the click (euCadastreProxy.js `pickCandidate`).
 */
export async function resolveSiParcelAtWgs84Point(
    lat: number,
    lon: number,
    deps: SiWfsDeps = {},
): Promise<FetchOutcome<SiParcel>> {
    return tracer.startActiveSpan('pryzm.siteintel.si.resolveParcelAtPoint', async (span) => {
        try {
            span.setAttribute('si.lat', lat);
            span.setAttribute('si.lon', lon);
            const d = 0.00005; // ~5 m half-window — a click, not a search
            const url = buildSiWgs84BboxUrl(lat - d, lon - d, lat + d, lon + d, 1);
            const outcome = await siWfsGetFeatures(
                url,
                `PARCELE @ ${lat.toFixed(6)},${lon.toFixed(6)}`,
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
