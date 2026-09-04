#!/usr/bin/env node
/**
 * tools/perf/render/run-render-local.mjs — LANE PERF round 4 (2026-09-04)
 *
 * Boots the LOCAL PRODUCTION target and runs the AXIS R render profile against
 * it. Server-boot recipe is deliberately the SAME one lane BASE-OUTER proved
 * out in tools/perf/outer/run-outer-local.mjs — read that file's header for the
 * field-by-field rationale (clean env, no .env, no founder secret, no
 * production DATABASE_URL, in-memory store, prod static path).
 *
 * The two admissibility gates are re-asserted here rather than inherited,
 * because a runner that silently measures a dev server produces numbers that
 * look fine and are fiction:
 *   1. `dist/index.html` must exist (else `server.js` mounts Vite middleware).
 *   2. The served shell must NOT contain `/@vite/client`.
 *
 * Reproduce:
 *   node --max-old-space-size=6144 node_modules/vite/bin/vite.js build   # once
 *   node tools/perf/render/run-render-local.mjs
 * Options:
 *   PERF_PORT (default 5312) · PERF_ROOMS (default 250 → 1000 walls)
 *   PERF_KEEP_SERVER=1 · PERF_OUT
 */
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const require = createRequire(resolve(repoRoot, 'package.json'));

const PORT = parseInt(process.env.PERF_PORT ?? '5312', 10);
const BASE = `http://localhost:${PORT}`;

// ── 0. BRING-YOUR-OWN-SERVER escape hatch ────────────────────────────────────
//
// ⚠ §PERF-HARNESS-SPAWN-HANGS (measured 2026-09-04, lane PERF r4). On this box
// `child_process.spawn(node, [tsx, 'server.js'])` produces ZERO output and never
// binds the port — with the allowlisted env, with the full inherited env, with
// piped stdio and with `stdio: 'inherit'` alike, so it is neither an env gap nor
// a pipe artefact. The IDENTICAL command run straight from a shell boots in
// ~15 s and answers `/api/health` with 200. Something about being a grandchild
// of the agent shell stops it. Root cause is NOT in this lane's ownership and
// the measurement must not wait on it, so: if the caller has already booted a
// production target and exported PERF_LOCAL_URL + PERF_TOKEN, this runner
// SKIPS the boot entirely and just drives Playwright.
//
//   PORT=5390 SESSION_SECRET=<s> NODE_ENV=production PRYZM_FORCE_INMEMORY=1 \
//   SUPABASE_DB_URL=postgresql://never-dialed.invalid:5432/ignored \
//     node node_modules/tsx/dist/cli.mjs server.js &
//   # mint a JWT with <s> whose email passes server/betaAccessAllowlist.js
//   PERF_LOCAL_URL=http://localhost:5390 PERF_TOKEN=<jwt> \
//     node tools/perf/render/run-render-local.mjs
//
// The two admissibility gates below still run against whatever target is given,
// because a borrowed server is exactly as capable of being a dev server.
if (process.env.PERF_LOCAL_URL && process.env.PERF_TOKEN) {
  const ext = process.env.PERF_LOCAL_URL;
  console.log(`[run-render-local] PERF_LOCAL_URL + PERF_TOKEN supplied — using the caller's target ${ext}, skipping boot.`);
  const health = await fetch(`${ext}/api/health`).catch(() => null);
  if (!health || !health.ok) { console.error(`REFUSED: ${ext}/api/health did not answer 200.`); process.exit(1); }
  const shellHtml = await (await fetch(`${ext}/`)).text();
  if (shellHtml.includes('/@vite/client')) {
    console.error('REFUSED: that target serves the Vite DEV client — timings would be inadmissible.');
    process.exit(1);
  }
  console.log('[run-render-local] borrowed target is healthy and on the PROD static path.');
  const child = spawn(process.execPath, [
    resolve(repoRoot, 'node_modules', '@playwright', 'test', 'cli.js'),
    'test', '--config', resolve(here, 'playwright.render.config.ts'),
  ], { cwd: repoRoot, env: { ...process.env, PERF_ROOMS: process.env.PERF_ROOMS ?? '250' }, stdio: 'inherit' });
  process.exit(await new Promise(res => child.on('close', res)) === 0 ? 0 : 1);
}

// ── 1. dist/ admissibility gate ──────────────────────────────────────────────
const distIndex = resolve(repoRoot, 'dist', 'index.html');
if (!existsSync(distIndex)) {
  console.error('REFUSED: dist/index.html missing — build first (vite build). Dev-mode timings are inadmissible.');
  process.exit(1);
}
const distAgeH = (Date.now() - statSync(distIndex).mtimeMs) / 3.6e6;
console.log(`[run-render-local] dist/index.html age: ${distAgeH.toFixed(2)}h — RECORD THIS beside any number you quote.`);

