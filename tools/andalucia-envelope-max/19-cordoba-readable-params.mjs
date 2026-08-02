// §ANDALUCIA-ENVELOPE-MAX / step 19 — CÓRDOBA'S TWO READABLE ORDINANCES, MEASURED NOT ASSUMED.
//
// ⛔ Step 18 wrote MAX = 0 % as an assertion. That is manufacturing a conclusion. Córdoba has TWO
// ordinance documents with a real text layer (O_INDUSTRIAL, O_UAD3), and they govern 8.07 % of
// private-developable parcels / 4.48 % of that land. Whether those two DRAW is a measurement.
// Same extractor, same rules, same evidence capture as Málaga — one ruler for both cities.
import { writeFileSync, readFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { UA, pct } from './lib.mjs';

async function buf(url) { const r = await fetch(url, { headers: UA }); return Buffer.from(await r.arrayBuffer()); }
function textOf(b) {
    const s = b.toString('latin1'); const parts = [];
    const re = /stream\r\n|stream\n|stream\r/g; let m;
    while ((m = re.exec(s))) {
        const a = m.index + m[0].length, e = s.indexOf('endstream', a); if (e < 0) continue;
        let d = null; const raw = b.subarray(a, e);
        try { d = zlib.inflateSync(raw); } catch { try { d = zlib.inflateRawSync(raw); } catch { d = null; } }
        if (d) parts.push(d.toString('latin1'));
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
const RULES = [
    { key: 'altura', name: /altura\s+(?:m[aá]xima|reguladora|de\s+(?:la\s+)?(?:edificaci[oó]n|cornisa))/i, value: /(\d{1,2}[,.]\d{1,2}|\d{1,2})\s*(?:m\b|metros)/i },
    { key: 'plantas', name: /(?:n[uú]mero\s+(?:m[aá]ximo\s+)?de\s+plantas|plantas?\s+(?:m[aá]xim|permitid))/i, value: /\b(?:PB|B)\s*\+\s*(\d)|\b([IVX]{1,5})\s*plantas|\b(\d)\s*plantas/i },
    { key: 'ocupacion', name: /ocupaci[oó]n\s+(?:m[aá]xima|de\s+(?:la\s+)?parcela)/i, value: /(\d{1,3}(?:[,.]\d+)?)\s*(?:%|por\s*ciento)/i },
    { key: 'edificabilidad', name: /edificabilidad|coeficiente\s+de\s+edificabilidad|aprovechamiento/i, value: /(\d(?:[,.]\d+)?)\s*(?:m[²2]\s*[ts]?\s*\/\s*m[²2]\s*s?|m2t\/m2s)/i },
    { key: 'retranqueo', name: /retranqueo|separaci[oó]n\s+(?:m[ií]nima\s+)?a\s+(?:lind|fach|vial)/i, value: /(\d{1,2}(?:[,.]\d+)?)\s*(?:m\b|metros)/i },
    { key: 'alineacion', name: /alineaci[oó]n(?:es)?\s+(?:oficial|exterior|obligatoria|a\s+vial)/i, value: /./ },
    { key: 'fondo', name: /fondo\s+(?:m[aá]xim\w*\s+)?edificable/i, value: /(\d{1,2}(?:[,.]\d+)?)\s*(?:m\b|metros)/i },
    { key: 'parcelaMinima', name: /parcela\s+m[ií]nima/i, value: /(\d{1,5}(?:[.,]\d+)?)\s*m[²2]/i },
    { key: 'densidad', name: /densidad/i, value: /(\d{1,3}(?:[,.]\d+)?)\s*(?:viv\.?\s*\/\s*ha|viviendas?\s*\/\s*hect)/i },
];
const GRAPHIC = /(?:definid|grafiad|se[ñn]alad|indicad|reflejad|fijad|establecid|determinad)\w*\s+(?:gr[aá]fica\w*\s+)?(?:en\s+)?(?:el\s+|los\s+|la\s+)?(?:plano|planos|documentaci[oó]n\s+gr[aá]fica|ficha)|seg[uú]n\s+(?:el\s+)?plano|plano\s+n[ºo°.]?\s*\d|planos?\s+de\s+(?:ordenaci[oó]n|calificaci[oó]n)/i;

const DOCS = [
    ['Uso Industrial', 'https://visor.pgou.coacordoba.org/doc/ordenanzas/O_INDUSTRIAL.pdf'],
    ['Unifamiliar Adosada', 'https://visor.pgou.coacordoba.org/doc/ordenanzas/O_UAD3.pdf'],
];
const out = { measuredAt: new Date().toISOString(), docs: [] };
for (const [zone, url] of DOCS) {
    const t = textOf(await buf(url));
    const rec = { zone, url, chars: t.replace(/\s/g, '').length, params: {} };
    rec.articles = [...new Set((t.match(/[Aa]rt[ií]culo\s*\d+(?:\.\d+)*/g) || []))].slice(0, 30);
    rec.articleCount = rec.articles.length;
    for (const R of RULES) {
        const hits = [];
        for (const seg of t.split(/(?<=[.;:])\s+/)) {
            if (!R.name.test(seg)) continue;
            const v = R.key === 'alineacion' ? ['(qualitative)'] : (seg.match(R.value) || []).slice(0, 1);
            hits.push({ segment: seg.slice(0, 240), value: v[0] ?? null, graphic: GRAPHIC.test(seg) });
        }
        const wv = hits.filter(h => h.value !== null), gr = hits.filter(h => !h.value && h.graphic);
        rec.params[R.key] = { state: wv.length ? 'VALUE' : gr.length ? 'GRAPHIC_PLAN' : hits.length ? 'NAMED_BUT_NO_VALUE' : 'ABSENT', example: wv[0]?.value ?? null, evidence: (wv[0] ?? gr[0] ?? hits[0])?.segment ?? null };
    }
    // ⭐ TAKE PARTIALS: a FOOTPRINT rule + a HEIGHT draws. edificabilidad alone does not.
    const p = rec.params;
    const height = ['altura', 'plantas'].some(k => p[k].state === 'VALUE');
    const footprint = ['ocupacion', 'retranqueo', 'fondo', 'alineacion'].some(k => p[k].state === 'VALUE');
    rec.drawable = height && footprint ? 'PARTIAL-DRAWABLE (footprint + height -> a solid with an OPEN TOP where no constraint is served)'
        : height || footprint ? 'NOT DRAWABLE — only one of footprint/height'
            : 'NOT DRAWABLE';
    rec.complete = ['altura', 'ocupacion', 'edificabilidad', 'retranqueo'].every(k => p[k].state === 'VALUE') ? 'COMPLETE RULE' : 'INCOMPLETE';
    out.docs.push(rec);
    console.log(`\n=== ${zone} (${url.split('/').pop()}) chars=${rec.chars} articles=${rec.articleCount} ===`);
    for (const R of RULES) console.log(`   ${R.key.padEnd(16)} ${p[R.key].state.padEnd(20)} ${p[R.key].example ?? ''}`);
    console.log(`   => ${rec.complete} | ${rec.drawable}`);
}

// ---- re-derive Córdoba's MAX with the measured result ----
const fin = JSON.parse(readFileSync(new URL('./out/18-cordoba-final.json', import.meta.url)));
const drawableZones = out.docs.filter(d => d.drawable.startsWith('PARTIAL')).map(d => d.zone);
const completeZones = out.docs.filter(d => d.complete === 'COMPLETE RULE').map(d => d.zone);
const zrows = { 'Unifamiliar Adosada': 448, 'Uso Industrial': 1 };
const zland = Object.fromEntries(fin.zones.map(z => [z.code, z.m2]));
const privRows = fin.privateDevelopableSplit.rows.privateDevelopable;
const privLand = fin.privateDevelopableSplit.land.privateDevelopable;
const sumRows = zs => zs.reduce((a, z) => a + (zrows[z] ?? 0), 0);
const sumLand = zs => zs.reduce((a, z) => a + (zland[z] ?? 0), 0);
out.MAX = {
    completeRule: { row: pct(sumRows(completeZones), privRows), land: pct(sumLand(completeZones), privLand), zones: completeZones },
    partialDrawable: { row: pct(sumRows(drawableZones), privRows), land: pct(sumLand(drawableZones), privLand), zones: drawableZones },
};
out.MAX.max = { row: out.MAX.completeRule.row + out.MAX.partialDrawable.row, land: out.MAX.completeRule.land + out.MAX.partialDrawable.land };
out.MAX.cityWideMax = { row: Math.round(100 * out.MAX.max.row * fin.denominators.D3.coacoCoverageOfCity / 100) / 100 };
out.MAX.note = 'These are of PRIVATE-DEVELOPABLE land inside the 2-district COACo pilot. The pilot is 14.44% of Córdoba\'s urban parcels, so the city-wide figure is this × 0.1444.';
console.log('\n=== CÓRDOBA MAX (measured, private-developable inside the pilot) ===');
console.log(JSON.stringify(out.MAX, null, 2));
writeFileSync(new URL('./out/19-cordoba-readable-params.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('\nwrote out/19-cordoba-readable-params.json');
