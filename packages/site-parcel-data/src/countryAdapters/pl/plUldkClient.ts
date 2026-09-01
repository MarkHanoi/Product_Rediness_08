// LANE E6-PL — POLAND (PL) ADAPTER · the parcel arm: GUGiK ULDK (Usługa Lokalizacji Działek
// Katastralnych), the keyless national parcel locator. §J `parcel: ParcelProvider —
// resolve(point|id) → FetchOutcome<ParcelFeature>`.
//
// GEOMETRY + IDENTITY ONLY — the discipline every provider in `parcelProviders/*.ts`
// self-declares and the §9 boundary audit found clean: no envelope, no FAR, no ownership
// (EGiB subject data is gated at powiat level behind a fee + legal-interest test; lane 4
// §PL-4 records the gate, and a gate is never conflated with absence).
//
// MEASURED FACTS THIS MODULE ENCODES (live probes 2026-09-01, this lane — re-run them before
// "fixing" any of these):
//
//   1. EVERY ANSWER IS HTTP 200. Success, no-result and bad-parameter all return 200 with a
//      text/plain body; the STATUS IS THE FIRST TOKEN OF THE BODY, not the HTTP code. Reading
//      `res.ok` as success is the failure≠absence conflation §CONTEXT-DATA-HONESTY forbids,
//      and here it would silently turn a service error into "no parcel here".
//        • success        → first line `0`, then one pipe-delimited record per line
//        • genuine absence→ first line `-1 brak wyników` (measured: a nonsense id, and a point
//                           in Berlin — both answer this way)
//        • bad parameter  → body starts `niepoprawny parametr <name>, specyfikacja usługi …`
//                           (no status token at all) → classified TRANSIENT, never absent
//   2. AXIS ORDER: `GetParcelByXY&xy=<LON>,<LAT>,4326` — LONGITUDE FIRST (probed:
//      `21.0061,52.2317,4326` → the Warszawa parcel; the swapped pair is a point in the sea
//      off Somalia and answers `-1 brak wyników`, i.e. it fails SILENTLY as an absence).
//   3. NATIVE CRS: geometry comes back as `SRID=2180;POLYGON((easting northing, …))` —
//      PUWG 1992 / EPSG:2180. Coordinates are kept EXACTLY as served and never reprojected
//      here (§L3 ES-5 Madrid trap: measure in the native CRS or not at all).
//   4. The `result=` parameter fixes the FIELD ORDER of the record; this module always asks
//      for the same list, so the positional parse is pinned to a request it builds itself.
//
// EXISTING-SOLVER CHECK (grep FIRST, per the session hard rule): a repo-wide grep for
// `POLYGON((` / `parseWkt` / `wktToRing` / `SRID=` across `packages/**` on 2026-09-01 returns
// TWO files — `countryAdapters/ee/eeWfsClient.ts` (which WRITES WKT into a CQL filter) and its
// test. There is no WKT READER anywhere in this repo, so the ~30-line polygon reader below is
// an adoption of the house no-dependency discipline (the same call `parsers/appGml` made for
// its XML scanner), not a rival of any existing solver.

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchAbsent, fetchFound, fetchTransient, type FetchOutcome } from '@pryzm/schemas';
import { PL_ULDK_SOURCE_ID } from './plSources.js';

const tracer = trace.getTracer('pryzm.siteintel.pl');

/** The keyless ULDK endpoint (GUGiK). PROBED LIVE 2026-09-01. */
export const PL_ULDK_BASE = 'https://uldk.gugik.gov.pl/';

/**
 * Native CRS of the Polish cadastral services — PUWG 1992. Query and measure in it
 * (lane 4 §PL-4: "native CRS — measure here, never after reprojection").
 */
export const PL_NATIVE_CRS = 'EPSG:2180';

/** Provider/provenance id for registry + attribution. */
export const PL_PARCEL_PROVIDER_ID = 'pl-gugik-uldk';
export const PL_PARCEL_PROVIDER_LABEL = 'Działka ewidencyjna (Poland · GUGiK ULDK)';

/** The `result=` field list this module always requests — the positional parse depends on it. */
export const PL_ULDK_RESULT_FIELDS = [
    'id',
    'voivodeship',
    'county',
    'commune',
    'region',
    'parcel',
    'geom_wkt',
] as const;

/** Injectable dependencies so the provider is unit-testable without the network. */
export interface PlUldkDeps {
    /** Override `globalThis.fetch` (tests inject a fake; node probes use the real one). */
    readonly fetchImpl?: typeof fetch;
}