// ── 2. secret-free production server ─────────────────────────────────────────
//
// ⚠ §PERF-HARNESS-ALLOWLIST-ENV-HANGS (measured 2026-09-04, lane PERF r4).
// `tools/perf/outer/run-outer-local.mjs` builds the child env as a 10-key
// ALLOWLIST (PATH, SystemRoot, TEMP, TMP, APPDATA, LOCALAPPDATA, USERPROFILE,
// COMSPEC, PATHEXT, windir) plus the five overrides. On this box, TODAY, that
// child HANGS: `tsx server.js` under that env produces ZERO bytes on stdout and
// stderr — verified with `stdio: 'inherit'`, so it is not a pipe artefact —
// never binds the port, and never exits. The health loop therefore times out
// after 120 s and reports `server never became healthy. Last log:` with an EMPTY
// log, which reads like a server crash and is not one.
//   • `node -e` under that same env: fine.
//   • `tsx -e` under that same env: fine.
//   • the SAME command with the shell env inherited: boots in ~15 s and serves.
// So the hang is server.js (or one of its transitive imports) blocking on
// something the allowlist drops. The allowlist is the defect, not the server.
//
// The fix inverts the policy: take the real environment and DENY the
// secret-bearing keys by pattern. That is strictly stronger hygiene than the
// allowlist claimed to provide — the allowlist protected only against the keys
// its author thought of, whereas this refuses anything whose NAME looks like a
// credential, and the deny list is printed at run time so the reader can audit
// what was actually withheld. No `.env` is loaded either way: `server.js` reads
// one only under `npm run dev`, and this invokes `tsx` directly.
const DENY = /SECRET|PASSWORD|PASSWD|_KEY$|^.*_API_KEY|APIKEY|TOKEN|CREDENTIAL|DATABASE_URL|SUPABASE|STRIPE|ANTHROPIC|OPENAI|CF_WORKER|RESEND|SENDGRID|OAUTH|CLIENT_ID|CLIENT_SECRET|PRYZM_OWNER|GITHUB_|GH_|AWS_|R2_|FLY_|SESSION/i;
const SESSION_SECRET = `perf-render-local-${Math.random().toString(36).slice(2)}`;
const withheld = [];
const serverEnv = {};
for (const [k, v] of Object.entries(process.env)) {
  if (DENY.test(k)) { withheld.push(k); continue; }
  serverEnv[k] = v;
}
Object.assign(serverEnv, {
  PORT: String(PORT),
  SESSION_SECRET,
  NODE_ENV: 'production',
  // server.js:291-299 refuses to boot in prod without a DB env var.
  // PRYZM_FORCE_INMEMORY=1 (server/pgClient.js §CONN-DEV) short-circuits
  // resolveConnectionString() BEFORE the URL is read, so the placeholder below
  // is never dialed — it exists solely to satisfy the presence check.
  PRYZM_FORCE_INMEMORY: '1',
  SUPABASE_DB_URL: 'postgresql://never-dialed-placeholder.invalid:5432/ignored',
  // Never let a real .env path or a dev lifecycle name leak the prod/dev branch.
  npm_lifecycle_event: 'perf',
});
console.log(`[run-render-local] withheld ${withheld.length} secret-shaped env key(s): ${withheld.sort().join(', ') || '(none present)'}`);
console.log(`[run-render-local] starting tsx server.js on :${PORT} (clean env, in-memory stores)…`);
const tsxCli = resolve(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const server = spawn(process.execPath, [tsxCli, 'server.js'], { cwd: repoRoot, env: serverEnv, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', d => { serverLog += d; });
server.stderr.on('data', d => { serverLog += d; });
const killServer = () => { try { server.kill(); } catch { /* already dead */ } };
process.on('exit', () => { if (process.env.PERF_KEEP_SERVER !== '1') killServer(); });

let healthy = false;
for (let i = 0; i < 120; i++) {
  try { const r = await fetch(`${BASE}/api/health`); if (r.ok) { healthy = true; break; } } catch { /* not up yet */ }
  await new Promise(r => setTimeout(r, 1000));
}
if (!healthy) {
  console.error('server never became healthy. Last log:\n' + serverLog.slice(-3000));
  process.exit(1);
}
console.log('[run-render-local] server healthy.');
const shell = await (await fetch(`${BASE}/`)).text();
if (shell.includes('/@vite/client')) {
  console.error('REFUSED: server is serving the Vite DEV client — timings would be inadmissible.');
  process.exit(1);
}
console.log('[run-render-local] prod static path confirmed (no /@vite/client in the shell).');

// ── 3. session token (local-only secret, local-only token) ───────────────────
const jwt = require('jsonwebtoken');
const TOKEN = jwt.sign({ sub: 'user-perf-render', email: 'antoniocanerosan@gmail.com' }, SESSION_SECRET, { expiresIn: '3h' });
const me = await fetch(`${BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${TOKEN}` } });
if (me.status !== 200) {
  console.error(`token sanity check failed: /api/auth/me → HTTP ${me.status}`);
  process.exit(1);
}
console.log('[run-render-local] token accepted by /api/auth/me.');

// ── 4. run axis R ────────────────────────────────────────────────────────────
const pw = spawn(process.execPath, [
  resolve(repoRoot, 'node_modules', '@playwright', 'test', 'cli.js'),
  'test', '--config', resolve(here, 'playwright.render.config.ts'),
], {
  cwd: repoRoot,
  env: {
    ...process.env,
    PERF_LOCAL_URL: BASE,
    PERF_TOKEN: TOKEN,
    PERF_ROOMS: process.env.PERF_ROOMS ?? '250',
  },
  stdio: 'inherit',
});
const rc = await new Promise(res => pw.on('close', res));

if (process.env.PERF_KEEP_SERVER === '1') {
  console.log(`[run-render-local] PERF_KEEP_SERVER=1 — server left on :${PORT}.\nPERF_TOKEN=${TOKEN}`);
} else {
  killServer();
}
process.exit(rc === 0 ? 0 : 1);
