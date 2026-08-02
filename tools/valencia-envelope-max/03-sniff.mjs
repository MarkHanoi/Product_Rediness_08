// STEP 3 — ⭐ THE CENSUS NOBODY FINISHED. 542 registers, one 512 KB Range sniff each.
//
// The prior probe opened THREE registers, found three image-only scans, and said so:
// "539 of 542 registers unopened — region-wide is UNTESTED." That number prices the whole
// region and nobody had it. This step gets it.
//
// ⛔ THE CALIBRATION IS NOT OPTIONAL, AND IT MUST BE ABLE TO FAIL.
// The prior probe calibrated its head sniff against FOUR files — all four SCANS. A classifier
// that returns SCAN unconditionally passes that calibration perfectly. "A control that cannot
// fail is not a control." So this calibration carries BOTH truths:
//     4 × SCAN   — poppler 0 chars AND raw object structure agreeing (two independent sources)
//     5 × TEXT   — poppler extracted 16k–32k characters over 11–21 pages
//
// ⭐ AND IT DID FAIL. On the first run the TEXT arm came back 4/5: `12135-1111 Memoria y
// Normas_.pdf` — 21 pages, 32,121 characters of real ordinance prose — was classified SCAN.
// The whole 809 KB file was then downloaded to explain the mismatch rather than tune around it:
// it contains ZERO `/FontFile` and ZERO `/Type /Font` anywhere. Its fonts are NON-EMBEDDED and
// its font dictionaries live inside 15 `/ObjStm` object streams. The prior probe's font test is
// SUFFICIENT for born-digital but NOT NECESSARY, so its SCAN counts are biased upward by an
// unmeasured amount. The fix is in pdftext.mjs: classify on PAINTED TEXT (Tj/TJ inside an
// inflated content stream — a stream, therefore never hidden in an /ObjStm), not on fonts.
//
// Had this calibration carried only the SCAN arm, as the prior one did, the broken classifier
// would have scored 4/4 and the defect would have shipped as a regional finding.
import { sniff, save, load, pool, pct, POOL } from './lib.mjs';