/** A resolved Polish cadastral parcel — identity + native-CRS geometry, nothing invented. */
export interface PlCadastralParcel {
    /** National parcel identifier (TERYT-based, e.g. `146510_8.0309.24/35`). */
    readonly id: string;
    /** Województwo, e.g. `mazowieckie`. */
    readonly voivodeship: string | null;
    /** Powiat, e.g. `powiat Warszawa`. */
    readonly county: string | null;
    /** Gmina, e.g. `Warszawa (miasto)`. */
    readonly commune: string | null;
    /** Obręb ewidencyjny, e.g. `5-03-09`. */
    readonly region: string | null;
    /** Numer działki within the obręb, e.g. `24/35`. */
    readonly parcelNumber: string | null;
    /** Outer ring in the CRS named by `crs` — [easting, northing] exactly as served. */
    readonly ring: ReadonlyArray<readonly [number, number]>;
    /** CRS of `ring` (the E1a native-CRS-on-the-object discipline). */
    readonly crs: string;
    /** Provenance tag — always `pl-gugik-uldk`. */
    readonly provider: string;
    /** → `SiteIntelSource.id` (the ONE registry row id, never a second spelling). */
    readonly source: string;
}

/* ───────────────────────────── pure parsing ───────────────────────────── */

/**
 * PURE: `SRID=2180;POLYGON((x y, x y, …))` → the outer ring + its SRID. Returns null for
 * anything it does not recognise (MULTIPOLYGON, empty, malformed) — the caller turns that
 * into a NAMED transient, never a silent empty ring.
 *
 * Interior rings are DELIBERATELY not returned: the canonical `SiteIntelParcel` this feeds is
 * an outer-ring record, and inventing a hole-carrying shape the rest of the chain cannot use
 * would be a shape nobody consumes. A parcel WITH holes still yields its correct outer ring.
 */
export function parsePlSridPolygon(
    wkt: string,
): { readonly crs: string; readonly ring: ReadonlyArray<readonly [number, number]> } | null {
    const m = /^\s*(?:SRID=(\d+);)?\s*POLYGON\s*\(\s*\((.*?)\)\s*[,)]/s.exec(wkt);
    if (m === null) return null;
    const srid = m[1];
    const body = m[2];
    if (body === undefined) return null;
    const ring: Array<readonly [number, number]> = [];
    for (const pair of body.split(',')) {
        const parts = pair.trim().split(/\s+/);
        if (parts.length < 2) return null;
        const x = Number(parts[0]);
        const y = Number(parts[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        ring.push([x, y] as const);
    }
    if (ring.length < 4) return null; // a closed ring is ≥4 positions
    return { crs: srid !== undefined ? `EPSG:${srid}` : PL_NATIVE_CRS, ring };
}

function field(parts: readonly string[], i: number): string | null {
    const v = parts[i];
    return v !== undefined && v.trim() !== '' ? v.trim() : null;
}

/**
 * PURE: one pipe-delimited ULDK record (in `PL_ULDK_RESULT_FIELDS` order) → a parcel, or null
 * when it carries no id or no parseable geometry.
 */
export function parsePlUldkRecord(line: string): PlCadastralParcel | null {
    const parts = line.split('|');
    const id = field(parts, 0);
    const wkt = field(parts, 6);
    if (id === null || wkt === null) return null;
    const geom = parsePlSridPolygon(wkt);
    if (geom === null) return null;
    return {
        id,
        voivodeship: field(parts, 1),
        county: field(parts, 2),
        commune: field(parts, 3),
        region: field(parts, 4),
        parcelNumber: field(parts, 5),
        ring: geom.ring,
        crs: geom.crs,
        provider: PL_PARCEL_PROVIDER_ID,
        source: PL_ULDK_SOURCE_ID,
    };
}

/* ───────────────────────────── URL builders (pure) ────────────────────── */

function resultParam(): string {
    return PL_ULDK_RESULT_FIELDS.join(',');
}

/** `GetParcelById` URL for a national parcel identifier. */
export function buildUldkByIdUrl(parcelId: string): string {
    return `${PL_ULDK_BASE}?request=GetParcelById&id=${encodeURIComponent(parcelId)}&result=${resultParam()}`;
}

/**
 * `GetParcelByXY` URL for a WGS84 point. ⚠ LONGITUDE FIRST (measured fact 2) — the argument
 * order here is (lat, lon) to match every other provider in this repo, and the swap into the
 * ULDK `xy=` order happens exactly once, HERE.
 */
export function buildUldkByXyUrl(lat: number, lon: number): string {
    return `${PL_ULDK_BASE}?request=GetParcelByXY&xy=${lon},${lat},4326&result=${resultParam()}`;
}

/* ───────────────────────────── the one impure seam ────────────────────── */

/**
 * The classified GET every PL parcel lookup goes through. NEVER throws; classifies from the
 * BODY, not the HTTP status (measured fact 1). Returns the record lines, or a typed refusal.
 */
export async function plUldkGet(
    url: string,
    queryLabel: string,
    deps: PlUldkDeps = {},
): Promise<FetchOutcome<readonly string[]>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.pl.uldkGet',
        async (span): Promise<FetchOutcome<readonly string[]>> => {
            span.setAttribute('pl.query', queryLabel);
            try {
                const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
                if (typeof fetchImpl !== 'function') {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'no-fetch' });
                    return fetchTransient(`endpoint-unreachable: no fetch implementation (${url})`);
                }
                let res: Response;
                try {
                    res = await fetchImpl(url);
                } catch (e) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'network-error' });
                    return fetchTransient(
                        `endpoint-unreachable: ${url} (${e instanceof Error ? e.message : String(e)})`,
                    );
                }
                const body = await res.text().catch(() => '');
                if (!res.ok) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                    return fetchTransient(`upstream-failed: HTTP ${res.status} from ${url}`);
                }
                const lines = body.split(/\r?\n/);
                const status = (lines[0] ?? '').trim();
                if (status === '0') {
                    const records = lines.slice(1).filter((l) => l.trim() !== '');
                    if (records.length === 0) {
                        // Status 0 with no record: the service claims success and served
                        // nothing. That is a service defect, not a coverage fact.
                        span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                        return fetchTransient(`upstream-failed: ULDK status 0 with no record (${queryLabel})`);
                    }
                    span.setStatus({ code: SpanStatusCode.OK });
                    span.setAttribute('pl.records', records.length);
                    return fetchFound(records);
                }
                if (status.startsWith('-1')) {
                    // `-1 brak wyników` is the DURABLE "nothing here" (measured on a nonsense id
                    // and on a Berlin point). Any OTHER -1 message is the service failing, and
                    // it carries the service's own words so the refusal names itself.
                    const message = status.slice(2).trim();
                    if (/brak\s+wynik/i.test(message)) {
                        span.setStatus({ code: SpanStatusCode.OK });
                        return fetchAbsent(`no-parcel: ${queryLabel} — ULDK "${message}"`);
                    }
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                    return fetchTransient(`upstream-failed: ULDK "${status}" (${queryLabel})`);
                }
                // No status token at all — the bad-parameter shape. A misconfiguration must
                // never read as "no data here".
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                return fetchTransient(
                    `upstream-failed: unrecognised ULDK body from ${url} — "${body.slice(0, 120).trim()}"`,
                );
            } finally {
                span.end();
            }
        },
    );
}

