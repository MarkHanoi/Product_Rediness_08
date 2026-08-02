// §ANDALUCIA-ENVELOPE-MAX / step 13 — THE NORMATIVA CORPUS, BOTH CITIES, ON ONE RULER.
//
// ⛔ DISTINCT-URL IS NOT DISTINCT-DOCUMENT. Córdoba publishes O_MC.pdf, O_MC1..O_MC4.pdf — five
// URLs, ALL EXACTLY 1,243,005 BYTES. A distinct-URL count says 5 documents; a content hash says 1.
// This is the same defect class the coordinator just measured on ArcGIS `returnDistinctValues`:
// a count that looks like the thing you want and is actually a count of something else. Here the
// direction is the opposite — it OVERSTATES rather than collapses — so both directions must be
// checked. THE ORACLE IS THE CONTENT HASH, not the identifier.
//
// For each document: SHA-256, PDF content class (text / raster / outlined-vector), codec, and —
// only where a text layer genuinely exists — the parameter and article census.
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';
import { UA, getJson } from './lib.mjs';

async function getBuf(url, timeout = 120000) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
    try { const r = await fetch(url, { headers: UA, signal: ctl.signal }); return { ok: r.ok, status: r.status, ct: r.headers.get('content-type') || '', buf: Buffer.from(await r.arrayBuffer()) }; }
    catch (e) { return { ok: false, status: 0, ct: '', buf: Buffer.alloc(0), err: String(e.message || e) }; } finally { clearTimeout(t); }
}
function streamsOf(buf) {
    const s = buf.toString('latin1'); const res = [];
    const re = /stream\r\n|stream\n|stream\r/g; let m;
    while ((m = re.exec(s))) {
        const a = m.index + m[0].length, b = s.indexOf('endstream', a);
        if (b < 0) continue;
        let d = null; const raw = buf.subarray(a, b);
        try { d = zlib.inflateSync(raw); } catch { try { d = zlib.inflateRawSync(raw); } catch { d = null; } }
        if (d) res.push(d.toString('latin1'));
    }
    return res;
}
function textOf(c) { // linear, no backtracking
    let t = '', i = 0; const n = c.length;
    while (i < n) {
        if (c[i] === '(') {
            let j = i + 1, dep = 1, s = '';
            while (j < n && dep > 0) {
                const d = c[j];
                if (d === '\\') { const e = c[j + 1]; if (e >= '0' && e <= '7') { let o = '', k = j + 1; while (k < n && o.length < 3 && c[k] >= '0' && c[k] <= '7') o += c[k++]; s += String.fromCharCode(parseInt(o, 8)); j = k; continue; } s += e === 'n' || e === 'r' ? ' ' : e; j += 2; continue; }
                if (d === '(') dep++; else if (d === ')') { dep--; if (!dep) { j++; break; } }
                s += d; j++;
            }
            t += s; i = j; continue;
        }
        i++;
    }
    return t;
}
const cnt = (s, l) => { let n = 0, i = 0; while ((i = s.indexOf(l, i)) >= 0) { n++; i += l.length; } return n; };
const op = (s, o) => (s.match(new RegExp('(?:^|[\\s\\]>)])' + o + '(?=[\\s\\[<(/]|$)', 'g')) || []).length;

const PROBES = [
    ['altura', /altura\s+m[aá]xim|altura\s+de\s+la\s+edificaci|altura\s+reguladora|n[uú]mero\s+m[aá]ximo\s+de\s+plantas/i],
    ['plantas', /plantas?\s*(?:m[aá]xim|permitid)|\bPB\s*\+\s*\d|\bB\s*\+\s*\d|\bIII\b|\bIV\b/i],
    ['ocupacion', /ocupaci[oó]n\s+m[aá]xim|ocupaci[oó]n\s+de\s+(?:la\s+)?parcela/i],
    ['edificabilidad', /edificabilidad|aprovechamiento|m²t\s*\/\s*m²s|m2t\/m2s|coeficiente\s+de\s+edificab/i],
    ['retranqueo', /retranqueo|separaci[oó]n\s+a\s+lind|separaci[oó]n\s+m[ií]nima/i],
    ['alineacion', /alineaci[oó]n/i],
    ['fondo', /fondo\s+(?:m[aá]xim\w*\s+)?edificable/i],
    ['parcelaMinima', /parcela\s+m[ií]nima/i],
    ['densidad', /densidad/i],
];
const GRAPHIC = /(?:definid|grafiad|se[ñn]alad|indicad|reflejad|fijad|establecid|determinad)\w*\s+(?:gr[aá]fica\w*\s+)?(?:en\s+)?(?:el\s+|los\s+|la\s+)?(?:plano|planos|documentaci[oó]n\s+gr[aá]fica|serie)|seg[uú]n\s+(?:el\s+)?plano|plano\s+n[ºo°.]?\s*\d|planos?\s+de\s+(?:ordenaci[oó]n|calificaci[oó]n)/i;

