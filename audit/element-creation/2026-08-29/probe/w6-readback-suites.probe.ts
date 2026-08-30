#!/usr/bin/env tsx
// W6 — how many EXECUTED read-back suites already exist? Predicate, not a name:
// a test file that (a) dispatches through a real bus (executeCommand / handler
// .execute via CommandBus) AND (b) imports a RENDER/PERSIST/EXPORT authority
// (@pryzm/geometry-* store, ProjectSerializer, an IFC exporter, or a mesh builder).
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { walk, relPath } from '../../../../tools/ga-gate/lib/sourceScan.js';
const ROOT = process.cwd();
const DISPATCH = /\bexecuteCommand\s*\(|\bnew\s+CommandBus\b/;
const AUTHORITY = /@pryzm\/geometry-[a-z-]+|ProjectSerializer|FragmentBuilder|IfcExporter|MeshExporter|elementUpdatedMirror|elementLevelChangedMirror/;
const hits: { rel: string; fam: string }[] = [];
let scanned = 0;
for (const dir of ['apps', 'packages', 'plugins']) {
  for (const abs of walk(path.join(ROOT, dir))) {
    const rel = relPath(ROOT, abs);
    if (!/\.(test|spec)\.tsx?$/.test(rel)) continue;
    scanned++;
    let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
    if (!DISPATCH.test(src) || !AUTHORITY.test(src)) continue;
    hits.push({ rel, fam: '' });
  }
}
console.log(`TEST_FILES_SCANNED=${scanned}`);
console.log(`EXECUTED_READBACK_CANDIDATES=${hits.length}`);
for (const h of hits) console.log(`  · ${h.rel}`);
