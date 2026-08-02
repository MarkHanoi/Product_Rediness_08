/**
 * Shared helpers for the Madrid spacm_* probe.
 *
 * DISCIPLINE (docs/04-reference/standards/PROBE-DISCIPLINE.md):
 *  - R5: network failure, service exception and genuine-empty are THREE different facts.
 *        `get()` never collapses them. HTTP 200 carrying an OWS ExceptionReport is a FAILURE.
 *  - Truncation suspects: any count landing exactly on a round maxRecordCount is flagged.
 */

export const WFS = 'https://idem.comunidad.madrid/geoserver3/wfs';

const UA = 'PRYZM-madrid-spacm-probe/1.0 (planning-data measurement)';

/** Raw fetch that separates transport failure / service exception / body. */
export async function get(url, { timeoutMs = 120000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': UA } });
    const body = await res.text();
    // HTTP 200 IS NOT SUCCESS on an OGC service — a 200 can carry an ExceptionReport.
    const owsException = /ExceptionReport|ServiceException|<ows:ExceptionText/i.test(body)
      ? (body.match(/<ows:ExceptionText[^>]*>([\s\S]*?)<\/ows:ExceptionText>/i)?.[1]
         ?? body.match(/<ServiceException[^>]*>([\s\S]*?)<\/ServiceException>/i)?.[1]
         ?? 'unparsed exception').trim().slice(0, 400)
      : null;
    return {
      ok: res.ok && !owsException,
      status: res.status,
      contentType: res.headers.get('content-type') ?? '',
      bytes: Buffer.byteLength(body),
      owsException,
      transportError: null,
      body,
      url,
    };
  } catch (e) {
    return {
      ok: false, status: 0, contentType: '', bytes: 0,
      owsException: null, transportError: String(e?.message ?? e), body: '', url,
    };
  } finally {
    clearTimeout(t);
  }
}

export async function getJson(url, opts) {
  const r = await get(url, opts);
  if (!r.ok) return { ...r, json: null };
  try {
    return { ...r, json: JSON.parse(r.body) };
  } catch (e) {
    return { ...r, ok: false, owsException: `non-JSON body: ${String(e).slice(0, 200)}`, json: null };
  }
}

export function q(params) {
  return WFS + '?' + new URLSearchParams(params).toString();
}

/** WFS 2.0 hits-only count. Returns {count|null, diag}. Never invents a number. */
export async function hits(typeName, cql) {
  const p = {
    service: 'WFS', version: '2.0.0', request: 'GetFeature',
    typeNames: typeName, resultType: 'hits',
  };
  if (cql) p.CQL_FILTER = cql;
  const r = await get(q(p));
  if (!r.ok) return { count: null, diag: r };
  const m = r.body.match(/numberMatched="(\d+|unknown)"/);
  if (!m) return { count: null, diag: { ...r, owsException: 'no numberMatched in response' } };
  if (m[1] === 'unknown') return { count: null, diag: { ...r, owsException: 'numberMatched=unknown' } };
  return { count: Number(m[1]), diag: r };
}

/** Truncation suspicion — a count sitting exactly on a service cap is not a count. */
export const ROUND_CAPS = new Set([1000, 2000, 3000, 5000, 10000, 50000, 100000]);
export function truncationSuspect(n) {
  return n != null && ROUND_CAPS.has(n);
}

export function pct(n, d) {
  if (!d) return null;
  return Math.round((n / d) * 10000) / 100;
}
