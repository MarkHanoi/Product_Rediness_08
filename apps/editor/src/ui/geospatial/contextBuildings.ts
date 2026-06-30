// MAP-DATA-OVERTURE — keyless context-building footprint loader (OSM / Overpass).
//
// WHY THIS EXISTS
// ---------------
// The founder ratified "Overture + Cesium (free)": the 2D plan + the Cesium Forma
// view must show RICH surrounding buildings so a massing study has proper context
// and shadows (Archistar / Autodesk-Forma style). The base map's own `building`
// source-layer (OpenFreeMap, OpenMapTiles schema) is GENERALIZED and SPARSE — many
// real footprints are missing, and it carries no per-building height we can trust.
//
// DATA-PATH DECISION (honest, keyless-first)
// ------------------------------------------
// Overture Maps ships its Buildings theme as GeoParquet on S3/Azure — NOT
// browser-friendly. There is no official, stable, keyless, CDN-hosted Overture
// vector/PMTiles endpoint a browser can point MapLibre/Cesium at directly today.
// (Community PMTiles builds exist but are unstable planet-scale files, and keyed
// providers were excluded by the "free/keyless" mandate.)
//
// Overture's Buildings theme is LARGELY OSM-DERIVED. So the pragmatic, robust,
// KEYLESS path that still vastly beats OpenFreeMap's sparse coverage is to fetch
// the raw OSM building footprints for the current viewport bbox from the public
// **Overpass API** — keyless, free, global, and it returns the `height` /
// `building:levels` tags we need for extrusion. We convert the Overpass JSON to a
// GeoJSON FeatureCollection that BOTH viewers consume (2D MapLibre `geojson`
// source; 3D Cesium extruded `PolygonGraphics`).
//
// KEYED-OVERTURE UPGRADE (one-line swap)
// --------------------------------------
// When a keyed Overture provider (or a self-hosted Overture PMTiles build) is
// adopted, the ONLY change is to replace `fetchContextBuildings`'s body with a
// fetch of that provider's bbox GeoJSON (or to point a `pmtiles://` source at it
// in the style). The consumers (2D layers + 3D extruder) already speak GeoJSON
// with `{ heightM }` properties, so nothing downstream changes. See OVERTURE_SWAP
// note below.
//
// GUARDS
// ------
// Offline / endpoint down / no features → resolves to an EMPTY FeatureCollection
// (callers then render nothing — today's behaviour) and logs once with a `[gis]`
// prefix. Never throws. A small per-bbox in-memory cache avoids refetching as the
// user pans within the same tile.

/** A building footprint ready for 2D fill + 3D extrusion. */
export interface ContextBuildingFeature {
    readonly type: 'Feature';
    readonly geometry: {
        readonly type: 'Polygon';
        /** GeoJSON ring(s): [ [ [lon,lat], … ] ] — outer ring first. */
        readonly coordinates: number[][][];
    };
    readonly properties: {
        /** Extrusion height in metres (resolved from height / building:levels). */
        readonly heightM: number;
        /** OSM `building:levels` (floor count) when tagged — feeds the population
         *  density proxy with a truthful GFA. Omitted when no levels tag exists. */
        readonly floors?: number;
        /** OSM id (debug / dedupe). */
        readonly osmId: number;
    };
}

export interface ContextBuildingCollection {
    readonly type: 'FeatureCollection';
    readonly features: ContextBuildingFeature[];
}

/** A lon/lat bounding box `[west, south, east, north]`. */
export type Bbox = readonly [number, number, number, number];

/**
 * Public Overpass endpoint (keyless). Mirror list — we try them in order so a
 * single mirror being down doesn't kill context buildings. All keyless + CORS-
 * enabled. Overture-keyed swap: replace the whole `fetchContextBuildings` body.
 */
export const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    // §A.21.D-GLOBE2 (2026-06-05) — extra keyless CORS mirrors so heavy testing that
    // rate-limits (429) the primary still gets context buildings from a fallback.
    'https://overpass.private.coffee/api/interpreter',
    // §SITE-METRIC-OVERPASS-PARALLEL (2026-06-29) — `overpass.osm.jp` REMOVED: its TLS
    // cert is `ERR_CERT_COMMON_NAME_INVALID`, so it could never succeed and only added a
    // guaranteed-failed leg to the cascade.
] as const;

