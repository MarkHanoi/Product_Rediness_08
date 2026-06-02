#!/usr/bin/env node
/**
 * scripts/check/check-apex-no-auth-cookies.mjs
 * ============================================================================
 * C51 §2.2.1 gate — "Apex MUST NOT set or read any auth cookie."
 *
 * Apex traffic is anonymous by contract. The rendered apex HTML MUST NOT carry
 * a Set-Cookie meta/header, MUST NOT read document.cookie, and the apex
 * pre-render SOURCE MUST NOT touch req.cookies / Set-Cookie / document.cookie.
 * Any auth surface (sign-in, "continue as <name>") must 30x to app.pryzm.so —
 * never set a cookie on the pryzm.so parent (which would leak onto every apex
 * request and break the §1 reliability + §2.2.1 anonymity invariants).
 *
 * Two scan surfaces:
 *   1. The BUILT output  — apps/editor/dist-apex/**.html  (what ships to edge)
 *   2. The pre-render SRC — scripts/build/prerender-apex.mjs  (what produced it)
 *
 * Run `pnpm build:apex` first for surface 1 (the orchestrator does this).
 *
 * Exit 0 = clean. Exit 1 = a cookie operation was found (prints file:line).
 *
 * @see docs/02-decisions/contracts/C51-APEX-APP-DEPLOYMENT-SPLIT.md §2.2.1, §7
 * ============================================================================
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const distApex = resolve(repoRoot, 'apps', 'editor', 'dist-apex');
const prerenderSrc = resolve(repoRoot, 'scripts', 'build', 'prerender-apex.mjs');

// Cookie operations forbidden anywhere in the apex surface. Case-insensitive.
// The patterns are deliberately broad — a false positive is a 10-second human
// confirm; a false negative is a leaked session cookie on the marketing domain.
const FORBIDDEN = [
  { re: /set-cookie/i, what: 'Set-Cookie' },
  { re: /document\.cookie/i, what: 'document.cookie' },
  { re: /req\.cookies/i, what: 'req.cookies' },
  { re: /res\.cookie\s*\(/i, what: 'res.cookie(' },
  { re: /\bcookie\s*:/i, what: 'cookie: header' },
];

/** Recursively collect .html files under a dir. */
function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
    else if (name.endsWith('.html')) out.push(full);
  }
  return out;
}

const targets = [];
if (existsSync(distApex)) targets.push(...htmlFiles(distApex));
else {
  console.error(`[check-apex-no-auth-cookies] WARN — ${relative(repoRoot, distApex)} missing; scanning source only.`);
  console.error('  Run `pnpm build:apex` first to also scan the rendered HTML.');
}
if (existsSync(prerenderSrc)) targets.push(prerenderSrc);

const violations = [];
for (const file of targets) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    // The prerender source documents this very rule in comments ("no auth
    // cookie", "req.cookies usage") — skip comment lines so the gate doesn't
    // flag its own contract prose. We only care about live code/markup.
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('#')) return;
    for (const f of FORBIDDEN) {
      if (f.re.test(line)) {
        violations.push({ rel: relative(repoRoot, file).replace(/\\/g, '/'), line: i + 1, what: f.what, text: trimmed.slice(0, 100) });
      }
    }
  });
}

if (violations.length > 0) {
  console.error('[check-apex-no-auth-cookies] FAIL — cookie operation(s) in the apex surface:');
  for (const v of violations) console.error(`  ${v.rel}:${v.line}  [${v.what}]  ${v.text}`);
  console.error('\n  C51 §2.2.1: apex is anonymous — no Set-Cookie, no document.cookie, no req.cookies.');
  process.exit(1);
}

console.log(`[check-apex-no-auth-cookies] PASS — no cookie operations across ${targets.length} apex file(s).`);
