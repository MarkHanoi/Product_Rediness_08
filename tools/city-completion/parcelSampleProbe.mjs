#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// C63 AXIS 1 (PARCEL) — THE LIVE SAMPLER. The measurement `computeParcelConfidence` has always
// been waiting for (its own docstring: "the network sampling … is the caller's Phase-4 move, not
// fabricated here"). This file IS that caller.
//
// WHAT IT MEASURES, AND AGAINST WHICH DENOMINATOR (L-656, founder 2026-07-31)
// ---------------------------------------------------------------------------
// The PARCEL denominator is **land where building is legally possible — private buildable land**,
// NOT all municipal land and NOT all clicks (MASTER-ROI-TRACKER §0.5.2). So this tool draws TWO
// INDEPENDENT SAMPLES per city and NEVER blends them:
//
//   • `buildable` — the AXIS sample. Points drawn uniformly BY AREA over an INDEPENDENT
//     buildable-land proxy: OSM non-public BUILDING-FOOTPRINT area inside the city's canonical
//     region bbox. Independent of the cadastre we are grading (§probe-can-be-wrong-three-ways:
//     never let the system under test define its own denominator). This sample scores the axis.
//   • `allclicks` — the CLICK-COVERAGE sample. Points drawn uniformly BY AREA over the whole
//     region bbox, water/parks/periphery included. This answers "what does a random user see?"
//     and MUST NOT be reported as the axis score.
//
// ⚠ THE PROXY IS NOT THE LEGAL DENOMINATOR. OSM building-footprint area is a CONSERVATIVE,
// cheap, cross-city-uniform stand-in for private buildable land: it under-counts (vacant
// buildable plots, gardens, setbacks carry no footprint) and it is footprint-area-weighted, not
// land-area-weighted. It is NOT the AMB `qualificacio_refos` census that measured Barcelona's
// 31,801,618 m² / 27.1 %. The two numbers answer different questions and must never be swapped.
//
// WHY TWO-STAGE (TILES → FOOTPRINTS) IS UNBIASED FOR AREA
// -------------------------------------------------------
// Downloading every building in a city bbox from Overpass is not polite and not necessary. So:
//   stage 1 — draw T tiles UNIFORMLY AT RANDOM over the region bbox (equal inclusion probability);
//   stage 2 — inside the union of those tiles, draw points with probability PROPORTIONAL TO
//             FOOTPRINT AREA (PPS).
// Equal-probability stage 1 × area-proportional stage 2 ⇒ every unit of footprint area in the city
// has the SAME inclusion probability, so the estimator is unbiased FOR AREA. (A regular lattice
// over parcels would estimate PARCEL COUNT, not area — Barcelona's own coverage plan says so.)
// The tile draw is SEEDED, so a re-run is reproducible and diffable.
//
// §CONTEXT-DATA-HONESTY — THE THREE OUTCOMES ARE THREE DIFFERENT VALUES
// ---------------------------------------------------------------------
//   `ok`     — the wired cadastre returned a real parcel ⇒ tiered high/medium/low by the C57
//              categorical rule (`apps/editor/.../parcelConfidence.ts`), reproduced verbatim below.
//   `none`   — the service answered correctly and there is genuinely NO parcel here. A MEASURED
//              ABSENCE. It scores 0 and STAYS IN the denominator: that is a real coverage gap.
//   FAILURE  — http-error / ows-exception / truncated / timeout / network-error. A claim about OUR
//              NETWORK, not about the data. EXCLUDED from the denominator entirely and reported as
//              a failure count. A failed probe must NEVER become a low score (L-422/457/467/469).
// A city whose provider is DOWN therefore reports `not-assessed` + the failure, never a bad score.
//
// POLITENESS — every upstream is a shared public service (Catastro publishes a "no massive/tiled
// download" clause). One in-flight request at a time, a minimum inter-request gap, a real
// identifying User-Agent, no concurrency knob, on purpose. Mirrors tools/murcia-parcel-probe.
//
// LAYERING — a build/inspection tool, NOT a layered package, so (exactly as the sibling
// `computeScorecard.mjs` and the `tools/context-bake/*` tools state in their own headers) its
// exports take NO OpenTelemetry span: P8 governs layered package exports, and a span here would
// need a tracer this tool has no runtime to obtain. The PRODUCTION parcel path
// (`resolveParcelWithFallback`) does carry its span.
//
// USAGE
//   node parcelSampleProbe.mjs --city barcelona                 # one city
//   node parcelSampleProbe.mjs --all --n 120 --n-allclicks 60   # the whole board
//   node parcelSampleProbe.mjs --city paris --out samples/      # write <city>.parcel-sample.json
// ─────────────────────────────────────────────────────────────────────────────
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Identifies us to every operator we call. Not a browser spoof. */
export const USER_AGENT = 'PRYZM-city-completion-parcel-probe/1.0 (+pryzmhello@gmail.com)';
/** Minimum gap between two upstream requests, globally (politeness, not a perf knob). */
export const MIN_REQUEST_GAP_MS = 320;
/** The sampler's provenance stamp version — bump when the SAMPLING DESIGN changes. */
export const PARCEL_SAMPLE_VERSION = '1.0';