/** The origin(s) that must appear in the server CSP `connect-src` for fetch. */
export const OVERPASS_ORIGINS = [
    'https://overpass-api.de',
    'https://overpass.kumi.systems',
    'https://overpass.private.coffee',
] as const;

/** Assumed storey height (m) when only `building:levels` is known. ~3.2 m is a
 *  typical mixed residential/commercial floor-to-floor (founder 2026-06-28). */
const METRES_PER_LEVEL = 3.2;
/** Fallback height (m) for a footprint with no height/levels tag at all. */
const DEFAULT_BUILDING_HEIGHT_M = 9;
/** Clamp so a stray bad tag can't produce a skyscraper or a zero-height sliver. */
const MIN_HEIGHT_M = 2.5;
const MAX_HEIGHT_M = 400;

/**
 * Half-extent (degrees) of the bbox we fetch around the site centre.
 *
 * §A.21.D43(b) — widened 0.005 → 0.0125 (~±550 m → ~±1.4 km) so the Forma context
 * reads as a real surrounding NEIGHBOURHOOD instead of a small square of immediate
 * neighbours (founder: "context dataset too small").
 *
 * §A.21.D54 (2026-06-08) — REGRESSION FIX: the 0.0125° (~2.8 km) tile over a DENSE
 * urban site returns several thousand `out geom` footprints — a multi-MB Overpass
 * response that routinely exceeded the 9 s client timeout (and brushed the public
 * endpoints' rate limits), so EVERY mirror aborted, `fetchContextBuildings`
 * degraded to an EMPTY collection, and the Forma context "stopped rendering" (the
 * never-throw swallowed it silently). We dial the primary half-extent back to
 * 0.008° (~±900 m, ~1.8 km square — still ≈2.5× the original AREA, a proper
 * neighbourhood) which reliably returns inside the timeout, AND add an automatic
 * narrow fallback to `CONTEXT_BBOX_FALLBACK_HALF_DEG` (the prior 0.005°) when the
 * wide fetch comes back empty — so a too-big/timed-out wide tile still yields the
 * immediate neighbours instead of nothing. The bbox values feed `bboxKey`
 * (toFixed(4)) so each extent is simply its OWN cache key; the 7-day localStorage
 * TTL + 4-mirror fallback are unchanged (old wider-bbox entries just age out).
 */
export const CONTEXT_BBOX_HALF_DEG = 0.008;

/**
 * §A.21.D54 — narrow fallback half-extent (the pre-D43 0.005°, ~±550 m). Used
 * automatically when the primary (wider) fetch returns EMPTY — typically because a
 * dense urban wide tile timed out — so the Forma study still gets its immediate
 * context buildings rather than a bare ground plane.
 */
export const CONTEXT_BBOX_FALLBACK_HALF_DEG = 0.005;

/**
 * Overpass request timeout (ms).
 *
 * §SITE-METRIC-OVERPASS-PARALLEL (2026-06-29) — dropped 20 s → 9 s. The mirrors now
 * RACE in PARALLEL (`Promise.any`) instead of running serially, so the timeout is a
 * per-mirror cap on a SINGLE concurrent round, not a cost paid N times in sequence.
 * The old 20 s × 4-mirror serial cascade was ~60–80 s worst-case before success;
 * racing means the FASTEST live mirror wins in seconds and a slow/dead one no longer
 * delays the others. 9 s still lets a legitimately large urban tile return.
 */
export const OVERPASS_TIMEOUT_MS = 9000;

/**
 * §OVERPASS-GENTLE-MIRRORS (ADR-0087, 2026-06-30) — back-off + concurrency control.
 *
 * WHY: §SITE-METRIC-OVERPASS-PARALLEL raced ALL building mirrors at once
 * (`Promise.any`). Combined with the roads + water fetches (which each ALSO start
 * with `overpass-api.de`) for the same view, the primary mirror received a burst
 * of near-simultaneous POSTs that tripped its rate limiter → `429 Too Many
 * Requests` → all mirrors failed → "context buildings unavailable". This looks
 * like abuse to the public endpoints.
 *
 * FIX: (a) try mirrors with LIMITED CONCURRENCY + a small stagger instead of an
 * all-at-once blast; (b) treat a 429 (or a Retry-After) as a BACK-OFF signal —
 * the offending mirror is skipped for a cooldown window; (c) the cooldown
 * registry is EXPORTED so the roads/water loaders can honour it too (a 429 on the
 * shared primary mirror should pause it for every consumer, not just buildings).
 */
