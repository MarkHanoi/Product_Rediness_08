// DISPATCH-SHAPED reachability probe. Same corpus as callers.mjs, but a mention only
// counts when the verb literal sits inside a 400-character window around an
// executeCommand( / .execute( / dispatch( token in a PRODUCTION file that is not the
// verb's own handler file. This is the shape DoorBatchCreateLiveness.probe.test.ts
// uses, and that test carries a POSITIVE CONTROL (wall.batch.create) which this
// script reproduces below so the scan cannot be blind.
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
const DISPATCH = /executeCommand\s*\(|\bdispatch\s*\(|\.execute\s*\(|runBatch\s*\(/g;
const windows = new Map();
for (const [f, s] of src) {
  DISPATCH.lastIndex = 0; let m; const ws = [];
  while ((m = DISPATCH.exec(s)) !== null) ws.push(s.slice(Math.max(0, m.index - 120), m.index + 400));
  if (ws.length) windows.set(f, ws);
}
const out = [];
for (const row of all.rows) {
  const lit1 = "'" + row.verb + "'", lit2 = '"' + row.verb + '"';
  const own = new Set(row.sites.map((s) => s.split(':')[0]));
  const hits = [];
  for (const [f, ws] of windows) {
    if (own.has(f)) continue;
    if (ws.some((w) => w.includes(lit1) || w.includes(lit2))) hits.push(f);
  }
  out.push({ verb: row.verb, kind: row.kind, liveness: row.liveness, dispatchSiteCount: hits.length, dispatchSites: hits.slice(0, 6) });
}
const control = out.find((r) => r.verb === 'wall.batch.create');
const doorB = out.find((r) => r.verb === 'door.batch.create');
const winB = out.find((r) => r.verb === 'window.batch.create');
writeFileSync(path.join(R, 'dispatch-sites.json'), JSON.stringify({
  filesScanned: files.length,
  method: 'verb literal inside a 400-char window after (and 120 before) executeCommand( / dispatch( / .execute( / runBatch( in a production file that is not the verb own handler file. node_modules, dist, __tests__/, *.test.*, *.spec.*, *.d.ts excluded.',
  POSITIVE_CONTROL: { verb: 'wall.batch.create', dispatchSiteCount: control.dispatchSiteCount, note: 'The probe test DoorBatchCreateLiveness.probe.test.ts uses wall.batch.create as its positive control and finds it dispatched. If this number were 0 the scan would be blind and every zero below would be worthless.' },
  REPRODUCES_THE_EXECUTED_PROBE: { 'door.batch.create': doorB.dispatchSiteCount, 'window.batch.create': winB.dispatchSiteCount, note: 'Both probe tests, which I EXECUTED (RC=0), assert ZERO production dispatch sites for these two.' },
  rows: out,
}, null, 1));
const zero = out.filter((r) => r.dispatchSiteCount === 0);
console.log('files scanned', files.length);
console.log('POSITIVE CONTROL wall.batch.create dispatch sites:', control.dispatchSiteCount);
console.log('door.batch.create:', doorB.dispatchSiteCount, ' window.batch.create:', winB.dispatchSiteCount);
console.log('verbs with ZERO dispatch-shaped site outside their own handler:', zero.length, 'of', out.length);
const byKind = {}; for (const z of zero) byKind[z.kind] = (byKind[z.kind] || 0) + 1;
console.log(JSON.stringify(byKind));
