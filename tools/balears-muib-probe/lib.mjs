/**
 * Shared ArcGIS REST helpers for the Balears MUIB probe.
 *
 * DISCIPLINE (docs/04-reference/standards/PROBE-DISCIPLINE.md):
 *  - HTTP 200 IS NOT SUCCESS on ArcGIS. A 200 can carry an Esri error object in
 *    the body. `agsGet` throws on an Esri error body, so callers never mistake
 *    an error payload for an empty result.
 *  - Counts landing exactly on 1000/2000/3000/5000 are TRUNCATION SUSPECTS and
 *    are flagged, never quoted as a total.
 *  - Network failure, Esri error, and a genuine zero are three DIFFERENT facts
 *    and are counted separately by every caller (R5).
 */

export const SERVICE =
  'https://ideib.caib.es/geoserveis/rest/services/public/GOIB_MUIB/MapServer';

const TRUNCATION_SUSPECTS = new Set([1000, 2000, 3000, 4000, 5000, 10000]);

export function isTruncationSuspect(n) {
  return TRUNCATION_SUSPECTS.has(n);
}

/** Sleep, to stay polite to a public keyless endpoint. */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class EsriError extends Error {
  constructor(body, url) {
    const e = body && body.error ? body.error : {};
    super(`Esri error ${e.code ?? '?'}: ${e.message ?? 'unknown'}${
      e.details && e.details.length ? ' :: ' + e.details.join(' | ') : ''
    }`);
    this.name = 'EsriError';
    this.esriCode = e.code;
    this.url = url;
  }
}

/**
 * GET an ArcGIS REST resource as JSON.
 * Throws EsriError if the body carries an Esri error despite HTTP 200.
 * Throws Error on transport / non-200 / non-JSON.
 */
export async function agsGet(path, params = {}, { retries = 3, timeoutMs = 60000 } = {}) {
  const qs = new URLSearchParams({ f: 'json', ...params });
  const url = `${SERVICE}${path}?${qs}`;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(1200 * attempt);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctl.signal,
        headers: { 'User-Agent': 'PRYZM-balears-muib-probe/1.0' },
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error(`Non-JSON body (${text.slice(0, 200)}) on ${url}`);
      }
      // ⛔ HTTP 200 IS NOT SUCCESS.
      if (body && body.error) throw new EsriError(body, url);
      return body;
    } catch (err) {
      lastErr = err;
      // An Esri error is deterministic - retrying will not change it.
      if (err instanceof EsriError) throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/** Layer descriptor (fields, types, domains). */
export const layerInfo = (id) => agsGet(`/${id}`);

/** returnCountOnly query. Returns {count, truncationSuspect}. */
export async function count(layerId, where = '1=1', extra = {}) {
  const body = await agsGet(`/${layerId}/query`, {
    where,
    returnCountOnly: 'true',
    ...extra,
  });
  const c = body.count ?? 0;
  return { count: c, truncationSuspect: isTruncationSuspect(c) };
}

/** Distinct values of one or more fields, via returnDistinctValues. */
export async function distinct(layerId, fields, where = '1=1', extra = {}) {
  const body = await agsGet(`/${layerId}/query`, {
    where,
    outFields: Array.isArray(fields) ? fields.join(',') : fields,
    returnDistinctValues: 'true',
    returnGeometry: 'false',
    ...extra,
  });
  const rows = (body.features || []).map((f) => f.attributes);
  return {
    rows,
    n: rows.length,
    truncationSuspect: isTruncationSuspect(rows.length),
    exceededTransferLimit: body.exceededTransferLimit === true,
  };
}

/** Attribute query returning rows, with explicit transfer-limit reporting. */
export async function queryRows(layerId, where, outFields, extra = {}) {
  const body = await agsGet(`/${layerId}/query`, {
    where,
    outFields: Array.isArray(outFields) ? outFields.join(',') : outFields,
    returnGeometry: 'false',
    ...extra,
  });
  return {
    rows: (body.features || []).map((f) => f.attributes),
    exceededTransferLimit: body.exceededTransferLimit === true,
  };
}

/** Point-in-polygon identify: which features of `layerId` contain (x,y)? */
export async function queryAtPoint(layerId, x, y, wkid, outFields, extra = {}) {
  const body = await agsGet(`/${layerId}/query`, {
    geometry: JSON.stringify({ x, y, spatialReference: { wkid } }),
    geometryType: 'esriGeometryPoint',
    inSR: String(wkid),
    spatialRel: 'esriSpatialRelIntersects',
    outFields: Array.isArray(outFields) ? outFields.join(',') : outFields,
    returnGeometry: 'false',
    where: '1=1',
    ...extra,
  });
  return {
    rows: (body.features || []).map((f) => f.attributes),
    exceededTransferLimit: body.exceededTransferLimit === true,
  };
}

/** Deterministic seeded PRNG (mulberry32) so every sample is re-runnable. */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function writeOut(name, obj) {
  const fs = require('node:fs');
  fs.writeFileSync(name, JSON.stringify(obj, null, 2));
}