// ── 3a CALIBRATION ───────────────────────────────────────────────────────────
// SCAN arm: tools/valencia-register-probe/_05_scan_confirm.json — poppler 0 chars AND raw
// object structure 0 font programs / N scan-codec images, two independent sources agreeing.
// TEXT arm: tools/valencia-register-probe/_07_regex_control.json — poppler extracted the
// character counts shown, and the ordinance regexes fired on real prose in every one.
const CALIB = [
    { truth: 'SCAN', note: 'València PGOU 1988 — 376 pp, JBIG2', url: 'https://mediambient.gva.es/auto/urbanismo/reg-planeamiento/4%20VALENCIA/46250%20VALENCIA/1%20P.%20GENERAL/46250-1001%201991-0010%20PG%20TEXTO%20REFUNDIDO/3%20NORMATIVA/46250-1001%201991-0010%20%20NORMAS%20URB.pdf' },
    { truth: 'SCAN', note: 'Vila-real NNUU-1 — 147 pp, CCITT G4', url: 'https://mediambient.gva.es/auto/urbanismo/reg-planeamiento/3%20CASTELL%d3N/12135%20VILA-REAL/1%20P.%20GENERAL/12135-1000%20%201992-0322%20%20PG%20VILLARREAL/2%20Memoria/12135-1000%20%201992-0322%20%20NNUU-1.pdf' },
    { truth: 'SCAN', note: 'Vila-real NNUU-2 — 164 pp, JPEG', url: 'https://mediambient.gva.es/auto/urbanismo/reg-planeamiento/3%20CASTELL%d3N/12135%20VILA-REAL/1%20P.%20GENERAL/12135-1000%20%201992-0322%20%20PG%20VILLARREAL/2%20Memoria/12135-1000%20%201992-0322%20%20NNUU-2.pdf' },
    { truth: 'SCAN', note: 'Tollos NNUU 1989 — 41 pp, JPEG', url: 'https://mediambient.gva.es/auto/urbanismo/reg-planeamiento/2%20ALICANTE/03130%20TOLLOS/1%20P.%20GENERAL/03130-1000%20DELIMITACION%20DE%20SUELO%20URBANO/3%20NORMAS%20URBANISTICAS/03130-1000%201989%200701%20NORMAS%20URBANISTICAS.pdf' },
    { truth: 'TEXT', note: '12135-1018 MEMORIA — 15 pp, 28 562 chars', url: 'https://mediambient.gva.es/auto/urbanismo/reg-planeamiento/3%20CASTELL%d3N/12135%20VILA-REAL/1%20P.%20GENERAL/12135-1018%202017-0170%20PGMOD%20ART.%20260.4/2%20MEMORIA/12135-1018%202017-0170%20MEMORIA.pdf' },
    { truth: 'TEXT', note: '12135-1104 Memoria — 13 pp, 24 513 chars', url: 'https://mediambient.gva.es/auto/urbanismo/reg-planeamiento/3%20CASTELL%d3N/12135%20VILA-REAL/1%20P.%20GENERAL/12135-1104%20PGMOD%20ART.%20264.2/2%20MEMORIA/12135-1104%20Memoria.pdf' },
    { truth: 'TEXT', note: '12135-1101 MEM+NNUU — 11 pp, 16 177 chars', url: 'https://mediambient.gva.es/auto/urbanismo/reg-planeamiento/3%20CASTELL%d3N/12135%20VILA-REAL/1%20P.%20GENERAL/12135-1101%20PGMOD%20art%20245/2%20DOCUMENTACI%d3N/12135-1101%20MEM+NNUU.pdf' },
    { truth: 'TEXT', note: '12135-1107 MEM+NNUU — 16 pp, 28 996 chars', url: 'https://mediambient.gva.es/auto/urbanismo/reg-planeamiento/3%20CASTELL%d3N/12135%20VILA-REAL/1%20P.%20GENERAL/12135-1107%20PGMOD%20art.%20UFA-2/2%20DOC.%20T%c9CNICO/12135-1107%20MEM+NNUU.pdf' },
    { truth: 'TEXT', note: '12135-1111 Memoria y Normas — 21 pp, 32 169 chars', url: 'https://mediambient.gva.es/auto/urbanismo/reg-planeamiento/3%20CASTELL%d3N/12135%20VILA-REAL/1%20P.%20GENERAL/12135-1111%20PGMOD%20ENTORNO%20ESTADIO%20MUNICIPAL%20CER%c1MICA/2%20MEMORIA/12135-1111%20Memoria%20y%20Normas_.pdf' },
];

// ⭐ TWO-PASS CALIBRATION. Pass 1 MEASURES the head-text distribution of both arms; the
// threshold is then SET FROM THE MEASURED GAP (geometric midpoint) and pass 2 re-scores every
// calibration file against it. Nobody picks the constant by taste, and the gap itself is
// reported — if the arms overlapped, no constant could rescue the sniff and the sweep would not
// run at all.
console.error('── 3a CALIBRATION pass 1 — measure the head-text distribution of both arms');
const raw = [];
for (const c of CALIB) raw.push({ ...c, s: await sniff(c.url) });
const measScan = raw.filter((r) => r.truth === 'SCAN').map((r) => r.s.textChars ?? 0);
const measText = raw.filter((r) => r.truth === 'TEXT').map((r) => r.s.textChars ?? 0);
const maxScanText = Math.max(...measScan), minTextText = Math.min(...measText);
const separated = maxScanText * 5 <= minTextText;                    // demand a 5× gap, not merely >
const TEXT_MIN = Math.round(Math.sqrt(Math.max(maxScanText, 1) * minTextText));   // geometric midpoint
console.error(`  SCAN heads: ${measScan.join(', ')}   TEXT heads: ${measText.join(', ')}`);
console.error(`  gap ${maxScanText} → ${minTextText} (×${(minTextText / Math.max(maxScanText, 1)).toFixed(1)}) ⇒ TEXT_MIN = ${TEXT_MIN} chars per 512 KB head\n`);

