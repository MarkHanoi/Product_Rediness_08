// §ANDALUCIA-ENVELOPE-MAX / step 4 — WHAT IS INSIDE THE ORDENANZA PDFs, and IN WHICH CODEC.
//
// ⭐ CODEC FIRST. València's PGOU is JBIG2 — the codec with the documented DIGIT-SUBSTITUTION
// failure mode (visually similar glyphs silently swapped, no visual artefact). For heights and
// setbacks in metres that is a correctness landmine UPSTREAM of OCR. If a Córdoba ordenanza PDF
// is a JBIG2 scan, the correct output is A REFUSAL WITH THE CODEC NAMED, not a value.
//
// Detection is on the raw PDF bytes: /JBIG2Decode, /CCITTFaxDecode, /DCTDecode, /JPXDecode filters
// and the presence/absence of a /Font + text operators.
import { get, getJson } from './lib.mjs';
import { writeFileSync } from 'node:fs';

const GS = 'https://geoserver.pgou.coacordoba.org/geoserver/wfs';
const q = tn => `${GS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${tn}`
    + '&outputFormat=application/json&count=100000';

const [ord, cus] = await Promise.all([
    getJson(q('coaco:ordenanzas'), { timeout: 120000 }),
    getJson(q('coaco:hojas_cus'), { timeout: 120000 }),
]);

const docs = new Map();
for (const f of ord.json.features) if (f.properties.link) docs.set(String(f.properties.link), { kind: 'ordenanza', zone: f.properties.ordenanza });
for (const f of cus.json.features) if (f.properties.link) docs.set(String(f.properties.link), { kind: 'hoja_CUS', zone: f.properties.idhoja });

console.log(`documents referenced: ${docs.size}`);
const out = { measuredAt: new Date().toISOString(), docs: [] };

