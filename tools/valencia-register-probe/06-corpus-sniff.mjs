// STEP 6 — is ANYTHING in these registers machine-readable, or is the whole corpus scanned?
//
// Step 5 proved the three BASE ordenanzas are image-only scans. That is the answer to the
// brief's question, but it is not the whole price: if the register's RECENT documents are
// born-digital, the corpus is drifting toward text and the cost curve bends. If they are
// scanned too, it does not.
//
// TRANSPORT: HTTP Range. These PDFs are 10–50 MB; downloading 60 of them is ~1.5 GB and
// pointless. `/FontFile*` and the image `/Filter` are STREAM objects and appear in the file
// body, so a 512 KB head is enough to see the first page's encoding — PROVIDED the method is
// CALIBRATED against files whose answer is already known.
//
// ⛔ THE CALIBRATION IS NOT OPTIONAL. A sniff that has not been shown to reproduce a known
// answer is not a measurement. Step 6a re-derives the four step-5 verdicts from a 512 KB head
// alone; if any disagrees, the sniff is unusable and the sweep is not reported.
import { get, save, load } from './lib.mjs';
import { structure } from './05-scan-confirm.mjs';

const HEAD_BYTES = 512 * 1024;

async function sniff(url) {
    const r = await get(url, 120000, { Range: `bytes=0-${HEAD_BYTES - 1}` });
    if (!r.ok) return { st: 'BLOCKED', why: r.err || `HTTP ${r.http}` };
    const ranged = r.http === 206;
    const buf = r.buf.slice(0, HEAD_BYTES);
    if (buf.slice(0, 5).toString('latin1') !== '%PDF-') return { st: 'NOT-A-PDF', http: r.http, magic: buf.slice(0, 8).toString('latin1') };
    const s = structure(buf);
    return {
        st: 'OK', http: r.http, ranged, bytesSeen: buf.length,
        totalBytes: Number(r.headers['content-range']?.split('/')[1]) || r.bytes,
        fontProgram: s.fontProgram, scanCodecImages: s.scanCodecImages, imageXObj: s.imageXObj,
        codecs: { dct: s.dct, ccitt: s.ccitt, jbig2: s.jbig2, jpx: s.jpx },
        klass: s.fontProgram > 0 ? 'BORN-DIGITAL' : s.scanCodecImages > 0 ? 'SCAN' : 'UNDECIDED-IN-HEAD',
    };
}

// ── 6a CALIBRATION ───────────────────────────────────────────────────────────
const known = load('_05_scan_confirm.json').files;
const KNOWN_URLS = {
    '46250_NORMAS-URB.pdf': 'https://mediambient.gva.es/auto/urbanismo/reg-planeamiento/4%20VALENCIA/46250%20VALENCIA/1%20P.%20GENERAL/46250-1001%201991-0010%20PG%20TEXTO%20REFUNDIDO/3%20NORMATIVA/46250-1001%201991-0010%20%20NORMAS%20URB.pdf',
    '12135_NNUU-1.pdf': 'https://mediambient.gva.es/auto/urbanismo/reg-planeamiento/3%20CASTELL%d3N/12135%20VILA-REAL/1%20P.%20GENERAL/12135-1000%20%201992-0322%20%20PG%20VILLARREAL/2%20Memoria/12135-1000%20%201992-0322%20%20NNUU-1.pdf',
    '12135_NNUU-2.pdf': 'https://mediambient.gva.es/auto/urbanismo/reg-planeamiento/3%20CASTELL%d3N/12135%20VILA-REAL/1%20P.%20GENERAL/12135-1000%20%201992-0322%20%20PG%20VILLARREAL/2%20Memoria/12135-1000%20%201992-0322%20%20NNUU-2.pdf',
    '03130_NORMAS-URBANISTICAS.pdf': 'https://mediambient.gva.es/auto/urbanismo/reg-planeamiento/2%20ALICANTE/03130%20TOLLOS/1%20P.%20GENERAL/03130-1000%20DELIMITACION%20DE%20SUELO%20URBANO/3%20NORMAS%20URBANISTICAS/03130-1000%201989%200701%20NORMAS%20URBANISTICAS.pdf',
};
console.error('── 6a CALIBRATION: reproduce the step-5 verdict from a 512 KB head alone');
const calib = [];
for (const [f, u] of Object.entries(KNOWN_URLS)) {
    const full = known.find((k) => k.file === f);
    const truth = full.structure.verdict.startsWith('SCAN') ? 'SCAN' : 'BORN-DIGITAL';
    const s = await sniff(u);
    const agree = s.klass === truth;
    console.error(`  ${f.padEnd(32)} head=${String(s.klass).padEnd(18)} full=${truth.padEnd(12)} ${agree ? 'OK' : '⛔ MISMATCH'} (ranged=${s.ranged})`);
    calib.push({ file: f, headKlass: s.klass, fullTruth: truth, agree, ranged: s.ranged });
}
const calibrated = calib.every((c) => c.agree);
console.error(`  ⭐ CALIBRATION ${calibrated ? 'PASSED — the head sniff reproduces every known answer' : '⛔ FAILED — sweep NOT reported'}\n`);

