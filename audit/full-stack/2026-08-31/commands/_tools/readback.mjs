// Which verbs appear inside a test that ALSO calls the real composeRuntime()
// AND asserts against a store read. READ-ONLY.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
const ROOT = process.cwd();
const OUT = path.join(ROOT, 'audit/full-stack/2026-08-31/commands/_raw');
const ROOTS = ['apps', 'packages', 'plugins', 'tools'];
function* walk(dir) {
  let e; try { e = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const x of e) {
    if (x.name === 'node_modules' || x.name === 'dist' || x.name === '.git') continue;
    const p = path.join(dir, x.name);
    if (x.isDirectory()) yield* walk(p); else if (/\.(test|spec)\.tsx?$/.test(x.name)) yield p;
  }
}
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const files = [];
for (const r of ROOTS) for (const f of walk(path.join(ROOT, r))) files.push(f);
const byVerb = new Map();
let composed = 0, withExec = 0;
for (const abs of files) {
  const src = readFileSync(abs, 'utf8');
  const hasCompose = /\bcomposeRuntime\s*\(/.test(src);
  const hasExec = /executeCommand\s*\(/.test(src);
  if (!hasExec) continue;
  withExec++;
  if (hasCompose) composed++;
  // verbs: type: 'x.y' near executeCommand OR any dotted verb literal in the file
  const verbs = new Set([...src.matchAll(/type:\s*'([a-z][\w-]*(?:\.[\w-]+)+)'/g)].map((m) => m[1]));
  // read-back evidence: an expect() that touches a store getter
  const storeRead = /expect\(\s*[\w.]*(stores?|Store)\b[^)]*\)|\.stores\.[a-zA-Z]+\.(get|all|list|byId|getAll|snapshot)/.test(src);
  for (const v of verbs) {
    const cur = byVerb.get(v) ?? { verb: v, tests: [], composed: false, storeRead: false };
    cur.tests.push(rel(abs)); if (hasCompose) cur.composed = true; if (storeRead) cur.storeRead = true;
    byVerb.set(v, cur);
  }
}
const rows = [...byVerb.values()].sort((a, b) => a.verb.localeCompare(b.verb));
writeFileSync(path.join(OUT, 'readback-candidates.json'), JSON.stringify({ testFilesWithExecuteCommand: withExec, ofThoseUsingComposeRuntime: composed, verbs: rows.length, rows }, null, 1));
console.log('testfiles w/ executeCommand', withExec, 'of those composeRuntime', composed, 'distinct verbs', rows.length);
console.log('verbs w/ composed+storeRead', rows.filter(r=>r.composed&&r.storeRead).length);
