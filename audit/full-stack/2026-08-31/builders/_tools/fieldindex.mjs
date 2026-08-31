import fs from 'fs';
import path from 'path';
const roots = ['packages', 'apps', 'plugins'];
const counts = new Map();
const filesOf = new Map();
let nfiles = 0;
function walk2(d) {
  let ents;
  try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(d, e.name);
    const up = p.split(path.sep).join('/');
    if (e.isDirectory()) {
      if (['node_modules', 'dist', '.turbo', '__tests__', 'coverage', 'build'].includes(e.name)) continue;
      if (up.startsWith('packages/schemas')) continue;
      walk2(p);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(e.name)) continue;
    if (/\.test\.ts$|\.spec\.ts$|\.d\.ts$/.test(e.name)) continue;
    nfiles++;
    let s;
    try { s = fs.readFileSync(p, 'utf8'); } catch { continue; }
    const seen = new Set();
    for (const m of s.matchAll(/[A-Za-z_$][\w$]*/g)) {
      const w = m[0];
      counts.set(w, (counts.get(w) || 0) + 1);
      if (!seen.has(w)) {
        seen.add(w);
        let st = filesOf.get(w);
        if (!st) { st = []; filesOf.set(w, st); }
        if (st.length < 8) st.push(up);
      }
    }
  }
}
for (const r of roots) walk2(r);
fs.writeFileSync(
  'audit/full-stack/2026-08-31/builders/_raw/word-index.json',
  JSON.stringify({ nfiles, counts: Object.fromEntries(counts), files: Object.fromEntries(filesOf) })
);
console.log('files scanned', nfiles, 'distinct words', counts.size);