function firstParcelOutcome(
    outcome: FetchOutcome<readonly string[]>,
    label: string,
): FetchOutcome<PlCadastralParcel> {
    if (outcome.status !== 'found') return outcome;
    const parsed = parsePlUldkRecord(outcome.value[0]!);
    if (parsed === null) {
        return fetchTransient(`upstream-failed: unparsable ULDK record (${label})`);
    }
    return fetchFound(parsed);
}

/**
 * Resolve a parcel by its national identifier. NEVER throws; a nonsense id, an unreachable
 * endpoint and a bad parameter each come back as their own outcome.
 */
export async function resolvePlParcelById(
    parcelId: string,
    deps: PlUldkDeps = {},
): Promise<FetchOutcome<PlCadastralParcel>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.pl.resolveParcelById',
        async (span): Promise<FetchOutcome<PlCadastralParcel>> => {
            try {
                span.setAttribute('pl.parcelId', parcelId);
                const outcome = await plUldkGet(
                    buildUldkByIdUrl(parcelId),
                    `GetParcelById id=${parcelId}`,
                    deps,
                );
                const result = firstParcelOutcome(outcome, `id=${parcelId}`);
                span.setStatus(
                    result.status === 'transient'
                        ? { code: SpanStatusCode.ERROR, message: result.reason }
                        : { code: SpanStatusCode.OK },
                );
                return result;
            } finally {
                span.end();
            }
        },
    );
}

/** Resolve the parcel at a WGS84 point (the registry click path). See the axis-order note. */
export async function resolvePlParcelAtWgs84Point(
    lat: number,
    lon: number,
    deps: PlUldkDeps = {},
): Promise<FetchOutcome<PlCadastralParcel>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.pl.resolveParcelAtPoint',
        async (span): Promise<FetchOutcome<PlCadastralParcel>> => {
            try {
                span.setAttribute('pl.lat', lat);
                span.setAttribute('pl.lon', lon);
                const outcome = await plUldkGet(
                    buildUldkByXyUrl(lat, lon),
                    `GetParcelByXY @ ${lat.toFixed(6)},${lon.toFixed(6)}`,
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
        },
    );
}
