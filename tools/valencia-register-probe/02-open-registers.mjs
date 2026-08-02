// STEP 2 — OPEN the three registers. This is the whole run: does `url_abs` resolve to an
// expediente-keyed register, and what is IN it?
//
// The five outcomes we must distinguish (they price very differently):
//   (a) machine-readable text (HTML / text PDF) with articles
//   (b) text PDF but no article structure
//   (c) image-only scan  -> OCR + a digit-integrity gate
//   (d) register reachable but the ordenanza is NOT in it (metadata only)
//   (e) dead / auth-walled
//
// ⛔ NOTHING IS CLASSIFIED FROM A LISTING. A filename that reads "Normas Urbanísticas" is a
// FILENAME, not a document. Step 3 opens the bytes.
import fs from 'node:fs';
import path from 'node:path';
import { get, save, load, ensureDocs, DOCS } from './lib.mjs';

ensureDocs();
const sample = load('_01_sample.json').sample;
const out = { registers: [] };

/** Parse an Apache/IIS autoindex OR any HTML listing into { href, text } pairs. */
function links(html, baseUrl) {
    const res = [];
    for (const m of html.matchAll(/<a\s [^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const text = m[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
        let abs;
        try { abs = new URL(m[1], baseUrl).href; } catch { continue; }
        res.push({ href: m[1], abs, text });
    }
    return res;
}

function classifyServer(h) {
    return h.server || h['x-powered-by'] || 'unstated';
}

for (const m of sample) {
    if (m.st !== 'OK') continue;
    const url = m.urlAbs[0];
    console.error(`\n══ ${m.name} (${m.ine}) ${m.klass}`);
    console.error(`   ${url}`);
    const r = await get(url, 90000);
    const rec = { ine: m.ine, name: m.name, klass: m.klass, prov: m.prov, url, http: r.http, finalUrl: r.url, bytes: r.bytes, ctype: r.headers['content-type'] || null, server: classifyServer(r.headers) };
    if (!r.ok) {
        rec.outcome = '(e) DEAD/BLOCKED';
        rec.why = r.err || `HTTP ${r.http}`;
        console.error(`   ⛔ ${rec.outcome} — ${rec.why}`);
        out.registers.push(rec);
        continue;
    }
    console.error(`   HTTP ${r.http}  ${r.bytes}B  ctype=${rec.ctype}  server=${rec.server}`);
    fs.writeFileSync(path.join(DOCS, `reg_${m.ine}.html`), r.buf);

    const ls = links(r.body, r.url);
    // An autoindex lists its own parent and sort links; keep only descendants.
    const kids = ls.filter((l) => l.abs.startsWith(r.url.replace(/\/$/, '')) && l.abs !== r.url && !/[?]/.test(l.href));
    rec.linkCount = ls.length;
    rec.childCount = kids.length;
    rec.isAutoindex = /Index of|Índice de|Directory Listing/i.test(r.body) || kids.length > 2;
    rec.children = kids.map((k) => ({ text: k.text, abs: k.abs, ext: (k.abs.match(/\.([a-z0-9]{2,4})$/i) || [])[1]?.toLowerCase() || (k.abs.endsWith('/') ? 'DIR' : null) }));
    const byExt = {};
    for (const c of rec.children) byExt[c.ext || 'none'] = (byExt[c.ext || 'none'] || 0) + 1;
    rec.childrenByExt = byExt;
    console.error(`   links=${ls.length} descendants=${kids.length} autoindex=${rec.isAutoindex}`);
    console.error(`   by ext: ${JSON.stringify(byExt)}`);
    for (const c of rec.children.slice(0, 40)) console.error(`     [${c.ext || '?'}] ${c.text}`);
    if (rec.children.length > 40) console.error(`     … +${rec.children.length - 40} more`);
    if (kids.length === 0) {
        rec.snippet = r.body.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
        console.error(`   NO DESCENDANTS. body snippet: ${rec.snippet.slice(0, 300)}`);
    }
    out.registers.push(rec);
}
save('_02_registers.json', out);
