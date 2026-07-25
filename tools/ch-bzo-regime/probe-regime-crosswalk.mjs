#!/usr/bin/env node
// tools/ch-bzo-regime/probe-regime-crosswalk.mjs
//
// Reproducible probe that SOURCES + CLASSIFIES the City-of-Zürich BZO docid -> regime crosswalk
// (Build Step 2 of the Zürich certification path). Probe-first: it fetches real data, never assumes.
//
//   1. Query the LIVE Stadt-Zürich BZO WFS (`bzo_zone_v`) for a broad sample of `rechtsvorschrift_url`
//      values and extract every distinct oerebdocs `docid`.
//   2. Fetch each `getDoc?docid=<N>` PDF, extract its text (via `pdftotext`, from poppler), and
//      classify it with the SAME pure `classifyBzoRegimeFromDocText` the runtime resolver uses.
//   3. Print the docid -> regime verdicts (and the unclassifiable ones), so the crosswalk in
//      `docs/04-reference/jurisdictions/ch/sources/bzo_regime_crosswalk.json` +
//      `packages/site-parcel-data/src/providers/chZurichBzoCatalogue.ts` can be reproduced / refreshed.
//
// Requirements: Node >= 20 (global fetch), `pdftotext` on PATH (poppler-utils). NETWORK access to
// ogd.stadt-zuerich.ch + oerebdocs.zh.ch (US egress verified working 2026-07-25). Read-only; writes
// only scratch PDFs to a temp dir. Does NOT modify the repo and does NOT flip CH_FAR_CERTIFIED.
//
// Usage:  node tools/ch-bzo-regime/probe-regime-crosswalk.mjs [--max-features 4000] [--limit 25]

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyBzoRegimeFromDocText, extractOerebDocIds } from '@pryzm/site-parcel-data';

const WFS =
    'https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Nutzungsplanung___kommunale_Bau__und_Zonenordnung__BZO_';
const GETDOC = 'https://oerebdocs.zh.ch/getDoc?docid=';

const arg = (name, dflt) => {
    const i = process.argv.indexOf(name);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const maxFeatures = Number(arg('--max-features', '4000'));
const limit = Number(arg('--limit', '25'));

async function fetchDocidsFromWfs() {
    const url =
        `${WFS}?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=bzo_zone_v` +
        `&PROPERTYNAME=rechtsvorschrift_url&MAXFEATURES=${maxFeatures}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`WFS GetFeature failed: HTTP ${res.status}`);
    const gml = await res.text();
    const freq = new Map();
    for (const m of gml.matchAll(/<[^>]*rechtsvorschrift_url>([^<]*)</g)) {
        for (const id of extractOerebDocIds(m[1])) freq.set(id, (freq.get(id) ?? 0) + 1);
    }
    return [...freq.entries()].sort((a, b) => b[1] - a[1]); // [docid, count] desc by frequency.
}

async function classifyDocid(dir, docid) {
    const res = await fetch(`${GETDOC}${docid}`, { redirect: 'follow' });
    if (!res.ok) return { docid, regime: null, note: `fetch HTTP ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    const pdf = join(dir, `doc_${docid}.pdf`);
    writeFileSync(pdf, buf);
    let text = '';
    try {
        text = execFileSync('pdftotext', [pdf, '-'], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
    } catch {
        text = ''; // image-only scan / pdftotext failure -> classifier will return null.
    }
    const regime = classifyBzoRegimeFromDocText(text);
    const note = text.trim() === '' ? 'no extractable text (image-only)' : regime ? '' : 'no clear marker';
    return { docid, regime, note, bytes: buf.length };
}

async function main() {
    console.log(`[probe] WFS = ${WFS}\n[probe] layer = bzo_zone_v, field = rechtsvorschrift_url\n`);
    const docids = await fetchDocidsFromWfs();
    console.log(`[probe] ${docids.length} distinct docids sampled; classifying top ${limit} by frequency:\n`);
    const dir = mkdtempSync(join(tmpdir(), 'ch-bzo-regime-'));
    try {
        for (const [docid, count] of docids.slice(0, limit)) {
            const r = await classifyDocid(dir, docid);
            const verdict = r.regime ?? 'null (EXCLUDED — refuse regime-ambiguous)';
            console.log(
                `  docid=${docid.padEnd(6)} freq=${String(count).padStart(4)}  => ${verdict}` +
                    (r.note ? `   [${r.note}]` : ''),
            );
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
    console.log('\n[probe] done. CH_FAR_CERTIFIED is NOT touched by this script.');
}

main().catch((e) => {
    console.error('[probe] failed:', e.message);
    process.exit(1);
});
