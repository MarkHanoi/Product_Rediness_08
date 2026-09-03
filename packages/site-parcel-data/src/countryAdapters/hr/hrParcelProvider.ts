// LANE HR — CROATIA (HR) · parcel arm: DGU / Uređena zemlja `cp_wms:CP.CadastralParcel`.
//
// §J: `parcel: ParcelProvider — resolve(point) → FetchOutcome<ParcelFeature>`. Schema mapping
// ONLY — no business logic. Geometry stays in the NATIVE CRS (EPSG:3765) with the CRS carried on
// the object (E1a `NativeCrsGeometry` discipline; the WGS84 bbox reprojects only the query FILTER,
// never the served geometry — see hrWfsClient.ts fact 2).
//
// MEASURED SCHEMA (GetFeature 2026-09-03, Zagreb Ban Jelačić; fixture recorded-live-2026-09-03):
//   properties: ID (int, GeoServer object id) · BROJ_CESTICE (STRING, the parcel number /
//   broj čestice, e.g. "2379") · MATICNI_BROJ_KO (int, cadastral-municipality code / matični
//   broj katastarske općine, e.g. 335240). geometry: Polygon, [E,N] in EPSG:3765. The KO NAME
//   (e.g. "CENTAR") is NOT on the parcel feature — it lives on cp_wms:CP.CadastralZoning.LABEL
//   ("<koCode>-<KO NAME>"); an optional join, not the parcel identity.
//
// GEOMETRY-ONLY + identity: NO ownership (that is the land registry / zemljišna knjiga, a separate
// gated system), NO envelope (Croatia has no machine-readable rule pack — see the index header).

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchTransient, type FetchOutcome } from '@pryzm/schemas';
import {
    buildHrWgs84BboxUrl,
    hrWfsGetFeatures,
    HR_NATIVE_CRS,
    HR_PARCEL_LAYER,
    type HrWfsDeps,
    type HrWfsFeature,
} from './hrWfsClient.js';

const tracer = trace.getTracer('pryzm.siteintel.hr');

/** Provider/provenance id for registry + attribution. */
export const HR_PARCEL_PROVIDER_ID = 'hr-dgu-dkp-cp';
export const HR_PARCEL_PROVIDER_LABEL =
    'Katastarska čestica (Croatia · DGU / Uređena zemlja — Digitalni katastarski plan)';

/** A resolved Croatian cadastral parcel — identity + native-CRS geometry, nothing invented. */
export interface HrCadastralParcel {
    /** Parcel number within the cadastral municipality (`BROJ_CESTICE`, e.g. `"2379"`). */
    readonly brojCestice: string;
    /** Cadastral-municipality code (`MATICNI_BROJ_KO`, matični broj katastarske općine, e.g. `335240`). */
    readonly koMaticniBroj: number | null;
    /** GeoServer object id (`ID`) — a stable service-side handle, not a legal identifier. */
    readonly objectId: number | null;
    /**
     * COMPOSED display reference `"k.č. <brojCestice>, k.o. <koMaticniBroj>"` — the way a Croatian
     * parcel is named. Clearly composed here from the two served fields, NOT claimed as the
     * INSPIRE `nationalCadastralReference` (that harmonized field lives on the cp: complex type,
     * which is currently ORA-01000-degraded — see hrWfsClient.ts fact 1).
     */
    readonly cadastralReference: string;
    /** Outer ring in the CRS named by `crs` — [x,y] pairs exactly as served, never reprojected. */
    readonly ring: ReadonlyArray<readonly [number, number]>;
    /** CRS of `ring` (the E1a native-CRS-on-the-object discipline). */
    readonly crs: string;
    /** Provenance tag — always `hr-dgu-dkp-cp`. */
    readonly source: string;
}

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

/**
 * PURE: one `cp_wms:CP.CadastralParcel` GeoJSON feature → `HrCadastralParcel`, or null if it has
 * no parcel number and no ring (a feature that cannot be identified or drawn is not a parcel).
 */
export function parseHrParcelFeature(
    feature: HrWfsFeature,
    crs: string = HR_NATIVE_CRS,
): HrCadastralParcel | null {
    const p = feature.properties;
    const brojCestice = str(p['BROJ_CESTICE']);
    if (brojCestice === null) return null;
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
    const koMaticniBroj = num(p['MATICNI_BROJ_KO']);
    const koLabel = koMaticniBroj !== null ? String(koMaticniBroj) : '?';
    return {
        brojCestice,
        koMaticniBroj,
        objectId: num(p['ID']),
        cadastralReference: `k.č. ${brojCestice}, k.o. ${koLabel}`,
        ring,
        crs,
        source: HR_PARCEL_PROVIDER_ID,
    };
}

function firstParcelOutcome(
    outcome: FetchOutcome<readonly HrWfsFeature[]>,
    label: string,
): FetchOutcome<HrCadastralParcel> {
    if (outcome.status !== 'found') return outcome;
    const parsed = parseHrParcelFeature(outcome.value[0]!);
    if (parsed === null) {
        return fetchTransient(`upstream-failed: unparsable CP.CadastralParcel feature (${label})`);
    }
    return { status: 'found', value: parsed };
}

/**
 * Resolve the cadastral parcel at a WGS84 point (registry click path) via a tiny lat,lon
 * urn-ordered bbox — the server reprojects the FILTER; this module does NO projection and the
 * served ring stays native EPSG:3765. NEVER throws; an unreachable endpoint / an ORA-01000 cursor
 * saturation / no-parcel-here each come back as their own typed outcome.
 */
export async function resolveHrParcelAtWgs84Point(
    lat: number,
    lon: number,
    deps: HrWfsDeps = {},
): Promise<FetchOutcome<HrCadastralParcel>> {
    return tracer.startActiveSpan('pryzm.siteintel.hr.resolveParcelAtPoint', async (span) => {
        try {
            span.setAttribute('hr.lat', lat);
            span.setAttribute('hr.lon', lon);
            const d = 0.00005; // ~5 m half-window — a click, not a search
            const url = buildHrWgs84BboxUrl(HR_PARCEL_LAYER, lat - d, lon - d, lat + d, lon + d, 1);
            const outcome = await hrWfsGetFeatures(
                url,
                `${HR_PARCEL_LAYER} @ ${lat.toFixed(6)},${lon.toFixed(6)}`,
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
