#!/usr/bin/env node
// tools/scripts/check-three-outside-committer-count.mjs
//
// Snapshot-diff CI gate for `import * from 'three'` call sites in the
// PRYZM-1 legacy `src/` tree (S05-T10).
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S05-T10 (line 558):
//   "pryzm-no-three-outside-committer src/ snapshot diff + flip pryzm2/
//    to error.  Already error in pryzm2/ (shipped at S04)."
//
// The `pryzm/no-three-outside-committer` ESLint rule already HARD-FAILs
// on `packages/*` and `apps/*` (PRYZM 2) outside the allowlist, and
// WARN-ONLY on `src/` (PRYZM 1) so the legacy code keeps building.
//
// THIS script is the belt-and-braces gate: a snapshot diff of the count
// of THREE imports in `src/` so a NEW THREE call site in PRYZM 1 hard-
// fails CI even if eslint is bypassed (`--no-verify`, fixture line-disable).
// Modeled on `check-raf-count.mjs` (S02 exit gate).
//
// Behaviour:
//   • Walks `src/**/*.{ts,tsx,js,jsx,mjs,cjs}`.
//   • Counts `from 'three'` and `from "three"` (and the slash-prefixed
//     subpath form `from 'three/…'`) — the same shape `import` and
//     `export` statements use.  Plus dynamic `import('three')` and
//     `require('three')`.
//   • Compares against `tools/scripts/three-count.baseline.json`.
//   • Exits 0 if count is `<= baseline.maxAllowed`.
//   • Exits 1 if count > baseline.maxAllowed (NEW import introduced).
//
// To intentionally REDUCE the count (e.g. when a PRYZM-1 module is
// ported to PRYZM 2 and its THREE imports move to a committer), update
// `tools/scripts/three-count.baseline.json` so the new lower number sticks.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SRC_DIR = join(REPO_ROOT, 'src');
const BASELINE_FILE = join(__dirname, 'three-count.baseline.json');

// Match every shape that pulls THREE in:
//   import … from 'three'
//   import … from 'three/examples/…'
//   export … from 'three'
//   import('three')
//   require('three')
//
// We deliberately match the `'three'` literal form rather than parsing
// AST — the script must run in any Node without an extra dep, mirroring
// `check-raf-count.mjs`.  False positives in string literals are
// possible but vanishingly rare (the literal `'three'` must be preceded
// by `from `, `(`, or `require(`).
const THREE_PATTERNS = [
  /\bfrom\s+['"]three(?:\/[^'"]*)?['"]/g,
  /\bimport\s*\(\s*['"]three(?:\/[^'"]*)?['"]\s*\)/g,
  /\brequire\s*\(\s*['"]three(?:\/[^'"]*)?['"]\s*\)/g,
];
const FILE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      // Skip node_modules / build artefacts inside src/ if any sneak in.
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      yield* walk(full);
    } else if (stat.isFile()) {
      const dot = entry.lastIndexOf('.');
      if (dot > 0 && FILE_EXTS.has(entry.slice(dot))) yield full;
    }
  }
}

function countThreeImports(dir) {
  if (!existsSync(dir)) return { files: 0, sites: 0 };
  let files = 0;
  let sites = 0;
  for (const file of walk(dir)) {
    const text = readFileSync(file, 'utf-8');
    let fileSites = 0;
    for (const pat of THREE_PATTERNS) {
      pat.lastIndex = 0;
      const matches = text.match(pat);
      if (matches) fileSites += matches.length;
    }
    if (fileSites > 0) {
      files++;
      sites += fileSites;
    }
  }
  return { files, sites };
}

if (!existsSync(BASELINE_FILE)) {
  console.error(`[check-three-outside-committer-count] missing baseline: ${BASELINE_FILE}`);
  console.error(`[check-three-outside-committer-count] run with --write to seed it (CI does NOT do this).`);
  process.exit(2);
}

const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf-8'));
const { files, sites } = countThreeImports(SRC_DIR);

const tag = '[check-three-outside-committer-count]';
console.log(
  `${tag} src/ THREE-import inventory — files=${files}, sites=${sites} ` +
    `(baseline.maxAllowed=${baseline.maxAllowed}, recorded=${baseline.recordedSites}).`,
);

if (sites > baseline.maxAllowed) {
  console.error(
    `${tag} HARD-FAIL — THREE-import count in src/ went UP ` +
      `(${sites} > ${baseline.maxAllowed}).  Either:\n` +
      `  • Move the new code into a PRYZM-2 committer ` +
      `(packages/scene-committer/, packages/renderer/, plugins/*/committer.ts), OR\n` +
      `  • If you intentionally added a PRYZM-1-only import, bump ` +
      `tools/scripts/three-count.baseline.json.maxAllowed and explain in the PR.`,
  );
  process.exit(1);
}

if (sites < baseline.recordedSites) {
  console.log(
    `${tag} OK — and the count went DOWN (${sites} < recorded=${baseline.recordedSites}). ` +
      `Consider lowering tools/scripts/three-count.baseline.json.maxAllowed to lock in the win.`,
  );
} else {
  console.log(`${tag} OK — within budget.`);
}
process.exit(0);
