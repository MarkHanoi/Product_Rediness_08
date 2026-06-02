#!/usr/bin/env node
/**
 * scripts/check/check-route-surface-assignment.mjs
 * ============================================================================
 * C51 §3.2.1 / §5 gate — "the app MUST NOT serve apex marketing routes in-place."
 *
 * §5 assigns every customer route to exactly one surface. The three marketing
 * routes the apex build emits (/pricing, /manifesto, /trust) belong to apex;
 * when the server is reached as the app surface (app.pryzm.so) it MUST 301 them
 * to apex rather than render the editor shell via the SPA catch-all.
 *
 * That redirect was added to server.js (§C51-§3.2.1 block, above the static /
 * Vite middleware) and is behaviour-tested in
 * `server/__tests__/security-gates-adr-055.test.ts` §5. THIS gate is the static
 * regression guard: it fails if the redirect is ever removed or stops covering
 * one of the apex marketing paths, and it fails if the editor's in-app marketing
 * navigation starts OWNING an apex path instead of the `?page=` query slot.
 *
 * Two static checks:
 *   1. server.js  — contains an app-host-guarded 301 to APEX_ORIGIN covering
 *      every path in APEX_MARKETING_PATHS.
 *   2. router.ts  — the in-app marketing route is reached via the `?page=`
 *      query param (buildMarketingUrl), NOT by owning a `/pricing`-style path.
 *
 * Exit 0 = clean. Exit 1 = a surface-assignment violation (prints what + why).
 *
 * @see docs/02-decisions/contracts/C51-APEX-APP-DEPLOYMENT-SPLIT.md §3.2.1, §5, §7
 * ============================================================================
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const serverJs = resolve(repoRoot, 'server.js');
const routerTs = resolve(repoRoot, 'apps', 'editor', 'src', 'router.ts');

// The apex marketing routes (C51 §5 apex rows that the apex build emits).
const APEX_MARKETING_PATHS = ['/pricing', '/manifesto', '/trust'];

const failures = [];

// ── Check 1 — server.js carries the §3.2.1 app→apex redirect ────────────────
if (!existsSync(serverJs)) {
  failures.push(`server.js not found at ${relative(repoRoot, serverJs)}`);
} else {
  const src = readFileSync(serverJs, 'utf8');
  // The redirect must (a) reference an app host, (b) issue a 301 to APEX_ORIGIN,
  // and (c) cover every apex marketing path. We assert the tokens rather than
  // the exact spelling so harmless refactors don't false-fail — but removing
  // the redirect, or dropping a path from it, does.
  if (!/app\.pryzm\.so/.test(src)) {
    failures.push('server.js: no app.pryzm.so host guard found — the §3.2.1 redirect appears to be missing.');
  }
  if (!/res\.redirect\(\s*301/.test(src) || !/APEX_ORIGIN/.test(src)) {
    failures.push('server.js: no `res.redirect(301, …APEX_ORIGIN…)` found — apex marketing paths are not redirected.');
  }
  // Locate the redirect handler's path array and confirm each apex path is in it.
  const handlerMatch = src.match(/app\.get\(\s*\[([^\]]*)\][\s\S]{0,400}?res\.redirect\(\s*301[\s\S]{0,120}?APEX_ORIGIN/);
  const pathList = handlerMatch ? handlerMatch[1] : '';
  for (const p of APEX_MARKETING_PATHS) {
    if (!pathList.includes(`'${p}'`) && !pathList.includes(`"${p}"`)) {
      failures.push(`server.js: apex path ${p} is not covered by the §3.2.1 redirect handler.`);
    }
  }
}

// ── Check 2 — the in-app marketing route uses ?page=, not a /pricing path ────
if (existsSync(routerTs)) {
  const src = readFileSync(routerTs, 'utf8');
  // The editor reaches marketing via the `page` query param (PRYZM2_PAGE_PARAM /
  // buildMarketingUrl). It must NOT register an apex path as an owned route.
  if (!/PRYZM2_PAGE_PARAM|buildMarketingUrl/.test(src)) {
    failures.push('apps/editor/src/router.ts: no `?page=` marketing slot (PRYZM2_PAGE_PARAM/buildMarketingUrl) — in-app marketing must not own an apex path.');
  }
  // A literal path route for an apex marketing path in the client router would
  // be a surface collision (the app owning /pricing). Flag it.
  for (const p of APEX_MARKETING_PATHS) {
    const ownsPath = new RegExp(`(path|route)\\s*[:=]\\s*['"]${p}['"]`).test(src);
    if (ownsPath) {
      failures.push(`apps/editor/src/router.ts: client router OWNS apex path ${p} — must route marketing via ?page= instead (C51 §3.2.1).`);
    }
  }
}

if (failures.length > 0) {
  console.error('[check-route-surface-assignment] FAIL — apex/app surface assignment violated:');
  for (const f of failures) console.error(`  • ${f}`);
  console.error('\n  C51 §3.2.1 + §5: apex marketing routes (/pricing, /manifesto, /trust) belong to apex;');
  console.error('  the app 301-redirects them and reaches in-app marketing via ?page=, never by owning the path.');
  process.exit(1);
}

console.log(`[check-route-surface-assignment] PASS — app 301-redirects ${APEX_MARKETING_PATHS.join(', ')} to apex; in-app marketing uses ?page=.`);
