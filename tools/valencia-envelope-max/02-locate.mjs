// STEP 2 — locate THE ORDENANZA in all 542 registers.
//
// The prior probe walked THREE registers exhaustively (400-dir budget, and València still
// truncated). 542 exhaustive walks is ~200k requests and is not the question. The question is
// narrow: for each municipality, WHERE IS THE NORMATIVA OF THE BASE GENERAL PLAN?
//
// The filing convention, observed in all three prior walks and re-verified here on every
// register this step opens:
//     <INE> <MUNI>/ <class> / <INE>-<serial> <year>-<expte> <TITLE> / <n> <SECTION> / <file>.pdf
//                    ^ "1 P. GENERAL"          ^ base plan vs modification   ^ "3 NORMATIVA"
//
// So the walk is TARGETED, ~8 requests per municipality, and every step of the targeting is
// SCORED AND RECORDED — the score, the runners-up and the rejected alternatives all land in
// _02_candidates.json, so a wrong pick is auditable rather than invisible.
//
// ⛔ A FILENAME IS NOT A DOCUMENT. This step classifies NOTHING. It emits ranked URLs; step 3
// opens bytes. A municipality where the targeting finds nothing is reported NO-CANDIDATE, which
// is a MISS OF THIS PROBE, not evidence about the register.
import { get, pool, save, load, POOL } from './lib.mjs';

// `node 02-locate.mjs 46250 12135 03130` → LOCATOR CALIBRATION: does the targeted walk
// reproduce the three ordenanza paths the prior probe found by exhaustive walk?
const ONLY = process.argv.slice(2).filter((a) => /^\d{5}$/.test(a));
const ROOTS = load('_01_urlabs.json').municipalities.filter((m) => !ONLY.length || ONLY.includes(m.ine));

// ── vocabulary ───────────────────────────────────────────────────────────────
// Castilian and Valencian. The register mixes them (`NORMES URBANISTIQUES`, `ORDENANCES`).
const RE_GENERAL_CLASS = /\bP\.?\s*GENERAL\b|PLAN(EAMIENTO)?\s+GENERAL|PLA\s+GENERAL/i;
const RE_NORMATIVA = /NORMATIV|NORMAS?\s*URB|NORMES?\s*URB|\bNN\.?\s*UU\b|\bNNUU\b|ORDENANZ|ORDENAN[ÇC]|NORMAS?\s*URBAN[IÍ]STIC|NORMES?\s*URBAN[IÍ]STIQ/i;
const RE_MEMORIA = /\bMEMORIA\b|\bMEM[ÒO]RIA\b/i;
const RE_MODIFICATION = /\bMOD\b|MODIF|PGMOD|CATMOD|PEMOD|PRIMOD|\bHOMO\b|HOMOLOG|\bRECTIF|CORRECC|SUBSANAC/i;
const RE_BASEPLAN = /\bPGOU\b|\bPG\b|PLAN\s+GENERAL|PLA\s+GENERAL|\bNN\.?\s*SS\b|\bNNSS\b|NORMAS\s+SUBSIDIARIAS|NORMES\s+SUBSIDI|DELIMITACI[OÓ]N\s+DE\s+SUELO|DELIMITACI[OÓ]|TEXTO\s+REFUNDIDO|TEXT\s+REF|\bPGE\b|PROYECTO\s+DE\s+DELIMITACI/i;
const RE_NOT_NORMATIVA = /PLANO|PLÀNOL|\bP\.?I\.?\d|\bP\.?O\.?\d|CARTOGRAF|\.dwg$|\.zip$|FOTO|IMAGEN/i;

const norm = (s) => s.normalize('NFC').replace(/\s+/g, ' ').trim();