// ─────────────────────────────────────────────────────────────────────────────
// CITY BOARD — bbox + regionKey read from the SAME canonical state the scorecard reads
// (`tools/context-bake/terrain.mjs` REGIONS). Never a hand-invented extent.
// `provider`/`kind` mirror `packages/site-parcel-data/src/parcelProviders/registry.ts` — the
// registry stays the source of truth for ROUTING; this table only says which adapter to call.
// ─────────────────────────────────────────────────────────────────────────────
export const CITY_BOARD = [
    {
        city: 'barcelona', jurisdictionId: 'es-ct-08019-barcelona', cc: 'es', regionKey: 'barcelona',
        bbox: [2.09, 41.32, 2.23, 41.47], adapter: 'catastro', providerId: 'catastro', kind: 'cadastral',
    },
    {
        city: 'madrid', jurisdictionId: 'es-md-28079-madrid', cc: 'es', regionKey: 'madrid',
        bbox: [-3.80, 40.33, -3.58, 40.52], adapter: 'catastro', providerId: 'catastro', kind: 'cadastral',
    },
    {
        city: 'murcia', jurisdictionId: 'es-mc-30030-murcia', cc: 'es', regionKey: 'murcia',
        bbox: [-1.2007, 37.9322, -1.0607, 38.0522], adapter: 'catastro', providerId: 'catastro', kind: 'cadastral',
    },
    {
        // L-662: Córdoba was the ONE of the four verdict cities absent from this board, so
        // `--all` silently reported three of four and the fourth could not be scored at all.
        // bbox is the canonical `tools/context-bake/terrain.mjs` REGIONS row — never re-invented.
        city: 'cordoba', jurisdictionId: 'es-an-14021-cordoba', cc: 'es', regionKey: 'cordoba',
        bbox: [-4.85, 37.84, -4.72, 37.94], adapter: 'catastro', providerId: 'catastro', kind: 'cadastral',
    },
    {
        city: 'paris', jurisdictionId: 'fr-idf-75056-paris', cc: 'fr', regionKey: 'paris',
        bbox: [2.22, 48.80, 2.47, 48.91], adapter: 'ign-fr', providerId: 'ign-fr', kind: 'cadastral',
    },
    {
        city: 'amsterdam', jurisdictionId: 'nl-nh-0363-amsterdam', cc: 'nl', regionKey: 'amsterdam',
        bbox: [4.83, 52.34, 4.97, 52.42], adapter: 'pdok-nl', providerId: 'pdok-nl', kind: 'cadastral',
    },
    {
        city: 'oslo', jurisdictionId: 'no-03-0301-oslo', cc: 'no', regionKey: 'oslo',
        bbox: [10.66, 59.88, 10.83, 59.96], adapter: 'geonorge-no', providerId: 'geonorge-no', kind: 'cadastral',
    },
    {
        city: 'zurich', jurisdictionId: 'ch-zh-0261-zurich', cc: 'ch', regionKey: 'zurich',
        bbox: [8.45, 47.34, 8.62, 47.43], adapter: 'swisstopo-av', providerId: 'swisstopo-av', kind: 'cadastral',
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// SEEDED PRNG — a re-run with the same seed draws the SAME points, so two measurements are
// diffable and a surprising number can be re-probed at the identical coordinates.
// ─────────────────────────────────────────────────────────────────────────────
export function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// PURE GEOMETRY — the same rules the production C57 path uses, reproduced so the tool grades by
// the SHIPPED definition rather than a second, drifting one.
// ─────────────────────────────────────────────────────────────────────────────

/** Ray-casting point-in-ring (WGS84 lat/lon; planar-good at parcel scale). Mirrors `parcelConfidence.pointInRing`. */
export function pointInRing(lat, lon, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j];
        const intersect = (a.lat > lat) !== (b.lat > lat) &&
            lon < ((b.lon - a.lon) * (lat - a.lat)) / ((b.lat - a.lat) || 1e-12) + a.lon;
        if (intersect) inside = !inside;
    }
    return inside;
}

/** Shoelace area in m² of a WGS84 lat/lon ring, via a local equirectangular projection. */
export function ringAreaM2(ring) {
    if (!ring || ring.length < 3) return 0;
    const lat0 = ring.reduce((s, p) => s + p.lat, 0) / ring.length;
    const mPerDegLat = 111132.92 - 559.82 * Math.cos(2 * lat0 * Math.PI / 180);
    const mPerDegLon = 111412.84 * Math.cos(lat0 * Math.PI / 180);
    let acc = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i].lon * mPerDegLon, yi = ring[i].lat * mPerDegLat;
        const xj = ring[j].lon * mPerDegLon, yj = ring[j].lat * mPerDegLat;
        acc += xj * yi - xi * yj;
    }
    return Math.abs(acc) / 2;
}

