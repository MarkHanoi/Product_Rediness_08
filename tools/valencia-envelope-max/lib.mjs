// VALÈNCIA ENVELOPE MAXIMUM — shared transport.
//
// VENDORED, not imported: the two input probes (tools/valencia-grammar-probe,
// tools/valencia-register-probe) live on `main` and are NOT present in this worktree. Their
// transport is reproduced here with attribution so this probe runs standalone. Behaviour that
// matters is re-derived, not assumed — see the calibration in 03-sniff.mjs.
//
// ⛔ METHOD INVARIANTS carried forward (both prior probes paid for these):
//   - A SUCCESSFUL RESPONSE IS NOT AN APPLIED FILTER. `CQL_FILTER` is accepted and SILENTLY
//     IGNORED by terramapas.icv.gva.es (MapServer). Only OGC `PropertyIsLike` on `cod_ine_mun`
//     is positive-verified AND negative-clean. `PropertyIsEqualTo` ERRORS server-side for every
//     municipality including the known positive — read as "no data" it is a FALSE NEGATIVE.
//   - ZERO IS NOT ABSENCE. A zero must be explained before it is reported, INCLUDING when this
//     probe caused it (`propertyname` without `msGeometry` suppresses geometry → 0 km²).
//   - A REGEX THAT DOES NOT MATCH IS NOT AN ABSENT FIELD. Every negative needs a positive control.
//   - AN UNSOURCED DENOMINATOR IS NOT A CONTROL. Every share states its denominator and where
//     the denominator came from.
//   - DO NOT SUMMARISE A DOCUMENT YOU DID NOT OPEN.
import fs from 'node:fs';
import path from 'node:path';
import { textLayer } from './pdftext.mjs';

export const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
export const DOCS = path.join(DIR, '_docs');
export const WFS = 'https://terramapas.icv.gva.es/0702_Planeamiento';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// ── POLITENESS ───────────────────────────────────────────────────────────────
// A bounded worker pool with a global inter-request gap. 542 registers is ~10k directory
// listings; serialising at 250 ms would take hours. 4 workers × 100 ms global gap ≈ 10 req/s
// against an Apache autoindex, which is a fraction of one browser tab opening a folder.
let lastCall = 0;
export const GAP_MS = Number(process.env.VEM_GAP_MS || 100);
export const POOL = Number(process.env.VEM_POOL || 4);

async function gate() {
    const wait = Math.max(0, lastCall + GAP_MS - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastCall = Math.max(Date.now(), lastCall + GAP_MS);
}

/** Run `fn` over `items` with bounded concurrency, preserving input order in the output. */
export async function pool(items, n, fn, onDone) {
    const out = new Array(items.length);
    let next = 0, done = 0;
    async function worker() {
        for (;;) {
            const i = next++;
            if (i >= items.length) return;
            out[i] = await fn(items[i], i);
            done++;
            if (onDone) onDone(done, items.length, out[i], items[i]);
        }
    }
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
    return out;
}

/** Text/binary fetch. Returns { http, ok, body, buf, headers, url } — url is FINAL after redirects. */
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
            http: r.status, ok: r.ok, url: r.url,
            headers: Object.fromEntries(r.headers.entries()),
            bytes: buf.length, buf,
            body: decodeBody(buf, r.headers.get('content-type') || ''),
        };
    } catch (e) {
        return { http: null, ok: false, url: u, headers: {}, bytes: 0, buf: Buffer.alloc(0), body: '', err: String(e.name || e) };
    }
}

/**
 * ⚠ ENCODING. The register autoindex sends `Content-Type: text/html;charset=UTF-8` and then
 * serves ISO-8859-1 BYTES (`CASTELLÓN` arrives as 0xD3; its own url_abs values are Latin-1
 * percent-encoded, `CASTELL%d3N`). Trusting the header mangles every accented Valencian/
 * Castilian filename — and FILENAMES ARE HOW THE ORDENANZA IS IDENTIFIED. Validate, never trust.
 */
