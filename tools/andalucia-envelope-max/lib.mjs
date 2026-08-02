// §ANDALUCIA-ENVELOPE-MAX — shared transport helpers.
// Every fetch records HTTP status, byte count and the FULL error string. HTTP 200 is not success.
export const UA = { 'User-Agent': 'PRYZM-andalucia-envelope-max/1.0 (+pryzmhello@gmail.com)' };

export async function get(url, { timeout = 60000, headers = {} } = {}) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
        const r = await fetch(url, { headers: { ...UA, ...headers }, signal: ctl.signal, redirect: 'follow' });
        const body = await r.text();
        return { ok: r.ok, status: r.status, ct: r.headers.get('content-type') || '', bytes: body.length, body, url: r.url };
    } catch (e) {
        return { ok: false, status: 0, ct: '', bytes: 0, body: '', err: String(e && e.message || e), url };
    } finally { clearTimeout(t); }
}

export async function getJson(url, opts) {
    const r = await get(url, opts);
    if (!r.body) return { ...r, json: null };
    try { return { ...r, json: JSON.parse(r.body) }; }
    catch { return { ...r, json: null, parseError: r.body.slice(0, 400) }; }
}

// ArcGIS: HTTP 200 with {"error":{...}} is a FAILURE. Read the whole error string.
export function arcgisError(j) {
    if (!j) return 'non-json';
    if (j.error) return `ArcGIS error ${j.error.code}: ${j.error.message} :: ${JSON.stringify(j.error.details || [])}`;
    return null;
}

export const TRUNCATION_SUSPECTS = new Set([1000, 2000, 3000, 5000, 100000]);

// POPULATED IS NOT PRESENT. A field that exists but is null/''/0-as-sentinel is NOT a valid value.
export function isValid(v) {
    if (v === null || v === undefined) return false;
    if (typeof v === 'string') {
        const s = v.trim();
        if (s === '' || s === '-' || s === '--') return false;
        if (/^(n\/?d|nd|s\/?d|null|none|no consta|sin dato|no aplica|n\.a\.?|na|0)$/i.test(s)) return false;
        return true;
    }
    if (typeof v === 'number') return Number.isFinite(v) && v !== 0 && v !== -1 && v !== -9999;
    return true;
}

export function pct(n, d) { return d === 0 ? null : Math.round((10000 * n) / d) / 100; }
