// VALÈNCIA REGISTER PROBE — shared transport.
//
// Scope: this probe does ONE thing the grammar probe did not — it OPENS the registers that
// `url_abs` points at and asks whether an ordenanza can be reached and parsed.
//
// ⛔ METHOD INVARIANTS carried over from tools/valencia-grammar-probe (read-only reference):
//   - ZERO IS NOT ABSENCE. A zero must be explained before it is reported, including when this
//     probe caused it.
//   - A SUCCESSFUL RESPONSE IS NOT AN APPLIED FILTER. `CQL_FILTER` is accepted and SILENTLY
//     IGNORED by terramapas.icv.gva.es (MapServer). Only `PropertyIsLike` on `cod_ine_mun` is
//     positive-verified AND negative-clean. OGC `PropertyIsEqualTo` on `cod_ine_mun` ERRORS
//     server-side for every municipality including the known positive.
//   - DO NOT SUMMARISE A DOCUMENT YOU DID NOT OPEN. Every claim about a document in this probe
//     is backed by bytes on disk under _docs/.
import fs from 'node:fs';
import path from 'node:path';

export const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
export const DOCS = path.join(DIR, '_docs');
export const WFS = 'https://terramapas.icv.gva.es/0702_Planeamiento';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

let lastCall = 0;
const MIN_GAP_MS = 250; // politer than the grammar probe: these are document servers, not tiles

async function gate() {
    const wait = Math.max(0, lastCall + MIN_GAP_MS - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
}

/** Text fetch. Returns { http, ok, body, headers, url } — `url` is the FINAL url after redirects. */
export async function get(u, timeoutMs = 90000, extraHeaders = {}) {
    await gate();
    try {
        const r = await fetch(u, {
            headers: { 'User-Agent': UA, 'Accept-Language': 'es,ca,en', ...extraHeaders },
            signal: AbortSignal.timeout(timeoutMs),
            redirect: 'follow',
        });
        const buf = Buffer.from(await r.arrayBuffer());
        return {
            http: r.status,
            ok: r.ok,
            url: r.url,
            headers: Object.fromEntries(r.headers.entries()),
            bytes: buf.length,
            buf,
            body: decodeBody(buf, r.headers.get('content-type') || ''),
        };
    } catch (e) {
        return { http: null, ok: false, url: u, headers: {}, bytes: 0, buf: Buffer.alloc(0), body: '', err: String(e.name || e) };
    }
}

/** HEAD — for sizing binaries without downloading them. Falls back to a ranged GET. */
export async function head(u, timeoutMs = 60000) {
    await gate();
    try {
        const r = await fetch(u, { method: 'HEAD', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
        return { http: r.status, ok: r.ok, url: r.url, headers: Object.fromEntries(r.headers.entries()) };
    } catch (e) {
        return { http: null, ok: false, url: u, headers: {}, err: String(e.name || e) };
    }
}

/**
 * ⚠ ENCODING. The register serves ISO-8859-1 (its own url_abs values are Latin-1
 * percent-encoded: `CASTELL%d3N`, not the UTF-8 `CASTELL%C3%93N`). Decoding those bytes as
 * UTF-8 mangles every accented Valencian/Castilian filename — and filenames are how the
 * ordenanza is identified. Sniff, then decode.
 */
export function decodeBody(buf, contentType) {
    let enc = (contentType.match(/charset=([\w-]+)/i) || [])[1];
    if (!enc) {
        const head = buf.slice(0, 2048).toString('latin1');
        enc = (head.match(/charset=["']?([\w-]+)/i) || [])[1];
    }
    enc = (enc || '').toLowerCase();
    // ⚠ THE DECLARATION IS NOT THE TRUTH. The register autoindex sends
    // `Content-Type: text/html;charset=UTF-8` and then serves ISO-8859-1 BYTES
    // (`CASTELLÓN` arrives as 0xD3). Trusting the header mangles every accented
    // Valencian/Castilian filename — and filenames are how the ordenanza is identified.
    // So: validate, never trust.
    const asUtf8 = buf.toString('utf8');
    const utf8Valid = !asUtf8.includes('�');
    if (enc === 'utf-8' || enc === 'utf8') return utf8Valid ? asUtf8 : buf.toString('latin1');
    if (enc) {
        try { return new TextDecoder(enc).decode(buf); } catch { /* fall through */ }
    }
    return utf8Valid ? asUtf8 : buf.toString('latin1');
}

/** Percent-encode a path segment the way the register does: Latin-1 bytes, not UTF-8. */
export function latin1PathEncode(s) {
    return Buffer.from(s, 'latin1')
        .toString('binary')
        .split('')
        .map((ch) => (/[A-Za-z0-9\-._~/]/.test(ch) ? ch : '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')))
        .join('');
}

export function owsException(body) {
    if (!body) return null;
    const m = body.match(/ExceptionText>([^<]{0,300})/);
    if (m) return m[1].replace(/\s+/g, ' ').trim();
    if (/ServiceException/i.test(body)) {
        const s = body.match(/ServiceException[^>]*>([^<]{0,300})/);
        if (s) return s[1].replace(/\s+/g, ' ').trim();
    }
    return null;
}

export function countMembers(body) {
    return Math.max((body.match(/<gml:featureMember>/g) || []).length, (body.match(/<wfs:member>/g) || []).length);
}

/**
 * The PROVEN transport. `PropertyIsLike` on cod_ine_mun — positive-verified and negative-clean
 * in the grammar probe. Never PropertyIsEqualTo (server-side error), never CQL (silently ignored).
 */
export function likeFilter(ine, field = 'cod_ine_mun') {
    return `<Filter><PropertyIsLike wildCard="*" singleChar="?" escapeChar="!"><PropertyName>${field}</PropertyName><Literal>${ine}</Literal></PropertyIsLike></Filter>`;
}

export function wfsUrl({ typename, filter, maxfeatures = 5, propertyname = null, version = '1.1.0', hits = false }) {
    let u = `${WFS}?service=WFS&version=${version}&request=GetFeature&typename=${encodeURIComponent(typename)}`;
    if (filter) u += `&filter=${encodeURIComponent(filter)}`;
    if (propertyname) u += `&propertyname=${encodeURIComponent(propertyname)}`;
    if (hits) u += '&resultType=hits';
    else if (maxfeatures != null) u += `&maxfeatures=${maxfeatures}`;
    return u;
}

export function parseFeatures(body) {
    const out = [];
    for (const c of body.split(/<gml:featureMember>|<wfs:member>/).slice(1)) {
        const props = {};
        for (const m of c.matchAll(/<ms:([A-Za-z0-9_]+)>([^<]*)<\/ms:\1>/g)) if (m[1] !== 'msGeometry') props[m[1]] = m[2];
        for (const m of c.matchAll(/<ms:([A-Za-z0-9_]+)\s*\/>/g)) if (!(m[1] in props)) props[m[1]] = null;
        if (Object.keys(props).length) out.push(props);
    }
    return out;
}

export function save(name, obj) {
    fs.writeFileSync(path.join(DIR, name), JSON.stringify(obj, null, 1));
}
export function load(name) {
    return JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8'));
}
export function ensureDocs() {
    fs.mkdirSync(DOCS, { recursive: true });
}