/** How many mirrors may be in-flight at once for ONE bbox fetch. 2 keeps a fast
 *  result (a slow primary doesn't block a healthy secondary) without bursting all
 *  mirrors simultaneously the way `Promise.any` did. */
export const OVERPASS_MAX_CONCURRENCY = 2;
/** Stagger (ms) between launching successive mirror attempts, so two mirrors are
 *  never hit on the exact same tick and a quick winner can cancel the laggards. */
export const OVERPASS_STAGGER_MS = 350;
/** Cooldown (ms) a mirror is skipped after it returns 429 / signals back-off.
 *  Used as the FLOOR when the server sends no `Retry-After`. */
export const OVERPASS_RATE_LIMIT_COOLDOWN_MS = 60_000;

/** §OVERPASS-GENTLE-MIRRORS — per-mirror "skip until" epoch-ms. A mirror with a
 *  future timestamp here is rate-limited and is not contacted until it expires. */
const mirrorCooldownUntil = new Map<string, number>();

/**
 * §OVERPASS-GENTLE-MIRRORS — is `endpoint` currently in a rate-limit cooldown?
 * Exported so the roads/water Overpass loaders can skip a mirror that buildings
 * (or they) already saw 429 from, instead of re-hammering it. NEVER throws.
 */
export function isOverpassMirrorCoolingDown(endpoint: string, now: number = Date.now()): boolean {
    const until = mirrorCooldownUntil.get(endpoint);
    return until !== undefined && until > now;
}

/**
 * §OVERPASS-GENTLE-MIRRORS — record that `endpoint` rate-limited us, so it is
 * skipped for a cooldown. `retryAfterSeconds` (from a 429 `Retry-After` header)
 * extends the cooldown when the server asks for longer. Exported so every
 * Overpass consumer shares ONE back-off view of the public mirrors. NEVER throws.
 */
export function noteOverpassMirrorRateLimited(
    endpoint: string,
    retryAfterSeconds?: number,
    now: number = Date.now(),
): void {
    const fromHeader = Number.isFinite(retryAfterSeconds) && (retryAfterSeconds as number) > 0
        ? (retryAfterSeconds as number) * 1000
        : 0;
    const cooldown = Math.max(OVERPASS_RATE_LIMIT_COOLDOWN_MS, fromHeader);
    mirrorCooldownUntil.set(endpoint, now + cooldown);
}

/** Test/diagnostic helper — clear all mirror cooldowns. */
export function clearOverpassMirrorCooldowns(): void {
    mirrorCooldownUntil.clear();
}

/** Parse a `Retry-After` response header (seconds, or an HTTP-date) → seconds. */
function parseRetryAfterSeconds(res: Response): number | undefined {
    const raw = res.headers.get('retry-after');
    if (!raw) return undefined;
    const asNum = Number(raw);
    if (Number.isFinite(asNum)) return asNum;
    const asDate = Date.parse(raw);
    if (Number.isFinite(asDate)) return Math.max(0, Math.round((asDate - Date.now()) / 1000));
    return undefined;
}

/** Small awaitable delay used to stagger mirror launches. Resolves early if the
 *  caller's signal aborts so a cancelled fetch doesn't sit in a timer. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve) => {
        if (ms <= 0 || signal?.aborted) { resolve(); return; }
        const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
        const onAbort = (): void => { clearTimeout(t); resolve(); };
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}

/** Per-bbox-key cache so panning within a tile doesn't refetch. */
const cache = new Map<string, ContextBuildingCollection>();
/** §SITE-METRIC-OVERPASS-PARALLEL — per-bbox IN-FLIGHT promise cache. Re-entering the
 *  view (or two consumers — 3D + 2D context) for the SAME bbox while a fetch is still
 *  running shares the ONE pending request instead of firing a second mirror race. */
