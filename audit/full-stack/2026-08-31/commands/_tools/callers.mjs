// For every one of the 361 verbs: does the verb literal appear in PRODUCTION source
// OUTSIDE its own handler file(s)? An absence here is a capability search, not a
// name search: it scans every .ts/.tsx under apps/ packages/ plugins/ with
// node_modules, dist, *.test.*, *.spec.* and __tests__/ excluded, and reports the
// EXCLUSIONS alongside the number.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
const ROOT = process.cwd();
const R = path.join(ROOT, 'audit/full-stack/2026-08-31/commands/_raw');
const all = JSON.parse(readFileSync(path.join(R, 'verb-rows.json'), 'utf8'));
function* walk(dir) {
  let e; try { e = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const x of e) {
    if (x.name === 'node_modules' || x.name === 'dist' || x.name === '.git' || x.name === '__tests__') continue;
    const p = path.join(dir, x.name);
    if (x.isDirectory()) yield* walk(p);
    else if (/\.tsx?$/.test(x.name) && !/\.(test|spec)\.tsx?$/.test(x.name) && !/\.d\.ts$/.test(x.name)) yield p;
  }
}
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const files = [];
for (const r of ['apps', 'packages', 'plugins']) for (const f of walk(path.join(ROOT, r))) files.push(f);
const src = new Map();
for (const f of files) src.set(rel(f), readFileSync(f, 'utf8'));
const out = [];
for (const row of all.rows) {
  const lit1 = "'" + row.verb + "'";
  const lit2 = '"' + row.verb + '"';
  const own = new Set(row.sites.map((s) => s.split(':')[0]));
  const hits = [];
  for (const [f, s] of src) {
    if (own.has(f)) continue;
    if (s.includes(lit1) || s.includes(lit2)) hits.push(f);
  }
  out.push({ verb: row.verb, kind: row.kind, liveness: row.liveness, ownFiles: [...own], externalMentionCount: hits.length, externalMentions: hits.slice(0, 8) });
}
writeFileSync(path.join(R, 'external-callers.json'), JSON.stringify({ filesScanned: files.length, exclusions: 'node_modules, dist, __tests__/, *.test.ts(x), *.spec.ts(x), *.d.ts. Roots: apps/, packages/, plugins/. A verb assembled from a template literal would be invisible; none is known.', rows: out }, null, 1));
const zero = out.filter((r) => r.externalMentionCount === 0);
console.log('files scanned', files.length);
console.log('verbs with ZERO production mention outside their own handler file:', zero.length);
const byKind = {}; for (const z of zero) byKind[z.kind] = (byKind[z.kind] || 0) + 1;
console.log(JSON.stringify(byKind));
