// §ANDALUCIA-ENVELOPE-MAX / step 6 — CODEC DETECTION MUST RUN ON THE DECOMPRESSED OBJECT TREE.
//
// ⭐ NATIONAL FINDING (method). Step 5 reported codec=Flate, images=0, chars=0 for 12 of 13 Córdoba
// ordenanza PDFs — a document with neither text nor images, which is impossible. The cause is
// PDF >= 1.5 OBJECT STREAMS (/Type /ObjStm): object dictionaries — including /Subtype /Image,
// /Font, and THE FILTER NAMES THEMSELVES — live INSIDE a compressed stream. A raw-byte regex for
// /JBIG2Decode therefore cannot see them.
//
// ⛔ CONSEQUENCE: a NEGATIVE codec verdict obtained by grepping raw PDF bytes is UNSOUND on any
// PDF 1.5+. Positive detection stays sound; ABSENCE DOES NOT. Any "not JBIG2" conclusion drawn
// that way must be re-derived on the inflated object tree, which is what this does.
//
// It also fixes the extractor: PDF text can be written as HEX strings <0048…> Tj, which a
// `\(...\)`-only extractor silently drops — the same class of error, one layer up.
import { writeFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { UA } from './lib.mjs';

const TARGETS = process.argv.slice(2);

async function getBuf(url, timeout = 120000) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
    try { const r = await fetch(url, { headers: UA, signal: ctl.signal }); return { ok: r.ok, status: r.status, buf: Buffer.from(await r.arrayBuffer()) }; }
    catch (e) { return { ok: false, status: 0, buf: Buffer.alloc(0), err: String(e.message || e) }; }
    finally { clearTimeout(t); }
}

function inflateAll(buf) {
    const s = buf.toString('latin1');
    const parts = []; let streams = 0, inflated = 0;
    const re = /stream\r\n|stream\n|stream\r/g; let m;
    while ((m = re.exec(s))) {
        const start = m.index + m[0].length;
        const end = s.indexOf('endstream', start);
        if (end < 0) continue;
        streams++;
        const raw = buf.subarray(start, end);
        let dec = null;
        try { dec = zlib.inflateSync(raw); } catch { try { dec = zlib.inflateRawSync(raw); } catch { dec = null; } }
        if (dec) { inflated++; parts.push(dec); }
    }
    return { corpus: Buffer.concat(parts).toString('latin1'), streams, inflated };
}

// Linear scanner — no backtracking. A regex-based TJ-array parser blows up on multi-MB corpora.
function textFrom(c) {
    let t = '', i = 0;
    const n = c.length;
    while (i < n) {
        const ch = c[i];
        if (ch === '(') {
            let j = i + 1, depth = 1, s = '';
            while (j < n && depth > 0) {
                const d = c[j];
                if (d === '\\') {
                    const e = c[j + 1];
                    if (e >= '0' && e <= '7') { let o = ''; let k = j + 1; while (k < n && o.length < 3 && c[k] >= '0' && c[k] <= '7') o += c[k++]; s += String.fromCharCode(parseInt(o, 8)); j = k; continue; }
                    s += e === 'n' ? '\n' : e === 'r' ? '' : e === 't' ? '\t' : e; j += 2; continue;
                }
                if (d === '(') depth++;
                else if (d === ')') { depth--; if (depth === 0) { j++; break; } }
                s += d; j++;
            }
            t += s; i = j; continue;
        }
        if (ch === '<' && c[i + 1] !== '<') {
            const close = c.indexOf('>', i);
            if (close > i && close - i < 4000) {
                const h = c.slice(i + 1, close).replace(/[^0-9A-Fa-f]/g, '');
                if (h.length >= 4 && h.length % 2 === 0) {
                    let s = '';
                    for (let k = 0; k < h.length; k += 2) s += String.fromCharCode(parseInt(h.slice(k, k + 2), 16));
                    t += s;
                }
                i = close + 1; continue;
            }
        }
        i++;
    }
    return t;
}

