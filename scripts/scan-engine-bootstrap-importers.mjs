#!/usr/bin/env node
/**
 * scan-engine-bootstrap-importers — S61 D1 tooling per
 * `phases/PHASE-3C-Q3-M31-M33-PLUGIN-SDK-MARKETPLACE-APIS.md` D1 + SPEC-27 §4.2.
 *
 * Reports — distinguishing real importers from comment / identifier mentions:
 *
 *   1. Files containing a real `import … from '…/EngineBootstrap'` (static).
 *   2. Files containing a real dynamic `import('…/EngineBootstrap')`.
 *   3. Files containing a real `require('…/EngineBootstrap')`.
 *   4. Per-zone file counts for the five SPEC-27 §4.1 legacy zones.
 *   5. `(window as any)` cast count (deletion target per S61 codemod).
 *   6. JSON written to `apps/editor/migrations/sunset-pryzm1.json`
 *      so downstream tools (CI gate, PROCESS-TRACKER updater) can consume.
 *
 * Exits 0 always — report is informational; gating is the caller's job.
 *
 * Usage: `node scripts/scan-engine-bootstrap-importers.mjs`
 */

import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_JSON = join(REPO_ROOT, 'apps/editor/migrations/sunset-pryzm1.json');

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.cache',
  '.turbo',
  '.next',
  '.local',
  'docs',
  'attached_assets',
]);
const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx']);

const STATIC_IMPORT = /\bimport\b[^'"`]+from\s*['"`]([^'"`]+EngineBootstrap)['"`]/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*['"`]([^'"`]+EngineBootstrap)['"`]\s*\)/g;
const REQUIRE_IMPORT = /\brequire\s*\(\s*['"`]([^'"`]+EngineBootstrap)['"`]\s*\)/g;
const WINDOW_AS_ANY = /\(\s*window\s+as\s+any\s*\)/g;

const ZONES = [
  { id: 'src/core', path: 'src/core', deletionSprint: 'S35' },
  { id: 'src/commands', path: 'src/commands', deletionSprint: 'S37' },
  { id: 'src/styles', path: 'src/styles', deletionSprint: 'S65' },
  { id: 'src/ai', path: 'src/ai', deletionSprint: 'S52' },
  { id: 'src/engine', path: 'src/engine', deletionSprint: 'S61 (this sprint)' },
];

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.local') continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      const dot = entry.name.lastIndexOf('.');
      const ext = dot >= 0 ? entry.name.slice(dot) : '';
      if (CODE_EXTS.has(ext)) yield full;
    }
  }
}

async function countDirFiles(dir) {
  let count = 0;
  for await (const _file of walk(dir)) count += 1;
  return count;
}

async function main() {
  const staticImporters = [];
  const dynamicImporters = [];
  const requireImporters = [];
  let windowAsAnyHits = 0;
  const windowAsAnyByFile = new Map();

  const SELF_REL = relative(REPO_ROOT, fileURLToPath(import.meta.url));
  for await (const file of walk(REPO_ROOT)) {
    let src;
    try {
      src = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    const rel = relative(REPO_ROOT, file);
    if (rel === SELF_REL) continue; // scanner regex literals would self-match

    STATIC_IMPORT.lastIndex = 0;
    DYNAMIC_IMPORT.lastIndex = 0;
    REQUIRE_IMPORT.lastIndex = 0;
    WINDOW_AS_ANY.lastIndex = 0;

    if (STATIC_IMPORT.test(src)) staticImporters.push(rel);
    if (DYNAMIC_IMPORT.test(src)) dynamicImporters.push(rel);
    if (REQUIRE_IMPORT.test(src)) requireImporters.push(rel);

    const waaMatches = src.match(WINDOW_AS_ANY);
    if (waaMatches && waaMatches.length > 0) {
      windowAsAnyHits += waaMatches.length;
      windowAsAnyByFile.set(rel, waaMatches.length);
    }
  }

  const zoneCounts = {};
  for (const zone of ZONES) {
    const abs = join(REPO_ROOT, zone.path);
    let exists = true;
    try {
      await stat(abs);
    } catch {
      exists = false;
    }
    zoneCounts[zone.id] = {
      path: zone.path,
      deletionSprint: zone.deletionSprint,
      fileCount: exists ? await countDirFiles(abs) : 0,
      exists,
    };
  }

  const topWindowAsAny = [...windowAsAnyByFile.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([file, n]) => ({ file, count: n }));

  const report = {
    generatedAt: new Date().toISOString(),
    sprint: 'S61',
    spec: 'SPEC-27 §4.3',
    engineBootstrap: {
      staticImporters,
      dynamicImporters,
      requireImporters,
      activeImporterCount:
        staticImporters.length + dynamicImporters.length + requireImporters.length,
    },
    zones: zoneCounts,
    windowAsAny: {
      totalCasts: windowAsAnyHits,
      filesWithCasts: windowAsAnyByFile.size,
      top25Files: topWindowAsAny,
    },
  };

  await mkdir(dirname(OUTPUT_JSON), { recursive: true });
  await writeFile(OUTPUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');

  // Console summary.
  console.log('=== S61 D1 — EngineBootstrap importer scan ===');
  console.log(`generatedAt: ${report.generatedAt}`);
  console.log('');
  console.log('Real importers of src/engine/EngineBootstrap:');
  console.log(`  static  imports: ${staticImporters.length}`);
  for (const f of staticImporters) console.log(`    - ${f}`);
  console.log(`  dynamic imports: ${dynamicImporters.length}`);
  for (const f of dynamicImporters) console.log(`    - ${f}`);
  console.log(`  require imports: ${requireImporters.length}`);
  for (const f of requireImporters) console.log(`    - ${f}`);
  console.log('');
  console.log('Zone file counts (per SPEC-27 §4.1):');
  for (const [id, info] of Object.entries(zoneCounts)) {
    console.log(
      `  ${id.padEnd(16)} ${String(info.fileCount).padStart(5)} files  → delete ${info.deletionSprint}`
    );
  }
  console.log('');
  console.log(`(window as any) casts:  total=${windowAsAnyHits}  files=${windowAsAnyByFile.size}`);
  console.log('  Top 10 hot-spots:');
  for (const { file, count } of topWindowAsAny.slice(0, 10)) {
    console.log(`    ${String(count).padStart(4)}  ${file}`);
  }
  console.log('');
  console.log(`JSON report → ${relative(REPO_ROOT, OUTPUT_JSON)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
