// STEP 4 — ⛔ DO NOT SUMMARISE A DOCUMENT YOU DID NOT OPEN.
//
// Step 3 classified 542 registers from a 512 KB head. That is an inference, not a reading. This
// step OPENS things, and it opens them in BOTH directions, because a census can be wrong in two
// ways and only testing one of them is not testing:
//
//   4a  FALSE TEXT — every municipality the head called TEXT-LAYER or TEXT+RASTER is downloaded
//       WHOLE and run through poppler. If poppler disagrees with the head sniff the head sniff
//       is wrong and the municipality is dropped from the text count.
//
//   4b  FALSE SCAN — this is the one the prior probe never tested, and it is the direction its
//       classifier actually failed in. A 512 KB head can miss text that starts later in the
//       file. So a seeded sample of SCAN-classified registers gets a SECOND 512 KB window read
//       DEEP into the document (at 40% of its length). Text appearing there would mean the
//       sweep undercounts, and the size of that error would be measurable rather than assumed.
//       A further sub-sample is downloaded whole and given to poppler for a definitive answer.
//
//   4c  UNDECIDED — resolved by full download, never left as a silent zero.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { get, save, load, pool, pct, DOCS, ensureDocs } from './lib.mjs';
import { textLayer } from './pdftext.mjs';

ensureDocs();
const sn = load('_03_sniff.json');
const TEXT_MIN = sn.calibration.textMin;
const R = sn.municipalities;
const SEED = 20260802;
let rng = SEED;
const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const MAX_MB = Number(process.env.VEM_MAX_MB || 130);

function poppler(file) {
    const txt = file.replace(/\.pdf$/, '.txt');
    try { execFileSync('pdftotext', ['-q', file, txt], { timeout: 600000 }); } catch { /* poppler may still emit */ }
    if (!fs.existsSync(txt)) return null;
    const s = fs.readFileSync(txt, 'utf8');
    return { chars: s.replace(/\s/g, '').length, pages: (s.match(/\f/g) || []).length || 1, path: txt };
}

async function download(url, name) {
    const f = path.join(DOCS, name);
    if (fs.existsSync(f) && fs.statSync(f).size > 1000) return f;
    const r = await get(url, 900000);
    if (!r.ok || r.buf.slice(0, 5).toString('latin1') !== '%PDF-') return null;
    fs.writeFileSync(f, r.buf);
    return f;
}

const out = { seed: SEED, textMin: TEXT_MIN, falseText: [], falseScanDeep: [], falseScanFull: [], undecided: [] };

// ── 4a FALSE TEXT ────────────────────────────────────────────────────────────
const textMunis = R.filter((r) => r.klass === 'TEXT-LAYER' || r.klass === 'TEXT+RASTER');
console.error(`── 4a  opening all ${textMunis.length} TEXT-classified ordenanzas in full`);
for (const m of textMunis) {
    if (m.mb > MAX_MB) { out.falseText.push({ ine: m.ine, name: m.name, st: 'SKIPPED-TOO-LARGE', mb: m.mb, headKlass: m.klass, headChars: m.textChars }); console.error(`   ${m.ine} SKIP ${m.mb}MB > ${MAX_MB}MB`); continue; }
    const f = await download(m.url, `${m.ine}_ord.pdf`);
    if (!f) { out.falseText.push({ ine: m.ine, name: m.name, st: 'DOWNLOAD-FAILED', headKlass: m.klass }); console.error(`   ${m.ine} DOWNLOAD-FAILED`); continue; }
    const p = poppler(f);
    const full = textLayer(fs.readFileSync(f));
    const confirmed = p != null && p.chars >= 2000;
    console.error(`   ${m.ine} ${String(m.name).slice(0, 22).padEnd(22)} head=${String(m.textChars).padStart(6)}  poppler=${String(p?.chars ?? 'n/a').padStart(7)} chars /${String(p?.pages ?? '?').padStart(4)} pp  ${confirmed ? 'CONFIRMED' : '⛔ NOT CONFIRMED'}`);
    out.falseText.push({
        ine: m.ine, name: m.name, st: 'OK', headKlass: m.klass, headChars: m.textChars, mb: m.mb,
        popplerChars: p?.chars ?? null, popplerPages: p?.pages ?? null, charsPerPage: p ? Math.round(p.chars / p.pages) : null,
        fullTextChars: full.textChars, confirmed, path: m.path, url: m.url, codec: m.codec,
    });
}

