#!/usr/bin/env node
// scripts/check-ai-host-lazy.mjs — S47 D1 lazy-bootstrap enforcer.
//
// Spec source: `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §S47
// lines 587-611 ("Implementation Detail — `AiHost.ts` lazy bootstrap")
// + verification gate K3-A (line 611).
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// The AI host runs at architectural layer L7.5 per [strategic ADR-014].
// It is loaded LAZILY: zero AI overhead on cold start, zero AI bytes
// in the editor's first-paint chunk, AI host imported only on first
// invocation via `getAiHost()` -> `await import('./AiHost.impl.js')`.
//
// This enforcer asserts the static side of the contract:
//   1. NO file under `apps/editor/`, `plugins/` (except via the lazy
//      `getAiHost()` entry), or `packages/*/` (except `@pryzm/ai-host`
//      itself) statically imports `@pryzm/ai-host/AiHost.impl` or the
//      relative path `./AiHost.impl`.
//   2. The `@pryzm/ai-host` barrel must re-export ZERO symbol from
//      `./AiHost.impl.js` (only `./AiHost.js` and `./tracing.js` and
//      type-only re-exports are allowed).
//   3. `plugins/ai-floorplan/` descriptor uses the lazy entry.
//
// The runtime side of the contract — the editor's built bundle has
// the impl in a separate chunk — is verified by `vite build --report`
// at S47 D1 (per spec line 611).  This script is the always-on CI
// guard; it runs in milliseconds and never touches the network.
//
// USAGE
// ─────────────────────────────────────────────────────────────────────────────
//   node scripts/check-ai-host-lazy.mjs        # report; exit 1 on violation
//
// Failure prints the offending file + line; success prints a one-liner.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

const SCAN_ROOTS = [
  join(ROOT, 'apps'),
  join(ROOT, 'plugins'),
  join(ROOT, 'packages'),
  join(ROOT, 'src'),
];

// Files / dirs to exclude.  `packages/ai-host/` is the legitimate home
// of `AiHost.impl`; tests within it may reference it directly.
const EXCLUDE_DIRS = new Set([
  'node_modules', 'dist', 'build', '__snapshots__', '.git',
]);

// File patterns where direct AiHost.impl reference is OK.
const ALLOWED_PATH_FRAGMENTS = [
  'packages/ai-host/src/AiHost.ts',         // the dynamic-import call site
  'packages/ai-host/src/AiHost.impl.ts',    // the impl itself
  'packages/ai-host/src/index.ts',          // barrel — re-export check below
  'packages/ai-host/__tests__/',            // tests may probe internals
  'scripts/check-ai-host-lazy.mjs',          // this script
];

// Forbidden static-import fragments.
const FORBIDDEN_PATTERNS = [
  /from\s+['"]@pryzm\/ai-host\/AiHost\.impl['"]/,
  /from\s+['"]\.\.?\/.*AiHost\.impl(?:\.js)?['"]/,
  /import\s*\(\s*['"](?:@pryzm\/ai-host\/AiHost\.impl|\.\.?\/.*AiHost\.impl)/,
];
// Note pattern 3 also catches dynamic imports OUTSIDE `packages/ai-host/`
// — the only legitimate `import('./AiHost.impl.js')` lives in
// `packages/ai-host/src/AiHost.ts`.

function isAllowed(rel) {
  return ALLOWED_PATH_FRAGMENTS.some((frag) => rel.includes(frag));
}

function* walk(dir) {
  let ents;
  try { ents = readdirSync(dir); } catch { return; }
  for (const name of ents) {
    if (EXCLUDE_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) yield* walk(full);
    else if (st.isFile() && /\.(ts|tsx|mjs|js|jsx)$/.test(name)) yield full;
  }
}

const violations = [];

// Rule 1 + 3: scan source for forbidden static / dynamic imports.
for (const root of SCAN_ROOTS) {
  for (const file of walk(root)) {
    const rel = relative(ROOT, file);
    if (isAllowed(rel)) continue;
    let src;
    try { src = readFileSync(file, 'utf8'); } catch { continue; }
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      for (const pat of FORBIDDEN_PATTERNS) {
        if (pat.test(line)) {
          violations.push({
            file: rel,
            line: i + 1,
            text: line.trim(),
            rule: 'lazy-import',
          });
        }
      }
    });
  }
}

// Rule 2: barrel must not statically re-export from AiHost.impl.
const barrelPath = join(ROOT, 'packages/ai-host/src/index.ts');
try {
  const barrel = readFileSync(barrelPath, 'utf8');
  const re = /(?:export|from).*AiHost\.impl/;
  if (re.test(barrel)) {
    violations.push({
      file: 'packages/ai-host/src/index.ts',
      line: 0,
      text: '(barrel re-exports AiHost.impl — forbidden)',
      rule: 'barrel-purity',
    });
  }
} catch {
  violations.push({
    file: 'packages/ai-host/src/index.ts',
    line: 0,
    text: '(barrel missing — required at packages/ai-host/src/index.ts)',
    rule: 'barrel-purity',
  });
}

if (violations.length > 0) {
  console.error('[check-ai-host-lazy] FAILED — lazy-bootstrap contract broken:\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]`);
    console.error(`    ${v.text}`);
  }
  console.error('\nSpec: phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md §S47 lines 587-611');
  console.error('ADR : docs/architecture/adr/0037-ai-host-lazy-bootstrap.md');
  console.error('Fix : route all AI host access through `getAiHost()` from `@pryzm/ai-host`.');
  process.exit(1);
}

console.log('[check-ai-host-lazy] OK — no static AiHost.impl imports outside packages/ai-host/.');
process.exit(0);
