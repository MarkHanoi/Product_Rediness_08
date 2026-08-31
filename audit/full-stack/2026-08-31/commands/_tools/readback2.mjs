import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
const ROOT = process.cwd();
const OUT = path.join(ROOT, 'audit/full-stack/2026-08-31/commands/_raw');
const known = new Set(require0().rows.map((r) => r.verb));
function require0() { return JSON.parse(readFileSync(path.join(OUT, 'verb-rows.json'), 'utf8')); }
function* walk(dir) {
  let e; try { e = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const x of e) {
    if (x.name === 'node_modules' || x.name === 'dist' || x.name === '.git') continue;
    const p = path.join(dir, x.name);
    if (x.isDirectory()) yield* walk(p); else if (/\.(test|spec)\.tsx?$/.test(x.name)) yield p;
  }
}
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const files = []; for (const r of ['apps', 'packages', 'plugins', 'tools']) for (const f of walk(path.join(ROOT, r))) files.push(f);
const byVerb = new Map();
for (const abs of files) {
  const src = readFileSync(abs, 'utf8');
  if (!/executeCommand\s*\(|\.execute\s*\(/.test(src)) continue;
  const compose = /\bcomposeRuntime\s*\(/.test(src);
  const verbs = new Set([...src.matchAll(/'([a-z][\w-]*(?:\.[\w-]+)+)'/g)].map((m) => m[1]).filter((v) => known.has(v)));
  const storeRead = /expect\([^)]*\b(store|Store|stores)\b/.test(src) || /\.stores\.[a-zA-Z]+/.test(src) || /getAll\(\)|\.all\(\)|\.get\(/.test(src);
  for (const v of verbs) {
    const cur = byVerb.get(v) ?? { verb: v, tests: [], composedTests: [], storeReadTests: [] };
    cur.tests.push(rel(abs));
    if (compose) cur.composedTests.push(rel(abs));
    if (storeRead) cur.storeReadTests.push(rel(abs));
    byVerb.set(v, cur);
  }
}
const rows = [...byVerb.values()].map((r) => ({ ...r, composedAndRead: r.composedTests.filter((t) => r.storeReadTests.includes(t)) })).sort((a, b) => a.verb.localeCompare(b.verb));
writeFileSync(path.join(OUT, 'readback-candidates.json'), JSON.stringify({ verbs: rows.length, rows }, null, 1));
console.log('verbs with any test:', rows.length);
console.log('verbs with composed+storeRead in SAME file:', rows.filter((r) => r.composedAndRead.length).length);
console.log(rows.filter((r) => r.composedAndRead.length).map((r) => r.verb).join('\n'));
