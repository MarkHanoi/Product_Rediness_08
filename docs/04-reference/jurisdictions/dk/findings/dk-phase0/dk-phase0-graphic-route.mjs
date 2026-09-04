#!/usr/bin/env node
// DK PHASE 0 — GRAPHIC-LEG ROUTE PROBE. Lane ENVELOPE-NLDK, round 3, 2026-09-04.
//
// `rulepacks/dkGraphicLeg.ts` (dd279349) decides, per parcel, which ROUTE the drawn regulation
// takes for `iomfangreg = true` (61.2 % of lokalplan features, D4c): byggefelt-geometry >
// delomraade-extent > document-kortbilag. This script MEASURES that route split over the banked
// Phase 0 rows (seed 20260903, land + urban strata, NEVER pooled) — and, for the document route
// and every other, whether the `doklink` the leg hands the reader actually ANSWERS (HEAD status,
// content type, size). A doklink that 404s is `inaccessible`, not `graphic`; conflating them is
// the failure-vs-empty collapse (§CONTEXT-DATA-HONESTY).
//
// It READS the banked sample files and makes ONE HEAD request per distinct doklink. No new
// sampling; no Datafordeler call (credential absent at run time — recorded, not worked around).
//
// USAGE: node dk-phase0-graphic-route.mjs > dk-phase0-graphic-route.json
import fs from 'node:fs';

const SAMPLES = { land: 'dk-phase0-sample-land.json', urban: 'dk-phase0-sample-urban.json' };
const truthy = (v) => { const s = String(v ?? '').toLowerCase(); return s === 'true' || s === 't' || s === '1' || s === 'ja'; };
const falsy = (v) => { const s = String(v ?? '').toLowerCase(); return s === 'false' || s === 'f' || s === '0' || s === 'nej'; };

async function head(url) {
    for (let i = 0; i < 3; i++) {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 30000);
        try {
            let r = await fetch(url, { method: 'HEAD', signal: ctl.signal, redirect: 'follow' });
            if (r.status === 405 || r.status === 403) r = await fetch(url, { method: 'GET', signal: ctl.signal, redirect: 'follow', headers: { Range: 'bytes=0-0' } });
            clearTimeout(t);
            return { status: r.status, contentType: r.headers.get('content-type'), contentLength: r.headers.get('content-length'), finalUrl: r.url };
        } catch (e) { clearTimeout(t); if (i === 2) return { status: null, error: e.name === 'AbortError' ? 'timeout' : e.message }; await new Promise((res) => setTimeout(res, 800 * (i + 1))); }
    }
}

const out = { generatedAt: new Date().toISOString(), lane: 'ENVELOPE-NLDK round 3', seed: 20260903, method: 'banked rows; iomfangreg read from the governing lokalplan feature at the point; route = byggefelt feature present at point > lokalplandelomraade present > neither; HEAD per distinct doklink', datafordelerCredentialPresent: Boolean(process.env.DATAFORDELER_USERNAME && process.env.DATAFORDELER_PASSWORD), strata: {} };
const doklinks = new Map();
for (const [stratum, file] of Object.entries(SAMPLES)) {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    const s = { rows: d.rows.length, rowsWithLokalplan: 0, iomfangregTrue: 0, iomfangregFalse: 0, iomfangregAbsent: 0, kompleksTrue: 0, route: { 'byggefelt-geometry': 0, 'delomraade-extent': 0, 'document-kortbilag': 0 }, byggefeltSemantics: { 'binding-obligation(bygkunifelt)': 0, 'indicative(bygvejledende)': 0, 'neither-flag': 0, 'both-flags-conflict': 0 }, byggefeltPublishesHeight: 0, withDoklink: 0, doklinkDistinct: 0 };
    for (const row of d.rows) {
        const lps = row.layers?.lokalplan; if (!Array.isArray(lps) || lps.length === 0) continue;
        s.rowsWithLokalplan++;
        const lp = lps[0];
        if (truthy(lp.iomfangreg)) s.iomfangregTrue++; else if (falsy(lp.iomfangreg)) s.iomfangregFalse++; else s.iomfangregAbsent++;
        if (!truthy(lp.iomfangreg)) continue;
        if (truthy(lp.kompleks)) s.kompleksTrue++;
        const bfs = Array.isArray(row.layers?.byggefelt) ? row.layers.byggefelt : [];
        const del = Array.isArray(row.layers?.lokalplandelomraade) && row.layers.lokalplandelomraade.length > 0;
        if (bfs.length > 0) {
            s.route['byggefelt-geometry']++;
            const b = bfs[0]; const k = truthy(b.bygkunifelt), v = truthy(b.bygvejledende);
            s.byggefeltSemantics[k && v ? 'both-flags-conflict' : k ? 'binding-obligation(bygkunifelt)' : v ? 'indicative(bygvejledende)' : 'neither-flag']++;
            if (Number.parseFloat(String(b.maxbygnhjd ?? '')) > 0) s.byggefeltPublishesHeight++;
        } else if (del) s.route['delomraade-extent']++; else s.route['document-kortbilag']++;
        if (lp.doklink) { s.withDoklink++; if (!doklinks.has(lp.doklink)) doklinks.set(lp.doklink, { strata: new Set(), planid: lp.planid }); doklinks.get(lp.doklink).strata.add(stratum); }
    }
    s.doklinkDistinct = [...doklinks.values()].filter((v) => v.strata.has(stratum)).length;
    out.strata[stratum] = s;
}
const results = []; const urls = [...doklinks.keys()]; let i = 0;
async function worker() { while (i < urls.length) { const u = urls[i++]; const r = await head(u); results.push({ doklink: u, planid: doklinks.get(u).planid, strata: [...doklinks.get(u).strata], ...r }); process.stderr.write(`  ${results.length}/${urls.length} ${r.status ?? r.error} ${u}\n`); } }
await Promise.all(Array.from({ length: 4 }, worker));
results.sort((a, b) => a.doklink.localeCompare(b.doklink));
const hist = {}; for (const r of results) { const k = r.status === null ? 'error:' + r.error : String(r.status); hist[k] = (hist[k] ?? 0) + 1; }
const ct = {}; for (const r of results) { const k = String(r.contentType ?? 'none').split(';')[0]; ct[k] = (ct[k] ?? 0) + 1; }
out.doklinkReachability = { distinct: urls.length, statusHistogram: hist, contentTypeHistogram: ct, results };
process.stdout.write(JSON.stringify(out, null, 1));
process.stderr.write(`\nDONE — ${urls.length} distinct doklinks; status ${JSON.stringify(hist)}\n`);