async function classify(url, label) {
    const r = await getBuf(url);
    const rec = { url, label, status: r.status, ct: r.ct, bytes: r.buf.length };
    if (!r.buf.length) { rec.klass = 'DEAD'; rec.note = r.err ?? `HTTP ${r.status}`; return rec; }
    rec.sha256 = createHash('sha256').update(r.buf).digest('hex').slice(0, 16);
    const head = r.buf.subarray(0, 8).toString('latin1');
    if (!head.startsWith('%PDF')) {
        rec.klass = head.startsWith('\xff\xd8') ? 'JPEG IMAGE (a plan sheet, not a text ordinance)'
            : head.includes('<htm') || r.buf.subarray(0, 200).toString('latin1').match(/<html/i) ? 'HTML (placeholder / error page served with HTTP ' + r.status + ')'
                : 'NOT A PDF';
        rec.magic = r.buf.subarray(0, 16).toString('latin1').replace(/[^\x20-\x7e]/g, '.');
        return rec;
    }
    const raw = r.buf.toString('latin1');
    rec.pdfVersion = (raw.match(/^%PDF-([\d.]+)/) || [])[1];
    rec.producer = (raw.match(/\/Producer\s*\(([^)]{0,90})\)/) || [])[1] ?? null;
    const streams = streamsOf(r.buf); const corpus = streams.join('\n');
    rec.codecsRaw = [...new Set((raw.match(/\/(?:JBIG2|CCITTFax|DCT|JPX|Flate|LZW|RunLength)Decode/g) || []))];
    rec.codecsTree = [...new Set((corpus.match(/\/(?:JBIG2|CCITTFax|DCT|JPX|Flate|LZW|RunLength)Decode/g) || []))];
    rec.jbig2 = rec.codecsRaw.includes('/JBIG2Decode') || rec.codecsTree.includes('/JBIG2Decode');
    rec.hasImage = cnt(raw, '/Image') + cnt(corpus, '/Image') > 0;
    rec.hasFont = cnt(raw, '/BaseFont') + cnt(corpus, '/BaseFont') > 0;
    const textOps = op(corpus, 'BT') + op(corpus, 'Tj') + op(corpus, 'TJ');
    const vecOps = op(corpus, 'm') + op(corpus, 'l') + op(corpus, 'c') + op(corpus, 're') + op(corpus, 'f') + op(corpus, 'S');
    rec.textOps = textOps; rec.vectorOps = vecOps;
    const t = textOf(corpus);
    rec.chars = t.replace(/\s/g, '').length;
    rec.klass = rec.jbig2 ? 'JBIG2-SCAN'
        : textOps > 20 && rec.chars > 400 ? 'TEXT'
            : rec.hasImage ? 'RASTER-SCAN'
                : vecOps > 200 ? 'OUTLINED-VECTOR'
                    : 'INDETERMINATE';
    if (rec.klass === 'TEXT') {
        rec.params = Object.fromEntries(PROBES.map(([k, re]) => [k, re.test(t)]));
        rec.graphicDeferral = GRAPHIC.test(t);
        rec.graphicSnippet = (t.match(GRAPHIC) || [])[0] ?? null;
        rec.articles = [...new Set((t.match(/art[ií]culo\s*\d+(?:\.\d+)?/gi) || []).map(x => x.toLowerCase()))].slice(0, 40);
        rec.articleCount = rec.articles.length;
        rec.textSample = t.replace(/\s+/g, ' ').slice(0, 700);
    }
    return rec;
}