const FILTERS = ['JBIG2Decode', 'CCITTFaxDecode', 'DCTDecode', 'JPXDecode', 'FlateDecode', 'LZWDecode', 'RunLengthDecode'];
const count = (s, lit) => { let n = 0, i = 0; while ((i = s.indexOf(lit, i)) >= 0) { n++; i += lit.length; } return n; };

const out = { measuredAt: new Date().toISOString(), methodFinding: 'codec detection on raw PDF bytes is UNSOUND for PDF>=1.5 (object streams); absence must be re-derived on the inflated object tree', docs: [] };

for (const u of TARGETS) {
    const r = await getBuf(u);
    if (!r.buf.subarray(0, 4).toString('latin1').startsWith('%PDF')) {
        out.docs.push({ url: u, status: r.status, bytes: r.buf.length, verdict: 'NOT A PDF (dead link / placeholder / image)', magic: r.buf.subarray(0, 12).toString('latin1').replace(/[^\x20-\x7e]/g, '.') });
        console.log(`${u.split('/').pop().padEnd(48)} DEAD/NOT-PDF (HTTP ${r.status}, ${r.buf.length}B)`); continue;
    }
    const rawS = r.buf.toString('latin1');
    const { corpus, streams, inflated } = inflateAll(r.buf);
    const rec = { url: u, bytes: r.buf.length, version: (rawS.match(/^%PDF-([\d.]+)/) || [])[1] ?? null, streams, inflated, raw: {}, tree: {} };
    rec.objStm = count(rawS, '/ObjStm') + count(corpus, '/ObjStm');
    for (const f of FILTERS) { rec.raw[f] = count(rawS, '/' + f); rec.tree[f] = count(corpus, '/' + f); }
    rec.imagesRaw = count(rawS, '/Image'); rec.imagesTree = count(corpus, '/Image');
    rec.fontsRaw = count(rawS, '/BaseFont'); rec.fontsTree = count(corpus, '/BaseFont');
    const txt = textFrom(corpus);
    rec.chars = txt.replace(/\s/g, '').length;
    rec.text = txt;
    rec.jbig2 = rec.raw.JBIG2Decode + rec.tree.JBIG2Decode > 0;
    rec.imageCodec = ['JBIG2Decode', 'CCITTFaxDecode', 'JPXDecode', 'DCTDecode'].filter(f => rec.raw[f] + rec.tree[f] > 0);
    const anyImage = rec.imagesRaw + rec.imagesTree > 0;
    rec.verdict = rec.jbig2 ? '⛔ JBIG2 — REFUSE numeric extraction (digit substitution, no visual artefact, upstream of OCR)'
        : rec.chars >= 400 ? 'BORN-DIGITAL TEXT — safe to parse'
            : anyImage ? `RASTER SCAN, image codec ${rec.imageCodec.join('+') || 'Flate(lossless)'} — OCR required, values NOT machine-readable`
                : `UNKNOWN — ${rec.chars} chars, ${inflated}/${streams} streams inflated, no image object found; treat as UNKNOWN NOT as empty`;
    out.docs.push(rec);
    console.log(`${u.split('/').pop().padEnd(48)} v${rec.version} ${String(rec.bytes).padStart(8)}B objStm=${String(rec.objStm).padStart(3)} img raw/tree=${rec.imagesRaw}/${rec.imagesTree} font raw/tree=${rec.fontsRaw}/${rec.fontsTree} chars=${String(rec.chars).padStart(6)}`);
    console.log(`    raw filters : ${FILTERS.filter(f => rec.raw[f]).map(f => f + '×' + rec.raw[f]).join(' ') || 'NONE'}`);
    console.log(`    TREE filters: ${FILTERS.filter(f => rec.tree[f]).map(f => f + '×' + rec.tree[f]).join(' ') || 'NONE'}`);
    console.log(`    => ${rec.verdict}`);
}
const name = process.env.OUTNAME || '06-pdf-objstm-codec';
writeFileSync(new URL(`./out/${name}.json`, import.meta.url), JSON.stringify(out, null, 2));
console.log(`\nwrote out/${name}.json`);
