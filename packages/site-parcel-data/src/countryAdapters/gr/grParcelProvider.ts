// LANE GR — GREECE (GR) · the parcel arm: Hellenic Cadastre operating-cadastre parcels
// (`GEOTEMAXIA_LEITOURGOUN_ON_gdb/FeatureServer/0`, ArcGIS Online, keyless).
//
// REPORT §J: `parcel: ParcelProvider — resolve(point) -> FetchOutcome<ParcelFeature>`. Schema
// mapping ONLY — no business logic, no envelope math, no geometry computation. The register
// serves `AREA` (m²) directly, so this adapter carries it verbatim and NEVER derives area from
// the ring (the Madrid/Murcia measure-after-reprojection trap the repo already paid for).
//
// MEASURED SCHEMA (layer `?f=json` + point query, 2026-09-03 — Athens/Syntagma, live):
//   `KAEK` (the 12-digit national cadastre code, the id — "050095701001") · `MAIN_USE` (use
//   code, STRING e.g. "7300") · `DESCR` (Greek use description verbatim, e.g. "Άλλος
//   Κοινόχρηστος χώρος") · `PERCENTAGE` (share, %) · `PROP_VERT` / `PROP_HOR` (vertical/horizontal
//   property flags) · `LINK` (the ΟΤΑ/municipality card URL, e.g.
//   "https://www.ktimatologio.gr/ota/05009") · `AREA` (register m²) · `PERIMETER` (register m).
//
// GEOMETRY-ONLY + identity: NO ownership (the Hellenic Cadastre does not serve owner data on this
// public layer — that is the registered-rights channel, gated), NO envelope (Greek building terms
// = όροι δόμησης are FEK-decree PDFs; there is no machine-readable rules channel — see the
// adapter header + grSources.ts, and the honest no-rule-pack `precedence` in index.ts).

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchTransient, type FetchOutcome } from '@pryzm/schemas';
import type { ArcgisRestFeature } from '../../providers/containers/arcgisRest.js';
import {
    GR_RING_CRS,
    grEsriOuterRing,
    grNum,
    grParcelPointQuery,
    grParcelWhereQuery,
    grSqlLiteral,
    grStr,
    type GrArcgisDeps,
} from './grKtimatologioClient.js';

const tracer = trace.getTracer('pryzm.siteintel.gr');

/** Provider/provenance id — matches the registry row + the `grSources.ts` row id (one spelling). */
export const GR_PARCEL_PROVIDER_ID = 'gr-ktimatologio-geotemaxia-leitourgoun';
export const GR_PARCEL_PROVIDER_LABEL =
    'Γεωτεμάχιο (Greece · Ελληνικό Κτηματολόγιο, operating cadastre)';

/** A resolved Greek cadastral parcel — identity + WGS84 geometry + served register facts. */
export interface GrCadastralParcel {
    /** `KAEK` — Κωδικός Αριθμός Εθνικού Κτηματολογίου, the national parcel id. Opaque (never split). */
    readonly kaek: string;
    /** `MAIN_USE` use code, verbatim (STRING, e.g. "7300"), or null. */
    readonly mainUseCode: string | null;
    /** `DESCR` — the Greek use description verbatim, or null. */
    readonly useDescription: string | null;
    /** `PERCENTAGE` share (%), or null. */
    readonly percentage: number | null;
    /** `PROP_VERT` / `PROP_HOR` property flags, verbatim, or null. */
    readonly propertyVertical: number | null;
    readonly propertyHorizontal: number | null;
    /** `LINK` — the ΟΤΑ/municipality card URL, verbatim, or null. */
    readonly otaLink: string | null;
    /**
     * The register's own area in m² (`AREA`), carried verbatim — NEVER derived from the ring.
     * Distinct from the layer's Web-Mercator `Shape__Area`, which this adapter does not read.
     */
    readonly areaM2: number | null;
    /** The register's own perimeter in m (`PERIMETER`), verbatim, or null. */
    readonly perimeterM: number | null;
    /** Outer ring — `[lon, lat]` pairs, server-side reprojected to WGS84. */
    readonly ring: ReadonlyArray<readonly [number, number]>;
    /** CRS of `ring` — always {@link GR_RING_CRS} (`EPSG:4326`). */
    readonly crs: string;
    /** Provenance tag — always {@link GR_PARCEL_PROVIDER_ID}. */
    readonly source: string;
}

