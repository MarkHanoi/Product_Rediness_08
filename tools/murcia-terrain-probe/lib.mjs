// Shared probe helpers for the Murcia terrain + heights probe (tools/murcia-terrain-probe).
//
// Discipline (§CONTEXT-DATA-HONESTY): a probe reports what the wire returned, never what a doc
// claims. Every fetch records status, content-type, byte length and a body head, and caches to
// ./cache so a re-run never re-hits the origin (LiDAR/coverage payloads are large; be a polite
// client). Failure modes are kept DISTINCT — 403 / timeout / auth-wall / empty-coverage /
// truncated-but-200 are five different results and must never collapse into one "failed".

import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const CACHE = join(HERE, 'cache');
mkdirSync(CACHE, { recursive: true });

// geotiff lives in the main checkout's tools/context-bake/node_modules (the worktree has no install).
export const GEOTIFF_PATHS = [
  'c:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/tools/context-bake/node_modules/geotiff/dist-node/geotiff.js',
  'geotiff',
];
let _gt = null;
export async function loadGeoTiff() {
  if (_gt) return _gt;
  for (const p of GEOTIFF_PATHS) {
    try { _gt = await import(p.startsWith('c:') ? `file:///${p}` : p); return _gt; } catch { /* next */ }
  }
  throw new Error('geotiff module not resolvable — probe cannot decode rasters');
}

let _proj4 = null;
export async function loadProj4() {
  if (_proj4) return _proj4;
  const cands = [
    'c:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/node_modules/.pnpm/proj4@2.20.8/node_modules/proj4/dist/proj4.js',
    'proj4',
  ];
  for (const p of cands) {
    try { const m = await import(p.startsWith('c:') ? `file:///${p}` : p); _proj4 = m.default ?? m; return _proj4; } catch { /* next */ }
  }
  throw new Error('proj4 not resolvable');
}

const keyFor = (url) => createHash('sha1').update(url).digest('hex').slice(0, 16);

/** Politeness: serialise per host with a minimum gap between requests to the same origin. */
const lastHit = new Map();
const MIN_GAP_MS = 900;
async function politeGate(url) {
  const host = new URL(url).host;
  const prev = lastHit.get(host) ?? 0;
  const wait = Math.max(0, prev + MIN_GAP_MS - Date.now());
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(host, Date.now());
}

/**
 * Cached fetch returning a full, honest result record.
 * Never throws on an HTTP error — returns { ok:false, kind } so the caller can distinguish
 * the five failure modes. Only a transport-level abort produces kind:'timeout'/'network'.
 */
export async function probeFetch(url, { timeoutMs = 90_000, accept, label = '', binary = false, force = false } = {}) {
  const cacheFile = join(CACHE, `${keyFor(url)}${binary ? '.bin' : '.txt'}`);
  const metaFile = join(CACHE, `${keyFor(url)}.meta.json`);
  if (!force && existsSync(cacheFile) && existsSync(metaFile)) {
    const meta = JSON.parse(readFileSync(metaFile, 'utf8'));
    const buf = readFileSync(cacheFile);
    return { ...meta, cached: true, buf, text: binary ? undefined : buf.toString('utf8') };
  }
  await politeGate(url);
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: accept ? { Accept: accept } : {} });
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    const ct = res.headers.get('content-type') || '';
    const clHeader = res.headers.get('content-length');
    const meta = {
      ok: res.ok, status: res.status, contentType: ct, bytes: buf.length,
      declaredLength: clHeader ? Number(clHeader) : null,
      // TRUNCATION CHECK: a Content-Length that disagrees with the body we actually received is the
      // "HTTP 200 but silently cut" failure mode (the Danish bulk-endpoint lesson). Never trust status.
      lengthMismatch: clHeader ? Number(clHeader) !== buf.length : null,
      ms: Date.now() - t0, url, label,
      head: buf.subarray(0, 400).toString('utf8').replace(/\s+/g, ' ').trim(),
      kind: res.ok ? 'response' : (res.status === 401 || res.status === 403 ? 'auth-or-forbidden' : 'http-error'),
    };
    writeFileSync(cacheFile, buf);
    writeFileSync(metaFile, JSON.stringify(meta, null, 2));
    return { ...meta, cached: false, buf, text: binary ? undefined : buf.toString('utf8') };
  } catch (e) {
    const kind = String(e).includes('abort') ? 'timeout' : 'network';
    return { ok: false, kind, status: null, error: String(e), ms: Date.now() - t0, url, label, bytes: 0 };
  } finally { clearTimeout(t); }
}

/** Is this buffer really a TIFF? (magic II*\0 / MM\0*) — a GeoTIFF request that 200s with XML is a lie. */
export function isTiff(buf) {
  if (!buf || buf.length < 8) return false;
  const a = buf[0], b = buf[1];
  return (a === 0x49 && b === 0x49 && buf[2] === 0x2a) || (a === 0x4d && b === 0x4d && buf[3] === 0x2a);
}

/** Detect an OGC ServiceExceptionReport / ows:ExceptionReport hiding behind a 200. */
export function owsException(text) {
  if (!text) return null;
  const m = text.match(/<(?:ows:)?Exception(?:Report)?[^>]*>[\s\S]{0,600}/i)
    || text.match(/<ServiceException[^>]*>[\s\S]{0,600}/i);
  return m ? m[0].replace(/\s+/g, ' ').slice(0, 500) : null;
}

export const D2R = Math.PI / 180;
export const M_PER_DEG_LAT = 111320;
export const mPerDegLon = (lat) => 111320 * Math.cos(lat * D2R);

export function saveJson(name, obj) {
  const p = join(HERE, name);
  writeFileSync(p, JSON.stringify(obj, null, 2));
  return p;
}
export function saveBin(name, buf) {
  const p = join(CACHE, name);
  writeFileSync(p, buf);
  return { path: p, bytes: statSync(p).size };
}

// ── The target site (founder-supplied, this probe's subject) ────────────────────────────────────
export const SITE = {
  refcat: '3481104XH6038S',
  lat: 38.006100,
  lon: -1.138028,
  municipality: 'Murcia',
  ine: '30030',
  officialAreaM2: 935,
};
