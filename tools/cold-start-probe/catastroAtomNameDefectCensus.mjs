#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A NATIONAL DEFECT, SIZED — Catastro's INSPIRE CP ATOM publishes UNRESOLVABLE download URLs.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// FOUND while building the AMB parcel frames: 08263 Sant Vicenç dels Horts could not be downloaded.
//
// THE DEFECT, MEASURED (not inferred):
//   The province ATOM is `encoding="ISO-8859-1"` and contains **ZERO non-ASCII bytes** — the
//   publisher has pre-flattened every municipality name. Accents flatten CLEANLY (`Gavà`→`GAVA`,
//   `Pallejà`→`PALLEJA`). But **`ç` and `'` are replaced by a GAP**, and the gap is written into
//   BOTH the <title> AND the DIRECTORY SEGMENT OF THE <link href>, while the real directory on the
//   server has a SINGLE space:
//       ATOM href  …/08/08263-SANT VICEN{TWO spaces}DELS HORTS/A.ES.SDGC.CP.08263.zip → HTML, 200
//       real path  …/08/08263-SANT VICEN{ONE space}DELS HORTS/A.ES.SDGC.CP.08263.zip  → ZIP, 1.56 MB
//   `%C7`, `%C3%87` and a literal `C` were all tried and all returned the HTML page.
//
// ⛔ AND IT FAILS OPEN. The wrong path does NOT 404 — Catastro answers **HTTP 200, text/html,
//   15,257 bytes** of site chrome. `res.ok` is true. Any downloader that trusts the status code
//   writes an HTML page to a `.zip` and reports a downstream archive error, which blames the wrong
//   component. §CONTEXT-DATA-HONESTY: a 200 that is not the thing you asked for is a FAILURE.
//
// THIS SCRIPT counts, per province, how many enclosures the publisher has made unreachable —
// so the fix can be scoped nationally instead of rediscovered one municipality at a time.
//
//   node catastroAtomNameDefectCensus.mjs            # all 52 provinces (cached)
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, '.cache');
const OUT = join(HERE, 'out');
for (const d of [CACHE, OUT]) if (!existsSync(d)) mkdirSync(d, { recursive: true });
const UA = 'PRYZM-cold-start-probe/1.0 (+pryzmhello@gmail.com)';

// ⚠ 01/20/48 (País Vasco) and 31 (Navarra) run FORAL cadastres — Catastro CP does not publish them.
// They are EXCLUDED from the denominator rather than counted as failures.
const FORAL = new Set(['01', '20', '48', '31']);
const provinces = [];
for (let i = 1; i <= 52; i++) { const p = String(i).padStart(2, '0'); if (!FORAL.has(p)) provinces.push(p); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = [];
for (const prov of provinces) {
    const path = join(CACHE, `atom_${prov}.xml`);
    let xml = null;
    if (existsSync(path)) xml = readFileSync(path, 'utf8');
    else {
        try {
            const r = await fetch(`https://www.catastro.hacienda.gob.es/INSPIRE/CadastralParcels/${prov}/ES.SDGC.CP.atom_${prov}.xml`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(120000) });
            if (r.ok) { xml = await r.text(); writeFileSync(path, xml); }
        } catch { /* recorded as unread below — UNKNOWN, never zero */ }
        await sleep(400);
    }
    if (xml === null) { rows.push({ province: prov, read: false, note: 'ATOM unread — UNKNOWN, not zero' }); console.log(`✗ ${prov} ATOM unread`); continue; }
    const titles = [...xml.matchAll(/<title>\s*(\d{5})-([^<]*?)\s*Cadastral Parcels<\/title>/gi)].map((m) => ({ code: m[1], title: m[2] }));
    const hrefs = [...xml.matchAll(/href="([^"]*A\.ES\.SDGC\.CP\.(\d{5})\.zip)"/gi)].map((m) => ({ url: m[1], code: m[2] }));
    const byCode = new Map(hrefs.map((h) => [h.code, h.url]));
    const damaged = titles.filter((t) => /\s{2,}/.test(t.title));
    // The URL is what actually breaks — a damaged title with an intact href would still download.
    const brokenUrls = damaged.filter((t) => /\s{2,}/.test(byCode.get(t.code) ?? ''));
    rows.push({
        province: prov, read: true,
        entries: titles.length,
        damagedTitles: damaged.length,
        unresolvableEnclosureUrls: brokenUrls.length,
        pctUnresolvable: titles.length ? +(100 * brokenUrls.length / titles.length).toFixed(2) : null,
        examples: brokenUrls.slice(0, 6).map((t) => ({ dgcCode: t.code, title: t.title })),
    });
    console.log(`${prov}  entries ${String(titles.length).padStart(4)}  unresolvable ${String(brokenUrls.length).padStart(3)}  ${titles.length ? (100 * brokenUrls.length / titles.length).toFixed(2) : '—'} %`);
}

const read = rows.filter((r) => r.read);
const summary = {
    provincesRead: read.length,
    provincesUnread: rows.length - read.length,
    foralExcluded: [...FORAL],
    totalEnclosures: read.reduce((a, r) => a + r.entries, 0),
    totalUnresolvable: read.reduce((a, r) => a + r.unresolvableEnclosureUrls, 0),
    // ⛔ Reported as a COUNT and a share of the READ denominator. Not extrapolated to the unread.
    pctOfReadEnclosures: null,
    worstProvinces: read.slice().sort((a, b) => b.unresolvableEnclosureUrls - a.unresolvableEnclosureUrls).slice(0, 10).map((r) => ({ province: r.province, unresolvable: r.unresolvableEnclosureUrls, entries: r.entries, pct: r.pctUnresolvable })),
};
summary.pctOfReadEnclosures = summary.totalEnclosures ? +(100 * summary.totalUnresolvable / summary.totalEnclosures).toFixed(3) : null;

writeFileSync(join(OUT, 'catastro-atom-name-defect-census.json'), JSON.stringify({
    probe: 'Catastro INSPIRE CP ATOM — unresolvable enclosure URLs caused by the publisher replacing ç/apostrophe with a gap',
    ranAt: new Date().toISOString(),
    reproduce: "the ATOM href for DGC 08263 has TWO spaces where 'ç' stood; the real directory has ONE. The two-space URL returns HTTP 200 text/html (15,257 bytes), not a 404.",
    summary, provinces: rows,
}, null, 1));
console.log(`\nNATIONAL: ${summary.totalUnresolvable} unresolvable enclosure URLs across ${summary.provincesRead} provinces / ${summary.totalEnclosures} municipalities (${summary.pctOfReadEnclosures} %)`);
console.log('→ out/catastro-atom-name-defect-census.json');
