#!/usr/bin/env tsx
// W6 — is check-mirror-completeness's family subject NARROWER than
// check-snapshot-family-coverage's? Both read `super('<key>')` from Store
// subclasses under plugins/, but one restricts to `src/store.ts` exactly.
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { walk, relPath } from '../../../../tools/ga-gate/lib/sourceScan.js';
const ROOT = process.cwd();
const narrow = new Map<string, string>(); const wide = new Map<string, string>();
for (const abs of walk(path.join(ROOT, 'plugins'))) {
  const rel = relPath(ROOT, abs);
  if (!/^plugins\/[^/]+\/src\/.*\.ts$/.test(rel)) continue;
  if (/\.(test|spec)\.ts$/.test(rel) || rel.includes('/__tests__/')) continue;
  let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
  if (!/\bextends\s+Store\b/.test(src)) continue;
  for (const m of src.matchAll(/super\('([A-Za-z0-9_-]+)'\)/g)) {
    wide.set(m[1]!, rel);
    if (/^plugins\/[^/]+\/src\/store\.ts$/.test(rel)) narrow.set(m[1]!, rel);
  }
}
console.log(`NARROW (src/store.ts only) = ${narrow.size}`);
console.log(`WIDE   (any src/**.ts)     = ${wide.size}`);
const only = [...wide.keys()].filter((k) => !narrow.has(k)).sort();
console.log(`INVISIBLE TO check-mirror-completeness = ${only.length}: ${only.join(', ')}`);
for (const k of only) console.log(`   · ${k} -> ${wide.get(k)}`);
console.log('ALL_WIDE=' + [...wide.keys()].sort().join(','));