const out = { measuredAt: new Date().toISOString(), cordoba: [], malaga: [] };

// ---- CÓRDOBA: every distinct link on coaco:ordenanzas ----
const GS = 'https://geoserver.pgou.coacordoba.org/geoserver/wfs';
const ord = await getJson(`${GS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=coaco:ordenanzas&outputFormat=application/json&count=100000`, { timeout: 180000 });
const cLinks = [...new Set(ord.json.features.map(f => f.properties.link).filter(Boolean))];
console.log(`CÓRDOBA: ${cLinks.length} distinct URLs on coaco:ordenanzas`);
for (const u of cLinks) { const r = await classify(u, 'cordoba'); out.cordoba.push(r); console.log(`  ${u.split('/').pop().padEnd(20)} ${String(r.bytes).padStart(8)}B ${String(r.klass).padEnd(17)} sha=${r.sha256 ?? '-'} chars=${r.chars ?? '-'}`); }

// ---- MÁLAGA: PDF_Normativa_GIS. Filename encodes Título_Capítulo_ZoneName_ZONECODE. ----
const MB = 'https://www.malaga.eu/recursos/urbanismo/GIS_URBANISMO/PGOU/PDF_Normativa_GIS/';
const MFILES = [
    'Norm_TXI_SUNC.pdf', 'Norm_TXII_C1-2_Ordenanza_General_Edificacion_OG.pdf',
    'Norm_TXII_C3_Edificios_Protegidos_EP.pdf', 'Norm_TXII_C4_Ciudad_Historica_CH.pdf',
    'Norm_TXII_C5_Manzana_Cerrada_MC.pdf', 'Norm_TXII_C6_Ordenacion_Abierta_OA.pdf',
    'Norm_TXII_C7_Ciudad_Jardin_CJ.pdf', 'Norm_TXII_C8_Unifamiliar_Aislada_UAS.pdf',
    'Norm_TXII_C9_Unifamiliar_Adosada_UAD.pdf', 'Norm_TXII_C10_Colonia_Tradicional_Popular_CTP.pdf',
    'Norm_TXII_C11_Productivo_PROD.pdf', 'Norm_TXII_C15_Gran_Superficie_Minorista_GSM.pdf',
];
console.log(`\nMÁLAGA: ${MFILES.length} candidate normativa documents`);
for (const f of MFILES) { const r = await classify(MB + f, 'malaga'); out.malaga.push(r); console.log(`  ${f.padEnd(52)} ${String(r.bytes).padStart(8)}B ${String(r.klass).padEnd(17)} sha=${r.sha256 ?? '-'} chars=${r.chars ?? '-'}`); }

// ---- DISTINCT-DOCUMENT ORACLE: content hash, not URL ----
for (const city of ['cordoba', 'malaga']) {
    const live = out[city].filter(d => d.sha256);
    const byHash = new Map();
    for (const d of live) { const e = byHash.get(d.sha256) ?? []; e.push(d.url.split('/').pop()); byHash.set(d.sha256, e); }
    const dupes = [...byHash.entries()].filter(([, v]) => v.length > 1);
    out[city + 'DistinctOracle'] = {
        distinctUrls: out[city].length, urlsThatResolve: live.length,
        distinctDocumentsByContentHash: byHash.size,
        aliasGroups: dupes.map(([h, v]) => ({ sha256: h, urls: v })),
        overstatementFactor: byHash.size ? Math.round(100 * live.length / byHash.size) / 100 : null,
    };
    console.log(`\n${city.toUpperCase()} DISTINCT-DOCUMENT ORACLE: ${live.length} resolving URLs -> ${byHash.size} DISTINCT DOCUMENTS by content hash`);
    for (const [h, v] of dupes) console.log(`   alias group ${h}: ${v.join(', ')}`);
}
writeFileSync(new URL('./out/13-normativa-corpus.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('\nwrote out/13-normativa-corpus.json');
