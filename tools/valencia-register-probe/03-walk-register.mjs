// STEP 3 — WALK each register tree to the leaves.
//
// The registers are Apache mod_autoindex trees rooted at `url_abs`. Structure observed at
// depth 1: `1 P. GENERAL/`, `2 P. DIFERIDO/` — i.e. filed by INSTRUMENT CLASS, then (below)
// by expediente. This step enumerates every leaf FILE so step 4 can open the ones that claim
// to be the ordenanza.
//
// ⛔ A FILENAME IS NOT A DOCUMENT. This step records names and HEAD metadata only. The
// classification (a)-(e) is NOT made here.
import { get, save, load, ensureDocs } from './lib.mjs';

ensureDocs();
const sample = load('_01_sample.json').sample;
const MAX_DEPTH = 6;
const MAX_NODES = 400;

function links(html, baseUrl) {
    const res = [];
    for (const m of html.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const text = m[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
        if (!text || /^\[/.test(text)) continue;               // icon anchors
        if (/^[?]/.test(m[1])) continue;                        // autoindex sort links
        if (/^\/|^https?:/i.test(m[1]) && !m[1].startsWith(baseUrl)) {
            // absolute link off the subtree (parent dir, stylesheet host) — skip
            try { if (!new URL(m[1], baseUrl).href.startsWith(baseUrl)) continue; } catch { continue; }
        }
        let abs; try { abs = new URL(m[1], baseUrl).href; } catch { continue; }
        if (!abs.startsWith(baseUrl.replace(/[^/]*$/, ''))) continue;
        res.push({ abs, text, isDir: m[1].endsWith('/') });
    }
    return res;
}

const out = { municipalities: [] };

for (const m of sample) {
    if (m.st !== 'OK') continue;
    const root = m.urlAbs[0].replace(/\/?$/, '/');
    console.error(`\n══ ${m.name} (${m.ine})  ${root}`);
    const dirs = [{ url: root, depth: 0, label: '' }];
    const seen = new Set([root]);
    const files = [];
    let nodes = 0, dirErrors = 0;

    while (dirs.length && nodes < MAX_NODES) {
        const d = dirs.shift();
        nodes++;
        const r = await get(d.url, 60000);
        if (!r.ok) { dirErrors++; console.error(`   ⛔ dir HTTP ${r.http ?? r.err}  ${d.url}`); continue; }
        const ls = links(r.body, d.url);
        for (const l of ls) {
            if (seen.has(l.abs)) continue;
            seen.add(l.abs);
            const label = d.label ? `${d.label} / ${l.text.replace(/\/$/, '')}` : l.text.replace(/\/$/, '');
            if (l.isDir) {
                if (d.depth < MAX_DEPTH) dirs.push({ url: l.abs, depth: d.depth + 1, label });
            } else {
                files.push({ url: l.abs, name: l.text, path: label, depth: d.depth + 1, ext: (l.text.match(/\.([a-z0-9]{2,4})$/i) || [])[1]?.toLowerCase() || null });
            }
        }
    }
    const byExt = {};
    for (const f of files) byExt[f.ext || 'none'] = (byExt[f.ext || 'none'] || 0) + 1;
    console.error(`   dirs visited=${nodes} dirErrors=${dirErrors} files=${files.length} truncated=${dirs.length > 0}`);
    console.error(`   by ext: ${JSON.stringify(byExt)}`);

    // Top-level instrument classes, for the report.
    const topDirs = [...new Set(files.map((f) => f.path.split(' / ')[0]))];
    console.error(`   instrument classes: ${JSON.stringify(topDirs)}`);
    for (const f of files.slice(0, 60)) console.error(`     ${f.path}`);
    if (files.length > 60) console.error(`     … +${files.length - 60} more`);

    out.municipalities.push({
        ine: m.ine, name: m.name, klass: m.klass, prov: m.prov, root,
        dirsVisited: nodes, dirErrors, truncated: dirs.length > 0, fileCount: files.length,
        byExt, topDirs, files,
    });
}
save('_03_tree.json', out);
