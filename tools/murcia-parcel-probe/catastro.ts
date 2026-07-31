/**
 * CATASTRO CLIENT — the typed, honest transport layer for the Murcia parcel probe.
 *
 * ── WHY THIS FILE EXISTS SEPARATELY FROM THE PRODUCTION PROXY ────────────────
 * `server/parcelZoningProxy.js` already does the production point→refcat→geometry
 * round trip and it is NATIONAL, not Barcelona-only (see MURCIA-DATA-RECON.md §2).
 * This probe does NOT replace it and MUST NOT diverge from its URL shapes. What it
 * adds is the *recon* surface the production proxy deliberately does not carry:
 * building parts / floor counts, the full candidate ladder, payload validation, and
 * an explicit evidence state on every field.
 *
 * ── FAILURE ≠ ABSENCE (L-422/457/467/469) ────────────────────────────────────
 * Distinct outcomes, NEVER collapsed into "no data":
 *
 *   ok            — 2xx AND the payload validated
 *   http-error    — non-2xx
 *   ows-exception — HTTP 200 carrying an OGC `ExceptionReport`
 *   ovc-error     — HTTP 200 carrying an OVC `<lerr><err>` envelope
 *   truncated     — HTTP 200 whose body does NOT close its root element. A Danish
 *                   bulk endpoint returned 200 with a body cut mid-record on
 *                   2026-07-31; the status code proved nothing. VALIDATE THE
 *                   PAYLOAD, NEVER TRUST THE STATUS CODE.
 *   empty         — 2xx, well-formed, genuinely zero features. This is a REAL
 *                   ANSWER ("this plot is vacant"), not a failure.
 *   timeout / network-error — still distinct from each other and from everything above.
 *
 * ── POLITENESS ───────────────────────────────────────────────────────────────
 * Catastro is a shared public service with undocumented rate limits and a
 * "no massive/tiled downloads" clause. This client SERIALISES every request behind
 * one promise chain, enforces a minimum inter-request gap, sends a real identifying
 * User-Agent, and caches by URL for the process lifetime. There is no concurrency
 * knob, on purpose.
 */

/** Identifies us to the Catastro operators. Not a browser spoof. */
export const USER_AGENT = 'PRYZM-murcia-parcel-probe/1.0 (+pryzmhello@gmail.com)';

/** Minimum gap between two upstream requests. */
export const MIN_REQUEST_GAP_MS = 350;

export const OVC_RCCOOR_ENDPOINT =
    'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_RCCOOR_Distancia';
/** INSPIRE Cadastral Parcels (CP) download service. */
export const WFS_CP_ENDPOINT = 'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx';
/** INSPIRE Buildings (BU) download service. */
export const WFS_BU_ENDPOINT = 'https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx';

export type FetchOutcome =
    | 'ok'
    | 'http-error'
    | 'ows-exception'
    | 'ovc-error'
    | 'truncated'
    | 'empty'
    | 'timeout'
    | 'network-error';

export interface Fetched {
    readonly outcome: FetchOutcome;
    readonly url: string;
    readonly ms: number;
    /** Present whenever a body was received at all, even a truncated or error one. */
    readonly body: string | null;
    readonly httpStatus: number | null;
    /** Verbatim upstream diagnostic (OWS ExceptionText / OVC `<des>`), never paraphrased. */
    readonly message: string | null;
}

export interface ClientOptions {
    readonly timeoutMs?: number;
    /** Injectable for tests; defaults to global fetch. Tests NEVER hit the network. */
    readonly fetchImpl?: typeof fetch;
    readonly onRequest?: (url: string) => void;
    /** Set false to bypass the process cache (repeat live measurements). */
    readonly cache?: boolean;
}

// ── Politeness: one in-flight request at a time, globally ────────────────────
let _chain: Promise<unknown> = Promise.resolve();
let _lastRequestAt = 0;
const _cache = new Map<string, Fetched>();
let _requestCount = 0;

/** Requests actually issued upstream (cache hits excluded). */
export function getRequestCount(): number {
    return _requestCount;
}
export function resetProbeStats(): void {
    _requestCount = 0;
    _cache.clear();
}

function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate that a 200 body is a COMPLETE XML document — its root element is closed,
 * or the root is a self-closing empty element. This is what catches the silently
 * truncated 200 that a status-code check cannot.
 */
export function isCompleteXml(body: string): boolean {
    const trimmed = body.trim();
    if (trimmed.length === 0) return false;
    const withoutProlog = trimmed
        .replace(/<\?[\s\S]*?\?>/g, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<!DOCTYPE[^>]*>/gi, '')
        .trim();
    const open = withoutProlog.match(/^<([\w.-]+(?::[\w.-]+)?)/);
    if (!open || !open[1]) return false;
    const root = open[1];
    if (new RegExp(`^<${escapeRe(root)}\\b[^>]*/>\\s*$`).test(withoutProlog)) return true;
    return new RegExp(`</${escapeRe(root)}\\s*>\\s*$`).test(withoutProlog);
}

/** Extract an OGC `ows:ExceptionText` / `ServiceException`, or null. */
export function readOwsException(body: string): string | null {
    const m =
        body.match(/<(?:[\w.-]+:)?ExceptionText\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?ExceptionText>/i) ??
        body.match(/<(?:[\w.-]+:)?ServiceException\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?ServiceException>/i);
    return m && m[1] ? m[1].trim() : null;
}

