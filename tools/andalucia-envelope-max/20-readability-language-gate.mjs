// §ANDALUCIA-ENVELOPE-MAX / step 20 — A CHARACTER COUNT IS NOT A TEXT LAYER.
//
// ⛔ CORRECTION TO STEPS 13/18. O_UAD3.pdf was classified TEXT on 1,120,388 extracted characters
// from a 344 KB file. Every one of those characters is an EMBEDDED TRUETYPE FONT PROGRAM — the
// literal-string scraper walked head/hhea/hmtx/kern/loca/maxp/name/post/prep table bytes and
// counted them as prose. A long extraction is not a readable document.
//
// ⭐ SAME FAMILY AS "POPULATED IS NOT PRESENT", one level down: the field is non-empty, very
// non-empty, and carries none of the thing it is supposed to carry. A confidence score built on
// character count would have rated this document MORE readable than the one real ordinance
// Córdoba serves. THE GATE MUST BE ON LANGUAGE, NOT VOLUME.
//
// Gate: printable-Latin ratio >= 0.85 AND >= 8 distinct Spanish function words present. Both are
// cheap and neither can be passed by binary.
import { writeFileSync, readFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { UA, getJson, pct } from './lib.mjs';

const STOP = ['de', 'la', 'el', 'los', 'las', 'en', 'que', 'para', 'con', 'por', 'del', 'se', 'una', 'como', 'sera', 'será', 'sobre', 'este', 'esta', 'no'];
function languageGate(t) {
    const total = t.length || 1;
    const printable = (t.match(/[\x20-\x7eÀ-ſ]/g) || []).length;
    const ratio = printable / total;
    const words = new Set((t.toLowerCase().match(/[a-záéíóúñü]+/g) || []));
    const stop = STOP.filter(w => words.has(w));
    return { printableRatio: Math.round(1000 * ratio) / 1000, distinctStopwords: stop.length, stopwords: stop, isLanguage: ratio >= 0.85 && stop.length >= 8 };
}
async function buf(u) { const r = await fetch(u, { headers: UA }); return { status: r.status, b: Buffer.from(await r.arrayBuffer()) }; }
function textOf(b) {
    const s = b.toString('latin1'); const parts = [];
    const re = /stream\r\n|stream\n|stream\r/g; let m;
    while ((m = re.exec(s))) {
        const a = m.index + m[0].length, e = s.indexOf('endstream', a); if (e < 0) continue;
        let d = null; const raw = b.subarray(a, e);
        try { d = zlib.inflateSync(raw); } catch { try { d = zlib.inflateRawSync(raw); } catch { d = null; } }
        // ⭐ skip streams that are plainly a FONT PROGRAM or an image, not page content
        if (d) { const h = d.subarray(0, 4).toString('latin1'); if (h === '\x00\x01\x00\x00' || h.startsWith('OTTO') || h.startsWith('true') || h.startsWith('%!PS')) continue; parts.push(d.toString('latin1')); }
    }
    const c = parts.join('\n'); let t = '', i = 0;
    while (i < c.length) {
        if (c[i] === '(') {
            let j = i + 1, dep = 1, s2 = '';
            while (j < c.length && dep > 0) {
                const d = c[j];
                if (d === '\\') { const e2 = c[j + 1]; if (e2 >= '0' && e2 <= '7') { let o = '', k = j + 1; while (k < c.length && o.length < 3 && c[k] >= '0' && c[k] <= '7') o += c[k++]; s2 += String.fromCharCode(parseInt(o, 8)); j = k; continue; } s2 += (e2 === 'n' || e2 === 'r') ? ' ' : e2; j += 2; continue; }
                if (d === '(') dep++; else if (d === ')') { dep--; if (!dep) { j++; break; } }
                s2 += d; j++;
            }
            t += s2; i = j; continue;
        }
        i++;
    }
    return t.replace(/\s+/g, ' ');
}

const GS = 'https://geoserver.pgou.coacordoba.org/geoserver/wfs';
const ord = await getJson(`${GS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=coaco:ordenanzas&outputFormat=application/json&count=100000`, { timeout: 180000 });
const parc = await getJson(`${GS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=coaco:vcatastro_urbanismo&outputFormat=application/json&count=100000`, { timeout: 300000 });
const urls = [...new Set(ord.json.features.map(f => f.properties.link).filter(Boolean))];

const out = { measuredAt: new Date().toISOString(), correctionTo: ['13-normativa-corpus', '18-cordoba-final'], cordoba: [], malaga: [] };
console.log('=== CÓRDOBA: language gate on every distinct ordinance URL ===');
for (const u of urls) {
    const { status, b } = await buf(u);
    if (!b.subarray(0, 4).toString('latin1').startsWith('%PDF')) { out.cordoba.push({ url: u, status, bytes: b.length, verdict: 'DEAD / NOT A PDF' }); console.log(`  ${u.split('/').pop().padEnd(20)} DEAD (${b.length}B)`); continue; }
    const t = textOf(b); const g = languageGate(t);
    const rec = { url: u, status, bytes: b.length, chars: t.replace(/\s/g, '').length, ...g, verdict: g.isLanguage ? 'READABLE TEXT' : t.length > 1000 ? '⛔ FALSE POSITIVE — long extraction, NOT language (font program / binary)' : 'NO TEXT LAYER' };
    out.cordoba.push(rec);
    console.log(`  ${u.split('/').pop().padEnd(20)} chars=${String(rec.chars).padStart(8)} printable=${String(g.printableRatio).padStart(5)} stopwords=${String(g.distinctStopwords).padStart(2)} => ${rec.verdict}`);
}
console.log('\n=== MÁLAGA: same gate, same ruler ===');
const MB = 'https://www.malaga.eu/recursos/urbanismo/GIS_URBANISMO/PGOU/PDF_Normativa_GIS/';
const MF = JSON.parse(readFileSync(new URL('./out/14-malaga-normativa-params.json', import.meta.url))).zones.map(z => [z.zone, z.file]);
for (const [zone, file] of MF) {
    const { status, b } = await buf(MB + file);
    if (!b.subarray(0, 4).toString('latin1').startsWith('%PDF')) { out.malaga.push({ zone, file, status, bytes: b.length, verdict: 'DEAD' }); console.log(`  ${zone.padEnd(6)} DEAD`); continue; }
    const t = textOf(b); const g = languageGate(t);
    const rec = { zone, file, status, bytes: b.length, chars: t.replace(/\s/g, '').length, ...g, verdict: g.isLanguage ? 'READABLE TEXT' : 'NOT LANGUAGE' };
    out.malaga.push(rec);
    console.log(`  ${zone.padEnd(6)} chars=${String(rec.chars).padStart(8)} printable=${String(g.printableRatio).padStart(5)} stopwords=${String(g.distinctStopwords).padStart(2)} => ${rec.verdict}`);
}

// ---- re-derive Córdoba's readability coverage with the corrected classification ----
const readable = new Set(out.cordoba.filter(d => d.verdict === 'READABLE TEXT').map(d => d.url));
const zoneReadable = new Map();
for (const f of ord.json.features) {
    const k = String(f.properties.ordenanza);
    const cur = zoneReadable.get(k) ?? false;
    zoneReadable.set(k, cur || (f.properties.link ? readable.has(String(f.properties.link)) : false));
}
let rr = 0, rl = 0, tr = 0, tl = 0;
for (const f of parc.json.features) {
    const eq = f.properties.equipamiento;
    if (eq && String(eq).trim() && String(f.properties.ordenanza) !== 'null') { /* keep: split below */ }
    const isPublic = !!(eq && String(eq).trim()) || String(f.properties.ordenanza) === 'Elemento protegido';
    if (isPublic) continue;
    const a = Number(f.properties.sup_pc_m2) || 0;
    tr++; tl += a;
    if (zoneReadable.get(String(f.properties.ordenanza))) { rr++; rl += a; }
}
out.correctedCordobaReadability = {
    distinctUrls: urls.length,
    readableDocuments: [...readable].map(u => u.split('/').pop()),
    readableDocumentCount: readable.size,
    privateDevelopableRows: tr, privateDevelopableLandM2: Math.round(tl),
    rowWeightedReadable: pct(rr, tr), landWeightedReadable: pct(rl, tl),
    supersedes: 'step 18 reported 8.07% row / 4.48% land; that included O_UAD3, a false positive',
};
console.log('\n=== CORRECTED CÓRDOBA READABILITY (private-developable) ===');
console.log(JSON.stringify(out.correctedCordobaReadability, null, 2));
writeFileSync(new URL('./out/20-readability-language-gate.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('\nwrote out/20-readability-language-gate.json');
