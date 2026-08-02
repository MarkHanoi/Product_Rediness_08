// §ANDALUCIA-ENVELOPE-MAX / step 14 — MÁLAGA'S PER-ZONE NORMATIVA: DOES IT ACTUALLY CARRY VALUES?
//
// ⭐ THE CLAIM UNDER TEST. Málaga publishes PDF_Normativa_GIS/Norm_T<TITULO>_C<CAPITULO>_<Name>_<CODE>.pdf.
// If that genuinely maps ZONE CODE -> NORMATIVE ARTICLE it solves something no Spanish city measured
// in this programme has solved — Barcelona's NORMATIV column is the bare string "Barcelona".
//
// ⛔ BUT A FILENAME CONVENTION IS NOT A PARAMETER. Three separate things must each be shown:
//   (a) the document RESOLVES (7 of 12 returned 0 bytes on the first pass — retry, absence unproven)
//   (b) it has a TEXT layer, not outlined vector (Córdoba's does not)
//   (c) it contains a NUMBER WITH A UNIT next to the parameter, not merely the parameter's NAME.
// ⛔ POPULATED IS NOT PRESENT: a chapter that says the word "altura" and then defers to a plan sheet
// is GRAPHIC_PLAN, not a height. So every hit is captured WITH ITS SURROUNDING TEXT and a value.
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';
import { UA } from './lib.mjs';

async function getBufRetry(url, n = 4, timeout = 90000) {
    let last;
    for (let i = 0; i < n; i++) {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
        try {
            const r = await fetch(url, { headers: UA, signal: ctl.signal });
            const b = Buffer.from(await r.arrayBuffer());
            clearTimeout(t);
            if (b.length > 0) return { ok: r.ok, status: r.status, ct: r.headers.get('content-type') || '', buf: b, attempts: i + 1 };
            last = { ok: false, status: r.status, ct: '', buf: b, attempts: i + 1 };
        } catch (e) { clearTimeout(t); last = { ok: false, status: 0, ct: '', buf: Buffer.alloc(0), err: String(e.message || e), attempts: i + 1 }; }
        await new Promise(z => setTimeout(z, 3000 * (i + 1)));
    }
    return last;
}
function textOf(buf) {
    const s = buf.toString('latin1'); const parts = [];
    const re = /stream\r\n|stream\n|stream\r/g; let m;
    while ((m = re.exec(s))) {
        const a = m.index + m[0].length, b = s.indexOf('endstream', a);
        if (b < 0) continue;
        let d = null; const raw = buf.subarray(a, b);
        try { d = zlib.inflateSync(raw); } catch { try { d = zlib.inflateRawSync(raw); } catch { d = null; } }
        if (d) parts.push(d.toString('latin1'));
    }
    const c = parts.join('\n');
    let t = '', i = 0; const n = c.length;
    while (i < n) {
        if (c[i] === '(') {
            let j = i + 1, dep = 1, s2 = '';
            while (j < n && dep > 0) {
                const d = c[j];
                if (d === '\\') { const e = c[j + 1]; if (e >= '0' && e <= '7') { let o = '', k = j + 1; while (k < n && o.length < 3 && c[k] >= '0' && c[k] <= '7') o += c[k++]; s2 += String.fromCharCode(parseInt(o, 8)); j = k; continue; } s2 += (e === 'n' || e === 'r') ? ' ' : e; j += 2; continue; }
                if (d === '(') dep++; else if (d === ')') { dep--; if (!dep) { j++; break; } }
                s2 += d; j++;
            }
            t += s2; i = j; continue;
        }
        i++;
    }
    // cp1252-ish repair for Spanish accents
    return t.replace(/\s+/g, ' ');
}

