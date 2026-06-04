#!/usr/bin/env node
/**
 * scripts/check/check-app-shell-csp.mjs
 * ============================================================================
 * App-Shell CSP gate — "no inline boot <script> in index.html."
 *
 * BACKGROUND: the production CSP (server/securityHeaders.js, SCRIPT_SRC_PROD =
 * ["'self'", "'unsafe-eval'", 'blob:']) deliberately does NOT grant
 * 'unsafe-inline'. The App-Shell boot logic (data-pryzm-auth skeleton-hide,
 * pre-boot CTA click capture, /api/media-list mosaic swap) therefore CANNOT
 * live in an inline <script> — the browser blocks it in prod ("Executing
 * inline script violates ... 'script-src 'self' 'unsafe-eval' blob:'"). Dev
 * grants 'unsafe-inline', so an inline boot script SILENTLY works on localhost
 * while being dead in prod — exactly the regression this gate prevents from
 * recurring. The boot logic lives in /public/app-shell-boot.js (served from
 * 'self'); index.html references it as a classic external <script>.
 *
 * This gate asserts, on the SOURCE root index.html (no build needed — the
 * invariant is structural):
 *   1. index.html contains NO inline <script> with an executable body
 *      (i.e. <script>…code…</script> with no `src`). Empty/whitespace-only
 *      script bodies and JSON data blocks (type="application/json" /
 *      type="application/ld+json" / non-executable types) are allowed.
 *   2. index.html references the external classic boot script
 *      <script src="/app-shell-boot.js"></script> — NOT type="module",
 *      NOT defer/async (those would change the pre-paint execution timing).
 *   3. public/app-shell-boot.js exists (Vite copies public/* verbatim to
 *      dist/, served from 'self').
 *
 * Exit 0 = clean. Exit 1 = at least one violation (prints the offending tag).
 *
 * @see server/securityHeaders.js (SCRIPT_SRC_PROD / SCRIPT_SRC_DEV)
 * @see public/app-shell-boot.js
 * @see docs/02-decisions/contracts/C51-APEX-APP-DEPLOYMENT-SPLIT.md §2/§3
 * ============================================================================
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const indexHtmlPath = resolve(repoRoot, 'index.html');
const bootScriptPath = resolve(repoRoot, 'public', 'app-shell-boot.js');

const errors = [];

if (!existsSync(indexHtmlPath)) {
  console.error(`[check-app-shell-csp] FATAL — ${relative(repoRoot, indexHtmlPath)} does not exist.`);
  process.exit(1);
}

const rawHtml = readFileSync(indexHtmlPath, 'utf8');

// Strip HTML comments first so commentary that mentions <script> (e.g. the
// "EXTERNALIZED (was an inline <script> here)" note) is never mistaken for a
// real tag by the comment-unaware regex below.
const html = rawHtml.replace(/<!--[\s\S]*?-->/g, '');

// ── (1) No inline executable <script> ──────────────────────────────────────
// Match every <script ...>...</script>. For each, decide whether it is an
// inline executable script (forbidden) vs an external ref / data block / empty.
const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let m;
while ((m = SCRIPT_RE.exec(html)) !== null) {
  const attrs = m[1] || '';
  const body = (m[2] || '').trim();

  // External script (has src=...) — fine, CSP 'self' covers same-origin URLs.
  const hasSrc = /\bsrc\s*=/.test(attrs);
  if (hasSrc) continue;

  // Non-executable data blocks (JSON-LD, importmap-as-data, etc.) — allowed.
  const typeMatch = /\btype\s*=\s*["']([^"']*)["']/i.exec(attrs);
  const type = typeMatch ? typeMatch[1].toLowerCase() : '';
  const EXECUTABLE_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript', 'text/ecmascript']);
  if (type && !EXECUTABLE_TYPES.has(type)) continue;

  // Empty / whitespace-only inline script — harmless, no code to block.
  if (body.length === 0) continue;

  // Otherwise: an inline executable <script> with a body. FORBIDDEN.
  const preview = body.length > 80 ? body.slice(0, 80) + '…' : body;
  errors.push(
    `Inline executable <script${attrs}> with a body is FORBIDDEN in index.html — ` +
    `it is blocked by the prod CSP (no 'unsafe-inline'). Move it to public/ and ` +
    `reference it as <script src="/...">.\n    body starts: ${preview.replace(/\s+/g, ' ')}`
  );
}

// ── (2) External boot script referenced as a classic <script> ──────────────
const BOOT_TAG_RE = /<script\b([^>]*\bsrc\s*=\s*["']\/app-shell-boot\.js["'][^>]*)>/i;
const bootTag = BOOT_TAG_RE.exec(html);
if (!bootTag) {
  errors.push(
    'index.html does NOT reference <script src="/app-shell-boot.js"></script>. ' +
    'The App-Shell boot logic (skeleton-hide / pre-boot click capture / mosaic ' +
    'swap) must load from the external public/ file, before the body skeleton ' +
    'and before /src/main.ts.'
  );
} else {
  const bootAttrs = bootTag[1] || '';
  if (/\btype\s*=\s*["']module["']/i.test(bootAttrs)) {
    errors.push(
      'app-shell-boot.js must NOT be type="module" — a module script is deferred ' +
      'and would run AFTER the body skeleton paints, reintroducing the auth-flash ' +
      'and dropping pre-boot CTA clicks. Use a classic <script src="...">.'
    );
  }
  if (/\b(defer|async)\b/i.test(bootAttrs)) {
    errors.push(
      'app-shell-boot.js must NOT be defer/async — it has to run synchronously in ' +
      '<head>, before the body skeleton paints and before /src/main.ts.'
    );
  }
}

// ── (3) The external boot file exists in public/ ───────────────────────────
if (!existsSync(bootScriptPath)) {
  errors.push(
    `${relative(repoRoot, bootScriptPath)} does not exist. index.html references ` +
    '/app-shell-boot.js, which Vite copies verbatim from public/ to dist/.'
  );
}

// ── Report ─────────────────────────────────────────────────────────────────
if (errors.length > 0) {
  console.error('[check-app-shell-csp] FAILED — App-Shell CSP invariant violated:\n');
  for (const e of errors) console.error('  ✗ ' + e + '\n');
  console.error('See server/securityHeaders.js (SCRIPT_SRC_PROD) + public/app-shell-boot.js.');
  process.exit(1);
}

console.log('[check-app-shell-csp] OK — index.html has no inline executable <script>; ' +
  '/app-shell-boot.js is referenced as a classic external script and exists in public/.');
process.exit(0);
