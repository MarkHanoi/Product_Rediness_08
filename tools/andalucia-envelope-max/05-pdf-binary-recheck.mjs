// §ANDALUCIA-ENVELOPE-MAX / step 5 — BINARY RE-CHECK of step 4.
//
// ⛔ Step 4 extracted 0 chars from PDFs that DO carry /Font. A regex that does not match is not an
// absent field, and an extractor that returns nothing is not a scan. Step 4 fetched via text() and
// round-tripped bytes through latin1, which corrupts deflate streams. Redo on real bytes.
// Only after a WORKING extractor does "0 chars" mean "raster".
import { writeFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { UA, getJson } from './lib.mjs';

async function getBuf(url, timeout = 120000) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
    try {
        const r = await fetch(url, { headers: UA, signal: ctl.signal });
        const b = Buffer.from(await r.arrayBuffer());
        return { ok: r.ok, status: r.status, ct: r.headers.get('content-type') || '', buf: b };
    } catch (e) { return { ok: false, status: 0, ct: '', buf: Buffer.alloc(0), err: String(e.message || e) }; }
    finally { clearTimeout(t); }
}

// Proper-ish extractor: walk every `stream ... endstream` on BYTES, inflate, collect text operators.
function extract(buf) {
    const out = { text: '', streams: 0, inflated: 0, imageXObjects: 0 };
    const s = buf.toString('latin1'); // index positions only — slicing is done on the Buffer
    const re = /stream\r\n|stream\n|stream\r/g;
    let m;
    while ((m = re.exec(s))) {
        const start = m.index + m[0].length;
        const end = s.indexOf('endstream', start);
        if (end < 0) continue;
        out.streams++;
        const raw = buf.subarray(start, end);
        let dec = null;
        try { dec = zlib.inflateSync(raw); } catch { try { dec = zlib.inflateRawSync(raw); } catch { dec = null; } }
        if (!dec) continue;
        out.inflated++;
        const d = dec.toString('latin1');
        if (!/\bTj\b|\bTJ\b|\bTd\b|\bBT\b/.test(d)) continue;
        for (const t of d.matchAll(/\((?:\\.|[^\\()])*\)/g)) {
            out.text += t[0].slice(1, -1)
                .replace(/\\(\d{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
                .replace(/\\([()\\])/g, '$1');
        }
        out.text += '\n';
    }
    out.imageXObjects = (s.match(/\/Subtype\s*\/Image/g) || []).length;
    return out;
}

const PROBES = [
    ['altura', /altura/i], ['plantas', /plantas?\b/i], ['ocupacion', /ocupaci/i],
    ['edificabilidad', /edificabilid|aprovechamiento/i], ['retranqueo', /retranqueo|separaci[oó]n a lind/i],
    ['alineacion', /alineaci/i], ['fondo', /fondo\s+(?:m[aá]x\w*\s+)?edificable/i],
    ['parcelaMinima', /parcela\s+m[ií]nima/i], ['densidad', /densidad/i],
];
const GRAPHIC = /(?:definid|grafiad|se[ñn]alad|indicad|reflejad|fijad|establecid)\w*\s+(?:gr[aá]fica\w*\s+)?(?:en\s+)?(?:el\s+|los\s+|la\s+)?(?:plano|planos|documentaci[oó]n\s+gr[aá]fica)|seg[uú]n\s+(?:el\s+)?plano|plano\s+n[ºo°.]?\s*\d|planos?\s+de\s+ordenaci[oó]n/i;

const GS = 'https://geoserver.pgou.coacordoba.org/geoserver/wfs';
const ord = await getJson(`${GS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=coaco:ordenanzas&outputFormat=application/json&count=100000`, { timeout: 120000 });
const urls = [...new Set(ord.json.features.map(f => f.properties.link).filter(Boolean))];

const out = { measuredAt: new Date().toISOString(), docs: [] };
for (const u of urls) {
    const r = await getBuf(u);
    const head = r.buf.subarray(0, 8).toString('latin1');
    const rec = { url: u, status: r.status, bytes: r.buf.length, ct: r.ct, magic: head.replace(/[^\x20-\x7e]/g, '.') };
    if (!head.startsWith('%PDF')) { rec.verdict = 'NOT A PDF'; rec.first = r.buf.subarray(0, 80).toString('latin1'); out.docs.push(rec); console.log(`${u.split('/').pop().padEnd(20)} ${rec.verdict}`); continue; }
    const s = r.buf.toString('latin1');
    rec.filters = {
        JBIG2Decode: (s.match(/\/JBIG2Decode/g) || []).length,
        CCITTFaxDecode: (s.match(/\/CCITTFaxDecode/g) || []).length,
        DCTDecode: (s.match(/\/DCTDecode/g) || []).length,
        JPXDecode: (s.match(/\/JPXDecode/g) || []).length,
        FlateDecode: (s.match(/\/FlateDecode/g) || []).length,
        LZWDecode: (s.match(/\/LZWDecode/g) || []).length,
    };
    rec.producer = (s.match(/\/Producer\s*\(([^)]{0,120})\)/) || [])[1] ?? null;
    rec.creator = (s.match(/\/Creator\s*\(([^)]{0,120})\)/) || [])[1] ?? null;
    rec.pages = (s.match(/\/Type\s*\/Page[^s]/g) || []).length;
    rec.fonts = (s.match(/\/BaseFont\s*\/([A-Za-z0-9+,-]+)/g) || []).map(x => x.split('/').pop());
    const e = extract(r.buf);
    rec.streams = e.streams; rec.inflated = e.inflated; rec.imageXObjects = e.imageXObjects;
    rec.chars = e.text.replace(/\s/g, '').length;
    rec.params = Object.fromEntries(PROBES.map(([k, re2]) => [k, re2.test(e.text)]));
    rec.graphic = GRAPHIC.test(e.text);
    rec.graphicSnippet = (e.text.match(GRAPHIC) || [])[0] ?? null;
    rec.articleMentions = (e.text.match(/art[ií]culo\s*\d|\bart\.?\s*\d/gi) || []).length;
    rec.textSample = e.text.replace(/\s+/g, ' ').slice(0, 900);
    // ⭐ codec verdict, stated as the correct OUTPUT not just a label
    rec.codec = rec.filters.JBIG2Decode > 0 ? 'JBIG2'
        : rec.filters.CCITTFaxDecode > 0 ? 'CCITT-G4'
            : rec.filters.JPXDecode > 0 ? 'JPEG2000'
                : rec.filters.DCTDecode > 0 ? 'JPEG/DCT'
                    : 'Flate';
    rec.verdict = rec.chars >= 200 ? 'BORN-DIGITAL TEXT'
        : rec.imageXObjects > 0 ? `RASTER SCAN (${rec.codec}) — ${rec.imageXObjects} image XObjects, ${rec.chars} extractable chars`
            : `NO TEXT RECOVERED (${rec.chars} chars, ${rec.inflated}/${rec.streams} streams inflated)`;
    out.docs.push(rec);
    console.log(`${u.split('/').pop().padEnd(20)} ${String(rec.pages).padStart(3)}p ${String(rec.bytes).padStart(8)}B codec=${rec.codec.padEnd(9)} imgs=${String(rec.imageXObjects).padStart(3)} chars=${String(rec.chars).padStart(6)} :: ${rec.verdict}`);
    if (rec.chars >= 200) console.log(`     params: ${Object.entries(rec.params).filter(([, v]) => v).map(([k]) => k).join(', ') || 'NONE'} | graphic=${rec.graphic} | arts=${rec.articleMentions}`);
    if (rec.chars > 0 && rec.chars < 200) console.log(`     recovered: "${rec.textSample.slice(0, 200)}"`);
}
writeFileSync(new URL('./out/05-pdf-binary-recheck.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('\nwrote out/05-pdf-binary-recheck.json');
