#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-write-route-auth.ts
 *
 * GA Gate — §WRITE-ROUTE-AUTH (L-406): Express mutating-route auth regression lock.
 *
 * Contract C08 §1.2 + §2.1/§2.2. `authMiddleware` never rejects; it populates
 * `req.auth` so the handler can decide whether anonymous access is permitted.
 * A write route mounted OUTSIDE that chain has no `req.auth` at all and is
 * structurally unable to attribute or authorise the write — which is exactly
 * how L-406 (`POST /api/event-log`, unauthenticated cross-tenant audit-row
 * spoof) shipped.
 *
 * What this replaces
 * ─────────────────────────────────────────────────────────────────────────────
 * `server/__tests__/permissions.test.ts` §3 held a hand-typed "C08 §2.1 write
 * route coverage matrix" whose headline assertion was
 * `expect(auditMatrix).toHaveLength(37)` — against the array literal declared
 * immediately above it. It never opened `server.js`. It was therefore green by
 * construction, and it (a) declared the L-406 route exempt with the rationale
 * "no project write", and (b) fell 9 routes behind the real surface without a
 * murmur. See `lib/writeRouteScan.ts` for the full account.
 *
 * Enforcement model — DECLARE THE EXCEPTIONS, DERIVE THE REST:
 *   • Every write route found in `server.js` that lacks `authMiddleware` MUST
 *     appear in `write-route-auth-exemptions.json` with a non-empty rationale.
 *   • Every declared exemption MUST still exist in source (no stale entries)
 *     and MUST still be authless (a route that GAINED auth has to leave the
 *     list — otherwise the list slowly becomes fiction, which is how the
 *     matrix rotted).
 *   • Authenticated routes need no declaration; the scan proves them, so the
 *     gate cannot drift as routes are added.
 *
 * Usage:
 *   pnpm tsx tools/ga-gate/check-write-route-auth.ts          # gate
 *   pnpm tsx tools/ga-gate/check-write-route-auth.ts --list   # print every route
 *
 * Exit codes:
 *   0 — every write route is authenticated or declared-exempt
 *   1 — an undeclared authless route, or a stale/obsolete/unjustified exemption
 *   2 — gate misconfigured (source unreadable, too few routes seen)
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  scanWriteRoutes,
  extractPathConstants,
  reconcileExemptions,
  MIN_WRITE_ROUTES,
  type Exemption,
} from './lib/writeRouteScan.js';

// §HONESTY — `new URL(...).pathname` yields `/C:/…` on Windows; every readdir
// then throws and a swallowed error becomes a green "0 violations" over an
// unscanned tree (the exact defect batch-9 found in check-xss-guards). Use
// `fileURLToPath`, and assert a coverage floor below regardless.
const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');
const SERVER_FILE = join(ROOT, 'server.js');
const SERVER_DIR = join(ROOT, 'server');
const EXEMPTIONS_FILE = join(ROOT, 'tools', 'ga-gate', 'write-route-auth-exemptions.json');

const LIST = process.argv.slice(2).includes('--list');

function fail(msg: string): never {
  console.error(`[write-route-auth] ⚠ MISCONFIGURED — ${msg}\nRefusing to report a pass.`);
  process.exit(2);
}

if (!existsSync(SERVER_FILE)) fail(`server.js not found at ${SERVER_FILE} (root resolved to ${ROOT})`);
if (!existsSync(EXEMPTIONS_FILE)) fail(`exemption declaration missing: ${EXEMPTIONS_FILE}`);

// Route paths are exported as constants from server/*.js (EVENT_LOG_PATH, …).
// Without these, `app.post(EVENT_LOG_PATH, …)` is unresolvable and the scan
// throws rather than quietly auditing the route under the wrong name.
const constants: Record<string, string> = {};
let moduleCount = 0;
try {
  for (const f of readdirSync(SERVER_DIR)) {
    if (!f.endsWith('.js')) continue;
    moduleCount++;
    Object.assign(constants, extractPathConstants(readFileSync(join(SERVER_DIR, f), 'utf8')));
  }
} catch (err) {
  fail(`could not read ${SERVER_DIR}: ${(err as Error).message}`);
}
if (moduleCount === 0) fail(`read 0 modules from ${SERVER_DIR} — path constants would all be unresolvable`);