const inFlight = new Map<string, Promise<ContextBuildingCollection>>();
/** One-time "context buildings unavailable" warning guard. */
let warnedOnce = false;

/** Build a stable cache key from a bbox rounded to the fetch grid. */
function bboxKey(bbox: Bbox): string {
    return bbox.map((n) => n.toFixed(4)).join(',');
}

// §A.21.D-GLOBE2 — PERSISTENT cache (localStorage). The in-memory `cache` is lost on
// every reload / new project, so repeated testing re-fetches the SAME bbox and
// exhausts the public Overpass rate limit (founder: context buildings vanished after
// many generations). Persisting footprints for 7 days means a re-visited site loads
// instantly + offline, with zero Overpass calls. Best-effort: quota / private-mode
// failures are swallowed.
const LS_PREFIX = 'pryzm:ctxbld:';
const LS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function lsRead(key: string): ContextBuildingCollection | null {
    try {
        const raw = globalThis.localStorage?.getItem(LS_PREFIX + key);
        if (!raw) return null;
        const o = JSON.parse(raw) as { t: number; c: ContextBuildingCollection };
        if (!o || typeof o.t !== 'number' || (Date.now() - o.t) > LS_TTL_MS) return null;
        return o.c;
    } catch { return null; }
}

function lsWrite(key: string, c: ContextBuildingCollection): void {
    try {
        globalThis.localStorage?.setItem(LS_PREFIX + key, JSON.stringify({ t: Date.now(), c }));
    } catch { /* quota / unavailable — non-fatal */ }
}

/**
 * Compute the fetch bbox `[w,s,e,n]` centred on a site lat/lon.
 *
 * §A.21.D54 — `halfDeg` defaults to the primary `CONTEXT_BBOX_HALF_DEG`; the
 * empty-result fallback passes `CONTEXT_BBOX_FALLBACK_HALF_DEG` for a narrower,
 * always-cheap retry.
 */
export function contextBboxAround(
    lat: number,
    lon: number,
    halfDeg: number = CONTEXT_BBOX_HALF_DEG,
): Bbox {
    const h = halfDeg;
    // Widen E/W a touch by latitude so the metric extent is roughly square.
    const lonScale = 1 / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    return [lon - h * lonScale, lat - h, lon + h * lonScale, lat + h];
}

/** Resolve an extrusion height (m) from OSM tags. Prefers the explicit `height`
 *  (+ `roof:height` when both are tagged), else `building:levels` × storey height,
 *  else a sensible default. Accuracy refinement (founder 2026-06-28). */
function resolveHeight(tags: Record<string, string> | undefined): number {
    if (tags) {
        const h = parseFloat(tags['height'] ?? tags['building:height'] ?? '');
        if (Number.isFinite(h) && h > 0) {
            // `height` is usually the TOTAL height; only add `roof:height` when the
            // tagged height is explicitly the wall/eave height (rare). Keep it simple
            // + robust: prefer `height` as-is, which is what most mappers intend.
            return clampHeight(h);
        }
        const lvl = parseFloat(tags['building:levels'] ?? tags['levels'] ?? '');
        if (Number.isFinite(lvl) && lvl > 0) {
            const roof = parseFloat(tags['roof:height'] ?? '');
            const roofAdd = Number.isFinite(roof) && roof > 0 ? roof : 0;
            return clampHeight(lvl * METRES_PER_LEVEL + roofAdd);
        }
    }
    return DEFAULT_BUILDING_HEIGHT_M;
}

/** OSM `building:levels` (floor count) when tagged, else undefined. Feeds the
 *  population-density GFA proxy with a truthful storey count. */
function resolveFloors(tags: Record<string, string> | undefined): number | undefined {
    if (!tags) return undefined;
    const lvl = parseFloat(tags['building:levels'] ?? tags['levels'] ?? '');
    if (Number.isFinite(lvl) && lvl >= 1 && lvl <= 200) return Math.round(lvl);
    return undefined;
}

function clampHeight(h: number): number {
    return Math.min(MAX_HEIGHT_M, Math.max(MIN_HEIGHT_M, h));
}