/** PURE: one operating-cadastre feature -> `GrCadastralParcel`, or null without a KAEK/ring. */
export function parseGrParcelFeature(
    feature: ArcgisRestFeature,
    crs: string = GR_RING_CRS,
): GrCadastralParcel | null {
    const a = feature.attributes;
    const kaek = grStr(a, 'KAEK');
    if (kaek === null) return null;
    const ring = grEsriOuterRing(feature.geometry);
    if (ring.length < 3) return null;
    return {
        kaek,
        mainUseCode: grStr(a, 'MAIN_USE'),
        useDescription: grStr(a, 'DESCR'),
        percentage: grNum(a, 'PERCENTAGE'),
        propertyVertical: grNum(a, 'PROP_VERT'),
        propertyHorizontal: grNum(a, 'PROP_HOR'),
        otaLink: grStr(a, 'LINK'),
        areaM2: grNum(a, 'AREA'),
        perimeterM: grNum(a, 'PERIMETER'),
        ring,
        crs,
        source: GR_PARCEL_PROVIDER_ID,
    };
}

function firstParcelOutcome(
    outcome: FetchOutcome<readonly ArcgisRestFeature[]>,
    label: string,
): FetchOutcome<GrCadastralParcel> {
    if (outcome.status !== 'found') return outcome;
    const parsed = parseGrParcelFeature(outcome.value[0]!);
    if (parsed === null) {
        return fetchTransient(`upstream-failed: unparsable GEOTEMAXIA feature (${label})`);
    }
    return { status: 'found', value: parsed };
}

/**
 * Resolve the parcel at a WGS84 point (the map-click path). The service reprojects SERVER-SIDE;
 * this module performs no projection and no area math.
 *
 * ⚠ `absent` here is a DATA CHARACTERISTIC, not an outage, and it carries
 * {@link GR_INCOMPLETE_CADASTRE_CAVEAT}: the national cadastre compilation is INCOMPLETE
 * (coverage varies by area, forest-map + registration programmes ongoing), and a point may be
 * under ANARTHSH (public display) rather than in the OPERATING fabric this layer serves. A
 * 0-feature answer is "no OPERATING parcel here", never "no land here".
 */
export async function resolveGrParcelAtWgs84Point(
    lat: number,
    lon: number,
    deps: GrArcgisDeps = {},
): Promise<FetchOutcome<GrCadastralParcel>> {
    return tracer.startActiveSpan('pryzm.siteintel.gr.resolveParcelAtPoint', async (span) => {
        try {
            span.setAttribute('gr.lat', lat);
            span.setAttribute('gr.lon', lon);
            const outcome = await grParcelPointQuery(
                lat,
                lon,
                `LEITOURGOUN @ ${lat.toFixed(6)},${lon.toFixed(6)}`,
                deps,
            );
            if (outcome.status === 'absent') {
                span.setStatus({ code: SpanStatusCode.OK });
                return {
                    status: 'absent' as const,
                    reason: `${outcome.reason} — ${GR_INCOMPLETE_CADASTRE_CAVEAT}`,
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
 * Resolve a parcel by its `KAEK` (exact equality). NEVER throws; an unreachable endpoint, an
 * ArcGIS error body and a no-such-KAEK each come back as their own outcome (the last as `absent`).
 */
export async function resolveGrParcelByKaek(
    kaek: string,
    deps: GrArcgisDeps = {},
): Promise<FetchOutcome<GrCadastralParcel>> {
    return tracer.startActiveSpan('pryzm.siteintel.gr.resolveParcelByKaek', async (span) => {
        try {
            span.setAttribute('gr.kaek', kaek);
            const outcome = await grParcelWhereQuery(
                `KAEK = ${grSqlLiteral(kaek)}`,
                `LEITOURGOUN KAEK=${kaek}`,
                deps,
            );
            const result = firstParcelOutcome(outcome, `KAEK=${kaek}`);
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
 * The incomplete-cadastre caveat, carried on every point-query `absent` so a consumer must
 * confront it rather than read "no parcel" as "no land". The Hellenic Cadastre compilation is
 * still incomplete (sweep 2026-08-31: "national cadastre compilation is still INCOMPLETE —
 * coverage varies by area; forest-map and registration programmes ongoing"), and the OPERATING
 * layer excludes parcels still under ANARTHSH (public display).
 */
export const GR_INCOMPLETE_CADASTRE_CAVEAT =
    'the Hellenic Cadastre operating fabric is INCOMPLETE: a 0-feature point query is a coverage ' +
    'characteristic (area not yet in the OPERATING cadastre, or still under ANARTHSH/public ' +
    'display), NOT an outage and NOT proof the land is unregistered (sweep 2026-08-31, measured)';
