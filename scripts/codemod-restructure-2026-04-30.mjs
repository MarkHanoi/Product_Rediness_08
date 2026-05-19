#!/usr/bin/env node
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const DRY = process.argv.includes('--dry') || process.argv.includes('--dry-run');
const ROOT = resolve(process.cwd());

const SKIP_FILES = new Set([
  'replit.md',
  'docs/03_PRYZM3/03-CURRENT-STATE.md',
  'docs/03_PRYZM3/04-PLAN-FORWARD/02-WAVE-1-TRIPWIRES.md',
  'docs/03_PRYZM3/04-PLAN-FORWARD/10-VERIFIERS-CATALOG.md',
  'docs/03_PRYZM3/04-PLAN-FORWARD/11-PACKAGE-POPULATION-GAP.md',
  'scripts/codemod-restructure-2026-04-30.mjs',
  'scripts/check-no-stale-paths.sh',
]);

const SKIP_DIRS = [
  'docs/03_PRYZM3/archive/',
  'node_modules/',
  '.git/',
  'dist/',
  'build/',
  '.local/',
  'attached_assets/',
];

const RULES = [
  [/00_NEW_ARCHITECTURE\/CRITICAL-REVIEW-2026-04-27\.md/g,
    '03_PRYZM3/archive/superseded-2026-04-30/03_STATUS/CRITICAL-REVIEW-2026-04-27.md'],
  [/00_NEW_ARCHITECTURE\/10-MASTER-IMPLEMENTATION-PLAN-36M\.md/g,
    '03_PRYZM3/reference/plan-detail/01-MASTER-36M.md'],
  [/00_NEW_ARCHITECTURE\/PROCESS-TRACKER\.md/g,
    '03_PRYZM3/reference/status-detail/01-PROCESS-TRACKER.md'],
  [/00_NEW_ARCHITECTURE\/phases\/PHASE-([1-3])([A-Z][A-Z0-9-]*)\.md/g,
    '03_PRYZM3/reference/phases/PHASE-$1/$1$2.md'],
  [/00_NEW_ARCHITECTURE\/phases\/PHASE-([1-3])-([A-Z0-9-]+)\.md/g,
    '03_PRYZM3/reference/phases/PHASE-$1/$1-$2.md'],
  [/00_NEW_ARCHITECTURE\/phases\/PHASE-([1-3])\.md/g,
    '03_PRYZM3/reference/phases/PHASE-$1/'],
  [/00_NEW_ARCHITECTURE\/phases\/PHASE-4-POST-GA[A-Z0-9-]*\.md/g,
    '03_PRYZM3/reference/phases/PHASE-4-POST-GA/'],
  [/00_NEW_ARCHITECTURE\/phases\//g,
    '03_PRYZM3/reference/phases/'],
  [/00_NEW_ARCHITECTURE\/specs\//g,
    '03_PRYZM3/reference/specs/'],
  [/00_NEW_ARCHITECTURE\/adrs\//g,
    '03_PRYZM3/reference/adrs/'],
  [/00_NEW_ARCHITECTURE\/audits\//g,
    '03_PRYZM3/archive/superseded-audits/'],
  [/00_NEW_ARCHITECTURE\/00_VISION\/[^\s)`'"\]]+/g,
    '03_PRYZM3/01-VISION.md'],
  [/00_NEW_ARCHITECTURE\/01_ARCHITECTURE\/[^\s)`'"\]]+/g,
    '03_PRYZM3/02-ARCHITECTURE.md'],
  [/00_NEW_ARCHITECTURE\/02_PLAN\/[^\s)`'"\]]+/g,
    '03_PRYZM3/04-PLAN-FORWARD/'],
  [/00_NEW_ARCHITECTURE\/03_STATUS\/[^\s)`'"\]]+/g,
    '03_PRYZM3/03-CURRENT-STATE.md'],
  [/00_NEW_ARCHITECTURE\//g,
    '03_PRYZM3/'],
  [/\(00_VISION\/[^)\s]+\)/g,
    '(03_PRYZM3/01-VISION.md)'],
  [/\(01_ARCHITECTURE\/[^)\s]+\)/g,
    '(03_PRYZM3/02-ARCHITECTURE.md)'],
  [/\(02_PLAN\/[^)\s]+\)/g,
    '(03_PRYZM3/04-PLAN-FORWARD/)'],
  [/\(03_STATUS\/[^)\s]+\)/g,
    '(03_PRYZM3/03-CURRENT-STATE.md)'],
];

function shouldSkip(path) {
  if (SKIP_FILES.has(path)) return true;
  for (const dir of SKIP_DIRS) if (path.startsWith(dir)) return true;
  return false;
}

function listMarkdownFiles() {
  const out = execSync('git --no-optional-locks ls-files "*.md"', { encoding: 'utf8' });
  return out.split('\n').filter(Boolean).filter(p => !shouldSkip(p));
}

let totalFiles = 0;
let totalReplacements = 0;
const report = [];

for (const file of listMarkdownFiles()) {
  let original;
  try { original = readFileSync(file, 'utf8'); }
  catch { continue; }

  let updated = original;
  let perFileCount = 0;
  for (const [pattern, replacement] of RULES) {
    const before = updated;
    updated = updated.replace(pattern, replacement);
    if (before !== updated) {
      const c = (before.match(pattern) || []).length;
      perFileCount += c;
    }
  }

  if (updated !== original) {
    totalFiles++;
    totalReplacements += perFileCount;
    report.push({ file, replacements: perFileCount });
    if (!DRY) writeFileSync(file, updated, 'utf8');
  }
}

console.log(`\n${DRY ? '[DRY-RUN] ' : ''}codemod-restructure-2026-04-30 — RESTRUCTURE-2026-04-30 cleanup\n`);
console.log(`  Files ${DRY ? 'that would be' : 'modified'}: ${totalFiles}`);
console.log(`  Total replacements: ${totalReplacements}`);
console.log(`  Skipped (per blocklist): ${SKIP_FILES.size} files + archive/`);
console.log('');
for (const { file, replacements } of report.slice(0, 25)) {
  console.log(`    ${replacements.toString().padStart(4)}  ${file}`);
}
if (report.length > 25) console.log(`    ...and ${report.length - 25} more files`);
console.log('');
process.exit(0);