/** The Overpass QL query for all building footprints in a bbox (geometry inline). */
function overpassQuery(bbox: Bbox): string {
    const [w, s, e, n] = bbox;
    const b = `${s},${w},${n},${e}`; // Overpass bbox order = south,west,north,east
    return (
        `[out:json][timeout:25];` +
        `(way["building"](${b});relation["building"]["type"="multipolygon"](${b}););` +
        `out geom;`
    );
}

/**
 * Minimal shape of the Overpass `out geom` JSON we read. `way` elements carry an
 * inline `geometry` array of {lat,lon}; multipolygon relations carry `members`
 * each with their own `geometry`. We only render the outer rings (good enough for
 * context massing — holes are cosmetic at this scale).
 */
interface OverpassElement {
    type: 'way' | 'relation' | 'node';
    id: number;
    tags?: Record<string, string>;
    geometry?: Array<{ lat: number; lon: number }>;
    members?: Array<{
        type: string;
        role?: string;
        geometry?: Array<{ lat: number; lon: number }>;
    }>;
}

/** Convert an Overpass response to our GeoJSON FeatureCollection (outer rings). */
function overpassToCollection(elements: OverpassElement[]): ContextBuildingCollection {
    const features: ContextBuildingFeature[] = [];
    const push = (
        geom: Array<{ lat: number; lon: number }> | undefined,
        tags: Record<string, string> | undefined,
        id: number,
    ): void => {
        if (!geom || geom.length < 4) return; // need a closed ring (≥3 pts + close)
        const ring = geom.map((p) => [p.lon, p.lat] as [number, number]);
        // Ensure the ring is closed.
        const first = ring[0]!;
        const last = ring[ring.length - 1]!;
        if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
        const floors = resolveFloors(tags);
        features.push({
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [ring] },
            properties: {
                heightM: resolveHeight(tags),
                osmId: id,
                ...(floors !== undefined ? { floors } : {}),
            },
        });
    };

    for (const el of elements) {
        if (el.type === 'way') {
            push(el.geometry, el.tags, el.id);
        } else if (el.type === 'relation' && el.members) {
            for (const m of el.members) {
                if (m.role === 'outer') push(m.geometry, el.tags, el.id);
            }
        }
    }
    return { type: 'FeatureCollection', features };
}

/** An empty collection — the resting / fallback state. */
export function emptyContextCollection(): ContextBuildingCollection {
    return { type: 'FeatureCollection', features: [] };
}

/**
 * Fetch context building footprints for the bbox around `lat,lon` (keyless OSM via
 * Overpass). Cached per bbox. NEVER throws — on any failure (offline, endpoint
 * down, abort, no features) resolves to an EMPTY collection and logs once. The
 * `signal` lets a caller cancel an in-flight fetch on dispose / location change.
 *
 * OVERTURE_SWAP: to upgrade to a keyed Overture provider, replace the fetch loop
 * below with a single `fetch(overtureProviderUrl(bbox))` that returns GeoJSON, map
 * its height field to `properties.heightM`, and keep the rest of this module + both
 * consumers unchanged.
 */
export async function fetchContextBuildings(
    lat: number,
    lon: number,
    signal?: AbortSignal,
): Promise<ContextBuildingCollection> {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
        return emptyContextCollection();
    }
    // §A.21.D54 — try the primary (wider neighbourhood) bbox first; if it comes back
    // EMPTY (dense urban tile timed out, mirror rate-limited, or genuinely sparse)
    // retry once at the narrower fallback extent so the Forma study still gets the
    // immediate context rather than nothing. The narrow retry is cheap + has its own
    // cache key, so a re-visit hits the cache directly.
    const primary = await fetchForBbox(contextBboxAround(lat, lon, CONTEXT_BBOX_HALF_DEG), signal);
    if (primary.features.length > 0 || signal?.aborted) return primary;

    console.warn(
        '[gis] context buildings: wide bbox returned 0 footprints — retrying the ' +
            'narrower fallback extent (the immediate neighbourhood).',
    );
    return fetchForBbox(contextBboxAround(lat, lon, CONTEXT_BBOX_FALLBACK_HALF_DEG), signal);
}

