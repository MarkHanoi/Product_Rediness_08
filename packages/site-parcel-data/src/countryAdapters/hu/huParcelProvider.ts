// LANE HU — HUNGARY (HU) · the parcel arm. §J: `parcel: ParcelProvider — resolve(point) →
// FetchOutcome<ParcelFeature>`. Schema mapping ONLY; geometry stays in the NATIVE EOV CRS with the
// CRS carried on the object (E1a `NativeCrsGeometry` discipline).
//
// ⛔ HUNGARY'S NATIONAL PARCEL LEG IS A DECLARED DEFERRAL, AND THE SHAPE OF THE DEFERRAL IS THE
// POINT. This is NOT the Sweden shape (a credential-gated 401 with nothing behind it) and NOT the
// Estonia shape (a live national cadastre). It is a THIRD, sharper thing, and it is stated in those
// words rather than flattened into either:
//
//   • The NATIONAL cadastre (állami ingatlan-nyilvántartási alaptérkép) is delivered by Lechner
//     Tudásközpont via TAKARNET / Geoshop — PAID, quarterly, SHP/DXF/WMS (rest-of-europe sweep §HU;
//     envelope-geometry census row 26 "OPAQUE: state-monopolist delivery, fee-gated cadastre").
//     There is no keyless national parcel service.
//   • The ONE keyless service Hungary publishes for Cadastral Parcels — the INSPIRE CP WFS at
//     `inspire.lechnerkozpont.hu/geoserver/CP/ows` — is REAL, FREE (`ows:Fees` NONE,
//     `ows:AccessConstraints` NONE) and returns real parcels with a `nationalcadastralreference`…
//     but covers ONLY the **Mesterszállás sampling municipality** (1774 features, every one
//     `administrativeunit="Mesterszállás"`; the ATOM feed is literally titled "Cadastral Parcels of
//     Mesterszállás"). It is the INSPIRE minimum-compliance sample, not national territory.
//
// SO THE HONEST ANSWER AT THE CAPITAL IS A DEFERRAL, NOT AN ABSENCE. A Budapest click returns an
// empty FeatureCollection from the keyless service (PROBED LIVE 2026-09-03: `numberMatched=0`,
// body sha256 c103102050ecc455d7548abbd2c45658191a6cd03db6e212328cc0c195e8e3c1, committed as a
// fixture). Mapping that empty to `absent` ("no parcel here") would be the §CONTEXT-DATA-HONESTY
// conflation at national scale: there IS a parcel under every point in Budapest — it lives in the
// fee-gated national cadastre, not in the free sample. This provider therefore returns the DECLARED
// DEFERRAL (a `transient`, self-announcing) for any point the sample does not cover, and a REAL
// parcel where it does. That the provider is exercised against RECORDED BYTES — not built from a
// spec — is why the shape can be trusted when the national leg is one day licensed
// ([[fake-more-capable-than-real]]).

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchAbsent, fetchTransient, type FetchOutcome } from '@pryzm/schemas';
import {
    buildHuCpLabelUrl,
    buildHuCpWgs84BboxUrl,
    huCpGetFeatures,
    HU_NATIVE_CRS,
    type HuWfsDeps,
    type HuWfsFeature,
} from './huInspireCpClient.js';

const tracer = trace.getTracer('pryzm.siteintel.hu');

/** Provider/provenance id — reserved so the registry row and the refusals cannot drift apart. */
export const HU_PARCEL_PROVIDER_ID = 'hu-lechner-inspire-cp';
export const HU_PARCEL_PROVIDER_LABEL =
    'Földrészlet (Hungary · Lechner INSPIRE Cadastral Parcels — Mesterszállás sample)';

/** The distinguished token every deferred refusal carries — grep-able, assertable, unmistakable. */
export const HU_INSPIRE_CP_DEFERRED_TOKEN = 'hu-national-cadastre-fee-gated-deferred';

