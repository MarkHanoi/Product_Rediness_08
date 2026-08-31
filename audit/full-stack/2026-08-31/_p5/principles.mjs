// P2/P3/P4 per family — executed measurement over the SAME file set the layer gate scans.
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
const M = JSON.parse(readFileSync('audit/full-stack/2026-08-31/_p5/families-map.json', 'utf8')).map;
const files = execSync('git ls-files --cached --others --exclude-standard -- "packages/**/*.ts" "plugins/**/*.ts" "packages/**/*.tsx"', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\n').map(s => s.trim()).filter(Boolean)
  .filter(f => !f.includes('__tests__') && !f.endsWith('.d.ts') && !f.includes('/dist/'));

const BS = String.fromCharCode(92);
function strip(src) {
  let out = ''; let q = null;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i], prev = src[i - 1];
    if (q) { out += ch; if (ch === q && prev !== BS) q = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; out += ch; continue; }
    if (ch === '/' && src[i + 1] === '/') { const nl = src.indexOf('\n', i); i = nl === -1 ? src.length : nl; out += '\n'; continue; }
    if (ch === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const seg = src.slice(i, e === -1 ? src.length : e + 2); out += seg.replace(/[^\n]/g, ' '); i = e === -1 ? src.length : e + 1; continue; }
    out += ch;
  }
  return out;
}
const inDirs = (f, ds) => ds.some(d => f === d || f.startsWith(d + '/'));
const P2 = /import\s+\*\s+as\s+THREE\s+from\s+['"]three['"]/;         // P2: raw `three`, not the owned re-export
const P2b = /from\s+['"]three['"]/;
const P3 = /\brequestAnimationFrame\s*\(/;
const P4 = /\(\s*window\s+as\s+any\s*\)|\(\s*globalThis\s+as\s+any\s*\)|window\s+as\s+unknown\s+as\s+Record<string,\s*unknown>/;
const out = {};
for (const [fam, dirs] of Object.entries(M)) {
  const fs_ = files.filter(f => inDirs(f, dirs));
  const r = { files_scanned: fs_.length, P2_raw_three: [], P3_raf: [], P4_window_cast: [] };
  for (const f of fs_) {
    let s; try { s = strip(readFileSync(f, 'utf8')); } catch { continue; }
    const lines = s.split('\n');
    lines.forEach((L, i) => {
      if (P2b.test(L) && !L.includes('@pryzm/')) r.P2_raw_three.push(`${f}:${i + 1}`);
      if (P3.test(L)) r.P3_raf.push(`${f}:${i + 1}`);
      if (P4.test(L)) r.P4_window_cast.push(`${f}:${i + 1}`);
    });
  }
  out[fam] = r;
}
console.log(JSON.stringify(out, null, 1));
