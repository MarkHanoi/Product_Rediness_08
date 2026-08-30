#!/usr/bin/env tsx
// W6 COST PROBE — read-only. Answers: how much of check-mirror-reachability's
// wall time is FIXED (tsx boot + subscriber census) and how much is PER-FAMILY
// (plugin handler module import + dispatch)? The extension-cost estimate in
// W6-read-back.json is grounded on this, not on the 88 s figure in run-all.ts.
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { walk, relPath } from '../../../../tools/ga-gate/lib/sourceScan.js';

const ROOT = process.cwd();
const t0 = Date.now();
// 1. census walk, same shape as subscriberCensus()
let files = 0; const names = new Set<string>();
const RE = /\.on\(\s*'([a-zA-Z][a-zA-Z0-9._-]*\.[a-zA-Z0-9._-]+)'/g;
for (const dir of ['apps', 'plugins', 'packages']) {
  for (const abs of walk(path.join(ROOT, dir))) {
    const rel = relPath(ROOT, abs);
    if (!/\.(ts|tsx)$/.test(rel)) continue;
    if (/\.(test|spec)\.tsx?$/.test(rel)) continue;
    if (rel.includes('/__tests__/') || rel.includes('/dist/')) continue;
    let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
    files++; RE.lastIndex = 0; let m;
    while ((m = RE.exec(src)) !== null) names.add(m[1]!);
  }
}
const tCensus = Date.now() - t0;
console.log(`CENSUS_WALK_MS=${tCensus} files=${files} names=${names.size}`);

// 2. runtime harness import (bus/emitter/stores/eventbus/bridge)
const u = (r: string) => pathToFileURL(path.join(ROOT, r)).href;
const t1 = Date.now();
await import(u('packages/command-bus/src/CommandBus.ts'));
await import(u('packages/command-bus/src/PatchEmitter.ts'));
await import(u('packages/stores/src/attachStores.ts'));
await import(u('packages/runtime-composer/src/EventBus.ts'));
await import(u('packages/runtime-composer/src/CommandEventBridge.ts'));
console.log(`HARNESS_IMPORT_MS=${Date.now() - t1}`);

// 3. per-family cost: store + every handler module under plugins/<p>/src/handlers
const fams = process.argv.slice(2);
for (const p of fams) {
  const t = Date.now();
  let n = 0;
  try { await import(u(`plugins/${p}/src/store.ts`)); } catch (e) { console.log(`  ${p} store FAILED: ${(e as Error).message.split('\n')[0].slice(0,120)}`); }
  let hs: string[] = [];
  try { hs = [...walk(path.join(ROOT, 'plugins', p, 'src', 'handlers'))].filter((a) => /\.ts$/.test(a) && !/\.(test|spec)\.ts$/.test(a)); } catch { /* none */ }
  for (const h of hs) {
    try { await import(pathToFileURL(h).href); n++; } catch (e) { console.log(`  ${p} ${path.basename(h)} FAILED: ${(e as Error).message.split('\n')[0].slice(0,140)}`); }
  }
  console.log(`FAMILY ${p.padEnd(16)} handlers=${String(n).padStart(3)}/${String(hs.length).padStart(3)} import_ms=${Date.now() - t}`);
}
console.log(`TOTAL_MS=${Date.now() - t0}`);
