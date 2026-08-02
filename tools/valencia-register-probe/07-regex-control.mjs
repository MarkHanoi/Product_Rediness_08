// STEP 7 — ⛔ THE POSITIVE CONTROL FOR STEP 4'S PARAMETER REGEXES.
//
// Step 4 reported height=0 setback=0 occupation=0 depth=0 on all three ordenanzas. Step 5 proved
// the text was never there to match, so those zeros are attributable to the SCAN — but that
// attribution is only sound if the regexes would have FIRED on text that does contain the
// parameters. The corpus already contains the counter-example: the grammar probe reported "FAR
// absent from every schema" and was WRONG, because `edif_m2` did not match its pattern.
//
// A REGEX THAT DOES NOT MATCH IS NOT AN ABSENT FIELD. So this step runs the same regexes over a
// BORN-DIGITAL planning document from the same register, found by step 6. If they fire there,
// step 4's zeros are the scan's; if they do not, step 4's zeros are the probe's.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { get, save, ensureDocs, DOCS } from './lib.mjs';

const PDFTOTEXT = 'C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe';
ensureDocs();

// Born-digital NORMATIVE documents identified by the step-6 sweep (fontProgram > 0).
// Deliberately the technical MEMORIA/NNUU, not the administrative certificate — a certificate
// would prove only that Spanish prose matches, not that ORDINANCE prose matches.
const CONTROLS = [
    { tag: 'CTRL-12135-1018-MEMORIA', muni: 'Vila-real', url: 'https://mediambient.gva.es/auto/urbanismo/reg-planeamiento/3%20CASTELL%d3N/12135%20VILA-REAL/1%20P.%20GENERAL/12135-1018%202017-0170%20PGMOD%20ART.%20260.4/2%20MEMORIA/12135-1018%202017-0170%20MEMORIA.pdf' },
    { tag: 'CTRL-12135-1104-MEMORIA', muni: 'Vila-real', url: 'https://mediambient.gva.es/auto/urbanismo/reg-planeamiento/3%20CASTELL%d3N/12135%20VILA-REAL/1%20P.%20GENERAL/12135-1104%20PGMOD%20ART.%20264.2/2%20MEMORIA/12135-1104%20Memoria.pdf' },
    { tag: 'CTRL-12135-1101-MEMNNUU', muni: 'Vila-real', url: 'https://mediambient.gva.es/auto/urbanismo/reg-planeamiento/3%20CASTELL%d3N/12135%20VILA-REAL/1%20P.%20GENERAL/12135-1101%20PGMOD%20art%20245/2%20DOCUMENTACI%d3N/12135-1101%20MEM+NNUU.pdf' },
    { tag: 'CTRL-12135-1107-MEMNNUU', muni: 'Vila-real', url: 'https://mediambient.gva.es/auto/urbanismo/reg-planeamiento/3%20CASTELL%d3N/12135%20VILA-REAL/1%20P.%20GENERAL/12135-1107%20PGMOD%20art.%20UFA-2/2%20DOC.%20T%c9CNICO/12135-1107%20MEM+NNUU.pdf' },
    { tag: 'CTRL-12135-1111-MEMNORMAS', muni: 'Vila-real', url: 'https://mediambient.gva.es/auto/urbanismo/reg-planeamiento/3%20CASTELL%d3N/12135%20VILA-REAL/1%20P.%20GENERAL/12135-1111%20PGMOD%20ENTORNO%20ESTADIO%20MUNICIPAL%20CER%c1MICA/2%20MEMORIA/12135-1111%20Memoria%20y%20Normas_.pdf' },
];