// ── 6b THE SWEEP ─────────────────────────────────────────────────────────────
// Stratified by DECADE of the expediente, because the hypothesis under test is TEMPORAL:
// "the register is drifting from scans to born-digital". Sampling only recent files would
// confirm that by construction; sampling only old ones would refute it by construction.
const tree = load('_03_tree.json');
const SEED = 20260802;
let rng = SEED;
const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const out = { calibration: { rows: calib, passed: calibrated }, headBytes: HEAD_BYTES, seed: SEED, municipalities: [] };
if (!calibrated) { save('_06_corpus.json', out); process.exit(1); }

const PER_DECADE = 4;
for (const m of tree.municipalities) {
    const pdfs = m.files.filter((f) => f.ext === 'pdf');
    const bucket = new Map();
    for (const f of pdfs) {
        const y = (f.path.match(/\b(19[89]\d|20[0-2]\d)\b/) || [])[1];
        const d = y ? `${String(y).slice(0, 3)}0s` : 'undated';
        if (!bucket.has(d)) bucket.set(d, []);
        bucket.get(d).push(f);
    }
    const picks = [];
    for (const [d, arr] of [...bucket.entries()].sort()) {
        const shuffled = arr.map((v) => ({ v, k: rand() })).sort((a, b) => a.k - b.k).map((x) => x.v);
        for (const f of shuffled.slice(0, PER_DECADE)) picks.push({ ...f, decade: d });
    }
    console.error(`══ ${m.name} — ${pdfs.length} PDFs in tree${m.treeTruncated || m.truncated ? ' (TREE TRUNCATED at 400 dirs — a sample of a sample)' : ''}; sniffing ${picks.length}`);
    const rows = [];
    for (const f of picks) {
        const s = await sniff(f.url);
        rows.push({ decade: f.decade, path: f.path, ...s });
        console.error(`   ${f.decade}  ${String(s.klass || s.st).padEnd(18)} ${((s.totalBytes || 0) / 1048576).toFixed(1).padStart(6)}MB  ${f.path.slice(-70)}`);
    }
    const tally = {};
    for (const r of rows) tally[r.klass || r.st] = (tally[r.klass || r.st] || 0) + 1;
    const byDecade = {};
    for (const r of rows) {
        byDecade[r.decade] ??= {};
        byDecade[r.decade][r.klass || r.st] = (byDecade[r.decade][r.klass || r.st] || 0) + 1;
    }
    console.error(`   tally: ${JSON.stringify(tally)}`);
    console.error(`   by decade: ${JSON.stringify(byDecade)}\n`);
    out.municipalities.push({ ine: m.ine, name: m.name, pdfsInTree: pdfs.length, treeTruncated: m.truncated, sniffed: rows.length, tally, byDecade, rows });
}
save('_06_corpus.json', out);