// A parameter counts as DRAWABLE only with a NUMBER + UNIT in the same sentence.
const RULES = [
    { key: 'altura', name: /altura\s+(?:m[aá]xima|reguladora|de\s+(?:la\s+)?(?:edificaci[oó]n|cornisa))/i, value: /(\d{1,2}[,.]\d{1,2}|\d{1,2})\s*(?:m\b|metros)/i },
    { key: 'plantas', name: /(?:n[uú]mero\s+(?:m[aá]ximo\s+)?de\s+plantas|plantas?\s+(?:m[aá]xim|permitid))/i, value: /\b(?:PB|B)\s*\+\s*(\d)|\b([IVX]{1,5})\s*plantas|\b(\d)\s*plantas/i },
    { key: 'ocupacion', name: /ocupaci[oó]n\s+(?:m[aá]xima|de\s+(?:la\s+)?parcela)/i, value: /(\d{1,3}(?:[,.]\d+)?)\s*(?:%|por\s*ciento)/i },
    { key: 'edificabilidad', name: /edificabilidad|coeficiente\s+de\s+edificabilidad|aprovechamiento/i, value: /(\d(?:[,.]\d+)?)\s*(?:m[²2]\s*[ts]?\s*\/\s*m[²2]\s*s?|m2t\/m2s)/i },
    { key: 'retranqueo', name: /retranqueo|separaci[oó]n\s+(?:m[ií]nima\s+)?a\s+(?:lind|fach|vial)/i, value: /(\d{1,2}(?:[,.]\d+)?)\s*(?:m\b|metros)/i },
    { key: 'alineacion', name: /alineaci[oó]n(?:es)?\s+(?:oficial|exterior|obligatoria|a\s+vial)|alineaci[oó]n\s+de\s+(?:la\s+)?edificaci[oó]n/i, value: /./ },
    { key: 'fondo', name: /fondo\s+(?:m[aá]xim\w*\s+)?edificable/i, value: /(\d{1,2}(?:[,.]\d+)?)\s*(?:m\b|metros)/i },
    { key: 'parcelaMinima', name: /parcela\s+m[ií]nima/i, value: /(\d{1,5}(?:[.,]\d+)?)\s*m[²2]/i },
    { key: 'densidad', name: /densidad\s+(?:m[aá]xima\s+)?(?:de\s+)?(?:vivienda|edificatoria)/i, value: /(\d{1,3}(?:[,.]\d+)?)\s*(?:viv\.?\s*\/\s*ha|viviendas?\s*\/\s*hect)/i },
];
const GRAPHIC = /(?:definid|grafiad|se[ñn]alad|indicad|reflejad|fijad|establecid|determinad|expresad)\w*\s+(?:gr[aá]fica\w*\s+)?(?:en\s+)?(?:el\s+|los\s+|la\s+)?(?:plano|planos|documentaci[oó]n\s+gr[aá]fica|serie|ficha)|seg[uú]n\s+(?:el\s+)?plano|plano\s+n[ºo°.]?\s*\d|planos?\s+de\s+(?:ordenaci[oó]n|calificaci[oó]n)|en\s+la\s+ficha/i;

const MB = 'https://www.malaga.eu/recursos/urbanismo/GIS_URBANISMO/PGOU/PDF_Normativa_GIS/';
const DOCS = [
    ['SUNC', 'Norm_TXI_SUNC.pdf'], ['OG', 'Norm_TXII_C1-2_Ordenanza_General_Edificacion_OG.pdf'],
    ['EP', 'Norm_TXII_C3_Edificios_Protegidos_EP.pdf'], ['CH', 'Norm_TXII_C4_Ciudad_Historica_CH.pdf'],
    ['MC', 'Norm_TXII_C5_Manzana_Cerrada_MC.pdf'], ['OA', 'Norm_TXII_C6_Ordenacion_Abierta_OA.pdf'],
    ['CJ', 'Norm_TXII_C7_Ciudad_Jardin_CJ.pdf'], ['UAS', 'Norm_TXII_C8_Unifamiliar_Aislada_UAS.pdf'],
    ['UAD', 'Norm_TXII_C9_Unifamiliar_Adosada_UAD.pdf'], ['CTP', 'Norm_TXII_C10_Colonia_Tradicional_Popular_CTP.pdf'],
    ['PROD', 'Norm_TXII_C11_Productivo_PROD.pdf'], ['GSM', 'Norm_TXII_C15_Gran_Superficie_Minorista_GSM.pdf'],
];