export function decodeBody(buf, contentType) {
    let enc = (contentType.match(/charset=([\w-]+)/i) || [])[1];
    if (!enc) {
        const head = buf.slice(0, 2048).toString('latin1');
        enc = (head.match(/charset=["']?([\w-]+)/i) || [])[1];
    }
    enc = (enc || '').toLowerCase();
    const asUtf8 = buf.toString('utf8');
    const utf8Valid = !asUtf8.includes('�');
    if (enc === 'utf-8' || enc === 'utf8') return utf8Valid ? asUtf8 : buf.toString('latin1');
    if (enc) { try { return new TextDecoder(enc).decode(buf); } catch { /* fall through */ } }
    return utf8Valid ? asUtf8 : buf.toString('latin1');
}

// ── PDF STRUCTURE ────────────────────────────────────────────────────────────
// Reads the PDF's OWN OBJECT STRUCTURE from raw bytes, no poppler. A born-digital text PDF
// embeds FONT PROGRAMS (/FontFile*); a scan embeds IMAGES under a scan codec and NO font
// programs. Per ISO 32000-1 §7.5.7 a STREAM object can never live inside an /ObjStm, so both
// signals are always visible in the file body — that is what makes a 512 KB head sniff sound.
const SIGS = {
    fontProgram: /\/FontFile[23]?\b/g,
    fontRef: /\/Type\s*\/Font\b/g,
    dct: /\/DCTDecode\b/g,
    ccitt: /\/CCITTFaxDecode\b/g,
    jbig2: /\/JBIG2Decode\b/g,
    jpx: /\/JPXDecode\b/g,
    imageXObj: /\/Subtype\s*\/Image\b/g,
    objStm: /\/ObjStm\b/g,
};

export function structure(buf) {
    const s = buf.toString('latin1');
    const c = {};
    for (const [k, re] of Object.entries(SIGS)) c[k] = (s.match(re) || []).length;
    c.scanCodecImages = c.dct + c.ccitt + c.jbig2 + c.jpx;
    return c;
}

/**
 * ⛔ CLASSIFY ON PAINTED TEXT, NOT ON EMBEDDED FONTS. See pdftext.mjs for the measured
 * counter-example that killed the font test (`/FontFile` = 0 across an ENTIRE 809 KB file that
 * poppler reads 32,121 characters out of). `fontProgram > 0` is sufficient for born-digital and
 * is NOT necessary — fonts may be non-embedded, and font dicts, being plain objects, can hide
 * inside an /ObjStm. The decisive signal is Tj/TJ text in an inflated content stream.
 *
 * TEXT_MIN is set by the calibration in 03-sniff.mjs, not by taste: it must sit above the
 * incidental text a pure scan carries (stamped page numbers, a registry header) and below the
 * text a real ordinance page carries. The calibration prints both distributions.
 */
export const TEXT_MIN = Number(process.env.VEM_TEXT_MIN || 400);

export function classify(c) {
    const hasText = (c.textChars || 0) >= TEXT_MIN;
    if (hasText && c.scanCodecImages === 0) return 'TEXT-LAYER';
    if (hasText && c.scanCodecImages > 0) return 'TEXT+RASTER';  // text doc with figures, OR an OCR'd scan
    if (c.scanCodecImages > 0) return 'SCAN';
    return 'UNDECIDED-IN-HEAD';
}

export function dominantCodec(c) {
    const e = [['JBIG2', c.jbig2], ['CCITT', c.ccitt], ['JPEG', c.dct], ['JPX', c.jpx]].filter((x) => x[1] > 0);
    if (!e.length) return null;
    e.sort((a, b) => b[1] - a[1]);
    return e[0][0];
}

export const HEAD_BYTES = 512 * 1024;

/** 512 KB HTTP Range head sniff. Calibrated in 03-sniff.mjs before any sweep is reported. */
export async function sniff(url, headBytes = HEAD_BYTES) {
    const r = await get(url, 120000, { Range: `bytes=0-${headBytes - 1}` });
    if (!r.ok) return { st: 'BLOCKED', why: r.err || `HTTP ${r.http}` };
    const buf = r.buf.slice(0, headBytes);
    if (buf.slice(0, 5).toString('latin1') !== '%PDF-') {
        return { st: 'NOT-A-PDF', http: r.http, magic: buf.slice(0, 8).toString('latin1') };
    }
    const c = structure(buf);
    const t = textLayer(buf);
    c.textChars = t.textChars;
    return {
        st: 'OK', http: r.http, ranged: r.http === 206, bytesSeen: buf.length,
        totalBytes: Number(r.headers['content-range']?.split('/')[1]) || r.bytes,
        fontProgram: c.fontProgram, scanCodecImages: c.scanCodecImages, imageXObj: c.imageXObj,
        textChars: t.textChars, streamsInflated: t.streamsInflated,
        codecs: { dct: c.dct, ccitt: c.ccitt, jbig2: c.jbig2, jpx: c.jpx },
        codec: dominantCodec(c),
        klass: classify(c),
    };
}

// ── WFS ──────────────────────────────────────────────────────────────────────
/** The PROVEN transport. Never PropertyIsEqualTo (server error), never CQL (silently ignored). */
export function likeFilter(v, field = 'cod_ine_mun') {
    return `<Filter><PropertyIsLike wildCard="*" singleChar="?" escapeChar="!"><PropertyName>${field}</PropertyName><Literal>${v}</Literal></PropertyIsLike></Filter>`;
}

export function wfsUrl({ typename, filter, maxfeatures = null, propertyname = null, version = '1.1.0', hits = false }) {
    let u = `${WFS}?service=WFS&version=${version}&request=GetFeature&typename=${encodeURIComponent(typename)}`;
    if (filter) u += `&filter=${encodeURIComponent(filter)}`;
    if (propertyname) u += `&propertyname=${encodeURIComponent(propertyname)}`;
    if (hits) u += '&resultType=hits';
    else if (maxfeatures != null) u += `&maxfeatures=${maxfeatures}`;
    return u;
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

// Areas are computed by shoelace directly on gml:posList, which is EPSG:25830 — a PROJECTED
// CRS in metres — so no reprojection is involved and m² is exact.
export function ringArea(posList) {
    const c = posList.trim().split(/\s+/).map(Number);
    let a = 0;
    for (let i = 0, n = c.length / 2; i < n; i++) {
        const j = (i + 1) % n;
        a += c[2 * i] * c[2 * j + 1] - c[2 * j] * c[2 * i + 1];
    }
    return Math.abs(a) / 2;
}

/** Area per feature = exterior rings MINUS interior rings. */
export function featureArea(chunk) {
    let a = 0;
    for (const m of chunk.matchAll(/<gml:exterior>[\s\S]*?<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/g)) a += ringArea(m[1]);
    for (const m of chunk.matchAll(/<gml:interior>[\s\S]*?<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/g)) a -= ringArea(m[1]);
    return a;
}

// ── IO ───────────────────────────────────────────────────────────────────────
export function save(name, obj) { fs.writeFileSync(path.join(DIR, name), JSON.stringify(obj, null, 1)); }
export function load(name) { return JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8')); }
export function exists(name) { return fs.existsSync(path.join(DIR, name)); }
export function ensureDocs() { fs.mkdirSync(DOCS, { recursive: true }); }
export function pct(a, b) { return b ? +((100 * a) / b).toFixed(2) : null; }
