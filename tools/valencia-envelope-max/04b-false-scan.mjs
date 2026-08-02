// STEP 4b (standalone) — ⛔ THE FALSE-SCAN DIRECTION, WHICH IS THE ONE THAT ACTUALLY FAILED.
//
// This arm lives in its own file because inside 04-verify.mjs it EXITED 0 AND WROTE NOTHING —
// it printed its header and stopped. An exit code of 0 with no output is a tool failure wearing
// the costume of a result, and the census's 89.81% SCAN share cannot be qualified by an arm that
// silently died. Split out, it runs alone, on already-measured input, and either produces a
// number or fails loudly.
//
// WHY THIS ARM MATTERS MORE THAN THE OTHER ONE. Step 4a tests FALSE TEXT: is anything the head
// called text actually a scan? It answered 49/49 CONFIRMED. But the classifier's demonstrated
// failure mode runs the OTHER way — the calibration caught the head calling a genuine 21-page
// text document a SCAN. A 512 KB window sees only the front of the file. If a register's
// normativa opens with scanned cover sheets and turns to text on page 20, the head says SCAN and
// the sweep undercounts.
//
// So: a seeded sample of SCAN-classified registers gets a SECOND 512 KB window read DEEP into
// the document, at 40% of its length. Text there means the head missed it, and the size of that
// error becomes measurable instead of assumed.
import { get, save, load, pool, pct } from './lib.mjs';
import { textLayer } from './pdftext.mjs';

const sn = load('_03_sniff.json');
const TEXT_MIN = sn.calibration.textMin;
const SEED = 20260802;
let rng = SEED;
const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const scans = sn.municipalities.filter((r) => r.klass === 'SCAN' && r.mb > 1 && r.url);
const N = Number(process.env.VEM_DEEP_N || 80);
const sample = scans.map((v) => ({ v, k: rand() })).sort((a, b) => a.k - b.k).map((x) => x.v).slice(0, N);
console.error(`deep-window probe: ${sample.length} of ${scans.length} SCAN registers, seed ${SEED}, TEXT_MIN ${TEXT_MIN}`);

const rows = await pool(sample, 4, async (m) => {
    const from = Math.floor(m.mb * 1048576 * 0.4);
    try {
        const r = await get(m.url, 180000, { Range: `bytes=${from}-${from + 512 * 1024 - 1}` });
        if (!r.ok) return { ine: m.ine, name: m.name, st: 'BLOCKED', why: r.err || `HTTP ${r.http}` };
        const t = textLayer(r.buf);
        return { ine: m.ine, name: m.name, st: 'OK', mb: m.mb, codec: m.codec, offsetPct: 40, deepTextChars: t.textChars, flips: t.textChars >= TEXT_MIN };
    } catch (e) {
        return { ine: m.ine, name: m.name, st: 'ERROR', why: String(e.message || e).slice(0, 120) };
    }
}, (d, t) => { if (d % 20 === 0 || d === t) console.error(`  ${d}/${t}`); });

const ok = rows.filter((r) => r.st === 'OK');
const flips = ok.filter((r) => r.flips);
const errs = rows.filter((r) => r.st !== 'OK');
console.error(`\n  probed OK ${ok.length}  errors ${errs.length} ${errs.length ? JSON.stringify(errs.slice(0, 5).map((e) => e.ine + ':' + (e.why || e.st))) : ''}`);
console.error(`  deep window carried ≥ ${TEXT_MIN} chars in ${flips.length}/${ok.length}`);
for (const f of flips.slice(0, 15)) console.error(`    ⛔ ${f.ine} ${f.name} deepChars=${f.deepTextChars} codec=${f.codec}`);
const rate = pct(flips.length, ok.length);
console.error(`\n⭐ FALSE-SCAN RATE (deep window, n=${ok.length}, seed ${SEED}) = ${rate}%`);
console.error(`   ⇒ the census's SCAN share is ${rate === 0 ? 'NOT detectably inflated by the head window' : `inflated by roughly ${rate}% of scans`}`);
console.error(`   ⚠ ONE window at 40%. A document that turns to text only in its last third would still be missed — this BOUNDS the error, it does not eliminate it.`);

save('_04b_false_scan.json', {
    seed: SEED, textMin: TEXT_MIN, offsetPct: 40, headBytes: 512 * 1024,
    scanPopulation: scans.length, sampled: sample.length, probedOk: ok.length,
    errors: errs.length, flips: flips.length, falseScanRatePct: rate, rows,
});