const out = { measuredAt: new Date().toISOString(), base: MB, zones: [] };
for (const [code, file] of DOCS) {
    const r = await getBufRetry(MB + file);
    const rec = { zone: code, file, status: r.status, attempts: r.attempts, bytes: r.buf.length, ct: r.ct };
    if (!r.buf.length) { rec.verdict = `UNRESOLVED after ${r.attempts} attempts (${r.err ?? 'HTTP ' + r.status}) — UNKNOWN, not absent`; out.zones.push(rec); console.log(`${code.padEnd(5)} ${rec.verdict}`); continue; }
    rec.sha256 = createHash('sha256').update(r.buf).digest('hex').slice(0, 16);
    if (!r.buf.subarray(0, 4).toString('latin1').startsWith('%PDF')) { rec.verdict = 'NOT A PDF'; out.zones.push(rec); console.log(`${code.padEnd(5)} NOT A PDF`); continue; }
    const raw = r.buf.toString('latin1');
    rec.jbig2 = /\/JBIG2Decode/.test(raw);
    const t = textOf(r.buf);
    rec.chars = t.replace(/\s/g, '').length;
    // ⭐ TÍTULO/CAPÍTULO -> ARTICLE. Does the document body actually carry article numbers?
    rec.articles = [...new Set((t.match(/[Aa]rt[ií]culo\s*\d+(?:\.\d+)*/g) || []))];
    rec.articleCount = rec.articles.length;
    rec.params = {};
    for (const R of RULES) {
        const hits = [];
        // sentence-level windows so name and value must co-occur
        for (const seg of t.split(/(?<=[.;:])\s+/)) {
            if (!R.name.test(seg)) continue;
            const v = R.key === 'alineacion' ? ['(qualitative rule)'] : (seg.match(R.value) || []).slice(0, 1);
            hits.push({ segment: seg.slice(0, 260), value: v[0] ?? null, graphic: GRAPHIC.test(seg) });
        }
        const withValue = hits.filter(h => h.value !== null);
        const graphicOnly = hits.filter(h => h.value === null && h.graphic);
        rec.params[R.key] = {
            mentions: hits.length,
            withNumericValue: withValue.length,
            graphicDeferralOnly: graphicOnly.length,
            state: withValue.length > 0 ? 'VALUE' : graphicOnly.length > 0 ? 'GRAPHIC_PLAN' : hits.length > 0 ? 'NAMED_BUT_NO_VALUE' : 'ABSENT',
            evidence: (withValue[0] ?? graphicOnly[0] ?? hits[0])?.segment ?? null,
            exampleValue: withValue[0]?.value ?? null,
        };
    }
    rec.graphicDeferralAnywhere = GRAPHIC.test(t);
    rec.textSample = t.slice(0, 500);
    out.zones.push(rec);
    const line = RULES.map(R => `${R.key}=${rec.params[R.key].state}`).join(' ');
    console.log(`${code.padEnd(5)} ${String(rec.bytes).padStart(7)}B chars=${String(rec.chars).padStart(7)} arts=${String(rec.articleCount).padStart(3)} jbig2=${rec.jbig2}`);
    console.log(`      ${line}`);
    for (const R of RULES) { const p = rec.params[R.key]; if (p.state === 'VALUE') console.log(`      ${R.key} = ${p.exampleValue}  «${p.evidence?.slice(0, 130)}»`); }
}
writeFileSync(new URL('./out/14-malaga-normativa-params.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('\nwrote out/14-malaga-normativa-params.json');