// EXACTLY the patterns step 4 used. Not a re-tuned copy — a re-tuned copy would prove nothing.
const PARAMS = {
    height: /alt(?:ura|ària)\s+(?:m[aá]xima|reguladora|de\s+cornisa|total)|n[uú]mero\s+m[aá]ximo\s+de\s+plantas|n[ºo°]\s*(?:m[aá]x\.?\s*)?de\s+plantas|altura\s+de\s+la\s+edificaci[oó]n|n[uú]mero\s+de\s+plantas/gi,
    setback: /retranqueo|separaci[oó]n\s+(?:m[ií]nima\s+)?a\s+lind|distancia\s+a\s+lind|separaci[oó]n\s+a\s+(?:l[ií]mites|linderos|fachada)|reculada/gi,
    occupation: /ocupaci[oó]n\s+(?:m[aá]xima|de\s+parcela|del?\s+solar)|coeficiente\s+de\s+ocupaci[oó]n|porcentaje\s+de\s+ocupaci[oó]n|% ?de\s+ocupaci[oó]n/gi,
    depth: /fondo\s+(?:m[aá]ximo\s+)?edificable|fondo\s+de\s+edificaci[oó]n|profunditat\s+edificable|fondo\s+m[aá]ximo/gi,
    far: /edificabilidad|coeficiente\s+de\s+edificabilidad|m2t\/m2s|m²t\/m²s/gi,
    parcelMin: /parcela\s+m[ií]nima|superficie\s+m[ií]nima\s+de\s+parcela/gi,
};
const ARTICLE = /\bArt(?:[ií]culo|\.)\s*\d+(?:[.\-]\d+)*/gi;

const out = { controls: [] };
for (const c of CONTROLS) {
    const dest = path.join(DOCS, `${c.tag}.pdf`);
    if (!fs.existsSync(dest)) {
        const r = await get(c.url, 240000);
        if (!r.ok || r.buf.slice(0, 5).toString('latin1') !== '%PDF-') {
            console.error(`⛔ ${c.tag}: HTTP ${r.http ?? r.err}`);
            out.controls.push({ ...c, st: 'BLOCKED', why: r.err || `HTTP ${r.http}` });
            continue;
        }
        fs.writeFileSync(dest, r.buf);
    }
    const txtPath = dest.replace(/\.pdf$/, '.txt');
    try { execFileSync(PDFTOTEXT, ['-enc', 'UTF-8', '-layout', dest, txtPath], { stdio: 'pipe', timeout: 180000 }); } catch { /* poppler warns; check output */ }
    if (!fs.existsSync(txtPath)) { out.controls.push({ ...c, st: 'EXTRACT-FAILED' }); continue; }
    const text = fs.readFileSync(txtPath, 'utf8');
    const pages = (text.match(/\f/g) || []).length || 1;
    const chars = text.replace(/\s/g, '').length;
    const arts = new Set([...text.matchAll(ARTICLE)].map((m) => m[0].replace(/\s+/g, ' ').toLowerCase()));
    const p = {}; const ev = {};
    for (const [k, re] of Object.entries(PARAMS)) {
        const ms = [...text.matchAll(re)];
        p[k] = ms.length;
        // ⭐ EVIDENCE, NOT A COUNT. The surrounding sentence is recorded so a human can see the
        // regex matched LAW and not a table of contents.
        if (ms.length) ev[k] = text.slice(Math.max(0, ms[0].index - 90), ms[0].index + 150).replace(/\s+/g, ' ').trim();
    }
    console.error(`\n${c.tag}  pages=${pages} chars/page=${Math.round(chars / pages)}`);
    console.error(`  distinctArticles=${arts.size}  ${[...arts].slice(0, 6).join(' | ')}`);
    console.error(`  height=${p.height} setback=${p.setback} occupation=${p.occupation} depth=${p.depth} far=${p.far} parcelMin=${p.parcelMin}`);
    for (const [k, s] of Object.entries(ev)) console.error(`    ${k}: …${s}…`);
    out.controls.push({ ...c, st: 'OK', pages, chars, charsPerPage: Math.round(chars / pages), distinctArticles: arts.size, sampleArticles: [...arts].slice(0, 10), params: p, evidence: ev });
}

const ok = out.controls.filter((c) => c.st === 'OK');
const fired = {};
for (const k of Object.keys(PARAMS)) fired[k] = ok.filter((c) => c.params[k] > 0).length;
out.verdict = {
    controlsRun: ok.length,
    regexFiredOnAtLeastOneControl: Object.fromEntries(Object.entries(fired).map(([k, v]) => [k, v > 0])),
    conclusion: Object.values(fired).every((v) => v > 0)
        ? "EVERY parameter regex FIRES on born-digital ordinance text from the same register. Step 4's zeros are therefore attributable to the SCAN, not to the probe."
        : `⛔ regex(es) NEVER fired: ${Object.entries(fired).filter(([, v]) => v === 0).map(([k]) => k).join(',')} — step 4's zeros for those are UNATTRIBUTED and must not be reported as absence.`,
};
console.error(`\n⭐ ${out.verdict.conclusion}`);
save('_07_regex_control.json', out);