/** The C57 `isGeometryComplete` fact: closeable ring, ≥3 distinct vertices, non-degenerate area. */
export function isGeometryComplete(ring, areaSigM2) {
    if (!ring || ring.length < 3) return false;
    const distinct = new Set(ring.map((p) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`));
    return distinct.size >= 3 && areaSigM2 > 0;
}

/**
 * The C57 CATEGORICAL tier — copied from `apps/editor/src/ui/site/parcel/parcelConfidence.ts`:
 *   low    ⇔ footprint-fallback OR geometry incomplete
 *   high   ⇔ cadastral AND geometryComplete AND an OFFICIAL registry area is published AND the
 *            click landed inside the ring
 *   medium ⇔ a real cadastral polygon missing one corroborator
 * No metres-cutoff, no invented numeric threshold — the same honesty gate the product ships.
 */
export function matchTier({ kind, geometryComplete, areaOfficialM2, clickInside }) {
    if (kind === 'footprint-fallback' || !geometryComplete) return 'low';
    if (areaOfficialM2 != null && clickInside) return 'high';
    return 'medium';
}

// ─────────────────────────────────────────────────────────────────────────────
// POLITE TRANSPORT — one in-flight request at a time, globally. NEVER throws; every failure mode
// stays a DISTINCT value (the murcia-parcel-probe outcome discipline).
// ─────────────────────────────────────────────────────────────────────────────
let _chain = Promise.resolve();
let _lastRequestAt = 0;
let _requestCount = 0;
export function getRequestCount() { return _requestCount; }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET one URL politely. Returns `{ outcome, status, body, ms, message }`; NEVER throws. */
export async function politeGet(url, { timeoutMs = 45_000, accept = '*/*' } = {}) {
    const run = async () => {
        const gap = Date.now() - _lastRequestAt;
        if (gap < MIN_REQUEST_GAP_MS) await sleep(MIN_REQUEST_GAP_MS - gap);
        const t0 = Date.now();
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), timeoutMs);
        _requestCount++;
        try {
            const res = await fetch(url, { signal: ac.signal, headers: { 'user-agent': USER_AGENT, accept } });
            const body = await res.text();
            _lastRequestAt = Date.now();
            if (!res.ok) {
                return { outcome: 'http-error', status: res.status, body, ms: Date.now() - t0, message: `HTTP ${res.status}` };
            }
            const ows = readOwsException(body);
            if (ows) return { outcome: 'ows-exception', status: res.status, body, ms: Date.now() - t0, message: ows };
            return { outcome: 'ok', status: res.status, body, ms: Date.now() - t0, message: null };
        } catch (e) {
            _lastRequestAt = Date.now();
            return {
                outcome: ac.signal.aborted ? 'timeout' : 'network-error',
                status: null, body: null, ms: Date.now() - t0,
                message: e instanceof Error ? e.message : String(e),
            };
        } finally {
            clearTimeout(timer);
        }
    };
    const p = _chain.then(run, run);
    _chain = p.catch(() => undefined);
    return p;
}

/** Extract an OGC `ExceptionText` / `ServiceException` from a 200 body, or null. */
export function readOwsException(body) {
    if (!body || body.length > 200_000) return null; // only small bodies are plausible exception reports
    const m = body.match(/<(?:[\w.-]+:)?ExceptionText\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?ExceptionText>/i)
        ?? body.match(/<(?:[\w.-]+:)?ServiceException\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?ServiceException>/i);
    return m && m[1] ? m[1].trim().slice(0, 300) : null;
}

/** A HTTP 200 that is not valid JSON is a TRUNCATED/garbage payload — never a silent success. */
function parseJsonStrict(body) {
    try { return { ok: true, value: JSON.parse(body) }; }
    catch { return { ok: false, message: `HTTP 200 but body is not valid JSON (${body?.length ?? 0} bytes)` }; }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER ADAPTERS — each hits the SAME upstream the wired provider/proxy hits, and returns a
// normalised probe result. `srsNote` records the axis-order trap each service actually has (all
// were verified live before the run; a silently-mis-axised query returns plausible garbage).
// ─────────────────────────────────────────────────────────────────────────────

const D = 0.00012; // ≈13 m half-box for the bbox-style point queries.

export const ADAPTERS = {
    // SPAIN — Catastro INSPIRE CP download service. ONE request per point: a tiny bbox returns the
    // parcel(s) with BOTH `cp:areaValue` (the registry-declared official area) and the ring, so the
    // production two-hop (OVC reverse-geocode → GetParcel by REFCAT) is not needed for grading and
    // Catastro is spared half the traffic. ⚠ AXIS ORDER: EPSG:4326 here is lat,lon in BOTH the bbox
    // and the posList (verified live 2026-08-01).
    'catastro': {
        srsNote: 'EPSG:4326 lat,lon in bbox AND gml:posList (verified live)',
        // ⚠ MEASURED 2026-08-01, AND IT IS THE HONESTY TRAP OF THIS WHOLE PROBE: Catastro's INSPIRE
        // CP service signals "there is no parcel at this point" as an OGC **ExceptionReport**
        // (`OperationProcessingFailed` / "No records founded for BBOX and SRS provided"), NOT as a
        // well-formed FeatureCollection with zero features. A generic OWS classifier therefore bins
        // a MEASURED ABSENCE as a transport FAILURE — the exact "failure and empty are the same
        // value" defect (L-422/457/467/469) — which would have SILENTLY REMOVED every genuine
        // coverage gap from the denominator and inflated the axis. It is recognised as `none` here.
        emptyException: (msg) => /No records founded for BBOX/i.test(msg ?? ''),
        url: (lat, lon) =>
            'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=WFS&version=2.0.0&request=GetFeature'
            + '&typeNames=cp:CadastralParcel&srsName=EPSG:4326'
            + `&bbox=${(lat - D).toFixed(7)},${(lon - D).toFixed(7)},${(lat + D).toFixed(7)},${(lon + D).toFixed(7)}`,
        parse: (body) => {
            const members = body.split(/<cp:CadastralParcel\b/).slice(1);
            const out = [];
            for (const m of members) {
                const idm = m.match(/gml:id="([^"]+)"/);
                const areaM = m.match(/<cp:areaValue[^>]*>([\d.]+)<\/cp:areaValue>/);
                const posM = m.match(/<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/);
                if (!posM) continue;
                const nums = posM[1].trim().split(/\s+/).map(Number);
                const ring = [];
                for (let i = 0; i + 1 < nums.length; i += 2) ring.push({ lat: nums[i], lon: nums[i + 1] });
                out.push({
                    id: idm ? idm[1] : null,
                    areaOfficialM2: areaM ? Number(areaM[1]) : null,
                    ring,
                });
            }
            return out;
        },
    },

    // FRANCE — IGN PARCELLAIRE EXPRESS via the geoplateforme WFS. CQL INTERSECTS returns exactly the
    // parcel containing the point, so `clickInside` is true by construction (re-verified by PIP).
    // ⚠ AXIS ORDER: with SRSNAME=EPSG:4326 the CQL POINT is lat lon — `POINT(lon lat)` silently
    // returns ZERO features (verified live: the honest-looking empty answer was the mis-axis).
    // `contenance` is the registry-declared official area (m²).
    'ign-fr': {
        srsNote: 'EPSG:4326 → CQL POINT(lat lon); POINT(lon lat) silently returns 0 features',
        url: (lat, lon) =>
            'https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature'
            + '&TYPENAMES=CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle&COUNT=5&SRSNAME=EPSG:4326'
            + `&OUTPUTFORMAT=application/json&CQL_FILTER=INTERSECTS(geom,POINT(${lat.toFixed(7)}%20${lon.toFixed(7)}))`,
        parse: (body) => {
            const j = parseJsonStrict(body);
            if (!j.ok) return { error: j.message };
            return (j.value.features ?? []).map((f) => ({
                id: f.properties?.idu ?? f.id ?? null,
                areaOfficialM2: typeof f.properties?.contenance === 'number' ? f.properties.contenance : null,
                ring: geojsonOuterRing(f.geometry),
            }));
        },
    },

    // NETHERLANDS — PDOK Kadastrale Kaart BRK `Perceel`. ⚠ CQL_FILTER on `begrenzingPerceel` is
    // SILENTLY WRONG on this service (an Amsterdam point returned a Teteringen parcel, i.e. the
    // filter is not applied as issued) — so this uses BBOX with the urn CRS (lat,lon), which was
    // verified to return real Amsterdam parcels. GeoJSON output is CRS84 (lon,lat).
    // `kadastraleGrootteWaarde` is the registry-declared official area (m²).
    'pdok-nl': {
        srsNote: 'BBOX urn:ogc:def:crs:EPSG::4326 = lat,lon; GeoJSON out is CRS84 lon,lat. CQL_FILTER is unreliable here',
        url: (lat, lon) =>
            'https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0?service=WFS&version=2.0.0&request=GetFeature'
            + '&typeNames=kadastralekaart:Perceel&count=10&outputFormat=application/json'
            + `&srsName=urn:ogc:def:crs:EPSG::4326&bbox=${(lat - D).toFixed(7)},${(lon - D).toFixed(7)},${(lat + D).toFixed(7)},${(lon + D).toFixed(7)},urn:ogc:def:crs:EPSG::4326`,
        parse: (body) => {
            const j = parseJsonStrict(body);
            if (!j.ok) return { error: j.message };
            return (j.value.features ?? []).map((f) => ({
                id: f.properties?.identificatieLokaalID ?? f.id ?? null,
                areaOfficialM2: typeof f.properties?.kadastraleGrootteWaarde === 'number'
                    ? f.properties.kadastraleGrootteWaarde : null,
                ring: geojsonOuterRing(f.geometry),
            }));
        },
    },

    // NORWAY — Kartverket Matrikkelen eiendomskart `app:Teig` (the registry's wired endpoint).
    'geonorge-no': {
        srsNote: 'EPSG:4326 BBOX = lat,lon; GML 3.2.1 posList lat lon',
        url: (lat, lon) =>
            'https://wfs.geonorge.no/skwms1/wfs.matrikkelen-eiendomskart-teig?SERVICE=WFS&VERSION=2.0.0'
            + '&REQUEST=GetFeature&TYPENAMES=app:Teig&COUNT=5&SRSNAME=EPSG:4326'
            + `&BBOX=${(lat - D).toFixed(7)},${(lon - D).toFixed(7)},${(lat + D).toFixed(7)},${(lon + D).toFixed(7)},EPSG:4326`,
        parse: (body) => {
            const members = body.split(/<app:Teig\b/).slice(1);
            const out = [];
            for (const m of members) {
                const posM = m.match(/<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/);
                if (!posM) continue;
                const nums = posM[1].trim().split(/\s+/).map(Number);
                const ring = [];
                for (let i = 0; i + 1 < nums.length; i += 2) ring.push({ lat: nums[i], lon: nums[i + 1] });
                const idm = m.match(/<app:lokalId>([^<]+)<\/app:lokalId>/);
                out.push({ id: idm ? idm[1] : null, areaOfficialM2: null, ring });
            }
            return out;
        },
    },

    // SWITZERLAND — the FEDERAL geo.admin.ch identify against the all-canton Amtliche Vermessung
    // web map (the exact surface `registry.ts` wires). ⚠ MEASURED LIMITATION: the identify
    // `attributes` carry `egris_egrid` / `number` / `ak` and NO area field, so `areaOfficialM2` is
    // structurally null and every Swiss parcel is capped at `medium` by the C57 rule. That is a
    // property of the SOURCE, not a defect in this probe — recorded, not worked around.
    'swisstopo-av': {
        srsNote: 'sr=4326, geometry=lon,lat; rings are lon,lat. No area attribute exists on this service',
        url: (lat, lon) =>
            'https://api3.geo.admin.ch/rest/services/api/MapServer/identify'
            + `?geometry=${lon.toFixed(7)},${lat.toFixed(7)}&geometryType=esriGeometryPoint`
            + '&layers=all:ch.kantone.cadastralwebmap-farbe&tolerance=0&sr=4326'
            + `&mapExtent=${(lon - 0.01).toFixed(5)},${(lat - 0.01).toFixed(5)},${(lon + 0.01).toFixed(5)},${(lat + 0.01).toFixed(5)}`
            + '&imageDisplay=200,200,96&returnGeometry=true',
        parse: (body) => {
            const j = parseJsonStrict(body);
            if (!j.ok) return { error: j.message };
            return (j.value.results ?? []).map((r) => ({
                id: r.attributes?.egris_egrid ?? String(r.featureId ?? ''),
                areaOfficialM2: null, // the service publishes none — see the note above.
                ring: (r.geometry?.rings?.[0] ?? []).map(([lon2, lat2]) => ({ lat: lat2, lon: lon2 })),
            }));
        },
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// COUNTERFACTUAL ADAPTER — not wired in production; exists to MEASURE a lever rather than assert it.
// ─────────────────────────────────────────────────────────────────────────────
// The `swisstopo-av` measurement showed Switzerland capped at `medium` on 120/120 points for ONE
// reason: the geo.admin.ch identify service publishes no area, so the C57 `high` tier (which
// requires a registry-declared official area) is UNREACHABLE by construction. That is a claim about
// the ENDPOINT, and the honest way to test whether it is a claim about SWITZERLAND is to probe a
// second, independent Swiss surface. `geodienste.ch/db/av_0/deu` layer `ms:RESF` (Liegenschaften)
// does publish `ms:Flaeche` — the registry-declared area — keylessly, for the 21 cantons + FL its
// own `FILTER_ALLOWED_CANTONS` lists. Probing it turns "we could probably lift CH" into a number.
//
// ⚠ This CONTRADICTS the standing note in `parcelProviders/registry.ts` ("the earlier 'no keyless
// Liegenschaft layer' verdict was about the geodienste.ch/av_0 WFS host"): there IS one, and it
// carries the missing corroborator. Reported to the registry owner, NOT edited here.
ADAPTERS['ch-geodienste-av'] = {
    srsNote: 'EPSG:4326 BBOX = lat,lon; GML 3.2 posList lat lon; ms:Flaeche = official area (m²)',
    url: (lat, lon) =>
        'https://geodienste.ch/db/av_0/deu?service=WFS&version=2.0.0&request=GetFeature'
        + '&typeNames=ms:RESF&count=5&srsName=EPSG:4326'
        + `&bbox=${(lat - D).toFixed(7)},${(lon - D).toFixed(7)},${(lat + D).toFixed(7)},${(lon + D).toFixed(7)},EPSG:4326`,
    parse: (body) => {
        const members = body.split(/<ms:RESF\b/).slice(1);
        const out = [];
        for (const m of members) {
            const posM = m.match(/<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/);
            if (!posM) continue;
            const nums = posM[1].trim().split(/\s+/).map(Number);
            const ring = [];
            for (let i = 0; i + 1 < nums.length; i += 2) ring.push({ lat: nums[i], lon: nums[i + 1] });
            const areaM = m.match(/<ms:Flaeche>([\d.]+)<\/ms:Flaeche>/);
            const idm = m.match(/<ms:EGRIS_EGRID>([^<]+)<\/ms:EGRIS_EGRID>/);
            out.push({ id: idm ? idm[1] : null, areaOfficialM2: areaM ? Number(areaM[1]) : null, ring });
        }
        return out;
    },
};

/** GeoJSON (Multi)Polygon → the LARGEST outer ring as lat/lon points. */
export function geojsonOuterRing(geom) {
    if (!geom) return [];
    const polys = geom.type === 'MultiPolygon' ? geom.coordinates : geom.type === 'Polygon' ? [geom.coordinates] : [];
    let best = [];
    for (const poly of polys) {
        const ring = (poly[0] ?? []).map(([lon, lat]) => ({ lat, lon }));
        if (ringAreaM2(ring) > ringAreaM2(best)) best = ring;
    }
    return best;
}

/**
 * Probe ONE point against ONE adapter. Returns a normalised outcome:
 *   `{ outcome:'ok', tier, … }` · `{ outcome:'none' }` (measured absence) · `{ outcome:<failure> }`.
 * NEVER throws.
 */
export async function probePoint(adapterId, lat, lon, kind = 'cadastral') {
    const a = ADAPTERS[adapterId];
    if (!a) return { outcome: 'network-error', message: `no adapter '${adapterId}'` };
    const res = await politeGet(a.url(lat, lon), { accept: 'application/json,text/xml,*/*' });
    if (res.outcome !== 'ok') {
        // A service that reports "no feature here" as an OGC exception is answering, not failing —
        // see the `emptyException` note on the catastro adapter. Re-bin it as a MEASURED ABSENCE.
        if (res.outcome === 'ows-exception' && a.emptyException?.(res.message)) {
            return { outcome: 'none', message: `service-signalled empty via OWS exception: ${res.message}` };
        }
        return { outcome: res.outcome, message: res.message, httpStatus: res.status };
    }
    let feats;
    try { feats = a.parse(res.body, lat, lon); }
    catch (e) { return { outcome: 'truncated', message: `parse failed: ${e.message}` }; }
    if (feats && feats.error) return { outcome: 'truncated', message: feats.error };
    if (!feats || feats.length === 0) {
        // A well-formed answer carrying zero features is a REAL ANSWER: no parcel here.
        return { outcome: 'none', message: 'well-formed response, zero features — measured absence' };
    }
    // Prefer the feature the click actually lands in; else the first (a near-miss ⇒ medium at best).
    const withPip = feats.map((f) => ({ ...f, inside: pointInRing(lat, lon, f.ring) }));
    const chosen = withPip.find((f) => f.inside) ?? withPip[0];
    const areaSigM2 = ringAreaM2(chosen.ring);
    const geometryComplete = isGeometryComplete(chosen.ring, areaSigM2);
    const tier = matchTier({
        kind, geometryComplete,
        areaOfficialM2: chosen.areaOfficialM2,
        clickInside: chosen.inside,
    });
    return {
        outcome: 'ok', tier, id: chosen.id, clickInside: chosen.inside,
        areaOfficialM2: chosen.areaOfficialM2, areaSigM2: Math.round(areaSigM2),
        geometryComplete, candidateCount: feats.length,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// THE BUILDABLE-LAND FRAME (stage 1 + stage 2). Overpass is queried ONCE per city.
// ─────────────────────────────────────────────────────────────────────────────

/** OSM `building` values that are NOT private buildable land — public/civic/infrastructure stock. */
export const NON_PRIVATE_BUILDING = new Set([
    'church', 'chapel', 'cathedral', 'mosque', 'synagogue', 'temple', 'shrine', 'religious',
    'school', 'university', 'college', 'kindergarten', 'hospital', 'train_station', 'transportation',
    'public', 'government', 'civic', 'stadium', 'sports_hall', 'sports_centre', 'museum', 'toilets',
    'bridge', 'water_tower', 'reservoir_covered', 'military', 'bunker', 'ruins', 'construction',
]);

/** Draw T tiles uniformly at random over the bbox (stage 1). Deterministic under `rnd`. */
export function drawTiles(bbox, tileCount, tileDeg, rnd) {
    const [w, s, e, n] = bbox;
    const tiles = [];
    for (let i = 0; i < tileCount; i++) {
        const lon = w + rnd() * Math.max(1e-9, (e - w) - tileDeg);
        const lat = s + rnd() * Math.max(1e-9, (n - s) - tileDeg);
        tiles.push([lon, lat, lon + tileDeg, lat + tileDeg]);
    }
    return tiles;
}

/**
 * Overpass mirrors, tried IN ORDER. The main instance answers HTTP 504
 * ("Dispatcher_Client::request_read_and_idx::timeout — the server is probably too busy") under
 * load, which is an OUTAGE OF THAT MIRROR, not an absence of buildings — so a mirror sweep is the
 * honest response, and only an ALL-mirrors failure makes the buildable frame unavailable.
 */
export const OVERPASS_MIRRORS = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
];

/** One Overpass union query for every tile's buildings. Returns `{ ok, buildings, message }`. */
export async function fetchBuildings(tiles, { timeoutMs = 180_000, mirrors = OVERPASS_MIRRORS } = {}) {
    const clauses = tiles
        .map(([w, s, e, n]) => `way["building"](${s.toFixed(6)},${w.toFixed(6)},${n.toFixed(6)},${e.toFixed(6)});`)
        .join('');
    const q = `[out:json][timeout:170];(${clauses});out geom;`;
    const t0 = Date.now();
    const attempts = [];
    for (const mirror of mirrors) {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), timeoutMs);
        _requestCount++;
        try {
            const res = await fetch(mirror, {
                method: 'POST', signal: ac.signal,
                headers: { 'user-agent': USER_AGENT, 'content-type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ data: q }).toString(),
            });
            const body = await res.text();
            if (!res.ok) { attempts.push(`${mirror}: HTTP ${res.status}`); continue; }
            const j = parseJsonStrict(body);
            if (!j.ok) { attempts.push(`${mirror}: ${j.message}`); continue; }
            const buildings = [];
            for (const el of j.value.elements ?? []) {
                if (el.type !== 'way' || !Array.isArray(el.geometry)) continue;
                const bv = el.tags?.building;
                if (!bv || NON_PRIVATE_BUILDING.has(bv)) continue;
                if (el.tags?.amenity && ['school', 'hospital', 'place_of_worship', 'university', 'college', 'townhall', 'prison'].includes(el.tags.amenity)) continue;
                const ring = el.geometry.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon))
                    .map((p) => ({ lat: p.lat, lon: p.lon }));
                const area = ringAreaM2(ring);
                if (area <= 0) continue;
                buildings.push({ ring, area });
            }
            return { ok: true, buildings, ms: Date.now() - t0, mirror, rawElements: (j.value.elements ?? []).length };
        } catch (e) {
            attempts.push(`${mirror}: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            clearTimeout(timer);
        }
    }
    return { ok: false, message: `all ${mirrors.length} Overpass mirrors failed — ${attempts.join(' | ')}`, ms: Date.now() - t0 };
}