function links(html, baseUrl) {
    const res = [];
    // ⚠ `<a\s ` with two whitespace chars found ZERO links in the prior probe's first attempt on
    // a page that plainly had them. One `\s`, then `[^>]*`.
    for (const m of html.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const text = norm(m[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' '));
        if (!text || /^\[/.test(text)) continue;              // icon anchors
        if (/^[?]/.test(m[1])) continue;                       // autoindex sort links
        if (/parent directory/i.test(text)) continue;
        let abs; try { abs = new URL(m[1], baseUrl).href; } catch { continue; }
        if (!abs.startsWith(baseUrl.replace(/[^/]*$/, ''))) continue;   // stay in subtree
        if (abs === baseUrl) continue;
        res.push({ abs, text: text.replace(/\/$/, ''), isDir: m[1].endsWith('/') });
    }
    return res;
}

async function ls(url) {
    const r = await get(url, 60000);
    if (!r.ok) return { ok: false, why: r.err || `HTTP ${r.http}`, dirs: [], files: [] };
    const all = links(r.body, url);
    return {
        ok: true,
        dirs: all.filter((l) => l.isDir),
        files: all.filter((l) => !l.isDir).map((f) => ({ ...f, ext: (f.text.match(/\.([a-z0-9]{2,4})$/i) || [])[1]?.toLowerCase() || null })),
    };
}

/** Serial number from `<INE>-<serial> …`. Lower = earlier filing = more likely the base plan. */
function serial(name) {
    const m = name.match(/\b\d{5}-(\d{3,4})\b/);
    return m ? Number(m[1]) : 9999;
}

function scoreExpediente(name) {
    let s = 0;
    if (RE_BASEPLAN.test(name)) s += 10;
    if (RE_MODIFICATION.test(name)) s -= 12;         // a modification cannot carry the whole zone grammar
    const ser = serial(name);
    if (ser <= 1001) s += 6; else if (ser <= 1010) s += 2; else if (ser >= 2000) s -= 2;
    if (/TEXTO\s+REFUNDIDO|TEXT\s+REF/i.test(name)) s += 4;
    return s;
}

function scoreSection(name) {
    let s = 0;
    if (RE_NORMATIVA.test(name)) s += 10;
    else if (RE_MEMORIA.test(name)) s += 3;          // Vila-real files its NNUU under "2 Memoria"
    if (/PLANOS|PL[ÀA]NOL|APROBACI|APROVACI|CAT[ÁA]LOGO|ANEXO|EIA|ESTUDIO/i.test(name)) s -= 4;
    return s;
}

function scoreFile(name) {
    if ((name.match(/\.([a-z0-9]{2,4})$/i) || [])[1]?.toLowerCase() !== 'pdf') return -99;
    let s = 0;
    if (RE_NORMATIVA.test(name)) s += 10;
    if (RE_NOT_NORMATIVA.test(name)) s -= 8;
    if (/INSCRIPCI|CERTIFICA|ACUERDO|RESOLUCI|PUBLICACI|\bBOP\b|\bDOGV\b|SOLICITUD/i.test(name)) s -= 6;
    if (RE_MEMORIA.test(name) && s <= 0) s += 2;
    return s;
}

// ── the targeted walk ────────────────────────────────────────────────────────
const MAX_EXPEDIENTES = 3;   // top-scored base-plan candidates to open
const MAX_SECTIONS = 3;      // top-scored sections per expediente

async function locate(m) {
    const root = m.urls[0].replace(/\/?$/, '/');
    const rec = { ine: m.ine, name: m.noms_mun, root, requests: 0, st: null, candidates: [], trace: {} };

    const r0 = await ls(root); rec.requests++;
    if (!r0.ok) { rec.st = 'ROOT-' + r0.why; return rec; }
    rec.trace.topDirs = r0.dirs.map((d) => d.text);
    rec.trace.rootFiles = r0.files.map((f) => f.text).slice(0, 10);

    // instrument classes: prefer "1 P. GENERAL"; else every top dir, budget-capped
    let classes = r0.dirs.filter((d) => RE_GENERAL_CLASS.test(d.text));
    rec.trace.generalClassFound = classes.length > 0;
    if (!classes.length) classes = r0.dirs.slice(0, 2);
    if (!classes.length && r0.files.length) {
        // flat register: PDFs sitting at the root
        const scored = r0.files.map((f) => ({ url: f.abs, path: f.text, score: scoreFile(f.text), via: 'root-flat' }))
            .filter((c) => c.score > -99).sort((a, b) => b.score - a.score);
        rec.candidates = scored.slice(0, 4);
        rec.st = rec.candidates.length ? 'OK' : 'NO-CANDIDATE';
        return rec;
    }

    const expedientes = [];
    for (const c of classes.slice(0, 2)) {
        const r1 = await ls(c.abs); rec.requests++;
        if (!r1.ok) continue;
        for (const d of r1.dirs) expedientes.push({ ...d, cls: c.text, score: scoreExpediente(d.text) });
        // some registers file the PDFs directly under the class dir
        for (const f of r1.files) {
            const s = scoreFile(f.text);
            if (s > 0) rec.candidates.push({ url: f.abs, path: `${c.text} / ${f.text}`, score: s, via: 'class-flat' });
        }
    }
    rec.trace.expedientesSeen = expedientes.length;
    rec.trace.expedientesTop = expedientes.slice().sort((a, b) => b.score - a.score || serial(a.text) - serial(b.text))
        .slice(0, 6).map((e) => `${e.score} ${e.text}`);

    const picked = expedientes.sort((a, b) => b.score - a.score || serial(a.text) - serial(b.text)).slice(0, MAX_EXPEDIENTES);
    for (const e of picked) {
        const r2 = await ls(e.abs); rec.requests++;
        if (!r2.ok) continue;
        for (const f of r2.files) {                       // PDFs directly under the expediente
            const s = scoreFile(f.text);
            if (s > 0) rec.candidates.push({ url: f.abs, path: `${e.text} / ${f.text}`, score: s + e.score / 4, via: 'expediente-flat', expediente: e.text });
        }
        const secs = r2.dirs.map((d) => ({ ...d, score: scoreSection(d.text) })).sort((a, b) => b.score - a.score);
        for (const sec of secs.slice(0, MAX_SECTIONS)) {
            if (sec.score < 0) continue;
            const r3 = await ls(sec.abs); rec.requests++;
            if (!r3.ok) continue;
            for (const f of r3.files) {
                const s = scoreFile(f.text);
                if (s <= -99) continue;
                rec.candidates.push({
                    url: f.abs, path: `${e.text} / ${sec.text} / ${f.text}`,
                    score: s + sec.score / 2 + e.score / 4, via: 'section', expediente: e.text, section: sec.text,
                });
            }
        }
    }
    rec.candidates = rec.candidates.filter((c) => c.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
    rec.st = rec.candidates.length ? 'OK' : 'NO-CANDIDATE';
    return rec;
}

const t0 = Date.now();
const rows = await pool(ROOTS, POOL, locate, (done, total) => {
    if (done % 25 === 0 || done === total) {
        const el = (Date.now() - t0) / 1000;
        console.error(`  ${done}/${total}  ${el.toFixed(0)}s  eta ${((el / done) * (total - done)).toFixed(0)}s`);
    }
});

const tally = {};
for (const r of rows) tally[r.st] = (tally[r.st] || 0) + 1;
console.error(`\nSTATUS: ${JSON.stringify(tally)}`);
console.error(`requests: ${rows.reduce((a, b) => a + b.requests, 0)}`);
if (ONLY.length) {
    for (const r of rows) {
        console.error(`\n══ ${r.name} (${r.ine}) st=${r.st} req=${r.requests}`);
        console.error(`   topDirs: ${JSON.stringify(r.trace.topDirs)}`);
        console.error(`   expedientes seen=${r.trace.expedientesSeen} top=${JSON.stringify(r.trace.expedientesTop)}`);
        for (const c of r.candidates) console.error(`   ${String(c.score).padStart(6)}  ${c.path}`);
    }
    process.exit(0);
}
save('_02_candidates.json', { generatedAt: new Date().toISOString(), tally, municipalities: rows });