console.error('── 3a CALIBRATION pass 2 — re-score both arms against the derived threshold');
const calib = [];
for (const c of raw) {
    const s = { ...c.s, klass: c.s.textChars >= TEXT_MIN ? (c.s.scanCodecImages > 0 ? 'TEXT+RASTER' : 'TEXT-LAYER') : c.s.scanCodecImages > 0 ? 'SCAN' : 'UNDECIDED-IN-HEAD' };
    // TEXT-LAYER and TEXT+RASTER both mean "extractable text present"; SCAN means it is not.
    const heads = s.klass === 'SCAN' ? 'SCAN' : (s.klass === 'TEXT-LAYER' || s.klass === 'TEXT+RASTER') ? 'TEXT' : 'UNDECIDED';
    const agree = heads === c.truth;
    console.error(`  ${c.truth.padEnd(5)} → head=${String(s.klass).padEnd(13)} textChars=${String(s.textChars).padStart(6)} fontProg=${String(s.fontProgram).padStart(3)} scanImg=${String(s.scanCodecImages).padStart(3)} ${agree ? 'OK' : '⛔ MISMATCH'}  ${c.note}`);
    calib.push({ truth: c.truth, headKlass: s.klass, textChars: s.textChars, fontProgram: s.fontProgram, scanCodecImages: s.scanCodecImages, agree, ranged: s.ranged, note: c.note, url: c.url });
}
const scanArm = calib.filter((c) => c.truth === 'SCAN');
const textArm = calib.filter((c) => c.truth === 'TEXT');
const passed = calib.every((c) => c.agree);

console.error(`  SCAN arm ${scanArm.filter((c) => c.agree).length}/${scanArm.length}   TEXT arm ${textArm.filter((c) => c.agree).length}/${textArm.length}`);
console.error(`  separation: noisiest SCAN head = ${maxScanText} chars · quietest TEXT head = ${minTextText} chars · TEXT_MIN = ${TEXT_MIN} → ${separated ? 'SEPARATED (≥5×)' : '⛔ OVERLAP — no threshold exists'}`);
console.error(`  ⛔ the FONT test the prior probe used would score: SCAN arm ${scanArm.filter((c) => (c.fontProgram ?? 0) === 0).length}/${scanArm.length}, TEXT arm ${textArm.filter((c) => (c.fontProgram ?? 0) > 0).length}/${textArm.length}`);
console.error(`  ⭐ CALIBRATION ${passed && separated ? 'PASSED — and it COULD have failed: both arms populated, and it DID fail once' : '⛔ FAILED — sweep NOT reported'}\n`);

const out = {
    calibration: { rows: calib, passed: passed && separated, scanArm: scanArm.length, textArm: textArm.length, textMin: TEXT_MIN, maxScanHeadText: maxScanText, minTextHeadText: minTextText, separated },
    headBytes: 512 * 1024, municipalities: [],
};
if (!(passed && separated)) { save('_03_sniff.json', out); process.exit(1); }

// ── 3b THE SWEEP — ALL 542, NOT A SAMPLE ─────────────────────────────────────
// One sniff per municipality, on the TOP-RANKED candidate from step 2 (locator calibrated 3/3
// against the prior exhaustive walks). Where the top candidate is BLOCKED or NOT-A-PDF the next
// candidate is tried, up to 3 — a dead file is not evidence about the register.
const cands = load('_02_candidates.json').municipalities;

