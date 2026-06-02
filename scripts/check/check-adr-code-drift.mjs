#!/usr/bin/env node
// scripts/check-adr-code-drift.mjs — ADR ↔ code drift CI check (W-15).
//
// Spec: `phases/audits/PHASE-2-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md` §W-15.
// Audit reference: §3 H-6, §5 R-1.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// Each ADR file may declare zero or more CODE ANCHOR DIRECTIVES inside HTML
// comments:
//
//   <!-- code-anchor: pattern="<glob>" expect="present|absent" min="<n>" max="<n>" -->
//
// The checker:
//   1. Walks `docs/02-decisions/adrs/*.md`.
//   2. For each anchor, runs `git ls-files | grep <glob>` (case-sensitive)
//      to count files matching the glob.
//   3. Asserts the result against `expect` / `min` / `max`.
//   4. Exits non-zero with a clear message on the first mismatch.
//
// EXAMPLES (see ADR-0036 for live use):
//
//   <!-- code-anchor: pattern="packages/visibility/src/waves/w*.ts" expect="present" min="11" -->
//   <!-- code-anchor: pattern="apps/sync-server/src/authz/*.ts" expect="present" min="3" -->
//
// Why globs not regex: globs match path conventions cleanly; regex is
// overkill and harder to write correctly inside HTML comments.
//
// Why this exists: ADR-0036 in the audit said "waves 1-5 shipped; waves
// 6-11 deferred to S49" but the code already had all 11 waves.  A drift
// check catches that on the next CI run rather than the next audit.

import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// A.U.20 — script lives at scripts/check/; REPO_ROOT is two levels up.
const REPO_ROOT = resolve(__dirname, '..', '..');
const ADR_DIR = join(REPO_ROOT, 'docs', 'architecture', 'adr');

const ANCHOR_RE =
  /<!--\s*code-anchor:\s*pattern="([^"]+)"(?:\s+expect="(present|absent)")?(?:\s+min="(\d+)")?(?:\s+max="(\d+)")?\s*-->/g;

function listAdrFiles() {
  return fs.readdir(ADR_DIR).then((entries) =>
    entries
      .filter((f) => /^\d{4}-.*\.md$/.test(f))
      .sort()
      .map((f) => join(ADR_DIR, f)),
  );
}

function gitLsFiles() {
  const r = spawnSync('git', ['ls-files'], { cwd: REPO_ROOT, encoding: 'utf-8' });
  if (r.status !== 0) {
    throw new Error(`git ls-files failed: ${r.stderr}`);
  }
  return r.stdout.split('\n').filter(Boolean);
}

/** Convert a glob to a RegExp.  Supports `**`, `*`, `?`. */
function globToRegExp(glob) {
  let re = '^';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { re += '.*'; i += 2; continue; }
      re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if ('.+()|^$\\{}[]'.includes(c)) re += '\\' + c;
    else re += c;
    i++;
  }
  re += '$';
  return new RegExp(re);
}

const allFiles = gitLsFiles();
const adrFiles = await listAdrFiles();

let totalAnchors = 0;
const failures = [];

for (const adrPath of adrFiles) {
  const content = await fs.readFile(adrPath, 'utf-8');
  const adrName = adrPath.replace(REPO_ROOT + '/', '');
  let m;
  // Reset lastIndex (RegExp.prototype.exec on a /g RegExp is stateful).
  ANCHOR_RE.lastIndex = 0;
  while ((m = ANCHOR_RE.exec(content)) !== null) {
    totalAnchors++;
    const [, pattern, expectRaw, minRaw, maxRaw] = m;
    const expect = expectRaw ?? 'present';
    const min = minRaw !== undefined ? Number(minRaw) : (expect === 'present' ? 1 : 0);
    const max = maxRaw !== undefined ? Number(maxRaw) : Infinity;
    const re = globToRegExp(pattern);
    const matches = allFiles.filter((f) => re.test(f));
    const count = matches.length;
    if (expect === 'present' && count < min) {
      failures.push(
        `${adrName}\n  pattern="${pattern}" expected ≥${min} present, got ${count}`,
      );
      continue;
    }
    if (expect === 'absent' && count > max) {
      failures.push(
        `${adrName}\n  pattern="${pattern}" expected ≤${max} (absent), got ${count}: `
          + matches.slice(0, 3).join(', ') + (matches.length > 3 ? ', …' : ''),
      );
      continue;
    }
    if (count > max) {
      failures.push(
        `${adrName}\n  pattern="${pattern}" expected ≤${max}, got ${count}`,
      );
      continue;
    }
    process.stdout.write(
      `[check-adr-code-drift] ok  ${adrName.split('/').pop()}  pattern="${pattern}"  count=${count}\n`,
    );
  }
}

console.log(
  `[check-adr-code-drift] scanned ${adrFiles.length} ADRs, ${totalAnchors} anchors, ${failures.length} failures`,
);

if (failures.length > 0) {
  console.error('\n[check-adr-code-drift] FAILURES:');
  for (const f of failures) console.error(`  • ${f}`);
  process.exit(1);
}

process.exit(0);