// Parameter probes. Spanish planning vocabulary, accent-tolerant.
const PROBES = [
    ['altura', /altura(?:s)?\s+m[aá]xim|altura\s+de\s+la\s+edificaci|altura\s+reguladora/i],
    ['plantas', /(?:n[uú]mero\s+de\s+)?plantas?\s*(?:m[aá]xim|permitid|:|\()|\bPB\s*\+\s*\d|\bB\s*\+\s*\d/i],
    ['ocupacion', /ocupaci[oó]n\s+m[aá]xim|ocupaci[oó]n\s+de\s+parcela/i],
    ['edificabilidad', /edificabilidad|aprovechamiento\s+(?:objetivo|medio|lucrativo)|m2t\s*\/\s*m2s|coeficiente\s+de\s+edificab/i],
    ['retranqueo', /retranqueo|separaci[oó]n\s+a\s+lind|separaci[oó]n\s+a\s+(?:la\s+)?(?:calle|vial|fachada)/i],
    ['alineacion', /alineaci[oó]n(?:es)?\s+(?:oficial|exterior|a\s+vial)|alineaci[oó]n\s+obligatoria/i],
    ['fondo', /fondo\s+(?:m[aá]xim\w*\s+)?edificable|fondo\s+edificable/i],
    ['parcelaMinima', /parcela\s+m[ií]nima/i],
    ['densidad', /densidad\s+(?:m[aá]xima\s+)?(?:de\s+)?vivienda/i],
];
// ⭐ GRAPHIC_PLAN detector — the operative number is ONLY on a plan sheet.
const GRAPHIC = /(?:definid\w+|grafiad\w+|se[ñn]alad\w+|indicad\w+|reflejad\w+|fijad\w+|establecid\w+)\s+(?:gr[aá]fica\w*\s+)?(?:en\s+(?:el\s+|los\s+|el\s+plano|planos?|la\s+documentaci[oó]n\s+gr[aá]fica))|seg[uú]n\s+(?:el\s+)?plano|en\s+(?:el\s+)?plano\s+n[ºo°.]?\s*\d|documentaci[oó]n\s+gr[aá]fica|planos?\s+de\s+ordenaci[oó]n/i;
const ARTICLE = /art[ií]culo\s+\d|\bart\.\s*\d/gi;

// minimal PDF text extraction: inflate FlateDecode streams and pull Tj/TJ strings.
import zlib from 'node:zlib';
function pdfText(buf) {
    let text = '';
    const s = buf.toString('latin1');
    const re = /stream\r?\n?([\s\S]*?)endstream/g;
    let m;
    while ((m = re.exec(s))) {
        let raw = Buffer.from(m[1], 'latin1');
        let dec = null;
        try { dec = zlib.inflateSync(raw); } catch { try { dec = zlib.inflateRawSync(raw); } catch { dec = null; } }
        if (!dec) continue;
        const d = dec.toString('latin1');
        for (const t of d.matchAll(/\((?:\\.|[^\\()])*\)/g)) {
            text += t[0].slice(1, -1).replace(/\\([()\\])/g, '$1').replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
        }
        text += '\n';
    }
    // latin1 -> best-effort UTF-8-ish for accented chars written as octal
    return text;
}

for (const [url, meta] of docs) {
    const r = await get(url, { timeout: 90000 });
    const rec = { url, ...meta, status: r.status, bytes: r.bytes, ct: r.ct };
    if (!r.ok || !r.body.startsWith('%PDF')) {
        rec.verdict = r.ok ? `NOT A PDF (starts "${r.body.slice(0, 40)}")` : `HTTP ${r.status} ${r.err ?? ''}`;
        out.docs.push(rec); console.log(`  ${meta.zone} -> ${rec.verdict}`); continue;
    }
    const buf = Buffer.from(r.body, 'latin1');
    const raw = r.body;
    rec.filters = {
        JBIG2Decode: (raw.match(/\/JBIG2Decode/g) || []).length,
        CCITTFaxDecode: (raw.match(/\/CCITTFaxDecode/g) || []).length,
        DCTDecode: (raw.match(/\/DCTDecode/g) || []).length,
        JPXDecode: (raw.match(/\/JPXDecode/g) || []).length,
        FlateDecode: (raw.match(/\/FlateDecode/g) || []).length,
    };
    rec.hasFont = /\/Font\b/.test(raw);
    rec.pages = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;
    const txt = pdfText(buf);
    rec.extractedChars = txt.length;
    rec.isScan = rec.filters.JBIG2Decode > 0 || rec.filters.CCITTFaxDecode > 0
        || (!rec.hasFont && (rec.filters.DCTDecode > 0 || rec.filters.JPXDecode > 0))
        || txt.replace(/\s/g, '').length < 200;
    rec.codecRisk = rec.filters.JBIG2Decode > 0 ? 'JBIG2 — DIGIT SUBSTITUTION RISK, REFUSE numeric extraction'
        : rec.filters.CCITTFaxDecode > 0 ? 'CCITT G4 bilevel scan — OCR required, no silent-substitution mode known'
            : rec.isScan ? 'raster with no text layer' : 'born-digital text layer';
    rec.params = {};
    for (const [k, re2] of PROBES) rec.params[k] = re2.test(txt);
    rec.graphicDeferral = GRAPHIC.test(txt);
    rec.graphicSnippet = (txt.match(GRAPHIC) || [])[0] ?? null;
    rec.articleMentions = (txt.match(ARTICLE) || []).length;
    rec.sample = txt.replace(/\s+/g, ' ').slice(0, 500);
    out.docs.push(rec);
    console.log(`  ${String(meta.zone).padEnd(28)} ${rec.pages}p ${String(rec.bytes).padStart(8)}B codec=${rec.codecRisk}`);
    console.log(`      chars=${rec.extractedChars} params=${Object.entries(rec.params).filter(([, v]) => v).map(([k]) => k).join(',') || 'NONE'} graphic=${rec.graphicDeferral} arts=${rec.articleMentions}`);
}

writeFileSync(new URL('./out/04-cordoba-ordinance-pdfs.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('\nwrote out/04-cordoba-ordinance-pdfs.json');