interface Bbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/**
 * The MEASURED WGS84 coverage of the keyless INSPIRE CP service — the Mesterszállás sampling
 * municipality. Computed 2026-09-03 as the bounding box of all 1774 served features reprojected to
 * EPSG:4326 (min/max over every ring vertex): lon[20.399654, 20.500223] × lat[46.891381,
 * 46.984411]. Used to tell an in-sample GENUINE GAP (`absent`) from an out-of-sample point (the
 * DEFERRAL) — never to gate the fetch (the WFS's own answer is authoritative for a point it does
 * cover).
 */
export const HU_INSPIRE_CP_SAMPLE_COVERAGE: Bbox = {
    minLat: 46.891381,
    maxLat: 46.984411,
    minLon: 20.399654,
    maxLon: 20.500223,
};

/** True when a WGS84 point falls within the measured Mesterszállás sample coverage. Pure. */
export function huInspireCpCoversPoint(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= HU_INSPIRE_CP_SAMPLE_COVERAGE.minLat &&
        lat <= HU_INSPIRE_CP_SAMPLE_COVERAGE.maxLat &&
        lon >= HU_INSPIRE_CP_SAMPLE_COVERAGE.minLon &&
        lon <= HU_INSPIRE_CP_SAMPLE_COVERAGE.maxLon
    );
}

/**
 * C74 §3.4 — a scaffold carries an owner, a date, a gate and a reviewBy that TURNS INTO A THROW, so
 * a deferral cannot quietly become permanent architecture nobody chose.
 */
export const HU_CADASTRE_DEFERRAL = Object.freeze({
    owner: 'lane HU (europe-adapters-2 wave)',
    declaredOn: '2026-09-03',
    /** What must happen for the national leg to become real (and this deferral to retire). */
    retiredBy:
        'a licensed feed of the Hungarian national cadastre (állami ingatlan-nyilvántartási ' +
        'alaptérkép) via Lechner TAKARNET / Geoshop — the country adapter is a commercial ' +
        'relationship, not a scraping problem — OR Lechner extending the keyless INSPIRE CP WFS ' +
        'from the Mesterszállás sample to national coverage; then a resolver written against ' +
        'RECORDED BYTES from that national service, never against the specification',
    /** Assert-by date. After this, the deferral is a decision that must be re-taken explicitly. */
    reviewBy: '2027-06-01',
    /** The measured evidence that the gate is real, not assumed. */
    evidence:
        'INSPIRE CP WFS keyless (HTTP 200, Fees/AccessConstraints NONE) but Mesterszállás-only: ' +
        '1774 features, all administrativeunit="Mesterszállás"; Budapest capital click ' +
        'numberMatched=0 (2026-09-03). National cadastre = paid TAKARNET/Geoshop.',
});

/**
 * PURE: C74 §3.4 expiry assertion. Throws BY NAME once `todayIso` passes `reviewBy`, naming the
 * owner and the retirement condition — so the failure tells the reader what to do.
 */
export function assertHuCadastreDeferralNotExpired(todayIso: string): void {
    if (todayIso > HU_CADASTRE_DEFERRAL.reviewBy) {
        throw new Error(
            `[hu-cadastre] the fee-gate DEFERRAL declared on ${HU_CADASTRE_DEFERRAL.declaredOn} by ` +
                `${HU_CADASTRE_DEFERRAL.owner} passed its reviewBy date ${HU_CADASTRE_DEFERRAL.reviewBy} ` +
                `(today ${todayIso}) and was not retired. Retirement means: ${HU_CADASTRE_DEFERRAL.retiredBy}. ` +
                'Re-take the decision explicitly — do not extend this date to silence the assertion.',
        );
    }
}

