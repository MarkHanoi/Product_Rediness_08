// STEP 4 — ⭐ THE RUN. OPEN the ordenanza PDF for each of the three municipalities and answer
// the one question: CAN IT BE REACHED AND PARSED, AND DOES IT CARRY HEIGHT, SETBACKS,
// OCCUPATION AND BUILDABLE DEPTH WITH AN ARTICLE REFERENCE?
//
// ⛔ NOTHING HERE IS INFERRED FROM A FILENAME. Every figure below is computed from bytes
// downloaded to _docs/ and text extracted by poppler `pdftotext`. If the extraction is empty,
// that is reported as an IMAGE-ONLY SCAN — outcome (c) — and NOT as "the parameter is absent".
//
// THE FIVE OUTCOMES:
//   (a) machine-readable text WITH article structure
//   (b) text PDF, no article structure
//   (c) image-only scan
//   (d) register reachable but ordenanza not in it
//   (e) dead / auth-walled
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { get, save, ensureDocs, DOCS, DIR } from './lib.mjs';

const PDFTOTEXT = 'C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe';
ensureDocs();

// The ordenanza of the GENERAL plan for each municipality, located by walking the register in
// step 3. Not a guess: each path was read off an autoindex listing.
const TARGETS = [
    {
        ine: '46250', name: 'València', klass: 'large-urban',
        instrument: 'PGOU 1988, Texto Refundido — expediente 46250-1001 / 1991-0010',
        files: [{ tag: 'NORMAS-URB', url: 'https://mediambient.gva.es/auto/urbanismo/reg-planeamiento/4%20VALENCIA/46250%20VALENCIA/1%20P.%20GENERAL/46250-1001%201991-0010%20PG%20TEXTO%20REFUNDIDO/3%20NORMATIVA/46250-1001%201991-0010%20%20NORMAS%20URB.pdf' }],
    },
    {
        ine: '12135', name: 'Vila-real', klass: 'mid-sized',
        instrument: 'PG Villarreal — expediente 12135-1000 / 1992-0322',
        files: [
            { tag: 'NNUU-1', url: 'https://mediambient.gva.es/auto/urbanismo/reg-planeamiento/3%20CASTELL%d3N/12135%20VILA-REAL/1%20P.%20GENERAL/12135-1000%20%201992-0322%20%20PG%20VILLARREAL/2%20Memoria/12135-1000%20%201992-0322%20%20NNUU-1.pdf' },
            { tag: 'NNUU-2', url: 'https://mediambient.gva.es/auto/urbanismo/reg-planeamiento/3%20CASTELL%d3N/12135%20VILA-REAL/1%20P.%20GENERAL/12135-1000%20%201992-0322%20%20PG%20VILLARREAL/2%20Memoria/12135-1000%20%201992-0322%20%20NNUU-2.pdf' },
        ],
    },
    {
        ine: '03130', name: 'Tollos', klass: 'small-rural',
        instrument: 'Delimitación de Suelo Urbano 1989 — expediente 03130-1000 / 1989-0701',
        files: [{ tag: 'NORMAS-URBANISTICAS', url: 'https://mediambient.gva.es/auto/urbanismo/reg-planeamiento/2%20ALICANTE/03130%20TOLLOS/1%20P.%20GENERAL/03130-1000%20DELIMITACION%20DE%20SUELO%20URBANO/3%20NORMAS%20URBANISTICAS/03130-1000%201989%200701%20NORMAS%20URBANISTICAS.pdf' }],
    },
];

// ── THE FOUR PARAMETERS. Each is a family of Castilian/Valencian legal phrasings, not one word.
// ⚠ A REGEX THAT DOES NOT MATCH IS NOT AN ABSENT FIELD — the grammar probe recorded exactly
// that failure (`edif_m2` missed by a /far|coef|edificabilidad/ pattern). So each family is
// deliberately broad, and step 5 dumps the surrounding sentence for human verification.
const PARAMS = {
    height: /alt(?:ura|ària)\s+(?:m[aá]xima|reguladora|de\s+cornisa|total)|n[uú]mero\s+m[aá]ximo\s+de\s+plantas|n[ºo°]\s*(?:m[aá]x\.?\s*)?de\s+plantas|altura\s+de\s+la\s+edificaci[oó]n|n[uú]mero\s+de\s+plantas/gi,
    setback: /retranqueo|separaci[oó]n\s+(?:m[ií]nima\s+)?a\s+lind|distancia\s+a\s+lind|separaci[oó]n\s+a\s+(?:l[ií]mites|linderos|fachada)|reculada/gi,
    occupation: /ocupaci[oó]n\s+(?:m[aá]xima|de\s+parcela|del?\s+solar)|coeficiente\s+de\s+ocupaci[oó]n|porcentaje\s+de\s+ocupaci[oó]n|% ?de\s+ocupaci[oó]n/gi,
    depth: /fondo\s+(?:m[aá]ximo\s+)?edificable|fondo\s+de\s+edificaci[oó]n|profunditat\s+edificable|fondo\s+m[aá]ximo/gi,
    // context/controls
    far: /edificabilidad|coeficiente\s+de\s+edificabilidad|m2t\/m2s|m²t\/m²s/gi,
    parcelMin: /parcela\s+m[ií]nima|superficie\s+m[ií]nima\s+de\s+parcela/gi,
};
// Article structure. The Spanish planning ordinance convention is `Artículo N.` or `Art. N.N.N`.
const ARTICLE = /\bArt(?:[ií]culo|\.)\s*\d+(?:[.\-]\d+)*/gi;