/**
 * §A.21.D54 — fetch + cache the building footprints for ONE explicit bbox (keyless
 * OSM via Overpass, mirror-fallback). Extracted from `fetchContextBuildings` so the
 * primary + narrow-fallback extents share the same fetch/cache/never-throw path.
 * NEVER throws — any failure resolves to an EMPTY collection.
 */
async function fetchForBbox(bbox: Bbox, signal?: AbortSignal): Promise<ContextBuildingCollection> {
    const key = bboxKey(bbox);
    const cached = cache.get(key);
    if (cached) return cached;
    // §A.21.D-GLOBE2 — persistent cache hit (survives reload / new project), so a
    // re-visited site loads its context buildings without another Overpass call.
    const persisted = lsRead(key);
    if (persisted) { cache.set(key, persisted); return persisted; }
    // §SITE-METRIC-OVERPASS-PARALLEL — a fetch for THIS bbox is already racing; share it.
    const pending = inFlight.get(key);
    if (pending) return pending;

    const p = raceMirrors(bbox, key, signal).finally(() => { inFlight.delete(key); });
    inFlight.set(key, p);
    return p;
}

/**
 * §OVERPASS-GENTLE-MIRRORS (ADR-0087, 2026-06-30) — fetch a usable response from
 * the Overpass mirrors with LIMITED CONCURRENCY + STAGGER + 429 back-off, instead
 * of the prior `Promise.any` all-at-once blast that tripped the public endpoints'
 * rate limiter (`429 Too Many Requests`) and degraded buildings to empty.
 *
 * Strategy: walk the mirror list, SKIPPING any that are in a 429 cooldown, and
 * keep at most `OVERPASS_MAX_CONCURRENCY` attempts in flight, launched
 * `OVERPASS_STAGGER_MS` apart. The FIRST mirror that returns a usable collection
 * wins and aborts the still-running laggards; a 429 marks that mirror as cooling
 * down (honouring `Retry-After`) so it is not re-hit. Each attempt has its own
 * timeout and honours the caller's abort signal. NEVER throws — all-fail (or all
 * cooling down) degrades to an empty collection.
 */
