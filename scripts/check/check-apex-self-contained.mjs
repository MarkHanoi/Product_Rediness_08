#!/usr/bin/env node
/**
 * scripts/check/check-apex-self-contained.mjs
 * ============================================================================
 * C51 §2.2.4 gate — "Apex MUST be self-contained."
 *
 * Every <script src>, <link href>, <img src>, and <style>@import URL in the
 * rendered apex HTML MUST resolve to pryzm.so (relative or same-origin) or to
 * a CDN host on the allowlist below. A <script src="https://app.pryzm.so/...">
 * couples apex availability to the app deploy and violates the §1 reliability
 * invariant ("marketing survives app maintenance").
 *
 * This gate parses the BUILT output in apps/editor/dist-apex/ (run
 * `pnpm build:apex` first — the orchestrator `npm run check:apex` does this).
 * It fails on:
 *   • any <script src="..."> whose host is NOT pryzm.so / relative / allowlisted
 *     (note: the apex today emits ZERO script tags — any appearance is itself
 *      worth a human look, so we report the count too);
 *   • any <link href> / <img src> pointing at app.pryzm.so or a non-allowlist host.
 *
 * Exit 0 = clean. Exit 1 = at least one violation (prints file + offending URL).
 *
 * @see docs/02-decisions/contracts/C51-APEX-APP-DEPLOYMENT-SPLIT.md §2.2.4, §7
 * ============================================================================
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const distApex = resolve(repoRoot, 'apps', 'editor', 'dist-apex');

// Hosts an apex asset URL may legitimately reference. The apex is meant to be
// fully self-hosted, so this is intentionally tiny. Add a CDN here ONLY with a
// matching _headers CSP entry + a C51 §7 amendment.
const ALLOWED_HOSTS = new Set(['pryzm.so', 'www.pryzm.so']);

// The forbidden host the gate exists to catch first.
const APP_HOST = 'app.pryzm.so';

if (!existsSync(distApex)) {
  console.error(`[check-apex-self-contained] FATAL — ${relative(repoRoot, distApex)} does not exist.`);
  console.error('  Run `pnpm build:apex` first (or `npm run check:apex`, which builds then checks).');
  process.exit(1);
}

/** Recursively collect every .html file under dist-apex/. */
function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
    else if (name.endsWith('.html')) out.push(full);
  }
  return out;
}

/**
 * Pull every external-resource URL from one HTML string. Returns
 * { tag, attr, url } records for <script src>, <link href>, <img src>,
 * <source src>, and CSS @import "...".
 */
function externalUrls(html) {
  const records = [];
  const tagAttr = [
    [/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi, 'script', 'src'],
    [/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi, 'link', 'href'],
    [/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi, 'img', 'src'],
    [/<source\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi, 'source', 'src'],
    [/@import\s+(?:url\()?["']([^"')]+)["']/gi, 'style', '@import'],
  ];
  for (const [re, tag, attr] of tagAttr) {
    let m;
    while ((m = re.exec(html)) !== null) records.push({ tag, attr, url: m[1] });
  }
  return records;
}

/** True if the URL is OK: relative, data:, a fragment, or an allowlisted host. */
function isAllowed(url) {
  if (url.startsWith('data:') || url.startsWith('#')) return true;
  // Relative or root-relative — same-origin by definition.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !url.startsWith('//')) return true;
  let host;
  try {
    host = new URL(url, 'https://pryzm.so/').host;
  } catch {
    return false; // unparseable absolute URL → treat as a violation
  }
  return ALLOWED_HOSTS.has(host);
}

let scriptTagCount = 0;
const violations = [];

for (const file of htmlFiles(distApex)) {
  const html = readFileSync(file, 'utf8');
  const rel = relative(repoRoot, file).replace(/\\/g, '/');
  for (const rec of externalUrls(html)) {
    if (rec.tag === 'script') scriptTagCount++;
    if (!isAllowed(rec.url)) {
      const onApp = rec.url.includes(APP_HOST);
      violations.push({ rel, ...rec, onApp });
    }
  }
}

if (violations.length > 0) {
  console.error('[check-apex-self-contained] FAIL — apex references off-apex resources:');
  for (const v of violations) {
    const flag = v.onApp ? '  ← app.pryzm.so coupling (the §1 reliability violation)' : '';
    console.error(`  ${v.rel}: <${v.tag} ${v.attr}="${v.url}">${flag}`);
  }
  console.error('\n  C51 §2.2.4: every apex asset URL MUST resolve to pryzm.so or an allowlisted CDN.');
  process.exit(1);
}

console.log(`[check-apex-self-contained] PASS — all apex assets are self-contained (${scriptTagCount} script tag(s) found; all same-origin/allowlisted).`);
