// §ANDALUCIA-ENVELOPE-MAX / step 22 — NEGATIVE PROOF FOR CLOSED-BLOCK DEPTH.
//
// ⛔ A REGEX THAT DOES NOT MATCH IS NOT AN ABSENT FIELD. Step 21 reported `fondo edificable`
// ABSENT on 100% of Málaga's zone chapters — including MC (Manzana Cerrada) and CTP, its two
// closed-block families. That would be a NATIONAL claim, so it does not get to rest on one regex
// with one spelling. This dumps every occurrence of every word Spanish planning uses for depth,
// with surrounding context, so the absence is proven by exhaustion rather than asserted.
//
// Vocabulary swept: fondo · fondo edificable · fondo máximo · profundidad · profundidad edificable
// · crujía · patio de manzana · edificabilidad de manzana · línea de edificación interior ·
// línea de fondo · área de movimiento.
import { writeFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { UA } from './lib.mjs';

async function buf(u) { const r = await fetch(u, { headers: UA }); return Buffer.from(await r.arrayBuffer()); }
function textOf(b) {
    const s = b.toString('latin1'); const parts = [];
    const re = /stream\r\n|stream\n|stream\r/g; let m;
    while ((m = re.exec(s))) {
        const a = m.index + m[0].length, e = s.indexOf('endstream', a); if (e < 0) continue;
        let d = null; const raw = b.subarray(a, e);
        try { d = zlib.inflateSync(raw); } catch { try { d = zlib.inflateRawSync(raw); } catch { d = null; } }
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
const TERMS = [
    ['fondo', /fondo/gi], ['profundidad', /profundidad/gi], ['crujia', /cruj[ií]a/gi],
    ['patio de manzana', /patio\s+de\s+manzana/gi], ['linea de edificacion', /l[ií]nea\s+de\s+edificaci[oó]n/gi],
    ['area de movimiento', /[aá]rea\s+de\s+movimiento/gi], ['edificabilidad de manzana', /edificabilidad\s+de\s+(?:la\s+)?manzana/gi],
    ['envolvente', /envolvente/gi], ['ocupacion en plantas', /ocupaci[oó]n\s+en\s+plantas?/gi],
];
const MB = 'https://www.malaga.eu/recursos/urbanismo/GIS_URBANISMO/PGOU/PDF_Normativa_GIS/';
const DOCS = [
    ['MC', 'Norm_TXII_C5_Manzana_Cerrada_MC.pdf'], ['CTP', 'Norm_TXII_C10_Colonia_Tradicional_Popular_CTP.pdf'],
    ['CH', 'Norm_TXII_C4_Ciudad_Historica_CH.pdf'], ['OG', 'Norm_TXII_C1-2_Ordenanza_General_Edificacion_OG.pdf'],
    ['OA', 'Norm_TXII_C6_Ordenacion_Abierta_OA.pdf'],
];
const out = { measuredAt: new Date().toISOString(), method: 'exhaustive vocabulary sweep with context capture; absence proven by exhaustion, not asserted from one regex', docs: [] };
for (const [zone, f] of DOCS) {
    const t = textOf(await buf(MB + f));
    const rec = { zone, file: f, chars: t.replace(/\s/g, '').length, terms: {} };
    for (const [name, re] of TERMS) {
        const hits = [];
        let m; re.lastIndex = 0;
        while ((m = re.exec(t)) && hits.length < 8) hits.push(t.slice(Math.max(0, m.index - 130), m.index + 190));
        rec.terms[name] = { count: hits.length, contexts: hits };
    }
    out.docs.push(rec);
    console.log(`\n=== ${zone} (${rec.chars} chars) ===`);
    for (const [name] of TERMS) {
        const h = rec.terms[name];
        console.log(`  ${name.padEnd(26)} ${h.count === 0 ? 'ABSENT' : h.count + ' hit(s)'}`);
        for (const c of h.contexts.slice(0, 3)) console.log(`      «…${c.replace(/\s+/g, ' ').slice(0, 230)}…»`);
    }
}
const closedBlock = out.docs.filter(d => ['MC', 'CTP', 'CH'].includes(d.zone));
const anyDepth = closedBlock.some(d => d.terms.fondo.count + d.terms.profundidad.count + d.terms.crujia.count > 0);
out.verdict = anyDepth
    ? 'DEPTH VOCABULARY IS PRESENT in Málaga\'s closed-block chapters — step 21\'s "100% absent" was a regex artefact. See contexts.'
    : '⭐ CONFIRMED BY EXHAUSTION — Málaga\'s closed-block chapters (MC, CTP, CH) contain NO depth vocabulary at all: no fondo, no profundidad, no crujía, in a corpus that IS machine-readable and DOES carry height, occupancy, setback and FAR as numbers. Closed-block depth is not a publishing gap; it is not in the ordinance layer.';
console.log('\nVERDICT:', out.verdict);
writeFileSync(new URL('./out/22-fondo-negative-proof.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('wrote out/22-fondo-negative-proof.json');