/** Extract an OVC `<lerr><err><des>` message, or null. */
export function readOvcError(body: string): string | null {
    if (!/<lerr\b/i.test(body)) return null;
    const des = body.match(/<des\b[^>]*>([\s\S]*?)<\/des>/i);
    const cod = body.match(/<cod\b[^>]*>([\s\S]*?)<\/cod>/i);
    if (!des || !des[1]) return null;
    return cod && cod[1] ? `${cod[1].trim()}: ${des[1].trim()}` : des[1].trim();
}

/** Count GML features regardless of which member wrapper the service chose. */
export function countFeatures(body: string): number {
    const declared = body.match(/numberReturned="(\d+)"/i);
    if (declared && declared[1]) return Number.parseInt(declared[1], 10);
    const members = body.match(/<(?:[\w.-]+:)?(?:featureMember|member)\b/gi);
    return members ? members.length : 0;
}

/** Pure classifier — exported so the outcome discipline is directly testable offline. */
export function classify(
    url: string,
    httpStatus: number,
    ok: boolean,
    body: string,
    ms: number,
): Fetched {
    const base = { url, ms, body, httpStatus } as const;
    if (!ok) return { ...base, outcome: 'http-error', message: `HTTP ${httpStatus}` };

    const ovc = readOvcError(body);
    if (ovc) return { ...base, outcome: 'ovc-error', message: ovc };

    const ows = readOwsException(body);
    if (ows) return { ...base, outcome: 'ows-exception', message: ows };

    // Payload validation BEFORE any success claim — a 200 is not evidence.
    if (!isCompleteXml(body)) {
        return {
            ...base,
            outcome: 'truncated',
            message: `HTTP 200 but the XML root is not closed (${body.length} bytes) — payload invalid despite a success status.`,
        };
    }

    // A well-formed FeatureCollection carrying zero features is a REAL ANSWER.
    if (/FeatureCollection/i.test(body) && countFeatures(body) === 0) {
        return { ...base, outcome: 'empty', message: 'well-formed FeatureCollection with zero features' };
    }
    return { ...base, outcome: 'ok', message: null };
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

/** Fetch one URL, politely and serialised, classifying the result. NEVER throws. */
export async function fetchXml(url: string, opts: ClientOptions = {}): Promise<Fetched> {
    const useCache = opts.cache !== false;
    if (useCache) {
        const hit = _cache.get(url);
        if (hit) return hit;
    }
    const run = async (): Promise<Fetched> => {
        const gap = Date.now() - _lastRequestAt;
        if (gap < MIN_REQUEST_GAP_MS) await sleep(MIN_REQUEST_GAP_MS - gap);
        const t0 = Date.now();
        const f = opts.fetchImpl ?? fetch;
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 45_000);
        opts.onRequest?.(url);
        _requestCount++;
        try {
            const res = await f(url, {
                signal: ac.signal,
                headers: { 'user-agent': USER_AGENT, accept: 'text/xml,application/xml,*/*' },
            });
            const body = await res.text();
            const ms = Date.now() - t0;
            _lastRequestAt = Date.now();
            return classify(url, res.status, res.ok, body, ms);
        } catch (e) {
            const ms = Date.now() - t0;
            _lastRequestAt = Date.now();
            const msg = e instanceof Error ? e.message : String(e);
            return {
                outcome: ac.signal.aborted ? 'timeout' : 'network-error',
                url,
                ms,
                body: null,
                httpStatus: null,
                message: msg,
            };
        } finally {
            clearTimeout(timer);
        }
    };
    const p = _chain.then(run, run);
    _chain = p.catch(() => undefined);
    const result = await p;
    if (useCache) _cache.set(url, result);
    return result;
}

// ── URL builders (the exact shapes verified live 2026-07-31) ─────────────────

export function reverseGeocodeUrl(lat: number, lon: number): string {
    return (
        `${OVC_RCCOOR_ENDPOINT}?SRS=EPSG:4326` +
        `&Coordenada_X=${encodeURIComponent(String(lon))}` +
        `&Coordenada_Y=${encodeURIComponent(String(lat))}`
    );
}

/**
 * ⚠ The parameter is spelled `STOREDQUERIE_ID` — Catastro's own non-standard
 * spelling of the OGC `STOREDQUERY_ID`. Verified live; do not "fix" it. This
 * matches `server/parcelZoningProxy.js` exactly, on purpose.
 */
export function parcelByRefcatUrl(refcat: string, srs = 'EPSG:4326'): string {
    return (
        `${WFS_CP_ENDPOINT}?service=WFS&version=2.0.0&request=GetFeature` +
        `&STOREDQUERIE_ID=GetParcel&REFCAT=${encodeURIComponent(refcat)}&srsName=${srs}`
    );
}

export type BuildingQuery =
    | 'GetBuildingPartByParcel'
    | 'GetBuildingByParcel'
    | 'GetAllConstructionByParcel'
    | 'GetOtherBuildingByParcel';

export function buildingsByRefcatUrl(
    refcat: string,
    query: BuildingQuery = 'GetBuildingPartByParcel',
    srs = 'EPSG:4326',
): string {
    return (
        `${WFS_BU_ENDPOINT}?service=WFS&version=2.0.0&request=GetFeature` +
        `&STOREDQUERIE_ID=${query}&refcat=${encodeURIComponent(refcat)}&srsName=${srs}`
    );
}