// ── 4b FALSE SCAN — deep window ──────────────────────────────────────────────
const scans = R.filter((r) => r.klass === 'SCAN' && r.mb > 1);
const shuffled = scans.map((v) => ({ v, k: rand() })).sort((a, b) => a.k - b.k).map((x) => x.v);
const DEEP_N = Number(process.env.VEM_DEEP_N || 80);
const deepSample = shuffled.slice(0, DEEP_N);
console.error(`\n── 4b  deep-window probe on ${deepSample.length} of ${scans.length} SCAN registers (seed ${SEED})`);
const deep = await pool(deepSample, 4, async (m) => {
    const total = Math.round(m.mb * 1048576);
    const from = Math.floor(total * 0.4);
    const r = await get(m.url, 180000, { Range: `bytes=${from}-${from + 512 * 1024 - 1}` });
    if (!r.ok) return { ine: m.ine, st: 'BLOCKED' };
    const t = textLayer(r.buf);
    return { ine: m.ine, name: m.name, st: 'OK', offsetPct: 40, deepTextChars: t.textChars, flips: t.textChars >= TEXT_MIN };
});
const flipped = deep.filter((d) => d.flips);
console.error(`   deep-window text ≥ ${TEXT_MIN} chars in ${flipped.length}/${deep.filter((d) => d.st === 'OK').length} → false-SCAN rate ${pct(flipped.length, deep.filter((d) => d.st === 'OK').length)}%`);
if (flipped.length) for (const f of flipped.slice(0, 10)) console.error(`     ⛔ ${f.ine} ${f.name} deepChars=${f.deepTextChars}`);
out.falseScanDeep = deep;

// ── 4b′ FALSE SCAN — full download, definitive ───────────────────────────────
const FULL_N = Number(process.env.VEM_FULL_N || 10);
const fullSample = deepSample.filter((m) => m.mb <= 60).slice(0, FULL_N);
console.error(`\n── 4b′ full download + poppler on ${fullSample.length} SCAN registers — the definitive check`);
for (const m of fullSample) {
    const f = await download(m.url, `${m.ine}_scan.pdf`);
    if (!f) { out.falseScanFull.push({ ine: m.ine, st: 'DOWNLOAD-FAILED' }); continue; }
    const p = poppler(f);
    const reallyScan = p == null || p.chars < 2000;
    console.error(`   ${m.ine} ${String(m.name).slice(0, 22).padEnd(22)} poppler=${String(p?.chars ?? 'n/a').padStart(7)} chars /${String(p?.pages ?? '?').padStart(4)} pp  ${reallyScan ? 'SCAN CONFIRMED' : '⛔ HEAD WAS WRONG — text present'}`);
    out.falseScanFull.push({ ine: m.ine, name: m.name, popplerChars: p?.chars ?? null, popplerPages: p?.pages ?? null, reallyScan, codec: m.codec, mb: m.mb });
    try { fs.unlinkSync(f); } catch { /* keep going */ }
}

// ── 4c UNDECIDED ─────────────────────────────────────────────────────────────
const und = R.filter((r) => r.klass === 'UNDECIDED-IN-HEAD');
console.error(`\n── 4c  resolving ${und.length} UNDECIDED-IN-HEAD`);
for (const m of und) {
    if ((m.mb ?? 0) > MAX_MB) { out.undecided.push({ ine: m.ine, name: m.name, st: 'SKIPPED-TOO-LARGE', mb: m.mb }); continue; }
    const f = await download(m.url, `${m.ine}_und.pdf`);
    if (!f) { out.undecided.push({ ine: m.ine, name: m.name, st: 'DOWNLOAD-FAILED' }); continue; }
    const p = poppler(f);
    const resolved = p && p.chars >= 2000 ? 'TEXT' : 'SCAN-OR-EMPTY';
    console.error(`   ${m.ine} ${String(m.name).slice(0, 22).padEnd(22)} poppler=${String(p?.chars ?? 'n/a').padStart(7)} chars → ${resolved}`);
    out.undecided.push({ ine: m.ine, name: m.name, st: 'OK', popplerChars: p?.chars ?? null, popplerPages: p?.pages ?? null, resolved, path: m.path, url: m.url });
    try { fs.unlinkSync(f); } catch { /* keep going */ }
}

const confirmedText = out.falseText.filter((t) => t.confirmed).length;
const testedText = out.falseText.filter((t) => t.st === 'OK').length;
out.summary = {
    textClassified: textMunis.length,
    textTestedInFull: testedText,
    textConfirmed: confirmedText,
    textConfirmRate: pct(confirmedText, testedText),
    deepProbed: deep.filter((d) => d.st === 'OK').length,
    deepFlips: flipped.length,
    falseScanRateDeep: pct(flipped.length, deep.filter((d) => d.st === 'OK').length),
    fullScanChecked: out.falseScanFull.length,
    fullScanConfirmed: out.falseScanFull.filter((x) => x.reallyScan).length,
    undecidedResolvedText: out.undecided.filter((u) => u.resolved === 'TEXT').length,
};
console.error(`\n⭐ VERIFICATION: ${confirmedText}/${testedText} TEXT confirmed by poppler · false-SCAN rate ${out.summary.falseScanRateDeep}% (deep window, n=${out.summary.deepProbed}) · ${out.summary.fullScanConfirmed}/${out.summary.fullScanChecked} SCAN confirmed in full`);
save('_04_verify.json', out);
