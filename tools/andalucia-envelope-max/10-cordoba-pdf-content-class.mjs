// §ANDALUCIA-ENVELOPE-MAX / step 10 — WHAT KIND OF PDF IS IT, REALLY.
//
// Step 6 found: 64 flate streams, ALL inflate, ZERO /Image objects, ZERO /BaseFont, ZERO text
// operators. A PDF with no text and no image is not a scan and not born-digital text — so neither
// existing label is right. This classifies by CONTENT-STREAM OPERATOR HISTOGRAM, which is the only
// evidence that distinguishes the three cases:
//   BT/Tj/TJ present            -> text layer
//   Do + /Image XObject         -> raster scan
//   m/l/c/re/f/S dominant, no BT -> ⭐ TEXT CONVERTED TO VECTOR OUTLINES ("outlined text")
//
// ⭐ The third case is a DISTINCT ingestion class and it is worse than a scan for a naive pipeline:
// a scan is obviously unreadable, whereas an outlined-text PDF LOOKS like a normal digital PDF in
// a viewer, opens instantly, has no visual artefact, and silently yields zero characters. A
// pipeline that treats "0 chars extracted" as "empty document" will record it as NO PARAMETERS
// when in fact the parameters are present and legible to a human. That is the same failure family
// as JBIG2 digit substitution: the corruption is upstream of OCR and invisible.
import { writeFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { UA } from './lib.mjs';

async function getBuf(url, timeout = 120000) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
    try { const r = await fetch(url, { headers: UA, signal: ctl.signal }); return { ok: r.ok, status: r.status, buf: Buffer.from(await r.arrayBuffer()) }; }
    catch (e) { return { ok: false, status: 0, buf: Buffer.alloc(0), err: String(e.message || e) }; } finally { clearTimeout(t); }
}
function streamsOf(buf) {
    const s = buf.toString('latin1'); const res = [];
    const re = /stream\r\n|stream\n|stream\r/g; let m;
    while ((m = re.exec(s))) {
        const start = m.index + m[0].length; const end = s.indexOf('endstream', start);
        if (end < 0) continue;
        let dec = null; const raw = buf.subarray(start, end);
        try { dec = zlib.inflateSync(raw); } catch { try { dec = zlib.inflateRawSync(raw); } catch { dec = null; } }
        if (dec) res.push(dec.toString('latin1'));
    }
    return res;
}
const OPS = ['BT', 'ET', 'Tj', 'TJ', 'Tf', 'Td', 'TD', 'Tm', 'Do', 're', ' f\n', ' S\n', ' m\n', ' l\n', ' c\n', 'W n', 'sh', 'BI'];
const countOp = (s, op) => { const re = new RegExp('(?:^|[\\s\\]>)])' + op.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=[\\s\\[<(/]|$)', 'g'); return (s.match(re) || []).length; };

const out = { measuredAt: new Date().toISOString(), docs: [] };
for (const u of process.argv.slice(2)) {
    const r = await getBuf(u);
    if (!r.buf.subarray(0, 4).toString('latin1').startsWith('%PDF')) { console.log(`${u.split('/').pop()} NOT A PDF`); continue; }
    const rawS = r.buf.toString('latin1');
    const streams = streamsOf(r.buf);
    const joined = streams.join('\n');
    const hist = {}; for (const o of OPS) hist[o.trim()] = countOp(joined, o);
    const rec = {
        url: u, bytes: r.buf.length, inflatedStreams: streams.length, corpusChars: joined.length, ops: hist,
        rawHasImage: /\/Subtype\s*\/Image/.test(rawS), rawHasFont: /\/BaseFont|\/Type\s*\/Font/.test(rawS),
        rawFilterNames: [...new Set((rawS.match(/\/(?:JBIG2|CCITTFax|DCT|JPX|Flate|LZW|RunLength)Decode/g) || []))],
        producer: (rawS.match(/\/Producer\s*\(([^)]{0,120})\)/) || [])[1] ?? null,
        creator: (rawS.match(/\/Creator\s*\(([^)]{0,120})\)/) || [])[1] ?? null,
    };
    const textOps = hist.BT + hist.Tj + hist.TJ;
    const vectorOps = hist.m + hist.l + hist.c + hist.re + hist.f + hist.S;
    rec.contentClass = textOps > 20 ? 'TEXT LAYER'
        : (rec.rawHasImage || hist.Do > 0 || hist.BI > 0) ? 'RASTER (image XObject / inline image)'
            : vectorOps > 200 ? '⭐ OUTLINED-TEXT VECTOR — no font, no image, no text operator; glyphs are filled paths. Extractable chars = 0 but the document is NOT empty. OCR requires rasterising first.'
                : 'INDETERMINATE — do not record as empty';
    rec.vectorOps = vectorOps; rec.textOps = textOps;
    out.docs.push(rec);
    console.log(`${u.split('/').pop().padEnd(20)} ${String(r.buf.length).padStart(8)}B streams=${String(streams.length).padStart(4)} corpus=${String(joined.length).padStart(9)} textOps=${String(textOps).padStart(6)} vectorOps=${String(vectorOps).padStart(8)} Do=${hist.Do} img=${rec.rawHasImage} font=${rec.rawHasFont}`);
    console.log(`    producer=${rec.producer} creator=${rec.creator}`);
    console.log(`    => ${rec.contentClass}`);
}
writeFileSync(new URL('./out/10-cordoba-pdf-content-class.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('\nwrote out/10-cordoba-pdf-content-class.json');