/** The DECLARED-DEFERRAL refusal (C74 §3.2): a `transient`, self-announcing, never an `absent`. */
export function huCadastreDeferredRefusal<T>(leg: string): FetchOutcome<T> {
    return fetchTransient(
        `endpoint-unreachable: ${HU_INSPIRE_CP_DEFERRED_TOKEN} — PRYZM has NO keyless national ` +
            `Hungarian cadastre for the ${leg} leg. The national cadastre is fee-gated (Lechner ` +
            `TAKARNET / Geoshop, PAID), and the only keyless INSPIRE Cadastral-Parcels service covers ` +
            `the Mesterszállás sample municipality alone. This is a declared deferral, not a failed ` +
            'call and not an absence of a Hungarian parcel here — see HU_CADASTRE_DEFERRAL.',
    );
}

/** One land share the cadastre serves (`zoning` is `NULL` on the sample; kept for shape). */
export interface HuLandUse {
    readonly zoning: string | null;
}

/** A resolved Hungarian cadastral parcel — identity + native-CRS geometry, nothing invented. */
export interface HuCadastralParcel {
    /**
     * The helyrajzi szám as served (`nationalcadastralreference` / `label`, e.g. `015`, `087/2`).
     * ⚠ NATIONALLY AMBIGUOUS on its own — it repeats in every settlement; `administrativeUnit`
     * scopes it. Carried opaque, never parsed into components.
     */
    readonly nationalCadastralReference: string;
    /** INSPIRE local id (`inspireid` / `localid`, e.g. `HU.CP.015.`), or null. */
    readonly inspireId: string | null;
    /** Administrative unit (`administrativeunit`, e.g. `Mesterszállás`), or null. */
    readonly administrativeUnit: string | null;
    /** Registered area in m² (`areavalue`) — the cadastre's own attribute, never derived. */
    readonly areaM2: number | null;
    /** Zoning share as served (`zoning`), or null. */
    readonly landUse: HuLandUse;
    /** Life-cycle start as served (`beginlifespanversion`, e.g. `2019-05-01`), or null. */
    readonly beginLifespan: string | null;
    /** Outer ring in the CRS named by `crs` — [x,y] pairs exactly as served, never reprojected. */
    readonly ring: ReadonlyArray<readonly [number, number]>;
    /** CRS of `ring` (the E1a native-CRS-on-the-object discipline) — EPSG:23700 (EOV). */
    readonly crs: string;
    /** Provenance tag — always `hu-lechner-inspire-cp`. */
    readonly source: string;
}

function str(v: unknown): string | null {
    return typeof v === 'string' && v.trim() !== '' && v.trim().toUpperCase() !== 'NULL' ? v : null;
}
function num(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
}

/** PURE: one `CP.CadastralParcels` GeoJSON feature → `HuCadastralParcel`, or null if it has no ref/ring. */
export function parseHuParcelFeature(
    feature: HuWfsFeature,
    crs: string = HU_NATIVE_CRS,
): HuCadastralParcel | null {
    const p = feature.properties ?? {};
    const ref = str(p['nationalcadastralreference']) ?? str(p['label']);
    if (ref === null) return null;
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
        nationalCadastralReference: ref,
        inspireId: str(p['inspireid']) ?? str(p['localid']),
        administrativeUnit: str(p['administrativeunit']),
        areaM2: num(p['areavalue']),
        landUse: { zoning: str(p['zoning']) },
        beginLifespan: str(p['beginlifespanversion']) ?? str(p['validfrom']),
        ring,
        crs,
        source: HU_PARCEL_PROVIDER_ID,
    };
}

function firstParcelOutcome(
    outcome: FetchOutcome<readonly HuWfsFeature[]>,
    label: string,
): FetchOutcome<HuCadastralParcel> {
    if (outcome.status !== 'found') return outcome;
    const parsed = parseHuParcelFeature(outcome.value[0]!);
    if (parsed === null) {
        return fetchTransient(`upstream-failed: unparsable CP.CadastralParcels feature (${label})`);
    }
    return { status: 'found', value: parsed };
}