function textOf(pdfPath) {
    const txtPath = pdfPath.replace(/\.pdf$/i, '.txt');
    try {
        execFileSync(PDFTOTEXT, ['-enc', 'UTF-8', '-layout', pdfPath, txtPath], { stdio: 'pipe', timeout: 240000 });
    } catch (e) {
        // poppler warns on many real-world PDFs but still writes output; only a missing file is fatal
        if (!fs.existsSync(txtPath)) return { err: String(e.message || e).slice(0, 200) };
    }
    return { text: fs.readFileSync(txtPath, 'utf8'), txtPath };
}

const out = { targets: [] };

for (const t of TARGETS) {
    console.error(`\n══════ ${t.name} (${t.ine}) — ${t.klass}`);
    console.error(`       instrument: ${t.instrument}`);
    const rec = { ...t, files: [] };
    let allText = '';
    for (const f of t.files) {
        const dest = path.join(DOCS, `${t.ine}_${f.tag}.pdf`);
        let bytes, http, ctype;
        if (fs.existsSync(dest)) {
            bytes = fs.statSync(dest).size; http = 'cached'; ctype = 'cached';
            console.error(`  · ${f.tag}: cached ${bytes}B`);
        } else {
            const r = await get(f.url, 300000);
            http = r.http; ctype = r.headers['content-type'] || null; bytes = r.bytes;
            if (!r.ok) {
                console.error(`  ⛔ ${f.tag}: HTTP ${r.http ?? r.err} — OUTCOME (e)`);
                rec.files.push({ ...f, st: 'BLOCKED', http, why: r.err || `HTTP ${r.http}` });
                continue;
            }
            const magic = r.buf.slice(0, 5).toString('latin1');
            if (magic !== '%PDF-') {
                console.error(`  ⛔ ${f.tag}: not a PDF (magic="${magic}") ctype=${ctype}`);
                rec.files.push({ ...f, st: 'NOT-A-PDF', http, ctype, bytes, magic });
                continue;
            }
            fs.writeFileSync(dest, r.buf);
            console.error(`  · ${f.tag}: HTTP ${http} ${(bytes / 1048576).toFixed(2)} MB ctype=${ctype}`);
        }
        const ex = textOf(dest);
        if (ex.err) {
            console.error(`    ⛔ pdftotext failed: ${ex.err}`);
            rec.files.push({ ...f, st: 'EXTRACT-FAILED', bytes, why: ex.err });
            continue;
        }
        // Page count = form feeds emitted by pdftotext (one per page, incl. blank ones).
        const pages = (ex.text.match(/\f/g) || []).length || 1;
        const chars = ex.text.replace(/\s/g, '').length;
        const cpp = Math.round(chars / pages);
        // ⭐ THE SCAN TEST. An image-only scan yields ~0 extractable characters per page.
        // Threshold 40 cpp: even a plans sheet with a title block clears that; a bare scan does not.
        const scan = cpp < 40;
        console.error(`    pages=${pages} chars=${chars} chars/page=${cpp} ${scan ? '⛔ IMAGE-ONLY SCAN' : 'TEXT'}`);
        rec.files.push({ ...f, st: 'OK', bytes, pages, chars, charsPerPage: cpp, isScan: scan, txt: path.basename(ex.txtPath) });
        allText += '\n' + ex.text;
    }

    // ── Measure the four parameters + article structure over the CONCATENATED ordenanza.
    const arts = [...allText.matchAll(ARTICLE)].map((m) => m[0]);
    const distinctArts = new Set(arts.map((a) => a.replace(/\s+/g, ' ').toLowerCase()));
    const p = {};
    for (const [k, re] of Object.entries(PARAMS)) p[k] = (allText.match(re) || []).length;
    const scanned = rec.files.filter((f) => f.isScan).length;
    const okFiles = rec.files.filter((f) => f.st === 'OK');

    let outcome;
    if (!okFiles.length) outcome = '(e) DEAD/BLOCKED';
    else if (scanned === okFiles.length) outcome = '(c) IMAGE-ONLY SCAN';
    else if (distinctArts.size >= 20) outcome = '(a) MACHINE-READABLE TEXT WITH ARTICLES';
    else outcome = '(b) TEXT PDF, WEAK/NO ARTICLE STRUCTURE';

    const four = ['height', 'setback', 'occupation', 'depth'];
    const present = four.filter((k) => p[k] > 0);
    console.error(`  ── articleMentions=${arts.length} distinctArticles=${distinctArts.size}`);
    console.error(`  ── height=${p.height} setback=${p.setback} occupation=${p.occupation} depth=${p.depth}  (far=${p.far} parcelMin=${p.parcelMin})`);
    console.error(`  ⭐ OUTCOME ${outcome} — ${present.length}/4 core parameters present`);

    rec.measure = { articleMentions: arts.length, distinctArticles: distinctArts.size, sampleArticles: [...distinctArts].slice(0, 8), params: p, coreParamsPresent: present, coreParamCount: present.length };
    rec.outcome = outcome;
    out.targets.push(rec);
}
save('_04_ordenanza.json', out);