async function raceMirrors(
    bbox: Bbox,
    key: string,
    signal?: AbortSignal,
): Promise<ContextBuildingCollection> {
    const body = 'data=' + encodeURIComponent(overpassQuery(bbox));

    // A single mirror attempt. Resolves with a usable collection, or null on any
    // failure (timeout / HTTP / parse / 429) so the orchestrator can move on.
    const attempt = async (endpoint: string, attemptSignal: AbortSignal): Promise<ContextBuildingCollection | null> => {
        const ctrl = new AbortController();
        // §GIS-ABORT-REASON — explicit reasons so the console reads "Overpass timeout"
        // not the alarming "signal is aborted without reason" (mirrors are routinely
        // slow / rate-limited; this is a NON-FATAL graceful-degrade).
        const timer = setTimeout(
            () => ctrl.abort(new DOMException(`Overpass timeout after ${OVERPASS_TIMEOUT_MS}ms (mirror slow/rate-limited)`, 'TimeoutError')),
            OVERPASS_TIMEOUT_MS,
        );
        // Abort this attempt when EITHER the caller cancels OR a sibling mirror won.
        const onAbort = (): void => ctrl.abort(new DOMException('superseded / caller cancelled', 'AbortError'));
        attemptSignal.addEventListener('abort', onAbort, { once: true });
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body,
                signal: ctrl.signal,
            });
            if (res.status === 429) {
                // §OVERPASS-GENTLE-MIRRORS — back-off signal: skip this mirror for a
                // cooldown (shared with roads/water) so we stop hammering it.
                const retryAfter = parseRetryAfterSeconds(res);
                noteOverpassMirrorRateLimited(endpoint, retryAfter);
                console.warn(
                    `[gis] context buildings: ${endpoint} HTTP 429 (Too Many Requests) — ` +
                        `backing off this mirror for ${Math.round((mirrorCooldownUntil.get(endpoint)! - Date.now()) / 1000)}s.`,
                );
                return null;
            }
            if (!res.ok) {
                console.warn(`[gis] context buildings: ${endpoint} HTTP ${res.status} — skipping this mirror.`);
                return null;
            }
            const json = (await res.json()) as { elements?: OverpassElement[] };
            return overpassToCollection(json.elements ?? []);
        } catch {
            return null; // timeout / network / abort — non-fatal, try the next mirror
        } finally {
            clearTimeout(timer);
            attemptSignal.removeEventListener('abort', onAbort);
        }
    };

    // Only contact mirrors not currently in a 429 cooldown.
    const candidates = OVERPASS_ENDPOINTS.filter((e) => !isOverpassMirrorCoolingDown(e));
    if (candidates.length === 0) {
        if (!warnedOnce) {
            warnedOnce = true;
            console.warn(
                '[gis] context buildings: all Overpass mirrors are in a rate-limit cooldown — ' +
                    'rendering without surrounding context. This is non-fatal.',
            );
        }
        return emptyContextCollection();
    }

    // §OVERPASS-GENTLE-MIRRORS — staggered, bounded-concurrency orchestration. We
    // launch attempts in order, at most OVERPASS_MAX_CONCURRENCY at a time, each
    // OVERPASS_STAGGER_MS after the previous, and resolve on the FIRST usable
    // collection (aborting the rest via `winAbort`). If a slot frees up before a
    // winner, the next candidate launches — so a dead mirror doesn't strand us.
    const winAbort = new AbortController();
    const linkCaller = (): void => winAbort.abort(new DOMException('caller cancelled (view/location change)', 'AbortError'));
    signal?.addEventListener('abort', linkCaller, { once: true });

    try {
        let next = 0;
        const inFlightAttempts = new Set<Promise<{ endpoint: string; result: ContextBuildingCollection | null }>>();

        const launch = (endpoint: string): void => {
            const pr = attempt(endpoint, winAbort.signal).then((result) => ({ endpoint, result }));
            inFlightAttempts.add(pr);
            void pr.finally(() => inFlightAttempts.delete(pr));
        };

        // Prime up to MAX_CONCURRENCY, staggered.
        while (next < candidates.length && inFlightAttempts.size < OVERPASS_MAX_CONCURRENCY) {
            if (inFlightAttempts.size > 0) await delay(OVERPASS_STAGGER_MS, winAbort.signal);
            if (winAbort.signal.aborted) break;
            launch(candidates[next++]);
        }

        let winner: ContextBuildingCollection | null = null;
        while (inFlightAttempts.size > 0 && !winAbort.signal.aborted) {
            const { result } = await Promise.race(inFlightAttempts);
            if (result) { winner = result; break; }
            // That attempt failed — top up the in-flight set from remaining candidates.
            if (next < candidates.length) {
                if (winAbort.signal.aborted) break;
                launch(candidates[next++]);
            }
        }

        // Stop any laggards now that we have a winner (or ran out).
        if (!winAbort.signal.aborted) winAbort.abort(new DOMException('winner found / mirrors exhausted', 'AbortError'));

        if (signal?.aborted) return emptyContextCollection();
        if (winner) {
            cache.set(key, winner);
            if (winner.features.length > 0) lsWrite(key, winner); // persist non-empty
            console.log(
                `[gis] context buildings: ${winner.features.length} OSM footprint(s) ` +
                    `for bbox ${key} (gentle mirror fetch, ≤${OVERPASS_MAX_CONCURRENCY} concurrent).`,
            );
            return winner;
        }

        // Every contacted mirror failed (or got 429'd).
        if (!warnedOnce) {
            warnedOnce = true;
            console.warn(
                '[gis] context buildings unavailable (all Overpass mirrors failed/offline/rate-limited) — ' +
                    'rendering without surrounding context. This is non-fatal.',
            );
        }
        return emptyContextCollection();
    } finally {
        signal?.removeEventListener('abort', linkCaller);
    }
}

/** Test/diagnostic helper — clears the per-bbox cache (memory + in-flight) and
 *  the §OVERPASS-GENTLE-MIRRORS rate-limit cooldowns. */
export function clearContextBuildingCache(): void {
    cache.clear();
    inFlight.clear();
    clearOverpassMirrorCooldowns();
}