async function one(m) {
    const rec = { ine: m.ine, name: m.name, st: m.st, tried: [] };
    if (m.st !== 'OK' || !m.candidates.length) { rec.klass = m.st === 'OK' ? 'NO-CANDIDATE' : m.st; return rec; }
    for (const c of m.candidates.slice(0, 3)) {
        const s = await sniff(c.url);
        rec.tried.push({ path: c.path, score: c.score, st: s.st, klass: s.klass, codec: s.codec, mb: s.totalBytes ? +(s.totalBytes / 1048576).toFixed(2) : null });
        if (s.st === 'OK') {
            // ⛔ classify against the DERIVED threshold from 3a, not lib.mjs's default constant
            s.klass = s.textChars >= TEXT_MIN ? (s.scanCodecImages > 0 ? 'TEXT+RASTER' : 'TEXT-LAYER') : s.scanCodecImages > 0 ? 'SCAN' : 'UNDECIDED-IN-HEAD';
            rec.klass = s.klass; rec.codec = s.codec; rec.codecs = s.codecs;
            rec.fontProgram = s.fontProgram; rec.scanCodecImages = s.scanCodecImages; rec.textChars = s.textChars;
            rec.mb = s.totalBytes ? +(s.totalBytes / 1048576).toFixed(2) : null;
            rec.path = c.path; rec.url = c.url; rec.score = c.score;
            rec.expediente = c.expediente ?? null; rec.section = c.section ?? null;
            return rec;
        }
    }
    rec.klass = rec.tried[0]?.st || 'BLOCKED';
    return rec;
}

const t0 = Date.now();
const rows = await pool(cands, POOL, one, (done, total) => {
    if (done % 25 === 0 || done === total) {
        const el = (Date.now() - t0) / 1000;
        console.error(`  ${done}/${total}  ${el.toFixed(0)}s  eta ${((el / done) * (total - done)).toFixed(0)}s`);
    }
});

// ── TALLY ────────────────────────────────────────────────────────────────────
const tally = {};
for (const r of rows) tally[r.klass] = (tally[r.klass] || 0) + 1;
const opened = rows.filter((r) => ['TEXT-LAYER', 'MIXED', 'SCAN', 'UNDECIDED-IN-HEAD'].includes(r.klass));
const scans = rows.filter((r) => r.klass === 'SCAN');
const codecTally = {};
for (const r of scans) codecTally[r.codec || 'none'] = (codecTally[r.codec || 'none'] || 0) + 1;
const jbig2Any = scans.filter((r) => (r.codecs?.jbig2 || 0) > 0);

out.municipalities = rows;
out.tally = tally;
out.summary = {
    sniffed: rows.length,
    opened: opened.length,
    textLayer: rows.filter((r) => r.klass === 'TEXT-LAYER').length,
    mixed: rows.filter((r) => r.klass === 'MIXED').length,
    scan: scans.length,
    pctTextOfOpened: pct(rows.filter((r) => r.klass === 'TEXT-LAYER').length, opened.length),
    pctMixedOfOpened: pct(rows.filter((r) => r.klass === 'MIXED').length, opened.length),
    pctScanOfOpened: pct(scans.length, opened.length),
    scanCodecs: codecTally,
    jbig2ScansAny: jbig2Any.length,
    pctJbig2OfScans: pct(jbig2Any.length, scans.length),
    notOpened: rows.filter((r) => !opened.includes(r)).map((r) => ({ ine: r.ine, name: r.name, klass: r.klass })),
};
console.error(`\n── SWEEP ──`);
console.error(`   sniffed ${rows.length}/542   opened ${opened.length}`);
console.error(`   TEXT-LAYER ${out.summary.textLayer} (${out.summary.pctTextOfOpened}% of opened)`);
console.error(`   MIXED      ${out.summary.mixed} (${out.summary.pctMixedOfOpened}%)  ← text + raster; step 4 opens these in full`);
console.error(`   SCAN       ${out.summary.scan} (${out.summary.pctScanOfOpened}%)  codecs ${JSON.stringify(codecTally)}`);
console.error(`   JBIG2 among scans: ${jbig2Any.length} = ${out.summary.pctJbig2OfScans}%`);
console.error(`   not opened: ${JSON.stringify(tally)}`);
save('_03_sniff.json', out);