/** Stage 2 — draw `n` points with probability PROPORTIONAL TO FOOTPRINT AREA (PPS). */
export function samplePointsByArea(buildings, n, rnd) {
    const total = buildings.reduce((s, b) => s + b.area, 0);
    if (total <= 0) return [];
    const cum = [];
    let acc = 0;
    for (const b of buildings) { acc += b.area; cum.push(acc); }
    const pts = [];
    let guard = 0;
    while (pts.length < n && guard < n * 400) {
        guard++;
        const target = rnd() * total;
        let lo = 0, hi = cum.length - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < target) lo = mid + 1; else hi = mid; }
        const b = buildings[lo];
        // Uniform-in-polygon by rejection inside the ring's bbox.
        let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
        for (const p of b.ring) {
            if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat;
            if (p.lon < minLon) minLon = p.lon; if (p.lon > maxLon) maxLon = p.lon;
        }
        for (let k = 0; k < 60; k++) {
            const lat = minLat + rnd() * (maxLat - minLat);
            const lon = minLon + rnd() * (maxLon - minLon);
            if (pointInRing(lat, lon, b.ring)) { pts.push({ lat, lon }); break; }
        }
    }
    return pts;
}

/** Uniform points over the whole region bbox — the CLICK-COVERAGE frame (all clicks, no mask). */
export function sampleUniform(bbox, n, rnd) {
    const [w, s, e, nn] = bbox;
    const pts = [];
    for (let i = 0; i < n; i++) pts.push({ lat: s + rnd() * (nn - s), lon: w + rnd() * (e - w) });
    return pts;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE RUN.
// ─────────────────────────────────────────────────────────────────────────────

/** Tally a probe-result list into the buckets `computeParcelConfidence` consumes. */
export function tallyResults(results) {
    const counts = { high: 0, medium: 0, low: 0, none: 0 };
    const failures = {};
    for (const r of results) {
        if (r.outcome === 'ok') counts[r.tier] += 1;
        else if (r.outcome === 'none') counts.none += 1;
        else failures[r.outcome] = (failures[r.outcome] ?? 0) + 1;
    }
    return { counts, failures };
}

/** Measure ONE city: build both frames, probe both, return the full record. NEVER throws. */
export async function measureCity(cityCfg, opts = {}) {
    const {
        n = 120, nAllClicks = 60, tileCount = 40, tileDeg = 0.003, seed = 20260801,
        log = () => {},
    } = opts;
    const rnd = mulberry32(seed);
    const startedAt = new Date().toISOString();

    // ── frame 1: the BUILDABLE-LAND proxy (independent of the cadastre under test) ──
    const tiles = drawTiles(cityCfg.bbox, tileCount, tileDeg, rnd);
    log(`[${cityCfg.city}] overpass: ${tileCount} tiles × ${(tileDeg * 111).toFixed(2)} km …`);
    const osm = await fetchBuildings(tiles);
    let buildablePoints = [];
    let frameNote;
    if (!osm.ok) {
        frameNote = `BUILDABLE FRAME UNAVAILABLE — Overpass failed: ${osm.message}`;
        log(`[${cityCfg.city}] ⚠ ${frameNote}`);
    } else {
        buildablePoints = samplePointsByArea(osm.buildings, n, rnd);
        frameNote = `${osm.buildings.length} non-public OSM building footprints in ${tileCount} random tiles`;
        log(`[${cityCfg.city}] frame: ${frameNote} → ${buildablePoints.length} points`);
    }

    // ── frame 2: ALL CLICKS over the region bbox ──
    const allClickPoints = sampleUniform(cityCfg.bbox, nAllClicks, rnd);

    // CIRCUIT BREAKER — a provider that is DOWN must not be hammered 180 times to prove it. After
    // `breakerAfter` CONSECUTIVE transport failures the run aborts and records `abortedAfter`; the
    // axis then reports `not-assessed` + the failure, which is the correct verdict either way
    // (§CONTEXT-DATA-HONESTY: a failed probe is a claim about our network, never a low score).
    const breakerAfter = opts.breakerAfter ?? 8;
    const probeAll = async (pts, label) => {
        const out = [];
        let consecutiveFailures = 0;
        for (let i = 0; i < pts.length; i++) {
            const r = await probePoint(cityCfg.adapter, pts[i].lat, pts[i].lon, cityCfg.kind);
            out.push({ lat: +pts[i].lat.toFixed(6), lon: +pts[i].lon.toFixed(6), ...r });
            consecutiveFailures = (r.outcome === 'ok' || r.outcome === 'none') ? 0 : consecutiveFailures + 1;
            if (consecutiveFailures >= breakerAfter) {
                log(`[${cityCfg.city}] ⚠ ${label}: circuit-breaker after ${consecutiveFailures} consecutive transport failures (${r.outcome}: ${r.message}) — provider is DOWN, aborting`);
                return out;
            }
            if ((i + 1) % 25 === 0) log(`[${cityCfg.city}] ${label} ${i + 1}/${pts.length}`);
        }
        return out;
    };

    const buildable = await probeAll(buildablePoints, 'buildable');
    const allclicks = await probeAll(allClickPoints, 'allclicks');

    return {
        version: PARCEL_SAMPLE_VERSION,
        jurisdictionId: cityCfg.jurisdictionId,
        city: cityCfg.city, cc: cityCfg.cc, regionKey: cityCfg.regionKey,
        providerId: cityCfg.providerId, kind: cityCfg.kind, adapter: cityCfg.adapter,
        srsNote: ADAPTERS[cityCfg.adapter]?.srsNote ?? null,
        bbox: cityCfg.bbox,
        measuredAt: startedAt,
        finishedAt: new Date().toISOString(),
        seed, tileCount, tileDegrees: tileDeg,
        frame: {
            denominator: 'OSM non-public building-footprint area within the canonical region bbox '
                + '(an INDEPENDENT, conservative proxy for private buildable land — NOT the legal '
                + 'buildable-land census; L-656)',
            note: frameNote,
            overpassOk: !!osm.ok,
            overpassMessage: osm.ok ? null : osm.message,
            footprintsFound: osm.ok ? osm.buildings.length : 0,
        },
        buildable: { requested: n, probed: buildable.length, ...tallyResults(buildable), points: buildable },
        allclicks: {
            requested: nAllClicks, probed: allclicks.length,
            denominator: 'every point in the canonical region bbox — water, parks, periphery included',
            ...tallyResults(allclicks), points: allclicks,
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI.
// ─────────────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
    const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
    const has = (k) => process.argv.includes(k);
    const only = arg('--city');
    const outDir = resolve(HERE, arg('--out', 'samples'));
    const n = Number(arg('--n', '120'));
    const nAllClicks = Number(arg('--n-allclicks', '60'));
    const tileCount = Number(arg('--tiles', '40'));
    const seed = Number(arg('--seed', '20260801'));
    // `--adapter` swaps the provider adapter for a COUNTERFACTUAL run (e.g. measuring what CH would
    // score against geodienste `ms:RESF` instead of the wired geo.admin.ch identify). The output is
    // written under a suffixed filename so it can never be mistaken for the production measurement.
    const adapterOverride = arg('--adapter');
    const cities = CITY_BOARD
        .filter((c) => (has('--all') ? true : c.city === only))
        .map((c) => (adapterOverride ? { ...c, adapter: adapterOverride, city: `${c.city}.counterfactual-${adapterOverride}` } : c));
    if (cities.length === 0) {
        console.error(`usage: node parcelSampleProbe.mjs --city <${CITY_BOARD.map((c) => c.city).join('|')}> | --all`);
        process.exit(2);
    }
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    for (const c of cities) {
        const rec = await measureCity(c, { n, nAllClicks, tileCount, seed, log: (m) => console.log(m) });
        const file = join(outDir, `${c.city}.parcel-sample.json`);
        writeFileSync(file, JSON.stringify(rec, null, 1));
        const b = rec.buildable;
        const nAssessed = b.counts.high + b.counts.medium + b.counts.low + b.counts.none;
        const score = nAssessed === 0 ? null : (b.counts.high + 0.5 * b.counts.medium) / nAssessed;
        console.log(`▶ ${c.city}: buildable N=${nAssessed} (high ${b.counts.high} / med ${b.counts.medium} / low ${b.counts.low} / none ${b.counts.none})`
            + ` failures=${JSON.stringify(b.failures)} → axis=${score === null ? 'not-assessed' : (score * 100).toFixed(1) + '%'}  → ${file}`);
    }
    console.log(`\nupstream requests issued: ${getRequestCount()}`);
}