let scan;
try {
  scan = scanWriteRoutes(readFileSync(SERVER_FILE, 'utf8'), constants);
} catch (err) {
  fail((err as Error).message);
}

const { routes, routerMounts } = scan;

// ── Coverage assertion (the batch-9 lesson: green must mean "saw something") ──
if (routes.length < MIN_WRITE_ROUTES) {
  fail(
    `scanned only ${routes.length} write route(s) (expected ≥ ${MIN_WRITE_ROUTES}). ` +
    'The scan almost certainly failed to parse server.js.',
  );
}

let declared: Exemption[];
try {
  const parsed = JSON.parse(readFileSync(EXEMPTIONS_FILE, 'utf8'));
  declared = parsed.exemptions;
  if (!Array.isArray(declared)) throw new Error('`exemptions` must be an array');
} catch (err) {
  fail(`exemption declaration unreadable: ${(err as Error).message}`);
}

if (LIST) {
  for (const r of routes) {
    console.log(`${r.authenticated ? 'AUTH  ' : 'PUBLIC'}  ${r.method.padEnd(6)} ${r.route}  (server.js:${r.line})  [${r.middleware.join(', ')}]`);
  }
  for (const m of routerMounts) {
    console.log(`MOUNT   ${m.authenticated ? 'AUTH  ' : 'PUBLIC'} ${m.prefix}  (server.js:${m.line})  [${m.middleware.join(', ')}]`);
  }
}

const { undeclared, stale, obsolete, unjustified, authenticated } = reconcileExemptions(routes, declared);

let failed = false;

if (undeclared.length > 0) {
  failed = true;
  console.error(
    `[write-route-auth] ❌ ${undeclared.length} MUTATING route(s) mounted outside the auth chain ` +
    'with no declared exemption (C08 §1.2):\n',
  );
  for (const r of undeclared) {
    console.error(`  ${r.method} ${r.route}  server.js:${r.line}  [${r.middleware.join(', ') || 'no middleware'}]`);
  }
  console.error(
    '\nFix: add `authMiddleware` to the registration and have the handler reject ' +
    '`req.auth.userId === "anonymous"` (401), gating any project-scoped write behind ' +
    '`_httpRequireAccess` — the shape `server/eventLog.js` uses.\n' +
    'If the route is genuinely safe without a session, declare it in ' +
    'tools/ga-gate/write-route-auth-exemptions.json with a rationale explaining what ' +
    'prevents anonymous abuse. Do NOT declare a route exempt merely because it is currently unprotected.',
  );
}

if (stale.length > 0) {
  failed = true;
  console.error(`\n[write-route-auth] ❌ ${stale.length} declared exemption(s) no longer exist in server.js:`);
  for (const e of stale) console.error(`  ${e.method} ${e.route}`);
  console.error('  Remove them — a list that outlives its routes is how the previous audit matrix became fiction.');
}

if (obsolete.length > 0) {
  failed = true;
  console.error(`\n[write-route-auth] ❌ ${obsolete.length} declared exemption(s) are now AUTHENTICATED — remove the entry:`);
  for (const e of obsolete) console.error(`  ${e.method} ${e.route}`);
}

if (unjustified.length > 0) {
  failed = true;
  console.error(`\n[write-route-auth] ❌ ${unjustified.length} exemption(s) have no rationale:`);
  for (const e of unjustified) console.error(`  ${e.method} ${e.route}`);
}

if (failed) process.exit(1);

console.log(
  `[write-route-auth] ✅ ${routes.length} mutating route(s) scanned in server.js: ` +
  `${authenticated.length} behind authMiddleware, ${declared.length} declared-exempt with a rationale. ` +
  `${routerMounts.length} router mount(s) seen.`,
);
process.exit(0);