/**
 * Resolve the parcel at a WGS84 point (the registry click path). Queries the keyless INSPIRE CP
 * sample WFS via a ~10 m half-window; then:
 *   • a served parcel → `found` (a REAL Mesterszállás parcel with its helyrajzi szám);
 *   • an empty answer INSIDE the measured sample coverage → `absent` (a genuine gap in covered
 *     territory — the source answered and there is nothing at this exact point);
 *   • an empty answer OUTSIDE the sample (Budapest and everywhere else national) → the DECLARED
 *     DEFERRAL (`transient`): the fee-gated national cadastre would answer, the free sample does
 *     not cover here, and calling that "no parcel" would be a national-scale honesty breach;
 *   • a transport failure → pass the `transient` through.
 * NEVER throws.
 */
export async function resolveHuParcelAtWgs84Point(
    lat: number,
    lon: number,
    deps: HuWfsDeps = {},
): Promise<FetchOutcome<HuCadastralParcel>> {
    return tracer.startActiveSpan('pryzm.siteintel.hu.resolveParcelAtPoint', async (span): Promise<FetchOutcome<HuCadastralParcel>> => {
        try {
            span.setAttribute('hu.lat', lat);
            span.setAttribute('hu.lon', lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'non-finite-point' });
                return fetchAbsent('no-point: non-finite lat/lon');
            }
            const d = 0.00005; // ~5 m half-window — a click, not a search
            const url = buildHuCpWgs84BboxUrl(lat - d, lon - d, lat + d, lon + d, 1);
            const outcome = await huCpGetFeatures(url, `@${lat.toFixed(6)},${lon.toFixed(6)}`, deps);

            if (outcome.status === 'found') {
                const result = firstParcelOutcome(outcome, `@${lat},${lon}`);
                span.setStatus({ code: SpanStatusCode.OK });
                return result;
            }
            if (outcome.status === 'transient') {
                span.setStatus({ code: SpanStatusCode.ERROR, message: outcome.reason });
                return outcome;
            }
            // outcome.status === 'absent' — the keyless sample WFS answered with nothing here.
            if (huInspireCpCoversPoint(lat, lon)) {
                // Inside the covered sample → a genuine gap (road/water/unparcelled). Honest absence.
                span.setStatus({ code: SpanStatusCode.OK });
                return fetchAbsent(
                    `no-feature: no parcel at ${lat.toFixed(6)},${lon.toFixed(6)} within the ` +
                        'Mesterszállás INSPIRE CP sample',
                );
            }
            // Outside the sample → the national fee-gate deferral, NOT an absence.
            span.setAttribute('hu.deferred', true);
            span.setStatus({ code: SpanStatusCode.ERROR, message: HU_INSPIRE_CP_DEFERRED_TOKEN });
            return huCadastreDeferredRefusal<HuCadastralParcel>(
                `cadastre parcel at ${lat.toFixed(6)},${lon.toFixed(6)}`,
            );
        } finally {
            span.end();
        }
    });
}

/**
 * Resolve a parcel by its `label` (helyrajzi szám) WITHIN the Mesterszállás sample. ⚠ NOT a
 * national by-id resolver (the hrsz repeats in every settlement — see `HuCadastralParcel`); this
 * exists for the sample fixture and inspection. Returns the first match, or the sample WFS's own
 * `absent`, or a `transient` — never a fabricated parcel.
 */
export async function resolveHuParcelByLabelInSample(
    label: string,
    deps: HuWfsDeps = {},
): Promise<FetchOutcome<HuCadastralParcel>> {
    return tracer.startActiveSpan('pryzm.siteintel.hu.resolveParcelByLabelInSample', async (span): Promise<FetchOutcome<HuCadastralParcel>> => {
        try {
            span.setAttribute('hu.label', label);
            const url = buildHuCpLabelUrl(label, 1);
            const outcome = await huCpGetFeatures(url, `label=${label}`, deps);
            const result = firstParcelOutcome(outcome, `label=${label}`);
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
