// STEP 5 — ⛔ EXPLAIN THE ZERO BEFORE REPORTING IT.
//
// Step 4 returned chars/page = 0 for THREE OUT OF THREE municipalities. Three identical zeros
// is exactly the shape of a TOOL FAILURE, and the corpus already contains one such false
// negative (`CQL_FILTER` accepted-and-ignored: HTTP 200, plausible data, identical totals).
// So the zero is not reported until an INDEPENDENT source agrees.
//
// Independent source = the PDF's OWN OBJECT STRUCTURE, read from the raw bytes without poppler:
//   · a born-digital text PDF embeds FONTS (`/FontFile`, `/FontFile2`, `/FontFile3`) and shows
//     text with Tj/TJ operators;
//   · a scan embeds IMAGES under a scan codec (`/DCTDecode` JPEG, `/CCITTFaxDecode` fax G4,
//     `/JBIG2Decode`, `/JPXDecode`) and embeds NO font programs.
// If poppler says "no text" AND the bytes contain zero font programs and N scan-codec images,
// the two agree and OUTCOME (c) is PROVEN. If they disagree, the tool is at fault and the
// result is UNKNOWN.
import fs from 'node:fs';
import path from 'node:path';
import { save, DOCS } from './lib.mjs';

const SIGS = {
    fontProgram: /\/FontFile[23]?\b/g,   // an EMBEDDED font program — the born-digital tell
    fontRef: /\/Type\s*\/Font\b/g,
    dct: /\/DCTDecode\b/g,
    ccitt: /\/CCITTFaxDecode\b/g,
    jbig2: /\/JBIG2Decode\b/g,
    jpx: /\/JPXDecode\b/g,
    imageXObj: /\/Subtype\s*\/Image\b/g,
    page: /\/Type\s*\/Page[^s]/g,
    objStm: /\/ObjStm\b/g,               // ⚠ if present, dicts may be COMPRESSED and invisible to this scan
};

export function structure(buf) {
    const s = buf.toString('latin1');
    const c = {};
    for (const [k, re] of Object.entries(SIGS)) c[k] = (s.match(re) || []).length;
    c.scanCodecImages = c.dct + c.ccitt + c.jbig2 + c.jpx;
    // ⚠ SELF-CORRECTION. The first version of this guard abstained whenever `/ObjStm` was
    // present, on the theory that object streams could hide the dictionaries. That was WRONG and
    // it produced two spurious UNKNOWNs on Vila-real. Per ISO 32000-1 §7.5.7, a STREAM object
    // can never be stored inside an object stream — only non-stream objects can. Every signal
    // this check relies on (`/FontFile*`, image XObjects and their `/Filter`) is a stream, so it
    // is ALWAYS visible in the file body. Only `/Type /Page` (a plain dict) can be hidden, which
    // is why the page count now comes from poppler, not from this scan.
    //
    // The guard was over-conservative, not under-conservative — it could only have caused a
    // false UNKNOWN, never a false SCAN. Recorded because a probe that abstains wrongly is still
    // a probe that got the answer wrong.
    c.dictsVisible = true;
    c.streamSignalsAuthoritative = 'ISO 32000-1 §7.5.7 — stream objects cannot live in /ObjStm';
    c.verdict = c.fontProgram === 0 && c.scanCodecImages > 0
        ? 'SCAN — zero embedded font programs, N scan-codec images'
        : c.fontProgram > 0
            ? 'BORN-DIGITAL — embedded font programs present'
            : 'UNKNOWN — neither signature';
    return c;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
    const out = { files: [] };
    for (const f of fs.readdirSync(DOCS).filter((x) => x.endsWith('.pdf')).sort()) {
        const buf = fs.readFileSync(path.join(DOCS, f));
        const st = structure(buf);
        const txtPath = path.join(DOCS, f.replace(/\.pdf$/, '.txt'));
        const txt = fs.existsSync(txtPath) ? fs.readFileSync(txtPath, 'utf8') : '';
        const pages = (txt.match(/\f/g) || []).length;
        const chars = txt.replace(/\s/g, '').length;
        const popplerSays = chars === 0 ? 'NO TEXT' : `${Math.round(chars / Math.max(pages, 1))} chars/page`;
        const agree =
            (popplerSays === 'NO TEXT' && st.verdict.startsWith('SCAN')) ||
            (popplerSays !== 'NO TEXT' && st.verdict.startsWith('BORN-DIGITAL'));
        console.error(`\n${f}  ${(buf.length / 1048576).toFixed(1)}MB`);
        console.error(`  poppler   : ${popplerSays}  (pages=${pages})`);
        console.error(`  structure : fontPrograms=${st.fontProgram} fontRefs=${st.fontRef} pages=${st.page} objStm=${st.objStm}`);
        console.error(`              images=${st.imageXObj}  DCT=${st.dct} CCITT=${st.ccitt} JBIG2=${st.jbig2} JPX=${st.jpx}`);
        console.error(`  verdict   : ${st.verdict}`);
        console.error(`  ⭐ TWO SOURCES ${agree ? 'AGREE — the zero is REAL' : 'DISAGREE — UNKNOWN, do not report'}`);
        out.files.push({ file: f, mb: +(buf.length / 1048576).toFixed(2), popplerPages: pages, popplerChars: chars, structure: st, sourcesAgree: agree });
    }
    save('_05_scan_confirm.json', out);
}
