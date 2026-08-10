// §MURCIA-ENVELOPE-MAX — shared transport + parsing helpers.
//
// Politeness is a hard requirement here: mapas-gis-inter.carm.es is a municipal
// viewer backend, not a bulk API. Every request is serialised, throttled and
// cached to disk so a re-run costs the service nothing.
//
// ⛔ HONESTY RULE (§CONTEXT-DATA-HONESTY, L-422/457/467/469): a transport
// failure NEVER degrades into an empty result. Callers get a thrown error or an
// explicit {ok:false} — never [].

import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const CACHE = join(HERE, '.cache');
export const OUT = join(HERE, 'out');
mkdirSync(CACHE, { recursive: true });
mkdirSync(OUT, { recursive: true });

export const WFS = 'https://mapas-gis-inter.carm.es/geoserver/SIT_USU_PLA_URB_CARM/wfs';
export const GEOSERVER_ROOT = 'https://mapas-gis-inter.carm.es/geoserver';
export const WS = 'SIT_USU_PLA_URB_CARM';

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

let lastHit = 0;
const MIN_GAP_MS = Number(process.env.MURCIA_GAP_MS || 1400);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Serialised, throttled fetch with on-disk cache. Returns {status, buf, headers, fromCache}. */
export async function politeFetch(url, opts = {}) {
  const key = createHash('sha1')
    .update(url + '|' + JSON.stringify(opts.headers || {}) + '|' + (opts.tag || ''))
    .digest('hex');
  const meta = join(CACHE, key + '.json');
  const body = join(CACHE, key + '.bin');
  if (!opts.refresh && existsSync(meta) && existsSync(body)) {
    const m = JSON.parse(readFileSync(meta, 'utf8'));
    return { ...m, buf: readFileSync(body), fromCache: true };
  }
  const gap = Date.now() - lastHit;
  if (gap < MIN_GAP_MS) await sleep(MIN_GAP_MS - gap);
  lastHit = Date.now();

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeout || 90_000);
  let res;
  try {
    res = await fetch(url, {
      redirect: opts.redirect || 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        Accept: opts.accept || '*/*',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        ...(opts.headers || {}),
      },
    });
  } finally {
    clearTimeout(t);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const m = {
    status: res.status,
    url: res.url,
    headers: Object.fromEntries(res.headers.entries()),
    fetchedAt: new Date().toISOString(),
    requestUrl: url,
  };
  writeFileSync(meta, JSON.stringify(m, null, 2));
  writeFileSync(body, buf);
  return { ...m, buf, fromCache: false };
}

export function qs(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
}

/**
 * WFS GetFeature as GeoJSON.
 * ⛔ NEGATIVE PROOF: HTTP 200 is NOT success on GeoServer — an ExceptionReport
 * ships with 200 routinely. We read the WHOLE error string and throw.
 */
export async function wfsJson(typeName, extra = {}, opts = {}) {
  const url =
    WFS +
    '?' +
    qs({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames: typeName,
      outputFormat: 'application/json',
      srsName: 'EPSG:25830',
      ...extra,
    });
  const r = await politeFetch(url, opts);
  const text = r.buf.toString('utf8');
  if (/ExceptionReport|ows:Exception|<ServiceException/i.test(text)) {
    throw new Error(`WFS EXCEPTION on ${typeName}: ${text.slice(0, 1200)}`);
  }
  if (r.status !== 200) throw new Error(`WFS HTTP ${r.status} on ${typeName}: ${text.slice(0, 600)}`);
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`WFS non-JSON on ${typeName}: ${text.slice(0, 600)}`);
  }
  return j;
}

/** WFS hits-only count. Throws on exception; returns integer. */
export async function wfsCount(typeName, cql, opts = {}) {
  const url =
    WFS +
    '?' +
    qs({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames: typeName,
      resultType: 'hits',
      CQL_FILTER: cql,
    });
  const r = await politeFetch(url, opts);
  const text = r.buf.toString('utf8');
  if (/ExceptionReport|ows:Exception|<ServiceException/i.test(text)) {
    throw new Error(`WFS HITS EXCEPTION on ${typeName} [${cql || 'no filter'}]: ${text.slice(0, 1200)}`);
  }
  const m = text.match(/numberMatched="(\d+)"/);
  if (!m) throw new Error(`WFS HITS unparsable on ${typeName}: ${text.slice(0, 600)}`);
  return Number(m[1]);
}

/**
 * ⛔ FILTER-APPLIED PROOF. A successful response is not an applied filter.
 * We prove the service honours CQL by asserting that a filter that must match
 * nothing returns 0 while the unfiltered count is > 0. If a bogus filter
 * returns the full count, the service is IGNORING the filter and every
 * downstream figure is void.
 */
export async function proveFilterApplied(typeName, field) {
  const total = await wfsCount(typeName, undefined);
  const impossible = await wfsCount(typeName, `${field}='__PRYZM_NO_SUCH_VALUE__'`);
  const ok = total > 0 && impossible === 0;
  return { typeName, field, total, impossible, filterApplied: ok };
}

/** Shoelace area of a GeoJSON polygon/multipolygon in projected (metre) coords. */
export function areaOf(geom) {
  if (!geom) return 0;
  const ring = (r) => {
    let a = 0;
    for (let i = 0, n = r.length; i < n; i++) {
      const [x1, y1] = r[i];
      const [x2, y2] = r[(i + 1) % n];
      a += x1 * y2 - x2 * y1;
    }
    return a / 2;
  };
  const poly = (p) => Math.abs(ring(p[0])) - p.slice(1).reduce((s, h) => s + Math.abs(ring(h)), 0);
  if (geom.type === 'Polygon') return poly(geom.coordinates);
  if (geom.type === 'MultiPolygon') return geom.coordinates.reduce((s, p) => s + poly(p), 0);
  return 0;
}

/** Deterministic PRNG so every sample is reproducible from the seed. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * ⛔ EVERY DECOMPOSITION MUST SUM. Throws rather than emitting an unbalanced
 * figure — the NORMATIVE-doc defect (a route tag stamped on both the envelope
 * AND the refusal) was detectable only because the parts never summed.
 */
export function assertSums(label, total, parts) {
  const sum = Object.values(parts).reduce((s, v) => s + v, 0);
  if (sum !== total) {
    throw new Error(
      `DECOMPOSITION DOES NOT SUM for "${label}": total=${total} parts=${JSON.stringify(parts)} sum=${sum}`
    );
  }
  return true;
}

export function writeOut(name, obj) {
  const p = join(OUT, name);
  writeFileSync(p, JSON.stringify(obj, null, 2));
  console.log(`  → wrote ${p}`);
  return p;
}

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/** Truncation suspect check — GeoServer default maxFeatures shows up as these. */
export const TRUNCATION_SUSPECTS = new Set([1000, 2000, 3000, 5000, 10000, 50000, 100000]);
export function truncationSuspect(n) {
  return TRUNCATION_SUSPECTS.has(n);
}
